import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isNativePlatform } from '../lib/capacitorSetup';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAdminStatus: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
    window.history.replaceState({}, '', window.location.pathname);
  };

  const checkTerminationStatus = async (userId: string): Promise<boolean> => {
    const { data } = await supabase
      .from('user_terminations')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    return !!data;
  };

  const fetchAdminStatus = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setIsAdmin(data.is_admin || false);
    } else {
      setIsAdmin(false);
    }
  };

  const refreshAdminStatus = async () => {
    if (user) {
      await fetchAdminStatus(user.id);
    }
  };

  useEffect(() => {
    // Give more time when a PKCE code exchange is in progress (password recovery, OAuth, etc.)
    const hasCodeInUrl = new URLSearchParams(window.location.search).has('code');
    const SESSION_TIMEOUT_MS = hasCodeInUrl ? 15000 : 3000;

    let settled = false;

    const hardTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setUser(null);
        setLoading(false);
      }
    }, SESSION_TIMEOUT_MS);

    const sessionTimeout = new Promise<{ data: { session: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { session: null } }), SESSION_TIMEOUT_MS)
    );

    Promise.race([supabase.auth.getSession(), sessionTimeout])
      .then(async ({ data: { session } }) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        if (session?.user) {
          const isTerminated = await checkTerminationStatus(session.user.id);
          if (isTerminated) {
            await supabase.auth.signOut();
            setUser(null);
            setIsAdmin(false);
          } else {
            setUser(session.user);
            await fetchAdminStatus(session.user.id);
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        setUser(null);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'PASSWORD_RECOVERY') {
          setUser(session?.user ?? null);
          setIsPasswordRecovery(true);
          setLoading(false);
          return;
        }
        if (session?.user) {
          const isTerminated = await checkTerminationStatus(session.user.id);
          if (isTerminated) {
            await supabase.auth.signOut();
            setUser(null);
            setIsAdmin(false);
          } else {
            setUser(session.user);
            await fetchAdminStatus(session.user.id);
          }
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.user) {
      const isTerminated = await checkTerminationStatus(data.user.id);
      if (isTerminated) {
        await supabase.auth.signOut();
        throw new Error('Access denied. Please contact support if you believe this is an error.');
      }
    }
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.history.replaceState({}, '', window.location.pathname);
  };

  const resetPassword = async (email: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const redirectTo = isNativePlatform()
      ? `${supabaseUrl}/auth/v1/callback?redirect_to=quickstack://reset-password`
      : `${window.location.origin}/`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  };

  const deleteAccount = async () => {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      method: 'POST',
    });

    if (error) {
      throw new Error(error.message || 'Failed to delete account');
    }

    if (data && !data.success) {
      throw new Error(data.error || 'Failed to delete account');
    }

    await supabase.auth.signOut();
    window.history.replaceState({}, '', window.location.pathname);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isPasswordRecovery, clearPasswordRecovery, signIn, signUp, signOut, refreshAdminStatus, resetPassword, updatePassword, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

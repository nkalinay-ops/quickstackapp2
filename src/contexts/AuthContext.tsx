import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type UserTier = 'free' | 'paid' | 'admin';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  userTier: UserTier;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshAdminStatus: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userTier, setUserTier] = useState<UserTier>('free');
  // Ref (not state) so the onAuthStateChange closure always reads the current value.
  // Without this guard, email confirmation in another tab fires SIGNED_IN and auto-logs in the user.
  const expectingSignIn = useRef(false);

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
      .select('is_admin, user_tier')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setIsAdmin(data.is_admin || false);
      setUserTier((data.user_tier as UserTier) || 'free');
    } else {
      setIsAdmin(false);
      setUserTier('free');
    }
  };

  const refreshAdminStatus = async () => {
    if (user) {
      await fetchAdminStatus(user.id);
    }
  };

  useEffect(() => {
    // If this is a password-reset callback, skip auth init entirely.
    // The Supabase client will auto-exchange the code and emit PASSWORD_RECOVERY,
    // which ResetPassword.tsx handles directly.
    // Email confirmation callbacks also have ?code= but with type != 'recovery' —
    // those must NOT skip auth init so the SIGNED_IN event fires normally.
    const params = new URLSearchParams(window.location.search);
    const isResetFlow =
      (params.has('code') && params.get('type') === 'recovery') ||
      params.get('page') === 'reset-password';
    if (isResetFlow) {
      setLoading(false);
      return;
    }

    let settled = false;

    const hardTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setUser(null);
        setLoading(false);
      }
    }, 3000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          if (!settled) {
            settled = true;
            clearTimeout(hardTimeout);
          }

          if (session?.user) {
            // A SIGNED_IN event that wasn't triggered by an explicit signIn() call
            // means Supabase auto-created a session (e.g. email confirmation link clicked
            // in another tab). Sign out immediately to prevent auto-login.
            if (event === 'SIGNED_IN' && !expectingSignIn.current) {
              await supabase.auth.signOut();
              setUser(null);
              setIsAdmin(false);
              setUserTier('free');
              setLoading(false);
              return;
            }
            const isTerminated = await checkTerminationStatus(session.user.id);
            if (isTerminated) {
              await supabase.auth.signOut();
              setUser(null);
              setIsAdmin(false);
            } else {
              await fetchAdminStatus(session.user.id);
              setUser(session.user);
            }
          } else {
            setUser(null);
            setIsAdmin(false);
            setUserTier('free');
          }
          setLoading(false);
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(hardTimeout);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    expectingSignIn.current = true;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      expectingSignIn.current = false;
      throw error;
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (data.user) {
      // Block unconfirmed users — Supabase may issue a session before confirmation
      // depending on project settings. We enforce the requirement explicitly.
      if (!data.user.email_confirmed_at) {
        expectingSignIn.current = false;
        await supabase.auth.signOut();
        throw new Error('Please confirm your email address before signing in. Check your inbox for the confirmation link.');
      }

      const terminationData = await supabase
        .from('user_terminations')
        .select('user_id')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (terminationData.data) {
        expectingSignIn.current = false;
        await supabase.auth.signOut();
        throw new Error('Access denied. Please contact support if you believe this is an error.');
      }

    }
    expectingSignIn.current = false;
  };

  const signUp = async (email: string, password: string) => {
    const emailRedirectTo =
      import.meta.env.VITE_EMAIL_CONFIRM_REDIRECT_URL ||
      `${window.location.origin}/?page=email-confirmed`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    if (error) throw error;
    // Supabase returns a session immediately only when email confirmation is disabled.
    // When confirmation is required, session is null and the user must verify first.
    return { needsEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.history.replaceState({}, '', window.location.pathname);
  };

  const resetPassword = async (email: string) => {
    const redirectTo =
      import.meta.env.VITE_PASSWORD_RESET_REDIRECT_URL ||
      `${window.location.origin}/?page=reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  };

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    if (!user?.email) throw new Error('No authenticated user');
    // Re-authenticate with the current password to verify it before allowing the change.
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (reAuthError) throw new Error('Current password is incorrect');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
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
    <AuthContext.Provider value={{ user, loading, isAdmin, userTier, signIn, signUp, signOut, refreshAdminStatus, resetPassword, updatePassword, deleteAccount }}>
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

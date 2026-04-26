import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Capacitor } from '@capacitor/core';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
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
    // If this is a password-reset callback (?code= or ?page=reset-password),
    // skip auth init entirely. The Supabase client will auto-exchange the code
    // and emit PASSWORD_RECOVERY, which ResetPassword.tsx handles directly.
    const params = new URLSearchParams(window.location.search);
    const isResetFlow = params.has('code') || params.get('page') === 'reset-password';
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    console.log('Login successful');

    const { data: { session } } = await supabase.auth.getSession();
    console.log('Session after login:', session);

    if (data.user) {
      const terminationData = await supabase
        .from('user_terminations')
        .select('user_id')
        .eq('user_id', data.user.id)
        .maybeSingle();
      console.log('Termination check result:', terminationData.data);

      if (terminationData.data) {
        await supabase.auth.signOut();
        throw new Error('Access denied. Please contact support if you believe this is an error.');
      }

      if (session) {
        await fetchAdminStatus(data.user.id);
        setUser(data.user);
        console.log('Navigating to dashboard');
        window.dispatchEvent(new CustomEvent('navigate', { detail: 'dashboard' }));
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
    const platform = Capacitor.getPlatform();
    const isNative = platform === 'android' || platform === 'ios';
    console.log('Capacitor native?', Capacitor.isNativePlatform());
    console.log('Capacitor platform:', platform);
    const redirectTo = isNative
      ? 'quickstack://reset-password'
      : `${window.location.origin}/?page=reset-password`;
    console.log('Password reset redirectTo:', redirectTo);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
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
    <AuthContext.Provider value={{ user, loading, isAdmin, signIn, signUp, signOut, refreshAdminStatus, resetPassword, updatePassword, deleteAccount }}>
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

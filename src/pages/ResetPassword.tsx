import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PasswordStrength, validatePassword } from '../components/PasswordStrength';
import { CheckCircle, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [verifyingSession, setVerifyingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const { updatePassword } = useAuth();

  useEffect(() => {
    let mounted = true;

    // Check for error params (e.g. expired link redirected back with ?error=...)
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const errorDescription = params.get('error_description');
    if (errorParam) {
      setError(errorDescription?.includes('expired') || errorDescription?.includes('invalid')
        ? 'This password reset link has expired or is invalid. Please request a new one.'
        : errorDescription || 'An error occurred. Please try again.');
      setVerifyingSession(false);
      setHasValidSession(false);
      return;
    }

    // With PKCE + detectSessionInUrl:true, the Supabase client auto-exchanges the ?code=
    // param during initialization and fires SIGNED_IN via onAuthStateChange.
    // We just need to listen for that event (or check if a session already exists).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        window.history.replaceState({}, '', window.location.pathname + '?page=reset-password');
        setHasValidSession(true);
        setVerifyingSession(false);
      }
    });

    // Also check if the session was already established before our listener registered
    // (can happen if Supabase processed the code very quickly)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        window.history.replaceState({}, '', window.location.pathname + '?page=reset-password');
        setHasValidSession(true);
        setVerifyingSession(false);
      }
    });

    // Timeout fallback — if nothing fires after 10s, show an error
    const timeoutId = setTimeout(() => {
      if (mounted && verifyingSession) {
        setError('This password reset link has expired or is invalid. Please request a new one.');
        setVerifyingSession(false);
        setHasValidSession(false);
      }
    }, 10000);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.error || 'Password does not meet requirements');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await updatePassword(newPassword);
      setSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('navigate', { detail: 'dashboard' }));
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (verifyingSession) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-900 rounded-full mb-4 animate-pulse">
              <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Verifying your link...</h1>
            <p className="text-gray-400 mb-6">
              Please wait while we verify your password reset link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasValidSession && error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-900 rounded-full mb-4">
              <AlertCircle className="text-red-400" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Invalid or Expired Link</h1>
            <p className="text-gray-400 mb-6">{error}</p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'forgot-password' }))}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Request New Password Reset
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-900 rounded-full mb-4">
              <CheckCircle className="text-green-400" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Password updated</h1>
            <p className="text-gray-400 mb-6">
              Your password has been successfully updated. You'll be redirected to your dashboard shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center flex flex-col items-center">
          <img
            src="/ChatGPT_Image_Mar_18,_2026,_09_08_29_PM copy.png"
            alt="QuickStack"
            className="w-64 h-auto mb-1"
          />
          <h2 className="text-2xl font-bold text-white mb-2">Set new password</h2>
          <p className="text-gray-400">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-gray-900 p-6 rounded-lg">
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                placeholder="••••••••"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 focus:outline-none z-10 cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <PasswordStrength password={newPassword} />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                placeholder="••••••••"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 focus:outline-none z-10 cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-950 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

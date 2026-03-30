import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { TestTube2, ArrowLeft, CheckCircle } from 'lucide-react';

export function TestPasswordReset() {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<'email' | 'password'>('email');

  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?page=test-password-reset`,
      });
      if (error) throw error;
      setStep('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('navigate', { detail: 'dashboard' }));
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'auth' }));
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-900 rounded-full mb-4">
              <CheckCircle className="text-green-400" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Password Updated!</h1>
            <p className="text-gray-400 mb-6">
              Your password has been successfully updated. Redirecting to dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-900 rounded-full mb-4">
              <TestTube2 className="text-blue-400" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Set New Password</h1>
            <p className="text-gray-400">Click the link in your email, then come back here</p>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-4 bg-gray-900 p-6 rounded-lg">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-4">
              <p className="text-yellow-400 text-sm">
                <strong>Instructions:</strong>
                <br />
                1. Check your email for the reset link
                <br />
                2. Click the link (it will redirect here)
                <br />
                3. Enter your new password below
              </p>
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter new password"
                disabled={loading}
              />
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

            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full text-gray-400 hover:text-white transition-colors text-sm flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} />
              Cancel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-900 rounded-full mb-4">
            <TestTube2 className="text-blue-400" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Test Password Reset</h1>
          <p className="text-gray-400">Test the password reset flow</p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
          <p className="text-blue-400 text-sm">
            This is a testing page. Enter your email to receive a password reset link.
          </p>
        </div>

        <form onSubmit={handleGenerateToken} className="space-y-4 bg-gray-900 p-6 rounded-lg">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="your@email.com"
              disabled={loading}
            />
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
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <button
            type="button"
            onClick={handleBackToLogin}
            className="w-full text-gray-400 hover:text-white transition-colors text-sm flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Sign In
          </button>
        </form>
      </div>
    </div>
  );
}

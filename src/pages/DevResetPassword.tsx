import { useState } from 'react';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function DevResetPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Generate the recovery link via edge function (no email sent)
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-recovery-link`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email, redirectTo: window.location.origin + '/' }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to generate recovery link');
        setLoading(false);
        return;
      }

      // Extract token_hash and type from the generated link
      // Link looks like: https://[project].supabase.co/auth/v1/verify?token=xxx&type=recovery&...
      const url = new URL(result.link);
      const tokenHash = url.searchParams.get('token');
      const type = url.searchParams.get('type') as 'recovery';

      if (!tokenHash || !type) {
        setError('Could not parse recovery link token');
        setLoading(false);
        return;
      }

      // Verify the OTP directly — no page reload, fires PASSWORD_RECOVERY event in-process
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (verifyError) {
        setError(verifyError.message);
        setLoading(false);
        return;
      }

      // onAuthStateChange in AuthContext will receive PASSWORD_RECOVERY and show ResetPassword
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-900/50 border border-amber-700/50 rounded-full mb-4">
            <FlaskConical className="text-amber-400" size={28} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Dev: Password Reset Tester</h2>
          <p className="text-gray-400 text-sm">Triggers the reset flow directly — no email sent</p>
        </div>

        <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg px-4 py-3 text-amber-300 text-sm">
          Development only. Generates a recovery token and verifies it in-process, skipping email entirely.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-gray-900 p-6 rounded-lg">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Account Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="user@example.com"
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
            className="w-full py-3 bg-amber-700 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Starting reset flow...' : 'Start Password Reset'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'auth' }))}
          className="w-full text-gray-400 hover:text-white transition-colors text-sm flex items-center justify-center gap-2"
        >
          <ArrowLeft size={16} />
          Back to Sign In
        </button>
      </div>
    </div>
  );
}

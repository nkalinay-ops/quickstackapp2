import { useState } from 'react';
import { ArrowLeft, FlaskConical, ExternalLink, Copy, Check } from 'lucide-react';

export function DevResetPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLink('');
    setLoading(true);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-recovery-link`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          email,
          redirectTo: window.location.origin + '/',
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to generate recovery link');
        return;
      }

      setLink(result.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate recovery link');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-900/50 border border-amber-700/50 rounded-full mb-4">
            <FlaskConical className="text-amber-400" size={28} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Dev: Password Reset Tester</h2>
          <p className="text-gray-400 text-sm">Generates a real recovery link without sending an email</p>
        </div>

        <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg px-4 py-3 text-amber-300 text-sm">
          This page is only visible in development builds. It uses the admin API to generate a recovery link directly — no email is sent.
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
            {loading ? 'Generating...' : 'Generate Recovery Link'}
          </button>
        </form>

        {link && (
          <div className="bg-gray-900 p-5 rounded-lg space-y-3">
            <p className="text-sm font-medium text-gray-300">Recovery link generated:</p>
            <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400 break-all font-mono leading-relaxed">
              {link}
            </div>
            <div className="flex gap-2">
              <a
                href={link}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <ExternalLink size={16} />
                Open Link (test the flow)
              </a>
              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Clicking "Open Link" simulates exactly what happens when a user clicks the link in their email.
            </p>
          </div>
        )}

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

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Key, Copy, CheckCircle2, Loader2 } from 'lucide-react';

interface BetaKey {
  id: string;
  key_code: string;
  expires_at: string;
  created_at: string;
  redeemed_at?: string;
  redeemed_by?: string;
  is_active: boolean;
  notes?: string;
}

export function BetaKeys() {
  const [keys, setKeys] = useState<BetaKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('beta_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setKeys(data || []);
    } catch (error) {
      console.error('Error loading beta keys:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const generateKeys = async () => {
    setGenerating(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-beta-key`;
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count,
          notes: notes.trim() || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate keys');
      }

      setNotes('');
      setCount(1);
      await loadKeys();
    } catch (error) {
      console.error('Error generating keys:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate keys');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (keyCode: string) => {
    navigator.clipboard.writeText(keyCode);
    setCopiedKey(keyCode);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Beta Keys</h1>
        <p className="text-gray-400">Generate and manage beta access keys</p>
      </div>

      <div className="bg-gray-900 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Key className="w-5 h-5" />
          Generate New Keys
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Number of Keys
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., For marketing team"
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={generateKeys}
          disabled={generating}
          className="w-full md:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Key className="w-4 h-4" />
              Generate {count > 1 ? `${count} Keys` : 'Key'}
            </>
          )}
        </button>
      </div>

      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">All Beta Keys</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            Loading keys...
          </div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No beta keys generated yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Key Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Redeemed
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {keys.map((key) => (
                  <tr key={key.id} className="hover:bg-gray-850">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <code className="text-sm text-blue-400 font-mono">
                          {key.key_code}
                        </code>
                        <button
                          onClick={() => copyToClipboard(key.key_code)}
                          className="text-gray-400 hover:text-white transition-colors"
                        >
                          {copiedKey === key.key_code ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {key.redeemed_at ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900 text-green-300">
                          Redeemed
                        </span>
                      ) : isExpired(key.expires_at) ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-900 text-red-300">
                          Expired
                        </span>
                      ) : key.is_active ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-900 text-blue-300">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                      {formatDate(key.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                      {formatDate(key.expires_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                      {key.redeemed_at ? formatDate(key.redeemed_at) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {key.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

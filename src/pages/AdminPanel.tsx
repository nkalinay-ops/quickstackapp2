import { useState, useEffect } from 'react';
import { Shield, Users, Key, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface UserTermination {
  user_id: string;
  terminated_at: string;
  terminated_by: string;
  reason: string | null;
}

interface UserProfile {
  id: string;
  email: string | null;
  is_beta_user: boolean;
  beta_key_redeemed: string | null;
  is_admin: boolean;
  admin_granted_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  termination: UserTermination | null;
}

interface BetaKey {
  id: string;
  key_code: string;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
  is_active: boolean;
  created_by: string | null;
  notes: string | null;
}

export function AdminPanel() {
  const { refreshAdminStatus } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [betaKeys, setBetaKeys] = useState<BetaKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'beta-keys'>('users');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      console.log('Session check:', {
        hasSession: !!session,
        sessionError: sessionError?.message,
        tokenLength: session?.access_token?.length,
      });

      if (!session) {
        setError('No active session');
        return;
      }

      console.log('Making request to edge function with token length:', session.access_token.length);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-users`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: 'list_users' }),
        }
      );

      const data = await response.json();
      console.log('Full response:', { status: response.status, data });

      if (!response.ok) {
        throw new Error(data.error || data.details || `Failed to load users: ${response.status}`);
      }

      setUsers(data.users || []);
    } catch (err) {
      console.error('Load users error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    }
  };

  const loadBetaKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('beta_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBetaKeys(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load beta keys');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadUsers(), loadBetaKeys()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const handlePromoteAdmin = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-users`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: 'promote_admin', userId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to promote user');
      }

      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote user');
    }
  };

  const handleRevokeAdmin = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-users`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: 'revoke_admin', userId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to revoke admin');
      }

      await loadUsers();
      await refreshAdminStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke admin');
    }
  };

  const handleTerminateUser = async (userId: string) => {
    const reason = prompt('Enter termination reason (optional):');
    if (reason === null) return;

    if (!confirm('Are you sure you want to terminate this user\'s access? This action cannot be undone.')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('No active session');
        return;
      }

      console.log('Terminating user:', userId, 'with reason:', reason);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-users`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: 'terminate_user', userId, reason }),
        }
      );

      const data = await response.json();
      console.log('Terminate response:', response.status, data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to terminate user');
      }

      setError(null);
      await loadUsers();
    } catch (err) {
      console.error('Terminate error:', err);
      setError(err instanceof Error ? err.message : 'Failed to terminate user');
    }
  };

  const handleGenerateBetaKey = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-beta-key`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate beta key');
      }

      await loadBetaKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate beta key');
    }
  };

  const stats = {
    totalUsers: users.length,
    betaUsers: users.filter(u => u.is_beta_user).length,
    adminUsers: users.filter(u => u.is_admin).length,
    activeBetaKeys: betaKeys.filter(k => k.is_active && !k.redeemed_at).length,
    terminatedUsers: users.filter(u => u.termination).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-blue-400" />
        <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-300 text-sm mt-2 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-400" />
            <div>
              <p className="text-gray-400 text-sm">Total Users</p>
              <p className="text-2xl font-bold text-white">{stats.totalUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3">
            <Key className="w-8 h-8 text-green-400" />
            <div>
              <p className="text-gray-400 text-sm">Beta Users</p>
              <p className="text-2xl font-bold text-white">{stats.betaUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-orange-400" />
            <div>
              <p className="text-gray-400 text-sm">Admins</p>
              <p className="text-2xl font-bold text-white">{stats.adminUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3">
            <Key className="w-8 h-8 text-yellow-400" />
            <div>
              <p className="text-gray-400 text-sm">Active Keys</p>
              <p className="text-2xl font-bold text-white">{stats.activeBetaKeys}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'users'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('beta-keys')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'beta-keys'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Beta Keys
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'users' && (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="bg-gray-900 rounded-lg border border-gray-700">
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
                    onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-1">
                          <p className="text-white font-medium">{user.email || 'No email'}</p>
                          <p className="text-gray-400 text-sm">
                            Joined {new Date(user.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {user.termination && (
                            <span className="px-3 py-1 bg-red-500/10 text-red-400 rounded-full text-sm border border-red-500/20">
                              Terminated
                            </span>
                          )}
                          {user.is_admin && (
                            <span className="px-3 py-1 bg-orange-500/10 text-orange-400 rounded-full text-sm border border-orange-500/20">
                              Admin
                            </span>
                          )}
                          {user.is_beta_user && (
                            <span className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm border border-green-500/20">
                              Beta
                            </span>
                          )}
                        </div>
                      </div>
                      {expandedUser === user.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-400 ml-4" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 ml-4" />
                      )}
                    </div>
                  </div>

                  {expandedUser === user.id && (
                    <div className="px-4 pb-4 border-t border-gray-700 pt-4">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-gray-400 text-sm">User ID</p>
                          <p className="text-white text-sm font-mono">{user.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">Last Sign In</p>
                          <p className="text-white text-sm">
                            {user.last_sign_in_at
                              ? new Date(user.last_sign_in_at).toLocaleString()
                              : 'Never'}
                          </p>
                        </div>
                        {user.beta_key_redeemed && (
                          <div>
                            <p className="text-gray-400 text-sm">Beta Key</p>
                            <p className="text-white text-sm font-mono">{user.beta_key_redeemed}</p>
                          </div>
                        )}
                        {user.admin_granted_at && (
                          <div>
                            <p className="text-gray-400 text-sm">Admin Since</p>
                            <p className="text-white text-sm">
                              {new Date(user.admin_granted_at).toLocaleString()}
                            </p>
                          </div>
                        )}
                        {user.termination && (
                          <>
                            <div>
                              <p className="text-gray-400 text-sm">Terminated At</p>
                              <p className="text-white text-sm">
                                {new Date(user.termination.terminated_at).toLocaleString()}
                              </p>
                            </div>
                            {user.termination.reason && (
                              <div className="col-span-2">
                                <p className="text-gray-400 text-sm">Termination Reason</p>
                                <p className="text-white text-sm">{user.termination.reason}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {!user.termination && (
                        <div className="flex gap-3">
                          {!user.is_admin ? (
                            <button
                              onClick={() => handlePromoteAdmin(user.id)}
                              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                            >
                              Promote to Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRevokeAdmin(user.id)}
                              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                            >
                              Revoke Admin
                            </button>
                          )}
                          <button
                            onClick={() => handleTerminateUser(user.id)}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                          >
                            <XCircle className="w-4 h-4" />
                            Terminate Access
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'beta-keys' && (
            <div className="space-y-4">
              <button
                onClick={handleGenerateBetaKey}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Generate New Beta Key
              </button>

              <div className="space-y-2">
                {betaKeys.map((key) => (
                  <div
                    key={key.id}
                    className="bg-gray-900 rounded-lg p-4 border border-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-white font-mono text-lg">{key.key_code}</p>
                        <div className="flex gap-4 mt-2 text-sm">
                          <p className="text-gray-400">
                            Created: {new Date(key.created_at).toLocaleString()}
                          </p>
                          <p className="text-gray-400">
                            Expires: {new Date(key.expires_at).toLocaleString()}
                          </p>
                        </div>
                        {key.notes && (
                          <p className="text-gray-400 text-sm mt-2">{key.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {key.redeemed_at ? (
                          <span className="px-3 py-1 bg-gray-500/10 text-gray-400 rounded-full text-sm border border-gray-500/20">
                            Redeemed
                          </span>
                        ) : key.is_active ? (
                          <span className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm border border-green-500/20">
                            Active
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-red-500/10 text-red-400 rounded-full text-sm border border-red-500/20">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

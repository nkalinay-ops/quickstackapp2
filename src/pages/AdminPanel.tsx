import { useState, useEffect } from 'react';
import { Shield, Users, Key, ChevronDown, ChevronUp, XCircle, Upload, Settings, AlertTriangle, Clock, RefreshCw, CheckCircle2, AlertCircle, SkipForward, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PromptModal } from '../components/PromptModal';
import { ConfirmModal } from '../components/ConfirmModal';

type ScanRenewalInterval = 'month' | 'day';

interface AppSetting {
  key: string;
  value: string;
  updated_at: string;
  updated_by: string | null;
}

interface UserTermination {
  user_id: string;
  terminated_at: string;
  terminated_by: string;
  reason: string | null;
}

type UserTier = 'free' | 'paid' | 'plus' | 'admin';

interface UserProfile {
  id: string;
  email: string | null;
  is_beta_user: boolean;
  beta_key_redeemed: string | null;
  is_admin: boolean;
  admin_granted_at: string | null;
  can_bulk_upload: boolean;
  bulk_upload_granted_at: string | null;
  user_tier: UserTier;
  monthly_scan_count: number;
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

interface SyncLogEntry {
  id: string;
  started_at: string;
  completed_at: string | null;
  trigger: 'primary' | 'retry' | 'manual';
  status: 'running' | 'success' | 'partial' | 'error' | 'skipped';
  lunar_rows_seen: number | null;
  lunar_rows_upserted: number | null;
  lunar_error: string | null;
  prh_rows_seen: number | null;
  prh_rows_upserted: number | null;
  prh_error: string | null;
  duration_ms: number | null;
}

export function AdminPanel() {
  const { refreshAdminStatus } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [betaKeys, setBetaKeys] = useState<BetaKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'beta-keys' | 'bulk-upload'>('users');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptModal, setPromptModal] = useState<{ isOpen: boolean; userId: string | null }>({ isOpen: false, userId: null });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; userId: string | null; reason: string }>({
    isOpen: false,
    userId: null,
    reason: '',
  });
  const [scanRenewalInterval, setScanRenewalInterval] = useState<ScanRenewalInterval>('month');
  const [scanRenewalSetting, setScanRenewalSetting] = useState<AppSetting | null>(null);
  const [savingInterval, setSavingInterval] = useState(false);
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [syncLogLoading, setSyncLogLoading] = useState(false);
  const [triggeringSync, setTriggeringSync] = useState(false);

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

  const loadAppSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('key', 'scan_renewal_interval')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setScanRenewalSetting(data as AppSetting);
        setScanRenewalInterval((data.value as ScanRenewalInterval) || 'month');
      }
    } catch (err) {
      console.error('Failed to load app settings:', err);
    }
  };

  const handleScanRenewalChange = async (newInterval: ScanRenewalInterval) => {
    setSavingInterval(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('app_settings')
        .update({ value: newInterval, updated_at: new Date().toISOString(), updated_by: currentUser?.id ?? null })
        .eq('key', 'scan_renewal_interval')
        .select()
        .maybeSingle();

      if (error) throw error;
      setScanRenewalInterval(newInterval);
      if (data) setScanRenewalSetting(data as AppSetting);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update scan renewal interval');
    } finally {
      setSavingInterval(false);
    }
  };

  const loadSyncLog = async () => {
    setSyncLogLoading(true);
    const { data } = await supabase
      .from('pull_list_sync_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);
    if (data) setSyncLog(data as SyncLogEntry[]);
    setSyncLogLoading(false);
  };

  const triggerManualSync = async () => {
    setTriggeringSync(true);
    // Sync Now button will be wired to the edge function in Phase 5.
    // For now, insert a placeholder log entry so the UI renders correctly.
    await supabase.from('pull_list_sync_log').insert({
      trigger: 'manual',
      status: 'error',
      lunar_error: 'Edge function not yet deployed',
      prh_error: 'Edge function not yet deployed',
    });
    await loadSyncLog();
    setTriggeringSync(false);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadUsers(), loadBetaKeys(), loadAppSettings(), loadSyncLog()]);
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

  const handleTerminateUser = async (userId: string, reason: string) => {
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

  const handleTerminateClick = (userId: string) => {
    setPromptModal({ isOpen: true, userId });
  };

  const handlePromptSubmit = (reason: string) => {
    if (promptModal.userId) {
      setConfirmModal({ isOpen: true, userId: promptModal.userId, reason });
    }
  };

  const handleConfirmTerminate = () => {
    if (confirmModal.userId) {
      handleTerminateUser(confirmModal.userId, confirmModal.reason);
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

  const handleToggleBulkUploadPermission = async (userId: string, grant: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-bulk-upload-permission`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ target_user_id: userId, grant }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update permission');
      }

      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission');
    }
  };

  const handleSetTier = async (userId: string, tier: 'free' | 'paid') => {
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
          body: JSON.stringify({ action: 'set_tier', userId, tier }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update tier');
      }

      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tier');
    }
  };

  const stats = {
    totalUsers: users.length,
    betaUsers: users.filter(u => u.is_beta_user).length,
    adminUsers: users.filter(u => u.is_admin).length,
    activeBetaKeys: betaKeys.filter(k => k.is_active && !k.redeemed_at).length,
    terminatedUsers: users.filter(u => u.termination).length,
    paidUsers: users.filter(u => u.user_tier === 'paid' || u.user_tier === 'plus').length,
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

      {/* System Settings */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-white">System Settings</h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Scan Renewal Interval
            </p>
            <p className="text-xs text-gray-500">
              Controls when free-user scan counts reset. Use Daily to test renewal logic.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleScanRenewalChange('month')}
              disabled={savingInterval}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                scanRenewalInterval === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => handleScanRenewalChange('day')}
              disabled={savingInterval}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                scanRenewalInterval === 'day'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
              }`}
            >
              Daily
            </button>
          </div>
        </div>

        {scanRenewalInterval === 'day' && (
          <div className="mt-4 flex items-start gap-2 bg-amber-950/60 border border-amber-700/50 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-amber-300 text-sm font-medium">Testing mode active</p>
              <p className="text-amber-400/80 text-xs mt-0.5">
                Free-user scan counts reset daily at midnight. Switch back to Monthly before going to production.
              </p>
            </div>
          </div>
        )}

        {scanRenewalSetting?.updated_at && (
          <p className="text-xs text-gray-600 mt-3">
            Last changed {new Date(scanRenewalSetting.updated_at).toLocaleString()}
          </p>
        )}
      </div>

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

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3">
            <Upload className="w-8 h-8 text-blue-400" />
            <div>
              <p className="text-gray-400 text-sm">Subscribers</p>
              <p className="text-2xl font-bold text-white">{stats.paidUsers}</p>
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
          <button
            onClick={() => setActiveTab('bulk-upload')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'bulk-upload'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Bulk Upload
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
                        <div className="flex gap-2 flex-wrap">
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
                          {!user.is_admin && user.user_tier === 'plus' && (
                            <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-sm border border-indigo-500/20">
                              Plus
                            </span>
                          )}
                          {!user.is_admin && user.user_tier === 'paid' && (
                            <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-sm border border-blue-500/20">
                              Paid
                            </span>
                          )}
                          {!user.is_admin && user.user_tier === 'free' && (
                            <span className="px-3 py-1 bg-gray-500/10 text-gray-400 rounded-full text-sm border border-gray-500/20">
                              Free
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
                        <div className="space-y-3">
                          {!user.is_admin && (
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-3">
                                <span className="text-gray-400 text-sm">Plan:</span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSetTier(user.id, 'free')}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                      user.user_tier === 'free'
                                        ? 'bg-gray-600 text-white'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                                    }`}
                                  >
                                    Free
                                  </button>
                                  <button
                                    onClick={() => handleSetTier(user.id, 'paid')}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                      user.user_tier === 'paid'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                                    }`}
                                  >
                                    Paid
                                  </button>
                                </div>
                                <span className="text-gray-600 text-xs">
                                  {user.user_tier === 'free'
                                    ? `${user.monthly_scan_count ?? 0}/20 scans this month`
                                    : 'Unlimited scans + bulk upload'}
                                </span>
                              </div>
                              <p className="text-xs text-amber-600/70">
                                Manual changes will be overwritten by the next RevenueCat webhook event.
                              </p>
                            </div>
                          )}
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
                              onClick={() => handleTerminateClick(user.id)}
                              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              <XCircle className="w-4 h-4" />
                              Terminate Access
                            </button>
                          </div>
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

          {activeTab === 'bulk-upload' && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Upload className="w-6 h-6 text-blue-400" />
                  <h2 className="text-xl font-semibold">Bulk Upload Permissions</h2>
                </div>
                <p className="text-gray-400 mb-4">
                  Grant users permission to upload multiple comics at once using spreadsheets.
                </p>
                <p className="text-sm text-gray-500">
                  {stats.bulkUploadUsers} user{stats.bulkUploadUsers !== 1 ? 's' : ''} currently have bulk upload access
                </p>
              </div>

              <div className="space-y-2">
                {users
                  .filter(u => !u.termination)
                  .map((user) => (
                    <div
                      key={user.id}
                      className="bg-gray-900 rounded-lg p-4 border border-gray-700"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-white font-medium">{user.email || 'No email'}</p>
                          <div className="flex gap-2 mt-1">
                            {user.is_beta_user && (
                              <span className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs border border-green-500/20">
                                Beta
                              </span>
                            )}
                            {user.is_admin && (
                              <span className="px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded text-xs border border-orange-500/20">
                                Admin
                              </span>
                            )}
                          </div>
                          {user.can_bulk_upload && user.bulk_upload_granted_at && (
                            <p className="text-xs text-gray-500 mt-1">
                              Granted: {new Date(user.bulk_upload_granted_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={user.can_bulk_upload}
                            onChange={(e) => handleToggleBulkUploadPermission(user.id, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pull List Sync Log */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <RefreshCw size={18} className="text-indigo-400" />
            <h2 className="font-semibold text-white">Pull List Sync Log</h2>
          </div>
          <button
            onClick={triggerManualSync}
            disabled={triggeringSync}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
          >
            {triggeringSync ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Sync Now
          </button>
        </div>

        <div className="p-4">
          {syncLogLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : syncLog.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No sync attempts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left pb-2 pr-4 font-medium">Started</th>
                    <th className="text-left pb-2 pr-4 font-medium">Trigger</th>
                    <th className="text-left pb-2 pr-4 font-medium">Status</th>
                    <th className="text-left pb-2 pr-4 font-medium">Lunar</th>
                    <th className="text-left pb-2 pr-4 font-medium">PRH</th>
                    <th className="text-left pb-2 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {syncLog.map(entry => (
                    <SyncLogRow key={entry.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <PromptModal
        isOpen={promptModal.isOpen}
        onClose={() => setPromptModal({ isOpen: false, userId: null })}
        onConfirm={handlePromptSubmit}
        title="Terminate User Access"
        message="Enter termination reason (optional):"
        placeholder="e.g., Violation of terms of service"
        confirmText="Next"
        cancelText="Cancel"
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, userId: null, reason: '' })}
        onConfirm={handleConfirmTerminate}
        title="Confirm Termination"
        message="Are you sure you want to terminate this user's access? This action cannot be undone."
        confirmText="Terminate Access"
        cancelText="Cancel"
        isDestructive={true}
      />
    </div>
  );
}

const STATUS_CONFIG = {
  running:  { icon: <Loader2 size={13} className="animate-spin text-blue-400" />,   label: 'Running',  className: 'text-blue-400' },
  success:  { icon: <CheckCircle2 size={13} className="text-green-400" />,          label: 'Success',  className: 'text-green-400' },
  partial:  { icon: <AlertTriangle size={13} className="text-yellow-400" />,         label: 'Partial',  className: 'text-yellow-400' },
  error:    { icon: <AlertCircle size={13} className="text-red-400" />,              label: 'Error',    className: 'text-red-400' },
  skipped:  { icon: <SkipForward size={13} className="text-gray-400" />,            label: 'Skipped',  className: 'text-gray-500' },
} as const;

function SyncLogRow({ entry }: { entry: SyncLogEntry }) {
  const config = STATUS_CONFIG[entry.status];
  const duration = entry.duration_ms != null
    ? entry.duration_ms >= 1000
      ? `${(entry.duration_ms / 1000).toFixed(1)}s`
      : `${entry.duration_ms}ms`
    : '—';

  const lunarCell = entry.lunar_error
    ? <span className="text-red-400" title={entry.lunar_error}>Error</span>
    : entry.lunar_rows_seen != null
    ? <span className="text-gray-300">{entry.lunar_rows_seen} → {entry.lunar_rows_upserted ?? 0}</span>
    : <span className="text-gray-600">—</span>;

  const prhCell = entry.prh_error
    ? <span className="text-red-400" title={entry.prh_error}>Error</span>
    : entry.prh_rows_seen != null
    ? <span className="text-gray-300">{entry.prh_rows_seen} → {entry.prh_rows_upserted ?? 0}</span>
    : <span className="text-gray-600">—</span>;

  return (
    <tr className="py-2">
      <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
        {new Date(entry.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </td>
      <td className="py-2 pr-4">
        <span className="capitalize text-gray-400">{entry.trigger}</span>
      </td>
      <td className="py-2 pr-4">
        <span className={`flex items-center gap-1 ${config.className}`}>
          {config.icon} {config.label}
        </span>
      </td>
      <td className="py-2 pr-4">{lunarCell}</td>
      <td className="py-2 pr-4">{prhCell}</td>
      <td className="py-2 text-gray-500">{duration}</td>
    </tr>
  );
}

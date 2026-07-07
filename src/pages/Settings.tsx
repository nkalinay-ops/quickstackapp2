import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { OcrCorrectionRule } from '../lib/supabase';
import { LogOut, User, Mail, Lock, Eye, EyeOff, Trash2, AlertTriangle, ExternalLink, Wand2, ChevronDown, ChevronUp, CreditCard, Zap } from 'lucide-react';
import { PasswordStrength, validatePassword } from '../components/PasswordStrength';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { openLegalLink, isNativePlatform } from '../lib/capacitorSetup';
import { App as CapacitorApp } from '@capacitor/app';
import { Purchases } from '@revenuecat/purchases-capacitor';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';

export function Settings() {
  const { user, userTier, signOut, updatePassword, deleteAccount, refreshAdminStatus, monthlyScanCount, scanLimit } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'signout' | 'delete' | null;
  }>({ isOpen: false, action: null });
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: 'error' | 'success' | 'info';
  }>({ isOpen: false, message: '' });

  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    CapacitorApp.getInfo().then(({ version }) => setAppVersion(version)).catch(() => {});
  }, []);

  // Subscription state
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState<string | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [packagePrices, setPackagePrices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    if (userTier === 'paid' || userTier === 'plus') {
      supabase
        .from('user_profiles')
        .select('subscription_expires_at')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setSubscriptionExpiresAt(data?.subscription_expires_at ?? null);
        });
    }
  }, [user, userTier]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    Purchases.getOfferings().then((offerings) => {
      const prices: Record<string, string> = {};
      offerings.current?.availablePackages.forEach((pkg: PurchasesPackage) => {
        if (pkg.product.priceString) prices[pkg.identifier] = pkg.product.priceString;
      });
      setPackagePrices(prices);
    }).catch(() => {});
  }, []);

  const formatPrice = (identifier: string): string => {
    const price = packagePrices[identifier];
    if (!price) return '';
    const period = identifier.includes('annual') || identifier.includes('yearly') ? '/yr' : '/mo';
    return ` · ${price}${period}`;
  };

  const handlePurchase = async (packageIdentifier: string) => {
    setPurchaseLoading(true);
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find((p: PurchasesPackage) => p.identifier === packageIdentifier);
      if (!pkg) throw new Error('Package not found');
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
      await supabase.functions.invoke('update-subscription', { body: { customerInfo } });
      await refreshAdminStatus();
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean };
      if (!err.userCancelled) {
        setAlertModal({ isOpen: true, title: 'Purchase Failed', message: 'Unable to complete purchase. Please try again.', type: 'error' });
      }
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoreLoading(true);
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      const { data } = await supabase.functions.invoke('update-subscription', { body: { customerInfo } });
      await refreshAdminStatus();
      if (data?.tier && data.tier !== 'free') {
        setAlertModal({ isOpen: true, title: 'Purchases Restored', message: 'Your subscription has been restored successfully.', type: 'success' });
      } else {
        setAlertModal({ isOpen: true, title: 'No Active Subscription', message: 'No active subscription was found for this account.', type: 'info' });
      }
    } catch {
      setAlertModal({ isOpen: true, title: 'Restore Failed', message: 'Unable to restore purchases. Please try again.', type: 'error' });
    } finally {
      setRestoreLoading(false);
    }
  };

  // Scan rules state
  const [scanRulesOpen, setScanRulesOpen] = useState(false);
  const [correctionRules, setCorrectionRules] = useState<OcrCorrectionRule[]>([]);
  const [pendingRules, setPendingRules] = useState<OcrCorrectionRule[]>([]);
  const [correctionThreshold, setCorrectionThreshold] = useState(3);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(false);

  useEffect(() => {
    if (!scanRulesOpen || !user) return;
    loadScanRulesData();
  }, [scanRulesOpen, user]);

  const loadScanRulesData = async () => {
    if (!user) return;
    setRulesLoading(true);
    const [rulesRes, prefsRes] = await Promise.all([
      supabase
        .from('ocr_correction_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('user_scan_preferences')
        .select('correction_threshold')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    if (rulesRes.data) {
      setCorrectionRules((rulesRes.data as OcrCorrectionRule[]).filter(r => r.is_confirmed));
      setPendingRules((rulesRes.data as OcrCorrectionRule[]).filter(r => !r.is_confirmed));
    }
    if (prefsRes.data) setCorrectionThreshold(prefsRes.data.correction_threshold);
    setRulesLoading(false);
  };

  const handleConfirmRule = async (rule: OcrCorrectionRule) => {
    await supabase
      .from('ocr_correction_rules')
      .update({ is_confirmed: true, dismissed_at: null, updated_at: new Date().toISOString() })
      .eq('id', rule.id);
    await loadScanRulesData();
  };

  const handleDeleteRule = async (rule: OcrCorrectionRule) => {
    await supabase.from('ocr_correction_rules').delete().eq('id', rule.id);
    await loadScanRulesData();
  };

  const getRuleFieldBadges = (rule: OcrCorrectionRule): string[] => {
    const fields: string[] = [];
    if (rule.ocr_series.trim().toLowerCase() !== rule.corrected_series.trim().toLowerCase()) fields.push('Series');
    if ((rule.ocr_story || '').trim().toLowerCase() !== (rule.corrected_story || '').trim().toLowerCase()) fields.push('Story');
    if ((rule.ocr_publisher || '').trim().toLowerCase() !== (rule.corrected_publisher || '').trim().toLowerCase()) fields.push('Publisher');
    return fields;
  };

  const buildRuleOcrLabel = (rule: OcrCorrectionRule): string => {
    let label = rule.ocr_series;
    if (rule.ocr_story) label += ` / ${rule.ocr_story}`;
    if (rule.ocr_publisher) label += ` · ${rule.ocr_publisher}`;
    return label;
  };

  const buildRuleCorrectedLabel = (rule: OcrCorrectionRule): string => {
    let label = rule.corrected_series;
    if (rule.corrected_story) label += ` / ${rule.corrected_story}`;
    if (rule.corrected_publisher) label += ` · ${rule.corrected_publisher}`;
    return label;
  };

  const handleSaveThreshold = async () => {
    if (!user) return;
    setThresholdSaving(true);
    await supabase
      .from('user_scan_preferences')
      .upsert({ user_id: user.id, correction_threshold: correctionThreshold, updated_at: new Date().toISOString() });
    setThresholdSaving(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to sign out', type: 'error' });
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await deleteAccount();
    } catch (error) {
      setDeleteLoading(false);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete account. Please try again.',
        type: 'error',
      });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      setPasswordError(passwordValidation.error || 'Password does not meet requirements');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from current password');
      return;
    }

    setPasswordLoading(true);

    try {
      await updatePassword(currentPassword, newPassword);
      setPasswordSuccess('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 5000);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">Settings</h1>
        <p className="text-gray-400">Manage your account</p>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User size={20} />
            Account Information
          </h2>
          <div className="flex items-start gap-3">
            <Mail size={18} className="text-gray-400 mt-0.5" />
            <div>
              <div className="text-sm text-gray-400">Email</div>
              <div className="text-white">{user?.email}</div>
            </div>
          </div>
        </div>

        {userTier !== 'admin' && (
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CreditCard size={20} />
              Subscription
            </h2>

            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-sm">Current plan</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                userTier === 'plus' ? 'bg-purple-900 text-purple-300' :
                userTier === 'paid' ? 'bg-blue-900 text-blue-300' :
                'bg-gray-800 text-gray-300'
              }`}>
                {userTier === 'plus' ? 'Plus' : userTier === 'paid' ? 'Paid' : 'Free'}
              </span>
            </div>

            {subscriptionExpiresAt && (userTier === 'paid' || userTier === 'plus') && (
              <p className="text-xs text-gray-500 text-right -mt-2 mb-4">
                Access through {new Date(subscriptionExpiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}

            {userTier === 'plus' && (
              <p className="text-sm text-gray-400 mb-4">Unlimited scans per month</p>
            )}

            {monthlyScanCount !== null && scanLimit !== null && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-400">Scans this month</span>
                  <span className="text-gray-300">{monthlyScanCount} / {scanLimit}</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      monthlyScanCount >= scanLimit ? 'bg-red-500' :
                      monthlyScanCount >= scanLimit * 0.8 ? 'bg-amber-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, (monthlyScanCount / scanLimit) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {isNativePlatform() && (
              <div className="space-y-2 mt-2">
                {userTier === 'free' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handlePurchase('collector_monthly')}
                      disabled={purchaseLoading}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Zap size={15} />
                      {purchaseLoading ? 'Processing...' : `Upgrade to Paid · 500 scans/month${formatPrice('collector_monthly')}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePurchase('pro_monthly')}
                      disabled={purchaseLoading}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Zap size={15} />
                      {purchaseLoading ? 'Processing...' : `Upgrade to Plus · Unlimited scans${formatPrice('pro_monthly')}`}
                    </button>
                  </>
                )}
                {userTier === 'paid' && (
                  <button
                    type="button"
                    onClick={() => handlePurchase('pro_monthly')}
                    disabled={purchaseLoading}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Zap size={15} />
                    {purchaseLoading ? 'Processing...' : `Upgrade to Plus · Unlimited scans${formatPrice('pro_monthly')}`}
                  </button>
                )}
                {(userTier === 'paid' || userTier === 'plus') && (
                  <button
                    type="button"
                    onClick={() => window.open(
                      `https://play.google.com/store/account/subscriptions?sku=${userTier === 'paid' ? 'quickstack_collector_monthly' : 'quickstack_pro_monthly'}&package=com.quickstackapp.quickstack`,
                      '_system'
                    )}
                    className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
                  >
                    Manage subscription
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={restoreLoading}
                  className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors disabled:opacity-50"
                >
                  {restoreLoading ? 'Restoring...' : 'Restore purchases'}
                </button>
              </div>
            )}

            {(userTier === 'paid' || userTier === 'plus') && !isNativePlatform() && (
              <p className="text-xs text-gray-500 mt-2">Manage your subscription through the Google Play Store.</p>
            )}
          </div>
        )}

        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lock size={20} />
            Security
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-300 mb-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                  placeholder="••••••••"
                  disabled={passwordLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 focus:outline-none z-10 cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                  placeholder="••••••••"
                  disabled={passwordLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 focus:outline-none z-10 cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <PasswordStrength password={newPassword} />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                Confirm New Password
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
                  disabled={passwordLoading}
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

            {passwordError && (
              <div className="text-red-400 text-sm bg-red-950 p-3 rounded-lg">
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="text-green-400 text-sm bg-green-950 p-3 rounded-lg">
                {passwordSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={passwordLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {passwordLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setScanRulesOpen(o => !o)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-800/50 transition-colors"
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Wand2 size={20} />
              Scan Correction Rules
            </h2>
            {scanRulesOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>

          {scanRulesOpen && (
            <div className="px-4 pb-4 space-y-5 border-t border-gray-800 pt-4">
              <p className="text-sm text-gray-400">
                QuickStack learns when you repeatedly correct OCR scan results and can apply those corrections automatically. Rules only activate once you confirm them.
              </p>

              {/* Threshold setting */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Suggestion threshold
                  <span className="ml-2 text-xs text-gray-500 font-normal">corrections before a rule is suggested</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={correctionThreshold}
                    onChange={e => setCorrectionThreshold(Math.min(10, Math.max(2, parseInt(e.target.value) || 2)))}
                    className="w-20 px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                  />
                  <button
                    type="button"
                    onClick={handleSaveThreshold}
                    disabled={thresholdSaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {thresholdSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              {rulesLoading ? (
                <p className="text-sm text-gray-500">Loading rules...</p>
              ) : (
                <>
                  {/* Active confirmed rules */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 mb-2">Active rules</h3>
                    {correctionRules.length === 0 ? (
                      <p className="text-sm text-gray-500 bg-gray-800/50 rounded-lg px-3 py-3">
                        No active rules yet. They appear here once you confirm a suggestion.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {correctionRules.map(rule => (
                          <div key={rule.id} className="bg-gray-800 rounded-lg px-3 py-2.5">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap gap-1 mb-1.5">
                                  {getRuleFieldBadges(rule).map(f => (
                                    <span key={f} className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{f}</span>
                                  ))}
                                </div>
                                <span className="text-sm text-gray-400">"{buildRuleOcrLabel(rule)}"</span>
                                <span className="text-gray-600 mx-2">&rarr;</span>
                                <span className="text-sm text-white font-medium">"{buildRuleCorrectedLabel(rule)}"</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteRule(rule)}
                                className="text-gray-500 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                                aria-label="Delete rule"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pending / unconfirmed patterns */}
                  {pendingRules.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-300 mb-2">
                        Pending patterns
                        <span className="ml-2 text-xs text-gray-500 font-normal">seen but not yet confirmed</span>
                      </h3>
                      <div className="space-y-2">
                        {pendingRules.map(rule => (
                          <div key={rule.id} className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap gap-1 mb-1.5">
                                  {getRuleFieldBadges(rule).map(f => (
                                    <span key={f} className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{f}</span>
                                  ))}
                                  <span className="text-xs text-gray-500 ml-1">{rule.occurrence_count}x</span>
                                </div>
                                <span className="text-sm text-gray-400">"{buildRuleOcrLabel(rule)}"</span>
                                <span className="text-gray-600 mx-2">&rarr;</span>
                                <span className="text-sm text-gray-200">"{buildRuleCorrectedLabel(rule)}"</span>
                              </div>
                              <div className="flex gap-2 shrink-0 mt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmRule(rule)}
                                  className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-2.5 py-1 rounded-md font-medium transition-colors"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRule(rule)}
                                  className="text-gray-500 hover:text-red-400 transition-colors"
                                  aria-label="Delete pattern"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h2 className="text-lg font-semibold mb-1">About QuickStack</h2>
          <p className="text-gray-400 text-sm mb-4">
            QuickStack is a mobile-first comic book collection tracker designed for speed and simplicity.
            Add comics to your collection in under 5 seconds.
          </p>
          {appVersion && <div className="text-xs text-gray-500 mb-4">Version {appVersion}</div>}
          <div className="border-t border-gray-800 pt-3 space-y-1">
            <button
              type="button"
              onClick={() => openLegalLink('privacy')}
              className="flex items-center justify-between w-full py-2 px-1 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800 group"
            >
              <span>Privacy Policy</span>
              <ExternalLink size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
            </button>
            <button
              type="button"
              onClick={() => openLegalLink('terms')}
              className="flex items-center justify-between w-full py-2 px-1 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800 group"
            >
              <span>Terms of Service</span>
              <ExternalLink size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
            </button>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 border border-red-900">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2 text-red-400">
            <AlertTriangle size={20} />
            Danger Zone
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Permanently delete your account and all associated data including your comic collection, wishlist, and images. This action cannot be undone.
          </p>
          <button
            onClick={() => setConfirmModal({ isOpen: true, action: 'delete' })}
            disabled={deleteLoading}
            className="w-full py-3 bg-transparent border border-red-700 hover:bg-red-950 text-red-400 hover:text-red-300 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Trash2 size={18} />
            {deleteLoading ? 'Deleting Account...' : 'Delete My Account'}
          </button>
        </div>

        <button
          onClick={() => setConfirmModal({ isOpen: true, action: 'signout' })}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={20} />
          Sign Out
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen && confirmModal.action === 'signout'}
        onClose={() => setConfirmModal({ isOpen: false, action: null })}
        onConfirm={handleSignOut}
        title="Sign Out"
        message="Are you sure you want to sign out of QuickStack?"
        confirmText="Sign Out"
        cancelText="Cancel"
        isDestructive={false}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen && confirmModal.action === 'delete'}
        onClose={() => setConfirmModal({ isOpen: false, action: null })}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message={`Are you sure you want to permanently delete your account? This will remove all your comics, wishlist items, and images. This cannot be undone.`}
        confirmText="Delete My Account"
        cancelText="Cancel"
        isDestructive={true}
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}

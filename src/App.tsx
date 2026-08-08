import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { initCapacitor } from './lib/capacitorSetup';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Collection } from './pages/Collection';
import { AddComic } from './pages/AddComic';
import { Wishlist } from './pages/Wishlist';
import { Settings } from './pages/Settings';
import { BetaKeys } from './pages/BetaKeys';
import { AdminPanel } from './pages/AdminPanel';
import { BulkUpload } from './pages/BulkUpload';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { EmailConfirmed } from './pages/EmailConfirmed';
import { Onboarding } from './components/Onboarding';
import { PullList } from './pages/PullList';

type LayoutPage = 'dashboard' | 'collection' | 'add' | 'wishlist' | 'pull-list' | 'settings' | 'beta-keys' | 'admin' | 'bulk-upload';
type Page = 'auth' | 'forgot-password' | 'reset-password' | 'email-confirmed' | LayoutPage;

function AppContent() {
  const { user, loading, isAdmin } = useAuth();

  const getInitialPage = (): Page => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('page') === 'reset-password') return 'reset-password';
    // Only treat ?code= as a reset link when Supabase also sets type=recovery.
    // Email confirmation callbacks also use ?code= but with type=signup or type=email.
    if (params.get('code') && params.get('type') === 'recovery') return 'reset-password';
    if (params.get('page') === 'forgot-password') return 'forgot-password';
    if (params.get('page') === 'email-confirmed') return 'email-confirmed';
    // Any remaining ?code= is an email confirmation — route to the confirmed page.
    if (params.get('code')) return 'email-confirmed';
    return 'dashboard';
  };

  const [currentPage, setCurrentPage] = useState<Page>(getInitialPage());
  const [preSelectComicId, setPreSelectComicId] = useState<string | null>(null);
  const [collectionInitialMode, setCollectionInitialMode] = useState<'all' | 'week' | null>(null);
  const [addPrefill, setAddPrefill] = useState<{ series?: string; issue_number?: string; publisher?: string; year?: number | null } | null>(null);
  const [wishlistSourceFilter, setWishlistSourceFilter] = useState<'all' | 'pulls' | 'saved' | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  // Captured before replaceState strips query params from the URL
  const [websiteMode] = useState(() => new URLSearchParams(window.location.search).get('source') === 'website');

  const navigateToComic = (comicId: string) => {
    setPreSelectComicId(comicId);
    setCollectionInitialMode(null);
    setCurrentPage('collection');
  };

  const navigateToCollection = (mode: 'all' | 'week') => {
    setCollectionInitialMode(mode);
    setPreSelectComicId(null);
    setCurrentPage('collection');
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isResetUrl = (params.has('code') && params.get('type') === 'recovery') || params.get('page') === 'reset-password';
    if (currentPage === 'reset-password' || currentPage === 'forgot-password' || currentPage === 'email-confirmed' || isResetUrl) return;

    if (!user) {
      setOnboardingComplete(null);
      window.history.replaceState({}, '', window.location.pathname);
      setCurrentPage('auth');
    } else if (currentPage === 'auth') {
      setCurrentPage('dashboard');
    }
  }, [user, currentPage]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('onboarding_completed_at')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setOnboardingComplete(!!data?.onboarding_completed_at);
      });
  }, [user]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;
      if (detail && typeof detail === 'object' && 'page' in detail) {
        setCurrentPage(detail.page as Page);
        if (detail.prefill) setAddPrefill(detail.prefill);
        if (detail.sourceFilter) setWishlistSourceFilter(detail.sourceFilter);
      } else {
        setCurrentPage(detail as Page);
      }
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  // These pages handle their own auth state — render outside the normal auth gate
  if (currentPage === 'reset-password') {
    return <ResetPassword />;
  }

  if (currentPage === 'forgot-password') {
    return <ForgotPassword />;
  }

  if (currentPage === 'email-confirmed') {
    return <EmailConfirmed />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Auth websiteMode={websiteMode} />;
  }

  if (onboardingComplete === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (onboardingComplete === false) {
    return (
      <Onboarding
        userId={user.id}
        onComplete={() => setOnboardingComplete(true)}
      />
    );
  }

  return (
    <Layout currentPage={currentPage as LayoutPage} onNavigate={(p) => setCurrentPage(p)}>
      {currentPage === 'dashboard' && <Dashboard onNavigate={(p) => setCurrentPage(p as Page)} onNavigateToComic={navigateToComic} onNavigateToCollection={navigateToCollection} />}
      {currentPage === 'collection' && <Collection initialComicId={preSelectComicId} onComicConsumed={() => setPreSelectComicId(null)} initialMode={collectionInitialMode} onModeConsumed={() => setCollectionInitialMode(null)} />}
      {currentPage === 'add' && <AddComic prefill={addPrefill} onPrefillConsumed={() => setAddPrefill(null)} />}
      {currentPage === 'wishlist' && <Wishlist initialSourceFilter={wishlistSourceFilter ?? undefined} onFilterConsumed={() => setWishlistSourceFilter(null)} />}
      {currentPage === 'pull-list' && <PullList />}
      {currentPage === 'settings' && <Settings />}
      {currentPage === 'beta-keys' && isAdmin && <BetaKeys />}
      {currentPage === 'admin' && isAdmin && <AdminPanel />}
      {currentPage === 'bulk-upload' && <BulkUpload />}
    </Layout>
  );
}

function App() {
  useEffect(() => {
    initCapacitor();
  }, []);

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

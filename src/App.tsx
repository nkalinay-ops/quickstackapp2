import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { initCapacitor } from './lib/capacitorSetup';
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
import { TestPasswordReset } from './pages/TestPasswordReset';

function AppContent() {
  const { user, loading } = useAuth();

  const getInitialPage = (): 'reset-password' | 'test-password-reset' | 'forgot-password' | 'dashboard' => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const code = params.get('code');
    if (page === 'reset-password' || code) return 'reset-password';
    if (page === 'test-password-reset') return 'test-password-reset';
    if (page === 'forgot-password') return 'forgot-password';
    return 'dashboard';
  };

  const [currentPage, setCurrentPage] = useState<'auth' | 'dashboard' | 'collection' | 'add' | 'wishlist' | 'settings' | 'beta-keys' | 'admin' | 'bulk-upload' | 'forgot-password' | 'reset-password' | 'test-password-reset'>(getInitialPage);

  // Stable ref so the [user] effect always reads the latest page without needing it as a dep
  const currentPageRef = useRef(currentPage);
  const setPage = (page: typeof currentPage) => {
    currentPageRef.current = page;
    setCurrentPage(page);
  };

  useEffect(() => {
    // Never override URL-driven auth flow pages regardless of auth state changes
    const authFlowPages = ['reset-password', 'forgot-password', 'test-password-reset'];
    if (authFlowPages.includes(currentPageRef.current)) return;

    if (!user) {
      window.history.replaceState({}, '', window.location.pathname);
      setPage('auth');
    } else {
      window.history.replaceState({}, '', window.location.pathname);
      setPage('dashboard');
    }
  }, [user]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent;
      setPage(customEvent.detail);
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (currentPage === 'forgot-password') {
    return <ForgotPassword />;
  }

  if (currentPage === 'reset-password') {
    return <ResetPassword />;
  }

  if (currentPage === 'test-password-reset') {
    return <TestPasswordReset />;
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <Layout currentPage={currentPage} onNavigate={setPage}>
      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'collection' && <Collection />}
      {currentPage === 'add' && <AddComic />}
      {currentPage === 'wishlist' && <Wishlist />}
      {currentPage === 'settings' && <Settings />}
      {currentPage === 'beta-keys' && <BetaKeys />}
      {currentPage === 'admin' && <AdminPanel />}
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

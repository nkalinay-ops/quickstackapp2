import { useState, useEffect } from 'react';
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
import { DevResetPassword } from './pages/DevResetPassword';

type LayoutPage = 'dashboard' | 'collection' | 'add' | 'wishlist' | 'settings' | 'beta-keys' | 'admin' | 'bulk-upload';
type Page = 'auth' | 'forgot-password' | 'dev-reset' | LayoutPage;

function AppContent() {
  const { user, loading, isPasswordRecovery } = useAuth();

  const getInitialPage = (): Page => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('page') === 'forgot-password') return 'forgot-password';
    return 'dashboard';
  };

  const [currentPage, setCurrentPage] = useState<Page>(getInitialPage());

  useEffect(() => {
    if (isPasswordRecovery) return;

    if (!user) {
      window.history.replaceState({}, '', window.location.pathname);
      setCurrentPage('auth');
    } else {
      window.history.replaceState({}, '', window.location.pathname);
      setCurrentPage('dashboard');
    }
  }, [user, isPasswordRecovery]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent;
      setCurrentPage(customEvent.detail as Page);
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

  if (isPasswordRecovery) {
    return <ResetPassword />;
  }

  if (currentPage === 'forgot-password') {
    return <ForgotPassword />;
  }

  if (currentPage === 'dev-reset' && import.meta.env.DEV) {
    return <DevResetPassword />;
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <Layout currentPage={currentPage as LayoutPage} onNavigate={(p) => setCurrentPage(p)}>
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

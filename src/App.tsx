import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Collection } from './pages/Collection';
import { AddComic } from './pages/AddComic';
import { Wishlist } from './pages/Wishlist';
import { Settings } from './pages/Settings';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { TestPasswordReset } from './pages/TestPasswordReset';

const BetaKeys = lazy(() => import('./pages/BetaKeys').then(m => ({ default: m.BetaKeys })));
const AdminPanel = lazy(() => import('./pages/AdminPanel').then(m => ({ default: m.AdminPanel })));
const BulkUpload = lazy(() => import('./pages/BulkUpload').then(m => ({ default: m.BulkUpload })));

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<'auth' | 'dashboard' | 'collection' | 'add' | 'wishlist' | 'settings' | 'beta-keys' | 'admin' | 'bulk-upload' | 'forgot-password' | 'reset-password' | 'test-password-reset'>('dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');

    // Check for password reset/forgot password pages first (regardless of auth state)
    if (page === 'reset-password') {
      setCurrentPage('reset-password');
      return;
    } else if (page === 'test-password-reset') {
      setCurrentPage('test-password-reset');
      return;
    } else if (page === 'forgot-password') {
      setCurrentPage('forgot-password');
      return;
    }

    // If user is logged out, show auth page
    if (!user) {
      window.history.replaceState({}, '', window.location.pathname);
      setCurrentPage('auth');
    } else {
      // User is logged in, go to dashboard
      window.history.replaceState({}, '', window.location.pathname);
      setCurrentPage('dashboard');
    }
  }, [user]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent;
      setCurrentPage(customEvent.detail);
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
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'collection' && <Collection />}
      {currentPage === 'add' && <AddComic />}
      {currentPage === 'wishlist' && <Wishlist />}
      {currentPage === 'settings' && <Settings />}
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
        {currentPage === 'beta-keys' && <BetaKeys />}
        {currentPage === 'admin' && <AdminPanel />}
        {currentPage === 'bulk-upload' && <BulkUpload />}
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

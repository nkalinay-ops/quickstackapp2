import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Collection } from './pages/Collection';
import { AddComic } from './pages/AddComic';
import { Wishlist } from './pages/Wishlist';
import { Settings } from './pages/Settings';
import { BetaKeys } from './pages/BetaKeys';
import { AdminPanel } from './pages/AdminPanel';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { TestPasswordReset } from './pages/TestPasswordReset';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<'auth' | 'dashboard' | 'collection' | 'add' | 'wishlist' | 'settings' | 'beta-keys' | 'admin' | 'forgot-password' | 'reset-password' | 'test-password-reset'>('dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');

    if (page === 'reset-password') {
      setCurrentPage('reset-password');
    } else if (page === 'test-password-reset') {
      setCurrentPage('test-password-reset');
    } else if (user) {
      setCurrentPage('dashboard');
    } else {
      setCurrentPage('auth');
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
      {currentPage === 'beta-keys' && <BetaKeys />}
      {currentPage === 'admin' && <AdminPanel />}
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

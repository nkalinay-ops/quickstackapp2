import { useAuth } from '../contexts/AuthContext';
import { LogOut, User, Mail } from 'lucide-react';

export function Settings() {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    if (!confirm('Sign out of QuickStack?')) return;
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Failed to sign out');
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
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Mail size={18} className="text-gray-400 mt-0.5" />
              <div>
                <div className="text-sm text-gray-400">Email</div>
                <div className="text-white">{user?.email}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User size={18} className="text-gray-400 mt-0.5" />
              <div>
                <div className="text-sm text-gray-400">User ID</div>
                <div className="text-white font-mono text-xs break-all">{user?.id}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">About QuickStack</h2>
          <p className="text-gray-400 text-sm mb-4">
            QuickStack is a mobile-first comic book collection tracker designed for speed and simplicity.
            Add comics to your collection in under 5 seconds.
          </p>
          <div className="text-xs text-gray-500">Version 1.0.0</div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={20} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

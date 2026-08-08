import { ReactNode } from 'react';
import { Home, Library, Plus, Heart, Settings, Shield, Upload, CalendarDays } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isNativePlatform } from '../lib/capacitorSetup';

type LayoutPage = 'dashboard' | 'collection' | 'add' | 'wishlist' | 'pull-list' | 'settings' | 'beta-keys' | 'admin' | 'bulk-upload';

type LayoutProps = {
  children: ReactNode;
  currentPage: LayoutPage;
  onNavigate: (page: LayoutPage) => void;
};

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { isAdmin, userTier } = useAuth();
  const canBulkUpload = userTier === 'paid' || userTier === 'admin';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-10 h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-end px-4">
        <button
          onClick={() => onNavigate('settings')}
          className={`p-1.5 rounded-md transition-colors ${
            currentPage === 'settings' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pt-12 pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800">
        <div className={`flex justify-around items-center h-16 max-w-2xl mx-auto ${(isAdmin || canBulkUpload) ? 'px-2' : ''}`}>
          <NavButton
            icon={<Home size={24} />}
            label="Dashboard"
            active={currentPage === 'dashboard'}
            onClick={() => onNavigate('dashboard')}
          />
          <NavButton
            icon={<Library size={24} />}
            label="Collection"
            active={currentPage === 'collection'}
            onClick={() => onNavigate('collection')}
          />
          <NavButton
            icon={<Plus size={28} />}
            label="Add"
            active={currentPage === 'add'}
            onClick={() => onNavigate('add')}
            primary
          />
          {canBulkUpload && !isNativePlatform() && (
            <NavButton
              icon={<Upload size={24} />}
              label="Bulk"
              active={currentPage === 'bulk-upload'}
              onClick={() => onNavigate('bulk-upload')}
            />
          )}
          <NavButton
            icon={<Heart size={24} />}
            label="Wishlist"
            active={currentPage === 'wishlist'}
            onClick={() => onNavigate('wishlist')}
          />
          <NavButton
            icon={<CalendarDays size={24} />}
            label="New Comics"
            active={currentPage === 'pull-list'}
            onClick={() => onNavigate('pull-list')}
          />
          {isAdmin && (
            <NavButton
              icon={<Shield size={24} />}
              label="Admin"
              active={currentPage === 'admin'}
              onClick={() => onNavigate('admin')}
            />
          )}
        </div>
      </nav>
    </div>
  );
}

type NavButtonProps = {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  primary?: boolean;
};

function NavButton({ icon, label, active, onClick, primary }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center min-w-[60px] h-full transition-colors ${
        primary
          ? active
            ? 'text-blue-400'
            : 'text-blue-500'
          : active
          ? 'text-white'
          : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      <div className={primary ? 'scale-110' : ''}>
        {icon}
      </div>
      <span className="text-xs mt-1">{label}</span>
    </button>
  );
}

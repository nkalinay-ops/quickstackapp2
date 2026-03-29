import { ReactNode } from 'react';
import { Home, Library, Plus, Heart, Settings, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type LayoutProps = {
  children: ReactNode;
  currentPage: 'dashboard' | 'collection' | 'add' | 'wishlist' | 'settings' | 'beta-keys' | 'admin';
  onNavigate: (page: 'dashboard' | 'collection' | 'add' | 'wishlist' | 'settings' | 'beta-keys' | 'admin') => void;
};

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800">
        <div className={`flex justify-around items-center h-16 max-w-2xl mx-auto ${isAdmin ? 'px-2' : ''}`}>
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
          <NavButton
            icon={<Heart size={24} />}
            label="Wishlist"
            active={currentPage === 'wishlist'}
            onClick={() => onNavigate('wishlist')}
          />
          {isAdmin && (
            <NavButton
              icon={<Shield size={24} />}
              label="Admin"
              active={currentPage === 'admin'}
              onClick={() => onNavigate('admin')}
            />
          )}
          <NavButton
            icon={<Settings size={24} />}
            label="Settings"
            active={currentPage === 'settings'}
            onClick={() => onNavigate('settings')}
          />
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

import { useEffect, useState } from 'react';
import { supabase, Comic } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Heart, TrendingUp, ChevronRight } from 'lucide-react';

type DashboardProps = {
  onNavigate: (page: string) => void;
  onNavigateToComic: (comicId: string) => void;
  onNavigateToCollection: (mode: 'all' | 'week') => void;
};

export function Dashboard({ onNavigate, onNavigateToComic, onNavigateToCollection }: DashboardProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, wishlist: 0, recentCount: 0 });
  const [recentComics, setRecentComics] = useState<Comic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadDashboard = async () => {
      try {
        const [comicsResult, wishlistResult] = await Promise.all([
          supabase.from('comics').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('wishlist').select('*').eq('user_id', user.id),
        ]);

        if (comicsResult.data) {
          setStats({
            total: comicsResult.data.length,
            wishlist: wishlistResult.data?.length || 0,
            recentCount: comicsResult.data.filter(c => {
              const created = new Date(c.created_at);
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              return created > weekAgo;
            }).length,
          });
          setRecentComics(comicsResult.data.slice(0, 5));
        }
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-4 flex flex-col items-center">
        <img
          src="/ChatGPT_Image_Mar_18,_2026,_09_08_29_PM copy.png"
          alt="QuickStack"
          className="w-64 h-auto mb-1"
        />
        <p className="text-gray-400">Your comic collection at a glance</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard
          icon={<BookOpen size={24} />}
          label="Total Comics"
          value={stats.total}
          color="blue"
          onClick={() => onNavigateToCollection('all')}
        />
        <StatCard
          icon={<Heart size={24} />}
          label="Wishlist"
          value={stats.wishlist}
          color="red"
          onClick={() => onNavigate('wishlist')}
        />
        <StatCard
          icon={<TrendingUp size={24} />}
          label="This Week"
          value={stats.recentCount}
          color="green"
          onClick={() => onNavigateToCollection('week')}
        />
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Recent Additions</h2>
          {recentComics.length > 0 && (
            <button
              onClick={() => onNavigate('collection')}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
            >
              View all <ChevronRight size={14} />
            </button>
          )}
        </div>
        {recentComics.length === 0 ? (
          <div className="bg-gray-900 rounded-lg p-8 text-center">
            <p className="text-gray-400 mb-2">No comics yet</p>
            <p className="text-gray-500 text-sm">Tap the + button to add your first comic</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentComics.map((comic) => (
              <button
                key={comic.id}
                onClick={() => onNavigateToComic(comic.id)}
                className="w-full bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-gray-600 transition-colors flex gap-4 items-start text-left group"
              >
                {comic.color_image_url && (
                  <img
                    src={comic.color_image_url}
                    alt={comic.series}
                    className="w-16 h-24 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{comic.series}</div>
                  {comic.story && (
                    <div className="text-sm text-gray-300 italic mt-0.5 truncate">{comic.story}</div>
                  )}
                  <div className="text-sm text-gray-400 mt-1">
                    {comic.issue_number && `#${comic.issue_number}`}
                    {comic.issue_number && comic.publisher && ' • '}
                    {comic.publisher}
                  </div>
                  {comic.condition && (
                    <div className="text-xs text-gray-500 mt-1">{comic.condition}</div>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0 mt-1" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'blue' | 'red' | 'green';
  onClick: () => void;
};

function StatCard({ icon, label, value, color, onClick }: StatCardProps) {
  const colors = {
    blue: 'bg-blue-950 text-blue-400 border-blue-900 hover:border-blue-600 hover:bg-blue-900/50',
    red: 'bg-red-950 text-red-400 border-red-900 hover:border-red-600 hover:bg-red-900/50',
    green: 'bg-green-950 text-green-400 border-green-900 hover:border-green-600 hover:bg-green-900/50',
  };

  return (
    <button
      onClick={onClick}
      className={`${colors[color]} rounded-lg p-4 border transition-colors w-full`}
    >
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-2xl font-bold text-center text-white">{value}</div>
      <div className="text-xs text-center mt-1 opacity-80">{label}</div>
    </button>
  );
}

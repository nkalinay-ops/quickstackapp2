import { useEffect, useState } from 'react';
import { supabase, Comic, WishlistItem } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Heart, TrendingUp } from 'lucide-react';

export function Dashboard() {
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">QuickStack</h1>
        <p className="text-gray-400">Your comic collection at a glance</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard
          icon={<BookOpen size={24} />}
          label="Total Comics"
          value={stats.total}
          color="blue"
        />
        <StatCard
          icon={<Heart size={24} />}
          label="Wishlist"
          value={stats.wishlist}
          color="red"
        />
        <StatCard
          icon={<TrendingUp size={24} />}
          label="This Week"
          value={stats.recentCount}
          color="green"
        />
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Recent Additions</h2>
        {recentComics.length === 0 ? (
          <div className="bg-gray-900 rounded-lg p-8 text-center">
            <p className="text-gray-400 mb-2">No comics yet</p>
            <p className="text-gray-500 text-sm">Tap the + button to add your first comic</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentComics.map((comic) => (
              <div key={comic.id} className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex gap-4">
                {comic.color_image_url && (
                  <img
                    src={comic.color_image_url}
                    alt={comic.title}
                    className="w-16 h-24 object-cover rounded"
                  />
                )}
                <div className="flex-1">
                  <div className="font-medium">{comic.title}</div>
                  <div className="text-sm text-gray-400 mt-1">
                    {comic.issue_number && `#${comic.issue_number}`}
                    {comic.issue_number && comic.publisher && ' • '}
                    {comic.publisher}
                  </div>
                </div>
              </div>
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
};

function StatCard({ icon, label, value, color }: StatCardProps) {
  const colors = {
    blue: 'bg-blue-950 text-blue-400 border-blue-900',
    red: 'bg-red-950 text-red-400 border-red-900',
    green: 'bg-green-950 text-green-400 border-green-900',
  };

  return (
    <div className={`${colors[color]} rounded-lg p-4 border`}>
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-2xl font-bold text-center text-white">{value}</div>
      <div className="text-xs text-center mt-1 opacity-80">{label}</div>
    </div>
  );
}

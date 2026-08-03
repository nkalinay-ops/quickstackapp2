import { useEffect, useMemo, useState } from 'react';
import { supabase, WishlistItem } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, CheckCircle, Search, ArrowUpDown, CalendarDays, BookOpen } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';

type WishlistItemExtended = WishlistItem & {
  pull_list_items: { on_sale_date: string | null; cover_image_url: string | null } | null;
};

type SortOption =
  | 'newest'
  | 'oldest'
  | 'series_asc'
  | 'series_desc'
  | 'publisher_asc'
  | 'publisher_desc'
  | 'priority'
  | 'release_date';

type SourceFilter = 'all' | 'pulls' | 'saved';

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest First',
  oldest: 'Oldest First',
  series_asc: 'Series A–Z',
  series_desc: 'Series Z–A',
  publisher_asc: 'Publisher A–Z',
  publisher_desc: 'Publisher Z–A',
  priority: 'Priority',
  release_date: 'Release Date',
};

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function formatReleaseDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type WishlistProps = {
  initialSourceFilter?: SourceFilter;
  onFilterConsumed?: () => void;
};

export function Wishlist({ initialSourceFilter, onFilterConsumed }: WishlistProps = {}) {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState<WishlistItemExtended[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(initialSourceFilter ?? 'all');
  const [sortBy, setSortBy] = useState<SortOption>(initialSourceFilter === 'pulls' ? 'release_date' : 'newest');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'delete' | 'acquire' | null;
    itemId: string | null;
    item: WishlistItemExtended | null;
  }>({ isOpen: false, action: null, itemId: null, item: null });
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: 'error' | 'success' | 'info';
  }>({ isOpen: false, message: '' });

  useEffect(() => {
    onFilterConsumed?.();
  }, []);

  useEffect(() => {
    if (!user) return;
    loadWishlist();
  }, [user]);

  const loadWishlist = async () => {
    try {
      const { data, error } = await supabase
        .from('wishlist')
        .select('*, pull_list_items(on_sale_date, cover_image_url)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWishlist((data || []) as WishlistItemExtended[]);
    } catch (error) {
      console.error('Error loading wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const pullCount = useMemo(
    () => wishlist.filter(i => i.pull_list_item_id != null).length,
    [wishlist]
  );

  const filteredAndSorted = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let result = wishlist.filter(item => {
      if (sourceFilter === 'pulls' && item.pull_list_item_id == null) return false;
      if (sourceFilter === 'saved' && item.pull_list_item_id != null) return false;
      if (priorityFilter !== 'All' && item.priority !== priorityFilter) return false;
      if (!query) return true;
      return (
        item.series?.toLowerCase().includes(query) ||
        item.story?.toLowerCase().includes(query) ||
        item.issue_number?.toLowerCase().includes(query) ||
        item.publisher?.toLowerCase().includes(query)
      );
    });

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'release_date': {
          const da = a.pull_list_items?.on_sale_date ?? '';
          const db = b.pull_list_items?.on_sale_date ?? '';
          // items without a release date sort last
          if (!da && db) return 1;
          if (da && !db) return -1;
          return da.localeCompare(db);
        }
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'series_asc':
          return (a.series ?? '').localeCompare(b.series ?? '');
        case 'series_desc':
          return (b.series ?? '').localeCompare(a.series ?? '');
        case 'publisher_asc': {
          const pa = a.publisher ?? '', pb = b.publisher ?? '';
          if (!pa && pb) return 1;
          if (pa && !pb) return -1;
          return pa.localeCompare(pb);
        }
        case 'publisher_desc': {
          const pa = a.publisher ?? '', pb = b.publisher ?? '';
          if (!pa && pb) return 1;
          if (pa && !pb) return -1;
          return pb.localeCompare(pa);
        }
        case 'priority':
          return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return result;
  }, [wishlist, searchQuery, priorityFilter, sourceFilter, sortBy]);

  const isFiltered = searchQuery.trim() !== '' || priorityFilter !== 'All' || sourceFilter !== 'all';

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase.from('wishlist').delete().eq('id', id);
      if (error) throw error;
      setWishlist(wishlist.filter(item => item.id !== id));
    } catch (error) {
      console.error('Error deleting item:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to remove item', type: 'error' });
    }
  };

  const markAsAcquired = async (item: WishlistItemExtended) => {
    try {
      const { error: insertError } = await supabase.from('comics').insert({
        user_id: user!.id,
        series: item.series,
        story: item.story,
        issue_number: item.issue_number,
        publisher: item.publisher,
        year: null,
        condition: '',
        notes: item.notes,
        total_issues: item.total_issues ?? null,
        cover_variant: item.cover_variant ?? null,
        color_image_url: item.pull_list_items?.cover_image_url ?? null,
      });
      if (insertError) throw insertError;

      const { error: deleteError } = await supabase.from('wishlist').delete().eq('id', item.id);
      if (deleteError) throw deleteError;

      setWishlist(wishlist.filter(i => i.id !== item.id));
      setAlertModal({ isOpen: true, title: 'Success', message: 'Added to collection!', type: 'success' });
    } catch (error) {
      console.error('Error moving to collection:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to move to collection', type: 'error' });
    }
  };

  const handleDeleteClick = (id: string) => {
    setConfirmModal({ isOpen: true, action: 'delete', itemId: id, item: null });
  };

  const handleAcquiredClick = (item: WishlistItemExtended) => {
    setConfirmModal({ isOpen: true, action: 'acquire', itemId: item.id, item });
  };

  const handleConfirmAction = () => {
    if (confirmModal.action === 'delete' && confirmModal.itemId) {
      deleteItem(confirmModal.itemId);
    } else if (confirmModal.action === 'acquire' && confirmModal.item) {
      markAsAcquired(confirmModal.item);
    }
  };

  const priorityColors = {
    High: 'text-red-400 bg-red-950 border-red-900',
    Medium: 'text-yellow-400 bg-yellow-950 border-yellow-900',
    Low: 'text-green-400 bg-green-950 border-green-900',
  };

  const priorityFilterColors: Record<string, string> = {
    All: 'bg-gray-700 text-white border-gray-600',
    High: 'bg-red-950 text-red-400 border-red-900',
    Medium: 'bg-yellow-950 text-yellow-400 border-yellow-900',
    Low: 'bg-green-950 text-green-400 border-green-900',
  };

  const priorityFilterInactive: Record<string, string> = {
    All: 'bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-600',
    High: 'bg-gray-900 text-gray-400 border-gray-800 hover:border-red-900 hover:text-red-400',
    Medium: 'bg-gray-900 text-gray-400 border-gray-800 hover:border-yellow-900 hover:text-yellow-400',
    Low: 'bg-gray-900 text-gray-400 border-gray-800 hover:border-green-900 hover:text-green-400',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold mb-1">Wishlist</h1>
        <p className="text-gray-400">Comics you're looking to acquire</p>
      </div>

      {/* Source filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 p-1 rounded-lg border border-gray-800">
        {([
          { key: 'all', label: 'All', count: wishlist.length },
          { key: 'pulls', label: 'Pulls', count: pullCount },
          { key: 'saved', label: 'Saved', count: wishlist.length - pullCount },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setSourceFilter(tab.key);
              if (tab.key === 'pulls' && sortBy === 'newest') setSortBy('release_date');
              if (tab.key !== 'pulls' && sortBy === 'release_date') setSortBy('newest');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              sourceFilter === tab.key
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.key === 'pulls' && <CalendarDays size={13} />}
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              sourceFilter === tab.key ? 'bg-gray-600 text-gray-200' : 'bg-gray-800 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {wishlist.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-2">Your wishlist is empty</p>
          <p className="text-gray-500 text-sm">Use the Add tab to add comics to your wishlist</p>
        </div>
      ) : (
        <div>
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search series, story, issue, publisher..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Priority filter row */}
          <div className="flex gap-1 mb-2">
            {(['All', 'High', 'Medium', 'Low'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors ${
                  priorityFilter === p ? priorityFilterColors[p] : priorityFilterInactive[p]
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Sort row */}
          <div className="flex items-center justify-end gap-1.5 mb-3">
            <ArrowUpDown size={14} className="text-gray-500" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="bg-gray-900 text-gray-300 text-xs border border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {(Object.keys(SORT_LABELS) as SortOption[]).map(key => (
                <option key={key} value={key}>{SORT_LABELS[key]}</option>
              ))}
            </select>
          </div>

          {/* Count */}
          <div className="text-gray-400 text-sm mb-3">
            {isFiltered
              ? `${filteredAndSorted.length} of ${wishlist.length} ${wishlist.length === 1 ? 'item' : 'items'}`
              : `${wishlist.length} ${wishlist.length === 1 ? 'item' : 'items'}`}
          </div>

          {filteredAndSorted.length === 0 ? (
            <div className="bg-gray-900 rounded-lg p-8 text-center">
              <p className="text-gray-400 mb-1">No items match your search</p>
              <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAndSorted.map(item => (
                <WishlistCard
                  key={item.id}
                  item={item}
                  priorityColors={priorityColors}
                  onAcquired={handleAcquiredClick}
                  onDelete={handleDeleteClick}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, action: null, itemId: null, item: null })}
        onConfirm={handleConfirmAction}
        title={confirmModal.action === 'delete' ? 'Remove from Wishlist' : 'Move to Collection'}
        message={
          confirmModal.action === 'delete'
            ? 'Are you sure you want to remove this item from your wishlist?'
            : 'Move this item to your collection?'
        }
        confirmText={confirmModal.action === 'delete' ? 'Remove' : 'Move to Collection'}
        cancelText="Cancel"
        isDestructive={confirmModal.action === 'delete'}
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}

type WishlistCardProps = {
  item: WishlistItemExtended;
  priorityColors: Record<string, string>;
  onAcquired: (item: WishlistItemExtended) => void;
  onDelete: (id: string) => void;
};

function WishlistCard({ item, priorityColors, onAcquired, onDelete }: WishlistCardProps) {
  const isPull = item.pull_list_item_id != null;
  const coverUrl = item.pull_list_items?.cover_image_url;
  const releaseDate = item.pull_list_items?.on_sale_date;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      <div className="flex gap-3 p-4">
        {/* Cover — only shown for pull list items that have one */}
        {isPull && (
          <div className="w-12 h-18 flex-shrink-0 bg-gray-800 rounded overflow-hidden self-start" style={{ height: '72px' }}>
            {coverUrl ? (
              <img src={coverUrl} alt={item.series} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <BookOpen size={16} className="text-gray-600" />
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white">{item.series}</div>
              {item.story && (
                <div className="text-sm text-gray-300 mt-0.5 italic">{item.story}</div>
              )}
              <div className="text-sm text-gray-400 mt-1">
                {item.issue_number && `#${item.issue_number}`}
                {item.cover_variant != null && ` · Variant ${item.cover_variant}`}
                {(item.issue_number || item.cover_variant != null) && item.publisher && ' • '}
                {item.publisher}
              </div>
              {item.notes && (
                <div className="text-xs text-gray-500 mt-1">{item.notes}</div>
              )}
              {isPull && releaseDate ? (
                <div className="flex items-center gap-1 mt-1.5">
                  <CalendarDays size={11} className="text-indigo-400" />
                  <span className="text-xs text-indigo-400">Releases {formatReleaseDate(releaseDate)}</span>
                </div>
              ) : (
                <div className="text-xs text-gray-600 mt-1">
                  Added {new Date(item.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              )}
            </div>
            <span className={`${priorityColors[item.priority as keyof typeof priorityColors]} text-xs px-2 py-1 rounded border ml-2 shrink-0`}>
              {item.priority}
            </span>
          </div>
        </div>
      </div>

      <div className="flex border-t border-gray-800">
        <button
          onClick={() => onAcquired(item)}
          className="flex-1 py-2.5 text-green-400 hover:bg-gray-800 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          <CheckCircle size={15} />
          Acquired
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="px-4 py-2.5 text-gray-500 hover:text-red-400 transition-colors border-l border-gray-800"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

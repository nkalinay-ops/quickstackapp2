import { useEffect, useMemo, useState } from 'react';
import { Search, BookOpen, Heart, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertModal } from '../components/AlertModal';

type PullListItem = {
  id: string;
  source: 'lunar' | 'prh';
  sku: string;
  title: string;
  publisher: string | null;
  format: string | null;
  variant_label: string | null;
  price: number | null;
  foc_date: string | null;
  on_sale_date: string | null;
  writer: string | null;
  artist: string | null;
  upc_isbn: string | null;
  cover_image_url: string | null;
};

function parseTitleParts(title: string): { series: string; issue: string } {
  // Match trailing issue number: "BATMAN #9" → series="BATMAN", issue="9"
  const match = title.match(/^(.+?)\s+#(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    const series = match[3] ? `${match[1]} ${match[3]}`.trim() : match[1].trim();
    return { series, issue: match[2] };
  }
  return { series: title.trim(), issue: '' };
}

function formatFocDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatOnSaleDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PullList() {
  const { user } = useAuth();
  const [items, setItems] = useState<PullListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [publisherFilter, setPublisherFilter] = useState('All');
  const [formatFilter, setFormatFilter] = useState('All');
  const [addingToWishlist, setAddingToWishlist] = useState<string | null>(null);
  const [addingToCollection, setAddingToCollection] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title?: string; message: string; type?: 'error' | 'success' | 'info' }>({
    isOpen: false,
    message: '',
  });

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from('pull_list_items')
      .select('id, source, sku, title, publisher, format, variant_label, price, foc_date, on_sale_date, writer, artist, upc_isbn, cover_image_url')
      .order('foc_date', { ascending: true })
      .order('title', { ascending: true });

    if (!error && data) setItems(data as PullListItem[]);
    setLoading(false);
  }

  const publishers = useMemo(() => {
    const set = new Set(items.map(i => i.publisher).filter(Boolean) as string[]);
    return ['All', ...Array.from(set).sort()];
  }, [items]);

  const formats = useMemo(() => {
    const set = new Set(items.map(i => i.format).filter(Boolean) as string[]);
    return ['All', ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (publisherFilter !== 'All' && item.publisher !== publisherFilter) return false;
      if (formatFilter !== 'All' && item.format !== formatFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!item.title.toLowerCase().includes(q) &&
            !(item.publisher ?? '').toLowerCase().includes(q) &&
            !(item.writer ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, publisherFilter, formatFilter, searchQuery]);

  // Group by FOC date
  const groupedByFoc = useMemo(() => {
    const groups = new Map<string, PullListItem[]>();
    for (const item of filtered) {
      const key = item.foc_date ?? 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return groups;
  }, [filtered]);

  async function addToWishlist(item: PullListItem) {
    if (!user) return;
    setAddingToWishlist(item.id);
    const { series, issue } = parseTitleParts(item.title);

    const { error } = await supabase.from('wishlist').insert({
      user_id: user.id,
      series,
      issue_number: issue,
      publisher: item.publisher ?? '',
      priority: 'Medium',
      story: '',
      notes: '',
      cover_variant: null,
      total_issues: null,
      total_issues_conflict: null,
    });

    setAddingToWishlist(null);
    setAlertModal({
      isOpen: true,
      title: error ? 'Error' : 'Added to Wishlist',
      message: error ? error.message : `"${series}" added to your wishlist.`,
      type: error ? 'error' : 'success',
    });
  }

  function addToCollection(item: PullListItem) {
    setAddingToCollection(item.id);
    const { series, issue } = parseTitleParts(item.title);
    // Pre-fill AddComic via navigation state on the navigate event
    const year = item.on_sale_date ? new Date(item.on_sale_date + 'T00:00:00').getFullYear() : null;
    window.dispatchEvent(new CustomEvent('navigate', {
      detail: {
        page: 'add',
        prefill: {
          series,
          issue_number: issue,
          publisher: item.publisher ?? '',
          year,
        },
      },
    }));
    setAddingToCollection(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">Pull List</h1>
        <p className="text-gray-400 text-sm mb-5">Upcoming releases by Final Order Cutoff date</p>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search titles, publishers, writers..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          <select
            value={publisherFilter}
            onChange={e => setPublisherFilter(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            {publishers.map(p => (
              <option key={p} value={p}>{p === 'All' ? 'All Publishers' : p}</option>
            ))}
          </select>
          <select
            value={formatFilter}
            onChange={e => setFormatFilter(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            {formats.map(f => (
              <option key={f} value={f}>{f === 'All' ? 'All Formats' : f}</option>
            ))}
          </select>
        </div>

        {/* Results */}
        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium mb-1">No upcoming releases</p>
            <p className="text-sm">Check back after the next sync.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium mb-1">No results</p>
            <p className="text-sm">Try adjusting your filters or search.</p>
          </div>
        ) : (
          Array.from(groupedByFoc.entries()).map(([focDate, group]) => (
            <div key={focDate} className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
                  FOC {focDate !== 'Unknown' ? formatFocDate(focDate) : 'Unknown'}
                </h2>
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-500">{group.length} {group.length === 1 ? 'item' : 'items'}</span>
              </div>

              <div className="space-y-3">
                {group.map(item => (
                  <PullListCard
                    key={item.id}
                    item={item}
                    onAddToWishlist={addToWishlist}
                    onAddToCollection={addToCollection}
                    addingToWishlist={addingToWishlist === item.id}
                    addingToCollection={addingToCollection === item.id}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

type PullListCardProps = {
  item: PullListItem;
  onAddToWishlist: (item: PullListItem) => void;
  onAddToCollection: (item: PullListItem) => void;
  addingToWishlist: boolean;
  addingToCollection: boolean;
};

function PullListCard({ item, onAddToWishlist, onAddToCollection, addingToWishlist, addingToCollection }: PullListCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isAdding = addingToWishlist || addingToCollection;

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
      <div className="flex gap-3 p-3">
        {/* Cover */}
        <div className="w-16 h-24 flex-shrink-0 bg-gray-800 rounded-lg overflow-hidden">
          {item.cover_image_url ? (
            <img
              src={item.cover_image_url}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen size={20} className="text-gray-600" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-tight line-clamp-2">{item.title}</p>
              {item.variant_label && (
                <p className="text-xs text-indigo-400 mt-0.5">{item.variant_label}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">{item.publisher}</p>
            </div>
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-gray-500 hover:text-gray-300 flex-shrink-0 mt-0.5"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {item.format && (
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{item.format}</span>
            )}
            {item.price != null && (
              <span className="text-xs text-gray-400">${item.price.toFixed(2)}</span>
            )}
            {item.on_sale_date && (
              <span className="text-xs text-gray-500">On sale {formatOnSaleDate(item.on_sale_date)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-800 pt-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-3">
            {item.writer && <span><span className="text-gray-500">Writer</span> {item.writer}</span>}
            {item.artist && <span><span className="text-gray-500">Artist</span> {item.artist}</span>}
            {item.upc_isbn && <span><span className="text-gray-500">SKU</span> {item.upc_isbn}</span>}
            <span><span className="text-gray-500">Source</span> {item.source === 'lunar' ? 'Lunar Distribution' : 'PRH Comics'}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex border-t border-gray-800">
        <button
          onClick={() => onAddToWishlist(item)}
          disabled={isAdding}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-r border-gray-800"
        >
          {addingToWishlist ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Heart size={13} />
          )}
          Add to Wishlist
        </button>
        <button
          onClick={() => onAddToCollection(item)}
          disabled={isAdding}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {addingToCollection ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <BookOpen size={13} />
          )}
          Add to Collection
        </button>
      </div>
    </div>
  );
}

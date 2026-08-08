import { useEffect, useMemo, useState } from 'react';
import { Search, BookOpen, Heart, ChevronDown, ChevronUp, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertModal } from '../components/AlertModal';
import { ConfirmModal } from '../components/ConfirmModal';

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

type OwnedRecord = { series: string; issue_number: string };

type AddedStatus = { inCollection: boolean; inWishlist: boolean };

function parseTitleParts(title: string): { series: string; issue: string } {
  const match = title.match(/^(.+?)\s+#(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    const series = match[3] ? `${match[1]} ${match[3]}`.trim() : match[1].trim();
    return { series, issue: match[2] };
  }
  return { series: title.trim(), issue: '' };
}

function formatReleaseDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatReleaseDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function matchesOwned(item: PullListItem, owned: OwnedRecord[]): boolean {
  const { series, issue } = parseTitleParts(item.title);
  const s = series.toLowerCase();
  const i = issue.toLowerCase();
  return owned.some(
    r => r.series.toLowerCase() === s && r.issue_number.toLowerCase() === i
  );
}

// Looser match — true if the user owns any issue from the same series.
// Uses bidirectional includes so "The Amazing Spider-Man" matches "Amazing Spider-Man"
// regardless of which side has the article prefix.
function matchesSeries(item: PullListItem, owned: OwnedRecord[]): boolean {
  const { series } = parseTitleParts(item.title);
  const s = series.toLowerCase();
  return owned.some(r => {
    const cs = r.series.toLowerCase();
    return cs === s || cs.includes(s) || s.includes(cs);
  });
}

export function PullList() {
  const { user } = useAuth();
  const [items, setItems] = useState<PullListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'for-you'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [publisherFilter, setPublisherFilter] = useState('All');
  const [formatFilter, setFormatFilter] = useState('All');
  const [releaseDateFilter, setReleaseDateFilter] = useState('All');

  // Cross-reference state — loaded lazily when the user first opens the For You tab
  const [collectionOwned, setCollectionOwned] = useState<OwnedRecord[]>([]);
  const [wishlistOwned, setWishlistOwned] = useState<OwnedRecord[]>([]);
  const [forYouLoaded, setForYouLoaded] = useState(false);
  const [forYouLoading, setForYouLoading] = useState(false);

  // Pending add action — set when a duplicate is detected
  const [confirmDupe, setConfirmDupe] = useState<{
    item: PullListItem;
    action: 'collection' | 'wishlist';
  } | null>(null);

  const [addingToWishlist, setAddingToWishlist] = useState<string | null>(null);
  const [addingToCollection, setAddingToCollection] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: 'error' | 'success' | 'info';
  }>({ isOpen: false, message: '' });

  useEffect(() => {
    if (user) loadPullList();
  }, [user]);

  // Triggered when the user switches to the For You tab for the first time
  useEffect(() => {
    if (viewMode === 'for-you' && user && !forYouLoaded && !forYouLoading) {
      loadForYou();
    }
  }, [viewMode, user]);

  async function loadPullList() {
    setLoading(true);
    const { data } = await supabase
      .from('pull_list_items')
      .select('id, source, sku, title, publisher, format, variant_label, price, foc_date, on_sale_date, writer, artist, upc_isbn, cover_image_url')
      .or('format.is.null,format.not.in.(Board Book,Book & Toy,Boxed Set,Cards,Merchandise)')
      .order('on_sale_date', { ascending: true })
      .order('title', { ascending: true });
    if (data) setItems(data as PullListItem[]);
    setLoading(false);
  }

  async function loadForYou() {
    setForYouLoading(true);
    const [comicsRes, wishlistRes] = await Promise.all([
      supabase.from('comics').select('series, issue_number').eq('user_id', user!.id),
      supabase.from('wishlist').select('series, issue_number').eq('user_id', user!.id),
    ]);
    if (comicsRes.data) setCollectionOwned(comicsRes.data as OwnedRecord[]);
    if (wishlistRes.data) setWishlistOwned(wishlistRes.data as OwnedRecord[]);
    setForYouLoaded(true);
    setForYouLoading(false);
  }

  // Derive added status for every pull list item
  const addedStatus = useMemo<Record<string, AddedStatus>>(() => {
    const result: Record<string, AddedStatus> = {};
    for (const item of items) {
      result[item.id] = {
        inCollection: matchesOwned(item, collectionOwned),
        inWishlist: matchesOwned(item, wishlistOwned),
      };
    }
    return result;
  }, [items, collectionOwned, wishlistOwned]);

  const publishers = useMemo(() => {
    const set = new Set(items.map(i => i.publisher).filter(Boolean) as string[]);
    return ['All', ...Array.from(set).sort()];
  }, [items]);

  const formats = useMemo(() => {
    const set = new Set(items.map(i => i.format).filter(Boolean) as string[]);
    return ['All', ...Array.from(set).sort()];
  }, [items]);

  const releaseDates = useMemo(() => {
    const set = new Set(items.map(i => i.on_sale_date).filter(Boolean) as string[]);
    return ['All', ...Array.from(set).sort()];
  }, [items]);

  const forYouCount = useMemo(
    () => items.filter(item => matchesSeries(item, collectionOwned)).length,
    [items, collectionOwned]
  );

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (viewMode === 'for-you' && !matchesSeries(item, collectionOwned)) return false;
      if (publisherFilter !== 'All' && item.publisher !== publisherFilter) return false;
      if (formatFilter !== 'All' && item.format !== formatFilter) return false;
      if (releaseDateFilter !== 'All' && item.on_sale_date !== releaseDateFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !item.title.toLowerCase().includes(q) &&
          !(item.publisher ?? '').toLowerCase().includes(q) &&
          !(item.writer ?? '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [items, viewMode, collectionOwned, publisherFilter, formatFilter, releaseDateFilter, searchQuery]);

  const groupedByReleaseDate = useMemo(() => {
    const groups = new Map<string, PullListItem[]>();
    for (const item of filtered) {
      const key = item.on_sale_date ?? 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return groups;
  }, [filtered]);

  // ── Add to Wishlist ──────────────────────────────────────────────────────

  function handleAddToWishlist(item: PullListItem) {
    if (addedStatus[item.id]?.inWishlist) {
      setConfirmDupe({ item, action: 'wishlist' });
    } else {
      doAddToWishlist(item);
    }
  }

  async function doAddToWishlist(item: PullListItem) {
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
      pull_list_item_id: item.id,
    });

    if (!error) {
      setWishlistOwned(prev => [...prev, { series, issue_number: issue }]);
    }
    setAddingToWishlist(null);
    setAlertModal({
      isOpen: true,
      title: error ? 'Error' : 'Added to Wishlist',
      message: error ? error.message : `"${series}" added to your wishlist.`,
      type: error ? 'error' : 'success',
    });
  }

  // ── Add to Collection ────────────────────────────────────────────────────

  function handleAddToCollection(item: PullListItem) {
    if (addedStatus[item.id]?.inCollection) {
      setConfirmDupe({ item, action: 'collection' });
    } else {
      doAddToCollection(item);
    }
  }

  async function doAddToCollection(item: PullListItem) {
    if (!user) return;
    setAddingToCollection(item.id);
    const { series, issue } = parseTitleParts(item.title);
    const year = item.on_sale_date
      ? new Date(item.on_sale_date + 'T00:00:00').getFullYear()
      : null;

    const { error } = await supabase.from('comics').insert({
      user_id: user.id,
      series,
      issue_number: issue,
      publisher: item.publisher ?? '',
      year,
      condition: '',
      story: '',
      notes: '',
      color_image_url: item.cover_image_url ?? null,
      bw_image_url: null,
      copy_count: 1,
      cover_variant: null,
      total_issues: null,
      total_issues_conflict: null,
      purchase_price: null,
      purchase_date: null,
    });

    if (!error) {
      setCollectionOwned(prev => [...prev, { series, issue_number: issue }]);
    }
    setAddingToCollection(null);
    setAlertModal({
      isOpen: true,
      title: error ? 'Error' : 'Added to Collection',
      message: error ? error.message : `"${series}" added to your collection.`,
      type: error ? 'error' : 'success',
    });
  }

  // ── Duplicate confirmation ───────────────────────────────────────────────

  function handleDupeConfirm() {
    if (!confirmDupe) return;
    const { item, action } = confirmDupe;
    setConfirmDupe(null);
    if (action === 'collection') doAddToCollection(item);
    else doAddToWishlist(item);
  }

  const dupeTitle = confirmDupe ? parseTitleParts(confirmDupe.item.title).series : '';
  const dupeMessage = confirmDupe
    ? confirmDupe.action === 'collection'
      ? `"${dupeTitle}" is already in your collection. Add another copy anyway?`
      : `"${dupeTitle}" is already in your wishlist. Add it again?`
    : '';

  // ── Render ───────────────────────────────────────────────────────────────

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
        <h1 className="text-2xl font-bold mb-1">New Comics</h1>
        <p className="text-gray-400 text-sm mb-4">Upcoming releases by store date</p>

        {/* View mode tabs */}
        <div className="flex gap-1 bg-gray-900 p-1 rounded-lg mb-4">
          <button
            onClick={() => setViewMode('all')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'all'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setViewMode('for-you')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'for-you'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sparkles size={14} />
            For You
            {forYouLoaded && forYouCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                viewMode === 'for-you' ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-300'
              }`}>
                {forYouCount}
              </span>
            )}
          </button>
        </div>

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
            value={releaseDateFilter}
            onChange={e => setReleaseDateFilter(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            {releaseDates.map(d => (
              <option key={d} value={d}>
                {d === 'All' ? 'All Dates' : formatReleaseDateShort(d)}
              </option>
            ))}
          </select>
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
        {forYouLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">Loading your collection…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium mb-1">No upcoming releases</p>
            <p className="text-sm">Check back soon.</p>
          </div>
        ) : filtered.length === 0 ? (

          <div className="text-center py-16 text-gray-500">
            {viewMode === 'for-you' && forYouCount === 0 ? (
              <>
                <Sparkles size={32} className="mx-auto mb-3 text-gray-700" />
                <p className="text-lg font-medium mb-1">Nothing here yet</p>
                <p className="text-sm">Add comics to your collection and we'll surface new issues of those series here.</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium mb-1">No results</p>
                <p className="text-sm">Try adjusting your filters or search.</p>
              </>
            )}
          </div>
        ) : (
          Array.from(groupedByReleaseDate.entries()).map(([releaseDate, group]) => (
            <div key={releaseDate} className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
                  {releaseDate !== 'Unknown' ? formatReleaseDate(releaseDate) : 'Date Unknown'}
                </h2>
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-500">
                  {group.length} {group.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="space-y-3">
                {group.map(item => (
                  <PullListCard
                    key={item.id}
                    item={item}
                    status={addedStatus[item.id] ?? { inCollection: false, inWishlist: false }}
                    onAddToWishlist={handleAddToWishlist}
                    onAddToCollection={handleAddToCollection}
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

      <ConfirmModal
        isOpen={!!confirmDupe}
        title="Already Added"
        message={dupeMessage}
        confirmText="Add Anyway"
        cancelText="Cancel"
        onConfirm={handleDupeConfirm}
        onClose={() => setConfirmDupe(null)}
      />
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

type PullListCardProps = {
  item: PullListItem;
  status: AddedStatus;
  onAddToWishlist: (item: PullListItem) => void;
  onAddToCollection: (item: PullListItem) => void;
  addingToWishlist: boolean;
  addingToCollection: boolean;
};

function PullListCard({
  item,
  status,
  onAddToWishlist,
  onAddToCollection,
  addingToWishlist,
  addingToCollection,
}: PullListCardProps) {
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
              <p className="text-sm font-semibold text-white leading-tight line-clamp-2">
                {item.title}
              </p>
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
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                {item.format}
              </span>
            )}
            {item.price != null && (
              <span className="text-xs text-gray-400">${item.price.toFixed(2)}</span>
            )}
            {item.on_sale_date && (
              <span className="text-xs text-gray-500">
                On sale {formatReleaseDateShort(item.on_sale_date)}
              </span>
            )}
          </div>

          {/* Added status badges */}
          {(status.inCollection || status.inWishlist) && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {status.inCollection && (
                <span className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={11} />
                  In Collection
                </span>
              )}
              {status.inWishlist && (
                <span className="inline-flex items-center gap-1 text-xs bg-pink-500/10 text-pink-400 border border-pink-500/20 px-2 py-0.5 rounded-full">
                  <Heart size={11} />
                  In Wishlist
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-800 pt-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            {item.writer && (
              <span><span className="text-gray-500">Writer</span> {item.writer}</span>
            )}
            {item.artist && (
              <span><span className="text-gray-500">Artist</span> {item.artist}</span>
            )}
            {item.upc_isbn && (
              <span><span className="text-gray-500">ISBN</span> {item.upc_isbn}</span>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex border-t border-gray-800">
        <button
          onClick={() => onAddToWishlist(item)}
          disabled={isAdding}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-r border-gray-800 disabled:opacity-50 disabled:cursor-not-allowed ${
            status.inWishlist
              ? 'text-pink-400 hover:text-pink-300 hover:bg-gray-800'
              : 'text-gray-300 hover:text-white hover:bg-gray-800'
          }`}
        >
          {addingToWishlist ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Heart size={13} className={status.inWishlist ? 'fill-current' : ''} />
          )}
          {status.inWishlist ? 'In Wishlist' : 'Add to Wishlist'}
        </button>
        <button
          onClick={() => onAddToCollection(item)}
          disabled={isAdding}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            status.inCollection
              ? 'text-green-400 hover:text-green-300 hover:bg-gray-800'
              : 'text-gray-300 hover:text-white hover:bg-gray-800'
          }`}
        >
          {addingToCollection ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <CheckCircle2 size={13} className={status.inCollection ? 'fill-current' : ''} />
          )}
          {status.inCollection ? 'In Collection' : 'Add to Collection'}
        </button>
      </div>
    </div>
  );
}

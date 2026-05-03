import { useEffect, useState } from 'react';
import { supabase, Comic } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Trash2, X, Copy, CreditCard as Edit2, Save, Plus, Minus,
  ChevronRight, Building2, BookOpen, Bookmark, List, Layers,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';

type BrowseMode = 'browse' | 'all';
type BrowseLevel = 'publishers' | 'series' | 'stories' | 'issues';

interface PublisherGroup {
  publisher: string;
  seriesCount: number;
  issueCount: number;
}

interface SeriesGroup {
  series: string;
  storyCount: number;
  issueCount: number;
}

interface StoryGroup {
  story: string;
  issueCount: number;
  issueRange: string;
}

const UNKNOWN_PUBLISHER = 'Unknown Publisher';
const SINGLE_ISSUES = 'Single Issues';

function issueRange(comics: Comic[]): string {
  const nums = comics
    .map(c => parseFloat(c.issue_number))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
  if (nums.length === 0) return `${comics.length} issue${comics.length !== 1 ? 's' : ''}`;
  if (nums.length === 1) return `#${nums[0]}`;
  return `#${nums[0]} – #${nums[nums.length - 1]}`;
}

export function Collection() {
  const { user } = useAuth();
  const [comics, setComics] = useState<Comic[]>([]);
  const [filteredComics, setFilteredComics] = useState<Comic[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Browse hierarchy state
  const [browseMode, setBrowseMode] = useState<BrowseMode>('browse');
  const [browseLevel, setBrowseLevel] = useState<BrowseLevel>('publishers');
  const [selectedPublisher, setSelectedPublisher] = useState('');
  const [selectedSeries, setSelectedSeries] = useState('');
  const [selectedStory, setSelectedStory] = useState('');

  // Comic detail / edit state
  const [selectedComic, setSelectedComic] = useState<Comic | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedComic, setEditedComic] = useState<Comic | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; comicId: string | null }>({ isOpen: false, comicId: null });
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title?: string; message: string; type?: 'error' | 'success' | 'info' }>({
    isOpen: false,
    message: '',
  });

  useEffect(() => {
    if (!user) return;
    loadComics();
  }, [user]);

  useEffect(() => {
    if (!searchQuery) {
      setFilteredComics(comics);
      return;
    }
    const query = searchQuery.toLowerCase();
    setFilteredComics(comics.filter(
      (comic) =>
        comic.series.toLowerCase().includes(query) ||
        comic.story.toLowerCase().includes(query) ||
        comic.issue_number.toLowerCase().includes(query) ||
        comic.publisher.toLowerCase().includes(query)
    ));
  }, [searchQuery, comics]);

  const loadComics = async () => {
    try {
      const { data, error } = await supabase
        .from('comics')
        .select('*')
        .eq('user_id', user!.id)
        .order('series', { ascending: true });
      if (error) throw error;
      setComics(data || []);
      setFilteredComics(data || []);
    } catch (error) {
      console.error('Error loading comics:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived groupings (computed from in-memory comics) ──────────────────

  const publisherGroups = (): PublisherGroup[] => {
    const map = new Map<string, Set<string>>();
    const counts = new Map<string, number>();
    for (const c of comics) {
      const pub = c.publisher.trim() || UNKNOWN_PUBLISHER;
      if (!map.has(pub)) map.set(pub, new Set());
      map.get(pub)!.add(c.series);
      counts.set(pub, (counts.get(pub) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([publisher, seriesSet]) => ({
        publisher,
        seriesCount: seriesSet.size,
        issueCount: counts.get(publisher) || 0,
      }))
      .sort((a, b) => a.publisher.localeCompare(b.publisher));
  };

  const seriesGroups = (publisher: string): SeriesGroup[] => {
    const inPub = comics.filter(c =>
      (c.publisher.trim() || UNKNOWN_PUBLISHER) === publisher
    );
    const map = new Map<string, Set<string>>();
    const counts = new Map<string, number>();
    for (const c of inPub) {
      if (!map.has(c.series)) map.set(c.series, new Set());
      if (c.story.trim()) map.get(c.series)!.add(c.story.trim());
      counts.set(c.series, (counts.get(c.series) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([series, storySet]) => ({
        series,
        storyCount: storySet.size,
        issueCount: counts.get(series) || 0,
      }))
      .sort((a, b) => a.series.localeCompare(b.series));
  };

  const storyGroups = (publisher: string, series: string): StoryGroup[] => {
    const inSeries = comics.filter(c =>
      (c.publisher.trim() || UNKNOWN_PUBLISHER) === publisher && c.series === series
    );
    const map = new Map<string, Comic[]>();
    for (const c of inSeries) {
      const key = c.story.trim() || SINGLE_ISSUES;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const groups = Array.from(map.entries()).map(([story, list]) => ({
      story,
      issueCount: list.length,
      issueRange: issueRange(list),
    }));
    // Single Issues always first, then alphabetical
    return groups.sort((a, b) => {
      if (a.story === SINGLE_ISSUES) return -1;
      if (b.story === SINGLE_ISSUES) return 1;
      return a.story.localeCompare(b.story);
    });
  };

  const issueList = (publisher: string, series: string, story: string): Comic[] => {
    return comics
      .filter(c =>
        (c.publisher.trim() || UNKNOWN_PUBLISHER) === publisher &&
        c.series === series &&
        (story === SINGLE_ISSUES ? !c.story.trim() : c.story.trim() === story)
      )
      .sort((a, b) => {
        const na = parseFloat(a.issue_number);
        const nb = parseFloat(b.issue_number);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.issue_number.localeCompare(b.issue_number);
      });
  };

  // ── Navigation helpers ───────────────────────────────────────────────────

  const drillToSeries = (publisher: string) => {
    setSelectedPublisher(publisher);
    setBrowseLevel('series');
  };

  const drillToStories = (series: string) => {
    setSelectedSeries(series);
    setBrowseLevel('stories');
  };

  const drillToIssues = (story: string) => {
    setSelectedStory(story);
    setBrowseLevel('issues');
  };

  const resetBrowse = () => {
    setBrowseLevel('publishers');
    setSelectedPublisher('');
    setSelectedSeries('');
    setSelectedStory('');
  };

  const switchMode = (mode: BrowseMode) => {
    setBrowseMode(mode);
    setSearchQuery('');
    if (mode === 'browse') resetBrowse();
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const deleteComic = async (id: string) => {
    try {
      const { error } = await supabase.from('comics').delete().eq('id', id);
      if (error) throw error;
      setComics(prev => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Error deleting comic:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to delete comic', type: 'error' });
    }
  };

  const handleDeleteClick = (id: string) => setConfirmModal({ isOpen: true, comicId: id });

  const handleConfirmDelete = () => {
    if (confirmModal.comicId) {
      deleteComic(confirmModal.comicId);
      if (selectedComic?.id === confirmModal.comicId) setSelectedComic(null);
    }
  };

  const handleEditClick = () => {
    if (selectedComic) { setEditedComic({ ...selectedComic }); setIsEditing(true); }
  };

  const handleCancelEdit = () => { setIsEditing(false); setEditedComic(null); };

  const handleSaveEdit = async () => {
    if (!editedComic) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('comics')
        .update({
          series: editedComic.series.trim(),
          story: editedComic.story.trim(),
          issue_number: editedComic.issue_number.trim(),
          publisher: editedComic.publisher.trim(),
          year: editedComic.year,
          condition: editedComic.condition.trim(),
          notes: editedComic.notes.trim(),
          copy_count: editedComic.copy_count,
        })
        .eq('id', editedComic.id);
      if (error) throw error;
      setSelectedComic(editedComic);
      setComics(prev => prev.map(c => c.id === editedComic.id ? editedComic : c));
      setIsEditing(false);
      setEditedComic(null);
    } catch (error) {
      console.error('Error updating comic:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to update comic', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleIncrementCopy = async (comicId: string) => {
    try {
      const comic = comics.find(c => c.id === comicId);
      if (!comic) return;
      const newCount = comic.copy_count + 1;
      const { error } = await supabase.from('comics').update({ copy_count: newCount }).eq('id', comicId);
      if (error) throw error;
      const updated = { ...comic, copy_count: newCount };
      setComics(prev => prev.map(c => c.id === comicId ? updated : c));
      if (selectedComic?.id === comicId) setSelectedComic(updated);
      if (isEditing && editedComic?.id === comicId) setEditedComic(updated);
    } catch (error) {
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to update copy count', type: 'error' });
    }
  };

  const handleDecrementCopy = async (comicId: string) => {
    try {
      const comic = comics.find(c => c.id === comicId);
      if (!comic || comic.copy_count <= 1) return;
      const newCount = comic.copy_count - 1;
      const { error } = await supabase.from('comics').update({ copy_count: newCount }).eq('id', comicId);
      if (error) throw error;
      const updated = { ...comic, copy_count: newCount };
      setComics(prev => prev.map(c => c.id === comicId ? updated : c));
      if (selectedComic?.id === comicId) setSelectedComic(updated);
      if (isEditing && editedComic?.id === comicId) setEditedComic(updated);
    } catch (error) {
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to update copy count', type: 'error' });
    }
  };

  const conditions = ['Mint', 'Near Mint', 'Very Fine', 'Fine', 'Good', 'Fair', 'Poor'];

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // ── Comic Detail View ─────────────────────────────────────────────────────

  if (selectedComic) {
    const displayComic = isEditing && editedComic ? editedComic : selectedComic;

    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Comic Details</h1>
          <button
            onClick={() => { setSelectedComic(null); setIsEditing(false); setEditedComic(null); }}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {selectedComic.color_image_url && (
          <div className="mb-6">
            <img
              src={selectedComic.color_image_url}
              alt={selectedComic.series}
              className="w-full max-h-96 object-contain rounded-lg bg-gray-900"
            />
          </div>
        )}

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-4">
          <div>
            <div className="text-sm text-gray-400 mb-1">Series</div>
            {isEditing ? (
              <input type="text" value={displayComic.series}
                onChange={(e) => setEditedComic({ ...displayComic, series: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-lg" />
            ) : (
              <div className="text-xl font-semibold">{displayComic.series}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-1">Story</div>
            {isEditing ? (
              <input type="text" value={displayComic.story}
                onChange={(e) => setEditedComic({ ...displayComic, story: e.target.value })}
                placeholder="e.g., Kraven's Last Hunt"
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
            ) : (
              <div className="text-lg">{displayComic.story || '-'}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-1">Issue Number</div>
            {isEditing ? (
              <input type="text" value={displayComic.issue_number}
                onChange={(e) => setEditedComic({ ...displayComic, issue_number: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
            ) : (
              <div className="text-lg">#{displayComic.issue_number}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-1">Publisher</div>
            {isEditing ? (
              <input type="text" value={displayComic.publisher}
                onChange={(e) => setEditedComic({ ...displayComic, publisher: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
            ) : (
              <div className="text-lg">{displayComic.publisher || '-'}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-1">Year</div>
            {isEditing ? (
              <input type="number" value={displayComic.year || ''}
                onChange={(e) => setEditedComic({ ...displayComic, year: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
            ) : (
              <div className="text-lg">{displayComic.year || '-'}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-2">Condition</div>
            {isEditing ? (
              <div className="grid grid-cols-4 gap-2">
                {conditions.map((c) => (
                  <button key={c} type="button"
                    onClick={() => setEditedComic({ ...displayComic, condition: c })}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      displayComic.condition === c
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >{c}</button>
                ))}
              </div>
            ) : (
              <div className="text-lg">{displayComic.condition || '-'}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-2">Copies Owned</div>
            {isEditing ? (
              <div className="flex items-center gap-3">
                <button onClick={() => handleDecrementCopy(selectedComic.id)}
                  disabled={displayComic.copy_count <= 1}
                  className="p-2 bg-gray-800 text-white rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <Minus size={20} />
                </button>
                <div className="flex items-center gap-2">
                  <Copy size={20} className="text-blue-400" />
                  <span className="text-2xl font-semibold text-blue-400">{displayComic.copy_count}</span>
                </div>
                <button onClick={() => handleIncrementCopy(selectedComic.id)}
                  className="p-2 bg-gray-800 text-white rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors">
                  <Plus size={20} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Copy size={20} className="text-blue-400" />
                <span className="text-2xl font-semibold text-blue-400">{displayComic.copy_count}</span>
              </div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-1">Notes</div>
            {isEditing ? (
              <textarea value={displayComic.notes}
                onChange={(e) => setEditedComic({ ...displayComic, notes: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none" />
            ) : (
              <div className="text-lg">{displayComic.notes || '-'}</div>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {isEditing ? (
            <>
              <button onClick={handleSaveEdit} disabled={saving}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={20} />{saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={handleCancelEdit} disabled={saving}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={handleEditClick}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
                <Edit2 size={20} />Edit Comic
              </button>
              <button onClick={() => handleDeleteClick(selectedComic.id)}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
                <Trash2 size={20} />Delete Comic
              </button>
            </>
          )}
        </div>

        <ConfirmModal isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal({ isOpen: false, comicId: null })}
          onConfirm={handleConfirmDelete}
          title="Delete Comic" message="Are you sure you want to delete this comic from your collection?"
          confirmText="Delete" cancelText="Cancel" isDestructive={true} />
        <AlertModal isOpen={alertModal.isOpen}
          onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
          title={alertModal.title} message={alertModal.message} type={alertModal.type} />
      </div>
    );
  }

  // ── Shared header + mode toggle ───────────────────────────────────────────

  const renderHeader = () => (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold">My Collection</h1>
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1">
          <button
            onClick={() => switchMode('browse')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              browseMode === 'browse' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Layers size={15} />
            Browse
          </button>
          <button
            onClick={() => switchMode('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              browseMode === 'all' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <List size={15} />
            All
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder={browseMode === 'all' ? 'Search comics...' : 'Search across collection...'}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (browseMode === 'browse' && e.target.value) {
              // searching always switches to flat all-results view
              setBrowseMode('all');
            }
          }}
          className="w-full pl-10 pr-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );

  // ── Breadcrumb ────────────────────────────────────────────────────────────

  const renderBreadcrumb = () => {
    if (browseLevel === 'publishers') return null;

    const crumbs: { label: string; onClick: () => void }[] = [
      { label: 'Publishers', onClick: () => { setBrowseLevel('publishers'); setSelectedPublisher(''); setSelectedSeries(''); setSelectedStory(''); } },
    ];
    if (browseLevel === 'series' || browseLevel === 'stories' || browseLevel === 'issues') {
      crumbs.push({ label: selectedPublisher, onClick: () => { setBrowseLevel('series'); setSelectedSeries(''); setSelectedStory(''); } });
    }
    if (browseLevel === 'stories' || browseLevel === 'issues') {
      crumbs.push({ label: selectedSeries, onClick: () => { setBrowseLevel('stories'); setSelectedStory(''); } });
    }
    if (browseLevel === 'issues') {
      crumbs.push({ label: selectedStory, onClick: () => {} });
    }

    return (
      <div className="flex items-center gap-1 flex-wrap mb-4 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="text-gray-600 flex-shrink-0" />}
            {i < crumbs.length - 1 ? (
              <button
                onClick={crumb.onClick}
                className="text-blue-400 hover:text-blue-300 transition-colors truncate max-w-[140px]"
              >
                {crumb.label}
              </button>
            ) : (
              <span className="text-gray-300 truncate max-w-[160px] font-medium">{crumb.label}</span>
            )}
          </span>
        ))}
      </div>
    );
  };

  // ── Publisher level ───────────────────────────────────────────────────────

  const renderPublishers = () => {
    const groups = publisherGroups();
    if (groups.length === 0) {
      return (
        <div className="bg-gray-900 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-2">Your collection is empty</p>
          <p className="text-gray-500 text-sm">Start adding comics to build your collection</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className="text-gray-400 text-sm mb-3">
          {groups.length} {groups.length === 1 ? 'publisher' : 'publishers'}
        </div>
        {groups.map((g) => (
          <button
            key={g.publisher}
            onClick={() => drillToSeries(g.publisher)}
            className="w-full bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-blue-700 transition-colors flex items-center gap-4 text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-950 border border-blue-900 flex items-center justify-center flex-shrink-0">
              <Building2 size={20} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate">{g.publisher}</div>
              <div className="text-sm text-gray-400 mt-0.5">
                {g.seriesCount} {g.seriesCount === 1 ? 'series' : 'series'} · {g.issueCount} {g.issueCount === 1 ? 'issue' : 'issues'}
              </div>
            </div>
            <ChevronRight size={18} className="text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
    );
  };

  // ── Series level ──────────────────────────────────────────────────────────

  const renderSeries = () => {
    const groups = seriesGroups(selectedPublisher);
    return (
      <div className="space-y-2">
        <div className="text-gray-400 text-sm mb-3">
          {groups.length} {groups.length === 1 ? 'series' : 'series'} in {selectedPublisher}
        </div>
        {groups.map((g) => (
          <button
            key={g.series}
            onClick={() => drillToStories(g.series)}
            className="w-full bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-green-700 transition-colors flex items-center gap-4 text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-green-950 border border-green-900 flex items-center justify-center flex-shrink-0">
              <BookOpen size={20} className="text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate">{g.series}</div>
              <div className="text-sm text-gray-400 mt-0.5">
                {g.storyCount > 0
                  ? `${g.storyCount} ${g.storyCount === 1 ? 'story arc' : 'story arcs'} · ${g.issueCount} ${g.issueCount === 1 ? 'issue' : 'issues'}`
                  : `${g.issueCount} ${g.issueCount === 1 ? 'issue' : 'issues'}`
                }
              </div>
            </div>
            <ChevronRight size={18} className="text-gray-600 group-hover:text-green-400 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
    );
  };

  // ── Stories level ─────────────────────────────────────────────────────────

  const renderStories = () => {
    const groups = storyGroups(selectedPublisher, selectedSeries);
    return (
      <div className="space-y-2">
        <div className="text-gray-400 text-sm mb-3">
          {groups.length} {groups.length === 1 ? 'story arc' : 'story arcs'} in {selectedSeries}
        </div>
        {groups.map((g) => (
          <button
            key={g.story}
            onClick={() => drillToIssues(g.story)}
            className="w-full bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-yellow-700 transition-colors flex items-center gap-4 text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-yellow-950 border border-yellow-900 flex items-center justify-center flex-shrink-0">
              <Bookmark size={20} className="text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate">
                {g.story === SINGLE_ISSUES ? <span className="text-gray-300 not-italic">Single Issues</span> : g.story}
              </div>
              <div className="text-sm text-gray-400 mt-0.5">{g.issueRange}</div>
            </div>
            <ChevronRight size={18} className="text-gray-600 group-hover:text-yellow-400 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
    );
  };

  // ── Issues level (leaf) ───────────────────────────────────────────────────

  const renderIssues = () => {
    const list = issueList(selectedPublisher, selectedSeries, selectedStory);
    return (
      <div>
        <div className="text-gray-400 text-sm mb-3">
          {list.length} {list.length === 1 ? 'issue' : 'issues'}
        </div>
        <div className="space-y-2">
          {list.map((comic) => (
            <ComicRow
              key={comic.id}
              comic={comic}
              onSelect={() => setSelectedComic(comic)}
              onDelete={() => handleDeleteClick(comic.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  // ── Flat all-comics list ──────────────────────────────────────────────────

  const renderAllComics = () => (
    <>
      {filteredComics.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-2">
            {searchQuery ? 'No comics match your search' : 'Your collection is empty'}
          </p>
          {!searchQuery && (
            <p className="text-gray-500 text-sm">Start adding comics to build your collection</p>
          )}
        </div>
      ) : (
        <div>
          <div className="text-gray-400 text-sm mb-3">
            {filteredComics.length} {filteredComics.length === 1 ? 'comic' : 'comics'}
          </div>
          <div className="space-y-2">
            {filteredComics.map((comic) => (
              <ComicRow
                key={comic.id}
                comic={comic}
                onSelect={() => setSelectedComic(comic)}
                onDelete={() => handleDeleteClick(comic.id)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );

  // ── Root render ───────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {renderHeader()}

      {browseMode === 'browse' && (
        <>
          {renderBreadcrumb()}
          {browseLevel === 'publishers' && renderPublishers()}
          {browseLevel === 'series' && renderSeries()}
          {browseLevel === 'stories' && renderStories()}
          {browseLevel === 'issues' && renderIssues()}
        </>
      )}

      {browseMode === 'all' && renderAllComics()}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, comicId: null })}
        onConfirm={handleConfirmDelete}
        title="Delete Comic"
        message="Are you sure you want to delete this comic from your collection?"
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}

// ── Shared comic row component ────────────────────────────────────────────────

function ComicRow({ comic, onSelect, onDelete }: {
  comic: Comic;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex gap-4 items-start cursor-pointer hover:border-gray-700 transition-colors"
    >
      {comic.color_image_url && (
        <div className="relative">
          <img
            src={comic.color_image_url}
            alt={comic.series}
            className="w-16 h-24 object-cover rounded flex-shrink-0"
          />
          {comic.copy_count > 1 && (
            <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg border-2 border-gray-900">
              {comic.copy_count}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate flex items-center gap-2">
          {comic.series}
          {comic.copy_count > 1 && !comic.color_image_url && (
            <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
              <Copy size={12} />{comic.copy_count}
            </span>
          )}
        </div>
        {comic.story && (
          <div className="text-sm text-gray-300 mt-0.5 truncate italic">{comic.story}</div>
        )}
        <div className="text-sm text-gray-400 mt-1">
          {comic.issue_number && `#${comic.issue_number}`}
          {comic.issue_number && (comic.publisher || comic.year) && ' • '}
          {comic.publisher}
          {comic.publisher && comic.year && ' • '}
          {comic.year}
        </div>
        {comic.condition && (
          <div className="text-xs text-gray-500 mt-1">{comic.condition}</div>
        )}
        {comic.notes && (
          <div className="text-xs text-gray-500 mt-1 line-clamp-2">{comic.notes}</div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="ml-3 p-2 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}

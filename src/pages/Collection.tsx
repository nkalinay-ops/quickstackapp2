import { useEffect, useState } from 'react';
import { supabase, Comic } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Trash2, X, Copy, CreditCard as Edit2, Save, Plus, Minus,
  ChevronRight, Building2, BookOpen, Bookmark, List,
  Star, AlertTriangle, Camera, Loader2,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { CameraCapture } from '../components/CameraCapture';

type BrowseMode = 'publisher' | 'series' | 'all';
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
  coverUrl: string | null;
}

interface StoryGroup {
  story: string;
  issueCount: number;
  issueRange: string;
  coverUrl: string | null;
  totalIssues: number | null;
  isComplete: boolean;
  missingIssues: number[];
  hasConflict: boolean;
}

const UNKNOWN_PUBLISHER = 'Unknown Publisher';
const SINGLE_ISSUES = 'Single Issues';

// Map of publisher names (lowercase) to their primary domain for logo lookup
const PUBLISHER_DOMAINS: Record<string, string> = {
  'marvel': 'marvel.com',
  'marvel comics': 'marvel.com',
  'dc': 'dccomics.com',
  'dc comics': 'dccomics.com',
  'image': 'imagecomics.com',
  'image comics': 'imagecomics.com',
  'dark horse': 'darkhorse.com',
  'dark horse comics': 'darkhorse.com',
  'idw': 'idwpublishing.com',
  'idw publishing': 'idwpublishing.com',
  'boom': 'boom-studios.com',
  'boom! studios': 'boom-studios.com',
  'boom studios': 'boom-studios.com',
  'valiant': 'valiantentertainment.com',
  'valiant entertainment': 'valiantentertainment.com',
  'dynamite': 'dynamite.com',
  'dynamite entertainment': 'dynamite.com',
  'archie': 'archiecomics.com',
  'archie comics': 'archiecomics.com',
  'fantagraphics': 'fantagraphics.com',
  'fantagraphics books': 'fantagraphics.com',
  'oni press': 'onipress.com',
  'vault comics': 'vaultcomics.com',
  'aftershock': 'aftershockcomics.com',
  'aftershock comics': 'aftershockcomics.com',
  'titan': 'titancomics.com',
  'titan comics': 'titancomics.com',
  'zenescope': 'zenescope.com',
  'top cow': 'topcow.com',
  'top cow productions': 'topcow.com',
  'avatar press': 'avatarpress.com',
  'drawn & quarterly': 'drawnandquarterly.com',
  'drawn and quarterly': 'drawnandquarterly.com',
};

function getPublisherDomain(publisher: string): string | null {
  const key = publisher.trim().toLowerCase();
  if (PUBLISHER_DOMAINS[key]) return PUBLISHER_DOMAINS[key];
  return null;
}

function PublisherLogo({ publisher }: { publisher: string }) {
  const [stage, setStage] = useState<'clearbit' | 'google' | 'icon'>('clearbit');
  const domain = getPublisherDomain(publisher);

  if (!domain || stage === 'icon') {
    return (
      <div className="w-10 h-10 rounded-lg bg-blue-950 border border-blue-900 flex items-center justify-center flex-shrink-0">
        <Building2 size={20} className="text-blue-400" />
      </div>
    );
  }

  const src = stage === 'clearbit'
    ? `https://logo.clearbit.com/${domain}`
    : `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  return (
    <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
      <img
        src={src}
        alt={publisher}
        onError={() => setStage(stage === 'clearbit' ? 'google' : 'icon')}
        className="w-8 h-8 object-contain"
      />
    </div>
  );
}

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
  const [browseMode, setBrowseMode] = useState<BrowseMode>('publisher');
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
  const [showCamera, setShowCamera] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
    const seriesMap = new Map<string, Set<string>>();
    const issueMap = new Map<string, Set<string>>();
    for (const c of comics) {
      const pub = c.publisher.trim() || UNKNOWN_PUBLISHER;
      if (!seriesMap.has(pub)) seriesMap.set(pub, new Set());
      seriesMap.get(pub)!.add(c.series);
      if (!issueMap.has(pub)) issueMap.set(pub, new Set());
      // key by series+issue to count distinct issues across the publisher
      if (c.issue_number.trim()) issueMap.get(pub)!.add(`${c.series}::${c.issue_number.trim()}`);
    }
    return Array.from(seriesMap.entries())
      .map(([publisher, seriesSet]) => ({
        publisher,
        seriesCount: seriesSet.size,
        issueCount: issueMap.get(publisher)?.size || 0,
      }))
      .sort((a, b) => a.publisher.localeCompare(b.publisher));
  };

  const seriesGroups = (publisher: string): SeriesGroup[] => {
    const inPub = comics.filter(c =>
      (c.publisher.trim() || UNKNOWN_PUBLISHER) === publisher
    );
    const storyMap = new Map<string, Set<string>>();
    const issueMap = new Map<string, Set<string>>();
    for (const c of inPub) {
      if (!storyMap.has(c.series)) storyMap.set(c.series, new Set());
      if (c.story.trim()) storyMap.get(c.series)!.add(c.story.trim());
      if (!issueMap.has(c.series)) issueMap.set(c.series, new Set());
      if (c.issue_number.trim()) issueMap.get(c.series)!.add(c.issue_number.trim());
    }
    const withCovers = inPub.filter(c => c.color_image_url || c.bw_image_url);
    return Array.from(storyMap.entries())
      .map(([series, storySet]) => {
        const candidates = withCovers.filter(c => c.series === series);
        const pick = candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : null;
        return {
          series,
          storyCount: storySet.size,
          issueCount: issueMap.get(series)?.size || 0,
          coverUrl: pick ? (pick.color_image_url || pick.bw_image_url) : null,
        };
      })
      .sort((a, b) => a.series.localeCompare(b.series));
  };

  // All series across all publishers (for the Series browse root)
  const seriesRootGroups = (): SeriesGroup[] => {
    const storyMap = new Map<string, Set<string>>();
    const issueMap = new Map<string, Set<string>>();
    for (const c of comics) {
      if (!storyMap.has(c.series)) storyMap.set(c.series, new Set());
      if (c.story.trim()) storyMap.get(c.series)!.add(c.story.trim());
      if (!issueMap.has(c.series)) issueMap.set(c.series, new Set());
      if (c.issue_number.trim()) issueMap.get(c.series)!.add(c.issue_number.trim());
    }
    const withCovers = comics.filter(c => c.color_image_url || c.bw_image_url);
    return Array.from(storyMap.entries())
      .map(([series, storySet]) => {
        const candidates = withCovers.filter(c => c.series === series);
        const pick = candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : null;
        return {
          series,
          storyCount: storySet.size,
          issueCount: issueMap.get(series)?.size || 0,
          coverUrl: pick ? (pick.color_image_url || pick.bw_image_url) : null,
        };
      })
      .sort((a, b) => a.series.localeCompare(b.series));
  };

  const storyGroups = (publisher: string, series: string): StoryGroup[] => {
    const inSeries = comics.filter(c =>
      (publisher === '' || (c.publisher.trim() || UNKNOWN_PUBLISHER) === publisher) &&
      c.series === series
    );
    const map = new Map<string, Comic[]>();
    for (const c of inSeries) {
      const key = c.story.trim() || SINGLE_ISSUES;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const groups = Array.from(map.entries()).map(([story, list]) => {
      const cover = list.find(c => c.color_image_url || c.bw_image_url);

      // Use the max total_issues value across issues in this arc
      const totals = list.map(c => c.total_issues).filter((t): t is number => t !== null && t !== undefined);
      const totalIssues = totals.length > 0 ? Math.max(...totals) : null;

      // Conflict: any comic in the arc has total_issues_conflict flag, or totals disagree
      const hasConflict = list.some(c => c.total_issues_conflict === true) ||
        (totals.length > 1 && new Set(totals).size > 1);

      // Compute missing issue numbers when total is known
      let missingIssues: number[] = [];
      if (totalIssues !== null) {
        const owned = new Set(
          list.map(c => parseFloat(c.issue_number)).filter(n => !isNaN(n) && Number.isInteger(n))
        );
        for (let i = 1; i <= totalIssues; i++) {
          if (!owned.has(i)) missingIssues.push(i);
        }
      }

      // Count distinct issue numbers (ignore duplicates / extra copies)
      const distinctIssueCount = new Set(
        list.map(c => c.issue_number.trim()).filter(n => n !== '')
      ).size || list.length;

      // Deduplicate list by issue_number for range display
      const seenIssues = new Set<string>();
      const dedupedList = list.filter(c => {
        const key = c.issue_number.trim();
        if (seenIssues.has(key)) return false;
        seenIssues.add(key);
        return true;
      });

      const isComplete = totalIssues !== null && missingIssues.length === 0 && distinctIssueCount >= totalIssues;

      return {
        story,
        issueCount: distinctIssueCount,
        issueRange: issueRange(dedupedList),
        coverUrl: cover ? (cover.color_image_url || cover.bw_image_url) : null,
        totalIssues,
        isComplete,
        missingIssues,
        hasConflict,
      };
    });
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
        (publisher === '' || (c.publisher.trim() || UNKNOWN_PUBLISHER) === publisher) &&
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

  const drillToStoriesFromRoot = (series: string) => {
    setSelectedPublisher('');
    setSelectedSeries(series);
    setBrowseLevel('stories');
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
    if (mode === 'publisher') {
      resetBrowse();
    } else if (mode === 'series') {
      setBrowseLevel('series');
      setSelectedPublisher('');
      setSelectedSeries('');
      setSelectedStory('');
    }
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
          cover_variant: editedComic.cover_variant,
          total_issues: editedComic.total_issues,
          total_issues_conflict: editedComic.total_issues_conflict,
          purchase_price: editedComic.purchase_price,
          purchase_date: editedComic.purchase_date,
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

  const handlePhotoCapture = async (imageDataUrl: string) => {
    if (!selectedComic || !user) return;
    setShowCamera(false);
    setUploadingPhoto(true);
    try {
      const base64Data = imageDataUrl.split(',')[1];
      const byteNumbers = atob(base64Data).split('').map(c => c.charCodeAt(0));
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
      const fileName = `${user.id}/${Date.now()}_color.jpg`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('comic-covers')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('comic-covers')
        .getPublicUrl(uploadData.path);

      const newUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('comics')
        .update({ color_image_url: newUrl })
        .eq('id', selectedComic.id);

      if (updateError) throw updateError;

      const updated = { ...selectedComic, color_image_url: newUrl };
      setSelectedComic(updated);
      setComics(prev => prev.map(c => c.id === selectedComic.id ? updated : c));
      if (editedComic?.id === selectedComic.id) setEditedComic(updated);
    } catch (err) {
      console.error('Photo upload failed:', err);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to save photo', type: 'error' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const conditions = ['Mint', 'Near Mint', 'Very Fine', 'Very Good', 'Fine', 'Good', 'Fair', 'Poor'];

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
      <>
        {showCamera && (
          <CameraCapture
            onCapture={handlePhotoCapture}
            onClose={() => setShowCamera(false)}
          />
        )}
      <div className="p-4 max-w-2xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Comic Details</h1>
          <button
            onClick={() => { setSelectedComic(null); setIsEditing(false); setEditedComic(null); setShowCamera(false); }}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mb-6">
          {selectedComic.color_image_url ? (
            <div className="relative group">
              <img
                src={selectedComic.color_image_url}
                alt={selectedComic.series}
                className="w-full max-h-96 object-contain rounded-lg bg-gray-900"
              />
              {isEditing && (
                <button
                  onClick={() => setShowCamera(true)}
                  disabled={uploadingPhoto}
                  className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-2 bg-gray-900/80 hover:bg-gray-800 text-white text-sm rounded-lg border border-gray-700 transition-colors disabled:opacity-50"
                >
                  {uploadingPhoto ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  {uploadingPhoto ? 'Saving...' : 'Replace Photo'}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowCamera(true)}
              disabled={uploadingPhoto}
              className="w-full h-40 rounded-lg bg-gray-900 border-2 border-dashed border-gray-700 hover:border-gray-500 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              {uploadingPhoto ? (
                <><Loader2 size={28} className="animate-spin" /><span className="text-sm">Saving photo...</span></>
              ) : (
                <><Camera size={28} /><span className="text-sm">Take a Photo</span></>
              )}
            </button>
          )}
        </div>

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
            <div className="text-sm text-gray-400 mb-1">Cover Variant</div>
            {isEditing ? (
              <input type="number" min="1" value={displayComic.cover_variant ?? ''}
                onChange={(e) => setEditedComic({ ...displayComic, cover_variant: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="e.g., 2"
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
            ) : (
              <div className="text-lg">{displayComic.cover_variant != null ? `Variant ${displayComic.cover_variant}` : '-'}</div>
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
            <div className="text-sm text-gray-400 mb-1">Total Issues in Arc</div>
            {isEditing ? (
              <input type="number" min="1" value={displayComic.total_issues ?? ''}
                onChange={(e) => setEditedComic({ ...displayComic, total_issues: e.target.value ? parseInt(e.target.value) : null, total_issues_conflict: null })}
                placeholder="e.g., 6"
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none" />
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-lg">{displayComic.total_issues ?? '-'}</div>
                {displayComic.total_issues_conflict && (
                  <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded">
                    <AlertTriangle size={11} />Conflict — please verify
                  </span>
                )}
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

          {/* Purchase Info */}
          <div className="border-t border-gray-800 pt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Purchase Info</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">Price Paid (USD)</div>
                {isEditing ? (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={displayComic.purchase_price ?? ''}
                      onChange={(e) => setEditedComic({ ...displayComic, purchase_price: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="text-lg">
                    {displayComic.purchase_price != null
                      ? `$${displayComic.purchase_price.toFixed(2)}`
                      : '-'}
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">Purchase Date</div>
                {isEditing ? (
                  <input
                    type="date"
                    value={displayComic.purchase_date ?? ''}
                    onChange={(e) => setEditedComic({ ...displayComic, purchase_date: e.target.value || null })}
                    className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                  />
                ) : (
                  <div className="text-lg">
                    {displayComic.purchase_date
                      ? new Date(displayComic.purchase_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
                      : '-'}
                  </div>
                )}
              </div>
            </div>
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
      </>
    );
  }

  // ── Shared header + mode toggle ───────────────────────────────────────────

  const renderHeader = () => (
    <div className="mb-4">
      <h1 className="text-3xl font-bold mb-3">My Collection</h1>
      <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1 mb-4">
        <button
          onClick={() => switchMode('publisher')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            browseMode === 'publisher' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Building2 size={15} />
          Publisher
        </button>
        <button
          onClick={() => switchMode('series')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            browseMode === 'series' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <BookOpen size={15} />
          Series
        </button>
        <button
          onClick={() => switchMode('all')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            browseMode === 'all' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <List size={15} />
          All
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder={browseMode === 'all' ? 'Search comics...' : 'Search across collection...'}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (browseMode !== 'all' && e.target.value) {
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
    const isSeriesRoot = browseMode === 'series';

    // Series-root browse: Series → Stories → Issues (no publisher level)
    if (isSeriesRoot) {
      if (browseLevel === 'series') return null;
      const crumbs: { label: string; onClick: () => void }[] = [
        { label: 'Series', onClick: () => { setBrowseLevel('series'); setSelectedSeries(''); setSelectedStory(''); } },
      ];
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
                <button onClick={crumb.onClick} className="text-blue-400 hover:text-blue-300 transition-colors truncate max-w-[140px]">
                  {crumb.label}
                </button>
              ) : (
                <span className="text-gray-300 truncate max-w-[160px] font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      );
    }

    // Publisher-root browse
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
            <PublisherLogo publisher={g.publisher} />
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
            {g.coverUrl ? (
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700">
                <img
                  src={g.coverUrl}
                  alt={g.series}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-green-950 border border-green-900 flex items-center justify-center flex-shrink-0">
                <BookOpen size={20} className="text-green-400" />
              </div>
            )}
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
            className={`w-full bg-gray-900 rounded-lg p-4 border transition-colors flex items-center gap-4 text-left group ${
              g.isComplete
                ? 'border-green-800 hover:border-green-600'
                : g.hasConflict
                  ? 'border-amber-800 hover:border-amber-600'
                  : 'border-gray-800 hover:border-yellow-700'
            }`}
          >
            {/* Cover image or icon */}
            <div className="relative flex-shrink-0">
              {g.coverUrl ? (
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-700">
                  <img src={g.coverUrl} alt={g.story} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
                  g.isComplete ? 'bg-green-950 border-green-800' : 'bg-yellow-950 border-yellow-900'
                }`}>
                  <Bookmark size={20} className={g.isComplete ? 'text-green-400' : 'text-yellow-400'} />
                </div>
              )}
              {/* Completion star badge */}
              {g.isComplete && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow-lg border-2 border-gray-900">
                  <Star size={10} className="text-white fill-white" />
                </div>
              )}
              {/* Incomplete indicator dot */}
              {!g.isComplete && g.totalIssues !== null && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-lg border-2 border-gray-900">
                  <span className="text-white text-[9px] font-bold leading-none">!</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* Title row with conflict warning */}
              <div className="flex items-center gap-1.5">
                <div className="font-semibold text-white truncate">
                  {g.story === SINGLE_ISSUES ? <span className="text-gray-300 not-italic">Single Issues</span> : g.story}
                </div>
                {g.hasConflict && (
                  <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" title="Total issues count conflict — tap to review" />
                )}
              </div>

              {/* Issue range / ownership line */}
              <div className="text-sm text-gray-400 mt-0.5">
                {g.totalIssues !== null ? (
                  <span className={g.isComplete ? 'text-green-400' : 'text-amber-400'}>
                    {g.issueCount} of {g.totalIssues} issue{g.totalIssues !== 1 ? 's' : ''}
                  </span>
                ) : (
                  g.issueRange
                )}
              </div>

              {/* Missing issues line */}
              {!g.isComplete && g.missingIssues.length > 0 && g.missingIssues.length <= 8 && (
                <div className="text-xs text-red-400 mt-0.5">
                  Missing: {g.missingIssues.map(n => `#${n}`).join(', ')}
                </div>
              )}
              {!g.isComplete && g.missingIssues.length > 8 && (
                <div className="text-xs text-red-400 mt-0.5">
                  Missing {g.missingIssues.length} issues · {g.missingIssues.slice(0, 5).map(n => `#${n}`).join(', ')}…
                </div>
              )}

              {/* Complete label */}
              {g.isComplete && (
                <div className="text-xs text-green-400 mt-0.5 font-medium">Complete</div>
              )}
            </div>

            <ChevronRight size={18} className={`transition-colors flex-shrink-0 ${
              g.isComplete ? 'text-green-600 group-hover:text-green-400' : 'text-gray-600 group-hover:text-yellow-400'
            }`} />
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

  // ── Series root list (all series, no publisher filter) ───────────────────

  const renderSeriesRoot = () => {
    const groups = seriesRootGroups();
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
          {groups.length} {groups.length === 1 ? 'series' : 'series'}
        </div>
        {groups.map((g) => (
          <button
            key={g.series}
            onClick={() => drillToStoriesFromRoot(g.series)}
            className="w-full bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-green-700 transition-colors flex items-center gap-4 text-left group"
          >
            {g.coverUrl ? (
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-gray-700">
                <img src={g.coverUrl} alt={g.series} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-green-950 border border-green-900 flex items-center justify-center flex-shrink-0">
                <BookOpen size={20} className="text-green-400" />
              </div>
            )}
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

      {browseMode === 'publisher' && (
        <>
          {renderBreadcrumb()}
          {browseLevel === 'publishers' && renderPublishers()}
          {browseLevel === 'series' && renderSeries()}
          {browseLevel === 'stories' && renderStories()}
          {browseLevel === 'issues' && renderIssues()}
        </>
      )}

      {browseMode === 'series' && (
        <>
          {renderBreadcrumb()}
          {browseLevel === 'series' && renderSeriesRoot()}
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
          {comic.cover_variant != null && ` · Variant ${comic.cover_variant}`}
          {(comic.issue_number || comic.cover_variant != null) && (comic.publisher || comic.year) && ' • '}
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

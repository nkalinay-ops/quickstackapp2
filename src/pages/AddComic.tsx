import { useState, useEffect, useRef } from 'react';
import { supabase, Comic } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, Plus, Camera, Scan, X, AlertTriangle, Zap, Library, Heart, ScanLine } from 'lucide-react';
import { CameraCapture } from '../components/CameraCapture';
import { optimizeImageForOCR } from '../utils/imageOptimizer';
import DuplicateModal from '../components/DuplicateModal';
import { AlertModal } from '../components/AlertModal';

const FREE_SCAN_LIMIT = 20;

type Mode = 'collection' | 'wishlist';

export function AddComic() {
  const { user, userTier } = useAuth();
  const [mode, setMode] = useState<Mode>('collection');

  // Shared fields
  const [series, setSeries] = useState('');
  const [story, setStory] = useState('');
  const [issueNumber, setIssueNumber] = useState('');
  const [publisher, setPublisher] = useState('');
  const [totalIssues, setTotalIssues] = useState('');
  const [coverVariant, setCoverVariant] = useState('');
  const [notes, setNotes] = useState('');

  // Collection-only fields
  const [year, setYear] = useState('');
  const [condition, setCondition] = useState('');

  // Wishlist-only fields
  const [priority, setPriority] = useState('Medium');

  // UI state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [duplicateComic, setDuplicateComic] = useState<Comic | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [totalIssuesConflict, setTotalIssuesConflict] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title?: string; message: string; type?: 'error' | 'success' | 'info' }>({
    isOpen: false,
    message: '',
  });
  const [monthlyScanCount, setMonthlyScanCount] = useState<number | null>(null);
  const [scanRenewalInterval, setScanRenewalInterval] = useState<'month' | 'day'>('month');
  const pendingScanNext = useRef(false);
  const scanButtonRef = useRef<HTMLButtonElement>(null);
  const seriesInputRef = useRef<HTMLInputElement>(null);

  const focusScanButton = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    scanButtonRef.current?.focus();
  };

  useEffect(() => {
    scanButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!user || userTier !== 'free') return;
    supabase
      .rpc('get_user_scan_info', { p_user_id: user.id })
      .then(({ data }) => {
        if (data) {
          setMonthlyScanCount(data.monthly_scan_count ?? 0);
          setScanRenewalInterval(data.renewal_interval === 'day' ? 'day' : 'month');
        }
      });
  }, [user, userTier]);

  const resetForm = () => {
    setSeries('');
    setStory('');
    setIssueNumber('');
    setPublisher('');
    setYear('');
    setCondition('');
    setNotes('');
    setTotalIssues('');
    setCoverVariant('');
    setTotalIssuesConflict(false);
    setCapturedImage(null);
    setPriority('Medium');
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setSuccess(false);
    // Clear image when switching to wishlist — image upload is collection-only
    if (newMode === 'wishlist') setCapturedImage(null);
  };

  const checkForDuplicates = async (comicSeries: string, comicIssueNumber: string, comicStory = ''): Promise<Comic | null> => {
    if (!user || !comicSeries.trim() || !comicIssueNumber.trim()) return null;
    try {
      const { data, error } = await supabase
        .from('comics')
        .select('*')
        .eq('user_id', user.id)
        .ilike('series', comicSeries.trim())
        .ilike('issue_number', comicIssueNumber.trim())
        .ilike('story', comicStory.trim())
        .maybeSingle();
      if (error) return null;
      return data;
    } catch {
      return null;
    }
  };

  const handleCameraCapture = async (imageDataUrl: string) => {
    setShowCamera(false);
    setCapturedImage(imageDataUrl);
    setScanning(true);

    try {
      const optimized = await optimizeImageForOCR(imageDataUrl);

      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-comic`;
      const headers = {
        'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageData: optimized.dataUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 429 && result.limitReached) {
          setMonthlyScanCount(FREE_SCAN_LIMIT);
          const resetMsg = scanRenewalInterval === 'day'
            ? 'Your limit resets tomorrow at midnight.'
            : 'Your limit resets on the 1st of next month.';
          setAlertModal({
            isOpen: true,
            title: 'Scan Limit Reached',
            message: `You have used all ${FREE_SCAN_LIMIT} scans for this period. ${resetMsg} Please enter comic details manually, or upgrade to a paid plan for unlimited scans.`,
            type: 'info',
          });
        } else {
          const errorMessage = result.detail || result.error || 'Failed to scan comic';
          setAlertModal({
            isOpen: true,
            title: 'Scanning Failed',
            message: `${errorMessage}\n\nPlease try again with better lighting or enter details manually.`,
            type: 'error',
          });
        }
        // Clear the captured image on failure so the scan button reappears
        setCapturedImage(null);
        return;
      }

      if (result.success && result.data) {
        if (result.scan_info && userTier === 'free') {
          setMonthlyScanCount(result.scan_info.monthly_scan_count ?? null);
        }
        const scannedSeries = result.data.series || '';
        const scannedIssue = result.data.issue_number || '';

        setSeries(scannedSeries);
        setStory(result.data.story || '');
        setIssueNumber(scannedIssue);
        setPublisher(result.data.publisher || '');
        setYear(result.data.year ? result.data.year.toString() : '');
        const scannedTotal = result.data.total_issues ?? null;
        setTotalIssues(scannedTotal ? scannedTotal.toString() : '');
        setCoverVariant(result.data.cover_variant ? result.data.cover_variant.toString() : '');

        if (scannedTotal && result.data.story !== undefined) {
          const conflict = await checkTotalIssuesConflict(result.data.series || '', result.data.story || '', scannedTotal);
          setTotalIssuesConflict(conflict);
        }

        // Only check duplicates when in collection mode
        if (mode === 'collection' && scannedSeries && scannedIssue) {
          setCheckingDuplicate(true);
          const duplicate = await checkForDuplicates(scannedSeries, scannedIssue, result.data.story || '');
          setCheckingDuplicate(false);
          if (duplicate) {
            setDuplicateComic(duplicate);
            setShowDuplicateModal(true);
          } else {
            seriesInputRef.current?.focus();
          }
        } else if (!scannedSeries && !scannedIssue) {
          setAlertModal({
            isOpen: true,
            title: 'Incomplete Scan',
            message: 'Could not extract all details from the image. Please review and fill in any missing information.',
            type: 'info',
          });
        } else {
          seriesInputRef.current?.focus();
        }
      } else {
        setAlertModal({
          isOpen: true,
          title: 'Scan Failed',
          message: 'Could not extract comic details. Please enter manually.',
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error scanning comic:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'An unexpected error occurred while scanning. Please enter details manually.',
        type: 'error',
      });
    } finally {
      setScanning(false);
    }
  };

  const convertToBlackAndWhite = async (imageDataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(imageDataUrl); return; }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = gray; data[i + 1] = gray; data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = imageDataUrl;
    });
  };

  const uploadImages = async (imageDataUrl: string): Promise<{ colorUrl: string; bwUrl: string }> => {
    if (!user) throw new Error('User not authenticated');
    const timestamp = Date.now();

    const base64Data = imageDataUrl.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const colorBlob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });

    const colorFileName = `${user.id}/${timestamp}_color.jpg`;
    const { data: colorData, error: colorError } = await supabase.storage
      .from('comic-covers').upload(colorFileName, colorBlob, { contentType: 'image/jpeg', upsert: false });
    if (colorError) throw colorError;
    const { data: colorUrlData } = supabase.storage.from('comic-covers').getPublicUrl(colorData.path);

    const bwImageData = await convertToBlackAndWhite(imageDataUrl);
    const bwBase64 = bwImageData.split(',')[1];
    const bwChars = atob(bwBase64);
    const bwBytes = new Array(bwChars.length);
    for (let i = 0; i < bwChars.length; i++) bwBytes[i] = bwChars.charCodeAt(i);
    const bwBlob = new Blob([new Uint8Array(bwBytes)], { type: 'image/jpeg' });

    const bwFileName = `${user.id}/${timestamp}_bw.jpg`;
    const { data: bwData, error: bwError } = await supabase.storage
      .from('comic-covers').upload(bwFileName, bwBlob, { contentType: 'image/jpeg', upsert: false });
    if (bwError) throw bwError;
    const { data: bwUrlData } = supabase.storage.from('comic-covers').getPublicUrl(bwData.path);

    return { colorUrl: colorUrlData.publicUrl, bwUrl: bwUrlData.publicUrl };
  };

  const checkTotalIssuesConflict = async (
    comicSeries: string,
    comicStory: string,
    newTotal: number | null
  ): Promise<boolean> => {
    if (!user || newTotal === null) return false;
    try {
      const { data } = await supabase
        .from('comics')
        .select('total_issues')
        .eq('user_id', user.id)
        .ilike('series', comicSeries.trim())
        .ilike('story', comicStory.trim())
        .not('total_issues', 'is', null)
        .limit(1)
        .maybeSingle();
      if (data && data.total_issues !== newTotal) return true;
    } catch {
      // non-critical
    }
    return false;
  };

  const handleIncreaseCopyCount = async () => {
    if (!duplicateComic) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('comics')
        .update({ copy_count: duplicateComic.copy_count + 1 })
        .eq('id', duplicateComic.id);
      if (error) throw error;
      setShowDuplicateModal(false);
      setSuccess(true);
      resetForm();
      setDuplicateComic(null);
      if (pendingScanNext.current) {
        pendingScanNext.current = false;
        setSuccess(false);
        setShowCamera(true);
      } else {
        focusScanButton();
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error updating copy count:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to update copy count', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const insertCollectionComic = async (imageSnapshot: string | null) => {
    let colorImageUrl: string | null = null;
    let bwImageUrl: string | null = null;
    if (imageSnapshot) {
      const { colorUrl, bwUrl } = await uploadImages(imageSnapshot);
      colorImageUrl = colorUrl;
      bwImageUrl = bwUrl;
    }
    const parsedTotal = totalIssues ? parseInt(totalIssues) : null;
    const conflict = await checkTotalIssuesConflict(series, story, parsedTotal);
    const { error } = await supabase.from('comics').insert({
      user_id: user!.id,
      series: series.trim(),
      story: story.trim(),
      issue_number: issueNumber.trim(),
      publisher: publisher.trim(),
      year: year ? parseInt(year) : null,
      condition: condition.trim(),
      notes: notes.trim(),
      color_image_url: colorImageUrl,
      bw_image_url: bwImageUrl,
      copy_count: 1,
      cover_variant: coverVariant ? parseInt(coverVariant) : null,
      total_issues: parsedTotal,
      total_issues_conflict: conflict || null,
    });
    if (error) throw error;
  };

  const handleAddAsSeparate = async () => {
    const imageSnapshot = capturedImage;
    setShowDuplicateModal(false);
    setDuplicateComic(null);
    setLoading(true);
    setSuccess(false);
    try {
      await insertCollectionComic(imageSnapshot);
      setSuccess(true);
      resetForm();
      if (pendingScanNext.current) {
        pendingScanNext.current = false;
        setSuccess(false);
        setShowCamera(true);
      } else {
        focusScanButton();
        setTimeout(() => setSuccess(false), 2000);
      }
    } catch (error) {
      console.error('Error adding comic:', error);
      pendingScanNext.current = false;
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to add comic', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDuplicateModal = () => {
    setShowDuplicateModal(false);
    setDuplicateComic(null);
    // capturedImage and form fields are preserved so the user can still act
  };

  const handleDiscardScan = () => {
    setShowDuplicateModal(false);
    setDuplicateComic(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !series.trim()) return;

    if (mode === 'collection') {
      const imageSnapshot = capturedImage;
      // Duplicate check before inserting into collection
      if (series.trim() && issueNumber.trim()) {
        setCheckingDuplicate(true);
        const duplicate = await checkForDuplicates(series, issueNumber, story);
        setCheckingDuplicate(false);
        if (duplicate) {
          setDuplicateComic(duplicate);
          setShowDuplicateModal(true);
          return;
        }
      }

      setLoading(true);
      setSuccess(false);
      try {
        await insertCollectionComic(imageSnapshot);
        setSuccess(true);
        resetForm();
        if (pendingScanNext.current) {
          pendingScanNext.current = false;
          setSuccess(false);
          setShowCamera(true);
        } else {
          focusScanButton();
          setTimeout(() => setSuccess(false), 2000);
        }
      } catch (error) {
        console.error('Error adding comic:', error);
        pendingScanNext.current = false;
        setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to add comic', type: 'error' });
      } finally {
        setLoading(false);
      }
    } else {
      // Wishlist insert
      setLoading(true);
      setSuccess(false);
      try {
        const { error } = await supabase.from('wishlist').insert({
          user_id: user.id,
          series: series.trim(),
          story: story.trim(),
          issue_number: issueNumber.trim(),
          publisher: publisher.trim(),
          priority,
          notes: notes.trim(),
          total_issues: totalIssues ? parseInt(totalIssues) : null,
          cover_variant: coverVariant ? parseInt(coverVariant) : null,
        });
        if (error) throw error;
        setSuccess(true);
        resetForm();
        setTimeout(() => setSuccess(false), 2000);
      } catch (error) {
        console.error('Error adding to wishlist:', error);
        setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to add to wishlist', type: 'error' });
      } finally {
        setLoading(false);
      }
    }
  };

  const conditions = ['Mint', 'Near Mint', 'Very Fine', 'Very Good', 'Fine', 'Good', 'Fair', 'Poor'];

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  const scanLimitReached = userTier === 'free' && monthlyScanCount !== null && monthlyScanCount >= FREE_SCAN_LIMIT;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">Add Comic</h1>
        <p className="text-gray-400">
          {mode === 'collection' ? 'Add to your collection' : 'Add to your wishlist'}
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="mb-6 relative bg-gray-900 border border-gray-800 rounded-xl p-1 flex">
        {/* Sliding pill */}
        <div
          className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ease-in-out ${
            mode === 'collection' ? 'left-1 bg-blue-600' : 'left-[calc(50%+3px)] bg-rose-600'
          }`}
        />
        <button
          type="button"
          onClick={() => switchMode('collection')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-200 ${
            mode === 'collection' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Library size={16} />
          Collection
        </button>
        <button
          type="button"
          onClick={() => switchMode('wishlist')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-200 ${
            mode === 'wishlist' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Heart size={16} />
          Wishlist
        </button>
      </div>

      {/* Scan / Camera section (collection only) */}
      {mode === 'collection' && (
        <div className="mb-6">
          {capturedImage ? (
            <div className="relative bg-gray-900 border border-gray-800 rounded-lg p-4">
              <button
                type="button"
                onClick={() => setCapturedImage(null)}
                className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors z-10"
              >
                <X size={20} />
              </button>
              <img
                src={capturedImage}
                alt="Captured comic cover"
                className="w-full h-64 object-contain rounded-lg"
              />
              <p className="text-center text-green-400 text-sm mt-3">
                Color photo captured — will be saved with comic
              </p>
            </div>
          ) : (
            <>
              {userTier === 'free' && monthlyScanCount !== null && (
                <div className={`mb-3 flex items-center justify-between px-4 py-2 rounded-lg border text-sm ${
                  scanLimitReached
                    ? 'bg-red-950 border-red-800 text-red-400'
                    : monthlyScanCount >= FREE_SCAN_LIMIT - 3
                    ? 'bg-amber-950 border-amber-800 text-amber-400'
                    : 'bg-gray-900 border-gray-800 text-gray-400'
                }`}>
                  <span>
                    {scanLimitReached
                      ? `${scanRenewalInterval === 'day' ? 'Daily' : 'Monthly'} scan limit reached`
                      : `${monthlyScanCount} of ${FREE_SCAN_LIMIT} scans used this ${scanRenewalInterval === 'day' ? 'day' : 'month'}`}
                  </span>
                  {scanLimitReached && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
                      <Zap size={12} />
                      Upgrade for unlimited
                    </span>
                  )}
                </div>
              )}
              <button
                ref={scanButtonRef}
                type="button"
                onClick={() => setShowCamera(true)}
                disabled={scanning || scanLimitReached}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {scanning ? (
                  <>
                    <Scan size={24} className="animate-pulse" />
                    Scanning Comic Cover...
                  </>
                ) : (
                  <>
                    <Camera size={24} />
                    Scan Comic Cover
                  </>
                )}
              </button>
              <p className="text-center text-gray-500 text-sm mt-2">
                Take a photo to auto-fill details
              </p>
            </>
          )}
        </div>
      )}

      {/* Scan in wishlist mode — OCR only, no image stored */}
      {mode === 'wishlist' && (
        <div className="mb-6">
          {!capturedImage ? (
            <>
              {userTier === 'free' && monthlyScanCount !== null && (
                <div className={`mb-3 flex items-center justify-between px-4 py-2 rounded-lg border text-sm ${
                  scanLimitReached
                    ? 'bg-red-950 border-red-800 text-red-400'
                    : monthlyScanCount >= FREE_SCAN_LIMIT - 3
                    ? 'bg-amber-950 border-amber-800 text-amber-400'
                    : 'bg-gray-900 border-gray-800 text-gray-400'
                }`}>
                  <span>
                    {scanLimitReached
                      ? `${scanRenewalInterval === 'day' ? 'Daily' : 'Monthly'} scan limit reached`
                      : `${monthlyScanCount} of ${FREE_SCAN_LIMIT} scans used this ${scanRenewalInterval === 'day' ? 'day' : 'month'}`}
                  </span>
                  {scanLimitReached && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
                      <Zap size={12} />
                      Upgrade for unlimited
                    </span>
                  )}
                </div>
              )}
              <button
                ref={scanButtonRef}
                type="button"
                onClick={() => setShowCamera(true)}
                disabled={scanning || scanLimitReached}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {scanning ? (
                  <>
                    <Scan size={24} className="animate-pulse" />
                    Scanning Comic Cover...
                  </>
                ) : (
                  <>
                    <Camera size={24} />
                    Scan to Fill Details
                  </>
                )}
              </button>
              <p className="text-center text-gray-500 text-sm mt-2">
                Photo used only to read text — not stored on wishlist items
              </p>
            </>
          ) : (
            // After scan in wishlist mode, show brief confirmation then clear image
            <div className="bg-green-950 border border-green-900 rounded-lg p-3 flex items-center justify-between">
              <p className="text-green-400 text-sm">Cover scanned — details filled below</p>
              <button
                type="button"
                onClick={() => setCapturedImage(null)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {scanning && (
        <div className="mb-6 bg-blue-950 border border-blue-900 rounded-lg p-4 text-center">
          <p className="text-blue-400">Analyzing comic cover...</p>
        </div>
      )}

      {checkingDuplicate && (
        <div className="mb-6 bg-yellow-950 border border-yellow-900 rounded-lg p-4 text-center">
          <p className="text-yellow-400">Checking for duplicates...</p>
        </div>
      )}

      {/* Form */}
      <form id="add-comic-form" onSubmit={handleSubmit} className="space-y-4">
        {/* --- Shared fields --- */}
        <div>
          <label htmlFor="series" className="block text-sm font-medium text-gray-300 mb-1">
            Series <span className="text-red-400">*</span>
          </label>
          <input
            ref={seriesInputRef}
            id="series"
            type="text"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
            required
            placeholder="e.g., The Amazing Spider-Man"
            className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          />
        </div>

        <div>
          <label htmlFor="story" className="block text-sm font-medium text-gray-300 mb-1">
            Story
          </label>
          <input
            id="story"
            type="text"
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="e.g., Kraven's Last Hunt"
            className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="issue" className="block text-sm font-medium text-gray-300 mb-1">
              Issue #
            </label>
            <input
              id="issue"
              type="text"
              value={issueNumber}
              onChange={(e) => setIssueNumber(e.target.value)}
              placeholder="300"
              className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="publisher" className="block text-sm font-medium text-gray-300 mb-1">
              Publisher
            </label>
            <input
              id="publisher"
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="e.g., Marvel, DC"
              className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="coverVariant" className="block text-sm font-medium text-gray-300 mb-1">
            Cover Variant
            <span className="ml-2 text-xs text-gray-500 font-normal">optional · e.g. 1, 2, 3</span>
          </label>
          <input
            id="coverVariant"
            type="number"
            min="1"
            value={coverVariant}
            onChange={(e) => setCoverVariant(e.target.value)}
            placeholder="e.g., 2"
            className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="totalIssues" className="block text-sm font-medium text-gray-300 mb-1">
            Total Issues in Arc
            <span className="ml-2 text-xs text-gray-500 font-normal">optional · e.g. "4" if cover says "#2 of 4"</span>
          </label>
          <input
            id="totalIssues"
            type="number"
            min="1"
            value={totalIssues}
            onChange={(e) => { setTotalIssues(e.target.value); setTotalIssuesConflict(false); }}
            placeholder="e.g., 6"
            className={`w-full px-4 py-3 bg-gray-900 text-white rounded-lg border focus:outline-none focus:ring-2 transition-colors ${
              totalIssuesConflict
                ? 'border-amber-600 focus:border-amber-500 focus:ring-amber-500'
                : 'border-gray-800 focus:border-blue-500 focus:ring-blue-500'
            }`}
          />
          {totalIssuesConflict && (
            <div className="mt-2 flex items-start gap-2 bg-amber-950 border border-amber-800 rounded-lg px-3 py-2">
              <AlertTriangle size={15} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-300">
                This arc already has a different total recorded. Please verify and correct the number above before saving.
              </p>
            </div>
          )}
        </div>

        {/* --- Collection-specific fields --- */}
        {mode === 'collection' && (
          <>
            <div>
              <label htmlFor="year" className="block text-sm font-medium text-gray-300 mb-1">
                Year
              </label>
              <input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="1988"
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Condition</label>
              <div className="grid grid-cols-4 gap-2">
                {conditions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCondition(c)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      condition === c
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* --- Wishlist-specific fields --- */}
        {mode === 'wishlist' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {['High', 'Medium', 'Low'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    priority === p
                      ? p === 'High'
                        ? 'bg-red-600 text-white'
                        : p === 'Medium'
                        ? 'bg-amber-600 text-white'
                        : 'bg-green-700 text-white'
                      : 'bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes — shared */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-300 mb-1">
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details..."
            rows={3}
            className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !series.trim()}
          className={`w-full py-4 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg ${
            mode === 'collection'
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          {success ? (
            <>
              <CheckCircle2 size={24} />
              {mode === 'collection' ? 'Added to Collection' : 'Added to Wishlist'}
            </>
          ) : (
            <>
              <Plus size={24} />
              {loading
                ? 'Adding...'
                : mode === 'collection'
                ? 'Add to Collection'
                : 'Add to Wishlist'}
            </>
          )}
        </button>

        {mode === 'collection' && !scanLimitReached && (
          <button
            type="button"
            disabled={loading || !series.trim()}
            onClick={() => {
              pendingScanNext.current = true;
              const form = document.getElementById('add-comic-form') as HTMLFormElement | null;
              form?.requestSubmit();
            }}
            className="w-full py-3 bg-transparent border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <ScanLine size={20} />
            Save &amp; Scan Next
          </button>
        )}
      </form>

      {duplicateComic && (
        <DuplicateModal
          isOpen={showDuplicateModal}
          onClose={handleCloseDuplicateModal}
          onDiscard={handleDiscardScan}
          existingComic={duplicateComic}
          newComicImage={capturedImage}
          onIncreaseCopyCount={handleIncreaseCopyCount}
          onAddAsSeparate={handleAddAsSeparate}
          isProcessing={loading}
        />
      )}

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

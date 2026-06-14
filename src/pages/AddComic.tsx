import { useState, useEffect, useRef } from 'react';
import { supabase, Comic, OcrCorrectionRule } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, Plus, Camera, Scan, X, AlertTriangle, Zap, Library, Heart, ScanLine, Wand2 } from 'lucide-react';
import { CameraCapture } from '../components/CameraCapture';
import { optimizeImageForOCR } from '../utils/imageOptimizer';
import DuplicateModal from '../components/DuplicateModal';
import { AlertModal } from '../components/AlertModal';

const FREE_SCAN_LIMIT = 20;

const todayEST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

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
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayEST());

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
  // OCR correction rule engine
  const [scannedRaw, setScannedRaw] = useState<{ series: string; story: string; publisher: string } | null>(null);
  const [pendingRuleSuggestion, setPendingRuleSuggestion] = useState<OcrCorrectionRule | null>(null);
  const [appliedRuleBanner, setAppliedRuleBanner] = useState<OcrCorrectionRule | null>(null);
  const pendingScanNext = useRef(false);
  // Holds a rule suggestion across the camera transition (Scan Next flow)
  const pendingRuleSuggestionRef = useRef<OcrCorrectionRule | null>(null);
  const scanButtonRef = useRef<HTMLButtonElement>(null);
  const seriesInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [ocrFilledFields, setOcrFilledFields] = useState<Set<string>>(new Set());
  const [bypassDuplicateOnSubmit, setBypassDuplicateOnSubmit] = useState(false);

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
    setPurchasePrice('');
    setPurchaseDate(todayEST());
    setNotes('');
    setTotalIssues('');
    setCoverVariant('');
    setTotalIssuesConflict(false);
    setCapturedImage(null);
    setPriority('Medium');
    setScannedRaw(null);
    setAppliedRuleBanner(null);
    setOcrFilledFields(new Set());
    setBypassDuplicateOnSubmit(false);
    // NOTE: pendingRuleSuggestion is intentionally NOT cleared here so a
    // suggestion that was just computed survives the form reset.
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
    setScannedRaw(null);
    setAppliedRuleBanner(null);
    // Restore any rule suggestion that was stashed before the camera opened (Scan Next flow)
    const restoredSuggestion = pendingRuleSuggestionRef.current;
    pendingRuleSuggestionRef.current = null;
    if (restoredSuggestion) setPendingRuleSuggestion(restoredSuggestion);
    else setPendingRuleSuggestion(null);

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
        const rawSeries = result.data.series || '';
        const rawStory = result.data.story || '';
        const rawPublisher = result.data.publisher || '';
        const scannedIssue = result.data.issue_number || '';

        // Store the raw OCR output so we can detect user corrections later
        setScannedRaw({ series: rawSeries, story: rawStory, publisher: rawPublisher });

        // Populate form immediately from raw OCR — unblocks the UI with zero DB round-trips
        setSeries(rawSeries);
        setStory(rawStory);
        setIssueNumber(scannedIssue);
        setPublisher(rawPublisher);
        setYear(result.data.year ? result.data.year.toString() : '');
        const scannedTotal = result.data.total_issues ?? null;
        setTotalIssues(scannedTotal ? scannedTotal.toString() : '');
        setCoverVariant(result.data.cover_variant ? result.data.cover_variant.toString() : '');
        if (result.data.cover_price != null) {
          setPurchasePrice(result.data.cover_price.toFixed(2));
        }

        // Track which fields the OCR scan populated for visual highlighting
        const ocrFilled = new Set<string>();
        if (rawSeries) ocrFilled.add('series');
        if (rawStory) ocrFilled.add('story');
        if (scannedIssue) ocrFilled.add('issueNumber');
        if (result.data.publisher) ocrFilled.add('publisher');
        if (result.data.year) ocrFilled.add('year');
        if (scannedTotal) ocrFilled.add('totalIssues');
        if (result.data.cover_variant) ocrFilled.add('coverVariant');
        if (result.data.cover_price != null) ocrFilled.add('purchasePrice');
        setOcrFilledFields(ocrFilled);

        // Results are ready — unblock the UI immediately
        setScanning(false);

        if (!rawSeries && !scannedIssue) {
          setAlertModal({
            isOpen: true,
            title: 'Incomplete Scan',
            message: 'Could not extract all details from the image. Please review and fill in any missing information.',
            type: 'info',
          });
        } else {
          addButtonRef.current?.focus();
        }

        // All three background DB queries run concurrently after the form is already visible
        const shouldCheckConflict = scannedTotal != null && result.data.story !== undefined;
        const shouldCheckDuplicate = mode === 'collection' && !!rawSeries && !!scannedIssue;

        if (shouldCheckDuplicate) setCheckingDuplicate(true);

        Promise.all([
          user && rawSeries
            ? supabase
                .from('ocr_correction_rules')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_confirmed', true)
                .ilike('ocr_series', rawSeries)
                .ilike('ocr_story', rawStory)
                .ilike('ocr_publisher', rawPublisher)
                .maybeSingle()
                .then(({ data }) => data ?? null)
            : Promise.resolve(null),
          shouldCheckConflict
            ? checkTotalIssuesConflict(rawSeries, rawStory, scannedTotal!)
            : Promise.resolve(false),
          shouldCheckDuplicate
            ? checkForDuplicates(rawSeries, scannedIssue, rawStory)
            : Promise.resolve(null),
        ]).then(([rule, conflict, duplicate]) => {
          if (rule) {
            setSeries((rule as OcrCorrectionRule).corrected_series);
            setStory((rule as OcrCorrectionRule).corrected_story);
            setPublisher((rule as OcrCorrectionRule).corrected_publisher);
            setAppliedRuleBanner(rule as OcrCorrectionRule);
            setOcrFilledFields(prev => { const n = new Set(prev); n.add('series'); n.add('story'); n.add('publisher'); return n; });
          }
          if (shouldCheckConflict) setTotalIssuesConflict(conflict as boolean);
          if (shouldCheckDuplicate) {
            setCheckingDuplicate(false);
            if (duplicate) {
              setDuplicateComic(duplicate as typeof duplicate);
            }
          }
        });
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
    const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const base64Data = imageDataUrl.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const colorBlob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });

    const colorFileName = `${user.id}/${fileId}_color.jpg`;
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

    const bwFileName = `${user.id}/${fileId}_bw.jpg`;
    const { data: bwData, error: bwError } = await supabase.storage
      .from('comic-covers').upload(bwFileName, bwBlob, { contentType: 'image/jpeg', upsert: false });
    if (bwError) {
      // Clean up the color file already uploaded so we don't leave orphaned storage objects
      await supabase.storage.from('comic-covers').remove([colorFileName]);
      throw bwError;
    }
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

  const insertCollectionComic = async (imageSnapshot: string | null, seriesVal: string, storyVal: string, issueVal: string, publisherVal: string, yearVal: string, conditionVal: string, notesVal: string, totalIssuesVal: string, coverVariantVal: string, purchasePriceVal: string, purchaseDateVal: string) => {
    if (!user) throw new Error('User not authenticated');
    let colorImageUrl: string | null = null;
    let bwImageUrl: string | null = null;
    if (imageSnapshot) {
      const { colorUrl, bwUrl } = await uploadImages(imageSnapshot);
      colorImageUrl = colorUrl;
      bwImageUrl = bwUrl;
    }
    const parsedTotal = totalIssuesVal ? parseInt(totalIssuesVal) : null;
    const conflict = await checkTotalIssuesConflict(seriesVal, storyVal, parsedTotal);
    const { error } = await supabase.from('comics').insert({
      user_id: user.id,
      series: seriesVal.trim(),
      story: storyVal.trim(),
      issue_number: issueVal.trim(),
      publisher: publisherVal.trim(),
      year: yearVal ? parseInt(yearVal) : null,
      condition: conditionVal.trim(),
      notes: notesVal.trim(),
      color_image_url: colorImageUrl,
      bw_image_url: bwImageUrl,
      copy_count: 1,
      cover_variant: coverVariantVal ? parseInt(coverVariantVal) : null,
      total_issues: parsedTotal,
      total_issues_conflict: conflict || null,
      purchase_price: purchasePriceVal ? parseFloat(purchasePriceVal) : null,
      purchase_date: purchaseDateVal || null,
    });
    if (error) throw error;
  };

  const trackOcrCorrection = async (
    raw: { series: string; story: string; publisher: string },
    saved: { series: string; story: string; publisher: string },
    correctionThreshold: number
  ): Promise<OcrCorrectionRule | null> => {
    if (!user) return null;
    const seriesChanged = raw.series.trim().toLowerCase() !== saved.series.trim().toLowerCase();
    const storyChanged = raw.story.trim().toLowerCase() !== saved.story.trim().toLowerCase();
    const publisherChanged = raw.publisher.trim().toLowerCase() !== saved.publisher.trim().toLowerCase();
    if (!seriesChanged && !storyChanged && !publisherChanged) return null;

    try {
      const { data: existing } = await supabase
        .from('ocr_correction_rules')
        .select('*')
        .eq('user_id', user.id)
        .ilike('ocr_series', raw.series)
        .ilike('ocr_story', raw.story)
        .ilike('ocr_publisher', raw.publisher)
        .maybeSingle();

      if (existing) {
        const newCount = existing.occurrence_count + 1;
        const { data: updated } = await supabase
          .from('ocr_correction_rules')
          .update({
            corrected_series: saved.series.trim(),
            corrected_story: saved.story.trim(),
            corrected_publisher: saved.publisher.trim(),
            occurrence_count: newCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select('*')
          .maybeSingle();
        // Suggest whenever at or above threshold and the user hasn't confirmed or dismissed
        if (updated && newCount >= correctionThreshold && !updated.is_confirmed && !updated.dismissed_at) {
          return updated as OcrCorrectionRule;
        }
        // Also re-surface an existing above-threshold rule that was never dismissed/confirmed
        if (existing.occurrence_count >= correctionThreshold && !existing.is_confirmed && !existing.dismissed_at) {
          return (updated ?? existing) as OcrCorrectionRule;
        }
        return null;
      } else {
        const { data: inserted } = await supabase
          .from('ocr_correction_rules')
          .insert({
            user_id: user.id,
            ocr_series: raw.series.trim(),
            ocr_story: raw.story.trim(),
            ocr_publisher: raw.publisher.trim(),
            corrected_series: saved.series.trim(),
            corrected_story: saved.story.trim(),
            corrected_publisher: saved.publisher.trim(),
            occurrence_count: 1,
          })
          .select('*')
          .maybeSingle();
        // Edge case: threshold is 1
        if (inserted && 1 >= correctionThreshold) return inserted as OcrCorrectionRule;
        return null;
      }
    } catch {
      return null;
    }
  };

  const handleAddAsSeparate = async () => {
    const imageSnapshot = capturedImage;
    const seriesSnap = series;
    const storySnap = story;
    const issueSnap = issueNumber;
    const publisherSnap = publisher;
    const yearSnap = year;
    const conditionSnap = condition;
    const notesSnap = notes;
    const totalIssuesSnap = totalIssues;
    const coverVariantSnap = coverVariant;
    const purchasePriceSnap = purchasePrice;
    const purchaseDateSnap = purchaseDate;
    const rawSnap = scannedRaw;
    setShowDuplicateModal(false);
    setDuplicateComic(null);
    setLoading(true);
    setSuccess(false);
    try {
      await insertCollectionComic(imageSnapshot, seriesSnap, storySnap, issueSnap, publisherSnap, yearSnap, conditionSnap, notesSnap, totalIssuesSnap, coverVariantSnap, purchasePriceSnap, purchaseDateSnap);
      // Track OCR correction after successful save
      let suggestion: OcrCorrectionRule | null = null;
      if (rawSnap) {
        const { data: prefs } = await supabase
          .from('user_scan_preferences')
          .select('correction_threshold')
          .eq('user_id', user!.id)
          .maybeSingle();
        const threshold = prefs?.correction_threshold ?? 3;
        suggestion = await trackOcrCorrection(rawSnap, { series: seriesSnap, story: storySnap, publisher: publisherSnap }, threshold);
      }
      setSuccess(true);
      resetForm();
      if (pendingScanNext.current) {
        pendingScanNext.current = false;
        setSuccess(false);
        // Stash suggestion in ref so it survives the camera transition
        pendingRuleSuggestionRef.current = suggestion;
        setShowCamera(true);
      } else {
        // Restore suggestion after resetForm cleared the form but not the banner
        if (suggestion) setPendingRuleSuggestion(suggestion);
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
      const seriesSnap = series;
      const storySnap = story;
      const issueSnap = issueNumber;
      const publisherSnap = publisher;
      const yearSnap = year;
      const conditionSnap = condition;
      const notesSnap = notes;
      const totalIssuesSnap = totalIssues;
      const coverVariantSnap = coverVariant;
      const purchasePriceSnap = purchasePrice;
      const purchaseDateSnap = purchaseDate;
      const rawSnap = scannedRaw;
      // Run duplicate and total-issues conflict checks simultaneously
      const parsedTotalForCheck = totalIssuesSnap ? parseInt(totalIssuesSnap) : null;
      const shouldCheckConflict = parsedTotalForCheck !== null;
      const shouldCheckDuplicate = !!(seriesSnap.trim() && issueSnap.trim()) && !bypassDuplicateOnSubmit;

      if (shouldCheckDuplicate) setCheckingDuplicate(true);

      const [conflictFound, duplicateFound] = await Promise.all([
        shouldCheckConflict
          ? checkTotalIssuesConflict(seriesSnap, storySnap, parsedTotalForCheck)
          : Promise.resolve(false),
        shouldCheckDuplicate
          ? checkForDuplicates(seriesSnap, issueSnap, storySnap)
          : Promise.resolve(null),
      ]);

      if (shouldCheckDuplicate) setCheckingDuplicate(false);
      if (conflictFound) setTotalIssuesConflict(true);
      if (duplicateFound) {
        setDuplicateComic(duplicateFound);
        return;
      }

      setLoading(true);
      setSuccess(false);
      try {
        await insertCollectionComic(imageSnapshot, seriesSnap, storySnap, issueSnap, publisherSnap, yearSnap, conditionSnap, notesSnap, totalIssuesSnap, coverVariantSnap, purchasePriceSnap, purchaseDateSnap);
        // Track OCR correction after successful save
        let suggestion: OcrCorrectionRule | null = null;
        if (rawSnap) {
          const { data: prefs } = await supabase
            .from('user_scan_preferences')
            .select('correction_threshold')
            .eq('user_id', user.id)
            .maybeSingle();
          const threshold = prefs?.correction_threshold ?? 3;
          suggestion = await trackOcrCorrection(rawSnap, { series: seriesSnap, story: storySnap, publisher: publisherSnap }, threshold);
        }
        setSuccess(true);
        resetForm();
        if (pendingScanNext.current) {
          pendingScanNext.current = false;
          setSuccess(false);
          pendingRuleSuggestionRef.current = suggestion;
          setShowCamera(true);
        } else {
          if (suggestion) setPendingRuleSuggestion(suggestion);
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
      const seriesSnap = series;
      const storySnap = story;
      const publisherSnap = publisher;
      const rawSnap = scannedRaw;
      setLoading(true);
      setSuccess(false);
      try {
        const { error } = await supabase.from('wishlist').insert({
          user_id: user.id,
          series: seriesSnap.trim(),
          story: storySnap.trim(),
          issue_number: issueNumber.trim(),
          publisher: publisherSnap.trim(),
          priority,
          notes: notes.trim(),
          total_issues: totalIssues ? parseInt(totalIssues) : null,
          cover_variant: coverVariant ? parseInt(coverVariant) : null,
        });
        if (error) throw error;
        // Track OCR corrections for wishlist scans too
        let suggestion: OcrCorrectionRule | null = null;
        if (rawSnap) {
          const { data: prefs } = await supabase
            .from('user_scan_preferences')
            .select('correction_threshold')
            .eq('user_id', user.id)
            .maybeSingle();
          const threshold = prefs?.correction_threshold ?? 3;
          suggestion = await trackOcrCorrection(rawSnap, { series: seriesSnap, story: storySnap, publisher: publisherSnap }, threshold);
        }
        setSuccess(true);
        resetForm();
        if (suggestion) setPendingRuleSuggestion(suggestion);
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

  const ocrFieldClass = (field: string) =>
    ocrFilledFields.has(field)
      ? 'border-sky-500 bg-sky-950/20 focus:border-sky-400 focus:ring-sky-500'
      : 'border-gray-800 focus:border-blue-500 focus:ring-blue-500';

  const clearOcrField = (field: string) =>
    setOcrFilledFields(prev => { const n = new Set(prev); n.delete(field); return n; });

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
            onChange={(e) => { setSeries(e.target.value); clearOcrField('series'); }}
            required
            placeholder="e.g., The Amazing Spider-Man"
            className={`w-full px-4 py-3 bg-gray-900 text-white rounded-lg border focus:outline-none focus:ring-2 text-lg transition-colors ${ocrFieldClass('series')}`}
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
            onChange={(e) => { setStory(e.target.value); clearOcrField('story'); }}
            placeholder="e.g., Kraven's Last Hunt"
            className={`w-full px-4 py-3 bg-gray-900 text-white rounded-lg border focus:outline-none focus:ring-2 transition-colors ${ocrFieldClass('story')}`}
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
              onChange={(e) => { setIssueNumber(e.target.value); clearOcrField('issueNumber'); }}
              placeholder="300"
              className={`w-full px-4 py-3 bg-gray-900 text-white rounded-lg border focus:outline-none focus:ring-2 transition-colors ${ocrFieldClass('issueNumber')}`}
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
              onChange={(e) => { setPublisher(e.target.value); clearOcrField('publisher'); }}
              placeholder="e.g., Marvel, DC"
              className={`w-full px-4 py-3 bg-gray-900 text-white rounded-lg border focus:outline-none focus:ring-2 transition-colors ${ocrFieldClass('publisher')}`}
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
            onChange={(e) => { setCoverVariant(e.target.value); clearOcrField('coverVariant'); }}
            placeholder="e.g., 2"
            className={`w-full px-4 py-3 bg-gray-900 text-white rounded-lg border focus:outline-none focus:ring-2 transition-colors ${ocrFieldClass('coverVariant')}`}
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
            onChange={(e) => { setTotalIssues(e.target.value); setTotalIssuesConflict(false); clearOcrField('totalIssues'); }}
            placeholder="e.g., 6"
            className={`w-full px-4 py-3 bg-gray-900 text-white rounded-lg border focus:outline-none focus:ring-2 transition-colors ${
              totalIssuesConflict
                ? 'border-amber-600 focus:border-amber-500 focus:ring-amber-500'
                : ocrFieldClass('totalIssues')
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
                onChange={(e) => { setYear(e.target.value); clearOcrField('year'); }}
                placeholder="1988"
                className={`w-full px-4 py-3 bg-gray-900 text-white rounded-lg border focus:outline-none focus:ring-2 transition-colors ${ocrFieldClass('year')}`}
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

            {/* Purchase Info subsection */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Purchase Info <span className="text-gray-600 font-normal normal-case">(optional)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="purchasePrice" className="block text-sm font-medium text-gray-300 mb-1">
                    Price (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      id="purchasePrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={purchasePrice}
                      onChange={(e) => { setPurchasePrice(e.target.value); clearOcrField('purchasePrice'); }}
                      placeholder="0.00"
                      className={`w-full pl-7 pr-4 py-3 bg-gray-800 text-white rounded-lg border focus:outline-none focus:ring-2 transition-colors ${
                        ocrFilledFields.has('purchasePrice')
                          ? 'border-sky-500 focus:border-sky-400 focus:ring-sky-500'
                          : 'border-gray-700 focus:border-blue-500 focus:ring-blue-500'
                      }`}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="purchaseDate" className="block text-sm font-medium text-gray-300 mb-1">
                    Purchase Date
                  </label>
                  <input
                    id="purchaseDate"
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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

        {/* Applied rule banner — shown after OCR auto-corrects a value */}
        {appliedRuleBanner && (
          <div className="flex items-start gap-3 bg-blue-950 border border-blue-800 rounded-lg px-4 py-3">
            <Wand2 size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-blue-200">
                Auto-corrected using your saved rule: <span className="font-medium">"{appliedRuleBanner.ocr_series}{appliedRuleBanner.ocr_story ? ` / ${appliedRuleBanner.ocr_story}` : ''}{appliedRuleBanner.ocr_publisher ? ` · ${appliedRuleBanner.ocr_publisher}` : ''}"</span> &rarr; <span className="font-medium">"{appliedRuleBanner.corrected_series}{appliedRuleBanner.corrected_story ? ` / ${appliedRuleBanner.corrected_story}` : ''}{appliedRuleBanner.corrected_publisher ? ` · ${appliedRuleBanner.corrected_publisher}` : ''}"</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSeries(appliedRuleBanner.ocr_series);
                setStory(appliedRuleBanner.ocr_story);
                setPublisher(appliedRuleBanner.ocr_publisher);
                setAppliedRuleBanner(null);
              }}
              className="text-xs text-blue-400 hover:text-blue-200 transition-colors shrink-0 underline underline-offset-2"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setAppliedRuleBanner(null)}
              className="text-blue-500 hover:text-blue-300 transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Rule suggestion banner — shown when occurrence threshold is reached */}
        {pendingRuleSuggestion && (
          <div className="flex items-start gap-3 bg-amber-950 border border-amber-800 rounded-lg px-4 py-3">
            <Wand2 size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-200 font-medium mb-0.5">Save a scan correction rule?</p>
              <p className="text-xs text-amber-300">
                You've corrected <span className="font-medium">"{pendingRuleSuggestion.ocr_series}{pendingRuleSuggestion.ocr_story ? ` / ${pendingRuleSuggestion.ocr_story}` : ''}{pendingRuleSuggestion.ocr_publisher ? ` · ${pendingRuleSuggestion.ocr_publisher}` : ''}"</span> to <span className="font-medium">"{pendingRuleSuggestion.corrected_series}{pendingRuleSuggestion.corrected_story ? ` / ${pendingRuleSuggestion.corrected_story}` : ''}{pendingRuleSuggestion.corrected_publisher ? ` · ${pendingRuleSuggestion.corrected_publisher}` : ''}"</span> {pendingRuleSuggestion.occurrence_count} times. QuickStack can apply this automatically from now on.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  await supabase
                    .from('ocr_correction_rules')
                    .update({ is_confirmed: true, updated_at: new Date().toISOString() })
                    .eq('id', pendingRuleSuggestion.id);
                  setPendingRuleSuggestion(null);
                }}
                className="text-xs bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded-md font-medium transition-colors"
              >
                Save Rule
              </button>
              <button
                type="button"
                onClick={async () => {
                  await supabase
                    .from('ocr_correction_rules')
                    .update({ dismissed_at: new Date().toISOString() })
                    .eq('id', pendingRuleSuggestion.id);
                  setPendingRuleSuggestion(null);
                }}
                className="text-xs text-amber-500 hover:text-amber-300 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {duplicateComic && !showDuplicateModal && (
          <div className="flex items-start gap-3 bg-amber-950 border border-amber-700 rounded-lg px-4 py-3">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-200 font-medium">Possible duplicate found</p>
              <p className="text-xs text-amber-300 mt-0.5">
                {duplicateComic.series}{duplicateComic.issue_number ? ` #${duplicateComic.issue_number}` : ''} is already in your collection.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowDuplicateModal(true)}
                className="text-xs bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded-md font-medium transition-colors"
              >
                Review
              </button>
              <button
                type="button"
                onClick={() => { setDuplicateComic(null); setBypassDuplicateOnSubmit(true); }}
                className="text-amber-500 hover:text-amber-300 transition-colors"
                title="Dismiss — add as new entry"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <button
          ref={addButtonRef}
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

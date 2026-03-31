import { useState } from 'react';
import { supabase, Comic } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, Plus, Camera, Scan, X } from 'lucide-react';
import { CameraCapture } from '../components/CameraCapture';
import { optimizeImageForOCR } from '../utils/imageOptimizer';
import DuplicateModal from '../components/DuplicateModal';

export function AddComic() {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [issueNumber, setIssueNumber] = useState('');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [duplicateComic, setDuplicateComic] = useState<Comic | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const checkForDuplicates = async (comicTitle: string, comicIssueNumber: string, comicPublisher: string): Promise<Comic | null> => {
    if (!user || !comicTitle.trim() || !comicIssueNumber.trim()) return null;

    try {
      let query = supabase
        .from('comics')
        .select('*')
        .eq('user_id', user.id)
        .ilike('title', comicTitle.trim())
        .ilike('issue_number', comicIssueNumber.trim());

      if (comicPublisher.trim()) {
        query = query.ilike('publisher', comicPublisher.trim());
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error checking for duplicates:', error);
        return null;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return null;
    }
  };

  const handleCameraCapture = async (imageDataUrl: string) => {
    setShowCamera(false);
    setCapturedImage(imageDataUrl);
    setScanning(true);

    try {
      const optimized = await optimizeImageForOCR(imageDataUrl);

      console.log(`Image optimization: ${optimized.originalSize} bytes → ${optimized.optimizedSize} bytes (${optimized.savingsPercent}% reduction)`);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-comic`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageData: optimized.dataUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.detail || result.error || 'Failed to scan comic';
        console.error('Scan error:', result);
        alert(`Scanning failed: ${errorMessage}\n\nPlease try again with better lighting or enter details manually.`);
        return;
      }

      if (result.success && result.data) {
        const scannedTitle = result.data.title || '';
        const scannedIssue = result.data.issue_number || '';

        setTitle(scannedTitle);
        setIssueNumber(scannedIssue);
        setPublisher(result.data.publisher || '');
        setYear(result.data.year ? result.data.year.toString() : '');

        if (scannedTitle && scannedIssue) {
          setCheckingDuplicate(true);
          const scannedPublisher = result.data.publisher || '';
          const duplicate = await checkForDuplicates(scannedTitle, scannedIssue, scannedPublisher);
          setCheckingDuplicate(false);

          if (duplicate) {
            setDuplicateComic(duplicate);
            setShowDuplicateModal(true);
          }
        } else {
          alert('Could not extract all details from the image. Please review and fill in any missing information.');
        }
      } else {
        alert('Could not extract comic details. Please enter manually.');
      }
    } catch (error) {
      console.error('Error scanning comic:', error);
      alert('An unexpected error occurred while scanning. Please enter details manually.');
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
        if (!ctx) {
          resolve(imageDataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = imageDataUrl;
    });
  };

  const uploadImages = async (): Promise<{ colorUrl: string | null; bwUrl: string | null }> => {
    if (!capturedImage || !user) return { colorUrl: null, bwUrl: null };

    try {
      const timestamp = Date.now();

      const base64Data = capturedImage.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const colorBlob = new Blob([byteArray], { type: 'image/jpeg' });

      const colorFileName = `${user.id}/${timestamp}_color.jpg`;
      const { data: colorData, error: colorError } = await supabase.storage
        .from('comic-covers')
        .upload(colorFileName, colorBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (colorError) throw colorError;

      const { data: colorUrlData } = supabase.storage
        .from('comic-covers')
        .getPublicUrl(colorData.path);

      const bwImageData = await convertToBlackAndWhite(capturedImage);
      const bwBase64Data = bwImageData.split(',')[1];
      const bwByteCharacters = atob(bwBase64Data);
      const bwByteNumbers = new Array(bwByteCharacters.length);
      for (let i = 0; i < bwByteCharacters.length; i++) {
        bwByteNumbers[i] = bwByteCharacters.charCodeAt(i);
      }
      const bwByteArray = new Uint8Array(bwByteNumbers);
      const bwBlob = new Blob([bwByteArray], { type: 'image/jpeg' });

      const bwFileName = `${user.id}/${timestamp}_bw.jpg`;
      const { data: bwData, error: bwError } = await supabase.storage
        .from('comic-covers')
        .upload(bwFileName, bwBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (bwError) throw bwError;

      const { data: bwUrlData } = supabase.storage
        .from('comic-covers')
        .getPublicUrl(bwData.path);

      return {
        colorUrl: colorUrlData.publicUrl,
        bwUrl: bwUrlData.publicUrl,
      };
    } catch (error) {
      console.error('Error uploading images:', error);
      return { colorUrl: null, bwUrl: null };
    }
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
      setTitle('');
      setIssueNumber('');
      setPublisher('');
      setYear('');
      setCondition('');
      setNotes('');
      setCapturedImage(null);
      setDuplicateComic(null);

      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating copy count:', error);
      alert('Failed to update copy count');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAsSeparate = () => {
    setShowDuplicateModal(false);
    setDuplicateComic(null);
  };

  const handleDiscardScan = () => {
    setShowDuplicateModal(false);
    setDuplicateComic(null);
    setTitle('');
    setIssueNumber('');
    setPublisher('');
    setYear('');
    setCondition('');
    setNotes('');
    setCapturedImage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    setLoading(true);
    setSuccess(false);

    try {
      if (title.trim() && issueNumber.trim()) {
        setCheckingDuplicate(true);
        const duplicate = await checkForDuplicates(title, issueNumber, publisher);
        setCheckingDuplicate(false);

        if (duplicate) {
          setDuplicateComic(duplicate);
          setShowDuplicateModal(true);
          setLoading(false);
          return;
        }
      }

      let colorImageUrl = null;
      let bwImageUrl = null;

      if (capturedImage) {
        const { colorUrl, bwUrl } = await uploadImages();
        colorImageUrl = colorUrl;
        bwImageUrl = bwUrl;
      }

      const { error } = await supabase.from('comics').insert({
        user_id: user.id,
        title: title.trim(),
        issue_number: issueNumber.trim(),
        publisher: publisher.trim(),
        year: year ? parseInt(year) : null,
        condition: condition.trim(),
        notes: notes.trim(),
        color_image_url: colorImageUrl,
        bw_image_url: bwImageUrl,
        copy_count: 1,
      });

      if (error) throw error;

      setSuccess(true);
      setTitle('');
      setIssueNumber('');
      setPublisher('');
      setYear('');
      setCondition('');
      setNotes('');
      setCapturedImage(null);

      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      console.error('Error adding comic:', error);
      alert('Failed to add comic');
    } finally {
      setLoading(false);
    }
  };

  const conditions = ['Mint', 'Near Mint', 'Very Fine', 'Fine', 'Good', 'Fair', 'Poor'];

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">Add Comic</h1>
        <p className="text-gray-400">Quick entry for your collection</p>
      </div>

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
              Color photo captured - will be saved with comic
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              disabled={scanning}
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g., The Amazing Spider-Man"
            className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
            autoFocus
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
            placeholder="e.g., Marvel, DC, Image"
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
          disabled={loading || !title.trim()}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
        >
          {success ? (
            <>
              <CheckCircle2 size={24} />
              Added to Collection
            </>
          ) : (
            <>
              <Plus size={24} />
              {loading ? 'Adding...' : 'Add to Collection'}
            </>
          )}
        </button>
      </form>

      {duplicateComic && (
        <DuplicateModal
          isOpen={showDuplicateModal}
          onClose={handleDiscardScan}
          existingComic={duplicateComic}
          newComicImage={capturedImage}
          onIncreaseCopyCount={handleIncreaseCopyCount}
          onAddAsSeparate={handleAddAsSeparate}
          isProcessing={loading}
        />
      )}
    </div>
  );
}

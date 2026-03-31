import { X, Copy, Plus } from 'lucide-react';
import { Comic } from '../lib/supabase';

interface DuplicateModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingComic: Comic;
  newComicImage: string | null;
  onIncreaseCopyCount: () => void;
  onAddAsSeparate: () => void;
  isProcessing: boolean;
}

export default function DuplicateModal({
  isOpen,
  onClose,
  existingComic,
  newComicImage,
  onIncreaseCopyCount,
  onAddAsSeparate,
  isProcessing,
}: DuplicateModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-800">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Duplicate Comic Detected</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300 transition-colors"
            disabled={isProcessing}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <p className="text-gray-300 mb-4">
              This comic appears to already be in your collection. Would you like to increase the copy count or add it as a separate entry?
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Copy className="w-5 h-5 text-blue-400" />
                Existing Comic
              </h3>
              {existingComic.color_image_url && (
                <img
                  src={existingComic.color_image_url}
                  alt="Existing comic"
                  className="w-full h-48 object-contain bg-gray-800 rounded-lg"
                />
              )}
              <div className="bg-gray-800 p-4 rounded-lg space-y-2 border border-gray-700">
                <p className="font-medium text-white">{existingComic.title}</p>
                <p className="text-sm text-gray-400">Issue #{existingComic.issue_number}</p>
                {existingComic.publisher && (
                  <p className="text-sm text-gray-400">{existingComic.publisher}</p>
                )}
                <div className="pt-2 border-t border-gray-700">
                  <p className="text-sm font-semibold text-blue-400">
                    Current Copies: {existingComic.copy_count}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                New Scan
              </h3>
              {newComicImage && (
                <img
                  src={newComicImage}
                  alt="New scan"
                  className="w-full h-48 object-contain bg-gray-800 rounded-lg"
                />
              )}
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-400">
                  If you increase the copy count, this will become copy #{existingComic.copy_count + 1}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={onIncreaseCopyCount}
              disabled={isProcessing}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Copy className="w-5 h-5" />
              {isProcessing ? 'Processing...' : `Increase to ${existingComic.copy_count + 1} Copies`}
            </button>

            <button
              onClick={onAddAsSeparate}
              disabled={isProcessing}
              className="w-full bg-gray-700 text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add as Separate Entry
            </button>

            <button
              onClick={onClose}
              disabled={isProcessing}
              className="w-full bg-gray-800 text-gray-300 py-3 px-4 rounded-lg font-medium border border-gray-700 hover:bg-gray-750 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

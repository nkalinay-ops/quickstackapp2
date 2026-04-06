import { useEffect, useState } from 'react';
import { supabase, Comic } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Trash2, X, Copy, CreditCard as Edit2, Save, Plus, Minus } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';

export function Collection() {
  const { user } = useAuth();
  const [comics, setComics] = useState<Comic[]>([]);
  const [filteredComics, setFilteredComics] = useState<Comic[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
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
    const filtered = comics.filter(
      (comic) =>
        comic.title.toLowerCase().includes(query) ||
        comic.issue_number.toLowerCase().includes(query) ||
        comic.publisher.toLowerCase().includes(query)
    );
    setFilteredComics(filtered);
  }, [searchQuery, comics]);

  const loadComics = async () => {
    try {
      const { data, error } = await supabase
        .from('comics')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComics(data || []);
      setFilteredComics(data || []);
    } catch (error) {
      console.error('Error loading comics:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteComic = async (id: string) => {
    try {
      const { error } = await supabase.from('comics').delete().eq('id', id);
      if (error) throw error;
      setComics(comics.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Error deleting comic:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to delete comic',
        type: 'error',
      });
    }
  };

  const handleDeleteClick = (id: string) => {
    setConfirmModal({ isOpen: true, comicId: id });
  };

  const handleConfirmDelete = () => {
    if (confirmModal.comicId) {
      deleteComic(confirmModal.comicId);
      if (selectedComic?.id === confirmModal.comicId) {
        setSelectedComic(null);
      }
    }
  };

  const handleEditClick = () => {
    if (selectedComic) {
      setEditedComic({ ...selectedComic });
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedComic(null);
  };

  const handleSaveEdit = async () => {
    if (!editedComic) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('comics')
        .update({
          title: editedComic.title.trim(),
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
      setComics(comics.map(c => c.id === editedComic.id ? editedComic : c));
      setIsEditing(false);
      setEditedComic(null);
    } catch (error) {
      console.error('Error updating comic:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to update comic',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleIncrementCopy = async (comicId: string) => {
    try {
      const comic = comics.find(c => c.id === comicId);
      if (!comic) return;

      const newCount = comic.copy_count + 1;
      const { error } = await supabase
        .from('comics')
        .update({ copy_count: newCount })
        .eq('id', comicId);

      if (error) throw error;

      const updatedComic = { ...comic, copy_count: newCount };
      setComics(comics.map(c => c.id === comicId ? updatedComic : c));
      if (selectedComic?.id === comicId) {
        setSelectedComic(updatedComic);
      }
      if (isEditing && editedComic?.id === comicId) {
        setEditedComic(updatedComic);
      }
    } catch (error) {
      console.error('Error updating copy count:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to update copy count',
        type: 'error',
      });
    }
  };

  const handleDecrementCopy = async (comicId: string) => {
    try {
      const comic = comics.find(c => c.id === comicId);
      if (!comic || comic.copy_count <= 1) return;

      const newCount = comic.copy_count - 1;
      const { error } = await supabase
        .from('comics')
        .update({ copy_count: newCount })
        .eq('id', comicId);

      if (error) throw error;

      const updatedComic = { ...comic, copy_count: newCount };
      setComics(comics.map(c => c.id === comicId ? updatedComic : c));
      if (selectedComic?.id === comicId) {
        setSelectedComic(updatedComic);
      }
      if (isEditing && editedComic?.id === comicId) {
        setEditedComic(updatedComic);
      }
    } catch (error) {
      console.error('Error updating copy count:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to update copy count',
        type: 'error',
      });
    }
  };

  const conditions = ['Mint', 'Near Mint', 'Very Fine', 'Fine', 'Good', 'Fair', 'Poor'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (selectedComic) {
    const displayComic = isEditing && editedComic ? editedComic : selectedComic;

    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Comic Details</h1>
          <button
            onClick={() => {
              setSelectedComic(null);
              setIsEditing(false);
              setEditedComic(null);
            }}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {selectedComic.color_image_url && (
          <div className="mb-6">
            <img
              src={selectedComic.color_image_url}
              alt={selectedComic.title}
              className="w-full max-h-96 object-contain rounded-lg bg-gray-900"
            />
          </div>
        )}

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-4">
          <div>
            <div className="text-sm text-gray-400 mb-1">Title</div>
            {isEditing ? (
              <input
                type="text"
                value={displayComic.title}
                onChange={(e) => setEditedComic({ ...displayComic, title: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-lg"
              />
            ) : (
              <div className="text-xl font-semibold">{displayComic.title}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-1">Issue Number</div>
            {isEditing ? (
              <input
                type="text"
                value={displayComic.issue_number}
                onChange={(e) => setEditedComic({ ...displayComic, issue_number: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
              />
            ) : (
              <div className="text-lg">#{displayComic.issue_number}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-1">Publisher</div>
            {isEditing ? (
              <input
                type="text"
                value={displayComic.publisher}
                onChange={(e) => setEditedComic({ ...displayComic, publisher: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
              />
            ) : (
              <div className="text-lg">{displayComic.publisher || '-'}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-1">Year</div>
            {isEditing ? (
              <input
                type="number"
                value={displayComic.year || ''}
                onChange={(e) => setEditedComic({ ...displayComic, year: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
              />
            ) : (
              <div className="text-lg">{displayComic.year || '-'}</div>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-400 mb-2">Condition</div>
            {isEditing ? (
              <div className="grid grid-cols-4 gap-2">
                {conditions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditedComic({ ...displayComic, condition: c })}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      displayComic.condition === c
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {c}
                  </button>
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
                <button
                  onClick={() => handleDecrementCopy(selectedComic.id)}
                  disabled={displayComic.copy_count <= 1}
                  className="p-2 bg-gray-800 text-white rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus size={20} />
                </button>
                <div className="flex items-center gap-2">
                  <Copy size={20} className="text-blue-400" />
                  <span className="text-2xl font-semibold text-blue-400">{displayComic.copy_count}</span>
                </div>
                <button
                  onClick={() => handleIncrementCopy(selectedComic.id)}
                  className="p-2 bg-gray-800 text-white rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors"
                >
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
              <textarea
                value={displayComic.notes}
                onChange={(e) => setEditedComic({ ...displayComic, notes: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
              />
            ) : (
              <div className="text-lg">{displayComic.notes || '-'}</div>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save size={20} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleEditClick}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Edit2 size={20} />
                Edit Comic
              </button>
              <button
                onClick={() => handleDeleteClick(selectedComic.id)}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={20} />
                Delete Comic
              </button>
            </>
          )}
        </div>

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

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">My Collection</h1>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search comics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

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
              <div
                key={comic.id}
                onClick={() => setSelectedComic(comic)}
                className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex gap-4 items-start cursor-pointer hover:border-gray-700 transition-colors"
              >
                {comic.color_image_url && (
                  <div className="relative">
                    <img
                      src={comic.color_image_url}
                      alt={comic.title}
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
                    {comic.title}
                    {comic.copy_count > 1 && !comic.color_image_url && (
                      <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                        <Copy size={12} />
                        {comic.copy_count}
                      </span>
                    )}
                  </div>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(comic.id);
                  }}
                  className="ml-3 p-2 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

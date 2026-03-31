import { useEffect, useState } from 'react';
import { supabase, WishlistItem } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, CheckCircle } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';

export function Wishlist() {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    issue_number: '',
    publisher: '',
    priority: 'Medium',
    notes: '',
  });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; action: 'delete' | 'acquire' | null; itemId: string | null; item: WishlistItem | null }>({
    isOpen: false,
    action: null,
    itemId: null,
    item: null,
  });
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title?: string; message: string; type?: 'error' | 'success' | 'info' }>({
    isOpen: false,
    message: '',
  });

  useEffect(() => {
    if (!user) return;
    loadWishlist();
  }, [user]);

  const loadWishlist = async () => {
    try {
      const { data, error } = await supabase
        .from('wishlist')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWishlist(data || []);
    } catch (error) {
      console.error('Error loading wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title.trim()) return;

    try {
      const { error } = await supabase.from('wishlist').insert({
        user_id: user.id,
        title: formData.title.trim(),
        issue_number: formData.issue_number.trim(),
        publisher: formData.publisher.trim(),
        priority: formData.priority,
        notes: formData.notes.trim(),
      });

      if (error) throw error;

      setFormData({
        title: '',
        issue_number: '',
        publisher: '',
        priority: 'Medium',
        notes: '',
      });
      setShowAddForm(false);
      loadWishlist();
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to add to wishlist',
        type: 'error',
      });
    }
  };

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase.from('wishlist').delete().eq('id', id);
      if (error) throw error;
      setWishlist(wishlist.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error deleting item:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to remove item',
        type: 'error',
      });
    }
  };

  const markAsAcquired = async (item: WishlistItem) => {
    try {
      const { error: insertError } = await supabase.from('comics').insert({
        user_id: user!.id,
        title: item.title,
        issue_number: item.issue_number,
        publisher: item.publisher,
        year: null,
        condition: '',
        notes: item.notes,
      });

      if (insertError) throw insertError;

      const { error: deleteError } = await supabase.from('wishlist').delete().eq('id', item.id);
      if (deleteError) throw deleteError;

      setWishlist(wishlist.filter((i) => i.id !== item.id));
      setAlertModal({
        isOpen: true,
        title: 'Success',
        message: 'Added to collection!',
        type: 'success',
      });
    } catch (error) {
      console.error('Error moving to collection:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to move to collection',
        type: 'error',
      });
    }
  };

  const handleDeleteClick = (id: string) => {
    setConfirmModal({ isOpen: true, action: 'delete', itemId: id, item: null });
  };

  const handleAcquiredClick = (item: WishlistItem) => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">Wishlist</h1>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus size={24} />
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmit} className="bg-gray-900 rounded-lg p-4 space-y-3 mb-4 border border-gray-800">
            <input
              type="text"
              placeholder="Comic title *"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Issue #"
                value={formData.issue_number}
                onChange={(e) => setFormData({ ...formData, issue_number: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Publisher"
                value={formData.publisher}
                onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              {['High', 'Medium', 'Low'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFormData({ ...formData, priority: p })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.priority === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Notes..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
            />
            <button
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Add to Wishlist
            </button>
          </form>
        )}
      </div>

      {wishlist.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-2">Your wishlist is empty</p>
          <p className="text-gray-500 text-sm">Add comics you're looking to acquire</p>
        </div>
      ) : (
        <div>
          <div className="text-gray-400 text-sm mb-3">
            {wishlist.length} {wishlist.length === 1 ? 'item' : 'items'}
          </div>
          <div className="space-y-2">
            {wishlist.map((item) => (
              <div
                key={item.id}
                className="bg-gray-900 rounded-lg p-4 border border-gray-800"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white">{item.title}</div>
                    <div className="text-sm text-gray-400 mt-1">
                      {item.issue_number && `#${item.issue_number}`}
                      {item.issue_number && item.publisher && ' • '}
                      {item.publisher}
                    </div>
                    {item.notes && (
                      <div className="text-xs text-gray-500 mt-1">{item.notes}</div>
                    )}
                  </div>
                  <span
                    className={`${
                      priorityColors[item.priority as keyof typeof priorityColors]
                    } text-xs px-2 py-1 rounded border ml-2`}
                  >
                    {item.priority}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcquiredClick(item)}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <CheckCircle size={16} />
                    Acquired
                  </button>
                  <button
                    onClick={() => handleDeleteClick(item.id)}
                    className="px-3 py-2 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, action: null, itemId: null, item: null })}
        onConfirm={handleConfirmAction}
        title={confirmModal.action === 'delete' ? 'Remove from Wishlist' : 'Move to Collection'}
        message={confirmModal.action === 'delete' ? 'Are you sure you want to remove this item from your wishlist?' : 'Move this item to your collection?'}
        confirmText={confirmModal.action === 'delete' ? 'Remove' : 'Move to Collection'}
        cancelText="Cancel"
        isDestructive={confirmModal.action === 'delete'}
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

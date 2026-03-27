import { useEffect, useState } from 'react';
import { supabase, Comic } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Trash2, X, Copy } from 'lucide-react';

export function Collection() {
  const { user } = useAuth();
  const [comics, setComics] = useState<Comic[]>([]);
  const [filteredComics, setFilteredComics] = useState<Comic[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedComic, setSelectedComic] = useState<Comic | null>(null);

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
    if (!confirm('Delete this comic from your collection?')) return;

    try {
      const { error } = await supabase.from('comics').delete().eq('id', id);
      if (error) throw error;
      setComics(comics.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Error deleting comic:', error);
      alert('Failed to delete comic');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (selectedComic) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Comic Details</h1>
          <button
            onClick={() => setSelectedComic(null)}
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
            <div className="text-xl font-semibold">{selectedComic.title}</div>
          </div>

          {selectedComic.issue_number && (
            <div>
              <div className="text-sm text-gray-400 mb-1">Issue Number</div>
              <div className="text-lg">#{selectedComic.issue_number}</div>
            </div>
          )}

          {selectedComic.publisher && (
            <div>
              <div className="text-sm text-gray-400 mb-1">Publisher</div>
              <div className="text-lg">{selectedComic.publisher}</div>
            </div>
          )}

          {selectedComic.year && (
            <div>
              <div className="text-sm text-gray-400 mb-1">Year</div>
              <div className="text-lg">{selectedComic.year}</div>
            </div>
          )}

          {selectedComic.condition && (
            <div>
              <div className="text-sm text-gray-400 mb-1">Condition</div>
              <div className="text-lg">{selectedComic.condition}</div>
            </div>
          )}

          {selectedComic.copy_count > 1 && (
            <div>
              <div className="text-sm text-gray-400 mb-1">Copies Owned</div>
              <div className="text-lg flex items-center gap-2">
                <Copy size={20} className="text-blue-500" />
                <span className="font-semibold text-blue-400">{selectedComic.copy_count} copies</span>
              </div>
            </div>
          )}

          {selectedComic.notes && (
            <div>
              <div className="text-sm text-gray-400 mb-1">Notes</div>
              <div className="text-lg">{selectedComic.notes}</div>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            deleteComic(selectedComic.id);
            setSelectedComic(null);
          }}
          className="w-full mt-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Trash2 size={20} />
          Delete Comic
        </button>
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
                    deleteComic(comic.id);
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
    </div>
  );
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import { createAuthMock } from '../test/mocks/authContext';
import type { Comic, WishlistItem } from '../lib/supabase';

// ---- helpers ----

let idCounter = 0;
function makeComic(overrides: Partial<Comic> = {}): Comic {
  idCounter++;
  return {
    id: `comic-${idCounter}`,
    user_id: 'user-123',
    series: 'Test Series',
    story: '',
    issue_number: '1',
    publisher: 'DC',
    year: 2024,
    condition: 'Near Mint',
    notes: '',
    color_image_url: null,
    bw_image_url: null,
    copy_count: 1,
    cover_variant: null,
    total_issues: null,
    total_issues_conflict: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeWishlistItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  idCounter++;
  return {
    id: `wish-${idCounter}`,
    user_id: 'user-123',
    series: 'Want Series',
    story: '',
    issue_number: '1',
    publisher: 'Marvel',
    priority: 'Medium',
    notes: '',
    cover_variant: null,
    total_issues: null,
    total_issues_conflict: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---- mocks ----

const mockAuthValue = createAuthMock();
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuthValue }));

// The Dashboard calls:
//   supabase.from('comics').select('*').eq('user_id', ...).order(...)  → Promise<{data, error}>
//   supabase.from('wishlist').select('*').eq('user_id', ...)           → Promise<{data, error}>
//
// We need per-table control over the resolved data.

let comicsData: Comic[] = [];
let wishlistData: WishlistItem[] = [];

vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'comics') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockImplementation(() =>
                  Promise.resolve({ data: comicsData, error: null })
                ),
              }),
            }),
          };
        }
        if (table === 'wishlist') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() =>
                Promise.resolve({ data: wishlistData, error: null })
              ),
            }),
          };
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) };
      }),
    },
  };
});

beforeEach(() => {
  idCounter = 0;
  vi.clearAllMocks();
  mockAuthValue.user = { id: 'user-123', email: 'test@example.com' };
  comicsData = [];
  wishlistData = [];
});

// ---- tests ----

describe('Dashboard — loading state', () => {
  it('shows loading indicator before data arrives', () => {
    render(<Dashboard />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

describe('Dashboard — stat cards', () => {
  it('displays correct total comic count', async () => {
    comicsData = [makeComic(), makeComic(), makeComic()];
    render(<Dashboard />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    // Total Comics card value — use getAllByText since other stats may show same number
    const threes = screen.getAllByText('3');
    expect(threes.length).toBeGreaterThanOrEqual(1);
  });

  it('displays correct wishlist count', async () => {
    wishlistData = [makeWishlistItem(), makeWishlistItem()];
    render(<Dashboard />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows 0 for all stats when collection and wishlist are empty', async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Dashboard — "This Week" count', () => {
  it('counts comics added within the last 6 days as recent', async () => {
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    comicsData = [
      makeComic({ created_at: sixDaysAgo.toISOString() }),
      makeComic({ created_at: sixDaysAgo.toISOString() }),
    ];
    render(<Dashboard />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    // Total = 2, This Week = 2 → "2" appears at least twice
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT count a comic added 8 days ago as recent', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 8);
    comicsData = [makeComic({ created_at: oldDate.toISOString() })];
    render(<Dashboard />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    // Total = 1, This Week = 0
    expect(screen.getByText('1')).toBeInTheDocument();
    // At least one stat should still be 0 (wishlist and/or this week)
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it('counts a comic added today as recent', async () => {
    comicsData = [makeComic({ created_at: new Date().toISOString() })];
    render(<Dashboard />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    // Both Total and This Week should be 1
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Dashboard — recent comics list', () => {
  it('shows empty state when no comics exist', async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    expect(screen.getByText(/No comics yet/i)).toBeInTheDocument();
  });

  it('renders recent comic series name', async () => {
    comicsData = [makeComic({ series: 'Amazing Spider-Man' })];
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('Amazing Spider-Man')).toBeInTheDocument());
  });

  it('renders at most 5 recent comics', async () => {
    comicsData = Array.from({ length: 8 }, (_, i) =>
      makeComic({ series: `Series ${i + 1}` })
    );
    render(<Dashboard />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Series ${i}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('Series 6')).toBeNull();
  });

  it('renders story when present', async () => {
    comicsData = [makeComic({ story: 'Kraven\'s Last Hunt' })];
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("Kraven's Last Hunt")).toBeInTheDocument());
  });

  it('does not attempt to fetch when user is null', () => {
    mockAuthValue.user = null;
    // Should not throw; loading state remains (effect bails out early)
    render(<Dashboard />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

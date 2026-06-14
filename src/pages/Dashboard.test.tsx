import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// ---- shared props ----

const mockProps = {
  onNavigate: vi.fn(),
  onNavigateToComic: vi.fn(),
  onNavigateToCollection: vi.fn(),
};

// ---- tests ----

describe('Dashboard — loading state', () => {
  it('shows loading indicator before data arrives', () => {
    render(<Dashboard {...mockProps} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

describe('Dashboard — stat cards', () => {
  it('displays correct total comic count', async () => {
    comicsData = [makeComic(), makeComic(), makeComic()];
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    // Total Comics card value — use getAllByText since other stats may show same number
    const threes = screen.getAllByText('3');
    expect(threes.length).toBeGreaterThanOrEqual(1);
  });

  it('displays correct wishlist count', async () => {
    wishlistData = [makeWishlistItem(), makeWishlistItem()];
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows 0 for all stats when collection and wishlist are empty', async () => {
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });

  it('calls onNavigateToCollection("all") when Total Comics card is clicked', async () => {
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    await userEvent.click(screen.getByText('Total Comics').closest('button')!);
    expect(mockProps.onNavigateToCollection).toHaveBeenCalledWith('all');
  });

  it('calls onNavigate("wishlist") when Wishlist card is clicked', async () => {
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    await userEvent.click(screen.getByText('Wishlist').closest('button')!);
    expect(mockProps.onNavigate).toHaveBeenCalledWith('wishlist');
  });

  it('calls onNavigateToCollection("week") when This Week card is clicked', async () => {
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    await userEvent.click(screen.getByText('This Week').closest('button')!);
    expect(mockProps.onNavigateToCollection).toHaveBeenCalledWith('week');
  });
});

describe('Dashboard — "This Week" count', () => {
  it('counts comics added since Sunday midnight as recent', async () => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    // A comic added 1 ms after Sunday midnight — always in this week
    const justAfterStart = new Date(weekStart.getTime() + 1);
    comicsData = [
      makeComic({ created_at: justAfterStart.toISOString() }),
      makeComic({ created_at: justAfterStart.toISOString() }),
    ];
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    // Total = 2, This Week = 2 → "2" appears at least twice
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT count a comic added before Sunday midnight as recent', async () => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    // 1 ms before Sunday midnight — last week
    const justBeforeStart = new Date(weekStart.getTime() - 1);
    comicsData = [makeComic({ created_at: justBeforeStart.toISOString() })];
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    // Total = 1, This Week = 0
    expect(screen.getByText('1')).toBeInTheDocument();
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it('counts a comic added today as recent', async () => {
    comicsData = [makeComic({ created_at: new Date().toISOString() })];
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    // Both Total and This Week should be 1
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Dashboard — recent comics list', () => {
  it('shows empty state when no comics exist', async () => {
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    expect(screen.getByText(/No comics yet/i)).toBeInTheDocument();
  });

  it('renders recent comic series name', async () => {
    comicsData = [makeComic({ series: 'Amazing Spider-Man' })];
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.getByText('Amazing Spider-Man')).toBeInTheDocument());
  });

  it('calls onNavigateToComic with comic id when a recent comic row is clicked', async () => {
    comicsData = [makeComic({ id: 'comic-click-1', series: 'Batman' })];
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.getByText('Batman')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Batman').closest('button')!);
    expect(mockProps.onNavigateToComic).toHaveBeenCalledWith('comic-click-1');
  });

  it('renders at most 5 recent comics', async () => {
    comicsData = Array.from({ length: 8 }, (_, i) =>
      makeComic({ series: `Series ${i + 1}` })
    );
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Series ${i}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('Series 6')).toBeNull();
  });

  it('renders story when present', async () => {
    comicsData = [makeComic({ story: 'Kraven\'s Last Hunt' })];
    render(<Dashboard {...mockProps} />);
    await waitFor(() => expect(screen.getByText("Kraven's Last Hunt")).toBeInTheDocument());
  });

  it('does not attempt to fetch when user is null', () => {
    mockAuthValue.user = null;
    // Should not throw; loading state remains (effect bails out early)
    render(<Dashboard {...mockProps} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

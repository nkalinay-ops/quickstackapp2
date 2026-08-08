import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wishlist } from './Wishlist';
import { createAuthMock } from '../test/mocks/authContext';
import type { WishlistItem } from '../lib/supabase';

// ---- helpers ----

function makeItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'user-123',
    series: 'Hyde Street',
    story: '',
    issue_number: '1',
    publisher: 'Image Comics',
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

let mockWishlistData: WishlistItem[] = [];
let mockDeleteError: Error | null = null;
let mockInsertError: Error | null = null;
let mockWishlistDeleteError: Error | null = null;

// We need to capture the delete/insert calls to assert on them
const mockDeleteEq = vi.fn();
const mockInsert = vi.fn();
const mockWishlistDeleteEq = vi.fn();

vi.mock('../lib/supabase', () => {
  // Each call to supabase.from(table) returns a fresh builder
  const selectChain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'wishlist') {
          // Different shapes depending on chaining (select vs delete vs insert)
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({ data: mockWishlistData, error: null })
                ),
              })),
            })),
            delete: vi.fn(() => ({
              eq: mockDeleteEq,
            })),
            insert: vi.fn((data: unknown) => {
              void data;
              return Promise.resolve({ data: null, error: mockInsertError });
            }),
          };
        }
        if (table === 'comics') {
          return {
            insert: mockInsert,
          };
        }
        return selectChain;
      }),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthValue.user = { id: 'user-123', email: 'test@example.com' };
  mockWishlistData = [];
  mockDeleteError = null;
  mockInsertError = null;
  mockWishlistDeleteError = null;

  // Default: delete succeeds
  mockDeleteEq.mockResolvedValue({ error: mockDeleteError });
  mockInsert.mockResolvedValue({ error: mockInsertError });
  mockWishlistDeleteEq.mockResolvedValue({ error: mockWishlistDeleteError });
});

async function waitForLoad() {
  await waitFor(() => expect(screen.queryByText(/Loading/i)).toBeNull());
}

// ---- tests ----

describe('Wishlist — loading and empty state', () => {
  it('shows loading state initially', () => {
    render(<Wishlist />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('shows empty state when wishlist is empty', async () => {
    render(<Wishlist />);
    await waitForLoad();
    expect(screen.getByText(/Your wishlist is empty/i)).toBeInTheDocument();
  });
});

describe('Wishlist — item count label', () => {
  it('shows singular "1 item"', async () => {
    mockWishlistData = [makeItem()];
    render(<Wishlist />);
    await waitForLoad();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('shows plural "2 items"', async () => {
    mockWishlistData = [makeItem(), makeItem()];
    render(<Wishlist />);
    await waitForLoad();
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });
});

describe('Wishlist — priority badge colors', () => {
  it('renders High priority item with red badge', async () => {
    mockWishlistData = [makeItem({ id: 'h1', priority: 'High' })];
    render(<Wishlist />);
    await waitForLoad();
    // The badge is a <span>; filter buttons are <button> — query by role to be specific
    const badges = screen.getAllByText('High').filter(el => el.tagName === 'SPAN');
    expect(badges).toHaveLength(1);
    expect(badges[0].className).toContain('text-red-400');
  });

  it('renders Medium priority item with yellow badge', async () => {
    mockWishlistData = [makeItem({ id: 'm1', priority: 'Medium' })];
    render(<Wishlist />);
    await waitForLoad();
    const badges = screen.getAllByText('Medium').filter(el => el.tagName === 'SPAN');
    expect(badges).toHaveLength(1);
    expect(badges[0].className).toContain('text-yellow-400');
  });

  it('renders Low priority item with green badge', async () => {
    mockWishlistData = [makeItem({ id: 'l1', priority: 'Low' })];
    render(<Wishlist />);
    await waitForLoad();
    const badges = screen.getAllByText('Low').filter(el => el.tagName === 'SPAN');
    expect(badges).toHaveLength(1);
    expect(badges[0].className).toContain('text-green-400');
  });
});

describe('Wishlist — delete flow', () => {
  it('opens a destructive confirm modal when delete icon is clicked', async () => {
    const item = makeItem({ id: 'del-1', series: 'Batman' });
    mockWishlistData = [item];
    render(<Wishlist />);
    await waitForLoad();

    // The delete button has a Trash2 icon — it's the last button in the item row
    const deleteBtn = screen.getByRole('button', { name: '' }); // icon-only button
    await userEvent.click(deleteBtn);

    expect(screen.getByText('Remove from Wishlist')).toBeInTheDocument();
  });

  it('removes item from list after confirm delete', async () => {
    const item = makeItem({ id: 'del-2', series: 'Batman' });
    mockWishlistData = [item];
    mockDeleteEq.mockResolvedValue({ error: null });

    render(<Wishlist />);
    await waitForLoad();

    const deleteBtn = screen.getByRole('button', { name: '' });
    await userEvent.click(deleteBtn);

    // Confirm modal appears — click the Remove button
    await userEvent.click(screen.getByRole('button', { name: /Remove/i }));

    await waitFor(() => {
      expect(screen.getByText(/Your wishlist is empty/i)).toBeInTheDocument();
    });
  });

  it('shows error AlertModal when delete fails', async () => {
    const item = makeItem({ id: 'del-3', series: 'Batman' });
    mockWishlistData = [item];
    mockDeleteEq.mockResolvedValue({ error: new Error('DB error') });

    render(<Wishlist />);
    await waitForLoad();

    const deleteBtn = screen.getByRole('button', { name: '' });
    await userEvent.click(deleteBtn);
    await userEvent.click(screen.getByRole('button', { name: /Remove/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to remove item/i)).toBeInTheDocument();
    });
  });
});

describe('Wishlist — acquire flow', () => {
  it('opens a confirm modal when Acquired is clicked', async () => {
    mockWishlistData = [makeItem({ series: 'X-Men' })];
    render(<Wishlist />);
    await waitForLoad();

    await userEvent.click(screen.getByRole('button', { name: /Acquired/i }));
    // Modal heading is "Move to Collection" — use heading role to be specific
    expect(screen.getByRole('heading', { name: 'Move to Collection' })).toBeInTheDocument();
  });

  it('shows success AlertModal after acquire', async () => {
    const item = makeItem({ series: 'X-Men' });
    mockWishlistData = [item];
    // comics insert succeeds
    mockInsert.mockResolvedValue({ error: null });
    // wishlist delete succeeds
    mockDeleteEq.mockResolvedValue({ error: null });

    render(<Wishlist />);
    await waitForLoad();

    await userEvent.click(screen.getByRole('button', { name: /Acquired/i }));
    await userEvent.click(screen.getByRole('button', { name: /Move to Collection/i }));

    await waitFor(() => {
      expect(screen.getByText(/Added to collection/i)).toBeInTheDocument();
    });
  });

  it('shows error AlertModal when comics insert fails during acquire', async () => {
    const item = makeItem({ series: 'X-Men' });
    mockWishlistData = [item];
    mockInsert.mockResolvedValue({ error: new Error('Insert failed') });

    render(<Wishlist />);
    await waitForLoad();

    await userEvent.click(screen.getByRole('button', { name: /Acquired/i }));
    await userEvent.click(screen.getByRole('button', { name: /Move to Collection/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to move to collection/i)).toBeInTheDocument();
    });
  });
});

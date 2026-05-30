import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddComic } from './AddComic';
import { createAuthMock } from '../test/mocks/authContext';
import type { Comic } from '../lib/supabase';

// ---- mocks ----

const mockAuthValue = createAuthMock();
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuthValue }));

vi.mock('../components/CameraCapture', () => ({
  CameraCapture: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close Camera</button>
  ),
}));

vi.mock('../utils/imageOptimizer', () => ({
  optimizeImageForOCR: vi.fn(),
}));

let mockDuplicateResult: Comic | null = null;
let mockInsertError: Error | null = null;

vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'comics') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockReturnValue({
                    ilike: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockImplementation(() =>
                        Promise.resolve({ data: mockDuplicateResult, error: null })
                      ),
                    }),
                    // total issues conflict check path
                    not: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockImplementation(() =>
              Promise.resolve({ data: null, error: mockInsertError })
            ),
          };
        }
        if (table === 'wishlist') {
          return {
            insert: vi.fn().mockImplementation(() =>
              Promise.resolve({ data: null, error: null })
            ),
          };
        }
        if (table === 'ocr_correction_rules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'user_scan_preferences') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { correction_threshold: 3 },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn() }),
        };
      }),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ data: { path: 'path.jpg' }, error: null }),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://mock/path.jpg' } })),
        })),
      },
    },
  };
});

function makeComic(overrides: Partial<Comic> = {}): Comic {
  return {
    id: 'comic-1',
    user_id: 'user-123',
    series: 'Hyde Street',
    story: '',
    issue_number: '1',
    publisher: 'Image',
    year: null,
    condition: 'Near Mint',
    notes: '',
    color_image_url: null,
    bw_image_url: null,
    copy_count: 1,
    cover_variant: null,
    total_issues: null,
    total_issues_conflict: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthValue.user = { id: 'user-123', email: 'test@example.com' };
  mockAuthValue.userTier = 'free';
  mockDuplicateResult = null;
  mockInsertError = null;
});

// ---- helpers ----

async function fillForm(series = 'Hyde Street', issue = '1') {
  await userEvent.type(screen.getByLabelText(/^Series/i), series);
  // Label is "Issue #"
  await userEvent.type(screen.getByLabelText(/^Issue #/i), issue);
}

// ---- tests ----

describe('AddComic — initial render', () => {
  it('renders the page heading', () => {
    render(<AddComic />);
    expect(screen.getByText('Add Comic')).toBeInTheDocument();
  });

  it('defaults to Collection mode', () => {
    render(<AddComic />);
    expect(screen.getByText('Add to your collection')).toBeInTheDocument();
  });

  it('renders the Series input field', () => {
    render(<AddComic />);
    expect(screen.getByLabelText(/^Series/i)).toBeInTheDocument();
  });

  it('renders the Scan Comic Cover button', () => {
    render(<AddComic />);
    expect(screen.getByRole('button', { name: /Scan Comic Cover/i })).toBeInTheDocument();
  });

  it('renders the submit button with "Add to Collection" label', () => {
    render(<AddComic />);
    expect(screen.getByRole('button', { name: /Add to Collection/i })).toBeInTheDocument();
  });
});

describe('AddComic — mode switching', () => {
  it('shows Priority label when switched to Wishlist mode', async () => {
    render(<AddComic />);
    await userEvent.click(screen.getByRole('button', { name: /^Wishlist$/i }));
    // Priority is a plain <label> (not for= associated), query by text
    expect(screen.getByText('Priority')).toBeInTheDocument();
    // Priority options (High, Medium, Low) should be present
    expect(screen.getByRole('button', { name: /^High$/i })).toBeInTheDocument();
  });

  it('shows Condition label in Collection mode', () => {
    render(<AddComic />);
    // Condition is rendered as a plain <label> (no for= attribute)
    expect(screen.getByText('Condition')).toBeInTheDocument();
  });

  it('hides Condition section when switched to Wishlist mode', async () => {
    render(<AddComic />);
    await userEvent.click(screen.getByRole('button', { name: /^Wishlist$/i }));
    expect(screen.queryByText('Condition')).toBeNull();
  });

  it('hides Year field when switched to Wishlist mode', async () => {
    render(<AddComic />);
    await userEvent.click(screen.getByRole('button', { name: /^Wishlist$/i }));
    expect(screen.queryByLabelText(/^Year/i)).toBeNull();
  });

  it('shows submit button with "Add to Wishlist" label in wishlist mode', async () => {
    render(<AddComic />);
    await userEvent.click(screen.getByRole('button', { name: /^Wishlist$/i }));
    expect(screen.getByRole('button', { name: /Add to Wishlist/i })).toBeInTheDocument();
  });
});

describe('AddComic — scan limit (free tier)', () => {
  it('disables Scan button when monthly limit is reached', async () => {
    const { supabase } = await import('../lib/supabase');
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { monthly_scan_count: 20, renewal_interval: 'month' },
      error: null,
    });
    render(<AddComic />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Scan Comic Cover/i })).toBeDisabled();
    });
  });

  it('shows "Monthly scan limit reached" message for free users at limit', async () => {
    const { supabase } = await import('../lib/supabase');
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { monthly_scan_count: 20, renewal_interval: 'month' },
      error: null,
    });
    render(<AddComic />);
    await waitFor(() => {
      expect(screen.getByText(/Monthly scan limit reached/i)).toBeInTheDocument();
    });
  });

  it('does not show scan usage for paid users', async () => {
    mockAuthValue.userTier = 'paid';
    render(<AddComic />);
    await waitFor(() => {
      expect(screen.queryByText(/scans used/i)).toBeNull();
    });
  });
});

describe('AddComic — duplicate detection', () => {
  it('opens duplicate modal when an existing comic matches series and issue', async () => {
    mockDuplicateResult = makeComic();
    render(<AddComic />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /Add to Collection/i }));

    await waitFor(() => {
      expect(screen.getByText('Duplicate Comic Detected')).toBeInTheDocument();
    });
  });

  it('does NOT open duplicate modal when no existing comic matches', async () => {
    mockDuplicateResult = null;
    render(<AddComic />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /Add to Collection/i }));

    await waitFor(() => {
      expect(screen.queryByText('Duplicate Comic Detected')).toBeNull();
    });
  });
});

describe('AddComic — form reset after successful submit', () => {
  it('clears the Series field after a successful collection add', async () => {
    render(<AddComic />);
    await fillForm('Batman');
    await userEvent.click(screen.getByRole('button', { name: /Add to Collection/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^Series/i)).toHaveValue('');
    });
  });

  it('clears the Issue # field after a successful collection add', async () => {
    render(<AddComic />);
    await fillForm('Batman', '42');
    await userEvent.click(screen.getByRole('button', { name: /Add to Collection/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^Issue #/i)).toHaveValue('');
    });
  });
});

describe('AddComic — submit validation', () => {
  it('submit button is disabled when Series field is empty', () => {
    render(<AddComic />);
    expect(screen.getByRole('button', { name: /Add to Collection/i })).toBeDisabled();
  });

  it('submit button becomes enabled after Series is typed', async () => {
    render(<AddComic />);
    await userEvent.type(screen.getByLabelText(/^Series/i), 'Batman');
    expect(screen.getByRole('button', { name: /Add to Collection/i })).not.toBeDisabled();
  });
});

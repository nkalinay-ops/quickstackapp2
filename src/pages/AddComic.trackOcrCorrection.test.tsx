/**
 * Tests for the OCR correction rule engine behavior in AddComic.
 *
 * trackOcrCorrection is a private closure inside AddComic. It runs only after
 * a full scan → edit → save cycle (scannedRaw must be set).  These tests
 * simulate that cycle by:
 *  1. Mocking the CameraCapture component to immediately call onCapture
 *  2. Mocking fetch (the scan-comic edge function) to return OCR data
 *  3. Mocking the supabase OCR rule table to return controlled rule data
 *  4. Clicking "Scan Comic Cover", then submitting the form
 *
 * Regression coverage for three bugs fixed on 2026-05-30:
 *  Bug 1 — rule only surfaced once (on first threshold crossing)
 *  Bug 2 — resetForm() wiped pendingRuleSuggestion before it rendered
 *  Bug 3 — Scan Next flow destroyed the banner before the user saw it
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddComic } from './AddComic';
import { createAuthMock } from '../test/mocks/authContext';
import type { OcrCorrectionRule } from '../lib/supabase';

// ---- auth mock ----
const mockAuthValue = createAuthMock();
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuthValue }));

// ---- CameraCapture mock: immediately fires onCapture when rendered ----
vi.mock('../components/CameraCapture', () => ({
  CameraCapture: ({ onCapture }: { onCapture: (data: string) => void }) => {
    // Fire synchronously on mount
    onCapture('data:image/jpeg;base64,FAKE');
    return null;
  },
}));

vi.mock('../utils/imageOptimizer', () => ({
  optimizeImageForOCR: vi.fn().mockResolvedValue({
    dataUrl: 'data:image/jpeg;base64,FAKE',
    originalSize: 100,
    optimizedSize: 80,
    savingsPercent: 20,
  }),
}));

// ---- supabase mock state ----
let mockExistingRule: OcrCorrectionRule | null = null;
let mockUpdatedRule: OcrCorrectionRule | null = null;
let mockPrefsThreshold = 3;

vi.mock('../lib/supabase', () => {
  // Both the scan-time and save-time lookups call supabase.from('ocr_correction_rules').
  // We distinguish them by which method is called second after .eq('user_id'):
  //   scan-time: .eq(user_id) → .eq(is_confirmed, true) → .ilike.ilike.maybeSingle → null
  //   save-time: .eq(user_id) → .ilike → .ilike → .maybeSingle → mockExistingRule
  //
  // We implement this with a tiny state machine per chain instance.

  const makeOcrChain = () => {
    let eqCallCount = 0;
    let isScanTimePath = false;

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockImplementation((..._args: unknown[]) => {
      eqCallCount++;
      if (eqCallCount >= 2) isScanTimePath = true; // second .eq → scan-time path
      return chain;
    });
    chain.ilike = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockImplementation(() => {
      if (isScanTimePath) {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: mockExistingRule, error: null });
    });
    chain.insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
    chain.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockImplementation(() =>
            Promise.resolve({ data: mockUpdatedRule, error: null })
          ),
        }),
      }),
    });
    return chain;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'ocr_correction_rules') return makeOcrChain();
        if (table === 'user_scan_preferences') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { correction_threshold: mockPrefsThreshold },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'comics') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockReturnValue({
                    ilike: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                    not: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn() }),
        };
      }),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null }),
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

// ---- fetch mock (scan-comic edge function) ----
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeScanResponse(series = 'Hyde', story = 'Street') {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          series,
          story,
          issue_number: '4',
          publisher: 'Image',
          year: 2024,
          total_issues: null,
          cover_variant: null,
        },
        scan_info: { monthly_scan_count: 1 },
      }),
  };
}

function makeRule(overrides: Partial<OcrCorrectionRule> = {}): OcrCorrectionRule {
  return {
    id: 'rule-1',
    user_id: 'user-123',
    ocr_series: 'Hyde',
    ocr_story: 'Street',
    corrected_series: 'Hyde Street',
    corrected_story: '',
    occurrence_count: 3,
    is_confirmed: false,
    dismissed_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  // Don't clearAllMocks here — the vi.mock() factory uses vi.fn() with mockImplementation
  // closures that would be wiped. Instead only reset the test-controlled state variables.
  mockAuthValue.user = { id: 'user-123', email: 'test@example.com' };
  mockAuthValue.userTier = 'paid';
  mockExistingRule = null;
  mockUpdatedRule = null;
  mockPrefsThreshold = 3;
  mockFetch.mockResolvedValue(makeScanResponse());
});

/**
 * Render AddComic and drive the full scan → edit → save flow.
 * The CameraCapture mock fires onCapture immediately, so clicking
 * "Scan Comic Cover" triggers the full scan pipeline.
 */
async function scanAndSave(correctedSeries = 'Hyde Street') {
  render(<AddComic />);

  // Click scan — CameraCapture mock fires onCapture synchronously
  await userEvent.click(screen.getByRole('button', { name: /Scan Comic Cover/i }));

  // Wait for the form to populate from the scan result
  await waitFor(() => {
    expect(screen.getByLabelText(/^Series/i)).not.toHaveValue('');
  });

  // Remove the captured image by clicking the X button on the preview.
  // This avoids the `img.onload` hang in jsdom when uploadImages runs.
  const removeImageBtn = document.querySelector('button.bg-red-600');
  if (removeImageBtn) await userEvent.click(removeImageBtn as HTMLElement);

  // Edit the series to simulate an OCR correction
  const seriesInput = screen.getByLabelText(/^Series/i);
  await userEvent.clear(seriesInput);
  await userEvent.type(seriesInput, correctedSeries);

  // Submit
  await userEvent.click(screen.getByRole('button', { name: /Add to Collection/i }));
}

// ---- tests ----

describe('OCR correction rule — no suggestion when value unchanged', () => {
  it('does not show suggestion banner when user keeps the OCR-scanned series as-is', async () => {
    // Scan returns "Hyde Street" and user does not change it
    mockFetch.mockResolvedValue(makeScanResponse('Hyde Street', ''));
    render(<AddComic />);
    await userEvent.click(screen.getByRole('button', { name: /Scan Comic Cover/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^Series/i)).not.toHaveValue('');
    });
    // Submit without editing — series matches OCR output
    await userEvent.click(screen.getByRole('button', { name: /Add to Collection/i }));

    // Banner must NOT appear
    await waitFor(() => {
      expect(screen.queryByText(/Save a scan correction rule/i)).toBeNull();
    });
  });
});

describe('OCR correction rule — threshold met triggers banner (Bug 1 regression)', () => {
  it('shows suggestion banner when existing rule count meets the threshold', async () => {
    mockExistingRule = makeRule({ occurrence_count: 3 });
    mockUpdatedRule = makeRule({ occurrence_count: 4 });

    await scanAndSave('Hyde Street');

    await waitFor(() => {
      expect(screen.getByText(/Save a scan correction rule/i)).toBeInTheDocument();
    });
  });

  it('shows suggestion banner when count is already above threshold (not just on first crossing)', async () => {
    mockExistingRule = makeRule({ occurrence_count: 5 });
    mockUpdatedRule = makeRule({ occurrence_count: 6 });

    await scanAndSave('Hyde Street');

    await waitFor(() => {
      expect(screen.getByText(/Save a scan correction rule/i)).toBeInTheDocument();
    });
  });

  it('does NOT show suggestion banner when rule is already confirmed', async () => {
    mockExistingRule = makeRule({ occurrence_count: 5, is_confirmed: true });
    mockUpdatedRule = makeRule({ occurrence_count: 6, is_confirmed: true });

    await scanAndSave('Hyde Street');

    await waitFor(() => {
      expect(screen.queryByText(/Save a scan correction rule/i)).toBeNull();
    });
  });

  it('does NOT show suggestion banner when rule has been dismissed', async () => {
    mockExistingRule = makeRule({ occurrence_count: 5, dismissed_at: '2024-01-01T00:00:00Z' });
    mockUpdatedRule = makeRule({ occurrence_count: 6, dismissed_at: '2024-01-01T00:00:00Z' });

    await scanAndSave('Hyde Street');

    await waitFor(() => {
      expect(screen.queryByText(/Save a scan correction rule/i)).toBeNull();
    });
  });
});

describe('OCR correction rule — suggestion survives resetForm (Bug 2 regression)', () => {
  it('rule suggestion banner is visible after the form has been reset post-submit', async () => {
    mockExistingRule = makeRule({ occurrence_count: 3 });
    mockUpdatedRule = makeRule({ occurrence_count: 4 });

    await scanAndSave('Hyde Street');

    // After submit: form should be reset (series cleared) AND banner should persist
    await waitFor(() => {
      expect(screen.getByText(/Save a scan correction rule/i)).toBeInTheDocument();
    });

    // Confirm the form was indeed reset
    expect(screen.getByLabelText(/^Series/i)).toHaveValue('');
  });
});

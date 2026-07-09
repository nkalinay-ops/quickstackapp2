/**
 * Tests for scan count display in Settings.
 *
 * Settings must read monthlyScanCount and scanLimit from AuthContext — not from
 * its own local DB fetch — so that the display updates immediately after a scan
 * without requiring a page reload or navigation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Settings } from './Settings';
import { createAuthMock } from '../test/mocks/authContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAuth = createAuthMock();

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock('../lib/capacitorSetup', () => ({
  isNativePlatform: vi.fn().mockReturnValue(false),
  openLegalLink: vi.fn(),
}));

vi.mock('@capacitor/app', () => ({
  App: { getInfo: vi.fn().mockResolvedValue({ version: '1.0.0' }) },
}));

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: { getOfferings: vi.fn().mockResolvedValue({ current: null }) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to free-tier defaults
  mockAuth.userTier = 'free';
  mockAuth.monthlyScanCount = 0;
  mockAuth.scanLimit = 20;
  mockAuth.user = { id: 'user-123', email: 'test@example.com' };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Settings scan count — displays context values', () => {
  it('shows the scan count and limit from context', () => {
    mockAuth.monthlyScanCount = 7;
    mockAuth.scanLimit = 20;

    render(<Settings />);

    expect(screen.getByText('7 / 20')).toBeInTheDocument();
  });

  it('reflects an updated count without re-fetching from the database', () => {
    mockAuth.monthlyScanCount = 15;
    mockAuth.scanLimit = 20;

    render(<Settings />);

    expect(screen.getByText('15 / 20')).toBeInTheDocument();
  });

  it('shows count 0 at the start of a month', () => {
    mockAuth.monthlyScanCount = 0;
    mockAuth.scanLimit = 20;

    render(<Settings />);

    expect(screen.getByText('0 / 20')).toBeInTheDocument();
  });

  it('shows count matching limit when limit is reached', () => {
    mockAuth.monthlyScanCount = 20;
    mockAuth.scanLimit = 20;

    render(<Settings />);

    expect(screen.getByText('20 / 20')).toBeInTheDocument();
  });

  it('shows paid plan limit of 500', () => {
    mockAuth.userTier = 'paid';
    mockAuth.monthlyScanCount = 42;
    mockAuth.scanLimit = 500;

    render(<Settings />);

    expect(screen.getByText('42 / 500')).toBeInTheDocument();
  });
});

describe('Settings scan count — hidden for unlimited tiers', () => {
  it('does not show scan count for plus tier', () => {
    mockAuth.userTier = 'plus';
    mockAuth.monthlyScanCount = null;
    mockAuth.scanLimit = null;

    render(<Settings />);

    expect(screen.queryByText(/\/ \d/)).toBeNull();
    expect(screen.getByText('Unlimited scans per month')).toBeInTheDocument();
  });

  it('does not show scan count when monthlyScanCount is null', () => {
    mockAuth.monthlyScanCount = null;
    mockAuth.scanLimit = 20;

    render(<Settings />);

    expect(screen.queryByText(/\d+ \/ 20/)).toBeNull();
  });
});

describe('Settings scan count — does not call get_user_scan_info', () => {
  it('does not make a Supabase RPC call to fetch scan info on render', async () => {
    const { supabase } = await import('../lib/supabase');
    mockAuth.monthlyScanCount = 3;
    mockAuth.scanLimit = 20;

    render(<Settings />);

    expect(supabase.rpc).not.toHaveBeenCalledWith('get_user_scan_info', expect.anything());
  });
});

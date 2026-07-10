/**
 * Tests for scan count behavior in AuthContext.
 *
 * Covers:
 * - Scan count and limit populated from get_user_scan_info on login
 * - setScanCount updates monthlyScanCount in context
 * - TOKEN_REFRESHED does NOT re-fetch scan info (prevents race with AddComic setScanCount)
 * - Plus/admin tiers get null count and null limit
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';

// ---------------------------------------------------------------------------
// Controllable mock state — all variables prefixed with "mock" so Vitest's
// hoist can see them inside the vi.mock factory. References inside factory
// functions are wrapped in closures so they're evaluated at call time, not
// during hoisting.
// ---------------------------------------------------------------------------

let mockScanInfo = { monthly_scan_count: 5, scan_limit: 20, renewal_interval: 'month' };
let mockUserTier = 'free';
const mockRpc = vi.fn();
let mockAuthStateCallback: ((event: string, session: unknown) => void) | null = null;
const mockRpcCallCount = { value: 0 };

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        mockAuthStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockImplementation(() =>
                Promise.resolve({ data: { is_admin: false, user_tier: mockUserTier }, error: null })
              ),
            }),
          }),
        };
      }
      // user_terminations
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    }),
    rpc: (...args: unknown[]) => {
      mockRpcCallCount.value++;
      return mockRpc(...args);
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  },
}));

vi.mock('../lib/capacitorSetup', () => ({
  isNativePlatform: vi.fn().mockReturnValue(false),
  loginRevenueCat: vi.fn(),
  logoutRevenueCat: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const fakeSession = {
  user: { id: 'user-123', email: 'test@example.com', email_confirmed_at: '2024-01-01' },
  access_token: 'tok',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUserTier = 'free';
  mockScanInfo = { monthly_scan_count: 5, scan_limit: 20, renewal_interval: 'month' };
  mockAuthStateCallback = null;
  mockRpcCallCount.value = 0;
  mockRpc.mockImplementation(() => Promise.resolve({ data: mockScanInfo, error: null }));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fireAuthEvent(event: string, session: unknown = null) {
  await act(async () => {
    mockAuthStateCallback!(event, session);
    await new Promise(r => setTimeout(r, 0));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthContext scan count — populated on login', () => {
  it('sets monthlyScanCount from get_user_scan_info after INITIAL_SESSION', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    expect(result.current.monthlyScanCount).toBe(5);
  });

  it('sets scanLimit from get_user_scan_info after INITIAL_SESSION', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    expect(result.current.scanLimit).toBe(20);
  });

  it('sets scanRenewalInterval to "day" when RPC returns "day"', async () => {
    mockScanInfo = { monthly_scan_count: 3, scan_limit: 20, renewal_interval: 'day' };
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    expect(result.current.scanRenewalInterval).toBe('day');
  });

  it('sets scanRenewalInterval to "month" when RPC returns "month"', async () => {
    mockScanInfo = { monthly_scan_count: 3, scan_limit: 20, renewal_interval: 'month' };
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    expect(result.current.scanRenewalInterval).toBe('month');
  });
});

describe('AuthContext scan count — setScanCount', () => {
  it('updates monthlyScanCount when setScanCount is called', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    act(() => { result.current.setScanCount(12); });

    expect(result.current.monthlyScanCount).toBe(12);
  });

  it('increments correctly when called multiple times', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    act(() => { result.current.setScanCount(1); });
    act(() => { result.current.setScanCount(2); });
    act(() => { result.current.setScanCount(3); });

    expect(result.current.monthlyScanCount).toBe(3);
  });

  it('accepts null to clear the count', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    act(() => { result.current.setScanCount(null); });

    expect(result.current.monthlyScanCount).toBeNull();
  });

  it('does not change scanLimit when setScanCount is called', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    act(() => { result.current.setScanCount(18); });

    expect(result.current.scanLimit).toBe(20);
  });
});

describe('AuthContext scan count — TOKEN_REFRESHED does not reset count', () => {
  it('does not call get_user_scan_info on TOKEN_REFRESHED', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);
    const rpcCallsAfterLogin = mockRpcCallCount.value;

    act(() => { result.current.setScanCount(8); });
    await fireAuthEvent('TOKEN_REFRESHED', fakeSession);

    expect(mockRpcCallCount.value).toBe(rpcCallsAfterLogin);
  });

  it('preserves the count set by setScanCount after TOKEN_REFRESHED fires', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    act(() => { result.current.setScanCount(8); });
    await fireAuthEvent('TOKEN_REFRESHED', fakeSession);

    expect(result.current.monthlyScanCount).toBe(8);
  });

  it('simulates the race: TOKEN_REFRESHED after each scan still increments correctly', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    // Scan 1: backend returns count=1
    act(() => { result.current.setScanCount(1); });
    await fireAuthEvent('TOKEN_REFRESHED', fakeSession);
    expect(result.current.monthlyScanCount).toBe(1);

    // Scan 2: backend returns count=2
    act(() => { result.current.setScanCount(2); });
    await fireAuthEvent('TOKEN_REFRESHED', fakeSession);
    expect(result.current.monthlyScanCount).toBe(2);

    // Scan 3: backend returns count=3
    act(() => { result.current.setScanCount(3); });
    await fireAuthEvent('TOKEN_REFRESHED', fakeSession);
    expect(result.current.monthlyScanCount).toBe(3);
  });

  it('updates the session on TOKEN_REFRESHED', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    const newSession = { ...fakeSession, access_token: 'new-tok' };
    await fireAuthEvent('TOKEN_REFRESHED', newSession);

    expect(result.current.session).toBe(newSession);
  });
});

describe('AuthContext scan count — plus and admin tiers', () => {
  it('sets monthlyScanCount to null for plus tier', async () => {
    mockUserTier = 'plus';
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    expect(result.current.monthlyScanCount).toBeNull();
  });

  it('sets scanLimit to null for plus tier', async () => {
    mockUserTier = 'plus';
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    expect(result.current.scanLimit).toBeNull();
  });

  it('does not call get_user_scan_info for plus tier', async () => {
    mockUserTier = 'plus';
    renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);

    expect(mockRpcCallCount.value).toBe(0);
  });

  it('resets count and limit to null on sign-out', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await fireAuthEvent('INITIAL_SESSION', fakeSession);
    expect(result.current.monthlyScanCount).toBe(5);

    await fireAuthEvent('SIGNED_OUT', null);

    expect(result.current.monthlyScanCount).toBeNull();
    expect(result.current.scanLimit).toBeNull();
  });
});

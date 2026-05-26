import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// Silence the INITIAL_SESSION handler which calls into Supabase tables — we
// don't need it for signUp-specific tests.
function stubInitialSession() {
  mockOnAuthStateChange.mockImplementation((callback: (event: string, session: null) => void) => {
    // fire a session-less INITIAL_SESSION so loading resolves
    callback('INITIAL_SESSION', null);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubInitialSession();
});

// ---------------------------------------------------------------------------
// signUp — needsEmailConfirmation
// ---------------------------------------------------------------------------

describe('AuthContext.signUp', () => {
  it('returns needsEmailConfirmation: true when signUp yields no session', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let outcome!: { needsEmailConfirmation: boolean };
    await act(async () => {
      outcome = await result.current.signUp('new@example.com', 'securepass123');
    });

    expect(outcome.needsEmailConfirmation).toBe(true);
  });

  it('returns needsEmailConfirmation: false when signUp yields an immediate session', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        session: { access_token: 'tok', refresh_token: 'ref' },
        user: { id: 'u1' },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let outcome!: { needsEmailConfirmation: boolean };
    await act(async () => {
      outcome = await result.current.signUp('instant@example.com', 'securepass123');
    });

    expect(outcome.needsEmailConfirmation).toBe(false);
  });

  it('throws when Supabase returns an error', async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Email already registered' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(
        result.current.signUp('dup@example.com', 'securepass123')
      ).rejects.toThrow('Email already registered');
    });
  });

  it('passes emailRedirectTo option pointing to /?page=email-confirmed', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signUp('new@example.com', 'securepass123');
    });

    const callArgs = mockSignUp.mock.calls[0][0];
    expect(callArgs.options?.emailRedirectTo).toContain('email-confirmed');
  });

  it('does not call signIn during signUp', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signUp('new@example.com', 'securepass123');
    });

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});

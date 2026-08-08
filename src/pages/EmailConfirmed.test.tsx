import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailConfirmed } from './EmailConfirmed';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSignOut = vi.fn().mockResolvedValue({});

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  },
}));

const mockDispatch = vi.fn();
const mockReplaceState = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.dispatchEvent = mockDispatch;
  window.history.replaceState = mockReplaceState;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmailConfirmed', () => {
  it('renders the confirmation heading', () => {
    render(<EmailConfirmed />);
    expect(screen.getByText('Email confirmed')).toBeInTheDocument();
  });

  it('renders the descriptive body text', () => {
    render(<EmailConfirmed />);
    expect(screen.getByText(/Your account is ready/)).toBeInTheDocument();
  });

  it('renders the Go to Sign In button', () => {
    render(<EmailConfirmed />);
    expect(screen.getByRole('button', { name: /Go to Sign In/i })).toBeInTheDocument();
  });

  it('shows the logo image', () => {
    render(<EmailConfirmed />);
    const logo = screen.getByRole('img', { name: /QuickStack/i });
    expect(logo).toBeInTheDocument();
  });

  it('calls supabase.auth.signOut with global scope when button is clicked', async () => {
    render(<EmailConfirmed />);
    fireEvent.click(screen.getByRole('button', { name: /Go to Sign In/i }));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' });
    });
  });

  it('dispatches navigate event to auth after sign out', async () => {
    render(<EmailConfirmed />);
    fireEvent.click(screen.getByRole('button', { name: /Go to Sign In/i }));
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'navigate', detail: 'auth' })
      );
    });
  });

  it('clears the URL query string after sign out', async () => {
    render(<EmailConfirmed />);
    fireEvent.click(screen.getByRole('button', { name: /Go to Sign In/i }));
    await waitFor(() => {
      expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/');
    });
  });

  it('disables the button while sign-out is in progress', async () => {
    let resolveSignOut!: () => void;
    mockSignOut.mockReturnValueOnce(new Promise<void>((res) => { resolveSignOut = res; }));

    render(<EmailConfirmed />);
    const btn = screen.getByRole('button', { name: /Go to Sign In/i });
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());

    resolveSignOut();
    await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
  });
});

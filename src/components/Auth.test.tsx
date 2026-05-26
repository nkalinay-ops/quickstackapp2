import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Auth } from './Auth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signUp: mockSignUp,
  }),
}));

vi.mock('../lib/capacitorSetup', () => ({
  openLegalLink: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAuth() {
  return render(<Auth />);
}

async function switchToSignUp() {
  await userEvent.click(screen.getByRole('button', { name: /Don't have an account\? Sign Up/i }));
}

// ---------------------------------------------------------------------------
// Sign-in view (default)
// ---------------------------------------------------------------------------

describe('Auth — sign-in view', () => {
  it('renders email and password fields', () => {
    renderAuth();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders Sign In submit button', () => {
    renderAuth();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('renders Forgot your password link', () => {
    renderAuth();
    expect(screen.getByRole('button', { name: /Forgot your password/i })).toBeInTheDocument();
  });

  it('does not render confirm password or legal text in sign-in mode', () => {
    renderAuth();
    expect(screen.queryByLabelText(/Confirm Password/i)).toBeNull();
    expect(screen.queryByText(/Terms of Service/i)).toBeNull();
  });

  it('calls signIn with email and password on submit', async () => {
    mockSignIn.mockResolvedValue(undefined);
    renderAuth();

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'securepass123');
    });
  });

  it('shows error message when signIn throws', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'));
    renderAuth();

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Sign-up view
// ---------------------------------------------------------------------------

describe('Auth — sign-up view', () => {
  it('shows confirm password field after switching to sign-up', async () => {
    renderAuth();
    await switchToSignUp();
    expect(screen.getByLabelText(/Confirm Password/i, { selector: 'input' })).toBeInTheDocument();
  });

  it('shows Terms of Service and Privacy Policy links', async () => {
    renderAuth();
    await switchToSignUp();
    expect(screen.getByRole('button', { name: /Terms of Service/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Privacy Policy/i })).toBeInTheDocument();
  });

  it('shows Create Account submit button', async () => {
    renderAuth();
    await switchToSignUp();
    expect(screen.getByRole('button', { name: /Create Account/i })).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    renderAuth();
    await switchToSignUp();

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'securepass123');
    await userEvent.type(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), 'differentpass1');
    await userEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('shows error when password fails strength validation', async () => {
    renderAuth();
    await switchToSignUp();

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.type(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), 'short');
    await userEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(screen.getByText(/Password must be at least/i)).toBeInTheDocument();
    });
  });

  it('shows check-your-email screen when signUp returns needsEmailConfirmation', async () => {
    mockSignUp.mockResolvedValue({ needsEmailConfirmation: true });
    renderAuth();
    await switchToSignUp();

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'securepass123');
    await userEvent.type(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
      expect(screen.getByText('new@example.com')).toBeInTheDocument();
    });
  });

  it('does not show check-your-email screen when signUp returns no confirmation needed', async () => {
    mockSignUp.mockResolvedValue({ needsEmailConfirmation: false });
    renderAuth();
    await switchToSignUp();

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'securepass123');
    await userEvent.type(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(screen.queryByText('Check your email')).toBeNull();
    });
  });

  it('calls signUp with correct email and password', async () => {
    mockSignUp.mockResolvedValue({ needsEmailConfirmation: true });
    renderAuth();
    await switchToSignUp();

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'securepass123');
    await userEvent.type(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('new@example.com', 'securepass123');
    });
  });

  it('shows signUp error message on failure', async () => {
    mockSignUp.mockRejectedValue(new Error('Email already in use'));
    renderAuth();
    await switchToSignUp();

    await userEvent.type(screen.getByLabelText('Email'), 'dup@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'securepass123');
    await userEvent.type(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(screen.getByText('Email already in use')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Check-your-email screen
// ---------------------------------------------------------------------------

describe('Auth — check-your-email screen', () => {
  async function reachCheckEmail(email = 'pending@example.com') {
    mockSignUp.mockResolvedValue({ needsEmailConfirmation: true });
    renderAuth();
    await switchToSignUp();
    await userEvent.type(screen.getByLabelText('Email'), email);
    await userEvent.type(screen.getByLabelText('Password'), 'securepass123');
    await userEvent.type(screen.getByLabelText(/Confirm Password/i, { selector: 'input' }), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /Create Account/i }));
    await screen.findByText('Check your email');
  }

  it('displays the submitted email address', async () => {
    await reachCheckEmail('waiting@example.com');
    expect(screen.getByText('waiting@example.com')).toBeInTheDocument();
  });

  it('includes spam folder guidance', async () => {
    await reachCheckEmail();
    expect(screen.getByText(/spam/i)).toBeInTheDocument();
  });

  it('back-to-sign-in button returns to the sign-in form', async () => {
    await reachCheckEmail();
    await userEvent.click(screen.getByRole('button', { name: /Back to Sign In/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
    });
  });

  it('clears the email field after returning to sign-in', async () => {
    await reachCheckEmail('pending@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Back to Sign In/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toHaveValue('');
    });
  });
});

// ---------------------------------------------------------------------------
// Mode switching
// ---------------------------------------------------------------------------

describe('Auth — mode switching', () => {
  it('switching to sign-up clears error state from sign-in', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'));
    renderAuth();

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpassword1');
    await userEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));
    await screen.findByText('Invalid credentials');

    await userEvent.click(screen.getByRole('button', { name: /Don't have an account\? Sign Up/i }));
    expect(screen.queryByText('Invalid credentials')).toBeNull();
  });
});

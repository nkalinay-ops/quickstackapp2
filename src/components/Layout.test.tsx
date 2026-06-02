import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Layout } from './Layout';
import { createAuthMock } from '../test/mocks/authContext';

// ---- module mocks ----
// NOTE: vi.mock is hoisted — do NOT reference imported variables inside the factory.
// Use vi.fn() directly; configure in beforeEach.

const mockAuthValue = createAuthMock();

let _isNative = false;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

vi.mock('../lib/capacitorSetup', () => ({
  isNativePlatform: () => _isNative,
}));

// ---- helpers ----

function renderLayout(
  currentPage: Parameters<typeof Layout>[0]['currentPage'] = 'dashboard',
  onNavigate = vi.fn()
) {
  return render(
    <Layout currentPage={currentPage} onNavigate={onNavigate}>
      <div>content</div>
    </Layout>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthValue.isAdmin = false;
  mockAuthValue.userTier = 'free';
  _isNative = false;
});

// ---- tests ----

describe('Layout — core nav items always present', () => {
  it('renders Dashboard nav button', () => {
    renderLayout();
    expect(screen.getByRole('button', { name: /Dashboard/i })).toBeInTheDocument();
  });

  it('renders Collection nav button', () => {
    renderLayout();
    expect(screen.getByRole('button', { name: /Collection/i })).toBeInTheDocument();
  });

  it('renders Add nav button', () => {
    renderLayout();
    expect(screen.getByRole('button', { name: /^Add$/i })).toBeInTheDocument();
  });

  it('renders Wishlist nav button', () => {
    renderLayout();
    expect(screen.getByRole('button', { name: /Wishlist/i })).toBeInTheDocument();
  });

  it('renders Settings nav button', () => {
    renderLayout();
    expect(screen.getByRole('button', { name: /Settings/i })).toBeInTheDocument();
  });
});

describe('Layout — Admin nav item', () => {
  it('does NOT render Admin nav for a non-admin user', () => {
    mockAuthValue.isAdmin = false;
    renderLayout();
    expect(screen.queryByRole('button', { name: /Admin/i })).toBeNull();
  });

  it('renders Admin nav item when isAdmin is true', () => {
    mockAuthValue.isAdmin = true;
    renderLayout();
    expect(screen.getByRole('button', { name: /Admin/i })).toBeInTheDocument();
  });
});

describe('Layout — Bulk Upload nav item', () => {
  it('does NOT render Bulk Upload for a free-tier user', () => {
    mockAuthValue.userTier = 'free';
    renderLayout();
    expect(screen.queryByRole('button', { name: /Bulk/i })).toBeNull();
  });

  it('renders Bulk Upload for paid-tier user on web', () => {
    mockAuthValue.userTier = 'paid';
    _isNative = false;
    renderLayout();
    expect(screen.getByRole('button', { name: /Bulk/i })).toBeInTheDocument();
  });

  it('renders Bulk Upload for admin-tier user on web', () => {
    mockAuthValue.userTier = 'admin';
    _isNative = false;
    renderLayout();
    expect(screen.getByRole('button', { name: /Bulk/i })).toBeInTheDocument();
  });

  it('does NOT render Bulk Upload on native platform even for paid user', () => {
    mockAuthValue.userTier = 'paid';
    _isNative = true;
    renderLayout();
    expect(screen.queryByRole('button', { name: /Bulk/i })).toBeNull();
  });
});

describe('Layout — navigation callbacks', () => {
  it('calls onNavigate with "dashboard" when Dashboard is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Layout currentPage="collection" onNavigate={onNavigate}><div /></Layout>);
    await userEvent.click(screen.getByRole('button', { name: /Dashboard/i }));
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });

  it('calls onNavigate with "collection" when Collection is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Layout currentPage="dashboard" onNavigate={onNavigate}><div /></Layout>);
    await userEvent.click(screen.getByRole('button', { name: /Collection/i }));
    expect(onNavigate).toHaveBeenCalledWith('collection');
  });

  it('calls onNavigate with "add" when Add is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Layout currentPage="dashboard" onNavigate={onNavigate}><div /></Layout>);
    await userEvent.click(screen.getByRole('button', { name: /^Add$/i }));
    expect(onNavigate).toHaveBeenCalledWith('add');
  });

  it('calls onNavigate with "wishlist" when Wishlist is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Layout currentPage="dashboard" onNavigate={onNavigate}><div /></Layout>);
    await userEvent.click(screen.getByRole('button', { name: /^Wishlist$/i }));
    expect(onNavigate).toHaveBeenCalledWith('wishlist');
  });

  it('calls onNavigate with "settings" when Settings is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Layout currentPage="dashboard" onNavigate={onNavigate}><div /></Layout>);
    await userEvent.click(screen.getByRole('button', { name: /Settings/i }));
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });
});

describe('Layout — active page styling', () => {
  it('active page button has text-white class', () => {
    renderLayout('collection');
    const collectionBtn = screen.getByRole('button', { name: /Collection/i });
    expect(collectionBtn.className).toContain('text-white');
  });

  it('inactive page button has text-gray-500 class', () => {
    renderLayout('collection');
    const dashboardBtn = screen.getByRole('button', { name: /Dashboard/i });
    expect(dashboardBtn.className).toContain('text-gray-500');
  });
});

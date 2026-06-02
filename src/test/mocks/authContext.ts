import { vi } from 'vitest';
import type { UserTier } from '../../contexts/AuthContext';

export type MockAuthContext = {
  user: { id: string; email: string } | null;
  loading: boolean;
  isAdmin: boolean;
  userTier: UserTier;
  signIn: ReturnType<typeof vi.fn>;
  signUp: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  refreshAdminStatus: ReturnType<typeof vi.fn>;
  resetPassword: ReturnType<typeof vi.fn>;
  updatePassword: ReturnType<typeof vi.fn>;
  deleteAccount: ReturnType<typeof vi.fn>;
};

export function createAuthMock(overrides: Partial<MockAuthContext> = {}): MockAuthContext {
  return {
    user: { id: 'user-123', email: 'test@example.com' },
    loading: false,
    isAdmin: false,
    userTier: 'free',
    signIn: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn().mockResolvedValue({ needsEmailConfirmation: false }),
    signOut: vi.fn().mockResolvedValue(undefined),
    refreshAdminStatus: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

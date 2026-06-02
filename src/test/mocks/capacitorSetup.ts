import { vi } from 'vitest';

export const mockIsNativePlatform = vi.fn(() => false);
export const mockOpenLegalLink = vi.fn();

export const capacitorSetupMock = {
  isNativePlatform: mockIsNativePlatform,
  openLegalLink: mockOpenLegalLink,
  isAndroid: vi.fn(() => false),
  initCapacitor: vi.fn(),
  handleDeepLink: vi.fn(() => null),
  getAppScheme: vi.fn(() => 'quickstack'),
};

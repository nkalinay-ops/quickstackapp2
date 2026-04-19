import { Capacitor } from '@capacitor/core';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export function getAppScheme(): string {
  return 'com.comicvault.app';
}

export function handleDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    const page = parsed.searchParams.get('page');
    const accessToken = parsed.searchParams.get('access_token') || parsed.hash.match(/access_token=([^&]+)/)?.[1];
    const type = parsed.searchParams.get('type') || parsed.hash.match(/type=([^&]+)/)?.[1];

    if (accessToken && type === 'recovery') {
      const newUrl = `/?page=reset-password&access_token=${accessToken}&type=${type}`;
      window.history.replaceState({}, '', newUrl);
      return 'reset-password';
    }

    if (page) {
      return page;
    }

    return null;
  } catch {
    return null;
  }
}

export function initCapacitor(): void {
  if (!isNativePlatform()) return;

  if (typeof window !== 'undefined') {
    const originalLocation = window.location.href;
    const page = handleDeepLink(originalLocation);
    if (page) {
      window.dispatchEvent(new CustomEvent('navigate', { detail: page }));
    }
  }
}

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export function getAppScheme(): string {
  return 'quickstack';
}

export function handleDeepLink(url: string): string | null {
  try {
    // Handle custom URI scheme: quickstack://reset-password?access_token=...&type=recovery
    // Also handle https:// URLs (web fallback)
    let searchParams: URLSearchParams;
    let hash = '';

    if (url.startsWith('quickstack://')) {
      // Parse custom scheme URL manually since URL() may not handle unknown schemes reliably
      const queryStart = url.indexOf('?');
      const hashStart = url.indexOf('#');
      if (queryStart !== -1) {
        const queryEnd = hashStart !== -1 ? hashStart : url.length;
        searchParams = new URLSearchParams(url.slice(queryStart + 1, queryEnd));
        hash = hashStart !== -1 ? url.slice(hashStart) : '';
      } else {
        searchParams = new URLSearchParams('');
        hash = hashStart !== -1 ? url.slice(hashStart) : '';
      }
    } else {
      const parsed = new URL(url);
      searchParams = parsed.searchParams;
      hash = parsed.hash;
    }

    const page = searchParams.get('page');
    const accessToken = searchParams.get('access_token') || hash.match(/access_token=([^&]+)/)?.[1];
    const type = searchParams.get('type') || hash.match(/type=([^&]+)/)?.[1];

    if (accessToken && type === 'recovery') {
      const newUrl = `/?page=reset-password&access_token=${accessToken}&type=${type}`;
      window.history.replaceState({}, '', newUrl);
      return 'reset-password';
    }

    const code = searchParams.get('code');
    if (code) {
      window.history.replaceState({}, '', `/?page=reset-password&code=${encodeURIComponent(code)}`);
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
    // Handle deep link if app was opened fresh from one
    const originalLocation = window.location.href;
    const page = handleDeepLink(originalLocation);
    if (page) {
      window.dispatchEvent(new CustomEvent('navigate', { detail: page }));
    }

    // Handle deep links when the app is already running
    App.addListener('appUrlOpen', (data) => {
      const page = handleDeepLink(data.url);
      if (page) {
        window.dispatchEvent(new CustomEvent('navigate', { detail: page }));
      }
    });
  }
}

import { Capacitor } from '@capacitor/core';

export async function initCapacitorPlugins() {
  if (!Capacitor.isNativePlatform()) return;

  const platform = Capacitor.getPlatform();

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#030712' });
  } catch {
    // StatusBar not critical
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    // SplashScreen not critical
  }

  if (platform === 'android') {
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack) {
          App.exitApp();
        } else {
          window.history.back();
        }
      });
    } catch {
      // App plugin not critical
    }
  }
}

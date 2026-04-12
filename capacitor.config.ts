import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quickstack.app',
  appName: 'QuickStack',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#030712',
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#030712',
  },
  android: {
    backgroundColor: '#030712',
  },
};

export default config;

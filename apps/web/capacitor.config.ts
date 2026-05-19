import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.danielmarkman.fuelsync',
  appName: 'FuelSync',
  webDir: 'dist',
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '407615311041-746ujbau41lufm4nhr4ebpljumsg8p2b.apps.googleusercontent.com',
    },
  },
};

export default config;

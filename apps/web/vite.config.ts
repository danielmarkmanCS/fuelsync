import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'FuelSync',
        short_name: 'FuelSync',
        description: 'Hybrid Athlete Nutrition OS',
        theme_color: '#0C0C0C',
        background_color: '#F2F2F7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fuelsync-ai\./,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fuelsync-strava\./,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../../shared'),
      '@mobile': path.resolve(__dirname, '../mobile/src'),
    },
  },
});

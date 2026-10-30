import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'icon-180.png'],
    manifest: {
      id: base, name: 'Pixel Studio', short_name: 'Pixel Studio', lang: 'ja',
      description: 'キャラクターやタイルを描くドット絵エディタ',
      start_url: base, scope: base, display: 'standalone',
      background_color: '#f6f4ee', theme_color: '#f6f4ee',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,ico}'], cleanupOutdatedCaches: true },
  })],
  base,
  test: { include: ['src/**/*.test.ts'] },
});

import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Относительные пути: приложение открывается и с корня, и из подпапки GitHub Pages.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Дрёма — знает, когда спать',
        short_name: 'Дрёма',
        description: 'Трекер сна и кормления малыша с прогнозом следующего сна.',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1A1850',
        theme_color: '#F1F3FB',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        // Заставки нужны только iOS при запуске и берутся из сети; в офлайн-кэш (1,5 МБ) их класть незачем.
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});

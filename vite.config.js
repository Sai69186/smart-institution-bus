import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192.svg', 'pwa-512.svg'],
      manifest: {
        name: 'Campus Transit',
        short_name: 'Transit',
        description: 'AI-driven smart institution bus tracking & prediction',
        theme_color: '#6366f1',
        background_color: '#04060f',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Live Tracking', short_name: 'Tracking', url: '/?view=live-tracking', description: 'Open real-time bus map' },
          { name: 'My Bus',        short_name: 'My Bus',   url: '/?view=student-dashboard', description: 'Check your bus status' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:js|css|svg|woff2?|ttf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/.*tile\.openstreetmap\.org\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],

  build: {
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // Rolldown (Vite 8) requires manualChunks as a function
        manualChunks(id) {
          // React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // Chart.js + react-chartjs-2
          if (id.includes('node_modules/chart.js') || id.includes('node_modules/react-chartjs-2')) {
            return 'vendor-charts';
          }
          // Leaflet + react-leaflet
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet') ||
              id.includes('node_modules/@react-leaflet')) {
            return 'vendor-maps';
          }
          // Socket.io client
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io-client')) {
            return 'vendor-socket';
          }
          // Lucide icons
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        },
      },
    },
  },
})


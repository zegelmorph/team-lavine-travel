import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until the user taps Reload (see src/lib/pwa.ts), so an open form is never reloaded away.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Team Lavine Travel',
        short_name: 'Travel',
        description: 'Plan trips together: destinations, travel, lodging, schedule and packing.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f7f9f6',
        theme_color: '#ffffff',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App files only. Supabase and Google are cross-origin and never cached here; trip data is kept by the
        // TanStack Query persister instead, so it is cleared with the rest of the session on sign-out.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  define: { __APP_BUILD__: JSON.stringify(new Date().toISOString()) },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  // Fixed port so it matches the Supabase Auth redirect allow-list; 5173 belongs to the finance app.
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  test: {
    environment: 'node',
  },
})

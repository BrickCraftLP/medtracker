import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, readdirSync } from 'node:fs'

// The newest changelog folder names the release (e.g. 26F19.2M); package.json
// is the fallback. Stamped into assistant feedback exports.
function appVersion() {
  try {
    const latest = readdirSync(new URL('./changelogs', import.meta.url)).filter(d => !d.startsWith('_')).sort().pop()
    if (latest) return latest
  } catch { /* no changelogs folder */ }
  return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' keeps a new build parked in `waiting` until the user taps
      // Update (see src/context/UpdateContext.jsx) — never a silent mid-session swap.
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        cleanupOutdatedCaches: true,
        // The on-device assistant model runtime (~6 MB) is fetched only when a
        // user turns it on — never precache it for everyone.
        globIgnores: ['**/mlc-webllm-*.js'],
        // Model-file proxy routes (worker/index.js) must reach the network,
        // never the SPA fallback.
        navigateFallbackDenylist: [/^\/hf\//, /^\/ghraw\//],
        // Web Push `push` / `notificationclick` handlers (public/push-sw.js).
        importScripts: ['push-sw.js'],
      },
      manifest: {
        name: 'MedTracker',
        short_name: 'MedTracker',
        description: 'MedAT Lerntracker',
        // Must match the app's own --bg-primary (index.html theme-color + index.css),
        // or the OS paints the status/gesture-bar strip a different color than the
        // content behind it in standalone PWA mode — reads as a stray rectangle
        // pinned above the bottom edge, with the navbar floating above that strip
        // instead of the real screen edge.
        theme_color: '#F2F2F7',
        background_color: '#F2F2F7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    host: true,
    // Same model-file proxy as worker/index.js, for `npm run dev`.
    proxy: {
      '/hf': { target: 'https://huggingface.co', changeOrigin: true, followRedirects: true, rewrite: p => p.replace(/^\/hf/, '') },
      '/ghraw': { target: 'https://raw.githubusercontent.com', changeOrigin: true, followRedirects: true, rewrite: p => p.replace(/^\/ghraw/, '') },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          supabase: ['@supabase/supabase-js'],
        },
        // Give the lazily imported WebLLM runtime a recognisable name so the
        // PWA precache can skip it (see workbox.globIgnores above).
        chunkFileNames: chunk =>
          chunk.moduleIds.some(id => id.includes('@mlc-ai'))
            ? 'assets/mlc-webllm-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
})

import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { VitePWA } from "vite-plugin-pwa";

import pkg from "./package.json" with { type: "json" };

const appBase = process.env.VITE_APP_BASE || "/";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    VitePWA({
      // Update service worker otomatis begitu versi baru ter-deploy
      registerType: "autoUpdate",
      // File di /public yang ikut dimasukkan ke precache (icon, favicon, dll)
      includeAssets: [
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        id: appBase,
        name: "Kaosan Retail",
        short_name: "Retail",
        description: "Kaosan Retail Management System",
        start_url: appBase,
        scope: appBase,
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        background_color: "#f5f7fa",
        theme_color: "#1976D2",
        orientation: "any",
        icons: [
          {
            src: "android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Batas ukuran precache per file dinaikkan karena ada vendor chunk besar
        // (vuetify, handsontable, dsb). File di atas ini akan di-runtime-cache, bukan precache.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Jangan precache asset gambar produk yang berat (public/images, 139MB)
        globPatterns: ["**/*.{js,css,html,ico,svg}"],
        globIgnores: ["**/manual-program.pdf"],
        runtimeCaching: [
          {
            // Data API: selalu coba jaringan dulu (data retail harus real-time),
            // fallback ke cache cuma kalau benar-benar offline
            urlPattern: ({ url }) => url.pathname.startsWith("/api"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }, // 1 hari
            },
          },
          {
            // Gambar & file upload: cache lebih lama, boleh sedikit basi
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/uploads") || url.pathname.startsWith("/images"),
            handler: "CacheFirst",
            options: {
              cacheName: "media-cache",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 hari
            },
          },
          {
            // Google Fonts
            urlPattern: ({ url }) => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Aktif juga saat `npm run dev` supaya gampang di-test lokal
        enabled: true,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ["lottie-web", "vue-lottie-player"],
  },

  base: appBase,

  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3005",
        changeOrigin: true,
      },
      "/memos": {
        target: "http://localhost:3005",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3005",
        changeOrigin: true,
      },
      "/images": {
        target: "http://localhost:3005",
        changeOrigin: true,
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("vuetify")) return "vendor-vuetify";
            if (id.includes("lottie-web")) return "vendor-lottie";
            if (id.includes("html2canvas")) return "vendor-canvas";
            if (id.includes("date-fns")) return "vendor-date";
            if (id.includes("jquery") || id.includes("pivottable")) return "vendor-pivot";

            return "vendor-core";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});

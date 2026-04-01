import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";

import pkg from "./package.json" with { type: "json" };

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      'lottie-web': 'lottie-web/build/player/lottie.min.js'
    },
  },

  base: process.env.VITE_APP_BASE || '/',

  // --- PERBAIKAN DI SINI ---
  // 'proxy' harus berada di dalam object 'server'
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/memos": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/images": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        // Fungsi untuk memecah file index menjadi potongan kecil (chunks)
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Pisahkan library besar ke file tersendiri
            if (id.includes('vuetify')) return 'vendor-vuetify';
            if (id.includes('lottie-web')) return 'vendor-lottie';
            if (id.includes('html2canvas')) return 'vendor-canvas';
            if (id.includes('date-fns')) return 'vendor-date';
            // Gabungkan library kecil lainnya menjadi satu file vendor
            return 'vendor-core';
          }
        },
      },
    },
    // Naikkan limit peringatan karena Vuetify memang cukup besar
    chunkSizeWarningLimit: 1000,
  },

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version), // ⬅ INJECT VERSION KE FRONTEND
  },
});

import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";

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
    },
  },
});

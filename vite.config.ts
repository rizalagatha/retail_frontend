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
    },
  },
  optimizeDeps: {
    include: ["lottie-web", "vue-lottie-player"],
  },

  base: process.env.VITE_APP_BASE || "/",

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

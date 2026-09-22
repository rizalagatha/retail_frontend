import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import AppDataTable from "./components/AppDataTable.vue";
import router from "./router";
import { useAuthStore } from "@/stores/authStore";

// (1) Impor Vuetify
import "vuetify/styles";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import "./styles/global.css";
import "./styles/desktop-app.css";
import "./styles/desktop-theme.css";

// (2) Impor Ikon Material Design (opsional tapi direkomendasikan)
import "@mdi/font/css/materialdesignicons.css";

import Toast, { useToast } from "vue-toastification";
import "vue-toastification/dist/index.css";

// (PWA) Registrasi service worker + notifikasi update
import { registerSW } from "virtual:pwa-register";

// [PERBAIKAN 1]: Ubah import menggunakan vue-gtag-next
import VueGtag, { trackRouter } from "vue-gtag-next";

const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: "mdi",
  },
  theme: {
    defaultTheme: "light",
    themes: {
      light: {
        colors: {
          primary: "#1976D2",
          secondary: "#424242",
          background: "#f5f7fa",
          surface: "#ffffff",
        },
      },
      dark: {
        colors: {
          primary: "#2196F3", // Biru lebih terang untuk Dark Mode
          secondary: "#B0BEC5",
          background: "#121212", // Hitam pekat background
          surface: "#1E1E1E", // Abu gelap surface (card/navbar)
        },
      },
    },
  },
});

const app = createApp(App);
app.component("AppDataTable", AppDataTable);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(vuetify);

const authStore = useAuthStore();
authStore.checkAuthStatus();

// (3) Daftarkan plugin toast dengan beberapa opsi default
app.use(Toast, {
  transition: "Vue-Toastification__bounce",
  maxToasts: 5,
  newestOnTop: true,
  position: "top-right",
  timeout: 4000,
  closeOnClick: true,
  pauseOnFocusLoss: true,
  pauseOnHover: true,
  draggable: true,
  draggablePercent: 0.6,
  showCloseButtonOnHover: false,
  hideProgressBar: false,
  closeButton: "button",
  icon: true,
  rtl: false,
});

// (PWA) Daftarkan service worker. Kalau ada versi baru ter-deploy,
// tampilkan toast supaya user bisa refresh untuk update.
const toast = useToast();
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast.info("Versi baru tersedia. Klik untuk memuat ulang.", {
      timeout: false,
      closeOnClick: false,
      onClick: () => updateSW(true),
    });
  },
  onOfflineReady() {
    toast.success("Aplikasi siap dipakai secara offline.");
  },
});

// [PERBAIKAN 2]: Setup GA4 khusus untuk subdomain tracking
if (window.location.hostname === "tracking.kaosanofficial.com") {
  app.use(VueGtag, {
    property: {
      // Perhatikan: di vue-gtag-next menggunakan key 'property', bukan 'config'
      id: "G-FVHNTSNVJL",
    },
  });

  // Sambungkan router agar otomatis melacak perpindahan halaman Vue
  trackRouter(router);
}

app.mount("#app");

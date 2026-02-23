<script setup lang="ts">
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import Navbar from "@/components/Navbar.vue";
import { ref, onMounted, onUnmounted, defineAsyncComponent, computed } from "vue";
import api from "@/services/api";
import axios from "axios";
import { useTheme } from "vuetify";

// Import composables atau store untuk state dialog
import { usePasswordDialog } from "@/composables/usePasswordDialog";
import { useWhatsAppDialog } from "@/composables/useWhatsappDialog";
import { useBufferStockDialog } from "@/composables/useBufferStockDialog"; // Contoh
import { useSettingsProcessDialog } from "@/composables/useSettingsProcessDialog";
import { useManualProgramDialog } from "@/composables/useManualProgramDialog"; // Contoh
import { useMemoInternalDialog } from "@/composables/useMemoInternalDialog";
const { showMemoDialog, openMemoDialog } = useMemoInternalDialog();
import GlobalUnsavedChangesDialog from "@/components/dialog/GlobalUnsavedChangesDialog.vue";

// Import komponen dialog (lazy load jika memungkinkan untuk performa lebih baik)
const ChangePasswordDialog = defineAsyncComponent(
  () => import("@/components/dialog/ChangePasswordDialog.vue")
);
const WhatsAppLinkDialog = defineAsyncComponent(
  () => import("@/components/dialog/WhatsappLinkDialog.vue")
);
const BufferStockDialog = defineAsyncComponent(
  () => import("@/components/dialog/BufferStockDialog.vue")
);
const SettingsProcessDialog = defineAsyncComponent(
  () => import("@/components/dialog/SettingsProcessDialog.vue")
);
const ManualProgramDialog = defineAsyncComponent(
  () => import("@/components/dialog/ManualProgramDialog.vue")
);
const MemoInternalDialog = defineAsyncComponent(
  () => import("@/components/dialog/MemoInternalDialog.vue")
);
const FaqModal = defineAsyncComponent(() => import("@/components/modal/FaqModal.vue"));

const ChangelogModal = defineAsyncComponent(() => import("@/components/modal/ChangelogModal.vue"));

const authStore = useAuthStore();
const uiStore = useUiStore();
const theme = useTheme();

// --- STATE VERSI & UPDATE ---
const currentVersion = __APP_VERSION__; // Versi yang sedang jalan di browser
const isUpdateAvailable = ref(false); // Flag update
const serverVersion = ref(""); // Versi dari server
const isUpdateConfirmDialogVisible = ref(false);
const latestChanges = ref<(string | { title: string; items: string[] })[]>([]);

// State Baru
const showChangelog = ref(false);
const changelogList = ref([]); // Menampung data dari API
const isChangelogLoading = ref(false);

const showFaq = ref(false);

// State Notifikasi
const notificationList = computed(() => {
  const n = authStore.notifications;
  const list = [];

  if (n.sj > 0) {
    list.push({ title: "Terima SJ dari DC", count: n.sj, to: "/transaksi/internal/terima-sj", icon: "mdi-truck-delivery", color: "red" });
  }
  if (n.mutasi > 0) {
    list.push({ title: "Terima Mutasi Toko", count: n.mutasi, to: "/transaksi/mutasi/store-terima", icon: "mdi-transfer-down", color: "purple" });
  }
  if (n.retur > 0) {
    list.push({ title: "Retur ke DC (Pending)", count: n.retur, to: "/transaksi/internal/retur-dc", icon: "mdi-keyboard-return", color: "orange" });
  }
  if (n.pinjam > 0) {
    list.push({ title: "Peminjaman Overdue", count: n.pinjam, to: "/transaksi/internal/peminjaman-barang", icon: "mdi-clock-alert", color: "brown" });
  }
  // Notifikasi Memo akan langsung hilang dari lonceng jika n.memo = 0
  if (n.memo > 0) {
    list.push({ title: "Memo Internal Baru", count: n.memo, to: "#", icon: "mdi-bulletin-board", color: "blue", isMemo: true });
  }

  return list;
});
const totalNotifications = computed(() => {
  const n = authStore.notifications;
  // Menjumlahkan semua angka notifikasi yang ada
  return n.sj + n.mutasi + n.retur + n.pinjam + n.memo;
});
const isNotificationMenuOpen = ref(false);

// Dapatkan state visibilitas dari composables/store
const { showPasswordDialog, closePasswordDialog } = usePasswordDialog(); // Contoh
const { showWhatsAppDialog, closeWhatsAppDialog } = useWhatsAppDialog();
const { showBufferStockDialog, closeBufferStockDialog } = useBufferStockDialog();
const { isSettingsProcessDialogOpen, closeSettingsProcessDialog } = useSettingsProcessDialog();
const { showManualDialog, closeManualDialog } = useManualProgramDialog(); // Contoh

const latency = ref<number | null>(null);
const isCheckingPing = ref(false);
let pingInterval: number;

// Warna indikator berdasarkan kecepatan
const latencyColor = computed(() => {
  if (latency.value === null) return "grey";
  if (latency.value < 150) return "success"; // Cepat (< 150ms)
  if (latency.value < 400) return "warning"; // Sedang
  return "error"; // Lambat (> 400ms)
});

// --- MODIFIKASI LOGIC PING ---
const checkPing = async () => {
  if (isCheckingPing.value) return;
  isCheckingPing.value = true;
  const start = Date.now();

  try {
    // Panggil endpoint health
    const response = await api.get("/health-check");

    // 1. Hitung Latency
    latency.value = Date.now() - start;
    authStore.isOnline = true;

    // 2. [BARU] Cek Versi
    // Pastikan response memiliki field version
    if (response.data && response.data.version) {
      const remoteVer = response.data.version;

      if (remoteVer !== currentVersion) {
        serverVersion.value = remoteVer;

        // [BARU] Simpan changelog dari server ke state
        if (response.data.changes && Array.isArray(response.data.changes)) {
          latestChanges.value = response.data.changes;
        } else {
          latestChanges.value = ["Peningkatan performa dan perbaikan bug."];
        }

        isUpdateAvailable.value = true;
      }
    }
  } catch {
    latency.value = null;
    authStore.isOnline = false;
  } finally {
    isCheckingPing.value = false;
  }
};

// --- LOGIC RELOAD APP [DIMODIFIKASI] ---
const handleUpdateClick = () => {
  // Selalu buka dialog konfirmasi (baik ada unsaved changes atau tidak)
  // karena kita ingin menampilkan Info Fitur Baru di dialog ini.
  isUpdateConfirmDialogVisible.value = true;
};

const performReload = () => {
  // Paksa reload dari server (bypass cache)
  window.location.reload();
};

// --- LOGIC JADWAL SHOLAT ---
const nextPrayerName = ref("");
const nextPrayerTime = ref("");
const fullSchedule = ref<Record<string, string>>({});
const city = ref("");

// Helper: Bersihkan nama kota (misal "RETAIL BOYOLALI KOTA" -> "Boyolali")
const cleanCityName = (rawName: string) => {
  if (!rawName) return "Jakarta"; // Default
  // Ambil kata pertama yang bukan "RETAIL" atau "CABANG"
  const parts = rawName
    .toUpperCase()
    .replace("RETAIL", "")
    .replace("CABANG", "")
    .replace("KOTA", "")
    .trim()
    .split(" ");
  return parts[0] || "Jakarta";
};

const fetchPrayerTimes = async () => {
  try {
    const cabang = authStore.user?.cabang || "";
    const cabangNama = authStore.user?.cabangNama || "";

    // --- LOGIKA PENENTUAN KOTA BERDASARKAN CABANG ---

    // 1. Khusus K04 dan K05 -> Gunakan waktu Surabaya
    if (["K04", "K05"].includes(cabang)) {
      city.value = "Surabaya";
    }
    // 2. Selain cabang store (misal KDC atau DC lainnya) -> Set Boyolali
    // Kita cek jika kode cabang bukan pola 'K' diikuti angka (K01, K02, dst) atau spesifik KDC
    else if (cabang === "KDC" || !/^K\d+/.test(cabang)) {
      city.value = "Boyolali";
    }
    // 3. Cabang Store lainnya (K01, K07, dll) -> Ambil dari nama cabang di database
    else {
      city.value = cleanCityName(cabangNama);
    }

    // API Aladhan (Method 20 = Kemenag RI)
    const response = await axios.get("https://api.aladhan.com/v1/timingsByCity", {
      params: {
        city: city.value,
        country: "Indonesia",
        method: 20, // Kemenag RI
      },
    });

    const timings = response.data.data.timings;
    fullSchedule.value = {
      Subuh: timings.Fajr,
      Dzuhur: timings.Dhuhr,
      Ashar: timings.Asr,
      Maghrib: timings.Maghrib,
      Isya: timings.Isha,
    };

    determineNextPrayer();
  } catch (error) {
    console.error("Gagal load jadwal sholat:", error);
  }
};

const determineNextPrayer = () => {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  let found = false;
  const prayers = [
    { name: "Subuh", time: fullSchedule.value.Subuh },
    { name: "Dzuhur", time: fullSchedule.value.Dzuhur },
    { name: "Ashar", time: fullSchedule.value.Ashar },
    { name: "Maghrib", time: fullSchedule.value.Maghrib },
    { name: "Isya", time: fullSchedule.value.Isya },
  ];

  for (const p of prayers) {
    if (p.time > currentTime) {
      nextPrayerName.value = p.name;
      nextPrayerTime.value = p.time;
      found = true;
      break;
    }
  }

  // Jika tidak ada yang lebih besar (lewat Isya), maka next adalah Subuh besok
  if (!found && prayers.length > 0) {
    nextPrayerName.value = "Subuh";
    nextPrayerTime.value = prayers[0].time;
  }
};

// Daftar Shortcut untuk ditampilkan di tooltip
const appShortcuts = [
  { key: "F1", desc: "Cari Data (Lookup)" },
  { key: "F2", desc: "Pilihan Multi/Detail" },
  { key: "Tab", desc: "Pindah Kolom Selanjutnya" },
  { key: "Shift+Tab", desc: "Pindah Kolom Sebelumnya" },
  { key: "Enter", desc: "Pilih / Simpan" },
];

const browserShortcuts = [
  { key: "Ctrl + P", desc: "Print Halaman" },
  { key: "Ctrl + R", desc: "Refresh Halaman   " },
  { key: "Ctrl + -/+", desc: "Zoom Out / In" },
  { key: "Win + PrtSc", desc: "Screenshot (Simpan)" },
  { key: "Ctrl+Shift+T", desc: "Buka kembali tab terakhir yang ditutup" },
  { key: "Spacebar", desc: "Gulir ke bawah pada halaman web" },
  { key: "Ctrl + Tab", desc: "Beralih ke tab berikutnya" },
  { key: "Ctrl + Shift + Tab", desc: "Beralih ke tab sebelumnya" },
];

// --- LOGIC CALCULATOR ---
const showCalculator = ref(false);
const calcDisplay = ref("0");
const calcEquation = ref("");

const appendCalc = (char: string) => {
  if (calcDisplay.value === "0" && !["+", "-", "*", "/", "."].includes(char)) {
    calcDisplay.value = char;
  } else {
    calcDisplay.value += char;
  }
};

const clearCalc = () => {
  calcDisplay.value = "0";
  calcEquation.value = "";
};

const deleteCalc = () => {
  calcDisplay.value = calcDisplay.value.slice(0, -1) || "0";
};

const calculateResult = () => {
  try {
    // Ganti x dengan * untuk evaluasi
    const expression = calcDisplay.value.replace(/x/g, "*");
    // Evaluasi aman
    const result = new Function("return " + expression)();

    // Format hasil
    calcEquation.value = calcDisplay.value + " =";
    calcDisplay.value = String(result);
  } catch {
    calcDisplay.value = "Error";
  }
};

// --- LOGIC KEYBOARD LOCK STATUS ---
const capsLockOn = ref(false);
const numLockOn = ref(false);

const updateLockStatus = (event: KeyboardEvent) => {
  capsLockOn.value = event.getModifierState("CapsLock");
  numLockOn.value = event.getModifierState("NumLock");
};

const toggleTheme = () => {
  uiStore.toggleTheme(); // Update state di Pinia store
  const newTheme = uiStore.isDark ? "dark" : "light";
  theme.global.name.value = newTheme; // Update tema Vuetify
  localStorage.setItem("kaosan-theme", newTheme); // [PENTING] Simpan agar persisten
};

// Function untuk Buka Modal & Fetch Data
const openChangelog = async () => {
  showChangelog.value = true; // Buka modal dulu (biar keliatan loadingnya)

  // Cek jika data sudah pernah diambil, gak usah ambil lagi (optional caching)
  if (changelogList.value.length > 0) return;

  isChangelogLoading.value = true;
  try {
    const response = await api.get("/dashboard/changelog"); // Sesuaikan endpoint backend
    changelogList.value = response.data;
  } catch (error) {
    console.error("Gagal ambil changelog", error);
    // Fallback data jika error
    changelogList.value = [
      { version: currentVersion, changes: ["Gagal memuat riwayat dari server."] },
    ];
  } finally {
    isChangelogLoading.value = false;
  }
};

const handleOpenMemo = () => {
  openMemoDialog();
  const now = new Date().toISOString();
  localStorage.setItem("last_memo_open_at", now);
  authStore.notifications.memo = 0; // Hapus titik merah secara reaktif
};

// Function Fetch Notifikasi (Ringan)
const fetchNotifications = async () => {
  if (!authStore.isAuthenticated) return;

  try {
    const stockRes = await api.get("/dashboard/stock-alerts");
    const stockData = stockRes.data;

    // Cek Lock Memo (Berdasarkan localStorage)
    const lastSeen = localStorage.getItem("last_memo_open_at") || "1970-01-01";
    const hasNewMemo = stockData.latest_memo_date && new Date(stockData.latest_memo_date) > new Date(lastSeen);

    // Cukup update state global di authStore
    authStore.notifications = {
      sj: stockData.sj_pending || 0,
      mutasi: stockData.mutasi_pending || 0,
      retur: stockData.retur_dc_pending || 0,
      pinjam: stockData.pinjam_overdue || 0,
      memo: hasNewMemo ? (stockData.new_memo_count || 0) : 0
    };

    // Tidak perlu lagi memanipulasi notificationList.value di sini
  } catch (error) {
    console.error("Gagal cek notifikasi", error);
  }
};

onMounted(() => {
  // 1. Cek Tema Tersimpan
  const savedTheme = localStorage.getItem("kaosan-theme");
  if (savedTheme) {
    // Jika ada, terapkan ke Vuetify & Store
    theme.global.name.value = savedTheme;
    uiStore.isDark = savedTheme === "dark";
  } else {
    // Jika belum ada, simpan default (misal light)
    localStorage.setItem("kaosan-theme", "light");
  }

  checkPing();
  pingInterval = window.setInterval(checkPing, 15000);

  // Fetch jadwal sholat sekali saat mounted
  fetchPrayerTimes();
  // Update penunjuk waktu sholat setiap menit
  setInterval(determineNextPrayer, 60000);

  fetchNotifications();
  // Cek notifikasi setiap 60 detik (agar tidak membebani server)
  setInterval(fetchNotifications, 60000);

  // Listener untuk Caps/Num Lock
  window.addEventListener("keydown", updateLockStatus);
  window.addEventListener("keyup", updateLockStatus);
  window.addEventListener("click", (e) => {
    // Trik untuk update status saat klik (jika event key terlewat)
    if (e instanceof MouseEvent && e.getModifierState) {
      capsLockOn.value = e.getModifierState("CapsLock");
      numLockOn.value = e.getModifierState("NumLock");
    }
  });
});

onUnmounted(() => {
  clearInterval(pingInterval);
  window.removeEventListener("keydown", updateLockStatus);
  window.removeEventListener("keyup", updateLockStatus);
});
</script>

<template>
  <div>
    <Navbar v-if="authStore.isAuthenticated" />
    <v-main>
      <router-view />
    </v-main>

    <v-footer v-if="authStore.isAuthenticated" app class="pa-0 px-4 py-1 border-top bg-surface"
      style="font-size: 11px; height: 40px">
      <div class="d-flex align-center ga-3" style="min-width: 200px">
        <div class="d-flex align-center cursor-pointer text-medium-emphasis" title="User Aktif">
          <v-icon size="14" class="mr-1">mdi-account-circle</v-icon>
          <span class="font-weight-bold mr-1">{{ authStore.user?.nama }}</span>
          <span class="text-caption text-disabled">({{ authStore.user?.cabangNama }})</span>
        </div>

        <v-divider vertical class="my-1"></v-divider>

        <div class="d-flex align-center cursor-pointer" @click="checkPing"
          :title="authStore.isOnline ? `Respon Server: ${latency}ms` : 'Koneksi Terputus'">
          <template v-if="authStore.isOnline && latency !== null">
            <v-icon size="8" class="mr-1" :color="latencyColor">mdi-circle</v-icon>
            <span class="text-caption text-disabled">{{ latency }} ms</span>
          </template>
          <template v-else>
            <v-icon size="8" class="mr-1" color="error">mdi-circle</v-icon>
            <span class="font-weight-bold text-error">Offline</span>
          </template>
        </div>

        <div class="d-flex align-center ga-1 text-caption font-weight-bold" style="font-size: 9px; user-select: none">
          <span :class="capsLockOn ? 'text-primary' : 'text-disabled opacity-30'">CAPS</span>
          <span :class="numLockOn ? 'text-primary' : 'text-disabled opacity-30'">NUM</span>
        </div>

        <v-tooltip text="Bantuan / FAQ" location="top">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon variant="text" size="small" density="compact" color="teal"
              @click="showFaq = true">
              <v-icon size="18">mdi-comment-question-outline</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-slide-x-transition>
          <div v-if="uiStore.hasUnsavedChanges" class="d-flex align-center ml-4 text-warning"
            title="Ada perubahan yang belum disimpan">
            <v-icon size="14" class="mr-1 blink-animation">mdi-content-save-alert-outline</v-icon>
            <span class="font-weight-bold text-caption">Belum Disimpan</span>
          </div>
        </v-slide-x-transition>
      </div>

      <v-spacer></v-spacer>

      <div v-if="nextPrayerName" class="d-none d-md-flex align-center justify-center">
        <v-menu open-on-hover location="top center">
          <template v-slot:activator="{ props }">
            <div v-bind="props" class="d-flex align-center px-3 py-1 rounded border cursor-help bg-surface"
              style="height: 24px">
              <v-icon size="12" color="teal" class="mr-2">mdi-mosque</v-icon>
              <span class="text-caption font-weight-medium text-medium-emphasis mr-1">
                {{ nextPrayerName }}
              </span>
              <span class="text-caption font-weight-bold text-teal">
                {{ nextPrayerTime }}
              </span>
              <span class="text-caption text-disabled ml-2" style="font-size: 9px">
                ({{ city }})
              </span>
            </div>
          </template>

          <v-card width="200" class="rounded-lg shadow-sm">
            <v-card-title class="text-caption font-weight-bold bg-teal-lighten-5 py-2 px-3 text-teal-darken-2">
              Jadwal Sholat {{ city }}
            </v-card-title>
            <v-list density="compact" class="py-0">
              <v-list-item v-for="(time, name) in fullSchedule" :key="name"
                :class="{ 'bg-teal-lighten-5': name === nextPrayerName }" style="min-height: 28px">
                <div class="d-flex justify-space-between w-100 text-caption">
                  <span :class="name === nextPrayerName
                    ? 'font-weight-bold text-teal-darken-3'
                    : 'text-medium-emphasis'
                    ">
                    {{ name }}
                  </span>
                  <span class="font-weight-bold"
                    :class="name === nextPrayerName ? 'text-teal-darken-3' : 'text-medium-emphasis'">
                    {{ time }}
                  </span>
                </div>
              </v-list-item>
            </v-list>
          </v-card>
        </v-menu>
      </div>

      <v-spacer></v-spacer>

      <div class="d-flex align-center ga-2" style="min-width: 200px; justify-content: flex-end">
        <v-tooltip text="Transaksi" location="top">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" to="/transaksi" icon variant="text" size="x-small" density="compact" color="grey">
              <v-icon size="16">mdi-cash-register</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-tooltip text="Laporan" location="top">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" to="/laporan" icon variant="text" size="x-small" density="compact" color="grey">
              <v-icon size="16">mdi-chart-bar</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-tooltip :text="uiStore.isDark ? 'Ganti ke Terang' : 'Ganti ke Gelap'" location="top">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon variant="text" size="x-small" density="compact" @click="toggleTheme"
              :color="uiStore.isDark ? 'yellow-darken-2' : 'blue-grey-darken-1'">
              <v-icon size="16">
                {{ uiStore.isDark ? "mdi-weather-sunny" : "mdi-weather-night" }}
              </v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-divider vertical class="mx-1"></v-divider>

        <v-menu v-model="isNotificationMenuOpen" :close-on-content-click="false" location="top end" offset="10">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon variant="text" size="small" density="compact" class="mr-1">
              <v-badge :content="totalNotifications" :model-value="totalNotifications > 0" color="error" size="x-small"
                floating>
                <v-icon size="18" :color="totalNotifications > 0 ? 'orange-darken-4' : 'grey'"
                  :class="{ 'bell-ring': totalNotifications > 0 }">
                  {{ totalNotifications > 0 ? "mdi-bell-ring" : "mdi-bell-outline" }}
                </v-icon>
              </v-badge>
            </v-btn>
          </template>

          <v-card width="300" class="rounded-lg shadow-lg">
            <v-card-title
              class="text-caption font-weight-bold py-2 px-3 d-flex align-center justify-space-between bg-grey-lighten-4 text-grey-darken-3">
              <div class="d-flex align-center">
                <v-icon size="small" start color="orange-darken-4">mdi-bell-ring</v-icon>
                Pemberitahuan
              </div>
              <v-chip v-if="totalNotifications > 0" size="x-small" color="error" variant="flat"
                class="font-weight-bold">
                {{ totalNotifications }} Pending
              </v-chip>
            </v-card-title>

            <v-card-text class="pa-0">
              <v-list density="compact" lines="one" class="py-0" v-if="notificationList.length > 0">
                <template v-for="(notif, i) in notificationList" :key="i">
                  <v-list-item :to="notif.isMemo ? undefined : notif.to" @click="() => {
                    if (notif.isMemo) handleOpenMemo();
                    isNotificationMenuOpen = false;
                  }" active-color="primary">
                    <template v-slot:prepend>
                      <v-avatar :color="notif.color" variant="tonal" size="24" class="mr-2">
                        <v-icon size="14">{{ notif.icon }}</v-icon>
                      </v-avatar>
                    </template>
                    <v-list-item-title class="text-caption font-weight-bold">
                      {{ notif.title }}
                    </v-list-item-title>
                    <template v-slot:append>
                      <v-badge inline :content="notif.count" color="grey-darken-3" class="font-weight-bold"></v-badge>
                    </template>
                  </v-list-item>
                  <v-divider v-if="i < notificationList.length - 1"></v-divider>
                </template>
              </v-list>

              <div v-else class="text-center pa-4 text-caption text-grey">
                <v-icon size="24" class="mb-1" color="success">mdi-check-circle-outline</v-icon>
                <div>Semua tugas selesai!</div>
              </div>
            </v-card-text>
          </v-card>
        </v-menu>

        <v-menu open-on-hover location="top end" :close-on-content-click="false" transition="slide-y-transition">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon variant="text" size="small" density="compact" color="indigo">
              <v-icon size="18">mdi-help-circle-outline</v-icon>
            </v-btn>
          </template>

          <v-card width="320" class="rounded-lg shadow-lg">
            <v-card-title
              class="text-caption font-weight-bold bg-grey-lighten-4 py-2 px-3 d-flex align-center text-grey-darken-3">
              <v-icon size="small" start color="indigo">mdi-keyboard-outline</v-icon>
              Daftar Shortcut
            </v-card-title>

            <v-card-text class="pa-0">
              <v-list density="compact" lines="one" class="py-0">
                <v-list-subheader class="font-weight-bold text-indigo py-0" style="font-size: 10px; height: 32px">
                  APLIKASI
                </v-list-subheader>
                <v-list-item v-for="(item, i) in appShortcuts" :key="i" class="min-height-32">
                  <template v-slot:prepend>
                    <v-chip size="x-small" label color="grey-darken-3" variant="flat" class="font-weight-bold px-2"
                      style="min-width: 45px; justify-content: center">
                      {{ item.key }}
                    </v-chip>
                  </template>
                  <v-list-item-title class="text-caption ml-2">{{ item.desc }}</v-list-item-title>
                </v-list-item>
                <v-divider class="my-1"></v-divider>
                <v-list-subheader class="font-weight-bold text-medium-emphasis py-0"
                  style="font-size: 10px; height: 32px">
                  BROWSER / UMUM
                </v-list-subheader>
                <v-list-item v-for="(item, i) in browserShortcuts" :key="'b' + i" class="min-height-32">
                  <template v-slot:prepend>
                    <div class="text-caption font-weight-bold text-medium-emphasis" style="min-width: 80px">
                      {{ item.key }}
                    </div>
                  </template>
                  <v-list-item-title class="text-caption text-medium-emphasis">{{
                    item.desc
                    }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-menu>

        <v-menu v-model="showCalculator" :close-on-content-click="false" location="top end" offset="10">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon variant="text" size="small" density="compact" color="brown" title="Kalkulator">
              <v-icon size="18">mdi-calculator</v-icon>
            </v-btn>
          </template>

          <v-card width="220" class="rounded-lg elevation-4">
            <div class="bg-grey-lighten-3 pa-2 text-right">
              <div class="text-caption text-medium-emphasis mb-1" style="height: 16px">
                {{ calcEquation }}
              </div>
              <div class="text-h5 font-weight-bold text-grey-darken-3">{{ calcDisplay }}</div>
            </div>

            <v-card-text class="pa-1">
              <v-row dense no-gutters>
                <v-col cols="3" v-for="btn in [
                  'C',
                  '/',
                  '*',
                  'BS',
                  '7',
                  '8',
                  '9',
                  '-',
                  '4',
                  '5',
                  '6',
                  '+',
                  '1',
                  '2',
                  '3',
                  '=',
                  '0',
                  '00',
                  '.',
                  '',
                ]" :key="btn">
                  <v-btn v-if="btn === '='" block variant="flat" color="blue-darken-1" height="40" class="rounded-0"
                    @click="calculateResult">=</v-btn>
                  <v-btn v-else-if="btn === 'C'" block variant="text" color="red" height="40" class="rounded-0"
                    @click="clearCalc">C</v-btn>
                  <v-btn v-else-if="btn === 'BS'" block variant="text" color="orange" height="40" class="rounded-0"
                    @click="deleteCalc">
                    <v-icon>mdi-backspace-outline</v-icon>
                  </v-btn>
                  <v-btn v-else-if="btn === ''" block variant="text" disabled height="40" class="rounded-0"></v-btn>
                  <v-btn v-else block variant="text" height="40" class="rounded-0 font-weight-bold"
                    :color="['/', '*', '-', '+'].includes(btn) ? 'blue' : 'grey-darken-3'" @click="appendCalc(btn)">
                    {{ btn }}
                  </v-btn>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-menu>

        <v-divider vertical class="mx-1"></v-divider>

        <v-tooltip text="Lapor Masalah" location="top">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon variant="text" size="small" density="compact" color="green"
              href="https://wa.me/6282242748378?text=Halo%20IT,%20saya%20nemu%20error%20di..." target="_blank">
              <v-icon size="16">mdi-whatsapp</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <span class="text-caption text-disabled ml-1 version-tag cursor-pointer" @click="openChangelog"
          title="Klik untuk melihat riwayat pembaruan">
          v{{ currentVersion }}
        </span>
      </div>
    </v-footer>

    <v-snackbar v-model="isUpdateAvailable" color="indigo-darken-3" location="bottom center" :timeout="-1" vertical
      class="mb-8">
      <div class="text-subtitle-1 font-weight-bold pb-1">
        <v-icon start icon="mdi-cloud-download-outline" />
        Update Tersedia!
      </div>
      <p class="text-body-2">
        Versi baru <strong>(v{{ serverVersion }})</strong> telah tersedia.
      </p>

      <template v-slot:actions>
        <v-btn color="white" variant="text" @click="isUpdateAvailable = false"> Nanti Saja </v-btn>
        <v-btn color="yellow-accent-4" variant="flat" class="font-weight-bold text-black" @click="handleUpdateClick">
          Update Sekarang
        </v-btn>
      </template>
    </v-snackbar>

    <v-dialog v-model="isUpdateConfirmDialogVisible" max-width="500" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="text-h6 font-weight-bold d-flex align-center py-3 text-white"
          :class="uiStore.hasUnsavedChanges ? 'bg-red-darken-1' : 'bg-primary'">
          <v-icon start class="mr-2">
            {{ uiStore.hasUnsavedChanges ? "mdi-alert-octagon-outline" : "mdi-rocket-launch" }}
          </v-icon>
          {{ uiStore.hasUnsavedChanges ? "Peringatan & Update" : "Versi Baru Tersedia!" }}
        </v-card-title>

        <v-card-text class="pt-4 text-body-1">
          <v-alert v-if="uiStore.hasUnsavedChanges" type="error" variant="tonal" icon="mdi-alert" class="mb-4"
            border="start">
            <strong>Data Belum Disimpan!</strong><br />
            Anda sedang mengisi form. Jika update sekarang,
            <span class="text-decoration-underline">semua input akan hilang</span>.
          </v-alert>

          <div class="mb-2">
            Update ke versi <strong>v{{ serverVersion }}</strong> sudah siap.
          </div>

          <div class="bg-grey-lighten-4 pa-3 rounded border">
            <div class="text-caption font-weight-bold text-grey-darken-2 mb-1">
              APA YANG BARU DI VERSI INI?
            </div>

            <ul class="pl-4 text-body-2 text-grey-darken-3">
              <li v-for="(change, i) in latestChanges" :key="i" class="mb-1">
                <template v-if="typeof change === 'string'">
                  {{ change }}
                </template>

                <template v-else>
                  <div class="font-weight-bold">{{ change.title }}</div>
                  <ul class="pl-4 mt-1" style="list-style-type: circle">
                    <li v-for="(subItem, j) in change.items" :key="j" class="mb-0 text-caption text-grey-darken-2">
                      {{ subItem }}
                    </li>
                  </ul>
                </template>
              </li>
            </ul>
          </div>
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions class="px-4 py-3 bg-grey-lighten-5">
          <v-spacer></v-spacer>

          <v-btn color="grey-darken-3" variant="text" @click="isUpdateConfirmDialogVisible = false">
            {{ uiStore.hasUnsavedChanges ? "Batal (Simpan Dulu)" : "Nanti Saja" }}
          </v-btn>

          <v-btn :color="uiStore.hasUnsavedChanges ? 'red' : 'primary'" variant="flat" @click="performReload"
            :prepend-icon="uiStore.hasUnsavedChanges ? 'mdi-delete-restore' : 'mdi-update'" class="px-4">
            {{ uiStore.hasUnsavedChanges ? "Hapus Data & Update" : "Update Sekarang" }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ChangePasswordDialog v-if="showPasswordDialog" @close="closePasswordDialog" />

    <WhatsAppLinkDialog v-if="showWhatsAppDialog" @close="closeWhatsAppDialog" />

    <BufferStockDialog v-if="showBufferStockDialog" @close="closeBufferStockDialog" />
    <SettingsProcessDialog v-if="isSettingsProcessDialogOpen" @close="closeSettingsProcessDialog" />

    <ManualProgramDialog v-if="showManualDialog" @close="closeManualDialog" />

    <MemoInternalDialog v-if="showMemoDialog" @close="showMemoDialog = false" />

    <GlobalUnsavedChangesDialog />

    <ChangelogModal v-model="showChangelog" :items="changelogList" :loading="isChangelogLoading" />

    <FaqModal v-model="showFaq" />
  </div>
</template>

<style scoped>
/* [PERBAIKAN DARK MODE] Gunakan var border agar tidak terang di dark mode */
.border-top {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.border {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.min-height-32 {
  min-height: 28px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.shadow-lg {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
}

.shadow-sm {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
}

.cursor-help {
  cursor: help;
}

.blink-animation {
  animation: blink-soft 2s infinite;
}

.opacity-30 {
  opacity: 0.3;
}

.version-tag:hover {
  color: #1976d2 !important;
  /* Warna primary saat hover */
  text-decoration: underline;
}

/* === GLOBAL FIX: FOOTER DIALOG (FAQ, DLL) === */
:deep(.v-dialog) .v-card-actions {
  background-color: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

@keyframes blink-soft {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

.bell-ring {
  animation: ring-bell 3s 1s ease-in-out infinite;
  transform-origin: 50% 4px;
}

@keyframes ring-bell {
  0% {
    transform: rotate(0);
  }

  1% {
    transform: rotate(30deg);
  }

  3% {
    transform: rotate(-28deg);
  }

  5% {
    transform: rotate(34deg);
  }

  7% {
    transform: rotate(-32deg);
  }

  9% {
    transform: rotate(30deg);
  }

  11% {
    transform: rotate(-28deg);
  }

  13% {
    transform: rotate(26deg);
  }

  15% {
    transform: rotate(-24deg);
  }

  17% {
    transform: rotate(22deg);
  }

  19% {
    transform: rotate(-20deg);
  }

  21% {
    transform: rotate(18deg);
  }

  23% {
    transform: rotate(-16deg);
  }

  25% {
    transform: rotate(14deg);
  }

  27% {
    transform: rotate(-12deg);
  }

  29% {
    transform: rotate(10deg);
  }

  31% {
    transform: rotate(-8deg);
  }

  33% {
    transform: rotate(6deg);
  }

  35% {
    transform: rotate(-4deg);
  }

  37% {
    transform: rotate(2deg);
  }

  39% {
    transform: rotate(-1deg);
  }

  41% {
    transform: rotate(1deg);
  }

  43% {
    transform: rotate(0);
  }

  100% {
    transform: rotate(0);
  }
}
</style>

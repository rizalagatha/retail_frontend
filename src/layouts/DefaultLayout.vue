<script setup lang="ts">
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useToast } from "vue-toastification";
import Navbar from "@/components/Navbar.vue";
import { ref, onMounted, onUnmounted, defineAsyncComponent, computed } from "vue";
import api from "@/services/api";
import axios from "axios";
import { useTheme } from "vuetify";
import { useRouter } from "vue-router";

// Import composables atau store untuk state dialog
import { usePasswordDialog } from "@/composables/usePasswordDialog";
import { useWhatsAppDialog } from "@/composables/useWhatsappDialog";
import { useBufferStockDialog } from "@/composables/useBufferStockDialog"; // Contoh
import { useSettingsProcessDialog } from "@/composables/useSettingsProcessDialog";
import { useManualProgramDialog } from "@/composables/useManualProgramDialog"; // Contoh
import { useMemoInternalDialog } from "@/composables/useMemoInternalDialog";
import { useCashierSessionStore } from "@/stores/cashierSessionStore";
const { showMemoDialog, openMemoDialog } = useMemoInternalDialog();
import GlobalUnsavedChangesDialog from "@/components/dialog/GlobalUnsavedChangesDialog.vue";

const CashierSessionBadge = defineAsyncComponent(
  () => import("@/components/cashier/CashierSessionBadge.vue")
);
const StartSessionModal = defineAsyncComponent(
  () => import("@/components/cashier/StartSessionModal.vue")
);
const HandoverSessionModal = defineAsyncComponent(
  () => import("@/components/cashier/HandoverSessionModal.vue")
);

interface Changelog {
  version: string;
  date: string;
  type: string;
  changes: (string | { title: string; items: string[] })[];
}

interface AgendaItem {
  dateline: string;
  nomor: string;
  customer?: string;
  rincian_dtf?: string;
  tipe?: string;
  is_completed?: number;
  is_scan_ready?: number | boolean;
}

interface HolidayItem {
  date?: string;
  tanggal?: string;
  name?: string;
  keterangan?: string;
  is_cuti?: boolean;
}

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
const toast = useToast();
const router = useRouter();
const uiStore = useUiStore();
const theme = useTheme();
const cashierSessionStore = useCashierSessionStore();

const isStoreUser = computed(() => {
  const cabang = authStore.user?.cabang || "";
  return /^K\d+/.test(cabang); // Hanya true jika cabang berawalan K lalu angka
});

// --- STATE VERSI & UPDATE ---
const currentVersion = __APP_VERSION__; // Versi yang sedang jalan di browser
const isUpdateAvailable = ref(false); // Flag update
const serverVersion = ref(""); // Versi dari server
const isUpdateConfirmDialogVisible = ref(false);
const latestChanges = ref<(string | { title: string; items: string[] })[]>([]);

// State Baru
const showChangelog = ref(false);
const changelogList = ref<Changelog[]>([]);
const isChangelogLoading = ref(false);

const showFaq = ref(false);

// --- STATE AGENDA CALENDAR ---
const showAgendaDialog = ref(false);
const agendaList = ref<AgendaItem[]>([]);
const isAgendaLoading = ref(false);

// --- STATE DETAIL AGENDA PER HARI ---
const showDayDetailDialog = ref(false);
const selectedDayEvents = ref<AgendaItem[]>([]);
const selectedDayDate = ref("");

// --- STATE HARI LIBUR NASIONAL ---
const holidays = ref<Record<string, string>>({}); // { "2026-05-01": "Hari Buruh" }

// State Navigasi Bulan
const currentMonth = ref(new Date().getMonth());
const currentYear = ref(new Date().getFullYear());

const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const fetchHolidays = async () => {
  try {
    // Memanggil API libur dari Deno
    const res = await axios.get(`https://libur.deno.dev/api`);

    if (res.data && Array.isArray(res.data)) {
      const newHolidays: Record<string, string> = {};

      (res.data as HolidayItem[]).forEach((h) => {
        // API Deno biasanya pakai 'date' dan 'name', tapi kita beri fallback 'tanggal' dan 'keterangan'
        const dateStr = h.date || h.tanggal;
        const desc = h.name || h.keterangan;

        // Cek jika bukan cuti bersama (opsional: hilangkan pengecekan is_cuti jika mau cuti bersama tetap merah)
        if (dateStr && desc && !h.is_cuti) {
          newHolidays[dateStr] = desc;
        }
      });

      holidays.value = { ...holidays.value, ...newHolidays };
    }
  } catch (error) {
    console.warn("Gagal mengambil data hari libur dari Deno", error);
  }
};

const isDayOff = (dateStr: string) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (d.getDay() === 0) return true; // Hari Minggu otomatis merah
  return !!holidays.value[dateStr]; // Hari Libur Nasional
};

const todayAgendaCount = computed(() => {
  const today = new Date();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${m}-${d}`;
  return (agendaMap.value[todayStr] || []).filter((evt) => !evt.is_completed).length;
});

// State Notifikasi
const notificationList = computed(() => {
  const n = authStore.notifications;
  const isKDC = authStore.userCabang === "KDC";
  const list = [];

  const today = new Date();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${m}-${d}`;
  const startDateStr = "2020-01-01";

  if (n.sj > 0) {
    list.push({
      title: "Terima SJ dari DC",
      count: n.sj,
      to: "/transaksi/internal/terima-sj",
      icon: "mdi-truck-delivery",
      color: "red",
    });
  }
  if (n.mutasi > 0) {
    list.push({
      title: "Terima Mutasi Toko",
      count: n.mutasi,
      to: "/transaksi/mutasi/store-terima",
      icon: "mdi-transfer-down",
      color: "purple",
    });
  }
  if (n.retur > 0) {
    list.push({
      title: isKDC ? "Terima Retur dari Toko" : "Retur ke DC (Pending)", // [FIX] Teks Dinamis
      count: n.retur,
      to: isKDC ? "/gudang-dc/operasional/terima-rb" : "/transaksi/internal/retur-dc", // [FIX] Link Dinamis
      icon: isKDC ? "mdi-package-down" : "mdi-keyboard-return",
      color: "orange",
    });
  }
  if (n.pinjam > 0) {
    list.push({
      title: "Peminjaman Overdue",
      count: n.pinjam,
      to: "/transaksi/internal/peminjaman-barang",
      icon: "mdi-clock-alert",
      color: "brown",
    });
  }
  // Notifikasi Memo akan langsung hilang dari lonceng jika n.memo = 0
  if (n.memo > 0) {
    list.push({
      title: "Memo Internal Baru",
      count: n.memo,
      to: "#",
      icon: "mdi-bulletin-board",
      color: "blue",
      isMemo: true,
    });
  }
  if (n.piutang > 0) {
    list.push({
      title: "Invoice Jatuh Tempo!",
      count: n.piutang,
      // URL sekarang otomatis memuat parameter status dan rentang tanggal
      to: `/transaksi/penjualan/invoice?status=sisa_piutang&startDate=${startDateStr}&endDate=${todayStr}`,
      icon: "mdi-cash-clock",
      color: "red-darken-3",
    });
  }

  return list;
});
const totalNotifications = computed(() => {
  const n = authStore.notifications;
  // Tambahkan pengaman || 0 agar tidak terjadi NaN
  return (
    (Number(n.sj) || 0) +
    (Number(n.mutasi) || 0) +
    (Number(n.retur) || 0) +
    (Number(n.pinjam) || 0) +
    (Number(n.memo) || 0) +
    (Number(n.piutang) || 0)
  );
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

const updateLockStatus = (event: Event) => {
  // Hanya jalankan pengecekan jika event memiliki fungsi getModifierState
  if (typeof (event as KeyboardEvent).getModifierState === "function") {
    capsLockOn.value = (event as KeyboardEvent).getModifierState("CapsLock");
    numLockOn.value = (event as KeyboardEvent).getModifierState("NumLock");
  }
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
      {
        version: currentVersion,
        date: "-",
        type: "minor",
        changes: ["Gagal memuat riwayat dari server."],
      },
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

    const lastSeen = localStorage.getItem("last_memo_open_at") || "1970-01-01";
    const hasNewMemo =
      stockData.latest_memo_date && new Date(stockData.latest_memo_date) > new Date(lastSeen);

    // Pastikan property name (retur_pending) match dengan backend
    authStore.notifications = {
      sj: Number(stockData.sj_pending) || 0,
      mutasi: Number(stockData.mutasi_pending) || 0,
      retur: Number(stockData.retur_pending) || 0, // Sesuaikan dengan key backend
      pinjam: Number(stockData.pinjam_overdue) || 0,
      memo: hasNewMemo ? Number(stockData.new_memo_count) || 0 : 0,
      piutang: Number(stockData.piutang_overdue) || 0,
    };
  } catch (error) {
    console.error("Gagal cek notifikasi", error);
  }
};

const fetchAgendaGlobal = async () => {
  if (!authStore.isAuthenticated) return;
  try {
    const response = await api.get("/dashboard/agenda");
    agendaList.value = response.data;
  } catch (error) {
    console.error("Gagal load agenda global", error);
  }
};

const openAgendaDialog = async () => {
  showAgendaDialog.value = true;
  isAgendaLoading.value = true;

  currentMonth.value = new Date().getMonth();
  currentYear.value = new Date().getFullYear();

  await fetchHolidays();

  try {
    const response = await api.get("/dashboard/agenda");
    agendaList.value = response.data;
  } catch {
    toast.error("Gagal memuat daftar agenda.");
  } finally {
    isAgendaLoading.value = false;
  }
};

// Navigasi Bulan
const prevMonth = () => {
  if (currentMonth.value === 0) {
    currentMonth.value = 11;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
};

const nextMonth = () => {
  if (currentMonth.value === 11) {
    currentMonth.value = 0;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
};

const goToToday = () => {
  currentMonth.value = new Date().getMonth();
  currentYear.value = new Date().getFullYear();
};

// Map Agenda ke Tanggal String (YYYY-MM-DD)
const agendaMap = computed(() => {
  const map: Record<string, AgendaItem[]> = {};
  agendaList.value.forEach((item) => {
    if (!item.dateline) return;
    if (!map[item.dateline]) map[item.dateline] = [];
    map[item.dateline].push(item);
  });
  return map;
});

// Logika Membangun Grid Kalender (35 / 42 Kotak)
const calendarDays = computed(() => {
  const days = [];
  const firstDay = new Date(currentYear.value, currentMonth.value, 1);
  const lastDay = new Date(currentYear.value, currentMonth.value + 1, 0);

  // Tentukan hari mulai (Senin = 0, Minggu = 6) -> Penyesuaian agar Senin di awal
  let startDayOfWeek = firstDay.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6; // Jika Minggu, geser ke index 6

  // 1. Padding hari dari bulan sebelumnya
  const prevMonthLastDay = new Date(currentYear.value, currentMonth.value, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    days.push({ day: d, isCurrentMonth: false, dateStr: "", events: [] });
  }

  // 2. Hari di bulan saat ini
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const m = String(currentMonth.value + 1).padStart(2, "0");
    const d = String(i).padStart(2, "0");
    const dateStr = `${currentYear.value}-${m}-${d}`; // Format YYYY-MM-DD

    days.push({
      day: i,
      isCurrentMonth: true,
      dateStr: dateStr,
      events: agendaMap.value[dateStr] || [],
    });
  }

  // 3. Padding hari dari bulan berikutnya (agar genap kelipatan 7)
  const remainingCells = 42 - days.length; // Max 6 baris x 7 hari
  for (let i = 1; i <= remainingCells; i++) {
    days.push({ day: i, isCurrentMonth: false, dateStr: "", events: [] });
  }

  // Pangkas jadi 35 jika baris terakhir ternyata kosong semua (bulan pendek)
  if (days.length === 42 && !days[35].isCurrentMonth) {
    return days.slice(0, 35);
  }

  return days;
});

// Cek apakah YYYY-MM-DD adalah hari ini
const isToday = (dateStr: string) => {
  if (!dateStr) return false;
  const today = new Date();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${m}-${d}`;
  return dateStr === todayStr;
};

// Helper untuk format Header Tanggal Agenda
const formatAgendaDate = (dateStr: string) => {
  if (!dateStr) return "Tidak ada tanggal";

  const dateObj = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = dateObj.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const formattedDate = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateObj);

  if (diffDays === 0) return `Hari Ini (${formattedDate})`;
  if (diffDays === 1) return `Besok (${formattedDate})`;
  if (diffDays === -1) return `Kemarin (${formattedDate})`;
  if (diffDays < 0) return `Terlewat ${Math.abs(diffDays)} Hari (${formattedDate})`;

  return formattedDate;
};

const getEventRank = (evt: AgendaItem) => {
  // 1. Paling bawah (Prioritas terendah): Sudah selesai (Coret abu-abu)
  if (evt.is_completed) return 3;

  // 2. Di atas yang selesai: SPK Produksi
  if (evt.tipe === "SPK") return 2;

  // 3. Di atas SPK: SO yang sudah siap kirim (Scan Ready hijau)
  if (evt.is_scan_ready) return 1;

  // 4. Paling atas (Prioritas tertinggi): SO Toko yang masih Open/Menunggu (Biru)
  return 0;
};

const sortAgendaEvents = (events: AgendaItem[]) => {
  return [...events].sort((a, b) => getEventRank(a) - getEventRank(b));
};

// Fungsi untuk membuka rincian satu hari
const openDayDetails = (dateStr: string, events: AgendaItem[]) => {
  selectedDayDate.value = dateStr;
  selectedDayEvents.value = sortAgendaEvents(events); // Pakai fungsi helper yang baru
  showDayDetailDialog.value = true;
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
  setInterval(() => {
    fetchNotifications();
    fetchAgendaGlobal();
  }, 60000);

  // Listener untuk Caps/Num Lock
  window.addEventListener("keydown", updateLockStatus as EventListener);
  window.addEventListener("keyup", updateLockStatus as EventListener);

  // Listener klik untuk memastikan status terupdate walau dari klik mouse biasa
  window.addEventListener("click", (e) => {
    if (e instanceof MouseEvent && typeof e.getModifierState === "function") {
      capsLockOn.value = e.getModifierState("CapsLock");
      numLockOn.value = e.getModifierState("NumLock");
    }
  });

  if (authStore.isAuthenticated) {
    cashierSessionStore.fetchCurrentSession();
    fetchAgendaGlobal();
  }
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

    <v-footer
      v-if="authStore.isAuthenticated"
      app
      class="pa-0 px-2 px-md-4 py-1 border-top bg-surface d-flex align-center justify-space-between"
      style="font-size: 11px; height: 40px"
    >
      <div class="d-flex align-center ga-2 ga-md-3">
        <div class="d-flex align-center cursor-pointer text-medium-emphasis" title="User Aktif">
          <v-icon size="14" class="mr-1">mdi-account-circle</v-icon>
          <span class="font-weight-bold mr-1 text-truncate" style="max-width: 140px">
            {{ authStore.user?.nama }}
          </span>
          <span class="text-caption text-disabled d-none d-md-inline"
            >({{ authStore.user?.cabangNama }})</span
          >
        </div>

        <v-divider vertical class="my-1 d-none d-sm-block"></v-divider>
        <CashierSessionBadge v-if="isStoreUser" class="d-none d-md-flex" />

        <div
          class="d-flex align-center cursor-pointer"
          @click="checkPing"
          :title="authStore.isOnline ? `Respon Server: ${latency}ms` : 'Koneksi Terputus'"
        >
          <template v-if="authStore.isOnline && latency !== null">
            <v-icon size="8" class="mr-1" :color="latencyColor">mdi-circle</v-icon>
            <span class="text-caption text-disabled d-none d-sm-inline">{{ latency }} ms</span>
          </template>
          <template v-else>
            <v-icon size="8" class="mr-1" color="error">mdi-circle</v-icon>
            <span class="font-weight-bold text-error d-none d-sm-inline">Offline</span>
          </template>
        </div>

        <div
          class="d-none d-md-flex align-center ga-1 text-caption font-weight-bold"
          style="font-size: 9px; user-select: none"
        >
          <span :class="capsLockOn ? 'text-primary' : 'text-disabled opacity-30'">CAPS</span>
          <span :class="numLockOn ? 'text-primary' : 'text-disabled opacity-30'">NUM</span>
        </div>

        <v-tooltip text="Bantuan / FAQ" location="top">
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              icon
              variant="text"
              size="small"
              density="compact"
              color="teal"
              @click="showFaq = true"
              class="d-none d-md-flex"
            >
              <v-icon size="18">mdi-comment-question-outline</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-slide-x-transition>
          <div
            v-if="uiStore.hasUnsavedChanges"
            class="d-flex align-center ml-2 ml-md-4 text-warning"
            title="Ada perubahan yang belum disimpan"
          >
            <v-icon size="14" class="mr-1 blink-animation">mdi-content-save-alert-outline</v-icon>
            <span class="font-weight-bold text-caption d-none d-sm-inline">Belum Disimpan</span>
          </div>
        </v-slide-x-transition>
      </div>

      <div
        v-if="nextPrayerName"
        class="d-none d-md-flex align-center justify-center absolute-center"
        style="position: absolute; left: 50%; transform: translateX(-50%)"
      >
        <v-menu open-on-hover location="top center">
          <template v-slot:activator="{ props }">
            <div
              v-bind="props"
              class="d-flex align-center px-3 py-1 rounded border cursor-help bg-surface"
              style="height: 24px"
            >
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
            <v-card-title
              class="text-caption font-weight-bold bg-teal-lighten-5 py-2 px-3 text-teal-darken-2"
            >
              Jadwal Sholat {{ city }}
            </v-card-title>
            <v-list density="compact" class="py-0">
              <v-list-item
                v-for="(time, name) in fullSchedule"
                :key="name"
                :class="{ 'bg-teal-lighten-5': name === nextPrayerName }"
                style="min-height: 28px"
              >
                <div class="d-flex justify-space-between w-100 text-caption">
                  <span
                    :class="
                      name === nextPrayerName
                        ? 'font-weight-bold text-teal-darken-3'
                        : 'text-medium-emphasis'
                    "
                  >
                    {{ name }}
                  </span>
                  <span
                    class="font-weight-bold"
                    :class="name === nextPrayerName ? 'text-teal-darken-3' : 'text-medium-emphasis'"
                  >
                    {{ time }}
                  </span>
                </div>
              </v-list-item>
            </v-list>
          </v-card>
        </v-menu>
      </div>

      <div class="d-flex align-center ga-1 ga-md-2" style="justify-content: flex-end">
        <v-tooltip text="Transaksi" location="top">
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              to="/transaksi"
              icon
              variant="text"
              size="x-small"
              density="compact"
              color="grey"
              class="d-none d-md-flex"
            >
              <v-icon size="16">mdi-cash-register</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-tooltip text="Laporan" location="top">
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              to="/laporan"
              icon
              variant="text"
              size="x-small"
              density="compact"
              color="grey"
              class="d-none d-md-flex"
            >
              <v-icon size="16">mdi-chart-bar</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-tooltip :text="uiStore.isDark ? 'Ganti ke Terang' : 'Ganti ke Gelap'" location="top">
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              icon
              variant="text"
              size="x-small"
              density="compact"
              @click="toggleTheme"
              :color="uiStore.isDark ? 'yellow-darken-2' : 'blue-grey-darken-1'"
            >
              <v-icon size="16">
                {{ uiStore.isDark ? "mdi-weather-sunny" : "mdi-weather-night" }}
              </v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-divider vertical class="mx-1 d-none d-sm-block"></v-divider>

        <!-- Tombol kalender baru dengan badge -->
        <v-btn
          icon
          variant="text"
          size="small"
          density="compact"
          class="mr-1"
          @click="openAgendaDialog"
        >
          <v-badge
            :content="todayAgendaCount"
            :model-value="todayAgendaCount > 0"
            color="error"
            size="x-small"
            floating
          >
            <v-icon
              size="18"
              :color="todayAgendaCount > 0 ? 'indigo-darken-1' : 'grey'"
              :class="{ 'bell-ring': todayAgendaCount > 0 }"
            >
              mdi-calendar-month
            </v-icon>
          </v-badge>
        </v-btn>

        <v-menu
          v-model="isNotificationMenuOpen"
          :close-on-content-click="false"
          location="top end"
          offset="10"
        >
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon variant="text" size="small" density="compact" class="mr-1">
              <v-badge
                :content="totalNotifications"
                :model-value="totalNotifications > 0"
                color="error"
                size="x-small"
                floating
              >
                <v-icon
                  size="18"
                  :color="totalNotifications > 0 ? 'orange-darken-4' : 'grey'"
                  :class="{ 'bell-ring': totalNotifications > 0 }"
                >
                  {{ totalNotifications > 0 ? "mdi-bell-ring" : "mdi-bell-outline" }}
                </v-icon>
              </v-badge>
            </v-btn>
          </template>

          <v-card width="300" class="rounded-lg shadow-lg" max-width="90vw">
            <v-card-title
              class="text-caption font-weight-bold py-2 px-3 d-flex align-center justify-space-between bg-grey-lighten-4 text-grey-darken-3"
            >
              <div class="d-flex align-center">
                <v-icon size="small" start color="orange-darken-4">mdi-bell-ring</v-icon>
                Pemberitahuan
              </div>
              <v-chip
                v-if="totalNotifications > 0"
                size="x-small"
                color="error"
                variant="flat"
                class="font-weight-bold"
              >
                {{ totalNotifications }} Pending
              </v-chip>
            </v-card-title>

            <v-card-text class="pa-0">
              <v-list density="compact" lines="one" class="py-0" v-if="notificationList.length > 0">
                <template v-for="(notif, i) in notificationList" :key="i">
                  <v-list-item
                    :to="notif.isMemo ? undefined : notif.to"
                    @click="
                      () => {
                        if (notif.isMemo) handleOpenMemo();
                        isNotificationMenuOpen = false;
                      }
                    "
                    active-color="primary"
                  >
                    <template v-slot:prepend>
                      <v-avatar :color="notif.color" variant="tonal" size="24" class="mr-2">
                        <v-icon size="14">{{ notif.icon }}</v-icon>
                      </v-avatar>
                    </template>
                    <v-list-item-title class="text-caption font-weight-bold">
                      {{ notif.title }}
                    </v-list-item-title>
                    <template v-slot:append>
                      <v-badge
                        inline
                        :content="notif.count"
                        color="grey-darken-3"
                        class="font-weight-bold"
                      ></v-badge>
                    </template>
                  </v-list-item>
                  <v-divider v-if="i < notificationList.length - 1"></v-divider>
                </template>
              </v-list>
            </v-card-text>
          </v-card>
        </v-menu>

        <v-menu
          open-on-hover
          location="top end"
          :close-on-content-click="false"
          transition="slide-y-transition"
        >
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              icon
              variant="text"
              size="small"
              density="compact"
              color="indigo"
              class="d-none d-md-flex"
            >
              <v-icon size="18">mdi-help-circle-outline</v-icon>
            </v-btn>
          </template>

          <v-card width="320" class="rounded-lg shadow-lg">
            <v-card-title
              class="text-caption font-weight-bold bg-grey-lighten-4 py-2 px-3 d-flex align-center text-grey-darken-3"
            >
              <v-icon size="small" start color="indigo">mdi-keyboard-outline</v-icon>
              Daftar Shortcut
            </v-card-title>

            <v-card-text class="pa-0">
              <v-list density="compact" lines="one" class="py-0">
                <v-list-subheader
                  class="font-weight-bold text-indigo py-0"
                  style="font-size: 10px; height: 32px"
                >
                  APLIKASI
                </v-list-subheader>
                <v-list-item v-for="(item, i) in appShortcuts" :key="i" class="min-height-32">
                  <template v-slot:prepend>
                    <v-chip
                      size="x-small"
                      label
                      color="grey-darken-3"
                      variant="flat"
                      class="font-weight-bold px-2"
                      style="min-width: 45px; justify-content: center"
                    >
                      {{ item.key }}
                    </v-chip>
                  </template>
                  <v-list-item-title class="text-caption ml-2">{{ item.desc }}</v-list-item-title>
                </v-list-item>
                <v-divider class="my-1"></v-divider>
                <v-list-subheader
                  class="font-weight-bold text-medium-emphasis py-0"
                  style="font-size: 10px; height: 32px"
                >
                  BROWSER / UMUM
                </v-list-subheader>
                <v-list-item
                  v-for="(item, i) in browserShortcuts"
                  :key="'b' + i"
                  class="min-height-32"
                >
                  <template v-slot:prepend>
                    <div
                      class="text-caption font-weight-bold text-medium-emphasis"
                      style="min-width: 80px"
                    >
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

        <v-menu
          v-model="showCalculator"
          :close-on-content-click="false"
          location="top end"
          offset="10"
        >
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              icon
              variant="text"
              size="small"
              density="compact"
              color="brown"
              title="Kalkulator"
              class="d-none d-md-flex"
            >
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
                <v-col
                  cols="3"
                  v-for="btn in [
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
                  ]"
                  :key="btn"
                >
                  <v-btn
                    v-if="btn === '='"
                    block
                    variant="flat"
                    color="blue-darken-1"
                    height="40"
                    class="rounded-0"
                    @click="calculateResult"
                    >=</v-btn
                  >
                  <v-btn
                    v-else-if="btn === 'C'"
                    block
                    variant="text"
                    color="red"
                    height="40"
                    class="rounded-0"
                    @click="clearCalc"
                    >C</v-btn
                  >
                  <v-btn
                    v-else-if="btn === 'BS'"
                    block
                    variant="text"
                    color="orange"
                    height="40"
                    class="rounded-0"
                    @click="deleteCalc"
                  >
                    <v-icon>mdi-backspace-outline</v-icon>
                  </v-btn>
                  <v-btn
                    v-else-if="btn === ''"
                    block
                    variant="text"
                    disabled
                    height="40"
                    class="rounded-0"
                  ></v-btn>
                  <v-btn
                    v-else
                    block
                    variant="text"
                    height="40"
                    class="rounded-0 font-weight-bold"
                    :color="['/', '*', '-', '+'].includes(btn) ? 'blue' : 'grey-darken-3'"
                    @click="appendCalc(btn)"
                  >
                    {{ btn }}
                  </v-btn>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-menu>

        <v-divider vertical class="mx-1 d-none d-sm-block"></v-divider>

        <v-tooltip text="Lapor Masalah" location="top">
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              icon
              variant="text"
              size="small"
              density="compact"
              color="green"
              href="https://wa.me/6282242748378?text=Halo%20IT,%20saya%20nemu%20error%20di..."
              target="_blank"
              class="d-none d-md-flex"
            >
              <v-icon size="16">mdi-whatsapp</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <span
          class="text-caption text-disabled ml-1 version-tag cursor-pointer"
          @click="openChangelog"
          title="Klik untuk melihat riwayat pembaruan"
        >
          v{{ currentVersion }}
        </span>
      </div>
    </v-footer>

    <v-snackbar
      v-model="isUpdateAvailable"
      color="indigo-darken-3"
      location="bottom center"
      :timeout="-1"
      vertical
      class="mb-8"
    >
      <div class="text-subtitle-1 font-weight-bold pb-1">
        <v-icon start icon="mdi-cloud-download-outline" />
        Update Tersedia!
      </div>
      <p class="text-body-2">
        Versi baru <strong>(v{{ serverVersion }})</strong> telah tersedia.
      </p>

      <template v-slot:actions>
        <v-btn color="white" variant="text" @click="isUpdateAvailable = false"> Nanti Saja </v-btn>
        <v-btn
          color="yellow-accent-4"
          variant="flat"
          class="font-weight-bold text-black"
          @click="handleUpdateClick"
        >
          Update Sekarang
        </v-btn>
      </template>
    </v-snackbar>

    <v-dialog v-model="isUpdateConfirmDialogVisible" max-width="500" persistent>
      <v-card class="rounded-lg">
        <v-card-title
          class="text-h6 font-weight-bold d-flex align-center py-3 text-white"
          :class="uiStore.hasUnsavedChanges ? 'bg-red-darken-1' : 'bg-primary'"
        >
          <v-icon start class="mr-2">
            {{ uiStore.hasUnsavedChanges ? "mdi-alert-octagon-outline" : "mdi-rocket-launch" }}
          </v-icon>
          {{ uiStore.hasUnsavedChanges ? "Peringatan & Update" : "Versi Baru Tersedia!" }}
        </v-card-title>

        <v-card-text class="pt-4 text-body-1">
          <v-alert
            v-if="uiStore.hasUnsavedChanges"
            type="error"
            variant="tonal"
            icon="mdi-alert"
            class="mb-4"
            border="start"
          >
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
                    <li
                      v-for="(subItem, j) in change.items"
                      :key="j"
                      class="mb-0 text-caption text-grey-darken-2"
                    >
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

          <v-btn
            :color="uiStore.hasUnsavedChanges ? 'red' : 'primary'"
            variant="flat"
            @click="performReload"
            :prepend-icon="uiStore.hasUnsavedChanges ? 'mdi-delete-restore' : 'mdi-update'"
            class="px-4"
          >
            {{ uiStore.hasUnsavedChanges ? "Hapus Data & Update" : "Update Sekarang" }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showAgendaDialog"
      max-width="1100px"
      fullscreen-on-mobile
      transition="dialog-bottom-transition"
    >
      <v-card class="bg-white rounded-xl h-100 d-flex flex-column overflow-hidden">
        <div class="cal-header-inner">
          <div>
            <div
              class="text-caption font-weight-medium text-grey mb-1"
              style="letter-spacing: 0.5px; text-transform: uppercase"
            >
              Kalender Dateline Pesanan
            </div>
            <div class="d-flex align-baseline" style="gap: 6px">
              <div class="cal-month-title">{{ monthNames[currentMonth] }}</div>
              <div class="cal-year-label">{{ currentYear }}</div>
            </div>
          </div>
          <div class="cal-nav-group">
            <button class="cal-today-pill" @click="goToToday">Hari ini</button>
            <button class="cal-nav-btn" @click="prevMonth">
              <v-icon size="16">mdi-chevron-left</v-icon>
            </button>
            <button class="cal-nav-btn" @click="nextMonth">
              <v-icon size="16">mdi-chevron-right</v-icon>
            </button>
          </div>
        </div>

        <div class="cal-legend-bar">
          <div class="cal-legend-item">
            <span class="cal-legend-dot" style="background: #1565c0"></span>
            <span>SO Open</span>
          </div>
          <div class="cal-legend-item">
            <span class="cal-legend-dot" style="background: #2e7d32"></span>
            <span>SO Scan Ready</span>
          </div>
          <div v-if="authStore.user?.cabang === 'KDC'" class="cal-legend-item">
            <span class="cal-legend-dot" style="background: #8e24aa"></span>
            <span>SPK Produksi</span>
          </div>
          <div class="cal-legend-item">
            <span class="cal-legend-dot" style="background: #9e9e9e"></span>
            <span>Selesai</span>
          </div>
        </div>

        <div
          v-if="isAgendaLoading"
          class="flex-grow-1 d-flex flex-column justify-center align-center"
          style="min-height: 300px"
        >
          <v-progress-circular
            indeterminate
            color="primary"
            size="48"
            width="4"
          ></v-progress-circular>
        </div>

        <div v-else class="flex-grow-1 d-flex flex-column bg-white">
          <div class="calendar-weekdays border-bottom">
            <span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span
            ><span class="weekend-label">Sab</span><span class="weekend-label">Min</span>
          </div>

          <div class="calendar-grid flex-grow-1">
            <div
              v-for="(cell, i) in calendarDays"
              :key="i"
              class="calendar-cell"
              @click="cell.isCurrentMonth && openDayDetails(cell.dateStr, cell.events)"
            >
              <div class="cell-date-wrap">
                <span
                  class="cell-date"
                  :class="{
                    'text-grey-lighten-1': !cell.isCurrentMonth,
                    'is-today': isToday(cell.dateStr),
                    'text-red': isDayOff(cell.dateStr) && !isToday(cell.dateStr),
                  }"
                  :title="holidays[cell.dateStr] || ''"
                >
                  {{ cell.day }}
                </span>
              </div>

              <div class="cell-events" v-if="cell.isCurrentMonth">
                <template
                  v-for="(evt, idx) in sortAgendaEvents(cell.events).slice(0, 2)"
                  :key="idx"
                >
                  <div
                    class="event-pill"
                    :class="
                      evt.is_completed
                        ? 'bg-grey-lighten-2 text-grey-darken-1'
                        : evt.tipe === 'SPK'
                        ? 'ep-spk'
                        : evt.is_scan_ready
                        ? 'ep-so-ready'
                        : 'ep-so'
                    "
                    :style="evt.is_completed ? 'text-decoration: line-through; opacity: 0.8;' : ''"
                    @click.stop="
                      showAgendaDialog = false;
                      if (evt.tipe === 'SPK') {
                        router.push('/gudang-dc/operasional/dasbor-spk');
                      } else {
                        router.push(`/transaksi/penjualan/surat-pesanan/ubah/${evt.nomor}`);
                      }
                    "
                    :title="evt.customer + ' (' + evt.nomor + ')'"
                  >
                    <v-icon size="9">{{
                      evt.is_completed
                        ? "mdi-check-circle"
                        : evt.tipe === "SPK"
                        ? "mdi-tshirt-crew"
                        : evt.is_scan_ready
                        ? "mdi-barcode-scan"
                        : "mdi-cash-register"
                    }}</v-icon>
                    <span class="text-truncate">{{ evt.customer || "Umum" }}</span>
                  </div>
                </template>

                <div
                  v-if="cell.events.length > 2"
                  class="more-badge"
                  @click.stop="openDayDetails(cell.dateStr, cell.events)"
                >
                  +{{ cell.events.length - 2 }} lagi
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDayDetailDialog" max-width="450px" scrollable>
      <v-card class="rounded-xl overflow-hidden" style="max-height: 90vh">
        <div
          style="
            padding: 16px 18px 12px;
            border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
          "
        >
          <div>
            <div
              style="
                font-size: 10px;
                font-weight: 600;
                color: #aaa;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 2px;
              "
            >
              {{ formatAgendaDate(selectedDayDate).split("(")[0].trim() }}
              <span v-if="holidays[selectedDayDate]" class="text-red ml-1"
                >- {{ holidays[selectedDayDate] }}</span
              >
            </div>
            <div style="font-size: 17px; font-weight: 600; color: #111; line-height: 1.2">
              {{ selectedDayEvents.length }} agenda pesanan
            </div>
          </div>
          <button
            @click="showDayDetailDialog = false"
            style="
              width: 28px;
              height: 28px;
              border-radius: 50%;
              border: 1px solid #e8e8e8;
              background: #f5f5f5;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #666;
              flex-shrink: 0;
            "
          >
            <v-icon size="14">mdi-close</v-icon>
          </button>
        </div>

        <v-card-text class="pa-3" style="overflow-y: auto">
          <div v-if="selectedDayEvents.length === 0" class="pa-6 text-center text-grey">
            <v-icon size="40" class="mb-2" color="grey-lighten-1"
              >mdi-calendar-blank-outline</v-icon
            >
            <div class="text-caption">Tidak ada agenda di hari ini</div>
          </div>

          <div v-else style="display: flex; flex-direction: column; gap: 8px">
            <div
              v-for="(evt, idx) in selectedDayEvents"
              :key="idx"
              style="
                border: 0.5px solid #eee;
                border-radius: 10px;
                padding: 10px 12px;
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                transition: border-color 0.12s;
                background: #fff;
              "
              @mouseenter="($event) => (($event.currentTarget as HTMLElement).style.borderColor = '#bbb')"
              @mouseleave="($event) => (($event.currentTarget as HTMLElement).style.borderColor = '#eee')"
              @click="
                showDayDetailDialog = false;
                showAgendaDialog = false;
                if (evt.tipe === 'SPK') {
                  router.push('/gudang-dc/operasional/dasbor-spk');
                } else {
                  router.push(`/transaksi/penjualan/surat-pesanan/ubah/${evt.nomor}`);
                }
              "
            >
              <div
                :style="{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: evt.is_completed
                    ? '#F5F5F5'
                    : evt.tipe === 'SPK'
                    ? '#F3E5F5'
                    : evt.is_scan_ready
                    ? '#E8F5E9'
                    : '#E3F2FD',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }"
              >
                <v-icon
                  size="16"
                  :color="
                    evt.is_completed
                      ? '#9E9E9E'
                      : evt.tipe === 'SPK'
                      ? '#8E24AA'
                      : evt.is_scan_ready
                      ? '#2E7D32'
                      : '#1565C0'
                  "
                >
                  {{
                    evt.is_completed
                      ? "mdi-check-circle"
                      : evt.tipe === "SPK"
                      ? "mdi-tshirt-crew"
                      : evt.is_scan_ready
                      ? "mdi-barcode-scan"
                      : "mdi-cash-register"
                  }}
                </v-icon>
              </div>

              <div style="flex: 1; min-width: 0">
                <div
                  style="font-size: 13px; font-weight: 600; margin-bottom: 3px; line-height: 1.3"
                  :class="
                    evt.is_completed
                      ? 'text-grey text-decoration-line-through'
                      : 'text-grey-darken-4'
                  "
                >
                  {{ evt.customer || "Umum" }}
                </div>

                <div style="display: flex; align-items: center; gap: 6px">
                  <span
                    :style="{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: evt.is_completed
                        ? '#F5F5F5'
                        : evt.tipe === 'SPK'
                        ? '#F3E5F5'
                        : evt.is_scan_ready
                        ? '#E8F5E9'
                        : '#E3F2FD',
                      color: evt.is_completed
                        ? '#9E9E9E'
                        : evt.tipe === 'SPK'
                        ? '#8E24AA'
                        : evt.is_scan_ready
                        ? '#2E7D32'
                        : '#1565C0',
                    }"
                  >
                    {{ evt.tipe || "SO" }}
                  </span>
                  <span style="font-size: 10px; color: #aaa">{{ evt.nomor }}</span>
                  <v-chip
                    v-if="evt.is_completed"
                    size="x-small"
                    color="grey-darken-1"
                    variant="flat"
                    class="font-weight-bold"
                    style="height: 16px; font-size: 9px"
                    >Selesai</v-chip
                  >
                  <v-chip
                    v-else-if="evt.is_scan_ready"
                    size="x-small"
                    color="success"
                    variant="flat"
                    class="font-weight-bold"
                    style="height: 16px; font-size: 9px"
                    >Scan Ready</v-chip
                  >
                </div>
                <div
                  v-if="evt.rincian_dtf"
                  class="text-caption text-grey-darken-1 text-truncate mt-1"
                  style="font-size: 10px !important"
                >
                  <v-icon size="12" class="mr-1">
                    {{ evt.tipe === "SPK" ? "mdi-factory" : "mdi-printer-3d-nozzle" }}
                  </v-icon>
                  {{ evt.rincian_dtf }}
                </div>
              </div>
              <v-icon size="16" color="#ddd">mdi-chevron-right</v-icon>
            </div>
          </div>
        </v-card-text>
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

    <template v-if="isStoreUser">
      <StartSessionModal />
      <HandoverSessionModal />
    </template>
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

/* === KALENDER BARU === */
.cal-header-inner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
}
.cal-year-label {
  font-size: 11px;
  font-weight: 500;
  color: #aaa;
  letter-spacing: 0.3px;
}
.cal-month-title {
  font-size: 20px;
  font-weight: 600;
  color: #111;
  letter-spacing: -0.3px;
}
.cal-nav-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cal-nav-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  background: #f8f8f8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  transition: background 0.1s, border-color 0.1s;
}
.cal-nav-btn:hover {
  background: #fff;
  border-color: #ccc;
}
.cal-today-pill {
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid #e0e0e0;
  font-size: 12px;
  font-weight: 500;
  color: #555;
  cursor: pointer;
  background: #f8f8f8;
  transition: all 0.1s;
}
.cal-today-pill:hover {
  background: #fff;
  border-color: #bbb;
}

/* Weekdays header */
.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  padding: 0 8px;
  background: #fafafa;
}
.calendar-weekdays span {
  text-align: center;
  font-size: 10px;
  font-weight: 600;
  color: #bbb;
  padding: 8px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.calendar-weekdays .weekend-label {
  color: #ddd;
}

/* Grid sel */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(72px, 1fr); /* ← dari 86px jadi 72px */
  padding: 4px 4px 8px; /* ← kurangi padding horizontal */
}
.calendar-cell {
  min-height: 72px;
  padding: 5px 3px 3px;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
  overflow: hidden; /* ← INI YANG PALING PENTING */
  min-width: 0; /* ← mencegah cell melebar */
}

.calendar-cell:hover {
  background: #fafafa;
}
.cell-date-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}
.cell-date {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  flex-shrink: 0;
}
.cell-date.other-month {
  color: #ddd;
}
.cell-date.is-today {
  background: #d32f2f !important;
  color: #fff !important;
  font-weight: 700;
}
.cell-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow: hidden;
  min-width: 0; /* ← tambahkan ini */
  width: 100%; /* ← tambahkan ini */
}

/* Event pill baru */
.event-pill {
  font-size: 9px;
  font-weight: 600;
  padding: 2px 5px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 3px;
  line-height: 1.4;
  width: 100%; /* ← ambil lebar penuh container */
  min-width: 0; /* ← WAJIB agar flex child bisa truncate */
  max-width: 100%; /* ← tidak boleh melebihi parent */
  box-sizing: border-box;
}
.event-pill i {
  font-size: 9px;
  flex-shrink: 0;
}
.ep-so {
  background: #e3f2fd;
  color: #1565c0;
}
.ep-so-ready {
  background: #e8f5e9;
  color: #2e7d32;
}
.ep-dtf-0 {
  background: #fce4ec;
  color: #c62828;
}
.ep-dtf-1 {
  background: #e8f5e9;
  color: #2e7d32;
}
.ep-dtf-2 {
  background: #fff8e1;
  color: #f57f17;
}
.ep-spk {
  background: #f3e5f5;
  color: #8e24aa;
}

.more-badge {
  font-size: 9px;
  color: #bbb;
  font-weight: 600;
  padding: 1px 4px;
  text-align: center;
  border-radius: 3px;
  cursor: pointer;
  margin-top: 1px;
  transition: all 0.1s;
}
.more-badge:hover {
  background: #f0f0f0;
  color: #1565c0;
}

.cal-legend-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 20px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
  background: #fafafa;
}

.cal-legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 500;
  color: #888;
}

.cal-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Responsif HP */
@media (max-width: 600px) {
  .calendar-grid {
    grid-auto-rows: minmax(56px, 1fr);
    padding: 2px 2px 4px;
  }
  .calendar-cell {
    min-height: 56px;
    padding: 4px 2px 2px;
  }
  .event-pill {
    font-size: 8px;
    padding: 1px 3px;
  }
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

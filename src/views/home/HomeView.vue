<script setup lang="ts">
defineOptions({ name: "HomeView" });

import { ref, onMounted, onUnmounted, computed, reactive, watch } from "vue";
import { useAuthStore } from "@/stores/authStore";
import { useRouter } from "vue-router";
// [GSAP] Import Library
import { gsap } from "gsap";
import * as XLSX from "xlsx";
import axios from "axios";
import type { AxiosError } from "axios";

import logoUrl from "@/assets/logo.png";
import bannerImage from "@/assets/banner-image.jpg";
import storeBg from "@/assets/store-bg.jpg";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, subDays } from "date-fns";
import { Bar, Line, Pie } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  CategoryScale,
  LinearScale,
  ArcElement,
} from "chart.js";
import type { ChartOptions, ChartData, ChartDataset, TooltipItem } from "chart.js";
import type { Context } from "chartjs-plugin-datalabels";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { formatRupiah } from "@/utils/formatRupiah";
import JuknisModal from "@/components/modal/JuknisModal.vue";
import TrackingAnalytics from "@/components/button/TrackingAnalytics.vue";
import RealStockDialog from "@/components/modal/RealStockDialog.vue";
import KaosanAiDialog from "@/components/dialog/KaosanAiDialog.vue";
import { useSwipeNavigate } from "@/composables/useSwipeNavigate";

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  CategoryScale,
  LinearScale,
  ChartDataLabels,
  ArcElement
);

// --- INTERFACES ---
interface PendingAction {
  key: string;
  title: string;
  icon: string;
  to: string;
  count: number;
}

interface SalesChartItem {
  tanggal: string;
  total: number;
}

interface PiutangBreakdown {
  cabang_kode: string;
  cabang_nama: string;
  sisa_piutang: number;
}

interface StockCabang {
  kode_cabang: string;
  nama_cabang: string;
  totalStock: number;
}

interface SalesBreakdownItem {
  nama: string;
  omset: number;
}

interface DashboardStats {
  todaySales: number;
  todayQty: number;
  todayTransactions: number;
  lowStock: number;
  totalStock: number;
  reservedStock: number;
  totalStok: number;
  todayStokIn: number;
  todayStokOut: number;
  totalSisaPiutang: number;
  stokPerCabang: StockCabang[];
  salesBreakdown: SalesBreakdownItem[];
}

interface ActivePromo {
  pro_nomor: string;
  pro_judul: string;
  pro_totalrp: number;
  pro_disrp: number;
  pro_diskon: number;
  pro_lipat: "Y" | "N";
}

interface FrequentMenu {
  title: string;
  icon: string;
  to: string;
  color: string;
}

interface ItemTrend {
  kode: string;
  nama: string;
  store_count_now: number;
  avg_now: number;
  avg_min_1: number;
  avg_min_2: number;
  avg_min_3: number;
  avg_ly_now: number;
  avg_ly_plus_1: number;
  avg_ly_plus_2: number;
}

interface LowStockProduct {
  KODE: string;
  BARCODE?: string;
  NAMA: string;
  UKURAN: string;
  TOTAL: number;
  Buffer: number;
  AVG_SALE: number;
}

interface ShipmentSchedule {
  id?: number;
  tanggal_kirim: string;
  cabang_tujuan: string;
  nama_cabang: string;
  no_sj?: string;
  status: "Antri" | "Packing" | "Kirim" | "Selesai";
  keterangan?: string;
}

interface MasterJadwalRutin {
  id: number;
  cabang_kode: string;
  cabang_nama: string;
  kiriman_1: string;
  kiriman_2: string;
}

interface AnalisaLaba {
  omset: number;
  hpp: number;
  labaKotor: number;
  margin: number;
  pengeluaran: number;
  labaBersih: number;
  kasAktual: number;
  jmlTransaksi: number;
  basketSize: number;
}

interface BordirSchedule {
  so_nomor: string;
  tanggal_so: string;
  customer: string;
  jumlah_kaos: number;
  masuk_workshop: number;
  tgl_pengerjaan: string | null;
  deadline: string | null;
  status: "Antri" | "Ready" | "Pending";
  alasan_pending: string | null;
}

interface BranchPerformance {
  kode_cabang: string;
  nama_cabang: string;
  nominal: number;
  target: number;
  ach: number;
}

interface ParetoItem {
  rank: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  target: number;
  status: string;
  color: string;
  buffer_per_toko?: number;
  branches?: ParetoBranch[];
}

interface StokKosongItem {
  kode: string;
  barcode?: string;
  nama_barang: string;
  ukuran: string;
  stok_akhir: number;
  nama_cabang?: string;
}

interface ParetoBranch {
  nama: string;
  status: string;
  stok: number;
  target_toko: number;
}

interface PiutangInvoice {
  invoice: string;
  tanggal: string;
  customer_nama: string;
  sisa_piutang: number;
}

interface RecentTransaction {
  id: string;
  customer: string;
  time: string;
  amount: number;
}

interface TopProduct {
  KODE: string;
  NAMA: string;
  UKURAN: string;
  TOTAL: number;
}

interface CabangItem {
  kode: string;
  nama: string;
}

interface ExportItem {
  nama_cabang?: string;
  kode?: string;
  KODE?: string;
  barcode?: string;
  BARCODE?: string;
  nama_barang?: string;
  NAMA?: string;
  nama?: string;
  ukuran?: string;
  UKURAN?: string;
  stok_akhir?: number;
  TOTAL?: number;
}

interface LowStockSaleItem {
  cabang_nama: string;
  kode: string;
  nama: string;
  ukuran: string;
  stok_sekarang: number;
  total_terjual: number;
}

interface SeasonalSaleItem {
  cabang_nama: string;
  kode: string;
  nama: string;
  ukuran: string;
  total_terjual: number;
}

interface AgendaItem {
  dateline: string;
  nomor: string;
  customer: string;
  is_completed?: number;
}

interface SpkPendingItem {
  spk_nomor: string;
  spk_tanggal: string;
  nama_desain: string;
  jumlah: number;
  cabang: string;
  status_pending: string;
  status_kerja: string;
  ket_pending: string;
  user_create: string;
  spk_dateline: string | null;
  spk_keterangan: string;
}

interface DeadStockChartItem {
  kategori: string;
  fm: number;
  std: number;
  sm: number;
  ds: number;
}

interface DeadStockDetailItem {
  kode: string;
  nama: string;

  ukuran?: string;
  cabang?: string;
  jenis_kain?: string;

  stok?: number;
  qty_terjual?: number;
  total_terjual?: number;

  umur_bulan?: number;
  nilai_stok?: number;
}

interface AutoMintaAnalytics {
  nomor_mt: string;
  tanggal_mt: string;
  kode_cabang: string;
  nama_cabang: string;
  keterangan: string;
  qty_minta: number;
  qty_packed: number;
  qty_sent: number;
  ratio_packing: number;
  ratio_sj: number;
}

interface StokKosongFastMovingItem {
  cabang: string;
  nama_cabang: string;
  kode: string;
  nama: string;
  ukuran: string;
  last_tstbj: string;
  umur_bulan: number;
  stok_sekarang: number;
}

const authStore = useAuthStore();
const router = useRouter();
const toast = useToast();

const goToLogin = () => {
  router.push("/login");
};

// --- STATE UTAMA ---
const stats = ref<DashboardStats>({
  todaySales: 0,
  todayQty: 0,
  todayTransactions: 0,
  lowStock: 0,
  totalStock: 0,
  reservedStock: 0,
  totalStok: 0,
  todayStokIn: 0,
  todayStokOut: 0,
  totalSisaPiutang: 0,
  stokPerCabang: [],
  salesBreakdown: [],
});

const salesTargetSummary = ref({ nominal: 0, target: 0 });
const stagnantStockValue = ref(0);
const lowStockCount = ref(0);

// --- [GSAP] 1. COMPOSABLE ANIMASI ANGKA ---
const useGsapNumber = (sourceGetter: () => number) => {
  const displayValue = ref(0);

  watch(sourceGetter, (newVal) => {
    gsap.to(displayValue, {
      value: Number(newVal) || 0,
      duration: 1.5,
      ease: "power2.out",
    });
  });

  return displayValue;
};

// --- [GSAP] 2. TERAPKAN KE VARIABLE ---
const animatedSales = useGsapNumber(() => stats.value.todaySales);
const animatedTx = useGsapNumber(() => stats.value.todayTransactions);
const animatedQty = useGsapNumber(() => stats.value.todayQty);
const animatedTotalStock = useGsapNumber(() => stats.value.totalStock);
const animatedReservedStock = useGsapNumber(() => stats.value.reservedStock);
// const animatedLowStock = useGsapNumber(() => lowStockCount.value);
const animatedPiutang = useGsapNumber(() => stats.value.totalSisaPiutang);
const animatedTargetRealization = useGsapNumber(() => salesTargetSummary.value.nominal);
const animatedStagnant = useGsapNumber(() => stagnantStockValue.value);

// --- [GSAP] 3. ANIMASI LIST (STAGGER) ---
const onListEnter = (el: Element, done: () => void) => {
  // Casting 'el' ke HTMLElement agar bisa mengakses properti .dataset
  const element = el as HTMLElement;

  gsap.fromTo(
    element,
    { opacity: 0, x: -30 },
    {
      opacity: 1,
      x: 0,
      duration: 0.5,
      ease: "power2.out",
      onComplete: done,
      // dataset.index bertipe string, harus dikonversi ke number
      // '|| 0' digunakan sebagai fallback jika index tidak ditemukan
      delay: Number(element.dataset.index || 0) * 0.1,
    }
  );
};

// --- STATE LAINNYA ---
const activeTab = ref("beranda");
const isLoadingStats = ref(true);
const isLoadingPiutang = ref(true);
const isLoadingPiutangBreakdown = ref(true);
const piutangBreakdown = ref<PiutangBreakdown[]>([]);
const piutangByInvoice = ref<PiutangInvoice[]>([]);
const isLoadingPiutangInvoice = ref(false);
const frequentMenus = ref<FrequentMenu[]>([]);
const isLoadingFrequent = ref(true);
const chartType = ref<"bar" | "line" | "area">("bar");
const chartGroupBy = ref<"day" | "week" | "month">("day");
const chartFilters = reactive({
  startDate: format(subDays(new Date(), 6), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  // [PERBAIKAN] Pastikan fallback-nya string kosong ""
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
});
const cabangList = ref<CabangItem[]>([]);
const chartData = ref<ChartData<"bar" | "line">>({
  labels: [],
  datasets: [], // Inisialisasi kosong saja, tidak perlu dummy object yang bikin strict
});
const isLoadingChart = ref(true);
const recentTransactions = ref<RecentTransaction[]>([]);
const isLoadingTransactions = ref(true);
const lowStockProducts = ref<LowStockProduct[]>([]);
const isLoadingLowStock = ref(true);
const pendingActions = ref<PendingAction[]>([]);
const isLoadingActions = ref(true);
const topProducts = ref<TopProduct[]>([]);
const isLoadingTopProducts = ref(true);
const topProductsCabang = ref("ALL");
const isLoadingSalesTarget = ref(true);
const branchPerformances = ref<BranchPerformance[]>([]);
const isLoadingPerformance = ref(false);
const isLoadingStagnantStock = ref(true);
const stockBreakdown = ref<{ kode_cabang: string; nama_cabang: string; totalStock: number }[]>([]);
const isLoadingStock = ref(true);
const isLoadingStockBreakdown = ref(true);
const promoText = ref("");
const isLoadingPromo = ref(false);
const itemTrendData = ref<ItemTrend[]>([]);
const isLoadingItemTrend = ref(false);
const searchStokKosong = ref("");
const stokKosongCabang = ref<string>(
  authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || ""
);
const stokKosongList = ref<StokKosongItem[]>([]);
const isLoadingStokKosong = ref(false);
const stokKosongPage = ref(1);
const isLoadingMoreStokKosong = ref(false);
const isStokKosongFinished = ref(false);
const stokKosongFastMovingList = ref<StokKosongFastMovingItem[]>([]);
const isLoadingFastMoving = ref(false);
const isLoadingMoreFastMoving = ref(false);
const isFastMovingFinished = ref(false);
const fastMovingPage = ref(1);
const fastMovingCabang = ref<string>(
  authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || ""
);
const searchFastMoving = ref("");
let searchFastMovingTimeout: ReturnType<typeof setTimeout>;
const paretoStats = ref({
  score: 0,
  actual_stock: 0,
  buffer_stock: 0,
  sku_count: 0,
  store_count: 0,
  is_pusat: false,
});
const isLoadingPareto = ref(false);
// State untuk Dialog Detail
const showParetoDetail = ref(false);
const paretoItems = ref<ParetoItem[]>([]);
const isLoadingParetoDetail = ref(false);
const searchPareto = ref("");
const filterPareto = ref("ALL"); // ALL, KRITIS, AMAN, OVER
let searchStokKosongTimeout: ReturnType<typeof setTimeout>;
const shipmentSchedules = ref<ShipmentSchedule[]>([]);
const isLoadingSchedules = ref(true);
const isAddScheduleDialog = ref(false);
const trendCabang = ref("ALL");
const lowStockSalesData = ref<LowStockSaleItem[]>([]);
const isLoadingLowStockSales = ref(false);
const filterLowStockPeriod = ref("3m");
const filterLowStockCabang = ref(
  authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || ""
);
const lowStockPeriods = [
  { title: "3 Bulan Terakhir", value: "3m" },
  { title: "6 Bulan Terakhir", value: "6m" },
  { title: "1 Tahun Terakhir", value: "1y" },
];

const seasonalSalesData = ref<SeasonalSaleItem[]>([]);
const isLoadingSeasonalSales = ref(false);
const filterSeasonalPeriod = ref("1m");
const filterSeasonalCabang = ref(
  authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || ""
);
const seasonalPeriods = [
  { title: "1 Minggu Terakhir", value: "1w" },
  { title: "2 Minggu Terakhir", value: "2w" },
  { title: "1 Bulan Terakhir", value: "1m" },
  { title: "2 Bulan Terakhir", value: "2m" },
];

const lowStockHeaders = [
  { title: "STORE", key: "cabang_nama", sortable: false },
  { title: "KODE", key: "kode", sortable: false },
  { title: "NAMA BARANG", key: "nama", sortable: false },
  { title: "UK.", key: "ukuran", align: "center", sortable: false },
  { title: "STOK", key: "stok_sekarang", align: "center", sortable: true },
  { title: "TERJUAL", key: "total_terjual", align: "center", sortable: true },
] as const;

const seasonalHeaders = [
  { title: "STORE", key: "cabang_nama", sortable: false },
  { title: "KODE", key: "kode", sortable: false },
  { title: "NAMA BARANG", key: "nama", sortable: false },
  { title: "UK.", key: "ukuran", align: "center", sortable: false },
  { title: "TERJUAL", key: "total_terjual", align: "center", sortable: true },
] as const;
const selectedCabangPiutang = ref<string>(""); // Menyimpan kode cabang yang sedang diklik KDC
const piutangInvoiceDetails = ref<PiutangInvoice[]>([]); // Menyimpan daftar invoice hasil klik
const isLoadingPiutangDetails = ref(false);
const showJuknis = ref(false);
const showTrackingAnalytics = ref(false);
const showAgendaReminder = ref(false);
const isRealStockOpen = ref(false);
const overbookedCount = ref(0);

const todayAgendaItems = computed(() => {
  const today = new Date();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${m}-${d}`;
  // agendaList perlu di-fetch, atau terima dari props/store
  return agendaList.value.filter((item) => item.dateline === todayStr);
});

// --- STATE AUTO MINTA ANALYTICS ---
const autoMintaData = ref<AutoMintaAnalytics[]>([]);
const isLoadingAutoMinta = ref(false);
const autoMintaFilter = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"), // Default 1 bulan terakhir
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
});

const autoMintaHeaders = [
  { title: "Toko Peminta", key: "nama_cabang" },
  { title: "Total Permintaan", key: "qty_minta", align: "center" as const },
  { title: "Packing DC (Pcs)", key: "qty_packed", align: "center" as const }, // <-- KOLOM BARU
  { title: "Rasio Packing", key: "ratio_packing", align: "center" as const, width: 150 },
  { title: "Terkirim SJ (Pcs)", key: "qty_sent", align: "center" as const }, // <-- KOLOM BARU
  { title: "Rasio SJ", key: "ratio_sj", align: "center" as const, width: 150 },
];

// --- STATE BORDIR ---
const bordirSchedules = ref<BordirSchedule[]>([]);
const isLoadingBordir = ref(true);
const isEditBordirDialog = ref(false);
// [BARU] Filter Tanggal khusus untuk Card Bordir (Default 7 hari terakhir)
const bordirFilter = reactive({
  startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
});
const bordirForm = reactive({
  so_nomor: "",
  tgl_pengerjaan: "",
  deadline: "",
  status: "Antri" as "Antri" | "Ready" | "Pending",
  alasan_pending: "",
});

// --- COMPUTED HAK AKSES BORDIR ---
const canEditBordir = computed(() => {
  const u = authStore.user;
  if (!u) return false;
  // Boleh edit JIKA dia orang K06 ATAU orang KDC yang ID-nya ANTA
  return u.cabang === "K06" || (u.cabang === "KDC" && u.kode === "ANTA");
});

const scheduleForm = reactive({
  tanggal_kirim: format(new Date(), "yyyy-MM-dd"),
  cabang_tujuan: "",
  keterangan: "",
  status: "Antri" as const,
});

const masterSchedulesFromDB = ref<MasterJadwalRutin[]>([]);

const fetchMasterJadwalRutin = async () => {
  try {
    const response = await api.get("/dashboard/master-jadwal-rutin");
    masterSchedulesFromDB.value = response.data;
  } catch (error) {
    console.error("Gagal load master jadwal", error);
  }
};

// Computed untuk menggabungkan jadwal tetap dengan status pengiriman riil
const combinedSchedules = computed(() => {
  const userCabang = authStore.user?.cabang;

  // 1. Filter Master Jadwal berdasarkan user
  let filteredMaster = masterSchedulesFromDB.value;

  if (userCabang !== "KDC") {
    // Jika user Toko, hanya ambil baris toko tsb
    filteredMaster = masterSchedulesFromDB.value.filter((m) => m.cabang_kode === userCabang);
  }

  // 2. Map data seperti biasa
  return filteredMaster.map((master) => {
    const activeShipment = shipmentSchedules.value.find(
      (s) => s.cabang_tujuan === master.cabang_kode && s.status !== "Selesai"
    );
    return {
      kode: master.cabang_kode,
      nama: master.cabang_nama,
      k1: master.kiriman_1,
      k2: master.kiriman_2,
      activeShipment,
    };
  });
});

// List kiriman tambahan (yang tidak ada di masterSchedules)
const extraShipments = computed(() => {
  const userCabang = authStore.user?.cabang;
  const masterKodes = masterSchedulesFromDB.value.map((m) => m.cabang_kode);

  return shipmentSchedules.value.filter((s) => {
    const isExtra = !masterKodes.includes(s.cabang_tujuan) && s.status !== "Selesai";

    // Jika KDC tampilkan semua extra, jika Toko hanya tampilkan extra miliknya
    if (userCabang !== "KDC") {
      return isExtra && s.cabang_tujuan === userCabang;
    }
    return isExtra;
  });
});

const labaData = ref<AnalisaLaba>({
  omset: 0,
  hpp: 0,
  labaKotor: 0,
  margin: 0,
  pengeluaran: 0,
  labaBersih: 0,
  kasAktual: 0,
  jmlTransaksi: 0,
  basketSize: 0,
});
const isLoadingCashflow = ref(true);
const cashflowDate = ref(format(subDays(new Date(), 1), "yyyy-MM-dd"));

const itemTrendHeaders = [
  { title: "Nama Barang", key: "nama", width: "20%" },
  { title: "Toko", key: "store_count_now", align: "center" },
  { title: "Bln Ini", key: "avg_now", align: "end" },
  { title: "Bln-1", key: "avg_min_1", align: "end" },
  { title: "Bln-2", key: "avg_min_2", align: "end" },
  { title: "Bln-3", key: "avg_min_3", align: "end" }, // Kembali
  { title: "LY Now", key: "avg_ly_now", align: "end" }, // Kembali
  { title: "LY+1", key: "avg_ly_plus_1", align: "end" },
  { title: "LY+2", key: "avg_ly_plus_2", align: "end" },
  { title: "Tren", key: "trend", align: "center", sortable: false },
] as const;

// Headers Tabel
const paretoHeaders = [
  { title: "Rank", key: "rank", width: "80px" },
  { title: "Barang", key: "nama" },
  { title: "Stok", key: "stok", align: "end" },
  { title: "Buffer", key: "target", align: "end" },
  { title: "Status", key: "status", align: "center" },
] as const;

// --- TREND INDICATOR LOGIC ---
const prevStats = ref({ todaySales: 0 });
const trendIndicators = reactive({ sales: "neutral" });

watch(
  () => stats.value.todaySales,
  (n) => {
    if (n > prevStats.value.todaySales) trendIndicators.sales = "up";
    else if (n < prevStats.value.todaySales) trendIndicators.sales = "down";
    else trendIndicators.sales = "neutral";
    prevStats.value.todaySales = n;
  }
);

// --- CHART & COLORS ---
const targetPercentage = computed(() => {
  if (!salesTargetSummary.value.target || salesTargetSummary.value.target === 0) return 0;
  return (salesTargetSummary.value.nominal / salesTargetSummary.value.target) * 100;
});

const isOverTarget = computed(() => targetPercentage.value > 100);

const getProgressColor = (percentage: number) => {
  // [PERBAIKAN]
  if (percentage >= 100) return "#4CAF50";
  if (percentage >= 75) return "#2196F3";
  if (percentage >= 50) return "#FF9800";
  if (percentage >= 25) return "#FFC107";
  return "#F44336";
};

const targetChartData = computed(() => ({
  labels: ["Pencapaian"],
  datasets: [
    {
      label: "Target",
      data: [salesTargetSummary.value.target],
      backgroundColor: "#E0E0E0",
      borderRadius: 4,
      barPercentage: 1.0,
    },
    {
      label: "Realisasi",
      data: [salesTargetSummary.value.nominal],
      backgroundColor: getProgressColor(targetPercentage.value),
      borderRadius: 4,
      barPercentage: 0.6,
    },
  ],
}));

// Helper Computed
const isWarehouseUser = computed(() => authStore.user?.isWarehouseUser === true);

const fr = (val: number) => formatRupiah(val);

const targetChartOptions = ref<ChartOptions<"bar" | "line">>({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        callback: (value: number | string) => {
          if (typeof value === "number") {
            if (value >= 1000000) return `Rp ${value / 1000000} Jt`;
            return fr(value);
          }
          return value;
        },
      },
    },
    x: { grid: { display: false } },
  },
  plugins: {
    legend: { position: "bottom" },
    tooltip: {
      callbacks: {
        label: (context: TooltipItem<"bar" | "line">) =>
          `${context.dataset.label}: ${fr(context.parsed.y as number)}`,
      },
    },
    datalabels: {
      anchor: "end",
      align: "top",
      formatter: (value, context) => (context.datasetIndex === 1 ? fr(value) : null),
      font: { weight: "bold", size: 10 },
      color: "#424242",
    },
  },
});

const chartColors = [
  "#42A5F5",
  "#66BB6A",
  "#FFA726",
  "#EF5350",
  "#AB47BC",
  "#FF7043",
  "#26C6DA",
  "#7E57C2",
  "#9CCC65",
  "#5C6BC0",
  "#8D6E63",
  "#78909C",
];

const branchDistributionData = computed(() => ({
  labels: branchPerformances.value.map((b) => b.nama_cabang),
  datasets: [
    {
      backgroundColor: chartColors.slice(0, branchPerformances.value.length),
      data: branchPerformances.value.map((b) => b.nominal),
      borderWidth: 2,
      borderColor: "#ffffff",
      hoverOffset: 4,
    },
  ],
}));

// Computed Filtered List
const filteredParetoItems = computed(() => {
  let items = paretoItems.value;

  // Filter Tab
  if (filterPareto.value !== "ALL") {
    items = items.filter((i) => i.status === filterPareto.value);
  }

  // Search
  if (searchPareto.value) {
    const q = searchPareto.value.toLowerCase();
    items = items.filter(
      (i) => i.nama.toLowerCase().includes(q) || i.kode.toLowerCase().includes(q)
    );
  }
  return items;
});

// --- LAZY LOAD PARETO ---
const paretoDisplayCount = ref(20);

// Gunakan ini untuk v-data-table alih-alih filteredParetoItems langsung
const paginatedParetoItems = computed(() => {
  return filteredParetoItems.value.slice(0, paretoDisplayCount.value);
});

// Fungsi saat scroll menyentuh bawah tabel
const onIntersectPareto = (isIntersecting: boolean) => {
  if (isIntersecting && paretoDisplayCount.value < filteredParetoItems.value.length) {
    // Tambah 20 item setiap kali mentok bawah
    paretoDisplayCount.value += 20;
  }
};

// Reset limit ketika user mengganti filter atau mencari barang
watch([filterPareto, searchPareto], () => {
  paretoDisplayCount.value = 20;
});

const pieChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "right" as const,
      labels: { usePointStyle: true, boxWidth: 10, font: { size: 11 } },
    },
    tooltip: {
      callbacks: {
        label: (context: TooltipItem<"pie">) => {
          // Ambil dataset data asli
          const dataset = context.chart.data.datasets[context.datasetIndex];
          const dataArray = dataset.data as number[]; // Pastikan tipe data number

          // Hitung total manual
          const total = dataArray.reduce((acc, curr) => acc + (curr || 0), 0);

          const value = context.parsed;
          const percentage = ((value / total) * 100).toFixed(1) + "%";

          return `${context.label}: ${formatRupiah(value)} (${percentage})`;
        },
      },
    },
    datalabels: {
      // Ganti 'any' dengan 'Context'
      display: (context: Context) => {
        const value = context.dataset.data[context.dataIndex];
        // Pastikan value adalah number sebelum cek > 0
        return typeof value === "number" ? value > 0 : false;
      },
      color: "#fff",
      font: { weight: "bold" as const, size: 10 },

      // Ganti 'ctx: any' dengan 'ctx: Context'
      formatter: (value: number, ctx: Context) => {
        // CARA AMAN (Type-Safe): Hitung total manual dari data dataset
        // Kita casting data ke number[] karena ini Pie Chart
        const dataArray = ctx.chart.data.datasets[ctx.datasetIndex].data as number[];
        const total = dataArray.reduce((acc, curr) => acc + (curr || 0), 0);

        const percentage = (value / total) * 100;
        return percentage > 5 ? percentage.toFixed(0) + "%" : "";
      },
    },
  },
};

// --- DEAD STOCK CHART ---
const deadStockBarData = computed(() => ({
  labels: deadStockChart.value.map((r) => String(r.kategori || "Unknown")),
  datasets: [
    {
      label: "Fast Moving",
      data: deadStockChart.value.map((r) => Number(r.fm ?? 0)),
      backgroundColor: "#639922",
      borderRadius: 2,
    },
    {
      label: "Standar",
      data: deadStockChart.value.map((r) => Number(r.std ?? 0)),
      backgroundColor: "#378ADD",
      borderRadius: 2,
    },
    {
      label: "Slow Moving",
      data: deadStockChart.value.map((r) => Number(r.sm ?? 0)),
      backgroundColor: "#EF9F27",
      borderRadius: 2,
    },
    {
      label: "Dead Stock",
      data: deadStockChart.value.map((r) => Number(r.ds ?? 0)),
      backgroundColor: "#E24B4A",
      borderRadius: 2,
    },
  ],
}));

const deadStockDonutData = computed(() => {
  const d = deadStockSummary.value;
  const antara = Math.max(0, d.total - d.fm - d.std - d.sm - d.ds);
  return {
    labels: ["Fast Moving", "Standar", "Slow Moving", "Dead Stock", "Antara 1–2 thn"],
    datasets: [
      {
        data: [d.fm, d.std, d.sm, d.ds, antara],
        backgroundColor: ["#639922", "#378ADD", "#EF9F27", "#E24B4A", "#B4B2A9"],
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };
});

const deadStockBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  backgroundColor: "white",
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
  },
  scales: {
    x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
    y: { stacked: true, ticks: { font: { size: 10 } } },
  },
};

const deadStockDonutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "62%",
  backgroundColor: "white",
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { usePointStyle: true, boxWidth: 10, font: { size: 10 } },
    },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<"doughnut">) =>
          ` ${ctx.label}: ${Number(ctx.parsed).toLocaleString("id-ID")} pcs`,
      },
    },
  },
};

const deadStockSalesPie = ref({
  stok_terjual: 0,
  stok_tidak_terjual: 0,
  qty_terjual: 0,
  sku_bergerak: 0,
  sku_total: 0,
});
const isLoadingDeadStockSalesPie = ref(false);

const deadStockSalesPieData = computed(() => ({
  labels: ["Masih Bergerak (12 bln)", "Tidak Terjual (Stagnan)"],
  datasets: [
    {
      data: [
        Number(deadStockSalesPie.value.stok_terjual ?? 0),
        Number(deadStockSalesPie.value.stok_tidak_terjual ?? 0),
      ],
      backgroundColor: ["#4CAF50", "#E24B4A"],
      borderWidth: 0,
      hoverOffset: 6,
    },
  ],
}));

const deadStockSalesPieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "58%",
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { usePointStyle: true, boxWidth: 10, font: { size: 10 } },
    },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<"doughnut">) =>
          ` ${ctx.label}: ${Number(ctx.parsed).toLocaleString("id-ID")} pcs`,
      },
    },
  },
};

const currentTime = ref(
  new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "medium" })
);
let intervalId: number;

const showReviewDialog = ref(false);
const userPlaceId = ref("");
const userLat = ref("");
const userLong = ref("");

// --- STATE KAOSAN AI ---
const showAiDialog = ref(false);

// --- STATE DEAD STOCK ---
const deadStockSummary = ref({
  fm: 0,
  std: 0,
  sm: 0,
  ds: 0,
  nilaiFm: 0,
  nilaiStd: 0,
  nilaySm: 0,
  nilaiDs: 0,
  total: 0,
  nilaiTotal: 0,
});
const isLoadingDeadStock = ref(false);
const deadStockCabang = ref(
  authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || ""
);

const deadStockChart = ref<DeadStockChartItem[]>([]);
const isLoadingDeadStockChart = ref(false);

const showDeadStockDetail = ref(false);
const deadStockDetailTipe = ref<"bergerak" | "stagnan">("bergerak");
const deadStockDetailData = ref<DeadStockDetailItem[]>([]);
const isLoadingDeadStockDetail = ref(false);
const searchDeadStockDetail = ref("");
const deadStockDetailPage = ref(1);
const deadStockDetailPerPage = ref(50);

// --- STATE DASHBOARD SPK ---
const spkPendingList = ref<SpkPendingItem[]>([]);
const isLoadingSpkPending = ref(false);
const spkPendingFilter = reactive({
  startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
});

// --- FETCH FUNCTIONS ---
const fetchTodayStats = async (isBackground = false) => {
  if (!isBackground) isLoadingStats.value = true;
  try {
    const response = await api.get("/dashboard/today-stats");

    // CUKUP UPDATE STATE SAJA
    // Watcher GSAP Anda akan otomatis mendeteksi perubahan ini dan menjalankan animasi.
    stats.value = {
      ...stats.value,

      // Data Angka (Akan memicu useGsapNumber)
      todaySales: response.data.todaySales || 0,
      todayQty: Number(response.data.todayQty || 0),
      todayTransactions: Number(response.data.todayTransactions || 0),

      // Data List (Untuk Popup Breakdown)
      salesBreakdown: response.data.salesBreakdown || [],
    };
  } catch (error) {
    console.error("Error fetching today stats:", error);
  } finally {
    if (!isBackground) isLoadingStats.value = false;
  }
};

const fetchRecentTransactions = async (isBackground = false) => {
  if (!isBackground) isLoadingTransactions.value = true;
  try {
    const response = await api.get("/dashboard/recent-transactions");
    recentTransactions.value = response.data;
  } catch (error) {
    console.error("Gagal memuat transaksi", error);
  } finally {
    if (!isBackground) isLoadingTransactions.value = false;
  }
};

const fetchTotalStock = async (isBackground = false) => {
  if (!isBackground) isLoadingStock.value = true;
  try {
    const response = await api.get("/dashboard/total-stok");
    stats.value.totalStock = Number(response.data.totalStock || 0);
    stats.value.reservedStock = Number(response.data.reservedStock || 0);
    stats.value.todayStokIn = Number(response.data.todayStokIn || 0);
    stats.value.todayStokOut = Number(response.data.todayStokOut || 0);
  } catch (err) {
    console.error("Gagal memuat total stok:", err);
  } finally {
    if (!isBackground) isLoadingStock.value = false;
  }
};

const fetchLowStockData = async (isBackground = false) => {
  if (!isBackground) isLoadingLowStock.value = true;
  try {
    const response = await api.get("/laporan-stok/low-stock");
    lowStockProducts.value = response.data;
    lowStockCount.value = response.data.length;
  } catch (error) {
    console.error("Gagal memuat low stock:", error);
  } finally {
    if (!isBackground) isLoadingLowStock.value = false;
  }
};

const fetchSalesTargetSummary = async (isBackground = false) => {
  if (!isBackground) isLoadingSalesTarget.value = true;
  try {
    const response = await api.get("/dashboard/sales-target-summary");
    salesTargetSummary.value = response.data;
  } catch (error) {
    console.error("Error target summary:", error);
  } finally {
    if (!isBackground) isLoadingSalesTarget.value = false;
  }
};

const fetchStagnantStockSummary = async (isBackground = false) => {
  if (!isBackground) isLoadingStagnantStock.value = true;
  try {
    const response = await api.get("/dashboard/stagnant-stock-summary");
    stagnantStockValue.value = response.data.totalStagnantValue || 0;
  } catch (error) {
    console.error(error);
  } finally {
    if (!isBackground) isLoadingStagnantStock.value = false;
  }
};

const fetchTotalPiutang = async (isBackground = false) => {
  if (!isBackground) isLoadingPiutang.value = true;
  try {
    const response = await api.get("/dashboard/total-sisa-piutang");
    stats.value.totalSisaPiutang = response.data.totalSisaPiutang || 0;
  } catch (error) {
    console.error(error);
  } finally {
    if (!isBackground) isLoadingPiutang.value = false;
  }
};

const fetchStokKosong = async (isBackground = false, isLoadMore = false) => {
  if (isLoadMore) {
    isLoadingMoreStokKosong.value = true;
  } else {
    if (!isBackground) isLoadingStokKosong.value = true;
    stokKosongPage.value = 1;
    isStokKosongFinished.value = false;
    stokKosongList.value = [];
  }

  try {
    const cabangParam = authStore.user?.cabang === "KDC" ? stokKosongCabang.value : undefined;
    const response = await api.get("/dashboard/stok-kosong", {
      params: {
        q: searchStokKosong.value,
        cabang: cabangParam,
        page: stokKosongPage.value,
        limit: 50, // Bebas atur kecepatan scroll
      },
    });

    let items = [];
    if (response.data?.data?.data && Array.isArray(response.data.data.data)) {
      items = response.data.data.data;
    } else if (response.data?.data && Array.isArray(response.data.data)) {
      items = response.data.data;
    } else if (Array.isArray(response.data)) {
      items = response.data;
    }

    // Jika jumlah data yang ditarik kurang dari limit, artinya sudah mencapai data terakhir
    if (items.length < 50) {
      isStokKosongFinished.value = true;
    }

    if (isLoadMore) {
      stokKosongList.value.push(...items);
    } else {
      stokKosongList.value = items;
    }
  } catch (error) {
    console.error("Gagal memuat stok kosong:", error);
  } finally {
    isLoadingStokKosong.value = false;
    isLoadingMoreStokKosong.value = false;
  }
};

// Fungsi pendeteksi scroll menyentuh bawah
const onIntersectStokKosong = (isIntersecting: boolean) => {
  if (
    isIntersecting &&
    !isLoadingStokKosong.value &&
    !isLoadingMoreStokKosong.value &&
    !isStokKosongFinished.value
  ) {
    stokKosongPage.value++;
    fetchStokKosong(true, true);
  }
};

// Update Watchers
watch(stokKosongCabang, () => {
  fetchStokKosong();
});

watch(searchStokKosong, () => {
  // Jika sedang diketik tapi kurang dari 3 huruf (kecuali jika dikosongkan/dihapus total)
  if (searchStokKosong.value.length > 0 && searchStokKosong.value.length < 3) return;
  clearTimeout(searchStokKosongTimeout);
  searchStokKosongTimeout = setTimeout(() => {
    fetchStokKosong();
  }, 500);
});

const exportStokKosong = async () => {
  if (stokKosongList.value.length === 0) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }

  toast.info("Menyiapkan data export stok kosong, mohon tunggu...");
  try {
    const cabangParam = authStore.user?.cabang === "KDC" ? stokKosongCabang.value : undefined;

    // [BARU] Tembak API lagi dengan parameter export: true
    const response = await api.get("/dashboard/stok-kosong", {
      params: {
        q: searchStokKosong.value,
        cabang: cabangParam,
        export: true, // <--- Flag penanda untuk backend
      },
    });

    const responseData = response.data;
    let fullData = [];

    // Tangkap data full dari backend
    if (Array.isArray(responseData)) {
      fullData = responseData;
    } else if (responseData && Array.isArray(responseData.data)) {
      fullData = responseData.data;
    }

    if (fullData.length === 0) {
      toast.warning("Data kosong saat diexport.");
      return;
    }

    // Mapping data full untuk Excel
    const dataToExport = (fullData as ExportItem[]).map((item) => ({
      Cabang: item.nama_cabang || "-", // <--- [BARU]
      "Kode Barang": item.kode || item.KODE,
      Barcode: item.barcode || item.BARCODE || "-",
      "Nama Barang": item.nama_barang || item.NAMA || item.nama,
      Ukuran: item.ukuran || item.UKURAN,
      Stok: item.stok_akhir ?? item.TOTAL ?? 0,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Atur lebar kolom otomatis
    worksheet["!cols"] = [
      { wch: 15 }, // Kode
      { wch: 15 }, // Barcode
      { wch: 50 }, // Nama Barang
      { wch: 10 }, // Ukuran
      { wch: 10 }, // Stok
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stok Kosong Reguler");

    const fileName = `Stok_Kosong_Reguler_${
      stokKosongCabang.value || authStore.user?.cabang
    }_${format(new Date(), "yyyyMMdd")}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    toast.success("Data stok kosong berhasil diekspor.");
  } catch (error) {
    toast.error("Gagal mengekspor data.");
    console.error(error);
  }
};

const fetchStokKosongFastMoving = async (isBackground = false, isLoadMore = false) => {
  if (isLoadMore) {
    isLoadingMoreFastMoving.value = true;
  } else {
    if (!isBackground) isLoadingFastMoving.value = true;
    fastMovingPage.value = 1;
    isFastMovingFinished.value = false;
    stokKosongFastMovingList.value = [];
  }
  try {
    const cabangParam = authStore.user?.cabang === "KDC" ? fastMovingCabang.value : undefined;
    const response = await api.get("/dashboard/stok-kosong-fast-moving", {
      params: {
        cabang: cabangParam,
        page: fastMovingPage.value,
        limit: 50,
      },
    });
    const items = response.data.data || [];

    if (items.length < 50) {
      isFastMovingFinished.value = true;
    }

    if (isLoadMore) {
      stokKosongFastMovingList.value.push(...items);
    } else {
      stokKosongFastMovingList.value = items;
    }
  } catch (error) {
    console.error("Gagal memuat stok kosong fast moving:", error);
  } finally {
    isLoadingFastMoving.value = false;
    isLoadingMoreFastMoving.value = false;
  }
};

// Fungsi pendeteksi scroll menyentuh bawah
const onIntersectFastMoving = (isIntersecting: boolean) => {
  if (
    isIntersecting &&
    !isLoadingFastMoving.value &&
    !isLoadingMoreFastMoving.value &&
    !isFastMovingFinished.value
  ) {
    fastMovingPage.value++;
    fetchStokKosongFastMoving(true, true);
  }
};

// [EXPORT] Tetap ambil SEMUA data, tidak terbatas pagination
const exportStokKosongFastMoving = async () => {
  toast.info("Menyiapkan data export stok kosong fast moving, mohon tunggu...");
  try {
    const cabangParam = authStore.user?.cabang === "KDC" ? fastMovingCabang.value : undefined;
    const response = await api.get("/dashboard/stok-kosong-fast-moving", {
      params: {
        cabang: cabangParam,
        export: true, // ← flag agar backend ambil semua data tanpa LIMIT
      },
    });
    const fullData: StokKosongFastMovingItem[] = response.data.data || [];

    if (fullData.length === 0) {
      toast.warning("Data kosong saat diexport.");
      return;
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(
      fullData.map((item) => ({
        Cabang: item.nama_cabang,
        Kode: item.kode,
        "Nama Barang": item.nama,
        Ukuran: item.ukuran,
        "Terakhir Diterima": item.last_tstbj
          ? format(new Date(item.last_tstbj), "dd/MM/yyyy")
          : "-",
        "Umur (Bulan)": item.umur_bulan,
        "Stok Sekarang": item.stok_sekarang,
      }))
    );
    worksheet["!cols"] = [
      { wch: 15 },
      { wch: 20 },
      { wch: 50 },
      { wch: 10 },
      { wch: 16 },
      { wch: 12 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stok Kosong Fast Moving");
    XLSX.writeFile(
      workbook,
      `Stok_Kosong_FastMoving_${fastMovingCabang.value}_${format(new Date(), "yyyyMMdd")}.xlsx`
    );
    toast.success("Export berhasil!");
  } catch (error) {
    toast.error("Gagal mengekspor data.");
    console.error(error);
  }
};

const exportTrendPenjualan = async () => {
  toast.info("Menyiapkan data export...");
  try {
    const response = await api.get("/dashboard/item-sales-trend", {
      params: { export: true, cabang: trendCabang.value },
    });
    const data = response.data;

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(
      data.map((item: ItemTrend) => ({
        Kode: item.kode,
        "Nama Barang": item.nama,
        "Store Count": item.store_count_now,
        "Avg Bulan Ini": item.avg_now,
        "Avg Bln-1": item.avg_min_1,
        "Avg Bln-2": item.avg_min_2,
        "Avg Bln-3": item.avg_min_3,
        "LY Bulan Ini": item.avg_ly_now,
        "LY Bln+1": item.avg_ly_plus_1,
        "LY Bln+2": item.avg_ly_plus_2,
      }))
    );

    XLSX.utils.book_append_sheet(workbook, worksheet, "Trend Penjualan");

    // Nama file dinamis mengikuti cabang
    const namaFile = `Trend_Sales_${trendCabang.value}_${format(new Date(), "yyyyMMdd")}.xlsx`;
    XLSX.writeFile(workbook, namaFile);
    toast.success("Export berhasil!");
  } catch (error: unknown) {
    let msg = "Gagal export data";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  }
};

// Tambahkan watcher agar data otomatis update saat filter diganti
watch(trendCabang, () => {
  fetchItemSalesTrend();
});

watch([filterLowStockCabang, filterLowStockPeriod], () => {
  fetchLowStockSales();
});

watch([filterSeasonalCabang, filterSeasonalPeriod], () => {
  fetchSeasonalSales();
});

const fetchCabangOptions = async () => {
  try {
    const response = await api.get("/dashboard/cabang-options");
    cabangList.value = response.data;
  } catch (error: unknown) {
    let msg = "Gagal memuat pilihan cabang.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  }
};

const fetchCashflowSummary = async (isBackground = false) => {
  // [PERBAIKAN] Blokir pemanggilan API jika user bukan dari KDC
  if (authStore.user?.cabang !== "KDC") return;

  if (!isBackground) isLoadingCashflow.value = true;
  try {
    const response = await api.get("/dashboard/cashflow-summary", {
      params: { date: cashflowDate.value },
    });
    labaData.value = response.data;
  } catch (error) {
    console.error("Gagal load analisa laba:", error);
  } finally {
    if (!isBackground) isLoadingCashflow.value = false;
  }
};

const fetchPendingActions = async (isBackground = false) => {
  if (!isBackground) isLoadingActions.value = true;
  try {
    // 1. Tentukan Range Tanggal sesuai Backend (Mulai 2020-01-01)
    const startDate = "2020-01-01";
    const endDate = format(new Date(), "yyyy-MM-dd"); // Sampai Hari Ini

    // 2. Request ke API
    const response = await api.get("/dashboard/pending-actions", {
      params: { startDate, endDate },
    });
    const data = response.data;

    // 3. Update actionsMap dengan menambahkan Query Params tanggal ke URL ('to')
    const actionsMap = [
      {
        key: "so_open",
        title: "Surat Pesanan Open",
        icon: "mdi-file-document-edit-outline",
        to: `/transaksi/penjualan/surat-pesanan?status=open&startDate=${startDate}&endDate=${endDate}`,
      },
      {
        key: "so_dtf_open",
        title: "SO DTF Belum Invoice",
        icon: "mdi-printer-alert",
        to: `/transaksi/penjualan/dtf/so-dtf?status=belum_invoice&startDate=${startDate}&endDate=${endDate}`,
      },
      {
        key: "invoice_belum_lunas",
        title: "Sisa Piutang Invoice",
        icon: "mdi-receipt-text-clock-outline",
        to: `/transaksi/penjualan/invoice?status=sisa_piutang&startDate=${startDate}&endDate=${endDate}`,
      },
      {
        key: "penawaran_open",
        title: "Penawaran Open",
        icon: "mdi-handshake-outline",
        to: `/transaksi/penjualan/penawaran?status=open&startDate=${startDate}&endDate=${endDate}`,
      },
      {
        key: "pengajuan_harga_pending",
        title: "Pengajuan Harga Pending",
        icon: "mdi-file-clock-outline",
        to: `/transaksi/penjualan/pengajuan/pengajuan-harga?status=pending&startDate=${startDate}&endDate=${endDate}`,
      },
    ];

    // Mapping data count
    pendingActions.value = actionsMap.map((action) => ({
      ...action,
      count: data[action.key] || 0,
    }));
  } catch (error) {
    console.error("Gagal memuat pending actions:", error);
  } finally {
    if (!isBackground) isLoadingActions.value = false;
  }
};

const fetchShipmentSchedules = async (isBackground = false) => {
  if (!isBackground) isLoadingSchedules.value = true;
  try {
    // Sesuaikan endpoint dengan backend Anda
    const response = await api.get("/dashboard/shipment-schedules");
    shipmentSchedules.value = response.data;
  } catch (error) {
    console.error("Gagal memuat jadwal kirim", error);
  } finally {
    if (!isBackground) isLoadingSchedules.value = false;
  }
};

const saveSchedule = async () => {
  if (!scheduleForm.cabang_tujuan) return toast.error("Pilih Cabang Tujuan");

  try {
    await api.post("/dashboard/shipment-schedules", {
      tanggal_kirim: scheduleForm.tanggal_kirim,
      cabang_tujuan: scheduleForm.cabang_tujuan,
      keterangan: scheduleForm.keterangan,
      status: scheduleForm.status,
    });

    toast.success("Jadwal kirim berhasil ditambahkan");
    isAddScheduleDialog.value = false;

    // Reset Form
    scheduleForm.cabang_tujuan = "";
    scheduleForm.keterangan = "";

    fetchShipmentSchedules(true);
  } catch (err: unknown) {
    // Casting 'err' agar aman diakses propertinya
    const error = err as { response?: { data?: { message?: string } } };
    const msg = error.response?.data?.message || "Gagal menyimpan jadwal";
    toast.error(msg);
  }
};

const updateStatus = async (id: number, newStatus: string) => {
  try {
    await api.patch("/dashboard/shipment-schedules/status", { id, status: newStatus });
    toast.success(`Status diperbarui menjadi ${newStatus}`);

    // Refresh data jadwal setelah update
    fetchShipmentSchedules(true);
  } catch (error) {
    toast.error("Gagal memperbarui status");
    console.error(error);
  }
};

// --- FUNGSI BORDIR ---
const fetchBordirSchedules = async (isBackground = false) => {
  if (!isBackground) isLoadingBordir.value = true;
  try {
    const response = await api.get("/dashboard/bordir-schedules", {
      params: bordirFilter, // <-- Kirim filter tanggal ke backend
    });
    bordirSchedules.value = response.data;
  } catch (err) {
    console.error("Gagal load jadwal bordir", err);
  } finally {
    if (!isBackground) isLoadingBordir.value = false;
  }
};

watch(
  () => bordirFilter,
  () => {
    fetchBordirSchedules();
  },
  { deep: true }
);

const openEditBordir = (item: BordirSchedule) => {
  bordirForm.so_nomor = item.so_nomor;
  bordirForm.tgl_pengerjaan = item.tgl_pengerjaan
    ? format(new Date(item.tgl_pengerjaan), "yyyy-MM-dd")
    : "";
  bordirForm.deadline = item.deadline ? format(new Date(item.deadline), "yyyy-MM-dd") : "";
  bordirForm.status = item.status || "Antri";
  bordirForm.alasan_pending = item.alasan_pending || "";
  isEditBordirDialog.value = true;
};

const saveBordirSchedule = async () => {
  try {
    await api.post("/dashboard/bordir-schedules", bordirForm);
    toast.success("Jadwal antrian bordir berhasil diupdate!");
    isEditBordirDialog.value = false;
    fetchBordirSchedules(true);
  } catch (error: unknown) {
    let msg = "Gagal update jadwal bordir";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  }
};

const fetchTopProducts = async (isBackground = false) => {
  if (!isBackground) isLoadingTopProducts.value = true;
  try {
    const response = await api.get("/dashboard/top-products", {
      params: { cabang: authStore.user?.cabang === "KDC" ? topProductsCabang.value : undefined },
    });
    topProducts.value = response.data;
  } catch (error) {
    console.error(error);
  } finally {
    if (!isBackground) isLoadingTopProducts.value = false;
  }
};

const fetchBranchPerformance = async (isBackground = false) => {
  if (!isBackground) isLoadingPerformance.value = true;
  try {
    const response = await api.get("/dashboard/branch-performance");
    branchPerformances.value = response.data;
  } catch (error) {
    console.error(error);
  } finally {
    if (!isBackground) isLoadingPerformance.value = false;
  }
};

const fetchPiutangBreakdown = async () => {
  if (authStore.user?.cabang !== "KDC") {
    isLoadingPiutangBreakdown.value = false;
    return;
  }
  isLoadingPiutangBreakdown.value = true;
  try {
    const response = await api.get("/dashboard/piutang-per-cabang");
    piutangBreakdown.value = response.data;
  } catch (error: unknown) {
    let msg = "Gagal memuat breakdown piutang.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  } finally {
    isLoadingPiutangBreakdown.value = false;
  }
};

const fetchPiutangByInvoice = async () => {
  if (authStore.user?.cabang === "KDC") return;
  isLoadingPiutangInvoice.value = true;
  try {
    const response = await api.get("/dashboard/piutang-per-invoice");
    piutangByInvoice.value = response.data;
  } catch {
    toast.error("Gagal memuat breakdown invoice.");
  } finally {
    isLoadingPiutangInvoice.value = false;
  }
};

const fetchPiutangDetailsForKdc = async (cabangKode: string) => {
  if (selectedCabangPiutang.value === cabangKode) {
    // Jika diklik lagi, tutup detail (kembali ke total raksasa)
    selectedCabangPiutang.value = "";
    return;
  }

  selectedCabangPiutang.value = cabangKode;
  isLoadingPiutangDetails.value = true;

  try {
    const response = await api.get("/dashboard/piutang-per-invoice", {
      params: { cabang: cabangKode },
    });
    piutangInvoiceDetails.value = response.data;
  } catch (error: unknown) {
    console.error(error);
    toast.error("Gagal memuat rincian invoice cabang tersebut.");
  } finally {
    isLoadingPiutangDetails.value = false;
  }
};

const fetchStockBreakdown = async () => {
  isLoadingStockBreakdown.value = true;
  try {
    const response = await api.get<StockCabang[]>("/dashboard/total-stok-per-cabang");
    stockBreakdown.value = response.data.map((r) => ({
      kode_cabang: r.kode_cabang,
      nama_cabang: r.nama_cabang,
      totalStock: Number(r.totalStock || 0),
    }));
  } catch (err) {
    toast.error("Gagal memuat breakdown stok per cabang.");
    console.error(err);
    stockBreakdown.value = [];
  } finally {
    isLoadingStockBreakdown.value = false;
  }
};

const fetchActivePromos = async () => {
  isLoadingPromo.value = true;
  try {
    const response = await api.get("/invoice-form/lookup/active-promos", {
      params: {
        tanggal: format(new Date(), "yyyy-MM-dd"),
        cabang: authStore.user?.cabang,
      },
    });

    const promos = (response.data || []) as ActivePromo[];
    const promoMessages: string[] = [];

    // --- CARI PROMO AKTIF ---
    const promoMei = promos.find((p) => p.pro_nomor === "PRO-2026-004");
    const promoApril = promos.find((p) => p.pro_nomor === "PRO-2026-002");
    const promoMaret = promos.find((p) => p.pro_nomor === "PRO-2026-001");

    // --- 1. PRIORITAS 1: PROMO MEI (PRO-2026-004) ---
    if (promoMei) {
      promoMessages.push(
        `🎉 PROMO MEI : Potongan Rp 12.500 tiap kelipatan belanja Rp 250.000 (S&K Berlaku)!`
      );
    } // --- 1. PRIORITAS 2 : PROMO APRIL (PRO-2026-002) ---
    else if (promoApril) {
      promoMessages.push(
        `🎉 PROMO APRIL : Potongan Rp 12.500 tiap kelipatan belanja Rp 250.000 (S&K Berlaku)!`
      );
    }
    // --- 2. PRIORITAS 2: PROMO MARET (PRO-2026-001) ---
    else if (promoMaret) {
      promoMessages.push(
        `🎉 PROMO MARET : Potongan Rp 20.000 tiap kelipatan belanja Rp 200.000! • Beli Kaos Reguler tembus 600rb GRATIS Sticker DTF A6 (berlaku kelipatan kaos)!`
      );
    }
    // --- 3. FALLBACK: PROMO LAINNYA ---
    else {
      const promoReguler = promos.find(
        (p) => p.pro_judul.toUpperCase().includes("REGULER") || p.pro_totalrp > 0
      );

      if (promoReguler) {
        // Asumsi fungsi formatRupiah sudah ada/diimport
        promoMessages.push(
          `🔥 PROMO AKTIF: Potongan Rp ${formatRupiah(
            promoReguler.pro_disrp
          )} tiap kelipatan Rp ${formatRupiah(promoReguler.pro_totalrp)} (S&K Berlaku).`
        );
      }
    }

    // Pesan default jika tidak ada promo aktif
    if (promoMessages.length === 0) {
      promoMessages.push(
        "Selamat Datang di Kaosan Retail Management System • Cek koleksi terbaru kami sekarang!"
      );
    }

    promoText.value = promoMessages.join(" • ");
  } catch (error) {
    console.error("Gagal memuat promo:", error);
    promoText.value = "Selamat Datang di Kaosan Retail Management System";
  } finally {
    isLoadingPromo.value = false;
  }
};

const fetchItemSalesTrend = async (isBackground = false) => {
  if (authStore.user?.cabang !== "KDC") return;
  if (!isBackground) isLoadingItemTrend.value = true;

  try {
    const response = await api.get("/dashboard/item-sales-trend", {
      params: { cabang: trendCabang.value },
    });
    itemTrendData.value = response.data;
  } catch (error) {
    console.error("Gagal memuat trend barang:", error);
  } finally {
    if (!isBackground) isLoadingItemTrend.value = false;
  }
};

const fetchSalesChartData = async (isBackground = false) => {
  if (!isBackground) isLoadingChart.value = true;
  try {
    const response = await api.get("/dashboard/sales-chart", {
      params: { ...chartFilters, groupBy: chartGroupBy.value },
    });

    const labels = (response.data as SalesChartItem[]).map((d) => {
      const date = new Date(d.tanggal);
      if (chartGroupBy.value === "month") return format(date, "MMM yyyy");
      if (chartGroupBy.value === "week") return `W${format(date, "ww")}`;
      return format(date, "dd/MM");
    });

    const dataValues = (response.data as SalesChartItem[]).map((d) => d.total);

    // Definisikan tipe datasetConfig sebagai Partial karena 'data' belum dimasukkan
    let datasetConfig: Partial<ChartDataset<"bar" | "line">> = {};

    if (chartType.value === "bar") {
      datasetConfig = {
        type: "bar",
        label: "Penjualan (Rp)",
        backgroundColor: "#42A5F5",
        borderRadius: 4,
        barPercentage: 0.6,
      };
    } else {
      // Logic untuk Line dan Area
      datasetConfig = {
        type: "line",
        label: "Penjualan (Rp)",
        borderColor: "#42A5F5",
        backgroundColor: chartType.value === "area" ? "rgba(66, 165, 245, 0.2)" : "transparent",
        borderWidth: 3,
        pointBackgroundColor: "#fff",
        pointBorderColor: "#42A5F5",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: chartType.value === "area",
        tension: 0.4,
      };
    }

    chartData.value = {
      labels: labels,
      // [PERBAIKAN] Gunakan tipe ChartDataset[] alih-alih any
      datasets: [
        {
          data: dataValues,
          ...datasetConfig,
        },
      ] as ChartDataset<"bar" | "line">[],
    };
  } catch (error: unknown) {
    let msg = "Gagal memuat data grafik penjualan.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  } finally {
    if (!isBackground) isLoadingChart.value = false;
  }
};

const fetchParetoHealth = async () => {
  isLoadingPareto.value = true;
  try {
    const gudang = authStore.user?.cabang === "KDC" ? "KDC" : authStore.user?.cabang;
    const response = await api.get("/dashboard/pareto-health", { params: { gudang } });
    paretoStats.value = response.data;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingPareto.value = false;
  }
};

const fetchUserBranchInfo = async () => {
  const kodeCabang = authStore.user?.cabang;
  if (!kodeCabang) return;

  try {
    const response = await api.get(`/dashboard/branch-info/${kodeCabang}`);
    const data = response.data;

    userPlaceId.value = data.gdg_place_id || "";
    userLat.value = data.gdg_lat || ""; // Ambil Lat
    userLong.value = data.gdg_long || ""; // Ambil Long
  } catch (error) {
    console.error("Gagal memuat info cabang:", error);
  }
};

const agendaList = ref<AgendaItem[]>([]);

const checkAgendaReminder = async () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const userKode = authStore.user?.kode || "guest";
  const lastSeen = localStorage.getItem(`agenda_reminder_seen_${userKode}`);

  try {
    // 1. Tarik data agenda untuk disimpan di memory (agar badge kalender bisa berhitung)
    const response = await api.get("/dashboard/agenda");
    agendaList.value = response.data;

    // 2. Cek apakah ada agenda hari ini yang belum selesai
    const todayItems = (response.data as AgendaItem[]).filter(
      (item) => item.dateline === today && !item.is_completed
    );

    // 3. Hanya tampilkan pop-up SATU KALI per hari PER USER
    if (lastSeen !== today && todayItems.length > 0) {
      showAgendaReminder.value = true;
    }
  } catch (e) {
    console.error("Gagal mengecek agenda reminder:", e);
  }
};

const closeAgendaReminder = () => {
  showAgendaReminder.value = false;
  const userKode = authStore.user?.kode || "guest";
  // Simpan status sudah dibaca hari ini dengan menyertakan ID User
  localStorage.setItem(`agenda_reminder_seen_${userKode}`, format(new Date(), "yyyy-MM-dd"));
};

// Tambahkan watcher untuk memastikan variabel ter-update
watch(userPlaceId, () => {});

const googleReviewUrl = computed(() => {
  // Jika placeId belum ada, return string kosong atau URL blank agar tidak error
  if (!userPlaceId.value) return "about:blank";

  return `https://search.google.com/local/reviews?placeid=${userPlaceId.value}`;
});

// Function Fetch
const openParetoDetail = async () => {
  showParetoDetail.value = true;
  paretoDisplayCount.value = 20;

  if (paretoItems.value.length > 0) return; // Cache sederhana

  isLoadingParetoDetail.value = true;
  try {
    const response = await api.get("/dashboard/pareto-details", {
      // [PERBAIKAN] Gunakan ?. dan || ""
      params: { gudang: authStore.user?.cabang === "KDC" ? "KDC" : authStore.user?.cabang || "" },
    });
    paretoItems.value = response.data;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingParetoDetail.value = false;
  }
};

const fetchLowStockSales = async (isBackground = false) => {
  if (authStore.user?.cabang !== "KDC") return;
  if (!isBackground) isLoadingLowStockSales.value = true;
  try {
    const response = await api.get("/dashboard/low-stock-sales", {
      params: { cabang: filterLowStockCabang.value, period: filterLowStockPeriod.value }, // 👈 UBAH DI SINI
    });
    lowStockSalesData.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data penjualan rendah:", error);
  } finally {
    if (!isBackground) isLoadingLowStockSales.value = false;
  }
};

const fetchSeasonalSales = async (isBackground = false) => {
  if (authStore.user?.cabang !== "KDC") return;
  if (!isBackground) isLoadingSeasonalSales.value = true;
  try {
    const response = await api.get("/dashboard/seasonal-sales", {
      params: { cabang: filterSeasonalCabang.value, period: filterSeasonalPeriod.value }, // 👈 UBAH DI SINI
    });
    seasonalSalesData.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data penjualan sesional:", error);
  } finally {
    if (!isBackground) isLoadingSeasonalSales.value = false;
  }
};

const exportLowStockSales = async () => {
  toast.info("Menyiapkan data export...");
  try {
    const response = await api.get("/dashboard/low-stock-sales", {
      params: {
        export: true,
        cabang: filterLowStockCabang.value,
        period: filterLowStockPeriod.value,
      }, // 👈 UBAH DI SINI
    });
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(
      response.data.map((item: LowStockSaleItem) => ({
        Store: item.cabang_nama,
        Kode: item.kode,
        "Nama Barang": item.nama,
        Ukuran: item.ukuran,
        "Total Terjual": item.total_terjual,
      }))
    );
    XLSX.utils.book_append_sheet(workbook, worksheet, "Low Sales");
    XLSX.writeFile(
      workbook,
      `Low_Sales_${filterLowStockCabang.value}_${format(new Date(), "yyyyMMdd")}.xlsx`
    );
    toast.success("Export berhasil!");
  } catch {
    toast.error("Gagal export data");
  }
};

const exportSeasonalSales = async () => {
  toast.info("Menyiapkan data export...");
  try {
    const response = await api.get("/dashboard/seasonal-sales", {
      params: {
        export: true,
        cabang: filterSeasonalCabang.value,
        period: filterSeasonalPeriod.value,
      }, // 👈 UBAH DI SINI
    });
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(
      response.data.map((item: SeasonalSaleItem) => ({
        Store: item.cabang_nama,
        Kode: item.kode,
        "Nama Barang": item.nama,
        Ukuran: item.ukuran,
        "Total Terjual": item.total_terjual,
      }))
    );
    XLSX.utils.book_append_sheet(workbook, worksheet, "Seasonal Sales");
    XLSX.writeFile(
      workbook,
      `Seasonal_Sales_${filterSeasonalCabang.value}_${format(new Date(), "yyyyMMdd")}.xlsx`
    );
    toast.success("Export berhasil!");
  } catch {
    toast.error("Gagal export data");
  }
};

const fetchDeadStockSummary = async () => {
  isLoadingDeadStock.value = true;
  try {
    const res = await api.get("/dashboard/dead-stock-summary", {
      params: { cabang: deadStockCabang.value },
    });
    deadStockSummary.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingDeadStock.value = false;
  }
};

const fetchDeadStockChart = async () => {
  isLoadingDeadStockChart.value = true;
  try {
    const res = await api.get("/dashboard/dead-stock-chart", {
      params: { cabang: deadStockCabang.value },
    });

    deadStockChart.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingDeadStockChart.value = false;
  }
};

const fetchDeadStockSalesPie = async () => {
  isLoadingDeadStockSalesPie.value = true;
  try {
    const res = await api.get("/dashboard/dead-stock-sales-pie", {
      params: { cabang: deadStockCabang.value },
    });
    deadStockSalesPie.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingDeadStockSalesPie.value = false;
  }
};

const openDeadStockDetail = async (tipe: "bergerak" | "stagnan") => {
  deadStockDetailPage.value = 1;
  deadStockDetailTipe.value = tipe;
  showDeadStockDetail.value = true;
  isLoadingDeadStockDetail.value = true;
  deadStockDetailData.value = [];
  try {
    const res = await api.get("/dashboard/dead-stock-sales-detail", {
      params: { cabang: deadStockCabang.value, tipe },
    });
    deadStockDetailData.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingDeadStockDetail.value = false;
  }
};

const filteredDeadStockDetail = computed(() => {
  if (!searchDeadStockDetail.value) return deadStockDetailData.value;
  const q = searchDeadStockDetail.value.toLowerCase();
  return deadStockDetailData.value.filter(
    (r) => r.nama?.toLowerCase().includes(q) || r.kode?.toLowerCase().includes(q)
  );
});

const paginatedDeadStockDetail = computed(() => {
  const start = (deadStockDetailPage.value - 1) * deadStockDetailPerPage.value;
  return filteredDeadStockDetail.value.slice(start, start + deadStockDetailPerPage.value);
});

const deadStockDetailTotalPages = computed(() =>
  Math.ceil(filteredDeadStockDetail.value.length / deadStockDetailPerPage.value)
);

// Reset page saat search berubah
watch(searchDeadStockDetail, () => {
  deadStockDetailPage.value = 1;
});

watch(deadStockCabang, () => {
  fetchDeadStockSummary();
  fetchDeadStockChart();
  fetchDeadStockSalesPie();
});

const fetchSpkPendingApproval = async (isBackground = false) => {
  if (!isBackground) isLoadingSpkPending.value = true;
  try {
    const res = await api.get("/dashboard/spk-pending-approval", {
      params: spkPendingFilter,
    });
    spkPendingList.value = res.data;
  } catch (e) {
    console.error("Gagal load SPK pending approval", e);
  } finally {
    if (!isBackground) isLoadingSpkPending.value = false;
  }
};

// Watcher filter
watch(
  () => spkPendingFilter,
  () => {
    fetchSpkPendingApproval();
  },
  { deep: true }
);

// --- FETCH AUTO MINTA ANALYTICS ---
const fetchAutoMintaAnalytics = async (isBackground = false) => {
  if (!isBackground) isLoadingAutoMinta.value = true;
  try {
    const res = await api.get("/dashboard/auto-minta-analytics", {
      params: autoMintaFilter,
    });
    autoMintaData.value = res.data;
  } catch (error) {
    console.error("Gagal load Auto Minta Analytics", error);
  } finally {
    if (!isBackground) isLoadingAutoMinta.value = false;
  }
};

watch(
  () => autoMintaFilter,
  () => {
    fetchAutoMintaAnalytics();
  },
  { deep: true }
);

// --- COMPUTED AUTO MINTA ---
const autoMintaAvgPacking = computed(() => {
  if (autoMintaData.value.length === 0) return 0;
  const total = autoMintaData.value.reduce((acc, curr) => acc + curr.ratio_packing, 0);
  return (total / autoMintaData.value.length).toFixed(1);
});

const autoMintaAvgSj = computed(() => {
  if (autoMintaData.value.length === 0) return 0;
  const total = autoMintaData.value.reduce((acc, curr) => acc + curr.ratio_sj, 0);
  return (total / autoMintaData.value.length).toFixed(1);
});

const autoMintaChartData = computed(() => {
  return {
    labels: autoMintaData.value.map((r) => r.kode_cabang), // <-- Label berubah ke kode cabang
    datasets: [
      {
        type: "line" as const,
        label: "Packing DC (%)",
        data: autoMintaData.value.map((r) => r.ratio_packing),
        borderColor: "#2196F3",
        backgroundColor: "rgba(33, 150, 243, 0.1)",
        borderWidth: 2,
        tension: 0.3,
        fill: true,
      },
      {
        type: "line" as const,
        label: "Terkirim SJ (%)",
        data: autoMintaData.value.map((r) => r.ratio_sj),
        borderColor: "#4CAF50",
        backgroundColor: "rgba(76, 175, 80, 0)",
        borderWidth: 2,
        tension: 0.3,
        fill: false,
      },
    ],
  };
});

const autoMintaChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: { min: 0, max: 100 },
  },
  plugins: {
    datalabels: { display: false },
  },
};

const getRatioColor = (ratio: number) => {
  if (ratio < 70) return "error";
  if (ratio < 90) return "warning";
  return "success";
};

// Computed property untuk menentukan warna & pesan status
const healthStatus = computed(() => {
  const score = Number(paretoStats.value.score);

  if (score < 100) {
    return {
      color: "error", // MERAH
      icon: "mdi-alert-octagon",
      text: "KRITIS (Kurang)",
      desc: "Stok tidak cukup untuk memenuhi target buffer toko.",
    };
  } else if (score >= 200) {
    return {
      color: "success", // HIJAU
      icon: "mdi-check-decagram",
      text: "AMAN (Surplus)",
      desc: "Stok melimpah, siap supply dalam jumlah besar.",
    };
  } else {
    // Range 100 - 199
    return {
      color: "warning", // KUNING
      icon: "mdi-alert",
      text: "STANDAR (Cukup)",
      desc: "Stok pas-pasan sesuai target minimal.",
    };
  }
});

const getMenuColor = (iconName: string, index: number) => {
  if (iconName.includes("cash") || iconName.includes("receipt")) return "primary";
  if (iconName.includes("database") || iconName.includes("plus")) return "success";
  if (iconName.includes("chart") || iconName.includes("finance")) return "info";
  if (iconName.includes("account") || iconName.includes("clock")) return "orange";
  if (iconName.includes("warehouse") || iconName.includes("package")) return "purple";
  if (iconName.includes("printer") || iconName.includes("print")) return "deep-orange";
  if (iconName.includes("target")) return "red";
  const colors = ["teal", "indigo", "cyan", "brown", "blue-grey"];
  return colors[index % colors.length];
};

// Menentukan ikon berdasarkan perbandingan rata-rata bulan ini vs bulan lalu
const getTrendIcon = (item: ItemTrend): string => {
  if (item.avg_now > item.avg_min_1) return "mdi-trending-up";
  if (item.avg_now < item.avg_min_1) return "mdi-trending-down";
  return "mdi-minus";
};

// Menentukan warna ikon (Hijau untuk naik, Merah untuk turun)
const getTrendColor = (item: ItemTrend): string => {
  if (item.avg_now > item.avg_min_1) return "success";
  if (item.avg_now < item.avg_min_1) return "error";
  return "grey";
};

const getAchColor = (ach: number) => {
  if (ach >= 100) return "success";
  if (ach >= 80) return "warning";
  return "error";
};

const fetchFrequentMenus = async () => {
  if (isWarehouseUser.value) {
    frequentMenus.value = [
      {
        title: "Packing List",
        icon: "mdi-format-list-checks", // Icon checklist
        to: "/gudang-dc/operasional/packing-list",
        color: "indigo",
      },
      {
        title: "Terima STBJ",
        icon: "mdi-package-variant-closed-plus", // Icon tambah stok/terima barang
        to: "/gudang-dc/operasional/terima-stbj",
        color: "teal",
      },
      {
        title: "Surat Jalan Store",
        icon: "mdi-truck-delivery-outline", // Icon pengiriman
        to: "/gudang-dc/operasional/surat-jalan-store",
        color: "blue",
      },
      {
        title: "Ambil Barang",
        icon: "mdi-dolly", // Icon alat angkut barang
        to: "/gudang-dc/operasional/ambil-barang",
        color: "orange",
      },
      {
        title: "Terima Retur",
        icon: "mdi-keyboard-return", // Icon panah kembali/retur
        to: "/gudang-dc/operasional/terima-rb",
        color: "deep-orange",
      },
    ];
    isLoadingFrequent.value = false;
    return;
  }
  isLoadingFrequent.value = true;
  try {
    const response = await api.get("/activity/frequent-menus");
    if (response.data && response.data.length > 0) {
      frequentMenus.value = response.data.map(
        (menu: { icon?: string; title: string; to: string }, index: number) => ({
          ...menu,
          color: getMenuColor(menu.icon || "", index),
        })
      );
    } else {
      frequentMenus.value = [
        {
          title: "Invoice",
          icon: "mdi-receipt-text",
          to: "/transaksi/penjualan/invoice",
          color: "primary",
        },
        {
          title: "Surat Pesanan",
          icon: "mdi-file-document-edit",
          to: "/transaksi/penjualan/surat-pesanan",
          color: "success",
        },
        {
          title: "SO DTF",
          icon: "mdi-printer-3d-nozzle",
          to: "/transaksi/penjualan/dtf/so-dtf",
          color: "deep-orange",
        },
        {
          title: "Cek Stok",
          icon: "mdi-package-variant",
          to: "/laporan/stok/real-time",
          color: "purple",
        },
        {
          title: "Monitoring Target",
          icon: "mdi-target",
          to: "/laporan/penjualan/monitoring-achievement",
          color: "red",
        },
      ];
    }
  } catch (error) {
    console.error("Gagal memuat menu sering diakses", error);
    frequentMenus.value = [
      {
        title: "Invoice",
        icon: "mdi-receipt-text",
        to: "/transaksi/penjualan/invoice",
        color: "primary",
      },
      {
        title: "Surat Pesanan",
        icon: "mdi-file-document-edit",
        to: "/transaksi/penjualan/surat-pesanan",
        color: "success",
      },
      {
        title: "SO DTF",
        icon: "mdi-printer-3d-nozzle",
        to: "/transaksi/penjualan/dtf/so-dtf",
        color: "deep-orange",
      },
    ];
  } finally {
    isLoadingFrequent.value = false;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "Antri":
      return "orange";
    case "Packing":
      return "indigo";
    case "Kirim":
      return "blue";
    case "Selesai":
      return "success";
    default:
      return "grey";
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Antri":
      return "mdi-clock-outline";
    case "Packing":
      return "mdi-package-variant-closed";
    case "Kirim":
      return "mdi-truck-delivery";
    case "Selesai":
      return "mdi-check-circle";
    default:
      return "mdi-help";
  }
};

const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useSwipeNavigate({
  onSwipeLeft: () => router.push({ name: "WorkSummary" }),
});

// --- WATCHERS ---
watch(stokKosongCabang, () => {
  fetchStokKosong();
});

watch(searchStokKosong, () => {
  if (searchStokKosong.value.length < 3) return;
  clearTimeout(searchStokKosongTimeout);
  searchStokKosongTimeout = setTimeout(() => {
    fetchStokKosong();
  }, 500);
});

watch(searchFastMoving, () => {
  if (searchFastMoving.value.length > 0 && searchFastMoving.value.length < 3) return;
  clearTimeout(searchFastMovingTimeout);
  searchFastMovingTimeout = setTimeout(() => {
    fetchStokKosongFastMoving();
  }, 500);
});

watch(
  [chartFilters, chartType, chartGroupBy],
  () => {
    fetchSalesChartData(false);
  },
  { deep: true }
);

watch(topProductsCabang, () => {
  fetchTopProducts();
});

watch(cashflowDate, () => {
  fetchCashflowSummary();
});

// --- STATE LOST ORDER ---
const showLostOrder = ref(false);
const isSavingLostOrder = ref(false);

const lostOrderForm = reactive({
  customerNama: "",
  customerTelp: "",
  produkNama: "",
  ukuran: "",
  qty: 1,
  alasan: "",
  catatan: "",
});

const alasanList = [
  { id: "Stok Kosong", icon: "mdi-package-variant-remove", color: "orange-darken-2" },
  { id: "Harga Mahal", icon: "mdi-currency-usd", color: "green-darken-1" },
  { id: "Masih Cari-cari", icon: "mdi-magnify", color: "light-blue-darken-1" },
  { id: "Masih Pikir-pikir", icon: "mdi-comment-processing-outline", color: "grey-darken-2" },
  { id: "Tidak Cocok", icon: "mdi-cancel", color: "red-darken-1" },
  { id: "Tidak Ada Budget", icon: "mdi-credit-card-off-outline", color: "cyan-darken-2" },
  { id: "Beli di Tempat Lain", icon: "mdi-shopping", color: "blue-darken-1" },
  { id: "Salah Toko", icon: "mdi-map-marker-question-outline", color: "pink-darken-1" },
  { id: "Tunggu Terlalu Lama", icon: "mdi-clock-outline", color: "orange-darken-1" },
  { id: "Lainnya", icon: "mdi-help-circle-outline", color: "orange-darken-2" },
];

const openLostOrder = () => {
  showLostOrder.value = true;
  // Reset Form
  Object.assign(lostOrderForm, {
    customerNama: "",
    customerTelp: "",
    produkNama: "",
    ukuran: "",
    qty: 1,
    alasan: "",
    catatan: "",
  });
};

const saveLostOrder = async () => {
  if (!lostOrderForm.produkNama.trim()) return toast.error("Nama Produk / Model wajib diisi.");
  if (!lostOrderForm.ukuran.trim()) return toast.error("Ukuran wajib diisi.");
  if (!lostOrderForm.qty || lostOrderForm.qty <= 0) return toast.error("QTY harus lebih dari 0.");
  if (!lostOrderForm.alasan) return toast.error("Pilih salah satu Alasan Lost.");

  isSavingLostOrder.value = true;
  try {
    // Sesuaikan prefix URL dengan route backend Anda
    await api.post("/lost-order", lostOrderForm);
    toast.success("Data Lost Order berhasil dicatat.");
    showLostOrder.value = false;
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal menyimpan data Lost Order.");
  } finally {
    isSavingLostOrder.value = false;
  }
};

// --- POLLING & MOUNT ---
let pollingInterval: number;

const startPolling = () => {
  pollingInterval = window.setInterval(() => {
    // [BARU] Skip polling total kalau tab browser nggak aktif — banyak
    // user buka dashboard lalu pindah kerja ke tab lain, tab dashboard
    // tetap polling terus tanpa mereka sadar. Ini biasa jadi kontributor
    // besar ke beban server yang nggak kelihatan langsung.
    if (document.hidden) return;

    // A. Polling Global Data (Update angka-angka di atas)
    fetchTotalStock(true);
    // fetchParetoHealth();

    // if (authStore.user?.cabang === "KDC") {
    //   fetchStockBreakdown();
    // }

    if (!isWarehouseUser.value) {
      fetchTodayStats(true);
      fetchTotalPiutang(true);
    }

    // B. Polling HANYA untuk Konten Tab yang sedang aktif dibuka user
    loadTabData(activeTab.value, true);
  }, 30000);
};

// --- LAZY LOADING TAB STATE ---
const isTabLoaded = reactive({
  beranda: false,
  penjualan: false,
  stok: false,
  operasional: false,
  keuangan: false,
});

// Fungsi untuk menarik data hanya sesuai tab yang sedang terbuka
const loadTabData = (tabName: string, isBackground = false) => {
  // Jika tab sudah pernah dimuat dan ini bukan proses polling background, abaikan (mencegah double fetch)
  if (isTabLoaded[tabName as keyof typeof isTabLoaded] && !isBackground) return;

  if (tabName === "beranda") {
    fetchFrequentMenus();
    fetchPendingActions(isBackground);
    fetchShipmentSchedules(isBackground);
    fetchMasterJadwalRutin();
    if (!isBackground) checkAgendaReminder();
  } else if (tabName === "penjualan" && !isWarehouseUser.value) {
    fetchSalesChartData(isBackground);
    fetchSalesTargetSummary(isBackground);
    fetchTopProducts(isBackground);
    fetchRecentTransactions(isBackground);

    if (authStore.user?.cabang === "KDC") {
      fetchBranchPerformance(isBackground);
      if (!isBackground) fetchItemSalesTrend();
    }

    // ✅ PENCEGAHAN POLLING UNTUK DATA KALKULASI BERAT
    if (!isBackground) {
      fetchDeadStockSummary();
      fetchDeadStockChart();
      fetchDeadStockSalesPie();
    }
  } else if (tabName === "stok") {
    fetchLowStockData(isBackground);
    fetchStagnantStockSummary(isBackground);
    if (!isBackground) fetchStokKosong(false);
    if (!isBackground) fetchStokKosongFastMoving(); // ← TAMBAH
  } else if (tabName === "operasional") {
    fetchShipmentSchedules(isBackground);
    fetchMasterJadwalRutin();
    fetchAutoMintaAnalytics(isBackground);
    fetchBordirSchedules(isBackground);
    if (authStore.user?.cabang === "KDC") {
      fetchSpkPendingApproval(isBackground);
    }
  } else if (tabName === "keuangan" && !isWarehouseUser.value) {
    fetchCashflowSummary(isBackground);
  }

  // Tandai bahwa tab ini sudah di-load datanya
  isTabLoaded[tabName as keyof typeof isTabLoaded] = true;
};

// Pantau perubahan Tab, jika user klik tab baru -> Load datanya!
watch(activeTab, (newTab) => {
  loadTabData(newTab);
});

onMounted(() => {
  if (authStore.isAuthenticated) {
    // 1. DATA GLOBAL (Dipanggil di awal karena Card-nya selalu tampil di atas)
    fetchActivePromos();
    fetchCabangOptions();
    fetchUserBranchInfo();
    fetchTotalStock();
    fetchParetoHealth();

    if (authStore.user?.cabang === "KDC") {
      fetchStockBreakdown();
    }

    if (!isWarehouseUser.value) {
      fetchTodayStats();
      fetchTotalPiutang();
      fetchPiutangBreakdown();
      fetchPiutangByInvoice();
    }

    // 2. DATA TAB AKTIF (Hanya menarik data milik tab "Beranda")
    loadTabData(activeTab.value);

    // 3. JALANKAN POLLING BACKGROUND
    startPolling();
  }

  intervalId = window.setInterval(() => {
    currentTime.value = new Date().toLocaleString("id-ID", {
      dateStyle: "long",
      timeStyle: "medium",
    });
  }, 1000);
});

onUnmounted(() => {
  clearInterval(intervalId);
  clearInterval(pollingInterval);
});
</script>

<template>
  <div>
    <!-- ============================================================
       LANDING PAGE — untuk user yang belum login
       ============================================================ -->
    <v-container v-if="!authStore.isAuthenticated" class="landing-container pa-0 fill-height" fluid>
      <div class="bg-overlay"></div>
      <v-img :src="storeBg" cover class="bg-image" position="center center" />
      <v-row align="center" justify="center" class="fill-height content-layer ma-0">
        <v-col cols="12" md="10" lg="8" class="text-center">
          <div class="hero-glass-card pa-8 pa-md-12 mb-8">
            <v-avatar size="110" class="mb-6 elevation-12 logo-glow">
              <v-img :src="logoUrl" alt="Kaosan Logo" />
            </v-avatar>
            <h1 class="text-h3 font-weight-black text-white mb-2 tracking-wide text-shadow">
              KAOSAN
            </h1>
            <div
              class="text-h6 text-uppercase text-white font-weight-light mb-6 tracking-widest text-shadow"
            >
              Retail Management System
            </div>
            <v-btn
              color="white"
              size="x-large"
              rounded="pill"
              @click="goToLogin"
              prepend-icon="mdi-login-variant"
              class="px-10 text-primary font-weight-bold btn-glow"
              height="56"
            >
              Masuk ke Dashboard
            </v-btn>
          </div>
        </v-col>
        <v-col cols="12" md="12" lg="10">
          <v-row>
            <v-col cols="12" sm="6" md="3">
              <div class="feature-glass-card pa-6 text-center text-white h-100">
                <v-icon size="40" class="mb-3">mdi-monitor-dashboard</v-icon>
                <h3 class="text-h6 font-weight-bold mb-2">POS & Penjualan</h3>
                <p class="text-body-2 opacity-80">
                  Aplikasi kasir lengkap untuk mencatat penjualan tunai/kredit, cetak struk, dan
                  kelola pelanggan.
                </p>
              </div>
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <div class="feature-glass-card pa-6 text-center text-white h-100">
                <v-icon size="40" class="mb-3">mdi-package-variant-closed</v-icon>
                <h3 class="text-h6 font-weight-bold mb-2">Manajemen Stok</h3>
                <p class="text-body-2 opacity-80">
                  Pantau stok real-time antar cabang, stok opname mudah, dan peringatan dini barang
                  menipis.
                </p>
              </div>
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <div class="feature-glass-card pa-6 text-center text-white h-100">
                <v-icon size="40" class="mb-3">mdi-chart-timeline-variant</v-icon>
                <h3 class="text-h6 font-weight-bold mb-2">Laporan Lengkap</h3>
                <p class="text-body-2 opacity-80">
                  Analisa omset, laba rugi, dan trend penjualan harian hingga bulanan secara instan.
                </p>
              </div>
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <div class="feature-glass-card pa-6 text-center text-white h-100">
                <v-icon size="40" class="mb-3">mdi-store-cog</v-icon>
                <h3 class="text-h6 font-weight-bold mb-2">Multi Cabang</h3>
                <p class="text-body-2 opacity-80">
                  Kelola operasional pusat (KDC) dan seluruh cabang retail dalam satu platform
                  terintegrasi.
                </p>
              </div>
            </v-col>
          </v-row>
        </v-col>
      </v-row>
    </v-container>

    <!-- ============================================================
       DASHBOARD — untuk user yang sudah login
       ============================================================ -->
    <v-container v-else class="home-container bg-background pa-0" fluid>
      <!-- HEADER BANNER -->
      <div class="dashboard-header">
        <v-img :src="bannerImage" cover class="header-bg">
          <div class="header-overlay"></div>
        </v-img>
        <div class="header-content pt-6 px-6 pb-12">
          <div class="welcome-text text-white mt-4">
            <div class="d-flex align-center justify-space-between mb-2">
              <!-- Kiri: logo + teks -->
              <div class="d-flex align-center">
                <v-avatar size="64" color="white" class="mr-4 elevation-4 pa-1">
                  <v-img :src="logoUrl" alt="Kaosan Logo" />
                </v-avatar>
                <div>
                  <h1 class="text-h3 font-weight-bold text-white text-shadow mb-1">
                    Selamat Datang di Kaosan
                  </h1>
                  <p class="text-subtitle-1 text-white opacity-90 mb-0 font-weight-light">
                    Retail Management System • {{ currentTime }}
                  </p>
                </div>
              </div>

              <!-- Kanan: WRAPPER UTAMA TOMBOL (Atas - Bawah) -->
              <div class="d-flex flex-column align-end" style="gap: 10px">
                <!-- Baris Atas: Tombol Panduan & Traffic -->
                <div class="d-flex ga-3">
                  <v-btn
                    v-if="authStore.user?.cabang === 'KDC'"
                    color="white"
                    variant="flat"
                    prepend-icon="mdi-google-analytics"
                    class="text-blue-darken-3 font-weight-bold px-5"
                    size="large"
                    elevation="4"
                    rounded="lg"
                    @click="showTrackingAnalytics = true"
                  >
                    Traffic Tracking
                  </v-btn>

                  <v-btn
                    color="white"
                    variant="flat"
                    prepend-icon="mdi-book-open-variant"
                    class="text-indigo-darken-3 font-weight-bold px-5"
                    size="large"
                    elevation="4"
                    rounded="lg"
                    @click="showJuknis = true"
                  >
                    Panduan Alur Penjualan
                  </v-btn>
                </div>

                <!-- Baris Bawah: Tombol Stok Real -->
                <div class="d-flex" style="position: relative; width: 100%">
                  <v-btn
                    block
                    color="blue-darken-3"
                    variant="flat"
                    elevation="4"
                    rounded="lg"
                    prepend-icon="mdi-package-variant-closed"
                    class="font-weight-bold text-none"
                    @click="isRealStockOpen = true"
                  >
                    Lihat Stok Real Toko (Sisa Kuota)
                    <v-badge
                      v-if="overbookedCount > 0"
                      :content="overbookedCount"
                      color="error"
                      inline
                      class="ml-2"
                    />
                  </v-btn>
                </div>
              </div>
              <!-- /Akhir Kanan -->
            </div>
          </div>
        </div>
      </div>

      <!-- DASHBOARD CONTENT -->
      <div
        class="dashboard-content px-4 px-md-6 mt-n8 position-relative"
        style="z-index: 2"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
      >
        <div class="deep-sky-gradient elevation-3 mb-6">
          <!-- PROMO TICKER -->
          <v-row v-if="promoText" class="mb-4">
            <v-col cols="12" class="pa-0">
              <div class="promo-ticker-container elevation-4 bg-surface text-high-emphasis">
                <div class="ticker-label">
                  <v-icon icon="mdi-bullhorn" size="18" class="mr-2 swing-animation" />
                  <span
                    class="font-weight-bold text-uppercase"
                    style="font-size: 0.75rem; letter-spacing: 1px"
                    >Info Promo</span
                  >
                </div>
                <div class="ticker-track-wrapper bg-surface-variant">
                  <div class="ticker-track">
                    <span class="ticker-content">{{ promoText }}</span>
                    <span class="ticker-content">{{ promoText }}</span>
                  </div>
                </div>
              </div>
            </v-col>
          </v-row>

          <!-- ── STAT CARDS (selalu tampil di semua tab) ── -->
          <v-row dense align="stretch" class="mb-5">
            <!-- Penjualan Hari Ini -->
            <v-col v-if="!isWarehouseUser" cols="12" sm="6" md="2">
              <v-menu
                v-if="authStore.user?.cabang === 'KDC'"
                open-on-hover
                location="bottom center"
                transition="scale-transition"
                :close-on-content-click="false"
              >
                <template v-slot:activator="{ props }">
                  <v-card
                    v-bind="props"
                    class="stat-card fill-height py-1 cursor-pointer"
                    color="green-lighten-5"
                    variant="flat"
                  >
                    <v-card-text
                      class="text-center pa-2 d-flex flex-column justify-center position-relative"
                    >
                      <div
                        v-if="trendIndicators.sales === 'up'"
                        class="trend-badge up"
                        style="top: 4px; right: 4px"
                      >
                        <v-icon size="x-small">mdi-arrow-up</v-icon>
                      </div>
                      <v-icon color="green" size="24" class="mb-1">mdi-cash-multiple</v-icon>
                      <div class="text-h6 font-weight-bold text-green-darken-2">
                        <span v-if="isLoadingStats && animatedSales === 0">...</span>
                        <span v-else>{{ formatRupiah(Number(animatedSales.toFixed(0))) }}</span>
                      </div>
                      <v-chip
                        v-if="!isLoadingStats"
                        size="x-small"
                        color="green"
                        variant="flat"
                        class="font-weight-bold mt-1 align-self-center"
                        >{{ Math.round(animatedQty) }} pcs</v-chip
                      >
                      <div class="text-caption text-grey-darken-1 mt-1">Penjualan Hari Ini</div>
                      <v-icon size="x-small" color="grey" class="mt-1">mdi-chevron-down</v-icon>
                    </v-card-text>
                  </v-card>
                </template>
                <v-card max-width="350" elevation="4">
                  <v-list-item class="bg-green-lighten-4 text-green-darken-4 density-compact">
                    <v-list-item-title class="font-weight-bold text-caption"
                      >Ranking Omset Cabang</v-list-item-title
                    >
                  </v-list-item>
                  <v-divider />
                  <v-card-text class="pa-0" style="max-height: 300px; overflow-y: auto">
                    <div v-if="isLoadingStats" class="text-center pa-4">
                      <v-progress-circular indeterminate size="20" color="green" />
                    </div>
                    <v-list v-else density="compact" class="py-0">
                      <template v-if="stats.salesBreakdown && stats.salesBreakdown.length > 0">
                        <v-list-item
                          v-for="(item, index) in stats.salesBreakdown"
                          :key="index"
                          density="compact"
                          class="py-2"
                        >
                          <v-list-item-title class="text-caption d-flex align-center mb-1">
                            <v-chip
                              size="x-small"
                              color="grey-lighten-2"
                              class="mr-2 font-weight-bold text-grey-darken-2"
                              variant="flat"
                              >#{{ index + 1 }}</v-chip
                            >
                            <span class="font-weight-bold">{{ item.nama }}</span>
                          </v-list-item-title>
                          <v-list-item-subtitle class="pl-8">
                            <span
                              class="text-caption font-weight-black text-green-darken-3"
                              style="font-size: 0.85rem !important"
                              >{{ formatRupiah(item.omset) }}</span
                            >
                          </v-list-item-subtitle>
                        </v-list-item>
                      </template>
                      <div v-else class="text-center text-caption py-4 text-grey">
                        Belum ada data penjualan.
                      </div>
                    </v-list>
                  </v-card-text>
                </v-card>
              </v-menu>

              <v-card
                v-else
                class="stat-card fill-height py-1"
                color="green-lighten-5"
                variant="flat"
              >
                <v-card-text
                  class="text-center pa-2 d-flex flex-column justify-center position-relative"
                >
                  <div
                    v-if="trendIndicators.sales === 'up'"
                    class="trend-badge up"
                    style="top: 4px; right: 4px"
                  >
                    <v-icon size="x-small">mdi-arrow-up</v-icon>
                  </div>
                  <v-icon color="green" size="24" class="mb-1">mdi-cash-multiple</v-icon>
                  <div class="text-h6 font-weight-bold text-green-darken-2">
                    <span v-if="isLoadingStats && animatedSales === 0">...</span>
                    <span v-else>{{ formatRupiah(Number(animatedSales.toFixed(0))) }}</span>
                  </div>
                  <v-chip
                    v-if="!isLoadingStats"
                    size="x-small"
                    color="green"
                    variant="flat"
                    class="font-weight-bold mt-1 align-self-center"
                    >{{ Math.round(animatedQty) }} pcs</v-chip
                  >
                  <div class="text-caption text-grey-darken-1 mt-1">Penjualan Hari Ini</div>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Transaksi Hari Ini -->
            <v-col v-if="!isWarehouseUser" cols="12" sm="3" md="1">
              <v-card class="stat-card fill-height py-1" color="blue-lighten-5" variant="flat">
                <v-card-text
                  class="text-center pa-2 d-flex flex-column justify-center align-center h-100"
                >
                  <v-icon color="blue" size="24">mdi-receipt</v-icon>
                  <div class="text-h5 font-weight-bold text-blue-darken-2 my-1">
                    <span v-if="isLoadingStats">...</span>
                    <span v-else>{{ Math.round(animatedTx) }}</span>
                  </div>
                  <div class="text-caption text-grey-darken-1" style="line-height: 1.1">
                    Trx Hari Ini
                  </div>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Kesiapan Pareto -->
            <v-col cols="12" sm="6" md="3">
              <v-card
                class="stat-card fill-height cursor-pointer"
                :color="healthStatus.color"
                variant="tonal"
                @click="openParetoDetail"
              >
                <v-tooltip activator="parent" location="top"
                  >Klik untuk lihat detail barang</v-tooltip
                >
                <v-card-text class="text-center pa-2 d-flex flex-column justify-center">
                  <div class="d-flex align-center justify-center mb-1">
                    <v-icon size="18" class="mr-1">{{ healthStatus.icon }}</v-icon>
                    <span class="text-caption font-weight-bold opacity-80">{{
                      authStore.user?.cabang === "KDC"
                        ? "KESIAPAN SUPPLY PARETO (DC)"
                        : "KESIAPAN STOK PARETO"
                    }}</span>
                  </div>
                  <div class="text-h4 font-weight-black my-0">
                    <span v-if="isLoadingPareto">...</span>
                    <span v-else>{{ paretoStats.score }}%</span>
                  </div>
                  <div class="text-caption font-weight-bold opacity-80 mb-1">
                    {{ healthStatus.text }}
                  </div>
                  <div
                    v-if="authStore.user?.cabang !== 'KDC'"
                    class="d-flex justify-space-between px-2 text-caption opacity-70 w-100"
                  >
                    <span
                      >Laku: <strong>{{ paretoStats.sku_count }}</strong></span
                    >
                    <span
                      >Target:
                      <strong>{{ paretoStats.buffer_stock.toLocaleString() }}</strong></span
                    >
                  </div>
                  <div
                    v-else
                    class="text-caption opacity-70 px-2"
                    style="font-size: 0.7rem; line-height: 1.1"
                  >
                    Kemampuan supply ke {{ paretoStats.store_count || 11 }} cabang.
                  </div>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Total Stok -->
            <v-col cols="12" sm="4" md="3">
              <v-menu
                v-if="authStore.user?.cabang === 'KDC'"
                open-on-hover
                location="bottom center"
                transition="scale-transition"
              >
                <template v-slot:activator="{ props }">
                  <v-card
                    v-bind="props"
                    class="stat-card fill-height py-1 cursor-pointer"
                    color="light-blue-lighten-5"
                    variant="flat"
                  >
                    <v-card-text class="text-center pa-2">
                      <v-icon color="light-blue" size="24" class="mb-1">mdi-warehouse</v-icon>
                      <div class="text-h6 font-weight-bold text-light-blue-darken-2">
                        <span v-if="isLoadingStock && animatedTotalStock === 0">...</span>
                        <span v-else>{{
                          Math.round(animatedTotalStock).toLocaleString("id-ID")
                        }}</span>
                      </div>
                      <div class="text-caption text-grey-darken-1">Total Stok (Semua Cabang)</div>
                      <v-icon size="x-small" color="grey" class="mt-1">mdi-chevron-down</v-icon>
                    </v-card-text>
                  </v-card>
                </template>
                <v-card max-width="320" elevation="4">
                  <v-list-item
                    class="bg-light-blue-lighten-4 text-light-blue-darken-4 density-compact"
                  >
                    <v-list-item-title class="font-weight-bold text-caption"
                      >Stok per Cabang</v-list-item-title
                    >
                  </v-list-item>
                  <v-divider />
                  <v-card-text class="pa-0" style="max-height: 300px; overflow-y: auto">
                    <div v-if="isLoadingStockBreakdown" class="text-center pa-2">
                      <v-progress-circular indeterminate size="20" />
                    </div>
                    <v-list v-else density="compact" class="py-0">
                      <v-list-item
                        v-for="item in stockBreakdown"
                        :key="item.kode_cabang"
                        density="compact"
                      >
                        <v-list-item-title class="text-caption">{{
                          item.nama_cabang || item.kode_cabang
                        }}</v-list-item-title>
                        <template #append
                          ><span class="text-caption font-weight-bold">{{
                            item.totalStock.toLocaleString("id-ID")
                          }}</span></template
                        >
                      </v-list-item>
                    </v-list>
                  </v-card-text>
                </v-card>
              </v-menu>

              <v-card
                v-else
                class="stat-card fill-height py-1"
                color="light-blue-lighten-5"
                variant="flat"
              >
                <v-card-text class="text-center pa-2">
                  <v-icon color="light-blue" size="24" class="mb-1"
                    >mdi-package-variant-closed</v-icon
                  >
                  <div class="text-h6 font-weight-bold text-light-blue-darken-2">
                    <span v-if="isLoadingStock && animatedTotalStock === 0">...</span>
                    <span v-else>{{ Math.round(animatedTotalStock).toLocaleString("id-ID") }}</span>
                  </div>
                  <div class="text-caption text-grey-darken-1">Stok Rak (Ready)</div>

                  <div
                    class="text-caption text-indigo-darken-1 font-weight-bold"
                    style="font-size: 0.65rem !important"
                  >
                    Booking: {{ Math.round(animatedReservedStock).toLocaleString("id-ID") }} pcs
                  </div>

                  <div
                    v-if="!isLoadingStats && !isLoadingStock"
                    class="d-flex justify-center ga-2 mt-1 pt-1 border-t w-100"
                  >
                    <span class="text-caption text-success font-weight-bold">
                      <v-icon size="x-small" start>mdi-arrow-up</v-icon>{{ stats.todayStokIn }}
                    </span>
                    <span class="text-caption text-error font-weight-bold">
                      <v-icon size="x-small" start>mdi-arrow-down</v-icon>{{ stats.todayStokOut }}
                    </span>
                  </div>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Sisa Piutang -->
            <v-col v-if="!isWarehouseUser" cols="12" sm="4" md="3">
              <v-menu
                open-on-hover
                location="bottom center"
                transition="scale-transition"
                :close-on-content-click="false"
              >
                <template v-slot:activator="{ props }">
                  <v-card
                    v-bind="props"
                    class="stat-card fill-height py-1 cursor-pointer"
                    color="orange-lighten-5"
                    variant="flat"
                  >
                    <v-card-text class="text-center pa-2">
                      <v-icon color="orange-darken-1" size="24" class="mb-1"
                        >mdi-clock-alert-outline</v-icon
                      >
                      <div class="text-h6 font-weight-bold text-orange-darken-2 text-truncate">
                        <span v-if="isLoadingPiutang">...</span>
                        <span v-else>{{ formatRupiah(Number(animatedPiutang.toFixed(0))) }}</span>
                      </div>
                      <div class="text-caption text-grey-darken-1">Sisa Piutang</div>
                    </v-card-text>
                  </v-card>
                </template>
                <v-card max-width="320" elevation="4">
                  <v-list-item class="bg-orange-lighten-4 text-orange-darken-4 density-compact">
                    <v-list-item-title class="font-weight-bold text-caption">{{
                      authStore.user?.cabang === "KDC"
                        ? "Piutang per Cabang"
                        : "Top Invoice Belum Lunas"
                    }}</v-list-item-title>
                  </v-list-item>
                  <v-divider />
                  <v-card-text class="pa-0" style="max-height: 300px; overflow-y: auto">
                    <div v-if="isLoadingPiutangBreakdown" class="text-center pa-2">
                      <v-progress-circular indeterminate size="20" />
                    </div>
                    <v-list
                      v-else-if="authStore.user?.cabang === 'KDC'"
                      density="compact"
                      class="py-0"
                    >
                      <v-list-item
                        v-for="item in piutangBreakdown"
                        :key="item.cabang_kode"
                        density="compact"
                      >
                        <v-list-item-title class="text-caption">{{
                          item.cabang_nama
                        }}</v-list-item-title>
                        <template #append
                          ><span class="text-caption font-weight-bold">{{
                            formatRupiah(item.sisa_piutang)
                          }}</span></template
                        >
                      </v-list-item>
                    </v-list>
                    <v-list v-else density="compact" class="py-0">
                      <v-list-item
                        v-for="inv in piutangInvoiceDetails"
                        :key="inv.invoice"
                        class="px-4 py-2 border-b"
                      >
                        <div class="d-flex justify-space-between w-100 align-center">
                          <div class="d-flex flex-column text-truncate pr-2" style="max-width: 65%">
                            <span class="text-caption font-weight-bold text-blue-darken-3">{{
                              inv.invoice
                            }}</span>
                            <span
                              class="text-caption text-grey text-truncate"
                              style="font-size: 0.65rem"
                            >
                              {{ inv.tanggal }} • {{ inv.customer_nama || "UMUM" }}
                            </span>
                          </div>
                          <span class="text-caption font-weight-bold text-error">
                            {{ formatRupiah(inv.sisa_piutang) }}
                          </span>
                        </div>
                      </v-list-item>
                    </v-list>
                  </v-card-text>
                </v-card>
              </v-menu>
            </v-col>
          </v-row>
          <!-- ── END STAT CARDS ── -->

          <!-- ══════════════════════════════════════════════════════
             TAB NAVIGATION
             ══════════════════════════════════════════════════════ -->
          <v-tabs
            v-model="activeTab"
            density="compact"
            color="primary"
            bg-color="transparent"
            class="mb-1 dashboard-tabs"
            show-arrows
          >
            <v-tab value="beranda" class="text-caption text-sm-body-2">
              <v-icon start size="small">mdi-home-outline</v-icon>
              Beranda
            </v-tab>

            <v-tab v-if="!isWarehouseUser" value="penjualan" class="text-caption text-sm-body-2">
              <v-icon start size="small">mdi-chart-line</v-icon>
              Penjualan
            </v-tab>

            <v-tab value="stok" class="text-caption text-sm-body-2">
              <v-icon start size="small">mdi-package-variant</v-icon>
              Stok
              <v-chip
                v-if="lowStockCount > 0"
                size="x-small"
                color="error"
                variant="flat"
                class="ml-1 font-weight-bold"
                >{{ lowStockCount }}</v-chip
              >
            </v-tab>

            <v-tab value="operasional" class="text-caption text-sm-body-2">
              <v-icon start size="small">mdi-cog-outline</v-icon>
              Operasional
            </v-tab>

            <v-tab v-if="!isWarehouseUser" value="keuangan" class="text-caption text-sm-body-2">
              <v-icon start size="small">mdi-cash-multiple</v-icon>
              Keuangan
            </v-tab>
          </v-tabs>

          <v-divider class="mb-5" />

          <v-tabs-window v-model="activeTab">
            <!-- ══════════════════════════════════════════
               TAB 1 — BERANDA
               Snapshot + Menu cepat + Tindakan pending + Ringkasan jadwal
               ══════════════════════════════════════════ -->
            <v-tabs-window-item value="beranda">
              <v-row dense class="mb-4">
                <!-- Menu Sering Diakses -->
                <v-col cols="12" lg="5">
                  <v-card elevation="2" class="bg-surface fill-height">
                    <v-card-title
                      class="d-flex align-center bg-blue-grey-lighten-5 text-blue-grey-darken-3 py-2"
                    >
                      <v-icon class="mr-2" color="primary" size="small">mdi-history</v-icon>
                      <span class="text-subtitle-2 font-weight-bold">Sering Diakses</span>
                    </v-card-title>
                    <v-card-text class="pa-4">
                      <div v-if="isLoadingFrequent" class="text-center pa-4">
                        <v-progress-circular indeterminate color="primary" size="28" />
                      </div>
                      <div
                        v-else-if="frequentMenus.length === 0"
                        class="text-center text-medium-emphasis text-caption"
                      >
                        Belum ada riwayat akses menu.
                      </div>
                      <v-row v-else class="justify-start" dense>
                        <v-col
                          v-for="menu in frequentMenus"
                          :key="menu.title"
                          cols="4"
                          sm="3"
                          md="2"
                          class="text-center pa-2"
                        >
                          <v-tooltip :text="menu.title" location="bottom">
                            <template v-slot:activator="{ props }">
                              <v-btn
                                v-bind="props"
                                :to="menu.to"
                                :color="menu.color"
                                icon
                                size="large"
                                variant="flat"
                                class="mb-1 transition-swing"
                                elevation="2"
                              >
                                <v-icon size="24">{{ menu.icon || "mdi-star" }}</v-icon>
                              </v-btn>
                            </template>
                          </v-tooltip>
                          <div
                            class="text-caption text-medium-emphasis font-weight-medium text-truncate px-1"
                            style="font-size: 0.7rem"
                          >
                            {{ menu.title }}
                          </div>
                        </v-col>
                      </v-row>
                    </v-card-text>
                  </v-card>
                </v-col>

                <!-- Perlu Tindakan -->
                <v-col v-if="!isWarehouseUser" cols="12" lg="4">
                  <v-card elevation="2" class="bg-surface fill-height">
                    <v-card-title class="d-flex align-center py-2">
                      <v-icon class="mr-2" color="info" size="small">mdi-bell-ring-outline</v-icon>
                      <span class="text-subtitle-2 font-weight-bold">Perlu Tindakan</span>
                    </v-card-title>
                    <v-card-text class="pa-3">
                      <div v-if="isLoadingActions" class="text-center pa-4">
                        <v-progress-circular indeterminate color="primary" size="28" />
                      </div>
                      <div v-else-if="pendingActions.length === 0" class="text-center pa-4">
                        <v-icon size="40" color="success">mdi-check-all</v-icon>
                        <div class="mt-2 text-caption text-medium-emphasis">Semua beres!</div>
                      </div>
                      <v-list v-else dense bg-color="transparent">
                        <template v-for="(item, index) in pendingActions" :key="item.key">
                          <v-list-item
                            :to="item.to"
                            class="mb-1 px-2"
                            rounded="lg"
                            variant="tonal"
                            density="compact"
                            lines="one"
                          >
                            <template #prepend>
                              <v-avatar
                                :icon="item.icon"
                                color="info"
                                variant="flat"
                                size="32"
                                class="text-white mr-2"
                              />
                            </template>
                            <v-list-item-title class="font-weight-bold text-caption">{{
                              item.title
                            }}</v-list-item-title>
                            <template #append>
                              <v-chip
                                color="info"
                                size="small"
                                variant="flat"
                                class="font-weight-bold"
                                >{{ item.count }}</v-chip
                              >
                            </template>
                          </v-list-item>
                          <v-divider v-if="index < pendingActions.length - 1" class="my-1" />
                        </template>
                      </v-list>
                    </v-card-text>
                  </v-card>
                </v-col>

                <!-- Ringkasan Status Jadwal Kirim -->
                <v-col cols="12" :lg="isWarehouseUser ? 7 : 3">
                  <v-card elevation="2" class="bg-surface fill-height">
                    <v-card-title
                      class="d-flex align-center bg-indigo-lighten-5 text-indigo-darken-4 py-2"
                    >
                      <v-icon class="mr-2" color="indigo" size="small">mdi-truck-clock</v-icon>
                      <span class="text-subtitle-2 font-weight-bold">Status Kiriman</span>
                      <v-spacer />
                      <v-btn
                        size="x-small"
                        variant="text"
                        color="indigo"
                        @click="activeTab = 'operasional'"
                        append-icon="mdi-chevron-right"
                        >Detail</v-btn
                      >
                    </v-card-title>
                    <v-card-text class="pa-0">
                      <div v-if="isLoadingSchedules" class="text-center pa-4">
                        <v-progress-circular indeterminate color="indigo" size="20" />
                      </div>
                      <v-list v-else density="compact" class="py-0">
                        <v-list-item
                          v-for="item in combinedSchedules.slice(0, 6)"
                          :key="item.kode"
                          density="compact"
                          class="px-3 py-1"
                        >
                          <v-list-item-title class="text-caption font-weight-medium">{{
                            item.nama
                          }}</v-list-item-title>
                          <template #append>
                            <v-chip
                              v-if="item.activeShipment"
                              :color="getStatusColor(item.activeShipment.status)"
                              size="x-small"
                              variant="flat"
                              class="font-weight-bold"
                            >
                              {{ item.activeShipment.status }}
                            </v-chip>
                            <span v-else class="text-caption text-grey-lighten-1">–</span>
                          </template>
                        </v-list-item>
                      </v-list>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-tabs-window-item>

            <!-- ══════════════════════════════════════════
               TAB 2 — PENJUALAN
               Grafik, produk terlaris, transaksi, target, performa cabang
               ══════════════════════════════════════════ -->
            <v-tabs-window-item v-if="!isWarehouseUser" value="penjualan">
              <!-- Baris 1: Grafik + Target -->
              <v-row class="mb-4" align="start">
                <!-- Grafik Penjualan -->
                <v-col cols="12" lg="8">
                  <v-card elevation="2" class="rounded-lg bg-surface">
                    <v-card-title class="py-3 px-4 border-b">
                      <div class="d-flex align-center justify-space-between w-100">
                        <div class="d-flex align-center text-primary font-weight-bold">
                          <v-icon class="mr-2" color="primary">mdi-chart-timeline-variant</v-icon
                          >Grafik Penjualan
                        </div>
                        <div class="bg-surface-variant rounded-lg pa-1 d-none d-sm-flex">
                          <v-btn-toggle
                            v-model="chartType"
                            variant="text"
                            density="compact"
                            mandatory
                            divided
                            class="chart-type-toggle"
                          >
                            <v-btn
                              value="bar"
                              size="small"
                              :color="chartType === 'bar' ? 'primary' : 'medium-emphasis'"
                              class="rounded-s-lg"
                              ><v-icon>mdi-chart-bar</v-icon></v-btn
                            >
                            <v-btn
                              value="line"
                              size="small"
                              :color="chartType === 'line' ? 'primary' : 'medium-emphasis'"
                              ><v-icon>mdi-chart-line</v-icon></v-btn
                            >
                            <v-btn
                              value="area"
                              size="small"
                              :color="chartType === 'area' ? 'primary' : 'medium-emphasis'"
                              class="rounded-e-lg"
                              ><v-icon>mdi-chart-bell-curve-cumulative</v-icon></v-btn
                            >
                          </v-btn-toggle>
                        </div>
                      </div>
                    </v-card-title>
                    <v-card-text class="pa-4">
                      <div
                        class="filter-bar d-flex flex-column flex-md-row align-md-center justify-space-between gap-3 mb-6"
                      >
                        <v-btn-toggle
                          v-model="chartGroupBy"
                          variant="outlined"
                          density="compact"
                          color="primary"
                          mandatory
                          rounded="lg"
                          class="mr-auto mb-2 mb-md-0 shadow-sm"
                          style="height: 36px"
                        >
                          <v-btn value="day" class="text-caption font-weight-bold px-4"
                            >Harian</v-btn
                          >
                          <v-btn value="week" class="text-caption font-weight-bold px-4"
                            >Mingguan</v-btn
                          >
                          <v-btn value="month" class="text-caption font-weight-bold px-4"
                            >Bulanan</v-btn
                          >
                        </v-btn-toggle>
                        <div
                          class="d-flex flex-wrap align-center justify-end gap-2"
                          style="gap: 8px"
                        >
                          <v-select
                            v-model="chartFilters.cabang"
                            :items="cabangList"
                            item-title="nama"
                            item-value="kode"
                            density="compact"
                            variant="outlined"
                            hide-details
                            prepend-inner-icon="mdi-store-outline"
                            bg-color="surface"
                            class="filter-input-select"
                            :readonly="authStore.user?.cabang !== 'KDC'"
                            style="min-width: 220px"
                          />
                          <div
                            class="d-flex align-center border rounded px-2 bg-surface"
                            style="
                              height: 40px;
                              border-color: rgba(
                                var(--v-border-color),
                                var(--v-border-opacity)
                              ) !important;
                            "
                          >
                            <input
                              type="date"
                              v-model="chartFilters.startDate"
                              class="date-native-input text-body-2"
                            />
                            <span class="mx-2 text-caption text-medium-emphasis">s/d</span>
                            <input
                              type="date"
                              v-model="chartFilters.endDate"
                              class="date-native-input text-body-2"
                            />
                          </div>
                        </div>
                      </div>
                      <div
                        v-if="isLoadingChart"
                        class="d-flex flex-column align-center justify-center"
                        style="height: 320px"
                      >
                        <v-progress-circular indeterminate color="primary" size="48" width="4" />
                        <div class="mt-3 text-caption text-medium-emphasis">
                          Sedang memuat data grafik...
                        </div>
                      </div>
                      <div v-else style="height: 350px; position: relative">
                        <Bar
                          v-if="chartType === 'bar'"
                          :data="chartData as any"
                          :options="targetChartOptions as any"
                        />
                        <Line
                          v-else
                          :data="chartData as any"
                          :options="targetChartOptions as any"
                        />
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>

                <!-- Target Pencapaian -->
                <v-col cols="12" lg="4">
                  <v-card elevation="2" class="bg-surface fill-height">
                    <v-card-title
                      class="d-flex align-center bg-blue-lighten-5 text-blue-darken-3 py-2"
                    >
                      <v-icon class="mr-2" color="primary" size="small">mdi-target</v-icon>
                      <span class="text-subtitle-2 font-weight-bold">Pencapaian Target</span>
                    </v-card-title>
                    <v-card-text class="pa-4">
                      <div v-if="isLoadingSalesTarget" class="text-center pa-8">
                        <v-progress-circular indeterminate color="primary" size="48" />
                      </div>
                      <div v-else>
                        <v-row align="center">
                          <v-col cols="12" sm="5" class="text-center">
                            <div style="height: 200px; position: relative">
                              <Bar :data="targetChartData" :options="targetChartOptions as any" />
                            </div>
                          </v-col>
                          <v-col cols="12" sm="7">
                            <v-card variant="outlined" class="mb-3">
                              <v-card-text class="pa-3">
                                <div class="text-caption text-medium-emphasis mb-1">Realisasi</div>
                                <div
                                  class="text-h6 font-weight-bold"
                                  :class="
                                    isOverTarget ? 'text-success' : 'text-deep-orange-darken-1'
                                  "
                                >
                                  <span class="animated-number">{{
                                    formatRupiah(Number(animatedTargetRealization.toFixed(0)))
                                  }}</span>
                                </div>
                                <div
                                  class="text-caption mt-1"
                                  :style="{ color: getProgressColor(targetPercentage) }"
                                >
                                  {{ targetPercentage.toFixed(2) }}% dari target
                                  <v-icon v-if="isOverTarget" size="small" color="success"
                                    >mdi-arrow-up-bold</v-icon
                                  >
                                </div>
                              </v-card-text>
                            </v-card>
                            <v-card variant="outlined">
                              <v-card-text class="pa-3">
                                <div class="text-caption text-medium-emphasis mb-1">Target</div>
                                <div class="text-subtitle-1 font-weight-medium">
                                  {{ formatRupiah(salesTargetSummary.target) }}
                                </div>
                              </v-card-text>
                            </v-card>
                          </v-col>
                        </v-row>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <!-- Baris 2: Produk Terlaris + Transaksi Terbaru -->
              <v-row class="mb-4">
                <v-col cols="12" md="6">
                  <v-card elevation="2" class="bg-surface">
                    <v-card-title
                      class="d-flex align-center justify-space-between bg-amber-lighten-5 py-2 pr-2 text-amber-darken-4"
                    >
                      <div class="d-flex align-center">
                        <v-icon class="mr-2" color="amber-darken-2" size="small"
                          >mdi-star-circle-outline</v-icon
                        >
                        <span class="text-subtitle-2 font-weight-bold">Produk Terlaris</span>
                      </div>
                      <div
                        v-if="authStore.user?.cabang === 'KDC'"
                        style="min-width: 180px; max-width: 220px"
                      >
                        <v-select
                          v-model="topProductsCabang"
                          :items="cabangList"
                          item-title="nama"
                          item-value="kode"
                          density="compact"
                          variant="outlined"
                          hide-details
                          bg-color="surface"
                          color="amber-darken-3"
                          class="text-caption font-weight-bold"
                        />
                      </div>
                    </v-card-title>
                    <v-card-text class="pa-4">
                      <div v-if="isLoadingTopProducts" class="text-center pa-6">
                        <v-progress-circular indeterminate color="amber" size="36" />
                      </div>
                      <v-list
                        v-else
                        bg-color="transparent"
                        style="max-height: 300px; overflow-y: auto"
                      >
                        <v-list-item
                          v-for="(product, index) in topProducts"
                          :key="product.KODE + product.UKURAN"
                          class="px-2 mb-2"
                          rounded="lg"
                          border
                        >
                          <template #prepend>
                            <v-avatar
                              :color="
                                index === 0
                                  ? 'amber'
                                  : index === 1
                                  ? 'blue-grey-lighten-1'
                                  : 'brown-lighten-1'
                              "
                              size="36"
                            >
                              <span class="font-weight-bold text-white text-caption">{{
                                index + 1
                              }}</span>
                            </v-avatar>
                          </template>
                          <v-list-item-title class="font-weight-bold text-wrap text-caption">{{
                            product.NAMA
                          }}</v-list-item-title>
                          <v-list-item-subtitle
                            class="mt-1 d-flex align-center text-medium-emphasis"
                          >
                            <v-chip size="x-small" class="mr-2">{{ product.KODE }}</v-chip>
                            <v-chip size="x-small" color="grey-darken-3" variant="flat">{{
                              product.UKURAN
                            }}</v-chip>
                          </v-list-item-subtitle>
                          <template #append>
                            <v-chip
                              color="amber-darken-3"
                              size="small"
                              variant="flat"
                              class="font-weight-bold"
                              >{{ product.TOTAL?.toLocaleString("id-ID") }} pcs</v-chip
                            >
                          </template>
                        </v-list-item>
                      </v-list>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" md="6">
                  <v-card elevation="2" class="bg-surface">
                    <v-card-title
                      class="d-flex align-center justify-space-between bg-green-lighten-5 text-green-darken-4 py-2"
                    >
                      <div class="d-flex align-center">
                        <v-icon class="mr-2" color="success" size="small">mdi-point-of-sale</v-icon>
                        <span class="text-subtitle-2 font-weight-bold">Penjualan Terbaru</span>
                      </div>
                      <v-btn
                        size="small"
                        variant="text"
                        color="success"
                        to="/transaksi/penjualan/invoice"
                        append-icon="mdi-chevron-right"
                        >Lihat Semua</v-btn
                      >
                    </v-card-title>
                    <v-card-text class="pa-4">
                      <div v-if="isLoadingTransactions" class="text-center pa-6">
                        <v-progress-circular indeterminate color="success" size="36" />
                      </div>
                      <div v-else-if="recentTransactions.length === 0" class="text-center pa-6">
                        <v-icon size="48" color="grey">mdi-receipt-text-outline</v-icon>
                        <div class="mt-2 text-caption text-medium-emphasis">
                          Belum ada transaksi hari ini
                        </div>
                      </div>
                      <div v-else style="max-height: 300px; overflow-y: auto">
                        <TransitionGroup tag="div" :css="false" @enter="onListEnter">
                          <div
                            v-for="(transaction, index) in recentTransactions"
                            :key="transaction.id"
                            :data-index="index"
                            class="mb-2"
                          >
                            <v-list-item
                              class="px-2 border rounded-lg bg-surface elevation-1"
                              lines="two"
                            >
                              <template #prepend>
                                <v-avatar color="success-lighten-1" size="36"
                                  ><v-icon color="white" size="small"
                                    >mdi-cart-check</v-icon
                                  ></v-avatar
                                >
                              </template>
                              <v-list-item-title class="font-weight-bold text-caption">{{
                                transaction.customer
                              }}</v-list-item-title>
                              <v-list-item-subtitle class="mt-1 text-caption text-medium-emphasis"
                                >{{ transaction.id }} • {{ transaction.time }}</v-list-item-subtitle
                              >
                              <template #append>
                                <v-chip
                                  color="success"
                                  size="small"
                                  variant="flat"
                                  class="font-weight-bold price-pulse"
                                  >{{ formatRupiah(transaction.amount) }}</v-chip
                                >
                              </template>
                            </v-list-item>
                          </div>
                        </TransitionGroup>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <!-- Baris 3: Ranking Performa Cabang (KDC only) -->
              <v-row v-if="authStore.user?.cabang === 'KDC'" class="mb-4">
                <v-col cols="12" md="7">
                  <v-card elevation="2" class="bg-surface">
                    <v-card-title
                      class="d-flex align-center bg-purple-lighten-5 text-purple-darken-4 py-2"
                    >
                      <v-icon class="mr-2" color="purple" size="small">mdi-trophy-outline</v-icon>
                      <span class="text-subtitle-2 font-weight-bold">Ranking Performa Cabang</span>
                      <v-spacer />
                      <v-chip
                        v-if="!isLoadingPerformance"
                        size="small"
                        color="purple"
                        variant="flat"
                        >{{ branchPerformances.length }} Cabang</v-chip
                      >
                    </v-card-title>
                    <v-card-text class="pa-0">
                      <div v-if="isLoadingPerformance" class="text-center pa-6">
                        <v-progress-circular indeterminate color="purple" size="36" />
                      </div>
                      <v-table v-else density="compact" hover class="bg-surface text-high-emphasis">
                        <thead>
                          <tr>
                            <th class="text-center" width="50">Rank</th>
                            <th class="text-left">Cabang</th>
                            <th class="text-right">Omset</th>
                            <th class="text-right">Target</th>
                            <th class="text-right" width="120">Ach %</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(item, index) in branchPerformances" :key="item.kode_cabang">
                            <td class="text-center font-weight-bold">
                              <v-avatar
                                size="24"
                                :color="index < 3 ? 'amber-lighten-4' : 'grey-lighten-3'"
                                variant="flat"
                              >
                                <span
                                  :class="index < 3 ? 'text-amber-darken-4' : 'text-grey-darken-2'"
                                  style="font-size: 12px"
                                  >{{ index + 1 }}</span
                                >
                              </v-avatar>
                            </td>
                            <td class="font-weight-medium text-caption">
                              {{ item.nama_cabang }}
                              <div class="text-caption text-medium-emphasis">
                                {{ item.kode_cabang }}
                              </div>
                            </td>
                            <td class="text-right">
                              <div class="font-weight-bold text-caption">
                                {{ formatRupiah(item.nominal) }}
                              </div>
                            </td>
                            <td class="text-right text-medium-emphasis text-caption">
                              {{ formatRupiah(item.target) }}
                            </td>
                            <td class="text-right">
                              <div class="d-flex align-center justify-end ga-2">
                                <span
                                  :class="`text-${getAchColor(
                                    item.ach
                                  )} font-weight-bold text-caption`"
                                  >{{ item.ach.toFixed(1) }}%</span
                                >
                                <v-progress-circular
                                  :model-value="item.ach"
                                  :color="getAchColor(item.ach)"
                                  size="20"
                                  width="3"
                                  bg-color="grey-lighten-2"
                                />
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </v-table>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" md="5">
                  <v-card elevation="2" class="bg-surface fill-height">
                    <v-card-title
                      class="d-flex align-center bg-teal-lighten-5 py-2 text-teal-darken-4"
                    >
                      <v-icon class="mr-2" color="teal" size="small">mdi-chart-pie</v-icon>
                      <span class="text-subtitle-2 font-weight-bold">Kontribusi Omset Cabang</span>
                    </v-card-title>
                    <v-card-text class="pa-4">
                      <div v-if="isLoadingPerformance" class="text-center pa-6">
                        <v-progress-circular indeterminate color="teal" size="36" />
                      </div>
                      <div v-else style="height: 250px; position: relative">
                        <Pie :data="branchDistributionData" :options="pieChartOptions" />
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <!-- ============================================================
                 ANALITIK BARU: Low Stock Sales & Seasonal Sales
                 ============================================================ -->
              <v-row v-if="authStore.user?.cabang === 'KDC'" class="mb-4">
                <!-- KIRI: Penjualan Stok Tipis -->
                <v-col cols="12" md="6">
                  <v-card elevation="2" class="rounded-lg h-100 bg-surface">
                    <v-card-title
                      class="d-flex flex-wrap align-center bg-blue-grey-lighten-5 py-2 px-3 text-blue-grey-darken-3 gap-2"
                    >
                      <v-icon class="mr-2" color="primary" size="small"
                        >mdi-chart-bar-stacked</v-icon
                      >
                      <span class="text-subtitle-2 font-weight-bold mr-auto">
                        Penjualan Rendah (&lt; 20 pcs)
                      </span>

                      <div class="d-flex align-center ga-2 flex-wrap justify-end">
                        <div style="min-width: 110px; max-width: 130px">
                          <v-select
                            v-model="filterLowStockCabang"
                            :items="cabangList"
                            item-title="nama"
                            item-value="kode"
                            density="compact"
                            variant="outlined"
                            hide-details
                            bg-color="surface"
                            class="filter-select-small"
                          />
                        </div>
                        <div style="min-width: 130px; max-width: 150px">
                          <v-select
                            v-model="filterLowStockPeriod"
                            :items="lowStockPeriods"
                            density="compact"
                            variant="outlined"
                            hide-details
                            bg-color="surface"
                            class="filter-select-small"
                          />
                        </div>
                        <v-btn
                          color="success"
                          size="small"
                          prepend-icon="mdi-file-excel"
                          variant="flat"
                          @click="exportLowStockSales"
                          >Export</v-btn
                        >
                      </div>
                    </v-card-title>
                    <v-card-text class="pa-0">
                      <div v-if="isLoadingLowStockSales" class="text-center pa-8">
                        <v-progress-circular indeterminate color="primary" size="36" />
                      </div>
                      <v-data-table
                        v-else
                        :headers="lowStockHeaders"
                        :items="lowStockSalesData"
                        density="compact"
                        hover
                        class="text-caption"
                        hide-default-footer
                        items-per-page="-1"
                        style="max-height: 350px; overflow-y: auto"
                      >
                        <template v-slot:headers>
                          <tr>
                            <th class="text-left font-weight-bold">STORE</th>
                            <th class="text-left font-weight-bold">KODE</th>
                            <th class="text-left font-weight-bold">NAMA BARANG</th>
                            <th class="text-center font-weight-bold">UK.</th>
                            <th class="text-center font-weight-bold text-error">STOK</th>
                            <th class="text-center font-weight-bold text-success">TERJUAL</th>
                          </tr>
                        </template>
                        <template v-slot:item="{ item }">
                          <tr>
                            <!-- [BARU] Kolom Store -->
                            <td class="text-caption font-weight-bold text-blue-darken-3">
                              {{ item.cabang_nama }}
                            </td>
                            <td class="text-caption">{{ item.kode }}</td>
                            <td class="text-caption font-weight-bold text-wrap">{{ item.nama }}</td>
                            <td class="text-caption text-center">{{ item.ukuran }}</td>
                            <td class="text-caption text-center font-weight-bold text-error">
                              {{ item.stok_sekarang }}
                            </td>
                            <td class="text-caption text-center font-weight-bold text-success">
                              {{ item.total_terjual }}
                            </td>
                          </tr>
                        </template>
                      </v-data-table>
                    </v-card-text>
                  </v-card>
                </v-col>

                <!-- KANAN: Penjualan Sesional (New Arrival) -->
                <v-col cols="12" md="6">
                  <v-card elevation="2" class="rounded-lg h-100 bg-surface">
                    <v-card-title
                      class="d-flex flex-wrap align-center bg-teal-lighten-5 py-2 px-3 text-teal-darken-4 gap-2"
                    >
                      <v-icon class="mr-2" color="teal" size="small">mdi-new-box</v-icon>
                      <span class="text-subtitle-2 font-weight-bold mr-auto"
                        >Trend Sesional / New Arrival</span
                      >

                      <div class="d-flex align-center ga-2 flex-wrap justify-end">
                        <div style="min-width: 110px; max-width: 130px">
                          <v-select
                            v-model="filterSeasonalCabang"
                            :items="cabangList"
                            item-title="nama"
                            item-value="kode"
                            density="compact"
                            variant="outlined"
                            hide-details
                            bg-color="surface"
                            class="filter-select-small"
                          />
                        </div>
                        <div style="min-width: 130px; max-width: 150px">
                          <v-select
                            v-model="filterSeasonalPeriod"
                            :items="seasonalPeriods"
                            density="compact"
                            variant="outlined"
                            hide-details
                            bg-color="surface"
                            class="filter-select-small"
                          />
                        </div>
                        <v-btn
                          color="success"
                          size="small"
                          prepend-icon="mdi-file-excel"
                          variant="flat"
                          @click="exportSeasonalSales"
                          >Export</v-btn
                        >
                      </div>
                    </v-card-title>
                    <v-card-text class="pa-0">
                      <div v-if="isLoadingSeasonalSales" class="text-center pa-8">
                        <v-progress-circular indeterminate color="teal" size="36" />
                      </div>
                      <v-data-table
                        v-else
                        :headers="seasonalHeaders"
                        :items="seasonalSalesData"
                        density="compact"
                        hover
                        class="text-caption"
                        hide-default-footer
                        items-per-page="-1"
                        style="max-height: 350px; overflow-y: auto"
                      >
                        <template v-slot:headers>
                          <tr>
                            <th class="text-left font-weight-bold">STORE</th>
                            <th class="text-left font-weight-bold">KODE</th>
                            <th class="text-left font-weight-bold">NAMA BARANG</th>
                            <th class="text-center font-weight-bold">UK.</th>
                            <th class="text-center font-weight-bold text-success">TERJUAL</th>
                          </tr>
                        </template>
                        <template v-slot:item="{ item }">
                          <tr>
                            <!-- [BARU] Kolom Store -->
                            <td class="text-caption font-weight-bold text-teal-darken-3">
                              {{ item.cabang_nama }}
                            </td>
                            <td class="text-caption">{{ item.kode }}</td>
                            <td class="text-caption font-weight-bold text-wrap">{{ item.nama }}</td>
                            <td class="text-caption text-center">{{ item.ukuran }}</td>
                            <td class="text-caption text-center font-weight-bold text-success">
                              {{ item.total_terjual }}
                            </td>
                          </tr>
                        </template>
                      </v-data-table>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <v-row class="mb-4">
                <v-col cols="12">
                  <v-card elevation="2" class="rounded-lg bg-surface">
                    <v-card-title
                      class="d-flex flex-wrap align-center bg-red-lighten-5 py-2 px-3 text-red-darken-4 gap-2"
                    >
                      <v-icon class="mr-2" color="error" size="small"
                        >mdi-archive-clock-outline</v-icon
                      >
                      <span class="text-subtitle-2 font-weight-bold mr-auto">
                        Dead Stock &amp; Pergerakan Stok — Klasifikasi 4 Tier
                      </span>
                      <div
                        v-if="authStore.user?.cabang === 'KDC'"
                        style="min-width: 130px; max-width: 160px"
                      >
                        <v-select
                          v-model="deadStockCabang"
                          :items="cabangList"
                          item-title="nama"
                          item-value="kode"
                          density="compact"
                          variant="outlined"
                          hide-details
                          bg-color="surface"
                          class="filter-select-small"
                        />
                      </div>
                      <v-btn
                        size="small"
                        variant="tonal"
                        color="error"
                        prepend-icon="mdi-open-in-new"
                        :to="'/laporan/stok/dead-stok'"
                        >Detail Lengkap</v-btn
                      >
                    </v-card-title>

                    <v-card-text class="pa-4">
                      <div v-if="isLoadingDeadStock" class="text-center pa-8">
                        <v-progress-circular indeterminate color="error" size="36" />
                      </div>

                      <div v-else>
                        <!-- 4 Tier Cards -->
                        <v-row dense class="mb-4">
                          <v-col cols="6" sm="3">
                            <div
                              class="rounded-lg pa-3"
                              style="background: #eaf3de; border: 1px solid #97c459"
                            >
                              <div
                                class="text-caption font-weight-bold"
                                style="color: #27500a; opacity: 0.8"
                              >
                                Fast Moving
                              </div>
                              <div class="text-caption mb-2" style="color: #27500a; opacity: 0.7">
                                ≤ 6 bulan
                              </div>
                              <div class="text-h6 font-weight-medium" style="color: #27500a">
                                {{ deadStockSummary.fm.toLocaleString("id-ID") }}
                                <span class="text-caption font-weight-regular">pcs</span>
                              </div>
                              <div class="text-caption" style="color: #27500a; opacity: 0.75">
                                {{
                                  deadStockSummary.total > 0
                                    ? (
                                        (deadStockSummary.fm / deadStockSummary.total) *
                                        100
                                      ).toFixed(1)
                                    : 0
                                }}% dari total
                              </div>
                            </div>
                          </v-col>
                          <v-col cols="6" sm="3">
                            <div
                              class="rounded-lg pa-3"
                              style="background: #e6f1fb; border: 1px solid #85b7eb"
                            >
                              <div
                                class="text-caption font-weight-bold"
                                style="color: #0c447c; opacity: 0.8"
                              >
                                Standar
                              </div>
                              <div class="text-caption mb-2" style="color: #0c447c; opacity: 0.7">
                                6 – 18 bulan
                              </div>
                              <div class="text-h6 font-weight-medium" style="color: #0c447c">
                                {{ deadStockSummary.std.toLocaleString("id-ID") }}
                                <span class="text-caption font-weight-regular">pcs</span>
                              </div>
                              <div class="text-caption" style="color: #0c447c; opacity: 0.75">
                                {{
                                  deadStockSummary.total > 0
                                    ? (
                                        (deadStockSummary.std / deadStockSummary.total) *
                                        100
                                      ).toFixed(1)
                                    : 0
                                }}% dari total
                              </div>
                            </div>
                          </v-col>
                          <v-col cols="6" sm="3">
                            <div
                              class="rounded-lg pa-3"
                              style="background: #faeeda; border: 1px solid #ef9f27"
                            >
                              <div
                                class="text-caption font-weight-bold"
                                style="color: #633806; opacity: 0.8"
                              >
                                Slow Moving
                              </div>
                              <div class="text-caption mb-2" style="color: #633806; opacity: 0.7">
                                18 bln – 3 tahun
                              </div>
                              <div class="text-h6 font-weight-medium" style="color: #633806">
                                {{ deadStockSummary.sm.toLocaleString("id-ID") }}
                                <span class="text-caption font-weight-regular">pcs</span>
                              </div>
                              <div class="text-caption" style="color: #633806; opacity: 0.75">
                                {{
                                  deadStockSummary.total > 0
                                    ? (
                                        (deadStockSummary.sm / deadStockSummary.total) *
                                        100
                                      ).toFixed(1)
                                    : 0
                                }}% dari total
                              </div>
                            </div>
                          </v-col>
                          <v-col cols="6" sm="3">
                            <div
                              class="rounded-lg pa-3"
                              style="background: #fcebeb; border: 1px solid #f09595"
                            >
                              <div
                                class="text-caption font-weight-bold"
                                style="color: #791f1f; opacity: 0.8"
                              >
                                Dead Stock
                              </div>
                              <div class="text-caption mb-2" style="color: #791f1f; opacity: 0.7">
                                ≥ 3 tahun
                              </div>
                              <div class="text-h6 font-weight-medium" style="color: #791f1f">
                                {{ deadStockSummary.ds.toLocaleString("id-ID") }}
                                <span class="text-caption font-weight-regular">pcs</span>
                              </div>
                              <div class="text-caption" style="color: #791f1f; opacity: 0.75">
                                {{
                                  deadStockSummary.total > 0
                                    ? (
                                        (deadStockSummary.ds / deadStockSummary.total) *
                                        100
                                      ).toFixed(1)
                                    : 0
                                }}% dari total
                              </div>
                            </div>
                          </v-col>
                        </v-row>

                        <!-- Metrics Row -->
                        <v-row dense>
                          <v-col cols="6" sm="3">
                            <div class="rounded-lg pa-3 bg-grey-lighten-4">
                              <div class="text-caption text-medium-emphasis mb-1">
                                Total Stok Terlacak
                              </div>
                              <div class="text-h6 font-weight-medium">
                                {{ deadStockSummary.total.toLocaleString("id-ID") }}
                              </div>
                              <div class="text-caption text-medium-emphasis">pcs</div>
                            </div>
                          </v-col>
                          <v-col cols="6" sm="3">
                            <div class="rounded-lg pa-3 bg-red-lighten-5">
                              <div class="text-caption text-medium-emphasis mb-1">
                                Nilai Dead Stock
                              </div>
                              <div class="text-h6 font-weight-medium text-error">
                                {{ formatRupiah(deadStockSummary.nilaiDs) }}
                              </div>
                              <div class="text-caption text-medium-emphasis">
                                {{ deadStockSummary.ds.toLocaleString("id-ID") }} pcs terblokir
                              </div>
                            </div>
                          </v-col>
                          <v-col cols="6" sm="3">
                            <div class="rounded-lg pa-3 bg-orange-lighten-5">
                              <div class="text-caption text-medium-emphasis mb-1">
                                Stok Bermasalah
                              </div>
                              <div class="text-h6 font-weight-medium text-orange-darken-3">
                                {{
                                  deadStockSummary.total > 0
                                    ? (
                                        ((deadStockSummary.sm + deadStockSummary.ds) /
                                          deadStockSummary.total) *
                                        100
                                      ).toFixed(1)
                                    : 0
                                }}%
                              </div>
                              <div class="text-caption text-medium-emphasis">
                                Dead + Slow Moving
                              </div>
                            </div>
                          </v-col>
                          <v-col cols="6" sm="3">
                            <div class="rounded-lg pa-3 bg-green-lighten-5">
                              <div class="text-caption text-medium-emphasis mb-1">Stok Sehat</div>
                              <div class="text-h6 font-weight-medium text-success">
                                {{
                                  deadStockSummary.total > 0
                                    ? (
                                        ((deadStockSummary.fm + deadStockSummary.std) /
                                          deadStockSummary.total) *
                                        100
                                      ).toFixed(1)
                                    : 0
                                }}%
                              </div>
                              <div class="text-caption text-medium-emphasis">Fast + Standar</div>
                            </div>
                          </v-col>
                        </v-row>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <v-row class="mt-4">
                <!-- Stacked Bar -->
                <v-col cols="12" md="5">
                  <div class="rounded-lg pa-3" style="background: white">
                    <div
                      class="text-caption font-weight-bold text-grey-darken-2 mb-2 text-uppercase"
                      style="letter-spacing: 0.04em"
                    >
                      Distribusi Stok per Jenis Kain × Tier
                    </div>
                    <div class="d-flex flex-wrap gap-3 mb-2">
                      <span
                        v-for="(ds, i) in [
                          { label: 'Fast Moving', color: '#639922' },
                          { label: 'Standar', color: '#378ADD' },
                          { label: 'Slow Moving', color: '#EF9F27' },
                          { label: 'Dead Stock', color: '#E24B4A' },
                        ]"
                        :key="i"
                        class="d-flex align-center"
                        style="gap: 4px; font-size: 11px; color: #666"
                      >
                        <span
                          :style="`width:10px;height:10px;border-radius:2px;background:${ds.color};display:inline-block`"
                        ></span>
                        {{ ds.label }}
                      </span>
                    </div>
                    <div v-if="isLoadingDeadStockChart" class="text-center pa-6">
                      <v-progress-circular indeterminate color="error" size="24" />
                    </div>
                    <div v-else style="height: 220px; position: relative">
                      <Bar :data="deadStockBarData" :options="deadStockBarOptions as any" />
                    </div>
                  </div>
                </v-col>

                <!-- Donut -->
                <v-col cols="12" md="4">
                  <div class="rounded-lg pa-3" style="background: white">
                    <div
                      class="text-caption font-weight-bold text-grey-darken-2 mb-2 text-uppercase"
                      style="letter-spacing: 0.04em"
                    >
                      Komposisi Stok
                    </div>
                    <div style="height: 220px; position: relative">
                      <Pie :data="deadStockDonutData" :options="deadStockDonutOptions as any" />
                    </div>
                  </div>
                </v-col>

                <!-- PIE BARU — penjualan dead stock -->
                <v-col cols="12" md="3">
                  <div class="rounded-lg pa-3 h-100" style="background: white">
                    <div
                      class="text-caption font-weight-bold text-grey-darken-2 mb-2 text-uppercase"
                      style="letter-spacing: 0.04em"
                    >
                      Pergerakan Dead Stock (12 bln)
                    </div>
                    <div v-if="isLoadingDeadStockSalesPie" class="text-center pa-6">
                      <v-progress-circular indeterminate color="error" size="24" />
                    </div>
                    <div v-else>
                      <div style="height: 180px; position: relative">
                        <Pie
                          :data="deadStockSalesPieData"
                          :options="deadStockSalesPieOptions as any"
                        />
                      </div>
                      <!-- Mini stats di bawah chart -->
                      <div class="d-flex justify-space-around mt-2 pt-2 border-t">
                        <div
                          class="text-center cursor-pointer"
                          @click="openDeadStockDetail('bergerak')"
                        >
                          <div class="text-caption font-weight-bold text-success">
                            {{ Number(deadStockSalesPie.sku_bergerak).toLocaleString("id-ID") }}
                          </div>
                          <div
                            style="font-size: 9px"
                            class="text-medium-emphasis text-decoration-underline"
                          >
                            SKU Bergerak ↗
                          </div>
                        </div>
                        <div
                          class="text-center cursor-pointer"
                          @click="openDeadStockDetail('stagnan')"
                        >
                          <div class="text-caption font-weight-bold text-error">
                            {{
                              (
                                Number(deadStockSalesPie.sku_total) -
                                Number(deadStockSalesPie.sku_bergerak)
                              ).toLocaleString("id-ID")
                            }}
                          </div>
                          <div
                            style="font-size: 9px"
                            class="text-medium-emphasis text-decoration-underline"
                          >
                            SKU Stagnan ↗
                          </div>
                        </div>
                        <div class="text-center">
                          <div class="text-caption font-weight-bold text-blue-darken-2">
                            {{ Number(deadStockSalesPie.qty_terjual).toLocaleString("id-ID") }}
                          </div>
                          <div style="font-size: 9px" class="text-medium-emphasis">Qty Terjual</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </v-col>
              </v-row>

              <!-- Baris 4: Trend Penjualan Item (KDC only) -->
              <v-row v-if="authStore.user?.cabang === 'KDC'" class="mb-4">
                <v-col cols="12">
                  <v-card elevation="2" class="rounded-lg bg-surface">
                    <v-card-title
                      class="d-flex align-center bg-blue-lighten-5 py-2 text-blue-darken-3"
                    >
                      <v-icon class="mr-2" color="primary" size="small"
                        >mdi-chart-line-variant</v-icon
                      >
                      <span class="text-subtitle-2 font-weight-bold">Trend Penjualan Item</span>
                      <v-spacer />
                      <div class="d-flex align-center ga-2">
                        <div style="width: 180px">
                          <v-select
                            v-model="trendCabang"
                            :items="cabangList"
                            item-title="nama"
                            item-value="kode"
                            label="Filter Cabang"
                            density="compact"
                            variant="outlined"
                            hide-details
                            bg-color="surface"
                            class="text-caption font-weight-bold"
                          />
                        </div>
                        <v-btn
                          color="success"
                          size="small"
                          prepend-icon="mdi-file-excel"
                          variant="flat"
                          @click="exportTrendPenjualan"
                          >Export</v-btn
                        >
                      </div>
                    </v-card-title>
                    <v-card-text class="pa-0">
                      <div v-if="isLoadingItemTrend" class="text-center pa-8">
                        <v-progress-circular indeterminate color="primary" size="36" />
                        <div class="mt-2 text-caption">Analisa data barang...</div>
                      </div>
                      <v-data-table
                        v-else
                        :headers="itemTrendHeaders"
                        :items="itemTrendData"
                        density="compact"
                        hover
                        class="text-caption trend-table"
                        hide-default-footer
                        items-per-page="-1"
                      >
                        <template #[`item.nama`]="{ item }">
                          <div class="py-2">
                            <div class="font-weight-bold text-wrap">{{ item.nama }}</div>
                            <div class="text-grey text-xs mt-1">{{ item.kode }}</div>
                          </div>
                        </template>
                        <template
                          v-for="col in [
                            'avg_now',
                            'avg_min_1',
                            'avg_min_2',
                            'avg_min_3',
                            'avg_ly_now',
                            'avg_ly_plus_1',
                            'avg_ly_plus_2',
                          ]"
                          :key="col"
                          #[`item.${col}`]="{ value }"
                        >
                          <span
                            :class="col === 'avg_now' ? 'font-weight-black text-primary' : ''"
                            >{{ Number(value).toFixed(1) }}</span
                          >
                        </template>
                        <template #[`item.trend`]="{ item }">
                          <v-icon
                            :icon="getTrendIcon(item)"
                            :color="getTrendColor(item)"
                            size="small"
                          />
                        </template>
                      </v-data-table>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-tabs-window-item>

            <!-- ══════════════════════════════════════════
               TAB 3 — STOK
               Pareto, stok menipis, stok kosong, stagnant
               ══════════════════════════════════════════ -->
            <v-tabs-window-item value="stok">
              <v-row class="mb-4">
                <!-- Stok Menipis -->
                <v-col cols="12" md="6">
                  <v-card elevation="2" class="bg-surface">
                    <v-card-title
                      class="d-flex align-center bg-orange-lighten-5 text-orange-darken-4 py-2"
                    >
                      <v-icon class="mr-2" color="warning" size="small">mdi-alert-circle</v-icon>
                      <span class="text-subtitle-2 font-weight-bold">Stok Menipis</span>
                      <v-chip
                        v-if="!isLoadingLowStock && lowStockProducts.length > 0"
                        size="x-small"
                        color="warning"
                        variant="flat"
                        class="ml-2 font-weight-bold"
                        >{{ lowStockProducts.length }} item</v-chip
                      >
                    </v-card-title>
                    <v-card-text class="pa-4">
                      <div v-if="isLoadingLowStock" class="text-center pa-8">
                        <v-progress-circular indeterminate color="warning" size="48" />
                      </div>
                      <div v-else-if="lowStockProducts.length === 0" class="text-center pa-8">
                        <v-icon size="56" color="success">mdi-check-circle-outline</v-icon>
                        <div class="mt-2 text-subtitle-2">Stok Aman!</div>
                      </div>
                      <div v-else>
                        <v-list
                          bg-color="transparent"
                          class="scrollable-list"
                          style="max-height: 300px; overflow-y: auto"
                        >
                          <TransitionGroup tag="div" :css="false" @enter="onListEnter">
                            <v-list-item
                              v-for="(product, i) in lowStockProducts"
                              :key="`${product.KODE}-${product.UKURAN}`"
                              :data-index="i"
                              class="px-3 mb-2 py-2"
                              rounded="lg"
                              border
                            >
                              <template #prepend>
                                <v-avatar color="error" size="40" variant="tonal" class="mr-2">
                                  <span class="text-subtitle-2 font-weight-black">{{
                                    product.UKURAN
                                  }}</span>
                                </v-avatar>
                              </template>
                              <div class="d-flex flex-column gap-1">
                                <div class="text-caption font-weight-bold text-wrap">
                                  {{ product.NAMA }}
                                </div>
                                <div
                                  class="d-flex align-center text-caption text-medium-emphasis mt-1"
                                >
                                  <v-chip
                                    size="x-small"
                                    label
                                    class="mr-2 px-2"
                                    color="grey-lighten-2"
                                    variant="flat"
                                    ><span class="text-grey-darken-3 font-weight-medium">{{
                                      product.KODE
                                    }}</span></v-chip
                                  >
                                  <span v-if="product.BARCODE" class="d-flex align-center"
                                    ><v-icon
                                      start
                                      size="x-small"
                                      icon="mdi-barcode"
                                      class="mr-1"
                                    />{{ product.BARCODE }}</span
                                  >
                                </div>
                                <div class="d-flex align-center mt-1">
                                  <v-chip
                                    size="x-small"
                                    color="error"
                                    variant="flat"
                                    class="mr-2 font-weight-bold"
                                    >Sisa: {{ product.TOTAL }}</v-chip
                                  >
                                  <div
                                    class="d-flex align-center text-caption text-info font-weight-medium"
                                  >
                                    <v-icon
                                      size="x-small"
                                      start
                                      icon="mdi-speedometer"
                                      class="mr-1"
                                    />Laku: {{ Number(product.AVG_SALE).toFixed(1) }} /bln
                                  </div>
                                </div>
                              </div>
                            </v-list-item>
                          </TransitionGroup>
                        </v-list>
                        <v-btn
                          color="warning"
                          variant="tonal"
                          block
                          class="mt-4"
                          to="/laporan/stok/real-time"
                          prepend-icon="mdi-file-chart-outline"
                          >Lihat Laporan Lengkap</v-btn
                        >
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>

                <!-- Kesiapan Pareto (detail) -->
                <v-col cols="12" md="6">
                  <v-card elevation="2" class="bg-surface fill-height">
                    <v-card-title class="d-flex align-center py-2" :color="healthStatus.color">
                      <v-icon class="mr-2" :color="healthStatus.color" size="small">{{
                        healthStatus.icon
                      }}</v-icon>
                      <span class="text-subtitle-2 font-weight-bold">Kesiapan Stok Pareto</span>
                      <v-spacer />
                      <v-btn
                        size="x-small"
                        variant="tonal"
                        :color="healthStatus.color"
                        @click="openParetoDetail"
                        >Detail</v-btn
                      >
                    </v-card-title>
                    <v-card-text class="pa-4">
                      <div v-if="isLoadingPareto" class="text-center pa-8">
                        <v-progress-circular indeterminate size="40" />
                      </div>
                      <div v-else>
                        <div class="text-center mb-4">
                          <div
                            class="text-h2 font-weight-black"
                            :class="`text-${healthStatus.color}`"
                          >
                            {{ paretoStats.score }}%
                          </div>
                          <div class="text-subtitle-2 font-weight-bold mt-1">
                            {{ healthStatus.text }}
                          </div>
                          <div class="text-caption text-medium-emphasis mt-1">
                            {{ healthStatus.desc }}
                          </div>
                        </div>
                        <v-divider class="mb-3" />
                        <div class="d-flex justify-space-around text-center">
                          <div>
                            <div class="text-h6 font-weight-bold">{{ paretoStats.sku_count }}</div>
                            <div class="text-caption text-medium-emphasis">SKU Laku</div>
                          </div>
                          <div>
                            <div class="text-h6 font-weight-bold">
                              {{ paretoStats.actual_stock.toLocaleString() }}
                            </div>
                            <div class="text-caption text-medium-emphasis">Stok Aktual</div>
                          </div>
                          <div>
                            <div class="text-h6 font-weight-bold">
                              {{ paretoStats.buffer_stock.toLocaleString() }}
                            </div>
                            <div class="text-caption text-medium-emphasis">Target Buffer</div>
                          </div>
                        </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <!-- Stok Kosong + Stagnant -->
              <v-row class="mb-4">
                <v-col cols="12">
                  <v-card
                    elevation="3"
                    class="bg-surface hover-pointer"
                    hover
                    @click="router.push('/laporan/stok/dead-stok')"
                  >
                    <v-card-text>
                      <div v-if="isLoadingStagnantStock" class="text-center pa-2">
                        <v-progress-circular indeterminate color="deep-orange" size="24" />
                      </div>
                      <div v-else class="d-flex align-center justify-space-between w-100">
                        <div class="d-flex align-center">
                          <v-icon size="40" class="mr-4" color="deep-orange"
                            >mdi-archive-arrow-down-outline</v-icon
                          >
                          <div>
                            <div class="text-caption text-deep-orange font-weight-bold">
                              Nilai Stok Stagnan (30 Hari)
                            </div>
                            <div class="text-h5 font-weight-bold text-deep-orange">
                              <span v-if="isLoadingStagnantStock && animatedStagnant === 0"
                                >...</span
                              >
                              <span v-else class="animated-number">{{
                                formatRupiah(Number(animatedStagnant.toFixed(0)))
                              }}</span>
                            </div>
                          </div>
                        </div>
                        <div class="text-caption text-medium-emphasis d-none d-sm-block">
                          Klik untuk lihat laporan dead stock
                        </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <v-row class="mb-4">
                <v-col cols="12">
                  <v-card elevation="2" class="rounded-lg d-flex flex-column bg-surface">
                    <v-card-title
                      class="d-flex flex-column flex-sm-row align-start align-sm-center bg-red-lighten-5 py-2 gap-2 pr-2 text-red-darken-4"
                    >
                      <div class="d-flex align-center flex-grow-1">
                        <v-icon class="mr-2" color="red" size="small"
                          >mdi-close-octagon-outline</v-icon
                        >
                        <span class="text-subtitle-2 font-weight-bold"
                          >Stok Kosong Store (0 Pcs)</span
                        >
                      </div>
                      <div class="d-flex align-center gap-2 w-100 w-sm-auto">
                        <div style="width: 160px">
                          <v-select
                            v-model="stokKosongCabang"
                            :items="cabangList.filter((c) => c.kode !== 'KDC')"
                            item-title="nama"
                            item-value="kode"
                            density="compact"
                            variant="outlined"
                            hide-details
                            bg-color="surface"
                            placeholder="Pilih Cabang"
                            class="filter-select-small"
                            :disabled="authStore.user?.cabang !== 'KDC'"
                          />
                        </div>
                        <v-text-field
                          v-model="searchStokKosong"
                          density="compact"
                          variant="outlined"
                          label="Cari Barang..."
                          prepend-inner-icon="mdi-magnify"
                          hide-details
                          bg-color="surface"
                          single-line
                          class="text-caption"
                          style="min-width: 180px"
                        />
                        <v-btn
                          color="success"
                          variant="tonal"
                          size="small"
                          class="px-2"
                          :disabled="stokKosongList.length === 0"
                          @click="exportStokKosong"
                        >
                          <v-icon>mdi-file-excel</v-icon>
                          <span class="d-none d-sm-inline ml-1">Export</span>
                        </v-btn>
                      </div>
                    </v-card-title>

                    <v-card-text class="pa-0">
                      <div
                        v-if="isLoadingStokKosong && stokKosongPage === 1"
                        class="text-center pa-8"
                      >
                        <v-progress-circular indeterminate color="red" size="36" />
                        <div class="mt-2 text-caption">Mencari data stok kosong...</div>
                      </div>
                      <div
                        v-else-if="stokKosongList.length === 0"
                        class="text-center pa-8 text-medium-emphasis"
                      >
                        <v-icon size="48" class="mb-2">mdi-check-circle-outline</v-icon>
                        <div class="text-caption">Tidak ada stok kosong sesuai pencarian.</div>
                      </div>
                      <v-data-table
                        v-else
                        :headers="[
                          { title: 'STORE', key: 'nama_cabang', sortable: false },
                          { title: 'KODE', key: 'kode', sortable: false, width: '130px' },
                          { title: 'BARCODE', key: 'barcode', sortable: false, width: '130px' },
                          { title: 'NAMA BARANG', key: 'nama_barang', sortable: false },
                          {
                            title: 'UK.',
                            key: 'ukuran',
                            align: 'center',
                            sortable: false,
                            width: '80px',
                          },
                          {
                            title: 'STOK',
                            key: 'stok_akhir',
                            align: 'center',
                            sortable: false,
                            width: '80px',
                          },
                        ]"
                        :items="stokKosongList"
                        density="compact"
                        hover
                        class="text-caption border-t desktop-table"
                        hide-default-footer
                        :items-per-page="-1"
                        style="max-height: 450px; overflow-y: auto"
                      >
                        <template #[`item.nama_cabang`]="{ item }">
                          <span class="font-weight-bold text-blue-darken-3">{{
                            item.nama_cabang
                          }}</span>
                        </template>
                        <template #[`item.nama_barang`]="{ item }">
                          <span class="font-weight-medium">{{ item.nama_barang }}</span>
                        </template>
                        <template #[`item.stok_akhir`]="{ item }">
                          <v-chip
                            size="x-small"
                            color="error"
                            variant="flat"
                            class="font-weight-bold"
                          >
                            {{ item.stok_akhir ?? 0 }}
                          </v-chip>
                        </template>

                        <template #bottom>
                          <div v-intersect="onIntersectStokKosong" class="pa-3 text-center w-100">
                            <v-progress-circular
                              v-if="isLoadingMoreStokKosong"
                              indeterminate
                              color="red"
                              size="24"
                              width="3"
                            />
                            <div
                              v-else-if="isStokKosongFinished && stokKosongList.length > 0"
                              class="text-caption text-grey"
                            >
                              -- Menampilkan semua {{ stokKosongList.length }} barang kosong --
                            </div>
                          </div>
                        </template>
                      </v-data-table>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <!-- Stok Kosong Fast Moving -->
              <v-row class="mb-4">
                <v-col cols="12">
                  <v-card elevation="2" class="rounded-lg d-flex flex-column bg-surface">
                    <v-card-title
                      class="d-flex flex-column flex-sm-row align-start align-sm-center bg-deep-orange-lighten-5 py-2 gap-2 pr-2 text-deep-orange-darken-4"
                    >
                      <div class="d-flex align-center flex-grow-1">
                        <v-icon class="mr-2" color="deep-orange" size="small"
                          >mdi-alert-octagon-outline</v-icon
                        >
                        <span class="text-subtitle-2 font-weight-bold"
                          >Stok Kosong — Barang Fast Moving</span
                        >
                        <v-chip
                          v-if="!isLoadingFastMoving && stokKosongFastMovingList.length > 0"
                          size="x-small"
                          color="deep-orange"
                          variant="flat"
                          class="ml-2 font-weight-bold"
                          >{{ stokKosongFastMovingList.length }}+ item</v-chip
                        >
                      </div>
                      <div class="d-flex align-center gap-2 w-100 w-sm-auto">
                        <div style="width: 160px">
                          <v-select
                            v-model="fastMovingCabang"
                            :items="cabangList"
                            item-title="nama"
                            item-value="kode"
                            density="compact"
                            variant="outlined"
                            hide-details
                            bg-color="surface"
                            class="filter-select-small"
                            :disabled="authStore.user?.cabang !== 'KDC'"
                          />
                        </div>
                        <v-text-field
                          v-model="searchFastMoving"
                          density="compact"
                          variant="outlined"
                          label="Cari Barang..."
                          prepend-inner-icon="mdi-magnify"
                          hide-details
                          bg-color="surface"
                          single-line
                          class="text-caption"
                          style="min-width: 180px"
                        />
                        <v-btn
                          color="success"
                          variant="tonal"
                          size="small"
                          class="px-2"
                          :disabled="stokKosongFastMovingList.length === 0"
                          @click="exportStokKosongFastMoving"
                        >
                          <v-icon>mdi-file-excel</v-icon>
                          <span class="d-none d-sm-inline ml-1">Export</span>
                        </v-btn>
                      </div>
                    </v-card-title>
                    <v-card-text class="pa-0">
                      <div
                        v-if="isLoadingFastMoving && fastMovingPage === 1"
                        class="text-center pa-8"
                      >
                        <v-progress-circular indeterminate color="deep-orange" size="36" />
                        <div class="mt-2 text-caption">Mencari stok kosong fast moving...</div>
                      </div>
                      <div
                        v-else-if="stokKosongFastMovingList.length === 0"
                        class="text-center pa-8 text-medium-emphasis"
                      >
                        <v-icon size="48" class="mb-2">mdi-check-circle-outline</v-icon>
                        <div class="text-caption">
                          Tidak ada stok kosong dari barang fast moving.
                        </div>
                      </div>
                      <v-data-table
                        v-else
                        :headers="[
                          { title: 'STORE', key: 'nama_cabang', sortable: false },
                          { title: 'KODE', key: 'kode', sortable: false, width: '140px' },
                          { title: 'NAMA BARANG', key: 'nama', sortable: false },
                          {
                            title: 'UK.',
                            key: 'ukuran',
                            align: 'center',
                            sortable: false,
                            width: '70px',
                          },
                          {
                            title: 'TERAKHIR DITERIMA',
                            key: 'last_tstbj',
                            align: 'center',
                            sortable: false,
                            width: '140px',
                          },
                          {
                            title: 'UMUR',
                            key: 'umur_bulan',
                            align: 'center',
                            sortable: false,
                            width: '90px',
                          },
                          {
                            title: 'STOK',
                            key: 'stok_sekarang',
                            align: 'center',
                            sortable: false,
                            width: '80px',
                          },
                        ]"
                        :items="stokKosongFastMovingList"
                        density="compact"
                        hover
                        class="text-caption border-t desktop-table"
                        hide-default-footer
                        :items-per-page="-1"
                        style="max-height: 450px; overflow-y: auto"
                      >
                        <template #[`item.nama_cabang`]="{ item }">
                          <span class="font-weight-bold text-deep-orange-darken-3">{{
                            item.nama_cabang
                          }}</span>
                        </template>
                        <template #[`item.nama`]="{ item }">
                          <span class="font-weight-medium">{{ item.nama }}</span>
                        </template>
                        <template #[`item.last_tstbj`]="{ item }">
                          <span class="text-caption">
                            {{
                              item.last_tstbj
                                ? format(new Date(item.last_tstbj), "dd/MM/yyyy")
                                : "-"
                            }}
                          </span>
                        </template>
                        <template #[`item.umur_bulan`]="{ item }">
                          <v-chip
                            size="x-small"
                            color="orange"
                            variant="tonal"
                            class="font-weight-bold"
                          >
                            {{ item.umur_bulan }} bln
                          </v-chip>
                        </template>
                        <template #[`item.stok_sekarang`]="{ item }">
                          <v-chip
                            size="x-small"
                            color="error"
                            variant="flat"
                            class="font-weight-bold"
                          >
                            {{ item.stok_sekarang }}
                          </v-chip>
                        </template>
                        <template #bottom>
                          <div v-intersect="onIntersectFastMoving" class="pa-3 text-center w-100">
                            <v-progress-circular
                              v-if="isLoadingMoreFastMoving"
                              indeterminate
                              color="deep-orange"
                              size="24"
                              width="3"
                            />
                            <div
                              v-else-if="
                                isFastMovingFinished && stokKosongFastMovingList.length > 0
                              "
                              class="text-caption text-grey"
                            >
                              -- Menampilkan semua {{ stokKosongFastMovingList.length }} barang --
                            </div>
                          </div>
                        </template>
                      </v-data-table>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-tabs-window-item>

            <!-- ══════════════════════════════════════════
               TAB 4 — OPERASIONAL
               Jadwal kirim lengkap + Antrian bordir + Menu gudang
               ══════════════════════════════════════════ -->
            <v-tabs-window-item value="operasional">
              <!-- Jadwal Kirim Lengkap -->
              <v-card elevation="2" class="rounded-lg bg-surface mb-4">
                <v-card-title
                  class="d-flex align-center bg-indigo-lighten-5 text-indigo-darken-4 py-3"
                >
                  <v-icon class="mr-2" color="indigo">mdi-truck-clock</v-icon>
                  <span class="text-subtitle-1 font-weight-bold">Jadwal Kirim ke Toko (SJ)</span>
                  <v-spacer />
                  <v-btn
                    v-if="isWarehouseUser"
                    icon="mdi-plus"
                    size="x-small"
                    color="indigo"
                    variant="flat"
                    @click="isAddScheduleDialog = true"
                  />
                </v-card-title>
                <v-card-text class="pa-0">
                  <v-table density="compact" class="schedule-table">
                    <thead>
                      <tr class="bg-grey-lighten-4">
                        <th class="text-center font-weight-bold" style="width: 80px">KODE</th>
                        <th class="font-weight-bold">STORE</th>
                        <th class="text-center font-weight-bold">KIRIMAN 1</th>
                        <th class="text-center font-weight-bold">KIRIMAN 2</th>
                        <th class="text-center font-weight-bold">STATUS RIIL</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in combinedSchedules" :key="item.kode">
                        <td class="text-center font-weight-bold text-grey-darken-2">
                          {{ item.kode }}
                        </td>
                        <td class="font-weight-medium">{{ item.nama }}</td>
                        <td class="text-center text-caption">{{ item.k1 }}</td>
                        <td class="text-center text-caption">{{ item.k2 }}</td>
                        <td class="text-center">
                          <div
                            v-if="item.activeShipment"
                            class="d-flex align-center justify-center ga-1"
                          >
                            <v-icon
                              :icon="getStatusIcon(item.activeShipment.status)"
                              :color="getStatusColor(item.activeShipment.status)"
                              size="16"
                            />
                            <v-chip
                              :color="getStatusColor(item.activeShipment.status)"
                              size="x-small"
                              variant="flat"
                              class="font-weight-bold"
                              >{{ item.activeShipment.status }}</v-chip
                            >
                            <v-menu transition="scale-transition">
                              <template v-slot:activator="{ props }">
                                <v-btn
                                  icon="mdi-pencil"
                                  variant="text"
                                  size="x-small"
                                  v-bind="props"
                                />
                              </template>
                              <v-list density="compact">
                                <v-list-item
                                  v-for="st in ['Antri', 'Packing', 'Kirim', 'Selesai']"
                                  :key="st"
                                  @click="updateStatus(item.activeShipment!.id!, st as any)"
                                >
                                  <v-list-item-title>{{ st }}</v-list-item-title>
                                </v-list-item>
                              </v-list>
                            </v-menu>
                          </div>
                          <span v-else class="text-caption text-grey-lighten-1">-</span>
                        </td>
                      </tr>
                      <tr
                        v-for="extra in extraShipments"
                        :key="extra.id"
                        class="bg-amber-lighten-5"
                      >
                        <td class="text-center font-weight-bold">{{ extra.cabang_tujuan }}</td>
                        <td>
                          <div class="font-weight-bold">{{ extra.nama_cabang }}</div>
                          <div class="text-caption text-error font-italic">
                            (Tambahan Luar Jadwal)
                          </div>
                        </td>
                        <td colspan="2" class="text-center text-caption">
                          Tgl: {{ format(new Date(extra.tanggal_kirim), "dd/MM") }}
                        </td>
                        <td class="text-center">
                          <v-chip
                            :color="getStatusColor(extra.status)"
                            size="x-small"
                            variant="flat"
                            >{{ extra.status }}</v-chip
                          >
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                  <div v-if="isLoadingSchedules" class="text-center pa-4">
                    <v-progress-circular indeterminate color="indigo" size="20" />
                  </div>
                </v-card-text>
              </v-card>

              <!-- Auto Minta Analytics -->
              <v-card elevation="2" class="rounded-lg bg-surface mb-4">
                <v-card-title
                  class="d-flex flex-wrap align-center bg-blue-grey-lighten-5 py-3 text-blue-grey-darken-3 gap-2"
                >
                  <v-icon class="mr-2" color="blue-grey-darken-1">mdi-robot-outline</v-icon>
                  <span class="text-subtitle-1 font-weight-bold"
                    >Analisis Permintaan Otomatis (Auto Replenishment)</span
                  >

                  <v-spacer />

                  <div
                    class="d-flex align-center border rounded px-2 bg-white"
                    style="height: 32px; border-color: #cfd8dc !important"
                  >
                    <input
                      type="date"
                      v-model="autoMintaFilter.startDate"
                      class="date-native-input text-caption text-blue-grey-darken-3 font-weight-bold"
                    />
                    <span class="mx-1 text-caption text-medium-emphasis">s/d</span>
                    <input
                      type="date"
                      v-model="autoMintaFilter.endDate"
                      class="date-native-input text-caption text-blue-grey-darken-3 font-weight-bold"
                    />
                  </div>

                  <div v-if="authStore.user?.cabang === 'KDC'" style="width: 140px">
                    <v-select
                      v-model="autoMintaFilter.cabang"
                      :items="cabangList"
                      item-title="nama"
                      item-value="kode"
                      density="compact"
                      variant="outlined"
                      hide-details
                      bg-color="white"
                      class="filter-select-small"
                    />
                  </div>
                </v-card-title>

                <v-card-text class="pa-4">
                  <div v-if="isLoadingAutoMinta" class="text-center pa-8">
                    <v-progress-circular indeterminate color="blue-grey" size="40" />
                  </div>
                  <div v-else>
                    <v-row dense class="mb-4">
                      <v-col cols="12" md="4">
                        <v-card variant="outlined" class="text-center pa-3 bg-grey-lighten-5">
                          <div class="text-caption text-medium-emphasis text-uppercase mb-1">
                            Total Cabang Automasi
                          </div>
                          <div class="text-h5 font-weight-black text-blue-grey-darken-3">
                            {{ autoMintaData.length }}
                            <span class="text-caption font-weight-medium">Cabang</span>
                          </div>
                        </v-card>
                      </v-col>
                      <v-col cols="12" md="4">
                        <v-card
                          variant="outlined"
                          class="text-center pa-3 bg-blue-lighten-5 border-blue-lighten-3"
                        >
                          <div class="text-caption text-medium-emphasis text-uppercase mb-1">
                            Avg. Realisasi DC
                          </div>
                          <div class="text-h5 font-weight-black text-blue-darken-2">
                            {{ autoMintaAvgPacking }}%
                          </div>
                        </v-card>
                      </v-col>
                      <v-col cols="12" md="4">
                        <v-card
                          variant="outlined"
                          class="text-center pa-3 bg-green-lighten-5 border-green-lighten-3"
                        >
                          <div class="text-caption text-medium-emphasis text-uppercase mb-1">
                            Avg. Terkirim (SJ)
                          </div>
                          <div class="text-h5 font-weight-black text-green-darken-2">
                            {{ autoMintaAvgSj }}%
                          </div>
                        </v-card>
                      </v-col>
                    </v-row>

                    <div class="mb-6" style="height: 250px; position: relative">
                      <Line
                        v-if="autoMintaData.length > 0"
                        :data="autoMintaChartData as any"
                        :options="autoMintaChartOptions as any"
                      />
                    </div>

                    <v-data-table
                      :headers="autoMintaHeaders"
                      :items="autoMintaData"
                      density="compact"
                      hover
                      class="border rounded-lg text-caption"
                    >
                      <template #[`item.nama_cabang`]="{ item }">
                        <div class="font-weight-bold">{{ item.nama_cabang }}</div>
                        <div class="text-grey" style="font-size: 10px">{{ item.kode_cabang }}</div>
                      </template>

                      <template #[`item.qty_minta`]="{ item }">
                        <div class="font-weight-black">
                          {{ Number(item.qty_minta).toLocaleString("id-ID") }} pcs
                        </div>
                      </template>

                      <template #[`item.qty_packed`]="{ item }">
                        <div class="font-weight-bold text-blue-darken-3">
                          {{ Number(item.qty_packed).toLocaleString("id-ID") }} pcs
                        </div>
                      </template>

                      <template #[`item.ratio_packing`]="{ item }">
                        <div class="d-flex align-center justify-center w-100">
                          <span
                            class="mr-2 font-weight-bold"
                            :class="`text-${getRatioColor(item.ratio_packing)}`"
                            style="width: 40px; text-align: right"
                          >
                            {{ item.ratio_packing }}%
                          </span>
                          <v-progress-linear
                            :model-value="item.ratio_packing"
                            :color="getRatioColor(item.ratio_packing)"
                            height="6"
                            rounded
                            style="max-width: 100px"
                          />
                        </div>
                      </template>

                      <template #[`item.qty_sent`]="{ item }">
                        <div class="font-weight-bold text-green-darken-3">
                          {{ Number(item.qty_sent).toLocaleString("id-ID") }} pcs
                        </div>
                      </template>

                      <template #[`item.ratio_sj`]="{ item }">
                        <div class="d-flex align-center justify-center w-100">
                          <span
                            class="mr-2 font-weight-bold"
                            :class="`text-${getRatioColor(item.ratio_sj)}`"
                            style="width: 40px; text-align: right"
                          >
                            {{ item.ratio_sj }}%
                          </span>
                          <v-progress-linear
                            :model-value="item.ratio_sj"
                            :color="getRatioColor(item.ratio_sj)"
                            height="6"
                            rounded
                            style="max-width: 100px"
                          />
                        </div>
                      </template>
                    </v-data-table>
                  </div>
                </v-card-text>
              </v-card>

              <!-- Antrian Bordir -->
              <v-card elevation="2" class="rounded-lg bg-surface mb-4">
                <v-card-title
                  class="d-flex flex-wrap align-center bg-deep-purple-lighten-5 py-3 text-deep-purple-darken-4 gap-2"
                >
                  <v-icon class="mr-2" color="deep-purple">mdi-tshirt-crew</v-icon>
                  <span class="text-subtitle-1 font-weight-bold">Monitoring Antrian Bordir</span>
                  <v-spacer />
                  <div
                    class="d-flex align-center border rounded px-2 bg-white"
                    style="height: 32px; border-color: #d1c4e9 !important"
                  >
                    <input
                      type="date"
                      v-model="bordirFilter.startDate"
                      class="date-native-input text-caption text-deep-purple-darken-4 font-weight-bold"
                    />
                    <span class="mx-1 text-caption text-medium-emphasis">s/d</span>
                    <input
                      type="date"
                      v-model="bordirFilter.endDate"
                      class="date-native-input text-caption text-deep-purple-darken-4 font-weight-bold"
                    />
                  </div>
                  <v-chip size="small" color="deep-purple" variant="flat" class="ml-1"
                    >{{ bordirSchedules.length }} Antrian</v-chip
                  >
                </v-card-title>
                <v-card-text class="pa-0">
                  <div v-if="isLoadingBordir" class="text-center pa-4">
                    <v-progress-circular indeterminate color="deep-purple" size="24" />
                  </div>
                  <v-table v-else density="compact" class="schedule-table" hover>
                    <thead>
                      <tr class="bg-grey-lighten-4">
                        <th class="font-weight-bold">SO BORDIR</th>
                        <th class="font-weight-bold">TGL SO</th>
                        <th class="font-weight-bold">CUSTOMER</th>
                        <th class="text-center font-weight-bold">JML KAOS</th>
                        <th class="text-center font-weight-bold">MASUK WORKSHOP</th>
                        <th class="text-center font-weight-bold">Mulai Pengerjaan</th>
                        <th class="text-center font-weight-bold">Deadline</th>
                        <th class="text-center font-weight-bold">STATUS</th>
                        <th class="font-weight-bold">ALASAN PENDING</th>
                        <th v-if="canEditBordir" class="text-center font-weight-bold" width="60">
                          AKSI
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in bordirSchedules" :key="item.so_nomor">
                        <td class="font-weight-bold text-deep-purple-darken-2">
                          {{ item.so_nomor }}
                        </td>
                        <td class="text-caption">
                          {{ format(new Date(item.tanggal_so), "dd/MM/yyyy") }}
                        </td>
                        <td class="text-caption font-weight-medium">{{ item.customer }}</td>
                        <td class="text-center font-weight-bold">{{ item.jumlah_kaos }} pcs</td>
                        <td class="text-center font-weight-bold">
                          <v-chip
                            size="x-small"
                            :color="
                              item.masuk_workshop >= item.jumlah_kaos
                                ? 'success'
                                : item.masuk_workshop > 0
                                ? 'warning'
                                : 'grey'
                            "
                            variant="flat"
                          >
                            {{ item.masuk_workshop }} / {{ item.jumlah_kaos }}
                          </v-chip>
                        </td>
                        <td class="text-center text-caption">
                          {{
                            item.tgl_pengerjaan
                              ? format(new Date(item.tgl_pengerjaan), "dd/MM/yyyy")
                              : "-"
                          }}
                        </td>
                        <td
                          class="text-center text-caption font-weight-bold"
                          :class="item.deadline ? 'text-error' : ''"
                        >
                          {{ item.deadline ? format(new Date(item.deadline), "dd/MM/yyyy") : "-" }}
                        </td>
                        <td class="text-center">
                          <v-chip
                            size="x-small"
                            :color="getStatusColor(item.status)"
                            variant="flat"
                            class="font-weight-bold"
                            >{{ item.status }}</v-chip
                          >
                        </td>
                        <td class="text-caption text-error font-italic">
                          {{ item.alasan_pending || "-" }}
                        </td>
                        <td v-if="canEditBordir" class="text-center">
                          <v-btn
                            icon="mdi-pencil"
                            variant="text"
                            size="x-small"
                            color="primary"
                            @click="openEditBordir(item)"
                          />
                        </td>
                      </tr>
                      <tr v-if="bordirSchedules.length === 0">
                        <td
                          :colspan="canEditBordir ? 9 : 8"
                          class="text-center text-caption text-grey py-4"
                        >
                          Belum ada antrian bordir terbaru.
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-card-text>
              </v-card>

              <!-- SPK Pending Approval (KDC only) -->
              <v-card
                v-if="authStore.user?.cabang === 'KDC'"
                elevation="2"
                class="rounded-lg bg-surface mb-4"
              >
                <v-card-title
                  class="d-flex flex-wrap align-center bg-cyan-lighten-5 py-3 text-cyan-darken-4 gap-2"
                >
                  <v-icon class="mr-2" color="cyan-darken-2"
                    >mdi-file-document-check-outline</v-icon
                  >
                  <span class="text-subtitle-1 font-weight-bold">SPK Belum Diapprove</span>
                  <v-spacer />
                  <div
                    class="d-flex align-center border rounded px-2 bg-white"
                    style="height: 32px; border-color: #b2ebf2 !important"
                  >
                    <input
                      type="date"
                      v-model="spkPendingFilter.startDate"
                      class="date-native-input text-caption text-cyan-darken-4 font-weight-bold"
                    />
                    <span class="mx-1 text-caption text-medium-emphasis">s/d</span>
                    <input
                      type="date"
                      v-model="spkPendingFilter.endDate"
                      class="date-native-input text-caption text-cyan-darken-4 font-weight-bold"
                    />
                  </div>
                  <v-chip size="small" color="cyan-darken-2" variant="flat" class="ml-1">
                    {{ spkPendingList.length }} SPK
                  </v-chip>
                </v-card-title>

                <v-card-text class="pa-0">
                  <div v-if="isLoadingSpkPending" class="text-center pa-4">
                    <v-progress-circular indeterminate color="cyan-darken-2" size="24" />
                  </div>
                  <v-table v-else density="compact" class="schedule-table" hover>
                    <thead>
                      <tr class="bg-grey-lighten-4">
                        <th class="font-weight-bold">NO. SPK</th>
                        <th class="font-weight-bold">TGL SPK</th>
                        <th class="font-weight-bold">NAMA SPK</th>
                        <th class="text-center font-weight-bold">JML</th>
                        <th class="text-center font-weight-bold">DATELINE</th>
                        <th class="text-center font-weight-bold">CABANG</th>
                        <th class="text-center font-weight-bold">USER</th>
                        <th class="text-center font-weight-bold">STATUS</th>
                        <th class="font-weight-bold">KETERANGAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in spkPendingList" :key="item.spk_nomor">
                        <td class="font-weight-bold text-cyan-darken-3" style="font-size: 11px">
                          {{ item.spk_nomor }}
                        </td>
                        <td class="text-caption">
                          {{ format(new Date(item.spk_tanggal), "dd/MM/yyyy") }}
                        </td>
                        <td class="text-caption font-weight-medium" style="max-width: 220px">
                          <div class="text-truncate" :title="item.nama_desain">
                            {{ item.nama_desain }}
                          </div>
                        </td>
                        <td class="text-center font-weight-bold text-caption">
                          {{ Number(item.jumlah).toLocaleString("id-ID") }} pcs
                        </td>
                        <td
                          class="text-center text-caption font-weight-bold"
                          :class="item.spk_dateline ? 'text-error' : 'text-grey'"
                        >
                          {{
                            item.spk_dateline
                              ? format(new Date(item.spk_dateline), "dd/MM/yyyy")
                              : "-"
                          }}
                        </td>
                        <td class="text-center">
                          <v-chip
                            size="x-small"
                            color="blue-grey"
                            variant="tonal"
                            class="font-weight-bold"
                          >
                            {{ item.cabang || "-" }}
                          </v-chip>
                        </td>
                        <td class="text-center text-caption font-weight-medium">
                          {{ item.user_create }}
                        </td>
                        <td class="text-center">
                          <v-chip
                            size="x-small"
                            :color="
                              item.status_kerja === 'TOP URGENT'
                                ? 'error'
                                : item.status_kerja === 'URGENT'
                                ? 'warning'
                                : item.status_kerja === 'STANDART'
                                ? 'info'
                                : item.status_kerja === 'REGULER'
                                ? 'success'
                                : 'grey'
                            "
                            variant="flat"
                            class="font-weight-bold"
                          >
                            {{ item.status_kerja || "REGULER" }}
                          </v-chip>
                        </td>
                        <td class="text-caption text-grey font-italic" style="max-width: 150px">
                          <div
                            class="text-truncate"
                            :title="item.ket_pending || item.spk_keterangan"
                          >
                            {{ item.ket_pending || item.spk_keterangan || "-" }}
                          </div>
                        </td>
                      </tr>
                      <tr v-if="spkPendingList.length === 0">
                        <td colspan="9" class="text-center text-caption text-grey py-4">
                          Tidak ada SPK yang belum diapprove pada periode ini.
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-card-text>
              </v-card>

              <!-- Menu Gudang (warehouse user) -->
              <v-card v-if="isWarehouseUser" class="bg-surface mb-4" elevation="2">
                <v-card-title
                  class="d-flex align-center bg-blue-grey-lighten-5 text-blue-grey-darken-3 py-2"
                >
                  <v-icon class="mr-2" color="primary" size="small">mdi-warehouse</v-icon>
                  <span class="text-subtitle-2 font-weight-bold">Menu Operasional Gudang</span>
                </v-card-title>
                <v-card-text class="pa-4">
                  <v-row class="justify-start" dense>
                    <v-col
                      v-for="menu in frequentMenus"
                      :key="menu.title"
                      cols="4"
                      sm="3"
                      md="2"
                      class="text-center pa-2"
                    >
                      <v-tooltip :text="menu.title" location="bottom">
                        <template v-slot:activator="{ props }">
                          <v-btn
                            v-bind="props"
                            :to="menu.to"
                            :color="menu.color"
                            icon
                            size="large"
                            variant="flat"
                            class="mb-1 transition-swing"
                            elevation="2"
                          >
                            <v-icon size="24">{{ menu.icon || "mdi-star" }}</v-icon>
                          </v-btn>
                        </template>
                      </v-tooltip>
                      <div
                        class="text-caption text-medium-emphasis font-weight-medium text-truncate px-1"
                        style="font-size: 0.7rem"
                      >
                        {{ menu.title }}
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>
            </v-tabs-window-item>

            <!-- ══════════════════════════════════════════
               TAB 5 — KEUANGAN
               Setoran, cashflow, piutang
               ══════════════════════════════════════════ -->
            <v-tabs-window-item v-if="!isWarehouseUser" value="keuangan">
              <v-row v-if="authStore.user?.cabang === 'KDC'" class="mb-4">
                <v-col cols="12" class="pb-0">
                  <div class="d-flex align-center">
                    <v-icon color="deep-purple" class="mr-2">mdi-finance</v-icon>
                    <span class="text-subtitle-1 font-weight-bold"
                      >Executive Dashboard Keuangan</span
                    >
                    <v-spacer></v-spacer>
                    <input
                      type="date"
                      v-model="cashflowDate"
                      class="text-caption border rounded px-2 py-1 bg-white"
                      style="outline: none; border-color: #e0e0e0"
                    />
                  </div>
                </v-col>

                <v-col cols="12" sm="6" lg="3">
                  <v-card elevation="2" class="rounded-lg fill-height" border="start info 4">
                    <v-card-text class="pa-4">
                      <div class="d-flex justify-space-between align-center mb-2">
                        <span class="text-subtitle-2 text-medium-emphasis">Penjualan (Omset)</span>
                        <v-icon color="info" size="24">mdi-cart-outline</v-icon>
                      </div>
                      <div v-if="isLoadingCashflow" class="text-center py-2">
                        <v-progress-circular indeterminate color="info" size="24" />
                      </div>
                      <div v-else class="text-h5 font-weight-black text-info-darken-1">
                        {{ formatRupiah(labaData.omset) }}
                      </div>
                      <v-divider class="my-2"></v-divider>
                      <div class="d-flex justify-space-between align-center text-caption">
                        <span class="text-grey-darken-1">Kas Riil Diterima:</span>
                        <span class="font-weight-bold text-success">{{
                          formatRupiah(labaData.kasAktual)
                        }}</span>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6" lg="3">
                  <v-card elevation="2" class="rounded-lg fill-height" border="start success 4">
                    <v-card-text class="pa-4">
                      <div class="d-flex justify-space-between align-center mb-2">
                        <span class="text-subtitle-2 text-medium-emphasis">Laba Kotor</span>
                        <v-chip
                          size="x-small"
                          color="success"
                          variant="flat"
                          class="font-weight-bold"
                          >{{ labaData.margin }}%</v-chip
                        >
                      </div>
                      <div v-if="isLoadingCashflow" class="text-center py-2">
                        <v-progress-circular indeterminate color="success" size="24" />
                      </div>
                      <div v-else class="text-h5 font-weight-black text-success-darken-2">
                        {{ formatRupiah(labaData.labaKotor) }}
                      </div>
                      <v-divider class="my-2"></v-divider>
                      <div class="d-flex justify-space-between align-center text-caption">
                        <span class="text-grey-darken-1">Modal HPP:</span>
                        <span class="font-weight-bold">{{ formatRupiah(labaData.hpp) }}</span>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6" lg="3">
                  <v-card elevation="2" class="rounded-lg fill-height" border="start warning 4">
                    <v-card-text class="pa-4">
                      <div class="d-flex justify-space-between align-center mb-2">
                        <span class="text-subtitle-2 text-medium-emphasis">Operasional (PC)</span>
                        <v-icon color="warning" size="24">mdi-store-minus</v-icon>
                      </div>
                      <div v-if="isLoadingCashflow" class="text-center py-2">
                        <v-progress-circular indeterminate color="warning" size="24" />
                      </div>
                      <div v-else class="text-h5 font-weight-black text-warning-darken-2">
                        {{ formatRupiah(labaData.pengeluaran) }}
                      </div>
                      <v-divider class="my-2"></v-divider>
                      <div class="d-flex justify-space-between align-center text-caption">
                        <span class="text-grey-darken-1">Biaya harian toko</span>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6" lg="3">
                  <v-card
                    elevation="2"
                    class="rounded-lg fill-height"
                    border="start deep-purple 4"
                    :color="labaData.labaBersih < 0 ? 'red-lighten-5' : 'deep-purple-lighten-5'"
                  >
                    <v-card-text class="pa-4">
                      <div class="d-flex justify-space-between align-center mb-2">
                        <span
                          class="text-subtitle-2 font-weight-bold"
                          :class="
                            labaData.labaBersih < 0 ? 'text-error' : 'text-deep-purple-darken-2'
                          "
                          >Laba Bersih (Net)</span
                        >
                        <v-icon :color="labaData.labaBersih < 0 ? 'error' : 'deep-purple'" size="24"
                          >mdi-cash-fast</v-icon
                        >
                      </div>
                      <div v-if="isLoadingCashflow" class="text-center py-2">
                        <v-progress-circular indeterminate color="deep-purple" size="24" />
                      </div>
                      <div
                        v-else
                        class="text-h5 font-weight-black"
                        :class="
                          labaData.labaBersih < 0 ? 'text-error' : 'text-deep-purple-darken-2'
                        "
                      >
                        {{ formatRupiah(labaData.labaBersih) }}
                      </div>
                      <v-divider class="my-2 border-opacity-50"></v-divider>
                      <div class="d-flex justify-space-between align-center text-caption">
                        <span class="text-grey-darken-2">Basket Size:</span>
                        <span class="font-weight-black text-deep-purple-darken-4"
                          >{{ formatRupiah(labaData.basketSize) }} /nota</span
                        >
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>

              <!-- Piutang (KDC: per cabang, toko: per invoice) -->
              <v-row class="mb-4">
                <v-col cols="12" md="6">
                  <v-card elevation="2" class="bg-surface fill-height">
                    <v-card-title
                      class="d-flex align-center bg-orange-lighten-5 text-orange-darken-4 py-2"
                    >
                      <v-icon class="mr-2" color="orange-darken-1" size="small"
                        >mdi-clock-alert-outline</v-icon
                      >
                      <span class="text-subtitle-2 font-weight-bold">{{
                        authStore.user?.cabang === "KDC"
                          ? "Piutang per Cabang"
                          : "Invoice Belum Lunas"
                      }}</span>
                      <v-spacer />
                      <span
                        v-if="authStore.user?.cabang === 'KDC'"
                        class="text-caption font-italic text-grey"
                        style="font-size: 10px"
                        >*Klik cabang untuk lihat rincian</span
                      >
                    </v-card-title>

                    <v-card-text class="pa-0">
                      <div
                        v-if="isLoadingPiutangBreakdown || isLoadingPiutangInvoice"
                        class="text-center pa-6"
                      >
                        <v-progress-circular indeterminate color="orange" size="36" />
                      </div>

                      <v-list
                        v-else-if="authStore.user?.cabang === 'KDC'"
                        density="compact"
                        class="py-0"
                        style="max-height: 300px; overflow-y: auto"
                      >
                        <v-list-item
                          v-for="item in piutangBreakdown"
                          :key="item.cabang_kode"
                          density="compact"
                          class="px-4 py-2 border-b cursor-pointer transition-swing"
                          :class="{
                            'bg-orange-lighten-4': selectedCabangPiutang === item.cabang_kode,
                          }"
                          @click="fetchPiutangDetailsForKdc(item.cabang_kode)"
                        >
                          <v-list-item-title class="text-caption font-weight-medium">
                            {{ item.cabang_nama }}
                          </v-list-item-title>
                          <template #append>
                            <span class="text-caption font-weight-bold text-orange-darken-2">
                              {{ formatRupiah(item.sisa_piutang) }}
                            </span>
                            <v-icon size="small" color="grey" class="ml-1"
                              >mdi-chevron-right</v-icon
                            >
                          </template>
                        </v-list-item>
                      </v-list>

                      <v-list
                        v-else
                        density="compact"
                        class="py-0"
                        style="max-height: 300px; overflow-y: auto"
                      >
                        <v-list-item
                          v-for="inv in piutangByInvoice"
                          :key="inv.invoice"
                          density="compact"
                          class="px-4 py-2 border-b"
                        >
                          <div class="d-flex justify-space-between w-100">
                            <div
                              class="d-flex flex-column text-truncate pr-2"
                              style="max-width: 60%"
                            >
                              <span class="text-caption font-weight-bold">{{ inv.invoice }}</span>
                              <span
                                class="text-caption text-grey text-truncate"
                                style="font-size: 0.65rem"
                              >
                                {{ inv.tanggal }} • {{ inv.customer_nama || "UMUM" }}
                              </span>
                            </div>
                            <span class="text-caption font-weight-bold text-orange-darken-2">
                              {{ formatRupiah(inv.sisa_piutang) }}
                            </span>
                          </div>
                        </v-list-item>
                      </v-list>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" md="6">
                  <v-card elevation="2" class="bg-surface fill-height d-flex flex-column">
                    <div v-if="selectedCabangPiutang" class="d-flex flex-column h-100">
                      <div
                        class="bg-orange-darken-2 px-4 py-2 d-flex justify-space-between align-center"
                      >
                        <span class="text-caption font-weight-bold text-white">
                          <v-icon size="small" color="white" class="mr-1"
                            >mdi-file-document-multiple</v-icon
                          >
                          Rincian Invoice:
                          {{
                            piutangBreakdown.find((c) => c.cabang_kode === selectedCabangPiutang)
                              ?.cabang_nama
                          }}
                        </span>
                        <v-btn
                          icon="mdi-close"
                          size="x-small"
                          variant="text"
                          color="white"
                          @click="selectedCabangPiutang = ''"
                        />
                      </div>

                      <v-card-text
                        class="pa-0 flex-grow-1"
                        style="max-height: 260px; overflow-y: auto"
                      >
                        <div v-if="isLoadingPiutangDetails" class="text-center pa-6">
                          <v-progress-circular indeterminate color="orange" size="24" />
                        </div>
                        <div
                          v-else-if="piutangInvoiceDetails.length === 0"
                          class="text-center pa-6 text-grey text-caption"
                        >
                          Tidak ada invoice menggantung.
                        </div>
                        <v-list v-else density="compact" class="py-0">
                          <v-list-item
                            v-for="inv in piutangInvoiceDetails"
                            :key="inv.invoice"
                            class="px-4 py-2 border-b"
                          >
                            <div class="d-flex justify-space-between w-100 align-center">
                              <div
                                class="d-flex flex-column text-truncate pr-2"
                                style="max-width: 65%"
                              >
                                <span class="text-caption font-weight-bold text-blue-darken-3">{{
                                  inv.invoice
                                }}</span>

                                <span
                                  class="text-caption text-grey text-truncate"
                                  style="font-size: 0.65rem"
                                >
                                  {{ inv.tanggal }} &bull;
                                  <strong class="text-grey-darken-2">{{
                                    inv.customer_nama || "UMUM"
                                  }}</strong>
                                </span>
                              </div>
                              <span class="text-caption font-weight-bold text-error">
                                {{ formatRupiah(inv.sisa_piutang) }}
                              </span>
                            </div>
                          </v-list-item>
                        </v-list>
                      </v-card-text>
                    </div>

                    <div v-else class="h-100 d-flex flex-column justify-center align-center pa-8">
                      <v-icon size="56" color="orange-lighten-2" class="mb-4"
                        >mdi-cash-clock</v-icon
                      >
                      <div class="text-h4 font-weight-bold text-orange-darken-2 mb-2">
                        {{ formatRupiah(Number(animatedPiutang.toFixed(0))) }}
                      </div>
                      <div class="text-subtitle-2 text-medium-emphasis">
                        Total Sisa Piutang Global
                      </div>
                    </div>
                  </v-card>
                </v-col>
              </v-row>
            </v-tabs-window-item>
          </v-tabs-window>
          <!-- ── END TABS WINDOW ── -->
        </div>
      </div>

      <!-- BARU: Shortcut ke Ringkasan Kerja -->
      <div class="swipe-hint" @click="router.push({ name: 'WorkSummary' })">
        <v-icon size="18">mdi-chevron-right</v-icon>
        <span class="text-caption">Ringkasan Kerja</span>
      </div>

      <!-- LOST ORDER -->
      <v-hover v-if="authStore.user?.cabang !== 'KDC'" v-slot="{ isHovering, props }">
        <v-btn
          v-bind="props"
          color="red-darken-2"
          icon="mdi-account-cancel-outline"
          size="large"
          position="fixed"
          location="bottom right"
          class="mr-6 floating-review-btn"
          style="margin-bottom: 140px; z-index: 100"
          :elevation="isHovering ? 12 : 4"
          @click="openLostOrder"
        >
          <v-icon :class="{ 'swing-animation': isHovering }" size="28"
            >mdi-account-cancel-outline</v-icon
          >
          <v-tooltip activator="parent" location="left">Catat Lost Order</v-tooltip>
        </v-btn>
      </v-hover>

      <!-- FLOATING BUTTON GOOGLE MAPS REVIEW -->
      <v-hover v-slot="{ isHovering, props }">
        <v-btn
          v-if="userPlaceId"
          v-bind="props"
          color="orange-darken-3"
          icon="mdi-google-maps"
          size="large"
          position="fixed"
          location="bottom right"
          class="mb-16 mr-6 floating-review-btn"
          :elevation="isHovering ? 12 : 4"
          @click="showReviewDialog = true"
        >
          <v-icon :class="{ 'swing-animation': isHovering }" size="32">mdi-google-maps</v-icon>
          <v-tooltip activator="parent" location="left">Lihat Review Google Maps Toko</v-tooltip>
        </v-btn>
      </v-hover>

      <v-hover v-if="authStore.user?.cabang === 'KDC'" v-slot="{ isHovering, props }">
        <v-btn
          v-bind="props"
          color="deep-purple-darken-1"
          icon="mdi-robot-outline"
          size="large"
          position="fixed"
          location="bottom right"
          class="mr-6 floating-ai-btn"
          style="margin-bottom: 220px; z-index: 100"
          :elevation="isHovering ? 12 : 6"
          @click="showAiDialog = true"
        >
          <div class="ai-icon-wrapper" :class="{ 'ai-pulse-active': !isHovering }">
            <v-icon :class="{ 'ai-bounce-animation': isHovering }" size="32"
              >mdi-robot-outline</v-icon
            >
          </div>
          <v-tooltip activator="parent" location="left">Tanya Kaosan AI</v-tooltip>
        </v-btn>
      </v-hover>
    </v-container>
  </div>

  <!-- ============================================================
       DIALOG — Google Maps Review
       ============================================================ -->
  <v-dialog v-model="showReviewDialog" max-width="900" transition="dialog-bottom-transition">
    <v-card class="rounded-xl overflow-hidden">
      <v-toolbar color="orange-darken-3" density="compact">
        <v-icon start class="ml-4">mdi-google-maps</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold"
          >Lokasi & Review — {{ authStore.userCabangNama }}</v-toolbar-title
        >
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="showReviewDialog = false" />
      </v-toolbar>
      <v-card-text class="pa-0 bg-grey-lighten-4">
        <div style="height: 400px; width: 100%; position: relative">
          <iframe
            v-if="userLat && userLong"
            :src="`https://maps.google.com/maps?q=${userLat},${userLong}&t=&z=17&ie=UTF8&iwloc=&output=embed`"
            width="100%"
            height="100%"
            style="border: 0"
            allowfullscreen
            loading="lazy"
          />
          <div v-else class="d-flex align-center justify-center fill-height bg-grey-lighten-3">
            <div class="text-center">
              <v-icon size="48" color="grey">mdi-map-marker-off</v-icon>
              <div class="text-caption mt-2">Koordinat lokasi belum diset di database</div>
            </div>
          </div>
        </div>
        <div class="pa-6 text-center bg-white">
          <h3 class="text-h6 font-weight-bold mb-1">Cek Review Pelanggan</h3>
          <p class="text-caption text-medium-emphasis mb-4">
            Google Maps membatasi tampilan ulasan di aplikasi pihak ketiga.<br />Klik tombol di
            bawah untuk membaca ulasan lengkap.
          </p>
          <div class="d-flex flex-column flex-sm-row justify-center ga-3">
            <v-btn
              color="orange-darken-3"
              prepend-icon="mdi-star-face"
              class="font-weight-bold px-6"
              rounded="lg"
              :href="googleReviewUrl"
              target="_blank"
              >Lihat Review Lengkap</v-btn
            >
            <v-btn
              color="blue-darken-2"
              variant="outlined"
              prepend-icon="mdi-pencil-plus"
              class="font-weight-bold px-6"
              rounded="lg"
              :href="googleReviewUrl"
              target="_blank"
              >Tulis Review Baru</v-btn
            >
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>

  <!-- ============================================================
       DIALOG — Pareto Detail
       ============================================================ -->
  <v-dialog v-model="showParetoDetail" max-width="1100" transition="dialog-bottom-transition">
    <v-card class="rounded-lg d-flex flex-column bg-white">
      <!-- Toolbar Lebih Bersih -->
      <v-toolbar class="pareto-dialog-header" elevation="0" density="compact">
        <v-icon color="primary" class="ml-4 mr-2">mdi-chart-bar-stacked</v-icon>
        <v-toolbar-title class="font-weight-bold text-subtitle-1"
          >Analisa Stok Pareto</v-toolbar-title
        >
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          color="grey-darken-1"
          @click="showParetoDetail = false"
        />
      </v-toolbar>

      <!-- Panel Filter -->
      <div class="bg-grey-lighten-4 pa-3 border-b">
        <div class="d-flex flex-wrap gap-2 align-center">
          <v-btn-toggle
            v-model="filterPareto"
            density="compact"
            color="primary"
            divided
            variant="outlined"
            class="bg-white rounded-lg"
          >
            <v-btn value="ALL" class="text-caption font-weight-bold px-3">Semua</v-btn>
            <v-btn value="KRITIS" class="text-caption font-weight-bold px-3 text-error"
              >Kritis</v-btn
            >
            <v-btn value="AMAN" class="text-caption font-weight-bold px-3 text-success">Aman</v-btn>
            <v-btn value="OVER" class="text-caption font-weight-bold px-3 text-warning"
              >Berlebih</v-btn
            >
          </v-btn-toggle>

          <v-spacer />

          <v-text-field
            v-model="searchPareto"
            prepend-inner-icon="mdi-magnify"
            placeholder="Cari..."
            density="compact"
            variant="outlined"
            bg-color="white"
            hide-details
            style="max-width: 250px"
            class="text-caption"
          />
        </div>
      </div>

      <!-- Tabel -->
      <v-card-text class="pa-0 flex-grow-1" style="overflow-y: auto">
        <v-data-table
          :headers="paretoHeaders"
          :items="paginatedParetoItems"
          :loading="isLoadingParetoDetail"
          :item-value="(item) => `${item.kode}-${item.ukuran}`"
          :show-expand="authStore.user?.cabang === 'KDC'"
          hover
          density="compact"
          class="pareto-table elevation-0"
          hide-default-footer
          :items-per-page="-1"
        >
          <template #[`item.rank`]="{ item }">
            <div class="font-weight-black text-h6 text-grey-lighten-1">#{{ item.rank }}</div>
          </template>

          <template #[`item.nama`]="{ item }">
            <div class="py-2">
              <div class="font-weight-bold text-body-2 text-high-emphasis">{{ item.nama }}</div>
              <div class="d-flex align-center mt-1">
                <v-chip
                  size="x-small"
                  color="grey-lighten-3"
                  class="mr-2 font-weight-bold text-grey-darken-3"
                >
                  {{ item.kode }}
                </v-chip>
                <v-chip
                  size="x-small"
                  color="blue-lighten-5"
                  class="font-weight-bold text-blue-darken-3"
                >
                  {{ item.ukuran }}
                </v-chip>
              </div>
            </div>
          </template>

          <template #[`item.stok`]="{ item }">
            <div class="text-right">
              <div
                class="font-weight-bold text-body-1"
                :class="{ 'text-error': item.stok < item.target }"
              >
                {{ item.stok.toLocaleString() }}
              </div>
              <div class="text-caption text-grey">Pcs</div>
            </div>
          </template>

          <template #[`item.target`]="{ item }">
            <div class="text-right">
              <div class="font-weight-medium text-body-2">{{ item.target.toLocaleString() }}</div>
              <div class="text-caption text-grey">Min</div>
            </div>
          </template>

          <template #[`item.status`]="{ item }">
            <div class="d-flex flex-column align-center">
              <v-chip
                size="small"
                :color="item.color"
                variant="tonal"
                class="font-weight-bold mb-1"
              >
                {{ item.status }}
              </v-chip>
              <v-progress-linear
                :model-value="Math.min((item.stok / item.target) * 100, 100)"
                :color="item.color"
                height="4"
                rounded
                style="width: 60px"
              />
            </div>
          </template>

          <template v-if="authStore.user?.cabang === 'KDC'" #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns?.length || 10" class="bg-grey-lighten-5 pa-0 border-b">
                <div class="px-6 py-4">
                  <div class="d-flex align-center mb-4">
                    <v-icon size="small" class="mr-2" color="primary">mdi-store-marker</v-icon>
                    <span class="text-subtitle-2 font-weight-bold text-grey-darken-3">
                      Sebaran Stok Cabang:
                      <span class="text-primary">{{ item.nama }} ({{ item.ukuran }})</span>
                    </span>
                    <v-spacer />
                    <v-chip
                      size="small"
                      variant="flat"
                      color="blue-grey-lighten-5"
                      class="text-blue-grey-darken-3 font-weight-bold border"
                    >
                      Total Akumulasi Buffer: {{ item.target }} pcs
                    </v-chip>
                  </div>

                  <v-row dense>
                    <v-col
                      v-for="cabang in item.branches || []"
                      :key="cabang.nama"
                      cols="12"
                      sm="6"
                      md="4"
                      lg="3"
                    >
                      <v-card
                        flat
                        border
                        class="d-flex flex-column pa-3 rounded-lg h-100"
                        :class="
                          cabang.status === 'KRITIS'
                            ? 'bg-red-lighten-5 border-red-lighten-4'
                            : 'bg-white'
                        "
                      >
                        <div class="d-flex justify-space-between align-start mb-2">
                          <div class="d-flex align-center overflow-hidden mr-2">
                            <span
                              class="text-caption font-weight-bold text-truncate text-grey-darken-3"
                              >{{ cabang.nama }}</span
                            >
                          </div>
                          <v-chip
                            size="x-small"
                            variant="flat"
                            :color="
                              cabang.status === 'KRITIS'
                                ? 'error'
                                : cabang.status === 'OVER'
                                ? 'warning'
                                : 'success'
                            "
                            class="font-weight-bold px-2"
                          >
                            {{ cabang.status }}
                          </v-chip>
                        </div>

                        <div class="mt-auto d-flex justify-space-between align-end pt-2">
                          <div>
                            <div
                              class="text-caption text-grey-darken-1"
                              style="font-size: 10px !important"
                            >
                              Stok Fisik
                            </div>
                            <div
                              class="font-weight-black text-body-2"
                              :class="
                                cabang.status === 'KRITIS' ? 'text-red' : 'text-grey-darken-3'
                              "
                            >
                              {{ cabang.stok }}
                            </div>
                          </div>
                          <div class="text-right">
                            <div
                              class="text-caption text-grey-darken-1"
                              style="font-size: 10px !important"
                            >
                              Buffer Limit
                            </div>
                            <div class="font-weight-bold text-caption text-grey-darken-2">
                              {{ cabang.target_toko }}
                            </div>
                          </div>
                        </div>
                      </v-card>
                    </v-col>

                    <v-col v-if="!item.branches || item.branches.length === 0" cols="12">
                      <div
                        class="text-center text-caption text-grey py-4 border dashed rounded bg-white"
                      >
                        <v-icon class="mb-1" color="grey-lighten-1">mdi-database-off</v-icon>
                        <div>Belum ada data distribusi stok untuk item ini.</div>
                      </div>
                    </v-col>
                  </v-row>
                </div>
              </td>
            </tr>
          </template>

          <template #bottom>
            <div v-intersect="onIntersectPareto" class="pa-4 text-center w-100 bg-white border-t">
              <v-progress-circular
                v-if="paretoDisplayCount < filteredParetoItems.length"
                indeterminate
                color="primary"
                size="24"
                width="3"
              />
              <div
                v-else-if="filteredParetoItems.length > 0"
                class="text-caption text-grey font-italic"
              >
                -- Semua {{ filteredParetoItems.length }} barang telah ditampilkan --
              </div>
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>

  <!-- ============================================================
       DIALOG — Tambah Jadwal Kirim
       ============================================================ -->
  <v-dialog v-model="isAddScheduleDialog" max-width="500">
    <v-card class="rounded-xl pa-2">
      <v-card-title class="d-flex align-center">
        <v-icon start color="indigo">mdi-calendar-plus</v-icon> Tambah Jadwal Kirim
      </v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col cols="12">
            <v-text-field
              v-model="scheduleForm.tanggal_kirim"
              type="date"
              label="Tanggal Kirim"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="12">
            <v-select
              v-model="scheduleForm.cabang_tujuan"
              :items="cabangList.filter((c) => c.kode !== 'ALL')"
              item-title="nama"
              item-value="kode"
              label="Store Tujuan"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="12">
            <v-textarea
              v-model="scheduleForm.keterangan"
              label="Keterangan (Opsional)"
              rows="2"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="isAddScheduleDialog = false">Batal</v-btn>
        <v-btn color="indigo" variant="flat" @click="saveSchedule" class="px-6"
          >Simpan Jadwal</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- ============================================================
       DIALOG — Edit Antrian Bordir
       ============================================================ -->
  <v-dialog v-model="isEditBordirDialog" max-width="500">
    <v-card class="rounded-xl pa-2">
      <v-card-title class="d-flex align-center">
        <v-icon start color="deep-purple">mdi-pencil-box-outline</v-icon> Update Antrian Bordir
      </v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col cols="12">
            <v-text-field
              v-model="bordirForm.so_nomor"
              label="Nomor SO Bordir"
              variant="outlined"
              density="compact"
              readonly
              bg-color="grey-lighten-4"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="bordirForm.tgl_pengerjaan"
              type="date"
              label="Mulai Dikerjakan"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="bordirForm.deadline"
              type="date"
              label="Deadline Selesai"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="12">
            <v-select
              v-model="bordirForm.status"
              :items="['Antri', 'Pending']"
              label="Status Pengerjaan"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col v-if="bordirForm.status === 'Pending'" cols="12">
            <v-textarea
              v-model="bordirForm.alasan_pending"
              label="Alasan Pending"
              rows="2"
              variant="outlined"
              density="compact"
              hide-details
              color="error"
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="isEditBordirDialog = false">Batal</v-btn>
        <v-btn color="deep-purple" variant="flat" @click="saveBordirSchedule" class="px-6"
          >Simpan Update</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showTrackingAnalytics" max-width="1200" transition="dialog-bottom-transition">
    <v-card class="rounded-xl overflow-hidden">
      <v-toolbar color="primary" density="compact">
        <v-icon start class="ml-4">mdi-google-analytics</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          Analytics Pengunjung Web Tracking
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="showTrackingAnalytics = false" />
      </v-toolbar>

      <v-card-text class="pa-4 bg-grey-lighten-4">
        <TrackingAnalytics />
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showAgendaReminder" max-width="480px" persistent scrollable>
    <v-card class="rounded-xl overflow-hidden d-flex flex-column" style="max-height: 90vh">
      <div style="background: #3949ab; padding: 20px 20px 16px; position: relative; flex-shrink: 0">
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          style="position: absolute; top: 8px; right: 8px; color: rgba(255, 255, 255, 0.7)"
          @click="closeAgendaReminder"
        />
        <div style="display: flex; align-items: center; gap: 12px">
          <div
            style="
              width: 48px;
              height: 48px;
              border-radius: 12px;
              background: rgba(255, 255, 255, 0.2);
              display: flex;
              align-items: center;
              justify-content: center;
            "
          >
            <v-icon size="28" color="white">mdi-calendar-clock</v-icon>
          </div>
          <div>
            <div class="text-white font-weight-bold text-subtitle-1">Agenda Hari Ini</div>
            <div class="text-white opacity-80 text-caption">
              {{
                new Date().toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              }}
            </div>
          </div>
        </div>
      </div>

      <v-card-text class="pa-4" style="overflow-y: auto">
        <div style="display: flex; flex-direction: column; gap: 8px">
          <div
            v-for="(evt, i) in todayAgendaItems.filter((e) => !e.is_completed)"
            :key="i"
            style="
              border: 1px solid #eee;
              border-radius: 10px;
              padding: 10px 12px;
              display: flex;
              align-items: center;
              gap: 10px;
            "
          >
            <div
              style="
                width: 36px;
                height: 36px;
                border-radius: 8px;
                background: #e8eaf6;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
              "
            >
              <v-icon size="18" color="#3949AB">mdi-cash-register</v-icon>
            </div>
            <div style="flex: 1; min-width: 0">
              <div class="font-weight-bold text-caption text-grey-darken-3 text-truncate">
                {{ evt.customer || "Umum" }}
              </div>
              <div class="text-caption text-grey">{{ evt.nomor }}</div>
            </div>
            <v-chip size="x-small" color="indigo" variant="flat" class="font-weight-bold">
              Dateline
            </v-chip>
          </div>
        </div>

        <div class="text-caption text-grey text-center mt-3">
          Pengingat ini hanya muncul sekali per hari
        </div>
      </v-card-text>

      <v-card-actions class="px-4 pb-4 pt-0" style="flex-shrink: 0">
        <v-btn
          block
          color="#3949AB"
          variant="flat"
          class="font-weight-bold text-white"
          rounded="lg"
          @click="closeAgendaReminder"
        >
          Oke, Saya Sudah Tahu
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showDeadStockDetail" max-width="1100" scrollable>
    <v-card class="rounded-lg overflow-hidden">
      <div
        class="d-flex align-center justify-space-between px-3 py-2"
        :style="`background: ${
          deadStockDetailTipe === 'bergerak' ? '#2e7d32' : '#c62828'
        }; color: white; flex-shrink: 0`"
      >
        <div class="d-flex align-center gap-2">
          <v-icon size="16" color="white">
            {{ deadStockDetailTipe === "bergerak" ? "mdi-trending-up" : "mdi-archive-off-outline" }}
          </v-icon>
          <span class="text-caption font-weight-bold">
            Dead Stock
            {{ deadStockDetailTipe === "bergerak" ? "Masih Bergerak" : "Stagnan Total" }} —
            {{ filteredDeadStockDetail.length }} SKU
          </span>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          color="white"
          @click="showDeadStockDetail = false"
        />
      </div>

      <!-- Search + info bar -->
      <div class="px-3 py-2 bg-grey-lighten-4 border-b d-flex align-center gap-2">
        <v-text-field
          v-model="searchDeadStockDetail"
          density="compact"
          variant="outlined"
          placeholder="Cari kode / nama..."
          prepend-inner-icon="mdi-magnify"
          hide-details
          bg-color="white"
          style="max-width: 320px"
        />
        <v-spacer />
        <span class="text-caption text-medium-emphasis">
          {{ filteredDeadStockDetail.length }} item • Hal. {{ deadStockDetailPage }} /
          {{ deadStockDetailTotalPages }}
        </span>
      </div>

      <v-card-text class="pa-0" style="max-height: 65vh; overflow-y: auto">
        <div v-if="isLoadingDeadStockDetail" class="text-center pa-8">
          <v-progress-circular
            indeterminate
            size="36"
            :color="deadStockDetailTipe === 'bergerak' ? 'success' : 'error'"
          />
        </div>

        <v-table v-else density="compact" hover>
          <thead>
            <tr class="bg-grey-lighten-4">
              <th style="font-size: 11px; width: 120px">KODE</th>
              <th style="font-size: 11px">NAMA BARANG</th>
              <th style="font-size: 11px; width: 60px" class="text-center">UK.</th>
              <th style="font-size: 11px; width: 80px" class="text-center">CABANG</th>
              <th style="font-size: 11px; width: 90px" class="text-right">UMUR</th>
              <th style="font-size: 11px; width: 70px" class="text-right">STOK</th>
              <th style="font-size: 11px; width: 100px" class="text-right">TERJUAL 12BLN</th>
              <th style="font-size: 11px; width: 120px" class="text-right">NILAI STOK</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in paginatedDeadStockDetail"
              :key="`${item.kode}-${item.ukuran}-${item.cabang}`"
            >
              <td style="font-size: 11px; font-family: monospace; white-space: nowrap">
                {{ item.kode }}
              </td>
              <td style="font-size: 11px; min-width: 280px">
                <div class="font-weight-medium" style="white-space: normal; line-height: 1.3">
                  {{ item.nama }}
                </div>
                <div style="font-size: 9px" class="text-grey">{{ item.jenis_kain }}</div>
              </td>
              <td style="font-size: 11px" class="text-center">{{ item.ukuran }}</td>
              <td style="font-size: 11px" class="text-center">{{ item.cabang }}</td>
              <td style="font-size: 11px" class="text-right">
                <v-chip
                  size="x-small"
                  :color="(item.umur_bulan ?? 0) > 36 ? 'error' : 'warning'"
                  variant="flat"
                  class="font-weight-bold"
                  >{{ item.umur_bulan ?? 0 }} bln</v-chip
                >
              </td>
              <td style="font-size: 11px" class="text-right font-weight-bold">{{ item.stok }}</td>
              <td style="font-size: 11px" class="text-right">
                <span
                  :class="
                    (item.total_terjual ?? 0) > 0 ? 'text-success font-weight-bold' : 'text-grey'
                  "
                >
                  {{ item.total_terjual }}
                </span>
              </td>
              <td style="font-size: 11px" class="text-right text-error font-weight-bold">
                {{ formatRupiah(item.nilai_stok ?? 0) }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>

      <!-- Pagination footer -->
      <div class="d-flex align-center justify-space-between px-4 py-2 border-t bg-grey-lighten-5">
        <span class="text-caption text-medium-emphasis">
          {{ (deadStockDetailPage - 1) * deadStockDetailPerPage + 1 }}–{{
            Math.min(deadStockDetailPage * deadStockDetailPerPage, filteredDeadStockDetail.length)
          }}
          dari {{ filteredDeadStockDetail.length }}
        </span>
        <div class="d-flex align-center gap-1">
          <v-btn
            icon="mdi-page-first"
            size="x-small"
            variant="text"
            :disabled="deadStockDetailPage === 1"
            @click="deadStockDetailPage = 1"
          />
          <v-btn
            icon="mdi-chevron-left"
            size="x-small"
            variant="text"
            :disabled="deadStockDetailPage === 1"
            @click="deadStockDetailPage--"
          />
          <span class="text-caption px-2">Hal. {{ deadStockDetailPage }}</span>
          <v-btn
            icon="mdi-chevron-right"
            size="x-small"
            variant="text"
            :disabled="deadStockDetailPage >= deadStockDetailTotalPages"
            @click="deadStockDetailPage++"
          />
          <v-btn
            icon="mdi-page-last"
            size="x-small"
            variant="text"
            :disabled="deadStockDetailPage >= deadStockDetailTotalPages"
            @click="deadStockDetailPage = deadStockDetailTotalPages"
          />
        </div>
        <div class="d-flex align-center gap-2">
          <span class="text-caption text-medium-emphasis">Baris:</span>
          <v-select
            v-model="deadStockDetailPerPage"
            :items="[25, 50, 100, 200]"
            density="compact"
            variant="outlined"
            hide-details
            style="width: 80px"
            @update:model-value="deadStockDetailPage = 1"
          />
        </div>
      </div>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showLostOrder" max-width="500" transition="dialog-bottom-transition">
    <v-card class="rounded-xl overflow-hidden">
      <v-toolbar color="red-darken-2" density="compact">
        <v-icon start class="ml-4">mdi-account-cancel-outline</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">Catat Lost Order</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="showLostOrder = false" />
      </v-toolbar>

      <v-card-text class="pa-4 bg-grey-lighten-4" style="max-height: 70vh; overflow-y: auto">
        <div class="text-caption font-weight-bold text-grey-darken-1 mb-2">
          DATA CUSTOMER (OPSIONAL)
        </div>
        <v-row dense>
          <v-col cols="6">
            <v-text-field
              v-model="lostOrderForm.customerNama"
              placeholder="Nama Customer..."
              variant="outlined"
              density="compact"
              bg-color="white"
              hide-details
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="lostOrderForm.customerTelp"
              placeholder="No. WA / Telp..."
              variant="outlined"
              density="compact"
              bg-color="white"
              hide-details
              type="tel"
            />
          </v-col>
        </v-row>

        <div class="text-caption font-weight-bold text-grey-darken-1 mt-4 mb-2">ALASAN LOST</div>
        <div class="d-flex flex-wrap gap-2" style="gap: 8px">
          <v-chip
            v-for="item in alasanList"
            :key="item.id"
            :color="lostOrderForm.alasan === item.id ? 'primary' : 'grey-darken-1'"
            :variant="lostOrderForm.alasan === item.id ? 'elevated' : 'outlined'"
            class="font-weight-medium text-caption cursor-pointer"
            @click="lostOrderForm.alasan = item.id"
          >
            <v-icon
              start
              size="small"
              :color="lostOrderForm.alasan === item.id ? 'white' : item.color"
            >
              {{ item.icon }}
            </v-icon>
            {{ item.id }}
          </v-chip>
        </div>

        <v-card variant="outlined" class="mt-5 border-amber-lighten-2 bg-amber-lighten-5">
          <v-card-title
            class="text-caption font-weight-bold text-orange-darken-3 pb-1 d-flex align-center"
          >
            <v-icon size="small" class="mr-1">mdi-package-variant-closed</v-icon> DETAIL PRODUK YANG
            DICARI
          </v-card-title>
          <v-card-text class="pb-3 pt-1">
            <v-text-field
              v-model="lostOrderForm.produkNama"
              placeholder="Contoh: Kaos Oversize, Jaket..."
              variant="outlined"
              density="compact"
              bg-color="white"
              hide-details
              class="mb-2"
            />
            <v-row dense>
              <v-col cols="8">
                <v-text-field
                  v-model="lostOrderForm.ukuran"
                  placeholder="Ukuran (M, L, 42...)"
                  variant="outlined"
                  density="compact"
                  bg-color="white"
                  hide-details
                />
              </v-col>
              <v-col cols="4">
                <v-text-field
                  v-model.number="lostOrderForm.qty"
                  type="number"
                  label="Total Qty"
                  variant="outlined"
                  density="compact"
                  bg-color="white"
                  hide-details
                />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <div class="text-caption font-weight-bold text-grey-darken-1 mt-4 mb-2">CATATAN DETAIL</div>
        <v-textarea
          v-model="lostOrderForm.catatan"
          placeholder="Keterangan tambahan..."
          variant="outlined"
          density="compact"
          bg-color="white"
          rows="2"
          hide-details
        />
      </v-card-text>

      <v-card-actions class="pa-4 bg-white border-t">
        <v-spacer />
        <v-btn variant="text" @click="showLostOrder = false">Batal</v-btn>
        <v-btn
          color="red-darken-2"
          variant="flat"
          class="px-6 font-weight-bold"
          @click="saveLostOrder"
          :loading="isSavingLostOrder"
        >
          Konfirmasi Lost
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <KaosanAiDialog v-model="showAiDialog" />

  <JuknisModal v-model="showJuknis" />

  <RealStockDialog v-model="isRealStockOpen" @update:overbookedCount="overbookedCount = $event" />
</template>

<style scoped>
.date-native-input {
  border: none;
  outline: none;
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
  font-size: 0.875rem;
  width: 110px;
  cursor: pointer;
  background-color: transparent;
}

.scrollable-list::-webkit-scrollbar {
  width: 6px;
}

.scrollable-list::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 10px;
}

.scrollable-list::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 10px;
}

.scrollable-list::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-on-surface), 0.4);
}

.animated-number {
  font-variant-numeric: tabular-nums;
  transition: color 0.3s ease;
}

.price-pulse {
  animation: pulse-green 2s infinite;
}

@keyframes pulse-green {
  0% {
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
    transform: scale(1);
  }

  50% {
    box-shadow: 0 0 0 8px rgba(76, 175, 80, 0);
    transform: scale(1.05);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
    transform: scale(1);
  }
}

.trend-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
  animation: pulse-green 2s infinite;
}

.trend-badge.up {
  background-color: #4caf50;
}

.trend-badge.down {
  background-color: #f44336;
  animation: pulse-red 2s infinite;
}

@keyframes pulse-red {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7);
  }

  70% {
    transform: scale(1);
    box-shadow: 0 0 0 10px rgba(244, 67, 54, 0);
  }

  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0);
  }
}

/* LANDING PAGE */
.landing-container {
  position: relative;
  overflow: hidden;
  background-color: rgb(var(--v-theme-background));
}

.bg-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  transform: scale(1.05);
}

.bg-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.85) 100%);
  backdrop-filter: blur(4px);
}

.content-layer {
  position: relative;
  z-index: 2;
}

.hero-glass-card {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 32px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.feature-glass-card {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  transition: all 0.3s ease;
  height: 100%;
}

.feature-glass-card:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.logo-glow {
  box-shadow: 0 0 30px rgba(255, 255, 255, 0.3);
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.text-shadow {
  text-shadow: 0 4px 10px rgba(0, 0, 0, 0.8);
}

/* DASHBOARD */
.home-container {
  min-height: 100vh;
}

.stat-card {
  transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  height: 100%;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.v-btn {
  text-transform: none;
}

.scrollable-list {
  max-height: 180px;
  overflow-y: auto;
}

.piutang-item {
  padding: 6px 12px !important;
}

.piutang-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
}

.dashboard-header {
  position: relative;
  width: 100%;
  height: 380px;
  overflow: hidden;
}

.header-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.header-overlay {
  width: 100%;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.6) 0%,
    rgba(0, 0, 0, 0.3) 60%,
    rgba(0, 0, 0, 0) 100%
  );
}

.header-content {
  position: relative;
  z-index: 2;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.dashboard-content {
  margin-top: -60px;
}

.deep-sky-gradient {
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-surface)) 0%,
    rgb(var(--v-theme-primary)) 100%
  );
  border-radius: 20px;
  padding: 24px 24px 32px 24px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2) !important;
  position: relative;
  overflow: hidden;
}

.v-theme--dark .deep-sky-gradient {
  background: linear-gradient(180deg, #1e1e1e 0%, #0d47a1 100%);
  border-color: rgba(255, 255, 255, 0.1);
}

.v-theme--light .deep-sky-gradient {
  background: linear-gradient(180deg, #ffffff 0%, #29b6f6 45%, #01579b 100%);
  border-color: rgba(255, 255, 255, 0.8);
}

/* PROMO TICKER */
.promo-ticker-container {
  display: flex;
  align-items: stretch;
  border-radius: 6px;
  overflow: hidden;
  border-left: 3px solid #e91e63;
  height: 32px;
  margin-top: 4px;
  position: sticky;
  top: 70px;
  z-index: 10;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  background-color: rgb(var(--v-theme-surface));
}

.ticker-label {
  background: #e91e63;
  color: white;
  padding: 0 12px;
  display: flex;
  align-items: center;
  z-index: 2;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  font-family: "Roboto", sans-serif;
}

.ticker-track-wrapper {
  flex-grow: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
}

.v-theme--light .ticker-track-wrapper {
  background-color: #fff0f5 !important;
}

.v-theme--dark .ticker-track-wrapper {
  background-color: rgba(255, 255, 255, 0.05) !important;
}

.ticker-track {
  display: flex;
  white-space: nowrap;
  animation: scroll-left 35s linear infinite;
}

.ticker-content {
  padding-right: 60px;
  font-size: 0.85rem;
  display: inline-block;
  line-height: 32px;
}

.v-theme--light .ticker-content {
  color: #c2185b !important;
  font-weight: 500;
}

.v-theme--dark .ticker-content {
  color: #ffffff !important;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.schedule-table :deep(th) {
  text-transform: uppercase;
  font-size: 0.75rem !important;
  letter-spacing: 0.5px;
  border-bottom: 2px solid #e0e0e0 !important;
}

.schedule-table :deep(td) {
  height: 40px !important;
  border-bottom: 1px solid #f0f0f0 !important;
}

.schedule-table tbody tr:hover {
  background-color: #f5f5f5 !important;
}

/* Highlight untuk kiriman tambahan agar mencolok */
.bg-amber-lighten-5 {
  background-color: #fffde7 !important;
}

.floating-review-btn {
  z-index: 100;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
}

.swing-animation {
  animation: mini-swing 0.5s ease-in-out infinite alternate;
}

@keyframes mini-swing {
  from {
    transform: rotate(-10deg);
  }

  to {
    transform: rotate(10deg);
  }
}

/* Transparansi Iframe sebelum load */
iframe {
  background-color: white;
}

@keyframes scroll-left {
  0% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(-33.33%);
  }
}

.swing-animation {
  animation: swing 3s ease-in-out infinite;
}

@keyframes swing {
  0%,
  100% {
    transform: rotate(0deg);
  }

  20% {
    transform: rotate(10deg);
  }

  40% {
    transform: rotate(-5deg);
  }

  60% {
    transform: rotate(3deg);
  }

  80% {
    transform: rotate(-3deg);
  }
}

.ticker-track-wrapper:hover .ticker-track {
  animation-play-state: paused;
}

@media (max-width: 960px) {
  .home-container,
  .landing-container {
    padding: 1rem;
  }
}

@media (max-width: 600px) {
  .home-container {
    padding: 0.5rem;
  }

  .text-h4 {
    font-size: 1.5rem !important;
  }

  .landing-container .text-h2 {
    font-size: 2rem !important;
  }

  .landing-container .text-h5 {
    font-size: 1.25rem !important;
  }

  .filter-bar {
    align-items: stretch !important;
  }

  .filter-input-select {
    width: 100% !important;
  }
}

.chart-type-toggle {
  border: none !important;
  height: 32px !important;
}

.gap-3 {
  gap: 12px;
}

/* Trend table — pastikan tidak terpotong */
.trend-table :deep(th),
.trend-table :deep(td) {
  white-space: nowrap;
}

.pareto-table :deep(th) {
  background-color: white !important;
  z-index: 5 !important;
  position: sticky !important;
  top: 0 !important;
  border-bottom: 1px solid #e0e0e0 !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.pareto-table :deep(table) {
  border-collapse: separate;
  border-spacing: 0;
}

/* --- CUSTOM FILTER SELECT KECIL --- */
.filter-select-small :deep(.v-field__input) {
  font-size: 0.75rem !important; /* Setara dengan text-caption */
  font-weight: 700 !important;
  letter-spacing: 0 !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
  min-height: 32px !important;
}

.filter-select-small :deep(.v-field__append-inner) {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

/* Gaya Khusus Dialog Pareto */
.pareto-dialog-header {
  background-color: #f8f9fa !important;
  border-bottom: 2px solid #e9ecef !important;
  color: #344767 !important;
}

.pareto-table :deep(th) {
  background-color: #f1f3f5 !important;
  font-size: 11px !important;
  color: #495057 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
}

.pareto-table :deep(td) {
  font-size: 11px !important;
}

.pareto-table :deep(.v-data-table__tr:hover) {
  background-color: #f8f9fa !important;
}

.ai-chat-box {
  height: 500px;
  overflow-y: auto;
  padding: 10px;
}

/* --- ANIMASI KAOSAN AI FLOATING BUTTON --- */
.floating-ai-btn {
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
}

/* Lingkaran denyut (Pulse) di belakang icon saat diam */
.ai-icon-wrapper {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ai-pulse-active {
  animation: ai-radar-pulse 2s infinite;
}

/* Animasi robot melayang/lompat saat di-hover */
.ai-bounce-animation {
  animation: bot-levitate 0.8s ease-in-out infinite alternate;
}

@keyframes ai-radar-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(103, 58, 183, 0.6);
  }
  70% {
    box-shadow: 0 0 0 12px rgba(103, 58, 183, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(103, 58, 183, 0);
  }
}

@keyframes bot-levitate {
  from {
    transform: translateY(0px);
  }
  to {
    transform: translateY(-5px);
  }
}

.swipe-hint {
  position: fixed;
  bottom: 90px;
  right: 16px;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgb(var(--v-theme-primary));
  color: white;
  padding: 8px 14px 8px 10px;
  border-radius: 999px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.swipe-hint:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

.swipe-hint .text-caption {
  color: white;
  font-weight: 600;
}

@media (max-width: 600px) {
  .swipe-hint {
    bottom: 76px;
  }
}
</style>

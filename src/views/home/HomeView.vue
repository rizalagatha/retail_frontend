<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, reactive, watch } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
// [GSAP] Import Library
import { gsap } from 'gsap';
import * as XLSX from 'xlsx';

import logoUrl from '@/assets/logo.png';
import bannerImage from '@/assets/banner-image.jpg';
import storeBg from '@/assets/store-bg.jpg';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, subDays } from 'date-fns';
import { Bar, Line, Pie } from 'vue-chartjs';
import {
  Chart as ChartJS, Title, Tooltip, Legend, BarElement, LineElement,
  PointElement, Filler, CategoryScale, LinearScale, ArcElement
} from 'chart.js';
import type { ChartOptions, ChartData, ChartDataset, TooltipItem } from 'chart.js';
import type { Context } from 'chartjs-plugin-datalabels';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { formatRupiah } from "@/utils/formatRupiah";

ChartJS.register(
  Title, Tooltip, Legend, BarElement, LineElement,
  PointElement, Filler, CategoryScale, LinearScale,
  ChartDataLabels, ArcElement
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
  pro_lipat: 'Y' | 'N';
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
  bulan_ini: number;
  bulan_min_1: number;
  bulan_min_2: number;
  bulan_min_3: number;
  total_qty: number;
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

const authStore = useAuthStore();
const router = useRouter();
const toast = useToast();

const goToLogin = () => {
  router.push('/login');
}

// --- STATE UTAMA ---
const stats = ref<DashboardStats>({
  todaySales: 0,
  todayQty: 0,
  todayTransactions: 0,
  lowStock: 0,
  totalStock: 0,
  totalStok: 0,
  todayStokIn: 0,
  todayStokOut: 0,
  totalSisaPiutang: 0,
  stokPerCabang: [],
  salesBreakdown: []
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
// const animatedLowStock = useGsapNumber(() => lowStockCount.value);
const animatedPiutang = useGsapNumber(() => stats.value.totalSisaPiutang);
const animatedTargetRealization = useGsapNumber(() => salesTargetSummary.value.nominal);
const animatedStagnant = useGsapNumber(() => stagnantStockValue.value);

// --- [GSAP] 3. ANIMASI LIST (STAGGER) ---
const onListEnter = (el: Element, done: () => void) => {
  // Casting 'el' ke HTMLElement agar bisa mengakses properti .dataset
  const element = el as HTMLElement;

  gsap.fromTo(element,
    { opacity: 0, x: -30 },
    {
      opacity: 1,
      x: 0,
      duration: 0.5,
      ease: "power2.out",
      onComplete: done,
      // dataset.index bertipe string, harus dikonversi ke number
      // '|| 0' digunakan sebagai fallback jika index tidak ditemukan
      delay: Number(element.dataset.index || 0) * 0.1
    }
  );
};

// --- STATE LAINNYA ---
const isLoadingStats = ref(true);
const isLoadingPiutang = ref(true);
const isLoadingPiutangBreakdown = ref(true);
const piutangBreakdown = ref<PiutangBreakdown[]>([]);
const piutangByInvoice = ref([]);
const isLoadingPiutangInvoice = ref(false);
const frequentMenus = ref<FrequentMenu[]>([]);
const isLoadingFrequent = ref(true);
const chartType = ref<'bar' | 'line' | 'area'>('bar');
const chartGroupBy = ref<'day' | 'week' | 'month'>('day');
const chartFilters = reactive({
  startDate: format(subDays(new Date(), 6), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '',
});
const cabangList = ref([]);
const chartData = ref<ChartData<'bar' | 'line'>>({
  labels: [],
  datasets: [] // Inisialisasi kosong saja, tidak perlu dummy object yang bikin strict
});
const isLoadingChart = ref(true);
const recentTransactions = ref([]);
const isLoadingTransactions = ref(true);
const lowStockProducts = ref<LowStockProduct[]>([]);
const isLoadingLowStock = ref(true);
const pendingActions = ref<PendingAction[]>([]);
const isLoadingActions = ref(true);
const topProducts = ref([]);
const isLoadingTopProducts = ref(true);
const topProductsCabang = ref('ALL');
const isLoadingSalesTarget = ref(true);
const branchPerformances = ref([]);
const isLoadingPerformance = ref(false);
const isLoadingStagnantStock = ref(true);
const stockBreakdown = ref<{ kode_cabang: string; nama_cabang: string; totalStock: number }[]>([]);
const isLoadingStock = ref(true);
const isLoadingStockBreakdown = ref(true);
const promoText = ref('');
const isLoadingPromo = ref(false);
const itemTrendData = ref<ItemTrend[]>([]);
const isLoadingItemTrend = ref(false);
const searchStokKosong = ref('');
const stokKosongCabang = ref('');
const stokKosongList = ref([]);
const isLoadingStokKosong = ref(false);
const paretoStats = ref({
  score: 0,
  actual_stock: 0,
  buffer_stock: 0,
  sku_count: 0,
  store_count: 0,
  is_pusat: false
});
const isLoadingPareto = ref(false);
// State untuk Dialog Detail
const showParetoDetail = ref(false);
const paretoItems = ref([]);
const isLoadingParetoDetail = ref(false);
const searchPareto = ref('');
const filterPareto = ref('ALL'); // ALL, KRITIS, AMAN, OVER
let searchStokKosongTimeout: ReturnType<typeof setTimeout>;

const itemTrendHeaders = [
  { title: 'Nama Barang', key: 'nama', width: '40%' },
  { title: 'Bln-3', key: 'bulan_min_3', align: 'end' },
  { title: 'Bln-2', key: 'bulan_min_2', align: 'end' },
  { title: 'Bln-1', key: 'bulan_min_1', align: 'end' },
  { title: 'Bulan Ini (Qty)', key: 'bulan_ini', align: 'end' },
  { title: 'Tren', key: 'trend', align: 'center', sortable: false, width: '50px' },
] as const;

// Headers Tabel
const paretoHeaders = [
  { title: 'Rank', key: 'rank', width: '80px' },
  { title: 'Barang', key: 'nama' },
  { title: 'Stok', key: 'stok', align: 'end' },
  { title: 'Buffer', key: 'target', align: 'end' },
  { title: 'Status', key: 'status', align: 'center' },
] as const;

// --- TREND INDICATOR LOGIC ---
const prevStats = ref({ todaySales: 0 });
const trendIndicators = reactive({ sales: 'neutral' });

watch(() => stats.value.todaySales, (n) => {
  if (n > prevStats.value.todaySales) trendIndicators.sales = 'up';
  else if (n < prevStats.value.todaySales) trendIndicators.sales = 'down';
  else trendIndicators.sales = 'neutral';
  prevStats.value.todaySales = n;
});

// --- CHART & COLORS ---
const targetPercentage = computed(() => {
  if (!salesTargetSummary.value.target || salesTargetSummary.value.target === 0) return 0;
  return (salesTargetSummary.value.nominal / salesTargetSummary.value.target) * 100;
});

const isOverTarget = computed(() => targetPercentage.value > 100);

const getProgressColor = (percentage) => {
  if (percentage >= 100) return '#4CAF50';
  if (percentage >= 75) return '#2196F3';
  if (percentage >= 50) return '#FF9800';
  if (percentage >= 25) return '#FFC107';
  return '#F44336';
};

const targetChartData = computed(() => ({
  labels: ['Pencapaian'],
  datasets: [
    {
      label: 'Target',
      data: [salesTargetSummary.value.target],
      backgroundColor: '#E0E0E0',
      borderRadius: 4,
      barPercentage: 1.0
    },
    {
      label: 'Realisasi',
      data: [salesTargetSummary.value.nominal],
      backgroundColor: getProgressColor(targetPercentage.value),
      borderRadius: 4,
      barPercentage: 0.6
    }
  ]
}));

// [TAMBAHAN] Helper Computed
const isWarehouseUser = computed(() => authStore.user?.isWarehouseUser === true);

const fr = (val: number) => formatRupiah(val);

const targetChartOptions = ref<ChartOptions<'bar' | 'line'>>({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        callback: (value: number | string) => {
          if (typeof value === 'number') {
            if (value >= 1000000) return `Rp ${value / 1000000} Jt`;
            return fr(value);
          }
          return value;
        }
      }
    },
    x: { grid: { display: false } }
  },
  plugins: {
    legend: { position: 'bottom' },
    tooltip: {
      callbacks: {
        label: (context: TooltipItem<'bar' | 'line'>) => `${context.dataset.label}: ${fr(context.parsed.y as number)}`
      }
    },
    datalabels: {
      anchor: 'end',
      align: 'top',
      formatter: (value, context) => context.datasetIndex === 1 ? fr(value) : null,
      font: { weight: 'bold', size: 10 },
      color: '#424242'
    }
  }
});

const chartColors = ['#42A5F5', '#66BB6A', '#FFA726', '#EF5350', '#AB47BC', '#FF7043', '#26C6DA', '#7E57C2', '#9CCC65', '#5C6BC0', '#8D6E63', '#78909C'];

const branchDistributionData = computed(() => ({
  labels: branchPerformances.value.map(b => b.nama_cabang),
  datasets: [{
    backgroundColor: chartColors.slice(0, branchPerformances.value.length),
    data: branchPerformances.value.map(b => b.nominal),
    borderWidth: 2,
    borderColor: '#ffffff',
    hoverOffset: 4
  }]
}));

// Computed Filtered List
const filteredParetoItems = computed(() => {
  let items = paretoItems.value;

  // Filter Tab
  if (filterPareto.value !== 'ALL') {
    items = items.filter(i => i.status === filterPareto.value);
  }

  // Search
  if (searchPareto.value) {
    const q = searchPareto.value.toLowerCase();
    items = items.filter(i =>
      i.nama.toLowerCase().includes(q) ||
      i.kode.toLowerCase().includes(q)
    );
  }
  return items;
});

const pieChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right' as const, labels: { usePointStyle: true, boxWidth: 10, font: { size: 11 } } },
    tooltip: {
      callbacks: {
        label: (context: TooltipItem<'pie'>) => {
          // Ambil dataset data asli
          const dataset = context.chart.data.datasets[context.datasetIndex];
          const dataArray = dataset.data as number[]; // Pastikan tipe data number

          // Hitung total manual
          const total = dataArray.reduce((acc, curr) => acc + (curr || 0), 0);

          const value = context.parsed;
          const percentage = ((value / total) * 100).toFixed(1) + '%';

          return `${context.label}: ${formatRupiah(value)} (${percentage})`;
        }
      }
    },
    datalabels: {
      // Ganti 'any' dengan 'Context'
      display: (context: Context) => {
        const value = context.dataset.data[context.dataIndex];
        // Pastikan value adalah number sebelum cek > 0
        return typeof value === 'number' ? value > 0 : false;
      },
      color: '#fff',
      font: { weight: 'bold' as const, size: 10 },

      // Ganti 'ctx: any' dengan 'ctx: Context'
      formatter: (value: number, ctx: Context) => {
        // CARA AMAN (Type-Safe): Hitung total manual dari data dataset
        // Kita casting data ke number[] karena ini Pie Chart
        const dataArray = ctx.chart.data.datasets[ctx.datasetIndex].data as number[];
        const total = dataArray.reduce((acc, curr) => acc + (curr || 0), 0);

        const percentage = ((value / total) * 100);
        return percentage > 5 ? percentage.toFixed(0) + '%' : '';
      }
    }
  }
};

const currentTime = ref(new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'medium' }));
let intervalId: number;

// --- FETCH FUNCTIONS ---

const fetchDashboardStats = async (isBackground = false) => {
  if (!isBackground) isLoadingStats.value = true;
  try {
    const response = await api.get('/dashboard/total-stok');
    stats.value.totalStok = Number(response.data.totalStok || 0);
    stats.value.stokPerCabang = response.data.perCabang || [];
  } catch (error) {
    toast.error('Gagal memuat total stok.', error);
  } finally {
    if (!isBackground) isLoadingStats.value = false;
  }
};

const fetchTodayStats = async (isBackground = false) => {
  if (!isBackground) isLoadingStats.value = true;
  try {
    const response = await api.get('/dashboard/today-stats');

    // CUKUP UPDATE STATE SAJA
    // Watcher GSAP Anda akan otomatis mendeteksi perubahan ini dan menjalankan animasi.
    stats.value = {
      ...stats.value,

      // Data Angka (Akan memicu useGsapNumber)
      todaySales: response.data.todaySales || 0,
      todayQty: Number(response.data.todayQty || 0),
      todayTransactions: Number(response.data.todayTransactions || 0),

      // Data List (Untuk Popup Breakdown)
      salesBreakdown: response.data.salesBreakdown || []
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
    const response = await api.get('/dashboard/recent-transactions');
    recentTransactions.value = response.data;
  } catch (error) {
    console.error('Gagal memuat transaksi', error);
  } finally {
    if (!isBackground) isLoadingTransactions.value = false;
  }
};

const fetchTotalStock = async (isBackground = false) => {
  if (!isBackground) isLoadingStock.value = true;
  try {
    const response = await api.get('/dashboard/total-stok');
    stats.value.totalStock = Number(response.data.totalStock || 0);
    stats.value.todayStokIn = Number(response.data.todayStokIn || 0);
    stats.value.todayStokOut = Number(response.data.todayStokOut || 0);
  } catch (err) {
    console.error('Gagal memuat total stok:', err);
  } finally {
    if (!isBackground) isLoadingStock.value = false;
  }
};

const fetchLowStockData = async (isBackground = false) => {
  if (!isBackground) isLoadingLowStock.value = true;
  try {
    const response = await api.get('/laporan-stok/low-stock');
    lowStockProducts.value = response.data;
    lowStockCount.value = response.data.length;
  } catch (error) {
    console.error('Gagal memuat low stock:', error);
  } finally {
    if (!isBackground) isLoadingLowStock.value = false;
  }
};

const fetchSalesTargetSummary = async (isBackground = false) => {
  if (!isBackground) isLoadingSalesTarget.value = true;
  try {
    const response = await api.get('/dashboard/sales-target-summary');
    salesTargetSummary.value = response.data;
  } catch (error) {
    console.error('Error target summary:', error);
  } finally {
    if (!isBackground) isLoadingSalesTarget.value = false;
  }
};

const fetchStagnantStockSummary = async (isBackground = false) => {
  if (!isBackground) isLoadingStagnantStock.value = true;
  try {
    const response = await api.get('/dashboard/stagnant-stock-summary');
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
    const response = await api.get('/dashboard/total-sisa-piutang');
    stats.value.totalSisaPiutang = response.data.totalSisaPiutang || 0;
  } catch (error) {
    console.error(error);
  } finally {
    if (!isBackground) isLoadingPiutang.value = false;
  }
};

const fetchStokKosong = async (isBackground = false) => {
  if (!isBackground) isLoadingStokKosong.value = true;
  try {
    const cabangParam = authStore.user?.cabang === 'KDC' ? stokKosongCabang.value : undefined;
    const response = await api.get('/dashboard/stok-kosong', { params: { q: searchStokKosong.value, cabang: cabangParam } });
    stokKosongList.value = response.data.data || [];
  } catch (error) {
    console.error("Gagal memuat stok kosong:", error);
  } finally {
    if (!isBackground) isLoadingStokKosong.value = false;
  }
};

const exportStokKosong = () => {
  if (stokKosongList.value.length === 0) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }

  try {
    const dataToExport = stokKosongList.value.map(item => ({
      'Kode Barang': item.kode,
      'Barcode': item.barcode || '-',
      'Nama Barang': item.nama_barang,
      'Ukuran': item.ukuran,
      'Stok': item.stok_akhir
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stok Kosong Reguler");

    const fileName = `Stok_Kosong_Reguler_${stokKosongCabang.value || authStore.user?.cabang}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    toast.success("Data stok kosong berhasil diekspor.");
  } catch (error) {
    toast.error("Gagal mengekspor data.");
    console.error(error);
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/dashboard/cabang-options');
    cabangList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat pilihan cabang.', error);
  }
};

const fetchPendingActions = async (isBackground = false) => {
  if (!isBackground) isLoadingActions.value = true;
  try {
    // 1. Tentukan Range Tanggal sesuai Backend (Mulai 2020-01-01)
    const startDate = '2020-01-01';
    const endDate = format(new Date(), 'yyyy-MM-dd'); // Sampai Hari Ini

    // 2. Request ke API
    const response = await api.get('/dashboard/pending-actions', {
      params: { startDate, endDate }
    });
    const data = response.data;

    // 3. Update actionsMap dengan menambahkan Query Params tanggal ke URL ('to')
    const actionsMap = [
      {
        key: 'so_open',
        title: 'Surat Pesanan Open',
        icon: 'mdi-file-document-edit-outline',
        // Tambahkan &startDate=...&endDate=...
        to: `/transaksi/penjualan/surat-pesanan?status=open&startDate=${startDate}&endDate=${endDate}`
      },
      {
        key: 'so_dtf_open',
        title: 'SO DTF Belum Invoice',
        icon: 'mdi-printer-alert',
        to: `/transaksi/penjualan/dtf/so-dtf?status=belum_invoice&startDate=${startDate}&endDate=${endDate}`
      },
      {
        key: 'invoice_belum_lunas',
        title: 'Sisa Piutang Invoice',
        icon: 'mdi-receipt-text-clock-outline',
        to: `/transaksi/penjualan/invoice?status=sisa_piutang&startDate=${startDate}&endDate=${endDate}`
      },
      {
        key: 'penawaran_open',
        title: 'Penawaran Open',
        icon: 'mdi-handshake-outline',
        to: `/transaksi/penjualan/penawaran?status=open&startDate=${startDate}&endDate=${endDate}`
      },
      {
        key: 'pengajuan_harga_pending',
        title: 'Pengajuan Harga Pending',
        icon: 'mdi-file-clock-outline',
        to: `/transaksi/penjualan/pengajuan/pengajuan-harga?status=pending&startDate=${startDate}&endDate=${endDate}`
      }
    ];

    // Mapping data count
    pendingActions.value = actionsMap.map(action => ({
      ...action,
      count: data[action.key] || 0
    }));

  } catch (error) {
    console.error('Gagal memuat pending actions:', error);
  } finally {
    if (!isBackground) isLoadingActions.value = false;
  }
};

const fetchTopProducts = async (isBackground = false) => {
  if (!isBackground) isLoadingTopProducts.value = true;
  try {
    const response = await api.get('/dashboard/top-products', { params: { cabang: authStore.user?.cabang === 'KDC' ? topProductsCabang.value : undefined } });
    topProducts.value = response.data;
  } catch (error) {
    console.error(error);
  } finally {
    if (!isBackground) isLoadingTopProducts.value = false;
  }
}

const fetchBranchPerformance = async (isBackground = false) => {
  if (!isBackground) isLoadingPerformance.value = true;
  try {
    const response = await api.get('/dashboard/branch-performance');
    branchPerformances.value = response.data;
  } catch (error) {
    console.error(error);
  } finally {
    if (!isBackground) isLoadingPerformance.value = false;
  }
}

const fetchPiutangBreakdown = async () => {
  if (authStore.user?.cabang !== 'KDC') {
    isLoadingPiutangBreakdown.value = false;
    return;
  }
  isLoadingPiutangBreakdown.value = true;
  try {
    const response = await api.get('/dashboard/piutang-per-cabang');
    piutangBreakdown.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat breakdown piutang.', error);
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

const fetchStockBreakdown = async () => {
  isLoadingStockBreakdown.value = true;
  try {
    const response = await api.get<StockCabang[]>('/dashboard/total-stok-per-cabang');
    stockBreakdown.value = response.data.map((r) => ({
      kode_cabang: r.kode_cabang,
      nama_cabang: r.nama_cabang,
      totalStock: Number(r.totalStock || 0),
    }));
  } catch (err) {
    toast.error('Gagal memuat breakdown stok per cabang.');
    console.error(err);
    stockBreakdown.value = [];
  } finally {
    isLoadingStockBreakdown.value = false;
  }
};

const fetchActivePromos = async () => {
  isLoadingPromo.value = true;
  try {
    const response = await api.get('/invoice-form/lookup/active-promos', {
      params: {
        tanggal: format(new Date(), 'yyyy-MM-dd'),
        cabang: authStore.user?.cabang
      }
    });

    const promos = (response.data || []) as ActivePromo[];
    let promoMessages: string[] = [];

    // [REVISI] Cabang K11 sekarang menggunakan promo reguler, nonaktifkan pesan Grand Opening
    const promoReguler = promos.find(p =>
      p.pro_nomor === 'PRO-2025-010' ||
      p.pro_judul.toUpperCase().includes('REGULER')
    );

    if (promoReguler) {
      promoMessages.push(`🔥 PROMO BULANAN: Potongan Rp 25.000 tiap kelipatan Rp 250.000 (Khusus Kaos Polos/Reguler, Non-Jersey). Buruan Serbu!`);
    } else if (promos.length > 0) {
      // Jika ada promo lain yang aktif di Januari
      promoMessages = promos.map(p => `✨ ${p.pro_judul}`);
    }

    // Pesan default jika tidak ada promo spesifik yang ditemukan
    if (promoMessages.length === 0) {
      promoMessages.push('Selamat Datang di Kaosan Retail Management System • Cek koleksi terbaru kami sekarang!');
    }

    promoText.value = promoMessages.join(' • ');
  } catch (error) {
    console.error("Gagal memuat promo:", error);
    promoText.value = 'Selamat Datang di Kaosan Retail Management System';
  } finally {
    isLoadingPromo.value = false;
  }
};

const fetchItemSalesTrend = async (isBackground = false) => {
  if (authStore.user?.cabang !== 'KDC') return;

  // Hanya tampilkan loading jika bukan update di background
  if (!isBackground) isLoadingItemTrend.value = true;

  try {
    const response = await api.get('/dashboard/item-sales-trend');
    itemTrendData.value = response.data;
  } catch (error) {
    console.error('Gagal memuat trend barang:', error);
  } finally {
    // Hanya matikan loading jika bukan update di background
    if (!isBackground) isLoadingItemTrend.value = false;
  }
};

const fetchSalesChartData = async (isBackground = false) => {
  if (!isBackground) isLoadingChart.value = true;
  try {
    const response = await api.get('/dashboard/sales-chart', { params: { ...chartFilters, groupBy: chartGroupBy.value } });

    const labels = (response.data as SalesChartItem[]).map((d) => {
      const date = new Date(d.tanggal);
      if (chartGroupBy.value === 'month') return format(date, 'MMM yyyy');
      if (chartGroupBy.value === 'week') return `W${format(date, 'ww')}`;
      return format(date, 'dd/MM');
    });

    const dataValues = (response.data as SalesChartItem[]).map(d => d.total);

    // Definisikan tipe datasetConfig sebagai Partial karena 'data' belum dimasukkan
    let datasetConfig: Partial<ChartDataset<'bar' | 'line'>> = {};

    if (chartType.value === 'bar') {
      datasetConfig = {
        type: 'bar',
        label: 'Penjualan (Rp)',
        backgroundColor: '#42A5F5',
        borderRadius: 4,
        barPercentage: 0.6
      };
    } else {
      // Logic untuk Line dan Area
      datasetConfig = {
        type: 'line',
        label: 'Penjualan (Rp)',
        borderColor: '#42A5F5',
        backgroundColor: chartType.value === 'area' ? 'rgba(66, 165, 245, 0.2)' : 'transparent',
        borderWidth: 3,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#42A5F5',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: chartType.value === 'area',
        tension: 0.4
      };
    }

    chartData.value = {
      labels: labels,
      // [PERBAIKAN] Gunakan tipe ChartDataset[] alih-alih any
      datasets: [{
        data: dataValues,
        ...datasetConfig
      }] as ChartDataset<'bar' | 'line'>[]
    };

  } catch (error) {
    toast.error('Gagal memuat data grafik penjualan.', error);
  } finally {
    if (!isBackground) isLoadingChart.value = false;
  }
};

const fetchParetoHealth = async () => {
  isLoadingPareto.value = true;
  try {
    const gudang = authStore.user?.cabang === 'KDC' ? 'KDC' : authStore.user?.cabang;
    const response = await api.get('/dashboard/pareto-health', { params: { gudang } });
    paretoStats.value = response.data;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingPareto.value = false;
  }
};

// Function Fetch
const openParetoDetail = async () => {
  showParetoDetail.value = true;
  if (paretoItems.value.length > 0) return; // Cache sederhana

  isLoadingParetoDetail.value = true;
  try {
    const response = await api.get('/dashboard/pareto-details', {
      params: { gudang: authStore.user.cabang === 'KDC' ? 'KDC' : authStore.user.cabang }
    });
    paretoItems.value = response.data;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingParetoDetail.value = false;
  }
};

// Computed property untuk menentukan warna & pesan status
const healthStatus = computed(() => {
  const score = Number(paretoStats.value.score);

  if (score < 100) {
    return {
      color: 'error', // MERAH
      icon: 'mdi-alert-octagon',
      text: 'KRITIS (Kurang)',
      desc: 'Stok tidak cukup untuk memenuhi target buffer toko.'
    };
  } else if (score >= 200) {
    return {
      color: 'success', // HIJAU
      icon: 'mdi-check-decagram',
      text: 'AMAN (Surplus)',
      desc: 'Stok melimpah, siap supply dalam jumlah besar.'
    };
  } else {
    // Range 100 - 199
    return {
      color: 'warning', // KUNING
      icon: 'mdi-alert',
      text: 'STANDAR (Cukup)',
      desc: 'Stok pas-pasan sesuai target minimal.'
    };
  }
});

const getMenuColor = (iconName: string, index: number) => {
  if (iconName.includes('cash') || iconName.includes('receipt')) return 'primary';
  if (iconName.includes('database') || iconName.includes('plus')) return 'success';
  if (iconName.includes('chart') || iconName.includes('finance')) return 'info';
  if (iconName.includes('account') || iconName.includes('clock')) return 'orange';
  if (iconName.includes('warehouse') || iconName.includes('package')) return 'purple';
  if (iconName.includes('printer') || iconName.includes('print')) return 'deep-orange';
  if (iconName.includes('target')) return 'red';
  const colors = ['teal', 'indigo', 'cyan', 'brown', 'blue-grey'];
  return colors[index % colors.length];
};

const getTrendIcon = (item: ItemTrend) => {
  if (item.bulan_ini > item.bulan_min_1) return 'mdi-trending-up';
  if (item.bulan_ini < item.bulan_min_1) return 'mdi-trending-down';
  return 'mdi-minus';
};

const getTrendColor = (item: ItemTrend) => {
  if (item.bulan_ini > item.bulan_min_1) return 'success';
  if (item.bulan_ini < item.bulan_min_1) return 'error';
  return 'grey';
};

const getAchColor = (ach: number) => {
  if (ach >= 100) return 'success';
  if (ach >= 80) return 'warning';
  return 'error';
};

const fetchFrequentMenus = async () => {
  if (isWarehouseUser.value) {
    frequentMenus.value = [
      {
        title: 'Packing List',
        icon: 'mdi-format-list-checks', // Icon checklist
        to: '/gudang-dc/operasional/packing-list',
        color: 'indigo'
      },
      {
        title: 'Terima STBJ',
        icon: 'mdi-package-variant-closed-plus', // Icon tambah stok/terima barang
        to: '/gudang-dc/operasional/terima-stbj',
        color: 'teal'
      },
      {
        title: 'Surat Jalan Store',
        icon: 'mdi-truck-delivery-outline', // Icon pengiriman
        to: '/gudang-dc/operasional/surat-jalan-store',
        color: 'blue'
      },
      {
        title: 'Ambil Barang',
        icon: 'mdi-dolly', // Icon alat angkut barang
        to: '/gudang-dc/operasional/ambil-barang',
        color: 'orange'
      },
      {
        title: 'Terima Retur',
        icon: 'mdi-keyboard-return', // Icon panah kembali/retur
        to: '/gudang-dc/operasional/terima-rb',
        color: 'deep-orange'
      },
    ];
    isLoadingFrequent.value = false;
    return;
  }
  isLoadingFrequent.value = true;
  try {
    const response = await api.get('/activity/frequent-menus');
    if (response.data && response.data.length > 0) {
      frequentMenus.value = response.data.map((menu: { icon?: string; title: string; to: string }, index: number) => ({ ...menu, color: getMenuColor(menu.icon || '', index) }));
    } else {
      frequentMenus.value = [
        { title: 'Invoice', icon: 'mdi-receipt-text', to: '/transaksi/penjualan/invoice', color: 'primary' },
        { title: 'Surat Pesanan', icon: 'mdi-file-document-edit', to: '/transaksi/penjualan/surat-pesanan', color: 'success' },
        { title: 'SO DTF', icon: 'mdi-printer-3d-nozzle', to: '/transaksi/penjualan/dtf/so-dtf', color: 'deep-orange' },
        { title: 'Cek Stok', icon: 'mdi-package-variant', to: '/laporan/stok/real-time', color: 'purple' },
        { title: 'Monitoring Target', icon: 'mdi-target', to: '/laporan/penjualan/monitoring-achievement', color: 'red' },
      ];
    }
  } catch (error) {
    console.error('Gagal memuat menu sering diakses', error);
    frequentMenus.value = [
      { title: 'Invoice', icon: 'mdi-receipt-text', to: '/transaksi/penjualan/invoice', color: 'primary' },
      { title: 'Surat Pesanan', icon: 'mdi-file-document-edit', to: '/transaksi/penjualan/surat-pesanan', color: 'success' },
      { title: 'SO DTF', icon: 'mdi-printer-3d-nozzle', to: '/transaksi/penjualan/dtf/so-dtf', color: 'deep-orange' },
    ];
  } finally {
    isLoadingFrequent.value = false;
  }
};

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

watch([chartFilters, chartType, chartGroupBy], () => {
  fetchSalesChartData(false);
}, { deep: true });

watch(topProductsCabang, () => {
  fetchTopProducts();
});

// --- POLLING & MOUNT ---
let pollingInterval: number;

const startPolling = () => {
  pollingInterval = window.setInterval(() => {

    // Common (Stok)
    fetchTotalStock(true);
    fetchLowStockData(true);
    fetchStagnantStockSummary(true);
    if (authStore.user?.cabang === 'KDC') {
      fetchStockBreakdown(); // Penting buat orang gudang DC
    }

    // Penjualan (SKIP jika Warehouse User)
    if (!isWarehouseUser.value) {
      fetchTodayStats(true);
      fetchPendingActions(true);
      fetchSalesTargetSummary(true);
      fetchRecentTransactions(true);
      fetchSalesChartData(true);
      fetchTopProducts(true);
      if (authStore.user?.cabang === 'KDC') {
        fetchBranchPerformance(true);
        fetchItemSalesTrend(true);
      }
    }
  }, 10000);
};

onMounted(() => {
  if (authStore.isAuthenticated) {
    // Common
    fetchActivePromos(); // Promo tetap ditampilkan (info umum)
    fetchFrequentMenus();
    fetchTotalStock();
    fetchLowStockData();
    fetchStagnantStockSummary();
    fetchParetoHealth();
    if (authStore.user?.cabang === 'KDC') {
      fetchStockBreakdown();
    }

    // Penjualan (SKIP jika Warehouse User)
    if (!isWarehouseUser.value) {
      fetchTodayStats();
      fetchDashboardStats();
      fetchSalesChartData();
      fetchCabangOptions();
      fetchRecentTransactions();
      fetchPendingActions();
      fetchTopProducts();
      fetchSalesTargetSummary();
      fetchTotalPiutang();
      fetchPiutangBreakdown();
      fetchPiutangByInvoice();
      if (authStore.user?.cabang === 'KDC') {
        fetchBranchPerformance();
        fetchItemSalesTrend();
      }
    }
    startPolling();
  }
  intervalId = window.setInterval(() => {
    currentTime.value = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'medium' });
  }, 1000);
});

onUnmounted(() => {
  clearInterval(intervalId);
  clearInterval(pollingInterval);
});
</script>

<template>
  <v-container v-if="!authStore.isAuthenticated" class="landing-container pa-0 fill-height" fluid>
    <div class="bg-overlay"></div>
    <v-img :src="storeBg" cover class="bg-image" position="center center" />
    <v-row align="center" justify="center" class="fill-height content-layer ma-0">
      <v-col cols="12" md="10" lg="8" class="text-center">
        <div class="hero-glass-card pa-8 pa-md-12 mb-8">
          <v-avatar size="110" class="mb-6 elevation-12 logo-glow">
            <v-img :src="logoUrl" alt="Kaosan Logo" />
          </v-avatar>
          <h1 class="text-h3 font-weight-black text-white mb-2 tracking-wide text-shadow">KAOSAN</h1>
          <div class="text-h6 text-uppercase text-white font-weight-light mb-6 tracking-widest text-shadow">
            Retail Management System
          </div>
          <v-btn color="white" size="x-large" rounded="pill" @click="goToLogin" prepend-icon="mdi-login-variant"
            class="px-10 text-primary font-weight-bold btn-glow" height="56">
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
                Aplikasi kasir lengkap untuk mencatat penjualan tunai/kredit, cetak struk, dan kelola pelanggan dengan
                cepat.
              </p>
            </div>
          </v-col>

          <v-col cols="12" sm="6" md="3">
            <div class="feature-glass-card pa-6 text-center text-white h-100">
              <v-icon size="40" class="mb-3">mdi-package-variant-closed</v-icon>
              <h3 class="text-h6 font-weight-bold mb-2">Manajemen Stok</h3>
              <p class="text-body-2 opacity-80">
                Pantau stok real-time antar cabang, stok opname mudah, dan peringatan dini untuk barang yang menipis.
              </p>
            </div>
          </v-col>

          <v-col cols="12" sm="6" md="3">
            <div class="feature-glass-card pa-6 text-center text-white h-100">
              <v-icon size="40" class="mb-3">mdi-chart-timeline-variant</v-icon>
              <h3 class="text-h6 font-weight-bold mb-2">Laporan Lengkap</h3>
              <p class="text-body-2 opacity-80">Analisa omset, laba rugi, dan trend penjualan harian hingga bulanan
                secara instan.</p>
            </div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="feature-glass-card pa-6 text-center text-white h-100">
              <v-icon size="40" class="mb-3">mdi-store-cog</v-icon>
              <h3 class="text-h6 font-weight-bold mb-2">Multi Cabang</h3>
              <p class="text-body-2 opacity-80">Kelola operasional pusat (KDC) dan seluruh cabang retail dalam satu
                platform terintegrasi.</p>
            </div>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </v-container>

  <v-container v-else class="home-container bg-background pa-0" fluid>

    <div class="dashboard-header">
      <v-img :src="bannerImage" cover class="header-bg">
        <div class="header-overlay"></div>
      </v-img>
      <div class="header-content pt-6 px-6 pb-12">
        <div class="welcome-text text-white mt-4">
          <div class="d-flex align-center mb-2">
            <v-avatar size="64" color="white" class="mr-4 elevation-4 pa-1">
              <v-img :src="logoUrl" alt="Kaosan Logo" />
            </v-avatar>
            <div>
              <h1 class="text-h3 font-weight-bold text-white text-shadow mb-1">Selamat Datang di Kaosan</h1>
              <p class="text-subtitle-1 text-white opacity-90 mb-0 font-weight-light">
                Retail Management System • {{ currentTime }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="dashboard-content px-6 mt-n8 position-relative" style="z-index: 2;">
      <div class="deep-sky-gradient elevation-3 mb-6">

        <v-row v-if="promoText" class="mb-5">
          <v-col cols="12" class="pa-0">
            <div class="promo-ticker-container elevation-4 bg-surface text-high-emphasis">
              <div class="ticker-label">
                <v-icon icon="mdi-bullhorn" size="18" class="mr-2 swing-animation" />
                <span class="font-weight-bold text-uppercase" style="font-size: 0.75rem; letter-spacing: 1px;">
                  Info Promo
                </span>
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

        <v-row dense align="stretch" class="mb-4">

          <v-col v-if="!isWarehouseUser" cols="12" sm="6" md="2">

            <v-menu v-if="authStore.user?.cabang === 'KDC'" open-on-hover location="bottom center"
              transition="scale-transition" :close-on-content-click="false">
              <template v-slot:activator="{ props }">
                <v-card v-bind="props" class="stat-card fill-height py-1 cursor-pointer" color="green-lighten-5"
                  variant="flat">
                  <v-card-text class="text-center pa-2 d-flex flex-column justify-center position-relative">
                    <div v-if="trendIndicators.sales === 'up'" class="trend-badge up" style="top: 4px; right: 4px;">
                      <v-icon size="x-small">mdi-arrow-up</v-icon>
                    </div>
                    <v-icon color="green" size="24" class="mb-1">mdi-cash-multiple</v-icon>
                    <div class="text-h6 font-weight-bold text-green-darken-2">
                      <span v-if="isLoadingStats && animatedSales === 0">...</span>
                      <span v-else>{{ formatRupiah(Number(animatedSales.toFixed(0))) }}</span>
                    </div>
                    <v-chip v-if="!isLoadingStats" size="x-small" color="green" variant="flat"
                      class="font-weight-bold mt-1 align-self-center">
                      {{ Math.round(animatedQty) }} pcs
                    </v-chip>
                    <div class="text-caption text-grey-darken-1 mt-1">Penjualan Hari Ini</div>
                    <v-icon size="x-small" color="grey" class="mt-1">mdi-chevron-down</v-icon>
                  </v-card-text>
                </v-card>
              </template>

              <v-card max-width="350" elevation="4">
                <v-list-item class="bg-green-lighten-4 text-green-darken-4 density-compact">
                  <v-list-item-title class="font-weight-bold text-caption">Ranking Omset Cabang</v-list-item-title>
                </v-list-item>
                <v-divider></v-divider>
                <v-card-text class="pa-0" style="max-height: 300px; overflow-y: auto;">

                  <div v-if="isLoadingStats" class="text-center pa-4">
                    <v-progress-circular indeterminate size="20" color="green"></v-progress-circular>
                  </div>

                  <v-list v-else density="compact" class="py-0">
                    <template v-if="stats.salesBreakdown && stats.salesBreakdown.length > 0">
                      <v-list-item v-for="(item, index) in stats.salesBreakdown" :key="index" density="compact"
                        class="py-2">
                        <v-list-item-title class="text-caption d-flex align-center mb-1">
                          <v-chip size="x-small" color="grey-lighten-2" class="mr-2 font-weight-bold text-grey-darken-2"
                            variant="flat">
                            #{{ index + 1 }}
                          </v-chip>
                          <span class="font-weight-bold">{{ item.nama }}</span>
                        </v-list-item-title>

                        <v-list-item-subtitle class="pl-8">
                          <span class="text-caption font-weight-black text-green-darken-3"
                            style="font-size: 0.85rem !important;">
                            {{ formatRupiah(item.omset) }}
                          </span>
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

            <v-card v-else class="stat-card fill-height py-1" color="green-lighten-5" variant="flat">
              <v-card-text class="text-center pa-2 d-flex flex-column justify-center position-relative">
                <div v-if="trendIndicators.sales === 'up'" class="trend-badge up" style="top: 4px; right: 4px;">
                  <v-icon size="x-small">mdi-arrow-up</v-icon>
                </div>
                <v-icon color="green" size="24" class="mb-1">mdi-cash-multiple</v-icon>
                <div class="text-h6 font-weight-bold text-green-darken-2">
                  <span v-if="isLoadingStats && animatedSales === 0">...</span>
                  <span v-else>{{ formatRupiah(Number(animatedSales.toFixed(0))) }}</span>
                </div>
                <v-chip v-if="!isLoadingStats" size="x-small" color="green" variant="flat"
                  class="font-weight-bold mt-1 align-self-center">
                  {{ Math.round(animatedQty) }} pcs
                </v-chip>
                <div class="text-caption text-grey-darken-1 mt-1">Penjualan Hari Ini</div>
              </v-card-text>
            </v-card>

          </v-col>

          <v-col v-if="!isWarehouseUser" cols="12" sm="3" md="1">
            <v-card class="stat-card fill-height py-1" color="blue-lighten-5" variant="flat">
              <v-card-text class="text-center pa-2 d-flex flex-column justify-center align-center h-100">
                <v-icon color="blue" size="24">mdi-receipt</v-icon>
                <div class="text-h5 font-weight-bold text-blue-darken-2 my-1">
                  <span v-if="isLoadingStats">...</span>
                  <span v-else>{{ Math.round(animatedTx) }}</span>
                </div>
                <div class="text-caption text-grey-darken-1" style="line-height: 1.1;">Trx Hari Ini</div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="6" md="3">
            <v-card class="stat-card fill-height cursor-pointer" :color="healthStatus.color" variant="tonal"
              @click="openParetoDetail">
              <v-tooltip activator="parent" location="top">Klik untuk lihat detail barang</v-tooltip>
              <v-card-text class="text-center pa-2 d-flex flex-column justify-center">
                <div class="d-flex align-center justify-center mb-1">
                  <v-icon size="18" class="mr-1">{{ healthStatus.icon }}</v-icon>
                  <span class="text-caption font-weight-bold opacity-80">
                    {{ authStore.user?.cabang === 'KDC' ? 'KESIAPAN SUPPLY PARETO (DC)' : 'KESIAPAN STOK PARETO' }}
                  </span>
                </div>

                <div class="text-h4 font-weight-black my-0">
                  <span v-if="isLoadingPareto">...</span>
                  <span v-else>{{ paretoStats.score }}%</span>
                </div>

                <div class="text-caption font-weight-bold opacity-80 mb-1">
                  {{ healthStatus.text }}
                </div>

                <div v-if="authStore.user?.cabang !== 'KDC'"
                  class="d-flex justify-space-between px-2 text-caption opacity-70 w-100">
                  <span>Laku: <strong>{{ paretoStats.sku_count }}</strong></span>
                  <span>Target: <strong>{{ paretoStats.buffer_stock.toLocaleString() }}</strong></span>
                </div>
                <div v-else class="text-caption opacity-70 px-2" style="font-size: 0.7rem; line-height: 1.1;">
                  Kemampuan supply ke {{ paretoStats.store_count || 11 }} cabang.
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="4" md="3">
            <v-menu v-if="authStore.user?.cabang === 'KDC'" open-on-hover location="bottom center"
              transition="scale-transition">
              <template v-slot:activator="{ props }">
                <v-card v-bind="props" class="stat-card fill-height py-1 cursor-pointer" color="light-blue-lighten-5"
                  variant="flat">
                  <v-card-text class="text-center pa-2">
                    <v-icon color="light-blue" size="24" class="mb-1">mdi-warehouse</v-icon>
                    <div class="text-h6 font-weight-bold text-light-blue-darken-2">
                      <span v-if="isLoadingStock && animatedTotalStock === 0">...</span>
                      <span v-else>{{ Math.round(animatedTotalStock).toLocaleString('id-ID') }}</span>
                    </div>
                    <div class="text-caption text-grey-darken-1">Total Stok (Semua Cabang)</div>
                    <v-icon size="x-small" color="grey" class="mt-1">mdi-chevron-down</v-icon>
                  </v-card-text>
                </v-card>
              </template>
              <v-card max-width="320" elevation="4">
                <v-list-item class="bg-light-blue-lighten-4 text-light-blue-darken-4 density-compact">
                  <v-list-item-title class="font-weight-bold text-caption">Stok per Cabang</v-list-item-title>
                </v-list-item>
                <v-divider></v-divider>
                <v-card-text class="pa-0" style="max-height: 300px; overflow-y: auto;">
                  <div v-if="isLoadingStockBreakdown" class="text-center pa-2">
                    <v-progress-circular indeterminate size="20"></v-progress-circular>
                  </div>
                  <v-list v-else density="compact" class="py-0">
                    <v-list-item v-for="item in stockBreakdown" :key="item.kode_cabang" density="compact">
                      <v-list-item-title class="text-caption">{{ item.nama_cabang || item.kode_cabang
                        }}</v-list-item-title>
                      <template #append><span class="text-caption font-weight-bold">{{
                        item.totalStock.toLocaleString('id-ID')
                          }}</span></template>
                    </v-list-item>
                  </v-list>
                </v-card-text>
              </v-card>
            </v-menu>

            <v-card v-else class="stat-card fill-height py-1" color="light-blue-lighten-5" variant="flat">
              <v-card-text class="text-center pa-2">
                <v-icon color="light-blue" size="24" class="mb-1">mdi-package-variant-closed</v-icon>
                <div class="text-h6 font-weight-bold text-light-blue-darken-2">
                  <span v-if="isLoadingStock && animatedTotalStock === 0">...</span>
                  <span v-else>{{ Math.round(animatedTotalStock).toLocaleString('id-ID') }}</span>
                </div>
                <div class="text-caption text-grey-darken-1">Total Stok (Pcs)</div>
                <div v-if="!isLoadingStats && !isLoadingStock"
                  class="d-flex justify-center ga-2 mt-1 pt-1 border-t w-100">
                  <span class="text-caption text-success font-weight-bold"><v-icon size="x-small"
                      start>mdi-arrow-up</v-icon>{{
                        stats.todayStokIn }}</span>
                  <span class="text-caption text-error font-weight-bold"><v-icon size="x-small"
                      start>mdi-arrow-down</v-icon>{{
                        stats.todayStokOut }}</span>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col v-if="!isWarehouseUser" cols="12" sm="4" md="3">
            <v-menu open-on-hover location="bottom center" transition="scale-transition"
              :close-on-content-click="false">
              <template v-slot:activator="{ props }">
                <v-card v-bind="props" class="stat-card fill-height py-1 cursor-pointer" color="orange-lighten-5"
                  variant="flat">
                  <v-card-text class="text-center pa-2">
                    <v-icon color="orange-darken-1" size="24" class="mb-1">mdi-clock-alert-outline</v-icon>
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
                  <v-list-item-title class="font-weight-bold text-caption">
                    {{ authStore.user?.cabang === 'KDC' ? 'Piutang per Cabang' : 'Top Invoice Belum Lunas' }}
                  </v-list-item-title>
                </v-list-item>
                <v-divider />
                <v-card-text class="pa-0" style="max-height: 300px; overflow-y: auto;">
                  <div v-if="isLoadingPiutangBreakdown" class="text-center pa-2">
                    <v-progress-circular indeterminate size="20"></v-progress-circular>
                  </div>

                  <v-list v-else-if="authStore.user?.cabang === 'KDC'" density="compact" class="py-0">
                    <v-list-item v-for="item in piutangBreakdown" :key="item.cabang_kode" density="compact">
                      <v-list-item-title class="text-caption">{{ item.cabang_nama }}</v-list-item-title>
                      <template #append><span class="text-caption font-weight-bold">{{ formatRupiah(item.sisa_piutang)
                          }}</span></template>
                    </v-list-item>
                  </v-list>

                  <v-list v-else density="compact" class="py-0">
                    <v-list-item v-for="inv in piutangByInvoice" :key="inv.invoice" density="compact" class="px-3">
                      <div class="d-flex justify-space-between w-100">
                        <div class="d-flex flex-column text-truncate" style="max-width: 60%;">
                          <span class="text-caption font-weight-bold">{{ inv.invoice }}</span>
                          <span class="text-caption text-grey" style="font-size: 0.65rem;">{{ inv.tanggal }}</span>
                        </div>
                        <span class="text-caption font-weight-bold">{{ formatRupiah(inv.sisa_piutang) }}</span>
                      </div>
                    </v-list-item>
                  </v-list>
                </v-card-text>
              </v-card>
            </v-menu>
          </v-col>

        </v-row>

        <v-row v-if="!isWarehouseUser" class="mb-4">
          <v-col cols="12" lg="8">
            <v-card elevation="2" class="rounded-lg bg-surface">
              <v-card-title class="py-3 px-4 border-b">
                <div class="d-flex align-center justify-space-between w-100">
                  <div class="d-flex align-center text-primary font-weight-bold">
                    <v-icon class="mr-2" color="primary">mdi-chart-timeline-variant</v-icon>Grafik Penjualan
                  </div>
                  <div class="bg-surface-variant rounded-lg pa-1 d-none d-sm-flex">
                    <v-btn-toggle v-model="chartType" variant="text" density="compact" mandatory divided
                      class="chart-type-toggle">
                      <v-btn value="bar" size="small" :color="chartType === 'bar' ? 'primary' : 'medium-emphasis'"
                        class="rounded-s-lg">
                        <v-icon>mdi-chart-bar</v-icon>
                      </v-btn>
                      <v-btn value="line" size="small" :color="chartType === 'line' ? 'primary' : 'medium-emphasis'">
                        <v-icon>mdi-chart-line</v-icon>
                      </v-btn>
                      <v-btn value="area" size="small" :color="chartType === 'area' ? 'primary' : 'medium-emphasis'"
                        class="rounded-e-lg">
                        <v-icon>mdi-chart-bell-curve-cumulative</v-icon>
                      </v-btn>
                    </v-btn-toggle>
                  </div>
                </div>
              </v-card-title>
              <v-card-text class="pa-4">
                <div class="filter-bar d-flex flex-column flex-md-row align-md-center justify-space-between gap-3 mb-6">
                  <v-btn-toggle v-model="chartGroupBy" variant="outlined" density="compact" color="primary" mandatory
                    rounded="lg" class="mr-auto mb-2 mb-md-0 shadow-sm" style="height: 36px;">
                    <v-btn value="day" class="text-caption font-weight-bold px-4">Harian</v-btn>
                    <v-btn value="week" class="text-caption font-weight-bold px-4">Mingguan</v-btn>
                    <v-btn value="month" class="text-caption font-weight-bold px-4">Bulanan</v-btn>
                  </v-btn-toggle>
                  <div class="d-flex flex-wrap align-center justify-end gap-2" style="gap: 8px;">
                    <v-select v-model="chartFilters.cabang" :items="cabangList" item-title="nama" item-value="kode"
                      density="compact" variant="outlined" hide-details prepend-inner-icon="mdi-store-outline"
                      bg-color="surface" class="filter-input-select" :readonly="authStore.user?.cabang !== 'KDC'"
                      style="min-width: 220px;"></v-select>

                    <div class="d-flex align-center border rounded px-2 bg-surface"
                      style="height: 40px; border-color: rgba(var(--v-border-color), var(--v-border-opacity)) !important;">
                      <input type="date" v-model="chartFilters.startDate" class="date-native-input text-body-2" />
                      <span class="mx-2 text-caption text-medium-emphasis">s/d</span>
                      <input type="date" v-model="chartFilters.endDate" class="date-native-input text-body-2" />
                    </div>
                  </div>
                </div>
                <div v-if="isLoadingChart" class="d-flex flex-column align-center justify-center"
                  style="height: 320px;">
                  <v-progress-circular indeterminate color="primary" size="48" width="4" />
                  <div class="mt-3 text-caption text-medium-emphasis">Sedang memuat data grafik...</div>
                </div>
                <div v-else style="height: 350px; position: relative;">
                  <Bar v-if="chartType === 'bar'" :data="chartData as any" :options="targetChartOptions as any" />
                  <Line v-else :data="chartData as any" :options="targetChartOptions as any" />
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" lg="4">
            <v-card elevation="2" class="d-flex flex-column bg-surface" style="height: 100%;">
              <v-card-title class="d-flex align-center flex-shrink-0">
                <v-icon class="mr-2" color="info">mdi-bell-ring-outline</v-icon>Perlu Tindakan (Penjualan)
              </v-card-title>
              <v-card-text class="flex-grow-1 overflow-y-auto" style="max-height: calc(100% - 64px);">
                <div v-if="isLoadingActions" class="text-center pa-4">
                  <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </div>
                <div v-else-if="pendingActions.length === 0" class="text-center pa-4">
                  <v-icon size="48" color="success">mdi-check-all</v-icon>
                  <div class="mt-2 text-medium-emphasis">Tidak ada tindakan tertunda. Kerja bagus!</div>
                </div>
                <v-list v-else dense bg-color="transparent" lines="two">
                  <template v-for="(item, index) in pendingActions" :key="item.key">
                    <v-list-item :to="item.to" class="mb-1" rounded="lg" variant="tonal">
                      <template #prepend>
                        <v-avatar :icon="item.icon" color="info" variant="flat" class="text-white"></v-avatar>
                      </template>
                      <v-list-item-title class="font-weight-bold">{{ item.title }}</v-list-item-title>
                      <v-list-item-subtitle class="text-medium-emphasis">Tugas yang perlu
                        ditindaklanjuti</v-list-item-subtitle>
                      <template #append>
                        <v-chip color="info" size="large" variant="flat" class="font-weight-bold">{{ item.count
                          }}</v-chip>
                      </template>
                    </v-list-item>
                    <v-divider v-if="index < pendingActions.length - 1" class="my-1"></v-divider>
                  </template>
                </v-list>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" :lg="isWarehouseUser ? 12 : 6">
            <v-card class="mb-4 bg-surface" elevation="2">
              <v-card-title class="d-flex align-center bg-blue-grey-lighten-5 text-blue-grey-darken-3">
                <v-icon class="mr-2" color="primary">mdi-history</v-icon><span class="text-h6">Sering Diakses</span>
              </v-card-title>
              <v-card-text class="pa-6">
                <div v-if="isLoadingFrequent" class="text-center pa-4">
                  <v-progress-circular indeterminate color="primary" size="32" />
                  <div class="text-caption mt-2">Memuat menu...</div>
                </div>
                <div v-else-if="frequentMenus.length === 0" class="text-center text-medium-emphasis">
                  Belum ada riwayat akses menu.
                </div>
                <v-row v-else class="justify-center">
                  <v-col v-for="menu in frequentMenus" :key="menu.title" cols="4" sm="2" class="text-center">
                    <v-tooltip :text="menu.title" location="bottom">
                      <template v-slot:activator="{ props }">
                        <v-btn v-bind="props" :to="menu.to" :color="menu.color" icon size="large" variant="flat"
                          class="mb-2 transition-swing" elevation="3">
                          <v-icon size="28">{{ menu.icon || 'mdi-star' }}</v-icon>
                        </v-btn>
                      </template>
                    </v-tooltip>
                    <div class="text-caption text-medium-emphasis font-weight-medium text-truncate px-1">
                      {{ menu.title }}
                    </div>
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>

            <v-card v-if="!isWarehouseUser" elevation="2" class="mb-4 bg-surface" hover>
              <v-card-title class="d-flex align-center bg-blue-lighten-5 text-blue-darken-3">
                <v-icon class="mr-2" color="primary">mdi-target</v-icon><span class="text-h6">Pencapaian Target</span>
              </v-card-title>
              <v-card-text class="pa-6">
                <div v-if="isLoadingSalesTarget" class="text-center pa-8">
                  <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
                </div>
                <div v-else>
                  <v-row align="center">
                    <v-col cols="12" sm="5" class="text-center">
                      <div style="height: 250px; position: relative;">
                        <Bar :data="targetChartData" :options="targetChartOptions as any" />
                      </div>
                    </v-col>
                    <v-col cols="12" sm="7">
                      <v-card variant="outlined" class="mb-3">
                        <v-card-text>
                          <div class="text-caption text-medium-emphasis mb-1">Realisasi</div>
                          <div class="text-h5 font-weight-bold"
                            :class="isOverTarget ? 'text-success' : 'text-deep-orange-darken-1'">
                            <span class="animated-number">
                              {{ formatRupiah(Number(animatedTargetRealization.toFixed(0))) }}
                            </span>
                          </div>
                          <div class="text-caption mt-1"
                            :class="getProgressColor(targetPercentage).includes('#') ? '' : `text-${getProgressColor(targetPercentage)}`"
                            :style="{ color: getProgressColor(targetPercentage) }">
                            {{ targetPercentage.toFixed(2) }}% dari target
                            <v-icon v-if="isOverTarget" small color="success">mdi-arrow-up-bold</v-icon>
                          </div>
                        </v-card-text>
                      </v-card>
                      <v-card variant="outlined">
                        <v-card-text>
                          <div class="text-caption text-medium-emphasis mb-1">Target</div>
                          <div class="text-h6 font-weight-medium">{{ formatRupiah(salesTargetSummary.target) }}</div>
                        </v-card-text>
                      </v-card>
                    </v-col>
                  </v-row>
                </div>
              </v-card-text>
            </v-card>

            <v-card v-if="!isWarehouseUser && authStore.user?.cabang === 'KDC'" elevation="2"
              class="mb-4 rounded-lg d-flex flex-column bg-surface">
              <v-card-title
                class="d-flex flex-column flex-sm-row align-start align-sm-center bg-red-lighten-5 py-2 gap-2 pr-2 text-red-darken-4">
                <div class="d-flex align-center flex-grow-1">
                  <v-icon class="mr-2" color="red">mdi-close-octagon-outline</v-icon><span class="text-h6">Stok
                    Kosong</span>
                </div>
                <v-chip v-if="stokKosongList.length > 0" size="x-small" color="red-darken-4"
                  class="ms-2 font-weight-black" variant="flat">
                  {{ stokKosongList.length }} Item
                </v-chip>

                <v-btn v-if="stokKosongList.length > 0" size="x-small" color="success" variant="text" class="ms-1" icon
                  @click="exportStokKosong">
                  <v-icon size="18">mdi-file-excel</v-icon>

                  <v-tooltip activator="parent" location="top">Export ke Excel</v-tooltip>
                </v-btn>
                <div class="d-flex align-center gap-2 w-100 w-sm-auto" style="max-width: 400px;">
                  <div v-if="authStore.user?.cabang === 'KDC'" style="width: 140px;">
                    <v-select v-model="stokKosongCabang" :items="cabangList" item-title="nama" item-value="kode"
                      density="compact" variant="outlined" hide-details bg-color="surface" placeholder="Pilih Cabang"
                      class="text-caption"></v-select>
                  </div>
                  <div class="flex-grow-1">
                    <v-text-field v-model="searchStokKosong" density="compact" variant="outlined" label="Cari Barang..."
                      prepend-inner-icon="mdi-magnify" hide-details bg-color="surface" single-line
                      class="text-caption"></v-text-field>
                  </div>
                </div>
              </v-card-title>
              <v-card-text class="pa-0">
                <div v-if="isLoadingStokKosong" class="text-center pa-6">
                  <v-progress-circular indeterminate color="red" size="32" />
                  <div class="mt-2 text-caption">Mencari data...</div>
                </div>
                <div v-else-if="stokKosongList.length === 0" class="text-center pa-6 text-medium-emphasis">
                  <v-icon size="40" class="mb-2">mdi-package-variant</v-icon>
                  <div>Pilih filter cabangnya dulu.</div>
                </div>
                <v-list v-else bg-color="transparent" class="scrollable-list"
                  style="max-height: 300px; overflow-y: auto;">
                  <TransitionGroup tag="div" :css="false" @enter="onListEnter">
                    <v-list-item v-for="(item, index) in stokKosongList" :key="item.kode + item.ukuran"
                      :data-index="index" class="px-3 py-2 border-b" lines="two">
                      <template #prepend>
                        <v-avatar color="red-lighten-4" size="36" class="mr-3 text-red-darken-4 font-weight-bold">
                          {{ item.ukuran }}
                        </v-avatar>
                      </template>
                      <v-list-item-title class="font-weight-bold text-body-2 mb-1 text-wrap">
                        {{ item.nama_barang }}
                      </v-list-item-title>
                      <v-list-item-subtitle class="d-flex align-center text-caption text-medium-emphasis">
                        <span class="mr-2">{{ item.kode }}</span>
                        <span v-if="item.barcode"><v-icon size="x-small" start>mdi-barcode</v-icon>{{ item.barcode
                          }}</span>
                      </v-list-item-subtitle>
                      <template #append>
                        <v-chip color="red" size="x-small" variant="flat" class="font-weight-bold">
                          {{ item.stok_akhir }} pcs
                        </v-chip>
                      </template>
                    </v-list-item>
                  </TransitionGroup>
                </v-list>
              </v-card-text>
            </v-card>

            <v-card v-if="!isWarehouseUser" class="mb-4 bg-surface" elevation="2">
              <v-card-title class="d-flex align-center justify-space-between bg-green-lighten-5 text-green-darken-4">
                <div class="d-flex align-center">
                  <v-icon class="mr-2" color="success">mdi-point-of-sale</v-icon><span class="text-h6">Penjualan
                    Terbaru</span>
                </div>
                <v-btn size="small" variant="text" color="success" to="/transaksi/penjualan/invoice"
                  append-icon="mdi-chevron-right">Lihat Semua</v-btn>
              </v-card-title>
              <v-card-text class="pa-4">
                <div v-if="isLoadingTransactions" class="text-center pa-8">
                  <v-progress-circular indeterminate color="success" size="48"></v-progress-circular>
                </div>
                <div v-else-if="recentTransactions.length === 0" class="text-center pa-8">
                  <v-icon size="64" color="grey">mdi-receipt-text-outline</v-icon>
                  <div class="mt-3 text-medium-emphasis">Belum ada transaksi hari ini</div>
                </div>
                <div v-else style="max-height: 300px; overflow-y: auto; overflow-x: hidden;">
                  <TransitionGroup tag="div" :css="false" @enter="onListEnter">
                    <div v-for="(transaction, index) in recentTransactions" :key="transaction.id" :data-index="index"
                      class="mb-2">
                      <v-list-item class="px-2 border rounded-lg bg-surface elevation-1" lines="two">
                        <template #prepend>
                          <v-avatar color="success-lighten-1" size="40">
                            <v-icon color="white">mdi-cart-check</v-icon>
                          </v-avatar>
                        </template>
                        <v-list-item-title class="font-weight-bold">{{ transaction.customer }}</v-list-item-title>
                        <v-list-item-subtitle class="mt-1 text-caption text-medium-emphasis">
                          {{ transaction.id }} • {{ transaction.time }}
                        </v-list-item-subtitle>
                        <template #append>
                          <v-chip color="success" size="small" variant="flat" class="font-weight-bold price-pulse">
                            {{ formatRupiah(transaction.amount) }}
                          </v-chip>
                        </template>
                      </v-list-item>
                    </div>
                  </TransitionGroup>
                </div>
              </v-card-text>
            </v-card>

            <v-card v-if="!isWarehouseUser && authStore.user?.cabang === 'KDC'" elevation="2"
              class="mb-4 rounded-lg d-flex flex-column bg-surface">
              <v-card-title class="d-flex align-center bg-blue-lighten-5 py-3 text-blue-darken-3">
                <v-icon class="mr-2" color="primary">mdi-chart-box-outline</v-icon>
                <span class="text-subtitle-1 font-weight-bold">Trend Penjualan Item (Top 10)</span>
                <v-spacer></v-spacer>
              </v-card-title>
              <v-card-text class="pa-0 flex-grow-1">
                <div v-if="isLoadingItemTrend" class="text-center pa-8">
                  <v-progress-circular indeterminate color="primary" size="40" />
                  <div class="mt-2 text-caption">Analisa data barang...</div>
                </div>
                <div v-else>
                  <v-data-table :headers="itemTrendHeaders" :items="itemTrendData" density="compact" hover
                    class="text-caption trend-table" hide-default-footer items-per-page="-1">
                    <template #[`item.nama`]="{ item }">
                      <div class="py-2">
                        <div class="font-weight-bold text-wrap">{{ item.nama }}</div>
                        <div class="text-medium-emphasis text-xs mt-1">{{ item.kode }}</div>
                      </div>
                    </template>
                    <template #[`item.bulan_ini`]="{ item }">
                      <span class="font-weight-black text-primary" style="font-size: 1.1em;">{{ item.bulan_ini }}</span>
                    </template>
                    <template #[`item.trend`]="{ item }">
                      <v-icon :icon="getTrendIcon(item)" :color="getTrendColor(item)" size="small" />
                    </template>
                  </v-data-table>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" :lg="isWarehouseUser ? 12 : 6">

            <v-card elevation="2" class="mb-4 bg-surface">
              <v-card-title class="d-flex align-center bg-orange-lighten-5 text-orange-darken-4">
                <v-icon class="mr-2" color="warning">mdi-alert-circle</v-icon>
                <span class="text-h6">Peringatan Stok Menipis</span>
              </v-card-title>
              <v-card-text class="pa-4">
                <div v-if="isLoadingLowStock" class="text-center pa-8">
                  <v-progress-circular indeterminate color="warning" size="48"></v-progress-circular>
                </div>
                <div v-else-if="lowStockProducts.length === 0" class="text-center pa-8">
                  <v-icon size="64" color="success">mdi-check-circle-outline</v-icon>
                  <div class="mt-3 text-h6">Stok Aman!</div>
                </div>
                <div v-else>
                  <v-list bg-color="transparent" class="scrollable-list" style="max-height: 300px; overflow-y: auto;">
                    <TransitionGroup tag="div" :css="false" @enter="onListEnter">
                      <v-list-item v-for="(product, i) in lowStockProducts" :key="`${product.KODE}-${product.UKURAN}`"
                        :data-index="i" class="px-3 mb-2 py-2" rounded="lg" border>
                        <template #prepend>
                          <v-avatar color="error" size="48" variant="tonal" class="mr-2">
                            <span class="text-h6 font-weight-black">{{ product.UKURAN }}</span>
                          </v-avatar>
                        </template>
                        <div class="d-flex flex-column gap-1">
                          <div class="text-subtitle-2 font-weight-bold text-wrap">{{ product.NAMA }}</div>
                          <div class="d-flex align-center text-caption text-medium-emphasis mt-1">
                            <v-chip size="x-small" label class="mr-2 px-2" color="grey-lighten-2" variant="flat">
                              <span class="text-grey-darken-3 font-weight-medium">{{ product.KODE }}</span>
                            </v-chip>
                            <span v-if="product.BARCODE" class="d-flex align-center">
                              <v-icon start size="x-small" icon="mdi-barcode" class="mr-1"></v-icon> {{ product.BARCODE
                              }}
                            </span>
                          </div>
                          <div class="d-flex align-center mt-2">
                            <v-chip size="x-small" color="error" variant="flat" class="mr-2 font-weight-bold">
                              Sisa: {{ product.TOTAL }}
                            </v-chip>
                            <div class="d-flex align-center text-caption text-info font-weight-medium">
                              <v-icon size="x-small" start icon="mdi-speedometer" class="mr-1"></v-icon>
                              Laku: {{ Number(product.AVG_SALE).toFixed(1) }} /bln
                            </div>
                          </div>
                        </div>
                      </v-list-item>
                    </TransitionGroup>
                  </v-list>
                  <v-btn color="warning" variant="tonal" block class="mt-4" to="/laporan/stok/real-time"
                    prepend-icon="mdi-file-chart-outline">
                    Lihat Laporan Lengkap
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>

            <v-card elevation="3" class="mt-4 bg-surface" hover @click="router.push('/laporan/stok/dead-stok')">
              <v-card-text>
                <div v-if="isLoadingStagnantStock" class="text-center pa-2">
                  <v-progress-circular indeterminate color="deep-orange" size="24"></v-progress-circular>
                </div>
                <div v-else class="d-flex align-center">
                  <v-icon size="40" class="mr-4" color="deep-orange">mdi-archive-arrow-down-outline</v-icon>
                  <div>
                    <div class="text-caption text-deep-orange font-weight-bold">Nilai Stok Stagnan (30 Hari)</div>
                    <div class="text-h5 font-weight-bold text-deep-orange">
                      <span v-if="isLoadingStagnantStock && animatedStagnant === 0">...</span>
                      <span v-else class="animated-number">
                        {{ formatRupiah(Number(animatedStagnant.toFixed(0))) }}
                      </span>
                    </div>
                  </div>
                </div>
              </v-card-text>
            </v-card>

            <v-card v-if="!isWarehouseUser" elevation="2" class="mb-4 bg-surface">
              <v-card-title class="d-flex align-center bg-amber-lighten-5 py-2 pr-2 text-amber-darken-4">
                <div class="d-flex align-center flex-grow-1">
                  <v-icon class="mr-2" color="amber-darken-2">mdi-star-circle-outline</v-icon>
                  <span class="text-h6">Produk Terlaris</span>
                </div>
                <div v-if="authStore.user?.cabang === 'KDC'" style="width: 150px;">
                  <v-select v-model="topProductsCabang" :items="[{ kode: 'ALL', nama: 'Semua Cabang' }, ...cabangList]"
                    item-title="nama" item-value="kode" density="compact" variant="outlined" hide-details
                    bg-color="surface" color="amber-darken-3" class="text-caption font-weight-bold"></v-select>
                </div>
              </v-card-title>
              <v-card-text class="pa-4">
                <div v-if="isLoadingTopProducts" class="text-center pa-8">
                  <v-progress-circular indeterminate color="amber" size="48"></v-progress-circular>
                </div>
                <v-list v-else bg-color="transparent" style="max-height: 300px; overflow-y: auto;">
                  <v-list-item v-for="(product, index) in topProducts" :key="product.KODE + product.UKURAN"
                    class="px-2 mb-2" rounded="lg" border>
                    <template #prepend>
                      <v-avatar :color="index === 0 ? 'amber' : index === 1 ? 'blue-grey-lighten-1' : 'brown-lighten-1'"
                        size="40">
                        <span class="font-weight-bold text-white">{{ index + 1 }}</span>
                      </v-avatar>
                    </template>
                    <v-list-item-title class="font-weight-bold text-wrap">{{ product.NAMA }}</v-list-item-title>
                    <v-list-item-subtitle class="mt-1 d-flex align-center text-medium-emphasis">
                      <v-chip size="x-small" class="mr-2">{{ product.KODE }}</v-chip>
                      <v-chip size="x-small" color="grey-darken-3" variant="flat">{{ product.UKURAN }}</v-chip>
                    </v-list-item-subtitle>
                    <template #append>
                      <v-chip color="amber-darken-3" size="small" variant="flat" class="font-weight-bold">
                        {{ product.TOTAL?.toLocaleString('id-ID') }} pcs
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>

            <v-card v-if="authStore.user?.cabang === 'KDC'" elevation="2" class="mb-4 bg-surface">
              <v-card-title class="d-flex align-center bg-purple-lighten-5 text-purple-darken-4">
                <v-icon class="mr-2" color="purple">mdi-trophy-outline</v-icon>
                <span class="text-h6">Ranking Performa Cabang</span>
                <v-spacer></v-spacer>
                <v-chip v-if="!isLoadingPerformance" size="small" color="purple" variant="flat">
                  {{ branchPerformances.length }} Cabang
                </v-chip>
              </v-card-title>
              <v-card-text class="pa-0">
                <div v-if="isLoadingPerformance" class="text-center pa-6">
                  <v-progress-circular indeterminate color="purple" size="40" />
                  <div class="mt-2 text-caption">Memuat data performa...</div>
                </div>
                <v-table v-else density="compact" hover class="bg-surface text-high-emphasis">
                  <thead>
                    <tr>
                      <th class="text-center" width="50">Rank</th>
                      <th class="text-left">Cabang</th>
                      <th class="text-right">Omset (Act)</th>
                      <th class="text-right">Target</th>
                      <th class="text-right" width="150">Ach %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, index) in branchPerformances" :key="item.kode_cabang">
                      <td class="text-center font-weight-bold">
                        <v-avatar size="24" :color="index < 3 ? 'amber-lighten-4' : 'grey-lighten-3'" variant="flat">
                          <span :class="index < 3 ? 'text-amber-darken-4' : 'text-grey-darken-2'"
                            style="font-size: 12px;">
                            {{ index + 1 }}
                          </span>
                        </v-avatar>
                      </td>
                      <td class="font-weight-medium">
                        {{ item.nama_cabang }}
                        <div class="text-caption text-medium-emphasis">{{ item.kode_cabang }}</div>
                      </td>
                      <td class="text-right">
                        <div class="font-weight-bold text-body-2">{{ formatRupiah(item.nominal) }}</div>
                      </td>
                      <td class="text-right text-medium-emphasis text-caption">
                        {{ formatRupiah(item.target) }}
                      </td>
                      <td class="text-right">
                        <div class="d-flex align-center justify-end ga-2">
                          <span :class="`text-${getAchColor(item.ach)} font-weight-bold`">
                            {{ item.ach.toFixed(1) }}%
                          </span>
                          <v-progress-circular :model-value="item.ach" :color="getAchColor(item.ach)" size="20"
                            width="3" bg-color="grey-lighten-2"></v-progress-circular>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card-text>
            </v-card>

            <v-card v-if="!isWarehouseUser && authStore.user?.cabang === 'KDC'" elevation="2"
              class="mb-4 rounded-lg bg-surface">
              <v-card-title class="d-flex align-center bg-teal-lighten-5 py-3 text-teal-darken-4">
                <v-icon class="mr-2" color="teal">mdi-chart-pie</v-icon>
                <span class="text-subtitle-1 font-weight-bold">Kontribusi Omset Cabang</span>
              </v-card-title>
              <v-card-text class="pa-4">
                <div v-if="isLoadingPerformance" class="text-center pa-8">
                  <v-progress-circular indeterminate color="teal" size="40" />
                  <div class="mt-2 text-caption">Menghitung kontribusi...</div>
                </div>
                <div v-else style="height: 300px; position: relative;">
                  <Pie :data="branchDistributionData" :options="pieChartOptions" />
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </div>
  </v-container>

  <v-dialog v-model="showParetoDetail" max-width="1000" transition="dialog-bottom-transition">
    <v-card class="rounded-lg d-flex flex-column" style="height: 90vh; max-height: 90vh;">

      <v-toolbar color="white" elevation="1" class="pr-2 flex-grow-0 z-index-10">
        <v-toolbar-title class="font-weight-bold">
          Analisa Stok Pareto
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" color="grey" @click="showParetoDetail = false"></v-btn>
      </v-toolbar>

      <div class="bg-grey-lighten-5 pa-4 pb-2 flex-grow-0 z-index-10">
        <v-card class="pa-2 mb-2" elevation="0" border>
          <div class="d-flex flex-wrap gap-4 align-center">
            <v-tabs v-model="filterPareto" density="compact" color="primary" show-arrows>
              <v-tab value="ALL" class="text-caption text-capitalize">Semua</v-tab>
              <v-tab value="KRITIS" class="text-caption text-capitalize">
                <v-icon start size="small" color="error">mdi-alert-circle</v-icon> Kritis
              </v-tab>
              <v-tab value="AMAN" class="text-caption text-capitalize">Aman</v-tab>
              <v-tab value="OVER" class="text-caption text-capitalize">Berlebih</v-tab>
            </v-tabs>
            <v-spacer></v-spacer>
            <v-text-field v-model="searchPareto" prepend-inner-icon="mdi-magnify" placeholder="Cari Kode / Nama..."
              density="compact" variant="solo-filled" flat hide-details style="min-width: 250px;"
              class="rounded-lg"></v-text-field>
          </div>
        </v-card>
      </div>

      <v-card-text class="bg-grey-lighten-5 pa-4 pt-0 flex-grow-1" style="overflow-y: auto; overflow-x: hidden;">
        <v-data-table :headers="paretoHeaders" :items="filteredParetoItems" :loading="isLoadingParetoDetail"
          :item-value="(item) => `${item.kode}-${item.ukuran}`" :show-expand="authStore.user?.cabang === 'KDC'" hover
          density="default" fixed-header class="pareto-table elevation-0 rounded-lg border">
          <template #[`item.rank`]="{ item }">
            <div class="font-weight-black text-h6 text-grey-lighten-1">#{{ item.rank }}</div>
          </template>

          <template #[`item.nama`]="{ item }">
            <div class="py-2">
              <div class="font-weight-bold text-body-2 text-high-emphasis">{{ item.nama }}</div>
              <div class="d-flex align-center mt-1">
                <v-chip size="x-small" color="grey-lighten-3" class="mr-2 font-weight-bold text-grey-darken-3">{{
                  item.kode }}</v-chip>
                <v-chip size="x-small" color="blue-lighten-5" class="font-weight-bold text-blue-darken-3">{{ item.ukuran
                  }}</v-chip>
              </div>
            </div>
          </template>

          <template #[`item.stok`]="{ item }">
            <div class="text-right">
              <div class="font-weight-bold text-body-1" :class="{ 'text-error': item.stok < item.target }">
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
              <v-chip size="small" :color="item.color" variant="tonal" class="font-weight-bold mb-1">
                {{ item.status }}
              </v-chip>
              <v-progress-linear :model-value="Math.min((item.stok / item.target) * 100, 100)" :color="item.color"
                height="4" rounded style="width: 60px;"></v-progress-linear>
            </div>
          </template>

          <template v-if="authStore.user?.cabang === 'KDC'" #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns?.length || 10" class="bg-grey-lighten-4 pa-0">
                <div class="px-6 py-4">
                  <div class="d-flex align-center mb-3">
                    <v-icon size="small" class="mr-2" color="primary">mdi-store-marker</v-icon>
                    <span class="text-subtitle-2 font-weight-bold text-grey-darken-3">
                      Rincian Stok Cabang: <span class="text-primary">{{ item.nama }} ({{ item.ukuran }})</span>
                    </span>
                    <v-spacer></v-spacer>
                    <v-chip size="x-small" variant="outlined" color="grey-darken-1">
                      Target/Toko: <strong>{{ item.buffer_per_toko || 0 }} pcs</strong>
                    </v-chip>
                  </div>
                  <v-divider class="mb-3 border-opacity-25"></v-divider>
                  <v-row dense>
                    <v-col v-for="cabang in (item.branches || [])" :key="cabang.nama" cols="12" sm="6" md="4" lg="3">
                      <v-card flat border class="d-flex justify-space-between align-center px-3 py-2"
                        :color="cabang.status === 'KRITIS' ? 'red-lighten-5' : 'white'"
                        :style="cabang.status === 'KRITIS' ? 'border-color: #ffcdd2 !important;' : ''">
                        <div class="d-flex align-center overflow-hidden mr-2">
                          <v-icon size="10" class="mr-2"
                            :color="cabang.status === 'KRITIS' ? 'error' : (cabang.status === 'OVER' ? 'warning' : 'success')">
                            mdi-circle
                          </v-icon>
                          <div class="d-flex flex-column text-truncate">
                            <span class="text-caption font-weight-bold text-truncate text-grey-darken-3">
                              {{ cabang.nama }}
                            </span>
                          </div>
                        </div>
                        <div class="text-right">
                          <div class="font-weight-black text-body-2"
                            :class="cabang.status === 'KRITIS' ? 'text-red' : 'text-grey-darken-2'">
                            {{ cabang.stok }}
                          </div>
                        </div>
                      </v-card>
                    </v-col>
                    <v-col v-if="!item.branches || item.branches.length === 0" cols="12">
                      <div class="text-center text-caption text-grey py-4 border dashed rounded bg-white">
                        <v-icon class="mb-1" color="grey-lighten-1">mdi-database-off</v-icon>
                        <div>Belum ada data distribusi stok untuk item ini.</div>
                      </div>
                    </v-col>
                  </v-row>
                </div>
              </td>
            </tr>
          </template>

        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>

</template>

<style scoped>
/* Gunakan variable CSS untuk text color */
.date-native-input {
  border: none;
  outline: none;
  color: rgb(var(--v-theme-on-surface));
  /* [FIX] Warna teks input mengikuti tema */
  font-family: inherit;
  font-size: 0.875rem;
  width: 110px;
  cursor: pointer;
  background-color: transparent;
  /* [FIX] Transparan agar warna card tembus */
}

/* Scrollbar styling agar rapi di dark mode */
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

/* --- CSS LAINNYA TETAP SAMA --- */
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
  background-color: #4CAF50;
}

.trend-badge.down {
  background-color: #F44336;
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

/* ==================================
   1. LANDING PAGE STYLES
   ================================== */
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
  background: linear-gradient(135deg,
      rgba(0, 0, 0, 0.6) 0%,
      /* Darker overlay for better contrast */
      rgba(0, 0, 0, 0.85) 100%);
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
  /* White transparent for glass effect */
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
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.3) 60%, rgba(0, 0, 0, 0) 100%);
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
  background: linear-gradient(180deg, rgb(var(--v-theme-surface)) 0%, rgb(var(--v-theme-primary)) 100%);
  border-radius: 20px;
  padding: 24px 24px 32px 24px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2) !important;
  position: relative;
  overflow: hidden;
}

/* Override gradient untuk dark mode agar lebih soft */
.v-theme--dark .deep-sky-gradient {
  background: linear-gradient(180deg, #1E1E1E 0%, #0D47A1 100%);
  border-color: rgba(255, 255, 255, 0.1);
}

/* Override gradient light mode (biru langit) */
.v-theme--light .deep-sky-gradient {
  background: linear-gradient(180deg, #FFFFFF 0%, #29B6F6 45%, #01579B 100%);
  border-color: rgba(255, 255, 255, 0.8);
}

/* --- RUNNING TEXT PROMO --- */
.promo-ticker-container {
  display: flex;
  align-items: stretch;
  border-radius: 6px;
  overflow: hidden;
  border-left: 3px solid #E91E63;
  height: 32px;
  margin-top: 4px;
  position: sticky;
  top: 70px;
  z-index: 10;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  /* Background container ikut tema (Putih/Hitam) */
  background-color: rgb(var(--v-theme-surface));
}

.ticker-label {
  background: #E91E63;
  color: white;
  padding: 0 12px;
  display: flex;
  align-items: center;
  z-index: 2;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  font-family: 'Roboto', sans-serif;
}

.ticker-track-wrapper {
  flex-grow: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
}

/* [MODE TERANG] - Background Pink Muda */
.v-theme--light .ticker-track-wrapper {
  background-color: #FFF0F5 !important;
}

/* [MODE GELAP] - Background Transparan */
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

/* [MODE TERANG] - Teks Pink Tua (Kembali ke Asal) */
.v-theme--light .ticker-content {
  color: #C2185B !important;
  font-weight: 500;
  text-shadow: none;
}

/* [MODE GELAP] - Teks Putih Tebal */
.v-theme--dark .ticker-content {
  color: #FFFFFF !important;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
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

/* Pastikan header tabel tetap sticky dan berwarna putih */
.pareto-table :deep(th) {
  background-color: white !important;
  z-index: 5 !important;
  position: sticky !important;
  top: 0 !important;
  border-bottom: 1px solid #e0e0e0 !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

/* Pastikan border tabel rapi */
.pareto-table :deep(table) {
  border-collapse: separate;
  border-spacing: 0;
}
</style>

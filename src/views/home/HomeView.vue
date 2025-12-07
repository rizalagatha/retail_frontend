<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, reactive, watch } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
import logoUrl from '@/assets/logo.png';
import bannerImage from '@/assets/banner-image.jpg';
import storeBg from '@/assets/store-bg.jpg';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, subDays } from 'date-fns';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';
import type { TooltipItem } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { formatRupiah } from "@/utils/formatRupiah";

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ChartDataLabels);

interface PendingAction {
  key: string;
  title: string;
  icon: string;
  to: string;
  count: number;
}
interface SalesChartItem {
  tanggal: string; // format ISO dari backend
  total: number;
}
interface BarDataset {
  label: string;
  backgroundColor: string;
  data: number[];
  borderRadius?: number; // optional
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

interface DashboardStats {
  todaySales: number;
  todayQty: number;
  todayTransactions: number;
  lowStock: number;

  totalStock: number;     // stok cabang (untuk store)
  totalStok: number;      // stok semua cabang (untuk KDC)
  todayStokIn: number;
  todayStokOut: number;

  totalSisaPiutang: number;

  stokPerCabang: StockCabang[];  // breakdown untuk KDC
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
  AVG_SALE: number; // <--- Tambahan
}

const authStore = useAuthStore()
const router = useRouter()
const toast = useToast();

const goToLogin = () => {
  router.push('/login')
}

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
});
const isLoadingStats = ref(true);
const isLoadingPiutang = ref(true);
const isLoadingPiutangBreakdown = ref(true);
const piutangBreakdown = ref<PiutangBreakdown[]>([]);
const piutangByInvoice = ref([]);
const isLoadingPiutangInvoice = ref(false);

const frequentMenus = ref<FrequentMenu[]>([]);
const isLoadingFrequent = ref(true);

const chartGroupBy = ref<'day' | 'week' | 'month'>('day');
const chartFilters = reactive({
  startDate: format(subDays(new Date(), 6), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '',
});
const cabangList = ref([]);
const chartData = ref({
  labels: [],
  datasets: [{
    label: 'Penjualan',
    backgroundColor: '#42A5F5',
    data: []
  }]
});
const isLoadingChart = ref(true);

const recentTransactions = ref([]);
const isLoadingTransactions = ref(true);

const lowStockProducts = ref<LowStockProduct[]>([]);
const lowStockCount = ref(0);
const isLoadingLowStock = ref(true);

const pendingActions = ref<PendingAction[]>([]);
const isLoadingActions = ref(true);

const topProducts = ref([]);
const isLoadingTopProducts = ref(true);

const salesTargetSummary = ref({ nominal: 0, target: 0 });
const isLoadingSalesTarget = ref(true);

const branchPerformances = ref([]);
const isLoadingPerformance = ref(false);

const stagnantStockValue = ref(0);
const isLoadingStagnantStock = ref(true);

const stockBreakdown = ref<{ kode_cabang: string; nama_cabang: string; totalStock: number }[]>([]);
const isLoadingStock = ref(true);
const isLoadingStockBreakdown = ref(true);

const promoText = ref(''); // Untuk menampung teks berjalan
const isLoadingPromo = ref(false);

const itemTrendData = ref<ItemTrend[]>([]);
const isLoadingItemTrend = ref(false);

const itemTrendHeaders = [
  { title: 'Nama Barang', key: 'nama', width: '40%' }, // Beri porsi lebar lebih besar
  { title: 'Bln-3', key: 'bulan_min_3', align: 'end' },
  { title: 'Bln-2', key: 'bulan_min_2', align: 'end' },
  { title: 'Bln-1', key: 'bulan_min_1', align: 'end' },
  { title: 'Bulan Ini (Qty)', key: 'bulan_ini', align: 'end' }, // Perjelas label disini
  { title: 'Tren', key: 'trend', align: 'center', sortable: false, width: '50px' },
] as const;

// const quickActions = ref([
//   { title: 'Transaksi Baru', icon: 'mdi-cash-register', to: '/transaksi', color: 'primary' },
//   { title: 'Master Data', icon: 'mdi-plus-circle', to: '/daftar', color: 'success' },
//   { title: 'Lihat Laporan', icon: 'mdi-chart-line', to: '/laporan', color: 'info' },
//   { title: 'Kelola Piutang', icon: 'mdi-account-clock', to: '/piutang', color: 'orange' },
//   { title: 'Cek Gudang', icon: 'mdi-warehouse', to: '/gudang-dc', color: 'purple' },
// ]);

// Features untuk landing page
const features = ref([
  {
    icon: 'mdi-cart-outline',
    title: 'Transaksi',
    description: 'Kelola penjualan, pembelian, dan invoice dengan mudah',
    color: 'primary'
  },
  {
    icon: 'mdi-warehouse',
    title: 'Gudang DC',
    description: 'Manajemen stok, mutasi, dan inventori gudang',
    color: 'success'
  },
  {
    icon: 'mdi-chart-line',
    title: 'Laporan',
    description: 'Analisa bisnis dan monitoring performa real-time',
    color: 'info'
  },
  {
    icon: 'mdi-account-multiple',
    title: 'Master Data',
    description: 'Kelola data customer, supplier, dan produk',
    color: 'orange'
  },
  {
    icon: 'mdi-currency-usd',
    title: 'Piutang',
    description: 'Monitor dan kelola piutang pelanggan',
    color: 'purple'
  },
  {
    icon: 'mdi-cog-outline',
    title: 'Tools',
    description: 'Utilitas dan pengaturan sistem',
    color: 'blue-grey'
  }
]);

const targetPercentage = computed(() => {
  if (!salesTargetSummary.value.target || salesTargetSummary.value.target === 0) {
    return 0;
  }
  // Hitung persentase tanpa batasan
  const percentage = (salesTargetSummary.value.nominal / salesTargetSummary.value.target) * 100;
  return percentage;
});

const isOverTarget = computed(() => {
  return targetPercentage.value > 100;
});

const getProgressColor = (percentage) => {
  if (percentage >= 100) return '#4CAF50';
  if (percentage >= 75) return '#2196F3';
  if (percentage >= 50) return '#FF9800';
  if (percentage >= 25) return '#FFC107';
  return '#F44336';
};

const targetChartData = computed(() => ({ // <-- NAMA BARU
  labels: ['Pencapaian'],
  datasets: [
    {
      label: 'Target',
      data: [salesTargetSummary.value.target],
      backgroundColor: '#E0E0E0',
      borderRadius: 4,
      barPercentage: 1.0,
    },
    {
      label: 'Realisasi',
      data: [salesTargetSummary.value.nominal],
      backgroundColor: getProgressColor(targetPercentage.value),
      borderRadius: 4,
      barPercentage: 0.6,
    }
  ]
}));

const fr = (val: number) => formatRupiah(val);

const targetChartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        callback: (value: number) => {
          if (value >= 1000000) return `Rp ${value / 1000000} Jt`;
          if (value >= 1000) return `Rp ${value / 1000} Rb`;
          return fr(Number(value));
        }
      }
    },
    x: {
      grouped: false,
      categoryPercentage: 0.5,
      grid: {
        display: false
      }
    }
  },
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
    tooltip: {
      callbacks: {
        label: (context: TooltipItem<'bar'>) => {
          const label = context.dataset.label || '';
          const value = context.parsed.y as number; // parsed bisa number | null
          return `${label}: ${fr(value)}`;
        }
      }
    },
    datalabels: {
      anchor: 'end' as const,
      align: 'top' as const,
      formatter: (value: number, context) => {
        if (context.datasetIndex === 1) return fr(value);
        return null;
      },
      font: {
        weight: 'bold' as const,
        size: 10
      },
      color: '#424242'
    }
  }
});

const currentTime = ref(new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'medium' }));
let intervalId: number;

const fetchDashboardStats = async () => {
  isLoadingStats.value = true;
  try {
    const response = await api.get('/dashboard/total-stok');

    stats.value.totalStok = Number(response.data.totalStok || 0);
    stats.value.stokPerCabang = response.data.perCabang || [];
  } catch (error) {
    toast.error('Gagal memuat total stok.', error);
  } finally {
    isLoadingStats.value = false;
  }
};

const fetchTodayStats = async () => {
  // isLoadingStats di-set di awal (mungkin bersamaan dengan loading lain)
  try {
    // 1. Panggil endpoint yang sesuai dengan 'getTodayStats' di controller
    // (Asumsi routernya adalah '/dashboard/today-stats')
    const response = await api.get('/dashboard/today-stats');

    // 2. Update 'stats' ref dengan data yang diterima
    // Kita gunakan ...stats.value agar tidak menimpa data lain
    // seperti lowStock, totalProducts, dll.
    stats.value = {
      ...stats.value,
      todaySales: response.data.todaySales || 0,
      todayQty: Number(response.data.todayQty || 0),
      todayTransactions: Number(response.data.todayTransactions || 0),
    };

  } catch (error) {
    console.error("Error fetching today stats:", error);
    toast.error('Gagal memuat statistik hari ini.');
  } finally {
    // 3. Set loading ke false
    // (Anda mungkin ingin menunggu semua data dashboard selesai
    // sebelum men-set ini ke false)
    isLoadingStats.value = false;
  }
};

// Helper: Memberikan warna icon secara otomatis agar tidak monoton
const getMenuColor = (iconName: string, index: number) => {
  // 1. Warna berdasarkan konteks icon
  if (iconName.includes('cash') || iconName.includes('receipt')) return 'primary';      // Transaksi -> Biru
  if (iconName.includes('database') || iconName.includes('plus')) return 'success';     // Master -> Hijau
  if (iconName.includes('chart') || iconName.includes('finance')) return 'info';        // Laporan -> Biru Muda
  if (iconName.includes('account') || iconName.includes('clock')) return 'orange';      // Piutang -> Orange
  if (iconName.includes('warehouse') || iconName.includes('package')) return 'purple';  // Gudang -> Ungu
  if (iconName.includes('printer') || iconName.includes('print')) return 'deep-orange'; // DTF/Print -> Merah Bata
  if (iconName.includes('target')) return 'red';                                        // Target -> Merah

  // 2. Fallback: Rotasi warna berdasarkan index
  const colors = ['teal', 'indigo', 'cyan', 'brown', 'blue-grey'];
  return colors[index % colors.length];
};

// --- Method ---
const fetchFrequentMenus = async () => {
  isLoadingFrequent.value = true;
  try {
    const response = await api.get('/activity/frequent-menus');

    // Jika user punya history
    if (response.data && response.data.length > 0) {
      // Hapus 'any', gunakan tipe implisit atau eksplisit
      frequentMenus.value = response.data.map((menu: { icon?: string; title: string; to: string }, index: number) => ({
        ...menu,
        color: getMenuColor(menu.icon || '', index)
      }));
    } else {
      // --- FALLBACK ---
      frequentMenus.value = [
        {
          title: 'Invoice',
          icon: 'mdi-receipt-text',
          to: '/transaksi/penjualan/invoice',
          color: 'primary'
        },
        {
          title: 'Surat Pesanan',
          icon: 'mdi-file-document-edit',
          to: '/transaksi/penjualan/surat-pesanan',
          color: 'success'
        },
        {
          title: 'SO DTF',
          icon: 'mdi-printer-3d-nozzle',
          to: '/transaksi/penjualan/dtf/so-dtf',
          color: 'deep-orange'
        },
        {
          title: 'Cek Stok',
          icon: 'mdi-package-variant',
          to: '/laporan/stok/real-time',
          color: 'purple'
        },
        {
          title: 'Monitoring Target',
          icon: 'mdi-target',
          to: '/laporan/penjualan/monitoring-achievement',
          color: 'red'
        },
      ];
    }
  } catch (error) {
    console.error('Gagal memuat menu sering diakses', error);
    // Fallback error
    frequentMenus.value = [
      { title: 'Invoice', icon: 'mdi-receipt-text', to: '/transaksi/penjualan/invoice', color: 'primary' },
      { title: 'Surat Pesanan', icon: 'mdi-file-document-edit', to: '/transaksi/penjualan/surat-pesanan', color: 'success' },
      { title: 'SO DTF', icon: 'mdi-printer-3d-nozzle', to: '/transaksi/penjualan/dtf/so-dtf', color: 'deep-orange' },
    ];
  } finally {
    isLoadingFrequent.value = false;
  }
};

const fetchSalesChartData = async () => {
  isLoadingChart.value = true;
  try {
    const response = await api.get('/dashboard/sales-chart', {
      params: { ...chartFilters, groupBy: chartGroupBy.value }
    });

    const labels = (response.data as SalesChartItem[]).map((d) => {
      const date = new Date(d.tanggal);
      if (chartGroupBy.value === 'month') return format(date, 'MMM yyyy');
      if (chartGroupBy.value === 'week') return `W${format(date, 'ww')}`;
      return format(date, 'dd/MM');
    });

    const data = (response.data as SalesChartItem[]).map(d => d.total);

    chartData.value = {
      labels: labels,
      datasets: [{
        label: 'Penjualan (Rp)',
        backgroundColor: '#42A5F5',
        data: data,
        borderRadius: 4
      } as BarDataset] // cast ke interface sendiri
    };
  } catch (error) {
    toast.error('Gagal memuat data grafik penjualan.', error);
  } finally {
    isLoadingChart.value = false;
  }
};

const fetchLowStockData = async () => {
  isLoadingLowStock.value = true;
  try {
    const response = await api.get('/laporan-stok/low-stock');
    const lowStockData = response.data;
    lowStockCount.value = lowStockData.length;
    lowStockProducts.value = lowStockData;
  } catch (error) {
    toast.error('Gagal memuat data stok menipis.', error);
  } finally {
    isLoadingLowStock.value = false;
  }
}

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/dashboard/cabang-options');
    cabangList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat pilihan cabang.', error);
  }
};

const fetchRecentTransactions = async () => {
  isLoadingTransactions.value = true;
  try {
    const response = await api.get('/dashboard/recent-transactions');
    recentTransactions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data transaksi terbaru.', error);
  } finally {
    isLoadingTransactions.value = false;
  }
};

const fetchPendingActions = async () => {
  isLoadingActions.value = true;
  try {
    const endDate = format(new Date(), 'yyyy-MM-dd');
    // UBAH: Ambil dari tahun 2000 (Seluruh Waktu)
    const startDate = '2020-01-01';
    const dateQuery = `?startDate=${startDate}&endDate=${endDate}`;

    const response = await api.get('/dashboard/pending-actions');
    const data = response.data;

    const actionsMap = [
      {
        key: 'so_open',
        title: 'Surat Pesanan Open',
        icon: 'mdi-file-document-edit-outline',
        to: `/transaksi/penjualan/surat-pesanan${dateQuery}&status=open`
      },
      {
        key: 'so_dtf_open',
        title: 'SO DTF Belum Invoice',
        icon: 'mdi-printer-alert',
        to: `/transaksi/penjualan/dtf/so-dtf${dateQuery}&status=belum_invoice`
      },
      {
        key: 'invoice_belum_lunas',
        title: 'Sisa Piutang Invoice', // <-- UBAH JUDUL
        icon: 'mdi-receipt-text-clock-outline',
        // Pastikan filter di halaman Invoice juga mendukung status 'sisa_piutang' jika diperlukan
        to: `/transaksi/penjualan/invoice${dateQuery}&status=sisa_piutang`
      },
      {
        key: 'penawaran_open',
        title: 'Penawaran Open',
        icon: 'mdi-handshake-outline',
        to: `/transaksi/penjualan/penawaran${dateQuery}&status=open`
      },
      {
        key: 'pengajuan_harga_pending',
        title: 'Pengajuan Harga Pending',
        icon: 'mdi-file-clock-outline',
        to: `/transaksi/penjualan/pengajuan/pengajuan-harga${dateQuery}&status=pending`
      },
    ];

    pendingActions.value = actionsMap
      .map(action => ({ ...action, count: data[action.key] }))
      .filter(action => action.count > 0);

  } catch (error) {
    toast.error('Gagal memuat data tindakan tertunda.', error);
  } finally {
    isLoadingActions.value = false;
  }
}

const fetchTopProducts = async () => {
  isLoadingTopProducts.value = true;
  try {
    const response = await api.get('/dashboard/top-products');
    topProducts.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data produk terlaris.', error);
  } finally {
    isLoadingTopProducts.value = false;
  }
}

const fetchSalesTargetSummary = async () => {
  isLoadingSalesTarget.value = true;
  try {
    const response = await api.get('/dashboard/sales-target-summary');
    salesTargetSummary.value = response.data;
  } catch (error) {
    console.error('Error:', error);
    toast.error('Gagal memuat ringkasan target penjualan.');
  } finally {
    isLoadingSalesTarget.value = false;
  }
};

const fetchBranchPerformance = async () => {
  isLoadingPerformance.value = true;
  try {
    const response = await api.get('/dashboard/branch-performance');
    // Backend sekarang mengembalikan array langsung, bukan object {top, bottom}
    branchPerformances.value = response.data;
  } catch (error) {
    console.error('Gagal memuat performa cabang:', error);
  } finally {
    isLoadingPerformance.value = false;
  }
};

const getAchColor = (ach: number) => {
  if (ach >= 100) return 'success';
  if (ach >= 80) return 'warning';
  return 'error';
};

const fetchStagnantStockSummary = async () => {
  isLoadingStagnantStock.value = true;
  try {
    const response = await api.get('/dashboard/stagnant-stock-summary');
    stagnantStockValue.value = response.data.totalStagnantValue || 0;
  } catch (error) {
    toast.error('Gagal memuat ringkasan stok stagnan.', error);
  } finally {
    isLoadingStagnantStock.value = false;
  }
};

const fetchTotalPiutang = async () => {
  isLoadingPiutang.value = true;
  try {
    const response = await api.get('/dashboard/total-sisa-piutang');
    stats.value.totalSisaPiutang = response.data.totalSisaPiutang || 0;
  } catch (error) {
    toast.error('Gagal memuat total sisa piutang.', error);
  } finally {
    isLoadingPiutang.value = false;
  }
};

const fetchPiutangBreakdown = async () => {
  // Hanya fetch jika user adalah KDC
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
  if (authStore.user?.cabang === "KDC") return; // KDC tidak pakai ini

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

const fetchTotalStock = async () => {
  isLoadingStock.value = true;
  try {
    const response = await api.get('/dashboard/total-stok');

    // Update stats dengan data baru
    stats.value.totalStock = Number(response.data.totalStock || 0);
    stats.value.todayStokIn = Number(response.data.todayStokIn || 0);
    stats.value.todayStokOut = Number(response.data.todayStokOut || 0);

  } catch (err) {
    toast.error('Gagal memuat total stok.');
    console.error(err);
  } finally {
    isLoadingStock.value = false;
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

// --- Method Baru: Fetch Promo ---
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

    // --- LOGIKA CABANG ---

    // 1. Cabang K11 (Grand Opening)
    if (authStore.user?.cabang === 'K11') {
       promoMessages.push(
         `🎊 GRAND OPENING KEDIRI: Nikmati DISKON 10% ALL ITEM tanpa syarat minimal belanja! Berlaku untuk semua produk Kaosan. Serbu sekarang! 🎊`
       );
    }
    // 2. Cabang Lain (Reguler)
    else {
       const promoReguler = promos.find(p => p.pro_nomor === 'PRO-2025-010' || p.pro_judul.toUpperCase().includes('REGULER'));

       if (promoReguler) {
         promoMessages.push(
           `🔥 PROMO REGULER: Potongan Rp 25.000 tiap kelipatan Rp 250.000 (Khusus Kaos Polos/Reguler, Non-Jersey). Buruan Serbu!`
         );
       }
       else if (promos.length > 0) {
         promoMessages = promos.map(p => `✨ ${p.pro_judul}`);
       }
    }

    // Fallback jika kosong
    if (promoMessages.length === 0) {
      promoMessages.push('Selamat Datang di Kaosan Retail Management System');
    }

    promoText.value = promoMessages.join('   •   ');

  } catch (error) {
    console.error("Gagal memuat promo:", error);
  } finally {
    isLoadingPromo.value = false;
  }
};

const fetchItemSalesTrend = async () => {
  if (authStore.user?.cabang !== 'KDC') return;

  isLoadingItemTrend.value = true;
  try {
    const response = await api.get('/dashboard/item-sales-trend'); // Pastikan route backend sesuai
    itemTrendData.value = response.data;
  } catch (error) {
    console.error('Gagal memuat trend barang:', error);
  } finally {
    isLoadingItemTrend.value = false;
  }
};

// Helper untuk ikon trend (Naik/Turun)
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

onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchActivePromos();
    fetchFrequentMenus();
    fetchTodayStats();
    fetchDashboardStats();
    fetchLowStockData();
    fetchSalesChartData();
    fetchCabangOptions();
    fetchRecentTransactions();
    fetchPendingActions();
    fetchTopProducts();
    fetchSalesTargetSummary();
    fetchStagnantStockSummary();
    if (authStore.user?.cabang === 'KDC') {
      fetchBranchPerformance();
      fetchStockBreakdown();
      fetchItemSalesTrend();
    }
    fetchTotalPiutang();
    fetchPiutangBreakdown();
    fetchPiutangByInvoice();
    fetchTotalStock();
  }

  intervalId = window.setInterval(() => {
    currentTime.value = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'medium' });
  }, 1000);
});

onUnmounted(() => {
  clearInterval(intervalId);
});

watch(chartFilters, fetchSalesChartData);
watch(chartGroupBy, fetchSalesChartData);
</script>

<template>
  <!-- LANDING PAGE untuk user yang belum login -->
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
          <div class="text-h6 text-uppercase text-white font-weight-light mb-6 tracking-widest text-shadow">
            Retail Management System
          </div>

          <p class="text-body-1 text-white mx-auto mb-8 font-weight-regular"
            style="max-width: 600px; opacity: 0.9; line-height: 1.6;">
            Sistem manajemen toko terintegrasi untuk memantau penjualan, stok, dan performa cabang secara real-time.
            Kelola bisnis retail Anda dengan lebih cerdas dan efisien.
          </p>

          <v-btn color="white" size="x-large" rounded="pill" @click="goToLogin" prepend-icon="mdi-login-variant"
            class="px-10 text-primary font-weight-bold btn-glow" height="56">
            Masuk ke Dashboard
          </v-btn>
        </div>

        <v-row justify="center" class="mt-4" dense>
          <v-col v-for="feature in features" :key="feature.title" cols="6" sm="4" md="2">
            <v-hover v-slot="{ isHovering, props }">
              <v-card v-bind="props" class="feature-glass-card fill-height py-5 px-2"
                :class="{ 'hover-up': isHovering }" variant="text">
                <div class="glass-icon-bg mb-3 mx-auto" :class="`text-${feature.color}`">
                  <v-icon :icon="feature.icon" size="28" />
                </div>
                <h4 class="text-subtitle-2 font-weight-bold text-white mb-1 text-uppercase tracking-wider">
                  {{ feature.title }}
                </h4>
                <div class="text-caption text-white opacity-70" style="font-size: 0.7rem; line-height: 1.3;">
                  {{ feature.description }}
                </div>
              </v-card>
            </v-hover>
          </v-col>
        </v-row>

        <div class="mt-12 text-white text-caption opacity-60">
          &copy; 2025 IT Kencana Print. All Rights Reserved.
        </div>

      </v-col>
    </v-row>
  </v-container>

  <!-- DASHBOARD untuk user yang sudah login -->
  <v-container v-else class="home-container pa-0" fluid>

    <!-- HEADER BANNER BARU -->
    <div class="dashboard-header">
      <!-- Background Image -->
      <v-img :src="bannerImage" cover class="header-bg">
        <!-- Overlay transparan agar teks terbaca -->
        <div class="header-overlay"></div>
      </v-img>

      <!-- Content di atas Banner -->
      <div class="header-content pt-6 px-6 pb-12">
        <!-- Teks Selamat Datang Besar -->
        <div class="welcome-text text-white mt-4">
          <div class="d-flex align-center mb-2">
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
        </div>

      </div>
    </div>

    <!-- MAIN CONTENT AREA -->
    <div class="dashboard-content px-6 mt-n8 position-relative" style="z-index: 2;">

      <div class="deep-sky-gradient elevation-3 mb-6">

        <!-- RUNNING TEXT PROMO (Overlapping Banner) -->
        <v-row v-if="promoText" class="mb-5">
          <v-col cols="12" class="pa-0">
            <div class="promo-ticker-container elevation-4">
              <div class="ticker-label">
                <v-icon icon="mdi-bullhorn" size="18" class="mr-2 swing-animation" />
                <span class="font-weight-bold text-uppercase" style="font-size: 0.75rem; letter-spacing: 1px;">Info
                  Promo</span>
              </div>
              <div class="ticker-track-wrapper">
                <div class="ticker-track">
                  <span class="ticker-content">{{ promoText }}</span>
                  <span class="ticker-content">{{ promoText }}</span>
                  <span class="ticker-content">{{ promoText }}</span>
                </div>
              </div>
            </div>
          </v-col>
        </v-row>

        <!-- Quick Stats Cards -->
        <v-row class="mb-6" justify="center">

          <v-col cols="12" sm="6" md="auto">
            <v-card class="stat-card fill-height" color="success" variant="tonal">
              <v-card-text class="text-center">
                <v-icon size="40" class="mb-2">mdi-cash-multiple</v-icon>
                <div class="text-h4 font-weight-bold">
                  <span v-if="isLoadingStats">...</span>
                  <span v-else>{{ formatRupiah(stats.todaySales) }}</span>

                </div>

                <div v-if="!isLoadingStats" class="mt-1 mb-1">
                  <v-chip size="x-small" color="success" variant="flat" class="font-weight-bold">
                    {{ stats.todayQty }} pcs terjual
                  </v-chip>
                </div>

                <div class="text-subtitle-2">Penjualan Hari Ini</div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="6" md="auto">
            <v-card class="stat-card fill-height" color="info" variant="tonal">
              <v-card-text class="text-center">
                <v-icon size="40" class="mb-2">mdi-receipt</v-icon>
                <div class="text-h4 font-weight-bold">
                  <span v-if="isLoadingStats">...</span>
                  <span v-else>{{ stats.todayTransactions }}</span>
                </div>
                <div class="text-subtitle-2">Transaksi Hari Ini</div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="6" md="auto">
            <v-card class="stat-card fill-height" color="warning" variant="tonal">
              <v-card-text class="text-center">
                <v-icon size="40" class="mb-2">mdi-alert-circle</v-icon>
                <div class="text-h4 font-weight-bold">{{ isLoadingLowStock ? '...' : lowStockCount }}</div>
                <div class="text-subtitle-2">Stok Menipis</div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="6" md="auto">
            <v-card class="stat-card fill-height" color="primary" variant="tonal">
              <v-card-text class="text-center">
                <v-icon size="40" class="mb-2">mdi-package-variant-closed</v-icon>
                <div class="text-h4 font-weight-bold">
                  <span v-if="isLoadingStats || isLoadingStock">...</span>
                  <span v-else>{{ stats.totalStock.toLocaleString('id-ID') }}</span>
                </div>
                <div class="text-subtitle-2">Total Stok (pcs)</div>

                <div v-if="!isLoadingStats && !isLoadingStock && authStore.user?.cabang !== 'KDC'"
                  class="d-flex justify-center align-center ga-3 mt-3 pt-2 border-t">

                  <div class="d-flex flex-column align-center">
                    <div class="d-flex align-center text-caption text-success font-weight-bold">
                      <v-icon size="small" start icon="mdi-arrow-up" />
                      Masuk
                    </div>
                    <span class="text-body-2 font-weight-bold">{{ stats.todayStokIn }}</span>
                  </div>

                  <v-divider vertical class="mx-1" length="20"></v-divider>

                  <div class="d-flex flex-column align-center">
                    <div class="d-flex align-center text-caption text-error font-weight-bold">
                      <v-icon size="small" start icon="mdi-arrow-down" />
                      Keluar
                    </div>
                    <span class="text-body-2 font-weight-bold">{{ stats.todayStokOut }}</span>
                  </div>

                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" sm="6" md="auto">
            <v-menu v-if="authStore.user?.cabang === 'KDC'" open-on-hover location="bottom center" origin="top center"
              transition="scale-transition" :close-on-content-click="false">
              <template v-slot:activator="{ props }">
                <v-card v-bind="props" class="stat-card fill-height" color="deep-purple" variant="tonal"
                  style="cursor: help;">
                  <v-card-text class="text-center">
                    <v-icon size="40" class="mb-2">mdi-warehouse</v-icon>
                    <div class="text-h4 font-weight-bold">
                      <span v-if="isLoadingStock">...</span>
                      <span v-else>{{ stats.totalStock.toLocaleString('id-ID') }}</span>
                    </div>
                    <div class="text-subtitle-2">Total Stok (Semua Cabang)</div>
                  </v-card-text>
                </v-card>
              </template>

              <v-card max-width="420" elevation="8">
                <v-list-item class="bg-deep-purple-lighten-4">
                  <v-list-item-title class="font-weight-bold">Stok per Cabang</v-list-item-title>
                </v-list-item>
                <v-divider></v-divider>

                <v-card-text class="pa-0" style="max-height: 300px; overflow-y: auto;">
                  <div v-if="isLoadingStockBreakdown" class="text-center pa-4">
                    <v-progress-circular indeterminate size="20"></v-progress-circular>
                  </div>

                  <v-list v-else-if="stockBreakdown.length > 0" density="compact">
                    <v-list-item v-for="item in stockBreakdown" :key="item.kode_cabang">
                      <v-list-item-title class="text-caption">
                        {{ item.nama_cabang || item.kode_cabang }}
                      </v-list-item-title>
                      <template #append>
                        <span class="text-caption font-weight-bold">
                          {{ item.totalStock.toLocaleString('id-ID') }} pcs
                        </span>
                      </template>
                    </v-list-item>
                  </v-list>

                  <div v-else class="text-center pa-4 text-caption">
                    Tidak ada data stok per cabang.
                  </div>
                </v-card-text>
              </v-card>
            </v-menu>
          </v-col>

          <v-col cols="12" sm="6" md="auto">

            <!-- ========================= -->
            <!--   KDC => Breakdown Cabang  -->
            <!-- ========================= -->
            <v-menu v-if="authStore.user?.cabang === 'KDC'" open-on-hover location="bottom center" origin="top center"
              transition="scale-transition" :close-on-content-click="false">
              <template v-slot:activator="{ props }">
                <v-card v-bind="props" class="stat-card fill-height" color="orange" variant="tonal"
                  style="cursor: help;">
                  <v-card-text class="text-center">
                    <v-icon size="40" class="mb-2">mdi-account-clock</v-icon>
                    <div class="text-h4 font-weight-bold">
                      <span v-if="isLoadingPiutang">...</span>
                      <span v-else>{{ formatRupiah(stats.totalSisaPiutang) }}</span>
                    </div>
                    <div class="text-subtitle-2">Total Sisa Piutang</div>
                  </v-card-text>
                </v-card>
              </template>

              <v-card max-width="350" elevation="8">
                <v-list-item class="bg-orange-lighten-4">
                  <v-list-item-title class="font-weight-bold">Piutang per Cabang</v-list-item-title>
                </v-list-item>
                <v-divider></v-divider>

                <v-card-text class="pa-0" style="max-height: 300px; overflow-y: auto;">
                  <div v-if="isLoadingPiutangBreakdown" class="text-center pa-4">
                    <v-progress-circular indeterminate size="20"></v-progress-circular>
                  </div>

                  <v-list v-else-if="piutangBreakdown.length > 0" density="compact">
                    <v-list-item v-for="item in piutangBreakdown" :key="item.cabang_kode">
                      <v-list-item-title class="text-caption">
                        {{ item.cabang_nama || item.cabang_kode }}
                      </v-list-item-title>
                      <template #append>
                        <span class="text-caption font-weight-bold">
                          {{ formatRupiah(item.sisa_piutang) }}
                        </span>
                      </template>
                    </v-list-item>
                  </v-list>

                  <div v-else class="text-center pa-4 text-caption">
                    Tidak ada data piutang per cabang.
                  </div>
                </v-card-text>
              </v-card>
            </v-menu>

            <!-- ======================================================== -->
            <!--  USER STORE BIASA => Breakdown Invoice penyebab piutang  -->
            <!-- ======================================================== -->
            <v-menu v-else open-on-hover location="bottom center" origin="top center" transition="scale-transition"
              :close-on-content-click="false">
              <template v-slot:activator="{ props }">
                <v-card v-bind="props" class="stat-card fill-height" color="orange" variant="tonal"
                  style="cursor: help;">
                  <v-card-text class="text-center">
                    <v-icon size="40" class="mb-2">mdi-account-clock</v-icon>
                    <div class="text-h4 font-weight-bold">
                      <span v-if="isLoadingPiutang">...</span>
                      <span v-else>{{ formatRupiah(stats.totalSisaPiutang) }}</span>
                    </div>
                    <div class="text-subtitle-2">Total Sisa Piutang</div>
                  </v-card-text>
                </v-card>
              </template>

              <v-card max-width="380" elevation="8">
                <v-list-item class="bg-orange-lighten-4">
                  <v-list-item-title class="font-weight-bold">
                    Piutang per Invoice
                  </v-list-item-title>
                </v-list-item>

                <v-divider />

                <v-card-text class="pa-0" style="max-height: 300px; overflow-y: auto;">
                  <div v-if="isLoadingPiutangInvoice" class="text-center pa-4">
                    <v-progress-circular indeterminate size="20"></v-progress-circular>
                  </div>

                  <v-list v-else-if="piutangByInvoice.length > 0" density="compact">
                    <v-list-item v-for="inv in piutangByInvoice" :key="inv.invoice" class="piutang-item">
                      <div class="d-flex justify-space-between w-100 align-start">

                        <!-- Kiri: Nomor & tanggal -->
                        <div class="d-flex flex-column">
                          <span class="text-body-2 font-weight-medium">
                            {{ inv.invoice }}
                          </span>
                          <span class="text-caption text-grey">
                            {{ inv.tanggal }}
                          </span>
                        </div>

                        <!-- Kanan: Nominal -->
                        <div class="text-right">
                          <span class="text-body-2 font-weight-bold">
                            {{ formatRupiah(inv.sisa_piutang) }}
                          </span>
                        </div>

                      </div>
                    </v-list-item>
                  </v-list>

                  <div v-else class="text-center pa-4 text-caption">
                    Tidak ada invoice yang menunggak.
                  </div>
                </v-card-text>
              </v-card>
            </v-menu>

          </v-col>
        </v-row>

        <!-- Chart and Pending Actions Row -->
        <v-row class="mb-4">
          <v-col cols="12" lg="8">
            <v-card elevation="2">
              <v-card-title>
                <div class="d-flex align-center">
                  <v-icon class="mr-2" color="primary">mdi-finance</v-icon>
                  Grafik Penjualan
                </div>
              </v-card-title>

              <v-card-text>
                <div class="d-flex align-center justify-space-between flex-wrap ga-4 mb-4">
                  <v-btn-toggle v-model="chartGroupBy" variant="outlined" density="compact" color="primary" mandatory>
                    <v-btn size="small" value="day">Harian</v-btn>
                    <v-btn size="small" value="week">Mingguan</v-btn>
                    <v-btn size="small" value="month">Bulanan</v-btn>
                  </v-btn-toggle>

                  <div class="d-flex align-center ga-2">
                    <v-select v-model="chartFilters.cabang" :items="cabangList" item-title="nama" item-value="kode"
                      label="Cabang" density="compact" hide-details variant="outlined" style="max-width: 180px;"
                      :readonly="authStore.user?.cabang !== 'KDC'" />
                    <v-text-field v-model="chartFilters.startDate" type="date" density="compact" hide-details
                      variant="outlined" style="max-width: 160px" />
                    <span class="mx-1">s/d</span>
                    <v-text-field v-model="chartFilters.endDate" type="date" density="compact" hide-details
                      variant="outlined" style="max-width: 160px" />
                  </div>
                </div>

                <div v-if="isLoadingChart" class="text-center pa-8">
                  <v-progress-circular indeterminate color="primary" />
                  <div class="mt-2">Memuat data grafik...</div>
                </div>
                <div v-else style="height: 300px; position: relative;">
                  <Bar :data="chartData" :options="{ responsive: true, maintainAspectRatio: false }" />
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" lg="4">
            <v-card elevation="2" class="d-flex flex-column" style="height: 100%;">
              <v-card-title class="d-flex align-center flex-shrink-0">
                <v-icon class="mr-2" color="info">mdi-bell-ring-outline</v-icon>
                Perlu Tindakan (Penjualan)
              </v-card-title>
              <v-card-text class="flex-grow-1 overflow-y-auto" style="max-height: calc(100% - 64px);">
                <div v-if="isLoadingActions" class="text-center pa-4">
                  <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </div>
                <div v-else-if="pendingActions.length === 0" class="text-center pa-4">
                  <v-icon size="48" color="success">mdi-check-all</v-icon>
                  <div class="mt-2">Tidak ada tindakan tertunda. Kerja bagus!</div>
                </div>
                <v-list v-else dense bg-color="transparent" lines="two">
                  <template v-for="(item, index) in pendingActions" :key="item.key">
                    <v-list-item :to="item.to" class="mb-1" rounded="lg" variant="tonal">
                      <template #prepend>
                        <v-avatar :icon="item.icon" color="info" variant="flat" class="text-white"></v-avatar>
                      </template>
                      <v-list-item-title class="font-weight-bold">{{ item.title }}</v-list-item-title>
                      <v-list-item-subtitle>Tugas yang perlu ditindaklanjuti</v-list-item-subtitle>
                      <template #append>
                        <v-chip color="info" size="large" variant="flat" class="font-weight-bold">
                          {{ item.count }}
                        </v-chip>
                      </template>
                    </v-list-item>
                    <v-divider v-if="index < pendingActions.length - 1" class="my-1"></v-divider>
                  </template>
                </v-list>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Main Content Row -->
        <v-row>
          <!-- Left Column -->
          <v-col cols="12" lg="6">
            <!-- Quick Actions -->
            <v-card class="mb-4" elevation="2">
              <v-card-title class="d-flex align-center bg-blue-grey-lighten-5">
                <v-icon class="mr-2" color="primary">mdi-history</v-icon>
                <span class="text-h6">Sering Diakses</span>
              </v-card-title>

              <v-card-text class="pa-6">
                <div v-if="isLoadingFrequent" class="text-center pa-4">
                  <v-progress-circular indeterminate color="primary" size="32" />
                  <div class="text-caption mt-2">Memuat menu...</div>
                </div>

                <div v-else-if="frequentMenus.length === 0" class="text-center text-grey">
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

            <!-- Sales Target -->
            <v-card elevation="2" class="mb-4" hover>
              <v-card-title class="d-flex align-center bg-blue-lighten-5">
                <v-icon class="mr-2" color="primary">mdi-target</v-icon>
                <span class="text-h6">Pencapaian Target (Bulan Ini)</span>
              </v-card-title>
              <v-card-text class="pa-6">
                <div v-if="isLoadingSalesTarget" class="text-center pa-8">
                  <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
                </div>

                <div v-else>
                  <v-row align="center">

                    <v-col cols="12" sm="5" class="text-center">
                      <div style="height: 250px; position: relative;">
                        <Bar :data="targetChartData" :options="targetChartOptions" />
                      </div>
                    </v-col>
                    <v-col cols="12" sm="7">
                      <v-card variant="outlined" class="mb-3">
                        <v-card-text>
                          <div class="text-caption text-medium-emphasis mb-1">Realisasi</div>
                          <div class="text-h5 font-weight-bold"
                            :class="isOverTarget ? 'text-success' : 'text-deep-orange-darken-1'">
                            {{ formatRupiah(salesTargetSummary.nominal) }}
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
                          <div class="text-h6 font-weight-medium">
                            {{ formatRupiah(salesTargetSummary.target) }}
                          </div>
                        </v-card-text>
                      </v-card>
                    </v-col>
                  </v-row>
                </div>
              </v-card-text>
            </v-card>

            <!-- Recent Transactions -->
            <v-card class="mb-4" elevation="2">
              <v-card-title class="d-flex align-center justify-space-between bg-green-lighten-5">
                <div class="d-flex align-center">
                  <v-icon class="mr-2" color="success">mdi-point-of-sale</v-icon>
                  <span class="text-h6">Penjualan Terbaru</span>
                </div>
                <v-btn size="small" variant="text" color="success" to="/transaksi/penjualan/invoice"
                  append-icon="mdi-chevron-right">
                  Lihat Semua
                </v-btn>
              </v-card-title>
              <v-card-text class="pa-4">
                <div v-if="isLoadingTransactions" class="text-center pa-8">
                  <v-progress-circular indeterminate color="success" size="48"></v-progress-circular>
                </div>

                <div v-else-if="recentTransactions.length === 0" class="text-center pa-8">
                  <v-icon size="64" color="grey">mdi-receipt-text-outline</v-icon>
                  <div class="mt-3 text-medium-emphasis">Belum ada transaksi hari ini</div>
                </div>

                <v-list v-else bg-color="transparent" style="max-height: 300px; overflow-y: auto;">
                  <v-list-item v-for="transaction in recentTransactions" :key="transaction.id" class="px-2 mb-2"
                    rounded="lg" border>
                    <template #prepend>
                      <v-avatar color="success-lighten-1" size="40">
                        <v-icon color="white">mdi-cart-check</v-icon>
                      </v-avatar>
                    </template>

                    <v-list-item-title class="font-weight-bold">
                      {{ transaction.customer }}
                    </v-list-item-title>
                    <v-list-item-subtitle class="mt-1">
                      {{ transaction.id }} • {{ transaction.time }}
                    </v-list-item-subtitle>

                    <template #append>
                      <v-chip color="success" size="small" variant="flat" class="font-weight-bold">
                        {{ formatRupiah(transaction.amount) }}
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>

            <!-- Item Sales Trend (Hanya untuk KDC) -->
            <v-card v-if="authStore.user?.cabang === 'KDC'" elevation="2" class="mb-4 rounded-lg d-flex flex-column">
              <v-card-title class="d-flex align-center bg-blue-lighten-5 py-3">
                <v-icon class="mr-2" color="primary">mdi-chart-box-outline</v-icon>
                <span class="text-subtitle-1 font-weight-bold text-primary">Trend Penjualan Item (Top 10)</span>
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
                        <div class="font-weight-bold text-wrap" style="white-space: normal; line-height: 1.3;">
                          {{ item.nama }}
                        </div>
                        <div class="text-grey text-xs mt-1">{{ item.kode }}</div>
                      </div>
                    </template>

                    <template #[`item.bulan_ini`]="{ item }">
                      <span class="font-weight-black text-primary" style="font-size: 1.1em;">
                        {{ item.bulan_ini }}
                      </span>
                    </template>

                    <template #[`item.trend`]="{ item }">
                      <v-icon :icon="getTrendIcon(item)" :color="getTrendColor(item)" size="small" />
                    </template>
                  </v-data-table>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Right Column -->
          <v-col cols="12" lg="6">
            <!-- Low Stock Alert -->
            <v-card elevation="2" class="mb-4">
              <v-card-title class="d-flex align-center bg-orange-lighten-5">
                <v-icon class="mr-2" color="warning">mdi-alert-circle</v-icon>
                <span class="text-h6">Peringatan Stok Menipis</span>
              </v-card-title>
              <v-card-text class="pa-4">
                <div v-if="isLoadingLowStock" class="text-center pa-8">
                  <v-progress-circular indeterminate color="warning" size="48"></v-progress-circular>
                  <div class="mt-3 text-medium-emphasis">Memuat data...</div>
                </div>

                <div v-else-if="lowStockProducts.length === 0" class="text-center pa-8">
                  <v-icon size="64" color="success">mdi-check-circle-outline</v-icon>
                  <div class="mt-3 text-h6">Stok Aman!</div>
                  <div class="text-medium-emphasis">Tidak ada produk yang menipis</div>
                </div>

                <div v-else>
                  <v-list bg-color="transparent" class="scrollable-list" style="max-height: 300px; overflow-y: auto;">
                    <v-list-item v-for="(product) in lowStockProducts" :key="`${product.KODE}-${product.UKURAN}`"
                      class="px-3 mb-2 py-2" rounded="lg" border>

                      <template #prepend>
                        <v-avatar color="error" size="48" variant="tonal" class="mr-2">
                          <span class="text-h6 font-weight-black">{{ product.UKURAN }}</span>
                        </v-avatar>
                      </template>

                      <div class="d-flex flex-column gap-1">

                        <div class="text-subtitle-2 font-weight-bold text-wrap" style="line-height: 1.2;">
                          {{ product.NAMA }}
                        </div>

                        <div class="d-flex align-center text-caption text-medium-emphasis mt-1">
                          <v-chip size="x-small" label class="mr-2 px-2" color="grey-lighten-2" variant="flat">
                            <span class="text-grey-darken-3 font-weight-medium">{{ product.KODE }}</span>
                          </v-chip>
                          <span v-if="product.BARCODE" class="d-flex align-center">
                            <v-icon start size="x-small" icon="mdi-barcode" class="mr-1"></v-icon>
                            {{ product.BARCODE }}
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
                  </v-list>

                  <v-btn color="warning" variant="tonal" block class="mt-4" to="/laporan/stok/real-time"
                    prepend-icon="mdi-file-chart-outline">
                    Lihat Laporan Lengkap
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>

            <v-card elevation="3" class="mt-4 bg-white" hover @click="router.push('/laporan/stok/dead-stok')">
              <v-card-text>
                <div v-if="isLoadingStagnantStock" class="text-center pa-2">
                  <v-progress-circular indeterminate color="deep-orange" size="24"></v-progress-circular>
                </div>

                <div v-else class="d-flex align-center">
                  <v-icon size="40" class="mr-4" color="deep-orange">mdi-archive-arrow-down-outline</v-icon>
                  <div>
                    <div class="text-caption text-deep-orange font-weight-bold">Nilai Stok Stagnan (30 Hari)</div>

                    <div class="text-h5 font-weight-bold text-deep-orange">
                      {{ formatRupiah(stagnantStockValue) }}
                    </div>
                  </div>
                </div>
              </v-card-text>
            </v-card>

            <!-- Top Products -->
            <v-card elevation="2" class="mb-4">
              <v-card-title class="d-flex align-center bg-amber-lighten-5">
                <v-icon class="mr-2" color="amber-darken-2">mdi-star-circle-outline</v-icon>
                <span class="text-h6">Produk Terlaris (Bulan Ini)</span>
              </v-card-title>
              <v-card-text class="pa-4">
                <div v-if="isLoadingTopProducts" class="text-center pa-8">
                  <v-progress-circular indeterminate color="amber" size="48"></v-progress-circular>
                </div>

                <v-list v-else bg-color="transparent" style="max-height: 300px; overflow-y: auto;">
                  <v-list-item v-for="(product, index) in topProducts" :key="product.KODE" class="px-2 mb-2"
                    rounded="lg" border>
                    <template #prepend>
                      <v-avatar :color="index === 0 ? 'amber' : index === 1 ? 'blue-grey-lighten-1' : 'brown-lighten-1'"
                        size="40">
                        <span class="font-weight-bold text-white">{{ index + 1 }}</span>
                      </v-avatar>
                    </template>

                    <v-list-item-title class="font-weight-bold">
                      {{ product.NAMA }}
                    </v-list-item-title>
                    <v-list-item-subtitle class="mt-1">
                      {{ product.KODE }}
                    </v-list-item-subtitle>

                    <template #append>
                      <v-chip color="primary" size="small" variant="flat" class="font-weight-bold">
                        {{ product.TOTAL?.toLocaleString('id-ID') }} pcs
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>

            <!-- Branch Performance -->
            <v-card v-if="authStore.user?.cabang === 'KDC'" elevation="2" class="mb-4">
              <v-card-title class="d-flex align-center bg-purple-lighten-5">
                <v-icon class="mr-2" color="purple">mdi-trophy-outline</v-icon>
                <span class="text-h6">Ranking Performa Cabang (Bulan Ini)</span>
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

                <v-table v-else density="compact" hover>
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
                        <div class="text-caption text-grey">{{ item.kode_cabang }}</div>
                      </td>

                      <td class="text-right">
                        <div class="font-weight-bold text-body-2">{{ formatRupiah(item.nominal) }}</div>
                      </td>

                      <td class="text-right text-grey-darken-1 text-caption">
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

                    <tr v-if="branchPerformances.length === 0">
                      <td colspan="5" class="text-center py-4 text-grey">
                        Belum ada data penjualan bulan ini.
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
/* --- LANDING PAGE STYLES --- */

/* 1. Background Setup */
.landing-container {
  position: relative;
  overflow: hidden;
  background-color: #1a1a1a;
  /* Fallback color */
}

.bg-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  transform: scale(1.05);
  /* Sedikit zoom agar tidak ada border putih */
}

/* Overlay Gelap Elegan */
.bg-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  /* Gradasi Gelap Ungu ke Hitam Transparan */
  background: linear-gradient(135deg, rgba(30, 3, 61, 0.85) 0%, rgba(0, 0, 0, 0.75) 100%);
  backdrop-filter: blur(4px);
  /* Blur background foto sedikit agar teks fokus */
}

.content-layer {
  position: relative;
  z-index: 2;
  /* Di atas overlay */
}

/* 2. Hero Glass Card */
.hero-glass-card {
  background: rgba(255, 255, 255, 0.05);
  /* Sangat transparan */
  backdrop-filter: blur(16px);
  /* Efek kaca buram kuat */
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 32px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  position: relative;
  overflow: hidden;
}

/* Kilauan cahaya di atas kartu (shine effect) */
.hero-glass-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 60%);
  pointer-events: none;
}

/* 3. Feature Glass Cards */
.feature-glass-card {
  background: rgba(255, 255, 255, 0.03) !important;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  /* Bouncy transition */
  cursor: default;
}

.feature-glass-card.hover-up {
  background: rgba(255, 255, 255, 0.1) !important;
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-8px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}

.glass-icon-bg {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.05);
}

/* 4. Typography & Effects */
.text-shadow {
  text-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
}

.tracking-wide {
  letter-spacing: 0.05em;
}

.tracking-wider {
  letter-spacing: 0.1em;
}

.tracking-widest {
  letter-spacing: 0.2em;
}

.logo-glow {
  box-shadow: 0 0 30px rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.btn-glow {
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
}

.btn-glow:hover {
  transform: scale(1.05);
  box-shadow: 0 0 30px rgba(255, 255, 255, 0.5);
}

/* Dashboard Styles */
.home-container {
  background-color: #f5f7fa;
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

.scrollable-list::-webkit-scrollbar {
  width: 6px;
}

.scrollable-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

.scrollable-list::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 10px;
}

.scrollable-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}

.piutang-item {
  padding: 6px 12px !important;
}

.piutang-item:hover {
  background-color: #fff7e6 !important;
  /* soft orange hover */
}

/* HEADER BANNER */
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

.text-shadow {
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

/* CONTENT AREA */
.dashboard-content {
  margin-top: -60px;
  /* Overlap effect */
}

/* Container Gradasi Putih ke Biru Tua */
.deep-sky-gradient {
  /* --- KUNCI GRADASI --- */
  background: linear-gradient(180deg,
      #FFFFFF 0%,
      /* Paling Atas: Putih Bersih */
      #29B6F6 45%,
      /* Tengah: Biru Langit Cerah */
      #01579B 100%
      /* Paling Bawah: Biru Tua Dalam */
    );

  /* Styling tambahan agar terlihat rapi dan modern */
  border-radius: 20px;
  /* Sudut melengkung */
  padding: 24px 24px 32px 24px;
  /* Jarak dalam agar konten lega */

  /* Border tipis putih di sekelilingnya */
  border: 2px solid rgba(255, 255, 255, 0.8);

  /* Shadow biru tua di bawahnya */
  box-shadow: 0 12px 32px rgba(1, 87, 155, 0.3) !important;

  position: relative;
  overflow: hidden;
}

/* --- Styles untuk Running Text Promo (Compact) --- */
.promo-ticker-container {
  display: flex;
  align-items: stretch;
  background: white;
  border-radius: 6px;
  overflow: hidden;
  border-left: 3px solid #E91E63;
  height: 32px;
  margin-top: 4px;
  /* Margin atas agar ada jarak dikit dari navbar saat awal */

  /* --- TAMBAHAN AGAR STICKY --- */
  position: sticky;
  /* Kuncinya disini */
  top: 70px;
  /* Sesuaikan dengan tinggi Navbar (64px) + sedikit jarak (misal 6px) */
  z-index: 10;
  /* Supaya dia ngambang di atas konten lain (tapi di bawah menu dropdown navbar) */
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  /* Tambah bayangan biar kelihatan ngambang */
}

.ticker-label {
  background: #E91E63;
  /* Pink Tua */
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
  background: #FFF0F5;
  /* Latar belakang pink sangat muda */
}

.ticker-track {
  display: flex;
  white-space: nowrap;
  animation: scroll-left 35s linear infinite;
  /* Sedikit lebih lambat agar mudah dibaca */
}

.ticker-content {
  padding-right: 60px;
  font-weight: 500;
  color: #C2185B;
  /* Warna teks pink tua, lebih nyaman di mata */
  font-size: 0.85rem;
  /* Font size dikecilkan sedikit */
  display: inline-block;
  line-height: 32px;
  /* Vertical center */
}

/* Animasi Gerak ke Kiri */
@keyframes scroll-left {
  0% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(-33.33%);
  }
}

/* Animasi Ikon Bergoyang Halus */
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

/* Pause animasi saat mouse hover */
.ticker-track-wrapper:hover .ticker-track {
  animation-play-state: paused;
}

@media (max-width: 960px) {
  .home-container {
    padding: 1rem;
  }

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
}
</style>

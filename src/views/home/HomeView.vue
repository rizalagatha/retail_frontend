<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, reactive, watch } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
import logoUrl from '@/assets/logo.png';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, subDays } from 'date-fns';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';
import type { TooltipItem } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ChartDataLabels);

interface PendingAction {
  key: string;
  title: string;
  icon: string;
  to: string;
  count: number;
}
interface BranchPerformance {
  kode_cabang: string;
  nama_cabang: string;
  ach: number; // persentase achievement
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
  todayTransactions: number;
  lowStock: number;

  totalStock: number;     // stok cabang (untuk store)
  totalStok: number;      // stok semua cabang (untuk KDC)

  totalSisaPiutang: number;

  stokPerCabang: StockCabang[];  // breakdown untuk KDC
}

const authStore = useAuthStore()
const router = useRouter()
const toast = useToast();

const goToLogin = () => {
  router.push('/login')
}

const stats = ref<DashboardStats>({
  todaySales: 0,
  todayTransactions: 0,
  lowStock: 0,

  totalStock: 0,
  totalStok: 0,

  totalSisaPiutang: 0,

  stokPerCabang: [],
});
const isLoadingStats = ref(true);
const isLoadingPiutang = ref(true);
const isLoadingPiutangBreakdown = ref(true);
const piutangBreakdown = ref<PiutangBreakdown[]>([]);

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

const lowStockProducts = ref([]);
const lowStockCount = ref(0);
const isLoadingLowStock = ref(true);

const pendingActions = ref<PendingAction[]>([]);
const isLoadingActions = ref(true);

const topProducts = ref([]);
const isLoadingTopProducts = ref(true);

const salesTargetSummary = ref({ nominal: 0, target: 0 });
const isLoadingSalesTarget = ref(true);

const topPerformers = ref<BranchPerformance[]>([]);
const bottomPerformers = ref<BranchPerformance[]>([]);
const isLoadingPerformance = ref(false);

const stagnantStockValue = ref(0);
const isLoadingStagnantStock = ref(true);

const stockBreakdown = ref<{ kode_cabang: string; nama_cabang: string; totalStock: number }[]>([]);
const isLoadingStock = ref(true);
const isLoadingStockBreakdown = ref(true);

const quickActions = ref([
  { title: 'Transaksi Baru', icon: 'mdi-cash-register', to: '/transaksi', color: 'primary' },
  { title: 'Master Data', icon: 'mdi-plus-circle', to: '/daftar', color: 'success' },
  { title: 'Lihat Laporan', icon: 'mdi-chart-line', to: '/laporan', color: 'info' },
  { title: 'Kelola Piutang', icon: 'mdi-account-clock', to: '/piutang', color: 'orange' },
  { title: 'Cek Gudang', icon: 'mdi-warehouse', to: '/gudang-dc', color: 'purple' },
]);

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

// Computed untuk format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount)
}

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
          return formatCurrency(value);
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
          return `${label}: ${formatCurrency(value)}`;
        }
      }
    },
    datalabels: {
      anchor: 'end' as const,
      align: 'top' as const,
      formatter: (value: number, context) => {
        if (context.datasetIndex === 1) return formatCurrency(value);
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
      todayTransactions: response.data.todayTransactions || 0,
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
    const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const dateQuery = `?startDate=${startDate}&endDate=${endDate}`;

    const response = await api.get('/dashboard/pending-actions');
    const data = response.data;

    // --- PERBARUI 'actionsMap' INI ---
    const actionsMap = [
      {
        key: 'so_open',
        title: 'Surat Pesanan Open',
        icon: 'mdi-file-document-edit-outline',
        to: `/transaksi/penjualan/surat-pesanan${dateQuery}&status=open` // <-- Tambah status
      },
      {
        key: 'so_dtf_open',
        title: 'SO DTF Belum Invoice',
        icon: 'mdi-printer-alert',
        to: `/transaksi/penjualan/dtf/so-dtf${dateQuery}&status=belum_invoice` // <-- Tambah status
      },
      {
        key: 'invoice_belum_lunas',
        title: 'Invoice Belum Lunas',
        icon: 'mdi-receipt-text-clock-outline',
        to: `/transaksi/penjualan/invoice${dateQuery}&status=belum_lunas` // <-- Tambah status
      },
      {
        key: 'penawaran_open',
        title: 'Penawaran Open',
        icon: 'mdi-handshake-outline',
        to: `/transaksi/penjualan/penawaran${dateQuery}&status=open` // <-- Tambah status
      },
      {
        key: 'pengajuan_harga_pending',
        title: 'Pengajuan Harga Pending',
        icon: 'mdi-currency-usd-circle-outline',
        to: `/transaksi/penjualan/pengajuan/setting-harga${dateQuery}&status=pending` // <-- Tambah status
      },
    ];
    // ------------------------------------

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
    topPerformers.value = response.data.top;
    bottomPerformers.value = response.data.bottom;
  } catch (error) {
    console.error('Gagal memuat performa cabang:', error);
  } finally {
    isLoadingPerformance.value = false;
  }
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

const fetchTotalStock = async () => {
  isLoadingStock.value = true;
  try {
    const response = await api.get('/dashboard/total-stok');
    // backend mengembalikan { totalStock: number }
    stats.value.totalStock = Number(response.data.totalStock || 0);
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

onMounted(() => {
  if (authStore.isAuthenticated) {
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
    }
    fetchTotalPiutang();
    fetchPiutangBreakdown();
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
  <v-container v-if="!authStore.isAuthenticated" class="landing-container fill-height" fluid>
    <v-row align="center" justify="center" class="fill-height">
      <v-col cols="12" lg="10" xl="9">
        <!-- Hero Section - Compact -->
        <div class="text-center mb-8">
          <v-avatar size="100" class="mb-4 elevation-8">
            <v-img :src="logoUrl" alt="Kaosan Logo" />
          </v-avatar>

          <h1 class="text-h3 font-weight-bold mb-3 text-white">
            Kaosan Retail Management
          </h1>
          <p class="text-h6 mb-6 text-white" style="opacity: 0.95;">
            Solusi Terpadu untuk Manajemen Bisnis Retail Anda
          </p>

          <v-btn color="white" size="x-large" @click="goToLogin" prepend-icon="mdi-login" elevation="4"
            class="px-8 text-primary mb-8">
            Login untuk Melanjutkan
          </v-btn>
        </div>

        <!-- Features Grid - Horizontal & Compact -->
        <v-row justify="center">
          <v-col v-for="feature in features" :key="feature.title" cols="6" sm="4" md="2">
            <v-card class="feature-card-compact text-center pa-4" elevation="3" hover height="100%">
              <v-avatar :color="feature.color" size="56" class="mb-3">
                <v-icon :icon="feature.icon" size="32" color="white"></v-icon>
              </v-avatar>
              <h4 class="text-subtitle-1 font-weight-bold text-grey-darken-3 mb-2">
                {{ feature.title }}
              </h4>
              <p class="text-caption text-grey-darken-1" style="line-height: 1.3;">
                {{ feature.description }}
              </p>
            </v-card>
          </v-col>
        </v-row>

        <!-- Bottom Info - Compact -->
        <div class="text-center mt-8">
          <v-chip-group class="justify-center">
            <v-chip color="white" variant="flat" prepend-icon="mdi-check-circle">
              <span class="text-primary font-weight-bold">Real-time Monitoring</span>
            </v-chip>
            <v-chip color="white" variant="flat" prepend-icon="mdi-check-circle">
              <span class="text-primary font-weight-bold">Mudah Digunakan</span>
            </v-chip>
            <v-chip color="white" variant="flat" prepend-icon="mdi-check-circle">
              <span class="text-primary font-weight-bold">Laporan Lengkap</span>
            </v-chip>
          </v-chip-group>
        </div>
      </v-col>
    </v-row>
  </v-container>

  <!-- DASHBOARD untuk user yang sudah login -->
  <v-container v-else class="home-container" fluid>
    <!-- Header Section -->
    <v-row class="mb-6">
      <v-col cols="12">
        <div class="d-flex align-center mb-4">
          <v-avatar size="60" class="mr-4">
            <v-img :src="logoUrl" alt="Kaosan Logo" />
          </v-avatar>
          <div>
            <h1 class="text-h4 font-weight-bold text-primary">
              Selamat Datang di Kaosan
            </h1>
            <p class="text-subtitle-1 text-medium-emphasis mb-0">
              Retail Management System - {{ currentTime }}
            </p>
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
              <span v-else>{{ formatCurrency(stats.todaySales) }}</span>
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

            <div v-if="!isLoadingStats && !isLoadingStock"
              class="d-flex justify-center align-center ga-3 mt-2 text-caption">
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

        <v-menu v-if="authStore.user?.cabang === 'KDC'" open-on-hover location="bottom center" origin="top center"
          transition="scale-transition" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-card v-bind="props" class="stat-card fill-height" color="orange" variant="tonal" style="cursor: help;">
              <v-card-text class="text-center">
                <v-icon size="40" class="mb-2">mdi-account-clock</v-icon>
                <div class="text-h4 font-weight-bold">
                  <span v-if="isLoadingPiutang">...</span>
                  <span v-else>{{ formatCurrency(stats.totalSisaPiutang) }}</span>
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
                      {{ new Intl.NumberFormat('id-ID').format(item.sisa_piutang) }}
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

        <v-card v-else class="stat-card fill-height" color="orange" variant="tonal">
          <v-card-text class="text-center">
            <v-icon size="40" class="mb-2">mdi-account-clock</v-icon>
            <div class="text-h4 font-weight-bold">
              <span v-if="isLoadingPiutang">...</span>
              <span v-else>{{ formatCurrency(stats.totalSisaPiutang) }}</span>
            </div>
            <div class="text-subtitle-2">Total Sisa Piutang</div>
          </v-card-text>
        </v-card>

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
            <v-icon class="mr-2" color="primary">mdi-lightning-bolt</v-icon>
            <span class="text-h6">Aksi Cepat</span>
          </v-card-title>
          <v-card-text class="pa-6">
            <v-row class="justify-center">
              <v-col v-for="action in quickActions" :key="action.title" cols="4" sm="2" class="text-center">
                <v-tooltip :text="action.title" location="bottom">
                  <template v-slot:activator="{ props }">
                    <v-btn v-bind="props" :to="action.to" :color="action.color" icon size="large" variant="flat"
                      class="mb-2" elevation="2">
                      <v-icon size="28">{{ action.icon }}</v-icon>
                    </v-btn>
                  </template>
                </v-tooltip>
                <div class="text-caption text-medium-emphasis">{{ action.title }}</div>
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
                        {{ formatCurrency(salesTargetSummary.nominal) }}
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
                        {{ formatCurrency(salesTargetSummary.target) }}
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
                    {{ formatCurrency(transaction.amount) }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
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
                <v-list-item v-for="product in lowStockProducts" :key="product.KODE" class="px-2 mb-2" rounded="lg"
                  border>
                  <template #prepend>
                    <v-avatar color="error" size="40">
                      <v-icon color="white">mdi-package-variant</v-icon>
                    </v-avatar>
                  </template>

                  <v-list-item-title class="font-weight-bold text-body-1">
                    {{ product.NAMA }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="mt-1">
                    Sisa: <strong>{{ product.TOTAL }}</strong> | Buffer: <strong>{{ product.Buffer }}</strong>
                  </v-list-item-subtitle>

                  <template #append>
                    <v-chip color="error" size="small" variant="flat" class="font-weight-bold">
                      {{ product.TOTAL }} pcs
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>

              <v-btn color="warning" variant="tonal" block class="mt-4" to="/laporan/stok/real-time"
                prepend-icon="mdi-file-chart-outline">
                Lihat Laporan Lengkap
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <v-card elevation="2" class="mt-4" color="deep-orange" variant="tonal" hover
          @click="router.push('/laporan/stok/dead-stok')">
          <v-card-text>
            <div v-if="isLoadingStagnantStock" class="text-center pa-2">
              <v-progress-circular indeterminate color="deep-orange" size="24"></v-progress-circular>
            </div>
            <div v-else class="d-flex align-center">
              <v-icon size="40" class="mr-4">mdi-archive-arrow-down-outline</v-icon>
              <div>
                <div class="text-caption text-deep-orange">Nilai Stok Stagnan (30 Hari)</div>
                <div class="text-h5 font-weight-bold">
                  {{ formatCurrency(stagnantStockValue) }}
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
              <v-list-item v-for="(product, index) in topProducts" :key="product.KODE" class="px-2 mb-2" rounded="lg"
                border>
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
        <v-card v-if="authStore.user?.cabang === 'KDC' && (topPerformers.length > 0 || bottomPerformers.length > 0)"
          elevation="2">
          <v-card-title class="d-flex align-center bg-purple-lighten-5">
            <v-icon class="mr-2" color="purple">mdi-trophy-outline</v-icon>
            <span class="text-h6">Performa Cabang (Bulan Ini)</span>
          </v-card-title>
          <v-card-text class="pa-4">
            <div v-if="isLoadingPerformance" class="text-center pa-4">
              <v-progress-circular indeterminate color="primary" />
            </div>
            <v-row v-else>
              <v-col cols="6">
                <v-list-subheader class="font-weight-bold text-success">TOP PERFORMERS</v-list-subheader>
                <v-list dense nav>
                  <v-list-item v-for="item in topPerformers" :key="item.kode_cabang" class="px-0">
                    <v-list-item-title class="font-weight-medium">{{ item.nama_cabang }}</v-list-item-title>
                    <template #append>
                      <v-chip color="success" size="small" variant="tonal">
                        {{ item.ach.toFixed(2) }}%
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </v-col>

              <v-col cols="6">
                <v-list-subheader class="font-weight-bold text-error">PERLU PERHATIAN</v-list-subheader>
                <v-list dense nav>
                  <v-list-item v-for="item in bottomPerformers" :key="item.kode_cabang" class="px-0">
                    <v-list-item-title class="font-weight-medium">{{ item.nama_cabang }}</v-list-item-title>
                    <template #append>
                      <v-chip color="error" size="small" variant="tonal">
                        {{ item.ach.toFixed(2) }}%
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
/* Landing Page Styles */
.landing-container {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  padding: 2rem;
  overflow: hidden;
  /* Prevent scroll */
}

.feature-card-compact {
  transition: all 0.3s ease;
  background: white;
  border-radius: 12px;
}

.feature-card-compact:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15) !important;
}

/* Dashboard Styles */
.home-container {
  padding: 1.5rem;
  background-color: #fafafa;
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

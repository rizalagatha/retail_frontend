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

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const authStore = useAuthStore()
const router = useRouter()
const toast = useToast();

const goToLogin = () => {
  router.push('/login')
}

// Sample data - ganti dengan data dari API
const stats = ref({
  todaySales: 0,
  todayTransactions: 0,
  lowStock: 0,
  totalProducts: 0,
  totalProductsAktif: 0, // <-- Tambahkan ini
  totalProductsPasif: 0, // <-- Tambahkan ini
});
const isLoadingStats = ref(true);

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

const pendingActions = ref<any[]>([]);
const isLoadingActions = ref(true);

const topProducts = ref([]);
const isLoadingTopProducts = ref(true);

const quickActions = ref([
  { title: 'Transaksi Baru', icon: 'mdi-cash-register', to: '/transaksi', color: 'primary' },
  { title: 'Master Data', icon: 'mdi-plus-circle', to: '/daftar', color: 'success' },
  { title: 'Lihat Laporan', icon: 'mdi-chart-line', to: '/laporan', color: 'info' },
  { title: 'Kelola Piutang', icon: 'mdi-account-clock', to: '/piutang', color: 'orange' },
  { title: 'Cek Gudang', icon: 'mdi-warehouse', to: '/gudang-dc', color: 'purple' },
  { title: 'Kelola File', icon: 'mdi-file-document', to: '/file', color: 'teal' },
]);

// Computed untuk format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount)
}

const currentTime = ref(new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'medium' }));
let intervalId: number;

const fetchDashboardStats = async () => {
  isLoadingStats.value = true;
  try {
    // Panggil endpoint baru untuk total produk
    const response = await api.get('/barang-dc/summary/total');
    stats.value.totalProducts = response.data.total;
    stats.value.totalProductsAktif = response.data.totalAktif;
    stats.value.totalProductsPasif = response.data.totalPasif;

    // Di sini Anda juga bisa memanggil API lain untuk data statistik lainnya
    // Contoh: const salesResponse = await api.get('/sales/summary/today');
    // stats.value.todaySales = salesResponse.data.total;

  } catch (error) {
    toast.error('Gagal memuat data statistik dashboard.');
  } finally {
    isLoadingStats.value = false;
  }
};

const fetchSalesChartData = async () => {
  isLoadingChart.value = true;
  try {
    // Gabungkan filter tanggal/cabang dengan filter groupBy
    const response = await api.get('/dashboard/sales-chart', {
      params: { ...chartFilters, groupBy: chartGroupBy.value }
    });

    // Logika pembuatan label menjadi lebih sederhana
    const labels = response.data.map((d: any) => {
      const date = new Date(d.tanggal);
      if (chartGroupBy.value === 'month') return format(date, 'MMM yyyy');
      if (chartGroupBy.value === 'week') return `W${format(date, 'ww')}`;
      return format(date, 'dd/MM');
    });
    const data = response.data.map((d: any) => d.total);

    chartData.value = {
      labels: labels,
      datasets: [{
        label: 'Penjualan (Rp)',
        backgroundColor: '#42A5F5',
        data: data,
        borderRadius: 4,
      }]
    }
  } catch (error) {
    toast.error('Gagal memuat data grafik penjualan.');
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
    // HAPUS .slice(0, 5) agar semua data masuk ke list
    lowStockProducts.value = lowStockData;

  } catch (error) {
    toast.error('Gagal memuat data stok menipis.');
  } finally {
    isLoadingLowStock.value = false;
  }
}

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/dashboard/cabang-options');
    cabangList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat pilihan cabang.');
  }
};

const fetchRecentTransactions = async () => {
  isLoadingTransactions.value = true;
  try {
    const response = await api.get('/dashboard/recent-transactions');
    recentTransactions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data transaksi terbaru.');
  } finally {
    isLoadingTransactions.value = false;
  }
};

const fetchPendingActions = async () => {
  isLoadingActions.value = true;
  try {
    const response = await api.get('/dashboard/pending-actions');
    const data = response.data;

    // Definisikan daftar tindakan dan petakan dengan data dari API
    const actionsMap = [
      { key: 'so_open', title: 'Surat Pesanan Open', icon: 'mdi-file-document-edit-outline', to: '/transaksi/penjualan/surat-pesanan' },
      { key: 'so_dtf_open', title: 'SO DTF Belum Invoice', icon: 'mdi-printer-alert', to: '/transaksi/penjualan/dtf/so-dtf' },
      { key: 'invoice_belum_lunas', title: 'Invoice Belum Lunas', icon: 'mdi-receipt-text-clock-outline', to: '/transaksi/penjualan/invoice' },
      { key: 'penawaran_open', title: 'Penawaran Open', icon: 'mdi-handshake-outline', to: '/transaksi/penjualan/penawaran' },
      { key: 'pengajuan_harga_pending', title: 'Pengajuan Harga Pending', icon: 'mdi-currency-usd-circle-outline', to: '/transaksi/penjualan/pengajuan/setting-harga' },
    ];

    // Filter hanya tindakan yang jumlahnya lebih dari 0
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
    toast.error('Gagal memuat data produk terlaris.');
  } finally {
    isLoadingTopProducts.value = false;
  }
}

// Update time setiap menit
setInterval(() => {
  currentTime.value = new Date().toLocaleString('id-ID')
}, 60000)

onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchDashboardStats();
    fetchLowStockData();
    fetchSalesChartData();
    fetchCabangOptions();
    fetchRecentTransactions();
    fetchPendingActions();
    fetchTopProducts();
  }
});

onMounted(() => {
  // Jalankan interval setiap 1000 milidetik (1 detik)
  intervalId = window.setInterval(() => {
    currentTime.value = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'medium' });
  }, 1000);
});

onUnmounted(() => {
  // Hentikan interval saat komponen dihancurkan (pindah halaman)
  clearInterval(intervalId);
});

watch(chartFilters, fetchSalesChartData);
watch(chartGroupBy, fetchSalesChartData);
</script>

<template>
  <v-container class="home-container" fluid>
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

          <v-spacer></v-spacer>
          <v-btn v-if="!authStore.isAuthenticated" color="primary" variant="elevated" size="large" @click="goToLogin">
            <v-icon class="mr-2">mdi-login</v-icon>
            Login
          </v-btn>
        </div>
      </v-col>
    </v-row>

    <!-- Quick Stats Cards -->
    <v-row class="mb-6">
      <v-col cols="12" sm="6" md="3">
        <v-card class="stat-card" color="success" variant="tonal">
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

      <v-col cols="12" sm="6" md="3">
        <v-card class="stat-card" color="info" variant="tonal">
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

      <v-col cols="12" sm="6" md="3">
        <v-card class="stat-card" color="warning" variant="tonal">
          <v-card-text class="text-center">
            <v-icon size="40" class="mb-2">mdi-alert-circle</v-icon>
            <div class="text-h4 font-weight-bold">{{ isLoadingLowStock ? '...' : lowStockCount }}</div>
            <div class="text-subtitle-2">Stok Menipis</div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card class="stat-card" color="primary" variant="tonal">
          <v-card-text class="text-center">
            <v-icon size="40" class="mb-2">mdi-package-variant-closed</v-icon>
            <div class="text-h4 font-weight-bold">
              <span v-if="isLoadingStats">...</span>
              <span v-else>{{ stats.totalProducts.toLocaleString('id-ID') }}</span>
            </div>
            <div class="text-subtitle-2">Total Produk</div>

            <div v-if="!isLoadingStats" class="d-flex justify-center align-center ga-3 mt-2 text-caption">
              <span class="d-flex align-center">
                <v-icon color="success" size="x-small" class="mr-1">mdi-check-circle</v-icon>
                {{ stats.totalProductsAktif }} Aktif
              </span>
              <span class="d-flex align-center">
                <v-icon color="error" size="x-small" class="mr-1">mdi-close-circle</v-icon>
                {{ stats.totalProductsPasif }} Pasif
              </span>
            </div>
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
      <!-- Quick Actions -->
      <v-col cols="12" lg="6">
        <v-card class="mb-4" elevation="2">
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-lightning-bolt</v-icon>
            Aksi Cepat
          </v-card-title>
          <v-card-text>
            <div class="d-flex justify-space-around align-center flex-wrap ga-4 pa-2">
              <div v-for="action in quickActions" :key="action.title">
                <v-tooltip :text="action.title" location="top">
                  <template v-slot:activator="{ props }">
                    <v-btn v-bind="props" :to="action.to" :color="action.color" icon size="x-large" variant="tonal">
                      <v-icon size="28">{{ action.icon }}</v-icon>
                    </v-btn>
                  </template>
                </v-tooltip>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Low Stock Alert -->
        <v-card elevation="2" color="warning" variant="tonal">
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-alert-circle</v-icon>
            Peringatan Stok Menipis
          </v-card-title>
          <v-card-text>
            <div v-if="isLoadingLowStock" class="text-center pa-4">
              <v-progress-circular indeterminate color="warning"></v-progress-circular>
              <div class="mt-2">Memuat data...</div>
            </div>
            <div v-else-if="lowStockProducts.length === 0" class="text-center pa-4">
              <v-icon size="48" color="success">mdi-check-circle-outline</v-icon>
              <div class="mt-2">Stok aman! Tidak ada produk yang menipis.</div>
            </div>
            <v-list v-else dense bg-color="transparent" class="scrollable-list">
              <v-list-item v-for="product in lowStockProducts" :key="product.KODE" class="px-0">
                <v-list-item-title class="font-weight-bold">{{ product.NAMA }}</v-list-item-title>
                <v-list-item-subtitle>
                  Sisa: {{ product.TOTAL }} | Buffer: {{ product.Buffer }}
                </v-list-item-subtitle>
                <template #append>
                  <v-chip color="error" size="small" variant="flat">
                    Sisa {{ product.TOTAL }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>

            <v-btn color="warning" variant="outlined" block class="mt-3" to="/laporan/stok">
              Lihat Laporan Lengkap
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Recent Transactions -->
      <v-col cols="12" lg="6">
        <v-card class="mb-4" elevation="2">
          <v-card-title class="d-flex align-center justify-space-between">
            <div class="d-flex align-center">
              <v-icon class="mr-2" color="success">mdi-point-of-sale</v-icon>
              Penjualan Terbaru
            </div>
            <v-btn size="small" variant="text" color="primary" to="/transaksi/penjualan/invoice">
              Lihat Semua
            </v-btn>
          </v-card-title>
          <v-card-text>
            <div v-if="isLoadingTransactions" class="text-center pa-4">
              <v-progress-circular indeterminate color="primary"></v-progress-circular>
            </div>
            <div v-else-if="recentTransactions.length === 0" class="text-center pa-4">
              Belum ada transaksi hari ini.
            </div>
            <v-list v-else dense>
              <v-list-item v-for="transaction in recentTransactions" :key="transaction.id" class="px-0">
                <v-list-item-title>{{ transaction.customer }}</v-list-item-title>
                <v-list-item-subtitle>{{ transaction.id }} - {{ transaction.time }}</v-list-item-subtitle>
                <template #append>
                  <v-chip color="success" size="small">
                    {{ formatCurrency(transaction.amount) }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
        <v-card elevation="2" class="mt-4">
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2" color="amber">mdi-star-circle-outline</v-icon>
            Produk Terlaris (Bulan Ini)
          </v-card-title>
          <v-card-text>
            <div v-if="isLoadingTopProducts" class="text-center pa-4">
              <v-progress-circular indeterminate color="primary"></v-progress-circular>
            </div>
            <v-list v-else dense>
              <v-list-item v-for="(product, index) in topProducts" :key="product.KODE" class="px-0">
                <template #prepend>
                  <v-avatar color="blue-grey-lighten-4" size="small" class="mr-4">
                    <span class="font-weight-bold">{{ index + 1 }}</span>
                  </v-avatar>
                </template>

                <v-list-item-title class="font-weight-medium">{{ product.NAMA }}</v-list-item-title>
                <v-list-item-subtitle>{{ product.KODE }}</v-list-item-subtitle>

                <template #append>
                  <v-chip color="primary" size="small" variant="flat">
                    {{ product.TOTAL?.toLocaleString('id-ID') }} pcs
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
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
  /* Atur tinggi maksimal yang Anda inginkan */
  overflow-y: auto;
}

/* Responsive adjustments */
@media (max-width: 960px) {
  .home-container {
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
}
</style>
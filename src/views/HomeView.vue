<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
import logoUrl from '@/assets/logo.png';
import api from '@/services/api';
import { useToast } from 'vue-toastification';

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

const recentTransactions = ref([
  { id: 'TRX001', customer: 'John Doe', amount: 150000, time: '10:30' },
  { id: 'TRX002', customer: 'Jane Smith', amount: 75000, time: '10:15' },
  { id: 'TRX003', customer: 'Bob Wilson', amount: 200000, time: '09:45' }
])

const lowStockProducts = ref([]);
const lowStockCount = ref(0);
const isLoadingLowStock = ref(true);

// Computed untuk format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount)
}

const currentTime = ref(new Date().toLocaleString('id-ID'))

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

// Update time setiap menit
setInterval(() => {
  currentTime.value = new Date().toLocaleString('id-ID')
}, 60000)

onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchLowStockData();
    fetchDashboardStats();
    // Anda juga bisa memanggil API lain di sini untuk mengisi stats & recentTransactions
  }
});
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
              {{ formatCurrency(stats.todaySales) }}
            </div>
            <div class="text-subtitle-2">Penjualan Hari Ini</div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card class="stat-card" color="info" variant="tonal">
          <v-card-text class="text-center">
            <v-icon size="40" class="mb-2">mdi-receipt</v-icon>
            <div class="text-h4 font-weight-bold">{{ stats.todayTransactions }}</div>
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
            <v-row>
              <v-col cols="6" sm="4">
                <v-btn block color="primary" variant="elevated" size="large" class="mb-2" to="/transaksi">
                  <v-icon class="mr-2">mdi-cash-register</v-icon>
                  Transaksi
                </v-btn>
              </v-col>
              <v-col cols="6" sm="4">
                <v-btn block color="success" variant="elevated" size="large" class="mb-2" to="/daftar">
                  <v-icon class="mr-2">mdi-plus-circle</v-icon>
                  Master Data
                </v-btn>
              </v-col>
              <v-col cols="6" sm="4">
                <v-btn block color="info" variant="elevated" size="large" class="mb-2" to="/laporan">
                  <v-icon class="mr-2">mdi-chart-line</v-icon>
                  Lihat Laporan
                </v-btn>
              </v-col>
              <v-col cols="6" sm="4">
                <v-btn block color="orange" variant="elevated" size="large" class="mb-2" to="/piutang">
                  <v-icon class="mr-2">mdi-account-clock</v-icon>
                  Kelola Piutang
                </v-btn>
              </v-col>
              <v-col cols="6" sm="4">
                <v-btn block color="purple" variant="elevated" size="large" class="mb-2" to="/gudang-dc">
                  <v-icon class="mr-2">mdi-warehouse</v-icon>
                  Cek Gudang
                </v-btn>
              </v-col>
              <v-col cols="6" sm="4">
                <v-btn block color="teal" variant="elevated" size="large" class="mb-2" to="/file">
                  <v-icon class="mr-2">mdi-file-document</v-icon>
                  Kelola File
                </v-btn>
              </v-col>
            </v-row>
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

      <!-- Recent Activity & Overview -->
      <v-col cols="12" lg="6">
        <!-- Recent Transactions -->
        <v-card class="mb-4" elevation="2">
          <v-card-title class="d-flex align-center justify-space-between">
            <div class="d-flex align-center">
              <v-icon class="mr-2">mdi-history</v-icon>
              Transaksi Terbaru
            </div>
            <v-btn size="small" variant="text" color="primary" to="/transaksi">
              Lihat Semua
            </v-btn>
          </v-card-title>
          <v-card-text>
            <v-list dense>
              <v-list-item v-for="transaction in recentTransactions" :key="transaction.id" class="px-0">
                <v-list-item-content>
                  <v-list-item-title>{{ transaction.customer }}</v-list-item-title>
                  <v-list-item-subtitle>{{ transaction.id }} - {{ transaction.time }}</v-list-item-subtitle>
                </v-list-item-content>
                <v-list-item-action>
                  <v-chip color="success" size="small">
                    {{ formatCurrency(transaction.amount) }}
                  </v-chip>
                </v-list-item-action>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>

        <!-- Quick Info Card -->
        <v-card elevation="2" color="blue-grey-lighten-5">
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-information</v-icon>
            Informasi Sistem
          </v-card-title>
          <v-card-text>
            <v-row>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">Status Sistem</div>
                <div class="d-flex align-center">
                  <v-icon color="success" size="small" class="mr-1">mdi-circle</v-icon>
                  <span class="text-body-2">Online</span>
                </div>
              </v-col>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">Terakhir Backup</div>
                <div class="text-body-2">Kemarin 23:00</div>
              </v-col>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">Pengguna Aktif</div>
                <div class="text-body-2">3 Administrator</div>
              </v-col>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">Versi Aplikasi</div>
                <div class="text-body-2">v1.2.0</div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Footer Info -->
    <v-row class="mt-6">
      <v-col cols="12">
        <v-alert type="info" variant="tonal" class="mb-0">
          <template v-slot:prepend>
            <v-icon>mdi-lightbulb</v-icon>
          </template>
          <strong>Tips:</strong> Pastikan untuk melakukan backup data secara rutin dan periksa stok produk setiap hari
          untuk
          menjaga kelancaran operasional toko.
        </v-alert>
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
<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Inisialisasi & State ---
interface DeadStockItem {
  cabang: string;
  'Nama Cabang': string;
  KtgProduk: string;
  KtgBarang: string;
  'Kelompok Barang': string; // 👈 Tambahkan ini
  'Jenis Kain': string;      // 👈 Tambahkan ini
  'Kode Barang': string;
  'Nama Barang': string;
  Ukuran: string;
  Stok: number;
  AvgSales: number;
  'Last Terima STBJ/Tanggal': string | null;
  'No STBJ/SJ': string;
  'Umur (Hari)': number;
  'Umur (Bulan)': number;
  'Umur (Tahun)': number;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '510';

const items = ref<DeadStockItem[]>([]);
const isLoading = ref(true);
const cabangOptions = ref([]);

const filters = reactive({
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '',
  minUmur: 90,
  avgPeriod: 12, // Default 1 tahun
});

// Opsi untuk filter periode
const periodOptions = [
  { title: '1 Kuartal (3 Bln)', value: 3 },
  { title: '2 Kuartal (6 Bln)', value: 6 },
  { title: '3 Kuartal (9 Bln)', value: 9 },
  { title: 'Tahunan (12 Bln)', value: 12 },
];

const headers = computed(() => [
  { title: 'No', key: 'no' },
  { title: 'Kode Cabang', key: 'cabang' },
  { title: 'Nama Cabang', key: 'Nama Cabang' },
  { title: 'KtgProduk', key: 'KtgProduk' },
  { title: 'KtgBarang', key: 'KtgBarang' },
  { title: 'Kelompok Barang', key: 'Kelompok Barang' }, // 👈 Tambahkan ini
  { title: 'Jenis Kain', key: 'Jenis Kain' },           // 👈 Tambahkan ini
  { title: 'Kode Barang', key: 'Kode Barang' },
  { title: 'Nama Barang', key: 'Nama Barang' },
  { title: 'Ukuran', key: 'Ukuran' },
  { title: 'Stok', key: 'Stok' },
  // Judul kolom sekarang mengikuti nilai filter avgPeriod
  { title: `Avg Sale (${filters.avgPeriod} Bln)`, key: 'AvgSales' },
  { title: 'Last Terima Tanggal', key: 'Last Terima STBJ/Tanggal' },
  { title: 'No STBJ/SJ', key: 'No STBJ/SJ' },
  { title: 'Umur (Hari)', key: 'Umur (Hari)' },
  { title: 'Umur (Bulan)', key: 'Umur (Bulan)' },
  { title: 'Umur (Tahun)', key: 'Umur (Tahun)' },
]);

// --- Kalkulasi Total ---
const totalStok = computed(() => {
  return items.value.reduce((sum, item) => sum + (Number(item.Stok) || 0), 0);
});

// --- Methods ---
const fetchData = async () => {
  // --- TAMBAHKAN VALIDASI INI ---
  if (!filters.minUmur || filters.minUmur <= 0) {
    toast.warning('Harap isi umur (hari) lebih besar dari 0.');
    items.value = []; // Kosongkan tabel
    return; // Hentikan pemanggilan API
  }
  // ---------------------------------

  isLoading.value = true;
  try {
    const response = await api.get('/laporan-dead-stok', { params: filters });
    items.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;

    if (error.response) {
      // Error dari server (HTTP 4xx/5xx)
      toast.error(error.response.data?.message || `Gagal memuat data. Status: ${error.response.status}`);
    } else if (error.request) {
      // Request dibuat tapi tidak ada response
      toast.error('Tidak ada respon dari server. Periksa koneksi.');
    } else {
      // Error lain (misal konfigurasi axios)
      toast.error(`Terjadi kesalahan: ${error.message}`);
    }
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/laporan-dead-stok/cabang-options');
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat filter cabang.', error);
  }
};

// Fungsi pewarnaan baris berdasarkan logika Average Sales
const getRowTextColor = (item: DeadStockItem) => {
  // Jika penjualan 0 (Mati total) dan stok masih ada
  if (Number(item.AvgSales) === 0 && Number(item.Stok) > 0) {
    return 'text-red font-weight-bold';
  }
  // Jika penjualan sangat lambat (misal < 0.5 per bulan)
  if (Number(item.AvgSales) > 0 && Number(item.AvgSales) < 0.5) {
    return 'text-orange';
  }
  return '';
};

const exportData = () => {
  if (items.value.length === 0) return toast.warning('Tidak ada data untuk diekspor.');
  const worksheet = XLSX.utils.json_to_sheet(items.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Dead Stock");
  XLSX.writeFile(workbook, `Laporan_DeadStock_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  toast.success('Data berhasil diekspor.');
};

onMounted(() => {
  fetchCabangOptions();
  fetchData(); // Muat data awal berdasarkan filter default
});

watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Dead Stock / Umur Barang" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section d-flex align-center pa-2 ga-4">
        <v-select v-model="filters.cabang" :items="cabangOptions" item-title="nama" item-value="kode" label="Cabang"
          density="compact" hide-details variant="outlined" style="max-width: 200px;"
          :readonly="authStore.user?.cabang !== 'KDC'" />

        <v-text-field v-model.number="filters.minUmur" label="Umur Barang (Hari) >=" type="number" density="compact"
          hide-details variant="outlined" style="max-width: 200px;" />

        <v-select v-model="filters.avgPeriod" :items="periodOptions" label="Periode Rata-rata" density="compact"
          hide-details variant="outlined" style="max-width: 200px;" prepend-inner-icon="mdi-chart-line" />

        <v-spacer />

        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-wrapper">
        <div class="table-container">
          <table class="custom-table">
            <thead class="sticky-header">
              <tr>
                <th v-for="header in headers" :key="header.key" class="text-center">
                  {{ header.title }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="isLoading">
                <td :colspan="headers.length" class="text-center py-4">
                  <v-progress-circular indeterminate color="primary" size="20" />
                </td>
              </tr>
              <tr v-else-if="items.length === 0">
                <td :colspan="headers.length" class="text-center py-4">Tidak ada data</td>
              </tr>
              <template v-else>
                <tr v-for="(item, index) in items" :key="index" :class="getRowTextColor(item)">
                  <td class="text-center">{{ index + 1 }}</td>
                  <td>{{ item.cabang }}</td>
                  <td>{{ item['Nama Cabang'] }}</td>
                  <td>{{ item.KtgProduk }}</td>
                  <td>{{ item.KtgBarang }}</td>
                  <td>{{ item['Kelompok Barang'] }}</td>
                  <td>{{ item['Jenis Kain'] }}</td>
                  <td>{{ item['Kode Barang'] }}</td>
                  <td class="nama-barang">{{ item['Nama Barang'] }}</td>
                  <td class="text-center">{{ item.Ukuran }}</td>
                  <td class="text-end">{{ (item.Stok || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-end" :class="item.AvgSales > 0 ? 'text-primary' : 'text-grey'">
                    {{ Number(item.AvgSales || 0).toFixed(1) }}
                  </td>
                  <td class="text-center">
                    {{ item['Last Terima STBJ/Tanggal'] ? format(new Date(item['Last Terima STBJ/Tanggal']),
                      'dd/MM/yyyy') : '' }}
                  </td>
                  <td>{{ item['No STBJ/SJ'] }}</td>
                  <td class="text-end">{{ item['Umur (Hari)'] }}</td>
                  <td class="text-end">{{ item['Umur (Bulan)'] }}</td>
                  <td class="text-end">{{ item['Umur (Tahun)'] }}</td>
                </tr>
              </template>
            </tbody>
            <tfoot class="sticky-footer">
              <tr class="font-weight-bold">
                <td colspan="10" class="text-end">GRAND TOTAL :</td>
                <td class="text-end">{{ totalStok.toLocaleString('id-ID') }}</td>
                <td colspan="5"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
}

/* FILTER */
.filter-section {
  flex-shrink: 0;
}

/* WRAPPER */
.table-wrapper {
  flex: 1;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  background-color: rgb(var(--v-theme-surface));
}

.table-container {
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgb(var(--v-theme-surface));
}

/* TABLE BASE */
.custom-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-size: 11px;
}

/* STICKY HEADER */
.custom-table thead.sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: rgb(var(--v-theme-surface));
}

/* HEADER CELLS */
.custom-table thead th {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  white-space: nowrap;
  min-width: 80px;
  color: rgb(var(--v-theme-on-surface));
}

/* BODY CELLS */
.custom-table tbody td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 6px 12px;
  font-size: 11px;
  white-space: nowrap;
  color: rgb(var(--v-theme-on-surface));
}

/* NAMA BARANG WRAP */
.custom-table tbody td.nama-barang {
  max-width: 350px;
  white-space: normal;
  word-wrap: break-word;
}

/* ROW HOVER */
.custom-table tbody tr:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

/* STICKY FOOTER (GRAND TOTAL) */
.custom-table tfoot.sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 9;
  background-color: rgb(var(--v-theme-surface));
}

.custom-table tfoot td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
}

/* ALIGNMENT */
.text-center {
  text-align: center;
}

.text-end {
  text-align: right;
}

.font-weight-bold {
  font-weight: 600;
}

/* SCROLLBAR (DARK SAFE) */
.table-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.table-container::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.35);
  border-radius: 4px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-on-surface), 0.5);
}

/* Pewarnaan Baris */
:deep(.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

.text-orange {
  color: #FB8C00 !important;
  /* Warna Orange untuk peringatan sedang */
}
</style>

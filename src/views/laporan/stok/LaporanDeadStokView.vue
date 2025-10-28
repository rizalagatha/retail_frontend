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
  'Kode Barang': string;
  'Nama Barang': string;
  Ukuran: string;
  Stok: number;
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
  minUmur: 90, // Default 90 hari
});

const headers = [
  { title: 'No', key: 'no' },
  { title: 'Kode Cabang', key: 'cabang' },
  { title: 'Nama Cabang', key: 'Nama Cabang' },
  { title: 'KtgProduk', key: 'KtgProduk' },
  { title: 'KtgBarang', key: 'KtgBarang' },
  { title: 'Kode Barang', key: 'Kode Barang' },
  { title: 'Nama Barang', key: 'Nama Barang' },
  { title: 'Ukuran', key: 'Ukuran' },
  { title: 'Stok', key: 'Stok' },
  { title: 'Last Terima Tanggal', key: 'Last Terima STBJ/Tanggal' },
  { title: 'No STBJ/SJ', key: 'No STBJ/SJ' },
  { title: 'Umur (Hari)', key: 'Umur (Hari)' },
  { title: 'Umur (Bulan)', key: 'Umur (Bulan)' },
  { title: 'Umur (Tahun)', key: 'Umur (Tahun)' },
];

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
                <tr v-for="(item, index) in items" :key="index">
                  <td class="text-center">{{ index + 1 }}</td>
                  <td>{{ item.cabang }}</td>
                  <td>{{ item['Nama Cabang'] }}</td>
                  <td>{{ item.KtgProduk }}</td>
                  <td>{{ item.KtgBarang }}</td>
                  <td>{{ item['Kode Barang'] }}</td>
                  <td class="nama-barang">{{ item['Nama Barang'] }}</td>
                  <td class="text-center">{{ item.Ukuran }}</td>
                  <td class="text-end">{{ (item.Stok || 0).toLocaleString('id-ID') }}</td>
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
                <td colspan="8" class="text-end">GRAND TOTAL :</td>
                <td class="text-end">{{ totalStok.toLocaleString('id-ID') }}</td>
                <td colspan="4"></td>
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

.filter-section {
  flex-shrink: 0;
}

.table-wrapper {
  flex: 1;
  overflow: hidden;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background-color: white;
}

.table-container {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.custom-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  background-color: white;
  font-size: 11px;
}

.custom-table thead.sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: white;
}

.custom-table thead th {
  background-color: #f5f5f5;
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  white-space: nowrap;
  min-width: 80px;
}

.custom-table tbody td {
  border: 1px solid #e0e0e0;
  padding: 6px 12px;
  font-size: 11px;
  white-space: nowrap;
}

.custom-table tbody td.nama-barang {
  max-width: 350px;
  white-space: normal;
  word-wrap: break-word;
}

.custom-table tbody tr:hover {
  background-color: #f9f9f9;
}

.custom-table tfoot.sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 9;
  background-color: #eeeeee;
}

.custom-table tfoot td {
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
}

.text-center {
  text-align: center;
}

.text-end {
  text-align: right;
}

.font-weight-bold {
  font-weight: 600;
}

/* Custom scrollbar untuk tampilan yang lebih baik */
.table-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.table-container::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>

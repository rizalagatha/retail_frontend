<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useToast } from 'vue-toastification';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Inisialisasi & State ---
interface ParetoItem {
  kode_cabang: string;
  nama_cabang: string;
  hari?: string;
  tanggal?: string;
  omset?: number;
  total_omset?: number;
  target?: number;
  total_target?: number;
  ach?: number;
  [key: string]: string | number | undefined; // fallback untuk field dinamis seperti size
}
const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '511';

const items = ref<ParetoItem[]>([]);
const isLoading = ref(true);
const cabangOptions = ref([]);
const kategoriOptions = ref([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '',
  kategori: 'ALL',
  limit: 20,
});

const headers = [
  { title: 'Cabang', key: 'Cab', fixed: true, width: '60px' },
  { title: 'Kode', key: 'KODE', fixed: true, width: '100px' },
  { title: 'Kategori Produk', key: 'KTGPRODUK', width: '100px' },
  { title: 'Nama Barang', key: 'NAMA', fixed: true, minWidth: '450px' },
  { title: 'ALLSIZE', key: 'ALLSIZE', align: 'end' }, { title: 'XS', key: 'XS', align: 'end' },
  { title: 'S', key: 'S', align: 'end' }, { title: 'M', key: 'M', align: 'end' },
  { title: 'L', key: 'L', align: 'end' }, { title: 'XL', key: 'XL', align: 'end' },
  { title: '2XL', key: '2XL', align: 'end' }, { title: '3XL', key: '3XL', align: 'end' },
  { title: '4XL', key: '4XL', align: 'end' }, { title: '5XL', key: '5XL', align: 'end' },
  { title: 'OVERSIZE', key: 'OVERSIZE', align: 'end' }, { title: 'JUMBO', key: 'JUMBO', align: 'end' },
  { title: 'Total Qty', key: 'TOTAL', align: 'end', class: 'font-weight-bold' },
  { title: 'Nominal Sales', key: 'NOMINAL_SALES', align: 'end' },
  { title: 'Stok Pareto', key: 'StokPareto', align: 'end' },
  { title: 'Stok Real', key: 'StokReal', align: 'end' },
] as const;

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/pareto', { params: filters });
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
    const response = await api.get('/pareto/cabang-options');
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat filter cabang.', error);
  }
};
const fetchKategoriOptions = async () => {
  try {
    const response = await api.get('/pareto/kategori-options');
    kategoriOptions.value = response.data;
  } catch (error) { toast.error('Gagal memuat filter kategori.', error); }
};

const exportToExcel = () => {
  if (items.value.length === 0) return toast.warning('Tidak ada data untuk diekspor.');
  const worksheet = XLSX.utils.json_to_sheet(items.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pareto Barang Terjual");
  XLSX.writeFile(workbook, "Laporan_Pareto.xlsx");
  toast.success('Data berhasil diekspor.');
};

const handlePrint = () => {
  // Bangun URL untuk halaman cetak dengan filter saat ini
  const routeData = router.resolve({
    name: 'LaporanParetoPrint', // Nama rute baru kita
    query: { ...filters }
  });
  // Buka di tab baru
  window.open(routeData.href, '_blank');
};

onMounted(() => {
  fetchCabangOptions(); // <-- Panggil fungsi yang sudah diisi
  fetchKategoriOptions();
  fetchData();
});

watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Pareto Barang Terjual" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="handlePrint" prepend-icon="mdi-printer">Cetak</v-btn>
      <v-btn size="small" color="teal" @click="exportToExcel" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-select v-model="filters.kategori" :items="kategoriOptions" label="Kategori Produk" density="compact"
          hide-details variant="outlined" class="ms-4" style="max-width: 180px;" />
        <v-select v-model="filters.cabang" :items="cabangOptions" item-title="nama" item-value="kode" label="Gudang"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 180px;" />
        <v-text-field v-model.number="filters.limit" label="Item" type="number" density="compact" hide-details
          variant="outlined" class="ms-4" style="max-width: 120px;" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-container"> <v-data-table :headers="headers" :items="items" :loading="isLoading"
          class="desktop-table horizontal-scroll-table" density="compact" :items-per-page="-1">
          <template v-for="col in headers" :key="col.key" #[`item.${col.key}`]="{ item }">
            <td>
              {{
                typeof item[col.key] === 'number'
                  ? item[col.key].toLocaleString('id-ID')
                  : typeof item[col.key] === 'string'
                    ? item[col.key]
                    : '' }}
            </td>
          </template>
          <template #bottom></template>
        </v-data-table>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
/* Wadah utama yang akan menangani scroll vertikal */
.table-container {
  height: calc(100vh - 220px);
  /* Sesuaikan angka 220px jika perlu */
  overflow-y: auto;
  /* Aktifkan scroll vertikal di sini */
}

/* Kelas untuk tabel itu sendiri */
.horizontal-scroll-table :deep(.v-table__wrapper) {
  overflow-x: auto;
  /* Aktifkan scroll horizontal di sini */
  position: relative;
}
</style>

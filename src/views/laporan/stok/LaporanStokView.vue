<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import MasterProductSearchModal from '@/components/lookup/MasterProductSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface StokItem {
  KODE: string;
  NAMA: string;
  S: number;
  M: number;
  L: number;
  XL: number;
  '2XL': number;
  '3XL': number;
  '4XL': number;
  '5XL': number;
  TOTAL: number;
  Buffer: number;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '501';

// --- State ---
const stokList = ref<StokItem[]>([]);
const isLoading = ref(false);
const filters = ref({
  gudang: authStore.user?.cabang || '',
  kodeBarang: '',
  namaBarang: '', // Untuk tampilan di field
  jenisStok: 'semua', // 'semua', 'showroom', 'pesanan'
  tampilkanKosong: false,
  tanggal: format(new Date(), 'yyyy-MM-dd'),
});
const gudangList = ref([]);
const isProductSearchVisible = ref(false);
const headers = [
  { title: 'Kode', key: 'KODE', fixed: true, width: '180px' },
  { title: 'Nama Barang', key: 'NAMA', fixed: true, width: '300px' },
  { title: 'S', key: 'S', align: 'start' },
  { title: 'M', key: 'M', align: 'start' },
  { title: 'L', key: 'L', align: 'start' },
  { title: 'XL', key: 'XL', align: 'start' },
  { title: '2XL', key: '2XL', align: 'start' },
  { title: '3XL', key: '3XL', align: 'start' },
  { title: '4XL', key: '4XL', align: 'start' },
  { title: '5XL', key: '5XL', align: 'start' },
  { title: 'Total', key: 'TOTAL', align: 'start', class: 'font-weight-bold' },
  { title: 'Buffer', key: 'Buffer', align: 'start' },
] as const;

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/laporan-stok/real-time', { params: filters.value });
    stokList.value = response.data;
  } catch {
    toast.error('Gagal memuat data stok.');
  } finally {
    isLoading.value = false;
  }
};

const exportToExcel = () => {
  if (stokList.value.length === 0) {
    toast.warning('Tidak ada data untuk diekspor.');
    return;
  }
  const worksheet = XLSX.utils.json_to_sheet(stokList.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Stok");
  XLSX.writeFile(workbook, "Laporan_Stok_Real_Time.xlsx");
  toast.success('Data berhasil diekspor.');
};

const fetchGudangList = async () => {
  try {
    const response = await api.get('/laporan-stok/lookup/gudang-options');
    gudangList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat daftar gudang.', error);
  }
};

const openProductSearch = () => {
  isProductSearchVisible.value = true;
};

const onProductSelected = (product: { kode: string, nama: string }) => {
  filters.value.kodeBarang = product.kode;
  filters.value.namaBarang = product.nama;
  isProductSearchVisible.value = false;
};

const clearProductFilter = () => {
  filters.value.kodeBarang = '';
  filters.value.namaBarang = '';
};

const getRowTextColor = (item: StokItem) => {
  if (item.Buffer > 0 && item.TOTAL < item.Buffer) {
    return 'text-red font-weight-bold';
  }
  return '';
};

watch(filters, fetchData, { deep: true });

onMounted(() => {
  if (hasViewPermission.value) {
    fetchGudangList();
    fetchData();
  }
});
</script>

<template>
  <PageLayout title="Laporan Stok Real Time" desktop-mode icon="mdi-chart-bar-stacked">
    <template #header-actions>
      <v-btn size="small" @click="exportToExcel" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <v-select v-model="filters.gudang" :items="gudangList" item-title="nama" item-value="kode" label="Gudang"
          density="compact" hide-details variant="outlined" style="max-width: 180px;"></v-select>

        <v-text-field v-model="filters.tanggal" type="date" label="Per Tanggal" density="compact" hide-details
          variant="outlined" style="max-width: 180px;"></v-text-field>

        <v-text-field v-model="filters.kodeBarang" label="Kode Barang (F1)" density="compact" hide-details
          variant="outlined" style="max-width: 180px;" readonly @click="openProductSearch"
          @keydown.f1.prevent="openProductSearch" clearable @click:clear="clearProductFilter">
          <template #append-inner><v-icon @click="openProductSearch">mdi-magnify</v-icon></template>
        </v-text-field>
        <v-text-field v-model="filters.namaBarang" readonly filled density="compact" hide-details
          style="max-width: 250px;" />

        <v-spacer></v-spacer>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading"></v-btn>
      </div>
      <div class="table-container">
        <v-data-table :headers="headers" :items="stokList" :loading="isLoading" density="compact"
          class="desktop-table fill-height-table" fixed-header>
          <template v-for="col in headers" :key="col.key" #[`item.${col.key}`]="{ item }">
            <td :class="getRowTextColor(item)">
              {{ item[col.key] }}
            </td>
          </template>
        </v-data-table>
      </div>
    </div>
    <MasterProductSearchModal v-if="isProductSearchVisible" :gudang="filters.gudang"
      @close="isProductSearchVisible = false" @product-selected="onProductSelected" />
  </PageLayout>
</template>

<style scoped>
.text-red {
  color: red !important;
}
</style>

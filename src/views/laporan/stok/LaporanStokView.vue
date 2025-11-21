<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import MasterProductSearchModal from '@/components/lookup/MasterProductSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import AppDataTable from '@/components/AppDataTable.vue';

interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: 'start' | 'center' | 'end';
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
  class?: string;
}

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
const isLoading = ref(true);
const filters = reactive({
  gudang: authStore.user?.cabang || '',
  kodeBarang: '',
  namaBarang: '',
  jenisStok: 'semua',
  tampilkanKosong: false,
  tanggal: format(new Date(), 'yyyy-MM-dd'),
});
const gudangList = ref([]);
const isProductSearchVisible = ref(false);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

// --- Header Definisi (Resize) ---
const headers = ref<DataTableHeader[]>([
  { title: 'Kode', key: 'KODE', fixed: true, width: 180 },
  { title: 'Nama Barang', key: 'NAMA', fixed: true, width: 300 },
  { title: 'S', key: 'S',  width: 80 },
  { title: 'M', key: 'M', width: 80 },
  { title: 'L', key: 'L', width: 80 },
  { title: 'XL', key: 'XL', width: 80 },
  { title: '2XL', key: '2XL', width: 80 },
  { title: '3XL', key: '3XL', width: 80 },
  { title: '4XL', key: '4XL', width: 80 },
  { title: '5XL', key: '5XL', width: 80 },
  { title: 'Total', key: 'TOTAL', width: 100, class: 'font-weight-bold' },
  { title: 'Buffer', key: 'Buffer', width: 100 },
]);

// --- Logic Resize Column ---
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  e.preventDefault();
  e.stopPropagation();
  resizingColumn.value = column;
  startX.value = e.pageX;
  startWidth.value = (typeof column.width === 'number' ? column.width : 100);
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = 'col-resize';
};

const onResizeMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;
  const diff = e.pageX - startX.value;
  resizingColumn.value.width = Math.max(50, startWidth.value + diff);
};

const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = '';
};

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/laporan-stok/real-time', { params: filters });
    stokList.value = response.data;
  } catch {
    toast.error('Gagal memuat data stok.');
  } finally {
    isLoading.value = false;
  }
};

const exportToExcel = () => {
  if (stokList.value.length === 0) {
    return toast.warning('Tidak ada data untuk diekspor.');
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

const openProductSearch = () => { isProductSearchVisible.value = true; };

const onProductSelected = (product: { kode: string, nama: string }) => {
  filters.kodeBarang = product.kode;
  filters.namaBarang = product.nama;
  isProductSearchVisible.value = false;
};

const clearProductFilter = () => {
  filters.kodeBarang = '';
  filters.namaBarang = '';
};

const getRowTextColor = (item: StokItem) => {
  // Warna Merah jika Buffer > 0 dan Total < Buffer
  if (item.Buffer > 0 && item.TOTAL < item.Buffer) {
    return 'text-red font-weight-bold';
  }
  return '';
};

// Watcher harus deep karena 'filters' adalah reactive object
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
      <v-btn size="small" color="teal" @click="exportToExcel" prepend-icon="mdi-file-excel">Export</v-btn>
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
          variant="outlined" style="max-width: 140px;"></v-text-field>

        <v-radio-group v-model="filters.jenisStok" inline density="compact" hide-details class="ms-4">
          <v-radio label="Showroom" value="showroom"></v-radio>
          <v-radio label="Pesanan" value="pesanan"></v-radio>
          <v-radio label="Semua" value="semua"></v-radio>
        </v-radio-group>

        <v-text-field v-model="filters.kodeBarang" label="Kode Barang (F1)" density="compact" hide-details
          variant="outlined" style="max-width: 150px;" class="ms-4" readonly @click="openProductSearch"
          @keydown.f1.prevent="openProductSearch" clearable @click:clear="clearProductFilter">
          <template #append-inner><v-icon @click="openProductSearch">mdi-magnify</v-icon></template>
        </v-text-field>
        <v-text-field v-model="filters.namaBarang" readonly filled density="compact" hide-details
          style="max-width: 250px;" />

        <v-spacer></v-spacer>
        <div class="d-flex align-center ga-2 text-caption me-4">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Stok Kurang dari Buffer
        </div>

        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading"></v-btn>
      </div>

      <div class="table-container">
        <AppDataTable :headers="headers" :items="stokList" :loading="isLoading" density="compact"
          class="desktop-table header-browse-blue" fixed-header :items-per-page="-1">
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  :style="{ width: header.width + 'px', minWidth: header.width + 'px', maxWidth: header.width + 'px' }"
                  class="resizable-header"
                  :class="{ 'text-center': header.align === 'center', 'text-end': header.align === 'end' }"
                  @click="toggleSort(header)">
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="small" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" @click.stop></div>
                </th>
              </template>
            </tr>
          </template>

          <template v-for="header in headers" #[`item.${header.key}`]="{ item }" :key="header.key">
            <td :class="getRowTextColor(item)">
              {{ item[header.key] }}
            </td>
          </template>
        </AppDataTable>
      </div>
    </div>

    <MasterProductSearchModal v-if="isProductSearchVisible" :gudang="filters.gudang"
      @close="isProductSearchVisible = false" @product-selected="onProductSelected" />
  </PageLayout>
</template>

<style scoped>
/* --- Layout Full Height --- */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  padding: 8px;
  border-bottom: 1px solid #e0e0e0;
  background: white;
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* --- Tabel Style --- */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* --- Header Resize --- */
.resizable-header {
  position: relative;
  background-color: #e3f2fd !important;
  color: #0d47a1 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #1976d2 !important;
  padding: 0 8px !important;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header-content {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
}

.resizable-header.text-center .header-content {
  justify-content: center;
}

.resizable-header.text-end .header-content {
  justify-content: flex-end;
}

.resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 10;
}

.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid #1565c0;
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: #d32f2f !important;
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}
</style>

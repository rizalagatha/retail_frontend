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
  TOTAL: number;
  Buffer: number;
  [key: string]: string | number; // Allow dynamic keys (S, M, L, Jumbo, A3, etc)
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
const headers = ref<DataTableHeader[]>([]);

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
// Fungsi Helper untuk mengurutkan Ukuran (agar S, M, L urut, sisanya alfabet)
const sortSizes = (a: string, b: string) => {
  const sizeOrder = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', 'ALLSIZE'];
  const idxA = sizeOrder.indexOf(a.toUpperCase());
  const idxB = sizeOrder.indexOf(b.toUpperCase());

  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
  if (idxA !== -1) return -1;
  if (idxB !== -1) return 1;
  return a.localeCompare(b);
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/laporan-stok/real-time', { params: filters });
    stokList.value = response.data;

    // --- LOGIKA DINAMIS HEADER ---
    if (stokList.value.length > 0) {
      // 1. Ambil semua key dari baris pertama data
      const firstItem = stokList.value[0];
      const allKeys = Object.keys(firstItem);

      // 2. Filter key yang BUKAN kolom statis
      const staticKeys = ['KODE', 'KATEGORI', 'NAMA', 'TOTAL', 'Buffer', 'KTGPRODUK', 'KTGBARANG'];
      const dynamicKeys = allKeys.filter(k => !staticKeys.includes(k));

      // 3. Urutkan kolom ukuran agar rapi
      dynamicKeys.sort(sortSizes);

      // 4. Susun Ulang Headers
      headers.value = [
        { title: 'Kategori', key: 'KATEGORI', width: 120 },
        { title: 'Kode', key: 'KODE', fixed: true, width: 150 },
        { title: 'Nama Barang', key: 'NAMA', fixed: true, width: 300 },

        // Masukkan kolom dinamis di tengah
        ...dynamicKeys.map(key => ({
          title: key,
          key: key,
          width: 70,
        })),

        { title: 'Total', key: 'TOTAL', width: 100, class: 'font-weight-bold bg-grey-lighten-4' },
        { title: 'Buffer', key: 'Buffer', width: 100 },
      ];
    } else {
      // Fallback jika data kosong
      headers.value = [
        { title: 'Kode', key: 'KODE' },
        { title: 'Nama Barang', key: 'NAMA' },
        { title: 'Total', key: 'TOTAL' }
      ];
    }

  } catch {
    toast.error('Gagal memuat data stok.');
  } finally {
    isLoading.value = false;
  }
};

const exportToExcel = async () => {
  try {
    isLoading.value = true;

    // Debugging (Opsional): Cek di console apakah gudang terkirim
    console.log("Mengirim filter ke export:", filters);

    // Panggil API dengan params: filters
    // Ini otomatis mengirim: /laporan-stok/real-time/export?gudang=XXX&tanggal=YYYY-MM-DD...
    const response = await api.get('/laporan-stok/real-time/export', {
      params: filters
    });

    const dataExport = response.data;

    if (!dataExport || dataExport.length === 0) {
      toast.warning('Tidak ada data untuk diekspor.');
      return;
    }

    // Sorting manual (Nama -> Ukuran)
    dataExport.sort((a: StokItem, b: StokItem) => {
      // 1. Sort by Nama Barang
      const nameComp = a.NAMA.localeCompare(b.NAMA);
      if (nameComp !== 0) return nameComp;

      // 2. Sort by Ukuran (menggunakan helper)
      // Pastikan konversi ke String karena UKURAN di interface bisa string | number
      return sortSizes(String(a.UKURAN || ''), String(b.UKURAN || ''));
    });

    const worksheet = XLSX.utils.json_to_sheet(dataExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stok Detail");

    // Nama file dinamis dengan Gudang dan Tanggal
    const namaGudang = filters.gudang === 'ALL' ? 'SEMUA' : filters.gudang;
    const filename = `Stok_${namaGudang}_${filters.tanggal}.xlsx`;

    XLSX.writeFile(workbook, filename);

    toast.success('Data berhasil diekspor.');
  } catch (error) {
    console.error(error);
    toast.error('Gagal mengekspor data.');
  } finally {
    isLoading.value = false;
  }
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
  display: flex;
  align-items: center;
  gap: 12px;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section:deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
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

  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;

  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;

  border-bottom: 2px solid rgb(var(--v-theme-primary)) !important;
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
  border-right: 2px solid rgba(var(--v-theme-on-primary), 0.6);
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

.desktop-table :deep(td) {
  color: rgb(var(--v-theme-on-surface));
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}
</style>

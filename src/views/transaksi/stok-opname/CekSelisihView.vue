<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Interface ---
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: 'start' | 'center' | 'end';
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
}

interface SelisihItem {
  Kode: string;
  Barcode: string;
  Nama: string;
  Ukuran: string;
  Stok: number;
  Hitung: number;
  Selisih: number;
  Lokasi: string;
  Invoice: number;
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '22';

const items = ref<SelisihItem[]>([]);
const isLoading = ref(true);
const cabangOptions = ref<{ kode: string; nama: string }[]>([]);
const selected = ref<SelisihItem[]>([]);
const fetchTimeout = ref<number | undefined>(undefined);

const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
  search: '',
});

// --- Header Definisi (Lebar disesuaikan untuk 11px) ---
const headers = ref<DataTableHeader[]>([
  { title: 'Kode', key: 'Kode', width: 120, fixed: true },
  { title: 'Barcode', key: 'Barcode', width: 120 },
  { title: 'Nama Barang', key: 'Nama', width: 350, fixed: true },
  { title: 'Ukuran', key: 'Ukuran', width: 80 },
  { title: 'Stok Sistem', key: 'Stok', width: 110, align: 'end' },
  { title: 'Stok Fisik', key: 'Hitung', width: 110, align: 'end' },
  { title: 'Selisih', key: 'Selisih', width: 110, align: 'end' },
  { title: 'Lokasi (Qty)', key: 'Lokasi', width: 250 },
  { title: 'Inv Stlh SO', key: 'Invoice', width: 110, align: 'end' },
]);

// --- Total Summary Logic ---
const getSummary = (data: SelisihItem[]) => ({
  Stok: data.reduce((sum, item) => sum + (Number(item.Stok) || 0), 0),
  Hitung: data.reduce((sum, item) => sum + (Number(item.Hitung) || 0), 0),
  Selisih: data.reduce((sum, item) => sum + (Number(item.Selisih) || 0), 0),
});

const totalUtama = computed(() => getSummary(utamaItems.value));
const totalSticker = computed(() => getSummary(stickerItems.value));

// --- Computed Data Terpisah ---
const utamaItems = computed(() => items.value.filter(i => i.Nama !== 'STICKER DTF' && i.Nama !== 'STICKER DTF PREMIUM'));
const stickerItems = computed(() => items.value.filter(i => i.Nama === 'STICKER DTF' || i.Nama === 'STICKER DTF PREMIUM'));

// --- Logic Resize Column ---
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  e.preventDefault(); e.stopPropagation();
  resizingColumn.value = column;
  startX.value = e.pageX;
  startWidth.value = (typeof column.width === 'number' ? column.width : 100);
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
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
};

const handleRowClick = (_event: Event, { item }: { item: SelisihItem }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/cek-selisih', { params: filters });
    items.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/cek-selisih/cabang-options');
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat pilihan cabang.', error);
  }
};

const exportToExcel = () => {
  if (items.value.length === 0) return toast.warning('Tidak ada data.');
  const worksheet = XLSX.utils.json_to_sheet(items.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Cek Selisih SO");
  XLSX.writeFile(workbook, `CekSelisihSO_${filters.cabang}.xlsx`);
};

const getRowClass = (item: SelisihItem) => item.Selisih !== 0 ? 'bg-red-lighten-5 text-red font-weight-bold' : '';

onMounted(() => {
  fetchCabangOptions();
  fetchData();
});

watch(filters, (newVal, oldVal) => {
  if (newVal.search !== oldVal.search) {
    if (fetchTimeout.value) clearTimeout(fetchTimeout.value);
    fetchTimeout.value = window.setTimeout(() => fetchData(), 500);
  } else {
    fetchData();
  }
}, { deep: true });
</script>

<template>
  <PageLayout title="Cek Selisih Stok Opname" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="teal" @click="exportToExcel" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 140px;" readonly disabled />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 140px;" readonly disabled />
        <v-select v-model="filters.cabang" :items="cabangOptions" item-title="nama" item-value="kode" label="Cabang"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;"
          :readonly="authStore.user?.cabang !== 'KDC'" />
        <v-text-field v-model="filters.search" label="Cari Nama/Kode/Barcode..." density="compact" hide-details
          variant="outlined" class="ms-4" style="min-width: 250px;" prepend-inner-icon="mdi-magnify" clearable />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-container scrollable-content pa-4">
        <div class="table-section mb-8">
          <div class="category-header bg-primary-lighten-5 text-primary">
            <v-icon size="small" class="me-2">mdi-package-variant</v-icon> BARANG UTAMA
          </div>
          <AppDataTable :headers="headers" :items="utamaItems" show-select item-value="Barcode" density="compact"
            class="custom-11px-table border rounded" :item-props="(item) => ({ class: getRowClass(item) })"
            @click:row="handleRowClick">
            <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
              <tr>
                <th v-for="header in columns" :key="header.key"
                  :style="{ width: header.width + 'px', minWidth: header.width + 'px' }" class="resizable-header"
                  :class="{ 'text-center': header.align === 'center', 'text-end': header.align === 'end' }"
                  @click="header.key !== 'data-table-select' ? toggleSort(header) : null">
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="header.key !== 'data-table-select' && isSorted(header)" size="14" class="ms-1">{{
                      getSortIcon(header) }}</v-icon>
                  </div>
                  <div v-if="header.key !== 'data-table-select'" class="resizer"
                    @mousedown.stop="onResizeStart($event, header)"></div>
                </th>
              </tr>
            </template>
            <template v-for="header in headers" #[`item.${header.key}`]="{ item }">
              <template v-if="['Stok', 'Hitung', 'Selisih', 'Invoice'].includes(header.key)">{{
                (Number(item[header.key]) || 0).toLocaleString('id-ID') }}</template>
              <template v-else>{{ item[header.key] }}</template>
            </template>
            <template #[`body.append`]>
              <tr class="bg-blue-lighten-5 font-weight-bold sticky-footer-row">
                <td :colspan="5" class="text-end pe-4">TOTAL UTAMA :</td>
                <td class="text-end">{{ totalUtama.Stok.toLocaleString('id-ID') }}</td>
                <td class="text-end">{{ totalUtama.Hitung.toLocaleString('id-ID') }}</td>
                <td class="text-end text-error">{{ totalUtama.Selisih.toLocaleString('id-ID') }}</td>
                <td colspan="2"></td>
              </tr>
            </template>
          </AppDataTable>
        </div>

        <div class="table-section">
          <div class="category-header bg-teal-lighten-5 text-teal">
            <v-icon size="small" class="me-2">mdi-sticker-circle-outline</v-icon> STICKER DTF
          </div>
          <AppDataTable :headers="headers" :items="stickerItems" show-select item-value="Barcode" density="compact"
            class="custom-11px-table border rounded" :item-props="(item) => ({ class: getRowClass(item) })"
            @click:row="handleRowClick">
            <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
              <tr>
                <th v-for="header in columns" :key="header.key"
                  :style="{ width: header.width + 'px', minWidth: header.width + 'px' }" class="resizable-header"
                  :class="{ 'text-center': header.align === 'center', 'text-end': header.align === 'end' }"
                  @click="header.key !== 'data-table-select' ? toggleSort(header) : null">
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="header.key !== 'data-table-select' && isSorted(header)" size="14" class="ms-1">{{
                      getSortIcon(header) }}</v-icon>
                  </div>
                  <div v-if="header.key !== 'data-table-select'" class="resizer"
                    @mousedown.stop="onResizeStart($event, header)"></div>
                </th>
              </tr>
            </template>
            <template v-for="header in headers" #[`item.${header.key}`]="{ item }">
              <template v-if="['Stok', 'Hitung', 'Selisih', 'Invoice'].includes(header.key)">{{
                (Number(item[header.key]) || 0).toLocaleString('id-ID') }}</template>
              <template v-else>{{ item[header.key] }}</template>
            </template>
            <template #[`body.append`]>
              <tr class="bg-teal-lighten-5 font-weight-bold sticky-footer-row">
                <td :colspan="5" class="text-end pe-4">TOTAL STICKER :</td>
                <td class="text-end">{{ totalSticker.Stok.toLocaleString('id-ID') }}</td>
                <td class="text-end">{{ totalSticker.Hitung.toLocaleString('id-ID') }}</td>
                <td class="text-end text-error">{{ totalSticker.Selisih.toLocaleString('id-ID') }}</td>
                <td colspan="2"></td>
              </tr>
            </template>
          </AppDataTable>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
/* Pengaturan Font 11px untuk isi tabel */
.custom-11px-table :deep(td),
.custom-11px-table :deep(th),
.sticky-footer-row td {
  font-size: 11px !important;
  height: 32px !important;
}

/* Header Biru Konsisten */
.resizable-header {
  background-color: rgb(var(--v-theme-primary)) !important;
  color: white !important;
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;
}

.header-content {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
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

.resizer:hover {
  border-right: 2px solid rgba(var(--v-theme-on-primary), 0.6);
}

/* Layout & Category Style */
.category-header {
  padding: 8px 12px;
  font-weight: 700;
  font-size: 12px;
  border-left: 4px solid currentColor;
  display: flex;
  align-items: center;
  margin-bottom: 2px;
}

.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
  /* sesuaikan header */
  overflow: hidden;
  /* PENTING */
}

.filter-section {
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: white;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.table-container {
  flex-grow: 1;
  overflow-y: auto;
  background-color: #f5f5f5;
  padding-bottom: 50px;
  /* Ruang agar footer/pagination tidak mepet */
}

.table-section {
  background: white;
  margin-bottom: 24px;
}

/* Sticky Footer Alignment */
.sticky-footer-row td {
  position: sticky;
  bottom: 0;
  z-index: 5;
  background-color: inherit !important;
  border-top: 2px solid rgba(0, 0, 0, 0.12) !important;
}

.text-error {
  color: #d32f2f !important;
}

.bg-blue-lighten-5 {
  background-color: #E3F2FD !important;
}

.bg-teal-lighten-5 {
  background-color: #E0F2F1 !important;
}

:deep(.bg-red-lighten-5) {
  background-color: #FFEBEE !important;
}

:deep(.text-red) {
  color: #D32F2F !important;
}
</style>

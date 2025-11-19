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
  startDate: format(new Date(), 'yyyy-MM-dd'), // Hanya tampilan
  endDate: format(new Date(), 'yyyy-MM-dd'),   // Hanya tampilan
  cabang: authStore.user?.cabang || '',
  search: '',
});

// --- Header Definisi (Resize) ---
const headers = ref<DataTableHeader[]>([
  { title: 'Kode', key: 'Kode', width: 150, fixed: true },
  { title: 'Barcode', key: 'Barcode', width: 150 },
  { title: 'Nama Barang', key: 'Nama', width: 300, fixed: true },
  { title: 'Ukuran', key: 'Ukuran', width: 100 },
  { title: 'Stok Sistem', key: 'Stok', width: 120 },
  { title: 'Stok Fisik', key: 'Hitung', width: 120 },
  { title: 'Selisih', key: 'Selisih', width: 120 },
  { title: 'Lokasi (Qty)', key: 'Lokasi', width: 250 },
  { title: 'Inv Stlh SO', key: 'Invoice', width: 120 },
]);

const totalSummary = computed(() => {
  return {
    Stok: items.value.reduce((sum, item) => sum + (Number(item.Stok) || 0), 0),
    Hitung: items.value.reduce((sum, item) => sum + (Number(item.Hitung) || 0), 0),
    Selisih: items.value.reduce((sum, item) => sum + (Number(item.Selisih) || 0), 0),
  };
});

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
  if (items.value.length === 0) {
    return toast.warning('Tidak ada data untuk diekspor.');
  }
  const worksheet = XLSX.utils.json_to_sheet(items.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Cek Selisih Stok Opname");
  XLSX.writeFile(workbook, `CekSelisihSO_${filters.cabang}.xlsx`);
  toast.success('Data berhasil diekspor.');
};

const getRowClass = (item: SelisihItem) => {
  return item.Selisih !== 0 ? 'bg-red-lighten-5 text-red font-weight-bold' : '';
};

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

      <div class="table-container">
        <AppDataTable v-model="selected" :headers="headers" :items="items" :loading="isLoading" item-value="Barcode"
          density="compact" class="desktop-table header-browse-blue" fixed-header show-select return-object
          @click:row="handleRowClick" :item-props="(item) => ({ class: getRowClass(item) })">
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
            <td>
              <template v-if="['Stok', 'Hitung', 'Selisih', 'Invoice'].includes(header.key)">
                {{ (Number(item[header.key]) || 0).toLocaleString('id-ID') }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #[`body.append`]>
            <tr class="bg-grey-lighten-4 font-weight-bold sticky-footer-row">
              <td :colspan="5" class="text-end pe-4">TOTAL :</td>
              <td class="text-end">{{ totalSummary.Stok.toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ totalSummary.Hitung.toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ totalSummary.Selisih.toLocaleString('id-ID') }}</td>
              <td colspan="2"></td>
            </tr>
          </template>

          <template #bottom></template>
        </AppDataTable>
      </div>
    </div>
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

/* --- Sticky Footer Row --- */
.sticky-footer-row td {
  position: sticky;
  bottom: 0;
  background-color: #f5f5f5;
  z-index: 5;
  border-top: 2px solid #ddd;
}

/* Pewarnaan Baris Selisih */
:deep(.bg-red-lighten-5) {
  background-color: #FFEBEE !important;
}

:deep(.text-red) {
  color: #D32F2F !important;
}
</style>

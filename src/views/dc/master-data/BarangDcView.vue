<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import type { AxiosError } from 'axios';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Tipe Data ---
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

interface MasterItem {
  kode: string;
  nama: string;
  kategori: string;
  date_create: string;
  otomatis: string;
  adaStok: 'Y' | 'N';
  status: 'AKTIF' | 'PASIF';
  [key: string]: unknown;
}

interface DetailItem {
  ukuran: string;
  barcode: string;
  hargaJual: number;
  tglSpk: string | null;
  tglProduksi: string | null;
  minBufferStore: number;
  maxBufferStore: number;
  minBufferDC: number;
  maxBufferDC: number;
  hpp?: number;
}

interface ColumnFilter {
  type: 'multi' | 'custom';
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '204';

// --- State ---
const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  hargaNol: false,
  hppNol: false,
});

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: '', operator: '=', value: '' });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Header Definisi ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Kode', key: 'kode', width: 150, fixed: true },
  { title: 'Nama Barang', key: 'nama', width: 250, fixed: true },
  { title: 'Kategori', key: 'kategori', width: 120 },
  { title: 'Tgl Buat', key: 'date_create', width: 110 },
  { title: 'Otomatis', key: 'otomatis', align: 'center', width: 100 },
  { title: 'Log Stok', key: 'adaStok', align: 'center', width: 100 },
  { title: 'Status', key: 'status', align: 'center', width: 100 },
]);

const detailHeaders = computed<DataTableHeader[]>(() => {
  const baseHeaders: DataTableHeader[] = [
    { title: 'Ukuran', key: 'ukuran', width: 80 },
    { title: 'Barcode', key: 'barcode', width: 120 },
    { title: 'Harga Jual', key: 'hargaJual', align: 'end', width: 100 },
    { title: 'Tgl SPK', key: 'tglSpk', width: 110 },
    { title: 'Tgl Produksi', key: 'tglProduksi', width: 110 },
    { title: 'Min Store', key: 'minBufferStore', align: 'end', width: 80 },
    { title: 'Max Store', key: 'maxBufferStore', align: 'end', width: 80 },
    { title: 'Min DC', key: 'minBufferDC', align: 'end', width: 80 },
    { title: 'Max DC', key: 'maxBufferDC', align: 'end', width: 80 },
  ];

  if (authStore.user?.cabang === 'KDC') {
    baseHeaders.splice(2, 0, { title: 'HPP', key: 'hpp', align: 'end', width: 100 });
  }

  return baseHeaders;
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

// --- Logic Filter Client-Side ---
const filteredList = computed(() => {
  let data = [...masterData.value];

  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    // MULTI FILTER
    if (f.type === 'multi' && f.values) {
      data = data.filter(row =>
        f.values!.includes(row[key] as string | number)
      );
    }

    // CUSTOM FILTER
    if (f.type === 'custom' && f.value !== undefined) {
      const target = String(f.value).toLowerCase();
      data = data.filter(row => {
        const v = row[key];
        if (v === null || v === undefined) return false;
        const s = String(v).toLowerCase();

        switch (f.operator) {
          case '=': return s === target;
          case '!=': return s !== target;
          case '>': return Number(s) > Number(target);
          case '>=': return Number(s) >= Number(target);
          case '<': return Number(s) < Number(target);
          case '<=': return Number(s) <= Number(target);
          case 'contains': return s.includes(target);
          case 'starts': return s.startsWith(target);
          case 'ends': return s.endsWith(target);
          default: return true;
        }
      });
    }
  }
  return data;
});

// --- Methods: Filter Logic ---
const uniqueValues = (key: string): Array<string | number> => {
  return Array.from(
    new Set(
      masterData.value
        .map(i => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== '')
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
};

const formatFilterValue = (key: string, val: string | number) => {
  if (!val) return '-';
  if (['date_create'].includes(key)) {
    try {
      return format(new Date(String(val)), 'dd/MM/yyyy');
    } catch {
      return val;
    }
  }
  return val;
};

const filterType = (key: string) => columnFilters.value[key]?.type ?? '';
const isFilterActive = (key: string) => Boolean(columnFilters.value[key]);
const clearColumnFilter = (key: string) => { delete columnFilters.value[key]; };

const toggleMultiSelectValue = (key: string, value: string | number) => {
  const f = columnFilters.value[key];
  if (!f || f.type !== 'multi') {
    columnFilters.value[key] = { type: 'multi', values: [value] };
    return;
  }
  const arr = f.values ?? [];
  if (arr.includes(value)) {
    f.values = arr.filter(v => v !== value);
    if (f.values.length === 0) delete columnFilters.value[key];
  } else {
    f.values = [...arr, value];
  }
};

const openCustomFilter = (key: string) => {
  customFilter.key = key;
  customFilter.operator = '=';
  customFilter.value = '';
  customFilterDialog.value = true;
};

const applyCustomFilter = () => {
  columnFilters.value[customFilter.key] = {
    type: 'custom',
    operator: customFilter.operator,
    value: customFilter.value
  };
  customFilterDialog.value = false;
};

const resetAllFilters = () => {
  columnFilters.value = {};
};

// --- Methods: Resize Logic ---
const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  e.preventDefault(); e.stopPropagation();
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

// --- Logic Selection ---
const handleRowClick = (_event: Event, { item }: { item: MasterItem }) => {
  selected.value = [item];
};

// --- Methods: Data ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/barang-dc', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    const msg = err.response?.data?.message || err.message || 'Gagal mengambil data.';
    toast.error(msg);
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.kode] && !loadingDetails.value.has(item.kode));
  if (!itemToLoad) return;
  const kodeToLoad = itemToLoad.kode;

  loadingDetails.value.add(kodeToLoad);
  try {
    const response = await api.get(`/barang-dc/details/${kodeToLoad}`);
    details.value[kodeToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${kodeToLoad}`, error);
  } finally {
    loadingDetails.value.delete(kodeToLoad);
  }
};

const handleNew = () => {
  router.push({ name: 'BarangDcCreate' });
};

const handleEdit = () => {
  if (!isSingleSelected.value) return;
  router.push({ name: 'BarangDcEdit', params: { kode: selectedRow.value?.kode } });
};

const getRowTextColor = (item: MasterItem) => {
  if (item.status === 'PASIF') return 'text-red font-weight-medium';
  if (item.adaStok === 'N') return 'text-blue font-weight-medium';
  return '';
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Barang DC Header");
    XLSX.writeFile(workbook, "Export_BarangDC_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/barang-dc/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Barang DC Detail");
      XLSX.writeFile(workbook, "Export_BarangDC_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Barang DC" icon="mdi-package-variant-closed">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" @click="handleEdit"
        :disabled="!isSingleSelected">Ubah</v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">Export</v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"><v-list-item-title>Export Header</v-list-item-title></v-list-item>
          <v-list-item @click="exportData('detail')"><v-list-item-title>Export Detail</v-list-item-title></v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Tgl Buat:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px;" />

        <v-checkbox v-model="filters.hargaNol" label="Harga Nol Saja" hide-details density="compact" class="ms-4" />
        <v-checkbox v-model="filters.hppNol" label="HPP Nol Saja" hide-details density="compact" class="ms-2" />

        <v-spacer />

        <div class="d-flex align-center ga-2 text-caption me-4">
          <div><v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Pasif</div>
          <div><v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> Tidak Ada Stok</div>
        </div>

        <v-btn prepend-icon="mdi-filter-off" variant="tonal" color="error" class="btn-detail reset-filter-btn"
          @click="resetAllFilters">
          Reset Filter
        </v-btn>

        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading"
          class="ms-2" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="filteredList"
          :loading="loading" :item-class="getRowTextColor" item-value="kode" density="compact"
          class="desktop-table header-browse-blue" fixed-header show-select show-expand return-object single-select
          @update:expanded="loadDetails" @click:row="handleRowClick">
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th v-if="['data-table-expand', 'data-table-select'].includes(header.key)"
                  :style="{ width: header.width + 'px' }" class="resizable-header">
                  <div class="header-content"><span>{{ header.title }}</span></div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
                </th>
                <th v-else :style="{ width: header.width + 'px' }" class="resizable-header" @click="toggleSort(header)">
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="14">{{ getSortIcon(header) }}</v-icon>

                    <v-menu location="bottom start" :close-on-content-click="false">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="16" class="ms-1" @click.stop
                          :color="isFilterActive(header.key) ? 'blue' : ''"
                          :icon="filterType(header.key) === 'custom' ? 'mdi-filter-cog' : filterType(header.key) === 'multi' ? 'mdi-filter-multiple' : 'mdi-filter-variant'" />
                      </template>
                      <v-list class="filter-menu" density="compact">
                        <v-list-item @click="clearColumnFilter(header.key)">
                          <v-list-item-title class="text-caption font-weight-bold text-error">(Clear
                            Filter)</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item v-for="val in uniqueValues(header.key)" :key="val"
                          @click="toggleMultiSelectValue(header.key, val)">
                          <template #prepend>
                            <v-checkbox-btn :model-value="columnFilters[header.key]?.values?.includes(val)"
                              density="compact" />
                          </template>
                          <v-list-item-title>{{ formatFilterValue(header.key, val) }}</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click="openCustomFilter(header.key)">
                          <v-list-item-title class="text-caption text-primary">(Custom Filter...)</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn icon="mdi-chevron-down" :class="{ 'rotate-180': isExpanded(internalItem) }" size="x-small"
              variant="text" @click.stop="toggleExpand(internalItem)" />
          </template>

          <template #[`item.kode`]="{ item }">
            <span :class="getRowTextColor(item)">{{ item.kode }}</span>
          </template>

          <template #[`item.date_create`]="{ item }">
            {{ item.date_create ? format(parseISO(item.date_create as string), 'dd/MM/yyyy') : '' }}
          </template>

          <template #[`item.status`]="{ item }">
            <v-chip :color="item.status === 'AKTIF' ? 'success' : 'error'" size="x-small" variant="tonal">
              {{ item.status }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.kode)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>
                    <v-data-table v-else-if="details[item.kode] && details[item.kode].length > 0"
                      :headers="detailHeaders" :items="details[item.kode]" density="compact" class="detail-table"
                      :items-per-page="-1" hide-default-footer>
                      <template #[`item.tglSpk`]="{ item: detail }">
                        {{ detail.tglSpk ? format(parseISO(detail.tglSpk), 'dd/MM/yyyy') : '' }}
                      </template>
                      <template #[`item.tglProduksi`]="{ item: detail }">
                        {{ detail.tglProduksi ? format(parseISO(detail.tglProduksi), 'dd/MM/yyyy') : '' }}
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-2">
                      Tidak ada data detail.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold">Custom Filter</v-card-title>
        <v-card-text>
          <v-select v-model="customFilter.operator"
            :items="['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts', 'ends']" density="compact" hide-details
            class="mb-2" />
          <v-text-field v-model="customFilter.value" density="compact" hide-details autofocus placeholder="Value..." />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Batal</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">Terapkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Layout Full Height */
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

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Table Style */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* Header Resize */
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
  cursor: pointer;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid #1565c0;
}

/* Detail Sticky (Left) */
.detail-container {
  position: sticky;
  left: 0;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: flex-start;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-size: 11px !important;
  height: 32px !important;
}

.filter-menu {
  max-height: 300px;
  overflow-y: auto;
}

/* --- TOMBOL RESET FILTER --- */
.reset-filter-btn {
  height: 40px !important;
  min-width: 120px !important;
  padding: 0 16px !important;
  font-size: 0.875rem !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  font-weight: 500 !important;
  border-radius: 4px !important;

  color: #d32f2f !important;
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}
</style>

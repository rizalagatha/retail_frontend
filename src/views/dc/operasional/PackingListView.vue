<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, subDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import ProductSearchModal from '@/components/lookup/ProductSearchModal.vue';
import AppDataTable from '@/components/AppDataTable.vue';
import * as XLSX from 'xlsx';
import { AxiosError } from 'axios';

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

interface PackingListHeader {
  Nomor: string;
  Tanggal: string;
  Store: string;
  Nama_Store: string;
  NoMinta: string;
  TglMinta: string;
  Status: string;
  NoSJFinal: string;
  Keterangan: string;
  Usr: string;
  [key: string]: unknown;
}

interface PackingListDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Jumlah: number;
}

interface Product {
  kode: string;
  nama: string;
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
const MENU_ID = '224';

// --- State ---
const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'K01' : authStore.user?.cabang || '',
  kodeBarang: '',
  namaBarang: '',
});

const loading = ref(false);
const masterData = ref<PackingListHeader[]>([]);
const selected = ref<PackingListHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, PackingListDetail[]>>({});
const dialog = reactive({ searchProduct: false, confirm: false });
const confirmAction = ref<(() => void) | null>(null);
const confirmText = ref('');

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: '', operator: '=', value: '' });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Header Definisi (Resizable) ---
const masterHeaders = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'No. Packing List', key: 'Nomor', width: 160, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 110 },
  { title: 'Store', key: 'Store', width: 80 },
  { title: 'Nama Store', key: 'Nama_Store', width: 200 },
  { title: 'No. Minta', key: 'NoMinta', width: 150 },
  { title: 'Status', key: 'Status', width: 100, align: 'center' },
  { title: 'No. SJ Final', key: 'NoSJFinal', width: 150 },
  { title: 'Keterangan', key: 'Keterangan', width: 300 },
  { title: 'User', key: 'Usr', width: 100 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'Kode', width: '120px' },
  { title: 'Nama Barang', key: 'Nama', width: '300px' },
  { title: 'Ukuran', key: 'Ukuran', width: '80px' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '100px' },
] as const;

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
  if (['Tanggal'].includes(key)) {
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
const handleRowClick = (_event: Event, { item }: { item: PackingListHeader }) => {
  selected.value = [item];
};

// --- Methods: Data ---
const formatNumber = (val: number | string) => {
  return Number(val).toLocaleString('id-ID');
};

const fetchMasterData = async () => {
  loading.value = true;
  masterData.value = [];
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/packing-list', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const fetchCabangList = async () => {
  try {
    const response = await api.get('/packing-list/lookup/cabang');
    cabangList.value = response.data;
  } catch {
    toast.error('Gagal memuat daftar cabang.');
  }
};

const loadDetails = async (newlyExpandedItems: PackingListHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/packing-list/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    details.value[nomorToLoad] = [];
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

// --- Actions ---
const handleNew = () => router.push({ name: 'PackingListCreate' });

const handleEdit = () => {
  if (!selectedRow.value) return;
  if (selectedRow.value.Status === 'C' || selectedRow.value.Status === 'SENT') {
    return toast.warning('Packing List sudah diproses menjadi Surat Jalan. Tidak bisa diubah.');
  }
  router.push({ name: 'PackingListEdit', params: { nomor: selectedRow.value.Nomor } });
};

const showDeleteConfirmation = () => {
  if (!selectedRow.value) return;
  if (selectedRow.value.Status === 'C' || selectedRow.value.Status === 'SENT') {
    return toast.warning('Packing List sudah diproses menjadi Surat Jalan. Tidak bisa dihapus.');
  }
  confirmAction.value = executeDelete;
  confirmText.value = `Yakin ingin hapus Packing List nomor ${selectedRow.value.Nomor}?`;
  dialog.confirm = true;
};

const executeDelete = async () => {
  if (!selectedRow.value) return;
  try {
    const response = await api.delete(`/packing-list/${selectedRow.value.Nomor}`);
    toast.success(response.data.message);
    fetchMasterData();
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus data.');
  }
};

const handlePrint = () => {
  if (selected.value.length !== 1) return;
  const item = selected.value[0];
  const url = router.resolve({ name: 'PackingListPrint', params: { nomor: item.Nomor } }).href;
  window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    try {
      const worksheet = XLSX.utils.json_to_sheet(masterData.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "PL Header");
      XLSX.writeFile(workbook, "Export_Packing_List_Header.xlsx");
    } catch {
      toast.error('Gagal membuat file Excel.');
    }
  } else if (type === 'detail') {
    try {
      const response = await api.get('/packing-list/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "PL Detail");
      XLSX.writeFile(workbook, "Export_Packing_List_Detail.xlsx");
    } catch {
      toast.error('Gagal mengekspor data detail.');
    }
  }
};

const onProductSelected = (products: Product[]) => {
  if (products.length > 0) {
    filters.kodeBarang = products[0].kode;
    filters.namaBarang = products[0].nama;
  }
  dialog.searchProduct = false;
};

// --- Helpers Display ---
const getStatusText = (status: string) => {
  if (status === 'O' || status === 'OPEN') return 'OPEN';
  if (status === 'SENT' || status === 'C') return 'KIRIM (OTW)';
  if (status === 'RECEIVED') return 'DITERIMA';
  return status;
};

const getStatusChipColor = (status: string) => {
  if (status === 'O' || status === 'OPEN') return 'red';
  if (status === 'SENT' || status === 'C') return 'blue';
  if (status === 'RECEIVED') return 'grey-darken-3';
  return 'grey';
};

const rowProps = (data: { item: PackingListHeader }) => {
  const item = data.item;
  let textColor = '';
  if (item.Status === 'O' || item.Status === 'OPEN') {
    textColor = 'text-red font-weight-medium';
  } else if (item.Status === 'SENT' || item.Status === 'C') {
    textColor = 'text-blue';
  } else {
    textColor = '';
  }
  return { class: textColor };
};

onMounted(async () => {
  await fetchCabangList();
  if (authStore.can(MENU_ID, 'view')) {
    fetchMasterData();
  } else {
    toast.error('Anda tidak memiliki hak akses.');
    router.push('/');
  }
});

let debounceTimer: number;
watch(filters, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { fetchMasterData(); }, 500);
}, { deep: true });

watch(() => filters.kodeBarang, (newVal) => { if (!newVal) filters.namaBarang = ''; });
</script>

<template>
  <PageLayout title="Packing List / Pra-SJ" icon="mdi-package-variant-closed">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="handleEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="showDeleteConfirmation">Hapus</v-btn>
      <v-btn size="small" color="secondary" prepend-icon="mdi-printer" :disabled="!isSingleSelected"
        @click="handlePrint">Cetak</v-btn>
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
        <v-divider vertical class="mx-2" />
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
        <v-label class="filter-label mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />

        <v-select label="Cabang Tujuan" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />

        <v-text-field v-model="filters.kodeBarang" placeholder="Cari Barang (F1)" density="compact" hide-details
          clearable variant="outlined" style="max-width: 300px;" @keydown.f1.prevent="dialog.searchProduct = true">
        </v-text-field>
        <v-text-field v-model="filters.namaBarang" placeholder="Nama Barang" density="compact" hide-details readonly
          variant="outlined" class="filter-nama-barang ms-2" style="max-width: 200px;">
        </v-text-field>

        <v-spacer />

        <v-btn class="reset-filter-btn ms-2" color="error" variant="tonal" icon @click="resetAllFilters">
          <v-icon size="18">mdi-filter-off</v-icon>
        </v-btn>

        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" class="ms-2" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="masterHeaders" :items="filteredList"
          :loading="loading" :row-props="rowProps" item-value="Nomor" density="compact"
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

          <template #[`item.Nomor`]="{ item }">
            <strong>{{ item.Nomor }}</strong>
          </template>

          <template #[`item.Tanggal`]="{ item }">
            {{ format(new Date(item.Tanggal as string), 'dd-MM-yyyy') }}
          </template>

          <template #[`item.Status`]="{ item }">
            <v-chip size="x-small" :color="getStatusChipColor(item.Status)" class="font-weight-bold" variant="flat">
              {{ getStatusText(item.Status) }}
            </v-chip>
          </template>

          <template #[`item.NoSJFinal`]="{ item }">
            <span :class="item.NoSJFinal !== '-' ? 'text-green font-weight-bold' : 'text-grey'">
              {{ item.NoSJFinal }}
            </span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>
                    <v-data-table v-else-if="details[item.Nomor]" class="detail-table" :headers="detailHeaders"
                      :items="details[item.Nomor]" density="compact" :items-per-page="-1" hide-default-footer>
                      <template #[`item.Jumlah`]="{ item }">
                        <strong>{{ formatNumber(item.Jumlah) }}</strong>
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

    <ProductSearchModal v-if="dialog.searchProduct" category="ALL" :source="'surat-jalan'"
      :gudang="authStore.user?.cabang || ''" @close="dialog.searchProduct = false"
      @products-selected="onProductSelected" />

    <v-dialog v-model="dialog.confirm" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>{{ confirmText }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialog.confirm = false">Tidak</v-btn>
          <v-btn color="error" variant="tonal" @click="confirmAction && confirmAction(); dialog.confirm = false">
            Ya, Hapus
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
  width: 40px;
  height: 40px;

  border-radius: 6px !important;
  /* sama seperti input */
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}

.filter-nama-barang :deep(input) {
  font-size: 11px !important;
}
</style>

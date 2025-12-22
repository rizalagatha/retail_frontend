<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';
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
  nomor: string;
  tanggal: string;
  nomorTerima: string | null;
  tglTerima: string | null;
  nomorTolak: string | null;
  tglTolak: string | null;
  asalGudang: string;
  keterangan: string;
  statusPengajuan: 'WAIT' | 'ACC' | 'TOLAK' | '';
  closing: 'Y' | 'N';
}

interface DetailItem {
  spk: string;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}

interface ColumnFilter {
  type: 'multi' | 'custom';
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '211';

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);

const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  gudang: 'WH003', // Fixed value
  gudangNama: 'GUDANG JADI KAOSAN', // Nama gudang
});

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: '', operator: '=', value: '' });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canTerima = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima && !selectedRow.value?.nomorTolak);
const canBatalTerima = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTerima && selectedRow.value?.closing !== 'Y');
const canTolak = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima && !selectedRow.value?.nomorTolak);
const canBatalTolak = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTolak);

// --- Header Definisi (Resizable) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor STBJ', key: 'nomor', width: 160, fixed: true },
  { title: 'Tanggal', key: 'tanggal', width: 110 },
  { title: 'Asal Gudang', key: 'asalGudang', width: 120 },
  { title: 'Nomor Terima', key: 'nomorTerima', width: 150 },
  { title: 'Nomor Tolak', key: 'nomorTolak', width: 150 },
  { title: 'User Create', key: 'userCreate', width: 120 },
  { title: 'Closing', key: 'closing', align: 'center', width: 80 },
  { title: 'Pengajuan Ubah', key: 'statusPengajuan', align: 'center', width: 130 },
]);

const detailHeaders = [
  { title: 'SPK', key: 'spk', width: '150px' },
  { title: 'Kode', key: 'kode', width: '120px' },
  { title: 'Nama Barang', key: 'nama', width: '250px' },
  { title: 'Ukuran', key: 'ukuran', width: '80px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '100px' },
] as const;

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
  if (['tanggal'].includes(key)) {
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

// --- Methods ---

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/terima-stbj', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor));
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get('/terima-stbj/details', {
      params: { nomor: nomorToLoad }
    });
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleTerima = () => {
  if (!canTerima.value) return;
  // Kirim nomor STBJ (pengiriman) sebagai query
  router.push({ name: 'TerimaStbjCreate', query: { nomorKirim: selectedRow.value.nomor } });
};

const handleTolak = () => {
  if (!canTolak.value) return;
  router.push({ name: 'TolakStbjCreate', query: { nomorKirim: selectedRow.value.nomor } });
};

const handleBatalTerima = () => {
  if (!canBatalTerima.value) return;
  showConfirmation(
    'Konfirmasi Batal Terima',
    `Yakin membatalkan penerimaan untuk STBJ dengan nomor ${selectedRow.value.nomor}?`,
    async () => {
      try {
        // Gunakan query parameter, bukan path parameter
        const response = await api.delete('/terima-stbj/cancel-receipt', {
          params: { nomor: selectedRow.value.nomor }
        });
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error) {
        const err = error as AxiosError<{ message: string }>;
        toast.error(err.response?.data?.message || 'Gagal membatalkan penerimaan.');
      }
    }
  );
};

const handleBatalTolak = () => {
  if (!canBatalTolak.value) return;
  showConfirmation(
    'Konfirmasi Batal Tolak',
    `Yakin membatalkan penolakan untuk STBJ dengan nomor <strong>${selectedRow.value.nomor}</strong>?`,
    async () => {
      try {
        const response = await api.delete('/terima-stbj/cancel-rejection', {
          params: { nomor: selectedRow.value.nomor } // Kirim nomor pengiriman
        });
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error) {
        const err = error as AxiosError<{ message: string }>;
        toast.error(err.response?.data?.message || 'Gagal membatalkan penolakan.');
      }
    }
  );
};
const getRowTextColor = (item: MasterItem) => {
  if (!item.nomorTerima && !item.nomorTolak) return 'text-red';
  if (!!item.nomorTolak) return 'text-blue';
  return '';
};

// const getCellClass = (item: MasterItem) => {
//   if (item.statusPengajuan === 'WAIT') return 'bg-blue text-white';
//   if (item.statusPengajuan === 'ACC') return 'bg-green text-white';
//   if (item.statusPengajuan === 'TOLAK') return 'bg-red text-white';
//   return '';
// };

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diexport.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Terima STBJ Header");
    XLSX.writeFile(workbook, "Export_Terima_STBJ_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/terima-stbj/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diexport pada filter ini.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Terima STBJ Detail");
      XLSX.writeFile(workbook, "Export_Terima_STBJ_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Terima STBJ" icon="mdi-truck-check-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-check" color="primary"
        @click="handleTerima" :disabled="!canTerima">Terima</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-undo" color="error"
        @click="handleBatalTerima" :disabled="!canBatalTerima">Batal Terima</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-close" color="blue"
        @click="handleTolak" :disabled="!canTolak">Tolak</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-restore" color="orange"
        @click="handleBatalTolak" :disabled="!canBatalTolak">Batal Tolak</v-btn>
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
        <v-label class="filter-label">Tgl Kirim:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
        <v-label class="filter-label mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
        <v-text-field label="Gudang" v-model="filters.gudang" density="compact" hide-details readonly variant="outlined"
          class="ms-4" style="max-width: 120px;" />
        <v-text-field v-model="filters.gudangNama" density="compact" hide-details readonly filled class="ms-2" />

        <v-spacer />

        <div class="d-flex align-center ga-4 text-caption me-4">
          <div><v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diproses</div>
          <div><v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> Ditolak</div>
        </div>

        <v-btn class="reset-filter-btn ms-2" color="error" variant="tonal" icon @click="resetAllFilters">
          <v-icon size="18">mdi-filter-off</v-icon>
        </v-btn>

        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading"
          class="ms-2" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="filteredList"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table header-browse-blue" fixed-header
          show-select show-expand return-object single-select @update:expanded="loadDetails"
          @click:row="handleRowClick">
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

          <template #[`item.nomor`]="{ item }">
            <span :class="getRowTextColor(item)">{{ item.nomor }}</span>
          </template>

          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal), 'dd/MM/yyyy') }}
          </template>

          <template #[`item.statusPengajuan`]="{ item }">
            <v-chip v-if="item.statusPengajuan" size="x-small"
              :color="item.statusPengajuan === 'ACC' ? 'green' : item.statusPengajuan === 'TOLAK' ? 'red' : 'blue'">
              {{ item.statusPengajuan }}
            </v-chip>
          </template>

          <template #[`item.closing`]="{ item }">
            <v-chip size="x-small" :color="item.closing === 'Y' ? 'green' : 'grey'">
              {{ item.closing }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                      class="detail-table" :items-per-page="-1" hide-default-footer>
                      <template #bottom></template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text> <span v-html="dialogConfirm.text"></span> </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya,
            Lanjutkan</v-btn>
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

/* --- DETAIL STICKY (POSISI KIRI) --- */
.detail-container {
  position: sticky;
  left: 0;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);

  /* Padding 16px agar rata kiri */
  padding: 16px;

  width: 100%;
  box-sizing: border-box;

  /* Flex start agar konten mulai dari kiri */
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
</style>

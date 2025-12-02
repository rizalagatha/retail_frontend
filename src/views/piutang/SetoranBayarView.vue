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
import axios from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';
import { formatRupiah } from "@/utils/formatRupiah";

// Interface Header (Resize)
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

interface SetoranHeader {
  Nomor: string;
  Otomatis: string;
  Sisa: number;
  [key: string]: unknown;
}

interface SetoranDetail {
  TglBayar: string;
  Invoice: string;
  TglInvoice: string;
  JatuhTempo: string;
  Nominal: number;
  Bayar: number;
  Keterangan: string;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '51';

// --- State ---
const masterData = ref<SetoranHeader[]>([]);
const details = ref<Record<string, SetoranDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<SetoranHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const deleteLoading = ref(false);
const search = ref('');
let searchTimeout: ReturnType<typeof setTimeout>;

const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
  search: '',
});

const isConfirmDialogVisible = ref(false);
const confirmDialogText = ref('');

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);
const canBeEdited = computed(() => {
  if (selected.value.length !== 1) return false;
  const item = selected.value[0];
  return item.Otomatis !== 'YA';
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 120 },
  { title: 'Jenis Bayar', key: 'JenisBayar', width: 120 },
  { title: 'Nominal', key: 'Nominal', align: 'end', width: 150 },
  { title: 'Dibayarkan', key: 'diBayarkan', align: 'end', width: 150 },
  { title: 'Sisa', key: 'Sisa', align: 'end', width: 150 },
  { title: 'Posting', key: 'Posting', align: 'center', width: 100 },
  { title: 'No SO', key: 'NoSO', width: 180 },
  { title: 'Kd Cus', key: 'KdCus', width: 120 },
  { title: 'Customer', key: 'Customer', width: 250 },
  { title: 'Alamat', key: 'Alamat', width: 350 },
  { title: 'Kota', key: 'Kota', width: 150 },
  { title: 'Telepon', key: 'Telepon', width: 150 },
  { title: 'Akun', key: 'Akun', width: 120 },
  { title: 'No Rekening', key: 'NoRekening', width: 150 },
  { title: 'Nama Bank', key: 'NamaBank', width: 250 },
  { title: 'Tgl Transfer', key: 'TglTransfer', width: 120 },
  { title: 'No Giro', key: 'NoGiro', width: 150 },
  { title: 'Tgl Giro', key: 'TglGiro', width: 120 },
  { title: 'Jatuh Tempo', key: 'TglJatuhTempo', width: 120 },
  { title: 'Keterangan', key: 'Keterangan', width: 300 },
  { title: 'Otomatis', key: 'Otomatis', align: 'center', width: 100 },
  { title: 'Closing', key: 'Closing', align: 'center', width: 100 },
  { title: 'User Create', key: 'UserCreate', width: 150 },
  { title: 'Date Create', key: 'DateCreate', width: 150 },
  { title: 'User Modified', key: 'UserModified', width: 150 },
  { title: 'Date Modified', key: 'DateModified', width: 150 },
]);

const detailHeaders = [
  { title: 'Tgl Bayar', key: 'TglBayar', width: '120px' },
  { title: 'Invoice', key: 'Invoice', width: '180px' },
  { title: 'Tgl Invoice', key: 'TglInvoice', width: '120px' },
  { title: 'Jatuh Tempo', key: 'JatuhTempo', width: '120px' },
  { title: 'Nominal', key: 'Nominal', align: 'end', width: 150 },
  { title: 'Bayar', key: 'Bayar', align: 'end', width: 150 },
  { title: 'Keterangan', key: 'Keterangan', width: 200 },
] as const;

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

// --- Logic Selected Row ---
const handleRowClick = (_event: Event, { item }: { item: SetoranHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/setoran-bayar/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchMasterData = async () => {
  loading.value = true;
  try {
    const response = await api.get('/setoran-bayar', { params: filters });
    masterData.value = response.data;
    selected.value = [];
    expanded.value = [];
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: SetoranHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/setoran-bayar/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      toast.error(`Gagal memuat detail untuk ${nomorToLoad}: ${err.response?.data?.message || err.message}`);
    } else {
      toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    }
    expanded.value = expanded.value.filter(k => k !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const showDeleteConfirmation = () => {
  if (!selectedRow.value) return;
  // Validasi tambahan jika perlu (misal status closing)
  confirmDialogText.value = `Yakin ingin menghapus Setoran ${selectedRow.value.Nomor}?`;
  isConfirmDialogVisible.value = true;
};

const executeDelete = async () => {
  if (!selectedRow.value) return;
  deleteLoading.value = true;
  try {
    const response = await api.delete(`/setoran-bayar/${selectedRow.value.Nomor}`);
    toast.success(response.data.message);
    fetchMasterData();
    selected.value = [];
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal menghapus data.");
  } finally {
    deleteLoading.value = false;
    isConfirmDialogVisible.value = false;
  }
};

const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Setoran Header");
    XLSX.writeFile(workbook, "Export_Setoran_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/setoran-bayar/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Setoran Detail");
      XLSX.writeFile(workbook, "Export_Setoran_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

const getRowTextColor = (item: SetoranHeader) => {
  if (item.Sisa !== 0) return 'text-red font-weight-bold';
  if (item.Otomatis === 'YA') return 'text-blue font-weight-bold';
  return '';
};

const printData = () => {
  const nomor = selectedRow.value?.Nomor;
  if (!nomor) {
    toast.error("Pilih data terlebih dahulu");
    return;
  }
  const url = router.resolve({ name: "CetakSetoranBayar", params: { nomor } }).href;
  window.open(url, "_blank");
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});

// Debounce Search
watch(search, (newVal) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    filters.search = newVal; // Gunakan newVal agar parameter 'val' terpakai
    fetchMasterData();
  }, 500); // Jeda 500ms
});

// Watch filter lain (langsung fetch)
watch(
  () => [filters.startDate, filters.endDate, filters.cabang],
  () => {
    fetchMasterData();
  }
);
</script>

<template>
  <PageLayout title="Browse Setoran Pembayaran" icon="mdi-cash-multiple">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="router.push({ name: 'SetoranBayarCreate' })">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!canBeEdited" prepend-icon="mdi-pencil"
        @click="router.push({ name: 'SetoranBayarEdit', params: { nomor: selected[0].Nomor } })">
        Ubah
      </v-btn>
      <v-btn size="small" color="error" prepend-icon="mdi-delete" :loading="deleteLoading" :disabled="!isSingleSelected"
        @click="showDeleteConfirmation">
        Hapus
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        @click="printData" prepend-icon="mdi-printer">
        Cetak
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')">
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 140px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 140px;" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />
        <v-text-field v-model="search" label="Cari nomor, customer..." density="compact" hide-details variant="outlined"
          clearable style="min-width: 250px;" prepend-inner-icon="mdi-magnify" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> Otomatis
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Lunas
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table header-browse-blue" fixed-header
          show-select return-object show-expand @update:expanded="loadDetails" @click:row="handleRowClick">
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

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn icon="mdi-chevron-down" :class="{ 'rotate-180': isExpanded(internalItem) }" size="x-small"
              variant="text" @click.stop="toggleExpand(internalItem)" />
          </template>

          <template v-for="header in headers.filter(h => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }" :key="header.key">
            <td :class="getRowTextColor(item)">
              <template v-if="['DateCreate', 'DateModified'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(item[header.key] as string), 'dd/MM/yyyy HH:mm:ss') : '-' }}
              </template>
              <template
                v-else-if="['Tanggal', 'TglTerima', 'TglTransfer', 'TglGiro', 'TglJatuhTempo'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(item[header.key] as string), 'dd/MM/yyyy') : '-' }}
              </template>
              <template v-else-if="['Nominal', 'diBayarkan', 'Sisa'].includes(header.key)">
                {{ formatRupiah(item[header.key] as number) }}
              </template>
              <template v-else-if="header.key === 'Posting'">
                <v-chip size="x-small" :color="item.Posting === 'SUDAH' ? 'green' : 'grey'">{{ item.Posting }}</v-chip>
              </template>
              <template v-else-if="header.key === 'Otomatis'">
                <v-chip v-if="item.Otomatis === 'YA'" size="x-small" color="blue-darken-2" variant="tonal">YA</v-chip>
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success" variant="tonal">YA</v-chip>
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4 text-caption">Memuat detail...
                    </div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]" density="compact"
                      class="detail-table" :items-per-page="-1" hide-default-footer>
                      <template #[`item.TglBayar`]="{ value }">
                        {{ value ? format(parseISO(value as string), 'dd/MM/yyyy') : '' }}
                      </template>
                      <template #[`item.TglInvoice`]="{ value }">
                        {{ value ? format(parseISO(value as string), 'dd/MM/yyyy') : '' }}
                      </template>
                      <template #[`item.Nominal`]="{ value }">
                        {{ formatRupiah(value as number) }}
                      </template>
                      <template #[`item.Bayar`]="{ value }">
                        {{ formatRupiah(value as number) }}
                      </template>
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

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>{{ confirmDialogText }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="closeConfirmDialog">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="executeDelete" :loading="deleteLoading">Ya, Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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

/* --- Detail Sticky --- */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  background-color: #fafafa;
  padding: 16px 16px 16px 64px;
  border-bottom: 1px solid #e0e0e0;
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background-color: white;
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: #d32f2f !important;
}

:deep(td.text-blue) {
  color: #1976d2 !important;
}
</style>

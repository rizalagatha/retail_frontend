<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MasterProductSearchModal from '@/components/lookup/MasterProductSearchModal.vue';
import * as XLSX from 'xlsx';
import axios from "axios";
import type { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Interface Header (Resize) ---
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

interface SjHeader {
  Nomor: string;
  NomorTerima: string;
  Tanggal?: string | null;
  TglTerima?: string | null;
  Closing?: string;
  [key: string]: unknown;
}

interface ErrorResponse {
  message?: string;
}

// Interface untuk data Detail dari API (sesuai alias di Query SQL)
interface SjExportDetailRow {
  'Tanggal SJ'?: string | Date;
  'Tanggal Terima'?: string | Date;
  [key: string]: unknown;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
// const MENU_ID = '31';

// --- State ---
const masterData = ref<SjHeader[]>([]);
const details = ref<Record<string, unknown[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<SjHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const isMasterProductSearchVisible = ref(false);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
  kodeBarang: '',
  namaBarang: '',
});

const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor SJ', key: 'Nomor', width: 180, fixed: true },
  { title: 'Tanggal SJ', key: 'Tanggal', width: 120 },
  { title: 'Nomor Minta', key: 'NomorMinta', width: 180 },
  { title: 'Nomor Terima', key: 'NomorTerima', width: 180 },
  { title: 'Tgl Terima', key: 'TglTerima', width: 120 },
  { title: 'Store', key: 'Store', width: 100 },
  { title: 'Nama Store', key: 'Nama_Store', width: 200 },
  { title: 'Keterangan', key: 'Keterangan', width: 300 },
  { title: 'Closing', key: 'Closing', align: 'center', width: 100 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'Kode', width: '150px' },
  { title: 'Nama Barang', key: 'Nama', width: '300px' },
  { title: 'Ukuran', key: 'Ukuran', width: '100px' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '100px' },
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
const handleRowClick = (_event: Event, { item }: { item: SjHeader }) => {
  selected.value = [item];
};

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);


// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/terima-sj/lookup/cabang');
    cabangList.value = response.data;
  } catch {
    toast.error('Gagal memuat daftar cabang.');
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  try {
    const response = await api.get('/terima-sj', { params: filters });
    masterData.value = response.data;
    selected.value = [];
    expanded.value = [];
  } catch (error: unknown) {
    if (axios.isAxiosError<ErrorResponse>(error)) {
      toast.error(error.response?.data?.message || "Gagal mengambil data.");
    } else {
      console.error("Unexpected error:", error);
      toast.error("Gagal mengambil data.");
    }
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: SjHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);
  try {
    const response = await api.get(`/terima-sj/details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}`);
    expanded.value = expanded.value.filter(nomor => nomor !== itemToLoad.Nomor);
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

const handleTerima = () => {
  if (!selectedRow.value) return;
  router.push({ name: 'TerimaSjCreate', params: { nomor: selectedRow.value.Nomor } });
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleBatalTerima = () => {
  if (!selectedRow.value) return;

  showConfirmation(
    'Konfirmasi Pembatalan',
    `Yakin ingin membatalkan penerimaan untuk SJ ${selectedRow.value.Nomor}?`,
    async () => {
      try {
        const payload = {
          header: {
            nomorSj: selectedRow.value.Nomor,
            nomorMinta: selectedRow.value.NomorMinta,
            tanggalTerima: format(new Date(), 'yyyy-MM-dd'),
          },
          items: [] // <= semua item 0 = batal penerimaan
        };

        const response = await api.post('/terima-sj-form/save', payload);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (err: unknown) {
        const error = err as AxiosError<{ message: string }>;
        toast.error(error.response?.data?.message || 'Gagal membatalkan penerimaan.');
      }
    }
  );
};

const onProductSelected = (product: { kode: string, nama: string }) => {
  filters.kodeBarang = product.kode;
  filters.namaBarang = product.nama;
  isMasterProductSearchVisible.value = false;
};

const getRowTextColor = (item: SjHeader) => {
  if (!item.NomorTerima) return 'text-red font-weight-bold';
  return '';
};

// --- 2. Helper Format Tanggal ---
const formatDateIndo = (dateString: string | Date | null | undefined) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
};

// --- 3. Fungsi Export Data ---
const exportData = async (type: 'header' | 'detail') => {

  // === EXPORT HEADER (Dari Frontend State) ===
  if (type === 'header') {
    // Casting masterData.value ke tipe yang benar
    const currentList = masterData.value as SjHeader[];

    if (currentList.length === 0) {
      toast.warning('Tidak ada data header untuk diekspor.');
      return;
    }

    try {
      toast.info('Membuat file Excel Header...');

      // Mapping data untuk format tanggal
      const formattedHeader = currentList.map((item) => ({
        ...item,
        Tanggal: item.Tanggal ? formatDateIndo(item.Tanggal) : '',
        TglTerima: item.TglTerima ? formatDateIndo(item.TglTerima) : '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Terima SJ Header");
      XLSX.writeFile(workbook, "Export_Terima_SJ_Header.xlsx");
      toast.success('File Header berhasil dibuat.');
    } catch (error) {
      toast.error('Gagal membuat file Excel.', error);
    }

    // === EXPORT DETAIL (Dari Backend API) ===
  } else if (type === 'detail') {
    try {
      toast.info('Mengambil data detail dari server...');

      // Request API dengan Generic Type
      const response = await api.get<SjExportDetailRow[]>('/terima-sj/export-details', {
        params: filters
      });

      const details = response.data;

      if (details.length === 0) {
        toast.warning('Tidak ada data detail untuk diekspor pada filter ini.');
        return;
      }

      toast.info('Membuat file Excel Detail...');

      // Format Tanggal pada data Detail
      const formattedDetail = details.map((row) => ({
        ...row,
        'Tanggal SJ': row['Tanggal SJ'] ? formatDateIndo(row['Tanggal SJ']) : '',
        'Tanggal Terima': row['Tanggal Terima'] ? formatDateIndo(row['Tanggal Terima']) : '',
      }));

      // Setup Layout Excel
      const title = "LAPORAN DETAIL TERIMA SURAT JALAN (SJ)";
      const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(filters.endDate)}`;
      const tableHeaders = Object.keys(formattedDetail[0]);

      // Konversi ke array values dengan type assertion aman
      const tableData = formattedDetail.map((row) => Object.values(row as Record<string, unknown>));

      const excelData = [
        [title],
        [dateRange],
        [],
        tableHeaders,
        ...tableData
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(excelData);

      // Merge Judul
      const merge = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } },
      ];
      worksheet['!merges'] = merge;

      // Auto Width
      const colWidths = tableHeaders.map(header => ({ wch: header.length + 5 }));
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Terima SJ Detail");
      XLSX.writeFile(workbook, "Export_Terima_SJ_Detail.xlsx");
      toast.success('File Detail berhasil dibuat.');

    } catch (error) {
      let message = 'Gagal mengekspor data detail.';
      if (error instanceof Error) message = error.message;
      toast.error(message);
    }
  }
};

const openMasterProductSearch = () => {
  isMasterProductSearchVisible.value = true;
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Terima SJ dari DC" icon="mdi-package-down">
    <template #header-actions>
      <v-btn size="small" color="primary" prepend-icon="mdi-check"
        :disabled="!isSingleSelected || !!selectedRow?.NomorTerima" @click="handleTerima">
        Terima
      </v-btn>
      <v-btn size="small" color="error" prepend-icon="mdi-undo"
        :disabled="!isSingleSelected || !selectedRow?.NomorTerima" @click="handleBatalTerima">
        Batal Terima
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
        <span class="filter-label">Tanggal SJ:</span>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 140px;" />
        <span class="mx-2">s/d</span>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 140px;" />
        <v-select v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" class="ms-4" style="max-width: 200px;" label="Cabang" />

        <v-text-field v-model="filters.kodeBarang" placeholder="Kode Barang (F1)" density="compact" hide-details
          clearable variant="outlined" style="max-width: 150px;" class="ms-4" @click="openMasterProductSearch"
          @keydown.f1.prevent="openMasterProductSearch">
          <template #append-inner>
            <v-icon @click="openMasterProductSearch">mdi-magnify</v-icon>
          </template>
        </v-text-field>
        <v-text-field v-model="filters.namaBarang" placeholder="Nama Barang" density="compact" hide-details readonly
          variant="outlined" style="max-width: 250px;" />

        <v-spacer></v-spacer>
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diterima
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
              <template v-if="['Tanggal', 'TglTerima'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(item[header.key] as string), 'dd/MM/yyyy') : '' }}
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="green" variant="tonal">YA</v-chip>
                <v-chip v-else size="x-small" color="grey" variant="tonal">TIDAK</v-chip>
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
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya,
            Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <MasterProductSearchModal v-if="isMasterProductSearchVisible" :gudang="filters.cabang"
      @close="isMasterProductSearchVisible = false" @product-selected="onProductSelected" />

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
  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;

  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;

  border-bottom: 2px solid rgb(var(--v-theme-primary)) !important;
  padding: 0 8px !important;
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

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);

  padding: 16px 16px 16px 64px;
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 800px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;

  display: flex;
  justify-content: flex-start;
  align-items: flex-start;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);

  padding: 16px 16px 16px 64px;
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 800px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}


/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}
</style>

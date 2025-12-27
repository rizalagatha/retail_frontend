<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import AppDataTable from '@/components/AppDataTable.vue';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '43';

// --- Interface Header (Wajib untuk Resize) ---
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

interface MutasiHeader {
  Nomor: string;
  Tanggal: string;
  Status: string;
  [key: string]: unknown;
}
interface MutasiDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  QtyOut: number;
  QtyIn: number;
}
interface MutasiExportRow {
  Tanggal?: string | Date;
  [key: string]: unknown;
}

// --- State ---
const list = ref<MutasiHeader[]>([]);
const details = ref<{ [key: string]: MutasiDetail[] }>({});
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const selected = ref<MutasiHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const dialogDelete = ref(false);
const isDeleting = ref(false);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 200, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 120 },
  { title: 'No. SO', key: 'NoSO', width: 200 },
  { title: 'Ke Cabang', key: 'KeCab', width: 150 },
  { title: 'Qty Out', key: 'QtyOut', width: 100 },
  { title: 'Qty In', key: 'QtyIn', width: 100 },
  { title: 'Status', key: 'Status', width: 100 },
  { title: 'Keterangan', key: 'Keterangan', width: 300 },
  { title: 'User', key: 'Usr', width: 150 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'Kode', width: '150px' },
  { title: 'Nama Barang', key: 'Nama', width: '300px' },
  { title: 'Ukuran', key: 'Ukuran', width: '100px' },
  { title: 'Qty Out', key: 'QtyOut', align: 'end', width: '100px' },
  { title: 'Qty In', key: 'QtyIn', align: 'end', width: '100px' },
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
const handleRowClick = (_event: Event, { item }: { item: MutasiHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/mutasi-out/lookup/cabang');
    cabangList.value = response.data;
    if (authStore.user?.cabang === 'KDC' && cabangList.value.length > 0) {
      selectedCabang.value = cabangList.value[0].kode;
    }
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.', error);
  }
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value || !selectedCabang.value) return;
  isLoading.value = true;
  try {
    const response = await api.get('/mutasi-out', {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
      }
    });
    list.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data Mutasi Out.', error);
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MutasiHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.Nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/mutasi-out/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`, error);
    expanded.value = expanded.value.filter(nomor => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

// Helper Format Tanggal
const formatDateIndo = (dateString: string | Date) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (list.value.length === 0) {
      toast.warning('Tidak ada data header untuk diekspor.');
      return;
    }

    // Format Header (gunakan interface MutasiHeader)
    const formattedHeader = list.value.map((item: MutasiHeader) => ({
      ...item,
      Tanggal: item.Tanggal ? formatDateIndo(item.Tanggal) : '',
    }));

    try {
      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Out Header");
      XLSX.writeFile(workbook, "Export_Mutasi_Out_Header.xlsx");
      toast.success('Data header berhasil diekspor.');
    } catch (error) {
      toast.error('Gagal membuat file Excel.', error);
    }

  } else if (type === 'detail') {
    try {
      toast.info('Mengambil data detail dari server...');
      const filters = {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value
      };

      // Gunakan Generic Type pada API request
      const response = await api.get<MutasiExportRow[]>('/mutasi-out-form/export-details', { params: filters });

      if (response.data.length === 0) {
        toast.warning('Tidak ada data detail untuk diekspor.');
        return;
      }

      // Format Detail
      const formattedDetail = response.data.map((row: MutasiExportRow) => ({
        ...row,
        Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal) : '',
      }));

      // Opsional: Custom Layout
      const title = "LAPORAN DETAIL MUTASI OUT";
      const dateRange = `Periode : ${formatDateIndo(startDate.value)} s/d ${formatDateIndo(endDate.value)}`;
      const tableHeaders = Object.keys(formattedDetail[0]);
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
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Out Detail");
      XLSX.writeFile(workbook, "Export_Mutasi_Out_Detail.xlsx");
      toast.success('Data detail berhasil diekspor.');

    } catch (error) {
      // Error handling
      let message = 'Gagal mengekspor data detail.';
      if (error instanceof Error) message = error.message;
      toast.error(message);
    }
  }
};

const getRowTextColor = (item: MutasiHeader): string => {
  switch (item.Status) {
    case 'OPEN': return 'text-red font-weight-bold';
    case 'PROSES': return 'text-blue font-weight-bold';
    default: return '';
  }
};

const getStatusChip = (status: string) => {
  if (status === 'OPEN') return { color: 'error', text: 'Open' };
  if (status === 'PROSES') return { color: 'primary', text: 'Proses' };
  if (status === 'CLOSE') return { color: 'grey', text: 'Close' };
  return { color: 'grey', text: status };
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const nomorMutasi = selected.value[0].Nomor;
  const url = router.resolve({
    name: 'Cetak Mutasi Out',
    params: { nomor: nomorMutasi }
  }).href;
  window.open(url, '_blank');
};

const handleDelete = () => {
  if (!selectedRow.value) return;
  dialogDelete.value = true;
};

const executeDelete = async () => {
  if (!selectedRow.value) return;

  isDeleting.value = true;
  try {
    const nomor = selectedRow.value.Nomor;
    const response = await api.delete(`/mutasi-out/${nomor}`);

    toast.success(response.data.message);

    dialogDelete.value = false;
    isDeleting.value = false;

    fetchData();       // reload
    selected.value = []; // clear selection

  } catch (err) {
    const msg = err?.response?.data?.message || 'Gagal menghapus data.';
    toast.error(msg);
  } finally {
    isDeleting.value = false;
  }
};

onMounted(() => {
  if (hasViewPermission.value) {
    fetchCabangList();
    fetchData();
  } else {
    isLoading.value = false;
  }
});

watch([startDate, endDate, selectedCabang], fetchData);
</script>

<template>
  <PageLayout title="Mutasi Out ke Produksi" desktop-mode icon="mdi-truck-delivery-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="router.push('/transaksi/mutasi/out-produksi/new')">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="router.push(`/transaksi/mutasi/out-produksi/ubah/${selected[0].Nomor}`)">
        Ubah
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="handleDelete">
        Hapus
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="printData">
        Cetak
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">Export</v-btn>
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

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Periode:</span>
        <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined" />
        <span class="mx-2">s/d</span>
        <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined" />
        <span class="filter-label ms-4">Cabang:</span>
        <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" />
        <v-spacer />
        <div class="legend-group">
          <div class="legend-item"><span class="color-box status-open-bg"></span> Open</div>
          <div class="legend-item"><span class="color-box status-proses-bg"></span> Proses</div>
          <div class="legend-item"><span class="color-box status-close-bg"></span> Close</div>
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="list"
          :loading="isLoading" item-value="Nomor" density="compact" class="desktop-table header-browse-blue"
          fixed-header show-select return-object show-expand @update:expanded="loadDetails" @click:row="handleRowClick">
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
              <template v-if="header.key === 'Tanggal'">
                {{ format(parseISO(item.Tanggal as string), 'dd/MM/yyyy') }}
              </template>
              <template v-else-if="header.key === 'Status'">
                <v-chip :color="getStatusChip(item.Status).color" variant="tonal" size="x-small">
                  {{ getStatusChip(item.Status).text }}
                </v-chip>
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2 text-caption">
                      Memuat detail...
                    </div>
                    <v-data-table v-else-if="details[item.Nomor] && details[item.Nomor].length" :headers="detailHeaders"
                      :items="details[item.Nomor]" item-value="Kode" density="compact" class="detail-table"
                      :items-per-page="-1" hide-default-footer>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center py-2 text-caption">
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

    <v-dialog v-model="dialogDelete" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">
          Konfirmasi Hapus
        </v-card-title>

        <v-card-text>
          Yakin ingin menghapus Mutasi Out nomor
          <strong>{{ selectedRow?.Nomor }}</strong>?<br />
          Tindakan ini tidak dapat dibatalkan.
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogDelete = false" :disabled="isDeleting">Batal</v-btn>
          <v-btn color="error" variant="tonal" :loading="isDeleting" @click="executeDelete">
            Ya, Hapus
          </v-btn>
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
  max-width: 700px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: #d32f2f !important;
}

:deep(td.text-blue) {
  color: #1976d2 !important;
}

/* Legend Box */
.legend-group {
  display: flex;
  gap: 1rem;
  font-size: 10px;
  align-items: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.color-box {
  width: 12px;
  height: 12px;
  border: 1px solid #ccc;
}

.status-open-bg {
  background-color: #FFCDD2;
}

.status-proses-bg {
  background-color: #BBDEFB;
}

.status-close-bg {
  background-color: #E0E0E0;
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

:deep(.v-dialog) .v-card {
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
</style>

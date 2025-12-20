<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, subDays, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '37';

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

interface MintaBarangHeader {
  Nomor: string;
  Tanggal: string;
  NoSO?: string;
  NoSJ?: string;
  TerimaSJ?: string;
  Keterangan?: string;
  Otomatis?: 'Y' | 'N';
  Created?: string;
  Closing?: 'Y' | 'N';
}

interface MintaBarangDetail {
  Kode: string;
  Barcode: string;
  Nama: string;
  Ukuran?: string;
  StokMinimal?: number;
  StokMaximal?: number;
  Jumlah?: number;
  SJ?: number;
}

// --- State ---
const list = ref<MintaBarangHeader[]>([]);
const details = ref<{ [nomor: string]: MintaBarangDetail[] }>({});
const isLoading = ref(true);
const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '',
  jenisPermintaan: 'semua', // 'semua', 'manual', 'otomatis'
});

const cabangList = ref([]);
const selected = ref<MintaBarangHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());

const isConfirmDeleteVisible = ref(false);
const itemToDelete = ref<MintaBarangHeader | null>(null);
const confirmDialogText = ref('');

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const canInsert = computed(() => authStore.can(MENU_ID, 'insert') && authStore.user?.cabang !== 'KDC');
const canEdit = computed(() => authStore.can(MENU_ID, 'edit'));
const canDelete = computed(() => authStore.can(MENU_ID, 'delete') && authStore.user?.cabang !== 'KDC');
const isSingleSelected = computed(() => selected.value.length === 1);

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 110 },
  { title: 'No. SO', key: 'NoSO', width: 180 },
  { title: 'No. SJ', key: 'NoSJ', width: 180 },
  { title: 'Terima SJ', key: 'TerimaSJ', width: 110 },
  { title: 'Keterangan', key: 'Keterangan', width: 300 },
  { title: 'Otomatis', key: 'Otomatis', align: 'center', width: 100 },
  { title: 'User', key: 'Created', width: 120 },
  { title: 'Closing', key: 'Closing', align: 'center', width: 80 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'Kode', width: '150px' },
  { title: 'Barcode', key: 'Barcode', width: '120px' },
  { title: 'Nama Barang', key: 'Nama', width: '250px' },
  { title: 'Ukuran', key: 'Ukuran', width: '80px' },
  { title: 'Stok Minimal', key: 'StokMinimal', align: 'end', width: '100px' },
  { title: 'Stok Maximal', key: 'StokMaximal', align: 'end', width: '100px' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '100px' },
  { title: 'SJ', key: 'SJ', align: 'end', width: '100px' },
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
const handleRowClick = (_event: Event, { item }: { item: MintaBarangHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/minta-barang/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/minta-barang', {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang: filters.cabang,
        jenisPermintaan: filters.jenisPermintaan,
      }
    });
    list.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data.', error);
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MintaBarangHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);

  try {
    const response = await api.get<MintaBarangDetail[]>(`/minta-barang/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    expanded.value = expanded.value.filter(nomor => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const getRowTextColor = (item: MintaBarangHeader) => {
  if (!item.NoSJ) return 'text-red font-weight-bold';
  if (item.NoSJ && !item.TerimaSJ) return 'text-blue font-weight-bold';
  return '';
};

const editItem = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Otomatis === 'Y') { return toast.warning('Permintaan Otomatis tidak bisa diubah.'); }
  if (item.NoSJ) { return toast.warning('Sudah dibuatkan SJ, tidak bisa diubah.'); }
  if (item.Closing === 'Y') { return toast.warning('Transaksi sudah Closing, tidak bisa diubah.'); }
  router.push(`/transaksi/internal/minta-barang/ubah/${item.Nomor}`);
};

const showDeleteConfirmation = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Otomatis === 'Y') { return toast.warning('Permintaan Otomatis tidak bisa dihapus.'); }
  if (item.NoSJ) { return toast.warning('Sudah dibuatkan SJ, tidak bisa dihapus.'); }
  if (item.Closing === 'Y') { return toast.warning('Transaksi sudah Closing, tidak bisa dihapus.'); }

  itemToDelete.value = item;
  confirmDialogText.value = `Anda yakin ingin menghapus data Nomor: ${item.Nomor}?`;
  isConfirmDeleteVisible.value = true;
};

const executeDelete = async () => {
  if (!itemToDelete.value) return;
  try {
    await api.delete(`/minta-barang/${itemToDelete.value.Nomor}`);
    toast.success(`Permintaan Barang ${itemToDelete.value.Nomor} berhasil dihapus.`);
    fetchData();
    selected.value = [];
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal menghapus data.');
  } finally {
    isConfirmDeleteVisible.value = false;
    itemToDelete.value = null;
  }
};

const handleNew = () => router.push({ name: 'MintaBarangCreate' });

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (list.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');
    const worksheet = XLSX.utils.json_to_sheet(list.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Minta Barang Header");
    XLSX.writeFile(workbook, "Export_MintaBarang_Header.xlsx");
    toast.success('File Header berhasil dibuat.');
  } else if (type === 'detail') {
    try {
      const response = await api.get('/minta-barang/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Minta Barang Detail");
      XLSX.writeFile(workbook, "Export_MintaBarang_Detail.xlsx");
      toast.success('File Detail berhasil dibuat.');
    } catch (error) {
      toast.error('Gagal mengekspor data.', error);
    }
  }
};

onMounted(() => {
  fetchCabangList();
  fetchData();
});

watch(filters, () => fetchData(), { deep: true });
</script>

<template>
  <PageLayout title="Minta Barang ke DC" desktop-mode icon="mdi-package-up">
    <template #header-actions>
      <v-btn v-if="canInsert" size="small" color="primary" prepend-icon="mdi-plus" @click="handleNew">Baru</v-btn>
      <v-btn v-if="canEdit" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="editItem">Ubah</v-btn>
      <v-btn v-if="canDelete" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-delete" color="error"
        @click="showDeleteConfirmation">Hapus</v-btn>
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
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
        <span class="mx-2">s/d</span>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
        <span class="filter-label ms-4">Cabang:</span>
        <v-select v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" />
        <v-radio-group v-model="filters.jenisPermintaan" inline hide-details density="compact" class="ms-4">
          <v-radio label="Semua" value="semua" />
          <v-radio label="Manual" value="manual" />
          <v-radio label="Otomatis" value="otomatis" />
        </v-radio-group>
        <v-spacer />
        <div class="legend-group">
          <div class="legend-item"><v-icon color="red" size="small">mdi-circle-medium</v-icon> Belum Dibuatkan SJ
          </div>
          <div class="legend-item"><v-icon color="blue" size="small">mdi-circle-medium</v-icon> Sudah SJ, Belum
            Diterima</div>
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" title="Terapkan Filter" />
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
                {{ format(parseISO(item.Tanggal), 'dd/MM/yyyy') }}
              </template>
              <template v-else-if="header.key === 'Otomatis'">
                <v-chip size="x-small" :color="item.Otomatis === 'Y' ? 'cyan' : 'purple'" label>
                  {{ item.Otomatis === 'Y' ? 'Otomatis' : 'Manual' }}
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4 text-caption">Memuat detail...
                    </div>
                    <v-data-table v-else-if="details[item.Nomor] && details[item.Nomor].length" :headers="detailHeaders"
                      :items="details[item.Nomor]" item-value="Kode" density="compact" class="detail-table"
                      :items-per-page="-1" hide-default-footer>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center py-2 text-caption">Tidak ada data detail.</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isConfirmDeleteVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>{{ confirmDialogText }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="isConfirmDeleteVisible = false">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="executeDelete">Ya, Hapus</v-btn>
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
  border-right: 2px solid rgb(var(--v-theme-on-primary));
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

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

:deep(td.text-blue) {
  color: rgb(var(--v-theme-primary)) !important;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* Legend */
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

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>

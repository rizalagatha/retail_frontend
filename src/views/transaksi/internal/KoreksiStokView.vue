<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import axios, { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// Interface Header (Wajib untuk Resize)
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

interface KoreksiStokHeader {
  nomor: string;
  tanggal: string;
  keterangan: string;
  diAccOleh?: string;
  tglAcc?: string;
  closing?: string;
  [key: string]: unknown;
}

interface KoreksiStokDetail {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  selisih: number;
  nominal: number;
  keterangan: string;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '25';

// --- State ---
const masterData = ref<KoreksiStokHeader[]>([]);
const details = ref<Record<string, KoreksiStokDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<KoreksiStokHeader[]>([]);
const expanded = ref<string[]>([]);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  belumAccSaja: false,
});

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

const canEdit = computed(() => isSingleSelected.value && !selectedRow.value?.diAccOleh);
const canDelete = computed(() => isSingleSelected.value && !selectedRow.value?.diAccOleh && selectedRow.value?.closing !== 'Y');
const canAcc = computed(() => {
  return isSingleSelected.value &&
    selectedRow.value?.closing !== 'Y' &&
    authStore.user?.canApproveCorrection;
});
const accButtonText = computed(() => selectedRow.value?.diAccOleh ? 'Batal ACC' : 'ACC');
const accButtonColor = computed(() => selectedRow.value?.diAccOleh ? 'orange' : 'success');

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'tanggal', width: 120 },
  { title: 'Keterangan', key: 'keterangan', width: 300 },
  { title: 'DiAcc Oleh', key: 'diAccOleh', width: 150 },
  { title: 'Tgl ACC', key: 'tglAcc', width: 150 },
  { title: 'Closing', key: 'closing', align: 'center', width: 100 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'kode', width: '150px' },
  { title: 'Nama Barang', key: 'nama', width: '250px' },
  { title: 'Ukuran', key: 'ukuran', width: '100px' },
  { title: 'Stok Sistem', key: 'stok', align: 'end', width: '100px' },
  { title: 'Stok Fisik', key: 'jumlah', align: 'end', width: '100px' },
  { title: 'Selisih', key: 'selisih', align: 'end', width: '100px' },
  { title: 'Nominal', key: 'nominal', align: 'end', width: '120px' },
  { title: 'Keterangan', key: 'keterangan', width: '200px' },
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
const handleRowClick = (_event: Event, { item }: { item: KoreksiStokHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get<KoreksiStokHeader[]>('/koreksi-stok', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      toast.error(error.response?.data?.message || 'Gagal mengambil data.');
    } else {
      toast.error('Gagal mengambil data.');
    }
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: { nomor: string }[]) => {
  const itemToLoad = newlyExpandedItems.find(
    item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor)
  );
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get<KoreksiStokDetail[]>(`/koreksi-stok/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || `Gagal memuat detail untuk ${nomorToLoad}`);
    } else {
      toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    }
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

const handleNew = () => router.push({ name: 'KoreksiStokCreate' });
const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: 'KoreksiStokEdit', params: { nomor: selectedRow.value?.nomor } });
};

const handleDelete = () => {
  if (!canDelete.value || !selectedRow.value) return;

  showConfirmation(
    'Konfirmasi Hapus',
    `Yakin ingin menghapus dokumen ${selectedRow.value.nomor}?`,
    async () => {
      try {
        const response = await api.delete<{ message: string }>(`/koreksi-stok/${selectedRow.value?.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          toast.error(error.response?.data?.message || 'Gagal menghapus data.');
        } else {
          toast.error('Gagal menghapus data.');
        }
      }
    }
  );
};

const handleAcc = () => {
  if (!canAcc.value || !selectedRow.value) return;
  const isApproved = !!selectedRow.value.diAccOleh;
  const actionText = isApproved ? 'membatalkan ACC' : 'menyetujui (ACC)';

  showConfirmation(
    `Konfirmasi ${isApproved ? 'Batal ACC' : 'ACC'}`,
    `Yakin ingin ${actionText} dokumen ${selectedRow.value.nomor}?`,
    async () => {
      try {
        const response = await api.post<{ message: string }>(`/koreksi-stok/toggle-approval/${selectedRow.value?.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          toast.error(error.response?.data?.message || 'Gagal memproses permintaan.');
        } else {
          toast.error('Gagal memproses permintaan.');
        }
      }
    }
  );
};

const handlePrint = () => {
  if (!isSingleSelected.value || !selectedRow.value) return;
  const url = router.resolve({
    name: 'KoreksiStokPrint',
    params: { nomor: selectedRow.value.nomor }
  }).href;
  window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diexport.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Koreksi Stok Header");
    XLSX.writeFile(workbook, "Export_KoreksiStok_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/koreksi-stok/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diexport pada filter ini.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Koreksi Stok Detail");
      XLSX.writeFile(workbook, "Export_KoreksiStok_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

const getRowTextColor = (item: KoreksiStokHeader) => {
  if (!item.diAccOleh) return 'text-red font-weight-bold';
  return '';
};

onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Koreksi Stok" icon="mdi-file-check-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" @click="handleEdit"
        :disabled="!canEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        @click="handleDelete" :disabled="!canDelete">Hapus</v-btn>

      <v-btn v-if="canAcc" size="small" :color="accButtonColor" @click="handleAcc">
        {{ accButtonText }}
      </v-btn>

      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="handlePrint">
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
          style="max-width: 150px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px;" />
        <v-checkbox-btn v-model="filters.belumAccSaja" label="Tampilkan yang belum Acc saja" class="ms-4" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum di-ACC
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="masterData"
          :loading="loading"
          item-value="nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          show-expand
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  :style="{ width: header.width + 'px', minWidth: header.width + 'px', maxWidth: header.width + 'px' }"
                  class="resizable-header"
                  :class="{ 'text-center': header.align === 'center', 'text-end': header.align === 'end' }"
                  @click="toggleSort(header)"
                >
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
              <template v-if="header.key === 'tanggal'">
                {{ item.tanggal ? format(parseISO(item.tanggal), 'dd/MM/yyyy') : '' }}
              </template>
              <template v-else-if="header.key === 'closing'">
                <v-chip v-if="item.closing === 'Y'" size="x-small" color="success">YA</v-chip>
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
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4 text-caption">
                      Memuat detail...
                    </div>
                    <v-data-table
                      v-else
                      :headers="detailHeaders"
                      :items="details[item.nomor]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
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
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">
            Ya, Lanjutkan
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

.resizable-header.text-center .header-content { justify-content: center; }
.resizable-header.text-end .header-content { justify-content: flex-end; }

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

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}
</style>

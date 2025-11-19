<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
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

interface MutasiStokHeader {
  Nomor: string;
  Tanggal: string;
  Jenis: string;
  NoSO: string;
  Invoice?: string;
  KdCus?: string;
  Customer?: string;
  Alamat?: string;
  Kota?: string;
  Keterangan?: string;
  Usr?: string;
}

interface MutasiStokDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Qty: number;
}

interface MasterItem {
  Nomor: string;
  [key: string]: unknown;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '45';

// --- State ---
const masterData = ref<MutasiStokHeader[]>([]);
const details = ref<Record<string, MutasiStokDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MutasiStokHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const dialogDelete = ref(false);
const isDeleting = ref(false);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 120 },
  { title: 'Jenis Mutasi', key: 'Jenis', width: 200 },
  { title: 'No. SO', key: 'NoSO', width: 180 },
  { title: 'Invoice', key: 'Invoice', width: 180 },
  { title: 'Kd Cus', key: 'KdCus', width: 120 },
  { title: 'Customer', key: 'Customer', width: 250 },
  { title: 'Alamat', key: 'Alamat', width: 350 },
  { title: 'Kota', key: 'Kota', width: 150 },
  { title: 'Keterangan', key: 'Keterangan', width: 250 },
  { title: 'User', key: 'Usr', width: 120 },
]);

const detailHeaders = [
  { title: 'Kode Barang', key: 'Kode', width: '150px' },
  { title: 'Nama Barang', key: 'Nama', width: '300px' },
  { title: 'Ukuran', key: 'Ukuran', width: '100px' },
  { title: 'Qty', key: 'Qty', align: 'end', width: '100px' },
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
const handleRowClick = (_event: Event, { item }: { item: MutasiStokHeader }) => {
  selected.value = [item];
};

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/mutasi-stok/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchMasterData = async () => {
  loading.value = true;
  try {
    const response = await api.get<MutasiStokHeader[]>('/mutasi-stok', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    toast.error(msg || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);

  try {
    const response = await api.get<MutasiStokDetail[]>(`/mutasi-stok/details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data;
  } catch (error: unknown) {
    const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    toast.error(msg || `Gagal memuat detail untuk ${itemToLoad.Nomor}`);
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

const handleDelete = () => {
  if (!selectedRow.value) return;
  dialogDelete.value = true;
};

const executeDelete = () => {
  if (!selectedRow.value) return;

  isDeleting.value = true;
  api.delete(`/mutasi-stok/${selectedRow.value.Nomor}`)
    .then(response => {
      toast.success(response.data.message);
      fetchMasterData();
      selected.value = [];
    })
    .catch(error => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Gagal menghapus data.');
    })
    .finally(() => {
      isDeleting.value = false;
      dialogDelete.value = false;
    });
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].Nomor;
  const url = router.resolve({
    name: 'Cetak Mutasi Stok',
    params: { nomor }
  }).href;
  window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');
    try {
      toast.info('Membuat file Excel...');
      const worksheet = XLSX.utils.json_to_sheet(masterData.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Stok Header");
      XLSX.writeFile(workbook, "Export_Mutasi_Stok_Header.xlsx");
    } catch (error) { toast.error('Gagal membuat file Excel.', error); }
  } else if (type === 'detail') {
    try {
      toast.info('Mengambil data detail dari server...');
      const response = await api.get('/mutasi-stok/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Stok Detail");
      XLSX.writeFile(workbook, "Export_Mutasi_Stok_Detail.xlsx");
    } catch (error) { toast.error('Gagal mengekspor data detail.', error); }
  }
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Mutasi Stok" icon="mdi-swap-horizontal-bold">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="router.push({ name: 'MutasiStokCreate' })">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!isSingleSelected"
        @click="router.push({ name: 'MutasiStokEdit', params: { nomor: selectedRow?.Nomor } })">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        :disabled="!isSingleSelected" @click="handleDelete">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="printData">
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
        <v-label class="filter-label">Filter Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />
        <v-spacer />
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
            <td>
              <template v-if="header.key === 'Tanggal'">
                {{ format(parseISO(item.Tanggal as string), 'dd/MM/yyyy') }}
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
                    <div
                      v-if="!loadingDetails.has(item.Nomor) && (!details[item.Nomor] || details[item.Nomor].length === 0)"
                      class="text-center py-2 text-caption">
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
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Yakin ingin menghapus Mutasi Stok nomor <strong>{{ selectedRow?.Nomor }}</strong>?
          <br />
          Tindakan ini tidak dapat dibatalkan.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogDelete = false" :disabled="isDeleting">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="executeDelete" :loading="isDeleting">
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
  max-width: 600px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background-color: white;
}
</style>

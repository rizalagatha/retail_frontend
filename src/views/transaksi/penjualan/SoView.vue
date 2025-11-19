<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
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

interface SoHeader {
  Nomor: string;
  Tanggal: string;
  Dateline: string;
  Status: string;
  StatusKirim: string;
  Aktif: string;
  AlasanClose: string;
  [key: string]: unknown;
}

interface SoDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  QtySO: number;
  QtyInvoice: number;
  BlmJadiInvoice: number;
  Nomor: string;
  Harga: number;
  TotalSO: number;
}

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = '26';

// --- State ---
const list = ref<SoHeader[]>([]);
const details = ref<{ [key: string]: SoDetail[] }>({});
const isLoading = ref(true);
const selected = ref<SoHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const isMounted = ref(false);
const cabangList = ref([]);
const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
  status: null as string | null,
});

const isCloseDialogVisible = ref(false);
const itemToClose = ref<SoHeader | null>(null);
const closeReason = ref('');

const filterOptions = ref([
  { title: 'Nomor', value: 'Nomor' },
  { title: 'Penawaran', value: 'Penawaran' },
  { title: 'Nama Customer', value: 'Nama' },
  { title: 'Keterangan', value: 'Keterangan' },
  { title: 'Sales Counter', value: 'SC' },
]);
const selectedFilterField = ref('Nama');
const filterSearchValue = ref('');

// --- Computed Properties ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);

const filteredList = computed(() => {
  if (!filterSearchValue.value) {
    return list.value;
  }
  return list.value.filter(item => {
    const itemValue = item[selectedFilterField.value as keyof SoHeader];
    if (itemValue !== null && itemValue !== undefined) {
      return itemValue.toString().toLowerCase().includes(filterSearchValue.value.toLowerCase());
    }
    return false;
  });
});

// --- Header Definisi (Resize) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 120 },
  { title: 'Dateline', key: 'Dateline', width: 120 },
  { title: 'Penawaran', key: 'Penawaran', width: 180 },
  { title: 'TOP', key: 'Top', width: 80 },
  { title: 'Nominal', key: 'Nominal', width: 150 },
  { title: 'Diskon', key: 'Diskon', width: 120 },
  { title: 'DP', key: 'Dp', width: 120 },
  { title: 'Qty SO', key: 'QtySO', width: 100 },
  { title: 'Qty Inv', key: 'QtyInv', width: 100 },
  { title: 'Belum', key: 'Belum', width: 150 },
  { title: 'Status', key: 'Status', width: 150 },
  { title: 'Alasan Close', key: 'AlasanClose', width: 250 },
  { title: 'Status Kirim', key: 'StatusKirim', width: 150 },
  { title: 'Kd Customer', key: 'kdcus', width: 120 },
  { title: 'Nama Customer', key: 'Nama', width: 250 },
  { title: 'Alamat', key: 'Alamat', width: 600 },
  { title: 'Kota', key: 'Kota', width: 150 },
  { title: 'Level', key: 'Level', width: 150 },
  { title: 'Keterangan', key: 'Keterangan', width: 300 },
  { title: 'Aktif', key: 'Aktif', align: 'center', width: 80 },
  { title: 'Sales Counter', key: 'SC', width: 150 },
]);

const detailHeaders = [
  { title: 'Nomor', key: 'Nomor', width: '120px' },
  { title: 'Kode', key: 'Kode', width: '100px' },
  { title: 'Barcode', key: 'Barcode', width: '120px' },
  { title: 'Nama Barang', key: 'Nama', width: '200px' },
  { title: 'Ukuran', key: 'Ukuran', width: '70px' },
  { title: 'Qty SO', key: 'QtySO', align: 'end', width: '80px' },
  { title: 'Harga', key: 'Harga', align: 'end', width: '100px' },
  { title: 'Total SO', key: 'TotalSO', align: 'end', width: '120px' },
  { title: 'Qty Invoice', key: 'QtyInvoice', align: 'end', width: '100px' },
  { title: 'Belum Jadi Inv', key: 'BlmJadiInvoice', align: 'end', width: '120px' },
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
const handleRowClick = (_event: Event, { item }: { item: SoHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/so/lookup/cabang');
    cabangList.value = response.data;
  } catch {
    toast.error('Gagal memuat daftar cabang.');
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/so', {
      params: filters
    });
    list.value = response.data;
  } catch {
    toast.error('Gagal memuat data Surat Pesanan.');
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: SoHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/so/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    expanded.value = expanded.value.filter(nomor => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const openCloseDialog = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Status === 'CLOSE' || item.Status === 'DICLOSE') {
    toast.warning('SO ini sudah berstatus Close.');
    return;
  }
  itemToClose.value = item;
  closeReason.value = item.AlasanClose || '';
  isCloseDialogVisible.value = true;
};

const submitClose = async () => {
  if (!itemToClose.value) return;
  try {
    await api.post('/so/close', {
      nomor: itemToClose.value.Nomor,
      alasan: closeReason.value,
      user: authStore.user.kode,
    });
    toast.success('SO berhasil ditutup.');
    isCloseDialogVisible.value = false;
    const itemInList = list.value.find(item => item.Nomor === itemToClose.value.Nomor);
    if (itemInList) {
      itemInList.Status = 'DICLOSE';
      itemInList.AlasanClose = closeReason.value;
    }
    selected.value = [];
  } catch (error: unknown) {
    const e = error as { response?: { data?: { message?: string } } };
    toast.error(e.response?.data?.message || 'Gagal menutup SO.');
  }
};

const getRowTextColor = (item: SoHeader) => {
  if (item.Aktif === 'N') return 'text-grey';
  switch (item.Status) {
    case 'OPEN': return 'text-red font-weight-bold';
    case 'PROSES': return item.StatusKirim === 'SEBAGIAN' ? 'text-purple font-weight-bold' : 'text-blue font-weight-bold';
    case 'JADI': return 'text-green-darken-2 font-weight-bold';
    default: return '';
  }
};

const getStatusChip = (status: string) => {
  switch (status) {
    case 'OPEN': return { color: 'red', text: 'Open' };
    case 'PROSES': return { color: 'navy', text: 'Proses' };
    case 'JADI': return { color: 'olive', text: 'Jadi' };
    case 'CLOSE':
    case 'DICLOSE': return { color: 'grey-darken-1', text: 'Close' };
    default: return { color: 'grey', text: status };
  }
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Aktif === 'N') {
    toast.warning('No. Pesanan tersebut pasif. Tidak bisa dicetak.');
    return;
  }
  const url = router.resolve({
    name: 'Cetak Surat Pesanan',
    params: { nomor: item.Nomor }
  }).href;
  window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  const exportFilters = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    cabang: filters.cabang,
  };
  try {
    if (type === 'header') {
      if (list.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');
      toast.info('Membuat file Excel Header...');
      const worksheet = XLSX.utils.json_to_sheet(list.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SO Header");
      XLSX.writeFile(workbook, "Export_SO_Header.xlsx");
      toast.success('File Header berhasil dibuat.');
    } else if (type === 'detail') {
      toast.info('Mengambil data detail dari server...');
      const response = await api.get('/so/export-details', { params: exportFilters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor.');
      toast.info('Membuat file Excel Detail...');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SO Detail");
      XLSX.writeFile(workbook, "Export_SO_Detail.xlsx");
      toast.success('File Detail berhasil dibuat.');
    }
  } catch {
    toast.error('Gagal mengekspor data.');
  }
};

onMounted(async () => {
  if (hasViewPermission.value) {
    const queryStartDate = route.query.startDate as string;
    const queryEndDate = route.query.endDate as string;
    const queryStatus = route.query.status as string;
    if (queryStartDate && queryEndDate) {
      filters.startDate = queryStartDate;
      filters.endDate = queryEndDate;
    }
    if (queryStatus) {
      filters.status = queryStatus;
    }
    await fetchCabangList();
    await fetchData();
    isMounted.value = true;
  }
});

watch(filters, () => {
  if (isMounted.value && hasViewPermission.value) {
    fetchData();
  }
}, { deep: true });
</script>

<template>
  <PageLayout title="Surat Pesanan" desktop-mode icon="mdi-file-document-multiple-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/surat-pesanan/new')">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="router.push(`/transaksi/penjualan/surat-pesanan/ubah/${selected[0].Nomor}`)">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="printData">Cetak</v-btn>
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
      <v-divider vertical class="mx-2"></v-divider>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" color="orange-darken-2"
        @click="openCloseDialog">Close SO</v-btn>
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

        <v-divider vertical class="mx-2"></v-divider>
        <div class="d-flex align-center ga-2">
          <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan" density="compact"
            hide-details variant="outlined" style="max-width: 180px;" />
          <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details variant="outlined"
            style="min-width: 250px;" clearable prepend-inner-icon="mdi-magnify" />
        </div>
        <v-chip v-if="filters.status" class="ms-4" color="primary" variant="tonal" closable
          @click:close="filters.status = null">
          Status: {{ filters.status === 'open' ? 'Open' : filters.status }}
        </v-chip>

        <v-spacer />
        <div class="legend-group">
          <div class="legend-item"><v-icon color="red" size="small">mdi-circle-medium</v-icon>Open</div>
          <div class="legend-item"><v-icon color="blue" size="small">mdi-circle-medium</v-icon>Proses</div>
          <div class="legend-item"><v-icon color="purple" size="small">mdi-circle-medium</v-icon>Kirim Sebagian</div>
          <div class="legend-item"><v-icon color="green-darken-2" size="small">mdi-circle-medium</v-icon>Jadi</div>
          <div class="legend-item"><v-icon color="grey" size="small">mdi-circle-medium</v-icon>Pasif</div>
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="filteredList"
          :loading="isLoading" :item-class="getRowTextColor" item-value="Nomor" density="compact"
          class="desktop-table header-browse-blue" fixed-header show-select return-object show-expand
          @update:expanded="loadDetails" @click:row="handleRowClick">
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
              <template v-if="['Tanggal', 'Dateline'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(item[header.key] as string), 'dd/MM/yyyy') : '-' }}
              </template>
              <template v-else-if="['Nominal', 'Diskon', 'Dp', 'QtySO', 'QtyInv', 'Belum'].includes(header.key)">
                {{ formatRupiah(Number(item[header.key] || 0)) }}
              </template>
              <template v-else-if="header.key === 'Status'">
                <v-chip size="x-small" :color="getStatusChip(item.Status).color" variant="tonal">
                  {{ getStatusChip(item.Status).text }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'StatusKirim'">
                <v-chip size="x-small" :color="item.StatusKirim === 'BELUM' ? 'orange' : 'indigo'">
                  {{ item.StatusKirim }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'Aktif'">
                <v-chip size="x-small" :color="item.Aktif === 'Y' ? 'success' : 'grey'">
                  {{ item.Aktif === 'Y' ? 'Aktif' : 'Pasif' }}
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">Memuat detail...</div>
                    <v-data-table v-else-if="details[item.Nomor]" :headers="detailHeaders" :items="details[item.Nomor]"
                      item-value="Kode" density="compact" class="detail-table" :items-per-page="-1" hide-default-footer>
                      <template #[`item.Nomor`]="{ item: detailItem }">{{ detailItem.Nomor }}</template>
                      <template #[`item.Harga`]="{ item: detailItem }">{{ formatRupiah(Number(detailItem.Harga || 0))
                        }}</template>
                      <template #[`item.TotalSO`]="{ item: detailItem }">{{ formatRupiah(Number(detailItem.TotalSO ||
                        0)) }}</template>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-2">Tidak ada data detail untuk nomor ini.</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">Isi Alasan Close SO</v-card-title>
        <v-card-text class="pa-4">
          <p class="text-caption mb-2">Anda akan menutup SO Nomor: <strong>{{ itemToClose?.Nomor }}</strong></p>
          <v-textarea v-model="closeReason" label="Alasan" rows="3" variant="outlined" autofocus></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="primary" @click="submitClose">Simpan</v-btn>
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

/* Table Style */
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

/* Detail Sticky */
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
  max-width: 800px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background-color: white;
}

/* Pewarnaan Teks Baris (TD) */
:deep(td.text-red) {
  color: red !important;
}

:deep(td.text-blue) {
  color: blue !important;
}

:deep(td.text-purple) {
  color: purple !important;
}

:deep(td.text-green-darken-2) {
  color: #388E3C !important;
}

/* Green Darken 2 */
:deep(td.text-grey) {
  color: grey !important;
}

.state-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.legend-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>

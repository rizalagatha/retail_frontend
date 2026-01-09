<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import PrintOptionModal from '@/components/modal/PrintOptionModal.vue';
import ReturJualKasirPrintPreviewModal from '@/components/modal/ReturJualKasirPrintPreviewModal.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from "axios";
import { formatRupiah } from "@/utils/formatRupiah";
import AppDataTable from '@/components/AppDataTable.vue';

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

interface MasterItem {
  nomor: string;
  tanggal: string;
  nominal: number;
  diBayarkan: number;
  sisa: number;
  invoice: string;
  jenis: string;
  keterangan: string;
  nama: string;
  closing: 'Y' | 'N';
}
interface DetailItem {
  kode: string;
  nama: string;
  rjd_ukuran: string;
  jumlah: number;
  harga: number;
  discPersen: number;
  diskon: number;
  total: number;
}
interface PaymentLinkItem {
  invoice: string;
  tanggal: string;
  nominal: number;
}
interface ReturExportRow {
  Tanggal?: string | Date;
  [key: string]: unknown;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '29';

// --- State ---
const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const paymentLinks = ref<Record<string, PaymentLinkItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const isPrintOptionVisible = ref(false);
const isKasirPreviewVisible = ref(false);
const selectedRetur = ref<string | null>(null);

const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
});

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canEdit = computed(() => {
  // 1. Harus ada 1 baris terpilih
  if (!isSingleSelected.value || !selectedRow.value) return false;

  // 2. Ambil nilai 'diBayarkan' (convert ke number untuk safety)
  // Jika > 0, artinya retur ini sudah dilink ke Piutang/Invoice lain -> KUNCI
  const totalTerpakai = Number(selectedRow.value.diBayarkan) || 0;

  // 3. Cek status closing
  const isNotClosing = selectedRow.value.closing !== 'Y';

  // LOGIC: Bisa edit HANYA JIKA belum terpakai sama sekali (0) DAN belum closing
  return totalTerpakai === 0 && isNotClosing;
});

// const canDelete = computed(() => {
//   if (!isSingleSelected.value || !selectedRow.value) return false;

//   const totalTerpakai = Number(selectedRow.value.diBayarkan) || 0;
//   const isNotClosing = selectedRow.value.closing !== 'Y';

//   return totalTerpakai === 0 && isNotClosing;
// });

// --- Header Definisi (Resize) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'tanggal', width: 120 },
  { title: 'Nominal', key: 'nominal', align: 'end', width: 120 },
  { title: 'Dibayarkan', key: 'diBayarkan', align: 'end', width: 120 },
  { title: 'Sisa', key: 'sisa', align: 'end', width: 120 },
  { title: 'No. Invoice', key: 'invoice', width: 180 },
  { title: 'Jenis', key: 'jenis', width: 100 },
  { title: 'Customer', key: 'nama', width: 250 },
  { title: 'Keterangan', key: 'keterangan', width: 250 },
  { title: 'Closing', key: 'closing', align: 'center', width: 80 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'kode' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'rjd_ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
  { title: 'Harga', key: 'harga', align: 'end' },
  { title: 'Disc %', key: 'discPersen', align: 'end' },
  { title: 'Diskon Rp', key: 'diskon', align: 'end' },
  { title: 'Total', key: 'total', align: 'end' },
] as const;

const paymentLinkHeaders = [
  { title: 'Invoice', key: 'invoice' },
  { title: 'Tanggal Bayar', key: 'tanggal' },
  { title: 'Nominal', key: 'nominal', align: 'end' },
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
const handleRowClick = (_event: Event, { item }: { item: MasterItem }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/retur-jual/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.', error);
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/retur-jual', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find((item) => !details.value[item.nomor]);
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const [detailsRes, paymentsRes] = await Promise.all([
      api.get(`/retur-jual/details/${nomorToLoad}`),
      api.get(`/retur-jual/payment-links/${nomorToLoad}`),
    ]);
    details.value[nomorToLoad] = detailsRes.data;
    paymentLinks.value[nomorToLoad] = paymentsRes.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

// const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
//   dialogConfirm.title = title;
//   dialogConfirm.text = text;
//   dialogConfirm.onConfirm = onConfirm;
//   dialogConfirm.show = true;
// };

const handleNew = () => router.push({ name: 'ReturJualCreate' });
const handleEdit = () => {
  if (!canEdit.value || !selectedRow.value) return;
  router.push({ name: 'ReturJualEdit', params: { nomor: selectedRow.value.nomor } });
};

// const handleDelete = () => {
//   if (!canDelete.value || !selectedRow.value) return;
//   showConfirmation(
//     'Konfirmasi Hapus',
//     `Yakin ingin menghapus Retur Jual ${selectedRow.value.nomor}?`,
//     async () => {
//       try {
//         if (!selectedRow.value) return;
//         const response = await api.delete(`/retur-jual/${selectedRow.value.nomor}`);
//         toast.success(response.data.message);
//         fetchMasterData();
//       } catch (error) {
//         const err = error as AxiosError<{ message?: string }>;
//         toast.error(err.response?.data?.message || "Gagal menghapus data.");
//       }
//     }
//   );
// };

const handlePrint = () => {
  if (!isSingleSelected.value) return;
  selectedRetur.value = selectedRow.value.nomor;
  isPrintOptionVisible.value = true;
};

const handlePrintSelection = (type: 'a4' | 'kasir') => {
  if (!selectedRow.value) return;
  isPrintOptionVisible.value = false;

  if (type === 'kasir') {
    isKasirPreviewVisible.value = true;  // buka modal kasir
    return;
  }

  // cetak a4
  const url = router.resolve({
    name: 'ReturJualPrint',
    params: { nomor: selectedRow.value.nomor }
  }).href;

  window.open(url, '_blank');
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

// Fungsi Export Data
const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) {
      toast.warning('Tidak ada data header untuk diekspor.');
      return;
    }

    // Format Tanggal Header (gunakan interface MasterItem jika sudah ada)
    const formattedHeader = masterData.value.map((item: MasterItem) => ({
      ...item,
      // Field 'tanggal' di interface MasterItem (lowercase)
      tanggal: item.tanggal ? formatDateIndo(item.tanggal) : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedHeader);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Retur Jual Header");
    XLSX.writeFile(workbook, "Export_ReturJual_Header.xlsx");
    toast.success('Header berhasil diekspor.');

  } else if (type === 'detail') {
    try {
      toast.info('Mengambil data detail...');
      // Request ke Backend (Kirim filters!)
      const response = await api.get<ReturExportRow[]>('/retur-jual/export-details', { params: filters });

      if (response.data.length === 0) {
        toast.warning('Tidak ada data detail.');
        return;
      }

      // Format Tanggal Detail
      const formattedDetail = response.data.map((row: ReturExportRow) => ({
        ...row,
        // Backend mengirim alias 'Tanggal' (Capital T) sesuai query AS
        Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal) : ''
      }));

      // Opsional: Custom Excel Layout
      const title = "LAPORAN DETAIL RETUR JUAL";
      const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(filters.endDate)}`;
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
      XLSX.utils.book_append_sheet(workbook, worksheet, "Retur Jual Detail");
      XLSX.writeFile(workbook, "Export_ReturJual_Detail.xlsx");
      toast.success('Detail berhasil diekspor.');

    } catch (error) {
      let message = 'Gagal mengekspor data detail.';
      if (error instanceof Error) message = error.message;
      // Cek Axios Error jika perlu
      toast.error(message);
    }
  }
};

onMounted(async () => {
  await fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Retur Jual" icon="mdi-keyboard-return">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" @click="handleEdit"
        :disabled="!canEdit">Ubah</v-btn>
      <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        @click="handleDelete" :disabled="!canDelete">Hapus</v-btn> -->
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="handlePrint">
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

    <div class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Periode:</span>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <span class="mx-2">s/d</span>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table header-browse-blue" fixed-header
          show-select show-expand return-object @update:expanded="loadDetails" @click:row="handleRowClick">
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
              <template v-if="header.key === 'tanggal'">
                {{ format(parseISO(item.tanggal as string), 'dd/MM/yyyy') }}
              </template>
              <template v-else-if="['nominal', 'diBayarkan', 'sisa'].includes(header.key)">
                {{ formatRupiah(Number(item[header.key])) }}
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
                  <div class="detail-wrapper w-100">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">Memuat detail...</div>
                    <div v-else>
                      <div class="text-subtitle-2 font-weight-bold mb-2">Detail Barang Retur</div>
                      <div class="detail-table-wrapper mb-4">
                        <v-data-table :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                          class="detail-table" :items-per-page="-1" hide-default-footer>
                          <template #bottom></template>
                        </v-data-table>
                      </div>

                      <div v-if="paymentLinks[item.nomor] && paymentLinks[item.nomor].length > 0">
                        <div class="text-subtitle-2 font-weight-bold mb-2">Link Pembayaran</div>
                        <div class="detail-table-wrapper">
                          <v-data-table :headers="paymentLinkHeaders" :items="paymentLinks[item.nomor]"
                            density="compact" class="detail-table" :items-per-page="-1" hide-default-footer>
                            <template #[`item.tanggal`]="{ item: linkItem }">
                              {{ format(parseISO(linkItem.tanggal), 'dd/MM/yyyy') }}
                            </template>
                            <template #[`item.nominal`]="{ item: linkItem }">
                              {{ formatRupiah(Number(linkItem.nominal)) }}
                            </template>
                            <template #bottom></template>
                          </v-data-table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir']" @close="isPrintOptionVisible = false"
      @select="handlePrintSelection" />
    <ReturJualKasirPrintPreviewModal v-model="isKasirPreviewVisible" :nomorRetur="selectedRetur"
      @close="isKasirPreviewVisible = false" />

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

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}
</style>

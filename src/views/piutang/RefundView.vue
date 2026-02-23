<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO, isValid } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import axios, { AxiosError } from 'axios';
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

interface RefundHeader {
  Nomor: string;
  Tanggal: string;
  User: string;
  // Tambahkan 'BATAL' di sini agar perbandingan menjadi valid
  Status: 'PROSES' | 'APPROVE' | 'BATAL' | '';
  Approved: string | null;
  TglApvove: string | null;
  Closing: string | null;
  AlasanBatal: string | null;
}

interface RefundDetail {
  no: number;
  NoTransaksi: string;
  Customer: string;
  Nominal: number;
  Approval: number;
  BankTujuan: string;
  NoRekening: string;
  AtasNama: string;
  Keterangan: string;
}

interface ExpandedItem {
  Nomor: string;
}

interface RefundExportHeader {
  Nomor: string;
  Tanggal?: string | Date;
  User: string;
  Status: string;
  ApprovedBy?: string;
  TglApprove?: string | Date;
  Closing?: string;
  [key: string]: unknown;
}

interface RefundExportDetail {
  'Nomor Refund': string;
  'Tanggal Refund'?: string | Date;
  'No Transaksi': string;
  [key: string]: unknown;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '55';

const masterData = ref<RefundHeader[]>([]);
const details = ref<Record<string, RefundDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<RefundHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const isCancelDialogOpen = ref(false);
const cancelReason = ref('');
const isCancelling = ref(false);
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
  onCancel: () => { dialogConfirm.show = false; }
});

const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: '',
});

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<RefundHeader | null>(() => isSingleSelected.value ? selected.value[0] : null);
const isApprover = computed(() => authStore.user?.cabang === 'KDC');

const canNew = computed(() => !isApprover.value);
const canEdit = computed(() => {
  if (!isSingleSelected.value || !selectedRow.value) return false;

  // 1. Block jika status sudah 'BATAL'
  if (selectedRow.value.Status === 'BATAL') return false;

  // 2. Logika hak akses cabang/pusat
  if (!isApprover.value) {
    // Cabang hanya bisa edit jika belum diapprove dan belum closing
    return !selectedRow.value.Approved && selectedRow.value.Closing !== 'Y';
  }

  // Approver (KDC) bisa edit selama bukan 'BATAL'
  return true;
});
const canDelete = computed(() => {
  if (!isSingleSelected.value || isApprover.value) return false;
  return !selectedRow.value?.Approved && selectedRow.value?.Closing !== 'Y';
});
const canCetak = computed(() => {
  // Tombol cetak aktif jika ada data dipilih DAN status bukan 'BATAL'
  return isSingleSelected.value && selectedRow.value?.Status !== 'BATAL';
});
const canCancel = computed(() => {
  // 1. Wajib pilih baris dulu
  if (!selectedRow.value) return false;

  // 2. Hanya Approver (KDC) yang memiliki hak akses tombol ini
  if (!isApprover.value) return false;

  const status = selectedRow.value.Status || '';

  // 3. Definisikan kondisi pemblokiran
  const isAlreadyCancelled = status === 'BATAL'; // Sudah batal
  const isInitialState = status.trim() === '';   // Masih merah (tahap 1)

  // 4. Tombol hanya aktif jika:
  // - Belum Closing ('N')
  // - BUKAN status BATAL
  // - BUKAN status Kosong (Merah)
  return selectedRow.value.Closing !== 'Y' && !isAlreadyCancelled && !isInitialState;
});

// --- Formatter ---
const formatTanggal = (dateString: string | undefined | null) => {
  if (!dateString) return '';
  const date = parseISO(dateString);
  return isValid(date) ? format(date, 'dd/MM/yyyy') : dateString;
};

// --- Header Definisi (Resize) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 120 },
  { title: 'User', key: 'User', width: 100 },
  { title: 'Status', key: 'Status', width: 100 },
  { title: 'Approved', key: 'Approved', width: 100 },
  { title: 'Tgl Approve', key: 'TglApprove', width: 120 },
  { title: 'Closing', key: 'Closing', width: 120 },
  { title: 'Alasan Batal/Reset', key: 'AlasanBatal', width: 250 },
]);

const detailHeaders = computed<DataTableHeader[]>(() => {
  const h: DataTableHeader[] = [
    { title: 'No.', key: 'no', width: 50 },
    { title: 'Nomor Transaksi', key: 'NoTransaksi', width: 150 },
    { title: 'Pelanggan', key: 'Customer', width: 200 },
    { title: 'Nominal Saldo', key: 'Nominal', align: 'end', width: 120 },
    { title: 'Nominal Refund', key: 'Approval', align: 'end', width: 120 },
  ];
  if (isApprover.value) {
    h.push({ title: 'Bank', key: 'BankTujuan', width: 120 });
    h.push({ title: 'No. Rekening', key: 'NoRekening', width: 150 });
    h.push({ title: 'Atas Nama', key: 'AtasNama', width: 150 });
  }
  h.push({ title: 'Keterangan', key: 'Keterangan', width: 200 });
  return h;
});

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
const handleRowClick = (_event: Event, { item }: { item: RefundHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  details.value = {};
  try {
    const response = await api.get<RefundHeader[]>('/refund', { params: filters });
    masterData.value = response.data;
  } catch (err) {
    let message = 'Gagal mengambil data.';
    if (axios.isAxiosError(err)) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      message = axiosErr.response?.data?.message || message;
    } else if (err instanceof Error) {
      message = err.message;
    }
    toast.error(message);
  } finally {
    loading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/refund/cabang-options');
    cabangList.value = response.data;
    if (authStore.user?.cabang !== 'KDC') {
      filters.cabang = authStore.user?.cabang || '';
    }
  } catch (error) {
    toast.error('Gagal memuat filter cabang.', error);
  }
};

const loadDetails = async (newlyExpandedItems: ExpandedItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);
  try {
    const response = await api.get<RefundDetail[]>(`/refund/details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data.map((d, index) => ({ ...d, no: index + 1 }));
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || `Gagal memuat detail untuk ${itemToLoad.Nomor}.`);
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

const getRowTextColor = (item: RefundHeader) => {
  // 1. Jika Batal -> Abu-abu saja
  if (item.Status === 'BATAL') return 'text-grey';

  // 2. Jika Kosong -> Merah (Tahap 1: Belum diproses)
  if (!item.Status || item.Status.trim() === '') return 'text-red font-weight-bold';

  // 3. Jika Proses -> Biru (Tahap 2: Sudah verifikasi nominal/bank)
  if (item.Status === 'PROSES') return 'text-blue font-weight-bold';

  // 4. Hitam/Default untuk APPROVE (Tahap 3: Cair)
  return '';
};

const handleNew = () => router.push({ name: 'refundCreate' });

const handleEdit = () => {
  if (!selectedRow.value) return;
  router.push({ name: 'RefundEdit', params: { nomor: selectedRow.value.Nomor } });
};

const handleCetak = () => {
  if (!canCetak.value || !selectedRow.value) return;
  const routeData = router.resolve({
    name: 'RefundPrint',
    params: { nomor: selectedRow.value.Nomor }
  });
  window.open(routeData.href, '_blank');
};

const openDeleteDialog = () => {
  if (!canDelete.value || !selectedRow.value) return;
  showConfirmation(
    handleDelete,
    `Yakin ingin hapus refund ${selectedRow.value.Nomor}?`
  );
};

const handleDelete = async () => {
  if (!selectedRow.value) return;
  try {
    const response = await api.delete(`/refund/${selectedRow.value.Nomor}`);
    toast.success(response.data.message);
    fetchMasterData();
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus data.');
  }
};

const handleCancelRefund = async () => {
  if (!cancelReason.value || cancelReason.value.length < 5) {
    return toast.error('Alasan pembatalan minimal 5 karakter.');
  }

  isCancelling.value = true;
  try {
    const response = await api.put(`/refund/cancel/${selectedRow.value?.Nomor}`, {
      reason: cancelReason.value
    });

    toast.success(response.data.message);
    isCancelDialogOpen.value = false;
    cancelReason.value = '';
    fetchMasterData();
  } catch (err: unknown) { // Ganti 'any' dengan 'unknown'
    // Lakukan casting agar bisa mengakses response data secara aman
    const error = err as AxiosError<{ message?: string }>;
    const msg = error.response?.data?.message || 'Gagal membatalkan refund.';
    toast.error(msg);
  } finally {
    isCancelling.value = false;
  }
};

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

// Helper Auto Width
const getAutoColumnWidth = (data: Record<string, unknown>[]) => {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map((key) => ({
    wch: Math.max(key.length + 5, 15)
  }));
};

// --- 2. Fungsi Export Data ---
const exportData = async (type: 'header' | 'detail') => {
  const fileName = type === 'header' ? 'Export_Refund_Header.xlsx' : 'Export_Refund_Detail.xlsx';

  // === EXPORT HEADER ===
  if (type === 'header') {
    try {
      loading.value = true;
      toast.info('Mengambil data header dari server...');

      const response = await api.get<RefundExportHeader[]>('/refund/export-headers', {
        params: filters
      });

      if (response.data.length === 0) {
        toast.warning('Tidak ada data header.');
        return;
      }

      toast.info('Membuat file Excel Header...');

      // Mapping Format Data
      const formattedHeader = response.data.map((item) => ({
        ...item,
        Tanggal: item.Tanggal ? formatDateIndo(item.Tanggal) : '',
        TglApprove: item.TglApprove ? formatDateIndo(item.TglApprove) : '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);

      // Auto Width
      worksheet['!cols'] = getAutoColumnWidth(formattedHeader);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Header");
      XLSX.writeFile(workbook, fileName);

      toast.success('Header berhasil diekspor.');
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      toast.error(err.response?.data?.message || 'Gagal mengekspor data.');
    } finally {
      loading.value = false;
    }

    // === EXPORT DETAIL ===
  } else {
    try {
      loading.value = true;
      toast.info('Mengambil data detail dari server...');

      const response = await api.get<RefundExportDetail[]>('/refund/export-details', {
        params: filters
      });

      if (response.data.length === 0) {
        toast.warning('Tidak ada data detail.');
        return;
      }

      toast.info('Membuat file Excel Detail...');

      // Format Tanggal
      const formattedDetail = response.data.map((row) => ({
        ...row,
        'Tanggal Refund': row['Tanggal Refund'] ? formatDateIndo(row['Tanggal Refund']) : '',
      }));

      // Layout Excel
      const title = "LAPORAN DETAIL REFUND SALDO";
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
      worksheet['!cols'] = tableHeaders.map(header => ({ wch: Math.max(header.length + 5, 15) }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail");
      XLSX.writeFile(workbook, fileName);

      toast.success('Detail berhasil diekspor.');
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      toast.error(err.response?.data?.message || 'Gagal mengekspor data.');
    } finally {
      loading.value = false;
    }
  }
};

const showConfirmation = (action: () => void, text: string) => {
  dialogConfirm.onConfirm = () => {
    action();
    dialogConfirm.show = false;
  };
  dialogConfirm.text = text;
  dialogConfirm.title = 'Konfirmasi';
  dialogConfirm.show = true;
};

onMounted(() => {
  if (!authStore.can(MENU_ID, 'view')) {
    toast.error('Anda tidak memiliki hak akses untuk membuka halaman ini.');
    return router.push('/');
  }
  fetchCabangOptions();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Pengajuan Refund" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert') && canNew" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!canEdit"
        @click="handleEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" color="warning" prepend-icon="mdi-cancel"
        :disabled="!canCancel" @click="isCancelDialogOpen = true">
        Batalkan Refund
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete') && canDelete" size="small" color="error" prepend-icon="mdi-delete"
        :disabled="!canDelete" @click="openDeleteDialog">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" prepend-icon="mdi-printer"
        :disabled="!canCetak" @click="handleCetak">Cetak</v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="teal" prepend-icon="mdi-file-excel"
            v-bind="props">Export</v-btn>
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
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;"
          :readonly="!isApprover" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption font-weight-bold">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon>
          <span class="text-red">Belum diproses</span>

          <v-icon color="blue" icon="mdi-square-rounded" size="small" class="ms-2"></v-icon>
          <span class="text-blue">Sedang diproses</span>

          <v-icon color="grey" icon="mdi-square-rounded" size="small" class="ms-2"></v-icon>
          <span class="text-grey">Dibatalkan</span>
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table header-browse-blue" fixed-header
          show-select return-object show-expand single-select @update:expanded="loadDetails"
          @click:row="handleRowClick">
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

              <template v-if="header.key === 'Tanggal' || header.key === 'TglApprove'">
                {{ formatTanggal(item[header.key] as string) }}
              </template>

              <template v-else-if="header.key === 'Status'">
                <v-chip :color="item.Status === 'BATAL' ? 'grey' : item.Status === 'APPROVE' ? 'success' : 'blue'"
                  size="x-small" variant="flat" class="font-weight-bold">
                  <v-icon v-if="item.Status === 'BATAL'" start icon="mdi-cancel" size="12"></v-icon>
                  {{ item.Status || 'PROSES' }}
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">Memuat detail...</div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor] || []" density="compact"
                      class="detail-table" :items-per-page="-1" hide-default-footer>
                      <template v-slot:[`item.Nominal`]="{ item: detailItem }">
                        <span class="d-block text-right">{{ formatRupiah(detailItem.Nominal) }}</span>
                      </template>
                      <template v-slot:[`item.Approval`]="{ item: detailItem }">
                        <span class="d-block text-right">{{ formatRupiah(detailItem.Approval) }}</span>
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

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="dialogConfirm.onCancel">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm">Ya, Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isCancelDialogOpen" max-width="500px" persistent>
      <v-card>
        <v-toolbar color="warning" density="compact">
          <v-toolbar-title class="text-subtitle-1">Alasan Pembatalan Refund</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" @click="isCancelDialogOpen = false" />
        </v-toolbar>

        <v-card-text class="pa-4">
          <div class="mb-3">Membatalkan pengajuan: <strong>{{ selectedRow?.Nomor }}</strong></div>
          <v-textarea v-model="cancelReason" label="Tulis alasan pembatalan di sini..." variant="outlined" rows="3"
            hide-details auto-focus></v-textarea>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="isCancelDialogOpen = false">Tutup</v-btn>
          <v-btn color="error" variant="flat" @click="handleCancelRefund" :loading="isCancelling"
            prepend-icon="mdi-check-circle">
            Konfirmasi Batal
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

:deep(td.text-blue) {
  color: rgb(var(--v-theme-primary)) !important;
}

:deep(.v-dialog) .v-card {
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
</style>

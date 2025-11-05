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

interface RefundHeader {
  Nomor: string;
  Tanggal: string;
  User: string;
  Status: 'PROSES' | 'APPROVE' | '';
  Approved: string | null;
  TglApvove: string | null;
  Closing: string | null;
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

interface TableColumn {
  title: string;
  key: keyof RefundDetail; // gunakan keyof RefundDetail agar ketat
  minWidth?: string;
  align?: 'start' | 'center' | 'end';
}

interface ExpandedItem {
  Nomor: string;
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
const expanded = ref<string[]>([]); // Ganti tipe menjadi string[]
const cabangList = ref([]);
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
  cabang: '', // tambahkan ini
});

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<RefundHeader | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);
const isApprover = computed(() => authStore.user?.cabang === 'KDC');

const canNew = computed(() => !isApprover.value);
const canEdit = computed(() => {
  if (!isSingleSelected.value) return false;
  if (!isApprover.value) { // Jika Pengaju
    return !selectedRow.value?.Approved && selectedRow.value?.Closing !== 'Y';
  }
  return true; // Approver selalu bisa ubah (untuk approve)
});
const canDelete = computed(() => {
  if (!isSingleSelected.value || isApprover.value) return false;
  return !selectedRow.value?.Approved && selectedRow.value?.Closing !== 'Y';
});
const canCetak = computed(() => isSingleSelected.value);

// --- Formatter & Konfigurasi Tabel ---
const formatRupiah = (value: number | undefined): string => {
  if (value === undefined || value === null) return '0';
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value);
};
const formatTanggal = (dateString: string | undefined | null) => {
  if (!dateString) return '';
  const date = parseISO(dateString);
  return isValid(date) ? format(date, 'dd/MM/yyyy') : dateString;
};

// Pastikan header ekspansi ditempatkan di posisi yang diinginkan
const headers = [
  { title: 'Nomor', key: 'Nomor', minWidth: '180px', fixed: true },
  { title: 'Tanggal', key: 'Tanggal', minWidth: '120px' },
  { title: 'User', key: 'User', minWidth: '100px' },
  { title: 'Status', key: 'Status', minWidth: '100px' },
  { title: 'Approved', key: 'Approved', minWidth: '100px' },
  { title: 'Tgl Approve', key: 'TglApprove', minWidth: '120px' },
  { title: 'Closing', key: 'Closing', minWidth: '120px' },
] as const;

const detailHeaders = computed<TableColumn[]>(() => {
  const h: TableColumn[] = [
    { title: 'No.', key: 'no' },
    { title: 'Nomor Transaksi', key: 'NoTransaksi', minWidth: '150px' },
    { title: 'Pelanggan', key: 'Customer', minWidth: '200px' },
    { title: 'Nominal Saldo', key: 'Nominal', align: 'end' },
    { title: 'Nominal Refund', key: 'Approval', align: 'end' },
  ];
  if (isApprover.value) {
    h.push({ title: 'Bank', key: 'BankTujuan', minWidth: '120px' });
    h.push({ title: 'No. Rekening', key: 'NoRekening', minWidth: '150px' });
    h.push({ title: 'Atas Nama', key: 'AtasNama', minWidth: '150px' });
  }
  h.push({ title: 'Keterangan', key: 'Keterangan', minWidth: '200px' });
  return h;
});

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
    // Tangani error Axios
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || `Gagal memuat detail untuk ${itemToLoad.Nomor}.`);
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

const getRowTextColor = (item: RefundHeader) => {
  // Logika Delphi TfrmBrowRefund.cxGrdMasterCustomDrawCell
  if (item.Status === 'PROSES') return 'text-blue';
  if (!item.Status) return 'text-red';
  return '';
};

const handleNew = () => {
  // Navigasi ke halaman buat baru
  router.push({ name: 'refundCreate' });
};

const handleEdit = () => {
  if (!selectedRow.value) return;
  router.push({ name: 'RefundEdit', params: { nomor: selectedRow.value.Nomor } });
};

const handleCetak = () => {
  if (!canCetak.value) return;
  const routeData = router.resolve({
    name: 'RefundPrint',
    params: { nomor: selectedRow.value!.Nomor }
  });
  window.open(routeData.href, '_blank');
};

const openDeleteDialog = () => {
  if (!canDelete.value) return;
  showConfirmation(
    handleDelete,
    `Yakin ingin hapus refund ${selectedRow.value!.Nomor}?`
  );
};

const handleDelete = async () => {
  try {
    const response = await api.delete(`/refund/${selectedRow.value!.Nomor}`);
    toast.success(response.data.message);
    fetchMasterData();
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus data.');
  }
};

const exportData = async (type: 'header' | 'detail') => {
  const fileName = type === 'header' ? 'Export_Refund_Header.xlsx' : 'Export_Refund_Detail.xlsx';
  try {
    if (type === 'header') {
      if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
      const worksheet = XLSX.utils.json_to_sheet(masterData.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Header");
      XLSX.writeFile(workbook, fileName);
    } else {
      loading.value = true;
      const response = await api.get('/refund/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail");
      XLSX.writeFile(workbook, fileName);
    }
    toast.success(`Data berhasil diekspor.`);
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengekspor data.');
  } finally {
    loading.value = false;
  }
};

const showConfirmation = (action: () => void, text: string) => {
  dialogConfirm.onConfirm = () => {
    action();
    dialogConfirm.show = false;
  };
  dialogConfirm.text = text;
  dialogConfirm.title = 'Konfirmasi'; // Judul default
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
          <v-list-item @click="exportData('header')"><v-list-item-title>Export Header</v-list-item-title></v-list-item>
          <v-list-item @click="exportData('detail')"><v-list-item-title>Export Detail</v-list-item-title></v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;"
          :readonly="!isApprover" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum diproses
          <v-icon color="blue" icon="mdi-square-rounded" size="small" class="ms-2"></v-icon> Sedang diproses
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table" fixed-header show-select
          return-object show-expand single-select @update:expanded="loadDetails">
          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'Tanggal' || header.key === 'TglApprove'">
                {{ formatTanggal(item[header.key]) }}
              </template>
              <template v-else-if="header.key === 'Status'">
                <v-chip :color="item.Status === 'APPROVE' ? 'success' : 'blue'" size="x-small">
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
              <td :colspan="columns.length">
                <div class="detail-container pa-4">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center">Memuat detail...</div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor] || []" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template v-slot:[`item.Nominal`]="{ item }">
                        <span class="d-block text-right">{{ formatRupiah(item.Nominal) }}</span>
                      </template>
                      <template v-slot:[`item.Approval`]="{ item }">
                        <span class="d-block text-right">{{ formatRupiah(item.Approval) }}</span>
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
        <v-card-title class="text-h6 font-weight-bold">
          {{ dialogConfirm.title }} </v-card-title>
        <v-card-text>
          {{ dialogConfirm.text }}
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="dialogConfirm.onCancel">
            Tidak
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.filter-section {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-container {
  height: calc(100vh - 180px);
  overflow-y: auto;
}

.detail-table-wrapper {
  max-height: 400px;
  overflow-y: auto;
}
</style>

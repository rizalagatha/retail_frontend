<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO, isValid } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Tipe Data & State ---
interface QCMaster {
  Nomor: string;
  Tanggal: string;
  NamaGudang: string;
  Keterangan: string;
  Kirim: number;
  Terima: number;
  Closing: 'Y' | 'N';
}
interface QCDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Jumlah: number;
  SudahTerima: number;
}
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '215'; // Asumsi

const masterData = ref<QCMaster[]>([]);
const details = ref<Record<string, QCDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<QCMaster[]>([]);
const expanded = ref<string[]>([]);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<QCMaster | null>(() => isSingleSelected.value ? selected.value[0] : null);
const canEditOrDelete = computed(() => {
  if (!isSingleSelected.value) return false;
  return selectedRow.value?.Closing !== 'Y';
});
const canCetak = computed(() => isSingleSelected.value);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'Nomor', minWidth: '160px', fixed: true },
  { title: 'Tanggal', key: 'Tanggal', minWidth: '120px' },
  { title: 'Gudang Tujuan', key: 'NamaGudang', minWidth: '150px' },
  { title: 'Keterangan', key: 'Keterangan', minWidth: '250px' },
  { title: 'Kirim', key: 'Kirim' },
  { title: 'Terima', key: 'Terima' },
  { title: 'Status', key: 'Closing', align: 'center', minWidth: '100px' },
] as const;
const detailHeaders = [
  { title: 'No.', key: 'no', width: '60px', sortable: false },
  { title: 'Kode Barang', key: 'Kode', minWidth: '150px' },
  { title: 'Nama Barang', key: 'Nama', minWidth: '300px' },
  { title: 'Ukuran', key: 'Ukuran' },
  { title: 'Jumlah', key: 'Jumlah' },
  { title: 'Sudah Terima', key: 'SudahTerima' },
];

// --- Methods ---
const formatTanggal = (dateString: string | undefined | null) => {
  if (!dateString) return '';
  const date = parseISO(dateString);
  return isValid(date) ? format(date, 'dd/MM/yyyy') : dateString;
};

const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  details.value = {};
  try {
    const response = await api.get('/qc-ke-garmen', { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal mengambil data master QC.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: QCMaster[]) => {
  if (!newlyExpandedItems) return;
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;
  const nomor = itemToLoad.Nomor;
  loadingDetails.value.add(nomor);
  try {
    const response = await api.get(`/qc-ke-garmen/details/${nomor}`);
    details.value[nomor] = response.data.map((d: QCDetail, index: number) => ({ ...d, no: index + 1 }));
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomor}.`, error);
  } finally {
    loadingDetails.value.delete(nomor);
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

// --- Tombol Aksi (CRUD) ---
const handleNew = () => router.push({ name: 'QCkeGarmenCreate' });
const handleEdit = () => {
  if (!canEditOrDelete.value) return;
  router.push({ name: 'QCkeGarmenEdit', params: { nomor: selectedRow.value!.Nomor } });
};
const openDeleteDialog = () => {
  if (!canEditOrDelete.value) return;
  showConfirmation(
    'Konfirmasi Hapus',
    `Yakin ingin hapus data QC ${selectedRow.value!.Nomor}?`,
    handleDelete
  );
};
const handleDelete = async () => {
  try {
    const response = await api.delete(`/qc-ke-garmen/${selectedRow.value!.Nomor}`, {
      data: { tanggal: selectedRow.value!.Tanggal } // Kirim tanggal untuk validasi
    });
    toast.success(response.data.message);
    fetchData();
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal menghapus data.');
  }
};

const handleCetak = () => {
  if (!canCetak.value) return;
  const routeData = router.resolve({
    name: 'QcGarmenPrint',
    params: { nomor: selectedRow.value!.Nomor }
  });
  window.open(routeData.href, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header");
    XLSX.writeFile(workbook, "Export_QC_Header.xlsx");
  } else if (type === 'detail') {
    loading.value = true;
    try {
      const response = await api.get('/qc-ke-garmen/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail");
      XLSX.writeFile(workbook, "Export_QC_Detail.xlsx");
    } catch (err) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message || 'Gagal mengekspor data detail.');
    } finally {
      loading.value = false;
    }
  }
};

onMounted(() => {
  if (!authStore.can(MENU_ID, 'view')) {
    toast.error('Anda tidak memiliki hak akses untuk membuka halaman ini.');
    return router.push('/');
  }
  fetchData();
});
watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Browse QC ke Garmen" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!canEditOrDelete"
        @click="handleEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" prepend-icon="mdi-delete"
        :disabled="!canEditOrDelete" @click="openDeleteDialog">Hapus</v-btn>
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
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="orange-darken-3" icon="mdi-square-rounded" size="small"></v-icon> Status Open
        </div>
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table header-browse-blue" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails">
          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td>
              <template v-if="header.key === 'Tanggal'">
                {{ formatTanggal(item.Tanggal) }}
              </template>
              <template v-else-if="['Nominal', 'Terbayar', 'Sisa'].includes(header.key)">
                {{ (item[header.key] || 0).toLocaleString('id-ID') }}
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip size="x-small"
                  :color="item.Closing === 'N' ? 'error' : (item.Closing === 'Y' ? 'success' : 'info')">
                  {{ item.Closing === 'Y' ? 'CLOSE' : 'OPEN' }}
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
                      <template v-for="col in ['Jumlah', 'SudahTerima']" :key="col" #[`item.${col}`]="{ item }">
              <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
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
      <v-spacer />
      <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
      <v-btn color="primary" variant="tonal"
        @click="() => { dialogConfirm.onConfirm(); dialogConfirm.show = false; }">Ya</v-btn>
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

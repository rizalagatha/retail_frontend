<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface MasterItem {
  nomor: string;
  tanggal: string;
  usr: string;
  approved: string | null;
  tglApproval: string | null;
  closing: 'Y' | 'N';
}
interface DetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  barcodeBaru?: string;
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '33';

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<{ kode: string, nama: string }[]>([]);

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

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canEdit = computed(() => isSingleSelected.value && !selectedRow.value?.approved && selectedRow.value?.closing !== 'Y');
const canDelete = computed(() => isSingleSelected.value && !selectedRow.value?.approved && selectedRow.value?.closing !== 'Y');
const canPrintBarcode = computed(() => isSingleSelected.value && !!selectedRow.value?.approved);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'nomor', width: '180px' },
  { title: 'Tanggal', key: 'tanggal', width: '120px' },
  { title: 'User', key: 'usr', width: '120px' },
  { title: 'Approved', key: 'approved', width: '120px' },
  { title: 'Tgl Approval', key: 'tglApproval' },
  { title: 'Closing', key: 'closing', align: 'start' },
] as const;
const detailHeaders = [
  { title: 'Kode', key: 'kode' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
  { title: 'Harga', key: 'harga', align: 'end' },
  { title: 'Barcode Baru', key: 'barcodeBaru' },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/pengajuan-barcode/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/pengajuan-barcode', { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor));
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/pengajuan-barcode/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`, error);
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

const handleNew = () => router.push({ name: 'PengajuanBarcodeCreate' });
const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: 'PengajuanBarcodeEdit', params: { nomor: selectedRow.value.nomor } });
};

const handleDelete = () => {
  if (!canDelete.value) return;
  showConfirmation(
    'Konfirmasi Hapus',
    `Yakin ingin menghapus dokumen ${selectedRow.value.nomor}?`,
    async () => {
      try {
        const response = await api.delete(`/pengajuan-barcode/${selectedRow.value.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (err) {
        const error = err as AxiosError<{ message?: string }>;
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
      }
    }
  );
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pengajuan Barcode Header");
    XLSX.writeFile(workbook, "Export_PengajuanBarcode_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/pengajuan-barcode/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pengajuan Barcode Detail");
      XLSX.writeFile(workbook, "Export_PengajuanBarcode_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

const handleCetakBarcode = () => {
  if (!canPrintBarcode.value) return;

  // Gunakan router.resolve() untuk mendapatkan URL
  // dan window.open() untuk membuka di tab baru
  const url = router.resolve({
    name: 'CetakBarcodeBaru',
    params: { nomor: selectedRow.value.nomor }
  }).href;

  window.open(url, '_blank');
};

const getRowTextColor = (item: MasterItem): string => {
  return !item.approved ? 'text-red font-weight-bold' : '';
};

onMounted(async () => {
  await fetchCabangList();
});

watch(filters, fetchMasterData, { deep: true, immediate: true });
</script>

<template>
  <PageLayout title="Browse Pengajuan Barcode Baru" icon="mdi-barcode-scan">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" @click="handleEdit"
        :disabled="!canEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        @click="handleDelete" :disabled="!canDelete">Hapus</v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"><v-list-item-title>Export
              Header</v-list-item-title></v-list-item>
          <v-list-item @click="exportData('detail')"><v-list-item-title>Export
              Detail</v-list-item-title></v-list-item>
        </v-list>
      </v-menu>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-printer" color="success"
        @click="handleCetakBarcode" :disabled="!canPrintBarcode">
        Cetak Barcode Baru
      </v-btn>
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
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum di-Approve
        </div>
      </div>
      <div class="table-container">
        <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails">
          <template v-for="header in headers" #[`item.${header.key}`]="{ item }" :key="`${item.nomor}-${header.key}`">
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
              <td :colspan="columns.length">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">Memuat
                      detail...
                    </div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template #bottom></template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </v-data-table>
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
  </PageLayout>
</template>

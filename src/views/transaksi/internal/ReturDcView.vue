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
  nomorTerima: string | null;
  tglTerima: string | null;
  noKoreksi: string | null;
  gudangDc: string;
  keterangan: string;
  closing: 'Y' | 'N';
}
interface DetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  terima: number;
  selisih: number;
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '32';

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);

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

const canEdit = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima && selectedRow.value?.closing !== 'Y');
const canDelete = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima && selectedRow.value?.closing !== 'Y');

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'nomor', width: '180px' },
  { title: 'Tanggal', key: 'tanggal', width: '120px' },
  { title: 'Nomor Terima', key: 'nomorTerima', width: '180px' },
  { title: 'Tgl Terima', key: 'tglTerima', width: '120px' },
  { title: 'No Koreksi', key: 'noKoreksi', width: '180px' },
  { title: 'Gudang DC', key: 'gudangDc' },
  { title: 'Keterangan', key: 'keterangan' },
  { title: 'Closing', key: 'closing', align: 'center' },
] as const;

const detailHeaders = [
  { title: 'Kode', key: 'kode' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
  { title: 'Terima', key: 'terima', align: 'end' },
  { title: 'Selisih', key: 'selisih', align: 'end' },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
  try {
    // Menggunakan endpoint lookup cabang yang sudah ada
    const response = await api.get('/retur-jual/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/retur-dc', { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
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
    const response = await api.get(`/retur-dc/details/${nomorToLoad}`);
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

const handleNew = () => router.push({ name: 'ReturDcCreate' });
const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: 'ReturDcEdit', params: { nomor: selectedRow.value.nomor } });
};

const handleDelete = () => {
  if (!canDelete.value) return;
  showConfirmation(
    'Konfirmasi Hapus',
    `Yakin ingin menghapus dokumen ${selectedRow.value.nomor}?`,
    async () => {
      try {
        const response = await api.delete(`/retur-dc/${selectedRow.value.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (err) {
        const error = err as AxiosError<{ message: string }>;
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
      }
    }
  );
};

const handlePrint = () => {
  if (!isSingleSelected.value) return;
  const url = router.resolve({
    name: 'ReturDcPrint',
    params: { nomor: selectedRow.value.nomor }
  }).href;
  window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diexport.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Retur DC Header");
    XLSX.writeFile(workbook, "Export_ReturDC_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/retur-dc/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diexport pada filter ini.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Retur DC Detail");
      XLSX.writeFile(workbook, "Export_ReturDC_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

const getRowTextColor = (item: MasterItem) => {
  if (!item.nomorTerima) return 'text-red font-weight-bold';
  return '';
};

onMounted(async () => {
  await fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Retur Barang ke DC" icon="mdi-truck-minus-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" @click="handleEdit" :disabled="!canEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" @click="handleDelete"
        :disabled="!canDelete">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="handlePrint">
        Cetak
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">Export</v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"><v-list-item-title>Export
              Header</v-list-item-title></v-list-item>
          <v-list-item @click="exportData('detail')"><v-list-item-title>Export
              Detail</v-list-item-title></v-list-item>
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
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diterima
        </div>
      </div>

      <div class="table-container">
        <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails">
          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td :class="getRowTextColor(item)">
              <template v-if="['tanggal', 'tglTerima'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(item[header.key]), 'dd/MM/yyyy') : '' }}
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
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">Memuat detail...
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

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MasterProductSearchModal from '@/components/lookup/MasterProductSearchModal.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

interface MasterDataItem {
  nomor: string;
  tanggal: string;
  nomorTerima: string;
  tglTerima: string;
  namaStoreTujuan: string;
  keterangan: string;
  usr: string;
  closing: 'Y' | 'N' | string; // atau boolean tergantung backend
}
interface DetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '46';

// --- State ---
const masterData = ref<MasterDataItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterDataItem[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const isMasterProductSearchVisible = ref(false);
const searchItemName = ref('');

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
  itemCode: '',
});

// --- State Dialog Konfirmasi ---
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'nomor', minWidth: '180px', fixed: true },
  { title: 'Tanggal', key: 'tanggal', minWidth: '120px' },
  { title: 'Nomor Terima', key: 'nomorTerima', minWidth: '180px' },
  { title: 'Tgl Terima', key: 'tglTerima', minWidth: '120px' },
  { title: 'Ke Store', key: 'namaStoreTujuan', minWidth: '200px' },
  { title: 'Keterangan', key: 'keterangan', minWidth: '250px' },
  { title: 'User', key: 'usr', minWidth: '100px' },
  { title: 'Closing', key: 'closing', minWidth: '100px', align: 'center' },
] as const;

const detailHeaders = [
  { title: 'Kode', key: 'kode', width: '150px' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', width: '100px' },
  { title: 'Jumlah', key: 'jumlah', width: '100px', align: 'end' },
] as const;

// --- Methods ---
const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const openMasterProductSearch = () => {
  if (!filters.cabang) {
    toast.error('Pilih cabang terlebih dahulu.');
    return;
  }
  isMasterProductSearchVisible.value = true;
};

const onMasterProductSelected = (product: { kode: string, nama: string }) => {
  isMasterProductSearchVisible.value = false;
  if (product) {
    filters.itemCode = product.kode;
    searchItemName.value = product.nama;
  }
};

const fetchCabangList = async () => {
  try {
    const response = await api.get('/mutasi-kirim/lookup/cabang');
    cabangList.value = response.data;
    if (!filters.cabang && cabangList.value.length > 0) {
      filters.cabang = cabangList.value[0].kode;
    }
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.', error);
  }
};

const fetchMasterData = async () => {
  if (!filters.cabang) return;
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  details.value = {};
  try {
    const response = await api.get('/mutasi-kirim', { params: filters });
    masterData.value = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterDataItem[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor));
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.nomor);
  try {
    const response = await api.get(`/mutasi-kirim/details/${itemToLoad.nomor}`);
    details.value[itemToLoad.nomor] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${itemToLoad.nomor}`, error);
  } finally {
    loadingDetails.value.delete(itemToLoad.nomor);
  }
};

const handleDelete = () => {
  if (!selectedRow.value) return;

  showConfirmation(
    'Konfirmasi Hapus',
    `Yakin ingin menghapus dokumen ${selectedRow.value.nomor}?`,
    async () => {
      try {
        const response = await api.delete(`/mutasi-kirim/${selectedRow.value.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (err: unknown) {
        const error = err as AxiosError<{ message: string }>;
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
      }
    }
  );
};

const getRowTextColor = (item: MasterDataItem) => {
  if (!item.nomorTerima) return 'text-red font-weight-bold';
  return '';
};

const handleNew = () => {
  router.push({ name: 'MutasiKirimCreate' });
}

const handleEdit = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].nomor;
  router.push({ name: 'MutasiKirimEdit', params: { nomor } });
};

const handlePrint = () => {
  if (!selectedRow.value) return;
  const url = router.resolve({
    name: 'MutasiKirimPrint',
    params: { nomor: selectedRow.value.nomor }
  }).href;
  window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data untuk diexport.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Header");
    XLSX.writeFile(workbook, "Export_Mutasi_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/mutasi-kirim/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diexport.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Detail");
      XLSX.writeFile(workbook, "Export_Mutasi_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

onMounted(async () => {
  // 1. Tunggu sampai daftar cabang selesai dimuat dan filter cabang diatur
  await fetchCabangList();

  // 2. Setelah semua filter siap, panggil data master secara eksplisit
  fetchMasterData();
});

watch(() => filters.cabang, (newVal, oldVal) => {
  if (newVal !== oldVal) {
    fetchMasterData();
  }
});

// Watch untuk filter lain (kecuali cabang)
watch(
  () => ({ startDate: filters.startDate, endDate: filters.endDate, itemCode: filters.itemCode }),
  (newFilters, oldFilters) => {
    if (JSON.stringify(newFilters) !== JSON.stringify(oldFilters)) {
      if (!newFilters.itemCode) {
        searchItemName.value = '';
      }
      fetchMasterData();
    }
  },
  { deep: true }
);
</script>

<template>
  <PageLayout title="Mutasi Antar Store Kirim" :icon="'mdi-store-transfer-outline'">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleNew">
        Baru
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" @click="handleEdit">
        Ubah
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        @click="handleDelete">
        Hapus
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
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />

        <v-text-field v-model="filters.itemCode" label="Kode Barang" density="compact" hide-details variant="outlined"
          class="ms-4" style="max-width: 150px;" clearable readonly @click="openMasterProductSearch">
          <template #append-inner>
            <v-icon @click="openMasterProductSearch">mdi-magnify</v-icon>
          </template>
        </v-text-field>
        <v-text-field v-model="searchItemName" variant="solo-filled" density="compact" hide-details readonly
          class="ms-1" style="max-width: 300px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diterima
        </div>
      </div>

      <div class="table-container">
        <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header show-select
          return-object show-expand single-select @update:expanded="loadDetails">

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
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">
                      Memuat detail...
                    </div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template #[`item.jumlah`]="{ item }">
                        <div class="text-end">{{ item.jumlah }}</div>
                      </template>

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

    <!-- Dialog Konfirmasi Kustom -->
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

    <MasterProductSearchModal v-if="isMasterProductSearchVisible" :gudang="filters.cabang"
      @close="isMasterProductSearchVisible = false" @product-selected="onMasterProductSelected" />

  </PageLayout>
</template>

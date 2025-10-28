<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MasterProductSearchModal from '@/components/lookup/MasterProductSearchModal.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface GudangOption {
  kode: string;
  nama: string;
  sts: number; // 0=Store, 1=DC, dll
}
interface MasterDataItem {
  kode: string;
  nama: string;
  ukuran?: string;
  stokAwal?: number;
  selisihSop?: number;
  koreksi?: number;
  returJual?: number;
  terimaSJ?: number;
  mutStoreTerima?: number;
  mutInPesan?: number;
  invoice?: number;
  returKeDC?: number;
  mutStoreKirim?: number;
  mutOutPesan?: number;
  saldoAkhir?: number;
  // tambahkan properti lain yang muncul di API
}
interface DetailItem {
  id: string;
  tanggal: string;
  nomor?: string;
  In?: number;
  Out?: number;
  transaksi?: string;
}
interface DetailHeader {
  title: string;
  key: string;
  align?: 'start' | 'center' | 'end';
  cellProps?: { class?: string }; // <--- tidak pakai any
}

// --- State & Inisialisasi ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '502';

const masterData = ref<MasterDataItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const isLoading = ref(true);
const loadingDetails = ref(new Set<string>());
const gudangList = ref<GudangOption[]>([]);
const isProductSearchVisible = ref(false);

const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  gudang: authStore.user?.cabang || '',
  gudangDc: 0,
  kodeBarang: '',
  namaBarang: '',
});

// --- Header Tabel ---
const headers = [
  { title: 'Kode', key: 'kode', fixed: true, width: '100px' },
  { title: 'Nama Barang', key: 'nama', fixed: true, width: '200px' },
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'Stok Awal', key: 'stokAwal', align: 'end' },
  { title: 'Selisih SOP', key: 'selisihSop', align: 'end' },
  { title: 'Koreksi', key: 'koreksi', align: 'end' },
  { title: 'Retur Jual', key: 'returJual', align: 'end' },
  { title: 'Terima SJ', key: 'terimaSJ', align: 'end' },
  { title: 'Terima Mutasi', key: 'mutStoreTerima', align: 'end' },
  { title: 'Mutasi In (Pesan)', key: 'mutInPesan', align: 'end' },
  { title: 'Invoice', key: 'invoice', align: 'end' },
  { title: 'Retur ke DC', key: 'returKeDC', align: 'end' },
  { title: 'Kirim Mutasi', key: 'mutStoreKirim', align: 'end' },
  { title: 'Mutasi Out (Pesan)', key: 'mutOutPesan', align: 'end' },
  { title: 'Saldo Akhir', key: 'saldoAkhir', align: 'end', cellProps: { class: 'font-weight-bold' } },
] as const;

const canView = computed(() => authStore.can(MENU_ID, 'view'));
// Asumsi export memerlukan izin view
const canExport = computed(() => authStore.can(MENU_ID, 'view'));

// --- Detail Headers Berdasarkan Gudang ---
const detailHeaders = ref<DetailHeader[]>([]);

const generateHeaders = () => {
  detailHeaders.value = [
    { title: 'Id', key: 'id' },
    { title: 'Tanggal', key: 'tanggal', align: 'end' },
    { title: 'Nomor', key: 'nomor', align: 'end' },
    { title: 'In', key: 'In', align: 'end' },
    { title: 'Out', key: 'Out', align: 'end' },
    { title: 'Transaksi', key: 'transaksi', align: 'end' },
  ];
};

// --- API Calls ---
const fetchGudangList = async () => {
  try {
    const response = await api.get('/laporan-kartu-stok/lookup/gudang-options');
    gudangList.value = response.data;

    const defaultGudang = response.data.find((g: GudangOption) => g.kode === filters.gudang);
    if (defaultGudang) {
      filters.gudangDc = defaultGudang.sts;
      generateHeaders();
    }
  } catch {
    toast.error('Gagal memuat daftar gudang.');
  }
};
const expanded = ref([]);

const fetchMasterData = async () => {
  isLoading.value = true;
  details.value = {};
  try {
    const response = await api.get('/laporan-kartu-stok/product-list', { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data produk.');
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: DetailItem[]) => {
  const itemToLoad = newlyExpandedItems.find(item => {
    const id = item.id; // id = kode+ukuran atau sesuai struktur
    return !details.value[id] && !loadingDetails.value.has(id);
  });
  if (!itemToLoad) return;

  const idProduk = itemToLoad.id;
  loadingDetails.value.add(idProduk);
  try {
    const response = await api.get<DetailItem[]>('/laporan-kartu-stok/kartu-stok-details', {
      params: { ...filters, id: idProduk },
    });

    // Gunakan spread agar reaktif
    details.value = {
      ...details.value,
      [idProduk]: response.data,
    };
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || `Gagal memuat detail untuk ${idProduk}`);
  } finally {
    loadingDetails.value.delete(idProduk);
  }
};

// --- Event Handlers ---
const onGudangSelected = (gudangKode: string) => {
  const selected = gudangList.value.find(g => g.kode === gudangKode);
  if (selected) {
    filters.gudangDc = selected.sts;
    generateHeaders();
  }
};

const openProductSearch = () => { isProductSearchVisible.value = true; };
const onProductSelected = (product: { kode: string; nama: string; }) => {
  filters.kodeBarang = product.kode;
  filters.namaBarang = product.nama;
  isProductSearchVisible.value = false;
};
const clearProductFilter = () => {
  filters.kodeBarang = '';
  filters.namaBarang = '';
};

const exportToExcel = () => {
  // --- TAMBAHKAN PENGECEKAN IZIN ---
  if (!canExport.value) {
    toast.error('Anda tidak memiliki izin untuk mengekspor data.');
    return;
  }
  // ---------------------------------

  // --- Perbaikan: Cek masterData bukan items ---
  if (masterData.value.length === 0) return toast.warning('Tidak ada data untuk diekspor.');
  // ---------------------------------------------
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(masterData.value);
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan Kartu Stok');
  XLSX.writeFile(wb, 'LaporanKartuStok.xlsx');
  // --- Tambahkan toast sukses ---
  toast.success('Data berhasil diekspor.');
  // ----------------------------
};

// --- Lifecycle ---
onMounted(async () => { // <-- Jadikan async
  // --- TAMBAHKAN PENGECEKAN AWAL ---
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    masterData.value = []; // Pastikan data kosong
    return; // Hentikan eksekusi
  }
  // ------------------------------------

  // Panggil fetchGudangList jika punya izin
  await fetchGudangList();
  // Tidak perlu memanggil fetchMasterData di sini,
  // karena watch immediate: true akan melakukannya (setelah cek izin di watch)
});
watch(filters, () => {
  // --- TAMBAHKAN PENGECEKAN IZIN ---
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading jika belum
    masterData.value = []; // Kosongkan data
    return; // Hentikan jika tidak ada izin
  }
  // ---------------------------------
  fetchMasterData();
}, { deep: true, immediate: true });
</script>

<template>
  <PageLayout title="Laporan Kartu Stok" icon="mdi-file-chart-outline">
    <template #header-actions>
      <v-btn v-if="canExport" size="small" @click="exportToExcel" prepend-icon="mdi-file-excel" color="teal">
        Export
      </v-btn>
    </template>

    <div v-if="!canView && !isLoading" class="state-container pa-4 text-center">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p>Anda tidak memiliki izin untuk melihat laporan ini.</p>
    </div>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-select v-model="filters.gudang" :items="gudangList" item-title="nama" item-value="kode" label="Gudang"
          density="compact" hide-details variant="outlined" style="max-width: 180px;" class="ms-4"
          @update:model-value="onGudangSelected" />
        <v-text-field v-model="filters.kodeBarang" label="Kode Barang (F1)" density="compact" hide-details
          variant="outlined" style="max-width: 180px;" class="ms-4" readonly @click="openProductSearch"
          @keydown.f1.prevent="openProductSearch" clearable @click:clear="clearProductFilter">
          <template #append-inner><v-icon @click="openProductSearch">mdi-magnify</v-icon></template>
        </v-text-field>
        <v-text-field v-model="filters.namaBarang" readonly filled density="compact" hide-details
          style="max-width: 250px;" class="ms-1" />
        <v-spacer />
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading"
          title="Muat Ulang Data" />
      </div>

      <div class="table-container">
        <v-data-table :headers="headers" :items="masterData" :loading="isLoading" class="desktop-table"
          density="compact" fixed-header show-expand return-object item-value="uniqueId" v-model:expanded="expanded"
          @update:expanded="loadDetails">
          <template v-slot:[`item.uniqueId`]="{ item }">
            {{ item.kode + (item.ukuran || '') }}
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-2">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.kode + (item.ukuran || ''))" class="text-center pa-4">
                      Memuat detail mutasi...
                    </div>

                    <v-data-table v-else :headers="detailHeaders" :items="details[item.kode + (item.ukuran || '')]"
                      density="compact" class="detail-table" :items-per-page="-1">
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
    <MasterProductSearchModal v-if="isProductSearchVisible" :gudang="filters.gudang"
      @close="isProductSearchVisible = false" @product-selected="onProductSelected" />
  </PageLayout>
</template>

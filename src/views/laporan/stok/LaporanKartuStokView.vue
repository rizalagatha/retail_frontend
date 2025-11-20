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
import AppDataTable from '@/components/AppDataTable.vue';

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
  saldo?: number;
}
interface DetailHeader {
  title: string;
  key: string;
  align?: 'start' | 'center' | 'end';
  cellProps?: { class?: string }; // <--- tidak pakai any
  headerProps?: { class?: string };
}
interface DetailExportRow {
  ID: string;
  Tanggal: string;
  Nomor?: string;
  Transaksi?: string;
  In?: number;
  Out?: number;
  Saldo?: number;
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
    { title: 'ID', key: 'id', align: 'start', cellProps: { class: 'd-none' }, headerProps: { class: 'd-none' } },
    { title: 'Tanggal', key: 'tanggal', align: 'start' },
    { title: 'Nomor', key: 'nomor', align: 'start' },
    { title: 'Transaksi', key: 'transaksi', align: 'start' },
    { title: 'In', key: 'In', align: 'end' },
    { title: 'Out', key: 'Out', align: 'end' },
    { title: 'Saldo', key: 'saldo', align: 'end', cellProps: { class: 'font-weight-bold' } },
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

const loadDetails = async (newlyExpandedItems: MasterDataItem[]) => {
  // 'newlyExpandedItems' adalah array objek dari 'masterData'

  const itemToLoad = newlyExpandedItems.find(item => {
    // [FIX] Buat ID unik dari kode + ukuran
    const idProduk = item.kode + (item.ukuran || '');
    return !details.value[idProduk] && !loadingDetails.value.has(idProduk);
  });

  if (!itemToLoad) return;

  // [FIX] Buat ID unik lagi untuk dipakai
  const idProduk = itemToLoad.kode + (itemToLoad.ukuran || '');

  loadingDetails.value.add(idProduk);
  try {
    const response = await api.get<DetailItem[]>('/laporan-kartu-stok/kartu-stok-details', {
      // 'filters' sudah berisi gudang, startDate, endDate
      params: { ...filters, id: idProduk }, // Kirim ID unik yang benar
    });

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
  fetchMasterData();
};
const clearProductFilter = () => {
  filters.kodeBarang = '';
  filters.namaBarang = '';
  masterData.value = [];
  details.value = {};
};

const exportData = (type: 'header' | 'detail') => {
  if (!canExport.value) {
    toast.error('Anda tidak memiliki izin untuk mengekspor data.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // ========== EXPORT HEADER ==========
  if (type === 'header') {
    if (masterData.value.length === 0) {
      toast.warning('Tidak ada data header untuk diekspor.');
      return;
    }

    const wsHeader = XLSX.utils.json_to_sheet(masterData.value);
    XLSX.utils.book_append_sheet(wb, wsHeader, 'Header');

    XLSX.writeFile(
      wb,
      `LaporanKartuStok-Header-${filters.kodeBarang}-${filters.startDate}_sd_${filters.endDate}.xlsx`
    );

    toast.success('Export Header berhasil.');
    return;
  }

  // ========== EXPORT DETAIL ==========
  if (type === 'detail') {
    if (!filters.kodeBarang) {
      toast.warning('Pilih produk terlebih dahulu.');
      return;
    }

    const allKeys = Object.keys(details.value);
    if (allKeys.length === 0) {
      toast.warning('Tidak ada detail mutasi (perlu expand dulu).');
      return;
    }

    const detailRows: DetailExportRow[] = [];

    for (const key of allKeys) {
      const rows = details.value[key];
      if (!rows) continue;

      rows.forEach(r => {
        detailRows.push({
          ID: r.id,
          Tanggal: r.tanggal,
          Nomor: r.nomor,
          Transaksi: r.transaksi,
          In: r.In,
          Out: r.Out,
          Saldo: r.saldo,
        });
      });
    }

    if (detailRows.length === 0) {
      toast.warning('Tidak ada data detail untuk diekspor.');
      return;
    }

    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail');

    XLSX.writeFile(
      wb,
      `LaporanKartuStok-Detail-${filters.kodeBarang}-${filters.startDate}_sd_${filters.endDate}.xlsx`
    );

    toast.success('Export Detail berhasil.');
    return;
  }
};

// --- Lifecycle ---
onMounted(async () => {
  if (!canView.value) {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    masterData.value = [];
    return;
  }

  await fetchGudangList();

  // [PERBAIKAN REFRESH]
  // Cek jika filter kodeBarang sudah ada nilainya saat halaman di-refresh
  if (filters.kodeBarang) {
    fetchMasterData(); // Langsung panggil fetch
  } else {
    // Jika tidak ada, baru kita set loading false (menampilkan pesan 'Pilih Produk')
    isLoading.value = false;
  }
});
// 1. Watcher ini HANYA bereaksi pada perubahan filter utama
//    (Tanggal, Gudang)
watch([() => filters.startDate, () => filters.endDate, () => filters.gudang], () => {
  // Hanya fetch jika kode barang SUDAH diisi
  if (filters.kodeBarang) {
    fetchMasterData();
  }
});

// 2. Watcher ini HANYA bereaksi pada perubahan Kode Barang
watch(() => filters.kodeBarang, (newKode) => {
  if (newKode) {
    // Jika kode baru dipilih (dari onProductSelected), fetch data
    fetchMasterData();
  }
  // Jika 'newKode' kosong (dari clearProductFilter),
  // kita tidak melakukan apa-apa (karena 'clear' sudah mengosongkan tabel)
});
</script>

<template>
  <PageLayout title="Laporan Kartu Stok" icon="mdi-file-chart-outline">
    <template #header-actions>
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
        <AppDataTable :headers="headers" :items="masterData" :loading="isLoading"
          class="desktop-table header-browse-blue" density="compact" fixed-header show-expand return-object
          :item-value="(item) => item.kode + (item.ukuran || '')" v-model:expanded="expanded"
          @update:expanded="loadDetails">

          <template #no-data>
            <div class="empty-data-wrapper custom-empty-state">
              <v-icon size="64" color="grey-lighten-2" class="mb-4">
                mdi-text-search-variant
              </v-icon>
              <h4 class="text-h6 text-grey-darken-1">Pilih Produk Terlebih Dahulu</h4>
              <p class="text-body-2 text-grey-lighten-1 mt-2">
                Silakan gunakan filter "Gudang" dan "Kode Barang" (F1)
                <br>
                untuk memuat laporan kartu stok.
              </p>
            </div>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-2">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.kode + (item.ukuran || ''))" class="text-center pa-4">
                      Memuat detail mutasi...
                    </div>

                    <v-data-table :headers="detailHeaders" :items="details[item.kode + (item.ukuran || '')]"
                      density="compact" class="detail-table" :items-per-page="-1">
                      <!-- Sembunyikan kolom ID -->
                      <template #[`item.id`]="{ item }">
                        <span class="d-none">{{ item.id }}</span>
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
    <MasterProductSearchModal v-if="isProductSearchVisible" :gudang="filters.gudang"
      @close="isProductSearchVisible = false" @product-selected="onProductSelected" />
  </PageLayout>
</template>

<style scoped>
.custom-empty-state {
  padding: 64px 32px;
}
</style>

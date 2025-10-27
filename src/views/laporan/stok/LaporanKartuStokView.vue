<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MasterProductSearchModal from '@/components/lookup/MasterProductSearchModal.vue';
import * as XLSX from 'xlsx';

// --- Tipe Data ---
interface GudangOption {
    kode: string;
    nama: string;
    sts: number; // 0=Store, 1=DC, dll
}

// --- State & Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '502';

const masterData = ref<any[]>([]);
const details = ref<Record<string, any[]>>({});
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
];

// --- Detail Headers Berdasarkan Gudang ---
const detailHeaders = ref<any[]>([]);

const generateHeaders = (gudangDc: number) => {
    // Semua header detail sama untuk semua gudang
    detailHeaders.value = [
        { title: 'Id', key: 'id' },                   // gabungan mst_brg_kode + mst_ukuran
        { title: 'Tanggal', key: 'tanggal', align: 'end' },
        { title: 'Nomor', key: 'nomor', align: 'end' },
        { title: 'In', key: 'In', align: 'end' },
        { title: 'Out', key: 'Out', align: 'end' },
        { title: 'Transaksi', key: 'transaksi', align: 'end' },
    ];
};

// --- Fungsi: Hitung Saldo Akhir ---
const calculateSaldoAkhir = (item: any, gudangDc: number) => {
    if (item.saldoAkhir !== undefined && item.saldoAkhir !== null) {
        return item.saldoAkhir;
    }
    if (gudangDc === 0 || gudangDc === 3) {
        return (
            (item.stokAwal || 0) +
            (item.selisihSop || 0) +
            (item.koreksi || 0) +
            (item.returJual || 0) +
            (item.terimaSJ || 0) +
            (item.mutStoreTerima || 0) +
            (item.mutInPesan || 0)
        ) - (
            (item.invoice || 0) +
            (item.returKeDC || 0) +
            (item.mutStoreKirim || 0) +
            (item.mutOutPesan || 0)
        );
    } else {
        return (
            (item.stokAwal || 0) +
            (item.selisihSop || 0) +
            (item.koreksi || 0) +
            (item.mutasiIn || 0) +
            (item.terimaQc || 0) +
            (item.returStore || 0) +
            (item.returJual || 0) +
            (item.terimaSTBJ || 0) +
            (item.terimaGdgRepair || 0) +
            (item.bpb || 0) +
            (item.mct || 0)
        ) - (
            (item.sj || 0) +
            (item.qc || 0) +
            (item.mutasiOut || 0) +
            (item.invoice || 0) +
            (item.mck || 0)
        );
    }
};

// --- API Calls ---
const fetchGudangList = async () => {
    try {
        const response = await api.get('/laporan-kartu-stok/lookup/gudang-options');
        gudangList.value = response.data;

        const defaultGudang = response.data.find((g: GudangOption) => g.kode === filters.gudang);
        if (defaultGudang) {
            filters.gudangDc = defaultGudang.sts;
            generateHeaders(defaultGudang.sts);
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
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal memuat data produk.');
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: any[]) => {
  const itemToLoad = newlyExpandedItems.find(item => {
    const id = item.kode + (item.ukuran || '');
    return !details.value[id] && !loadingDetails.value.has(id);
  });
  if (!itemToLoad) return;

  const idProduk = itemToLoad.kode + (itemToLoad.ukuran || '');
  loadingDetails.value.add(idProduk);
  try {
    const response = await api.get('/laporan-kartu-stok/kartu-stok-details', {
      params: { ...filters, id: idProduk },
    });

    // Gunakan spread agar reaktif
    details.value = {
      ...details.value,
      [idProduk]: response.data,
    };
  } catch (error: any) {
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
        generateHeaders(selected.sts);
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
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(masterData.value);
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Kartu Stok');
    XLSX.writeFile(wb, 'LaporanKartuStok.xlsx');
};

// --- Lifecycle ---
onMounted(fetchGudangList);
watch(filters, fetchMasterData, { deep: true, immediate: true });
</script>

<template>
    <PageLayout title="Laporan Kartu Stok" icon="mdi-file-chart-outline">
        <template #header-actions>
            <v-btn size="small" @click="exportToExcel" prepend-icon="mdi-file-excel" color="teal">Export</v-btn>
        </template>

        <div class="browse-content">
            <div class="filter-section">
                <v-label class="filter-label">Periode:</v-label>
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
                    style="max-width: 180px;" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
                    style="max-width: 180px;" />
                <v-select v-model="filters.gudang" :items="gudangList" item-title="nama" item-value="kode"
                    label="Gudang" density="compact" hide-details variant="outlined" style="max-width: 180px;"
                    class="ms-4" @update:model-value="onGudangSelected" />
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
            <v-data-table
                :headers="headers"
                :items="masterData"
                :loading="isLoading"
                class="desktop-table"
                density="compact"
                fixed-header
                show-expand
                return-object
                item-value="uniqueId"
                v-model:expanded="expanded"
                @update:expanded="loadDetails"
                >
                <template #item.uniqueId="{ item }">
                    {{ item.kode + (item.ukuran || '') }}
                </template>

                <template #expanded-row="{ columns, item }">
                    <tr>
                    <td :colspan="columns.length">
                        <div class="detail-container pa-2">
                        <div class="detail-table-wrapper">
                        <div
                            v-if="loadingDetails.has(item.kode + (item.ukuran || ''))"
                            class="text-center pa-4"
                        >
                            Memuat detail mutasi...
                        </div>

                        <v-data-table
                            v-else
                            :headers="detailHeaders"
                            :items="details[item.kode + (item.ukuran || '')]"
                            density="compact"
                            class="detail-table"
                            :items-per-page="-1"
                        >
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

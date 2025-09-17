<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, subDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import ProductSearchModal from '@/components/ProductSearchModal.vue';

// --- Tipe Data ---
interface SuratJalanHeader {
    Nomor: string;
    Tanggal: string;
    NomorTerima: string;
    NoSTBJ: string;
    Ngedit: 'WAIT' | 'ACC' | 'TOLAK' | '';
    Closing: 'Y' | 'N';
    [key: string]: any;
}

interface SuratJalanDetail {
    [key: string]: any;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '213';

// --- State ---
const filters = reactive({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    kodeBarang: '',
    namaBarang: '',
});
const loading = reactive({ master: false, pengajuan: false });
const masterData = ref<SuratJalanHeader[]>([]);
const selected = ref<SuratJalanHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, SuratJalanDetail[]>>({});
const dialog = reactive({ pengajuan: false, searchProduct: false, confirm: false });
const pengajuan = reactive({
    nomor: '',
    tanggal: '',
    keterangan: '',
    urut: 1,
    alasan: '',
});
const confirmAction = ref<(() => void) | null>(null);
const confirmText = ref('');

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

// --- Konfigurasi Tabel ---
const masterHeaders = [
    { title: 'Nomor', key: 'Nomor', width: '150px' },
    { title: 'Tanggal', key: 'Tanggal', width: '110px' },
    { title: 'Store', key: 'Store', width: '80px' },
    { title: 'Nama Store', key: 'Nama_Store', width: '200px' },
    { title: 'No. Minta', key: 'NoMinta', width: '150px' },
    { title: 'No. Terima', key: 'NomorTerima', width: '150px' },
    { title: 'No. STBJ', key: 'NoSTBJ', width: '150px' },
    { title: 'Keterangan', key: 'Keterangan' },
    { title: 'User', key: 'Usr', width: '100px' },
    { title: 'Closing', key: 'Closing', width: '80px' },
];
const detailHeaders = [
    { title: 'Kode', key: 'Kode', width: '150px' },
    { title: 'Nama Barang', key: 'Nama' },
    { title: 'Ukuran', key: 'Ukuran', width: '100px' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '120px' },
];

// --- Method ---
const fetchMasterData = async () => {
    loading.master = true;
    masterData.value = [];
    selected.value = [];
    expanded.value = [];
    try {
        const response = await api.get('/surat-jalan', { params: filters });
        masterData.value = response.data;
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal mengambil data.');
    } finally {
        loading.master = false;
    }
};

const loadDetails = async (newlyExpandedItems: SuratJalanHeader[]) => {
    // Cari item yang baru diexpand yang datanya belum ada dan tidak sedang loading
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
    if (!itemToLoad) return;

    const nomorToLoad = itemToLoad.Nomor;
    loadingDetails.value.add(nomorToLoad);
    try {
        const response = await api.get(`/surat-jalan/${nomorToLoad}`);
        details.value[nomorToLoad] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
        // Jika gagal, biarkan Vuetify yang mengatur array expanded
        // Cukup pastikan datanya kosong agar menampilkan pesan error
        details.value[nomorToLoad] = [];
    } finally {
        loadingDetails.value.delete(nomorToLoad);
    }
};

const printData = () => {
    if (!isSingleSelected.value) return;
    const item = selected.value[0];
    const url = router.resolve({
        name: 'Cetak Surat Jalan', // Nama route baru
        params: { nomor: item.Nomor }
    }).href;
    window.open(url, '_blank');
};

const handleNew = () => router.push({ name: 'SuratJalanCreate' });
const handleEdit = () => {
    if (!selectedRow.value) return;
    if (selectedRow.value.NomorTerima) return toast.warning('Sudah ada penerimaan. Tidak bisa diubah.');
    if (selectedRow.value.NoSTBJ) return toast.warning('SJ Otomatis dari Terima STBJ. Tidak bisa diubah.');
    if (selectedRow.value.Closing === 'Y') return toast.warning('Sudah Closing Stok Opname. Tidak bisa diubah.');
    router.push({ name: 'SuratJalanEdit', params: { nomor: selectedRow.value.Nomor } });
};

const showDeleteConfirmation = () => {
    if (!selectedRow.value) return;
    confirmAction.value = executeDelete;
    confirmText.value = `Yakin ingin hapus Surat Jalan nomor ${selectedRow.value.Nomor}?`;
    dialog.confirm = true;
};
const executeDelete = async () => {
    if (!selectedRow.value) return;
    try {
        const response = await api.delete(`/surat-jalan/${selectedRow.value.Nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
    }
};

const openPengajuanDialog = async () => {
    if (!selectedRow.value) return;
    // Validasi
    if (selectedRow.value.NomorTerima) return toast.warning('Sudah ada penerimaan. Tidak bisa diubah.');
    if (selectedRow.value.NoSTBJ) return toast.warning('SJ Otomatis dari Terima STBJ. Tidak bisa diubah.');

    loading.pengajuan = true;
    dialog.pengajuan = true;
    try {
        const response = await api.get(`/surat-jalan/request-status/${selectedRow.value.Nomor}`);
        pengajuan.nomor = selectedRow.value.Nomor;
        pengajuan.tanggal = selectedRow.value.Tanggal;
        pengajuan.keterangan = selectedRow.value.Keterangan;
        pengajuan.urut = response.data.nextUrut;
        pengajuan.alasan = response.data.alasan;
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal mendapatkan status pengajuan.');
        dialog.pengajuan = false;
    } finally {
        loading.pengajuan = false;
    }
};

const submitPengajuan = async () => {
    loading.pengajuan = true;
    try {
        const response = await api.post('/surat-jalan/submit-request', pengajuan);
        toast.success(response.data.message);
        dialog.pengajuan = false;
        fetchMasterData();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal mengirim pengajuan.');
    } finally {
        loading.pengajuan = false;
    }
};

const onProductSelected = (products: any[]) => {
    if (products.length > 0) {
        filters.kodeBarang = products[0].kode;
        filters.namaBarang = products[0].nama;
    }
    dialog.searchProduct = false;
};

const getStatusColor = (status: string) => {
    if (status === 'WAIT') return 'blue';
    if (status === 'ACC') return 'green';
    if (status === 'TOLAK') return 'red';
    return 'grey';
}

onMounted(() => {
    if (authStore.can(MENU_ID, 'view')) {
        fetchMasterData();
    } else {
        toast.error('Anda tidak memiliki hak akses untuk melihat data ini.');
        router.push('/');
    }
});

let debounceTimer: number;
// Watcher untuk memuat ulang data secara otomatis saat filter berubah
watch(filters, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        fetchMasterData();
    }, 500); // Memberi jeda 500ms sebelum request
}, { deep: true });

// Watcher untuk membersihkan nama barang jika kode barang dikosongkan
watch(() => filters.kodeBarang, (newVal) => {
    if (!newVal) {
        filters.namaBarang = '';
    }
});
</script>

<template>
    <PageLayout title="Surat Jalan ke Store" icon="mdi-truck-delivery">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
                @click="router.push({ name: 'SuratJalanCreate' })">
                Baru
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-pencil"
                @click="router.push({ name: 'SuratJalanEdit', params: { nomor: selected[0].Nomor } })">
                Ubah
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-delete" @click="showDeleteConfirmation">
                Hapus
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
                prepend-icon="mdi-printer" @click="printData">
                Cetak
            </v-btn>
        </template>

        <div class="browse-content">
            <div class="filter-section">
                <v-divider vertical class="mx-2" />
                <v-label class="filter-label">Tanggal:</v-label>
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details />
                <v-label class="filter-label">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details />
                <v-text-field v-model="filters.kodeBarang" placeholder="Kode Barang (F1)" density="compact" hide-details
                    clearable variant="outlined" style="max-width: 150px;"
                    @keydown.f1.prevent="dialog.searchProduct = true">
                </v-text-field>
                <v-text-field v-model="filters.namaBarang" placeholder="Nama Barang" density="compact" hide-details
                    readonly variant="outlined" class="filter-nama-barang" style="max-width: 250px;">
                </v-text-field>
                <v-spacer />
                <div class="d-flex align-center ga-2 text-caption">
                    <v-icon :color="getStatusColor('WAIT')" icon="mdi-square-rounded" size="small"></v-icon> Nunggu Acc
                    <v-icon :color="getStatusColor('ACC')" icon="mdi-square-rounded" size="small"></v-icon> Sudah Acc
                    <v-icon :color="getStatusColor('TOLAK')" icon="mdi-square-rounded" size="small"></v-icon> Tolak
                </div>
                <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" v-model:expanded="expanded" :headers="masterHeaders"
                    :items="masterData" :loading="loading.master" item-value="Nomor" density="compact"
                    class="desktop-table" fixed-header show-select return-object show-expand
                    @update:expanded="loadDetails">
                    <template #item.Nomor="{ item }">
                        <strong :style="{ color: getStatusColor(item.Ngedit) }">{{ item.Nomor }}</strong>
                    </template>
                    <template #item.Tanggal="{ value }">{{ format(new Date(value), 'dd-MM-yyyy') }}</template>
                    <template #item.NomorTerima="{ value }">
                        <span :class="!value && 'text-red font-weight-bold'">{{ value || 'Belum' }}</span>
                    </template>
                    <template #item.NoSTBJ="{ value }"><span :class="value && 'text-blue font-weight-bold'">{{ value
                            }}</span>
                    </template>

                    <template #expanded-row="{ columns, item }">
                        <tr>
                            <td :colspan="columns.length">
                                <div class="detail-container">
                                    <div class="detail-table-wrapper">
                                        <div v-if="loadingDetails.has(item.Nomor)" class="state-container pa-4">
                                            <v-progress-circular indeterminate color="primary"></v-progress-circular>
                                            <div class="mt-2 text-caption">Memuat detail...</div>
                                        </div>
                                        <v-data-table v-else-if="details[item.Nomor]" class="detail-table"
                                            :headers="detailHeaders" :items="details[item.Nomor]" density="compact"
                                            :items-per-page="-1">
                                            <template #bottom></template>
                                        </v-data-table>
                                        <div v-else class="text-center text-caption py-2">
                                            Tidak ada data detail.
                                        </div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </template>
                </v-data-table>
            </div>
        </div>

        <ProductSearchModal v-if="dialog.searchProduct" category="ALL" :source="'surat-jalan'" :gudang="authStore.user?.cabang || ''"
            @close="dialog.searchProduct = false" @products-selected="onProductSelected" />

        <v-dialog v-model="dialog.confirm" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">Konfirmasi</v-card-title>
                <v-card-text>{{ confirmText }}</v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="dialog.confirm = false">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal"
                        @click="confirmAction && confirmAction(); dialog.confirm = false">Ya,
                        Lanjutkan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
.filter-nama-barang :deep(input) {
    font-size: 11px !important;
}
</style>
<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MasterProductSearchModal from '@/components/MasterProductSearchModal.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface MasterItem {
    nomor: string;
    tanggal: string;
    nomorTerima: string | null;
    tglTerima: string | null;
    store: string;
    namaStore: string;
    noKoreksi: string | null;
    keterangan: string;
    statusPengajuan: 'WAIT' | 'ACC' | 'TOLAK' | '';
    closing: 'Y' | 'N';
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '214';

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, any[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<any[]>([]);
const expanded = ref<any[]>([]);

const dialogConfirm = reactive({
    show: false,
    title: '',
    text: '',
    onConfirm: () => { },
});
// const changeRequestData = reactive({
//     nomorTerima: '',
//     alasan: '',
// });

const filters = reactive({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    itemCode: '',
});
const searchItemName = ref('');
const isMasterProductSearchVisible = ref(false);

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canTerima = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima);
const canBatalTerima = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTerima && selectedRow.value?.closing !== 'Y');
// const canRequestChange = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTerima && selectedRow.value?.closing !== 'Y' && !selectedRow.value.statusPengajuan);

// --- Konfigurasi Tabel ---
const headers = [
    { title: 'Nomor Kirim', key: 'nomor', width: '180px' },
    { title: 'Tgl Kirim', key: 'tanggal', width: '120px' },
    { title: 'Nomor Terima', key: 'nomorTerima', width: '180px' },
    { title: 'Tgl Terima', key: 'tglTerima', width: '120px' },
    { title: 'Dari Store', key: 'namaStore' },
    { title: 'No Koreksi', key: 'noKoreksi', width: '180px' },
    { title: 'Keterangan', key: 'keterangan' },
    { title: 'Pengajuan Ubah', key: 'statusPengajuan', align: 'center' },
    { title: 'Closing', key: 'closing', align: 'center' },
];
const detailHeaders = [
    { title: 'Kode', key: 'kode' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran' },
    { title: 'Jumlah', key: 'jumlah', align: 'end' },
    { title: 'Terima', key: 'terima', align: 'end' },
    { title: 'Selisih', key: 'selisih', align: 'end' },
];

// --- Methods ---
const fetchMasterData = async () => {
    loading.value = true;
    selected.value = [];
    expanded.value = [];
    try {
        const response = await api.get('/terima-retur', { params: filters });
        masterData.value = response.data;
    } catch (error: any) {
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
        const response = await api.get(`/terima-retur/details/${nomorToLoad}`);
        details.value[nomorToLoad] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
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

const handleTerima = () => {
    if (!canTerima.value) return;
    router.push({ name: 'TerimaReturCreate', query: { nomorKirim: selectedRow.value.nomor } });
};

const handleUbah = () => {
    if (!isSingleSelected.value || !selectedRow.value.nomorTerima) return;
    router.push({ name: 'TerimaReturEdit', params: { nomor: selectedRow.value.nomorTerima } });
};

const handleBatalTerima = () => {
    if (!canBatalTerima.value) return;
    showConfirmation(
        'Konfirmasi Batal Terima',
        `Yakin ingin membatalkan penerimaan untuk dokumen kirim ${selectedRow.value.nomor}? Stok akan dikembalikan.`,
        async () => {
            try {
                // 'nomor' di sini adalah nomor kirim, backend akan menangani sisanya
                const response = await api.delete(`/terima-retur/${selectedRow.value.nomor}`);
                toast.success(response.data.message);
                fetchMasterData(); // Refresh data untuk update tampilan
            } catch (error: any) {
                toast.error(error.response?.data?.message || 'Gagal membatalkan penerimaan.');
            }
        }
    );
};

// const handlePrint = () => {
//     if (!canEditOrPrint.value) return; // Menggunakan computed property yang sudah ada
//     // Anda perlu membuat halaman 'TerimaReturPrint' nanti
//     // const url = router.resolve({ name: 'TerimaReturPrint', params: { nomor: selectedRow.value.nomorTerima } }).href;
//     // window.open(url, '_blank');
//     toast.info('Fungsi cetak untuk penerimaan retur belum dibuat.');
// };

const exportData = async (type: 'header' | 'detail') => {
    // Anda perlu membuat endpoint export untuk modul ini nanti
    toast.info(`Fungsi export ${type} untuk penerimaan retur belum dibuat.`);
};

const openMasterProductSearch = () => {
    isMasterProductSearchVisible.value = true;
};

const onMasterProductSelected = (product: { kode: string; nama: string; }) => {
    isMasterProductSearchVisible.value = false;
    if (product) {
        filters.itemCode = product.kode;
        searchItemName.value = product.nama;
    }
};

// const openChangeRequestDialog = () => {
//     if (!canRequestChange.value) return;
//     changeRequestData.nomorTerima = selectedRow.value.nomorTerima;
//     changeRequestData.alasan = '';
//     dialogs.changeRequest = true;
// };

// const submitChangeRequest = async () => {
//     if (!changeRequestData.alasan.trim()) return toast.error('Alasan harus diisi.');
//     try {
//         const payload = {
//             nomorTerima: selectedRow.value.nomorTerima,
//             tanggalTerima: selectedRow.value.tglTerima,
//             nomorKirim: selectedRow.value.nomor,
//             alasan: changeRequestData.alasan,
//         };
//         const response = await api.post('/terima-retur/submit-change-request', payload);
//         toast.success(response.data.message);
//         dialogs.changeRequest = false;
//         fetchMasterData();
//     } catch (error: any) {
//         toast.error(error.response?.data?.message || 'Gagal mengirim pengajuan.');
//     }
// };

const getCellClass = (item: any) => {
    if (item.statusPengajuan === 'WAIT') return 'bg-blue text-white';
    if (item.statusPengajuan === 'ACC') return 'bg-green text-white';
    if (item.statusPengajuan === 'TOLAK') return 'bg-red text-white';
    return '';
};

const getRowTextColor = (item: any) => {
    if (!item.nomorTerima) return 'text-red font-weight-bold';
    return '';
};

onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
    <PageLayout title="Browse Terima Retur Barang dari Store" icon="mdi-package-check">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleTerima"
                :disabled="!canTerima">
                Terima
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" @click="handleBatalTerima"
                :disabled="!canBatalTerima">
                Batal Terima
            </v-btn>
            <!-- <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!canEditOrPrint"
                prepend-icon="mdi-printer" @click="handlePrint">
                Cetak
            </v-btn> -->
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
                <v-label class="filter-label">Tgl Kirim:</v-label>
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
                    style="max-width: 180px;" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
                    style="max-width: 180px;" />
                <v-text-field v-model="filters.itemCode" label="Kode Barang" density="compact" hide-details
                    variant="outlined" class="ms-4" style="max-width: 150px;" clearable readonly
                    @click="openMasterProductSearch">
                    <template #append-inner><v-icon @click="openMasterProductSearch">mdi-magnify</v-icon></template>
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
                    :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header
                    show-select show-expand return-object single-select @update:expanded="loadDetails">
                    <template v-for="header in headers" #[`item.${header.key}`]="{ item }">
                        <td :class="getRowTextColor(item)">
                            <template v-if="header.key === 'nomorTerima'">
                                <span :class="getCellClass(item)" class="status-cell pa-1">
                                    {{ item.nomorTerima }}
                                </span>
                            </template>
                            <template v-else-if="['tanggal', 'tglTerima'].includes(header.key)">
                                {{ item[header.key] ? format(parseISO(item[header.key]), 'dd/MM/yyyy') : '' }}
                            </template>
                            <template v-else-if="header.key === 'closing'">
                                <v-chip v-if="item.closing === 'Y'" size="x-small" color="success">YA</v-chip>
                            </template>
                            <template v-else-if="header.key === 'statusPengajuan'">
                                <v-chip v-if="item.statusPengajuan" size="x-small"
                                    :color="item.statusPengajuan === 'ACC' ? 'green' : item.statusPengajuan === 'TOLAK' ? 'red' : 'blue'">
                                    {{ item.statusPengajuan }}
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
                                <div class="detail-container">
                                    <div class="detail-table-wrapper">
                                        <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">Memuat
                                            detail...
                                        </div>
                                        <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]"
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

        <!-- <v-dialog v-model="dialogs.changeRequest" max-width="500px" persistent>
            <v-card>
                <v-card-title>Input Alasan Pengajuan Perubahan</v-card-title>
                <v-card-text>
                    <div class="text-subtitle-2 mb-2">No. Terima: {{ changeRequestData.nomorTerima }}</div>
                    <v-textarea v-model="changeRequestData.alasan" label="Alasan Perubahan" rows="3" variant="outlined"
                        autofocus />
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="dialogs.changeRequest = false">Batal</v-btn>
                    <v-btn color="primary" @click="submitChangeRequest">Ajukan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog> -->
        <MasterProductSearchModal v-if="isMasterProductSearchVisible" gudang=""
            @close="isMasterProductSearchVisible = false" @product-selected="onMasterProductSelected" />

        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
                    <v-btn color="primary" variant="tonal"
                        @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">
                        Ya, Lanjutkan
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </PageLayout>
</template>

<style scoped>
.status-cell {
    border-radius: 4px;
    display: inline-block;
    min-width: 80px;
    /* Lebar minimum agar chip/span terlihat bagus */
    text-align: center;
}
</style>
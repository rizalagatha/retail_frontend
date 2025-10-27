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
import axios from "axios";
import type { DataTableHeader } from "vuetify";

// --- Tipe Data ---
interface SjHeader {
    Nomor: string;
    NomorTerima: string;
    Tanggal?: string | null;
    TglTerima?: string | null;
    Closing?: string;
    [key: string]: unknown;
}
interface ErrorResponse {
    message?: string;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '31';

// --- State ---
const masterData = ref<SjHeader[]>([]);
const details = ref<Record<string, unknown[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<SjHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const isMasterProductSearchVisible = ref(false);

const filters = reactive({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    cabang: authStore.user?.cabang || '',
    kodeBarang: '',
    namaBarang: '',
});

const dialogConfirm = reactive({
    show: false,
    title: '',
    text: '',
    onConfirm: () => { },
});

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

// --- Konfigurasi Tabel ---
const headers: DataTableHeader[] = [
    { title: 'Nomor SJ', key: 'Nomor', width: '180px' },
    { title: 'Tanggal SJ', key: 'Tanggal', width: '120px' },
    { title: 'Nomor Minta', key: 'NomorMinta', width: '180px' },
    { title: 'Nomor Terima', key: 'NomorTerima', width: '180px' },
    { title: 'Tgl Terima', key: 'TglTerima', width: '120px' },
    { title: 'Store', key: 'Store', width: '100px' },
    { title: 'Nama Store', key: 'Nama_Store', width: '200px' },
    { title: 'Keterangan', key: 'Keterangan' },
    { title: 'Closing', key: 'Closing', align: 'center', width: '100px' },
];
const detailHeaders: DataTableHeader[] = [
    { title: 'Kode', key: 'Kode' },
    { title: 'Nama Barang', key: 'Nama' },
    { title: 'Ukuran', key: 'Ukuran' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end' },
];

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/terima-sj/lookup/cabang');
        cabangList.value = response.data;
    } catch {
        toast.error('Gagal memuat daftar cabang.');
    }
};

const fetchMasterData = async () => {
    loading.value = true;
    try {
        const response = await api.get('/terima-sj', { params: filters });
        masterData.value = response.data;
        selected.value = [];
        expanded.value = [];
    } catch (error: unknown) {
        if (axios.isAxiosError<ErrorResponse>(error)) {
            toast.error(error.response?.data?.message || "Gagal mengambil data.");
        } else {
            console.error("Unexpected error:", error);
            toast.error("Gagal mengambil data.");
        }
    } finally {
        loading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: SjHeader[]) => {
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
    if (!itemToLoad) return;

    loadingDetails.value.add(itemToLoad.Nomor);
    try {
        const response = await api.get(`/terima-sj/details/${itemToLoad.Nomor}`);
        details.value[itemToLoad.Nomor] = response.data;
    } catch {
        toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}`);
        expanded.value = expanded.value.filter(nomor => nomor !== itemToLoad.Nomor);
    } finally {
        loadingDetails.value.delete(itemToLoad.Nomor);
    }
};

const handleTerima = () => {
    if (!selectedRow.value) return;
    router.push({ name: 'TerimaSjCreate', params: { nomor: selectedRow.value.Nomor } });
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
    dialogConfirm.title = title;
    dialogConfirm.text = text;
    dialogConfirm.onConfirm = onConfirm;
    dialogConfirm.show = true;
};

const handleBatalTerima = async () => {
    if (!selectedRow.value) return;
    const { Nomor, NomorTerima } = selectedRow.value;

    showConfirmation(
        'Konfirmasi Pembatalan',
        `Yakin ingin membatalkan penerimaan untuk SJ ${Nomor}?`,
        async () => { // Fungsi onConfirm
            try {
                const response = await api.delete(`/terima-sj/${Nomor}/${NomorTerima}`);
                toast.success(response.data.message);
                fetchMasterData(); // Refresh data
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Gagal membatalkan penerimaan.");
            }
        }
    );
};

const onProductSelected = (product: { kode: string, nama: string }) => {
    filters.kodeBarang = product.kode;
    filters.namaBarang = product.nama;
    isMasterProductSearchVisible.value = false;
};

const getRowClass = (item: SjHeader) => {
    return !item.NomorTerima ? 'row-belum-diterima' : '';
};

const exportData = async (type: 'header' | 'detail') => {
    if (type === 'header') {
        if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');

        try {
            toast.info('Membuat file Excel Header...');
            const worksheet = XLSX.utils.json_to_sheet(masterData.value);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Terima SJ Header");
            XLSX.writeFile(workbook, "Export_Terima_SJ_Header.xlsx");
            toast.success('File Header berhasil dibuat.');
        } catch {
            toast.error('Gagal membuat file Excel.');
        }

    } else if (type === 'detail') {
        try {
            toast.info('Mengambil data detail dari server...');
            // Panggil endpoint baru, teruskan filter yang aktif
            const response = await api.get('/terima-sj/export-details', { params: filters });
            const details = response.data;

            if (details.length === 0) return toast.warning('Tidak ada data detail untuk diekspor pada filter ini.');

            toast.info('Membuat file Excel Detail...');
            const worksheet = XLSX.utils.json_to_sheet(details);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Terima SJ Detail");
            XLSX.writeFile(workbook, "Export_Terima_SJ_Detail.xlsx");
            toast.success('File Detail berhasil dibuat.');

        } catch {
            toast.error('Gagal mengekspor data detail.');
        }
    }
};

onMounted(() => {
    fetchCabangList();
    fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
    <PageLayout title="Terima SJ dari DC" icon="mdi-package-down">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleTerima"
                :disabled="!isSingleSelected || !!selectedRow?.NomorTerima">
                Terima
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" @click="handleBatalTerima"
                :disabled="!isSingleSelected || !selectedRow?.NomorTerima">
                Batal Terima
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
                <v-label class="filter-label">Tanggal SJ:</v-label>
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details
                    variant="outlined" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />

                <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama"
                    item-value="kode" density="compact" hide-details variant="outlined" class="ms-4"
                    style="max-width: 200px;" />

                <v-text-field v-model="filters.kodeBarang" placeholder="Kode Barang (F1)" density="compact" hide-details
                    clearable variant="outlined" style="max-width: 150px;" class="ms-4"
                    @keydown.f1.prevent="isMasterProductSearchVisible = true" />
                <v-text-field v-model="filters.namaBarang" placeholder="Nama Barang" density="compact" hide-details
                    readonly variant="outlined" style="max-width: 250px;" />

                <v-spacer />
                <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
                    :loading="loading" :item-class="getRowClass" item-value="Nomor" density="compact"
                    class="desktop-table" fixed-header show-select return-object show-expand
                    @update:expanded="loadDetails">
                    <template #[`item.Tanggal`]="{ item }">
                        {{ item.Tanggal ? format(parseISO(item.Tanggal), 'dd/MM/yyyy') : '' }}
                    </template>

                    <template #[`item.TglTerima`]="{ item }">
                        {{ item.TglTerima ? format(parseISO(item.TglTerima), 'dd/MM/yyyy') : '' }}
                    </template>

                    <template #[`item.Closing`]="{ item }">
                        <v-chip v-if="item.Closing === 'Y'" size="x-small" color="green" variant="tonal">
                            Closed
                        </v-chip>
                        <v-chip v-else size="x-small" color="grey" variant="tonal">
                            Open
                        </v-chip>
                    </template>
                    <template #expanded-row="{ columns, item }">
                        <tr>
                            <td :colspan="columns.length">
                                <div class="detail-container">
                                    <div class="detail-table-wrapper">
                                        <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">Memuat
                                            detail...</div>
                                        <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]"
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
        <MasterProductSearchModal v-if="isMasterProductSearchVisible" @close="isMasterProductSearchVisible = false"
            @product-selected="onProductSelected" />

        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
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
.row-belum-diterima {
    color: red !important;
    font-weight: 500;
}
</style>

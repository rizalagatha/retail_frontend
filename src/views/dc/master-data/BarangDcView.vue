<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import type { AxiosError } from 'axios';
import type { DataTableHeader } from 'vuetify'
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';

// --- Tipe Data ---
interface MasterItem {
    kode: string;
    nama: string;
    kategori: string;
    date_create: string;
    otomatis: string;
    adaStok: 'Y' | 'N';
    status: 'AKTIF' | 'PASIF';
}
interface DetailItem {
    ukuran: string;
    barcode: string;
    hargaJual: number;
    tglSpk: string | null;
    tglProduksi: string | null;
    minBufferStore: number;
    maxBufferStore: number;
    minBufferDC: number;
    maxBufferDC: number;
    hpp?: number; // hanya ada kalau cabang KDC
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '204';

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);

const filters = reactive({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    hargaNol: false,
    hppNol: false,
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

// --- Konfigurasi Tabel ---
const headers = [
    { title: 'Kode', key: 'kode', fixed: true, width: '180px' },
    { title: 'Nama Barang', key: 'nama', fixed: true },
    { title: 'Kategori', key: 'kategori', width: '120px' },
    { title: 'Tgl Buat', key: 'date_create' },
    { title: 'Otomatis', key: 'otomatis', align: 'center' },
    { title: 'Log Stok', key: 'adaStok', align: 'center' },
    { title: 'Status', key: 'status', align: 'center' },
] as const;

const detailHeaders = computed<DataTableHeader[]>(() => {
    const baseHeaders: DataTableHeader[] = [
        { title: 'Ukuran', key: 'ukuran' },
        { title: 'Barcode', key: 'barcode' },
        { title: 'Harga Jual', key: 'hargaJual', align: 'end' },
        { title: 'Tgl SPK', key: 'tglSpk' },
        { title: 'Tgl Produksi', key: 'tglProduksi' },
        { title: 'Min Store', key: 'minBufferStore', align: 'end' },
        { title: 'Max Store', key: 'maxBufferStore', align: 'end' },
        { title: 'Min DC', key: 'minBufferDC', align: 'end' },
        { title: 'Max DC', key: 'maxBufferDC', align: 'end' },
    ];

    if (authStore.user?.cabang === 'KDC') {
        baseHeaders.splice(2, 0, { title: 'HPP', key: 'hpp', align: 'end' });
    }

    return baseHeaders;
});


// --- Methods ---
const fetchMasterData = async () => {
    loading.value = true;
    selected.value = [];
    expanded.value = [];
    try {
        const response = await api.get('/barang-dc', { params: filters });
        masterData.value = response.data;
    } catch (error) {
        const err = error as AxiosError<{ message?: string }>;
        const msg = err.response?.data?.message || err.message || 'Gagal mengambil data.';
        toast.error(msg);
    } finally {
        loading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.kode] && !loadingDetails.value.has(item.kode));
    if (!itemToLoad) return;
    const kodeToLoad = itemToLoad.kode;

    loadingDetails.value.add(kodeToLoad);
    try {
        const response = await api.get(`/barang-dc/details/${kodeToLoad}`);
        details.value[kodeToLoad] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${kodeToLoad}`, error);
    } finally {
        loadingDetails.value.delete(kodeToLoad);
    }
};

const handleNew = () => {
    router.push({ name: 'BarangDcCreate' });
};

const handleEdit = () => {
    // Pastikan ada satu baris yang dipilih sebelum navigasi
    if (!isSingleSelected.value) return;

    router.push({
        name: 'BarangDcEdit',
        params: { kode: selectedRow.value.kode }
    });
};

const getRowTextColor = (item: MasterItem) => {
    if (item.status === 'PASIF') return 'text-red';
    if (item.adaStok === 'N') return 'text-blue';
    return '';
};

const exportData = async (type: 'header' | 'detail') => {
    if (type === 'header') {
        if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
        const worksheet = XLSX.utils.json_to_sheet(masterData.value);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Barang DC Header");
        XLSX.writeFile(workbook, "Export_BarangDC_Header.xlsx");
    } else if (type === 'detail') {
        try {
            const response = await api.get('/barang-dc/export-details', { params: filters });
            if (response.data.length === 0) return toast.warning('Tidak ada data detail.');

            const worksheet = XLSX.utils.json_to_sheet(response.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Barang DC Detail");
            XLSX.writeFile(workbook, "Export_BarangDC_Detail.xlsx");
        } catch (error) {
            toast.error('Gagal mengekspor data detail.', error);
        }
    }
};

onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
    <PageLayout title="Browse Barang DC" icon="mdi-package-variant-closed">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleNew">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" @click="handleEdit"
                :disabled="!isSingleSelected">Ubah</v-btn>
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
        </template>

        <div class="browse-content">
            <div class="filter-section">
                <v-label class="filter-label">Tgl Buat:</v-label>
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
                    style="max-width: 180px;" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
                    style="max-width: 180px;" />

                <v-checkbox v-model="filters.hargaNol" label="Harga Nol Saja" hide-details density="compact"
                    class="ms-4" />
                <v-checkbox v-model="filters.hppNol" label="HPP Nol Saja" hide-details density="compact" class="ms-2" />

                <v-spacer />
                <div class="d-flex align-center ga-2 text-caption">
                    <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Pasif
                    <v-icon color="blue" icon="mdi-square-rounded" size="small" class="ms-2"></v-icon> Tidak Ada Stok
                </div>
                <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
                    :loading="loading" class="desktop-table" density="compact" fixed-header item-value="kode"
                    show-expand show-select :return-object="true" single-select @update:expanded="loadDetails">
                    <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
                        <td :class="getRowTextColor(item)">
                            <template v-if="header.key === 'date_create'">
                                {{ item.date_create ? format(parseISO(item.date_create), 'dd/MM/yyyy') : '' }}
                            </template>
                            <template v-else-if="header.key === 'status'">
                                <v-chip :color="item.status === 'AKTIF' ? 'success' : 'error'" size="x-small"
                                    variant="tonal">
                                    {{ item.status }}
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
                                <div class="detail-container pa-2">
                                    <div class="detail-table-wrapper">
                                        <div v-if="loadingDetails.has(item.kode)" class="text-center pa-4">Memuat
                                            detail...
                                        </div>
                                        <v-data-table v-else :headers="detailHeaders" :items="details[item.kode]"
                                            density="compact" class="detail-table" :items-per-page="-1">
                                            <template #[`item.tglSpk`]="{ item }">
                                                {{ item.tglSpk ? format(parseISO(item.tglSpk), 'dd/MM/yyyy') : '' }}
                                            </template>
                                            <template #[`item.tglProduksi`]="{ item }">
                                                {{ item.tglProduksi ? format(parseISO(item.tglProduksi), 'dd/MM/yyyy') : '' }}
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
    </PageLayout>
</template>

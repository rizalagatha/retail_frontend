<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MasterProductSearchModal from '@/components/MasterProductSearchModal.vue';
import * as XLSX from 'xlsx';

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '47';

// --- Tipe Data ---
interface MasterItem {
    nomor: string;
    tanggal: string;
    nomorTerima: string | null;
    tglTerima: string | null;
    dariStore: string;
    keterangan: string;
    closing: 'Y' | 'N';
}

// --- State ---
const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, any[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<any[]>([]);
const expanded = ref<any[]>([]);
const cabangList = ref([]);
const searchItemName = ref('');
const isMasterProductSearchVisible = ref(false);

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
    itemCode: '',
});

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canTerima = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima);
const canBatalTerima = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTerima && selectedRow.value?.closing !== 'Y');
const canEditOrPrint = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTerima);

// --- Konfigurasi Tabel ---
const headers = [
    { title: 'Nomor Kirim', key: 'nomor', minWidth: '180px' },
    { title: 'Tgl Kirim', key: 'tanggal', minWidth: '120px' },
    { title: 'Nomor Terima', key: 'nomorTerima', minWidth: '180px' },
    { title: 'Tgl Terima', key: 'tglTerima', minWidth: '120px' },
    { title: 'Dari Store', key: 'dariStore', minWidth: '200px' },
    { title: 'Keterangan', key: 'keterangan' },
    { title: 'Closing', key: 'closing', align: 'center' },
] as const;
const detailHeaders = [
    { title: 'Kode', key: 'kode', width: '150px' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran', width: '100px' },
    { title: 'Jumlah', key: 'jumlah', width: '100px', align: 'end' },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/mutasi-kirim/lookup/cabang'); // Menggunakan lookup cabang yang sama
        cabangList.value = response.data;
        if (!filters.cabang && cabangList.value.length > 0) {
            filters.cabang = cabangList.value[0].kode;
        }
    } catch (error) { toast.error('Gagal memuat daftar cabang.'); }
};

const fetchMasterData = async () => {
    if (!filters.cabang) return;
    loading.value = true;
    selected.value = [];
    expanded.value = [];
    details.value = {};
    try {
        const response = await api.get('/mutasi-terima', { params: filters });
        masterData.value = response.data;
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal mengambil data.');
    } finally {
        loading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
    // PERBAIKAN: v-data-table mengirim array berisi objek itemnya langsung
    const itemToLoad = newlyExpandedItems.find(item => {
        // Langsung akses 'item.nomor'
        return !details.value[item.nomor] && !loadingDetails.value.has(item.nomor);
    });

    if (!itemToLoad) return;

    const nomorToLoad = itemToLoad.nomor;

    loadingDetails.value.add(nomorToLoad);
    try {
        const response = await api.get(`/mutasi-terima/details/${nomorToLoad}`);
        details.value[nomorToLoad] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
        const index = expanded.value.findIndex(item => item.nomor === nomorToLoad);
        if (index > -1) {
            expanded.value.splice(index, 1);
        }
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
    router.push({ name: 'MutasiTerimaCreate', query: { nomorKirim: selectedRow.value.nomor } });
};

const handleBatalTerima = () => {
    if (!canBatalTerima.value) return;
    showConfirmation(
        'Konfirmasi Batal Terima',
        `Yakin ingin membatalkan penerimaan untuk dokumen kirim ${selectedRow.value.nomor}? Stok akan dikembalikan.`,
        async () => {
            try {
                const response = await api.delete(`/mutasi-terima/${selectedRow.value.nomor}`);
                toast.success(response.data.message);
                fetchMasterData();
            } catch (error: any) {
                toast.error(error.response?.data?.message || 'Gagal membatalkan penerimaan.');
            }
        }
    );
};

const getRowTextColor = (item: any) => {
    if (!item.nomorTerima) return 'text-red font-weight-bold';
    return '';
};

const openMasterProductSearch = () => { isMasterProductSearchVisible.value = true; };

const onMasterProductSelected = (product: { kode: string; nama: string; }) => {
    isMasterProductSearchVisible.value = false;
    if (product) {
        filters.itemCode = product.kode;
        searchItemName.value = product.nama;
    }
};

const exportData = async (type: 'header' | 'detail') => {
    toast.info(`Fungsi export ${type} belum dibuat.`);
};

onMounted(async () => {
    await fetchCabangList();
    fetchMasterData();
});

watch(filters, () => {
    if (!filters.itemCode) searchItemName.value = '';
    fetchMasterData();
}, { deep: true });

</script>

<template>
    <PageLayout title="Mutasi Antar Store Terima" icon="mdi-package-variant">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleTerima"
                :disabled="!canTerima">
                Terima
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" @click="handleBatalTerima"
                :disabled="!canBatalTerima">
                Batal Terima
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
                <v-label class="filter-label">Tgl Kirim:</v-label>
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details
                    variant="outlined" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
                <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama"
                    item-value="kode" density="compact" hide-details variant="outlined" class="ms-4"
                    style="max-width: 200px;" />
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
                                        <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">Memuat
                                            detail...
                                        </div>
                                        <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]"
                                            density="compact" class="detail-table" :items-per-page="-1">
                                            <template #item.jumlah="{ item }">
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

        <MasterProductSearchModal v-if="isMasterProductSearchVisible" :gudang="filters.cabang"
            @close="isMasterProductSearchVisible = false" @product-selected="onMasterProductSelected" />

        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal"
                        @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya,
                        Lanjutkan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>
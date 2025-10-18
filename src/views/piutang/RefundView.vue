<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO, isValid } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import PrintOptionModal from '@/components/PrintOptionModal.vue';
import * as XLSX from 'xlsx';


interface RefundHeader {
    Nomor: string;
    Tanggal: string;
    User: string;
    Status: 'PROSES' | 'APPROVE' | '';
    Appvoved: string | null;
    TglApvove: string | null;
    Clossing: string | null;
}

interface RefundDetail {
    no: number;
    iddrec: string;
    nomor: string;
    tanggal: string;
    kdcus: string;
    customer: string;
    nominal: number;
    refund: number;
    apv: boolean;
    ket: string;
    bank: string;
    norek: string;
    atasnama: string;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '54';

const masterData = ref<RefundHeader[]>([]);
const details = ref<Record<string, RefundDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<RefundHeader[]>([]);
const expanded = ref<string[]>([]); // Ganti tipe menjadi string[]
const isPrintOptionVisible = ref(false);

const filters = reactive({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
});

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<RefundHeader | null>(() =>
    isSingleSelected.value ? selected.value[0] : null
);

// --- Formatter & Konfigurasi Tabel ---
const formatRupiah = (value: number | undefined): string => {
    if (value === undefined || value === null) return '0';
    return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value);
};

const formatTanggal = (dateString: string | undefined | null) => {
    if (!dateString) return '';
    const date = parseISO(dateString);
    return isValid(date) ? format(date, 'dd/MM/yyyy') : '';
};

// Pastikan header ekspansi ditempatkan di posisi yang diinginkan
const headers = [
    { title: 'Nomor', key: 'Nomor', minWidth: '180px', fixed: true },
    { title: 'Tanggal', key: 'Tanggal', minWidth: '120px' },
    { title: 'User', key: 'User', minWidth: '100px' },
    { title: 'Status', key: 'Status', minWidth: '100px' },
    { title: 'Appvoved', key: 'Appvoved', minWidth: '100px' },
    { title: 'Tgl Apvove', key: 'TglApvove', minWidth: '120px' },
    { title: 'Clossing', key: 'Clossing', minWidth: '120px' },
    { title: '', key: 'data-table-expand', fixed: true, sortable: false },
] as const;

const detailHeaders = [
    { title: 'No.', key: 'no' },
    { title: 'Nomor Transaksi', key: 'nomor', minWidth: '150px' },
    { title: 'Pelanggan', key: 'customer', minWidth: '200px' },
    { title: 'Nominal Transaksi', key: 'nominal', align: 'end' },
    { title: 'Nominal Refund', key: 'refund', align: 'end' },
    { title: 'Bank', key: 'bank', minWidth: '120px' },
    { title: 'No. Rekening', key: 'norek', minWidth: '150px' },
    { title: 'Atas Nama', key: 'atasnama', minWidth: '150px' },
    { title: 'Keterangan', key: 'ket', minWidth: '200px' },
] as const;

// --- Methods ---
const fetchMasterData = async () => {
    loading.value = true;
    selected.value = [];
    expanded.value = [];
    details.value = {};

    try {
        const response = await api.get<RefundHeader[]>('/refund/master', { params: filters });
        masterData.value = response.data;
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal mengambil data.');
    } finally {
        loading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: any[]) => { // Menggunakan 'any[]' untuk mengakomodasi struktur yang fleksibel
    const itemToLoad = newlyExpandedItems.find(item =>
        !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
    );
    if (!itemToLoad) return;

    loadingDetails.value.add(itemToLoad.Nomor);
    try {
        const response = await api.get<RefundDetail[]>(`/refund/details/${itemToLoad.Nomor}`);
        details.value[itemToLoad.Nomor] = response.data.map((d, index) => ({ ...d, no: index + 1 }));
    } catch (error: any) {
        toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}.`);
    } finally {
        loadingDetails.value.delete(itemToLoad.Nomor);
    }
};

const getRowTextColor = (item: RefundHeader) => {
    return item.Status === 'APPROVE' ? 'text-success' : 'text-orange-darken-3';
};

const handleNew = () => {
    // Navigasi ke halaman buat baru
    router.push({ name: 'refundCreate' }); 
};

const handleEdit = () => {
    if (!selectedRow.value) return;
    router.push({ name: 'RefundEdit', params: { nomor: selectedRow.value.Nomor } });
};

const handlePrintSelection = (type: 'a4' | 'kasir' | 'wa') => {
    if (!selectedRow.value) return;
    isPrintOptionVisible.value = false;
    
    const nomor = selectedRow.value.Nomor;
    const url = router.resolve({ name: 'RefundPrint', params: { nomor } }).href;
    window.open(url, '_blank');
};

const exportData = async () => {
    const fileName = `Export_Refund_Header.xlsx`;
    try {
        if (masterData.value.length === 0) return toast.warning('Tidak ada data untuk diekspor.');
        
        const worksheet = XLSX.utils.json_to_sheet(masterData.value);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Refund Header");
        XLSX.writeFile(workbook, fileName);
        toast.success(`Data berhasil diekspor.`);
    } catch (error) {
        toast.error(`Gagal mengekspor data.`);
        console.error(error);
    }
};

onMounted(() => {
    fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
    <PageLayout title="Daftar Return" icon="mdi-account-cash">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleNew">
                Baru
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" @click="handleEdit">
                Ubah
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
                prepend-icon="mdi-printer" @click="isPrintOptionVisible = true">
                Cetak
            </v-btn>
            <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportData" :disabled="loading || masterData.length === 0">
                Export
            </v-btn>
        </template>

        <div class="browse-content">
            <div class="filter-section">
                <v-label class="filter-label">Periode:</v-label>
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
                <v-spacer />
                <div class="d-flex align-center ga-2 text-caption">
                    <v-icon color="orange-darken-3" icon="mdi-square-rounded" size="small"></v-icon> Proses
                    <v-icon color="success" icon="mdi-square-rounded" size="small"></v-icon> Approve
                </div>
                <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
                    :loading="loading" item-value="Nomor" density="compact" class="desktop-table" fixed-header
                    show-select return-object @update:expanded="loadDetails">
                    <template #item.Tanggal="{ item }">
                        <span :class="getRowTextColor(item)">{{ formatTanggal(item.Tanggal) }}</span>
                    </template>
                    <template #item.Nominal="{ item }">
                        <span class="d-block text-right" :class="getRowTextColor(item)">{{ formatRupiah(item.Nominal) }}</span>
                    </template>
                    <template #item.Status="{ item }">
                        <v-chip :color="item.Status === 'APPROVE' ? 'success' : 'orange-darken-3'" size="x-small">
                            {{ item.Status || 'PROSES' }}
                        </v-chip>
                    </template>

                    <template #expanded-row="{ columns, item }">
                        <tr>
                            <td :colspan="columns.length">
                                <div class="detail-container">
                                    <div class="detail-table-wrapper">
                                        <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">Memuat detail...</div>
                                        <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor] || []"
                                            density="compact" class="detail-table" :items-per-page="-1">
                                            <template #item.nominal="{ item }">
                                                <span class="d-block text-right">{{ formatRupiah(item.nominal) }}</span>
                                            </template>
                                            <template #item.refund="{ item }">
                                                <span class="d-block text-right">{{ formatRupiah(item.refund) }}</span>
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
        
        <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4']"
            @close="isPrintOptionVisible = false" @select="handlePrintSelection" />
    </PageLayout>
</template>
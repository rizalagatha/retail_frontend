<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '51';

// --- Tipe Data ---
interface SetoranHeader {
    Nomor: string;
    Otomatis: string;
    Sisa: number;
    [key: string]: any;
}

// --- State ---
const masterData = ref<SetoranHeader[]>([]);
const details = ref<Record<string, any[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<SetoranHeader[]>([]);
const expanded = ref<SetoranHeader[]>([]);
const cabangList = ref([]);

const filters = reactive({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    cabang: authStore.user?.cabang || '',
});

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);
const canBeEdited = computed(() => {
    // Tombol Ubah aktif jika:
    // 1. Hanya satu baris yang dipilih
    if (selected.value.length !== 1) return false;

    const item = selected.value[0];

    // 2. Setoran tersebut BUKAN Otomatis
    return item.Otomatis !== 'YA';
});
const canBeDeleted = computed(() => {
    // Tombol Hapus aktif jika:
    // 1. Hanya satu baris yang dipilih
    if (selected.value.length !== 1) return false;

    const item = selected.value[0];

    // 2. Setoran tersebut BUKAN Otomatis
    // 3. Setoran belum di-link ke SO (sesuai logika Delphi 'sh_so_nomor')
    // 4. Setoran belum di-Closing
    return item.Otomatis !== 'YA' && !item.NoSO && item.Closing !== 'Y';
});

// --- Konfigurasi Tabel ---
const headers = [
    { title: 'Nomor', key: 'Nomor', width: '180px' },
    { title: 'Tanggal', key: 'Tanggal', width: '120px' },
    { title: 'Jenis Bayar', key: 'JenisBayar', width: '120px' },
    { title: 'Nominal', key: 'Nominal', align: 'end', width: '150px' },
    { title: 'Dibayarkan', key: 'diBayarkan', align: 'end', width: '150px' },
    { title: 'Sisa', key: 'Sisa', align: 'end', width: '150px' },
    { title: 'Posting', key: 'Posting', align: 'center', width: '100px' },
    { title: 'No SO', key: 'NoSO', width: '180px' },
    { title: 'Kd Cus', key: 'KdCus', width: '120px' },
    { title: 'Customer', key: 'Customer', minWidth: '250px' },
    { title: 'Alamat', key: 'Alamat', minWidth: '350px' },
    { title: 'Kota', key: 'Kota', width: '150px' },
    { title: 'Telepon', key: 'Telepon', width: '150px' },
    { title: 'Akun', key: 'Akun', width: '120px' },
    { title: 'No Rekening', key: 'NoRekening', width: '150px' },
    { title: 'Nama Bank', key: 'NamaBank', width: '150px' },
    { title: 'Tgl Transfer', key: 'TglTransfer', width: '120px' },
    { title: 'No Giro', key: 'NoGiro', width: '150px' },
    { title: 'Tgl Giro', key: 'TglGiro', width: '120px' },
    { title: 'Jatuh Tempo', key: 'TglJatuhTempo', width: '120px' },
    { title: 'Keterangan', key: 'Keterangan', minWidth: '300px' },
    { title: 'Otomatis', key: 'Otomatis', align: 'center', width: '100px' },
    { title: 'Closing', key: 'Closing', align: 'center', width: '100px' },
];
const detailHeaders = [
    { title: 'Tgl Bayar', key: 'TglBayar' },
    { title: 'Invoice', key: 'Invoice' },
    { title: 'Tgl Invoice', key: 'TglInvoice' },
    { title: 'Jatuh Tempo', key: 'JatuhTempo' },
    { title: 'Nominal', key: 'Nominal', align: 'end' },
    { title: 'Bayar', key: 'Bayar', align: 'end' },
    { title: 'Keterangan', key: 'Keterangan' },
];

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/setoran-bayar/lookup/cabang');
        cabangList.value = response.data;
    } catch (error) { toast.error('Gagal memuat daftar cabang.'); }
};

const fetchMasterData = async () => {
    loading.value = true;
    try {
        const response = await api.get('/setoran-bayar', { params: filters });
        masterData.value = response.data;
        selected.value = [];
        expanded.value = [];
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal mengambil data.');
    } finally {
        loading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: SetoranHeader[]) => {
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
    if (!itemToLoad) return;

    loadingDetails.value.add(itemToLoad.Nomor);
    try {
        const response = await api.get(`/setoran-bayar/details/${itemToLoad.Nomor}`);
        details.value[itemToLoad.Nomor] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}`);
        expanded.value = expanded.value.filter(i => i.Nomor !== itemToLoad.Nomor);
    } finally {
        loadingDetails.value.delete(itemToLoad.Nomor);
    }
};

const handleDelete = () => {
    if (!selectedRow.value) return;
    if (confirm(`Yakin ingin menghapus Setoran nomor ${selectedRow.value.Nomor}?`)) {
        api.delete(`/setoran-bayar/${selectedRow.value.Nomor}`)
            .then(response => {
                toast.success(response.data.message);
                fetchMasterData();
            })
            .catch(error => {
                toast.error(error.response?.data?.message || 'Gagal menghapus data.');
            });
    }
};

const exportData = async (type: 'header' | 'detail') => {
    if (type === 'header') {
        if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
        const worksheet = XLSX.utils.json_to_sheet(masterData.value);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Setoran Header");
        XLSX.writeFile(workbook, "Export_Setoran_Header.xlsx");
    } else if (type === 'detail') {
        try {
            const response = await api.get('/setoran-bayar/export-details', { params: filters });
            if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
            const worksheet = XLSX.utils.json_to_sheet(response.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Setoran Detail");
            XLSX.writeFile(workbook, "Export_Setoran_Detail.xlsx");
        } catch (error) {
            toast.error('Gagal mengekspor data detail.');
        }
    }
};


const formatRupiah = (value: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);
};

const getRowTextColor = (item: SetoranHeader) => {
    // Prioritas utama adalah Sisa (warna merah)
    if (item.Sisa !== 0) {
        return 'text-red font-weight-bold';
    }
    // Jika lunas, baru cek apakah Otomatis (warna biru)
    if (item.Otomatis === 'YA') {
        return 'text-blue font-weight-bold';
    }
    return ''; // Warna default
};

const printData = () => {
    if (!isSingleSelected.value) return;
    const nomor = selected.value[0].Nomor;
    const url = router.resolve({ name: 'CetakSetoranBayar', params: { nomor } }).href;
    window.open(url, '_blank');
};

onMounted(() => {
    fetchCabangList();
    fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
    <PageLayout title="Browse Setoran Pembayaran" icon="mdi-cash-multiple">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary"
                @click="router.push({ name: 'SetoranBayarCreate' })">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!canBeEdited" prepend-icon="mdi-pencil"
                @click="router.push({ name: 'SetoranBayarEdit', params: { nomor: selected[0].Nomor } })">
                Ubah
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!canBeDeleted"
                prepend-icon="mdi-delete" @click="handleDelete">
                Hapus
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
                @click="printData" prepend-icon="mdi-printer">
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
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details
                    variant="outlined" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
                <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama"
                    item-value="kode" density="compact" hide-details variant="outlined" class="ms-4"
                    style="max-width: 200px;" />
                <v-spacer />
                <div class="d-flex align-center ga-2 text-caption">
                    <v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> Otomatis
                    <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Lunas
                </div>
                <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
                    :loading="loading" item-value="Nomor" density="compact" class="desktop-table" fixed-header
                    show-select return-object show-expand @update:expanded="loadDetails">
                    <template v-for="header in headers" #[`item.${header.key}`]="{ item }">
                        <td :class="getRowTextColor(item)">
                            <template
                                v-if="['Tanggal', 'TglTerima', 'TglTransfer', 'TglGiro', 'TglJatuhTempo'].includes(header.key)">
                                {{ item[header.key] ? format(parseISO(item[header.key]), 'dd/MM/yyyy') : '' }}
                            </template>
                            <template v-else-if="['Nominal', 'diBayarkan', 'Sisa'].includes(header.key)">
                                {{ formatRupiah(item[header.key]) }}
                            </template>
                            <template v-else-if="header.key === 'Posting'">
                                <v-chip size="x-small" :color="item.Posting === 'SUDAH' ? 'green' : 'grey'">{{
                                    item.Posting }}</v-chip>
                            </template>
                            <template v-else-if="header.key === 'Otomatis'">
                                <v-chip v-if="item.Otomatis === 'YA'" size="x-small" color="blue-darken-2"
                                    variant="tonal">YA</v-chip>
                            </template>
                            <template v-else-if="header.key === 'Closing'">
                                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success"
                                    variant="tonal">YA</v-chip>
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
                                        <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">Memuat
                                            detail...</div>
                                        <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]"
                                            density="compact" class="detail-table" :items-per-page="-1">
                                            <template #item.TglBayar="{ value }">{{ value ? format(parseISO(value),
                                                'dd/MM/yyyy') : '' }}</template>
                                            <template #item.TglInvoice="{ value }">{{ value ? format(parseISO(value),
                                                'dd/MM/yyyy') : '' }}</template>
                                            <template #item.Nominal="{ value }">{{ formatRupiah(value) }}</template>
                                            <template #item.Bayar="{ value }">{{ formatRupiah(value) }}</template>
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

<style scoped>
:deep(.row-otomatis) {
    color: blue !important;
}

:deep(.row-sisa) {
    color: red !important;
}
</style>

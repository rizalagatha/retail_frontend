<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import PrintOptionModal from '@/components/PrintOptionModal.vue';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '27';

// --- State ---
const masterData = ref<any[]>([]);
const details = ref<Record<string, any[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<any[]>([]);
const expanded = ref<any[]>([]);
const cabangList = ref([]);

const filters = reactive({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    cabang: authStore.user?.cabang === 'KDC' ? 'K01' : authStore.user?.cabang || '',
});

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);
const isPrintOptionVisible = ref(false);

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

// --- Konfigurasi Tabel ---
const headers = [
    { title: 'Nomor', key: 'Nomor', minWidth: '180px', fixed: true },
    { title: 'Tanggal', key: 'Tanggal', minWidth: '120px' },
    { title: 'Posting', key: 'Posting', minWidth: '100px' },
    { title: 'No. SO', key: 'NomorSO', minWidth: '180px' },
    { title: 'Tgl SO', key: 'TglSO', minWidth: '120px' },
    { title: 'TOP', key: 'Top', minWidth: '70px' },
    { title: 'Jatuh Tempo', key: 'Tempo', minWidth: '120px' },
    { title: 'Last Payment', key: 'LastPayment', minWidth: '120px' },
    { title: 'Diskon', key: 'Diskon', minWidth: '120px' },
    { title: 'DP', key: 'Dp', minWidth: '120px' },
    { title: 'Biaya Kirim', key: 'Biayakirim', minWidth: '120px' },
    { title: 'Nominal', key: 'Nominal', minWidth: '150px' },
    { title: 'Piutang', key: 'Piutang', minWidth: '150px' },
    { title: 'Bayar', key: 'Bayar', minWidth: '150px' },
    { title: 'Sisa Piutang', key: 'SisaPiutang', minWidth: '150px' },
    { title: 'Rp Retur', key: 'RpRetur', minWidth: '120px' },
    { title: 'Kd Cus', key: 'Kdcus', minWidth: '120px' },
    { title: 'Customer', key: 'Nama', minWidth: '250px' },
    { title: 'Alamat', key: 'Alamat', minWidth: '350px' },
    { title: 'Kota', key: 'Kota', minWidth: '150px' },
    { title: 'Telepon', key: 'Telp', minWidth: '150px' },
    { title: 'Level', key: 'Level', minWidth: '150px' },
    { title: 'HP', key: 'Hp', minWidth: '150px' },
    { title: 'Nama Member', key: 'Member', minWidth: '250px' },
    { title: 'Keterangan', key: 'Keterangan', minWidth: '250px' },
    { title: 'Rp Tunai', key: 'RpTunai', minWidth: '120px' },
    { title: 'No Voucher', key: 'NoVoucher', minWidth: '150px' },
    { title: 'Rp Voucher', key: 'RpVoucher', minWidth: '120px' },
    { title: 'Rp Transfer', key: 'RpTransfer', minWidth: '120px' },
    { title: 'No Setoran', key: 'NoSetoran', minWidth: '180px' },
    { title: 'Tgl Transfer', key: 'TglTransfer', minWidth: '120px' },
    { title: 'Akun', key: 'Akun', minWidth: '120px' },
    { title: 'No Rekening', key: 'NoRekening', minWidth: '150px' },
    { title: 'No Retur', key: 'NoRetur', minWidth: '180px' },
    { title: 'SC', key: 'SC', minWidth: '150px' },
    { title: 'Created', key: 'Created', minWidth: '180px' },
    { title: 'Prn', key: 'Prn', align: 'center' },
    { title: 'Puas', key: 'Puas', align: 'center' },
    { title: 'Closing', key: 'Closing', align: 'center' },
] as const;

const detailHeaders = [
    { title: 'Kode', key: 'Kode' },
    { title: 'Barcode', key: 'Barcode' },
    { title: 'Nama Barang', key: 'Nama', minWidth: '300px' },
    { title: 'Ukuran', key: 'Ukuran' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end' },
    { title: 'Harga', key: 'Harga', align: 'end' },
    { title: 'Dis %', key: 'Dis%', align: 'end' },
    { title: 'Total', key: 'Total', align: 'end' },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/invoices/lookup/cabang');
        cabangList.value = response.data;
    } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchMasterData = async () => {
    loading.value = true;
    try {
        const response = await api.get('/invoices', { params: filters });
        masterData.value = response.data;
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal mengambil data.');
    } finally {
        loading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: any[]) => {
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
    if (!itemToLoad) return;

    loadingDetails.value.add(itemToLoad.Nomor);
    try {
        const response = await api.get(`/invoices/details/${itemToLoad.Nomor}`);
        details.value[itemToLoad.Nomor] = response.data;
    } catch (error) { toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}`, error); }
    finally { loadingDetails.value.delete(itemToLoad.Nomor); }
};

// const handleDelete = () => {
//     if (!selectedRow.value) return;
//     if (confirm(`Yakin ingin menghapus Invoice nomor ${selectedRow.value.Nomor}?`)) {
//         api.delete(`/invoices/${selectedRow.value.Nomor}`)
//             .then(response => {
//                 toast.success(response.data.message);
//                 fetchMasterData();
//             })
//             .catch(error => {
//                 toast.error(error.response?.data?.message || 'Gagal menghapus data.');
//             });
//     }
// };

const getRowTextColor = (item: any) => {
    if (item.SisaPiutang > 0) return 'text-red font-weight-bold';
    return '';
};

const handleNew = () => {
    router.push({ name: 'InvoiceCreate' });
}

const handleEdit = () => {
    if (!isSingleSelected.value) return;
    const nomor = selected.value[0].Nomor;
    router.push({ name: 'InvoiceEdit', params: { nomor } });
};

const printData = (type: 'invoice' | 'sj') => {
    if (!isSingleSelected.value) return;

    const item = selected.value[0];
    let routeName = '';

    if (type === 'invoice') {
        routeName = 'InvoicePrint'; // Nama route untuk cetak Invoice A4
    } else if (type === 'sj') {
        routeName = 'CetakInvoiceAsSJ';
    }

    const url = router.resolve({
        name: routeName,
        params: { nomor: item.Nomor }
    }).href;

    window.open(url, '_blank');
};

const openPrintOptions = () => {
    if (!isSingleSelected.value) return;
    isPrintOptionVisible.value = true;
};

const formatHpToWa = (hp: string) => {
    if (!hp) return '';
    let sanitizedHp = hp.replace(/[^0-9]/g, ''); // Hapus semua selain angka
    if (sanitizedHp.startsWith('0')) {
        sanitizedHp = '62' + sanitizedHp.substring(1); // Ganti 0 di depan dengan 62
    }
    return sanitizedHp;
};

const handlePrintSelection = async (type: 'a4' | 'kasir' | 'wa') => {
    // Sesuaikan cara mengambil 'nomor' dan 'item' berdasarkan file
    const nomor = selectedRow.value?.Nomor;
    const item = selectedRow.value;

    if (!nomor) return;
    if (typeof isPrintOptionVisible.value !== 'undefined') isPrintOptionVisible.value = false;

    if (type === 'a4' || type === 'kasir') {
        const routeName = type === 'a4' ? 'InvoicePrint' : 'InvoicePrintKasir';
        const url = router.resolve({ name: routeName, params: { nomor } }).href;
        window.open(url, '_blank');

    } else if (type === 'wa') {
        const memberHp = item.Hp || item.memberHp;
        if (!memberHp) {
            return toast.error('No. HP Member tidak ada, tidak bisa kirim via WA.');
        }

        try {
            toast.info(`Mengirim struk ke ${memberHp}...`);
            const response = await api.post('/whatsapp/send-receipt', {
                nomor: nomor,
                hp: formatHpToWa(memberHp) // Pastikan fungsi formatHpToWa ada
            });
            toast.success(response.data.message);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Gagal mengirim struk via WhatsApp.');
        }
    }
};

const exportData = async (type: 'header' | 'detail') => {
    if (type === 'header') {
        if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
        const worksheet = XLSX.utils.json_to_sheet(masterData.value);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Invoice Header");
        XLSX.writeFile(workbook, "Export_Invoice_Header.xlsx");
    } else if (type === 'detail') {
        try {
            const response = await api.get('/invoices/export-details', { params: filters });
            if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
            const worksheet = XLSX.utils.json_to_sheet(response.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Invoice Detail");
            XLSX.writeFile(workbook, "Export_Invoice_Detail.xlsx");
        } catch (error) {
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
    <PageLayout title="Invoice" icon="mdi-receipt-text">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleNew">
                Baru
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" @click="handleEdit">
                Ubah
            </v-btn>
            <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
                @click="handleDelete">Hapus</v-btn> -->
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
                prepend-icon="mdi-printer" @click="openPrintOptions">
                Cetak
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="cyan" :disabled="!isSingleSelected"
                prepend-icon="mdi-truck-delivery-outline" @click="printData('sj')">
                Cetak SJ
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
                                v-if="['Tanggal', 'TglSO', 'TglSJ', 'LastPayment', 'TglTransfer', 'Created'].includes(header.key)">
                                {{ item[header.key] ? format(parseISO(item[header.key]), 'dd/MM/yyyy') : '' }}
                            </template>

                            <template
                                v-else-if="['Dis%', 'Diskon', 'Dp', 'Biayakirim', 'Nominal', 'Piutang', 'Bayar', 'SisaPiutang', 'RpVoucher', 'RpTransfer', 'RpRetur', 'RpTunai'].includes(header.key)">
                                {{ formatRupiah(item[header.key]) }}
                            </template>

                            <template v-else-if="header.key === 'Posting'">
                                <v-chip size="x-small" :color="item.Posting === 'SUDAH' ? 'green' : 'grey'">{{
                                    item.Posting }}</v-chip>
                            </template>

                            <template v-else-if="header.key === 'Closing'">
                                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success">YA</v-chip>
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
                                            <template #[`item.Harga`]="{ value }">
                                                {{ formatRupiah(value) }}
                                            </template>
                                            <template #[`item.Total`]="{ value }">
                                                {{ formatRupiah(value) }}
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
        <PrintOptionModal v-if="isPrintOptionVisible" @close="isPrintOptionVisible = false"
            @select="handlePrintSelection" />
    </PageLayout>
</template>

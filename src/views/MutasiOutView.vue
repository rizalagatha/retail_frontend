<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '43'; // Sesuai koreksi Anda

// --- Interfaces ---
interface MutasiHeader {
    Nomor: string;
    Tanggal: string;
    Status: string;
    [key: string]: unknown;
}
interface MutasiDetail {
    Kode: string;
    Nama: string;
    Ukuran: string;
    QtyOut: number;
    QtyIn: number;
}

// --- State ---
const list = ref<MutasiHeader[]>([]);
const details = ref<{ [key: string]: MutasiDetail[] }>({});
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const selected = ref<MutasiHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);

const headers = [
    { title: 'Nomor', key: 'Nomor', width: '200px' },
    { title: 'Tanggal', key: 'Tanggal', width: '120px' },
    { title: 'No. SO', key: 'NoSO', width: '200px' },
    { title: 'Ke Cabang', key: 'KeCab' },
    { title: 'Qty Out', key: 'QtyOut', align: 'end' },
    { title: 'Qty In', key: 'QtyIn', align: 'end' },
    { title: 'Status', key: 'Status', align: 'center' },
    { title: 'Keterangan', key: 'Keterangan', width: '300px' },
    { title: 'User', key: 'Usr' },
] as const;

const detailHeaders = [
    { title: 'Kode', key: 'Kode' },
    { title: 'Nama Barang', key: 'Nama' },
    { title: 'Ukuran', key: 'Ukuran' },
    { title: 'Qty Out', key: 'QtyOut', align: 'end' },
    { title: 'Qty In', key: 'QtyIn', align: 'end' },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/mutasi-out/lookup/cabang');
        cabangList.value = response.data;
        if (authStore.user?.cabang === 'KDC' && cabangList.value.length > 0) {
            selectedCabang.value = cabangList.value[0].kode;
        }
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.', error);
    }
};

const fetchData = async () => {
    if (!startDate.value || !endDate.value || !selectedCabang.value) return;
    isLoading.value = true;
    try {
        const response = await api.get('/mutasi-out', {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value,
            }
        });
        list.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data Mutasi Out.', error);
    } finally {
        isLoading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: MutasiHeader[]) => {
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
    if (!itemToLoad) return;
    const nomorToLoad = itemToLoad.Nomor;

    loadingDetails.value.add(nomorToLoad);
    try {
        const response = await api.get(`/mutasi-out/${nomorToLoad}`);
        details.value[nomorToLoad] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomorToLoad}`, error);
        expanded.value = expanded.value.filter(nomor => nomor !== nomorToLoad);
    } finally {
        loadingDetails.value.delete(nomorToLoad);
    }
};

const exportData = async (type: 'header' | 'detail') => {
    if (type === 'header') {
        if (list.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');
        try {
            const worksheet = XLSX.utils.json_to_sheet(list.value);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Out Header");
            XLSX.writeFile(workbook, "Export_Mutasi_Out_Header.xlsx");
        } catch (error) {
            toast.error('Gagal membuat file Excel.', error);
        }
    } else if (type === 'detail') {
        try {
            toast.info('Mengambil data detail dari server...');
            const filters = {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value
            };
            const response = await api.get('/mutasi-out/export-details', { params: filters });
            if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor.');

            const worksheet = XLSX.utils.json_to_sheet(response.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Out Detail");
            XLSX.writeFile(workbook, "Export_Mutasi_Out_Detail.xlsx");
        } catch (error) {
            toast.error('Gagal mengekspor data detail.', error);
        }
    }
};

const getRowTextColor = (item: MutasiHeader): string => {
    switch (item.Status) {
        case 'OPEN':
            return 'text-red font-weight-bold';
        case 'PROSES':
            return 'text-blue font-weight-bold';
        default:
            return '';
    }
};

// Tambahkan juga fungsi untuk chip status
const getStatusChip = (status: string) => {
    if (status === 'OPEN') return { color: 'error', text: 'Open' };
    if (status === 'PROSES') return { color: 'primary', text: 'Proses' };
    if (status === 'CLOSE') return { color: 'grey', text: 'Close' };
    return { color: 'grey', text: status };
};

const printData = () => {
    // Pastikan hanya satu baris yang dipilih
    if (!isSingleSelected.value) return;

    // Ambil nomor mutasi dari baris yang dipilih
    const nomorMutasi = selected.value[0].Nomor;

    // Buka halaman cetak di tab baru
    const url = router.resolve({
        name: 'Cetak Mutasi Out',
        params: { nomor: nomorMutasi }
    }).href;

    window.open(url, '_blank');
};

onMounted(() => {
    if (hasViewPermission.value) {
        fetchCabangList();
        fetchData();
    } else {
        isLoading.value = false;
    }
});

watch([startDate, endDate, selectedCabang], fetchData);
</script>

<template>
    <PageLayout title="Mutasi Out ke Produksi" desktop-mode icon="mdi-truck-delivery-outline">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
                @click="router.push('/transaksi/mutasi/out-produksi/new')">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-pencil"
                @click="router.push(`/transaksi/mutasi/out-produksi/ubah/${selected[0].Nomor}`)">
                Ubah
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
                prepend-icon="mdi-delete">Hapus</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
                prepend-icon="mdi-printer" @click="printData">
                Cetak
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

        <div v-if="!hasViewPermission" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div v-else class="browse-content">
            <div class="filter-section">
                <span class="filter-label">Periode:</span>
                <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined" />
                <span class="mx-2">s/d</span>
                <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined" />
                <span class="filter-label ms-4">Cabang:</span>
                <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode"
                    density="compact" hide-details variant="outlined" />
                <v-spacer />
                <div class="legend-group">
                    <div class="legend-item"><span class="color-box status-open-bg"></span> Open</div>
                    <div class="legend-item"><span class="color-box status-proses-bg"></span> Proses</div>
                    <div class="legend-item"><span class="color-box status-close-bg"></span> Close</div>
                </div>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" :headers="headers" :items="list" :loading="isLoading"
                    item-value="Nomor" density="compact" class="desktop-table fill-height-table" fixed-header
                    show-select return-object show-expand @update:expanded="loadDetails">
                    <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
                        <td :class="getRowTextColor(item)">
                            <template v-if="header.key === 'Tanggal'">
                                {{ format(parseISO(item.Tanggal), 'dd/MM/yyyy') }}
                            </template>
                            <template v-else-if="header.key === 'Status'">
                                <v-chip :color="getStatusChip(item.Status).color" variant="tonal" size="x-small">
                                    {{ getStatusChip(item.Status).text }}
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
                                        <div v-if="loadingDetails.has(item.Nomor)"
                                            class="text-center py-2 text-caption">
                                            Memuat detail...
                                        </div>
                                        <v-data-table v-else-if="details[item.Nomor] && details[item.Nomor].length"
                                            :headers="detailHeaders" :items="details[item.Nomor]" item-value="Kode"
                                            density="compact" class="detail-table" :items-per-page="-1">
                                            <template #bottom></template>
                                        </v-data-table>
                                        <div v-else class="text-center py-2 text-caption">
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
    </PageLayout>
</template>

<style scoped>
/* Kelas-kelas ini sekarang akan memberi warna pada TULISAN di seluruh baris */
:deep(tr.status-open) {
    color: red !important;
}

:deep(tr.status-proses) {
    color: navy !important;
}

/* Kelas-kelas untuk kotak warna di legend */
.legend-group {
    display: flex;
    gap: 1rem;
    font-size: 10px;
    align-items: center;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
}

.color-box {
    width: 12px;
    height: 12px;
    border: 1px solid #ccc;
}

.status-open-bg {
    background-color: #FFCDD2;
}

.status-proses-bg {
    background-color: #BBDEFB;
}

.status-close-bg {
    background-color: #E0E0E0;
}
</style>

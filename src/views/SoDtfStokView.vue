<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '36';

interface HeaderItem {
    Nomor: string;
    LHK: number;
    Jumlah: number;
    AlasanClose: string;
    Close: string;
    [key: string]: any;
}

interface DetailItem {
    Kode: string;
    Nama: string;
    Ukuran: string;
    Jumlah: number;
    LHK: number;
    Kurang: number;
}

// --- State ---
const list = ref<HeaderItem[]>([]);
const details = ref<{ [key: string]: any[] }>({});
const isLoading = ref(true);
const filterDateType = ref('dtf'); // 'dtf' atau 'pengerjaan'
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const selected = ref<HeaderItem[]>([]);
const expanded = ref<HeaderItem[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

// State untuk dialog
const isCloseDialogVisible = ref(false);
const itemToClose = ref<HeaderItem | null>(null);
const closeReason = ref('');
const isConfirmDeleteVisible = ref(false);
const itemToDelete = ref<HeaderItem | null>(null);
const filterOptions = ref([
    { title: 'Nomor', value: 'Nomor' },
    { title: 'Nama DTF', value: 'NamaDTF' },
    { title: 'Sales', value: 'Sales' },
    { title: 'Bag. Desain', value: 'BagDesain' },
    { title: 'Workshop', value: 'Workshop' },
    { title: 'Keterangan', value: 'Keterangan' },
    { title: 'Alasan Close', value: 'AlasanClose' },
]);
const selectedFilterField = ref('Nomor'); // Filter default
const filterSearchValue = ref('');

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);
const filteredList = computed(() => {
    if (!filterSearchValue.value) {
        return list.value;
    }
    return list.value.filter(item => {
        const itemValue = item[selectedFilterField.value];
        if (itemValue !== null && itemValue !== undefined) {
            return itemValue.toString().toLowerCase().includes(filterSearchValue.value.toLowerCase());
        }
        return false;
    });
});

const headers = [
    { title: 'Nomor', key: 'Nomor', width: '180px', fixed: true },
    { title: 'Tanggal', key: 'Tanggal', width: '120px' },
    { title: 'Tgl Pengerjaan', key: 'TglPengerjaan', width: '140px' },
    { title: 'Nama DTF', key: 'NamaDTF', width: '250px' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '100px' },
    { title: 'LHK', key: 'LHK', align: 'center', width: '100px' },
    { title: 'Sales', key: 'Sales', width: '200px' },
    { title: 'Bag. Desain', key: 'BagDesain', width: '150px' },
    { title: 'Kain', key: 'Kain', width: '150px' },
    { title: 'Finishing', key: 'Finishing', width: '150px' },
    { title: 'Workshop', key: 'Workshop', width: '150px' },
    { title: 'Alasan Close', key: 'AlasanClose', width: '250px' },
    { title: 'Keterangan', key: 'Keterangan', width: '300px' },
    { title: 'Created', key: 'Created', width: '180px' },
    { title: 'Status Close', key: 'Close', align: 'center', width: '120px' },
];

const detailHeaders = [
    { title: 'Kode', key: 'Kode', width: '150px' },
    { title: 'Nama', key: 'Nama', width: '250px' },
    { title: 'Ukuran', key: 'Ukuran', width: '100px' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end' },
    { title: 'LHK', key: 'LHK', align: 'end' },
    { title: 'Kurang', key: 'Kurang', align: 'end' },
];

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/so-dtf-stok/lookup/cabang');
        cabangList.value = response.data;
        if (authStore.user?.cabang === 'KDC' && cabangList.value.length > 0) {
            selectedCabang.value = cabangList.value[0].kode;
        }
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.');
    }
};

const fetchData = async () => {
    if (!startDate.value || !endDate.value || !selectedCabang.value) return;
    isLoading.value = true;
    try {
        const response = await api.get('/so-dtf-stok', {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value,
                filterDateType: filterDateType.value,
            }
        });
        list.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data SO DTF Stok.');
    } finally {
        isLoading.value = false;
    }
};

// Ganti fungsi loadDetails Anda yang lama dengan ini
const loadDetails = async (newlyExpandedItems: HeaderItem[]) => { // Menerima array objek
    // Cari objek item yang baru di-expand
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));

    if (!itemToLoad) return;

    // Gunakan properti .Nomor dari objek
    const nomorToLoad = itemToLoad.Nomor;

    loadingDetails.value.add(nomorToLoad);
    try {
        // Kirim properti .Nomor ke API
        const response = await api.get(`/so-dtf-stok/${nomorToLoad}`, {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value,
                filterDateType: filterDateType.value,
            }
        });
        // Simpan detail menggunakan .Nomor sebagai kunci
        details.value[nomorToLoad] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
        // Hapus dari daftar expanded jika gagal
        expanded.value = expanded.value.filter(nomor => nomor !== nomorToLoad);
    } finally {
        loadingDetails.value.delete(nomorToLoad);
    }
};

const openCloseDialog = () => {
    if (!isSingleSelected.value) return;
    const item = selected.value[0];
    // Validasi di frontend untuk feedback cepat, sama seperti di Delphi
    if (item.LHK >= item.Jumlah) {
        toast.warning('LHK sudah terpenuhi atau lebih, tidak bisa di-close.');
        return;
    }
    itemToClose.value = item;
    closeReason.value = item.AlasanClose || '';
    isCloseDialogVisible.value = true;
};

const submitClose = async () => {
    if (!itemToClose.value) return;
    try {
        await api.post('/so-dtf-stok/close', {
            nomor: itemToClose.value.Nomor,
            alasan: closeReason.value,
            user: authStore.user?.kode
        });
        toast.success('SO berhasil ditutup.');
        isCloseDialogVisible.value = false;
        fetchData();
        selected.value = [];
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menutup SO.');
    }
};

const exportData = async (type: 'header' | 'detail') => {
    const filters = {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
        filterDateType: filterDateType.value,
    };
    try {
        if (type === 'header') {
            if (list.value.length === 0) {
                toast.warning('Tidak ada data untuk diekspor.');
                return;
            }
            toast.info('Membuat file Excel Header...');
            const worksheet = XLSX.utils.json_to_sheet(list.value);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "SO DTF Stok Header");
            XLSX.writeFile(workbook, "Export_SO_DTF_Stok_Header.xlsx");
            toast.success('File Header berhasil dibuat.');
        } else {
            toast.info('Mengambil data detail dari server...');
            // Anda perlu endpoint baru untuk ini, misal '/so-dtf-stok/export-detail'
            const response = await api.get('/so-dtf-stok/export-detail', { params: filters });
            if (response.data.length === 0) {
                toast.warning('Tidak ada data detail untuk diekspor.');
                return;
            }
            toast.info('Membuat file Excel Detail...');
            const worksheet = XLSX.utils.json_to_sheet(response.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "SO DTF Stok Detail");
            XLSX.writeFile(workbook, "Export_SO_DTF_Stok_Detail.xlsx");
            toast.success('File Detail berhasil dibuat.');
        }
    } catch (error) {
        toast.error('Gagal mengekspor data.');
    }
};

const getRowClass = (item: HeaderItem) => {
    if (item.AlasanClose) return 'row-closed';
    return '';
};

const showDeleteConfirmation = () => {
    if (!isSingleSelected.value) return;
    const item = selected.value[0];
    if (item.Close === 'Y') {
        toast.warning('Transaksi sudah ditutup, tidak bisa dihapus.');
        return;
    }
    itemToDelete.value = item;
    isConfirmDeleteVisible.value = true;
};

const executeDelete = async () => {
    if (!itemToDelete.value) return;
    try {
        await api.delete(`/so-dtf-stok/${itemToDelete.value.Nomor}`);
        toast.success('Data berhasil dihapus.');
        fetchData();
        selected.value = [];
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
    } finally {
        isConfirmDeleteVisible.value = false;
        itemToDelete.value = null;
    }
};

const getLhkClass = (item: HeaderItem) => {
    if (item.LHK === 0) return 'lhk-zero';
    if (item.LHK > 0 && item.LHK < item.Jumlah) return 'lhk-progress';
    return 'lhk-normal';
};

const printData = () => {
    // Pastikan hanya satu baris yang dipilih
    if (!isSingleSelected.value) return;

    const item = selected.value[0];

    // Membuat URL untuk halaman cetak sesuai dengan nama rute di router/index.ts
    const url = router.resolve({
        name: 'Cetak SO DTF Stok',
        params: { nomor: item.Nomor }
    }).href;

    // Membuka halaman cetak di tab baru
    window.open(url, '_blank');
};

onMounted(() => {
    if (hasViewPermission.value) {
        fetchCabangList();
        fetchData();
    }
});

watch([startDate, endDate, selectedCabang, filterDateType], fetchData);
</script>

<template>
    <PageLayout title="SO DTF Stok" desktop-mode icon="mdi-package-variant-closed">
        <!-- Konten sama seperti SO DTF Pesanan, disesuaikan dengan field & endpoint baru -->
        <template #header-actions>
            <v-btn size="small" color="primary" prepend-icon="mdi-plus"
                @click="router.push('/transaksi/penjualan/dtf/so-dtf-stok/new')">
                Baru
            </v-btn>
            <v-btn size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
                @click="router.push(`/transaksi/penjualan/dtf/so-dtf-stok/ubah/${selected[0].Nomor}`)">
                Ubah
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" :disabled="!isSingleSelected" @click="printData"
                color="green" prepend-icon="mdi-printer">
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
            <v-divider vertical class="mx-2"></v-divider>
            <v-btn size="small" :disabled="!isSingleSelected" color="orange-darken-2">Close SO</v-btn>
        </template>

        <div class="browse-content">
            <div class="filter-section">
                <v-radio-group v-model="filterDateType" inline hide-details density="compact" class="me-4">
                    <template #label><span class="filter-label">Filter:</span></template>
                    <v-radio label="Tgl SO DTF" value="dtf"></v-radio>
                    <v-radio label="Tgl Pengerjaan" value="pengerjaan"></v-radio>
                </v-radio-group>
                <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined"
                    style="min-width: 140px;" />
                <span class="mx-2">s/d</span>
                <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined"
                    style="min-width: 140px;" />
                <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode"
                    density="compact" hide-details variant="outlined" style="max-width: 180px;" />
                <v-divider vertical class="mx-2"></v-divider>
                <div class="d-flex align-center ga-2">
                    <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan"
                        density="compact" hide-details variant="outlined" style="max-width: 180px;"></v-select>
                    <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details
                        variant="outlined" style="min-width: 250px;" clearable
                        prepend-inner-icon="mdi-magnify"></v-text-field>
                </div>
                <v-spacer />
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
            </div>

            <div class="legend-section">
                <div class="legend-group">
                    <strong class="legend-title">Status SO:</strong>
                    <div class="legend-item"><span class="row-color-sample-closed"></span> Di-Close</div>
                </div>
                <v-divider vertical></v-divider>
                <div class="legend-group">
                    <strong class="legend-title">Status LHK:</strong>
                    <div class="legend-item"><v-chip size="x-small" class="lhk-zero" label>0</v-chip> Belum Input
                    </div>
                    <div class="legend-item"><v-chip size="x-small" class="lhk-progress" label>1</v-chip> Progress
                    </div>
                </div>
            </div>

            <v-data-table v-model="selected" :headers="headers" :items="filteredList" :loading="isLoading"
                v-model:expanded="expanded" @update:expanded="loadDetails" :item-class="getRowClass" item-value="Nomor"
                density="compact" class="desktop-table fill-height-table" fixed-header show-select return-object
                show-expand>
                <template #item.Tanggal="{ item }">{{ format(parseISO(item.Tanggal), 'dd/MM/yyyy') }}</template>
                <template #item.TglPengerjaan="{ item }">{{ format(parseISO(item.TglPengerjaan), 'dd/MM/yyyy')
                    }}</template>
                <template #item.LHK="{ item }">
                    <v-chip :class="getLhkClass(item)" size="x-small" label>{{ item.LHK }}</v-chip>
                </template>
                <template #item.Created="{ item }">
                    {{ item.Created ? format(parseISO(item.Created), 'dd/MM/yyyy HH:mm:ss') : '-' }}
                </template>
                <template #item.Close="{ item }">
                    <v-chip :color="item.Close === 'Y' ? 'success' : 'grey'" size="x-small">{{ item.Close === 'Y' ?
                        'Closed' : 'Open' }}</v-chip>
                </template>

                <template #expanded-row="{ columns, item }">
                    <tr>
                        <td :colspan="columns.length">
                            <div class="detail-container">
                                <div class="detail-table-wrapper">
                                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">
                                        Memuat detail...
                                    </div>
                                    <v-data-table v-else-if="details[item.Nomor]" :headers="detailHeaders"
                                        :items="details[item.Nomor]" item-value="Kode" density="compact"
                                        class="detail-table" :items-per-page="-1">
                                        <template #bottom></template>
                                    </v-data-table>
                                    <div v-else class="text-center text-caption py-2">
                                        Tidak ada data detail untuk nomor ini.
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                </template>
            </v-data-table>
        </div>

        <!-- Dialog untuk Hapus -->
        <v-dialog v-model="isConfirmDeleteVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
                <v-card-text>Anda yakin ingin menghapus SO DTF Stok Nomor: <strong>{{ itemToDelete?.Nomor
                }}</strong>?</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn @click="isConfirmDeleteVisible = false">Batal</v-btn>
                    <v-btn color="error" @click="executeDelete">Ya, Hapus</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Dialog untuk Close SO -->
        <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
            <v-card>
                <v-card-title class="text-subtitle-1">Isi Alasan Close SO</v-card-title>
                <v-card-text class="pa-4">
                    <p class="text-caption mb-2">Anda akan menutup SO Nomor: <strong>{{ itemToClose?.Nomor
                    }}</strong>
                    </p>
                    <v-textarea v-model="closeReason" label="Alasan" rows="3" variant="outlined" autofocus></v-textarea>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn @click="isCloseDialogVisible = false">Batal</v-btn>
                    <v-btn color="primary" @click="submitClose">Simpan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
.row-closed :deep(td:first-child) {
    background-color: #FFFF99;
    font-weight: bold;
}

.lhk-zero {
    background-color: #FF5252 !important;
    color: white !important;
}

.lhk-progress {
    background-color: #1A237E !important;
    color: white !important;
}

.lhk-normal {
    background-color: #E0E0E0 !important;
}

.legend-section {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    font-size: 11px;
    background-color: #f7f7f7;
    border-bottom: 1px solid #e0e0e0;
    flex-shrink: 0;
}

.legend-group {
    display: flex;
    align-items: center;
    gap: 12px;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
}

.legend-title {
    font-weight: bold;
    color: #333;
}

.row-color-sample-closed {
    background-color: #FFFF99;
    width: 14px;
    height: 14px;
    border: 1px solid #e0e0e0;
    display: inline-block;
}

.detail-container {
    display: flex;
    justify-content: flex-end;
    /* Mendorong konten ke kanan */
    padding: 8px;
    background-color: #f7f7f7;
}

.detail-table-wrapper {
    width: 75%;
    /* Lebar tabel detail, bisa disesuaikan */
    border: 1px solid #ddd;
    border-radius: 4px;
    overflow: hidden;
    background-color: white;
}

.detail-table {
    font-size: 10px;
}
</style>
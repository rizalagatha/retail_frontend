<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import { useRouter } from 'vue-router';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '35';

// --- Interfaces ---
interface SoDtfHeader {
    Nomor: string;
    Tanggal: string;
    TglPengerjaan: string;
    NoSO: string;
    NoINV: string;
    AlasanClose: string;
    LHK: number;
    TotalTitik: number;
    [key: string]: any;
}
interface SoDtfDetail {
    Ukuran: string;
    Jumlah: number;
}

// --- State ---
const soDtfList = ref<SoDtfHeader[]>([]);
const details = ref<{ [key: string]: SoDtfDetail[] }>({});
const isLoading = ref(true);
const filterDateType = ref('dtf'); // 'dtf' atau 'pengerjaan'
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref([]);
const selectedCabang = ref(authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '');
const selected = ref<SoDtfHeader[]>([]);
const expanded = ref<SoDtfHeader[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

const isCloseDialogVisible = ref(false);
const itemToClose = ref<SoDtfHeader | null>(null);
const closeReason = ref('');

const isConfirmDialogVisible = ref(false);
const confirmDialogText = ref('');
const itemToDelete = ref<SoDtfHeader | null>(null);

const filterOptions = ref([
    { title: 'Nomor', value: 'Nomor' },
    { title: 'Status', value: 'status' },
    { title: 'Tanggal', value: 'Tanggal' },
    { title: 'Tgl Pengerjaan', value: 'TglPengerjaan' },
    { title: 'Dateline Cust', value: 'DatelineCus' },
    { title: 'Nama DTF', value: 'NamaDTF' },
    { title: 'Kd. Customer', value: 'KdCus' },
    { title: 'Nama Customer', value: 'Customer' },
    { title: 'Jml', value: 'Jumlah'},
    { title: 'Titik', value: 'Titik' },
    { title: 'Total Titik', value: 'TotalTitik' },
    { title: 'LHK', value: 'LHK' },
    { title: 'No. SO', value: 'NoSO' },
    { title: 'No. Invoice', value: 'NoINV' },
    { title: 'Sales', value: 'Sales' },
    { title: 'Bag. Desain', value: 'BagDesain' },
    { title: 'Kain', value: 'Kain' },
    { title: 'Finishing', value: 'Finishing' },
    { title: 'Workshop', value: 'Workshop' },
    { title: 'Keterangan', value: 'Keterangan' },
    { title: 'Alasan Close', value: 'AlasanClose' },
    { title: 'User', value: 'Created' },
    { title: 'Status Close', value: 'Close' },
]);
const selectedFilterField = ref('Nomor'); // Filter default
const filterSearchValue = ref('');

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);
const filteredSoDtfList = computed(() => {
    if (!filterSearchValue.value) {
        return soDtfList.value;
    }
    return soDtfList.value.filter(item => {
        const itemValue = item[selectedFilterField.value];
        if (itemValue !== null && itemValue !== undefined) {
            return itemValue.toString().toLowerCase().includes(filterSearchValue.value.toLowerCase());
        }
        return false;
    });
});

const headers = [
    { title: 'Nomor', key: 'Nomor', width: '150px', fixed: true },
    { title: 'Status', key: 'status', width: '150px', sortable: false },
    { title: 'Tanggal', key: 'Tanggal', width: '100px' },
    { title: 'Tgl Pengerjaan', key: 'TglPengerjaan', width: '120px' },
    { title: 'Dateline Cust', key: 'DatelineCus', width: '120px' },
    { title: 'Nama DTF', key: 'NamaDTF', width: '200px' },
    { title: 'Kd. Customer', key: 'KdCus', width: '120px' },
    { title: 'Nama Customer', key: 'Customer', width: '250px' },
    { title: 'Jml', key: 'Jumlah', align: 'end', width: '70px' },
    { title: 'Titik', key: 'Titik', align: 'end', width: '70px' },
    { title: 'Total Titik', key: 'TotalTitik', align: 'end', width: '90px' },
    { title: 'LHK', key: 'LHK', align: 'center', width: '70px' },
    { title: 'No. SO', key: 'NoSO', width: '150px' },
    { title: 'No. Invoice', key: 'NoINV', width: '150px' },
    { title: 'Sales', key: 'Sales', width: '150px' },
    { title: 'Bag. Desain', key: 'BagDesain', width: '150px' },
    { title: 'Kain', key: 'Kain', width: '150px' },
    { title: 'Finishing', key: 'Finishing', width: '150px' },
    { title: 'Workshop', key: 'Workshop', width: '150px' },
    { title: 'Keterangan', key: 'Keterangan', width: '250px' },
    { title: 'Alasan Close', key: 'AlasanClose', width: '250px' },
    { title: 'User', key: 'Created', width: '120px' },
    { title: 'Status Close', key: 'Close', align: 'center', width: '120px' },
];

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/warehouses/so-dtf-branches', {
            params: { userCabang: authStore.user?.cabang }
        });

        if (authStore.user?.cabang === 'KDC') {
            cabangList.value = [{ kode: 'ALL', nama: 'SEMUA CABANG' }, ...response.data];
        } else {
            cabangList.value = response.data;
        }
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.');
    }
};
const fetchData = async () => {
    if (!startDate.value || !endDate.value) return;
    isLoading.value = true;
    try {
        const response = await api.get('/so-dtf', {
            params: {
                startDate: startDate.value, endDate: endDate.value,
                cabang: selectedCabang.value, filterDateType: filterDateType.value,
            }
        });
        soDtfList.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data SO DTF.');
    } finally {
        isLoading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: SoDtfHeader[]) => {
    const itemToLoad = newlyExpandedItems.find(
        (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
    );

    if (!itemToLoad) return;

    const nomor = itemToLoad.Nomor;
    loadingDetails.value.add(nomor);
    try {
        const response = await api.get(`/so-dtf/${nomor}`);
        details.value[nomor] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomor}`);
        expanded.value = expanded.value.filter(item => item.Nomor !== nomor);
    } finally {
        loadingDetails.value.delete(nomor);
    }
};

const getRowClass = (item: SoDtfHeader) => {
    if (item.AlasanClose) return 'row-closed';
    if (item.NoINV) return '';
    if (item.NoSO) return 'row-no-invoice';
    return 'row-no-so';
};

// Fungsi untuk mendapatkan teks status berdasarkan data item
const getStatusText = (item: SoDtfHeader) => {
    if (item.AlasanClose) return 'Closed';
    if (item.NoINV) return 'Sudah Invoice';
    if (item.NoSO) return 'Belum Invoice';
    return 'Belum SO & Invoice';
};

const getLhkClass = (item: SoDtfHeader) => {
    if (item.LHK === 0) return 'lhk-zero';
    if (item.LHK > 0 && item.LHK < item.TotalTitik) return 'lhk-progress';
    return 'lhk-normal';
};

const openCloseDialog = () => {
    if (!isSingleSelected.value) return;
    const item = selected.value[0];
    if (item.NoINV) {
        toast.warning('Sudah dibuat Invoice, tidak bisa di-close.');
        return;
    }
    itemToClose.value = item;
    closeReason.value = item.AlasanClose || '';
    isCloseDialogVisible.value = true;
};

const submitCloseSo = async () => {
    if (!itemToClose.value) return;
    try {
        await api.post('/so-dtf/close', {
            nomor: itemToClose.value.Nomor,
            alasan: closeReason.value,
            user: authStore.user?.kode,
        });
        toast.success('SO DTF berhasil ditutup.');
        isCloseDialogVisible.value = false;
        fetchData();
        selected.value = [];
    } catch (error) {
        toast.error('Gagal menutup SO DTF.');
    }
};

const showDeleteConfirmation = () => {
    if (!isSingleSelected.value) return;

    const item = selected.value[0];

    // Validasi awal di frontend untuk feedback cepat
    if (item.NoSO) {
        toast.warning('Sudah dibuat SO, tidak bisa dihapus.');
        return;
    }
    if (item.NoINV) {
        toast.warning('Sudah dibuat Invoice, tidak bisa dihapus.');
        return;
    }
    if (item.Close === 'Y') {
        toast.warning('Transaksi sudah ditutup, tidak bisa dihapus.');
        return;
    }

    itemToDelete.value = item;
    confirmDialogText.value = `Anda yakin ingin menghapus SO DTF Nomor: ${item.Nomor}?`;
    isConfirmDialogVisible.value = true;
};

const executeDelete = async () => {
    if (!itemToDelete.value) return;

    try {
        await api.delete(`/so-dtf/${itemToDelete.value.Nomor}`);
        toast.success(`SO DTF ${itemToDelete.value.Nomor} berhasil dihapus.`);
        fetchData(); // Muat ulang data tabel
        selected.value = []; // Kosongkan pilihan
    } catch (error: any) {
        // Menampilkan pesan error dari backend
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
    } finally {
        isConfirmDialogVisible.value = false;
        itemToDelete.value = null;
    }
};

const exportData = async (type: 'header' | 'detail') => {
    try {
        if (type === 'header') {
            // Untuk Export Header, kita TETAP gunakan data yang dicentang karena ini sangat berguna
            if (selected.value.length === 0) {
                toast.warning('Silakan centang data header yang ingin diekspor.');
                return;
            }
            toast.info('Membuat file Excel Header dari data terpilih...');
            const worksheet = XLSX.utils.json_to_sheet(selected.value);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "SO DTF Header");
            XLSX.writeFile(workbook, "Export_SO_DTF_Header_Terpilih.xlsx");
            toast.success('File Header berhasil dibuat.');

        } else { // type === 'detail'
            // Untuk Export Detail, kita gunakan filter tanggal dan cabang yang aktif
            toast.info('Mengambil semua data detail dari server sesuai filter...');

            const response = await api.get('/so-dtf/export-detail', {
                params: {
                    // Kirim filter yang aktif, BUKAN data yang dicentang
                    startDate: startDate.value,
                    endDate: endDate.value,
                    cabang: selectedCabang.value,
                    filterDateType: filterDateType.value,
                }
            });

            if (!response.data || response.data.length === 0) {
                toast.warning('Tidak ada data detail ditemukan untuk filter yang dipilih.');
                return;
            }

            toast.info('Membuat file Excel Detail...');
            const worksheet = XLSX.utils.json_to_sheet(response.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "SO DTF Detail");
            XLSX.writeFile(workbook, "Export_SO_DTF_Detail_Filter.xlsx");
            toast.success('File Detail berhasil dibuat.');
        }
    } catch (error) {
        toast.error('Gagal mengekspor data.');
        console.error("Export error:", error);
    }
};

const printData = () => {
    if (!isSingleSelected.value) return;
    const item = selected.value[0];
    const url = router.resolve({
        name: 'Cetak SO DTF',
        params: { nomor: item.Nomor }
    }).href;
    window.open(url, '_blank');
};

onMounted(() => {
    if (hasViewPermission.value) {
        fetchData();
        fetchCabangList();
    }
});

watch([filterDateType, startDate, endDate, selectedCabang], fetchData);
</script>

<template>
    <PageLayout title="SO DTF Pesanan" desktop-mode icon="mdi-printer-3d">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
                @click="$router.push('/transaksi/dtf/so-dtf/new')">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-pencil"
                @click="$router.push(`/transaksi/dtf/so-dtf/ubah/${selected[0].Nomor}`)">Ubah</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-delete" @click="showDeleteConfirmation"> Hapus
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" :disabled="!isSingleSelected" @click="printData"
                color="green" prepend-icon="mdi-printer">
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
            <v-divider vertical class="mx-2"></v-divider>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected"
                @click="openCloseDialog" color="orange-darken-2">Close SO</v-btn>
        </template>

        <div v-if="!hasViewPermission" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div v-else class="browse-content">
            <div class="filter-section">
                <v-radio-group v-model="filterDateType" inline hide-details density="compact" class="me-4">
                    <template #label><span class="filter-label">Filter:</span></template>
                    <v-radio label="Tgl SO DTF" value="dtf"></v-radio>
                    <v-radio label="Tgl Pengerjaan" value="pengerjaan"></v-radio>
                </v-radio-group>
                <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined"
                    style="min-width: 140px;"></v-text-field>
                <span class="mx-2">s/d</span>
                <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined"
                    style="min-width: 140px;"></v-text-field>
                <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode"
                    density="compact" hide-details variant="outlined" style="max-width: 180px;"
                    :menu-props="{ class: 'compact-select-list' }"></v-select>
                <v-divider vertical class="mx-2"></v-divider>
                <div class="d-flex align-center ga-2">
                    <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan"
                        density="compact" hide-details variant="outlined" style="max-width: 180px;"></v-select>
                    <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details
                        variant="outlined" style="min-width: 250px;" clearable
                        prepend-inner-icon="mdi-magnify"></v-text-field>
                </div>
                <v-spacer></v-spacer>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
            </div>

            <div class="legend-section">
                <div class="legend-group">
                    <strong class="legend-title">Status SO:</strong>
                    <div class="legend-item"><span class="row-color-sample-closed"></span> Di-Close</div>
                    <div class="legend-item"><span class="text-red font-weight-medium">Teks Merah</span>: Belum SO &
                        Invoice
                    </div>
                    <div class="legend-item"><span class="text-blue font-weight-medium">Teks Biru</span>: Belum Invoice
                    </div>
                </div>
                <v-divider vertical></v-divider>
                <div class="legend-group">
                    <strong class="legend-title">Status LHK:</strong>
                    <div class="legend-item"><v-chip size="x-small" class="lhk-zero" label>0</v-chip> Belum Input</div>
                    <div class="legend-item"><v-chip size="x-small" class="lhk-progress" label>1</v-chip> Progress</div>
                </div>
            </div>

            <v-data-table v-model="selected" :headers="headers" :items="filteredSoDtfList" :loading="isLoading"
                :item-class="getRowClass" item-value="Nomor" density="compact" class="desktop-table fill-height-table"
                fixed-header show-select return-object show-expand @update:expanded="loadDetails">

                <template #item.status="{ item }">
                    <span :class="getRowClass(item)">{{ getStatusText(item) }}</span>
                </template>

                <template #item.Tanggal="{ item }">{{ format(new Date(item.Tanggal), 'dd/MM/yyyy') }}</template>
                <template #item.TglPengerjaan="{ item }">{{ item.TglPengerjaan ? format(new
                    Date(item.TglPengerjaan),
                    'dd/MM/yyyy') : '-' }}</template>
                <template #item.DatelineCus="{ item }">{{ item.DatelineCus ? format(new Date(item.DatelineCus),
                    'dd/MM/yyyy') : '-' }}</template>
                <template #item.LHK="{ item }">
                    <v-chip :class="getLhkClass(item)" size="x-small" label>{{ item.LHK }}</v-chip>
                </template>
                <template #item.Close="{ item }">
                    <v-chip :color="item.Close === 'Y' ? 'success' : 'grey'" size="x-small">{{ item.Close === 'Y' ?
                        'Closed' : 'Open' }}</v-chip>
                </template>

                <template #expanded-row="{ columns, item }">
                    <tr>
                        <td :colspan="columns.length" class="pa-0 bg-grey-lighten-5">
                            <div class="detail-container">
                                <div v-if="loadingDetails.has(item.Nomor)"
                                    class="detail-content-wrapper text-center py-2">
                                    Memuat detail...
                                </div>
                                <v-table v-else-if="details[item.Nomor] && details[item.Nomor].length" density="compact"
                                    class="detail-table detail-content-wrapper">
                                    <thead>
                                        <tr>
                                            <th>Ukuran</th>
                                            <th class="text-end">Jumlah</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="d in details[item.Nomor]" :key="d.Ukuran">
                                            <td>{{ d.Ukuran }}</td>
                                            <td class="text-end">{{ d.Jumlah }}</td>
                                        </tr>
                                    </tbody>
                                </v-table>
                                <div v-else class="detail-content-wrapper text-center py-2">
                                    Tidak ada data detail.
                                </div>
                            </div>
                        </td>
                    </tr>
                </template>
            </v-data-table>
        </div>

        <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
            <v-card class="dialog-card">
                <v-card-title class="dialog-header"><span class="text-subtitle-1">Isi Alasan Close
                        SO</span></v-card-title>
                <v-card-text class="pa-4">
                    <p class="text-caption mb-2">Anda akan menutup SO Nomor: <strong>{{ itemToClose?.Nomor }}</strong>
                    </p>
                    <v-textarea v-model="closeReason" label="Alasan" rows="3" variant="outlined" autofocus></v-textarea>
                </v-card-text>
                <v-card-actions class="dialog-footer">
                    <v-spacer></v-spacer>
                    <v-btn size="small" @click="isCloseDialogVisible = false">Batal</v-btn>
                    <v-btn size="small" color="primary" @click="submitCloseSo">Simpan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
                <v-card-text>{{ confirmDialogText }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="grey-darken-1" variant="text" @click="isConfirmDialogVisible = false">Batal</v-btn>
                    <v-btn color="error" variant="tonal" @click="executeDelete">Ya, Hapus</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
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

.row-no-so,
.row-no-so :deep(td) {
    color: red !important;
}

.row-no-invoice,
.row-no-invoice :deep(td) {
    color: blue !important;
}

.row-closed,
.row-closed :deep(td) {
    /* Color handled by first child only */
}

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

:deep(.compact-select-list .v-list-item-title) {
    font-size: 11px !important;
}
</style>
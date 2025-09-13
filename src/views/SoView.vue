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
const MENU_ID = '26';

// --- Interfaces ---
interface SoHeader {
    Nomor: string;
    Tanggal: string;
    Dateline: string;
    Status: string;
    StatusKirim: string;
    Aktif: string;
    AlasanClose: string;
    [key: string]: any;
}

interface SoDetail {
    Kode: string;
    Nama: string;
    Ukuran: string;
    QtySO: number;
    QtyInvoice: number;
    BlmJadiInvoice: number;
}

// --- State ---
const list = ref<SoHeader[]>([]);
const details = ref<{ [key: string]: SoDetail[] }>({});
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const selected = ref<SoHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

// State untuk Dialog
const isCloseDialogVisible = ref(false);
const itemToClose = ref<SoHeader | null>(null);
const closeReason = ref('');
const isConfirmDeleteVisible = ref(false);
const itemToDelete = ref<SoHeader | null>(null);

// State untuk Filter Kustom
const filterOptions = ref([
    { title: 'Nomor', value: 'Nomor' },
    { title: 'Penawaran', value: 'Penawaran' },
    { title: 'Nama Customer', value: 'Nama' },
    { title: 'Keterangan', value: 'Keterangan' },
    { title: 'Sales Counter', value: 'SC' },
]);
const selectedFilterField = ref('Nomor');
const filterSearchValue = ref('');

// --- Computed Properties ---
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
    { title: 'Dateline', key: 'Dateline', width: '120px' },
    { title: 'Penawaran', key: 'Penawaran', width: '180px' },
    { title: 'TOP', key: 'Top', align: 'end' },
    { title: 'Nominal', key: 'Nominal', align: 'end', width: '150px' },
    { title: 'Diskon', key: 'Diskon', align: 'end' },
    { title: 'DP', key: 'Dp', align: 'end' },
    { title: 'Qty SO', key: 'QtySO', align: 'end' },
    { title: 'Qty Inv', key: 'QtyInv', align: 'end' },
    { title: 'Belum', key: 'Belum', align: 'end' },
    { title: 'Status', key: 'Status', width: '150px' },
    { title: 'Alasan Close', key: 'AlasanClose', width: '250px' },
    { title: 'Status Kirim', key: 'StatusKirim', width: '150px' },
    { title: 'Kd Customer', key: 'kdcus', width: '120px' },
    { title: 'Nama Customer', key: 'Nama', width: '250px' },
    { title: 'Alamat', key: 'Alamat', width: '600px' },
    { title: 'Kota', key: 'Kota', width: '150px' },
    { title: 'Level', key: 'Level', width: '150px' },
    { title: 'Keterangan', key: 'Keterangan', width: '300px' },
    { title: 'Aktif', key: 'Aktif', align: 'center' },
    { title: 'Sales Counter', key: 'SC', width: '150px' },
];

const detailHeaders = [
    { title: 'Nomor', key: 'Nomor', width: '120px' },
    { title: 'Kode', key: 'Kode', width: '100px' },
    { title: 'Barcode', key: 'Barcode', width: '120px' },
    { title: 'Nama Barang', key: 'Nama', width: '200px' },
    { title: 'Ukuran', key: 'Ukuran', width: '70px' },
    { title: 'Qty SO', key: 'QtySO', align: 'end', width: '80px' },
    { title: 'Harga', key: 'Harga', align: 'end', width: '100px' },
    { title: 'Total SO', key: 'TotalSO', align: 'end', width: '120px' },
    { title: 'Qty Invoice', key: 'QtyInvoice', align: 'end', width: '100px' },
    { title: 'Belum Jadi Inv', key: 'BlmJadiInvoice', align: 'end', width: '120px' },
];

// --- Methods ---

const fetchCabangList = async () => {
    try {
        const response = await api.get('/so/lookup/cabang');
        cabangList.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.');
    }
};

const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/so', {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value,
            }
        });
        list.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data Surat Pesanan.');
    } finally {
        isLoading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: SoHeader[]) => {
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
    if (!itemToLoad) return;

    const nomorToLoad = itemToLoad.Nomor;
    loadingDetails.value.add(nomorToLoad);
    try {
        const response = await api.get(`/so/${nomorToLoad}`);
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
    if (item.Status === 'CLOSE' || item.Status === 'DICLOSE') {
        toast.warning('SO ini sudah berstatus Close.');
        return;
    }
    itemToClose.value = item;
    closeReason.value = item.AlasanClose || '';
    isCloseDialogVisible.value = true;
};

// Di file: src/views/SoView.vue

const submitClose = async () => {
    if (!itemToClose.value) return;
    try {
        await api.post('/so/close', {
            nomor: itemToClose.value.Nomor,
            alasan: closeReason.value,
            user: authStore.user.kode, // Kirim data user untuk audit
        });
        toast.success('SO berhasil ditutup.');
        isCloseDialogVisible.value = false;

        // Perbarui status item yang dipilih di frontend secara langsung
        const itemInList = list.value.find(item => item.Nomor === itemToClose.value.Nomor);
        if (itemInList) {
            itemInList.Status = 'DICLOSE';
            itemInList.AlasanClose = closeReason.value;
        }

        selected.value = [];
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menutup SO.');
    }
};

const showDeleteConfirmation = () => {
    if (!isSingleSelected.value) return;
    const item = selected.value[0];

    // Validasi status di frontend untuk feedback cepat
    if (item.Status !== 'OPEN') {
        toast.warning(`SO dengan status "${item.Status}" tidak bisa dihapus.`);
        return;
    }

    itemToDelete.value = item;
    isConfirmDeleteVisible.value = true;
};

const executeDelete = async () => {
    if (!itemToDelete.value) return;
    try {
        await api.delete(`/so/${itemToDelete.value.Nomor}`);
        toast.success(`Surat Pesanan ${itemToDelete.value.Nomor} berhasil dihapus.`);
        fetchData();
        selected.value = [];
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
    } finally {
        isConfirmDeleteVisible.value = false;
        itemToDelete.value = null;
    }
};

const getRowClass = (item: any) => {
    if (item.Aktif === 'N') return 'text-grey'; // Pasif

    switch (item.Status) {
        case 'OPEN': return 'status-open'; // <-- INI YANG MEMBUAT WARNA MERAH
        case 'PROSES':
            if (item.StatusKirim === 'SEBAGIAN') return 'status-proses-sebagian';
            return 'status-proses';
        case 'JADI': return 'status-jadi';
        default: return ''; // <-- Case 'CLOSE' dan 'DICLOSE' akan masuk ke sini (warna default/hitam)
    }
};

const getStatusChip = (status: string) => {
    switch (status) {
        case 'OPEN': return { color: 'red', text: 'Open' };
        case 'PROSES': return { color: 'navy', text: 'Proses' };
        case 'JADI': return { color: 'olive', text: 'Jadi' };
        case 'CLOSE':
        case 'DICLOSE':
            return { color: 'grey-darken-1', text: 'Close' };
        default: return { color: 'grey', text: status };
    }
};

const printData = () => {
    if (!isSingleSelected.value) return;
    const item = selected.value[0];

    // Validasi dari Delphi
    if (item.Aktif === 'N') {
        toast.warning('No. Pesanan tersebut pasif. Tidak bisa dicetak.');
        return;
    }

    const url = router.resolve({
        name: 'Cetak Surat Pesanan',
        params: { nomor: item.Nomor }
    }).href;
    window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
    const filters = {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
    };

    try {
        if (type === 'header') {
            if (list.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');

            toast.info('Membuat file Excel Header...');
            const worksheet = XLSX.utils.json_to_sheet(list.value);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "SO Header");
            XLSX.writeFile(workbook, "Export_SO_Header.xlsx");
            toast.success('File Header berhasil dibuat.');

        } else if (type === 'detail') {
            toast.info('Mengambil data detail dari server...');
            const response = await api.get('/so/export-details', { params: filters });

            if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor.');

            toast.info('Membuat file Excel Detail...');
            const worksheet = XLSX.utils.json_to_sheet(response.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "SO Detail");
            XLSX.writeFile(workbook, "Export_SO_Detail.xlsx");
            toast.success('File Detail berhasil dibuat.');
        }
    } catch (error) {
        toast.error('Gagal mengekspor data.');
    }
};

onMounted(() => {
    if (hasViewPermission.value) {
        fetchCabangList();
        fetchData();
    }
});

watch([startDate, endDate, selectedCabang], fetchData);
</script>

<template>
    <PageLayout title="Surat Pesanan" desktop-mode icon="mdi-file-document-multiple-outline">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
                @click="router.push('/transaksi/surat-pesanan/new')">
                Baru
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-pencil" @click="router.push(`/transaksi/surat-pesanan/ubah/${selected[0].Nomor}`)">
                Ubah
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-delete" @click="showDeleteConfirmation">Hapus</v-btn>
            <v-btn v.if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
                prepend-icon="mdi-printer" @click="printData">Cetak</v-btn>
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
                color="orange-darken-2" @click="openCloseDialog">Close SO</v-btn>
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

                <v-divider vertical class="mx-2"></v-divider>
                <div class="d-flex align-center ga-2">
                    <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan"
                        density="compact" hide-details variant="outlined" style="max-width: 180px;" />
                    <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details
                        variant="outlined" style="min-width: 250px;" clearable prepend-inner-icon="mdi-magnify" />
                </div>

                <v-spacer />
                <div class="legend-group">
                    <div class="legend-item"><span class="color-box" style="background-color: red;"></span> Open</div>
                    <div class="legend-item"><span class="color-box" style="background-color: navy;"></span> Proses
                    </div>
                    <div class="legend-item"><span class="color-box" style="background-color: fuchsia;"></span> Kirim
                        Sebagian
                    </div>
                    <div class="legend-item"><span class="color-box" style="background-color: olive;"></span> Jadi</div>
                    <div class="legend-item"><span class="color-box" style="background-color: silver;"></span> Pasif
                    </div>
                </div>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" :headers="headers" :items="filteredList" :loading="isLoading"
                    :item-class="getRowClass" item-value="Nomor" density="compact" class="desktop-table" fixed-header
                    show-select return-object show-expand @update:expanded="loadDetails">
                    <template #item.Tanggal="{ item }">{{ format(parseISO(item.Tanggal), 'dd/MM/yyyy') }}</template>
                    <template #item.Dateline="{ item }">{{ item.Dateline ? format(parseISO(item.Dateline), 'dd/MM/yyyy')
                        : '-' }}</template>
                    <template #item.Nominal="{ item }">{{ new Intl.NumberFormat('id-ID').format(item.Nominal || 0)
                    }}</template>
                    <template #item.Status="{ item }">
                        <v-chip size="x-small" :color="getStatusChip(item.Status).color"
                            :class="item.Aktif === 'N' ? 'text-grey' : ''" variant="tonal">
                            {{ getStatusChip(item.Status).text }}
                        </v-chip>
                    </template>
                    <template #item.StatusKirim="{ item }">
                        <v-chip size="x-small" :color="item.StatusKirim === 'BELUM' ? 'orange' : 'indigo'">
                            {{ item.StatusKirim }}
                        </v-chip>
                    </template>
                    <template #item.Aktif="{ item }">
                        <v-chip size="x-small" :color="item.Aktif === 'Y' ? 'success' : 'grey'">
                            {{ item.Aktif === 'Y' ? 'Aktif' : 'Pasif' }}
                        </v-chip>
                    </template>

                    <template #expanded-row="{ columns, item }">
                        <tr>
                            <td :colspan="columns.length">
                                <div class="detail-container">
                                    <div class="detail-table-wrapper">
                                        <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">Memuat
                                            detail...</div>
                                        <v-data-table v-else-if="details[item.Nomor]" :headers="detailHeaders"
                                            :items="details[item.Nomor]" item-value="Kode" density="compact"
                                            class="detail-table" :items-per-page="-1">
                                            <template #item.Nomor="{ item: detailItem }">{{ item.Nomor }}</template>
                                            <template #item.Harga="{ item: detailItem }">{{ new
                                                Intl.NumberFormat('id-ID').format(detailItem.Harga || 0) }}</template>
                                            <template #item.TotalSO="{ item: detailItem }">{{ new
                                                Intl.NumberFormat('id-ID').format(detailItem.TotalSO || 0) }}</template>
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
        </div>

        <v-dialog v-model="isConfirmDeleteVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
                <v-card-text>Anda yakin ingin menghapus Surat Pesanan: <strong>{{ itemToDelete?.Nomor
                }}</strong>?</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn @click="isConfirmDeleteVisible = false">Batal</v-btn>
                    <v-btn color="error" @click="executeDelete">Ya, Hapus</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
            <v-card>
                <v-card-title class="text-subtitle-1">Isi Alasan Close SO</v-card-title>
                <v-card-text class="pa-4">
                    <p class="text-caption mb-2">Anda akan menutup SO Nomor: <strong>{{ itemToClose?.Nomor }}</strong>
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
/* Kelas-kelas ini sekarang akan memberi warna pada teks */
.status-open {
    color: red !important;
}

.status-proses {
    color: navy !important;
}

.status-proses-sebagian {
    color: fuchsia !important;
}

.status-jadi {
    color: olive !important;
}

/* Styling untuk legend box */
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

.detail-table .v-data-table__td {
    white-space: nowrap;
    /* Mencegah teks wrapping */
    overflow: hidden;
    /* Menyembunyikan overflow */
    text-overflow: ellipsis;
    /* Menambahkan elipsis jika teks terpotong */
    padding-inline: 4px !important;
    /* Kurangi padding horizontal */
}

/* Override lebar header kolom */
.detail-table .v-data-table__th {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-inline: 4px !important;
    /* Kurangi padding horizontal */
    font-size: 0.75rem !important;
    /* Kecilkan ukuran font header */
}

/* Paksa lebar kolom pada thead dan tbody */
.detail-table table>thead>tr>th:nth-child(1),
.detail-table table>tbody>tr>td:nth-child(1) {
    width: 120px;
    min-width: 120px;
    max-width: 120px;
}

/* Nomor */
.detail-table table>thead>tr>th:nth-child(2),
.detail-table table>tbody>tr>td:nth-child(2) {
    width: 120px;
    min-width: 120px;
    max-width: 120px;
}

/* Barcode */
.detail-table table>thead>tr>th:nth-child(3),
.detail-table table>tbody>tr>td:nth-child(3) {
    width: 100px;
    min-width: 100px;
    max-width: 100px;
}

/* Kode */
.detail-table table>thead>tr>th:nth-child(4),
.detail-table table>tbody>tr>td:nth-child(4) {
    width: 200px;
    min-width: 200px;
    max-width: 200px;
}

/* Nama Barang */
.detail-table table>thead>tr>th:nth-child(5),
.detail-table table>tbody>tr>td:nth-child(5) {
    width: 70px;
    min-width: 70px;
    max-width: 70px;
}

/* Ukuran */
.detail-table table>thead>tr>th:nth-child(6),
.detail-table table>tbody>tr>td:nth-child(6) {
    width: 80px;
    min-width: 80px;
    max-width: 80px;
}

/* Qty SO */
.detail-table table>thead>tr>th:nth-child(7),
.detail-table table>tbody>tr>td:nth-child(7) {
    width: 100px;
    min-width: 100px;
    max-width: 100px;
}

/* Harga */
.detail-table table>thead>tr>th:nth-child(8),
.detail-table table>tbody>tr>td:nth-child(8) {
    width: 120px;
    min-width: 120px;
    max-width: 120px;
}

/* Total SO */
.detail-table table>thead>tr>th:nth-child(9),
.detail-table table>tbody>tr>td:nth-child(9) {
    width: 100px;
    min-width: 100px;
    max-width: 100px;
}

/* Qty Invoice */
.detail-table table>thead>tr>th:nth-child(10),
.detail-table table>tbody>tr>td:nth-child(10) {
    width: 120px;
    min-width: 120px;
    max-width: 120px;
}

/* Belum Jadi Inv */

/* Atur juga container tabel detail agar tidak terlalu lebar */
.v-data-table.detail-table {
    max-width: fit-content;
    /* Ini akan membuat tabel menyesuaikan lebarnya ke konten */
    margin-inline: auto;
    /* Untuk menengahkan tabel jika max-width lebih kecil dari container */
    background-color: transparent !important;
    /* Pastikan background transparan */
}
</style>

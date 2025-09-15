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
const MENU_ID = '37';

// --- State ---
const list = ref<any[]>([]);
const details = ref<{ [key: string]: any[] }>({});
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref([]);
const selectedCabang = ref(authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '');
const selected = ref([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());
const filterJenis = ref('semua'); // 'semua', 'manual', 'otomatis'
const isConfirmDeleteVisible = ref(false);
const itemToDelete = ref<any>(null);
const confirmDialogText = ref('');

//--- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const canInsert = computed(() => authStore.can(MENU_ID, 'insert') && authStore.user?.cabang !== 'KDC');
const canEdit = computed(() => authStore.can(MENU_ID, 'edit'));
const canDelete = computed(() => authStore.can(MENU_ID, 'delete') && authStore.user?.cabang !== 'KDC');

const isSingleSelected = computed(() => selected.value.length === 1);

const headers = [
    { title: 'Nomor', key: 'Nomor', width: '180px' },
    { title: 'Tanggal', key: 'Tanggal', width: '110px' },
    { title: 'No. SO', key: 'NoSO', width: '180px' },
    { title: 'No. SJ', key: 'NoSJ', width: '180px' },
    { title: 'Terima SJ', key: 'TerimaSJ', width: '110px' },
    { title: 'Keterangan', key: 'Keterangan', width: '300px' },
    { title: 'Otomatis', key: 'Otomatis', align: 'center' },
    { title: 'User', key: 'Created' },
    { title: 'Closing', key: 'Closing', align: 'center' },
];

const detailHeaders = [
    { title: 'Kode', key: 'Kode' },
    { title: 'Barcode', key: 'Barcode' },
    { title: 'Nama Barang', key: 'Nama' },
    { title: 'Ukuran', key: 'Ukuran' },
    { title: 'Stok Minimal', key: 'StokMinimal', align: 'end' },
    { title: 'Stok Maximal', key: 'StokMaximal', align: 'end' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end' },
    { title: 'SJ', key: 'SJ', align: 'end' },
];

const fetchCabangList = async () => {
    try {
        const response = await api.get('/minta-barang/lookup/cabang');
        cabangList.value = response.data;
    } catch (error) { toast.error('Gagal memuat daftar cabang.'); }
};

const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/minta-barang', {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value,
                jenisPermintaan: filterJenis.value,
            }
        });
        list.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data.');
    } finally {
        isLoading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: any[]) => {
    // Cari item yang baru saja di-expand dan belum ada datanya
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
    if (!itemToLoad) return;

    const nomorToLoad = itemToLoad.Nomor;
    loadingDetails.value.add(nomorToLoad);
    try {
        const response = await api.get(`/minta-barang/${nomorToLoad}`);
        details.value[nomorToLoad] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
        // Hapus dari daftar expanded jika gagal agar bisa dicoba lagi
        expanded.value = expanded.value.filter(nomor => nomor !== nomorToLoad);
    } finally {
        loadingDetails.value.delete(nomorToLoad);
    }
};

const getRowClass = (item: any) => {
    if (!item.NoSJ) return 'status-merah';
    if (item.NoSJ && !item.TerimaSJ) return 'status-biru';
    return '';
};

const editItem = () => {
    if (!isSingleSelected.value) return;
    const item = selected.value[0];

    // --- Migrasi Validasi 'Ubah' dari Delphi ---
    if (item.Otomatis === 'Y') {
        return toast.warning('Permintaan Otomatis tidak bisa diubah.');
    }
    if (item.NoSJ) {
        return toast.warning('Sudah dibuatkan SJ, tidak bisa diubah.');
    }
    if (item.Closing === 'Y') {
        return toast.warning('Transaksi sudah Closing, tidak bisa diubah.');
    }

    router.push(`/transaksi/internal/minta-barang/ubah/${item.Nomor}`);
};

const showDeleteConfirmation = () => {
    if (!isSingleSelected.value) return;
    const item = selected.value[0];

    // --- Migrasi Validasi 'Hapus' dari Delphi ---
    if (item.Otomatis === 'Y') {
        return toast.warning('Permintaan Otomatis tidak bisa dihapus.');
    }
    if (item.NoSJ) {
        return toast.warning('Sudah dibuatkan SJ, tidak bisa dihapus.');
    }
    if (item.Closing === 'Y') {
        return toast.warning('Transaksi sudah Closing, tidak bisa dihapus.');
    }

    itemToDelete.value = item;
    confirmDialogText.value = `Anda yakin ingin menghapus data Nomor: ${item.Nomor}?`;
    isConfirmDeleteVisible.value = true;
};

const executeDelete = async () => {
    if (!itemToDelete.value) return;
    try {
        await api.delete(`/minta-barang/${itemToDelete.value.Nomor}`);
        toast.success(`Permintaan Barang ${itemToDelete.value.Nomor} berhasil dihapus.`);
        fetchData();
        selected.value = [];
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
    } finally {
        isConfirmDeleteVisible.value = false;
        itemToDelete.value = null;
    }
};

const exportData = async (type: 'header' | 'detail') => {
    const filters = {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
        jenisPermintaan: filterJenis.value,
    };

    try {
        if (type === 'header') {
            if (list.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');

            toast.info('Membuat file Excel Header...');
            const worksheet = XLSX.utils.json_to_sheet(list.value);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Minta Barang Header");
            XLSX.writeFile(workbook, "Export_MintaBarang_Header.xlsx");
            toast.success('File Header berhasil dibuat.');

        } else if (type === 'detail') {
            toast.info('Mengambil data detail dari server...');
            const response = await api.get('/minta-barang/export-details', { params: filters });

            if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor.');

            toast.info('Membuat file Excel Detail...');
            const worksheet = XLSX.utils.json_to_sheet(response.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Minta Barang Detail");
            XLSX.writeFile(workbook, "Export_MintaBarang_Detail.xlsx");
            toast.success('File Detail berhasil dibuat.');
        }
    } catch (error) {
        toast.error('Gagal mengekspor data.');
    }
};

onMounted(() => {
    fetchCabangList();
    fetchData();
});

watch(
    [startDate, endDate, selectedCabang, filterJenis],
    () => {
        // Panggil fetchData setiap kali salah satu filter berubah
        fetchData();
    }
);
</script>

<template>
    <PageLayout title="Minta Barang ke DC" desktop-mode icon="mdi-package-up">
        <template #header-actions>
            <v-btn v-if="canInsert" size="small" color="primary" prepend-icon="mdi-plus"
                @click="router.push('/transaksi/internal/minta-barang/new')">Baru</v-btn>
            <v-btn v-if="canEdit" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
                @click="editItem">Ubah</v-btn>
            <v-btn v-if="canDelete" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-delete"
                @click="showDeleteConfirmation">Hapus</v-btn>
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

        <div v-if="!hasViewPermission" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div class="browse-content">
            <div class="filter-section">
                <span class="filter-label">Periode:</span>
                <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined" />
                <span class="mx-2">s/d</span>
                <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined" />
                <span class="filter-label ms-4">Cabang:</span>
                <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode"
                    density="compact" hide-details variant="outlined" />
                <v-radio-group v-model="filterJenis" inline hide-details density="compact" class="ms-4">
                    <v-radio label="Semua" value="semua" />
                    <v-radio label="Manual" value="manual" />
                    <v-radio label="Otomatis" value="otomatis" />
                </v-radio-group>
                <v-spacer />
                <div class="legend-group">
                    <div class="legend-item"><v-icon color="red" size="small">mdi-circle-medium</v-icon> Belum Dibuatkan
                        SJ
                    </div>
                    <div class="legend-item"><v-icon color="blue" size="small">mdi-circle-medium</v-icon> Sudah SJ,
                        Belum
                        Diterima</div>
                </div>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" title="Terapkan Filter" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" :headers="headers" :items="list" :loading="isLoading"
                    :item-class="getRowClass" item-value="Nomor" density="compact" class="desktop-table" fixed-header
                    show-select return-object show-expand @update:expanded="loadDetails">
                    <template #item.Tanggal="{ item }">{{ format(parseISO(item.Tanggal), 'dd/MM/yyyy') }}</template>
                    <template #item.Otomatis="{ item }">
                        <v-chip size="x-small" :color="item.Otomatis === 'Y' ? 'cyan' : 'purple'" label>{{ item.Otomatis
                            === 'Y' ? 'Otomatis' : 'Manual' }}</v-chip>
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

        <v-dialog v-model="isConfirmDeleteVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
                <v-card-text v-html="confirmDialogText"></v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn @click="isConfirmDeleteVisible = false">Batal</v-btn>
                    <v-btn color="error" @click="executeDelete">Ya, Hapus</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </PageLayout>
</template>

<style scoped>
.browse-content {
    height: auto;
}

:deep(tr.status-merah) {
    color: red !important;
}

:deep(tr.status-biru) {
    color: blue !important;
}

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
</style>

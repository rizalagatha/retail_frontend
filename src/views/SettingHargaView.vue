<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import JenisKaosSearchModal from '@/components/JenisKaosSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '39';

// --- Interfaces ---
interface JenisKaos {
    JenisKaos: string;
    Custom: 'Y' | 'N';
    [key: string]: any;
}
interface UkuranHarga {
    ukuran: string;
    harga: number | null;
}

// --- State ---
const jenisKaosList = ref<JenisKaos[]>([]);
const isLoading = ref(true);
const search = ref('');
const selected = ref<JenisKaos[]>([]);

const isEditPanelVisible = ref(false);
const isNew = ref(true);
const editedItem = ref({
    jenisKaos: '',
    custom: 'Y',
    ukuranHarga: [] as UkuranHarga[],
});

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

const isJenisKaosSearchVisible = ref(false);
const isKetersediaanConfirmVisible = ref(false);
const selectedJenisKaos = ref('');

const headers = [
    { title: 'Jenis Kaos', key: 'JenisKaos' },
    { title: 'Tipe', key: 'Custom', align: 'center', width: '100px' },
    { title: 'S', key: 'Harga_S', align: 'end' },
    { title: 'M', key: 'Harga_M', align: 'end' },
    { title: 'L', key: 'Harga_L', align: 'end' },
    { title: 'XL', key: 'Harga_XL', align: 'end' },
    { title: '2XL', key: 'Harga_2XL', align: 'end' },
    { title: '3XL', key: 'Harga_3XL', align: 'end' },
    { title: '4XL', key: 'Harga_4XL', align: 'end' },
    { title: '5XL', key: 'Harga_5XL', align: 'end' },
    { title: '6XL', key: 'Harga_6XL', align: 'end' },
    { title: '7XL', key: 'Harga_7XL', align: 'end' },
    { title: '8XL', key: 'Harga_8XL', align: 'end' },
    { title: '9XL', key: 'Harga_9XL', align: 'end' },
    { title: '10XL', key: 'Harga_10XL', align: 'end' },
    { title: 'Oversize', key: 'Harga_Oversize', align: 'end' },
    { title: 'Jumbo', key: 'Harga_Jumbo', align: 'end' },
];

// --- Methods ---
const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/setting-harga');
        jenisKaosList.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data setting harga.');
    } finally {
        isLoading.value = false;
    }
};

const openNewDialog = () => {
    isJenisKaosSearchVisible.value = true;
};

const handleJenisKaosSelected = (jenisKaos: string) => {
    isJenisKaosSearchVisible.value = false;
    selectedJenisKaos.value = jenisKaos;
    isKetersediaanConfirmVisible.value = true; // Buka dialog konfirmasi ketersediaan
};

const handleKetersediaanConfirmed = async (custom: 'Y' | 'N') => {
    isKetersediaanConfirmVisible.value = false;
    isNew.value = true; // Set mode ke 'baru'

    // Siapkan item untuk diedit
    editedItem.value.jenisKaos = selectedJenisKaos.value;
    editedItem.value.custom = custom;

    // Coba muat harga yang sudah ada untuk kombinasi ini (seperti di Delphi)
    try {
        const response = await api.get(`/setting-harga/${encodeURIComponent(selectedJenisKaos.value)}/${custom}`);
        editedItem.value = response.data;
        isNew.value = false; // Jika data ditemukan, ini menjadi mode 'edit'
    } catch (error) {
        // Jika tidak ditemukan (404), muat template ukuran baru
        try {
            const templateResponse = await api.get('/setting-harga/ukuran-template');
            editedItem.value.ukuranHarga = templateResponse.data.map((u: any) => ({ ukuran: u.ukuran, harga: null }));
        } catch (templateError) {
            toast.error('Gagal memuat template ukuran.');
        }
    } finally {
        isEditPanelVisible.value = true; // Tampilkan panel edit
    }
};

const openEditDialog = async (item: JenisKaos) => {
    isNew.value = false;
    isEditPanelVisible.value = true;
    try {
        const response = await api.get(`/setting-harga/${encodeURIComponent(item.JenisKaos)}/${item.Custom}`);
        editedItem.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat detail harga.');
    }
};

const closeEditPanel = () => {
    isEditPanelVisible.value = false;
};

const save = async () => {
    try {
        await api.post('/setting-harga/save', editedItem.value);
        toast.success('Data harga berhasil disimpan.');
        isEditPanelVisible.value = false;
        fetchData();
    } catch (error) {
        toast.error('Gagal menyimpan data.');
    }
};

const remove = async () => {
    if (selected.value.length === 0) return;
    const itemToDelete = selected.value[0];
    if (confirm(`Yakin ingin menghapus ${itemToDelete.JenisKaos} (${itemToDelete.Custom})?`)) {
        try {
            await api.delete('/setting-harga', { data: { jenisKaos: itemToDelete.JenisKaos, custom: itemToDelete.Custom } });
            toast.success('Data berhasil dihapus.');
            fetchData();
            selected.value = [];
        } catch (error) {
            toast.error('Gagal menghapus data.');
        }
    }
};

const exportData = () => {
    if (jenisKaosList.value.length === 0) {
        toast.info("Tidak ada data untuk diekspor.");
        return;
    }

    // Mengubah nama kolom agar lebih ramah pengguna di file Excel
    const dataToExport = jenisKaosList.value.map(item => ({
        "Jenis Kaos": item.JenisKaos,
        "Tipe": item.Custom === 'Y' ? 'Custom' : 'Stok',
        "Harga S": item.Harga_S,
        "Harga M": item.Harga_M,
        "Harga L": item.Harga_L,
        "Harga XL": item.Harga_XL,
        "Harga 2XL": item.Harga_2XL,
        "Harga 3XL": item.Harga_3XL,
        "Harga 4XL": item.Harga_4XL,
        "Harga 5XL": item.Harga_5XL,
        "Harga 6XL": item.Harga_6XL,
        "Harga 7XL": item.Harga_7XL,
        "Harga 8XL": item.Harga_8XL,
        "Harga 9XL": item.Harga_9XL,
        "Harga 10XL": item.Harga_10XL,
        "Harga Oversize": item.Harga_Oversize,
        "Harga Jumbo": item.Harga_Jumbo,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Setting Harga");
    XLSX.writeFile(workbook, "SettingHarga.xlsx");
    toast.success("Data berhasil diekspor ke Excel.");
};

onMounted(() => {
    if (hasViewPermission.value) {
        fetchData();
    }
});
</script>

<template>
    <PageLayout title="Setting Harga" desktop-mode icon="mdi-tune-variant">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="openNewDialog"
                prepend-icon="mdi-plus">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="selected.length !== 1"
                @click="openEditDialog(selected[0])" prepend-icon="mdi-pencil">Ubah</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" :disabled="selected.length !== 1"
                @click="remove" prepend-icon="mdi-delete">Hapus</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" @click="exportData" prepend-icon="mdi-file-excel">
                Export
            </v-btn>
        </template>

        <div v-if="!hasViewPermission" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div v-else class="browse-content">
            <div class="filter-section">
                <v-text-field v-model="search" density="compact" label="Cari Jenis Kaos..."
                    prepend-inner-icon="mdi-magnify" variant="outlined" hide-details single-line></v-text-field>
                <v-spacer></v-spacer>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
            </div>

            <v-data-table v-model="selected" :headers="headers" :items="jenisKaosList" :search="search"
                :loading="isLoading" item-value="JenisKaos" density="compact" class="desktop-table" fixed-header
                show-select return-object>
                <template #item.Custom="{ item }">
                    <v-chip :color="item.Custom === 'Y' ? 'blue' : 'green'" size="x-small">{{ item.Custom === 'Y' ?
                        'Custom' : 'Stok' }}</v-chip>
                </template>
                <template v-for="col in headers.filter(h => h.key.startsWith('Harga'))" #[`item.${col.key}`]="{ item }">
                    {{ new Intl.NumberFormat('id-ID').format(item[col.key] || 0) }}
                </template>
            </v-data-table>
        </div>

        <JenisKaosSearchModal v-if="isJenisKaosSearchVisible" @close="isJenisKaosSearchVisible = false"
            @select="handleJenisKaosSelected" />

        <v-dialog v-model="isKetersediaanConfirmVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6">Konfirmasi Ketersediaan</v-card-title>
                <v-card-text>Pilih tipe ketersediaan untuk jenis kaos ini.</v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer></v-spacer>
                    <v-btn @click="handleKetersediaanConfirmed('N')">Stok Gudang</v-btn>
                    <v-btn color="primary" variant="elevated" @click="handleKetersediaanConfirmed('Y')">Custom</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="isEditPanelVisible" persistent max-width="800px">
            <v-card class="dialog-card">
                <v-toolbar color="primary" density="compact">
                    <v-toolbar-title class="text-subtitle-1">{{ isNew ? 'Tambah Setting Harga Baru' : 'Ubah Setting Harga' }}</v-toolbar-title>
                </v-toolbar>
                <v-card-text class="pa-4">
                    <v-row dense>
                        <v-col cols="8">
                            <v-text-field v-model="editedItem.jenisKaos" label="Jenis Kaos" variant="filled"
                                density="compact" readonly></v-text-field>
                        </v-col>
                        <v-col cols="4">
                            <v-radio-group v-model="editedItem.custom" inline hide-details density="compact" readonly>
                                <v-radio label="Custom" value="Y"></v-radio>
                                <v-radio label="Stok" value="N"></v-radio>
                            </v-radio-group>
                        </v-col>
                    </v-row>
                    <v-data-table :items="editedItem.ukuranHarga"
                        :headers="[{ title: 'Ukuran', key: 'ukuran' }, { title: 'Harga', key: 'harga' }]"
                        density="compact" class="desktop-table mt-4" fixed-header height="300px">
                        <template #item.harga="{ item }">
                            <v-text-field v-model.number="item.harga" type="number" variant="underlined"
                                density="compact" hide-details></v-text-field>
                        </template>
                    </v-data-table>
                </v-card-text>
                <v-divider></v-divider>
                <v-card-actions class="dialog-footer">
                    <v-spacer></v-spacer>
                    <v-btn size="small" @click="closeEditPanel">Batal</v-btn>
                    <v-btn size="small" color="primary" @click="save">Simpan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </PageLayout>
</template>

<style scoped>
.browse-content {
    border: 1px solid #e0e0e0;
    background-color: #ffffff;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.filter-section {
    padding: 6px 10px;
    border-bottom: 1px solid #e0e0e0;
    flex-shrink: 0;
}

.desktop-table {
    font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 28px !important;
}

.state-container {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}

.dialog-card,
.dialog-footer {
    font-size: 12px;
}

.dialog-footer {
    background-color: #f5f5f5;
}

:deep(.v-data-table-footer) {
    font-size: 11px !important;
}

/* Jika ingin kecil juga tombol navigasinya */
:deep(.v-data-table-footer .v-btn) {
    font-size: 11px !important;
    height: 24px !important;
    min-width: 24px !important;
    padding: 0 6px !important;
}

:deep(.v-data-table-footer .v-select) {
    font-size: 11px !important;
    height: 28px !important;
}
</style>
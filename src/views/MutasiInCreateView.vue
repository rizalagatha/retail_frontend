<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MutasiOutSearchModal from '@/components/MutasiOutSearchModal.vue';

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '44';

// --- Tipe Data ---
interface Item {
    id: number;
    kode: string;
    nama: string;
    ukuran: string;
    qtyMo: number;
    sudah: number;
    belum: number;
    qtyIn: number;
    barcode: string;
}

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Mutasi In' : 'Buat Mutasi In');

const initialHeaderState = {
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    nomorMutasiOut: '',
    nomorSo: '',
    dariCabang: { kode: '', nama: '' },
    keterangan: '',
};
const header = reactive({ ...initialHeaderState });

const items = ref<Item[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isDataSaved = ref(false);

const dialog = reactive({
    mutasiOutSearch: false,
    confirm: false,
});

const confirmAction = ref<(() => void) | null>(null);
const confirmText = ref('');

// --- Konfigurasi Tabel ---
const tableHeaders = [
    { title: 'Kode Barang', key: 'kode', width: '200px' },
    { title: 'Nama Barang', key: 'nama', width: '600px' },
    { title: 'Ukuran', key: 'ukuran', width: '40px' },
    { title: 'Qty Out', key: 'qtyMo', align: 'center', width: '40px' },
    { title: 'Sudah', key: 'sudah', align: 'center', width: '40px' },
    { title: 'Belum', key: 'belum', align: 'center', width: '40px' },
    { title: 'Qty In', key: 'qtyIn', align: 'center', width: '40px' },
    { title: 'Barcode', key: 'barcode', width: '90px' },
];

// --- Methods ---
const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({
            id: Date.now(), kode: '', nama: '', ukuran: '',
            qtyMo: 0, sudah: 0, belum: 0, qtyIn: 0, barcode: ''
        });
    }
};

const loadDataForEdit = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/mutasi-in-form/${nomor}`);
        const { header: miHeader, items: miItems } = response.data;

        Object.assign(header, miHeader); // Salin semua data header
        header.tanggal = format(new Date(miHeader.tanggal), 'yyyy-MM-dd');

        items.value = miItems.map((item: any) => ({
            ...item,
            id: Date.now() + Math.random(),
            belum: (item.qtyOut || 0) - (item.sudah || 0), // <-- Hitung 'belum'
        }));
        addNewRow();

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data.');
        router.back();
    } finally {
        isLoading.value = false;
    }
};

const resetForm = () => {
    Object.assign(header, initialHeaderState); // Kembalikan header ke kondisi awal
    items.value = []; // Kosongkan grid
    addNewRow(); // Tambahkan satu baris kosong baru
    isDataSaved.value = false; // Set ulang status simpan
    toast.info('Form telah dibersihkan.');
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
    confirmText.value = text;
    confirmAction.value = onConfirm;
    dialog.confirm = true;
};

const executeSave = async () => {
    isSaving.value = true;
    const validItems = items.value.filter(item => item.kode && (item.qtyIn || 0) > 0);
    const payload = { header, items: validItems, isNew: !isEditMode.value };

    try {
        const response = await api.post('/mutasi-in-form/save', payload);
        toast.success(response.data.message);

        const nomorMI = response.data.nomor;
        const url = router.resolve({ name: 'Cetak Mutasi In', params: { nomor: nomorMI } }).href;
        window.open(url, '_blank');
        router.push({ name: 'MutasiIn' });
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } finally {
        isSaving.value = false;
    }
};

const handleSave = () => {
    if (!header.nomorMutasiOut) return toast.error('Nomor Mutasi Out harus diisi.');
    const validItems = items.value.filter(i => i.kode && (i.qtyIn || 0) > 0);
    if (validItems.length === 0) return toast.error('Detail barang atau Qty In harus diisi.');
    for (const item of validItems) {
        if (item.qtyIn > item.belum) {
            return toast.error(`Qty In untuk ${item.nama} (${item.ukuran}) melebihi sisa (Belum).`);
        }
    }
    showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data Mutasi In ini?', executeSave);
};

const handleClose = () => {
    showConfirmation('Konfirmasi Tutup', 'Tutup form dan kembali ke halaman browse?', () => router.push({ name: 'MutasiIn' }));
};

const getQtyInClass = (item: Item) => {
    return (item.qtyIn || 0) > item.belum ? 'qty-error' : '';
};

const openMutasiOutSearch = () => {
    dialog.mutasiOutSearch = true;
};

const onMutasiOutSelected = async (mutasiOut: { Nomor: string }) => {
    dialog.mutasiOutSearch = false;
    await loadItemsFromMutasiOut(mutasiOut.Nomor);
};

const loadItemsFromMutasiOut = async (nomorMutasiOut: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/mutasi-in-form/load-from-mo/${nomorMutasiOut}`);
        const { header: moHeader, items: moItems } = response.data;

        header.nomorMutasiOut = moHeader.nomor;
        header.nomorSo = moHeader.nomorSo;
        header.dariCabang = { kode: moHeader.dariCabangKode, nama: moHeader.dariCabangNama };

        items.value = moItems.map((item: any) => ({
            ...item,
            id: Date.now() + Math.random(),
            belum: (item.qtyOut || 0) - (item.sudah || 0), // <-- Hitung 'belum'
            qtyIn: 0,
        }));
        addNewRow();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data dari Mutasi Out.');
        header.nomorMutasiOut = '';
    } finally {
        isLoading.value = false;
    }
};

// Tambahkan fungsi untuk menangani klik tombol Batal
const handleCancel = () => {
    // Panggil dialog konfirmasi, jika dikonfirmasi, jalankan resetForm
    showConfirmation(
        'Konfirmasi Batal',
        'Data yang belum disimpan akan hilang. Lanjutkan membersihkan form?',
        resetForm
    );
};

onMounted(() => {
    const nomor = route.params.nomor as string;
    if (isEditMode.value && nomor) {
        loadDataForEdit(nomor);
    } else {
        resetForm();
        isLoading.value = false;
    }
});
</script>

<template>
    <PageLayout :title="pageTitle" icon="mdi-truck-plus-outline">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="handleSave" :loading="isSaving"
                prepend-icon="mdi-content-save">Simpan</v-btn>
            <v-btn size="small" @click="handleCancel" prepend-icon="mdi-refresh">
                Batal
            </v-btn>
            <v-btn size="small" @click="handleClose" prepend-icon="mdi-close">Tutup</v-btn>
        </template>

        <div class="form-grid-container">
            <!-- Left Column: Header -->
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-row dense>
                        <v-col cols="12">
                            <v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact"
                                hide-details>
                                <template #append-inner><span v-if="!header.nomor"
                                        class="text-caption">&lt;Otomatis&gt;</span></template>
                            </v-text-field>
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                                density="compact" hide-details />
                        </v-col>
                        <v-text-field label="No. Mutasi Out" v-model="header.nomorMutasiOut"
                            @click="openMutasiOutSearch" prepend-inner-icon="mdi-magnify" density="compact" hide-details
                            :readonly="isEditMode" />
                        <v-col cols="12">
                            <v-text-field label="Dari Cabang"
                                :model-value="`${header.dariCabang.kode || ''} - ${header.dariCabang.nama || ''}`"
                                readonly filled density="compact" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="No. Pesanan" v-model="header.nomorSo" readonly filled density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-textarea label="Keterangan" v-model="header.keterangan" variant="outlined" rows="3"
                                density="compact" hide-details />
                        </v-col>
                    </v-row>
                </div>
            </div>

            <!-- Right Column: Details Table -->
            <div class="right-column">
                <div class="desktop-form-section d-flex flex-column fill-height">
                    <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
                        class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
                        <template #item.qtyIn="{ item }">
                            <v-text-field v-model.number="item.qtyIn" type="number" variant="underlined"
                                density="compact" hide-details class="text-right" :class="getQtyInClass(item)" />
                        </template>
                        <template #bottom></template>
                    </v-data-table>
                </div>
            </div>
        </div>

        <!-- Modals -->
        <MutasiOutSearchModal v-if="dialog.mutasiOutSearch" @close="dialog.mutasiOutSearch = false"
            @mutasi-out-selected="onMutasiOutSelected" />

        <v-dialog v-model="dialog.confirm" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">Konfirmasi</v-card-title>
                <v-card-text>{{ confirmText }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="dialog.confirm = false">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal"
                        @click="confirmAction && confirmAction(); dialog.confirm = false">Ya,
                        Lanjutkan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
.desktop-table :deep(td) {
  vertical-align: middle !important;
}
/* Tambahkan blok CSS ini */
.desktop-table :deep(td.v-data-table__td) {
    vertical-align: top;
    /* Memastikan semua sel rata atas */
}

:deep(.qty-error input) {
    color: red !important;
    font-weight: bold;
}
</style>
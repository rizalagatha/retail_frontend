<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import GudangSearchModal from '@/components/GudangSearchModal.vue';

// --- Tipe Data ---
interface Header {
    nomor: string;
    tanggal: string;
    nomorStbj: string;
    tanggalStbj: string;
    asalStbj: string;
    gudangAsal: string;
    gudangRepair: string;
    gudangRepairNama: string;
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '211';

const header = reactive({
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    nomorStbj: '',
    tanggalStbj: '',
    asalStbj: 'P04 - JERON', // Fixed
    gudangAsal: '',
    gudangRepair: 'GRP04', // Fixed
    gudangRepairNama: 'GUDANG REPAIR JERON', // Fixed
    nomorSjGarmen: '',
    tanggalSjGarmen: format(new Date(), 'yyyy-MM-dd'),
});
const summaryItems = ref<any[]>([]); // Tabel 1: Ringkasan
const detailItems = ref<any[]>([]);  // Tabel 2: Detail Barang
const items = ref<any[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const dialogConfirm = reactive({
    show: false,
    title: '',
    text: '',
    onConfirm: () => { },
});

const summaryHeaders = [
    { title: 'SPK', key: 'spk' }, { title: 'Nama', key: 'nama' }, { title: 'Ukuran', key: 'ukuran' },
    { title: 'Jumlah', key: 'jumlah', align: 'end' }, { title: 'Koli', key: 'koli', align: 'end' }, { title: 'Keterangan', key: 'keterangan' },
];
const detailHeaders = [
    { title: 'SPK', key: 'spk' }, { title: 'Kode Barang', key: 'kode' }, { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran' }, { title: 'Jumlah', key: 'jumlah', align: 'end' },
];

// --- Methods ---
const save = () => {
    // Fungsi ini sekarang hanya untuk validasi
    if (!header.gudangRepair) {
        return toast.error('Gudang Repair harus diisi.');
    }
    // Jika validasi lolos, panggil dialog konfirmasi
    showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data penolakan ini?', executeSave);
};

const executeSave = async () => {
    isSaving.value = true;
    try {
        const payload = { header, items: items.value };
        const response = await api.post('/tolak-stbj-form/save', payload);
        toast.success(response.data.message);
        router.push({ name: 'TerimaStbj' });
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } finally {
        isSaving.value = false;
    }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
    dialogConfirm.title = title;
    dialogConfirm.text = text;
    dialogConfirm.onConfirm = onConfirm;
    dialogConfirm.show = true;
};

onMounted(async () => {
    const nomorKirim = route.query.nomorKirim as string;
    if (!nomorKirim) {
        toast.error('Nomor STBJ Kirim tidak valid.');
        return router.back();
    }

    try {
        const response = await api.get(`/tolak-stbj-form/load-from-stbj`, { params: { nomorStbj: nomorKirim } });
        const data = response.data;

        header.nomorStbj = data.header.stbj_nomor;
        header.tanggalStbj = format(parseISO(data.header.stbj_tanggal), 'yyyy-MM-dd');
        header.gudangAsal = data.header.gdgp_cab;

        summaryItems.value = data.summaryItems;
        detailItems.value = data.detailItems;

        // Logika auto-fill gudang repair dari Delphi
        if (header.gudangAsal === 'P01') {
            header.gudangRepair = 'GRP01';
            header.gudangRepairNama = 'GUDANG REPAIR PADOKAN';
        } else {
            header.gudangRepair = 'GRP04';
            header.gudangRepairNama = 'GUDANG REPAIR JERON';
        }
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data STBJ.');
        router.back();
    } finally {
        isLoading.value = false;
    }
});
</script>

<template>
    <PageLayout title="Form Tolak STBJ" desktop-mode>
        <template #header-actions>
            <v-btn size="small" color="primary" @click="save" :loading="isSaving">Simpan</v-btn>
            <v-btn size="small"
                @click="showConfirmation('Konfirmasi Batal', 'Tutup form dan batalkan aksi?', () => router.back())">
                Batal
            </v-btn>
        </template>

        <div class="form-grid-container">
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-row dense class="compact-form">
                        <v-col cols="6"><v-text-field label="No. Tolak" v-model="header.nomor" readonly filled
                                hide-details /></v-col>
                        <v-col cols="6"><v-text-field label="Tgl. Tolak" v-model="header.tanggal" type="date"
                                variant="outlined" hide-details /></v-col>

                        <v-col cols="6"><v-text-field label="No. STBJ" v-model="header.nomorStbj" readonly filled
                                hide-details /></v-col>
                        <v-col cols="6"><v-text-field label="Tgl. STBJ" v-model="header.tanggalStbj" readonly filled
                                hide-details /></v-col>

                        <v-col cols="12"><v-text-field label="Asal STBJ" v-model="header.asalStbj" readonly filled
                                hide-details /></v-col>

                        <v-col cols="4"><v-text-field label="Ke Gudang Prepare" v-model="header.gudangRepair" readonly
                                filled hide-details /></v-col>
                        <v-col cols="8"><v-text-field v-model="header.gudangRepairNama" readonly filled
                                hide-details /></v-col>

                        <v-col cols="6"><v-text-field label="No. SJ Garmen" v-model="header.nomorSjGarmen"
                                variant="outlined" hide-details /></v-col>
                        <v-col cols="6"><v-text-field label="Tgl. SJ Garmen" v-model="header.tanggalSjGarmen"
                                type="date" variant="outlined" hide-details /></v-col>
                    </v-row>
                </div>
            </div>

            <div class="right-column">
                <div class="desktop-form-section d-flex flex-column" style="height: 40%;">
                    <div class="text-subtitle-1 font-weight-bold mb-2">Ringkasan dari Garmen</div>
                    <v-data-table :headers="summaryHeaders" :items="summaryItems" :loading="isLoading"
                        class="desktop-table flex-grow-1" :items-per-page="-1" density="compact" fixed-header>
                        <template #bottom></template>
                    </v-data-table>
                </div>
                <div class="desktop-form-section d-flex flex-column" style="height: 60%;">
                    <div class="text-subtitle-1 font-weight-bold mb-2">Detail Barang yang Ditolak</div>
                    <v-data-table :headers="detailHeaders" :items="detailItems" :loading="isLoading"
                        class="desktop-table flex-grow-1" :items-per-page="-1" density="compact" fixed-header>
                        <template #bottom></template>
                    </v-data-table>
                </div>
            </div>
        </div>
        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal"
                        @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">
                        Ya, Lanjutkan
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
.form-grid-container {
    display: grid;
    /* Kolom kiri 350px, sisanya kolom kanan */
    grid-template-columns: 350px 1fr;
    gap: 16px;
    padding: 16px;
    height: calc(100vh - 120px);
    /* Sesuaikan tinggi agar pas di layar */
}

.left-column,
.right-column {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    /* Penting untuk scrolling */
}

.desktop-form-section {
    background-color: #fff;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
}

.left-column .desktop-form-section {
    flex-shrink: 0;
}

.right-column .desktop-form-section {
    flex-grow: 1;
    /* Agar tabel mengisi semua ruang di kolom kanan */
}

/* Membuat tabel di dalam section bisa scroll */
.desktop-table {
    flex-grow: 1;
    overflow-y: auto;
}

/* CSS untuk merapatkan form di kolom kiri */
.compact-form :deep(.v-col) {
    padding-top: 4px;
    padding-bottom: 4px;
}

.compact-form :deep(.v-label) {
    font-size: 11px !important;
}
</style>
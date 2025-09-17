<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import GudangSearchModal from '@/components/GudangSearchModal.vue';
import StoreSearchModal from '@/components/StoreSearchModal.vue';
import PermintaanSearchModal from '@/components/PermintaanSearchModal.vue';
import TerimaRbSearchModal from '@/components/TerimaRbSearchModal.vue';

// --- Tipe Data ---
interface Item {
    id: number;
    kode: string;
    nama: string;
    ukuran: string;
    minstok: number;
    maxstok: number;
    stok: number;
    minta: number;
    sudah: number;
    belum: number;
    jumlah: number;
    barcode: string;
}

// --- Inisialisasi ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '213';

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Surat Jalan ke Store' : 'Buat Surat Jalan ke Store');
const isLoading = ref(true);
const isSaving = ref(false);

const header = reactive({
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    gudang: { kode: authStore.user?.cabang || '', nama: '' },
    store: { kode: '', nama: '' },
    permintaan: '',
    keterangan: '',
});

const items = ref<Item[]>([]);
const scannedBarcode = ref('');

// Modal states
const dialog = reactive({
    gudangSearch: false,
    storeSearch: false,
    permintaanSearch: false,
    terimaRbSearch: false,
    lookup: false,
});

const dialogConfirm = reactive({
    show: false,
    title: '',
    text: '',
    onConfirm: () => { },
});
const activeRowIndex = ref(0);

// --- Konfigurasi Tabel ---
const tableHeaders = [
    { title: 'Kode Barang', key: 'kode', width: '150px' }, // Dikecilkan
    { title: 'Nama Barang', key: 'nama' }, // Lebar fleksibel
    { title: 'Ukuran', key: 'ukuran', width: '100px' },
    { title: 'Min Buffer', key: 'minstok', align: 'end', width: '100px' },
    { title: 'Max Buffer', key: 'maxstok', align: 'end', width: '100px' },
    { title: 'Stok', key: 'stok', align: 'end', width: '100px' },
    { title: 'Minta', key: 'minta', align: 'end', width: '100px' },
    { title: 'Sudah', key: 'sudah', align: 'end', width: '100px' },
    { title: 'Belum', key: 'belum', align: 'end', width: '100px' },
    { title: 'Jumlah', key: 'jumlah', align: 'end', width: '150px' },
    { title: 'Barcode', key: 'barcode', width: '150px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

// --- Methods ---
const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({
            id: Date.now(), kode: '', nama: '', ukuran: '',
            minstok: 0, maxstok: 0, stok: 0, minta: 0, sudah: 0, belum: 0,
            jumlah: 0, barcode: ''
        });
    }
};

const removeRow = (id: number) => {
    items.value = items.value.filter(item => item.id !== id);
    if (items.value.length === 0) addNewRow();
};

const handleBarcodeScan = async () => {
    const barcode = scannedBarcode.value;
    if (!barcode || !header.gudang.kode) {
        if (!header.gudang.kode) {
            toast.error('Pilih gudang terlebih dahulu!');
        }
        return;
    }

    // --- LOGIKA 1: Jika barang sudah ada di grid, tambah jumlahnya ---
    const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
    if (existingItem) {
        // Validasi agar jumlah tidak melebihi stok
        if (existingItem.jumlah + 1 > existingItem.stok) {
            toast.error(`Stok untuk ${existingItem.nama} (${existingItem.ukuran}) tidak mencukupi.`);
        } else {
            existingItem.jumlah += 1;
            toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
        }
        scannedBarcode.value = '';
        return;
    }

    // --- LOGIKA 2: Jika barang belum ada, cari via API dan tambahkan baris baru ---
    try {
        const response = await api.get(`/surat-jalan-form/by-barcode/${barcode}`, {
            params: { gudang: header.gudang.kode }
        });

        const product = response.data;
        const emptyRowIndex = items.value.findIndex(item => !item.kode);

        if (emptyRowIndex !== -1) {
            items.value.splice(emptyRowIndex, 1, {
                // Data dari hasil scan
                id: Date.now(),
                kode: product.kode,
                nama: product.nama,
                ukuran: product.ukuran,
                stok: product.stok,
                jumlah: 1, // Default jumlah 1
                barcode: product.barcode,

                // Field spesifik Surat Jalan dengan nilai default 0
                minstok: product.minstok || 0,
                maxstok: product.maxstok || 0,
                minta: 0,
                sudah: 0,
                belum: 0,
            });
            addNewRow(); // Tambah baris kosong baru di akhir
        } else {
            toast.error("Tidak ada baris kosong untuk menambahkan item baru.");
        }

    } catch (error: any) {
        toast.error(error.response?.data?.message || `Barcode ${barcode} tidak valid.`);
    } finally {
        scannedBarcode.value = ''; // Selalu kosongkan input setelah proses selesai
    }
};

const openStoreSearch = () => {
    dialog.storeSearch = true;
};

const openPermintaanSearch = () => {
    if (!header.store.kode) {
        return toast.error('Pilih Store terlebih dahulu');
    }
    dialog.permintaanSearch = true;
};

const openTerimaRbSearch = () => {
    dialog.terimaRbSearch = true;
};

const onTerimaRbSelected = async (terimaRb: { nomor: string }) => {
    dialog.terimaRbSearch = false;
    // Panggil fungsi yang sudah ada untuk memuat item ke grid
    await loadItemsFromSource(terimaRb.nomor);
};

const onStoreSelected = (store: { kode: string, nama: string }) => {
    header.store = store;
    dialog.storeSearch = false; // Tutup modal setelah memilih
};

const onGudangSelected = (gudang: { kode: string, nama: string }) => {
    header.gudang = gudang;
    dialog.gudangSearch = false; // Tutup modal setelah memilih
};

const onPermintaanSelected = async (permintaan: { nomor: string }) => {
    header.permintaan = permintaan.nomor;
    dialog.permintaanSearch = false;
    await loadItemsFromSource(permintaan.nomor);
};

const loadItemsFromSource = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get('/surat-jalan-form/load-items', {
            params: { nomor, gudang: header.gudang.kode }
        });
        items.value = response.data.map((item: any) => ({
            ...item,
            id: Date.now() + Math.random(),
            // Hitung 'belum' di frontend
            belum: (item.minta || 0) - (item.sudah || 0)
        }));
        addNewRow();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat item.');
    } finally {
        isLoading.value = false;
    }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
    dialogConfirm.title = title;
    dialogConfirm.text = text;
    dialogConfirm.onConfirm = onConfirm;
    dialogConfirm.show = true;
};

const executeSave = async () => {
    const validItems = items.value.filter(i => i.kode && i.jumlah > 0);

    isSaving.value = true;
    try {
        const payload = { header, items: validItems, isNew: !isEditMode.value };
        const response = await api.post('/surat-jalan-form/save', payload);
        toast.success(response.data.message);

        // Buka halaman cetak di tab baru, lalu reset form
        const nomorSJ = response.data.nomor;
        const url = router.resolve({ name: 'Cetak Surat Jalan', params: { nomor: nomorSJ } }).href;
        window.open(url, '_blank');

        if (isEditMode.value) {
            router.push({ name: 'SuratJalanStore' });
        } else {
            resetForm();
        }

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } finally {
        isSaving.value = false;
    }
};

const handleSave = () => {
    // Validasi frontend sebelum konfirmasi
    if (!header.gudang.kode) return toast.error('Gudang harus diisi.');
    if (!header.store.kode) return toast.error('Store tujuan harus diisi.');
    const validItems = items.value.filter(i => i.kode && i.jumlah > 0);
    if (validItems.length === 0) return toast.error('Detail barang harus diisi.');

    showConfirmation('Konfirmasi Simpan', 'Apakah Anda yakin ingin menyimpan data ini?', executeSave);
};

const resetForm = () => {
    // Simpan gudang sebelum reset
    const savedGudang = { ...header.gudang };

    // Reset header ke nilai awal
    Object.assign(header, {
        nomor: '',
        tanggal: format(new Date(), 'yyyy-MM-dd'),
        gudang: savedGudang, // Kembalikan gudang
        store: { kode: '', nama: '' },
        permintaan: '',
        keterangan: '',
    });

    // Reset grid
    items.value = [];
    addNewRow();
    toast.info('Form telah dibersihkan.');
};

const handleCancel = () => {
    showConfirmation('Konfirmasi Batal', 'Data yang belum disimpan akan hilang. Lanjutkan?', resetForm);
};

const handleClose = () => {
    showConfirmation('Konfirmasi Tutup', 'Tutup form dan kembali ke halaman browse?', () => router.push({ name: 'SuratJalanStore' }));
};

onMounted(async () => {
    if (isEditMode.value) {
        const nomor = route.params.nomor as string;
        try {
            const response = await api.get(`/surat-jalan-form/${nomor}`);
            const data = response.data;
            header.nomor = data.header.nomor;
            header.tanggal = format(new Date(data.header.tanggal), 'yyyy-MM-dd');
            header.gudang = { kode: data.header.gudang_kode, nama: data.header.gudang_nama };
            header.store = { kode: data.header.store_kode, nama: data.header.store_nama };
            header.permintaan = data.header.permintaan;
            header.keterangan = data.header.keterangan;
            items.value = data.items.map((item: any) => ({ ...item, id: Date.now() + Math.random() }));
        } catch (error) {
            toast.error('Gagal memuat data untuk diubah.');
            router.back();
        }
    } else {
        // Untuk form baru, coba fetch nama gudang default
        if (header.gudang.kode) {
            // Anda bisa buat endpoint lookup by ID atau handle di frontend
            header.gudang.nama = ''; // Placeholder
        }
    }
    addNewRow();
    isLoading.value = false;
});
</script>

<template>
    <PageLayout :title="pageTitle" icon="mdi-truck-plus-outline">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="handleSave" :loading="isSaving" prepend-icon="mdi-content-save">
                Simpan
            </v-btn>
            <v-btn size="small" @click="handleCancel" prepend-icon="mdi-refresh">
                Batal
            </v-btn>
            <v-btn size="small" @click="handleClose" prepend-icon="mdi-close">
                Tutup
            </v-btn>
        </template>

        <div class="form-grid-container">
            <!-- Left Column: Header -->
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-row dense>
                        <v-col cols="12">
                            <v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Gudang" v-model="header.gudang.kode" readonly
                                @click="dialog.gudangSearch = true" prepend-inner-icon="mdi-magnify" density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Nama Gudang" v-model="header.gudang.nama" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Ke Store" v-model="header.store.kode" @click="openStoreSearch"
                                prepend-inner-icon="mdi-magnify" density="compact" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Nama Store" v-model="header.store.nama" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="No. Permintaan" v-model="header.permintaan"
                                @click="openPermintaanSearch" prepend-inner-icon="mdi-magnify" density="compact"
                                :disabled="isEditMode" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-textarea label="Keterangan" v-model="header.keterangan" rows="3" variant="outlined"
                                density="compact" hide-details />
                        </v-col>
                    </v-row>
                </div>
            </div>

            <!-- Right Column: Details -->
            <div class="right-column">
                <div class="desktop-form-section d-flex flex-column fill-height">
                    <div class="d-flex justify-space-between align-center mb-2">
                        <div class="scanner-wrapper">
                            <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
                                placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
                                prepend-inner-icon="mdi-barcode-scan" hide-details clearable
                                @keydown.enter.prevent="handleBarcodeScan">
                            </v-text-field>
                        </div>
                        <v-btn size="small" @click="openTerimaRbSearch" prepend-icon="mdi-package-down">Load from Terima
                            RB</v-btn>
                    </div>
                    <v-data-table :headers="tableHeaders" :items="items" class="desktop-table fill-height-table"
                        density="compact" fixed-header :items-per-page="-1">
                        <template #item.kode="{ item }">
                            <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                                readonly />
                        </template>
                        <template #item.nama="{ item }">
                            <div class="scrollable-cell">
                                {{ item.nama }}
                            </div>
                        </template>
                        <template #item.jumlah="{ item }">
                            <v-text-field v-model.number="item.jumlah" type="number" variant="underlined"
                                density="compact" hide-details class="text-right" />
                        </template>
                        <template #item.actions="{ item }">
                            <v-btn icon="mdi-delete" size="x-small" variant="text" color="error"
                                @click="removeRow(item.id)" />
                        </template>
                        <template #bottom>
                            <div class="pa-2 text-right">
                                <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus" variant="text"
                                    color="primary">Tambah Baris</v-btn>
                            </div>
                        </template>
                    </v-data-table>
                </div>
            </div>
        </div>

        <GudangSearchModal v-if="dialog.gudangSearch" :user-cabang="authStore.user?.cabang || ''"
            @close="dialog.gudangSearch = false" @gudang-selected="onGudangSelected" />
        <StoreSearchModal v-if="dialog.storeSearch" @close="dialog.storeSearch = false"
            @store-selected="onStoreSelected" />
        <PermintaanSearchModal v-if="dialog.permintaanSearch" :store-kode="header.store.kode"
            @close="dialog.permintaanSearch = false" @permintaan-selected="onPermintaanSelected" />
        <TerimaRbSearchModal v-if="dialog.terimaRbSearch" @close="dialog.terimaRbSearch = false"
            @terima-rb-selected="onTerimaRbSelected" />

        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                    <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
                        <v-btn color="primary" variant="tonal"
                            @click="dialogConfirm.onConfirm(); dialogConfirm.show = false">
                            Ya, Lanjutkan
                        </v-btn>
                    </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
.desktop-table :deep(.scrollable-cell) {
    white-space: nowrap;
    overflow-x: auto;
    max-width: 450px;
    min-width: 300px;
    height: 22px;
    display: block;
    padding-bottom: 5px;
    margin-bottom: -5px;
}

.scanner-wrapper {
    max-width: 400px;
    /* <-- ATUR LEBAR MAKSIMUM DI SINI */
    flex: none;
    /* Mencegah flexbox meregangkan wrapper ini */
    margin-bottom: 16px;
}
</style>
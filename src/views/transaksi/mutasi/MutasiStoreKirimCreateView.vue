<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import StoreSearchModal from '@/components/StoreSearchModal.vue';
import MintaBarangSearchModal from '@/components/MintaBarangSearchModal.vue'; // Kita reuse modal ini

// --- Tipe Data ---
interface Header {
    nomor: string;
    tanggal: string;
    storeTujuanKode: string;
    storeTujuanNama: string;
    keterangan: string;
}
interface Item {
    id: number;
    kode: string;
    nama: string;
    ukuran: string;
    stok: number;
    jumlah: number;
    barcode: string;
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '46'; // Sesuaikan

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Mutasi Antar Store' : 'Buat Mutasi Antar Store');

const header = reactive<Header>({
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    storeTujuanKode: '',
    storeTujuanNama: '',
    keterangan: '',
});
const items = ref<Item[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const dialog = reactive({ storeSearch: false, productSearch: false });
const isMultiSelectProduct = ref(false);
const activeRowIndex = ref(0);
const scannedBarcode = ref('');
const dialogConfirm = reactive({
    show: false,
    title: '',
    text: '',
    onConfirm: () => { },
});

const tableHeaders = [
    { title: 'Kode Barang', key: 'kode', width: '200px' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran', width: '80px' },
    { title: 'Stok', key: 'stok', width: '80px' },
    { title: 'Jumlah', key: 'jumlah', width: '80px' },
    { title: 'Barcode', key: 'barcode', width: '150px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

// --- Methods ---
const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({ id: Date.now(), kode: '', nama: '', ukuran: '', stok: 0, jumlah: 0, barcode: '' });
    }
};

const removeRow = (id: number) => {
    items.value = items.value.filter(item => item.id !== id);
    if (items.value.length === 0) addNewRow();
};

const onStoreSelected = (store: { kode: string, nama: string }) => {
    header.storeTujuanKode = store.kode;
    header.storeTujuanNama = store.nama;
    dialog.storeSearch = false;
};

const openProductSearch = (index: number, isMulti: boolean) => {
    activeRowIndex.value = index;
    isMultiSelectProduct.value = isMulti;
    dialog.productSearch = true;
};

const onProductsSelected = async (selectedProducts: any[]) => {
    dialog.productSearch = false;
    const productsToAdd = selectedProducts.filter(p => !items.value.some(item => item.kode === p.kode && item.ukuran === p.ukuran));

    try {
        const detailPromises = productsToAdd.map(p => api.get('/mutasi-kirim-form/lookup/product-details', { params: { kode: p.kode, ukuran: p.ukuran, gudang: authStore.user?.cabang } }));
        const responses = await Promise.all(detailPromises);
        const newItems = responses.map(res => ({ ...res.data, id: Date.now() + Math.random(), jumlah: 1 }));

        items.value.splice(activeRowIndex.value, 1, ...newItems);
        addNewRow();
    } catch (error) {
        toast.error('Gagal memuat detail produk.');
    }
};

const validateJumlah = (item: Item) => {
    if ((item.jumlah || 0) > item.stok) {
        toast.error(`Jumlah untuk ${item.nama} (${item.ukuran}) melebihi stok.`);
        item.jumlah = item.stok;
    }
};

const save = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!isEditMode.value && new Date(header.tanggal) < today) {
        toast.error('Tanggal tidak boleh mundur dari hari ini.');
        return;
    }
    // Validasi dari Delphi
    if (!header.storeTujuanKode) return toast.error('Store Tujuan harus diisi.');
    const validItems = items.value.filter(i => i.kode);
    if (validItems.length === 0) return toast.error('Detail barang harus diisi.');
    if (validItems.some(i => (i.jumlah || 0) <= 0)) return toast.error('Jumlah harus diisi lebih dari 0.');
    if (validItems.some(i => (i.jumlah || 0) > i.stok)) return toast.error('Ada jumlah yang melebihi stok.');

    showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data ini?', executeSave);
};

const executeSave = async () => {
    isSaving.value = true;
    const payload = {
        header,
        items: items.value.filter(i => i.kode),
        isNew: !isEditMode.value
    };
    try {
        const response = await api.post('/mutasi-kirim-form/save', payload);
        toast.success(response.data.message);
        const nomorDokumen = response.data.nomor;
        if (nomorDokumen) {
            const url = router.resolve({ name: 'MutasiKirimPrint', params: { nomor: nomorDokumen } }).href;
            window.open(url, '_blank');
        }
        router.push({ name: 'MutasiKirim' });
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

const resetForm = () => {
    // Ganti dengan logika reset form Anda, contoh:
    Object.assign(header, {
        nomor: '',
        tanggal: format(new Date(), 'yyyy-MM-dd'),
        storeTujuanKode: '',
        storeTujuanNama: '',
        keterangan: '',
    });
    items.value = [];
    addNewRow();
    toast.info('Form telah dibersihkan.');
};

const closeForm = () => {
    router.push({ name: 'MutasiKirim' });
};

const handleCancel = () => {
    showConfirmation('Konfirmasi Batal', 'Batalkan semua perubahan dan kosongkan form?', resetForm);
};

const handleClose = () => {
    showConfirmation('Konfirmasi Tutup', 'Tutup form? Perubahan yang belum disimpan akan hilang.', closeForm);
};

const handleBarcodeScan = async () => {
    const gudang = authStore.user?.cabang;
    const barcode = scannedBarcode.value;

    if (!gudang) return toast.error('Gudang tidak terdefinisi!');
    if (!barcode) return;

    // Cek jika item sudah ada, tambahkan jumlah
    const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
    if (existingItem) {
        if ((existingItem.jumlah + 1) > existingItem.stok) {
            toast.error('Jumlah melebihi stok yang tersedia.');
        } else {
            existingItem.jumlah = (existingItem.jumlah || 0) + 1;
            toast.info(`Jumlah untuk ${existingItem.nama} ditambah.`);
        }
        scannedBarcode.value = '';
        return;
    }

    try {
        // Panggil endpoint barcode yang baru
        const response = await api.get(`/mutasi-kirim-form/lookup/by-barcode/${barcode}`, {
            params: { gudang }
        });
        const product = response.data;

        // Cari baris kosong untuk diisi
        const emptyRowIndex = items.value.findIndex(item => !item.kode);
        if (emptyRowIndex !== -1) {
            if (1 > product.stok) {
                toast.error('Jumlah melebihi stok yang tersedia.');
                scannedBarcode.value = '';
                return;
            }
            items.value.splice(emptyRowIndex, 1, {
                id: Date.now(),
                kode: product.kode,
                nama: product.nama,
                ukuran: product.ukuran,
                stok: product.stok,
                barcode: product.barcode,
                jumlah: 1, // Jumlah awal
            });
            addNewRow(); // Tambah baris kosong baru di akhir
        } else {
            toast.error("Tidak ada baris kosong untuk menambahkan item baru.");
        }
    } catch (error: any) {
        toast.error(error.response?.data?.message || `Barcode ${barcode} tidak valid.`);
    } finally {
        scannedBarcode.value = ''; // Selalu kosongkan input scanner
    }
};


onMounted(async () => {
    if (!authStore.can(MENU_ID, isEditMode.value ? 'edit' : 'insert')) {
        toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data ini.`);
        router.back(); // Lempar user kembali
        return;
    }

    const nomor = route.params.nomor as string;
    if (isEditMode.value && nomor) {
        const response = await api.get(`/mutasi-kirim-form/${nomor}`);
        Object.assign(header, response.data.header);
        header.tanggal = format(parseISO(header.tanggal), 'yyyy-MM-dd');
        items.value = response.data.items.map((item: any) => ({ ...item, id: Date.now() + Math.random() }));
    }
    addNewRow();
    isLoading.value = false;
});
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-package-variant-closed">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="save" :loading="isSaving"
                :disabled="!authStore.can(MENU_ID, isEditMode ? 'edit' : 'insert')">
                Simpan
            </v-btn>
            <v-btn size="small" @click="handleCancel">Batal</v-btn>
            <v-btn size="small" @click="handleClose">Tutup</v-btn>
        </template>

        <div class="form-grid-container">
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
                            <v-text-field label="Ke Store" v-model="header.storeTujuanKode" readonly
                                @click="dialog.storeSearch = true" prepend-inner-icon="mdi-magnify" density="compact"
                                hide-details variant="outlined" />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Nama Store" v-model="header.storeTujuanNama" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-textarea label="Keterangan" v-model="header.keterangan" variant="outlined" rows="3"
                                density="compact" hide-details />
                        </v-col>
                    </v-row>
                </div>
            </div>

            <div class="right-column">
                <div class="scanner-wrapper mb-4">
                    <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
                        placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
                        prepend-inner-icon="mdi-barcode-scan" hide-details clearable
                        @keydown.enter.prevent="handleBarcodeScan" />
                </div>
                <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
                    class="desktop-table fill-height-table" fixed-header>
                    <template #item.kode="{ item, index }">
                        <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                            placeholder="F1/F2..." @keydown.f1.prevent="openProductSearch(index, false)"
                            @keydown.f2.prevent="openProductSearch(index, true)" />
                    </template>
                    <template #item.jumlah="{ item }">
                        <v-text-field v-model.number="item.jumlah" type="number" min="0" variant="underlined"
                            density="compact" hide-details class="text-end" @blur="validateJumlah(item)" />
                    </template>
                    <template #item.actions="{ item }">
                        <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                            @click="removeRow(item.id)" />
                    </template>
                    <template #bottom>
                        <div class="pa-2 text-right">
                            <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus">Tambah Baris</v-btn>
                        </div>
                    </template>
                </v-data-table>
            </div>
        </div>

        <StoreSearchModal v-if="dialog.storeSearch" :exclude-branch="authStore.user?.cabang"
            @close="dialog.storeSearch = false" @store-selected="onStoreSelected" />
        <MintaBarangSearchModal v-if="dialog.productSearch" :gudang="authStore.user?.cabang || ''"
            :multi="isMultiSelectProduct" @close="dialog.productSearch = false"
            @products-selected="onProductsSelected" />

        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
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
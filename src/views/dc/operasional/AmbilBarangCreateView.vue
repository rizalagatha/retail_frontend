<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MintaBarangSearchModal from '@/components/MintaBarangSearchModal.vue';
import GudangSearchModal from '@/components/GudangSearchModal.vue';
import AuthorizationModal from '@/components/AuthorizationModal.vue';

// --- Tipe Data ---
interface FormHeader {
    nomor: string | null;
    tanggal: string;
    nomorTerima: string | null;
    gudangKode: string;
    gudangNama: string;
    storeKode: string;
    storeNama: string;
    peminta: string;
}
interface DetailItem {
    id: number;
    kode: string;
    barcode: string;
    nama: string;
    ukuran: string;
    stok: number;
    jumlah: number;
}
interface Product {
    kode: string;
    barcode: string;
    nama: string;
    ukuran: string;
    stok: number;
}

// --- Inisialisasi & State ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '253';

const isEditMode = ref(false);
const loading = ref(true);
const formHeader = ref<FormHeader>({
    nomor: null,
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    nomorTerima: null,
    gudangKode: authStore.user?.cabang || '',
    gudangNama: authStore.user?.namaCabang || '',
    storeKode: 'K01',
    storeNama: 'PADOKAN',
    peminta: '',
});
const items = ref<DetailItem[]>([]);
const scannedBarcode = ref('');
const activeRowIndex = ref(0);
const isMultiSelectProduct = ref(false);
const isClosed = ref(false);

// --- State Modal & Otorisasi ---
const isLookupVisible = ref(false);
const isGudangLookupVisible = ref(false);
const authDialog = reactive({ show: false, code: '', input: '' });
const authModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null); // <-- 2. Ref untuk modal
const authModal = reactive({ // <-- 3. Ganti nama dari authDialog
    show: false,
    challengeCode: '',
});
const approvalInfo = ref({ status: '', urut: 0 });
const dialogConfirm = reactive({
    show: false,
    title: '',
    text: '',
    onConfirm: () => { },
});

// --- Computed Properties ---
const pageTitle = computed(() => isEditMode.value ? 'Ubah Pengambilan Barang' : 'Buat Pengambilan Barang');
const totalJumlah = computed(() => items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0));

// --- Headers Tabel ---
const headers = [
    { title: 'No.', key: 'no', sortable: false, width: '50px' },
    { title: 'Kode Barang', key: 'kode', sortable: false, width: '200px' },
    { title: 'Nama Barang', key: 'nama', sortable: false },
    { title: 'Ukuran', key: 'ukuran', sortable: false, width: '100px' },
    { title: 'Stok', key: 'stok', sortable: false, align: 'end', width: '100px' },
    { title: 'Jumlah', key: 'jumlah', sortable: false, align: 'end', width: '120px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '80px', align: 'center' }
];

// --- Methods ---
const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
    dialogConfirm.title = title;
    dialogConfirm.text = text;
    dialogConfirm.onConfirm = onConfirm;
    dialogConfirm.show = true;
};

const refreshdata = () => {
    formHeader.value.peminta = '';
    formHeader.value.tanggal = format(new Date(), 'yyyy-MM-dd');
    // reset header lain jika perlu
    items.value = [];
    addNewRow();
    toast.info('Form telah dibatalkan dan direset.');
};

const addNewRow = () => {
    if (!items.value.some(item => !item.kode)) {
        items.value.push({
            id: Date.now(),
            kode: '', barcode: '', nama: '', ukuran: '', stok: 0, jumlah: 0,
        });
    }
};

const loadDataForEdit = async (id: string) => {
    loading.value = true;
    try {
        // 1. Ambil data utama (header & item)
        const response = await api.get(`/ambil-barang-form/${id}`);
        formHeader.value = response.data.header;
        items.value = response.data.items.map((item: any) => ({ ...item, id: Math.random() }));
        addNewRow();

        if (response.data.header.closing === 'Y') {
            isClosed.value = true;
            toast.warning('Dokumen ini sudah di-closing dan tidak dapat diubah.');
        }

        // 2. Ambil status approval jika tanggal transaksi < tanggal closing (logika disederhanakan)
        // Anda perlu logika tanggal closing yang lebih detail di sini jika diperlukan
        const responseStatus = await api.get(`/ambil-barang-form/${id}/approval-status`);
        approvalInfo.value = responseStatus.data;

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data.');
        router.back();
    } finally {
        loading.value = false;
    }
};

const handleBarcodeScan = async () => {
    const barcode = scannedBarcode.value;
    if (!barcode) return;
    try {
        const response = await api.get('/ambil-barang-form/lookup/product-by-barcode', {
            params: { barcode, gudang: formHeader.value.gudangKode }
        });
        processProductSelection(response.data); // Gunakan processProductSelection yang sudah ada
        scannedBarcode.value = '';
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Produk tidak ditemukan');
    }
};

const handleBarcodeEnter = async (index: number) => {
    const barcode = items.value[index].kode;
    if (!barcode) return;
    try {
        const response = await api.get('/ambil-barang-form/lookup/product-by-barcode', {
            params: { barcode, gudang: formHeader.value.gudangKode }
        });
        // Ganti onProductsSelected dengan onProductsSelected dari dalam grid
        const product = response.data;
        // Cek duplikat
        const existingIndex = items.value.findIndex(i => i.kode === product.kode && i.ukuran === product.ukuran && i !== items.value[index]);
        if (existingIndex !== -1) {
            items.value[existingIndex].jumlah += 1;
            items.value.splice(index, 1); // Hapus baris input
            toast.info('Jumlah item yang sudah ada ditambah 1.');
        } else {
            const currentItem = items.value[index];
            currentItem.kode = product.kode;
            currentItem.barcode = product.barcode;
            currentItem.nama = product.nama;
            currentItem.ukuran = product.ukuran;
            currentItem.stok = product.stok;
            currentItem.jumlah = 1;
        }
        addNewRow();

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Produk tidak ditemukan');
        items.value[index].kode = '';
    }
};

const openProductSearch = (index: number, isMulti: boolean) => {
    activeRowIndex.value = index;
    isMultiSelectProduct.value = isMulti;
    isLookupVisible.value = true;
};

const onProductsSelected = (selectedProducts: Product[]) => {
    isLookupVisible.value = false;
    if (!selectedProducts || selectedProducts.length === 0) return;

    // Saring produk duplikat yang sudah ada di grid
    const productsToAdd = selectedProducts.filter(p =>
        !items.value.some(item => item.kode === p.kode && item.ukuran === p.ukuran)
    );

    if (productsToAdd.length < selectedProducts.length) {
        toast.info("Beberapa produk yang dipilih sudah ada di dalam daftar.");
    }
    if (productsToAdd.length === 0) return;

    // Ubah produk terpilih menjadi format item untuk grid
    const newItems = productsToAdd.map(product => ({
        id: Date.now() + Math.random(),
        kode: product.kode,
        barcode: product.barcode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        jumlah: 1,
    }));

    // Ganti baris kosong saat ini (atau baris tempat F1/F2 ditekan) dengan item baru
    items.value.splice(activeRowIndex.value, 1, ...newItems);

    // Tambahkan baris kosong baru di akhir
    addNewRow();
};

const onGudangSelected = (gudang: { kode: string, nama: string }) => {
    formHeader.value.gudangKode = gudang.kode;
    formHeader.value.gudangNama = gudang.nama;
    isGudangLookupVisible.value = false;
};

const validateGudangKode = async () => {
    const kode = formHeader.value.gudangKode;
    if (!kode) {
        formHeader.value.gudangNama = '';
        return;
    }

    try {
        // Asumsi ada endpoint untuk mengambil satu gudang berdasarkan kodenya
        const response = await api.get(`/warehouses/${kode}`);
        if (response.data) {
            formHeader.value.gudangNama = response.data.nama;
        } else {
            formHeader.value.gudangNama = '';
            toast.error('Kode Gudang tidak ditemukan.');
        }
    } catch (error) {
        formHeader.value.gudangNama = '';
        toast.error('Kode Gudang tidak ditemukan.', error);
    }
};

const processProductSelection = (product: Product) => {
    const existingItem = items.value.find(i => i.kode === product.kode && i.ukuran === product.ukuran);
    if (existingItem) {
        existingItem.jumlah += 1;
        toast.info('Jumlah item yang sudah ada ditambah 1.');
        return;
    }
    // Hapus baris kosong terakhir jika ada, sebelum menambah item baru
    const emptyRowIndex = items.value.findIndex(item => !item.kode);
    if (emptyRowIndex !== -1) {
        items.value.splice(emptyRowIndex, 1);
    }
    // Tambahkan item baru
    items.value.push({
        id: Date.now(),
        kode: product.kode,
        barcode: product.barcode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        jumlah: 1,
    });
    // Tambahkan lagi baris kosong di akhir
    addNewRow();
};

const deleteRow = (index: number) => {
    if (items.value.length > 1) {
        items.value.splice(index, 1);
    }
};

const validateForm = () => {
    if (!formHeader.value.peminta) {
        toast.error('Peminta harus diisi.');
        return false;
    }
    const validItems = items.value.filter(item => item.kode && item.jumlah > 0);
    if (validItems.length === 0) {
        toast.error('Detail barang harus diisi minimal 1 baris.');
        return false;
    }
    for (const item of validItems) {
        if (item.jumlah > item.stok) {
            toast.error(`Jumlah untuk item ${item.nama} (${item.ukuran}) melebihi stok.`);
            return false;
        }
    }
    return true;
};

const handleSave = () => {
    // Validasi status approval (meniru `btnSimpanClick` Delphi)
    if (isEditMode.value && ['MINTA', 'WAIT', 'TOLAK'].includes(approvalInfo.value.status)) {
        toast.warning('Transaksi ini sudah ditutup. Silakan ajukan & tunggu persetujuan untuk mengubah data.');
        return;
    }

    if (!validateForm()) return;

    showConfirmation('Konfirmasi Simpan', 'Apakah Anda yakin ingin menyimpan data ini?', () => {
        // Logika otorisasi yang sudah ada dipindahkan ke dalam onConfirm
        authModal.challengeCode = String(Math.floor(Math.random() * (999 - 100 + 1) + 100));
        authModal.show = true;
    });
};

const handleBatal = () => {
    showConfirmation('Konfirmasi Batal', 'Semua perubahan yang belum disimpan akan hilang. Lanjutkan?', () => {
        refreshdata();
    });
};

const handleTutup = () => {
    showConfirmation('Konfirmasi Tutup', 'Anda yakin ingin menutup form ini?', () => {
        router.back();
    });
};

const executeSave = async () => {
    try {
        const payload = {
            header: formHeader.value,
            items: items.value.filter(item => item.kode && item.jumlah > 0),
            approvalInfo: approvalInfo.value
        };

        const response = isEditMode.value
            ? await api.put(`/ambil-barang-form/${route.params.id}`, payload)
            : await api.post('/ambil-barang-form', payload);

        toast.success(response.data.message);
        router.push({ name: 'AmbilBarang' });
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    }
};

const onAuthSuccess = async (pin: string) => {
    try {
        // Panggil API validasi yang BARU dan SPESIFIK
        await api.post('/ambil-barang-form/validate-pin', { // <-- UBAH ENDPOINT DI SINI
            code: authModal.challengeCode,
            pin: pin,
        });

        // Jika berhasil, tutup modal dan lanjutkan simpan
        authModal.show = false;
        await executeSave();

    } catch (error: any) {
        // Jika gagal, tampilkan error di dalam modal
        const message = error.response?.data?.message || 'Terjadi kesalahan';
        authModalRef.value?.setFailed(message);
    }
};

onMounted(() => {
    const id = route.params.id as string;
    if (id) {
        isEditMode.value = true;
        loadDataForEdit(id);
    } else {
        addNewRow(); // <-- PASTIKAN INI ADA
        loading.value = false;
    }
});

</script>

<template>
    <PageLayout :title="pageTitle" :menu-id="MENU_ID">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="handleSave" :disabled="isClosed">Simpan</v-btn>
            <v-btn size="small" variant="tonal" @click="handleBatal">Batal</v-btn>
            <v-btn @click="handleTutup">Tutup</v-btn>
        </template>

        <div v-if="loading" class="state-container"><v-progress-circular indeterminate /></div>
        <div v-else class="form-grid-container">
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-alert v-if="isEditMode && approvalInfo.status && approvalInfo.status !== 'ACC'"
                        :color="approvalInfo.status === 'WAIT' ? 'orange' : (approvalInfo.status === 'TOLAK' ? 'error' : 'info')"
                        density="compact" class="mb-3" variant="tonal">
                        <template v-if="approvalInfo.status === 'MINTA'">
                            Perlu Pengajuan Ubah
                        </template>
                        <template v-else-if="approvalInfo.status === 'WAIT'">
                            Menunggu Persetujuan
                        </template>
                        <template v-else-if="approvalInfo.status === 'TOLAK'">
                            Pengajuan Ditolak
                        </template>
                    </v-alert>
                    <v-alert v-if="isEditMode && approvalInfo.status === 'ACC'" color="success" density="compact"
                        class="mb-3" variant="tonal">
                        Perubahan Disetujui
                    </v-alert>
                    <v-text-field label="Nomor" v-model="formHeader.nomor" readonly variant="filled" density="compact"
                        hide-details />
                    <v-text-field label="Tanggal" v-model="formHeader.tanggal" type="date" density="compact"
                        hide-details />
                    <v-text-field label="No. Terima" v-model="formHeader.nomorTerima" readonly variant="filled"
                        density="compact" hide-details />
                    <div class="d-flex">
                        <v-text-field label="Gudang (F1)" v-model="formHeader.gudangKode" density="compact" hide-details
                            :disabled="isEditMode" @keydown.f1.prevent="isGudangLookupVisible = true" variant="outlined"
                            @blur="validateGudangKode" />
                        <v-text-field v-model="formHeader.gudangNama" class="ms-2" readonly variant="filled"
                            density="compact" hide-details />
                    </div>
                    <v-text-field label="Ke Store" v-model="formHeader.storeNama" readonly variant="filled"
                        density="compact" hide-details />
                    <v-text-field label="Peminta" v-model="formHeader.peminta" density="compact" hide-details
                        variant="outlined" />
                </div>
            </div>

            <div class="right-column">
                <div class="scanner-wrapper">
                    <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
                        placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
                        prepend-inner-icon="mdi-barcode-scan" hide-details clearable
                        @keydown.enter.prevent="handleBarcodeScan" />
                </div>

                <div class="table-container" style="height: 400px;">
                    <v-data-table :headers="headers" :items="items" class="desktop-table" density="compact" fixed-header
                        :items-per-page="-1">
                        <template #item.kode="{ item, index }">
                            <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                                placeholder="Barcode/F1/F2..." :readonly="!!item.nama"
                                @keydown.enter.prevent="handleBarcodeEnter(index)"
                                @keydown.f1.prevent="openProductSearch(index, false)"
                                @keydown.f2.prevent="openProductSearch(index, true)" />
                        </template>
                        <template #item.jumlah="{ item }">
                            <v-text-field v-model.number="item.jumlah" type="number" variant="underlined"
                                density="compact" hide-details class="text-right" />
                        </template>
                        <template #item.actions="{ index }">
                            <v-btn icon="mdi-delete" color="error" variant="text" size="x-small"
                                @click="deleteRow(index)" />
                        </template>
                        <template #bottom></template>
                        <template #tfoot>
                            <tr class="font-weight-bold">
                                <td colspan="5" class="text-right">Total:</td>
                                <td class="text-right">{{ totalJumlah }}</td>
                                <td></td>
                            </tr>
                        </template>
                    </v-data-table>
                </div>
            </div>
        </div>

        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text v-html="dialogConfirm.text"></v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal"
                        @click="() => { dialogConfirm.onConfirm(); dialogConfirm.show = false; }">
                        Ya
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <MintaBarangSearchModal v-if="isLookupVisible" source="ambil-barang" :multi="isMultiSelectProduct"
            :gudang="formHeader.gudangKode" @close="isLookupVisible = false" @products-selected="onProductsSelected" />

        <GudangSearchModal v-if="isGudangLookupVisible" :user-cabang="authStore.user?.cabang || ''" source="retur-dc"
            @close="isGudangLookupVisible = false" @gudang-selected="onGudangSelected" />

        <AuthorizationModal v-if="authModal.show" ref="authModalRef" title="Masukkan Otorisasi"
            :challenge-code="authModal.challengeCode" @close="authModal.show = false" @success="onAuthSuccess" />
    </PageLayout>
</template>

<style scoped>
/* Styling khusus jika diperlukan */
</style>
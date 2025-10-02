<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO, differenceInHours, differenceInCalendarDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import InvoiceSearchModal from '@/components/InvoiceSearchModal.vue';
import MintaBarangSearchModal from '@/components/MintaBarangSearchModal.vue';
import GudangSearchModal from '@/components/GudangSearchModal.vue';
import PrintOptionModal from '@/components/PrintOptionModal.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface Header {
    nomor: string;
    tanggal: string;
    cabangKode: string;
    cabangNama: string;
    invoice: string;
    customer: any | null;
    jenis: 'Y' | 'N'; // Y: Salah Qty, N: Tukar Barang
    keterangan: string;
    ppnPersen: number;
}
interface Footer {
    subTotal: number;
    diskonPersen1: number;
    diskonPersen2: number;
    diskonRp: number;
    ppnRp: number;
    grandTotal: number;
}
interface Item {
    id: number;
    kode: string;
    nama: string;
    ukuran: string;
    qtyInv: number;
    jumlah: number; // Qty Retur
    harga: number;
    disc: number; // Diskon % per item
    diskon: number; // Diskon Rp per item
    total: number;
    barcode: string;
    sudah: number; // Qty sudah pernah diretur
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '29';
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Retur Jual' : 'Buat Retur Jual');

const header = reactive<Header>({
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    cabangKode: authStore.user?.cabang || '',
    cabangNama: authStore.user?.cabangNama || '',
    invoice: '',
    customer: null,
    jenis: 'Y',
    keterangan: '',
    ppnPersen: 0,
});
const items = ref<Item[]>([]);
const footer = reactive<Footer>({
    subTotal: 0,
    diskonPersen1: 0,
    diskonPersen2: 0,
    diskonRp: 0,
    ppnRp: 0,
    grandTotal: 0,
});

const isLoading = ref(true);
const isSaving = ref(false);
const dialog = reactive({ invoiceSearch: false });
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });
const scannedBarcode = ref('');
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
const activeRowIndex = ref(0);
const isGudangSearchVisible = ref(false);
const isPrintOptionVisible = ref(false);
const savedDocumentNumber = ref<string | null>(null);

const tableHeaders = [
    { title: 'Kode', key: 'kode', width: '100px' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran', width: '60px' },
    { title: 'Qty Inv', key: 'qtyInv', align: 'end', width: '60px' },
    { title: 'Qty Retur', key: 'jumlah', align: 'end', width: '60px' },
    { title: 'Harga', key: 'harga', align: 'end', width: '70px' },
    { title: 'Diskon %', key: 'disc', align: 'end', width: '60px' },
    { title: 'Diskon Rp', key: 'diskon', align: 'end', width: '70px' },
    { title: 'Total', key: 'total', align: 'end', width: '70px' },
    { title: 'Barcode', key: 'barcode', width: '90px' },
    { title: 'Sudah Retur', key: 'sudah', align: 'end', width: '60px' },
] as const;

// --- Methods ---
const onInvoiceSelected = async (invoice: { nomor: string, tanggal: string }) => {
    const hariSejakInvoice = differenceInCalendarDays(new Date(), parseISO(invoice.tanggal));

    // Cek jika selisih hari lebih dari 1
    if (hariSejakInvoice > 1) {
        toast.error(`Invoice ${invoice.nomor} sudah lebih dari 1 hari dan tidak bisa diretur.`);
        dialog.invoiceSearch = false;
        return; // Hentikan proses
    }

    isLoading.value = true;
    dialog.invoiceSearch = false;
    try {
        const response = await api.get(`/retur-jual-form/load-from-invoice/${invoice.nomor}`);
        const { header: invHeader, items: invItems } = response.data;

        header.invoice = invHeader.invoice;
        header.customer = invHeader.customer;
        header.ppnPersen = invHeader.ppnPersen;
        footer.diskonRp = invHeader.diskonRp;
        footer.diskonPersen1 = invHeader.diskonPersen1;
        footer.diskonPersen2 = invHeader.diskonPersen2;

        items.value = invItems.map((item: any) => ({
            ...item,
            id: Date.now() + Math.random(),
            jumlah: 0,
            total: 0,
        }));

        calculateTotals();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data invoice.');
    } finally {
        isLoading.value = false;
    }
};

const calculateTotals = () => {
    // 1. Hitung Subtotal dari semua item
    let subTotal = 0;
    items.value.forEach(item => {
        // Pastikan jumlah, harga, dan diskon adalah angka
        const jumlah = Number(item.jumlah) || 0;
        const harga = Number(item.harga) || 0;
        const diskon = Number(item.diskon) || 0;

        item.total = jumlah * (harga - diskon);
        subTotal += item.total;
    });
    footer.subTotal = subTotal;

    // 2. Hitung Diskon Faktur (meniru logika Delphi)
    let diskonFakturRp = 0;
    const diskonPersen1 = footer.diskonPersen1 || 0;
    const diskonPersen2 = footer.diskonPersen2 || 0;

    if (diskonPersen1 > 0) {
        // Jika Diskon % 1 diisi, hitung nilainya dan timpa Diskon Rp
        const diskon1 = Math.round((diskonPersen1 / 100) * subTotal);
        const subTotalAfterDisc1 = subTotal - diskon1;
        const diskon2 = Math.round((diskonPersen2 / 100) * subTotalAfterDisc1);
        diskonFakturRp = diskon1 + diskon2;
        footer.diskonRp = diskonFakturRp; // Nilai Diskon Rp diperbarui
    } else {
        // Jika Diskon % kosong, gunakan nilai Diskon Rp yang diinput manual
        diskonFakturRp = footer.diskonRp || 0;
    }

    // 3. Hitung Netto dan PPN
    const netto = subTotal - diskonFakturRp;
    footer.ppnRp = Math.round((header.ppnPersen / 100) * netto);

    // 4. Hitung Grand Total
    footer.grandTotal = Math.round(netto + footer.ppnRp);
};

const save = () => {
    // --- VALIDASI DARI DELPHI ---
    if (!isEditMode.value && new Date(header.tanggal) < new Date(format(new Date(), 'yyyy-MM-dd'))) {
        return toast.error('Tanggal tidak boleh mundur dari hari ini.');
    }
    if (!header.customer) {
        return toast.error('Customer harus diisi.');
    }
    const validItems = items.value.filter(i => i.kode && (i.jumlah || 0) > 0);
    if (validItems.length === 0) {
        return toast.error('Detail barang retur harus diisi minimal 1 baris.');
    }
    // --- AKHIR VALIDASI ---

    showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data Retur Jual ini?', executeSave);
};

const executeSave = async () => {
    isSaving.value = true;
    const payload = {
        header,
        footer,
        items: items.value.filter(i => i.kode && (i.jumlah || 0) > 0),
        isNew: !isEditMode.value
    };
    try {
        const response = await api.post('/retur-jual-form/save', payload);
        toast.success(response.data.message);

        // Simpan nomor dokumen yang baru saja disimpan
        savedDocumentNumber.value = response.data.nomor;
        // Buka modal pilihan cetak, BUKAN langsung halaman cetak
        isPrintOptionVisible.value = true;

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
const closeForm = () => router.push({ name: 'ReturJual' });
const handleCancel = () => { /* Logika Batal */ };
const handleClose = () => showConfirmation('Konfirmasi Tutup', 'Tutup form? Perubahan yang belum disimpan akan hilang.', closeForm);

const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({
            id: Date.now(), kode: '', nama: '', ukuran: '', qtyInv: 0,
            jumlah: 0, harga: 0, disc: 0, diskon: 0, total: 0,
            barcode: '', sudah: 0
        });
    }
};

const handleBarcodeScan = async () => {
    const barcode = scannedBarcode.value;
    if (!barcode) return;

    // Cek jika item sudah ada di grid
    const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
    if (existingItem) {
        const newQty = (existingItem.jumlah || 0) + 1;
        // Validasi jumlah retur tidak melebihi qty invoice
        if (header.invoice && newQty > (existingItem.qtyInv - existingItem.sudah)) {
            toast.error('Jumlah retur melebihi jumlah yang dapat diretur dari invoice.');
        } else {
            existingItem.jumlah = newQty;
            toast.info(`Jumlah retur untuk ${existingItem.nama} ditambah.`);
        }
        scannedBarcode.value = '';
        return;
    }

    // Jika item belum ada, cari via API
    try {
        const response = await api.get(`/retur-jual-form/lookup/by-barcode/${barcode}`);
        const product = response.data;
        const emptyRowIndex = items.value.findIndex(item => !item.kode);

        if (emptyRowIndex !== -1) {
            items.value.splice(emptyRowIndex, 1, {
                id: Date.now(),
                kode: product.kode,
                nama: product.nama,
                ukuran: product.ukuran,
                barcode: product.barcode,
                harga: header.invoice ? 0 : product.harga, // Harga 0 jika dari invoice, sesuai Delphi
                jumlah: 1,
                qtyInv: 0, // Tidak ada referensi invoice
                sudah: 0,
                disc: 0,
                diskon: 0,
                total: 0,
            });
            addNewRow();
        } else {
            toast.error("Tidak ada baris kosong untuk menambahkan item.");
        }
    } catch (error: any) {
        toast.error(error.response?.data?.message || `Barcode ${barcode} tidak valid.`);
    } finally {
        scannedBarcode.value = '';
    }
};

const openProductSearch = (index: number, isMulti: boolean) => {
    activeRowIndex.value = index;
    isMultiSelectProduct.value = isMulti;
    isProductSearchVisible.value = true;
};

const onProductsSelected = (selectedProducts: any[]) => {
    isProductSearchVisible.value = false;
    const productsToAdd = selectedProducts.filter(p => !items.value.some(item => item.kode === p.kode && item.ukuran === p.ukuran));

    const newItems = productsToAdd.map(product => ({
        id: Date.now() + Math.random(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        barcode: product.barcode,
        harga: header.invoice ? 0 : product.harga, // Harga 0 jika dari invoice
        jumlah: 1,
        qtyInv: 0,
        sudah: 0,
        disc: 0,
        diskon: 0,
        total: 0,
    }));

    if (newItems.length > 0) {
        items.value.splice(activeRowIndex.value, 1, ...newItems);
        addNewRow();
    }
};

const openGudangSearch = () => {
    // Hanya user KDC yang bisa mengubah cabang
    if (authStore.user?.cabang === 'KDC') {
        isGudangSearchVisible.value = true;
    }
};

const onGudangSelected = (gudang: { kode: string, nama: string }) => {
    header.cabangKode = gudang.kode;
    header.cabangNama = gudang.nama;
    isGudangSearchVisible.value = false;
};

const handlePrintSelection = (type: 'a4' | 'kasir') => {
    isPrintOptionVisible.value = false;
    if (!savedDocumentNumber.value) return;

    const routeName = type === 'a4' ? 'ReturJualPrint' : 'ReturJualPrintKasir';
    const url = router.resolve({ name: routeName, params: { nomor: savedDocumentNumber.value } }).href;
    window.open(url, '_blank');

    // Setelah tab cetak terbuka, arahkan halaman utama kembali ke browse
    router.push({ name: 'ReturJual' });
};

const onPrintModalClose = () => {
    isPrintOptionVisible.value = false;
    // Jika user menutup modal tanpa memilih, tetap arahkan ke halaman browse
    router.push({ name: 'ReturJual' });
};

const loadDataForEdit = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/retur-jual-form/${nomor}`);
        const { header: returHeader, items: returItems } = response.data;

        // Isi data header
        Object.assign(header, returHeader);
        header.tanggal = format(parseISO(header.tanggal), 'yyyy-MM-dd');

        // Isi data footer dari header
        footer.diskonRp = returHeader.diskonRp;
        footer.diskonPersen1 = returHeader.diskonPersen1;
        footer.diskonPersen2 = returHeader.diskonPersen2;

        // Isi data grid
        items.value = returItems.map((item: any) => ({
            ...item,
            id: Date.now() + Math.random(),
        }));

        calculateTotals();
        toast.success(`Data Retur ${nomor} berhasil dimuat.`);

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data Retur Jual.');
        router.back();
    } finally {
        isLoading.value = false;
    }
};


onMounted(() => {
    if (!authStore.can(MENU_ID, isEditMode.value ? 'edit' : 'insert')) {
        toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data ini.`);
        router.back();
        return;
    }

    const nomor = route.params.nomor as string;
    if (isEditMode.value && nomor) {
        // Panggil fungsi ini jika mode "Ubah"
        loadDataForEdit(nomor);
    } else {
        // Mode "Baru"
        isLoading.value = false;
    }
});
watch(items, calculateTotals, { deep: true });
watch([() => footer.diskonRp, () => footer.diskonPersen1, () => footer.diskonPersen2, () => header.ppnPersen], calculateTotals);

</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-keyboard-return">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="save" :loading="isSaving">Simpan</v-btn>
            <v-btn size="small" @click="handleCancel">Batal</v-btn>
            <v-btn size="small" @click="handleClose">Tutup</v-btn>
        </template>
        <div class="form-grid-container">
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-row dense>
                        <v-col cols="6">
                            <v-text-field label="Cabang" v-model="header.cabangKode" readonly
                                :filled="authStore.user?.cabang !== 'KDC'"
                                :variant="authStore.user?.cabang === 'KDC' ? 'outlined' : 'filled'"
                                @click="openGudangSearch" density="compact" hide-details>
                                <template #append-inner>
                                    <v-icon v-if="authStore.user?.cabang === 'KDC'" @click="openGudangSearch">
                                        mdi-magnify
                                    </v-icon>
                                </template>
                            </v-text-field>
                        </v-col>
                        <v-col cols="6"><v-text-field v-model="header.cabangNama" readonly filled hide-details
                                density="compact" /></v-col>
                        <v-col cols="6"><v-text-field label="No. Retur" v-model="header.nomor" readonly filled
                                hide-details density="compact" /></v-col>
                        <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date"
                                variant="outlined" hide-details density="compact" /></v-col>
                        <v-col cols="12">
                            <v-radio-group v-model="header.jenis" inline label="Jenis Retur" hide-details>
                                <v-radio label="Salah Qty" value="Y"></v-radio>
                                <v-radio label="Tukar Barang" value="N"></v-radio>
                            </v-radio-group>
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="No. Invoice" v-model="header.invoice"
                                @click="dialog.invoiceSearch = true" prepend-inner-icon="mdi-magnify" readonly
                                variant="outlined" hide-details density="compact" />
                        </v-col>

                        <v-col cols="12"><v-text-field label="Customer"
                                :model-value="header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''"
                                readonly filled hide-details density="compact" /></v-col>
                        <v-col cols="12"><v-text-field label="Alamat" :model-value="header.customer?.alamat" readonly
                                filled hide-details density="compact" /></v-col>
                        <v-col cols="12"><v-text-field label="Kota / Telp"
                                :model-value="header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''"
                                readonly filled hide-details density="compact" /></v-col>

                        <v-col cols="12"><v-textarea label="Keterangan" v-model="header.keterangan" rows="3"
                                variant="outlined" hide-details density="compact" /></v-col>
                    </v-row>
                </div>
            </div>
            <div class="right-column">
                <div class="scanner-wrapper mb-4">
                    <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..." variant="outlined"
                        density="compact" prepend-inner-icon="mdi-barcode-scan" hide-details clearable
                        @keydown.enter.prevent="handleBarcodeScan" />
                </div>
                <v-data-table :headers="tableHeaders" :items="items" class="desktop-table fill-height-table"
                    hide-details density="compact" fixed-header :items-per-page="-1">
                    <template #item.kode="{ item, index }">
                        <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                            placeholder="F1/F2..." @keydown.f1.prevent="openProductSearch(index, false)"
                            @keydown.f2.prevent="openProductSearch(index, true)" :readonly="!!header.invoice" />
                    </template>
                    <template #item.jumlah="{ item }">
                        <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" class="text-end"
                            density="compact" hide-details
                            :rules="[v => v <= (item.qtyInv - item.sudah) || `Maks: ${item.qtyInv - item.sudah}`]"
                            min="0" />
                    </template>
                    <template #item.harga="{ item }">
                        <v-text-field v-model.number="item.harga" type="number" variant="underlined" class="text-end"
                            density="compact" hide-details readonly />
                    </template>
                    <template #item.disc="{ item }">
                        <v-text-field v-model.number="item.disc" type="number" variant="underlined" class="text-end"
                            density="compact" hide-details readonly />
                    </template>
                    <template #item.diskon="{ item }">
                        <v-text-field v-model.number="item.diskon" type="number" variant="underlined" class="text-end"
                            density="compact" hide-details readonly />
                    </template>

                    <!-- Tambahkan slot untuk actions (tombol hapus) -->
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
                <div class="footer-section pa-4">
                    <v-row dense>
                        <v-col cols="4"><v-text-field label="Total"
                                :model-value="new Intl.NumberFormat('id-ID').format(footer.subTotal)" readonly filled
                                class="text-end" hide-details density="compact" /></v-col>
                        <v-col cols="4"><v-text-field label="Diskon Rp" v-model.number="footer.diskonRp" type="number"
                                variant="outlined" class="text-end" hide-details density="compact" /></v-col>
                        <v-col cols="4"><v-text-field label="PPN"
                                :model-value="new Intl.NumberFormat('id-ID').format(footer.ppnRp)" readonly filled
                                class="text-end" hide-details density="compact" /></v-col>
                        <v-col cols="4"></v-col>
                        <v-col cols="4"><v-text-field label="Diskon % 1" v-model.number="footer.diskonPersen1"
                                type="number" variant="outlined" class="text-end" hide-details
                                density="compact" /></v-col>
                        <v-col cols="4"><v-text-field label="Grand Total"
                                :model-value="new Intl.NumberFormat('id-ID').format(footer.grandTotal)" readonly filled
                                class="text-end font-weight-bold" hide-details density="compact" /></v-col>
                        <v-col cols="4"></v-col>
                        <v-col cols="4"><v-text-field label="Diskon % 2" v-model.number="footer.diskonPersen2"
                                type="number" variant="outlined" class="text-end" hide-details
                                density="compact" /></v-col>
                    </v-row>
                </div>
            </div>
        </div>
        <InvoiceSearchModal v-if="dialog.invoiceSearch" @close="dialog.invoiceSearch = false"
            @invoice-selected="onInvoiceSelected" />
        <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''"
            @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" />
        <MintaBarangSearchModal v-if="isProductSearchVisible" :gudang="header.cabangKode" :multi="isMultiSelectProduct"
            source="retur-jual" @close="isProductSearchVisible = false" @products-selected="onProductsSelected" />
        <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir']" @close="onPrintModalClose"
            @select="handlePrintSelection" />

        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal"
                        @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya,
                        Lanjutkan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>
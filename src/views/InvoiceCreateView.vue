<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO, addDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/CustomerSearchModal.vue';
import SoSearchModalForInvoice from '@/components/SoSearchModalForInvoice.vue';
import ProductSearchModal from '@/components/ProductSearchModal.vue';
import PaymentModal from '@/components/PaymentModal.vue';
import UnpaidDpSearchModal from '@/components/UnpaidDpSearchModal.vue';
import CustomerForm from '@/components/CustomerForm.vue';

// --- Tipe Data ---
interface Item {
    id: number;
    kode: string;
    nama: string;
    ukuran: string;
    stok: number;
    qtyso: number;
    jumlah: number;
    harga: number;
    diskonPersen: number;
    diskonRp: number;
    total: number;
    barcode: string;
    sodtf: string;
    hpp: number;
}
interface LinkedDp {
    nomor: string;
    jenis: string;
    nominal: number;
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '27';

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Invoice' : 'Buat Invoice');
const isLoading = ref(true);

const header = reactive({
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    gudang: { kode: authStore.user?.cabang || '', nama: authStore.user?.cabangNama || '' },
    customer: { kode: '', nama: '', alamat: '', kota: '', telp: '', level: '' },
    nomorSo: '',
    tanggalSo: '',
    top: 0,
    tanggalTempo: '',
    salesCounter: authStore.user?.kode || '',
    keterangan: '',
    diskonPersen1: 0,
    diskonPersen2: 0,
    diskonRp: 0,
    biayaKirim: 0,
    ppnPersen: 0,
});

const items = ref<Item[]>([]);
const linkedDps = ref<LinkedDp[]>([]);
const totals = reactive({
    subTotal: 0,
    totalDiskonItem: 0,
    totalDiskonFaktur: 0,
    nettoSetelahDiskon: 0,
    totalPpn: 0,
    grandTotal: 0,
    totalDp: 0,
    sisaPiutang: 0,
});

const dialogs = reactive({
    customerSearch: false,
    soSearch: false,
    productSearch: false,
    payment: false,
    unpaidDpSearch: false,
    customerForm: false,
});

const activeRowIndex = ref(0);
const isMultiSelectProduct = ref(false);
const salesCounters = ref([]);

// --- Konfigurasi Tabel ---
const tableHeaders = [
    { title: 'Kode Barang', key: 'kode', width: '150px' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran', width: '80px' },
    { title: 'Stok', key: 'stok', align: 'end', width: '80px' },
    { title: 'Qty SO', key: 'qtyso', align: 'end', width: '80px' },
    { title: 'Jumlah', key: 'jumlah', align: 'end', width: '120px' },
    { title: 'Harga', key: 'harga', align: 'end', width: '120px' },
    { title: 'Disc %', key: 'diskonPersen', align: 'end', width: '100px' },
    { title: 'Diskon Rp', key: 'diskonRp', align: 'end', width: '120px' },
    { title: 'Total', key: 'total', align: 'end', width: '150px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];
const linkedDpsHeaders = [
    { title: 'Nomor Setoran', key: 'nomor' },
    { title: 'Jenis', key: 'jenis' },
    { title: 'Nominal', key: 'nominal', align: 'end' },
    { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

// --- Methods ---
const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({ id: Date.now(), kode: '', nama: '', jumlah: 0, harga: 0, diskonPersen: 0, diskonRp: 0, total: 0 } as any);
    }
};

const fetchSalesCounters = async () => {
    try {
        const response = await api.get('/invoice-form/lookup/sales-counters');
        salesCounters.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat daftar Sales Counter.');
    }
};

const removeRow = (id: number) => { items.value = items.value.filter(item => item.id !== id); };
const removeDpRow = (nomor: string) => { linkedDps.value = linkedDps.value.filter(dp => dp.nomor !== nomor); };

const openProductSearch = (index: number, isMulti: boolean) => {
    if (!header.customer.kode) return toast.error('Pilih customer terlebih dahulu.');
    if (header.nomorSo) return toast.info('Tidak bisa menambah item manual jika sudah terhubung ke SO.');

    activeRowIndex.value = index;
    isMultiSelectProduct.value = isMulti;
    dialogs.productSearch = true;
};

const onCustomerSelected = (cust: any) => {
    header.customer = cust;
    dialogs.customerSearch = false;
};

const onNewCustomerSaved = (customer: any) => {
    // Otomatis isi field customer dengan data baru
    header.customer = {
        kode: customer.kode,
        nama: customer.nama,
        alamat: customer.alamat,
        kota: customer.kota,
        telp: customer.telp,
        level: customer.level,
    };
    dialogs.customerForm = false; // Tutup modal form
};

const onSoSelected = async (so: { Nomor: string }) => {
    dialogs.soSearch = false;
    if (!so.Nomor) return;

    isLoading.value = true;
    try {
        // Panggil endpoint yang benar untuk memuat semua detail dari SO
        const response = await api.get(`/invoice-form/lookup/so-details/${so.Nomor}`);
        const { header: soHeader, items: soItems, dps } = response.data;

        // Isi semua field header dari data yang diterima
        Object.assign(header, soHeader);
        // Format tanggal secara manual karena bisa jadi null
        header.tanggalSo = soHeader.tanggal ? format(parseISO(soHeader.tanggal), 'yyyy-MM-dd') : '';
        header.tanggalTempo = soHeader.tanggalTempo ? format(parseISO(soHeader.tanggalTempo), 'yyyy-MM-dd') : '';

        // Isi grid utama
        items.value = soItems.map((item: any) => ({ ...item, id: Date.now() + Math.random() }));

        // Isi grid DP
        linkedDps.value = dps;

        addNewRow(); // Tambahkan baris kosong di akhir
    } catch (error: any) {
        toast.error(error.response?.data?.message || "Gagal memuat data SO.");
    }
    finally {
        isLoading.value = false;
    }
};

const onProductsSelected = (selectedProducts: any[]) => {
    dialogs.productSearch = false;
    if (!selectedProducts || selectedProducts.length === 0) return;

    const newItems = selectedProducts.map(product => ({
        id: Date.now() + Math.random(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        harga: product.harga,
        jumlah: 1,
        diskonPersen: 0,
        diskonRp: 0,
        total: product.harga,
        barcode: product.barcode,
    }));

    items.value.splice(activeRowIndex.value, 1, ...newItems);
    addNewRow();
};

const onUnpaidDpSelected = (dp: any) => {
    dialogs.unpaidDpSearch = false;
    if (!linkedDps.value.some(d => d.nomor === dp.nomor)) {
        linkedDps.value.push(dp);
    } else {
        toast.warning('DP tersebut sudah ditambahkan.');
    }
};

const calculateTotals = () => {
    const subTotal = items.value.reduce((sum, item) => sum + (item.jumlah * item.harga), 0);
    const totalDiskonItem = items.value.reduce((sum, item) => sum + (item.jumlah * item.diskonRp), 0);

    const afterItemDiscount = subTotal - totalDiskonItem;

    let diskonFaktur = header.diskonRp;
    if (header.diskonPersen1 > 0) {
        diskonFaktur += afterItemDiscount * (header.diskonPersen1 / 100);
    }
    // (Tambahkan logika diskon persen 2 jika perlu)

    const nettoSetelahDiskon = subTotal - totalDiskonItem - diskonFaktur;
    const totalPpn = nettoSetelahDiskon * (header.ppnPersen / 100);
    const totalDp = linkedDps.value.reduce((sum, dp) => sum + (dp.nominal || 0), 0);

    totals.subTotal = subTotal;
    totals.totalDiskonItem = totalDiskonItem;
    totals.totalDiskonFaktur = diskonFaktur;
    totals.nettoSetelahDiskon = nettoSetelahDiskon;
    totals.totalPpn = totalPpn;
    totals.grandTotal = nettoSetelahDiskon + totalPpn + header.biayaKirim;
    totals.totalDp = totalDp;
    totals.sisaPiutang = totals.grandTotal - totalDp;
};

const handleProceedToPayment = () => {
    if (items.value.filter(i => i.kode).length === 0) return toast.error("Detail item belum diisi.");
    if (totals.sisaPiutang < 0) return toast.error("Sisa piutang tidak boleh minus. Periksa kembali DP yang diinput.");
    dialogs.payment = true;
};

const onSaveSuccess = (newInvoiceNumber: string) => {
    // Dipanggil dari PaymentModal setelah save berhasil
    router.push({ name: 'Invoice' }); // Kembali ke halaman browse
};

watch(header, () => {
    if (header.top > 0 && header.tanggal) {
        header.tanggalTempo = format(addDays(new Date(header.tanggal), header.top), 'yyyy-MM-dd');
    }
}, { deep: true });
watch(items, calculateTotals, { deep: true });
watch(linkedDps, calculateTotals, { deep: true });

onMounted(() => {
    fetchSalesCounters();
    if (!isEditMode.value) {
        addNewRow();
    }
    isLoading.value = false;
});
</script>

<template>
    <PageLayout :title="pageTitle" icon="mdi-receipt-text-edit">
        <template #header-actions>
            <v-btn size="small" @click="router.back()">Tutup</v-btn>
        </template>

        <div class="form-grid-container">
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-row dense>
                        <v-col cols="6">
                            <v-text-field label="No. Invoice" v-model="header.nomor" readonly density="compact" filled
                                hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field label="Kode Cabang" :model-value="header.gudang.kode" readonly
                                density="compact" filled hide-details />
                        </v-col>
                        <v-col cols="8">
                            <v-text-field label="Nama Cabang" :model-value="header.gudang.nama" readonly
                                density="compact" filled hide-details />
                        </v-col>
                        <v-col cols="8">
                            <v-text-field label="No. Pesanan (SO)" v-model="header.nomorSo" readonly
                                @click="dialogs.soSearch = true" prepend-inner-icon="mdi-magnify" density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field label="Tgl. SO"
                                :model-value="header.tanggalSo ? format(parseISO(header.tanggalSo), 'dd-MM-yy') : ''"
                                readonly filled density="compact" hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field label=" Kode Customer" :model-value="header.customer.kode" readonly
                                density="compact" @click="dialogs.customerSearch = true"
                                prepend-inner-icon="mdi-magnify" hide-details />
                        </v-col>
                        <v-col cols="8">
                            <v-text-field label="Nama Customer" :model-value="header.customer.nama" readonly
                                @click="dialogs.customerSearch = true" prepend-inner-icon="mdi-magnify"
                                density="compact" hide-details>
                                <template #append-inner>
                                    <v-btn icon="mdi-account-plus" size="x-small" variant="tonal" class="me-2"
                                        @click.stop="dialogs.customerForm = true" title="Buat Customer Baru"></v-btn>
                                </template>
                            </v-text-field>
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Alamat" v-model="header.customer.alamat" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Kota" v-model="header.customer.kota" readonly filled density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Telepon" v-model="header.customer.telp" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field label="TOP" v-model.number="header.top" type="number" density="compact"
                                variant="outlined" hide-details />
                        </v-col>
                        <v-col cols="8">
                            <v-text-field label="Tgl. Jatuh Tempo" v-model="header.tanggalTempo" type="date"
                                density="compact" readonly filled hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-select label="Sales Counter" v-model="header.salesCounter" :items="salesCounters"
                                variant="outlined" density="compact" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Keterangan" v-model="header.keterangan" density="compact"
                                variant="outlined" hide-details />
                        </v-col>
                    </v-row>
                </div>
                <div class="desktop-form-section header-section">
                    <v-row dense>
                        <v-col cols="12" class="pb-2">
                            <div class="text-subtitle-2 font-weight-bold">Kalkulasi Total</div>
                        </v-col>
                        <v-col cols="12"><v-text-field label="Sub Total" :model-value="formatRupiah(totals.subTotal)"
                                readonly filled hide-details /></v-col>
                        <v-col cols="4"><v-text-field label="Disc %" v-model.number="header.diskonPersen1"
                                variant="outlined" hide-details /></v-col>
                        <v-col cols="8"><v-text-field label="Diskon Rp" v-model.number="header.diskonRp"
                                variant="outlined" hide-details /></v-col>
                        <v-col cols="4"><v-text-field label="PPN %" v-model.number="header.ppnPersen" variant="outlined"
                                hide-details /></v-col>
                        <v-col cols="8"><v-text-field label="Total PPN" :model-value="formatRupiah(totals.totalPpn)"
                                readonly filled hide-details /></v-col>
                        <v-col cols="12"><v-text-field label="Biaya Kirim" v-model.number="header.biayaKirim"
                                variant="outlined" hide-details /></v-col>
                        <v-col cols="12" class="py-2">
                            <div class="d-flex justify-space-between align-center text-subtitle-1 font-weight-bold">
                                <span>Grand Total:</span>
                                <span>{{ formatRupiah(totals.grandTotal) }}</span>
                            </div>
                        </v-col>
                        <v-col cols="12"><v-text-field label="Total DP" :model-value="formatRupiah(totals.totalDp)"
                                readonly filled hide-details /></v-col>
                        <v-col cols="12"><v-text-field label="Sisa Piutang"
                                :model-value="formatRupiah(totals.sisaPiutang)" readonly filled class="font-weight-bold"
                                hide-details /></v-col>
                    </v-row>
                </div>
            </div>

            <div class="right-column">
                <div class="desktop-form-section d-flex flex-column fill-height">
                    <div class="d-flex justify-space-between align-center mb-2">
                        <div class="text-subtitle-1 font-weight-bold">Detail Item</div>
                    </div>
                    <v-data-table :headers="tableHeaders" :items="items" class="desktop-table flex-grow-1"
                        :items-per-page="-1" />

                    <div class="d-flex justify-space-between align-center mt-4">
                        <div class="text-subtitle-1 font-weight-bold">DP Terkait</div>
                        <v-btn size="small" @click="dialogs.unpaidDpSearch = true" prepend-icon="mdi-plus"
                            :disabled="!header.customer.kode">Tambah DP</v-btn>
                    </div>
                    <v-data-table :headers="linkedDpsHeaders" :items="linkedDps" class="desktop-table mt-2"
                        :items-per-page="-1" />

                    <div class="text-right mt-4">
                        <v-btn color="primary" size="large" @click="handleProceedToPayment">
                            Lanjutkan ke Pembayaran
                        </v-btn>
                    </div>
                </div>
            </div>
        </div>

        <CustomerSearchModal v-if="dialogs.customerSearch" @close="dialogs.customerSearch = false"
            @customer-selected="onCustomerSelected" />
        <CustomerForm v-if="dialogs.customerForm" @close="dialogs.customerForm = false"
            @customer-saved="onNewCustomerSaved" />
        <SoSearchModalForInvoice v-if="dialogs.soSearch" :cabang="header.gudang.kode" @close="dialogs.soSearch = false"
            @so-selected="onSoSelected" />
        <ProductSearchModal v-if="dialogs.productSearch" :gudang="header.gudang.kode" category="ALL"
            :multi="isMultiSelectProduct" source="invoice-cash" @close="dialogs.productSearch = false"
            @products-selected="onProductsSelected" />
        <UnpaidDpSearchModal v-if="dialogs.unpaidDpSearch" :customer-kode="header.customer.kode"
            @close="dialogs.unpaidDpSearch = false" @selected="onUnpaidDpSelected" />
        <PaymentModal v-if="dialogs.payment" :invoice-header="header" :invoice-items="items" :totals="totals"
            :linked-dps="linkedDps" @close="dialogs.payment = false" @save-success="onSaveSuccess" />
    </PageLayout>
</template>
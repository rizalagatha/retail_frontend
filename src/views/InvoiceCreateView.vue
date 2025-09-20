<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
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
import PromoSearchModal from '@/components/PromoSearchModal.vue';
import MemberForm from '@/components/MemberForm.vue';
import DiskonForm from '@/components/DiskonForm.vue';
import LinkedDpModal from '@/components/LinkedDpModal.vue';
import AuthorizationModal from '@/components/AuthorizationModal.vue';

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
    hpp: number;
    noSoDtf: string;
    kategori: string;
    terhitungPromo: boolean;
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

const initialHeaderState = {
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
    nomorPromo: '',
    namaPromo: '',
    memberHp: '',
    memberNama: '',
};

const header = reactive({ ...initialHeaderState });
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
    promoSearch: false,
    memberForm: false,
    diskonForm: false,
    linkedDp: false,
});

const authDialog = reactive({
    isFakturVisible: false,
    isItemVisible: false,
    title: '',
    challengeCode: '',
    onSuccess: (pin: string) => { },
    onCancel: () => { },
});
const authModalRef = ref<any>(null);

const activeItemForAuth = ref<Item | null>(null);
const originalDiscount = reactive({
    faktur: { persen1: 0, rp: 0, persen2: 0, biayaKirim: 0 },
    item: { persen: 0, rp: 0 }
});

const activeRowIndex = ref(0);
const isMultiSelectProduct = ref(false);
const salesCounters = ref([]);
const isSoLoaded = ref(false);
const memberHpToSearch = ref('');

// --- Konfigurasi Tabel ---
const tableHeaders = [
    { title: 'Kode Barang', key: 'kode', width: '150px' },
    { title: 'Nama Barang', key: 'nama', width: '600px' },
    { title: 'Ukuran', key: 'ukuran', width: '40px' },
    { title: 'Stok', key: 'stok', align: 'end', width: '40px' },
    { title: 'Qty SO', key: 'qtyso', align: 'end', width: '40px' },
    { title: 'Jumlah', key: 'jumlah', align: 'end', width: '40px' },
    { title: 'Harga', key: 'harga', align: 'end', width: '60px' },
    { title: 'Disc %', key: 'diskonPersen', align: 'end', width: '60px' },
    { title: 'Diskon Rp', key: 'diskonRp', align: 'end', width: '80px' },
    { title: 'Total', key: 'total', align: 'end', width: '100px' },
    { title: 'Barcode', key: 'barcode', width: '90px' },
    { title: 'No. SO DTF', key: 'noSoDtf', width: '100px' },
    { title: 'Kategori', key: 'kategori', width: '80px' },
    { title: 'Promo', key: 'terhitungPromo', align: 'center', width: '80px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '30px' },
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
        items.value.push({
            id: Date.now(), jumlah: 0, harga: 0, diskonPersen: 0, diskonRp: 0, total: 0,
            barcode: '', noSoDtf: '', kategori: '', terhitungPromo: false,
        } as any);
    }
};
const onDiskonSaved = (data: any) => {
    // Cek jika ada perubahan yang butuh otorisasi
    if (data.diskonPersen1 !== header.diskonPersen1 ||
        data.diskonPersen2 !== header.diskonPersen2 ||
        data.diskonRp !== header.diskonRp) {
        originalDiscount.faktur = {
            persen1: header.diskonPersen1,
            persen2: header.diskonPersen2,
            rp: header.diskonRp,
        };

        requestAuthorization(
            'Otorisasi Diskon Faktur',
            (pin) => { // onSuccess
                header.diskonPersen1 = data.diskonPersen1;
                header.diskonPersen2 = data.diskonPersen2;
                header.diskonRp = data.diskonRp;
                // Simpan pin jika perlu: header.pinDiskon = pin
                toast.success('Otorisasi diskon faktur berhasil.');
            },
            () => { // onCancel
                // Kembalikan ke nilai semula jika dibatalkan
                header.diskonPersen1 = originalDiscount.faktur.persen1;
                header.diskonPersen2 = originalDiscount.faktur.persen2;
                header.diskonRp = originalDiscount.faktur.rp;
            }
        );
    }
    header.biayaKirim = data.biayaKirim;
};
const handleItemDiscountChange = (item: Item) => {
    // Simpan nilai asli item
    originalDiscount.item = { persen: item.diskonPersen, rp: item.diskonRp };
    activeItemForAuth.value = item;

    requestAuthorization(
        `Otorisasi Diskon: ${item.nama}`,
        (pin) => { // onSuccess
            if (activeItemForAuth.value) {
                activeItemForAuth.value.pin = pin; // Simpan pin di item jika perlu
            }
            toast.success('Otorisasi diskon item berhasil.');
        },
        () => { // onCancel
            if (activeItemForAuth.value) {
                activeItemForAuth.value.diskonPersen = originalDiscount.item.persen;
                activeItemForAuth.value.diskonRp = originalDiscount.item.rp;
            }
        }
    );
};

const requestAuthorization = (title: string, onSuccess: (pin: string) => void, onCancel: () => void) => {
    authDialog.challengeCode = Math.floor(100 + Math.random() * 900).toString();
    authDialog.title = title;
    authDialog.onSuccess = onSuccess;
    authDialog.onCancel = onCancel;
    authDialog.show = true;
};

const handleAuthSuccess = async (pin: string) => {
    try {
        await api.post('/otorisasi/validate-pin', {
            pin,
            challengeCode: authDialog.challengeCode
        });
        authDialog.onSuccess(pin);
        authDialog.show = false;
    } catch (error: any) {
        authModalRef.value?.setFailed(error.response?.data?.message || 'PIN tidak valid');
    }
};

const handleAuthCancel = () => {
    authDialog.onCancel();
    authDialog.show = false;
};

const fetchSalesCounters = async () => {
    try {
        const response = await api.get('/invoice-form/lookup/sales-counters');
        salesCounters.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat daftar Sales Counter.', error);
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
    if (cust) {
        header.customer = cust;
        updateMemberInfo(cust); // Panggil fungsi update member di sini
    } else {
        header.customer = { kode: '', nama: '', alamat: '', kota: '', telp: '', level: '' };
        updateMemberInfo(null); // Kosongkan juga info member
    }
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

const onMemberSaved = (member: { hp: string, nama: string }) => {
    // Otomatis isi field di header dengan data member yang baru disimpan
    header.memberHp = member.hp;
    header.memberNama = member.nama;
    dialogs.memberForm = false;
};

const onPromoSelected = (promo: { nomor: string, namaPromo: string }) => {
    header.nomorPromo = promo.nomor;
    header.namaPromo = promo.namaPromo;
    dialogs.promoSearch = false;
    // Tambahkan logika `initgrid` atau hitung ulang jika perlu
};

const onSoSelected = async (so: { Nomor: string }) => {
    console.log('onSoSelected called with:', so);

    dialogs.soSearch = false;
    if (!so.Nomor) return;

    isLoading.value = true;
    try {
        console.log('Fetching SO details for:', so.Nomor);

        const response = await api.get(`/invoice-form/lookup/so-details/${so.Nomor}`);
        console.log('SO details response:', response.data);

        const { header: soHeader, items: soItems, dps } = response.data;

        // Reset items terlebih dahulu
        items.value = [];

        // Assign header data
        Object.assign(header, soHeader);
        if (soHeader.tanggal) {
            const date = new Date(soHeader.tanggal);
            header.tanggalSo = date.toISOString().split('T')[0]; // Ambil bagian tanggal saja
        } else {
            header.tanggalSo = '';
        }

        if (soHeader.tanggalTempo) {
            const date = new Date(soHeader.tanggalTempo);
            header.tanggalTempo = date.toISOString().split('T')[0]; // Ambil bagian tanggal saja
        } else {
            header.tanggalTempo = '';
        }

        memberHpToSearch.value = soHeader.customer.telp || '';
        header.memberHp = soHeader.customer.telp || '';

        // Map items dengan memastikan semua field yang diperlukan ada
        items.value = soItems.map((item: any, index: number) => ({
            ...item,
            id: Date.now() + index, // Gunakan index untuk memastikan unique ID
            jumlah: item.qtyso || 0,
            // Pastikan field lain yang diperlukan ada
            subtotal: (item.qtyso || 0) * (item.harga || 0)
        }));

        console.log('Mapped items:', items.value);

        linkedDps.value = dps;
        isSoLoaded.value = true;

        // Force reactivity update
        await nextTick();

    } catch (error: any) {
        console.error('Error loading SO details:', error);
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

    const diskon1Amount = (header.diskonPersen1 / 100) * afterItemDiscount;
    const afterDiscount1 = afterItemDiscount - diskon1Amount;
    const diskon2Amount = (header.diskonPersen2 / 100) * afterDiscount1;

    const diskonFaktur = header.diskonRp + diskon1Amount + diskon2Amount;

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
    // Validasi frontend sebelum membuka modal pembayaran
    if (!header.customer.kode) return toast.error("Customer harus diisi.");
    if (items.value.filter(i => i.kode).length === 0) return toast.error("Detail item belum diisi.");
    if (totals.sisaPiutang < 0) return toast.error("Sisa piutang tidak boleh minus. Periksa kembali DP yang diinput.");
    
    const totalQty = items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0);
    if (totalQty <= 0) return toast.error('Qty Invoice kosong semua.');
    
    dialogs.payment = true;
};

const onSaveSuccess = (newInvoiceNumber: string) => {
    // Dipanggil dari PaymentModal setelah save berhasil
    router.push({ name: 'Invoice' }); // Kembali ke halaman browse
};

const updateMemberInfo = (customer: any) => {
    if (customer && customer.telp) {
        header.memberHp = customer.telp;
        // Anda bisa tambahkan trigger untuk otomatis membuka & mencari di MemberFormModal di sini jika mau
    } else {
        header.memberHp = '';
        header.memberNama = '';
    }
};

const resetForm = async () => {
    Object.assign(header, initialHeaderState);
    items.value = [];
    linkedDps.value = [];
    isSoLoaded.value = false;
    addNewRow();

    try {
        const authStore = useAuthStore();
        const cabang = authStore.userCabang; // Ambil cabang dari authStore

        console.log('User cabang from store:', cabang); // Debug log

        if (!cabang || cabang === '-') {
            console.log('No cabang available');
            onCustomerSelected(null);
            return;
        }

        const response = await api.get(`/invoice-form/lookup/default-customer?cabang=${cabang}`);
        console.log('Default customer response:', response.data);

        if (response.data) {
            onCustomerSelected(response.data);
        } else {
            onCustomerSelected(null);
        }
    } catch (error) {
        console.error('Error fetching default customer:', error);
        onCustomerSelected(null);
    }
};

const getQtyClass = (item: Item) => {
    // Beri class 'qty-error' jika jumlah melebihi stok
    if (item.jumlah > item.stok) {
        return 'qty-error';
    }
    return '';
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
    const nomor = route.params.nomor as string;
    if (isEditMode.value && nomor) {
        loadDataForEdit(nomor);
    } else {
        resetForm(); // Panggil resetForm untuk mode baru
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
                        <v-col cols="6">
                            <v-text-field label="No. Pesanan (SO)" v-model="header.nomorSo" :readonly="isSoLoaded"
                                @click="isSoLoaded ? null : dialogs.soSearch = true" prepend-inner-icon="mdi-magnify"
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Tgl. SO"
                                :model-value="header.tanggalSo ? format(parseISO(header.tanggalSo), 'dd-MM-yy') : ''"
                                readonly filled density="compact" hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field label=" Kode Customer" :model-value="header.customer.kode" density="compact"
                                :readonly="isSoLoaded" @click="isSoLoaded ? null : dialogs.customerSearch = true"
                                prepend-inner-icon="mdi-magnify" hide-details />
                        </v-col>
                        <v-col cols="8">
                            <v-text-field label="Nama Customer" :model-value="header.customer.nama" readonly
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
                        <v-col cols="6">
                            <v-text-field label="Level" v-model="header.customer.level" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="2">
                            <v-text-field label="TOP" v-model.number="header.top" type="number" density="compact"
                                variant="outlined" hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field label="Tgl. Jatuh Tempo" v-model="header.tanggalTempo" type="date"
                                density="compact" readonly filled hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-select label="Sales Counter" v-model="header.salesCounter" :items="salesCounters"
                                variant="outlined" density="compact" hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field label="Promo" v-model="header.nomorPromo" @click="dialogs.promoSearch = true"
                                prepend-inner-icon="mdi-magnify" density="compact" hide-details
                                placeholder="F1 atau klik..." />
                        </v-col>
                        <v-col cols="8">
                            <v-text-field label="Nama Promo" v-model="header.namaPromo" density="compact" readonly
                                filled hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Keterangan" v-model="header.keterangan" density="compact"
                                variant="outlined" hide-details />
                        </v-col>
                    </v-row>
                    <v-input label="Info Member" append-inner-icon="mdi-pencil" @click="dialogs.memberForm = true"
                        hide-details class="custom-input-button">
                        <div v-if="header.memberHp || header.memberNama" class="input-content">
                            <strong>{{ header.memberHp }}</strong> - {{ header.memberNama }}
                        </div>
                        <div v-else class="input-placeholder">
                            Klik untuk tambah/ubah member...
                        </div>
                    </v-input>
                </div>

            </div>

            <div class="right-column">
                <div class="desktop-form-section d-flex flex-column fill-height">

                    <div class="table-wrapper">
                        <v-data-table :headers="tableHeaders" :items="items" class="desktop-table flex-grow-1"
                            :items-per-page="-1">
                            <template #item.jumlah="{ item }">
                                <v-text-field v-model.number="item.jumlah" type="number" min="0" variant="underlined"
                                    density="compact" hide-details class="text-right" :class="getQtyClass(item)" />
                            </template>
                            <template #item.diskonPersen="{ item }">
                                <v-text-field v-model.number="item.diskonPersen" type="number" min="0"
                                    variant="underlined" density="compact" hide-details class="text-right"
                                    @blur="handleItemDiscountChange(item)" />
                            </template>
                            <template #item.diskonRp="{ item }">
                                <v-text-field v-model.number="item.diskonRp" type="number" min="0" variant="underlined"
                                    density="compact" hide-details class="text-right"
                                    @blur="handleItemDiscountChange(item)" />
                            </template>
                        </v-data-table>

                        <v-row class="mt-4" align="end">
                            <v-col cols="auto" class="d-flex ga-2">
                                <v-btn size="small" prepend-icon="mdi-cash-multiple" @click="dialogs.linkedDp = true"
                                    :disabled="!header.customer.kode">
                                    Lihat DP
                                </v-btn>
                                <v-btn size="small" prepend-icon="mdi-sale" @click="dialogs.diskonForm = true">
                                    Input Diskon/Biaya
                                </v-btn>
                            </v-col>

                            <v-spacer></v-spacer>

                            <v-col cols="auto">
                                <v-btn color="primary" size="large" @click="handleProceedToPayment">
                                    Lanjutkan ke Pembayaran
                                </v-btn>
                            </v-col>
                        </v-row>
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
        <PromoSearchModal v-if="dialogs.promoSearch" :tanggal="header.tanggal" @close="dialogs.promoSearch = false"
            @selected="onPromoSelected" />
        <MemberForm v-if="dialogs.memberForm" :initial-hp="memberHpToSearch" @close="dialogs.memberForm = false"
            @member-saved="onMemberSaved" />
        <DiskonForm v-if="dialogs.diskonForm" :diskon-persen1="header.diskonPersen1" :diskon-rp="header.diskonRp"
            :biaya-kirim="header.biayaKirim" @close="dialogs.diskonForm = false" @save="onDiskonSaved" />
        <LinkedDpModal v-if="dialogs.linkedDp" :dps="linkedDps" @close="dialogs.linkedDp = false" />
        <AuthorizationModal v-if="authDialog.show" ref="authModalRef" :title="authDialog.title"
            :challenge-code="authDialog.challengeCode" @close="handleAuthCancel" @success="handleAuthSuccess" />
    </PageLayout>
</template>

<style scoped>
.totals-summary {
    background-color: #f7f9fc;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
}

.custom-input-button {
    border: 1px solid #BDBDBD;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    background-color: #f7f7f7;
    height: 40px;
    /* Samakan dengan density compact */
    align-items: center;
}

.custom-input-button:hover {
    border-color: #666666;
}

.input-content {
    font-size: 11px;
}

.input-placeholder {
    font-size: 11px;
    color: #888888;
}

:deep(.qty-error input) {
    color: red !important;
    font-weight: bold;
}

.desktop-table :deep(.nama-barang-cell) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 350px;
    /* Sesuaikan lebar maksimum jika perlu */
}
</style>
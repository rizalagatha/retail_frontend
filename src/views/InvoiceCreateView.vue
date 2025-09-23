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
import SoDtfSearchModal from '@/components/SoDtfSearchModal.vue';
import PromoBonusModal from '@/components/PromoBonusModal.vue';

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
    _isHargaEditable: boolean;
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
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

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
    memberAlamat: '',
    memberGender: '',
    memberUsia: '',
    memberReferensi: '',
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
    soDtfSearch: false,
    promoBonus: false
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

const authPins = reactive({
    pinDiskon1: '',
    pinDiskon2: '',
    pinItem: {} as Record<string, string>, // Untuk menyimpan pin per item
});

const dialogConfirm = reactive({
    show: false,
    title: '',
    text: '',
    onConfirm: () => { },
});

const activeRowIndex = ref(0);
const isMultiSelectProduct = ref(false);
const salesCounters = ref([]);
const isSoLoaded = ref(false);
const memberHpToSearch = ref('');
const scannedBarcode = ref('');
const customerDiscountRule = ref(null);
const activePromoForBonus = ref({ nomor: '', qty: 0 });

// --- Konfigurasi Tabel ---
const tableHeaders = [
    { title: 'Kode Barang', key: 'kode', width: '150px' },
    { title: 'Nama Barang', key: 'nama', width: '750px' },
    { title: 'Ukuran', key: 'ukuran', width: '30px' },
    { title: 'Stok', key: 'stok', align: 'end', width: '30px' },
    { title: 'Qty SO', key: 'qtyso', align: 'end', width: '30px' },
    { title: 'Jumlah', key: 'jumlah', align: 'end', width: '30px' },
    { title: 'Harga', key: 'harga', align: 'end', width: '50px' },
    { title: 'Disc %', key: 'diskonPersen', align: 'end', width: '50px' },
    { title: 'Diskon Rp', key: 'diskonRp', align: 'end', width: '70px' },
    { title: 'Total', key: 'total', align: 'end', width: '90px' },
    { title: 'Barcode', key: 'barcode', width: '80px' },
    { title: 'No. SO DTF', key: 'noSoDtf', width: '100px' },
    { title: 'Kategori', key: 'kategori', width: '70px' },
    { title: 'Promo', key: 'terhitungPromo', align: 'center', width: '70px' },
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
const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
    dialogConfirm.title = title;
    dialogConfirm.text = text;
    dialogConfirm.onConfirm = onConfirm;
    dialogConfirm.show = true;
};

const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({
            id: Date.now(), jumlah: 0, harga: 0, diskonPersen: 0, diskonRp: 0, total: 0,
            barcode: '', noSoDtf: '', kategori: '', terhitungPromo: false, _isHargaEditable: true,
        } as any);
    }
};

const onDiskonSaved = (data: any) => {
    if (data.diskonPersen1 !== header.diskonPersen1 ||
        data.diskonPersen2 !== header.diskonPersen2 ||
        data.diskonRp !== header.diskonRp) 
        {
        originalDiscount.faktur = { persen1: header.diskonPersen1, persen2: header.diskonPersen2, rp: header.diskonRp };
        requestAuthorization('Otorisasi Diskon Faktur',
            (pin) => { // onSuccess
                if (data.diskonPersen1 !== header.diskonPersen1) authPins.pinDiskon1 = pin;
                if (data.diskonPersen2 !== header.diskonPersen2) authPins.pinDiskon2 = pin;
                header.diskonPersen1 = data.diskonPersen1;
                header.diskonPersen2 = data.diskonPersen2;
                header.diskonRp = data.diskonRp;
            },
            () => { // onCancel
                header.diskonPersen1 = originalDiscount.faktur.persen1;
                header.diskonPersen2 = originalDiscount.faktur.persen2;
                header.diskonRp = originalDiscount.faktur.rp;
            }
        );
    }
    header.biayaKirim = data.biayaKirim;
};

const handleItemDiscountChange = (item: Item) => {
    // Simpan nilai asli item sebelum diubah
    // Kita perlu menunggu 'tick' berikutnya agar v-model selesai update
    nextTick(() => {
        const originalRp = item.originalDiskonRp || 0;
        const originalPersen = item.originalDiskonPersen || 0;
        const currentRp = item.diskonRp || 0;
        const currentPersen = item.diskonPersen || 0;
        
        // Hanya panggil otorisasi jika nilainya benar-benar berubah
        if (currentRp !== originalRp || currentPersen !== originalPersen) {
            requestAuthorization(
                `Otorisasi Diskon: ${item.nama}`,
                (pin) => { // onSuccess
                    if (activeItemForAuth.value) {
                        // Simpan nilai baru sebagai nilai original setelah sukses
                        activeItemForAuth.value.originalDiskonRp = activeItemForAuth.value.diskonRp;
                        activeItemForAuth.value.originalDiskonPersen = activeItemForAuth.value.diskonPersen;
                    }
                    toast.success('Otorisasi diskon item berhasil.');
                },
                () => { // onCancel
                    if (activeItemForAuth.value) {
                        // Kembalikan ke nilai original jika dibatalkan
                        activeItemForAuth.value.diskonRp = originalDiscount.item.rp;
                        activeItemForAuth.value.diskonPersen = originalDiscount.item.persen;
                    }
                }
            );
        }
    });
};

const onItemDiscountFocus = (item: Item) => {
    activeItemForAuth.value = item;
    originalDiscount.item = { persen: item.diskonPersen || 0, rp: item.diskonRp || 0 };
};

const requestAuthorization = (title: string, onConfirm: (pin: string) => void, onCancel: () => void) => {
    authDialog.challengeCode = Math.floor(100 + Math.random() * 900).toString();
    authDialog.title = title;
    authDialog.onSuccess = onConfirm;
    authDialog.onCancel = onCancel;
    authDialog.show = true;
};

const handleAuthSuccess = async (pin: string) => {
    try {
        await api.post('/otorisasi/validate-pin', { pin, challengeCode: authDialog.challengeCode });
        toast.success('Otorisasi berhasil.');
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

const removeRow = (itemToDelete: Item) => {
    items.value = items.value.filter(item => item.id !== itemToDelete.id);
    if (items.value.length === 0) {
        addNewRow();
    }
};

// Fungsi untuk menghapus semua item dari SO DTF tertentu
const removeSoDtfItems = (itemWithSoDtf: Item) => {
    const soDtfNumber = itemWithSoDtf.noSoDtf;
    if (!soDtfNumber) return;
    items.value = items.value.filter(item => item.noSoDtf !== soDtfNumber);
    if (items.value.length === 0) {
        addNewRow();
    }
};

const handleDeleteItem = (item: Item) => {
    if (item.noSoDtf) {
        showConfirmation(
            'Konfirmasi Hapus SO DTF',
            `Anda yakin ingin menghapus semua item dari SO DTF No: ${item.noSoDtf}?`,
            () => removeSoDtfItems(item)
        );
    } else if (item.kode) {
        showConfirmation(
            'Konfirmasi Hapus Item',
            `Anda yakin ingin menghapus item: ${item.nama}?`,
            () => removeRow(item)
        );
    }
};

const handleClose = () => {
    showConfirmation(
        'Tutup Form',
        'Data yang belum disimpan akan hilang. Yakin ingin menutup form?',
        () => router.back()
    );
};

const openProductSearch = (index: number, isMulti: boolean) => {
    if (!header.customer.kode) return toast.error('Pilih customer terlebih dahulu.');
    if (header.nomorSo) return toast.info('Tidak bisa menambah item manual jika sudah terhubung ke SO.');

    activeRowIndex.value = index;
    isMultiSelectProduct.value = isMulti;
    dialogs.productSearch = true;
};

const openSoDtfSearch = (item: any, index: number) => {
    // Cek semua kondisi di sini
    if (header.nomorSo || item.kode) {
        return; // Hentikan aksi jika sudah readonly
    }
    if (!header.customer.kode) {
        return toast.error("Pilih customer terlebih dahulu.");
    }

    // Jika semua kondisi terpenuhi, buka modal
    activeRowIndex.value = index;
    dialogs.soDtfSearch = true;
};

const onCustomerSelected = async (cust: any) => {
    if (cust) {
        // PERBAIKAN: Gabungkan level_kode dan level_nama secara manual
        const levelText = cust.level_kode ? `${cust.level_kode} - ${cust.level_nama}` : '';

        header.customer = {
            kode: cust.kode,
            nama: cust.nama,
            alamat: cust.alamat,
            kota: cust.kota,
            telp: cust.telp,
            level: levelText,
        };

        // PERBAIKAN: Panggil fungsi update member setelah customer dipilih
        updateMemberInfo(header.customer);

        // Ambil aturan diskon untuk customer yang baru dipilih
        try {
            const response = await api.get(`/invoice-form/lookup/discount-rule/${cust.kode}`);
            customerDiscountRule.value = response.data;
        } catch (error) {
            customerDiscountRule.value = null; // Reset jika tidak ada aturan
        }
    } else {
        // Kosongkan field jika tidak ada customer
        header.customer = { kode: '', nama: '', alamat: '', kota: '', telp: '', level: '' };
        updateMemberInfo(null);
    }
    dialogs.customerSearch = false;
};

const applyDefaultDiscount = () => {
    const rule = customerDiscountRule.value;
    if (!rule || header.nomorSo) { // Jangan terapkan jika dari SO
        return;
    }

    // Logika dari Delphi: cek nominal belanja
    if (totals.nettoSetelahDiskon >= rule.nominal1) {
        header.diskonPersen1 = rule.diskon1;
    } else if (totals.nettoSetelahDiskon >= rule.nominal2) {
        header.diskonPersen1 = rule.diskon2;
    } else {
        header.diskonPersen1 = 0;
    }
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
const onMemberSaved = (member: any) => {
    // Isi semua field member di header
    header.memberHp = member.hp;
    header.memberNama = member.nama;
    header.memberAlamat = member.alamat;
    header.memberGender = member.gender;
    header.memberUsia = member.usia;
    header.memberReferensi = member.referensi;

    dialogs.memberForm = false;
    toast.info('Data member telah diperbarui di form.');
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
        _isHargaEditable: product.harga === 0,
    }));

    if (items.value[activeRowIndex.value] && !items.value[activeRowIndex.value].kode) {
        items.value.splice(activeRowIndex.value, 1, ...newItems);
    } else {
        items.value.push(...newItems);
    }
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

const onSoDtfSelected = async (soDtf: any) => {
    dialogs.soDtfSearch = false;
    if (!soDtf.nomor) return;

    try {
        // Panggil API baru untuk mendapatkan detailnya
        const response = await api.get(`/invoice-form/lookup/so-dtf-details/${soDtf.nomor}`);
        const soDtfItems = response.data;

        if (soDtfItems.length === 0) {
            return toast.warning('SO DTF ini tidak memiliki detail item.');
        }

        const newItems = soDtfItems.map((item: any) => ({
            id: Date.now() + Math.random(),
            kode: item.kode,
            nama: item.nama,
            ukuran: item.ukuran,
            jumlah: item.jumlah,
            harga: item.harga,
            stok: 0,
            qtyso: 0,
            diskonPersen: 0,
            diskonRp: 0,
            total: item.jumlah * item.harga,
            noSoDtf: item.kode,
        }));

        // Hapus baris kosong yang sedang aktif, lalu sisipkan semua item baru
        items.value.splice(activeRowIndex.value, 1, ...newItems);
        addNewRow();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat detail SO DTF.');
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

const handleBonusSelection = (bonusItem: any) => {
    dialogs.promoBonus = false;

    // Logika dari Delphi: tambahkan item bonus ke grid
    items.value.push({
        id: Date.now(),
        kode: bonusItem.kode,
        nama: `${bonusItem.nama} #BONUS`,
        ukuran: bonusItem.ukuran,
        stok: bonusItem.stok,
        qtyso: 0,
        jumlah: activePromoForBonus.value.qty, // Ambil qty dari promo
        harga: 0,
        diskonRp: 0,
        total: 0,
        promo: activePromoForBonus.value.nomor,
    });
    addNewRow();
};

const handleProceedToPayment = () => {
    // --- VALIDASI DARI DELPHI ---
    const validItems = items.value.filter(i => i.kode);
    if (!header.customer.kode) {
        return toast.error("Customer harus diisi.");
    }
    if (!header.customer.level) {
        return toast.error("Level customer belum di-setting.");
    }
    if (validItems.length === 0) {
        return toast.error("Detail barang harus diisi.");
    }

    // Loop untuk validasi per item
    for (const item of validItems) {
        if ((item.harga || 0) === 0 && !item.promo) {
            return toast.error(`Harga untuk ${item.nama} harus diisi.`);
        }
    }

    // Validasi total qty
    const totalQty = validItems.reduce((sum, item) => sum + (item.jumlah || 0), 0);
    if (totalQty <= 0) {
        return toast.error('Qty Invoice kosong semua.');
    }

    // Validasi No. HP (jika ada promo undian, dibuat lebih umum)
    // Untuk saat ini, kita hanya akan memberikan peringatan jika No. HP kosong
    if (!header.memberHp) {
        if (!confirm('No. HP Member kosong. Yakin akan melanjutkan?')) {
            // Di sini Anda bisa menambahkan logika untuk fokus ke input member
            return;
        }
    }
    // --- AKHIR VALIDASI ---

    const promoTebusMurah = header.nomorPromo; // Asumsi dari field promo
    if (promoTebusMurah === 'PRO-2025-002') { // Contoh kode promo
        activePromoForBonus.value = { nomor: promoTebusMurah, qty: 1 };
        dialogs.promoBonus = true; // Buka modal bonus, JANGAN dulu buka modal bayar
        return; // Hentikan proses
    }

    // Jika semua validasi lolos, buka modal pembayaran
    dialogs.payment = true;
};

const onSaveSuccess = (newInvoiceNumber: string) => {
    // Dipanggil dari PaymentModal setelah save berhasil
    router.push({ name: 'Invoice' }); // Kembali ke halaman browse
};

const updateMemberInfo = (customer: any) => {
    const phone = customer?.telp || '';
    header.memberHp = phone;
    memberHpToSearch.value = phone;
};

const handleBarcodeScan = async () => {
    if (!header.customer.kode) {
        return toast.error('Pilih customer terlebih dahulu sebelum scan!');
    }
    const barcode = scannedBarcode.value;
    if (!barcode) return;

    // --- LOGIKA 1: Jika barang sudah ada di grid, tambah jumlahnya ---
    const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
    if (existingItem) {
        existingItem.jumlah += 1;
        toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
        scannedBarcode.value = ''; // Kosongkan input
        return;
    }

    // --- LOGIKA 2: Jika belum ada, cari via API ---
    try {
        // Gunakan endpoint yang sudah ada untuk produk
        const response = await api.get(`/invoice-form/by-barcode/${barcode}`, {
            params: { gudang: header.gudang.kode }
        });
        const product = response.data;

        // Cari baris kosong pertama untuk diganti
        const emptyRowIndex = items.value.findIndex(item => !item.kode);

        const newItem = {
            id: Date.now(),
            kode: product.kode,
            nama: product.nama,
            ukuran: product.ukuran,
            stok: product.stok,
            harga: product.harga,
            jumlah: 1, // Default jumlah 1
            diskonPersen: 0,
            diskonRp: 0,
            total: product.harga,
            barcode: product.barcode,
            qtyso: 0, // Tidak ada SO
        };

        if (emptyRowIndex !== -1) {
            items.value.splice(emptyRowIndex, 1, newItem);
        } else {
            items.value.push(newItem);
        }
        addNewRow();
    } catch (error: any) {
        toast.error(error.response?.data?.message || `Barcode ${barcode} tidak valid.`);
    } finally {
        scannedBarcode.value = '';
    }
};

const handleJumlahChange = async (item: Item) => {
    // Jalankan validasi Qty vs Stok yang sudah ada
    validateQty(item);

    // Cek ke backend apakah ada promo untuk item ini
    try {
        const response = await api.get('/invoice-form/lookup/applicable-item-promo', {
            params: {
                kode: item.kode,
                ukuran: item.ukuran,
                tanggal: header.tanggal,
            }
        });

        const promo = response.data;
        if (promo) {
            // Terapkan diskon dari promo
            item.diskonPersen = promo.pb_disc || 0;
            item.diskonRp = promo.pb_diskon || 0;
            toast.success(`Promo diskon diterapkan untuk ${item.nama}`);
        }
    } catch (error) {
        // Tidak perlu menampilkan error jika promo tidak ditemukan
        console.error("Gagal memeriksa promo item:", error);
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

const isHargaEditable = (item: Item) => {
    // Bisa diedit hanya kalau row ini memang ditandai editable
    return item._isHargaEditable === true;
};

const loadDataForEdit = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/invoice-form/${nomor}`);
        const { header: dataHeader, items: dataItems, dps: dataDps } = response.data;

        // Isi semua field header
        header.nomor = dataHeader.inv_nomor;
        header.tanggal = format(parseISO(dataHeader.inv_tanggal), 'yyyy-MM-dd');
        header.customer = {
            kode: dataHeader.inv_cus_kode,
            nama: dataHeader.cus_nama,
            alamat: dataHeader.cus_alamat,
            kota: dataHeader.cus_kota,
            telp: dataHeader.cus_telp,
            level: dataHeader.xLevel
        };
        header.nomorSo = dataHeader.inv_nomor_so;
        header.tanggalSo = dataHeader.so_tanggal ? format(parseISO(dataHeader.so_tanggal), 'yyyy-MM-dd') : '';
        header.top = dataHeader.inv_top;
        header.salesCounter = dataHeader.inv_sc;
        header.keterangan = dataHeader.inv_ket;
        header.diskonPersen1 = dataHeader.inv_disc1;
        header.diskonRp = dataHeader.inv_disc;
        header.ppnPersen = dataHeader.inv_ppn;
        header.biayaKirim = dataHeader.inv_bkrm;
        header.memberHp = dataHeader.inv_mem_hp;
        header.memberNama = dataHeader.inv_mem_nama;

        // Isi grid item
        items.value = dataItems.map((item: any) => ({
            ...item,
            id: Date.now() + Math.random(),
            kode: item.invd_kode,
            nama: item.nama_barang,
            ukuran: item.invd_ukuran,
            jumlah: item.invd_jumlah,
            harga: item.invd_harga,
            diskonRp: item.invd_diskon,
        }));
        addNewRow();

        // Isi grid DP
        linkedDps.value = dataDps;

        // Kunci field SO dan Customer
        isSoLoaded.value = !!header.nomorSo;

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data Invoice.');
        router.back();
    } finally {
        isLoading.value = false;
    }
};

watch(header, () => {
    if (header.top > 0 && header.tanggal) {
        header.tanggalTempo = format(addDays(new Date(header.tanggal), header.top), 'yyyy-MM-dd');
    }
}, { deep: true });
watch(items, calculateTotals, { deep: true });
watch(linkedDps, calculateTotals, { deep: true });
watch(items, (newItems) => {
    // Loop melalui setiap item dan hitung ulang totalnya
    newItems.forEach(item => {
        const hargaSetelahDiskon = (item.harga || 0) - (item.diskonRp || 0);
        item.total = (item.jumlah || 0) * hargaSetelahDiskon;
    });
    // Panggil kalkulasi total keseluruhan
    calculateTotals();
}, { deep: true });
watch(items, () => {
    calculateTotals();
    applyDefaultDiscount(); // Terapkan diskon setelah total dihitung
}, { deep: true });

onMounted(() => {
    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data Invoice.`);
        router.push({ name: 'Invoice' }); // Arahkan kembali ke halaman browse
        return;
    }

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
            <v-btn size="small" @click="handleClose">Tutup</v-btn>
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
                            <v-text-field label="TOP" v-model.number="header.top" type="number" min="0"
                                density="compact" variant="outlined" hide-details />
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
                    <div v-if="!header.nomorSo" class="scanner-wrapper">
                        <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
                            placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
                            prepend-inner-icon="mdi-barcode-scan" hide-details clearable
                            @keydown.enter.prevent="handleBarcodeScan" />
                    </div>
                    <div class="table-wrapper">
                        <v-data-table :headers="tableHeaders" :items="items" class="desktop-table flex-grow-1"
                            :items-per-page="-1">
                            <template #item.kode="{ item, index }">
                                <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                                    placeholder="F1/F2..." :readonly="!!header.nomorSo"
                                    :class="{ 'field-disabled': !!header.nomorSo }"
                                    @keydown.f1.prevent="!header.nomorSo && openProductSearch(index, false)"
                                    @keydown.f2.prevent="!header.nomorSo && openProductSearch(index, true)" />
                            </template>
                            <template #item.jumlah="{ item }">
                                <v-text-field v-model.number="item.jumlah" type="number" min="0" variant="underlined"
                                    density="compact" hide-details class="text-right" :class="getQtyClass(item)"
                                    @blur="handleJumlahChange(item)" />
                            </template>
                            <template #item.harga="{ item }">
                                <v-text-field v-model.number="item.harga" type="number" min="0" variant="underlined"
                                    density="compact" hide-details class="text-right"
                                    :readonly="!isHargaEditable(item)" />
                            </template>
                            <template #item.diskonPersen="{ item }">
                                <v-text-field v-model.number="item.diskonPersen" type="number" min="0"
                                    variant="underlined" density="compact" hide-details class="text-right"
                                    @blur="handleItemDiscountChange(item)" @focus="onItemDiscountFocus(item)" />
                            </template>
                            <template #item.diskonRp="{ item }">
                                <v-text-field v-model.number="item.diskonRp" type="number" min="0" variant="underlined"
                                    density="compact" hide-details class="text-right"
                                    @blur="handleItemDiscountChange(item)" @focus="onItemDiscountFocus(item)" />
                            </template>
                            <template #item.noSoDtf="{ item, index }">
                                <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details
                                    placeholder="F1 atau Klik..." :readonly="!!header.nomorSo || !!item.kode"
                                    :class="{ 'field-disabled': !!header.nomorSo || !!item.kode }"
                                    @click="openSoDtfSearch(item, index)"
                                    @keydown.f1.prevent="openSoDtfSearch(item, index)" />
                            </template>
                            <template #item.actions="{ item }">
                                <v-btn v-if="item.kode" icon="mdi-delete" variant="text" color="error" size="x-small"
                                    @click="handleDeleteItem(item)"
                                    :title="item.noSoDtf ? 'Hapus Semua Item SO DTF Ini' : 'Hapus Item Ini'"></v-btn>
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
                                <v-btn color="primary" size="large" @click="handleProceedToPayment"
                                    :disabled="!authStore.can(MENU_ID, requiredPermission)">
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
            :biaya-kirim="header.biayaKirim" @close="dialogs.diskonForm = false" :sub-total="totals.subTotal"
            @save="onDiskonSaved" />
        <LinkedDpModal v-if="dialogs.linkedDp" :dps="linkedDps" @close="dialogs.linkedDp = false" />
        <AuthorizationModal v-if="authDialog.show" ref="authModalRef" :title="authDialog.title"
            :challenge-code="authDialog.challengeCode" @close="handleAuthCancel" @success="handleAuthSuccess" />
        <SoDtfSearchModal v-if="dialogs.soDtfSearch" :customer-kode="header.customer.kode"
            @close="dialogs.soDtfSearch = false" @selected="onSoDtfSelected" />
        <PromoBonusModal v-if="dialogs.promoBonus" :promo-nomor="activePromoForBonus.nomor"
            @close="dialogs.promoBonus = false" @selected="handleBonusSelection" />

        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
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
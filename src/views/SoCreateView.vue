<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, addDays, isValid } from 'date-fns';

// Impor semua komponen modal yang akan digunakan
import CustomerSearchModal from '@/components/CustomerSearchModal.vue';
import GudangSearchModal from '@/components/GudangSearchModal.vue';
import SalesCounterSearchModal from '@/components/SalesCounterSearchModal.vue';
import ProductSearchModal from '@/components/ProductSearchModal.vue';
import PenawaranSearchModal from '@/components/PenawaranSearchModal.vue';
// import SoDtfSearchModal from '@/components/SoDtfSearchModal.vue';
// import PriceProposalSearchModal from '@/components/PriceProposalSearchModal.vue';
import AuthorizationModal from '@/components/AuthorizationModal.vue';

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '26';

// --- Interfaces ---
interface SoItem {
    id: number;
    kode: string;
    nama: string;
    ukuran: string;
    stok: number;
    jumlah: number | null;
    harga: number | null;
    diskonPersen: number;
    diskonRp: number;
    total: number;
    barcode: string;
    noSoDtf: string;
    noPengajuanHarga: string;
    pin: string;
}

interface DpItem {
    nomor: string;
    jenis: string;
    posting: string;
    fsk: string;
    nominal: number;
}

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Surat Pesanan' : 'Buat Surat Pesanan');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');
const isLoading = ref(true);
const isSaving = ref(false);

const initialHeaderState = {
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    dateline: format(new Date(), 'yyyy-MM-dd'),
    gudang: { kode: authStore.user?.cabang || '', nama: authStore.user?.cabangNama || '' },
    customer: null as any,
    penawaran: '',
    salesCounter: authStore.user?.kode || '',
    level: '',
    keterangan: '',
    telp: '',
    top: 0,
    alamat: '',
    kota: '',
    tempo: '',
    ppnPersen: 0,
    statusSo: 'PASIF',
};

const header = ref({ ...initialHeaderState });

const items = ref<SoItem[]>([]);
const dpItems = ref<DpItem[]>([]);

const footer = ref({
    totalSo: 0,
    diskonRp: 0,
    diskonPersen1: 0,
    diskonPersen2: 0,
    biayaKirim: 0,
    ppnRp: 0,
    netto: 0,
    grandTotal: 0,
    totalDp: 0,
    minimalDp: 0,
    belumDibayar: 0,
});

// State untuk modals & dialogs
const isGudangSearchVisible = ref(false);
const isCustomerSearchVisible = ref(false);
const isSalesCounterSearchVisible = ref(false);
const isPenawaranSearchVisible = ref(false);
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
// const isSoDtfSearchVisible = ref(false);
// const isPriceProposalSearchVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);
const activeRowIndex = ref(0);
const isAuthModalVisible = ref(false);
const isAuth2ModalVisible = ref(false);
const isItemAuthModalVisible = ref(false);
const activeItemIndexForAuth = ref(-1);
const previousDiscount = ref({ persen1: 0, persen2: 0, item: 0 });
const previousDiskonRp = ref(0);
const challengeCode = ref('');
const authModalRef = ref<any>(null);
const auth2ModalRef = ref<any>(null);
const itemAuthModalRef = ref<any>(null);

const mainTableHeaders = [
    { title: 'Kode', key: 'kode', width: '180px' },
    { title: 'Nama Barang', key: 'nama', width: '250px' },
    { title: 'Ukuran', key: 'ukuran', width: '90px' },
    { title: 'Stok', key: 'stok', align: 'end', width: '80px' },
    { title: 'Jumlah', key: 'jumlah', width: '100px' },
    { title: 'Harga', key: 'harga', width: '120px' },
    { title: 'Diskon %', key: 'diskonPersen', width: '100px' },
    { title: 'Diskon Rp', key: 'diskonRp', width: '120px' },
    { title: 'Total', key: 'total', align: 'end', width: '140px' },
    { title: 'No. SO DTF', key: 'noSoDtf', width: '180px' },
    { title: 'No. Pengajuan', key: 'noPengajuanHarga', width: '180px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

const dpTableHeaders = [
    { title: 'No. Setoran', key: 'nomor' },
    { title: 'Jenis', key: 'jenis' },
    { title: 'Nominal', key: 'nominal', align: 'end' },
    { title: 'Posting', key: 'posting' },
];

// --- Methods ---
const loadDataForEdit = async (nomor: string) => { /* ... Logika load data ... */ };
const calculateTotals = () => {
    // --- Kalkulasi Total per Baris ---
    let totalSo = 0;
    let containsDtf = false;
    items.value.forEach(item => {
        const qty = Number(item.jumlah) || 0;
        const harga = Number(item.harga) || 0;
        const diskonRp = Number(item.diskonRp) || 0;

        // Prioritaskan diskon persen jika diisi
        if (item.diskonPersen > 0) {
            item.diskonRp = (item.diskonPersen / 100) * harga;
        }

        item.total = qty * (harga - (item.diskonRp || 0));
        totalSo += item.total;

        // Cek jika ada item SO DTF di dalam grid
        if (item.noSoDtf) {
            containsDtf = true;
        }
    });
    footer.value.totalSo = totalSo;

    // --- Kalkulasi Total DP ---
    const totalDp = dpItems.value.reduce((sum, dp) => sum + (dp.nominal || 0), 0);
    footer.value.totalDp = totalDp;

    // --- Kalkulasi Diskon Faktur ---
    // Hanya terapkan diskon default jika belum ada otorisasi PIN
    if (!footer.value.pinDiskon1) {
        const rule = header.value.customer?.discountRule;
        if (rule) {
            if (totalSo >= rule.nominal) {
                footer.value.diskonPersen1 = rule.diskon1;
            } else {
                footer.value.diskonPersen1 = rule.diskon2;
            }
        } else {
            footer.value.diskonPersen1 = 0;
        }
    }
    
    const diskonPersen1 = footer.value.diskonPersen1 || 0;
    const diskonPersen2 = footer.value.diskonPersen2 || 0;
    const diskon1Rp = (diskonPersen1 / 100) * totalSo;
    const afterDiscount1 = totalSo - diskon1Rp;
    const diskon2Rp = (diskonPersen2 / 100) * afterDiscount1;
    footer.value.diskonRp = diskon1Rp + diskon2Rp;

    // --- Kalkulasi PPN, Netto, dan Grand Total ---
    const netto = totalSo - (footer.value.diskonRp || 0);
    footer.value.netto = netto;

    const ppnRp = (header.value.ppnPersen / 100) * netto;
    footer.value.ppnRp = ppnRp;

    const grandTotal = netto + ppnRp + (footer.value.biayaKirim || 0);
    footer.value.grandTotal = grandTotal;

    // --- Kalkulasi Minimal DP dan Sisa Bayar ---
    if (containsDtf) {
        // Minimal DP 50% jika ada SO DTF
        footer.value.minimalDp = 0.5 * netto;
    } else {
        // Minimal DP 30% untuk SO biasa
        footer.value.minimalDp = 0.3 * netto;
    }

    footer.value.belumDibayar = grandTotal - totalDp;

    // --- Penentuan Status SO (AKTIF/PASIF) ---
    // Level 8 (mungkin user khusus) dan DP yang mencukupi akan membuat status AKTIF
    const isLevel8 = header.value.level?.startsWith('8');
    if (isLevel8 || totalDp >= footer.value.minimalDp) {
        header.value.statusSo = 'AKTIF';
    } else {
        header.value.statusSo = 'PASIF';
    }
};

const openGudangSearch = () => {
    // Gudang hanya bisa diubah saat membuat SO baru
    if (!isEditMode.value) {
        isGudangSearchVisible.value = true;
    }
};

const openCustomerSearch = () => {
    if (!header.value.gudang.kode) {
        toast.error('Pilih Gudang terlebih dahulu.');
        return;
    }
    isCustomerSearchVisible.value = true;
};

const openSalesCounterSearch = () => {
    isSalesCounterSearchVisible.value = true;
};

const openPenawaranSearch = () => {
    if (!header.value.customer) {
        toast.error('Pilih Customer terlebih dahulu.');
        return;
    }
    isPenawaranSearchVisible.value = true;
};

const openProductSearch = (index: number, isMulti: boolean) => {
    if (!header.value.customer) {
        toast.error('Pilih Customer terlebih dahulu.');
        return;
    }
    activeRowIndex.value = index;
    isMultiSelectProduct.value = isMulti; // Set mode multi atau single
    isProductSearchVisible.value = true;
};

// const openSoDtfSearch = (index: number) => {
//     if (!header.value.customer) {
//         toast.error('Pilih Customer terlebih dahulu.');
//         return;
//     }
//     activeRowIndex.value = index;
//     isSoDtfSearchVisible.value = true;
// };

// const openPriceProposalSearch = (index: number) => {
//     if (!header.value.customer) {
//         toast.error('Pilih Customer terlebih dahulu.');
//         return;
//     }
//     activeRowIndex.value = index;
//     isPriceProposalSearchVisible.value = true;
// };

const save = async () => {
    // ... (Validasi lengkap dari btnSimpanClick Delphi)
    showConfirmation(executeSave, "Anda yakin ingin menyimpan Surat Pesanan ini?");
};

const executeSave = async () => {
    isSaving.value = true;
    try {
        const payload = {
            header: header.value,
            footer: footer.value,
            details: items.value.filter(item => item.kode),
            dps: dpItems.value,
            isNew: !isEditMode.value,
        };
        const response = await api.post('/so-form/save', payload);
        toast.success(response.data.message);
        router.push('/transaksi/surat-pesanan');
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } finally {
        isSaving.value = false;
    }
};

const showConfirmation = (action: () => void, text: string) => {
    pendingAction.value = action;
    confirmText.value = text;
    isConfirmDialogVisible.value = true;
};

const addNewRow = () => {
    // Cek agar tidak menambah baris kosong jika sudah ada
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({
            id: Date.now(),
            kode: '',
            nama: '',
            ukuran: '',
            stok: 0,
            jumlah: null,
            harga: null,
            diskonPersen: 0,
            diskonRp: 0,
            total: 0,
            barcode: '',
            noSoDtf: '',
            noPengajuanHarga: '',
            pin: ''
        });
    }
};

const resetForm = () => {
    header.value = { ...initialHeaderState };
    items.value = [];
    dpItems.value = []; // Pastikan DP items juga direset
    addNewRow(); // Panggil ini untuk membuat baris kosong awal
};

const removeRow = (id: number) => {
    items.value = items.value.filter(item => item.id !== id);
    calculateTotals(); // Hitung ulang total setelah menghapus
};

const onGudangSelected = (gudang: { kode: string, nama: string }) => {
    header.value.gudang = gudang;
    isGudangSearchVisible.value = false;
};

const onCustomerSelected = async (customer: any) => {
    isCustomerSearchVisible.value = false;
    if (!customer || !customer.kode) return;

    // 1. Cek Level Customer
    if (!customer.level) {
        toast.error('Level Customer tersebut belum di-setting.');
        header.value.customer = null; // Kosongkan customer
        return;
    }

    // 2. Cek Customer Prioritas (Franchise)
    const gudang = header.value.gudang.kode;
    if (gudang === 'KPR' && customer.franchise !== 'Y') {
        toast.error('Customer bukan Customer Prioritas.');
        header.value.customer = null;
        return;
    }
    if (gudang !== 'KPR' && customer.franchise === 'Y') {
        toast.error('Customer Prioritas hanya bisa transaksi di Store KPR.');
        header.value.customer = null;
        return;
    }

    // Jika semua validasi lolos, isi data header
    header.value.customer = customer;
    header.value.level = customer.level;
    header.value.top = customer.top;
    header.value.alamat = customer.alamat;
    header.value.kota = customer.kota;
    header.value.telp = customer.telp;

    calculateTotals();
    toast.success(`Customer ${customer.nama} berhasil dipilih.`);
};

const onSalesCounterSelected = (salesCounter: { kode: string, nama: string }) => {
    header.value.salesCounter = salesCounter.kode; // Asumsi Anda menyimpan kodenya
    // Jika Anda juga perlu menyimpan nama, tambahkan ref-nya di 'header'
    // header.value.salesCounterNama = salesCounter.nama;
    isSalesCounterSearchVisible.value = false;
};

const onPenawaranSelected = async (penawaran: { nomor: string }) => {
    isPenawaranSearchVisible.value = false;
    toast.info(`Memuat detail dari Penawaran ${penawaran.nomor}...`);
    try {
        const response = await api.get(`/so-form/lookup/penawaran-details/${penawaran.nomor}`);
        const { header: penawaranHeader, details: penawaranDetails } = response.data;

        // Mengisi (overwrite) form dengan data dari Penawaran
        header.value.penawaran = penawaranHeader.pen_nomor;
        header.value.top = penawaranHeader.pen_top;
        header.value.keterangan = penawaranHeader.pen_ket;
        header.value.ppnPersen = penawaranHeader.pen_ppn;

        footer.value.biayaKirim = penawaranHeader.pen_bkrm;
        footer.value.diskonRp = penawaranHeader.pen_disc;
        footer.value.diskonPersen1 = penawaranHeader.pen_disc1;
        footer.value.diskonPersen2 = penawaranHeader.pen_disc2;

        items.value = penawaranDetails.map((d: any) => ({
            ...d,
            id: Date.now() + Math.random(),
        }));

        // Kunci field agar tidak bisa diubah lagi
        // isFromPenawaran.value = true; // Anda bisa tambahkan state ini untuk men-disable field

        calculateTotals();
    } catch (error) {
        toast.error('Gagal memuat detail Penawaran.');
    }
};

// Ganti dengan fungsi yang sudah terisi lengkap ini
const onProductsSelected = (selectedProducts: any[]) => {
    isProductSearchVisible.value = false;
    if (!selectedProducts || selectedProducts.length === 0) return;

    // Hapus baris kosong tempat F1/F2 ditekan
    items.value.splice(activeRowIndex.value, 1);

    // Loop melalui setiap produk yang dipilih dari modal
    selectedProducts.forEach(product => {
        // Cek duplikasi sebelum menambahkan
        const isDuplicate = items.value.some(item => item.barcode === product.barcode);
        if (!isDuplicate) {
            // Buat objek item SO yang lengkap dan tambahkan ke grid
            items.value.push({
                id: Date.now() + Math.random(), // Kunci unik sementara
                kode: product.kode,
                nama: product.nama,
                ukuran: product.ukuran,
                stok: product.stok,
                harga: product.harga,
                jumlah: 1, // Default jumlah 1
                diskonPersen: 0,
                diskonRp: 0,
                total: product.harga, // Total awal adalah harga satuan
                barcode: product.barcode,
                noSoDtf: '',
                noPengajuanHarga: '',
                pin: ''
            });
        }
    });

    addNewRow(); // Tambah baris kosong baru di akhir
    calculateTotals(); // Hitung ulang semua total
};

// const onSoDtfSelected = (soDtf: any) => {
//     // TODO: Implementasi logika untuk menambah item dari SO DTF ke grid
//     isSoDtfSearchVisible.value = false;
// };

// const onPriceProposalSelected = (proposal: any) => {
//     // TODO: Implementasi logika untuk menambah item dari Pengajuan Harga ke grid
//     isPriceProposalSearchVisible.value = false;
// };

const handleDiskonRpChange = () => {
    // Jika user mengisi diskon > 0, minta otorisasi
    if ((footer.value.diskonRp || 0) > 0) {
        // Reset diskon persen seperti di Delphi
        footer.value.diskonPersen1 = 0;
        footer.value.diskonPersen2 = 0;

        challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
        isAuthModalVisible.value = true; // Gunakan modal otorisasi yang sama
    } else {
        calculateTotals();
    }
};

const handleDiscount1Change = async () => {
    // Jangan lakukan apa-apa jika customer belum dipilih
    if (!header.value.customer || !header.value.level) {
        return;
    }

    try {
        // 1. Panggil API untuk mendapatkan diskon standar
        const response = await api.get('/so-form/lookup/default-discount', { // Pastikan endpoint-nya benar
            params: {
                level: header.value.level,
                total: footer.value.totalSo,
                gudang: header.value.gudang.kode,
            }
        });
        const defaultDiscountValue = response.data.discount;
        const enteredDiscount = footer.value.diskonPersen1;

        // 2. Jika diskon yang diinput BERBEDA dari standar, minta otorisasi
        if (enteredDiscount !== defaultDiscountValue && enteredDiscount > 0) {
            previousDiscount.value.persen1 = defaultDiscountValue;
            challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
            isAuthModalVisible.value = true;
        } else {
            calculateTotals();
        }
    } catch (error) {
        toast.error('Gagal memvalidasi diskon standar.');
    }
};

// Fungsi untuk menangani perubahan Diskon % 2
const handleDiscount2Change = () => {
    if (footer.value.diskonPersen1 <= 0 && footer.value.diskonPersen2 > 0) {
        toast.error('Diskon % 1 silahkan diisi dulu.');
        footer.value.diskonPersen2 = 0;
        return;
    }
    if (footer.value.diskonPersen2 > 0) {
        previousDiscount.value.persen2 = 0;
        challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
        isAuth2ModalVisible.value = true;
    } else {
        calculateTotals();
    }
};

// Fungsi untuk menangani perubahan Diskon % per item
const handleItemDiscountChange = (index: number) => {
    const item = items.value[index];
    if (item.diskonPersen > 0) {
        activeItemIndexForAuth.value = index;
        previousDiscount.value.item = 0; // Asumsi nilai lama adalah 0
        challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
        isItemAuthModalVisible.value = true;
    } else {
        calculateTotals();
    }
};

const onAuthSuccess = async (pin: string) => {
    try {
        await api.post('/auth-pin/validate', {
            code: challengeCode.value,
            pin: pin
        });

        footer.value.pinDiskon1 = pin;
        isAuthModalVisible.value = false;
        toast.success('Otorisasi diskon berhasil.');
        calculateTotals();
    } catch (error: any) {
        // --- 👇 PENANGANAN ERROR LOKAL 👇 ---
        // Jika status error adalah 401 (PIN salah), tangani di sini
        if (error.response && error.response.status === 401) {
            // Panggil method 'setFailed' di komponen modal untuk menampilkan pesan error
            if (authModalRef.value) {
                authModalRef.value.setFailed(error.response.data.message || 'Otorisasi Gagal.');
            }
        } else {
            // Jika error lain, tampilkan toast seperti biasa
            toast.error(error.response?.data?.message || 'Terjadi kesalahan.');
        }
    }
};

const onAuthCancel = () => {
    isAuthModalVisible.value = false;
    // Kembalikan nilai Diskon % dan Diskon Rp ke nilai sebelumnya
    footer.value.diskonPersen1 = previousDiscount.value.persen1;
    footer.value.diskonRp = previousDiskonRp.value;
    calculateTotals();
};

const onAuth2Success = async (pin: string) => {
    try {
        await api.post('/auth-pin/validate', { code: challengeCode.value, pin: pin });
        footer.value.pinDiskon2 = pin; // Simpan PIN yang valid
        isAuth2ModalVisible.value = false;
        toast.success('Otorisasi diskon 2 berhasil.');
        calculateTotals();
    } catch (error: any) {
        // --- 👇 PENANGANAN ERROR LOKAL 👇 ---
        // Jika status error adalah 401 (PIN salah), tangani di sini
        if (error.response && error.response.status === 401) {
            // Panggil method 'setFailed' di komponen modal untuk menampilkan pesan error
            if (auth2ModalRef.value) {
                auth2ModalRef.value.setFailed(error.response.data.message || 'Otorisasi Gagal.');
            }
        } else {
            // Jika error lain, tampilkan toast seperti biasa
            toast.error(error.response?.data?.message || 'Terjadi kesalahan.');
        }
    }
};

const onAuth2Cancel = () => {
    isAuth2ModalVisible.value = false;
    footer.value.diskonPersen2 = previousDiscount.value.persen2;
    calculateTotals();
};

const onItemAuthSuccess = async (pin: string) => {
    try {
        await api.post('/auth-pin/validate', { code: challengeCode.value, pin: pin });
        items.value[activeItemIndexForAuth.value].pin = pin; // Simpan PIN yang valid
        isItemAuthModalVisible.value = false;
        toast.success('Otorisasi diskon item berhasil.');
        calculateTotals();
    } catch (error: any) {
        // --- 👇 PENANGANAN ERROR LOKAL 👇 ---
        // Jika status error adalah 401 (PIN salah), tangani di sini
        if (error.response && error.response.status === 401) {
            // Panggil method 'setFailed' di komponen modal untuk menampilkan pesan error
            if (itemAuthModalRef.value) {
                itemAuthModalRef.value.setFailed(error.response.data.message || 'Otorisasi Gagal.');
            }
        } else {
            // Jika error lain, tampilkan toast seperti biasa
            toast.error(error.response?.data?.message || 'Terjadi kesalahan.');
        }
    }
};

const onItemAuthCancel = () => {
    isItemAuthModalVisible.value = false;
    items.value[activeItemIndexForAuth.value].diskonPersen = previousDiscount.value.item;
    calculateTotals();
};

// ... (method lain untuk dialog)
watch(items, calculateTotals, { deep: true });

onMounted(() => {
    if (isEditMode.value) {
        loadDataForEdit(route.params.nomor as string);
    } else {
        resetForm(); // Panggil resetForm yang sudah termasuk addNewRow
        isLoading.value = false;
    }
});
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-file-document-edit-outline">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="save">Simpan</v-btn>
            <v-btn size="small" @click="resetForm">Batal</v-btn>
            <v-btn size="small" @click="router.push('/transaksi/surat-pesanan')">Tutup</v-btn>
        </template>

        <div class="form-grid-container">
            <!-- Kolom Kiri -->
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-row dense>
                        <v-col cols="5">
                            <v-text-field label="Gudang" :model-value="header.gudang.kode" readonly
                                @click="openGudangSearch" :class="{ 'field-disabled': isEditMode }" variant="outlined"
                                density="compact" hide-details append-inner-icon="mdi-magnify" />
                        </v-col>
                        <v-col cols="7">
                            <v-text-field :model-value="header.gudang.nama" readonly filled density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="6"><v-text-field label="Nomor" v-model="header.nomor" readonly filled
                                density="compact" hide-details /></v-col>
                        <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date"
                                variant="outlined" density="compact" hide-details /></v-col>
                        <v-col cols="6">
                            <v-text-field label="Customer"
                                :model-value="header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''"
                                readonly @click="isCustomerSearchVisible = true" variant="outlined" density="compact"
                                hide-details append-inner-icon="mdi-magnify" />
                        </v-col>
                        <v-col cols="6"><v-text-field label="Dateline" v-model="header.dateline" type="date"
                                variant="outlined" density="compact" hide-details /></v-col>
                        <v-col cols="12">
                            <v-text-field label="Alamat" :model-value="header.customer?.alamat" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Kota / Telp"
                                :model-value="header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''"
                                readonly filled density="compact" hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Level" v-model="header.level" readonly filled density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Penawaran" v-model="header.penawaran" readonly
                                @click="openPenawaranSearch" variant="outlined" density="compact" hide-details
                                append-inner-icon="mdi-magnify" />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Sales Counter" v-model="header.salesCounter" readonly
                                @click="openSalesCounterSearch" variant="outlined" density="compact" hide-details
                                append-inner-icon="mdi-magnify" />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Tempo/Tgl" v-model="header.tempo" variant="outlined" density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="12"><v-text-field label="Keterangan" v-model="header.keterangan" variant="outlined"
                                density="compact" hide-details /></v-col>
                    </v-row>
                </div>
                <div class="desktop-form-section status-section">
                    <v-alert density="compact" variant="tonal"
                        :color="header.statusSo === 'AKTIF' ? 'success' : 'error'" class="mb-2">
                        Status SO: <strong>{{ header.statusSo }}</strong>
                    </v-alert>
                    <div class="text-caption text-center">{{ `Minimal DP 30% dari nominal SO : ${new
                        Intl.NumberFormat('id-ID').format(footer.minimalDp)}` }}</div>
                    <v-btn block color="teal" class="mt-4">Input DP (Uang Muka)</v-btn>
                    <v-btn block color="orange" class="mt-2" v-if="header.statusSo === 'PASIF'">Minta Otorisasi</v-btn>
                </div>
            </div>

            <!-- Kolom Kanan -->
            <div class="right-column">
                <div class="desktop-form-section main-grid-section">
                    <v-data-table :headers="mainTableHeaders" :items="items" class="desktop-table">
                        <template #item.kode="{ item, index }">
                            <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                                placeholder="F1/F2..." @keydown.f1.prevent="openProductSearch(index, false)"
                                @keydown.f2.prevent="openProductSearch(index, true)">
                                <template #append-inner><v-icon
                                        @click="openProductSearch(index, false)">mdi-magnify</v-icon></template>
                            </v-text-field>
                        </template>
                        <template #item.jumlah="{ item }">
                            <v-text-field v-model.number="item.jumlah" type="number" variant="underlined"
                                density="compact" hide-details class="text-end" :disabled="!item.kode"></v-text-field>
                        </template>

                        <template #item.diskonPersen="{ item, index }">
                            <v-text-field v-model.number="item.diskonPersen" type="number" variant="underlined"
                                density="compact" hide-details class="text-end"
                                @blur="handleItemDiscountChange(index)" />
                        </template>
                        <template #item.noSoDtf="{ item, index }">
                            <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details
                                placeholder="F1..." @keydown.f1.prevent="openSoDtfSearch(index)" />
                        </template>

                        <template #item.noPengajuanHarga="{ item, index }">
                            <v-text-field v-model="item.noPengajuanHarga" variant="underlined" density="compact"
                                hide-details placeholder="F1..." @keydown.f1.prevent="openPriceProposalSearch(index)" />
                        </template>
                        <template #item.actions="{ item }">
                            <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                                @click="removeRow(item.id)" title="Hapus baris" />
                        </template>
                    </v-data-table>
                </div>
                <div class="desktop-form-section footer-grid-section">
                    <div class="footer-left">
                        <v-data-table :headers="dpTableHeaders" :items="dpItems" class="desktop-table dp-table"
                            :items-per-page="-1" fixed-header>
                            <template #item.nomor="{ item }">
                                <v-text-field v-model="item.nomor" variant="underlined" density="compact" hide-details
                                    placeholder="F1..."></v-text-field>
                            </template>
                            <template #item.jenis="{ item }">
                                <v-select v-model="item.jenis" :items="['TUNAI', 'TRANSFER', 'GIro']"
                                    variant="underlined" density="compact" hide-details></v-select>
                            </template>
                            <template #item.nominal="{ item }">
                                <v-text-field v-model.number="item.nominal" type="number" variant="underlined"
                                    density="compact" hide-details class="text-end"></v-text-field>
                            </template>
                            <template #bottom></template>
                        </v-data-table>
                    </div>
                    <div class="footer-right">
                        <v-row dense>
                            <v-col cols="6"><v-text-field label="Total SO"
                                    :model-value="new Intl.NumberFormat('id-ID').format(footer.totalSo)" readonly filled
                                    density="compact" hide-details class="text-end" /></v-col>
                            <v-col cols="6"><v-text-field label="Biaya Kirim" v-model.number="footer.biayaKirim"
                                    type="number" variant="outlined" density="compact" hide-details
                                    class="text-end" /></v-col>
                            <v-col cols="6">
                                <v-text-field label="Diskon Rp" v-model.number="footer.diskonRp" type="number"
                                    variant="outlined" density="compact" hide-details class="text-end"
                                    @focus="previousDiskonRp = footer.diskonRp || 0" @blur="handleDiskonRpChange" />
                            </v-col>
                            <v-col cols="6"><v-text-field label="Grand Total"
                                    :model-value="new Intl.NumberFormat('id-ID').format(footer.grandTotal)" readonly
                                    filled density="compact" hide-details class="text-end font-weight-bold" /></v-col>
                            <v-col cols="6">
                                <v-text-field label="Disc % 1" v-model.number="footer.diskonPersen1" type="number"
                                    variant="outlined" density="compact" hide-details class="text-end"
                                    @blur="handleDiscount1Change" />
                            </v-col>
                            <v-col cols="6"><v-text-field label="DP"
                                    :model-value="new Intl.NumberFormat('id-ID').format(footer.totalDp)" readonly filled
                                    density="compact" hide-details class="text-end" /></v-col>
                            <v-col cols="6">
                                <v-text-field label="Disc % 2" v-model.number="footer.diskonPersen2" type="number"
                                    variant="outlined" density="compact" hide-details class="text-end"
                                    @blur="handleDiscount2Change" />
                            </v-col>
                            <v-col cols="6"><v-text-field label="Belum Dibayar"
                                    :model-value="new Intl.NumberFormat('id-ID').format(footer.belumDibayar)" readonly
                                    filled density="compact" hide-details class="text-end font-weight-bold" /></v-col>
                            <v-col cols="6"><v-text-field label="PPN"
                                    :model-value="new Intl.NumberFormat('id-ID').format(footer.ppnRp)"
                                    variant="outlined" density="compact" hide-details class="text-end" /></v-col>
                            <v-col cols="6"><v-text-field label="Netto"
                                    :model-value="new Intl.NumberFormat('id-ID').format(footer.netto)" readonly filled
                                    density="compact" hide-details class="text-end" /></v-col>
                        </v-row>
                    </div>
                </div>
            </div>
        </div>

        <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''"
            @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" />
        <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="header.gudang.kode"
            @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
        <SalesCounterSearchModal v-if="isSalesCounterSearchVisible" @close="isSalesCounterSearchVisible = false"
            @sales-counter-selected="onSalesCounterSelected" />
        <PenawaranSearchModal v-if="isPenawaranSearchVisible" :cabang="header.gudang.kode"
            :customerKode="header.customer?.kode" @close="isPenawaranSearchVisible = false"
            @selected="onPenawaranSelected" />
        <ProductSearchModal v-if="isProductSearchVisible" :category="'Kaosan'" :gudang="header.gudang.kode"
            :multi="isMultiSelectProduct" @close="isProductSearchVisible = false"
            @products-selected="onProductsSelected" />
        <AuthorizationModal ref="authModalRef" v-if="isAuthModalVisible" title="Otorisasi Diskon Faktur"
            :challenge-code="challengeCode" @close="onAuthCancel" @success="onAuthSuccess" />
        <AuthorizationModal ref="auth2ModalRef" v-if="isAuth2ModalVisible" title="Otorisasi Diskon Faktur 2"
            :challenge-code="challengeCode" @close="onAuth2Cancel" @success="onAuth2Success" />
        <AuthorizationModal ref="ItemAuthModalRef" v-if="isItemAuthModalVisible" title="Otorisasi Diskon per Item"
            :challenge-code="challengeCode" @close="onItemAuthCancel" @success="onItemAuthSuccess" />
    </PageLayout>
</template>

<style scoped>
.form-grid-container {
    grid-template-columns: 450px 1fr;
}

.left-column,
.right-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
}

.header-section {
    flex-shrink: 0;
}

.status-section {
    flex-grow: 1;
}

.main-grid-section {
    flex-grow: 1;
    min-height: 200px;
    /* Beri tinggi minimal agar tidak gepeng */
    display: flex;
}

.main-grid-section .v-data-table {
    flex-grow: 1;
}

.footer-grid-section {
    font-size: 11px;
    flex-shrink: 0;
    display: flex;
    gap: 12px;
}

.dp-table {
    max-height: 150px;
    /* Batasi tinggi grid DP agar tidak terlalu dominan */
}

.field-disabled {
    background-color: #f0f0f0;
    pointer-events: none;
    /* Mencegah klik */
}
</style>

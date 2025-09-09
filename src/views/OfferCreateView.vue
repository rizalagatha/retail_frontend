<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/CustomerSearchModal.vue';
import GudangSearchModal from '@/components/GudangSearchModal.vue';
import ProductSearchModal from '@/components/ProductSearchModal.vue';
import AuthorizationModal from '@/components/AuthorizationModal.vue';
import SoDtfSearchModal from '@/components/SoDtfSearchModal.vue';
import PriceProposalSearchModal from '@/components/PriceProposalSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useRoute } from 'vue-router';
import { format, addDays, isValid } from 'date-fns';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = '42';

// --- Interfaces ---
interface OfferItem {
    id: number;
    kode: string;
    nama: string;
    ukuran: string;
    stok: number;
    jumlah: number;
    harga: number;
    diskonPersen: number;
    diskonRp: number;
    total: number;
    barcode: string;
    noSoDtf: string;
    noPengajuanHarga: string;
    pin: string;
}

interface Customer {
    kode: string;
    nama: string;
    alamat: string;
    kota: string;
    telp: string;
    top: number;
    level: string;
    discountRule: DiscountRule;
}

interface Gudang {
    kode: string;
    nama: string;
}

interface DiscountRule {
    diskon1: number;
    diskon2: number;
    nominal: number;
}

// --- State ---
const header = ref({
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    gudang: { kode: authStore.user?.cabang || '', nama: 'Gudang Utama' } as Gudang,
    customer: null as Customer | null,
    customerKode: '', // Tambahan: untuk menyimpan kode customer sementara
    top: 0,
    tempo: format(new Date(), 'yyyy-MM-dd'),
    ppnPersen: 0,
    keterangan: '',
});

const items = ref<OfferItem[]>([]);
const footer = ref({
    total: 0,
    diskonRp: 0,
    diskonPersen1: 0,
    diskonPersen2: 0,
    biayaKirim: 0,
    ppnRp: 0,
    netto: 0,
    grandTotal: 0,
    pinDiskon1: '',
    pinDiskon2: '',
});

const productCategory = ref('Kaosan');
const isCustomerSearchVisible = ref(false);
const isGudangSearchVisible = ref(false);
const isProductSearchVisible = ref(false);
const isSoDtfSearchVisible = ref(false);
const isPriceProposalSearchVisible = ref(false);
const activeRowIndex = ref(0);
const isSaving = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);
const isAuthModalVisible = ref(false);
const defaultDiscount = ref(0);
const previousDiscount = ref(0);
const isAuth2ModalVisible = ref(false);
const previousDiscount2 = ref(0);
const isItemAuthModalVisible = ref(false);
const activeItemIndexForAuth = ref(-1);
const previousItemDiscount = ref({ persen: 0, rp: 0 });
const challengeCode = ref('');

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah Penawaran: ${header.value.nomor}` : 'Buat Penawaran Baru');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const tableHeaders = [
    { title: 'Kode', key: 'kode', width: '200px' },
    { title: 'Nama Barang', key: 'nama', width: '300px' },
    { title: 'Ukuran', key: 'ukuran', width: '100px' },
    { title: 'Jml', key: 'jumlah', width: '120px' },
    { title: 'Harga', key: 'harga', width: '150px' },
    { title: 'Diskon %', key: 'diskonPersen', width: '120px' },
    { title: 'Diskon Rp', key: 'diskonRp', width: '150px' },
    { title: 'Total', key: 'total', align: 'end', width: '150px' },
    { title: 'Barcode', key: 'barcode', sortable: false },
    { title: 'No. SO DTF', key: 'noSoDtf', width: '150px' },
    { title: 'No. Pengajuan', key: 'noPengajuanHarga', width: '150px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '80px' },
] as const;

// --- Methods ---
const loadCustomerDetails = async () => {
    if (!header.value.customerKode) {
        // console.log('Tidak ada customer kode untuk dimuat');
        return;
    }

    // console.log('Loading customer details untuk kode:', header.value.customerKode);

    try {
        const response = await api.get(`/offer-form/customer-details/${header.value.customerKode}`);
        // console.log('Customer details response:', response.data);

        // Mapping data dari format API ke format frontend
        header.value.customer = {
            kode: header.value.customerKode, // Kode sudah kita punya
            nama: response.data.cus_nama || '',
            alamat: response.data.cus_alamat || '',
            kota: response.data.cus_kota || '',
            telp: response.data.cus_telp || '',
            top: response.data.cus_top || 0,
            level: response.data.xlevel
        };

        header.value.top = response.data.cus_top || 0;
        // console.log('Customer data after mapping:', header.value.customer);
        toast.success('Detail customer berhasil dimuat.');
    } catch (error) {
        console.error('Error loading customer details:', error);
        toast.error('Gagal memuat detail customer.');
        // Reset customer jika gagal
        header.value.customer = null;
        header.value.top = 0;
    }
};

const loadOfferData = async (nomor: string) => {
    try {
        const response = await api.get(`/offer-form/edit-details/${nomor}`);
        const { headerData, itemsData, footerData } = response.data;

        // Isi semua state dengan data yang diterima dari server
        header.value = headerData;
        items.value = itemsData;
        footer.value = footerData;

        toast.success(`Data untuk penawaran ${nomor} berhasil dimuat.`);
    } catch (error) {
        toast.error('Gagal memuat data penawaran.');
        router.push('/transaksi/penawaran'); // Kembali ke daftar jika gagal
    }
};

const openCustomerSearch = () => { isCustomerSearchVisible.value = true; };
const openGudangSearch = () => { isGudangSearchVisible.value = true; };

// Perbaikan: Hanya menerima kode customer dari modal
const onCustomerSelected = async (customer: { kode: string }) => {
    isCustomerSearchVisible.value = false;
    if (!customer || !customer.kode) return;

    try {
        // Panggil API yang sudah kita perbaiki, tambahkan parameter 'gudang'
        const response = await api.get(`/offer-form/customer-details/${customer.kode}`, {
            params: { gudang: header.value.gudang.kode }
        });

        // Data yang diterima sudah lengkap dan tervalidasi
        header.value.customer = response.data;
        header.value.top = response.data.top;
        applyDefaultDiscount();
        calculateTotals(); // Panggil kalkulasi ulang setelah customer dipilih
        toast.success(`Customer ${response.data.nama} berhasil dipilih.`);

    } catch (error: any) {
        // Menampilkan pesan error validasi dari backend
        toast.error(error.response?.data?.message || 'Gagal memuat detail customer.');
        header.value.customer = null; // Kosongkan customer jika validasi gagal
    }
};

const onGudangSelected = async (gudang: Gudang) => {
    // console.log('Gudang received:', gudang); // Debug log

    // Pastikan data gudang valid
    if (!gudang || !gudang.kode) {
        toast.error('Data gudang tidak valid.');
        return;
    }

    header.value.gudang = gudang;
    isGudangSearchVisible.value = false;

    if (!isEditMode.value) {
    }

    // Debug: Cek apakah ada customerKode
    // console.log('Customer kode saat ini:', header.value.customerKode);

    // Setelah gudang dipilih, load detail customer jika sudah ada kode customer
    if (header.value.customerKode) {
        // console.log('Memulai load customer details untuk kode:', header.value.customerKode);
        toast.info('Memuat detail customer...');
        await loadCustomerDetails();
    } else {
        // console.log('Tidak ada customer kode, skip load customer details');
    }
};

const openProductSearch = (index: number) => {
    if (!header.value.customer) {
        toast.error('Pilih Customer terlebih dahulu.');
        return;
    }
    activeRowIndex.value = index;
    isProductSearchVisible.value = true;
};

const onProductSelected = async (product: { kode: string }) => {
    isProductSearchVisible.value = false;
    if (!product || !product.kode) return;

    try {
        const response = await api.get(`/barcode-form/product-details/${product.kode}`);
        const productDetails = response.data;
        items.value.splice(activeRowIndex.value, 1);
        if (Array.isArray(productDetails)) {
            productDetails.forEach((detail: any) => {
                const isDuplicate = items.value.some(item => item.barcode === detail.barcode);
                if (!isDuplicate) {
                    items.value.push({
                        ...detail,
                        id: Date.now() + Math.random(),
                        jumlah: 1,
                        diskonPersen: 0,
                        diskonRp: 0,
                        total: detail.harga
                    });
                }
            });
        }
        addNewRow();
    } catch (error) {
        toast.error(`Gagal memuat detail produk.`);
    }
};

const calculateTotals = () => {
    let subtotal = 0;
    items.value.forEach(item => {
        const price = Number(item.harga) || 0;
        const qty = Number(item.jumlah) || 0;
        let discountRp = Number(item.diskonRp) || 0;
        const discountPersen = Number(item.diskonPersen) || 0;

        // Prioritaskan diskon persen jika diisi
        if (discountPersen > 0) {
            discountRp = (discountPersen / 100) * price;
            item.diskonRp = discountRp; // Update diskon Rp
        }

        item.total = qty * (price - discountRp);
        subtotal += item.total;
    });

    footer.value.total = subtotal;

    // const rule = header.value.customer?.discountRule;
    // if (rule) {
    //     if (subtotal >= rule.nominal) {
    //         footer.value.diskonPersen1 = rule.diskon1;
    //     } else {
    //         footer.value.diskonPersen1 = rule.diskon2;
    //     }
    // } else {
    //     footer.value.diskonPersen1 = 0;
    // }

    let discount1 = (footer.value.diskonPersen1 / 100) * subtotal;
    let afterDiscount1 = subtotal - discount1;
    let discount2 = (footer.value.diskonPersen2 / 100) * afterDiscount1;
    footer.value.diskonRp = discount1 + discount2;
    let netto = subtotal - footer.value.diskonRp;
    footer.value.netto = netto;
    footer.value.ppnRp = (header.value.ppnPersen / 100) * netto;
    footer.value.grandTotal = netto + footer.value.ppnRp + (Number(footer.value.biayaKirim) || 0);
};

const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({ id: Date.now(), kode: '', nama: '', ukuran: '', stok: 0, jumlah: 0, harga: 0, diskonPersen: 0, diskonRp: 0, total: 0, barcode: '', noSoDtf: '', noPengajuanHarga: '' });
    }
};

const removeRow = (index: number) => {
    items.value.splice(index, 1);
};

const save = async () => {
    // --- Validasi dari Delphi (btnSimpanClick) ---
    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
        return;
    }
    if (!header.value.customer) {
        toast.error('Customer harus dipilih terlebih dahulu.');
        return;
    }
    const validItems = items.value.filter(item => item.kode);
    if (validItems.length === 0) {
        toast.error('Detail barang harus diisi minimal 1 baris.');
        return;
    }
    for (const item of validItems) {
        if (!item.jumlah || item.jumlah <= 0) {
            toast.error(`Jumlah untuk barang '${item.nama}' harus diisi dan lebih dari 0.`);
            return;
        }
        if (!item.harga || item.harga < 0) { // Harga boleh 0, tapi tidak boleh null/undefined
            toast.error(`Harga untuk barang '${item.nama}' harus diisi.`);
            return;
        }
    }

    // --- Konfirmasi Simpan (dari MessageDlg) ---
    // Di sini kita akan menggunakan dialog konfirmasi yang sudah ada, jika Anda sudah membuatnya.
    // Jika belum, Anda bisa langsung menjalankan logika simpan.
    // Asumsi kita langsung simpan setelah validasi.

    isSaving.value = true;
    try {
        const payload = {
            header: header.value,
            footer: footer.value,
            details: validItems,
            user: authStore.user,
            isNew: !isEditMode.value,
        };

        const response = await api.post('/offer-form/save', payload);
        toast.success(response.data.message);
        router.push('/transaksi/penawaran');

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data penawaran.');
    } finally {
        isSaving.value = false;
    }
};

const resetForm = () => {
    header.value = {
        nomor: '',
        tanggal: format(new Date(), 'yyyy-MM-dd'),
        gudang: { kode: authStore.user?.cabang || '', nama: 'Gudang Utama' },
        customer: null,
        customerKode: '',
        top: 0,
        tempo: format(new Date(), 'yyyy-MM-dd'),
        ppnPersen: 0,
        keterangan: '',
    };
    items.value = [];
    addNewRow();
};

const handleDiscountChange = async () => {
    // Jangan lakukan apa-apa jika customer belum dipilih
    if (!header.value.customer || !header.value.customer.level) {
        calculateTotals();
        return;
    }

    try {
        // 1. Panggil API untuk mendapatkan diskon standar
        const response = await api.get('/offer-form/get-default-discount', {
            params: {
                level: header.value.customer.level,
                total: footer.value.total,
                gudang: header.value.gudang.kode,
            }
        });
        const defaultDiscountValue = response.data.discount;

        // 2. Bandingkan diskon yang diinput dengan diskon standar
        const enteredDiscount = footer.value.diskonPersen1;

        // 3. Jika diskonnya berbeda (lebih besar atau lebih kecil) & bukan 0, minta otorisasi
        if (enteredDiscount !== defaultDiscountValue && enteredDiscount > 0) {
            previousDiscount.value = defaultDiscountValue; // Simpan nilai default untuk opsi batal
            challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
            isAuthModalVisible.value = true; // Buka modal otorisasi
        } else {
            // Jika diskonnya sama dengan standar, atau 0, langsung hitung
            calculateTotals();
        }
    } catch (error) {
        toast.error('Gagal memvalidasi diskon standar.');
        // Kembalikan ke nilai sebelumnya jika API gagal
        footer.value.diskonPersen1 = previousDiscount.value; 
    }
};

const onAuthSuccess = async (pin: string) => {
    try {
        // Panggil API validasi PIN yang baru
        await api.post('/auth-pin/validate', {
            code: challengeCode.value,
            pin: pin
        });

        footer.value.pinDiskon1 = pin; // Simpan PIN yang valid
        isAuthModalVisible.value = false;
        toast.success('Otorisasi diskon berhasil.');
        calculateTotals();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Otorisasi Gagal.');
    }
};

const onAuthCancel = () => {
    isAuthModalVisible.value = false;
    footer.value.diskonPersen1 = previousDiscount.value;
    calculateTotals();
};

const handleItemDiscountChange = (index: number) => {
    const item = items.value[index];
    // Meniru logika Delphi: otorisasi diperlukan jika diskon diisi
    // (di dunia nyata, ini akan diperiksa ke backend)
    if (item.diskonPersen > 0 || item.diskonRp > 0) {
        activeItemIndexForAuth.value = index;
        previousItemDiscount.value = { persen: 0, rp: 0 }; // Asumsi diskon awal 0
        challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString(); // Buat kode acak
        isItemAuthModalVisible.value = true;
    } else {
        calculateTotals();
    }
};

const onItemAuthSuccess = async (pin: string) => {
    try {
        await api.post('/auth-pin/validate', {
            code: challengeCode.value,
            pin: pin
        });

        items.value[activeItemIndexForAuth.value].pin = pin; // Simpan PIN yang valid
        isItemAuthModalVisible.value = false;
        toast.success('Otorisasi diskon item berhasil.');
        calculateTotals();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Otorisasi Gagal.');
    }
};

const onItemAuthCancel = () => {
    isItemAuthModalVisible.value = false;
    const item = items.value[activeItemIndexForAuth.value];
    // Kembalikan ke diskon sebelumnya jika dibatalkan
    item.diskonPersen = previousItemDiscount.value.persen;
    item.diskonRp = previousItemDiscount.value.rp;
    calculateTotals();
};

const handleDiscount2Change = () => {
    // Fungsi ini akan dipanggil saat input diskon % 2 selesai diisi
    // Otorisasi diperlukan jika Diskon % 1 sudah diisi dan Diskon % 2 diubah menjadi > 0
    if (footer.value.diskonPersen1 > 0 && footer.value.diskonPersen2 > 0) {
        previousDiscount2.value = 0; // Simpan nilai lama (asumsi dari 0)
        challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString(); // Buat kode acak
        isAuth2ModalVisible.value = true;
    } else {
        calculateTotals();
    }
};

const onAuth2Success = async (pin: string) => {
    try {
        // Panggil API validasi PIN yang baru
        await api.post('/auth-pin/validate', {
            code: challengeCode.value,
            pin: pin
        });

        footer.value.pinDiskon2 = pin; // Simpan PIN yang valid
        isAuth2ModalVisible.value = false;
        toast.success('Otorisasi diskon berhasil.');
        calculateTotals();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Otorisasi Gagal.');
    }
};

const onAuth2Cancel = () => {
    isAuth2ModalVisible.value = false;
    footer.value.diskonPersen2 = previousDiscount2.value; // Kembalikan ke nilai sebelumnya
    calculateTotals();
};

const openSoDtfSearch = (index: number) => {
    if (!header.value.customer) {
        toast.error('Pilih Customer terlebih dahulu.');
        return;
    }
    activeRowIndex.value = index;
    isSoDtfSearchVisible.value = true;
};

const openPriceProposalSearch = (index: number) => {
    if (!header.value.customer) {
        toast.error('Pilih Customer terlebih dahulu.');
        return;
    }
    activeRowIndex.value = index;
    isPriceProposalSearchVisible.value = true;
};

// Method untuk menangani hasil pilihan dari modal SO DTF
const onSoDtfSelected = async (so: { nomor: string }) => {
    isSoDtfSearchVisible.value = false;
    // Hapus baris kosong tempat F1 ditekan
    items.value.splice(activeRowIndex.value, 1);

    try {
        // Panggil API untuk mengambil detail dari SO DTF yang dipilih
        const response = await api.get(`/so-dtf-form/${so.nomor}`); // Gunakan endpoint yang sudah ada
        const { header, detailsUkuran } = response.data;

        // Tambahkan setiap item dari detail SO DTF ke grid penawaran
        detailsUkuran.forEach((detail: any) => {
            items.value.push({
                id: Date.now() + Math.random(),
                kode: header.sd_nomor,
                nama: header.sd_nama,
                ukuran: detail.ukuran,
                jumlah: detail.jumlah,
                harga: detail.harga,
                total: detail.jumlah * detail.harga,
                noSoDtf: header.sd_nomor,
                // ... isi properti lain dengan default
                stok: 0, diskonPersen: 0, diskonRp: 0, barcode: '', noPengajuanHarga: '', pin: ''
            });
        });
        addNewRow(); // Tambah baris kosong baru di akhir
    } catch (error) {
        toast.error(`Gagal memuat detail SO DTF ${so.nomor}`);
    }
};

// Method untuk menangani hasil pilihan dari modal Pengajuan Harga
const onPriceProposalSelected = async (proposal: { nomor: string }) => {
    isPriceProposalSearchVisible.value = false;
    items.value.splice(activeRowIndex.value, 1);

    try {
        // Panggil API untuk mengambil detail Pengajuan yang dipilih
        const response = await api.get(`/price-proposal-form/edit-details/${proposal.nomor}`); // Gunakan endpoint yang sudah ada
        const { headerData, itemsData } = response.data;

        itemsData.forEach((detail: any) => {
            items.value.push({
                // ... map data dari itemsData ke item Penawaran ...
                id: Date.now() + Math.random(),
                kode: detail.kode,
                nama: detail.nama,
                ukuran: detail.ukuran,
                jumlah: detail.jumlah,
                harga: detail.harga,
                total: detail.total,
                noPengajuanHarga: headerData.nomor,
                // ...
            });
        });
        addNewRow();
    } catch (error) {
        toast.error(`Gagal memuat detail Pengajuan ${proposal.nomor}`);
    }
};

const showConfirmation = (action: () => void, text: string) => {
    pendingAction.value = action;
    confirmText.value = text;
    isConfirmDialogVisible.value = true;
};

const executePendingAction = () => {
    if (pendingAction.value) {
        pendingAction.value();
    }
    isConfirmDialogVisible.value = false;
};

const closeConfirmDialog = () => {
    isConfirmDialogVisible.value = false;
    pendingAction.value = null;
};

const closeForm = () => {
    router.push('/transaksi/penawaran');
};

const applyDefaultDiscount = () => {
    const rule = header.value.customer?.discountRule;
    if (rule) {
        // Logika ini dipindahkan dari calculateTotals
        if (footer.value.total >= rule.nominal) {
            footer.value.diskonPersen1 = rule.diskon1;
        } else {
            footer.value.diskonPersen1 = rule.diskon2;
        }
    } else {
        footer.value.diskonPersen1 = 0;
    }
};

const canEditFooter = computed(() => {
    // Tombol/field di footer hanya aktif jika customer sudah dipilih
    // DAN setidaknya ada satu baris barang yang sudah terisi (memiliki kode).
    return header.value.customer && items.value.some(item => item.kode);
});

watch(items, calculateTotals, { deep: true });
watch(footer, calculateTotals, { deep: true });
watch(() => header.value.ppnPersen, calculateTotals);

watch(() => header.value.top, (newTop) => {
    const date = new Date(header.value.tanggal);
    if (isValid(date)) {
        header.value.tempo = format(addDays(date, newTop || 0), 'yyyy-MM-dd');
    }
});
watch(() => header.value.tanggal, (newDate) => {
    const date = new Date(newDate);
    if (isValid(date)) {
        header.value.tempo = format(addDays(date, header.value.top || 0), 'yyyy-MM-dd');
    }
});

onMounted(() => {
    // Pengecekan otorisasi sebelum memuat apa pun
    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error(`Anda tidak memiliki izin untuk ${requiredPermission.value === 'insert' ? 'membuat' : 'mengubah'} data penawaran.`);
        router.push('/transaksi/penawaran');
        return;
    }

    if (isEditMode.value) {
        loadOfferData(route.params.nomor as string);
    } else {
        addNewRow();
    }
});

</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-file-document-edit-outline">
        <template #header-actions>
            <v-btn size="small" color="primary"
                @click="showConfirmation(save, 'Anda yakin ingin menyimpan data penawaran ini?')" :loading="isSaving">
                Simpan
            </v-btn>
            <v-btn v-if="!isEditMode" size="small"
                @click="showConfirmation(resetForm, 'Batalkan dan kosongkan semua isian?')">
                Batal
            </v-btn>
            <v-btn size="small"
                @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')">
                Tutup
            </v-btn>
        </template>

        <div class="form-grid-container">
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-row dense>
                        <v-col cols="6">
                            <v-text-field label="Nomor" :model-value="header.nomor || '<Otomatis>'" readonly
                                variant="filled" density="compact" hide-details>
                            </v-text-field>
                        </v-col>
                        <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date"
                                variant="outlined" density="compact" hide-details></v-text-field></v-col>
                        <v-col cols="12"><v-text-field label="Gudang" :model-value="header.gudang.kode" readonly
                                @click="openGudangSearch" variant="outlined" density="compact" hide-details
                                append-inner-icon="mdi-magnify"></v-text-field></v-col>
                        <v-col cols="12"><v-text-field label="Customer"
                                :model-value="header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''"
                                readonly @click="openCustomerSearch" variant="outlined" density="compact" hide-details
                                append-inner-icon="mdi-magnify"></v-text-field></v-col>
                        <v-col cols="12"><v-text-field label="Alamat" :model-value="header.customer?.alamat" readonly
                                variant="filled" density="compact" hide-details></v-text-field></v-col>
                        <v-col cols="6"><v-text-field label="Kota / Telp"
                                :model-value="header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''"
                                readonly variant="filled" density="compact" hide-details></v-text-field></v-col>
                        <v-col cols="6"><v-text-field label="Level" :model-value="header.customer?.level" readonly
                                variant="filled" density="compact" hide-details></v-text-field></v-col>
                        <v-col cols="4"><v-text-field label="TOP" v-model.number="header.top" type="number"
                                variant="outlined" density="compact" hide-details></v-text-field></v-col>
                        <v-col cols="8"><v-text-field label="Tgl Tempo" v-model="header.tempo" type="date"
                                variant="filled" readonly density="compact" hide-details></v-text-field></v-col>
                        <v-col cols="12"><v-textarea label="Keterangan" v-model="header.keterangan" rows="2"
                                variant="outlined" density="compact" hide-details></v-textarea></v-col>
                    </v-row>
                </div>
                <div class="desktop-form-section footer-section">
                    <v-text-field label="PPN %" v-model.number="header.ppnPersen" type="number" variant="outlined"
                        density="compact" hide-details class="summary-field"></v-text-field>
                    <v-text-field label="Biaya Kirim" v-model.number="footer.biayaKirim" type="number"
                        variant="outlined" density="compact" hide-details
                        class="summary-field text-right"></v-text-field>
                    <div class="d-flex ga-2">
                        <v-text-field label="Diskon % 1" v-model.number="footer.diskonPersen1" type="number"
                            variant="outlined" density="compact" hide-details :disabled="!canEditFooter"
                            @blur="handleDiscountChange"></v-text-field>
                        <v-text-field label="Diskon % 2" v-model.number="footer.diskonPersen2" type="number"
                            variant="outlined" density="compact" hide-details :disabled="!canEditFooter"
                            @blur="handleDiscount2Change"></v-text-field>
                    </div>
                    <v-divider class="my-2"></v-divider>
                    <v-text-field label="Total" :model-value="new Intl.NumberFormat('id-ID').format(footer.total)"
                        readonly variant="filled" density="compact" hide-details
                        class="summary-field text-right"></v-text-field>
                    <v-text-field label="Grand Total"
                        :model-value="new Intl.NumberFormat('id-ID').format(footer.grandTotal)" readonly
                        variant="filled" density="compact" hide-details
                        class="summary-field text-right font-weight-bold"></v-text-field>
                </div>
            </div>

            <div class="desktop-form-section right-column">
                <v-data-table :headers="tableHeaders" :items="items" density="compact" class="desktop-table"
                    fixed-header :items-per-page="-1">
                    <template #item.kode="{ item }">
                        <v-text-field v-model="item.kode" readonly
                            @keydown.f1.prevent="openProductSearch(items.indexOf(item))" placeholder="F1..."
                            variant="underlined" dense hide-details single-line>
                            <template #append-inner>
                                <v-icon @click="openProductSearch(items.indexOf(item))"
                                    size="small">mdi-magnify</v-icon>
                            </template>
                        </v-text-field>
                    </template>
                    <template #item.jumlah="{ item }"><v-text-field v-model.number="item.jumlah" type="number"
                            variant="underlined" dense hide-details single-line
                            :disabled="!item.kode"></v-text-field></template>
                    <template #item.harga="{ item }"><v-text-field v-model.number="item.harga" type="number"
                            variant="underlined" dense hide-details single-line
                            :disabled="!item.kode"></v-text-field></template>
                    <template #item.diskonPersen="{ item }"><v-text-field v-model.number="item.diskonPersen"
                            type="number" variant="underlined" dense hide-details single-line
                            @blur="handleItemDiscountChange(items.indexOf(item))"
                            :disabled="!item.kode"></v-text-field></template>
                    <template #item.diskonRp="{ item }"><v-text-field v-model.number="item.diskonRp" type="number"
                            variant="underlined" dense hide-details single-line
                            @blur="handleItemDiscountChange(items.indexOf(item))"
                            :disabled="!item.kode"></v-text-field></template>
                    <template #item.total="{ item }"><span class="text-caption font-weight-bold">{{ new
                        Intl.NumberFormat('id-ID').format(item.total) }}</span></template>
                    <template #item.actions="{ item }"><v-btn icon="mdi-delete" size="x-small" variant="text"
                            color="error" @click="removeRow(items.indexOf(item))"></v-btn></template>
                    <template #item.noSoDtf="{ item, index }">
                        <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details
                            placeholder="F1..." @keydown.f1.prevent="openSoDtfSearch(index)"><template
                                #append-inner><v-icon @click="openSoDtfSearch(items.indexOf(item))"
                                    size="small">mdi-magnify</v-icon></template></v-text-field>
                    </template>
                    <template #item.noPengajuanHarga="{ item, index }">
                        <v-text-field v-model="item.noPengajuanHarga" variant="underlined" density="compact"
                            hide-details placeholder="F1..."
                            @keydown.f1.prevent="openPriceProposalSearch(index)"><template #append-inner><v-icon
                                    @click="openPriceProposalSearch(items.indexOf(item))"
                                    size="small">mdi-magnify</v-icon></template></v-text-field>
                    </template>
                    <template #bottom>
                        <div class="pa-1 text-right border-t"><v-btn size="small" @click="addNewRow"
                                prepend-icon="mdi-plus" variant="text" color="primary">Tambah Baris</v-btn></div>
                    </template>
                </v-data-table>
            </div>
        </div>

        <!-- Modals -->
        <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="header.gudang.kode"
            @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
        <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''"
            @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" />
        <ProductSearchModal v-if="isProductSearchVisible" :category="productCategory" :gudang="header.gudang.kode"
            @close="isProductSearchVisible = false" @product-selected="onProductSelected" />
        <AuthorizationModal v-if="isAuthModalVisible" title="Otorisasi Ganti Diskon Faktur"
            :challenge-code="challengeCode" @close="onAuthCancel" @success="onAuthSuccess" />
        <AuthorizationModal v-if="isItemAuthModalVisible" title="Otorisasi Diskon per Item"
            :challenge-code="challengeCode" @close="onItemAuthCancel" @success="onItemAuthSuccess" />
        <AuthorizationModal v-if="isAuth2ModalVisible" title="Otorisasi Ganti Diskon 2" :challenge-code="challengeCode"
            @close="onAuth2Cancel" @success="onAuth2Success" />
        <SoDtfSearchModal v-if="isSoDtfSearchVisible" :cabang="header.gudang.kode" :customerKode="header.customer?.kode"
            @close="isSoDtfSearchVisible = false" @selected="onSoDtfSelected" />
        <PriceProposalSearchModal v-if="isPriceProposalSearchVisible" :cabang="header.gudang.kode"
            :customerKode="header.customer?.kode" @close="isPriceProposalSearchVisible = false"
            @selected="onPriceProposalSelected" />

        <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">
                    Konfirmasi
                </v-card-title>
                <v-card-text>
                    {{ confirmText }}
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">
                        Tidak
                    </v-btn>
                    <v-btn color="primary" variant="tonal" @click="executePendingAction">
                        Ya, Lanjutkan
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
.form-grid-container {
    padding: 12px;
    height: 100%;
    display: grid;
    grid-template-columns: 450px 1fr;
    gap: 12px;
}

.left-column,
.right-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
}

.header-section,
.footer-section {
    flex-shrink: 0;
}

.right-column {
    flex-grow: 1;
}

.footer-section :deep(.summary-label) {
    font-size: 11px !important;
}

/* Mengatur font untuk nilai angka */
.footer-section :deep(.summary-value) {
    font-size: 11px !important;
}

/* Khusus untuk Grand Total agar sedikit lebih besar dan tebal */
.footer-section :deep(.grand-total .summary-label) {
    font-size: 12px !important;
    font-weight: 600;
}

.footer-section :deep(.grand-total .summary-value) {
    font-size: 13px !important;
    font-weight: 700;
}

/* Mengatur font untuk field input di footer */
.footer-section :deep(input) {
    font-size: 12px !important;
}

.desktop-table {
    font-size: 11px;
    height: 100%;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 28px !important;
}

.desktop-table :deep(input) {
    font-size: 11px !important;
}

.header-section :deep(.v-col) {
    padding-top: 4px;
    padding-bottom: 4px;
}

.summary-field {
    margin-bottom: 4px;
}

/* Mengatur font untuk label (Nomor, Tanggal, Customer, dll.) */
.header-section :deep(.v-label) {
    font-size: 11px !important;
}

/* Mengatur font untuk teks yang diketik di dalam field */
.header-section :deep(input) {
    font-size: 12px !important;
}

/* Mengatur font untuk label pada radio button */
.header-section :deep(.v-radio-group .v-label) {
    font-size: 12px !important;
}

.text-right :deep(input) {
    text-align: right;
}
</style>
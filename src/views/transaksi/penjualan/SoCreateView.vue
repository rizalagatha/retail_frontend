<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, addDays, isValid } from 'date-fns';
import type { AxiosError } from 'axios';
import axios from 'axios';

// Impor semua komponen modal yang akan digunakan
import CustomerSearchModal from '@/components/CustomerSearchModal.vue';
import GudangSearchModal from '@/components/GudangSearchModal.vue';
import SalesCounterSearchModal from '@/components/SalesCounterSearchModal.vue';
import ProductSearchModal from '@/components/ProductSearchModal.vue';
import PenawaranSearchModal from '@/components/PenawaranSearchModal.vue';
import SoDtfSearchModal from '@/components/SoDtfSearchModal.vue';
import PriceProposalSearchModal from '@/components/PriceProposalSearchModal.vue';
import AuthorizationModal from '@/components/AuthorizationModal.vue';
import DpInputModal from '@/components/DpInputModal.vue';
import CustomerForm from '@/components/CustomerForm.vue';

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

interface Customer {
    kode: string;
    nama: string;
    alamat?: string;
    kota?: string;
    telp?: string;
    discountRule?: {
        nominal: number;
        diskon1: number;
        diskon2: number;
    };
    level_kode: string;    // tambahan
    level_nama: string;    // tambahan
    top: number;           // tambahan
    franchise: 'Y' | 'N';
}

interface SoItemApi {
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

interface Item {
    kode: string;
    jumlah: number;
    diskonPersen: number;
    noSoDtf?: string;
    noPengajuanHarga?: string;
    id: number;
    [key: string]: unknown;
}

interface PenawaranDetail {
    kode: string;
    jumlah: number;
    harga: number;
    diskonPersen?: number;
    diskonRp?: number;
    total?: number;
    noSoDtf?: string;
    noPengajuanHarga?: string;
    [key: string]: unknown;
}

interface SoDtfDetail {
    sd_nomor: string;
    nama: string;
    ukuran: string;
    jumlah: number;
    harga: number;
    total: number;
}

interface PriceProposalHeader {
    ph_nomor: string;
    ph_diskon: number;
}

interface PriceProposalDetail {
    kode: string;
    nama: string;
    ukuran: string;
    stok: number;
    jumlah: number;
    harga: number;
    total: number;
    barcode: string;
}

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Surat Pesanan' : 'Buat Surat Pesanan');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');
const isLoading = ref(true);
const isSaving = ref(false);
const isSavingDisabled = ref(false);
const scannedBarcode = ref('');

const initialHeaderState = {
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    dateline: format(new Date(), 'yyyy-MM-dd'),
    gudang: { kode: authStore.user?.cabang || '', nama: authStore.user?.cabangNama || '' },
    customer: null as Customer | null,
    penawaran: '',
    salesCounter: authStore.user?.kode || '',
    levelKode: '',
    levelNama: '',
    keterangan: '',
    telp: '',
    top: 0,
    alamat: '',
    kota: '',
    tempo: '',
    ppnPersen: 0,
    statusSo: 'PASIF',
    accDpPin: '',
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
    pinTanpaDp: '',
    pinDiskon1: undefined,
    pinDiskon2: undefined,
});

// State untuk modals & dialogs
const isGudangSearchVisible = ref(false);
const isCustomerSearchVisible = ref(false);
const isSalesCounterSearchVisible = ref(false);
const isPenawaranSearchVisible = ref(false);
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
const isSoDtfSearchVisible = ref(false);
const isPriceProposalSearchVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);
const activeRowIndex = ref(0);
const isAuthModalVisible = ref(false);
const isAuth2ModalVisible = ref(false);
const isItemAuthModalVisible = ref(false);
const isDpAuthVisible = ref(false);
const activeItemIndexForAuth = ref(-1);
const previousDiscount = ref({ persen1: 0, persen2: 0, item: 0 });
const challengeCode = ref('');
const authModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const auth2ModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const itemAuthModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const dpAuthModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const isDpInputVisible = ref(false);
const isNewCustomerFormVisible = ref(false);
const previousDiskonRp = ref(0);

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
] as const;

const dpTableHeaders = [
    { title: 'No. Setoran', key: 'nomor' },
    { title: 'Jenis', key: 'jenis' },
    { title: 'Nominal', key: 'nominal' },
    { title: 'Posting', key: 'posting' },
    { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
] as const;

// --- Computed Properties ---
const minimalDpText = computed(() => {
    const containsDtf = items.value.some(item => item.noSoDtf);
    const percentage = containsDtf ? 50 : 30;
    const amount = new Intl.NumberFormat('id-ID').format(footer.value.minimalDp);
    return `Minimal DP ${percentage}% dari nominal SO : ${amount}`;
});

// --- Functions ---    
function toDateInputValue(dateStr: string) {
    if (!dateStr) return ''
    return dateStr.split('T')[0] // ambil yyyy-MM-dd saja
}

// --- Methods ---
const loadDataForEdit = async (nomor: string) => {
    isLoading.value = true;
    try {

        const response = await api.get(`/so-form/${nomor}`);
        const { headerData, itemsData, dpItemsData, footerData } = response.data;

        // ===== MAPPING HEADER =====
        header.value = {
            ...header.value,
            ...headerData,
            level: headerData.levelKode || '',
            levelKode: headerData.levelKode || '',
            levelNama: headerData.levelNama || '',
            tanggal: toDateInputValue(headerData.tanggal),
            dateline: toDateInputValue(headerData.dateline),
        };

        // ===== MAPPING FOOTER =====      
        footer.value = {
            ...footer.value,
            ...footerData
        };

        // ===== MAPPING ITEMS =====
        items.value = itemsData.map((item: Item, index: number): Item => {
            return {
                ...item,
                id: Date.now() + Math.random() + index,
            };
        });

        // ===== MAPPING DP ITEMS =====
        dpItems.value = dpItemsData;

        // ===== EDIT PERMISSION CHECK =====
        if (!headerData.canEdit) {
            isSavingDisabled.value = true;
            toast.warning('SO ini sudah menjadi Invoice, data tidak bisa diubah.');
        }

        // ===== CRITICAL SECTION: ADD NEW ROW =====    
        try {
            addNewRow();
        } catch (addRowError) {
            throw new Error(`addNewRow failed: ${addRowError.message}`);
        }

        // ===== CRITICAL SECTION: AWAIT NEXTTICK =====
        try {
            await nextTick();
        } catch (nextTickError) {
            throw new Error(`nextTick failed: ${nextTickError.message}`);
        }

        // ===== CRITICAL SECTION: CALCULATE TOTALS =====       
        try {
            calculateTotals();
        } catch (calcError) {
            throw new Error(`calculateTotals failed: ${calcError.message}`);
        }

        toast.success(`Data untuk SO ${nomor} berhasil dimuat.`);

    } catch (error) {
        const err = error as AxiosError<{ message: string }>;
        toast.error(err.response?.data?.message || err.message || 'Gagal memuat data SO.');
        router.push('/transaksi/penjualan/surat-pesanan');
    } finally {
        isLoading.value = false;
    }
};

const calculateTotals = () => {
    // --- Kalkulasi Total per Baris ---
    let totalSo = 0;
    let containsDtf = false;
    items.value.forEach(item => {
        const qty = Number(item.jumlah) || 0;
        const harga = Number(item.harga) || 0;

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

    // --- Kalkulasi Diskon Faktur ---
    // Hanya terapkan diskon default jika belum ada otorisasi PIN manual
    if (!footer.value.pinDiskon1) {
        const rule = header.value.customer?.discountRule;
        if (rule) {
            if (totalSo >= rule.nominal) {
                footer.value.diskonPersen1 = rule.diskon1;
            } else {
                footer.value.diskonPersen1 = rule.diskon2;
            }
            // Asumsi diskon 2 tidak diatur secara default dari level
            // footer.value.diskonPersen2 = rule.diskon2; 
        } else {
            footer.value.diskonPersen1 = 0;
        }
    }

    // Lanjutkan sisa kalkulasi dengan nilai diskon yang sudah benar
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
        footer.value.minimalDp = 0.5 * footer.value.netto; // Minimal DP 50% jika ada SO DTF
    } else {
        footer.value.minimalDp = 0.3 * footer.value.netto; // Minimal DP 30% untuk SO biasa
    }

    footer.value.belumDibayar = footer.value.grandTotal - footer.value.totalDp;

    // --- Penentuan Status SO (AKTIF/PASIF) ---
    // Level 8 (mungkin user khusus) dan DP yang mencukupi akan membuat status AKTIF
    const isLevel8 = header.value.levelKode?.toString().startsWith('8');
    if (isLevel8 || totalDp >= footer.value.minimalDp) {
        header.value.statusSo = 'AKTIF';
    } else {
        header.value.statusSo = 'PASIF';
    }
};

const openDpAuthorization = () => {
    challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
    isDpAuthVisible.value = true;
};

const openGudangSearch = () => {
    // Gudang hanya bisa diubah saat membuat SO baru
    if (!isEditMode.value) {
        isGudangSearchVisible.value = true;
    }
};

// const openCustomerSearch = () => {
//     if (!header.value.gudang.kode) {
//         toast.error('Pilih Gudang terlebih dahulu.');
//         return;
//     }
//     isCustomerSearchVisible.value = true;
// };

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

const save = () => {
    // --- Migrasi Validasi dari Delphi (btnSimpanClick) ---
    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
        return;
    }

    if (!header.value.customer) {
        toast.error('Customer harus diisi.');
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
        if (item.harga === null || item.harga < 0) {
            toast.error(`Harga untuk barang '${item.nama}' harus diisi.`);
            return;
        }
    }
    if (footer.value.totalDp < footer.value.minimalDp && header.value.statusSo === 'PASIF') {
        toast.warning('DP di bawah Minimal DP. SO ini akan berstatus PASIF. Minta otorisasi atau lunasi DP agar SO menjadi AKTIF.');
        // Tidak menghentikan proses, hanya memberi peringatan
    }

    // Jika semua validasi lolos, tampilkan dialog konfirmasi
    showConfirmation(executeSave, "Anda yakin ingin menyimpan Surat Pesanan ini?");
};

const executeSave = async () => {
    isSaving.value = true;
    try {
        const payload = {
            header: {
                ...header.value,
                level: header.value.levelKode
            },
            footer: footer.value,
            details: items.value.filter(item => item.kode),
            dps: dpItems.value,
            isNew: !isEditMode.value,
            user: authStore.user // Pastikan user juga dikirim
        };
        const response = await api.post('/so-form/save', payload);
        toast.success(response.data.message);
        router.push('/transaksi/penjualan/surat-pesanan');
    } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message: string }>;
        toast.error(axiosError.response?.data?.message || 'Gagal menyimpan data.');
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

const onCustomerSelected = async (customer: Customer) => {
    isCustomerSearchVisible.value = false;
    if (!customer || !customer.kode) return;

    // 1. Cek Level Customer
    if (!customer.level_kode) {
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
    header.value.levelKode = customer.level_kode; // utk backend
    header.value.levelNama = customer.level_nama; // utk tampilan
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

        items.value = penawaranDetails.map((d: PenawaranDetail) => ({
            ...d,
            id: Date.now() + Math.random(),
        }));

        // Kunci field agar tidak bisa diubah lagi
        // isFromPenawaran.value = true; // Anda bisa tambahkan state ini untuk men-disable field

        calculateTotals();
    } catch (error) {
        toast.error('Gagal memuat detail Penawaran.', error);
    }
};

// Ganti dengan fungsi yang sudah terisi lengkap ini
const onProductsSelected = (selectedProducts: SoItemApi[]) => {
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

const onSoDtfSelected = async (soDtf: { nomor: string }) => {
    isSoDtfSearchVisible.value = false;
    items.value.splice(activeRowIndex.value, 1);

    try {
        const response = await api.get<SoDtfDetail[]>(`/offer-form/search/so-dtf-details/${soDtf.nomor}`);
        const soDtfDetails = response.data;

        soDtfDetails.forEach((detail) => {
            const isDuplicate = items.value.some(item =>
                item.noSoDtf === detail.sd_nomor && item.ukuran === detail.ukuran
            );

            if (!isDuplicate) {
                items.value.push({
                    id: Date.now() + Math.random(),
                    kode: detail.sd_nomor,
                    nama: detail.nama,
                    ukuran: detail.ukuran,
                    jumlah: detail.jumlah,
                    harga: detail.harga,
                    total: detail.total,
                    noSoDtf: detail.sd_nomor,
                    stok: 0, diskonPersen: 0, diskonRp: 0, barcode: '', noPengajuanHarga: '', pin: ''
                });
            }
        });

        addNewRow();
        calculateTotals();
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            toast.error(`Gagal memuat detail SO DTF ${soDtf.nomor}: ${error.response?.data?.message}`);
        } else {
            toast.error(`Gagal memuat detail SO DTF ${soDtf.nomor}`);
        }
    }
};

const onPriceProposalSelected = async (proposal: { nomor: string }) => {
    isPriceProposalSearchVisible.value = false;
    if (!proposal || !proposal.nomor) return;

    const isDuplicate = items.value.some(item => item.noPengajuanHarga === proposal.nomor);
    if (isDuplicate) {
        toast.error(`No. Pengajuan ${proposal.nomor} sudah diinput di baris lain.`);
        return;
    }

    toast.info(`Memuat detail dari Pengajuan Harga ${proposal.nomor}...`);

    try {
        const response = await api.get<{ headerData: PriceProposalHeader; itemsData: PriceProposalDetail[] }>(
            `/offer-form/search/price-proposal-details/${proposal.nomor}`
        );
        const { headerData, itemsData } = response.data;

        items.value.splice(activeRowIndex.value, 1);

        itemsData.forEach((detail) => {
            items.value.push({
                id: Date.now() + Math.random(),
                kode: detail.kode,
                nama: detail.nama,
                ukuran: detail.ukuran,
                stok: detail.stok,
                jumlah: detail.jumlah,
                harga: detail.harga,
                total: detail.total,
                diskonPersen: 0,
                diskonRp: 0,
                barcode: detail.barcode,
                noPengajuanHarga: headerData.ph_nomor,
                noSoDtf: '',
                pin: ''
            });
        });

        footer.value.diskonRp = headerData.ph_diskon || 0;

        addNewRow();
        calculateTotals();
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            toast.error(`Gagal memuat detail Pengajuan ${proposal.nomor}: ${error.response?.data?.message}`);
        } else {
            toast.error(`Gagal memuat detail Pengajuan ${proposal.nomor}`);
        }
    }
};

const handleDiscount1Change = async () => {
    // Jangan lakukan apa-apa jika customer belum dipilih
    if (!header.value.customer || !header.value.customer.level_kode) {
        return;
    }

    try {
        // 1. Panggil API untuk mendapatkan diskon standar
        const response = await api.get('/so-form/lookup/default-discount', {
            params: {
                level: header.value.customer.level_kode,
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
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            toast.error('Gagal memvalidasi diskon standar: ' + (error.response?.data?.message || ''));
        } else {
            toast.error('Gagal memvalidasi diskon standar.');
        }
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
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ message?: string }>;
            // --- 👇 PENANGANAN ERROR LOKAL 👇 ---
            if (axiosError.response?.status === 401) {
                if (authModalRef.value) {
                    authModalRef.value.setFailed(axiosError.response.data?.message || 'Otorisasi Gagal.');
                }
            } else {
                toast.error(axiosError.response?.data?.message || 'Terjadi kesalahan.');
            }
        } else {
            // error bukan dari axios
            toast.error('Terjadi kesalahan yang tidak diketahui.');
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
    } catch (error) {
        const axiosError = error as AxiosError<{ message: string }>;

        // Jika status error 401 (PIN salah)
        if (axiosError.response?.status === 401) {
            if (auth2ModalRef.value) {
                auth2ModalRef.value.setFailed(
                    axiosError.response.data?.message || 'Otorisasi Gagal.'
                );
            }
        } else {
            toast.error(axiosError.response?.data?.message || 'Terjadi kesalahan.');
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
    } catch (error) {
        const axiosError = error as AxiosError<{ message: string }>;

        // Jika status error 401 (PIN salah)
        if (axiosError.response?.status === 401) {
            if (itemAuthModalRef.value) {
                itemAuthModalRef.value.setFailed(
                    axiosError.response.data?.message || 'Otorisasi Gagal.'
                );
            }
        } else {
            toast.error(axiosError.response?.data?.message || 'Terjadi kesalahan.');
        }
    }
};

const onItemAuthCancel = () => {
    isItemAuthModalVisible.value = false;
    items.value[activeItemIndexForAuth.value].diskonPersen = previousDiscount.value.item;
    calculateTotals();
};

const onDpAuthSuccess = async (pin: string) => {
    try {
        await api.post('/auth-pin/validate', { code: challengeCode.value, pin: pin });

        // Simpan pin dan set status menjadi AKTIF
        footer.value.pinTanpaDp = pin;
        header.value.statusSo = 'AKTIF';

        isDpAuthVisible.value = false;
        toast.success('Otorisasi SO tanpa DP berhasil.');
    } catch (error) {
        const axiosError = error as AxiosError<{ message: string }>;

        if (dpAuthModalRef.value) {
            dpAuthModalRef.value.setFailed(
                axiosError.response?.data?.message || 'Otorisasi Gagal.'
            );
        }
    }
};

const onDpAuthCancel = () => {
    isDpAuthVisible.value = false;
};

const openDpInput = () => {
    if (!header.value.customer) {
        return toast.error('Customer harus diisi terlebih dahulu.');
    }
    isDpInputVisible.value = true;
};

const onDpSaved = (newDp: DpItem) => {
    dpItems.value.push(newDp);
    calculateTotals();
};

const removeDpRow = (itemToRemove: DpItem) => {
    dpItems.value = dpItems.value.filter(item => item.nomor !== itemToRemove.nomor);
    calculateTotals(); // Hitung ulang total setelah menghapus DP
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
    router.push('/transaksi/penjualan/surat-pesanan');
};

const onNewCustomerSaved = (newCustomer: Customer) => {
    // Panggil onCustomerSelected untuk menjalankan semua validasi & mengisi form
    onCustomerSelected(newCustomer);
};

const handleBarcodeScan = async () => {
    if (!header.value.customer?.kode) { // Ganti 'header.value.customer?.kode' jika perlu
        toast.error('Pilih customer terlebih dahulu sebelum scan barcode!');
        return; // Hentikan fungsi jika customer belum dipilih
    }
    const barcode = scannedBarcode.value;
    if (!barcode) return;

    // --- LOGIKA 1: Jika barang sudah ada di grid, tambah jumlahnya ---
    const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
    if (existingItem) {
        existingItem.jumlah += 1;
        // Panggil fungsi untuk hitung ulang total jika ada
        // calculateTotals(); 
        toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
        scannedBarcode.value = ''; // Kosongkan input untuk scan berikutnya
        return;
    }

    // --- LOGIKA 2: Jika barang belum ada, cari via API dan tambahkan baris baru ---
    try {
        // Panggil API baru yang kita buat
        const response = await api.get(`/so-form/by-barcode/${barcode}`, {
            params: { gudang: header.value.gudang.kode } // Sesuaikan dengan cara Anda menyimpan kode gudang
        });

        const product = response.data;

        // Cari baris kosong pertama untuk diganti
        const emptyRowIndex = items.value.findIndex(item => !item.kode);

        if (emptyRowIndex !== -1) {
            // Ganti baris kosong dengan data produk baru
            items.value.splice(emptyRowIndex, 1, {
                id: Date.now(),
                kode: product.kode as string,
                nama: product.nama as string,
                ukuran: product.ukuran as string,
                stok: Number(product.stok),
                harga: Number(product.harga),
                jumlah: 1, // Default jumlah 1
                diskonPersen: 0,
                diskonRp: 0,
                total: Number(product.harga),
                barcode: product.barcode as string,
                noSoDtf: '',            // default kosong
                noPengajuanHarga: '',   // default kosong
                pin: ''                 // default kosong
            });
            addNewRow(); // Tambah baris kosong baru di akhir
        } else {
            // Jika tidak ada baris kosong (seharusnya tidak terjadi jika addNewRow dipakai)
            // Anda bisa tambahkan logika push di sini
            toast.error("Tidak ada baris kosong untuk menambahkan item baru.");
        }

        // Panggil fungsi untuk hitung ulang total jika ada
        // calculateTotals();

    } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
            // Error berasal dari Axios
            toast.error(err.response?.data?.message || `Barcode ${barcode} tidak valid.`);
        } else if (err instanceof Error) {
            // Error JS biasa
            toast.error(err.message);
        } else {
            // Error tak dikenal
            toast.error(`Barcode ${barcode} tidak valid.`);
        }
    } finally {
        scannedBarcode.value = '';
    }
};

watch(
    // Daftar semua state yang akan memicu kalkulasi ulang
    [
        items,
        () => header.value.ppnPersen,
        () => footer.value.biayaKirim,
        () => footer.value.diskonPersen1,
        () => footer.value.diskonPersen2,
        () => footer.value.diskonRp,
    ],
    () => {
        calculateTotals();
    },
    { deep: true } // 'deep' diperlukan untuk memantau perubahan di dalam 'items'
);

watch(
    [() => header.value.tanggal, () => header.value.top],
    ([newTanggal, newTop]) => {
        const date = new Date(newTanggal);
        if (isValid(date)) {
            header.value.tempo = format(addDays(date, newTop || 0), 'yyyy-MM-dd');
        }
    },
    { immediate: true } // immediate: true agar langsung dihitung saat form dimuat
);

onMounted(() => {
    // Cek hak akses 'insert' (untuk baru) atau 'edit' (untuk ubah)
    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data ini.`);
        router.back(); // Lempar user kembali ke halaman sebelumnya
        return;
    }

    if (isEditMode.value) {
        loadDataForEdit(route.params.nomor as string);
    } else {
        resetForm();
        isLoading.value = false;
    }
});
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-file-document-edit-outline">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="save" :loading="isSaving"
                :disabled="isSaving || isSavingDisabled">
                Simpan
            </v-btn>
            <v-btn size="small" @click="showConfirmation(resetForm, 'Batalkan perubahan dan kosongkan form?')">
                Batal
            </v-btn>
            <v-btn size="small"
                @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')">
                Tutup
            </v-btn>
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
                                hide-details append-inner-icon="mdi-magnify">
                                <template #prepend-inner>
                                    <v-btn icon="mdi-account-plus" size="x-small" variant="tonal" class="me-2"
                                        @click.stop="isNewCustomerFormVisible = true"
                                        title="Buat Customer Baru"></v-btn>
                                </template>
                            </v-text-field>
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
                            <v-text-field label="Level" v-model="header.levelNama" readonly filled density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Penawaran" v-model="header.penawaran" readonly
                                @click="openPenawaranSearch" variant="outlined" density="compact" hide-details
                                append-inner-icon="mdi-magnify" />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Sales Counter" v-model="header.salesCounter" readonly
                                @click="openSalesCounterSearch" variant="outlined" density="compact" hide-details
                                append-inner-icon="mdi-magnify" />
                        </v-col>
                        <v-col cols="3">
                            <v-text-field label="TOP" v-model.number="header.top" type="number" variant="outlined"
                                density="compact" hide-details class="text-end" />
                        </v-col>
                        <v-col cols="5">
                            <v-text-field label="Tempo/Tgl" v-model="header.tempo" type="date" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field label="PPN %" v-model.number="header.ppnPersen" type="number"
                                variant="outlined" density="compact" hide-details class="text-end" />
                        </v-col>
                        <v-col cols="12"><v-text-field label="Keterangan" v-model="header.keterangan" variant="outlined"
                                density="compact" hide-details /></v-col>
                    </v-row>
                </div>
                <div class="desktop-form-section status-section">
                    <v-alert density="compact" variant="tonal"
                        :color="header.statusSo === 'AKTIF' ? 'success' : 'error'" class="mb-2 d-flex align-center">
                        Status SO: <strong>{{ header.statusSo }}</strong>
                        <v-spacer />
                        <div class="text-caption text-center">{{ minimalDpText }}</div>
                        <v-tooltip location="bottom">
                            <template #activator="{ props }">
                                <v-icon v-bind="props"
                                    :color="(footer.totalDp >= footer.minimalDp) || footer.pinTanpaDp ? 'success' : 'warning'">
                                    {{ (footer.totalDp >= footer.minimalDp) || footer.pinTanpaDp ? 'mdi-check-circle' :
                                        'mdi-alert-circle' }}
                                </v-icon>
                            </template>
                            <span>{{ (footer.totalDp >= footer.minimalDp) || footer.pinTanpaDp ? 'DP Memenuhi Syarat/Ada Otorisasi' : 'DP Belum Cukup' }}</span>
                        </v-tooltip>
                    </v-alert>
                    <v-btn block color="teal" class="mt-4" @click="openDpInput">Input DP (Uang Muka)</v-btn>
                    <v-btn block color="orange" class="mt-2" v-if="header.statusSo === 'PASIF'"
                        @click="openDpAuthorization">
                        Minta Otorisasi
                    </v-btn>
                </div>
            </div>

            <!-- Kolom Kanan -->
            <div class="right-column">
                <div class="scanner-wrapper">
                    <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
                        placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
                        prepend-inner-icon="mdi-barcode-scan" hide-details clearable
                        @keydown.enter.prevent="handleBarcodeScan">
                    </v-text-field>
                </div>
                <div class="desktop-form-section main-grid-section">
                    <v-data-table :headers="mainTableHeaders" :items="items" class="desktop-table" fixed-header>
                        <template #[`item.kode`]="{ item, index }">
                            <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                                placeholder="F1/F2..." @keydown.f1.prevent="openProductSearch(index, false)"
                                @keydown.f2.prevent="openProductSearch(index, true)">
                                <template #append-inner>
                                    <v-icon @click="openProductSearch(index, false)">mdi-magnify</v-icon>
                                </template>
                            </v-text-field>
                        </template>
                        <template #[`item.jumlah`]="{ item }">
                            <v-text-field v-model.number="item.jumlah" type="number" variant="underlined"
                                density="compact" hide-details class="text-end" :disabled="!item.kode" />
                        </template>
                        <template #[`item.diskonPersen`]="{ item, index }">
                            <v-text-field v-model.number="item.diskonPersen" type="number" variant="underlined"
                                density="compact" hide-details class="text-end"
                                @blur="handleItemDiscountChange(index)" />
                        </template>
                        <template #[`item.noSoDtf`]="{ item, index }">
                            <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details
                                placeholder="F1..." @keydown.f1.prevent="openSoDtfSearch(index)" readonly>
                                <template #append-inner>
                                    <v-icon @click="openSoDtfSearch(index)" size="small">mdi-magnify</v-icon>
                                </template>
                            </v-text-field>
                        </template>
                        <template #[`item.noPengajuanHarga`]="{ item, index }">
                            <v-text-field v-model="item.noPengajuanHarga" variant="underlined" density="compact"
                                hide-details placeholder="F1..." @keydown.f1.prevent="openPriceProposalSearch(index)"
                                readonly>
                                <template #append-inner>
                                    <v-icon @click="openPriceProposalSearch(index)" size="small">mdi-magnify</v-icon>
                                </template>
                            </v-text-field>
                        </template>
                        <template #[`item.actions`]="{ item }">
                            <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                                @click="removeRow(item.id)" title="Hapus baris" />
                        </template>
                    </v-data-table>
                </div>
                <div class="desktop-form-section footer-grid-section">
                    <div class="footer-left">
                        <v-data-table :headers="dpTableHeaders" :items="dpItems" class="desktop-table dp-table"
                            :items-per-page="-1" fixed-header>
                            <template #[`item.nomor`]="{ item }">
                                <v-text-field v-model="item.nomor" variant="underlined" density="compact" hide-details
                                    placeholder="F1..." />
                            </template>
                            <template #[`item.jenis`]="{ item }">
                                <v-text-field v-model="item.jenis" variant="underlined" density="compact" hide-details
                                    readonly filled />
                            </template>
                            <template #[`item.nominal`]="{ item }">
                                <v-text-field v-model.number="item.nominal" type="number" variant="underlined"
                                    density="compact" hide-details class="text-end" />
                            </template>
                            <template #[`item.actions`]="{ item }">
                                <v-btn icon="mdi-delete" size="x-small" variant="text" color="error"
                                    @click="removeDpRow(item)" title="Hapus DP" />
                            </template>
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
                                <v-text-field label="Diskon Rp"
                                    :model-value="new Intl.NumberFormat('id-ID').format(footer.diskonRp)" readonly
                                    filled density="compact" hide-details class="text-end" />
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
                            <v-col cols="6">
                                <v-text-field label="PPN"
                                    :model-value="new Intl.NumberFormat('id-ID').format(footer.ppnRp)" readonly filled
                                    density="compact" hide-details class="text-end" />
                            </v-col>
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
        <ProductSearchModal v-if="isProductSearchVisible" :category="'Kaosan'" :source="'surat-pesanan'"
            :gudang="header.gudang.kode" :multi="isMultiSelectProduct" @close="isProductSearchVisible = false"
            @products-selected="onProductsSelected" />
        <AuthorizationModal ref="authModalRef" v-if="isAuthModalVisible" title="Otorisasi Diskon Faktur"
            :challenge-code="challengeCode" @close="onAuthCancel" @success="onAuthSuccess" />
        <AuthorizationModal ref="auth2ModalRef" v-if="isAuth2ModalVisible" title="Otorisasi Diskon Faktur 2"
            :challenge-code="challengeCode" @close="onAuth2Cancel" @success="onAuth2Success" />
        <AuthorizationModal ref="ItemAuthModalRef" v-if="isItemAuthModalVisible" title="Otorisasi Diskon per Item"
            :challenge-code="challengeCode" @close="onItemAuthCancel" @success="onItemAuthSuccess" />
        <AuthorizationModal ref="dpAuthModalRef" v-if="isDpAuthVisible" title="Otorisasi SO Tanpa DP"
            :challenge-code="challengeCode" @close="onDpAuthCancel" @success="onDpAuthSuccess" />
        <SoDtfSearchModal v-if="isSoDtfSearchVisible" :cabang="header.gudang.kode" :customerKode="header.customer?.kode"
            @close="isSoDtfSearchVisible = false" @selected="onSoDtfSelected" />
        <PriceProposalSearchModal v-if="isPriceProposalSearchVisible" :cabang="header.gudang.kode"
            :customerKode="header.customer?.kode" @close="isPriceProposalSearchVisible = false"
            @selected="onPriceProposalSelected" />
        <DpInputModal v-if="isDpInputVisible" :customerKode="header.customer?.kode" :minimal-dp="footer.minimalDp"
            :existing-dp="footer.totalDp" @close="isDpInputVisible = false" @dp-saved="onDpSaved" />
        <CustomerForm v-if="isNewCustomerFormVisible" @close="isNewCustomerFormVisible = false"
            @customer-saved="onNewCustomerSaved" />

        <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">Konfirmasi</v-card-title>
                <v-card-text>{{ confirmText }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal" @click="executePendingAction">Ya, Lanjutkan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
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
    display: flex;
}

.main-grid-section .v-data-table {
    flex-grow: 1;
}

.footer-grid-section {
    flex-shrink: 0;
    display: flex;
    gap: 12px;
}

.footer-left {
    width: 70%;
    /* Beri ruang lebih untuk tabel DP */
}

.footer-right {
    width: 30%;
    /* Kecilkan kolom total */
}

.dp-table {
    max-height: 150px;
}

.field-disabled {
    background-color: #f0f0f0;
    pointer-events: none;
}

.scanner-wrapper {
    font-size: 11px;
    max-width: 400px;
    /* <-- ATUR LEBAR MAKSIMUM DI SINI */
    flex: none;
    /* Mencegah flexbox meregangkan wrapper ini */
    margin-bottom: 16px;
}
</style>

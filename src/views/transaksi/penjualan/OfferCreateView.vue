<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive, nextTick } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
// import GudangSearchModal from '@/components/GudangSearchModal.vue';
import ProductSearchModal from '@/components/lookup/ProductSearchModal.vue';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
// import SoDtfSearchModal from '@/components/lookup/SoDtfSearchModal.vue';
import PriceProposalSearchModal from '@/components/lookup/PriceProposalSearchModal.vue';
import DpInputModal from "@/components/modal/DpInputModal.vue";
import DpListModal from "@/components/modal/DpListModal.vue";
import DiscountCostModal from "@/components/modal/DiscountCostModal.vue";
import JenisOrderModal from "@/components/modal/JenisOrderModal.vue";
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { useRouter, useRoute } from 'vue-router';
import { format, addDays, isValid } from 'date-fns';
import axios, { AxiosError } from 'axios';
import { formatRupiah } from "@/utils/formatRupiah";

const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
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
  isHargaReadonly: boolean;
  diskonPersen: number;
  diskonRp: number;
  total: number;
  barcode: string;
  // noSoDtf: string;
  noPengajuanHarga: string;
  pin: string;
  isCustomOrder?: boolean;
  sod_custom?: string; // 'Y' atau 'N'
  sod_custom_nama?: string;
  sod_custom_data?: string; // String JSON untuk rincian teknis
}

interface OfferHeader {
  nomor: string;
  tanggal: string;
  gudang: Gudang;
  customer: Customer | null;
  customerKode: string;
  top: number;
  tempo: string;
  ppnPersen: number;
  keterangan: string;

  // === TAMBAHKAN INI ===
  jenisOrderKode?: string;
  jenisOrderNama?: string;
  namaDtf?: string;
  nomorPromo?: string;
}

interface ApiOfferItem {
  kode: string | null;
  nama: string | null;
  ukuran: string | null;
  stok: number | null;
  jumlah: number | null;
  harga: number | null;
  diskonPersen: number | null;
  diskonRp: number | null;
  total: number | null;
  barcode: string | null;
  noPengajuanHarga: string | null;
  pin: string | null;

  // field custom dari backend
  pend_custom?: string | null;
  pend_custom_nama?: string | null;
  pend_custom_data?: string | null;
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

interface Product {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  harga: number;
  barcode: string;
}

interface TableHeader {
  title: string;
  key: string;
  width?: string;
  sortable?: boolean;
  align?: 'start' | 'end' | 'center'; // Opsional (tanda tanya)
}

interface AuthDialogState {
  show: boolean;
  title: string;
  jenis: string;
  nominal: number;
  transaksi?: string;
  barcode?: string;
  keterangan?: string;
  onSuccess: (data: { authNomor: string; approver: string }) => void;
  onCancel: () => void;
}

interface DpItem {
  nomor: string;
  jenis: string;
  nominal: number;
  posting: string; // Tambahkan ini
  fsk: string;     // Tambahkan ini
}

interface JenisOrderSaved {
  namaOrder: string;
  jenisOrder: string;
  namaBarang: string;
  kodeBarang: string;
  totalJumlah: number;
  totalHarga: number;

  // Gunakan penamaan generik untuk data teknis
  customData: {
    ukuranKaos: { ukuran: string; jumlah: number; harga: number }[];
    titikCetak: { keterangan: string; sizeCetak: string; panjang: number; lebar: number }[];
    hargaPerCm: number;
  };
}

interface DiscountCostUpdateData {
  diskonPersen1: number;
  diskonPersen2: number;
  diskonRp: number;
  biayaKirim: number;
  pinDiskon1?: string;
  pinDiskon2?: string;
}

interface ActivePromo {
  pro_nomor: string;
  pro_judul: string;
  pro_totalrp: number;
  pro_disrp: number;
  pro_diskon: number;
  pro_lipat: 'Y' | 'N';
}

// --- State ---
const header = ref<OfferHeader>({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  gudang: { kode: authStore.user?.cabang || '', nama: 'Gudang Utama' } as Gudang,
  customer: null as Customer | null,
  customerKode: '', // Tambahan: untuk menyimpan kode customer sementara
  top: 0,
  tempo: format(new Date(), 'yyyy-MM-dd'),
  ppnPersen: 0,
  keterangan: '',

  jenisOrderKode: '',
  jenisOrderNama: '',
  namaDtf: '',
  nomorPromo: '',
});

const items = ref<OfferItem[]>([]);
const footer = ref({
  total: 0,
  diskonRp: 0,
  diskonRpInput: 0,
  diskonPersen1: 0,
  diskonPersen2: 0,
  biayaKirim: 0,
  ppnRp: 0,
  netto: 0,
  grandTotal: 0,
  pinDiskon1: '',
  pinDiskon2: '',
  totalDp: 0,
  belumDibayar: 0,
  subtotalKaos: 0,
});

const authDialog = reactive<AuthDialogState>({
  show: false,
  title: '',
  jenis: '',
  nominal: 0,
  transaksi: '',
  barcode: '',
  keterangan: '',
  onSuccess: () => { },
  onCancel: () => { },
});

const dialogs = reactive({
  jenisOrder: false,
  // ... state lainnya
});

const isCustomerSearchVisible = ref(false);
// const isGudangSearchVisible = ref(false);
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
// const isSoDtfSearchVisible = ref(false);
const isPriceProposalSearchVisible = ref(false);
const activeRowIndex = ref(0);
const isSaving = ref(false);
const isConfirmDialogVisible = ref(false);
const focusedRowId = ref<number | string>(-1);
const isFooterDiskonRpFocused = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);
const isPrintConfirmVisible = ref(false);
const printConfirmNomor = ref('');
const scannedBarcode = ref('');
const isAuthPending = ref(false); // [BARU] Penanda sedang menunggu auth
const previousDiskonRp = ref(0);  // [BARU] Untuk menyimpan nilai sebelum edit
const dpItems = ref<DpItem[]>([]);
const isDpInputVisible = ref(false);
const isDpListModalVisible = ref(false);
const isDiscountCostModalVisible = ref(false);
const isInitialLoad = ref(false);
// --- State Promo [BARU] ---
const activePromosList = ref<ActivePromo[]>([]);
const promoNotification = ref("");
const potentialPromoDiscount = ref(0);
const lastSuggestedPromo = ref("");
const isGrandOpeningPromo = ref(false); // Digunakan untuk binding class di template

const isPromoConfirmVisible = ref(false);
const pendingPromoData = reactive({
  nomor: "",
  nama: "",
  diskon: 0
});

footer.value.diskonRpInput = footer.value.diskonRp;

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah Penawaran: ${header.value.nomor}` : 'Buat Penawaran Baru');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const totalQty = computed(() =>
  items.value.reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0)
);

const penawaranDetails = computed(() => {
  const detailMap = new Map<string, { kodeBarang: string; namaBarang: string; ukuran?: string }>();
  items.value.forEach((it) => {
    if (it.kode && it.nama) {
      const key = `${it.kode}|${it.ukuran || ""}`;
      if (!detailMap.has(key)) {
        detailMap.set(key, { kodeBarang: it.kode, namaBarang: it.nama, ukuran: it.ukuran || "" });
      }
    }
  });
  return Array.from(detailMap.values());
});

const penawaranBarangList = computed(() => {
  const map = new Map<string, string>();
  items.value.forEach((it) => {
    if (it.kode && it.nama && !map.has(it.kode)) { map.set(it.kode, it.nama); }
  });
  return Array.from(map.entries()).map(([kodeBarang, namaBarang]) => ({ kodeBarang, namaBarang }));
});

const tableHeaders: TableHeader[] = [
  { title: 'Kode', key: 'kode', width: '300px' },
  { title: 'Barcode', key: 'barcode', sortable: false },
  { title: 'Nama Barang', key: 'nama', width: '900px' },
  { title: 'Ukuran', key: 'ukuran', width: '30px' },
  { title: 'Stok', key: 'stok', width: '30px', align: 'end' },
  { title: 'Jml', key: 'jumlah', width: '30px', align: 'end' },
  { title: 'Harga', key: 'harga', width: '90px', align: 'end' },
  { title: 'Diskon %', key: 'diskonPersen', width: '30px', align: 'end' },
  { title: 'Diskon Rp', key: 'diskonRp', width: '50px', align: 'end' },
  { title: 'Total', key: 'total', align: 'end', width: '90px' },
  { title: 'No. Pengajuan', key: 'noPengajuanHarga', width: '90px' },
  // Perhatian: Ada key 'barcode' ganda di snippet Anda.
  // Jika ini kolom berbeda, sebaiknya key-nya dibedakan, misal 'barcode2'.
  { title: 'Barcode', key: 'barcode_scan', width: '70px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '40px' },
];

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
      level: response.data.xlevel || '',
      discountRule: {
        diskon1: response.data.diskon1 || 0,
        diskon2: response.data.diskon2 || 0,
        nominal: response.data.nominal || 0,
      }
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
    const { headerData, itemsData, dpItemsData, footerData } = response.data;

    // Isi semua state dengan data yang diterima dari server
    header.value = {
      ...header.value,
      ...headerData
    };
    items.value = itemsData.map((item: ApiOfferItem): OfferItem => {
      const isCustom = item.pend_custom === 'Y' || item.kode === 'CUSTOM';
      return {
        id: Date.now() + Math.random(),
        kode: item.kode || '',
        nama: item.nama || '',
        ukuran: item.ukuran || '',
        stok: item.stok || 0,
        jumlah: item.jumlah || 0,
        harga: item.harga || 0,
        isHargaReadonly: (item.harga || 0) > 0,
        diskonPersen: item.diskonPersen || 0,
        diskonRp: item.diskonRp || 0,
        total: item.total || 0,
        barcode: item.barcode || '',
        noPengajuanHarga: item.noPengajuanHarga || '',
        pin: item.pin || '',
        // Properti tambahan untuk custom
        isCustomOrder: isCustom,
        sod_custom: item.pend_custom,
        sod_custom_nama: item.pend_custom_nama,
        sod_custom_data: item.pend_custom_data // Ini berisi rincian teknis JSON
      };
    });

    // 3. Map DP Items
    dpItems.value = dpItemsData || [];

    // 4. Map Footer
    footer.value = {
      ...footer.value,
      ...footerData,
      diskonRpInput: footerData.diskonRp
    };

    toast.success(`Data penawaran ${nomor} berhasil dimuat.`);

    await nextTick();
    calculateTotals(); // Hitung ulang untuk memastikan sisa bayar sinkron
    setTimeout(() => {
      isInitialLoad.value = false;
    }, 1000);
    markAsSaved()
  } catch (error) {
    toast.error('Gagal memuat data penawaran.', error);
    router.push('/transaksi/penjualan/penawaran');
  }
};

const openCustomerSearch = () => { isCustomerSearchVisible.value = true; };
// const openGudangSearch = () => { isGudangSearchVisible.value = true; };

// Perbaikan: Hanya menerima kode customer dari modal
const onCustomerSelected = async (customer: { kode: string }) => {
  isCustomerSearchVisible.value = false;
  if (!customer || !customer.kode) return;

  try {
    const response = await api.get(`/offer-form/customer-details/${customer.kode}`, {
      params: { gudang: header.value.gudang.kode }
    });

    header.value.customer = response.data;
    header.value.top = response.data.top;

    // [UPDATE] Panggil API Diskon
    await applyDefaultDiscount();

    // calculateTotals() sebenarnya sudah dipanggil di dalam applyDefaultDiscount,
    // tapi dipanggil lagi di sini juga aman.
    calculateTotals();

    toast.success(`Customer ${response.data.nama} berhasil dipilih.`);

  } catch (error: unknown) {
    // Cek dulu apakah error adalah AxiosError
    if (axios.isAxiosError(error) && error.response) {
      toast.error(error.response.data?.message || 'Gagal memuat detail customer.');
    } else {
      toast.error('Gagal memuat detail customer.');
    }
    header.value.customer = null;
  }
};

// const onGudangSelected = async (gudang: Gudang) => {
//     // console.log('Gudang received:', gudang); // Debug log

//     // Pastikan data gudang valid
//     if (!gudang || !gudang.kode) {
//         toast.error('Data gudang tidak valid.');
//         return;
//     }

//     header.value.gudang = gudang;
//     isGudangSearchVisible.value = false;

//     if (!isEditMode.value) {
//     }

//     // Debug: Cek apakah ada customerKode
//     // console.log('Customer kode saat ini:', header.value.customerKode);

//     // Setelah gudang dipilih, load detail customer jika sudah ada kode customer
//     if (header.value.customerKode) {
//         // console.log('Memulai load customer details untuk kode:', header.value.customerKode);
//         toast.info('Memuat detail customer...');
//         await loadCustomerDetails();
//     } else {
//         // console.log('Tidak ada customer kode, skip load customer details');
//     }
// };

const openProductSearch = (index: number, isMulti: boolean) => {
  if (!header.value.customer) {
    toast.error('Pilih Customer terlebih dahulu.');
    return;
  }
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  isProductSearchVisible.value = true;
};

const onProductsSelected = (selectedProducts: Product[]) => {
  isProductSearchVisible.value = false;
  if (!selectedProducts || selectedProducts.length === 0) return;

  // 1. Perbaikan Filter Duplikasi
  // Jangan hanya cek barcode, cek kombinasi Kode + Ukuran karena Jasa barcodenya kosong
  const newProducts = selectedProducts
    .filter(product => {
      return !items.value.some(item =>
        (item.barcode && product.barcode && item.barcode === product.barcode) ||
        (item.kode === product.kode && item.ukuran === product.ukuran)
      );
    })
    .map(product => ({
      id: Date.now() + Math.random(),
      kode: product.kode,
      nama: product.nama,
      ukuran: product.ukuran || '-', // [FIX] Fallback '-' jika jasa tidak punya ukuran
      stok: product.stok || 0,
      harga: product.harga || 0,
      isHargaReadonly: (product.harga || 0) > 0,
      jumlah: 1,
      diskonPersen: 0,
      diskonRp: 0,
      total: product.harga || 0,
      // [FIX] Gunakan kode sebagai fallback jika barcode kosong agar identitas unik
      barcode: product.barcode || product.kode,
      noPengajuanHarga: '',
      pin: ''
    }));

  if (newProducts.length === 0) {
    toast.info("Barang sudah ada di dalam daftar.");
    return;
  }

  // 2. Timpa baris kosong yang sedang aktif (tempat user tekan F1/F2)
  items.value.splice(activeRowIndex.value, 1, ...newProducts);

  // 3. Pastikan ada baris kosong baru dan hitung ulang total
  addNewRow();
  calculateTotals();
};

const isDiscountableItem = (item: OfferItem) => {
  // Hanya kecualikan JASA murni (Ongkir, File, Desain).
  // Custom/DTF HARUS masuk agar bisa dihitung dalam basis diskon faktur.
  const isJasaMurni =
    item.kode?.toUpperCase().startsWith("JASA") ||
    item.kode?.toUpperCase().startsWith("JS") ||
    item.nama?.toLowerCase().includes("jasa") ||
    item.nama?.toLowerCase().includes("ongkir");

  return !isJasaMurni;
};

const isItemPromoEligible = (item: OfferItem) => {
  const nameUp = item.nama?.toUpperCase() || "";
  const kodeUp = item.kode?.toUpperCase() || "";

  // Barang Custom (DTF/Sablon) dan barang reguler (Jersey/Kaos)
  const isCustomOrDtf = item.isCustomOrder || item.kode === 'CUSTOM' || nameUp.includes("DTF") || nameUp.includes("SABLON");
  const isReguler = !kodeUp.startsWith("JASA") && !kodeUp.startsWith("JS");

  return isCustomOrDtf || isReguler;
};

const checkRealtimePromoEligibility = () => {
  if (authStore.user?.cabang === "KDC" || footer.value.pinDiskon1) return;

  promoNotification.value = "";
  potentialPromoDiscount.value = 0;
  isGrandOpeningPromo.value = false; // Menggunakan variabel yang dideklarasikan

  const validItems = items.value.filter((i) => i.kode);
  if (validItems.length === 0) {
    lastSuggestedPromo.value = ""; // Reset penjaga jika keranjang kosong
    return;
  }

  // 1. Hitung total belanja barang eligible (Reguler, Jersey, DTF)
  const totalEligible = validItems.reduce((sum, item) => {
    return isItemPromoEligible(item) ? sum + (item.total || 0) : sum;
  }, 0);

  const promoFeb = activePromosList.value.find((p) => p.pro_nomor === "PRO-2026-001");

  if (promoFeb) {
    let disc = 0;
    let msg = "";

    // 2. Logika Hitung Tiering (Kelipatan 200rb didahulukan)
    if (totalEligible >= 200000) {
      disc = Math.floor(totalEligible / 200000) * 20000;
      msg = `🎉 PROMO FEBRUARI! Anda berhak Potongan Kelipatan Rp ${formatRupiah(disc)}!`;
    }
    else if (totalEligible >= 150000) {
      disc = 15000;
      const toNext = 200000 - totalEligible;
      msg = `✨ PROMO FEBRUARI: Dapat potongan Rp 15.000! (Kurang Rp ${formatRupiah(toNext)} lagi untuk kelipatan)`;
    }
    else if (totalEligible >= 100000) {
      const shortage = 150000 - totalEligible;
      msg = `💡 Tambah belanja Rp ${formatRupiah(shortage)} lagi untuk dapat DISKON Rp 15.000!`;
    }

    if (msg) {
      promoNotification.value = msg;
      potentialPromoDiscount.value = disc;

      // === [PENTING] PERBARUI DATA PENAMPUNG SETIAP ADA PERUBAHAN ===
      pendingPromoData.nomor = promoFeb.pro_nomor;
      pendingPromoData.nama = promoFeb.pro_judul;
      pendingPromoData.diskon = disc;

      // === [PERBAIKAN] LOGIKA AUTO-UPDATE (SINKRON DENGAN SO) ===
      // Hanya timpa diskonRp secara otomatis JIKA user sudah setuju pakai promo ini
      if (header.value.nomorPromo === promoFeb.pro_nomor && !isFooterDiskonRpFocused.value) {
        footer.value.diskonRp = disc;
        footer.value.diskonRpInput = disc;
        footer.value.diskonPersen1 = 0;
      }
      // Jika belum terpilih (header.nomorPromo kosong) dan belum pernah disugestikan
      else if (disc > 0 && !header.value.nomorPromo && lastSuggestedPromo.value !== promoFeb.pro_nomor) {
        isPromoConfirmVisible.value = true;
        lastSuggestedPromo.value = promoFeb.pro_nomor;
      }
    }
  }
};

const useMemberDiscount = () => {
  header.value.nomorPromo = ""; // [PENTING] Kosongkan agar auto-update berhenti
  footer.value.diskonRp = 0;
  footer.value.diskonRpInput = 0;

  isPromoConfirmVisible.value = false;

  // Panggil hitung diskon member standar
  applyDefaultDiscount();
  toast.info("Menggunakan diskon member standar.");
};

const applyPromoDiscount = () => {
  // Ambil nominal terbaru dari hitungan terakhir
  footer.value.diskonRp = pendingPromoData.diskon;
  footer.value.diskonRpInput = pendingPromoData.diskon;

  // Matikan diskon persen member agar nominal promo yang menang
  footer.value.diskonPersen1 = 0;
  footer.value.diskonPersen2 = 0;

  isPromoConfirmVisible.value = false;

  // Hitung ulang keseluruhan total
  calculateTotals();
  toast.success(`Promo ${pendingPromoData.nama} berhasil diterapkan.`);
};

const calculateTotals = () => {
  let subtotal = 0;
  let subtotalDiscountable = 0;

  items.value.forEach(item => {
    const price = Number(item.harga) || 0;
    const qty = Number(item.jumlah) || 0;
    let discountRp = Number(item.diskonRp) || 0;
    const discountPersen = Number(item.diskonPersen) || 0;

    if (discountPersen > 0) {
      discountRp = (discountPersen / 100) * price;
      item.diskonRp = discountRp;
    }

    item.total = qty * (price - discountRp);
    subtotal += item.total;

    // Filter: Jenis Order (CUSTOM) tidak masuk basis diskon
    if (isDiscountableItem(item)) {
      subtotalDiscountable += item.total;
    }
  });

  footer.value.subtotalKaos = subtotalDiscountable;
  footer.value.total = subtotal;

  checkRealtimePromoEligibility();

  // --- PERBAIKAN LOGIKA DISKON FAKTUR ---
  const isManualOverride = isFooterDiskonRpFocused.value || isAuthPending.value;

  // KUNCI: Jangan hitung ulang dari persen jika:
  // 1. Sedang Initial Load (ambil murni dari DB pen_disc)
  // 2. Sedang Manual Override (sedang diedit user)
  if (isInitialLoad.value || isManualOverride) {
    footer.value.diskonRp = Number(footer.value.diskonRpInput) || 0;
  }
  else if (footer.value.diskonPersen1 > 0 || footer.value.diskonPersen2 > 0) {
    // Hanya hitung otomatis jika memang tidak ada nominal manual yang terkunci
    const discount1 = (footer.value.diskonPersen1 / 100) * subtotalDiscountable;
    const afterDiscount1 = subtotalDiscountable - discount1;
    const discount2 = (footer.value.diskonPersen2 / 100) * afterDiscount1;

    footer.value.diskonRp = discount1 + discount2;
    footer.value.diskonRpInput = footer.value.diskonRp;
  } else {
    footer.value.diskonRp = Number(footer.value.diskonRpInput) || 0;
  }
  // ------------------------------------------------

  const netto = subtotal - footer.value.diskonRp;
  footer.value.netto = netto;
  footer.value.ppnRp = (header.value.ppnPersen / 100) * netto;
  footer.value.grandTotal = netto + footer.value.ppnRp + (Number(footer.value.biayaKirim) || 0);
  footer.value.totalDp = dpItems.value.reduce((sum, dp) => sum + (Number(dp.nominal) || 0), 0);
  footer.value.belumDibayar = footer.value.grandTotal - footer.value.totalDp;
};

const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(),
      kode: '',
      nama: '',
      ukuran: '',
      stok: 0,
      jumlah: 0,
      harga: 0,
      isHargaReadonly: false,
      diskonPersen: 0,
      diskonRp: 0,
      total: 0,
      barcode: '',
      // noSoDtf: '',
      noPengajuanHarga: '',
      pin: '' // tambahkan ini
    });
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
      details: items.value
        .filter(item => item.kode)
        .map(item => ({
          ...item,
          sod_custom: item.isCustomOrder ? "Y" : "N",
          // Jika item custom, pastikan sod_custom_data sudah di-stringify
        })),
      dps: dpItems.value,
      user: authStore.user,
      isNew: !isEditMode.value,
    };

    const response = await api.post('/offer-form/save', payload);
    toast.success(response.data.message);

    markAsSaved();

    // --- PERUBAHAN LOGIKA REDIRECT ---

    const nomorPenawaran = response.data.nomor;

    if (nomorPenawaran) {
      // 1. Simpan nomor untuk dialog
      printConfirmNomor.value = nomorPenawaran;
      // 2. Buka dialog konfirmasi cetak
      isPrintConfirmVisible.value = true;

      // (Kita tidak lagi router.push di sini)

    } else {
      // Fallback jika 'nomor' tidak ditemukan di respons
      toast.error('Gagal mendapatkan nomor dokumen untuk dicetak. Mengarahkan ke daftar.');
      router.push('/transaksi/penjualan/penawaran');
    }

    // --- AKHIR PERUBAHAN ---

  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message || 'Gagal menyimpan data penawaran.';
      toast.error(message);
    } else if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error('Gagal menyimpan data penawaran.');
    }
  } finally {
    isSaving.value = false;
  }
};

const handlePrintConfirm = () => {
  if (!printConfirmNomor.value) return;

  try {
    // 1. Resolve URL dari named route 'Cetak Penawaran'
    const routeData = router.resolve({
      name: 'Cetak Penawaran', // Pastikan 'name' ini SAMA PERSIS dengan di router Anda
      params: { nomor: printConfirmNomor.value }
    });

    // 2. Buka URL di tab baru
    window.open(routeData.href, '_blank');

  } catch (error) {
    console.error("Gagal membuka halaman cetak:", error);
    toast.error('Gagal membuka halaman cetak. Pastikan route "Cetak Penawaran" ada.');
  } finally {
    // 3. Tutup dialog dan kembali ke halaman browse
    isPrintConfirmVisible.value = false;
    printConfirmNomor.value = '';
    router.push('/transaksi/penjualan/penawaran');
  }
};

const handlePrintCancel = () => {
  isPrintConfirmVisible.value = false;
  printConfirmNomor.value = '';
  // Langsung kembali ke halaman browse
  router.push('/transaksi/penjualan/penawaran');
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

    jenisOrderKode: '',
    jenisOrderNama: '',
    namaDtf: '',
  };
  items.value = [];
  addNewRow();
  markAsSaved();
  toast.info('Form telah dibersihkan.');
};

const requestAuthorization = (
  title: string,
  jenis: string,
  nominal: number,
  extraData: {
    transaksi?: string,
    barcode?: string,
    keteranganLengkap?: string
  } | null,
  onSuccess: (data: { authNomor: string, approver: string }) => void,
  onCancel: () => void
) => {
  authDialog.title = title;
  authDialog.jenis = jenis;
  authDialog.nominal = nominal;

  if (extraData) {
    authDialog.transaksi = extraData.transaksi || '';
    authDialog.barcode = extraData.barcode || '';
    authDialog.keterangan = extraData.keteranganLengkap || '';
  } else {
    authDialog.transaksi = '';
    authDialog.barcode = '';
    authDialog.keterangan = '';
  }

  authDialog.onSuccess = (data) => {
    authDialog.show = false; // <--- Tutup modal secara paksa di sini
    onSuccess(data);         // Baru jalankan logika simpan diskon/toast
  };
  authDialog.onCancel = onCancel;
  authDialog.show = true;
};

// const handleDiscountChange = async () => {
//   if (!header.value.customer || !header.value.customer.level) {
//     calculateTotals();
//     return;
//   }

//   // Simpan nilai input saat ini untuk jaga-jaga kalau batal
//   const enteredDiscount = footer.value.diskonPersen1;

//   try {
//     // 1. Cek Diskon Standar ke Backend
//     const response = await api.get('/offer-form/get-default-discount', {
//       params: {
//         level: header.value.customer.level,
//         total: footer.value.total,
//         gudang: header.value.gudang.kode,
//       }
//     });
//     const defaultDiscountValue = response.data.discount;

//     // 2. Jika beda dan > 0, minta Otorisasi
//     if (enteredDiscount !== defaultDiscountValue && enteredDiscount > 0) {

//       // Hitung nominal estimasi diskon
//       const estimasiNominal = (footer.value.total * enteredDiscount) / 100;
//       const info = `Cust: ${header.value.customer.nama}\nDiskon Std: ${defaultDiscountValue}%\nPengajuan: ${enteredDiscount}%`;

//       requestAuthorization(
//         'Otorisasi Diskon Faktur (%)',
//         'DISKON_FAKTUR',
//         estimasiNominal,
//         {
//           transaksi: header.value.nomor || 'DRAFT PENAWARAN',
//           keteranganLengkap: info
//         },
//         (authResult) => {
//           // Sukses
//           footer.value.pinDiskon1 = authResult.approver; // Simpan Nama Approver
//           calculateTotals();
//           toast.success('Diskon disetujui.');
//         },
//         () => {
//           // Batal: Kembalikan ke default
//           footer.value.diskonPersen1 = defaultDiscountValue;
//           calculateTotals();
//           toast.info('Perubahan diskon dibatalkan.');
//         }
//       );

//     } else {
//       calculateTotals();
//     }
//   } catch (error) {
//     toast.error('Gagal memvalidasi diskon standar.', error);
//     calculateTotals();
//   }
// };

// const onDiskonRpBlur = () => {
//   const newValue = Number(footer.value.diskonRpInput) || 0;

//   // Cek apakah ada perubahan dari nilai SEBELUM edit
//   if (newValue === previousDiskonRp.value) {
//     return;
//   }

//   // [SET FLAG] Supaya calculateTotals tidak mereset nilai saat modal muncul
//   isAuthPending.value = true;

//   const info = `Cust: ${header.value.customer?.nama || ''}\nDiskon Rupiah: ${formatRupiah(newValue)}`;

//   requestAuthorization(
//     'Otorisasi Diskon Rupiah',
//     'DISKON_FAKTUR',
//     newValue,
//     {
//       transaksi: header.value.nomor || 'DRAFT PENAWARAN',
//       keteranganLengkap: info
//     },
//     (authResult) => {
//       // SUKSES
//       // 1. Nol-kan persen karena sekarang pakai Rupiah
//       footer.value.diskonPersen1 = 0;
//       footer.value.diskonPersen2 = 0;

//       footer.value.pinDiskon1 = authResult.approver;

//       // 2. Matikan flag pending
//       isAuthPending.value = false;

//       calculateTotals();
//       toast.success('Diskon Rp disetujui.');
//     },
//     () => {
//       // BATAL / TOLAK
//       // 1. Kembalikan ke nilai lama
//       footer.value.diskonRp = previousDiskonRp.value;
//       footer.value.diskonRpInput = previousDiskonRp.value;

//       // 2. Matikan flag pending
//       isAuthPending.value = false;

//       calculateTotals();
//       toast.info('Perubahan diskon dibatalkan.');
//     }
//   );
// };

const handleItemDiscountChange = (index: number) => {
  const item = items.value[index];

  // Simpan nilai awal (sebelum diedit user, idealnya punya originalDiskon, tapi di sini kita pakai asumsi reset ke 0 jika batal, atau Anda bisa tambahkan properti 'originalDiskon' di interface Item seperti di Invoice)
  const currentPersen = item.diskonPersen || 0;
  const currentRp = item.diskonRp || 0;

  if (currentPersen > 0 || currentRp > 0) {

    // Hitung nominal diskon item ini
    let nominalAuth = 0;
    if (currentRp > 0) {
      nominalAuth = currentRp * item.jumlah;
    } else {
      nominalAuth = ((item.harga * currentPersen) / 100) * item.jumlah;
    }

    const info = `Cust: ${header.value.customer?.nama || 'Umum'}\nItem: ${item.nama}\nDiskon: ${currentPersen > 0 ? currentPersen + '%' : formatRupiah(currentRp)}`;

    requestAuthorization(
      'Otorisasi Diskon Item',
      'DISKON_ITEM',
      nominalAuth,
      {
        transaksi: header.value.nomor || 'DRAFT PENAWARAN',
        barcode: item.barcode,
        keteranganLengkap: info
      },
      (authResult) => {
        item.pin = authResult.approver; // Simpan Approver di item
        calculateTotals();
        toast.success('Diskon item disetujui.');
      },
      () => {
        // Batal: Reset ke 0
        item.diskonPersen = 0;
        item.diskonRp = 0;
        calculateTotals();
        toast.info('Diskon item dibatalkan.');
      }
    );
  } else {
    calculateTotals();
  }
};

// const handleDiscount2Change = () => {
//   const disc2 = footer.value.diskonPersen2;

//   // Jika Diskon 1 ada isinya, dan user mengisi Diskon 2 > 0
//   if (footer.value.diskonPersen1 > 0 && disc2 > 0) {

//     // Estimasi nominal (dari sisa setelah disc 1)
//     const afterDisc1 = footer.value.total - ((footer.value.total * footer.value.diskonPersen1) / 100);
//     const estimasiNominal = (afterDisc1 * disc2) / 100;

//     const info = `Cust: ${header.value.customer?.nama || ''}\nPenambahan Diskon ke-2: ${disc2}%`;

//     requestAuthorization(
//       'Otorisasi Diskon Bertingkat',
//       'DISKON_FAKTUR',
//       estimasiNominal,
//       {
//         transaksi: header.value.nomor || 'DRAFT PENAWARAN',
//         keteranganLengkap: info
//       },
//       (authResult) => {
//         footer.value.pinDiskon2 = authResult.approver;
//         calculateTotals();
//         toast.success('Diskon ke-2 disetujui.');
//       },
//       () => {
//         footer.value.diskonPersen2 = 0; // Reset ke 0 jika batal
//         calculateTotals();
//         toast.info('Diskon ke-2 dibatalkan.');
//       }
//     );
//   } else {
//     calculateTotals();
//   }
// };
// const openSoDtfSearch = (index: number) => {
//   if (!header.value.customer) {
//     toast.error('Pilih Customer terlebih dahulu.');
//     return;
//   }
//   activeRowIndex.value = index;
//   isSoDtfSearchVisible.value = true;
// };

const openPriceProposalSearch = (index: number) => {
  if (!header.value.customer) {
    toast.error('Pilih Customer terlebih dahulu.');
    return;
  }
  activeRowIndex.value = index;
  isPriceProposalSearchVisible.value = true;
};

// // Method untuk menangani hasil pilihan dari modal SO DTF
// const onSoDtfSelected = async (so: { nomor: string }) => {
//   isSoDtfSearchVisible.value = false;
//   items.value.splice(activeRowIndex.value, 1);

//   try {
//     const response = await api.get(`/so-dtf-form/${so.nomor}`);
//     const { header, detailsUkuran } = response.data;

//     detailsUkuran.forEach((detail: { ukuran: string; jumlah: number; harga: number }) => {
//       items.value.push({
//         id: Date.now() + Math.random(),
//         kode: header.sd_nomor,
//         nama: header.sd_nama,
//         ukuran: detail.ukuran,
//         jumlah: detail.jumlah,
//         harga: detail.harga,
//         total: detail.jumlah * detail.harga,
//         noSoDtf: header.sd_nomor,
//         stok: 0,
//         diskonPersen: 0,
//         diskonRp: 0,
//         barcode: '',
//         noPengajuanHarga: '',
//         pin: ''
//       });
//     });

//     addNewRow();
//   } catch (error: unknown) {
//     if (axios.isAxiosError(error)) {
//       toast.error(error.response?.data?.message || `Gagal memuat detail SO DTF ${so.nomor}`);
//     } else if (error instanceof Error) {
//       toast.error(error.message);
//     } else {
//       toast.error(`Gagal memuat detail SO DTF ${so.nomor}`);
//     }
//   }
// };

// Method untuk menangani hasil pilihan dari modal Pengajuan Harga
const onPriceProposalSelected = async (proposal: { nomor: string }) => {
  isPriceProposalSearchVisible.value = false;
  items.value.splice(activeRowIndex.value, 1);

  try {
    const response = await api.get(`/offer-form/search/price-proposal-details/${proposal.nomor}`);
    const { headerData, itemsData } = response.data;

    itemsData.forEach((detail: { kode: string; nama: string; ukuran: string; jumlah: number; harga: number; total: number }) => {
      items.value.push({
        id: Date.now() + Math.random(),
        kode: detail.kode,
        nama: detail.nama,
        ukuran: detail.ukuran,
        jumlah: detail.jumlah,
        harga: detail.harga,
        isHargaReadonly: detail.harga > 0,
        total: detail.total,
        stok: 0,
        diskonPersen: 0,
        diskonRp: 0,
        barcode: '',
        // noSoDtf: '', // tambahkan properti ini supaya sesuai tipe
        noPengajuanHarga: headerData.nomor, // pastikan ini string
        pin: ''
      });
    });

    addNewRow();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || `Gagal memuat detail Pengajuan ${proposal.nomor}`);
    } else if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error(`Gagal memuat detail Pengajuan ${proposal.nomor}`);
    }
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
  router.push('/transaksi/penjualan/penawaran');
};

const applyDefaultDiscount = async () => {
  // --- PERBAIKAN: PROTEKSI DISKON MANUAL/DATABASE ---
  if (isInitialLoad.value) return;

  // Jika diskon nominal sudah ada (> 0) dan diskon persen kosong,
  // artinya ini hasil otorisasi/input manual. Jangan ditimpa.
  if ((footer.value.diskonRp > 0 && footer.value.diskonPersen1 === 0) || footer.value.pinDiskon1) {
    // console.log("Sistem mendeteksi diskon manual, membatalkan auto-discount level.");
    return;
  }
  // -----------------------------------------------------------
  // Validasi: Pastikan data pendukung ada
  if (!header.value.customer || !header.value.customer.level) {
    footer.value.diskonPersen1 = 0;
    return;
  }

  try {
    const levelParam = header.value.customer.level;
    // Jika format level di frontend "4 - Retailer", ambil "4" nya saja biar bersih
    const cleanLevel = levelParam.includes(' - ') ? levelParam.split(' - ')[0] : levelParam;
    const response = await api.get('/offer-form/get-default-discount', {
      params: {
        level: cleanLevel, // Kirim "4"
        total: footer.value.total || 0,
        gudang: header.value.gudang.kode,
      }
    });

    // Update diskon sesuai balikan dari backend
    // Backend mengembalikan { discount: ... }
    const serverDiscount = response.data.discount;

    // Hanya update jika nilai berbeda (untuk mencegah loop render berlebih)
    if (footer.value.diskonPersen1 !== serverDiscount) {
      footer.value.diskonPersen1 = serverDiscount;
      // Hitung ulang total setelah diskon berubah
      calculateTotals();
    }

  } catch (error) {
    console.error('Gagal mengambil diskon default:', error);
    // Opsional: fallback ke 0 atau pertahankan nilai lama jika error
  }
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
    const response = await api.get(`/offer-form/by-barcode/${barcode}`, {
      params: { gudang: header.value.gudang.kode } // Sesuaikan dengan cara Anda menyimpan kode gudang
    });

    const product = response.data;

    // Cari baris kosong pertama untuk diganti
    const emptyRowIndex = items.value.findIndex(item => !item.kode);

    if (emptyRowIndex !== -1) {
      // Ganti baris kosong dengan data produk baru
      items.value.splice(emptyRowIndex, 1, {
        id: Date.now(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        harga: product.harga,
        isHargaReadonly: product.harga > 0,
        jumlah: 1, // Default jumlah 1
        diskonPersen: 0,
        diskonRp: 0,
        total: product.harga,
        barcode: product.barcode,
        // noSoDtf: '',          // tambahkan properti default
        noPengajuanHarga: '', // tambahkan properti default
        pin: ''               // tambahkan properti default
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
    let message = `Barcode ${barcode} tidak valid.`;

    if (err instanceof AxiosError) {
      message = err.response?.data?.message || message;
    }

    toast.error(message);
  } finally {
    scannedBarcode.value = ''; // selalu kosongkan input
  }
};

const openJenisOrderModal = () => {
  if (!header.value.customer) return toast.error("Pilih customer terlebih dahulu.");
  const hasItems = items.value.some((it) => it.kode && it.nama);
  if (!hasItems) return toast.error("Isi detail barang terlebih dahulu.");
  dialogs.jenisOrder = true;
};

const handleJenisOrderSaved = (data: JenisOrderSaved) => {
  // 1. Simpan info kategori ke Header agar masuk ke pen_jenis_order_kode dkk
  header.value.jenisOrderKode = data.jenisOrder;
  header.value.jenisOrderNama = data.jenisOrder; // Sesuaikan jika ada nama khusus
  header.value.namaDtf = data.namaOrder;

  // 2. Masukkan ke items seperti biasa
  const qty = data.totalJumlah || 0;
  const totalHarga = data.totalHarga || 0;
  const hargaPerPcs = qty > 0 ? Math.round(totalHarga / qty) : 0;

  items.value.push({
    id: Date.now() + Math.random(),
    kode: "CUSTOM",
    nama: data.namaOrder, // Ini akan masuk ke pend_custom_nama
    ukuran: "",
    stok: 0,
    jumlah: qty,
    harga: hargaPerPcs,
    isHargaReadonly: true,
    diskonPersen: 0,
    diskonRp: 0,
    total: totalHarga,
    barcode: "",
    noPengajuanHarga: "",
    pin: "",
    isCustomOrder: true,
    sod_custom_data: JSON.stringify(data.customData) // Ini masuk ke pend_custom_data
  });

  calculateTotals();
};

const openDpInput = () => {
  if (!header.value.customer) return toast.error("Customer harus dipilih.");
  isDpInputVisible.value = true;
};

const onDpSaved = (newDp: { nomor: string; jenis: string; nominal: number }) => {
  dpItems.value.push({
    ...newDp,
    posting: 'BELUM', // Berikan nilai default
    fsk: ''          // Berikan nilai default
  });
  calculateTotals();
};

const handleAddDp = (newDp: { nomor: string; jenis: string; nominal: number }) => {
  if (dpItems.value.some(dp => dp.nomor === newDp.nomor)) return toast.warning("DP sudah ada.");
  dpItems.value.push({
    ...newDp,
    posting: 'BELUM',
    fsk: ''
  });
  calculateTotals();
};

const removeDpRow = (itemToRemove: DpItem) => {
  dpItems.value = dpItems.value.filter(item => item.nomor !== itemToRemove.nomor);
  calculateTotals();
};

const handleDiscountCostUpdate = (newData: DiscountCostUpdateData) => {
  footer.value.diskonPersen1 = newData.diskonPersen1;
  footer.value.diskonPersen2 = newData.diskonPersen2;
  footer.value.diskonRp = newData.diskonRp;
  footer.value.diskonRpInput = newData.diskonRp;
  footer.value.biayaKirim = newData.biayaKirim;

  if (newData.pinDiskon1) footer.value.pinDiskon1 = newData.pinDiskon1;
  if (newData.pinDiskon2) footer.value.pinDiskon2 = newData.pinDiskon2;

  calculateTotals();
};

// Gunakan debounce (opsional tapi disarankan) agar tidak nembak API setiap ngetik angka
let debounceTimer: ReturnType<typeof setTimeout>;

watch(() => footer.value.total, () => {
  if (isInitialLoad.value) return;
  // 1. Jika sedang manual override (menunggu auth atau sudah ada PIN), JANGAN update otomatis
  if (footer.value.pinDiskon1 || isAuthPending.value) {
    return;
  }

  // 2. Clear timer sebelumnya
  clearTimeout(debounceTimer);

  // 3. Tunggu 500ms setelah user selesai edit barang, baru panggil API
  debounceTimer = setTimeout(() => {
    applyDefaultDiscount();
  }, 500);
});

watch(items, calculateTotals, { deep: true });
watch(footer, calculateTotals, { deep: true });
watch(isFooterDiskonRpFocused, (focused) => {
  if (focused) {
    previousDiskonRp.value = footer.value.diskonRp;
  }
});
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
watch(() => header.value.customerKode, (newKode) => {
  if (newKode) loadCustomerDetails();
});

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [header, items, footer],
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isSaving.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Customer dipilih atau Keterangan diisi
    const hasHeader = (header.value.customer !== null) || (header.value.keterangan.trim() !== '');

    // 2. Items: Ada item valid (kode terisi)
    const hasItems = items.value.some(i => i.kode !== '');

    // 3. Footer: Ada perubahan diskon manual
    // (Bisa dicek lebih detail jika perlu, tapi perubahan footer biasanya mengikuti items)

    if (hasHeader || hasItems) {
      uiStore.setUnsavedChanges(true);
    } else {
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

onMounted(async () => {
  markAsSaved();
  // Pengecekan otorisasi sebelum memuat apa pun
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin untuk ${requiredPermission.value === 'insert' ? 'membuat' : 'mengubah'} data penawaran.`);
    router.push('/transaksi/penjualan/penawaran');
    return;
  }

  try {
    const response = await api.get("/invoice-form/lookup/active-promos", {
      params: { tanggal: header.value.tanggal, cabang: header.value.gudang.kode },
    });
    activePromosList.value = response.data || [];
  } catch (e) {
    console.error("Gagal load promo", e);
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
      <v-btn color="secondary" size="small" prepend-icon="mdi-tshirt-crew-outline" :disabled="!header.customer"
        @click="openJenisOrderModal">
        Input Jenis Order
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save"
        @click="showConfirmation(save, 'Anda yakin ingin menyimpan data penawaran ini?')" :loading="isSaving">
        Simpan
      </v-btn>
      <v-btn v-if="!isEditMode" size="small" prepend-icon="mdi-cancel"
        @click="showConfirmation(resetForm, 'Batalkan dan kosongkan semua isian?')">
        Batal
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close"
        @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')">
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6">
              <v-text-field label="Nomor" :model-value="header.nomor || '<Otomatis>'" readonly variant="filled"
                density="compact" hide-details>
              </v-text-field>
            </v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                density="compact" hide-details></v-text-field></v-col>
            <!-- <v-col cols="12"><v-text-field label="Gudang" :model-value="header.gudang.kode" readonly
                                @click="openGudangSearch" variant="outlined" density="compact" hide-details
                                append-inner-icon="mdi-magnify"></v-text-field></v-col> -->
            <v-col cols="12"><v-text-field label="Customer"
                :model-value="header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''" readonly
                @click="openCustomerSearch" variant="outlined" density="compact" hide-details
                append-inner-icon="mdi-magnify"></v-text-field></v-col>
            <v-col cols="12"><v-text-field label="Alamat" :model-value="header.customer?.alamat" readonly
                variant="filled" density="compact" hide-details></v-text-field></v-col>
            <v-col cols="6"><v-text-field label="Kota / Telp"
                :model-value="header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''" readonly
                variant="filled" density="compact" hide-details></v-text-field></v-col>
            <v-col cols="6"><v-text-field label="Level" :model-value="header.customer?.level" readonly variant="filled"
                density="compact" hide-details></v-text-field></v-col>
            <v-col cols="4"><v-text-field label="TOP" v-model.number="header.top" type="number" variant="outlined"
                density="compact" hide-details></v-text-field></v-col>
            <v-col cols="8"><v-text-field label="Tgl Tempo" v-model="header.tempo" type="date" variant="filled" readonly
                density="compact" hide-details></v-text-field></v-col>
            <v-col cols="12"><v-text-field label="Keterangan" v-model="header.keterangan" variant="outlined"
                density="compact" hide-details></v-text-field></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section footer-summary-section">
          <v-row dense align="center" no-gutters>
            <v-col cols="auto" class="d-flex ga-2 align-center">

              <v-tooltip text="Input DP (Uang Muka)" location="top">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon="mdi-cash-plus" color="teal" size="small" variant="flat"
                    @click="openDpInput" />
                </template>
              </v-tooltip>

              <v-tooltip text="Atur Diskon & Biaya Faktur" location="top">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon="mdi-sale" color="blue-darken-2" size="small" variant="outlined"
                    @click="isDiscountCostModalVisible = true" />
                </template>
              </v-tooltip>

              <v-tooltip text="Lihat Rincian DP Terlampir" location="top">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon="mdi-format-list-bulleted" color="teal" size="small" variant="outlined"
                    @click="isDpListModalVisible = true" />
                </template>
              </v-tooltip>

            </v-col>

            <v-spacer></v-spacer>

            <v-col cols="12" md="6" lg="5">
              <v-list density="compact" class="pa-0 bg-transparent">
                <v-list-item v-if="footer.diskonRp > 0" class="px-0 min-h-0">
                  <v-list-item-title class="text-caption text-error font-weight-bold">Total Diskon</v-list-item-title>
                  <template #append>
                    <span class="text-caption text-error font-weight-bold">- {{ formatRupiah(footer.diskonRp) }}</span>
                  </template>
                </v-list-item>

                <v-list-item class="px-0 min-h-0">
                  <v-list-item-title class="text-caption">Grand Total</v-list-item-title>
                  <template #append>
                    <span class="text-subtitle-1 font-weight-bold">{{ formatRupiah(footer.grandTotal) }}</span>
                  </template>
                </v-list-item>

                <v-list-item v-if="footer.totalDp > 0" class="px-0 min-h-0">
                  <v-list-item-title class="text-caption text-teal font-weight-bold">Uang Muka
                    (DP)</v-list-item-title>
                  <template #append>
                    <span class="text-caption text-teal font-weight-bold">- {{ formatRupiah(footer.totalDp) }}</span>
                  </template>
                </v-list-item>

                <v-list-item class="px-0 border-t mt-1 pt-1">
                  <v-list-item-title class="text-subtitle-2 font-weight-bold">Sisa Bayar</v-list-item-title>
                  <template #append>
                    <span class="text-h6 font-weight-black text-primary">{{ formatRupiah(footer.belumDibayar)
                    }}</span>
                  </template>
                </v-list-item>
              </v-list>
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="desktop-form-section right-column">
        <div class="scanner-wrapper">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
            placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
            prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan">
          </v-text-field>
        </div>
        <v-slide-y-transition>
          <div v-if="promoNotification" class="promo-card-wrapper mb-4 mt-2">
            <div :class="['promo-card', { 'grand-opening-style': isGrandOpeningPromo }]">
              <div class="card-texture"></div>
              <div class="card-shine"></div>
              <div class="card-content">
                <div class="icon-container">
                  <div class="icon-circle pulse-animation">
                    <v-icon icon="mdi-ticket-percent-outline" size="24" color="white" />
                  </div>
                </div>
                <div class="text-container">
                  <div class="promo-label">PENAWARAN PROMO TERSEDIA</div>
                  <div class="promo-message">{{ promoNotification }}</div>
                </div>

                <div v-if="potentialPromoDiscount > 0 && footer.diskonRp < potentialPromoDiscount"
                  class="action-container">
                  <v-btn color="white" variant="flat" size="small" class="text-primary font-weight-bold"
                    @click="applyPromoDiscount">
                    GUNAKAN PROMO
                  </v-btn>
                </div>
              </div>
            </div>
          </div>
        </v-slide-y-transition>
        <v-data-table :headers="tableHeaders" :items="items" density="compact"
          class="desktop-table vertically-aligned-table" fixed-header :items-per-page="-1">
          <template #[`item.kode`]="{ item, index }">
            <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details placeholder="F1/F2..."
              @keydown.f1.prevent="openProductSearch(index, false)"
              @keydown.f2.prevent="openProductSearch(index, true)"></v-text-field>
          </template>

          <template #[`item.nama`]="{ item }">
            <div class="scrollable-cell">{{ item.nama }}</div>
          </template>

          <template #[`item.stok`]="{ item }">
            <v-text-field :model-value="item.stok" variant="underlined" density="compact" hide-details readonly
              single-line class="text-right" :disabled="!item.kode"></v-text-field>
          </template>

          <template #[`item.jumlah`]="{ item }">
            <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" dense hide-details single-line
              class="text-right" :disabled="!item.kode"></v-text-field>
          </template>

          <template #[`item.harga`]="{ item }">
            <v-text-field :model-value="focusedRowId === item.id ? item.harga : formatRupiah(item.harga)"
              @update:model-value="item.harga = Number(String($event).replace(/[^0-9]/g, '')) || 0"
              @focus="focusedRowId = item.id" @blur="focusedRowId = -1" placeholder="0" type="text" variant="underlined"
              dense hide-details single-line class="text-right" :disabled="!item.kode"
              :readonly="item.isHargaReadonly"></v-text-field>
          </template>

          <template #[`item.diskonPersen`]="{ item }">
            <v-text-field v-model.number="item.diskonPersen" type="number" variant="underlined" dense hide-details
              single-line class="text-right" @blur="handleItemDiscountChange(items.indexOf(item))"
              :disabled="!item.kode"></v-text-field>
          </template>

          <template #[`item.diskonRp`]="{ item }">
            <v-text-field :model-value="focusedRowId === item.id ? item.diskonRp : formatRupiah(item.diskonRp)"
              @update:model-value="item.diskonRp = Number(String($event).replace(/[^0-9]/g, '')) || 0"
              @focus="focusedRowId = item.id" @blur="focusedRowId = -1; handleItemDiscountChange(items.indexOf(item))"
              placeholder="0" type="text" variant="underlined" dense hide-details single-line class="text-right"
              :disabled="!item.kode"></v-text-field>
          </template>

          <template #[`item.total`]="{ item }">
            <div class="text-caption font-weight-bold text-right">
              {{ formatRupiah(item.total) }}
            </div>
          </template>

          <template #[`item.actions`]="{ item }">
            <v-btn icon="mdi-delete" size="x-small" variant="text" color="error"
              @click="removeRow(items.indexOf(item))"></v-btn>
          </template>

          <!-- <template #[`item.noSoDtf`]="{ item, index }">
            <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details placeholder="F1..."
              @keydown.f1.prevent="openSoDtfSearch(index)">
            </v-text-field>
          </template> -->

          <template #[`item.noPengajuanHarga`]="{ item, index }">
            <v-text-field v-model="item.noPengajuanHarga" variant="underlined" density="compact" hide-details
              placeholder="F1..." @keydown.f1.prevent="openPriceProposalSearch(index)">
            </v-text-field>
          </template>
          <template #[`body.append`]>
            <tr class="qty-footer-row">
              <td v-for="header in tableHeaders" :key="header.key"
                :class="header.align === 'end' || header.key === 'jumlah' || header.key === 'harga' || header.key === 'total' ? 'text-right' : 'text-left'">

                <div v-if="header.key === 'jumlah'" class="qty-value">
                  {{ totalQty }}
                </div>

                <div v-else-if="header.key === 'stok'"
                  class="text-caption font-weight-bold text-medium-emphasis text-right mr-2">
                  TOTAL QTY:
                </div>

              </td>
            </tr>
          </template>
        </v-data-table>
        <div class="pa-2 border-t d-flex align-center justify-start bg-surface">
          <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus" variant="text" color="primary">
            Tambah Baris
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="header.gudang.kode"
      @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
    <!-- <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''"
            @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" /> -->
    <ProductSearchModal v-if="isProductSearchVisible" :category="'Kaosan'" :source="'penawaran'"
      :gudang="header.gudang.kode" :multi="isMultiSelectProduct" @close="isProductSearchVisible = false"
      @products-selected="onProductsSelected" />
    <AuthorizationModal v-if="authDialog.show" :title="authDialog.title" :jenis="authDialog.jenis"
      :nominal="authDialog.nominal" :transaksi="authDialog.transaksi" :barcode="authDialog.barcode"
      :keterangan="authDialog.keterangan" @success="authDialog.onSuccess"
      @close="() => { authDialog.show = false; authDialog.onCancel(); }" />
    <!-- <SoDtfSearchModal v-if="isSoDtfSearchVisible" :cabang="header.gudang.kode" :customerKode="header.customer?.kode"
      @close="isSoDtfSearchVisible = false" @selected="onSoDtfSelected" /> -->
    <PriceProposalSearchModal v-if="isPriceProposalSearchVisible" :cabang="header.gudang.kode"
      :customerKode="header.customer?.kode" @close="isPriceProposalSearchVisible = false"
      @selected="onPriceProposalSelected" />

    <DpInputModal v-if="isDpInputVisible" :customerKode="header.customer?.kode || ''"
      :nomor-so="header.nomor || 'DRAFT'" :minimal-dp="0" :existing-dp="footer.diskonRp"
      @close="isDpInputVisible = false" @dp-saved="onDpSaved" />

    <DpListModal v-if="isDpListModalVisible" :dp-items="dpItems" :customer-kode="header.customer?.kode || ''"
      @close="isDpListModalVisible = false" @remove-dp="removeDpRow" @add-dp="handleAddDp" />

    <DiscountCostModal v-if="isDiscountCostModalVisible" source="OFFER" :footer-data="footer"
      :total-so="footer.subtotalKaos" :customer="header.customer" :gudang-kode="header.gudang.kode"
      :ppn-persen="header.ppnPersen" @close="isDiscountCostModalVisible = false" @update="handleDiscountCostUpdate" />

    <JenisOrderModal v-if="dialogs.jenisOrder" :model-value="dialogs.jenisOrder" :penawaran-details="penawaranDetails"
      :penawaran-barang-list="penawaranBarangList" @close="dialogs.jenisOrder = false" @saved="handleJenisOrderSaved" />

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

    <v-dialog v-model="isPrintConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">
          Simpan Berhasil
        </v-card-title>
        <v-card-text>
          Data penawaran {{ printConfirmNomor }} berhasil disimpan.
          <br><br>
          Apakah Anda ingin mencetak dokumen ini sekarang?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="handlePrintCancel">
            Tidak, Kembali
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="handlePrintConfirm">
            Ya, Cetak
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isPromoConfirmVisible" max-width="400">
      <v-card>
        <v-card-title>Gunakan Promo?</v-card-title>
        <v-card-text>
          Item Anda berhak mendapatkan diskon <b>{{ pendingPromoData.nama }}</b>
          sebesar <b>{{ formatRupiah(pendingPromoData.diskon) }}</b>.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="grey" @click="useMemberDiscount">Tetap Diskon Member</v-btn>
          <v-btn color="primary" @click="applyPromoDiscount">Terapkan Promo</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* --- 1. PERBAIKAN LAYOUT TABEL (Agar Sticky Footer Jalan) --- */

/* Pastikan section kanan punya flex layout */
.right-column.desktop-form-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* Penting */
  overflow: hidden;
  /* Penting */
}

/* Tabel harus mengisi sisa ruang dan tidak scroll body-nya sendiri */
.desktop-table {
  flex-grow: 1;
  height: 100%;
  /* Paksa full height */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Prevent double scroll */
}

/* Wrapper dalam Vuetify adalah yang harus di-scroll */
.desktop-table :deep(.v-table__wrapper) {
  height: 100% !important;
  /* Paksa tinggi penuh */
  overflow-y: auto !important;
  /* Scroll ada di sini */
  position: relative;
  /* Penting untuk sticky */
}

/* --- 2. PERBAIKAN TOTAL QTY (STICKY BOTTOM) --- */
.qty-footer-row {
  position: sticky !important;
  /* Paksa sticky */
  bottom: 0 !important;
  /* Tempel di bawah wrapper */
  z-index: 5;
  /* Di atas baris data */
}

/* Background row total harus solid agar baris di bawahnya tidak tembus saat di-scroll */
.qty-footer-row td {
  background-color: rgb(var(--v-theme-surface)) !important;
  /* Ikut tema (Putih/Hitam) */
  border-top: 3px solid #0D47A1 !important;
  /* Border pemisah tebal biru */
  color: #0D47A1 !important;
  /* Teks Biru */
  font-weight: 900;
  font-size: 14px;
  padding: 0 16px;
  height: 40px;
}

/* --- 3. PERBAIKAN HEADER (TETAP BIRU) --- */
.desktop-table :deep(thead tr th) {
  background-color: #0D47A1 !important;
  /* [FIX] Paksa Biru Tua */
  color: #ffffff !important;
  /* [FIX] Teks Putih */
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  border-bottom: none !important;
  z-index: 6;
  /* Header di atas footer */
}

/* --- Lain-lain (Tetap Pertahankan) --- */
.form-grid-container {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 16px;
  height: 100%;
  overflow: hidden;
  background-color: transparent;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.desktop-form-section {
  padding: 12px 16px;
  border-radius: 8px;
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.left-column .desktop-form-section.header-section {
  background-color: var(--bg-panel-left);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.left-column .desktop-form-section.footer-section {
  background-color: rgba(var(--v-theme-warning), 0.05);
  border: 1px solid rgba(var(--v-theme-warning), 0.2);
}

.right-column.desktop-form-section {
  background-color: var(--bg-panel-right);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

/* Fix Input Transparan di Header */
.header-section :deep(.v-field),
.footer-section :deep(.v-field) {
  background-color: transparent !important;
  box-shadow: none !important;
}

.header-section :deep(input),
.footer-section :deep(input) {
  color: rgb(var(--v-theme-on-surface)) !important;
  opacity: 1 !important;
}

.header-section :deep(.v-label),
.footer-section :deep(.v-label) {
  color: rgba(var(--v-theme-on-surface), 0.7) !important;
}

/* Summary Field */
.summary-field :deep(input) {
  font-weight: 900 !important;
  font-size: 1.1rem !important;
  padding-top: 10px !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* Scrollable Cell & Scanner */
.desktop-table :deep(.scrollable-cell) {
  white-space: nowrap;
  overflow-x: auto;
  max-width: 450px;
  min-width: 300px;
}

.scanner-wrapper {
  max-width: 400px;
  flex: none;
  margin-bottom: 16px;
}

/* Input angka dalam tabel */
.v-data-table :deep(input[type='number']) {
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
  color: rgb(var(--v-theme-on-surface));
}

.v-data-table :deep(input) {
  color: rgb(var(--v-theme-on-surface)) !important;
}

.footer-summary-section {
  padding: 10px 16px;
  border: 1px solid rgba(var(--v-theme-warning), 0.3);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-warning), 0.05) !important;
  min-height: 80px;
  /* Jaga tinggi agar konsisten */
  display: flex;
  align-items: center;
}

/* Jarak antar tombol ikon */
.ga-2 {
  gap: 12px !important;
}

.min-h-0 {
  min-height: 26px !important;
}

.border-t {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12) !important;
}

/* Memperbaiki posisi v-row di footer */
.footer-summary-section .v-row {
  width: 100%;
  margin: 0;
}

/* --- Premium Promo Card Styles --- */
.promo-card-wrapper {
  perspective: 1000px;
}

.promo-card {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);
  box-shadow: 0 8px 25px -5px rgba(38, 208, 206, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.card-texture {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px);
  background-size: 10px 10px;
  opacity: 0.5;
  z-index: 1;
}

.card-content {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: 10px 18px;
  gap: 14px;
  color: white;
}

.icon-circle {
  width: 42px;
  height: 42px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.pulse-animation {
  animation: softPulse 2s infinite;
}

.promo-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  font-weight: 800;
  opacity: 0.85;
}

.promo-message {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
}

@keyframes softPulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
  }

  70% {
    transform: scale(1.05);
    box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
  }

  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
  }
}

.card-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(to right, transparent 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%);
  transform: skewX(-25deg);
  z-index: 2;
  animation: shineMove 4s infinite ease-in-out;
}

@keyframes shineMove {
  0% {
    left: -100%;
  }

  20% {
    left: 200%;
  }

  100% {
    left: 200%;
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick, reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { format, addDays, isValid } from "date-fns";
import type { AxiosError } from "axios";
import axios from "axios";
import { formatRupiah } from "@/utils/formatRupiah";

// Impor semua komponen modal yang akan digunakan
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";
import SalesCounterSearchModal from "@/components/lookup/SalesCounterSearchModal.vue";
import ProductSearchModal from "@/components/lookup/ProductSearchModal.vue";
import PenawaranSearchModal from "@/components/lookup/PenawaranSearchModal.vue";
import SoDtfSearchModal from "@/components/lookup/SoDtfSearchModal.vue";
import PriceProposalSearchModal from "@/components/lookup/PriceProposalSearchModal.vue";
import AuthorizationModal from "@/components/modal/AuthorizationModal.vue";
import DpInputModal from "@/components/modal/DpInputModal.vue";
import CustomerForm from "@/components/form/CustomerForm.vue";
import DpListModal from "@/components/modal/DpListModal.vue";
import DiscountCostModal from "@/components/modal/DiscountCostModal.vue";
import JenisOrderModal from "@/components/modal/JenisOrderModal.vue";
import PromoSearchModal from "@/components/lookup/PromoSearchModal.vue"; // [BARU]
import PromoBonusModal from "@/components/modal/PromoBonusModal.vue"; // [BARU]

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "26";

// --- Interfaces ---
interface SoItem {
  id: number;
  kode: string;
  nama: string;
  kategori?: string;
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
  isCustomOrder?: boolean;
  isJasa?: boolean;

  ukuranKaos?: { ukuran: string; jumlah: number; harga: number }[];
  titikCetak?: { keterangan: string; sizeCetak: string; panjang: number; lebar: number }[];
  sourceItems?: { kode: string; nama: string; ukuran: string; jumlah: number }[];

  sod_custom?: string;
  sod_custom_nama?: string;
  sod_custom_data?: string;

  terhitungPromo?: boolean;
}

// // Interface untuk data item promo dari backend
// interface PromoItemRule {
//   kode: string;
//   ukuran: string;
//   discPersen: number;
//   discRp: number;
// }

// Interface untuk item bonus yang dipilih dari modal
interface BonusItemSelection {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
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
  level_kode: string; // tambahan
  level_nama: string; // tambahan
  top: number; // tambahan
  franchise: "Y" | "N";
}

interface SoItemApi {
  kode: string;
  nama: string;
  kategori?: string;
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
  harga3?: number;
}

interface Item {
  id: number;
  kode: string;
  nama: string;
  kategori: string;
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

  isCustomOrder?: boolean;

  ukuranKaos?: { ukuran: string; jumlah: number; harga: number }[];
  titikCetak?: { keterangan: string; sizeCetak: string; panjang: number; lebar: number }[];

  /** 🔥 Tambahkan ini */
  sourceItems?: {
    kode: string;
    nama: string;
    ukuran: string;
    jumlah: number;
  }[];

  /** 🔥 Flag custom dari backend */
  sod_custom?: string;
  sod_custom_nama?: string;
  sod_custom_data?: string;
}

// 2. Gunakan PenawaranDetail yang sebelumnya "unused" untuk mapping detail dari API
interface PenawaranDetailApi {
  pend_kode: string;
  nama_barang: string;
  pend_ukuran: string;
  pend_jumlah: number;
  pend_harga: number;
  pend_disc: number;
  pend_diskon: number;
  pend_custom: 'Y' | 'N';
  pend_custom_data?: string | null;
  stok?: number;
  kategori?: string;
  barcode?: string;
  pend_sd_nomor?: string;
  pend_ph_nomor?: string;
}

interface SourceItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}

interface CustomTechData {
  ukuranKaos?: { ukuran: string; jumlah: number; harga: number }[];
  titikCetak?: { keterangan: string; sizeCetak: string; panjang: number; lebar: number }[];
  sourceItems?: SourceItem[];
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

interface JenisOrderSaved {
  namaOrder: string;
  jenisOrder: string;
  namaBarang: string;
  kodeBarang: string;
  totalJumlah: number;
  totalHarga: number;

  // tambahan untuk custom order
  ukuranKaos?: { ukuran: string; jumlah: number; harga: number }[];
  titikCetak?: { keterangan: string; sizeCetak: string; panjang: number; lebar: number }[];
  hargaPerCm?: number;
}

interface ActivePromo {
  pro_nomor: string;
  pro_judul: string;
  pro_totalrp: number;
  pro_disrp: number;
  pro_diskon: number;
  pro_lipat: "Y" | "N";
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

// Tambahkan interface ini di bagian atas bersama interface lainnya
interface CustomerLookupResult {
  kode?: string;
  cus_kode?: string;
  nama?: string;
  cus_nama?: string;
  alamat?: string;
  cus_alamat?: string;
  kota?: string;
  cus_kota?: string;
  telp?: string;
  cus_telp?: string;
  level_kode?: string;
  cus_level?: string;
  level_nama?: string;
  cus_level_nama?: string;
  top?: number;
  cus_top?: number;
  franchise?: "Y" | "N";
  cus_franchise?: "Y" | "N";
}

interface DpApiResult {
  nomor: string;
  jenis: string;
  nominal: number;
  posting?: string;
  fsk?: string;
}

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  header.value.isMarketplace
    ? "Pesanan Marketplace"
    : isEditMode.value
      ? "Ubah Surat Pesanan"
      : "Buat Surat Pesanan"
);
const statusDpText = computed(() => {
  if (footer.value.totalDp >= footer.value.minimalDp || footer.value.pinTanpaDp) {
    return "DP Memenuhi Syarat/Ada Otorisasi";
  }
  return "DP Belum Cukup";
});
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));
const isLoading = ref(true);
const isSaving = ref(false);
const isInitialLoad = ref(false);
const isSavingDisabled = ref(false);
const scannedBarcode = ref("");

const initialHeaderState = {
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  dateline: format(addDays(new Date(), -1), "yyyy-MM-dd"),
  gudang: { kode: authStore.user?.cabang || "", nama: authStore.user?.cabangNama || "" },
  customer: null as Customer | null,
  penawaran: "",
  salesCounter: authStore.user?.kode || "",
  levelKode: "",
  levelNama: "",
  keterangan: "",
  telp: "",
  top: 0,
  alamat: "",
  kota: "",
  tempo: "",
  ppnPersen: 0,
  statusSo: "PASIF",
  accDpPin: "",
  jenisOrderKode: "",
  jenisOrderNama: "",
  namaDtf: "",

  mpNomorPesanan: "",
  mpResi: "",
  isMarketplace: false,

  nomorPromo: "", // [BARU]
  namaPromo: "", // [BARU]
  nomorAuth: "",
};

const header = ref({ ...initialHeaderState });

const items = ref<SoItem[]>([]);
const dpItems = ref<DpItem[]>([]);
const existingDpNomor = ref<string>("");
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
  pinTanpaDp: "",
  pinDiskon1: undefined,
  pinDiskon2: undefined,
});

const authDialog = reactive<AuthDialogState>({
  show: false,
  title: "",
  jenis: "",
  nominal: 0,
  transaksi: "",
  barcode: "",
  keterangan: "",
  onSuccess: () => { },
  onCancel: () => { },
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
const confirmText = ref("");
const pendingAction = ref<(() => void) | null>(null);
const isPrintConfirmVisible = ref(false); // State untuk dialog baru
const printConfirmNomor = ref(""); // Untuk menyimpan nomor SO yang akan dicetak
const activeRowIndex = ref(0);
const isDpInputVisible = ref(false);
const isNewCustomerFormVisible = ref(false);
const focusedRowId = ref<number | string>(-1);
const isDiscountCostModalVisible = ref(false);
const isDpListModalVisible = ref(false);
const totalDiscountable = ref(0);
const dialogs = reactive({
  jenisOrder: false,
  promoSearch: false, // [BARU]
  promoBonus: false, // [BARU]
});
const jenisOrderList = ref([]);
const loadingJenisOrder = ref(false);
const page = ref(1);
const rowsPerPage = ref(10);
const potentialPromoDiscount = ref(0);

// [BARU] State untuk Promo
const activePromosList = ref<ActivePromo[]>([]);
const promoNotification = ref("");
// const potentialPromoDiscount = ref(0);
const isGrandOpeningPromo = ref(false);
const activePromoForBonus = ref({ nomor: "", qty: 0 });
// const formJenisOrder = reactive({
//   jenis: null,
//   ukuran: 0,
//   titik: 0,
// });
// --- State Konfirmasi Promo ---
const isPromoConfirmVisible = ref(false);
const pendingPromoData = reactive({
  nomor: "",
  nama: "",
  diskon: 0
});
// Flag agar dialog tidak muncul berulang kali untuk promo yang sama
const lastSuggestedPromo = ref("");

const parseDate = (val: string | Date | null | undefined): Date => {
  if (!val) return new Date();
  if (val instanceof Date) return val;

  const datePart = val.split("T")[0];
  const [y, m, d] = datePart.split("-");

  if (y && m && d) {
    return new Date(Number(y), Number(m) - 1, Number(d), 12);
  }

  const fallback = new Date(val);
  return isValid(fallback) ? fallback : new Date();
};

const mainTableHeaders = [
  { title: "Kode", key: "kode", width: "180px" },
  { title: "Nama Barang", key: "nama", width: "250px" },
  { title: "Ktg", key: "kategori", width: "90px" },
  { title: "Ukuran", key: "ukuran", width: "90px" },
  { title: "Stok", key: "stok", align: "end", width: "80px" },
  { title: "Jumlah", key: "jumlah", width: "100px" },
  { title: "Harga", key: "harga", width: "120px" },
  { title: "Diskon %", key: "diskonPersen", width: "100px" },
  { title: "Diskon Rp", key: "diskonRp", width: "120px" },
  { title: "Total", key: "total", align: "end", width: "140px" },
  { title: "No. SO DTF", key: "noSoDtf", width: "180px" },
  { title: "No. Pengajuan", key: "noPengajuanHarga", width: "180px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
] as const;

// const dpTableHeaders = [
//   { title: 'No. Setoran', key: 'nomor' },
//   { title: 'Jenis', key: 'jenis' },
//   { title: 'Nominal', key: 'nominal' },
//   { title: 'Posting', key: 'posting' },
//   { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
// ] as const;

// --- Computed Properties ---
const minimalDpText = computed(() => {
  const containsDtf = items.value.some((item) => item.noSoDtf);
  const containsCustom = items.value.some((item) => item.isCustomOrder);
  const percentage = containsDtf || containsCustom ? 50 : 30;
  const amount = new Intl.NumberFormat("id-ID").format(footer.value.minimalDp);
  return `Minimal DP ${percentage}% dari nominal SO : ${amount}`;
});

// const selectedPenawaran = computed(() => {
//   // Ambil nama barang pertama dari penawaran (kalau ada)
//   if (items.value.length > 0) {
//     const first = items.value.find(it => it.nama);
//     return first ? { namaBarang: first.nama } : null;
//   }
//   return null;
// });

/**
 * penawaranDetails → Dikirim ke modal JenisOrderModal
 *   Berisi semua kombinasi kodeBarang + ukuran
 *   Digunakan untuk validasi ukuran di dropdown Ukuran Kaos
 */
const penawaranDetails = computed(() => {
  const detailMap = new Map<string, { kodeBarang: string; namaBarang: string; ukuran?: string }>();

  items.value.forEach((it) => {
    if (it.kode && it.nama) {
      const key = `${it.kode}|${it.ukuran || ""}`;
      if (!detailMap.has(key)) {
        detailMap.set(key, {
          kodeBarang: it.kode,
          namaBarang: it.nama,
          ukuran: it.ukuran || "",
        });
      }
    }
  });

  return Array.from(detailMap.values());
});

/**
 * penawaranBarangList → Digunakan untuk dropdown Nama Barang di modal
 *   Berisi hanya satu item per kodeBarang (tanpa duplikat ukuran)
 */
const penawaranBarangList = computed(() => {
  const map = new Map<string, string>();
  items.value.forEach((it) => {
    if (it.kode && it.nama && !map.has(it.kode)) {
      map.set(it.kode, it.nama);
    }
  });
  return Array.from(map.entries()).map(([kodeBarang, namaBarang]) => ({
    kodeBarang,
    namaBarang,
  }));
});

const grandQty = computed(() => items.value.reduce((sum, i) => sum + (Number(i.jumlah) || 0), 0));

const grandTotal = computed(() => footer.value.totalSo || 0);

const isUserKon = computed(() => authStore.user?.cabang === "KON");

// --- Functions ---
// function toDateInputValue(dateStr: string) {
//   if (!dateStr) return '';
//   return dateStr.substring(0, 10); // aman, tidak berubah timezone
// }

// --- Methods ---
const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  isInitialLoad.value = true;
  try {
    const response = await api.get(`/so-form/${nomor}`);
    const { headerData, itemsData, dpItemsData, footerData } = response.data;

    // ===== MAPPING HEADER =====
    header.value = {
      ...header.value,
      ...headerData,
      level: headerData.levelKode || "",
      levelKode: headerData.levelKode || "",
      levelNama: headerData.levelNama || "",
      tanggal: headerData.tanggal.substring(0, 10),
      dateline: headerData.dateline.substring(0, 10),
    };

    if (headerData.so_is_marketplace === "Y") {
      header.value.isMarketplace = true;
      header.value.penawaran = "";
      header.value.top = 0;
      header.value.tempo = header.value.tanggal;
    }

    // ===== MAPPING FOOTER =====
    footer.value = {
      ...footer.value,
      ...footerData,
    };

    // ===== MAPPING ITEMS =====
    items.value = itemsData.map((item, index) => {
      let parsed: Partial<Item> = {}; // <<< FIX TYPE

      if (item.sod_custom === "Y" && item.sod_custom_data) {
        try {
          parsed = JSON.parse(item.sod_custom_data);
        } catch (e) {
          console.error("Parse sod_custom_data failed", e);
        }
      }

      return {
        ...item,
        id: Date.now() + index + Math.random(),
        isCustomOrder: item.sod_custom === "Y",
        ukuranKaos: parsed.ukuranKaos || [],
        titikCetak: parsed.titikCetak || [],
        sourceItems: parsed.sourceItems || [],
      };
    });

    // ===== MAPPING DP ITEMS =====
    dpItems.value = dpItemsData;
    existingDpNomor.value = dpItemsData.length > 0 ? dpItemsData[0].nomor : "";

    // ===== EDIT PERMISSION CHECK =====
    if (!headerData.canEdit) {
      isSavingDisabled.value = true;
      toast.warning("SO ini sudah menjadi Invoice, data tidak bisa diubah.");
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
    await nextTick();
    await calculateTotals(); // [2] Gunakan 'await' agar hitungan pertama selesai

    isInitialLoad.value = false; // [3] Buka kembali kunci setelah load selesai
    markAsSaved();
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || err.message || "Gagal memuat data SO.");
    router.push("/transaksi/penjualan/surat-pesanan");
  } finally {
    isLoading.value = false;
  }
};

const isDiscountableItem = (item: SoItem) => {
  // barang yang tidak boleh kena diskon:
  // 1. Jasa           → kode/nama mengandung jasa
  // 2. Custom Order   → isCustomOrder = true
  // 3. SO DTF         → ada noSoDtf
  const isJasa =
    item.kode?.toUpperCase().startsWith("JASA") ||
    item.kode?.toUpperCase().startsWith("JS") ||
    item.nama?.toLowerCase().includes("jasa") ||
    item.nama?.toLowerCase().includes("desain");

  return !isJasa && !item.isCustomOrder && !item.noSoDtf;
};

const applyMarketplaceMode = () => {
  header.value.isMarketplace = true;
  header.value.penawaran = ""; // Hapus penawaran
  header.value.top = 0; // Cash
  header.value.tempo = header.value.tanggal;
  header.value.statusSo = "AKTIF"; // Langsung Aktif tanpa DP

  // Pastikan footer DP reset
  footer.value.minimalDp = 0;
  footer.value.totalDp = 0;
};

// --- Watchers Khusus User KON ---
// [PENTING] Watcher ini menjamin mode MP aktif meski authStore telat loading
watch(
  isUserKon,
  (newVal) => {
    if (newVal) {
      applyMarketplaceMode();
    }
  },
  { immediate: true }
);

const calculateTotals = async () => {
  // ---------------------------------------------------------
  // 1. INISIALISASI & KALKULASI ITEM (Jalankan untuk SEMUA mode)
  // ---------------------------------------------------------
  let totalSoBruto = 0;
  let newTotalDiscountable = 0;
  let containsDtf = false;
  let containsCustomOrder = false;

  items.value.forEach((item) => {
    const qty = Number(item.jumlah) || 0;
    const harga = Number(item.harga) || 0;

    // Logika diskon per item
    if (item.diskonPersen > 0) {
      item.diskonRp = (item.diskonPersen / 100) * harga;
    }
    item.total = qty * (harga - (item.diskonRp || 0));

    // Tambahkan ke total bruto
    totalSoBruto += item.total;

    // Cek Flag Khusus
    if (item.noSoDtf) containsDtf = true;
    if (item.isCustomOrder) containsCustomOrder = true;

    // Cek apakah item boleh kena diskon faktur
    if (isDiscountableItem(item)) {
      newTotalDiscountable += item.total;
    }
  });

  // Simpan ke State
  footer.value.totalSo = totalSoBruto;
  totalDiscountable.value = newTotalDiscountable;

  // Fungsi ini sekarang akan mengisi footer.diskonRp jika layak
  const isPromoApplied = await checkRealtimePromoEligibility();

  // 3. Kalkulasi Diskon Level/Manual (Hanya jika TIDAK ada promo)
  // 3. KALKULASI DISKON FAKTUR (Hanya jika tidak ada promo)
  if (!isPromoApplied) {
    const diskonPersen1 = footer.value.diskonPersen1 || 0;
    const diskonPersen2 = footer.value.diskonPersen2 || 0;

    // --- PROTEKSI DISKON MANUAL / DATABASE ---
    // Jangan hitung ulang jika:
    // a. Sedang Initial Load (ambil murni dari DB)
    // b. Ada nominal Rp (hasil otorisasi) tapi persennya 0
    if (isInitialLoad.value || header.value.penawaran || (footer.value.diskonRp > 0 && diskonPersen1 === 0)) {
      // Biarkan diskonRp tetap sesuai nilai database/manual
    } else {
      const diskon1Rp = (diskonPersen1 / 100) * newTotalDiscountable;
      const afterDiscount1 = newTotalDiscountable - diskon1Rp;
      const diskon2Rp = (diskonPersen2 / 100) * afterDiscount1;

      footer.value.diskonRp = diskon1Rp + diskon2Rp;
    }
  }

  // Hitung Total DP yang sudah masuk
  const totalDp = dpItems.value.reduce((sum, dp) => sum + (dp.nominal || 0), 0);
  footer.value.totalDp = totalDp;

  // ---------------------------------------------------------
  // 2. KALKULASI DISKON FAKTUR, PPN, & GRAND TOTAL
  // ---------------------------------------------------------

  const diskonPersen1 = footer.value.diskonPersen1 || 0;
  const diskonPersen2 = footer.value.diskonPersen2 || 0;

  // Cek apakah diskonRp diisi manual (tanpa persen)
  // Jika user isi manual, jangan ditimpa rumus persen
  if (!(footer.value.diskonRp > 0 && diskonPersen1 === 0 && diskonPersen2 === 0)) {
    const diskon1Rp = (diskonPersen1 / 100) * newTotalDiscountable;
    const afterDiscount1 = newTotalDiscountable - diskon1Rp;
    const diskon2Rp = (diskonPersen2 / 100) * afterDiscount1;

    footer.value.diskonRp = diskon1Rp + diskon2Rp;
  }

  // Hitung Netto
  const netto = totalSoBruto - footer.value.diskonRp;
  footer.value.netto = netto;

  // Hitung PPN
  const ppnRp = (header.value.ppnPersen / 100) * netto;
  footer.value.ppnRp = ppnRp;

  // Hitung Grand Total
  const grandTotal = netto + ppnRp + (footer.value.biayaKirim || 0);
  footer.value.grandTotal = grandTotal;

  // ---------------------------------------------------------
  // 3. PENENTUAN STATUS & ATURAN KHUSUS (Marketplace vs Reguler)
  // ---------------------------------------------------------

  if (header.value.isMarketplace) {
    // === RULES MARKETPLACE ===
    // 1. Status selalu AKTIF (karena dianggap confirmed order dari MP)
    // 2. Tidak butuh Minimal DP
    // 3. Belum Dibayar = Grand Total (umumnya) - DP (jika ada iseng input)

    header.value.statusSo = "AKTIF";
    footer.value.minimalDp = 0;
    footer.value.belumDibayar = footer.value.grandTotal - footer.value.totalDp;
  } else {
    // === RULES REGULER (Toko/Sales) ===

    // 1. Hitung Belum Dibayar
    footer.value.belumDibayar = footer.value.grandTotal - footer.value.totalDp;

    // 2. Tentukan Minimal DP
    if (containsCustomOrder) {
      footer.value.minimalDp = 0.5 * footer.value.netto; // 50% untuk Custom
    } else if (containsDtf) {
      footer.value.minimalDp = 0.5 * footer.value.netto; // 50% untuk DTF
    } else {
      footer.value.minimalDp = 0.3 * footer.value.netto; // 30% untuk Reguler
    }

    // 3. Tentukan Status SO (PASIF/AKTIF)
    const isLevel8 = header.value.levelKode?.toString().startsWith("8");

    const isFranchise = header.value.customer?.franchise === "Y";

    // Syarat Aktif: Level 8 ATAU Franchise ATAU DP Cukup ATAU Ada Otorisasi
    if (isLevel8 || isFranchise || totalDp >= footer.value.minimalDp || footer.value.pinTanpaDp) {
      header.value.statusSo = "AKTIF";
    } else {
      header.value.statusSo = "PASIF";
    }
  }
  checkRealtimePromoEligibility();
};

const openDpAuthorization = () => {
  // Hitung berapa nominal "Kekurangan DP" yang dimintakan otorisasi
  const kekurangan = Math.max(0, footer.value.minimalDp - footer.value.totalDp);

  const info = `Cust: ${header.value.customer?.nama || "Umum"}\nTotal SO: ${formatRupiah(
    footer.value.grandTotal
  )}\nMin DP: ${formatRupiah(footer.value.minimalDp)}\nDP Masuk: ${formatRupiah(
    footer.value.totalDp
  )}\n\nPermintaan: Otorisasi SO Tanpa DP (Status AKTIF)`;

  requestAuthorization(
    "Otorisasi SO Tanpa DP",
    "SO_TANPA_DP", // Jenis Otorisasi Baru (Pastikan backend support atau mapping ke jenis yg ada)
    kekurangan, // Nominal yang diotorisasi adalah kekurangannya
    {
      transaksi: header.value.nomor || "DRAFT SO",
      keteranganLengkap: info,
    },
    (authResult) => {
      footer.value.pinTanpaDp = authResult.approver;
      if (authResult.authNomor) {
        header.value.nomorAuth = authResult.authNomor;
      }
      header.value.statusSo = "AKTIF";
      toast.success("Otorisasi SO Tanpa DP disetujui.");
    },
    () => {
      toast.info("Permintaan otorisasi dibatalkan.");
    }
  );
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
  if (header.value.isMarketplace) {
    // skip penawaran logic completely
    return;
  }

  if (!header.value.gudang.kode) {
    toast.error("Pilih Gudang terlebih dahulu.");
    return;
  }
  isPenawaranSearchVisible.value = true;
};

const openProductSearch = (index: number, isMulti: boolean) => {
  if (!header.value.customer) {
    toast.error("Pilih Customer terlebih dahulu.");
    return;
  }
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti; // Set mode multi atau single
  isProductSearchVisible.value = true;
};

const openSoDtfSearch = (index: number) => {
  if (!header.value.customer) {
    toast.error("Pilih Customer terlebih dahulu.");
    return;
  }
  activeRowIndex.value = index;
  isSoDtfSearchVisible.value = true;
};

const openPriceProposalSearch = (index: number) => {
  if (!header.value.customer) {
    toast.error("Pilih Customer terlebih dahulu.");
    return;
  }
  activeRowIndex.value = index;
  isPriceProposalSearchVisible.value = true;
};

// [UBAH] Tambahkan 'async' pada definisi fungsi
const save = async () => {
  // --- 1. Validasi Dasar ---
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error("Anda tidak memiliki izin untuk menyimpan data ini.");
    return;
  }

  const todayString = format(new Date(), "yyyy-MM-dd");

  if (header.value.dateline < todayString) {
    toast.error("Dateline tidak boleh kurang dari hari ini. Silakan periksa kembali.");
    return;
  }

  if (!header.value.customer) {
    toast.error("Customer harus diisi.");
    return;
  }

  const validItems = items.value.filter((item) => item.kode || item.isCustomOrder);
  if (validItems.length === 0) {
    toast.error("Detail barang harus diisi minimal 1 baris.");
    return;
  }

  for (const item of validItems) {
    if (!item.jumlah || item.jumlah <= 0) {
      toast.error(`Jumlah untuk barang '${item.nama}' harus diisi dan lebih dari 0.`);
      return;
    }
    if ((item.harga === null || item.harga < 0) && !item.terhitungPromo) {
      toast.error(`Harga untuk barang '${item.nama}' harus diisi.`);
      return;
    }
  }

  // --- 2. Integrasi Logika Promo PRO-2026-001 (Februari) ---
  if (header.value.nomorPromo === "PRO-2026-001") {
    // Hitung akumulasi barang eligible: Reguler, Jersey, dan Sablon DTF
    const totalEligibleFeb = validItems.reduce((sum, item) => {
      const isReguler = item.kategori === "REGULER";
      const isJersey = item.nama?.toUpperCase().includes("JERSEY");
      const isDtf = !!item.noSoDtf;

      if (isReguler || isJersey || isDtf) {
        return sum + (item.total || 0);
      }
      return sum;
    }, 0);

    // Update nominal diskon riil berdasarkan target belanja
    if (totalEligibleFeb >= 200000) {
      // Potongan 20rb tiap kelipatan 200rb
      footer.value.diskonRp = Math.floor(totalEligibleFeb / 200000) * 20000;
    } else if (totalEligibleFeb >= 150000) {
      // Potongan flat 15rb untuk range 150rb - < 200rb
      footer.value.diskonRp = 15000;
    } else {
      // Jika ternyata total belanja turun di bawah syarat setelah diedit
      footer.value.diskonRp = 0;
      header.value.nomorPromo = "";
      header.value.namaPromo = "";
      toast.warning("Syarat minimal belanja promo tidak terpenuhi. Promo dilepas.");
    }

    // Hitung ulang Grand Total setelah penyesuaian diskon promo
    calculateTotals();
  }

  // // --- 2. Integrasi Logika Promo Otomatis ---
  // if (!header.value.nomorPromo) {
  //   try {
  //     // Cari promo yang sedang aktif (Promo PRO-2025-004 dihapus)
  //     const promo008 = activePromosList.value.find((p) => p.pro_nomor === "PRO-2025-008"); // Bulanan
  //     const promo010 = activePromosList.value.find((p) => p.pro_nomor === "PRO-2025-010"); // Kelipatan

  //     let promoToApply: ActivePromo | null = null;
  //     let promoDiskon = 0;

  //     const isExcludedItem = (item: SoItem) => {
  //       const namaUp = item.nama?.toUpperCase() || "";
  //       const kodeUp = item.kode?.toUpperCase() || "";
  //       const isJasaOrDesign =
  //         item.isJasa ||
  //         kodeUp.startsWith("JS") ||
  //         kodeUp.startsWith("JASA") ||
  //         namaUp.includes("JASA") ||
  //         namaUp.includes("DESAIN") ||
  //         namaUp.includes("FILE");
  //       const isCustomOrDtf = item.isCustomOrder || !!item.noSoDtf || !!item.noPengajuanHarga;
  //       return isJasaOrDesign || isCustomOrDtf;
  //     };

  //     const totalReguler = validItems.reduce((sum, item) => {
  //       if (!item.nama?.toUpperCase().includes("JERSEY") && !isExcludedItem(item)) {
  //         return sum + (item.total || 0);
  //       }
  //       return sum;
  //     }, 0);

  //     const totalBelanja = validItems.reduce((sum, item) => {
  //       if (!isExcludedItem(item)) return sum + (item.total || 0);
  //       return sum;
  //     }, 0);

  //     // Cek Kelayakan Promo Header (Diskon Faktur)
  //     if (promo010 && totalReguler >= 250000) {
  //       const kelipatan = Math.floor(totalReguler / 250000);
  //       promoDiskon = 25000 * kelipatan;
  //       promoToApply = promo010;
  //     } else if (promo008 && totalBelanja >= promo008.pro_totalrp) {
  //       promoDiskon = promo008.pro_disrp * Math.floor(totalBelanja / promo008.pro_totalrp);
  //       promoToApply = promo008;
  //     }

  //     // PROMO HEADER (Potongan Harga Faktur) diterapkan jika syarat terpenuhi
  //     if (promoToApply) {
  //       if (
  //         footer.value.diskonRp === 0 &&
  //         footer.value.diskonPersen1 === 0 &&
  //         footer.value.diskonPersen2 === 0
  //       ) {
  //         footer.value.diskonRp = promoDiskon;
  //         header.value.nomorPromo = promoToApply.pro_nomor;
  //         header.value.namaPromo = promoToApply.pro_judul;
  //         await calculateTotals();
  //         toast.success(`Promo ${promoToApply.pro_judul} diterapkan otomatis!`);
  //       }
  //     }
  //   } catch (error) {
  //     console.error("Gagal mengecek promo otomatis:", error);
  //   }
  // }

  // // --- 3. Cek Promo Tebus Murah (Bonus Item) ---
  // if (header.value.nomorPromo === "PRO-2025-002") {
  //   activePromoForBonus.value = { nomor: header.value.nomorPromo, qty: 1 };
  //   dialogs.promoBonus = true;
  //   return;
  // }

  // --- 4. Validasi DP ---
  if (footer.value.totalDp < footer.value.minimalDp && header.value.statusSo === "PASIF") {
    toast.warning("DP di bawah Minimal DP. SO ini akan berstatus PASIF.");
  }

  // --- VALIDASI TANGGAL HARI INI ---
  if (!isEditMode.value) { // Hanya cek jika buat SO BARU
    const today = format(new Date(), "yyyy-MM-dd");
    if (header.value.tanggal !== today) {
      toast.error(`Tanggal transaksi harus hari ini (${today}).`);
      return;
    }
  }
  // ----------------------------------------------

  // --- 5. Konfirmasi Akhir ---
  showConfirmation(executeSave, "Anda yakin ingin menyimpan Surat Pesanan ini?");
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: {
        ...header.value,
        level: header.value.levelKode,
        so_is_marketplace: header.value.isMarketplace ? "Y" : "N",
        so_mp_nomor_pesanan: header.value.mpNomorPesanan,
        so_mp_resi: header.value.mpResi,
        nomorAuth: header.value.nomorAuth,
      },
      footer: footer.value,
      details: items.value
        .filter((item) => item.kode || item.isCustomOrder)
        .map((item) => ({
          kode: item.kode || (item.isCustomOrder ? "CUSTOM" : ""),
          nama: item.nama,
          ukuran: item.ukuran,
          jumlah: item.jumlah,
          harga: item.harga,
          total: item.total,

          // 🔥 FLAG WAJIB: backend butuh ini
          isCustomOrder: item.isCustomOrder || false,
          sod_custom: item.isCustomOrder ? "Y" : "N",
          sod_custom_nama: item.isCustomOrder ? item.nama : null,
          sod_custom_data: item.isCustomOrder
            ? JSON.stringify({
              ukuranKaos: item.ukuranKaos || [],
              titikCetak: item.titikCetak || [],
              sourceItems: item.sourceItems || [],
            })
            : null,

          // opsional tapi aman dipertahankan
          noSoDtf: item.noSoDtf || "",
          noPengajuanHarga: item.noPengajuanHarga || "",
          diskonPersen: item.diskonPersen || 0,
          diskonRp: item.diskonRp || 0,
          barcode: item.barcode || "",
          pin: item.pin || "",
        })),
      dps: dpItems.value,
      isNew: !isEditMode.value,
      user: authStore.user, // Pastikan user juga dikirim
    };
    const response = await api.post("/so-form/save", payload);
    header.value.nomor = response.data.nomor;
    toast.success(response.data.message);
    markAsSaved();
    const soNomor = response.data.nomor;
    if (soNomor) {
      // 2. Simpan nomor untuk dialog
      printConfirmNomor.value = soNomor;
      // 3. Buka dialog konfirmasi cetak
      isPrintConfirmVisible.value = true;

      // (Kita tidak lagi router.push di sini)
      // router.push('/transaksi/penjualan/surat-pesanan');
    } else {
      // 4. Fallback jika 'nomor' tidak ditemukan di respons
      toast.error("Gagal mendapatkan nomor SO untuk dicetak. Mengarahkan ke daftar.");
      router.push("/transaksi/penjualan/surat-pesanan");
    }
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const handlePrintConfirm = () => {
  if (!printConfirmNomor.value) return;

  try {
    // 1. Resolve URL dari named route 'Cetak Surat Pesanan'
    const routeData = router.resolve({
      name: "Cetak Surat Pesanan", // <-- Nama route dari yang Anda berikan
      params: { nomor: printConfirmNomor.value },
    });

    // 2. Buka URL di tab baru
    window.open(routeData.href, "_blank");
  } catch (error) {
    console.error("Gagal membuka halaman cetak SO:", error);
    toast.error('Gagal membuka halaman cetak. Pastikan route "Cetak Surat Pesanan" ada.');
  } finally {
    // 3. Tutup dialog dan kembali ke halaman browse
    isPrintConfirmVisible.value = false;
    printConfirmNomor.value = "";
    markAsSaved();
    router.push("/transaksi/penjualan/surat-pesanan");
  }
};

// Fungsi ini dipanggil jika user menekan "Tidak, Kembali"
const handlePrintCancel = () => {
  isPrintConfirmVisible.value = false;
  printConfirmNomor.value = "";
  markAsSaved();
  // Langsung kembali ke halaman browse
  router.push("/transaksi/penjualan/surat-pesanan");
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
      kode: "",
      nama: "",
      ukuran: "",
      stok: 0,
      jumlah: null,
      harga: null,
      diskonPersen: 0,
      diskonRp: 0,
      total: 0,
      barcode: "",
      noSoDtf: "",
      noPengajuanHarga: "",
      pin: "",
    });
  }
};

const resetForm = () => {
  // 1. Reset ke default
  header.value = { ...initialHeaderState };

  // 2. Set default gudang & user lagi
  header.value.gudang = {
    kode: authStore.user?.cabang || "",
    nama: authStore.user?.cabangNama || "",
  };
  header.value.salesCounter = authStore.user?.kode || "";

  // 3. [PENTING] Kembalikan mode MP jika user KON
  if (isUserKon.value) {
    applyMarketplaceMode();
  }

  items.value = [];
  dpItems.value = [];
  addNewRow();
  markAsSaved();
};

const removeRow = (id: number) => {
  const item = items.value.find((i) => i.id === id);
  if (item?.isCustomOrder && item.noSoDtf) {
    toast.warning("Item custom ini sudah punya No. SO DTF dan tidak bisa dihapus.");
    return;
  }
  items.value = items.value.filter((item) => item.id !== id);
  calculateTotals();
};

const onGudangSelected = (gudang: { kode: string; nama: string }) => {
  header.value.gudang = gudang;
  isGudangSearchVisible.value = false;
};

const onCustomerSelected = async (rawCustomer: CustomerLookupResult) => {
  isCustomerSearchVisible.value = false;

  // 1. Normalisasi Data (Mapping dari modal ke interface Customer)
  const levelKode = rawCustomer.level_kode || rawCustomer.cus_level || "";
  const isFranchise = rawCustomer.franchise === "Y" || rawCustomer.cus_franchise === "Y";

  // 2. Validasi Dasar
  if (!rawCustomer.kode && !rawCustomer.cus_kode) return;
  if (!levelKode) {
    toast.error("Level Customer tersebut belum di-setting.");
    header.value.customer = null;
    return;
  }

  // 3. Validasi Customer Prioritas (KPR)
  const gudang = header.value.gudang.kode;
  if (gudang === "KPR" && !isFranchise) {
    toast.error("Customer bukan Customer Prioritas.");
    header.value.customer = null;
    return;
  }
  if (gudang !== "KPR" && isFranchise) {
    toast.error("Customer Prioritas hanya bisa transaksi di Store KPR.");
    header.value.customer = null;
    return;
  }

  // 4. Mapping ke Interface Customer secara Lengkap
  // Ini akan menghilangkan error "missing properties"
  const mappedCustomer: Customer = {
    kode: rawCustomer.kode || rawCustomer.cus_kode || "",
    nama: rawCustomer.nama || rawCustomer.cus_nama || "",
    alamat: rawCustomer.alamat || rawCustomer.cus_alamat || "",
    kota: rawCustomer.kota || rawCustomer.cus_kota || "",
    telp: rawCustomer.telp || rawCustomer.cus_telp || "",
    level_kode: levelKode,
    level_nama: rawCustomer.level_nama || rawCustomer.cus_level_nama || "",
    top: Number(rawCustomer.top || rawCustomer.cus_top || 0),
    franchise: isFranchise ? "Y" : "N",
  };

  header.value.customer = mappedCustomer;
  header.value.levelKode = mappedCustomer.level_kode;
  header.value.levelNama = mappedCustomer.level_nama;
  header.value.top = mappedCustomer.top;
  header.value.alamat = mappedCustomer.alamat;
  header.value.kota = mappedCustomer.kota;
  header.value.telp = mappedCustomer.telp;

  await applyDefaultDiscount();
  calculateTotals();
  toast.success(`Customer ${mappedCustomer.nama} berhasil dipilih.`);
};

const onSalesCounterSelected = (salesCounter: { kode: string; nama: string }) => {
  header.value.salesCounter = salesCounter.kode; // Asumsi Anda menyimpan kodenya
  // Jika Anda juga perlu menyimpan nama, tambahkan ref-nya di 'header'
  // header.value.salesCounterNama = salesCounter.nama;
  isSalesCounterSearchVisible.value = false;
};

const onPenawaranSelected = async (penawaran: { nomor: string }) => {
  isPenawaranSearchVisible.value = false;
  isInitialLoad.value = true;
  toast.info(`Memuat detail dari Penawaran ${penawaran.nomor}...`);

  try {
    // 1. Ambil data dari backend dengan parameter cabang untuk kalkulasi stok real-time
    const response = await api.get(`/so-form/lookup/penawaran-details/${penawaran.nomor}`, {
      params: { cabang: header.value.gudang.kode }
    });

    const { header: penHeader, pen_tanggal, details: penDetails, customer, dps } = response.data;

    // 2. Validasi Keberadaan Data
    if (!customer || !customer.kode) {
      toast.error("Gagal memuat data customer dari penawaran tersebut.");
      return;
    }

    // 3. Validasi Level & Hak Akses Gudang (KPR/Franchise)
    if (!customer.level_kode) {
      toast.error(`Level Customer '${customer.nama}' belum di-setting.`);
      return;
    }

    const currentGudang = header.value.gudang.kode;
    const isFranchise = customer.franchise === "Y";

    if (currentGudang === "KPR" && !isFranchise) {
      toast.error(`Customer '${customer.nama}' bukan Customer Prioritas (KPR).`);
      return;
    }
    if (currentGudang !== "KPR" && isFranchise) {
      toast.error(`Customer Prioritas '${customer.nama}' hanya bisa dilayani di Store KPR.`);
      return;
    }

    header.value.tanggal = pen_tanggal;

    // 5. Isi State Header
    header.value.penawaran = penHeader.pen_nomor;
    header.value.customer = customer;
    header.value.levelKode = customer.level_kode || "";
    header.value.levelNama = customer.level_nama || "";
    header.value.alamat = customer.alamat;
    header.value.kota = customer.kota;
    header.value.telp = customer.telp;
    header.value.top = customer.top;
    header.value.keterangan = penHeader.pen_ket;
    header.value.ppnPersen = Number(penHeader.pen_ppn) || 0;

    // 6. Isi State Footer (Diskon & Biaya Kirim)
    footer.value.biayaKirim = Number(penHeader.pen_bkrm) || 0;
    footer.value.diskonRp = Number(penHeader.pen_disc) || 0;
    footer.value.diskonPersen1 = Number(penHeader.pen_disc1) || 0;
    footer.value.diskonPersen2 = Number(penHeader.pen_disc2) || 0;

    // 7. Pemetaan Rincian DP (Down Payment)
    dpItems.value = (dps as DpApiResult[] || []).map((dp) => ({
      ...dp,
      posting: dp.posting || "BELUM",
      fsk: dp.fsk || ""
    }));

    // 8. Pemetaan Item Detail (Termasuk Logika Custom Order)
    items.value = (penDetails as PenawaranDetailApi[]).map((d) => {
      let parsedJson: CustomTechData = {};
      const isCustom = d.pend_custom === 'Y';

      // Parse data teknis jika barang custom
      if (isCustom && d.pend_custom_data) {
        try {
          parsedJson = typeof d.pend_custom_data === 'string'
            ? JSON.parse(d.pend_custom_data)
            : d.pend_custom_data;
        } catch (e) {
          console.error("Gagal parse data teknis custom:", e);
        }
      }

      // Gabungkan daftar ukuran unik untuk tampilan grid
      const ringkasanUkuran = d.pend_ukuran ||
        (parsedJson.ukuranKaos
          ? [...new Set(parsedJson.ukuranKaos.map((u) => u.ukuran))].join(', ')
          : '');

      return {
        id: Date.now() + Math.random(),
        kode: d.pend_kode,
        nama: d.nama_barang, // Membawa nama asli atau nama custom dtf dari backend
        kategori: d.kategori || (isCustom ? 'PESANAN' : 'REGULER'),
        ukuran: ringkasanUkuran,
        stok: Number(d.stok) || 0,
        jumlah: Number(d.pend_jumlah) || 0,
        harga: Number(d.pend_harga) || 0,
        diskonPersen: Number(d.pend_disc) || 0,
        diskonRp: Number(d.pend_diskon) || 0,
        total: Number(d.pend_jumlah) * (Number(d.pend_harga) - Number(d.pend_diskon)),
        barcode: d.barcode || "",
        noSoDtf: d.pend_sd_nomor || "",
        noPengajuanHarga: d.pend_ph_nomor || "",
        pin: "",

        // Flagging Data Custom untuk integrity saat Save SO
        isCustomOrder: isCustom,
        sod_custom: d.pend_custom,
        sod_custom_nama: isCustom ? d.nama_barang : null,
        sod_custom_data: typeof d.pend_custom_data === 'object'
          ? JSON.stringify(d.pend_custom_data)
          : d.pend_custom_data,

        // Data rincian untuk kebutuhan modal JenisOrder (jika di-edit di layar SO)
        ukuranKaos: parsedJson.ukuranKaos || [],
        titikCetak: parsedJson.titikCetak || [],
        sourceItems: parsedJson.sourceItems || []
      };
    });

    // 9. Finalisasi Tampilan Grid
    addNewRow(); // Tambahkan baris kosong di akhir grid
    await nextTick(); // Tunggu Vue merender ulang DOM
    calculateTotals(); // Hitung ulang total, sisa bayar, dan status AKTIF/PASIF
    isInitialLoad.value = false;

    toast.success(`Data Penawaran ${penawaran.nomor} berhasil dimuat.`);
  } catch (error: unknown) {
    console.error("Error onPenawaranSelected:", error);
    if (axios.isAxiosError(error)) {
      toast.error(`Gagal memuat detail Penawaran: ${error.response?.data?.message || error.message}`);
    } else {
      toast.error("Terjadi kesalahan sistem saat memuat data penawaran.");
    }
  }
};

// Ganti dengan fungsi yang sudah terisi lengkap ini
const onProductsSelected = (selectedProducts: SoItemApi[]) => {
  isProductSearchVisible.value = false;
  if (!selectedProducts || selectedProducts.length === 0) return;

  // Hapus baris kosong tempat F1/F2 ditekan
  items.value.splice(activeRowIndex.value, 1);

  selectedProducts.forEach((product) => {
    const kodeUp = product.kode?.toUpperCase() || "";
    const namaUp = product.nama?.toUpperCase() || "";

    // ================================
    // 1️⃣ DETEKSI PRODUK JASA
    // ================================
    const isJasa =
      kodeUp.startsWith("JASA") ||
      kodeUp.startsWith("JS") ||
      kodeUp.includes("FILE") || // <-- LOGIC BARU
      namaUp.includes("JASA") ||
      namaUp.includes("DESAIN") ||
      namaUp.includes("FILE"); // <-- LOGIC BARU

    // ================================
    // 2️⃣ HANDLING KHUSUS JASA
    // ================================
    if (isJasa) {
      // Jasa boleh tanpa ukuran
      product.ukuran = "";

      // Jasa boleh masuk berkali-kali → jangan cek duplikasi barcode
      items.value.push({
        id: Date.now() + Math.random(),
        kode: product.kode,
        nama: product.nama,
        kategori: product.kategori,
        ukuran: "",
        stok: product.stok ?? 0,
        harga: product.harga,
        jumlah: 1,
        diskonPersen: 0,
        diskonRp: 0,
        total: product.harga,
        barcode: product.barcode || product.kode, // fallback
        noSoDtf: "",
        noPengajuanHarga: "",
        pin: "",
        isCustomOrder: false,
        isJasa: true,
      });

      return; // lanjut ke produk berikutnya
    }

    let initHarga = Number(product.harga);

    if (header.value.isMarketplace) {
      initHarga = Number(product.harga3 ?? product.harga ?? 0);
    }

    // ================================
    // 3️⃣ PRODUK NORMAL → CEK DUPLIKASI
    // ================================
    const isDuplicate = items.value.some((item) => item.barcode === product.barcode);
    if (!isDuplicate) {
      items.value.push({
        id: Date.now() + Math.random(),
        kode: product.kode,
        nama: product.nama,
        kategori: product.kategori,
        ukuran: product.ukuran,
        stok: product.stok,
        harga: initHarga,
        jumlah: 1,
        diskonPersen: 0,
        diskonRp: 0,
        total: initHarga * 1,
        barcode: product.barcode,
        noSoDtf: "",
        noPengajuanHarga: "",
        pin: "",
      });
    }
  });

  addNewRow();
  calculateTotals();
};

const onSoDtfSelected = async (soDtf: { nomor: string }) => {
  isSoDtfSearchVisible.value = false;
  // Hapus baris kosong tempat F1 ditekan
  items.value.splice(activeRowIndex.value, 1);

  try {
    const response = await api.get<SoDtfDetail[]>(
      `/offer-form/search/so-dtf-details/${soDtf.nomor}`
    );
    const soDtfDetails = response.data;

    soDtfDetails.forEach((detail, index) => {
      // PERBAIKAN: Tambahkan pengecekan detail.nama
      // Agar jika ukuran sama (L) tapi barang beda (Hitam vs Putih), tidak dianggap duplikat
      const isDuplicate = items.value.some(
        (item) =>
          item.noSoDtf === detail.sd_nomor &&
          item.nama === detail.nama && // <--- Tambahkan Baris Ini
          item.ukuran === detail.ukuran
      );

      if (!isDuplicate) {
        items.value.push({
          // Tambahkan index agar ID benar-benar unik jika diproses sangat cepat
          id: Date.now() + index + Math.random(),
          kode: detail.sd_nomor,
          nama: detail.nama,
          ukuran: detail.ukuran,
          jumlah: detail.jumlah,
          harga: detail.harga,
          total: detail.total,
          noSoDtf: detail.sd_nomor,
          stok: 0,
          diskonPersen: 0,
          diskonRp: 0,
          barcode: "",
          noPengajuanHarga: "",
          pin: "",
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

  const isDuplicate = items.value.some((item) => item.noPengajuanHarga === proposal.nomor);
  if (isDuplicate) {
    toast.error(`No. Pengajuan ${proposal.nomor} sudah diinput di baris lain.`);
    return;
  }

  toast.info(`Memuat detail dari Pengajuan Harga ${proposal.nomor}...`);

  try {
    const response = await api.get<{
      headerData: PriceProposalHeader;
      itemsData: PriceProposalDetail[];
    }>(`/offer-form/search/price-proposal-details/${proposal.nomor}`);
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
        noSoDtf: "",
        pin: "",
      });
    });

    footer.value.diskonRp = headerData.ph_diskon || 0;

    addNewRow();
    calculateTotals();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(
        `Gagal memuat detail Pengajuan ${proposal.nomor}: ${error.response?.data?.message}`
      );
    } else {
      toast.error(`Gagal memuat detail Pengajuan ${proposal.nomor}`);
    }
  }
};

const applyDefaultDiscount = async () => {
  if (header.value.penawaran) return;

  if (header.value.nomorPromo) {
    footer.value.diskonPersen1 = 0;
    return;
  }
  if (!header.value.customer || !header.value.levelKode) return;

  if (isEditMode.value && isInitialLoad.value) {
    return;
  }

  if (footer.value.diskonRp > 0 && footer.value.diskonPersen1 === 0) {
    return; // Berhenti jika SO sudah punya nominal diskon (hasil otorisasi)
  }

  try {
    const response = await api.get("/so-form/lookup/default-discount", {
      params: {
        level: header.value.levelKode,
        total: totalDiscountable.value,
        gudang: header.value.gudang.kode,
        hasPin: footer.value.pinTanpaDp ?? "",
        hasAcc: footer.value.pinDiskon1 ? "Y" : "N",
        penawaran: header.value.penawaran || "",
      },
    });

    const defaultDisc = Number(response.data.discount ?? 0);

    // --- PERBAIKAN DI SINI ---
    // HAPUS baris: if (footer.value.diskonPersen1 && footer.value.diskonPersen1 !== 0) return;

    // Jika total 0 atau di bawah threshold terendah, pastikan diskon reset ke 0
    if (totalDiscountable.value <= 0) {
      footer.value.diskonPersen1 = 0;
      return;
    }

    // Selalu timpa dengan nilai terbaru dari backend (Misal: dari 5 ke 10)
    footer.value.diskonPersen1 = defaultDisc;

  } catch (err) {
    console.error("Gagal ambil diskon default:", err);
  }
};

// const handleDiscount1Change = async () => {
//   // Jangan lakukan apa-apa jika customer belum dipilih
//   if (!header.value.customer || !header.value.customer.level_kode) {
//     return;
//   }

//   try {
//     // 1. Panggil API untuk mendapatkan diskon standar
//     const response = await api.get('/so-form/lookup/default-discount', {
//       params: {
//         level: header.value.customer.level_kode,
//         total: footer.value.totalSo,
//         gudang: header.value.gudang.kode,
//       }
//     });
//     const defaultDiscountValue = response.data.discount;
//     const enteredDiscount = footer.value.diskonPersen1;

//     // 2. Jika diskon yang diinput BERBEDA dari standar, minta otorisasi
//     if (enteredDiscount !== defaultDiscountValue && enteredDiscount > 0) {
//       previousDiscount.value.persen1 = defaultDiscountValue;
//       challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
//       isAuthModalVisible.value = true;
//     } else {
//       calculateTotals();
//     }
//   } catch (error: unknown) {
//     if (axios.isAxiosError(error)) {
//       toast.error('Gagal memvalidasi diskon standar: ' + (error.response?.data?.message || ''));
//     } else {
//       toast.error('Gagal memvalidasi diskon standar.');
//     }
//   }
// };

// // Fungsi untuk menangani perubahan Diskon % 2
// const handleDiscount2Change = () => {
//   if (footer.value.diskonPersen1 <= 0 && footer.value.diskonPersen2 > 0) {
//     toast.error('Diskon % 1 silahkan diisi dulu.');
//     footer.value.diskonPersen2 = 0;
//     return;
//   }
//   if (footer.value.diskonPersen2 > 0) {
//     previousDiscount.value.persen2 = 0;
//     challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
//     isAuth2ModalVisible.value = true;
//   } else {
//     calculateTotals();
//   }
// };

// --- [BARU] Helper Request Authorization ---
const requestAuthorization = (
  title: string,
  jenis: string,
  nominal: number,
  extraData: {
    transaksi?: string;
    barcode?: string;
    keteranganLengkap?: string;
  } | null,
  onSuccess: (data: { authNomor: string; approver: string }) => void,
  onCancel: () => void
) => {
  authDialog.title = title;
  authDialog.jenis = jenis;
  authDialog.nominal = nominal;

  if (extraData) {
    authDialog.transaksi = extraData.transaksi || "";
    authDialog.barcode = extraData.barcode || "";
    authDialog.keterangan = extraData.keteranganLengkap || "";
  } else {
    authDialog.transaksi = "";
    authDialog.barcode = "";
    authDialog.keterangan = "";
  }

  // Wrapper agar modal tertutup sebelum callback dijalankan
  authDialog.onSuccess = (data) => {
    authDialog.show = false;
    onSuccess(data);
  };

  authDialog.onCancel = onCancel;
  authDialog.show = true;
};

// Fungsi untuk menangani update dari Modal Diskon/Biaya
const handleDiscountCostUpdate = (newData: typeof footer.value & { authNomor?: string }) => {
  // 1. Terapkan perubahan ke state footer
  footer.value.diskonPersen1 = newData.diskonPersen1;
  footer.value.diskonPersen2 = newData.diskonPersen2;
  footer.value.diskonRp = newData.diskonRp;
  footer.value.biayaKirim = newData.biayaKirim;

  // 2. Simpan PIN jika ada (dikirim dari modal setelah sukses auth)
  if (newData.pinDiskon1) footer.value.pinDiskon1 = newData.pinDiskon1;
  if (newData.pinDiskon2) footer.value.pinDiskon2 = newData.pinDiskon2;

  if (newData.authNomor) {
    header.value.nomorAuth = newData.authNomor;
  }

  // 3. Hitung ulang Grand Total
  calculateTotals();

  toast.success("Diskon dan biaya berhasil diperbarui.");
};

const handleItemDiscountChange = (index: number) => {
  const item = items.value[index];

  // Exclude jasa/custom/dtf (Sama seperti logika lama)
  if (!isDiscountableItem(item)) {
    item.diskonPersen = 0;
    item.diskonRp = 0;
    calculateTotals();
    return;
  }

  const currentPersen = item.diskonPersen || 0;
  const currentRp = item.diskonRp || 0;

  // Jika diskon diisi (> 0), minta otorisasi
  if (currentPersen > 0 || currentRp > 0) {
    // Hitung nominal diskon item ini
    let nominalAuth = 0;
    if (currentRp > 0) {
      nominalAuth = currentRp * (item.jumlah || 1);
    } else {
      nominalAuth = (((item.harga || 0) * currentPersen) / 100) * (item.jumlah || 1);
    }

    const info = `Cust: ${header.value.customer?.nama || "Umum"}\nItem: ${item.nama}\nDiskon: ${currentPersen > 0 ? currentPersen + "%" : formatRupiah(currentRp)
      }`;

    requestAuthorization(
      "Otorisasi Diskon Item",
      "DISKON_ITEM",
      nominalAuth,
      {
        transaksi: header.value.nomor || "DRAFT SO",
        barcode: item.barcode,
        keteranganLengkap: info,
      },
      (authResult) => {
        item.pin = authResult.approver; // Simpan Approver
        if (authResult.authNomor) {
          header.value.nomorAuth = authResult.authNomor;
        }
        calculateTotals();
        toast.success("Diskon item disetujui.");
      },
      () => {
        // Batal: Reset ke 0
        item.diskonPersen = 0;
        item.diskonRp = 0;
        calculateTotals();
        toast.info("Diskon item dibatalkan.");
      }
    );
  } else {
    calculateTotals();
  }
};

const openDpInput = () => {
  if (!header.value.customer) {
    return toast.error("Customer harus diisi terlebih dahulu.");
  }
  isDpInputVisible.value = true;
};

const onDpSaved = (newDp: DpItem) => {
  dpItems.value.push(newDp);
  calculateTotals();

  // Pastikan minimal DP diupdate berdasarkan jenis item yang ada
  const containsCustomOrder = items.value.some((i) => i.isCustomOrder);
  const containsDtf = items.value.some((i) => i.noSoDtf);

  if (containsCustomOrder || containsDtf) {
    footer.value.minimalDp = 0.5 * footer.value.netto;
  } else {
    footer.value.minimalDp = 0.3 * footer.value.netto;
  }

  // Refresh status SO setelah DP masuk
  const totalDp = footer.value.totalDp;
  header.value.statusSo = totalDp >= footer.value.minimalDp ? "AKTIF" : "PASIF";
};

const removeDpRow = (itemToRemove: DpItem) => {
  dpItems.value = dpItems.value.filter((item) => item.nomor !== itemToRemove.nomor);
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
  router.push("/transaksi/penjualan/surat-pesanan");
};

const onNewCustomerSaved = (newCustomer: Customer) => {
  // Panggil onCustomerSelected untuk menjalankan semua validasi & mengisi form
  onCustomerSelected(newCustomer);
};

const handleBarcodeScan = async () => {
  if (!header.value.customer?.kode) {
    // Ganti 'header.value.customer?.kode' jika perlu
    toast.error("Pilih customer terlebih dahulu sebelum scan barcode!");
    return; // Hentikan fungsi jika customer belum dipilih
  }
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  // --- LOGIKA 1: Jika barang sudah ada di grid, tambah jumlahnya ---
  const existingItem = items.value.find((item) => item.barcode === barcode && item.kode);
  if (existingItem) {
    existingItem.jumlah += 1;
    // Panggil fungsi untuk hitung ulang total jika ada
    // calculateTotals();
    toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
    scannedBarcode.value = ""; // Kosongkan input untuk scan berikutnya
    return;
  }

  // --- LOGIKA 2: Jika barang belum ada, cari via API dan tambahkan baris baru ---
  try {
    // Panggil API baru yang kita buat
    const response = await api.get(`/so-form/by-barcode/${barcode}`, {
      params: { gudang: header.value.gudang.kode }, // Sesuaikan dengan cara Anda menyimpan kode gudang
    });

    const product = response.data;

    let initHarga = Number(product.harga);
    if (header.value.isMarketplace) {
      initHarga = Number(product.harga3 || 0);
    }

    // Cari baris kosong pertama untuk diganti
    const emptyRowIndex = items.value.findIndex((item) => !item.kode);

    if (emptyRowIndex !== -1) {
      // Ganti baris kosong dengan data produk baru
      items.value.splice(emptyRowIndex, 1, {
        id: Date.now(),
        kode: product.kode as string,
        nama: product.nama as string,
        ukuran: product.ukuran as string,
        kategori: product.kategori as string,
        stok: Number(product.stok),
        harga: initHarga,
        jumlah: 1, // Default jumlah 1
        diskonPersen: 0,
        diskonRp: 0,
        total: initHarga * 1,
        barcode: product.barcode as string,
        noSoDtf: "", // default kosong
        noPengajuanHarga: "", // default kosong
        pin: "", // default kosong
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
    scannedBarcode.value = "";
  }
};

// const saveJenisOrder = async () => {
//   dialogs.jenisOrder = false;
//   if (!formJenisOrder.jenis) {
//     toast.error("Pilih jenis order terlebih dahulu.");
//     return;
//   }

//   header.value.jenisOrder = formJenisOrder.jenis;
//   header.value.ukuranOrder = formJenisOrder.ukuran;
//   header.value.titikOrder = formJenisOrder.titik;

//   // update DP minimal
//   if (formJenisOrder.jenis.toUpperCase().includes("CUSTOM")) {
//     footer.value.minimalDp = 0.5 * footer.value.netto;
//     toast.info("Minimal DP diubah menjadi 50% karena jenis order custom.");
//   } else {
//     footer.value.minimalDp = 0.3 * footer.value.netto;
//   }

//   // Hitung ulang harga otomatis via backend
//   try {
//     const { data } = await api.post("/so-form/hitung-harga", {
//       jenis: formJenisOrder.jenis,
//       ukuran: formJenisOrder.ukuran,
//       titik: formJenisOrder.titik,
//       items: items.value,
//     });
//     items.value = data.items;
//     calculateTotals();
//     toast.success("Harga berhasil diperbarui berdasarkan jenis order.");
//   } catch (err) {
//     toast.error("Gagal menghitung harga custom.", err);
//   }
// };

const handleJenisOrderSaved = (data: JenisOrderSaved) => {
  header.value.jenisOrderKode = data.jenisOrder;
  header.value.jenisOrderNama = data.namaOrder;
  header.value.namaDtf = data.namaOrder;

  // ==============================
  // 🔥 Snapshot item KO sebelum ditambah custom
  // ==============================
  const sourceItems = JSON.parse(
    JSON.stringify(
      items.value
        .filter((i) => !i.isCustomOrder && i.kode !== "CUSTOM")
        .map((i) => ({
          kode: i.kode,
          nama: i.nama,
          ukuran: i.ukuran,
          jumlah: i.jumlah,
        }))
    )
  );

  // ==============================
  // 🔥 Push item custom
  // ==============================
  const qty = data.totalJumlah || 0;
  const totalHarga = data.totalHarga || 0;
  const hargaPerPcs = qty > 0 ? Math.round(totalHarga / qty) : 0;

  items.value.push({
    id: Date.now() + Math.random(),
    kode: "CUSTOM",
    nama: data.namaOrder,
    ukuran: "",
    stok: 0,

    jumlah: qty,
    harga: hargaPerPcs, // ✔ harga per pcs
    diskonPersen: 0,
    diskonRp: 0,

    total: hargaPerPcs * qty, // ✔ sesuai qty × harga per pcs

    barcode: "",
    noSoDtf: "",
    noPengajuanHarga: "",
    pin: "",
    isCustomOrder: true,
    sod_custom: "Y",
    sod_custom_nama: data.namaOrder,
    sod_custom_data: JSON.stringify({
      ukuranKaos: data.ukuranKaos,
      titikCetak: data.titikCetak,
      hargaPerCm: data.hargaPerCm,
      totalHarga: totalHarga, // simpan total original
      sourceItems: sourceItems,
    }),

    ukuranKaos: data.ukuranKaos || [],
    titikCetak: data.titikCetak || [],
    sourceItems: sourceItems,
  });

  calculateTotals();
  dialogs.jenisOrder = false;
  toast.success("Jenis Order Custom berhasil ditambahkan ke daftar item.");
};

const loadJenisOrder = async () => {
  loadingJenisOrder.value = true;
  try {
    const { data } = await api.get("/so-form/lookup/jenis-order");
    console.log("📦 Jenis Order:", data);
    jenisOrderList.value = data;
  } catch (err) {
    console.error("❌ Gagal load jenis order:", err);
  } finally {
    loadingJenisOrder.value = false;
  }
};

const openJenisOrderModal = () => {
  // 🔹 Validasi 1: Pastikan customer dipilih
  if (!header.value.customer) {
    toast.error("Pilih customer terlebih dahulu sebelum input jenis order.");
    return;
  }

  // 🔹 Validasi 2: Pastikan ada penawaran atau tabel item sudah keisi
  const hasPenawaran = !!header.value.penawaran;
  const hasItems = items.value.some((it) => it.kode && it.nama);

  if (!hasPenawaran && !hasItems) {
    toast.error("Isi detail barang dari Penawaran terlebih dahulu sebelum input jenis order.");
    return;
  }

  // ✅ Semua aman, buka modal
  dialogs.jenisOrder = true;
};

const openSoDtfInNewTab = (item: SoItem) => {
  const url = router.resolve({
    path: "/transaksi/penjualan/dtf/so-dtf/new",
    query: { ref: item.kode || "" },
  }).href;
  window.open(url, "_blank"); // buka tab baru
};

// [BARU] Fetch Data Promo Aktif saat Mounted
const fetchActivePromos = async () => {
  try {
    // Kita gunakan endpoint lookup yang sama dengan invoice karena logiknya sama
    const response = await api.get("/invoice-form/lookup/active-promos", {
      params: { tanggal: header.value.tanggal, cabang: header.value.gudang.kode },
    });
    activePromosList.value = (response.data ?? []) as ActivePromo[];
  } catch (error) {
    console.error("Gagal memuat daftar promo:", error);
  }
};

const isItemPromoEligible = (item: SoItem) => {
  const isReguler = item.kategori === "REGULER";
  const isJersey = item.nama?.toUpperCase().includes("JERSEY");
  const isDtf = !!item.noSoDtf; // Produk dengan nomor SO DTF masuk kriteria

  return isReguler || isJersey || isDtf;
};

// [BARU] Handle Promo Terpilih dari Modal F1
const onPromoSelected = (promo: { nomor: string; namaPromo: string }) => {
  // Jika promo barang (beli 3 100rb), reset grid
  if (promo.nomor === "PRO-2025-005" && items.value.some((i) => i.kode)) {
    showConfirmation(() => {
      header.value.nomorPromo = promo.nomor;
      header.value.namaPromo = promo.namaPromo;
      footer.value.diskonPersen1 = 0; // Hapus diskon member
      footer.value.diskonPersen2 = 0;
      footer.value.diskonRp = 0; // Hapus diskon manual/bulanan
      items.value = []; // Kosongkan grid
      addNewRow();
      dialogs.promoSearch = false;
      closeConfirmDialog();
    }, "Menerapkan promo ini akan menghapus semua barang di keranjang. Lanjutkan?");
  } else {
    header.value.nomorPromo = promo.nomor;
    header.value.namaPromo = promo.namaPromo;
    footer.value.diskonPersen1 = 0; // Hapus diskon member
    footer.value.diskonPersen2 = 0;
    footer.value.diskonRp = 0; // Hapus diskon manual/bulanan
    dialogs.promoSearch = false;
  }
};

// [PERBAIKAN] Ganti 'any' dengan tipe data spesifik
const handleBonusSelection = (bonusItem: BonusItemSelection) => {
  dialogs.promoBonus = false;

  items.value.push({
    id: Date.now(),
    kode: bonusItem.kode,
    nama: `${bonusItem.nama} #BONUS`,
    ukuran: bonusItem.ukuran,
    stok: bonusItem.stok,

    // Pastikan qty diambil dari state promo
    jumlah: activePromoForBonus.value.qty,

    harga: 0,
    diskonPersen: 0,
    diskonRp: 0,
    total: 0,
    barcode: "",
    noSoDtf: "",
    noPengajuanHarga: "",
    pin: "",

    // Flagging
    isCustomOrder: false,
    terhitungPromo: true, // [PENTING] Set true agar lolos validasi harga 0
  });

  addNewRow();
  calculateTotals();
};

// const applyPromoToItems = async (promoNomor: string) => {
//   if (!promoNomor) return;

//   try {
//     // [PERBAIKAN] Tambahkan Generic <PromoItemRule[]> agar response ter-typing
//     const { data } = await api.get<PromoItemRule[]>(`/invoice-form/lookup/promo-items/${promoNomor}`);
//     const promoItems = data || [];

//     items.value.forEach(item => {
//       // Logic match item dengan aturan promo
//       // [PERBAIKAN] Hapus ': any', TypeScript sekarang tahu tipe 'p' adalah PromoItemRule
//       const match = promoItems.find(p => p.kode === item.kode && p.ukuran === item.ukuran);

//       if (match) {
//         const harga = item.harga || 0;
//         const diskonPersen = match.discPersen || 0;
//         const diskonRp = match.discRp || (harga * diskonPersen / 100);

//         item.diskonPersen = diskonPersen;
//         item.diskonRp = diskonRp;

//         // [PERBAIKAN] Set flag ini agar validasi save tidak error saat harga jadi 0/murah
//         item.terhitungPromo = true;

//         // Update total baris
//         item.total = (item.jumlah || 0) * (harga - diskonRp);
//       }
//     });

//     calculateTotals();
//   } catch (err) {
//     console.error('Gagal menerapkan promo item:', err);
//   }
// };

// [BARU] Cek Kelayakan Promo Real-time (Untuk Notifikasi)
const checkRealtimePromoEligibility = async (): Promise<boolean> => {
  // --- PROTEKSI AWAL ---
  // 1. Jangan tampilkan dialog promo jika ini dari Penawaran atau cabang KDC
  if (header.value.penawaran || authStore.user?.cabang === "KDC") {
    promoNotification.value = "";
    potentialPromoDiscount.value = 0;
    return false;
  }

  // 2. Proteksi PIN Otorisasi: Jangan pernah timpa nilai jika sudah ada otorisasi manual
  if (footer.value.pinDiskon1 || footer.value.pinDiskon2) {
    return true;
  }

  // 3. Penanganan Mode Edit saat awal pemuatan data
  if (isEditMode.value && isInitialLoad.value) {
    return !!header.value.nomorPromo;
  }

  // Reset Notifikasi & State Promo
  promoNotification.value = "";
  potentialPromoDiscount.value = 0;
  isGrandOpeningPromo.value = false;

  const validItems = items.value.filter((i) => i.kode);
  if (validItems.length === 0) return false;

  // Variabel penampung hasil hitungan
  let currentCalculatedDiscount = 0;
  let message = "";
  let promoCandidate: ActivePromo | null = null;

  // --- [PRIORITAS 1] LOGIKA PROMO FEBRUARI 2026 (PRO-2026-001) ---
  const totalEligibleFeb = validItems.reduce((sum, item) => {
    return isItemPromoEligible(item) ? sum + (item.total || 0) : sum;
  }, 0);

  const promo2026 = activePromosList.value.find((p) => p.pro_nomor === "PRO-2026-001");

  if (promo2026) {
    if (totalEligibleFeb >= 200000) {
      // Kondisi Kelipatan 20rb per 200rb
      const kelipatan = Math.floor(totalEligibleFeb / 200000);
      currentCalculatedDiscount = 20000 * kelipatan;
      message = `🎉 PROMO FEBRUARI! Anda berhak Potongan Kelipatan Rp ${formatRupiah(currentCalculatedDiscount)}!`;
      promoCandidate = promo2026;
    }
    else if (totalEligibleFeb >= 150000) {
      // Kondisi Flat 15rb
      currentCalculatedDiscount = 15000;
      const toNextLevel = 200000 - totalEligibleFeb;
      message = `✨ PROMO FEBRUARI: Dapat potongan Rp 15.000! (Tambah Rp ${formatRupiah(toNextLevel)} lagi untuk diskon kelipatan)`;
      promoCandidate = promo2026;
    }
    else if (totalEligibleFeb >= 100000) {
      // UPSELLING: Biar kartu tidak hilang saat belanja di atas 100rb
      const shortage = 150000 - totalEligibleFeb;
      message = `💡 Tambah belanja Rp ${formatRupiah(shortage)} lagi untuk dapat DISKON Rp 15.000! (Reguler/Jersey/DTF)`;
      currentCalculatedDiscount = 0;
    }
  }

  // --- [PRIORITAS 2] FALLBACK KE PROMO DESEMBER 2025 (Jika Februari belum dapet diskon riil) ---
  if (currentCalculatedDiscount === 0 && !message.includes("💡")) {
    const promo010 = activePromosList.value.find((p) => p.pro_nomor === "PRO-2025-010");
    const promo008 = activePromosList.value.find((p) => p.pro_nomor === "PRO-2025-008");

    // Hitung total reguler lama (Exclude Jersey & DTF sesuai kriteria lama)
    const totalRegulerDec = validItems.reduce((sum, item) => {
      if (item.kategori === "REGULER" && !item.nama?.toUpperCase().includes("JERSEY") && !item.noSoDtf) {
        return sum + (item.total || 0);
      }
      return sum;
    }, 0);

    if (promo010 && totalRegulerDec >= 250000) {
      const kelipatan = Math.floor(totalRegulerDec / 250000);
      currentCalculatedDiscount = 25000 * kelipatan;
      message = `🎉 SELAMAT! Transaksi ini berhak Potongan Kelipatan Rp ${formatRupiah(currentCalculatedDiscount)}!`;
      promoCandidate = promo010;
    } else if (promo008 && totalRegulerDec >= promo008.pro_totalrp) {
      currentCalculatedDiscount = promo008.pro_disrp * Math.floor(totalRegulerDec / promo008.pro_totalrp);
      message = `✨ DISKON BULANAN: Anda berhak potongan Rp ${formatRupiah(currentCalculatedDiscount)}`;
      promoCandidate = promo008;
    }
  }

  // --- FINALISASI UPDATE UI & DIALOG ---
  if (message) {
    promoNotification.value = message;
    potentialPromoDiscount.value = currentCalculatedDiscount;

    // 1. Jika promo sudah terpasang (Auto-Update nominal jika belanja bertambah/berkurang)
    const autoPromoIds = ["PRO-2025-008", "PRO-2025-010", "PRO-2026-001"];
    if (header.value.nomorPromo && autoPromoIds.includes(header.value.nomorPromo)) {
      if (promoCandidate && header.value.nomorPromo === promoCandidate.pro_nomor) {
        footer.value.diskonRp = currentCalculatedDiscount;
      } else if (currentCalculatedDiscount === 0) {
        // Hapus promo jika syarat minimal belanja tidak terpenuhi lagi (setelah dikurangi barang)
        header.value.nomorPromo = "";
        header.value.namaPromo = "";
        footer.value.diskonRp = 0;
        lastSuggestedPromo.value = "";
      }
      return true;
    }

    // 2. Jika diskon riil tersedia (>0) dan belum diterapkan, munculkan Dialog Konfirmasi
    if (currentCalculatedDiscount > 0 && promoCandidate && lastSuggestedPromo.value !== promoCandidate.pro_nomor) {
      pendingPromoData.nomor = promoCandidate.pro_nomor;
      pendingPromoData.nama = promoCandidate.pro_judul;
      pendingPromoData.diskon = currentCalculatedDiscount;

      isPromoConfirmVisible.value = true;
      lastSuggestedPromo.value = promoCandidate.pro_nomor;
    }
    return true;
  }

  return false;
};

const usePromoDiscount = () => {
  header.value.nomorPromo = pendingPromoData.nomor;
  header.value.namaPromo = pendingPromoData.nama;
  footer.value.diskonRp = pendingPromoData.diskon;

  // Matikan diskon member jika pilih promo
  footer.value.diskonPersen1 = 0;
  footer.value.diskonPersen2 = 0;

  isPromoConfirmVisible.value = false;
  calculateTotals();
  toast.success(`Promo ${pendingPromoData.nama} berhasil diterapkan.`);
};

const useMemberDiscount = () => {
  header.value.nomorPromo = "";
  header.value.namaPromo = "";

  // --- PERBAIKAN: Reset nominal agar tidak memblokir pencarian diskon member ---
  footer.value.diskonRp = 0;
  footer.value.pinDiskon1 = undefined;
  // --------------------------------------------------------------------------------------

  isPromoConfirmVisible.value = false;

  // Panggil hitung diskon member (tiering) secara manual
  applyDefaultDiscount();

  // Hitung ulang total untuk sinkronisasi footer
  calculateTotals();

  toast.info("Menggunakan diskon member standar.");
};

// [BARU] Handler untuk menambah DP dari pencarian di DpListModal
const handleAddDp = (newDp: { nomor: string; jenis: string; nominal: number }) => {
  // 1. Cek Duplikasi
  if (dpItems.value.some((dp) => dp.nomor === newDp.nomor)) {
    toast.warning("DP/Setoran ini sudah ditambahkan.");
    return;
  }

  // 2. Tambahkan ke state dpItems
  dpItems.value.push({
    nomor: newDp.nomor,
    jenis: newDp.jenis,
    nominal: newDp.nominal,
    posting: "BELUM", // Default status
    fsk: "", // Default kosong
  });

  // 3. Hitung Ulang Total & Update UI
  calculateTotals();
  toast.success("DP berhasil ditambahkan.");

  // (Opsional) Trigger unsaved changes
  uiStore.setUnsavedChanges(true);
};

const getCategoryColor = (kategori: string | undefined) => {
  const k = (kategori || "").toUpperCase();
  switch (k) {
    case "SESIONAL":
      return "orange-darken-2";
    case "PESANAN":
      return "blue-darken-2";
    case "REGULER":
      return "green-darken-2";
    default:
      return "grey-lighten-1";
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
    // parseDate sekarang sudah aman menangani string maupun object
    const date = parseDate(newTanggal);
    if (isValid(date)) {
      header.value.tempo = format(addDays(date, Number(newTop) || 0), "yyyy-MM-dd");
    }
  },
  { immediate: true }
);

watch(
  () => dialogs.jenisOrder,
  (val) => {
    if (val) loadJenisOrder();
  }
);

watch(totalDiscountable, async () => {
  await applyDefaultDiscount();
});

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [header, items, footer, dpItems],
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isLoading.value || isSaving.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Customer atau Sales dipilih
    const hasHeader = header.value.customer !== null || header.value.salesCounter !== "";

    // 2. Items: Ada item valid (kode terisi)
    const hasItems = items.value.some((i) => i.kode !== "");

    // 3. DP: Ada data DP
    const hasDp = dpItems.value.length > 0;

    if (hasHeader || hasItems || hasDp) {
      uiStore.setUnsavedChanges(true);
    } else {
      // Jika kembali kosong bersih
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

onMounted(() => {
  if (isUserKon.value) {
    applyMarketplaceMode();
  }

  markAsSaved();
  // Cek hak akses 'insert' (untuk baru) atau 'edit' (untuk ubah)
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(
      `Anda tidak memiliki izin untuk ${isEditMode.value ? "mengubah" : "membuat"} data ini.`
    );
    router.back(); // Lempar user kembali ke halaman sebelumnya
    return;
  }

  if (isEditMode.value) {
    loadDataForEdit(route.params.nomor as string);
  } else {
    resetForm();
    isLoading.value = false;
  }
  fetchActivePromos();
});

onMounted(async () => {
  try {
    loadingJenisOrder.value = true;
    const { data } = await api.get("/so-form/lookup/jenis-order"); // tanpa params
    jenisOrderList.value = data;
  } catch (error) {
    console.error("Gagal mengambil jenis order:", error);
  } finally {
    loadingJenisOrder.value = false;
  }
});

onMounted(() => {
  window.addEventListener("keydown", handleGlobalShortcuts);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalShortcuts);
});
const blockedSelectors = [".so-dtf-field", ".pengajuan-field"];
const handleGlobalShortcuts = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;

  // Jika fokus di input SO DTF atau Pengajuan Harga → blok F1 global
  if (blockedSelectors.some((sel) => target.closest(sel))) {
    return;
  }

  if (e.code === "F1") {
    e.preventDefault();
    openProductSearch(activeRowIndex.value, false);
  }

  if (e.code === "F2") {
    e.preventDefault();
    openProductSearch(activeRowIndex.value, true);
  }
};

const stopAndOpenSoDtf = (index: number) => {
  event?.stopImmediatePropagation?.(); // ⛔ blok F1 global
  openSoDtfSearch(index);
};

const stopAndOpenPriceProposal = (index: number) => {
  event?.stopImmediatePropagation?.(); // ⛔ blok F1 global
  openPriceProposalSearch(index);
};
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-file-document-edit-outline">
    <template #header-actions>
      <v-btn color="secondary" size="small" prepend-icon="mdi-tshirt-crew-outline"
        :disabled="!header.customer && !header.penawaran" @click="openJenisOrderModal">
        Input Jenis Order
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save" @click="save" :loading="isSaving"
        :disabled="isSaving || isSavingDisabled">
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-cancel"
        @click="showConfirmation(resetForm, 'Batalkan perubahan dan kosongkan form?')">
        Batal
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="
        showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')
        ">
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">
      <!-- Kolom Kiri -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <template v-if="header.isMarketplace">
            <div class="bg-orange-lighten-5 pa-2 mb-3 rounded border border-dashed border-orange">
              <div class="text-subtitle-2 font-weight-bold text-orange-darken-4 mb-2 d-flex align-center">
                <v-icon size="small" class="mr-1">mdi-store</v-icon>
                MODE PESANAN MARKETPLACE
              </div>
              <v-row dense>
                <v-col cols="6">
                  <v-text-field label="Nomor Pesanan Marketplace" v-model="header.mpNomorPesanan" variant="outlined"
                    density="compact" prepend-inner-icon="mdi-clipboard-text" hide-details bg-color="white"
                    placeholder="Paste No. Pesanan" />
                </v-col>
                <v-col cols="6">
                  <v-text-field label="Nomor Resi (AWB)" v-model="header.mpResi" variant="outlined" density="compact"
                    prepend-inner-icon="mdi-barcode" hide-details bg-color="white" placeholder="Scan Resi" />
                </v-col>
              </v-row>
            </div>
          </template>
          <v-row dense>
            <v-col cols="5">
              <v-text-field label="Gudang" :disabled="!!header.penawaran" :model-value="header.gudang.kode" readonly
                @click="openGudangSearch" :class="{ 'field-disabled': isEditMode }" variant="outlined" density="compact"
                hide-details append-inner-icon="mdi-magnify" />
            </v-col>
            <v-col cols="7">
              <v-text-field :model-value="header.gudang.nama" readonly filled density="compact" hide-details />
            </v-col>
            <v-col cols="6"><v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact"
                hide-details /></v-col>
            <v-col cols="6">
              <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined" density="compact"
                hide-details :readonly="isEditMode" :min="!isEditMode ? format(new Date(), 'yyyy-MM-dd') : undefined"
                :max="!isEditMode ? format(new Date(), 'yyyy-MM-dd') : undefined" />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Customer" :disabled="!!header.penawaran" :model-value="header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''
                " readonly @click="isCustomerSearchVisible = true" variant="outlined" density="compact" hide-details
                append-inner-icon="mdi-magnify">
                <template #prepend-inner>
                  <v-btn :disabled="!!header.penawaran" icon="mdi-account-plus" size="x-small" variant="tonal"
                    class="me-2" @click.stop="isNewCustomerFormVisible = true" title="Buat Customer Baru"></v-btn>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="6"><v-text-field label="Dateline" v-model="header.dateline" type="date" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="12">
              <v-text-field label="Alamat" :model-value="header.customer?.alamat" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Kota / Telp" :model-value="header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''
                " readonly filled density="compact" hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Level" v-model="header.levelNama" readonly filled density="compact" hide-details />
            </v-col>
            <v-col cols="6" v-if="!header.isMarketplace">
              <v-text-field label="No. Penawaran" v-model="header.penawaran" readonly @click="openPenawaranSearch"
                variant="outlined" density="compact" hide-details append-inner-icon="mdi-magnify" clearable
                @click:clear="header.penawaran = ''" />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Sales Counter" v-model="header.salesCounter" readonly @click="openSalesCounterSearch"
                variant="outlined" density="compact" hide-details append-inner-icon="mdi-magnify" />
            </v-col>
            <v-col cols="2">
              <v-text-field label="TOP" v-model.number="header.top" type="number" variant="outlined" density="compact"
                hide-details class="text-end" />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Tempo/Tgl" v-model="header.tempo" type="date" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="4">
              <v-text-field label="PPN %" v-model.number="header.ppnPersen" type="number" variant="outlined"
                density="compact" hide-details class="text-end" />
            </v-col>
            <v-col cols="12"><v-text-field label="Keterangan" v-model="header.keterangan" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="4" v-if="!header.isMarketplace">
              <v-text-field label="Promo" v-model="header.nomorPromo" @click="dialogs.promoSearch = true"
                prepend-inner-icon="mdi-ticket-percent" density="compact" hide-details placeholder="F1..." readonly />
            </v-col>
            <v-col cols="8" v-if="!header.isMarketplace">
              <v-text-field label="Nama Promo" v-model="header.namaPromo" density="compact" readonly filled
                hide-details />
            </v-col>
          </v-row>
        </div>
        <div class="desktop-form-section status-section" v-if="!header.isMarketplace">
          <v-alert density="compact" variant="tonal" :color="header.statusSo === 'AKTIF' ? 'success' : 'error'"
            class="mb-2 d-flex align-center">
            Status SO: <strong>{{ header.statusSo }}</strong>
            <v-spacer />
            <div class="text-caption text-center">{{ minimalDpText }}</div>
            <v-tooltip location="bottom">
              <template #activator="{ props }">
                <v-icon v-bind="props" :color="footer.totalDp >= footer.minimalDp || footer.pinTanpaDp ? 'success' : 'warning'
                  ">
                  {{
                    footer.totalDp >= footer.minimalDp || footer.pinTanpaDp
                      ? "mdi-check-circle"
                      : "mdi-alert-circle"
                  }}
                </v-icon>
              </template>
              <span>{{ statusDpText }}</span>
            </v-tooltip>
          </v-alert>
        </div>
      </div>

      <!-- Kolom Kanan -->
      <div class="right-column">
        <div class="scanner-wrapper">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
            placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
            prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan">
          </v-text-field>
        </div>
        <!-- Wrapper untuk bagian yang bisa scroll -->
        <div class="scrollable-content">
          <div class="desktop-form-section main-grid-section">
            <v-data-table :headers="mainTableHeaders" :items="items" :page="page" :items-per-page="rowsPerPage"
              :item-key="'id'" class="desktop-table vertically-aligned-table" fixed-header
              :item-class="(item) => (item.isCustomOrder ? 'custom-row' : '')">
              <template #[`item.kode`]="{ item, index }">
                <div class="d-flex align-center">
                  <v-icon v-if="item.isCustomOrder" color="blue" size="18" class="me-2"
                    title="Item Custom (Jenis Order)">
                    mdi-tshirt-crew-outline
                  </v-icon>

                  <v-text-field v-model="item.kode" @focus="activeRowIndex = index" @click="activeRowIndex = index"
                    variant="underlined" density="compact" hide-details placeholder="F1/F2..."
                    :disabled="item.isCustomOrder"
                    @keydown.f1.prevent="!item.isCustomOrder && openProductSearch(index, false)"
                    @keydown.f2.prevent="!item.isCustomOrder && openProductSearch(index, true)" />
                </div>
              </template>
              <template #[`item.nama`]="{ item }">
                <div class="product-name-cell">{{ item.nama }}</div>
              </template>
              <template #[`item.kategori`]="{ item }">
                <div v-if="!item.isCustomOrder && item.kode">
                  <v-chip size="x-small" :color="getCategoryColor(item.kategori)" variant="flat"
                    class="font-weight-bold text-white">
                    {{ item.kategori || "TANPA KATEGORI" }}
                  </v-chip>
                </div>
              </template>
              <template #[`item.jumlah`]="{ item }">
                <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" density="compact"
                  hide-details class="text-end" :disabled="!item.kode" />
              </template>
              <template #[`item.harga`]="{ item }">
                <v-text-field v-model.number="item.harga" type="number" variant="underlined" density="compact"
                  hide-details class="text-end" placeholder="0" :disabled="!item.kode"
                  :readonly="!!item.noSoDtf || !!item.noPengajuanHarga" @update:model-value="calculateTotals" />
              </template>
              <template #[`item.diskonPersen`]="{ item, index }">
                <v-text-field v-model.number="item.diskonPersen" type="number" variant="underlined" density="compact"
                  hide-details class="text-end" @blur="handleItemDiscountChange(index)" />
              </template>
              <template #[`item.diskonRp`]="{ item }">
                <v-text-field :value="focusedRowId === item.id ? item.diskonRp : formatRupiah(item.diskonRp || 0)
                  " @input="
                    item.diskonRp = Number(String($event.target.value).replace(/[^0-9]/g, '')) || 0
                    " @focus="focusedRowId = item.id" @blur="
                      focusedRowId = -1;
                    handleItemDiscountChange(items.indexOf(item));
                    " placeholder="0" type="text" variant="underlined" density="compact" hide-details single-line
                  class="text-end" :disabled="!item.kode" :readonly="item.diskonPersen > 0"></v-text-field>
              </template>
              <template #[`item.total`]="{ item }">
                <div class="text-end text-body-2 font-weight-bold">
                  {{ formatRupiah(item.total || 0) }}
                </div>
              </template>
              <template #[`item.noSoDtf`]="{ item, index }">
                <v-row dense align="center" no-gutters>
                  <v-col>
                    <v-text-field class="so-dtf-field" v-model="item.noSoDtf" variant="underlined" density="compact"
                      hide-details placeholder="F1..." @mousedown.stop @click.stop
                      @keydown.f1.stop.prevent="stopAndOpenSoDtf(index)" />
                  </v-col>

                  <!-- Tombol untuk grid jasa custom -->
                  <v-col cols="auto" v-if="item.isCustomOrder">
                    <v-btn icon="mdi-plus-circle" size="x-small" color="primary" variant="text"
                      @click="openSoDtfInNewTab(item)" title="Buat SO DTF Baru" />
                  </v-col>
                </v-row>
              </template>
              <template #[`item.noPengajuanHarga`]="{ item, index }">
                <v-text-field class="pengajuan-field" v-model="item.noPengajuanHarga" variant="underlined"
                  density="compact" hide-details placeholder="F1..." @mousedown.stop @click.stop
                  @keydown.f1.stop.prevent="stopAndOpenPriceProposal(index)">
                </v-text-field>
              </template>
              <template #[`item.actions`]="{ item }">
                <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                  @click="removeRow(item.id)" title="Hapus baris" />
              </template>
            </v-data-table>
            <v-slide-y-transition>
              <div v-if="promoNotification" class="promo-card-wrapper mb-2 mt-2">
                <div class="promo-card" :class="{ 'grand-opening-style': isGrandOpeningPromo }">
                  <div class="card-texture"></div>
                  <div class="card-shine"></div>
                  <div class="card-content">
                    <div class="icon-container">
                      <div class="icon-circle pulse-animation">
                        <v-icon :icon="isGrandOpeningPromo ? 'mdi-party-popper' : 'mdi-ticket-percent-outline'
                          " size="24" color="white" />
                      </div>
                    </div>
                    <div class="text-container">
                      <div class="promo-label">
                        <v-icon icon="mdi-star-four-points" size="10" class="mr-1" color="yellow-lighten-3" />
                        {{ isGrandOpeningPromo ? "SPECIAL OFFER" : "YAYY!! DAPET DISKON!!!" }}
                      </div>
                      <div class="promo-message">{{ promoNotification }}</div>
                    </div>
                    <div class="action-container">
                      <div class="status-chip"><span class="pulse-dot"></span> Auto-Applied</div>
                    </div>
                  </div>
                </div>
              </div>
            </v-slide-y-transition>
          </div>

          <div class="so-sticky-footer">
            <div class="footer-col label-left">TOTAL QTY</div>
            <div class="footer-col value-center">{{ grandQty }}</div>

            <div class="footer-col label-right">TOTAL NOMINAL</div>
            <div class="footer-col value-right">{{ formatRupiah(grandTotal) }}</div>
          </div>

          <div class="footer-summary-section" v-if="!header.isMarketplace">
            <v-row dense>
              <v-col cols="12" md="7" lg="6" xl="6">
                <v-row dense>
                  <v-col cols="6">
                    <v-btn v-if="!header.isMarketplace" block color="teal" @click="openDpInput"
                      prepend-icon="mdi-cash-plus">
                      Input DP (Uang Muka)
                    </v-btn>
                  </v-col>

                  <v-col cols="6">
                    <v-btn color="blue-darken-2" variant="outlined" block prepend-icon="mdi-sale"
                      @click="isDiscountCostModalVisible = true">
                      Atur Diskon & Biaya
                    </v-btn>
                  </v-col>

                  <v-col cols="6">
                    <v-btn v-if="header.statusSo === 'PASIF'" block color="orange" @click="openDpAuthorization"
                      prepend-icon="mdi-key-variant">
                      Minta Otorisasi
                    </v-btn>
                  </v-col>

                  <v-col cols="6">
                    <v-btn color="teal" variant="outlined" block prepend-icon="mdi-format-list-bulleted"
                      @click="isDpListModalVisible = true">
                      Lihat Rincian DP
                    </v-btn>
                  </v-col>
                </v-row>
              </v-col>

              <v-col cols="12" md="5" lg="6" xl="6" v-if="!header.isMarketplace">
                <div class="summary-totals">
                  <v-list density="compact" class="summary-list">
                    <!-- Diskon Faktur (hanya muncul jika ada) -->
                    <v-list-item v-if="footer.diskonRp > 0" class="summary-discount">
                      <v-list-item-title class="text-error">Diskon Faktur</v-list-item-title>
                      <template #append>
                        <span class="text-body-1 text-error">- {{ formatRupiah(footer.diskonRp) }}</span>
                      </template>
                    </v-list-item>

                    <!-- Total DP -->
                    <v-list-item class="summary-total">
                      <v-list-item-title>Total DP</v-list-item-title>
                      <template #append>
                        <span class="text-h6">{{ formatRupiah(footer.totalDp) }}</span>
                      </template>
                    </v-list-item>

                    <!-- Belum Dibayar -->
                    <v-list-item class="summary-total summary-belum-bayar">
                      <v-list-item-title class="font-weight-bold">Belum Dibayar</v-list-item-title>
                      <template #append>
                        <span class="text-h6 font-weight-black"
                          :class="footer.belumDibayar > 0 ? 'text-error' : 'text-success'">
                          {{ formatRupiah(footer.belumDibayar) }}
                        </span>
                      </template>
                    </v-list-item>
                  </v-list>
                </div>
              </v-col>
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
      @close="isPenawaranSearchVisible = false" @selected="onPenawaranSelected" />
    <ProductSearchModal v-if="isProductSearchVisible" :gudang="header.gudang.kode" category="ALL"
      :multi="isMultiSelectProduct" source="surat-pesanan" :promo-nomor="header.nomorPromo"
      @close="isProductSearchVisible = false" @products-selected="onProductsSelected" />
    <AuthorizationModal v-if="authDialog.show" :title="authDialog.title" :jenis="authDialog.jenis"
      :nominal="authDialog.nominal" :transaksi="authDialog.transaksi" :barcode="authDialog.barcode"
      :keterangan="authDialog.keterangan" @success="authDialog.onSuccess" @close="
        () => {
          authDialog.show = false;
          authDialog.onCancel();
        }
      " />
    <SoDtfSearchModal v-if="isSoDtfSearchVisible" :cabang="header.gudang.kode" :customerKode="header.customer?.kode"
      @close="isSoDtfSearchVisible = false" @selected="onSoDtfSelected" />
    <PriceProposalSearchModal v-if="isPriceProposalSearchVisible" :cabang="header.gudang.kode"
      :customerKode="header.customer?.kode" @close="isPriceProposalSearchVisible = false"
      @selected="onPriceProposalSelected" />
    <DpInputModal v-if="isDpInputVisible" :customerKode="header.customer?.kode" :minimal-dp="footer.minimalDp"
      :existing-dp="footer.totalDp" :existing-dp-nomor="existingDpNomor" :nomor-so="header.nomor"
      @close="isDpInputVisible = false" @dp-saved="onDpSaved" />
    <CustomerForm v-if="isNewCustomerFormVisible" @close="isNewCustomerFormVisible = false"
      @customer-saved="onNewCustomerSaved" />
    <DiscountCostModal v-if="isDiscountCostModalVisible" :footer-data="footer" :total-so="totalDiscountable"
      :customer="header.customer" :gudang-kode="header.gudang.kode" :ppn-persen="header.ppnPersen"
      @close="isDiscountCostModalVisible = false" @update="handleDiscountCostUpdate" />
    <DpListModal v-if="isDpListModalVisible" :dp-items="dpItems" :customer-kode="header.customer?.kode || ''"
      @close="isDpListModalVisible = false" @remove-dp="removeDpRow($event)" @add-dp="handleAddDp" />
    <JenisOrderModal v-if="dialogs.jenisOrder" :model-value="dialogs.jenisOrder" :penawaran-details="penawaranDetails"
      :penawaran-barang-list="penawaranBarangList" @close="dialogs.jenisOrder = false" @saved="handleJenisOrderSaved" />
    <PromoSearchModal v-if="dialogs.promoSearch" :tanggal="header.tanggal" @close="dialogs.promoSearch = false"
      @selected="onPromoSelected" />
    <PromoBonusModal v-if="dialogs.promoBonus" :promo-nomor="activePromoForBonus.nomor"
      @close="dialogs.promoBonus = false" @selected="handleBonusSelection" />

    <v-dialog v-model="isPromoConfirmVisible" max-width="450px" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="bg-primary text-white text-h6 pa-4">
          <v-icon start color="white">mdi-ticket-percent</v-icon>
          Pilih Jenis Diskon
        </v-card-title>
        <v-card-text class="pa-5">
          <p class="mb-4">Sistem mendeteksi transaksi ini berhak mendapatkan promo:</p>
          <v-alert type="info" variant="tonal" border="start" density="compact" class="mb-4">
            <strong>{{ pendingPromoData.nama }}</strong><br>
            Potongan: <strong>{{ formatRupiah(pendingPromoData.diskon) }}</strong>
          </v-alert>
          <p class="text-caption text-medium-emphasis">
            Catatan: Memilih Promo akan menonaktifkan Diskon Member (Reseller) secara otomatis.
          </p>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions class="pa-4">
          <v-btn variant="outlined" color="primary" @click="useMemberDiscount">
            Tetap Diskon Member
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="flat" @click="usePromoDiscount">
            Gunakan Promo
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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

    <v-dialog v-model="isPrintConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold"> Simpan Berhasil </v-card-title>
        <v-card-text>
          Surat Pesanan {{ printConfirmNomor }} berhasil disimpan. <br /><br />
          Apakah Anda ingin mencetak dokumen ini sekarang?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="handlePrintCancel">
            Tidak, Kembali
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="handlePrintConfirm"> Ya, Cetak </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  grid-template-columns: 450px 1fr;
  height: calc(100vh - 120px);
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

.scrollable-content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  /* scroll disini */
  overflow-x: hidden;
}

.header-section {
  flex-shrink: 0;
}

.status-section {
  flex-grow: 1;
}

.main-grid-section {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-grid-section .v-data-table {
  width: max-content;
  /* biarkan tabel selebar kontennya */
  min-width: 100%;
}

.desktop-table {
  flex: 1 1 auto;
  min-height: 0;
}

/* PENTING: Biarkan VDataTable wrapper yang handle SEMUA scrolling */
.desktop-table :deep(.v-table__wrapper) {
  overflow-x: auto !important;
  overflow-y: auto !important;
  /* Sama dengan height v-data-table */
}

/* TAMBAHAN: Pastikan tabel bisa lebih lebar dari container */
.desktop-table :deep(.v-table) {
  min-width: max-content;
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
  flex: none;
  margin-bottom: 16px;
}

.vertically-aligned-table :deep(tbody tr td) {
  vertical-align: middle !important;
}

.product-name-cell {
  white-space: nowrap;
  /* tetap satu baris */
  line-height: 1.4;
  padding-top: 4px;
  padding-bottom: 4px;
  min-width: 250px;
  /* minimum width untuk kolom nama */
}

:deep(.custom-row) {
  background-color: #f3f8ff;
  /* biru muda */
  font-style: italic;
}

:deep(.v-icon.me-2) {
  margin-right: 6px;
  opacity: 0.8;
}

.so-sticky-footer {
  position: sticky;
  bottom: 0;

  display: grid;
  grid-template-columns: 1fr 0.7fr 1fr 1fr;
  align-items: center;

  background-color: rgb(var(--v-theme-surface));
  padding: 10px 16px;
  border-top: 2px solid #1976d2;

  z-index: 105;
  /* lebih tinggi dari table scroll */
  min-height: 48px;

  /* cegah mengecil ketika tabel kecil */
  flex-shrink: 0;

  /* full width ALWAYS */
  width: 100%;
  box-sizing: border-box;

  /* cegah ikut scroll horizontal */
  position: sticky;
  left: 0;
}

.so-sticky-footer .footer-col {
  padding: 4px 8px;
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
}

.footer-col {
  padding: 4px 12px;
}

.label-left {
  font-weight: 600;
  text-align: left;
}

.value-center {
  font-weight: 700;
  text-align: center;
}

.label-right {
  font-weight: 600;
  text-align: right;
}

.value-right {
  font-weight: 900;
  text-align: right;
  font-size: 17px;
}

.v-data-table .v-input input {
  caret-color: transparent;
}

.footer-summary-section {
  position: sticky;
  flex-shrink: 0;
  padding: 8px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  background-color: rgb(var(--v-theme-surface));
}

.summary-totals {
  height: auto !important;
  /* Selalu auto */
  min-height: auto !important;
  max-height: none !important;
  overflow-y: visible !important;
  /* Tidak perlu scroll */
}

.summary-list {
  background-color: transparent !important;
  height: auto !important;
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* Default gap */
}

.summary-list .v-list-item {
  padding: 4px 2px !important;
  /* Default padding */
  min-height: 32px !important;
  /* Default min-height */
}

.summary-list .v-list-item-title {
  font-size: 0.85rem;
  /* Default font */
  line-height: 1.3;
}

.summary-list .text-h6 {
  font-size: 1.05rem !important;
  /* Default font value */
  font-weight: 700 !important;
}

.summary-list .text-body-1 {
  font-size: 0.9rem !important;
}

.summary-discount .v-list-item-title,
.summary-discount span {
  font-size: 0.85rem;
}

.summary-total {
  margin-top: 0px;
}

.summary-total:first-child {
  margin-top: 0;
}

.summary-list .v-list-item:last-child {
  margin-top: 6px;
  padding-top: 6px !important;
  border-top: 1px solid #e0e0e0;
}

.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  /* Biru Tua */
  color: #ffffff !important;
  /* Teks Putih */
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important;
  /* Supaya lebih rapi */
}

/* Tambahan Style untuk Mode MP */
.border-dashed {
  border-style: dashed !important;
}

.bg-orange-lighten-5 {
  background-color: #fff3e0 !important;
}

.border-orange {
  border-color: #ffb74d !important;
}

/* --- Premium Promo Card Styles --- */
.promo-card-wrapper {
  padding: 0 12px;
  perspective: 1000px;
}

.promo-card {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);
  /* Royal Mystic */
  box-shadow: 0 10px 25px -5px rgba(38, 208, 206, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: all 0.3s ease;
}

/* Style Khusus Grand Opening */
.promo-card.grand-opening-style {
  background: linear-gradient(135deg, #ff512f 0%, #dd2476 100%) !important;
  box-shadow: 0 10px 25px -5px rgba(221, 36, 118, 0.5) !important;
  border: 1px solid rgba(255, 215, 0, 0.3) !important;
}

.grand-opening-style .promo-label {
  color: #ffd700 !important;
}

.card-texture {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px);
  background-size: 12px 12px;
  opacity: 0.6;
  z-index: 1;
}

.card-content {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  /* Sedikit lebih kecil dibanding invoice agar muat */
  gap: 12px;
  color: white;
}

.icon-circle {
  width: 40px;
  height: 40px;
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

.text-container {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.promo-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
}

.promo-message {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  color: #ffffff;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.status-chip {
  background: rgba(0, 0, 0, 0.2);
  padding: 4px 8px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background-color: #00e676;
  border-radius: 50%;
  box-shadow: 0 0 8px #00e676;
  animation: blink 1.5s infinite;
}

.card-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(to right,
      transparent 0%,
      rgba(255, 255, 255, 0.2) 50%,
      transparent 100%);
  transform: skewX(-25deg);
  z-index: 2;
  animation: shineMove 4s infinite ease-in-out;
  pointer-events: none;
}

@keyframes shineMove {
  0% {
    left: -100%;
    opacity: 0;
  }

  20% {
    opacity: 1;
  }

  50% {
    left: 200%;
    opacity: 0;
  }

  100% {
    left: 200%;
    opacity: 0;
  }
}

@keyframes softPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
    transform: scale(1);
  }

  70% {
    box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
    transform: scale(1.05);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
    transform: scale(1);
  }
}

@keyframes blink {

  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

/* ===== RESPONSIVE MEDIA QUERIES ===== */

/* Layar sangat besar (1920px ke atas) - Desktop 4K */
@media (min-height: 1080px) {
  .summary-list {
    gap: 8px;
  }

  .summary-list .v-list-item {
    padding: 6px 4px !important;
    min-height: 40px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 1rem;
  }

  .summary-list .text-h6 {
    font-size: 1.25rem !important;
  }

  .summary-list .text-body-1 {
    font-size: 1.05rem !important;
  }
}

/* Layar besar (900px - 1080px) - Desktop standar */
@media (min-height: 900px) and (max-height: 1079px) {
  .summary-list {
    gap: 5px;
  }

  .summary-list .v-list-item {
    padding: 5px 3px !important;
    min-height: 36px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.9rem;
  }

  .summary-list .text-h6 {
    font-size: 1.15rem !important;
  }
}

/* Layar sedang (768px - 900px) - Laptop standar */
@media (min-height: 768px) and (max-height: 899px) {
  .summary-list {
    gap: 4px;
  }

  .summary-list .v-list-item {
    padding: 4px 2px !important;
    min-height: 32px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.85rem;
  }

  .summary-list .text-h6 {
    font-size: 1.05rem !important;
  }
}

/* Layar kecil (600px - 768px) - Laptop kecil */
@media (min-height: 600px) and (max-height: 767px) {
  .summary-list {
    gap: 3px;
  }

  .summary-list .v-list-item {
    padding: 3px 2px !important;
    min-height: 28px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.8rem;
    line-height: 1.2;
  }

  .summary-list .text-h6 {
    font-size: 0.95rem !important;
  }

  .summary-list .text-body-1 {
    font-size: 0.85rem !important;
  }

  .summary-list .v-list-item:last-child {
    margin-top: 4px;
    padding-top: 4px !important;
  }
}

/* Layar sangat kecil (di bawah 600px) - Tablet/Netbook */
@media (max-height: 599px) {
  .footer-summary-section {
    padding: 6px 8px;
    /* Padding lebih kecil */
  }

  .summary-list {
    gap: 2px;
  }

  .summary-list .v-list-item {
    padding: 2px 2px !important;
    min-height: 24px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.75rem;
    line-height: 1.1;
  }

  .summary-list .text-h6 {
    font-size: 0.9rem !important;
  }

  .summary-list .text-body-1 {
    font-size: 0.8rem !important;
  }

  .summary-discount .v-list-item-title,
  .summary-discount span {
    font-size: 0.75rem;
  }

  .summary-list .v-list-item:last-child {
    margin-top: 3px;
    padding-top: 3px !important;
  }
}

/* Responsive berdasarkan lebar layar (opsional, untuk sidebar collapse) */
@media (max-width: 1366px) {
  .summary-list .v-list-item-title {
    font-size: 0.8rem;
  }

  .summary-list .text-h6 {
    font-size: 1rem !important;
  }
}

@media (max-width: 1024px) {
  .summary-list .v-list-item {
    padding: 3px 2px !important;
    min-height: 28px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.75rem;
  }

  .summary-list .text-h6 {
    font-size: 0.95rem !important;
  }
}
</style>

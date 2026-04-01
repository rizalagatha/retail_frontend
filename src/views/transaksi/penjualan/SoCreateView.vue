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
// import SpkDialog from "@/components/dialog/SpkDialog.vue";

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

  scannedQty: number; // Jumlah yang benar-benar sudah discan/fisik siap
  isReady: boolean; // Flag jika scannedQty == jumlah (order)
  promo?: string; // <--- TAMBAHKAN INI
  _isHargaEditable?: boolean; // <--- TAMBAHKAN INI

  mutatedQty?: number; // Saldo yang sudah dimutasi
  isMutated?: boolean; // Flag pengunci UI
  isLhk?: boolean;
}

// Interface baru untuk Record Adjustment
interface SoAdjustmentLog {
  id: string;
  timestamp: string;
  kode: string;
  nama: string;
  qty: number;
  // Gunakan Union Type agar validasi tipe datanya kuat
  type: "SCAN" | "MANUAL_ADD" | "MANUAL_REMOVE" | "DELETE_ROW" | "DELETE_ITEM";
  user: string;
  reason: string;
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
  pend_custom: "Y" | "N";
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
const allVerified = computed(() => {
  const validItems = items.value.filter((i) => i.kode && !i.isJasa);
  if (validItems.length === 0) return false;
  return validItems.every((item) => (item.scannedQty || 0) >= (item.jumlah || 0));
});
const hasReadyItems = computed(() => {
  return items.value.some((item) => (item.scannedQty || 0) > 0);
});
const allMutated = computed(() => {
  const validItems = items.value.filter((i) => i.kode && !i.isJasa);
  if (validItems.length === 0) return false;

  return validItems.every((item) => {
    // 1. Tentukan apakah ini barang Produksi/Custom
    const isProductionItem = item.kode === "CUSTOM" || !!item.noSoDtf;

    if (isProductionItem) {
      // Barang Produksi/Custom tidak perlu mutasi fisik showroom, cukup cek Ready
      return item.isReady === true;
    }

    // 2. Barang Reguler (Stok) wajib sudah dimutasikan (Status Gembok)
    return item.isMutated === true;
  });
});
const isLoading = ref(true);
const isSaving = ref(false);
const isInitialLoad = ref(false);
const isSavingDisabled = ref(false);
const scannedBarcode = ref("");
const adjustmentLogs = ref<SoAdjustmentLog[]>([]);
// const isSpkDialogVisible = ref(false);
const isStickerBonusRejected = ref(false);
const isLeftColumnVisible = ref(true);

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
  onSuccess: () => {},
  onCancel: () => {},
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
  diskon: 0,
});
// Flag agar dialog tidak muncul berulang kali untuk promo yang sama
const lastSuggestedPromo = ref("");
const isAdjustmentLogVisible = ref(false);
const nextActionAfterSave = ref<"PRINT" | "INVOICE">("PRINT");
const isPromoFilterDisabled = ref(false);

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
  { title: "KODE", key: "kode", width: "120px" },
  { title: "NAMA BARANG", key: "nama" }, // Tanpa width agar fleksibel memenuhi baris
  { title: "KTG", key: "kategori", width: "60px" },
  { title: "UKURAN", key: "ukuran", width: "50px" },
  { title: "BARCODE", key: "barcode", width: "100px" },
  { title: "STOK", key: "stok", align: "end", width: "50px" },
  { title: "ORDER", key: "jumlah", align: "end", width: "70px" },
  { title: "READY", key: "scannedQty", align: "end", width: "100px" },
  { title: "HARGA", key: "harga", width: "100px" },
  { title: "DISC%", key: "diskonPersen", width: "60px" },
  { title: "DISC RP", key: "diskonRp", width: "90px" },
  { title: "TOTAL", key: "total", align: "end", width: "110px" },
  { title: "SO DTF", key: "noSoDtf", width: "120px" },
  { title: "PENGAJUAN", key: "noPengajuanHarga", width: "120px" },
  { title: "ACT", key: "actions", sortable: false, width: "40px" },
] as const;

// const dpTableHeaders = [
//   { title: 'No. Setoran', key: 'nomor' },
//   { title: 'Jenis', key: 'jenis' },
//   { title: 'Nominal', key: 'nominal' },
//   { title: 'Posting', key: 'posting' },
//   { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
// ] as const;

const adjustmentHeaders = [
  { title: "Waktu", key: "timestamp", width: "180px" },
  { title: "Kode", key: "kode", width: "150px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Qty", key: "qty", align: "end", width: "80px" },
  { title: "Tipe", key: "type", width: "130px" },
  { title: "User", key: "user", width: "120px" },
  { title: "Keterangan", key: "reason" },
] as const;

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

const hasUnfinishedDtf = computed(() => {
  return items.value.some((item) => !!item.noSoDtf && item.isLhk === false);
});

const isExemptFromLhkRule = computed(() => {
  const cabang = authStore.user?.cabang || "";
  return ["K01", "K03"].includes(cabang);
});

// --- Functions ---
// function toDateInputValue(dateStr: string) {
//   if (!dateStr) return '';
//   return dateStr.substring(0, 10); // aman, tidak berubah timezone
// }

// --- Methods ---
const loadDataForEdit = async (nomor: string, silent = false) => {
  isLoading.value = !silent;
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

    if (header.value.customer) {
      header.value.customer.level_kode = headerData.levelKode || "";
      header.value.customer.level_nama = headerData.levelNama || "";
    }

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

      const qtyOrder = Number(item.jumlah || 0);
      const qtyReady = Number(item.sod_scanned || 0);
      const mutated = Number(item.mutatedQty || 0);
      const isCustomOrder = item.sod_custom === "Y";
      const finalNama = isCustomOrder ? item.sod_custom_nama || item.nama : item.nama;

      return {
        ...item,
        nama: finalNama,
        id: Date.now() + index + Math.random(),
        scannedQty: qtyReady, // 👈 Masukkan nilai dari DB
        mutatedQty: mutated,
        isMutated: mutated > 0, // 👈 Kunci jika saldo mutasi > 0
        isReady: qtyReady >= qtyOrder && qtyOrder > 0,
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

    if (!silent) {
      toast.success(`Data untuk SO ${nomor} berhasil dimuat.`);
    }
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
  // 1. Cek Pengecualian JASA murni
  const isJasaMurni =
    item.kode?.toUpperCase().startsWith("JASA") ||
    item.kode?.toUpperCase().startsWith("JS") ||
    item.nama?.toLowerCase().includes("jasa") ||
    item.nama?.toLowerCase().includes("ongkir") ||
    item.nama?.toLowerCase().includes("desain");

  // 2. [TAMBAHAN] Cek Pengajuan Harga
  // Jika item memiliki No. Pengajuan Harga, maka TIDAK BOLEH kena diskon faktur
  const isPengajuanHarga = !!item.noPengajuanHarga;

  return !isJasaMurni && !isPengajuanHarga;
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
  autoReadyJasa();

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

    // [BARU] Proteksi Item Pengajuan Harga: Paksa diskon item jadi 0
    if (item.noPengajuanHarga) {
      item.diskonPersen = 0;
      item.diskonRp = 0;
    }

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

  // [PENTING] 1. Cek kelayakan promo (hanya jika TIDAK ada otorisasi member manual)
  const hasMemberAuth = !!(footer.value.pinDiskon1 || footer.value.pinDiskon2);
  let isPromoApplied = false;

  if (!hasMemberAuth) {
    isPromoApplied = await checkRealtimePromoEligibility();
  } else {
    // Jika ada otorisasi member, paksa hapus identitas promo agar tidak tersimpan ke DB
    header.value.nomorPromo = "";
    header.value.namaPromo = "";
    promoNotification.value = "";
  }

  // ========================================================================
  // [KUNCI PERBAIKAN] 2. Penentuan Jalur Diskon & Proteksi Penawaran
  // ========================================================================
  let baseNominalDiscount = 0;
  const isFromOffer = !!header.value.penawaran; // Sekarang variabel ini KITA GUNAKAN

  if (isPromoApplied && header.value.nomorPromo) {
    // JALUR PROMO
    baseNominalDiscount = footer.value.diskonRp;
    footer.value.diskonPersen1 = 0;
  } else if (isFromOffer || (footer.value.diskonRp > 0 && footer.value.diskonPersen1 === 0)) {
    // JALUR PENAWARAN atau DISKON MANUAL Rp (Hasil Load Edit)
    // Jika ditarik dari Penawaran, 'isFromOffer' akan bernilai TRUE, sehingga masuk ke sini.
    // Jika sedang Edit data lama (seperti kasus 40rb tadi), bagian kanan (diskonRp > 0) akan bernilai TRUE.
    baseNominalDiscount = footer.value.diskonRp;
  } else {
    // JALUR MEMBER STANDAR (Kalkulasi otomatis dari % ke Rp)
    const diskonP1 = Number(footer.value.diskonPersen1) || 0;
    baseNominalDiscount = (diskonP1 / 100) * newTotalDiscountable;
  }
  // HITUNG DISKON 2 (MAPS) SECARA AKUMULATIF
  const diskonP2 = Number(footer.value.diskonPersen2) || 0;
  const remainingAfterBase = newTotalDiscountable - baseNominalDiscount;
  const mapsDiscountRp = (diskonP2 / 100) * remainingAfterBase;

  // Set nilai akhir (Basis Penawaran/Promo/Member + MAPS)
  footer.value.diskonRp = Math.round(baseNominalDiscount + mapsDiscountRp);

  // Hitung Total DP yang sudah masuk
  const totalDp = dpItems.value.reduce((sum, dp) => sum + (dp.nominal || 0), 0);
  footer.value.totalDp = totalDp;

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

const openProductSearch = (index: number, isMulti: boolean, ignorePromo = false) => {
  if (!header.value.customer) {
    toast.error("Pilih Customer terlebih dahulu.");
    return;
  }

  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;

  // LOGIC: Paksa set flag ignore promo
  isPromoFilterDisabled.value = ignorePromo;

  console.log("DEBUG SEARCH: ignorePromo =", ignorePromo);
  console.log("DEBUG SEARCH: promo terpilih =", ignorePromo ? "" : header.value.nomorPromo);

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

let isApplyingBonus = false;

const applyMarchBonusSticker = async (forceInject = false) => {
  if (isApplyingBonus) return;

  // [PERBAIKAN 1]: Hentikan jika user sudah menolak stiker (kecuali dipaksa via tombol Promo)
  if (isStickerBonusRejected.value && !forceInject) {
    return;
  }

  isApplyingBonus = true;

  try {
    const STICKER_BARCODE = "25014783";
    const STICKER_KODE = "2500053";
    const THRESHOLD_STICKER = 600000;

    const isStickerGeneric = (i: SoItem) =>
      String(i.barcode) === STICKER_BARCODE || String(i.kode) === STICKER_KODE;

    const isStickerPromoToko = (i: SoItem) =>
      isStickerGeneric(i) &&
      String(i.ukuran).toUpperCase() === "A6" &&
      (Number(i.harga) === 0 || i.terhitungPromo || i.promo === "PRO-2026-001");

    // Hitung Total Nilai Belanja (mengabaikan semua jenis stiker toko)
    const totalEligibleValue = items.value.reduce((sum, item) => {
      return isItemPromoEligible(item) && !isStickerGeneric(item) ? sum + (item.total || 0) : sum;
    }, 0);

    // Hitung Qty Kaos Reguler (mengabaikan semua jenis stiker toko & DTF)
    const totalKaosQty = items.value.reduce((sum, item) => {
      const isCustomDtf = item.isCustomOrder || !!item.noSoDtf;
      return isItemPromoEligible(item) && !isStickerGeneric(item) && !isCustomDtf
        ? sum + (Number(item.jumlah) || 0)
        : sum;
    }, 0);

    // [PERBAIKAN 2]: JANGAN pakai multiplier! Jika tembus 600rb, qty stiker = qty kaos reguler
    const baseBonusQty = totalEligibleValue >= THRESHOLD_STICKER ? totalKaosQty : 0;

    // Hitung stiker custom A6 dari DTF (Mencegah Dobel)
    const customStickerQty = items.value.reduce((sum, item) => {
      const isCustomDtf = item.isCustomOrder || !!item.noSoDtf;
      const isA6 =
        String(item.ukuran).toUpperCase() === "A6" ||
        String(item.nama).toUpperCase().includes("A6") ||
        String(item.nama).toUpperCase().includes("STICKER");
      return isCustomDtf && isA6 ? sum + (Number(item.jumlah) || 0) : sum;
    }, 0);

    // Sisa Jatah Stiker Toko A6
    const targetBonusQty = Math.max(0, baseBonusQty - customStickerQty);

    // --- SAPU BERSIH DUPLIKAT HANYA UNTUK STIKER PROMO A6 ---
    const stickerIndexes: number[] = [];
    items.value.forEach((item, idx) => {
      if (isStickerPromoToko(item)) stickerIndexes.push(idx);
    });

    // Jika jatah habis ATAU user reject stiker, hapus SEMUA
    if (targetBonusQty === 0 || (isStickerBonusRejected.value && !forceInject)) {
      for (let i = stickerIndexes.length - 1; i >= 0; i--) {
        items.value.splice(stickerIndexes[i], 1);
      }
      return;
    }

    // Jika ada duplikat gara-gara reaktivitas Vue, sisakan satu saja
    if (stickerIndexes.length > 1) {
      for (let i = stickerIndexes.length - 1; i > 0; i--) {
        items.value.splice(stickerIndexes[i], 1);
      }
    }

    // Cari ulang index stiker
    const existingIdx = items.value.findIndex((i) => isStickerPromoToko(i));

    // Jika QTY sudah benar, hentikan proses loop
    if (existingIdx !== -1 && items.value[existingIdx].jumlah === targetBonusQty) {
      return;
    }

    // --- UPDATE ATAU INSERT ITEM STIKER ---
    if (targetBonusQty > 0) {
      if (!forceInject && existingIdx === -1 && header.value.nomorPromo !== "PRO-2026-001") {
        return;
      }

      if (existingIdx !== -1) {
        items.value[existingIdx].jumlah = targetBonusQty;
        items.value[existingIdx].scannedQty = targetBonusQty; // SO butuh ini
        items.value[existingIdx].isReady = true; // SO butuh ini
        items.value[existingIdx].total = 0;
        items.value[existingIdx].harga = 0;
      } else {
        let stokFisikToko = 0;
        let prodKode = STICKER_KODE;
        let prodNama = "STICKER DTF A6";
        let prodUkuran = "A6";

        try {
          const response = await api.get(`/so-form/by-barcode/${STICKER_BARCODE}`, {
            params: { gudang: header.value.gudang.kode },
          });
          const product = response.data;
          stokFisikToko = Number(product.stok || 0);
          prodKode = product.kode;
          prodNama = product.nama;
          prodUkuran = product.ukuran;
        } catch (error) {
          console.warn("Gagal narik data stiker, pakai fallback.", error);
        }

        const newItem: SoItem = {
          id: Date.now() + 999,
          kode: prodKode,
          nama: `${prodNama} (FREE MARET)`,
          ukuran: prodUkuran,
          jumlah: targetBonusQty,
          harga: 0,
          _isHargaEditable: false,
          diskonRp: 0,
          diskonPersen: 0,
          total: 0,
          barcode: STICKER_BARCODE,
          stok: stokFisikToko,
          noPengajuanHarga: "",
          pin: "",
          noSoDtf: "",
          scannedQty: targetBonusQty, // Langsung ready
          isReady: true, // Langsung ready
          kategori: "BONUS",
          terhitungPromo: true,
          promo: "PRO-2026-001",
        };

        const emptyIdx = items.value.findIndex((i) => !i.kode);
        if (emptyIdx !== -1) {
          items.value.splice(emptyIdx, 0, newItem);
        } else {
          items.value.push(newItem);
        }
        isStickerBonusRejected.value = false; // Reset penolakan karena terpasang
      }
    }
  } finally {
    isApplyingBonus = false;
  }
};

// [UBAH] Tambahkan 'async' pada definisi fungsi
const save = async () => {
  if (nextActionAfterSave.value !== "INVOICE") {
    nextActionAfterSave.value = "PRINT";
  }

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

    const isStickerPromoToko =
      (String(item.barcode) === "25014783" || String(item.kode) === "2500053") &&
      String(item.ukuran).toUpperCase() === "A6" &&
      (item.harga === 0 || item.terhitungPromo || item.promo === "PRO-2026-001");

    if (!isStickerPromoToko) {
      if (item.harga === null || item.harga === undefined || item.harga < 0) {
        toast.error(`Harga untuk barang '${item.nama}' harus diisi.`);
        return;
      }
    }
  }

  // --- 2. Injeksi Bonus Sticker (PROMO MARET) ---
  // Eksekusi penambahan fisik sticker sebelum menghitung kelayakan promo diskon rupiah
  if (header.value.nomorPromo === "PRO-2026-001" && !isStickerBonusRejected.value) {
    await applyMarchBonusSticker(true);
    calculateTotals();
  }

  // --- 3. Validasi Promo Spesifik (Beli 3 = 100rb) ---
  const totalQty = validItems.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  if (header.value.nomorPromo === "PRO-2025-005" && totalQty < 3) {
    return toast.error("Qty minimal 3 pcs untuk promo ini.");
  }

  // --- 4. Cek Promo Aktif & Terapkan Otomatis ---
  if (isEditMode.value && header.value.nomorPromo) {
    // [PERBAIKAN] Jika mode edit dan sudah ada promo bawaan,
    // biarkan diskon tersebut seperti apa adanya.
    // Jangan panggil API atau melepas promo secara otomatis.
  } else {
    try {
      const promoResponse = await api.get("/invoice-form/lookup/active-promos", {
        params: { tanggal: header.value.tanggal, cabang: header.value.gudang.kode },
      });

      const activePromos = (promoResponse.data ?? []) as ActivePromo[];

      const promoApril = activePromos.find((p) => p.pro_nomor === "PRO-2026-002");
      const promo2026 = activePromos.find((p) => p.pro_nomor === "PRO-2026-001");
      const promo008 = activePromos.find((p) => p.pro_nomor === "PRO-2025-008");
      const promo010 = activePromos.find((p) => p.pro_nomor === "PRO-2025-010");

      let promoToApply: ActivePromo | null = null;
      let promoDiskon = 0;

      const isExcludedItem = (item: SoItem) => {
        const namaUp = item.nama?.toUpperCase() || "";
        const kodeUp = item.kode?.toUpperCase() || "";
        const isJasaOrDesign =
          item.isJasa ||
          kodeUp.startsWith("JS") ||
          kodeUp.startsWith("JASA") ||
          namaUp.includes("JASA") ||
          namaUp.includes("DESAIN") ||
          namaUp.includes("FILE");
        const isCustomOrDtf = item.isCustomOrder || !!item.noSoDtf || !!item.noPengajuanHarga;
        return isJasaOrDesign || isCustomOrDtf;
      };

      const totalBelanjaDec = validItems.reduce((sum, item) => {
        if (!isExcludedItem(item)) return sum + (item.total || 0);
        return sum;
      }, 0);

      const totalRegulerDec = validItems.reduce((sum, item) => {
        if (!item.nama?.toUpperCase().includes("JERSEY") && !isExcludedItem(item)) {
          return sum + (item.total || 0);
        }
        return sum;
      }, 0);

      const totalEligibleValue = totalRegulerDec;

      // --- PRIORITAS 1: PROMO APRIL ---
      if (promoApril && totalEligibleValue >= 250000) {
        const kelipatanUang = Math.floor(totalEligibleValue / 250000);
        promoDiskon = 12500 * kelipatanUang;
        promoToApply = promoApril;
      }
      // --- PRIORITAS 2: PROMO MARET ---
      else if (promo2026 && totalEligibleValue >= 200000) {
        const kelipatanUang = Math.floor(totalEligibleValue / 200000);
        promoDiskon = 20000 * kelipatanUang;
        promoToApply = promo2026;
      }
      // --- PRIORITAS 3: PROMO LAMA ---
      else if (!promoToApply) {
        if (promo010 && totalRegulerDec >= 250000) {
          const kelipatan = Math.floor(totalRegulerDec / 250000);
          promoDiskon = 25000 * kelipatan;
          promoToApply = promo010;
        } else if (promo008 && totalBelanjaDec >= promo008.pro_totalrp) {
          promoDiskon = promo008.pro_disrp * Math.floor(totalBelanjaDec / promo008.pro_totalrp);
          promoToApply = promo008;
        }
      }

      // --- PENERAPAN PROMO HEADER OTOMATIS ---
      if (promoToApply) {
        if (
          !header.value.nomorPromo &&
          footer.value.diskonRp === 0 &&
          footer.value.diskonPersen1 === 0 &&
          footer.value.diskonPersen2 === 0
        ) {
          footer.value.diskonRp = promoDiskon;
          header.value.nomorPromo = promoToApply.pro_nomor;
          header.value.namaPromo = promoToApply.pro_judul;
          calculateTotals();
          toast.success(`Promo ${promoToApply.pro_judul} diterapkan otomatis!`);
        } else if (header.value.nomorPromo === promoToApply.pro_nomor) {
          footer.value.diskonRp = promoDiskon;
          calculateTotals();
        }
      } else if (
        header.value.nomorPromo === "PRO-2026-001" ||
        header.value.nomorPromo === "PRO-2026-002"
      ) {
        footer.value.diskonRp = 0;
        header.value.nomorPromo = "";
        header.value.namaPromo = "";
        calculateTotals();
        toast.warning("Syarat minimal belanja promo tidak terpenuhi. Promo dilepas.");
      }
    } catch (error) {
      console.error("Gagal mengecek promo otomatis:", error);
    }
  }
  
  // --- 5. Cek Promo Tebus Murah (Bonus Item) ---
  if (header.value.nomorPromo === "PRO-2025-002") {
    activePromoForBonus.value = { nomor: header.value.nomorPromo, qty: 1 };
    dialogs.promoBonus = true;
    return;
  }

  // --- 6. Validasi DP ---
  if (footer.value.totalDp < footer.value.minimalDp && header.value.statusSo === "PASIF") {
    toast.warning("DP di bawah Minimal DP. SO ini akan berstatus PASIF.");
  }

  // --- 7. VALIDASI TANGGAL HARI INI ---
  if (!isEditMode.value) {
    // Hanya cek jika buat SO BARU
    const today = format(new Date(), "yyyy-MM-dd");
    if (header.value.tanggal !== today) {
      toast.error(`Tanggal transaksi harus hari ini (${today}).`);
      return;
    }
  }

  // --- 8. Konfirmasi Akhir (Simpan) ---
  showConfirmation(executeSave, "Anda yakin ingin menyimpan Surat Pesanan ini?");
};

const saveAndConvertToInvoice = () => {
  // Validasi Kelayakan Invoice
  if (!allMutated.value) {
    toast.error("Gagal: Masih ada barang yang belum Ready atau belum dimutasikan ke Stok Pesanan.");
    return;
  }

  nextActionAfterSave.value = "INVOICE";
  save();
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

          sod_scanned: Number(item.scannedQty || 0),

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
      if (nextActionAfterSave.value === "INVOICE") {
        // --- JALUR OTOMATIS KE INVOICE ---
        router.push({
          path: "/transaksi/penjualan/invoice/new",
          query: { refSo: soNomor },
        });
      } else {
        // --- JALUR STANDAR (CETAK) ---
        printConfirmNomor.value = soNomor;
        isPrintConfirmVisible.value = true;
      }
    }
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
    nextActionAfterSave.value = "PRINT";
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
      scannedQty: 0, // Inisialisasi ke 0
      isReady: false,
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
  if (!item) return;

  const isStickerPromoToko =
    (String(item.barcode) === "25014783" || String(item.kode) === "2500053") &&
    String(item.ukuran).toUpperCase() === "A6" &&
    (item.harga === 0 || item.terhitungPromo || item.promo === "PRO-2026-001");

  showConfirmation(() => {
    addAdjustmentLog(item.kode, -item.jumlah!, "DELETE_ITEM", "Penghapusan baris oleh SC");
    items.value = items.value.filter((i) => i.id !== id);

    if (isStickerPromoToko) {
      isStickerBonusRejected.value = true;
      toast.info("Bonus Stiker dihapus secara manual.");
    }

    calculateTotals();
  }, `Hapus item ${item.nama}?`);
};

const addAdjustmentLog = (
  kode: string,
  qty: number,
  type: SoAdjustmentLog["type"], // Mengambil tipe dari interface (menghindari 'any')
  ket: string
) => {
  const item = items.value.find((i) => i.kode === kode);

  // Sekarang TypeScript tidak akan protes karena properti sudah cocok dengan interface
  adjustmentLogs.value.push({
    id: `ADJ-${Date.now()}`,
    timestamp: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
    kode: kode,
    nama: item?.nama || "Unknown",
    qty: qty,
    type: type, // Tidak perlu 'as any' lagi
    user: authStore.user?.nama || "Unknown",
    reason: ket,
  });
};

// const handleSaveSpk = async (spkPayload: any) => {
//   try {
//     // Logic kirim ke backend SPK
//     const response = await api.post("/so-form/generate-spk", spkPayload);
//     toast.success("SPK Berhasil dibuat dan terhubung dengan SO ini.");
//     isSpkDialogVisible.value = false;
//   } catch (error: any) {
//     toast.error(error.response?.data?.message || "Gagal membuat SPK.");
//   }
// };

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
      params: { cabang: header.value.gudang.kode },
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

    // [FIX] Pisahkan Nama DTF dengan Promo
    header.value.namaDtf = penHeader.pen_nama_dtf || "";
    header.value.nomorPromo = penHeader.pen_promo_nomor || "";

    // Jika ada nomor promo, tampilkan keterangan promo, jika tidak kosongkan
    header.value.namaPromo = penHeader.pen_promo_nomor ? "Diskon Promo Aktif" : "";

    // 6. Isi State Footer (Diskon & Biaya Kirim)
    footer.value.biayaKirim = Number(penHeader.pen_bkrm) || 0;
    footer.value.diskonRp = Number(penHeader.pen_disc) || 0;
    footer.value.diskonPersen1 = Number(penHeader.pen_disc1) || 0;
    footer.value.diskonPersen2 = Number(penHeader.pen_disc2) || 0;

    // 7. Pemetaan Rincian DP (Down Payment)
    dpItems.value = ((dps as DpApiResult[]) || []).map((dp) => ({
      ...dp,
      posting: dp.posting || "BELUM",
      fsk: dp.fsk || "",
    }));

    // 8. Pemetaan Item Detail (Termasuk Logika Custom Order)
    items.value = (penDetails as PenawaranDetailApi[]).map((d) => {
      let parsedJson: CustomTechData = {};
      const isCustom = d.pend_custom === "Y";

      // Parse data teknis jika barang custom
      if (isCustom && d.pend_custom_data) {
        try {
          parsedJson =
            typeof d.pend_custom_data === "string"
              ? JSON.parse(d.pend_custom_data)
              : d.pend_custom_data;
        } catch (e) {
          console.error("Gagal parse data teknis custom:", e);
        }
      }

      // Gabungkan daftar ukuran unik untuk tampilan grid
      const ringkasanUkuran =
        d.pend_ukuran ||
        (parsedJson.ukuranKaos
          ? [...new Set(parsedJson.ukuranKaos.map((u) => u.ukuran))].join(", ")
          : "");

      return {
        id: Date.now() + Math.random(),
        kode: d.pend_kode,
        nama: d.nama_barang, // Membawa nama asli atau nama custom dtf dari backend
        kategori: d.kategori || (isCustom ? "PESANAN" : "REGULER"),
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
        scannedQty: 0, // 👈 Inisialisasi wajib
        isReady: false, // 👈 Inisialisasi wajib
        pin: "",

        // Flagging Data Custom untuk integrity saat Save SO
        isCustomOrder: isCustom,
        sod_custom: d.pend_custom,
        sod_custom_nama: isCustom ? d.nama_barang : null,
        sod_custom_data:
          typeof d.pend_custom_data === "object"
            ? JSON.stringify(d.pend_custom_data)
            : d.pend_custom_data,

        // Data rincian untuk kebutuhan modal JenisOrder (jika di-edit di layar SO)
        ukuranKaos: parsedJson.ukuranKaos || [],
        titikCetak: parsedJson.titikCetak || [],
        sourceItems: parsedJson.sourceItems || [],
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
      toast.error(
        `Gagal memuat detail Penawaran: ${error.response?.data?.message || error.message}`
      );
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
        scannedQty: 0, // 👈 TAMBAHKAN INI
        isReady: false, // 👈 TAMBAHKAN INI
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
        scannedQty: isJasa ? product.jumlah || 1 : 0, // Jasa otomatis Ready
        isReady: isJasa,
        pin: "",
      });
    }
  });

  addNewRow();
  calculateTotals();
};

const onSoDtfSelected = async (soDtf: { nomor: string; isLhk?: number | boolean }) => {
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
          isLhk: !!soDtf.isLhk,
          stok: 0,
          diskonPersen: 0,
          diskonRp: 0,
          barcode: "",
          noPengajuanHarga: "",
          pin: "",
          scannedQty: 0, // 👈 TAMBAHKAN INI
          isReady: false, // 👈 TAMBAHKAN INI
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
        scannedQty: 0, // 👈 TAMBAHKAN INI
        isReady: false, // 👈 TAMBAHKAN INI
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

  if (footer.value.diskonRp > 0 && (footer.value.diskonPersen1 === 0 || !footer.value.pinDiskon1)) {
    return;
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
  footer.value.diskonPersen2 = newData.diskonPersen2; // Simpan nilai MAPS 5%
  footer.value.biayaKirim = newData.biayaKirim;

  // KUNCI: Ambil nilai diskonRp hasil kalkulasi gabungan dari modal
  // Modal sudah menghitung: (Nominal Dasar + Persen 1 + Persen 2)
  if (newData.diskonRp > 0) {
    footer.value.diskonRp = newData.diskonRp;
  }

  // 2. Logika Pemutusan Jalur Promo
  // Hanya hapus identitas promo jika terjadi otorisasi manual pada Diskon 1 (Member Utama)
  if (newData.pinDiskon1 || (newData.diskonPersen1 > 0 && !header.value.nomorPromo)) {
    header.value.nomorPromo = "";
    header.value.namaPromo = "";
    lastSuggestedPromo.value = "MANUAL_AUTH"; // Kunci agar tidak tawarkan promo otomatis lagi
  }

  // 3. Simpan PIN & Nomor Otorisasi
  if (newData.pinDiskon1) footer.value.pinDiskon1 = newData.pinDiskon1;
  if (newData.pinDiskon2) footer.value.pinDiskon2 = newData.pinDiskon2;
  if (newData.authNomor) header.value.nomorAuth = newData.authNomor;

  // 4. Hitung ulang Grand Total secara menyeluruh
  calculateTotals();

  toast.success("Diskon dan biaya berhasil diperbarui.");
};

const handleItemDiscountChange = (index: number) => {
  const item = items.value[index];

  // [BARU] Proteksi Input Manual
  if (item.noPengajuanHarga) {
    if (item.diskonPersen > 0 || item.diskonRp > 0) {
      toast.warning(
        "Item dengan No. Pengajuan Harga tidak diperbolehkan mendapat diskon tambahan."
      );
      item.diskonPersen = 0;
      item.diskonRp = 0;
    }
    calculateTotals();
    return;
  }

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

    const info = `Cust: ${header.value.customer?.nama || "Umum"}\nItem: ${item.nama}\nDiskon: ${
      currentPersen > 0 ? currentPersen + "%" : formatRupiah(currentRp)
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

// const handleBarcodeScan = async () => {
//   if (!header.value.customer?.kode) {
//     // Ganti 'header.value.customer?.kode' jika perlu
//     toast.error("Pilih customer terlebih dahulu sebelum scan barcode!");
//     return; // Hentikan fungsi jika customer belum dipilih
//   }
//   const barcode = scannedBarcode.value;
//   if (!barcode) return;

//   // --- LOGIKA 1: Jika barang sudah ada di grid, tambah jumlahnya ---
//   const existingItem = items.value.find((item) => item.barcode === barcode && item.kode);
//   if (existingItem) {
//     existingItem.jumlah += 1;
//     // Panggil fungsi untuk hitung ulang total jika ada
//     // calculateTotals();
//     toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
//     scannedBarcode.value = ""; // Kosongkan input untuk scan berikutnya
//     return;
//   }

//   // --- LOGIKA 2: Jika barang belum ada, cari via API dan tambahkan baris baru ---
//   try {
//     // Panggil API baru yang kita buat
//     const response = await api.get(`/so-form/by-barcode/${barcode}`, {
//       params: { gudang: header.value.gudang.kode }, // Sesuaikan dengan cara Anda menyimpan kode gudang
//     });

//     const product = response.data;

//     let initHarga = Number(product.harga);
//     if (header.value.isMarketplace) {
//       initHarga = Number(product.harga3 || 0);
//     }

//     // Cari baris kosong pertama untuk diganti
//     const emptyRowIndex = items.value.findIndex((item) => !item.kode);

//     if (emptyRowIndex !== -1) {
//       // Ganti baris kosong dengan data produk baru
//       items.value.splice(emptyRowIndex, 1, {
//         id: Date.now(),
//         kode: product.kode as string,
//         nama: product.nama as string,
//         ukuran: product.ukuran as string,
//         kategori: product.kategori as string,
//         stok: Number(product.stok),
//         harga: initHarga,
//         jumlah: 1, // Default jumlah 1
//         diskonPersen: 0,
//         diskonRp: 0,
//         total: initHarga * 1,
//         barcode: product.barcode as string,
//         noSoDtf: "", // default kosong
//         noPengajuanHarga: "", // default kosong
//         scannedQty: 0, // 👈 TAMBAHKAN INI
//         isReady: false, // 👈 TAMBAHKAN INI
//         pin: "", // default kosong
//       });
//       addNewRow(); // Tambah baris kosong baru di akhir
//     } else {
//       // Jika tidak ada baris kosong (seharusnya tidak terjadi jika addNewRow dipakai)
//       // Anda bisa tambahkan logika push di sini
//       toast.error("Tidak ada baris kosong untuk menambahkan item baru.");
//     }

//     // Panggil fungsi untuk hitung ulang total jika ada
//     // calculateTotals();
//   } catch (err: unknown) {
//     if (axios.isAxiosError(err)) {
//       // Error berasal dari Axios
//       toast.error(err.response?.data?.message || `Barcode ${barcode} tidak valid.`);
//     } else if (err instanceof Error) {
//       // Error JS biasa
//       toast.error(err.message);
//     } else {
//       // Error tak dikenal
//       toast.error(`Barcode ${barcode} tidak valid.`);
//     }
//   } finally {
//     scannedBarcode.value = "";
//   }
// };

const handleBarcodeScanVerify = async () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  const item = items.value.find((i) => i.barcode === barcode && i.kode);

  if (!item) {
    toast.error("Barang tidak ditemukan dalam daftar Order!");
    scannedBarcode.value = "";
    return;
  }

  // Gunakan casting Number agar tidak NaN saat dijumlahkan
  const target = Number(item.jumlah || 0);
  const current = Number(item.scannedQty || 0);

  if (target === 0) {
    toast.error(`Isi Qty Order untuk ${item.nama} terlebih dahulu.`);
    scannedBarcode.value = "";
    return;
  }

  if (current < target) {
    item.scannedQty = current + 1;
    // Update status ready
    item.isReady = item.scannedQty >= target;

    addAdjustmentLog(item.kode, 1, "SCAN", "Verifikasi fisik barang");
    toast.success(`${item.nama} terverifikasi (${item.scannedQty}/${target})`);
  } else {
    toast.warning("Qty Ready sudah memenuhi atau melebihi jumlah Order.");
  }

  scannedBarcode.value = "";
};

// Fungsi navigasi ke Mutasi Stok
const goToMutasiPesanan = () => {
  if (!header.value.nomor) {
    toast.error("Simpan SO terlebih dahulu untuk mendapatkan nomor referensi mutasi.");
    return;
  }

  // Resolve URL ke halaman Mutasi dengan query param
  const routeData = router.resolve({
    name: "MutasiStokCreate", // Sesuaikan dengan nama route di router/index.ts
    query: {
      refSo: header.value.nomor,
      autoLoad: "true",
    },
  });

  window.open(routeData.href, "_blank");
};

const goToBatalMutasi = () => {
  if (!header.value.nomor) return;

  const routeData = router.resolve({
    name: "MutasiStokCreate", // Sesuaikan dengan nama route Mutasi Anda
    query: {
      refSo: header.value.nomor,
      jenis: "PS", // Langsung set jenis Pesanan ke Showroom
      autoLoad: "true", // Perintahkan halaman mutasi untuk langsung cari data
    },
  });

  window.open(routeData.href, "_blank");
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
    scannedQty: 0, // 👈 Fix Error: scannedQty missing
    isReady: false, // 👈 Fix Error: isReady missing
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
  if (!header.value.nomor) {
    toast.error("Simpan SO terlebih dahulu untuk mendapatkan nomor referensi.");
    return;
  }

  const url = router.resolve({
    path: "/transaksi/penjualan/dtf/so-dtf/new",
    query: {
      refSo: header.value.nomor,
      // 👈 TAMBAHKAN INI: Kirim ID unik baris (misal: timestamp id dari frontend)
      lineId: item.id,
    },
  }).href;
  window.open(url, "_blank");
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
  const nameUp = item.nama?.toUpperCase() || "";
  const kategoriUp = item.kategori?.toUpperCase() || "";

  const isReguler = kategoriUp === "REGULER";
  const isJersey = nameUp.includes("JERSEY");
  // [FIX] Tambahkan isCustomOrder agar Jenis Order Sablon ikut terhitung
  const isDtf = !!item.noSoDtf || item.isCustomOrder || nameUp.includes("DTF");

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

    scannedQty: 0, // 👈 Fix Error: scannedQty missing
    isReady: false, // 👈 Fix Error: isReady missing

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
  if (header.value.penawaran || authStore.user?.cabang === "KDC") {
    promoNotification.value = "";
    potentialPromoDiscount.value = 0;
    return false;
  }

  if (
    footer.value.pinDiskon1 ||
    footer.value.pinDiskon2 ||
    lastSuggestedPromo.value === "MANUAL_AUTH"
  ) {
    promoNotification.value = "";
    return false;
  }

  if (isEditMode.value && header.value.nomorPromo) {
    promoNotification.value = "";
    potentialPromoDiscount.value = 0;
    return true;
  }

  if (isEditMode.value && isInitialLoad.value) {
    return !!header.value.nomorPromo;
  }

  promoNotification.value = "";
  potentialPromoDiscount.value = 0;
  isGrandOpeningPromo.value = false;

  const validItems = items.value.filter((i) => i.kode);
  if (validItems.length === 0) return false;

  let currentCalculatedDiscount = 0;
  let message = "";
  let promoCandidate: ActivePromo | null = null;

  const isStickerGeneric = (item: SoItem) =>
    String(item.barcode) === "25014783" || String(item.kode) === "2500053";

  // Hitung Total Nilai Eligible Promo
  const totalEligibleValue = validItems.reduce((sum, item) => {
    return isItemPromoEligible(item) && !isStickerGeneric(item) ? sum + (item.total || 0) : sum;
  }, 0);

  const promoApril = activePromosList.value.find((p) => p.pro_nomor === "PRO-2026-002");
  const promo2026 = activePromosList.value.find((p) => p.pro_nomor === "PRO-2026-001");

  // --- [PRIORITAS 1] PROMO APRIL 2026 (PRO-2026-002) ---
  if (promoApril && totalEligibleValue >= 250000) {
    const kelipatan = Math.floor(totalEligibleValue / 250000);
    currentCalculatedDiscount = 12500 * kelipatan;
    message = `🎉 PROMO APRIL! Anda berhak Potongan Rp ${formatRupiah(currentCalculatedDiscount)}!`;
    promoCandidate = promoApril;
  }
  // --- [PRIORITAS 2] PROMO MARET 2026 (PRO-2026-001) ---
  else if (promo2026 && totalEligibleValue >= 200000) {
    const kelipatan = Math.floor(totalEligibleValue / 200000);
    currentCalculatedDiscount = 20000 * kelipatan;
    message = `🎉 PROMO MARET! Anda berhak Potongan Rp ${formatRupiah(currentCalculatedDiscount)}!`;
    promoCandidate = promo2026;

    if (totalEligibleValue >= 600000 && !isStickerBonusRejected.value) {
      const totalKaosQty = validItems.reduce((sum, item) => {
        const isCustomDtf = item.isCustomOrder || !!item.noSoDtf;
        return isItemPromoEligible(item) && !isStickerGeneric(item) && !isCustomDtf
          ? sum + (Number(item.jumlah) || 0)
          : sum;
      }, 0);

      const baseBonusQty = totalKaosQty;

      const customStickerQty = validItems.reduce((sum, item) => {
        const isCustomDtf = item.isCustomOrder || !!item.noSoDtf;
        const isA6 =
          String(item.ukuran).toUpperCase() === "A6" ||
          String(item.nama).toUpperCase().includes("A6") ||
          String(item.nama).toUpperCase().includes("STICKER");
        return isCustomDtf && isA6 ? sum + (Number(item.jumlah) || 0) : sum;
      }, 0);

      const finalBonusQty = Math.max(0, baseBonusQty - customStickerQty);

      if (finalBonusQty > 0) {
        message += ` + 🎁 FREE ${finalBonusQty} pcs Sticker DTF A6!`;
      } else if (baseBonusQty > 0 && customStickerQty >= baseBonusQty) {
        message += ` + 🎁 BONUS MARET (Stiker sudah diganti via DTF Custom)`;
      }
    }
  }
  // --- [PRIORITAS 3] PROMO LAMA ---
  else if (currentCalculatedDiscount === 0 && !message.includes("💡")) {
    const promo010 = activePromosList.value.find((p) => p.pro_nomor === "PRO-2025-010");
    const promo008 = activePromosList.value.find((p) => p.pro_nomor === "PRO-2025-008");

    const totalRegulerDec = validItems.reduce((sum, item) => {
      if (
        item.kategori === "REGULER" &&
        !item.nama?.toUpperCase().includes("JERSEY") &&
        !item.noSoDtf
      ) {
        return sum + (item.total || 0);
      }
      return sum;
    }, 0);

    const totalBelanjaDec = validItems.reduce((sum, item) => {
      if (!item.noSoDtf && !item.noPengajuanHarga) return sum + (item.total || 0);
      return sum;
    }, 0);

    if (promo010 && totalRegulerDec >= 250000) {
      const kelipatan = Math.floor(totalRegulerDec / 250000);
      currentCalculatedDiscount = 25000 * kelipatan;
      message = `🎉 SELAMAT! Transaksi ini berhak Potongan Kelipatan Rp ${formatRupiah(
        currentCalculatedDiscount
      )}!`;
      promoCandidate = promo010;
    } else if (promo008 && totalBelanjaDec >= promo008.pro_totalrp) {
      currentCalculatedDiscount =
        promo008.pro_disrp * Math.floor(totalBelanjaDec / promo008.pro_totalrp);
      message = `✨ DISKON BULANAN: Anda berhak potongan Rp ${formatRupiah(
        currentCalculatedDiscount
      )}`;
      promoCandidate = promo008;
    }
  }

  if (message) {
    promoNotification.value = message;
    potentialPromoDiscount.value = currentCalculatedDiscount;

    // Masukkan PRO-2026-002 ke dalam daftar auto-apply
    const autoPromoIds = ["PRO-2025-008", "PRO-2025-010", "PRO-2026-001", "PRO-2026-002"];
    if (header.value.nomorPromo && autoPromoIds.includes(header.value.nomorPromo)) {
      if (promoCandidate && header.value.nomorPromo === promoCandidate.pro_nomor) {
        footer.value.diskonRp = currentCalculatedDiscount;
        // Terapkan stiker HANYA JIKA promo yang aktif adalah Promo Maret
        if (promoCandidate.pro_nomor === "PRO-2026-001" && !isStickerBonusRejected.value) {
          applyMarchBonusSticker(false);
        }
        return true;
      }
    }

    if (
      currentCalculatedDiscount > 0 &&
      promoCandidate &&
      lastSuggestedPromo.value !== promoCandidate.pro_nomor &&
      lastSuggestedPromo.value !== "MANUAL_AUTH"
    ) {
      pendingPromoData.nomor = promoCandidate.pro_nomor;
      pendingPromoData.nama = promoCandidate.pro_judul;
      pendingPromoData.diskon = currentCalculatedDiscount;
      isPromoConfirmVisible.value = true;
    }
  }

  if (
    header.value.nomorPromo &&
    promoCandidate &&
    header.value.nomorPromo === promoCandidate.pro_nomor
  ) {
    footer.value.diskonRp = currentCalculatedDiscount;
    return true;
  }

  return false;
};

const usePromoDiscount = async () => {
  header.value.nomorPromo = pendingPromoData.nomor;
  header.value.namaPromo = pendingPromoData.nama;
  footer.value.diskonRp = pendingPromoData.diskon;

  footer.value.diskonPersen1 = 0;
  footer.value.diskonPersen2 = 0;

  isPromoConfirmVisible.value = false;
  isStickerBonusRejected.value = false; // Buka status blokir

  if (header.value.nomorPromo === "PRO-2026-001") {
    await applyMarchBonusSticker(true);
  }

  calculateTotals();
  toast.success(`Promo ${pendingPromoData.nama} berhasil diterapkan.`);
};

const useMemberDiscount = () => {
  const rejectedId = pendingPromoData.nomor || header.value.nomorPromo;
  header.value.nomorPromo = "";
  header.value.namaPromo = "";
  footer.value.diskonRp = 0;

  lastSuggestedPromo.value = rejectedId || "MANUAL_AUTH";
  isPromoConfirmVisible.value = false;

  isStickerBonusRejected.value = true;

  // Hapus HANYA stiker promo A6 yang 0 Rupiah
  const existingIdx = items.value.findIndex(
    (i) =>
      (String(i.barcode) === "25014783" || String(i.kode) === "2500053") &&
      String(i.ukuran).toUpperCase() === "A6" &&
      (i.harga === 0 || i.terhitungPromo || i.promo === "PRO-2026-001")
  );

  if (existingIdx !== -1) {
    items.value.splice(existingIdx, 1);
  }

  applyDefaultDiscount();
  calculateTotals();
  toast.info("Promo dilepas, kembali ke diskon member.");
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

const autoReadyJasa = () => {
  items.value.forEach((item) => {
    const kodeUp = item.kode?.toUpperCase() || "";
    const namaUp = item.nama?.toUpperCase() || "";

    // 1. Deteksi apakah ini item Jasa/Ongkir
    const isJasaMurni =
      item.isJasa ||
      kodeUp.startsWith("JASA") ||
      kodeUp.startsWith("JS") ||
      namaUp.includes("JASA") ||
      namaUp.includes("ONGKIR");

    if (isJasaMurni && item.kode) {
      // [PENTING] Set flag isJasa agar diabaikan filter allMutated
      item.isJasa = true;

      const targetQty = Number(item.jumlah || 0);
      if (item.scannedQty !== targetQty) {
        item.scannedQty = targetQty;
        item.isReady = true;
      }
    }

    // 2. Kriteria Custom & SO DTF tetap sama
    const isSpecialOrder =
      item.kode === "CUSTOM" ||
      item.isCustomOrder === true ||
      (!!item.noSoDtf && item.noSoDtf !== "");

    if (isSpecialOrder && item.kode) {
      const targetQty = Number(item.jumlah || 0);
      if (item.scannedQty !== targetQty) {
        item.scannedQty = targetQty;
        item.isReady = true;
      }
    }
  });
};

const getTypeColor = (type: string) => {
  switch (type) {
    case "SCAN":
      return "success";
    case "DELETE_ROW":
      return "error";
    case "DELETE_ITEM":
      return "error";
    case "MANUAL_ADD":
      return "info";
    case "MANUAL_REMOVE":
      return "warning";
    default:
      return "grey";
  }
};

const refreshOnFocus = () => {
  if (isEditMode.value && header.value.nomor && !isLoading.value) {
    console.log("Tab focused: Silent refreshing mutation status for", header.value.nomor);
    loadDataForEdit(header.value.nomor, true); // 👈 silent = true
  }
};

const decrementReady = (item: SoItem) => {
  // Jangan kurangi jika qty sudah 0
  if (item.scannedQty <= 0) return;

  // Proteksi: Barang Jasa/Custom/DTF tidak bisa dikurangi manual karena statusnya "Auto Ready"
  if (item.isJasa || item.isCustomOrder || !!item.noSoDtf) {
    toast.warning("Qty barang Jasa/Custom otomatis mengikuti Qty Order.");
    return;
  }

  // Kurangi qty
  item.scannedQty -= 1;
  item.isReady = item.scannedQty >= (item.jumlah || 0);

  // Catat ke log koreksi agar terpantau manager
  addAdjustmentLog(item.kode, -1, "MANUAL_REMOVE", "Pengurangan qty scan manual oleh SC");

  toast.info(`Verifikasi ${item.nama} dikurangi menjadi ${item.scannedQty}`);
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

  if (route.query.refPenawaran) {
    const nomorPen = route.query.refPenawaran as string;
    // Panggil fungsi existing yang sudah Anda miliki untuk load penawaran
    onPenawaranSelected({ nomor: nomorPen });
  }
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
  window.addEventListener("focus", refreshOnFocus);
  window.addEventListener("keydown", handleGlobalShortcuts);
});

onUnmounted(() => {
  window.removeEventListener("focus", refreshOnFocus);

  window.removeEventListener("keydown", handleGlobalShortcuts);
});
const blockedSelectors = [".so-dtf-field", ".pengajuan-field"];
const handleGlobalShortcuts = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  if (blockedSelectors.some((sel) => target.closest(sel))) return;

  if (e.code === "F1") {
    e.preventDefault();
    openProductSearch(activeRowIndex.value, false, false); // F1 = Pake Promo
  }
  if (e.code === "F2") {
    e.preventDefault();
    openProductSearch(activeRowIndex.value, true, false); // F2 = Multi Pake Promo
  }
  if (e.code === "F3") {
    e.preventDefault();
    // F3 = Buka SEMUA barang (Abaikan Promo)
    openProductSearch(activeRowIndex.value, true, true);
    toast.info("Mencari seluruh master barang (Filter Promo Dimatikan)");
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
      <v-btn
        size="small"
        :color="isLeftColumnVisible ? 'blue-grey' : 'primary'"
        :variant="isLeftColumnVisible ? 'tonal' : 'flat'"
        :prepend-icon="isLeftColumnVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
        @click="isLeftColumnVisible = !isLeftColumnVisible"
      >
        {{ isLeftColumnVisible ? "Sembunyikan Header" : "Tampilkan Header" }}
      </v-btn>
      <!-- <v-btn color="indigo-darken-2" size="small" prepend-icon="mdi-hammer-wrench"
        :disabled="!header.nomor || !header.customer" @click="isSpkDialogVisible = true">
        Buat SPK Produksi
      </v-btn> -->
      <v-btn
        color="secondary"
        size="small"
        prepend-icon="mdi-tshirt-crew-outline"
        :disabled="!header.customer && !header.penawaran"
        @click="openJenisOrderModal"
      >
        Input Jenis Order
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn
        size="small"
        color="primary"
        prepend-icon="mdi-content-save"
        @click="save"
        :loading="isSaving"
        :disabled="isSaving || isSavingDisabled"
      >
        Simpan
      </v-btn>
      <v-btn
        size="small"
        color="success"
        prepend-icon="mdi-receipt-text-plus"
        @click="saveAndConvertToInvoice"
        :loading="isSaving"
        :disabled="
          isSaving || isSavingDisabled || !allMutated || (hasUnfinishedDtf && !isExemptFromLhkRule)
        "
      >
        Jadikan Invoice
      </v-btn>

      <div
        v-if="hasUnfinishedDtf && !isExemptFromLhkRule"
        class="text-caption text-error mt-1 font-weight-bold"
      >
        * Ada item SO DTF yang belum selesai dikerjakan (LHK).
      </div>

      <div
        v-else-if="hasUnfinishedDtf && isExemptFromLhkRule"
        class="text-caption text-warning mt-1 font-weight-bold"
      >
        * Peringatan: Ada SO DTF belum LHK (Akses khusus K01/K03 diizinkan).
      </div>
      <v-btn
        size="small"
        prepend-icon="mdi-cancel"
        @click="showConfirmation(resetForm, 'Batalkan perubahan dan kosongkan form?')"
      >
        Batal
      </v-btn>
      <v-btn
        size="small"
        prepend-icon="mdi-close"
        @click="
          showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')
        "
      >
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container" :class="{ 'hide-left': !isLeftColumnVisible }">
      <!-- Kolom Kiri -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <template v-if="header.isMarketplace">
            <div class="bg-orange-lighten-5 pa-2 mb-3 rounded border border-dashed border-orange">
              <div
                class="text-subtitle-2 font-weight-bold text-orange-darken-4 mb-2 d-flex align-center"
              >
                <v-icon size="small" class="mr-1">mdi-store</v-icon>
                MODE PESANAN MARKETPLACE
              </div>
              <v-row dense>
                <v-col cols="6">
                  <v-text-field
                    label="Nomor Pesanan Marketplace"
                    v-model="header.mpNomorPesanan"
                    variant="outlined"
                    density="compact"
                    prepend-inner-icon="mdi-clipboard-text"
                    hide-details
                    bg-color="white"
                    placeholder="Paste No. Pesanan"
                  />
                </v-col>
                <v-col cols="6">
                  <v-text-field
                    label="Nomor Resi (AWB)"
                    v-model="header.mpResi"
                    variant="outlined"
                    density="compact"
                    prepend-inner-icon="mdi-barcode"
                    hide-details
                    bg-color="white"
                    placeholder="Scan Resi"
                  />
                </v-col>
              </v-row>
            </div>
          </template>
          <v-row dense>
            <v-col cols="5">
              <v-text-field
                label="Gudang"
                :disabled="!!header.penawaran"
                :model-value="header.gudang.kode"
                readonly
                @click="openGudangSearch"
                :class="{ 'field-disabled': isEditMode }"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
              />
            </v-col>
            <v-col cols="7">
              <v-text-field
                :model-value="header.gudang.nama"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6"
              ><v-text-field
                label="Nomor"
                v-model="header.nomor"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6">
              <v-text-field
                label="Tanggal"
                v-model="header.tanggal"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
                :readonly="isEditMode"
                :min="!isEditMode ? format(new Date(), 'yyyy-MM-dd') : undefined"
                :max="!isEditMode ? format(new Date(), 'yyyy-MM-dd') : undefined"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Customer"
                :disabled="!!header.penawaran"
                :model-value="
                  header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''
                "
                readonly
                @click="isCustomerSearchVisible = true"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
              >
                <template #prepend-inner>
                  <v-btn
                    :disabled="!!header.penawaran"
                    icon="mdi-account-plus"
                    size="x-small"
                    variant="tonal"
                    class="me-2"
                    @click.stop="isNewCustomerFormVisible = true"
                    title="Buat Customer Baru"
                  ></v-btn>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="6"
              ><v-text-field
                label="Dateline"
                v-model="header.dateline"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12">
              <v-text-field
                label="Alamat"
                :model-value="header.customer?.alamat"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Kota / Telp"
                :model-value="
                  header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''
                "
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Level"
                v-model="header.levelNama"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6" v-if="!header.isMarketplace">
              <v-text-field
                label="No. Penawaran"
                v-model="header.penawaran"
                readonly
                @click="openPenawaranSearch"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                clearable
                @click:clear="header.penawaran = ''"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Sales Counter"
                v-model="header.salesCounter"
                readonly
                @click="openSalesCounterSearch"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
              />
            </v-col>
            <v-col cols="2">
              <v-text-field
                label="TOP"
                v-model.number="header.top"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Tempo/Tgl"
                v-model="header.tempo"
                type="date"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                label="PPN %"
                v-model.number="header.ppnPersen"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </v-col>
            <v-col cols="12"
              ><v-text-field
                label="Keterangan"
                v-model="header.keterangan"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="4" v-if="!header.isMarketplace">
              <v-text-field
                label="Promo"
                v-model="header.nomorPromo"
                @click="dialogs.promoSearch = true"
                prepend-inner-icon="mdi-ticket-percent"
                density="compact"
                hide-details
                placeholder="F1..."
                readonly
              />
            </v-col>
            <v-col cols="8" v-if="!header.isMarketplace">
              <v-text-field
                label="Nama Promo"
                v-model="header.namaPromo"
                density="compact"
                readonly
                filled
                hide-details
              />
            </v-col>
          </v-row>
        </div>
        <div class="desktop-form-section status-section" v-if="!header.isMarketplace">
          <v-alert
            density="compact"
            variant="tonal"
            :color="header.statusSo === 'AKTIF' ? 'success' : 'error'"
            class="mb-2 d-flex align-center"
          >
            Status SO: <strong>{{ header.statusSo }}</strong>
            <v-spacer />
            <div class="text-caption text-center">{{ minimalDpText }}</div>
            <v-tooltip location="bottom">
              <template #activator="{ props }">
                <v-icon
                  v-bind="props"
                  :color="
                    footer.totalDp >= footer.minimalDp || footer.pinTanpaDp ? 'success' : 'warning'
                  "
                >
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
        <div class="desktop-form-section scanner-section mb-2">
          <v-row dense align="center">
            <v-col cols="12" md="6">
              <v-text-field
                v-model="scannedBarcode"
                label="Scan Verifikasi Barang (Wajib)"
                placeholder="Arahkan scanner ke barcode..."
                variant="outlined"
                density="compact"
                prepend-inner-icon="mdi-barcode-scan"
                hide-details
                @keydown.enter.prevent="handleBarcodeScanVerify"
                :color="allVerified ? 'success' : 'primary'"
              />
            </v-col>

            <v-col cols="12" md="6" class="d-flex ga-2 justify-end">
              <v-btn
                color="deep-orange-darken-2"
                @click="goToMutasiPesanan"
                :disabled="!header.nomor || !hasReadyItems"
              >
                Mutasikan ke Stok Pesanan
              </v-btn>

              <v-btn
                color="blue-grey"
                variant="outlined"
                size="small"
                prepend-icon="mdi-history"
                @click="isAdjustmentLogVisible = true"
              >
                Log
              </v-btn>
            </v-col>
          </v-row>
        </div>
        <!-- Wrapper untuk bagian yang bisa scroll -->
        <div class="scrollable-content">
          <div class="desktop-form-section main-grid-section">
            <v-alert
              v-if="items.some((i) => i.isMutated)"
              type="info"
              variant="tonal"
              density="compact"
              class="text-caption flex-grow-1 ma-0"
              prepend-icon="mdi-information-outline"
            >
              Item bertanda <v-icon size="small">mdi-lock-open-variant</v-icon> terkunci karena
              sudah mutasi.
            </v-alert>
            <v-data-table
              :headers="mainTableHeaders"
              :items="items"
              :page="page"
              :items-per-page="rowsPerPage"
              :item-key="'id'"
              class="desktop-table vertically-aligned-table"
              fixed-header
              :item-class="
                (item) => (item.isMutated ? 'row-locked' : item.isCustomOrder ? 'custom-row' : '')
              "
            >
              <template #[`item.kode`]="{ item, index }">
                <div class="d-flex align-center">
                  <v-icon
                    v-if="item.isCustomOrder"
                    color="blue"
                    size="18"
                    class="me-2"
                    title="Item Custom (Jenis Order)"
                  >
                    mdi-tshirt-crew-outline
                  </v-icon>

                  <v-text-field
                    v-model="item.kode"
                    @focus="activeRowIndex = index"
                    @click="activeRowIndex = index"
                    variant="underlined"
                    density="compact"
                    hide-details
                    placeholder="F1/F2..."
                    :disabled="item.isCustomOrder"
                    @keydown.f1.prevent="!item.isCustomOrder && openProductSearch(index, false)"
                    @keydown.f2.prevent="!item.isCustomOrder && openProductSearch(index, true)"
                  />
                </div>
              </template>
              <template #[`item.nama`]="{ item }">
                <div class="product-name-cell">{{ item.nama }}</div>
              </template>
              <template #[`item.barcode`]="{ item }">
                <v-text-field
                  v-model="item.barcode"
                  variant="underlined"
                  density="compact"
                  hide-details
                  readonly
                  class="text-caption grey--text"
                  placeholder="-"
                />
              </template>
              <template #[`item.kategori`]="{ item }">
                <div v-if="!item.isCustomOrder && item.kode">
                  <v-chip
                    size="x-small"
                    :color="getCategoryColor(item.kategori)"
                    variant="flat"
                    class="font-weight-bold text-white"
                  >
                    {{ item.kategori || "TANPA KATEGORI" }}
                  </v-chip>
                </div>
              </template>
              <template #[`item.jumlah`]="{ item }">
                <v-text-field
                  v-model.number="item.jumlah"
                  type="number"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-end font-weight-bold"
                  :disabled="item.isMutated"
                  :hint="item.isMutated ? 'Sudah dimutasi' : ''"
                  @update:model-value="calculateTotals"
                />
              </template>

              <template #[`item.scannedQty`]="{ item }">
                <div class="d-flex align-center justify-end ga-2">
                  <v-btn
                    v-if="
                      !item.isMutated &&
                      !item.isJasa &&
                      !item.isCustomOrder &&
                      !item.noSoDtf &&
                      item.scannedQty > 0
                    "
                    icon="mdi-minus-circle-outline"
                    size="x-small"
                    variant="text"
                    color="error"
                    @click="decrementReady(item)"
                    title="Kurangi verifikasi"
                  />

                  <v-chip
                    v-if="item.isMutated"
                    size="small"
                    color="success"
                    variant="flat"
                    class="font-weight-black"
                  >
                    <v-icon start size="14">mdi-lock-check</v-icon>
                    {{ item.scannedQty || 0 }} Ready
                  </v-chip>

                  <v-chip
                    v-else-if="item.kode === 'CUSTOM' || item.noSoDtf || item.isJasa"
                    size="small"
                    color="blue-darken-2"
                    variant="flat"
                    class="font-weight-black"
                  >
                    <v-icon start size="14">mdi-cog-sync</v-icon>
                    {{ item.scannedQty || 0 }} Auto
                  </v-chip>

                  <v-chip
                    v-else
                    size="small"
                    :color="item.scannedQty >= item.jumlah ? 'success' : 'orange-darken-3'"
                    variant="flat"
                    class="font-weight-black"
                  >
                    <v-icon start size="14">mdi-barcode-scan</v-icon>
                    {{ item.scannedQty || 0 }} Ready
                  </v-chip>
                </div>
              </template>
              <template #[`item.harga`]="{ item }">
                <v-text-field
                  v-model.number="item.harga"
                  type="number"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-end"
                  :disabled="item.isMutated || !item.kode"
                  :readonly="!!item.noSoDtf || !!item.noPengajuanHarga"
                  @update:model-value="calculateTotals"
                />
              </template>
              <template #[`item.diskonPersen`]="{ item, index }">
                <v-text-field
                  v-model.number="item.diskonPersen"
                  type="number"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-end"
                  @blur="handleItemDiscountChange(index)"
                />
              </template>
              <template #[`item.diskonRp`]="{ item }">
                <v-text-field
                  :value="
                    focusedRowId === item.id ? item.diskonRp : formatRupiah(item.diskonRp || 0)
                  "
                  @input="
                    item.diskonRp = Number(String($event.target.value).replace(/[^0-9]/g, '')) || 0
                  "
                  @focus="focusedRowId = item.id"
                  @blur="
                    focusedRowId = -1;
                    handleItemDiscountChange(items.indexOf(item));
                  "
                  placeholder="0"
                  type="text"
                  variant="underlined"
                  density="compact"
                  hide-details
                  single-line
                  class="text-end"
                  :disabled="!item.kode"
                  :readonly="item.diskonPersen > 0"
                ></v-text-field>
              </template>
              <template #[`item.total`]="{ item }">
                <div class="text-end text-body-2 font-weight-bold">
                  {{ formatRupiah(item.total || 0) }}
                </div>
              </template>
              <template #[`item.noSoDtf`]="{ item, index }">
                <v-row dense align="center" no-gutters>
                  <v-col>
                    <v-text-field
                      class="so-dtf-field"
                      v-model="item.noSoDtf"
                      variant="underlined"
                      density="compact"
                      hide-details
                      placeholder="F1..."
                      @mousedown.stop
                      @click.stop
                      @keydown.f1.stop.prevent="stopAndOpenSoDtf(index)"
                    />
                  </v-col>

                  <!-- Tombol untuk grid jasa custom -->
                  <v-col cols="auto" v-if="item.isCustomOrder">
                    <v-btn
                      icon="mdi-plus-circle"
                      size="x-small"
                      variant="text"
                      :color="item.noSoDtf ? 'grey-lighten-1' : 'primary'"
                      @click="openSoDtfInNewTab(item)"
                      :disabled="!!item.noSoDtf"
                      :title="item.noSoDtf ? 'SO DTF sudah dibuat' : 'Buat SO DTF Baru'"
                    />
                  </v-col>
                </v-row>
              </template>
              <template #[`item.noPengajuanHarga`]="{ item, index }">
                <v-text-field
                  class="pengajuan-field"
                  v-model="item.noPengajuanHarga"
                  variant="underlined"
                  density="compact"
                  hide-details
                  placeholder="F1..."
                  @mousedown.stop
                  @click.stop
                  @keydown.f1.stop.prevent="stopAndOpenPriceProposal(index)"
                >
                </v-text-field>
              </template>
              <template #[`item.actions`]="{ item }">
                <v-btn
                  v-if="item.kode && !item.isMutated"
                  icon="mdi-delete"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click="removeRow(item.id)"
                />
                <v-btn
                  v-else-if="item.isMutated"
                  icon="mdi-lock-open-variant"
                  size="x-small"
                  variant="tonal"
                  color="orange-darken-2"
                  title="Buka Kunci (Mutasi PS)"
                  @click="goToBatalMutasi"
                />
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
                        <v-icon
                          :icon="
                            isGrandOpeningPromo ? 'mdi-party-popper' : 'mdi-ticket-percent-outline'
                          "
                          size="24"
                          color="white"
                        />
                      </div>
                    </div>
                    <div class="text-container">
                      <div class="promo-label">
                        <v-icon
                          icon="mdi-star-four-points"
                          size="10"
                          class="mr-1"
                          color="yellow-lighten-3"
                        />
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
                    <v-btn
                      v-if="!header.isMarketplace"
                      block
                      color="teal"
                      @click="openDpInput"
                      prepend-icon="mdi-cash-plus"
                    >
                      Input DP (Uang Muka)
                    </v-btn>
                  </v-col>

                  <v-col cols="6">
                    <v-btn
                      color="blue-darken-2"
                      variant="outlined"
                      block
                      prepend-icon="mdi-sale"
                      @click="isDiscountCostModalVisible = true"
                    >
                      Atur Diskon & Biaya
                    </v-btn>
                  </v-col>

                  <v-col cols="6">
                    <v-btn
                      v-if="header.statusSo === 'PASIF'"
                      block
                      color="orange"
                      @click="openDpAuthorization"
                      prepend-icon="mdi-key-variant"
                    >
                      Minta Otorisasi
                    </v-btn>
                  </v-col>

                  <v-col cols="6">
                    <v-btn
                      color="teal"
                      variant="outlined"
                      block
                      prepend-icon="mdi-format-list-bulleted"
                      @click="isDpListModalVisible = true"
                    >
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
                        <span class="text-body-1 text-error"
                          >- {{ formatRupiah(footer.diskonRp) }}</span
                        >
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
                        <span
                          class="text-h6 font-weight-black"
                          :class="footer.belumDibayar > 0 ? 'text-error' : 'text-success'"
                        >
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

    <GudangSearchModal
      v-if="isGudangSearchVisible"
      :user-cabang="authStore.user?.cabang || ''"
      @close="isGudangSearchVisible = false"
      @gudang-selected="onGudangSelected"
    />
    <CustomerSearchModal
      v-if="isCustomerSearchVisible"
      :gudang="header.gudang.kode"
      @close="isCustomerSearchVisible = false"
      @customer-selected="onCustomerSelected"
    />
    <SalesCounterSearchModal
      v-if="isSalesCounterSearchVisible"
      @close="isSalesCounterSearchVisible = false"
      @sales-counter-selected="onSalesCounterSelected"
    />
    <PenawaranSearchModal
      v-if="isPenawaranSearchVisible"
      :cabang="header.gudang.kode"
      @close="isPenawaranSearchVisible = false"
      @selected="onPenawaranSelected"
    />
    <ProductSearchModal
      v-if="isProductSearchVisible"
      :key="isPromoFilterDisabled ? 'all-items' : 'promo-items'"
      :gudang="header.gudang.kode"
      category="ALL"
      :multi="isMultiSelectProduct"
      source="surat-pesanan"
      :promo-nomor="isPromoFilterDisabled ? '' : header.nomorPromo"
      @close="isProductSearchVisible = false"
      @products-selected="onProductsSelected"
    />
    <AuthorizationModal
      v-if="authDialog.show"
      :title="authDialog.title"
      :jenis="authDialog.jenis"
      :nominal="authDialog.nominal"
      :transaksi="authDialog.transaksi"
      :barcode="authDialog.barcode"
      :keterangan="authDialog.keterangan"
      @success="authDialog.onSuccess"
      @close="
        () => {
          authDialog.show = false;
          authDialog.onCancel();
        }
      "
    />
    <SoDtfSearchModal
      v-if="isSoDtfSearchVisible"
      :cabang="header.gudang.kode"
      :customerKode="header.customer?.kode"
      @close="isSoDtfSearchVisible = false"
      @selected="onSoDtfSelected"
    />
    <PriceProposalSearchModal
      v-if="isPriceProposalSearchVisible"
      :cabang="header.gudang.kode"
      :customerKode="header.customer?.kode"
      @close="isPriceProposalSearchVisible = false"
      @selected="onPriceProposalSelected"
    />
    <DpInputModal
      v-if="isDpInputVisible"
      :customerKode="header.customer?.kode"
      :minimal-dp="footer.minimalDp"
      :existing-dp="footer.totalDp"
      :existing-dp-nomor="existingDpNomor"
      :nomor-so="header.nomor"
      @close="isDpInputVisible = false"
      @dp-saved="onDpSaved"
    />
    <CustomerForm
      v-if="isNewCustomerFormVisible"
      @close="isNewCustomerFormVisible = false"
      @customer-saved="onNewCustomerSaved"
    />
    <DiscountCostModal
      v-if="isDiscountCostModalVisible"
      :footer-data="footer"
      :total-so="totalDiscountable"
      :customer="header.customer"
      :gudang-kode="header.gudang.kode"
      :ppn-persen="header.ppnPersen"
      @close="isDiscountCostModalVisible = false"
      @update="handleDiscountCostUpdate"
    />
    <DpListModal
      v-if="isDpListModalVisible"
      :dp-items="dpItems"
      :customer-kode="header.customer?.kode || ''"
      @close="isDpListModalVisible = false"
      @remove-dp="removeDpRow($event)"
      @add-dp="handleAddDp"
    />
    <JenisOrderModal
      v-if="dialogs.jenisOrder"
      :model-value="dialogs.jenisOrder"
      :penawaran-details="penawaranDetails"
      :penawaran-barang-list="penawaranBarangList"
      @close="dialogs.jenisOrder = false"
      @saved="handleJenisOrderSaved"
    />
    <PromoSearchModal
      v-if="dialogs.promoSearch"
      :tanggal="header.tanggal"
      @close="dialogs.promoSearch = false"
      @selected="onPromoSelected"
    />
    <PromoBonusModal
      v-if="dialogs.promoBonus"
      :promo-nomor="activePromoForBonus.nomor"
      @close="dialogs.promoBonus = false"
      @selected="handleBonusSelection"
    />
    <!-- <SpkDialog v-model="isSpkDialogVisible" :ref-so="header.nomor" :initial-data="{
      customerNama: header.customer?.nama || '',
      customerKode: header.customer?.kode || '',
      namaDtf: header.namaDtf
    }" @saved="handleSaveSpk" /> -->

    <v-dialog v-model="isPromoConfirmVisible" max-width="450px" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="bg-primary text-white text-h6 pa-4">
          <v-icon start color="white">mdi-ticket-percent</v-icon>
          Pilih Jenis Diskon
        </v-card-title>
        <v-card-text class="pa-5">
          <p class="mb-4">Sistem mendeteksi transaksi ini berhak mendapatkan promo:</p>
          <v-alert type="info" variant="tonal" border="start" density="compact" class="mb-4">
            <strong>{{ pendingPromoData.nama }}</strong
            ><br />
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
          <v-btn color="primary" variant="flat" @click="usePromoDiscount"> Gunakan Promo </v-btn>
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

    <v-dialog v-model="isAdjustmentLogVisible" max-width="1000px">
      <v-card>
        <v-toolbar color="blue-grey-darken-3" density="compact" dark>
          <v-toolbar-title>Log Verifikasi & Koreksi Barang</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" @click="isAdjustmentLogVisible = false"></v-btn>
        </v-toolbar>

        <v-card-text class="pa-0">
          <v-data-table
            :headers="adjustmentHeaders"
            :items="adjustmentLogs"
            density="compact"
            class="elevation-0"
            no-data-text="Belum ada aktivitas verifikasi fisik."
            :items-per-page="10"
          >
            <template #[`item.qty`]="{ item }">
              <span
                :class="
                  item.qty > 0 ? 'text-success font-weight-bold' : 'text-error font-weight-bold'
                "
              >
                {{ item.qty > 0 ? "+" : "" }}{{ item.qty }}
              </span>
            </template>

            <template #[`item.type`]="{ item }">
              <v-chip
                size="x-small"
                :color="getTypeColor(item.type)"
                variant="flat"
                class="font-weight-bold"
              >
                {{ item.type }}
              </v-chip>
            </template>
          </v-data-table>
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isAdjustmentLogVisible = false"
            >Tutup</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  display: grid;
  grid-template-columns: 450px 1fr;
  height: calc(100vh - 120px);
  transition: grid-template-columns 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.form-grid-container.hide-left {
  grid-template-columns: 0px 1fr;
}

.left-column {
  transition: opacity 0.25s ease, visibility 0.25s ease, transform 0.35s ease;
  transform-origin: left center;
}

.form-grid-container.hide-left .left-column {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  width: 0;
  padding: 0;
  transform: translateX(-20px);
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

/* Merapatkan padding antar kolom */
.desktop-table :deep(thead tr th),
.desktop-table :deep(tbody tr td) {
  padding: 0 4px !important;
  /* Jarak antar kolom hanya 4px */
  height: 36px !important;
  /* Memperpendek tinggi baris agar lebih compact */
}

/* Memastikan input field di dalam tabel tidak memiliki margin bawah yang mengganggu */
.desktop-table :deep(.v-text-field .v-input__details) {
  display: none !important;
}

.product-name-cell {
  white-space: nowrap !important;
  /* Mencegah teks turun ke baris 2 */
  overflow: hidden;
  text-overflow: ellipsis;
  /* Beri titik-titik jika layar benar-benar sempit */
  font-weight: 500;
  display: block;
  min-width: 250px;
  /* Beri ruang minimal agar tetap terbaca */
}

/* Hilangkan margin input agar tidak mendorong tinggi baris */
.desktop-table :deep(.v-text-field .v-field__input) {
  padding: 0 2px !important;
  min-height: 28px !important;
}

/* Pastikan header tabel teksnya tidak wrap juga */
.desktop-table :deep(thead th) {
  white-space: nowrap !important;
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
  background: linear-gradient(
    to right,
    transparent 0%,
    rgba(255, 255, 255, 0.2) 50%,
    transparent 100%
  );
  transform: skewX(-25deg);
  z-index: 2;
  animation: shineMove 4s infinite ease-in-out;
  pointer-events: none;
}

.flex-none {
  flex: none !important;
}

.flex-grow-1 {
  flex-grow: 1 !important;
}

/* Pastikan scanner section tidak tertutup saat tabel penuh data */
.scanner-section {
  z-index: 10;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
}

.verify-scanner-field :deep(input) {
  font-weight: bold;
  letter-spacing: 1px;
}

:deep(.row-locked) {
  background-color: #f5f5f5 !important;
  color: #9e9e9e !important;
  font-style: italic;
  /* JANGAN gunakan pointer-events: none di sini jika ingin tombol bisa diklik,
     atau gunakan solusi di bawah ini: */
}

/* Kunci utama: Aktifkan kembali klik hanya untuk kolom terakhir (Actions) */
:deep(.row-locked td:last-child) {
  pointer-events: auto !important;
}

/* Matikan klik untuk kolom selain Actions agar Qty/Harga tetap tidak bisa diubah */
:deep(.row-locked td:not(:last-child)) {
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

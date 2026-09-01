<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive, nextTick } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { useRouter, useRoute } from "vue-router";
import { format, addDays, isValid } from "date-fns";
import axios, { AxiosError } from "axios";
import { formatRupiah } from "@/utils/formatRupiah";
import { useAutoPromo } from "@/composables/useAutoPromo";
import { useCustomerVisit } from "@/composables/useCustomerVisit";
import { useFreeGift } from "@/composables/useFreeGift";

import PageLayout from "@/components/PageLayout.vue";
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
// import GudangSearchModal from '@/components/GudangSearchModal.vue';
// import ProductSearchModal from "@/components/lookup/ProductSearchModal.vue";
import AuthorizationModal from "@/components/modal/AuthorizationModal.vue";
// import SoDtfSearchModal from '@/components/lookup/SoDtfSearchModal.vue';
import PriceProposalSearchModal from "@/components/lookup/PriceProposalSearchModal.vue";
import DpInputModal from "@/components/modal/DpInputModal.vue";
import DpListModal from "@/components/modal/DpListModal.vue";
import DiscountCostModal from "@/components/modal/DiscountCostModal.vue";
import JenisOrderModal from "@/components/modal/JenisOrderModal.vue";
import CustomerForm from "@/components/form/CustomerForm.vue";
import DiscountConfirmationDialog from "@/components/dialog/DiscountConfirmationDialog.vue";
import CustomerVisitDialog from "@/components/dialog/CustomerVisitDialog.vue";
import ProductSidePanel from "@/components/panel/ProductSidePanel.vue";
import type { ProductPanelSelection } from "@/components/panel/ProductSidePanel.vue";

const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const router = useRouter();
const route = useRoute();
const MENU_ID = "42";

// --- Interfaces ---
interface OfferItem {
  id: number;
  kode: string;
  nama: string;
  kategori?: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  harga: number;
  isHargaReadonly: boolean;
  diskonPersen: number;
  diskonRp: number;
  total: number;
  barcode: string;
  noSoDtf?: string;
  noPengajuanHarga: string;
  pin: string;
  isCustomOrder?: boolean;
  sod_custom?: string; // 'Y' atau 'N'
  sod_custom_nama?: string;
  sod_custom_data?: string; // String JSON untuk rincian teknis
  terhitungPromo: boolean;
  promo?: string;
  _isHargaEditable?: boolean;
  originalDiskonRp?: number;
  originalDiskonPersen?: number;
  scannedQty?: number;
  isReady?: boolean;
  isFreeGift?: boolean;
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

  jenisOrderKode?: string;
  jenisOrderNama?: string;
  namaDtf?: string;
  nomorPromo?: string;
  namaPromo?: string;

  penawaran?: boolean;
  userCreate?: string;
  existingSoNomor?: string | null;
  proNomorFreeItem?: string;
}

interface ApiOfferItem {
  kode: string | null;
  nama: string | null;
  kategori?: string | null;
  ukuran: string | null;
  stok: number | null;
  jumlah: number | null;
  harga: number | null;
  diskonPersen: number | null;
  diskonRp: number | null;
  total: number | null;
  barcode: string | null;
  noPengajuanHarga: string | null;
  noSoDtf?: string | null;
  pin: string | null;

  // field custom dari backend
  pend_custom?: string | null;
  pend_custom_nama?: string | null;
  pend_custom_data?: string | null;
  isFreeGift?: string | boolean | null; // backend kirim 'Y'/'N' via alias
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

// interface Product {
//   kode: string;
//   nama: string;
//   kategori?: string;
//   ukuran: string;
//   stok: number;
//   harga: number;
//   barcode: string;
// }

interface TableHeader {
  title: string;
  key: string;
  width?: string;
  sortable?: boolean;
  align?: "start" | "end" | "center";
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
  fsk: string; // Tambahkan ini
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

interface UkuranKaosItem {
  ukuran: string;
  jumlah: number;
  harga: number;
}

interface ParsedCustomData {
  ukuranKaos?: UkuranKaosItem[];
  titikCetak?: {
    keterangan: string;
    sizeCetak: string;
    panjang: number;
    lebar: number;
  }[];
  hargaPerCm?: number;
  [key: string]: unknown; // penting untuk spread ...parsed
}

const audioSuccess = new Audio("/audio/beep_success.mp3");
const audioError = new Audio("/audio/beep_error.mp3");

// --- State ---
const { isVisitDialogVisible, checkAndPromptVisit, handleSelectVisit, handleCancelVisit } =
  useCustomerVisit();

const header = ref<OfferHeader>({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  gudang: { kode: authStore.user?.cabang || "", nama: "Gudang Utama" } as Gudang,
  customer: null as Customer | null,
  customerKode: "",
  top: 0,
  tempo: format(new Date(), "yyyy-MM-dd"),
  ppnPersen: 0,
  keterangan: "",

  jenisOrderKode: "",
  jenisOrderNama: "",
  namaDtf: "",
  nomorPromo: "",

  userCreate: `${authStore.user?.kode || ""} - ${authStore.userName || ""}`.replace(
    /^ - | - $/g,
    ""
  ),
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
  pinDiskon1: "",
  pinDiskon2: "",
  totalDp: 0,
  belumDibayar: 0,
  subtotalKaos: 0,
});
// --- Setup Proxy untuk Composable ---
const promoHeaderProxy = reactive({
  tanggal: header.value.tanggal,
  gudang: { kode: header.value.gudang.kode },
  customer: {
    level_kode: header.value.customer?.level || "",
    level: header.value.customer?.level || "",
  },
  nomorSo: "", // Penawaran belum punya SO
  nomorPromo: header.value.nomorPromo || "",
  namaPromo: header.value.namaPromo || "",
  diskonRp: footer.value.diskonRp,
  diskonPersen1: footer.value.diskonPersen1,
  diskonPersen2: footer.value.diskonPersen2,
});

// --- Inisialisasi Composable ---
const autoPromo = useAutoPromo(promoHeaderProxy, items, {
  onNotify: (msg, type) => {
    if (type === "success") toast.success(msg);
    else if (type === "warning") toast.warning(msg);
    else toast.info(msg);
  },
  skipIfFromSo: false,
  isItemEligible: (item) => {
    if (item.noPengajuanHarga) return false;
    if ((item.noSoDtf || "").toUpperCase().includes(".BR.")) return false;
    return true;
  },
  onFakturPromoAvailable: (promo) => {
    if (lastSuggestedPromo.value === promo.nomor || lastSuggestedPromo.value === "MANUAL_AUTH")
      return;
    pendingPromoData.nomor = promo.nomor;
    pendingPromoData.nama = promo.nama;
    pendingPromoData.diskon = promo.diskon;
    isPromoConfirmVisible.value = true;
  },
  // [BARU] Sama seperti SoCreateView — cegah evaluate ulang saat initial load
  shouldSkipEvaluate: () => {
    return (
      (isInitialLoad.value && !!header.value.nomorPromo) ||
      lastSuggestedPromo.value === "MANUAL_AUTH"
    );
  },
});

const freeGift = useFreeGift(items, {
  endpointPrefix: "offer-form",
  getCabang: () => header.value.gudang.kode,
  getCustomerKode: () => header.value.customer?.kode || "",
  getCustomerNama: () => header.value.customer?.nama || "",
  getActivePromoNomors: () => autoPromo.activePromos.value.map((p) => p.pro_nomor),
  setProNomorFreeItem: (nomor) => {
    header.value.proNomorFreeItem = nomor;
  },
  audioSuccess,
  audioError,
  buildItem: (product) => ({
    id: Date.now() + Math.random(),
    kode: product.kode,
    nama: `${product.nama} (HADIAH GRATIS)`,
    kategori: "REGULER",
    ukuran: product.ukuran,
    stok: product.stok,
    jumlah: 1,
    harga: 0,
    isHargaReadonly: true,
    diskonPersen: 0,
    diskonRp: 0,
    total: 0,
    barcode: product.barcode,
    noPengajuanHarga: "",
    pin: "",
    terhitungPromo: false,
    promo: "",
    isFreeGift: true,
  }),
  addItemToList: (item) => {
    const emptyIdx = items.value.findIndex((i) => !i.kode);
    if (emptyIdx !== -1) {
      items.value.splice(emptyIdx, 0, item);
    } else {
      items.value.push(item);
    }
    addNewRow();
    calculateTotals();
  },
});
const freeGiftInputRefEl = freeGift.freeGiftScanInputRef;
const isFreeGiftScanDialogOpen = freeGift.isFreeGiftScanDialogOpen;
const freeGiftScanBarcode = freeGift.freeGiftScanBarcode;
const isFreeGiftScanning = freeGift.isFreeGiftScanning;

// Alias ke state composable
const promoNotification = autoPromo.notification;

// Helper untuk menyinkronkan state lokal ke proxy
const syncPromoProxy = () => {
  promoHeaderProxy.tanggal = header.value.tanggal;
  promoHeaderProxy.gudang.kode = header.value.gudang.kode;
  promoHeaderProxy.customer.level_kode = header.value.customer?.level || "";
  promoHeaderProxy.customer.level = header.value.customer?.level || "";
  promoHeaderProxy.nomorPromo = header.value.nomorPromo || "";
  promoHeaderProxy.namaPromo = header.value.namaPromo || "";
  promoHeaderProxy.diskonRp = baseManualDiscountRp.value;
  promoHeaderProxy.diskonPersen1 = footer.value.diskonPersen1;
  promoHeaderProxy.diskonPersen2 = footer.value.diskonPersen2;
};

// Mengelompokkan diskon item berdasarkan kode barang saja (tanpa ukuran)
const uniqueItemDiscounts = computed(() => {
  const map = new Map<string, { nama: string; persen: number; rp: number }>();
  for (const [key, disc] of autoPromo.itemDiscountMap.value.entries()) {
    const kode = key.split("||")[0];
    const existing = map.get(kode);

    if (!existing || disc.persen > existing.persen) {
      map.set(kode, { nama: disc.nama, persen: disc.persen, rp: disc.rp });
    }
  }
  return Array.from(map.values());
});

const baseManualDiscountRp = ref(0);

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

const dialogs = reactive({
  jenisOrder: false,
  // ... state lainnya
});

const isCustomerSearchVisible = ref(false);
// const isGudangSearchVisible = ref(false);
// const isProductSearchVisible = ref(false);
const isProductPanelVisible = ref(false);
// const isMultiSelectProduct = ref(false);
// const isSoDtfSearchVisible = ref(false);
const isPriceProposalSearchVisible = ref(false);
const activeRowIndex = ref(0);
const isSaving = ref(false);
const isConfirmDialogVisible = ref(false);
const focusedRowId = ref<number | string>(-1);
const isFooterDiskonRpFocused = ref(false);
const confirmText = ref("");
const pendingAction = ref<(() => void) | null>(null);
const isPrintConfirmVisible = ref(false);
const printConfirmNomor = ref("");
const scannedBarcode = ref("");
const isAuthPending = ref(false);
const previousDiskonRp = ref(0);
const dpItems = ref<DpItem[]>([]);
const isDpInputVisible = ref(false);
const isDpListModalVisible = ref(false);
const isDiscountCostModalVisible = ref(false);
const isInitialLoad = ref(false);
const isNewCustomerFormVisible = ref(false);
const lastSuggestedPromo = ref("");
const isGrandOpeningPromo = ref(false); // Digunakan untuk binding class di template
const isStickerBonusRejected = ref(false);
let isApplyingBonus = false; // Pengunci Anti-Duplikat

const isPromoConfirmVisible = ref(false);
const pendingPromoData = reactive({
  nomor: "",
  nama: "",
  diskon: 0,
});
const pendingReviewProofFile = ref<File | null>(null);
const isCurrentPromoRequiresReview = ref(false); // promo yg SEDANG aktif di header, bukan yg pending confirm

const pendingPromoRequiresReview = computed(() => {
  // pendingPromoData.nomor bisa berisi beberapa nomor dipisah koma (gabungan promo)
  const nomors = (pendingPromoData.nomor || "").split(",").map((n) => n.trim());
  return nomors.some((n) => {
    const p = autoPromo.activePromos.value.find((ap) => ap.pro_nomor === n);
    return p?.pro_wajib_review === "Y";
  });
});

footer.value.diskonRpInput = footer.value.diskonRp;

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? `Ubah Penawaran: ${header.value.nomor}` : "Buat Penawaran Baru"
);
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));

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
    if (it.kode && it.nama && !map.has(it.kode)) {
      map.set(it.kode, it.nama);
    }
  });
  return Array.from(map.entries()).map(([kodeBarang, namaBarang]) => ({ kodeBarang, namaBarang }));
});

const grossTotalDisplay = computed(() => {
  return items.value.reduce((sum, item) => {
    if (!item.kode) return sum;
    const qty = Number(item.jumlah) || 0;
    const harga = Number(item.harga) || 0;
    return sum + qty * harga;
  }, 0);
});

const tableHeaders: TableHeader[] = [
  { title: "Kode", key: "kode", width: "300px" },
  { title: "Barcode", key: "barcode", sortable: false },
  { title: "Nama Barang", key: "nama", width: "900px" },
  { title: "Kategori", key: "kategori", width: "100px" },
  { title: "Ukuran", key: "ukuran", width: "30px" },
  { title: "Stok", key: "stok", width: "30px", align: "end" },
  { title: "Jml", key: "jumlah", width: "30px", align: "end" },
  { title: "Harga", key: "harga", width: "90px", align: "end" },
  { title: "Diskon %", key: "diskonPersen", width: "30px", align: "end" },
  { title: "Diskon Rp", key: "diskonRp", width: "50px", align: "end" },
  { title: "Total", key: "total", align: "end", width: "90px" },
  { title: "No. Pengajuan", key: "noPengajuanHarga", width: "90px" },
  // Perhatian: Ada key 'barcode' ganda di snippet Anda.
  // Jika ini kolom berbeda, sebaiknya key-nya dibedakan, misal 'barcode2'.
  { title: "Barcode", key: "barcode_scan", width: "70px" },
  { title: "Actions", key: "actions", sortable: false, width: "40px" },
];

// --- Methods ---
const loadCustomerDetails = async () => {
  if (!header.value.customerKode) {
    return;
  }

  try {
    const response = await api.get(`/offer-form/customer-details/${header.value.customerKode}`);

    // Mapping data dari format API ke format frontend
    header.value.customer = {
      kode: header.value.customerKode, // Kode sudah kita punya
      nama: response.data.cus_nama || "",
      alamat: response.data.cus_alamat || "",
      kota: response.data.cus_kota || "",
      telp: response.data.cus_telp || "",
      top: response.data.cus_top || 0,
      level: response.data.xlevel || "",
      discountRule: {
        diskon1: response.data.diskon1 || 0,
        diskon2: response.data.diskon2 || 0,
        nominal: response.data.nominal || 0,
      },
    };

    header.value.top = response.data.cus_top || 0;

    toast.success("Detail customer berhasil dimuat.");
  } catch (error) {
    console.error("Error loading customer details:", error);
    toast.error("Gagal memuat detail customer.");
    // Reset customer jika gagal
    header.value.customer = null;
    header.value.top = 0;
  }
};

const onNewCustomerSaved = async (newCustomer: Customer) => {
  await onCustomerSelected(newCustomer);
  isNewCustomerFormVisible.value = false;
  await freeGift.checkFreeGiftQuota();
};

const loadOfferData = async (nomor: string) => {
  isInitialLoad.value = true;
  try {
    const response = await api.get(`/offer-form/edit-details/${nomor}`);
    const { headerData, itemsData, dpItemsData, footerData } = response.data;

    header.value = { ...header.value, ...headerData };

    if (headerData.existingSoNomor) {
      toast.info(`Penawaran ini sudah dibuatkan Surat Pesanan: ${headerData.existingSoNomor}`, {
        timeout: 8000,
      });
    }

    // ========================================================
    // [PERBAIKAN KUNCI] Pecah baris custom saat Load
    // ========================================================
    const processedItems: OfferItem[] = [];

    (itemsData as ApiOfferItem[]).forEach((item, index) => {
      const isCustom = item.pend_custom === "Y" || item.kode === "CUSTOM";
      let parsed: ParsedCustomData = {};

      if (isCustom && item.pend_custom_data) {
        try {
          parsed = JSON.parse(item.pend_custom_data);
        } catch (e) {
          console.error("Parse custom data failed", e);
        }
      }

      // Jika item custom dan punya banyak ukuran di dalam JSON-nya
      if (isCustom && parsed.ukuranKaos && parsed.ukuranKaos.length > 1) {
        parsed.ukuranKaos.forEach((u: UkuranKaosItem, uIdx: number) => {
          processedItems.push({
            id: Date.now() + Math.random() + uIdx,
            kode: item.kode || "CUSTOM",
            nama: item.pend_custom_nama || item.nama || "",
            kategori: isCustom ? "CUSTOM" : item.kategori || "",
            ukuran: u.ukuran, // Ambil ukuran spesifik
            stok: item.stok || 0,
            jumlah: u.jumlah, // Ambil jumlah spesifik
            harga: u.harga, // Ambil harga spesifik
            isHargaReadonly: true,
            diskonPersen: item.diskonPersen || 0,
            diskonRp: item.diskonRp || 0,
            total: u.jumlah * u.harga,
            barcode: item.barcode || "",
            noPengajuanHarga: item.noPengajuanHarga || "",
            pin: item.pin || "",
            isCustomOrder: true,
            sod_custom: "Y",
            sod_custom_nama: item.pend_custom_nama || item.nama || undefined,
            // Simpan rincian teknis khusus untuk baris ukuran ini saja
            sod_custom_data: JSON.stringify({
              ...parsed,
              ukuranKaos: [u],
            }),
            terhitungPromo: false,
            promo: "",
            isFreeGift: item.isFreeGift === "Y" || item.isFreeGift === true,
          });
        });
      } else {
        // Masukkan seperti biasa jika item reguler atau custom 1 ukuran
        processedItems.push({
          id: Date.now() + Math.random() + index,
          kode: item.kode || "",
          nama: (isCustom ? item.pend_custom_nama : item.nama) || "",
          kategori: isCustom ? "CUSTOM" : item.kategori || "",
          ukuran: item.ukuran || "",
          stok: item.stok || 0,
          jumlah: item.jumlah || 0,
          harga: item.harga || 0,
          isHargaReadonly: (item.harga || 0) > 0,
          diskonPersen: item.diskonPersen || 0,
          diskonRp: item.diskonRp || 0,
          total: item.total || 0,
          barcode: item.barcode || "",
          noPengajuanHarga: item.noPengajuanHarga || "",
          pin: item.pin || "",
          isCustomOrder: isCustom,
          sod_custom: item.pend_custom ?? undefined,
          sod_custom_nama: item.pend_custom_nama ?? undefined,
          sod_custom_data: item.pend_custom_data ?? undefined,
          terhitungPromo: false,
          promo: "",
          isFreeGift: item.isFreeGift === "Y" || item.isFreeGift === true,
        });
      }
    });

    items.value = processedItems;

    addNewRow();
    // ========================================================

    dpItems.value = dpItemsData || [];
    footer.value = {
      ...footer.value,
      ...footerData,
      diskonRpInput: footerData.diskonRp,
    };

    // Ekstrak nilai P2 dari total untuk mode Edit
    const tempTotalDisc = items.value.reduce(
      (sum, item) => (isDiscountableItem(item) ? sum + item.total : sum),
      0
    );
    const p2Db = Number(footerData.diskonPersen2) || 0;
    const dbCombined = Number(footerData.diskonRp) || 0;

    if (p2Db > 0 && p2Db < 100 && dbCombined > 0) {
      baseManualDiscountRp.value = Math.max(
        0,
        Math.round((dbCombined - (p2Db / 100) * tempTotalDisc) / (1 - p2Db / 100))
      );
    } else {
      baseManualDiscountRp.value = dbCombined;
    }

    // [PERBAIKAN] Kunci popup promo otomatis saat Load Edit!
    // Jika dari database sudah ada promo atau diskon manual, langsung set flag "sudah ditanya"
    if (headerData.nomorPromo || headerData.so_pro_nomor) {
      lastSuggestedPromo.value = headerData.nomorPromo || headerData.so_pro_nomor;
    } else if (
      footerData.diskonRp > 0 ||
      footerData.diskonPersen1 > 0 ||
      footerData.diskonPersen2 > 0
    ) {
      lastSuggestedPromo.value = "MANUAL_AUTH";
    }

    toast.success(`Data penawaran ${nomor} berhasil dimuat.`);

    await nextTick();
    calculateTotals(); // Hitung ulang untuk memastikan sisa bayar sinkron
    setTimeout(() => {
      isInitialLoad.value = false;
    }, 1000);
    markAsSaved();
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;

    toast.error(err.response?.data?.message || "Gagal memuat data penawaran.");

    router.push("/transaksi/penjualan/penawaran");
  }
};

const openCustomerSearch = () => {
  isCustomerSearchVisible.value = true;
};
// const openGudangSearch = () => { isGudangSearchVisible.value = true; };

// Perbaikan: Hanya menerima kode customer dari modal
const onCustomerSelected = async (customer: { kode: string }) => {
  isCustomerSearchVisible.value = false;
  if (!customer || !customer.kode) return;

  try {
    const response = await api.get(`/offer-form/customer-details/${customer.kode}`, {
      params: { gudang: header.value.gudang.kode },
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
      toast.error(error.response.data?.message || "Gagal memuat detail customer.");
    } else {
      toast.error("Gagal memuat detail customer.");
    }
    header.value.customer = null;
  }

  await freeGift.checkFreeGiftQuota();
};

// const onGudangSelected = async (gudang: Gudang) => {

//     // Pastikan data gudang valid
//     if (!gudang || !gudang.kode) {
//         toast.error('Data gudang tidak valid.');
//         return;
//     }

//     header.value.gudang = gudang;
//     isGudangSearchVisible.value = false;

//     if (!isEditMode.value) {
//     }

//     // Setelah gudang dipilih, load detail customer jika sudah ada kode customer
//     if (header.value.customerKode) {

//         toast.info('Memuat detail customer...');
//         await loadCustomerDetails();
//     } else {

//     }
// };

const openProductSearch = (index: number) => {
  if (!header.value.customer) {
    toast.error("Pilih Customer terlebih dahulu.");
    return;
  }
  activeRowIndex.value = index;
  isProductPanelVisible.value = true;
};

// const onProductsSelected = (selectedProducts: Product[]) => {
//   isProductSearchVisible.value = false;
//   if (!selectedProducts || selectedProducts.length === 0) return;

//   // 1. Perbaikan Filter Duplikasi
//   // Jangan hanya cek barcode, cek kombinasi Kode + Ukuran karena Jasa barcodenya kosong
//   const newProducts = selectedProducts
//     .filter((product) => {
//       return !items.value.some(
//         (item) =>
//           (item.barcode && product.barcode && item.barcode === product.barcode) ||
//           (item.kode === product.kode && item.ukuran === product.ukuran)
//       );
//     })
//     .map((product) => ({
//       id: Date.now() + Math.random(),
//       kode: product.kode,
//       nama: product.nama,
//       kategori: product.kategori || "",
//       ukuran: product.ukuran || "-", // [FIX] Fallback '-' jika jasa tidak punya ukuran
//       stok: product.stok || 0,
//       harga: product.harga || 0,
//       isHargaReadonly: (product.harga || 0) > 0,
//       jumlah: 1,
//       diskonPersen: 0,
//       diskonRp: 0,
//       total: product.harga || 0,
//       // [FIX] Gunakan kode sebagai fallback jika barcode kosong agar identitas unik
//       barcode: product.barcode || product.kode,
//       noPengajuanHarga: "",
//       pin: "",
//       terhitungPromo: false,
//       promo: "",
//     }));

//   if (newProducts.length === 0) {
//     toast.info("Barang sudah ada di dalam daftar.");
//     return;
//   }

//   // 2. Timpa baris kosong yang sedang aktif (tempat user tekan F1/F2)
//   items.value.splice(activeRowIndex.value, 1, ...newProducts);

//   // 3. Pastikan ada baris kosong baru dan hitung ulang total
//   addNewRow();
//   calculateTotals();
// };

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

const isStickerPromoToko = (item: OfferItem) => {
  return (
    (String(item.barcode) === "25014783" || String(item.kode) === "2500053") &&
    String(item.ukuran).toUpperCase() === "A6" &&
    (item.harga === 0 || item.terhitungPromo || item.promo === "PRO-2026-001")
  );
};

const useMemberDiscount = () => {
  lastSuggestedPromo.value = "MANUAL_AUTH";

  if (footer.value.diskonPersen2 === 5) {
    header.value.nomorPromo = "PRO-2026-003";
    header.value.namaPromo = "PROMO GOOGLE MAPS REVIEW 5%";
  } else {
    header.value.nomorPromo = "";
    header.value.namaPromo = "";
  }
  baseManualDiscountRp.value = 0;

  isPromoConfirmVisible.value = false;
  isStickerBonusRejected.value = true;

  const existingIdx = items.value.findIndex(
    (i) =>
      (String(i.barcode) === "25014783" || String(i.kode) === "2500053") &&
      String(i.ukuran).toUpperCase() === "A6" &&
      (i.harga === 0 || i.terhitungPromo || i.promo === "PRO-2026-001")
  );
  if (existingIdx !== -1) items.value.splice(existingIdx, 1);

  applyDefaultDiscount().then(() => calculateTotals());
  toast.info("Menggunakan diskon member standar.");
};

// [BARU] Fungsi untuk menutup dialog tanpa merubah diskon apa pun
const closePromoDialog = () => {
  isPromoConfirmVisible.value = false;

  // Kunci agar popup tidak muncul terus-menerus untuk promo yang sama
  // setiap kali user mengetik sesuatu, TANPA menyentuh data diskon.
  lastSuggestedPromo.value = pendingPromoData.nomor;
};

const handleOpenDiscountModal = () => {
  if (header.value.nomorPromo || footer.value.diskonPersen2 > 0) {
    isDiscountCostModalVisible.value = true;
    return;
  }

  if (autoPromo.totalAppliedDiskon.value > 0 && lastSuggestedPromo.value !== "MANUAL_AUTH") {
    isPromoConfirmVisible.value = true;
  } else {
    isDiscountCostModalVisible.value = true;
  }
};

const applyPromoDiscount = async (proofFile?: File) => {
  header.value.nomorPromo = pendingPromoData.nomor;
  header.value.namaPromo = pendingPromoData.nama;
  baseManualDiscountRp.value = pendingPromoData.diskon;
  footer.value.diskonPersen1 = 0;
  footer.value.diskonPersen2 = 0;
  isPromoConfirmVisible.value = false;
  lastSuggestedPromo.value = "";

  if (proofFile) {
    pendingReviewProofFile.value = proofFile;
    isCurrentPromoRequiresReview.value = true;
  } else {
    isCurrentPromoRequiresReview.value = false;
  }

  calculateTotals();
  toast.success(
    `Promo ${pendingPromoData.nama} Rp ${formatRupiah(pendingPromoData.diskon)} diterapkan.`
  );
};

// [BARU] Handler khusus buat event dari dialog yang butuh bukti review
const handleUsePromoWithProof = (file: File) => {
  applyPromoDiscount(file);
};

const calculateTotals = () => {
  let subtotal = 0;
  let subtotalDiscountable = 0;

  items.value.forEach((item) => {
    const price = Number(item.harga) || 0;
    const qty = Number(item.jumlah) || 0;
    let discountRp = Number(item.diskonRp) || 0;
    const discountPersen = Number(item.diskonPersen) || 0;

    if (item.noPengajuanHarga) {
      item.diskonPersen = 0;
      item.diskonRp = 0;
      discountRp = 0;
    } else if (discountPersen > 0) {
      discountRp = (discountPersen / 100) * price;
      item.diskonRp = discountRp;
    }

    item.total = qty * (price - discountRp);
    subtotal += item.total;

    // Filter: Jenis Order (CUSTOM) tidak masuk basis diskon
    const hasOwnItemDiscount = (item.diskonRp || 0) > 0 || (item.diskonPersen || 0) > 0;
    if (isDiscountableItem(item) && !hasOwnItemDiscount) {
      subtotalDiscountable += item.total;
    }
  });

  footer.value.subtotalKaos = subtotalDiscountable;
  footer.value.total = subtotal;

  syncPromoProxy();
  autoPromo.debouncedEvaluate();

  // --- PERBAIKAN LOGIKA DISKON FAKTUR (SOP BARU BERJENJANG) ---
  let baseNominalDiscount = 0;
  const diskonP1 = Number(footer.value.diskonPersen1) || 0;

  if (diskonP1 > 0) {
    baseNominalDiscount = (diskonP1 / 100) * subtotalDiscountable;
  } else {
    baseNominalDiscount = baseManualDiscountRp.value;
  }

  const diskonP2 = Number(footer.value.diskonPersen2) || 0;
  const remainingAfterBase = Math.max(0, subtotal - baseNominalDiscount);
  const mapsDiscountRp = (diskonP2 / 100) * remainingAfterBase;

  // Gabungkan untuk tampilan di layar
  footer.value.diskonRp = Math.round(baseNominalDiscount + mapsDiscountRp);

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
      kode: "",
      nama: "",
      ukuran: "",
      stok: 0,
      jumlah: 0,
      harga: 0,
      isHargaReadonly: false,
      diskonPersen: 0,
      diskonRp: 0,
      total: 0,
      barcode: "",
      noSoDtf: "",
      noPengajuanHarga: "",
      pin: "", // tambahkan ini
      terhitungPromo: false, // [FIX] Inisialisasi false
      promo: "", // [FIX] Inisialisasi string kosong
    });
  }
};

const removeRow = (index: number) => {
  const item = items.value[index];
  if (!item) return;

  // Cek apakah item yang mau dihapus adalah stiker bonus?
  const isSticker = String(item.barcode) === "25014783" || String(item.kode) === "2500053";
  if (isSticker) {
    isStickerBonusRejected.value = true;
    toast.info("Bonus Stiker dihapus secara manual.");
  }

  items.value.splice(index, 1);
  calculateTotals();
};

const applyMarchBonusSticker = async (forceInject = false) => {
  if (isApplyingBonus) return;

  // [PERBAIKAN 1]: Hentikan jika user sudah hapus stiker manual (kecuali saat tekan 'Gunakan Promo')
  if (isStickerBonusRejected.value && !forceInject) {
    return;
  }

  isApplyingBonus = true;

  try {
    const STICKER_BARCODE = "25014783";
    const STICKER_KODE = "2500053";
    const THRESHOLD_STICKER = 600000;

    // Hitung Uang Belanja (Abaikan stiker toko)
    const totalEligibleValue = items.value.reduce((sum, item) => {
      const isCustomDtf = item.isCustomOrder || !!item.noSoDtf;
      const isReguler = item.kategori?.toUpperCase() === "REGULER";
      return (isReguler || isCustomDtf) && !isStickerPromoToko(item)
        ? sum + (item.total || 0)
        : sum;
    }, 0);

    // Hitung Qty Kaos Reguler Saja
    const totalKaosQty = items.value.reduce((sum, item) => {
      const isCustomDtf = item.isCustomOrder || !!item.noSoDtf;
      return item.kode && !isStickerPromoToko(item) && !isCustomDtf
        ? sum + (Number(item.jumlah) || 0)
        : sum;
    }, 0);

    // [PERBAIKAN 2]: JANGAN dikalikan multiplier kelipatan. Jika tembus 600rb, qty stiker = qty kaos reguler.
    const baseBonusQty = totalEligibleValue >= THRESHOLD_STICKER ? totalKaosQty : 0;

    const customStickerQty = items.value.reduce((sum, item) => {
      const isCustomDtf = item.isCustomOrder || !!item.noSoDtf;
      const isA6 =
        String(item.ukuran).toUpperCase() === "A6" ||
        String(item.nama).toUpperCase().includes("A6");
      return isCustomDtf && isA6 ? sum + (Number(item.jumlah) || 0) : sum;
    }, 0);

    const targetBonusQty = Math.max(0, baseBonusQty - customStickerQty);

    // --- PEMBERSIHAN DUPLIKAT SECARA TUNTAS ---
    const stickerIndexes: number[] = [];
    items.value.forEach((item, idx) => {
      if (isStickerPromoToko(item)) stickerIndexes.push(idx);
    });

    // Jika jatah habis ATAU user reject stiker, hapus SEMUA stiker promo yang tersisa
    if (targetBonusQty === 0 || (isStickerBonusRejected.value && !forceInject)) {
      for (let i = stickerIndexes.length - 1; i >= 0; i--) {
        items.value.splice(stickerIndexes[i], 1);
      }
      return;
    }

    // Jika ada stiker dobel gara-gara reaktivitas, sisakan satu saja (index pertama), hapus sisanya
    if (stickerIndexes.length > 1) {
      for (let i = stickerIndexes.length - 1; i > 0; i--) {
        items.value.splice(stickerIndexes[i], 1);
      }
    }

    // Cari ulang index stiker (karena mungkin susunannya sudah bergeser)
    const existingIdx = items.value.findIndex((i) => isStickerPromoToko(i));

    // Jika Qty sudah sama persis, hentikan proses untuk mencegah render loop
    if (existingIdx !== -1 && items.value[existingIdx].jumlah === targetBonusQty) {
      return;
    }

    // --- INJEKSI / UPDATE KEDALAM KERANJANG ---
    if (targetBonusQty > 0) {
      if (!forceInject && existingIdx === -1 && header.value.nomorPromo !== "PRO-2026-001") {
        return;
      }

      if (existingIdx !== -1) {
        items.value[existingIdx].jumlah = targetBonusQty;
        items.value[existingIdx].total = 0;
        items.value[existingIdx].harga = 0;
      } else {
        let stokFisikToko = 0;
        let prodKode = STICKER_KODE;
        let prodNama = "STICKER DTF A6";

        try {
          const response = await api.get(`/offer-form/by-barcode/${STICKER_BARCODE}`, {
            params: { gudang: header.value.gudang.kode },
          });
          stokFisikToko = Number(response.data.stok || 0);
          prodKode = response.data.kode;
          prodNama = response.data.nama;
        } catch (error) {
          console.warn("Gagal narik data stiker, pakai fallback.", error);
        }

        const newItem: OfferItem = {
          id: Date.now() + 999,
          kode: prodKode,
          nama: `${prodNama} (FREE MARET)`,
          ukuran: "A6",
          jumlah: targetBonusQty,
          harga: 0,
          isHargaReadonly: true,
          diskonRp: 0,
          diskonPersen: 0,
          total: 0,
          barcode: STICKER_BARCODE,
          stok: stokFisikToko,
          noPengajuanHarga: "",
          pin: "",
          terhitungPromo: true,
          promo: "PRO-2026-001",
        };

        const emptyIdx = items.value.findIndex((i) => !i.kode);
        if (emptyIdx !== -1) {
          items.value.splice(emptyIdx, 0, newItem);
        } else {
          items.value.push(newItem);
        }
      }
    }
  } finally {
    isApplyingBonus = false;
  }
};

const save = async () => {
  // --- Validasi Dasar ---
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error("Anda tidak memiliki izin untuk menyimpan data ini.");
    return;
  }
  if (!header.value.customer) {
    toast.error("Customer harus dipilih terlebih dahulu.");
    return;
  }
  const validItems = items.value.filter((item) => item.kode);
  if (validItems.length === 0) {
    toast.error("Detail barang harus diisi minimal 1 baris.");
    return;
  }
  for (const item of validItems) {
    if (!item.jumlah || item.jumlah <= 0) {
      toast.error(`Jumlah untuk barang '${item.nama}' harus diisi dan lebih dari 0.`);
      return;
    }

    if (!isStickerPromoToko(item)) {
      if (item.harga === null || item.harga === undefined || item.harga < 0) {
        toast.error(`Harga untuk barang '${item.nama}' harus diisi.`);
        return;
      }
    }
  }

  // Flush evaluasi promo sebelum simpan untuk memastikan kelipatan terbaru
  await autoPromo.flushEvaluate();
  calculateTotals();
  await nextTick();

  // INJEKSI BONUS STICKER MARET (Jika tidak ditolak dan promo yang aktif adalah Maret)
  if (header.value.nomorPromo === "PRO-2026-001" && !isStickerBonusRejected.value) {
    await applyMarchBonusSticker(true);
    calculateTotals();
  }

  const tipeKunjungan = await checkAndPromptVisit(
    header.value.customer?.kode || "",
    header.value.tanggal,
    isEditMode.value
  );

  if (tipeKunjungan === "CANCEL") return; // Batalkan proses simpan jika kasir klik "Batal Simpan"

  if (freeGift.freeGiftQuota.available && !items.value.some((i) => i.isFreeGift)) {
    const confirmed = await new Promise<boolean>((resolve) => {
      showConfirmation(
        () => resolve(true),
        `⚠️ Customer ini berhak dapat COMBED 24S gratis (Sisa kuota: ${freeGift.freeGiftQuota.sisaKuota}), tapi belum di-scan. Lanjutkan tanpa memberikan hadiah?`
      );
    });
    if (!confirmed) return;
  }

  if (isCurrentPromoRequiresReview.value && !pendingReviewProofFile.value) {
    toast.error(
      "Promo ini wajib disertai bukti ulasan Google Maps. Upload dulu lewat dialog promo sebelum menyimpan."
    );
    return;
  }

  // --- Konfirmasi Simpan ---
  isSaving.value = true;
  try {
    const payload = {
      header: header.value,
      footer: footer.value,
      details: items.value
        .filter((item) => item.kode)
        .map((item) => ({
          ...item,
          sod_custom: item.isCustomOrder ? "Y" : "N",
        })),
      dps: dpItems.value,
      user: authStore.user,
      isNew: !isEditMode.value,
      tipeKunjungan,
    };

    const response = await api.post("/offer-form/save", payload);
    toast.success(response.data.message);

    markAsSaved();

    const nomorPenawaran = response.data.nomor;

    if (pendingReviewProofFile.value && nomorPenawaran) {
      const formData = new FormData();
      formData.append("image", pendingReviewProofFile.value);
      try {
        await api.post(`/offer-form/upload-review-proof/${nomorPenawaran}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } catch {
        toast.warning(
          "Penawaran tersimpan, tapi bukti ulasan gagal diunggah. Upload manual nanti."
        );
      }
    }

    if (nomorPenawaran) {
      printConfirmNomor.value = nomorPenawaran;
      isPrintConfirmVisible.value = true;
    } else {
      toast.error("Gagal mendapatkan nomor dokumen untuk dicetak. Mengarahkan ke daftar.");
      router.push("/transaksi/penjualan/penawaran");
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const message =
        error.response?.data?.message || error.message || "Gagal menyimpan data penawaran.";
      toast.error(message);
    } else if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error("Gagal menyimpan data penawaran.");
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
      name: "Cetak Penawaran", // Pastikan 'name' ini SAMA PERSIS dengan di router Anda
      params: { nomor: printConfirmNomor.value },
    });

    // 2. Buka URL di tab baru
    window.open(routeData.href, "_blank");
  } catch (error) {
    console.error("Gagal membuka halaman cetak:", error);
    toast.error('Gagal membuka halaman cetak. Pastikan route "Cetak Penawaran" ada.');
  } finally {
    // 3. Tutup dialog dan kembali ke halaman browse
    isPrintConfirmVisible.value = false;
    printConfirmNomor.value = "";
    router.push("/transaksi/penjualan/penawaran");
  }
};

const handlePrintCancel = () => {
  isPrintConfirmVisible.value = false;
  printConfirmNomor.value = "";
  // Langsung kembali ke halaman browse
  router.push("/transaksi/penjualan/penawaran");
};

const goToExistingSo = () => {
  if (!header.value.existingSoNomor) return;
  router.push({
    name: "SuratPesananEdit",
    params: { nomor: header.value.existingSoNomor },
  });
};

const resetForm = () => {
  header.value = {
    nomor: "",
    tanggal: format(new Date(), "yyyy-MM-dd"),
    gudang: { kode: authStore.user?.cabang || "", nama: "Gudang Utama" },
    customer: null,
    customerKode: "",
    top: 0,
    tempo: format(new Date(), "yyyy-MM-dd"),
    ppnPersen: 0,
    keterangan: "",

    jenisOrderKode: "",
    jenisOrderNama: "",
    namaDtf: "",

    userCreate: `${authStore.user?.kode || ""} - ${authStore.userName || ""}`.replace(
      /^ - | - $/g,
      ""
    ),
  };
  items.value = [];
  addNewRow();
  markAsSaved();
  freeGift.checkFreeGiftQuota();
  toast.info("Form telah dibersihkan.");
};

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

  authDialog.onSuccess = (data) => {
    authDialog.show = false; // <--- Tutup modal secara paksa di sini
    onSuccess(data); // Baru jalankan logika simpan diskon/toast
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
  nextTick(() => {
    const item = items.value[index];
    const originalRp = item.originalDiskonRp || 0;
    const originalPersen = item.originalDiskonPersen || 0;

    // === [PERBAIKAN] Sinkronisasi Satu Arah ===
    if (item.diskonPersen !== originalPersen) {
      item.diskonRp = 0;
    } else if (item.diskonRp !== originalRp) {
      item.diskonPersen = 0;
    }

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

      const info = `Cust: ${header.value.customer?.nama || "Umum"}\nItem: ${item.nama}\nDiskon: ${
        currentPersen > 0 ? currentPersen + "%" : formatRupiah(currentRp)
      }`;

      requestAuthorization(
        "Otorisasi Diskon Item",
        "DISKON_ITEM",
        nominalAuth,
        {
          transaksi: header.value.nomor || "DRAFT PENAWARAN",
          barcode: item.barcode,
          keteranganLengkap: info,
        },
        (authResult) => {
          item.pin = authResult.approver;
          item.originalDiskonRp = currentRp; // Update original state
          item.originalDiskonPersen = currentPersen; // Update original state
          calculateTotals();
          toast.success("Diskon item disetujui.");
        },
        () => {
          // Batal: Kembalikan ke nilai original
          item.diskonPersen = originalPersen;
          item.diskonRp = originalRp;
          calculateTotals();
          toast.info("Diskon item dibatalkan.");
        }
      );
    } else {
      // User sengaja mengosongkan nilai (menghapus diskon)
      item.originalDiskonRp = 0;
      item.originalDiskonPersen = 0;
      calculateTotals();
    }
  });
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
    toast.error("Pilih Customer terlebih dahulu.");
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

    itemsData.forEach(
      (detail: {
        kode: string;
        nama: string;
        ukuran: string;
        jumlah: number;
        harga: number;
        total: number;
      }) => {
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
          barcode: "",
          // noSoDtf: '', // tambahkan properti ini supaya sesuai tipe
          noPengajuanHarga: headerData.nomor, // pastikan ini string
          pin: "",
          terhitungPromo: false,
          promo: "",
        });
      }
    );

    addNewRow();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(
        error.response?.data?.message || `Gagal memuat detail Pengajuan ${proposal.nomor}`
      );
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
  router.push("/transaksi/penjualan/penawaran");
};

const applyDefaultDiscount = async () => {
  // --- PERBAIKAN: PROTEKSI DISKON MANUAL/DATABASE ---
  if (isInitialLoad.value) return;

  // Jika diskon nominal sudah ada (> 0) dan diskon persen kosong,
  // artinya ini hasil otorisasi/input manual. Jangan ditimpa.
  if (
    (footer.value.diskonRp > 0 && footer.value.diskonPersen1 === 0) ||
    footer.value.pinDiskon1 ||
    header.value.nomorPromo
  ) {
    footer.value.diskonPersen1 = 0; // Pastikan persen member mati
    return;
  }
  // -----------------------------------------------------------
  // Validasi: Pastikan data pendukung ada
  if (!header.value.customer || !header.value.customer.level) {
    footer.value.diskonPersen1 = 0;
    return;
  }

  const custNama = header.value.customer?.nama?.toUpperCase() || "";
  if (custNama.includes("RETAIL")) {
    footer.value.diskonPersen1 = 0;
    return;
  }

  try {
    const levelParam = header.value.customer.level;
    // Jika format level di frontend "4 - Retailer", ambil "4" nya saja biar bersih
    const cleanLevel = levelParam.includes(" - ") ? levelParam.split(" - ")[0] : levelParam;
    const response = await api.get("/offer-form/get-default-discount", {
      params: {
        level: cleanLevel, // Kirim "4"
        total: footer.value.total || 0,
        gudang: header.value.gudang.kode,
      },
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
    console.error("Gagal mengambil diskon default:", error);
    // Opsional: fallback ke 0 atau pertahankan nilai lama jika error
  }
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
    const response = await api.get(`/offer-form/by-barcode/${barcode}`, {
      params: { gudang: header.value.gudang.kode }, // Sesuaikan dengan cara Anda menyimpan kode gudang
    });

    const product = response.data;

    // Cari baris kosong pertama untuk diganti
    const emptyRowIndex = items.value.findIndex((item) => !item.kode);

    if (emptyRowIndex !== -1) {
      // Ganti baris kosong dengan data produk baru
      items.value.splice(emptyRowIndex, 1, {
        id: Date.now(),
        kode: product.kode,
        nama: product.nama,
        kategori: product.kategori || "",
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
        noPengajuanHarga: "", // tambahkan properti default
        pin: "", // tambahkan properti default
        terhitungPromo: false,
        promo: "",
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
    scannedBarcode.value = ""; // selalu kosongkan input
  }
};

const openJenisOrderModal = () => {
  if (!header.value.customer) return toast.error("Pilih customer terlebih dahulu.");
  const hasItems = items.value.some((it) => it.kode && it.nama);
  if (!hasItems) return toast.error("Isi detail barang terlebih dahulu.");
  dialogs.jenisOrder = true;
};

const handleJenisOrderSaved = (data: JenisOrderSaved) => {
  header.value.jenisOrderKode = data.jenisOrder;
  header.value.jenisOrderNama = data.namaOrder;
  header.value.namaDtf = data.namaOrder;

  // 1. Ambil snapshot item lama untuk referensi sourceItems (Opsional, sesuai logic Mas sebelumnya)
  const sourceItemsSnapshot = JSON.parse(
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

  // 2. HAPUS baris kosong paling bawah sebelum nambahin item baru
  items.value = items.value.filter((i) => i.kode !== "");

  // 3. LOOPING: Pecah data per ukuran menjadi baris tersendiri
  data.customData.ukuranKaos.forEach((u, index) => {
    if (u.ukuran && (u.jumlah || 0) > 0) {
      items.value.push({
        // Gunakan timestamp + random + index agar ID benar-benar unik per baris
        id: Date.now() + Math.random() + index,
        kode: "CUSTOM",
        nama: data.namaOrder,
        kategori: "CUSTOM",
        ukuran: u.ukuran,
        stok: 0,
        jumlah: u.jumlah,
        harga: u.harga, // Harga satuan yang sudah dihitung modal
        isHargaReadonly: true,
        diskonPersen: 0,
        diskonRp: 0,
        total: u.jumlah * u.harga,
        barcode: "",
        noSoDtf: "",
        noPengajuanHarga: "",
        pin: "",
        scannedQty: 0,
        isReady: false,
        isCustomOrder: true,
        sod_custom: "Y",
        sod_custom_nama: data.namaOrder,

        // Simpan data teknis (titik cetak) ke masing-masing baris
        // agar saat ditarik ke SO DTF, rinciannya tidak hilang
        sod_custom_data: JSON.stringify({
          ukuranKaos: [u], // Baris ini hanya membawa ukuran dirinya sendiri
          titikCetak: data.customData.titikCetak,
          hargaPerCm: data.customData.hargaPerCm,
          sourceItems: sourceItemsSnapshot,
        }),
        terhitungPromo: false,
        promo: "",
      });
    }
  });

  // 4. Tambahkan kembali baris kosong untuk input manual berikutnya
  addNewRow();

  calculateTotals();
  dialogs.jenisOrder = false;
  toast.success(`Berhasil menambahkan ${data.customData.ukuranKaos.length} baris order custom.`);
};

const openDpInput = () => {
  if (!header.value.customer) return toast.error("Customer harus dipilih.");
  isDpInputVisible.value = true;
};

const onDpSaved = (newDp: { nomor: string; jenis: string; nominal: number }) => {
  dpItems.value.push({
    ...newDp,
    posting: "BELUM", // Berikan nilai default
    fsk: "", // Berikan nilai default
  });
  calculateTotals();
};

const handleAddDp = (newDp: { nomor: string; jenis: string; nominal: number }) => {
  if (dpItems.value.some((dp) => dp.nomor === newDp.nomor)) return toast.warning("DP sudah ada.");
  dpItems.value.push({
    ...newDp,
    posting: "BELUM",
    fsk: "",
  });
  calculateTotals();
};

const removeDpRow = (itemToRemove: DpItem) => {
  dpItems.value = dpItems.value.filter((item) => item.nomor !== itemToRemove.nomor);
  calculateTotals();
};

const handleDiscountCostUpdate = (newData: DiscountCostUpdateData) => {
  lastSuggestedPromo.value = "MANUAL_AUTH";

  footer.value.diskonPersen1 = newData.diskonPersen1;
  footer.value.diskonPersen2 = newData.diskonPersen2;
  footer.value.biayaKirim = newData.biayaKirim;

  // Simpan nilai murni dari modal ke state rahasia
  const oldDiskonRp = baseManualDiscountRp.value;
  baseManualDiscountRp.value = newData.diskonRp || 0;

  const isP1Changed =
    newData.diskonPersen1 > 0 &&
    !(header.value.nomorPromo || "").includes(newData.diskonPersen1.toString());
  const isRpChanged = baseManualDiscountRp.value > 0 && baseManualDiscountRp.value !== oldDiskonRp;

  if (
    newData.pinDiskon1 ||
    (isP1Changed && !newData.diskonPersen2) ||
    (isRpChanged && !header.value.nomorPromo)
  ) {
    header.value.nomorPromo = "";
    header.value.namaPromo = "";
  }

  // Gabung Promo Maps
  if (newData.diskonPersen2 === 5) {
    if (
      header.value.nomorPromo &&
      header.value.nomorPromo !== "PRO-2026-003" &&
      !header.value.nomorPromo.includes("PRO-2026-003")
    ) {
      header.value.nomorPromo = `${header.value.nomorPromo},PRO-2026-003`;
      header.value.namaPromo = `${header.value.namaPromo} + MAPS 5%`;
    } else if (!header.value.nomorPromo) {
      header.value.nomorPromo = "PRO-2026-003";
      header.value.namaPromo = "PROMO GOOGLE MAPS REVIEW 5%";
    }
  } else {
    if (header.value.nomorPromo && header.value.nomorPromo.includes("PRO-2026-003")) {
      header.value.nomorPromo = header.value.nomorPromo
        .replace(/,PRO-2026-003|PRO-2026-003,/g, "")
        .replace("PRO-2026-003", "");
      header.value.namaPromo = (header.value.namaPromo || "")
        .replace(" + MAPS 5%", "")
        .replace("PROMO GOOGLE MAPS REVIEW 5%", "");
    }
  }

  if (newData.pinDiskon1) footer.value.pinDiskon1 = newData.pinDiskon1;
  if (newData.pinDiskon2) footer.value.pinDiskon2 = newData.pinDiskon2;

  calculateTotals();
};

const saveAndConvertToSo = async () => {
  // Cek agar tombol tidak diproses dua kali
  if (isSaving.value) return;

  if (!header.value.customer) return toast.error("Customer harus dipilih.");

  const validItems = items.value.filter((item) => item.kode);
  for (const item of validItems) {
    const isStickerPromoToko =
      (String(item.barcode) === "25014783" || String(item.kode) === "2500053") &&
      String(item.ukuran).toUpperCase() === "A6" &&
      (item.harga === 0 || item.terhitungPromo || item.promo === "PRO-2026-001");

    if (
      !isStickerPromoToko &&
      (item.harga === null || item.harga === undefined || item.harga < 0)
    ) {
      toast.error(`Harga untuk barang '${item.nama}' harus diisi.`);
      return;
    }
  }

  // =========================================================
  // --- CEK PROMO AKTIF & TERAPKAN OTOMATIS SAAT SIMPAN ---
  // =========================================================
  await autoPromo.flushEvaluate();
  calculateTotals();
  await nextTick();

  // INJEKSI BONUS STICKER MARET (Jika tidak ditolak dan promo yang aktif adalah Maret)
  if (header.value.nomorPromo === "PRO-2026-001" && !isStickerBonusRejected.value) {
    await applyMarchBonusSticker(true);
    calculateTotals();
  }

  const tipeKunjungan = await checkAndPromptVisit(
    header.value.customer?.kode || "",
    header.value.tanggal,
    isEditMode.value
  );

  if (tipeKunjungan === "CANCEL") return;

  if (freeGift.freeGiftQuota.available && !items.value.some((i) => i.isFreeGift)) {
    const confirmed = await new Promise<boolean>((resolve) => {
      showConfirmation(
        () => resolve(true),
        `⚠️ Customer ini berhak dapat COMBED 24S gratis (Sisa kuota: ${freeGift.freeGiftQuota.sisaKuota}), tapi belum di-scan. Lanjutkan tanpa memberikan hadiah?`
      );
    });
    if (!confirmed) return;
  }

  if (isCurrentPromoRequiresReview.value && !pendingReviewProofFile.value) {
    toast.error(
      "Promo ini wajib disertai bukti ulasan Google Maps. Upload dulu lewat dialog promo sebelum menyimpan."
    );
    return;
  }

  showConfirmation(async () => {
    isSaving.value = true;
    try {
      const payload = {
        header: header.value,
        footer: footer.value,
        details: items.value
          .filter((item) => item.kode)
          .map((item) => ({
            ...item,
            sod_custom: item.isCustomOrder ? "Y" : "N",
          })),
        dps: dpItems.value,
        user: authStore.user,
        isNew: !isEditMode.value,
        tipeKunjungan,
      };

      const response = await api.post("/offer-form/save", payload);
      const savedNomor = response.data.nomor;

      if (pendingReviewProofFile.value && savedNomor) {
        const formData = new FormData();
        formData.append("image", pendingReviewProofFile.value);
        try {
          await api.post(`/offer-form/upload-review-proof/${savedNomor}`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch {
          toast.warning(
            "Penawaran tersimpan, tapi bukti ulasan gagal diunggah. Upload manual nanti."
          );
        }
      }

      toast.success("Penawaran berhasil disimpan. Mengalihkan ke Surat Pesanan...");
      markAsSaved();

      router.push({
        name: "SuratPesananCreate",
        query: { refPenawaran: savedNomor },
      });
    } catch (error: unknown) {
      isSaving.value = false;
      const err = error as AxiosError<{ message?: string }>;

      toast.error(err.response?.data?.message || "Gagal memproses data.");
    } finally {
      isSaving.value = false;
    }
  }, "Simpan penawaran dan buat Surat Pesanan (SO)?");
};

const handleKodeKeydown = (e: KeyboardEvent, index: number) => {
  if (e.key === "F1" || e.key === "F2") {
    e.preventDefault();
    openProductSearch(index);
  }
};

const onPanelProductsAdded = (selections: ProductPanelSelection[]) => {
  selections.forEach((sel) => {
    // Cek duplikat kode+ukuran — kalau sudah ada, tambahkan qty-nya saja
    const existing = items.value.find(
      (item) => item.kode === sel.kode && item.ukuran === sel.ukuran
    );
    if (existing) {
      existing.jumlah += sel.jumlah;
      return;
    }

    const newItem = {
      id: Date.now() + Math.random(),
      kode: sel.kode,
      nama: sel.nama,
      kategori: sel.kategori || "",
      ukuran: sel.ukuran || "-",
      stok: sel.stok || 0,
      harga: sel.harga || 0,
      isHargaReadonly: (sel.harga || 0) > 0,
      jumlah: sel.jumlah,
      diskonPersen: 0,
      diskonRp: 0,
      total: (sel.harga || 0) * sel.jumlah,
      barcode: sel.barcode || sel.kode,
      noPengajuanHarga: "",
      pin: "",
      terhitungPromo: false,
      promo: "",
    };

    const emptyIdx = items.value.findIndex((item) => !item.kode);
    if (emptyIdx !== -1) {
      items.value.splice(emptyIdx, 1, newItem);
    } else {
      items.value.push(newItem);
    }
  });

  addNewRow();
  calculateTotals();
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
    case "CUSTOM":
      return "purple-darken-2";
    default:
      return "grey-lighten-1";
  }
};

// Gunakan debounce (opsional tapi disarankan) agar tidak nembak API setiap ngetik angka
let debounceTimer: ReturnType<typeof setTimeout>;

watch(
  () => footer.value.total,
  () => {
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
  }
);

watch(
  items,
  () => {
    calculateTotals();
    // Pengecekan promo real-time sekarang sudah menumpang
    // otomatis di dalam fungsi calculateTotals() via autoPromo.debouncedEvaluate()
  },
  { deep: true }
);
watch(
  items,
  () => {
    freeGift.debouncedCheckFreeGiftQuota();
  },
  { deep: true }
);
watch(
  [
    () => footer.value.biayaKirim,
    () => footer.value.diskonPersen1,
    () => footer.value.diskonPersen2,
  ],
  calculateTotals
);
watch(
  () => promoHeaderProxy.nomorPromo,
  (val) => {
    header.value.nomorPromo = val;
  }
);
watch(
  () => promoHeaderProxy.namaPromo,
  (val) => {
    header.value.namaPromo = val;
  }
);
watch(
  () => promoHeaderProxy.diskonRp,
  (val) => {
    if (baseManualDiscountRp.value !== val) {
      baseManualDiscountRp.value = val;
      calculateTotals();
    }
  }
);
watch(
  () => promoHeaderProxy.diskonPersen1,
  (val) => {
    footer.value.diskonPersen1 = val;
  }
);
watch(isFooterDiskonRpFocused, (focused) => {
  if (focused) {
    previousDiskonRp.value = footer.value.diskonRp;
  }
});
watch(() => header.value.ppnPersen, calculateTotals);

watch(
  () => header.value.top,
  (newTop) => {
    const date = new Date(header.value.tanggal);
    if (isValid(date)) {
      header.value.tempo = format(addDays(date, newTop || 0), "yyyy-MM-dd");
    }
  }
);
watch(
  () => header.value.tanggal,
  (newDate) => {
    const date = new Date(newDate);
    if (isValid(date)) {
      header.value.tempo = format(addDays(date, header.value.top || 0), "yyyy-MM-dd");
    }
  }
);
watch(
  () => header.value.customerKode,
  (newKode) => {
    if (newKode) loadCustomerDetails();
  }
);

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [header, items, footer],
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isSaving.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Customer dipilih atau Keterangan diisi
    const hasHeader = header.value.customer !== null || header.value.keterangan.trim() !== "";

    // 2. Items: Ada item valid (kode terisi)
    const hasItems = items.value.some((i) => i.kode !== "");

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
    toast.error(
      `Anda tidak memiliki izin untuk ${
        requiredPermission.value === "insert" ? "membuat" : "mengubah"
      } data penawaran.`
    );
    router.push("/transaksi/penjualan/penawaran");
    return;
  }

  await autoPromo.fetchPromos(header.value.gudang.kode, header.value.tanggal);

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
      <v-btn
        color="cyan-darken-2"
        size="small"
        prepend-icon="mdi-tshirt-crew-outline"
        :disabled="!header.customer"
        @click="openJenisOrderModal"
      >
        Input Jenis Order
      </v-btn>
      <v-btn
        color="deep-purple-darken-1"
        size="small"
        prepend-icon="mdi-cart-plus"
        :disabled="!header.customer"
        @click="isProductPanelVisible = true"
      >
        Cari Produk
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn
        v-if="!header.existingSoNomor"
        size="small"
        color="primary"
        prepend-icon="mdi-content-save"
        @click="showConfirmation(save, 'Anda yakin ingin menyimpan data penawaran ini?')"
        :loading="isSaving"
      >
        Simpan
      </v-btn>
      <v-btn
        v-if="!header.existingSoNomor"
        color="success"
        size="small"
        prepend-icon="mdi-swap-horizontal"
        :loading="isSaving"
        @click="saveAndConvertToSo"
      >
        Simpan & Jadikan SO
      </v-btn>
      <v-btn
        v-else
        color="indigo"
        size="small"
        prepend-icon="mdi-eye-outline"
        @click="goToExistingSo"
      >
        Lihat SO: {{ header.existingSoNomor }}
      </v-btn>
      <v-btn
        v-if="!isEditMode"
        size="small"
        prepend-icon="mdi-cancel"
        @click="showConfirmation(resetForm, 'Batalkan dan kosongkan semua isian?')"
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

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6">
              <v-text-field
                label="Nomor"
                :model-value="header.nomor || '<Otomatis>'"
                readonly
                variant="filled"
                density="compact"
                hide-details
              >
              </v-text-field>
            </v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tanggal"
                v-model="header.tanggal"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field
            ></v-col>
            <v-col cols="12">
              <v-text-field
                label="Sales Counter"
                :model-value="header.userCreate"
                readonly
                variant="filled"
                density="compact"
                hide-details
                prepend-inner-icon="mdi-account-tie"
              ></v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Customer"
                :model-value="
                  header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''
                "
                readonly
                @click="openCustomerSearch"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
              >
                <template #prepend-inner>
                  <v-btn
                    icon="mdi-account-plus"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    class="me-2"
                    @click.stop="isNewCustomerFormVisible = true"
                    title="Buat Customer Baru"
                  ></v-btn>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="12"
              ><v-text-field
                label="Alamat"
                :model-value="header.customer?.alamat"
                readonly
                variant="filled"
                density="compact"
                hide-details
              ></v-text-field
            ></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Kota / Telp"
                :model-value="
                  header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''
                "
                readonly
                variant="filled"
                density="compact"
                hide-details
              ></v-text-field
            ></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Level"
                :model-value="header.customer?.level"
                readonly
                variant="filled"
                density="compact"
                hide-details
              ></v-text-field
            ></v-col>
            <v-col cols="4"
              ><v-text-field
                label="TOP"
                v-model.number="header.top"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field
            ></v-col>
            <v-col cols="8"
              ><v-text-field
                label="Tgl Tempo"
                v-model="header.tempo"
                type="date"
                variant="filled"
                readonly
                density="compact"
                hide-details
              ></v-text-field
            ></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Keterangan"
                v-model="header.keterangan"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field
            ></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section footer-summary-section">
          <v-row dense align="center" no-gutters>
            <v-col cols="auto" class="d-flex ga-2 align-center">
              <v-tooltip text="Input DP (Uang Muka)" location="top">
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    icon="mdi-cash-plus"
                    color="teal"
                    size="small"
                    variant="flat"
                    @click="openDpInput"
                  />
                </template>
              </v-tooltip>

              <v-tooltip text="Atur Diskon & Biaya Faktur" location="top">
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    icon="mdi-sale"
                    color="blue-darken-2"
                    size="small"
                    variant="outlined"
                    @click="handleOpenDiscountModal"
                  />
                </template>
              </v-tooltip>

              <v-tooltip text="Lihat Rincian DP Terlampir" location="top">
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    icon="mdi-format-list-bulleted"
                    color="teal"
                    size="small"
                    variant="outlined"
                    @click="isDpListModalVisible = true"
                  />
                </template>
              </v-tooltip>
            </v-col>

            <v-spacer></v-spacer>

            <v-col cols="12" md="6" lg="5">
              <v-list density="compact" class="pa-0 bg-transparent">
                <v-list-item v-if="footer.diskonRp > 0" class="px-0 min-h-0">
                  <v-list-item-title class="text-caption text-error font-weight-bold"
                    >Total Diskon</v-list-item-title
                  >
                  <template #append>
                    <span class="text-caption text-error font-weight-bold"
                      >- {{ formatRupiah(footer.diskonRp) }}</span
                    >
                  </template>
                </v-list-item>

                <v-list-item class="px-0 min-h-0">
                  <v-list-item-title class="text-caption">Grand Total</v-list-item-title>
                  <template #append>
                    <span class="text-subtitle-1 font-weight-bold">{{
                      formatRupiah(footer.grandTotal)
                    }}</span>
                  </template>
                </v-list-item>

                <v-list-item v-if="footer.totalDp > 0" class="px-0 min-h-0">
                  <v-list-item-title class="text-caption text-teal font-weight-bold"
                    >Uang Muka (DP)</v-list-item-title
                  >
                  <template #append>
                    <span class="text-caption text-teal font-weight-bold"
                      >- {{ formatRupiah(footer.totalDp) }}</span
                    >
                  </template>
                </v-list-item>

                <v-list-item class="px-0 border-t mt-1 pt-1">
                  <v-list-item-title class="text-subtitle-2 font-weight-bold"
                    >Sisa Bayar</v-list-item-title
                  >
                  <template #append>
                    <span class="text-h6 font-weight-black text-primary">{{
                      formatRupiah(footer.belumDibayar)
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
          <v-text-field
            v-model="scannedBarcode"
            label="Scan Barcode di Sini..."
            placeholder="Input barcode lalu tekan Enter"
            variant="outlined"
            density="compact"
            prepend-inner-icon="mdi-barcode-scan"
            hide-details
            clearable
            @keydown.enter.prevent="handleBarcodeScan"
          >
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
              </div>
            </div>
          </div>
        </v-slide-y-transition>

        <v-slide-y-transition>
          <div v-if="freeGift.freeGiftQuota.available" class="free-gift-banner mb-3">
            <div class="banner-shine"></div>
            <div class="banner-content">
              <div class="gift-icon-wrapper">
                <v-icon icon="mdi-gift-outline" size="24" class="gift-bounce" />
              </div>
              <div class="banner-text">
                <div class="banner-title">🎉 Hadiah Gratis Tersedia!</div>
                <div class="banner-subtitle">
                  Customer berhak dapat COMBED 24S gratis — Sisa kuota:
                  <strong>{{ freeGift.freeGiftQuota.sisaKuota }}</strong>
                </div>
              </div>
              <v-btn
                color="white"
                variant="flat"
                size="small"
                class="scan-gift-btn"
                prepend-icon="mdi-barcode-scan"
                @click="freeGift.openFreeGiftScanDialog"
              >
                Scan Hadiah Gratis
              </v-btn>
            </div>
          </div>
        </v-slide-y-transition>
        <v-data-table
          :headers="tableHeaders"
          :items="items"
          density="compact"
          class="desktop-table vertically-aligned-table"
          fixed-header
          :items-per-page="-1"
        >
          <template #[`item.kode`]="{ item, index }">
            <v-text-field
              v-model="item.kode"
              variant="underlined"
              density="compact"
              hide-details
              placeholder="F1/F2..."
              @keydown="handleKodeKeydown($event, index)"
            ></v-text-field>
          </template>

          <template #[`item.nama`]="{ item }">
            <div class="scrollable-cell">{{ item.nama }}</div>
          </template>

          <template #[`item.kategori`]="{ item }">
            <v-chip
              v-if="item.kategori"
              size="x-small"
              :color="getCategoryColor(item.kategori)"
              variant="flat"
              class="font-weight-bold text-white"
            >
              {{ item.kategori }}
            </v-chip>
          </template>

          <template #[`item.stok`]="{ item }">
            <v-text-field
              :model-value="item.stok"
              variant="underlined"
              density="compact"
              hide-details
              readonly
              single-line
              class="text-right"
              :disabled="!item.kode"
            ></v-text-field>
          </template>

          <template #[`item.jumlah`]="{ item }">
            <v-text-field
              v-model.number="item.jumlah"
              type="number"
              variant="underlined"
              density="compact"
              hide-details
              single-line
              class="text-right"
              :disabled="!item.kode"
            ></v-text-field>
          </template>

          <template #[`item.harga`]="{ item }">
            <v-text-field
              :model-value="focusedRowId === item.id ? item.harga : formatRupiah(item.harga)"
              @update:model-value="item.harga = Number(String($event).replace(/[^0-9]/g, '')) || 0"
              @focus="focusedRowId = item.id"
              @blur="focusedRowId = -1"
              placeholder="0"
              type="text"
              variant="underlined"
              density="compact"
              hide-details
              single-line
              class="text-right"
              :disabled="!item.kode"
              :readonly="item.isHargaReadonly"
            ></v-text-field>
          </template>

          <template #[`item.diskonPersen`]="{ item }">
            <v-text-field
              v-model.number="item.diskonPersen"
              type="number"
              variant="underlined"
              density="compact"
              hide-details
              single-line
              class="text-right"
              @blur="handleItemDiscountChange(items.indexOf(item))"
              :disabled="!item.kode"
            ></v-text-field>
          </template>

          <template #[`item.diskonRp`]="{ item }">
            <v-text-field
              :model-value="focusedRowId === item.id ? item.diskonRp : formatRupiah(item.diskonRp)"
              @update:model-value="
                item.diskonRp = Number(String($event).replace(/[^0-9]/g, '')) || 0
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
              class="text-right"
              :disabled="!item.kode"
            ></v-text-field>
          </template>

          <template #[`item.total`]="{ item }">
            <div class="text-caption font-weight-bold text-right">
              {{ formatRupiah(item.total) }}
            </div>
          </template>

          <template #[`item.actions`]="{ item }">
            <v-btn
              icon="mdi-delete"
              size="x-small"
              variant="text"
              color="error"
              @click="removeRow(items.indexOf(item))"
            ></v-btn>
          </template>

          <!-- <template #[`item.noSoDtf`]="{ item, index }">
            <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details placeholder="F1..."
              @keydown.f1.prevent="openSoDtfSearch(index)">
            </v-text-field>
          </template> -->

          <template #[`item.noPengajuanHarga`]="{ item, index }">
            <v-text-field
              v-model="item.noPengajuanHarga"
              variant="underlined"
              density="compact"
              hide-details
              placeholder="F1..."
              @keydown.f1.prevent="openPriceProposalSearch(index)"
            >
            </v-text-field>
          </template>
          <template #[`body.append`]>
            <tr class="qty-footer-row">
              <td
                v-for="header in tableHeaders"
                :key="header.key"
                :class="
                  header.align === 'end' ||
                  header.key === 'jumlah' ||
                  header.key === 'harga' ||
                  header.key === 'total'
                    ? 'text-right'
                    : 'text-left'
                "
              >
                <div v-if="header.key === 'jumlah'" class="qty-value">
                  {{ totalQty }}
                </div>

                <div
                  v-else-if="header.key === 'stok'"
                  class="text-caption font-weight-bold text-medium-emphasis text-right mr-2"
                >
                  TOTAL QTY:
                </div>
              </td>
            </tr>
          </template>
        </v-data-table>
        <div class="pa-2 border-t d-flex align-center justify-start bg-surface">
          <v-btn
            size="small"
            @click="addNewRow"
            prepend-icon="mdi-plus"
            variant="text"
            color="primary"
          >
            Tambah Baris
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <CustomerSearchModal
      v-if="isCustomerSearchVisible"
      :gudang="header.gudang.kode"
      @close="isCustomerSearchVisible = false"
      @customer-selected="onCustomerSelected"
    />
    <!-- <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''"
            @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" /> -->
    <ProductSidePanel
      v-model="isProductPanelVisible"
      :gudang="header.gudang.kode"
      @products-added="onPanelProductsAdded"
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
    <!-- <SoDtfSearchModal v-if="isSoDtfSearchVisible" :cabang="header.gudang.kode" :customerKode="header.customer?.kode"
      @close="isSoDtfSearchVisible = false" @selected="onSoDtfSelected" /> -->
    <PriceProposalSearchModal
      v-if="isPriceProposalSearchVisible"
      :cabang="header.gudang.kode"
      :customerKode="header.customer?.kode ?? ''"
      @close="isPriceProposalSearchVisible = false"
      @selected="onPriceProposalSelected"
    />

    <DpInputModal
      v-if="isDpInputVisible"
      :customerKode="header.customer?.kode || ''"
      :nomor-so="header.nomor || 'DRAFT'"
      :minimal-dp="0"
      :existing-dp="footer.diskonRp"
      @close="isDpInputVisible = false"
      @dp-saved="onDpSaved"
    />

    <DpListModal
      v-if="isDpListModalVisible"
      :dp-items="dpItems"
      :customer-kode="header.customer?.kode || ''"
      @close="isDpListModalVisible = false"
      @remove-dp="removeDpRow"
      @add-dp="handleAddDp"
    />

    <DiscountCostModal
      v-if="isDiscountCostModalVisible"
      source="OFFER"
      :footer-data="{ ...footer, diskonRp: baseManualDiscountRp }"
      :total-so="footer.subtotalKaos"
      :gross-total="grossTotalDisplay"
      :net-after-item-discount="footer.total"
      :customer="header.customer"
      :gudang-kode="header.gudang.kode"
      :ppn-persen="header.ppnPersen"
      @close="isDiscountCostModalVisible = false"
      @update="handleDiscountCostUpdate"
    />

    <JenisOrderModal
      v-if="dialogs.jenisOrder"
      :model-value="dialogs.jenisOrder"
      :penawaran-details="penawaranDetails"
      :penawaran-barang-list="penawaranBarangList"
      :source-type="'penawaran'"
      @close="dialogs.jenisOrder = false"
      @saved="handleJenisOrderSaved"
    />

    <CustomerForm
      v-if="isNewCustomerFormVisible"
      @close="isNewCustomerFormVisible = false"
      @customer-saved="onNewCustomerSaved"
    />

    <CustomerVisitDialog
      v-model="isVisitDialogVisible"
      @select="handleSelectVisit"
      @cancel="handleCancelVisit"
    />

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold"> Konfirmasi </v-card-title>
        <v-card-text>
          {{ confirmText }}
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog"> Tidak </v-btn>
          <v-btn color="primary" variant="tonal" @click="executePendingAction">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isPrintConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold"> Simpan Berhasil </v-card-title>
        <v-card-text>
          Data penawaran {{ printConfirmNomor }} berhasil disimpan. <br /><br />
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

    <v-dialog v-model="isFreeGiftScanDialogOpen" max-width="480" persistent>
      <v-card class="rounded-xl free-gift-dialog">
        <div class="free-gift-dialog-header">
          <div class="header-icon-circle">
            <v-icon icon="mdi-gift-outline" size="22" color="white" />
          </div>
          <div class="header-text">
            <div class="header-title">Scan Hadiah Gratis</div>
            <div class="header-subtitle">Grand Opening K12</div>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            color="white"
            @click="isFreeGiftScanDialogOpen = false"
          />
        </div>
        <v-card-text class="pa-5">
          <v-alert
            type="info"
            variant="tonal"
            density="comfortable"
            class="mb-5 free-gift-info-alert"
            icon="mdi-information"
          >
            Silakan scan barcode barang <strong>COMBED 24S</strong> yang dipilih customer sebagai
            hadiah gratis.
          </v-alert>
          <v-text-field
            ref="freeGiftInputRefEl"
            v-model="freeGiftScanBarcode"
            label="Scan Barcode Hadiah"
            placeholder="Arahkan scanner ke sini..."
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-barcode-scan"
            hide-details
            clearable
            :loading="isFreeGiftScanning"
            :disabled="isFreeGiftScanning"
            autofocus
            class="free-gift-scan-input"
            @keydown.enter.prevent="freeGift.handleFreeGiftScan"
          />
          <div class="scan-hint">
            <v-icon size="14" color="grey">mdi-information-outline</v-icon>
            Barang selain COMBED 24S akan ditolak otomatis.
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <DiscountConfirmationDialog
      v-model="isPromoConfirmVisible"
      :customer-level="header.customer?.level || 'Standar'"
      :diskon-persen-member="footer.diskonPersen1"
      :diskon-nominal-member="Math.round((footer.diskonPersen1 / 100) * footer.subtotalKaos)"
      :promo-nama="pendingPromoData.nama"
      :promo-nominal="pendingPromoData.diskon"
      :item-discounts="uniqueItemDiscounts"
      :promo-requires-review="pendingPromoRequiresReview"
      @use-member="useMemberDiscount"
      @use-promo="() => applyPromoDiscount()"
      @use-promo-with-proof="handleUsePromoWithProof"
      @ignore="closePromoDialog"
    />
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
  border-top: 3px solid #0d47a1 !important;
  /* Border pemisah tebal biru */
  color: #0d47a1 !important;
  /* Teks Biru */
  font-weight: 900;
  font-size: 14px;
  padding: 0 16px;
  height: 40px;
}

/* --- 3. PERBAIKAN HEADER (TETAP BIRU) --- */
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
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
.v-data-table :deep(input[type="number"]) {
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

/* Paksa semua v-text-field dalam tabel rata vertikal */
.desktop-table :deep(tbody td) {
  vertical-align: middle !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  height: 40px !important;
}

.desktop-table :deep(.v-field__input) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  min-height: 32px !important;
}

.desktop-table :deep(.v-input__details) {
  display: none !important;
}

.desktop-table :deep(.v-field--variant-underlined .v-field__input) {
  padding-top: 4px !important;
}

.free-gift-banner {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  box-shadow: 0 8px 20px -4px rgba(56, 239, 125, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.25);
  animation: giftBannerEntrance 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes giftBannerEntrance {
  0% {
    opacity: 0;
    transform: scale(0.9) translateY(-10px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
.banner-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    to right,
    transparent 0%,
    rgba(255, 255, 255, 0.35) 50%,
    transparent 100%
  );
  transform: skewX(-25deg);
  animation: shineMove 3.5s infinite ease-in-out;
  pointer-events: none;
}
.banner-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  color: white;
}
.gift-icon-wrapper {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.gift-bounce {
  animation: giftBounce 1.2s ease-in-out infinite;
}
@keyframes giftBounce {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-4px) rotate(-8deg);
  }
  75% {
    transform: translateY(-2px) rotate(8deg);
  }
}
.banner-text {
  flex-grow: 1;
}
.banner-title {
  font-size: 14px;
  font-weight: 800;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.banner-subtitle {
  font-size: 12px;
  opacity: 0.95;
  margin-top: 2px;
}
.scan-gift-btn {
  flex-shrink: 0;
  color: #11998e !important;
  font-weight: 700;
  animation: giftBtnPulse 2s infinite;
}
@keyframes giftBtnPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.5);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(255, 255, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
  }
}
.free-gift-dialog {
  overflow: hidden;
}
.free-gift-dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 16px 20px;
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}
.header-icon-circle {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.header-text {
  flex-grow: 1;
  min-width: 0;
}
.header-title {
  color: white;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.3;
  white-space: normal;
}
.header-subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 500;
  margin-top: 1px;
}
.free-gift-info-alert {
  font-size: 13px;
  line-height: 1.5;
}
.free-gift-scan-input :deep(.v-field) {
  border-radius: 10px;
}
.free-gift-scan-input :deep(.v-field__input) {
  font-size: 15px;
}
.scan-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.55);
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
  background: linear-gradient(
    to right,
    transparent 0%,
    rgba(255, 255, 255, 0.2) 50%,
    transparent 100%
  );
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

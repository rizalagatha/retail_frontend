<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { useCashierSessionStore } from "@/stores/cashierSessionStore";
import api from "@/services/api";
import { format, parseISO, addDays } from "date-fns";
import type { AxiosError } from "axios";
import axios from "axios";
import LogoKaosan from "@/assets/logo.png";
import LogoRezso from "@/assets/rezso.jpg";
import { formatRupiah } from "@/utils/formatRupiah";
import { useAutoPromo } from "@/composables/useAutoPromo";
import {
  PROMO_GRAND_OPENING_K12,
  isEligibleFreeGiftItem,
  calcFreeGiftEligibleSubtotal,
  isFreeGiftSizeAllowed,
} from "@/constants/promoConfig";

import PageLayout from "@/components/PageLayout.vue";
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import SoSearchModalForInvoice from "@/components/lookup/SoSearchModalForInvoice.vue";
import ProductSearchModal from "@/components/lookup/ProductSearchModal.vue";
import PaymentModal from "@/components/modal/PaymentModal.vue";
import UnpaidDpSearchModal from "@/components/lookup/UnpaidDpSearchModal.vue";
import CustomerForm from "@/components/form/CustomerForm.vue";
import PromoSearchModal from "@/components/lookup/PromoSearchModal.vue";
import MemberForm from "@/components/form/MemberForm.vue";
import DiskonForm from "@/components/form/DiskonForm.vue";
import LinkedDpModal from "@/components/modal/LinkedDpModal.vue";
import AuthorizationModal from "@/components/modal/AuthorizationModal.vue";
import SoDtfSearchModal from "@/components/lookup/SoDtfSearchModal.vue";
import PromoBonusModal from "@/components/modal/PromoBonusModal.vue";
import SjSearchModalForInvoice from "@/components/lookup/SjSearchModalForInvoice.vue";
import DiscountConfirmationDialog from "@/components/dialog/DiscountConfirmationDialog.vue";
import ProductSidePanel from "@/components/panel/ProductSidePanel.vue";

// --- Tipe Data ---
interface Item {
  id: number;
  kode?: string;
  nama?: string;
  ukuran?: string;
  stok?: number; // Stok Fisik (Showroom)
  stokPesanan?: number; // Stok Pesanan (SO) [BARU]
  qtyso?: number;
  jumlah: number;
  harga?: number;
  diskonPersen?: number;
  diskonRp?: number;
  total?: number;
  barcode?: string;
  hpp?: number;
  kategori?: string;
  noSoDtf?: string;
  noPengajuanHarga?: string;
  terhitungPromo: boolean;
  promoQty?: number;
  _isHargaEditable: boolean;
  promo?: string;
  originalDiskonRp?: number;
  originalDiskonPersen?: number;
  subtotal?: number;
  lastPin?: string;
  isCustomOrder?: boolean;
  fromBackend?: boolean;
  isJasa?: boolean;
  isFreeGift?: boolean;
  isHargaKhusus?: boolean;
}
interface LinkedDp {
  nomor: string;
  jenis: string;
  nominal: number;
}
interface AuthDialogState {
  show: boolean;
  title: string;
  jenis: string;
  nominal: number;
  transaksi?: string;
  barcode?: string;
  keterangan?: string; // [PENTING] Untuk info detail di HP
  onSuccess: (data: { authNomor: string; approver: string }) => void;
  onCancel: () => void;
}
interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  level?: string;
  level_kode?: string;
  level_nama?: string;
  limitTrans?: number;
}
interface Member {
  hp: string;
  nik?: string; // Tambahkan nik (opsional)
  nama: string;
  alamat: string;
  gender: string;
  usia: string; // Ubah ke string agar sesuai dengan MemberForm
  referensi: string;
}
interface ProductInput {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  stokFisik?: number; // [BARU]
  stokPesanan?: number; // [BARU]
  harga: number;
  barcode: string;
  kategori: string;
  harga1?: number;
  harga2?: number;
  harga3?: number;
  harga4?: number;
}
interface DownPayment {
  nomor: string;
  jenis: string;
  nominal: number;
}
// interface SoDtf {
//   nomor: string;
//   // tambahkan properti lain jika ada
// }
// interface SoDtfItem {
//   kode: string;
//   nama: string;
//   ukuran: string;
//   jumlah: number;
//   harga: number;
// }
// interface ApiInvoiceItem {
//   invd_kode: string;
//   nama_barang: string;
//   invd_ukuran: string;
//   invd_jumlah: number;
//   invd_harga: number;
//   invd_diskon: number;
//   stok?: number;
//   stokSO?: number;
//   [key: string]: unknown;
// }

// interface InvoiceItem {
//   id: number;
//   kode: string;
//   nama: string;
//   ukuran: string;
//   jumlah: number;
//   harga: number;
//   diskonRp: number;
//   // field lain dari item jika perlu
//   [key: string]: unknown;
// }

interface SoItem {
  kode: string;
  nama: string;
  ukuran_dtf?: string;
  custom_json?: string;
  ukuran_asli?: string;
  stokFisik?: number; // Stok Fisik (Showroom)
  stokPesanan?: number; // Stok Pesanan (SO) [BARU]
  qtyso?: number;
  harga?: number;
  diskonPersen?: number;
  diskonRp?: number;
  total?: number;
  barcode?: string;
  hpp?: number;
  kategori?: string;
  noSoDtf?: string;
  noPengajuanHarga?: string;
  terhitungPromo?: boolean;
  _isHargaEditable?: boolean;
  promo?: string;
  originalDiskonRp?: number;
  originalDiskonPersen?: number;
  lastPin?: string;
  isCustomOrder?: boolean;
}

interface SjApiItem {
  kode: string;
  nama?: string;
  nama_barang?: string;
  ukuran: string;
  kategori: string;
  stok?: number | string;
  sjd_jumlah?: number | string;
  jumlah?: number | string;
  harga_so?: number | string;
  brgd_harga?: number | string;
  harga?: number | string;
  hpp?: number | string;
  brgd_hpp?: number | string;
  disc?: number | string;
  diskon?: number | string;
  barcode?: string;
}

interface DiscountRule {
  nominal1: number;
  nominal2: number;
  diskon1: number;
  diskon2: number;
}

interface SoDtfItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  stok?: number;
}

// interface PromoItem {
//   kode: string;
//   ukuran: string;
//   discPersen?: number;
//   discRp?: number;
// }

interface InvoiceItemApi {
  kode: string;
  nama_barang: string;
  ukuran: string;
  jumlah: number | string;
  harga: number | string;
  diskonRp?: number | string;
  diskonPersen?: number | string;
  total: number;
  barcode?: string;
  stok?: number;
  stokSO?: number;
  qtySO?: number;
  kategori?: string;
  nourut?: number;
}

interface SalesCounter {
  kode: string;
  nama: string;
}

interface HargaKhususItem {
  kode: string;
  ukuran: string;
  harga: number;
}

interface RecalcDiscountResult {
  kode: string;
  ukuran: string;
  disc: number;
  diskon: number;
}

interface MpPackagingItem {
  kode: string;
  nama: string;
  harga: number;
  stok: number;
  qty: number;
  checked: boolean;
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "27";
const cashierSessionStore = useCashierSessionStore();
// [BARU] Deteksi user toko
const isStoreUser = computed(() => {
  const cabang = authStore.user?.cabang || "";
  return /^K\d+/.test(cabang);
});
const mpPackagingList = ref<MpPackagingItem[]>([]);
const isLoadingMpPackaging = ref(false);
const isMpPackagingDialogOpen = ref(false);

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => (isEditMode.value ? "Ubah Invoice" : "Buat Invoice"));
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));
const dynamicLogo = computed(() => {
  if (authStore.user?.cabang === "K04") {
    return LogoRezso;
  }
  return LogoKaosan;
});
const isViewMode = computed(() => route.query.mode === "view");
const isReadonly = computed(() => {
  return isLockedFsk.value || isViewMode.value;
});
// [REVISI] Izinkan toggle Marketplace untuk KON dan K05
const isUserMarketplaceEligible = computed(() => {
  const cabang = authStore.user?.cabang || "";
  return cabang === "KON" || cabang === "K05" || cabang === "K02";
});

const isKpr = computed(() => authStore.user?.cabang === "KPR");

const canSearchManual = computed(() => {
  const cabang = authStore.user?.cabang || "";
  return ["KPR", "K01"].includes(cabang);
});

const referenceLabel = computed(() => (isKpr.value ? "No. Surat Jalan" : "No. Pesanan (SO)"));

const referenceDateLabel = computed(() => (isKpr.value ? "Tgl. SJ" : "Tgl. SO"));

const memberLabel = computed(() => {
  return header.customer.kode === "K-00079" ? "Data Karyawan" : "Info Member";
});

const hasMpPackagingStock = computed(() => mpPackagingList.value.some((p) => p.stok > 0));
const totalMpPackagingPcs = computed(() =>
  mpPackagingList.value.reduce((sum, p) => sum + p.qty, 0)
);

// Update isUserKon jika masih digunakan di tempat lain,
// tapi untuk UI Toggle kita gunakan isUserMarketplaceEligible
// const isUserKon = computed(() => authStore.user?.cabang === 'KON');

const isLoading = ref(true);

const initialHeaderState = {
  nomor: "",
  idrec: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  gudang: { kode: authStore.user?.cabang || "", nama: authStore.user?.cabangNama || "" },
  customer: {
    kode: "",
    nama: "",
    alamat: "",
    kota: "",
    telp: "",
    level: "",
    level_kode: undefined,
    level_nama: undefined,
  } as Customer,
  nomorSo: "",
  tanggalSo: "",
  jenisOrderKode: "",
  jenisOrderNama: "",
  namaDtf: "",
  top: 0,
  tanggalTempo: "",
  salesCounter: (authStore.user?.kode || "") as string | null,
  keterangan: "",
  diskonPersen1: 0,
  diskonPersen2: 0,
  diskonRp: 0,
  biayaKirim: 0,
  ppnPersen: 0,
  nomorPromo: "",
  namaPromo: "",
  memberHp: "",
  memberNik: "",
  memberNama: "",
  memberAlamat: "",
  memberGender: "",
  memberUsia: "",
  memberReferensi: "",

  // --- FIELD BARU MARKETPLACE ---
  isMarketplace: false,
  mpNama: "SHOPEE",
  mpNomorPesanan: "",
  mpResi: "",
  mpBiayaPlatform: 0,
  dateline: null as string | null,
  isOverdue: false,
  overdueNote: "",

  diskonMapsRp: 0,
  proNomorFreeItem: "" as string,
};

// [BARU] Daftar Marketplace
const marketplaceList = ["SHOPEE", "TIKTOK SHOP"];
const isSaving = ref(false);
const isLeftColumnVisible = ref(true);

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
  // --- TAMBAHAN UNTUK MODAL PEMBAYARAN ---
  diskonNominal1: 0,
  diskonNominal2: 0,
  diskonNominalRp: 0,
});

const dialogs = reactive({
  customerSearch: false,
  soSearch: false,
  sjSearch: false,
  productSearch: false,
  payment: false,
  unpaidDpSearch: false,
  customerForm: false,
  promoSearch: false,
  memberForm: false,
  diskonForm: false,
  linkedDp: false,
  soDtfSearch: false,
  promoBonus: false,
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

const isProductPanelVisible = ref(false);

const activeItemForAuth = ref<Item | null>(null);
const originalDiscount = reactive({
  faktur: { persen1: 0, rp: 0, persen2: 0, biayaKirim: 0 },
  item: { persen: 0, rp: 0 },
});

const authPins = reactive({
  pinDiskon1: "",
  pinDiskon2: "",
  pinItem: {} as Record<string, string>, // Untuk menyimpan pin per item
});

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const activeRowIndex = ref(0);
const isMultiSelectProduct = ref(false);
const jumpToLastPage = () => {
  nextTick(() => {
    const wrapper = document.querySelector(".table-section .v-table__wrapper");
    if (wrapper) {
      wrapper.scrollTop = wrapper.scrollHeight;
    }
  });
};
const salesCounters = ref<SalesCounter[]>([]);
const isSoLoaded = ref(false);
const memberHpToSearch = ref("");
const scannedBarcode = ref("");
const customerDiscountRule = ref<DiscountRule | null>(null);
const activePromoForBonus = ref({ nomor: "", qty: 0 });
const focusedRowId = ref<number | string>(-1);
const isLockedFsk = ref(false);
const isLookupOnly = ref(false);
const customerDebt = ref(0);
const customerLimit = ref(0);
const lastSuggestedPromo = ref("");
const isPromoConfirmVisible = ref(false);
const pendingPromoData = reactive({ nomor: "", nama: "", diskon: 0 });
const pendingReviewProofFile = ref<File | null>(null);
const isCurrentPromoRequiresReview = ref(false);

const pendingPromoRequiresReview = computed(() => {
  const nomors = (pendingPromoData.nomor || "").split(",").map((n) => n.trim());
  return nomors.some((n) => {
    const p = autoPromo.activePromos.value.find((ap) => ap.pro_nomor === n);
    return p?.pro_wajib_review === "Y";
  });
});

const autoPromo = useAutoPromo(header, items, {
  skipIfFromSo: true,
  onNotify: (msg, type) => {
    if (type === "success") toast.success(msg);
    else if (type === "warning") toast.warning(msg);
    else toast.info(msg);
  },
  // [TAMBAH]
  onFakturPromoAvailable: (promo) => {
    if (header.nomorSo) return;
    if (header.isMarketplace) return;
    if (lastSuggestedPromo.value === promo.nomor || lastSuggestedPromo.value === "MANUAL_AUTH")
      return;
    pendingPromoData.nomor = promo.nomor;
    pendingPromoData.nama = promo.nama;
    pendingPromoData.diskon = promo.diskon;
    isPromoConfirmVisible.value = true;
  },
  shouldSkipEvaluate: () => lastSuggestedPromo.value === "MANUAL_AUTH",
});

const promoNotification = computed(() => autoPromo.notification.value);
const potentialPromoDiscount = autoPromo.totalAppliedDiskon;
const isGrandOpeningPromo = ref(false); // tetap ada, untuk styling card
const isPromoMinimized = ref(false); // tetap ada, untuk UI
const activePromosList = autoPromo.activePromos; // alias agar isItemPromoEligible tidak berubah
const isMapsAlreadyInDiskonRp = ref(false);

// --- [BARU] Setup Audio & Refs ---
const audioSuccess = new Audio("/audio/beep_success.mp3");
const audioError = new Audio("/audio/beep_error.mp3");

// Ref untuk input barcode agar bisa auto-focus
const barcodeInputRef = ref<HTMLInputElement | null>(null);
const isScanning = ref(false); // State untuk loading scan

// [BARU] State Hadiah Gratis Grand Opening K12
const freeGiftQuota = reactive({
  available: false,
  sisaKuota: 0,
  reason: null as string | null,
});
const isFreeGiftScanDialogOpen = ref(false);
const freeGiftScanBarcode = ref("");
const isFreeGiftScanning = ref(false);
const freeGiftScanInputRef = ref<HTMLInputElement | null>(null);

// --- Konfigurasi Tabel ---
const tableHeaders = [
  { title: "Kode Barang", key: "kode", width: "120px" },
  { title: "Nama Barang", key: "nama", minWidth: "250px" }, // ubah ke minWidth
  { title: "Kategori", key: "kategori", width: "90px" },
  { title: "Ukuran", key: "ukuran", width: "50px" },
  { title: "Stok Fisik", key: "stok", align: "end", width: "80px" },
  { title: "Stok Pesan", key: "stokPesanan", align: "end", width: "80px" },
  { title: "Qty SO", key: "qtyso", align: "end", width: "60px" },
  { title: "Jumlah", key: "jumlah", align: "end", width: "70px" },
  { title: "Harga", key: "harga", align: "end", width: "80px" },
  { title: "Disc %", key: "diskonPersen", align: "end", width: "70px" },
  { title: "Diskon Rp", key: "diskonRp", align: "end", width: "80px" },
  { title: "Total", key: "total", align: "end", width: "90px" },
  { title: "Barcode", key: "barcode", width: "90px" },
  { title: "SO DTF", key: "noSoDtf", width: "120px" },
  { title: "Promo", key: "terhitungPromo", align: "center", width: "70px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
] as const;
// const linkedDpsHeaders = [
//     { title: 'Nomor Setoran', key: 'nomor' },
//     { title: 'Jenis', key: 'jenis' },
//     { title: 'Nominal', key: 'nominal', align: 'end' },
//     { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
// ];

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
    const newItem: Item = {
      id: Date.now(),
      kode: "", // tambahkan properti wajib
      nama: "",
      ukuran: "",
      stok: 0,
      qtyso: 0,
      jumlah: 0,
      harga: 0,
      diskonPersen: 0,
      diskonRp: 0,
      total: 0,
      barcode: "",
      hpp: 0,
      noSoDtf: "",
      kategori: "",
      terhitungPromo: false,
      _isHargaEditable: true,
      isCustomOrder: false,
      promoQty: 0,
    };
    items.value.push(newItem);
  }
};

const onDiskonSaved = (data: {
  diskonPersen1: number;
  diskonPersen2: number;
  diskonRp: number;
  biayaKirim: number;
  biayaPlatform: number;
  mode?: string;
}) => {
  if (header.gudang.kode === "K04") {
    header.diskonPersen1 = data.diskonPersen1;
    header.diskonPersen2 = data.diskonPersen2;
    header.diskonRp = data.diskonRp;
    header.biayaKirim = data.biayaKirim;
    header.mpBiayaPlatform = data.biayaPlatform;

    calculateTotals();
    toast.success("Diskon & Biaya K04 berhasil diterapkan.");
    return;
  }

  const newDiskonPersen1 = Number(data.diskonPersen1 || 0);
  const newDiskonPersen2 = Number(data.diskonPersen2 || 0);
  const newDiskonRp = Number(data.diskonRp || 0);

  const isDiscountChanged =
    newDiskonPersen1 !== header.diskonPersen1 ||
    newDiskonPersen2 !== header.diskonPersen2 ||
    newDiskonRp !== header.diskonRp;

  // Fungsi Helper: Terapkan perubahan ke state Header
  const applyChanges = (authData?: { authNomor: string; approver: string }) => {
    header.diskonPersen1 = newDiskonPersen1;
    header.diskonRp = newDiskonRp;
    header.biayaKirim = Number(data.biayaKirim || 0);
    header.mpBiayaPlatform = Number(data.biayaPlatform || 0);

    // Tangani Maps lewat composable
    const mapsSekarang = autoPromo.isMapsApplied.value;
    const mapsBaru = newDiskonPersen2 === 5;

    if (mapsBaru !== mapsSekarang) {
      autoPromo.toggleMaps(); // composable yang urus string nomorPromo
    }

    if (authData) {
      console.log("Otorisasi Diskon ID:", authData.authNomor);
    }

    calculateTotals();
    toast.success("Data biaya & diskon diperbarui.");

    if (header.diskonRp > 0 || header.diskonPersen1 > 0) {
      lastSuggestedPromo.value = "MANUAL_AUTH";
    }
  };

  // 3. Logika Percabangan Otorisasi
  if (isDiscountChanged) {
    // Cek apakah menghapus diskon (0)
    const isClearing = newDiskonPersen1 === 0 && newDiskonPersen2 === 0 && newDiskonRp === 0;
    // Deteksi Bypass: Apakah yang berubah HANYA klik tombol Promo Maps (DiskonPersen2) saja?
    const isOnlyMapsChanged =
      newDiskonPersen1 === header.diskonPersen1 &&
      newDiskonRp === header.diskonRp &&
      (newDiskonPersen2 === 5 || newDiskonPersen2 === 0);

    // Jika menghapus diskon ATAU hanya klik promo maps, tidak perlu minta PIN manajer!
    if (isClearing || isOnlyMapsChanged) {
      applyChanges();
      return;
    }

    // Hitung nominal total untuk pengajuan otorisasi
    const base = totals.subTotal;
    const d1 = (newDiskonPersen1 / 100) * base;
    const d2 = (newDiskonPersen2 / 100) * (base - d1);
    const nominalAuth = Math.round(d1 + d2 + newDiskonRp);

    // Susun Info Lengkap untuk HP Manajer
    const infoDiskon =
      `Cust: ${header.customer.nama || "Umum"}\n` +
      `P1 (Member): ${newDiskonPersen1}%\n` +
      `P2 (Maps): ${newDiskonPersen2}%\n` +
      `Rp: ${formatRupiah(newDiskonRp)}`;

    requestAuthorization(
      "Otorisasi Diskon Faktur",
      "DISKON_FAKTUR",
      nominalAuth,
      {
        transaksi: header.nomor || "DRAFT INVOICE",
        keteranganLengkap: infoDiskon,
        barcode: "",
      },
      (authResult) => {
        applyChanges(authResult);
      },
      () => {
        toast.info("Perubahan diskon faktur dibatalkan.");
      }
    );
  } else {
    // Jika hanya ongkir/biaya platform yang berubah
    applyChanges();
  }
};

const handleItemDiscountChange = (item: Item) => {
  nextTick(() => {
    const originalRp = item.originalDiskonRp || 0;
    const originalPersen = item.originalDiskonPersen || 0;

    // === [PERBAIKAN] Sinkronisasi Satu Arah ===
    // 1. Jika User mengedit Persen dan nilainya berubah, pastikan Rp jadi 0
    if (item.diskonPersen !== originalPersen) {
      item.diskonRp = 0;
    }
    // 2. Sebaliknya, Jika User mengedit Rupiah dan nilainya berubah, pastikan Persen jadi 0
    else if (item.diskonRp !== originalRp) {
      item.diskonPersen = 0;
    }

    const currentRp = item.diskonRp || 0;
    const currentPersen = item.diskonPersen || 0;

    // Hanya minta otorisasi jika nilai berubah dari original
    if (currentRp !== originalRp || currentPersen !== originalPersen) {
      const isClearingItemDiscount = currentRp === 0 && currentPersen === 0;

      if (isClearingItemDiscount || header.gudang.kode === "K04") {
        item.originalDiskonRp = 0;
        item.originalDiskonPersen = 0;
        item.total = computeLineTotal(item);
        calculateTotals();
        return;
      }

      // Hitung Nominal Auth (Sesuai per item x qty)
      let diskonPerUnit = 0;
      if (currentRp > 0) {
        diskonPerUnit = currentRp;
      } else {
        diskonPerUnit = ((item.harga || 0) * currentPersen) / 100;
      }
      const totalNominalAuth = diskonPerUnit * (item.jumlah || 1);

      activeItemForAuth.value = item;
      const custName = header.customer.nama || "Umum";
      const itemName = item.nama || "Unknown Item";
      const infoLengkap = `Cust: ${custName}\nItem: ${itemName}`;

      requestAuthorization(
        `Otorisasi Diskon Item`,
        "DISKON_ITEM",
        totalNominalAuth,
        {
          barcode: item.barcode,
          transaksi: header.nomor ? header.nomor : "DRAFT INVOICE",
          keteranganLengkap: infoLengkap,
        },
        (authResult) => {
          // --- SUKSES ---
          if (activeItemForAuth.value) {
            const currentItem = activeItemForAuth.value;
            // [FIX] Update original dengan nilai yg baru diedit
            currentItem.originalDiskonRp = currentItem.diskonRp;
            currentItem.originalDiskonPersen = currentItem.diskonPersen;
            currentItem.lastPin = authResult.approver;
            currentItem.total = computeLineTotal(currentItem);
          }
          lastSuggestedPromo.value = "MANUAL_AUTH";
          toast.success("Otorisasi diskon item disetujui.");
          calculateTotals();
          activeItemForAuth.value = null;
        },
        () => {
          // --- BATAL ---
          if (activeItemForAuth.value) {
            activeItemForAuth.value.diskonRp = originalDiscount.item.rp;
            activeItemForAuth.value.diskonPersen = originalDiscount.item.persen;
            activeItemForAuth.value.total = computeLineTotal(activeItemForAuth.value);
          }
          toast.info("Perubahan diskon dibatalkan.");
          calculateTotals();
          activeItemForAuth.value = null;
        }
      );
    } else {
      item.total = computeLineTotal(item);
      calculateTotals();
    }
  });
};

const onItemDiscountFocus = (item: Item) => {
  activeItemForAuth.value = item;
  originalDiscount.item = { persen: item.diskonPersen || 0, rp: item.diskonRp || 0 };
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
    // Mapping keteranganLengkap ke state keterangan dialog
    authDialog.keterangan = extraData.keteranganLengkap || "";
  } else {
    authDialog.transaksi = "";
    authDialog.barcode = "";
    authDialog.keterangan = "";
  }

  // [FIX] Wrapper untuk menutup modal sebelum menjalankan callback sukses
  // Ini mencegah modal "muter-muter" setelah Approved di HP
  authDialog.onSuccess = (data) => {
    authDialog.show = false;
    onSuccess(data);
  };

  authDialog.onCancel = onCancel;
  authDialog.show = true;
};

const fetchSalesCounters = async () => {
  try {
    const response = await api.get("/invoice-form/lookup/sales-counters");
    salesCounters.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat daftar Sales Counter.");
  }
};

const fetchMpPackaging = async () => {
  isLoadingMpPackaging.value = true;
  try {
    const res = await api.get("/invoice-form/lookup/packaging-options");
    mpPackagingList.value = res.data.map((p: Omit<MpPackagingItem, "qty" | "checked">) => ({
      ...p,
      qty: 0,
      checked: false,
    }));
  } catch {
    toast.error("Gagal memuat opsi packaging.");
  } finally {
    isLoadingMpPackaging.value = false;
  }
};

const onMpPackagingQtyChange = (item: MpPackagingItem) => {
  if (item.qty > 0) item.checked = true;
  if (item.qty <= 0) {
    item.qty = 0;
    item.checked = false;
  }
};

const removeRow = (itemToDelete: Item) => {
  const wasFreeGift = itemToDelete.isFreeGift;
  items.value = items.value.filter((item) => item.id !== itemToDelete.id);
  if (items.value.length === 0) {
    addNewRow();
  }
  // [BARU] Kalau item gratis dihapus, izinkan scan ulang & lepas kunci header
  if (wasFreeGift) {
    header.proNomorFreeItem = "";
    checkFreeGiftQuota();
  }
};

// Fungsi untuk menghapus semua item dari SO DTF tertentu
const removeSoDtfItems = (itemWithSoDtf: Item) => {
  const soDtfNumber = itemWithSoDtf.noSoDtf;
  if (!soDtfNumber) return;
  items.value = items.value.filter((item) => item.noSoDtf !== soDtfNumber);
  if (items.value.length === 0) {
    addNewRow();
  }
};

const handleDeleteItem = (item: Item) => {
  if (item.noSoDtf) {
    showConfirmation(
      "Konfirmasi Hapus SO DTF",
      `Anda yakin ingin menghapus semua item dari SO DTF No: ${item.noSoDtf}?`,
      () => removeSoDtfItems(item)
    );
  } else if (item.kode) {
    showConfirmation(
      "Konfirmasi Hapus Item",
      `Anda yakin ingin menghapus item: ${item.nama}?`,
      () => removeRow(item)
    );
  }
};

const handleClose = () => {
  // Tombol Tutup memicu konfirmasi manual,
  // Jika user klik Ya, paksa reset status agar guard global tidak mencegat lagi
  showConfirmation(
    "Tutup Form",
    "Data yang belum disimpan akan hilang. Yakin ingin menutup form?",
    () => {
      markAsSaved(); // Reset status
      router.back();
    }
  );
};

// F1 global / tombol kaca pembesar:
// - Kalau promo "Beli 3 = 100rb" (PRO-2025-005) SEDANG AKTIF, tombol ini
//   harus tetap bisa MENAMBAHKAN barang (harga promo dipaksa di
//   onProductsSelected) — jadi tetap pakai ProductSearchModal lama, mode
//   multi, isLookupOnly dimatikan.
// - Selain itu, tombol ini murni untuk CEK STOK Store+DC — buka Side Panel.
const openLookup = () => {
  if (!header.customer.kode) return toast.error("Pilih customer terlebih dahulu.");

  if (header.nomorPromo === "PRO-2025-005") {
    activeRowIndex.value = items.value.length - 1;
    isMultiSelectProduct.value = true;
    isLookupOnly.value = false;
    dialogs.productSearch = true;
    return;
  }

  isProductPanelVisible.value = true;
};

// Event "Tambah" dari panel sengaja diabaikan di Invoice — panel ini murni
// untuk lihat stok, bukan jalur tambah barang. Info balik ke SC supaya
// tidak bingung kenapa barang tidak muncul di tabel.
const onPanelProductsAdded = () => {
  toast.info(
    "Panel ini hanya untuk melihat stok. Silakan scan barcode barang untuk menambahkannya ke Invoice."
  );
  nextTick(() => {
    barcodeInputRef.value?.focus();
  });
};

const openProductSearch = (index: number, isMulti: boolean) => {
  if (!header.customer.kode) return toast.error("Pilih customer terlebih dahulu.");
  if (header.nomorSo)
    return toast.info("Tidak bisa menambah item manual jika sudah terhubung ke SO.");

  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;

  // LOGIKA PENGECEALIAN:
  // Sama dengan di atas, izinkan input jika promo PRO-2025-005 aktif
  if (header.nomorPromo === "PRO-2025-005") {
    isLookupOnly.value = false;
  } else {
    isLookupOnly.value = !canSearchManual.value;
  }

  dialogs.productSearch = true;
};

const openSoDtfSearch = (item: Item, index: number) => {
  // 1. Validasi Cabang KPR
  if (!isKpr.value) return;

  // 2. Validasi Customer wajib ada
  if (!header.customer.kode) {
    return toast.error("Pilih customer terlebih dahulu.");
  }

  // [PENTING] Untuk KPR, kita abaikan pengecekan !!header.nomorSo
  // karena nomor tersebut adalah nomor SJ yang memang menjadi dasar transaksi mereka.

  activeRowIndex.value = index;
  dialogs.soDtfSearch = true;
};

const onCustomerSelected = async (cust: Customer | null) => {
  if (cust) {
    // PERBAIKAN: Gabungkan level_kode dan level_nama secara manual
    const levelText = cust.level_kode ? `${cust.level_kode} - ${cust.level_nama}` : "";

    header.customer = {
      kode: cust.kode,
      nama: cust.nama,
      alamat: cust.alamat,
      kota: cust.kota,
      telp: cust.telp,
      level: levelText,
    };

    // Ambil limit dari data customer (sudah dikirim backend)
    customerLimit.value = cust.limitTrans || 0;

    // AMBIL SISA PIUTANG BERJALAN DARI BACKEND
    try {
      const response = await api.get(`/invoice-form/lookup/customer-debt/${cust.kode}`);
      customerDebt.value = response.data.totalDebt || 0;

      // Jika ternyata limitTrans di search kosong tapi di debt-lookup ada, bisa di-assign di sini
      if (response.data.limitTrans) customerLimit.value = response.data.limitTrans;
    } catch (error) {
      console.error("Gagal mengambil data hutang customer", error);
      customerDebt.value = 0;
    }

    // PERBAIKAN: Panggil fungsi update member setelah customer dipilih
    updateMemberInfo(header.customer);

    // Ambil aturan diskon untuk customer yang baru dipilih
    try {
      const response = await api.get(`/invoice-form/lookup/discount-rule/${cust.kode}`);
      customerDiscountRule.value = response.data;
    } catch (error: unknown) {
      console.error(error);
      customerDiscountRule.value = null;
    }
  } else {
    // Kosongkan field jika tidak ada customer
    header.customer = { kode: "", nama: "", alamat: "", kota: "", telp: "", level: "" };
    customerDebt.value = 0;
    customerLimit.value = 0;
    updateMemberInfo(null);
  }

  if (customerDiscountRule.value && items.value.some((i) => i.kode)) {
    await nextTick();
    applyDefaultDiscount(); // pasang diskon default reseller
    calculateTotals(); // hitung ulang total
  }
  await applyCustomerPricingRules();

  dialogs.customerSearch = false;
  await checkFreeGiftQuota();
};

const applyDefaultDiscount = () => {
  if (authStore.user?.cabang === "KDC") {
    header.diskonPersen1 = 0;
    header.diskonRp = 0;
    return;
  }

  // 2. [KUNCI PERBAIKAN]
  // Jika sudah ada Promo Bulanan (nomorPromo) ATAU user sudah input Diskon Rp manual (> 0),
  // maka diskon member (P1) HARUS 0. Jangan biarkan watcher mengisinya lagi.
  if (header.nomorPromo || header.diskonRp > 0) {
    header.diskonPersen1 = 0;
    return;
  }

  if (isKpr.value) {
    header.diskonPersen1 = 0;
    return;
  }
  // [BARU] 1. Pengecekan Customer RETAIL / RETAILER
  // Pastikan ambil nama customer dengan aman (optional chaining)
  const custNama = header.customer?.nama?.toUpperCase() || "";

  // Jika customer RETAIL, paksa diskon 0 dan STOP.
  if (custNama.includes("RETAIL")) {
    header.diskonPersen1 = 0;
    return;
  }

  // --- Logika Lama ---
  const rule = customerDiscountRule.value;

  // Jangan terapkan jika tidak ada rule level atau jika data berasal dari SO (tarikan SO)
  if (!rule || header.nomorSo) {
    return;
  }

  // Logika dari Delphi: cek nominal belanja vs Rule Level
  if (totals.nettoSetelahDiskon >= rule.nominal1) {
    header.diskonPersen1 = rule.diskon1;
  } else if (totals.nettoSetelahDiskon >= rule.nominal2) {
    header.diskonPersen1 = rule.diskon2;
  } else {
    header.diskonPersen1 = 0;
  }
};

const onNewCustomerSaved = (customer: Customer) => {
  // bentuk tampilan (UI)
  const levelText = customer.level_kode ? `${customer.level_kode} - ${customer.level_nama}` : "";

  header.customer = {
    kode: customer.kode,
    nama: customer.nama,
    alamat: customer.alamat,
    kota: customer.kota,
    telp: customer.telp,

    // tampil di UI
    level: levelText,

    // data backend
    level_kode: customer.level_kode || undefined,
    level_nama: customer.level_nama || undefined,
  };

  dialogs.customerForm = false;
  checkFreeGiftQuota();
};

const onMemberSaved = (data: Member) => {
  // 1. Cek apakah customer adalah Karyawan Kencana Print
  const isKaryawanPrint = header.customer.kode === "K-00079";

  if (isKaryawanPrint) {
    header.memberNik = data.nik || "";
    // [FIX] Simpan NIK ke dalam memberHp agar terpetakan ke inv_mem_hp di database
    header.memberHp = data.nik || "";
  } else {
    header.memberNik = "";
    header.memberHp = data.hp; // Untuk customer reguler, tetap simpan No. HP
  }

  // 2. Mapping data member lainnya tetap sama
  header.memberNama = data.nama;
  header.memberAlamat = data.alamat;
  header.memberGender = data.gender;
  header.memberUsia = data.usia;
  header.memberReferensi = data.referensi;

  dialogs.memberForm = false;
  toast.info(
    isKaryawanPrint ? "Data karyawan berhasil diperbarui." : "Data member berhasil diperbarui."
  );
};

const onPromoSelected = (promo: { nomor: string; namaPromo: string }) => {
  // Cek apakah promo berubah dan item sudah ada
  if (promo.nomor === "PRO-2025-005" && items.value.some((i) => i.kode)) {
    // Tampilkan konfirmasi
    showConfirmation(
      "Terapkan Promo?",
      "Menerapkan promo ini akan menghapus semua barang di keranjang. Lanjutkan?",
      () => {
        // User klik "Ya"
        header.nomorPromo = promo.nomor;
        header.namaPromo = promo.namaPromo;
        items.value = []; // Kosongkan grid
        addNewRow(); // Tambah baris kosong baru
        dialogs.promoSearch = false;
      }
    );
    // Saat 'showConfirmation' dipanggil, 'dialogConfirm.onConfirm' akan di-set
    // Kita juga perlu menangani 'Batal'
    dialogConfirm.onConfirm = () => {
      header.nomorPromo = promo.nomor;
      header.namaPromo = promo.namaPromo;
      items.value = [];
      addNewRow();
      dialogs.promoSearch = false;
      dialogConfirm.show = false; // Tutup dialog
    };

    // Jika user menutup/membatalkan dialog
    const unwatch = watch(
      () => dialogConfirm.show,
      (newValue) => {
        if (!newValue) {
          unwatch();
        }
      }
    );
  } else {
    // Jika grid kosong atau promo lain, langsung set
    header.nomorPromo = promo.nomor;
    header.namaPromo = promo.namaPromo;
    dialogs.promoSearch = false;
  }
};

function resolveUkuran(item: SoItem): string {
  // 1. Dari SO-DTF
  if (item.ukuran_dtf) return item.ukuran_dtf;

  // 2. Jika item custom JSON
  if (item.custom_json) {
    try {
      const parsed = JSON.parse(item.custom_json);
      if (Array.isArray(parsed.ukuranKaos) && parsed.ukuranKaos.length > 0) {
        return parsed.ukuranKaos[0].ukuran || "";
      }
    } catch {
      /* ignored */
    }
  }

  // 3. fallback
  return item.ukuran_asli || "";
}

const onSoSelected = async (so: { Nomor: string }) => {
  dialogs.soSearch = false;
  if (!so.Nomor) return;

  if (header.nomorSo && header.nomorSo !== so.Nomor) {
    const confirmed = await new Promise((resolve) => {
      showConfirmation(
        "Ganti SO?",
        `Mengganti SO dari ${header.nomorSo} ke ${so.Nomor} akan menghapus semua item. Lanjutkan?`,
        () => resolve(true)
      );

      // Watch untuk deteksi jika user klik Batal
      const unwatch = watch(
        () => dialogConfirm.show,
        (newValue) => {
          if (!newValue) {
            unwatch();
            resolve(false);
          }
        }
      );

      dialogConfirm.onConfirm = () => {
        resolve(true);
        unwatch();
      };
    });

    if (!confirmed) return; // User klik Batal
  }

  isLoading.value = true;
  try {
    const response = await api.get(`/invoice-form/lookup/so-details/${so.Nomor}`);

    const { header: soHeader, items: soItems, dps } = response.data;

    // Reset items terlebih dahulu
    items.value = [];

    // --- Assign header dari SO ---
    Object.assign(header, {
      ...soHeader,
      tanggal: format(new Date(), "yyyy-MM-dd"),
      // Pastikan field baru masuk ke state reactive
      dateline: soHeader.dateline || null,
      isOverdue: !!soHeader.isOverdue,
      overdueNote: soHeader.overdueNote || "",
      diskonRp: Number(soHeader.diskonBaseRp ?? soHeader.diskonRp ?? 0), // base saja
      diskonMapsRp: Number(soHeader.diskonMapsRp || 0),
      diskonPersen1: Number(soHeader.so_disc1 || soHeader.diskonPersen1 || 0),
      diskonPersen2: Number(soHeader.so_disc2 || soHeader.diskonPersen2 || 0),

      nomorPromo: soHeader.so_pro_nomor || soHeader.nomorPromo || "",
      namaPromo:
        soHeader.so_pro_nama ||
        soHeader.namaPromo ||
        (soHeader.so_pro_nomor ? "Diskon Promo Bulanan" : ""),
    });

    // =====================================================================
    // [FIX] Cegah Maps terhitung dobel dari SO ke Invoice
    // Jika SO sudah menyimpan diskonRp yang inklusif Maps,
    // maka di Invoice cukup pakai diskonRp apa adanya, tanpa aktifkan P2 lagi.
    // =====================================================================
    const soNomorPromo: string = soHeader.so_pro_nomor || soHeader.nomorPromo || "";
    const soMapsAktif = soNomorPromo.includes("PRO-2026-003");
    if (soMapsAktif) {
      isMapsAlreadyInDiskonRp.value = true;
    } else {
      isMapsAlreadyInDiskonRp.value = false;
    }

    header.dateline = soHeader.dateline || null;

    if (soHeader.isOverdue) {
      toast.warning(
        soHeader.overdueNote || "Peringatan: SO ini sudah melewati batas waktu (Dateline)!"
      );
    }

    // *** Perbaikan bagian jenis order ***
    header.jenisOrderKode = soHeader.jenisOrderKode || "";
    header.jenisOrderNama = soHeader.jenisOrderNama || ""; // <-- TAMBAHKAN INI
    header.namaDtf = soHeader.namaDtf || "";

    // [FIX] Gunakan soHeader, bukan headerRows[0]
    // Pastikan backend mengirim field ini di object 'header'
    header.mpNomorPesanan = soHeader.mpNomorPesanan || soHeader.so_mp_nomor_pesanan || "";
    header.mpResi = soHeader.mpResi || soHeader.so_mp_resi || "";

    // Cek flag marketplace. Backend mungkin mengirim boolean atau string 'Y'
    header.isMarketplace =
      soHeader.isMarketplace === true ||
      soHeader.isMarketplace === "Y" ||
      soHeader.so_is_marketplace === "Y";

    // --- Tanggal SO ---
    if (soHeader.tanggal) {
      const date = new Date(soHeader.tanggal);
      header.tanggalSo = date.toISOString().split("T")[0];
    } else {
      header.tanggalSo = "";
    }

    // --- Tanggal Tempo ---
    if (soHeader.tanggalTempo) {
      const date = new Date(soHeader.tanggalTempo);
      header.tanggalTempo = date.toISOString().split("T")[0];
    } else {
      header.tanggalTempo = "";
    }

    memberHpToSearch.value = soHeader.customer.telp || "";
    header.memberHp = soHeader.customer.telp || "";

    // Map items dengan memastikan semua field yang diperlukan ada
    items.value = soItems.map((item: SoItem, index: number) => {
      const ukuranFinal = resolveUkuran(item);

      return {
        id: Date.now() + index,
        kode: item.kode ?? "",
        nama: item.nama ?? "",
        ukuran: ukuranFinal, // 🔥 FIX UTAMA
        stok: Number(item.stokFisik || 0), // Masuk ke kolom Stok Fisik
        stokPesanan: Number(item.stokPesanan || 0), // Masuk ke kolom Stok Pesan
        qtyso: item.qtyso ?? 0,
        jumlah: item.qtyso ?? 0,
        harga: item.harga ?? 0,
        diskonPersen: item.diskonPersen ?? 0,
        diskonRp: item.diskonRp ?? 0,
        total: item.total ?? 0,
        barcode: item.barcode ?? "",
        hpp: item.hpp ?? 0,
        kategori: item.kategori ?? "",
        noSoDtf: item.noSoDtf ?? "",
        noPengajuanHarga: item.noPengajuanHarga ?? "",
        terhitungPromo: item.terhitungPromo ?? false,
        _isHargaEditable: item._isHargaEditable ?? true,
        promo: item.promo ?? "",
        originalDiskonRp: item.originalDiskonRp ?? 0,
        originalDiskonPersen: item.originalDiskonPersen ?? 0,
        subtotal: (item.qtyso ?? 0) * (item.harga ?? 0),
        lastPin: item.lastPin ?? "",
        fromBackend: true,
      };
    });

    items.value = sortItemsBySize(items.value);

    linkedDps.value = dps;
    isSoLoaded.value = true;

    // Force reactivity update
    await nextTick();
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    console.error("Error loading SO details:", axiosError);
    toast.error(axiosError.response?.data?.message || "Gagal memuat data SO.");
  } finally {
    isLoading.value = false;
  }
};

const onSjSelected = async (sj: { NoSJ: string }) => {
  dialogs.sjSearch = false;
  if (!sj.NoSJ) return;

  isLoading.value = true;
  try {
    // Memanggil endpoint detail SJ dengan parameter cabang user
    const response = await api.get(`/invoice-form/lookup/sj-details/${sj.NoSJ}`, {
      params: {
        cabang: authStore.user?.cabang,
        currentInv: header.nomor || "", // Kirim nomor invoice aktif agar tidak mengurangi stok sendiri
      },
    });

    // Destructuring data dengan fallback untuk mencegah error undefined
    const sjHeader = response.data.header || {};
    const sjItems = response.data.items || [];
    const dps = response.data.dps || [];

    // Validasi: SJ harus sudah diterima di sistem KPR
    if (!sjHeader.sj_noterima || sjHeader.sj_noterima === "") {
      toast.error("SJ tersebut belum diterima. Silakan proses penerimaan SJ terlebih dahulu.");
      isLoading.value = false;
      return;
    }

    // Reset items sebelum mengisi data baru dari SJ
    items.value = [];

    // Map Header (Mengikuti standar logic Delphi untuk KPR)
    Object.assign(header, {
      nomorSo: sjHeader.sj_nomor,
      tanggalSo: sjHeader.sj_tanggal ? format(parseISO(sjHeader.sj_tanggal), "yyyy-MM-dd") : "",
      // [FIX] Kalau SJ tidak bawa data customer, JANGAN reset — pertahankan pilihan user
      customer: sjHeader.mt_cus
        ? {
            kode: sjHeader.mt_cus,
            nama: sjHeader.customer,
            alamat: sjHeader.alamat,
            kota: sjHeader.kota,
            telp: sjHeader.telp,
            level: `${sjHeader.nlevel || ""} - ${sjHeader.clevel || ""}`,
          }
        : header.customer,
      top: sjHeader.top || 0,
      ppnPersen: sjHeader.ppn || 0,
      diskonPersen1: sjHeader.noso ? sjHeader.so_disc1 : 15,
      diskonRp: sjHeader.so_disc || 0,
      salesCounter: sjHeader.sc || authStore.user?.kode,
    });

    // Map Items dari detail SJ ke grid Invoice
    items.value = sjItems.map(
      (item: SjApiItem, index: number): Item => ({
        id: Date.now() + index,
        kode: item.kode,

        // [FIX] Sesuaikan dengan alias baru dari backend
        nama: item.nama_barang || item.nama || "",
        ukuran: item.ukuran,
        kategori: item.kategori || "",
        stok: Number(item.stok || 0),

        // [FIX] Ambil dari item.jumlah
        qtyso: Number(item.jumlah || item.sjd_jumlah || 0),
        jumlah: Number(item.jumlah || item.sjd_jumlah || 0),

        // [FIX] Ambil dari item.harga
        harga: Number(item.harga || item.harga_so || item.brgd_harga || 0),
        hpp: Number(item.hpp || item.brgd_hpp || 0),

        diskonPersen: Number(item.disc || 0),
        diskonRp: Number(item.diskon || 0),
        total: 0,
        barcode: item.barcode || "",
        terhitungPromo: false,
        _isHargaEditable: true,
        fromBackend: true,
      })
    );

    items.value = sortItemsBySize(items.value);

    // [FIX] Memastikan linkedDps selalu berupa array untuk fungsi .reduce()
    linkedDps.value = Array.isArray(dps) ? dps : [];
    isSoLoaded.value = true;

    applyDefaultDiscount();

    await nextTick();
    calculateTotals();

    // --- [OTOMATISASI] Sinkronkan info member/poin berdasarkan customer SJ ---
    updateMemberInfo(header.customer);
    await applyCustomerPricingRules();
  } catch (error: unknown) {
    // Menggunakan AxiosError untuk menangkap pesan error dari backend secara aman
    const err = error as AxiosError<{ message?: string }>;
    console.error("Gagal load SJ:", err);
    toast.error(err.response?.data?.message || "Gagal memuat data SJ.");
  } finally {
    isLoading.value = false;
  }
};

const onProductsSelected = (selectedProducts: ProductInput[]) => {
  dialogs.productSearch = false;
  // Jika flag isLookupOnly aktif, tampilkan pesan dan BERHENTI (jangan masukkan ke tabel)
  if (isLookupOnly.value) {
    isLookupOnly.value = false; // reset flag
    toast.info(
      "Mode Lihat Stok: Data tidak dimasukkan ke tabel. Gunakan Scan Barcode untuk transaksi."
    );

    nextTick(() => {
      barcodeInputRef.value?.focus();
    });
    return;
  }
  if (!selectedProducts || selectedProducts.length === 0) return;

  const isPromoActive = header.nomorPromo === "PRO-2025-005";
  const promoPrice = 33333;

  // Ambil Level Customer (String)
  const currentLevel = String(header.customer.level_kode || "1").trim();
  const isKdcUser = authStore.user?.cabang === "KDC";

  const newItems: Item[] = selectedProducts.map((product) => {
    // Default: Selalu gunakan 'harga' (yang isinya brgd_harga atau 33333)
    let basePrice = Number(product.harga || 0);

    // PENGECUALIAN KHUSUS LEVEL 5
    if (currentLevel === "5" && !isKdcUser) {
      basePrice = Number(product.harga3 || 0);
    }
    // Level lain (1, 2, 3, 4) -> Tetap pakai basePrice (brgd_harga)

    const finalPrice = isPromoActive ? promoPrice : basePrice;

    // Pastikan editable jika bukan promo
    // Jika finalPrice 0, user WAJIB isi manual, jadi harus editable
    const isEditable = !isPromoActive;

    return {
      id: Date.now() + Math.random(),
      kode: product.kode,
      nama: product.nama,
      ukuran: product.ukuran,
      stok: Number(product.stokFisik || 0), // Stok Fisik
      stokPesanan: Number(product.stokPesanan || 0), // Stok Pesanan

      harga: finalPrice,
      jumlah: 1,
      diskonPersen: 0,
      diskonRp: 0,

      total: finalPrice,

      barcode: product.barcode,
      qtyso: 0,
      noSoDtf: "",
      kategori: product.kategori || "",

      terhitungPromo: isPromoActive,
      _isHargaEditable: isEditable,

      hpp: 0,
    };
  });

  if (items.value[activeRowIndex.value] && !items.value[activeRowIndex.value].kode) {
    items.value.splice(activeRowIndex.value, 1, ...newItems);
  } else {
    items.value.push(...newItems);
  }

  addNewRow();
  calculateTotals();
  jumpToLastPage();

  audioSuccess.play().catch(() => {});
};

const onUnpaidDpSelected = (dp: DownPayment) => {
  dialogs.unpaidDpSearch = false;

  if (!linkedDps.value.some((d) => d.nomor === dp.nomor)) {
    linkedDps.value.push(dp);
  } else {
    toast.warning("DP tersebut sudah ditambahkan.");
  }
};

const onSoDtfSelected = async (soDtf: { nomor: string }) => {
  dialogs.soDtfSearch = false;
  if (!soDtf.nomor) return;

  try {
    const response = await api.get(`/invoice-form/lookup/so-dtf-details/${soDtf.nomor}`);
    const soDtfItems = response.data;

    if (soDtfItems.length === 0) {
      return toast.warning("SO DTF ini tidak memiliki detail item.");
    }

    const newItems = soDtfItems.map((item: SoDtfItem) => ({
      id: Date.now() + Math.random(),
      kode: item.kode,
      nama: item.nama,
      ukuran: item.ukuran,
      jumlah: item.jumlah,
      harga: item.harga,
      stok: item.stok || 0,
      qtyso: item.jumlah,
      diskonPersen: 0,
      diskonRp: 0,
      total: item.jumlah * item.harga,
      noSoDtf: soDtf.nomor,
      terhitungPromo: false,
      _isHargaEditable: true,
      kategori: "SO-DTF",
      fromBackend: true,
    }));

    // [PERBAIKAN LOGIKA]
    // Cek apakah baris tempat kursor berada sekarang kosong (tidak ada kode)
    const currentRow = items.value[activeRowIndex.value];

    if (currentRow && !currentRow.kode) {
      // Jika baris kosong, ganti baris kosong tersebut dengan item DTF (splice 1)
      items.value.splice(activeRowIndex.value, 1, ...newItems);
    } else {
      // Jika baris sudah ada isinya (Barang dari SJ),
      // masukan item DTF ke posisi setelahnya tanpa menghapus (splice 0)
      // Atau bisa langsung dipush ke paling bawah:
      items.value.push(...newItems);
    }

    addNewRow(); // Tambah baris kosong baru di akhir
    calculateTotals(); // Hitung ulang grand total
    jumpToLastPage();
    toast.success(`Berhasil menambahkan ${newItems.length} item dari SO DTF.`);
  } catch (error) {
    console.error(error);
    toast.error("Gagal memuat detail SO DTF.");
  }
};

const calculateTotals = () => {
  // ---------------------------------------------------------------------
  // [REVISI] 1 & 2: HITUNG BERSIH DARI ITEM DULU (BOTTOM-UP)
  // Agar support Diskon Persen maupun Rupiah dengan akurat
  // ---------------------------------------------------------------------
  let grossSubTotal = 0; // Total Kotor (Harga x Jumlah)
  let netItemTotal = 0; // Total Bersih (item.total)
  let basisDiskonFaktur = 0;

  // Loop sekali untuk update total per baris & akumulasi
  items.value.forEach((item) => {
    // a. Pastikan item.total terupdate logic terbaru
    item.total = computeLineTotal(item);

    // b. Akumulasi
    grossSubTotal += (item.jumlah || 0) * (item.harga || 0);
    netItemTotal += item.total;

    // [KUNCI PERBAIKAN]: Kecualikan Jasa Murni dan Pengajuan Harga dari basis diskon
    // agar Invoice Baru konsisten dengan SO
    const kodeUp = (item.kode || "").toUpperCase();
    const namaUp = (item.nama || "").toUpperCase();
    const isJasaMurni =
      item.isJasa ||
      kodeUp.startsWith("JASA") ||
      kodeUp.startsWith("JS") ||
      kodeUp.includes("FILE") ||
      namaUp.includes("JASA") ||
      namaUp.includes("ONGKIR") ||
      namaUp.includes("DESAIN");

    // Hapus "!item.noPengajuanHarga" dari kondisi if di bawah ini:
    if (!isJasaMurni) {
      const hasItemDiscount = (item.diskonRp || 0) > 0 || (item.diskonPersen || 0) > 0;
      if (!hasItemDiscount) {
        // Masukkan ke basis diskon faktur HANYA jika barang ini tidak punya diskon item (F1) sendiri
        basisDiskonFaktur += item.total;
      }
    }
  });

  // Total Diskon Item adalah selisih Kotor - Bersih
  const totalDiskonItem = grossSubTotal - netItemTotal;

  // Base calculation untuk tahap selanjutnya (Netto Item)
  const afterItemDiscount = netItemTotal;

  // ---------------------------------------------------------------------
  // FIX: JIKA INVOICE BERASAL DARI SO → DISKON FAKTUR TIDAK BOLEH DIHITUNG ULANG
  // ---------------------------------------------------------------------
  if (header.nomorSo) {
    totals.subTotal = netItemTotal; // Set Subtotal Bersih
    totals.totalDiskonItem = totalDiskonItem;

    const d1AmountSO = (header.diskonPersen1 / 100) * basisDiskonFaktur;
    const manualRpSO = Number(header.diskonRp || 0); // base murni
    const d2AmountSO = isMapsAlreadyInDiskonRp.value
      ? Number(header.diskonMapsRp || 0) // pakai nilai asli dari SO
      : (header.diskonPersen2 / 100) * Math.max(0, basisDiskonFaktur - d1AmountSO - manualRpSO);

    totals.diskonNominal1 = d1AmountSO;
    totals.diskonNominal2 = d2AmountSO; // maps terpisah
    totals.diskonNominalRp = manualRpSO; // promo/member murni
    totals.totalDiskonFaktur = Math.round(d1AmountSO + d2AmountSO + manualRpSO);

    if (isKpr.value) {
      totals.totalDiskonFaktur = Math.round(d1AmountSO + d2AmountSO + manualRpSO);
    } else {
      // [REVISI] Jalur Non-KPR sekarang juga menghitung Persen 1 & 2 secara bertingkat
      // Ini agar Diskon Maps Review (P2) tetap masuk hitungan meskipun ada nomor SO
      totals.totalDiskonFaktur = Math.round(d1AmountSO + d2AmountSO + manualRpSO);
    }

    const afterAllDiscount = afterItemDiscount - totals.totalDiskonFaktur;

    const totalPpn = afterAllDiscount * (header.ppnPersen / 100);
    const totalDp = (linkedDps.value || []).reduce((sum, dp) => sum + (dp.nominal || 0), 0);

    totals.totalPpn = totalPpn;
    totals.grandTotal =
      afterAllDiscount + totalPpn + (header.biayaKirim || 0) - (header.mpBiayaPlatform || 0);
    totals.totalDp = totalDp;
    totals.sisaPiutang = Math.max(0, totals.grandTotal - totalDp);

    return; // ← STOP
  }

  // ---------------------------------------------------------------------
  // 3. DISKON FAKTUR (PERSEN)
  // ---------------------------------------------------------------------
  // [FIX] Inisialisasi rincian untuk kalkulasi Tiering (Bertingkat)
  let d1Amount = 0;
  let manualAmount = 0;

  // Aturan Mutually Exclusive: Prioritaskan Persen Member jika ada, jika tidak pakai Nominal
  if (header.diskonPersen1 > 0) {
    d1Amount = (header.diskonPersen1 / 100) * basisDiskonFaktur;
    manualAmount = 0;
  } else {
    manualAmount = Number(header.diskonRp || 0);
    d1Amount = 0;
  }

  // Diskon 2 (MAPS) selalu dihitung dari sisa setelah potongan dasar (P1/Manual)
  const remainingForTier2 = basisDiskonFaktur - d1Amount - manualAmount;
  const d2Amount = isMapsAlreadyInDiskonRp.value
    ? 0
    : (header.diskonPersen2 / 100) * Math.max(0, remainingForTier2);

  // [RINCIAN UNTUK PAYMENT MODAL]
  totals.diskonNominal1 = d1Amount;
  totals.diskonNominal2 = d2Amount;
  totals.diskonNominalRp = manualAmount;

  // ---------------------------------------------------------------------
  // 5. TOTAL DISKON FAKTUR (gabungan)
  // ---------------------------------------------------------------------
  const diskonFaktur = Math.round(manualAmount + d1Amount + d2Amount);

  // ---------------------------------------------------------------------
  // 6. NETTO SETELAH SEMUA DISKON
  // ---------------------------------------------------------------------
  const nettoSetelahDiskon = afterItemDiscount - diskonFaktur;

  // ---------------------------------------------------------------------
  // 7. PPN
  // ---------------------------------------------------------------------
  const totalPpn = nettoSetelahDiskon * (header.ppnPersen / 100);

  // ---------------------------------------------------------------------
  // 8. DP
  // ---------------------------------------------------------------------
  const totalDp = linkedDps.value.reduce((sum, dp) => sum + (dp.nominal || 0), 0);

  // ---------------------------------------------------------------------
  // 9. UPDATE TOTALS
  // ---------------------------------------------------------------------
  // SubTotal di sini kita isi dengan Net Item Total (Total yg sudah dikurangi diskon item)
  // Sesuai dengan logic 'netItemTotal' di atas.
  totals.subTotal = netItemTotal;

  totals.totalDiskonItem = totalDiskonItem;
  totals.totalDiskonFaktur = diskonFaktur;

  totals.nettoSetelahDiskon = nettoSetelahDiskon;
  totals.totalPpn = totalPpn;

  totals.grandTotal = Math.max(
    0,
    nettoSetelahDiskon + totalPpn + (header.biayaKirim || 0) - (header.mpBiayaPlatform || 0)
  );

  totals.totalDp = totalDp;
  totals.sisaPiutang = Math.max(0, totals.grandTotal - totalDp);
};

const checkAndApplyMonthlyPromo = async () => {
  if (header.nomorSo) return; // Tetap skip jika dari SO

  // Jalankan evaluasi via composable
  const result = await autoPromo.evaluate();
  if (result) {
    header.nomorPromo = result.nomorPromo;
    header.namaPromo = result.namaPromo;
    header.diskonRp = result.diskonRp;
    header.diskonPersen1 = result.diskonPersen1;
  }
};

const handleOpenDiskonForm = async () => {
  if (isReadonly.value) return;

  if (lastSuggestedPromo.value === "MANUAL_AUTH" || header.nomorSo) {
    dialogs.diskonForm = true;
    return;
  }

  // 1. Paksa sistem menawarkan Promo Bulanan DULU
  await checkAndApplyMonthlyPromo();

  // 2. Baru buka modal Maps/Ongkir (sehingga DiskonForm menerima nilai Netto yang akurat)
  dialogs.diskonForm = true;
};

const handleBonusSelection = (bonusItem: Item) => {
  dialogs.promoBonus = false;

  items.value.push({
    id: Date.now(),
    kode: bonusItem.kode,
    nama: `${bonusItem.nama} #BONUS`,
    ukuran: bonusItem.ukuran,
    stok: bonusItem.stok,
    qtyso: 0,
    jumlah: activePromoForBonus.value.qty, // Ambil qty dari promo
    harga: 0,
    diskonPersen: 0,
    diskonRp: 0,
    total: 0,
    promo: activePromoForBonus.value.nomor,
    _isHargaEditable: true,
    terhitungPromo: true,
  });
  addNewRow();
};

// const applyPromoToItems = async (promoNomor: string) => {
//   if (!promoNomor) return;

//   try {
//     const { data } = await api.get(`/invoice-form/lookup/promo-items/${promoNomor}`);
//     const promoItems = data || [];

//     items.value.forEach((item) => {
//       if (item.terhitungPromo === true) return;
//       const match = promoItems.find(
//         (p: PromoItem) => p.kode === item.kode && p.ukuran === item.ukuran
//       );
//       if (match) {
//         const harga = item.harga || 0;
//         const diskonPersen = match.discPersen || 0;
//         const diskonRp = match.discRp || (harga * diskonPersen) / 100;

//         // Diskon berlaku untuk semua qty
//         item.diskonPersen = diskonPersen;
//         item.diskonRp = diskonRp;
//         item.total = (item.jumlah || 0) * (harga - diskonRp);
//         item.terhitungPromo = true;
//       } else {
//         item.diskonPersen = 0;
//         item.diskonRp = 0;
//         item.terhitungPromo = false;
//         item.total = (item.jumlah || 0) * (item.harga || 0);
//       }
//     });

//     calculateTotals();
//   } catch (err) {
//     console.error("Gagal menerapkan promo:", err);
//   }
// };

// const computeItemDiscount = (item: Item): number => {
//   const qty = item.jumlah || 0;
//   const perUnitDisc = item.diskonRp || 0;

//   if (item.terhitungPromo && (item.promoQty ?? 0) > 0) {
//     const discQty = Math.min(item.promoQty!, qty); // non-kelipatan: maksimal 1
//     return discQty * perUnitDisc;
//   }
//   // kasus diskon manual/normal: berlaku ke semua qty
//   return qty * perUnitDisc;
// };

const computeLineTotal = (item: Item) => {
  const harga = item.harga || 0;
  const jumlah = item.jumlah || 0;
  const sub = harga * jumlah;

  let nominalDiskon = 0;

  // Logika Prioritas: Jika ada Diskon Rp, pakai itu. Jika tidak, pakai Persen.
  if ((item.diskonRp || 0) > 0) {
    nominalDiskon = (item.diskonRp || 0) * jumlah;
  } else {
    nominalDiskon = (sub * (item.diskonPersen || 0)) / 100;
  }

  // Cegah minus
  return Math.max(0, sub - nominalDiskon);
};

const SIZE_RANK_MAP: Record<string, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  "2XL": 6,
  "3XL": 7,
  "4XL": 8,
  "5XL": 9,
  "6XL": 10,
  "7XL": 11,
  "8XL": 12,
  "9XL": 13,
  "10XL": 14,
  JUMBO: 15,
  OVERSIZE: 16,
};

const getSizeRank = (ukuran?: string): number => {
  if (!ukuran) return 999;
  const key = ukuran.toString().toUpperCase().trim();
  if (SIZE_RANK_MAP[key] !== undefined) return SIZE_RANK_MAP[key];
  const numeric = parseInt(key, 10);
  if (!isNaN(numeric)) return numeric + 100; // ukuran numerik (celana, dll) di belakang size alfabet
  return 500; // ukuran tidak dikenal, taruh di tengah
};

// [BARU] Urutkan grid: kaos reguler dulu, custom/SO DTF belakangan, lalu per
// kode barang, lalu per ukuran kecil ke besar. Baris kosong (buat input baru)
// selalu tetap di paling bawah.
const sortItemsBySize = (list: Item[]): Item[] => {
  const filled = list.filter((i) => i.kode);
  const empty = list.filter((i) => !i.kode);

  const catRank = (item: Item) => (item.isCustomOrder || item.noSoDtf ? 1 : 0);

  filled.sort((a, b) => {
    if (catRank(a) !== catRank(b)) return catRank(a) - catRank(b);

    const kodeA = (a.kode || "").toUpperCase();
    const kodeB = (b.kode || "").toUpperCase();
    if (kodeA !== kodeB) return kodeA.localeCompare(kodeB);

    return getSizeRank(a.ukuran) - getSizeRank(b.ukuran);
  });

  return [...filled, ...empty];
};

// --- Method Baru: Fetch Promo saat Mounted ---
const fetchActivePromos = () => autoPromo.fetchPromos(header.gudang.kode, header.tanggal);

// --- Method Baru: Cek Promo Real-time ---
const checkRealtimePromoEligibility = () => {
  // Sekarang ditangani oleh autoPromo.debouncedEvaluate()
  // Fungsi ini dikosongkan agar tidak ada breaking change
  // di tempat lain yang masih memanggilnya
};

// let isApplyingBonus = false;

// const applyMarchBonusSticker = async (forceInject = false) => {
//   if (header.nomorSo) return;

//   if (isApplyingBonus) return;
//   isApplyingBonus = true;

//   try {
//     const STICKER_BARCODE = "25014783";
//     const STICKER_KODE = "2500053";
//     const THRESHOLD_STICKER = 600000;
//     const PROMO_ID = "PRO-2026-001";

//     const isStickerPromoToko = (i: Item) =>
//       (String(i.barcode) === STICKER_BARCODE || String(i.kode) === STICKER_KODE) &&
//       String(i.ukuran).toUpperCase() === "A6" &&
//       (i.harga === 0 || i.terhitungPromo || i.promo === "PRO-2026-001");

//     // Hitung Uang Belanja (abaikan stiker & custom/dtf)
//     const totalEligibleValue = items.value.reduce((sum, item) => {
//       return isItemPromoEligible(item) && !isStickerPromoToko(item) ? sum + (item.total || 0) : sum;
//     }, 0);

//     // Hitung Qty Kaos Reguler (HANYA KAOS, abaikan stiker & custom/dtf)
//     const totalKaosRegulerQty = items.value.reduce((sum, item) => {
//       const isReguler = item.kategori?.toUpperCase() === "REGULER";
//       const isBukanPesananAtauSesional = !["PESANAN", "SESIONAL"].includes(
//         item.kategori?.toUpperCase() || ""
//       );
//       const isBukanCustomAtauDtf = !item.isCustomOrder && !item.noSoDtf;

//       return isReguler &&
//         isBukanPesananAtauSesional &&
//         isBukanCustomAtauDtf &&
//         !isStickerPromoToko(item)
//         ? sum + (Number(item.jumlah) || 0)
//         : sum;
//     }, 0);

//     const multiplier = Math.floor(totalEligibleValue / THRESHOLD_STICKER);
//     const baseBonusQty = totalKaosRegulerQty * multiplier;

//     // --- [KUNCI PERBAIKAN] HITUNG STIKER CUSTOM YANG SUDAH ADA ---
//     const customStickerQty = items.value.reduce((sum, item) => {
//       const isCustomDtf = item.isCustomOrder || !!item.noSoDtf;
//       const isA6 = item.ukuran?.toUpperCase() === "A6" || item.nama?.toUpperCase().includes("A6");

//       // Jika ini adalah SO DTF / Custom dan ukurannya A6, anggap ini sebagai stiker bonus yang dipakai
//       return isCustomDtf && isA6 ? sum + (Number(item.jumlah) || 0) : sum;
//     }, 0);

//     // Sisa kuota stiker dari toko (dikurangi yang sudah dibikin via Custom)
//     const targetBonusQty = Math.max(0, baseBonusQty - customStickerQty);

//     // --- SAPU BERSIH DUPLIKAT STIKER TOKO ---
//     const stickerIndexes: number[] = [];
//     items.value.forEach((item, idx) => {
//       if (isStickerPromoToko(item)) stickerIndexes.push(idx);
//     });

//     // Jika jatah habis ATAU ditemukan lebih dari 1 baris stiker (duplikat), hapus semuanya dulu
//     // agar kita bisa melakukan "Fresh Re-insert"
//     if (
//       targetBonusQty === 0 ||
//       stickerIndexes.length > 1 ||
//       (forceInject && stickerIndexes.length > 0)
//     ) {
//       // Hapus dari index terbesar agar tidak merusak urutan array saat splice
//       for (let i = stickerIndexes.length - 1; i >= 0; i--) {
//         items.value.splice(stickerIndexes[i], 1);
//       }
//       // Update ulang index setelah dihapus
//       stickerIndexes.length = 0;
//     }

//     // Jika masih ada sisa jatah, baru masukkan stiker toko
//     if (targetBonusQty > 0) {
//       // Cek apakah promo sudah diaktifkan (via tombol atau memang sudah ada barisnya)
//       if (!forceInject && header.nomorPromo !== PROMO_ID && stickerIndexes.length === 0) {
//         return;
//       }

//       // Cari lagi indexnya setelah cleanup di atas
//       const existingIdx = items.value.findIndex((i) => isStickerPromoToko(i));

//       if (existingIdx !== -1) {
//         // Jika baris sudah ada, pastikan QTY sinkron
//         if (items.value[existingIdx].jumlah !== targetBonusQty) {
//           items.value[existingIdx].jumlah = targetBonusQty;
//           items.value[existingIdx].total = 0;
//         }
//       } else {
//         // Jika belum ada, suntik baris baru
//         let stokFisikToko = 0;
//         try {
//           const response = await api.get(`/invoice-form/by-barcode/${STICKER_BARCODE}`, {
//             params: { gudang: header.gudang.kode },
//           });
//           stokFisikToko = Number(response.data.stok || 0);
//         } catch (e) {
//           console.warn("Fallback stok stiker", e);
//         }

//         const newItem: Item = {
//           id: 9992026, // Gunakan ID tetap khusus stiker promo agar tidak re-generate
//           kode: STICKER_KODE,
//           nama: "STICKER DTF A6 (FREE MARET)",
//           ukuran: "A6",
//           jumlah: targetBonusQty,
//           harga: 0,
//           _isHargaEditable: false,
//           diskonRp: 0,
//           diskonPersen: 0,
//           total: 0,
//           barcode: STICKER_BARCODE,
//           stok: stokFisikToko,
//           terhitungPromo: true,
//           promo: PROMO_ID,
//         };

//         // Masukkan di baris sebelum baris kosong terakhir
//         const emptyIdx = items.value.findIndex((i) => !i.kode);
//         if (emptyIdx !== -1) {
//           items.value.splice(emptyIdx, 0, newItem);
//         } else {
//           items.value.push(newItem);
//         }
//       }
//     }
//   } finally {
//     isApplyingBonus = false;
//   }
// };

const applyPromoDiscount = (proofFile?: File) => {
  header.nomorPromo = pendingPromoData.nomor;
  header.namaPromo = pendingPromoData.nama;
  header.diskonRp = pendingPromoData.diskon;
  header.diskonPersen1 = 0;
  lastSuggestedPromo.value = "";
  isPromoConfirmVisible.value = false;

  if (proofFile) {
    pendingReviewProofFile.value = proofFile;
    isCurrentPromoRequiresReview.value = true;
  } else {
    isCurrentPromoRequiresReview.value = false;
  }

  calculateTotals();
  toast.success(`Promo ${pendingPromoData.nama} berhasil diterapkan.`);
};

const handleUsePromoWithProof = (file: File) => {
  applyPromoDiscount(file);
};

const useMemberDiscount = () => {
  lastSuggestedPromo.value = "MANUAL_AUTH";
  header.nomorPromo = autoPromo.isMapsApplied.value ? "PRO-2026-003" : "";
  header.namaPromo = autoPromo.isMapsApplied.value ? "PROMO GOOGLE MAPS REVIEW 5%" : "";
  header.diskonRp = 0;
  isPromoConfirmVisible.value = false;
  applyDefaultDiscount();
  calculateTotals();
  toast.info("Promo dilepas, kembali ke diskon member.");
};

// [BARU] Cek kuota hadiah gratis Grand Opening K12
const checkFreeGiftQuota = async () => {
  const cabang = header.gudang.kode;
  const activeNomors = autoPromo.activePromos.value.map((p) => p.pro_nomor);
  const isCampaignActive =
    cabang === PROMO_GRAND_OPENING_K12.cabang &&
    activeNomors.includes(PROMO_GRAND_OPENING_K12.proNomor);

  // [BARU] Kecualikan customer RETAIL
  const custNama = header.customer?.nama?.toUpperCase() || "";
  const isRetailCustomer = custNama.includes("RETAIL");

  if (!isCampaignActive || !header.customer.kode || isRetailCustomer) {
    freeGiftQuota.available = false;
    freeGiftQuota.sisaKuota = 0;
    freeGiftQuota.reason = isRetailCustomer ? "CUSTOMER_RETAIL" : null;
    return;
  }

  if (items.value.some((i) => i.isFreeGift)) {
    freeGiftQuota.available = false;
    return;
  }

  // [BARU] Cek syarat minimal belanja Combed 24S sebelum tanya kuota ke backend
  const eligibleSubtotal = calcFreeGiftEligibleSubtotal(items.value);
  if (eligibleSubtotal < PROMO_GRAND_OPENING_K12.minBelanjaFreeItem) {
    freeGiftQuota.available = false;
    freeGiftQuota.sisaKuota = 0;
    freeGiftQuota.reason = "BELUM_MEMENUHI_MINIMAL_BELANJA";
    return;
  }

  try {
    const { data } = await api.get("/invoice-form/lookup/free-item-quota", {
      params: {
        proNomor: PROMO_GRAND_OPENING_K12.proNomor,
        cusKode: header.customer.kode,
      },
    });
    freeGiftQuota.available = data.available;
    freeGiftQuota.sisaKuota = data.sisaKuota;
    freeGiftQuota.reason = data.reason;
  } catch (err) {
    console.error("[FreeGift] Gagal cek kuota:", err);
    freeGiftQuota.available = false;
  }
};

// [BARU] Buka dialog scan hadiah gratis
const openFreeGiftScanDialog = () => {
  freeGiftScanBarcode.value = "";
  isFreeGiftScanDialogOpen.value = true;
  nextTick(() => {
    freeGiftScanInputRef.value?.focus();
  });
};

// [BARU] Proses scan barcode hadiah gratis
const handleFreeGiftScan = async () => {
  const barcode = freeGiftScanBarcode.value;
  if (!barcode) return;

  isFreeGiftScanning.value = true;
  try {
    const response = await api.get(`/invoice-form/by-barcode/${barcode}`, {
      params: { gudang: header.gudang.kode },
    });
    const product = response.data;

    // Validasi: harus kategori REGULER + nama mengandung COMBED 24S
    if (!isEligibleFreeGiftItem(product)) {
      audioError.play().catch(() => {});
      toast.error(`${product.nama} bukan barang COMBED 24S. Scan barang lain untuk hadiah gratis.`);
      nextTick(() => {
        freeGiftScanInputRef.value?.select();
      });
      return;
    }

    // [BARU] Validasi: ukuran hadiah tidak boleh lebih besar dari ukuran yang dibeli
    if (!isFreeGiftSizeAllowed(product.ukuran, items.value)) {
      audioError.play().catch(() => {});
      toast.error(
        `Ukuran hadiah (${product.ukuran}) tidak boleh lebih besar dari ukuran produk yang dibeli.`
      );
      nextTick(() => {
        freeGiftScanInputRef.value?.select();
      });
      return;
    }

    // Tambahkan sebagai item hadiah gratis
    items.value.push({
      id: Date.now(),
      kode: product.kode,
      nama: `${product.nama} 🎁 HADIAH GRATIS`,
      ukuran: product.ukuran,
      stok: product.stok,
      jumlah: 1,
      harga: 0,
      diskonPersen: 0,
      diskonRp: 0,
      total: 0,
      barcode: product.barcode,
      qtyso: 0,
      kategori: product.kategori || "",
      terhitungPromo: false,
      _isHargaEditable: false,
      isFreeGift: true, // [KUNCI] flag hadiah gratis
    });
    addNewRow();
    jumpToLastPage();

    // Kunci promo ini di header agar backend tahu harus reserve slot saat save
    header.proNomorFreeItem = PROMO_GRAND_OPENING_K12.proNomor;

    freeGiftQuota.available = false;
    isFreeGiftScanDialogOpen.value = false;
    audioSuccess.play().catch(() => {});
    toast.success(`🎁 Hadiah gratis ditambahkan: ${product.nama}`);
    calculateTotals();
  } catch (error: unknown) {
    audioError.play().catch(() => {});
    if (axios.isAxiosError(error) && error.response) {
      toast.error(error.response.data?.message || `Barcode ${barcode} tidak valid.`);
    } else {
      toast.error(`Barcode ${barcode} tidak valid.`);
    }
    nextTick(() => {
      freeGiftScanInputRef.value?.select();
    });
  } finally {
    isFreeGiftScanning.value = false;
    freeGiftScanBarcode.value = "";
    if (isFreeGiftScanDialogOpen.value) {
      nextTick(() => freeGiftScanInputRef.value?.focus());
    }
  }
};

let freeGiftCheckTimer: ReturnType<typeof setTimeout>;
const debouncedCheckFreeGiftQuota = (): void => {
  clearTimeout(freeGiftCheckTimer);
  freeGiftCheckTimer = setTimeout(() => {
    checkFreeGiftQuota();
  }, 400);
};

const closePromoDialog = () => {
  isPromoConfirmVisible.value = false;
  lastSuggestedPromo.value = pendingPromoData.nomor;
};

const handleProceedToPayment = async () => {
  if (freeGiftQuota.available && !items.value.some((i) => i.isFreeGift)) {
    const confirmed = await new Promise<boolean>((resolve) => {
      showConfirmation(
        "⚠️ Hadiah Gratis Belum Diambil!",
        `Customer ini berhak dapat COMBED 24S gratis (Sisa kuota: ${freeGiftQuota.sisaKuota}), tapi belum di-scan. Lanjutkan tanpa memberikan hadiah?`,
        () => resolve(true)
      );
      const unwatch = watch(
        () => dialogConfirm.show,
        (newValue) => {
          if (!newValue) {
            unwatch();
            resolve(false);
          }
        }
      );
      const originalOnConfirm = dialogConfirm.onConfirm;
      dialogConfirm.onConfirm = () => {
        originalOnConfirm();
        unwatch();
      };
    });
    if (!confirmed) return; // SC pilih "Batal" → kembali ke form, tetap bisa scan hadiah
  }

  // =========================================================
  // [BARU] CEK SESI KASIR SEBELUM LANJUT KE PEMBAYARAN
  // =========================================================
  if (isStoreUser.value) {
    // 1. [PENTING] Tarik dulu data sesi dari Backend!
    await cashierSessionStore.fetchCurrentSession();

    const session = cashierSessionStore.session;

    if (!session || session.status === "CLOSED") {
      toast.warning("Laci Kasir belum dibuka. Silakan mulai shift terlebih dahulu.");
      cashierSessionStore.isStartModalVisible = true;
    } else if (session.status === "PAUSED") {
      toast.info("Laci kasir sedang di-pause. Silakan ambil alih (Resume).");
      cashierSessionStore.openHandoverModal("resume");
    }
  }
  // =========================================================

  // --- 1) Validasi dasar ---
  const validItems = items.value.filter((i) => i.kode);
  if (!header.customer.kode) return toast.error("Customer harus diisi.");
  if (!header.customer.level) return toast.error("Level customer belum di-setting.");
  // =========================================================
  // [BARU] BLOKIR CUSTOMER RETAIL JIKA TRANSAKSI > 500RB
  // =========================================================
  const custNama = (header.customer.nama || "").toUpperCase();
  if (custNama.includes("RETAIL") && totals.grandTotal > 500000) {
    return toast.error(
      "Pembelian di atas Rp 500.000 tidak bisa menggunakan customer RETAIL. Silakan buat data customer baru terlebih dahulu!"
    );
  }
  // =========================================================
  if (validItems.length === 0) return toast.error("Detail barang harus diisi.");
  if (header.customer.kode === "K-00079" && !header.memberNik) {
    dialogs.memberForm = true;
    return toast.error("Customer Kencana Print wajib mengisi data NIK Karyawan!");
  }

  for (const item of validItems) {
    const kodeUp = item.kode?.toUpperCase() || "";
    const isNonStock = kodeUp.startsWith("JASA") || kodeUp.includes("FILE");

    // [FIX KETAT HARGA 0] Hanya boleh harga 0 JIKA itu stiker promo A6
    const isStickerPromoToko =
      (String(item.barcode) === "25014783" || String(item.kode) === "2500053") &&
      String(item.ukuran).toUpperCase() === "A6" &&
      (item.harga === 0 || item.terhitungPromo);

    const isFreeGiftItem = item.isFreeGift === true;

    if (!isStickerPromoToko && !isFreeGiftItem) {
      if (
        (item.harga === null || item.harga === undefined || item.harga < 0) &&
        !item.promo &&
        !header.isMarketplace &&
        !isNonStock
      ) {
        return toast.error(`Harga untuk ${item.nama} harus diisi.`);
      } else if (
        (item.harga === null || item.harga === undefined || item.harga < 0) &&
        !item.promo &&
        header.isMarketplace
      ) {
        return toast.error(
          `Harga untuk ${item.nama} masih 0. Silakan input harga marketplace manual.`
        );
      }
    }
  }

  if (
    !header.isMarketplace &&
    isCurrentPromoRequiresReview.value &&
    !pendingReviewProofFile.value
  ) {
    return toast.error(
      "Promo ini wajib disertai bukti ulasan Google Maps. Upload dulu lewat dialog promo sebelum lanjut ke pembayaran."
    );
  }

  const totalQty = validItems.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  if (totalQty <= 0) return toast.error("Qty Invoice kosong semua.");

  const stokOk = await checkStokMinus();
  if (!stokOk) return;

  // ============================================================
  // [FIX] JIKA DARI SO, LEWATI SEMUA PENGECEKAN PROMO OTOMATIS
  // ============================================================
  if (!header.nomorSo) {
    // Flush semua pending evaluasi sebelum buka payment
    await autoPromo.flushEvaluate();
    calculateTotals();
    await nextTick();

    if (header.nomorPromo === "PRO-2025-002") {
      activePromoForBonus.value = { nomor: header.nomorPromo, qty: 1 };
      dialogs.promoBonus = true;
      return;
    }
  }

  // --- LANJUT KE PROSES PEMBAYARAN ---
  if (header.isMarketplace) {
    await fetchMpPackaging();

    // [BARU] Kalau ada stok packaging tapi belum ada yang dipilih, wajib pilih dulu
    if (hasMpPackagingStock.value && totalMpPackagingPcs.value === 0) {
      isMpPackagingDialogOpen.value = true;
      return;
    }

    proceedMarketplaceConfirmation();
  } else {
    const proceedToPayment = () => {
      dialogs.payment = true;
    };
    if (!header.memberHp) {
      showConfirmation(
        "Konfirmasi Member",
        "No. HP Member kosong. Yakin akan melanjutkan?",
        proceedToPayment
      );
    } else {
      proceedToPayment();
    }
  }
};

const proceedMarketplaceConfirmation = () => {
  showConfirmation(
    "Simpan Transaksi Marketplace?",
    `Total Tagihan: ${formatRupiah(
      totals.grandTotal
    )}\n\nTransaksi ini akan dicatat sebagai PIUTANG ke ${header.mpNama}. Lanjutkan?`,
    () => executeSaveMarketplace()
  );
};

const confirmMpPackagingSelection = () => {
  if (hasMpPackagingStock.value && totalMpPackagingPcs.value === 0) {
    return toast.error("Packaging wajib dipilih karena stok tersedia sebelum melanjutkan.");
  }
  isMpPackagingDialogOpen.value = false;
  proceedMarketplaceConfirmation();
};

// [BARU] Function Simpan Khusus Marketplace
const executeSaveMarketplace = async () => {
  if (hasMpPackagingStock.value && totalMpPackagingPcs.value === 0) {
    return toast.error("Packaging wajib dipilih karena stok tersedia.");
  }

  // 1. Pastikan IDREC sudah ada (Idempotency Key)
  if (!header.idrec) {
    header.idrec = generateIdRec(header.gudang.kode || "K01");
  }

  // 2. Validasi Customer & Sales Counter
  if (!header.customer.kode) return toast.error("Customer belum dipilih.");
  if (!header.salesCounter) return toast.error("Sales Counter belum dipilih.");

  const mpPackagingItems = mpPackagingList.value
    .filter((p) => p.qty > 0)
    .map((p) => ({
      kode: p.kode,
      nama: p.nama,
      ukuran: "PCS",
      jumlah: p.qty,
      harga: p.harga,
      diskonPersen: 0,
      diskonRp: 0,
      total: p.harga * p.qty,
      hpp: 0,
      kategori: "PACKAGING",
      isPackaging: true,
    }));

  const payload = {
    header: header,
    items: [...items.value.filter((i) => i.kode), ...mpPackagingItems],
    totals: totals,
    payment: {
      tunai: 0,
      transfer: { nominal: 0, bank: null },
      voucher: { nominal: 0, nomor: "" },
      retur: { nominal: 0, nomor: "" },
      piutang: totals.grandTotal,
      status: "PIUTANG",
      // [HOTFIX] Kirim penanda agar backend melewati validasi PIN
      pinBelumLunas: "SYSTEM_MARKETPLACE",
    },
    dps: linkedDps.value,
    isNew: !isEditMode.value,
    pins: authPins,
    tipeKunjungan: null,
  };

  isSaving.value = true;
  try {
    const response = await api.post("/invoice-form/save", payload);
    toast.success(response.data.message);
    onSaveSuccess();
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    console.error("Detail Error:", err.response?.data);
    toast.error(err.response?.data?.message || "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const STICKER_DTF_LOCKED_KODE = ["2500053", "2500060"];

const checkStokMinus = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const validItems = items.value.filter((i) => i.kode);

    const isStockCheckable = (item: Item) => {
      const kodeUp = item.kode?.toUpperCase() || "";
      const isNonStock = kodeUp.startsWith("JASA") || kodeUp.includes("FILE");
      return !isNonStock && item.kategori !== "SO-DTF" && !item.noSoDtf;
    };

    const getRelevantStok = (item: Item) => {
      if (header.nomorSo && !isKpr.value) return item.stokPesanan || 0;
      return item.stok || 0;
    };

    // [BARU] 1. Cek dulu item Sticker DTF — kalau ada yang bakal minus, BLOCK
    // total, tidak ada opsi lanjut sama sekali.
    const stickerMinusItems = validItems.filter((item) => {
      if (!isStockCheckable(item)) return false;
      if (!STICKER_DTF_LOCKED_KODE.includes(item.kode || "")) return false;
      const qty = item.jumlah || 0;
      return qty > getRelevantStok(item);
    });

    if (stickerMinusItems.length > 0) {
      const itemNames = stickerMinusItems
        .map((i) => `${i.nama} (${i.ukuran}) — stok: ${getRelevantStok(i)}, order: ${i.jumlah}`)
        .join("; ");
      toast.error(
        `Tidak bisa lanjut: stok Sticker DTF tidak mencukupi untuk ${itemNames}. Stok tidak boleh minus untuk barang ini.`
      );
      resolve(false);
      return;
    }

    // 2. Cek barang lain (perilaku lama — boleh lanjut dengan konfirmasi)
    const itemsMinus = validItems.filter((item) => {
      if (!isStockCheckable(item)) return false;
      if (STICKER_DTF_LOCKED_KODE.includes(item.kode || "")) return false; // sudah dicek di atas
      const qty = item.jumlah || 0;
      return qty > getRelevantStok(item);
    });

    if (itemsMinus.length > 0) {
      const itemNames = itemsMinus.map((i) => `${i.nama} (${i.ukuran})`).join(", ");
      const jenisStok =
        isKpr.value || header.gudang.kode === "KDC" || !header.nomorSo ? "Fisik" : "Pesanan";

      showConfirmation(
        "Konfirmasi Stok Minus",
        `Stok ${jenisStok} untuk item (${itemNames}) akan minus. Yakin akan melanjutkan?`,
        () => resolve(true)
      );

      const unwatch = watch(
        () => dialogConfirm.show,
        (newValue) => {
          if (!newValue) {
            unwatch();
            resolve(false);
          }
        }
      );

      const originalOnConfirm = dialogConfirm.onConfirm;
      dialogConfirm.onConfirm = () => {
        originalOnConfirm();
        unwatch();
      };
    } else {
      resolve(true);
    }
  });
};

const onSaveSuccess = async (invoiceNomor?: string) => {
  if (!header.isMarketplace && pendingReviewProofFile.value && invoiceNomor) {
    const formData = new FormData();
    formData.append("image", pendingReviewProofFile.value);
    try {
      await api.post(`/invoice-form/upload-review-proof/${invoiceNomor}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch {
      toast.warning("Invoice tersimpan, tapi bukti ulasan gagal diunggah. Upload manual nanti.");
    }
  }
  audioSuccess.play().catch(() => {});
  markAsSaved();
  router.push({ name: "Invoice" });
};

const applyCustomerPricingRules = async () => {
  if (!isKpr.value) return;
  if (!header.customer.kode) return;
  if (!items.value.some((i) => i.kode)) return;

  // 1. Harga khusus (yang sudah ada)
  try {
    const { data } = await api.get<HargaKhususItem[]>(
      `/invoice-form/lookup/harga-khusus/${header.customer.kode}`
    );
    if (data && data.length > 0) {
      const map = new Map<string, number>(
        data.map((d) => [`${d.kode}|${String(d.ukuran).toUpperCase().trim()}`, Number(d.harga)])
      );
      items.value.forEach((item) => {
        if (!item.kode) return;
        const key = `${item.kode}|${String(item.ukuran || "")
          .toUpperCase()
          .trim()}`;
        const hargaKhusus = map.get(key);
        if (hargaKhusus !== undefined) {
          item.harga = hargaKhusus;
          item.diskonPersen = 0;
          item.diskonRp = 0;
          item.isHargaKhusus = true;
        }
      });
    }
  } catch (err) {
    console.error("Gagal cek harga khusus customer:", err);
  }

  // 2. [BARU] Recalculate diskon tiering (15%/12,5%/10%/5%) untuk item
  // yang BUKAN harga khusus — supaya customer khusus (mis. KPR00022)
  // dapat rate yang benar walau dipilih setelah SJ.
  try {
    const nonKhususItems = items.value
      .filter((i) => i.kode && !i.isHargaKhusus)
      .map((i) => ({
        kode: i.kode,
        ukuran: i.ukuran,
        nama: i.nama,
        kategori: i.kategori,
        harga: i.harga,
      }));

    if (nonKhususItems.length > 0) {
      const { data } = await api.post<RecalcDiscountResult[]>(
        "/invoice-form/lookup/recalc-kpr-diskon",
        { cusKode: header.customer.kode, items: nonKhususItems }
      );

      const discMap = new Map(
        data.map((d) => [`${d.kode}|${String(d.ukuran).toUpperCase().trim()}`, d])
      );

      items.value.forEach((item) => {
        if (!item.kode || item.isHargaKhusus) return;
        const key = `${item.kode}|${String(item.ukuran || "")
          .toUpperCase()
          .trim()}`;
        const result = discMap.get(key);
        if (result) {
          item.diskonPersen = result.disc;
          item.diskonRp = result.diskon;
        }
      });
    }
  } catch (err) {
    console.error("Gagal recalculate diskon KPR:", err);
  }

  calculateTotals();
};

const updateMemberInfo = (customer: Customer | null) => {
  const phone = customer?.telp || "";
  header.memberHp = phone;
  memberHpToSearch.value = phone;
};

const handleBarcodeScan = async () => {
  // 1. Cek Promo 005 (Scan non-aktif)
  if (header.nomorPromo === "PRO-2025-005") {
    audioError.play().catch(() => {}); // Bunyi Error
    return toast.error("Scan barcode non-aktif saat promo ini. Gunakan F1/F2.");
  }

  // 2. Cek Customer
  if (!header.customer.kode) {
    audioError.play().catch(() => {});
    return toast.error("Pilih customer terlebih dahulu sebelum scan!");
  }

  const barcode = scannedBarcode.value;
  if (!barcode) return;

  // [TAMBAHAN] Bersihkan barcode dari angka nol di depan untuk pencarian lokal di array 'items'
  const cleanedBarcode = barcode.replace(/^0+/, "");
  isScanning.value = true;

  try {
    // A. Cek apakah barang sudah ada di list (Increment Qty)
    const existingItem = items.value.find((item) => {
      if (!item.kode) return false;
      const itemBarcode = String(item.barcode || "").replace(/^0+/, "");
      return itemBarcode === cleanedBarcode;
    });

    if (existingItem) {
      existingItem.jumlah += 1;
      jumpToLastPage();

      // Feedback Sukses
      audioSuccess.play().catch(() => {});
      toast.info(`+1 ${existingItem.nama}`);

      scannedBarcode.value = "";
      return; // Selesai, masuk finally
    }

    // B. Jika belum ada, Cari ke API
    const response = await api.get(`/invoice-form/by-barcode/${barcode}`, {
      params: { gudang: header.gudang.kode },
    });

    const product = response.data;

    // --- Logic penentuan harga (Copy dari kode lama Anda) ---
    const emptyRowIndex = items.value.findIndex((item) => !item.kode);
    const currentLevel = String(header.customer.level_kode || "1").trim();
    let basePrice = Number(product.harga || 0);

    if (currentLevel === "5") basePrice = Number(product.harga3 || 0);
    else if (currentLevel === "2" && Number(product.harga2) > 0) basePrice = Number(product.harga2);
    else if (currentLevel === "3" && Number(product.harga3) > 0) basePrice = Number(product.harga3);
    else if (currentLevel === "4" && Number(product.harga4) > 0) basePrice = Number(product.harga4);

    const isPromoActive = header.nomorPromo === "PRO-2025-005";
    const finalPrice = isPromoActive ? 33333 : basePrice;
    const isEditable = !isPromoActive;
    // --------------------------------------------------------

    const newItem = {
      id: Date.now(),
      kode: product.kode,
      nama: product.nama,
      ukuran: product.ukuran,
      stok: product.stok,
      harga: finalPrice,
      jumlah: 1,
      diskonPersen: 0,
      diskonRp: 0,
      total: finalPrice,
      barcode: product.barcode,
      qtyso: 0,
      kategori: product.kategori || "",
      terhitungPromo: isPromoActive,
      _isHargaEditable: isEditable,
    };

    if (emptyRowIndex !== -1) {
      items.value.splice(emptyRowIndex, 1, newItem);
    } else {
      items.value.push(newItem);
    }

    addNewRow();
    jumpToLastPage();

    // Feedback Sukses
    audioSuccess.play().catch(() => {});
    toast.success(`OK: ${product.nama}`);
    scannedBarcode.value = "";
  } catch (error: unknown) {
    // Feedback Error
    audioError.play().catch(() => {});

    if (axios.isAxiosError(error) && error.response) {
      toast.error(error.response.data?.message || `Barcode ${barcode} tidak valid.`);
    } else {
      toast.error(`Barcode ${barcode} tidak valid.`);
    }

    // Select text agar user bisa langsung ganti tanpa hapus manual
    nextTick(() => {
      barcodeInputRef.value?.select();
    });
  } finally {
    isScanning.value = false;

    // [PENTING] Kembalikan fokus ke input scanner
    nextTick(() => {
      barcodeInputRef.value?.focus();
    });
  }
};

// const validateQty = (item: Item) => {
//   if (item.jumlah > (item.stok || 0)) {
//     item.jumlah = item.stok || 0;
//     toast.warning(`Jumlah tidak boleh melebihi stok (${item.stok}) untuk ${item.nama}`);
//   }
// };

const handleJumlahChange = async (item: Item) => {
  if (item.terhitungPromo) return;

  if (authStore.user?.cabang === "KDC") return;

  // Cek ke backend apakah ada promo untuk item ini
  try {
    const response = await api.get("/invoice-form/lookup/applicable-item-promo", {
      params: {
        kode: item.kode,
        ukuran: item.ukuran,
        tanggal: header.tanggal,
      },
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

// Tambahkan di helper function atau di dalam component
const generateIdRec = (cabang: string) => {
  const timestamp = format(new Date(), "yyyyMMddHHmmssSSS");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${cabang}INV${timestamp}${random}`;
};

const resetForm = async () => {
  isPromoMinimized.value = false;
  // Reset state ke awal
  Object.assign(header, initialHeaderState);

  // [BARU] GENERATE IDREC DI SINI (Idempotency Key)
  // ID ini dibuat saat form kosong. Jika user klik simpan berkali-kali karena lag,
  // ID yang dikirim ke backend TETAP SAMA, sehingga backend bisa mendeteksi duplikat.
  const userCabang = authStore.user?.cabang || "K01";
  header.idrec = generateIdRec(userCabang);

  // Logic existing Anda
  if (authStore.user?.cabang === "KON") {
    header.isMarketplace = true;
  }

  items.value = [];
  linkedDps.value = [];
  isSoLoaded.value = false;
  addNewRow();

  markAsSaved();

  autoPromo.clear();
  isMapsAlreadyInDiskonRp.value = false;

  try {
    const authStore = useAuthStore(); // (Opsional: authStore sudah ada di scope atas, tapi tidak apa-apa)
    const cabang = authStore.userCabang;

    if (!cabang || cabang === "-") {
      onCustomerSelected(null);
      return;
    }

    const response = await api.get(`/invoice-form/lookup/default-customer?cabang=${cabang}`);

    if (response.data) {
      onCustomerSelected(response.data);
    } else {
      onCustomerSelected(null);
    }
  } catch (error) {
    console.error("Error fetching default customer:", error);
    onCustomerSelected(null);
  }
};

const getQtyClass = (item: Item) => {
  const kodeUp = item.kode?.toUpperCase() || "";

  const isNonStock =
    kodeUp.startsWith("JASA") ||
    kodeUp.includes("FILE") ||
    !!item.noSoDtf ||
    item.kategori === "SO-DTF";

  if (isNonStock) return "";

  // [PERBAIKAN LOGIKA]
  // Jika ada nomorSo DAN bukan KPR, cek stok pesanan.
  // Jika KPR, atau tidak ada nomorSo, cek stok fisik.
  if (header.nomorSo && !isKpr.value) {
    if ((item.stokPesanan || 0) < (item.jumlah || 0)) return "text-red font-weight-bold";
  } else {
    if ((item.stok || 0) < (item.jumlah || 0)) return "text-red font-weight-bold";
  }

  return "";
};

const isHargaEditable = (item: Item) => {
  if (item.isFreeGift) return false;

  const cabang = authStore.user?.cabang || "";

  // 1. Cabang KDC: Bebas edit harga apapun
  if (cabang === "KDC") {
    return true; // <--- UBAH DARI false MENJADI true
  }

  // 2. Cabang KON & K05: Tetap mengikuti aturan Marketplace
  if (cabang === "KON" || cabang === "K05" || cabang === "K02") {
    return header.isMarketplace === true;
  }

  // 3. Cabang Lainnya: Mengikuti aturan default master barang
  return item._isHargaEditable === true;
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    await fetchActivePromos();
    const response = await api.get(`/invoice-form/${nomor}`);
    const { header: h, items: its, dps } = response.data;

    isLockedFsk.value = response.data.isLockedFsk === true;

    if (isLockedFsk.value) {
      toast.warning("Invoice sudah masuk FSK — mode baca saja.");
    }

    /* =======================
       HEADER
       ======================= */
    header.nomor = h.inv_nomor;
    header.tanggal = format(parseISO(h.inv_tanggal), "yyyy-MM-dd");

    header.customer = {
      kode: h.inv_cus_kode,
      nama: h.cus_nama,
      alamat: h.cus_alamat,
      kota: h.cus_kota,
      telp: h.cus_telp,
      level: h.xLevel,
    };

    header.nomorSo = h.inv_nomor_so || "";
    header.tanggalSo = h.so_tanggal ? format(parseISO(h.so_tanggal), "yyyy-MM-dd") : "";
    header.top = h.inv_top;
    header.salesCounter = h.inv_sc;
    header.keterangan = h.inv_ket;

    header.diskonPersen1 = h.inv_disc1 || 0;
    header.diskonPersen2 = h.inv_disc2 || 0;
    header.diskonRp = 0;
    header.biayaKirim = h.inv_bkrm;

    header.ppnPersen = Number(h.inv_ppn) || 0;

    header.memberHp = h.inv_mem_hp || "";
    header.memberNama = h.inv_mem_nama || "";
    header.memberAlamat = h.inv_mem_alamat || "";
    header.memberGender = h.inv_mem_gender || "";
    header.memberUsia = h.inv_mem_usia || "";
    header.memberReferensi = h.inv_mem_referensi || "";

    try {
      const r = await api.get(`/invoice-form/lookup/discount-rule/${header.customer.kode}`);
      customerDiscountRule.value = r.data;
    } catch {
      customerDiscountRule.value = null;
    }

    header.nomorPromo = h.inv_pro_nomor || ""; // [PENTING] Set nomor promo dari backend
    header.namaPromo = h.namaPromo || ""; // [PENTING] Set nama promo

    // [BARU] Mapping Data Marketplace
    // Backend mengirim: inv_is_marketplace ('Y'/'N'), inv_mp_nama, dst.
    header.isMarketplace = h.inv_is_marketplace === "Y";
    header.mpNama = h.inv_mp_nama || "SHOPEE";
    header.mpNomorPesanan = h.inv_mp_nomor_pesanan || "";
    header.mpResi = h.inv_mp_resi || "";
    header.mpBiayaPlatform = Number(h.inv_mp_biaya_platform || 0);

    /* =======================
       ITEMS
       ======================= */

    items.value = its.map((it: InvoiceItemApi, idx: number) => {
      const harga = Number(it.harga);
      const qty = Number(it.jumlah);
      const diskRp = Number(it.diskonRp);
      const diskPersen = Number(it.diskonPersen || 0);

      const isPromoItem = (diskRp > 0 || diskPersen > 0) && !!header.nomorPromo;

      return {
        id: Date.now() + idx,

        kode: it.kode,
        nama: it.nama_barang,
        ukuran: it.ukuran,

        jumlah: qty,
        harga: harga, // Gunakan harga asli/netto dari backend

        diskonRp: diskRp,
        diskonPersen: diskPersen, // [FIX] Map diskon persen

        total: it.total, // Gunakan total dari backend agar akurat

        barcode: it.barcode || "",
        stok: it.stok || 0, // Fisik
        stokPesanan: it.stokSO || 0, // Pesanan
        qtyso: it.qtySO || 0,

        kategori: it.kategori || "", // [FIX] Map kategori dari backend ('REGULER', etc)

        originalDiskonRp: diskRp,
        originalDiskonPersen: diskPersen,

        terhitungPromo: isPromoItem, // [FIX] Set status promo
        promoQty: 0,
        promo: isPromoItem ? header.nomorPromo : "",
        _isHargaEditable: true,

        nourut: it.nourut,
        fromBackend: true,
      };
    });

    items.value = sortItemsBySize(items.value);

    addNewRow();

    linkedDps.value = dps;

    await nextTick();
    calculateTotals();
    applyDefaultDiscount(); // ini wajib dipanggil setelah load
    calculateTotals(); // hitung ulang setelah diskon berubah
    checkRealtimePromoEligibility();

    isSoLoaded.value = !!header.nomorSo;

    await nextTick();
    markAsSaved();
  } catch (error) {
    const msg = axios.isAxiosError(error)
      ? error.response?.data?.message
      : "Gagal memuat data Invoice.";
    toast.error(msg);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const handleClearSo = () => {
  showConfirmation(
    "Hapus SO?",
    "Menghapus SO akan mengosongkan semua item di keranjang. Lanjutkan?",
    async () => {
      // UBAH: Tambahkan async
      // Reset semua data terkait SO
      header.nomorSo = "";
      header.tanggalSo = "";
      header.diskonPersen1 = 0;
      header.diskonPersen2 = 0;
      header.diskonRp = 0;
      header.biayaKirim = 0;
      header.nomorPromo = "";
      header.namaPromo = "";

      // Kosongkan items dan linked DPs
      items.value = [];
      linkedDps.value = [];
      isSoLoaded.value = false;

      isMapsAlreadyInDiskonRp.value = false;

      // Tambah baris kosong
      addNewRow();

      // [TAMBAHAN] Reset ke default customer
      try {
        const cabang = authStore.user?.cabang;

        if (cabang && cabang !== "-") {
          const response = await api.get(`/invoice-form/lookup/default-customer?cabang=${cabang}`);

          if (response.data) {
            onCustomerSelected(response.data);
            toast.success("SO berhasil dihapus. Customer direset ke default toko.");
          } else {
            onCustomerSelected(null);
            toast.success("SO berhasil dihapus. Silakan pilih customer.");
          }
        } else {
          onCustomerSelected(null);
          toast.success("SO berhasil dihapus. Silakan pilih customer.");
        }
      } catch (error) {
        console.error("Error fetching default customer:", error);
        onCustomerSelected(null);
        toast.success("SO berhasil dihapus. Silakan pilih customer.");
      }
    }
  );
};

const saveHeaderOnly = async () => {
  try {
    const payload = {
      nomor: header.nomor,
      customer: header.customer.kode,
      keterangan: header.keterangan,
      salesCounter: header.salesCounter,
      top: header.top,
      tanggal: header.tanggal,
      biayaKirim: header.biayaKirim,
      diskonPersen1: header.diskonPersen1,
      diskonRp: header.diskonRp,
      ppnPersen: header.ppnPersen,
      memberHp: header.memberHp,
      memberNama: header.memberNama,
      // [BARU] Tambahkan field MP ke payload update header
      isMarketplace: header.isMarketplace,
      mpNama: header.mpNama,
      mpNomorPesanan: header.mpNomorPesanan,
      mpResi: header.mpResi,
      mpBiayaPlatform: header.mpBiayaPlatform,
    };

    await api.put(`/invoice-form/update-header/${header.nomor}`, payload);

    toast.success("Header invoice berhasil diperbarui.");
    router.push({ name: "Invoice", params: { nomor: header.nomor } });
  } catch (error) {
    console.error(error);
    toast.error("Gagal menyimpan header invoice.");
  }
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

const isItemPromoEligible = (item: Item) => {
  // Pastikan pakai Item, bukan SoItem jika interface utamanya Item
  const autoPromoIds = [
    "PRO-2025-008",
    "PRO-2025-010",
    "PRO-2026-001",
    "PRO-2026-002",
    "PRO-2026-004",
    "PRO-2026-005", // Promo Juni Faktur
    "PRO-2026-006", // Promo Juni Per Item
  ];
  const hasActiveMonthlyPromo = activePromosList.value.some((p) =>
    autoPromoIds.includes(p.pro_nomor)
  );

  if (!hasActiveMonthlyPromo) return false;

  const namaUp = (item.nama || "").toUpperCase();

  // Pastikan item Custom Order dan Tarikan SO DTF terdeteksi
  const isCustomOrDtf = !!item.noSoDtf || item.isCustomOrder === true || namaUp.includes("DTF");

  const isBukanPengajuan = !item.noPengajuanHarga;

  // [BARU] Deteksi Bordir: Jika noSoDtf mengandung ".BR."
  const isBukanBordir = !(item.noSoDtf || "").toUpperCase().includes(".BR.");

  // Tolak JASA murni (ongkir, desain, dll) KECUALI itu adalah custom order (Sablon DTF)
  const isJasaMurni = (item.kode || "").toUpperCase().startsWith("JASA") && !isCustomOrDtf;

  // Barang apapun (selain Jasa Murni, Pengajuan Harga, dan Bordir) = Eligible
  return isBukanPengajuan && isBukanBordir && !isJasaMurni;
};

// Hitung tanggal tempo otomatis
watch(
  header,
  () => {
    if (header.top > 0 && header.tanggal) {
      header.tanggalTempo = format(addDays(new Date(header.tanggal), header.top), "yyyy-MM-dd");
    }
  },
  { deep: true }
);

// Recalculate saat item berubah (harga, diskon, qty, promo, dsb)
watch(
  items,
  async (newItems) => {
    newItems.forEach((item) => {
      if (!item.terhitungPromo) {
        item.total = computeLineTotal(item);
      }
    });

    await nextTick();
    calculateTotals();

    if (!header.nomorPromo || header.nomorPromo.startsWith("PRO-")) {
      applyDefaultDiscount();
      calculateTotals();
    }

    // GANTI checkRealtimePromoEligibility() dengan:
    if (!header.nomorSo) {
      autoPromo.debouncedEvaluate();
      debouncedCheckFreeGiftQuota();
    }
  },
  { deep: true }
);

// Jika ada DP tambahan dihubungkan
watch(linkedDps, calculateTotals, { deep: true });

const grandQty = computed(() => items.value.reduce((sum, it) => sum + (Number(it.jumlah) || 0), 0));

const handleKodeKeydown = (e: KeyboardEvent, index: number) => {
  if (header.nomorSo || items.value[index]?.noSoDtf) return;

  switch (e.key) {
    case "F1":
      e.preventDefault();
      e.stopPropagation();
      openProductSearch(index, false);
      break;

    case "F2":
      if (!canSearchManual.value) return;

      e.preventDefault();
      e.stopPropagation();
      openProductSearch(index, true);
      break;
  }
};

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [header, items, linkedDps],
  () => {
    // Abaikan jika sedang loading awal (misal saat edit load data)
    if (isLoading.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Customer dipilih
    const hasHeader = header.customer.kode !== "";

    // 2. Items: Ada item valid (kode terisi)
    const hasItems = items.value.some((i) => i.kode);

    // 3. DP: Ada DP terhubung
    const hasDp = linkedDps.value.length > 0;

    if (hasHeader || hasItems || hasDp) {
      uiStore.setUnsavedChanges(true);
    } else {
      // Jika kembali kosong bersih
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

onMounted(async () => {
  if (isUserMarketplaceEligible.value) {
    header.isMarketplace = true; // [FIX] Gunakan header.value karena header adalah ref()
  }

  markAsSaved();

  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(
      `Anda tidak memiliki izin untuk ${isEditMode.value ? "mengubah" : "membuat"} data Invoice.`
    );
    router.push({ name: "Invoice" }); // Arahkan kembali ke halaman browse
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
  await autoPromo.fetchPromos(header.gudang.kode, header.tanggal);

  const refSo = route.query.refSo as string;
  if (refSo) {
    onSoSelected({ Nomor: refSo }); // Memicu fungsi tarik data SO otomatis
  }

  // =========================================================
  // [BARU] CEK SESI KASIR SAAT MASUK HALAMAN INVOICE
  // =========================================================
  if (isStoreUser.value) {
    // 1. [PENTING] Tarik dulu data sesi dari Backend!
    await cashierSessionStore.fetchCurrentSession();

    const session = cashierSessionStore.session;
    const currentUserKode = authStore.user?.kode; // <-- Ambil kode user login

    if (!session || session.status === "CLOSED") {
      toast.warning("Laci Kasir belum dibuka. Silakan mulai shift terlebih dahulu.");
      cashierSessionStore.isStartModalVisible = true;
    } else if (session.status === "PAUSED") {
      // <-- CEK IDENTITAS
      if (session.active_pengganti === currentUserKode) {
        toast.info("Anda sedang bertugas sebagai Kasir Pengganti.");
      } else {
        toast.info("Laci kasir sedang di-pause. Silakan ambil alih (Resume).");
        cashierSessionStore.openHandoverModal("resume");
      }
    }
  }
  // =========================================================
});

onMounted(() => {
  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key === "F1") {
      // Jika target pencet tombol adalah sebuah INPUT, jangan jalankan pencarian produk global
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.contentEditable === "true") {
        return;
      }

      e.preventDefault();
      openLookup();
    }
  };
  window.addEventListener("keydown", handleGlobalKeyDown);
  onUnmounted(() => window.removeEventListener("keydown", handleGlobalKeyDown));
});

// Watcher untuk Toggle Marketplace
watch(
  () => header.isMarketplace,
  async (isOnline) => {
    if (isOnline) {
      // Logic jika mode online aktif (misal otomatis set customer Shopee)
    } else {
      // Jika dimatikan, mungkin reset customer atau biarkan user memilih
    }
  }
);

watch(
  () => header.customer.kode,
  (newVal) => {
    if (newVal) {
      // Berikan default awal di UI agar user tidak kaget
      header.top = authStore.user?.cabang === "KPR" ? 30 : 14;
    }
  }
);
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-receipt-text-edit">
    <v-alert v-if="isLockedFsk" type="warning" class="mb-3">
      Invoice ini sudah masuk Form Setoran Kasir (FSK). Perubahan tidak diperbolehkan.
    </v-alert>
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
      <v-btn
        v-if="isEditMode"
        color="primary"
        size="small"
        prepend-icon="mdi-content-save"
        :disabled="isLockedFsk"
        @click="saveHeaderOnly"
      >
        Simpan Header
      </v-btn>
      <v-btn
        v-if="!isEditMode"
        size="small"
        prepend-icon="mdi-cancel"
        @click="
          showConfirmation('Batalkan Isian', 'Batalkan dan kosongkan semua isian?', resetForm)
        "
      >
        Batal
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="handleClose"> Tutup </v-btn>
    </template>

    <div class="form-grid-container" :class="{ 'hide-left': !isLeftColumnVisible }">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="mb-2 align-center" v-if="isUserMarketplaceEligible">
            <v-col cols="12">
              <v-sheet
                class="pa-2 rounded bg-orange-lighten-5 border border-orange-lighten-2"
                elevation="0"
              >
                <div class="d-flex align-center mb-2">
                  <v-switch
                    v-model="header.isMarketplace"
                    color="orange-darken-3"
                    density="compact"
                    hide-details
                    inset
                    label="Mode Marketplace"
                    class="font-weight-bold"
                    :readonly="isReadonly"
                  ></v-switch>
                  <v-spacer></v-spacer>
                  <v-icon v-if="header.isMarketplace" color="orange-darken-3"
                    >mdi-store-check</v-icon
                  >
                </div>

                <v-expand-transition>
                  <div v-if="header.isMarketplace">
                    <v-row dense>
                      <v-col cols="4">
                        <v-combobox
                          v-model="header.mpNama"
                          :items="marketplaceList"
                          label="Platform"
                          variant="outlined"
                          density="compact"
                          hide-details
                          bg-color="white"
                          :readonly="isReadonly"
                        ></v-combobox>
                      </v-col>
                      <v-col cols="4">
                        <v-text-field
                          v-model="header.mpNomorPesanan"
                          label="No. Pesanan"
                          variant="outlined"
                          density="compact"
                          hide-details
                          bg-color="white"
                          :readonly="isReadonly"
                        ></v-text-field>
                      </v-col>
                      <v-col cols="4">
                        <v-text-field
                          v-model="header.mpResi"
                          label="No. Resi"
                          variant="outlined"
                          density="compact"
                          hide-details
                          bg-color="white"
                          :readonly="isReadonly"
                        ></v-text-field>
                      </v-col>
                    </v-row>
                  </div>
                </v-expand-transition>
              </v-sheet>
            </v-col>
          </v-row>
          <v-row dense>
            <v-col cols="6">
              <v-text-field
                label="No. Invoice"
                v-model="header.nomor"
                readonly
                density="compact"
                filled
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Tanggal"
                v-model="header.tanggal"
                type="date"
                variant="filled"
                density="compact"
                hide-details
                :readonly="isReadonly"
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                label="Kode Cabang"
                :model-value="header.gudang.kode"
                density="compact"
                filled
                hide-details
                :readonly="isReadonly"
              />
            </v-col>
            <v-col cols="8">
              <v-text-field
                label="Nama Cabang"
                :model-value="header.gudang.nama"
                density="compact"
                filled
                hide-details
                :readonly="isReadonly"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                :label="referenceLabel"
                v-model="header.nomorSo"
                :readonly="isReadonly"
                :prepend-inner-icon="isReadonly ? '' : 'mdi-magnify'"
                density="compact"
                hide-details
                clearable
                :clear-icon="isReadonly ? '' : 'mdi-close'"
                @click="
                  !isReadonly && (isKpr ? (dialogs.sjSearch = true) : (dialogs.soSearch = true))
                "
                @click:clear.prevent="!isReadonly && handleClearSo()"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                :label="referenceDateLabel"
                :model-value="
                  header.tanggalSo ? format(parseISO(header.tanggalSo), 'dd-MM-yyyy') : ''
                "
                readonly
                variant="filled"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                label=" Kode Customer"
                :model-value="header.customer.kode"
                density="compact"
                :readonly="isReadonly"
                @click="!isReadonly && (dialogs.customerSearch = true)"
                prepend-inner-icon="mdi-magnify"
                hide-details
              />
            </v-col>
            <v-col cols="8">
              <v-text-field
                label="Nama Customer"
                :model-value="header.customer.nama"
                :readonly="isReadonly"
                density="compact"
                hide-details
              >
                <template #append-inner>
                  <v-btn
                    icon="mdi-account-plus"
                    size="x-small"
                    variant="tonal"
                    :disabled="isReadonly || isKpr"
                    @click.stop="!isReadonly && (dialogs.customerForm = true)"
                    :title="
                      isKpr
                        ? 'Cabang KPR tidak diizinkan membuat customer baru'
                        : 'Buat Customer Baru'
                    "
                  >
                  </v-btn>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Alamat"
                v-model="header.customer.alamat"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Kota"
                v-model="header.customer.kota"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Telepon"
                v-model="header.customer.telp"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Level"
                v-model="header.customer.level"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="3">
              <v-text-field
                label="TOP"
                v-model.number="header.top"
                type="number"
                min="0"
                density="compact"
                variant="outlined"
                hide-details
                :readonly="isReadonly"
              />
            </v-col>
            <v-col cols="3">
              <v-text-field
                label="Tgl. Jatuh Tempo"
                v-model="header.tanggalTempo"
                type="date"
                density="compact"
                readonly
                filled
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-select
                label="Sales Counter"
                v-model="header.salesCounter"
                :items="salesCounters"
                variant="outlined"
                density="compact"
                hide-details
                :readonly="isReadonly"
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                label="Promo"
                v-model="header.nomorPromo"
                @click="!isReadonly && (dialogs.promoSearch = true)"
                prepend-inner-icon="mdi-magnify"
                density="compact"
                hide-details
                placeholder="F1 atau klik..."
                :readonly="isReadonly"
              />
            </v-col>
            <v-col cols="8">
              <v-text-field
                label="Nama Promo"
                v-model="header.namaPromo"
                density="compact"
                :readonly="isReadonly"
                filled
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Keterangan"
                v-model="header.keterangan"
                density="compact"
                variant="outlined"
                hide-details
                :readonly="isReadonly"
              />
            </v-col>
          </v-row>
          <v-input
            :label="memberLabel"
            :append-inner-icon="isReadonly ? '' : 'mdi-pencil'"
            hide-details
            class="custom-input-button"
            :class="{
              'disabled-input': isReadonly,
              'border-error': header.customer.kode === 'K-00079' && !header.memberNik,
            }"
            @click="!isReadonly && (dialogs.memberForm = true)"
          >
            <div v-if="header.memberNik || header.memberHp" class="input-content">
              <strong>{{ header.memberNik || header.memberHp }}</strong> - {{ header.memberNama }}
            </div>
            <div v-else class="input-placeholder text-error font-weight-bold">
              {{
                header.customer.kode === "K-00079"
                  ? "WAJIB ISI DATA KARYAWAN!"
                  : "Klik untuk isi info member..."
              }}
            </div>
          </v-input>
        </div>
      </div>

      <div class="right-column">
        <div class="top-right-header">
          <div v-if="!header.nomorSo" class="scanner-wrapper d-flex ga-2 align-center">
            <v-text-field
              ref="barcodeInputRef"
              v-model="scannedBarcode"
              label="Scan Barcode di Sini..."
              placeholder="Siap scan satu per satu..."
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-barcode-scan"
              hide-details
              clearable
              :loading="isScanning"
              :disabled="isScanning"
              @keydown.enter.prevent="handleBarcodeScan"
              autofocus
            />
            <v-btn
              icon="mdi-magnify"
              color="secondary"
              variant="tonal"
              density="compact"
              title="Cek Stok & Harga (F1)"
              @click="openLookup"
            />
          </div>

          <div class="logo-container">
            <v-img :src="dynamicLogo" max-width="60" contain />
          </div>
        </div>

        <div class="scrollable-table-wrapper">
          <div class="desktop-form-section table-section">
            <v-data-table
              :headers="tableHeaders"
              :items="items"
              :items-per-page="-1"
              class="desktop-table header-browse-blue vertically-aligned-table"
              fixed-header
              :item-class="(item: Item) => (item.isFreeGift ? 'free-gift-row' : '')"
            >
              <template v-slot:[`item.kode`]="{ item, index }">
                <v-text-field
                  v-model="item.kode"
                  variant="underlined"
                  density="compact"
                  hide-details
                  readonly
                  :placeholder="canSearchManual ? 'F1/F2 = Cari' : 'F1 = Cek Stok'"
                  :class="{ 'field-disabled': !!header.nomorSo || !!item.noSoDtf }"
                  @keydown="handleKodeKeydown($event, index)"
                />
              </template>

              <template #[`item.kategori`]="{ item }">
                <div
                  v-if="!item.isCustomOrder && item.kode"
                  class="d-flex align-center"
                  style="height: 36px"
                >
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

              <template v-slot:[`item.jumlah`]="{ item }">
                <v-text-field
                  v-model.number="item.jumlah"
                  :readonly="isReadonly || item.isFreeGift"
                  type="number"
                  min="0"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-right"
                  :class="getQtyClass(item)"
                  @blur="handleJumlahChange(item)"
                />
              </template>

              <template v-slot:[`item.harga`]="{ item }">
                <v-text-field
                  :model-value="
                    focusedRowId === item.id ? item.harga : formatRupiah(item.harga || 0)
                  "
                  @update:model-value="
                    item.harga = Number(String($event).replace(/[^0-9]/g, '')) || 0
                  "
                  @focus="focusedRowId = item.id"
                  @blur="focusedRowId = -1"
                  type="text"
                  min="0"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-right"
                  :readonly="isReadonly || !isHargaEditable(item)"
                  placeholder="0"
                ></v-text-field>
              </template>

              <template v-slot:[`item.diskonPersen`]="{ item }">
                <v-text-field
                  v-model.number="item.diskonPersen"
                  :readonly="isReadonly"
                  type="number"
                  min="0"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-right"
                  @blur="handleItemDiscountChange(item)"
                  @focus="onItemDiscountFocus(item)"
                />
              </template>

              <template v-slot:[`item.diskonRp`]="{ item }">
                <v-text-field
                  v-model.number="item.diskonRp"
                  type="number"
                  min="0"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-right"
                  :readonly="isReadonly"
                  @blur="handleItemDiscountChange(item)"
                  @focus="onItemDiscountFocus(item)"
                />
              </template>

              <template v-slot:[`item.total`]="{ item }">
                <div
                  class="text-end text-body-2 font-weight-bold d-flex align-center justify-end"
                  style="height: 36px"
                >
                  {{ formatRupiah(item.total ?? 0) }}
                </div>
              </template>

              <template v-slot:[`item.noSoDtf`]="{ item, index }">
                <v-text-field
                  v-model="item.noSoDtf"
                  variant="underlined"
                  density="compact"
                  hide-details
                  readonly
                  class="cursor-pointer"
                  :placeholder="isKpr ? 'Klik cari SO DTF' : ''"
                  :class="{ 'field-disabled': !isKpr && !!header.nomorSo }"
                  filled
                  @click="openSoDtfSearch(item, index)"
                />
              </template>

              <template v-slot:[`item.terhitungPromo`]="{ item }">
                <div
                  v-if="item.kode"
                  class="text-center d-flex align-center justify-center"
                  style="height: 36px"
                >
                  <v-chip
                    v-if="isItemPromoEligible(item)"
                    size="x-small"
                    color="success"
                    variant="flat"
                    class="font-weight-bold"
                  >
                    ELIGIBLE
                    <v-tooltip activator="parent" location="top"
                      >Produk ini berkontribusi dalam perhitungan Promo</v-tooltip
                    >
                  </v-chip>
                  <v-icon v-else color="grey-lighten-2" size="small">mdi-minus</v-icon>
                </div>
              </template>

              <template v-slot:[`item.actions`]="{ item }">
                <v-btn
                  v-if="item.kode"
                  icon="mdi-delete"
                  :disabled="isReadonly"
                  variant="text"
                  color="error"
                  size="x-small"
                  @click="handleDeleteItem(item)"
                  :title="item.noSoDtf ? 'Hapus Semua Item SO DTF Ini' : 'Hapus Item Ini'"
                >
                </v-btn>
              </template>
            </v-data-table>
          </div>
        </div>
        <div class="table-summary-footer">
          <div class="summary-row">
            <div class="label">Grand Qty</div>
            <div class="value">{{ grandQty }}</div>

            <div class="label">Grand Total</div>
            <div class="value">Rp {{ formatRupiah(totals.grandTotal) }}</div>
          </div>
        </div>

        <div class="footer-actions-section">
          <v-slide-y-transition>
            <div v-if="freeGiftQuota.available" class="free-gift-banner mb-3">
              <div class="banner-shine"></div>
              <div class="banner-content">
                <div class="gift-icon-wrapper">
                  <v-icon icon="mdi-gift-outline" size="24" class="gift-bounce" />
                </div>
                <div class="banner-text">
                  <div class="banner-title">🎉 Hadiah Gratis Tersedia!</div>
                  <div class="banner-subtitle">
                    Customer berhak dapat COMBED 24S gratis — Sisa kuota:
                    <strong>{{ freeGiftQuota.sisaKuota }}</strong>
                  </div>
                </div>
                <v-btn
                  color="white"
                  variant="flat"
                  size="small"
                  class="scan-gift-btn"
                  prepend-icon="mdi-barcode-scan"
                  @click="openFreeGiftScanDialog"
                >
                  Scan Hadiah Gratis
                </v-btn>
              </div>
            </div>
          </v-slide-y-transition>

          <v-slide-y-transition>
            <div v-if="promoNotification" class="promo-card-wrapper mb-4">
              <div
                v-if="!isPromoMinimized"
                class="promo-card"
                :class="{ 'grand-opening-style': isGrandOpeningPromo }"
              >
                <v-btn
                  icon="mdi-chevron-up"
                  variant="text"
                  size="x-small"
                  color="white"
                  style="position: absolute; right: 8px; top: 8px; z-index: 10"
                  @click="isPromoMinimized = true"
                ></v-btn>

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
                    <div class="status-chip"><span class="pulse-dot"></span>Auto-Applied</div>
                  </div>
                </div>
              </div>

              <div
                v-else
                class="promo-minimized-bar"
                :class="{ 'grand-opening-style': isGrandOpeningPromo }"
                @click="isPromoMinimized = false"
              >
                <v-icon icon="mdi-ticket-percent" size="16" class="mr-2" />
                <span class="minimized-text"
                  >Promo Aktif:
                  {{
                    potentialPromoDiscount > 0
                      ? "Hemat " + formatRupiah(potentialPromoDiscount)
                      : "Cek Detail"
                  }}</span
                >
                <v-spacer />
                <span class="text-caption mr-2">(Klik untuk Detail)</span>
                <v-icon icon="mdi-chevron-down" size="16" />
              </div>
            </div>
          </v-slide-y-transition>
          <v-row align="center">
            <v-col cols="auto" class="d-flex ga-2">
              <v-btn
                size="small"
                prepend-icon="mdi-cash-multiple"
                @click="dialogs.linkedDp = true"
                :disabled="isReadonly || !header.customer.kode"
              >
                Lihat DP
              </v-btn>
              <v-btn
                size="small"
                prepend-icon="mdi-sale"
                @click="handleOpenDiskonForm"
                :disabled="isReadonly"
              >
                Input Diskon/Biaya
              </v-btn>
            </v-col>

            <v-spacer></v-spacer>

            <v-col cols="auto">
              <v-btn
                color="primary"
                size="large"
                prepend-icon="mdi-credit-card-check"
                @click="handleProceedToPayment"
                :disabled="isReadonly || !authStore.can(MENU_ID, requiredPermission)"
              >
                Lanjutkan ke Pembayaran
              </v-btn>
            </v-col>
          </v-row>
        </div>
      </div>
    </div>

    <CustomerSearchModal
      v-if="dialogs.customerSearch"
      :gudang="header.gudang.kode"
      source="invoice"
      @close="dialogs.customerSearch = false"
      @customer-selected="onCustomerSelected"
    />
    <CustomerForm
      v-if="dialogs.customerForm"
      @close="dialogs.customerForm = false"
      @customer-saved="onNewCustomerSaved"
    />
    <SoSearchModalForInvoice
      v-if="dialogs.soSearch"
      :cabang="header.gudang.kode"
      @close="dialogs.soSearch = false"
      @so-selected="onSoSelected"
      mode="invoice"
    />
    <ProductSearchModal
      v-if="dialogs.productSearch"
      :gudang="header.gudang.kode"
      category="ALL"
      :multi="isMultiSelectProduct"
      source="invoice-cash"
      :promo-nomor="header.nomorPromo"
      @close="dialogs.productSearch = false"
      @products-selected="onProductsSelected"
    />
    <ProductSidePanel
      v-model="isProductPanelVisible"
      :gudang="header.gudang.kode"
      lookup-only
      @products-added="onPanelProductsAdded"
    />
    <UnpaidDpSearchModal
      v-if="dialogs.unpaidDpSearch"
      :customer-kode="header.customer.kode"
      @close="dialogs.unpaidDpSearch = false"
      @selected="onUnpaidDpSelected"
    />
    <PaymentModal
      v-if="dialogs.payment"
      :invoice-header="header"
      :invoice-items="items"
      :totals="totals"
      :auth-pins="authPins"
      :linked-dps="linkedDps"
      :customer-limit="customerLimit"
      :customer-debt="customerDebt"
      @close="dialogs.payment = false"
      @save-success="onSaveSuccess"
    />
    <PromoSearchModal
      v-if="dialogs.promoSearch"
      :tanggal="header.tanggal"
      @close="dialogs.promoSearch = false"
      @selected="onPromoSelected"
    />
    <DiscountConfirmationDialog
      v-model="isPromoConfirmVisible"
      :customer-level="header.customer.level || 'Standar'"
      :diskon-persen-member="header.diskonPersen1"
      :diskon-nominal-member="Math.round((header.diskonPersen1 / 100) * totals.subTotal)"
      :promo-nama="pendingPromoData.nama"
      :promo-nominal="pendingPromoData.diskon"
      :item-discounts="[]"
      :promo-requires-review="pendingPromoRequiresReview"
      @use-member="useMemberDiscount"
      @use-promo="() => applyPromoDiscount()"
      @use-promo-with-proof="handleUsePromoWithProof"
      @ignore="closePromoDialog"
    />
    <MemberForm
      v-if="dialogs.memberForm"
      :initial-hp="memberHpToSearch"
      :is-karyawan-mode="header.customer.kode === 'K-00079'"
      @close="dialogs.memberForm = false"
      @member-saved="onMemberSaved"
    />
    <DiskonForm
      v-if="dialogs.diskonForm"
      :sub-total="totals.subTotal"
      :diskon-persen1="header.diskonPersen1"
      :diskon-persen2="header.diskonPersen2"
      :diskon-rp="header.diskonRp"
      :biaya-kirim="header.biayaKirim"
      :biaya-platform="header.mpBiayaPlatform"
      :is-marketplace="header.isMarketplace"
      @close="dialogs.diskonForm = false"
      @save="onDiskonSaved"
    />
    <LinkedDpModal v-if="dialogs.linkedDp" :dps="linkedDps" @close="dialogs.linkedDp = false" />
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
      v-if="dialogs.soDtfSearch"
      :customer-kode="header.customer.kode"
      :cabang="header.gudang.kode"
      @close="dialogs.soDtfSearch = false"
      @selected="onSoDtfSelected"
    />
    <PromoBonusModal
      v-if="dialogs.promoBonus"
      :promo-nomor="activePromoForBonus.nomor"
      @close="dialogs.promoBonus = false"
      @selected="handleBonusSelection"
    />
    <SjSearchModalForInvoice
      v-if="dialogs.sjSearch"
      :cabang="header.gudang.kode"
      @close="dialogs.sjSearch = false"
      @sj-selected="onSjSelected"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
          >
            Ya, Lanjutkan
          </v-btn>
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
            ref="freeGiftScanInputRef"
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
            @keydown.enter.prevent="handleFreeGiftScan"
          />

          <div class="scan-hint">
            <v-icon size="14" color="grey">mdi-information-outline</v-icon>
            Barang selain COMBED 24S akan ditolak otomatis.
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isMpPackagingDialogOpen" max-width="480" persistent>
      <v-card>
        <v-toolbar color="teal" density="compact">
          <v-toolbar-title class="text-subtitle-1">Pilih Packaging (Marketplace)</v-toolbar-title>
        </v-toolbar>
        <v-card-text class="pa-4">
          <v-alert type="info" variant="tonal" density="compact" class="mb-3">
            Stok packaging tersedia di cabang ini. Pilih minimal 1 sebelum melanjutkan.
          </v-alert>
          <div v-if="isLoadingMpPackaging" class="text-center py-4">
            <v-progress-circular indeterminate color="teal" size="24" />
          </div>
          <v-row v-else dense>
            <v-col
              v-for="item in mpPackagingList.filter((p) => p.stok > 0)"
              :key="item.kode"
              cols="6"
            >
              <div class="d-flex align-center justify-space-between border rounded pa-2">
                <div>
                  <div class="text-caption font-weight-bold">{{ item.nama }}</div>
                  <div class="text-caption text-grey">Stok: {{ item.stok }}</div>
                </div>
                <v-text-field
                  v-model.number="item.qty"
                  type="number"
                  min="0"
                  density="compact"
                  variant="outlined"
                  hide-details
                  style="max-width: 70px"
                  @update:model-value="onMpPackagingQtyChange(item)"
                />
              </div>
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="isMpPackagingDialogOpen = false">Batal</v-btn>
          <v-btn color="primary" @click="confirmMpPackagingSelection">Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.totals-summary {
  background-color: rgb(var(--v-theme-surface));
  border-radius: 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.custom-input-button {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.38);
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  height: 40px;

  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));

  display: flex;
  align-items: center;
}

.custom-input-button:hover {
  border-color: rgb(var(--v-theme-primary));
}

.input-content {
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
}

.input-placeholder {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

:deep(.qty-error input) {
  color: red !important;
  font-weight: bold;
}

.desktop-table :deep(.nama-barang-cell) {
  white-space: nowrap;
  /* tetap satu baris */
  min-width: 300px;
  /* minimum width untuk kolom nama */
  line-height: 1.4;
}

.desktop-table .v-data-table__td {
  white-space: normal !important;
  word-wrap: break-word !important;
}

.desktop-table td:nth-child(2) {
  /* kolom Nama Barang */
  max-width: 400px;
  /* boleh disesuaikan */
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
  height: 100%;
  /* Tambahkan ini */
}

.top-right-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: nowrap;
  flex-shrink: 0;
  /* Penting: jangan menyusut */
}

.scanner-wrapper {
  flex: 1 1 auto;
  min-width: 0;
}

.logo-container {
  width: 60px;
  flex-shrink: 0;
}

.scrollable-table-wrapper {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.table-section {
  flex-grow: 1;
  flex-shrink: 1 !important;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0 !important;
  border: none !important;
}

.vertically-aligned-table :deep(tbody tr td) {
  vertical-align: middle !important;
}

/* Merapatkan padding antar kolom & menyeragamkan tinggi baris */
.desktop-table :deep(thead tr th),
.desktop-table :deep(tbody tr td) {
  padding: 0 4px !important;
  height: 36px !important;
}

/* Hilangkan margin bawah v-input agar tidak mendorong tinggi baris */
.desktop-table :deep(.v-text-field .v-input__details) {
  display: none !important;
}

.desktop-table :deep(.v-text-field .v-field__input) {
  padding: 0 2px !important;
  min-height: 28px !important;
}

.desktop-table :deep(thead th) {
  white-space: nowrap !important;
}

.desktop-table {
  display: flex !important;
  flex-direction: column !important;
  height: 100% !important;
  min-height: 0 !important;
}

.desktop-table :deep(.v-table__wrapper) {
  overflow-x: auto !important;
  overflow-y: auto !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
}

/* Pastikan tabel bisa lebih lebar dari container */
.desktop-table :deep(.v-table) {
  min-width: max-content;
}

.desktop-table :deep(td) {
  vertical-align: middle !important;
}

/* Pastikan setiap wrapper v-text-field di dalam td benar-benar center */
.desktop-table :deep(td .v-input) {
  display: flex;
  align-items: center;
}

.desktop-table :deep(td .v-input__control) {
  width: 100%;
}

.footer-actions-section {
  flex-shrink: 0;
  /* Penting: jangan menyusut */
  padding: 8px 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.footer-actions-section .v-row {
  margin: 0 !important;
}

.table-summary-footer {
  /* Surface + gradient theme-aware */
  background: linear-gradient(
    135deg,
    rgba(var(--v-theme-surface), 0.98) 0%,
    rgba(var(--v-theme-primary), 0.06) 100%
  );

  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 12px 18px;
  font-size: 13px;
  flex-shrink: 0;

  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);

  box-shadow: 0 -3px 8px rgba(0, 0, 0, 0.25);
}

.summary-row {
  display: flex;
  justify-content: flex-end;
  gap: 40px;
  align-items: center;
  font-weight: 600;
}

/* Label (chip-like) */
.summary-row .label {
  color: rgba(var(--v-theme-on-surface), 0.75);
  background-color: rgba(var(--v-theme-primary), 0.12);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
}

/* Value (angka penting) */
.summary-row .value {
  min-width: 80px;
  text-align: right;
  color: rgb(var(--v-theme-on-surface));
  font-size: 14px;
  font-weight: 700;
}

/* Mewarnai Header Tabel */
.desktop-table :deep(thead tr th) {
  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important;
  /* Supaya lebih rapi */
}

.disabled-input {
  opacity: 0.5;
  pointer-events: none;
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

  /* --- OPSI WARNA GRADASI (Pilih salah satu) --- */

  /* Opsi 1: Royal Mystic (Biru Tua ke Ungu) - KESAN MEWAH & PROFESIONAL */
  background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);

  /* Opsi 2: Sunset Vibes (Orange ke Pink) - KESAN HOT PROMO */
  /* background: linear-gradient(135deg, #FF512F 0%, #DD2476 100%); */

  /* Opsi 3: Lush Green (Hijau ke Teal) - KESAN HEMAT/CUAN */
  /* background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); */

  /* Shadow berwarna sesuai tema */
  box-shadow: 0 10px 25px -5px rgba(38, 208, 206, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: all 0.3s ease;
}

/* Style Khusus Grand Opening (Emas ke Merah Maroon - Kesan Meriah) */
.promo-card.grand-opening-style {
  background: linear-gradient(135deg, #ff512f 0%, #dd2476 100%) !important;
  box-shadow: 0 10px 25px -5px rgba(221, 36, 118, 0.5) !important;
  border: 1px solid rgba(255, 215, 0, 0.3) !important;
  /* Border agak keemasan */
}

.grand-opening-style .promo-label {
  color: #ffd700 !important;
  /* Teks label jadi emas */
}

/* Texture Pattern (Titik-titik background) */
.card-texture {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px);
  background-size: 12px 12px;
  /* Jarak antar titik */
  opacity: 0.6;
  z-index: 1;
}

.card-content {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: 16px 32px 16px 24px;
  /* Tambah padding kanan agar tidak tertabrak tombol */
  gap: 16px;
  color: white;
}

/* --- ICON Styles --- */
.icon-container {
  flex-shrink: 0;
}

.icon-circle {
  width: 48px;
  height: 48px;
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

/* --- TEXT Styles --- */
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
  margin-bottom: 4px;
  display: flex;
  align-items: center;
}

.promo-message {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: #ffffff;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.promo-minimized-bar {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  border-radius: 8px;
  background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);
  color: white;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 4px 10px rgba(38, 208, 206, 0.3);
  transition: transform 0.2s ease;
}

.promo-minimized-bar:hover {
  transform: translateY(-2px);
  filter: brightness(1.1);
}

.minimized-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Override warna untuk bar jika itu promo grand opening */
.promo-minimized-bar.grand-opening-style {
  background: linear-gradient(135deg, #ff512f 0%, #dd2476 100%) !important;
  box-shadow: 0 4px 10px rgba(221, 36, 118, 0.4) !important;
}

/* --- ACTION / BADGE Styles --- */
.action-container {
  flex-shrink: 0;
}

.status-chip {
  background: rgba(0, 0, 0, 0.2);
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background-color: #00e676;
  /* Hijau terang */
  border-radius: 50%;
  box-shadow: 0 0 8px #00e676;
  animation: blink 1.5s infinite;
}

.form-grid-container {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  transition: grid-template-columns 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.content-wrapper) {
  overflow: hidden !important;
  padding: 0 !important;
}

.desktop-table :deep(.v-table__wrapper) {
  overflow-x: auto !important;
  overflow-y: auto !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
  height: 100% !important; /* [BARU] — ini yang kelewat dibanding Offer */
}

.form-grid-container.hide-left {
  grid-template-columns: 0px 1fr;
}

.left-column {
  overflow: hidden;
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

/* --- ANIMATIONS --- */

/* Efek Kilau Lewat */
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

/* [NEW] Style untuk mengecilkan font dropdown marketplace */
.marketplace-combo :deep(input) {
  font-size: 13px !important;
}

.marketplace-combo :deep(.v-field__input) {
  font-size: 13px !important;
  min-height: 32px !important;
  /* Adjust height if needed */
}

.marketplace-combo :deep(.v-label) {
  font-size: 13px !important;
}

/* Styling khusus agar Marketplace lebih compact */
.bg-orange-lighten-5 :deep(.v-label) {
  font-size: 11px !important;
  font-weight: bold;
}

.bg-orange-lighten-5 :deep(.v-field__input) {
  font-size: 11px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

/* Mematikan margin default switch agar rapat */
:deep(.v-selection-control) {
  min-height: 30px !important;
}

/* Style untuk list item dropdown (saat dibuka) */
:deep(.v-list-item-title) {
  font-size: 13px !important;
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

/* --- Free Gift Banner --- */
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

/* --- Free Gift Row di Tabel --- */
.desktop-table :deep(.free-gift-row) {
  background: linear-gradient(
    90deg,
    rgba(56, 239, 125, 0.12) 0%,
    rgba(17, 153, 142, 0.06) 100%
  ) !important;
  position: relative;
}

.desktop-table :deep(.free-gift-row td) {
  color: #0d7a6f !important;
  font-weight: 600;
}

.desktop-table :deep(.free-gift-row::before) {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, #11998e, #38ef7d);
}

/* --- Dialog Scan Hadiah Gratis --- */
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
</style>

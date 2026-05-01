<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useRoute } from "vue-router";
import { onBeforeRouteLeave } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useCashierSessionStore } from "@/stores/cashierSessionStore";
import api from "@/services/api";
import { format, parseISO, isValid } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import PrintOptionModal from "@/components/modal/PrintOptionModal.vue";
import KasirPrintPreviewModal from "@/components/modal/KasirPrintPreviewModal.vue";
import RekeningSearchModal from "@/components/lookup/RekeningSearchModal.vue";
import * as XLSX from "xlsx";
import { formatRupiah } from "@/utils/formatRupiah";
import type { AxiosError } from "axios";

interface InvoiceHeader {
  Nomor: string;
  Tanggal: string;
  Posting: string;
  NomorSO?: string;
  TglSO?: string;
  Top?: number;
  Tempo?: string;
  LastPayment?: string;
  "Dis%"?: number;
  DiskonMapsPersen?: number;
  DiskonMapsNominal?: number;
  DiskonPromoNominal?: number; // [BARU]
  Diskon?: number;
  Dp?: number;
  Biayakirim?: number;
  Nominal?: number;
  Piutang?: number;
  Bayar?: number;
  SisaPiutang?: number;
  RpRetur?: number;
  Kdcus?: string;
  Customer?: string;
  Nama?: string;
  Alamat?: string;
  Kota?: string;
  Telp?: string;
  Level?: string;
  Hp?: string;
  Member?: string;
  Keterangan?: string;
  RpTunai?: number;
  NoVoucher?: string;
  RpVoucher?: number;
  RpTransfer?: number;
  NoSetoran?: string;
  TglTransfer?: string;
  Akun?: string;
  NoRekening?: string;
  NoRetur?: string;
  SC?: string;
  Created?: string;
  Prn?: string;
  Puas?: string;
  Closing?: string;
  Marketplace?: string;
  NoPesanan?: string;
  NoResi?: string;
  BiayaPlatform?: number;
  [key: string]: string | number | undefined;
}

interface InvoiceDetail {
  Kode: string;
  Barcode?: string;
  Nama: string;
  Ukuran?: string;
  Jumlah: number;
  Harga: number;
  "Dis%"?: number;
  Total: number;
  HargaAsli?: number; // harga sebelum diskon (per pcs)
  DiskonAktif?: number; // nilai diskon aktif per pcs
}

interface InvoiceItem {
  Nomor: string;
  Tanggal: string;
  Posting: string;
  NomorSO?: string;
  TglSO?: string;
  Top?: number;
  Tempo?: string;
  LastPayment?: string;
  Diskon?: number;
  Dp?: number;
  Biayakirim?: number;
  Nominal?: number;
  Piutang?: number;
  Hp?: string;
  Member?: string;
  SisaPiutang?: number;
  Closing?: string;
  [key: string]: unknown;
}
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
}
interface ColumnFilter {
  type: "simple" | "multi" | "custom";
  values?: (string | number)[]; // untuk multi-select
  operator?: string;
  value?: string | number;
}

// Definisikan bentuk object Rekening sesuai data dari backend/modal
interface Rekening {
  kode: string;
  nama: string;
  rekening: string;
}

// Opsional: Definisikan tipe untuk Form agar lebih ketat
interface PaymentForm {
  metode: "TUNAI" | "TRANSFER" | "QRIS"; // <-- Tambah QRIS
  bank: Rekening | null;
  noRek: string;
  alasan: string;
}

interface ExportHeaderItem {
  Tanggal?: string | number | Date;
  "Tgl SO"?: string | number | Date;
  "Jatuh Tempo"?: string | number | Date;
  [key: string]: unknown; // Mengizinkan properti dinamis lainnya
}

interface InvoiceExportRow {
  Tanggal?: string | Date;
  [key: string]: unknown;
}

interface CabangOption {
  kode: string;
  nama: string;
}

type FilterValue = string | number;

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "27";
const cashierSessionStore = useCashierSessionStore();
const isStoreUser = computed(() => {
  const cabang = authStore.user?.cabang || "";
  return /^K\d+/.test(cabang);
});

// --- State ---
const masterData = ref<InvoiceHeader[]>([]);
const details = ref<Record<string, InvoiceDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<InvoiceHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<CabangOption[]>([]);
const isKasirPreviewVisible = ref(false);
const selectedInvoice = ref<string | null>(null);
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);
const isLockedInvoice = ref(false);

const totalItems = ref(0);
const itemsPerPage = ref(50); // Default 50 per halaman
const page = ref(1);

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  // Jika KDC, default ke 'ALL'. Jika Cabang, default ke kodenya sendiri.
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  status: null as string | null,
});

const isMounted = ref(false);

const isChangePaymentVisible = ref(false);
const isChangingPayment = ref(false);
const isRekeningSearchVisible = ref(false); // State untuk modal rekening

// Form Payment
const formPayment = reactive<PaymentForm>({
  metode: "TUNAI",
  bank: null, // Sekarang TS tahu ini boleh null atau Rekening
  noRek: "",
  alasan: "",
});

const filterOptions = ref([
  { title: "Nomor Invoice", value: "Nomor" },
  { title: "Customer", value: "Nama" },
  { title: "Kd Customer", value: "Kdcus" },
  { title: "Alamat", value: "Alamat" },
  { title: "Kota", value: "Kota" },
  { title: "Nomor SO", value: "NomorSO" },
  { title: "Sales", value: "SC" },
  { title: "HP", value: "Hp" },
]);

// DEFAULT → Nama customer
const selectedFilterField = ref("Nama");

// input pencarian
const filterSearchValue = ref("");

const columnFilters = ref<Record<string, ColumnFilter>>({});

const customFilterDialog = ref(false);
const customFilter = reactive({
  key: "",
  operator: "=",
  value: "",
});

const LS_FILTER_KEY = "invoice_table_filters";
const SESSION_STATE_KEY = "invoice_browse_state";

// LOAD FILTER DARI LOCAL STORAGE
const savedFilter = localStorage.getItem(LS_FILTER_KEY);
if (savedFilter) {
  try {
    columnFilters.value = JSON.parse(savedFilter);
  } catch {}
}

const noFilterColumns = ["data-table-select", "data-table-expand"];

const hasMarketplaceData = computed(() => {
  return masterData.value.some((item) => item.Marketplace && item.Marketplace !== "");
});
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<InvoiceItem | null>(() =>
  isSingleSelected.value ? (selected.value[0] as InvoiceItem) : null
);
const isPrintOptionVisible = ref(false);

const totalNominal = computed(() =>
  masterData.value.reduce((sum, r) => sum + (Number(r.Nominal) || 0), 0)
);

const totalBayar = computed(() =>
  masterData.value.reduce((sum, r) => sum + (Number(r.Bayar) || 0), 0)
);

const totalPiutang = computed(() =>
  masterData.value.reduce((sum, r) => sum + (Number(r.Piutang) || 0), 0)
);

const totalSisaPiutang = computed(() =>
  masterData.value.reduce((sum, r) => sum + (Number(r.SisaPiutang) || 0), 0)
);

const totalRpRetur = computed(() => {
  return masterData.value.reduce((acc, item) => {
    // Pastikan konversi ke float aman (handle jika string/null)
    const val = parseFloat(String(item.RpRetur || 0));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
});

const totalDiskon = computed(() => {
  return masterData.value.reduce((acc, item) => {
    const val = parseFloat(String(item.Diskon || 0));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
});

const totalDiskonMaps = computed(() => {
  return masterData.value.reduce((acc, item) => {
    const val = parseFloat(String(item.DiskonMapsNominal || 0));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
});

const totalDiskonPromo = computed(() => {
  return masterData.value.reduce((acc, item) => {
    const val = parseFloat(String(item.DiskonPromoNominal || 0));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
});

const totalDp = computed(() => {
  return masterData.value.reduce((acc, item) => {
    const val = parseFloat(String(item.Dp || 0));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
});

const totalBiayaKirim = computed(() => {
  return masterData.value.reduce((acc, item) => {
    const val = parseFloat(String(item.Biayakirim || 0));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
});

// const filteredMasterData = computed(() => {
//   let data = [...masterData.value];

//   // 1) EXCEL-STYLE FILTERS (multi & custom)
//   for (const key in columnFilters.value) {
//     const filter = columnFilters.value[key];

//     // MULTI-SELECT
//     if (filter.type === 'multi' && filter.values) {
//       data = data.filter(row =>
//         filter.values!.includes(row[key] as string | number)
//       );
//       continue;
//     }

//     // CUSTOM FILTER
//     if (filter.type === 'custom' && filter.operator) {
//       const cmp = String(filter.value).toLowerCase();

//       data = data.filter(row => {
//         const v = row[key];
//         if (v == null) return false;

//         const val = String(v).toLowerCase();

//         switch (filter.operator) {
//           case '=': return val === cmp;
//           case '!=': return val !== cmp;
//           case '>': return Number(val) > Number(cmp);
//           case '>=': return Number(val) >= Number(cmp);
//           case '<': return Number(val) < Number(cmp);
//           case '<=': return Number(val) <= Number(cmp);
//           case 'contains': return val.includes(cmp);
//           case 'starts': return val.startsWith(cmp);
//           case 'ends': return val.endsWith(cmp);
//         }
//       });
//     }
//   }

//   // 2) GLOBAL SEARCH (dipindah ke paling akhir)
//   if (filterSearchValue.value) {
//     const key = selectedFilterField.value;
//     const term = filterSearchValue.value.toLowerCase();

//     data = data.filter(row =>
//       String(row[key] ?? '')
//         .toLowerCase()
//         .includes(term)
//     );
//   }

//   return data;
// });

// --- Konfigurasi Tabel ---
const headers = computed<DataTableHeader[]>(() => {
  const list: DataTableHeader[] = [
    { title: "", key: "data-table-expand", width: 50, fixed: true },
    { title: "Nomor", key: "Nomor", width: 180, fixed: true },
    { title: "Tanggal", key: "Tanggal", width: 120 },
    { title: "Kd Cus", key: "Kdcus", width: 120 },
    { title: "Customer", key: "Nama", width: 250 },
  ];

  // Syarat tampil: (KON atau K05) DAN toggle aktif
  const isEligibleBranch = authStore.user?.cabang === "KON" || authStore.user?.cabang === "K05";

  if (isEligibleBranch && hasMarketplaceData.value) {
    list.push(
      { title: "Marketplace", key: "Marketplace", width: 120 },
      { title: "No. Pesanan", key: "NoPesanan", width: 180 },
      { title: "No. Resi", key: "NoResi", width: 180 }
    );
  }
  list.push(
    { title: "Posting", key: "Posting", width: 100 },
    { title: "No. SO", key: "NomorSO", width: 180 },
    { title: "Tgl SO", key: "TglSO", width: 120 },
    { title: "TOP", key: "Top", width: 70 },
    { title: "Jatuh Tempo", key: "Tempo", width: 120 },
    { title: "Last Payment", key: "LastPayment", width: 120 },
    { title: "Diskon 1", key: "Dis%", width: 160 }, // [FIX] Ganti judulnya
    { title: "Diskon 2", key: "DiskonMapsPersen", width: 150 },
    { title: "Total Diskon (Rp)", key: "Diskon", width: 150 }
  );
  if (isEligibleBranch && hasMarketplaceData.value) {
    list.push({ title: "Biaya Platform", key: "BiayaPlatform", width: 120 });
  }
  list.push(
    { title: "DP", key: "Dp", width: 120 },
    { title: "Biaya Kirim", key: "Biayakirim", width: 120 },
    { title: "Nominal", key: "Nominal", width: 150 },
    { title: "Piutang", key: "Piutang", width: 150 },
    { title: "Bayar", key: "Bayar", width: 150 },
    { title: "Sisa Piutang", key: "SisaPiutang", width: 150 },
    { title: "Rp Retur", key: "RpRetur", width: 120 },
    { title: "Alamat", key: "Alamat", width: 700 },
    { title: "Kota", key: "Kota", width: 150 },
    { title: "Telepon", key: "Telp", width: 150 },
    { title: "Level", key: "Level", width: 150 },
    { title: "HP", key: "Hp", width: 150 },
    { title: "Nama Member", key: "Member", width: 250 },
    { title: "Keterangan", key: "Keterangan", width: 250 },
    { title: "Rp Tunai", key: "RpTunai", width: 120 },
    { title: "No Voucher", key: "NoVoucher", width: 150 },
    { title: "Rp Voucher", key: "RpVoucher", width: 120 },
    { title: "Rp Transfer", key: "RpTransfer", width: 120 },
    { title: "No Setoran", key: "NoSetoran", width: 180 },
    { title: "Tgl Transfer", key: "TglTransfer", width: 120 },
    { title: "Akun", key: "Akun", width: 120 },
    { title: "No Rekening", key: "NoRekening", width: 150 },
    { title: "No Retur", key: "NoRetur", width: 180 },
    { title: "SC", key: "SC", width: 150 },
    { title: "Created", key: "Created", width: 180 },
    { title: "User Modified", key: "UserModified", width: 150 },
    { title: "Date Modified", key: "DateModified", width: 180 },
    { title: "Minus", key: "Minus", width: 80, align: "center" },
    { title: "Prn", key: "Prn", align: "center" },
    { title: "Puas", key: "Puas", align: "center" },
    { title: "Closing", key: "Closing", align: "center" }
  );

  return list;
});

const detailHeaders = [
  { title: "Kode", key: "Kode" },
  { title: "Barcode", key: "Barcode" },
  { title: "Nama Barang", key: "Nama", width: "300px" },
  { title: "Ukuran", key: "Ukuran" },
  { title: "Jumlah", key: "Jumlah", align: "end" },
  { title: "Harga", key: "Harga", align: "end" },
  { title: "Dis %", key: "Dis%", align: "end" },
  { title: "Total", key: "Total", align: "end" },
] as const;

// --- Methods ---
const safeFormatDate = (
  dateVal: string | number | Date | null | undefined,
  pattern: string
): string => {
  // 1. Filter Input Kosong / Null / Undefined
  if (!dateVal) return "-";

  // 2. Filter String Kosong atau "0000-00-00" (SQL Default)
  if (typeof dateVal === "string") {
    const trimmed = dateVal.trim();
    if (
      trimmed === "" ||
      trimmed === "0000-00-00" ||
      trimmed === "0000-00-00 00:00:00" ||
      trimmed === "-"
    ) {
      return "-";
    }

    // 3. [BYPASS] Jika format sudah dd/MM/yyyy
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed)) {
      return trimmed;
    }
  }

  try {
    let dateObj: Date | undefined;

    // 4. Parsing
    if (typeof dateVal === "string") {
      // Coba parsing standar ISO
      dateObj = parseISO(dateVal);

      // Jika invalid & ada spasi, coba format SQL
      if (!isValid(dateObj) && dateVal.includes(" ")) {
        dateObj = parseISO(dateVal.replace(" ", "T"));
      }

      // Fallback ke native Date
      if (!isValid(dateObj)) {
        dateObj = new Date(dateVal);
      }
    } else if (dateVal instanceof Date) {
      dateObj = dateVal;
    } else if (typeof dateVal === "number") {
      // Handle timestamp number
      dateObj = new Date(dateVal);
    }

    // 5. Final Valid Check
    if (!dateObj || !isValid(dateObj)) {
      // console.warn("Tanggal Invalid diabaikan:", dateVal);
      return "-";
    }

    return format(dateObj, pattern);
  } catch (e) {
    console.error("Error formatting date:", e);
    return "-";
  }
};

const handleRowClick = async (event: Event, { item }: { item: InvoiceHeader }) => {
  selected.value = [item];

  // cek apakah invoice sudah masuk setoran kasir
  try {
    const res = await api.get(`/invoices/check-fsk/${item.Nomor}`);
    isLockedInvoice.value = res.data.used; // true kalau invoice sudah disetorkan
  } catch {
    isLockedInvoice.value = false;
  }
};

const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  // Mencegah sorting saat mau resize
  e.preventDefault();
  e.stopPropagation();

  resizingColumn.value = column;
  startX.value = e.pageX;
  startWidth.value = column.width || 100; // Default width jika belum ada

  // Pasang event listener global
  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", onResizeEnd);
  document.body.style.cursor = "col-resize"; // Ubah kursor body
};

const onResizeMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;

  const diff = e.pageX - startX.value;
  const newWidth = Math.max(50, startWidth.value + diff); // Minimal 50px

  resizingColumn.value.width = newWidth;
};

const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", onResizeEnd);
  document.body.style.cursor = ""; // Reset kursor
};

const fetchCabangList = async () => {
  try {
    const response = await api.get<CabangOption[]>("/invoices/lookup/cabang");
    cabangList.value = response.data;

    // [FIX] Cek manual: Jika user KDC dan backend belum kirim 'ALL'
    if (authStore.user?.cabang === "KDC") {
      // Tipe 'c' sekarang eksplisit
      const hasAll = cabangList.value.some((c: CabangOption) => c.kode === "ALL");

      if (!hasAll) {
        cabangList.value.unshift({ kode: "ALL", nama: "Semua Cabang" });
      }
    }
  } catch (error) {
    // Error di catch block defaultnya unknown, aman untuk toast
    toast.error("Gagal memuat daftar cabang.");
    console.error(error);
  }
};
// Tambahkan Watcher untuk Pencarian
// Gunakan timeout (debounce) agar tidak request setiap ketik 1 huruf
let searchTimeout: ReturnType<typeof setTimeout>;

watch(filterSearchValue, () => {
  clearTimeout(searchTimeout);

  // Tunggu 800ms setelah user berhenti mengetik
  searchTimeout = setTimeout(() => {
    page.value = 1;
    fetchMasterData();
  }, 800);
});

// Update fetchMasterData agar mengirim columnFilters ke backend
const fetchMasterData = async (options?: { page: number; itemsPerPage: number }) => {
  loading.value = true;

  if (options) {
    page.value = options.page;
    itemsPerPage.value = options.itemsPerPage;
  }

  try {
    // Siapkan parameter filter kolom (JSON String)
    // Backend akan memparsing ini
    const columnFiltersJson = JSON.stringify(columnFilters.value);

    const response = await api.get("/invoices", {
      params: {
        ...filters,
        page: page.value,
        limit: itemsPerPage.value,

        // 1. Global Search
        search: filterSearchValue.value,

        // 2. [BARU] Custom Column Filters
        columnFilters: columnFiltersJson,
      },
    });

    const { data, total } = response.data;

    // Mapping Data...
    masterData.value = data.map((h: InvoiceHeader) => ({
      ...h,
      Nama: h.Customer || h.Nama,
      // Gunakan Number() untuk memastikan tipe data aman untuk kalkulasi
      Nominal: Number(h.Nominal) || 0,
      Piutang: Number(h.Piutang) || 0,
      SisaPiutang: Number(h.SisaPiutang) || 0,
      Bayar: Number(h.Bayar) || 0,
      Dp: Number(h.Dp) || 0,
      BiayaPlatform: Number(h.BiayaPlatform) || 0,
      Closing: h.Closing,
      Minus: h.Minus,
    }));

    totalItems.value = total;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;

    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: InvoiceItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);
  try {
    const response = await api.get<InvoiceDetail[]>(`/invoices/details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}: ${error.message}`);
    } else {
      toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}`);
    }
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

// const handleDelete = () => {
//     if (!selectedRow.value) return;
//     if (confirm(`Yakin ingin menghapus Invoice nomor ${selectedRow.value.Nomor}?`)) {
//         api.delete(`/invoices/${selectedRow.value.Nomor}`)
//             .then(response => {
//                 toast.success(response.data.message);
//                 fetchMasterData();
//             })
//             .catch(error => {
//                 toast.error(error.response?.data?.message || 'Gagal menghapus data.');
//             });
//     }
// };

const getRowClass = (item: InvoiceItem) => {
  if ((item.SisaPiutang ?? 0) > 0) {
    return "row-sisa-piutang";
  }

  if (item.Minus === "Y") {
    return "row-stok-minus";
  }

  return "";
};

const handleNew = () => {
  // [PERBAIKAN] Validasi Buka Shift Hanya Untuk Toko
  if (isStoreUser.value) {
    if (!cashierSessionStore.session || cashierSessionStore.session.status === "CLOSED") {
      toast.error("Shift Kasir belum dibuka! Tidak bisa membuat transaksi baru.");
      cashierSessionStore.isStartModalVisible = true;
      return;
    }
  }

  router.push({ name: "InvoiceCreate" });
};

// const handleEdit = () => {
//   if (!isSingleSelected.value) return;
//   const nomor = selected.value[0].Nomor;
//   router.push({ name: 'InvoiceEdit', params: { nomor } });
// };

const openChangePaymentModal = () => {
  // [BARU] Validasi Buka Shift
  if (!cashierSessionStore.session || cashierSessionStore.session.status === "CLOSED") {
    toast.error("Shift Kasir belum dibuka! Tidak bisa mengubah pembayaran.");
    cashierSessionStore.isStartModalVisible = true;
    return;
  }

  // Reset Form
  formPayment.metode = "TUNAI";
  formPayment.bank = null;
  formPayment.noRek = "";
  formPayment.alasan = "";

  isChangePaymentVisible.value = true;
};

const onRekeningSelected = (item: Rekening) => {
  formPayment.bank = item;
  // Otomatis isi nomor rekening
  formPayment.noRek = item.rekening;
};

const submitChangePayment = async () => {
  if (!formPayment.alasan) return toast.warning("Mohon isi alasan perubahan.");

  if (formPayment.metode === "TRANSFER" || formPayment.metode === "QRIS") {
    if (!formPayment.bank)
      return toast.warning(`Mohon pilih Bank / Akun untuk ${formPayment.metode}.`);
  }

  isChangingPayment.value = true;
  try {
    await api.post("/invoices/change-payment", {
      nomor: selectedRow.value?.Nomor,
      metodeBaru: formPayment.metode,
      bank: formPayment.bank, // Kirim full object atau ambil kodenya di backend
      noRek: formPayment.noRek,
      alasan: formPayment.alasan,
    });

    toast.success("Metode pembayaran berhasil diubah.");
    isChangePaymentVisible.value = false;
    fetchMasterData();
  } catch (err) {
    // Casting error ke tipe AxiosError agar properti response dikenali
    const error = err as AxiosError<{ message?: string }>;

    toast.error(error.response?.data?.message || "Gagal mengubah pembayaran.");
  } finally {
    isChangingPayment.value = false;
  }
};

const printData = (type: "invoice" | "sj") => {
  if (!isSingleSelected.value) return;

  const item = selected.value[0];
  let routeName = "";

  if (type === "invoice") {
    routeName = "InvoicePrint"; // Nama route untuk cetak Invoice A4
  } else if (type === "sj") {
    routeName = "CetakInvoiceAsSJ";
  }

  const url = router.resolve({
    name: routeName,
    params: { nomor: item.Nomor },
  }).href;

  window.open(url, "_blank");
};

const openPrintOptions = () => {
  if (!isSingleSelected.value) return;
  isPrintOptionVisible.value = true;
};

const formatHpToWa = (hp: string) => {
  if (!hp) return "";
  let sanitizedHp = hp.replace(/[^0-9]/g, ""); // Hapus semua selain angka
  if (sanitizedHp.startsWith("0")) {
    sanitizedHp = "62" + sanitizedHp.substring(1); // Ganti 0 di depan dengan 62
  }
  return sanitizedHp;
};

const handlePrintSelection = async (type: "a4" | "kasir" | "wa") => {
  const nomor = selectedRow.value?.Nomor;
  const item = selectedRow.value;

  if (!nomor || !item) return;

  // Tutup pilihan modal awal
  isPrintOptionVisible.value = false;

  // ===============================
  // PRINT KASIR (PAKAI MODAL PREVIEW)
  // ===============================
  if (type === "kasir") {
    selectedInvoice.value = nomor;
    isKasirPreviewVisible.value = true;
    return;
  }

  // ===============================
  // PRINT A4 (MASIH TAB BARU)
  // ===============================
  if (type === "a4") {
    const url = router.resolve({ name: "InvoicePrint", params: { nomor } }).href;
    window.open(url, "_blank");
    return;
  }

  // ===============================
  // WHATSAPP
  // ===============================
  if (type === "wa") {
    const memberHp = item.Hp;
    if (!memberHp) {
      return toast.error("No. HP Member tidak ada, tidak bisa kirim via WA.");
    }

    try {
      toast.info(`Mengirim struk ke ${memberHp}...`);
      const response = await api.post("/whatsapp/send-receipt", {
        nomor,
        hp: formatHpToWa(memberHp),
      });
      toast.success(response.data.message);
    } catch (error: unknown) {
      if (error instanceof Error) toast.error(error.message);
      else toast.error("Gagal mengirim struk via WhatsApp.");
    }
  }
};

const handleView = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].Nomor;

  router.push({
    name: "InvoiceEdit",
    params: { nomor },
    query: { mode: "view" }, // kirim flag ke halaman edit
  });
};

// 1. Helper Format Tanggal
// Ganti fungsi formatDateIndo dengan versi aman ini:
const formatDateIndo = (dateVal: string | number | Date | null | undefined): string => {
  if (!dateVal) return "";

  let date = new Date(dateVal);

  // [FIX] Handle format DD/MM/YYYY manual
  if (isNaN(date.getTime()) && typeof dateVal === "string") {
    const parts = dateVal.split("/");
    if (parts.length === 3) {
      // Ubah DD/MM/YYYY -> YYYY-MM-DD
      date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
  }

  // Jika masih invalid, kembalikan string aslinya
  if (isNaN(date.getTime())) return String(dateVal);

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

// 2. Fungsi Export Data
const exportData = async (type: "header" | "detail") => {
  const exportParams = {
    ...filters, // startDate, endDate, cabang, status
    search: filterSearchValue.value,
    columnFilters: JSON.stringify(columnFilters.value),
  };

  if (type === "header") {
    try {
      toast.info("Sedang mendownload Header...");

      // [FIX] Panggil API Backend khusus Export Header
      // Pastikan backend sudah memiliki route '/invoices/export-header'
      const response = await api.get("/invoices/export-header", {
        params: exportParams,
      });

      if (response.data.length === 0) {
        toast.warning("Tidak ada data header untuk diekspor.");
        return;
      }

      // Format tanggal di frontend (Optional, jika backend sudah kirim YYYY-MM-DD)
      const formattedHeader = (response.data as ExportHeaderItem[]).map(
        (item: ExportHeaderItem) => ({
          ...item,
          // Gunakan formatDateIndo yang sudah diperbaiki
          // TypeScript sekarang tahu properti ini mungkin ada atau undefined
          Tanggal: item.Tanggal ? formatDateIndo(item.Tanggal) : "",
          "Tgl SO": item["Tgl SO"] ? formatDateIndo(item["Tgl SO"]) : "",
          "Jatuh Tempo": item["Jatuh Tempo"] ? formatDateIndo(item["Jatuh Tempo"]) : "",
        })
      );

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);

      // Auto Width Column (Biar rapi)
      const wscols = Object.keys(formattedHeader[0]).map(() => ({ wch: 20 }));
      worksheet["!cols"] = wscols;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Invoice Header");
      XLSX.writeFile(workbook, "Export_Invoice_Header.xlsx");

      toast.success("Header berhasil diekspor.");
    } catch (error) {
      console.error(error);
      toast.error("Gagal export header.");
    }
  } else if (type === "detail") {
    try {
      toast.info("Mengambil data detail...");
      // Gunakan Generic Type pada api.get
      const response = await api.get<InvoiceExportRow[]>("/invoices/export-details", {
        params: exportParams,
      });

      if (response.data.length === 0) {
        toast.warning("Tidak ada data detail.");
        return;
      }

      // Format Tanggal Detail
      const formattedDetail = response.data.map((row: InvoiceExportRow) => ({
        ...row,
        // TypeScript valid karena InvoiceExportRow punya field Tanggal?
        Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal) : "",
      }));

      // Opsional: Gunakan Custom Header & Formatting seperti Penawaran (Lebih Rapi)
      const title = "LAPORAN DETAIL INVOICE";
      const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(
        filters.endDate
      )}`;
      const tableHeaders = Object.keys(formattedDetail[0]);

      // Gunakan Record<string, unknown> untuk Object.values agar aman
      const tableData = formattedDetail.map((row) => Object.values(row as Record<string, unknown>));

      const excelData = [[title], [dateRange], [], tableHeaders, ...tableData];

      const worksheet = XLSX.utils.aoa_to_sheet(excelData);

      // Merge Judul
      const merge = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } },
      ];
      worksheet["!merges"] = merge;

      // Auto Width
      const colWidths = tableHeaders.map((header) => ({ wch: header.length + 5 }));
      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Invoice Detail");
      XLSX.writeFile(workbook, "Export_Invoice_Detail.xlsx");
      toast.success("Detail berhasil diekspor.");
    } catch (error) {
      // Type Guard untuk Error
      let message = "Gagal mengekspor data detail.";
      if (error instanceof Error) message += ` ${error.message}`;
      toast.error(message);
      console.error(error);
    }
  }
};

const openCustomFilter = (key: string) => {
  customFilter.key = key;
  customFilter.operator = "=";
  customFilter.value = "";
  customFilterDialog.value = true;
};

const applyCustomFilter = () => {
  columnFilters.value[customFilter.key] = {
    type: "custom",
    operator: customFilter.operator,
    value: customFilter.value,
  };
  customFilterDialog.value = false;
};

const uniqueValues = (key: string): FilterValue[] => {
  const set = new Set(
    masterData.value
      .map((r) => r[key])
      .filter((v): v is FilterValue => v !== undefined && v !== null && v !== "")
  );

  return Array.from(set).sort();
};

const isFilterActive = (key: string) => {
  return Boolean(columnFilters.value[key]);
};

const filterType = (key: string): string => {
  if (!columnFilters.value[key]) return "";
  const f = columnFilters.value[key];
  if (f.type === "multi") return "multi";
  if (f.type === "custom") return "custom";
  return "simple";
};

const clearColumnFilter = (key: string) => {
  delete columnFilters.value[key];
};

const toggleMultiSelectValue = (key: string, value: FilterValue) => {
  const f = columnFilters.value[key];

  if (!f || f.type !== "multi") {
    columnFilters.value[key] = { type: "multi", values: [value] };
    return;
  }

  const arr = f.values || [];

  if (arr.includes(value)) {
    f.values = arr.filter((v) => v !== value);
    if (f.values.length === 0) delete columnFilters.value[key];
  } else {
    f.values = [...arr, value];
  }
};

const resetAllFilters = () => {
  columnFilters.value = {};
  localStorage.removeItem(LS_FILTER_KEY);

  // Bersihkan teks pencarian
  filterSearchValue.value = "";

  // Bersihkan session storage khusus invoice
  sessionStorage.removeItem(SESSION_STATE_KEY);

  // Fetch ulang data bersih
  page.value = 1;
  fetchMasterData();
};

const formatFilterValue = (key: string, val: string | number | undefined | null): string => {
  // Kolom tanggal → format dd/MM/yyyy
  if (["tanggal", "tempo", "dateModified"].includes(key)) {
    if (!val) return "-";
    if (typeof val === "string" || typeof val === "number") {
      try {
        return format(new Date(val), "dd/MM/yyyy");
      } catch {
        return String(val);
      }
    }
  }

  // Default fallback
  return String(val ?? "-");
};

onMounted(async () => {
  // 1. Coba baca state pencarian dari Session Storage terlebih dahulu
  const savedState = sessionStorage.getItem(SESSION_STATE_KEY);

  if (savedState) {
    try {
      const parsedState = JSON.parse(savedState);

      // Timpa filters dengan data dari memory browser
      if (parsedState.filters) {
        Object.assign(filters, parsedState.filters);
      }

      // Kembalikan juga kolom pencarian dan teks pencariannya
      if (parsedState.selectedFilterField) {
        selectedFilterField.value = parsedState.selectedFilterField;
      }
      if (parsedState.filterSearchValue) {
        filterSearchValue.value = parsedState.filterSearchValue;
      }
    } catch (e) {
      console.error("Gagal membaca state filter dari sessionStorage", e);
    }
  } else {
    // 2. Jika tidak ada di memory (baru buka pertama kali), gunakan Query URL (kode asli Anda)
    const queryStartDate = route.query.startDate as string;
    const queryEndDate = route.query.endDate as string;
    const queryStatus = route.query.status as string;

    if (queryStartDate && queryEndDate) {
      filters.startDate = queryStartDate;
      filters.endDate = queryEndDate;
    }
    if (queryStatus) {
      filters.status = queryStatus;
    }
  }

  await nextTick();
  if (isStoreUser.value) {
    if (!cashierSessionStore.session || cashierSessionStore.session.status === "CLOSED") {
      toast.warning("Laci Kasir belum dibuka. Silakan mulai shift terlebih dahulu.");
      cashierSessionStore.isStartModalVisible = true;
    }
  }

  await fetchCabangList();
  await fetchMasterData();

  isMounted.value = true;
});

const saveStateToSession = () => {
  const stateToSave = {
    filters: filters,
    selectedFilterField: selectedFilterField.value,
    filterSearchValue: filterSearchValue.value,
  };
  sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateToSave));
};

watch(
  columnFilters,
  (val) => {
    localStorage.setItem(LS_FILTER_KEY, JSON.stringify(val));
    page.value = 1;
    fetchMasterData();
  },
  { deep: true }
);

watch(
  filters,
  () => {
    saveStateToSession(); // Simpan setiap kali filter tanggal/cabang berubah

    if (!isMounted.value) return;
    if (filterSearchValue.value) return;

    page.value = 1; // Reset halaman ke 1 saat filter berubah
    fetchMasterData();
  },
  { deep: true }
);

watch([filterSearchValue, selectedFilterField], () => {
  saveStateToSession(); // Simpan setiap kali teks pencarian berubah

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (!isMounted.value) return;
    page.value = 1;
    fetchMasterData();
  }, 800);
});

onBeforeRouteLeave((to, from, next) => {
  // Cek apakah halaman tujuan MASIH berhubungan dengan modul Invoice.
  // Sesuaikan string '/invoice' di bawah dengan URL modul form tambah/ubah Anda.
  // Contoh: '/transaksi/penjualan/invoice/new' maka stringnya adalah '/invoice'.
  const isRelatedPage = to.path.includes("/invoice");

  if (!isRelatedPage) {
    // Jika pergi ke menu lain (misal: /dashboard atau /surat-pesanan), bersihkan memori!
    sessionStorage.removeItem(SESSION_STATE_KEY);
  }

  next(); // Lanjutkan perpindahan halaman
});
</script>

<template>
  <PageLayout title="Invoice" icon="mdi-receipt-text">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        prepend-icon="mdi-plus"
        color="primary"
        @click="handleNew"
      >
        Baru
      </v-btn>

      <v-menu offset-y v-if="authStore.can(MENU_ID, 'edit') && !isLockedInvoice">
        <template v-slot:activator="{ props }">
          <v-btn
            v-bind="props"
            size="small"
            prepend-icon="mdi-pencil"
            :disabled="!isSingleSelected"
          >
            Ubah
            <v-icon end icon="mdi-chevron-down"></v-icon>
          </v-btn>
        </template>
        <v-list density="compact">
          <!-- <v-list-item @click="handleEdit">
            <template #prepend><v-icon size="small" icon="mdi-file-document-edit-outline" class="mr-2" /></template>
            <v-list-item-title>Ubah Data Barang</v-list-item-title>
          </v-list-item> -->

          <v-list-item @click="openChangePaymentModal">
            <template #prepend
              ><v-icon size="small" icon="mdi-cash-sync" class="mr-2 text-purple"
            /></template>
            <v-list-item-title class="text-purple">Ubah Pembayaran</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <!-- Jika invoice SUDAH locked → tombol Lihat -->
      <v-btn
        v-if="authStore.can(MENU_ID, 'view') && isLockedInvoice"
        size="small"
        prepend-icon="mdi-eye"
        color="grey"
        :disabled="!isSingleSelected"
        @click="handleView"
      >
        Lihat
      </v-btn>

      <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
                @click="handleDelete">Hapus</v-btn> -->
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        color="green"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-printer"
        @click="openPrintOptions"
      >
        Cetak
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        color="cyan"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-truck-delivery-outline"
        @click="printData('sj')"
      >
        Cetak SJ
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')">
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
        />
        <v-select
          label="Cabang"
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 200px"
        />
        <v-chip
          v-if="filters.status"
          class="ms-4"
          color="primary"
          variant="tonal"
          closable
          @click:close="filters.status = null"
        >
          Filter Aktif: {{ filters.status === "sisa_piutang" ? "Sisa Piutang" : filters.status }}
        </v-chip>
        <div class="d-flex align-center ga-2 ms-4">
          <v-select
            v-model="selectedFilterField"
            :items="filterOptions"
            label="Filter Berdasarkan"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 200px"
          />

          <v-text-field
            v-model="filterSearchValue"
            label="Cari..."
            density="compact"
            hide-details
            variant="outlined"
            clearable
            prepend-inner-icon="mdi-magnify"
            class="search-field"
          />
        </div>
        <v-btn
          color="error"
          variant="tonal"
          prepend-icon="mdi-filter-off"
          class="btn-detail reset-filter-btn ms-2"
          @click="resetAllFilters"
        >
          Reset Filter
        </v-btn>
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="yellow-darken-3" icon="mdi-square-rounded" size="small"></v-icon> Stok
          Minus <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Lunas
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="masterData"
          :loading="loading"
          :server="true"
          :items-length="totalItems"
          @update:options="fetchMasterData"
          item-value="Nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
          :item-props="(item: InvoiceItem) => ({ class: getRowClass(item) })"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <!-- HEADER TANPA FILTER (select & expand) -->
                <th
                  v-if="noFilterColumns.includes(header.key)"
                  :style="{
                    width: (header.width || 100) + 'px',
                    minWidth: (header.width || 100) + 'px',
                    maxWidth: (header.width || 100) + 'px',
                    boxSizing: 'border-box',
                  }"
                  class="resizable-header"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)"></div>
                </th>

                <!-- HEADER NORMAL + EXCEL STYLE FILTER -->
                <th
                  v-else
                  :style="{
                    width: (header.width || 100) + 'px',
                    minWidth: (header.width || 100) + 'px',
                    maxWidth: (header.width || 100) + 'px',
                    boxSizing: 'border-box',
                  }"
                  class="resizable-header"
                  :class="{
                    'text-center': header.align === 'center',
                    'text-end': header.align === 'end',
                  }"
                  @click="toggleSort(header)"
                >
                  <div class="header-content">
                    <!-- Judul kolom -->
                    <span>{{ header.title }}</span>

                    <!-- SORT ICON -->
                    <v-icon v-if="isSorted(header)" size="14" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>

                    <!-- FILTER ICON -->
                    <v-menu location="bottom start">
                      <template #activator="{ props }">
                        <v-icon
                          size="16"
                          v-bind="props"
                          @click.stop
                          :color="isFilterActive(header.key) ? 'blue' : ''"
                          :icon="
                            filterType(header.key) === 'custom'
                              ? 'mdi-filter-cog'
                              : filterType(header.key) === 'multi'
                              ? 'mdi-filter-multiple'
                              : 'mdi-filter-variant'
                          "
                          class="ms-1"
                        />
                      </template>

                      <v-list class="filter-menu" style="min-width: 200px">
                        <!-- SELECT ALL -->
                        <v-list-item @click.stop="clearColumnFilter(header.key)">
                          <v-list-item-title>(Select All)</v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <!-- MULTI-SELECT VALUES -->
                        <v-list-item
                          v-for="value in uniqueValues(header.key)"
                          :key="value"
                          @click.stop="toggleMultiSelectValue(header.key, value as FilterValue)"
                        >
                          <template #prepend>
                            <v-checkbox
                              :model-value="
                                columnFilters[header.key]?.type === 'multi' &&
                                columnFilters[header.key]?.values?.includes(value)
                              "
                              density="compact"
                              @click.stop="toggleMultiSelectValue(header.key, value)"
                            />
                          </template>

                          <v-list-item-title>
                            {{ formatFilterValue(header.key, value) }}
                          </v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <!-- CUSTOM FILTER -->
                        <v-list-item @click.stop="openCustomFilter(header.key)">
                          <v-list-item-title class="custom-filter-item">
                            (Custom Filter…)
                          </v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>

                  <!-- RESIZER -->
                  <div
                    class="resizer"
                    @mousedown.stop="onResizeStart($event, header)"
                    @click.stop
                  ></div>
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn
              icon="mdi-chevron-down"
              :class="{ 'rotate-180': isExpanded(internalItem) }"
              size="x-small"
              variant="text"
              @click.stop="toggleExpand(internalItem)"
            />
          </template>

          <template
            v-for="header in (headers || []).filter((h) => h.key !== 'data-table-expand')"
            :key="header.key"
            #[`item.${header.key}`]="{ item }"
          >
            <td>
              <template
                v-if="
                  ['Created', 'LastPayment', 'TglTransfer', 'DateModified'].includes(header.key)
                "
              >
                {{ safeFormatDate(item[header.key], "dd/MM/yyyy HH:mm:ss") }}
              </template>

              <template v-else-if="['Tanggal', 'TglSO', 'TglSJ', 'Tempo'].includes(header.key)">
                {{ safeFormatDate(item[header.key], "dd/MM/yyyy") }}
              </template>

              <template v-else-if="header.key === 'Dis%'">
                <div class="d-flex align-center">
                  <v-chip
                    v-if="Number(item['Dis%']) > 0"
                    size="x-small"
                    color="primary"
                    variant="flat"
                    class="font-weight-bold mr-2"
                  >
                    {{ item["Dis%"] }}%
                  </v-chip>
                  <span v-if="Number(item.DiskonPromoNominal) > 0" class="font-weight-medium">
                    {{ formatRupiah(Number(item.DiskonPromoNominal)) }}
                  </span>
                  <span v-else-if="Number(item['Dis%']) === 0" class="text-grey-lighten-1">-</span>
                </div>
              </template>

              <template v-else-if="header.key === 'DiskonMapsPersen'">
                <div v-if="Number(item.DiskonMapsPersen) > 0" class="d-flex align-center">
                  <v-chip size="x-small" color="info" variant="flat" class="font-weight-bold mr-2">
                    {{ item.DiskonMapsPersen }}%
                  </v-chip>
                  <span class="font-weight-medium">{{
                    formatRupiah(Number(item.DiskonMapsNominal))
                  }}</span>
                </div>
                <span v-else class="text-grey-lighten-1">-</span>
              </template>

              <template
                v-else-if="
                  [
                    'BiayaPlatform',
                    'Diskon',
                    'Dp',
                    'Biayakirim',
                    'Nominal',
                    'Piutang',
                    'Bayar',
                    'SisaPiutang',
                    'RpVoucher',
                    'RpTransfer',
                    'RpRetur',
                    'RpTunai',
                  ].includes(header.key)
                "
              >
                {{ formatRupiah(Number(item[header.key])) }}
              </template>

              <template v-else-if="header.key === 'Marketplace'">
                <v-chip v-if="item.Marketplace" color="orange-darken-1" size="x-small" label>
                  {{ item.Marketplace }}
                </v-chip>
              </template>

              <template v-else-if="header.key === 'Posting'">
                <v-chip size="x-small" :color="item.Posting === 'SUDAH' ? 'green' : 'grey'">{{
                  item.Posting
                }}</v-chip>
              </template>

              <template v-else-if="header.key === 'Closing'">
                <div class="d-flex justify-center">
                  <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success" variant="flat"
                    >YA</v-chip
                  >
                  <v-chip
                    v-else-if="item.Closing === 'N'"
                    size="x-small"
                    color="grey-lighten-1"
                    variant="flat"
                    >TIDAK</v-chip
                  >
                  <span v-else>-</span>
                </div>
              </template>

              <template v-else-if="header.key === 'Minus'">
                <div class="d-flex justify-center">
                  <v-tooltip location="top" text="Stok Minus!">
                    <template v-slot:activator="{ props }">
                      <v-icon v-bind="props" v-if="item.Minus === 'Y'" color="error" size="small"
                        >mdi-alert-circle</v-icon
                      >
                    </template>
                  </v-tooltip>

                  <v-icon v-if="item.Minus === 'N'" color="success" size="small" title="Stok Aman"
                    >mdi-check-circle-outline</v-icon
                  >
                </div>
              </template>

              <template v-else-if="header.key === 'Prn'">
                <div class="d-flex justify-center">
                  <v-icon
                    v-if="item.Prn == 1 || item.Prn === 'Y'"
                    color="blue"
                    size="small"
                    title="Sudah Cetak"
                    >mdi-printer-check</v-icon
                  >

                  <v-icon
                    v-else-if="item.Prn == 0 || item.Prn === 'N'"
                    color="grey-lighten-2"
                    size="small"
                    title="Belum Cetak"
                    >mdi-printer-off</v-icon
                  >

                  <span v-else class="text-grey text-caption">-</span>
                </div>
              </template>

              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper shadow-sm">
                    <v-data-table
                      :headers="detailHeaders"
                      :items="details[item.Nomor] || []"
                      density="compact"
                      class="detail-table"
                      hide-default-footer
                      :items-per-page="-1"
                    >
                      <template #[`item.Harga`]="{ item: detailItem }">
                        <div class="harga-cell">
                          <template
                            v-if="detailItem.HargaAsli && detailItem.HargaAsli > detailItem.Harga"
                          >
                            <div
                              class="text-grey text-decoration-line-through"
                              style="font-size: 9px"
                            >
                              {{ formatRupiah(detailItem.HargaAsli) }}
                            </div>
                            <div class="font-weight-bold">{{ formatRupiah(detailItem.Harga) }}</div>
                          </template>
                          <template v-else>
                            <div>{{ formatRupiah(detailItem.Harga) }}</div>
                          </template>
                        </div>
                      </template>

                      <template #[`item.Total`]="{ value }">
                        <div class="text-end font-weight-bold">
                          {{ formatRupiah(value) }}
                        </div>
                      </template>

                      <template #bottom></template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
          <template #[`body.append`]>
            <tr class="sticky-footer bg-grey-lighten-4 font-weight-bold text-caption">
              <td class="select-column-spacer"></td>

              <template v-for="header in headers || []" :key="header.key">
                <td v-if="header.key === 'data-table-expand'" style="width: 50px"></td>

                <td v-else class="px-2 py-2 border-top" :class="`text-${header.align || 'start'}`">
                  <span
                    v-if="header.key === 'Nomor'"
                    class="text-grey-darken-3 text-body-2 font-weight-black pl-2"
                  >
                    GRAND TOTAL :
                  </span>

                  <span
                    v-else-if="header.key === 'Dis%'"
                    class="text-primary-darken-2 text-body-2 font-weight-black"
                  >
                    {{ totalDiskonPromo > 0 ? formatRupiah(totalDiskonPromo) : "&nbsp;" }}
                  </span>

                  <span
                    v-else-if="header.key === 'DiskonMapsPersen'"
                    class="text-info-darken-2 text-body-2 font-weight-black"
                  >
                    {{ totalDiskonMaps > 0 ? formatRupiah(totalDiskonMaps) : "&nbsp;" }}
                  </span>

                  <span
                    v-else-if="header.key === 'Diskon'"
                    class="text-blue-grey-darken-2 text-body-2 font-weight-black"
                  >
                    {{ formatRupiah(totalDiskon) }}
                  </span>

                  <span
                    v-else-if="header.key === 'Dp'"
                    class="text-cyan-darken-2 text-body-2 font-weight-black"
                  >
                    {{ formatRupiah(totalDp) }}
                  </span>

                  <span
                    v-else-if="header.key === 'Biayakirim'"
                    class="text-teal-darken-3 text-body-2 font-weight-black"
                  >
                    {{ formatRupiah(totalBiayaKirim) }}
                  </span>

                  <span
                    v-else-if="header.key === 'Nominal'"
                    class="text-primary text-body-2 font-weight-black"
                  >
                    {{ formatRupiah(totalNominal) }}
                  </span>

                  <span
                    v-else-if="header.key === 'Piutang'"
                    class="text-orange-darken-2 text-body-2 font-weight-black"
                  >
                    {{ formatRupiah(totalPiutang) }}
                  </span>

                  <span
                    v-else-if="header.key === 'Bayar'"
                    class="text-success text-body-2 font-weight-black"
                  >
                    {{ formatRupiah(totalBayar) }}
                  </span>

                  <span
                    v-else-if="header.key === 'SisaPiutang'"
                    class="text-red text-body-2 font-weight-black"
                  >
                    {{ formatRupiah(totalSisaPiutang) }}
                  </span>

                  <span
                    v-else-if="header.key === 'RpRetur'"
                    class="text-brown-darken-1 text-body-2 font-weight-black"
                  >
                    {{ formatRupiah(totalRpRetur) }}
                  </span>

                  <span v-else>&nbsp;</span>
                </td>
              </template>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <PrintOptionModal
      v-if="isPrintOptionVisible"
      :options="['a4', 'kasir', 'wa']"
      @close="isPrintOptionVisible = false"
      @select="handlePrintSelection"
    />
    <KasirPrintPreviewModal
      v-model="isKasirPreviewVisible"
      :nomorInvoice="selectedInvoice"
      @close="isKasirPreviewVisible = false"
    />

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-h6"> Custom Filter — {{ customFilter.key }} </v-card-title>

        <v-card-text>
          <v-select
            v-model="customFilter.operator"
            :items="[
              { title: ' = (sama dengan)', value: '=' },
              { title: ' ≠ (tidak sama)', value: '!=' },
              { title: ' > (lebih besar)', value: '>' },
              { title: ' ≥ (lebih besar sama)', value: '>=' },
              { title: ' < (lebih kecil)', value: '<' },
              { title: ' ≤ (lebih kecil sama)', value: '<=' },
              { title: ' contains', value: 'contains' },
              { title: ' starts with', value: 'starts' },
              { title: ' ends with', value: 'ends' },
            ]"
            label="Operator"
            density="compact"
          />

          <v-text-field v-model="customFilter.value" label="Value" density="compact" autofocus />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isChangePaymentVisible" max-width="500px" persistent>
      <v-card>
        <v-card-title class="bg-purple-darken-1 text-white text-subtitle-1">
          <v-icon start>mdi-cash-sync</v-icon> Ubah Metode Pembayaran
        </v-card-title>

        <v-card-text class="pt-4">
          <v-alert
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
            border="start"
            icon="mdi-alert"
          >
            <div class="text-caption">
              Aksi ini akan <b>mereset data setoran</b> lama dan membuat record baru.
            </div>
          </v-alert>

          <v-select
            v-model="formPayment.metode"
            label="Metode Pembayaran Baru"
            :items="['TUNAI', 'TRANSFER']"
            variant="outlined"
            density="compact"
            color="primary"
          ></v-select>

          <template v-if="formPayment.metode === 'TRANSFER'">
            <v-text-field
              :model-value="
                formPayment.bank ? `${formPayment.bank.nama} - ${formPayment.bank.kode}` : ''
              "
              label="Pilih Bank (Klik Disini/F1)"
              placeholder="Tekan F1 untuk cari..."
              variant="outlined"
              density="compact"
              readonly
              append-inner-icon="mdi-magnify"
              @click="isRekeningSearchVisible = true"
              @keydown.f1.prevent="isRekeningSearchVisible = true"
              :rules="[(v) => !!formPayment.bank || 'Bank wajib dipilih']"
            ></v-text-field>

            <v-text-field
              v-model="formPayment.noRek"
              label="Keterangan / No. Rek"
              variant="outlined"
              density="compact"
              placeholder="Contoh: 123xxx a.n Budi"
            ></v-text-field>
          </template>

          <v-textarea
            v-model="formPayment.alasan"
            label="Alasan Perubahan (Wajib)"
            rows="2"
            variant="outlined"
            density="compact"
            placeholder="Contoh: Salah input metode oleh sales"
            :rules="[(v) => !!v || 'Alasan wajib diisi']"
          ></v-textarea>
        </v-card-text>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="isChangePaymentVisible = false" :disabled="isChangingPayment"
            >Batal</v-btn
          >
          <v-btn
            color="primary"
            variant="flat"
            @click="submitChangePayment"
            :loading="isChangingPayment"
          >
            Simpan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <RekeningSearchModal
      v-if="isRekeningSearchVisible"
      :cabang="authStore.user?.cabang || 'K01'"
      @close="isRekeningSearchVisible = false"
      @selected="onRekeningSelected"
    />
  </PageLayout>
</template>

<style scoped>
.browse-content {
  display: flex;
  flex-direction: column;
  /* Hitung sisa tinggi: 100vh - (Tinggi Header/Navbar + Padding) */
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
  /* Sembunyikan scrollbar window utama */
}

.filter-section {
  flex-shrink: 0;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  /* CRITICAL: Agar flexbox mengizinkan anak elemen untuk scroll */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Sembunyikan scrollbar di wrapper ini */
}

.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  /* Pastikan area ini mengambil sisa tinggi */
  flex-grow: 1;
  height: 100% !important;

  /* Aktifkan scrollbar di SINI */
  overflow-x: auto !important;
  /* Scrollbar Horizontal */
  overflow-y: auto !important;
  /* Scrollbar Vertikal */

  /* Trik CSS agar scrollbar selalu terlihat (Opsional, tapi bagus) */
  scrollbar-width: thin;
}

.desktop-table :deep(tr.row-sisa-piutang > td) {
  background-color: rgba(var(--v-theme-error), 0.15) !important;
}

.desktop-table :deep(tr.row-sisa-piutang:hover > td) {
  background-color: rgba(var(--v-theme-error), 0.25) !important;
}

.desktop-table :deep(tr.row-stok-minus > td) {
  background-color: rgba(var(--v-theme-warning), 0.18) !important;
}

.desktop-table :deep(tr.row-stok-minus:hover > td) {
  background-color: rgba(var(--v-theme-warning), 0.28) !important;
}

.harga-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.2;
}

.promo-info {
  color: #d32f2f;
  font-size: 0.8rem;
  font-weight: 500;
}

.discount-info {
  color: #9e9e9e;
  font-size: 0.75rem;
}

.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  padding: 16px 16px 16px 64px;
  /* Padding sejajar setelah checkbox */
  width: calc(100vw - 110px);
  /* Batasi lebar agar tidak melebar ke kanan master */
  background-color: #f8f9fa;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  box-sizing: border-box;
}

/* Styling header tabel detail agar beda dikit (opsional) */
.detail-table :deep(thead tr th) {
  background-color: #f1f8ff !important;
  color: #0d47a1 !important;
  font-weight: 700 !important;
  height: 32px !important;
  font-size: 11px !important;
  position: sticky;
  top: 0;
  z-index: 5;
  text-transform: uppercase;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  background-color: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  /* --- FIX SCROLL INTERNAL --- */
  max-height: 350px;
  /* Batasi tinggi detail agar tidak mentok layar */
  overflow-y: auto;
  /* Aktifkan scrollbar vertikal ke-3 */
  overflow-x: hidden;
}

.detail-table :deep(tbody tr td) {
  height: 32px !important;
  font-size: 11px !important;
}

.resizable-header {
  position: relative;

  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;

  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;

  border-bottom: 2px solid rgb(var(--v-theme-primary)) !important;
  padding: 0 8px !important;

  user-select: none;
}

/* Konten Header (Teks) */
.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* Atau flex-start */
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Garis Penarik (Resizer Handle) */
.resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  /* Area klik selebar 5px */
  cursor: col-resize;
  /* Kursor berubah jadi panah kiri-kanan */
  z-index: 1;
}

.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid rgba(var(--v-theme-on-primary), 0.6);
}

/* === Excel-style Filter Menu === */

.filter-menu {
  padding: 6px 0 !important;
  font-size: 11px !important;
}

.filter-menu .v-list-item {
  min-height: 26px !important;
  padding: 2px 10px !important;
}

.filter-menu .v-list-item-title {
  font-size: 11px !important;
}

.filter-menu .v-list-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.12) !important;
}

.filter-menu .v-checkbox {
  margin-right: 6px !important;
}

.filter-menu .v-input--selection-controls__input {
  width: 16px !important;
  height: 16px !important;
}

.filter-menu .v-checkbox .v-selection-control {
  padding: 0 !important;
}

.filter-menu .custom-filter-item {
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
}

.filter-section .btn-detail {
  height: 36px !important;
  width: auto !important;
  min-width: 120px !important;
  padding: 0 16px !important;
  font-size: 0.875rem !important;
  text-transform: none !important;
  /* supaya tidak kapital semua */
}

/* khusus warna merah Reset Filter */
.reset-filter-btn {
  color: #d32f2f !important;
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}

/* [BARU] Sticky Footer Styles */
.desktop-table :deep(.v-table__wrapper) {
  /* Pastikan wrapper relative agar sticky bekerja terhadap container ini */
  position: relative;
  /* Pastikan height 100% agar scrollbar muncul di tabel, bukan di page */
  height: 100% !important;
  scrollbar-width: thin;
}

.sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 5;

  background-color: rgb(var(--v-theme-surface)) !important;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);

  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.35);
}

.sticky-footer td {
  background-color: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface));
  height: 48px !important;
  vertical-align: middle;
}

/* Spacer untuk kolom Checkbox Vuetify */
.select-column-spacer {
  background-color: rgb(var(--v-theme-surface)) !important;
  width: 48px;
  min-width: 48px;
  position: sticky;
  left: 0;
  z-index: 6;
}
</style>

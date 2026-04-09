<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import { useRouter, useRoute, onBeforeRouteLeave } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";

// Interface Header (Resize)
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

interface SoHeader {
  Nomor: string;
  Tanggal: string;
  Dateline: string;
  Status: string;
  StatusKirim: string;
  Aktif: string;
  AlasanClose: string;
  UserModified: string | null;
  DateModified: string | null;
  [key: string]: unknown;
}

interface SoDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  QtySO: number;
  QtyInvoice: number;
  BlmJadiInvoice: number;
  Nomor: string;
  Harga: number;
  TotalSO: number;
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

interface SoExportRow {
  Tanggal?: string | Date;
  [key: string]: unknown;
}

interface CabangOption {
  kode: string;
  nama: string;
}

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = "26";

// --- State ---
const list = ref<SoHeader[]>([]);
const details = ref<{ [key: string]: SoDetail[] }>({});
const isLoading = ref(true);
const selected = ref<SoHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const isMounted = ref(false);
const cabangList = ref<CabangOption[]>([]);
const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  // Logic: Jika KDC ? Default ALL : Default Cabang User
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  status: null as string | null, // Biarkan null agar defaultnya tampil semua status
});

const isCloseDialogVisible = ref(false);
const itemToClose = ref<SoHeader | null>(null);
const closeReason = ref("");

const filterOptions = ref([
  { title: "Nomor", value: "Nomor" },
  { title: "Penawaran", value: "Penawaran" },
  { title: "Nama Customer", value: "Nama" },
  { title: "Keterangan", value: "Keterangan" },
  { title: "Sales Counter", value: "SC" },
]);
const selectedFilterField = ref("Nama");
const filterSearchValue = ref("");

// --- Computed Properties ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const isSingleSelected = computed(() => selected.value.length === 1);

const filteredList = computed(() => {
  let data = [...list.value];

  // 1) FILTER HEADER
  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    // MULTI FILTER
    if (f.type === "multi" && f.values) {
      data = data.filter((row) => f.values!.includes(row[key] as string | number));
    }

    // CUSTOM FILTER
    if (f.type === "custom" && f.value !== undefined) {
      const target = String(f.value).toLowerCase();
      data = data.filter((row) => {
        const v = row[key];
        if (v === null || v === undefined) return false;

        const s = String(v).toLowerCase();
        switch (f.operator) {
          case "=":
            return s === target;
          case "!=":
            return s !== target;
          case ">":
            return Number(s) > Number(target);
          case ">=":
            return Number(s) >= Number(target);
          case "<":
            return Number(s) < Number(target);
          case "<=":
            return Number(s) <= Number(target);
          case "contains":
            return s.includes(target);
          case "starts":
            return s.startsWith(target);
          case "ends":
            return s.endsWith(target);
        }
      });
    }
  }

  // 2) SEARCH GLOBAL (INI YANG HILANG)
  if (filterSearchValue.value) {
    const key = selectedFilterField.value;
    data = data.filter((item) => {
      const v = item[key];
      return (
        v !== null &&
        v !== undefined &&
        String(v).toLowerCase().includes(filterSearchValue.value.toLowerCase())
      );
    });
  }

  return data;
});

const isUserKon = computed(() => authStore.user?.cabang === "KON");

// --- Header Definisi (Resize) ---
const headers = computed<DataTableHeader[]>(() => {
  const list = [
    { title: "", key: "data-table-expand", width: 50, fixed: true },
    { title: "Nomor", key: "Nomor", width: 180, fixed: true },
    { title: "Tanggal", key: "Tanggal", width: 120 },
    { title: "Dateline", key: "Dateline", width: 120 },
    { title: "Kd Customer", key: "kdcus", width: 120 },
    { title: "Nama Customer", key: "Nama", width: 250 },
  ];
  if (isUserKon.value) {
    // [FIX] Add new columns here
    list.push(
      { title: "No. Pesanan MP", key: "MpPesanan", width: 180 },
      { title: "No. Resi", key: "MpResi", width: 180 }
    );
  } else {
    list.push({ title: "Penawaran", key: "Penawaran", width: 180 });
  }
  list.push(
    { title: "TOP", key: "Top", width: 80 },
    { title: "Nominal", key: "Nominal", width: 150 },
    { title: "Diskon", key: "Diskon", width: 120 },
    { title: "DP", key: "Dp", width: 120 },
    { title: "Qty SO", key: "QtySO", width: 100 },
    { title: "Qty Inv", key: "QtyInv", width: 100 },
    { title: "Belum", key: "Belum", width: 150 },
    { title: "Status", key: "Status", width: 150 },
    { title: "SO DTF", key: "DipakaiDTF", width: 90 },
    { title: "Alasan Close", key: "AlasanClose", width: 250 },
    { title: "User Modified", key: "UserModified", width: 140 },
    { title: "Date Modified", key: "DateModified", width: 140 },
    { title: "Status Kirim", key: "StatusKirim", width: 150 },
    { title: "Alamat", key: "Alamat", width: 600 },
    { title: "Kota", key: "Kota", width: 150 },
    { title: "Level", key: "Level", width: 150 },
    { title: "Keterangan", key: "Keterangan", width: 300 },
    { title: "Aktif", key: "Aktif", width: 80 },
    { title: "Sales Counter", key: "SC", width: 150 }
  );

  return list;
});

const detailHeaders = [
  { title: "Nomor", key: "Nomor", width: "120px" },
  { title: "Kode", key: "Kode", width: "100px" },
  { title: "Barcode", key: "Barcode", width: "120px" },
  { title: "Nama Barang", key: "Nama", width: "200px" },
  { title: "Ukuran", key: "Ukuran", width: "70px" },
  { title: "Qty SO", key: "QtySO", align: "end", width: "80px" },
  { title: "Harga", key: "Harga", align: "end", width: "100px" },
  { title: "Total SO", key: "TotalSO", align: "end", width: "120px" },
  { title: "Qty Invoice", key: "QtyInvoice", align: "end", width: "100px" },
  { title: "Belum Jadi Inv", key: "BlmJadiInvoice", align: "end", width: "120px" },
] as const;

// --- Logic Filtering ---
const columnFilters = ref<Record<string, ColumnFilter>>({});

const customFilterDialog = ref(false);
const customFilter = reactive({
  key: "",
  operator: "=",
  value: "",
});

const uniqueValues = (key: string): Array<string | number> => {
  return Array.from(
    new Set(
      list.value
        .map((i) => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== "")
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
};

const formatFilterValue = (key: string, val: string | number) => {
  if (!val) return "-";

  if (["Tanggal", "Dateline", "DateModified"].includes(key)) {
    try {
      return format(parseISO(String(val)), "dd/MM/yyyy");
    } catch {
      return val;
    }
  }

  return val;
};

const filterType = (key: string) => columnFilters.value[key]?.type ?? "";

const isFilterActive = (key: string) => Boolean(columnFilters.value[key]);

const clearColumnFilter = (key: string) => {
  delete columnFilters.value[key];
};

// MULTI SELECT
const toggleMultiSelectValue = (key: string, value: string | number) => {
  const f = columnFilters.value[key];

  if (!f || f.type !== "multi") {
    columnFilters.value[key] = { type: "multi", values: [value] };
    return;
  }

  const arr = f.values ?? [];

  if (arr.includes(value)) {
    f.values = arr.filter((v) => v !== value);
    if (f.values.length === 0) delete columnFilters.value[key];
  } else {
    f.values = [...arr, value];
  }
};

// CUSTOM FILTER
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

// RESET
const resetAllFilters = () => {
  columnFilters.value = {};
};

// --- Logic Resize Column ---
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  e.preventDefault();
  e.stopPropagation();
  resizingColumn.value = column;
  startX.value = e.pageX;
  startWidth.value = typeof column.width === "number" ? column.width : 100;
  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", onResizeEnd);
  document.body.style.cursor = "col-resize";
};

const onResizeMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;
  const diff = e.pageX - startX.value;
  resizingColumn.value.width = Math.max(50, startWidth.value + diff);
};

const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", onResizeEnd);
  document.body.style.cursor = "";
};

// --- Logic Selected Row ---
const handleRowClick = (_event: Event, { item }: { item: SoHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/so/lookup/cabang");
    cabangList.value = response.data;

    // Tambahkan opsi 'Semua Cabang' jika user KDC
    if (authStore.user?.cabang === "KDC") {
      // [FIX] Hapus '(c: any)'. TypeScript otomatis tahu 'c' adalah CabangOption
      const hasAll = cabangList.value.some((c) => c.kode === "ALL");

      if (!hasAll) {
        cabangList.value.unshift({ kode: "ALL", nama: "Semua Cabang" });
      }
    }
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/so", {
      params: filters,
    });
    list.value = response.data;
  } catch {
    toast.error("Gagal memuat data Surat Pesanan.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: SoHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/so/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    expanded.value = expanded.value.filter((nomor) => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const openCloseDialog = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Status === "CLOSE" || item.Status === "DICLOSE") {
    toast.warning("SO ini sudah berstatus Close.");
    return;
  }
  itemToClose.value = item;
  closeReason.value = item.AlasanClose || "";
  isCloseDialogVisible.value = true;
};

const submitClose = async () => {
  const item = itemToClose.value;
  if (!item) return;

  if (!authStore.user) {
    toast.error("User tidak valid.");
    return;
  }

  try {
    await api.post("/so/close", {
      nomor: item.Nomor,
      alasan: closeReason.value,
      user: authStore.user.kode,
    });

    toast.success("SO berhasil ditutup.");
    isCloseDialogVisible.value = false;

    const itemInList = list.value.find((x) => x.Nomor === item.Nomor);
    if (itemInList) {
      itemInList.Status = "DICLOSE";
      itemInList.AlasanClose = closeReason.value;
    }

    selected.value = [];
  } catch (error: unknown) {
    const e = error as { response?: { data?: { message?: string } } };
    toast.error(e.response?.data?.message || "Gagal menutup SO.");
  }
};

const getRowTextColor = (item: SoHeader) => {
  const toNumber = (v: unknown): number => {
    if (typeof v === "number" && !isNaN(v)) return v;

    if (typeof v === "string") {
      const cleaned = v.replaceAll(".", "").replaceAll(",", ".");
      const parsed = Number(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }

    return 0;
  };

  const nominal = toNumber(item.Nominal);
  const dp = toNumber(item.Dp);

  // 1️⃣ PRIORITAS UTAMA — Lunas tapi belum invoice sama sekali
  if (
    item.Aktif === "Y" &&
    dp >= nominal &&
    Number(item.QtyInv || 0) === 0 &&
    item.Status !== "DICLOSE"
  ) {
    return "text-magenta font-weight-bold";
  }

  // 2️⃣ SO DTF tapi sudah 0 → normal
  if (item.DipakaiDTF === "Y" && item.Belum === 0) return "";

  // 3️⃣ SO DTF belum habis
  if (item.DipakaiDTF === "Y") return "text-brown-darken-2 font-weight-bold";

  // 4️⃣ Pasif
  if (item.Aktif === "N") return "text-grey";

  // 5️⃣ Status standar
  switch (item.Status) {
    case "OPEN":
      return "text-red font-weight-bold";
    case "PROSES":
      return item.StatusKirim === "SEBAGIAN"
        ? "text-purple font-weight-bold"
        : "text-blue font-weight-bold";
    case "JADI":
      return "text-green-darken-2 font-weight-bold";
    case "CLOSE":
      return "";
    case "DICLOSE":
      return "text-grey";
    default:
      return "";
  }
};

const getDiscountSplit = (item: SoHeader) => {
  const totalDisc = Number(item.Diskon) || 0;
  if (totalDisc === 0) return { base: 0, maps: 0 };

  const disc2 = Number(item.Disc2) || 0; // Diskon Maps
  if (disc2 === 0) return { base: totalDisc, maps: 0 };

  const nominal = Number(item.Nominal) || 0; // Grand Total
  const bkrm = Number(item.Bkrm) || 0;
  const ppn = Number(item.Ppn) || 0;

  // Rumus Aljabar Reverse Engineering:
  // 1. Cari Netto (Total Harga dikurangi Ongkir & PPN)
  const netto = (nominal - bkrm) / (1 + ppn / 100);

  // 2. Karena Maps dihitung SETELAH base diskon, nilai (Subtotal - Base) itu SAMA DENGAN (Netto + Maps)
  // Berkat keajaiban matematika, kita bisa langsung cari nominal Maps hanya dari Netto!
  let mapsDisc = netto / (100 / disc2 - 1);

  mapsDisc = Math.round(mapsDisc);
  let baseDisc = totalDisc - mapsDisc;

  // Safeguard jika rounding lari sedikit
  if (baseDisc < 0) {
    baseDisc = 0;
    mapsDisc = totalDisc;
  }

  return { base: baseDisc, maps: mapsDisc };
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Aktif === "N") {
    toast.warning("No. Pesanan tersebut pasif. Tidak bisa dicetak.");
    return;
  }
  const url = router.resolve({
    name: "Cetak Surat Pesanan",
    params: { nomor: item.Nomor },
  }).href;
  window.open(url, "_blank");
};

// 1. Helper Format Tanggal Indonesia
const formatDateIndo = (dateString: string | Date) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

// 2. Export Header (Update)
const exportHeaderData = () => {
  if (list.value.length === 0) {
    toast.warning("Tidak ada data header untuk diekspor.");
    return;
  }

  // Format tanggal pada data Header sebelum masuk Excel
  const formattedData = list.value.map((item: SoHeader) => ({
    ...item,
    // TypeScript sekarang tahu 'item' punya properti 'Tanggal'
    Tanggal: item.Tanggal ? formatDateIndo(item.Tanggal) : "",
  }));

  toast.info("Membuat file Excel Header...");
  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SO Header");
  XLSX.writeFile(workbook, "Export_SO_Header.xlsx");
  toast.success("File Header berhasil dibuat.");
};

// 3. Export Detail (Update)
const exportDetailData = async () => {
  const exportFilters = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    cabang: filters.cabang,
    status: filters.status, // Kirim status (misal: 'open')
    search: filterSearchValue.value, // Kirim search global jika perlu
  };

  toast.info("Mengambil data detail dari server...");
  try {
    // Pastikan type return axios sesuai
    const response = await api.get<SoExportRow[]>("/so/export-details", { params: exportFilters });

    // Perbaikan Date Format pada Data Detail
    const dataToExport = response.data.map((row: SoExportRow) => ({
      ...row,
      // TypeScript sekarang valid, karena SoExportRow mendefinisikan Tanggal?
      Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal) : "",
    }));

    if (dataToExport.length === 0) {
      toast.warning("Tidak ada data detail untuk diekspor.");
      return;
    }

    toast.info("Membuat file Excel Detail...");

    // Opsi A: Simple JSON to Sheet (Header otomatis dari Key Object)
    // const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Opsi B: Custom Header seperti Penawaran (Lebih Rapi)
    const title = "LAPORAN DETAIL SURAT PESANAN";
    const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(
      filters.endDate
    )}`;
    const tableHeaders = Object.keys(dataToExport[0]);
    const tableData = dataToExport.map((row) => Object.values(row as Record<string, unknown>));

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
    XLSX.utils.book_append_sheet(workbook, worksheet, "SO Detail");
    XLSX.writeFile(workbook, "Export_SO_Detail.xlsx");
    toast.success("File Detail berhasil dibuat.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data.");
  }
};

// Buat key unik untuk halaman ini agar tidak bentrok dengan halaman browse lain
const STORAGE_KEY = "so_browse_filters";

onMounted(async () => {
  if (hasViewPermission.value) {
    // =========================================================================
    // [PERBAIKAN BUG CACHE]
    // Paksa kembalikan cabang ke default user JIKA user BUKAN KDC.
    // Ini memastikan user toko tidak bisa 'mencuri' akses melihat cabang lain
    // hanya karena nyangkut dari sessionStorage user sebelumnya.
    // =========================================================================
    if (authStore.user?.cabang !== "KDC") {
      filters.cabang = authStore.user?.cabang || "";
    } else {
      // Jika KDC dan baru pertama kali buka, default ALL
      if (!filters.cabang) filters.cabang = "ALL";
    }

    // 1. Coba baca state filter dari Session Storage
    const savedFilters = sessionStorage.getItem(STORAGE_KEY);

    if (savedFilters) {
      const parsedFilters = JSON.parse(savedFilters);

      // [PERBAIKAN BUG CACHE]
      // Hanya izinkan 'menimpa' filter cabang dari storage JIKA user adalah KDC.
      // Kalau user Toko, cabang hasil parse dari storage dibuang (pakai yang sudah di-set di atas)
      if (authStore.user?.cabang !== "KDC") {
        delete parsedFilters.cabang;
      }

      // Timpa state 'filters' dengan data yang tersimpan
      Object.assign(filters, parsedFilters);

      // Jika Anda juga menyimpan filterSearchValue dan selectedFilterField
      if (parsedFilters.search) filterSearchValue.value = parsedFilters.search;
      if (parsedFilters.filterField) selectedFilterField.value = parsedFilters.filterField;
    } else {
      // Jika tidak ada (baru pertama kali buka), cek query params
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

    await fetchCabangList();
    await fetchData();
    isMounted.value = true;
  }
});

watch(
  filters,
  () => {
    // 2. Setiap kali user mengubah filter (tanggal, cabang, dll), simpan ke Session Storage
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...filters,
        search: filterSearchValue.value,
        filterField: selectedFilterField.value,
      })
    );

    if (isMounted.value && hasViewPermission.value) {
      fetchData();
    }
  },
  { deep: true }
);

// Watch khusus pencarian agar juga memicu save (Jika blm ada)
watch([filterSearchValue, selectedFilterField], () => {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...filters,
      search: filterSearchValue.value,
      filterField: selectedFilterField.value,
    })
  );
});

// Deteksi saat user meninggalkan halaman ini
onBeforeRouteLeave((to, from, next) => {
  // Cek apakah halaman tujuan MASIH berhubungan dengan modul SO.
  // Asumsi form tambah/ubah Anda ada di bawah '/transaksi/penjualan/surat-pesanan'
  const isRelatedPage = to.path.includes("/surat-pesanan");

  if (!isRelatedPage) {
    // Jika pergi ke menu lain (misal: /dashboard atau /invoice), bersihkan memori!
    sessionStorage.removeItem(STORAGE_KEY);
  }

  next(); // Lanjutkan perpindahan halaman
});
</script>

<template>
  <PageLayout title="Surat Pesanan" desktop-mode icon="mdi-file-document-multiple-outline">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/surat-pesanan/new')"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="router.push(`/transaksi/penjualan/surat-pesanan/ubah/${selected[0].Nomor}`)"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        color="green"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-printer"
        @click="printData"
        >Cetak</v-btn
      >
      <v-menu offset-y v-if="authStore.can(MENU_ID, 'view')">
        <template v-slot:activator="{ props }">
          <v-btn color="teal" size="small" prepend-icon="mdi-file-excel" v-bind="props">
            Export Data
          </v-btn>
        </template>

        <v-list density="compact">
          <v-list-item @click="exportHeaderData" value="header">
            <template v-slot:prepend>
              <v-icon icon="mdi-table-headers-eye" size="small" class="mr-2"></v-icon>
            </template>
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>

          <v-list-item @click="exportDetailData" value="detail">
            <template v-slot:prepend>
              <v-icon icon="mdi-file-document-multiple-outline" size="small" class="mr-2"></v-icon>
            </template>
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
      <v-divider vertical class="mx-2"></v-divider>
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!isSingleSelected"
        color="orange-darken-2"
        @click="openCloseDialog"
        >Close SO</v-btn
      >
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section px-2">
        <div class="d-flex align-center ga-1" style="flex-wrap: nowrap">
          <v-text-field
            v-model="filters.startDate"
            type="date"
            label="Dari"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 130px"
          />
          <v-text-field
            v-model="filters.endDate"
            type="date"
            label="S/D"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 130px"
          />
          <v-select
            v-model="filters.cabang"
            :items="cabangList"
            item-title="nama"
            item-value="kode"
            label="Cabang"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 150px"
          />
        </div>

        <v-divider vertical class="mx-1" />

        <div class="d-flex align-center ga-1">
          <v-select
            v-model="selectedFilterField"
            :items="filterOptions"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 140px"
          />
          <v-text-field
            v-model="filterSearchValue"
            label="Cari..."
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 180px"
            clearable
            prepend-inner-icon="mdi-magnify"
          />
        </div>

        <v-btn
          color="error"
          variant="tonal"
          size="small"
          icon="mdi-filter-off"
          class="ms-1"
          title="Reset Filter"
          @click="resetAllFilters"
        />

        <v-spacer />

        <div class="legend-group d-flex align-center ga-1" style="font-size: 10px">
          <div class="legend-item legend-open"><v-icon size="14">mdi-circle</v-icon> Open</div>
          <div class="legend-item legend-proc"><v-icon size="14">mdi-circle</v-icon> Proc</div>
          <div class="legend-item legend-part"><v-icon size="14">mdi-circle</v-icon> Part</div>
          <div class="legend-item legend-lunas"><v-icon size="14">mdi-circle</v-icon> Lunas</div>
          <div class="legend-item legend-jadi"><v-icon size="14">mdi-circle</v-icon> Jadi</div>
          <div class="legend-item legend-dtf"><v-icon size="14">mdi-circle</v-icon> DTF</div>
          <div class="legend-item legend-grey">
            <v-icon size="14">mdi-circle</v-icon> Pasif / Di-Close
          </div>
        </div>

        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="filteredList"
          :loading="isLoading"
          :item-class="getRowTextColor"
          item-value="Nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          show-expand
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <!-- ❌ Kolom tanpa filter -->
                <th
                  v-if="['data-table-expand', 'data-table-select'].includes(header.key)"
                  :style="{ width: header.width + 'px' }"
                  class="resizable-header"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
                </th>

                <!-- ✅ Kolom dengan filter -->
                <th
                  v-else
                  :style="{ width: header.width + 'px' }"
                  class="resizable-header"
                  @click="toggleSort(header)"
                >
                  <div class="header-content">
                    <!-- Nama kolom -->
                    <span>{{ header.title }}</span>

                    <!-- Sort icon -->
                    <v-icon v-if="isSorted(header)" size="14">{{ getSortIcon(header) }}</v-icon>

                    <!-- FILTER ICON -->
                    <v-menu location="bottom start">
                      <template #activator="{ props }">
                        <v-icon
                          v-bind="props"
                          size="16"
                          class="ms-1"
                          @click.stop
                          :color="isFilterActive(header.key) ? 'blue' : ''"
                          :icon="
                            filterType(header.key) === 'custom'
                              ? 'mdi-filter-cog'
                              : filterType(header.key) === 'multi'
                              ? 'mdi-filter-multiple'
                              : 'mdi-filter-variant'
                          "
                        />
                      </template>

                      <v-list class="filter-menu">
                        <v-list-item @click.stop="clearColumnFilter(header.key)">
                          <v-list-item-title>(Select All)</v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <!-- MULTI SELECT -->
                        <v-list-item
                          v-for="val in uniqueValues(header.key)"
                          :key="val"
                          @click.stop="toggleMultiSelectValue(header.key, val)"
                        >
                          <template #prepend>
                            <v-checkbox
                              density="compact"
                              :model-value="columnFilters[header.key]?.values?.includes(val)"
                            />
                          </template>
                          <v-list-item-title>
                            {{ formatFilterValue(header.key, val) }}
                          </v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <!-- CUSTOM FILTER -->
                        <v-list-item @click.stop="openCustomFilter(header.key)">
                          <v-list-item-title class="custom-filter-item"
                            >(Custom Filter…)</v-list-item-title
                          >
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>

                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
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
            v-for="header in headers.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td :class="getRowTextColor(item)">
              <template v-if="['Tanggal', 'Dateline'].includes(header.key)">
                {{
                  item[header.key]
                    ? format(parseISO(item[header.key] as string), "dd/MM/yyyy")
                    : "-"
                }}
              </template>

              <template v-else-if="header.key === 'Diskon'">
                <v-tooltip location="top" open-delay="200" content-class="bg-blue-grey-darken-4">
                  <template #activator="{ props }">
                    <span
                      v-bind="props"
                      :class="
                        item.Diskon > 0
                          ? 'cursor-pointer text-decoration-underline text-decoration-style-dashed'
                          : ''
                      "
                    >
                      {{ formatRupiah(Number(item.Diskon || 0)) }}
                    </span>
                  </template>

                  <div class="text-caption pa-2" v-if="item.Diskon > 0" style="min-width: 200px">
                    <div class="font-weight-black mb-2 text-yellow">RINCIAN KOMPONEN DISKON:</div>

                    <div
                      class="d-flex justify-space-between mb-1"
                      v-if="item.Promo && item.Promo.replace(/,?PRO-2026-003,?/g, '') !== ''"
                    >
                      <span>🎫 {{ item.Promo.replace(/,?PRO-2026-003,?/g, "") }}</span>
                      <span class="font-weight-bold text-green-accent-2 ms-3"
                        >- {{ formatRupiah(getDiscountSplit(item).base) }}</span
                      >
                    </div>

                    <div class="d-flex justify-space-between mb-1" v-if="item.Disc1 > 0">
                      <span>👤 Member ({{ item.Disc1 }}%)</span>
                      <span class="font-weight-bold text-green-accent-2 ms-3"
                        >- {{ formatRupiah(getDiscountSplit(item).base) }}</span
                      >
                    </div>

                    <div class="d-flex justify-space-between mb-1" v-if="item.Disc2 > 0">
                      <span>📍 G-Maps ({{ item.Disc2 }}%)</span>
                      <span class="font-weight-bold text-green-accent-2 ms-3"
                        >- {{ formatRupiah(getDiscountSplit(item).maps) }}</span
                      >
                    </div>

                    <div
                      class="d-flex justify-space-between mb-1"
                      v-if="!item.Promo && !item.Disc1 && !item.Disc2"
                    >
                      <span>📝 Manual / Otorisasi Khusus</span>
                      <span class="font-weight-bold text-green-accent-2 ms-3"
                        >- {{ formatRupiah(item.Diskon) }}</span
                      >
                    </div>

                    <v-divider class="my-1 border-opacity-50"></v-divider>
                    <div class="d-flex justify-space-between mt-1">
                      <span class="font-weight-bold">Total Diskon</span>
                      <span class="font-weight-black text-error"
                        >- {{ formatRupiah(item.Diskon) }}</span
                      >
                    </div>
                  </div>
                </v-tooltip>
              </template>

              <template
                v-else-if="['Nominal', 'Dp', 'QtySO', 'QtyInv', 'Belum'].includes(header.key)"
              >
                {{ formatRupiah(Number(item[header.key] || 0)) }}
              </template>
              <template v-else-if="header.key === 'StatusKirim'">
                <v-chip size="x-small" :color="item.StatusKirim === 'BELUM' ? 'orange' : 'indigo'">
                  {{ item.StatusKirim }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'UserModified'">
                {{ item.UserModified || "-" }}
              </template>
              <template v-else-if="header.key === 'DateModified'">
                {{
                  item.DateModified
                    ? format(parseISO(item.DateModified as string), "dd/MM/yyyy HH:mm")
                    : "-"
                }}
              </template>
              <template v-else-if="header.key === 'MpPesanan'">
                <span class="text-primary font-weight-bold" style="font-size: 11px">
                  {{ item.MpPesanan || "-" }}
                </span>
              </template>

              <template v-else-if="header.key === 'MpResi'">
                <div class="d-flex align-center">
                  <v-icon size="small" class="mr-1 text-grey" v-if="item.MpResi"
                    >mdi-barcode</v-icon
                  >
                  <span style="font-size: 11px">{{ item.MpResi || "-" }}</span>
                </div>
              </template>
              <template v-else-if="header.key === 'Aktif'">
                <v-chip size="x-small" :color="item.Aktif === 'Y' ? 'success' : 'grey'">
                  {{ item.Aktif === "Y" ? "Aktif" : "Pasif" }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'DipakaiDTF'">
                <v-chip
                  size="x-small"
                  :color="item.DipakaiDTF === 'Y' && item.Belum > 0 ? 'brown-darken-2' : 'grey'"
                  variant="tonal"
                >
                  {{ item.DipakaiDTF === "Y" && item.Belum > 0 ? "DTF" : "-" }}
                </v-chip>
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
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">
                      Memuat detail...
                    </div>
                    <v-data-table
                      v-else-if="details[item.Nomor]"
                      :headers="detailHeaders"
                      :items="details[item.Nomor]"
                      item-value="Kode"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.Nomor`]="{ item: detailItem }">{{
                        detailItem.Nomor
                      }}</template>
                      <template #[`item.Harga`]="{ item: detailItem }">{{
                        formatRupiah(Number(detailItem.Harga || 0))
                      }}</template>
                      <template #[`item.TotalSO`]="{ item: detailItem }">{{
                        formatRupiah(Number(detailItem.TotalSO || 0))
                      }}</template>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-2">
                      Tidak ada data detail untuk nomor ini.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">Isi Alasan Close SO</v-card-title>
        <v-card-text class="pa-4">
          <p class="text-caption mb-2">
            Anda akan menutup SO Nomor: <strong>{{ itemToClose?.Nomor }}</strong>
          </p>
          <v-textarea
            v-model="closeReason"
            label="Alasan"
            rows="3"
            variant="outlined"
            autofocus
          ></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="primary" @click="submitClose">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-h6"> Custom Filter — {{ customFilter.key }} </v-card-title>

        <v-card-text>
          <v-select
            v-model="customFilter.operator"
            :items="[
              { title: '= (sama dengan)', value: '=' },
              { title: '≠ (tidak sama)', value: '!=' },
              { title: '>', value: '>' },
              { title: '≥', value: '>=' },
              { title: '<', value: '<' },
              { title: '≤', value: '<=' },
              { title: 'contains', value: 'contains' },
              { title: 'starts with', value: 'starts' },
              { title: 'ends with', value: 'ends' },
            ]"
            density="compact"
          />

          <v-text-field v-model="customFilter.value" density="compact" autofocus />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Layout Full Height */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 12px;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section {
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 12px;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Table Style */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* Header Resize */
.resizable-header {
  position: relative;
  background-color: #e3f2fd !important;
  color: #0d47a1 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #1976d2 !important;
  padding: 0 8px !important;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header-content {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
}

.resizable-header.text-center .header-content {
  justify-content: center;
}

.resizable-header.text-end .header-content {
  justify-content: flex-end;
}

.resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 10;
}

.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid #1565c0;
}

/* Detail Sticky */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;

  display: flex;
  justify-content: flex-start;
  align-items: flex-start;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);

  padding: 16px 16px 16px 64px;
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 800px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

/* Pewarnaan Teks Baris (TD) */
:deep(td.text-red) {
  color: red !important;
}

:deep(td.text-blue) {
  color: blue !important;
}

:deep(td.text-purple) {
  color: purple !important;
}

:deep(td.text-green-darken-2) {
  color: #388e3c !important;
}

/* Green Darken 2 */
:deep(td.text-grey) {
  color: grey !important;
}

.state-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.legend-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.legend-item :deep(.v-icon) {
  opacity: 1 !important;
}

.legend-open :deep(.v-icon) {
  color: #d32f2f !important;
}

.legend-proc :deep(.v-icon) {
  color: #1976d2 !important;
}

.legend-part :deep(.v-icon) {
  color: #7b1fa2 !important;
}

.legend-lunas :deep(.v-icon) {
  color: #c51162 !important;
}

.legend-jadi :deep(.v-icon) {
  color: #2e7d32 !important;
}

.legend-dtf :deep(.v-icon) {
  color: #5d4037 !important;
}

:deep(td.text-magenta),
:deep(td.text-magenta *) {
  color: #c51162 !important;
  /* magenta cerah */
  font-weight: 700 !important;
}

:deep(td.text-brown-darken-2),
:deep(td.text-brown-darken-2 *) {
  color: #5d4037 !important;
  font-weight: 700 !important;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  color: #444;
  /* Pastikan teks legenda terbaca */
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
</style>

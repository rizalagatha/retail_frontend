<script setup lang="ts">
import { ref, onUnmounted, onMounted, computed, watch, reactive } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import { useRouter, useRoute, onBeforeRouteLeave } from "vue-router";
import ExcelJS from "exceljs";
import axios from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import AuthorizationModal from "@/components/modal/AuthorizationModal.vue";

// --- Interface Header (Wajib untuk Resize) ---
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

interface SoDtfHeader {
  Nomor: string;
  Tanggal: string;
  TglPengerjaan: string;
  NoSO: string;
  NoINV: string;
  AlasanClose: string;
  LHK: number;
  TotalTitik: number;
  TotalHarga: number;
  Close: string;
  UserModified: string;
  DateModified: string;
  [key: string]: unknown;
}
interface SoDtfDetail {
  Ukuran: string;
  Jumlah: number;
  NamaBarang: string;
}
interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}
interface BranchOption {
  kode: string;
  nama: string;
}

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = "35";

// --- State ---
const soDtfList = ref<SoDtfHeader[]>([]);
const details = ref<{ [key: string]: SoDtfDetail[] }>({});
const isLoading = ref(true);
const selected = ref<SoDtfHeader[]>([]);
const expanded = ref<SoDtfHeader[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const fetchTimeout = ref<number | undefined>(undefined);
const isMounted = ref(false);
const cabangList = ref<BranchOption[]>([]);

const filters = reactive({
  filterDateType: "dtf",
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  status: null as string | null,
});

const isCloseDialogVisible = ref(false);
const isAuthModalVisible = ref(false);
const authPayload = ref<{
  transaksi: string;
  keterangan: string;
  nominal: number;
}>({ transaksi: "", keterangan: "", nominal: 0 });
const pendingCloseReason = ref("");
const itemToClose = ref<SoDtfHeader | null>(null);
const closeReason = ref("");

const isConfirmDialogVisible = ref(false);
const confirmDialogText = ref("");
const itemToDelete = ref<SoDtfHeader | null>(null);

const filterOptions = ref([
  { title: "Nomor", value: "Nomor" },
  { title: "Status", value: "status" },
  { title: "Tanggal", value: "Tanggal" },
  { title: "Tgl Pengerjaan", value: "TglPengerjaan" },
  { title: "Dateline Cust", value: "DatelineCus" },
  { title: "Nama DTF", value: "NamaDTF" },
  { title: "Kd. Customer", value: "KdCus" },
  { title: "Nama Customer", value: "Customer" },
  { title: "Jml", value: "Jumlah" },
  { title: "Titik", value: "Titik" },
  { title: "Total Titik", value: "TotalTitik" },
  { title: "LHK", value: "LHK" },
  { title: "No. SO", value: "NoSO" },
  { title: "No. Invoice", value: "NoINV" },
  { title: "Sales", value: "Sales" },
  { title: "Bag. Desain", value: "BagDesain" },
  { title: "Kain", value: "Kain" },
  { title: "Finishing", value: "Finishing" },
  { title: "Workshop", value: "Workshop" },
  { title: "Keterangan", value: "Keterangan" },
  { title: "Alasan Close", value: "AlasanClose" },
  { title: "User", value: "Created" },
  { title: "Status Close", value: "Close" },
]);
const selectedFilterField = ref("Customer");
const filterSearchValue = ref("");

// --- Key Storage ---
const LS_FILTER_KEY = "sodtf_table_filters"; // Untuk columnFilters (Excel filter)
const SESSION_STATE_KEY = "sodtf_browse_state"; // Untuk global search & filter tanggal

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const isSingleSelected = computed(() => selected.value.length === 1);
const filteredSoDtfList = computed(() => {
  let data = [...soDtfList.value];

  // === 1) FILTER KOLOM (MULTI & CUSTOM) ===
  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];
    if (!f) continue;

    if (f.type === "multi" && f.values) {
      data = data.filter((row) => {
        const v = row[key];
        return typeof v === "string" || typeof v === "number" ? f.values!.includes(v) : false;
      });
    }

    if (f.type === "custom") {
      const filterValue = String(f.value).toLowerCase();

      data = data.filter((row) => {
        const val = row[key] == null ? "" : String(row[key]).toLowerCase();

        switch (f.operator) {
          case "=":
            return val === filterValue;
          case "!=":
            return val !== filterValue;
          case ">":
            return Number(val) > Number(filterValue);
          case ">=":
            return Number(val) >= Number(filterValue);
          case "<":
            return Number(val) < Number(filterValue);
          case "<=":
            return Number(val) <= Number(filterValue);
          case "contains":
            return val.includes(filterValue);
          case "starts":
            return val.startsWith(filterValue);
          case "ends":
            return val.endsWith(filterValue);
          default:
            return true;
        }
      });
    }
  }

  // === 2) QUICK SEARCH (HARUS PALING AKHIR, JANGAN RETURN LANGSUNG) ===
  if (filterSearchValue.value) {
    const key = selectedFilterField.value;
    const term = filterSearchValue.value.toLowerCase();

    data = data.filter((row) => {
      const value = row[key];
      return value != null ? String(value).toLowerCase().includes(term) : false;
    });
  }

  return data;
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "Nomor", width: 150, fixed: true },
  { title: "Kd. Customer", key: "KdCus", width: 120 },
  { title: "Nama Customer", key: "Customer", width: 250 },
  { title: "Status", key: "status", width: 150, sortable: false },
  { title: "Tanggal", key: "Tanggal", width: 100 },
  { title: "Tgl Pengerjaan", key: "TglPengerjaan", width: 120 },
  { title: "Dateline Cust", key: "DatelineCus", width: 120 },
  { title: "Nama DTF", key: "NamaDTF", width: 200 },
  { title: "Jml", key: "Jumlah", align: "end", width: 70 },
  { title: "Titik", key: "Titik", align: "end", width: 70 },
  { title: "Total Titik", key: "TotalTitik", align: "end", width: 90 },
  { title: "Total Harga", key: "TotalHarga", align: "end", width: 120 },
  { title: "LHK", key: "LHK", align: "center", width: 70 },
  { title: "No. SO", key: "NoSO", width: 150 },
  { title: "No. Invoice", key: "NoINV", width: 150 },
  { title: "Sales", key: "Sales", width: 150 },
  { title: "Bag. Desain", key: "BagDesain", width: 150 },
  { title: "Kain", key: "Kain", width: 150 },
  { title: "Finishing", key: "Finishing", width: 150 },
  { title: "Workshop", key: "Workshop", width: 150 },
  { title: "Keterangan", key: "Keterangan", width: 250 },
  { title: "Alasan Close", key: "AlasanClose", width: 250 },
  { title: "User", key: "Created", width: 120 },
  { title: "User Modified", key: "UserModified", width: 150 },
  { title: "Date Modified", key: "DateModified", width: 160 },
  { title: "Status Close", key: "Close", align: "center", width: 120 },
]);

// --- Logic Filters ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({
  key: "",
  operator: "=",
  value: "",
});

const formatFilterValue = (key: string, val: string | number | null | undefined): string => {
  if (["Tanggal", "TglPengerjaan", "DatelineCus", "DateModified"].includes(key)) {
    if (!val) return "-";
    try {
      return format(new Date(val), "dd/MM/yyyy");
    } catch {
      return String(val);
    }
  }
  return String(val ?? "");
};

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

const applyCustomFilter = () => {
  columnFilters.value[customFilter.key] = {
    type: "custom",
    operator: customFilter.operator,
    value: customFilter.value,
  };
  customFilterDialog.value = false;
};

const resetAllFilters = () => {
  columnFilters.value = {};
  localStorage.removeItem(LS_FILTER_KEY);

  // Bersihkan teks pencarian dan Session Storage
  filterSearchValue.value = "";
  sessionStorage.removeItem(SESSION_STATE_KEY);

  // Reset URL jika ada query params
  if (route.query.status || route.query.startDate) {
    router.replace({ query: {} });
  }
};

const isFilterActive = (key: string): boolean => {
  return Boolean(columnFilters.value[key]);
};

const filterType = (key: string): string => {
  if (!columnFilters.value[key]) return "";
  return columnFilters.value[key].type;
};

const clearColumnFilter = (key: string) => {
  delete columnFilters.value[key];
};

const uniqueValues = (key: string): (string | number)[] => {
  const set = new Set(
    soDtfList.value
      .map((item) => item[key as keyof SoDtfHeader])
      .filter((v) => v !== null && v !== undefined && v !== "")
  );
  return Array.from(set).sort() as (string | number)[];
};

const openCustomFilter = (key: string) => {
  customFilter.key = key;
  customFilter.operator = "=";
  customFilter.value = "";
  customFilterDialog.value = true;
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
const handleRowClick = (_event: Event, { item }: { item: SoDtfHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/warehouses/so-dtf-branches", {
      params: { userCabang: authStore.user?.cabang },
    });

    const userCabang = authStore.user?.cabang || "";

    if (userCabang === "K06") {
      // [FIX] Jangan di-filter keluar, biarkan response.data utuh agar K06 tetap ada
      cabangList.value = [
        { kode: "ALL", nama: "SEMUA CABANG LUAR" }, // Default: Filter eksternal
        ...response.data,
      ];
    } else if (userCabang === "KDC") {
      cabangList.value = [{ kode: "ALL", nama: "SEMUA CABANG" }, ...response.data];
    } else {
      cabangList.value = response.data;
    }
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  if (!filters.startDate || !filters.endDate) return;
  isLoading.value = true;
  try {
    const response = await api.get("/so-dtf", { params: filters });
    // Langsung tampung data dari API apa adanya
    soDtfList.value = response.data;
  } catch {
    toast.error("Gagal memuat data SO DTF.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: SoDtfHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomor = itemToLoad.Nomor;
  loadingDetails.value.add(nomor);
  try {
    const response = await api.get(`/so-dtf/${nomor}`);
    details.value[nomor] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomor}`);
    expanded.value = expanded.value.filter((item) => item.Nomor !== nomor);
  } finally {
    loadingDetails.value.delete(nomor);
  }
};

const getRowTextColor = (item: SoDtfHeader) => {
  const isOwner = item.Nomor.startsWith(authStore.user?.cabang || "");

  // Jika ini barang titipan workshop dari cabang lain
  if (!isOwner && authStore.user?.cabang === "K06") {
    return "text-deep-orange-darken-4 font-weight-bold";
  }

  if (!item.NoSO && !item.NoINV) return "text-red font-weight-bold";
  if (item.NoSO && !item.NoINV) return "text-blue font-weight-bold";
  return "";
};

const getLhkClass = (item: SoDtfHeader) => {
  if (item.LHK === 0) return "lhk-zero";
  if (item.LHK > 0 && item.LHK < item.TotalTitik) return "lhk-progress";
  return "lhk-normal";
};

const openCloseDialog = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.NoINV) {
    toast.warning("Sudah dibuat Invoice, tidak bisa di-close.");
    return;
  }
  itemToClose.value = item;
  closeReason.value = item.AlasanClose || "";
  isCloseDialogVisible.value = true;
};

// submitCloseSo sekarang hanya buka auth modal
const submitCloseSo = async () => {
  if (!itemToClose.value) return;

  pendingCloseReason.value = closeReason.value;
  isCloseDialogVisible.value = false;

  authPayload.value = {
    transaksi: itemToClose.value.Nomor,
    keterangan: `Close SO DTF: ${itemToClose.value.Nomor}\nAlasan: ${closeReason.value}`,
    nominal: itemToClose.value.TotalHarga ?? 0,
  };
  isAuthModalVisible.value = true;
};

// Dipanggil setelah auth APPROVED
const doCloseSoDtf = async ({ authNomor }: { authNomor: string; approver: string }) => {
  if (!itemToClose.value) return;
  isAuthModalVisible.value = false;
  try {
    await api.post("/so-dtf/close", {
      nomor: itemToClose.value.Nomor,
      alasan: pendingCloseReason.value,
      user: authStore.user?.kode,
      authNomor,
    });
    toast.success("SO DTF berhasil ditutup.");
    fetchData();
    selected.value = [];
    itemToClose.value = null;
  } catch {
    toast.error("Gagal menutup SO DTF.");
  }
};

const onAuthCancelled = () => {
  isAuthModalVisible.value = false;
  // Kembalikan dialog alasan supaya user bisa ubah atau batalkan
  isCloseDialogVisible.value = true;
};

const handleEdit = () => {
  if (!isSingleSelected.value) return;

  const selectedItem = selected.value[0];

  // [BARU] Validasi agar SO yang sudah masuk LHK tidak bisa diedit
  if (Number(selectedItem.LHK) > 0) {
    toast.error(`SO DTF ${selectedItem.Nomor} sudah memiliki data LHK. Tidak bisa diedit.`);
    return;
  }

  // Jika lolos validasi, arahkan ke halaman ubah
  const isReadOnly = selectedItem.NoINV !== ""; // Contoh logic readonly jika sudah invoice
  router.push({
    path: `/transaksi/penjualan/dtf/so-dtf/ubah/${selectedItem.Nomor}`,
    query: { readonly: isReadOnly ? "true" : "false" },
  });
};

// const showDeleteConfirmation = () => {
//   if (!isSingleSelected.value) return;
//   const item = selected.value[0];
//   if (item.NoSO) {
//     toast.warning('Sudah dibuat SO, tidak bisa dihapus.');
//     return;
//   }
//   if (item.NoINV) {
//     toast.warning('Sudah dibuat Invoice, tidak bisa dihapus.');
//     return;
//   }
//   if (item.Close === 'Y') {
//     toast.warning('Transaksi sudah ditutup, tidak bisa dihapus.');
//     return;
//   }
//   itemToDelete.value = item;
//   confirmDialogText.value = `Anda yakin ingin menghapus SO DTF Nomor: ${item.Nomor}?`;
//   isConfirmDialogVisible.value = true;
// };

const executeDelete = async () => {
  if (!itemToDelete.value) return;
  try {
    await api.delete(`/so-dtf/${itemToDelete.value.Nomor}`);
    toast.success(`SO DTF ${itemToDelete.value.Nomor} berhasil dihapus.`);
    fetchData();
    selected.value = [];
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal menghapus data.");
    } else {
      toast.error("Terjadi kesalahan.");
    }
  } finally {
    isConfirmDialogVisible.value = false;
    itemToDelete.value = null;
  }
};

const exportData = async (type: "header" | "detail") => {
  const targetData = filteredSoDtfList.value;
  if (targetData.length === 0) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }

  toast.info(`Menyiapkan export ${type}...`);

  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

    // ── Helper styles ──────────────────────────────────────
    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    const borderMedium: Partial<ExcelJS.Borders> = {
      top: { style: "medium" },
      left: { style: "thin" },
      bottom: { style: "medium" },
      right: { style: "thin" },
    };

    const applyHeader = (cell: ExcelJS.Cell, bg = "FFE3F2FD") => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    };

    const applyData = (
      cell: ExcelJS.Cell,
      align: ExcelJS.Alignment["horizontal"] = "left",
      rowBg?: string
    ) => {
      cell.border = borderThin;
      cell.alignment = { horizontal: align, vertical: "middle" };
      if (rowBg) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
      }
    };

    // ══════════════════════════════════════════════════════
    // EXPORT HEADER
    // ══════════════════════════════════════════════════════
    if (type === "header") {
      const sheet = workbook.addWorksheet("SO DTF Header");

      const cols = [
        { header: "Nomor", key: "Nomor", width: 20, align: "left" as const },
        { header: "Status", key: "status", width: 14, align: "center" as const },
        { header: "Kd. Customer", key: "KdCus", width: 13, align: "center" as const },
        { header: "Nama Customer", key: "Customer", width: 28, align: "left" as const },
        { header: "Tanggal", key: "Tanggal", width: 13, align: "center" as const },
        { header: "Tgl Pengerjaan", key: "TglPengerjaan", width: 15, align: "center" as const },
        { header: "Dateline Cust", key: "DatelineCus", width: 14, align: "center" as const },
        { header: "Nama DTF", key: "NamaDTF", width: 30, align: "left" as const },
        { header: "Jml", key: "Jumlah", width: 8, align: "right" as const, fmt: "#,##0" },
        { header: "Titik", key: "Titik", width: 8, align: "right" as const, fmt: "#,##0" },
        {
          header: "Total Titik",
          key: "TotalTitik",
          width: 12,
          align: "right" as const,
          fmt: "#,##0",
        },
        {
          header: "Total Harga",
          key: "TotalHarga",
          width: 18,
          align: "right" as const,
          fmt: "#,##0",
        },
        { header: "LHK", key: "LHK", width: 8, align: "right" as const, fmt: "#,##0" },
        { header: "No. SO", key: "NoSO", width: 18, align: "left" as const },
        { header: "No. Invoice", key: "NoINV", width: 18, align: "left" as const },
        { header: "Sales", key: "Sales", width: 16, align: "left" as const },
        { header: "Bag. Desain", key: "BagDesain", width: 14, align: "left" as const },
        { header: "Kain", key: "Kain", width: 16, align: "left" as const },
        { header: "Finishing", key: "Finishing", width: 14, align: "left" as const },
        { header: "Workshop", key: "Workshop", width: 16, align: "left" as const },
        { header: "Keterangan", key: "Keterangan", width: 30, align: "left" as const },
        { header: "Alasan Close", key: "AlasanClose", width: 25, align: "left" as const },
        { header: "User", key: "Created", width: 12, align: "center" as const },
        { header: "User Modified", key: "UserModified", width: 14, align: "center" as const },
        { header: "Tgl Modified", key: "DateModified", width: 18, align: "center" as const },
        { header: "Status Close", key: "Close", width: 12, align: "center" as const },
      ];

      sheet.columns = cols.map((c) => ({ width: c.width }));

      // Header row
      const headerRow = sheet.addRow(cols.map((c) => c.header));
      headerRow.height = 22;
      headerRow.eachCell({ includeEmpty: true }, (cell) => applyHeader(cell));

      // Data rows
      targetData.forEach((item) => {
        // Warna baris berdasarkan status
        let rowBg: string | undefined;
        if (item.Close === "Y") rowBg = "FFFFFF99"; // kuning — closed
        else if (!item.NoSO && !item.NoINV) rowBg = "FFFFEBEE"; // merah muda — belum SO
        else if (item.NoSO && !item.NoINV) rowBg = "FFE3F2FD"; // biru muda — belum INV

        const statusText =
          item.status === "Closed"
            ? "Closed"
            : item.status === "Sudah INV"
            ? "Sudah INV"
            : item.status === "Sudah SO"
            ? "Sudah SO"
            : "Open";

        const values = cols.map((c) => {
          if (c.key === "Close") return item.Close === "Y" ? "Closed" : "Open";
          if (c.key === "status") return statusText;
          if (["Tanggal", "TglPengerjaan", "DatelineCus", "DateModified"].includes(c.key)) {
            return formatDate(item[c.key as keyof typeof item] as string);
          }
          return item[c.key as keyof typeof item] ?? "";
        });

        const row = sheet.addRow(values);
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          applyData(cell, cols[colNum - 1]?.align ?? "left", rowBg);
          if (cols[colNum - 1]?.fmt) cell.numFmt = cols[colNum - 1].fmt!;

          // Font warna status
          if (cols[colNum - 1]?.key === "status" || cols[colNum - 1]?.key === "Close") {
            const color =
              statusText === "Closed"
                ? "FF455A64"
                : statusText === "Sudah INV"
                ? "FF2E7D32"
                : statusText === "Sudah SO"
                ? "FF1565C0"
                : "FFC62828";
            cell.font = { bold: true, color: { argb: color } };
          }
        });
      });

      sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

      // ══════════════════════════════════════════════════════
      // EXPORT DETAIL
      // ══════════════════════════════════════════════════════
    } else {
      const daftarNomor = targetData.map((item) => item.Nomor);
      toast.info("Sedang mengambil data detail...");

      const response = await api.post("/so-dtf/export-detail", { nomors: daftarNomor });

      if (!response.data?.length) {
        toast.warning("Tidak ada data detail ditemukan.");
        return;
      }

      // ── Sheet 1: Detail Flat ───────────────────────────
      const sheet1 = workbook.addWorksheet("Detail SO DTF");

      type DetailRow = Record<string, string | number | null>;
      const detailData: DetailRow[] = response.data;

      const cols = [
        { header: "Nomor", key: "Nomor", width: 20, align: "left" as const },
        { header: "Tanggal", key: "Tanggal", width: 13, align: "center" as const },
        { header: "Tgl Pengerjaan", key: "TglPengerjaan", width: 15, align: "center" as const },
        { header: "Nama DTF", key: "NamaDTF", width: 30, align: "left" as const },
        { header: "Customer", key: "Customer", width: 25, align: "left" as const },
        { header: "Sales", key: "Sales", width: 16, align: "left" as const },
        { header: "No. SO", key: "NoSO", width: 18, align: "left" as const },
        { header: "Ukuran", key: "Ukuran", width: 10, align: "center" as const },
        { header: "Jumlah", key: "Jumlah", width: 10, align: "right" as const, fmt: "#,##0" },
      ];

      sheet1.columns = cols.map((c) => ({ width: c.width }));

      const headerRow1 = sheet1.addRow(cols.map((c) => c.header));
      headerRow1.height = 22;
      headerRow1.eachCell({ includeEmpty: true }, (cell) => applyHeader(cell));

      // Alternating color per nomor
      const nomorColors: Record<string, string> = {};
      let toggle = false;
      let prevNomor = "";

      detailData.forEach((row) => {
        const nomor = String(row["Nomor"] ?? "");
        if (!(nomor in nomorColors)) {
          nomorColors[nomor] = toggle ? "FFF3F8FD" : "FFFAFAFA";
          toggle = !toggle;
        }
        const isNewNomor = nomor !== prevNomor;
        prevNomor = nomor;

        const values = cols.map((c) => {
          // Kolom identitas — kosongkan bila bukan baris pertama per nomor
          const isIdentityCol = [
            "Nomor",
            "Tanggal",
            "TglPengerjaan",
            "NamaDTF",
            "Customer",
            "Sales",
            "NoSO",
          ].includes(c.key);
          if (isIdentityCol && !isNewNomor) return "";
          return row[c.key] ?? "";
        });

        const dataRow = sheet1.addRow(values);
        dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.border = {
            left: { style: "thin" },
            right: { style: "thin" },
            bottom: { style: "thin" },
            top: isNewNomor ? { style: "medium" } : { style: "thin" },
          };
          cell.alignment = {
            horizontal: cols[colNum - 1]?.align ?? "left",
            vertical: "middle",
          };
          if (cols[colNum - 1]?.fmt) cell.numFmt = cols[colNum - 1].fmt!;
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: nomorColors[nomor] },
          };
        });
      });

      // ── Sheet 2: Ringkasan per Nomor ──────────────────
      const sheet2 = workbook.addWorksheet("Ringkasan per Nomor");

      // Group data per nomor
      const grouped = new Map<
        string,
        {
          rows: DetailRow[];
          totalJumlah: number;
          sizes: string[];
        }
      >();

      detailData.forEach((row) => {
        const nomor = String(row["Nomor"] ?? "");
        if (!grouped.has(nomor)) {
          grouped.set(nomor, { rows: [], totalJumlah: 0, sizes: [] });
        }
        const grp = grouped.get(nomor)!;
        grp.rows.push(row);
        grp.totalJumlah += Number(row["Jumlah"] ?? 0);
        const ukuran = String(row["Ukuran"] ?? "");
        if (ukuran && !grp.sizes.includes(ukuran)) grp.sizes.push(ukuran);
      });

      const sumCols = [
        { header: "Nomor", width: 20, align: "left" as const },
        { header: "Tanggal", width: 13, align: "center" as const },
        { header: "Tgl Pengerjaan", width: 15, align: "center" as const },
        { header: "Nama DTF", width: 30, align: "left" as const },
        { header: "Customer", width: 25, align: "left" as const },
        { header: "Sales", width: 16, align: "left" as const },
        { header: "No. SO", width: 18, align: "left" as const },
        { header: "Ukuran", width: 20, align: "left" as const },
        { header: "Total Jumlah", width: 13, align: "right" as const, fmt: "#,##0" },
      ];

      sheet2.columns = sumCols.map((c) => ({ width: c.width }));

      const sumHeader = sheet2.addRow(sumCols.map((c) => c.header));
      sumHeader.height = 22;
      sumHeader.eachCell({ includeEmpty: true }, (cell) => applyHeader(cell));

      let grandTotal = 0;
      grouped.forEach((grp, nomor) => {
        const first = grp.rows[0];
        grandTotal += grp.totalJumlah;

        const row = sheet2.addRow([
          nomor,
          first["Tanggal"] ?? "",
          first["TglPengerjaan"] ?? "",
          first["NamaDTF"] ?? "",
          first["Customer"] ?? "",
          first["Sales"] ?? "",
          first["NoSO"] ?? "",
          grp.sizes.join(", "),
          grp.totalJumlah,
        ]);
        row.eachCell({ includeEmpty: true }, (cell, i) => {
          cell.border = borderThin;
          cell.alignment = { horizontal: sumCols[i - 1]?.align ?? "left", vertical: "middle" };
          if (sumCols[i - 1]?.fmt) cell.numFmt = sumCols[i - 1].fmt!;
        });
      });

      // Grand total
      const totalRowNum = sheet2.rowCount + 1;
      const gtRow = sheet2.addRow([
        "GRAND TOTAL :",
        "",
        "",
        "",
        "",
        "",
        "",
        grouped.size + " nomor",
        grandTotal,
      ]);
      sheet2.mergeCells(`A${totalRowNum}:G${totalRowNum}`);
      gtRow.height = 22;
      gtRow.eachCell({ includeEmpty: true }, (cell, i) => {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
        cell.border = borderMedium;
        cell.alignment = { horizontal: sumCols[i - 1]?.align ?? "right", vertical: "middle" };
        if (sumCols[i - 1]?.fmt) cell.numFmt = sumCols[i - 1].fmt!;
      });

      sheet1.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
      sheet2.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
    }

    // ── Download ───────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      type === "header"
        ? `Export_SODtf_Header_${filters.startDate}_${filters.endDate}.xlsx`
        : `Export_SODtf_Detail_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Export ${type} berhasil!`);
  } catch (error) {
    console.error("Error Export:", error);
    toast.error("Gagal mengekspor data.");
  }
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  const url = router.resolve({
    name: "Cetak SO DTF",
    params: { nomor: item.Nomor },
  }).href;
  window.open(url, "_blank");
};

const formatDate = (dateValue: string) => {
  if (!dateValue) return "-";
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "-";
    return format(date, "dd/MM/yyyy");
  } catch {
    return "-";
  }
};

const saveStateToSession = () => {
  const stateToSave = {
    filters: filters,
    selectedFilterField: selectedFilterField.value,
    filterSearchValue: filterSearchValue.value,
  };
  sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateToSave));
};

onMounted(async () => {
  if (hasViewPermission.value) {
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
      // 2. Jika tidak ada di memory (baru buka pertama kali), gunakan Query URL
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

    // 3. Fetch data referensi dan data tabel berurutan
    await fetchCabangList();
    await fetchData();

    isMounted.value = true;
  }
});

onUnmounted(() => {
  if (fetchTimeout.value) clearTimeout(fetchTimeout.value);
});

watch(
  filters,
  () => {
    if (isMounted.value) {
      saveStateToSession(); // Simpan state saat filter berubah

      // Jangan fetch kalau user sedang ngetik (karena ada delay dari watcher lain)
      if (selectedFilterField.value && filterSearchValue.value) return;

      if (fetchTimeout.value) clearTimeout(fetchTimeout.value);
      fetchTimeout.value = window.setTimeout(() => {
        fetchData();
      }, 300);
    }
  },
  { deep: true }
);

// Pantau variabel pencarian frontend agar saat user mengetik, state-nya juga tersimpan
watch([filterSearchValue, selectedFilterField], () => {
  saveStateToSession();
});

// Watcher untuk excel style filter
watch(
  columnFilters,
  (val) => {
    localStorage.setItem(LS_FILTER_KEY, JSON.stringify(val));
  },
  { deep: true }
);

// Deteksi saat user meninggalkan halaman ini
onBeforeRouteLeave((to, from, next) => {
  // Cek apakah halaman tujuan MASIH berhubungan dengan modul SO DTF
  // (misal: masuk ke form /ubah atau /new)

  // GANTI '/so-dtf' SESUAI DENGAN PATH MODUL HALAMAN INI DI ROUTER ANDA!
  // Asumsi: path menuju tambah/ubah ada di bawah `/transaksi/penjualan/dtf/so-dtf/...`
  const isRelatedPage = to.path.includes("/so-dtf");

  if (!isRelatedPage) {
    // Jika pergi ke menu lain (misal: /dashboard atau /lhk-so-dtf), bersihkan memori filter SO DTF!
    sessionStorage.removeItem(SESSION_STATE_KEY);
  }

  next(); // Lanjutkan perpindahan halaman
});
</script>

<template>
  <PageLayout title="SO DTF Pesanan" desktop-mode icon="mdi-printer-3d">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/dtf/so-dtf/new')"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        prepend-icon="mdi-pencil"
        :disabled="!isSingleSelected || Number(selected[0]?.LHK) > 0"
        @click="handleEdit"
      >
        Ubah
      </v-btn>
      <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="showDeleteConfirmation">Hapus</v-btn> -->
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        :disabled="!isSingleSelected"
        @click="printData"
        color="green"
        prepend-icon="mdi-printer"
        >Cetak</v-btn
      >
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props"
            >Export</v-btn
          >
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
      <v-divider vertical class="mx-2"></v-divider>
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!isSingleSelected"
        @click="openCloseDialog"
        color="orange-darken-2"
        >Close SO</v-btn
      >
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <v-radio-group
          v-model="filters.filterDateType"
          inline
          hide-details
          density="compact"
          class="me-4"
        >
          <template #label><span class="filter-label">Filter:</span></template>
          <v-radio label="Tgl SO DTF" value="dtf"></v-radio>
          <v-radio label="Tgl Pengerjaan" value="pengerjaan"></v-radio>
        </v-radio-group>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 130px"
        ></v-text-field>
        <span class="mx-2">s/d</span>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 130px"
        ></v-text-field>
        <v-select
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-2"
          style="min-width: 180px"
        ></v-select>
        <v-divider vertical class="mx-2"></v-divider>
        <div class="d-flex align-center ga-2">
          <v-select
            v-model="selectedFilterField"
            :items="filterOptions"
            label="Filter Berdasarkan"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 180px"
          ></v-select>
          <v-text-field
            v-model="filterSearchValue"
            label="Cari..."
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 250px"
            clearable
            prepend-inner-icon="mdi-magnify"
          ></v-text-field>
        </div>
        <v-chip
          v-if="filters.status"
          class="ms-4"
          color="primary"
          variant="tonal"
          closable
          @click:close="filters.status = null"
        >
          Status: {{ filters.status === "belum_invoice" ? "Belum Invoice" : filters.status }}
        </v-chip>
        <v-spacer></v-spacer>
        <v-btn
          color="error"
          variant="tonal"
          prepend-icon="mdi-filter-off"
          class="btn-detail reset-filter-btn ms-2"
          @click="resetAllFilters"
        >
          Reset Filter
        </v-btn>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <div class="legend-section">
        <div class="legend-group">
          <strong class="legend-title">Status SO:</strong>
          <div class="legend-item"><span class="row-color-sample-closed"></span> Di-Close</div>
          <div class="legend-item">
            <span class="text-red font-weight-medium">Teks Merah</span>: Belum SO & Invoice
          </div>
          <div class="legend-item">
            <span class="text-blue font-weight-medium">Teks Biru</span>: Belum Invoice
          </div>
        </div>
        <v-divider vertical></v-divider>
        <div class="legend-group">
          <strong class="legend-title">Status LHK:</strong>
          <div class="legend-item">
            <v-chip size="x-small" class="lhk-zero" label>0</v-chip> Belum Input
          </div>
          <div class="legend-item">
            <v-chip size="x-small" class="lhk-progress" label>1</v-chip> Progress
          </div>
        </div>
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="filteredSoDtfList"
          :loading="isLoading"
          item-value="Nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
          :item-props="(item: SoDtfHeader) => ({ class: item.Close === 'Y' ? 'row-closed' : '' })"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <!-- ❌ HEADER TANPA FILTER (expand & select) -->
                <th
                  v-if="['data-table-expand', 'data-table-select'].includes(header.key)"
                  :style="{
                    width: header.width + 'px',
                    minWidth: header.width + 'px',
                    maxWidth: header.width + 'px',
                  }"
                  class="resizable-header"
                  :class="{
                    'text-center': header.align === 'center',
                    'text-end': header.align === 'end',
                  }"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                  </div>
                  <div
                    class="resizer"
                    @mousedown.stop="onResizeStart($event, header)"
                    @click.stop
                  />
                </th>

                <!-- ✅ HEADER DENGAN FILTER -->
                <th
                  v-else
                  :style="{
                    width: header.width + 'px',
                    minWidth: header.width + 'px',
                    maxWidth: header.width + 'px',
                  }"
                  class="resizable-header"
                  :class="{
                    'text-center': header.align === 'center',
                    'text-end': header.align === 'end',
                  }"
                  @click="toggleSort(header)"
                >
                  <div class="header-content">
                    <!-- NAMA KOLOM -->
                    <span>{{ header.title }}</span>

                    <!-- SORT ICON -->
                    <v-icon v-if="isSorted(header)" size="14" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>

                    <!-- 🔵 FILTER ICON -->
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

                      <!-- MENU FILTER -->
                      <v-list class="filter-menu">
                        <!-- SELECT ALL -->
                        <v-list-item @click.stop="clearColumnFilter(header.key)">
                          <v-list-item-title>(Select All)</v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <!-- LIST MULTI SELECT -->
                        <v-list-item
                          v-for="val in uniqueValues(header.key)"
                          :key="val"
                          @click.stop="toggleMultiSelectValue(header.key, val)"
                        >
                          <template #prepend>
                            <v-checkbox
                              density="compact"
                              :model-value="
                                columnFilters[header.key]?.type === 'multi' &&
                                columnFilters[header.key]?.values?.includes(val)
                              "
                            />
                          </template>

                          <!-- FORMAT VALUE (contoh: tanggal di-format) -->
                          <v-list-item-title>
                            {{ formatFilterValue(header.key, val) }}
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
                  />
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
              <template
                v-if="
                  ['Tanggal', 'TglPengerjaan', 'DatelineCus', 'DateModified'].includes(header.key)
                "
              >
                {{ formatDate(item[header.key]) }}
              </template>
              <template v-else-if="header.key === 'status'">
                <v-chip
                  v-if="item.status === 'Closed'"
                  color="blue-grey"
                  variant="tonal"
                  size="x-small"
                  >Closed</v-chip
                >
                <v-chip
                  v-else-if="item.status === 'Sudah INV'"
                  color="success"
                  variant="tonal"
                  size="x-small"
                  >Sudah INV</v-chip
                >
                <v-chip
                  v-else-if="item.status === 'Sudah SO'"
                  color="info"
                  variant="tonal"
                  size="x-small"
                  >Sudah SO</v-chip
                >
                <v-chip v-else color="grey" variant="tonal" size="x-small">Open</v-chip>
              </template>
              <template v-else-if="header.key === 'LHK'">
                <v-chip :class="getLhkClass(item)" size="x-small" label>{{ item.LHK }}</v-chip>
              </template>
              <template v-else-if="header.key === 'Close'">
                <v-chip :color="item.Close === 'Y' ? 'success' : 'grey'" size="x-small">
                  {{ item.Close === "Y" ? "Closed" : "Open" }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'TotalHarga'">
                <span class="font-weight-medium">{{
                  formatRupiah(item[header.key] as number)
                }}</span>
              </template>
              <template v-else-if="header.key === 'Keterangan'">
                <div style="white-space: pre-wrap; line-height: 1.4; min-width: 250px">
                  {{ item[header.key] }}
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
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">
                      <v-progress-circular
                        indeterminate
                        size="20"
                        class="mr-2"
                      ></v-progress-circular>
                      Memuat detail...
                    </div>
                    <v-table
                      v-else-if="details[item.Nomor] && details[item.Nomor].length"
                      density="compact"
                      class="detail-table"
                    >
                      <thead>
                        <tr>
                          <th>Nama Barang</th>
                          <th>Ukuran</th>
                          <th class="text-end">Jumlah</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="d in details[item.Nomor]" :key="d.Ukuran + d.NamaBarang">
                          <td>{{ d.NamaBarang }}</td>
                          <td>{{ d.Ukuran }}</td>
                          <td class="text-end">{{ d.Jumlah }}</td>
                        </tr>
                      </tbody>
                    </v-table>
                    <div v-else class="text-center py-2 text-caption text-grey">
                      Tidak ada data detail.
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
        <v-card-title class="text-h6">Isi Alasan Close SO</v-card-title>
        <v-card-text>
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
          <v-btn text @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="primary" @click="submitCloseSo">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>{{ confirmDialogText }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isConfirmDialogVisible = false"
            >Batal</v-btn
          >
          <v-btn color="error" variant="tonal" @click="executeDelete">Ya, Hapus</v-btn>
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

    <!-- AuthorizationModal untuk Close SO DTF -->
    <AuthorizationModal
      v-if="isAuthModalVisible"
      title="Otorisasi Close SO DTF"
      jenis="CLOSE_SO_DTF"
      :transaksi="authPayload.transaksi"
      :keterangan="authPayload.keterangan"
      :nominal="authPayload.nominal"
      @success="doCloseSoDtf"
      @close="onAuthCancelled"
    />
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
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

/* Legend Section */
.legend-section {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  font-size: 11px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  flex-shrink: 0;
}

.legend-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row-color-sample-closed {
  background-color: #ffff99;
  width: 14px;
  height: 14px;
  border: 1px solid #e0e0e0;
  display: inline-block;
}

/* Table Container */
.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Desktop Table Full Height */
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

/* Header Resize Style */
.resizable-header {
  position: relative;
  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
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
  border-right: 2px solid rgba(var(--v-theme-on-primary), 0.8);
}

/* Detail Sticky Container */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  background-color: rgb(var(--v-theme-surface));
  padding: 16px 16px 16px 64px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 500px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

/* Pewarnaan Row & LHK */
:deep(td.text-red) {
  color: red !important;
}

:deep(td.text-blue) {
  color: blue !important;
}

.row-closed :deep(td:first-child) {
  background-color: rgba(255, 235, 59, 0.6);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
  font-weight: 600;
}

.lhk-zero {
  background-color: #ff5252 !important;
  color: white !important;
}

.lhk-progress {
  background-color: #1a237e !important;
  color: white !important;
}

.lhk-normal {
  background-color: #e0e0e0 !important;
}

:deep(.compact-select-list .v-list-item-title) {
  font-size: 11px !important;
}

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
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.custom-filter-item {
  font-weight: 600;
  color: #1565c0;
  font-size: 11px !important;
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
  color: rgb(var(--v-theme-error)) !important;
  background-color: rgba(var(--v-theme-error), 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(var(--v-theme-error), 0.25) !important;
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useRouter, useRoute, onBeforeRouteLeave } from "vue-router";
import { format } from "date-fns";
import axios from "axios";
import type ExcelJS from "exceljs";

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

interface AccesoriesHeader {
  Nomor: string;
  Tanggal: string;
  Cab: string;
  Jenis?: string;
  Keterangan: string;
  Usr: string;
  Status: string;
  Approve: string;
  AlasanClose: string;
  Jam: string;
  [key: string]: unknown;
}

interface AccesoriesDetail {
  nomor: string;
  kode: string;
  nama: string;
  satuan: string;
  jumlah: number;
  realisasi: number;
  keterangan: string;
  [key: string]: unknown;
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

interface RealisasiItem {
  NoRealisasi: string;
  TglRealisasi: string;
  Approve: string;
  Jumlah: number;
  Keterangan: string;
  [key: string]: unknown;
}

interface RealisasiDetailItem {
  NomorRealisasi: string;
  Kode: string;
  Nama: string;
  Satuan: string;
  Jumlah: number;
}

interface DetailPayload {
  realisasi: RealisasiItem[];
  items: AccesoriesDetail[];
  realisasiDetails: RealisasiDetailItem[];
}

// --- State ---
const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = "225";

const dataList = ref<AccesoriesHeader[]>([]);
const filterOptions = ref([
  { title: "Nomor", value: "nomor" },
  { title: "Tanggal", value: "tanggal" },
  { title: "Jenis", value: "Jenis" }, // [BARU]
  { title: "Keterangan", value: "keterangan" },
  { title: "User", value: "usr" },
  { title: "Status", value: "status" },
  { title: "Approve", value: "approve" },
]);

const isMounted = ref(false);
const selectedFilterField = ref("nomor");
const filterSearchValue = ref("");
const details = ref<{ [key: string]: DetailPayload }>({});
const isLoading = ref(true);
const expanded = ref<AccesoriesHeader[]>([]);
const selected = ref<AccesoriesHeader[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

const isCloseDialogVisible = ref(false);
const closeReason = ref("");
const isClosing = ref(false);

const isConfirmDialogVisible = ref(false);
const confirmText = ref("");
const pendingAction = ref<(() => void) | null>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

const selectedRealisasiMap = ref<Record<string, string>>({});

// [BARU] Tambahan filter jenis
const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: "P03",
  jenis: "ALL",
});

// [BARU] Tambahan Header Jenis
const tableHeaders = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "Nomor", width: 150, fixed: true },
  { title: "Tanggal", key: "Tanggal", width: 100 },
  { title: "Cabang", key: "Cab", width: 100 },
  { title: "Jenis", key: "Jenis", width: 120 },
  { title: "Keterangan", key: "Keterangan", width: 300 },
  { title: "User", key: "Usr", width: 120 },
  { title: "Waktu Input", key: "Jam", width: 150 }, // Ganti ke Jam
  { title: "Alasan Close", key: "AlasanClose", width: 250 },
  { title: "Approve", key: "Approve", align: "center", width: 120 },
  { title: "Status", key: "Status", align: "center", width: 120 },
]);

const realisasiHeaders: DataTableHeader[] = [
  { title: "No. Realisasi", key: "NoRealisasi", width: 120 },
  { title: "Tgl. Realisasi", key: "TglRealisasi", width: 100 },
  { title: "Approve", key: "Approve", width: 100, align: "center" },
  { title: "Jumlah", key: "Jumlah", align: "end", width: 80 },
  { title: "Keterangan", key: "Keterangan" },
  { title: "Aksi", key: "actions", width: 90, align: "center" },
];

const detailHeaders: DataTableHeader[] = [
  { title: "KODE", key: "Kode", width: 120 },
  { title: "NAMA BARANG", key: "Nama", minWidth: "200px" },
  { title: "SATUAN", key: "Satuan", width: 80, align: "center" },
  { title: "NOTE", key: "Note", minWidth: "150px" },
  { title: "JUMLAH", key: "Jumlah", align: "end", width: 90 },
  { title: "REALISASI", key: "Realisasi", align: "end", width: 90 },
  { title: "KETERANGAN", key: "Keterangan", minWidth: "150px" },
];

const detailRealisasiHeaders: DataTableHeader[] = [
  { title: "No.", key: "index", width: 50, align: "center" },
  { title: "KODE", key: "Kode", width: 100 },
  { title: "NAMA BARANG", key: "Nama" },
  { title: "SATUAN", key: "Satuan", width: 80, align: "center" },
  { title: "JUMLAH", key: "Jumlah", align: "end", width: 80 },
];

// --- Filter ----
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({
  key: "",
  operator: "=",
  value: "",
});

const LS_FILTER_KEY = "minta_acc_table_filters";
const SESSION_STATE_KEY = "minta_acc_browse_state";

const saved = localStorage.getItem(LS_FILTER_KEY);
if (saved) {
  try {
    columnFilters.value = JSON.parse(saved);
  } catch {}
}

const uniqueValues = (key: string): string[] => {
  const set = new Set(
    dataList.value
      .map((r) => String(r[key]))
      .filter((v) => v !== "null" && v !== "undefined" && v !== "")
  );
  return Array.from(set).sort();
};

const isFilterActive = (key: string) => {
  return Boolean(columnFilters.value[key]);
};

const filterType = (key: string) => {
  const f = columnFilters.value[key];
  if (!f) return "";
  if (f.type === "custom") return "custom";
  if (f.type === "multi") return "multi";
  return "";
};

const clearColumnFilter = (key: string) => {
  delete columnFilters.value[key];
};

const toggleMultiSelectValue = (key: string, value: string | number) => {
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

const resetAllFilters = () => {
  columnFilters.value = {};
  localStorage.removeItem(LS_FILTER_KEY);
  filterSearchValue.value = "";
  filters.jenis = "ALL";
  sessionStorage.removeItem(SESSION_STATE_KEY);

  if (route.query.status || route.query.startDate) {
    router.replace({ query: {} });
  }

  if (isMounted.value && hasViewPermission.value) {
    fetchData();
  }
};

const noFilterColumns = ["data-table-select", "data-table-expand"];

const formatFilterValue = (key: string, val: string | number | undefined | null): string => {
  if (["tanggal", "created"].includes(key)) {
    if (!val) return "-";
    if (typeof val === "string" || typeof val === "number") {
      try {
        return format(new Date(val), "dd/MM/yyyy");
      } catch {
        return String(val);
      }
    }
  }
  return String(val ?? "-");
};

// --- Resize Logic ---
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

const isSingleSelected = computed(() => selected.value.length === 1);
const canBeClosed = computed(() => {
  if (!isSingleSelected.value) return false;
  return selected.value[0].status === "OPEN";
});
const canBeDeleted = computed(() => {
  if (!isSingleSelected.value) return false;
  return selected.value[0].status === "OPEN";
});

const filteredItems = computed(() => {
  let data = [...dataList.value];

  // 1) FILTER JENIS (Lokal Frontend)
  if (filters.jenis !== "ALL") {
    data = data.filter((r) => r.Jenis === filters.jenis);
  }

  // 2) FILTER HEADER (MULTI & CUSTOM)
  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    if (f.type === "multi" && f.values) {
      data = data.filter((r) => f.values!.includes(r[key] as string | number));
      continue;
    }

    if (f.type === "custom" && f.operator) {
      const cmp = String(f.value).toLowerCase();

      data = data.filter((row) => {
        const v = row[key];
        if (v == null) return false;
        const val = String(v).toLowerCase();

        switch (f.operator) {
          case "=":
            return val === cmp;
          case "!=":
            return val !== cmp;
          case ">":
            return Number(val) > Number(cmp);
          case ">=":
            return Number(val) >= Number(cmp);
          case "<":
            return Number(val) < Number(cmp);
          case "<=":
            return Number(val) <= Number(cmp);
          case "contains":
            return val.includes(cmp);
          case "starts":
            return val.startsWith(cmp);
          case "ends":
            return val.endsWith(cmp);
        }
      });
    }
  }

  // 3) GLOBAL SEARCH
  if (filterSearchValue.value) {
    const key = selectedFilterField.value;
    const term = filterSearchValue.value.toLowerCase();
    data = data.filter((r) =>
      String(r[key] ?? "")
        .toLowerCase()
        .includes(term)
    );
  }

  return data;
});

// --- Methods ---
const selectRealisasiRow = (masterNomor: string, realisasiNomor: string) => {
  selectedRealisasiMap.value[masterNomor] = realisasiNomor;
};

const handleRowClick = (_event: Event, { item }: { item: AccesoriesHeader }) => {
  selected.value = [item];
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/minta-accesories", {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang: filters.cabang,
        jenis: filters.jenis,
      },
    });
    dataList.value = response.data;
  } catch (error: unknown) {
    let msg = "Gagal memuat data permintaan.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    else if (error instanceof Error) msg = error.message;
    toast.error(msg);
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (expandedItems: AccesoriesHeader[]) => {
  const expandedNomors = expandedItems.map((item) => item.Nomor); // N besar

  for (const nomor of expandedNomors) {
    if (!details.value[nomor] && !loadingDetails.value.has(nomor)) {
      loadingDetails.value.add(nomor);
      try {
        const url = `/minta-accesories/${nomor}/details`;
        const response = await api.get(url);
        details.value = { ...details.value, [nomor]: response.data };

        if (response.data.realisasi && response.data.realisasi.length > 0) {
          selectedRealisasiMap.value[nomor] = response.data.realisasi[0].NoRealisasi;
        }
      } catch {
        toast.error("Gagal memuat detail permintaan.");
      } finally {
        loadingDetails.value.delete(nomor);
      }
    }
  }
};

const editItem = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].Nomor; // Ganti huruf N besar
  router.push(`/gudang-dc/operasional/minta-accesories/ubah/${nomor}`);
};

const confirmDelete = () => {
  if (!canBeDeleted.value) return;
  showConfirmation(
    executeDelete,
    `Anda yakin ingin menghapus permintaan ${selected.value[0].Nomor}?` // Ganti huruf N besar
  );
};

const executeDelete = async () => {
  const nomor = selected.value[0].Nomor;
  try {
    await api.delete(`/minta-accesories/${nomor}`);
    toast.success("Permintaan berhasil dihapus.");
    fetchData();
    selected.value = [];
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal menghapus data.");
    } else {
      toast.error("Gagal menghapus data.");
    }
  }
};

const openCloseDialog = () => {
  if (!canBeClosed.value) return;
  closeReason.value = "";
  isCloseDialogVisible.value = true;
};

const submitCloseManual = async () => {
  if (!closeReason.value) {
    toast.error("Alasan harus diisi.");
    return;
  }
  isClosing.value = true;
  try {
    const nomor = selected.value[0].Nomor;
    await api.put(`/minta-accesories/${nomor}/close-manual`, { alasan: closeReason.value });
    toast.success("Permintaan berhasil di-close manual.");
    isCloseDialogVisible.value = false;
    fetchData();
    selected.value = [];
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal menutup permintaan.");
    } else {
      toast.error("Gagal menutup permintaan.");
    }
  } finally {
    isClosing.value = false;
  }
};

const handleCreate = async () => {
  try {
    const response = await api.get("/minta-accesories/check-unapproved");
    if (response.data.count > 0) {
      toast.warning(
        "Permintaanmu ada yang belum di-approve > 1 hari.\nSilakan di-approve dulu supaya bisa membuat permintaan baru."
      );
      return;
    }
    router.push("/gudang-dc/operasional/minta-accesories/new");
  } catch {
    toast.error("Gagal mengecek status approve realisasi");
  }
};

const approveRealisasi = async (prominNomor: string, mintaNomor: string) => {
  showConfirmation(async () => {
    try {
      const res = await api.put(`/minta-accesories/realisasi/${prominNomor}/approve`);
      toast.success(res.data.message);

      // Hapus cache detail agar loadDetails fetch ulang dari server
      delete details.value[mintaNomor]; // ← tambah ini

      const itemToReload = dataList.value.find((i) => i.Nomor === mintaNomor);
      if (itemToReload) {
        loadingDetails.value.delete(mintaNomor);
        await loadDetails([itemToReload]);
      }
      fetchData();
    } catch (error: unknown) {
      let msg = "Gagal melakukan approve.";
      if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
      toast.error(msg);
    }
  }, "Yakin ingin melakukan Approve (Penerimaan) untuk realisasi ini?");
};

const showConfirmation = (action: () => void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
};

const executePendingAction = () => {
  if (pendingAction.value) pendingAction.value();
  isConfirmDialogVisible.value = false;
};

const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
  pendingAction.value = null;
};

// const formatDateIndo = (dateString: string | Date) => {
//   if (!dateString) return "";
//   const date = new Date(dateString);
//   return new Intl.DateTimeFormat("id-ID", {
//     day: "numeric",
//     month: "long",
//     year: "numeric",
//   }).format(date);
// };

const exportHeaderData = async () => {
  if (dataList.value.length === 0) {
    toast.warning("Tidak ada data header untuk diekspor.");
    return;
  }
  toast.info("Menyiapkan file export header...");
  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Permintaan Header");

    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    const cols = [
      { header: "Nomor", key: "Nomor", width: 18, align: "left" as const },
      { header: "Tanggal", key: "Tanggal", width: 13, align: "center" as const },
      { header: "Cabang", key: "Cab", width: 10, align: "center" as const },
      { header: "Jenis", key: "Jenis", width: 14, align: "center" as const },
      { header: "Keterangan", key: "Keterangan", width: 35, align: "left" as const },
      { header: "User", key: "Usr", width: 12, align: "center" as const },
      { header: "Waktu Input", key: "Jam", width: 14, align: "center" as const },
      { header: "Alasan Close", key: "AlasanClose", width: 30, align: "left" as const },
      { header: "Approve", key: "Approve", width: 12, align: "center" as const },
      { header: "Status", key: "Status", width: 12, align: "center" as const },
    ];

    sheet.columns = cols.map((c) => ({ width: c.width }));

    const headerRow = sheet.addRow(cols.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    // Warna baris & warna font Status/Approve — mengikuti getRowTextColor /
    // getStatusChip / getApproveChip yang sudah dipakai di tabel browse
    const getRowBg = (item: AccesoriesHeader): string | undefined => {
      switch (item.Status) {
        case "OPEN":
          return "FFFFEBEE"; // merah muda
        case "PROSES":
          return "FFE3F2FD"; // biru muda
        case "DICLOSE":
          return "FFF5F5F5"; // abu
        default:
          return undefined;
      }
    };
    const getStatusFontColor = (item: AccesoriesHeader): string => {
      switch (item.Status) {
        case "OPEN":
          return "FFC62828";
        case "PROSES":
          return "FF1565C0";
        case "DICLOSE":
          return "FF757575";
        case "CLOSE":
          return "FF2E7D32";
        default:
          return "FF212121";
      }
    };
    const getApproveFontColor = (approve: string): string => {
      if (approve === "Y") return "FF2E7D32"; // hijau — APPROVED
      if (approve === "N") return "FFEF6C00"; // oranye — WAITING
      return "FF9E9E9E";
    };

    dataList.value.forEach((item) => {
      const rowBg = getRowBg(item);
      const values = cols.map((c) => {
        if (c.key === "Tanggal") {
          try {
            return item.Tanggal ? format(new Date(item.Tanggal as string), "dd/MM/yyyy") : "-";
          } catch {
            return "-";
          }
        }
        if (c.key === "Approve") {
          if (item.Approve === "Y") return "APPROVED";
          if (item.Approve === "N") return "WAITING";
          return "-";
        }
        return (item[c.key] as string | number) ?? "";
      });
      const row = sheet.addRow(values);
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border = borderThin;
        cell.alignment = { horizontal: cols[colNum - 1]?.align ?? "left", vertical: "middle" };
        if (rowBg) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        }
        if (cols[colNum - 1]?.key === "Status") {
          cell.font = { bold: true, color: { argb: getStatusFontColor(item) } };
        }
        if (cols[colNum - 1]?.key === "Approve") {
          cell.font = { bold: true, color: { argb: getApproveFontColor(item.Approve) } };
        }
      });
    });

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Export_MintaAccesories_Header_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File Header berhasil diekspor.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data header.");
  }
};

const accIdentityKeys = new Set([
  "Nomor",
  "Tanggal",
  "Jenis",
  "Cabang",
  "KeteranganPermintaan",
  "Usr",
  "Status",
  "AlasanClose",
]);

const exportDetailData = async () => {
  toast.info("Mengambil data detail dari server...");
  try {
    const response = await api.get<Record<string, string | number | null | undefined>[]>(
      "/minta-accesories/export-details",
      {
        params: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          keyword: filterSearchValue.value || undefined,
        },
      }
    );

    if (!response.data?.length) {
      toast.warning("Tidak ada data detail untuk diekspor pada periode ini.");
      return;
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

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

    type DetailRow = Record<string, string | number | null | undefined>;
    const data: DetailRow[] = response.data;
    const keys = Object.keys(data[0]);

    // ── Sheet 1: Detail Flat ───────────────────────────
    const sheet1 = workbook.addWorksheet("Detail Permintaan");

    const getColDef = (key: string) => {
      const k = key.toLowerCase();
      if (k.includes("nomor")) return { width: 18, align: "left" as const };
      if (k.includes("tanggal") || k.includes("tgl"))
        return { width: 13, align: "center" as const };
      if (k.includes("nama")) return { width: 28, align: "left" as const };
      if (k === "kode") return { width: 12, align: "left" as const };
      if (k === "satuan") return { width: 10, align: "center" as const };
      if (["jumlah", "realisasi"].some((x) => k.includes(x)))
        return { width: 12, align: "right" as const, fmt: "#,##0" };
      if (k === "jenis" || k === "cabang" || k === "status")
        return { width: 12, align: "center" as const };
      if (k === "urut") return { width: 8, align: "center" as const };
      return { width: 20, align: "left" as const };
    };

    sheet1.columns = keys.map((k) => ({ width: getColDef(k).width }));

    const headerRow1 = sheet1.addRow(keys);
    headerRow1.height = 22;
    headerRow1.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    const nomorKey = keys.find((k) => k === "Nomor") ?? keys[0];
    const nomorColors: Record<string, string> = {};
    let toggle = false;
    let prevNomor = "";
    const identityKeys = new Set(keys.filter((k) => accIdentityKeys.has(k)));

    data.forEach((row) => {
      const nomor = String(row[nomorKey] ?? "");
      if (!(nomor in nomorColors)) {
        nomorColors[nomor] = toggle ? "FFF3F8FD" : "FFFAFAFA";
        toggle = !toggle;
      }
      const isNewNomor = nomor !== prevNomor;
      prevNomor = nomor;

      const values = keys.map((k) => {
        if (identityKeys.has(k) && !isNewNomor) return "";
        const v = row[k];
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
          try {
            return format(new Date(v), "dd/MM/yyyy");
          } catch {
            return v;
          }
        }
        return v ?? "";
      });

      const dataRow = sheet1.addRow(values);
      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const colDef = getColDef(keys[colNum - 1] ?? "");
        cell.border = {
          left: { style: "thin" },
          right: { style: "thin" },
          bottom: { style: "thin" },
          top: isNewNomor ? { style: "medium" } : { style: "thin" },
        };
        cell.alignment = { horizontal: colDef.align, vertical: "middle" };
        if ("fmt" in colDef && colDef.fmt) cell.numFmt = colDef.fmt;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: nomorColors[nomor] } };
      });
    });

    // ── Sheet 2: Ringkasan per Nomor ───────────────
    const sheet2 = workbook.addWorksheet("Ringkasan per Nomor");
    const sumCols = [
      { header: "Nomor", width: 18, align: "left" as const },
      { header: "Tanggal", width: 13, align: "center" as const },
      { header: "Jenis", width: 14, align: "center" as const },
      { header: "Total Item", width: 10, align: "right" as const, fmt: "#,##0" },
      { header: "Total Jumlah", width: 13, align: "right" as const, fmt: "#,##0" },
      { header: "Status", width: 12, align: "center" as const },
    ];
    sheet2.columns = sumCols.map((c) => ({ width: c.width }));

    const sumHeader = sheet2.addRow(sumCols.map((c) => c.header));
    sumHeader.height = 22;
    sumHeader.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    const grouped = new Map<string, { rows: DetailRow[]; totalJumlah: number }>();
    data.forEach((row) => {
      const nomor = String(row[nomorKey] ?? "");
      if (!grouped.has(nomor)) grouped.set(nomor, { rows: [], totalJumlah: 0 });
      const grp = grouped.get(nomor)!;
      grp.rows.push(row);
      const jumlahKey = keys.find((k) => k === "Jumlah");
      if (jumlahKey) grp.totalJumlah += Number(row[jumlahKey] ?? 0);
    });

    const tglKey = keys.find((k) => k === "Tanggal") ?? "";
    const jenisKey = keys.find((k) => k === "Jenis") ?? "";
    const statusKey = keys.find((k) => k === "Status") ?? "";
    let grandJumlah = 0;

    grouped.forEach((grp, nomor) => {
      const first = grp.rows[0];
      grandJumlah += grp.totalJumlah;
      const tglVal = first[tglKey];
      const tglStr =
        typeof tglVal === "string" && /^\d{4}-\d{2}-\d{2}/.test(tglVal)
          ? format(new Date(tglVal), "dd/MM/yyyy")
          : String(tglVal ?? "-");

      const row = sheet2.addRow([
        nomor,
        tglStr,
        first[jenisKey] ?? "",
        grp.rows.length,
        grp.totalJumlah,
        first[statusKey] ?? "",
      ]);
      row.eachCell({ includeEmpty: true }, (cell, i) => {
        cell.border = borderThin;
        cell.alignment = { horizontal: sumCols[i - 1]?.align ?? "left", vertical: "middle" };
        if (sumCols[i - 1]?.fmt) cell.numFmt = sumCols[i - 1].fmt!;
      });
    });

    const totalRowNum = sheet2.rowCount + 1;
    const gtRow = sheet2.addRow(["GRAND TOTAL :", "", "", grouped.size, grandJumlah, ""]);
    sheet2.mergeCells(`A${totalRowNum}:C${totalRowNum}`);
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

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Export_MintaAccesories_Detail_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File Detail berhasil diekspor (2 sheet).");
  } catch (error: unknown) {
    console.error(error);
    let msg = "Gagal mengekspor data detail.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    else if (error instanceof Error) msg = error.message;
    toast.error(msg);
  }
};

const printItem = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].Nomor;
  const url = router.resolve({
    name: "MintaAccesoriesPrint",
    params: { nomor },
  }).href;
  window.open(url, "_blank");
};

const getRowTextColor = (item: AccesoriesHeader) => {
  if (item.Status === "OPEN") return "text-red font-weight-bold";
  if (item.Status === "PROSES") return "text-blue font-weight-bold";
  if (item.Status === "DICLOSE") return "text-grey font-italic";
  return "";
};

const getStatusChip = (item: AccesoriesHeader) => {
  if (item.Status === "CLOSE") return { text: "CLOSE", color: "success" };
  if (item.Status === "DICLOSE") return { text: "DICLOSE", color: "grey-darken-1" };
  if (item.Status === "PROSES") return { text: "PROSES", color: "primary" };
  return { text: "OPEN", color: "error" };
};

const getApproveChip = (approveStat: string) => {
  if (approveStat === "Y") return { text: "APPROVED", color: "success" };
  if (approveStat === "N") return { text: "WAITING", color: "warning" };
  return { text: "-", color: "grey" };
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
    const savedState = sessionStorage.getItem(SESSION_STATE_KEY);

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        if (parsedState.filters) {
          filters.startDate = parsedState.filters.startDate || filters.startDate;
          filters.endDate = parsedState.filters.endDate || filters.endDate;
          filters.jenis = parsedState.filters.jenis || filters.jenis;
        }
        if (parsedState.selectedFilterField)
          selectedFilterField.value = parsedState.selectedFilterField;
        if (parsedState.filterSearchValue) filterSearchValue.value = parsedState.filterSearchValue;
      } catch {}
    } else {
      const queryStartDate = route.query.startDate as string;
      const queryEndDate = route.query.endDate as string;
      if (queryStartDate && queryEndDate) {
        filters.startDate = queryStartDate;
        filters.endDate = queryEndDate;
      }
    }

    await fetchData();
    isMounted.value = true;
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});

watch(
  expanded,
  (newExpanded) => {
    if (newExpanded.length > 0) loadDetails(newExpanded);
  },
  { deep: true }
);

watch(
  filters,
  () => {
    saveStateToSession();
    if (isMounted.value && hasViewPermission.value) fetchData();
  },
  { deep: true }
);

watch(
  columnFilters,
  (val) => {
    localStorage.setItem(LS_FILTER_KEY, JSON.stringify(val));
  },
  { deep: true }
);

watch([filterSearchValue, selectedFilterField], () => {
  saveStateToSession();
});

onBeforeRouteLeave((to, from, next) => {
  const isRelatedPage = to.path.includes("/minta-accesories");
  if (!isRelatedPage) sessionStorage.removeItem(SESSION_STATE_KEY);
  next();
});
</script>

<template>
  <PageLayout title="Permintaan Kebutuhan Kaosan">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="handleCreate"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="editItem"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        :disabled="!canBeDeleted"
        prepend-icon="mdi-delete"
        @click="confirmDelete"
        >Hapus</v-btn
      >

      <v-btn
        size="small"
        color="green"
        prepend-icon="mdi-printer"
        @click="printItem"
        :disabled="!isSingleSelected"
      >
        Cetak
      </v-btn>

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

      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!canBeClosed"
        color="blue"
        prepend-icon="mdi-lock-outline"
        @click="openCloseDialog"
        >Close Manual</v-btn
      >
    </template>

    <div v-if="!hasViewPermission" class="text-center pa-8 text-grey">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p class="body-1 mt-2">Anda tidak memiliki izin untuk melihat data ini.</p>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <div class="d-flex align-center ga-2">
          <span class="filter-label">Periode:</span>
          <v-text-field
            v-model="filters.startDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 130px"
          ></v-text-field>
          <span>s/d</span>
          <v-text-field
            v-model="filters.endDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 130px"
          ></v-text-field>
        </div>

        <div class="d-flex align-center ga-2" style="min-width: 150px">
          <span class="filter-label">Cabang:</span>
          <v-text-field
            model-value="P03"
            density="compact"
            hide-details
            variant="filled"
            style="max-width: 100px"
            readonly
          ></v-text-field>
        </div>

        <div class="d-flex align-center ga-2" style="min-width: 170px">
          <span class="filter-label">Jenis:</span>
          <v-select
            v-model="filters.jenis"
            :items="[
              { title: 'Semua Jenis', value: 'ALL' },
              { title: 'OBAT', value: 'OBAT' },
              { title: 'ACCESORIES', value: 'ACCESORIES' },
            ]"
            item-title="title"
            item-value="value"
            density="compact"
            hide-details
            variant="outlined"
          ></v-select>
        </div>

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
        <v-btn
          color="error"
          variant="tonal"
          prepend-icon="mdi-filter-off"
          class="btn-detail reset-filter-btn ms-2"
          @click="resetAllFilters"
        >
          Reset Filter
        </v-btn>
        <v-spacer></v-spacer>
        <div class="d-flex align-center ga-2 text-caption font-weight-bold">
          <span class="text-red">● OPEN</span>
          <span class="text-blue">● ONPROSES</span>
          <span class="text-grey-darken-1">● CLOSE</span>
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          :headers="tableHeaders"
          :items="filteredItems"
          :loading="isLoading"
          item-value="Nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
          :item-props="(item: any) => ({ class: getRowTextColor(item as AccesoriesHeader) })"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  v-if="noFilterColumns.includes(header.key)"
                  :style="{
                    width: header.width + 'px',
                    minWidth: header.width + 'px',
                    maxWidth: header.width + 'px',
                  }"
                  class="resizable-header"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)"></div>
                </th>

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
                    <span>{{ header.title }}</span>

                    <v-icon v-if="isSorted(header)" size="14" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>

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

                      <v-list class="filter-menu">
                        <v-list-item @click.stop="clearColumnFilter(header.key)">
                          <v-list-item-title>(Select All)</v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <v-list-item
                          v-for="value in uniqueValues(header.key)"
                          :key="value"
                          @click.stop="toggleMultiSelectValue(header.key, value)"
                        >
                          <template #prepend>
                            <v-checkbox
                              density="compact"
                              :model-value="
                                columnFilters[header.key]?.type === 'multi' &&
                                columnFilters[header.key]?.values?.includes(value)
                              "
                              @click.stop="toggleMultiSelectValue(header.key, value)"
                            />
                          </template>
                          <v-list-item-title>
                            {{ formatFilterValue(header.key, value) }}
                          </v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <v-list-item @click.stop="openCustomFilter(header.key)">
                          <v-list-item-title class="custom-filter-item">
                            (Custom Filter…)
                          </v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>

                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)"></div>
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
            v-for="header in tableHeaders.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'Tanggal'">
                {{ item.Tanggal ? format(new Date(item.Tanggal), "dd/MM/yyyy") : "-" }}
              </template>

              <template v-else-if="header.key === 'Jam'">
                {{ item.Jam || "-" }}
              </template>

              <template v-else-if="header.key === 'Jenis'">
                <v-chip
                  size="x-small"
                  :color="item.Jenis === 'OBAT' ? 'purple-darken-1' : 'teal-darken-2'"
                  variant="flat"
                  class="font-weight-bold"
                >
                  {{ item.Jenis }}
                </v-chip>
              </template>

              <template v-else-if="header.key === 'Status'">
                <v-chip :color="getStatusChip(item).color" variant="tonal" size="x-small">
                  {{ getStatusChip(item).text }}
                </v-chip>
              </template>

              <template v-else-if="header.key === 'Approve'">
                <v-chip
                  :color="getApproveChip(item.Approve).color"
                  variant="outlined"
                  size="x-small"
                >
                  {{ getApproveChip(item.Approve).text }}
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
                <div
                  class="bg-blue-grey-lighten-5 pa-3 w-100"
                  style="box-shadow: inset 0px 4px 8px -4px rgba(0, 0, 0, 0.1)"
                >
                  <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-4 w-100">
                    <v-progress-circular indeterminate color="primary" />
                  </div>

                  <div v-else class="d-flex flex-column ga-3 w-100">
                    <v-card class="elevation-1 border" rounded="lg">
                      <div
                        class="bg-blue-darken-2 text-white text-caption font-weight-bold px-3 py-1 d-flex align-center"
                      >
                        Detail Data (Permintaan)
                      </div>
                      <v-data-table
                        :headers="detailHeaders"
                        :items="details[item.Nomor]?.items || []"
                        density="compact"
                        hide-default-footer
                        class="detail-table"
                      >
                        <template #[`item.jumlah`]="{ value }">
                          <span class="font-weight-bold">{{ value }}</span>
                        </template>

                        <template #[`item.realisasi`]="{ value, item: dtl }">
                          <span
                            class="font-weight-bold"
                            :class="value >= dtl.jumlah ? 'text-success' : 'text-orange-darken-3'"
                          >
                            {{ value }}
                          </span>
                        </template>
                      </v-data-table>
                    </v-card>

                    <v-row
                      v-if="details[item.Nomor]?.realisasi?.length > 0"
                      density="compact"
                      class="w-100 ma-0"
                    >
                      <v-col cols="12" md="6" class="pa-1 pl-0">
                        <v-card class="elevation-1 border h-100" rounded="lg">
                          <div
                            class="bg-indigo-darken-1 text-white text-caption font-weight-bold px-3 py-1 d-flex align-center justify-space-between"
                          >
                            <span>Realisasi : F7 = Approve</span>
                          </div>
                          <v-data-table
                            :headers="realisasiHeaders"
                            :items="details[item.Nomor]?.realisasi || []"
                            density="compact"
                            hide-default-footer
                            class="detail-table"
                            hover
                            @click:row="(event: Event, { item: rowItem }: { item: any }) =>
                              selectRealisasiRow(item.Nomor, rowItem.NoRealisasi)"
                            :item-props="(rowItem: any) => ({
                              class: selectedRealisasiMap[item.Nomor] === rowItem.NoRealisasi
                                ? 'bg-blue-lighten-5 font-weight-bold'
                              : 'cursor-pointer',
                          })"
                          >
                            <template #[`item.nomor`]="{ value }">{{ value }}</template>
                            <template #[`item.tanggal`]="{ value }">{{ value }}</template>
                            <template #[`item.jumlah`]="{ value }">
                              <span class="text-red font-weight-bold">{{ value }}</span>
                            </template>
                            <template #[`item.actions`]="{ item: dtl }">
                              <v-btn
                                v-if="!dtl.Approve"
                                size="x-small"
                                color="success"
                                variant="flat"
                                @click.stop="approveRealisasi(dtl.NoRealisasi, item.Nomor)"
                              >
                                Approve
                              </v-btn>
                              <div v-else class="text-success font-weight-bold text-caption">
                                {{ dtl.Approve }}
                              </div>
                            </template>
                          </v-data-table>
                        </v-card>
                      </v-col>

                      <v-col cols="12" md="6" class="pa-1 pr-0">
                        <v-card class="elevation-1 border h-100" rounded="lg">
                          <div
                            class="bg-grey-darken-2 text-white text-caption font-weight-bold px-3 py-1 d-flex align-center"
                          >
                            Isi Barang ({{ selectedRealisasiMap[item.Nomor] || "Pilih Realisasi" }})
                          </div>
                          <v-data-table
                            :headers="detailRealisasiHeaders"
                            :items="
                              (details[item.Nomor]?.realisasiDetails || []).filter(
                                (d) => d.NomorRealisasi === selectedRealisasiMap[item.Nomor]
                              )
                            "
                            density="compact"
                            hide-default-footer
                            class="detail-table"
                          >
                            <template #[`item.index`]="{ index }">{{ index + 1 }}</template>
                            <template #[`item.kode`]="{ value }">{{ value }}</template>
                            <template #[`item.nama`]="{ value }">{{ value }}</template>
                            <template #[`item.satuan`]="{ value }">{{ value }}</template>
                            <template #[`item.jumlah`]="{ value }">{{ value }}</template>
                          </v-data-table>
                        </v-card>
                      </v-col>
                    </v-row>

                    <v-alert
                      v-else
                      type="info"
                      variant="tonal"
                      density="compact"
                      class="text-caption"
                    >
                      Belum ada data realisasi dari pihak Garment/Produksi.
                    </v-alert>
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
        <v-card-title class="bg-blue text-white">
          <span class="text-h6">Close Manual Permintaan</span>
        </v-card-title>
        <v-card-text class="pt-4">
          <p class="text-caption text-grey-darken-1 mb-2">
            Menutup permintaan secara manual akan merubah status menjadi
            <strong>DICLOSE</strong> meskipun barang belum terealisasi sepenuhnya.
          </p>
          <v-textarea
            v-model="closeReason"
            label="Alasan Close Manual"
            rows="3"
            variant="outlined"
            autofocus
            :rules="[(v) => !!v || 'Alasan tidak boleh kosong']"
          ></v-textarea>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="blue" variant="flat" :loading="isClosing" @click="submitCloseManual"
            >Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold bg-error text-white">
          Konfirmasi Hapus
        </v-card-title>
        <v-card-text class="pt-4">
          {{ confirmText }}
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">Tidak</v-btn>
          <v-btn color="error" variant="flat" @click="executePendingAction">Ya, Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-h6 bg-primary text-white">
          Filter Kolom: {{ customFilter.key }}
        </v-card-title>
        <v-card-text class="pt-4">
          <v-select
            v-model="customFilter.operator"
            :items="[
              { title: '= sama dengan', value: '=' },
              { title: '≠ tidak sama', value: '!=' },
              { title: '> lebih besar', value: '>' },
              { title: '≥ lebih besar sama', value: '>=' },
              { title: '< lebih kecil', value: '<' },
              { title: '≤ lebih kecil sama', value: '<=' },
              { title: 'mengandung kata (contains)', value: 'contains' },
              { title: 'berawalan (starts with)', value: 'starts' },
              { title: 'berakhiran (ends with)', value: 'ends' },
            ]"
            label="Operator"
            density="compact"
            variant="outlined"
            class="mb-3"
          />
          <v-text-field
            v-model="customFilter.value"
            label="Nilai / Teks"
            density="compact"
            variant="outlined"
            autofocus
            @keydown.enter="applyCustomFilter"
          />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Batal</v-btn>
          <v-btn color="primary" variant="flat" @click="applyCustomFilter">Terapkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
:deep(.compact-select-list .v-list-item-title) {
  font-size: 11px !important;
}

.desktop-table :deep(td.text-red) {
  color: #d32f2f !important;
}

.desktop-table :deep(td.text-blue) {
  color: #1976d2 !important;
}

.desktop-table :deep(tr:hover td.text-red) {
  background-color: #ffebee !important;
}

/* --- Layout Baru --- */
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
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgb(var(--v-theme-on-surface));
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-section :deep(.v-field) {
  background-color: rgb(var(--v-theme-background)) !important;
  color: rgb(var(--v-theme-on-surface));
}

.filter-section :deep(input) {
  color: rgb(var(--v-theme-on-surface));
}

.filter-label {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-weight: 600;
  font-size: 11px;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

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

.resizable-header {
  position: relative;
  background-color: var(--table-head-bg) !important;
  color: var(--table-head-text) !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
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

/* --- Styling Detail Row Sticky --- */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  background-color: rgb(var(--v-theme-background));
  padding: 16px 16px 16px 64px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface));
}

.detail-table :deep(thead tr th) {
  background-color: rgb(var(--v-theme-surface-variant)) !important;
  color: rgb(var(--v-theme-on-surface-variant)) !important;
  font-size: 10px !important;
  font-weight: bold !important;
  height: 32px !important;
  text-transform: uppercase;
}

.detail-table :deep(td),
.detail-table :deep(th) {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1) !important;
}

.filter-section .btn-detail {
  height: 36px !important;
  width: auto !important;
  min-width: 120px !important;
  padding: 0 16px !important;
  font-size: 0.875rem !important;
  text-transform: none !important;
}

.reset-filter-btn {
  color: #d32f2f !important;
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}
</style>

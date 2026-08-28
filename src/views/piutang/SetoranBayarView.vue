<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter, onBeforeRouteLeave } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import type { AxiosError } from "axios";
import axios from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import ExcelJS from "exceljs";

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

interface SetoranHeader {
  Nomor: string;
  // Pastikan field Tanggal didefinisikan agar bisa diakses
  Tanggal?: string;
  Otomatis: string;
  Sisa: number;
  [key: string]: unknown;
}

interface SetoranDetail {
  TglBayar: string;
  Invoice: string;
  TglInvoice: string;
  JatuhTempo: string;
  Nominal: number;
  Bayar: number;
  Keterangan: string;
}

interface SetoranExportRow {
  "Tanggal Setoran"?: string | Date;
  "Tgl Bayar"?: string | Date;
  "Tgl Invoice"?: string | Date;
  [key: string]: unknown;
}

interface CabangItem {
  kode: string;
  nama: string;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "51";

// --- State ---
const masterData = ref<SetoranHeader[]>([]);
const details = ref<Record<string, SetoranDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<SetoranHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<CabangItem[]>([]);
const deleteLoading = ref(false);
const search = ref("");
let searchTimeout: ReturnType<typeof setTimeout>;

const SESSION_STATE_KEY = "setoran_bayar_browse_state";
const savedSession = sessionStorage.getItem(SESSION_STATE_KEY);
const parsedSession = savedSession ? JSON.parse(savedSession) : null;

const filters = reactive({
  startDate: parsedSession?.startDate ?? format(subDays(new Date(), 7), "yyyy-MM-dd"),
  endDate: parsedSession?.endDate ?? format(new Date(), "yyyy-MM-dd"),
  cabang: parsedSession?.cabang ?? ((authStore.user?.cabang || "") as string),
  search: parsedSession?.search ?? "",
});

const isConfirmDialogVisible = ref(false);
const confirmDialogText = ref("");
const isMounted = ref(false);

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));
const canBeEdited = computed(() => {
  if (selected.value.length !== 1) return false;
  const item = selected.value[0];
  return item.Otomatis !== "YA";
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "Nomor", width: 180, fixed: true },
  { title: "Tanggal", key: "Tanggal", width: 120 },
  { title: "Jenis Bayar", key: "JenisBayar", width: 120 },
  { title: "Nominal", key: "Nominal", width: 150 },
  { title: "Dibayarkan", key: "diBayarkan", width: 150 },
  { title: "Sisa", key: "Sisa", width: 150 },
  { title: "Posting", key: "Posting", align: "center", width: 100 },
  { title: "No SO", key: "NoSO", width: 180 },
  { title: "Kd Cus", key: "KdCus", width: 120 },
  { title: "Customer", key: "Customer", width: 250 },
  { title: "Alamat", key: "Alamat", width: 350 },
  { title: "Kota", key: "Kota", width: 150 },
  { title: "Telepon", key: "Telepon", width: 150 },
  { title: "Akun", key: "Akun", width: 120 },
  { title: "No Rekening", key: "NoRekening", width: 150 },
  { title: "Nama Bank", key: "NamaBank", width: 250 },
  { title: "Tgl Transfer", key: "TglTransfer", width: 120 },
  { title: "No Giro", key: "NoGiro", width: 150 },
  { title: "Tgl Giro", key: "TglGiro", width: 120 },
  { title: "Jatuh Tempo", key: "TglJatuhTempo", width: 120 },
  { title: "Keterangan", key: "Keterangan", width: 300 },
  { title: "Otomatis", key: "Otomatis", align: "center", width: 100 },
  { title: "Closing", key: "Closing", align: "center", width: 100 },
  { title: "User Create", key: "UserCreate", width: 150 },
  { title: "Date Create", key: "DateCreate", width: 150 },
  { title: "User Modified", key: "UserModified", width: 150 },
  { title: "Date Modified", key: "DateModified", width: 150 },
]);

const detailHeaders = [
  { title: "Tgl Bayar", key: "TglBayar", width: "120px" },
  { title: "Invoice", key: "Invoice", width: "180px" },
  { title: "Tgl Invoice", key: "TglInvoice", width: "120px" },
  { title: "Jatuh Tempo", key: "JatuhTempo", width: "120px" },
  { title: "Nominal", key: "Nominal", align: "end", width: 150 },
  { title: "Bayar", key: "Bayar", align: "end", width: 150 },
  { title: "Keterangan", key: "Keterangan", width: 200 },
] as const;

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
const handleRowClick = (_event: Event, { item }: { item: SetoranHeader }) => {
  selected.value = [item];
};

// --- Methods ---
// --- Fungsi Menyimpan State ke Session Storage ---
const saveStateToSession = () => {
  const stateToSave = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    cabang: filters.cabang,
    search: search.value, // Simpan teks dari field search lokal
  };
  sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateToSave));
};

const fetchCabangList = async () => {
  try {
    const response = await api.get("/setoran-bayar/lookup/cabang");
    cabangList.value = response.data;
  } catch (error: unknown) {
    // [FIX] Gunakan unknown
    let msg = "Gagal memuat daftar cabang.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg); // [FIX] Hanya kirim string
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  try {
    const response = await api.get("/setoran-bayar", { params: filters });
    masterData.value = response.data;
    selected.value = [];
    expanded.value = [];
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: SetoranHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/setoran-bayar/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      toast.error(
        `Gagal memuat detail untuk ${nomorToLoad}: ${err.response?.data?.message || err.message}`
      );
    } else {
      toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    }
    expanded.value = expanded.value.filter((k) => k !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

// const showDeleteConfirmation = () => {
//   if (!selectedRow.value) return;
//   // Validasi tambahan jika perlu (misal status closing)
//   confirmDialogText.value = `Yakin ingin menghapus Setoran ${selectedRow.value.Nomor}?`;
//   isConfirmDialogVisible.value = true;
// };

const executeDelete = async () => {
  if (!selectedRow.value) return;
  deleteLoading.value = true;
  try {
    const response = await api.delete(`/setoran-bayar/${selectedRow.value.Nomor}`);
    toast.success(response.data.message);
    fetchMasterData();
    selected.value = [];
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal menghapus data.");
  } finally {
    deleteLoading.value = false;
    isConfirmDialogVisible.value = false;
  }
};

const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
};

// --- 2. Fungsi Export Data (ExcelJS, mengikuti pola SoView.vue) ---

const getSetoranRowBg = (item: SetoranHeader): string | undefined => {
  if (item.Sisa !== 0) return "FFFFEBEE"; // merah muda — belum lunas
  if (item.Otomatis === "YA") return "FFE3F2FD"; // biru muda — otomatis
  return undefined;
};

const exportHeaderData = async () => {
  const currentList = masterData.value as SetoranHeader[];
  if (currentList.length === 0) {
    toast.warning("Tidak ada data header untuk diekspor.");
    return;
  }

  toast.info("Menyiapkan file export header...");

  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Setoran Header");

    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    const cols = [
      { header: "Nomor", key: "Nomor", width: 20, align: "left" as const },
      {
        header: "Tanggal",
        key: "Tanggal",
        width: 13,
        align: "center" as const,
        dateFmt: "date" as const,
      },
      { header: "Jenis Bayar", key: "JenisBayar", width: 14, align: "center" as const },
      { header: "Nominal", key: "Nominal", width: 16, align: "right" as const, fmt: "#,##0" },
      { header: "Dibayarkan", key: "diBayarkan", width: 16, align: "right" as const, fmt: "#,##0" },
      { header: "Sisa", key: "Sisa", width: 16, align: "right" as const, fmt: "#,##0" },
      { header: "Posting", key: "Posting", width: 12, align: "center" as const },
      { header: "No SO", key: "NoSO", width: 18, align: "left" as const },
      { header: "Kd Cus", key: "KdCus", width: 12, align: "center" as const },
      { header: "Customer", key: "Customer", width: 25, align: "left" as const },
      { header: "Alamat", key: "Alamat", width: 35, align: "left" as const },
      { header: "Kota", key: "Kota", width: 15, align: "left" as const },
      { header: "Telepon", key: "Telepon", width: 15, align: "left" as const },
      { header: "Akun", key: "Akun", width: 12, align: "center" as const },
      { header: "No Rekening", key: "NoRekening", width: 15, align: "left" as const },
      { header: "Nama Bank", key: "NamaBank", width: 22, align: "left" as const },
      {
        header: "Tgl Transfer",
        key: "TglTransfer",
        width: 13,
        align: "center" as const,
        dateFmt: "date" as const,
      },
      { header: "No Giro", key: "NoGiro", width: 15, align: "left" as const },
      {
        header: "Tgl Giro",
        key: "TglGiro",
        width: 13,
        align: "center" as const,
        dateFmt: "date" as const,
      },
      {
        header: "Jatuh Tempo",
        key: "TglJatuhTempo",
        width: 13,
        align: "center" as const,
        dateFmt: "date" as const,
      },
      { header: "Keterangan", key: "Keterangan", width: 30, align: "left" as const },
      { header: "Otomatis", key: "Otomatis", width: 10, align: "center" as const },
      { header: "Closing", key: "Closing", width: 10, align: "center" as const },
      { header: "User Create", key: "UserCreate", width: 14, align: "center" as const },
      {
        header: "Date Create",
        key: "DateCreate",
        width: 18,
        align: "center" as const,
        dateFmt: "datetime" as const,
      },
      { header: "User Modified", key: "UserModified", width: 14, align: "center" as const },
      {
        header: "Date Modified",
        key: "DateModified",
        width: 18,
        align: "center" as const,
        dateFmt: "datetime" as const,
      },
    ];

    sheet.columns = cols.map((c) => ({ width: c.width }));

    // Header row
    const headerRow = sheet.addRow(cols.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    currentList.forEach((item) => {
      const rowBg = getSetoranRowBg(item);

      const values = cols.map((c) => {
        const raw = item[c.key as keyof SetoranHeader];
        if (c.dateFmt === "date") {
          if (!raw) return "-";
          try {
            return format(parseISO(String(raw)), "dd/MM/yyyy");
          } catch {
            return "-";
          }
        }
        if (c.dateFmt === "datetime") {
          if (!raw) return "-";
          try {
            return format(parseISO(String(raw)), "dd/MM/yyyy HH:mm:ss");
          } catch {
            return "-";
          }
        }
        if (c.key === "Otomatis") return item.Otomatis === "YA" ? "YA" : "-";
        if (c.key === "Closing") return item.Closing === "Y" ? "YA" : "-";
        return (raw as string | number) ?? "";
      });

      const row = sheet.addRow(values);
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border = borderThin;
        cell.alignment = { horizontal: cols[colNum - 1]?.align ?? "left", vertical: "middle" };
        if (cols[colNum - 1]?.fmt) cell.numFmt = cols[colNum - 1].fmt!;
        if (rowBg) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
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
    a.download = `Export_Setoran_Header_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File Header berhasil diekspor.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data header.");
  }
};

const exportDetailData = async () => {
  toast.info("Mengambil data detail dari server...");

  try {
    const response = await api.get<SetoranExportRow[]>("/setoran-bayar/export-details", {
      params: filters,
    });

    const data = response.data;
    if (!data?.length) {
      toast.warning("Tidak ada data detail untuk diekspor pada filter ini.");
      return;
    }

    toast.info("Membuat file Excel Detail...");

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

    // ── Sheet 1: Detail Flat ───────────────────────────
    const sheet1 = workbook.addWorksheet("Setoran Detail");

    type DetailRow = Record<string, string | number | null | undefined>;
    const rows: DetailRow[] = data as DetailRow[];
    const keys = Object.keys(rows[0]);

    const getColDef = (key: string) => {
      const k = key.toLowerCase();
      if (k.includes("nomor")) return { width: 20, align: "left" as const };
      if (k.includes("tanggal") || k.includes("tgl"))
        return { width: 14, align: "center" as const };
      if (k.includes("customer") || k.includes("nama"))
        return { width: 26, align: "left" as const };
      if (k.includes("invoice")) return { width: 18, align: "left" as const };
      if (["bayar", "nominal"].some((s) => k.includes(s)))
        return { width: 16, align: "right" as const, fmt: "#,##0" };
      if (k.includes("keterangan")) return { width: 28, align: "left" as const };
      return { width: 16, align: "left" as const };
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

    // Kolom identitas (nomor setoran, tanggal, customer) hanya tampil di baris pertama per nomor
    const nomorKey = keys.find((k) => k.toLowerCase().includes("nomor setoran")) ?? keys[0];
    const identityKeys = new Set(
      keys.filter((k) => {
        const kl = k.toLowerCase();
        return (
          kl.includes("nomor setoran") || kl.includes("tanggal setoran") || kl.includes("customer")
        );
      })
    );

    const nomorColors: Record<string, string> = {};
    let toggle = false;
    let prevNomor = "";

    rows.forEach((row) => {
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
            return format(parseISO(v), "dd/MM/yyyy");
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

    // ── Sheet 2: Ringkasan per Nomor Setoran ───────────
    const sheet2 = workbook.addWorksheet("Ringkasan per Nomor");

    const sumCols = [
      { header: "Nomor Setoran", width: 20, align: "left" as const },
      { header: "Tanggal Setoran", width: 14, align: "center" as const },
      { header: "Customer", width: 26, align: "left" as const },
      { header: "Jumlah Baris", width: 13, align: "right" as const, fmt: "#,##0" },
      { header: "Total Bayar", width: 18, align: "right" as const, fmt: "#,##0" },
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

    const tglKey = keys.find((k) => k.toLowerCase() === "tanggal setoran") ?? "";
    const customerKey = keys.find((k) => k.toLowerCase() === "customer") ?? "";
    const bayarKey = keys.find((k) => k.toLowerCase() === "bayar") ?? "";

    const grouped = new Map<string, { rows: DetailRow[]; totalBayar: number }>();
    rows.forEach((row) => {
      const nomor = String(row[nomorKey] ?? "");
      if (!grouped.has(nomor)) grouped.set(nomor, { rows: [], totalBayar: 0 });
      const grp = grouped.get(nomor)!;
      grp.rows.push(row);
      if (bayarKey) grp.totalBayar += Number(row[bayarKey] ?? 0);
    });

    let grandTotal = 0;
    grouped.forEach((grp, nomor) => {
      const first = grp.rows[0];
      grandTotal += grp.totalBayar;
      const tglVal = first[tglKey];
      const tglStr =
        typeof tglVal === "string" && /^\d{4}-\d{2}-\d{2}/.test(tglVal)
          ? format(parseISO(tglVal), "dd/MM/yyyy")
          : String(tglVal ?? "-");

      const row = sheet2.addRow([
        nomor,
        tglStr,
        first[customerKey] ?? "",
        grp.rows.length,
        grp.totalBayar,
      ]);
      row.eachCell({ includeEmpty: true }, (cell, i) => {
        cell.border = borderThin;
        cell.alignment = { horizontal: sumCols[i - 1]?.align ?? "left", vertical: "middle" };
        if (sumCols[i - 1]?.fmt) cell.numFmt = sumCols[i - 1].fmt!;
      });
    });

    const totalRowNum = sheet2.rowCount + 1;
    const gtRow = sheet2.addRow(["GRAND TOTAL :", "", "", grouped.size, grandTotal]);
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
    a.download = `Export_Setoran_Detail_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File Detail berhasil diekspor (2 sheet).");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data detail.");
  }
};

const getRowTextColor = (item: SetoranHeader) => {
  if (item.Sisa !== 0) return "text-red font-weight-bold";
  if (item.Otomatis === "YA") return "text-blue font-weight-bold";
  return "";
};

const printData = () => {
  const nomor = selectedRow.value?.Nomor;
  if (!nomor) {
    toast.error("Pilih data terlebih dahulu");
    return;
  }
  const url = router.resolve({ name: "CetakSetoranBayar", params: { nomor } }).href;
  window.open(url, "_blank");
};

onMounted(async () => {
  // 1. Coba baca state pencarian dari Session Storage terlebih dahulu
  const savedState = sessionStorage.getItem(SESSION_STATE_KEY);

  if (savedState) {
    try {
      const parsedState = JSON.parse(savedState);

      // Kembalikan nilai filter dari session
      if (parsedState.startDate) filters.startDate = parsedState.startDate;
      if (parsedState.endDate) filters.endDate = parsedState.endDate;
      if (parsedState.cabang) filters.cabang = parsedState.cabang;

      // Kembalikan teks pencarian
      if (parsedState.search) {
        search.value = parsedState.search;
        filters.search = parsedState.search; // Sinkronisasi ke backend request
      }
    } catch (e) {
      console.error("Gagal membaca state filter dari sessionStorage", e);
    }
  }

  // 2. Ambil daftar cabang
  await fetchCabangList();

  // 3. Ambil data
  await fetchMasterData();

  isMounted.value = true;
});

// Debounce Search
watch(search, (newVal) => {
  if (!isMounted.value) return;

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    filters.search = newVal; // Update filter payload backend
    saveStateToSession(); // Simpan ke session saat search dieksekusi
    fetchMasterData();
  }, 500); // Jeda 500ms
});

// Watch filter lain (langsung fetch & simpan)
watch(
  () => [filters.startDate, filters.endDate, filters.cabang],
  () => {
    if (!isMounted.value) return;

    saveStateToSession(); // Simpan ke session
    fetchMasterData();
  }
);

// Deteksi saat user meninggalkan halaman ini ke menu yang TIDAK ADA HUBUNGANNYA
onBeforeRouteLeave((to, from, next) => {
  // Daftar URL yang dianggap "masih ada hubungannya" dengan Browse Setoran
  const relatedPaths = [
    "/setoran-pembayaran/create",
    "/setoran-pembayaran/edit",
    "/setoran-pembayaran", // Tambahkan route lain kalau ada
  ];

  const isRelatedPage = relatedPaths.some((p) => to.path.includes(p));

  if (!isRelatedPage) {
    // Jika pergi ke menu lain (misal: /dashboard), bersihkan memori!
    sessionStorage.removeItem(SESSION_STATE_KEY);
  }

  next(); // Lanjutkan perpindahan halaman
});
</script>

<template>
  <PageLayout title="Browse Setoran Pembayaran" icon="mdi-cash-multiple">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        prepend-icon="mdi-plus"
        color="primary"
        @click="router.push({ name: 'SetoranBayarCreate' })"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!canBeEdited"
        prepend-icon="mdi-pencil"
        @click="router.push({ name: 'SetoranBayarEdit', params: { nomor: selected[0].Nomor } })"
      >
        Ubah
      </v-btn>
      <!-- <v-btn size="small" color="error" prepend-icon="mdi-delete" :loading="deleteLoading" :disabled="!isSingleSelected"
        @click="showDeleteConfirmation">
        Hapus
      </v-btn> -->
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        color="green"
        :disabled="!isSingleSelected"
        @click="printData"
        prepend-icon="mdi-printer"
      >
        Cetak
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportHeaderData">
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportDetailData">
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
          style="max-width: 140px"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 140px"
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
        <v-text-field
          v-model="search"
          label="Cari nomor, customer..."
          density="compact"
          hide-details
          variant="outlined"
          clearable
          style="min-width: 250px"
          prepend-inner-icon="mdi-magnify"
        />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> Otomatis
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Lunas
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
                <th
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
                    <v-icon v-if="isSorted(header)" size="small" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>
                  </div>
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
            v-for="header in headers.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td
              :class="[
                getRowTextColor(item),
                header.align === 'end'
                  ? 'text-end'
                  : header.align === 'center'
                  ? 'text-center'
                  : '',
              ]"
            >
              <template v-if="['DateCreate', 'DateModified'].includes(header.key)">
                {{
                  item[header.key]
                    ? format(parseISO(item[header.key] as string), "dd/MM/yyyy HH:mm:ss")
                    : "-"
                }}
              </template>
              <template
                v-else-if="
                  ['Tanggal', 'TglTerima', 'TglTransfer', 'TglGiro', 'TglJatuhTempo'].includes(
                    header.key
                  )
                "
              >
                {{
                  item[header.key]
                    ? format(parseISO(item[header.key] as string), "dd/MM/yyyy")
                    : "-"
                }}
              </template>
              <template v-else-if="['Nominal', 'diBayarkan', 'Sisa'].includes(header.key)">
                {{ formatRupiah(item[header.key] as number) }}
              </template>
              <template v-else-if="header.key === 'Posting'">
                <v-chip size="x-small" :color="item.Posting === 'SUDAH' ? 'green' : 'grey'">{{
                  item.Posting
                }}</v-chip>
              </template>
              <template v-else-if="header.key === 'Otomatis'">
                <v-chip
                  v-if="item.Otomatis === 'YA'"
                  size="x-small"
                  color="blue-darken-2"
                  variant="tonal"
                  >YA</v-chip
                >
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success" variant="tonal"
                  >YA</v-chip
                >
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
                    <div
                      v-if="loadingDetails.has(item.Nomor)"
                      class="text-center pa-4 text-caption"
                    >
                      Memuat detail...
                    </div>
                    <v-data-table
                      v-else
                      :headers="detailHeaders"
                      :items="details[item.Nomor]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.TglBayar`]="{ value }">
                        {{ value ? format(parseISO(value as string), "dd/MM/yyyy") : "" }}
                      </template>
                      <template #[`item.TglInvoice`]="{ value }">
                        {{ value ? format(parseISO(value as string), "dd/MM/yyyy") : "" }}
                      </template>
                      <template #[`item.Nominal`]="{ value }">
                        {{ formatRupiah(value as number) }}
                      </template>
                      <template #[`item.Bayar`]="{ value }">
                        {{ formatRupiah(value as number) }}
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>{{ confirmDialogText }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="closeConfirmDialog">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="executeDelete" :loading="deleteLoading"
            >Ya, Hapus</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* --- Layout Full Height --- */
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

.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section:deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* --- Tabel Style --- */
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

/* --- Header Resize --- */
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
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Samakan padding td dengan th agar align rata kanan lurus */
.desktop-table :deep(td) {
  padding: 0 8px !important;
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
  border-right: 2px solid rgba(var(--v-theme-on-primary), 0.6);
}

/* --- Detail Sticky --- */
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
  max-width: 900px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

:deep(td.text-blue) {
  color: rgb(var(--v-theme-primary)) !important;
}

:deep(.v-dialog) .v-card {
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
</style>

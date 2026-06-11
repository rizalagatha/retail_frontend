<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import MasterProductSearchModal from "@/components/lookup/MasterProductSearchModal.vue";
import ExcelJS from "exceljs";
import axios from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

// --- Interface Header (Resize) ---
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

interface SjHeader {
  Nomor: string;
  NomorTerima: string;
  Tanggal?: string | null;
  TglTerima?: string | null;
  Closing?: string;
  Source?: "DC" | "WORKSHOP";
  [key: string]: unknown;
}

interface ErrorResponse {
  message?: string;
}

// Interface untuk data Detail dari API (sesuai alias di Query SQL)
interface SjExportDetailRow {
  "Tanggal SJ"?: string | Date;
  "Tanggal Terima"?: string | Date;
  [key: string]: unknown;
}

interface CabangItem {
  kode: string;
  nama: string;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
// const MENU_ID = '31';

// --- State ---
const masterData = ref<SjHeader[]>([]);
const details = ref<Record<string, unknown[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<SjHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<CabangItem[]>([]);
const isMasterProductSearchVisible = ref(false);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: (authStore.user?.cabang || "") as string, // [PERBAIKAN] Force string
  kodeBarang: "",
  namaBarang: "",
  source: "ALL",
});

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = computed<DataTableHeader[]>(() => {
  const baseHeaders: DataTableHeader[] = [
    { title: "", key: "data-table-expand", width: 50, fixed: true },
    { title: "Nomor SJ", key: "Nomor", width: 180, fixed: true },
    { title: "Tanggal SJ", key: "Tanggal", width: 120 },
    { title: "Nomor Minta", key: "NomorMinta", width: 180 },
    { title: "Source", key: "Source", width: 100, align: "center" },
  ];

  // Tambahkan No. Invoice HANYA jika KDC atau KPR
  if (showInvoiceColumn.value) {
    baseHeaders.push({ title: "No. Invoice", key: "NoInvoice", width: 160 });
  }

  baseHeaders.push(
    { title: "Nomor Terima", key: "NomorTerima", width: 180 },
    { title: "Tgl Terima", key: "TglTerima", width: 120 },
    { title: "Store", key: "Store", width: 100 },
    { title: "Nama Store", key: "Nama_Store", width: 200 },
    { title: "Keterangan", key: "Keterangan", width: 300 },
    { title: "Batas", key: "BatasHari", width: 80, align: "center" },
    { title: "Status", key: "StatusDeadline", width: 120, align: "center" },
    { title: "Closing", key: "Closing", align: "center", width: 100 }
  );

  return baseHeaders;
});

const detailHeaders = [
  { title: "Kode", key: "Kode", width: "150px" },
  { title: "Nama Barang", key: "Nama", width: "300px" },
  { title: "Ukuran", key: "Ukuran", width: "100px" },
  { title: "Jumlah", key: "Jumlah", align: "end", width: "100px" },
  { title: "Jumlah Terima", key: "JumlahTerima", align: "end", width: "120px" },
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
const handleRowClick = (_event: Event, { item }: { item: SjHeader }) => {
  selected.value = [item];
};

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));
const isK01 = computed(() => authStore.user?.cabang === "K01");
const isKpr = computed(() => authStore.user?.cabang === "KPR");
const isKon = computed(() => authStore.user?.cabang === "KON");
const isKdb = computed(() => authStore.user?.cabang === "KDB");
const isAdmin = computed(() => authStore.user?.kode?.toLowerCase() === "admin");
const isKbl = computed(() => authStore.user?.cabang === "KBL");

const terimaDisabledReason = computed(() => {
  if (!isSingleSelected.value) {
    return "Pilih tepat satu SJ terlebih dahulu.";
  }

  if (selectedRow.value?.NomorTerima) {
    return "SJ ini sudah diterima.";
  }

  // SJ Workshop boleh diterima semua cabang (tidak perlu cek cabang)
  if (selectedRow.value?.Source === "WORKSHOP") {
    return "";
  }

  // SJ DC — hanya cabang tertentu atau admin
  if (
    !isAdmin.value &&
    !isK01.value &&
    !isKpr.value &&
    !isKon.value &&
    !isKdb.value &&
    !isKbl.value
  ) {
    return "Penerimaan SJ cabang selain K01, KPR, KON, KBL & KDB wajib melalui Aplikasi Kaosan Mobile.";
  }

  return "";
});

const showInvoiceColumn = computed(() => {
  const cb = authStore.user?.cabang;
  return cb === "KDC" || cb === "KPR";
});

const batalDisabledReason = computed(() => {
  // Pengecekan isK01 dihapus agar semua cabang bisa akses
  if (!isSingleSelected.value) {
    return "Pilih tepat satu SJ terlebih dahulu.";
  }
  if (!selectedRow.value?.NomorTerima) {
    return "SJ belum diterima.";
  }
  if (selectedRow.value?.Closing === "Y") {
    return "Penerimaan sudah closing.";
  }
  return "";
});

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/terima-sj/lookup/cabang");
    cabangList.value = response.data;
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  try {
    const response = await api.get("/terima-sj", { params: filters });
    masterData.value = response.data;
    selected.value = [];
    expanded.value = [];
  } catch (error: unknown) {
    if (axios.isAxiosError<ErrorResponse>(error)) {
      toast.error(error.response?.data?.message || "Gagal mengambil data.");
    } else {
      console.error("Unexpected error:", error);
      toast.error("Gagal mengambil data.");
    }
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: SjHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    // ← deteksi source dari data row
    const endpoint =
      itemToLoad.Source === "WORKSHOP"
        ? `/operasional/workshop/sj-workshop/${nomorToLoad}` // endpoint detail SJ Workshop
        : `/terima-sj/details/${nomorToLoad}`; // endpoint detail SJ DC

    const response = await api.get(endpoint);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    expanded.value = expanded.value.filter((nomor) => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const handleTerima = () => {
  if (!selectedRow.value) return;
  router.push({ name: "TerimaSjCreate", params: { nomor: selectedRow.value.Nomor } });
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleBatalTerima = () => {
  const row = selectedRow.value;
  if (!row) return;

  showConfirmation(
    "Konfirmasi Pembatalan",
    `Yakin ingin membatalkan penerimaan untuk SJ ${row.Nomor}?`,
    async () => {
      try {
        const payload = {
          header: {
            nomorSj: row.Nomor,
            nomorMinta: row.NomorMinta as string,
            tanggalTerima: format(new Date(), "yyyy-MM-dd"),
            isWorkshop: row.Source === "WORKSHOP", // ← tambah
          },
          items: [],
        };

        const response = await api.post("/terima-sj-form/save", payload);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (err: unknown) {
        let msg = "Gagal membatalkan penerimaan.";
        if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
        toast.error(msg);
      }
    }
  );
};

const onProductSelected = (product: { kode: string; nama: string }) => {
  filters.kodeBarang = product.kode;
  filters.namaBarang = product.nama;
  isMasterProductSearchVisible.value = false;
};

const getRowTextColor = (item: SjHeader) => {
  if (!item.NomorTerima) return "text-red font-weight-bold";
  return "";
};

// --- 2. Helper Format Tanggal ---
// const formatDateIndo = (dateString: string | Date | null | undefined) => {
//   if (!dateString) return "";
//   const date = new Date(dateString);
//   if (isNaN(date.getTime())) return "";
//   return new Intl.DateTimeFormat("id-ID", {
//     day: "numeric",
//     month: "long",
//     year: "numeric",
//   }).format(date);
// };

// --- 3. Fungsi Export Data ---
const exportData = async (type: "header" | "detail") => {
  toast.info(`Menyiapkan export ${type}...`);

  try {
    const ExcelJS = (await import("exceljs")).default;

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

    // ══════════════════════════════════════════════════════
    // EXPORT HEADER
    // ══════════════════════════════════════════════════════
    if (type === "header") {
      const currentList = masterData.value;
      if (currentList.length === 0) return toast.warning("Tidak ada data untuk diekspor.");

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Terima SJ Header");

      const cols = [
        { header: "Nomor SJ", key: "Nomor", width: 20, align: "left" as const },
        { header: "Tanggal SJ", key: "Tanggal", width: 14, align: "center" as const },
        { header: "Nomor Minta", key: "NomorMinta", width: 20, align: "left" as const },
        { header: "No. Invoice", key: "NoInvoice", width: 20, align: "left" as const },
        { header: "Nomor Terima", key: "NomorTerima", width: 20, align: "left" as const },
        { header: "Tgl Terima", key: "TglTerima", width: 14, align: "center" as const },
        { header: "Store", key: "Store", width: 10, align: "center" as const },
        { header: "Nama Store", key: "Nama_Store", width: 22, align: "left" as const },
        { header: "Keterangan", key: "Keterangan", width: 30, align: "left" as const },
        { header: "Batas Hari", key: "BatasHari", width: 10, align: "center" as const },
        { header: "Status Deadline", key: "StatusDeadline", width: 16, align: "center" as const },
        { header: "Closing", key: "Closing", width: 10, align: "center" as const },
      ];

      sheet.columns = cols.map((c) => ({ width: c.width }));

      const headerRow = sheet.addRow(cols.map((c) => c.header));
      headerRow.height = 22;
      headerRow.eachCell({ includeEmpty: true }, (cell) => applyHeader(cell));

      currentList.forEach((item) => {
        // Warna baris: merah muda jika belum diterima
        const rowBg = !item.NomorTerima ? "FFFFEBEE" : undefined;

        const values = cols.map((c) => {
          if (c.key === "Tanggal") {
            return item.Tanggal ? format(parseISO(item.Tanggal as string), "dd/MM/yyyy") : "-";
          }
          if (c.key === "TglTerima") {
            return item.TglTerima ? format(parseISO(item.TglTerima as string), "dd/MM/yyyy") : "-";
          }
          if (c.key === "Closing") return item.Closing === "Y" ? "Ya" : "Tidak";
          return (item[c.key] as string | number) ?? "";
        });

        const row = sheet.addRow(values);
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.border = borderThin;
          cell.alignment = { horizontal: cols[colNum - 1]?.align ?? "left", vertical: "middle" };
          if (rowBg) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
          }
          // Warna font kolom Status Deadline
          if (cols[colNum - 1]?.key === "StatusDeadline" && !item.NomorTerima) {
            const color =
              item.StatusDeadline === "EKSEKUSI"
                ? "FFC62828"
                : item.StatusDeadline === "TERLAMBAT"
                ? "FFFB8C00"
                : "FF757575";
            cell.font = { bold: true, color: { argb: color } };
          }
        });
      });

      // Grand total — jumlah SJ
      const totalRowNum = sheet.rowCount + 1;
      const totalRow = sheet.addRow([
        `TOTAL : ${currentList.length} SJ`,
        ...Array(cols.length - 1).fill(""),
      ]);
      sheet.mergeCells(`A${totalRowNum}:L${totalRowNum}`);
      totalRow.height = 20;
      totalRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
        cell.border = borderMedium;
        cell.alignment = { horizontal: "left", vertical: "middle" };
      });

      sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Export_TerimaSJ_Header_${filters.startDate}_${filters.endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("File Header berhasil diekspor.");

      // ══════════════════════════════════════════════════════
      // EXPORT DETAIL
      // ══════════════════════════════════════════════════════
    } else {
      const response = await api.get<SjExportDetailRow[]>("/terima-sj/export-details", {
        params: filters,
      });

      if (!response.data?.length) return toast.warning("Tidak ada data detail untuk diekspor.");

      const workbook = new ExcelJS.Workbook();

      type DetailRow = Record<string, string | number | null | undefined>;
      const data: DetailRow[] = response.data as DetailRow[];

      // ── Sheet 1: Detail Flat ─────────────────────────
      const sheet1 = workbook.addWorksheet("Detail Terima SJ");

      const cols = [
        { header: "Nomor SJ", key: "Nomor SJ", width: 20, align: "left" as const },
        { header: "Tanggal SJ", key: "Tanggal SJ", width: 14, align: "center" as const },
        { header: "Nomor Terima", key: "Nomor Terima", width: 20, align: "left" as const },
        { header: "Tanggal Terima", key: "Tanggal Terima", width: 16, align: "center" as const },
        { header: "Kode Store", key: "Kode Store", width: 12, align: "center" as const },
        { header: "Nama Store", key: "Nama Store", width: 22, align: "left" as const },
        { header: "Kode Barang", key: "Kode Barang", width: 18, align: "left" as const },
        { header: "Nama Barang", key: "Nama Barang", width: 40, align: "left" as const },
        { header: "Ukuran", key: "Ukuran", width: 10, align: "center" as const },
        {
          header: "Jumlah Kirim",
          key: "Jumlah Kirim",
          width: 13,
          align: "right" as const,
          fmt: "#,##0",
        },
      ];

      sheet1.columns = cols.map((c) => ({ width: c.width }));

      const headerRow1 = sheet1.addRow(cols.map((c) => c.header));
      headerRow1.height = 22;
      headerRow1.eachCell({ includeEmpty: true }, (cell) => applyHeader(cell));

      // Alternating color + kosongkan kolom identitas per nomor SJ
      const nomorKey = "Nomor SJ";
      const identityKeys = new Set([
        "Nomor SJ",
        "Tanggal SJ",
        "Nomor Terima",
        "Tanggal Terima",
        "Kode Store",
        "Nama Store",
      ]);
      const nomorColors: Record<string, string> = {};
      let toggle = false;
      let prevNomor = "";
      let grandTotal = 0;

      data.forEach((row) => {
        const nomor = String(row[nomorKey] ?? "");
        if (!(nomor in nomorColors)) {
          nomorColors[nomor] = toggle ? "FFF3F8FD" : "FFFAFAFA";
          toggle = !toggle;
        }
        const isNewNomor = nomor !== prevNomor;
        prevNomor = nomor;

        grandTotal += Number(row["Jumlah Kirim"] ?? 0);

        const values = cols.map((c) => {
          if (identityKeys.has(c.key) && !isNewNomor) return "";
          const v = row[c.key];
          // Format tanggal ISO
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
          cell.border = {
            left: { style: "thin" },
            right: { style: "thin" },
            bottom: { style: "thin" },
            top: isNewNomor ? { style: "medium" } : { style: "thin" },
          };
          cell.alignment = { horizontal: cols[colNum - 1]?.align ?? "left", vertical: "middle" };
          if (cols[colNum - 1]?.fmt) cell.numFmt = cols[colNum - 1].fmt!;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: nomorColors[nomor] } };
        });
      });

      // Grand total
      const gtRowNum = sheet1.rowCount + 1;
      const gtValues = cols.map((c, i) => {
        if (i === 0) return "GRAND TOTAL :";
        if (c.key === "Jumlah Kirim") return grandTotal;
        return "";
      });
      const gtRow = sheet1.addRow(gtValues);
      sheet1.mergeCells(`A${gtRowNum}:I${gtRowNum}`);
      gtRow.height = 22;
      gtRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
        cell.border = borderMedium;
        cell.alignment = { horizontal: cols[colNum - 1]?.align ?? "right", vertical: "middle" };
        if (cols[colNum - 1]?.fmt) cell.numFmt = cols[colNum - 1].fmt!;
      });

      // ── Sheet 2: Ringkasan per Nomor SJ ──────────────
      const sheet2 = workbook.addWorksheet("Ringkasan per SJ");

      const sumCols = [
        { header: "Nomor SJ", width: 20, align: "left" as const },
        { header: "Tanggal SJ", width: 14, align: "center" as const },
        { header: "Nama Store", width: 22, align: "left" as const },
        { header: "Nomor Terima", width: 20, align: "left" as const },
        { header: "Tgl Terima", width: 14, align: "center" as const },
        { header: "Total Item", width: 10, align: "right" as const, fmt: "#,##0" },
        { header: "Total Qty", width: 13, align: "right" as const, fmt: "#,##0" },
        { header: "Status", width: 14, align: "center" as const },
      ];

      sheet2.columns = sumCols.map((c) => ({ width: c.width }));
      const sumHeader = sheet2.addRow(sumCols.map((c) => c.header));
      sumHeader.height = 22;
      sumHeader.eachCell({ includeEmpty: true }, (cell) => applyHeader(cell));

      const grouped = new Map<string, { rows: DetailRow[]; totalQty: number }>();
      data.forEach((row) => {
        const nomor = String(row[nomorKey] ?? "");
        if (!grouped.has(nomor)) grouped.set(nomor, { rows: [], totalQty: 0 });
        const grp = grouped.get(nomor)!;
        grp.rows.push(row);
        grp.totalQty += Number(row["Jumlah Kirim"] ?? 0);
      });

      let grandQty2 = 0;
      grouped.forEach((grp, nomor) => {
        const first = grp.rows[0];
        grandQty2 += grp.totalQty;

        const tglSj = String(first["Tanggal SJ"] ?? "");
        const tglTerima = String(first["Tanggal Terima"] ?? "");
        const status = first["Nomor Terima"] ? "Sudah Diterima" : "Belum Diterima";

        const row = sheet2.addRow([
          nomor,
          tglSj && /^\d{4}-\d{2}-\d{2}/.test(tglSj)
            ? format(parseISO(tglSj), "dd/MM/yyyy")
            : tglSj || "-",
          first["Nama Store"] ?? "",
          first["Nomor Terima"] ?? "-",
          tglTerima && /^\d{4}-\d{2}-\d{2}/.test(tglTerima)
            ? format(parseISO(tglTerima), "dd/MM/yyyy")
            : tglTerima || "-",
          grp.rows.length,
          grp.totalQty,
          status,
        ]);

        row.eachCell({ includeEmpty: true }, (cell, i) => {
          cell.border = borderThin;
          cell.alignment = { horizontal: sumCols[i - 1]?.align ?? "left", vertical: "middle" };
          if (sumCols[i - 1]?.fmt) cell.numFmt = sumCols[i - 1].fmt!;
          // Warna font status
          if (i === 8) {
            cell.font = {
              bold: true,
              color: { argb: status === "Sudah Diterima" ? "FF2E7D32" : "FFC62828" },
            };
          }
        });
      });

      // Grand total sheet 2
      const gt2RowNum = sheet2.rowCount + 1;
      const gt2Row = sheet2.addRow(["GRAND TOTAL :", "", "", "", "", grouped.size, grandQty2, ""]);
      sheet2.mergeCells(`A${gt2RowNum}:E${gt2RowNum}`);
      gt2Row.height = 22;
      gt2Row.eachCell({ includeEmpty: true }, (cell, i) => {
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
      a.download = `Export_TerimaSJ_Detail_${filters.startDate}_${filters.endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("File Detail berhasil diekspor (2 sheet).");
    }
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data.");
  }
};

const openMasterProductSearch = () => {
  isMasterProductSearchVisible.value = true;
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });

watch(
  () => filters.kodeBarang,
  (newVal) => {
    if (!newVal) filters.namaBarang = "";
  }
);
</script>

<template>
  <PageLayout title="Terima SJ dari DC" icon="mdi-package-down">
    <template #header-actions>
      <v-tooltip location="bottom" :disabled="!terimaDisabledReason">
        <template #activator="{ props }">
          <span v-bind="props">
            <v-btn
              size="small"
              color="primary"
              prepend-icon="mdi-check"
              :disabled="!!terimaDisabledReason"
              @click="handleTerima"
            >
              Terima
            </v-btn>
          </span>
        </template>

        <span style="font-size: 12px">
          {{ terimaDisabledReason }}
        </span>
      </v-tooltip>
      <v-tooltip location="bottom" :disabled="!batalDisabledReason">
        <template #activator="{ props }">
          <span v-bind="props">
            <v-btn
              size="small"
              color="error"
              prepend-icon="mdi-undo"
              :disabled="!!batalDisabledReason"
              @click="handleBatalTerima"
            >
              Batal Terima
            </v-btn>
          </span>
        </template>

        <span style="font-size: 12px">
          {{ batalDisabledReason }}
        </span>
      </v-tooltip>
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
        <span class="filter-label">Tanggal SJ:</span>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 140px"
        />
        <span class="mx-2">s/d</span>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 140px"
        />
        <v-select
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 200px"
          label="Cabang"
        />

        <v-text-field
          v-model="filters.kodeBarang"
          placeholder="Kode Barang (F1)"
          density="compact"
          hide-details
          clearable
          variant="outlined"
          class="ms-4 filter-kode"
          @click="openMasterProductSearch"
          @keydown.f1.prevent="openMasterProductSearch"
        >
          <template #append-inner>
            <v-icon @click="openMasterProductSearch">mdi-magnify</v-icon>
          </template>
        </v-text-field>

        <v-text-field
          v-model="filters.namaBarang"
          placeholder="Nama Barang"
          density="compact"
          hide-details
          readonly
          variant="outlined"
          class="filter-nama"
        />
        <v-btn-toggle
          v-model="filters.source"
          density="compact"
          variant="outlined"
          color="primary"
          mandatory
          class="ms-2 source-toggle"
        >
          <v-btn value="ALL" size="small">Semua</v-btn>
          <v-btn value="DC" size="small">DC</v-btn>
          <v-btn value="WORKSHOP" size="small">Workshop</v-btn>
        </v-btn-toggle>

        <v-spacer></v-spacer>
        <div class="d-flex align-center ga-2 text-caption">
          <div
            style="
              width: 12px;
              height: 12px;
              border-radius: 3px;
              background-color: #ef5350;
              flex-shrink: 0;
            "
          ></div>
          Belum Diterima
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
          <template #[`item.NoInvoice`]="{ item }">
            <span class="font-weight-bold text-blue-darken-2">
              {{ item.NoInvoice || "-" }}
            </span>
          </template>

          <template #[`item.StatusDeadline`]="{ item }">
            <v-chip
              v-if="!item.NomorTerima"
              size="x-small"
              :color="
                item.StatusDeadline === 'EKSEKUSI'
                  ? 'red'
                  : item.StatusDeadline === 'TERLAMBAT'
                  ? 'orange'
                  : 'grey-lighten-1'
              "
              variant="flat"
              class="font-weight-bold"
            >
              {{ item.StatusDeadline }}
            </v-chip>
            <v-icon v-else color="success" size="small">mdi-check-circle</v-icon>
          </template>

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
            <td :class="getRowTextColor(item)">
              <template v-if="['Tanggal', 'TglTerima'].includes(header.key)">
                {{
                  item[header.key] ? format(parseISO(item[header.key] as string), "dd/MM/yyyy") : ""
                }}
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="green" variant="tonal"
                  >YA</v-chip
                >
                <v-chip v-else size="x-small" color="grey" variant="tonal">TIDAK</v-chip>
              </template>
              <template v-else-if="header.key === 'Source'">
                <v-chip
                  size="x-small"
                  :color="item.Source === 'WORKSHOP' ? 'purple' : 'blue'"
                  variant="flat"
                  class="font-weight-bold"
                >
                  {{ item.Source }}
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
                      <template #[`item.Jumlah`]="{ value }">
                        {{ Number(value).toLocaleString() }}
                      </template>
                      <template #[`item.JumlahTerima`]="{ value }">
                        <span
                          :class="Number(value) > 0 ? 'text-green-darken-2 font-weight-bold' : ''"
                        >
                          {{
                            value !== undefined && value !== null
                              ? Number(value).toLocaleString()
                              : "-"
                          }}
                        </span>
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
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <MasterProductSearchModal
      v-if="isMasterProductSearchVisible"
      :gudang="filters.cabang"
      @close="isMasterProductSearchVisible = false"
      @product-selected="onProductSelected"
    />
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
  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;

  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;

  border-bottom: 2px solid rgb(var(--v-theme-primary)) !important;
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
  border-right: 2px solid #1565c0;
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
  max-width: 800px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

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

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

/* Override global CSS untuk v-btn-toggle di filter */
.source-toggle :deep(.v-btn) {
  height: 28px !important;
  width: auto !important; /* ← override width: 28px dari global */
  min-width: 48px !important;
  padding: 0 10px !important;
  font-size: 11px !important;
}

/* Di <style scoped> — tambah ini */
.filter-kode :deep(.v-field) {
  width: 150px !important;
  min-width: 150px !important;
}

.filter-nama :deep(.v-field) {
  width: 280px !important;
  min-width: 280px !important;
}
</style>

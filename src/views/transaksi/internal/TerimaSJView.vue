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

// --- Tracking Interfaces ---
interface TrackingSjInfo {
  sjNomor: string;
  sjTanggal?: string;
  sjJam?: string;
  noMinta?: string;
  manifestNomor?: string;
  noTerima?: string;
  storeKode: string;
  storeNama: string;
  keterangan?: string;
  userCreateSj?: string;
  dateCreateSj?: string;
  source: "DC" | "WORKSHOP";
  noPackingList?: string;
  noInvoice?: string;
}

interface TrackingManifestInfo {
  manifestNomor: string;
  manifestTanggal?: string;
  manifestJam?: string;
  gudangAsal?: string;
  namaGudangAsal?: string;
  gudangTujuan?: string;
  namaGudangTujuan?: string;
  manifestStatus: string;
  jenisKirim?: string;
  driver?: string;
  platNomor?: string;
  ekspedisi?: string;
  noResi?: string;
  totalSj?: number;
  totalKoli?: number;
  totalQty?: number;
  beratKg?: number;
  keterangan?: string;
  hasTtdPengirim?: number;
  hasTtdDriver?: number;
  userCreateManifest?: string;
  dateCreateManifest?: string;
  userModifiedManifest?: string;
  dateModifiedManifest?: string;
}

interface TrackingTerimaInfo {
  noTerima: string;
  tanggalTerima?: string;
  jamTerima?: string;
  closing?: string;
  keterangan?: string;
  userTerima?: string;
  dateCreateTerima?: string;
}

interface TrackingData {
  sj: TrackingSjInfo;
  manifest: TrackingManifestInfo | null;
  terima: TrackingTerimaInfo | null;
  currentStatus: "BELUM_MANIFEST" | "DRAFT" | "DIKIRIM" | "DITERIMA";
  isWorkshop: boolean;
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

// --- State Tracking Lacak Proses Manifest ---
const dialogTracking = reactive({
  show: false,
  loading: false,
  data: null as TrackingData | null,
});
const selectedStepKey = ref<string>("DRAFT");

const statusOrder: Record<string, number> = {
  BELUM_MANIFEST: 0,
  DRAFT: 1,
  DIKIRIM: 2,
  DITERIMA: 3,
};

const trackingSteps = [
  {
    key: "DRAFT",
    title: "Manifest Dibuat",
    desc: "Manifest dibuat",
    icon: "mdi-file-document-edit-outline",
    color: "indigo",
  },
  {
    key: "DIKIRIM",
    title: "Manifest Dikirim",
    desc: "Armada berangkat / dalam perjalanan",
    icon: "mdi-truck-fast",
    color: "warning",
  },
  {
    key: "DITERIMA",
    title: "Manifest Diterima",
    desc: "Terbit Nomor Terima (TJ)",
    icon: "mdi-store-check",
    color: "success",
  },
];

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

// --- Fungsi Lacak Proses / Tracking ---
const openTracking = async () => {
  if (selected.value.length !== 1) return;
  const row = selected.value[0];
  dialogTracking.show = true;
  dialogTracking.loading = true;
  dialogTracking.data = null;

  try {
    const res = await api.get<TrackingData>(`/terima-sj/tracking/${encodeURIComponent(row.Nomor)}`);
    dialogTracking.data = res.data;
    selectedStepKey.value =
      res.data.currentStatus === "BELUM_MANIFEST" ? "DRAFT" : res.data.currentStatus;
  } catch (err: unknown) {
    const msg = axios.isAxiosError(err)
      ? err.response?.data?.message || "Gagal memuat data tracking."
      : "Gagal memuat data tracking.";
    toast.error(msg);
    dialogTracking.show = false;
  } finally {
    dialogTracking.loading = false;
  }
};

const getStepDate = (stepKey: string, data: TrackingData | null): string => {
  if (!data) return "";
  try {
    if (stepKey === "DRAFT") {
      if (data.manifest?.dateCreateManifest) {
        return format(new Date(data.manifest.dateCreateManifest), "dd/MM/yyyy HH:mm");
      }
      if (data.manifest?.manifestTanggal) {
        const dStr = format(new Date(data.manifest.manifestTanggal), "dd/MM/yyyy");
        return data.manifest.manifestJam ? `${dStr} ${data.manifest.manifestJam}` : dStr;
      }
      return "";
    }
    if (stepKey === "DIKIRIM") {
      if (data.manifest?.dateModifiedManifest) {
        return format(new Date(data.manifest.dateModifiedManifest), "dd/MM/yyyy HH:mm");
      }
      if (data.manifest?.dateCreateManifest) {
        return format(new Date(data.manifest.dateCreateManifest), "dd/MM/yyyy HH:mm");
      }
      if (data.manifest?.manifestTanggal) {
        const dStr = format(new Date(data.manifest.manifestTanggal), "dd/MM/yyyy");
        return data.manifest.manifestJam ? `${dStr} ${data.manifest.manifestJam}` : dStr;
      }
      return "";
    }
    if (stepKey === "DITERIMA") {
      const dt = data.terima?.dateCreateTerima || data.terima?.tanggalTerima;
      return dt ? format(new Date(dt), "dd/MM/yyyy HH:mm") : "";
    }
  } catch {
    return "";
  }
  return "";
};

const getStatusBadgeProps = (status?: string) => {
  switch (status) {
    case "DITERIMA":
      return { text: "MANIFEST DITERIMA (TJ)", color: "success", icon: "mdi-store-check" };
    case "DIKIRIM":
      return { text: "MANIFEST DIKIRIM", color: "warning", icon: "mdi-truck-fast" };
    case "DRAFT":
      return {
        text: "MANIFEST DIBUAT",
        color: "indigo",
        icon: "mdi-file-document-edit-outline",
      };
    default:
      return { text: "BELUM MASUK MANIFEST", color: "grey-darken-1", icon: "mdi-clock-outline" };
  }
};

const getEkspedisiTrackingUrl = (ekspedisi?: string, noResi?: string): string | null => {
  if (!ekspedisi) return null;
  const name = ekspedisi.trim().toLowerCase();
  const resi = noResi ? encodeURIComponent(noResi.trim()) : "";

  if (name.includes("bestindo")) {
    return resi
      ? `https://bestindo-express.co.id/site2/tracking/${resi}`
      : "https://bestindo-express.co.id/site2/tracking/";
  }
  if (name.includes("tam cargo") || name.includes("tam")) {
    return "https://www.tamcargo.co.id/tracking";
  }
  if (name.includes("kalog") || name.includes("kai logistik")) {
    return "https://kailogistik.id/layanan/kalog-express/cek-resi";
  }
  return null;
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
      <v-btn
        size="small"
        color="purple-darken-2"
        prepend-icon="mdi-map-marker-path"
        :disabled="selected.length !== 1"
        @click="openTracking"
      >
        Lacak Manifest
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

    <!-- ========================================== -->
    <!-- DIALOG TRACKING / LACAK PROSES SURAT JALAN -->
    <!-- ========================================== -->
    <v-dialog
      v-model="dialogTracking.show"
      max-width="1100px"
      transition="dialog-bottom-transition"
    >
      <v-card class="rounded-xl overflow-hidden shadow-lg">
        <v-toolbar color="purple-darken-2" density="compact" class="px-2">
          <v-icon start class="mr-2">mdi-map-marker-path</v-icon>
          <v-toolbar-title class="text-subtitle-1 font-weight-bold">
            Tracking Manifest Pengiriman
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" @click="dialogTracking.show = false"></v-btn>
        </v-toolbar>

        <!-- Loading State -->
        <v-card-text v-if="dialogTracking.loading" class="pa-12 text-center bg-grey-lighten-4">
          <v-progress-circular indeterminate color="purple-darken-2" size="48" class="mb-3" />
          <div class="text-subtitle-2 text-grey-darken-1 font-weight-medium">
            Memuat histori status Surat Jalan...
          </div>
        </v-card-text>

        <!-- Data Tracking Content -->
        <v-card-text v-else-if="dialogTracking.data" class="pa-6 bg-grey-lighten-4">
          <!-- Hero Header Info -->
          <div class="mb-6 text-center tracking-header">
            <div class="d-flex align-center justify-center gap-4 mb-2 flex-wrap">
              <span class="text-h5 font-weight-black text-primary me-2">
                {{ dialogTracking.data.manifest?.manifestNomor || dialogTracking.data.sj.sjNomor }}
              </span>
              <v-chip
                size="small"
                :color="getStatusBadgeProps(dialogTracking.data.currentStatus).color"
                class="font-weight-bold text-caption"
                variant="flat"
              >
                <v-icon start size="small">
                  {{ getStatusBadgeProps(dialogTracking.data.currentStatus).icon }}
                </v-icon>
                {{ getStatusBadgeProps(dialogTracking.data.currentStatus).text }}
              </v-chip>
            </div>

            <div
              class="d-flex align-center justify-center gap-2 text-body-2 text-grey-darken-2 flex-wrap"
            >
              <span v-if="dialogTracking.data.manifest?.namaGudangAsal">
                Asal:
                <strong class="text-black">
                  [{{ dialogTracking.data.manifest.gudangAsal }}]
                  {{ dialogTracking.data.manifest.namaGudangAsal }}
                </strong>
              </span>
              <v-icon v-if="dialogTracking.data.manifest?.namaGudangAsal" size="small"
                >mdi-arrow-right</v-icon
              >
              <span>
                Tujuan:
                <strong class="text-black">
                  [{{ dialogTracking.data.sj.storeKode }}]
                  {{ dialogTracking.data.sj.storeNama || "-" }}
                </strong>
              </span>
            </div>
          </div>

          <!-- Horizontal Stepper Timeline (Clickable) -->
          <div class="timeline-horizontal-wrapper pb-4">
            <v-timeline
              direction="horizontal"
              line-thickness="3"
              align="start"
              side="end"
              line-color="grey-lighten-2"
            >
              <v-timeline-item
                v-for="(step, index) in trackingSteps"
                :key="index"
                :dot-color="
                  statusOrder[dialogTracking.data?.currentStatus || 'BELUM_MANIFEST'] >=
                  statusOrder[step.key]
                    ? step.color
                    : 'grey-lighten-2'
                "
                :icon="step.icon"
                :icon-color="
                  statusOrder[dialogTracking.data?.currentStatus || 'BELUM_MANIFEST'] >=
                  statusOrder[step.key]
                    ? 'white'
                    : 'grey'
                "
                fill-dot
                size="large"
                class="tracking-item-anim cursor-pointer"
                :class="{ 'step-item-selected': selectedStepKey === step.key }"
                :style="{ animationDelay: `${index * 0.12}s` }"
                @click="selectedStepKey = step.key"
              >
                <div class="centered-timeline-text mt-3">
                  <!-- Title -->
                  <div
                    class="font-weight-bold text-subtitle-2 mb-1"
                    :class="
                      statusOrder[dialogTracking.data?.currentStatus || 'BELUM_MANIFEST'] >=
                      statusOrder[step.key]
                        ? `text-${step.color}`
                        : 'text-grey-lighten-1'
                    "
                  >
                    {{ step.title }}
                  </div>

                  <!-- Desc -->
                  <div
                    class="text-caption text-grey-darken-1 mb-2"
                    style="line-height: 1.2; min-height: 28px"
                  >
                    {{ step.desc }}
                  </div>

                  <!-- Date Badge -->
                  <div
                    v-if="
                      statusOrder[dialogTracking.data?.currentStatus || 'BELUM_MANIFEST'] >=
                        statusOrder[step.key] && getStepDate(step.key, dialogTracking.data)
                    "
                    class="text-caption font-weight-medium bg-white rounded-pill px-2 py-1 border d-inline-block date-badge mb-1"
                    style="font-size: 9px !important"
                  >
                    {{ getStepDate(step.key, dialogTracking.data) }}
                  </div>

                  <!-- Indicator Active Tab -->
                  <v-icon
                    v-if="selectedStepKey === step.key"
                    size="18"
                    color="primary"
                    class="mt-1"
                  >
                    mdi-eye
                  </v-icon>
                </div>
              </v-timeline-item>
            </v-timeline>
          </div>

          <!-- DETAIL TAHAP YANG DIKLIK (INTERAKTIF) -->
          <v-fade-transition mode="out-in">
            <!-- 1. TAHAP: MANIFEST DIBUAT (DRAFT) -->
            <v-card
              v-if="selectedStepKey === 'DRAFT'"
              key="step-draft"
              variant="outlined"
              class="rounded-xl bg-white pa-4 border mb-2 shadow-sm"
            >
              <div class="d-flex align-center justify-space-between mb-3 border-b pb-2">
                <div class="d-flex align-center gap-2">
                  <v-icon color="indigo">mdi-file-document-edit-outline</v-icon>
                  <span class="text-subtitle-2 font-weight-bold text-indigo">
                    Detail Tahap 1: Manifest Dibuat
                  </span>
                  <v-chip
                    v-if="dialogTracking.data.manifest"
                    size="x-small"
                    color="indigo"
                    class="font-weight-bold ml-1"
                  >
                    {{ dialogTracking.data.manifest.manifestStatus }}
                  </v-chip>
                </div>
                <div
                  v-if="dialogTracking.data.manifest"
                  class="text-caption text-grey-darken-1 font-weight-medium"
                >
                  No. Manifest: <strong>{{ dialogTracking.data.manifest.manifestNomor }}</strong>
                </div>
              </div>

              <template v-if="dialogTracking.data.manifest">
                <v-row dense>
                  <v-col cols="12" md="6">
                    <div class="text-caption d-flex flex-column gap-1">
                      <div>
                        <span class="text-grey-darken-1">Tanggal Manifest:</span>
                        <strong class="ml-1">
                          {{
                            dialogTracking.data.manifest.manifestTanggal
                              ? format(
                                  new Date(dialogTracking.data.manifest.manifestTanggal),
                                  "dd/MM/yyyy"
                                )
                              : "-"
                          }}
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Jam Manifest:</span>
                        <strong class="ml-1 text-indigo">
                          {{ dialogTracking.data.manifest.manifestJam || "-" }}
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Waktu Pembuatan:</span>
                        <strong class="ml-1 text-indigo">
                          {{
                            dialogTracking.data.manifest.dateCreateManifest
                              ? format(
                                  new Date(dialogTracking.data.manifest.dateCreateManifest),
                                  "dd/MM/yyyy HH:mm"
                                )
                              : dialogTracking.data.manifest.manifestTanggal
                              ? `${format(
                                  new Date(dialogTracking.data.manifest.manifestTanggal),
                                  "dd/MM/yyyy"
                                )} ${dialogTracking.data.manifest.manifestJam || ""}`
                              : "-"
                          }}
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Gudang Asal:</span>
                        <strong class="ml-1">
                          [{{ dialogTracking.data.manifest.gudangAsal || "KDC" }}]
                          {{ dialogTracking.data.manifest.namaGudangAsal || "Pusat DC" }}
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Store Tujuan:</span>
                        <strong class="ml-1">
                          [{{ dialogTracking.data.sj.storeKode }}]
                          {{ dialogTracking.data.sj.storeNama || "-" }}
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Dibuat Oleh:</span>
                        <span class="ml-1 font-weight-medium">
                          {{ dialogTracking.data.manifest.userCreateManifest || "-" }}
                        </span>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Catatan / Keterangan:</span>
                        <span class="ml-1 font-italic">
                          {{ dialogTracking.data.manifest.keterangan || "-" }}
                        </span>
                      </div>
                    </div>
                  </v-col>

                  <v-col cols="12" md="6">
                    <div class="text-caption d-flex flex-column gap-1">
                      <div>
                        <span class="text-grey-darken-1">Total Muatan SJ:</span>
                        <strong class="ml-1"
                          >{{ dialogTracking.data.manifest.totalSj || 1 }} Dokumen</strong
                        >
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Total Koli:</span>
                        <strong class="ml-1 text-primary">
                          {{ dialogTracking.data.manifest.totalKoli || 0 }} Koli
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Total Qty:</span>
                        <strong class="ml-1 text-primary">
                          {{ Number(dialogTracking.data.manifest.totalQty || 0).toLocaleString() }}
                          Pcs
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Berat Total:</span>
                        <strong class="ml-1">
                          {{ dialogTracking.data.manifest.beratKg || 0 }} Kg
                        </strong>
                      </div>
                      <v-divider class="my-1" />
                      <div>
                        <span class="text-grey-darken-1">No. Surat Jalan:</span>
                        <strong class="ml-1 text-primary">{{
                          dialogTracking.data.sj.sjNomor
                        }}</strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">No. Permintaan / SO:</span>
                        <span class="ml-1">{{ dialogTracking.data.sj.noMinta || "-" }}</span>
                      </div>
                    </div>
                  </v-col>
                </v-row>
              </template>
              <v-alert
                v-else
                type="warning"
                variant="tonal"
                density="compact"
                class="rounded-lg text-caption"
                icon="mdi-alert-circle-outline"
              >
                Surat Jalan ini belum dimasukkan ke dalam Manifest Pengiriman.
              </v-alert>
            </v-card>

            <!-- 2. TAHAP: MANIFEST DIKIRIM -->
            <v-card
              v-else-if="selectedStepKey === 'DIKIRIM'"
              key="step-dikirim"
              variant="outlined"
              class="rounded-xl bg-white pa-4 border mb-2 shadow-sm"
            >
              <div class="d-flex align-center justify-space-between mb-3 border-b pb-2">
                <div class="d-flex align-center gap-2">
                  <v-icon color="warning">mdi-truck-fast</v-icon>
                  <span class="text-subtitle-2 font-weight-bold text-warning-darken-3">
                    Detail Tahap 2: Manifest Dikirim (Dalam Perjalanan)
                  </span>
                  <v-chip
                    size="x-small"
                    :color="
                      statusOrder[dialogTracking.data.currentStatus] >= statusOrder['DIKIRIM']
                        ? 'warning'
                        : 'grey'
                    "
                    class="font-weight-bold ml-1"
                  >
                    {{
                      statusOrder[dialogTracking.data.currentStatus] >= statusOrder["DIKIRIM"]
                        ? "DIKIRIM"
                        : "BELUM DIKIRIM"
                    }}
                  </v-chip>
                </div>
              </div>

              <template v-if="dialogTracking.data.manifest">
                <v-row dense>
                  <v-col cols="12" md="6">
                    <div class="text-caption d-flex flex-column gap-1">
                      <div>
                        <span class="text-grey-darken-1">Jenis Pengiriman:</span>
                        <v-chip
                          size="x-small"
                          color="teal"
                          class="ml-1 font-weight-bold text-uppercase"
                        >
                          {{ dialogTracking.data.manifest.jenisKirim || "SENDIRI" }}
                        </v-chip>
                      </div>

                      <template v-if="dialogTracking.data.manifest.jenisKirim === 'EKSPEDISI'">
                        <div>
                          <span class="text-grey-darken-1">Ekspedisi:</span>
                          <strong class="ml-1">{{
                            dialogTracking.data.manifest.ekspedisi || "-"
                          }}</strong>
                        </div>
                        <div class="d-flex align-center gap-2 flex-wrap">
                          <div>
                            <span class="text-grey-darken-1">Nomor Resi:</span>
                            <span class="ml-1 font-weight-bold text-deep-purple">
                              {{ dialogTracking.data.manifest.noResi || "Belum Diisi" }}
                            </span>
                          </div>
                          <v-btn
                            v-if="
                              getEkspedisiTrackingUrl(
                                dialogTracking.data.manifest.ekspedisi,
                                dialogTracking.data.manifest.noResi
                              )
                            "
                            size="x-small"
                            color="indigo-darken-2"
                            variant="tonal"
                            class="px-2 font-weight-bold text-none"
                            prepend-icon="mdi-open-in-new"
                            :href="
                              getEkspedisiTrackingUrl(
                                dialogTracking.data.manifest.ekspedisi,
                                dialogTracking.data.manifest.noResi
                              ) || '#'
                            "
                            target="_blank"
                          >
                            Cek Resi (Web Resmi)
                          </v-btn>
                        </div>
                      </template>
                      <template v-else>
                        <div>
                          <span class="text-grey-darken-1">Driver / Supir:</span>
                          <strong class="ml-1">{{
                            dialogTracking.data.manifest.driver || "-"
                          }}</strong>
                        </div>
                        <div>
                          <span class="text-grey-darken-1">Plat Nomor:</span>
                          <span class="ml-1 font-weight-bold text-black">
                            {{ dialogTracking.data.manifest.platNomor || "-" }}
                          </span>
                        </div>
                      </template>
                    </div>
                  </v-col>

                  <v-col cols="12" md="6">
                    <div class="text-caption d-flex flex-column gap-1">
                      <div>
                        <span class="text-grey-darken-1">Waktu Pembuatan:</span>
                        <strong class="ml-1">
                          {{
                            dialogTracking.data.manifest.dateCreateManifest
                              ? format(
                                  new Date(dialogTracking.data.manifest.dateCreateManifest),
                                  "dd/MM/yyyy HH:mm"
                                )
                              : dialogTracking.data.manifest.manifestTanggal
                              ? `${format(
                                  new Date(dialogTracking.data.manifest.manifestTanggal),
                                  "dd/MM/yyyy"
                                )} ${dialogTracking.data.manifest.manifestJam || ""}`
                              : "-"
                          }}
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Waktu Dikirim:</span>
                        <strong class="ml-1 text-warning-darken-3">
                          {{
                            dialogTracking.data.manifest.dateModifiedManifest
                              ? format(
                                  new Date(dialogTracking.data.manifest.dateModifiedManifest),
                                  "dd/MM/yyyy HH:mm"
                                )
                              : dialogTracking.data.manifest.manifestTanggal
                              ? `${format(
                                  new Date(dialogTracking.data.manifest.manifestTanggal),
                                  "dd/MM/yyyy"
                                )} ${dialogTracking.data.manifest.manifestJam || ""}`
                              : "-"
                          }}
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">TTD Pengirim:</span>
                        <v-chip
                          size="x-small"
                          :color="dialogTracking.data.manifest.hasTtdPengirim ? 'success' : 'grey'"
                          class="ml-1"
                        >
                          {{
                            dialogTracking.data.manifest.hasTtdPengirim ? "Sudah TTD" : "Belum TTD"
                          }}
                        </v-chip>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">TTD Driver:</span>
                        <v-chip
                          size="x-small"
                          :color="dialogTracking.data.manifest.hasTtdDriver ? 'success' : 'grey'"
                          class="ml-1"
                        >
                          {{
                            dialogTracking.data.manifest.hasTtdDriver ? "Sudah TTD" : "Belum TTD"
                          }}
                        </v-chip>
                      </div>
                    </div>
                  </v-col>
                </v-row>
              </template>
              <v-alert
                v-else
                type="info"
                variant="tonal"
                density="compact"
                class="rounded-lg text-caption"
                icon="mdi-information-outline"
              >
                Belum ada data pengiriman manifest.
              </v-alert>
            </v-card>

            <!-- 3. TAHAP: MANIFEST DITERIMA (NO. TERIMA TJ) -->
            <v-card
              v-else-if="selectedStepKey === 'DITERIMA'"
              key="step-diterima"
              variant="outlined"
              class="rounded-xl bg-white pa-4 border mb-2 shadow-sm"
            >
              <div class="d-flex align-center justify-space-between mb-3 border-b pb-2">
                <div class="d-flex align-center gap-2">
                  <v-icon color="success">mdi-store-check</v-icon>
                  <span class="text-subtitle-2 font-weight-bold text-success">
                    Detail Tahap 3: Manifest Diterima (Penerimaan Store)
                  </span>
                  <v-chip
                    size="x-small"
                    :color="
                      dialogTracking.data.terima?.noTerima || dialogTracking.data.sj.noTerima
                        ? 'success'
                        : 'grey'
                    "
                    class="font-weight-bold ml-1"
                  >
                    {{
                      dialogTracking.data.terima?.noTerima || dialogTracking.data.sj.noTerima
                        ? "SUDAH DITERIMA"
                        : "BELUM DITERIMA"
                    }}
                  </v-chip>
                </div>
                <div
                  v-if="dialogTracking.data.terima?.noTerima || dialogTracking.data.sj.noTerima"
                  class="text-caption text-grey-darken-1 font-weight-medium"
                >
                  No. Terima:
                  <strong>{{
                    dialogTracking.data.terima?.noTerima || dialogTracking.data.sj.noTerima
                  }}</strong>
                </div>
              </div>

              <template v-if="dialogTracking.data.terima">
                <v-row dense>
                  <v-col cols="12" md="6">
                    <div class="text-caption d-flex flex-column gap-1">
                      <div>
                        <span class="text-grey-darken-1">Nomor Terima (TJ):</span>
                        <strong class="ml-1 text-success text-subtitle-2">
                          {{ dialogTracking.data.terima.noTerima }}
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Tanggal Terima:</span>
                        <strong class="ml-1">
                          {{
                            dialogTracking.data.terima.tanggalTerima
                              ? format(
                                  new Date(dialogTracking.data.terima.tanggalTerima),
                                  "dd/MM/yyyy"
                                )
                              : "-"
                          }}
                        </strong>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Waktu Diterima:</span>
                        <strong class="ml-1 text-success">
                          {{
                            dialogTracking.data.terima.dateCreateTerima
                              ? format(
                                  new Date(dialogTracking.data.terima.dateCreateTerima),
                                  "dd/MM/yyyy HH:mm"
                                )
                              : dialogTracking.data.terima.tanggalTerima
                              ? format(
                                  new Date(dialogTracking.data.terima.tanggalTerima),
                                  "dd/MM/yyyy"
                                )
                              : "-"
                          }}
                        </strong>
                      </div>
                    </div>
                  </v-col>
                  <v-col cols="12" md="6">
                    <div class="text-caption d-flex flex-column gap-1">
                      <div>
                        <span class="text-grey-darken-1">Penerima di Store:</span>
                        <span class="ml-1 font-weight-bold text-black">
                          {{ dialogTracking.data.terima.userTerima || "-" }}
                        </span>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Status Closing:</span>
                        <v-chip
                          size="x-small"
                          :color="
                            dialogTracking.data.terima.closing === 'Y' ? 'teal' : 'amber-darken-2'
                          "
                          class="ml-1 font-weight-bold"
                        >
                          {{
                            dialogTracking.data.terima.closing === "Y"
                              ? "SUDAH CLOSING"
                              : "BELUM CLOSING"
                          }}
                        </v-chip>
                      </div>
                      <div>
                        <span class="text-grey-darken-1">Status Fisik:</span>
                        <span class="ml-1 text-success font-weight-medium">
                          Barang telah sampai dan diverifikasi di cabang tujuan dengan No. Terima
                          {{ dialogTracking.data.terima.noTerima }}.
                        </span>
                      </div>
                    </div>
                  </v-col>
                </v-row>
              </template>
              <v-alert
                v-else
                type="info"
                variant="tonal"
                density="compact"
                class="rounded-lg text-caption"
                icon="mdi-clock-outline"
              >
                Barang belum diterima oleh cabang store tujuan (Nomor Terima TJ belum terbit).
              </v-alert>
            </v-card>
          </v-fade-transition>
        </v-card-text>
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

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

/* Override global CSS untuk v-btn-toggle di filter */
.source-toggle :deep(.v-btn) {
  height: 28px !important;
  width: auto !important;
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

/* === TRACKING DIALOG STYLES (MATCHING PETTY CASH) === */
.tracking-header {
  animation: fadeInDown 0.5s ease-out forwards;
}

.tracking-item-anim {
  opacity: 0;
  animation: fadeInUp 0.6s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.timeline-horizontal-wrapper {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  -ms-overflow-style: none;
  scrollbar-width: none;
  padding: 8px 32px 16px;
}
.timeline-horizontal-wrapper::-webkit-scrollbar {
  display: none;
}

.timeline-horizontal-wrapper :deep(.v-timeline--horizontal) {
  justify-content: center;
  min-width: unset !important;
  width: 100%;
}

.timeline-horizontal-wrapper :deep(.v-timeline-item) {
  flex: 1 1 0;
  min-width: 0;
  max-width: none;
}

.timeline-horizontal-wrapper :deep(.v-timeline-item__body) {
  width: 100% !important;
  overflow: visible !important;
  padding-inline-start: 0 !important;
  display: flex;
  justify-content: center;
}

.timeline-horizontal-wrapper :deep(.v-timeline-divider) {
  justify-content: center;
}
.timeline-horizontal-wrapper :deep(.v-timeline-divider__dot) {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.timeline-horizontal-wrapper :deep(.v-timeline-divider__dot:hover) {
  transform: scale(1.15);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.timeline-horizontal-wrapper :deep(.v-timeline-divider__dot--has-color) {
  animation: pulseGlow 2s infinite ease-in-out;
}

.timeline-horizontal-wrapper :deep(.step-item-selected .v-timeline-divider__dot) {
  transform: scale(1.22) !important;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.45) !important;
}

.timeline-horizontal-wrapper :deep(.step-item-selected) {
  opacity: 1 !important;
}

.centered-timeline-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  padding: 0 6px;
  box-sizing: border-box;
}

.centered-timeline-text .date-badge {
  animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulseGlow {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.3);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(99, 102, 241, 0);
  }
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

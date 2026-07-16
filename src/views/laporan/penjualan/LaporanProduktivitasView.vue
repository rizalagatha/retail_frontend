<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useRouter } from "vue-router";
import api from "@/services/api";
import ExcelJS from "exceljs";
import axios, { type AxiosError } from "axios";
import PageLayout from "@/components/PageLayout.vue";
import AppDataTable from "@/components/AppDataTable.vue";

// --- INTERFACES ---
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
}

interface CabangOption {
  kode: string;
  nama: string;
}

interface UserOption {
  userCreate: string;
}

interface ClosedPipelineItem {
  userCreate: string;
  jmlPenawaranWon: number;
  nominalPenawaranWon: number | null;
  jmlPenawaranLost: number;
  nominalPenawaranLost: number | null;
  jmlSoWon: number;
  nominalSoWon: number | null;
  jmlSoLost: number;
  nominalSoLost: number | null;
  [key: string]: unknown;
}

interface ClosedWonDetailItem {
  nomor: string;
  tanggal: string;
  nomorPenawaran?: string;
  kdcus: string;
  namaCustomer: string;
  telpCustomer: string;
  namaCabang: string;
  nomorSo?: string;
  nomorInvoice?: string;
  tanggalClosing: string;
  nominal: number | null;
  [key: string]: unknown;
}

interface ClosedLostDetailItem {
  nomor: string;
  tanggal: string;
  nomorPenawaran?: string;
  kdcus: string;
  namaCustomer: string;
  telpCustomer: string;
  namaCabang: string;
  alasan: string;
  tanggalClosing: string;
  nominal: number | null;
  [key: string]: unknown;
}

interface TreeRow {
  cabang: string;
  cabangNama: string;
  userCreate: string;
  kategori: "penawaran" | "so_internal" | "so_pabrik";
  bucket: string;
  jumlah: number;
  nominal: number | null;
  totalHari: number | null;
}

interface MetricAgg {
  jumlah: number;
  nominal: number;
  totalHari: number;
}
const emptyMetric = (): MetricAgg => ({ jumlah: 0, nominal: 0, totalHari: 0 });
const avgHari = (m: MetricAgg) =>
  m.jumlah > 0 ? Math.round((m.totalHari / m.jumlah) * 10) / 10 : null;

interface BucketAgg {
  bucket: string;
  label: string;
  jumlah: number;
  nominal: number;
  totalHari: number;
  color: string;
}
interface KategoriAgg {
  kategori: "penawaran" | "so_internal" | "so_pabrik";
  label: string;
  icon: string;
  jumlah: number;
  nominal: number;
  totalHari: number;
  buckets: BucketAgg[];
}
interface UserAgg {
  userCreate: string;
  penawaran: MetricAgg;
  so: MetricAgg;
  kategoris: KategoriAgg[];
}
interface CabangAgg {
  cabang: string;
  cabangNama: string;
  penawaran: MetricAgg;
  so: MetricAgg;
  users: UserAgg[];
}
interface TreeDetailItem {
  nomor: string;
  tanggal: string;
  nomorPenawaran?: string;
  kdcus: string;
  namaCustomer: string;
  telpCustomer: string;
  namaCabang: string;
  umurHari?: number;
  overdueHari?: number;
  dateline?: string;
  nomorSpk?: string;
  picSpk?: string;
  nominal: number | null;
  [key: string]: unknown;
}
interface ExportPenawaranDetail {
  nomor: string;
  tanggal: string;
  userCreate?: string;
  namaCustomer: string;
  telpCustomer: string;
  namaCabang: string;
  umurHari: number;
  nominal: number | null;
}
interface ExportSoInternalDetail {
  nomor: string;
  tanggal: string;
  nomorPenawaran?: string;
  userCreate: string;
  namaCustomer: string;
  telpCustomer: string;
  namaCabang: string;
  dateline: string | null;
  overdueHari: number;
  nominal: number | null;
}
interface ExportSoPabrikDetail {
  nomor: string;
  tanggal: string;
  nomorPenawaran?: string;
  nomorSpk: string;
  picSpk: string;
  namaCustomer: string;
  telpCustomer: string;
  namaCabang: string;
  dateline: string | null;
  overdueHari: number;
  nominal: number | null;
}

const BUCKET_LABELS: Record<string, Record<string, string>> = {
  penawaran: { lt3: "< 3 Hari", "3to7": "3 - 7 Hari", gt7: "> 7 Hari" },
  so_internal: {
    ontrack: "≤ 3 Hari (On Track)",
    warning: "4 - 7 Hari (Peringatan)",
    critical: "> 7 Hari (Kritis)",
  },
  so_pabrik: {
    proses: "≤ 14 Hari (Proses Pabrik)",
    tunggu: "15 - 21 Hari (Masa Tunggu)",
    telat: "> 21 Hari (Pabrik Telat)",
  },
};
const BUCKET_ORDER: Record<string, string[]> = {
  penawaran: ["lt3", "3to7", "gt7"],
  so_internal: ["ontrack", "warning", "critical"],
  so_pabrik: ["proses", "tunggu", "telat"],
};
const BUCKET_COLOR: Record<string, string> = {
  lt3: "grey",
  "3to7": "orange-darken-2",
  gt7: "red-darken-2",
  ontrack: "grey",
  warning: "orange-darken-2",
  critical: "red-darken-2",
  proses: "grey",
  tunggu: "orange-darken-2",
  telat: "red-darken-2",
};
const KATEGORI_LABEL: Record<string, string> = {
  penawaran: "Penawaran (Open)",
  so_internal: "Surat Pesanan — Internal",
  so_pabrik: "Surat Pesanan — Pabrik",
};
const KATEGORI_ICON: Record<string, string> = {
  penawaran: "mdi-handshake",
  so_internal: "mdi-file-document-edit-outline",
  so_pabrik: "mdi-factory",
};

// --- INIT ---
const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const CABKAOS = authStore.user?.cabang || "KDC";
const MENU_ID = "707";

// --- STATE ---
const isLoading = ref(false);
const cabangList = ref<CabangOption[]>([]);
const userList = ref<UserOption[]>([]);
const detailDialog = ref(false);
const detailUserCreate = ref("");
const detailLoading = ref(false);
const currentTab = ref<"open" | "closed">("open");
const closedData = ref<ClosedPipelineItem[]>([]);
const treeDetailData = ref<TreeDetailItem[]>([]);

const today = new Date();
const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const toDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const filters = reactive({
  startDate: toDateStr(firstDayOfMonth),
  endDate: toDateStr(today),
  cabang: CABKAOS === "KDC" ? "ALL" : CABKAOS,
  userCreate: "ALL",
});

const hasViewPermission = authStore.can(MENU_ID, "view");

// --- STATE TREE ---
const treeRawData = ref<TreeRow[]>([]);
const expandedNodes = ref<Set<string>>(new Set());

const isExpanded = (key: string) => expandedNodes.value.has(key);
const toggleExpand = (key: string) => {
  const next = new Set(expandedNodes.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedNodes.value = next;
};

// --- BUILD TREE DARI FLAT DATA ---
const treeData = computed<CabangAgg[]>(() => {
  const cabangMap = new Map<string, CabangAgg>();

  const addMetric = (m: MetricAgg, row: TreeRow) => {
    m.jumlah += Number(row.jumlah) || 0;
    m.nominal += Number(row.nominal) || 0;
    m.totalHari += Number(row.totalHari) || 0;
  };

  for (const row of treeRawData.value) {
    const isPenawaran = row.kategori === "penawaran";

    if (!cabangMap.has(row.cabang)) {
      cabangMap.set(row.cabang, {
        cabang: row.cabang,
        cabangNama: row.cabangNama || row.cabang,
        penawaran: emptyMetric(),
        so: emptyMetric(),
        users: [],
      });
    }
    const cabangNode = cabangMap.get(row.cabang)!;
    addMetric(isPenawaran ? cabangNode.penawaran : cabangNode.so, row);

    let userNode = cabangNode.users.find((u) => u.userCreate === row.userCreate);
    if (!userNode) {
      userNode = {
        userCreate: row.userCreate,
        penawaran: emptyMetric(),
        so: emptyMetric(),
        kategoris: [],
      };
      cabangNode.users.push(userNode);
    }
    addMetric(isPenawaran ? userNode.penawaran : userNode.so, row);

    let kategoriNode = userNode.kategoris.find((k) => k.kategori === row.kategori);
    if (!kategoriNode) {
      kategoriNode = {
        kategori: row.kategori,
        label: KATEGORI_LABEL[row.kategori],
        icon: KATEGORI_ICON[row.kategori],
        jumlah: 0,
        nominal: 0,
        totalHari: 0,
        buckets: [],
      };
      userNode.kategoris.push(kategoriNode);
    }
    kategoriNode.jumlah += Number(row.jumlah) || 0;
    kategoriNode.nominal += Number(row.nominal) || 0;
    kategoriNode.totalHari += Number(row.totalHari) || 0;
    kategoriNode.buckets.push({
      bucket: row.bucket,
      label: BUCKET_LABELS[row.kategori]?.[row.bucket] || row.bucket,
      jumlah: Number(row.jumlah) || 0,
      nominal: Number(row.nominal) || 0,
      totalHari: Number(row.totalHari) || 0,
      color: BUCKET_COLOR[row.bucket] || "grey",
    });
  }

  const result = Array.from(cabangMap.values());
  for (const cabangNode of result) {
    for (const userNode of cabangNode.users) {
      for (const kategoriNode of userNode.kategoris) {
        kategoriNode.buckets.sort(
          (a, b) =>
            BUCKET_ORDER[kategoriNode.kategori].indexOf(a.bucket) -
            BUCKET_ORDER[kategoriNode.kategori].indexOf(b.bucket)
        );
      }
      userNode.kategoris.sort((a, b) => a.kategori.localeCompare(b.kategori));
    }
    cabangNode.users.sort(
      (a, b) => b.penawaran.jumlah + b.so.jumlah - (a.penawaran.jumlah + a.so.jumlah)
    );
  }
  return result.sort(
    (a, b) => b.penawaran.jumlah + b.so.jumlah - (a.penawaran.jumlah + a.so.jumlah)
  );
});

const avgHariColor = (val: number | null) => {
  if (val === null) return "grey";
  if (val > 10) return "red-darken-2";
  if (val > 5) return "orange-darken-2";
  return "grey";
};

// --- TOTALS UNTUK CHIP/SUMMARY BAR ---
const totalPenawaranOpen = () => treeData.value.reduce((s, c) => s + c.penawaran.jumlah, 0);
const totalSoOpen = () => treeData.value.reduce((s, c) => s + c.so.jumlah, 0);
const totalNominalPenawaranOpen = () => treeData.value.reduce((s, c) => s + c.penawaran.nominal, 0);
const totalNominalSoOpen = () => treeData.value.reduce((s, c) => s + c.so.nominal, 0);

// --- FETCH TREE ---
const fetchOpenTree = async () => {
  isLoading.value = true;
  try {
    const response = await api.get<TreeRow[]>("/laporan-produktivitas/open-pipeline-tree", {
      params: filters,
    });
    treeRawData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data pipeline.");
  } finally {
    isLoading.value = false;
  }
};

// --- HEADERS ---
const headersClosed = ref<DataTableHeader[]>([
  { title: "Sales / User", key: "userCreate", fixed: true, width: 130 },
  { title: "Penawaran Won", key: "jmlPenawaranWon", width: 140, align: "end" },
  { title: "Nominal Won", key: "nominalPenawaranWon", width: 160, align: "end" },
  { title: "Penawaran Lost", key: "jmlPenawaranLost", width: 140, align: "end" },
  { title: "Nominal Lost", key: "nominalPenawaranLost", width: 160, align: "end" },
  { title: "SO Won", key: "jmlSoWon", width: 100, align: "end" },
  { title: "Nominal SO Won", key: "nominalSoWon", width: 160, align: "end" },
  { title: "SO Lost", key: "jmlSoLost", width: 100, align: "end" },
  { title: "Nominal SO Lost", key: "nominalSoLost", width: 160, align: "end" },
]);

const headersTreePenawaran = ref<DataTableHeader[]>([
  { title: "No. Penawaran", key: "nomor", fixed: true, width: 160 },
  { title: "Tanggal", key: "tanggal", width: 110 },
  { title: "Customer", key: "namaCustomer", width: 190 },
  { title: "Telp", key: "telpCustomer", width: 130 },
  { title: "Cabang", key: "namaCabang", width: 130 },
  { title: "Umur", key: "umurHari", width: 90, align: "end" },
  { title: "Nominal", key: "nominal", width: 150, align: "end" },
]);

const headersTreeSoInternal = ref<DataTableHeader[]>([
  { title: "No. SO", key: "nomor", fixed: true, width: 160 },
  { title: "Ref. Penawaran", key: "nomorPenawaran", width: 160 },
  { title: "Tanggal", key: "tanggal", width: 110 },
  { title: "Customer", key: "namaCustomer", width: 190 },
  { title: "Dateline", key: "dateline", width: 110 },
  { title: "Overdue", key: "overdueHari", width: 100, align: "end" },
  { title: "Nominal", key: "nominal", width: 150, align: "end" },
]);

const headersTreeSoPabrik = ref<DataTableHeader[]>([
  { title: "No. SO", key: "nomor", fixed: true, width: 160 },
  { title: "No. SPK", key: "nomorSpk", width: 150 },
  { title: "PIC SPK", key: "picSpk", width: 120 },
  { title: "Tanggal", key: "tanggal", width: 110 },
  { title: "Customer", key: "namaCustomer", width: 190 },
  { title: "Dateline", key: "dateline", width: 110 },
  { title: "Overdue", key: "overdueHari", width: 100, align: "end" },
  { title: "Nominal", key: "nominal", width: 150, align: "end" },
]);

// Tipe drill-down diperluas mencakup Closed Won/Lost
type DetailKind =
  | "tree-penawaran"
  | "tree-so-internal"
  | "tree-so-pabrik"
  | "closed-penawaran-won"
  | "closed-penawaran-lost"
  | "closed-so-won"
  | "closed-so-lost";

const detailKind = ref<DetailKind>("tree-penawaran");
const closedWonDetailData = ref<ClosedWonDetailItem[]>([]);
const closedLostDetailData = ref<ClosedLostDetailItem[]>([]);

const headersClosedWonDetail = ref<DataTableHeader[]>([
  { title: "No. Dokumen", key: "nomor", fixed: true, width: 160 },
  { title: "Tanggal Dibuat", key: "tanggal", width: 120 },
  { title: "Customer", key: "namaCustomer", width: 190 },
  { title: "Telp", key: "telpCustomer", width: 130 },
  { title: "Cabang", key: "namaCabang", width: 130 },
  { title: "Ref. Closing", key: "refClosing", width: 160 },
  { title: "Tgl Closing", key: "tanggalClosing", width: 120 },
  { title: "Nominal", key: "nominal", width: 150, align: "end" },
]);

const headersClosedLostDetail = ref<DataTableHeader[]>([
  { title: "No. Dokumen", key: "nomor", fixed: true, width: 160 },
  { title: "Tanggal Dibuat", key: "tanggal", width: 120 },
  { title: "Customer", key: "namaCustomer", width: 190 },
  { title: "Telp", key: "telpCustomer", width: 130 },
  { title: "Cabang", key: "namaCabang", width: 130 },
  { title: "Alasan", key: "alasan", width: 220 },
  { title: "Tgl Ditutup", key: "tanggalClosing", width: 120 },
  { title: "Nominal", key: "nominal", width: 150, align: "end" },
]);

const openBucketDetail = async (
  kategori: "penawaran" | "so_internal" | "so_pabrik",
  cabang: string,
  userCreate: string,
  bucket: string
) => {
  detailUserCreate.value = userCreate;
  detailDialog.value = true;
  detailLoading.value = true;
  try {
    let endpoint = "";
    const params: Record<string, string> = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      cabang,
      bucket,
    };
    if (kategori === "penawaran") {
      detailKind.value = "tree-penawaran";
      endpoint = "tree/penawaran-detail";
      params.userCreate = userCreate;
    } else if (kategori === "so_internal") {
      detailKind.value = "tree-so-internal";
      endpoint = "tree/so-internal-detail";
      params.userCreate = userCreate;
    } else {
      detailKind.value = "tree-so-pabrik";
      endpoint = "tree/so-pabrik-detail";
      params.pic = userCreate;
    }
    const response = await api.get<TreeDetailItem[]>(`/laporan-produktivitas/${endpoint}`, {
      params,
    });
    treeDetailData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat detail.");
  } finally {
    detailLoading.value = false;
  }
};

// --- TOTALS TAB CLOSED ---
const totalPenawaranWon = () => closedData.value.reduce((s, i) => s + (i.jmlPenawaranWon || 0), 0);
const totalPenawaranLost = () =>
  closedData.value.reduce((s, i) => s + (i.jmlPenawaranLost || 0), 0);
const totalSoWon = () => closedData.value.reduce((s, i) => s + (i.jmlSoWon || 0), 0);
const totalSoLost = () => closedData.value.reduce((s, i) => s + (i.jmlSoLost || 0), 0);

// --- RESIZE LOGIC ---
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

// --- FORMATTERS ---
const formatRupiah = (val: number | null | undefined) => {
  if (val === null || val === undefined) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(val);
};
const detailTotals = computed(() => {
  let data: Array<{ nominal: number | null }> = [];
  if (detailKind.value.startsWith("tree-")) data = treeDetailData.value;
  else if (detailKind.value.endsWith("won")) data = closedWonDetailData.value;
  else data = closedLostDetailData.value;

  return {
    jumlahDokumen: data.length,
    totalNominal: data.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0),
  };
});

// --- API METHODS ---
const fetchCabangOptions = async () => {
  try {
    const response = await api.get<CabangOption[]>("/laporan-produktivitas/branch-options", {
      params: { userCabang: CABKAOS },
    });
    cabangList.value = response.data;
  } catch (error: unknown) {
    let msg = "Gagal memuat data cabang.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  }
};

const fetchUserOptions = async () => {
  try {
    const response = await api.get<UserOption[]>("/laporan-produktivitas/user-options");
    userList.value = response.data;
  } catch {
    // silent, opsional
  }
};

const fetchClosedData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get<ClosedPipelineItem[]>("/laporan-produktivitas/closed-pipeline", {
      params: filters,
    });
    closedData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data closed.");
  } finally {
    isLoading.value = false;
  }
};

const fetchReportData = async () => {
  if (currentTab.value === "open") {
    await fetchOpenTree();
  } else {
    await fetchClosedData();
  }
};

// --- Endpoint mapping per DetailKind ---
const CLOSED_ENDPOINT_MAP: Record<string, string> = {
  "closed-penawaran-won": "closed-penawaran-won-detail",
  "closed-penawaran-lost": "closed-penawaran-lost-detail",
  "closed-so-won": "closed-so-won-detail",
  "closed-so-lost": "closed-so-lost-detail",
};

const openClosedDetail = async (kind: DetailKind, userCreate: string) => {
  if (!userCreate) return;
  detailKind.value = kind;
  detailUserCreate.value = userCreate;
  detailDialog.value = true;
  detailLoading.value = true;
  try {
    const endpoint = CLOSED_ENDPOINT_MAP[kind];
    const response = await api.get(`/laporan-produktivitas/${endpoint}`, {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang: filters.cabang,
        userCreate,
      },
    });
    if (kind.endsWith("won")) {
      closedWonDetailData.value = response.data;
    } else {
      closedLostDetailData.value = response.data;
    }
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat detail.");
  } finally {
    detailLoading.value = false;
  }
};

const clearGudangFilter = () => {
  if (CABKAOS === "KDC") filters.cabang = "ALL";
};

// --- EXPORT TO EXCEL ---
const exportToExcel = async () => {
  const source = currentTab.value === "open" ? treeRawData.value : closedData.value;
  if (source.length === 0) return toast.warning("Tidak ada data untuk diekspor.");

  toast.info("Menyiapkan file spreadsheet...");
  try {
    const workbook = new ExcelJS.Workbook();

    const styleHeader = (row: ExcelJS.Row) => {
      row.height = 22;
      row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D47A1" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
    };

    if (currentTab.value === "open") {
      // ---------- SHEET 1: Ringkasan per Cabang ----------
      const sheetCabang = workbook.addWorksheet("Ringkasan Cabang");
      const colDefsCabang = [
        { header: "Cabang", key: "cabang", width: 20 },
        { header: "Total Penawaran", key: "jmlPen", width: 16 },
        { header: "Nominal Penawaran", key: "nomPen", width: 20 },
        { header: "Rata2 Umur Penawaran (hari)", key: "umurPen", width: 24 },
        { header: "Total SO", key: "jmlSo", width: 12 },
        { header: "Nominal SO", key: "nomSo", width: 20 },
        { header: "Rata2 Umur SO (hari)", key: "umurSo", width: 20 },
      ];
      sheetCabang.columns = colDefsCabang.map((c) => ({ width: c.width }));
      styleHeader(sheetCabang.addRow(colDefsCabang.map((c) => c.header)));
      treeData.value.forEach((c) => {
        sheetCabang.addRow([
          c.cabangNama,
          c.penawaran.jumlah,
          c.penawaran.nominal,
          avgHari(c.penawaran) ?? "-",
          c.so.jumlah,
          c.so.nominal,
          avgHari(c.so) ?? "-",
        ]);
      });
      sheetCabang.getColumn(3).numFmt = "#,##0";
      sheetCabang.getColumn(6).numFmt = "#,##0";

      // ---------- SHEET 2: Ringkasan per Sales/PIC ----------
      const sheetSales = workbook.addWorksheet("Ringkasan Sales-PIC");
      const colDefsSales = [
        { header: "Cabang", key: "cabang", width: 18 },
        { header: "Sales / PIC", key: "user", width: 16 },
        { header: "Total Penawaran", key: "jmlPen", width: 16 },
        { header: "Nominal Penawaran", key: "nomPen", width: 20 },
        { header: "Rata2 Umur Penawaran (hari)", key: "umurPen", width: 24 },
        { header: "Total SO", key: "jmlSo", width: 12 },
        { header: "Nominal SO", key: "nomSo", width: 20 },
        { header: "Rata2 Umur SO (hari)", key: "umurSo", width: 20 },
      ];
      sheetSales.columns = colDefsSales.map((c) => ({ width: c.width }));
      styleHeader(sheetSales.addRow(colDefsSales.map((c) => c.header)));
      treeData.value.forEach((c) => {
        c.users.forEach((u) => {
          sheetSales.addRow([
            c.cabangNama,
            u.userCreate,
            u.penawaran.jumlah,
            u.penawaran.nominal,
            avgHari(u.penawaran) ?? "-",
            u.so.jumlah,
            u.so.nominal,
            avgHari(u.so) ?? "-",
          ]);
        });
      });
      sheetSales.getColumn(4).numFmt = "#,##0";
      sheetSales.getColumn(7).numFmt = "#,##0";

      // ---------- FETCH DETAIL PER DOKUMEN (3 sheet baru) ----------
      const [penawaranDetail, soInternalDetail, soPabrikDetail] = await Promise.all([
        api.get<ExportPenawaranDetail[]>("/laporan-produktivitas/open-penawaran-detail", {
          params: filters,
        }),
        api.get<ExportSoInternalDetail[]>("/laporan-produktivitas/tree/so-internal-detail-all", {
          params: filters,
        }),
        api.get<ExportSoPabrikDetail[]>("/laporan-produktivitas/tree/so-pabrik-detail-all", {
          params: {
            startDate: filters.startDate,
            endDate: filters.endDate,
            cabang: filters.cabang,
          },
        }),
      ]);

      // ---------- SHEET 3: Detail Penawaran ----------
      const sheetPen = workbook.addWorksheet("Detail Penawaran");
      const colDefsPen = [
        { header: "No. Penawaran", key: "nomor", width: 20 },
        { header: "Tanggal", key: "tanggal", width: 14 },
        { header: "Sales", key: "user", width: 14 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Telp", key: "telp", width: 16 },
        { header: "Cabang", key: "cabang", width: 16 },
        { header: "Umur (hari)", key: "umur", width: 14 },
        { header: "Nominal", key: "nominal", width: 18 },
      ];
      sheetPen.columns = colDefsPen.map((c) => ({ width: c.width }));
      styleHeader(sheetPen.addRow(colDefsPen.map((c) => c.header)));
      penawaranDetail.data.forEach((item) => {
        sheetPen.addRow([
          item.nomor,
          new Date(item.tanggal).toLocaleDateString("id-ID"),
          item.userCreate || "-",
          item.namaCustomer,
          item.telpCustomer,
          item.namaCabang,
          item.umurHari,
          item.nominal,
        ]);
      });
      sheetPen.getColumn(8).numFmt = "#,##0";

      // ---------- SHEET 4: Detail SO Internal ----------
      const sheetSoInt = workbook.addWorksheet("Detail SO Internal");
      const colDefsSoInt = [
        { header: "No. SO", key: "nomor", width: 20 },
        { header: "Ref. Penawaran", key: "ref", width: 20 },
        { header: "Tanggal", key: "tanggal", width: 14 },
        { header: "Sales", key: "user", width: 14 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Telp", key: "telp", width: 16 },
        { header: "Cabang", key: "cabang", width: 16 },
        { header: "Dateline", key: "dateline", width: 14 },
        { header: "Overdue (hari)", key: "overdue", width: 16 },
        { header: "Nominal", key: "nominal", width: 18 },
      ];
      sheetSoInt.columns = colDefsSoInt.map((c) => ({ width: c.width }));
      styleHeader(sheetSoInt.addRow(colDefsSoInt.map((c) => c.header)));
      soInternalDetail.data.forEach((item) => {
        sheetSoInt.addRow([
          item.nomor,
          item.nomorPenawaran || "-",
          new Date(item.tanggal).toLocaleDateString("id-ID"),
          item.userCreate,
          item.namaCustomer,
          item.telpCustomer,
          item.namaCabang,
          item.dateline ? new Date(item.dateline).toLocaleDateString("id-ID") : "-",
          item.overdueHari,
          item.nominal,
        ]);
      });
      sheetSoInt.getColumn(10).numFmt = "#,##0";

      // ---------- SHEET 5: Detail SO Pabrik ----------
      const sheetSoPab = workbook.addWorksheet("Detail SO Pabrik");
      const colDefsSoPab = [
        { header: "No. SO", key: "nomor", width: 20 },
        { header: "No. SPK", key: "spk", width: 18 },
        { header: "PIC SPK", key: "pic", width: 14 },
        { header: "Tanggal", key: "tanggal", width: 14 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Telp", key: "telp", width: 16 },
        { header: "Cabang", key: "cabang", width: 16 },
        { header: "Dateline", key: "dateline", width: 14 },
        { header: "Overdue (hari)", key: "overdue", width: 16 },
        { header: "Nominal", key: "nominal", width: 18 },
      ];
      sheetSoPab.columns = colDefsSoPab.map((c) => ({ width: c.width }));
      styleHeader(sheetSoPab.addRow(colDefsSoPab.map((c) => c.header)));
      soPabrikDetail.data.forEach((item) => {
        sheetSoPab.addRow([
          item.nomor,
          item.nomorSpk,
          item.picSpk,
          new Date(item.tanggal).toLocaleDateString("id-ID"),
          item.namaCustomer,
          item.telpCustomer,
          item.namaCabang,
          item.dateline ? new Date(item.dateline).toLocaleDateString("id-ID") : "-",
          item.overdueHari,
          item.nominal,
        ]);
      });
      sheetSoPab.getColumn(10).numFmt = "#,##0";
    } else {
      const sheet = workbook.addWorksheet("Closed Won-Lost");
      const colDefs = [
        { header: "Sales / User", key: "userCreate", width: 16 },
        { header: "Penawaran Won", key: "jmlPenawaranWon", width: 16 },
        { header: "Nominal Won", key: "nominalPenawaranWon", width: 18 },
        { header: "Penawaran Lost", key: "jmlPenawaranLost", width: 16 },
        { header: "Nominal Lost", key: "nominalPenawaranLost", width: 18 },
        { header: "SO Won", key: "jmlSoWon", width: 12 },
        { header: "Nominal SO Won", key: "nominalSoWon", width: 18 },
        { header: "SO Lost", key: "jmlSoLost", width: 12 },
        { header: "Nominal SO Lost", key: "nominalSoLost", width: 18 },
      ];
      sheet.columns = colDefs.map((c) => ({ width: c.width }));
      styleHeader(sheet.addRow(colDefs.map((c) => c.header)));
      closedData.value.forEach((item) => {
        sheet.addRow(colDefs.map((c) => (item as Record<string, unknown>)[c.key] ?? ""));
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Laporan_Produktivitas_${currentTab.value}_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Spreadsheet berhasil diekspor.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data ke file excel.");
  }
};

// --- NAVIGATOR ---
const goToPenawaran = (nomor: string) => {
  const route = router.resolve(`/transaksi/penjualan/penawaran/ubah/${nomor}`);
  window.open(route.href, "_blank");
};

const goToSo = (nomor: string) => {
  const route = router.resolve(`/transaksi/penjualan/surat-pesanan/ubah/${nomor}`);
  window.open(route.href, "_blank");
};

onMounted(() => {
  if (hasViewPermission) {
    if (CABKAOS === "KDC") fetchCabangOptions();
    fetchUserOptions();
    fetchReportData();
  }
});

watch(
  () => [filters.startDate, filters.endDate, filters.cabang, filters.userCreate],
  () => {
    fetchReportData();
  }
);

watch(currentTab, () => {
  fetchReportData();
});
</script>

<template>
  <PageLayout title="Laporan Rekap Penawaran & SO" icon="mdi-chart-timeline-variant-shimmer">
    <template #header-actions>
      <v-btn size="small" @click="exportToExcel" prepend-icon="mdi-file-excel" color="teal">
        Export Excel
      </v-btn>
    </template>

    <v-tabs
      v-model="currentTab"
      color="primary"
      density="compact"
      bg-color="grey-lighten-4"
      class="flex-shrink-0"
    >
      <v-tab value="open" class="font-weight-bold text-none">
        <v-icon start>mdi-progress-clock</v-icon> Masih Open
      </v-tab>
      <v-tab value="closed" class="font-weight-bold text-none">
        <v-icon start>mdi-check-decagram-outline</v-icon> Sudah Closed
      </v-tab>
    </v-tabs>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <!-- FILTER -->
      <div class="filter-section produktivitas-filter">
        <div class="d-flex align-center ga-2 flex-shrink-0 flex-wrap filter-group-left">
          <v-label class="filter-label ms-2">Dibuat Sejak:</v-label>
          <v-text-field
            v-model="filters.startDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            class="fixed-input tgl-input"
          />
          <v-label class="mx-2">s/d</v-label>
          <v-text-field
            v-model="filters.endDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            class="fixed-input tgl-input"
          />

          <template v-if="CABKAOS === 'KDC'">
            <v-label class="filter-label ms-2">Cabang:</v-label>
            <v-select
              v-model="filters.cabang"
              :items="cabangList"
              item-title="nama"
              item-value="kode"
              density="compact"
              hide-details
              variant="outlined"
              class="fixed-input gudang-input"
              clearable
              @click:clear="clearGudangFilter"
            />
          </template>

          <v-label class="filter-label ms-2">Sales:</v-label>
          <v-select
            v-model="filters.userCreate"
            :items="[{ userCreate: 'ALL' }, ...userList]"
            item-title="userCreate"
            item-value="userCreate"
            density="compact"
            hide-details
            variant="outlined"
            class="fixed-input user-input"
          />
        </div>

        <v-spacer />

        <div class="d-flex align-center ga-2 flex-shrink-0 filter-group-right">
          <template v-if="currentTab === 'open'">
            <v-chip color="primary" variant="tonal" size="small" class="font-weight-bold">
              <v-icon start size="14">mdi-file-document-outline</v-icon>
              {{ totalPenawaranOpen() }} Penawaran Open
            </v-chip>
            <v-chip color="indigo" variant="tonal" size="small" class="font-weight-bold">
              <v-icon start size="14">mdi-file-document-edit-outline</v-icon>
              {{ totalSoOpen() }} SO Open
            </v-chip>
          </template>
          <template v-else>
            <v-chip color="success" variant="tonal" size="small" class="font-weight-bold">
              <v-icon start size="14">mdi-check-circle-outline</v-icon>
              {{ totalPenawaranWon() }} Pen. Won / {{ totalSoWon() }} SO Won
            </v-chip>
            <v-chip color="error" variant="tonal" size="small" class="font-weight-bold">
              <v-icon start size="14">mdi-close-circle-outline</v-icon>
              {{ totalPenawaranLost() }} Pen. Lost / {{ totalSoLost() }} SO Lost
            </v-chip>
          </template>
          <v-btn
            @click="fetchReportData"
            icon="mdi-refresh"
            variant="text"
            size="small"
            :loading="isLoading"
            title="Refresh"
            class="ms-2"
          />
        </div>
      </div>

      <!-- SUMMARY BAR -->
      <div class="summary-bar">
        <template v-if="currentTab === 'open'">
          <div class="summary-item">
            <span class="summary-label">Total Nominal Penawaran Open</span>
            <span class="summary-value">{{ formatRupiah(totalNominalPenawaranOpen()) }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Nominal SO Open</span>
            <span class="summary-value">{{ formatRupiah(totalNominalSoOpen()) }}</span>
          </div>
        </template>
        <template v-else>
          <div class="summary-item">
            <span class="summary-label">Total Nominal Won (Pen. + SO)</span>
            <span class="summary-value text-success">
              {{
                formatRupiah(
                  closedData.reduce(
                    (s, i) => s + (i.nominalPenawaranWon || 0) + (i.nominalSoWon || 0),
                    0
                  )
                )
              }}
            </span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Nominal Lost (Pen. + SO)</span>
            <span class="summary-value text-error">
              {{
                formatRupiah(
                  closedData.reduce(
                    (s, i) => s + (i.nominalPenawaranLost || 0) + (i.nominalSoLost || 0),
                    0
                  )
                )
              }}
            </span>
          </div>
        </template>
      </div>

      <!-- TABLE -->
      <div class="table-container">
        <v-window v-model="currentTab" class="h-100">
          <v-window-item value="open" class="h-100">
            <div class="tree-scroll">
              <table class="tree-table">
                <thead>
                  <tr>
                    <th class="tree-col-label">Cabang / Sales / Kategori / Bucket</th>
                    <th class="tree-col-num">Total Penawaran</th>
                    <th class="tree-col-num">Nominal Penawaran</th>
                    <th class="tree-col-num">Rata2 Umur</th>
                    <th class="tree-col-num">Total SO</th>
                    <th class="tree-col-num">Nominal SO</th>
                    <th class="tree-col-num">Rata2 Umur</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="cabangNode in treeData" :key="cabangNode.cabang">
                    <!-- LEVEL 1: CABANG -->
                    <tr
                      class="tree-row tree-level-1"
                      @click="toggleExpand(`c:${cabangNode.cabang}`)"
                    >
                      <td class="tree-col-label">
                        <v-icon size="16" class="tree-toggle-icon">
                          {{
                            isExpanded(`c:${cabangNode.cabang}`)
                              ? "mdi-minus-box-outline"
                              : "mdi-plus-box-outline"
                          }}
                        </v-icon>
                        <strong>{{ cabangNode.cabangNama }}</strong>
                      </td>
                      <td class="tree-col-num">{{ cabangNode.penawaran.jumlah }}</td>
                      <td class="tree-col-num">{{ formatRupiah(cabangNode.penawaran.nominal) }}</td>
                      <td class="tree-col-num">
                        <v-chip
                          size="x-small"
                          :color="avgHariColor(avgHari(cabangNode.penawaran))"
                          variant="tonal"
                          class="font-weight-bold"
                        >
                          {{ avgHari(cabangNode.penawaran) ?? "-" }} hari
                        </v-chip>
                      </td>
                      <td class="tree-col-num">{{ cabangNode.so.jumlah }}</td>
                      <td class="tree-col-num">{{ formatRupiah(cabangNode.so.nominal) }}</td>
                      <td class="tree-col-num">
                        <v-chip
                          size="x-small"
                          :color="avgHariColor(avgHari(cabangNode.so))"
                          variant="tonal"
                          class="font-weight-bold"
                        >
                          {{ avgHari(cabangNode.so) ?? "-" }} hari
                        </v-chip>
                      </td>
                    </tr>
                    <template v-if="isExpanded(`c:${cabangNode.cabang}`)">
                      <template v-for="userNode in cabangNode.users" :key="userNode.userCreate">
                        <!-- LEVEL 2: SALES/PIC -->
                        <tr
                          class="tree-row tree-level-2"
                          @click="toggleExpand(`c:${cabangNode.cabang}|u:${userNode.userCreate}`)"
                        >
                          <td class="tree-col-label">
                            <v-icon size="16" class="tree-toggle-icon">
                              {{
                                isExpanded(`c:${cabangNode.cabang}|u:${userNode.userCreate}`)
                                  ? "mdi-minus-box-outline"
                                  : "mdi-plus-box-outline"
                              }}
                            </v-icon>
                            {{ userNode.userCreate }}
                          </td>
                          <td class="tree-col-num">{{ userNode.penawaran.jumlah }}</td>
                          <td class="tree-col-num">
                            {{ formatRupiah(userNode.penawaran.nominal) }}
                          </td>
                          <td class="tree-col-num">
                            <v-chip
                              size="x-small"
                              :color="avgHariColor(avgHari(userNode.penawaran))"
                              variant="tonal"
                              class="font-weight-bold"
                            >
                              {{ avgHari(userNode.penawaran) ?? "-" }} hari
                            </v-chip>
                          </td>
                          <td class="tree-col-num">{{ userNode.so.jumlah }}</td>
                          <td class="tree-col-num">{{ formatRupiah(userNode.so.nominal) }}</td>
                          <td class="tree-col-num">
                            <v-chip
                              size="x-small"
                              :color="avgHariColor(avgHari(userNode.so))"
                              variant="tonal"
                              class="font-weight-bold"
                            >
                              {{ avgHari(userNode.so) ?? "-" }} hari
                            </v-chip>
                          </td>
                        </tr>

                        <template
                          v-if="isExpanded(`c:${cabangNode.cabang}|u:${userNode.userCreate}`)"
                        >
                          <template
                            v-for="kategoriNode in userNode.kategoris"
                            :key="kategoriNode.kategori"
                          >
                            <!-- LEVEL 3: KATEGORI -->
                            <tr
                              class="tree-row tree-level-3"
                              @click="
                                toggleExpand(
                                  `c:${cabangNode.cabang}|u:${userNode.userCreate}|k:${kategoriNode.kategori}`
                                )
                              "
                            >
                              <td class="tree-col-label">
                                <v-icon size="16" class="tree-toggle-icon">
                                  {{
                                    isExpanded(
                                      `c:${cabangNode.cabang}|u:${userNode.userCreate}|k:${kategoriNode.kategori}`
                                    )
                                      ? "mdi-minus-box-outline"
                                      : "mdi-plus-box-outline"
                                  }}
                                </v-icon>
                                <v-icon size="14" class="me-1">{{ kategoriNode.icon }}</v-icon>
                                {{ kategoriNode.label }}
                              </td>
                              <template v-if="kategoriNode.kategori === 'penawaran'">
                                <td class="tree-col-num">{{ kategoriNode.jumlah }}</td>
                                <td class="tree-col-num">
                                  {{ formatRupiah(kategoriNode.nominal) }}
                                </td>
                                <td class="tree-col-num">
                                  <v-chip
                                    size="x-small"
                                    :color="
                                      avgHariColor(
                                        kategoriNode.jumlah
                                          ? kategoriNode.totalHari / kategoriNode.jumlah
                                          : null
                                      )
                                    "
                                    variant="tonal"
                                    class="font-weight-bold"
                                  >
                                    {{
                                      kategoriNode.jumlah
                                        ? Math.round(
                                            (kategoriNode.totalHari / kategoriNode.jumlah) * 10
                                          ) / 10
                                        : "-"
                                    }}
                                    hari
                                  </v-chip>
                                </td>
                                <td class="tree-col-num text-disabled">-</td>
                                <td class="tree-col-num text-disabled">-</td>
                                <td class="tree-col-num text-disabled">-</td>
                              </template>
                              <template v-else>
                                <td class="tree-col-num text-disabled">-</td>
                                <td class="tree-col-num text-disabled">-</td>
                                <td class="tree-col-num text-disabled">-</td>
                                <td class="tree-col-num">{{ kategoriNode.jumlah }}</td>
                                <td class="tree-col-num">
                                  {{ formatRupiah(kategoriNode.nominal) }}
                                </td>
                                <td class="tree-col-num">
                                  <v-chip
                                    size="x-small"
                                    :color="
                                      avgHariColor(
                                        kategoriNode.jumlah
                                          ? kategoriNode.totalHari / kategoriNode.jumlah
                                          : null
                                      )
                                    "
                                    variant="tonal"
                                    class="font-weight-bold"
                                  >
                                    {{
                                      kategoriNode.jumlah
                                        ? Math.round(
                                            (kategoriNode.totalHari / kategoriNode.jumlah) * 10
                                          ) / 10
                                        : "-"
                                    }}
                                    hari
                                  </v-chip>
                                </td>
                              </template>
                            </tr>

                            <template
                              v-if="
                                isExpanded(
                                  `c:${cabangNode.cabang}|u:${userNode.userCreate}|k:${kategoriNode.kategori}`
                                )
                              "
                            >
                              <!-- LEVEL 4: BUCKET (klikable -> dialog) -->
                              <tr
                                v-for="bucketNode in kategoriNode.buckets"
                                :key="bucketNode.bucket"
                                class="tree-row tree-level-4 tree-bucket-row"
                                @click="
                                  openBucketDetail(
                                    kategoriNode.kategori,
                                    cabangNode.cabang,
                                    userNode.userCreate,
                                    bucketNode.bucket
                                  )
                                "
                              >
                                <td class="tree-col-label">
                                  <v-chip
                                    size="x-small"
                                    :color="bucketNode.color"
                                    variant="tonal"
                                    class="font-weight-bold"
                                  >
                                    {{ bucketNode.label }}
                                  </v-chip>
                                </td>
                                <template v-if="kategoriNode.kategori === 'penawaran'">
                                  <td class="tree-col-num">
                                    <span class="clickable-count">{{ bucketNode.jumlah }}</span>
                                  </td>
                                  <td class="tree-col-num">
                                    {{ formatRupiah(bucketNode.nominal) }}
                                  </td>
                                  <td class="tree-col-num">
                                    {{
                                      bucketNode.jumlah
                                        ? Math.round(
                                            (bucketNode.totalHari / bucketNode.jumlah) * 10
                                          ) / 10
                                        : "-"
                                    }}
                                    hari
                                  </td>
                                  <td class="tree-col-num text-disabled">-</td>
                                  <td class="tree-col-num text-disabled">-</td>
                                  <td class="tree-col-num text-disabled">-</td>
                                </template>
                                <template v-else>
                                  <td class="tree-col-num text-disabled">-</td>
                                  <td class="tree-col-num text-disabled">-</td>
                                  <td class="tree-col-num text-disabled">-</td>
                                  <td class="tree-col-num">
                                    <span class="clickable-count">{{ bucketNode.jumlah }}</span>
                                  </td>
                                  <td class="tree-col-num">
                                    {{ formatRupiah(bucketNode.nominal) }}
                                  </td>
                                  <td class="tree-col-num">
                                    {{
                                      bucketNode.jumlah
                                        ? Math.round(
                                            (bucketNode.totalHari / bucketNode.jumlah) * 10
                                          ) / 10
                                        : "-"
                                    }}
                                    hari
                                  </td>
                                </template>
                              </tr>
                            </template>
                          </template>
                        </template>
                      </template>
                    </template>
                  </template>

                  <tr v-if="!isLoading && treeData.length === 0">
                    <td colspan="7" class="text-center text-medium-emphasis pa-6">
                      Tidak ada data pipeline open.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </v-window-item>

          <v-window-item value="closed" class="h-100">
            <AppDataTable
              :headers="headersClosed"
              :items="closedData"
              :loading="isLoading"
              class="desktop-table header-browse-blue"
              density="compact"
              fixed-header
              item-value="userCreate"
              :items-per-page="-1"
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
                        <v-icon v-if="isSorted(header)" size="small" class="ms-1">{{
                          getSortIcon(header)
                        }}</v-icon>
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

              <template #[`item.jmlPenawaranWon`]="{ item }">
                <span
                  class="clickable-count"
                  :class="{ 'text-disabled': !item.jmlPenawaranWon }"
                  @click="
                    item.jmlPenawaranWon
                      ? openClosedDetail('closed-penawaran-won', item.userCreate as string)
                      : null
                  "
                >
                  {{ item.jmlPenawaranWon }}
                </span>
              </template>
              <template #[`item.jmlPenawaranLost`]="{ item }">
                <span
                  class="clickable-count"
                  :class="{ 'text-disabled': !item.jmlPenawaranLost }"
                  @click="
                    item.jmlPenawaranLost
                      ? openClosedDetail('closed-penawaran-lost', item.userCreate as string)
                      : null
                  "
                >
                  {{ item.jmlPenawaranLost }}
                </span>
              </template>
              <template #[`item.jmlSoWon`]="{ item }">
                <span
                  class="clickable-count"
                  :class="{ 'text-disabled': !item.jmlSoWon }"
                  @click="
                    item.jmlSoWon
                      ? openClosedDetail('closed-so-won', item.userCreate as string)
                      : null
                  "
                >
                  {{ item.jmlSoWon }}
                </span>
              </template>
              <template #[`item.jmlSoLost`]="{ item }">
                <span
                  class="clickable-count"
                  :class="{ 'text-disabled': !item.jmlSoLost }"
                  @click="
                    item.jmlSoLost
                      ? openClosedDetail('closed-so-lost', item.userCreate as string)
                      : null
                  "
                >
                  {{ item.jmlSoLost }}
                </span>
              </template>

              <template #[`item.nominalPenawaranWon`]="{ item }">{{
                formatRupiah(item.nominalPenawaranWon)
              }}</template>
              <template #[`item.nominalPenawaranLost`]="{ item }">{{
                formatRupiah(item.nominalPenawaranLost)
              }}</template>
              <template #[`item.nominalSoWon`]="{ item }">{{
                formatRupiah(item.nominalSoWon)
              }}</template>
              <template #[`item.nominalSoLost`]="{ item }">{{
                formatRupiah(item.nominalSoLost)
              }}</template>
            </AppDataTable>
          </v-window-item>
        </v-window>
      </div>

      <!-- DETAIL DIALOG -->
      <v-dialog v-model="detailDialog" max-width="1200">
        <v-card class="detail-dialog-card">
          <v-card-title
            class="d-flex align-center justify-space-between"
            :class="
              detailKind.endsWith('lost')
                ? 'bg-red-darken-2'
                : detailKind.endsWith('won')
                ? 'bg-green-darken-2'
                : 'bg-blue-darken-3'
            "
          >
            <span class="text-white font-weight-bold">
              <v-icon start color="white">
                {{ detailKind.includes("so") ? "mdi-file-document-edit" : "mdi-handshake" }}
              </v-icon>
              Detail
              {{
                detailKind === "tree-penawaran"
                  ? "Penawaran Open"
                  : detailKind === "tree-so-internal"
                  ? "SO Internal Open"
                  : detailKind === "tree-so-pabrik"
                  ? "SO Pabrik Open"
                  : detailKind === "closed-penawaran-won"
                  ? "Penawaran Won"
                  : detailKind === "closed-penawaran-lost"
                  ? "Penawaran Lost"
                  : detailKind === "closed-so-won"
                  ? "SO Won"
                  : "SO Lost"
              }}
              — {{ detailUserCreate }}
            </span>
            <v-btn
              icon="mdi-close"
              variant="text"
              color="white"
              size="small"
              @click="detailDialog = false"
            />
          </v-card-title>

          <v-card-text class="pa-0 detail-dialog-content">
            <div class="detail-table-scroll">
              <!-- TREE: Penawaran -->
              <AppDataTable
                v-if="detailKind === 'tree-penawaran'"
                :headers="headersTreePenawaran"
                :items="treeDetailData"
                :loading="detailLoading"
                density="compact"
                fixed-header
                item-value="nomor"
                :items-per-page="-1"
                hide-default-footer
                class="detail-dialog-table"
              >
                <template #[`item.nomor`]="{ item }">
                  <span class="clickable-nomor" @click="goToPenawaran(item.nomor as string)">{{
                    item.nomor
                  }}</span>
                </template>
                <template #[`item.tanggal`]="{ item }">{{
                  new Date(item.tanggal as string).toLocaleDateString("id-ID")
                }}</template>
                <template #[`item.umurHari`]="{ item }">
                  <v-chip
                    size="x-small"
                    :color="(item.umurHari as number) > 7 ? 'red-darken-2' : (item.umurHari as number) >= 3 ? 'orange-darken-2' : 'grey'"
                    variant="tonal"
                    class="font-weight-bold"
                  >
                    {{ item.umurHari }} hari
                  </v-chip>
                </template>
                <template #[`item.nominal`]="{ item }">{{
                  formatRupiah(item.nominal as number)
                }}</template>
              </AppDataTable>

              <!-- TREE: SO Internal -->
              <AppDataTable
                v-else-if="detailKind === 'tree-so-internal'"
                :headers="headersTreeSoInternal"
                :items="treeDetailData"
                :loading="detailLoading"
                density="compact"
                fixed-header
                item-value="nomor"
                :items-per-page="-1"
                hide-default-footer
                class="detail-dialog-table"
              >
                <template #[`item.nomor`]="{ item }">
                  <span class="clickable-nomor" @click="goToSo(item.nomor as string)">{{
                    item.nomor
                  }}</span>
                </template>
                <template #[`item.nomorPenawaran`]="{ item }">
                  <span
                    v-if="item.nomorPenawaran"
                    class="clickable-nomor"
                    @click="goToPenawaran(item.nomorPenawaran as string)"
                    >{{ item.nomorPenawaran }}</span
                  >
                  <span v-else class="text-disabled">-</span>
                </template>
                <template #[`item.tanggal`]="{ item }">{{
                  new Date(item.tanggal as string).toLocaleDateString("id-ID")
                }}</template>
                <template #[`item.dateline`]="{ item }">{{
                  item.dateline
                    ? new Date(item.dateline as string).toLocaleDateString("id-ID")
                    : "-"
                }}</template>
                <template #[`item.overdueHari`]="{ item }">
                  <v-chip
                    size="x-small"
                    :color="(item.overdueHari as number) > 7 ? 'red-darken-2' : (item.overdueHari as number) >= 4 ? 'orange-darken-2' : 'grey'"
                    variant="tonal"
                    class="font-weight-bold"
                  >
                    {{ item.overdueHari }} hari
                  </v-chip>
                </template>
                <template #[`item.nominal`]="{ item }">{{
                  formatRupiah(item.nominal as number)
                }}</template>
              </AppDataTable>

              <!-- TREE: SO Pabrik -->
              <AppDataTable
                v-else-if="detailKind === 'tree-so-pabrik'"
                :headers="headersTreeSoPabrik"
                :items="treeDetailData"
                :loading="detailLoading"
                density="compact"
                fixed-header
                item-value="nomor"
                :items-per-page="-1"
                hide-default-footer
                class="detail-dialog-table"
              >
                <template #[`item.nomor`]="{ item }">
                  <span class="clickable-nomor" @click="goToSo(item.nomor as string)">{{
                    item.nomor
                  }}</span>
                </template>
                <template #[`item.tanggal`]="{ item }">{{
                  new Date(item.tanggal as string).toLocaleDateString("id-ID")
                }}</template>
                <template #[`item.dateline`]="{ item }">{{
                  item.dateline
                    ? new Date(item.dateline as string).toLocaleDateString("id-ID")
                    : "-"
                }}</template>
                <template #[`item.overdueHari`]="{ item }">
                  <v-chip
                    size="x-small"
                    :color="(item.overdueHari as number) > 21 ? 'red-darken-2' : (item.overdueHari as number) >= 15 ? 'orange-darken-2' : 'grey'"
                    variant="tonal"
                    class="font-weight-bold"
                  >
                    {{ item.overdueHari }} hari
                  </v-chip>
                </template>
                <template #[`item.nominal`]="{ item }">{{
                  formatRupiah(item.nominal as number)
                }}</template>
              </AppDataTable>

              <!-- CLOSED WON (Penawaran/SO) -->
              <AppDataTable
                v-else-if="detailKind === 'closed-penawaran-won' || detailKind === 'closed-so-won'"
                :headers="headersClosedWonDetail"
                :items="closedWonDetailData"
                :loading="detailLoading"
                density="compact"
                fixed-header
                item-value="nomor"
                :items-per-page="-1"
                hide-default-footer
                class="detail-dialog-table"
              >
                <template #[`item.nomor`]="{ item }">
                  <span
                    class="clickable-nomor"
                    @click="
                      detailKind === 'closed-penawaran-won'
                        ? goToPenawaran(item.nomor as string)
                        : goToSo(item.nomor as string)
                    "
                  >
                    {{ item.nomor }}
                  </span>
                </template>
                <template #[`item.tanggal`]="{ item }">{{
                  new Date(item.tanggal as string).toLocaleDateString("id-ID")
                }}</template>
                <template #[`item.refClosing`]="{ item }">
                  <span
                    v-if="detailKind === 'closed-penawaran-won' && item.nomorSo"
                    class="clickable-nomor"
                    @click="goToSo(item.nomorSo as string)"
                    >{{ item.nomorSo }}</span
                  >
                  <span
                    v-else-if="detailKind === 'closed-so-won' && item.nomorInvoice"
                    class="text-medium-emphasis"
                    >{{ item.nomorInvoice }}</span
                  >
                  <span v-else class="text-disabled">-</span>
                </template>
                <template #[`item.tanggalClosing`]="{ item }">{{
                  new Date(item.tanggalClosing as string).toLocaleDateString("id-ID")
                }}</template>
                <template #[`item.nominal`]="{ item }">{{
                  formatRupiah(item.nominal as number)
                }}</template>
              </AppDataTable>

              <!-- CLOSED LOST (Penawaran/SO) -->
              <AppDataTable
                v-else
                :headers="headersClosedLostDetail"
                :items="closedLostDetailData"
                :loading="detailLoading"
                density="compact"
                fixed-header
                item-value="nomor"
                :items-per-page="-1"
                hide-default-footer
                class="detail-dialog-table"
              >
                <template #[`item.nomor`]="{ item }">
                  <span
                    class="clickable-nomor"
                    @click="
                      detailKind === 'closed-penawaran-lost'
                        ? goToPenawaran(item.nomor as string)
                        : goToSo(item.nomor as string)
                    "
                  >
                    {{ item.nomor }}
                  </span>
                </template>
                <template #[`item.tanggal`]="{ item }">{{
                  new Date(item.tanggal as string).toLocaleDateString("id-ID")
                }}</template>
                <template #[`item.alasan`]="{ item }">
                  <v-chip
                    size="x-small"
                    color="orange-darken-4"
                    variant="tonal"
                    class="font-weight-bold"
                    >{{ item.alasan }}</v-chip
                  >
                </template>
                <template #[`item.tanggalClosing`]="{ item }">{{
                  new Date(item.tanggalClosing as string).toLocaleDateString("id-ID")
                }}</template>
                <template #[`item.nominal`]="{ item }">{{
                  formatRupiah(item.nominal as number)
                }}</template>
              </AppDataTable>
            </div>

            <div class="detail-footer-sticky">
              <span class="footer-label">Total {{ detailTotals.jumlahDokumen }} Dokumen</span>
              <span class="footer-grand-total"
                >Grand Total: {{ formatRupiah(detailTotals.totalNominal) }}</span
              >
            </div>
          </v-card-text>
        </v-card>
      </v-dialog>
    </div>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.produktivitas-filter {
  flex-wrap: wrap !important;
  row-gap: 6px !important;
}

.produktivitas-filter :deep(.fixed-input) {
  flex: 0 0 auto !important;
}

/* Cegah select ikut menyempit dari flex parent-nya sendiri */
.produktivitas-filter :deep(.v-select) {
  flex: 0 0 auto !important;
  min-width: unset !important;
}

.produktivitas-filter :deep(.gudang-input) {
  width: 170px !important;
}
.produktivitas-filter :deep(.user-input) {
  width: 150px !important;
}
.produktivitas-filter :deep(.tgl-input) {
  width: 140px !important;
}

/* Pastikan label statis (Cabang:/Sales:) sebaris & nggak wrap */
.produktivitas-filter :deep(.filter-label) {
  white-space: nowrap !important;
}

/* Karena sudah tanpa floating label, field 28px cukup & rapi */
.produktivitas-filter :deep(.v-field) {
  font-size: 11px !important;
  min-height: 28px !important;
  height: 28px !important;
}
.produktivitas-filter :deep(.v-field__input) {
  font-size: 11px !important;
  min-height: 28px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.produktivitas-filter :deep(.v-select__selection-text) {
  font-size: 11px !important;
  white-space: nowrap !important;
}
.produktivitas-filter :deep(input[type="date"]) {
  font-size: 11px !important;
  padding: 0 !important;
  text-align: center !important;
}

/* Chip area kanan jangan kepotong di layar sempit */
.filter-group-right {
  flex-wrap: nowrap;
}

/* ── Summary Bar ────────────────────────────────────────────────────── */
.summary-bar {
  flex-shrink: 0;
  display: flex;
  gap: 24px;
  padding: 10px 20px;
  background-color: #f5f7fa;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.summary-item {
  display: flex;
  flex-direction: column;
}
.summary-label {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.summary-value {
  font-size: 16px;
  font-weight: 700;
  color: #0d47a1;
}

/* ── Tabel ──────────────────────────────────────────────────────────── */
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

.desktop-table :deep(td) {
  white-space: nowrap;
  height: 32px !important;
  padding: 0 8px !important;
}

.resizable-header {
  position: relative;
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #0d47a1 !important;
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
  border-right: 2px solid rgba(255, 255, 255, 0.6);
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.clickable-count {
  cursor: pointer;
  color: #0d47a1;
  font-weight: 700;
  text-decoration: underline dotted;
}
.clickable-count:hover {
  color: #1565c0;
}
.clickable-count.text-disabled {
  cursor: default;
  color: inherit;
  text-decoration: none;
  font-weight: 400;
}
.clickable-nomor {
  cursor: pointer;
  color: #0d47a1;
  font-weight: 700;
  text-decoration: underline dotted;
}
.clickable-nomor:hover {
  color: #1565c0;
  text-decoration: underline solid;
}

/* ── Detail Dialog ──────────────────────────────────────────────────── */
.detail-dialog-card :deep(.v-card-title) {
  font-size: 15px !important;
  padding: 14px 20px !important;
}
.detail-dialog-card :deep(.v-card-title .v-icon) {
  font-size: 20px !important;
}

.detail-dialog-table :deep(th) {
  font-size: 11px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  height: 36px !important;
  padding: 0 10px !important;
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  white-space: nowrap;
}

.detail-dialog-table :deep(td) {
  font-size: 11px !important;
  height: 30px !important;
  padding: 0 10px !important;
  white-space: nowrap;
}

.detail-dialog-table :deep(.v-chip) {
  font-size: 10px !important;
  height: 20px !important;
}

.detail-dialog-table :deep(.v-data-table-footer) {
  font-size: 11px !important;
}
.detail-dialog-table :deep(.v-data-table-footer .v-field__input) {
  font-size: 11px !important;
  min-height: 28px !important;
}

.detail-dialog-content {
  display: flex;
  flex-direction: column;
  max-height: 65vh;
}

.detail-table-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}

.detail-footer-sticky {
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background-color: #eef3fa;
  border-top: 2px solid #0d47a1;
  font-size: 12px;
}

.footer-label {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-weight: 600;
}

.footer-grand-total {
  font-size: 14px;
  font-weight: 800;
  color: #0d47a1;
}

.tree-scroll {
  height: 100%;
  overflow: auto;
}

.tree-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.tree-table thead th {
  position: sticky;
  top: 0;
  z-index: 5;
  background-color: #0d47a1;
  color: #fff;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 11px;
  padding: 8px;
  text-align: left;
}
.tree-col-num {
  text-align: right !important;
  width: 140px;
}

.tree-row {
  cursor: pointer;
  border-bottom: 1px solid #eceff1;
}
.tree-row:hover {
  background-color: #f5faff;
}
.tree-row td {
  padding: 6px 8px;
}

.tree-toggle-icon {
  margin-right: 4px;
  color: #0d47a1;
}

.tree-level-1 {
  background-color: #e3f2fd;
  font-size: 12px;
}
.tree-level-2 td:first-child {
  padding-left: 32px;
}
.tree-level-3 td:first-child {
  padding-left: 56px;
}
.tree-level-4 td:first-child {
  padding-left: 80px;
}

.tree-bucket-row {
  background-color: #fafafa;
}
.tree-bucket-row:hover {
  background-color: #eef3fa;
}

.tree-col-num {
  text-align: right !important;
  width: 120px;
}
td.text-disabled {
  color: rgba(var(--v-theme-on-surface), 0.35) !important;
}
</style>

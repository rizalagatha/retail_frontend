<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import axios from "axios";

// --- Tipe Data ---
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

type StatusTerima = "BELUM" | "SEBAGIAN" | "SEMUA";
type TabAsal = "GABUNGAN" | "RETAIL" | "DC";
type AsalBaris = "DC" | "RETAIL";
type StatusPacking = "DITERIMA" | "SEBAGIAN" | "BELUM";

interface MasterItem {
  nomor: string;
  tanggal: string;
  nomorTerima: string | null; // bisa lebih dari satu, dipisah koma
  tglTerima: string | null; // tanggal penerimaan terakhir
  nomorTolak: string | null;
  tglTolak: string | null;
  asalGudang: string;
  keterangan: string;
  jumlahPenerimaan: number;
  totalQty: number;
  diterima: number;
  kekurangan: number;
  persen: number;
  statusTerima: StatusTerima;
  closing: "Y" | "N";
  [key: string]: unknown;
}

interface DetailItem {
  nomor: string;
  packing: string;
  spk: string;
  gudang: string | null;
  asal: AsalBaris;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  diterima: number;
  selisih: number;
  status: StatusPacking;
  nomorTerima: string;
  tglTerima: string | null;
}

interface PackingGroup {
  packing: string;
  spk: string;
  gudang: string;
  asal: AsalBaris | "CAMPUR";
  jumlah: number;
  diterima: number;
  selisih: number;
  status: StatusPacking;
  nomorTerima: string;
  tglTerima: string | null;
  items: DetailItem[];
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

interface TerimaStbjExportDetail {
  "Nomor STBJ": string;
  "Tgl Kirim"?: string | Date;
  "Tgl Terima"?: string | Date;
  "Nama Barang": string;
  [key: string]: unknown;
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "211";

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);

const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => {} });

const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  gudang: "WH003", // Fixed value
  gudangNama: "GUDANG JADI KAOSAN", // Nama gudang
  tab: "GABUNGAN" as TabAsal,
});

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: "", operator: "=", value: "" });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);

// Terima boleh berulang selama masih ada kekurangan
const canTerima = computed(
  () =>
    isSingleSelected.value &&
    selectedRow.value?.statusTerima !== "SEMUA" &&
    !selectedRow.value?.nomorTolak
);
// Tolak hanya untuk STBJ yang belum disentuh sama sekali
const canTolak = computed(
  () =>
    isSingleSelected.value &&
    selectedRow.value?.statusTerima === "BELUM" &&
    !selectedRow.value?.nomorTolak
);
const canBatalTolak = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTolak);

// --- Header Definisi (Resizable) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor STBJ", key: "nomor", width: 160, fixed: true },
  { title: "Tanggal", key: "tanggal", width: 110 },
  { title: "Asal Gudang", key: "asalGudang", width: 120 },
  { title: "Status Terima", key: "statusTerima", align: "center", width: 120 },
  { title: "% Terima", key: "persen", align: "center", width: 130 },
  { title: "Kekurangan", key: "kekurangan", align: "end", width: 110 },
  { title: "Nomor Terima", key: "nomorTerima", width: 200 },
  { title: "Nomor Tolak", key: "nomorTolak", width: 150 },
  { title: "User Create", key: "userCreate", width: 120 },
  { title: "Closing", key: "closing", align: "center", width: 80 },
]);

const packingHeaders = [
  { title: "No. Packing", key: "packing", width: "170px" },
  { title: "SPK", key: "spk", width: "150px" },
  { title: "Jenis", key: "asal", align: "center", width: "100px" },
  { title: "Gudang Asal", key: "gudang", width: "120px" },
  { title: "Total Qty", key: "jumlah", align: "end", width: "90px" },
  { title: "Diterima DC", key: "diterima", align: "end", width: "100px" },
  { title: "Selisih", key: "selisih", align: "end", width: "80px" },
  { title: "Status", key: "status", align: "center", width: "120px" },
  { title: "No. Terima", key: "nomorTerima", width: "170px" },
  { title: "Tgl Terima", key: "tglTerima", width: "100px" },
  { title: "", key: "aksi", align: "center", sortable: false, width: "70px" },
] as const;

const itemHeaders = [
  { title: "Kode", key: "kode", width: "90px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "60px" },
  { title: "Qty STBJ", key: "jumlah", align: "end", width: "80px" },
  { title: "Diterima", key: "diterima", align: "end", width: "80px" },
  { title: "Selisih", key: "selisih", align: "end", width: "70px" },
] as const;

// --- Meta Status ---
// Item slot bertipe longgar, jadi helper menerima unknown dan mempersempit sendiri
const STATUS_TERIMA_META: Record<StatusTerima, { label: string; color: string }> = {
  BELUM: { label: "Belum", color: "red" },
  SEBAGIAN: { label: "Sebagian", color: "orange" },
  SEMUA: { label: "Semua", color: "green" },
};
const STATUS_PACKING_META: Record<StatusPacking, { label: string; color: string }> = {
  DITERIMA: { label: "Diterima", color: "green" },
  SEBAGIAN: { label: "Sebagian", color: "orange" },
  BELUM: { label: "Belum Diterima", color: "red" },
};
const metaStatusTerima = (s: unknown) =>
  s === "BELUM" || s === "SEBAGIAN" || s === "SEMUA" ? STATUS_TERIMA_META[s] : null;
const metaStatusPacking = (s: unknown) =>
  s === "DITERIMA" || s === "SEBAGIAN" || s === "BELUM" ? STATUS_PACKING_META[s] : null;
const ASAL_META: Record<AsalBaris | "CAMPUR", { label: string; color: string }> = {
  DC: { label: "Stok DC", color: "grey-darken-1" },
  RETAIL: { label: "SPK Retail", color: "orange-darken-4" },
  CAMPUR: { label: "Campur", color: "grey-darken-1" },
};
const metaAsal = (a: unknown) =>
  a === "DC" || a === "RETAIL" || a === "CAMPUR" ? ASAL_META[a] : null;

const fmtQty = (n: unknown) => Number(n || 0).toLocaleString("id-ID");
const fmtTgl = (v: string | null | undefined) => (v ? format(new Date(v), "dd/MM/yyyy") : "-");

// --- Detail: dikelompokkan per packing (sumber: baris detail dari server) ---
const groupedDetails = computed<Record<string, PackingGroup[]>>(() => {
  const result: Record<string, PackingGroup[]> = {};
  for (const [nomor, rows] of Object.entries(details.value)) {
    const map = new Map<string, PackingGroup>();
    for (const r of rows) {
      if (filters.tab !== "GABUNGAN" && r.asal !== filters.tab) continue;
      let g = map.get(r.packing);
      if (!g) {
        g = {
          packing: r.packing,
          spk: r.spk,
          gudang: r.gudang ?? "DC",
          asal: r.asal,
          jumlah: 0,
          diterima: 0,
          selisih: 0,
          status: "BELUM",
          nomorTerima: r.nomorTerima,
          tglTerima: r.tglTerima,
          items: [],
        };
        map.set(r.packing, g);
      }
      g.jumlah += r.jumlah;
      g.diterima += r.diterima;
      g.items.push(r);
      if (g.asal !== r.asal) g.asal = "CAMPUR";
      if (!g.spk.split(", ").includes(r.spk)) g.spk += `, ${r.spk}`;
    }
    for (const g of map.values()) {
      g.selisih = g.diterima - g.jumlah;
      g.status = g.diterima >= g.jumlah ? "DITERIMA" : g.diterima > 0 ? "SEBAGIAN" : "BELUM";
    }
    result[nomor] = [...map.values()];
  }
  return result;
});

// Panel rincian barang per packing yang sedang dibuka (per STBJ)
const panelPacking = reactive<Record<string, string | undefined>>({});
const activeGroup = (nomor: string): PackingGroup | null => {
  const key = panelPacking[nomor];
  if (key === undefined) return null;
  return groupedDetails.value[nomor]?.find((g) => g.packing === key) ?? null;
};

// --- Logic Filter Client-Side ---
const filteredList = computed(() => {
  let data = [...masterData.value];

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
          default:
            return true;
        }
      });
    }
  }
  return data;
});

// --- Methods: Filter Logic ---
const uniqueValues = (key: string): Array<string | number> => {
  return Array.from(
    new Set(
      masterData.value
        .map((i) => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== "")
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
};

const formatFilterValue = (key: string, val: string | number) => {
  if (!val) return "-";
  if (["tanggal"].includes(key)) {
    try {
      return format(new Date(String(val)), "dd/MM/yyyy");
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
};

// --- Methods: Resize Logic ---
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

// --- Logic Selection ---
const handleRowClick = (_event: Event, { item }: { item: MasterItem }) => {
  selected.value = [item];
};

// --- Methods ---

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/terima-stbj", { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor)
  );
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get("/terima-stbj/details", {
      params: { nomor: nomorToLoad },
    });
    details.value[nomorToLoad] = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = `Gagal memuat detail untuk ${nomorToLoad}`;
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleTerima = () => {
  const row = selectedRow.value; // [PERBAIKAN]
  if (!canTerima.value || !row) return;
  router.push({ name: "TerimaStbjCreate", query: { nomorKirim: row.nomor } });
};

const handleTolak = () => {
  const row = selectedRow.value; // [PERBAIKAN]
  if (!canTolak.value || !row) return;
  router.push({ name: "TolakStbjCreate", query: { nomorKirim: row.nomor } });
};

const handleBatalTolak = () => {
  const row = selectedRow.value; // [PERBAIKAN]
  if (!canBatalTolak.value || !row) return;

  showConfirmation(
    "Konfirmasi Batal Tolak",
    `Yakin membatalkan penolakan untuk STBJ dengan nomor <strong>${row.nomor}</strong>?`,
    async () => {
      try {
        const response = await api.delete("/terima-stbj/cancel-rejection", {
          params: { nomor: row.nomor },
        });
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error: unknown) {
        // [PERBAIKAN]
        let msg = "Gagal membatalkan penolakan.";
        if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
        toast.error(msg);
      }
    }
  );
};

const getRowTextColor = (item: MasterItem) => {
  if (!!item.nomorTolak) return "text-blue";
  if (item.statusTerima === "BELUM") return "text-red";
  if (item.statusTerima === "SEBAGIAN") return "text-orange-darken-2";
  return "";
};

// const getCellClass = (item: MasterItem) => {
//   if (item.statusPengajuan === 'WAIT') return 'bg-blue text-white';
//   if (item.statusPengajuan === 'ACC') return 'bg-green text-white';
//   if (item.statusPengajuan === 'TOLAK') return 'bg-red text-white';
//   return '';
// };

// Helper Format Tanggal
const formatDateIndo = (dateString: string | Date | null | undefined) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

// Helper Auto Width Columns (wscols)
const getAutoColumnWidth = (data: Record<string, unknown>[]) => {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map((key) => ({
    wch: Math.max(key.length + 5, 15),
  }));
};

// --- 2. Fungsi Export Data ---
const exportData = async (type: "header" | "detail") => {
  const fileName =
    type === "header" ? "Export_Terima_STBJ_Header.xlsx" : "Export_Terima_STBJ_Detail.xlsx";

  // === EXPORT HEADER (Dari Frontend masterData) ===
  if (type === "header") {
    if (masterData.value.length === 0) {
      toast.warning("Tidak ada data header untuk diekspor.");
      return;
    }

    try {
      toast.info("Membuat file Excel Header...");

      // Mapping & Formatting Tanggal
      // Kita casting masterData.value ke tipe MasterItem[] dulu agar aman
      const sourceData = masterData.value as MasterItem[];

      const formattedHeader = sourceData.map((item) => ({
        ...item,
        // Format semua field tanggal yang ada
        tanggal: item.tanggal ? formatDateIndo(item.tanggal) : "",
        tglTerima: item.tglTerima ? formatDateIndo(item.tglTerima) : "",
        tglTolak: item.tglTolak ? formatDateIndo(item.tglTolak) : "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);

      // [FITUR] Auto Width Columns
      worksheet["!cols"] = getAutoColumnWidth(formattedHeader);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Terima STBJ Header");
      XLSX.writeFile(workbook, fileName);

      toast.success("Header berhasil diekspor.");
    } catch (error: unknown) {
      toast.error("Gagal mengekspor data header.");
      console.error(error); // Agar error terpakai
    }

    // === EXPORT DETAIL (Dari Backend) ===
  } else if (type === "detail") {
    try {
      toast.info("Mengambil data detail dari server...");

      const response = await api.get<TerimaStbjExportDetail[]>("/terima-stbj/export-details", {
        params: filters,
      });

      if (response.data.length === 0) {
        toast.warning("Tidak ada data detail.");
        return;
      }

      toast.info("Membuat file Excel Detail...");

      // Mapping & Formatting Tanggal Detail
      const formattedDetail = response.data.map((row) => ({
        ...row,
        "Tgl Kirim": row["Tgl Kirim"] ? formatDateIndo(row["Tgl Kirim"]) : "",
        "Tgl Terima": row["Tgl Terima"] ? formatDateIndo(row["Tgl Terima"]) : "",
      }));

      // Layout Excel (Judul & Periode)
      const title = "LAPORAN DETAIL TERIMA STBJ";
      const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(
        filters.endDate
      )}`;
      const tableHeaders = Object.keys(formattedDetail[0]);

      const tableData = formattedDetail.map((row) => Object.values(row as Record<string, unknown>));

      const excelData = [[title], [dateRange], [], tableHeaders, ...tableData];

      const worksheet = XLSX.utils.aoa_to_sheet(excelData);

      // Merge Judul
      const merge = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } },
      ];
      worksheet["!merges"] = merge;

      // [FITUR] Auto Width Columns
      worksheet["!cols"] = tableHeaders.map((header) => ({ wch: Math.max(header.length + 5, 15) }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Terima STBJ Detail");
      XLSX.writeFile(workbook, fileName);

      toast.success("Detail berhasil diekspor.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Gagal mengekspor data detail: " + message);
    }
  }
};

onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Terima STBJ" icon="mdi-truck-check-outline">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-check"
        @click="handleTerima"
        :disabled="!canTerima"
        >Terima</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-close"
        @click="handleTolak"
        :disabled="!canTolak"
        >Tolak</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-restore"
        @click="handleBatalTolak"
        :disabled="!canBatalTolak"
        >Batal Tolak</v-btn
      >
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn
            size="small"
            variant="tonal"
            class="btn-header-action"
            prepend-icon="mdi-file-excel"
            v-bind="props"
            >Export</v-btn
          >
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"
            ><v-list-item-title>Export Header</v-list-item-title></v-list-item
          >
          <v-list-item @click="exportData('detail')"
            ><v-list-item-title>Export Detail</v-list-item-title></v-list-item
          >
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Tgl Kirim:</span>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          class="periode-field"
        />
        <span class="filter-sep">s/d</span>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          class="periode-field"
        />
        <v-text-field
          label="Gudang"
          v-model="filters.gudang"
          density="compact"
          hide-details
          readonly
          variant="outlined"
          class="ms-4 field-gudang"
        />
        <v-text-field
          v-model="filters.gudangNama"
          density="compact"
          hide-details
          readonly
          variant="outlined"
          class="ms-2 field-gudang-nama"
        />

        <v-spacer />

        <div class="d-flex align-center ga-4 text-caption me-2">
          <div>
            <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diproses
          </div>
          <div>
            <v-icon color="orange" icon="mdi-square-rounded" size="small"></v-icon> Sebagian
          </div>
          <div><v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> Ditolak</div>
        </div>

        <v-btn
          variant="tonal"
          size="small"
          icon="mdi-filter-off"
          class="btn-header-action ms-1"
          title="Reset semua filter"
          @click="resetAllFilters"
        />

        <v-btn
          @click="fetchMasterData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          class="btn-refresh"
          title="Muat ulang data"
          :loading="loading"
        />
      </div>

      <v-tabs
        v-model="filters.tab"
        density="compact"
        class="browse-tabs"
        color="#b71c1c"
        slider-color="#b71c1c"
        :disabled="loading"
      >
        <v-tab value="GABUNGAN" prepend-icon="mdi-view-list-outline">Gabungan</v-tab>
        <v-tab value="RETAIL" prepend-icon="mdi-storefront-outline">SPK Retail</v-tab>
        <v-tab value="DC" prepend-icon="mdi-warehouse">Stok DC</v-tab>
      </v-tabs>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="filteredList"
          :loading="loading"
          item-value="nomor"
          density="compact"
          class="desktop-table"
          fixed-header
          show-select
          show-expand
          return-object
          single-select
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
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

                <th
                  v-else
                  :style="{ width: header.width + 'px' }"
                  class="resizable-header"
                  @click="toggleSort(header)"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="14">{{ getSortIcon(header) }}</v-icon>

                    <v-menu location="bottom start" :close-on-content-click="false">
                      <template #activator="{ props }">
                        <v-icon
                          v-bind="props"
                          size="16"
                          class="ms-1"
                          :class="{ 'filter-active': isFilterActive(header.key) }"
                          @click.stop
                          :icon="
                            filterType(header.key) === 'custom'
                              ? 'mdi-filter-cog'
                              : filterType(header.key) === 'multi'
                              ? 'mdi-filter-multiple'
                              : 'mdi-filter-variant'
                          "
                        />
                      </template>
                      <v-list class="filter-menu" density="compact">
                        <v-list-item @click="clearColumnFilter(header.key)">
                          <v-list-item-title class="text-caption font-weight-bold text-error"
                            >(Clear Filter)</v-list-item-title
                          >
                        </v-list-item>
                        <v-divider />
                        <v-list-item
                          v-for="val in uniqueValues(header.key)"
                          :key="val"
                          @click="toggleMultiSelectValue(header.key, val)"
                        >
                          <template #prepend>
                            <v-checkbox-btn
                              color="red-darken-4"
                              :model-value="columnFilters[header.key]?.values?.includes(val)"
                              density="compact"
                            />
                          </template>
                          <v-list-item-title>{{
                            formatFilterValue(header.key, val)
                          }}</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click="openCustomFilter(header.key)">
                          <v-list-item-title class="custom-filter-item"
                            >(Custom Filter...)</v-list-item-title
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

          <template #[`item.nomor`]="{ item }">
            <span :class="getRowTextColor(item)">{{ item.nomor }}</span>
          </template>

          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal), "dd/MM/yyyy") }}
          </template>

          <template #[`item.statusTerima`]="{ item }">
            <v-chip
              v-if="metaStatusTerima(item.statusTerima)"
              size="x-small"
              :color="metaStatusTerima(item.statusTerima)?.color"
              class="font-weight-bold"
            >
              {{ metaStatusTerima(item.statusTerima)?.label }}
            </v-chip>
          </template>

          <template #[`item.persen`]="{ item }">
            <v-progress-linear
              :model-value="Number(item.persen) || 0"
              :color="metaStatusTerima(item.statusTerima)?.color"
              height="14"
              rounded
            >
              <span class="persen-text">
                {{
                  Number(item.persen || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })
                }}%
              </span>
            </v-progress-linear>
          </template>

          <template #[`item.kekurangan`]="{ item }">
            <span :class="Number(item.kekurangan) > 0 ? 'text-red font-weight-bold' : ''">
              {{ Number(item.kekurangan) > 0 ? fmtQty(item.kekurangan) : "-" }}
            </span>
          </template>

          <template #[`item.closing`]="{ item }">
            <v-chip size="x-small" :color="item.closing === 'Y' ? 'green' : 'grey'">
              {{ item.closing }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>

                    <template v-else-if="groupedDetails[item.nomor]">
                      <div class="detail-summary">
                        <v-chip size="small" variant="tonal" color="blue">
                          Total STBJ: {{ fmtQty(item.totalQty) }} pcs
                        </v-chip>
                        <v-chip size="small" variant="tonal" color="green">
                          Diterima DC: {{ fmtQty(item.diterima) }} pcs
                        </v-chip>
                        <v-chip
                          size="small"
                          variant="tonal"
                          :color="Number(item.kekurangan) > 0 ? 'red' : 'grey'"
                        >
                          Kekurangan: {{ fmtQty(item.kekurangan) }} pcs
                        </v-chip>
                        <v-chip size="small" variant="tonal" color="indigo">
                          {{ item.jumlahPenerimaan }}x penerimaan
                        </v-chip>
                      </div>

                      <div class="detail-body">
                        <v-data-table
                          :headers="packingHeaders"
                          :items="groupedDetails[item.nomor]"
                          item-value="packing"
                          density="compact"
                          class="detail-table"
                          :items-per-page="-1"
                          hide-default-footer
                        >
                          <template #[`item.packing`]="{ item: g }">
                            {{ g.packing || "(tanpa packing)" }}
                          </template>
                          <template #[`item.asal`]="{ item: g }">
                            <v-chip
                              v-if="metaAsal(g.asal)"
                              size="x-small"
                              variant="tonal"
                              class="font-weight-bold"
                              :color="metaAsal(g.asal)?.color"
                            >
                              {{ metaAsal(g.asal)?.label }}
                            </v-chip>
                          </template>
                          <template #[`item.jumlah`]="{ item: g }">{{ fmtQty(g.jumlah) }}</template>
                          <template #[`item.diterima`]="{ item: g }">{{
                            fmtQty(g.diterima)
                          }}</template>
                          <template #[`item.selisih`]="{ item: g }">
                            <span :class="g.selisih < 0 ? 'text-red font-weight-bold' : ''">
                              {{ g.selisih === 0 ? "0" : fmtQty(g.selisih) }}
                            </span>
                          </template>
                          <template #[`item.status`]="{ item: g }">
                            <v-chip
                              v-if="metaStatusPacking(g.status)"
                              size="x-small"
                              :color="metaStatusPacking(g.status)?.color"
                              variant="tonal"
                              class="font-weight-bold"
                            >
                              {{ metaStatusPacking(g.status)?.label }}
                            </v-chip>
                          </template>
                          <template #[`item.nomorTerima`]="{ item: g }">
                            {{ g.nomorTerima || "-" }}
                          </template>
                          <template #[`item.tglTerima`]="{ item: g }">
                            {{ fmtTgl(g.tglTerima) }}
                          </template>
                          <template #[`item.aksi`]="{ item: g }">
                            <v-btn
                              size="x-small"
                              variant="tonal"
                              class="btn-header-action"
                              @click="panelPacking[item.nomor] = g.packing"
                              >Detail</v-btn
                            >
                          </template>
                          <template #bottom></template>
                        </v-data-table>

                        <div v-if="activeGroup(item.nomor)" class="detail-panel">
                          <div class="d-flex align-center mb-2">
                            <div class="font-weight-bold">
                              Rincian Packing
                              {{ activeGroup(item.nomor)?.packing || "(tanpa packing)" }}
                            </div>
                            <v-spacer />
                            <v-btn
                              icon="mdi-close"
                              size="x-small"
                              variant="text"
                              @click="panelPacking[item.nomor] = undefined"
                            />
                          </div>
                          <div class="panel-meta mb-2">
                            <div>SPK: {{ activeGroup(item.nomor)?.spk }}</div>
                            <div>Asal: {{ activeGroup(item.nomor)?.gudang }}</div>
                            <div>No. Terima: {{ activeGroup(item.nomor)?.nomorTerima || "-" }}</div>
                            <div>Tgl Terima: {{ fmtTgl(activeGroup(item.nomor)?.tglTerima) }}</div>
                          </div>
                          <v-data-table
                            :headers="itemHeaders"
                            :items="activeGroup(item.nomor)?.items ?? []"
                            density="compact"
                            class="detail-table"
                            :items-per-page="-1"
                            hide-default-footer
                          >
                            <template #[`item.jumlah`]="{ item: r }">{{
                              fmtQty(r.jumlah)
                            }}</template>
                            <template #[`item.diterima`]="{ item: r }">{{
                              fmtQty(r.diterima)
                            }}</template>
                            <template #[`item.selisih`]="{ item: r }">
                              <span :class="r.selisih < 0 ? 'text-red font-weight-bold' : ''">
                                {{ fmtQty(r.selisih) }}
                              </span>
                            </template>
                            <template #bottom></template>
                          </v-data-table>
                          <div class="panel-total">
                            <div class="font-weight-bold mb-1">Perbandingan Penerimaan</div>
                            <div class="d-flex justify-space-between">
                              <span>Total STBJ</span>
                              <span>{{ fmtQty(activeGroup(item.nomor)?.jumlah) }} pcs</span>
                            </div>
                            <div class="d-flex justify-space-between">
                              <span>Diterima DC</span>
                              <span>{{ fmtQty(activeGroup(item.nomor)?.diterima) }} pcs</span>
                            </div>
                            <div class="d-flex justify-space-between font-weight-bold">
                              <span>Selisih</span>
                              <span
                                :class="
                                  (activeGroup(item.nomor)?.selisih ?? 0) < 0 ? 'text-red' : ''
                                "
                              >
                                {{ fmtQty(activeGroup(item.nomor)?.selisih) }} pcs
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>

                    <div v-else class="text-center text-caption pa-4">
                      Tidak ada data detail untuk STBJ ini.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text class="pt-4"> <span v-html="dialogConfirm.text"></span> </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            variant="flat"
            class="btn-primary-red"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">Custom Filter</v-card-title>
        <v-card-text class="pt-4">
          <v-select
            v-model="customFilter.operator"
            :items="['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts', 'ends']"
            density="compact"
            variant="outlined"
            hide-details
            class="form-field mb-3"
          />
          <v-text-field
            v-model="customFilter.value"
            density="compact"
            variant="outlined"
            hide-details
            autofocus
            placeholder="Value..."
            class="form-field"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="customFilterDialog = false">Batal</v-btn>
          <v-btn variant="flat" class="btn-primary-red" @click="applyCustomFilter">Terapkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* --- Layout Full Height + tema merah lokal (DESIGN.md 10.3) --- */
.browse-content {
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;

  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

/* ══════════ TOMBOL ══════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover {
  filter: brightness(1.08);
}
.btn-primary-red:disabled {
  opacity: 0.4;
}
.btn-header-action {
  background-color: rgba(183, 28, 28, 0.08) !important;
  color: #b71c1c !important;
  font-weight: 700;
  border: 1px solid rgba(183, 28, 28, 0.2);
}
.btn-header-action:hover:not(:disabled) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.btn-header-action:disabled {
  opacity: 0.4;
}
.btn-primary-red:focus-visible,
.btn-header-action:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}
.btn-refresh {
  color: #b71c1c !important;
}

/* ══════════ FILTER ══════════ */
.filter-section {
  flex-shrink: 0;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: rgba(183, 28, 28, 0.03);
  border-bottom: 2px solid rgba(183, 28, 28, 0.15);
}
.filter-label {
  font-size: 12px;
  font-weight: 600;
  color: #b71c1c;
}
.filter-sep {
  font-size: 11px;
  font-weight: 600;
  color: #b71c1c;
}

.filter-section .periode-field {
  flex: none;
  width: 150px;
}

.filter-section :deep(.v-field) {
  --v-field-border-radius: 8px;
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  box-shadow: none !important;
}
.filter-section :deep(.v-field__outline) {
  color: #b71c1c;
  --v-field-border-opacity: 0.3;
}
.filter-section :deep(.v-field--focused) {
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.filter-section :deep(.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 1;
}

/* --- Field Gudang (readonly): abu tanpa aksen merah, override width global --- */
.field-gudang {
  flex-shrink: 0 !important;
  width: 120px !important;
}
.field-gudang :deep(.v-input__control),
.field-gudang :deep(.v-field) {
  width: 100% !important;
  min-width: 120px !important;
}
.field-gudang-nama {
  flex-shrink: 0 !important;
  width: 300px !important;
}
.field-gudang-nama :deep(.v-input__control),
.field-gudang-nama :deep(.v-field) {
  width: 100% !important;
  min-width: 300px !important;
}
.filter-section .field-gudang :deep(.v-field),
.filter-section .field-gudang-nama :deep(.v-field) {
  background-color: rgba(var(--v-theme-on-surface), 0.05) !important;
}
.filter-section .field-gudang :deep(.v-field__outline),
.filter-section .field-gudang-nama :deep(.v-field__outline) {
  color: rgb(var(--v-theme-on-surface));
  --v-field-border-opacity: 0.2;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ══════════ TAB ASAL ══════════ */
.browse-tabs {
  flex-shrink: 0;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
}
.browse-tabs :deep(.v-tab) {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}

/* ══════════ TABEL ══════════ */
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

/* Selector berspesifisitas tinggi agar mengalahkan style global AppDataTable */
.desktop-table :deep(thead tr th.resizable-header) {
  position: relative;
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #8e0000 !important;
  padding: 0 8px !important;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}
.desktop-table :deep(thead tr th.resizable-header *),
.desktop-table :deep(thead tr th.resizable-header .v-icon) {
  color: #ffffff !important;
}
/* Kolom yang sedang difilter: ikon kuning supaya terbaca di atas header merah */
.desktop-table :deep(thead tr th.resizable-header .v-icon.filter-active) {
  color: #ffd54f !important;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  border-right: 2px solid rgba(255, 255, 255, 0.6);
}

/* Tint baris memakai background-image (bukan background-color) karena kolom
   expand/nomor bersifat sticky: latar opaque bawaan harus tetap ada. */
.desktop-table :deep(tbody tr:nth-child(even) > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.03), rgba(183, 28, 28, 0.03));
}
.desktop-table :deep(tbody tr:hover > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.08), rgba(183, 28, 28, 0.08));
}

.rotate-180 {
  transform: rotate(180deg);
  transition: transform 0.2s;
}

.persen-text {
  font-size: 10px;
  font-weight: 700;
  color: #000;
}

/* ══════════ DETAIL (EXPAND) ══════════ */
.detail-container {
  position: sticky;
  left: 0;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: flex-start;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 1500px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-left: 3px solid #b71c1c;
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 32px !important;
}
.detail-table :deep(tbody tr > td) {
  background-image: none !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
}

.detail-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 8px 0;
}

.detail-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 8px;
}
.detail-body > .detail-table {
  flex: 1 1 0;
  min-width: 0;
}

.detail-panel {
  flex: 0 0 400px;
  border: 1px solid rgba(183, 28, 28, 0.25);
  border-radius: 6px;
  padding: 10px;
  font-size: 11px;
}
.panel-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 8px;
}
.panel-total {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(183, 28, 28, 0.35);
}

/* ══════════ FOOTER PAGING (milik AppDataTable) ══════════ */
.desktop-table :deep(.custom-pagination-footer) {
  border-top: 2px solid rgba(183, 28, 28, 0.15);
  background-color: rgba(183, 28, 28, 0.03);
}
.desktop-table :deep(.items-per-page-select .v-field) {
  border-radius: 8px;
  background-color: rgba(183, 28, 28, 0.05);
}
.desktop-table :deep(.items-per-page-select .v-field__outline) {
  color: rgba(183, 28, 28, 0.25) !important;
}
.desktop-table :deep(.pagination-text) {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.desktop-table :deep(.custom-pagination-footer .v-pagination__item),
.desktop-table :deep(.custom-pagination-footer .v-pagination__prev),
.desktop-table :deep(.custom-pagination-footer .v-pagination__next) {
  background-color: rgba(183, 28, 28, 0.06) !important;
  border: none !important;
}
.desktop-table :deep(.custom-pagination-footer .v-pagination__item .v-btn),
.desktop-table :deep(.custom-pagination-footer .v-pagination__prev .v-btn),
.desktop-table :deep(.custom-pagination-footer .v-pagination__next .v-btn) {
  color: #b71c1c !important;
}
.desktop-table :deep(.custom-pagination-footer .v-pagination__item--is-active),
.desktop-table :deep(.custom-pagination-footer .v-pagination__item--is-active .v-btn) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
}

/* ══════════ DIALOG ══════════ */
.dialog-card {
  border-radius: 12px;
  overflow: hidden;
}
.confirm-title {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}
.form-field :deep(.v-field) {
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}
.form-field :deep(.v-field__outline) {
  display: none !important;
}
.form-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}
</style>

<style>
/* Menu dropdown di-teleport ke luar halaman, jadi tidak bisa memakai scoped */
.filter-menu {
  max-height: 300px;
  overflow-y: auto;
}
.filter-menu .v-list-item--active {
  background-color: rgba(183, 28, 28, 0.1) !important;
  color: #b71c1c !important;
}
.filter-menu .v-list-item:hover {
  background-color: rgba(183, 28, 28, 0.06) !important;
}
.filter-menu .custom-filter-item {
  color: #b71c1c;
  font-weight: 600;
}
</style>

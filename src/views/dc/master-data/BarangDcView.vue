<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import type { AxiosError } from "axios";
import PageLayout from "@/components/PageLayout.vue";
import type { Borders, Row, Workbook } from "exceljs";
import AppDataTable from "@/components/AppDataTable.vue";

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

interface MasterItem {
  kode: string;
  nama: string;
  kategori: string;
  subKategori: string;
  newArrival: "NEW" | "";
  newUntil: string | null;
  date_create: string;
  otomatis: string;
  adaStok: "Y" | "N";
  status: "AKTIF" | "PASIF";
  [key: string]: unknown;
}

interface DetailItem {
  ukuran: string;
  barcode: string;
  hargaJual: number;
  tglSpk: string | null;
  tglProduksi: string | null;
  minBufferStore: number;
  maxBufferStore: number;
  minBufferDC: number;
  maxBufferDC: number;
  hpp?: number;
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

interface BarangExportHeader {
  Kode: string;
  "Nama Barang": string;
  Kategori: string;
  SubKategori: string;
  NewArrival: string;
  DateCreate?: string | Date;
  Otomatis: string;
  AdaStok: string;
  Status: string;
  [key: string]: unknown;
}

interface BarangExportDetail {
  "Kode Barang": string;
  "Nama Barang": string;
  [key: string]: unknown;
}

// --- Export Excel (ExcelJS, format sama dengan SoView) ---
interface ColDef {
  header: string;
  key: string;
  width: number;
  align: "left" | "center" | "right";
  fmt?: string;
}

const borderThin: Partial<Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const borderMedium: Partial<Borders> = {
  top: { style: "medium" },
  left: { style: "thin" },
  bottom: { style: "medium" },
  right: { style: "thin" },
};

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "204";

// --- State ---
const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const fetchTimeout = ref<number | undefined>(undefined);

// --- Setup Session Storage ---
const STORAGE_KEY = "masterBarangFilters";
const savedSession = sessionStorage.getItem(STORAGE_KEY);
const parsedSession = savedSession ? JSON.parse(savedSession) : null;

// --- State ---
const filters = reactive({
  startDate: parsedSession?.startDate ?? format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: parsedSession?.endDate ?? format(new Date(), "yyyy-MM-dd"),
  hargaNol: parsedSession?.hargaNol ?? false,
  hppNol: parsedSession?.hppNol ?? false,
  search: parsedSession?.search ?? "",
});

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>(parsedSession?.columnFilters ?? {});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: "", operator: "=", value: "" });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Header Definisi ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Kode", key: "kode", width: 150, fixed: true },
  { title: "Nama Barang", key: "nama", width: 250, fixed: true },
  { title: "Kategori", key: "kategori", width: 120 },
  { title: "Sub Kategori", key: "subKategori", width: 140 },
  { title: "Tgl Buat", key: "date_create", width: 110 },
  { title: "Otomatis", key: "otomatis", align: "center", width: 100 },
  { title: "Log Stok", key: "adaStok", align: "center", width: 100 },
  { title: "Status", key: "status", align: "center", width: 100 },
]);

const detailHeaders = computed<DataTableHeader[]>(() => {
  const baseHeaders: DataTableHeader[] = [
    { title: "Ukuran", key: "ukuran", width: 80 },
    { title: "Barcode", key: "barcode", width: 120 },
    { title: "Harga Jual", key: "hargaJual", align: "end", width: 100 },
    { title: "Tgl SPK", key: "tglSpk", width: 110 },
    { title: "Tgl Produksi", key: "tglProduksi", width: 110 },
    { title: "Min Store", key: "minBufferStore", align: "end", width: 80 },
    { title: "Max Store", key: "maxBufferStore", align: "end", width: 80 },
    { title: "Min DC", key: "minBufferDC", align: "end", width: 80 },
    { title: "Max DC", key: "maxBufferDC", align: "end", width: 80 },
  ];

  if (authStore.user?.cabang === "KDC") {
    baseHeaders.splice(2, 0, { title: "HPP", key: "hpp", align: "end", width: 100 });
  }

  return baseHeaders;
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));

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

// --- Helper ---
const getErrorMessage = (err: unknown, fallback: string) => {
  const error = err as AxiosError<{ message?: string }>;
  return error.response?.data?.message || error.message || fallback;
};

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
  if (["date_create"].includes(key)) {
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
  filters.startDate = format(subDays(new Date(), 30), "yyyy-MM-dd");
  filters.endDate = format(new Date(), "yyyy-MM-dd");
  filters.hargaNol = false;
  filters.hppNol = false;
  filters.search = "";
  sessionStorage.removeItem(STORAGE_KEY);
  // Opsional: otomatis fetch data setelah filter direset
  fetchMasterData();
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

// --- Methods: Data ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/barang-dc", { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    const msg = err.response?.data?.message || err.message || "Gagal mengambil data.";
    toast.error(msg);
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.kode] && !loadingDetails.value.has(item.kode)
  );
  if (!itemToLoad) return;
  const kodeToLoad = itemToLoad.kode;

  loadingDetails.value.add(kodeToLoad);
  try {
    const response = await api.get(`/barang-dc/details/${encodeURIComponent(kodeToLoad)}`);
    details.value[kodeToLoad] = response.data;
  } catch (err) {
    toast.error(getErrorMessage(err, `Gagal memuat detail untuk ${kodeToLoad}`));
  } finally {
    loadingDetails.value.delete(kodeToLoad);
  }
};

const handleNew = () => {
  router.push({ name: "BarangDcCreate" });
};

const handleEdit = () => {
  if (!isSingleSelected.value) return;
  router.push({ name: "BarangDcEdit", params: { kode: selectedRow.value?.kode } });
};

const getRowTextColor = (item: MasterItem) => {
  if (item.status === "PASIF") return "text-red font-weight-medium";
  if (item.adaStok === "N") return "text-blue font-weight-medium";
  return "";
};

const styleHeaderRow = (row: Row) => {
  row.height = 22;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: "FF0D47A1" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderThin;
  });
};

const formatTgl = (v: unknown) => {
  if (!v) return "-";
  try {
    return format(parseISO(String(v)), "dd/MM/yyyy");
  } catch {
    return "-";
  }
};

const downloadWorkbook = async (workbook: Workbook, fileName: string) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

// === EXPORT HEADER ===
const exportHeaderData = async () => {
  toast.info("Mengambil data header dari server...");
  try {
    const response = await api.get<BarangExportHeader[]>("/barang-dc/export-headers", {
      params: filters,
    });
    if (!response.data?.length) return toast.warning("Tidak ada data header.");

    toast.info("Membuat file Excel Header...");

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Barang DC Header");

    const cols: ColDef[] = [
      { header: "Kode", key: "Kode", width: 22, align: "left" },
      { header: "Nama Barang", key: "Nama Barang", width: 50, align: "left" },
      { header: "Kategori", key: "Kategori", width: 16, align: "left" },
      { header: "Sub Kategori", key: "SubKategori", width: 18, align: "left" },
      { header: "Tgl Buat", key: "DateCreate", width: 13, align: "center" },
      { header: "Otomatis", key: "Otomatis", width: 10, align: "center" },
      { header: "Log Stok", key: "AdaStok", width: 10, align: "center" },
      { header: "Status", key: "Status", width: 12, align: "center" },
      { header: "New Arrival s/d", key: "NewArrival", width: 16, align: "center" },
    ];

    sheet.columns = cols.map((c) => ({ width: c.width }));
    styleHeaderRow(sheet.addRow(cols.map((c) => c.header)));

    // Warna baris sama dengan grid: PASIF = merah, tanpa log stok = biru
    const getRowBg = (item: BarangExportHeader): string | undefined => {
      if (item.Status === "PASIF") return "FFFFEBEE";
      if (item.AdaStok === "N") return "FFE3F2FD";
      return undefined;
    };

    response.data.forEach((item) => {
      const rowBg = getRowBg(item);
      const values = cols.map((c) =>
        c.key === "DateCreate"
          ? formatTgl(item.DateCreate)
          : (item[c.key] as string | number | undefined) ?? ""
      );

      const row = sheet.addRow(values);
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const col = cols[colNum - 1];
        cell.border = borderThin;
        cell.alignment = { horizontal: col?.align ?? "left", vertical: "middle" };
        if (rowBg) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        }
        if (col?.key === "Status") {
          cell.font = {
            bold: true,
            color: { argb: item.Status === "PASIF" ? "FFC62828" : "FF2E7D32" },
          };
        }
        if (col?.key === "AdaStok" && item.AdaStok === "N") {
          cell.font = { bold: true, color: { argb: "FF1565C0" } };
        }
      });
    });

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    await downloadWorkbook(
      workbook,
      `Export_BarangDC_Header_${filters.startDate}_${filters.endDate}.xlsx`
    );
    toast.success("File Header berhasil diekspor.");
  } catch (err) {
    console.error(err);
    toast.error(getErrorMessage(err, "Gagal mengekspor data header."));
  }
};

// === EXPORT DETAIL ===
const exportDetailData = async () => {
  toast.info("Mengambil data detail dari server...");
  try {
    const response = await api.get<BarangExportDetail[]>("/barang-dc/export-details", {
      params: filters,
    });
    if (!response.data?.length) return toast.warning("Tidak ada data detail.");

    toast.info("Membuat file Excel Detail...");

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

    type DetailRow = Record<string, string | number | null | undefined>;
    const data = response.data as DetailRow[];

    // ── Sheet 1: Detail per ukuran ─────────────────────
    const sheet1 = workbook.addWorksheet("Barang DC Detail");

    const cols: ColDef[] = [
      { header: "Kode Barang", key: "Kode Barang", width: 22, align: "left" },
      { header: "Nama Barang", key: "Nama Barang", width: 50, align: "left" },
      { header: "Ukuran", key: "Ukuran", width: 10, align: "center" },
      { header: "Barcode", key: "Barcode", width: 20, align: "left" },
      { header: "HPP", key: "HPP", width: 14, align: "right", fmt: "#,##0" },
      { header: "Harga Jual", key: "Harga Jual", width: 14, align: "right", fmt: "#,##0" },
      { header: "Status", key: "Status", width: 12, align: "center" },
    ];
    // Kolom identitas hanya tampil di baris pertama tiap kode barang
    const identityKeys = new Set(["Kode Barang", "Nama Barang", "Status"]);

    sheet1.columns = cols.map((c) => ({ width: c.width }));
    styleHeaderRow(sheet1.addRow(cols.map((c) => c.header)));

    const kodeColors: Record<string, string> = {};
    let toggle = false;
    let prevKode = "";

    data.forEach((row) => {
      const kode = String(row["Kode Barang"] ?? "");
      if (!(kode in kodeColors)) {
        kodeColors[kode] = toggle ? "FFF3F8FD" : "FFFAFAFA";
        toggle = !toggle;
      }
      const isNewKode = kode !== prevKode;
      prevKode = kode;

      const values = cols.map((c) => {
        if (identityKeys.has(c.key) && !isNewKode) return "";
        const v = row[c.key];
        // Barcode dipaksa string supaya tidak berubah jadi notasi ilmiah
        if (c.key === "Barcode") return v == null ? "" : String(v);
        return v ?? "";
      });

      const dataRow = sheet1.addRow(values);
      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const col = cols[colNum - 1];
        cell.border = {
          left: { style: "thin" },
          right: { style: "thin" },
          bottom: { style: "thin" },
          top: isNewKode ? { style: "medium" } : { style: "thin" },
        };
        cell.alignment = { horizontal: col?.align ?? "left", vertical: "middle" };
        if (col?.fmt) cell.numFmt = col.fmt;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: kodeColors[kode] } };
      });
    });

    // ── Sheet 2: Ringkasan per Kode Barang ─────────────
    const sheet2 = workbook.addWorksheet("Ringkasan per Kode");

    const sumCols: ColDef[] = [
      { header: "Kode Barang", key: "kode", width: 22, align: "left" },
      { header: "Nama Barang", key: "nama", width: 50, align: "left" },
      { header: "Total Ukuran", key: "total", width: 14, align: "right", fmt: "#,##0" },
      { header: "Status", key: "status", width: 12, align: "center" },
    ];

    sheet2.columns = sumCols.map((c) => ({ width: c.width }));
    styleHeaderRow(sheet2.addRow(sumCols.map((c) => c.header)));

    const grouped = new Map<string, { first: DetailRow; total: number }>();
    data.forEach((row) => {
      const kode = String(row["Kode Barang"] ?? "");
      const grp = grouped.get(kode);
      if (grp) grp.total += 1;
      else grouped.set(kode, { first: row, total: 1 });
    });

    let grandUkuran = 0;
    grouped.forEach((grp, kode) => {
      grandUkuran += grp.total;
      const row = sheet2.addRow([
        kode,
        grp.first["Nama Barang"] ?? "",
        grp.total,
        grp.first["Status"] ?? "",
      ]);
      row.eachCell({ includeEmpty: true }, (cell, i) => {
        cell.border = borderThin;
        cell.alignment = { horizontal: sumCols[i - 1]?.align ?? "left", vertical: "middle" };
        if (sumCols[i - 1]?.fmt) cell.numFmt = sumCols[i - 1].fmt!;
      });
    });

    // Grand total
    const totalRowNum = sheet2.rowCount + 1;
    const gtRow = sheet2.addRow(["GRAND TOTAL :", "", grandUkuran, `${grouped.size} barang`]);
    sheet2.mergeCells(`A${totalRowNum}:B${totalRowNum}`);
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

    await downloadWorkbook(
      workbook,
      `Export_BarangDC_Detail_${filters.startDate}_${filters.endDate}.xlsx`
    );
    toast.success("File Detail berhasil diekspor (2 sheet).");
  } catch (err) {
    console.error(err);
    toast.error(getErrorMessage(err, "Gagal mengekspor data detail."));
  }
};

// Dispatcher supaya template tidak perlu diubah
const exportData = (type: "header" | "detail") =>
  type === "header" ? exportHeaderData() : exportDetailData();

onMounted(fetchMasterData);
watch(
  filters,
  (newVal, oldVal) => {
    // Jika yang berubah adalah field 'search', gunakan timeout 500ms
    if (newVal.search !== oldVal.search) {
      if (fetchTimeout.value) clearTimeout(fetchTimeout.value);
      fetchTimeout.value = window.setTimeout(() => {
        fetchMasterData();
      }, 500);
    } else {
      // Untuk filter lain (tanggal/checkbox), langsung fetch tanpa jeda
      fetchMasterData();
    }
  },
  { deep: true }
);

// --- Watcher untuk Simpan Filter ke Session Storage ---
watch(
  [filters, columnFilters],
  () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        startDate: filters.startDate,
        endDate: filters.endDate,
        hargaNol: filters.hargaNol,
        hppNol: filters.hppNol,
        search: filters.search,
        columnFilters: columnFilters.value,
      })
    );
  },
  { deep: true }
);
</script>

<template>
  <PageLayout title="Browse Barang DC" icon="mdi-package-variant-closed">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-plus"
        @click="handleNew"
      >
        Baru
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-pencil"
        :disabled="!isSingleSelected"
        @click="handleEdit"
      >
        Ubah
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn
            size="small"
            variant="tonal"
            class="btn-header-action"
            prepend-icon="mdi-file-excel"
            v-bind="props"
          >
            Export
          </v-btn>
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
        <span class="filter-label">Tgl Buat:</span>
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

        <v-checkbox
          v-model="filters.hargaNol"
          label="Harga Nol Saja"
          color="primary"
          hide-details
          density="compact"
          class="ms-4"
        />
        <v-checkbox
          v-model="filters.hppNol"
          label="HPP Nol Saja"
          color="primary"
          hide-details
          density="compact"
          class="ms-2"
        />
        <v-text-field
          v-model="filters.search"
          label="Cari Kode atau Nama Barang..."
          density="compact"
          hide-details
          variant="outlined"
          class="search-field"
          prepend-inner-icon="mdi-magnify"
          clearable
        />

        <v-spacer />

        <div class="d-flex align-center ga-2 text-caption me-4">
          <div><v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Pasif</div>
          <div>
            <v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> Tidak Ada Stok
          </div>
        </div>

        <v-btn
          prepend-icon="mdi-filter-off"
          variant="tonal"
          color="error"
          class="btn-detail reset-filter-btn"
          @click="resetAllFilters"
        >
          Reset Filter
        </v-btn>

        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="loading"
          class="btn-refresh ms-2"
          @click="fetchMasterData"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="filteredList"
          :loading="loading"
          :item-class="getRowTextColor"
          item-value="kode"
          density="compact"
          class="desktop-table header-browse-blue"
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

                    <v-menu location="bottom start" :close-on-content-click="false" class="kr-red">
                      <template #activator="{ props }">
                        <v-icon
                          v-bind="props"
                          size="16"
                          class="ms-1"
                          :class="{ 'filter-active': isFilterActive(header.key) }"
                          :icon="
                            filterType(header.key) === 'custom'
                              ? 'mdi-filter-cog'
                              : filterType(header.key) === 'multi'
                              ? 'mdi-filter-multiple'
                              : 'mdi-filter-variant'
                          "
                          @click.stop
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
                              :model-value="columnFilters[header.key]?.values?.includes(val)"
                              color="#b71c1c"
                              density="compact"
                            />
                          </template>
                          <v-list-item-title>{{
                            formatFilterValue(header.key, val)
                          }}</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click="openCustomFilter(header.key)">
                          <v-list-item-title class="text-caption text-primary"
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

          <template #[`item.kode`]="{ item }">
            <span :class="getRowTextColor(item)">{{ item.kode }}</span>
          </template>

          <template #[`item.nama`]="{ item }">
            <span :class="getRowTextColor(item)">{{ item.nama }}</span>
            <v-chip
              v-if="item.newArrival"
              size="x-small"
              variant="flat"
              class="chip-new ms-2"
              :title="`New arrival s/d ${formatTgl(item.newUntil)}`"
            >
              NEW
            </v-chip>
          </template>

          <template #[`item.date_create`]="{ item }">
            {{ item.date_create ? format(parseISO(item.date_create as string), "dd/MM/yyyy") : "" }}
          </template>

          <template #[`item.status`]="{ item }">
            <v-chip
              :color="item.status === 'AKTIF' ? 'success' : 'error'"
              size="x-small"
              variant="tonal"
            >
              {{ item.status }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.kode)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>
                    <v-data-table
                      v-else-if="details[item.kode] && details[item.kode].length > 0"
                      :headers="detailHeaders"
                      :items="details[item.kode]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.tglSpk`]="{ item: detail }">
                        {{ detail.tglSpk ? format(parseISO(detail.tglSpk), "dd/MM/yyyy") : "" }}
                      </template>
                      <template #[`item.tglProduksi`]="{ item: detail }">
                        {{
                          detail.tglProduksi
                            ? format(parseISO(detail.tglProduksi), "dd/MM/yyyy")
                            : ""
                        }}
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-2">Tidak ada data detail.</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold">Custom Filter</v-card-title>
        <v-card-text>
          <v-select
            v-model="customFilter.operator"
            :items="['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts', 'ends']"
            density="compact"
            hide-details
            class="mb-2"
          />
          <v-text-field
            v-model="customFilter.value"
            density="compact"
            hide-details
            autofocus
            placeholder="Value..."
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Batal</v-btn>
          <v-btn variant="flat" class="btn-primary-red" @click="applyCustomFilter">Terapkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Layout full height + tema merah lokal (DESIGN.md 10.3) */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;

  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
}

/* ══════════ TOMBOL HEADER ══════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover {
  filter: brightness(1.08);
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

.filter-label,
.filter-sep {
  font-size: 12px;
  font-weight: 600;
  color: #b71c1c;
}
.filter-sep {
  font-size: 11px;
}

.filter-section .periode-field {
  flex: none;
  width: 150px;
}
.filter-section .search-field {
  flex: none;
  width: 300px;
  margin-left: 16px;
}

.filter-section .periode-field :deep(.v-field),
.filter-section .search-field :deep(.v-field) {
  width: 100%;
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}
.filter-section .periode-field :deep(.v-field__outline),
.filter-section .search-field :deep(.v-field__outline) {
  display: none !important;
}
.filter-section .periode-field :deep(.v-field--focused),
.filter-section .search-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.filter-section .search-field :deep(.v-field__prepend-inner .v-icon) {
  color: #b71c1c !important;
  opacity: 0.8 !important;
}

.btn-refresh {
  color: #b71c1c !important;
}

.reset-filter-btn {
  height: 40px !important;
  min-width: 120px !important;
  padding: 0 16px !important;
  font-size: 0.875rem !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  font-weight: 500 !important;
  border-radius: 4px !important;

  color: #d32f2f !important;
  background-color: rgba(211, 47, 47, 0.15) !important;
}
.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}

/* ══════════ TABEL ══════════ */
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
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

.desktop-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  white-space: nowrap;
  border-bottom: 2px solid #8e0000 !important;
}

.desktop-table :deep(thead tr th .v-icon),
.desktop-table :deep(thead tr th .v-data-table-header__sort-icon) {
  color: #ffffff !important;
}
/* Ikon filter kolom yang sedang aktif */
.desktop-table :deep(thead tr th .v-icon.filter-active) {
  color: #ffeb3b !important;
}

.desktop-table :deep(td) {
  font-size: 11px !important;
  padding: 0 8px !important;
  height: 36px !important;
  white-space: nowrap;
  cursor: pointer;
}

.desktop-table :deep(tbody tr:nth-child(even) > td) {
  background-color: rgba(183, 28, 28, 0.025);
}
.desktop-table :deep(tbody tr:hover > td) {
  background-color: rgba(183, 28, 28, 0.07);
}

/* Baris terpilih */
.desktop-table :deep(tr.v-data-table__selected > td),
.desktop-table :deep(tr.v-data-table__tr--selected > td) {
  background-color: rgba(183, 28, 28, 0.12) !important;
}

/* Header kustom (resize kolom + filter) */
.resizable-header {
  position: relative;
  padding: 0 8px !important;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
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

.filter-menu {
  max-height: 300px;
  overflow-y: auto;
}

/* ══════════ DETAIL (EXPAND) ══════════ */
.detail-container {
  position: sticky;
  left: 0;
  background-color: rgba(183, 28, 28, 0.02);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: flex-start;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  background-color: rgb(var(--v-theme-surface));
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
</style>

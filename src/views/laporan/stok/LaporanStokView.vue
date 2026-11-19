<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import MasterProductSearchModal from "@/components/lookup/MasterProductSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import AppDataTable from "@/components/AppDataTable.vue";
import type ExcelJS from "exceljs";
import axios from "axios";

interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
  class?: string;
}

interface StokItem {
  KODE: string;
  NAMA: string;
  TOTAL: number;
  Buffer: number;
  [key: string]: string | number;
}

interface Gudang {
  kode: string;
  nama: string;
}

interface RawStockRow {
  KODE: string;
  KATEGORI?: string;
  BARCODE?: string;
  NAMA?: string;
  HPP?: number | string;
  BUFFER?: number | string;
  BUFFER_MIN?: number | string;
  BUFFER_MAX?: number | string;
  UKURAN?: string;
  TOTAL?: number | string;
  PL_QTY?: number | string;
  TOTAL2?: number | string;
  PESANAN_READY?: number | string;
  PESANAN_BOOKED?: number | string;
}

interface PivotItem {
  Kategori: string;
  Kode: string;
  Barcode: string;
  Nama: string;
  HPP: number;
  Total: number;
  PL: number;
  Tersedia: number;
  PesananReady: number;
  PesananBooked: number;
  Buffer: number;
  [size: string]: string | number;
}

interface BookedDetailItem {
  soNomor: string;
  tanggal: string;
  customer: string;
  ukuran: string;
  qty: number;
}

interface PlDetailItem {
  plNomor: string;
  tanggal: string;
  tujuan: string;
  ukuran: string;
  qty: number;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "501";

// ─── State ────────────────────────────────────────────────────────────────────
const stokList = ref<StokItem[]>([]);
const isLoading = ref(true);
const filters = reactive({
  gudang: authStore.user?.cabang || "",
  kodeBarang: "",
  namaBarang: "",
  keyword: "",
  jenisStok: "semua",
  tampilkanKosong: false,
  tanggal: format(new Date(), "yyyy-MM-dd"),
});
const gudangList = ref<Gudang[]>([]);
const isProductSearchVisible = ref(false);
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const isBsTab = computed(
  () => filters.jenisStok === "bs_cetak" || filters.jenisStok === "bs_produksi"
);
const showBookedDetail = ref(false);
const bookedDetailList = ref<BookedDetailItem[]>([]);
const isLoadingBookedDetail = ref(false);
const bookedDetailKode = ref("");
const bookedDetailNama = ref("");
const showReadyDetail = ref(false);
const readyDetailList = ref<BookedDetailItem[]>([]);
const isLoadingReadyDetail = ref(false);
const readyDetailKode = ref("");
const readyDetailNama = ref("");
const showPlDetail = ref(false);
const plDetailList = ref<PlDetailItem[]>([]);
const isLoadingPlDetail = ref(false);
const plDetailKode = ref("");
const plDetailNama = ref("");

// ─── Headers ──────────────────────────────────────────────────────────────────
const headers = ref<DataTableHeader[]>([]);

// ─── Column Resize ────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sortSizes = (a: string, b: string) => {
  const order = [
    "XXXS",
    "XXS",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "2XL",
    "3XL",
    "4XL",
    "5XL",
    "6XL",
    "7XL",
    "ALLSIZE",
  ];
  const ia = order.indexOf(a.toUpperCase());
  const ib = order.indexOf(b.toUpperCase());
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b);
};

const headerStyle = (header: DataTableHeader) =>
  header.width
    ? {
        width: header.width + "px",
        minWidth: header.width + "px",
        maxWidth: header.width + "px",
      }
    : undefined;

// ─── Debounce search ──────────────────────────────────────────────────────────
let searchTimeout: ReturnType<typeof setTimeout>;
const onSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(fetchData, 800);
};

const clearSearch = () => {
  filters.keyword = "";
  fetchData();
};

// ─── Fetch data ───────────────────────────────────────────────────────────────
// Penanda permintaan terbaru: respons lama (mis. tab Semua yang lambat) tidak
// boleh menimpa tabel tab yang sedang aktif.
let fetchSeq = 0;

const fetchData = async () => {
  const seq = ++fetchSeq;
  isLoading.value = true;
  try {
    const response = await api.get("/laporan-stok/real-time", { params: filters });
    if (seq !== fetchSeq) return;

    const isStoreViewCalc = filters.gudang !== "ALL" && filters.gudang !== "KDC" && !isBsTab.value;

    // Kolom Tersedia = Total - Pesanan Ready - Pesanan Booked
    // (dihitung di frontend dari kolom yang sudah ada).
    stokList.value = isStoreViewCalc
      ? response.data.map((item: StokItem) => ({
          ...item,
          TERSEDIA:
            Number(item.TOTAL || 0) -
            Number(item.PESANAN_READY || 0) -
            Number(item.PESANAN_BOOKED || 0),
        }))
      : response.data;

    if (stokList.value.length > 0) {
      const staticKeys = [
        "KODE",
        "KATEGORI",
        "NAMA",
        "TOTAL",
        "PL",
        "TOTAL2",
        "Buffer",
        "KTGPRODUK",
        "KTGBARANG",
        "PESANAN_READY",
        "PESANAN_BOOKED",
        "TERSEDIA",
      ];
      const dynamicKeys = Object.keys(stokList.value[0])
        .filter((k) => !staticKeys.includes(k))
        .sort(sortSizes);

      const isUserKDC = authStore.user?.cabang === "KDC";
      const isViewKDC = filters.gudang === "KDC";

      const newHeaders: DataTableHeader[] = [
        { title: "Kategori", key: "KATEGORI", width: 120 },
        { title: "Kode", key: "KODE", fixed: true, width: 150 },
        { title: "Nama Barang", key: "NAMA", fixed: true, width: 300 },
        ...dynamicKeys.map((k) => ({ title: k, key: k, width: 70 })),
        { title: "Total", key: "TOTAL", width: 100, class: "font-weight-bold bg-grey-lighten-4" },
      ];

      if (isUserKDC && isViewKDC && !isBsTab.value) {
        newHeaders.push(
          {
            title: "Qty PL",
            key: "PL",
            width: 90,
            class: "text-orange-darken-4 font-weight-bold bg-orange-lighten-5",
          },
          {
            title: "Tersedia",
            key: "TOTAL2",
            width: 130,
            class: "text-green-darken-4 font-weight-bold bg-green-lighten-5",
          }
        );
      }

      // Kolom khusus cabang store (bukan ALL, bukan KDC)
      const isStoreView = filters.gudang !== "ALL" && filters.gudang !== "KDC" && !isBsTab.value;
      if (isStoreView) {
        newHeaders.push(
          {
            title: "Pesanan Ready",
            key: "PESANAN_READY",
            width: 120,
            class: "text-blue-darken-4 font-weight-bold bg-blue-lighten-5",
          },
          {
            title: "Pesanan Booked",
            key: "PESANAN_BOOKED",
            width: 130,
            class: "text-deep-orange-darken-4 font-weight-bold bg-deep-orange-lighten-5",
          },
          {
            title: "Tersedia",
            key: "TERSEDIA",
            width: 110,
            class: "text-green-darken-4 font-weight-bold bg-green-lighten-5",
          }
        );
      }

      if (!isBsTab.value) newHeaders.push({ title: "Buffer", key: "Buffer", width: 100 });
      headers.value = newHeaders;
    } else {
      headers.value = [
        { title: "Kode", key: "KODE" },
        { title: "Nama Barang", key: "NAMA" },
        { title: "Total", key: "TOTAL" },
      ];
    }
  } catch (error) {
    if (seq !== fetchSeq) return;
    toast.error("Gagal memuat data stok.");
    console.error(error);
  } finally {
    if (seq === fetchSeq) isLoading.value = false;
  }
};

const openBookedDetail = async (item: StokItem) => {
  bookedDetailKode.value = String(item.KODE);
  bookedDetailNama.value = String(item.NAMA);
  showBookedDetail.value = true;
  isLoadingBookedDetail.value = true;
  bookedDetailList.value = [];
  try {
    const response = await api.get("/laporan-stok/pesanan-booked-detail", {
      params: { kode: item.KODE, cabang: filters.gudang },
    });
    bookedDetailList.value = response.data;
  } catch (error) {
    toast.error("Gagal memuat detail pesanan booked.");
    console.error(error);
  } finally {
    isLoadingBookedDetail.value = false;
  }
};

const openReadyDetail = async (item: StokItem) => {
  readyDetailKode.value = String(item.KODE);
  readyDetailNama.value = String(item.NAMA);
  showReadyDetail.value = true;
  isLoadingReadyDetail.value = true;
  readyDetailList.value = [];
  try {
    const response = await api.get("/laporan-stok/pesanan-ready-detail", {
      params: { kode: item.KODE, cabang: filters.gudang },
    });
    readyDetailList.value = response.data;
  } catch (error) {
    toast.error("Gagal memuat detail pesanan ready.");
    console.error(error);
  } finally {
    isLoadingReadyDetail.value = false;
  }
};

const openPlDetail = async (item: StokItem) => {
  plDetailKode.value = String(item.KODE);
  plDetailNama.value = String(item.NAMA);
  showPlDetail.value = true;
  isLoadingPlDetail.value = true;
  plDetailList.value = [];
  try {
    const response = await api.get("/laporan-stok/packing-list-detail", {
      params: { kode: item.KODE },
    });
    plDetailList.value = response.data;
  } catch (error) {
    toast.error("Gagal memuat detail packing list.");
    console.error(error);
  } finally {
    isLoadingPlDetail.value = false;
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────
const exportToExcel = async (tipe: "horizontal" | "vertical") => {
  isLoading.value = true;
  toast.info(`Menyiapkan data export ${tipe}...`);
  try {
    const response = await api.get("/laporan-stok/real-time/export", { params: filters });
    const rawData = response.data;
    if (!rawData?.length) {
      toast.warning("Tidak ada data untuk diekspor.");
      return;
    }

    const { default: ExcelLib } = await import("exceljs");
    const isKDC = authStore.user?.cabang === "KDC" && filters.gudang === "KDC" && !isBsTab.value;
    const workbook = new ExcelLib.Workbook();

    // ── Helper styles ──────────────────────────────────────
    const applyHeaderStyle = (cell: ExcelJS.Cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFB71C1C" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    };

    const applyDataStyle = (cell: ExcelJS.Cell, isCritical = false) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      if (isCritical) {
        cell.font = { bold: true, color: { argb: "FFB26A00" } };
      }
    };

    const autoWidth = (sheet: ExcelJS.Worksheet) => {
      sheet.columns.forEach((col) => {
        if (!col?.eachCell) return;

        let maxLen = 10;

        col.eachCell({ includeEmpty: true }, (cell) => {
          const len = String(cell.value ?? "").length;
          if (len > maxLen) {
            maxLen = len;
          }
        });

        col.width = Math.min(maxLen + 3, 55);
      });
    };

    // ── HORIZONTAL ─────────────────────────────────────────
    if (tipe === "horizontal") {
      const pivotedMap = new Map<string, PivotItem>();
      const sizeSet = new Set<string>();

      rawData.forEach((row: RawStockRow) => {
        const key = row.KODE;
        if (!pivotedMap.has(key)) {
          pivotedMap.set(key, {
            Kategori: row.KATEGORI || "",
            Kode: row.KODE || "",
            Barcode: row.BARCODE || "",
            Nama: row.NAMA || "",
            HPP: Number(row.HPP || 0),
            Total: 0,
            PL: 0,
            Tersedia: 0,
            PesananReady: 0,
            PesananBooked: 0,
            Buffer: Number(row.BUFFER || 0),
          });
        }
        const item = pivotedMap.get(key)!;
        const ukuran = row.UKURAN || "-";
        sizeSet.add(ukuran);
        item[ukuran] = ((item[ukuran] as number) || 0) + Number(row.TOTAL || 0);
        item.Total += Number(row.TOTAL || 0);
        item.PL += Number(row.PL_QTY || 0);
        item.Tersedia += Number(row.TOTAL2 || 0);
        // Backend mengembalikan nilai PER UKURAN, jadi wajib DIJUMLAH
        // supaya total per kode tetap benar.
        item.PesananReady += Number(row.PESANAN_READY || 0);
        item.PesananBooked += Number(row.PESANAN_BOOKED || 0);
      });

      const sortedSizes = Array.from(sizeSet).sort(sortSizes);
      const isStoreExport = filters.gudang !== "ALL" && filters.gudang !== "KDC" && !isBsTab.value;

      const colHeaders = [
        "Kategori",
        "Kode Barang",
        "Barcode",
        "Nama Barang",
        "HPP",
        ...sortedSizes,
        "Total",
      ];
      if (isKDC) colHeaders.push("Qty PL", "Tersedia");
      if (isStoreExport) colHeaders.push("Pesanan Ready", "Pesanan Booked", "Tersedia");
      if (!isBsTab.value) colHeaders.push("Buffer");

      const finalData = Array.from(pivotedMap.values())
        .map((row) => {
          const r: Record<string, string | number> = {
            Kategori: row.Kategori,
            "Kode Barang": row.Kode,
            Barcode: row.Barcode,
            "Nama Barang": row.Nama,
            HPP: row.HPP,
          };
          sortedSizes.forEach((sz) => {
            r[sz] = (row[sz] as number) || 0;
          });
          r["Total"] = row.Total;
          if (isKDC) {
            r["Qty PL"] = row.PL;
            r["Tersedia"] = row.Tersedia;
          }
          if (isStoreExport) {
            r["Pesanan Ready"] = row.PesananReady;
            r["Pesanan Booked"] = row.PesananBooked;
            r["Tersedia"] = row.Total - row.PesananReady - row.PesananBooked;
          }
          r["Buffer"] = row.Buffer;
          return r;
        })
        .sort((a, b) => String(a["Nama Barang"]).localeCompare(String(b["Nama Barang"])));
      const sheet = workbook.addWorksheet("Stok Horizontal");

      // Header row
      const headerRow = sheet.addRow(colHeaders);
      headerRow.height = 22;
      headerRow.eachCell({ includeEmpty: true }, (cell) => applyHeaderStyle(cell));

      // Data rows
      finalData.forEach((row) => {
        const bufferVal = Number(row["Buffer"]) || 0;
        const totalVal = Number(row["Total"]) || 0;
        const isCritical = !isBsTab.value && bufferVal > 0 && totalVal < bufferVal;
        const dataRow = sheet.addRow(colHeaders.map((h) => row[h] ?? 0));
        dataRow.eachCell({ includeEmpty: true }, (cell) => applyDataStyle(cell, isCritical));
      });

      autoWidth(sheet);

      // ── VERTIKAL ───────────────────────────────────────────
    } else {
      const isStoreExport = filters.gudang !== "ALL" && filters.gudang !== "KDC" && !isBsTab.value;

      const colHeaders = [
        "Kategori",
        "Kode Barang",
        "Barcode",
        "Nama Barang",
        "HPP",
        "Ukuran",
        "Qty",
      ];
      if (isKDC) colHeaders.push("Qty PL", "Tersedia");
      if (isStoreExport) colHeaders.push("Pesanan Ready", "Pesanan Booked", "Tersedia");
      if (!isBsTab.value) colHeaders.push("Buffer Min", "Buffer Max");

      const finalData = rawData
        .map((row: RawStockRow) => {
          const r: Record<string, string | number> = {
            Kategori: row.KATEGORI || "",
            "Kode Barang": row.KODE || "",
            Barcode: row.BARCODE || "",
            "Nama Barang": row.NAMA || "",
            HPP: Number(row.HPP || 0),
            Ukuran: row.UKURAN || "-",
            Qty: Number(row.TOTAL || 0),
          };
          if (isKDC) {
            r["Qty PL"] = Number(row.PL_QTY || 0);
            r["Tersedia"] = Number(row.TOTAL2 || 0);
          }
          if (isStoreExport) {
            const pesananReady = Number(row.PESANAN_READY || 0);
            const pesananBooked = Number(row.PESANAN_BOOKED || 0);
            r["Pesanan Ready"] = pesananReady;
            r["Pesanan Booked"] = pesananBooked;
            // Di export vertikal ini per (kode, ukuran) — lebih presisi
            // dibanding grid utama yang levelnya per kode (gabung semua ukuran).
            r["Tersedia"] = Number(row.TOTAL || 0) - pesananReady - pesananBooked;
          }
          r["Buffer Min"] = Number(row.BUFFER_MIN || 0);
          r["Buffer Max"] = Number(row.BUFFER_MAX || 0);
          return r;
        })
        .sort((a: Record<string, string | number>, b: Record<string, string | number>) => {
          const nameCmp = String(a["Nama Barang"]).localeCompare(String(b["Nama Barang"]));
          if (nameCmp !== 0) return nameCmp;
          return sortSizes(String(a["Ukuran"]), String(b["Ukuran"]));
        });

      const sheet = workbook.addWorksheet("Stok Vertikal");

      // Header row
      const headerRow = sheet.addRow(colHeaders);
      headerRow.height = 22;
      headerRow.eachCell({ includeEmpty: true }, (cell) => applyHeaderStyle(cell));

      // Data rows
      finalData.forEach((row: Record<string, string | number>) => {
        // Penanda kritis di Excel berdasarkan Buffer Min
        const minBufferVal = Number(row["Buffer Min"]) || 0;
        const qtyVal = Number(row["Qty"]) || 0;
        const isCritical = !isBsTab.value && minBufferVal > 0 && qtyVal < minBufferVal;

        const dataRow = sheet.addRow(colHeaders.map((h) => row[h] ?? 0));
        dataRow.eachCell({ includeEmpty: true }, (cell) => applyDataStyle(cell, isCritical));
      });

      autoWidth(sheet);
    }

    // ── Download ───────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Stok_${tipe}${isBsTab.value ? "_" + filters.jenisStok.toUpperCase() : ""}_${
      filters.gudang === "ALL" ? "SEMUA" : filters.gudang
    }_${filters.tanggal}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export berhasil.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data.");
  } finally {
    isLoading.value = false;
  }
};

// ─── Gudang list ──────────────────────────────────────────────────────────────
const fetchGudangList = async () => {
  try {
    const response = await api.get("/laporan-stok/lookup/gudang-options");
    gudangList.value = response.data;
  } catch (err: unknown) {
    const msg = axios.isAxiosError(err)
      ? err.response?.data?.message
      : "Gagal memuat daftar gudang.";
    toast.error(msg || "Gagal memuat daftar gudang.");
  }
};

// ─── Product lookup ───────────────────────────────────────────────────────────
const openProductSearch = () => {
  isProductSearchVisible.value = true;
};
const clearProductFilter = () => {
  filters.kodeBarang = "";
  filters.namaBarang = "";
};
const onProductSelected = (p: { kode: string; nama: string }) => {
  filters.kodeBarang = p.kode;
  filters.namaBarang = p.nama;
  isProductSearchVisible.value = false;
};

// ─── Row color ────────────────────────────────────────────────────────────────
const getRowTextColor = (item: StokItem) => {
  if (isBsTab.value) return "";
  const bufferVal = Number(item.Buffer) || 0;
  if (bufferVal <= 0) return "";
  const isKDC = authStore.user?.cabang === "KDC" && filters.gudang === "KDC";
  const checkVal = isKDC ? Number(item.TOTAL2) || 0 : Number(item.TOTAL) || 0;
  return checkVal < bufferVal ? "stok-kritis font-weight-bold" : "";
};

// ─── Watchers ─────────────────────────────────────────────────────────────────
watch(
  () => [
    filters.gudang,
    filters.jenisStok,
    filters.tampilkanKosong,
    filters.tanggal,
    filters.kodeBarang,
  ],
  () => fetchData(),
  { deep: true }
);

onMounted(() => {
  if (hasViewPermission.value) {
    fetchGudangList();
    fetchData();
  }
});
</script>

<template>
  <PageLayout title="Laporan Stok Real Time" desktop-mode icon="mdi-chart-bar-stacked">
    <template #header-actions>
      <v-menu transition="scale-transition">
        <template v-slot:activator="{ props }">
          <v-btn
            size="small"
            variant="tonal"
            class="btn-header-action"
            prepend-icon="mdi-file-excel"
            append-icon="mdi-chevron-down"
            v-bind="props"
            :loading="isLoading"
          >
            Export
          </v-btn>
        </template>
        <v-list density="compact" class="text-caption">
          <v-list-item @click="exportToExcel('horizontal')">
            <template #prepend>
              <v-icon size="small" class="mr-2" color="teal">mdi-table-row</v-icon>
            </template>
            <v-list-item-title>Export Horizontal (Ukuran ke Kanan)</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportToExcel('vertical')">
            <template #prepend>
              <v-icon size="small" class="mr-2" color="teal">mdi-table-column</v-icon>
            </template>
            <v-list-item-title>Export Vertikal (Ukuran ke Bawah)</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section stok-filter-section">
        <div class="d-flex align-center ga-3 w-100">
          <v-select
            v-model="filters.gudang"
            :items="gudangList"
            item-title="nama"
            item-value="kode"
            density="compact"
            hide-details
            variant="outlined"
            class="fixed-input gudang-input"
            placeholder="Gudang"
            :menu-props="{ class: 'kr-red' }"
          />

          <v-text-field
            v-model="filters.tanggal"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            class="fixed-input tgl-input"
          />

          <v-btn-toggle
            v-model="filters.jenisStok"
            mandatory
            density="compact"
            variant="text"
            class="jenis-toggle"
          >
            <v-btn value="showroom" size="small">Showroom</v-btn>
            <v-btn value="pesanan" size="small">Pesanan</v-btn>
            <v-btn value="semua" size="small" title="Showroom + Pesanan, tidak termasuk Bad Stock">
              Semua
            </v-btn>
            <v-btn value="bs_cetak" size="small">BS Cetak</v-btn>
            <v-btn value="bs_produksi" size="small">BS Produksi</v-btn>
          </v-btn-toggle>

          <v-spacer />

          <span v-if="!isBsTab" class="legend-stok">Stok Kurang dari Buffer</span>

          <v-btn
            icon="mdi-refresh"
            variant="text"
            size="small"
            :loading="isLoading"
            @click="fetchData"
          />
        </div>

        <div class="d-flex align-center ga-3 w-100 mt-1">
          <v-text-field
            v-model="filters.kodeBarang"
            density="compact"
            hide-details
            variant="outlined"
            class="fixed-input kode-input"
            readonly
            placeholder="Kode (F1)"
            clearable
            @click="openProductSearch"
            @keydown.f1.prevent="openProductSearch"
            @click:clear="clearProductFilter"
          >
            <template #append-inner>
              <v-icon size="14" style="cursor: pointer" @click="openProductSearch">
                mdi-magnify
              </v-icon>
            </template>
          </v-text-field>

          <v-text-field
            v-model="filters.namaBarang"
            readonly
            density="compact"
            hide-details
            variant="outlined"
            class="flex-grow-input nama-input"
            placeholder="Nama barang dari lookup..."
          />

          <v-divider vertical class="mx-2" />

          <v-text-field
            v-model="filters.keyword"
            density="compact"
            hide-details
            variant="outlined"
            class="flex-grow-input keyword-input"
            clearable
            placeholder="Pencarian Bebas (Ketik Kode atau Nama Barang di sini...)"
            @input="onSearchInput"
            @click:clear="clearSearch"
          >
            <template #prepend-inner>
              <v-icon size="14">mdi-magnify</v-icon>
            </template>
          </v-text-field>
        </div>
      </div>

      <div class="table-container">
        <AppDataTable
          :headers="headers"
          :items="stokList"
          :loading="isLoading"
          density="compact"
          class="desktop-table"
          fixed-header
          :items-per-page="-1"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  :style="headerStyle(header as DataTableHeader)"
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
                    @mousedown.stop="onResizeStart($event, header as DataTableHeader)"
                    @click.stop
                  />
                </th>
              </template>
            </tr>
          </template>

          <template v-for="header in headers" #[`item.${header.key}`]="{ item }" :key="header.key">
            <td :class="getRowTextColor(item as StokItem)">
              <span
                v-if="header.key === 'PESANAN_BOOKED' && Number(item[header.key]) > 0"
                class="pesanan-booked-link"
                @click="openBookedDetail(item as StokItem)"
              >
                {{ Math.round(Number(item[header.key])) }}
              </span>
              <span
                v-else-if="header.key === 'PESANAN_READY' && Number(item[header.key]) > 0"
                class="pesanan-ready-link"
                @click="openReadyDetail(item as StokItem)"
              >
                {{ Math.round(Number(item[header.key])) }}
              </span>
              <span
                v-else-if="header.key === 'PL' && Number(item[header.key]) > 0"
                class="pl-link"
                @click="openPlDetail(item as StokItem)"
              >
                {{ Math.round(Number(item[header.key])) }}
              </span>
              <template v-else>
                {{
                  ["PL", "TOTAL2", "PESANAN_READY", "PESANAN_BOOKED", "TERSEDIA"].includes(
                    header.key
                  )
                    ? Math.round(Number(item[header.key]))
                    : item[header.key]
                }}
              </template>
            </td>
          </template>
        </AppDataTable>
      </div>
    </div>

    <MasterProductSearchModal
      v-if="isProductSearchVisible"
      :gudang="filters.gudang"
      @close="isProductSearchVisible = false"
      @product-selected="onProductSelected"
    />

    <v-dialog v-model="showBookedDetail" max-width="700">
      <v-card rounded="lg">
        <v-card-title
          class="d-flex align-center bg-deep-orange-lighten-5 text-deep-orange-darken-4 py-3"
        >
          <v-icon class="mr-2" color="deep-orange">mdi-clipboard-list-outline</v-icon>
          <div>
            <div class="text-subtitle-1 font-weight-bold">Detail Pesanan Booked</div>
            <div class="text-caption">{{ bookedDetailKode }} — {{ bookedDetailNama }}</div>
          </div>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showBookedDetail = false" />
        </v-card-title>
        <v-card-text class="pa-0">
          <div v-if="isLoadingBookedDetail" class="text-center pa-8">
            <v-progress-circular indeterminate color="deep-orange" size="36" />
          </div>
          <div
            v-else-if="bookedDetailList.length === 0"
            class="text-center pa-8 text-medium-emphasis"
          >
            Tidak ada SO outstanding untuk barang ini.
          </div>
          <v-table v-else density="compact">
            <thead>
              <tr class="bg-grey-lighten-4">
                <th class="text-left font-weight-bold" style="font-size: 11px">NO. SO</th>
                <th class="text-left font-weight-bold" style="font-size: 11px">TANGGAL</th>
                <th class="text-left font-weight-bold" style="font-size: 11px">CUSTOMER</th>
                <th class="text-center font-weight-bold" style="font-size: 11px">UK.</th>
                <th class="text-right font-weight-bold" style="font-size: 11px">QTY</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in bookedDetailList" :key="i">
                <td class="font-weight-bold text-deep-orange-darken-3" style="font-size: 11px">
                  {{ row.soNomor }}
                </td>
                <td style="font-size: 11px">{{ format(new Date(row.tanggal), "dd/MM/yyyy") }}</td>
                <td style="font-size: 11px">{{ row.customer }}</td>
                <td class="text-center" style="font-size: 11px">{{ row.ukuran }}</td>
                <td class="text-right font-weight-bold" style="font-size: 11px">{{ row.qty }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showReadyDetail" max-width="700">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center bg-blue-lighten-5 text-blue-darken-4 py-3">
          <v-icon class="mr-2" color="blue-darken-2">mdi-clipboard-check-outline</v-icon>
          <div>
            <div class="text-subtitle-1 font-weight-bold">Detail Pesanan Ready</div>
            <div class="text-caption">{{ readyDetailKode }} — {{ readyDetailNama }}</div>
          </div>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showReadyDetail = false" />
        </v-card-title>
        <v-card-text class="pa-0">
          <div v-if="isLoadingReadyDetail" class="text-center pa-8">
            <v-progress-circular indeterminate color="blue" size="36" />
          </div>
          <div
            v-else-if="readyDetailList.length === 0"
            class="text-center pa-8 text-medium-emphasis"
          >
            Tidak ada stok ready untuk barang ini.
          </div>
          <v-table v-else density="compact">
            <thead>
              <tr class="bg-grey-lighten-4">
                <th class="text-left font-weight-bold" style="font-size: 11px">NO. SO</th>
                <th class="text-left font-weight-bold" style="font-size: 11px">TANGGAL</th>
                <th class="text-left font-weight-bold" style="font-size: 11px">CUSTOMER</th>
                <th class="text-center font-weight-bold" style="font-size: 11px">UK.</th>
                <th class="text-right font-weight-bold" style="font-size: 11px">QTY</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in readyDetailList" :key="i">
                <td class="font-weight-bold text-blue-darken-3" style="font-size: 11px">
                  {{ row.soNomor }}
                </td>
                <td style="font-size: 11px">{{ format(new Date(row.tanggal), "dd/MM/yyyy") }}</td>
                <td style="font-size: 11px">{{ row.customer }}</td>
                <td class="text-center" style="font-size: 11px">{{ row.ukuran }}</td>
                <td class="text-right font-weight-bold" style="font-size: 11px">{{ row.qty }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showPlDetail" max-width="700">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center bg-orange-lighten-5 text-orange-darken-4 py-3">
          <v-icon class="mr-2" color="orange-darken-2">mdi-package-variant-closed</v-icon>
          <div>
            <div class="text-subtitle-1 font-weight-bold">Detail Packing List (O/S)</div>
            <div class="text-caption">{{ plDetailKode }} — {{ plDetailNama }}</div>
          </div>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showPlDetail = false" />
        </v-card-title>
        <v-card-text class="pa-0">
          <div v-if="isLoadingPlDetail" class="text-center pa-8">
            <v-progress-circular indeterminate color="orange" size="36" />
          </div>
          <div v-else-if="plDetailList.length === 0" class="text-center pa-8 text-medium-emphasis">
            Tidak ada packing list outstanding untuk barang ini.
          </div>
          <v-table v-else density="compact">
            <thead>
              <tr class="bg-grey-lighten-4">
                <th class="text-left font-weight-bold" style="font-size: 11px">NO. PL</th>
                <th class="text-left font-weight-bold" style="font-size: 11px">TANGGAL</th>
                <th class="text-left font-weight-bold" style="font-size: 11px">TUJUAN</th>
                <th class="text-center font-weight-bold" style="font-size: 11px">UK.</th>
                <th class="text-right font-weight-bold" style="font-size: 11px">QTY</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in plDetailList" :key="i">
                <td class="font-weight-bold text-orange-darken-3" style="font-size: 11px">
                  {{ row.plNomor }}
                </td>
                <td style="font-size: 11px">
                  {{ row.tanggal ? format(new Date(row.tanggal), "dd/MM/yyyy") : "-" }}
                </td>
                <td style="font-size: 11px">{{ row.tujuan }}</td>
                <td class="text-center" style="font-size: 11px">{{ row.ukuran }}</td>
                <td class="text-right font-weight-bold" style="font-size: 11px">{{ row.qty }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* ── Layout + tema merah lokal (DESIGN.md 10.3) ─────────────────────────────── */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;

  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
}

/* ── Tombol header ──────────────────────────────────────────────────────────── */
.btn-header-action {
  background-color: rgba(183, 28, 28, 0.08) !important;
  color: #b71c1c !important;
  font-weight: 700;
  border: 1px solid rgba(183, 28, 28, 0.2);
}
.btn-header-action:hover:not(:disabled) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.btn-header-action:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}

/* ── Filter Section ──────────────────────────────────────────────────────────── */
.filter-section {
  flex-shrink: 0;
  display: flex;
  background-color: rgba(183, 28, 28, 0.03);
  border-bottom: 2px solid rgba(183, 28, 28, 0.15);
}

/* Override CSS global (.filter-section) khusus halaman ini */
.stok-filter-section {
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 8px !important;
  padding: 10px 12px !important;
  overflow: hidden !important;
  height: auto !important;
}

/* Lebar input tetap. Control dipaksa mengisi: global membuat .v-input = flex,
   sehingga .v-input__control menyusut ke isi. */
.stok-filter-section :deep(.fixed-input) {
  flex: 0 0 auto !important;
}
.stok-filter-section :deep(.fixed-input .v-input__control) {
  width: 100%;
  min-width: 0;
}
.stok-filter-section :deep(.gudang-input) {
  width: 180px !important;
}
.stok-filter-section :deep(.tgl-input) {
  width: 140px !important;
}
.stok-filter-section :deep(.kode-input) {
  width: 160px !important;
}
.stok-filter-section :deep(input[type="date"]) {
  width: 100% !important;
  text-align: center !important;
}

/* Kotak search yang bisa melar */
.stok-filter-section :deep(.flex-grow-input) {
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: none !important;
}
.stok-filter-section :deep(.flex-grow-input .v-input__control),
.stok-filter-section :deep(.flex-grow-input .v-field) {
  width: 100% !important;
}
.stok-filter-section :deep(.nama-input) {
  min-width: 250px !important;
}
.stok-filter-section :deep(.keyword-input) {
  min-width: 300px !important;
}

/* Field bergaya merah */
.stok-filter-section :deep(.v-field) {
  font-size: 11px !important;
  min-height: 28px !important;
  height: 28px !important;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}
.stok-filter-section :deep(.v-field__outline) {
  display: none !important;
}
.stok-filter-section :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.stok-filter-section :deep(.nama-input .v-field) {
  background-color: rgba(183, 28, 28, 0.06) !important;
}
.stok-filter-section :deep(.v-field__input) {
  font-size: 11px !important;
  min-height: 28px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.stok-filter-section :deep(.v-select__selection-text) {
  font-size: 11px !important;
}
.stok-filter-section :deep(.v-field__append-inner .v-icon),
.stok-filter-section :deep(.v-field__prepend-inner .v-icon),
.stok-filter-section :deep(.v-field__clearable .v-icon) {
  color: #b71c1c !important;
  font-size: 14px !important;
  opacity: 0.85;
}
.stok-filter-section :deep(.v-divider) {
  border-color: rgba(183, 28, 28, 0.25) !important;
  opacity: 1;
}

/* Toggle jenis stok (menimpa .filter-section .v-btn { width: 28px } milik global) */
.stok-filter-section :deep(.jenis-toggle) {
  flex: none !important;
  width: auto !important;
  height: 32px !important;
  border: 1px solid rgba(183, 28, 28, 0.25);
  border-radius: 8px;
  overflow: hidden;
}
.stok-filter-section :deep(.jenis-toggle .v-btn) {
  flex: none !important;
  width: auto !important;
  min-width: 0 !important;
  height: 30px !important;
  padding: 0 14px !important;
  border-radius: 0 !important;
  font-size: 11px !important;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  color: #b71c1c;
}
.stok-filter-section :deep(.jenis-toggle .v-btn + .v-btn) {
  border-left: 1px solid rgba(183, 28, 28, 0.25);
}
.stok-filter-section :deep(.jenis-toggle .v-btn--active) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
}
.stok-filter-section :deep(.jenis-toggle .v-btn--active .v-btn__overlay) {
  opacity: 0;
}

/* Tombol refresh */
.stok-filter-section :deep(.v-btn--icon) {
  color: #b71c1c !important;
}

/* Legend: peringatan memakai amber, bukan merah brand */
.legend-stok {
  font-size: 11px;
  font-weight: 600;
  color: #b26a00;
  white-space: nowrap;
}
.legend-stok::before {
  content: "● ";
}

/* ── Table ───────────────────────────────────────────────────────────────────── */
.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.desktop-table {
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;

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

/* ── Header tabel merah (pola BarangDcView) ──────────────────────────────────── */
.desktop-table :deep(thead tr th),
.desktop-table :deep(thead th.v-data-table__th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  border-bottom: 2px solid #8e0000 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
}
.desktop-table :deep(thead tr th *),
.desktop-table :deep(thead tr th .v-icon) {
  color: #ffffff !important;
}

.resizable-header {
  position: relative;
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

/* ── Baris data ──────────────────────────────────────────────────────────────── */
.desktop-table :deep(td) {
  font-size: 11px !important;
  height: 30px !important;
  padding: 0 8px !important;
  color: rgb(var(--v-theme-on-surface));
}

/* Warna SOLID (bukan rgba) supaya kolom fixed tidak tembus saat scroll horizontal */
.desktop-table :deep(tbody tr:nth-child(even) > td) {
  background-color: #fdf6f6;
}
.desktop-table :deep(tbody tr:hover > td) {
  background-color: #f9e3e3;
}

/* Stok di bawah buffer: amber */
.desktop-table :deep(td.stok-kritis),
.desktop-table :deep(td.stok-kritis span),
.desktop-table :deep(td.stok-kritis div) {
  color: #b26a00 !important;
}

/* Footer pagination (kalau AppDataTable menampilkannya) */
.desktop-table :deep(.custom-pagination-footer) {
  background-color: rgba(183, 28, 28, 0.04);
  border-top: 2px solid rgba(183, 28, 28, 0.15);
}
.desktop-table :deep(.custom-pagination-footer .v-btn) {
  color: #b71c1c;
}

/* ── Misc ────────────────────────────────────────────────────────────────────── */
.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.pesanan-booked-link {
  color: rgb(var(--v-theme-error));
  text-decoration: underline;
  cursor: pointer;
  font-weight: 700;
}
.pesanan-booked-link:hover {
  opacity: 0.75;
}

/* Biru tetap: kalau mengikuti primary (kini merah), Ready tak bisa dibedakan dari Booked */
.pesanan-ready-link {
  color: #1565c0;
  text-decoration: underline;
  cursor: pointer;
  font-weight: 700;
}
.pesanan-ready-link:hover {
  opacity: 0.75;
}

.pl-link {
  color: #e65100; /* orange-darken-4 */
  text-decoration: underline;
  cursor: pointer;
  font-weight: 700;
}
.pl-link:hover {
  opacity: 0.75;
}
</style>

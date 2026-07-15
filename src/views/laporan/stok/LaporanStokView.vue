<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import MasterProductSearchModal from "@/components/lookup/MasterProductSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import ExcelJS from "exceljs";
import AppDataTable from "@/components/AppDataTable.vue";
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
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/laporan-stok/real-time", { params: filters });
    const isStoreViewCalc = filters.gudang !== "ALL" && filters.gudang !== "KDC";

    // [BARU] Hitung kolom Tersedia = Total - Pesanan Ready - Pesanan Booked
    // (murni dihitung di frontend dari kolom yang sudah ada, tidak perlu
    // query tambahan ke backend).
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

      if (isUserKDC && isViewKDC) {
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

      // [BARU] Kolom khusus cabang store (bukan ALL, bukan KDC)
      const isStoreView = filters.gudang !== "ALL" && filters.gudang !== "KDC";
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

      newHeaders.push({ title: "Buffer", key: "Buffer", width: 100 });
      headers.value = newHeaders;
    } else {
      headers.value = [
        { title: "Kode", key: "KODE" },
        { title: "Nama Barang", key: "NAMA" },
        { title: "Total", key: "TOTAL" },
      ];
    }
  } catch (error) {
    toast.error("Gagal memuat data stok.");
    console.error(error);
  } finally {
    isLoading.value = false;
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

    const ExcelJS = (await import("exceljs")).default;
    const isKDC = authStore.user?.cabang === "KDC" && filters.gudang === "KDC";
    const workbook = new ExcelJS.Workbook();

    // ── Helper styles ──────────────────────────────────────
    const applyHeaderStyle = (cell: ExcelJS.Cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE3F2FD" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    };

    const applyDataStyle = (cell: ExcelJS.Cell, isRed = false) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      if (isRed) {
        cell.font = { bold: true, color: { argb: "FFC62828" } };
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
        // [FIX] Backend sekarang balikin nilai PER UKURAN (bukan total kode
        // yang sama di semua baris) — wajib DIJUMLAH biar total per kode
        // tetap benar, bukan cuma nyisa nilai baris ukuran terakhir.
        item.PesananReady += Number(row.PESANAN_READY || 0);
        item.PesananBooked += Number(row.PESANAN_BOOKED || 0);
      });

      const sortedSizes = Array.from(sizeSet).sort(sortSizes);
      const isStoreExport = filters.gudang !== "ALL" && filters.gudang !== "KDC";

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
      colHeaders.push("Buffer");

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
        const isRed = bufferVal > 0 && totalVal < bufferVal;
        const dataRow = sheet.addRow(colHeaders.map((h) => row[h] ?? 0));
        dataRow.eachCell({ includeEmpty: true }, (cell) => applyDataStyle(cell, isRed));
      });

      autoWidth(sheet);

      // ── VERTIKAL ───────────────────────────────────────────
    } else {
      const isStoreExport = filters.gudang !== "ALL" && filters.gudang !== "KDC";

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
      colHeaders.push("Buffer Min", "Buffer Max");

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
        // [BARU] Logika penanda merah (Kritis) di Excel berdasarkan Buffer Min
        const minBufferVal = Number(row["Buffer Min"]) || 0;
        const qtyVal = Number(row["Qty"]) || 0;
        const isRed = minBufferVal > 0 && qtyVal < minBufferVal;

        const dataRow = sheet.addRow(colHeaders.map((h) => row[h] ?? 0));
        dataRow.eachCell({ includeEmpty: true }, (cell) => applyDataStyle(cell, isRed));
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
    a.download = `Stok_${tipe}_${filters.gudang === "ALL" ? "SEMUA" : filters.gudang}_${
      filters.tanggal
    }.xlsx`;
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
  const bufferVal = Number(item.Buffer) || 0;
  if (bufferVal <= 0) return "";
  const isKDC = authStore.user?.cabang === "KDC" && filters.gudang === "KDC";
  const checkVal = isKDC ? Number(item.TOTAL2) || 0 : Number(item.TOTAL) || 0;
  return checkVal < bufferVal ? "text-red font-weight-bold" : "";
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
            color="teal"
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
          />

          <v-text-field
            v-model="filters.tanggal"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            class="fixed-input tgl-input"
          />

          <v-radio-group v-model="filters.jenisStok" inline density="compact" hide-details>
            <v-radio label="Showroom" value="showroom" />
            <v-radio label="Pesanan" value="pesanan" />
            <v-radio label="Semua" value="semua" />
          </v-radio-group>

          <v-spacer />

          <span class="legend-stok">Stok Kurang dari Buffer</span>

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
          class="desktop-table header-browse-blue"
          fixed-header
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
                    <v-icon v-if="isSorted(header)" size="small" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>
                  </div>
                  <div
                    class="resizer"
                    @mousedown.stop="onResizeStart($event, header)"
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
  </PageLayout>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────────────── */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

/* ── Filter Section ──────────────────────────────────────────────────────────── */
/* [UPDATE PENTING] Override CSS Global khusus untuk halaman Laporan Stok ini */
.stok-filter-section {
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 8px !important;
  padding: 10px 12px !important;
  overflow: hidden !important;
  height: auto !important;
}

/* Override paksaan dari Global CSS untuk Input yang kaku */
.stok-filter-section :deep(.fixed-input) {
  flex: 0 0 auto !important;
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

/* INI KUNCI UTAMA AGAR KOTAK SEARCH BISA MELAR: Nabrak CSS Global */
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

/* Penyesuaian general field */
.filter-section {
  flex-shrink: 0;
  display: flex;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section :deep(.v-field) {
  font-size: 11px !important;
  min-height: 28px !important;
  height: 28px !important;
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section :deep(.v-field__input) {
  font-size: 11px !important;
  min-height: 28px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.filter-section :deep(.v-label) {
  font-size: 11px !important;
}

.filter-section :deep(input[type="date"]) {
  font-size: 11px !important;
  padding: 0 !important;
  text-align: center !important;
}

.filter-section :deep(.v-select__selection-text) {
  font-size: 11px !important;
}

.filter-section :deep(.v-field__append-inner .v-icon),
.filter-section :deep(.v-field__prepend-inner .v-icon) {
  font-size: 14px !important;
}

/* Radio group compact */
.filter-section :deep(.v-radio-group .v-label),
.filter-section :deep(.v-radio .v-label) {
  font-size: 11px !important;
}
.filter-section :deep(.v-radio-group .v-selection-control-group) {
  gap: 4px !important;
}
.filter-section :deep(.v-selection-control) {
  min-height: unset !important;
}

/* Legend */
.legend-stok {
  font-size: 11px;
  font-weight: 600;
  color: #d32f2f;
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

/* ── Resizable Header ────────────────────────────────────────────────────────── */
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

/* ── Row colors ──────────────────────────────────────────────────────────────── */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}
:deep(td.text-red span),
:deep(td.text-red div) {
  color: rgb(var(--v-theme-error)) !important;
}

.desktop-table :deep(td) {
  font-size: 11px !important;
  height: 30px !important;
  padding: 0 8px !important;
  color: rgb(var(--v-theme-on-surface));
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

.pesanan-ready-link {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
  cursor: pointer;
  font-weight: 700;
}
.pesanan-ready-link:hover {
  opacity: 0.75;
}
</style>

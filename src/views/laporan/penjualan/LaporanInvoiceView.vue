<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import ExcelJS from "exceljs";
import axios, { type AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";

// --- INTERFACES (DIPERBAIKI AGAR TIDAK TYPE ERROR) ---

// 1. Interface Header Tabel
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

// 2. Interface Data Utama (Tambahkan Index Signature)
interface MasterDataItem {
  Kode: string;
  Nama?: string;
  level_nama?: string;
  Alamat?: string;
  Kota?: string;
  Nominal?: number;
  Hpp?: number;
  Laba?: number;
  Donasi?: number;
  PundiAmal?: number;
  Qty?: number;
  Tanggal?: string;
  [key: string]: unknown; // [TAMBAHKAN BARIS INI]
}

// 3. Interface Detail (Tambahkan Index Signature)
interface DetailItem {
  kdcus: string;
  nama: string;
  alamat?: string;
  kota?: string;
  Qty?: number;
  Nominal?: number;
  Hpp?: number;
  Laba?: number;
  Donasi?: number;
  PundiAmal?: number;
}

interface CabangOption {
  kode: string;
  nama: string;
}

// --- INITIALIZATION ---
const toast = useToast();
const authStore = useAuthStore();
const CABKAOS = authStore.user?.cabang || "KDC";
const MENU_ID = "505";

// --- STATE ---
const masterData = ref<MasterDataItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const isLoading = ref(false);
const loadingDetails = ref(new Set<string>());
const cabangList = ref<CabangOption[]>([]);
const expanded = ref<string[]>([]);
const reportType = ref<"tanggal" | "customer" | "level">("tanggal");

// Karena ini laporan (read-only), selected row mungkin tidak terlalu butuh,
// tapi kita simpan untuk kompatibilitas AppDataTable
// const selected = ref([]);

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  gudangKode: CABKAOS === "KDC" ? "ALL" : CABKAOS,
  gudangNama: CABKAOS === "KDC" ? "Semua Cabang" : "",
});

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

// --- DEFINISI HEADER (FIXED ALIGNMENT) ---

// Helper untuk membuat header numeric rata kanan
const numCol = (title: string, key: string, width: number) => ({
  title,
  key,
  width,
  align: "end" as const,
  sortable: true,
});

const headersTanggal = ref<DataTableHeader[]>([
  { title: filters.gudangKode === "ALL" ? "Cabang" : "Kode", key: "Kode", fixed: true, width: 100 },
  { title: "Tanggal", key: "Tanggal", fixed: true, width: 120 },
  numCol("Nominal", "Nominal", 150),
  ...(CABKAOS === "KDC" ? [numCol("HPP", "Hpp", 150), numCol("Laba", "Laba", 150)] : []),
  numCol("Donasi", "Donasi", 120),
  numCol("Pundi Amal", "PundiAmal", 120),
]);

const headersCustomer = ref<DataTableHeader[]>([
  { title: "Kode", key: "Kode", fixed: true, width: 100 },
  { title: "Nama", key: "Nama", fixed: true, width: 250 },
  { title: "Level", key: "level_nama", width: 150 },
  { title: "Alamat", key: "Alamat", sortable: false, width: 300 },
  { title: "Kota", key: "Kota", width: 150 },
  numCol("Nominal", "Nominal", 150),
  ...(CABKAOS === "KDC" ? [numCol("HPP", "Hpp", 150), numCol("Laba", "Laba", 150)] : []),
  numCol("Donasi", "Donasi", 120),
  numCol("Pundi Amal", "PundiAmal", 120),
]);

const headersLevel = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Kode", key: "Kode", fixed: true, width: 100 },
  { title: "Level", key: "Level", fixed: true, width: 200 },
  numCol("Qty", "Qty", 100),
  numCol("Nominal", "Nominal", 150),
  ...(CABKAOS === "KDC" ? [numCol("HPP", "Hpp", 150), numCol("Laba", "Laba", 150)] : []),
  numCol("Donasi", "Donasi", 120),
  numCol("Pundi Amal", "PundiAmal", 120),
]);

// Header untuk detail tabel di dalam expanded row
const detailHeadersLevel = [
  { title: "Kode", key: "kdcus", width: "100px" },
  { title: "Nama", key: "nama", width: "250px" },
  { title: "Alamat", key: "alamat", sortable: false, width: "300px" },
  { title: "Kota", key: "kota", width: "150px" },
  { title: "Qty", key: "Qty", width: "80px" },
  { title: "Nominal", key: "Nominal", width: "150px" },
  ...(CABKAOS === "KDC"
    ? [
        { title: "HPP", key: "Hpp", width: "120px" },
        { title: "Laba", key: "Laba", width: "120px" },
      ]
    : []),
] as const;

const activeHeaders = computed(() => {
  switch (reportType.value) {
    case "tanggal":
      return headersTanggal.value;
    case "customer":
      return headersCustomer.value;
    case "level":
      return headersLevel.value;
    default:
      return [];
  }
});

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

// --- COMPUTED SUMMARY (TOTALS) ---
const totalSummary = computed(() => {
  if (!masterData.value.length) return {};
  const totals: Record<string, number> = {};
  const keysToSum = ["Nominal", "Hpp", "Laba", "Donasi", "PundiAmal", "Qty"];

  keysToSum.forEach((key) => {
    totals[key] = masterData.value.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
  });
  return totals;
});

// --- API METHODS ---
const fetchCabangOptions = async () => {
  try {
    const response = await api.get<CabangOption[]>("/laporan-invoice/cabang/options");

    // Cukup gunakan response.data langsung karena Backend sudah handle 'ALL'
    cabangList.value = response.data;

    if (CABKAOS !== "KDC") {
      const userCabang = cabangList.value.find((c) => c.kode === CABKAOS);
      if (userCabang) filters.gudangNama = userCabang.nama;
    }
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal memuat data cabang.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg); // Cuma lempar string
  }
};

const fetchMasterData = async () => {
  isLoading.value = true;
  details.value = {};
  expanded.value = [];
  try {
    const response = await api.get("/laporan-invoice/master", {
      params: { ...filters, reportType: reportType.value },
    });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || `Gagal memuat data Laporan ${reportType.value}.`);
  } finally {
    isLoading.value = false;
  }
};

// Perbaikan: Argumen adalah string[] (array kode), bukan object[]
const loadDetails = async (expandedIds: string[]) => {
  if (reportType.value !== "level") return;

  // 1. Cari Kode Level yang baru di-expand
  // Karena expandedIds isinya langsung string (misal: "1", "2"), kita tidak perlu .Kode
  const kodeToLoad = expandedIds.find((kode) => {
    return !details.value[kode] && !loadingDetails.value.has(kode);
  });

  // Jika tidak ada kode baru yang perlu dimuat, berhenti
  if (!kodeToLoad) return;

  const levelKode = kodeToLoad; // Ini sudah string (contoh: "2")
  loadingDetails.value.add(levelKode);

  try {
    // 2. Panggil API dengan parameter levelKode yang benar
    const response = await api.get<DetailItem[]>("/laporan-invoice/detail-customer-by-level", {
      params: {
        ...filters,
        levelKode: levelKode, // <-- Pastikan ini terkirim
      },
    });

    // 3. Simpan ke state details
    details.value = { ...details.value, [levelKode]: response.data };
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || `Gagal memuat detail untuk Level ${levelKode}`);

    // Hapus dari expanded jika gagal agar user bisa coba klik lagi
    // Ingat: expanded.value isinya array string
    expanded.value = expanded.value.filter((k) => k !== levelKode);
  } finally {
    loadingDetails.value.delete(levelKode);
  }
};

const onGudangSelected = (selectedKode: string) => {
  if (selectedKode) {
    const selectedCabang = cabangList.value.find((c) => c.kode === selectedKode);
    if (selectedCabang) filters.gudangNama = selectedCabang.nama;
  }
};

const clearGudangFilter = () => {
  if (CABKAOS === "KDC") {
    filters.gudangKode = "ALL";
    filters.gudangNama = "Semua Cabang";
  }
};

const exportToExcel = async () => {
  if (masterData.value.length === 0) return toast.warning("Tidak ada data untuk diekspor.");
  toast.info("Menyiapkan file export...");

  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Laporan ${reportType.value}`);

    const isKDC = CABKAOS === "KDC";
    const rupiah = (val: number) => Number(val || 0);

    // ── Definisi kolom berdasarkan reportType ──────────────
    type ColDef = {
      header: string;
      key: string;
      width: number;
      align: ExcelJS.Alignment["horizontal"];
      format?: "rupiah" | "tanggal" | "number";
    };

    let colDefs: ColDef[] = [];

    if (reportType.value === "tanggal") {
      colDefs = [
        { header: "Cabang/Kode", key: "Kode", width: 14, align: "center" },
        { header: "Tanggal", key: "Tanggal", width: 14, align: "center", format: "tanggal" },
        { header: "Nominal", key: "Nominal", width: 20, align: "right", format: "rupiah" },
        ...(isKDC
          ? [
              {
                header: "HPP",
                key: "Hpp",
                width: 20,
                align: "right" as const,
                format: "rupiah" as const,
              },
              {
                header: "Laba",
                key: "Laba",
                width: 20,
                align: "right" as const,
                format: "rupiah" as const,
              },
            ]
          : []),
        { header: "Donasi", key: "Donasi", width: 16, align: "right", format: "rupiah" },
        { header: "Pundi Amal", key: "PundiAmal", width: 16, align: "right", format: "rupiah" },
      ];
    } else if (reportType.value === "customer") {
      colDefs = [
        { header: "Kode", key: "Kode", width: 12, align: "center" },
        { header: "Nama", key: "Nama", width: 35, align: "left" },
        { header: "Level", key: "level_nama", width: 18, align: "left" },
        { header: "Alamat", key: "Alamat", width: 40, align: "left" },
        { header: "Kota", key: "Kota", width: 18, align: "left" },
        { header: "Nominal", key: "Nominal", width: 20, align: "right", format: "rupiah" },
        ...(isKDC
          ? [
              {
                header: "HPP",
                key: "Hpp",
                width: 20,
                align: "right" as const,
                format: "rupiah" as const,
              },
              {
                header: "Laba",
                key: "Laba",
                width: 20,
                align: "right" as const,
                format: "rupiah" as const,
              },
            ]
          : []),
        { header: "Donasi", key: "Donasi", width: 16, align: "right", format: "rupiah" },
        { header: "Pundi Amal", key: "PundiAmal", width: 16, align: "right", format: "rupiah" },
      ];
    } else {
      // level
      colDefs = [
        { header: "Kode", key: "Kode", width: 10, align: "center" },
        { header: "Level", key: "Level", width: 25, align: "left" },
        { header: "Qty", key: "Qty", width: 12, align: "right", format: "number" },
        { header: "Nominal", key: "Nominal", width: 20, align: "right", format: "rupiah" },
        ...(isKDC
          ? [
              {
                header: "HPP",
                key: "Hpp",
                width: 20,
                align: "right" as const,
                format: "rupiah" as const,
              },
              {
                header: "Laba",
                key: "Laba",
                width: 20,
                align: "right" as const,
                format: "rupiah" as const,
              },
            ]
          : []),
        { header: "Donasi", key: "Donasi", width: 16, align: "right", format: "rupiah" },
        { header: "Pundi Amal", key: "PundiAmal", width: 16, align: "right", format: "rupiah" },
      ];
    }

    // Set lebar kolom
    sheet.columns = colDefs.map((c) => ({ width: c.width }));

    // ── Header row ─────────────────────────────────────────
    const headerRow = sheet.addRow(colDefs.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // ── Data rows ──────────────────────────────────────────
    masterData.value.forEach((item) => {
      const rowValues = colDefs.map((c) => {
        const raw = item[c.key];
        if (c.format === "tanggal") {
          return raw ? format(new Date(String(raw)), "dd/MM/yyyy") : "";
        }
        if (c.format === "rupiah" || c.format === "number") {
          return Number(raw || 0);
        }
        return raw ?? "";
      });

      const dataRow = sheet.addRow(rowValues);
      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const colDef = colDefs[colNum - 1];
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { horizontal: colDef?.align ?? "left", vertical: "middle" };

        // Format angka rupiah di Excel
        if (colDef?.format === "rupiah") {
          cell.numFmt = "#,##0";
        }
      });
    });

    // ── Grand Total row ────────────────────────────────────
    const totalKeys = ["Qty", "Nominal", "Hpp", "Laba", "Donasi", "PundiAmal"];
    const totalRowValues = colDefs.map((c, i) => {
      // Kolom terakhir sebelum angka → label TOTAL
      const labelColIndex =
        reportType.value === "tanggal" ? 1 : reportType.value === "customer" ? 4 : 1; // level → kolom Level
      if (i === labelColIndex) return "TOTAL :";
      if (totalKeys.includes(c.key)) {
        return masterData.value.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
      }
      return "";
    });

    const totalRow = sheet.addRow(totalRowValues);
    totalRow.height = 22;
    totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const colDef = colDefs[colNum - 1];
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      cell.border = {
        top: { style: "medium" },
        left: { style: "thin" },
        bottom: { style: "medium" },
        right: { style: "thin" },
      };
      cell.alignment = { horizontal: colDef?.align ?? "left", vertical: "middle" };
      if (colDef?.format === "rupiah" || colDef?.format === "number") {
        cell.numFmt = "#,##0";
      }
    });

    // ── Download ───────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LaporanInvoice_${reportType.value}_${filters.gudangKode}_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data berhasil diekspor.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data.");
  }
};

onMounted(() => {
  if (hasViewPermission.value) {
    fetchCabangOptions();
    fetchMasterData();
  }
});

watch([filters, reportType], fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Invoice Penjualan" icon="mdi-receipt-text-outline">
    <template #header-actions>
      <v-btn size="small" @click="exportToExcel" prepend-icon="mdi-file-excel" color="teal"
        >Export</v-btn
      >
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <v-radio-group v-model="reportType" inline density="compact" hide-details class="me-4">
          <v-radio label="Per Tanggal" value="tanggal" class="me-4" />
          <v-radio label="Per Pelanggan" value="customer" class="me-4" />
          <v-radio label="Per Level" value="level" />
        </v-radio-group>

        <v-label class="filter-label ms-2">Periode:</v-label>
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
          v-model="filters.gudangKode"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 200px"
          class="ms-4"
          :readonly="CABKAOS !== 'KDC'"
          clearable
          @click:clear="clearGudangFilter"
          @update:model-value="onGudangSelected"
        />

        <v-spacer />
        <v-btn
          @click="fetchMasterData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="isLoading"
          title="Refresh"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          :headers="activeHeaders"
          :items="masterData"
          :loading="isLoading"
          class="desktop-table header-browse-blue"
          density="compact"
          fixed-header
          :show-expand="reportType === 'level'"
          item-value="Kode"
          v-model:expanded="expanded"
          @update:expanded="loadDetails"
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
                    'text-end': header.align === 'start',
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
              v-if="reportType === 'level'"
              icon="mdi-chevron-down"
              :class="{ 'rotate-180': isExpanded(internalItem) }"
              size="x-small"
              variant="text"
              @click.stop="toggleExpand(internalItem)"
            />
          </template>

          <template
            v-for="header in activeHeaders.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td>
              <template
                v-if="['Nominal', 'Hpp', 'Laba', 'Donasi', 'PundiAmal'].includes(header.key)"
              >
                {{ formatRupiah(Number(item[header.key])) }}
              </template>
              <template v-else-if="header.key === 'Tanggal'">
                {{ item.Tanggal ? format(new Date(item.Tanggal), "dd/MM/yyyy") : "" }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr v-if="reportType === 'level'">
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Kode)" class="text-center pa-4 text-caption">
                      Memuat detail...
                    </div>
                    <v-data-table
                      v-else
                      :headers="detailHeadersLevel"
                      :items="details[item.Kode] || []"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.Nominal`]="{ item: dItem }">{{
                        formatRupiah(dItem.Nominal || 0)
                      }}</template>

                      <template #[`item.Hpp`]="{ item: dItem }">{{
                        formatRupiah(dItem.Hpp || 0)
                      }}</template>

                      <template #[`item.Laba`]="{ item: dItem }">{{
                        formatRupiah(dItem.Laba || 0)
                      }}</template>
                      <template #bottom></template>
                    </v-data-table>

                    <div
                      v-if="
                        !loadingDetails.has(item.Kode) &&
                        (!details[item.Kode] || details[item.Kode].length === 0)
                      "
                      class="text-center pa-4 text-caption text-grey"
                    >
                      Tidak ada data detail.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>

          <template #[`body.append`]>
            <tr class="bg-grey-lighten-4 font-weight-bold sticky-footer-row">
              <td v-for="header in activeHeaders" :key="header.key" class="text-start pa-2">
                <template
                  v-if="
                    (reportType === 'tanggal' && header.key === 'Tanggal') ||
                    (reportType === 'customer' && header.key === 'Kota') ||
                    (reportType === 'level' && header.key === 'Level')
                  "
                >
                  <span class="d-block w-100 text-right">TOTAL :</span>
                </template>

                <template
                  v-else-if="
                    ['Qty', 'Nominal', 'Hpp', 'Laba', 'Donasi', 'PundiAmal'].includes(header.key)
                  "
                >
                  {{ formatRupiah(totalSummary[header.key] || 0) }}
                </template>

                <template v-else> &nbsp; </template>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>
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
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 12px;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled),
.filter-section :deep(.v-radio-group) {
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

.desktop-table :deep(td) {
  white-space: nowrap;
  height: 32px !important;
  padding: 0 8px !important;
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

/* --- Sticky Footer Row --- */
.sticky-footer-row td {
  position: sticky;
  bottom: 0;
  z-index: 5;

  background-color: rgb(var(--v-theme-surface));
  border-top: 2px solid rgba(var(--v-theme-on-surface), 0.2);

  padding: 8px;
  color: rgb(var(--v-theme-on-surface));
}

.desktop-table :deep(td) {
  color: rgb(var(--v-theme-on-surface));
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}
</style>

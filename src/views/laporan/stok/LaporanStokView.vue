<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import MasterProductSearchModal from "@/components/lookup/MasterProductSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import * as XLSX from "xlsx";
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
  UKURAN?: string;
  TOTAL?: number | string;
  PL_QTY?: number | string;
  TOTAL2?: number | string;
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
  Buffer: number;
  [size: string]: string | number;
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
    stokList.value = response.data;

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

// ─── Export ───────────────────────────────────────────────────────────────────
const exportToExcel = async () => {
  isLoading.value = true;
  toast.info("Menyiapkan data export...");
  try {
    const response = await api.get("/laporan-stok/real-time/export", { params: filters });
    const rawData = response.data;
    if (!rawData?.length) {
      toast.warning("Tidak ada data untuk diekspor.");
      return;
    }

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
    });

    const sortedSizes = Array.from(sizeSet).sort(sortSizes);
    const isKDC = authStore.user?.cabang === "KDC" && filters.gudang === "KDC";

    const excelHeaders = [
      "Kategori",
      "Kode Barang",
      "Barcode",
      "Nama Barang",
      "HPP",
      ...sortedSizes,
      "Total",
    ];
    if (isKDC) excelHeaders.push("Qty PL", "Tersedia");
    excelHeaders.push("Buffer");

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
          r[sz] = row[sz] || 0;
        });
        r["Total"] = row.Total;
        if (isKDC) {
          r["Qty PL"] = row.PL;
          r["Tersedia"] = row.Tersedia;
        }
        r["Buffer"] = row.Buffer;
        return r;
      })
      .sort((a, b) => String(a["Nama Barang"]).localeCompare(String(b["Nama Barang"])));

    const ws = XLSX.utils.json_to_sheet(finalData, { header: excelHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stok Detail");
    XLSX.writeFile(
      wb,
      `Stok_${filters.gudang === "ALL" ? "SEMUA" : filters.gudang}_${filters.tanggal}.xlsx`
    );
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
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportToExcel">
        Export
      </v-btn>
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
              {{
                header.key === "PL" || header.key === "TOTAL2"
                  ? Math.round(Number(item[header.key]))
                  : item[header.key]
              }}
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
</style>

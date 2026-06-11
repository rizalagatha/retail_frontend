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

// --- INTERFACES ---
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
}

interface LostOrderItem {
  id: number;
  tanggal: string;
  kode_cabang: string;
  nama_cabang: string;
  customer_nama: string;
  customer_telp: string;
  produk_nama: string;
  ukuran: string;
  qty: number;
  alasan: string;
  catatan: string;
  user_create: string;
  [key: string]: unknown;
}

interface KunjunganItem {
  id: number;
  tanggal: string;
  created_at: string;
  kode_cabang: string;
  nama_cabang: string;
  customer_kode: string;
  customer_nama: string;
  tipe_kunjungan: "STORE" | "WA";
  sumber_dokumen: string;
  nomor_dokumen: string;
  user_create: string;
  [key: string]: unknown;
}

interface CabangOption {
  kode: string;
  nama: string;
}

// --- INITIALIZATION ---
const toast = useToast();
const authStore = useAuthStore();
const CABKAOS = authStore.user?.cabang || "KDC";
const MENU_ID = "514";

// --- STATE ---
const currentTab = ref<"kunjungan" | "lost">("kunjungan");
const lostData = ref<LostOrderItem[]>([]);
const kunjunganData = ref<KunjunganItem[]>([]);
const isLoading = ref(false);
const cabangList = ref<CabangOption[]>([]);

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: CABKAOS === "KDC" ? "ALL" : CABKAOS,
  keyword: "",
});

const hasViewPermission = authStore.can(MENU_ID, "view");

// --- COMPUTED: Unique Customers ---
const totalUniqueCustomers = computed(() => {
  if (currentTab.value !== "kunjungan") return 0;

  const uniqueSet = new Set();

  kunjunganData.value.forEach((item) => {
    const custNama = (item.customer_nama || "").toUpperCase();
    const custKode = (item.customer_kode || "").toUpperCase();

    // Jika customer adalah RETAIL atau RETAILER, gunakan nomor_dokumen (Invoice) sebagai identitas unik
    if (custNama.includes("RETAIL") || custKode.includes("RETAIL")) {
      if (item.nomor_dokumen) {
        uniqueSet.add(item.nomor_dokumen);
      }
    } else {
      // Untuk customer member/reguler lainnya, tetap gunakan kode atau nama pelanggan
      const identifier =
        item.customer_kode && item.customer_kode !== "-" ? item.customer_kode : item.customer_nama;

      if (identifier) {
        uniqueSet.add(identifier);
      }
    }
  });

  return uniqueSet.size;
});

// --- HEADERS DEFINITION ---
const headersKunjungan = ref<DataTableHeader[]>([
  { title: "Tanggal & Jam", key: "tanggal", fixed: true, width: 160 },
  { title: "Cabang", key: "nama_cabang", width: 150 },
  { title: "Kode Pelanggan", key: "customer_kode", width: 130 },
  { title: "Nama Pelanggan", key: "customer_nama", width: 200 },
  { title: "Metode Interaksi", key: "tipe_kunjungan", width: 150, align: "center" },
  { title: "Asal Nota", key: "sumber_dokumen", width: 130, align: "center" },
  { title: "No. Referensi", key: "nomor_dokumen", width: 180 },
  { title: "Kasir/SC", key: "user_create", width: 120 },
]);

const headersLost = ref<DataTableHeader[]>([
  { title: "Tanggal", key: "tanggal", fixed: true, width: 140 },
  { title: "Cabang", key: "nama_cabang", width: 140 },
  { title: "Nama Konsumen", key: "customer_nama", width: 180 },
  { title: "No. Telp", key: "customer_telp", width: 120 },
  { title: "Produk Dicari", key: "produk_nama", width: 230 },
  { title: "Ukuran", key: "ukuran", width: 80, align: "center" },
  { title: "Qty", key: "qty", width: 70, align: "end" },
  { title: "Alasan Gagal", key: "alasan", width: 180 },
  { title: "Catatan Tambahan", key: "catatan", width: 200 },
  { title: "User Input", key: "user_create", width: 110 },
]);

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

// --- API METHODS ---
const fetchCabangOptions = async () => {
  try {
    const response = await api.get<CabangOption[]>("/laporan-stok-bahan/cabang-options");
    cabangList.value = response.data;
  } catch (error: unknown) {
    let msg = "Gagal memuat data cabang.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  }
};

const fetchReportData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/laporan/lost-order", {
      params: { ...filters, tab: currentTab.value },
    });

    if (currentTab.value === "kunjungan") {
      kunjunganData.value = response.data;
    } else {
      lostData.value = response.data;
    }
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data laporan harian.");
  } finally {
    isLoading.value = false;
  }
};

const clearGudangFilter = () => {
  if (CABKAOS === "KDC") filters.cabang = "ALL";
};

const clearSearch = () => {
  filters.keyword = "";
  fetchReportData();
};

let searchTimeout: ReturnType<typeof setTimeout>;
const onSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(fetchReportData, 600);
};

// --- EXPORT TO EXCEL ---
const exportToExcel = async () => {
  const activeData = currentTab.value === "kunjungan" ? kunjunganData.value : lostData.value;
  if (activeData.length === 0) return toast.warning("Tidak ada data di tab ini untuk diekspor.");

  toast.info("Menyiapkan file spreadsheet...");
  try {
    const workbook = new ExcelJS.Workbook();

    if (currentTab.value === "kunjungan") {
      const sheet = workbook.addWorksheet("Data Kunjungan");
      const colDefs = [
        { header: "Tanggal", key: "tanggal", width: 16 },
        { header: "Cabang", key: "nama_cabang", width: 20 },
        { header: "Kode Pelanggan", key: "customer_kode", width: 16 },
        { header: "Nama Pelanggan", key: "customer_nama", width: 25 },
        { header: "Metode Interaksi", key: "tipe_kunjungan", width: 18, align: "center" as const },
        { header: "Asal Nota", key: "sumber_dokumen", width: 15, align: "center" as const },
        { header: "No. Referensi", key: "nomor_dokumen", width: 22 },
        { header: "Kasir/SC", key: "user_create", width: 16 },
      ];
      sheet.columns = colDefs.map((c) => ({ width: c.width }));

      const headerRow = sheet.addRow(colDefs.map((c) => c.header));
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FF0D47A1" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });

      kunjunganData.value.forEach((item) => {
        const rowData = colDefs.map((c) => {
          if (c.key === "tanggal") {
            const jam = item.created_at
              ? format(new Date(item.created_at as string), "HH:mm:ss")
              : "";
            return format(new Date(item.tanggal as string), "dd/MM/yyyy") + (jam ? " " + jam : "");
          }
          return item[c.key] ?? "";
        });
        const dataRow = sheet.addRow(rowData);
        dataRow.eachCell((cell, colNum) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = { horizontal: colDefs[colNum - 1]?.align || "left", vertical: "middle" };
        });
      });
    } else {
      const sheet = workbook.addWorksheet("Data Lost Order");
      const colDefs = [
        { header: "Tanggal", key: "tanggal", width: 16 },
        { header: "Cabang", key: "nama_cabang", width: 20 },
        { header: "Nama Konsumen", key: "customer_nama", width: 25 },
        { header: "No. Telp", key: "customer_telp", width: 16 },
        { header: "Produk Dicari", key: "produk_nama", width: 35 },
        { header: "Ukuran", key: "ukuran", width: 10, align: "center" as const },
        { header: "Qty", key: "qty", width: 10, align: "right" as const },
        { header: "Alasan Gagal", key: "alasan", width: 25 },
        { header: "Catatan", key: "catatan", width: 35 },
        { header: "User Input", key: "user_create", width: 15 },
      ];
      sheet.columns = colDefs.map((c) => ({ width: c.width }));

      const headerRow = sheet.addRow(colDefs.map((c) => c.header));
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FF1a237e" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EAF6" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });

      lostData.value.forEach((item) => {
        const rowData = colDefs.map((c) => {
          if (c.key === "tanggal") return format(new Date(item.tanggal), "dd/MM/yyyy HH:mm");
          return item[c.key] ?? "";
        });
        const dataRow = sheet.addRow(rowData);
        dataRow.eachCell((cell, colNum) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = { horizontal: colDefs[colNum - 1]?.align || "left", vertical: "middle" };
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Laporan_LostOrder_Kunjungan_${currentTab.value}_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Spreadsheet berhasil diekspor.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data ke file excel.");
  }
};

onMounted(() => {
  if (hasViewPermission) {
    if (CABKAOS === "KDC") fetchCabangOptions();
    fetchReportData();
  }
});

watch(
  () => [filters.startDate, filters.endDate, filters.cabang, currentTab.value],
  () => {
    fetchReportData();
  }
);
</script>

<template>
  <PageLayout title="Laporan Lost Order dan Kunjungan" icon="mdi-chart-timeline-variant-shimmer">
    <template #header-actions>
      <v-btn size="small" @click="exportToExcel" prepend-icon="mdi-file-excel" color="teal">
        Export Excel
      </v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <v-tabs
        v-model="currentTab"
        color="primary"
        density="compact"
        bg-color="grey-lighten-4"
        class="flex-shrink-0"
      >
        <v-tab value="kunjungan" class="font-weight-bold text-none">
          <v-icon start>mdi-account-check-outline</v-icon> Kunjungan Pelanggan
        </v-tab>
        <v-tab value="lost" class="font-weight-bold text-none">
          <v-icon start>mdi-account-remove-outline</v-icon> Lost Order Toko
        </v-tab>
      </v-tabs>

      <div class="filter-section lost-order-filter">
        <div class="d-flex align-center ga-2 flex-shrink-0 flex-wrap filter-group-left">
          <v-label class="filter-label ms-2">Periode:</v-label>
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

          <v-select
            v-if="CABKAOS === 'KDC'"
            v-model="filters.cabang"
            :items="cabangList"
            item-title="nama"
            item-value="kode"
            label="Cabang"
            density="compact"
            hide-details
            variant="outlined"
            class="fixed-input gudang-input ms-2"
            clearable
            @click:clear="clearGudangFilter"
          />
        </div>

        <div class="d-flex align-center flex-grow-1 mx-4 filter-group-center">
          <v-text-field
            v-model="filters.keyword"
            :placeholder="
              currentTab === 'kunjungan'
                ? 'Cari nota / kode / nama pelanggan...'
                : 'Cari produk / customer / alasan...'
            "
            density="compact"
            hide-details
            variant="outlined"
            clearable
            prepend-inner-icon="mdi-magnify"
            class="flex-grow-input keyword-input"
            @input="onSearchInput"
            @click:clear="clearSearch"
          />
        </div>

        <div class="d-flex align-center ga-2 flex-shrink-0 filter-group-right">
          <v-chip
            v-if="currentTab === 'kunjungan'"
            color="primary"
            variant="tonal"
            size="small"
            class="font-weight-bold"
          >
            <v-icon start size="14">mdi-account-group</v-icon>
            Total Pelanggan: {{ totalUniqueCustomers }} Org
          </v-chip>

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

      <div class="table-container">
        <v-window v-model="currentTab" class="h-100">
          <v-window-item value="kunjungan" class="h-100">
            <AppDataTable
              :headers="headersKunjungan"
              :items="kunjunganData"
              :loading="isLoading"
              class="desktop-table header-browse-blue"
              density="compact"
              fixed-header
              item-value="id"
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
                      :class="{ 'text-center': header.align === 'center' }"
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

              <template #[`item.tanggal`]="{ item }">
                <div>
                  <div>
                    {{ item.tanggal ? format(new Date(item.tanggal as string), "dd/MM/yyyy") : "" }}
                  </div>
                  <div class="text-caption text-grey-darken-1">
                    {{
                      item.created_at ? format(new Date(item.created_at as string), "HH:mm:ss") : ""
                    }}
                  </div>
                </div>
              </template>

              <template #[`item.tipe_kunjungan`]="{ item }">
                <v-chip
                  size="x-small"
                  :color="item.tipe_kunjungan === 'STORE' ? 'primary' : 'success'"
                  class="font-weight-bold"
                  variant="flat"
                >
                  <v-icon start size="12">{{
                    item.tipe_kunjungan === "STORE" ? "mdi-storefront" : "mdi-whatsapp"
                  }}</v-icon>
                  {{ item.tipe_kunjungan }}
                </v-chip>
              </template>

              <template #[`item.sumber_dokumen`]="{ item }">
                <v-chip
                  size="x-small"
                  color="blue-grey-darken-2"
                  class="font-weight-medium"
                  variant="tonal"
                >
                  {{ item.sumber_dokumen }}
                </v-chip>
              </template>
            </AppDataTable>
          </v-window-item>

          <v-window-item value="lost" class="h-100">
            <AppDataTable
              :headers="headersLost"
              :items="lostData"
              :loading="isLoading"
              class="desktop-table header-browse-indigo"
              density="compact"
              fixed-header
              item-value="id"
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
                      class="resizable-header resizable-indigo"
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

              <template #[`item.tanggal`]="{ item }">
                {{
                  item.tanggal ? format(new Date(item.tanggal as string), "dd/MM/yyyy HH:mm") : ""
                }}
              </template>

              <template #[`item.alasan`]="{ item }">
                <v-chip
                  size="x-small"
                  color="orange-darken-4"
                  variant="tonal"
                  class="font-weight-bold"
                >
                  {{ item.alasan }}
                </v-chip>
              </template>
            </AppDataTable>
          </v-window-item>
        </v-window>
      </div>
    </div>
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

/* ── Filter Section (Override Lokal) ─────────────────────────────────────────── */
.filter-section {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
}

/* Flexbox Grouping untuk mengendalikan layout ketika layar menyusut */
.filter-group-left {
  flex: 0 0 auto; /* Kunci sisi kiri (tanggal, cabang) */
}
.filter-group-center {
  flex: 0 0 auto !important; /* Jangan melar memenuhi seluruh tengah layar */
  width: 350px; /* Atur lebar ideal kotak pencarian di sini */
  margin-left: 8px !important; /* Rapatkan ke filter cabang di kirinya */
  margin-right: auto !important; /* KUNCI: Dorong sisa ruang kosong ke kanan untuk memojokkan chip & refresh */
}
.filter-group-right {
  flex: 0 0 auto; /* Kunci sisi kanan (chip, tombol refresh) */
  justify-content: flex-end;
}

/* Override paksaan dari Global CSS untuk Input yang kaku */
.lost-order-filter :deep(.fixed-input) {
  flex: 0 0 auto !important;
}
.lost-order-filter :deep(.gudang-input) {
  width: 180px !important;
}
.lost-order-filter :deep(.tgl-input) {
  width: 140px !important;
}

/* INI KUNCI UTAMA AGAR KOTAK SEARCH BISA MELAR: Nabrak CSS Global */
.lost-order-filter :deep(.flex-grow-input) {
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: none !important;
}
.lost-order-filter :deep(.flex-grow-input .v-input__control),
.lost-order-filter :deep(.flex-grow-input .v-field) {
  width: 100% !important;
}
.lost-order-filter :deep(.keyword-input) {
  width: 100% !important;
  min-width: unset !important;
}

/* Penyesuaian ukuran font & height */
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

/* ── Tabel Data ──────────────────────────────────────────────────────────────── */
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

/* ── Resizable Header ────────────────────────────────────────────────────────── */
.resizable-header {
  position: relative;
  background-color: #0d47a1 !important; /* Biru DC */
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

/* Skin header ungu khusus tab lost order */
.resizable-header.resizable-indigo {
  background-color: #1a237e !important;
  border-bottom: 2px solid #1a237e !important;
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
</style>

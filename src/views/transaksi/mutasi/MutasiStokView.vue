<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import AppDataTable from "@/components/AppDataTable.vue";
import type { AxiosError } from "axios";

// Interface Header (Wajib untuk Resize)
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

interface MutasiStokHeader {
  Nomor: string;
  Tanggal: string;
  Jenis: string;
  NoSO: string;
  Invoice?: string;
  KdCus?: string;
  Customer?: string;
  Alamat?: string;
  Kota?: string;
  Keterangan?: string;
  Usr?: string;
}

interface MutasiStokDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Qty: number;
}

interface MasterItem {
  Nomor: string;
  [key: string]: unknown;
}

// --- Interface Data Export (Strict Type) ---
interface MutasiStokExportRow {
  Tanggal?: string | Date;
  [key: string]: unknown;
}

interface Cabang {
  kode: string;
  nama: string;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "45";

// --- State ---
const masterData = ref<MutasiStokHeader[]>([]);
const details = ref<Record<string, MutasiStokDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MutasiStokHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<Cabang[]>([]);
// const dialogDelete = ref(false);
// const isDeleting = ref(false);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang || "",
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "Nomor", width: 180, fixed: true },
  { title: "Tanggal", key: "Tanggal", width: 120 },
  { title: "Jenis Mutasi", key: "Jenis", width: 200 },
  { title: "No. SO", key: "NoSO", width: 180 },
  { title: "Invoice", key: "Invoice", width: 180 },
  { title: "Kd Cus", key: "KdCus", width: 120 },
  { title: "Customer", key: "Customer", width: 250 },
  { title: "Alamat", key: "Alamat", width: 350 },
  { title: "Kota", key: "Kota", width: 150 },
  { title: "Keterangan", key: "Keterangan", width: 250 },
  { title: "User", key: "Usr", width: 120 },
]);

const detailHeaders = [
  { title: "Kode Barang", key: "Kode", width: "150px" },
  { title: "Nama Barang", key: "Nama", width: "300px" },
  { title: "Ukuran", key: "Ukuran", width: "100px" },
  { title: "Qty", key: "Qty", align: "end", width: "100px" },
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
const handleRowClick = (_event: Event, { item }: { item: MutasiStokHeader }) => {
  selected.value = [item];
};

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/mutasi-stok/lookup/cabang");
    cabangList.value = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat daftar cabang.");
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get<MutasiStokHeader[]>("/mutasi-stok", { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    toast.error(msg || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);

  try {
    const response = await api.get<MutasiStokDetail[]>(`/mutasi-stok/details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data;
  } catch (error: unknown) {
    const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    toast.error(msg || `Gagal memuat detail untuk ${itemToLoad.Nomor}`);
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

// const handleDelete = () => {
//   if (!selectedRow.value) return;
//   dialogDelete.value = true;
// };

// const executeDelete = () => {
//   if (!selectedRow.value) return;

//   isDeleting.value = true;
//   api.delete(`/mutasi-stok/${selectedRow.value.Nomor}`)
//     .then(response => {
//       toast.success(response.data.message);
//       fetchMasterData();
//       selected.value = [];
//     })
//     .catch(error => {
//       const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
//       toast.error(msg || 'Gagal menghapus data.');
//     })
//     .finally(() => {
//       isDeleting.value = false;
//       dialogDelete.value = false;
//     });
// };

const printData = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].Nomor;
  const url = router.resolve({
    name: "Cetak Mutasi Stok",
    params: { nomor },
  }).href;
  window.open(url, "_blank");
};

// --- Helper Format Tanggal ---
const formatDateIndo = (dateString: string | Date) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

// --- Fungsi Export Data ---
const exportData = async (type: "header" | "detail") => {
  if (type === "header") {
    if (masterData.value.length === 0) {
      toast.warning("Tidak ada data header untuk diekspor.");
      return;
    }

    try {
      toast.info("Membuat file Excel Header...");
      // Format Header Data
      const formattedHeader = masterData.value.map((item: MutasiStokHeader) => ({
        ...item,
        Tanggal: item.Tanggal ? formatDateIndo(item.Tanggal) : "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Stok Header");
      XLSX.writeFile(workbook, "Export_Mutasi_Stok_Header.xlsx");
      toast.success("Header berhasil diekspor.");
    } catch (err: unknown) {
      const error = err as AxiosError<{ message?: string }>;
      toast.error(error.response?.data?.message || "Gagal membuat file Excel.");
    }
  } else if (type === "detail") {
    try {
      toast.info("Mengambil data detail dari server...");

      // [FIX] URL API HARUS SESUAI ROUTE BACKEND
      // Jika route backend ada di mutasiStokFormRoutes.js, gunakan prefix yang sesuai
      // Kemungkinan besar: '/mutasi-stok-form/export-details'
      const response = await api.get<MutasiStokExportRow[]>("/mutasi-stok-form/export-details", {
        params: filters,
      });

      if (response.data.length === 0) {
        toast.warning("Tidak ada data detail untuk diekspor.");
        return;
      }

      // Format Detail Data
      const formattedDetail = response.data.map((row: MutasiStokExportRow) => ({
        ...row,
        Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal) : "",
      }));

      // Setup Layout Excel
      const title = "LAPORAN DETAIL MUTASI STOK";
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

      // Auto Width
      const colWidths = tableHeaders.map((header) => ({ wch: header.length + 5 }));
      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Stok Detail");
      XLSX.writeFile(workbook, "Export_Mutasi_Stok_Detail.xlsx");
      toast.success("Detail berhasil diekspor.");
    } catch (error) {
      // Error handling
      let message = "Gagal mengekspor data detail.";
      if (error instanceof Error) message = error.message;
      // Handle Axios error structure if needed
      toast.error(message);
    }
  }
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Mutasi Stok" icon="mdi-swap-horizontal-bold">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-plus"
        @click="router.push({ name: 'MutasiStokCreate' })"
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
        @click="router.push({ name: 'MutasiStokEdit', params: { nomor: selectedRow?.Nomor } })"
      >
        Ubah
      </v-btn>
      <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        :disabled="!isSingleSelected" @click="handleDelete">Hapus</v-btn> -->
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-printer"
        @click="printData"
      >
        Cetak
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
        <span class="filter-label">Filter Periode:</span>
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

        <span class="filter-label ms-4">Cabang:</span>
        <v-select
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          class="cabang-field"
          :menu-props="{ class: 'kr-red' }"
        />

        <v-spacer />

        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="loading"
          class="btn-refresh"
          @click="fetchMasterData"
        />
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
            <td>
              <template v-if="header.key === 'Tanggal'">
                {{ format(parseISO(item.Tanggal as string), "dd/MM/yyyy") }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0 expanded-cell">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">
                      <v-progress-circular indeterminate color="#b71c1c" size="24" />
                      <div class="mt-2 text-caption">Memuat detail...</div>
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
                      <template #bottom></template>
                    </v-data-table>
                    <div
                      v-if="
                        !loadingDetails.has(item.Nomor) &&
                        (!details[item.Nomor] || details[item.Nomor].length === 0)
                      "
                      class="text-center py-2 text-caption"
                    >
                      Tidak ada data detail.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <!-- <v-dialog v-model="dialogDelete" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Yakin ingin menghapus Mutasi Stok nomor <strong>{{ selectedRow?.Nomor }}</strong>?
          <br />
          Tindakan ini tidak dapat dibatalkan.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogDelete = false" :disabled="isDeleting">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="executeDelete" :loading="isDeleting">
            Ya, Hapus
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog> -->
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
.filter-section .cabang-field {
  flex: none;
  width: 220px;
}

.filter-section .periode-field :deep(.v-field),
.filter-section .cabang-field :deep(.v-field) {
  width: 100%;
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}
.filter-section .periode-field :deep(.v-field__outline),
.filter-section .cabang-field :deep(.v-field__outline) {
  display: none !important;
}
.filter-section .periode-field :deep(.v-field--focused),
.filter-section .cabang-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.filter-section .cabang-field :deep(.v-field__append-inner .v-icon) {
  color: #b71c1c !important;
}

.btn-refresh {
  color: #b71c1c !important;
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

/* Sel data (sel baris expand dikecualikan supaya padding-nya tetap 0) */
.desktop-table :deep(td:not(.expanded-cell)) {
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

/* Header kustom (resize kolom) */
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

/* ══════════ DETAIL (EXPAND) ══════════ */
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
  max-width: 600px;
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

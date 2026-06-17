<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import ExcelJS from "exceljs";
import axios from "axios";

interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
  sortable?: boolean;
}

interface StokBahanItem {
  Kode: string;
  Nama: string;
  Satuan: string;
  Kategori: string;
  Jenis: string;
  Cabang: string;
  TotalMasuk: number;
  TotalKeluar: number;
  stok: number;
  [key: string]: string | number;
}

interface KartuStokItem {
  Referensi: string;
  Tanggal: string;
  Jenis: string;
  Cabang: string;
  Masuk: number;
  Keluar: number;
  Keterangan: string;
  User: string;
  NamaBarang: string;
  Satuan: string;
}

interface Cabang {
  kode: string;
  nama: string;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "513";

// --- State ---
const stokList = ref<StokBahanItem[]>([]);
const isLoading = ref(true);
const cabangList = ref<Cabang[]>([]);
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

// State Expandable Details
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, KartuStokItem[]>>({});

const filters = reactive({
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  jenis: "ALL",
  keyword: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  tampilkanKosong: false,
});

const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 40, fixed: true },
  { title: "Kode", key: "Kode", width: 140, fixed: true },
  { title: "Nama Barang", key: "Nama", width: 300, fixed: true },
  { title: "Satuan", key: "Satuan", width: 80, align: "center" },
  { title: "Jenis", key: "Jenis", width: 120, align: "center" },
  { title: "Cabang", key: "Cabang", width: 80, align: "center" },
  { title: "Total Masuk", key: "TotalMasuk", width: 110, align: "end" },
  { title: "Total Keluar", key: "TotalKeluar", width: 110, align: "end" },
  { title: "Stok", key: "stok", width: 90, align: "end" },
]);

const detailHeaders = [
  { title: "Tanggal", key: "Tanggal", width: "100px" },
  { title: "No. Referensi", key: "Referensi", width: "160px" },
  { title: "Cabang", key: "Cabang", width: "80px", align: "center" },
  { title: "Masuk", key: "Masuk", width: "80px", align: "end" },
  { title: "Keluar", key: "Keluar", width: "80px", align: "end" },
  { title: "Keterangan", key: "Keterangan", width: "250px" },
  { title: "User", key: "User", width: "100px" },
] as const;

// --- Resize ---
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
  resizingColumn.value.width = Math.max(50, startWidth.value + (e.pageX - startX.value));
};
const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", onResizeEnd);
  document.body.style.cursor = "";
};

// --- Debounce search ---
let searchTimeout: ReturnType<typeof setTimeout>;
const onSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(fetchData, 600);
};

// --- Fetch ---
const fetchCabangOptions = async () => {
  const res = await api.get("/laporan-stok-bahan/cabang-options");
  const allCabang = res.data;
  const userCabang = authStore.user?.cabang || "";
  const isStore = /^K\d+/.test(userCabang);

  if (isStore) {
    // Filter hanya KDC dan cabang sendiri
    cabangList.value = allCabang.filter(
      (c: { kode: string }) => c.kode === "KDC" || c.kode === userCabang
    );
  } else {
    cabangList.value = allCabang;
  }
};

const fetchData = async () => {
  isLoading.value = true;
  expanded.value = []; // reset expand
  try {
    const res = await api.get("/laporan-stok-bahan", { params: filters });
    stokList.value = res.data;
  } catch (e) {
    toast.error(axios.isAxiosError(e) ? e.response?.data?.message : "Gagal memuat data stok.");
  } finally {
    isLoading.value = false;
  }
};

// --- Fetch Details (Kartu Stok) ---
// Fungsi jembatan untuk menangani event expanded dari Vuetify dan mematuhi TypeScript
const handleExpandedChange = (newVal: StokBahanItem[]) => {
  // Ambil hanya array of Kode (string[]) untuk dilempar ke loadDetails
  const expandedKodes = newVal.map((item) => item.Kode);
  loadDetails(expandedKodes);
};

const loadDetails = async (newlyExpandedItems: readonly string[]) => {
  // newlyExpandedItems dalam Vuetify versi ini berisi array of string (yaitu item-value, dalam hal ini "Kode")
  // Kita cari ID (Kode) yang baru saja di-expand dan belum ada di details
  const kodeToLoad = newlyExpandedItems.find(
    (kode) => !details.value[kode] && !loadingDetails.value.has(kode)
  );

  if (!kodeToLoad) return;

  loadingDetails.value.add(kodeToLoad);
  try {
    const response = await api.get<KartuStokItem[]>(`/laporan-stok-bahan/kartu-stok`, {
      params: {
        kodeBarang: kodeToLoad, // Ini akan terbaca dengan benar di backend
        cabang: filters.cabang,
        tanggalAkhir: filters.tanggal,
      },
    });
    details.value[kodeToLoad] = response.data;
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.message || `Gagal memuat detail mutasi untuk ${kodeToLoad}`;
    toast.error(errorMessage);
  } finally {
    loadingDetails.value.delete(kodeToLoad);
  }
};

// --- Row color ---
const getRowClass = (item: StokBahanItem) => {
  if (item.stok < 0) return "row-minus";
  if (item.stok === 0) return "row-zero";
  return "";
};

// --- Jenis chip ---
const getJenisChip = (jenis: string) => {
  if (jenis === "OBAT") return { color: "purple-darken-1", icon: "mdi-pill" };
  if (jenis === "ACCESORIES") return { color: "teal-darken-2", icon: "mdi-package-variant" };
  return { color: "grey", icon: "mdi-help" };
};

// --- Export ---
const exportToExcel = async () => {
  if (!stokList.value.length) return toast.warning("Tidak ada data untuk diekspor.");
  isLoading.value = true;
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Stok Bahan");

    const colHeaders = [
      "Kode",
      "Nama Barang",
      "Satuan",
      "Kategori",
      "Jenis",
      "Cabang",
      "Total Masuk",
      "Total Keluar",
      "Stok",
    ];

    // Header row
    const headerRow = sheet.addRow(colHeaders);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
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

    // Data rows
    stokList.value.forEach((item) => {
      const row = sheet.addRow([
        item.Kode,
        item.Nama,
        item.Satuan,
        item.Kategori,
        item.Jenis,
        item.Cabang,
        item.TotalMasuk,
        item.TotalKeluar,
        item.stok,
      ]);
      const isRed = item.stok <= 0;
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        if (isRed) cell.font = { bold: true, color: { argb: "FFC62828" } };
      });
    });

    // Auto width
    sheet.columns.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? "").length;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 3, 50);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `StokBahan_${filters.cabang}_${filters.tanggal}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export berhasil.");
  } catch {
    toast.error("Gagal mengekspor data.");
  } finally {
    isLoading.value = false;
  }
};

// --- Watchers ---
watch(
  () => [filters.cabang, filters.jenis, filters.tampilkanKosong, filters.tanggal],
  () => fetchData()
);

onMounted(() => {
  if (hasViewPermission.value) {
    fetchCabangOptions();
    fetchData();
  }
});
</script>

<template>
  <PageLayout title="Laporan Stok Bahan" desktop-mode icon="mdi-package-variant-closed">
    <template #header-actions>
      <v-btn
        size="small"
        color="teal"
        prepend-icon="mdi-file-excel"
        :loading="isLoading"
        @click="exportToExcel"
      >
        Export
      </v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <!-- Filter Bar -->
      <div class="filter-section">
        <div class="d-flex align-center gap-2 w-100">
          <!-- Cabang -->
          <v-select
            v-model="filters.cabang"
            :items="cabangList"
            item-title="nama"
            item-value="kode"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 160px; flex-shrink: 0"
          />

          <!-- Tanggal -->
          <v-text-field
            v-model="filters.tanggal"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 135px; flex-shrink: 0"
          />

          <!-- Jenis toggle -->
          <v-btn-toggle
            v-model="filters.jenis"
            density="compact"
            variant="outlined"
            divided
            mandatory
            style="flex-shrink: 0; height: 28px"
          >
            <v-btn value="ALL" size="small" style="height: 28px">Semua</v-btn>
            <v-btn value="ACCESORIES" size="small" style="height: 28px">
              <v-icon size="12" class="mr-1">mdi-package-variant</v-icon>Acc
            </v-btn>
            <v-btn value="OBAT" size="small" style="height: 28px">
              <v-icon size="12" class="mr-1">mdi-pill</v-icon>Obat
            </v-btn>
          </v-btn-toggle>

          <!-- Tampilkan kosong -->
          <v-checkbox
            v-model="filters.tampilkanKosong"
            label="Tampilkan Stok 0"
            density="compact"
            hide-details
            color="primary"
            style="flex-shrink: 0"
          />

          <!-- Search — flex-grow agar melebar -->
          <v-text-field
            v-model="filters.keyword"
            placeholder="Cari kode atau nama barang..."
            density="compact"
            hide-details
            variant="outlined"
            clearable
            prepend-inner-icon="mdi-magnify"
            style="flex: 1; min-width: 0"
            @input="onSearchInput"
            @click:clear="
              () => {
                filters.keyword = '';
                fetchData();
              }
            "
          />

          <!-- Legend -->
          <div
            class="d-flex align-center gap-1 text-caption font-weight-bold"
            style="flex-shrink: 0; white-space: nowrap"
          >
            <v-icon color="error" size="12">mdi-square-rounded</v-icon>
            <span class="text-error">Stok ≤ 0</span>
          </div>

          <!-- Refresh mentok kanan -->
          <v-btn
            icon="mdi-refresh"
            variant="text"
            size="small"
            :loading="isLoading"
            style="flex-shrink: 0; margin-left: auto"
            @click="fetchData"
          />
        </div>
      </div>

      <!-- Tabel -->
      <div class="table-container">
        <v-data-table
          :headers="headers"
          :items="stokList"
          :loading="isLoading"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          :items-per-page="-1"
          :row-props="(item: any) => ({ class: getRowClass(item.item) })"
          v-model:expanded="expanded"
          item-value="Kode"
          return-object
          show-expand
          @update:expanded="handleExpandedChange"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <th
                v-for="header in columns"
                :key="header.key ?? ''"
                :style="{
                  width: header.width + 'px',
                  minWidth: header.width + 'px',
                }"
                class="resizable-header"
                :class="{
                  'text-center': header.align === 'center',
                  'text-end': header.align === 'end',
                }"
                @click="header.key !== 'data-table-expand' ? toggleSort(header as any) : null"
              >
                <template v-if="header.key === 'data-table-expand'"></template>

                <template v-else>
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header as any)" size="13" class="ms-1">
                      {{ getSortIcon(header as any) }}
                    </v-icon>
                  </div>
                  <div
                    class="resizer"
                    @mousedown.stop="onResizeStart($event, header as any)"
                    @click.stop
                  />
                </template>
              </th>
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

          <template #[`item.Jenis`]="{ item }">
            <v-chip
              :color="getJenisChip(item.Jenis).color"
              size="x-small"
              variant="flat"
              class="font-weight-bold"
            >
              <v-icon start size="11">{{ getJenisChip(item.Jenis).icon }}</v-icon>
              {{ item.Jenis }}
            </v-chip>
          </template>

          <template #[`item.stok`]="{ item }">
            <span
              :class="{
                'text-error font-weight-bold': item.stok <= 0,
                'font-weight-bold': item.stok > 0,
              }"
            >
              {{ item.stok }}
            </span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Kode)" class="text-center pa-4 text-caption">
                      Memuat detail mutasi...
                    </div>
                    <v-data-table
                      v-else
                      :headers="detailHeaders"
                      :items="details[item.Kode] || []"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.Tanggal`]="{ item: dItem }">
                        {{ dItem.Tanggal ? format(new Date(dItem.Tanggal), "dd/MM/yyyy") : "" }}
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>

          <!-- Footer summary -->
          <template #bottom>
            <div class="table-footer pa-2 text-caption d-flex align-center gap-4">
              <span
                >Total item: <strong>{{ stokList.length }}</strong></span
              >
              <span>
                Total stok:
                <strong>{{ stokList.reduce((a, b) => a + (b.stok || 0), 0) }}</strong>
              </span>
            </div>
          </template>
        </v-data-table>
      </div>
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

.filter-section {
  flex-shrink: 0;
  padding: 6px 12px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

/* Override global CSS yang merusak v-btn-toggle */
.filter-section :deep(.v-btn-toggle .v-btn) {
  height: 28px !important;
  width: auto !important;
  min-width: 52px !important;
  padding: 0 8px !important;
  font-size: 11px !important;
}

.filter-section :deep(.v-btn-toggle) {
  height: 28px !important;
}

/* Checkbox tidak ikut dipaksa 28x28 */
.filter-section :deep(.v-checkbox .v-btn) {
  width: auto !important;
  height: auto !important;
}

.gap-1 {
  gap: 4px;
}
.gap-2 {
  gap: 8px;
}

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
  font-size: 11px !important;
  height: 30px !important;
  padding: 0 8px !important;
}

.resizable-header {
  position: relative;
  background-color: var(--table-head-bg) !important;
  color: var(--table-head-text) !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  padding: 0 8px !important;
  user-select: none;
  white-space: nowrap;
}

.header-content {
  display: flex;
  align-items: center;
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

.resizer:hover {
  border-right: 2px solid #1565c0;
}

:deep(tr.row-minus td) {
  color: #c62828 !important;
  font-weight: 700;
}
:deep(tr.row-zero td) {
  color: #757575 !important;
}

.table-footer {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.gap-2 {
  gap: 8px;
}

.rotate-180 {
  transform: rotate(180deg);
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
  max-width: 900px; /* Lebar area detail mutasi */

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-size: 11px !important;
}

.detail-table :deep(td) {
  font-size: 11px !important;
}
</style>

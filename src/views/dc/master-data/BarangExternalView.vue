<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import type { AxiosError } from "axios";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
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

interface Header {
  kode: string;
  nama: string;
  KtgProduk?: string;
  KtgBarang?: string;
  date_create?: string;
  otomatis?: string;
  adaStok: "Y" | "N";
  status: "AKTIF" | "PASIF";
  [key: string]: unknown;
}

interface DetailItem {
  kode: string;
  ukuran: string;
  barcode: string;
  harga: number;
  hpp?: number;
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "219";

// --- State ---
const masterData = ref<Header[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<Header[]>([]);
const expanded = ref<string[]>([]);
const fetchTimeout = ref<number | undefined>(undefined);

// --- Setup Session Storage ---
const STORAGE_KEY = "masterBarangExternalFilters";
const savedSession = sessionStorage.getItem(STORAGE_KEY);
const parsedSession = savedSession ? JSON.parse(savedSession) : null;

const filters = reactive({
  startDate: parsedSession?.startDate ?? format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: parsedSession?.endDate ?? format(new Date(), "yyyy-MM-dd"),
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
  { title: "KtgProduk", key: "KtgProduk", width: 120 },
  { title: "KtgBarang", key: "KtgBarang", width: 120 },
  { title: "Tgl Buat", key: "date_create", width: 110 },
  { title: "Otomatis", key: "otomatis", align: "center", width: 100 },
  { title: "Log Stok", key: "adaStok", align: "center", width: 100 },
  { title: "Status", key: "status", align: "center", width: 100 },
]);

const detailHeaders = computed<DataTableHeader[]>(() => {
  const baseHeaders: DataTableHeader[] = [
    { title: "Kode", key: "kode", width: 150 },
    { title: "Ukuran", key: "ukuran", width: 80 },
    { title: "Barcode", key: "barcode", width: 150 },
    { title: "Harga", key: "harga", align: "end", width: 100 },
  ];
  if (authStore.user?.cabang === "KDC") {
    baseHeaders.push({ title: "HPP", key: "hpp", align: "end", width: 100 });
  }
  return baseHeaders;
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));
const canEdit = computed(() => isSingleSelected.value);

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
  filters.search = "";
  sessionStorage.removeItem(STORAGE_KEY);
  fetchData();
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
const handleRowClick = (_event: Event, { item }: { item: Header }) => {
  selected.value = [item];
};

// --- Methods: Data ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/barang-external", { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: Header[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.kode] && !loadingDetails.value.has(item.kode)
  );
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.kode;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/barang-external/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (err) {
    toast.error(getErrorMessage(err, `Gagal memuat detail untuk ${nomorToLoad}`));
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const handleNew = () => router.push({ name: "BarangExternalCreate" });

const handleEdit = () => {
  if (!canEdit.value || !selectedRow.value) return;
  router.push({ name: "BarangExternalEdit", params: { kode: selectedRow.value.kode } });
};

const exportData = async (type: "header" | "detail") => {
  if (type === "header") {
    if (masterData.value.length === 0) return toast.warning("Tidak ada data header.");
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header Barang External");
    XLSX.writeFile(workbook, "Export_BarangExternal_Header.xlsx");
  } else if (type === "detail") {
    try {
      loading.value = true;
      const response = await api.get("/barang-external/export-details", { params: filters });
      if (response.data.length === 0) return toast.warning("Tidak ada data detail.");
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Barang External");
      XLSX.writeFile(workbook, "Export_BarangExternal_Detail.xlsx");
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mengekspor data detail."));
    } finally {
      loading.value = false;
    }
  }
};

const getRowTextColor = (item: Header) => {
  if (item.status === "PASIF") return "text-red font-weight-medium";
  if (item.adaStok === "N") return "text-blue font-weight-medium";
  return "";
};

onMounted(() => {
  if (!authStore.can(MENU_ID, "view")) {
    toast.error("Anda tidak memiliki hak akses.");
    router.push("/");
    return;
  }
  fetchData();
});

watch(
  filters,
  (newVal, oldVal) => {
    // Jika yang berubah adalah field 'search', gunakan timeout 500ms
    if (newVal.search !== oldVal.search) {
      if (fetchTimeout.value) clearTimeout(fetchTimeout.value);
      fetchTimeout.value = window.setTimeout(() => {
        fetchData();
      }, 500);
    } else {
      // Untuk filter lain (tanggal), langsung fetch tanpa jeda
      fetchData();
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
        search: filters.search,
        columnFilters: columnFilters.value,
      })
    );
  },
  { deep: true }
);
</script>

<template>
  <PageLayout title="Browse Master Barang External" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="handleNew"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        prepend-icon="mdi-pencil"
        :disabled="!canEdit"
        @click="handleEdit"
        >Ubah</v-btn
      >
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn
            v-if="authStore.can(MENU_ID, 'view')"
            size="small"
            color="teal"
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
        <v-label class="filter-label">Tanggal Buat:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
        />

        <v-text-field
          v-model="filters.search"
          label="Cari Kode atau Nama Barang..."
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4 search-field"
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
          @click="fetchData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="loading"
          class="ms-2"
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

                    <v-menu location="bottom start" :close-on-content-click="false">
                      <template #activator="{ props }">
                        <v-icon
                          v-bind="props"
                          size="16"
                          class="ms-1"
                          @click.stop
                          :color="isFilterActive(header.key) ? 'blue' : ''"
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
                      <template #[`item.harga`]="{ item: detail }">
                        {{ (detail.harga || 0).toLocaleString("id-ID") }}
                      </template>
                      <template
                        v-if="authStore.user?.cabang === 'KDC'"
                        #[`item.hpp`]="{ item: detail }"
                      >
                        {{ (detail.hpp || 0).toLocaleString("id-ID") }}
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
          <v-btn color="primary" @click="applyCustomFilter">Terapkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Layout Full Height */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Table Style */
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

/* Header Resize */
.resizable-header {
  position: relative;
  background-color: #e3f2fd !important;
  color: #0d47a1 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #1976d2 !important;
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
  border-right: 2px solid #1565c0;
}

/* Detail Sticky (Left) */
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
  max-width: 900px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-size: 11px !important;
  height: 32px !important;
}

.filter-menu {
  max-height: 300px;
  overflow-y: auto;
}

/* --- TOMBOL RESET FILTER --- */
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
/* Override agar filter-section tidak membiarkan item menyempit (konsisten dgn global theme) */
.filter-section {
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
}

/* Paksa search field tidak ikut menyempit meski flex container padat */
.filter-section .search-field {
  flex: 0 0 300px !important;
  min-width: 300px !important;
  max-width: 300px !important;
  margin-left: 8px;
}

.filter-section .search-field .v-input__control,
.filter-section .search-field .v-field {
  width: 100% !important;
  min-width: 100% !important;
}
</style>

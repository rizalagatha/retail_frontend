<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import type { AxiosError } from "axios";
import * as XLSX from "xlsx";
import { format } from "date-fns";
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

interface MasterItem {
  kode: string;
  nama: string;
  kategori: string;
  [key: string]: unknown; // Index signature untuk filter dinamis
}

interface DetailItem {
  ukuran: string;
  barcode: string;
  hpp: number;
  harga: number;
  laba: number;
}

interface VariantItem {
  ukuran: string;
  barcode: string;
  hpp: number;
  harga: number;
  laba?: number;
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "206";

// State Data Utama
const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const isExporting = ref(false);

// State Filter Server-Side
const search = ref("");
const filters = reactive({
  kategori: "All",
  hargaKosong: false,
});

// State Filter Client-Side & Resize
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: "", operator: "=", value: "" });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// State Update Modal
const isUpdateModalVisible = ref(false);
const isUpdating = ref(false);
const itemToUpdate = ref<MasterItem | null>(null);
const variantsToUpdate = ref<VariantItem[]>([]);
const hppPercentage = ref({ Kaosan: 0, Rezso: 0 });

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

// --- Header Definisi (Resizable) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Kategori", key: "kategori", width: 120 },
  { title: "Kode", key: "kode", width: 180 },
  { title: "Nama Barang", key: "nama", width: 400 },
]);

const detailHeaders = [
  { title: "Ukuran", key: "ukuran" },
  { title: "Barcode", key: "barcode" },
  { title: "HPP", key: "hpp", align: "end" },
  { title: "Harga Jual", key: "harga", align: "end" },
  { title: "Laba", key: "laba", align: "end" },
] as const;

const updateModalHeaders = [
  { title: "Ukuran", key: "ukuran" },
  { title: "HPP", key: "hpp", width: "200px" },
  { title: "Harga Jual", key: "harga", width: "200px" },
  { title: "Barcode", key: "barcode" },
];

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);

// --- Logic Filter Client-Side (Sama dengan SJ) ---
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

// --- Helper Methods Filter ---
const uniqueValues = (key: string): Array<string | number> => {
  return Array.from(
    new Set(
      masterData.value
        .map((i) => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== "")
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
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
  search.value = "";
  filters.kategori = "All";
  filters.hargaKosong = false;
  fetchMasterData(); // Refresh data server side juga
};

// --- Logic Resize ---
const onResizeStart = (e: MouseEvent, column: unknown) => {
  e.preventDefault();
  e.stopPropagation();

  // Cast dari unknown ke tipe interface kita
  const col = column as DataTableHeader;

  resizingColumn.value = col;
  startX.value = e.pageX;
  startWidth.value = typeof col.width === "number" ? col.width : 100;

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

// --- API Methods ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const params = { ...filters, search: search.value };
    const response = await api.get("/price-list", { params });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

// Cari fungsi loadDetails dan GANTI dengan ini:
const loadDetails = async (newlyExpandedItems: (MasterItem | string)[]) => {
  const lastItem = newlyExpandedItems[newlyExpandedItems.length - 1];
  if (!lastItem) return;

  const kode = typeof lastItem === "object" ? lastItem.kode : lastItem;
  if (details.value[kode] || loadingDetails.value.has(kode)) return;

  loadingDetails.value.add(kode);
  try {
    const response = await api.get(`/price-list/details/${kode}`);
    details.value[kode] = response.data;
  } catch (error: unknown) {
    // [FIX]
    let msg = `Gagal memuat detail untuk ${kode}`;
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  } finally {
    loadingDetails.value.delete(kode);
  }
};

// --- Logic Update Harga ---
const openUpdateModal = async (item: MasterItem | null) => {
  if (!item) return;
  itemToUpdate.value = item;

  if (details.value[item.kode]) {
    variantsToUpdate.value = JSON.parse(JSON.stringify(details.value[item.kode]));
    isUpdateModalVisible.value = true;
  } else {
    loading.value = true;
    try {
      const response = await api.get(`/price-list/details/${item.kode}`);
      details.value[item.kode] = response.data;
      variantsToUpdate.value = JSON.parse(JSON.stringify(response.data));
      isUpdateModalVisible.value = true;
    } catch (error: unknown) {
      // [FIX]
      let msg = `Gagal memuat detail untuk ${item.kode}`;
      if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
      toast.error(msg);
    } finally {
      loading.value = false;
    }
  }
};

const calculateHpp = (variant: VariantItem) => {
  const percentage =
    itemToUpdate.value?.kategori === "Rezso"
      ? hppPercentage.value.Rezso
      : hppPercentage.value.Kaosan;

  if (variant.harga > 0) {
    variant.hpp = Math.round((percentage / 100) * variant.harga);
  } else {
    variant.hpp = 0;
  }
};

const executeUpdate = async () => {
  if (!itemToUpdate.value) return;
  isUpdating.value = true;
  try {
    const payload = {
      kode: itemToUpdate.value.kode,
      variants: variantsToUpdate.value,
    };
    const response = await api.put("/price-list/update", payload);
    toast.success(response.data.message);
    details.value[itemToUpdate.value.kode] = JSON.parse(JSON.stringify(variantsToUpdate.value));
    isUpdateModalVisible.value = false;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengupdate harga.");
  } finally {
    isUpdating.value = false;
  }
};

const handleUpdateClick = () => {
  showConfirmation(
    "Konfirmasi Update",
    "Yakin ingin mengupdate harga untuk produk ini?",
    executeUpdate
  );
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleExport = async () => {
  isExporting.value = true;
  toast.info("Menyiapkan data excel...");

  try {
    // 1. Ambil data gabungan dari server dengan filter yang sedang aktif
    const params = { ...filters, search: search.value };
    const response = await api.get("/price-list/export", { params });
    const data = response.data;

    if (data.length === 0) {
      toast.warning("Tidak ada data untuk diekspor.");
      return;
    }

    // 2. Buat worksheet dari JSON
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 3. Atur lebar kolom agar rapi
    const wscols = [
      { wch: 15 }, // Kode
      { wch: 10 }, // Kategori
      { wch: 40 }, // Nama Barang
      { wch: 8 }, // Ukuran
      { wch: 15 }, // Barcode
      { wch: 12 }, // HPP
      { wch: 12 }, // Harga Jual
      { wch: 12 }, // Laba
    ];
    worksheet["!cols"] = wscols;

    // 4. Buat workbook dan simpan file
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PriceList");

    const fileName = `PriceList_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    toast.success("Excel berhasil didownload.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data ke excel.");
  } finally {
    isExporting.value = false;
  }
};

// --- Watchers & Hooks ---
let searchTimer: number;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    fetchMasterData();
  }, 400);
});

watch(
  filters,
  () => {
    fetchMasterData();
  },
  { deep: true }
);

onMounted(async () => {
  hppPercentage.value = { Kaosan: 70, Rezso: 60 };
  await fetchMasterData();
});
</script>

<template>
  <PageLayout title="Price List" icon="mdi-tag-multiple-outline">
    <template #header-actions>
      <v-btn
        size="small"
        color="teal"
        variant="flat"
        prepend-icon="mdi-file-excel"
        class="me-2"
        @click="handleExport"
        :loading="isExporting"
      >
        Export Excel
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        color="primary"
        prepend-icon="mdi-cash-edit"
        @click="openUpdateModal(selectedRow)"
        :disabled="!isSingleSelected"
      >
        Update Harga
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          placeholder="Cari Kode atau Nama..."
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="min-width: 250px; flex-grow: 1"
        />

        <v-divider vertical class="mx-2 hidden-sm-and-down" />

        <v-radio-group
          v-model="filters.kategori"
          inline
          hide-details
          density="compact"
          class="me-2"
        >
          <v-radio label="All" value="All"></v-radio>
          <v-radio label="Kaosan" value="Kaosan"></v-radio>
          <v-radio label="Rezso" value="Rezso"></v-radio>
        </v-radio-group>

        <v-checkbox v-model="filters.hargaKosong" label="Harga 0" hide-details density="compact" />

        <v-btn
          class="reset-filter-btn ms-4"
          color="error"
          variant="tonal"
          icon
          rounded="sm"
          @click="resetAllFilters"
          title="Reset Filter"
        >
          <v-icon size="20">mdi-filter-off</v-icon>
        </v-btn>
        <v-btn
          @click="fetchMasterData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          class="ms-1"
          color="primary"
          title="Refresh Data"
        />
      </div>

      <div class="table-container">
        <v-data-table
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="filteredList"
          :loading="loading"
          item-value="kode"
          class="desktop-table header-browse-blue"
          density="compact"
          fixed-header
          show-select
          single-select
          return-object
          show-expand
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  v-if="header.key === 'data-table-expand' || header.key === 'data-table-select'"
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
                          :color="isFilterActive(header.key!) ? 'blue' : undefined"
                          :icon="
                            filterType(header.key!) === 'custom'
                              ? 'mdi-filter-cog'
                              : filterType(header.key!) === 'multi'
                              ? 'mdi-filter-multiple'
                                  : 'mdi-filter-variant'
                            "
                        />
                      </template>
                      <v-list class="filter-menu" density="compact">
                        <v-list-item @click="clearColumnFilter(header.key!)">
                          <v-list-item-title class="text-caption font-weight-bold text-error">
                            (Clear Filter)
                          </v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item
                          v-for="val in uniqueValues(header.key!)"
                          :key="val"
                          @click="toggleMultiSelectValue(header.key!, val)"
                        >
                          <template #prepend>
                            <v-checkbox-btn
                              :model-value="!!columnFilters[header.key!]?.values?.includes(val)"
                              density="compact"
                            />
                          </template>
                          <v-list-item-title>{{ val }}</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click="openCustomFilter(header.key!)">
                          <v-list-item-title class="text-caption text-primary">
                            (Custom Filter...)
                          </v-list-item-title>
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
                      v-else-if="details[item.kode]"
                      :headers="detailHeaders"
                      :items="details[item.kode]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #bottom></template>
                    </v-data-table>

                    <div v-else class="text-center text-caption py-2">Tidak ada detail.</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </v-data-table>
      </div>
    </div>

    <v-dialog v-model="isUpdateModalVisible" max-width="1000px" persistent scrollable>
      <v-card>
        <v-toolbar color="primary" density="compact">
          <v-toolbar-title>Update Harga: {{ itemToUpdate?.nama }}</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" @click="isUpdateModalVisible = false" />
        </v-toolbar>
        <v-card-text>
          <v-data-table
            :headers="updateModalHeaders"
            :items="variantsToUpdate"
            class="desktop-table header-browse-blue"
            :items-per-page="-1"
          >
            <template #[`item.hpp`]="{ item }">
              <v-text-field
                v-model.number="item.hpp"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.harga`]="{ item }">
              <v-text-field
                v-model.number="item.harga"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
                @update:model-value="calculateHpp(item)"
              />
            </template>
            <template #bottom></template>
          </v-data-table>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn text @click="isUpdateModalVisible = false">Batal</v-btn>
          <v-btn color="primary" @click="handleUpdateClick" :loading="isUpdating"> Update </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
          >
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold">Custom Filter</v-card-title>
        <v-card-text>
          <v-select
            v-model="customFilter.operator"
            :items="['=', '!=', 'contains', 'starts', 'ends']"
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
  display: flex;
  flex-direction: column;
  max-height: 100%;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
}

.desktop-table :deep(table) {
  height: auto !important;
  overflow-y: auto;
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

/* Detail Sticky */
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
  background-color: rgb(var(--v-theme-surface));
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

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.filter-menu {
  max-height: 300px;
  overflow-y: auto;
}

.reset-filter-btn {
  width: 40px;
  height: 40px;
  border-radius: 6px !important;
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}
</style>

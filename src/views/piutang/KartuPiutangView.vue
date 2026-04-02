<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import KartuPiutangDetailModal from "@/components/modal/KartuPiutangDetailModal.vue";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import { format } from "date-fns";
import axios from "axios";

// --- Interface Header (Wajib untuk Resize) ---
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

// --- Tipe Data ---
interface PiutangItem {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  nominalNota: number;
  terbayar: number;
  sisaPiutang: number;
  status: "Aktif" | "Pasif";
  [key: string]: string | number; // [PERBAIKAN] Ini halal dan disukai linter!
}

interface ColumnFilter {
  type: "simple" | "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

type FilterValue = string | number;

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "52";

const masterData = ref<PiutangItem[]>([]);
const loading = ref(true);
const cabangList = ref<{ kode: string; nama: string }[]>([]);
const dialogs = reactive({ customerSearch: false, detailModal: false });
const selected = ref<PiutangItem[]>([]);

const filters = reactive({
  // [PERBAIKAN] Tambahkan || "" agar selalu berupa string
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  customerKode: "",
  customerNama: "",
});

const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({
  key: "",
  operator: "=",
  value: "",
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<PiutangItem | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);
const canView = computed(() => authStore.can(MENU_ID, "view"));
const canViewDetail = computed(() => authStore.can(MENU_ID, "view"));
const filteredMasterData = computed(() => {
  let data = [...masterData.value];

  for (const key in columnFilters.value) {
    const filter = columnFilters.value[key];

    // MULTI SELECT
    if (filter.type === "multi" && filter.values) {
      data = data.filter((r) => filter.values!.includes(r[key]));
      continue;
    }

    // CUSTOM FILTER
    if (filter.type === "custom" && filter.operator) {
      const t = String(filter.value);

      data = data.filter((row) => {
        const val = row[key];
        if (val == null) return false;
        const v = String(val);

        switch (filter.operator) {
          case "=":
            return v == t;
          case "!=":
            return v != t;
          case ">":
            return Number(v) > Number(t);
          case ">=":
            return Number(v) >= Number(t);
          case "<":
            return Number(v) < Number(t);
          case "<=":
            return Number(v) <= Number(t);
          case "contains":
            return v.toLowerCase().includes(t.toLowerCase());
          case "starts":
            return v.toLowerCase().startsWith(t.toLowerCase());
          case "ends":
            return v.toLowerCase().endsWith(t.toLowerCase());
        }
      });
    }
  }

  return data;
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "Kode", key: "kode", width: 120, fixed: true },
  { title: "Nama Customer", key: "nama", width: 250 },
  { title: "Alamat", key: "alamat", width: 300 },
  { title: "Kota", key: "kota", width: 150 },
  { title: "Nominal Nota", key: "nominalNota", align: "end", width: 120 },
  { title: "Terbayar", key: "terbayar", align: "end", width: 120 },
  { title: "Sisa Piutang", key: "sisaPiutang", align: "end", width: 120 },
  { title: "Status", key: "status", align: "center", width: 100 },
]);

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
const handleRowClick = (_event: Event, { item }: { item: PiutangItem }) => {
  selected.value = [item];
};

// --- Logic Filters ---
const uniqueValues = (key: string) => {
  const set = new Set(
    masterData.value.map((r) => r[key]).filter((v) => v !== null && v !== undefined && v !== "")
  );
  return Array.from(set).sort();
};

const filterType = (key: string) => {
  if (!columnFilters.value[key]) return "";
  const f = columnFilters.value[key];
  if (f.type === "multi") return "multi";
  if (f.type === "custom") return "custom";
  return "simple";
};

const isFilterActive = (key: string) => Boolean(columnFilters.value[key]);

const clearColumnFilter = (key: string) => {
  delete columnFilters.value[key];
};

const toggleMultiSelectValue = (key: string, value: FilterValue) => {
  const f = columnFilters.value[key];

  if (!f || f.type !== "multi") {
    columnFilters.value[key] = { type: "multi", values: [value] };
    return;
  }

  const arr = f.values || [];

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
  columnFilters.value = {}; // reset semua excel-style filter
  selected.value = []; // bersihkan selected row

  // kalau mau reset customer filter:
  filters.customerKode = "";
  filters.customerNama = "";

  // kalau mau reset cabang juga:
  // filters.cabang = authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang;

  fetchMasterData(); // reload data
};

const formatFilterValue = (key: string, val: string | number | undefined | null): string => {
  // Kolom tanggal → format dd/MM/yyyy
  if (["tanggal", "tempo", "dateModified"].includes(key)) {
    if (!val) return "-";
    if (typeof val === "string" || typeof val === "number") {
      try {
        return format(new Date(val), "dd/MM/yyyy");
      } catch {
        return String(val);
      }
    }
  }

  // Default fallback
  return String(val ?? "-");
};

// --- Methods ---
const getRowTextColor = (item: PiutangItem) => {
  if (item.status === "Pasif") return "text-red font-weight-bold";
  return "";
};

const fetchCabangList = async () => {
  try {
    const response = await api.get("/kartu-piutang/lookup/cabang");
    cabangList.value = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal memuat daftar cabang.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg); // Cuma kirim string
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  try {
    const response = await api.get("/kartu-piutang", { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const onCustomerSelected = (customer: { kode: string; nama: string }) => {
  filters.customerKode = customer.kode;
  filters.customerNama = customer.nama;
  dialogs.customerSearch = false;
};

const handleViewDetails = () => {
  if (!canViewDetail.value) {
    toast.error("Anda tidak memiliki izin untuk melihat detail.");
    return;
  }
  if (isSingleSelected.value) {
    dialogs.detailModal = true;
  }
};

// --- Lifecycle & Watchers ---
onMounted(async () => {
  if (!canView.value) {
    loading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    masterData.value = [];
    return;
  }
  await fetchCabangList();
});

watch(
  filters,
  () => {
    if (!canView.value) {
      loading.value = false;
      masterData.value = [];
      return;
    }
    fetchMasterData();
  },
  { deep: true, immediate: true }
);
</script>

<template>
  <PageLayout title="Browse Kartu Piutang" icon="mdi-account-cash-outline">
    <template #header-actions> </template>

    <div v-if="!canView && !loading" class="state-container pa-4 text-center">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p>Anda tidak memiliki izin untuk melihat halaman ini.</p>
    </div>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Filter Customer:</v-label>
        <v-text-field
          v-model="filters.customerKode"
          placeholder="Semua Customer"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
          append-inner-icon="mdi-magnify"
          readonly
          @click="dialogs.customerSearch = true"
          clearable
          @click:clear="
            filters.customerKode = '';
            filters.customerNama = '';
          "
        />
        <v-text-field
          :model-value="filters.customerNama"
          readonly
          filled
          density="compact"
          hide-details
          style="max-width: 300px"
        />

        <v-label class="filter-label ms-4">Cabang:</v-label>
        <v-select
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 200px"
        />
        <v-spacer />
        <v-btn
          prepend-icon="mdi-filter-off"
          variant="tonal"
          color="red"
          class="btn-detail reset-filter-btn me-2"
          @click="resetAllFilters"
        >
          Reset Filter
        </v-btn>

        <v-btn
          color="primary"
          @click="handleViewDetails"
          :disabled="!isSingleSelected || !canViewDetail"
          prepend-icon="mdi-file-document-outline"
          variant="elevated"
          class="btn-detail"
        >
          Lihat Detail
        </v-btn>
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          :headers="headers"
          :items="filteredMasterData"
          :loading="loading"
          item-value="kode"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          single-select
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
                    <!-- Judul -->
                    <span>{{ header.title }}</span>

                    <!-- Sort Icon -->
                    <v-icon v-if="isSorted(header)" size="12" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>

                    <!-- FILTER ICON -->
                    <v-menu location="bottom start">
                      <template #activator="{ props }">
                        <v-icon
                          size="16"
                          v-bind="props"
                          class="ms-1"
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

                      <v-list class="filter-menu">
                        <v-list-item @click="clearColumnFilter(header.key)">
                          <v-list-item-title>(Select All)</v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <v-list-item
                          v-for="value in uniqueValues(header.key)"
                          :key="value"
                          @click.stop="toggleMultiSelectValue(header.key, value)"
                        >
                          <template #prepend>
                            <v-checkbox
                              :model-value="
                                columnFilters[header.key]?.type === 'multi' &&
                                columnFilters[header.key]?.values?.includes(value)
                              "
                              density="compact"
                              @click.stop="toggleMultiSelectValue(header.key, value)"
                            />
                          </template>

                          <v-list-item-title>
                            {{ formatFilterValue(header.key, value) }}
                          </v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <v-list-item @click="openCustomFilter(header.key)">
                          <v-list-item-title class="custom-filter-item"
                            >(Custom Filter…)</v-list-item-title
                          >
                        </v-list-item>
                      </v-list>
                    </v-menu>
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
            <td :class="getRowTextColor(item)">
              <template v-if="['nominalNota', 'terbayar', 'sisaPiutang'].includes(header.key)">
                {{ formatRupiah(item[header.key]) }}
              </template>
              <template v-else-if="header.key === 'status'">
                <v-chip
                  :color="item.status === 'Aktif' ? 'success' : 'error'"
                  size="small"
                  variant="tonal"
                >
                  {{ item.status }}
                </v-chip>
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>
        </AppDataTable>
      </div>
    </div>

    <CustomerSearchModal
      v-if="dialogs.customerSearch"
      :gudang="authStore.user?.cabang || ''"
      @close="dialogs.customerSearch = false"
      @customer-selected="onCustomerSelected"
    />
    <KartuPiutangDetailModal
      v-if="dialogs.detailModal && selectedRow"
      :customer-kode="selectedRow.kode"
      :cabang="filters.cabang"
      @close="dialogs.detailModal = false"
    />

    <!-- Custom Filter Dialog -->
    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-h6"> Custom Filter — {{ customFilter.key }} </v-card-title>

        <v-card-text>
          <v-select
            v-model="customFilter.operator"
            :items="[
              { title: ' = (sama dengan)', value: '=' },
              { title: ' ≠ (tidak sama)', value: '!=' },
              { title: ' > (lebih besar)', value: '>' },
              { title: ' ≥ (lebih besar sama)', value: '>=' },
              { title: ' < (lebih kecil)', value: '<' },
              { title: ' ≤ (lebih kecil sama)', value: '<=' },
              { title: ' contains', value: 'contains' },
              { title: ' starts with', value: 'starts' },
              { title: ' ends with', value: 'ends' },
            ]"
            label="Operator"
            density="compact"
            hide-details
          />

          <v-text-field
            v-model="customFilter.value"
            label="Value"
            density="compact"
            hide-details
            autofocus
          />
        </v-card-text>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="customFilterDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 12px;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
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

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.filter-section .v-btn.btn-detail {
  height: 36px !important;
  /* Kembalikan tinggi normal */
  width: auto !important;
  /* Lebar otomatis sesuai teks */
  min-width: 120px !important;
  /* Lebar minimal agar enak dilihat */
  padding: 0 16px !important;
  /* Kembalikan padding */
  font-size: 0.875rem !important;
  /* Ukuran font normal */
}

.filter-menu {
  padding: 6px 0 !important;
  font-size: 11px !important;
}

.filter-menu .v-list-item {
  min-height: 26px !important;
  padding: 2px 10px !important;
}

.filter-menu .v-list-item-title {
  font-size: 11px !important;
}

.filter-menu .v-list-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.12) !important;
}

.filter-menu .v-checkbox {
  margin-right: 6px !important;
}

.custom-filter-item {
  font-weight: 600;
  font-size: 11px;
  color: rgb(var(--v-theme-primary));
}

.v-card-title {
  font-size: 14px !important;
}

.v-card-text {
  font-size: 13px !important;
}

.reset-filter-btn {
  height: 36px !important;
  min-width: 120px !important;
  padding: 0 16px !important;
  font-size: 0.875rem !important;
  text-transform: none !important;

  color: rgb(var(--v-theme-error)) !important;
  background-color: rgba(var(--v-theme-error), 0.18) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(var(--v-theme-error), 0.28) !important;
}
</style>

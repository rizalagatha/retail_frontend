<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import axios from "axios";

// Interface Header (Resize & Filter)
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

interface LogHeader {
  id: string; // Gunakan tanggal sebagai ID
  Tanggal: string;
  WaktuMulai: string;
  WaktuSelesai: string;
  PanjangCm: number;
  LebarCm: number;
  Qty: number;
  [key: string]: unknown;
}

interface LogDetail {
  TaskName: string;
  WaktuMulai: string;
  WaktuSelesai: string;
  Material: string;
  PanjangCm: number;
  LebarCm: number;
  Qty: number;
  Status: string;
  NoSO: string;
  Cabang: string;
  User: string;
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

interface RawLogRow {
  tanggal: string;
  waktu_mulai: string;
  waktu_selesai: string;
  panjang_m: number | string;
  lebar_m: number | string;
  qty_copy: number;
  nama_file: string;
  material: string;
  status_print: string;
  nomor_so: string;
  cabang: string;
  user_import: string;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "62";

// --- State ---
const list = ref<LogHeader[]>([]);
const details = ref<{ [key: string]: LogDetail[] }>({});
const isLoading = ref(true);
const selected = ref<LogHeader[]>([]);
const expanded = ref<string[]>([]);
const isMounted = ref(false);
const cabangList = ref<{ kode: string; nama: string }[]>([]);

// Upload State
const isUploadDialogVisible = ref(false);
const uploadFile = ref<File | null>(null);
const isUploading = ref(false);

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  search: "",
});

const filterOptions = ref([
  { title: "Task Name / File", value: "nama_file" },
  { title: "Terhubung No. SO", value: "nomor_so" },
]);
const selectedFilterField = ref("nama_file");
const filterSearchValue = ref("");

// --- Computed Properties ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const hasInsertPermission = computed(() => authStore.can(MENU_ID, "insert"));

const filteredList = computed(() => {
  let data = [...list.value];

  // 1) FILTER HEADER (Kolom)
  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    if (f.type === "multi" && f.values) {
      data = data.filter((row) => f.values!.includes(row[key] as string | number));
    }

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
        }
      });
    }
  }
  return data;
});

// --- Header Definisi (Resize) ---
const headers = computed<DataTableHeader[]>(() => {
  return [
    { title: "", key: "data-table-expand", width: 50, fixed: true },
    { title: "Tanggal", key: "Tanggal", width: 150, fixed: true },
    { title: "Mulai (Min)", key: "WaktuMulai", width: 120 },
    { title: "Selesai (Max)", key: "WaktuSelesai", width: 120 },
    { title: "Total Panjang (cm)", key: "PanjangCm", width: 160 },
    { title: "Total Lebar (cm)", key: "LebarCm", width: 160 },
    { title: "Total Qty", key: "Qty", width: 120 },
  ];
});

const detailHeaders = [
  { title: "Task Name / File", key: "TaskName", width: "250px" },
  { title: "Waktu Mulai", key: "WaktuMulai", width: "100px" },
  { title: "Waktu Selesai", key: "WaktuSelesai", width: "100px" },
  { title: "Material", key: "Material", width: "150px" },
  { title: "P (cm)", key: "PanjangCm", width: "80px" },
  { title: "L (cm)", key: "LebarCm", width: "80px" },
  { title: "Qty", key: "Qty", width: "70px" },
  { title: "Status", key: "Status", width: "90px" },
  { title: "Terhubung No. SO", key: "NoSO", width: "160px" },
  { title: "User", key: "User", width: "120px" },
] as const;

// --- Logic Filtering Header (Sama Persis Format SC) ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: "", operator: "=", value: "" });

const uniqueValues = (key: string): Array<string | number> => {
  return Array.from(
    new Set(
      list.value
        .map((i) => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== "")
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
};

const formatFilterValue = (key: string, val: string | number) => {
  if (!val) return "-";
  if (key === "Tanggal") {
    try {
      return format(parseISO(String(val)), "dd/MM/yyyy");
    } catch {
      return val;
    }
  }
  return val;
};

const filterType = (key: string) => columnFilters.value[key]?.type ?? "";
const isFilterActive = (key: string) => Boolean(columnFilters.value[key]);
const clearColumnFilter = (key: string) => delete columnFilters.value[key];

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
  filterSearchValue.value = "";
};

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

// --- Methods Fetch & Upload ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/warehouses/so-dtf-branches", {
      params: { userCabang: authStore.user?.cabang },
    });
    const userCabang = authStore.user?.cabang || "";
    if (userCabang === "KDC" || userCabang === "K06") {
      cabangList.value = [{ kode: "ALL", nama: "SEMUA CABANG" }, ...response.data];
    } else {
      cabangList.value = response.data;
    }
  } catch {
    console.error("Gagal memuat cabang.");
  }
};

const fetchData = async () => {
  if (!filters.startDate || !filters.endDate) return;
  isLoading.value = true;
  try {
    const response = await api.get("/dtf-machine-log", {
      params: {
        ...filters,
        // Gunakan parameter pencarian global yang baru
        search: filterSearchValue.value,
      },
    });

    const rawData = response.data;
    const masterMap = new Map<string, LogHeader>();
    const detailMap: { [key: string]: LogDetail[] } = {};

    // Logic Grouping Otomatis ke Header-Detail
    rawData.forEach((row: RawLogRow) => {
      const dateKey = row.tanggal;
      if (!masterMap.has(dateKey)) {
        masterMap.set(dateKey, {
          id: dateKey,
          Tanggal: row.tanggal,
          WaktuMulai: row.waktu_mulai,
          WaktuSelesai: row.waktu_selesai,
          PanjangCm: 0,
          LebarCm: 0,
          Qty: 0,
        });
        detailMap[dateKey] = [];
      }

      const master = masterMap.get(dateKey)!;

      if (row.waktu_mulai && row.waktu_mulai < master.WaktuMulai)
        master.WaktuMulai = row.waktu_mulai;
      if (row.waktu_selesai && row.waktu_selesai > master.WaktuSelesai)
        master.WaktuSelesai = row.waktu_selesai;

      master.PanjangCm += (Number(row.panjang_m) || 0) * 100;
      master.LebarCm += (Number(row.lebar_m) || 0) * 100;
      master.Qty += Number(row.qty_copy) || 0;

      detailMap[dateKey].push({
        TaskName: row.nama_file,
        WaktuMulai: row.waktu_mulai,
        WaktuSelesai: row.waktu_selesai,
        Material: row.material,
        PanjangCm: (Number(row.panjang_m) || 0) * 100,
        LebarCm: (Number(row.lebar_m) || 0) * 100,
        Qty: row.qty_copy,
        Status: row.status_print,
        NoSO: row.nomor_so,
        Cabang: row.cabang,
        User: row.user_import,
      });
    });

    list.value = Array.from(masterMap.values()).sort(
      (a, b) => new Date(b.Tanggal).getTime() - new Date(a.Tanggal).getTime()
    );
    details.value = detailMap;

    // Kosongkan agar defaultnya menutup
    expanded.value = [];
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal memuat data log mesin.");
    } else {
      toast.error("Gagal memuat data log mesin.");
    }
  } finally {
    isLoading.value = false;
  }
};

const handleUpload = async () => {
  if (!uploadFile.value) return toast.warning("Pilih file Excel/CSV terlebih dahulu.");
  isUploading.value = true;
  const formData = new FormData();
  formData.append("file", uploadFile.value);

  try {
    const response = await api.post("/dtf-machine-log/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    toast.success(response.data.message || "Import berhasil.");
    isUploadDialogVisible.value = false;
    uploadFile.value = null;
    fetchData();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal mengimport file.");
    } else {
      toast.error("Gagal mengimport file.");
    }
  } finally {
    isUploading.value = false;
  }
};

// Formatter Desimal (cm)
const formatCm = (val: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(val);

let fetchTimeout: number;
watch(
  [filters, filterSearchValue],
  () => {
    clearTimeout(fetchTimeout);
    fetchTimeout = window.setTimeout(fetchData, 400);
  },
  { deep: true }
);

onMounted(async () => {
  if (hasViewPermission.value) {
    await fetchCabangList();
    fetchData();
    isMounted.value = true;
  }
});
</script>

<template>
  <PageLayout title="Log Mesin DTF" desktop-mode icon="mdi-printer-3d">
    <template #header-actions>
      <v-btn
        v-if="hasInsertPermission"
        size="small"
        color="success"
        prepend-icon="mdi-file-excel"
        @click="isUploadDialogVisible = true"
      >
        Import Excel Log
      </v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container text-center pt-10">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section px-2">
        <div class="d-flex align-center ga-1" style="flex-wrap: nowrap">
          <v-text-field
            v-model="filters.startDate"
            type="date"
            label="Dari"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 130px"
          />
          <v-text-field
            v-model="filters.endDate"
            type="date"
            label="S/D"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 130px"
          />
          <v-select
            v-model="filters.cabang"
            :items="cabangList"
            item-title="nama"
            item-value="kode"
            label="Cabang"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 150px"
          />
        </div>

        <v-divider vertical class="mx-1" />

        <div class="d-flex align-center ga-1">
          <v-select
            v-model="selectedFilterField"
            :items="filterOptions"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 170px"
          />
          <v-text-field
            v-model="filterSearchValue"
            label="Pencarian Global..."
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 180px"
            clearable
            prepend-inner-icon="mdi-magnify"
          />
        </div>

        <v-btn
          color="error"
          variant="tonal"
          size="small"
          icon="mdi-filter-off"
          class="ms-1 reset-filter-btn"
          title="Reset Filter"
          @click="resetAllFilters"
        />

        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="filteredList"
          :loading="isLoading"
          item-value="id"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-expand
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
                  <div class="header-content" :class="header.align === 'end' ? 'justify-end' : ''">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="14">{{ getSortIcon(header) }}</v-icon>

                    <v-menu location="bottom start">
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
                      <v-list class="filter-menu">
                        <v-list-item @click.stop="clearColumnFilter(header.key)">
                          <v-list-item-title>(Select All)</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item
                          v-for="val in uniqueValues(header.key)"
                          :key="val"
                          @click.stop="toggleMultiSelectValue(header.key, val)"
                        >
                          <template #prepend>
                            <v-checkbox
                              density="compact"
                              :model-value="columnFilters[header.key]?.values?.includes(val)"
                            />
                          </template>
                          <v-list-item-title>
                            {{ formatFilterValue(header.key, val) }}
                          </v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click.stop="openCustomFilter(header.key)">
                          <v-list-item-title class="custom-filter-item"
                            >(Custom Filter…)</v-list-item-title
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
              color="primary"
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
                <span class="font-weight-bold">{{
                  item.Tanggal ? format(parseISO(item.Tanggal as string), "dd/MM/yyyy") : "-"
                }}</span>
              </template>
              <template v-else-if="['PanjangCm', 'LebarCm', 'Qty'].includes(header.key)">
                {{ formatCm(Number(item[header.key] || 0)) }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <v-data-table
                      :headers="detailHeaders"
                      :items="details[item.id] || []"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.PanjangCm`]="{ item: dItem }">{{
                        formatCm(dItem.PanjangCm)
                      }}</template>
                      <template #[`item.LebarCm`]="{ item: dItem }">{{
                        formatCm(dItem.LebarCm)
                      }}</template>
                      <template #[`item.Status`]="{ item: dItem }">
                        <v-chip
                          :color="dItem.Status === 'OK' ? 'success' : 'error'"
                          size="x-small"
                          variant="tonal"
                          class="font-weight-bold"
                        >
                          {{ dItem.Status }}
                        </v-chip>
                      </template>
                      <template #[`item.NoSO`]="{ item: dItem }">
                        <span :class="dItem.NoSO ? 'text-blue font-weight-bold' : ''">{{
                          dItem.NoSO || "-"
                        }}</span>
                      </template>
                      <template #bottom></template>
                    </v-data-table>
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
        <v-card-title class="text-h6"> Custom Filter — {{ customFilter.key }} </v-card-title>
        <v-card-text>
          <v-select
            v-model="customFilter.operator"
            :items="[
              { title: '= (sama dengan)', value: '=' },
              { title: '≠ (tidak sama)', value: '!=' },
              { title: '>', value: '>' },
              { title: '≥', value: '>=' },
              { title: '<', value: '<' },
              { title: '≤', value: '<=' },
              { title: 'contains', value: 'contains' },
              { title: 'starts with', value: 'starts' },
              { title: 'ends with', value: 'ends' },
            ]"
            density="compact"
          />
          <v-text-field v-model="customFilter.value" density="compact" autofocus />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isUploadDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Import Log Mesin DTF</v-card-title>
        <v-card-text>
          <v-alert density="compact" type="info" variant="tonal" class="mb-4 text-caption">
            Sistem akan membaca data dari sheet "Task detail".
          </v-alert>
          <v-file-input
            v-model="uploadFile"
            label="Pilih File (.xlsx / .csv)"
            variant="outlined"
            density="compact"
            prepend-icon="mdi-file-excel"
            hide-details
            accept=".xlsx, .xls, .csv"
            :disabled="isUploading"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="grey-darken-1"
            variant="text"
            @click="isUploadDialogVisible = false"
            :disabled="isUploading"
            >Batal</v-btn
          >
          <v-btn color="success" variant="tonal" @click="handleUpload" :loading="isUploading"
            >Upload</v-btn
          >
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
  overflow-x: auto !important;
  overflow-y: auto !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* Header Resize SC */
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

.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid #1565c0;
}

/* Detail Sticky SC */
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
  max-width: 1050px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

/* Text Colors */
:deep(td.text-red) {
  color: red !important;
}
:deep(td.text-blue) {
  color: #1976d2 !important;
}

.state-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.reset-filter-btn {
  color: #d32f2f !important;
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}

.rotate-180 {
  transform: rotate(180deg);
}
</style>

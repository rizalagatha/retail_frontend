<script setup lang="ts">
import { ref, onMounted, computed, reactive } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO, isBefore } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
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

interface Promo {
  nomor: string;
  judul: string;
  tanggal1: string;
  tanggal2: string;
  jenis: string;
  totalRp: number;
  totalQty: number;
  diskonRp: number;
  diskonPersen: number;
  keterangan?: string;
  [key: string]: unknown;
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
const MENU_ID = "205";

// --- State ---
const dataList = ref<Promo[]>([]);
const selected = ref<Promo[]>([]);
const loading = ref(true);
const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => {} });

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: "", operator: "=", value: "" });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Header Definisi (Resizable) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-select", width: 50, fixed: true }, // Kolom checkbox (optional jika pakai single select)
  { title: "Nomor", key: "nomor", width: 150, fixed: true },
  { title: "Judul Promo", key: "judul", width: 250 },
  { title: "Tgl Mulai", key: "tanggal1", width: 110 },
  { title: "Tgl Selesai", key: "tanggal2", width: 110 },
  { title: "Jenis", key: "jenis", width: 120 },
  { title: "Total Rp", key: "totalRp", align: "end", width: 120 },
  { title: "Total Qty", key: "totalQty", align: "end", width: 100 },
  { title: "Diskon Rp", key: "diskonRp", align: "end", width: 120 },
  { title: "Diskon %", key: "diskonPersen", align: "end", width: 100 },
  { title: "Keterangan", key: "keterangan", width: 300 },
]);

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));

// --- Logic Filter Client-Side ---
const filteredList = computed(() => {
  let data = [...dataList.value];

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

// --- Methods: Filter Logic ---
const uniqueValues = (key: string): Array<string | number> => {
  return Array.from(
    new Set(
      dataList.value
        .map((i) => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== "")
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
};

const formatFilterValue = (key: string, val: string | number) => {
  if (!val) return "-";
  if (["tanggal1", "tanggal2"].includes(key)) {
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
const handleRowClick = (_event: Event, { item }: { item: Promo }) => {
  selected.value = [item];
};

// --- Methods: Data ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  try {
    const response = await api.get("/promo");
    dataList.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const handleNew = () => {
  router.push({ name: "PromoCreate" });
};

const handleEdit = () => {
  // [PERBAIKAN] Tangkap ke variabel lokal agar TS tahu ini tidak null
  const row = selectedRow.value;
  if (!row) return;

  router.push({
    name: "PromoEdit",
    params: { nomor: row.nomor },
  });
};

const handleDelete = () => {
  const row = selectedRow.value;
  if (!row) return;

  showConfirmation("Konfirmasi Hapus", `Yakin ingin menghapus promo: ${row.judul}?`, async () => {
    try {
      const response = await api.delete(`/promo/${row.nomor}`);
      toast.success(response.data.message);
      fetchData();
    } catch (error: unknown) {
      // [SOLUSI] Gunakan 'axios' global untuk mengecek, bukan instance 'api'
      let msg = "Gagal menghapus data.";

      if (axios.isAxiosError(error)) {
        // Di sini TypeScript otomatis tahu 'error' adalah AxiosError
        msg = error.response?.data?.message || msg;
      } else if (error instanceof Error) {
        // Antisipasi jika error-nya bukan dari network (misal coding error)
        msg = error.message;
      }

      toast.error(msg);
    }
  });
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const exportData = () => {
  if (dataList.value.length === 0) return toast.warning("Tidak ada data untuk diexport.");
  const worksheet = XLSX.utils.json_to_sheet(dataList.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Promo");
  XLSX.writeFile(workbook, "Export_Promo.xlsx");
};

const getRowTextColor = (item: Promo) => {
  if (isBefore(parseISO(item.tanggal2), new Date())) {
    return "text-red font-weight-medium"; // Expired
  }
  return "";
};

onMounted(fetchData);
</script>

<template>
  <PageLayout title="Browse Promo" icon="mdi-gift-outline">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        prepend-icon="mdi-plus"
        color="primary"
        @click="handleNew"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        prepend-icon="mdi-pencil"
        @click="handleEdit"
        :disabled="!isSingleSelected"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        prepend-icon="mdi-delete"
        color="error"
        @click="handleDelete"
        :disabled="!isSingleSelected"
        >Hapus</v-btn
      >
      <v-btn size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel"
        >Export</v-btn
      >
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-spacer />

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
          :headers="headers"
          :items="filteredList"
          :loading="loading"
          :item-class="getRowTextColor"
          item-value="nomor"
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
                  v-if="header.key === 'data-table-select'"
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

          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td :class="getRowTextColor(item)">
              <template v-if="['tanggal1', 'tanggal2'].includes(header.key)">
                {{
                  item[header.key] ? format(parseISO(String(item[header.key])), "dd/MM/yyyy") : ""
                }}
              </template>
              <template v-else-if="['totalRp', 'diskonRp'].includes(header.key)">
                {{ (item[header.key] || 0).toLocaleString("id-ID") }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
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

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            color="error"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya, Hapus</v-btn
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

.filter-menu {
  max-height: 300px;
  overflow-y: auto;
}

/* 1. Efek Hover pada Baris */
:deep(.v-data-table__tr):hover {
  background-color: #f5f5f5 !important;
  /* Abu-abu sangat muda saat di-hover */
  cursor: pointer;
  /* Ubah kursor jadi telunjuk */
}

/* 2. Efek Baris Terpilih (Selected) */
:deep(.v-data-table__tr--selected) {
  background-color: #bbdefb !important;
  /* Biru muda (Blue 100) agar terlihat jelas */
}

/* 3. Pastikan teks tetap terbaca saat selected (opsional) */
:deep(.v-data-table__tr--selected:hover) {
  background-color: #90caf9 !important;
  /* Biru sedikit lebih gelap saat selected di-hover */
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
</style>

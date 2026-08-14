<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, subDays } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import AppDataTable from "@/components/AppDataTable.vue";
import * as XLSX from "xlsx";
import { AxiosError } from "axios";

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

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

interface ManifestKirimHeader {
  Nomor: string;
  Tanggal: string;
  Gudang: string;
  NamaGudang?: string;
  JenisKirim: string;
  Driver: string;
  PlatNomor: string;
  Ekspedisi: string;
  NoResi: string;
  TotalSj: number;
  TotalKoli: number;
  TotalQty: number;
  BeratKg?: number;
  Keterangan?: string;
  Status: string;
  Usr?: string;
  DateCreate?: string;
  [key: string]: unknown;
}

interface ManifestKirimItem {
  idDrec?: string;
  manifestNomor?: string;
  sjNomor: string;
  sjTanggal?: string;
  storeKode: string;
  storeNama?: string;
  koli: number;
  qty: number;
  keterangan?: string;
  [key: string]: unknown;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "227";

// --- State ---
const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  gudang: authStore.userCabang || "KDC",
  status: "",
  search: "",
});
const loading = reactive({ master: false });
const manifestList = ref<ManifestKirimHeader[]>([]);
const selected = ref<ManifestKirimHeader[]>([]);
const expanded = ref<string[]>([]);
const details = ref<Record<string, ManifestKirimItem[]>>({});
const loadingDetails = ref(new Set<string>());
const dialog = reactive({ confirm: false });
const confirmAction = ref<(() => void) | null>(null);
const confirmText = ref("");

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: "", operator: "=", value: "" });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));

// --- Header Definisi (Resizable) ---
const masterHeaders = computed<DataTableHeader[]>(() => [
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "No. Manifest", key: "Nomor", width: 160, fixed: true },
  { title: "Tanggal", key: "Tanggal", width: 110 },
  { title: "Gudang", key: "NamaGudang", width: 140 },
  { title: "Jenis Kirim", key: "JenisKirim", width: 140 },
  { title: "Driver", key: "Driver", width: 140 },
  { title: "No. Plat", key: "PlatNomor", width: 120 },
  { title: "Ekspedisi", key: "Ekspedisi", width: 160 },
  { title: "No. Resi", key: "NoResi", width: 150 },
  { title: "Total SJ", key: "TotalSj", width: 90, align: "end" },
  { title: "Total Koli", key: "TotalKoli", width: 100, align: "end" },
  { title: "Total Qty", key: "TotalQty", width: 100, align: "end" },
  { title: "Status", key: "Status", width: 110, align: "center" },
  { title: "User", key: "Usr", width: 100 },
]);

const detailHeaders: DataTableHeader[] = [
  { title: "No. SJ", key: "sjNomor", width: 160 },
  { title: "Tgl. SJ", key: "sjTanggal", width: 110 },
  { title: "Kode Store", key: "storeKode", width: 100 },
  { title: "Nama Store", key: "storeNama", width: 200 },
  { title: "Jml Koli", key: "koli", width: 90, align: "end" },
  { title: "Total Qty", key: "qty", width: 100, align: "end" },
  { title: "Keterangan", key: "keterangan", width: 200 },
];

// --- Logic Filter Client-Side ---
const filteredList = computed(() => {
  let data = [...manifestList.value];

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
      manifestList.value
        .map((i) => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== "")
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
};

const formatFilterValue = (key: string, val: string | number) => {
  if (!val) return "-";
  if (key === "Tanggal") {
    try {
      return format(new Date(String(val)), "dd-MM-yyyy");
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
  filters.search = "";
  filters.status = "";
  loadData();
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
const handleRowClick = (_event: Event, { item }: { item: ManifestKirimHeader }) => {
  selected.value = [item];
};

// --- Methods: Data ---
const loadData = async () => {
  loading.master = true;
  manifestList.value = [];
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get<ManifestKirimHeader[]>("/manifest-kirim", {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        gudang: filters.gudang,
        status: filters.status,
        search: filters.search,
      },
    });
    manifestList.value = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data manifest kirim.");
  } finally {
    loading.master = false;
  }
};

const loadDetails = async (newlyExpandedItems: ManifestKirimHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get<{ header: ManifestKirimHeader; items: ManifestKirimItem[] }>(
      `/manifest-kirim/${encodeURIComponent(nomorToLoad)}`
    );
    details.value[nomorToLoad] = response.data.items || [];
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    details.value[nomorToLoad] = [];
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const createNew = () => {
  router.push("/gudang-dc/operasional/manifest-kirim/create");
};

const handleEdit = () => {
  if (!selectedRow.value) return;
  router.push(`/gudang-dc/operasional/manifest-kirim/create?nomor=${encodeURIComponent(selectedRow.value.Nomor)}`);
};

const showDeleteConfirmation = () => {
  if (!selectedRow.value) return;
  confirmAction.value = executeDelete;
  confirmText.value = `Apakah Anda yakin ingin menghapus Manifest Kirim nomor ${selectedRow.value.Nomor}? Surat Jalan terkait akan dilepaskan.`;
  dialog.confirm = true;
};

const executeDelete = async () => {
  if (!selectedRow.value) return;
  try {
    const response = await api.delete<{ message: string }>(
      `/manifest-kirim/${encodeURIComponent(selectedRow.value.Nomor)}`
    );
    toast.success(response.data.message || "Manifest kirim berhasil dihapus.");
    loadData();
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menghapus manifest.");
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "DRAFT":
      return "grey";
    case "DIKIRIM":
      return "blue";
    case "SELESAI":
      return "green";
    case "BATAL":
      return "red";
    default:
      return "grey";
  }
};

// Helper Format Tanggal Indonesia
const formatDateIndo = (dateString: string | Date | null | undefined) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

// Helper Auto Width Columns
const getAutoColumnWidth = (data: Record<string, unknown>[]) => {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map((key) => ({
    wch: Math.max(key.length + 5, 15),
  }));
};

// Export Data Excel
const exportData = (type: "header") => {
  if (type === "header") {
    if (manifestList.value.length === 0) {
      toast.warning("Tidak ada data header untuk diekspor.");
      return;
    }

    try {
      toast.info("Membuat file Excel Header...");

      const formattedHeader = manifestList.value.map((item) => ({
        ...item,
        Tanggal: item.Tanggal ? formatDateIndo(item.Tanggal) : "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);
      worksheet["!cols"] = getAutoColumnWidth(formattedHeader);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Manifest Header");
      XLSX.writeFile(workbook, "Export_Manifest_Kirim_Header.xlsx");
      toast.success("File Header berhasil dibuat.");
    } catch (error: unknown) {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message || "Gagal membuat file Excel.");
    }
  }
};

// Direct Print Logic
const handlePrintSelected = () => {
  if (!selectedRow.value) {
    toast.error("Pilih satu Manifest Kirim yang ingin dicetak.");
    return;
  }
  const nomor = selectedRow.value.Nomor;
  const routeData = router.resolve({
    name: "ManifestKirimPrint",
    params: { nomor },
  });
  window.open(routeData.href, "_blank");
};

onMounted(() => {
  if (authStore.can(MENU_ID, "view")) {
    loadData();
  } else {
    toast.error("Anda tidak memiliki hak akses untuk melihat data ini.");
    router.push("/");
  }
});

let debounceTimer: ReturnType<typeof setTimeout>;
watch(
  filters,
  () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadData();
    }, 500);
  },
  { deep: true }
);
</script>

<template>
  <PageLayout title="Manifest Pengiriman DC" icon="mdi-truck-cargo-container">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="createNew"
      >
        Baru
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="handleEdit"
      >
        Ubah
      </v-btn>
      <v-btn
        size="small"
        color="secondary"
        variant="outlined"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-printer"
        @click="handlePrintSelected"
      >
        Cetak
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-delete"
        @click="showDeleteConfirmation"
      >
        Hapus
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-divider vertical class="mx-2" />
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
        />
        <v-label class="filter-label mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
        />

        <v-select
          v-model="filters.status"
          :items="[
            { title: 'Semua Status', value: '' },
            { title: 'DRAFT', value: 'DRAFT' },
            { title: 'DIKIRIM', value: 'DIKIRIM' },
            { title: 'SELESAI', value: 'SELESAI' },
            { title: 'BATAL', value: 'BATAL' }
          ]"
          item-title="title"
          item-value="value"
          label="Status"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 150px"
        />

        <v-text-field
          v-model="filters.search"
          placeholder="Cari No. Manifest / Driver / Resi"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          hide-details
          clearable
          variant="outlined"
          style="max-width: 250px"
          class="ms-4"
          @keyup.enter="loadData"
        />

        <v-spacer />

        <v-btn
          class="reset-filter-btn ms-2"
          color="error"
          variant="tonal"
          icon
          title="Reset Filter"
          @click="resetAllFilters"
        >
          <v-icon size="18">mdi-filter-off</v-icon>
        </v-btn>

        <v-btn
          @click="loadData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          class="ms-2"
          title="Refresh Data"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="masterHeaders"
          :items="filteredList"
          :loading="loading.master"
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

          <template #[`item.Nomor`]="{ item }">
            <strong :style="{ color: getStatusColor(item.Status) }">{{ item.Nomor }}</strong>
          </template>

          <template #[`item.Tanggal`]="{ item }">
            {{ item.Tanggal ? format(new Date(item.Tanggal as string), "dd-MM-yyyy") : "-" }}
          </template>

          <template #[`item.NoResi`]="{ item }">
            <span class="font-weight-medium text-blue-darken-2">{{ item.NoResi || "-" }}</span>
          </template>

          <template #[`item.Status`]="{ item }">
            <v-chip size="x-small" :color="getStatusColor(item.Status)" class="font-weight-medium">
              {{ item.Status }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>

                    <v-data-table
                      v-else-if="details[item.Nomor]"
                      :headers="detailHeaders"
                      :items="details[item.Nomor]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.sjTanggal`]="{ item: detail }">
                        <span v-if="detail.sjTanggal">{{
                          format(new Date(detail.sjTanggal as string), "dd-MM-yyyy")
                        }}</span>
                        <span v-else class="text-grey text-caption">-</span>
                      </template>

                      <template #[`item.storeNama`]="{ item: detail }">
                        <span>{{ detail.storeNama || "-" }}</span>
                        <span v-if="detail.storeKode" class="text-grey text-caption ms-1"
                          >({{ detail.storeKode }})</span
                        >
                      </template>

                      <template #[`item.qty`]="{ item: detail }">
                        <span class="font-weight-medium text-primary">{{ detail.qty }}</span>
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

    <!-- Confirm Modal -->
    <v-dialog v-model="dialog.confirm" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi</v-card-title>
        <v-card-text>{{ confirmText }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialog.confirm = false">Tidak</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              confirmAction && confirmAction();
              dialog.confirm = false;
            "
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog Custom Filter -->
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
            label="Nilai Filter"
            density="compact"
            hide-details
            @keyup.enter="applyCustomFilter"
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

.rotate-180 {
  transform: rotate(180deg);
}

@media print {
  body * {
    visibility: hidden !important;
  }
  .print-area,
  .print-area * {
    visibility: visible !important;
  }
  .print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    padding: 8mm !important;
    background: #ffffff !important;
    color: #000000 !important;
    margin: 0 !important;
  }
  .no-print,
  .v-overlay-container {
    display: none !important;
  }
}
</style>

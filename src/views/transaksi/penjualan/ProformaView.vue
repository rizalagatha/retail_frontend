<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter, useRoute, onBeforeRouteLeave } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";

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

interface ProformaItem {
  nomor: string;
  tanggal: string;
  customer: string;
  nominal: number;
  tempo: string;
  keterangan: string;
  closing: "Y" | "N";
  [key: string]: unknown;
}

interface ProformaDetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  total: number;
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

type ExportRow = Record<string, unknown>;

interface SavedFilters {
  startDate?: string;
  endDate?: string;
  cabang?: string;
  search?: string;
  filterField?: string;
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "28";

const masterData = ref<ProformaItem[]>([]);
const details = ref<Record<string, ProformaDetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<ProformaItem[]>([]);
const expanded = ref<ProformaItem[]>([]);
const tableKey = ref(0);
const branchOptions = ref<{ kode: string; nama: string }[]>([]);
const isMounted = ref(false);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
});

const filterOptions = ref([
  { title: "Nomor", value: "nomor" },
  { title: "Customer", value: "customer" },
  { title: "Keterangan", value: "keterangan" },
]);
const selectedFilterField = ref("customer");
const filterSearchValue = ref("");

// --- Computed Properties ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<ProformaItem | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);

const canEdit = computed(() => isSingleSelected.value && selectedRow.value?.closing !== "Y");
const canCetak = computed(() => isSingleSelected.value);

// --- Logic Filtering ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({
  key: "",
  operator: "=",
  value: "",
});

const filteredList = computed(() => {
  let data = [...masterData.value];

  // 1) FILTER HEADER
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

  // 2) SEARCH GLOBAL
  if (filterSearchValue.value) {
    const key = selectedFilterField.value;
    data = data.filter((item) => {
      const v = item[key];
      return (
        v !== null &&
        v !== undefined &&
        String(v).toLowerCase().includes(filterSearchValue.value.toLowerCase())
      );
    });
  }

  return data;
});

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
  if (["tanggal", "tempo"].includes(key)) {
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

const handleRowClick = (event: Event, { item }: { item: ProformaItem }) => {
  // Klik pada checkbox / tombol expand punya aksinya sendiri, jangan ikut mengubah seleksi
  const target = event.target as HTMLElement | null;
  if (target?.closest(".v-selection-control, .v-btn")) return;

  selected.value = selectedRow.value?.nomor === item.nomor ? [] : [item];
};

// --- Header Definisi (Resize) ---
const headers = computed<DataTableHeader[]>(() => [
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "nomor", width: 160, fixed: true },
  { title: "Tanggal", key: "tanggal", width: 100 },
  { title: "Customer", key: "customer", width: 250 },
  { title: "Nominal", key: "nominal", align: "end", width: 120 },
  { title: "Tempo", key: "tempo", width: 100 },
  { title: "Keterangan", key: "keterangan", width: 250 },
  { title: "Closing", key: "closing", align: "center", width: 90 },
]);

const customFilterTitle = computed(
  () => headers.value.find((h) => h.key === customFilter.key)?.title ?? customFilter.key
);

const detailHeaders = [
  { title: "Kode", key: "kode", width: "100px" },
  { title: "Nama Barang", key: "nama", width: "300px" },
  { title: "Ukuran", key: "ukuran", width: "70px" },
  { title: "Jumlah", key: "jumlah", align: "end", width: "80px" },
  { title: "Harga", key: "harga", align: "end", width: "100px" },
  { title: "Total", key: "total", align: "end", width: "120px" },
] as const;

// --- Methods ---
const fetchBranchOptions = async () => {
  try {
    const response = await api.get("/proforma/branch-options");
    branchOptions.value = response.data;

    if (authStore.user?.cabang === "KDC") {
      const hasAll = branchOptions.value.some((c) => c.kode === "ALL");
      if (!hasAll) {
        branchOptions.value.unshift({ kode: "ALL", nama: "Semua Cabang" });
      }
    }
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat pilihan cabang.");
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/proforma", { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: ProformaItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor)
  );

  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get("/proforma/details", { params: { nomor: nomorToLoad } });
    details.value[nomorToLoad] = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || `Gagal memuat detail untuk ${nomorToLoad}.`);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const getRowTextColor = (item: ProformaItem) => {
  if (item.closing === "Y") return "text-grey";
  return "";
};

const handleNew = () => router.push({ name: "ProformaCreate" });
const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: "ProformaEdit", params: { id: selectedRow.value!.nomor } });
};
const handleCetak = () => {
  if (!canCetak.value) return;
  router.push({
    name: "ProformaEdit",
    params: { id: selectedRow.value!.nomor },
    query: { print: "true" },
  });
};

const formatDateIndo = (dateString: string | Date) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

const exportData = async (type: "header" | "detail") => {
  if (type === "header") {
    if (filteredList.value.length === 0)
      return toast.warning("Tidak ada data header untuk diexport.");

    const formattedData = filteredList.value.map((item) => ({
      ...item,
      tanggal: item.tanggal ? formatDateIndo(item.tanggal) : "",
      tempo: item.tempo ? formatDateIndo(item.tempo) : "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Proforma Invoice");
    XLSX.writeFile(workbook, "Export_Proforma_Header.xlsx");
  } else if (type === "detail") {
    try {
      const response = await api.get("/proforma/export-detail", { params: filters });
      if (response.data.length === 0)
        return toast.warning("Tidak ada data detail untuk diexport pada filter ini.");

      const dataToExport = (response.data as ExportRow[]).map((row) => ({
        ...row,
        Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal as string) : "",
      }));

      const title = "LAPORAN DETAIL PROFORMA INVOICE";
      const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(
        filters.endDate
      )}`;
      const tableHeaders = Object.keys(dataToExport[0]);
      const tableData = dataToExport.map((row) => Object.values(row));

      const excelData = [[title], [dateRange], [], tableHeaders, ...tableData];
      const worksheet = XLSX.utils.aoa_to_sheet(excelData);

      const merge = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } },
      ];
      worksheet["!merges"] = merge;

      const colWidths = tableHeaders.map((header) => ({ wch: header.length + 5 }));
      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Proforma Invoice");
      XLSX.writeFile(workbook, "Export_Proforma_Detail.xlsx");
    } catch (error: unknown) {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message || "Gagal mengekspor data detail.");
    }
  }
};

const STORAGE_KEY = "proforma_browse_filters";

onMounted(async () => {
  if (hasViewPermission.value) {
    if (authStore.user?.cabang !== "KDC") {
      filters.cabang = authStore.user?.cabang || "";
    } else {
      if (!filters.cabang) filters.cabang = "ALL";
    }

    const savedFilters = sessionStorage.getItem(STORAGE_KEY);
    if (savedFilters) {
      const parsed = JSON.parse(savedFilters) as SavedFilters;

      if (parsed.startDate) filters.startDate = parsed.startDate;
      if (parsed.endDate) filters.endDate = parsed.endDate;
      // Cabang hanya boleh dipulihkan untuk KDC; cabang lain terkunci ke cabangnya sendiri
      if (authStore.user?.cabang === "KDC" && parsed.cabang) filters.cabang = parsed.cabang;

      if (parsed.search) filterSearchValue.value = parsed.search;
      if (parsed.filterField) selectedFilterField.value = parsed.filterField;
    } else {
      const queryStartDate = route.query.startDate as string;
      const queryEndDate = route.query.endDate as string;
      if (queryStartDate && queryEndDate) {
        filters.startDate = queryStartDate;
        filters.endDate = queryEndDate;
      }
    }

    await fetchBranchOptions();
    await fetchMasterData();
    isMounted.value = true;
  }
});

watch(
  filters,
  () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...filters,
        search: filterSearchValue.value,
        filterField: selectedFilterField.value,
      })
    );

    if (isMounted.value && hasViewPermission.value) {
      fetchMasterData();
    }
  },
  { deep: true }
);

watch([filterSearchValue, selectedFilterField], () => {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...filters,
      search: filterSearchValue.value,
      filterField: selectedFilterField.value,
    })
  );
});

// AppDataTable (mode client) tidak mereset halaman saat jumlah data berubah.
// Remount agar tidak tertinggal di halaman yang sudah tidak ada, dan kosongkan seleksi.
watch(
  () => filteredList.value.length,
  () => {
    selected.value = [];
    expanded.value = [];
    tableKey.value++;
  }
);

onBeforeRouteLeave((to, from, next) => {
  const isRelatedPage = to.path.includes("/proforma");
  if (!isRelatedPage) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  next();
});
</script>

<template>
  <PageLayout title="Browse Proforma Invoice" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-plus"
        @click="handleNew"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-pencil"
        @click="handleEdit"
        :disabled="!canEdit"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-printer"
        @click="handleCetak"
        :disabled="!canCetak"
        >Cetak</v-btn
      >
      <v-menu offset-y v-if="authStore.can(MENU_ID, 'view')">
        <template v-slot:activator="{ props }">
          <v-btn
            size="small"
            variant="tonal"
            class="btn-header-action"
            prepend-icon="mdi-file-excel"
            v-bind="props"
            >Export</v-btn
          >
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <template v-slot:prepend>
              <v-icon icon="mdi-table-headers-eye" size="small" class="mr-2"></v-icon>
            </template>
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')">
            <template v-slot:prepend>
              <v-icon icon="mdi-file-document-multiple-outline" size="small" class="mr-2"></v-icon>
            </template>
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Periode:</span>
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
        <v-select
          v-model="filters.cabang"
          :items="branchOptions"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          class="cabang-select"
          :menu-props="{ class: 'proforma-filter-menu' }"
        />

        <v-divider vertical class="mx-1" />

        <v-select
          v-model="selectedFilterField"
          :items="filterOptions"
          label="Cari di"
          density="compact"
          hide-details
          variant="outlined"
          class="field-select"
          :menu-props="{ class: 'proforma-filter-menu' }"
        />
        <v-text-field
          v-model="filterSearchValue"
          label="Cari..."
          density="compact"
          hide-details
          variant="outlined"
          class="search-field"
          clearable
          prepend-inner-icon="mdi-magnify"
        />

        <v-btn
          variant="tonal"
          size="small"
          icon="mdi-filter-off"
          class="btn-header-action ms-1"
          title="Reset semua filter"
          @click="resetAllFilters"
        />

        <v-spacer />

        <v-btn
          @click="fetchMasterData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          class="btn-refresh"
          title="Muat ulang data"
          :loading="loading"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          :key="tableKey"
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="filteredList"
          :loading="loading"
          :item-class="getRowTextColor"
          item-value="nomor"
          density="compact"
          class="desktop-table"
          fixed-header
          show-select
          return-object
          single-select
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

                    <v-menu location="bottom start">
                      <template #activator="{ props }">
                        <v-icon
                          v-bind="props"
                          size="16"
                          class="ms-1"
                          :class="{ 'filter-active': isFilterActive(header.key) }"
                          @click.stop
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
                          <v-list-item-title>(Semua)</v-list-item-title>
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
                              color="red-darken-4"
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
                            >(Filter kustom…)</v-list-item-title
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

          <template
            v-for="header in headers.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td :class="getRowTextColor(item)">
              <template v-if="['tanggal', 'tempo'].includes(header.key)">
                {{
                  item[header.key]
                    ? format(parseISO(item[header.key] as string), "dd/MM/yyyy")
                    : "-"
                }}
              </template>

              <template v-else-if="header.key === 'nominal'">
                {{ formatRupiah(Number(item[header.key] || 0)) }}
              </template>

              <template v-else-if="header.key === 'closing'">
                <v-chip
                  size="x-small"
                  :color="item.closing === 'Y' ? 'grey-darken-1' : 'success'"
                  variant="tonal"
                  class="font-weight-bold"
                >
                  {{ item.closing === "Y" ? "TUTUP" : "BUKA" }}
                </v-chip>
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
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center py-2">
                      Memuat detail...
                    </div>
                    <v-data-table
                      v-else-if="details[item.nomor]"
                      :headers="detailHeaders"
                      :items="details[item.nomor]"
                      item-value="kode"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.harga`]="{ item: detailItem }">{{
                        formatRupiah(Number(detailItem.harga || 0))
                      }}</template>
                      <template #[`item.total`]="{ item: detailItem }">{{
                        formatRupiah(Number(detailItem.total || 0))
                      }}</template>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-2">
                      Tidak ada data detail untuk nomor ini.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">Filter kustom — {{ customFilterTitle }}</v-card-title>
        <v-card-text class="pt-4">
          <v-select
            v-model="customFilter.operator"
            :items="[
              { title: '= (sama dengan)', value: '=' },
              { title: '≠ (tidak sama)', value: '!=' },
              { title: '> (lebih dari)', value: '>' },
              { title: '≥ (lebih dari atau sama)', value: '>=' },
              { title: '< (kurang dari)', value: '<' },
              { title: '≤ (kurang dari atau sama)', value: '<=' },
              { title: 'mengandung', value: 'contains' },
              { title: 'diawali', value: 'starts' },
              { title: 'diakhiri', value: 'ends' },
            ]"
            density="compact"
            variant="outlined"
            hide-details
            class="form-field mb-3"
          />
          <v-text-field
            v-model="customFilter.value"
            label="Nilai"
            density="compact"
            variant="outlined"
            hide-details
            class="form-field"
            autofocus
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="customFilterDialog = false">Batal</v-btn>
          <v-btn variant="flat" class="btn-primary-red" @click="applyCustomFilter">Terapkan</v-btn>
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

  /* Tema merah lokal (DESIGN.md 10.3) */
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
}

/* ══════════ TOMBOL ══════════ */
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
.btn-refresh {
  color: #b71c1c !important;
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
.filter-label {
  font-size: 12px;
  font-weight: 600;
  color: #b71c1c;
}
.filter-sep {
  font-size: 11px;
  font-weight: 600;
  color: #b71c1c;
}

.filter-section .periode-field {
  flex: none;
  width: 150px;
}
.filter-section .cabang-select {
  flex: none;
  width: 170px;
  margin-left: 8px;
}
.filter-section .field-select {
  flex: none;
  width: 140px;
}
.filter-section .search-field {
  flex: none;
  width: 220px;
}

.filter-section :deep(.v-field) {
  --v-field-border-radius: 8px;
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  box-shadow: none !important;
}
.filter-section :deep(.v-field__outline) {
  color: #b71c1c;
  --v-field-border-opacity: 0.3;
}
.filter-section :deep(.v-field--focused) {
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.filter-section :deep(.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 1;
}
.filter-section .search-field :deep(.v-field__prepend-inner .v-icon),
.filter-section .cabang-select :deep(.v-select__menu-icon),
.filter-section .field-select :deep(.v-select__menu-icon) {
  color: #b71c1c !important;
  opacity: 0.8 !important;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ══════════ TABEL ══════════ */
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

/* Header resize: selector berspesifisitas tinggi agar mengalahkan style global AppDataTable */
.desktop-table :deep(thead tr th.resizable-header) {
  position: relative;
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #8e0000 !important;
  padding: 0 8px !important;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.desktop-table :deep(thead tr th.resizable-header *),
.desktop-table :deep(thead tr th.resizable-header .v-icon) {
  color: #ffffff !important;
}
/* Kolom yang sedang difilter: ikon kuning supaya terbaca di atas header merah */
.desktop-table :deep(thead tr th.resizable-header .v-icon.filter-active) {
  color: #ffd54f !important;
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

/* Tint baris memakai background-image (bukan background-color) karena kolom
   Nomor dan expand bersifat sticky: latar opaque bawaan harus tetap ada. */
.desktop-table :deep(tbody tr:nth-child(even) > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.03), rgba(183, 28, 28, 0.03));
}
.desktop-table :deep(tbody tr:hover > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.08), rgba(183, 28, 28, 0.08));
}

:deep(td.text-grey) {
  color: grey !important;
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
  max-width: 800px;

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
}
.detail-table :deep(tbody tr > td) {
  background-image: none !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
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

/* ══════════ DIALOG FILTER KUSTOM ══════════ */
.dialog-card {
  border-radius: 12px;
  overflow: hidden;
}
.confirm-title {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}
.form-field :deep(.v-field) {
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}
.form-field :deep(.v-field__outline) {
  display: none !important;
}
.form-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}

.state-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.rotate-180 {
  transform: rotate(180deg);
  transition: transform 0.2s;
}
</style>

<style>
/* Menu dropdown di-teleport ke luar halaman, jadi tidak bisa memakai scoped */
.proforma-filter-menu .v-list-item--active,
.filter-menu .v-list-item--active {
  background-color: rgba(183, 28, 28, 0.1) !important;
  color: #b71c1c !important;
}
.proforma-filter-menu .v-list-item:hover,
.filter-menu .v-list-item:hover {
  background-color: rgba(183, 28, 28, 0.06) !important;
}
.filter-menu .custom-filter-item {
  color: #b71c1c;
  font-weight: 600;
}
</style>

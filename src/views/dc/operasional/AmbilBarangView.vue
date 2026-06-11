<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import MintaBarangSearchModal from "@/components/lookup/MintaBarangSearchModal.vue";
import AppDataTable from "@/components/AppDataTable.vue";
import * as XLSX from "xlsx";
import { AxiosError } from "axios";
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
  nomor: string;
  tanggal: string;
  nomorTerima: string | null;
  tglTerima: string | null;
  store: string;
  namaStore: string;
  peminta: string;
  statusEdit: "WAIT" | "ACC" | "TOLAK" | "";
  userCreate: string;
  closing: "Y" | "N";
  [key: string]: unknown;
}

interface DetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}

interface Product {
  kode: string;
  nama: string;
  ukuran?: string;
  jumlah?: number;
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

interface PengambilanExportDetail {
  Nomor: string;
  Tanggal?: string | Date;
  "Nomor Terima": string;
  "Tgl Terima"?: string | Date;
  "Nama Store": string;
  Peminta: string;
  "Kode Barang": string;
  "Nama Barang": string;
  Ukuran: string;
  Jumlah: number;
  [key: string]: unknown;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "253";

// --- State ---
const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  kodeBarang: "",
  namaBarang: "",
});

const loading = ref(true);
const masterData = ref<MasterItem[]>([]);
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, DetailItem[]>>({});
const isLookupVisible = ref(false);
const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => {} });

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: "", operator: "=", value: "" });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Header Definisi ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "nomor", width: 160, fixed: true },
  { title: "Tanggal", key: "tanggal", width: 110 },
  { title: "Nomor Terima", key: "nomorTerima", width: 150 },
  { title: "Tgl Terima", key: "tglTerima", width: 110 },
  { title: "Nama Store", key: "namaStore", width: 200 },
  { title: "Peminta", key: "peminta", width: 150 },
  { title: "Status Edit", key: "statusEdit", align: "center", width: 120 },
  { title: "User Create", key: "userCreate", width: 120 },
  { title: "Closing", key: "closing", align: "center", width: 80 },
]);

const detailHeaders = [
  { title: "Kode Barang", key: "kode", width: "120px" },
  { title: "Nama Barang", key: "nama", width: "350px" },
  { title: "Ukuran", key: "ukuran", width: "80px" },
  { title: "Jumlah", key: "jumlah", align: "end", width: "100px" },
] as const;

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));

const canEdit = computed(() => isSingleSelected.value && selectedRow.value?.closing !== "Y");
const canDelete = computed(() => isSingleSelected.value && selectedRow.value?.closing !== "Y");

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
  if (["tanggal", "tglTerima"].includes(key)) {
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
const handleRowClick = (_event: Event, { item }: { item: MasterItem }) => {
  selected.value = [item];
};

// --- Methods: Data ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/ambil-barang", { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor)
  );
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get("/ambil-barang/details", { params: { nomor: nomorToLoad } });
    details.value[nomorToLoad] = Array.isArray(response.data) ? response.data : [];
  } catch (error: unknown) {
    // [FIX] Beri tipe unknown
    let msg = `Gagal memuat detail untuk ${nomorToLoad}`;

    // Gunakan axios untuk ekstraksi pesan yang rapi
    if (axios.isAxiosError(error)) {
      msg = error.response?.data?.message || msg;
    }

    toast.error(msg); // Hanya kirim string pesan
    details.value[nomorToLoad] = [];
    console.error(error); // [TIPS] Di sini variabel error "terpakai" secara legal untuk debug
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

// --- Actions ---
const handleNew = () => router.push({ name: "AmbilBarangCreate" });

const handleEdit = () => {
  if (!canEdit.value || !selectedRow.value) return;
  router.push({ name: "AmbilBarangEdit", params: { id: selectedRow.value.nomor } });
};

const handleDelete = () => {
  if (!canDelete.value || !selectedRow.value) return;
  dialogConfirm.title = "Konfirmasi Hapus";
  dialogConfirm.text = `Yakin menghapus dokumen dengan nomor <strong>${selectedRow.value.nomor}</strong>?`;
  dialogConfirm.onConfirm = async () => {
    try {
      const response = await api.delete(`/ambil-barang/${selectedRow.value?.nomor}`);
      toast.success(response.data.message);
      fetchMasterData();
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      toast.error(err.response?.data?.message || "Gagal menghapus data.");
    }
  };
  dialogConfirm.show = true;
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

// --- 2. Fungsi Export Data ---
const exportData = async (type: "header" | "detail") => {
  // === EXPORT HEADER ===
  if (type === "header") {
    if (masterData.value.length === 0) {
      toast.warning("Tidak ada data header untuk diekspor.");
      return;
    }

    try {
      toast.info("Membuat file Excel Header...");

      // Casting ke Interface
      const sourceData = masterData.value as MasterItem[];

      // Mapping & Formatting Tanggal
      const formattedHeader = sourceData.map((item) => ({
        ...item,
        tanggal: item.tanggal ? formatDateIndo(item.tanggal) : "",
        tglTerima: item.tglTerima ? formatDateIndo(item.tglTerima) : "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);

      // Auto Width
      worksheet["!cols"] = getAutoColumnWidth(formattedHeader);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pengambilan Barang");
      XLSX.writeFile(workbook, "Export_Pengambilan_Barang_Header.xlsx");

      toast.success("File Header berhasil dibuat.");
    } catch (error: unknown) {
      toast.error("Gagal membuat file Excel.");
      console.error(error); // Memuaskan linter agar variabel 'error' dianggap terpakai
    }

    // === EXPORT DETAIL ===
  } else if (type === "detail") {
    try {
      toast.info("Mengambil data detail dari server...");

      // Pastikan URL endpoint sesuai dengan route backend (/export-details)
      const response = await api.get<PengambilanExportDetail[]>("/ambil-barang/export-detail", {
        params: filters,
      });

      if (response.data.length === 0) {
        toast.warning("Tidak ada data detail untuk diekspor pada filter ini.");
        return;
      }

      toast.info("Membuat file Excel Detail...");

      // Mapping & Formatting Tanggal
      const formattedDetail = response.data.map((row) => ({
        ...row,
        Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal) : "",
        "Tgl Terima": row["Tgl Terima"] ? formatDateIndo(row["Tgl Terima"]) : "",
      }));

      // Setup Layout Excel
      const title = "LAPORAN DETAIL PENGAMBILAN BARANG";
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
      worksheet["!cols"] = tableHeaders.map((header) => ({ wch: Math.max(header.length + 5, 15) }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Pengambilan Barang");
      XLSX.writeFile(workbook, "Export_Pengambilan_Barang_Detail.xlsx");
      toast.success("File Detail berhasil dibuat.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Gagal mengekspor data detail: " + message);
    }
  }
};

const handleProductSelected = (products: Product[]) => {
  if (products.length > 0) {
    filters.kodeBarang = products[0].kode;
    filters.namaBarang = products[0].nama;
    fetchMasterData();
  }
  isLookupVisible.value = false;
};

const handleKodeBarangKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    fetchMasterData();
  }

  if (e.key === "F1") {
    e.preventDefault();
    isLookupVisible.value = true;
  }
};

// --- Helpers Display ---
const getRowTextColor = (item: MasterItem) => {
  return !item.nomorTerima ? "text-red font-weight-medium" : "";
};

const getStatusCellClass = (status: string) => {
  if (status === "WAIT") return "bg-blue text-white";
  if (status === "ACC") return "bg-green text-white";
  if (status === "TOLAK") return "bg-red text-white";
  return "";
};

onMounted(fetchMasterData);

watch(
  () => filters.kodeBarang,
  (newValue) => {
    if (!newValue) {
      filters.namaBarang = "";
      fetchMasterData();
    }
  }
);
</script>

<template>
  <PageLayout title="Browse Pengambilan Barang" :menu-id="MENU_ID">
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
        @click="handleEdit"
        prepend-icon="mdi-pencil"
        :disabled="!canEdit"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        prepend-icon="mdi-delete"
        @click="handleDelete"
        :disabled="!canDelete"
        >Hapus</v-btn
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
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          @change="fetchMasterData"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          @change="fetchMasterData"
        />

        <v-text-field
          v-model="filters.kodeBarang"
          label="Cari Kode Barang (F1)"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 200px"
          class="ms-4"
          @keydown="handleKodeBarangKeydown"
          clearable
        />
        <v-btn
          icon="mdi-magnify"
          variant="text"
          size="small"
          class="me-2"
          @click="isLookupVisible = true"
        />
        <v-text-field
          v-model="filters.namaBarang"
          density="compact"
          hide-details
          variant="filled"
          readonly
          style="max-width: 250px"
        />

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
          @click="fetchMasterData"
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
          item-value="nomor"
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

          <template #[`item.nomor`]="{ item }">
            <span :class="getRowTextColor(item)">{{ item.nomor }}</span>
          </template>

          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal as string), "dd/MM/yyyy") }}
          </template>

          <template #[`item.tglTerima`]="{ item }">
            {{ item.tglTerima ? format(parseISO(item.tglTerima as string), "dd/MM/yyyy") : "-" }}
          </template>

          <template #[`item.statusEdit`]="{ item }">
            <v-chip
              v-if="item.statusEdit"
              size="x-small"
              :class="getStatusCellClass(item.statusEdit as string)"
            >
              {{ item.statusEdit }}
            </v-chip>
          </template>

          <template #[`item.closing`]="{ item }">
            <v-chip size="x-small" :color="item.closing === 'Y' ? 'green' : 'grey'">
              {{ item.closing }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>
                    <v-data-table
                      v-else-if="details[item.nomor]"
                      class="detail-table"
                      :headers="detailHeaders"
                      :items="details[item.nomor]"
                      density="compact"
                      :items-per-page="-1"
                      hide-default-footer
                    >
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

    <MintaBarangSearchModal
      v-if="isLookupVisible"
      source="ambil-barang"
      :multi="false"
      gudang="K01"
      @close="isLookupVisible = false"
      @products-selected="handleProductSelected"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text> <span v-html="dialogConfirm.text"></span> </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

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
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import MasterProductSearchModal from "@/components/lookup/MasterProductSearchModal.vue";
import * as XLSX from "xlsx";
import { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

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

interface MasterItem {
  nomor: string;
  tanggal: string;
  nomorTerima: string | null;
  tglTerima: string | null;
  dariStore: string;
  keterangan: string;
  usr: string;
  closing: "Y" | "N" | string;
}
interface DetailItem {
  nomor_kirim: string;
  tanggal_kirim?: string;
  nomor_terima?: string;
  tanggal_terima?: string;
  dari_store?: string;
  kode_barang: string;
  nama_barang: string;
  ukuran?: string;
  jumlah?: number;
}
interface MutasiTerimaExportRow {
  nomor_kirim: string;
  tanggal_kirim?: string | Date;
  nomor_terima?: string;
  tanggal_terima?: string | Date;
  dari_store?: string;
  kode_barang: string;
  nama_barang: string;
  ukuran?: string;
  jumlah?: number;
  [key: string]: unknown;
}
interface Cabang {
  kode: string;
  nama: string;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "47";

// --- State ---
const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const list = ref<MasterItem[]>([]);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<Cabang[]>([]);
const searchItemName = ref("");
const isMasterProductSearchVisible = ref(false);

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang || "",
  itemCode: "",
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor Kirim", key: "nomor", width: 180, fixed: true },
  { title: "Tgl Kirim", key: "tanggal", width: 120 },
  { title: "Nomor Terima", key: "nomorTerima", width: 180 },
  { title: "Tgl Terima", key: "tglTerima", width: 120 },
  { title: "Dari Store", key: "dariStore", width: 200 },
  { title: "Keterangan", key: "keterangan", width: 250 },
  { title: "User", key: "usr", width: 100 },
  { title: "Closing", key: "closing", width: 100, align: "center" },
]);

const detailHeaders = [
  { title: "Kode", key: "kode", width: "150px" },
  { title: "Nama Barang", key: "nama", width: "300px" },
  { title: "Ukuran", key: "ukuran", width: "100px" },
  { title: "Jumlah", key: "jumlah", width: "100px", align: "end" },
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
const handleRowClick = (_event: Event, { item }: { item: MasterItem }) => {
  selected.value = [item];
};

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));

const canTerima = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima);
const canBatalTerima = computed(
  () =>
    isSingleSelected.value && !!selectedRow.value?.nomorTerima && selectedRow.value?.closing !== "Y"
);

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/mutasi-kirim/lookup/cabang");
    cabangList.value = response.data;
    if (!filters.cabang && cabangList.value.length > 0) {
      filters.cabang = cabangList.value[0].kode;
    }
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;

    toast.error(error.response?.data?.message || "Gagal memuat daftar cabang.");
  }
};

const fetchMasterData = async () => {
  if (!filters.cabang) return;
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  details.value = {};
  try {
    const response = await api.get("/mutasi-terima", { params: filters });
    masterData.value = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find((item) => {
    return !details.value[item.nomor] && !loadingDetails.value.has(item.nomor);
  });

  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/mutasi-terima/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || `Gagal memuat detail untuk ${nomorToLoad}`);
    const index = expanded.value.findIndex((nomor) => nomor === nomorToLoad);
    if (index > -1) {
      expanded.value.splice(index, 1);
    }
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleTerima = () => {
  if (!canTerima.value || !selectedRow.value) return;

  router.push({
    name: "MutasiTerimaCreate",
    query: { nomorKirim: selectedRow.value.nomor },
  });
};

const handleBatalTerima = () => {
  if (!canBatalTerima.value || !selectedRow.value) return;

  showConfirmation(
    "Konfirmasi Batal Terima",
    `Yakin ingin membatalkan penerimaan untuk dokumen kirim ${selectedRow.value.nomor}? Stok akan dikembalikan.`,
    async () => {
      try {
        const response = await api.delete(`/mutasi-terima/${selectedRow.value!.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (err: unknown) {
        const error = err as AxiosError<{ message?: string }>;
        toast.error(error.response?.data?.message || "Gagal membatalkan penerimaan.");
      }
    }
  );
};

const getRowTextColor = (item: MasterItem) => {
  if (!item.nomorTerima) return "text-red font-weight-bold";
  return "";
};

const openMasterProductSearch = () => {
  isMasterProductSearchVisible.value = true;
};

const onMasterProductSelected = (product: { kode: string; nama: string }) => {
  isMasterProductSearchVisible.value = false;
  if (product) {
    filters.itemCode = product.kode;
    searchItemName.value = product.nama;
  }
};

// --- Helper Format Tanggal ---
const formatDateIndo = (dateString: string | Date | null | undefined) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  // Validasi date valid
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

// --- Fungsi Export Data ---
const exportData = async (type: "header" | "detail") => {
  if (type === "header") {
    if (list.value.length === 0) {
      toast.warning("Tidak ada data header untuk diekspor.");
      return;
    }

    try {
      toast.info("Menyiapkan file Excel Header...");

      // Mapping Data Header dengan Interface MasterItem
      const formattedHeader = list.value.map((item: MasterItem) => ({
        "Nomor Kirim": item.nomor,
        "Tanggal Kirim": formatDateIndo(item.tanggal),
        "Nomor Terima": item.nomorTerima,
        "Tanggal Terima": formatDateIndo(item.tglTerima),
        "Dari Store": item.dariStore,
        Keterangan: item.keterangan,
        User: item.usr,
        Closing: item.closing,
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Terima Header");
      XLSX.writeFile(workbook, "Export_Mutasi_Terima_Header.xlsx");
      toast.success("File Header berhasil diekspor.");
    } catch (err: unknown) {
      const error = err as AxiosError<{ message?: string }>;
      toast.error(error.response?.data?.message || "Gagal mengekspor data header.");
    }
  } else if (type === "detail") {
    try {
      toast.info("Mengambil data detail dari server...");

      // Request API dengan Generic Type
      const response = await api.get<MutasiTerimaExportRow[]>("/mutasi-terima/export-details", {
        params: filters,
      });

      const detailData = response.data;

      if (!detailData || detailData.length === 0) {
        toast.warning("Tidak ada data detail ditemukan untuk filter yang dipilih.");
        return;
      }

      toast.info("Membuat file Excel Detail...");

      // Mapping Data Detail (Rename Key & Format Date)
      const formattedDetail = detailData.map((item) => ({
        "Nomor Kirim": item.nomor_kirim,
        "Tanggal Kirim": formatDateIndo(item.tanggal_kirim),
        "Nomor Terima": item.nomor_terima || "-",
        "Tanggal Terima": formatDateIndo(item.tanggal_terima),
        "Dari Store": item.dari_store,
        "Kode Barang": item.kode_barang,
        "Nama Barang": item.nama_barang,
        Ukuran: item.ukuran,
        Jumlah: item.jumlah,
      }));

      // Setup Layout Excel
      const title = "LAPORAN DETAIL MUTASI TERIMA";
      const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(
        filters.endDate
      )}`;
      const tableHeaders = Object.keys(formattedDetail[0]);

      // Convert ke Array of Values
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
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Terima Detail");
      XLSX.writeFile(workbook, "Export_Mutasi_Terima_Detail.xlsx");
      toast.success("File Detail berhasil diekspor.");
    } catch (error) {
      let message = "Gagal mengekspor data detail.";
      if (error instanceof Error) message = error.message;
      toast.error(message);
    }
  }
};

onMounted(async () => {
  await fetchCabangList();
  fetchMasterData();
});

watch(
  () => filters.cabang,
  (newVal, oldVal) => {
    if (newVal !== oldVal) {
      fetchMasterData();
    }
  }
);

watch(
  () => ({ startDate: filters.startDate, endDate: filters.endDate, itemCode: filters.itemCode }),
  (newFilters, oldFilters) => {
    if (JSON.stringify(newFilters) !== JSON.stringify(oldFilters)) {
      if (!newFilters.itemCode) {
        searchItemName.value = "";
      }
      fetchMasterData();
    }
  },
  { deep: true }
);
</script>

<template>
  <PageLayout title="Mutasi Antar Store Terima" icon="mdi-package-variant">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        prepend-icon="mdi-check"
        color="primary"
        @click="handleTerima"
        :disabled="!canTerima"
      >
        Terima
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        prepend-icon="mdi-undo"
        color="error"
        @click="handleBatalTerima"
        :disabled="!canBatalTerima"
      >
        Batal Terima
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props"
            >Export</v-btn
          >
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
        <v-label class="filter-label">Tgl Kirim:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <v-select
          label="Cabang"
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 200px"
        />
        <v-text-field
          v-model="filters.itemCode"
          label="Kode Barang"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 150px"
          clearable
          readonly
          @click="openMasterProductSearch"
        >
          <template #append-inner
            ><v-icon @click="openMasterProductSearch">mdi-magnify</v-icon></template
          >
        </v-text-field>
        <v-text-field
          v-model="searchItemName"
          variant="solo-filled"
          density="compact"
          hide-details
          readonly
          class="ms-1"
          style="max-width: 300px"
        />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diterima
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="masterData"
          :loading="loading"
          item-value="nomor"
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
            <td :class="getRowTextColor(item)">
              <template v-if="['tanggal', 'tglTerima'].includes(header.key)">
                {{
                  item[header.key]
                    ? format(parseISO(item[header.key] as string), "dd/MM/yyyy")
                    : "-"
                }}
              </template>
              <template v-else-if="header.key === 'closing'">
                <v-chip v-if="item.closing === 'Y'" size="x-small" color="success">YA</v-chip>
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
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">
                      Memuat detail...
                    </div>
                    <v-data-table
                      v-else
                      :headers="detailHeaders"
                      :items="details[item.nomor]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.jumlah`]="{ item }">
                        <div class="text-end">{{ item.jumlah }}</div>
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

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
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

    <MasterProductSearchModal
      v-if="isMasterProductSearchVisible"
      :gudang="filters.cabang"
      @close="isMasterProductSearchVisible = false"
      @product-selected="onMasterProductSelected"
    />
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
  max-width: 600px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

:deep(.v-dialog) .v-card {
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
</style>

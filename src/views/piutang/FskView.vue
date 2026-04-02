<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO, isSameDay } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import axios from "axios";

// Interface Header (Resize)
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

interface FskMaster {
  Nomor: string;
  TglSetor: string;
  TglVerifikasi?: string;
  Created: string;
  Verified?: string;
  Closing?: string;
  [key: string]: unknown;
}

interface FskDetail {
  Jenis: string;
  NominalSetor: number;
  NominalVerifikasi: number;
  [key: string]: unknown;
}

// Interface Data Header dari API
interface FskExportHeader {
  Nomor: string;
  TglSetor?: string | Date;
  TglVerifikasi?: string | Date;
  DibuatOleh?: string;
  DiverifikasiOleh?: string;
  Closing?: string;
  [key: string]: unknown;
}

// Interface Data Detail dari API
interface FskExportDetail {
  "Nomor FSK": string;
  "Tanggal Setor"?: string | Date;
  "Tanggal Verifikasi"?: string | Date;
  [key: string]: unknown;
}

interface CabangOption {
  kode: string;
  nama: string;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "54";

// --- State ---
const masterData = ref<FskMaster[]>([]);
const details = ref<Record<string, FskDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<FskMaster[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<CabangOption[]>([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  // [PERBAIKAN] Tambahkan fallback string kosong
  cabang: authStore.user?.cabang || "",
});

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));
const canBeModified = computed(() => {
  if (!isSingleSelected.value) return false;
  const item = selected.value[0];
  return !item.Verified;
});
const hasTodayFsk = computed(() => {
  const today = new Date();
  return masterData.value.some((item) => {
    const tglSetor = parseISO(item.TglSetor);
    // Cek jika tanggal sama dan milik cabang user sendiri (bukan hasil intip cabang lain jika KDC)
    return isSameDay(tglSetor, today) && item.Nomor.startsWith(authStore.user?.cabang || "");
  });
});
const isKdcUser = computed(() => authStore.user?.cabang === "KDC");

const newButtonDisabledReason = computed(() => {
  if (hasTodayFsk.value)
    return "FSK hari ini sudah dibuat. SC hanya diperbolehkan membuat 1 FSK per hari.";
  if (!authStore.can(MENU_ID, "insert")) return "Anda tidak memiliki izin.";
  return "";
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "Nomor", width: 200, fixed: true },
  { title: "Tgl Setor", key: "TglSetor", width: 150 },
  { title: "Tgl Verifikasi", key: "TglVerifikasi", width: 150 },
  { title: "Dibuat Oleh", key: "Created", width: 150 },
  { title: "Diverifikasi Oleh", key: "Verified", width: 150 },
  { title: "Closing", key: "Closing", align: "center", width: 100 },
]);

const detailHeaders = [
  { title: "Jenis", key: "Jenis", width: "200px" },
  { title: "Nominal Setor", key: "NominalSetor", align: "end", width: "150px" },
  { title: "Nominal Verifikasi", key: "NominalVerifikasi", align: "end", width: "150px" },
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
const handleRowClick = (_event: Event, { item }: { item: FskMaster }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/fsk/lookup/cabang");
    cabangList.value = response.data;
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/fsk", { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message || "Gagal mengambil data.");
    } else if (typeof error === "object" && error !== null && "response" in error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || "Gagal mengambil data.");
    } else {
      toast.error("Gagal mengambil data.");
    }
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: FskMaster[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);
  try {
    const response = await api.get<FskDetail[]>(`/fsk/details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message || `Gagal memuat detail untuk ${itemToLoad.Nomor}`);
    } else {
      toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}`);
    }
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

// const handleDelete = () => {
//   if (!selectedRow.value) return;
//   if (confirm(`Yakin ingin menghapus FSK nomor ${selectedRow.value.Nomor}?`)) {
//     api.delete(`/fsk/${selectedRow.value.Nomor}`)
//       .then(response => {
//         toast.success(response.data.message);
//         fetchMasterData();
//       })
//       .catch(error => {
//         toast.error(error.response?.data?.message || 'Gagal menghapus data.');
//       });
//   }
// };

const getRowTextColor = (item: FskMaster) => {
  if (!item.Verified) return "text-red font-weight-bold";
  return "";
};

const handleEdit = () => {
  if (!selectedRow.value) return;

  router.push({
    name: "FskEdit",
    params: { nomor: selectedRow.value.Nomor },
    // Kirim query parameter sebagai penanda read-only
    query: { readonly: isKdcUser.value ? "true" : "false" },
  });
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].Nomor;
  const url = router.resolve({ name: "FskPrint", params: { nomor } }).href;
  window.open(url, "_blank");
};

// Helper Format Tanggal
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

// Helper Auto Width (wscols)
const getAutoColumnWidth = (data: Record<string, unknown>[]) => {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map((key) => ({
    // Lebar minimal 15, atau menyesuaikan panjang judul kolom
    wch: Math.max(key.length + 5, 15),
  }));
};

// --- 2. Fungsi Export Data ---
const exportData = async (type: "header" | "detail") => {
  // === EXPORT HEADER (Dari Server) ===
  if (type === "header") {
    try {
      toast.info("Mengambil data header dari server...");

      const response = await api.get<FskExportHeader[]>("/fsk/export-headers", {
        params: filters,
      });

      if (response.data.length === 0) {
        toast.warning("Tidak ada data header untuk diekspor.");
        return;
      }

      toast.info("Membuat file Excel Header...");

      // Mapping Format Data
      const formattedHeader = response.data.map((item) => ({
        Nomor: item.Nomor,
        "Tgl Setor": item.TglSetor ? formatDateIndo(item.TglSetor) : "",
        "Tgl Verifikasi": item.TglVerifikasi ? formatDateIndo(item.TglVerifikasi) : "",
        "Dibuat Oleh": item.DibuatOleh,
        "Diverifikasi Oleh": item.DiverifikasiOleh,
        Closing: item.Closing,
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);

      // [FITUR] Auto Width Columns
      worksheet["!cols"] = getAutoColumnWidth(formattedHeader);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "FSK Header");
      XLSX.writeFile(workbook, "Export_FSK_Header.xlsx");
      toast.success("File Header berhasil dibuat.");
    } catch (error: unknown) {
      // [PERBAIKAN] Tambahkan unknown
      let msg = "Gagal mengekspor data header.";
      if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
      else if (error instanceof Error) msg = error.message;

      toast.error(msg); // [PERBAIKAN] Cuma kirim string
    }

    // === EXPORT DETAIL ===
  } else if (type === "detail") {
    try {
      toast.info("Mengambil data detail dari server...");

      const response = await api.get<FskExportDetail[]>("/fsk/export-details", {
        params: filters,
      });

      if (response.data.length === 0) {
        toast.warning("Tidak ada data detail untuk diekspor.");
        return;
      }

      toast.info("Membuat file Excel Detail...");

      // Mapping Format Data
      const formattedDetail = response.data.map((row) => ({
        ...row,
        "Tanggal Setor": row["Tanggal Setor"] ? formatDateIndo(row["Tanggal Setor"]) : "",
        "Tanggal Verifikasi": row["Tanggal Verifikasi"]
          ? formatDateIndo(row["Tanggal Verifikasi"])
          : "",
      }));

      // Setup Layout Excel
      const title = "LAPORAN DETAIL FORM SETORAN KASIR (FSK)";
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

      // [FITUR] Auto Width Columns
      worksheet["!cols"] = tableHeaders.map((header) => ({ wch: Math.max(header.length + 5, 15) }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "FSK Detail");
      XLSX.writeFile(workbook, "Export_FSK_Detail.xlsx");
      toast.success("File Detail berhasil dibuat.");
    } catch (error) {
      let message = "Gagal mengekspor data detail.";
      if (error instanceof Error) message = error.message;
      toast.error(message);
    }
  }
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Form Setoran Kasir" icon="mdi-cash-register">
    <template #header-actions>
      <v-tooltip location="bottom" :disabled="!hasTodayFsk">
        <template #activator="{ props }">
          <span v-bind="props">
            <v-btn
              size="small"
              prepend-icon="mdi-plus"
              color="primary"
              :disabled="!!newButtonDisabledReason"
              @click="router.push({ name: 'FskCreate' })"
              >Baru</v-btn
            >
          </span>
        </template>
        <span>{{ newButtonDisabledReason }}</span>
      </v-tooltip>
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit') || isKdcUser"
        size="small"
        prepend-icon="mdi-pencil"
        :disabled="!isSingleSelected || (!canBeModified && !isKdcUser)"
        @click="handleEdit"
      >
        {{ isKdcUser ? "Lihat Detail" : "Ubah" }}
      </v-btn>
      <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        :disabled="!canBeModified" @click="handleDelete">
        Hapus
      </v-btn> -->
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        color="green"
        :disabled="!isSingleSelected"
        @click="printData"
        prepend-icon="mdi-printer"
      >
        Cetak
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
          <v-list-item @click="exportData('detail')">
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <v-alert
        type="info"
        variant="tonal"
        density="compact"
        icon="mdi-information"
        class="mx-3 mt-2 mb-1 custom-alert-fsk"
        border="start"
      >
        <div class="alert-content-small">
          <strong>Perhatian:</strong> Pembuatan FSK adalah tanda <strong>Closing</strong>. Maksimal
          <strong>1 FSK per hari</strong>. Gunakan saat operasional benar-benar selesai.
        </div>
      </v-alert>
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
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
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diverifikasi
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
              <template v-if="['TglSetor', 'TglVerifikasi'].includes(header.key)">
                {{
                  item[header.key] ? format(parseISO(item[header.key] as string), "dd/MM/yyyy") : ""
                }}
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success">YA</v-chip>
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
                    <div
                      v-if="loadingDetails.has(item.Nomor)"
                      class="text-center pa-4 text-caption"
                    >
                      Memuat detail...
                    </div>
                    <v-data-table
                      v-else
                      :headers="detailHeaders"
                      :items="details[item.Nomor]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template
                        v-for="headerKey in ['NominalSetor', 'NominalVerifikasi']"
                        #[`item.${headerKey}`]="{ value }"
                      >
                        {{ formatRupiah(value) }}
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
  padding: 4px 8px !important;
  display: flex;
  align-items: center;
  gap: 8px;

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

.desktop-table :deep(td) {
  color: rgb(var(--v-theme-on-surface));
}

.custom-alert-fsk {
  min-height: unset !important;
  padding: 2px 8px !important;
  border-radius: 8px;

  /* optional: biar lebih tipis secara visual */
  box-shadow: none !important;
}

.custom-alert-fsk :deep(.v-alert__prepend) {
  margin-inline-end: 6px !important;
  align-self: center;
}

.custom-alert-fsk :deep(.v-icon) {
  font-size: 16px !important;
}

.alert-content-small {
  font-size: 10px !important;
  line-height: 1.15 !important;
  padding: 0 !important;
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";
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

interface SjWorkshopHeader {
  Nomor: string;
  Tanggal: string;
  Store: string;
  Nama_Store: string;
  Keterangan: string;
  Usr: string;
  Closing: "Y" | "N";
  NoTerima: string | null;
  [key: string]: unknown;
}

interface SjWorkshopDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Jumlah: number;
}

interface Cabang {
  kode: string;
  nama: string;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "803";

// --- State ---
const filters = reactive({
  startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: "ALL",
});

const loading = ref(false);
const masterData = ref<SjWorkshopHeader[]>([]);
const selected = ref<SjWorkshopHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<Cabang[]>([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, SjWorkshopDetail[]>>({});
const dialog = reactive({ confirm: false });
const confirmAction = ref<(() => void) | null>(null);
const confirmText = ref("");

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));

// --- Header Definisi (Resizable) ---
const masterHeaders = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor SJ", key: "Nomor", width: 180, fixed: true },
  { title: "Tanggal", key: "Tanggal", width: 120 },
  { title: "Kode Store", key: "Store", width: 100 },
  { title: "Tujuan Store", key: "Nama_Store", width: 250 },
  { title: "Keterangan", key: "Keterangan", width: 350 },
  { title: "No. Terima SJ", key: "NoTerima", width: 160 },
  { title: "User", key: "Usr", width: 120 },
  { title: "Closing", key: "Closing", width: 100, align: "center" },
]);

const detailHeaders = [
  { title: "Kode Barang", key: "Kode", width: "160px" },
  { title: "Nama Barang", key: "Nama", width: "350px" },
  { title: "Ukuran", key: "Ukuran", width: "100px", align: "center" },
  { title: "Jumlah", key: "Jumlah", align: "end", width: "100px" },
] as const;

// --- Methods: Resize Logic ---
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

const handleRowClick = (_event: Event, { item }: { item: SjWorkshopHeader }) => {
  selected.value = [item];
};

// --- API Calls ---
const fetchMasterData = async () => {
  loading.value = true;
  masterData.value = [];
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/operasional/workshop/sj-workshop", { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const fetchCabangList = async () => {
  try {
    const response = await api.get("/surat-jalan/lookup/cabang"); // Menggunakan lookup yang sudah ada
    cabangList.value = [{ kode: "ALL", nama: "SEMUA STORE" }, ...response.data];
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat daftar cabang.");
  }
};

const loadDetails = async (newlyExpandedItems: SjWorkshopHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/operasional/workshop/sj-workshop/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    details.value[nomorToLoad] = [];
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

// --- Actions ---
const handleNew = () => router.push({ name: "SjWorkshopCreate" });

const handleEdit = () => {
  if (!selectedRow.value) return;
  if (selectedRow.value.Closing === "Y")
    return toast.warning("Sudah Closing Stok Opname. Tidak bisa diubah.");
  router.push({ name: "SjWorkshopEdit", params: { nomor: selectedRow.value.Nomor } });
};

const showDeleteConfirmation = () => {
  if (!selectedRow.value) return;
  confirmAction.value = executeDelete;
  confirmText.value = `Yakin ingin hapus Surat Jalan Workshop nomor ${selectedRow.value.Nomor}?`;
  dialog.confirm = true;
};

const executeDelete = async () => {
  if (!selectedRow.value) return;
  try {
    const response = await api.delete(
      `/operasional/workshop/sj-workshop/${selectedRow.value.Nomor}`
    );
    toast.success(response.data.message);
    fetchMasterData();
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menghapus data.");
  }
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const url = router.resolve({
    name: "SjWorkshopPrint",
    params: { nomor: selected.value[0].Nomor },
  }).href;
  window.open(url, "_blank");
};

// --- Utilities ---
const formatDateIndo = (dateString: string | Date | null | undefined) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

const getRowTextColor = (item: SjWorkshopHeader) => {
  if (item.Closing === "Y") return "text-grey";
  if (!item.NoTerima) return "text-red font-weight-bold";
  return "";
};

const exportData = async () => {
  if (masterData.value.length === 0) return toast.warning("Tidak ada data untuk diekspor.");
  try {
    const formattedHeader = masterData.value.map((item) => ({
      "Nomor SJ": item.Nomor,
      Tanggal: item.Tanggal ? formatDateIndo(item.Tanggal) : "",
      "Kode Store": item.Store,
      "Tujuan Store": item.Nama_Store,
      Keterangan: item.Keterangan,
      User: item.Usr,
      Closing: item.Closing,
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedHeader);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "SJ Workshop Header");
    XLSX.writeFile(workbook, "Export_SJ_Workshop.xlsx");
    toast.success("File Excel berhasil dibuat.");
  } catch {
    toast.error("Gagal membuat file Excel.");
  }
};

onMounted(async () => {
  await fetchCabangList();
  if (authStore.can(MENU_ID, "view")) {
    fetchMasterData();
  } else {
    toast.error("Akses ditolak.");
    router.push("/");
  }
});

let debounceTimer: ReturnType<typeof setTimeout>;
watch(
  filters,
  () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchMasterData();
    }, 500);
  },
  { deep: true }
);
</script>

<template>
  <PageLayout title="Surat Jalan ke Store" icon="mdi-truck-fast-outline">
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
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="handleEdit"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-delete"
        @click="showDeleteConfirmation"
        >Hapus</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        color="green"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-printer"
        @click="printData"
        >Cetak</v-btn
      >
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportData"
        >Export</v-btn
      >
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
          style="max-width: 150px"
        />
        <v-label class="filter-label mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
        />

        <v-select
          label="Tujuan Store"
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 250px"
        />

        <v-spacer />
        <v-btn
          @click="fetchMasterData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          class="ms-2"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="masterHeaders"
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
          <template #headers="{ columns, toggleSort }">
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
                </th>
                <th
                  v-else
                  :style="{ width: header.width + 'px' }"
                  class="resizable-header"
                  @click="toggleSort(header)"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
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
            v-for="header in masterHeaders.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'Tanggal'">
                {{ format(parseISO(item.Tanggal as string), "dd/MM/yyyy") }}
              </template>
              <template v-else-if="header.key === 'NoTerima'">
                <span v-if="item.NoTerima" class="text-success font-weight-bold">
                  {{ item.NoTerima }}
                </span>
                <span v-else class="text-error text-caption">Belum Diterima</span>
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip size="x-small" :color="item.Closing === 'Y' ? 'success' : 'grey'">
                  {{ item.Closing === "Y" ? "YA" : "TDK" }}
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
                    <div
                      v-if="loadingDetails.has(item.Nomor)"
                      class="pa-4 text-caption text-center"
                    >
                      Memuat detail...
                    </div>
                    <v-data-table
                      v-else-if="details[item.Nomor] && details[item.Nomor].length > 0"
                      :headers="detailHeaders"
                      :items="details[item.Nomor]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-4">Tidak ada data detail.</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

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
  </PageLayout>
</template>

<style scoped>
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

:deep(.text-grey) {
  color: #9e9e9e !important;
}
</style>

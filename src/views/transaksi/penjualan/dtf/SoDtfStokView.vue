<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

// --- Interface Header (Resize) ---
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

interface HeaderItem {
  Nomor: string;
  LHK: number;
  Jumlah: number;
  AlasanClose: string;
  Close: string;
  [key: string]: unknown;
}

interface DetailItem {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Jumlah: number;
  LHK: number;
  Kurang: number;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "36";

// --- State ---
const list = ref<HeaderItem[]>([]);
const details = ref<{ [nomor: string]: DetailItem[] }>({});
const isLoading = ref(true);
const filterDateType = ref("dtf");
const startDate = ref(format(new Date(), "yyyy-MM-dd"));
const endDate = ref(format(new Date(), "yyyy-MM-dd"));
const cabangList = ref<{ kode: string; nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || "");
const selected = ref<HeaderItem[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

// State Dialog
const isCloseDialogVisible = ref(false);
const itemToClose = ref<HeaderItem | null>(null);
const closeReason = ref("");
const isConfirmDeleteVisible = ref(false);
const itemToDelete = ref<HeaderItem | null>(null);

const filterOptions = ref([
  { title: "Nomor", value: "Nomor" },
  { title: "Nama DTF", value: "NamaDTF" },
  { title: "Sales", value: "Sales" },
  { title: "Bag. Desain", value: "BagDesain" },
  { title: "Workshop", value: "Workshop" },
  { title: "Keterangan", value: "Keterangan" },
  { title: "Alasan Close", value: "AlasanClose" },
]);
const selectedFilterField = ref("Nomor");
const filterSearchValue = ref("");

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const isSingleSelected = computed(() => selected.value.length === 1);

const filteredList = computed(() => {
  if (!filterSearchValue.value) {
    return list.value;
  }
  return list.value.filter((item) => {
    const itemValue = item[selectedFilterField.value as keyof HeaderItem];
    if (itemValue !== null && itemValue !== undefined) {
      return itemValue.toString().toLowerCase().includes(filterSearchValue.value.toLowerCase());
    }
    return false;
  });
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "Nomor", width: 180, fixed: true },
  { title: "Tanggal", key: "Tanggal", width: 120 },
  { title: "Tgl Pengerjaan", key: "TglPengerjaan", width: 140 },
  { title: "Nama DTF", key: "NamaDTF", width: 250 },
  { title: "Jumlah", key: "Jumlah", align: "end", width: 100 },
  { title: "LHK", key: "LHK", align: "center", width: 100 },
  { title: "Sales", key: "Sales", width: 200 },
  { title: "Bag. Desain", key: "BagDesain", width: 150 },
  { title: "Kain", key: "Kain", width: 150 },
  { title: "Finishing", key: "Finishing", width: 150 },
  { title: "Workshop", key: "Workshop", width: 150 },
  { title: "Alasan Close", key: "AlasanClose", width: 250 },
  { title: "Keterangan", key: "Keterangan", width: 300 },
  { title: "Created", key: "Created", width: 180 },
  { title: "Status Close", key: "Close", align: "center", width: 120 },
]);

const detailHeaders = [
  { title: "Kode", key: "Kode", width: "150px" },
  { title: "Nama", key: "Nama", width: "250px" },
  { title: "Ukuran", key: "Ukuran", width: "100px" },
  { title: "Jumlah", key: "Jumlah" },
  { title: "LHK", key: "LHK" },
  { title: "Kurang", key: "Kurang" },
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
const handleRowClick = (_event: Event, { item }: { item: HeaderItem }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/so-dtf-stok/lookup/cabang");
    cabangList.value = response.data;

    // [PERBAIKAN] Set default value ke KDC jika user adalah KDC
    if (authStore.user?.cabang === "KDC") {
      const hasKdc = cabangList.value.some((c) => c.kode === "KDC");
      selectedCabang.value = hasKdc ? "KDC" : cabangList.value[0]?.kode || "";
    } else if (cabangList.value.length > 0) {
      selectedCabang.value = cabangList.value[0].kode;
    }
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value || !selectedCabang.value) return;
  isLoading.value = true;
  try {
    const response = await api.get("/so-dtf-stok", {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
        filterDateType: filterDateType.value,
      },
    });
    list.value = response.data;
  } catch {
    toast.error("Gagal memuat data SO DTF Stok.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: HeaderItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/so-dtf-stok/${nomorToLoad}`, {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
        filterDateType: filterDateType.value,
      },
    });
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    expanded.value = expanded.value.filter((nomor) => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const openCloseDialog = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.LHK >= item.Jumlah) {
    toast.warning("LHK sudah terpenuhi atau lebih, tidak bisa di-close.");
    return;
  }
  itemToClose.value = item;
  closeReason.value = item.AlasanClose || "";
  isCloseDialogVisible.value = true;
};

const submitClose = async () => {
  if (!itemToClose.value) return;
  try {
    await api.post("/so-dtf-stok/close", {
      nomor: itemToClose.value.Nomor,
      alasan: closeReason.value,
      user: authStore.user?.kode,
    });
    toast.success("SO berhasil ditutup.");
    isCloseDialogVisible.value = false;
    fetchData();
    selected.value = [];
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal menutup SO.");
  }
};

const exportData = async (type: "header" | "detail") => {
  const filters = {
    startDate: startDate.value,
    endDate: endDate.value,
    cabang: selectedCabang.value,
    filterDateType: filterDateType.value,
  };
  try {
    if (type === "header") {
      if (list.value.length === 0) {
        toast.warning("Tidak ada data untuk diekspor.");
        return;
      }
      toast.info("Membuat file Excel Header...");
      const worksheet = XLSX.utils.json_to_sheet(list.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SO DTF Stok Header");
      XLSX.writeFile(workbook, "Export_SO_DTF_Stok_Header.xlsx");
      toast.success("File Header berhasil dibuat.");
    } else {
      toast.info("Mengambil data detail dari server...");
      const response = await api.get("/so-dtf-stok/export-detail", { params: filters });
      if (response.data.length === 0) {
        toast.warning("Tidak ada data detail untuk diekspor.");
        return;
      }
      toast.info("Membuat file Excel Detail...");
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SO DTF Stok Detail");
      XLSX.writeFile(workbook, "Export_SO_DTF_Stok_Detail.xlsx");
      toast.success("File Detail berhasil dibuat.");
    }
  } catch {
    toast.error("Gagal mengekspor data.");
  }
};

const getRowClass = (item: HeaderItem) => {
  if (item.AlasanClose) return "row-closed";
  return "";
};

const getLhkClass = (item: HeaderItem) => {
  if (item.LHK === 0) return "lhk-zero";
  if (item.LHK > 0 && item.LHK < item.Jumlah) return "lhk-progress";
  return "lhk-normal";
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  const url = router.resolve({
    name: "Cetak SO DTF Stok",
    params: { nomor: item.Nomor },
  }).href;
  window.open(url, "_blank");
};

const showDeleteConfirmation = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Close === "Y") {
    toast.warning("Transaksi sudah ditutup, tidak bisa dihapus.");
    return;
  }
  itemToDelete.value = item;
  isConfirmDeleteVisible.value = true;
};

const executeDelete = async () => {
  if (!itemToDelete.value) return;
  try {
    await api.delete(`/so-dtf-stok/${itemToDelete.value.Nomor}`);
    toast.success("Data berhasil dihapus.");
    fetchData();
    selected.value = [];
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal menghapus data.");
  } finally {
    isConfirmDeleteVisible.value = false;
    itemToDelete.value = null;
  }
};

onMounted(() => {
  if (hasViewPermission.value) {
    fetchCabangList();
    fetchData();
  }
});

watch([startDate, endDate, selectedCabang, filterDateType], fetchData);
</script>

<template>
  <PageLayout title="SO DTF Stok" desktop-mode icon="mdi-package-variant-closed">
    <template #header-actions>
      <v-btn
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/dtf/so-dtf-stok/new')"
      >
        Baru
      </v-btn>
      <v-btn
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="router.push(`/transaksi/penjualan/dtf/so-dtf-stok/ubah/${selected[0].Nomor}`)"
      >
        Ubah
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
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        :disabled="!isSingleSelected"
        @click="printData"
        color="green"
        prepend-icon="mdi-printer"
      >
        Cetak
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
      <v-divider vertical class="mx-2"></v-divider>
      <v-btn
        size="small"
        :disabled="!isSingleSelected"
        color="orange-darken-2"
        @click="openCloseDialog"
      >
        Close SO
      </v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <v-radio-group v-model="filterDateType" inline hide-details density="compact" class="me-4">
          <template #label><span class="filter-label">Filter:</span></template>
          <v-radio label="Tgl SO DTF" value="dtf"></v-radio>
          <v-radio label="Tgl Pengerjaan" value="pengerjaan"></v-radio>
        </v-radio-group>
        <v-text-field
          v-model="startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 140px"
        />
        <span class="mx-2">s/d</span>
        <v-text-field
          v-model="endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 140px"
        />
        <v-select
          v-model="selectedCabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-2"
          style="min-width: 180px"
        />
        <v-divider vertical class="mx-2"></v-divider>
        <div class="d-flex align-center ga-2">
          <v-select
            v-model="selectedFilterField"
            :items="filterOptions"
            label="Filter Berdasarkan"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 180px"
          ></v-select>
          <v-text-field
            v-model="filterSearchValue"
            label="Cari..."
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 250px"
            clearable
            prepend-inner-icon="mdi-magnify"
          ></v-text-field>
        </div>
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="legend-section">
        <div class="legend-group">
          <strong class="legend-title">Status SO:</strong>
          <div class="legend-item"><span class="row-color-sample-closed"></span> Di-Close</div>
        </div>
        <v-divider vertical></v-divider>
        <div class="legend-group">
          <strong class="legend-title">Status LHK:</strong>
          <div class="legend-item">
            <v-chip size="x-small" class="lhk-zero" label>0</v-chip> Belum Input
          </div>
          <div class="legend-item">
            <v-chip size="x-small" class="lhk-progress" label>1</v-chip> Progress
          </div>
        </div>
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="filteredList"
          :loading="isLoading"
          item-value="Nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          show-expand
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
          :item-props="(item: HeaderItem) => ({ class: getRowClass(item) })"
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
            <td>
              <template v-if="['Tanggal', 'TglPengerjaan', 'Created'].includes(header.key)">
                {{
                  item[header.key]
                    ? format(
                        parseISO(item[header.key] as string),
                        header.key === "Created" ? "dd/MM/yyyy HH:mm:ss" : "dd/MM/yyyy"
                      )
                    : "-"
                }}
              </template>
              <template v-else-if="header.key === 'LHK'">
                <v-chip :class="getLhkClass(item)" size="x-small" label>{{ item.LHK }}</v-chip>
              </template>
              <template v-else-if="header.key === 'Close'">
                <v-chip :color="item.Close === 'Y' ? 'success' : 'grey'" size="x-small">
                  {{ item.Close === "Y" ? "Closed" : "Open" }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'Keterangan'">
                <div style="white-space: pre-wrap; line-height: 1.4; min-width: 250px">
                  {{ item[header.key] }}
                </div>
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">
                      <v-progress-circular
                        indeterminate
                        size="20"
                        class="mr-2"
                      ></v-progress-circular>
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
                    <div v-else class="text-center text-caption py-2 text-grey">
                      Tidak ada data detail.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">Isi Alasan Close SO</v-card-title>
        <v-card-text class="pa-4">
          <p class="text-caption mb-2">
            Anda akan menutup SO Nomor: <strong>{{ itemToClose?.Nomor }}</strong>
          </p>
          <v-textarea
            v-model="closeReason"
            label="Alasan"
            rows="3"
            variant="outlined"
            autofocus
          ></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="primary" @click="submitClose">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isConfirmDeleteVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Anda yakin ingin menghapus SO DTF Stok Nomor: <strong>{{ itemToDelete?.Nomor }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isConfirmDeleteVisible = false"
            >Batal</v-btn
          >
          <v-btn color="error" @click="executeDelete">Ya, Hapus</v-btn>
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

/* Paksa field filter ikut dark mode */
.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section:deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.legend-section {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  font-size: 11px;
  flex-shrink: 0;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.legend-group,
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Desktop Table Full Height */
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

/* Resize Header */
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
  border-right: 2px solid #1565c0;
}

/* Detail Sticky */
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

/* Row Styles */
.row-closed :deep(td:first-child) {
  background-color: #ffff99;
  font-weight: bold;
}

/* Belum Input */
.lhk-zero {
  background-color: rgba(var(--v-theme-error), 0.25) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-weight: 600;
}

/* Progress */
.lhk-progress {
  background-color: rgba(var(--v-theme-primary), 0.25) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-weight: 600;
}

.lhk-normal {
  background-color: rgba(var(--v-theme-on-surface), 0.12) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.lhk-zero :deep(.v-chip__content),
.lhk-progress :deep(.v-chip__content),
.lhk-normal :deep(.v-chip__content) {
  color: rgb(var(--v-theme-on-surface)) !important;
}

.row-color-sample-closed {
  background-color: #ffff99;
  width: 14px;
  height: 14px;
  border: 1px solid #e0e0e0;
  display: inline-block;
}

.state-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>

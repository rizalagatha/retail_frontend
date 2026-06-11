<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, subDays, addDays, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import AppDataTable from "@/components/AppDataTable.vue";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "226";

// --- Interfaces ---
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
  sortable?: boolean;
}

interface DasborItem {
  TglSPK: string;
  Kuota: number;
  TotalSPK: number;
  TotalJumlah: number;
  Sisa: number;
  SaldoAkumulatif: number;
}

interface DetailItem {
  NomorSPK: string;
  TglSPK: string;
  Cabang: string;
  NamaDesain: string;
  Jumlah: number;
  Kain: string;
  Ukuran: string;
  UserCreate: string;
  Dateline: string | null;
  CMO: string;
  StatusPending: string;
  StatusKerja: string;
  KetPending: string;
  Keterangan: string;
}

// --- State ---
const dasborList = ref<DasborItem[]>([]);
const details = ref<{ [key: string]: DetailItem[] }>({});
const isLoading = ref(true);
const startDate = ref(format(subDays(new Date(), 2), "yyyy-MM-dd"));
const endDate = ref(format(addDays(new Date(), 7), "yyyy-MM-dd"));
const cabangList = ref<{ kode: string; nama: string }[]>([]);
const selectedCabang = ref("");
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

// --- Headers Master ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Tgl SPK", key: "TglSPK", width: 160, align: "start" },
  { title: "Kuota/Hari", key: "Kuota", width: 110, align: "center" },
  { title: "Total SPK", key: "TotalSPK", width: 110, align: "center" },
  { title: "Total Jumlah (pcs)", key: "TotalJumlah", width: 160, align: "center" },
  { title: "Sisa Kuota", key: "Sisa", width: 110, align: "center" },
  { title: "Saldo Kuota Akumulatif (pcs)", key: "SaldoAkumulatif", width: 200, align: "center" },
]);

// --- Headers Detail ---
const detailHeaders = [
  { title: "No. SPK", key: "NomorSPK", width: "180px" },
  { title: "Tgl SPK", key: "TglSPK", width: "110px" },
  { title: "Cabang", key: "Cabang", width: "100px", align: "center" },
  { title: "Nama SPK", key: "NamaDesain", width: "260px" },
  { title: "Jumlah", key: "Jumlah", align: "end", width: "80px" },
  { title: "Dateline", key: "Dateline", align: "center", width: "100px" },
  { title: "User", key: "UserCreate", align: "center", width: "80px" },
  { title: "CMO", key: "CMO", align: "center", width: "90px" },
  { title: "Status", key: "StatusKerja", align: "center", width: "100px" },
  { title: "Keterangan", key: "KetPending", width: "180px" },
] as const;

// --- Resize Logic ---
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

// --- Row class ---
const getRowClass = (item: DasborItem) => {
  if (item.Sisa < 0) return "row-sisa-minus";
  return "";
};

// --- Fetch ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/dasbor-spk/cabang-list");
    cabangList.value = response.data;
    if (authStore.user?.cabang === "KDC" && cabangList.value.length > 0) {
      selectedCabang.value = cabangList.value[0].kode;
    } else if (authStore.user?.cabang !== "KDC") {
      selectedCabang.value = authStore.user?.cabang || "";
    }
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value) return;
  isLoading.value = true;
  details.value = {};
  expanded.value = [];
  try {
    const response = await api.get("/dasbor-spk", {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
      },
    });
    dasborList.value = response.data;
  } catch {
    toast.error("Gagal memuat data dasbor SPK.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: string[]) => {
  const tglToLoad = newlyExpandedItems.find(
    (tgl) => !details.value[tgl] && !loadingDetails.value.has(tgl)
  );
  if (!tglToLoad) return;

  loadingDetails.value.add(tglToLoad);
  try {
    const response = await api.get("/dasbor-spk/detail", {
      params: { tanggal: tglToLoad },
    });
    details.value[tglToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk tanggal ${tglToLoad}`);
    expanded.value = expanded.value.filter((tgl) => tgl !== tglToLoad);
  } finally {
    loadingDetails.value.delete(tglToLoad);
  }
};

// --- Export ---
const exportData = async (type: "header" | "detail") => {
  const endpoint = type === "header" ? "/dasbor-spk/export-header" : "/dasbor-spk/export-detail";
  const fileName =
    type === "header" ? `DasborSPK_Ringkasan_GLOBAL.xlsx` : `DasborSPK_Detail_GLOBAL.xlsx`;
  toast.info(`Mempersiapkan file ${fileName}...`);
  try {
    const response = await api.get(endpoint, {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
      },
    });
    const worksheet = XLSX.utils.json_to_sheet(response.data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, fileName);
    toast.success("File berhasil diekspor.");
  } catch {
    toast.error("Gagal mengekspor data.");
  }
};

const getSisaColor = (sisa: number): string => {
  if (sisa < 0) return "#c62828";
  if (sisa < 60) return "#e65100";
  return "#2e7d32";
};

onMounted(() => {
  if (hasViewPermission.value) {
    fetchCabangList();
    fetchData();
  }
});

watch([startDate, endDate, selectedCabang], fetchData);
</script>

<template>
  <PageLayout title="Dasbor SPK Kaosan" desktop-mode icon="mdi-file-document-check-outline">
    <template #header-actions>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Ringkasan</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')">
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
      <!-- ── Filter Bar ── -->
      <div class="filter-section">
        <span class="filter-label">Tgl SPK:</span>
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
        <v-spacer />
        <span class="text-caption text-blue-darken-2 font-weight-bold mr-1">
          <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>
          Kuota: 150 Pcs/hari
        </span>
        <v-btn
          @click="fetchData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          title="Muat Ulang Data"
        />
      </div>

      <!-- ── Table ── -->
      <div class="table-container">
        <AppDataTable
          v-model:expanded="expanded"
          :headers="headers"
          :items="dasborList"
          :loading="isLoading"
          item-value="TglSPK"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-expand
          @update:expanded="loadDetails"
          :item-props="(item: DasborItem) => ({ class: getRowClass(item) })"
        >
          <!-- Resizable headers -->
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

          <!-- Expand button -->
          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn
              :icon="isExpanded(internalItem) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              size="x-small"
              variant="text"
              @click.stop="toggleExpand(internalItem)"
            />
          </template>

          <!-- TglSPK -->
          <template #[`item.TglSPK`]="{ item }">
            <td>{{ format(parseISO(item.TglSPK), "dd-MM-yyyy") }}</td>
          </template>

          <!-- Kuota -->
          <template #[`item.Kuota`]="{ item }">
            <td class="text-center">{{ item.Kuota }}</td>
          </template>

          <!-- TotalSPK -->
          <template #[`item.TotalSPK`]="{ item }">
            <td class="text-center">
              <span
                :class="
                  item.TotalSPK > item.Kuota ? 'text-error font-weight-black' : 'font-weight-bold'
                "
              >
                {{ item.TotalSPK }}
              </span>
            </td>
          </template>

          <!-- TotalJumlah -->
          <template #[`item.TotalJumlah`]="{ item }">
            <td class="text-center">{{ item.TotalJumlah.toLocaleString("id-ID") }} pcs</td>
          </template>

          <!-- Sisa -->
          <template #[`item.Sisa`]="{ item }">
            <td class="text-center font-weight-bold" :style="{ color: getSisaColor(item.Sisa) }">
              {{ item.Sisa > 0 ? "+" : "" }}{{ item.Sisa }}
            </td>
          </template>

          <template #[`item.SaldoAkumulatif`]="{ item, index }">
            <td class="text-center">
              <v-tooltip v-if="item.SaldoAkumulatif < 0" location="top" color="error">
                <template v-slot:activator="{ props }">
                  <v-chip
                    v-bind="props"
                    size="small"
                    color="error"
                    variant="flat"
                    class="font-weight-bold"
                  >
                    <v-icon start size="x-small">mdi-alert-circle</v-icon>
                    {{ item.SaldoAkumulatif }}
                  </v-chip>
                </template>
                <div class="text-caption text-white">
                  <strong>Warning:</strong><br />
                  {{ item.SaldoAkumulatif }} pcs backlog on
                  {{ format(parseISO(item.TglSPK), "dd-MM") }}.<br />
                  The accumulated quota is overdrawn.
                </div>
              </v-tooltip>

              <v-tooltip v-else location="top" color="success">
                <template v-slot:activator="{ props }">
                  <v-chip
                    v-bind="props"
                    size="small"
                    color="success"
                    variant="flat"
                    class="font-weight-bold"
                  >
                    <v-icon start size="x-small">mdi-check-circle</v-icon>
                    +{{ item.SaldoAkumulatif }}
                  </v-chip>
                </template>
                <div class="text-caption text-white">
                  <span v-if="index > 0 && dasborList[index - 1].SaldoAkumulatif < 0">
                    <strong>TITIK IMPAS!</strong><br />Backlog cleared.
                  </span>
                  <span v-else>Surplus: +{{ item.SaldoAkumulatif }} pcs</span>
                </div>
              </v-tooltip>
            </td>
          </template>

          <!-- Expanded row detail -->
          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.TglSPK)" class="text-center py-3">
                      <v-progress-circular indeterminate size="20" class="mr-2" />
                      Memuat detail...
                    </div>

                    <v-data-table
                      v-else-if="details[item.TglSPK]"
                      :headers="detailHeaders"
                      :items="details[item.TglSPK]"
                      item-value="NomorSPK"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #bottom></template>

                      <template #[`item.NomorSPK`]="{ item: det }">
                        <span
                          class="font-weight-bold text-blue-darken-3"
                          style="font-family: monospace; font-size: 11px; white-space: nowrap"
                        >
                          {{ det.NomorSPK }}
                        </span>
                      </template>

                      <template #[`item.Cabang`]="{ item: det }">
                        <v-chip
                          size="x-small"
                          color="blue-grey"
                          variant="tonal"
                          class="font-weight-bold"
                        >
                          {{ det.Cabang || "-" }}
                        </v-chip>
                      </template>

                      <template #[`item.Jumlah`]="{ item: det }">
                        <span class="font-weight-bold">
                          {{ Number(det.Jumlah).toLocaleString("id-ID") }} pcs
                        </span>
                      </template>

                      <template #[`item.Dateline`]="{ item: det }">
                        <span
                          class="font-weight-bold"
                          :class="det.Dateline ? 'text-error' : 'text-grey'"
                        >
                          {{ det.Dateline || "-" }}
                        </span>
                      </template>

                      <template #[`item.CMO`]="{ item: det }">
                        <v-chip
                          size="x-small"
                          :color="det.CMO && det.CMO.trim() !== '' ? 'success' : 'grey'"
                          variant="flat"
                          class="font-weight-bold"
                        >
                          {{ det.CMO && det.CMO.trim() !== "" ? det.CMO : "Belum" }}
                        </v-chip>
                      </template>

                      <template #[`item.StatusKerja`]="{ item: det }">
                        <v-chip
                          size="x-small"
                          :color="
                            det.StatusKerja === 'TOP URGENT'
                              ? 'error'
                              : det.StatusKerja === 'URGENT'
                              ? 'warning'
                              : det.StatusKerja === 'STANDART'
                              ? 'info'
                              : det.StatusKerja === 'REGULER'
                              ? 'success'
                              : 'grey'
                          "
                          variant="flat"
                          class="font-weight-bold"
                        >
                          {{ det.StatusKerja || "REGULER" }}
                        </v-chip>
                      </template>

                      <template #[`item.KetPending`]="{ item: det }">
                        <span
                          class="text-caption text-grey font-italic d-inline-block text-truncate"
                          style="max-width: 150px"
                          :title="det.KetPending || det.Keterangan || '-'"
                        >
                          {{ det.KetPending || det.Keterangan || "-" }}
                        </span>
                      </template>
                    </v-data-table>

                    <div v-else class="text-center text-caption py-3 text-grey">
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
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  flex-shrink: 0;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined) {
  background-color: rgb(var(--v-theme-surface)) !important;
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
  overflow-x: auto !important;
  overflow-y: auto !important;
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
  border-radius: 4px;
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.row-sisa-minus :deep(td) {
  color: red !important;
  font-weight: bold;
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.filter-label {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
}
</style>

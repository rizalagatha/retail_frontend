<script setup lang="ts">
import { ref, reactive, onMounted, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import AppDataTable from "@/components/AppDataTable.vue";
import { type AxiosError } from "axios";

// --- INTERFACES ---
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
}

interface DeviceItem {
  deviceId: string;
  kodeUser: string;
  namaUser: string;
  cabang: string;
  deviceName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  tanggalDaftar: string;
  tanggalProses: string | null;
  diprosesOleh: string | null;
}

// --- INITIALIZATION ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "900";

// --- STATE ---
const deviceData = ref<DeviceItem[]>([]);
const isLoading = ref(false);
const isProcessing = ref(false);

const filters = reactive({
  status: "PENDING", // Default tab/filter
  term: "",
});

const hasViewPermission = authStore.can(MENU_ID, "view");
const hasEditPermission = authStore.can(MENU_ID, "edit");

// --- HEADERS DEFINITION ---
const headers = ref<DataTableHeader[]>([
  { title: "Status", key: "status", fixed: true, width: 120, align: "center" },
  { title: "Tgl Daftar", key: "tanggalDaftar", width: 150 },
  { title: "Kode User", key: "kodeUser", width: 120 },
  { title: "Nama Pengguna", key: "namaUser", width: 200 },
  { title: "Cabang", key: "cabang", width: 100, align: "center" },
  { title: "Device Name", key: "deviceName", width: 180 },
  { title: "Waktu Diproses", key: "tanggalProses", width: 150 },
  { title: "Diproses Oleh", key: "diprosesOleh", width: 130 },
  { title: "Aksi", key: "actions", width: 160, align: "center" },
]);

// --- RESIZE LOGIC ---
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

// --- API METHODS ---
const fetchReportData = async () => {
  isLoading.value = true;
  try {
    const params: Record<string, string> = { term: filters.term };
    if (filters.status !== "ALL") params.status = filters.status;

    const response = await api.get("/tools/approval-mobile", { params });
    deviceData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data otorisasi perangkat.");
  } finally {
    isLoading.value = false;
  }
};

const clearSearch = () => {
  filters.term = "";
  fetchReportData();
};

let searchTimeout: ReturnType<typeof setTimeout>;
const onSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(fetchReportData, 600);
};

// --- STATE DIALOG KONFIRMASI ---
const confirmDialog = reactive({
  isOpen: false,
  actionType: "" as "APPROVE" | "REJECT",
  deviceId: "",
  namaUser: "",
  deviceName: "",
});

// --- ACTION METHODS ---
const openConfirmDialog = (
  action: "APPROVE" | "REJECT",
  deviceId: string,
  namaUser: string,
  deviceName: string
) => {
  if (action === "APPROVE" && !hasEditPermission)
    return toast.warning("Anda tidak memiliki akses untuk menyetujui.");
  if (action === "REJECT" && !hasEditPermission)
    return toast.warning("Anda tidak memiliki akses untuk menolak/mencabut.");

  confirmDialog.actionType = action;
  confirmDialog.deviceId = deviceId;
  confirmDialog.namaUser = namaUser;
  confirmDialog.deviceName = deviceName;
  confirmDialog.isOpen = true;
};

const executeAction = async () => {
  confirmDialog.isOpen = false; // Tutup dialog segera
  isProcessing.value = true;

  try {
    if (confirmDialog.actionType === "APPROVE") {
      const res = await api.put(`/tools/approval-mobile/approve/${confirmDialog.deviceId}`);
      toast.success(res.data.message || "Perangkat berhasil disetujui.");
    } else {
      const res = await api.put(`/tools/approval-mobile/reject/${confirmDialog.deviceId}`);
      toast.success(res.data.message || "Izin perangkat berhasil dicabut.");
    }
    fetchReportData(); // Refresh tabel
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memproses izin perangkat.");
  } finally {
    isProcessing.value = false;
  }
};

onMounted(() => {
  if (hasViewPermission) {
    fetchReportData();
  }
});

watch(
  () => filters.status,
  () => {
    fetchReportData();
  }
);
</script>

<template>
  <PageLayout title="Approval Perangkat Mobile" icon="mdi-cellphone-key">
    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <v-tabs
        v-model="filters.status"
        color="primary"
        density="compact"
        bg-color="grey-lighten-4"
        class="flex-shrink-0"
      >
        <v-tab value="PENDING" class="font-weight-bold text-none">
          <v-icon start color="orange">mdi-clock-outline</v-icon> Menunggu Persetujuan
        </v-tab>
        <v-tab value="APPROVED" class="font-weight-bold text-none">
          <v-icon start color="success">mdi-check-circle-outline</v-icon> Disetujui
        </v-tab>
        <v-tab value="REJECTED" class="font-weight-bold text-none">
          <v-icon start color="error">mdi-close-circle-outline</v-icon> Ditolak / Dicabut
        </v-tab>
        <v-tab value="ALL" class="font-weight-bold text-none">
          <v-icon start>mdi-format-list-bulleted</v-icon> Semua Data
        </v-tab>
      </v-tabs>

      <div class="filter-section lost-order-filter">
        <div class="d-flex align-center flex-grow-1 mx-4 filter-group-center">
          <v-text-field
            v-model="filters.term"
            placeholder="Cari kode user / nama / device..."
            density="compact"
            hide-details
            variant="outlined"
            clearable
            prepend-inner-icon="mdi-magnify"
            class="flex-grow-input keyword-input"
            @input="onSearchInput"
            @click:clear="clearSearch"
          />
        </div>

        <div class="d-flex align-center ga-2 flex-shrink-0 filter-group-right">
          <v-btn
            @click="fetchReportData"
            icon="mdi-refresh"
            variant="text"
            size="small"
            :loading="isLoading"
            title="Refresh"
            class="ms-2"
          />
        </div>
      </div>

      <div class="table-container">
        <AppDataTable
          :headers="headers"
          :items="deviceData"
          :loading="isLoading || isProcessing"
          class="desktop-table header-browse-blue"
          density="compact"
          fixed-header
          item-value="deviceId"
          :items-per-page="-1"
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
                  :class="{ 'text-center': header.align === 'center' }"
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

          <template #[`item.status`]="{ item }">
            <v-chip
              size="x-small"
              :color="
                item.status === 'APPROVED'
                  ? 'success'
                  : item.status === 'PENDING'
                  ? 'warning'
                  : 'error'
              "
              class="font-weight-bold"
              variant="flat"
            >
              {{ item.status }}
            </v-chip>
          </template>

          <template #[`item.tanggalDaftar`]="{ item }">
            <div>
              <div>
                {{
                  item.tanggalDaftar
                    ? format(new Date(item.tanggalDaftar as string), "dd/MM/yyyy")
                    : ""
                }}
              </div>
              <div class="text-caption text-grey-darken-1">
                {{
                  item.tanggalDaftar
                    ? format(new Date(item.tanggalDaftar as string), "HH:mm:ss")
                    : ""
                }}
              </div>
            </div>
          </template>

          <template #[`item.tanggalProses`]="{ item }">
            <div v-if="item.tanggalProses">
              <div>{{ format(new Date(item.tanggalProses as string), "dd/MM/yyyy") }}</div>
              <div class="text-caption text-grey-darken-1">
                {{ format(new Date(item.tanggalProses as string), "HH:mm:ss") }}
              </div>
            </div>
            <span v-else class="text-grey">-</span>
          </template>

          <!-- KOLOM AKSI -->
          <template #[`item.actions`]="{ item }">
            <div class="d-flex ga-2 justify-center align-center">
              <v-btn
                v-if="item.status === 'PENDING' || item.status === 'REJECTED'"
                color="success"
                size="x-small"
                variant="flat"
                prepend-icon="mdi-check"
                :disabled="isProcessing"
                @click="openConfirmDialog('APPROVE', item.deviceId, item.namaUser, item.deviceName)"
              >
                Approve
              </v-btn>

              <v-btn
                v-if="item.status === 'PENDING' || item.status === 'APPROVED'"
                color="error"
                size="x-small"
                variant="flat"
                prepend-icon="mdi-close"
                :disabled="isProcessing"
                @click="openConfirmDialog('REJECT', item.deviceId, item.namaUser, item.deviceName)"
              >
                {{ item.status === "APPROVED" ? "Cabut" : "Tolak" }}
              </v-btn>
            </div>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="confirmDialog.isOpen" max-width="450" persistent>
      <v-card rounded="xl" elevation="10">
        <v-card-title class="d-flex align-center pa-4 bg-grey-lighten-4">
          <v-icon
            :color="confirmDialog.actionType === 'APPROVE' ? 'success' : 'error'"
            class="mr-2"
          >
            {{ confirmDialog.actionType === "APPROVE" ? "mdi-shield-check" : "mdi-shield-remove" }}
          </v-icon>
          <span class="text-h6 font-weight-bold">Konfirmasi Otorisasi</span>
        </v-card-title>

        <v-card-text class="pa-5 text-body-1 text-center">
          Apakah Anda yakin ingin
          <strong :class="confirmDialog.actionType === 'APPROVE' ? 'text-success' : 'text-error'">
            {{ confirmDialog.actionType === "APPROVE" ? "MENYETUJUI" : "MENCABUT/MENOLAK" }}
          </strong>
          akses perangkat <strong class="text-primary">{{ confirmDialog.deviceName }}</strong> untuk
          pengguna <strong>{{ confirmDialog.namaUser }}</strong
          >?
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions class="pa-4 justify-space-between">
          <v-btn
            variant="tonal"
            color="grey-darken-1"
            class="px-5 font-weight-bold"
            @click="confirmDialog.isOpen = false"
          >
            Batal
          </v-btn>
          <v-btn
            variant="flat"
            :color="confirmDialog.actionType === 'APPROVE' ? 'success' : 'error'"
            class="px-5 font-weight-bold"
            @click="executeAction"
          >
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────────────── */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

/* ── Filter Section (Override Lokal) ─────────────────────────────────────────── */
.filter-section {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
}

.filter-group-center {
  flex: 0 0 auto !important;
  width: 350px;
  margin-left: 8px !important;
  margin-right: auto !important;
}
.filter-group-right {
  flex: 0 0 auto;
  justify-content: flex-end;
}

.lost-order-filter :deep(.flex-grow-input) {
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: none !important;
}
.lost-order-filter :deep(.flex-grow-input .v-input__control),
.lost-order-filter :deep(.flex-grow-input .v-field) {
  width: 100% !important;
}
.lost-order-filter :deep(.keyword-input) {
  width: 100% !important;
  min-width: unset !important;
}

.filter-section :deep(.v-field) {
  font-size: 11px !important;
  min-height: 28px !important;
  height: 28px !important;
  background-color: rgb(var(--v-theme-surface)) !important;
}
.filter-section :deep(.v-field__input) {
  font-size: 11px !important;
  min-height: 28px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.filter-section :deep(.v-field__append-inner .v-icon),
.filter-section :deep(.v-field__prepend-inner .v-icon) {
  font-size: 14px !important;
}

/* ── Tabel Data ──────────────────────────────────────────────────────────────── */
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

.desktop-table :deep(td) {
  white-space: nowrap;
  height: 32px !important;
  padding: 0 8px !important;
}

/* ── Resizable Header ────────────────────────────────────────────────────────── */
.resizable-header {
  position: relative;
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #0d47a1 !important;
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

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}
</style>

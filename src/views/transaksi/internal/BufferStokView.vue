<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import * as XLSX from "xlsx";
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

interface BufferStockItem {
  Status: string;
  KtgProduk: string;
  Kode: string;
  Barcode: string;
  Nama: string;
  Ukuran: string;
  Stok: number;
  MinBuffer: number;
  MaxBuffer: number;
  Harus_Minta: number;
  Sudah_Minta: number;
  // Detail OTW
  OTW_Minta: number;
  OTW_PL: number;
  OTW_SJ: number;
}

interface CabangList {
  kode: string;
  nama: string;
}

const toast = useToast();
const authStore = useAuthStore();

// --- State ---
const list = ref<BufferStockItem[]>([]);
const isLoading = ref(true);
const cabangList = ref<CabangList[]>([]);
const selectedCabang = ref(authStore.user?.cabang || "");
const selected = ref<BufferStockItem[]>([]);
const tampilkanBufferNol = ref(false);
const kaosan = ref(true);
const reszo = ref(false);

const isSettingVisible = ref(false);
const isSettingSaving = ref(false);
const itemToSetting = ref<BufferStockItem | null>(null);
const minBuffer = ref(0);
const maxBuffer = ref(0);

const hasAccess = computed(() => authStore.isAuthenticated);

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "Status", key: "Status", width: 120, fixed: true },
  { title: "Kategori", key: "KtgProduk", width: 120 },
  { title: "Kode", key: "Kode", width: 120 },
  { title: "Barcode", key: "Barcode", width: 120 },
  { title: "Nama", key: "Nama", width: 300 },
  { title: "Ukuran", key: "Ukuran", width: 80 },
  { title: "Stok", key: "Stok", align: "start", width: 80 },
  { title: "Min", key: "MinBuffer", align: "start", width: 80 },
  { title: "Max", key: "MaxBuffer", align: "start", width: 80 },
  { title: "OTW", key: "Sudah_Minta", align: "start", width: 90 },
  { title: "Harus Minta", key: "Harus_Minta", align: "start", width: 100 },
]);

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
const handleRowClick = (_event: Event, { item }: { item: BufferStockItem }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/buffer-stock/lookup/cabang");
    cabangList.value = response.data;
    if (authStore.user?.cabang !== "KDC" && cabangList.value.length > 0) {
      selectedCabang.value = authStore.user?.cabang || "";
    } else if (authStore.user?.cabang === "KDC" && cabangList.value.length > 0) {
      selectedCabang.value = "KDC";
    }
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/buffer-stock", {
      params: {
        cabang: selectedCabang.value,
        tampilkanBufferNol: tampilkanBufferNol.value,
        kaosan: kaosan.value,
        reszo: reszo.value,
      },
    });
    list.value = response.data;
  } catch {
    toast.error("Gagal memuat data buffer stok.");
  } finally {
    isLoading.value = false;
  }
};

const openSetting = (item: BufferStockItem) => {
  itemToSetting.value = item;
  minBuffer.value = item.MinBuffer || 0;
  maxBuffer.value = item.MaxBuffer || 0;
  isSettingVisible.value = true;
};

const saveSetting = async () => {
  if (!itemToSetting.value) return;
  if (minBuffer.value > maxBuffer.value && maxBuffer.value !== 0) {
    toast.error("Minimal Stok tidak boleh lebih besar dari Maximal Stok.");
    return;
  }

  isSettingSaving.value = true;
  try {
    const payload = {
      kode: itemToSetting.value.Kode,
      ukuran: itemToSetting.value.Ukuran,
      min: minBuffer.value,
      max: maxBuffer.value,
    };
    await api.post("/buffer-stock/setting", payload);

    const itemInList = list.value.find((i) => i.Barcode === itemToSetting.value?.Barcode);
    if (itemInList) {
      itemInList.MinBuffer = minBuffer.value;
      itemInList.MaxBuffer = maxBuffer.value;
      itemInList.Harus_Minta =
        itemInList.Stok < minBuffer.value && minBuffer.value > 0
          ? maxBuffer.value - itemInList.Stok
          : 0;
    }

    toast.success("Pengaturan buffer berhasil disimpan.");
    isSettingVisible.value = false;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "response" in error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Gagal menyimpan pengaturan.");
    } else {
      toast.error("Gagal menyimpan pengaturan.");
    }
  } finally {
    isSettingSaving.value = false;
  }
};

const getRowTextColor = (item: BufferStockItem) => {
  const stokEfektif = (item.Stok || 0) + (item.Sudah_Minta || 0);
  if (stokEfektif < (item.MinBuffer || 0) && (item.MinBuffer || 0) > 0) {
    return "text-red font-weight-bold"; // Harus Minta
  }
  if ((item.Sudah_Minta || 0) > 0 && stokEfektif >= (item.MinBuffer || 0)) {
    return "text-green font-weight-bold"; // OTW sudah cukup menutupi
  }
  if ((item.Sudah_Minta || 0) > 0) {
    return "text-blue font-weight-bold"; // Ada OTW tapi belum cukup
  }
  return "";
};

const exportData = () => {
  if (list.value.length === 0) {
    return toast.warning("Tidak ada data untuk diekspor.");
  }
  try {
    toast.info("Membuat file Excel...");
    const worksheet = XLSX.utils.json_to_sheet(list.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Buffer Stok");
    XLSX.writeFile(workbook, "Export_Buffer_Stok.xlsx");
    toast.success("File berhasil dibuat.");
  } catch {
    toast.error("Gagal mengekspor data.");
  }
};

onMounted(() => {
  if (hasAccess.value) {
    fetchCabangList();
    fetchData();
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki akses ke halaman ini.");
  }
});

watch([selectedCabang, tampilkanBufferNol, kaosan, reszo], fetchData);
</script>

<template>
  <PageLayout title="Buffer Stok" desktop-mode icon="mdi-buffer">
    <template #header-actions>
      <v-btn
        size="small"
        prepend-icon="mdi-cog"
        :disabled="selected.length !== 1"
        @click="openSetting(selected[0])"
      >
        Setting (F1)
      </v-btn>
      <v-btn size="small" color="teal" @click="exportData">Export</v-btn>
    </template>

    <div v-if="!hasAccess" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Cabang:</span>
        <v-select
          v-model="selectedCabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <v-checkbox
          v-model="tampilkanBufferNol"
          label="Tampilkan Buffer=0"
          density="compact"
          hide-details
        />
        <v-checkbox v-model="kaosan" label="KAOSAN" density="compact" hide-details />
        <v-checkbox v-model="reszo" label="RESZO" density="compact" hide-details />
        <v-spacer />
        <div class="legend-group">
          <div class="legend-item">
            <v-icon color="red" size="small">mdi-circle-medium</v-icon> Harus Minta
          </div>
          <div class="legend-item">
            <v-icon color="blue" size="small">mdi-circle-medium</v-icon> OTW (Belum Cukup)
          </div>
          <div class="legend-item">
            <v-icon color="green" size="small">mdi-circle-medium</v-icon> OTW (Sudah Cukup)
          </div>
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          :headers="headers"
          :items="list"
          :loading="isLoading"
          item-value="Barcode"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
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

          <template v-for="header in headers" #[`item.${header.key}`]="{ item }" :key="header.key">
            <td :class="getRowTextColor(item)">
              <template
                v-if="
                  ['Stok', 'MinBuffer', 'MaxBuffer', 'Harus_Minta', 'Sudah_Minta'].includes(
                    header.key
                  )
                "
              >
                {{
                  new Intl.NumberFormat("id-ID").format(
                    (item[header.key as keyof BufferStockItem] as number) || 0
                  )
                }}
              </template>
              <template v-else-if="header.key === 'Status'">
                <v-chip
                  v-if="item.Status !== 'Cukup'"
                  size="x-small"
                  :color="item.Status === 'Harus Minta' ? 'error' : 'primary'"
                  variant="tonal"
                  label
                >
                  {{ item.Status }}
                </v-chip>
              </template>

              <template v-else-if="header.key === 'Sudah_Minta'">
                <v-tooltip v-if="item.Sudah_Minta > 0" location="top" max-width="220">
                  <template #activator="{ props }">
                    <span
                      v-bind="props"
                      class="otw-badge"
                      :class="{
                        'otw-cukup': item.Stok + item.Sudah_Minta >= item.MinBuffer,
                        'otw-kurang': item.Stok + item.Sudah_Minta < item.MinBuffer,
                      }"
                    >
                      {{ item.Sudah_Minta }}
                      <v-icon size="11" class="ml-1">mdi-truck-delivery-outline</v-icon>
                    </span>
                  </template>
                  <div class="otw-tooltip">
                    <div class="otw-tooltip-title">Rincian OTW</div>
                    <div class="otw-tooltip-row">
                      <span>📋 Minta Barang</span>
                      <span>{{ item.OTW_Minta || 0 }}</span>
                    </div>
                    <div class="otw-tooltip-row">
                      <span>📦 Packing List</span>
                      <span>{{ item.OTW_PL || 0 }}</span>
                    </div>
                    <div class="otw-tooltip-row">
                      <span>🚚 Surat Jalan</span>
                      <span>{{ item.OTW_SJ || 0 }}</span>
                    </div>
                    <div class="otw-tooltip-divider"></div>
                    <div class="otw-tooltip-row otw-tooltip-total">
                      <span>Total OTW</span>
                      <span>{{ item.Sudah_Minta }}</span>
                    </div>
                    <div class="otw-tooltip-row">
                      <span>Stok + OTW</span>
                      <span
                        :class="
                          item.Stok + item.Sudah_Minta >= item.MinBuffer
                            ? 'text-green-lighten-2'
                            : 'text-red-lighten-2'
                        "
                      >
                        {{ item.Stok + item.Sudah_Minta }} / {{ item.MinBuffer }} min
                      </span>
                    </div>
                  </div>
                </v-tooltip>
                <span v-else class="text-grey-lighten-1">0</span>
              </template>
              <template v-else>
                {{ item[header.key as keyof BufferStockItem] }}
              </template>
            </td>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isSettingVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title>Setting Buffer Stok</v-card-title>
        <v-card-text>
          <p class="text-subtitle-2">{{ itemToSetting?.Nama }} ({{ itemToSetting?.Ukuran }})</p>
          <v-text-field
            v-model.number="minBuffer"
            label="Minimal Stok"
            type="number"
            class="mt-4"
            density="compact"
            variant="outlined"
          />
          <v-text-field
            v-model.number="maxBuffer"
            label="Maximal Stok"
            type="number"
            density="compact"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="isSettingVisible = false">Batal</v-btn>
          <v-btn color="primary" @click="saveSetting" :loading="isSettingSaving">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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
  border-right: 2px solid rgb(var(--v-theme-on-primary));
}

/* --- Pewarnaan Baris --- */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

:deep(td.text-blue) {
  color: rgb(var(--v-theme-primary)) !important;
}

:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

:deep(td.text-blue) {
  color: rgb(var(--v-theme-primary)) !important;
}

:deep(.v-dialog) .v-card {
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.legend-group {
  display: flex;
  gap: 1rem;
  font-size: 10px;
  align-items: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.otw-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: help;
}
.otw-cukup {
  background: rgba(76, 175, 80, 0.15);
  color: #2e7d32;
}
.otw-kurang {
  background: rgba(33, 150, 243, 0.15);
  color: #1565c0;
}
.otw-tooltip {
  font-size: 11px;
  min-width: 180px;
}
.otw-tooltip-title {
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 4px;
}
.otw-tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
}
.otw-tooltip-divider {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin: 4px 0;
}
.otw-tooltip-total {
  font-weight: 700;
}
</style>

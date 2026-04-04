<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import JenisKaosSearchModal from "@/components/lookup/JenisKaosSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import * as XLSX from "xlsx";
import AppDataTable from "@/components/AppDataTable.vue";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "39";

// --- Interfaces ---
// Interface Header untuk Resize
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

interface JenisKaos {
  JenisKaos: string;
  Custom: "Y" | "N";
  [key: string]: unknown;
}
interface UkuranHarga {
  ukuran: string;
  harga: number | null;
}
interface UkuranTemplate {
  ukuran: string;
  harga: number | null;
}
interface SettingHarga {
  jenisKaos: string;
  custom: "Y" | "N";
  ukuranHarga: UkuranTemplate[];
  [key: string]: unknown;
}

// --- State ---
const jenisKaosList = ref<JenisKaos[]>([]);
const isLoading = ref(true);
const search = ref("");
const selected = ref<JenisKaos[]>([]);

const isEditPanelVisible = ref(false);
const isNew = ref(true);
const editedItem = ref({
  jenisKaos: "",
  custom: "Y",
  ukuranHarga: [] as UkuranHarga[],
});

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const isJenisKaosSearchVisible = ref(false);
const isKetersediaanConfirmVisible = ref(false);
const selectedJenisKaos = ref("");
const itemsPerPage = ref(25);

// --- Header Definisi (Updated) ---
const headers = ref<DataTableHeader[]>([
  { title: "Jenis Kaos", key: "JenisKaos", width: 250, fixed: true },
  { title: "Tipe", key: "Custom", align: "center", width: 100 },
  { title: "S", key: "Harga_S", align: "end", width: 100 },
  { title: "M", key: "Harga_M", align: "end", width: 100 },
  { title: "L", key: "Harga_L", align: "end", width: 100 },
  { title: "XL", key: "Harga_XL", align: "end", width: 100 },
  { title: "2XL", key: "Harga_2XL", align: "end", width: 100 },
  { title: "3XL", key: "Harga_3XL", align: "end", width: 100 },
  { title: "4XL", key: "Harga_4XL", align: "end", width: 100 },
  { title: "5XL", key: "Harga_5XL", align: "end", width: 100 },
  { title: "6XL", key: "Harga_6XL", align: "end", width: 100 },
  { title: "7XL", key: "Harga_7XL", align: "end", width: 100 },
  { title: "8XL", key: "Harga_8XL", align: "end", width: 100 },
  { title: "9XL", key: "Harga_9XL", align: "end", width: 100 },
  { title: "10XL", key: "Harga_10XL", align: "end", width: 100 },
  { title: "Oversize", key: "Harga_Oversize", align: "end", width: 100 },
  { title: "Jumbo", key: "Harga_Jumbo", align: "end", width: 100 },
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
const handleRowClick = (_event: Event, { item }: { item: JenisKaos }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/setting-harga");
    jenisKaosList.value = response.data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan";

    toast.error(`Gagal memuat data setting harga. ${message}`);
  } finally {
    isLoading.value = false;
  }
};

const openNewDialog = () => {
  isJenisKaosSearchVisible.value = true;
};

const handleJenisKaosSelected = (jenisKaos: string) => {
  isJenisKaosSearchVisible.value = false;
  selectedJenisKaos.value = jenisKaos;
  isKetersediaanConfirmVisible.value = true;
};

const handleKetersediaanConfirmed = async (custom: "Y" | "N") => {
  isKetersediaanConfirmVisible.value = false;
  isNew.value = true;
  editedItem.value.jenisKaos = selectedJenisKaos.value;
  editedItem.value.custom = custom;
  try {
    const response = await api.get<SettingHarga>(
      `/setting-harga/${encodeURIComponent(selectedJenisKaos.value)}/${custom}`
    );
    editedItem.value = response.data;
    isNew.value = false;
  } catch {
    try {
      const templateResponse = await api.get<UkuranTemplate[]>("/setting-harga/ukuran-template");
      editedItem.value.ukuranHarga = templateResponse.data.map((u) => ({
        ukuran: u.ukuran,
        harga: null,
      }));
    } catch {
      toast.error("Gagal memuat template ukuran.");
    }
  } finally {
    isEditPanelVisible.value = true;
  }
};

const openEditDialog = async (item: JenisKaos) => {
  isNew.value = false;
  isEditPanelVisible.value = true;
  try {
    const response = await api.get(
      `/setting-harga/${encodeURIComponent(item.JenisKaos)}/${item.Custom}`
    );
    editedItem.value = response.data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan";

    toast.error(`Gagal memuat detail harga. ${message}`);
  }
};

const closeEditPanel = () => {
  isEditPanelVisible.value = false;
};

const save = async () => {
  try {
    await api.post("/setting-harga/save", editedItem.value);
    toast.success("Data harga berhasil disimpan.");
    isEditPanelVisible.value = false;
    fetchData();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan";

    toast.error(`Gagal menyimpan data. ${message}`);
  }
};

const remove = async () => {
  if (selected.value.length === 0) return;
  const itemToDelete = selected.value[0];
  if (confirm(`Yakin ingin menghapus ${itemToDelete.JenisKaos} (${itemToDelete.Custom})?`)) {
    try {
      await api.delete("/setting-harga", {
        data: { jenisKaos: itemToDelete.JenisKaos, custom: itemToDelete.Custom },
      });
      toast.success("Data berhasil dihapus.");
      fetchData();
      selected.value = [];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan";

      toast.error(`Gagal menghapus data. ${message}`);
    }
  }
};

const exportData = () => {
  if (jenisKaosList.value.length === 0) {
    toast.info("Tidak ada data untuk diekspor.");
    return;
  }
  const dataToExport = jenisKaosList.value.map((item) => ({
    "Jenis Kaos": item.JenisKaos,
    Tipe: item.Custom === "Y" ? "Custom" : "Stok",
    "Harga S": item.Harga_S,
    "Harga M": item.Harga_M,
    "Harga L": item.Harga_L,
    "Harga XL": item.Harga_XL,
    "Harga 2XL": item.Harga_2XL,
    "Harga 3XL": item.Harga_3XL,
    "Harga 4XL": item.Harga_4XL,
    "Harga 5XL": item.Harga_5XL,
    "Harga 6XL": item.Harga_6XL,
    "Harga 7XL": item.Harga_7XL,
    "Harga 8XL": item.Harga_8XL,
    "Harga 9XL": item.Harga_9XL,
    "Harga 10XL": item.Harga_10XL,
    "Harga Oversize": item.Harga_Oversize,
    "Harga Jumbo": item.Harga_Jumbo,
  }));
  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Setting Harga");
  XLSX.writeFile(workbook, "SettingHarga.xlsx");
  toast.success("Data berhasil diekspor ke Excel.");
};

onMounted(() => {
  if (hasViewPermission.value) {
    fetchData();
  }
});
</script>

<template>
  <PageLayout title="Setting Harga" desktop-mode icon="mdi-tune-variant">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        @click="openNewDialog"
        prepend-icon="mdi-plus"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="selected.length !== 1"
        @click="openEditDialog(selected[0])"
        prepend-icon="mdi-pencil"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        :disabled="selected.length !== 1"
        @click="remove"
        prepend-icon="mdi-delete"
        >Hapus</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        @click="exportData"
        prepend-icon="mdi-file-excel"
      >
        Export
      </v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <v-text-field
          v-model="search"
          density="compact"
          label="Cari Jenis Kaos..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          hide-details
          single-line
        ></v-text-field>
        <v-spacer></v-spacer>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          :headers="headers"
          :items="jenisKaosList"
          :search="search"
          :loading="isLoading"
          item-value="JenisKaos"
          v-model:items-per-page="itemsPerPage"
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
            <td>
              <template v-if="header.key === 'Custom'">
                <v-chip :color="item.Custom === 'Y' ? 'blue' : 'green'" size="x-small">
                  {{ item.Custom === "Y" ? "Custom" : "Stok" }}
                </v-chip>
              </template>
              <template v-else-if="header.key.startsWith('Harga')">
                {{ new Intl.NumberFormat("id-ID").format(Number(item[header.key] ?? 0)) }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>
        </AppDataTable>
      </div>
    </div>

    <JenisKaosSearchModal
      v-if="isJenisKaosSearchVisible"
      @close="isJenisKaosSearchVisible = false"
      @select="handleJenisKaosSelected"
    />

    <v-dialog v-model="isKetersediaanConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6">Konfirmasi Ketersediaan</v-card-title>
        <v-card-text>Pilih tipe ketersediaan untuk jenis kaos ini.</v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn @click="handleKetersediaanConfirmed('N')">Stok Gudang</v-btn>
          <v-btn color="primary" variant="elevated" @click="handleKetersediaanConfirmed('Y')"
            >Custom</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isEditPanelVisible" persistent max-width="800px">
      <v-card class="dialog-card">
        <v-toolbar color="primary" density="compact">
          <v-toolbar-title class="text-subtitle-1">{{
            isNew ? "Tambah Setting Harga Baru" : "Ubah Setting Harga"
          }}</v-toolbar-title>
        </v-toolbar>
        <v-card-text class="pa-4">
          <v-row dense>
            <v-col cols="8">
              <v-text-field
                v-model="editedItem.jenisKaos"
                label="Jenis Kaos"
                variant="filled"
                density="compact"
                readonly
              ></v-text-field>
            </v-col>
            <v-col cols="4">
              <v-radio-group
                v-model="editedItem.custom"
                inline
                hide-details
                density="compact"
                readonly
              >
                <v-radio label="Custom" value="Y"></v-radio>
                <v-radio label="Stok" value="N"></v-radio>
              </v-radio-group>
            </v-col>
          </v-row>
          <v-data-table
            :items="editedItem.ukuranHarga"
            :headers="[
              { title: 'Ukuran', key: 'ukuran' },
              { title: 'Harga', key: 'harga' },
            ]"
            density="compact"
            class="desktop-table mt-4"
            fixed-header
            height="300px"
          >
            <template #[`item.harga`]="{ item }">
              <v-text-field
                v-model.number="item.harga"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
              />
            </template>
          </v-data-table>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn size="small" @click="closeEditPanel">Batal</v-btn>
          <v-btn size="small" color="primary" @click="save">Simpan</v-btn>
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
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
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

/* --- Tabel Desktop Style --- */
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
  border-right: 2px solid rgb(var(--v-theme-on-primary));
}

/* --- Utility & State --- */
.state-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>

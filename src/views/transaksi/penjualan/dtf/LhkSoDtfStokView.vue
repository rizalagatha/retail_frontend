<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '48';

// --- Interfaces ---
// Interface Header (Wajib untuk Resize)
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: 'start' | 'center' | 'end';
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
}

interface LhkStokHeader {
  Nomor: string;
  Tanggal: string;
  NoSOdtf: string;
  Jumlah: number;
  Usr: string;
  Created: string;
  [key: string]: unknown;
}

interface LhkStokDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Jumlah: number;
}

// --- State ---
const list = ref<LhkStokHeader[]>([]);
const details = ref<{ [key: string]: LhkStokDetail[] }>({});
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const selected = ref<LhkStokHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

// State untuk Dialog
const isConfirmDeleteVisible = ref(false);
const itemToDelete = ref<LhkStokHeader | null>(null);

// State untuk Filter Kustom
const filterOptions = ref([
  { title: 'Nomor', value: 'Nomor' },
  { title: 'No. SO DTF', value: 'NoSOdtf' },
  { title: 'User', value: 'Usr' },
]);
const selectedFilterField = ref('Nomor');
const filterSearchValue = ref('');

// --- Computed Properties ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);

const filteredList = computed(() => {
  if (!filterSearchValue.value) {
    return list.value;
  }
  return list.value.filter(item => {
    const itemValue = item[selectedFilterField.value as keyof LhkStokHeader];
    if (itemValue !== null && itemValue !== undefined) {
      return itemValue.toString().toLowerCase().includes(filterSearchValue.value.toLowerCase());
    }
    return false;
  });
});

// --- Header Definisi (Resize) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true }, // Kolom expand kiri
  { title: 'Nomor', key: 'Nomor', width: 200, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 120 },
  { title: 'No. SO DTF', key: 'NoSOdtf', width: 200 },
  { title: 'Jumlah', key: 'Jumlah', align: 'end', width: 100 },
  { title: 'User', key: 'Usr', width: 150 },
  { title: 'Created', key: 'Created', width: 180 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'Kode', width: '150px' },
  { title: 'Nama', key: 'Nama', width: '300px' },
  { title: 'Ukuran', key: 'Ukuran', width: '100px' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '100px' },
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
  startWidth.value = (typeof column.width === 'number' ? column.width : 100);
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = 'col-resize';
};

const onResizeMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;
  const diff = e.pageX - startX.value;
  resizingColumn.value.width = Math.max(50, startWidth.value + diff);
};

const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = '';
};

// --- Logic Selected Row ---
const handleRowClick = (_event: Event, { item }: { item: LhkStokHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/lhk-so-dtf-stok/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.', error);
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/lhk-so-dtf-stok', {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
      }
    });
    list.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data LHK Stok.', error);
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: LhkStokHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.Nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/lhk-so-dtf-stok/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`, error);
    expanded.value = expanded.value.filter(nomor => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const showDeleteConfirmation = () => {
  if (!isSingleSelected.value) return;
  itemToDelete.value = selected.value[0];
  isConfirmDeleteVisible.value = true;
};

const executeDelete = async () => {
  if (!itemToDelete.value) return;
  try {
    await api.delete(`/lhk-so-dtf-stok/${itemToDelete.value.Nomor}`);
    toast.success(`LHK Stok ${itemToDelete.value.Nomor} berhasil dihapus.`);
    fetchData();
    selected.value = [];
  } catch (err) {
    if (err instanceof AxiosError) {
      toast.error(err.response?.data?.message || 'Gagal menghapus data.');
    } else {
      toast.error('Gagal menghapus data.');
    }
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

watch([startDate, endDate, selectedCabang], fetchData, { immediate: false });
</script>

<template>
  <PageLayout title="LHK SO DTF Stok" desktop-mode icon="mdi-package-variant-closed-check">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/dtf/lhk-so-dtf-stok/new')">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="router.push(`/transaksi/penjualan/dtf/lhk-so-dtf-stok/ubah/${selected[0].Nomor}`)">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="showDeleteConfirmation">Hapus</v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Periode:</span>
        <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined"
          style="min-width: 140px;" />
        <span class="mx-2">s/d</span>
        <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined"
          style="min-width: 140px;" />
        <span class="filter-label ms-4">Cabang:</span>
        <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" style="max-width: 180px;" />

        <v-divider vertical class="mx-2"></v-divider>
        <div class="d-flex align-center ga-2">
          <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan" density="compact"
            hide-details variant="outlined" style="max-width: 180px;" />
          <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details variant="outlined"
            style="min-width: 250px;" clearable prepend-inner-icon="mdi-magnify" />
        </div>

        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="filteredList"
          :loading="isLoading" item-value="Nomor" density="compact" class="desktop-table header-browse-blue"
          fixed-header show-select return-object show-expand @update:expanded="loadDetails" @click:row="handleRowClick">
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  :style="{ width: header.width + 'px', minWidth: header.width + 'px', maxWidth: header.width + 'px' }"
                  class="resizable-header"
                  :class="{ 'text-center': header.align === 'center', 'text-end': header.align === 'end' }"
                  @click="toggleSort(header)">
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="small" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" @click.stop></div>
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn icon="mdi-chevron-down" :class="{ 'rotate-180': isExpanded(internalItem) }" size="x-small"
              variant="text" @click.stop="toggleExpand(internalItem)" />
          </template>

          <template v-for="header in headers.filter(h => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }" :key="header.key">
            <td>
              <template v-if="header.key === 'Tanggal'">
                {{ format(parseISO(item.Tanggal as string), 'dd/MM/yyyy') }}
              </template>
              <template v-else-if="header.key === 'Created'">
                {{ item.Created ? format(parseISO(item.Created as string), 'dd/MM/yyyy HH:mm:ss') : '-' }}
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">Memuat detail...</div>
                    <v-data-table v-else-if="details[item.Nomor]" :headers="detailHeaders" :items="details[item.Nomor]"
                      density="compact" class="detail-table" :items-per-page="-1" hide-default-footer>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-2 text-grey">Tidak ada data detail.</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isConfirmDeleteVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>Anda yakin ingin menghapus data LHK Stok Nomor: <strong>{{ itemToDelete?.Nomor
            }}</strong>?</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isConfirmDeleteVisible = false">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="executeDelete">Ya, Hapus</v-btn>
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
  border-bottom: 1px solid #e0e0e0;
  background: white;
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* --- Tabel Desktop --- */
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

/* --- Detail Sticky --- */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  background-color: #fafafa;
  padding: 16px 16px 16px 64px;
  border-bottom: 1px solid #e0e0e0;
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 700px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background-color: white;
}

.state-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import AppDataTable from '@/components/AppDataTable.vue';
import { formatRupiah } from "@/utils/formatRupiah";

// Interface Header (Resize)
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

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '54';

// --- State ---
const masterData = ref<FskMaster[]>([]);
const details = ref<Record<string, FskDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<FskMaster[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
});

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);
const canBeModified = computed(() => {
  if (!isSingleSelected.value) return false;
  const item = selected.value[0];
  return !item.Verified;
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 200, fixed: true },
  { title: 'Tgl Setor', key: 'TglSetor', width: 150 },
  { title: 'Tgl Verifikasi', key: 'TglVerifikasi', width: 150 },
  { title: 'Dibuat Oleh', key: 'Created', width: 150 },
  { title: 'Diverifikasi Oleh', key: 'Verified', width: 150 },
  { title: 'Closing', key: 'Closing', align: 'center', width: 100 },
]);

const detailHeaders = [
  { title: 'Jenis', key: 'Jenis', width: '200px' },
  { title: 'Nominal Setor', key: 'NominalSetor', align: 'end', width: '150px' },
  { title: 'Nominal Verifikasi', key: 'NominalVerifikasi', align: 'end', width: '150px' },
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
const handleRowClick = (_event: Event, { item }: { item: FskMaster }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/fsk/lookup/cabang');
    cabangList.value = response.data;
  } catch { toast.error('Gagal memuat daftar cabang.'); }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/fsk', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message || 'Gagal mengambil data.');
    } else if (typeof error === 'object' && error !== null && 'response' in error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal mengambil data.');
    } else {
      toast.error('Gagal mengambil data.');
    }
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: FskMaster[]) => {
  const itemToLoad = newlyExpandedItems.find(
    item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
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

const handleDelete = () => {
  if (!selectedRow.value) return;
  if (confirm(`Yakin ingin menghapus FSK nomor ${selectedRow.value.Nomor}?`)) {
    api.delete(`/fsk/${selectedRow.value.Nomor}`)
      .then(response => {
        toast.success(response.data.message);
        fetchMasterData();
      })
      .catch(error => {
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
      });
  }
};

const getRowTextColor = (item: FskMaster) => {
  if (!item.Verified) return 'text-red font-weight-bold';
  return '';
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].Nomor;
  const url = router.resolve({ name: 'FskPrint', params: { nomor } }).href;
  window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "FSK Header");
    XLSX.writeFile(workbook, "Export_FSK_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/fsk/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "FSK Detail");
      XLSX.writeFile(workbook, "Export_FSK_Detail.xlsx");
    } catch {
      toast.error('Gagal mengekspor data detail.');
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
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="router.push({ name: 'FskCreate' })">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!canBeModified"
        @click="router.push({ name: 'FskEdit', params: { nomor: selectedRow?.Nomor } })">
        Ubah
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        :disabled="!canBeModified" @click="handleDelete">
        Hapus
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        @click="printData" prepend-icon="mdi-printer">
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
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px;" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diverifikasi
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table header-browse-blue" fixed-header
          show-select return-object show-expand @update:expanded="loadDetails" @click:row="handleRowClick">
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
            <td :class="getRowTextColor(item)">
              <template v-if="['TglSetor', 'TglVerifikasi'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(item[header.key] as string), 'dd/MM/yyyy') : '' }}
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4 text-caption">Memuat detail...
                    </div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]" density="compact"
                      class="detail-table" :items-per-page="-1" hide-default-footer>
                      <template v-for="headerKey in ['NominalSetor', 'NominalVerifikasi']"
                        #[`item.${headerKey}`]="{ value }">
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
  max-width: 600px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background-color: white;
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: #d32f2f !important;
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, subDays, addDays, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import AppDataTable from '@/components/AppDataTable.vue';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '40';

// --- Interfaces ---
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

interface DasborItem {
  TglPengerjaan: string;
  Sisa: number;
  [key: string]: unknown;
}

interface DetailItem {
  SoDTF: string;
  [key: string]: unknown;
}

// --- State ---
const dasborList = ref<DasborItem[]>([]);
const details = ref<{ [key: string]: DetailItem[] }>({});
const isLoading = ref(true);
const startDate = ref(format(subDays(new Date(), 2), 'yyyy-MM-dd'));
const endDate = ref(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

// --- Header Definisi (Resize) ---
// Perhatikan width angka agar tabel lebih rapat ke kiri
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Tgl Pengerjaan', key: 'TglPengerjaan', width: 150, align: 'start' },
  { title: 'Kuota', key: 'Kuota', width: 100, align: 'end' },
  { title: 'Total Titik', key: 'TotalTitik', width: 100, align: 'end' },
  { title: 'Sisa', key: 'Sisa', width: 100, align: 'end' },
]);

// Detail Header (Lebih rapat)
const detailHeaders = [
  { title: 'SoDTF', key: 'SoDTF', width: '180px' },
  { title: 'Tgl Pengerjaan', key: 'TglPengerjaan', width: '120px' },
  { title: 'Nama', key: 'Nama', width: '250px' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '80px' },
  { title: 'Titik', key: 'Titik', align: 'end', width: '80px' },
  { title: 'Total Titik', key: 'TotalTitik', align: 'end', width: '100px' },
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

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/dasbor-dtf/cabang-list');
    cabangList.value = response.data;
    if (authStore.user?.cabang === 'KDC' && cabangList.value.length > 0) {
      selectedCabang.value = cabangList.value[0].kode;
    }
  } catch {
    toast.error('Gagal memuat daftar cabang.');
  }
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value || !selectedCabang.value) return;
  isLoading.value = true;
  try {
    const response = await api.get('/dasbor-dtf', {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
      }
    });
    dasborList.value = response.data;
  } catch {
    toast.error('Gagal memuat data dasbor.');
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: string[]) => {
  // Cari tanggal yang baru di-expand
  // Note: Vuetify 'expanded' berisi array value item-key (TglPengerjaan)
  const tglToLoad = newlyExpandedItems.find(
    tgl => !details.value[tgl] && !loadingDetails.value.has(tgl)
  );

  if (!tglToLoad) return;

  loadingDetails.value.add(tglToLoad);
  try {
    const response = await api.get(`/dasbor-dtf/detail`, {
      params: { tanggal: tglToLoad, cabang: selectedCabang.value }
    });
    details.value[tglToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk tanggal ${tglToLoad}`);
    expanded.value = expanded.value.filter(tgl => tgl !== tglToLoad);
  } finally {
    loadingDetails.value.delete(tglToLoad);
  }
};

const getRowClass = (item: DasborItem) => {
  return item.Sisa < 0 ? 'row-sisa-minus' : '';
};

const exportData = async (type: 'header' | 'detail') => {
  const endpoint = type === 'header' ? '/dasbor-dtf/export-header' : '/dasbor-dtf/export-detail';
  const fileName = type === 'header' ? 'DasborDTF_Header.xlsx' : 'DasborDTF_Detail.xlsx';
  toast.info(`Mempersiapkan file ${fileName}...`);
  try {
    const response = await api.get(endpoint, {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
      }
    });
    const worksheet = XLSX.utils.json_to_sheet(response.data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, fileName);
    toast.success('File berhasil diekspor.');
  } catch {
    toast.error('Gagal mengekspor data.');
  }
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
  <PageLayout title="Dasbor DTF" desktop-mode icon="mdi-view-dashboard-variant">
    <template #header-actions>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">Export</v-btn>
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

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Tgl Pengerjaan:</span>
        <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined"
          style="min-width: 140px;" />
        <span class="mx-2">s/d</span>
        <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined"
          style="min-width: 140px;" />
        <span class="filter-label ms-4">Cabang:</span>
        <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" style="max-width: 180px;" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" title="Muat Ulang Data" />
      </div>

      <div class="table-container">
        <AppDataTable v-model:expanded="expanded" :headers="headers" :items="dasborList" :loading="isLoading"
          item-value="TglPengerjaan" density="compact" class="desktop-table header-browse-blue" fixed-header show-expand
          @update:expanded="loadDetails" :item-props="(item) => ({ class: getRowClass(item) })">
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
              <template v-if="header.key === 'TglPengerjaan'">
                {{ format(parseISO(item.TglPengerjaan), 'dd-MM-yyyy') }}
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
                    <div v-if="loadingDetails.has(item.TglPengerjaan)" class="text-center py-2">
                      <v-progress-circular indeterminate size="20" class="mr-2"></v-progress-circular>
                      Memuat detail...
                    </div>
                    <v-data-table v-else-if="details[item.TglPengerjaan]" :headers="detailHeaders"
                      :items="details[item.TglPengerjaan]" item-value="SoDTF" density="compact" class="detail-table"
                      :items-per-page="-1" hide-default-footer>
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
  background-color: white;
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

/* Penting: width: max-content agar kolom tidak dipaksa melebar memenuhi layar */
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

/* Alignment untuk header content */
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

/* --- Sticky Detail --- */
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
  max-width: 900px;
  /* Agar detail table tidak melebar berlebihan */
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background-color: white;
}

/* Pewarnaan Baris Minus */
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
</style>

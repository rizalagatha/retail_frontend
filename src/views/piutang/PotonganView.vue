<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import PrintOptionModal from '@/components/modal/PrintOptionModal.vue';
import * as XLSX from 'xlsx';
import AppDataTable from '@/components/AppDataTable.vue';
import { formatRupiah } from "@/utils/formatRupiah";

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
  cellClass?: string;
}

interface PotonganHeader {
  Nomor: string;
  Tanggal: string;
  Nominal: number;
  Dibayarkan: number;
  Akun: string;
  NamaAkun: string;
  NoRekening: string;
  Kdcus: string;
  Customer: string;
  Alamat: string;
  Kota: string;
  Usr: string;
  Cab: string;
  Closing: string;
  Keterangan?: string;
  [key: string]: unknown;
}

interface PotonganDetail {
  tglbayar: string;
  invoice: string;
  bayar: number;
  angsur: string;
  nominal: number;
  terbayar: number;
  sisa_piutang: number;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '53';

// --- State ---
const masterData = ref<PotonganHeader[]>([]);
const details = ref<Record<string, PotonganDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<PotonganHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const isPrintOptionVisible = ref(false);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'K01' : authStore.user?.cabang || '',
});

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<PotonganHeader | null>(() => isSingleSelected.value ? selected.value[0] : null);

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 120 },
  { title: 'Nominal', key: 'Nominal', width: 120, align: 'end' },
  { title: 'Dibayarkan', key: 'Dibayarkan', width: 120, align: 'end' },
  { title: 'Akun', key: 'Akun', width: 120 },
  { title: 'Nama Akun', key: 'NamaAkun', width: 250 },
  { title: 'NoRekening', key: 'NoRekening', width: 100 },
  { title: 'Kdcus', key: 'Kdcus', width: 100 },
  { title: 'Customer', key: 'Customer', width: 200 },
  { title: 'Alamat', key: 'Alamat', width: 300 },
  { title: 'Kota', key: 'Kota', width: 150 },
  { title: 'Usr', key: 'Usr', width: 80 },
  { title: 'Cab', key: 'Cab', width: 80 },
  { title: 'Closing', key: 'Closing', align: 'center', width: 100 },
]);

const detailHeaders: DataTableHeader[] = [
  { title: 'Tgl Bayar', key: 'tglbayar', width: 120 },
  { title: 'No. Invoice', key: 'invoice', width: 180 },
  { title: 'Nominal Invoice', key: 'nominal', align: 'end' },
  { title: 'Terbayar (sblmnya)', key: 'terbayar', align: 'end' },
  { title: 'Sisa Piutang (sblmnya)', key: 'sisa_piutang', align: 'end' },
  { title: 'Dibayarkan Potongan', key: 'bayar', align: 'end', cellClass: 'font-weight-bold text-blue-darken-2' },
];

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
const handleRowClick = (_event: Event, { item }: { item: PotonganHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/potongan/lookup/cabang-options');
    cabangList.value = response.data;
  } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  details.value = {};

  try {
    const response = await api.get<PotonganHeader[]>('/potongan/master', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message);
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

const loadDetails = async (newlyExpandedItems: PotonganHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item =>
    !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);
  try {
    const response = await api.get<PotonganDetail[]>(`/potongan/browse-details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data;
  } catch (error: unknown) {
    const msg = `Gagal memuat detail untuk ${itemToLoad.Nomor}.`;
    if (error instanceof Error) toast.error(`${msg}: ${error.message}`);
    else toast.error(msg);
    expanded.value = expanded.value.filter(nomor => nomor !== itemToLoad.Nomor);
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

const getRowTextColor = (item: PotonganHeader) => {
  return item.Closing === 'N' ? 'text-orange-darken-3 font-weight-bold' : '';
};

const handleNew = () => {
  router.push({ name: 'PotonganCreate' });
}

const handleEdit = () => {
  if (!isSingleSelected.value || !selectedRow.value) return;
  const nomor = selectedRow.value.Nomor;
  router.push({ name: 'PotonganEdit', params: { nomor } });
};

const handlePrintSelection = (type: 'a4' | 'kasir' | 'wa') => {
  if (!isSingleSelected.value || !selectedRow.value) return;
  const nomor = selectedRow.value.Nomor;
  isPrintOptionVisible.value = false;

  if (type === 'a4' || type === 'kasir') {
    const routeName = type === 'a4' ? 'PotonganPrintA4' : 'PotonganPrintKasir';
    const url = router.resolve({ name: routeName, params: { nomor } }).href;
    window.open(url, '_blank');
  } else if (type === 'wa') {
    toast.warning('Opsi kirim WA belum diimplementasikan atau tidak relevan untuk Potongan.');
  }
};

const openPrintOptions = () => {
  if (!isSingleSelected.value) return;
  isPrintOptionVisible.value = true;
};

const exportData = async (type: 'header' | 'detail') => {
  const fileName = `Export_Potongan_${type === 'header' ? 'Header' : 'Detail'}.xlsx`;
  try {
    if (type === 'header') {
      if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
      const worksheet = XLSX.utils.json_to_sheet(masterData.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Potongan Header");
      XLSX.writeFile(workbook, fileName);
    } else if (type === 'detail') {
      const response = await api.get('/potongan/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Potongan Detail");
      XLSX.writeFile(workbook, fileName);
    }
    toast.success(`Data ${type} berhasil diekspor.`);
  } catch (error) {
    toast.error(`Gagal mengekspor data ${type}.`);
    console.error(error);
  }
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Daftar Potongan" icon="mdi-account-cash">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleNew"
        prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" @click="handleEdit"
        prepend-icon="mdi-pencil">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="openPrintOptions">
        Cetak
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props"
            :disabled="loading || masterData.length === 0">
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
        <span class="filter-label">Periode:</span>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 140px;" />
        <span class="mx-2">s/d</span>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 140px;" />
        <span class="filter-label ms-4">Cabang:</span>
        <v-select v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" style="max-width: 200px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="orange-darken-3" icon="mdi-square-rounded" size="small"></v-icon> Belum Closing
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
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
              <template v-if="header.key === 'Tanggal'">
                {{ item.Tanggal ? format(parseISO(String(item.Tanggal)), 'dd/MM/yyyy') : '' }}
              </template>
              <template v-else-if="['Nominal', 'Dibayarkan'].includes(header.key)">
                {{ formatRupiah(Number(item[header.key])) }}
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success">YA</v-chip>
                <v-chip v-else size="x-small" color="error">TIDAK</v-chip>
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4 text-caption">
                      Memuat detail...
                    </div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]" density="compact"
                      class="detail-table" :items-per-page="-1" hide-default-footer>
                      <template #[`item.tglbayar`]="{ value }">
                        {{ value ? format(parseISO(value), 'dd/MM/yyyy') : '' }}
                      </template>
                      <template v-for="key in ['nominal', 'terbayar', 'sisa_piutang', 'bayar']"
                        #[`item.${key}`]="{ value }">
                        {{ formatRupiah(Number(value)) }}
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                    <div
                      v-if="!loadingDetails.has(item.Nomor) && (!details[item.Nomor] || details[item.Nomor].length === 0)"
                      class="text-center py-2 text-caption">
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

    <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir']" @close="isPrintOptionVisible = false"
      @select="handlePrintSelection" />
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
  max-width: 900px;

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
:deep(td.text-orange-darken-3) {
  color: rgb(var(--v-theme-warning)) !important;
}

:deep(.v-dialog) .v-card {
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
</style>

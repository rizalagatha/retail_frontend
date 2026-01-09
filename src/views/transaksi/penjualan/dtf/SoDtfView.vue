<script setup lang="ts">
import { ref, onUnmounted, onMounted, computed, watch, reactive } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import { useRouter, useRoute } from 'vue-router';
import * as XLSX from 'xlsx';
import axios from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Interface Header (Wajib untuk Resize) ---
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

interface SoDtfHeader {
  Nomor: string;
  Tanggal: string;
  TglPengerjaan: string;
  NoSO: string;
  NoINV: string;
  AlasanClose: string;
  LHK: number;
  TotalTitik: number;
  Close: string;
  UserModified: string;
  DateModified: string;
  [key: string]: unknown;
}
interface SoDtfDetail {
  Ukuran: string;
  Jumlah: number;
  NamaBarang: string;
}
interface ColumnFilter {
  type: 'multi' | 'custom';
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = '35';

// --- State ---
const soDtfList = ref<SoDtfHeader[]>([]);
const details = ref<{ [key: string]: SoDtfDetail[] }>({});
const isLoading = ref(true);
const selected = ref<SoDtfHeader[]>([]);
const expanded = ref<SoDtfHeader[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const fetchTimeout = ref<number | undefined>(undefined);
const isMounted = ref(false);
const cabangList = ref([]);

const filters = reactive({
  filterDateType: 'dtf',
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '',
  status: null as string | null,
});

const isCloseDialogVisible = ref(false);
const itemToClose = ref<SoDtfHeader | null>(null);
const closeReason = ref('');

const isConfirmDialogVisible = ref(false);
const confirmDialogText = ref('');
const itemToDelete = ref<SoDtfHeader | null>(null);

const filterOptions = ref([
  { title: 'Nomor', value: 'Nomor' },
  { title: 'Status', value: 'status' },
  { title: 'Tanggal', value: 'Tanggal' },
  { title: 'Tgl Pengerjaan', value: 'TglPengerjaan' },
  { title: 'Dateline Cust', value: 'DatelineCus' },
  { title: 'Nama DTF', value: 'NamaDTF' },
  { title: 'Kd. Customer', value: 'KdCus' },
  { title: 'Nama Customer', value: 'Customer' },
  { title: 'Jml', value: 'Jumlah' },
  { title: 'Titik', value: 'Titik' },
  { title: 'Total Titik', value: 'TotalTitik' },
  { title: 'LHK', value: 'LHK' },
  { title: 'No. SO', value: 'NoSO' },
  { title: 'No. Invoice', value: 'NoINV' },
  { title: 'Sales', value: 'Sales' },
  { title: 'Bag. Desain', value: 'BagDesain' },
  { title: 'Kain', value: 'Kain' },
  { title: 'Finishing', value: 'Finishing' },
  { title: 'Workshop', value: 'Workshop' },
  { title: 'Keterangan', value: 'Keterangan' },
  { title: 'Alasan Close', value: 'AlasanClose' },
  { title: 'User', value: 'Created' },
  { title: 'Status Close', value: 'Close' },
]);
const selectedFilterField = ref('Customer');
const filterSearchValue = ref('');

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);
const filteredSoDtfList = computed(() => {
  let data = [...soDtfList.value];

  // === 1) FILTER KOLOM (MULTI & CUSTOM) ===
  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];
    if (!f) continue;

    if (f.type === 'multi' && f.values) {
      data = data.filter(row => {
        const v = row[key];
        return typeof v === 'string' || typeof v === 'number'
          ? f.values!.includes(v)
          : false;
      });
    }

    if (f.type === 'custom') {
      const filterValue = String(f.value).toLowerCase();

      data = data.filter(row => {
        const val = row[key] == null ? '' : String(row[key]).toLowerCase();

        switch (f.operator) {
          case '=': return val === filterValue;
          case '!=': return val !== filterValue;
          case '>': return Number(val) > Number(filterValue);
          case '>=': return Number(val) >= Number(filterValue);
          case '<': return Number(val) < Number(filterValue);
          case '<=': return Number(val) <= Number(filterValue);
          case 'contains': return val.includes(filterValue);
          case 'starts': return val.startsWith(filterValue);
          case 'ends': return val.endsWith(filterValue);
          default: return true;
        }
      });
    }
  }

  // === 2) QUICK SEARCH (HARUS PALING AKHIR, JANGAN RETURN LANGSUNG) ===
  if (filterSearchValue.value) {
    const key = selectedFilterField.value;
    const term = filterSearchValue.value.toLowerCase();

    data = data.filter(row => {
      const value = row[key];
      return value != null
        ? String(value).toLowerCase().includes(term)
        : false;
    });
  }

  return data;
});

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 150, fixed: true },
  { title: 'Kd. Customer', key: 'KdCus', width: 120 },
  { title: 'Nama Customer', key: 'Customer', width: 250 },
  { title: 'Status', key: 'status', width: 150, sortable: false },
  { title: 'Tanggal', key: 'Tanggal', width: 100 },
  { title: 'Tgl Pengerjaan', key: 'TglPengerjaan', width: 120 },
  { title: 'Dateline Cust', key: 'DatelineCus', width: 120 },
  { title: 'Nama DTF', key: 'NamaDTF', width: 200 },
  { title: 'Jml', key: 'Jumlah', align: 'end', width: 70 },
  { title: 'Titik', key: 'Titik', align: 'end', width: 70 },
  { title: 'Total Titik', key: 'TotalTitik', align: 'end', width: 90 },
  { title: 'LHK', key: 'LHK', align: 'center', width: 70 },
  { title: 'No. SO', key: 'NoSO', width: 150 },
  { title: 'No. Invoice', key: 'NoINV', width: 150 },
  { title: 'Sales', key: 'Sales', width: 150 },
  { title: 'Bag. Desain', key: 'BagDesain', width: 150 },
  { title: 'Kain', key: 'Kain', width: 150 },
  { title: 'Finishing', key: 'Finishing', width: 150 },
  { title: 'Workshop', key: 'Workshop', width: 150 },
  { title: 'Keterangan', key: 'Keterangan', width: 250 },
  { title: 'Alasan Close', key: 'AlasanClose', width: 250 },
  { title: 'User', key: 'Created', width: 120 },
  { title: 'User Modified', key: 'UserModified', width: 150 },
  { title: 'Date Modified', key: 'DateModified', width: 160 },
  { title: 'Status Close', key: 'Close', align: 'center', width: 120 },
]);

// --- Logic Filters ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({
  key: '',
  operator: '=',
  value: ''
});

const formatFilterValue = (key: string, val: string | number | null | undefined): string => {
  if (['Tanggal', 'TglPengerjaan', 'DatelineCus', 'DateModified'].includes(key)) {
    if (!val) return '-';
    try { return format(new Date(val), 'dd/MM/yyyy'); }
    catch { return String(val); }
  }
  return String(val ?? '');
};

const toggleMultiSelectValue = (key: string, value: string | number) => {
  const f = columnFilters.value[key];

  if (!f || f.type !== 'multi') {
    columnFilters.value[key] = { type: 'multi', values: [value] };
    return;
  }

  const arr = f.values ?? [];

  if (arr.includes(value)) {
    f.values = arr.filter(v => v !== value);
    if (f.values.length === 0) delete columnFilters.value[key];
  } else {
    f.values = [...arr, value];
  }
};

const applyCustomFilter = () => {
  columnFilters.value[customFilter.key] = {
    type: 'custom',
    operator: customFilter.operator,
    value: customFilter.value
  };
  customFilterDialog.value = false;
};

const resetAllFilters = () => {
  columnFilters.value = {};
};

const isFilterActive = (key: string): boolean => {
  return Boolean(columnFilters.value[key]);
};

const filterType = (key: string): string => {
  if (!columnFilters.value[key]) return '';
  return columnFilters.value[key].type;
};

const clearColumnFilter = (key: string) => {
  delete columnFilters.value[key];
};

const uniqueValues = (key: string): (string | number)[] => {
  const set = new Set(
    soDtfList.value
      .map(item => item[key as keyof SoDtfHeader])
      .filter(v => v !== null && v !== undefined && v !== '')
  );
  return Array.from(set).sort() as (string | number)[];
};

const openCustomFilter = (key: string) => {
  customFilter.key = key;
  customFilter.operator = '=';
  customFilter.value = '';
  customFilterDialog.value = true;
};

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
const handleRowClick = (_event: Event, { item }: { item: SoDtfHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/warehouses/so-dtf-branches', {
      params: { userCabang: authStore.user?.cabang }
    });
    if (authStore.user?.cabang === 'KDC') {
      cabangList.value = [{ kode: 'ALL', nama: 'SEMUA CABANG' }, ...response.data];
    } else {
      cabangList.value = response.data;
    }
  } catch {
    toast.error('Gagal memuat daftar cabang.');
  }
};

const fetchData = async () => {
  if (!filters.startDate || !filters.endDate) return;
  isLoading.value = true;
  try {
    const response = await api.get('/so-dtf', { params: filters });
    soDtfList.value = response.data;
  } catch {
    toast.error('Gagal memuat data SO DTF.');
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: SoDtfHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomor = itemToLoad.Nomor;
  loadingDetails.value.add(nomor);
  try {
    const response = await api.get(`/so-dtf/${nomor}`);
    details.value[nomor] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomor}`);
    expanded.value = expanded.value.filter(item => item.Nomor !== nomor);
  } finally {
    loadingDetails.value.delete(nomor);
  }
};

const getRowTextColor = (item: SoDtfHeader) => {
  if (!item.NoSO && !item.NoINV) return 'text-red font-weight-bold';
  if (item.NoSO && !item.NoINV) return 'text-blue font-weight-bold';
  return '';
};

const getLhkClass = (item: SoDtfHeader) => {
  if (item.LHK === 0) return 'lhk-zero';
  if (item.LHK > 0 && item.LHK < item.TotalTitik) return 'lhk-progress';
  return 'lhk-normal';
};

const openCloseDialog = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.NoINV) {
    toast.warning('Sudah dibuat Invoice, tidak bisa di-close.');
    return;
  }
  itemToClose.value = item;
  closeReason.value = item.AlasanClose || '';
  isCloseDialogVisible.value = true;
};

const submitCloseSo = async () => {
  if (!itemToClose.value) return;
  try {
    await api.post('/so-dtf/close', {
      nomor: itemToClose.value.Nomor,
      alasan: closeReason.value,
      user: authStore.user?.kode,
    });
    toast.success('SO DTF berhasil ditutup.');
    isCloseDialogVisible.value = false;
    fetchData();
    selected.value = [];
  } catch {
    toast.error('Gagal menutup SO DTF.');
  }
};

// const showDeleteConfirmation = () => {
//   if (!isSingleSelected.value) return;
//   const item = selected.value[0];
//   if (item.NoSO) {
//     toast.warning('Sudah dibuat SO, tidak bisa dihapus.');
//     return;
//   }
//   if (item.NoINV) {
//     toast.warning('Sudah dibuat Invoice, tidak bisa dihapus.');
//     return;
//   }
//   if (item.Close === 'Y') {
//     toast.warning('Transaksi sudah ditutup, tidak bisa dihapus.');
//     return;
//   }
//   itemToDelete.value = item;
//   confirmDialogText.value = `Anda yakin ingin menghapus SO DTF Nomor: ${item.Nomor}?`;
//   isConfirmDialogVisible.value = true;
// };

const executeDelete = async () => {
  if (!itemToDelete.value) return;
  try {
    await api.delete(`/so-dtf/${itemToDelete.value.Nomor}`);
    toast.success(`SO DTF ${itemToDelete.value.Nomor} berhasil dihapus.`);
    fetchData();
    selected.value = [];
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || 'Gagal menghapus data.');
    } else {
      toast.error('Terjadi kesalahan.');
    }
  } finally {
    isConfirmDialogVisible.value = false;
    itemToDelete.value = null;
  }
};

const exportData = async (type: 'header' | 'detail') => {
  try {
    if (type === 'header') {
      if (selected.value.length === 0) {
        toast.warning('Silakan centang data header yang ingin diekspor.');
        return;
      }
      const worksheet = XLSX.utils.json_to_sheet(selected.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SO DTF Header");
      XLSX.writeFile(workbook, "Export_SO_DTF_Header_Terpilih.xlsx");
      toast.success('File Header berhasil dibuat.');
    } else {
      const response = await api.get('/so-dtf/export-detail', { params: filters });
      if (!response.data || response.data.length === 0) {
        toast.warning('Tidak ada data detail ditemukan untuk filter yang dipilih.');
        return;
      }
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SO DTF Detail");
      XLSX.writeFile(workbook, "Export_SO_DTF_Detail_Filter.xlsx");
      toast.success('File Detail berhasil dibuat.');
    }
  } catch (error) {
    toast.error('Gagal mengekspor data.', error);
  }
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  const url = router.resolve({
    name: 'Cetak SO DTF',
    params: { nomor: item.Nomor }
  }).href;
  window.open(url, '_blank');
};

const formatDate = (dateValue: string) => {
  if (!dateValue) return '-';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '-';
    return format(date, 'dd/MM/yyyy');
  } catch {
    return '-';
  }
};

onMounted(async () => {
  if (hasViewPermission.value) {
    const queryStartDate = route.query.startDate as string;
    const queryEndDate = route.query.endDate as string;
    const queryStatus = route.query.status as string;
    if (queryStartDate && queryEndDate) {
      filters.startDate = queryStartDate;
      filters.endDate = queryEndDate;
    }
    if (queryStatus) {
      filters.status = queryStatus;
    }
    await fetchCabangList();
    await fetchData();
    isMounted.value = true;
  }
});

onUnmounted(() => {
  if (fetchTimeout.value) clearTimeout(fetchTimeout.value);
});

watch(filters, () => {
  if (isMounted.value) {
    if (selectedFilterField.value && filterSearchValue.value) return;
    if (fetchTimeout.value) clearTimeout(fetchTimeout.value);
    fetchTimeout.value = window.setTimeout(() => {
      fetchData();
    }, 300);
  }
}, { deep: true });
</script>

<template>
  <PageLayout title="SO DTF Pesanan" desktop-mode icon="mdi-printer-3d">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="$router.push('/transaksi/penjualan/dtf/so-dtf/new')">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="$router.push(`/transaksi/penjualan/dtf/so-dtf/ubah/${selected[0].Nomor}`)">Ubah</v-btn>
      <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="showDeleteConfirmation">Hapus</v-btn> -->
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" :disabled="!isSingleSelected" @click="printData"
        color="green" prepend-icon="mdi-printer">Cetak</v-btn>
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
      <v-divider vertical class="mx-2"></v-divider>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" @click="openCloseDialog"
        color="orange-darken-2">Close SO</v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <v-radio-group v-model="filters.filterDateType" inline hide-details density="compact" class="me-4">
          <template #label><span class="filter-label">Filter:</span></template>
          <v-radio label="Tgl SO DTF" value="dtf"></v-radio>
          <v-radio label="Tgl Pengerjaan" value="pengerjaan"></v-radio>
        </v-radio-group>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="min-width: 130px;"></v-text-field>
        <span class="mx-2">s/d</span>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="min-width: 130px;"></v-text-field>
        <v-select v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode" label="Cabang"
          density="compact" hide-details variant="outlined" class="ms-2" style="min-width: 180px;"></v-select>
        <v-divider vertical class="mx-2"></v-divider>
        <div class="d-flex align-center ga-2">
          <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan" density="compact"
            hide-details variant="outlined" style="max-width: 180px;"></v-select>
          <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details variant="outlined"
            style="min-width: 250px;" clearable prepend-inner-icon="mdi-magnify"></v-text-field>
        </div>
        <v-chip v-if="filters.status" class="ms-4" color="primary" variant="tonal" closable
          @click:close="filters.status = null">
          Status: {{ filters.status === 'belum_invoice' ? 'Belum Invoice' : filters.status }}
        </v-chip>
        <v-spacer></v-spacer>
        <v-btn color="error" variant="tonal" prepend-icon="mdi-filter-off" class="btn-detail reset-filter-btn ms-2"
          @click="resetAllFilters">
          Reset Filter
        </v-btn>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <div class="legend-section">
        <div class="legend-group">
          <strong class="legend-title">Status SO:</strong>
          <div class="legend-item"><span class="row-color-sample-closed"></span> Di-Close</div>
          <div class="legend-item"><span class="text-red font-weight-medium">Teks Merah</span>: Belum SO & Invoice</div>
          <div class="legend-item"><span class="text-blue font-weight-medium">Teks Biru</span>: Belum Invoice</div>
        </div>
        <v-divider vertical></v-divider>
        <div class="legend-group">
          <strong class="legend-title">Status LHK:</strong>
          <div class="legend-item"><v-chip size="x-small" class="lhk-zero" label>0</v-chip> Belum Input</div>
          <div class="legend-item"><v-chip size="x-small" class="lhk-progress" label>1</v-chip> Progress</div>
        </div>
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="filteredSoDtfList"
          :loading="isLoading" item-value="Nomor" density="compact" class="desktop-table header-browse-blue"
          fixed-header show-select return-object @update:expanded="loadDetails" @click:row="handleRowClick"
          :item-props="(item) => ({ class: item.Close === 'Y' ? 'row-closed' : '' })">
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">

                <!-- ❌ HEADER TANPA FILTER (expand & select) -->
                <th v-if="['data-table-expand', 'data-table-select'].includes(header.key)" :style="{
                  width: header.width + 'px',
                  minWidth: header.width + 'px',
                  maxWidth: header.width + 'px'
                }" class="resizable-header" :class="{
                  'text-center': header.align === 'center',
                  'text-end': header.align === 'end'
                }">
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" @click.stop />
                </th>

                <!-- ✅ HEADER DENGAN FILTER -->
                <th v-else :style="{
                  width: header.width + 'px',
                  minWidth: header.width + 'px',
                  maxWidth: header.width + 'px'
                }" class="resizable-header" :class="{
                  'text-center': header.align === 'center',
                  'text-end': header.align === 'end'
                }" @click="toggleSort(header)">
                  <div class="header-content">

                    <!-- NAMA KOLOM -->
                    <span>{{ header.title }}</span>

                    <!-- SORT ICON -->
                    <v-icon v-if="isSorted(header)" size="14" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>

                    <!-- 🔵 FILTER ICON -->
                    <v-menu location="bottom start">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="16" class="ms-1" @click.stop
                          :color="isFilterActive(header.key) ? 'blue' : ''" :icon="filterType(header.key) === 'custom'
                            ? 'mdi-filter-cog'
                            : filterType(header.key) === 'multi'
                              ? 'mdi-filter-multiple'
                              : 'mdi-filter-variant'
                            " />
                      </template>

                      <!-- MENU FILTER -->
                      <v-list class="filter-menu">

                        <!-- SELECT ALL -->
                        <v-list-item @click.stop="clearColumnFilter(header.key)">
                          <v-list-item-title>(Select All)</v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <!-- LIST MULTI SELECT -->
                        <v-list-item v-for="val in uniqueValues(header.key)" :key="val"
                          @click.stop="toggleMultiSelectValue(header.key, val)">
                          <template #prepend>
                            <v-checkbox density="compact" :model-value="columnFilters[header.key]?.type === 'multi' &&
                              columnFilters[header.key]?.values?.includes(val)
                              " />
                          </template>

                          <!-- FORMAT VALUE (contoh: tanggal di-format) -->
                          <v-list-item-title>
                            {{ formatFilterValue(header.key, val) }}
                          </v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <!-- CUSTOM FILTER -->
                        <v-list-item @click.stop="openCustomFilter(header.key)">
                          <v-list-item-title class="custom-filter-item">
                            (Custom Filter…)
                          </v-list-item-title>
                        </v-list-item>

                      </v-list>
                    </v-menu>
                  </div>

                  <!-- RESIZER -->
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" @click.stop />
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
              <template v-if="['Tanggal', 'TglPengerjaan', 'DatelineCus', 'DateModified'].includes(header.key)">
                {{ formatDate(item[header.key]) }}
              </template>
              <template v-else-if="header.key === 'status'">
                <v-chip v-if="item.AlasanClose" color="blue-grey" variant="tonal" size="x-small">Closed</v-chip>
                <v-chip v-else-if="item.NoINV" color="success" variant="tonal" size="x-small">Sudah INV</v-chip>
                <v-chip v-else-if="item.NoSO" color="info" variant="tonal" size="x-small">Sudah SO</v-chip>
                <v-chip v-else color="grey" variant="tonal" size="x-small">Open</v-chip>
              </template>
              <template v-else-if="header.key === 'LHK'">
                <v-chip :class="getLhkClass(item)" size="x-small" label>{{ item.LHK }}</v-chip>
              </template>
              <template v-else-if="header.key === 'Close'">
                <v-chip :color="item.Close === 'Y' ? 'success' : 'grey'" size="x-small">
                  {{ item.Close === 'Y' ? 'Closed' : 'Open' }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'Keterangan'">
                <div style="white-space: pre-wrap; line-height: 1.4; min-width: 250px;">{{ item[header.key] }}</div>
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
                      <v-progress-circular indeterminate size="20" class="mr-2"></v-progress-circular>
                      Memuat detail...
                    </div>
                    <v-table v-else-if="details[item.Nomor] && details[item.Nomor].length" density="compact"
                      class="detail-table">
                      <thead>
                        <tr>
                          <th>Nama Barang</th>
                          <th>Ukuran</th>
                          <th class="text-end">Jumlah</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="d in details[item.Nomor]" :key="d.Ukuran + d.NamaBarang">
                          <td>{{ d.NamaBarang }}</td>
                          <td>{{ d.Ukuran }}</td>
                          <td class="text-end">{{ d.Jumlah }}</td>
                        </tr>
                      </tbody>
                    </v-table>
                    <div v-else class="text-center py-2 text-caption text-grey">Tidak ada data detail.</div>
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
        <v-card-title class="text-h6">Isi Alasan Close SO</v-card-title>
        <v-card-text>
          <p class="text-caption mb-2">Anda akan menutup SO Nomor: <strong>{{ itemToClose?.Nomor }}</strong></p>
          <v-textarea v-model="closeReason" label="Alasan" rows="3" variant="outlined" autofocus></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="primary" @click="submitCloseSo">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>{{ confirmDialogText }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isConfirmDialogVisible = false">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="executeDelete">Ya, Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-h6">
          Custom Filter — {{ customFilter.key }}
        </v-card-title>

        <v-card-text>
          <v-select v-model="customFilter.operator" :items="[
            { title: ' = (sama dengan)', value: '=' },
            { title: ' ≠ (tidak sama)', value: '!=' },
            { title: ' > (lebih besar)', value: '>' },
            { title: ' ≥ (lebih besar sama)', value: '>=' },
            { title: ' < (lebih kecil)', value: '<' },
            { title: ' ≤ (lebih kecil sama)', value: '<=' },
            { title: ' contains', value: 'contains' },
            { title: ' starts with', value: 'starts' },
            { title: ' ends with', value: 'ends' }
          ]" label="Operator" density="compact" />

          <v-text-field v-model="customFilter.value" label="Value" density="compact" autofocus />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">OK</v-btn>
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
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

/* Legend Section */
.legend-section {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  font-size: 11px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  flex-shrink: 0;
}

.legend-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row-color-sample-closed {
  background-color: #FFFF99;
  width: 14px;
  height: 14px;
  border: 1px solid #e0e0e0;
  display: inline-block;
}

/* Table Container */
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

/* Header Resize Style */
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
  border-right: 2px solid rgba(var(--v-theme-on-primary), 0.8);
}

/* Detail Sticky Container */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  background-color: rgb(var(--v-theme-surface));
  padding: 16px 16px 16px 64px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 500px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

/* Pewarnaan Row & LHK */
:deep(td.text-red) {
  color: red !important;
}

:deep(td.text-blue) {
  color: blue !important;
}

.row-closed :deep(td:first-child) {
  background-color: rgba(255, 235, 59, 0.6);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
  font-weight: 600;
}

.lhk-zero {
  background-color: #FF5252 !important;
  color: white !important;
}

.lhk-progress {
  background-color: #1A237E !important;
  color: white !important;
}

.lhk-normal {
  background-color: #E0E0E0 !important;
}

:deep(.compact-select-list .v-list-item-title) {
  font-size: 11px !important;
}

.filter-menu {
  padding: 6px 0 !important;
  font-size: 11px !important;
}

.filter-menu .v-list-item {
  min-height: 26px !important;
  padding: 2px 10px !important;
}

.filter-menu .v-list-item-title {
  font-size: 11px !important;
}

.filter-menu .v-list-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.custom-filter-item {
  font-weight: 600;
  color: #1565c0;
  font-size: 11px !important;
}

.filter-section .btn-detail {
  height: 36px !important;
  width: auto !important;
  min-width: 120px !important;
  padding: 0 16px !important;
  font-size: 0.875rem !important;
  text-transform: none !important;
  /* supaya tidak kapital semua */
}

/* khusus warna merah Reset Filter */
.reset-filter-btn {
  color: rgb(var(--v-theme-error)) !important;
  background-color: rgba(var(--v-theme-error), 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(var(--v-theme-error), 0.25) !important;
}
</style>

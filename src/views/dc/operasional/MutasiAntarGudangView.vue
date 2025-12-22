<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import MintaBarangSearchModal from '@/components/lookup/MintaBarangSearchModal.vue';
import type { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Tipe Data ---
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

interface MutasiHeader {
  nomor: string;
  tanggal: string;
  noSTBJ: string;
  closing: 'Y' | 'N';
  ngedit: 'WAIT' | 'ACC' | 'TOLAK' | '';
  keterangan: string;
  total?: number;
  [key: string]: unknown;
}

interface MutasiDetail {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}

interface ColumnFilter {
  type: 'multi' | 'custom';
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '216';

const masterData = ref<MutasiHeader[]>([]);
const details = ref<Record<string, MutasiDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MutasiHeader[]>([]);
const expanded = ref<string[]>([]);

const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });
const dialogAlasan = reactive({
  show: false,
  alasan: '',
  isLoading: false,
});
const isBarangSearchVisible = ref(false);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  kodeBarang: '',
  namaBarang: '',
});

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: '', operator: '=', value: '' });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Header Definisi (Resizable) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'nomor', width: 160, fixed: true },
  { title: 'Tanggal', key: 'tanggal', width: 110 },
  { title: 'Dari Gudang', key: 'dariGudang', width: 120 },
  { title: 'Ke Gudang', key: 'keGudang', width: 120 },
  { title: 'Nama Store', key: 'namaStore', width: 200 },
  { title: 'Keterangan', key: 'keterangan', width: 250 },
  { title: 'No. STBJ', key: 'noSTBJ', width: 150 },
  { title: 'Total', key: 'total', align: 'end', width: 100 },
  { title: 'Status', key: 'ngedit', align: 'center', width: 100 },
  { title: 'User', key: 'usr', width: 100 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'kode', width: '120px' },
  { title: 'Nama Barang', key: 'nama', width: '300px' },
  { title: 'Ukuran', key: 'ukuran', width: '80px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '100px' },
] as const;

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MutasiHeader | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canEdit = computed(() => {
  if (!isSingleSelected.value) return false;
  return selectedRow.value?.noSTBJ === '' && selectedRow.value?.closing !== 'Y';
});
const canDelete = computed(() => canEdit.value);
const canCetak = computed(() => isSingleSelected.value);
const canAjukan = computed(() => isSingleSelected.value && selectedRow.value?.noSTBJ === '');

// --- Logic Filter Client-Side ---
const filteredList = computed(() => {
  let data = [...masterData.value];

  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    // MULTI FILTER
    if (f.type === 'multi' && f.values) {
      data = data.filter(row =>
        f.values!.includes(row[key] as string | number)
      );
    }

    // CUSTOM FILTER
    if (f.type === 'custom' && f.value !== undefined) {
      const target = String(f.value).toLowerCase();
      data = data.filter(row => {
        const v = row[key];
        if (v === null || v === undefined) return false;
        const s = String(v).toLowerCase();

        switch (f.operator) {
          case '=': return s === target;
          case '!=': return s !== target;
          case '>': return Number(s) > Number(target);
          case '>=': return Number(s) >= Number(target);
          case '<': return Number(s) < Number(target);
          case '<=': return Number(s) <= Number(target);
          case 'contains': return s.includes(target);
          case 'starts': return s.startsWith(target);
          case 'ends': return s.endsWith(target);
          default: return true;
        }
      });
    }
  }
  return data;
});

// --- Methods: Filter Logic ---
const uniqueValues = (key: string): Array<string | number> => {
  return Array.from(
    new Set(
      masterData.value
        .map(i => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== '')
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
};

const formatFilterValue = (key: string, val: string | number) => {
  if (!val) return '-';
  if (['tanggal'].includes(key)) {
    try {
      return format(new Date(String(val)), 'dd/MM/yyyy');
    } catch {
      return val;
    }
  }
  return val;
};

const filterType = (key: string) => columnFilters.value[key]?.type ?? '';
const isFilterActive = (key: string) => Boolean(columnFilters.value[key]);
const clearColumnFilter = (key: string) => { delete columnFilters.value[key]; };

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

const openCustomFilter = (key: string) => {
  customFilter.key = key;
  customFilter.operator = '=';
  customFilter.value = '';
  customFilterDialog.value = true;
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

// --- Methods: Resize Logic ---
const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  e.preventDefault(); e.stopPropagation();
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

// --- Logic Selection ---
const handleRowClick = (_event: Event, { item }: { item: MutasiHeader }) => {
  selected.value = [item];
};

// --- Methods: Data ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/mutasi-antar-gudang', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MutasiHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor));
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/mutasi-antar-gudang/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}.`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const handleNew = () => router.push({ name: 'MutasiAntarGudangCreate' });

const handleEdit = () => {
  if (!canEdit.value) {
    if (selectedRow.value?.noSTBJ) return toast.error('Mutasi Otomatis dari STBJ. Tidak bisa diubah.');
    if (selectedRow.value?.closing === 'Y') return toast.error('Sudah Closing Stok Opname. Tidak bisa diubah.');
    return;
  }
  router.push({ name: 'MutasiAntarGudangEdit', params: { nomor: selectedRow.value!.nomor } });
};

const handleCetak = () => {
  if (!canCetak.value) return;
  const routeData = router.resolve({
    name: 'MutasiAntarGudangPrint',
    params: { nomor: selectedRow.value!.nomor }
  });
  window.open(routeData.href, '_blank');
};

const openDeleteDialog = () => {
  if (!canDelete.value) {
    if (selectedRow.value?.noSTBJ) return toast.error('Mutasi Otomatis dari STBJ. Tidak bisa dihapus.');
    if (selectedRow.value?.closing === 'Y') return toast.error('Sudah Closing Stok Opname. Tidak bisa dihapus.');
    return;
  }
  showConfirmation('Konfirmasi Hapus', `Yakin ingin hapus mutasi ${selectedRow.value!.nomor}?`, handleDelete);
};

const handleDelete = async () => {
  try {
    const response = await api.delete(`/mutasi-antar-gudang/${selectedRow.value!.nomor}`);
    toast.success(response.data.message);
    fetchData();
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal menghapus.');
  }
};

const openAlasanDialog = () => {
  if (!canAjukan.value) return;
  dialogAlasan.alasan = '';
  dialogAlasan.show = true;
};

const handleAjukan = async () => {
  if (!dialogAlasan.alasan.trim()) return toast.warning('Alasan harus diisi.');
  dialogAlasan.isLoading = true;
  try {
    const response = await api.post('/mutasi-antar-gudang/ajukan', {
      nomor: selectedRow.value!.nomor,
      tanggal: selectedRow.value!.tanggal,
      keterangan: selectedRow.value!.keterangan,
      alasan: dialogAlasan.alasan,
    });
    toast.success(response.data.message);
    dialogAlasan.show = false;
    fetchData();
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal mengajukan.');
  } finally {
    dialogAlasan.isLoading = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header Mutasi");
    XLSX.writeFile(workbook, "Export_MutasiAG_Header.xlsx");
  } else if (type === 'detail') {
    try {
      loading.value = true;
      const response = await api.get('/mutasi-antar-gudang/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Mutasi");
      XLSX.writeFile(workbook, "Export_MutasiAG_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    } finally {
      loading.value = false;
    }
  }
};

const onBarangSelected = async (selectedProduct: { kode: string, nama: string }) => {
  filters.kodeBarang = selectedProduct.kode;
  filters.namaBarang = selectedProduct.nama;
  isBarangSearchVisible.value = false;
  await nextTick();
  fetchData();
};

const clearBarangFilter = () => {
  filters.kodeBarang = '';
  filters.namaBarang = '';
  fetchData();
};

const getRowTextColor = (item: MutasiHeader) => {
  if (item.noSTBJ) return 'text-blue';
  if (item.ngedit === 'WAIT') return 'text-blue font-weight-bold';
  if (item.ngedit === 'TOLAK') return 'text-red font-weight-bold';
  if (item.ngedit === 'ACC') return 'text-green font-weight-bold';
  return '';
};

const getStatusChipColor = (status: string) => {
  if (status === 'WAIT') return 'blue';
  if (status === 'TOLAK') return 'red';
  if (status === 'ACC') return 'green';
  return 'grey';
};

onMounted(fetchData);
watch(() => [filters.startDate, filters.endDate], fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Mutasi Stok Antar Gudang" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="handleEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="openDeleteDialog">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!canCetak"
        prepend-icon="mdi-printer" @click="handleCetak">Cetak</v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">Export</v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"><v-list-item-title>Export Header</v-list-item-title></v-list-item>
          <v-list-item @click="exportData('detail')"><v-list-item-title>Export Detail</v-list-item-title></v-list-item>
        </v-list>
      </v-menu>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" color="purple"
        prepend-icon="mdi-comment-question-outline" :disabled="!canAjukan" @click="openAlasanDialog">
        Pengajuan Perubahan
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px;" />

        <v-text-field v-model="filters.kodeBarang" label="Cari Kode Barang (F1)" density="compact" hide-details
          variant="outlined" class="ms-4" style="max-width: 180px;" readonly @click="isBarangSearchVisible = true"
          @keydown.f1.prevent="isBarangSearchVisible = true" clearable @click:clear="clearBarangFilter"
          append-inner-icon="mdi-magnify" @click:append-inner="isBarangSearchVisible = true" />

        <v-text-field v-model="filters.namaBarang" label="Nama Barang" density="compact" hide-details variant="filled"
          class="ms-2" style="max-width: 250px;" readonly />

        <v-spacer />

        <v-btn class="reset-filter-btn ms-2" color="error" variant="tonal" icon @click="resetAllFilters">
          <v-icon size="18">mdi-filter-off</v-icon>
        </v-btn>

        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="loading" class="ms-2" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="filteredList"
          :loading="loading" :item-class="getRowTextColor" item-value="nomor" density="compact"
          class="desktop-table header-browse-blue" fixed-header show-select show-expand return-object single-select
          @update:expanded="loadDetails" @click:row="handleRowClick">
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th v-if="['data-table-expand', 'data-table-select'].includes(header.key)"
                  :style="{ width: header.width + 'px' }" class="resizable-header">
                  <div class="header-content"><span>{{ header.title }}</span></div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
                </th>

                <th v-else :style="{ width: header.width + 'px' }" class="resizable-header" @click="toggleSort(header)">
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="14">{{ getSortIcon(header) }}</v-icon>

                    <v-menu location="bottom start" :close-on-content-click="false">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="16" class="ms-1" @click.stop
                          :color="isFilterActive(header.key) ? 'blue' : ''"
                          :icon="filterType(header.key) === 'custom' ? 'mdi-filter-cog' : filterType(header.key) === 'multi' ? 'mdi-filter-multiple' : 'mdi-filter-variant'" />
                      </template>
                      <v-list class="filter-menu" density="compact">
                        <v-list-item @click="clearColumnFilter(header.key)">
                          <v-list-item-title class="text-caption font-weight-bold text-error">(Clear
                            Filter)</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item v-for="val in uniqueValues(header.key)" :key="val"
                          @click="toggleMultiSelectValue(header.key, val)">
                          <template #prepend>
                            <v-checkbox-btn :model-value="columnFilters[header.key]?.values?.includes(val)"
                              density="compact" />
                          </template>
                          <v-list-item-title>{{ formatFilterValue(header.key, val) }}</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click="openCustomFilter(header.key)">
                          <v-list-item-title class="text-caption text-primary">(Custom Filter...)</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn icon="mdi-chevron-down" :class="{ 'rotate-180': isExpanded(internalItem) }" size="x-small"
              variant="text" @click.stop="toggleExpand(internalItem)" />
          </template>

          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal as string), 'dd-MM-yyyy') }}
          </template>

          <template #[`item.total`]="{ item }">
            {{ (item.total || 0).toLocaleString('id-ID') }}
          </template>

          <template #[`item.ngedit`]="{ item }">
            <v-chip v-if="item.ngedit" :color="getStatusChipColor(item.ngedit as string)" size="x-small" class="pa-1">
              {{ item.ngedit }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>

                    <v-data-table v-else-if="details[item.nomor] && details[item.nomor].length > 0"
                      :headers="detailHeaders" :items="details[item.nomor]" density="compact" class="detail-table"
                      :items-per-page="-1" hide-default-footer>
                      <template #bottom></template>
                    </v-data-table>

                    <div v-else class="text-center text-caption py-2">
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

    <MintaBarangSearchModal v-if="isBarangSearchVisible" source="ambil-barang" :gudang="authStore.user?.cabang || 'KDC'"
      @close="isBarangSearchVisible = false" @product-selected="onBarangSelected" />

    <v-dialog v-model="dialogAlasan.show" max-width="500px" persistent>
      <v-card>
        <v-card-title class="text-h6">Pengajuan Perubahan Data</v-card-title>
        <v-card-text>
          <v-textarea v-model="dialogAlasan.alasan" label="Alasan Perubahan" rows="3" variant="outlined" autofocus />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogAlasan.show = false">Batal</v-btn>
          <v-btn color="primary" @click="handleAjukan" :loading="dialogAlasan.isLoading">Ajukan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal"
            @click="() => { dialogConfirm.onConfirm(); dialogConfirm.show = false; }">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold">Custom Filter</v-card-title>
        <v-card-text>
          <v-select v-model="customFilter.operator"
            :items="['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts', 'ends']" density="compact" hide-details
            class="mb-2" />
          <v-text-field v-model="customFilter.value" density="compact" hide-details autofocus placeholder="Value..." />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Batal</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">Terapkan</v-btn>
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

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Table Style */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* Header Resize */
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
  cursor: pointer;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  border-right: 2px solid #1565c0;
}

/* Detail Sticky (Left) */
.detail-container {
  position: sticky;
  left: 0;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: flex-start;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-size: 11px !important;
  height: 32px !important;
}

.filter-menu {
  max-height: 300px;
  overflow-y: auto;
}

/* --- TOMBOL RESET FILTER --- */
.reset-filter-btn {
  width: 40px;
  height: 40px;

  border-radius: 6px !important;
  /* sama seperti input */
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}
</style>

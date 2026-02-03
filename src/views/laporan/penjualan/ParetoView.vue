<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Inisialisasi & State ---
interface ParetoItem {
  kode_cabang: string;
  nama_cabang: string;
  hari?: string;
  tanggal?: string;
  omset?: number;
  total_omset?: number;
  target?: number;
  total_target?: number;
  ach?: number;
  [key: string]: string | number | undefined; // fallback untuk field dinamis seperti size
}
interface ColumnFilter {
  type: 'multi' | 'custom';
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}
type FilterValue = string | number;

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '511';

const items = ref<ParetoItem[]>([]);
const isLoading = ref(true);
const cabangOptions = ref([]);
const kategoriOptions = ref([]);
const page = ref(1);
const itemsPerPage = ref(10);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '',
  kategori: 'ALL',
  search: '',
  limit: 50, // [UBAH INI] Menambahkan default limit, misal 50
});

const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({
  key: '',
  operator: '=',
  value: ''
});
const resizingColumn = ref(null);
const startX = ref(0);
const startWidth = ref(0);

const headers = ref([
  { title: 'Cabang', key: 'Cab', width: 80 },
  { title: 'Kode', key: 'KODE', width: 120 },
  { title: 'Kategori Produk', key: 'KTGPRODUK', width: 140 },
  { title: 'Nama Barang', key: 'NAMA', width: 380 },
  { title: 'ALLSIZE', key: 'ALLSIZE', align: 'end', width: 80 },
  { title: 'XS', key: 'XS', align: 'end', width: 60 },
  { title: 'S', key: 'S', align: 'end', width: 60 },
  { title: 'M', key: 'M', align: 'end', width: 60 },
  { title: 'L', key: 'L', align: 'end', width: 60 },
  { title: 'XL', key: 'XL', align: 'end', width: 60 },
  { title: '2XL', key: '2XL', align: 'end', width: 60 },
  { title: '3XL', key: '3XL', align: 'end', width: 60 },
  { title: '4XL', key: '4XL', align: 'end', width: 60 },
  { title: '5XL', key: '5XL', align: 'end', width: 60 },
  { title: 'OVERSIZE', key: 'OVERSIZE', align: 'end', width: 80 },
  { title: 'JUMBO', key: 'JUMBO', align: 'end', width: 80 },
  { title: 'Total Qty', key: 'TOTAL', align: 'end', width: 100 },
  { title: 'Nominal Sales', key: 'NOMINAL_SALES', align: 'end', width: 140 },
  { title: 'Stok Pareto', key: 'StokPareto', align: 'end', width: 120 },
  { title: 'Stok Real', key: 'StokReal', align: 'end', width: 120 },
]);

const filteredItems = computed(() => {
  let data = [...items.value];

  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    if (f.type === 'multi') {
      data = data.filter(r => f.values!.includes(r[key]));
    }

    if (f.type === 'custom') {
      const t = String(f.value);

      data = data.filter(r => {
        const v = String(r[key] ?? '');

        switch (f.operator) {
          case '=': return v == t;
          case '!=': return v != t;
          case '>': return Number(v) > Number(t);
          case '>=': return Number(v) >= Number(t);
          case '<': return Number(v) < Number(t);
          case '<=': return Number(v) <= Number(t);
          case 'contains': return v.toLowerCase().includes(t.toLowerCase());
          case 'starts': return v.toLowerCase().startsWith(t.toLowerCase());
          case 'ends': return v.toLowerCase().endsWith(t.toLowerCase());
        }
      });
    }
  }

  return data;
});

const onResizeStart = (e, col) => {
  resizingColumn.value = col;
  startX.value = e.pageX;
  startWidth.value = col.width;
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
};

const onResizeMove = e => {
  if (!resizingColumn.value) return;
  const diff = e.pageX - startX.value;
  resizingColumn.value.width = Math.max(50, startWidth.value + diff);
};

const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
};

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/pareto', { params: filters });
    items.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;

    if (error.response) {
      // Error dari server (HTTP 4xx/5xx)
      toast.error(error.response.data?.message || `Gagal memuat data. Status: ${error.response.status}`);
    } else if (error.request) {
      // Request dibuat tapi tidak ada response
      toast.error('Tidak ada respon dari server. Periksa koneksi.');
    } else {
      // Error lain (misal konfigurasi axios)
      toast.error(`Terjadi kesalahan: ${error.message}`);
    }
  } finally {
    isLoading.value = false;
  }
};
const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/pareto/cabang-options');
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat filter cabang.', error);
  }
};
const fetchKategoriOptions = async () => {
  try {
    const response = await api.get('/pareto/kategori-options');
    kategoriOptions.value = response.data;
  } catch (error) { toast.error('Gagal memuat filter kategori.', error); }
};
const uniqueValues = (key: string) => {
  const set = new Set(
    items.value
      .map(i => i[key])
      .filter(v => v !== null && v !== undefined && v !== '')
  );
  return Array.from(set).sort();
};

const filterType = (key: string) => {
  if (!columnFilters.value[key]) return '';
  return columnFilters.value[key].type;
};

const isFilterActive = (key: string) => Boolean(columnFilters.value[key]);

const clearColumnFilter = (key: string) => {
  delete columnFilters.value[key];
};

const toggleMultiSelectValue = (key: string, val: FilterValue) => {
  const f = columnFilters.value[key];

  if (!f || f.type !== 'multi') {
    columnFilters.value[key] = { type: 'multi', values: [val] };
    return;
  }

  const arr = f.values ?? [];

  if (arr.includes(val)) {
    f.values = arr.filter(v => v !== val);
    if (f.values.length === 0) delete columnFilters.value[key];
  } else {
    f.values = [...arr, val];
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
  fetchData();
};

const exportToExcel = () => {
  if (items.value.length === 0) return toast.warning('Tidak ada data untuk diekspor.');
  const worksheet = XLSX.utils.json_to_sheet(items.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pareto Barang Terjual");
  XLSX.writeFile(workbook, "Laporan_Pareto.xlsx");
  toast.success('Data berhasil diekspor.');
};

const handlePrint = () => {
  // Bangun URL untuk halaman cetak dengan filter saat ini
  const routeData = router.resolve({
    name: 'LaporanParetoPrint', // Nama rute baru kita
    query: { ...filters }
  });
  // Buka di tab baru
  window.open(routeData.href, '_blank');
};

onMounted(() => {
  fetchCabangOptions(); // <-- Panggil fungsi yang sudah diisi
  fetchKategoriOptions();
  fetchData();
});

watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Pareto Barang Terjual" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="handlePrint" prepend-icon="mdi-printer">Cetak</v-btn>
      <v-btn size="small" color="teal" @click="exportToExcel" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-select v-model="filters.kategori" :items="kategoriOptions" label="Kategori Produk" density="compact"
          hide-details variant="outlined" class="ms-4" style="max-width: 180px;" />
        <v-select v-model="filters.cabang" :items="cabangOptions" item-title="nama" item-value="kode" label="Gudang"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 180px;" />
        <v-text-field label="Item" v-model.number="filters.limit" type="number" density="compact" hide-details
          variant="outlined" class="ms-4" style="max-width: 120px;" />
        <v-text-field v-model="filters.search" placeholder="Cari Barang..." prepend-inner-icon="mdi-magnify"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 250px;" clearable />
        <v-spacer />
        <v-btn prepend-icon="mdi-filter-off" variant="tonal" color="red" class="reset-filter-btn me-2"
          @click="resetAllFilters">
          Reset Filter
        </v-btn>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-container">
        <AppDataTable :headers="headers" :items="filteredItems" v-model:page="page" :items-per-page="itemsPerPage"
          :items-per-page-options="[10, 20, 50, 100]" show-current-page density="compact" fixed-header>
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="col in columns" :key="col.key">
                <th :style="{
                  width: col.width + 'px',
                  minWidth: col.width + 'px',
                  maxWidth: col.width + 'px'
                }" class="resizable-header" :class="{
                  'text-end': col.align === 'end',
                  'text-center': col.align === 'center'
                }" @click="toggleSort(col)">
                  <div class="header-content">
                    <span>{{ col.title }}</span>

                    <div class="header-icons">
                      <v-icon v-if="isSorted(col)" size="12">
                        {{ getSortIcon(col) }}
                      </v-icon>

                      <v-menu location="bottom start">
                        <template #activator="{ props }">
                          <v-icon size="16" v-bind="props" :color="isFilterActive(col.key) ? 'blue' : ''" :icon="filterType(col.key) === 'custom'
                            ? 'mdi-filter-cog'
                            : filterType(col.key) === 'multi'
                              ? 'mdi-filter-multiple'
                              : 'mdi-filter-variant'
                            " />
                        </template>

                        <v-list class="filter-menu">
                          <v-list-item @click="clearColumnFilter(col.key)">
                            <v-list-item-title>(Select All)</v-list-item-title>
                          </v-list-item>

                          <v-divider />

                          <v-list-item v-for="val in uniqueValues(col.key)" :key="val"
                            @click.stop="toggleMultiSelectValue(col.key, val)">
                            <template #prepend>
                              <v-checkbox density="compact"
                                :model-value="columnFilters[col.key]?.values?.includes(val)" />
                            </template>

                            <v-list-item-title>{{ val }}</v-list-item-title>
                          </v-list-item>

                          <v-divider />

                          <v-list-item @click="openCustomFilter(col.key)">
                            <v-list-item-title class="custom-filter-item">(Custom Filter…)</v-list-item-title>
                          </v-list-item>
                        </v-list>
                      </v-menu>
                    </div> <!-- ✅ TUTUP DI SINI -->
                  </div> <!-- ✅ TUTUP .header-content -->

                  <div class="resizer" @mousedown.stop="onResizeStart($event, col)" @click.stop />
                </th>
              </template>
            </tr>
          </template>

          <!-- BODY -->
          <template v-for="col in headers" :key="col.key" #[`item.${col.key}`]="{ item }">
            <td :class="{ 'text-end': col.align === 'end' }">
              {{
                typeof item[col.key] === 'number'
                  ? item[col.key].toLocaleString('id-ID')
                  : item[col.key]
              }}
            </td>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-h6">
          Custom Filter — {{ customFilter.key }}
        </v-card-title>

        <v-card-text>
          <v-select v-model="customFilter.operator" :items="[
            { title: ' = (sama dengan)', value: '=' },
            { title: ' ≠ (tidak sama)', value: '!=' },
            { title: ' >', value: '>' },
            { title: ' ≥', value: '>=' },
            { title: ' <', value: '<' },
            { title: ' ≤', value: '<=' },
            { title: ' contains', value: 'contains' },
            { title: ' starts with', value: 'starts' },
            { title: ' ends with', value: 'ends' }
          ]" density="compact" />

          <v-text-field v-model="customFilter.value" density="compact" autofocus />
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
.table-container {
  height: calc(100vh - 220px);
  overflow-y: auto;
}

/* GENERAL TABLE LOOK */
.resizable-header {
  background-color: #e3f2fd !important;
  color: #0d47a1 !important;
  border-bottom: 2px solid #1976d2 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px;
  padding: 0 6px !important;
  white-space: nowrap;
}

/* Body text */
:deep(td) {
  font-size: 11px !important;
  padding: 4px 8px !important;
}

/* Header content alignment */
.header-content {
  display: flex;
  align-items: center;
}

/* Filter menu styling */
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
  background-color: #e3f2fd !important;
}

.filter-menu .v-checkbox {
  margin-right: 6px !important;
}

.custom-filter-item {
  font-weight: 600;
  color: #1565c0;
  font-size: 11px !important;
}

/* Reset button style */
.filter-section .reset-filter-btn {
  height: 36px !important;
  min-width: 140px !important;
  padding: 0 16px !important;
  font-size: 0.875rem !important;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* ⬅ FIX UTAMA */
  width: 100%;
}

.header-icons {
  display: flex;
  align-items: center;
  gap: 2px;
  /* jarak antar ikon */
}
</style>

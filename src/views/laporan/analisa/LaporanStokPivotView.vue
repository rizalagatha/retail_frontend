<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- 1. Gunakan Impor yang Sudah Berhasil ---
import { HotTable } from '@handsontable/vue3';
import { registerAllPlugins } from 'handsontable/plugins';
import 'handsontable/dist/handsontable.min.css';
import { registerCellType, CheckboxCellType, DateCellType, NumericCellType } from 'handsontable/cellTypes';
import Handsontable from 'handsontable';

// --- 2. Registrasikan Modul yang Dibutuhkan ---
registerAllPlugins();
registerCellType(CheckboxCellType);
registerCellType(DateCellType);
registerCellType(NumericCellType); // <-- Ini penting untuk kolom Stok

// --- Inisialisasi & State ---
interface StokItem {
  Cabang: string;
  Kode: string;
  Nama: string;
  Ukuran: string;
  Stok: number;
}
interface PivotTableSettings {
  rows: string[];
  cols: string[];
  values: [string, string][];
}
const toast = useToast();
const router = useRouter();
const authStore = useAuthStore();
const MENU_ID = '507';

const rawData = ref<StokItem[]>([]);
const isLoading = ref(true);
const isPivotMode = ref(false);
const cabangOptions = ref([]);

const filters = reactive({
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang,
  tampilkanKosong: false,
});

// --- Konfigurasi Handsontable ---
const hotSettings = computed<Handsontable.GridSettings>(() => {
  const settings: Partial<Handsontable.GridSettings> & { pivotTable?: PivotTableSettings } = {
    data: rawData.value,
    height: 'auto',
    width: '100%',
    autoWrapCol: false,
    licenseKey: 'non-commercial-and-evaluation',
    readOnly: true,
    dropdownMenu: true,
    filters: true,
    columnSorting: true,
  };

  if (isPivotMode.value) {
    settings.pivotTable = {
      rows: ['Cabang', 'Nama', 'Ukuran'],
      cols: [],
      values: [['Stok', 'sum']],
    };
  } else {
    settings.colHeaders = ['Cabang', 'Kode', 'Nama Barang', 'Ukuran', 'Stok'];
    settings.columns = [
      { data: 'Cabang' },
      { data: 'Kode' },
      { data: 'Nama' },
      { data: 'Ukuran' },
      { data: 'Stok', type: NumericCellType, numericFormat: { pattern: '0,0' } },
    ] as Handsontable.ColumnSettings[];
  }

  return settings as Handsontable.GridSettings;
});

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/laporan-stok-pivot', { params: filters });
    rawData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/laporan-stok-pivot/cabang-options');
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat filter cabang.', error);
  }
};

const exportData = () => {
  if (rawData.value.length === 0) return toast.warning('Tidak ada data untuk diekspor.');
  const worksheet = XLSX.utils.json_to_sheet(rawData.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Stok");
  XLSX.writeFile(workbook, "Laporan_Stok_Pivot.xlsx");
};

const goToChart = () => {
  const routeData = router.resolve({
    name: 'LaporanStokChart',
    query: {
      cabang: filters.cabang,
      tampilkanKosong: String(filters.tampilkanKosong)
    }
  });
  window.open(routeData.href, '_blank');
};

onMounted(() => {
  fetchData();
  fetchCabangOptions();
});
</script>

<template>
  <PageLayout title="Laporan Stok (Pivot)" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-select v-model="filters.cabang" :items="cabangOptions" item-title="nama" item-value="kode" label="Cabang"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 180px;"
          :readonly="authStore.user?.cabang !== 'KDC'" @update:modelValue="fetchData" />
        <v-checkbox v-model="filters.tampilkanKosong" label="Tampilkan Stok Kosong" density="compact" hide-details
          class="ms-4" @update:modelValue="fetchData" />
        <v-spacer />
        <v-btn @click="goToChart" color="primary" variant="tonal">
          Lihat Grafik <v-icon end>mdi-chart-bar</v-icon>
        </v-btn>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" class="ms-4" />
      </div>

      <div class="table-wrapper d-flex flex-column">
        <div class="pa-2 d-flex align-center">
          <v-spacer />
          <v-switch v-model="isPivotMode" label="Mode Pivot" color="primary" hide-details density="compact" />
        </div>
        <div class="flex-grow-1" style="overflow: hidden;">
          <div v-if="isLoading" class="d-flex justify-center align-center fill-height">
            <v-progress-circular indeterminate size="64" />
          </div>
          <HotTable v-else :settings="hotSettings" />
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style>
/* Style flexbox dari jawaban sebelumnya tidak berubah */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
}

.filter-section {
  flex-shrink: 0;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-wrapper {
  flex-grow: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.handsontable {
  font-size: 12px;
}

.handsontable .htDimmed {
  color: #333;
}

.handsontable th,
.handsontable td {
  border-color: #e0e0e0;
}
</style>

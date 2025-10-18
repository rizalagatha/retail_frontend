<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import * as XLSX from 'xlsx';
import PageLayout from '@/components/PageLayout.vue';

interface KPIData {
  tahun: number;
  bulan: number;
  cabang: string;
  gdg_nama: string;
  jumlah: number;
  nominal: number;
  target_omset: number;
  ach_target: number;
  jumlah_last_month: number;
  last_month: number;
  ach_last_month: number;
  nominal2: number;
  target_omset2: number;
  ytd: number;
  nominal3: number;
  ach_last_year_cur_month: number;
  nominal4: number;
  target_omset4: number;
  ytd2: number;
}

const toast = useToast();
const authStore = useAuthStore();
const CABKAOS = authStore.user?.cabangUtama || 'KDC';

const masterData = ref<KPIData[]>([]);
const isLoading = ref(false);

// Filter
const filters = reactive({
  tahun: 2025,
  bulan: 9,
});

// Header tabel KPI
const headers = [
  { title: 'Cabang', key: 'cabang', fixed: true, width: '120px' },
  { title: 'Gudang', key: 'gdg_nama', width: '150px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
  { title: 'Nominal', key: 'nominal', align: 'end' },
  { title: 'Target Omset', key: 'target_omset', align: 'end' },
  { title: '% Ach Target', key: 'ach_target', align: 'end' },
  { title: 'Jumlah Last Month', key: 'jumlah_last_month', align: 'end' },
  { title: 'Nominal Last Month', key: 'last_month', align: 'end' },
  { title: '% Ach Last Month', key: 'ach_last_month', align: 'end' },
  { title: 'Nominal YTD', key: 'nominal2', align: 'end' },
  { title: 'Target YTD', key: 'target_omset2', align: 'end' },
  { title: '% YTD', key: 'ytd', align: 'end' },
  { title: 'Nominal Last Year Cur Month', key: 'nominal3', align: 'end' },
  { title: '% Ach Last Year Cur Month', key: 'ach_last_year_cur_month', align: 'end' },
  { title: 'Target Tahunan', key: 'target_omset4', align: 'end' },
  { title: '% YTD2', key: 'ytd2', align: 'end' },
];

const formatNumber = (num: number | null) => {
  if (num == null) return '-';
  return new Intl.NumberFormat('id-ID').format(Number(num.toFixed(2)));
};

// Hitung total agregat
const totalSummary = computed(() => {
  if (!masterData.value.length) return {};

  const totals: Record<string, number> = {};
  headers.forEach((header) => {
    const key = header.key;
    if (['jumlah', 'nominal', 'target_omset', 'jumlah_last_month', 'last_month', 'nominal2', 'target_omset2', 'nominal3', 'target_omset4'].includes(key)) {
      totals[key] = masterData.value.reduce((sum, item) => sum + (Number(item[key as keyof KPIData]) || 0), 0);
    }
  });
  return totals;
});

const fetchKPIData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/laporan-kpi', { params: filters });
    masterData.value = response.data;
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal memuat data KPI.');
  } finally {
    isLoading.value = false;
  }
};

// Ekspor ke Excel
const exportToExcel = () => {
  const ws = XLSX.utils.json_to_sheet(masterData.value);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan KPI');
  XLSX.writeFile(wb, `Laporan_KPI_${filters.tahun}_${filters.bulan}.xlsx`);
};

onMounted(fetchKPIData);
watch(filters, fetchKPIData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan KPI Penjualan" icon="mdi-chart-bar">
    <template #header-actions>
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportToExcel">
        Export
      </v-btn>
    </template>

    <div class="filter-section d-flex align-center flex-wrap mb-3">
      <v-text-field
        v-model="filters.tahun"
        label="Tahun"
        type="number"
        density="compact"
        variant="outlined"
        hide-details
        style="max-width: 120px;"
        class="me-4"
      />
      <v-text-field
        v-model="filters.bulan"
        label="Bulan"
        type="number"
        density="compact"
        variant="outlined"
        hide-details
        style="max-width: 100px;"
      />
      <v-btn
        class="ms-4"
        icon="mdi-refresh"
        variant="text"
        size="small"
        :loading="isLoading"
        @click="fetchKPIData"
      />
    </div>

    <div class="table-container">
      <v-data-table
        :headers="headers"
        :items="masterData"
        :loading="isLoading"
        class="desktop-table"
        density="compact"
        fixed-header
        height="480px"
      >
        <!-- Format angka -->
        <template v-for="col in ['jumlah', 'nominal', 'target_omset', 'ach_target', 'jumlah_last_month', 'last_month', 'ach_last_month', 'nominal2', 'target_omset2', 'ytd', 'nominal3', 'ach_last_year_cur_month', 'target_omset4', 'ytd2']" v-slot:[`item.${col}`]="{ item }">
          {{ formatNumber(item[col]) }}
        </template>

        <!-- TOTAL -->
        <template v-slot:body.append>
          <tr class="bg-grey-lighten-4 font-weight-bold total-row-fixed">
            <td v-for="(header, index) in headers" :key="index" class="text-end pa-2">
              <template v-if="index === 0">TOTAL :</template>
              <template v-else-if="['jumlah','nominal','target_omset','jumlah_last_month','last_month','nominal2','target_omset2','nominal3','target_omset4'].includes(header.key)">
                {{ formatNumber(totalSummary[header.key]) }}
              </template>
              <template v-else>&nbsp;</template>
            </td>
          </tr>
        </template>
      </v-data-table>
    </div>
  </PageLayout>
</template>

<style scoped>
.filter-section {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
.table-container {
  height: calc(100vh - 220px);
  overflow-y: auto;
}
.total-row-fixed {
  position: sticky;
  bottom: 0;
  background-color: #f5f5f5;
  z-index: 5;
  font-weight: bold;
  border-top: 2px solid #ccc;
}
.text-end {
  text-align: right;
}
</style>

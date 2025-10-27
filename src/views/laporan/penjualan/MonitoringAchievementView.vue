<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '705';

const activeTab = ref('daily');
const isLoading = ref(false);
const cabangOptions = ref([]);

const dailyData = ref<any[]>([]);
const weeklyData = ref<any[]>([]);
const monthlyData = ref<any[]>([]);
const ytdData = ref<any[]>([]);

const currentYear = new Date().getFullYear();
const filters = reactive({
  tahun: currentYear,
  bulan: new Date().getMonth() + 1,
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang,
});

const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, title: format(new Date(0, i), 'MMMM') }));

// Headers dinamis berdasarkan tab
// --- Definisi Headers untuk Setiap Tab ---
const headersDaily = [
  { title: 'No', key: 'no', sortable: false, width: '50px' }, { title: 'Kode Cabang', key: 'kode_cabang' },
  { title: 'Nama Cabang', key: 'nama_cabang', minWidth: '150px' }, { title: 'Hari', key: 'hari' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Omset (Harian)', key: 'omset' }, // Ganti judul
  { title: 'Total Omset (Kumulatif)', key: 'total_omset' }, // Ganti judul
  { title: 'Target (Harian)', key: 'target' }, // Ganti judul
  { title: 'Total Target (Kumulatif)', key: 'total_target' }, // <-- TAMBAHKAN INI
  { title: 'Ach(%)', key: 'ach' }, // Ini sudah kumulatif (benar)
];
const headersWeeklyGroup = [
  { title: 'No', rowspan: 2, key: 'no' }, { title: 'Kode Cabang', rowspan: 2, key: 'kode_cabang' }, { title: 'Nama Cabang', rowspan: 2, key: 'nama_cabang' },
  { title: 'Minggu 1', colspan: 3, align: 'center' }, { title: 'Minggu 2', colspan: 3, align: 'center' },
  { title: 'Minggu 3', colspan: 3, align: 'center' }, { title: 'Minggu 4', colspan: 3, align: 'center' },
  { title: 'Minggu 5', colspan: 3, align: 'center' }, { title: 'Total', colspan: 3, align: 'center' },
];
const headersWeeklySub = [
  'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)',
  'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)',
];
const headersMonthly = [
  { title: 'Tahun', key: 'tahun' }, { title: 'Bulan', key: 'bulan' },
  { title: 'Kode Cabang', key: 'kode_cabang' }, { title: 'Nama Cabang', key: 'nama_cabang' },
  { title: 'Omset', key: 'nominal' }, { title: 'Target', key: 'target' },
  { title: 'Ach(%)', key: 'ach' },
];
const headersYtd = [
  { title: 'No', key: 'no', sortable: false, width: '50px' }, { title: 'Tahun', key: 'tahun' },
  { title: 'Bulan', key: 'bulan' }, { title: 'Total Omset', key: 'nominal' },
  { title: 'Target', key: 'target' }, { title: 'Ach(%)', key: 'ach' },
];

// const activeHeaders = computed(() => {
//   switch (activeTab.value) {
//     case 'daily': return headersDaily;
//     case 'weekly': return headersWeekly;
//     case 'monthly': return headersMonthlyYTD;
//     case 'ytd': return headersMonthlyYTD;
//     default: return [];
//   }
// });

const totalSummary = computed(() => {
  switch (activeTab.value) {
    case 'daily': return dailyTotalSummary.value;
    case 'weekly': return weeklyTotalSummary.value;
    case 'monthly': return monthlyTotalSummary.value;
    case 'ytd': return ytdTotalSummary.value;
    default: return {};
  }
});

const dailyTotalSummary = computed(() => {
  if (!dailyData.value || dailyData.value.length === 0) return {};
  const lastItem = dailyData.value[dailyData.value.length - 1]; // Ambil baris terakhir
  const totals = {
    omset: dailyData.value.reduce((sum, item) => sum + (Number(item.omset) || 0), 0), // Total omset harian
    target: dailyData.value.reduce((sum, item) => sum + (Number(item.target) || 0), 0), // Total target harian
    // Ambil nilai kumulatif terakhir dari baris terakhir
    total_omset: lastItem?.total_omset || 0,
    total_target: lastItem?.total_target || 0, // <-- TAMBAHKAN INI
  };
  return {
    ...totals,
    // Pastikan ACH juga dihitung dari nilai kumulatif
    ach: totals.total_target > 0 ? (totals.total_omset / totals.total_target * 100) : 0, // <-- UBAH INI
  };
});

const weeklyTotalSummary = computed(() => {
  if (!weeklyData.value || weeklyData.value.length === 0) return {};
  const totals = weeklyData.value.reduce((acc, item) => {
    for (let i = 1; i <= 5; i++) {
      acc[`nominal_w${i}`] += (Number(item[`nominal_w${i}`]) || 0);
      acc[`target_w${i}`] += (Number(item[`target_w${i}`]) || 0);
    }
    acc.total_nominal += (Number(item.total_nominal) || 0);
    acc.total_target += (Number(item.total_target) || 0);
    return acc;
  }, { nominal_w1: 0, target_w1: 0, nominal_w2: 0, target_w2: 0, nominal_w3: 0, target_w3: 0, nominal_w4: 0, target_w4: 0, nominal_w5: 0, target_w5: 0, total_nominal: 0, total_target: 0 });

  for (let i = 1; i <= 5; i++) totals[`ach_w${i}`] = totals[`target_w${i}`] > 0 ? (totals[`nominal_w${i}`] / totals[`target_w${i}`] * 100) : 0;
  totals.total_ach = totals.total_target > 0 ? (totals.total_nominal / totals.total_target * 100) : 0;
  return totals;
});
const monthlyTotalSummary = computed(() => {
  if (!monthlyData.value || monthlyData.value.length === 0) return {};
  const totals = {
    nominal: monthlyData.value.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0),
    target: monthlyData.value.reduce((sum, item) => sum + (Number(item.target) || 0), 0),
  };
  return {
    ...totals,
    ach: totals.target > 0 ? (totals.nominal / totals.target * 100) : 0,
  };
});

const ytdTotalSummary = computed(() => {
  if (!ytdData.value || ytdData.value.length === 0) return {};
  const totals = {
    nominal: ytdData.value.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0),
    target: ytdData.value.reduce((sum, item) => sum + (Number(item.target) || 0), 0),
  };
  return {
    ...totals,
    ach: totals.target > 0 ? (totals.nominal / totals.target * 100) : 0,
  };
});

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/monitoring-achievement', {
      params: { ...filters, reportType: activeTab.value }
    });
    // Simpan data ke state yang sesuai
    if (activeTab.value === 'daily') dailyData.value = response.data;
    else if (activeTab.value === 'weekly') weeklyData.value = response.data;
    else if (activeTab.value === 'monthly') monthlyData.value = response.data;
    else if (activeTab.value === 'ytd') ytdData.value = response.data;
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/monitoring-achievement/cabang-options');
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat filter cabang.');
  }
};

onMounted(() => {
  fetchCabangOptions();
  fetchData();
});
watch(activeTab, (newTab) => {
  // Reset filter cabang ke default saat pindah tab
  if (newTab === 'weekly' || newTab === 'monthly') {
    // Untuk weekly dan monthly, tidak perlu filter cabang spesifik
    // Biarkan kosong atau set ke default
  } else if (newTab === 'daily' || newTab === 'ytd') {
    // Untuk daily dan ytd, kembalikan ke default user
    if (authStore.user?.cabang !== 'KDC') {
      filters.cabang = authStore.user?.cabang;
    }
  }

  // Fetch data akan otomatis terpanggil karena ada watch di [filters, activeTab]
});
watch([filters, activeTab], fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Monitoring Achievement" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <v-tabs v-model="activeTab" class="mb-2">
      <v-tab value="daily">Daily</v-tab>
      <v-tab value="weekly">Weekly</v-tab>
      <v-tab value="monthly">Monthly</v-tab>
      <v-tab value="ytd">Year to Date</v-tab>
    </v-tabs>

    <div class="browse-content">
      <div class="filter-section">
        <v-select v-model="filters.tahun" :items="yearOptions" label="Tahun" density="compact" hide-details
          variant="outlined" style="max-width: 150px;" />
        <v-select v-if="activeTab !== 'ytd'" v-model="filters.bulan" :items="monthOptions" item-title="title"
          item-value="value" label="Bulan" density="compact" hide-details variant="outlined" class="ms-4"
          style="max-width: 180px;" />
        <v-select v-if="activeTab === 'daily' || activeTab === 'ytd'" v-model="filters.cabang" :items="cabangOptions"
          item-title="nama" item-value="kode" label="Cabang" density="compact" hide-details variant="outlined"
          class="ms-4" style="max-width: 200px;" :readonly="authStore.user?.cabang !== 'KDC'" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-container">
        <v-window v-model="activeTab">
          <!-- Tab Daily -->
          <v-window-item value="daily">
            <v-data-table :headers="headersDaily" :items="dailyData" :loading="isLoading" class="desktop-table"
              density="compact" height="500" fixed-header :items-per-page="-1">
              <template #item.no="{ index }">
                {{ index + 1 }}
              </template>
              <template #item.tanggal="{ item }">{{ format(new Date(item.tanggal), 'dd-MM-yyyy') }}</template>
              <template v-for="col in ['omset', 'total_omset', 'target', 'total_target']" #[`item.${col}`]="{ item }">
                <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
              </template>
              <template #item.ach="{ item }">
                <td class="text-end">
                  <v-chip size="small" :color="item.ach >= 100 ? 'success' : 'error'">{{ (item.ach || 0).toFixed(2)
                    }}%</v-chip>
                </td>
              </template>
              <template #body.append>
                <tr class="bg-grey-lighten-3 font-weight-bold total-row-sticky">
                  <td colspan="5" class="text-start">GRAND TOTAL :</td>
                  <td class="text-start">{{ totalSummary.omset?.toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ totalSummary.total_omset?.toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ totalSummary.target?.toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ totalSummary.total_target?.toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ totalSummary.ach?.toFixed(2) }}%</td>
                </tr>
              </template>
              <template #bottom></template>
            </v-data-table>
          </v-window-item>

          <!-- Tab Weekly -->
          <v-window-item value="weekly">
            <div style="overflow-x: auto;">
              <table class="weekly-table">
                <thead>
                  <tr>
                    <th rowspan="2" style="min-width: 40px;">No</th>
                    <th rowspan="2" style="min-width: 80px;">Kode Cabang</th>
                    <th rowspan="2" style="min-width: 120px;">Nama Cabang</th>
                    <th colspan="3" class="text-center">Minggu 1</th>
                    <th colspan="3" class="text-center">Minggu 2</th>
                    <th colspan="3" class="text-center">Minggu 3</th>
                    <th colspan="3" class="text-center">Minggu 4</th>
                    <th colspan="3" class="text-center">Minggu 5</th>
                    <th colspan="3" class="text-center">Total</th>
                  </tr>
                  <tr>
                    <template v-for="w in 6" :key="w">
                      <th class="text-end" style="min-width: 100px;">Omset</th>
                      <th class="text-end" style="min-width: 100px;">Target</th>
                      <th class="text-center" style="min-width: 70px;">Ach(%)</th>
                    </template>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="isLoading">
                    <td colspan="21" class="text-center py-4">Loading...</td>
                  </tr>
                  <tr v-else-if="weeklyData.length === 0">
                    <td colspan="21" class="text-center py-4">Tidak ada data</td>
                  </tr>
                  <template v-else>
                    <tr v-for="(item, index) in weeklyData" :key="index">
                      <td class="text-center">{{ index + 1 }}</td>
                      <td>{{ item.kode_cabang }}</td>
                      <td>{{ item.nama_cabang }}</td>
                      <template v-for="w in 5" :key="w">
                        <td class="text-end">{{ (item[`nominal_w${w}`] || 0).toLocaleString('id-ID') }}</td>
                        <td class="text-end">{{ (item[`target_w${w}`] || 0).toLocaleString('id-ID') }}</td>
                        <td class="text-center">
                          <v-chip size="x-small"
                            :color="(item[`target_w${w}`] > 0 ? (item[`nominal_w${w}`] / item[`target_w${w}`] * 100) : 0) >= 100 ? 'success' : 'error'">
                            {{ (item[`target_w${w}`] > 0 ? (item[`nominal_w${w}`] / item[`target_w${w}`] * 100) :
                              0).toFixed(2) }}%
                          </v-chip>
                        </td>
                      </template>
                      <td class="text-end font-weight-bold">{{ (item.total_nominal || 0).toLocaleString('id-ID') }}</td>
                      <td class="text-end font-weight-bold">{{ (item.total_target || 0).toLocaleString('id-ID') }}</td>
                      <td class="text-center">
                        <v-chip size="x-small"
                          :color="(item.total_target > 0 ? (item.total_nominal / item.total_target * 100) : 0) >= 100 ? 'success' : 'error'">
                          {{ (item.total_target > 0 ? (item.total_nominal / item.total_target * 100) : 0).toFixed(2) }}%
                        </v-chip>
                      </td>
                    </tr>
                  </template>
                </tbody>
                <tfoot v-if="weeklyData.length > 0">
                  <tr class="total-row-sticky">
                    <td colspan="3" class="text-end">GRAND TOTAL :</td>
                    <template v-for="w in 5" :key="w">
                      <td class="text-end">{{ (weeklyTotalSummary[`nominal_w${w}`] || 0).toLocaleString('id-ID') }}</td>
                      <td class="text-end">{{ (weeklyTotalSummary[`target_w${w}`] || 0).toLocaleString('id-ID') }}</td>
                      <td class="text-center">{{ (weeklyTotalSummary[`ach_w${w}`] || 0).toFixed(2) }}%</td>
                    </template>
                    <td class="text-end">{{ (weeklyTotalSummary.total_nominal || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-end">{{ (weeklyTotalSummary.total_target || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-center">{{ (weeklyTotalSummary.total_ach || 0).toFixed(2) }}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </v-window-item>

          <!-- Tab Monthly -->
          <v-window-item value="monthly">
            <v-data-table :headers="headersMonthly" :items="monthlyData" :loading="isLoading" class="desktop-table"
              density="compact" fixed-header :items-per-page="-1">
              <template v-for="col in ['nominal', 'target']" #[`item.${col}`]="{ item }">
                <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
              </template>
              <template #item.ach="{ item }">
                <td class="text-end">
                  <v-chip size="small" :color="item.ach >= 100 ? 'success' : 'error'">{{ (item.ach || 0).toFixed(2)
                    }}%</v-chip>
                </td>
              </template>
              <template #body.append>
                <tr class="total-row-sticky">
                  <td></td>
                  <td></td>
                  <td></td>
                  <td class="text-start">GRAND TOTAL :</td>
                  <td class="text-start">{{ (totalSummary.nominal || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ (totalSummary.target || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ (totalSummary.ach || 0).toFixed(2) }}%</td>
                </tr>
              </template>
              <template #bottom></template>
            </v-data-table>
          </v-window-item>

          <!-- Tab Year to Date -->
          <v-window-item value="ytd">
            <v-data-table :headers="headersYtd" :items="ytdData" :loading="isLoading" class="desktop-table"
              density="compact" fixed-header :items-per-page="-1">
              <template #item.no="{ index }">{{ index + 1 }}</template>
              <template #item.bulan="{ item }">{{monthOptions.find(m => m.value === item.bulan)?.title}}</template>
              <template v-for="col in ['nominal', 'target']" #[`item.${col}`]="{ item }">
                <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
              </template>
              <template #item.ach="{ item }">
                <td class="text-end">
                  <v-chip size="small" :color="item.ach >= 100 ? 'success' : 'error'">{{ (item.ach || 0).toFixed(2)
                    }}%</v-chip>
                </td>
              </template>
              <template #body.append>
                <tr class="total-row-sticky">
                  <td></td>
                  <td></td>
                  <td class="text-start">GRAND TOTAL :</td>
                  <td class="text-start">{{ (totalSummary.nominal || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ (totalSummary.target || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ (totalSummary.ach || 0).toFixed(2) }}%</td>
                </tr>
              </template>
              <template #bottom></template>
            </v-data-table>
          </v-window-item>
        </v-window>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  padding: 16px;
}

.filter-section {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  gap: 8px;
}

.table-container {
  /* overflow-x: auto; */
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

:deep(.v-table__wrapper) {
  max-height: 500px; /* tinggi scroll area */
  overflow-y: auto !important; /* wajib agar sticky bisa berfungsi */
  position: relative; /* buat referensi posisi sticky */
}

/* Styling untuk tabel weekly */
.weekly-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px !important;
  background: white;
}

.weekly-table th,
.weekly-table td {
  padding: 6px 8px !important;
  border: 1px solid #e0e0e0;
  font-size: 11px !important;
  white-space: nowrap;
}

.weekly-table thead th {
  background-color: #f5f5f5;
  font-weight: 600;
  font-size: 11px !important;
  position: sticky;
  top: 0;
  z-index: 10;
}

.weekly-table tbody td {
  font-size: 11px !important;
}

/* Override v-chip untuk tabel weekly */
.weekly-table :deep(.v-chip) {
  font-size: 10px !important;
  height: 18px !important;
  padding: 0 4px !important;
  min-width: 50px;
}

.weekly-table :deep(.v-chip__content) {
  padding: 0 !important;
}

/* Alignment khusus */
.text-end {
  text-align: right !important;
}

.text-center {
  text-align: center !important;
}

.font-weight-bold {
  font-weight: 600 !important;
}

.grand-total-row {
  background-color: #f5f5f5 !important;
}

.total-row-sticky td {
  position: sticky;
  bottom: 0;
  z-index: 20; /* pastikan lebih tinggi dari header */
  background-color: #eeeeee !important;
  border-top: 2px solid #bdbdbd !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  padding: 10px 16px !important;
}

/* Penyesuaian kecil untuk font tabel weekly agar konsisten */
.weekly-table .total-row-sticky td {
  font-size: 11px !important;
  padding: 8px !important;
  background-color: #f5f5f5 !important;
  /* Samakan dengan tfoot weekly sebelumnya */
  border-top: 2px solid #9e9e9e !important;
}
</style>

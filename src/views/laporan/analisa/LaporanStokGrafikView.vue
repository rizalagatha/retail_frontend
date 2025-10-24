<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { Bar, Pie } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement, ChartDataLabels);

const route = useRoute();
const isLoading = ref(true);
const chartRawData = ref<any[]>([]);
const chartType = ref<'bar' | 'pie'>('bar');

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: chartType.value === 'pie' // Hanya tampilkan legenda untuk Pie
    },
    datalabels: { // Konfigurasi datalabels
      anchor: 'end',
      align: 'top',
      formatter: (value) => value.toLocaleString('id-ID'),
      font: { weight: 'bold' }
    }
  }
}));

const chartData = computed(() => {
  if (chartRawData.value.length === 0) return { labels: [], datasets: [] };

  // Ambil 10 teratas
  const topData = chartRawData.value.slice(0, 10);
  const labels = topData.map(d => `${d.NamaGrup} (${d.Cabang})`);
  const data = topData.map(d => d.TotalStok);
  const colors = ['#42A5F5', '#66BB6A', '#FFA726', '#EF5350', '#AB47BC', '#26A69A', '#FF7043', '#8D6E63', '#78909C', '#5C6BC0'];

  return {
    labels: labels,
    datasets: [{
      label: 'Total Stok',
      data: data,
      backgroundColor: colors,
    }]
  };
});

const ChartComponent = computed(() => chartType.value === 'pie' ? Pie : Bar);

onMounted(async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/laporan-stok-pivot/chart-data', { params: route.query });
    chartRawData.value = response.data;
  } catch (e) {
    alert('Gagal memuat data grafik.');
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout title="Grafik Laporan Stok" icon="mdi-chart-pie">
    <div class="chart-page-container">
      <div v-if="isLoading" class="d-flex justify-center align-center fill-height">
        <v-progress-circular indeterminate size="64" />
      </div>
      <div v-else class="d-flex flex-column fill-height">
        <v-card class="mb-4 pa-2 flex-shrink-0" variant="tonal">
          <v-btn-toggle v-model="chartType" mandatory density="compact" variant="outlined">
            <v-tooltip text="Bar Chart"><template v-slot:activator="{ props }"><v-btn v-bind="props"
                  icon="mdi-chart-bar" value="bar"></v-btn></template></v-tooltip>
            <v-tooltip text="Pie Chart"><template v-slot:activator="{ props }"><v-btn v-bind="props"
                  icon="mdi-chart-pie" value="pie"></v-btn></template></v-tooltip>
          </v-btn-toggle>
        </v-card>
        <div class="chart-wrapper">
          <component :is="ChartComponent" :data="chartData" :options="chartOptions" />
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.chart-page-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  padding: 16px;
}

.chart-wrapper {
  position: relative;
  flex-grow: 1;
}
</style>

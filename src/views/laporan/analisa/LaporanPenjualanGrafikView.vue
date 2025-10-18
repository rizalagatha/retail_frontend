<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';

// 1. Impor semua komponen dan elemen chart yang dibutuhkan
import { Bar, Line, Pie } from 'vue-chartjs';
import {
    Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale,
    LinearScale, PointElement, LineElement, ArcElement, Filler
} from 'chart.js';

// 2. Registrasikan semua elemen
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler);

const route = useRoute();
const isLoading = ref(true);
const chartRawData = ref<any[]>([]);

// 3. State untuk tipe chart yang aktif
const chartType = ref<'bar' | 'horizontalBar' | 'line' | 'area' | 'pie'>('bar');

// 4. Buat Chart Options menjadi dinamis
const chartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: chartType.value === 'horizontalBar' ? 'y' : 'x', // WAJIB untuk Bar Diagram
    plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'Perbandingan Penjualan per Bulan' }
    },
    elements: {
        line: { fill: chartType.value === 'area' }
    }
}));

// Computed property untuk data chart tidak berubah, sudah benar
const chartData = computed(() => {
    if (chartRawData.value.length === 0) return { labels: [], datasets: [] };

    // 1. Labels (Sumbu-X) sekarang adalah daftar toko/store unik.
    const labels = [...new Set(chartRawData.value.map(d => d.store))];

    // 2. Kelompokkan data per bulan.
    const months = [...new Set(chartRawData.value.map(d => format(parseISO(d.bulan), 'MMMM yyyy')))];
    const colors = ['#42A5F5', '#66BB6A', '#FFA726', '#EF5350', '#AB47BC'];

    // 3. Buat dataset terpisah untuk setiap bulan.
    const datasets = months.map((month, index) => {
        const dataForMonth = labels.map(label => {
            const found = chartRawData.value.find(d =>
                d.store === label && format(parseISO(d.bulan), 'MMMM yyyy') === month
            );
            return found ? found.nominal : 0;
        });
        return {
            label: month, // Label dataset adalah nama bulan
            data: dataForMonth,
            backgroundColor: colors[index % colors.length],
        };
    });

    return { labels, datasets };
});

// 5. Computed property untuk memilih komponen chart secara dinamis
const ChartComponent = computed(() => {
    if (chartType.value === 'line' || chartType.value === 'area') return Line;
    // Pie chart tidak cocok untuk data perbandingan multi-bulan, jadi kita fallback ke Bar.
    if (chartType.value === 'pie') return Pie;
    return Bar;
});

onMounted(async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/laporan-penjualan-pivot/chart-data', { params: route.query });
        chartRawData.value = response.data;
    } catch (e) {
        alert('Gagal memuat data grafik. Pastikan filter tanggal valid.');
    } finally {
        isLoading.value = false;
    }
});
</script>

<template>
    <PageLayout title="Grafik Laporan Penjualan" icon="mdi-chart-bar">
        <div class="pa-4 fill-height d-flex flex-column">
            <div v-if="isLoading" class="d-flex justify-center align-center fill-height">
                <v-progress-circular indeterminate size="64" />
            </div>
            <div v-else class="d-flex flex-column fill-height">
                <v-card class="mb-4 pa-2" variant="tonal">
                    <v-btn-toggle v-model="chartType" mandatory density="compact" variant="outlined">
                        <v-tooltip text="Column Diagram">
                            <template v-slot:activator="{ props }">
                                <v-btn v-bind="props" icon="mdi-chart-bar" value="bar"></v-btn>
                            </template>
                        </v-tooltip>
                        <v-tooltip text="Bar Diagram">
                            <template v-slot:activator="{ props }">
                                <v-btn v-bind="props" icon="mdi-chart-bar-stacked" value="horizontalBar"
                                    style="transform: rotate(90deg);"></v-btn>
                            </template>
                        </v-tooltip>
                        <v-tooltip text="Line Diagram">
                            <template v-slot:activator="{ props }">
                                <v-btn v-bind="props" icon="mdi-chart-line" value="line"></v-btn>
                            </template>
                        </v-tooltip>
                        <v-tooltip text="Area Diagram">
                            <template v-slot:activator="{ props }">
                                <v-btn v-bind="props" icon="mdi-chart-area" value="area"></v-btn>
                            </template>
                        </v-tooltip>
                        <v-tooltip text="Pie Diagram">
                            <template v-slot:activator="{ props }">
                                <v-btn v-bind="props" icon="mdi-chart-pie" value="pie"></v-btn>
                            </template>
                        </v-tooltip>
                    </v-btn-toggle>
                </v-card>

                <div style="position: relative; flex-grow: 1;">
                    <component :is="ChartComponent" :data="chartData" :options="chartOptions" />
                </div>
            </div>
        </div>
    </PageLayout>
</template>
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';

// 1. Impor Handsontable dan pluginnya
import { HotTable } from '@handsontable/vue3';
import { registerAllPlugins } from 'handsontable/plugins';
import 'handsontable/dist/handsontable.min.css';
import { registerCellType, CheckboxCellType, DateCellType, NumericCellType } from 'handsontable/cellTypes';

// 2. Registrasikan semua plugin Handsontable (termasuk Pivot)
registerAllPlugins();
registerCellType(CheckboxCellType);
registerCellType(DateCellType);

// --- Inisialisasi & State ---
const toast = useToast();
const router = useRouter();
const MENU_ID = '506';

const rawData = ref<any[]>([]);
const isLoading = ref(true);
const isPivotMode = ref(false); // State untuk beralih antara Grid dan Pivot

const filters = reactive({
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
});

const tableHeight = ref(400);

// --- Konfigurasi Handsontable ---
const hotSettings = computed(() => {
    const settings: any = {
        data: rawData.value,
        colHeaders: [
            'Nomor', 'Tahun', 'Bulan', 'Tanggal', 'Kd Cus', 'Customer', 'Level',
            'Kode', 'Nama Barang', 'Ukuran', 'Qty', 'Nominal', 'Store', 'Nama Store',
            'Ktg Produk', 'Ktg Barang', 'Jenis Kain', 'Warna'
        ],
        columns: [
            { data: 'Nomor' }, { data: 'Tahun', type: NumericCellType }, { data: 'Bulan', type: NumericCellType },
            {
                data: 'Tanggal',
                renderer: function (instance, td, row, col, prop, value, cellProperties) {
                    if (value) {
                        td.innerHTML = format(parseISO(value), 'dd/MM/yyyy');
                    }
                    return td;
                }
            },
            { data: 'KdCus' }, { data: 'Customer' }, { data: 'Level_' }, { data: 'Kode' },
            { data: 'Nama' }, { data: 'Ukuran' }, { data: 'Qty', type: NumericCellType },
            { data: 'Nominal', type: NumericCellType, numericFormat: { pattern: '0,0' } },
            { data: 'Store' }, { data: 'NamaStore' }, { data: 'KtgProduk' },
            { data: 'KtgBarang' }, { data: 'JenisKain' }, { data: 'Warna' },
        ],
        height: tableHeight.value, // 3. Gunakan tinggi dinamis
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
            rows: ['Store', 'Customer'],
            cols: ['Bulan'],
            values: [['Nominal', 'sum']],
        };
        delete settings.colHeaders;
        delete settings.columns;
    }

    return settings;
});

const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/laporan-penjualan-pivot', { params: filters });
        rawData.value = response.data;
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data.');
    } finally {
        isLoading.value = false;
    }
};

const exportData = () => {
    if (rawData.value.length === 0) return toast.warning('Tidak ada data untuk diekspor.');
    const worksheet = XLSX.utils.json_to_sheet(rawData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Penjualan");
    XLSX.writeFile(workbook, "Laporan_Penjualan.xlsx");
};

const updateTableHeight = () => {
    // Sesuaikan angka '180' jika tinggi header/filter Anda berubah
    const availableHeight = window.innerHeight - 180;
    tableHeight.value = availableHeight > 200 ? availableHeight : 200; // Minimal tinggi 200px
};

const applySort = (sortBy: 'Qty' | 'Nominal') => {
    toast.info(`Mengurutkan data berdasarkan ${sortBy}...`);
    // Lakukan sorting langsung pada array rawData
    rawData.value.sort((a, b) => {
        // Urutkan dari yang terbesar (descending)
        return (Number(b[sortBy]) || 0) - (Number(a[sortBy]) || 0);
    });
};

const goToChart = () => {
    const routeData = router.resolve({
        name: 'LaporanPenjualanChart', // Nama rute baru kita
        query: { ...filters }
    });
    window.open(routeData.href, '_blank');
};

onMounted(() => {
    fetchData();
    updateTableHeight(); // Hitung tinggi saat pertama kali dimuat
    window.addEventListener('resize', updateTableHeight); // Perbarui tinggi saat ukuran jendela berubah
});

onUnmounted(() => {
    window.removeEventListener('resize', updateTableHeight); // Hapus listener untuk mencegah memory leak
});
</script>

<template>
    <PageLayout title="Laporan Penjualan" :menu-id="MENU_ID">
        <template #header-actions>
            <v-btn size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel">Export</v-btn>
        </template>

        <div class="browse-content">
            <div class="filter-section">
                <v-label>Tanggal Invoice:</v-label>
                <v-text-field v-model="filters.startDate" @change="fetchData" type="date" density="compact" hide-details
                    variant="outlined" style="max-width: 180px;" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" @change="fetchData" type="date" density="compact" hide-details
                    variant="outlined" style="max-width: 180px;" />
                <v-spacer />
                <v-btn @click="goToChart" color="primary" variant="tonal">Lihat Grafik <v-icon
                        end>mdi-chart-bar</v-icon></v-btn>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading"
                    class="ms-4" />
            </div>

            <div class="table-wrapper d-flex flex-column">
                <div class="pa-2 d-flex align-center">
                    <template v-if="!isPivotMode">
                        <v-btn size="small" variant="tonal" class="me-2" @click="applySort('Qty')">Sort by Qty</v-btn>
                        <v-btn size="small" variant="tonal" @click="applySort('Nominal')">Sort by Nominal</v-btn>
                    </template>
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
/* Style global untuk Handsontable agar tidak terpengaruh scoped */
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
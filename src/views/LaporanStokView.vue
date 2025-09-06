<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '501';

// --- State ---
const stokList = ref([]);
const isLoading = ref(false);
const filters = ref({
    gudang: authStore.user?.cabang || '',
    kodeBarang: '',
    namaBarang: '', // Untuk tampilan di field
    jenisStok: 'semua', // 'semua', 'showroom', 'pesanan'
    tampilkanKosong: false,
    tanggal: format(new Date(), 'yyyy-MM-dd'),
});
const gudangList = ref([]);
const headers = ref([
    { title: 'Kode', key: 'KODE', fixed: true, width: '180px' },
    { title: 'Nama Barang', key: 'NAMA', fixed: true, width: '300px' },
    { title: 'S', key: 'S', align: 'end' },
    { title: 'M', key: 'M', align: 'end' },
    { title: 'L', key: 'L', align: 'end' },
    { title: 'XL', key: 'XL', align: 'end' },
    { title: '2XL', key: '2XL', align: 'end' },
    { title: '3XL', key: '3XL', align: 'end' },
    { title: '4XL', key: '4XL', align: 'end' },
    { title: '5XL', key: '5XL', align: 'end' },
    { title: 'Total', key: 'TOTAL', align: 'end', class: 'font-weight-bold' },
    { title: 'Buffer', key: 'Buffer', align: 'end' },
]);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

// --- Methods ---
const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/laporan-stok/real-time', { params: filters.value });
        stokList.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data stok.');
    } finally {
        isLoading.value = false;
    }
};

const exportToExcel = () => { /* ... Logika export ... */ };

onMounted(() => {
    if (hasViewPermission.value) {
        fetchData();
        // fetchGudangList(); // Anda perlu membuat fungsi ini untuk mengisi dropdown gudang
    }
});
</script>

<template>
    <PageLayout title="Laporan Stok Real Time" desktop-mode icon="mdi-chart-bar-stacked">
        <template #header-actions>
            <v-btn size="small" @click="exportToExcel" prepend-icon="mdi-file-excel">Export</v-btn>
        </template>

        <div v-if="!hasViewPermission" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div v-else class="browse-content">
            <div class="filter-section">
                <v-select v-model="filters.gudang" :items="gudangList" label="Gudang" density="compact" hide-details
                    variant="outlined" style="max-width: 180px;"></v-select>
                <v-text-field v-model="filters.tanggal" type="date" label="Per Tanggal" density="compact" hide-details
                    variant="outlined" style="max-width: 180px;"></v-text-field>
                <v-text-field v-model="filters.kodeBarang" label="Kode Barang (F1)" density="compact" hide-details
                    variant="outlined" style="max-width: 180px;"></v-text-field>
                <v-radio-group v-model="filters.jenisStok" inline hide-details density="compact">
                    <v-radio label="Semua" value="semua"></v-radio>
                    <v-radio label="Showroom" value="showroom"></v-radio>
                    <v-radio label="Pesanan" value="pesanan"></v-radio>
                </v-radio-group>
                <v-checkbox v-model="filters.tampilkanKosong" label="Tampilkan Stok Kosong" hide-details
                    density="compact"></v-checkbox>
                <v-spacer></v-spacer>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
            </div>

            <v-data-table :headers="headers" :items="stokList" :loading="isLoading" density="compact"
                class="desktop-table" fixed-header>
                <template v-for="col in headers.slice(2)" #[`item.${col.key}`]="{ item }">
                    <td :class="{ 'text-red': item.TOTAL < item.Buffer && item.Buffer > 0 }" class="text-end">
                        {{ item[col.key] }}
                    </td>
                </template>
            </v-data-table>
        </div>
    </PageLayout>
</template>

<style scoped>
.browse-content {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.filter-section {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-bottom: 1px solid #e0e0e0;
    flex-shrink: 0;
}

.desktop-table {
    font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 28px !important;
}

.state-container {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}

.text-red {
    color: red !important;
}
</style>
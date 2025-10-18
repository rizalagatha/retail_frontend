<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Interface ---
interface HitungStokItem {
    Cab: string;
    Kode: string;
    Barcode: string;
    Nama: string;
    Ukuran: string;
    Lokasi: string;
    Jumlah: number;
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '20';

const items = ref<HitungStokItem[]>([]);
const isLoading = ref(true);
const cabangOptions = ref<{ kode: string; nama: string }[]>([]);

const filters = reactive({
    // Tanggal tidak digunakan di query, tapi ditampilkan sesuai UI Delphi
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    cabang: authStore.user?.cabang || '',
});

const headers = [
    { title: 'Cabang', key: 'Cab', width: '100px' },
    { title: 'Kode', key: 'Kode', width: '150px' },
    { title: 'Barcode', key: 'Barcode', width: '150px' },
    { title: 'Nama Barang', key: 'Nama', minWidth: '300px' },
    { title: 'Ukuran', key: 'Ukuran', width: '100px' },
    { title: 'Lokasi', key: 'Lokasi', width: '150px' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '100px' },
] as const;

const totalJumlah = computed(() => {
    return items.value.reduce((sum, item) => sum + (Number(item.Jumlah) || 0), 0);
});

// --- Methods ---
const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/hitung-stok-lokasi', { params: filters });
        items.value = response.data;
    } catch (error) {
        const err = error as AxiosError<{ message?: string }>;
        toast.error(err.response?.data?.message || 'Gagal memuat data.');
    } finally {
        isLoading.value = false;
    }
};

const fetchCabangOptions = async () => {
    try {
        const response = await api.get('/hitung-stok-lokasi/cabang-options');
        cabangOptions.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat pilihan cabang.', error);
    }
};

const exportToExcel = () => {
    if (items.value.length === 0) {
        return toast.warning('Tidak ada data untuk diekspor.');
    }
    const worksheet = XLSX.utils.json_to_sheet(items.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Hitung Stok per Lokasi");
    XLSX.writeFile(workbook, `HitungStok_perLokasi_${filters.cabang}.xlsx`);
    toast.success('Data berhasil diekspor.');
};

onMounted(() => {
    fetchCabangOptions();
    fetchData();
});

watch(filters, fetchData, { deep: true });
</script>

<template>
    <PageLayout title="Browse Hitung Stok per Lokasi" :menu-id="MENU_ID">
        <template #header-actions>
            <v-btn size="small" color="teal" @click="exportToExcel" prepend-icon="mdi-file-excel">Export</v-btn>
        </template>

        <div class="browse-content">
            <div class="filter-section">
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
                    style="max-width: 180px;" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
                    style="max-width: 180px;" />
                <v-select v-model="filters.cabang" :items="cabangOptions" item-title="nama" item-value="kode"
                    label="Cabang" density="compact" hide-details variant="outlined" class="ms-4"
                    style="max-width: 200px;" :readonly="authStore.user?.cabang !== 'KDC'" />
                <v-spacer />
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
            </div>

            <div class="table-container">
                <v-data-table :headers="headers" :items="items" :loading="isLoading" class="desktop-table"
                    density="compact" fixed-header :items-per-page="-1">
                    <template #[`body.append`]>
                        <tr class="bg-grey-lighten-4 font-weight-bold">
                            <td :colspan="headers.length - 1" class="text-end">TOTAL :</td>
                            <td class="text-end">{{ totalJumlah.toLocaleString('id-ID') }}</td>
                        </tr>
                    </template>

                    <template #bottom></template>
                </v-data-table>
            </div>
        </div>
    </PageLayout>
</template>
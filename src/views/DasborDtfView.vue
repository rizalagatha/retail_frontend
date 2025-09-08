<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, subDays, addDays, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '40';

interface DasborItem {
    TglPengerjaan: string;
    Sisa: number;
    [key: string]: any;
}

interface DetailItem {
    SoDTF: string;
    [key: string]: any;
}

// --- State ---
const dasborList = ref<DasborItem[]>([]);
const details = ref<{ [key: string]: DetailItem[] }>({});
const isLoading = ref(true);
const startDate = ref(format(subDays(new Date(), 2), 'yyyy-MM-dd'));
const endDate = ref(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const expanded = ref<DasborItem[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

const headers = [
    { title: 'Tgl Pengerjaan', key: 'TglPengerjaan', width: '200px' },
    { title: 'Kuota', key: 'Kuota', align: 'end' },
    { title: 'Total Titik', key: 'TotalTitik', align: 'end' },
    { title: 'Sisa', key: 'Sisa', align: 'end' },
];

const detailHeaders = [
    { title: 'SoDTF', key: 'SoDTF', width: '200px' },
    { title: 'TglPengerjaan', key: 'TglPengerjaan', width: '120px' },
    { title: 'Nama', key: 'Nama', width: '300px' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end' },
    { title: 'Titik', key: 'Titik', align: 'end' },
    { title: 'TotalTitik', key: 'TotalTitik', align: 'end' },
];

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/dasbor-dtf/cabang-list');
        cabangList.value = response.data;

        // Jika user adalah KDC, pilih cabang pertama dari daftar sebagai default
        if (authStore.user?.cabang === 'KDC' && cabangList.value.length > 0) {
            selectedCabang.value = cabangList.value[0].kode;
        }
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.');
    }
};

const fetchData = async () => {
    if (!startDate.value || !endDate.value || !selectedCabang.value) return;
    isLoading.value = true;
    try {
        const response = await api.get('/dasbor-dtf', {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value,
            }
        });
        dasborList.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data dasbor.');
    } finally {
        isLoading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: string[]) => { // Tipe data diubah menjadi array of string
    // Cari tanggal (string) yang baru di-expand dan belum ada datanya
    const tglToLoad = newlyExpandedItems.find(tgl => !details.value[tgl] && !loadingDetails.value.has(tgl));

    // Jika tidak ada item baru untuk dimuat, hentikan fungsi
    if (!tglToLoad) return;

    loadingDetails.value.add(tglToLoad);
    try {
        const response = await api.get(`/dasbor-dtf/detail`, {
            // Gunakan tglToLoad (string) secara langsung sebagai parameter
            params: { tanggal: tglToLoad, cabang: selectedCabang.value }
        });
        details.value[tglToLoad] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk tanggal ${tglToLoad}`);
        // Hapus dari daftar expanded jika gagal
        expanded.value = expanded.value.filter(tgl => tgl !== tglToLoad);
    } finally {
        loadingDetails.value.delete(tglToLoad);
    }
};

const getRowClass = (item: DasborItem) => {
    return item.Sisa < 0 ? 'row-sisa-minus' : '';
};

const exportData = async (type: 'header' | 'detail') => {
    const endpoint = type === 'header' ? '/dasbor-dtf/export-header' : '/dasbor-dtf/export-detail';
    const fileName = type === 'header' ? 'DasborDTF_Header.xlsx' : 'DasborDTF_Detail.xlsx';
    toast.info(`Mempersiapkan file ${fileName}...`);
    try {
        const response = await api.get(endpoint, {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value,
            }
        });
        const worksheet = XLSX.utils.json_to_sheet(response.data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        XLSX.writeFile(workbook, fileName);
        toast.success('File berhasil diekspor.');
    } catch (error) {
        toast.error('Gagal mengekspor data.');
    }
};

onMounted(() => {
    if (hasViewPermission.value) {
        fetchCabangList();
        fetchData();
    }
});

watch([startDate, endDate, selectedCabang], fetchData);
</script>

<template>
    <PageLayout title="Dasbor DTF" desktop-mode icon="mdi-view-dashboard-variant">
        <template #header-actions>
            <v-menu offset-y>
                <template v-slot:activator="{ props }">
                    <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">Export</v-btn>
                </template>
                <v-list density="compact">
                    <v-list-item @click="exportData('header')"><v-list-item-title>Export
                            Header</v-list-item-title></v-list-item>
                    <v-list-item @click="exportData('detail')"><v-list-item-title>Export
                            Detail</v-list-item-title></v-list-item>
                </v-list>
            </v-menu>
        </template>

        <div v-if="!hasViewPermission" class="state-container"><!-- Akses Ditolak --></div>

        <div v-else class="browse-content">
            <div class="filter-section">
                <span class="filter-label">Tgl Pengerjaan:</span>
                <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined"
                    style="min-width: 140px;" />
                <span class="mx-2">s/d</span>
                <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined"
                    style="min-width: 140px;" />
                <span class="filter-label ms-4">Cabang:</span>
                <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode"
                    density="compact" hide-details variant="outlined" style="max-width: 180px;" />
                <v-spacer />
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" title="Muat Ulang Data" />
            </div>

            <v-data-table :headers="headers" :items="dasborList" :loading="isLoading" v-model:expanded="expanded"
                @update:expanded="loadDetails" :item-class="getRowClass" item-value="TglPengerjaan" density="compact"
                class="desktop-table fill-height-table" fixed-header show-expand>
                <template #item.TglPengerjaan="{ item }">
                    {{ format(parseISO(item.TglPengerjaan), 'dd-MM-yyyy') }}
                </template>

                <template #expanded-row="{ columns, item }">
                    <tr>
                        <td :colspan="columns.length" class="pa-2 bg-grey-lighten-5">
                            <div v-if="loadingDetails.has(item.TglPengerjaan)" class="text-center py-2">Memuat detail...
                            </div>
                            <v-data-table v-else-if="details[item.TglPengerjaan]" :headers="detailHeaders"
                                :items="details[item.TglPengerjaan]" item-value="SoDTF" density="compact"
                                class="detail-table" :items-per-page="-1">
                                <template #bottom></template>
                            </v-data-table>
                            <div v-else class="text-center text-caption py-2">Tidak ada data detail untuk tanggal ini.
                            </div>
                        </td>
                    </tr>
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
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid #e0e0e0;
    flex-shrink: 0;
}

.filter-label {
    font-size: 11px;
    font-weight: 500;
}

.fill-height-table {
    flex: 1 1 auto;
    min-height: 0;
}

.desktop-table {
    font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 28px !important;
}

.filter-section :deep(input),
.filter-section :deep(.v-label),
.filter-section :deep(.v-select__selection-text) {
    font-size: 11px !important;
}

.filter-section :deep(.v-field) {
    height: 36px;
}

.filter-section :deep(.v-field__input) {
    min-height: 36px;
    padding-top: 0;
    padding-bottom: 0;
}

.row-sisa-minus :deep(td) {
    color: red !important;
    font-weight: bold;
}

.detail-table {
    font-size: 10px;
}
</style>

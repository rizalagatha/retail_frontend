<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '54';

const masterData = ref<any[]>([]);
const details = ref<Record<string, any[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<any[]>([]);
const expanded = ref<any[]>([]);
const cabangList = ref([]);

const filters = reactive({
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    cabang: authStore.user?.cabang || '',
});

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);
const canBeModified = computed(() => {
    // Aksi bisa dilakukan jika:
    // 1. Hanya satu baris yang dipilih
    if (!isSingleSelected.value) return false;

    const item = selected.value[0];

    // 2. Belum diverifikasi (kolom 'Verified' kosong)
    return !item.Verified;
});

const headers = [
    { title: 'Nomor', key: 'Nomor', width: '200px' },
    { title: 'Tgl Setor', key: 'TglSetor', width: '150px' },
    { title: 'Tgl Verifikasi', key: 'TglVerifikasi', width: '150px' },
    { title: 'Dibuat Oleh', key: 'Created' },
    { title: 'Diverifikasi Oleh', key: 'Verified' },
    { title: 'Closing', key: 'Closing', align: 'center' },
];
const detailHeaders = [
    { title: 'Jenis', key: 'Jenis' },
    { title: 'Nominal Setor', key: 'NominalSetor', align: 'end' },
    { title: 'Nominal Verifikasi', key: 'NominalVerifikasi', align: 'end' },
];

const formatRupiah = (value: number) => {
    return new Intl.NumberFormat('id-ID').format(value || 0);
};

const fetchCabangList = async () => {
    try {
        const response = await api.get('/fsk/lookup/cabang');
        cabangList.value = response.data;
    } catch (error) { toast.error('Gagal memuat daftar cabang.'); }
};

const fetchMasterData = async () => {
    loading.value = true;
    try {
        const response = await api.get('/fsk', { params: filters });
        masterData.value = response.data;
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal mengambil data.');
    } finally {
        loading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: any[]) => {
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
    if (!itemToLoad) return;

    loadingDetails.value.add(itemToLoad.Nomor);
    try {
        const response = await api.get(`/fsk/details/${itemToLoad.Nomor}`);
        details.value[itemToLoad.Nomor] = response.data;
    } catch (error) { toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}`); }
    finally { loadingDetails.value.delete(itemToLoad.Nomor); }
};

const handleDelete = () => {
    if (!selectedRow.value) return;
    if (confirm(`Yakin ingin menghapus FSK nomor ${selectedRow.value.Nomor}?`)) {
        api.delete(`/fsk/${selectedRow.value.Nomor}`)
            .then(response => {
                toast.success(response.data.message);
                fetchMasterData();
            })
            .catch(error => {
                toast.error(error.response?.data?.message || 'Gagal menghapus data.');
            });
    }
};

// Pola pewarnaan baris sesuai permintaan
const getRowTextColor = (item: any) => {
    // Merah untuk yang belum diverifikasi
    if (!item.Verified) {
        return 'text-red font-weight-bold';
    }
    return ''; // Warna default
};

const printData = () => {
    if (!isSingleSelected.value) return;
    const nomor = selected.value[0].Nomor;
    const url = router.resolve({ name: 'FskPrint', params: { nomor } }).href;
    window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
    if (type === 'header') {
        if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
        const worksheet = XLSX.utils.json_to_sheet(masterData.value);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "FSK Header");
        XLSX.writeFile(workbook, "Export_FSK_Header.xlsx");
    } else if (type === 'detail') {
        try {
            const response = await api.get('/fsk/export-details', { params: filters });
            if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
            const worksheet = XLSX.utils.json_to_sheet(response.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "FSK Detail");
            XLSX.writeFile(workbook, "Export_FSK_Detail.xlsx");
        } catch (error) {
            toast.error('Gagal mengekspor data detail.');
        }
    }
};

onMounted(() => {
    fetchCabangList();
    fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
    <PageLayout title="Browse Form Setoran Kasir" icon="mdi-cash-register">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary"
                @click="router.push({ name: 'FskCreate' })">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!canBeModified"
                @click="router.push({ name: 'FskEdit', params: { nomor: selectedRow?.Nomor } })">
                Ubah
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!canBeModified"
                @click="handleDelete">
                Hapus
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
                @click="printData" prepend-icon="mdi-printer">
                Cetak
            </v-btn>
            <v-menu offset-y>
                <template v-slot:activator="{ props }">
                    <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
                        Export
                    </v-btn>
                </template>
                <v-list density="compact">
                    <v-list-item @click="exportData('header')">
                        <v-list-item-title>Export Header</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="exportData('detail')">
                        <v-list-item-title>Export Detail</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>
        </template>

        <div class="browse-content">
            <div class="filter-section">
                <v-label class="filter-label">Periode:</v-label>
                <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details
                    variant="outlined" />
                <v-label class="mx-2">s/d</v-label>
                <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
                <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama"
                    item-value="kode" density="compact" hide-details variant="outlined" class="ms-4"
                    style="max-width: 200px;" />
                <v-spacer />
                <div class="d-flex align-center ga-2 text-caption">
                    <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diverifikasi
                </div>
                <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
                    :loading="loading" item-value="Nomor" density="compact" class="desktop-table" fixed-header
                    show-select return-object show-expand @update:expanded="loadDetails">
                    <template v-for="header in headers" #[`item.${header.key}`]="{ item }">
                        <td :class="getRowTextColor(item)">
                            <template v-if="['TglSetor', 'TglVerifikasi'].includes(header.key)">
                                {{ item[header.key] ? format(parseISO(item[header.key]), 'dd/MM/yyyy') : '' }}
                            </template>
                            <template v-else-if="header.key === 'Closing'">
                                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success">YA</v-chip>
                            </template>
                            <template v-else>
                                {{ item[header.key] }}
                            </template>
                        </td>
                    </template>

                    <template #expanded-row="{ columns, item }">
                        <tr>
                            <td :colspan="columns.length">
                                <div class="detail-container">
                                    <div class="detail-table-wrapper">
                                        <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">Memuat
                                            detail...</div>
                                        <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]"
                                            density="compact" class="detail-table" :items-per-page="-1">
                                            <template #item.NominalSetor="{ value }">{{ formatRupiah(value)
                                            }}</template>
                                            <template #item.NominalVerifikasi="{ value }">{{ formatRupiah(value)
                                            }}</template>
                                            <template #bottom></template>
                                        </v-data-table>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </template>
                </v-data-table>
            </div>
        </div>
    </PageLayout>
</template>
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '48'; // Sesuai koreksi Anda

// --- Interfaces ---
interface LhkStokHeader {
    Nomor: string;
    Tanggal: string;
    NoSOdtf: string;
    Jumlah: number;
    Usr: string;
    Created: string;
    [key: string]: any;
}

interface LhkStokDetail {
    Kode: string;
    Nama: string;
    Ukuran: string;
    Jumlah: number;
}

// --- State ---
const list = ref<LhkStokHeader[]>([]);
const details = ref<{ [key: string]: LhkStokDetail[] }>({});
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const selected = ref<LhkStokHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

// State untuk Dialog
const isConfirmDeleteVisible = ref(false);
const itemToDelete = ref<LhkStokHeader | null>(null);

// State untuk Filter Kustom
const filterOptions = ref([
    { title: 'Nomor', value: 'Nomor' },
    { title: 'No. SO DTF', value: 'NoSOdtf' },
    { title: 'User', value: 'Usr' },
]);
const selectedFilterField = ref('Nomor');
const filterSearchValue = ref('');


// --- Computed Properties ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);

const filteredList = computed(() => {
    if (!filterSearchValue.value) {
        return list.value;
    }
    return list.value.filter(item => {
        const itemValue = item[selectedFilterField.value];
        if (itemValue !== null && itemValue !== undefined) {
            return itemValue.toString().toLowerCase().includes(filterSearchValue.value.toLowerCase());
        }
        return false;
    });
});

const headers = [
    { title: 'Nomor', key: 'Nomor', width: '200px' },
    { title: 'Tanggal', key: 'Tanggal', width: '120px' },
    { title: 'No. SO DTF', key: 'NoSOdtf', width: '200px' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end' },
    { title: 'User', key: 'Usr', width: '150px' },
    { title: 'Created', key: 'Created', width: '180px' },
];

const detailHeaders = [
    { title: 'Kode', key: 'Kode' },
    { title: 'Nama', key: 'Nama' },
    { title: 'Ukuran', key: 'Ukuran' },
    { title: 'Jumlah', key: 'Jumlah', align: 'end' },
];

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/lhk-so-dtf-stok/lookup/cabang');
        cabangList.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.');
    }
};

const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/lhk-so-dtf-stok', {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value,
            }
        });
        list.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data LHK Stok.');
    } finally {
        isLoading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: LhkStokHeader[]) => {
    const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
    if (!itemToLoad) return;
    const nomorToLoad = itemToLoad.Nomor;

    loadingDetails.value.add(nomorToLoad);
    try {
        const response = await api.get(`/lhk-so-dtf-stok/${nomorToLoad}`);
        details.value[nomorToLoad] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
        expanded.value = expanded.value.filter(nomor => nomor !== nomorToLoad);
    } finally {
        loadingDetails.value.delete(nomorToLoad);
    }
};

const showDeleteConfirmation = () => {
    if (!isSingleSelected.value) return;
    itemToDelete.value = selected.value[0];
    isConfirmDeleteVisible.value = true;
};

const executeDelete = async () => {
    if (!itemToDelete.value) return;
    try {
        await api.delete(`/lhk-so-dtf-stok/${itemToDelete.value.Nomor}`);
        toast.success(`LHK Stok ${itemToDelete.value.Nomor} berhasil dihapus.`);
        fetchData();
        selected.value = [];
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
    } finally {
        isConfirmDeleteVisible.value = false;
        itemToDelete.value = null;
    }
};

onMounted(() => {
    if (hasViewPermission.value) {
        fetchCabangList();
        fetchData();
    }
});

watch([startDate, endDate, selectedCabang], fetchData, { immediate: false });
</script>

<template>
    <PageLayout title="LHK SO DTF Stok" desktop-mode icon="mdi-package-variant-closed-check">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
                @click="router.push('/transaksi/penjualan/dtf/lhk-so-dtf-stok/new')">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-pencil"
                @click="router.push(`/transaksi/penjualan/dtf/lhk-so-dtf-stok/ubah/${selected[0].Nomor}`)">Ubah</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
                prepend-icon="mdi-delete" @click="showDeleteConfirmation">Hapus</v-btn>
        </template>

        <div v-if="!hasViewPermission" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div v-else class="browse-content">
            <div class="filter-section">
                <span class="filter-label">Periode:</span>
                <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined" />
                <span class="mx-2">s/d</span>
                <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined" />
                <span class="filter-label ms-4">Cabang:</span>
                <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode"
                    density="compact" hide-details variant="outlined" />

                <v-divider vertical class="mx-2"></v-divider>
                <div class="d-flex align-center ga-2">
                    <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan"
                        density="compact" hide-details variant="outlined" style="max-width: 180px;" />
                    <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details
                        variant="outlined" style="min-width: 250px;" clearable prepend-inner-icon="mdi-magnify" />
                </div>

                <v-spacer />
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" :headers="headers" :items="filteredList" :loading="isLoading"
                    v-model:expanded="expanded" @update:expanded="loadDetails" item-value="Nomor" density="compact"
                    class="desktop-table" fixed-header show-select return-object show-expand>
                    <template #item.Tanggal="{ item }">{{ format(parseISO(item.Tanggal), 'dd/MM/yyyy') }}</template>
                    <template #item.Created="{ item }">{{ item.Created ? format(parseISO(item.Created), 'dd/MM/yyyy HH:mm:ss') : '-' }}</template>
                    <template #expanded-row="{ columns, item }">
                        <tr>
                            <td :colspan="columns.length" class="pa-2 bg-grey-lighten-5">
                                <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">Memuat detail...
                                </div>
                                <v-data-table v-else-if="details[item.Nomor]" :headers="detailHeaders"
                                    :items="details[item.Nomor]" item-value="Kode" density="compact"
                                    class="detail-table" :items-per-page="-1">
                                    <template #bottom></template>
                                </v-data-table>
                            </td>
                        </tr>
                    </template>
                </v-data-table>
            </div>
        </div>

        <v-dialog v-model="isConfirmDeleteVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
                <v-card-text>Anda yakin ingin menghapus data LHK Stok Nomor: <strong>{{ itemToDelete?.Nomor
                        }}</strong>?</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="grey-darken-1" variant="text" @click="isConfirmDeleteVisible = false">Batal</v-btn>
                    <v-btn color="error" variant="tonal" @click="executeDelete">Ya, Hapus</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

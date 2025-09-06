<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '35';

// --- Interfaces ---
interface SoDtfHeader {
    Nomor: string;
    Tanggal: string;
    TglPengerjaan: string;
    NoSO: string;
    NoINV: string;
    AlasanClose: string;
    LHK: number;
    TotalTitik: number;
    [key: string]: any;
}
interface SoDtfDetail {
    Ukuran: string;
    Jumlah: number;
}

// --- State ---
const soDtfList = ref<SoDtfHeader[]>([]);
const details = ref<{ [key: string]: SoDtfDetail[] }>({});
const isLoading = ref(true);
const filterDateType = ref('dtf'); // 'dtf' atau 'pengerjaan'
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref([]);
const selectedCabang = ref(authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '');
const selected = ref<SoDtfHeader[]>([]);
const expanded = ref<SoDtfHeader[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

const isCloseDialogVisible = ref(false);
const itemToClose = ref<SoDtfHeader | null>(null);
const closeReason = ref('');

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

const headers = [
    { title: 'Nomor', key: 'Nomor', width: '150px', fixed: true },
    { title: 'Tanggal', key: 'Tanggal', width: '100px' },
    { title: 'Tgl Pengerjaan', key: 'TglPengerjaan', width: '120px' },
    { title: 'Dateline Cust', key: 'DatelineCus', width: '120px' },
    { title: 'Nama DTF', key: 'NamaDTF', width: '200px' },
    { title: 'Kd. Customer', key: 'KdCus', width: '120px' },
    { title: 'Nama Customer', key: 'Customer', width: '250px' },
    { title: 'Jml', key: 'Jumlah', align: 'end', width: '70px' },
    { title: 'Titik', key: 'Titik', align: 'end', width: '70px' },
    { title: 'Total Titik', key: 'TotalTitik', align: 'end', width: '90px' },
    { title: 'LHK', key: 'LHK', align: 'center', width: '70px' },
    { title: 'No. SO', key: 'NoSO', width: '150px' },
    { title: 'No. Invoice', key: 'NoINV', width: '150px' },
    { title: 'Sales', key: 'Sales', width: '150px' },
    { title: 'Bag. Desain', key: 'BagDesain', width: '150px' },
    { title: 'Kain', key: 'Kain', width: '150px' },
    { title: 'Finishing', key: 'Finishing', width: '150px' },
    { title: 'Workshop', key: 'Workshop', width: '150px' },
    { title: 'Keterangan', key: 'Keterangan', width: '250px' },
    { title: 'Alasan Close', key: 'AlasanClose', width: '250px' },
    { title: 'User', key: 'Created', width: '120px' },
    { title: 'Status Close', key: 'Close', align: 'center', width: '120px' },
];

// --- Methods ---
const fetchCabangList = async () => {
    try {
        // Panggil endpoint baru yang khusus untuk SO DTF
        const response = await api.get('/warehouses/so-dtf-branches', {
            params: { userCabang: authStore.user?.cabang }
        });

        if (authStore.user?.cabang === 'KDC') {
            cabangList.value = [{ kode: 'ALL', nama: 'SEMUA CABANG' }, ...response.data];
        } else {
            cabangList.value = response.data;
        }
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.');
    }
};
const fetchData = async () => {
    if (!startDate.value || !endDate.value) return;
    isLoading.value = true;
    try {
        const response = await api.get('/so-dtf', {
            params: {
                startDate: startDate.value, endDate: endDate.value,
                cabang: selectedCabang.value, filterDateType: filterDateType.value,
            }
        });
        soDtfList.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data SO DTF.');
    } finally {
        isLoading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: SoDtfHeader[]) => {
    // Fungsi ini dipanggil oleh event @update:expanded
    // newlyExpandedItems adalah array berisi semua baris yang sedang terbuka

    // Cari baris yang baru saja dibuka dan belum memiliki data detail
    const itemToLoad = newlyExpandedItems.find(
        (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
    );

    // Jika tidak ada item baru untuk dimuat, hentikan fungsi
    if (!itemToLoad) return;

    const nomor = itemToLoad.Nomor;
    loadingDetails.value.add(nomor);
    try {
        const response = await api.get(`/so-dtf/${nomor}`);
        // Simpan data detail yang berhasil diambil
        details.value[nomor] = response.data;
    } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomor}`);
        // Jika gagal, tutup kembali baris yang diekspansi
        expanded.value = expanded.value.filter(item => item.Nomor !== nomor);
    } finally {
        loadingDetails.value.delete(nomor);
    }
};

const getRowClass = (item: SoDtfHeader) => {
    if (item.AlasanClose) return 'row-closed';
    if (item.NoINV) return '';
    if (item.NoSO) return 'row-no-invoice';
    return 'row-no-so';
};

const getLhkClass = (item: SoDtfHeader) => {
    if (item.LHK === 0) return 'lhk-zero';
    if (item.LHK > 0 && item.LHK < item.TotalTitik) return 'lhk-progress';
    return 'lhk-normal';
};

const openCloseDialog = () => {
    if (selected.value.length !== 1) return;
    const item = selected.value[0];
    if (item.NoINV) {
        toast.warning('Sudah dibuat Invoice, tidak bisa di-close.');
        return;
    }
    itemToClose.value = item;
    closeReason.value = item.AlasanClose || '';
    isCloseDialogVisible.value = true;
};

const submitCloseSo = async () => {
    if (!itemToClose.value) return;
    try {
        await api.post('/so-dtf/close', {
            nomor: itemToClose.value.Nomor,
            alasan: closeReason.value,
            user: authStore.user?.kode,
        });
        toast.success('SO DTF berhasil ditutup.');
        isCloseDialogVisible.value = false;
        fetchData();
    } catch (error) {
        toast.error('Gagal menutup SO DTF.');
    }
};

onMounted(() => {
    if (hasViewPermission.value) {
        fetchData();
        fetchCabangList();
    }
});

watch([filterDateType, startDate, endDate, selectedCabang], fetchData);
</script>

<template>
    <PageLayout title="SO DTF Pesanan" desktop-mode icon="mdi-printer-3d">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary"
                prepend-icon="mdi-plus">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-pencil">Ubah</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" :disabled="!isSingleSelected"
                prepend-icon="mdi-delete">Hapus</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected"
                @click="openCloseDialog" color="blue">Close SO DTF</v-btn>
        </template>

        <div v-if="!hasViewPermission" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div v-else class="browse-content">
            <div class="filter-section">
                <v-radio-group v-model="filterDateType" inline hide-details density="compact" class="me-4">
                    <template #label><span class="filter-label">Filter:</span></template>
                    <v-radio label="Tgl SO DTF" value="dtf"></v-radio>
                    <v-radio label="Tgl Pengerjaan" value="pengerjaan"></v-radio>
                </v-radio-group>
                <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined"
                    style="min-width: 140px;"></v-text-field>
                <span class="mx-2">s/d</span>
                <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined"
                    style="min-width: 140px;"></v-text-field>
                <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode"
                    density="compact" hide-details variant="outlined" style="max-width: 180px;"
                    :menu-props="{ class: 'compact-select-list' }"></v-select>
                <v-spacer></v-spacer>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
            </div>

            <v-data-table v-model="selected" :headers="headers" :items="soDtfList" :loading="isLoading"
                :item-class="getRowClass" item-value="Nomor" density="compact" class="desktop-table" fixed-header
                show-select return-object show-expand @update:expanded="loadDetails">
                <template #item.Tanggal="{ item }">{{ format(new Date(item.Tanggal), 'dd/MM/yyyy') }}</template>
                <template #item.TglPengerjaan="{ item }">{{ item.TglPengerjaan ? format(new Date(item.TglPengerjaan),
                    'dd/MM/yyyy') : '-' }}</template>
                <template #item.DatelineCus="{ item }">{{ item.DatelineCus ? format(new Date(item.DatelineCus),
                    'dd/MM/yyyy') : '-' }}</template>
                <template #item.LHK="{ item }">
                    <v-chip :class="getLhkClass(item)" size="x-small" label>{{ item.LHK }}</v-chip>
                </template>
                <template #item.Close="{ item }">
                    <v-chip :color="item.Close === 'Y' ? 'success' : 'grey'" size="x-small">{{ item.Close === 'Y' ?
                        'Closed' : 'Open' }}</v-chip>
                </template>
                <template #expanded-row="{ columns, item }">
                    <tr>
                        <td :colspan="columns.length" class="pa-2 bg-grey-lighten-5">
                            <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">...</div>
                            <v-table v-else-if="details[item.Nomor]" density="compact" class="detail-table">
                                <thead>
                                    <tr>
                                        <th>Ukuran</th>
                                        <th class="text-end">Jumlah</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="d in details[item.Nomor]" :key="d.Ukuran">
                                        <td>{{ d.Ukuran }}</td>
                                        <td class="text-end">{{ d.Jumlah }}</td>
                                    </tr>
                                </tbody>
                            </v-table>
                        </td>
                    </tr>
                </template>
            </v-data-table>
        </div>

        <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
            <v-card class="dialog-card">
                <v-card-title class="dialog-header"><span class="text-subtitle-1">Isi Alasan Close
                        SO</span></v-card-title>
                <v-card-text class="pa-4">
                    <p class="text-caption mb-2">Anda akan menutup SO Nomor: <strong>{{ itemToClose?.Nomor }}</strong>
                    </p>
                    <v-textarea v-model="closeReason" label="Alasan" rows="3" variant="outlined" autofocus></v-textarea>
                </v-card-text>
                <v-card-actions class="dialog-footer">
                    <v-spacer></v-spacer>
                    <v-btn size="small" @click="isCloseDialogVisible = false">Batal</v-btn>
                    <v-btn size="small" color="primary" @click="submitCloseSo">Simpan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
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

.desktop-table {
    font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 28px !important;
}

.row-no-so :deep(td) {
    color: red !important;
}

.row-no-invoice :deep(td) {
    color: blue !important;
}

.row-closed :deep(td:first-child) {
    background-color: #FFFF99;
    font-weight: bold;
}

.lhk-zero {
    background-color: #FF5252 !important;
    color: white !important;
}

.lhk-progress {
    background-color: #1A237E !important;
    color: white !important;
}

.lhk-normal {
    background-color: #E0E0E0 !important;
}

.detail-table {
    font-size: 10px;
}

.filter-section :deep(input),
.filter-section :deep(.v-label),
.filter-section :deep(.v-select__selection-text) {
    font-size: 11px !important;
}

/* Mengatur tinggi dari field agar lebih ringkas */
.filter-section :deep(.v-field) {
    height: 36px;
}

.filter-section :deep(.v-field__input) {
    min-height: 36px;
    padding-top: 0;
    padding-bottom: 0;
}

:deep(.compact-select-list .v-list-item-title) {
    font-size: 11px !important;
}
</style>

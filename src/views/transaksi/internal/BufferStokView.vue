<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import * as XLSX from 'xlsx';

interface BufferStockItem {
    Status: string
    KtgProduk: string
    Kode: string
    Barcode: string
    Nama: string
    Ukuran: string
    Stok: number
    MinBuffer: number
    MaxBuffer: number
    Harus_Minta: number
    Sudah_Minta: number
}

const toast = useToast();
const authStore = useAuthStore();

// --- State ---
const list = ref<BufferStockItem[]>([])
const isLoading = ref(true);
const cabangList = ref([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const selected = ref<BufferStockItem[]>([])
const tampilkanBufferNol = ref(false);
const kaosan = ref(true);
const reszo = ref(false);

const isSettingVisible = ref(false);
const isSettingSaving = ref(false);
const itemToSetting = ref<BufferStockItem | null>(null)
const minBuffer = ref(0);
const maxBuffer = ref(0);

const hasAccess = computed(() => authStore.isAuthenticated);

const headers = [
    { title: 'Status', key: 'status', width: '120px' },
    { title: 'Kategori', key: 'KtgProduk', width: '120px' },
    { title: 'Kode', key: 'Kode', width: '120px' },
    { title: 'Barcode', key: 'Barcode', width: '120px' },
    { title: 'Nama', key: 'Nama', width: '300px' },
    { title: 'Ukuran', key: 'Ukuran' },
    { title: 'Stok', key: 'Stok', align: 'end' as const },
    { title: 'Min Buffer', key: 'MinBuffer', align: 'end' as const },
    { title: 'Max Buffer', key: 'MaxBuffer', align: 'end' as const },
    { title: 'Harus Minta', key: 'Harus_Minta', align: 'end' as const },
    { title: 'Sudah Minta', key: 'Sudah_Minta', align: 'end' as const },
];

// --- Methods ---
const fetchCabangList = async () => {
    try {
        const response = await api.get('/buffer-stock/lookup/cabang');
        cabangList.value = response.data;
        if (authStore.user?.cabang !== 'KDC' && cabangList.value.length > 0) {
            selectedCabang.value = authStore.user?.cabang || '';
        } else if (authStore.user?.cabang === 'KDC' && cabangList.value.length > 0) {
            selectedCabang.value = 'KDC';
        }
    } catch {
        toast.error('Gagal memuat daftar cabang.');
    }
};

const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/buffer-stock', {
            params: {
                cabang: selectedCabang.value,
                tampilkanBufferNol: tampilkanBufferNol.value,
                kaosan: kaosan.value,
                reszo: reszo.value,
            }
        });
        list.value = response.data;
    } catch {
        toast.error('Gagal memuat data buffer stok.');
    } finally {
        isLoading.value = false;
    }
};

const openSetting = (item: BufferStockItem) => {
    itemToSetting.value = item
    minBuffer.value = item.MinBuffer || 0
    maxBuffer.value = item.MaxBuffer || 0
    isSettingVisible.value = true
}

const saveSetting = async () => {
    if (!itemToSetting.value) return;
    if (minBuffer.value > maxBuffer.value && maxBuffer.value !== 0) {
        toast.error('Minimal Stok tidak boleh lebih besar dari Maximal Stok.');
        return;
    }

    isSettingSaving.value = true;
    try {
        const payload = {
            kode: itemToSetting.value.Kode,
            ukuran: itemToSetting.value.Ukuran,
            min: minBuffer.value,
            max: maxBuffer.value,
        };
        await api.post('/buffer-stock/setting', payload);

        const itemInList = list.value.find(i => i.Barcode === itemToSetting.value.Barcode);
        if (itemInList) {
            itemInList.MinBuffer = minBuffer.value;
            itemInList.MaxBuffer = maxBuffer.value;
            itemInList.Harus_Minta = (itemInList.Stok < minBuffer.value && minBuffer.value > 0)
                ? maxBuffer.value - itemInList.Stok
                : 0;
        }

        toast.success('Pengaturan buffer berhasil disimpan.');
        isSettingVisible.value = false;
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'response' in error) {
            const err = error as { response?: { data?: { message?: string } } }
            toast.error(err.response?.data?.message || 'Gagal menyimpan pengaturan.');
        } else {
            toast.error('Gagal menyimpan pengaturan.');
        }
    } finally {
        isSettingSaving.value = false;
    }

};

const getRowClass = (item: BufferStockItem) => {
    if ((item.Stok || 0) < (item.MinBuffer || 0) && (item.MinBuffer || 0) > 0) {
        return 'harus-minta'
    }
    if ((item.Sudah_Minta || 0) > 0) {
        return 'sudah-minta'
    }
    return ''
}

const exportData = () => {
    if (list.value.length === 0) {
        return toast.warning('Tidak ada data untuk diekspor.');
    }

    try {
        toast.info('Membuat file Excel...');
        const worksheet = XLSX.utils.json_to_sheet(list.value);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Buffer Stok");
        XLSX.writeFile(workbook, "Export_Buffer_Stok.xlsx");
        toast.success('File berhasil dibuat.');
    } catch {
        toast.error('Gagal mengekspor data.');
    }
};

onMounted(() => {
    if (hasAccess.value) {
        fetchCabangList();
        fetchData();
    } else {
        isLoading.value = false;
        toast.error("Anda tidak memiliki akses ke halaman ini.");
    }
});

watch([selectedCabang, tampilkanBufferNol, kaosan, reszo], fetchData);
</script>

<template>
    <PageLayout title="Buffer Stok" desktop-mode icon="mdi-buffer">
        <template #header-actions>
            <v-btn size="small" :disabled="selected.length !== 1" @click="openSetting(selected[0])">Setting (F1)</v-btn>
            <v-btn size="small" color="teal" @click="exportData">Export</v-btn>
        </template>

        <div v-if="!hasAccess" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div v-else class="browse-content">
            <div class="filter-section">
                <span class="filter-label">Cabang:</span>
                <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode"
                    density="compact" hide-details variant="outlined" style="max-width: 180px;" />
                <v-checkbox v-model="tampilkanBufferNol" label="Tampilkan Buffer=0" density="compact" hide-details />
                <v-checkbox v-model="kaosan" label="KAOSAN" density="compact" hide-details />
                <v-checkbox v-model="reszo" label="RESZO" density="compact" hide-details />
                <v-spacer />
                <div class="legend-group">
                    <div class="legend-item"><v-icon color="red" size="small">mdi-circle-medium</v-icon> Harus Minta
                    </div>
                    <div class="legend-item"><v-icon color="blue" size="small">mdi-circle-medium</v-icon> Sudah Minta
                    </div>
                </div>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
            </div>

            <v-data-table v-model="selected" :headers="headers" :items="list" :loading="isLoading"
                :item-class="getRowClass" item-value="Barcode" density="compact" class="desktop-table" fixed-header
                show-select return-object>
                <template v-for="col in ['Stok', 'MinBuffer', 'MaxBuffer', 'Harus_Minta', 'Sudah_Minta']"
                    #[`item.${col}`]="{ item }">
                    {{ new Intl.NumberFormat('id-ID').format(item[col] || 0) }}
                </template>
                <template #[`item.Status`]="{ item }">
                    <v-chip v-if="item.Status !== 'Cukup'" size="x-small"
                        :color="item.Status === 'Harus Minta' ? 'error' : 'primary'" variant="tonal" label>
                        {{ item.Status }}
                    </v-chip>
                </template>
            </v-data-table>
        </div>

        <v-dialog v-model="isSettingVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title>Setting Buffer Stok</v-card-title>
                <v-card-text>
                    <p class="text-subtitle-2">{{ itemToSetting?.Nama }} ({{ itemToSetting?.Ukuran }})</p>
                    <v-text-field v-model.number="minBuffer" label="Minimal Stok" type="number" class="mt-4"
                        density="compact" variant="outlined" />
                    <v-text-field v-model.number="maxBuffer" label="Maximal Stok" type="number" density="compact"
                        variant="outlined" />
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn @click="isSettingVisible = false">Batal</v-btn>
                    <v-btn color="primary" @click="saveSetting" :loading="isSettingSaving">Simpan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
/* --- 👇 TAMBAHKAN STYLE INI UNTUK PEWARNAAN BARIS 👇 --- */
:deep(tr.harus-minta) {
    color: red !important;
}

:deep(tr.sudah-minta) {
    color: blue !important;
}

/* --- Style untuk Legend --- */
.legend-group {
    display: flex;
    gap: 1rem;
    font-size: 10px;
    align-items: center;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
}
</style>
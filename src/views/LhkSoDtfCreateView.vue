<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import SoPoSearchModal from '@/components/SoPoSearchModal.vue';
import type { AxiosError } from 'axios';

interface LhkItem {
    id: number;
    kode: string;
    nama: string;
    depan: number | null;
    belakang: number | null;
    lengan: number | null;
    variasi: number | null;
    saku: number | null;
    panjang: number | null;
    buangan: number | null;
    ket: string;
}

interface LhkApiResponseItem {
    kode: string;
    nama: string;
    depan: number | null;
    belakang: number | null;
    lengan: number | null;
    variasi: number | null;
    saku: number | null;
    panjang: number | null;
    buangan: number | null;
    ket: string;
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '41';

const selectedTanggal = ref(format(new Date(), 'yyyy-MM-dd'));
const selectedCabang = ref(authStore.user?.cabang || '');
const items = ref<LhkItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);

const isSearchModalVisible = ref(false);
const activeRowIndex = ref(0);

const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);

const pageTitle = computed(() => `Form LHK SO DTF`);
const canView = computed(() => authStore.can(MENU_ID, 'view'));
const canEdit = computed(() => authStore.can(MENU_ID, 'edit'));
const canSave = computed(() => authStore.can(MENU_ID, 'insert'));

const tableHeaders = [
    { title: 'No.', key: 'no', sortable: false, width: '40px' },
    { title: 'PO/SO DTF', key: 'kode', sortable: false, width: '180px' },
    { title: 'Nama DTF', key: 'nama', sortable: false, width: '250px' },
    { title: 'Depan', key: 'depan', sortable: false, width: '90px' },
    { title: 'Belakang', key: 'belakang', sortable: false, width: '90px' },
    { title: 'Lengan', key: 'lengan', sortable: false, width: '90px' },
    { title: 'Variasi', key: 'variasi', sortable: false, width: '90px' },
    { title: 'Saku', key: 'saku', sortable: false, width: '90px' },
    { title: 'Panjang (Mtr)', key: 'panjang', sortable: false, width: '110px' },
    { title: 'Buangan (Mtr)', key: 'buangan', sortable: false, width: '110px' },
    { title: 'Keterangan', key: 'ket', sortable: false, width: '200px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

const loadLhkData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get<LhkApiResponseItem[]>(
            `/lhk-so-dtf-form/${selectedTanggal.value}/${selectedCabang.value}`
        );
        items.value = response.data.map((item, index) => ({
            ...item,
            id: Date.now() + index, // id untuk key v-for
            // pastikan semua properti sesuai LhkItem
            depan: item.depan ?? 0,
            belakang: item.belakang ?? 0,
            lengan: item.lengan ?? 0,
            variasi: item.variasi ?? 0,
            saku: item.saku ?? 0,
            panjang: item.panjang ?? 0,
            buangan: item.buangan ?? 0,
            ket: item.ket ?? ''
        }));
    } catch (error: unknown) {
        toast.error('Gagal memuat data LHK.');
        console.error(error);
        items.value = [];
    } finally {
        addNewRowIfNeeded();
        isLoading.value = false;
    }
};

const addNewRowIfNeeded = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({
            id: Date.now(), kode: '', nama: '', depan: 0, belakang: 0, lengan: 0,
            variasi: 0, saku: 0, panjang: 0, buangan: 0, ket: ''
        });
    }
};

const removeRow = (id: number) => {
    items.value = items.value.filter(item => item.id !== id);
    addNewRowIfNeeded();
};

const openSearchModal = (index: number) => {
    activeRowIndex.value = index;
    isSearchModalVisible.value = true;
};

const onSoPoSelected = (selectedItem: { kode: string, nama: string }) => {
    const isDuplicate = items.value.some(item => item.kode === selectedItem.kode && item.id !== items.value[activeRowIndex.value].id);
    if (isDuplicate) {
        toast.error(`Nomor ${selectedItem.kode} sudah ada di dalam daftar.`);
        return;
    }
    items.value[activeRowIndex.value].kode = selectedItem.kode;
    items.value[activeRowIndex.value].nama = selectedItem.nama;
    addNewRowIfNeeded();
    isSearchModalVisible.value = false;
};

const save = async () => {
    isSaving.value = true;
    try {
        const validItems = items.value.filter(item => item.kode && item.nama);
        if (validItems.length === 0) {
            toast.warning('Tidak ada data valid untuk disimpan.');
            return;
        }
        await api.post('/lhk-so-dtf-form', {
            tanggal: selectedTanggal.value,
            cabang: selectedCabang.value,
            items: validItems
        });
        toast.success('Data LHK berhasil disimpan.');
        loadLhkData();
    } catch (error: unknown) {
        let message = 'Gagal menyimpan data.';

        if (error instanceof Error) {
            // error JS standar
            message = error.message;
        } else if (typeof error === 'object' && error !== null) {
            // Cek jika error objek dan mungkin AxiosError
            const axiosError = error as AxiosError<{ message: string }>;
            if (axiosError.response?.data?.message) {
                message = axiosError.response.data.message;
            }
        }

        toast.error(message);
    } finally {
        isSaving.value = false;
    }
};

const showConfirmation = (action: () => void, text: string) => {
    pendingAction.value = action;
    confirmText.value = text;
    isConfirmDialogVisible.value = true;
};

const executePendingAction = () => {
    if (pendingAction.value) {
        pendingAction.value();
    }
    isConfirmDialogVisible.value = false;
};

const closeConfirmDialog = () => {
    isConfirmDialogVisible.value = false;
    pendingAction.value = null;
};

// Buat fungsi baru untuk navigasi Tutup agar bisa dipanggil
const closeForm = () => {
    router.push('/transaksi/penjualan/dtf/lhk-so-dtf');
};

onMounted(() => {
    // Navigasi dari browse view bisa menyertakan tanggal dan cabang
    if (route.query.tanggal && route.query.cabang) {
        selectedTanggal.value = route.query.tanggal as string;
        selectedCabang.value = route.query.cabang as string;
    }
    loadLhkData();
});

watch([selectedTanggal, selectedCabang], loadLhkData);
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-clipboard-edit-outline">
        <template #header-actions>
            <v-btn v-if="canSave" size="small" color="primary"
                @click="showConfirmation(save, 'Anda yakin ingin menyimpan data LHK ini?')" :loading="isSaving"
                prepend-icon="mdi-content-save">
                Simpan
            </v-btn>
            <v-btn v-if="canEdit" size="small"
                @click="showConfirmation(loadLhkData, 'Batalkan perubahan dan muat ulang data asli?')"
                prepend-icon="mdi-refresh">
                Batal
            </v-btn>
            <v-btn size="small"
                @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')"
                prepend-icon="mdi-close">
                Tutup
            </v-btn>
        </template>

        <div v-if="!canView" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div class="form-content">
            <div class="header-filters">
                <v-text-field label="Store" :model-value="selectedCabang" density="compact" hide-details
                    variant="outlined" style="max-width: 120px;" readonly filled />
                <v-text-field label="Tanggal" v-model="selectedTanggal" type="date" density="compact" hide-details
                    variant="outlined" style="max-width: 180px;" />
                <v-text-field label="Cari SPK..." density="compact" hide-details variant="outlined"
                    prepend-inner-icon="mdi-magnify" style="max-width: 250px;" />
            </div>

            <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
                class="desktop-table" fixed-header :items-per-page="-1">
                <!-- Kolom No. -->
                <template #[`item.no`]="{ index }">
                    <div class="cell-text">{{ index + 1 }}</div>
                </template>
                <!-- Kolom Kode -->
                <template #[`item.kode`]="{ item, index }">
                    <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                        @keydown.f1.prevent="openSearchModal(index)">
                        <template #append-inner>
                            <v-icon @click="openSearchModal(index)" size="small">mdi-magnify</v-icon>
                        </template>
                    </v-text-field>
                </template>
                <!-- Kolom Nama -->
                <template #[`item.nama`]="{ item }">
                    <v-text-field v-model="item.nama" variant="underlined" density="compact" hide-details readonly
                        filled />
                </template>
                <!-- Kolom Depan -->
                <template #[`item.depan`]="{ item }">
                    <v-text-field v-model.number="item.depan" type="number" min="0" variant="underlined"
                        density="compact" hide-details class="text-end" />
                </template>
                <!-- Kolom Belakang -->
                <template #[`item.belakang`]="{ item }">
                    <v-text-field v-model.number="item.belakang" type="number" min="0" variant="underlined"
                        density="compact" hide-details class="text-end" />
                </template>
                <!-- Kolom Lengan -->
                <template #[`item.lengan`]="{ item }">
                    <v-text-field v-model.number="item.lengan" type="number" min="0" variant="underlined"
                        density="compact" hide-details class="text-end" />
                </template>
                <!-- Kolom Variasi -->
                <template #[`item.variasi`]="{ item }">
                    <v-text-field v-model.number="item.variasi" type="number" min="0" variant="underlined"
                        density="compact" hide-details class="text-end" />
                </template>
                <!-- Kolom Saku -->
                <template #[`item.saku`]="{ item }">
                    <v-text-field v-model.number="item.saku" type="number" min="0" variant="underlined"
                        density="compact" hide-details class="text-end" />
                </template>
                <!-- Kolom Panjang -->
                <template #[`item.panjang`]="{ item }">
                    <v-text-field v-model.number="item.panjang" type="number" min="0" variant="underlined"
                        density="compact" hide-details class="text-end" />
                </template>
                <!-- Kolom Buangan -->
                <template #[`item.buangan`]="{ item }">
                    <v-text-field v-model.number="item.buangan" type="number" min="0" variant="underlined"
                        density="compact" hide-details class="text-end" />
                </template>
                <!-- Kolom Keterangan -->
                <template #[`item.ket`]="{ item }">
                    <v-text-field v-model="item.ket" variant="underlined" density="compact" hide-details />
                </template>
                <!-- Kolom Actions -->
                <template #[`item.actions`]="{ item }">
                    <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="removeRow(item.id)"
                        v-if="items.length > 1" />
                </template>
                <!-- Bottom kosong -->
                <template #bottom></template>
            </v-data-table>
        </div>

        <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">Konfirmasi</v-card-title>
                <v-card-text>{{ confirmText }}</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal" @click="executePendingAction">Ya, Lanjutkan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <SoPoSearchModal v-if="isSearchModalVisible" :cabang="selectedCabang" @close="isSearchModalVisible = false"
            @selected="onSoPoSelected" />
    </PageLayout>
</template>

<style scoped>
/* Mengatur text biasa di dalam sel (untuk kolom No.) */
.cell-text {
    padding: 0 8px;
}

.text-end :deep(input) {
    text-align: right;
}
</style>
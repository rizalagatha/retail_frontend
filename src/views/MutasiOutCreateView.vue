<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import SoSearchModal from '@/components/SoSearchModal.vue';
import WorkshopSearchModal from '@/components/WorkshopSearchModal.vue';

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '43';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Mutasi Out' : 'Buat Mutasi Out');
const initialHeaderState = {
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    soNomor: '',
    keCabang: '',
    keCabangNama: '',
    keterangan: '',
};
const formHeader = ref({ ...initialHeaderState });
const items = ref<any[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isSavingDisabled = ref(false); // Untuk menonaktifkan simpan saat mode ubah
const isSoSearchVisible = ref(false);
const isWorkshopSearchVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);


const tableHeaders = [
    { title: 'Kode Barang', key: 'kode' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran' },
    { title: 'Stok Showroom', key: 'stok', align: 'end' },
    { title: 'Qty SO', key: 'qtyso', align: 'end' },
    { title: 'Sudah', key: 'sudah', align: 'end' },
    { title: 'Belum', key: 'belum', align: 'end' },
    { title: 'Qty Out', key: 'jumlah', align: 'end', width: '150px' },
    { title: 'Barcode', key: 'barcode' },
];

const onSoSelected = async (so: { Nomor: string }) => {
    isSoSearchVisible.value = false;
    formHeader.value.soNomor = so.Nomor;
    isLoading.value = true;
    try {
        const response = await api.get(`/mutasi-out-form/lookup/so-details/${so.Nomor}`);
        items.value = response.data.map((item: any, index: number) => ({ ...item, id: Date.now() + index }));
    } catch (error) {
        toast.error('Gagal memuat detail SO.');
    } finally {
        isLoading.value = false;
    }
};

const onWorkshopSelected = (workshop: { kode: string, nama: string }) => {
    formHeader.value.keCabang = workshop.kode;
    formHeader.value.keCabangNama = workshop.nama;
    isWorkshopSearchVisible.value = false;
};

const loadDataForEdit = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/mutasi-out-form/${nomor}`);
        const { header, items: loadedItems } = response.data;
        formHeader.value.nomor = header.mo_nomor;
        formHeader.value.tanggal = format(new Date(header.mo_tanggal), 'yyyy-MM-dd');
        formHeader.value.soNomor = header.mo_so_nomor;
        formHeader.value.keCabang = header.mo_kecab;
        formHeader.value.keCabangNama = header.pab_nama; // Asumsi pab_nama ada
        formHeader.value.keterangan = header.mo_ket;
        items.value = loadedItems.map((item: any) => ({ ...item, id: Date.now() + Math.random() }));
        // Logika Delphi: nonaktifkan tombol simpan jika sudah ada mutasi in
        // isSavingDisabled.value = response.data.hasMutasiIn; 
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data.');
        router.back();
    } finally {
        isLoading.value = false;
    }
};

const save = () => {
    // Validasi dari Delphi
    if (!formHeader.value.keCabang) return toast.error('Cabang tujuan harus diisi.');
    if (items.value.length === 0 || !items.value.some(i => i.nama)) return toast.error('Detail barang harus diisi.');
    const totalQtyOut = items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0);
    if (totalQtyOut === 0) return toast.error('Qty Out kosong semua.');

    for (const item of items.value) {
        if ((item.jumlah || 0) > (item.stok || 0)) {
            return toast.error(`Qty Out untuk ${item.nama} (${item.ukuran}) melebihi stok.`);
        }
        if ((item.jumlah || 0) > (item.belum || 0)) {
            return toast.error(`Qty Out untuk ${item.nama} (${item.ukuran}) melebihi sisa SO.`);
        }
    }

    showConfirmation(executeSave, "Anda yakin ingin menyimpan data Mutasi Out ini?");
};

const executeSave = async () => {
    isSaving.value = true;
    try {
        const payload = {
            header: formHeader.value,
            items: items.value,
            isNew: !isEditMode.value,
        };
        const response = await api.post('/mutasi-out-form/save', payload);
        toast.success(response.data.message);
        router.push('/transaksi/mutasi/out-produksi');
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } finally {
        isSaving.value = false;
    }
};

const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) { // Cek jika baris terakhir sudah terisi
        items.value.push({
            id: Date.now(),
            kode: '',
            nama: '',
            ukuran: '',
            stok: 0,
            qtyso: 0,
            sudah: 0,
            belum: 0,
            jumlah: null,
            barcode: ''
        });
    }
};

// --- Fungsi Reset Form ---
const resetForm = () => {
    formHeader.value = { ...initialHeaderState };
    items.value = [];
    addNewRow(); // Selalu sediakan satu baris kosong
    // Reset state lain jika ada
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
const closeForm = () => {
    router.push('/transaksi/surat-pesanan');
};

onMounted(() => {
    const nomor = route.params.nomor as string;
    if (isEditMode.value && nomor) {
        loadDataForEdit(nomor);
    } else {
        resetForm();
        isLoading.value = false;
    }
});

// ... (implementasi save, loadForEdit, dll)
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-package-variant-closed-edit">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="save" :loading="isSaving"
                :disabled="isSaving || isSavingDisabled">Simpan</v-btn>
            <v-btn size="small" @click="showConfirmation(resetForm, 'Batalkan dan kosongkan form?')">Batal</v-btn>
            <v-btn size="small" @click="showConfirmation(closeForm, 'Tutup form?')">Tutup</v-btn>
        </template>
        <div class="form-content">
            <div class="header-filters">
                <v-text-field label="Nomor" v-model="formHeader.nomor" readonly filled density="compact" hide-details>
                    <template #append-inner>
                        <span v-if="!formHeader.nomor" style="color: #888; font-size: 11px;">&lt;Otomatis&gt;</span>
                    </template>
                </v-text-field>
                <v-text-field label="Tanggal" v-model="formHeader.tanggal" type="date" density="compact" hide-details />
                <v-text-field label="No. SO" v-model="formHeader.soNomor" readonly @click="isSoSearchVisible = true"
                    prepend-inner-icon="mdi-magnify" density="compact" hide-details
                    :class="{ 'field-disabled': isEditMode }" />
                <v-text-field label="Ke Cabang"
                    :model-value="formHeader.keCabang ? `${formHeader.keCabang} - ${formHeader.keCabangNama}` : ''"
                    readonly @click="isWorkshopSearchVisible = true" prepend-inner-icon="mdi-magnify" density="compact"
                    hide-details />
                <v-text-field label="Keterangan" v-model="formHeader.keterangan" variant="outlined" density="compact"
                    hide-details />
            </div>
            <div class="table-container">
                <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
                    class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
                    <template #item.jumlah="{ item }">
                        <v-text-field v-model.number="item.jumlah" type="number" min="0" :max="item.belum"
                            variant="underlined" density="compact" hide-details class="text-end" />
                    </template>
                    <template #bottom></template>
                </v-data-table>
            </div>
        </div>

        <SoSearchModal v-if="isSoSearchVisible" :cabang="authStore.user?.cabang || ''"
            @close="isSoSearchVisible = false" @selected="onSoSelected" />
        <WorkshopSearchModal v-if="isWorkshopSearchVisible" :user-cabang="authStore.user?.cabang || ''"
            @close="isWorkshopSearchVisible = false" @workshop-selected="onWorkshopSelected" />

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
    </PageLayout>
</template>
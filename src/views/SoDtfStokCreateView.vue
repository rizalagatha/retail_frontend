<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import SalesSearchModal from '@/components/SalesSearchModal.vue';
import JenisOrderStokSearchModal from '@/components/JenisOrderStokSearchModal.vue';
import WorkshopSearchModal from '@/components/WorkshopSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';

interface DetailItem {
    id: number;
    kode: string;
    nama: string;
    ukuran: string;
    panjang: number | null;
    lebar: number | null;
    jumlah: number | null;
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '36';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah SO DTF Stok` : 'Buat SO DTF Stok Baru');

const initialFormState = {
    nomor: null as string | null,
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    tglPengerjaan: format(new Date(), 'yyyy-MM-dd'),
    salesKode: '',
    salesNama: '',
    jenisOrderKode: '',
    jenisOrderNama: '',
    namaDtf: '',
    desain: '',
    workshopKode: authStore.user?.cabang || '',
    workshopNama: '', // Akan diisi nanti
    keterangan: '',
};

const form = ref({ ...initialFormState });
const items = ref<DetailItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);

// State untuk modals & dialogs
const isSalesSearchVisible = ref(false);
const isJenisOrderSearchVisible = ref(false);
const isWorkshopSearchVisible = ref(false);
const isImageFullscreenVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);

// State untuk gambar
const imagePreview = ref<string | null>(null);
const imageFile = ref<File[]>([]);

const totalJumlah = computed(() => items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0));

const tableHeaders = [
    { title: 'No.', key: 'no', sortable: false, width: '40px' },
    { title: 'Kode', key: 'kode', sortable: false, width: '120px' },
    { title: 'Nama Barang', key: 'nama', sortable: false, width: '250px' },
    { title: 'Ukuran', key: 'ukuran', sortable: false, width: '100px' },
    { title: 'Panjang(cm)', key: 'panjang', sortable: false, width: '100px', align: 'end' },
    { title: 'Lebar(cm)', key: 'lebar', sortable: false, width: '100px', align: 'end' },
    { title: 'Jumlah', key: 'jumlah', sortable: false, width: '120px' },
];

const fetchTemplateItems = async (jenisOrder: string) => {
    if (!jenisOrder) {
        items.value = [];
        return;
    }
    isLoading.value = true;
    try {
        const response = await api.get(`/so-dtf-stok-form/lookup/template-items/${jenisOrder}`);
        items.value = response.data.map((item: any, index: number) => ({ ...item, id: Date.now() + index, jumlah: 0 }));
        form.value.namaDtf = jenisOrder === 'SD' ? 'STICKER DTF' : 'STICKER DTF PREMIUM';
    } catch {
        toast.error('Gagal memuat template item.');
    } finally {
        isLoading.value = false;
    }
};

const loadDataForEdit = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/so-dtf-stok-form/${nomor}`);
        const { header, details } = response.data;

        form.value.nomor = header.sd_nomor;
        form.value.tanggal = format(new Date(header.sd_tanggal), 'yyyy-MM-dd');
        form.value.tglPengerjaan = format(new Date(header.sd_datekerja), 'yyyy-MM-dd');
        form.value.salesKode = header.sd_sal_kode;
        form.value.salesNama = header.sal_nama;
        form.value.jenisOrderKode = header.sd_jo_kode;
        form.value.jenisOrderNama = header.jo_nama;
        form.value.namaDtf = header.sd_nama;
        form.value.desain = header.sd_desain;
        form.value.workshopKode = header.sd_workshop;
        form.value.workshopNama = header.pab_nama;
        form.value.keterangan = header.sd_ket;

        await fetchTemplateItems(header.sd_jo_kode);

        details.forEach((savedItem: any) => {
            const itemToUpdate = items.value.find(i => i.kode === savedItem.sds_kode && i.ukuran === savedItem.sds_ukuran);
            if (itemToUpdate) {
                itemToUpdate.jumlah = savedItem.sds_jumlah;
                itemToUpdate.panjang = savedItem.sds_panjang;
                itemToUpdate.lebar = savedItem.sds_lebar;
            }
        });
    } catch {
        toast.error('Gagal memuat data SO Stok.');
        router.back();
    } finally {
        isLoading.value = false;
    }
};

const save = async () => {
    // --- Validasi Data Sebelum Simpan ---
    if (!form.value.salesKode) {
        toast.error("Sales harus diisi.");
        return;
    }
    if (!form.value.jenisOrderKode) {
        toast.error("Jenis Order harus diisi.");
        return;
    }

    const validItems = items.value.filter(item => item.jumlah && item.jumlah > 0);
    if (validItems.length === 0) {
        toast.error("Detail item harus diisi, pastikan ada jumlah yang lebih dari 0.");
        return;
    }

    // --- Proses Penyimpanan ---
    isSaving.value = true;
    const payload = {
        header: form.value,
        details: validItems,
    };

    let nomorSoDtf = form.value.nomor;

    try {
        let response;
        if (isEditMode.value && nomorSoDtf) {
            response = await api.put(`/so-dtf-stok-form/${nomorSoDtf}`, payload);
            toast.success('Data berhasil diperbarui.');
        } else {
            response = await api.post('/so-dtf-stok-form', payload);
            nomorSoDtf = response.data.nomor;
            toast.success(`Data berhasil disimpan dengan nomor: ${nomorSoDtf}`);
        }

        // Logika upload gambar
        if (imageFile.value.length > 0 && nomorSoDtf) {
            const formData = new FormData();
            formData.append('image', imageFile.value[0]);
            try {
                await api.post(`/so-dtf-stok-form/upload-image/${nomorSoDtf}`, formData);
                toast.success('Gambar berhasil diunggah.');
            } catch (uploadError) {
                toast.warning('Data utama berhasil disimpan, tetapi gambar gagal diunggah.');
            }
        }

        router.push('/transaksi/penjualan/dtf/so-dtf-stok');

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } finally {
        isSaving.value = false;
    }
};


const resetForm = () => {
    form.value = { ...initialFormState };
    items.value = [];
    imagePreview.value = null;
    imageFile.value = [];
    toast.info("Form telah dikosongkan.");
};

const closeForm = () => {
    router.push('/transaksi/penjualan/dtf/so-dtf-stok');
};

const handleImageUpload = (files: File[]) => {
    const file = files[0];
    if (!file) {
        imagePreview.value = null;
        return;
    }
    // Validasi ukuran file < 1MB seperti di Delphi
    if (file.size > 1024 * 1024) {
        toast.error('Ukuran gambar tidak boleh lebih dari 1MB.');
        imageFile.value = [];
        imagePreview.value = null;
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
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

const onSalesSelected = (sales: { kode: string, nama: string }) => {
    form.value.salesKode = sales.kode;
    form.value.salesNama = sales.nama;
    isSalesSearchVisible.value = false;
};

const onJenisOrderSelected = (jenisOrder: { kode: string, nama: string }) => {
    form.value.jenisOrderKode = jenisOrder.kode;
    form.value.jenisOrderNama = jenisOrder.nama;
    isJenisOrderSearchVisible.value = false;
};

const onWorkshopSelected = (workshop: { kode: string, nama: string }) => {
    form.value.workshopKode = workshop.kode;
    form.value.workshopNama = workshop.nama;
    isWorkshopSearchVisible.value = false;
};

watch(() => form.value.jenisOrderKode, (newVal) => {
    if (!isEditMode.value && newVal) {
        fetchTemplateItems(newVal);
    }
});

onMounted(() => {
    const nomor = route.params.nomor as string;
    if (nomor) {
        loadDataForEdit(nomor);
    } else {
        // Form baru, user perlu memilih Jenis Order untuk memuat grid
        isLoading.value = false;
    }
});
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-package-variant-closed-plus">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="showConfirmation(save, 'Anda yakin ingin menyimpan data ini?')"
                :loading="isSaving" prepend-icon="mdi-content-save">
                Simpan
                </v-btn>
                <v-btn v-if="!isEditMode" size="small"
                    @click="showConfirmation(resetForm, 'Batalkan dan kosongkan semua isian?')"
                    prepend-icon="mdi-refresh">
                    Batal
                </v-btn>
                <v-btn size="small"
                    @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')"
                    prepend-icon="mdi-close">
                    Tutup
                </v-btn>
        </template>

        <div class="form-grid-container" v-if="!isLoading">
            <div class="left-column">
                <div class="desktop-form-section">
                    <v-row dense>
                        <v-col cols="12"><v-text-field label="Nomor" :model-value="form.nomor || '<Otomatis>'" readonly
                                filled density="compact" hide-details /></v-col>
                        <v-col cols="12"><v-text-field label="Tanggal" v-model="form.tanggal" type="date"
                                variant="outlined" density="compact" hide-details /></v-col>
                        <v-col cols="12"><v-text-field label="Tgl Pengerjaan" v-model="form.tglPengerjaan" type="date"
                                variant="outlined" density="compact" hide-details /></v-col>
                        <v-col cols="12"><v-text-field label="Sales"
                                :model-value="form.salesKode ? `${form.salesKode} - ${form.salesNama}` : ''" readonly
                                @click="isSalesSearchVisible = true" variant="outlined" density="compact" hide-details
                                append-inner-icon="mdi-magnify" /></v-col>
                        <v-col cols="12"><v-text-field label="Jenis Order"
                                :model-value="form.jenisOrderKode ? `${form.jenisOrderKode} - ${form.jenisOrderNama}` : ''"
                                readonly @click="isJenisOrderSearchVisible = true" :disabled="isEditMode"
                                :class="{ 'field-disabled': isEditMode }" variant="outlined" density="compact"
                                hide-details append-inner-icon="mdi-magnify" /></v-col>
                        <v-col cols="12"><v-text-field label="Nama DTF" v-model="form.namaDtf" variant="outlined"
                                density="compact" hide-details /></v-col>
                        <v-col cols="12"><v-text-field label="Bag Desain" v-model="form.desain" variant="outlined"
                                density="compact" hide-details /></v-col>
                        <v-col cols="12"><v-text-field label="Workshop"
                                :model-value="form.workshopKode ? `${form.workshopKode} - ${form.workshopNama}` : ''"
                                readonly @click="isWorkshopSearchVisible = true" variant="outlined" density="compact"
                                hide-details append-inner-icon="mdi-magnify" /></v-col>
                    </v-row>
                </div>
                <v-textarea label="Keterangan" v-model="form.keterangan" rows="4" variant="outlined" density="compact"
                    hide-details class="notes-area" />
            </div>
            <div class="right-column">
                <div class="desktop-form-section image-section">
                    <div class="d-flex align-center ga-2">
                        <v-file-input v-model="imageFile" @update:model-value="handleImageUpload"
                            label="Upload Gambar (Max 1Mb)" variant="outlined" density="compact"
                            prepend-icon="mdi-camera" hide-details clearable />
                        <v-btn @click="isImageFullscreenVisible = true" :disabled="!imagePreview" icon="mdi-fullscreen"
                            size="small" variant="tonal" title="Lihat Ukuran Penuh">
                        </v-btn>
                    </div>
                    <v-img v-if="imagePreview" class="mt-2 border rounded" height="120" aspect-ratio="16/9" cover
                        :src="imagePreview">
                    </v-img>
                    <div v-else
                        class="mt-2 border rounded d-flex align-center justify-center bg-grey-lighten-4 image-preview">
                        <span class="text-caption text-grey">Preview Gambar</span>
                    </div>
                </div>
                <div class="desktop-form-section grid-section">
                    <v-data-table :headers="tableHeaders" :items="items" density="compact" class="desktop-table"
                        fixed-header :items-per-page="-1">
                        <template #item.no="{ index }">
                            <div class="cell-text">{{ index + 1 }}</div>
                        </template>
                        <template #item.kode="{ item }">
                            <div class="cell-text">{{ item.kode }}</div>
                        </template>
                        <template #item.nama="{ item }">
                            <div class="cell-text">{{ item.nama }}</div>
                        </template>
                        <template #item.ukuran="{ item }">
                            <div class="cell-text">{{ item.ukuran }}</div>
                        </template>
                        <template #item.panjang="{ item }">
                            <div class="cell-text text-end">{{ item.panjang }}</div>
                        </template>
                        <template #item.lebar="{ item }">
                            <div class="cell-text text-end">{{ item.lebar }}</div>
                        </template>
                        <template #item.jumlah="{ item }"><v-text-field v-model.number="item.jumlah" type="number"
                                min="0" variant="underlined" density="compact" hide-details
                                class="text-end" /></template>
                        <template #bottom>
                            <tfoot>
                                <tr class="total-row">
                                    <td :colspan="tableHeaders.length - 1" class="text-right font-weight-bold">Total
                                        Jumlah</td>
                                    <td class="text-right font-weight-bold">{{ totalJumlah }}</td>
                                </tr>
                            </tfoot>
                        </template>
                    </v-data-table>
                </div>
            </div>
        </div>
        <v-skeleton-loader v-else type="article, actions"></v-skeleton-loader>

        <!-- Modals -->
        <SalesSearchModal v-if="isSalesSearchVisible" @close="isSalesSearchVisible = false"
            @sales-selected="onSalesSelected" />
        <JenisOrderStokSearchModal v-if="isJenisOrderSearchVisible" @close="isJenisOrderSearchVisible = false"
            @jenis-order-selected="onJenisOrderSelected" />
        <WorkshopSearchModal v-if="isWorkshopSearchVisible" @close="isWorkshopSearchVisible = false"
            @workshop-selected="onWorkshopSelected" />

        <!-- Fullscreen Image Modal -->
        <v-dialog v-model="isImageFullscreenVisible" max-width="90vw">
            <v-card>
                <v-toolbar density="compact">
                    <v-spacer />
                    <v-btn icon="mdi-close" @click="isImageFullscreenVisible = false"></v-btn>
                </v-toolbar>
                <v-img :src="imagePreview || ''" max-height="90vh" contain></v-img>
            </v-card>
        </v-dialog>
        <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">
                    Konfirmasi
                </v-card-title>
                <v-card-text>
                    {{ confirmText }}
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">
                        Tidak
                    </v-btn>
                    <v-btn color="primary" variant="tonal" @click="executePendingAction">
                        Ya, Lanjutkan
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
.form-grid-container {
    padding: 12px;
    height: 100%;
    display: grid;
    grid-template-columns: 400px 1fr;
    gap: 12px;
}

.left-column,
.right-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
}

.desktop-form-section {
    padding: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    background-color: white;
}

.left-column .desktop-form-section {
    flex-shrink: 0;
}

.notes-area {
    flex-grow: 1;
}

.image-section {
    flex-shrink: 0;
}

.image-preview {
    height: 120px;
}

.grid-section {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
}

.desktop-table {
    font-size: 11px;
    flex-grow: 1;
}

.left-column .desktop-form-section :deep(.v-label) {
    font-size: 11px !important;
}

.left-column .desktop-form-section :deep(input),
.left-column .desktop-form-section :deep(.v-select__selection-text) {
    font-size: 12px !important;
}

.image-section :deep(.v-file-input .v-label) {
    font-size: 11px !important;
}

.image-section :deep(.v-file-input input),
.image-section :deep(.v-file-input .v-field__input) {
    font-size: 12px !important;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 32px !important;
}

.desktop-table :deep(input) {
    font-size: 11px !important;
}

.header-section :deep(.v-col) {
    padding-top: 4px;
    padding-bottom: 4px;
}

.header-section :deep(.v-label) {
    font-size: 11px !important;
}

.header-section :deep(input),
.header-section :deep(.v-select__selection-text) {
    font-size: 12px !important;
}

.cell-text {
    padding: 0 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.text-end {
    text-align: right;
}

.total-row td {
    background-color: #f5f5f5;
    border-top: 1px solid #ccc !important;
}

.field-disabled {
    background-color: #f0f0f0;
    pointer-events: none;
}
</style>
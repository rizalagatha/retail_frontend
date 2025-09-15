<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import SoSearchModal from '@/components/SoSearchModal.vue';
import CustomerSearchModal from '@/components/CustomerSearchModal.vue';
import ProductSearchModal from '@/components/ProductSearchModal.vue';

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '37';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Minta Barang ke DC' : 'Buat Minta Barang ke DC');

const initialHeaderState = {
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    soNomor: '',
    customer: null as any,
    keterangan: '',
};
const formHeader = ref({ ...initialHeaderState });
const items = ref<any[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isSoSearchVisible = ref(false);
const isCustomerSearchVisible = ref(false);
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
const activeRowIndex = ref(0);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);

const tableHeaders = [
    { title: 'Kode Barang', key: 'kode' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran' },
    { title: 'Stok Min', key: 'stokmin', align: 'end' },
    { title: 'Stok Max', key: 'stokmax', align: 'end' },
    { title: 'Sudah Minta', key: 'sudahminta', align: 'end' },
    { title: 'SJ Blm Diterima', key: 'sj', align: 'end' },
    { title: 'Stok', key: 'stok', align: 'end' },
    { title: 'Minta Otomatis', key: 'mino', align: 'end' },
    { title: 'Jumlah', key: 'jumlah', align: 'end', width: '150px' },
    { title: 'Barcode', key: 'barcode' },
    { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({ id: Date.now(), kode: '', nama: '', jumlah: null });
    }
};

const removeRow = (id: number) => {
    items.value = items.value.filter(item => item.id !== id);
};

const resetForm = () => {
    formHeader.value = { ...initialHeaderState };
    items.value = [];
    addNewRow();
};

const openProductSearch = (index: number, isMulti: boolean) => {
    activeRowIndex.value = index;
    isMultiSelectProduct.value = isMulti;
    isProductSearchVisible.value = true;
};

const onProductsSelected = (selectedProducts: any[]) => {
    isProductSearchVisible.value = false;
    if (!selectedProducts || selectedProducts.length === 0) return;
    items.value.splice(activeRowIndex.value, 1);
    selectedProducts.forEach(async (product) => {
        const isDuplicate = items.value.some(item => item.kode === product.kode && item.ukuran === product.ukuran);
        if (!isDuplicate) {
            try {
                const response = await api.get('/minta-barang-form/lookup/product-details', {
                    params: { kode: product.kode, ukuran: product.ukuran }
                });
                items.value.push({ ...response.data, id: Date.now() + Math.random() });
            } catch (error) {
                toast.error(`Gagal memuat detail untuk ${product.kode}`);
            }
        }
    });
    addNewRow();
};

const openCustomerSearch = () => {
    // Customer hanya bisa dipilih jika belum ada SO yang dipilih
    if (!formHeader.value.soNomor) {
        isCustomerSearchVisible.value = true;
    }
};

const onCustomerSelected = (customer: any) => {
    formHeader.value.customer = customer;
    isCustomerSearchVisible.value = false;
};

const onSoSelected = async (so: { Nomor: string, Customer: string, KdCus: string, Alamat: string }) => {
    isSoSearchVisible.value = false;
    formHeader.value.soNomor = so.Nomor;
    formHeader.value.customer = {
        kode: so.KdCus,
        nama: so.Customer,
        alamat: so.Alamat
    };
    isLoading.value = true;
    try {
        const response = await api.get(`/minta-barang-form/lookup/so-details/${so.Nomor}`);
        items.value = response.data.items.map((item: any, index: number) => ({
            ...item,
            id: Date.now() + index
        }));

        formHeader.value.customer = response.data.customer; // langsung pakai dari backend
        addNewRow();
    } catch (error) {
        toast.error('Gagal memuat detail SO.');
    } finally {
        isLoading.value = false;
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
const closeForm = () => {
    router.push('/transaksi/internal/minta-barang');
};

const loadDataForEdit = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/minta-barang-form/${nomor}`);
        const { header, items: loadedItems } = response.data;

        // Isi header form
        formHeader.value = {
            ...formHeader.value,
            ...header,
            tanggal: format(new Date(header.tanggal), 'yyyy-MM-dd'),
        };

        // Isi grid
        items.value = loadedItems.map((item: any) => ({ ...item, id: Date.now() + Math.random() }));
        addNewRow();

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat data.');
        router.back();
    } finally {
        isLoading.value = false;
    }
};

const save = () => {
    if (!authStore.can(MENU_ID, isEditMode.value ? 'edit' : 'insert')) {
        toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
        return;
    }
    // --- Migrasi Validasi dari Delphi (btnSimpanClick) ---
    if (!formHeader.value.soNomor && !formHeader.value.customer?.kode) {
        toast.error('No. Pesanan atau Customer harus diisi.');
        return;
    }
    const validItems = items.value.filter(item => item.kode);
    if (validItems.length === 0) {
        toast.error('Detail barang harus diisi minimal 1 baris.');
        return;
    }
    const totalQty = validItems.reduce((sum, item) => sum + (item.jumlah || 0), 0);
    if (totalQty === 0) {
        toast.error('Jumlah minta masih kosong semua.');
        return;
    }

    // Jika semua validasi lolos, tampilkan dialog konfirmasi
    showConfirmation(executeSave, "Anda yakin ingin menyimpan data Minta Barang ini?");
};

const executeSave = async () => {
    isSaving.value = true;
    try {
        const payload = {
            header: formHeader.value,
            items: items.value.filter(item => item.kode && (item.jumlah || 0) > 0),
            isNew: !isEditMode.value,
        };
        const response = await api.post('/minta-barang-form/save', payload);
        toast.success(response.data.message);
        router.push('/transaksi/internal/minta-barang');
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } finally {
        isSaving.value = false;
    }
};

onMounted(() => {
    // Cek hak akses 'insert' (untuk baru) atau 'edit' (untuk ubah)
    if (!authStore.can(MENU_ID, isEditMode.value ? 'edit' : 'insert')) {
        toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data ini.`);
        router.back(); // Lempar user kembali ke halaman sebelumnya
        return;
    }

    const nomor = route.params.nomor as string;
    if (isEditMode.value && nomor) {
        loadDataForEdit(nomor);
    } else {
        resetForm();
        isLoading.value = false;
    }
});
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-playlist-plus">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="save" :loading="isSaving">
                Simpan
            </v-btn>
            <v-btn size="small" @click="showConfirmation(resetForm, 'Batalkan perubahan dan kosongkan form?')">
                Batal
            </v-btn>
            <v-btn size="small"
                @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')">
                Tutup
            </v-btn>
        </template>

        <div class="form-grid-container">
            <div class="left-column">
                <div class="desktop-form-section">
                    <v-row dense>
                        <v-col cols="12">
                            <v-text-field label="Nomor" v-model="formHeader.nomor" readonly filled density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Tanggal" v-model="formHeader.tanggal" type="date" density="compact"
                                hide-details variant="outlined" />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="No. Pesanan" v-model="formHeader.soNomor" readonly
                                @click="isSoSearchVisible = true" prepend-inner-icon="mdi-magnify" density="compact"
                                hide-details :class="{ 'field-disabled': isEditMode }" />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Customer" :model-value="formHeader.customer?.kode" readonly
                                @click="openCustomerSearch" prepend-inner-icon="mdi-magnify" density="compact"
                                hide-details :class="{ 'field-disabled': !!formHeader.soNomor }" />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Nama Customer" :model-value="formHeader.customer?.nama" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Alamat" :model-value="formHeader.customer?.alamat" readonly filled
                                density="compact" hide-details rows="2" />
                        </v-col>
                        <v-col cols="12">
                            <v-textarea label="Keterangan" v-model="formHeader.keterangan" density="compact"
                                hide-details variant="outlined" rows="3" />
                        </v-col>
                    </v-row>
                </div>
            </div>

            <div class="right-column">
                <div class="desktop-form-section fill-height">
                    <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
                        class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
                        <template #item.kode="{ item, index }">
                            <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                                placeholder="F1/F2..."
                                @keydown.f1.prevent="isProductSearchVisible = true; activeRowIndex = index; isMultiSelectProduct = false"
                                @keydown.f2.prevent="isProductSearchVisible = true; activeRowIndex = index; isMultiSelectProduct = true" />
                        </template>
                        <template #item.jumlah="{ item }">
                            <v-text-field v-model.number="item.jumlah" type="number" min="0" variant="underlined"
                                density="compact" hide-details class="text-end" />
                        </template>
                        <template #item.sj="{ item }">
                            <v-text-field v-model.number="item.sj" type="number" min="0" variant="underlined"
                                density="compact" hide-details class="text-end" />
                        </template>
                        <template #item.actions="{ item }">
                            <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                                @click="removeRow(item.id)" title="Hapus baris" />
                        </template>
                        <template #bottom>
                            <div class="pa-2 text-right">
                                <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus" variant="text"
                                    color="primary">Tambah Baris</v-btn>
                            </div>
                        </template>
                    </v-data-table>
                </div>
            </div>
        </div>

        <SoSearchModal v-if="isSoSearchVisible" :cabang="authStore.user?.cabang || ''"
            @close="isSoSearchVisible = false" @selected="onSoSelected" />
        <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="authStore.user?.cabang || ''"
            @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
        <ProductSearchModal v-if="isProductSearchVisible" :multi="isMultiSelectProduct"
            :gudang="authStore.user?.cabang || ''" category="REGULER" @close="isProductSearchVisible = false"
            @products-selected="onProductsSelected" />

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
    min-height: 0;
}

.right-column .desktop-form-section {
    flex-grow: 1;
    display: flex;
}

.right-column .v-data-table {
    flex-grow: 1;
}

.field-disabled {
    background-color: #f0f0f0;
    pointer-events: none;
}

.left-column :deep(.v-label) {
    font-size: 11px !important;
}

.left-column :deep(input),
.left-column :deep(.v-select__selection-text) {
    font-size: 12px !important;
}
</style>
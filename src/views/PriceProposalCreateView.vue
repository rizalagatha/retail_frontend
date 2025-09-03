<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/CustomerSearchModal.vue';
import TshirtTypeSearchModal from '@/components/TshirtTypeSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useRoute } from 'vue-router';
import { format } from 'date-fns';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

// --- Interfaces ---
interface SizeItem {
  size: string;
  qty: number | null;
  hargaPcs: number;
  totalHarga: number;
  kodeBarang: string;
  namaBarang: string;
}
interface Customer {
    kode: string;
    nama: string;
    alamat: string;
    kota: string;
    telp: string;
    top: number;
    level: string;
}
interface Gudang {
    kode: string;
    nama: string;
}

// --- State ---
const activeTab = ref('pengajuan');

const header = ref({
    nomor: '',
    tanggal: new Date().toISOString().substr(0, 10),
    approval: '',
    isApproved: false,
    customerKode: '',
    customerNama: '',
    keterangan: '',
    jenisKaos: '',
    ketersediaan: 'Custom', // Stok atau Custom
});

const sizeItems = ref<SizeItem[]>([]);
const additionalCostItems = ref([]);
const imagePreview = ref<string | null>(null);
const selectedFile = ref<File | null>(null);
const footer = ref({
    hargaBruto: 0,
    diskon: 0,
    hargaNetto: 0
});

const isCustomerSearchVisible = ref(false);
const isTshirtTypeSearchVisible = ref(false);
const isSaving = ref(false);

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah Pengajuan Harga: ${header.value.nomor}` : 'Buat Pengajuan Harga');

// --- Methods ---
const onFileChange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
        if (file.size > 500000) {
            toast.error('Ukuran gambar tidak boleh melebihi 500 KB.');
            return;
        }
        selectedFile.value = file;
        const reader = new FileReader();
        reader.onload = (e) => { imagePreview.value = e.target?.result as string; };
        reader.readAsDataURL(file);
    }
};

const openCustomerSearch = () => { isCustomerSearchVisible.value = true; };

const onCustomerSelected = (customer: Customer) => {
    isCustomerSearchVisible.value = false;
    if (customer) {
        header.value.customerKode = customer.kode;
        header.value.customerNama = customer.nama;
        // Di sini Anda bisa memanggil fungsi untuk memuat detail customer lain jika perlu
    }
};

const openTshirtTypeSearch = () => { isTshirtTypeSearchVisible.value = true; };
const onTshirtTypeSelected = async (type: { jenisKaos: string }) => {
    header.value.jenisKaos = type.jenisKaos;
    isTshirtTypeSearchVisible.value = false;
    
    try {
        const response = await api.get('/price-proposal-form/tshirt-type-details', {
            params: {
                jenisKaos: type.jenisKaos,
                custom: header.value.ketersediaan === 'Custom' ? 'Y' : 'N'
            }
        });
        sizeItems.value = response.data.map((item: any) => ({
            size: item.ukuran,
            qty: null,
            hargaPcs: item.hargaPcs,
            totalHarga: 0,
            kodeBarang: '',
            namaBarang: ''
        }));
    } catch (error) {
        toast.error("Gagal memuat detail harga jenis kaos.");
    }
};

const save = async () => {
    isSaving.value = true;
    
    // Validasi dasar
    if (!header.value.customerKode || !header.value.jenisKaos) {
        toast.error('Customer dan Jenis Kaos harus diisi.');
        isSaving.value = false;
        return;
    }

    // Langkah 1: Upload gambar jika ada file yang dipilih
    if (selectedFile.value) {
        const formData = new FormData();
        formData.append('proposalImage', selectedFile.value);
        formData.append('nomor', header.value.nomor); // Kirim nomor untuk penamaan file

        try {
            await api.post('/price-proposal-form/upload-image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.info('Gambar berhasil diunggah.');
        } catch (error) {
            toast.error('Gagal mengunggah gambar.');
            isSaving.value = false;
            return; // Hentikan proses jika upload gagal
        }
    }

    // Langkah 2: Simpan sisa data transaksi
    try {
        const payload = {
            header: header.value,
            details: sizeItems.value.filter(item => (item.qty || 0) > 0),
            additionalCosts: additionalCostItems.value,
            footer: footer.value,
            user: authStore.user,
            isNew: !isEditMode.value,
        };

        const response = await api.post('/price-proposal-form/save', payload);
        toast.success(response.data.message);
        router.push('/pengajuan-harga');

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data pengajuan.');
    } finally {
        isSaving.value = false;
    }
};

watch(() => header.value.isApproved, (isNowApproved) => {
    if (isNowApproved) {
        header.value.approval = authStore.user?.kode || 'UNKNOWN';
    } else {
        header.value.approval = '';
    }
});

onMounted(() => {
    if (isEditMode.value) {
        // Logika load data edit
    } else {
        // Logika untuk form baru
    }
});
</script>

<template>
    <PageLayout :title="pageTitle">
        <template #header-actions>
            <v-btn color="primary" prepend-icon="mdi-content-save" @click="save" :loading="isSaving">Simpan</v-btn>
            <v-btn prepend-icon="mdi-cancel">Batal</v-btn>
            <v-btn @click="router.push('/pengajuan-harga')" prepend-icon="mdi-close">Tutup</v-btn>
        </template>

        <!-- Header Form -->
        <v-card class="mb-4">
            <v-card-text>
                <v-row>
                    <!-- Kolom Kiri: Info Utama -->
                    <v-col cols="12" md="9">
                        <v-row dense>
                            <v-col cols="12" md="4"><v-text-field label="Nomor" v-model="header.nomor" readonly variant="filled" density="compact"></v-text-field></v-col>
                            <v-col cols="12" md="4"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined" density="compact"></v-text-field></v-col>
                            <v-col cols="12" md="4">
                                <v-checkbox v-model="header.isApproved" :label="`Approval: ${header.approval}`" density="compact" hide-details></v-checkbox>
                            </v-col>
                            <v-col cols="12" md="4">
                                <v-text-field
                                    label="Kode Customer"
                                    v-model="header.customerKode"
                                    placeholder="Ketik kode atau F1..."
                                    @keydown.f1.prevent="openCustomerSearch"
                                    variant="outlined" density="compact"
                                    append-inner-icon="mdi-magnify"
                                    @click:append-inner="openCustomerSearch"
                                ></v-text-field>
                            </v-col>
                            <v-col cols="12" md="8">
                                 <v-text-field
                                    label="Nama Customer"
                                    :model-value="header.customerNama"
                                    readonly
                                    variant="filled" density="compact"
                                ></v-text-field>
                            </v-col>
                            <v-col cols="12" md="8"><v-text-field label="Keterangan" v-model="header.keterangan" variant="outlined" density="compact"></v-text-field></v-col>
                            <v-col cols="12" md="4"><v-radio-group v-model="header.ketersediaan" inline hide-details density="compact"><v-radio label="Stok Showroom" value="Stok"></v-radio><v-radio label="Custom" value="Custom"></v-radio></v-radio-group></v-col>
                            <v-col cols="12" md="8">
                                <v-text-field
                                    label="Jenis Kaos"
                                    v-model="header.jenisKaos"
                                    readonly
                                    placeholder="Tekan F1 atau klik..."
                                    @click="openTshirtTypeSearch"
                                    @keydown.f1.prevent="openTshirtTypeSearch"
                                    variant="outlined" density="compact"
                                    append-inner-icon="mdi-magnify"
                                ></v-text-field>
                            </v-col>
                        </v-row>
                    </v-col>
                    
                    <!-- Kolom Kanan: Upload Gambar -->
                    <v-col cols="12" md="3">
                         <v-card variant="tonal" class="h-100 d-flex flex-column">
                             <v-card-text class="flex-grow-1 text-center">
                                <v-img :src="imagePreview" v-if="imagePreview" max-height="150" contain class="mb-4"></v-img>
                                <div v-else class="text-center text-grey my-10">
                                    <v-icon size="48">mdi-image-outline</v-icon>
                                    <div>No Image</div>
                                </div>
                             </v-card-text>
                             <v-file-input 
                                label="Upload Gambar (Max. 500 KB)" 
                                @change="onFileChange"
                                accept="image/jpeg, image/png"
                                variant="solo-filled"
                                density="compact"
                                hide-details
                             ></v-file-input>
                         </v-card>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>

        <!-- Tabs untuk Detail -->
        <v-tabs v-model="activeTab" bg-color="primary-lighten-5" class="mb-4 rounded-t">
            <v-tab value="pengajuan">Pengajuan Harga</v-tab>
            <v-tab value="bordir">Bordir</v-tab>
            <v-tab value="dtf">DTF</v-tab>
            <v-tab value="gambar">Lihat Gambar</v-tab>
        </v-tabs>

        <v-window v-model="activeTab">
            <v-window-item value="pengajuan">
                <v-row>
                    <v-col md="8">
                        <v-card title="Qty Order / Harga Pcs">
                            <v-data-table 
                                :items="sizeItems"
                                :headers="[
                                    { title: 'Size', key: 'size' },
                                    { title: 'Qty Order', key: 'qty' },
                                    { title: 'Harga/Pcs', key: 'hargaPcs', align: 'end' },
                                    { title: 'Total Harga', key: 'totalHarga', align: 'end' },
                                    { title: 'Kode Barang', key: 'kodeBarang' },
                                    { title: 'Nama Barang', key: 'namaBarang' },
                                ]"
                                no-data-text="Pilih Jenis Kaos untuk menampilkan data"
                            >
                                <template #item.qty="{ item, index }">
                                    <v-text-field v-model.number="sizeItems[index].qty" type="number" variant="underlined" dense hide-details></v-text-field>
                                </template>
                            </v-data-table>
                        </v-card>
                    </v-col>
                    <v-col md="4">
                        <v-card title="Harga Tambahan">
                             <v-data-table :items="additionalCostItems" no-data-text="Tekan F1 untuk menambah item"></v-data-table>
                        </v-card>
                    </v-col>
                </v-row>
            </v-window-item>
            <v-window-item value="bordir"> <!-- ... --> </v-window-item>
            <v-window-item value="dtf"> <!-- ... --> </v-window-item>
            <v-window-item value="gambar">
                <v-card>
                    <v-card-text class="text-center">
                        <v-img :src="imagePreview" v-if="imagePreview" max-height="400" contain class="mb-4 border"></v-img>
                        <div v-else class="text-grey pa-8">Tidak ada gambar yang diunggah.</div>
                    </v-card-text>
                </v-card>
            </v-window-item>
        </v-window>

        <!-- Footer Form -->
        <v-card class="mt-4">
            <v-card-text>
                <v-row justify="end">
                    <v-col md="4">
                        <v-text-field label="Harga Bruto" v-model="footer.hargaBruto" readonly variant="filled"></v-text-field>
                        <v-text-field label="Diskon" v-model="footer.diskon" readonly variant="filled"></v-text-field>
                        <v-text-field label="Harga Netto" v-model="footer.hargaNetto" readonly variant="filled" class="font-weight-bold"></v-text-field>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>
        
        <!-- Modals -->
        <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="authStore.user?.cabang || ''" @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
        <TshirtTypeSearchModal v-if="isTshirtTypeSearchVisible" :custom-type="header.ketersediaan === 'Custom' ? 'Y' : 'N'" @close="isTshirtTypeSearchVisible = false" @type-selected="onTshirtTypeSelected" />
    </PageLayout>
</template>


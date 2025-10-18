<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import type { AxiosError } from 'axios';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import JenisKainSearchModal from '@/components/JenisKainSearchModal.vue';
import WarnaKainSearchModal from '@/components/WarnaKainSearchModal.vue';

// --- Tipe Data ---
interface VarianItem {
    id: number;
    no: string;
    aktif: boolean;
    ukuran: string;
    hpp: number;
    harga: number;
    barcode: string;
    stokmin: number;
    stokmax: number;
    stokmindc: number;
    stokmaxdc: number;
}
interface Header {
    kode: string;
    nama: string;
    jenisKaos: string;
    tipe: string;
    lengan: string;
    jenisKain: string;
    jenisKainKode: string;
    warna: string;
    warnaKode: string;
    kategoriProduk: string;
    status: number;
    logStok: 'Y' | 'N';
    bcdId: number;
    gambarUrl: string | null;
}
interface HistoryHargaItem {
    tanggal: string;
    allsize: number | null;
    s: number | null;
    m: number | null;
    l: number | null;
    xl: number | null;
}


// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '204';
const isEditMode = computed(() => !!route.params.kode);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Barang DC' : 'Buat Barang DC');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const header = reactive<Header>({
    kode: '', nama: '', jenisKaos: '', tipe: '', lengan: '', jenisKain: '', jenisKainKode: '',
    warna: '', warnaKode: '', kategoriProduk: 'REGULER', status: 0, logStok: 'Y', bcdId: 0, gambarUrl: null
});
const varianItems = ref<VarianItem[]>([]);
const historyHarga = ref<HistoryHargaItem[]>([]);
const options = reactive({ jenisKaos: [], tipe: [], lengan: [] });
const isLoading = ref(true);
const isSaving = ref(false);
const imageFile = ref<File | null>(null);
const imagePreview = ref<string | null>(null);
const isImageUploading = ref(false);
const isImageFullscreenVisible = ref(false);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });
const dialogs = reactive({
    jenisKain: false,
    warnaKain: false,
});

const varianHeaders = [
    { title: 'Aktif', key: 'aktif', width: '80px' },
    { title: 'Ukuran', key: 'ukuran' },
    { title: 'HPP', key: 'hpp', width: '150px' },
    { title: 'Harga Jual', key: 'harga', width: '150px' },
    { title: 'Barcode', key: 'barcode', width: '200px' },
    { title: 'Stok Min Store', key: 'stokmin', width: '150px' },
    { title: 'Stok Max Store', key: 'stokmax', width: '150px' },
    { title: 'Stok Min DC', key: 'stokmindc', width: '150px' },
    { title: 'Stok Max DC', key: 'stokmaxdc', width: '150px' },
] as const;
const historyHeaders = [
    { title: 'Tanggal', key: 'tanggal' },
    { title: 'Allsize', key: 'allsize', align: 'end' },
    { title: 'S', key: 's', align: 'end' },
    { title: 'M', key: 'm', align: 'end' },
    { title: 'L', key: 'l', align: 'end' },
    { title: 'XL', key: 'xl', align: 'end' },
] as const;

// --- Helper Functions ---
const getFullImageUrl = (path: string | null) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `${import.meta.env.VITE_API_BASE_URL}${path}`;
};

const generateNamaBarang = () => {
    header.nama = `${header.jenisKaos.substring(0, 2)} ${header.tipe} ${header.lengan} ${header.jenisKain} ${header.warna}`.trim();
};

const handleFileSelection = async () => {
    await nextTick();

    const file = imageFile.value;

    if (!file) {
        imagePreview.value = header.gambarUrl ? getFullImageUrl(header.gambarUrl) : null;
        return;
    }

    // Validasi ukuran
    if (file.size > 500 * 1024) {
        toast.error("Ukuran file tidak boleh lebih dari 500KB.");
        imageFile.value = null;
        return;
    }

    // Validasi tipe
    if (!["image/jpeg", "image/jpg", "image/png", "image/gif"].includes(file.type)) {
        toast.error("Tipe file tidak valid. Gunakan JPG, PNG, atau GIF.");
        imageFile.value = null;
        return;
    }

    // Jika dalam mode edit dan sudah ada kode, langsung upload
    if (header.kode) {
        await uploadImageToServer(header.kode);
    } else {
        // Jika mode tambah baru, hanya buat preview sementara
        imagePreview.value = URL.createObjectURL(file);
        toast.info("Gambar akan diupload setelah data disimpan");
    }
};

const uploadImageToServer = async (kode: string): Promise<boolean> => {
    if (!imageFile.value) return true;

    isImageUploading.value = true;
    try {
        const formData = new FormData();
        formData.append("image", imageFile.value);

        // Pastikan endpoint ini sesuai dengan route backend
        const response = await api.post(`/barang-dc-form/upload-image/${kode}`, formData, {
            headers: { "Content-Type": "multipart/form-data" }
        });

        if (response.data.success) {
            header.gambarUrl = response.data.imageUrl;

            if (imagePreview.value && imagePreview.value.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreview.value);
            }

            imagePreview.value = getFullImageUrl(response.data.imageUrl);
            imageFile.value = null;

            toast.success("Gambar berhasil diunggah");
            return true;
        } else {
            throw new Error(response.data.message || "Upload gagal");
        }
    } catch (error: unknown) {
        console.error('Upload error:', error);

        const axiosError = error as AxiosError<{ message?: string }>;
        const message = axiosError.response?.data?.message || axiosError.message || 'Upload gagal';

        toast.error("Upload gagal: " + message);
        return false;
    }
};

const clearImage = () => {
    if (imagePreview.value && imagePreview.value.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview.value);
    }
    imagePreview.value = null;
    imageFile.value = null;
    header.gambarUrl = null;
};

const save = async () => {
    // --- VALIDASI DARI DELPHI (btnSimpanClick) ---
    if (!header.kategoriProduk) {
        return toast.error('Kategori produk belum dipilih.');
    }
    if (!isEditMode.value) { // Validasi ini hanya untuk data baru
        if (!header.jenisKaos) return toast.error('Jenis kaos kosong, tidak dapat disimpan.');
        if (!header.tipe) return toast.error('Tipe kaos kosong, tidak dapat disimpan.');
        if (!header.lengan) return toast.error('Lengan kaos kosong, tidak dapat disimpan.');
        if (!header.jenisKain) return toast.error('Jenis kain kosong, tidak dapat disimpan.');
        if (!header.warna) return toast.error('Warna kosong, tidak dapat disimpan.');
    }
    if (!varianItems.value.some(v => v.aktif)) {
        return toast.error('Ukuran belum dipilih. Centang minimal satu pada kolom "Aktif".');
    }
    // --- AKHIR VALIDASI ---

    // Cek duplikasi hanya untuk data baru (opsional, backend sudah menangani ini)
    if (!isEditMode.value) {
        try {
            // Kita bisa buat endpoint baru untuk cek duplikasi sebelum menyimpan
            // await api.post('/barang-dc-form/check-duplicate', { header });
        } catch (error: unknown) {
            const axiosError = error as AxiosError<{ message?: string }>;
            const message = axiosError.response?.data?.message || axiosError.message || 'Error cek duplikasi.';
            toast.error(message);
            return;
        }
    }

    showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data Barang DC ini?', executeSave);
};

const executeSave = async () => {
    isSaving.value = true;
    try {
        const activeVariants = varianItems.value.filter(v => v.aktif);
        const payload = {
            header,
            variants: activeVariants,
            isNew: !isEditMode.value
        };

        const response = await api.post('/barang-dc-form/save', payload);
        const newCode = response.data.kode;
        toast.success(response.data.message);

        // Handle upload gambar SETELAH berhasil menyimpan
        if (imageFile.value && newCode) {
            const uploadSuccess = await uploadImageToServer(newCode);
            if (!uploadSuccess) {
                toast.warning("Data berhasil disimpan, tapi gambar gagal diunggah.");
            }
        }

        // Redirect ke halaman browse
        router.push({ name: 'BarangDc' });

    } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        const message = axiosError.response?.data?.message || axiosError.message || 'Gagal menyimpan data.';
        toast.error(message);
    } finally {
        isSaving.value = false;
    }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
    dialogConfirm.title = title;
    dialogConfirm.text = text;
    dialogConfirm.onConfirm = onConfirm;
    dialogConfirm.show = true;
};
const closeForm = () => {
    router.push({ name: 'BarangDc' }); // Arahkan ke halaman browse
};
const resetForm = () => {
    Object.assign(header, {
        kode: '', nama: '', jenisKaos: options.jenisKaos[0] || '', tipe: options.tipe[0] || '',
        lengan: options.lengan[0] || '', jenisKain: '', jenisKainKode: '', warna: '', warnaKode: '',
        kategoriProduk: 'REGULER', status: 0, logStok: 'Y', bcdId: 0, gambarUrl: null
    });
    varianItems.value.forEach(v => {
        v.aktif = false;
        v.hpp = 0;
        v.harga = 0;
        v.barcode = '';
        v.stokmin = 0;
        v.stokmax = 0;
        v.stokmindc = 0;
        v.stokmaxdc = 0;
    });
    imageFile.value = null; // ✅ Ubah dari [] ke null
    imagePreview.value = null;
    toast.info('Form telah dibersihkan.');
};

const loadDataForEdit = async (kode: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/barang-dc-form/${kode}`);
        const data = response.data;

        // --- ISI DATA HEADER ---
        header.kode = data.header.brg_kode;
        header.bcdId = data.header.brg_bcdid;
        header.jenisKaos = data.header.jenisorder;
        header.tipe = data.header.brg_tipe;
        header.lengan = data.header.brg_lengan;
        header.jenisKain = data.header.brg_jeniskain;
        header.jenisKainKode = data.header.jenisKainKode;
        header.warna = data.header.brg_warna;
        header.warnaKode = data.header.warnaKode;
        header.kategoriProduk = data.header.brg_ktgp;
        header.status = data.header.brg_aktif;
        header.logStok = data.header.brg_logstok;
        imagePreview.value = data.header.gambarUrl; // Tampilkan gambar yang sudah ada
        header.gambarUrl = data.header.gambarUrl;

        // --- ISI GRID VARIAN ---
        varianItems.value.forEach(varianDefault => {
            const savedVarian = data.variants.find(v => v.brgd_ukuran === varianDefault.ukuran);
            if (savedVarian) {
                varianDefault.aktif = true;
                varianDefault.hpp = savedVarian.brgd_hpp;
                varianDefault.harga = savedVarian.brgd_harga;
                varianDefault.barcode = savedVarian.brgd_barcode;
                varianDefault.stokmin = savedVarian.brgd_min;
                varianDefault.stokmax = savedVarian.brgd_max;
                varianDefault.stokmindc = savedVarian.brgd_mindc;
                varianDefault.stokmaxdc = savedVarian.brgd_maxdc;
            }
        });

        // --- ISI GRID HISTORY HARGA ---
        historyHarga.value = data.priceHistory;

    } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        const message = axiosError.response?.data?.message || axiosError.message || 'Gagal memuat data.';
        toast.error(message);
        router.back();
    } finally {
        isLoading.value = false;
    }
};

const onJenisKainSelected = (item: { nama: string; Kode: string }) => {
    header.jenisKain = item.nama;
    header.jenisKainKode = item.Kode;
    dialogs.jenisKain = false;
};

const onWarnaKainSelected = (item: { nama: string; Kode: string }) => {
    header.warna = item.nama;
    header.warnaKode = item.Kode;
    dialogs.warnaKain = false;
};

const handleAktifChange = async (item: VarianItem) => {
    // Hanya jalankan jika checkbox diaktifkan
    if (!item.aktif) return;

    // Logika penentuan tipe warna dan lengan dari Delphi
    let warnaType = 'WARNA';
    if (header.warna === 'HITAM') {
        warnaType = 'HITAM';
    } else if (['PUTIH', 'PUTIH TULANG'].includes(header.warna)) {
        warnaType = 'PUTIH';
    }

    let lenganType = '';
    if (header.lengan.includes('PENDEK')) {
        lenganType = 'PENDEK';
    } else if (header.lengan.includes('PANJANG')) {
        lenganType = 'PANJANG';
    }

    try {
        // Panggil API untuk Store dan DC secara bersamaan
        const [storeBuffer, dcBuffer] = await Promise.all([
            api.get('/barang-dc-form/lookup/buffer', { params: { cabType: 'STORE', warnaType, lenganType, ukuran: item.ukuran } }),
            api.get('/barang-dc-form/lookup/buffer', { params: { cabType: 'DC', warnaType, lenganType, ukuran: item.ukuran } })
        ]);

        // Update nilai di grid
        item.stokmin = storeBuffer.data.min;
        item.stokmax = storeBuffer.data.max;
        item.stokmindc = dcBuffer.data.min;
        item.stokmaxdc = dcBuffer.data.max;

    } catch (error) {
        toast.error('Gagal mengambil data buffer stok otomatis.', error);
    }
};

const updateAllActiveBuffers = async () => {
    // Ambil semua item yang sudah dicentang aktif
    const activeItems = varianItems.value.filter(item => item.aktif);
    if (activeItems.length === 0) return;

    toast.info('Memperbarui nilai buffer stok otomatis...');
    for (const item of activeItems) {
        // Panggil kembali logika yang sama seperti di handleAktifChange
        // Anda bisa membuat ini menjadi fungsi terpisah agar tidak duplikat kode
        await handleAktifChange(item);
    }
};


onMounted(async () => {
    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data ini.`);
        router.back();
        return;
    }

    isLoading.value = true;
    try {
        const response = await api.get('/barang-dc-form/initial-data');
        options.jenisKaos = response.data.jenisKaos;
        options.tipe = response.data.tipe;
        options.lengan = response.data.lengan;
        varianItems.value = response.data.ukuran.map(u => ({
            id: Math.random(), aktif: false, ukuran: u.ukuran, no: u.kode,
            hpp: 0, harga: 0, barcode: '', stokmin: 0, stokmax: 0, stokmindc: 0, stokmaxdc: 0
        }));

        const kode = route.params.kode as string;
        if (isEditMode.value && kode) {
            await loadDataForEdit(kode);
        }
    } catch (error) {
        toast.error('Gagal memuat data inisial.', error);
    } finally {
        isLoading.value = false;
    }
});

watch(
    [() => header.jenisKaos, () => header.tipe, () => header.lengan, () => header.jenisKain, () => header.warna],
    () => {
        generateNamaBarang();
        updateAllActiveBuffers(); // <-- PANGGIL FUNGSI BARU DI SINI
    }
);
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-tshirt-crew">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="save" :loading="isSaving"
                :disabled="!authStore.can(MENU_ID, requiredPermission)">
                Simpan
            </v-btn>
            <v-btn size="small"
                @click="showConfirmation('Konfirmasi Batal', 'Batalkan semua perubahan dan kosongkan form?', resetForm)">
                Batal
            </v-btn>
            <v-btn size="small"
                @click="showConfirmation('Konfirmasi Tutup', 'Tutup form? Perubahan yang belum disimpan akan hilang.', closeForm)">
                Tutup
            </v-btn>
        </template>

        <div class="form-grid-container">
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-row dense>
                        <v-col cols="6"><v-text-field label="Kode" v-model="header.kode" readonly filled
                                density="compact" hide-details /></v-col>
                        <v-col cols="6"><v-text-field label="ID Barcode" v-model="header.bcdId" density="compact"
                                hide-details variant="outlined" /></v-col>
                        <v-col cols="12"><v-text-field label="Nama Barang" v-model="header.nama" readonly filled
                                density="compact" hide-details /></v-col>
                        <v-col cols="6"><v-select label="Kategori Produk" v-model="header.kategoriProduk"
                                :items="['REGULER', 'PESANAN', 'SESIONAL']" variant="outlined" density="compact"
                                hide-details /></v-col>
                        <v-col cols="6"><v-select label="Jenis Kaos" v-model="header.jenisKaos"
                                :items="options.jenisKaos" variant="outlined" density="compact" hide-details
                                :readonly="isEditMode" /></v-col>
                        <v-col cols="6"><v-select label="Tipe" v-model="header.tipe" :items="options.tipe"
                                variant="outlined" density="compact" hide-details :readonly="isEditMode" /></v-col>
                        <v-col cols="6"><v-select label="Lengan" v-model="header.lengan" :items="options.lengan"
                                variant="outlined" density="compact" hide-details :readonly="isEditMode" /></v-col>
                        <v-col cols="6">
                            <v-text-field label="Jenis Kain" v-model="header.jenisKain" variant="outlined"
                                density="compact" hide-details :readonly="isEditMode" append-inner-icon="mdi-magnify"
                                @click:append-inner="dialogs.jenisKain = true" />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Warna" v-model="header.warna" variant="outlined" density="compact"
                                hide-details :readonly="isEditMode" append-inner-icon="mdi-magnify"
                                @click:append-inner="dialogs.warnaKain = true" />
                        </v-col>
                        <v-col cols="6">
                            <label class="v-label text-caption">Status</label>
                            <v-radio-group v-model="header.status" inline hide-details>
                                <v-radio label="Aktif" :value="0" />
                                <v-radio label="Pasif" :value="1" />
                            </v-radio-group>
                        </v-col>
                        <v-col cols="6">
                            <label class="v-label text-caption">Ada Stok</label>
                            <v-radio-group v-model="header.logStok" inline hide-details>
                                <v-radio label="Ya" value="Y" />
                                <v-radio label="Tidak" value="N" />
                            </v-radio-group>
                        </v-col>
                        <v-col cols="12" class="mt-2">
                            <label class="v-label text-caption">Upload Gambar</label>
                            <div class="d-flex align-center ga-2 mt-1">
                                <v-file-input v-model="imageFile" label="Max 500 KB" variant="outlined"
                                    density="compact" hide-details prepend-icon="" prepend-inner-icon="mdi-camera"
                                    accept="image/jpeg,image/png" :loading="isImageUploading"
                                    :disabled="isImageUploading" @update:model-value="handleFileSelection" />
                                <v-btn @click="clearImage" :disabled="!imagePreview || isImageUploading"
                                    icon="mdi-delete" size="small" variant="tonal" color="error" title="Hapus Gambar" />
                            </div>
                        </v-col>
                        <v-col cols="12">
                            <v-img v-if="imagePreview" :src="imagePreview" class="border rounded mt-2 cursor-pointer"
                                height="150" cover @click="imagePreview ? isImageFullscreenVisible = true : null"
                                title="Klik untuk memperbesar">
                                <v-overlay v-if="isImageUploading" contained persistent
                                    class="d-flex align-center justify-center">
                                    <div class="text-center text-white">
                                        <v-progress-circular indeterminate color="primary" size="40" />
                                        <div class="mt-2">Mengunggah...</div>
                                    </div>
                                </v-overlay>
                            </v-img>
                            <div v-else class="border rounded mt-2 d-flex align-center justify-center bg-grey-lighten-4"
                                style="height: 150px;">
                                <div class="text-center text-grey">
                                    <v-icon size="32">mdi-image-outline</v-icon>
                                    <div>Preview Gambar</div>
                                </div>
                            </div>
                            <div v-if="imageFile || header.gambarUrl" class="mt-2">
                                <v-chip v-if="imageFile" size="small" color="warning" variant="tonal">
                                    <v-icon start size="small">mdi-clock-outline</v-icon>
                                    Belum tersimpan
                                </v-chip>
                                <v-chip v-else-if="header.gambarUrl && imagePreview" size="small" color="success"
                                    variant="tonal">
                                    <v-icon start size="small">mdi-check</v-icon>
                                    Tersimpan di server
                                </v-chip>
                            </div>
                        </v-col>
                    </v-row>
                </div>
            </div>
            <div class="right-column">
                <div class="text-subtitle-1 font-weight-bold">Varian Ukuran</div>
                <div class="desktop-form-section varian-section">
                    <v-data-table :headers="varianHeaders" :items="varianItems" class="desktop-table" density="compact"
                        fixed-header :items-per-page="-1">
                        <template #[`item.aktif`]="{ item }">
                            <v-checkbox-btn v-model="item.aktif" hide-details density="compact"
                                @update:model-value="handleAktifChange(item)" />
                        </template>
                        <template #[`item.hpp`]="{ item }">
                            <v-text-field v-model.number="item.hpp" type="number" variant="underlined" density="compact"
                                hide-details class="text-end" :disabled="!item.aktif" />
                        </template>
                        <template #[`item.harga`]="{ item }">
                            {{ new Intl.NumberFormat('id-ID').format(item.harga) }}
                        </template>
                        <template #[`item.barcode`]="{ item }">
                            <v-text-field v-model="item.barcode" variant="underlined" density="compact" hide-details
                                :disabled="!item.aktif" />
                        </template>
                        <template #[`item.stokmin`]="{ item }">
                            <v-text-field v-model.number="item.stokmin" type="number" variant="underlined"
                                density="compact" hide-details class="text-end" :disabled="!item.aktif" />
                        </template>
                        <template #[`item.stokmax`]="{ item }">
                            <v-text-field v-model.number="item.stokmax" type="number" variant="underlined"
                                density="compact" hide-details class="text-end" :disabled="!item.aktif" />
                        </template>
                        <template #[`item.stokmindc`]="{ item }">
                            <v-text-field v-model.number="item.stokmindc" type="number" variant="underlined"
                                density="compact" hide-details class="text-end" :disabled="!item.aktif" />
                        </template>
                        <template #[`item.stokmaxdc`]="{ item }">
                            <v-text-field v-model.number="item.stokmaxdc" type="number" variant="underlined"
                                density="compact" hide-details class="text-end" :disabled="!item.aktif" />
                        </template>
                        <template #bottom></template>
                    </v-data-table>
                </div>

                <div class="text-subtitle-1 font-weight-bold mt-4">History Perubahan Harga Jual</div>
                <div class="desktop-form-section history-section">
                    <v-data-table :headers="historyHeaders" :items="historyHarga" class="desktop-table"
                        density="compact" fixed-header :items-per-page="-1">
                        <template #bottom></template>
                    </v-data-table>
                </div>
            </div>
        </div>

        <JenisKainSearchModal v-if="dialogs.jenisKain" @close="dialogs.jenisKain = false"
            @jenis-kain-selected="onJenisKainSelected" />
        <WarnaKainSearchModal v-if="dialogs.warnaKain" @close="dialogs.warnaKain = false"
            @warna-kain-selected="onWarnaKainSelected" />

        <!-- Fullscreen Image Modal -->
        <v-dialog v-model="isImageFullscreenVisible" max-width="90vw">
            <v-card>
                <v-toolbar density="compact" color="primary" dark>
                    <v-toolbar-title>
                        <v-icon start>mdi-image</v-icon>
                        Preview Gambar - {{ header.kode || 'Barang Baru' }}
                    </v-toolbar-title>
                    <v-spacer />
                    <v-btn icon="mdi-close" @click="isImageFullscreenVisible = false" variant="text" />
                </v-toolbar>

                <v-card-text class="pa-4 bg-grey-lighten-4">
                    <div class="d-flex justify-center align-center" style="min-height: 60vh;">
                        <v-img :src="imagePreview" max-height="80vh" max-width="100%" contain
                            class="rounded elevation-2" />
                    </div>
                </v-card-text>

                <v-card-actions class="justify-space-between pa-4">
                    <div>
                        <v-chip v-if="imageFile" size="small" color="warning" variant="tonal">
                            <v-icon start size="small">mdi-clock-outline</v-icon>
                            Belum tersimpan
                        </v-chip>
                        <v-chip v-else-if="header.gambarUrl" size="small" color="success" variant="tonal">
                            <v-icon start size="small">mdi-check-circle</v-icon>
                            Tersimpan di server
                        </v-chip>
                    </div>
                    <v-btn color="primary" @click="isImageFullscreenVisible = false" prepend-icon="mdi-close"
                        variant="tonal">
                        Tutup
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal"
                        @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">
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

.image-upload-section {
    background-color: #fafafa;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 16px;
}

.image-preview-container {
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
}

.cursor-pointer {
    cursor: pointer;
    transition: opacity 0.2s;
}

.cursor-pointer:hover {
    opacity: 0.9;
}

.desktop-table {
    font-size: 11px;
    flex-grow: 1;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 32px !important;
}

.desktop-table :deep(input) {
    font-size: 11px !important;
}

.text-end {
    text-align: right;
}

.right-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
}

.varian-section {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.varian-section .desktop-table {
    overflow-y: auto;
    flex: 1;
}

.history-section {
    flex-shrink: 0;
    max-height: 200px;
    overflow: hidden;
}

.history-section .desktop-table {
    overflow-y: auto;
}
</style>
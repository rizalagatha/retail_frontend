<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/CustomerSearchModal.vue';
import TshirtTypeSearchModal from '@/components/TshirtTypeSearchModal.vue';
import ProductVariantSearchModal from '@/components/ProductVariantSearchModal.vue';
import AdditionalCostSearchModal from '@/components/AdditionalCostSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useRoute } from 'vue-router';
import { format } from 'date-fns';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = '38';

// --- Interfaces ---
interface SizeItem {
    size: string;
    qty: number | null;
    hargaPcs: number;
    hargaKaos: number;
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

interface AdditionalCostItem {
    id: number;
    tambahan: string;
    harga: number;
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
const additionalCostItems = ref<AdditionalCostItem[]>([]);
const imagePreview = ref<string | null>(null);
const selectedFile = ref<File | null>(null);
const footer = ref({
    hargaBruto: 0,
    diskon: 0,
    hargaNetto: 0
});

const bordirCost = ref(0);
const dtfCost = ref(0);

const isCustomerSearchVisible = ref(false);
const isTshirtTypeSearchVisible = ref(false);
const isSaving = ref(false);

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah Pengajuan Harga: ${header.value.nomor}` : 'Buat Pengajuan Harga');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const isProductVariantSearchVisible = ref(false);
const activeItemIndexForProductSearch = ref(0);

const isUpdateAllConfirmVisible = ref(false);
const selectedProductForUpdate = ref<{ Kode: string, Nama: string } | null>(null);

const isAdditionalCostSearchVisible = ref(false);
const activeAdditionalCostIndex = ref(0);

const totalHargaTambahan = computed(() => {
    return additionalCostItems.value.reduce((sum, item) => sum + (item.harga || 0), 0);
});

const bordirItems = ref(
    Array.from({ length: 8 }, () => ({ p: 0, l: 0 }))
);
const biayaPerCmBordir = ref(0);
const bordirMinCharge = ref(3000);
const totalLuasBordir = computed(() => {
    return bordirItems.value.reduce((total, item) => {
        return total + ((item.p || 0) * (item.l || 0));
    }, 0);
});

const dtfItems = ref(
    Array.from({ length: 8 }, () => ({ p: 0, l: 0 }))
);
const biayaPerCmDtf = ref(0);
const dtfMinCharge = ref(3000);

const totalHargaBordir = computed(() => {
    return Math.round(totalLuasBordir.value * (biayaPerCmBordir.value || 0));
});

const totalLuasDtf = computed(() => {
    return dtfItems.value.reduce((total, item) => {
        return total + ((item.p || 0) * (item.l || 0));
    }, 0);
});

const totalHargaDtf = computed(() => {
    return Math.round(totalLuasDtf.value * (biayaPerCmDtf.value || 0));
});

const isSaveConfirmVisible = ref(false);
const isCancelConfirmVisible = ref(false);

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

        // --- BLOK DEBUGGING ---
        console.log("Data diterima dari API:", response.data);
        // --- AKHIR BLOK DEBUGGING ---

        // Map data ukuran seperti biasa
        if (response.data && Array.isArray(response.data.sizes)) {
            sizeItems.value = response.data.sizes.map((item: any) => ({
                id: Date.now() + Math.random(),
                size: item.ukuran, 
                qty: null, 
                hargaPcs: item.hargaPcs, 
                totalHarga: 0,
                hargaKaos: 0,
                kodeBarang: '',
                namaBarang: ''
            }));
        }
        
        // Ambil data biaya dari respons
        const costs = response.data.costs;
        
        // Pastikan objek costs ada sebelum diakses
        if (costs) {
            if (costs.bordir) {
                biayaPerCmBordir.value = costs.bordir.cm || 0;
                bordirMinCharge.value = costs.bordir.min || 0;
            }
            if (costs.dtf) {
                biayaPerCmDtf.value = costs.dtf.cm || 0;
                dtfMinCharge.value = costs.dtf.min || 0;
            }
        }

    } catch (error) {
        toast.error("Gagal memuat detail harga jenis kaos.");
        console.error("Error onTshirtTypeSelected:", error);
    }
};

const save = () => {
    // Validasi dasar dari Delphi
    if (!header.value.customerKode) {
        toast.error('Customer harus diisi.');
        return;
    }
    if (!header.value.jenisKaos) {
        toast.error('Jenis Kaos harus diisi.');
        return;
    }
    const totalQty = sizeItems.value.reduce((sum, item) => sum + (item.qty || 0), 0);
    if (totalQty === 0) {
        toast.error('Jumlah order belum diisi.');
        return;
    }

    // Jika validasi lolos, tampilkan dialog konfirmasi
    isSaveConfirmVisible.value = true;
};

const executeSave = async () => {
    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error(`Anda tidak memiliki izin untuk menyimpan data ini.`);
        isSaving.value = false;
        return;
    }

    isSaveConfirmVisible.value = false;
    isSaving.value = true;

    if (selectedFile.value) {
        const formData = new FormData();
        formData.append('proposalImage', selectedFile.value);
        formData.append('nomor', header.value.nomor);
        try {
            await api.post('/price-proposal-form/upload-image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.info('Gambar berhasil diunggah.');
        } catch (error) {
            toast.error('Gagal mengunggah gambar.');
            isSaving.value = false;
            return;
        }
    }

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

const confirmCancel = () => {
    isCancelConfirmVisible.value = true;
};

const executeCancel = () => {
    isCancelConfirmVisible.value = false;
    resetForm(); // Panggil fungsi resetForm yang sudah ada
};

const calculateTotals = async () => {
    // 1. Hitung total biaya tambahan (Bordir, DTF, dan dari tabel)
    const totalAdditionalCostsFromTable = additionalCostItems.value.reduce((sum, item) => sum + (item.harga || 0), 0);
    const totalAdditionalCost = (bordirCost.value || 0) + (dtfCost.value || 0) + totalAdditionalCostsFromTable;

    // 2. Hitung total harga kaos dan total bruto
    let brutoTotal = 0;
    sizeItems.value.forEach(item => {
        const hargaDasar = item.hargaPcs || 0;
        const qty = item.qty || 0;

        // Harga kaos = harga dasar per pcs + total biaya tambahan
        const hargaKaos = hargaDasar + totalAdditionalCost;
        item.hargaKaos = hargaKaos; // Simpan untuk ditampilkan jika perlu

        // Total per baris = harga kaos * qty
        item.totalHarga = hargaKaos * qty;

        brutoTotal += item.totalHarga;
    });

    footer.value.hargaBruto = brutoTotal;

    // 3. Ambil diskon dari backend
    try {
        const response = await api.get('/price-proposal-form/get-discount', {
            params: { bruto: brutoTotal }
        });
        footer.value.diskon = response.data.diskonRp || 0;
    } catch (error) {
        console.error("Gagal mengambil diskon:", error);
        footer.value.diskon = 0; // Reset diskon jika gagal
    }

    // 4. Hitung harga netto
    footer.value.hargaNetto = footer.value.hargaBruto - footer.value.diskon;
};

const openProductSearch = (index: number) => {
    if (!header.value.jenisKaos) {
        toast.error("Pilih 'Jenis Kaos' terlebih dahulu.");
        return;
    }
    activeItemIndexForProductSearch.value = index;
    isProductVariantSearchVisible.value = true;
};

const onProductVariantSelected = (product: { Kode: string, Nama: string }) => {
    isProductVariantSearchVisible.value = false;
    selectedProductForUpdate.value = product; // Simpan produk yang dipilih
    isUpdateAllConfirmVisible.value = true;   // Buka dialog konfirmasi
};

const handleUpdateAllConfirm = (updateAll: boolean) => {
    isUpdateAllConfirmVisible.value = false; // Tutup dialog
    const product = selectedProductForUpdate.value;
    if (!product) return;

    if (updateAll) {
        // Jika "Yes", update semua baris
        sizeItems.value.forEach(item => {
            if (item.qty !== null && item.qty > 0) { // Hanya update baris yang ada Qty
                item.kodeBarang = product.Kode;
                item.namaBarang = product.Nama;
            }
        });
    } else {
        // Jika "No", update hanya baris yang aktif
        const activeItem = sizeItems.value[activeItemIndexForProductSearch.value];
        if (activeItem) {
            activeItem.kodeBarang = product.Kode;
            activeItem.namaBarang = product.Nama;
        }
    }
    selectedProductForUpdate.value = null; // Reset
};

const addAdditionalCostRow = () => {
    additionalCostItems.value.push({
        id: Date.now(),
        tambahan: '',
        harga: 0
    });
};

const openAdditionalCostSearch = (index: number) => {
    // Meniru logic Delphi: hanya buka jika harga masih 0
    if (additionalCostItems.value[index]?.harga === 0) {
        activeAdditionalCostIndex.value = index;
        isAdditionalCostSearchVisible.value = true;
    }
};

const onAdditionalCostSelected = (cost: { tambahan: string, harga: number }) => {
    isAdditionalCostSearchVisible.value = false;

    // Cek duplikat (meniru logic Delphi)
    const isDuplicate = additionalCostItems.value.some(
        (item, index) => item.tambahan === cost.tambahan && index !== activeAdditionalCostIndex.value
    );

    if (isDuplicate) {
        toast.warning(`Harga tambahan "${cost.tambahan}" sudah diinput.`);
        return;
    }

    // Update baris yang aktif
    const activeItem = additionalCostItems.value[activeAdditionalCostIndex.value];
    if (activeItem) {
        activeItem.tambahan = cost.tambahan;
        activeItem.harga = cost.harga;
    }
};

const applyBordirCost = () => {
    let finalCost = totalHargaBordir.value;
    // Terapkan biaya minimum jika ada
    if (finalCost > 0 && finalCost < bordirMinCharge.value) {
        finalCost = bordirMinCharge.value;
    }

    // Set nilai ke `bordirCost` yang digunakan di fungsi Hitung utama
    bordirCost.value = finalCost;
    toast.success(`Biaya Bordir sebesar ${new Intl.NumberFormat('id-ID').format(finalCost)} diterapkan.`);

    // Pindah kembali ke tab utama
    activeTab.value = 'pengajuan';
};

const applyDtfCost = () => {
    let finalCost = totalHargaDtf.value;
    // Terapkan biaya minimum jika ada
    if (finalCost > 0 && finalCost < dtfMinCharge.value) {
        finalCost = dtfMinCharge.value;
    }

    // Set nilai ke `dtfCost` yang digunakan di fungsi Hitung utama
    dtfCost.value = finalCost;
    toast.success(`Biaya DTF sebesar ${new Intl.NumberFormat('id-ID').format(finalCost)} diterapkan.`);

    // Pindah kembali ke tab utama
    activeTab.value = 'pengajuan';
};

const loadOfferData = async (nomor: string) => {
    try {
        const response = await api.get(`/price-proposal-form/edit-details/${nomor}`);
        const data = response.data;

        // --- Isi state Header ---
        header.value.nomor = data.header.ph_nomor;
        header.value.tanggal = format(new Date(data.header.ph_tanggal), 'yyyy-MM-dd');
        header.value.customerKode = data.header.ph_kd_cus;
        header.value.customerNama = data.header.cus_nama;
        header.value.keterangan = data.header.ph_ket;
        header.value.jenisKaos = data.header.ph_jenis;
        // 👇 PERBAIKAN DI SINI (dari data.aheader menjadi data.header) 👇
        header.value.ketersediaan = data.header.ph_custom === 'Y' ? 'Custom' : 'Stok';
        header.value.approval = data.header.ph_apv;
        header.value.isApproved = !!data.header.ph_apv;

        // --- Isi state Bordir, DTF, dan Biaya Tambahan ---
        if (data.bordir) {
            bordirCost.value = data.bordir.phb_rpbordir || 0;
            biayaPerCmBordir.value = data.bordir.phb_cmbordir || 0;
            for (let i = 1; i <= 8; i++) {
                bordirItems.value[i - 1].p = data.bordir[`phb_bordirp${i}`] || 0;
                bordirItems.value[i - 1].l = data.bordir[`phb_bordirl${i}`] || 0;
            }
        }
        if (data.dtf) {
            dtfCost.value = data.dtf.phd_rpdtf || 0;
            biayaPerCmDtf.value = data.dtf.phd_cmdtf || 0;
            for (let i = 1; i <= 8; i++) {
                dtfItems.value[i - 1].p = data.dtf[`phd_dtfp${i}`] || 0;
                dtfItems.value[i - 1].l = data.dtf[`phd_dtfl${i}`] || 0;
            }
        }
        additionalCostItems.value = data.additionalCosts.map((c: any) => ({
            id: Date.now() + Math.random(),
            tambahan: c.pht_jenis,
            harga: c.pht_harga
        }));

        // --- Logika Pengisian Tabel Ukuran ---
        if (header.value.jenisKaos) {
            const templateSizesResponse = await api.get('/price-proposal-form/tshirt-type-details', {
                params: {
                    jenisKaos: header.value.jenisKaos,
                    custom: header.value.ketersediaan === 'Custom' ? 'Y' : 'N'
                }
            });

            const allSizeItems = templateSizesResponse.data.map((item: any) => ({
                id: Date.now() + Math.random(), size: item.ukuran, qty: null, hargaPcs: item.hargaPcs,
                hargaKaos: 0, totalHarga: 0, kodeBarang: '', namaBarang: ''
            }));

            data.sizes.forEach((savedItem: any) => {
                const itemToUpdate = allSizeItems.find(i => i.size === savedItem.phs_size);
                if (itemToUpdate) {
                    itemToUpdate.qty = savedItem.phs_jumlah;
                    itemToUpdate.hargaPcs = savedItem.phs_harga;
                    itemToUpdate.kodeBarang = savedItem.phs_kode;
                }
            });
            sizeItems.value = allSizeItems;
        } else {
            sizeItems.value = data.sizes.map((s: any) => ({
                id: Date.now() + Math.random(), size: s.phs_size, qty: s.phs_jumlah, hargaPcs: s.phs_harga,
                kodeBarang: s.phs_kode, namaBarang: '', hargaKaos: 0, totalHarga: 0
            }));
        }
        imagePreview.value = data.imageUrl;

        await nextTick();
        calculateTotals();

        toast.success(`Data untuk ${nomor} berhasil dimuat.`);

    } catch (error) {
        toast.error('Gagal memuat data pengajuan untuk diedit.');
        console.error("Load Offer Error:", error);
        router.push('/pengajuan-harga');
    }
};

watch(() => header.value.isApproved, (isNowApproved) => {
    if (isNowApproved) {
        header.value.approval = authStore.user?.kode || 'UNKNOWN';
    } else {
        header.value.approval = '';
    }
});

watch(
    [() => sizeItems.value.map(i => i.qty), bordirCost, dtfCost, additionalCostItems],
    calculateTotals,
    { deep: true }
);

onMounted(() => {
    // Cek otorisasi terlebih dahulu
    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error(`Anda tidak memiliki izin untuk ${requiredPermission.value === 'insert' ? 'membuat' : 'mengubah'} data.`);
        router.push('/pengajuan-harga'); // "Tendang" kembali ke halaman daftar
        return; // Hentikan eksekusi lebih lanjut
    }

    // Jika diizinkan, lanjutkan logika yang sudah ada
    if (isEditMode.value) {
        loadOfferData(route.params.nomor as string);
    } else {
        // Logika untuk form baru (misalnya getNextNumber)
    }
});
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-cash-plus">
        <template #header-actions>
            <v-btn size="small" color="primary" prepend-icon="mdi-content-save" @click="save"
                :loading="isSaving">Simpan</v-btn>
            <v-btn size="small" prepend-icon="mdi-cancel" @click="confirmCancel">Batal</v-btn>
            <v-btn size="small" @click="router.push('/pengajuan-harga')" prepend-icon="mdi-close">Tutup</v-btn>
        </template>

        <div class="form-grid-container">
            <!-- Kolom Kiri -->
            <div class="left-column">
                <div class="desktop-form-section">
                    <div class="header-grid">
                        <div class="grid-item-nomor"><v-text-field label="Nomor" v-model="header.nomor" readonly
                                variant="filled" density="compact" hide-details></v-text-field></div>
                        <div class="grid-item-tanggal"><v-text-field label="Tanggal" v-model="header.tanggal"
                                type="date" variant="outlined" density="compact" hide-details></v-text-field></div>
                        <div class="grid-item-approval"><v-checkbox v-model="header.isApproved"
                                :label="`Approval: ${header.approval}`" density="compact" hide-details></v-checkbox>
                        </div>
                        <div class="grid-item-upload"><v-file-input label="Upload Gambar" @change="onFileChange"
                                accept="image/jpeg, image/png" variant="outlined" density="compact" hide-details
                                prepend-icon="mdi-upload"></v-file-input></div>
                        <div class="grid-item-customer"><v-text-field label="Customer" v-model="header.customerKode"
                                placeholder="Ketik atau F1..." @keydown.f1.prevent="openCustomerSearch"
                                variant="outlined" density="compact" hide-details append-inner-icon="mdi-magnify"
                                @click:append-inner="openCustomerSearch"></v-text-field></div>
                        <div class="grid-item-customer-nama"><v-text-field :model-value="header.customerNama" readonly
                                variant="filled" density="compact" hide-details></v-text-field></div>
                        <div class="grid-item-keterangan"><v-text-field label="Keterangan" v-model="header.keterangan"
                                variant="outlined" density="compact" hide-details></v-text-field></div>
                        <div class="grid-item-radio"><v-radio-group v-model="header.ketersediaan" inline hide-details
                                density="compact"><v-radio label="Stok" value="Stok"></v-radio><v-radio label="Custom"
                                    value="Custom"></v-radio></v-radio-group></div>
                        <div class="grid-item-jenis-kaos"><v-text-field label="Jenis Kaos" v-model="header.jenisKaos"
                                readonly placeholder="Tekan F1 atau klik..." @click="openTshirtTypeSearch"
                                @keydown.f1.prevent="openTshirtTypeSearch" variant="outlined" density="compact"
                                hide-details append-inner-icon="mdi-magnify"
                                @click:append-inner="openTshirtTypeSearch"></v-text-field></div>
                    </div>
                </div>
                <div class="desktop-form-section footer-section">
                    <v-row dense>
                        <v-col md="12">
                            <v-text-field label="Harga Bruto" v-model="footer.hargaBruto" readonly variant="filled"
                                density="compact" hide-details class="summary-field"></v-text-field>
                            <v-text-field label="Diskon" v-model="footer.diskon" readonly variant="filled"
                                density="compact" hide-details class="summary-field"></v-text-field>
                            <v-text-field label="Harga Netto" v-model="footer.hargaNetto" readonly variant="filled"
                                density="compact" class="font-weight-bold summary-field" hide-details></v-text-field>
                        </v-col>
                        <v-col md="8" class="d-flex align-center">
                            <div class="text-caption text-medium-emphasis pa-2">
                                <p class="font-weight-bold">Note:</p>
                                <p>Harga Kaos = Harga/Pcs + Total Harga Tambahan.</p>
                                <p>Total Harga = Qty Order x Harga Kaos.</p>
                                <p class="mt-2 font-weight-bold">Diskon:</p>
                                <p>- Jika Harga Netto >= 3 juta dan Harga Netto < 6 juta=5% dari Harga Netto.</p>
                                        <p>- Jika Harga Netto >= 6 juta = 10% dari Harga Netto.</p>
                            </div>
                        </v-col>
                    </v-row>
                </div>
            </div>

            <!-- Kolom Kanan -->
            <div class="desktop-form-section right-column">
                <v-tabs v-model="activeTab" bg-color="grey-lighten-4" density="compact" class="tabs-header">
                    <v-tab value="pengajuan">Pengajuan Harga</v-tab>
                    <v-tab value="bordir">Bordir</v-tab>
                    <v-tab value="dtf">DTF</v-tab>
                    <v-tab value="gambar">Lihat Gambar</v-tab>
                </v-tabs>
                <v-window v-model="activeTab" class="flex-grow-1">
                    <v-window-item value="pengajuan" class="window-item">
                        <div class="d-flex fill-height">
                            <!-- Tabel utama -->
                            <div class="main-table-container">
                                <v-data-table :items="sizeItems" :headers="[
                                    { title: 'Size', key: 'size' },
                                    { title: 'Qty Order', key: 'qty' },
                                    { title: 'Harga/Pcs', key: 'hargaPcs', align: 'end' },
                                    { title: 'Harga Kaos', key: 'hargaKaos', align: 'end' },
                                    { title: 'Total Harga', key: 'totalHarga', align: 'end' },
                                    { title: 'Kode Barang', key: 'kodeBarang' },
                                    { title: 'Nama Barang', key: 'namaBarang' }
                                ]" no-data-text="Pilih Jenis Kaos untuk menampilkan data" density="compact"
                                    class="desktop-table flex-grow-1" fixed-header height="100%">
                                    <template #item.qty="{ item }">
                                        <v-text-field v-model.number="item.qty" type="number" variant="underlined" dense
                                            hide-details></v-text-field>
                                    </template>

                                    <template #item.hargaKaos="{ item }">
                                        {{ new Intl.NumberFormat('id-ID').format(item.hargaKaos || 0) }}
                                    </template>

                                    <template #item.kodeBarang="{ item }">
                                        <v-text-field v-model="item.kodeBarang" variant="underlined" dense hide-details
                                            placeholder="F1..."
                                            @keydown.f1.prevent="openProductSearch(sizeItems.indexOf(item))">
                                            <template #append-inner>
                                                <v-icon size="small"
                                                    @click="openProductSearch(sizeItems.indexOf(item))">mdi-magnify</v-icon>
                                            </template>
                                        </v-text-field>
                                    </template>
                                </v-data-table>
                            </div>
                            <!-- Side tabel -->
                            <div class="side-table-container">
                                <div
                                    class="pa-2 font-weight-medium text-caption d-flex justify-space-between align-center">
                                    <span>Harga Tambahan</span>
                                    <v-btn @click="addAdditionalCostRow" size="x-small" variant="tonal"
                                        prepend-icon="mdi-plus">Tambah</v-btn>
                                </div>
                                <v-divider></v-divider>
                                <div class="pa-2">
                                    <v-text-field label="Bordir/cm2" v-model.number="bordirCost" type="number"
                                        variant="outlined" density="compact" hide-details class="mb-2"></v-text-field>
                                    <v-text-field label="DTF/cm2" v-model.number="dtfCost" type="number"
                                        variant="outlined" density="compact" hide-details></v-text-field>
                                </div>
                                <v-divider></v-divider>
                                <v-data-table :items="additionalCostItems"
                                    :headers="[{ title: 'Keterangan', key: 'tambahan' }, { title: 'Harga', key: 'harga' }]"
                                    density="compact" class="desktop-table flex-grow-1" fixed-header height="100%"
                                    hide-default-footer>
                                    <template #item.tambahan="{ item }">
                                        <v-text-field v-model="item.tambahan" variant="underlined" dense hide-details
                                            placeholder="F1..." readonly
                                            @keydown.f1.prevent="openAdditionalCostSearch(additionalCostItems.indexOf(item))"
                                            @click="openAdditionalCostSearch(additionalCostItems.indexOf(item))"
                                            style="cursor: pointer;"></v-text-field>
                                    </template>
                                    <template #item.harga="{ item }">
                                        <span class="text-caption">{{ new Intl.NumberFormat('id-ID').format(item.harga
                                            || 0) }}</span>
                                    </template>
                                </v-data-table>
                                <div class="total-footer">
                                    <v-text-field label="Total Harga Tambahan"
                                        :model-value="new Intl.NumberFormat('id-ID').format(totalHargaTambahan)"
                                        readonly variant="filled" density="compact" hide-details
                                        class="text-right"></v-text-field>
                                </div>
                            </div>
                        </div>
                    </v-window-item>
                    <v-window-item value="bordir" class="window-item">
                        <div class="calculation-grid">
                            <div class="input-column">
                                <template v-for="(item, index) in bordirItems.slice(0, 4)" :key="index">
                                    <div class="label-cell">Bordir {{ index + 1 }}</div>
                                    <div><v-text-field v-model.number="item.p" type="number" density="compact"
                                            variant="outlined" hide-details></v-text-field></div>
                                    <div><v-text-field v-model.number="item.l" type="number" density="compact"
                                            variant="outlined" hide-details></v-text-field></div>
                                    <div class="result-cell">{{ (item.p || 0) * (item.l || 0) }}</div>
                                </template>
                            </div>
                            <div class="input-column">
                                <template v-for="(item, index) in bordirItems.slice(4, 8)" :key="index">
                                    <div class="label-cell">Bordir {{ index + 5 }}</div>
                                    <div><v-text-field v-model.number="item.p" type="number" density="compact"
                                            variant="outlined" hide-details></v-text-field></div>
                                    <div><v-text-field v-model.number="item.l" type="number" density="compact"
                                            variant="outlined" hide-details></v-text-field></div>
                                    <div class="result-cell">{{ (item.p || 0) * (item.l || 0) }}</div>
                                </template>
                            </div>
                            <div class="summary-section">
                                <v-row dense>
                                    <v-col cols="8">
                                        <v-alert density="compact" variant="tonal" class="text-caption h-100">
                                            Note: Biaya akan diterapkan ke tab "Pengajuan Harga".
                                        </v-alert>
                                    </v-col>
                                    <v-col cols="4">
                                        <v-text-field label="Luas Bordir /Cm2" :model-value="totalLuasBordir" readonly
                                            variant="filled" density="compact" hide-details></v-text-field>
                                        <v-text-field label="Biaya /Cm2" v-model.number="biayaPerCmBordir" type="number"
                                            density="compact" variant="filled" readonly hide-details></v-text-field>
                                        <v-text-field label="Total Harga"
                                            :model-value="new Intl.NumberFormat('id-ID').format(totalHargaBordir)"
                                            readonly variant="filled" density="compact" hide-details
                                            class="font-weight-bold"></v-text-field>
                                    </v-col>
                                </v-row>
                            </div>
                            <div class="button-section">
                                <v-btn size="small" color="primary" @click="applyBordirCost">OK</v-btn>
                            </div>
                        </div>
                    </v-window-item>
                    <v-window-item value="dtf" class="window-item">
                        <div class="calculation-grid">
                            <div class="input-column">
                                <template v-for="(item, index) in dtfItems.slice(0, 4)" :key="index">
                                    <div class="label-cell">DTF {{ index + 1 }}</div>
                                    <div><v-text-field v-model.number="item.p" type="number" density="compact"
                                            variant="outlined" hide-details></v-text-field></div>
                                    <div><v-text-field v-model.number="item.l" type="number" density="compact"
                                            variant="outlined" hide-details></v-text-field></div>
                                    <div class="result-cell">{{ (item.p || 0) * (item.l || 0) }}</div>
                                </template>
                            </div>
                            <div class="input-column">
                                <template v-for="(item, index) in dtfItems.slice(4, 8)" :key="index">
                                    <div class="label-cell">DTF {{ index + 5 }}</div>
                                    <div><v-text-field v-model.number="item.p" type="number" density="compact"
                                            variant="outlined" hide-details></v-text-field></div>
                                    <div><v-text-field v-model.number="item.l" type="number" density="compact"
                                            variant="outlined" hide-details></v-text-field></div>
                                    <div class="result-cell">{{ (item.p || 0) * (item.l || 0) }}</div>
                                </template>
                            </div>
                            <div class="summary-section">
                                <v-row dense>
                                    <v-col cols="8">
                                        <v-alert density="compact" variant="tonal" class="text-caption h-100">
                                            Note: Biaya akan diterapkan ke tab "Pengajuan Harga".
                                        </v-alert>
                                    </v-col>
                                    <v-col cols="4">
                                        <v-text-field label="Luas DTF /Cm2" :model-value="totalLuasDtf" readonly
                                            variant="filled" density="compact" hide-details></v-text-field>
                                        <v-text-field label="Biaya /Cm2" v-model.number="biayaPerCmDtf" type="number"
                                            density="compact" variant="filled" readonly hide-details></v-text-field>
                                        <v-text-field label="Total Harga"
                                            :model-value="new Intl.NumberFormat('id-ID').format(totalHargaDtf)" readonly
                                            variant="filled" density="compact" hide-details
                                            class="font-weight-bold"></v-text-field>
                                    </v-col>
                                </v-row>
                            </div>
                            <div class="button-section">
                                <v-btn size="small" color="primary" @click="applyDtfCost">OK</v-btn>
                            </div>
                        </div>
                    </v-window-item>
                    <v-window-item value="gambar" class="window-item">
                        <div class="image-preview-container">
                            <v-img :src="imagePreview" v-if="imagePreview" contain class="preview-image"></v-img>
                            <div v-else class="state-container">
                                <v-icon size="64" class="mb-4">mdi-image-off-outline</v-icon>
                                <h3 class="text-h6">Tidak Ada Gambar</h3>
                                <p class="body-1 mt-2">Silakan unggah gambar di form header.</p>
                            </div>
                        </div>
                    </v-window-item>
                </v-window>
            </div>
        </div>

        <!-- Modals -->
        <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="authStore.user?.cabang || ''"
            @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
        <TshirtTypeSearchModal v-if="isTshirtTypeSearchVisible"
            :custom-type="header.ketersediaan === 'Custom' ? 'Y' : 'N'" @close="isTshirtTypeSearchVisible = false"
            @type-selected="onTshirtTypeSelected" />
        <ProductVariantSearchModal v-if="isProductVariantSearchVisible" :jenis-kaos="header.jenisKaos"
            @close="isProductVariantSearchVisible = false" @product-selected="onProductVariantSelected" />
        <AdditionalCostSearchModal v-if="isAdditionalCostSearchVisible" @close="isAdditionalCostSearchVisible = false"
            @cost-selected="onAdditionalCostSelected" />

        <v-dialog v-model="isUpdateAllConfirmVisible" max-width="500px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-medium">
                    <v-icon color="primary" class="me-2">mdi-help-circle-outline</v-icon>
                    Konfirmasi Update
                </v-card-title>
                <v-card-text class="pb-0">
                    Anda memilih kode barang: <strong>{{ selectedProductForUpdate?.Kode }}</strong>.
                    <br>
                    Apakah Anda ingin menerapkan kode barang ini ke semua baris yang memiliki Qty?
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer></v-spacer>
                    <v-btn @click="handleUpdateAllConfirm(false)">Hanya Baris Ini</v-btn>
                    <v-btn color="primary" variant="elevated" @click="handleUpdateAllConfirm(true)">Ya, Update
                        Semua</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="isSaveConfirmVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6">Konfirmasi Simpan</v-card-title>
                <v-card-text>Apakah Anda yakin ingin menyimpan data pengajuan ini?</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="isSaveConfirmVisible = false">Tidak</v-btn>
                    <v-btn color="primary" variant="elevated" @click="executeSave">Ya, Simpan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="isCancelConfirmVisible" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6">Konfirmasi Batal</v-card-title>
                <v-card-text>Semua data yang belum disimpan akan hilang. Apakah Anda yakin ingin
                    membatalkan?</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="isCancelConfirmVisible = false">Tidak</v-btn>
                    <v-btn color="primary" variant="elevated" @click="executeCancel">Ya, Batal</v-btn>
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
    grid-template-columns: 450px 1fr;
    /* Kolom kiri lebar tetap, kolom kanan fleksibel */
    gap: 12px;
}

.left-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.right-column {
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.footer-section {
    margin-top: auto;
    /* Mendorong footer ke bawah kolom kiri */
}

.detail-section {
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.desktop-table {
    font-size: 11px !important;
    text-align: right;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 28px !important;
}

.desktop-table :deep(input) {
    font-size: 11px !important;
    /* Samakan dengan font-size .desktop-table */
}

.tabs-header {
    flex-shrink: 0;
    border-bottom: 1px solid #e0e0e0;
}

.window-item {
    height: 100%;
}

.header-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    align-items: center;
}

.header-grid .grid-item-customer-nama,
.header-grid .grid-item-keterangan,
.header-grid .grid-item-jenis-kaos {
    grid-column: span 2;
}

/* Mengatur font untuk label (Nomor, Tanggal, Customer, dll.) */
.desktop-form-section :deep(.v-label) {
    font-size: 11px !important;
}

/* Mengatur font untuk teks yang diketik di dalam field */
.desktop-form-section :deep(input) {
    font-size: 12px !important;
}

/* Mengatur font untuk label pada radio button */
.desktop-form-section :deep(.v-radio-group .v-label) {
    font-size: 12px !important;
}

.main-table-container {
    width: 75%;
    /* Diperbesar dari 66.66% */
    height: 100%;
    display: flex;
    flex-direction: column;
}

.side-table-container {
    width: 25%;
    /* Diperkecil dari 33.33% */
    height: 100%;
    display: flex;
    flex-direction: column;
    border-left: 1px solid #e0e0e0;
}

.main-table-container .v-data-table,
.side-table-container .v-data-table {
    flex: 1;
    overflow-y: auto;
    /* aktifkan scroll */
}

.image-preview-container {
    padding: 16px;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}

.preview-image {
    max-width: 100%;
    max-height: 100%;
    border: 1px solid #e0e0e0;
}

.state-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #757575;
}

.summary-field {
    margin-bottom: 4px;
}

.total-footer {
    flex-shrink: 0;
    padding: 4px;
    border-top: 1px solid #e0e0e0;
    background-color: #f5f5f5;
}

.calculation-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    /* Dua kolom utama */
    grid-template-rows: auto 1fr auto;
    /* Baris untuk input, summary, dan tombol */
    gap: 16px 24px;
    padding: 16px;
    font-size: 12px;
    height: 100%;
}

.input-column {
    display: grid;
    grid-template-columns: 60px 1fr 1fr 1fr;
    gap: 8px 12px;
    align-items: center;
}

.input-column:first-child {
    grid-area: 1 / 1;
}

.input-column:nth-child(2) {
    grid-area: 1 / 2;
}

.header-cell {
    font-size: 11px;
    color: #555;
}

.label-cell {
    text-align: right;
    font-weight: 500;
}

.result-cell {
    text-align: right;
    font-weight: bold;
    font-family: monospace;
    padding: 4px 8px;
    background-color: #f5f5f5;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
}

.summary-section {
    grid-column: 1 / 3;
    /* Membentang di kedua kolom */
    grid-row: 2;
    padding-top: 8px;
    border-top: 1px solid #e0e0e0;
}

.summary-section .v-text-field {
    margin-bottom: 8px;
}

/* Bagian tombol di paling bawah */
.button-section {
    grid-column: 1 / 3;
    /* Membentang di kedua kolom */
    grid-row: 3;
    text-align: center;
}

.image-preview-container {
    padding: 16px;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #f0f0f0;
    /* Memberi latar belakang netral */
}

.preview-image {
    max-width: 100%;
    max-height: 400px;
    /* batasi tinggi maksimal */
    border: 1px solid #e0e0e0;
    background-color: white;
    object-fit: contain;
    /* biar aspect ratio tetap */
}

.state-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #757575;
}
</style>

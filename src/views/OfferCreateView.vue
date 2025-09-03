<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/CustomerSearchModal.vue';
import GudangSearchModal from '@/components/GudangSearchModal.vue';
import ProductSearchModal from '@/components/ProductSearchModal.vue';
import AuthorizationModal from '@/components/AuthorizationModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useRoute } from 'vue-router';
import { format, addDays, isValid } from 'date-fns';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

// --- Interfaces ---
interface OfferItem {
    id: number;
    kode: string;
    nama: string;
    ukuran: string;
    stok: number;
    jumlah: number;
    harga: number;
    diskonPersen: number;
    diskonRp: number;
    total: number;
    barcode: string;
    noSoDtf: string;
    noPengajuanHarga: string;
    pin: string;
}
interface Customer {
    kode: string;
    nama: string;
    alamat: string;
    kota: string;
    telp: string;
    top: number;
    level: string;
    discountRule: DiscountRule;
}

interface Gudang {
    kode: string;
    nama: string;
}

interface DiscountRule {
    diskon1: number;
    diskon2: number;
    nominal: number;
}

// --- State ---
const header = ref({
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    gudang: { kode: authStore.user?.cabang || '', nama: 'Gudang Utama' } as Gudang,
    customer: null as Customer | null,
    customerKode: '', // Tambahan: untuk menyimpan kode customer sementara
    top: 0,
    tempo: format(new Date(), 'yyyy-MM-dd'),
    ppnPersen: 0,
    keterangan: '',
});

const items = ref<OfferItem[]>([]);
const footer = ref({
    total: 0,
    diskonRp: 0,
    diskonPersen1: 0,
    diskonPersen2: 0,
    biayaKirim: 0,
    ppnRp: 0,
    netto: 0,
    grandTotal: 0,
});

const productCategory = ref('Kaosan');
const isCustomerSearchVisible = ref(false);
const isGudangSearchVisible = ref(false);
const isProductSearchVisible = ref(false);
const activeRowIndex = ref(0);
const isSaving = ref(false);
const isAuthModalVisible = ref(false);
const defaultDiscount = ref(0);
const previousDiscount = ref(0);
const isAuth2ModalVisible = ref(false);
const previousDiscount2 = ref(0);
const isItemAuthModalVisible = ref(false);
const activeItemIndexForAuth = ref(-1);
const previousItemDiscount = ref({ persen: 0, rp: 0 });

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah Penawaran: ${header.value.nomor}` : 'Buat Penawaran Baru');

const tableHeaders = [
    { title: 'Kode', key: 'kode', width: '200px' },
    { title: 'Nama Barang', key: 'nama', width: '300px' },
    { title: 'Ukuran', key: 'ukuran', width: '100px' },
    { title: 'Jml', key: 'jumlah', width: '120px' },
    { title: 'Harga', key: 'harga', width: '150px' },
    { title: 'Diskon %', key: 'diskonPersen', width: '120px' },
    { title: 'Diskon Rp', key: 'diskonRp', width: '150px' },
    { title: 'Total', key: 'total', align: 'end', width: '150px' },
    { title: 'Barcode', key: 'barcode', sortable: false },
    { title: 'No. SO DTF', key: 'noSoDtf', width: '150px' },
    { title: 'No. Pengajuan', key: 'noPengajuanHarga', width: '150px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '80px' },
];

// --- Methods ---
const getNextNumber = async () => {
    try {
        const response = await api.get(`/offer-form/next-number`, {
            params: { cabang: header.value.gudang.kode, tanggal: header.value.tanggal }
        });
        header.value.nomor = response.data.nextNumber;
    } catch (error) {
        toast.error('Gagal mendapatkan nomor baru.');
    }
};

const loadCustomerDetails = async () => {
    if (!header.value.customerKode) {
        // console.log('Tidak ada customer kode untuk dimuat');
        return;
    }

    // console.log('Loading customer details untuk kode:', header.value.customerKode);

    try {
        const response = await api.get(`/offer-form/customer-details/${header.value.customerKode}`);
        // console.log('Customer details response:', response.data);

        // Mapping data dari format API ke format frontend
        header.value.customer = {
            kode: header.value.customerKode, // Kode sudah kita punya
            nama: response.data.cus_nama || '',
            alamat: response.data.cus_alamat || '',
            kota: response.data.cus_kota || '',
            telp: response.data.cus_telp || '',
            top: response.data.cus_top || 0,
            level: response.data.xlevel 
        };

        header.value.top = response.data.cus_top || 0;
        // console.log('Customer data after mapping:', header.value.customer);
        toast.success('Detail customer berhasil dimuat.');
    } catch (error) {
        console.error('Error loading customer details:', error);
        toast.error('Gagal memuat detail customer.');
        // Reset customer jika gagal
        header.value.customer = null;
        header.value.top = 0;
    }
};

const loadOfferData = async (nomor: string) => {
    try {
        const response = await api.get(`/offer-form/edit-details/${nomor}`);
        const { headerData, itemsData, footerData } = response.data;
        
        // Isi semua state dengan data yang diterima dari server
        header.value = headerData;
        items.value = itemsData;
        footer.value = footerData;
        
        toast.success(`Data untuk penawaran ${nomor} berhasil dimuat.`);
    } catch (error) {
        toast.error('Gagal memuat data penawaran.');
        router.push('/penawaran'); // Kembali ke daftar jika gagal
    }
};

const openCustomerSearch = () => { isCustomerSearchVisible.value = true; };
const openGudangSearch = () => { isGudangSearchVisible.value = true; };

// Perbaikan: Hanya menerima kode customer dari modal
const onCustomerSelected = async (customer: Customer) => {
    isCustomerSearchVisible.value = false;
    try {
        const response = await api.get(`/offer-form/customer-details/${customer.kode}`, {
            params: { gudang: header.value.gudang.kode }
        });
        header.value.customer = response.data; // Simpan data customer lengkap dengan aturan diskonnya
        header.value.top = response.data.top;
        calculateTotals(); // Panggil kalkulasi ulang setelah customer dipilih
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat detail customer.');
        header.value.customer = null;
    }
};

const onGudangSelected = async (gudang: Gudang) => {
    // console.log('Gudang received:', gudang); // Debug log

    // Pastikan data gudang valid
    if (!gudang || !gudang.kode) {
        toast.error('Data gudang tidak valid.');
        return;
    }

    header.value.gudang = gudang;
    isGudangSearchVisible.value = false;

    if (!isEditMode.value) {
        await getNextNumber();
    }

    // Debug: Cek apakah ada customerKode
    // console.log('Customer kode saat ini:', header.value.customerKode);

    // Setelah gudang dipilih, load detail customer jika sudah ada kode customer
    if (header.value.customerKode) {
        // console.log('Memulai load customer details untuk kode:', header.value.customerKode);
        toast.info('Memuat detail customer...');
        await loadCustomerDetails();
    } else {
        // console.log('Tidak ada customer kode, skip load customer details');
    }
};

const openProductSearch = (index: number) => {
    if (!header.value.customer) {
        toast.error('Pilih Customer terlebih dahulu.');
        return;
    }
    activeRowIndex.value = index;
    isProductSearchVisible.value = true;
};

const onProductSelected = async (product: { kode: string }) => {
    isProductSearchVisible.value = false;
    if (!product || !product.kode) return;

    try {
        const response = await api.get(`/barcode-form/product-details/${product.kode}`);
        const productDetails = response.data;
        items.value.splice(activeRowIndex.value, 1);
        if (Array.isArray(productDetails)) {
            productDetails.forEach((detail: any) => {
                const isDuplicate = items.value.some(item => item.barcode === detail.barcode);
                if (!isDuplicate) {
                    items.value.push({
                        ...detail,
                        id: Date.now() + Math.random(),
                        jumlah: 1,
                        diskonPersen: 0,
                        diskonRp: 0,
                        total: detail.harga
                    });
                }
            });
        }
        addNewRow();
    } catch (error) {
        toast.error(`Gagal memuat detail produk.`);
    }
};

const calculateTotals = () => {
    let subtotal = 0;
    items.value.forEach(item => {
        const price = Number(item.harga) || 0;
        const qty = Number(item.jumlah) || 0;
        let discountRp = Number(item.diskonRp) || 0;
        const discountPersen = Number(item.diskonPersen) || 0;

        // Prioritaskan diskon persen jika diisi
        if (discountPersen > 0) {
            discountRp = (discountPersen / 100) * price;
            item.diskonRp = discountRp; // Update diskon Rp
        }

        item.total = qty * (price - discountRp);
        subtotal += item.total;
    });

    footer.value.total = subtotal;

    const rule = header.value.customer?.discountRule;
    if (rule) {
        if (subtotal >= rule.nominal) {
            footer.value.diskonPersen1 = rule.diskon1;
        } else {
            footer.value.diskonPersen1 = rule.diskon2;
        }
    } else {
        footer.value.diskonPersen1 = 0;
    }

    let discount1 = (footer.value.diskonPersen1 / 100) * subtotal;
    let afterDiscount1 = subtotal - discount1;
    let discount2 = (footer.value.diskonPersen2 / 100) * afterDiscount1;
    footer.value.diskonRp = discount1 + discount2;
    let netto = subtotal - footer.value.diskonRp;
    footer.value.netto = netto;
    footer.value.ppnRp = (header.value.ppnPersen / 100) * netto;
    footer.value.grandTotal = netto + footer.value.ppnRp + (Number(footer.value.biayaKirim) || 0);
};

const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({ id: Date.now(), kode: '', nama: '', ukuran: '', stok: 0, jumlah: 0, harga: 0, diskonPersen: 0, diskonRp: 0, total: 0, barcode: '', noSoDtf: '', noPengajuanHarga: '' });
    }
};

const removeRow = (index: number) => {
    items.value.splice(index, 1);
};

const save = async () => {
    if (!header.value.customer) {
        toast.error('Customer harus dipilih terlebih dahulu.');
        return;
    }

    const validItems = items.value.filter(item => item.kode && item.jumlah > 0);
    if (validItems.length === 0) {
        toast.error('Tidak ada item yang valid untuk disimpan. Pastikan jumlah lebih dari 0.');
        return;
    }

    isSaving.value = true;
    try {
        const payload = {
            header: header.value,
            footer: footer.value,
            details: validItems,
            user: authStore.user,
            isNew: !isEditMode.value,
        };

        const response = await api.post('/offer-form/save', payload);
        toast.success(response.data.message);
        router.push('/penawaran');

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data penawaran.');
    } finally {
        isSaving.value = false;
    }
};

const resetForm = () => {
    header.value = {
        nomor: '',
        tanggal: format(new Date(), 'yyyy-MM-dd'),
        gudang: { kode: authStore.user?.cabang || '', nama: 'Gudang Utama' },
        customer: null,
        customerKode: '',
        top: 0,
        tempo: format(new Date(), 'yyyy-MM-dd'),
        ppnPersen: 0,
        keterangan: '',
    };
    items.value = [];
    addNewRow();
    getNextNumber();
};

const handleDiscountChange = async () => {
    // Fungsi ini akan dipanggil saat input diskon % selesai diisi
    if (!header.value.customer) return;

    try {
        // Asumsi API ini ada di backend untuk mendapatkan diskon standar
        const response = await api.get('/offer-form/get-default-discount', {
            params: {
                level: header.value.customer.level.split(' - ')[0],
                total: footer.value.total,
                gudang: header.value.gudang.kode,
            }
        });
        defaultDiscount.value = response.data.discount;

        if (footer.value.diskonPersen1 !== defaultDiscount.value && footer.value.diskonPersen1 > 0) {
            previousDiscount.value = defaultDiscount.value;
            isAuthModalVisible.value = true; // Buka modal otorisasi
        } else {
            calculateTotals();
        }
    } catch (error) {
        toast.error('Gagal memvalidasi diskon.');
        footer.value.diskonPersen1 = previousDiscount.value;
    }
};

const onAuthSuccess = (pin: string) => {
    isAuthModalVisible.value = false;
    toast.success('Otorisasi diskon berhasil.');
    calculateTotals();
};

const onAuthCancel = () => {
    isAuthModalVisible.value = false;
    footer.value.diskonPersen1 = previousDiscount.value;
    calculateTotals();
};

const handleItemDiscountChange = (index: number) => {
    const item = items.value[index];
    // Meniru logika Delphi: otorisasi diperlukan jika diskon diisi
    // (di dunia nyata, ini akan diperiksa ke backend)
    if (item.diskonPersen > 0 || item.diskonRp > 0) {
        activeItemIndexForAuth.value = index;
        previousItemDiscount.value = { persen: 0, rp: 0 }; // Asumsi diskon awal 0
        isItemAuthModalVisible.value = true;
    } else {
        calculateTotals();
    }
};

const onItemAuthSuccess = (pin: string) => {
    isItemAuthModalVisible.value = false;
    const item = items.value[activeItemIndexForAuth.value];
    item.pin = pin; // Simpan PIN yang valid
    toast.success('Otorisasi diskon item berhasil.');
    calculateTotals();
};

const onItemAuthCancel = () => {
    isItemAuthModalVisible.value = false;
    const item = items.value[activeItemIndexForAuth.value];
    // Kembalikan ke diskon sebelumnya jika dibatalkan
    item.diskonPersen = previousItemDiscount.value.persen;
    item.diskonRp = previousItemDiscount.value.rp;
    calculateTotals();
};

const handleDiscount2Change = () => {
    // Fungsi ini akan dipanggil saat input diskon % 2 selesai diisi
    // Otorisasi diperlukan jika Diskon % 1 sudah diisi dan Diskon % 2 diubah menjadi > 0
    if (footer.value.diskonPersen1 > 0 && footer.value.diskonPersen2 > 0) {
        previousDiscount2.value = 0; // Simpan nilai lama (asumsi dari 0)
        isAuth2ModalVisible.value = true;
    } else {
        calculateTotals();
    }
};

const onAuth2Success = (pin: string) => {
    isAuth2ModalVisible.value = false;
    // Simpan pin jika diperlukan di backend saat menyimpan transaksi
    toast.success('Otorisasi diskon 2 berhasil.');
    calculateTotals();
};

const onAuth2Cancel = () => {
    isAuth2ModalVisible.value = false;
    footer.value.diskonPersen2 = previousDiscount2.value; // Kembalikan ke nilai sebelumnya
    calculateTotals();
};

const canEditFooter = computed(() => {
    // Tombol/field di footer hanya aktif jika customer sudah dipilih
    // DAN setidaknya ada satu baris barang yang sudah terisi (memiliki kode).
    return header.value.customer && items.value.some(item => item.kode);
});

watch(items, calculateTotals, { deep: true });
watch(footer, calculateTotals, { deep: true });
watch(() => header.value.ppnPersen, calculateTotals);

watch(() => header.value.top, (newTop) => {
    const date = new Date(header.value.tanggal);
    if (isValid(date)) {
        header.value.tempo = format(addDays(date, newTop || 0), 'yyyy-MM-dd');
    }
});
watch(() => header.value.tanggal, (newDate) => {
    const date = new Date(newDate);
    if (isValid(date)) {
        header.value.tempo = format(addDays(date, header.value.top || 0), 'yyyy-MM-dd');
    }
});

onMounted(() => {
    if (isEditMode.value) {
        // Jika ada parameter 'nomor' di URL, masuk ke mode ubah
        loadOfferData(route.params.nomor as string);
    } else {
        // Jika tidak, masuk ke mode baru seperti sebelumnya
        getNextNumber();
        addNewRow();
    }
});

</script>

<template>
    <PageLayout :title="pageTitle">
        <template #header-actions>
            <v-btn color="primary" prepend-icon="mdi-content-save" @click="save" :loading="isSaving">Simpan</v-btn>
            <v-btn prepend-icon="mdi-cancel" @click="resetForm">Batal</v-btn>
            <v-btn @click="router.push('/penawaran')" prepend-icon="mdi-close">Tutup</v-btn>
        </template>

        <!-- Header Section -->
        <v-card class="mb-4">
            <v-card-text>
                <v-row dense>
                    <v-col md="2">
                        <v-text-field label="Nomor" v-model="header.nomor" readonly variant="filled" density="compact"
                            bg-color="grey-lighten-4"></v-text-field>
                    </v-col>
                    <v-col md="2">
                        <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                            density="compact"></v-text-field>
                    </v-col>
                    <v-col md="2">
                        <v-text-field label="Gudang" :model-value="`${header.gudang.kode} - ${header.gudang.nama}`"
                            readonly @click="openGudangSearch" @keydown.f1.prevent="openGudangSearch" variant="outlined"
                            density="compact" append-inner-icon="mdi-magnify" style="cursor: pointer;"></v-text-field>
                    </v-col>
                    <v-col md="6">
                        <v-text-field label="Customer"
                            :model-value="header.customer ? `${header.customer.kode} - ${header.customer.nama}` : header.customerKode ? `${header.customerKode} - [Pilih Gudang untuk Detail]` : ''"
                            readonly @click="openCustomerSearch" @keydown.f1.prevent="openCustomerSearch"
                            variant="outlined" density="compact" append-inner-icon="mdi-magnify"
                            style="cursor: pointer;"></v-text-field>
                    </v-col>

                    <!-- Field display-only - bukan input -->
                    <v-col md="3">
                        <div class="text-caption text-grey-darken-1 mb-1">Alamat</div>
                        <div class="text-body-2 pa-2 bg-grey-lighten-5 rounded" style="min-height: 32px;">
                            {{ header.customer?.alamat || '-' }}
                        </div>
                    </v-col>
                    <v-col md="2">
                        <div class="text-caption text-grey-darken-1 mb-1">Kota / Telp</div>
                        <div class="text-body-2 pa-2 bg-grey-lighten-5 rounded" style="min-height: 32px;">
                            {{ header.customer ? `${header.customer.kota} / ${header.customer.telp}` : '-' }}
                        </div>
                    </v-col>
                    <v-col md="2">
                        <div class="text-caption text-grey-darken-1 mb-1">Level</div>
                        <div class="text-body-2 pa-2 bg-grey-lighten-5 rounded" style="min-height: 32px;">
                            {{ header.customer?.level || '-' }}
                        </div>
                    </v-col>

                    <v-col md="1">
                        <v-text-field label="TOP" v-model.number="header.top" type="number" variant="outlined"
                            density="compact"></v-text-field>
                    </v-col>
                    <v-col md="2">
                        <v-text-field label="Tgl Tempo" v-model="header.tempo" type="date" variant="filled"
                            density="compact" readonly bg-color="grey-lighten-4"></v-text-field>
                    </v-col>
                    <v-col md="2">
                        <v-text-field label="PPN %" v-model.number="header.ppnPersen" type="number" variant="outlined"
                            density="compact"></v-text-field>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>

        <!-- Detail/Items Section -->
        <v-card class="mb-4">
            <v-data-table :headers="tableHeaders" :items="items" hide-default-footer :items-per-page="-1">
                <template #item.kode="{ index }">
                    <v-text-field @keydown.f1.prevent="openProductSearch(index)" placeholder="F1..."
                        variant="underlined" dense hide-details></v-text-field>
                </template>
                <template #item.jumlah="{ item }"><v-text-field v-model.number="item.jumlah" type="number"
                        variant="underlined" dense hide-details :disabled="!item.kode"></v-text-field></template>
                <template #item.harga="{ item }"><v-text-field v-model.number="item.harga" type="number"
                        variant="underlined" dense hide-details :disabled="!item.kode"></v-text-field></template>
                <template #item.diskonPersen="{ item, index }">
                    <v-text-field v-model.number="item.diskonPersen" type="number" variant="underlined" dense
                        hide-details @blur="handleItemDiscountChange(index)" :disabled="!item.kode"></v-text-field>
                </template>
                <template #item.diskonRp="{ item, index }">
                    <v-text-field v-model.number="item.diskonRp" type="number" variant="underlined" dense hide-details
                        @blur="handleItemDiscountChange(index)" :disabled="!item.kode"></v-text-field>
                </template>
                <template #item.noSoDtf="{ index }"><v-text-field placeholder="F1..." variant="underlined" dense
                        hide-details></v-text-field></template>
                <template #item.noPengajuanHarga="{ index }"><v-text-field placeholder="F1..." variant="underlined"
                        dense hide-details></v-text-field></template>
                <template #item.total="{ item }"><span class="font-weight-bold">{{ new
                    Intl.NumberFormat('id-ID').format(item.total) }}</span></template>
                <template #item.actions="{ index }"><v-btn icon="mdi-delete" size="small" variant="text" color="error"
                        @click="removeRow(index)"></v-btn></template>
                <template #bottom>
                    <div class="pa-2 text-right">
                        <v-btn @click="addNewRow" prepend-icon="mdi-plus" variant="text" color="primary">Tambah
                            Baris</v-btn>
                    </div>
                </template>
            </v-data-table>
        </v-card>

        <!-- Footer Section -->
        <v-card>
            <v-card-text>
                <v-row>
                    <v-col md="8">
                        <v-textarea label="Keterangan" v-model="header.keterangan" rows="4"
                            variant="outlined"></v-textarea>
                    </v-col>
                    <v-col md="4">
                        <!-- Display field untuk Total -->
                        <div class="mb-3">
                            <div class="text-caption text-grey-darken-1 mb-1">Total</div>
                            <div class="text-h6 pa-2 bg-grey-lighten-5 rounded text-right font-weight-bold">
                                {{ new Intl.NumberFormat('id-ID').format(footer.total) }}
                            </div>
                        </div>

                        <div class="d-flex ga-2 mb-3">
                            <v-text-field label="Diskon % (1)" v-model.number="footer.diskonPersen1" type="number"
                                variant="outlined" density="compact" :disabled="!canEditFooter"
                                @blur="handleDiscountChange"></v-text-field>
                            <v-text-field label="Diskon % (2)" v-model.number="footer.diskonPersen2" type="number"
                                variant="outlined" density="compact" :disabled="!canEditFooter"
                                @blur="handleDiscount2Change"></v-text-field>
                        </div>

                        <!-- Display field untuk Diskon Rp -->
                        <div class="mb-3">
                            <div class="text-caption text-grey-darken-1 mb-1">Diskon Rp</div>
                            <div class="text-body-2 pa-2 bg-grey-lighten-5 rounded text-right">
                                {{ new Intl.NumberFormat('id-ID').format(footer.diskonRp) }}
                            </div>
                        </div>

                        <v-text-field label="Biaya Kirim" v-model.number="footer.biayaKirim" type="number"
                            variant="outlined" density="compact" :disabled="!header.customer"
                            class="mb-3"></v-text-field>

                        <!-- Display field untuk PPN Rp -->
                        <div class="mb-3">
                            <div class="text-caption text-grey-darken-1 mb-1">PPN Rp</div>
                            <div class="text-body-2 pa-2 bg-grey-lighten-5 rounded text-right">
                                {{ new Intl.NumberFormat('id-ID').format(footer.ppnRp) }}
                            </div>
                        </div>

                        <!-- Display field untuk Grand Total -->
                        <div class="mb-3">
                            <div class="text-caption text-grey-darken-1 mb-1">Grand Total</div>
                            <div
                                class="text-h5 pa-3 bg-primary-lighten-5 rounded text-right font-weight-bold text-primary">
                                {{ new Intl.NumberFormat('id-ID').format(footer.grandTotal) }}
                            </div>
                        </div>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>

        <!-- Modals -->
        <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="header.gudang.kode"
            @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
        <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''"
            @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" />
        <ProductSearchModal v-if="isProductSearchVisible" :category="productCategory" :gudang="header.gudang.kode"
            @close="isProductSearchVisible = false" @product-selected="onProductSelected" />
        <AuthorizationModal v-if="isAuthModalVisible" title="Otorisasi Ganti Diskon Faktur" @close="onAuthCancel"
            @success="onAuthSuccess" />
        <AuthorizationModal v-if="isItemAuthModalVisible" title="Otorisasi Diskon per Item" @close="onItemAuthCancel"
            @success="onItemAuthSuccess" />
        <AuthorizationModal v-if="isAuth2ModalVisible" title="Otorisasi Ganti Diskon 2" @close="onAuth2Cancel"
            @success="onAuth2Success" />
    </PageLayout>
</template>
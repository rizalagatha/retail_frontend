<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
import RekeningSearchModal from '@/components/lookup/RekeningSearchModal.vue';
import UnpaidInvoiceSearchModal from '@/components/lookup/UnpaidInvoiceSearchModal.vue';
import { AxiosError } from 'axios';

// --- Tipe Data ---
interface Header {
    nomor: string;
    tanggal: string;
    customer: { kode: string; nama: string; alamat: string; kota: string; telp: string };
    jenisSetor: 'TUNAI' | 'TRANSFER' | 'GIRO';
    nominal: number;
    terbayar: number;
    sisa: number;
    keterangan: string;
    akun: { kode: string; nama: string; rekening: string };
    tanggalTransfer: string;
    nomorGiro: string;
    tanggalGiro: string;
    tanggalJatuhTempo: string;
    nomorSo: string;
    minimalDp: number;
}
interface Item {
    id: number;
    invoice: string;
    tanggal: string;
    top: number;
    jatuhTempo: string;
    nominal: number;
    terbayar: number;
    sisa: number;
    bayar: number;
    tglBayar: string;
    lunasi: boolean;
    keterangan: string;
    angsur: string;
}
interface Customer {
    kode: string;
    nama: string;
    alamat: string;
    kota: string;
    telp: string;
}
interface Akun {
    kode: string;
    nama: string;
    rekening: string;
}

interface InvoiceItem {
    invoice: string;
    tanggal: string;
    top: number;
    jatuhTempo: string;
    nominal: number;
    terbayar: number;
    sisa: number;
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '51';

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Setoran Pembayaran' : 'Buat Setoran Pembayaran');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const initialHeaderState: Header = {
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    customer: { kode: '', nama: '', alamat: '', kota: '', telp: '' },
    jenisSetor: 'TUNAI',
    nominal: 0,
    terbayar: 0,
    sisa: 0,
    keterangan: '',
    akun: { kode: '', nama: '', rekening: '' },
    tanggalTransfer: format(new Date(), 'yyyy-MM-dd'),
    nomorGiro: '',
    tanggalGiro: format(new Date(), 'yyyy-MM-dd'),
    tanggalJatuhTempo: format(new Date(), 'yyyy-MM-dd'),
    nomorSo: '',
    minimalDp: 0,
};
const header = reactive<Header>({ ...initialHeaderState });
const items = ref<Item[]>([]);

const isLoading = ref(true);
const isSaving = ref(false);

const dialog = reactive({
    customerSearch: false,
    rekeningSearch: false,
    invoiceSearch: false,
    confirm: false,
});
const activeRowIndex = ref(0);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });
const isPosted = ref(false);

const tableHeaders = [
    { title: 'No. Invoice', key: 'invoice', width: '150px' },
    { title: 'Tgl Invoice', key: 'tanggal', width: '110px' },
    { title: 'TOP', key: 'top', align: 'end', width: '70px' },
    { title: 'Jatuh Tempo', key: 'jatuhTempo', width: '110px' },
    { title: 'Nominal', key: 'nominal', align: 'end', width: '120px' },
    { title: 'Terbayar', key: 'terbayar', align: 'end', width: '120px' },
    { title: 'Sisa Piutang', key: 'sisa', align: 'end', width: '120px' },
    { title: 'Bayar', key: 'bayar', align: 'end', width: '150px' },
    { title: 'Lunasi', key: 'lunasi', align: 'center', sortable: false, width: '80px' },
    { title: 'Tgl Bayar', key: 'tglBayar', width: '130px' },
    { title: 'Keterangan', key: 'keterangan', width: '200px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
] as const;

// --- Methods ---
const calculateTotals = () => {
    const totalBayar = items.value.reduce((sum, item) => sum + (item.bayar || 0), 0);
    header.terbayar = totalBayar;
    header.sisa = header.nominal - totalBayar;
};

const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.invoice) {
        items.value.push({
            id: Date.now(), invoice: '', tanggal: '', top: 0, jatuhTempo: '', nominal: 0,
            terbayar: 0, sisa: 0, bayar: 0, tglBayar: format(new Date(), 'yyyy-MM-dd'),
            lunasi: false, keterangan: '', angsur: ''
        });
    }
};
const removeRow = (id: number) => {
    items.value = items.value.filter(item => item.id !== id);
    if (items.value.length === 0) addNewRow();
    calculateTotals();
};

const onCustomerSelected = (customer: Customer) => {
    header.customer = customer;
    dialog.customerSearch = false;
    items.value = []; // Reset grid saat ganti customer
    addNewRow();
};

const openRekeningSearch = () => {
    dialog.rekeningSearch = true;
};
const onRekeningSelected = (akun: Akun) => {
    header.akun = akun;
    dialog.rekeningSearch = false;
};

const openUnpaidInvoiceSearch = (index: number) => {
    if (!header.customer.kode) return toast.error('Pilih customer terlebih dahulu.');
    activeRowIndex.value = index;
    dialog.invoiceSearch = true;
};

const onUnpaidInvoiceSelected = (invoice: InvoiceItem) => {
    dialog.invoiceSearch = false;
    const isDuplicate = items.value.some(item => item.invoice === invoice.invoice);
    if (isDuplicate) return toast.warning('Invoice tersebut sudah ada di dalam daftar.');

    const targetItem = items.value[activeRowIndex.value];
    if (targetItem) {
        Object.assign(targetItem, { ...invoice, id: targetItem.id, bayar: 0, lunasi: false, tglBayar: format(new Date(), 'yyyy-MM-dd') });
    }
    addNewRow();
};

const handleLunasi = (item: Item) => {
    if (item.lunasi) {
        const sisaSetoran = header.nominal - items.value.filter(i => i.id !== item.id).reduce((sum, i) => sum + (i.bayar || 0), 0);
        item.bayar = Math.min(item.sisa, sisaSetoran);
    } else {
        item.bayar = 0;
    }
    calculateTotals();
};

const resetForm = () => {
    Object.assign(header, initialHeaderState);
    items.value = [];
    addNewRow();
    toast.info('Form telah dibersihkan.');
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
    dialogConfirm.title = title;
    dialogConfirm.text = text;
    dialogConfirm.onConfirm = onConfirm;
    dialogConfirm.show = true;
};

const executeSave = async () => {
    isSaving.value = true;
    try {
        const payload = { header, items: items.value, isNew: !isEditMode.value };
        const response = await api.post('/setoran-bayar-form/save', payload);
        toast.success(response.data.message);

        // Arahkan ke halaman cetak
        const nomorSetoran = response.data.nomor;
        const url = router.resolve({ name: 'CetakSetoranBayar', params: { nomor: nomorSetoran } }).href;
        window.open(url, '_blank');

        router.push({ name: 'SetoranBayar' });
    } catch (err) {
        const error = err as AxiosError<{ message: string }>;
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } finally {
        isSaving.value = false;
    }
};

const handleSave = () => {
    // Validasi frontend
    if (!header.customer.kode) return toast.error('Customer harus diisi.');
    if (!header.nominal || header.nominal <= 0) return toast.error('Nominal setoran harus diisi.');
    if (header.sisa < 0) return toast.error('Sisa setoran tidak boleh minus. Periksa kembali alokasi pembayaran.');

    showConfirmation('Konfirmasi Simpan', 'Apakah Anda yakin ingin menyimpan data ini?', executeSave);
};

const handleCancel = () => {
    showConfirmation('Konfirmasi Batal', 'Data yang belum disimpan akan hilang. Lanjutkan?', resetForm);
};

const handleClose = () => {
    showConfirmation('Konfirmasi Tutup', 'Tutup form dan kembali ke halaman browse?', () => router.push({ name: 'SetoranBayar' }));
};

onMounted(() => {
    const nomor = route.params.nomor as string;

    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data Setoran.`);
        router.push({ name: 'SetoranBayar' });
        return;
    }

    if (isEditMode.value && nomor) {
        isLoading.value = true;

        api.get(`/setoran-bayar-form/${nomor}`)
            .then(response => {
                const data = response.data;

                // --- Isi header ---
                header.nomor = data.header.nomor;
                header.tanggal = format(new Date(data.header.tanggal), 'yyyy-MM-dd');
                header.customer = {
                    kode: data.header.customer_kode,
                    nama: data.header.customer_nama,
                    alamat: data.header.customer_alamat,
                    kota: data.header.customer_kota,
                    telp: data.header.customer_telp,
                };
                header.jenisSetor = data.header.jenisSetor;
                header.nominal = data.header.nominal;
                header.keterangan = data.header.keterangan;
                header.akun = {
                    kode: data.header.akun_kode,
                    nama: data.header.akun_nama,
                    rekening: data.header.akun_rekening
                };
                header.tanggalTransfer = data.header.tanggalTransfer
                    ? format(new Date(data.header.tanggalTransfer), 'yyyy-MM-dd')
                    : '';
                header.nomorGiro = data.header.nomorGiro;
                header.tanggalGiro = data.header.tanggalGiro
                    ? format(new Date(data.header.tanggalGiro), 'yyyy-MM-dd')
                    : '';
                header.tanggalJatuhTempo = data.header.tanggalJatuhTempo
                    ? format(new Date(data.header.tanggalJatuhTempo), 'yyyy-MM-dd')
                    : '';
                header.nomorSo = data.header.nomorSo;

                // --- Isi detail grid ---
                items.value = data.items.map((item: Partial<Item>) => ({
                    id: Date.now() + Math.random(),
                    invoice: item.invoice || '',
                    tanggal: item.tanggal || '',
                    top: item.top || 0,
                    jatuhTempo: item.jatuhTempo || '',
                    nominal: item.nominal || 0,
                    terbayar: item.terbayar || 0,
                    sisa: item.sisa || 0,
                    bayar: 0, // default 0
                    tglBayar: format(new Date(), 'yyyy-MM-dd'), // default hari ini
                    lunasi: false,
                    keterangan: item.keterangan || '',
                    angsur: item.angsur || '',
                }));
                addNewRow();
                calculateTotals();

                // --- Cek posting ---
                isPosted.value = data.header.isPosted;
                if (isPosted.value) {
                    toast.warning('Data ini sudah di-posting oleh finance dan tidak bisa diubah.');
                }
            })
            .catch((err: unknown) => {
                const error = err as AxiosError<{ message: string }>;
                toast.error(error.response?.data?.message || 'Gagal memuat data setoran.');
                router.back();
            })
            .finally(() => {
                isLoading.value = false;
            });
    } else {
        // Mode baru
        resetForm();
        isLoading.value = false;
    }
});

watch(() => header.nominal, calculateTotals);
</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-cash-multiple">
        <template #header-actions>
            <v-btn size="small" color="primary" @click="handleSave" :loading="isSaving" prepend-icon="mdi-content-save"
                :disabled="!authStore.can(MENU_ID, requiredPermission)">
                Simpan
            </v-btn>
            <v-btn size="small" @click="handleCancel" prepend-icon="mdi-refresh">Batal</v-btn>
            <v-btn size="small" @click="handleClose" prepend-icon="mdi-close">Tutup</v-btn>
        </template>

        <div class="form-grid-container">
            <div class="left-column">
                <div class="desktop-form-section header-section">
                    <v-row dense>
                        <v-col cols="6">
                            <v-text-field label="Cabang" v-model="authStore.user.cabang" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact"
                                hide-details>
                                <template #append-inner><span v-if="!isEditMode"
                                        class="text-caption text-disabled">&lt;Baru&gt;</span></template>
                            </v-text-field>
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Customer" v-model="header.customer.nama" readonly
                                @click="dialog.customerSearch = true" prepend-inner-icon="mdi-magnify" density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field label="Alamat" v-model="header.customer.alamat" readonly filled
                                density="compact" hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Kota" v-model="header.customer.kota" readonly filled density="compact"
                                hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field label="Telepon" v-model="header.customer.telp" readonly filled
                                density="compact" hide-details />
                        </v-col>

                        <v-col cols="12">
                            <v-radio-group v-model="header.jenisSetor" inline label="Jenis Setor" density="compact"
                                hide-details>
                                <v-radio label="Tunai" value="TUNAI"></v-radio>
                                <v-radio label="Transfer" value="TRANSFER"></v-radio>
                                <v-radio label="Giro" value="GIRO"></v-radio>
                            </v-radio-group>
                        </v-col>

                        <!-- Panel Transfer -->
                        <v-expand-transition>
                            <div v-if="header.jenisSetor === 'TRANSFER'" class="w-100">
                                <v-row dense>
                                    <v-col cols="6">
                                        <v-text-field label="No. Akun" v-model="header.akun.kode" readonly
                                            @click="openRekeningSearch" prepend-inner-icon="mdi-magnify"
                                            density="compact" hide-details />
                                    </v-col>
                                    <v-col cols="6">
                                        <v-text-field label="No. Rekening" v-model="header.akun.rekening" readonly
                                            filled density="compact" hide-details />
                                    </v-col>
                                    <v-col cols="12">
                                        <v-text-field label="Nama Bank" v-model="header.akun.nama" readonly filled
                                            density="compact" hide-details />
                                    </v-col>
                                    <v-col cols="12">
                                        <v-text-field label="Tgl. Transfer" v-model="header.tanggalTransfer" type="date"
                                            variant="outlined" density="compact" hide-details />
                                    </v-col>
                                </v-row>
                            </div>
                        </v-expand-transition>

                        <!-- Panel Giro -->
                        <v-expand-transition>
                            <div v-if="header.jenisSetor === 'GIRO'" class="w-100">
                                <v-row dense>
                                    <v-col cols="12">
                                        <v-text-field label="No. Giro" v-model="header.nomorGiro" variant="outlined"
                                            density="compact" hide-details />
                                    </v-col>
                                    <v-col cols="6">
                                        <v-text-field label="Tgl. Giro" v-model="header.tanggalGiro" type="date"
                                            variant="outlined" density="compact" hide-details />
                                    </v-col>
                                    <v-col cols="6">
                                        <v-text-field label="Jatuh Tempo" v-model="header.tanggalJatuhTempo" type="date"
                                            variant="outlined" density="compact" hide-details />
                                    </v-col>
                                </v-row>
                            </div>
                        </v-expand-transition>

                        <v-col cols="12">
                            <v-text-field label="Keterangan" v-model="header.keterangan" rows="2" variant="outlined"
                                density="compact" hide-details />
                        </v-col>

                        <v-divider class="my-2" />

                        <v-text-field label="Nominal Setor" v-model.number="header.nominal" type="number"
                            variant="outlined" density="compact" hide-details class="font-weight-bold"
                            :readonly="isPosted" />
                        <v-col cols="12"><v-text-field label="Terbayar" v-model.number="header.terbayar" readonly filled
                                density="compact" hide-details /></v-col>
                        <v-col cols="12"><v-text-field label="Sisa" v-model.number="header.sisa" readonly filled
                                density="compact" hide-details /></v-col>

                    </v-row>
                </div>
            </div>

            <div class="right-column">
                <div class="desktop-form-section d-flex flex-column fill-height">
                    <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
                        class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
                        <template #[`item.invoice`]="{ item, index }">
                            <v-text-field v-model="item.invoice" variant="underlined" density="compact" hide-details
                                @keydown.f1.prevent="openUnpaidInvoiceSearch(index)" placeholder="F1..." readonly />
                        </template>
                        <template #[`item.tanggal`]="{ value }">
                            {{ value ? format(parseISO(value), 'dd-MM-yyyy') : '' }}
                        </template>
                        <template #[`item.jatuhTempo`]="{ value }">
                            {{ value ? format(parseISO(value), 'dd-MM-yyyy') : '' }}
                        </template>
                        <template #[`item.nominal`]="{ value }">
                            {{ new Intl.NumberFormat('id-ID').format(value) }}
                        </template>
                        <template #[`item.terbayar`]="{ value }">
                            {{ new Intl.NumberFormat('id-ID').format(value) }}
                        </template>
                        <template #[`item.sisa`]="{ value }">
                            {{ new Intl.NumberFormat('id-ID').format(value) }}
                        </template>
                        <template #[`item.bayar`]="{ item }">
                            <v-text-field v-model.number="item.bayar" type="number" variant="underlined"
                                density="compact" hide-details class="text-right" @input="calculateTotals" />
                        </template>
                        <template #[`item.lunasi`]="{ item }">
                            <v-checkbox v-model="item.lunasi" @change="handleLunasi(item)" hide-details
                                density="compact" />
                        </template>
                        <template #[`item.tglBayar`]="{ item }">
                            <v-text-field v-model="item.tglBayar" type="date" variant="underlined" density="compact"
                                hide-details />
                        </template>
                        <template #[`item.keterangan`]="{ item }">
                            <v-text-field v-model="item.keterangan" variant="underlined" density="compact"
                                hide-details />
                        </template>
                        <template #[`item.actions`]="{ item }">
                            <v-btn icon="mdi-delete" size="x-small" variant="text" color="error"
                                @click="removeRow(item.id)" />
                        </template>
                        <template #bottom>
                            <div class="pa-2 text-right"><v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus"
                                    variant="text" color="primary">Tambah Invoice</v-btn></div>
                        </template>
                    </v-data-table>
                </div>
            </div>
        </div>

        <CustomerSearchModal v-if="dialog.customerSearch" :gudang="authStore.user?.cabang || ''"
            @close="dialog.customerSearch = false" @customer-selected="onCustomerSelected" />
        <RekeningSearchModal v-if="dialog.rekeningSearch" :cabang="authStore.user?.cabang || ''"
            @close="dialog.rekeningSearch = false" @selected="onRekeningSelected" />
        <UnpaidInvoiceSearchModal v-if="dialog.invoiceSearch" :customer-kode="header.customer.kode"
            @close="dialog.invoiceSearch = false" @invoice-selected="onUnpaidInvoiceSelected" />
        <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
            <v-card>
                <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
                <v-card-text>{{ dialogConfirm.text }}</v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
                    <v-btn color="primary" variant="tonal"
                        @click="dialogConfirm.onConfirm(); dialogConfirm.show = false">Ya,
                        Lanjutkan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
/* (Kosong, mengandalkan tema global) */
</style>

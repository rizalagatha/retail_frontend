<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
// Asumsi: api, PageLayout, dan useToast diimpor dari project Anda
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue'; // Modal untuk F1/F2
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useRoute } from 'vue-router';
import { format, addDays, isValid } from 'date-fns';
import axios, { AxiosError } from 'axios';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
// Sesuaikan MENU_ID dengan ID menu Refund di sistem Anda
const MENU_ID = 'REF01'; 
const API_BASE_PATH = '/refund-form';

// --- Interfaces (Disesuaikan dari Delphi CDS) ---
interface RefundDetail {
    id: number; // Untuk keying di Vue
    nomor: string; // rfd_notrs (Invoice/Setor Transaksi No.)
    tanggal: string; // Tanggal Transaksi Asal
    kdcus: string; // rfd_cus_kode
    customer: string; // cus_nama
    nominal: number; // rfd_nominal (Saldo yang bisa di-refund)
    refund: number; // rfd_refund (Jumlah yang di-refund)
    apv: boolean; // clapv (Approval per baris)
    ket: string; // rfd_ket (Keterangan per baris)
    iddrec: string; // rfd_iddrec (Unique ID per detail)
    bank: string; // rfd_bank
    norek: string; // rfd_norek
    atasnama: string; // rfd_atasnama
}

interface RefundHeader {
    nomor: string; // rf_nomor
    tanggal: string; // rf_tanggal
    userCreate: string; // user_create
    userApv: string; // rf_acc
    isProcessed: boolean; // ckProses
    isApproved: boolean; // ckApv
    keterangan: string; // Keterangan global, jika ada
}

// --- State (Disesuaikan dari Form Delphi) ---
const header = ref<RefundHeader>({
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    userCreate: authStore.user?.username || '',
    userApv: '',
    isProcessed: false,
    isApproved: false,
    keterangan: '',
});

const items = ref<RefundDetail[]>([]);

// State untuk Kontrol UI
const isTransactionSearchVisible = ref(false);
const activeRowIndex = ref(0);
const searchType = ref<'invoice' | 'deposit'>('invoice'); // F1 atau F2
const isSaving = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);

// Komputasi Sisa Saldo (Analogi total refund yang diajukan)
const totalRefund = computed(() => {
    return items.value
        .filter(item => item.nomor) // Hanya hitung baris yang sudah diisi
        .reduce((sum, item) => sum + (Number(item.refund) || 0), 0);
});

// Komputasi Izin Aproval (Analogi zAccKor di Delphi)
const isApprover = computed(() => authStore.user?.role === 'KOR' || authStore.user?.role === 'ADMIN'); 
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah Refund: ${header.value.nomor}` : 'Buat Refund Baru');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const tableHeaders = [
    { title: 'No. Transaksi', key: 'nomor', width: '150px' },
    { title: 'Customer', key: 'customer', width: '200px' },
    { title: 'Nominal Saldo', key: 'nominal', align: 'end', width: '120px' },
    { title: 'Refund (Rp)', key: 'refund', align: 'end', width: '120px' },
    { title: 'APV', key: 'apv', width: '50px' }, // Checkbox
    { title: 'Bank', key: 'bank', width: '120px' },
    { title: 'No. Rekening', key: 'norek', width: '120px' },
    { title: 'Atas Nama', key: 'atasnama', width: '150px' },
    { title: 'Keterangan', key: 'ket', width: '250px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '40px' },
] as const;


// --- Methods Logic (Mencerminkan Delphi) ---

// Inisialisasi/Reset Form
const initForm = async () => {
    header.value = {
        nomor: '',
        tanggal: format(new Date(), 'yyyy-MM-dd'),
        userCreate: authStore.user?.username || '',
        userApv: '',
        isProcessed: false,
        isApproved: false,
        keterangan: '',
    };
    items.value = [];
    addNewRow();

    if (!isEditMode.value) {
        // Asumsi API mengambil nomor baru jika ini transaksi baru
        try {
            const response = await api.get(`${API_BASE_PATH}/next-number`, {
                params: { tanggal: header.value.tanggal }
            });
            header.value.nomor = response.data.nextNumber || '<Otomatis>';
        } catch (error) {
            // Jika gagal, biarkan saja '<Otomatis>'
            console.error('Failed to get next number:', error);
        }
    }
};

// Logika penambahan baris (Analogi initgrid dan append di CDS)
const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.nomor) {
        items.value.push({
            id: Date.now() + Math.random(),
            nomor: '',
            tanggal: '',
            kdcus: '',
            customer: '',
            nominal: 0,
            refund: 0,
            apv: false,
            ket: '',
            iddrec: '',
            bank: '',
            norek: '',
            atasnama: '',
        });
    }
};

// Logika Load Data (Analogi loaddataall)
const loadRefundData = async (nomor: string) => {
    try {
        const response = await api.get(`${API_BASE_PATH}/${nomor}`);
        const { headerData, detailsData } = response.data;

        // Map Header Data
        header.value.nomor = headerData.rf_nomor;
        header.value.tanggal = headerData.rf_tanggal;
        header.value.userCreate = headerData.user_create;
        header.value.userApv = headerData.rf_acc;
        header.value.isApproved = headerData.rf_status === 'APPROVE';
        header.value.isProcessed = !!headerData.rf_status;

        // Map Details Data (CDS equivalent)
        items.value = detailsData.map((d: any) => ({
            id: Date.now() + Math.random(),
            nomor: d.rfd_notrs,
            tanggal: d.tanggal,
            kdcus: d.rfd_cus_kode,
            customer: d.cus_nama,
            nominal: d.rfd_nominal,
            refund: d.rfd_refund,
            apv: d.rfd_refund > 0, // Jika ada refund, anggap approved
            ket: d.rfd_ket,
            iddrec: d.rfd_iddrec,
            bank: d.rfd_bank,
            norek: d.rfd_norek,
            atasnama: d.rfd_atasnama,
        }));
        
        addNewRow(); // Pastikan selalu ada baris kosong di akhir

        toast.success(`Data refund ${nomor} berhasil dimuat.`);
    } catch (error) {
        toast.error('Gagal memuat data refund.');
        router.push(route.path.replace(`/${nomor}`, '')); // Kembali ke form kosong
    }
};

// Handler F1 (Pencarian Invoice dengan Saldo Negatif)
const openSearchInvoice = (index: number) => {
    if (header.value.isApproved) {
        toast.warning('Transaksi sudah di-approve, tidak bisa menambah item.');
        return;
    }
    activeRowIndex.value = index;
    searchType.value = 'invoice';
    isTransactionSearchVisible.value = true;
};

// Handler F2 (Pencarian Setoran dengan Saldo Positif/Lebih Bayar)
const openSearchDeposit = (index: number) => {
    if (header.value.isApproved) {
        toast.warning('Transaksi sudah di-approve, tidak bisa menambah item.');
        return;
    }
    activeRowIndex.value = index;
    searchType.value = 'deposit';
    isTransactionSearchVisible.value = true;
};

// Logika untuk mengisi data setelah pencarian (Analogi F1/F2 result processing)
const onTransactionSelected = (selectedTransaction: any) => {
    isTransactionSearchVisible.value = false;
    
    const existingItem = items.value.find(item => item.nomor === selectedTransaction.Nomor);
    if (existingItem) {
        toast.warning(`Nomor transaksi ${selectedTransaction.Nomor} sudah ada di daftar.`);
        return;
    }

    const item = items.value[activeRowIndex.value];
    if (item) {
        item.nomor = selectedTransaction.Nomor;
        item.tanggal = selectedTransaction.Tanggal;
        item.kdcus = selectedTransaction.Kdcus;
        item.customer = selectedTransaction.Customer;
        item.nominal = Math.abs(selectedTransaction.Sisa); // Ambil nilai absolut sisa saldo
        item.refund = 0;
        item.ket = '';
        // IDDREC harus di-generate (mirip dengan Delphi: CABKAOS + 'RF' + timestamp)
        item.iddrec = `${authStore.user?.cabang || 'K01'}RF${Date.now()}`; 
    }
    addNewRow();
};


// Logika persetujuan per baris (Analogi clapvPropertiesEditValueChanged)
const handleLineItemApproval = (item: RefundDetail) => {
    if (item.apv) {
        item.refund = item.nominal;
        item.bank = '';
        item.norek = '';
        item.atasnama = '';
    } else {
        item.refund = 0;
    }
    updateHeaderApprovalStatus();
};

// Logika Cek Approval Header (Analogi cekapv)
const updateHeaderApprovalStatus = () => {
    const anyApproved = items.value.some(item => item.apv);
    header.value.isApproved = anyApproved;
};

const removeRow = (index: number) => {
    if (header.value.isApproved) {
        toast.warning('Transaksi sudah di-approve, tidak bisa menghapus item.');
        return;
    }
    if (items.value.filter(i => i.nomor).length <= 1) {
        toast.error('Detail harus diisi minimal 1 baris.');
        return;
    }
    items.value.splice(index, 1);
    updateHeaderApprovalStatus();
};


// Logika Simpan (Analogi simpandata dan btnSimpanClick)
const save = async () => {
    // --- Validasi dari Delphi ---
    if (!authStore.can(MENU_ID, requiredPermission.value)) {
        toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
        return;
    }

    const validItems = items.value.filter(item => item.nomor);
    if (validItems.length === 0) {
        toast.error('Detail transaksi harus diisi minimal 1 baris.');
        return;
    }

    if (isApprover.value) {
        // Validasi khusus Approver
        for (const item of validItems) {
            if (item.apv && item.refund <= 0) {
                toast.error(`Jumlah refund untuk ${item.nomor} yang disetujui harus lebih dari 0.`);
                return;
            }
            if (item.apv && item.refund > item.nominal) {
                toast.error(`Jumlah refund untuk ${item.nomor} tidak boleh melebihi nominal saldo ${item.nominal}.`);
                return;
            }
            if (item.apv && (!item.bank || !item.norek || !item.atasnama)) {
                toast.error(`Detail Bank (Bank, No. Rek, Atas Nama) wajib diisi untuk item ${item.nomor} yang disetujui.`);
                return;
            }
        }
    } else {
        // Validasi khusus Pengaju (hanya isi keterangan)
        header.value.isProcessed = false;
        header.value.isApproved = false;
        header.value.userApv = '';
    }

    isSaving.value = true;
    try {
        const payload = {
            header: header.value,
            details: validItems,
            isNew: !isEditMode.value,
            isApprover: isApprover.value,
            user: authStore.user,
        };

        const response = await api.post(`${API_BASE_PATH}/save`, payload);
        toast.success(response.data.message);
        
        // Logika cetak (analogi cetak)
        if (response.data.nomor) {
             // Asumsi: API akan memicu proses cetak atau mengembalikan data cetak
             // Di web, ini biasanya mengarah ke rute report
             console.log(`Memicu cetak untuk nomor: ${response.data.nomor}`);
        }

        // Kembali ke form kosong setelah simpan (analogi refreshdata)
        router.push(route.path.replace(`/${route.params.nomor}`, '')); 
        await initForm();

    } catch (error: unknown) {
        let message = 'Gagal menyimpan data refund.';
        if (axios.isAxiosError(error)) {
            message = error.response?.data?.message || message;
        } else if (error instanceof Error) {
             message = error.message;
        }
        toast.error(message);
    } finally {
        isSaving.value = false;
    }
};

// Metode Konfirmasi dan Pembatalan (Analogi MessageDlg)
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
    // Navigasi ke halaman daftar atau home
    router.push('/dashboard'); 
};


// --- Watchers & Lifecycle ---
watch(items, updateHeaderApprovalStatus, { deep: true }); // Update header APV jika ada perubahan detail

onMounted(() => {
    // KODE ASLI (dinonaktifkan sementara)
    // if (!authStore.can(MENU_ID, requiredPermission.value)) {
    //     toast.error(`Anda tidak memiliki izin untuk ${requiredPermission.value === 'insert' ? 'membuat' : 'mengubah'} data refund.`);
    //     router.push('/dashboard'); 
    //     return;
    // }

    // Logika di bawah akan selalu dijalankan
    if (isEditMode.value) {
        loadRefundData(route.params.nomor as string);
    } else {
        initForm();
    }
});

</script>

<template>
    <PageLayout :title="pageTitle" desktop-mode icon="mdi-cash-refund">
        <template #header-actions>
            <v-btn size="small" color="primary"
                @click="showConfirmation(save, 'Anda yakin ingin menyimpan data refund ini?')" :loading="isSaving">
                Simpan
            </v-btn>
            <v-btn v-if="!isEditMode" size="small"
                @click="showConfirmation(initForm, 'Batalkan dan kosongkan semua isian?')">
                Batal
            </v-btn>
            <v-btn size="small"
                @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')">
                Tutup
            </v-btn>
        </template>

        <div class="form-grid-container">
            <div class="left-column">
                <v-card class="desktop-form-section header-section" elevation="2">
                    <v-card-title class="pa-2 text-primary">Header Refund</v-card-title>
                    <v-card-text>
                        <v-row dense>
                            <v-col cols="6">
                                <v-text-field label="Nomor Refund" :model-value="header.nomor || '<Otomatis>'" readonly
                                    variant="filled" density="compact" hide-details>
                                </v-text-field>
                            </v-col>
                            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date"
                                    variant="outlined" density="compact" hide-details :disabled="isEditMode && !isApprover"></v-text-field></v-col>
                            
                            <v-col cols="6"><v-text-field label="User Pengaju" :model-value="header.userCreate" readonly
                                    variant="filled" density="compact" hide-details></v-text-field></v-col>
                            <v-col cols="6"><v-text-field label="User Approval" :model-value="header.userApv" readonly
                                    variant="filled" density="compact" hide-details></v-text-field></v-col>

                             <v-col cols="6">
                                <v-checkbox label="Proses" v-model="header.isProcessed" density="compact" hide-details 
                                    :disabled="!isApprover || header.isApproved"
                                    class="pt-0 mt-0"></v-checkbox>
                            </v-col>
                            <v-col cols="6">
                                <v-checkbox label="Disetujui (Header)" v-model="header.isApproved" density="compact" hide-details
                                    :disabled="!isApprover || header.isApproved"
                                    class="pt-0 mt-0"></v-checkbox>
                            </v-col>

                            <v-col cols="12"><v-textarea label="Keterangan Umum" v-model="header.keterangan" variant="outlined"
                                    density="compact" rows="2" hide-details></v-textarea></v-col>
                        </v-row>
                    </v-card-text>
                </v-card>
                
                <v-card class="desktop-form-section footer-section mt-4" elevation="2">
                    <v-card-title class="pa-2 text-success">Ringkasan</v-card-title>
                    <v-card-text>
                        <v-text-field label="Total Refund Diajukan"
                            :model-value="new Intl.NumberFormat('id-ID').format(totalRefund)" readonly
                            variant="filled" density="compact" hide-details
                            class="summary-field text-right font-weight-bold text-h6"></v-text-field>
                    </v-card-text>
                </v-card>
            </div>

            <v-card class="desktop-form-section right-column" elevation="2">
                <v-card-title class="pa-2 text-secondary">Detail Transaksi Refund (F1=Invoice, F2=Deposit)</v-card-title>
                <v-data-table :headers="tableHeaders" :items="items" density="compact" class="desktop-table"
                    fixed-header :items-per-page="-1">
                    
                    <!-- Kolom Nomor Transaksi (Search F1/F2) -->
                    <template #[`item.nomor`]="{ item, index }">
                        <v-text-field v-model="item.nomor" variant="underlined" density="compact" hide-details
                            placeholder="F1/F2..." @keydown.f1.prevent="openSearchInvoice(index)"
                            @keydown.f2.prevent="openSearchDeposit(index)"
                            :readonly="item.nomor !== '' || isApprover || header.isApproved"
                            :class="{'bg-red-lighten-5': item.nomor === ''}"
                            >
                            <template #append-inner>
                                <v-icon size="small" @click="openSearchInvoice(index)">mdi-invoice-text-multiple-outline</v-icon>
                                <v-icon size="small" @click="openSearchDeposit(index)">mdi-cash-plus</v-icon>
                            </template>
                        </v-text-field>
                    </template>

                    <!-- Kolom Nominal Saldo (Readonly) -->
                    <template #[`item.nominal`]="{ item }">
                        <span class="text-caption font-weight-bold text-right d-block">
                            {{ new Intl.NumberFormat('id-ID').format(item.nominal) }}
                        </span>
                    </template>
                    
                    <!-- Kolom Refund (Editable jika Approver) -->
                    <template #[`item.refund`]="{ item }">
                        <v-text-field v-model.number="item.refund" type="number" variant="underlined" dense hide-details
                            single-line class="text-right" 
                            :disabled="!isApprover || !item.apv" 
                            :readonly="!item.apv"
                            :max="item.nominal"
                            :min="0"
                            ></v-text-field>
                    </template>
                    
                    <!-- Kolom APV (Line Item Approval) -->
                    <template #[`item.apv`]="{ item }">
                        <v-checkbox v-model="item.apv" density="compact" hide-details
                            :disabled="!isApprover || header.isApproved || item.nomor === ''"
                            @change="handleLineItemApproval(item)"></v-checkbox>
                    </template>
                    
                    <!-- Kolom Bank -->
                    <template #[`item.bank`]="{ item }">
                        <v-text-field v-model="item.bank" variant="underlined" density="compact" hide-details
                            single-line :disabled="!isApprover || !item.apv"></v-text-field>
                    </template>

                    <!-- Kolom No. Rekening -->
                    <template #[`item.norek`]="{ item }">
                        <v-text-field v-model="item.norek" variant="underlined" density="compact" hide-details
                            single-line :disabled="!isApprover || !item.apv"></v-text-field>
                    </template>

                    <!-- Kolom Atas Nama -->
                    <template #[`item.atasnama`]="{ item }">
                        <v-text-field v-model="item.atasnama" variant="underlined" density="compact" hide-details
                            single-line :disabled="!isApprover || !item.apv"></v-text-field>
                    </template>
                    
                    <!-- Kolom Keterangan -->
                    <template #[`item.ket`]="{ item }">
                        <v-text-field v-model="item.ket" variant="underlined" density="compact" hide-details
                            single-line :disabled="isApprover && !item.apv"></v-text-field>
                    </template>

                    <!-- Kolom Actions (Delete) -->
                    <template #[`item.actions`]="{ item, index }">
                        <v-btn v-if="item.nomor !== '' && !isApprover && !header.isApproved" icon="mdi-delete" size="x-small" variant="text" color="error"
                            @click="showConfirmation(() => removeRow(index), 'Hapus baris ini?')"></v-btn>
                    </template>

                    <template #bottom>
                        <div class="pa-1 text-right border-t">
                            <v-btn v-if="!isApprover && !header.isApproved" size="small" @click="addNewRow"
                                prepend-icon="mdi-plus" variant="text" color="primary">Tambah Baris</v-btn>
                        </div>
                    </template>
                </v-data-table>
            </v-card>
        </div>

        <!-- Modals -->
        <TransactionSearchModal 
            v-if="isTransactionSearchVisible" 
            :searchType="searchType"
            :cabang="authStore.user?.cabang || 'K01'"
            @close="isTransactionSearchVisible = false" 
            @selected="onTransactionSelected" 
        />
        
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
/* Struktur grid untuk desktop layout */
.form-grid-container {
    display: grid;
    grid-template-columns: 350px 1fr; /* Kolom kiri tetap, kolom kanan mengisi sisa */
    gap: 16px;
    height: 100%;
}

.left-column {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.right-column {
    /* Pastikan kolom kanan mengisi sisa ruang */
    min-height: 500px;
    display: flex;
    flex-direction: column;
}

.desktop-table :deep(.v-data-table__wrapper) {
    overflow-x: auto;
    overflow-y: auto;
    height: 100%;
}

.desktop-table :deep(.v-text-field) {
    margin: 0 !important;
    padding: 0 !important;
}

/* Custom style untuk field summary agar terlihat berbeda */
.summary-field :deep(input) {
    font-size: 1.1rem;
    color: #1b5e20 !important; /* Hijau tua */
}
</style>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
import api from '@/services/api';
import { useRouter } from 'vue-router';
import RekeningSearchModal from '../lookup/RekeningSearchModal.vue';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
import PrintOptionModal from './PrintOptionModal.vue';
import ReturJualSearchModal from '@/components/lookup/ReturJualSearchModal.vue';
import SatisfactionSurveyModal from '@/components/modal/SatisfactionSurveyModal.vue';
import type { AxiosError } from 'axios';

interface BankAccount {
    kode: string;
    nama: string;
    rekening: string;
}
interface InvoiceItem {
    kode: string;
    [key: string]: unknown;
}

const props = defineProps({
    invoiceHeader: { type: Object, required: true },
    invoiceItems: { type: Array, required: true },
    totals: { type: Object, required: true },
    authPins: { type: Object, required: true },
    linkedDps: { type: Object, required: false },
});

const emit = defineEmits(['close', 'save-success']);

const toast = useToast();
const router = useRouter();

// --- State ---
const payment = reactive({
    tunai: 0,
    voucher: { nomor: '', nominal: 0 },
    transfer: { nominal: 0, akun: { kode: '', nama: '', rekening: '' }, tanggal: new Date().toISOString().substring(0, 10) },
    retur: { nomor: '', nominal: 0 },
    pundiAmal: 0,
});

const isSaving = ref(false);
const dialogs = reactive({
    rekeningSearch: false,
    returJualSearch: false,
});

const authDialog = reactive({
    show: false,
    title: 'Otorisasi Invoice Belum Lunas',
    challengeCode: '',
});
const authModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const temporaryPin = ref('');
const authOnSuccess = ref<null | ((pin: string) => void)>(null);
const authOnCancel = ref<null | (() => void)>(null);
const isPrintOptionVisible = ref(false);
const savedInvoiceNumber = ref('');
const isSurveyVisible = ref(false);
const isFromSO = !!props.invoiceHeader.nomorSo;

// --- Computed Properties for Real-time Calculation ---
const totalBayar = computed(() => {
    return (payment.tunai || 0) + (payment.voucher.nominal || 0) + (payment.transfer.nominal || 0) + (payment.retur.nominal || 0);
});

const kembali = computed(() => {
    const sisa = props.totals.sisaPiutang || 0;
    const bayar = totalBayar.value;
    return bayar > sisa ? bayar - sisa : 0;
});

const nettoKembali = computed(() => {
    const sisaKembalian = kembali.value;
    return sisaKembalian >= 1000 ? sisaKembalian : 0;
});

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

// --- Methods ---
const onRekeningSelected = (rekening: BankAccount) => {
    payment.transfer.akun = rekening;
    dialogs.rekeningSearch = false;
};

const onReturSelected = (retur: { Nomor: string, Sisa: number }) => {
    payment.retur.nomor = retur.Nomor;
    // Logika Delphi: ambil nilai terkecil antara sisa retur dan sisa piutang
    const sisaPiutang = props.totals.sisaPiutang;
    payment.retur.nominal = Math.min(retur.Sisa, sisaPiutang);
    dialogs.returJualSearch = false;
};

const handleFinalSave = async () => {
    // Validasi frontend sebelum lanjut
    if (payment.transfer.nominal > 0 && !payment.transfer.akun.kode) {
        return toast.error('Akun bank untuk transfer harus diisi.');
    }

    // Cek apakah pembayaran kurang dari tagihan
    if (totalBayar.value < props.totals.sisaPiutang) {
        // Jika kurang, panggil modal otorisasi
        requestAuthorization(
            'Otorisasi Invoice Belum Lunas',
            (pin) => { // Fungsi yang akan dijalankan jika otorisasi berhasil
                temporaryPin.value = pin; // Simpan PIN untuk dikirim ke backend
                executeSave();
            },
            () => { // Fungsi jika dibatalkan
                toast.info('Penyimpanan dibatalkan.');
            }
        );
    } else {
        // Jika lunas, langsung simpan
        await executeSave();
    }
};

const requestAuthorization = (
    title: string,
    onSuccess: (pin: string) => void,
    onCancel: () => void
) => {
    authDialog.challengeCode = Math.floor(100 + Math.random() * 900).toString();
    authDialog.title = title;
    authOnSuccess.value = onSuccess;
    authOnCancel.value = onCancel;
    authDialog.show = true;
};

const handleAuthSuccess = async (pin: string) => {
    try {
        await api.post('/otorisasi/validate-pin', {
            pin,
            challengeCode: authDialog.challengeCode
        });
        toast.success('Otorisasi berhasil.');
        authDialog.show = false;
        temporaryPin.value = pin;

        await executeSave();
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'response' in error) {
            const err = error as { response?: { data?: { message?: string } } };
            authModalRef.value?.setFailed(err.response?.data?.message || 'PIN tidak valid');
        } else {
            authModalRef.value?.setFailed('Terjadi kesalahan.');
        }
    }
};

const executeSave = async () => {
    isSaving.value = true;
    try {
        const payload = {
            header: props.invoiceHeader,
            items: (props.invoiceItems as InvoiceItem[]).filter((item) => item.kode),
            dps: props.linkedDps,
            payment: {
                ...payment,
                pinBelumLunas: temporaryPin.value // Sertakan PIN jika ada
            },
            totals: props.totals,
            pins: props.authPins,
            isNew: !props.invoiceHeader.nomor,
        };

        const response = await api.post('/invoice-form/save', payload);
        toast.success(response.data.message);
        savedInvoiceNumber.value = response.data.nomor;

        isSurveyVisible.value = true;

    } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        toast.error(axiosError.response?.data?.message || 'Gagal menyimpan invoice.');
    } finally {
        isSaving.value = false;
        temporaryPin.value = ''; // Reset PIN
    }
}

const handleSurveySubmit = async (rating: number) => {
    isSurveyVisible.value = false;
    const nomor = savedInvoiceNumber.value;

    try {
        await api.post('/invoice-form/save-satisfaction', { nomor, rating });
        toast.success('Terima kasih atas masukan Anda!');
    } catch {
        toast.error('Gagal menyimpan hasil survey.');
    }

    try {
        const printables = await api.get(`/invoice-form/check-printables/${nomor}`);

        if (printables.data.needsPrintKupon) {
            const kuponUrl = router.resolve({ name: 'CetakKupon', params: { nomor } }).href;
            window.open(kuponUrl, '_blank');
        }
        if (printables.data.needsPrintVoucher) {
            const voucherUrl = router.resolve({ name: 'CetakVoucher', params: { nomor } }).href;
            window.open(voucherUrl, '_blank');
        }
    } catch {
        toast.error('Gagal memeriksa data kupon/voucher.');
    }

    // Tampilkan print options
    if (isFromSO) {
        // Jika dari SO, langsung cetak A4
        handlePrintSelection('a4');
    } else {
        // Penjualan langsung → tampilkan pilihan print
        isPrintOptionVisible.value = true;
    }
};

const formatHpToWa = (hp: string) => {
    if (!hp) return '';
    let sanitizedHp = hp.replace(/[^0-9]/g, ''); // Hapus semua selain angka
    if (sanitizedHp.startsWith('0')) {
        sanitizedHp = '62' + sanitizedHp.substring(1); // Ganti 0 di depan dengan 62
    }
    return sanitizedHp;
};

const handlePrintSelection = async (type: 'a4' | 'kasir' | 'wa') => {
    isPrintOptionVisible.value = false;
    const nomor = savedInvoiceNumber.value;
    if (!nomor) return;

    if (type === 'a4' || type === 'kasir') {
        const routeName = type === 'a4' ? 'InvoicePrint' : 'InvoicePrintKasir';
        const url = router.resolve({ name: routeName, params: { nomor } }).href;
        window.open(url, '_blank');
    } else if (type === 'wa') {
        const memberHp = props.invoiceHeader.Hp || props.invoiceHeader.memberHp;
        if (!memberHp) return toast.error('No. HP Member tidak ada, tidak bisa kirim via WA.');
        try {
            toast.info(`Mengirim struk ke ${memberHp}...`);
            const response = await api.post('/whatsapp/send-receipt', {
                nomor,
                hp: formatHpToWa(memberHp)
            });
            toast.success(response.data.message);
        } catch (error: unknown) {
            const axiosError = error as AxiosError<{ message?: string }>;
            toast.error(axiosError.response?.data?.message || 'Gagal mengirim struk via WhatsApp.');
        }
    }
    onPrintModalClose();
};

const onPrintModalClose = () => {
    isPrintOptionVisible.value = false;
    // Emit event bahwa proses simpan & cetak selesai, lalu tutup PaymentModal
    emit('save-success', savedInvoiceNumber.value);
};

const validateVoucher = async () => {
    const voucherNo = payment.voucher.nomor;
    if (!voucherNo) {
        payment.voucher.nominal = 0; // Reset nominal jika field kosong
        return;
    }

    try {
        const response = await api.post('/invoice-form/validate-voucher', {
            voucherNo: voucherNo,
            invoiceNo: props.invoiceHeader.nomor, // Kirim nomor invoice saat ini
        });
        payment.voucher.nominal = response.data.nominal;
        toast.success('Voucher valid.');
    } catch (error: unknown) {
        payment.voucher.nominal = 0;

        const axiosError = error as AxiosError<{ message?: string }>;
        toast.error(axiosError.response?.data?.message || 'Gagal memvalidasi voucher.');
    }
};

watch(nettoKembali, () => {
  const sisaKembalian = kembali.value;
  payment.pundiAmal = (sisaKembalian > 0 && sisaKembalian < 1000) ? sisaKembalian : 0;
});
</script>

<template>
    <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="800px" persistent>
        <v-card>
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title>Form Pembayaran</v-toolbar-title>
                <v-spacer />
                <v-btn icon="mdi-close" @click="$emit('close')" />
            </v-toolbar>

            <v-card-text class="pa-4">
                <v-row>
                    <v-col cols="12" md="5">
                        <div class="desktop-form-section mb-4">
                            <div class="text-subtitle-2 font-weight-bold mb-2">Ringkasan Invoice</div>
                            <div class="d-flex justify-space-between text-caption">
                                <span>Sub Total:</span>
                                <span>{{ formatRupiah(totals.subTotal) }}</span>
                            </div>
                            <div class="d-flex justify-space-between text-caption">
                                <span>Total Diskon:</span>
                                <span>- {{ formatRupiah(totals.totalDiskonFaktur) }}</span>
                            </div>
                            <div class="d-flex justify-space-between text-caption">
                                <span>Total PPN:</span>
                                <span>+ {{ formatRupiah(totals.totalPpn) }}</span>
                            </div>
                            <div class="d-flex justify-space-between text-caption">
                                <span>Biaya Kirim:</span>
                                <span>+ {{ formatRupiah(invoiceHeader.biayaKirim) }}</span>
                            </div>
                            <v-divider class="my-2" />
                            <div class="d-flex justify-space-between font-weight-bold">
                                <span>Grand Total:</span>
                                <span>{{ formatRupiah(totals.grandTotal) }}</span>
                            </div>
                            <div class="d-flex justify-space-between text-caption">
                                <span>Total DP:</span>
                                <span>- {{ formatRupiah(totals.totalDp) }}</span>
                            </div>
                            <v-divider class="my-2" />
                            <div class="d-flex justify-space-between font-weight-bold text-h6 text-primary">
                                <span>Sisa Piutang:</span>
                                <span>{{ formatRupiah(totals.sisaPiutang) }}</span>
                            </div>
                        </div>

                        <div class="desktop-form-section" style="background-color: #f7f9fc;">
                            <div class="d-flex justify-space-between">
                                <span class="text-subtitle-1">Total Bayar:</span>
                                <span class="text-subtitle-1 font-weight-bold">{{ formatRupiah(totalBayar) }}</span>
                            </div>
                            <v-divider class="my-2" />
                            <div class="d-flex justify-space-between text-body-2">
                                <span>Kembali:</span>
                                <span>{{ formatRupiah(kembali) }}</span>
                            </div>
                            <div class="d-flex justify-space-between text-body-2">
                                <span>Pundi Amal:</span>
                                <span>{{ formatRupiah(payment.pundiAmal) }}</span>
                            </div>
                            <div class="d-flex justify-space-between text-h6 font-weight-bold">
                                <span>Netto Kembali:</span>
                                <span>{{ formatRupiah(nettoKembali) }}</span>
                            </div>
                        </div>
                    </v-col>

                    <v-col cols="12" md="7">
                        <div class="desktop-form-section">
                            <div class="text-subtitle-2 font-weight-bold mb-2">Input Pembayaran</div>
                            <v-text-field label="Tunai" v-model.number="payment.tunai" type="number" min="0"
                                variant="outlined" density="compact" hide-details>
                                <template #prepend-inner>
                                    <span class="input-prefix">Rp</span>
                                </template>
                            </v-text-field>
                            <v-row dense class="mt-2">
                                <v-col cols="6"><v-text-field label="No. Voucher" v-model="payment.voucher.nomor"
                                        variant="outlined" density="compact" hide-details
                                        @blur="validateVoucher" /></v-col>
                                <v-col cols="6">
                                    <v-text-field label="Nominal Voucher" v-model.number="payment.voucher.nominal"
                                        type="number" variant="outlined" min="0" density="compact" hide-details>
                                        <template #prepend-inner>
                                            <span class="input-prefix">Rp</span>
                                        </template>
                                    </v-text-field>
                                </v-col>
                            </v-row>
                            <v-divider class="my-3" />
                            <v-text-field label="Transfer / Card" v-model.number="payment.transfer.nominal"
                                type="number" variant="outlined" min="0" density="compact" hide-details>
                                <template #prepend-inner>
                                    <span class="input-prefix">Rp</span>
                                </template>
                            </v-text-field>
                            <v-text-field label="Akun Bank"
                                :model-value="`${payment.transfer.akun.kode || ''} - ${payment.transfer.akun.nama || ''}`"
                                readonly @click="dialogs.rekeningSearch = true" prepend-inner-icon="mdi-magnify"
                                variant="outlined" density="compact" hide-details />
                            <v-text-field label="Tgl. Transfer" v-model="payment.transfer.tanggal" type="date"
                                variant="outlined" density="compact" hide-details />
                            <v-divider class="my-3" />
                            <v-row dense>
                                <v-col cols="6"><v-text-field label="No. Retur" v-model="payment.retur.nomor"
                                        variant="outlined" density="compact" hide-details readonly
                                        @click="dialogs.returJualSearch = true"
                                        @keydown.f1.prevent="dialogs.returJualSearch = true"
                                        prepend-inner-icon="mdi-magnify"></v-text-field>
                                </v-col>
                                <v-col cols="6"><v-text-field label="Nominal Retur"
                                        v-model.number="payment.retur.nominal" type="number" min="0" variant="outlined"
                                        density="compact" hide-details>
                                        <template #prepend-inner>
                                            <span class="input-prefix">Rp</span>
                                        </template>
                                    </v-text-field>
                                </v-col>
                            </v-row>
                        </div>
                    </v-col>
                </v-row>
            </v-card-text>

            <v-divider />
            <v-card-actions class="pa-4">
                <v-spacer />
                <v-btn @click="$emit('close')" :disabled="isSaving">Batal</v-btn>
                <v-btn color="primary" @click="handleFinalSave" :loading="isSaving" prepend-icon="mdi-check-circle"
                    size="large">
                    Simpan Pembayaran & Invoice
                </v-btn>
            </v-card-actions>
        </v-card>

        <RekeningSearchModal v-if="dialogs.rekeningSearch" :cabang="invoiceHeader.gudang.kode"
            @close="dialogs.rekeningSearch = false" @selected="onRekeningSelected" />
        <AuthorizationModal v-if="authDialog.show" ref="authModalRef" :title="authDialog.title"
            :challenge-code="authDialog.challengeCode" @close="authDialog.show = false" @success="handleAuthSuccess" />
        <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir', 'wa']" @close="onPrintModalClose"
            @select="handlePrintSelection" />
        <ReturJualSearchModal v-if="dialogs.returJualSearch" :customer-kode="invoiceHeader.customer.kode"
            :invoice-nomor="invoiceHeader.nomor" @close="dialogs.returJualSearch = false" @selected="onReturSelected" />
        <SatisfactionSurveyModal v-if="isSurveyVisible" @close="isSurveyVisible = false" @submit="handleSurveySubmit" />
    </v-dialog>
</template>

<style scoped>
/* Menargetkan semua komponen di dalam kartu dialog */
.v-card :deep(.v-label) {
    font-size: 11px !important;
}

.v-card :deep(input),
.v-card :deep(textarea),
.v-card :deep(.v-select__selection-text) {
    font-size: 11px !important;
}

/* Mengatur jarak antar field agar lebih rapat */
.desktop-form-section :deep(.v-input) {
    margin-bottom: 8px !important;
}

/* Merapikan tampilan summary total */
.totals-summary {
    background-color: #f7f9fc;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
}

.input-prefix {
    font-size: 11px;
    color: #555;
    margin-right: 8px;
    align-self: center;
    /* Memastikan 'Rp' di tengah secara vertikal */
}
</style>

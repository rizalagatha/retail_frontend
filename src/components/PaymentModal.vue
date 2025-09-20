<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
import api from '@/services/api';
import { useRouter } from 'vue-router';
import RekeningSearchModal from './RekeningSearchModal.vue'; // Asumsi modal ini sudah ada
import AuthorizationModal from '@/components/AuthorizationModal.vue';

const props = defineProps({
    invoiceHeader: { type: Object, required: true },
    invoiceItems: { type: Array, required: true },
    totals: { type: Object, required: true },
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
});

const authDialog = reactive({
    show: false,
    title: 'Otorisasi Invoice Belum Lunas',
    challengeCode: '',
});
const authModalRef = ref<any>(null);
const temporaryPin = ref('');

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
    // Logika pundi amal sederhana
    const sisaKembalian = kembali.value;
    if (sisaKembalian > 0 && sisaKembalian < 1000) { // Contoh: jika kembalian di bawah 1000
        payment.pundiAmal = sisaKembalian;
        return 0;
    }
    payment.pundiAmal = 0;
    return sisaKembalian;
});

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

// --- Methods ---
const onRekeningSelected = (rekening: any) => {
    payment.transfer.akun = rekening;
    dialogs.rekeningSearch = false;
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

const requestAuthorization = () => {
    authDialog.challengeCode = Math.floor(100 + Math.random() * 900).toString();
    authDialog.show = true;
};

const handleAuthSuccess = async (pin: string) => {
    try {
        // Validasi PIN ke backend
        await api.post('/otorisasi/validate-pin', {
            pin,
            challengeCode: authDialog.challengeCode
        });
        toast.success('Otorisasi berhasil.');
        authDialog.show = false;
        temporaryPin.value = pin; // Simpan PIN yang valid

        // Lanjutkan proses simpan setelah otorisasi berhasil
        await executeSave();

    } catch (error: any) {
        authModalRef.value?.setFailed(error.response?.data?.message || 'PIN tidak valid');
    }
};

const executeSave = async () => {
    isSaving.value = true;
    try {
        const payload = {
            header: props.invoiceHeader,
            items: props.invoiceItems.filter((item: any) => item.kode),
            dps: props.linkedDps,
            payment: {
                ...payment,
                pinBelumLunas: temporaryPin.value // Sertakan PIN jika ada
            },
            isNew: !props.invoiceHeader.nomor,
        };

        const response = await api.post('/invoice-form/save', payload);
        toast.success(response.data.message);
        emit('save-success', response.data.nomor);
        emit('close');

        const url = router.resolve({ name: 'InvoicePrint', params: { nomor: response.data.nomor } }).href;
        window.open(url, '_blank');

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan invoice.');
    } finally {
        isSaving.value = false;
        temporaryPin.value = ''; // Reset PIN
    }
}

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
                            <v-text-field label="Tunai" v-model.number="payment.tunai" type="number" variant="outlined"
                                density="compact" hide-details>
                                <template #prepend-inner>
                                    <span class="input-prefix">Rp</span>
                                </template>
                            </v-text-field>
                            <v-row dense class="mt-2">
                                <v-col cols="6"><v-text-field label="No. Voucher" v-model="payment.voucher.nomor"
                                        variant="outlined" density="compact" hide-details /></v-col>
                                <v-col cols="6">
                                    <v-text-field label="Nominal Voucher" v-model.number="payment.voucher.nominal"
                                        type="number" variant="outlined" density="compact" hide-details>
                                        <template #prepend-inner>
                                            <span class="input-prefix">Rp</span>
                                        </template>
                                    </v-text-field>
                                </v-col>
                            </v-row>
                            <v-divider class="my-3" />
                            <v-text-field label="Transfer / Card" v-model.number="payment.transfer.nominal"
                                type="number" variant="outlined" density="compact" hide-details>
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
                                        variant="outlined" density="compact" hide-details /></v-col>
                                <v-col cols="6"><v-text-field label="Nominal Retur"
                                        v-model.number="payment.retur.nominal" type="number" variant="outlined"
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

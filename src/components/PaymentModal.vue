<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
import api from '@/services/api';
import { useRouter } from 'vue-router';
import RekeningSearchModal from './RekeningSearchModal.vue'; // Asumsi modal ini sudah ada

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
    // --- Final Validation ---
    if (totalBayar.value < props.totals.sisaPiutang) {
        if (!confirm('Total pembayaran kurang dari sisa piutang. Yakin ingin melanjutkan?')) {
            return;
        }
    }
    if (payment.transfer.nominal > 0 && !payment.transfer.akun.kode) {
        return toast.error('Akun bank untuk transfer harus diisi.');
    }

    isSaving.value = true;
    try {
        const payload = {
            header: props.invoiceHeader,
            items: props.invoiceItems.filter((item: any) => item.kode),
            dps: [], // Anda bisa teruskan props.linkedDps jika diperlukan
            payment: payment,
            isNew: !props.invoiceHeader.nomor,
        };

        const response = await api.post('/invoice-form/save', payload);
        toast.success(response.data.message);
        emit('save-success', response.data.nomor); // Kirim nomor invoice baru ke parent
        emit('close');

        // Arahkan ke halaman cetak
        const url = router.resolve({ name: 'InvoicePrint', params: { nomor: response.data.nomor } }).href;
        window.open(url, '_blank');

    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan invoice.');
    } finally {
        isSaving.value = false;
    }
};
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
                    <!-- Left Column: Payment Inputs -->
                    <v-col cols="12" md="7">
                        <div class="desktop-form-section">
                            <v-text-field label="Tunai" v-model.number="payment.tunai" type="number" prefix="Rp"
                                variant="outlined" density="compact" hide-details />
                            <v-row dense>
                                <v-col cols="6"><v-text-field label="No. Voucher" v-model="payment.voucher.nomor"
                                        variant="outlined" density="compact" hide-details /></v-col>
                                <v-col cols="6"><v-text-field label="Nominal Voucher"
                                        v-model.number="payment.voucher.nominal" type="number" prefix="Rp"
                                        variant="outlined" density="compact" hide-details /></v-col>
                            </v-row>
                            <v-divider class="my-3" />
                            <v-text-field label="Transfer / Card" v-model.number="payment.transfer.nominal"
                                type="number" prefix="Rp" variant="outlined" density="compact" hide-details />
                            <v-text-field label="Akun Bank"
                                :model-value="`${payment.transfer.akun.kode} - ${payment.transfer.akun.nama}`" readonly
                                @click="dialogs.rekeningSearch = true" prepend-inner-icon="mdi-magnify"
                                variant="outlined" density="compact" hide-details />
                            <v-text-field label="Tgl. Transfer" v-model="payment.transfer.tanggal" type="date"
                                variant="outlined" density="compact" hide-details />
                            <v-divider class="my-3" />
                            <v-row dense>
                                <v-col cols="6"><v-text-field label="No. Retur" v-model="payment.retur.nomor"
                                        variant="outlined" density="compact" hide-details /></v-col>
                                <v-col cols="6"><v-text-field label="Nominal Retur"
                                        v-model.number="payment.retur.nominal" type="number" prefix="Rp"
                                        variant="outlined" density="compact" hide-details /></v-col>
                            </v-row>
                        </div>
                    </v-col>

                    <!-- Right Column: Summary -->
                    <v-col cols="12" md="5">
                        <div class="desktop-form-section d-flex flex-column" style="gap: 8px;">
                            <div class="d-flex justify-space-between">
                                <span class="text-subtitle-1">Sisa Piutang:</span>
                                <span class="text-subtitle-1 font-weight-bold">{{ formatRupiah(totals.sisaPiutang)
                                    }}</span>
                            </div>
                            <v-divider />
                            <div class="d-flex justify-space-between">
                                <span class="text-subtitle-1">Total Bayar:</span>
                                <span class="text-subtitle-1 font-weight-bold">{{ formatRupiah(totalBayar) }}</span>
                            </div>
                            <v-divider />
                            <div class="d-flex justify-space-between">
                                <span class="text-body-2">Kembali:</span>
                                <span class="text-body-2">{{ formatRupiah(kembali) }}</span>
                            </div>
                            <div class="d-flex justify-space-between">
                                <span class="text-body-2">Pundi Amal:</span>
                                <span class="text-body-2">{{ formatRupiah(payment.pundiAmal) }}</span>
                            </div>
                            <div class="d-flex justify-space-between text-h6 font-weight-bold">
                                <span>Netto Kembali:</span>
                                <span>{{ formatRupiah(nettoKembali) }}</span>
                            </div>
                        </div>
                    </v-col>
                </v-row>
            </v-card-text>

            <v-card-actions class="pa-4">
                <v-spacer />
                <v-btn @click="$emit('close')" :disabled="isSaving">Batal</v-btn>
                <v-btn color="primary" @click="handleFinalSave" :loading="isSaving" prepend-icon="mdi-check-circle">
                    Simpan Pembayaran & Invoice
                </v-btn>
            </v-card-actions>
        </v-card>

        <RekeningSearchModal v-if="dialogs.rekeningSearch" :cabang="invoiceHeader.gudang.kode"
            @close="dialogs.rekeningSearch = false" @selected="onRekeningSelected" />
    </v-dialog>
</template>

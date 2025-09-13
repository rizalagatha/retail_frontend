<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import RekeningSearchModal from './RekeningSearchModal.vue';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';

// --- Inisialisasi ---
const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();

const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat('id-ID').format(angka || 0);
};

// --- Computed ---
const kekuranganDp = computed(() => {
    const kurang = props.minimalDp - props.existingDp;
    return kurang > 0 ? kurang : 0; // Pastikan tidak negatif
});

const props = defineProps({
    customerKode: { type: String, required: true },
    minimalDp: { type: Number, default: 0 },
    existingDp: { type: Number, default: 0 }
});
const emit = defineEmits(['close', 'dp-saved']);

const dpData = ref({
    tanggal: new Date().toISOString().substring(0, 10),
    jenis: 'TUNAI',
    nominal: kekuranganDp.value,
    keterangan: 'DP Tambahan',
    bankData: {
        akun: '',
        namaBank: '',
        norek: '',
        tglTransfer: new Date().toISOString().substring(0, 10),
    },
    giroData: {
        noGiro: '',
        tglGiro: new Date().toISOString().substring(0, 10),
        tglJatuhTempo: new Date().toISOString().substring(0, 10),
    }
});
const isSaving = ref(false);
const isRekeningSearchVisible = ref(false);

watch(kekuranganDp, (newValue) => {
    dpData.value.nominal = newValue;
}, { immediate: true });

const save = async () => {
    const nominal = dpData.value.nominal || 0;
    
    // --- PERBAIKAN: Gunakan validasi yang benar ---
    // Cek apakah nominal yang diinput setidaknya sebesar kekurangannya.
    if (nominal < kekuranganDp.value) {
        return toast.error(`Nominal DP kurang. Minimal tambahan yang harus dibayar adalah: ${formatRupiah(kekuranganDp.value)}`);
    }
    // --- AKHIR PERBAIKAN ---

    if ((dpData.value.nominal || 0) <= 0) {
        return toast.error('Nominal harus diisi.');
    }
    // if (dpData.value.nominal < props.minimalDp) {
    //     return toast.error(`Nominal DP tidak boleh kurang dari minimal: ${new Intl.NumberFormat('id-ID').format(props.minimalDp)}`);
    // }
    if (dpData.value.jenis === 'TRANSFER' && !dpData.value.bankData.akun) {
        return toast.error('Akun Bank harus dipilih.');
    }
    // if (dpData.value.nominal < kekuranganDp.value) {
    //     return toast.error(`Nominal DP kurang. Minimal tambahan: ${new Intl.NumberFormat('id-ID').format(kekuranganDp.value)}`);
    // }
    if (dpData.value.jenis === 'GIRO' && !dpData.value.giroData.noGiro) return toast.error('No. Giro harus diisi.');
    isSaving.value = true;
    try {
        const payload = { ...dpData.value, customerKode: props.customerKode };
        const response = await api.post('/so-form/save-dp', payload);
        toast.success(response.data.message);
        const newDp = response.data.newDp;
        if (newDp && newDp.nomor) {
            const url = router.resolve({
                name: 'Cetak DP',
                params: { nomor: newDp.nomor }
            }).href;
            window.open(url, '_blank');
        }
        emit('dp-saved', response.data.newDp);
        emit('close');
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan DP.');
    } finally {
        isSaving.value = false;
    }
};

const onRekeningSelected = (rekening: any) => {
    dpData.value.bankData.akun = rekening.kode;
    dpData.value.bankData.namaBank = rekening.nama;
    dpData.value.bankData.norek = rekening.rekening;
    isRekeningSearchVisible.value = false;
};
</script>

<template>
    <v-dialog :model-value="true" persistent max-width="500px">
        <v-card class="dialog-card">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Input DP (Uang Muka)</v-toolbar-title>
            </v-toolbar>
            <v-card-text class="pa-4">
                <v-row dense>
                    <v-col cols="12"><v-text-field label="Tanggal" v-model="dpData.tanggal" type="date"
                            variant="outlined" density="compact" /></v-col>
                    <v-col cols="12"><v-select label="Jenis" v-model="dpData.jenis"
                            :items="['TUNAI', 'TRANSFER', 'GIRO']" variant="outlined" density="compact" /></v-col>
                    <v-col cols="12"><v-text-field label="Nominal" v-model.number="dpData.nominal" type="number"
                            variant="outlined" density="compact" class="text-end" /></v-col>
                    <v-col cols="12"><v-text-field label="Keterangan" v-model="dpData.keterangan" variant="outlined"
                            density="compact" /></v-col>

                    <v-col v-if="dpData.jenis === 'TRANSFER'" cols="12">
                        <v-divider class="my-2" />
                        <v-text-field label="Akun Bank" v-model="dpData.bankData.akun" variant="outlined"
                            density="compact" @click="isRekeningSearchVisible = true" readonly
                            append-inner-icon="mdi-magnify" />
                        <v-text-field label="Nama Bank" v-model="dpData.bankData.namaBank" density="compact" readonly
                            filled />
                        <v-text-field label="No. Rekening" v-model="dpData.bankData.norek" density="compact" readonly
                            filled />
                        <v-text-field label="Tgl. Transfer" v-model="dpData.bankData.tglTransfer" type="date"
                            variant="outlined" density="compact" />
                    </v-col>
                    <v-col v-if="dpData.jenis === 'GIRO'" cols="12">
                        <v-divider class="my-2" />
                        <p class="text-subtitle-2 mb-2">Detail Giro</p>
                        <v-text-field label="No. Giro" v-model="dpData.giroData.noGiro" variant="outlined"
                            density="compact" />
                        <v-text-field label="Tgl. Giro" v-model="dpData.giroData.tglGiro" type="date" variant="outlined"
                            density="compact" class="mt-2" />
                        <v-text-field label="Tgl. Jatuh Tempo" v-model="dpData.giroData.tglJatuhTempo" type="date"
                            variant="outlined" density="compact" class="mt-2" />
                    </v-col>
                    <v-card-text class="pa-4">
                        <v-alert density="compact" variant="tonal" class="mb-4">
                            <div class="d-flex justify-space-between"><span>Minimal DP Total:</span> <strong>{{ formatRupiah(minimalDp) }}</strong></div>
                            <div class="d-flex justify-space-between"><span>Sudah Dibayar:</span> <strong>{{ formatRupiah(existingDp) }}</strong></div>
                            <v-divider class="my-1" />
                            <div class="d-flex justify-space-between font-weight-bold"><span>Kekurangan:</span>
                                <strong>{{ formatRupiah(kekuranganDp) }}</strong></div>
                        </v-alert>
                        <v-row dense>
                        </v-row>
                    </v-card-text>
                </v-row>
            </v-card-text>
            <v-card-actions class="dialog-footer">
                <v-spacer />
                <v-btn size="small" @click="$emit('close')">Batal</v-btn>
                <v-btn size="small" color="primary" @click="save" :loading="isSaving">Simpan</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
    <RekeningSearchModal v-if="isRekeningSearchVisible" :cabang="authStore.user?.cabang || ''"
        @close="isRekeningSearchVisible = false" @selected="onRekeningSelected" />
</template>

<style scoped>
/* Menyamakan ukuran font di dalam dialog */
.dialog-card :deep(.v-label) {
    font-size: 11px !important;
}

.dialog-card :deep(input),
.dialog-card :deep(.v-select__selection-text) {
    font-size: 12px !important;
}

.dialog-footer {
    background-color: #f5f5f5;
}

.text-end input {
    text-align: right;
}
</style>

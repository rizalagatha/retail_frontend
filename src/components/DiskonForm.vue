<script setup lang="ts">
import { reactive, computed } from 'vue';

const props = defineProps({
    // Tambahkan prop baru untuk menerima total belanja
    subTotal: { type: Number, default: 0 },
    diskonPersen1: { type: Number, default: 0 },
    diskonPersen2: { type: Number, default: 0 },
    biayaKirim: { type: Number, default: 0 },
});
const emit = defineEmits(['close', 'save']);

const formData = reactive({
    diskonPersen1: props.diskonPersen1,
    diskonPersen2: props.diskonPersen2,
    biayaKirim: props.biayaKirim,
});

// Hitung diskon Rp secara real-time
const calculatedDiskonRp = computed(() => {
    const diskon1 = (formData.diskonPersen1 / 100) * props.subTotal;
    const afterDiscount1 = props.subTotal - diskon1;
    const diskon2 = (formData.diskonPersen2 / 100) * afterDiscount1;
    return Math.round(diskon1 + diskon2);
});

const save = () => {
    // Kirim kembali semua data, termasuk hasil kalkulasi
    emit('save', { ...formData, diskonRp: calculatedDiskonRp.value });
    emit('close');
};

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);
</script>

<template>
    <v-dialog :model-value="true" persistent max-width="400px">
        <v-card>
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title>Input Diskon & Biaya</v-toolbar-title>
                <v-spacer />
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4 header-section">
                <v-text-field label="Disc % 1" v-model.number="formData.diskonPersen1" variant="outlined" hide-details
                    density="compact" />
                <v-text-field label="Disc % 2" v-model.number="formData.diskonPersen2" variant="outlined" hide-details
                    density="compact" />
                <v-text-field label="Diskon Rp" :model-value="formatRupiah(calculatedDiskonRp)" readonly filled
                    hide-details density="compact" />
                <v-text-field label="Biaya Kirim" v-model.number="formData.biayaKirim" variant="outlined" hide-details
                    density="compact" />
            </v-card-text>
            <v-divider />
            <v-card-actions class="pa-4">
                <v-spacer />
                <v-btn size="small" @click="$emit('close')">Batal</v-btn>
                <v-btn size="small" color="primary" @click="save">Simpan</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>
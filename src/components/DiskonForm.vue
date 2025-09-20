<script setup lang="ts">
import { ref, reactive, toRefs } from 'vue';

const props = defineProps({
    diskonPersen1: { type: Number, default: 0 },
    diskonPersen2: { type: Number, default: 0 },
    diskonRp: { type: Number, default: 0 },
    biayaKirim: { type: Number, default: 0 },
});
const emit = defineEmits(['close', 'save']);

const formData = reactive({
    diskonPersen1: props.diskonPersen1,
    diskonPersen2: props.diskonPersen2,
    diskonRp: props.diskonRp,
    biayaKirim: props.biayaKirim,
});

const save = () => {
    emit('save', formData);
    emit('close');
};
</script>

<template>
    <v-dialog :model-value="true" persistent max-width="400px">
        <v-card>
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Input Diskon & Biaya</v-toolbar-title>
                <v-spacer />
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4">
                <div class="header-section">
                    <v-text-field label="Disc %" v-model.number="formData.diskonPersen1" variant="outlined" hide-details
                        density="compact" />
                    <v-text-field label="Disc % 2" v-model.number="formData.diskonPersen2" variant="outlined"
                        hide-details density="compact" />
                    <v-text-field label="Diskon Rp" v-model.number="formData.diskonRp" variant="outlined" hide-details
                        density="compact" />
                    <v-text-field label="Biaya Kirim" v-model.number="formData.biayaKirim" variant="outlined"
                        hide-details density="compact" />
                </div>
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
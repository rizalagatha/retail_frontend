<script setup lang="ts">
import { reactive, computed, ref } from 'vue';

const props = defineProps({
  subTotal: { type: Number, default: 0 },
  diskonPersen1: { type: Number, default: 0 },
  diskonPersen2: { type: Number, default: 0 },
  diskonRp: { type: Number, default: 0 },
  biayaKirim: { type: Number, default: 0 },
  mode: { type: String, default: 'persen' } // ← TAMBAHAN MODE
});

const emit = defineEmits(['close', 'save']);

const formData = reactive({
  diskonPersen1: props.diskonPersen1,
  diskonPersen2: props.diskonPersen2,
  biayaKirim: props.biayaKirim,
  mode: props.mode
});

// diskon rupiah input
const diskonRpInput = ref(props.diskonRp || 0);
const isDiskonRpFocused = ref(false);

// hitung diskon berdasarkan persen
const hitungDiskonPersen = computed(() => {
  const disc1 = (formData.diskonPersen1 / 100) * props.subTotal;
  const afterDisc1 = props.subTotal - disc1;
  const disc2 = (formData.diskonPersen2 / 100) * afterDisc1;
  return Math.round(disc1 + disc2);
});

// hitung diskon final tergantung mode
const finalDiskonRp = computed(() => {
  if (formData.mode === 'rp') {
    return diskonRpInput.value;
  }
  return hitungDiskonPersen.value;
});

const save = () => {
  emit('save', {
    diskonPersen1: formData.mode === 'persen' ? formData.diskonPersen1 : 0,
    diskonPersen2: formData.mode === 'persen' ? formData.diskonPersen2 : 0,
    diskonRp: finalDiskonRp.value,
    mode: formData.mode,
    biayaKirim: formData.biayaKirim
  });
  emit('close');
};

const formatRupiah = (v: number) => new Intl.NumberFormat('id-ID').format(v || 0);
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

        <v-text-field label="Diskon Rp"
          :model-value="isDiskonRpFocused ? diskonRpInput : formatRupiah(diskonRpInput || 0)"
          @update:model-value="diskonRpInput = Number(String($event).replace(/[^0-9]/g, '')) || 0"
          @focus="isDiskonRpFocused = true" @blur="isDiskonRpFocused = false" type="text" variant="outlined" min="0"
          hide-details density="compact" :disabled="formData.diskonPersen1 > 0 || formData.diskonPersen2 > 0" />

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

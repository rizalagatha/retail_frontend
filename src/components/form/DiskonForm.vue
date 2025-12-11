<script setup lang="ts">
import { reactive, computed, ref } from 'vue';

const props = defineProps({
  subTotal: { type: Number, default: 0 },
  diskonPersen1: { type: Number, default: 0 },
  diskonPersen2: { type: Number, default: 0 },
  diskonRp: { type: Number, default: 0 },
  biayaKirim: { type: Number, default: 0 },
  // [BARU] Props untuk Marketplace
  biayaPlatform: { type: Number, default: 0 },
  isMarketplace: { type: Boolean, default: false },
  mode: { type: String, default: 'persen' }
});

const emit = defineEmits(['close', 'save']);

// State Lokal untuk Input Rupiah (agar bisa diformat)
const inputDiskonRp = ref(props.diskonRp || 0);
const inputBiayaKirim = ref(props.biayaKirim || 0);
const inputBiayaPlatform = ref(props.biayaPlatform || 0);

// State Fokus untuk formatting display
const focusState = reactive({
  diskonRp: false,
  biayaKirim: false,
  biayaPlatform: false
});

const formData = reactive({
  diskonPersen1: props.diskonPersen1,
  diskonPersen2: props.diskonPersen2,
  mode: props.mode
});

// Helper Format Rupiah
const formatRupiah = (v: number) => new Intl.NumberFormat('id-ID').format(v || 0);

// Hitung estimasi diskon persen (hanya visual)
const estimasiDiskonPersen = computed(() => {
  const disc1 = (formData.diskonPersen1 / 100) * props.subTotal;
  const afterDisc1 = props.subTotal - disc1;
  const disc2 = (formData.diskonPersen2 / 100) * afterDisc1;
  return Math.round(disc1 + disc2);
});

// Tentukan nilai final diskon Rp yang akan disimpan
const finalDiskonRp = computed(() => {
  // Jika user isi Persen, abaikan input Rp manual
  if (formData.diskonPersen1 > 0 || formData.diskonPersen2 > 0) {
    return estimasiDiskonPersen.value;
  }
  return inputDiskonRp.value;
});

const save = () => {
  emit('save', {
    diskonPersen1: formData.mode === 'persen' ? formData.diskonPersen1 : 0,
    diskonPersen2: formData.mode === 'persen' ? formData.diskonPersen2 : 0,
    diskonRp: finalDiskonRp.value,
    mode: formData.mode,

    // [UPDATE] Kirim nilai dari ref input
    biayaKirim: inputBiayaKirim.value,
    biayaPlatform: inputBiayaPlatform.value,
  });
  emit('close');
};
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="450px">
    <v-card>
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          Potongan & Biaya Tambahan
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 header-section">

        <div class="text-caption font-weight-bold text-primary mb-2">POTONGAN / DISKON</div>
        <v-row dense>
          <v-col cols="6">
            <v-text-field label="Disc % 1" v-model.number="formData.diskonPersen1" variant="outlined" hide-details
              density="compact" suffix="%" class="mb-2" />
          </v-col>
          <v-col cols="6">
            <v-text-field label="Disc % 2" v-model.number="formData.diskonPersen2" variant="outlined" hide-details
              density="compact" suffix="%" class="mb-2" />
          </v-col>
        </v-row>

        <v-text-field label="Diskon Nominal (Rp)"
          :model-value="focusState.diskonRp ? inputDiskonRp : formatRupiah(inputDiskonRp)"
          @update:model-value="inputDiskonRp = Number(String($event).replace(/[^0-9]/g, '')) || 0"
          @focus="focusState.diskonRp = true" @blur="focusState.diskonRp = false"
          :disabled="formData.diskonPersen1 > 0 || formData.diskonPersen2 > 0"
          :hint="formData.diskonPersen1 > 0 || formData.diskonPersen2 > 0 ? `Otomatis: Rp ${formatRupiah(estimasiDiskonPersen)}` : ''"
          persistent-hint variant="outlined" density="compact" class="mb-4" />

        <v-divider class="my-4"></v-divider>

        <div class="text-caption font-weight-bold text-primary mb-2">BIAYA TAMBAHAN</div>

        <v-text-field label="Biaya Kirim (Ongkir)"
          :model-value="focusState.biayaKirim ? inputBiayaKirim : formatRupiah(inputBiayaKirim)"
          @update:model-value="inputBiayaKirim = Number(String($event).replace(/[^0-9]/g, '')) || 0"
          @focus="focusState.biayaKirim = true" @blur="focusState.biayaKirim = false" variant="outlined" hide-details
          density="compact" prefix="Rp" class="mb-3" />

        <v-expand-transition>
          <div v-if="isMarketplace">
            <v-text-field label="Biaya Layanan Platform (Admin)"
              :model-value="focusState.biayaPlatform ? inputBiayaPlatform : formatRupiah(inputBiayaPlatform)"
              @update:model-value="inputBiayaPlatform = Number(String($event).replace(/[^0-9]/g, '')) || 0"
              @focus="focusState.biayaPlatform = true" @blur="focusState.biayaPlatform = false" variant="outlined"
              hide-details density="compact" prefix="Rp" color="orange-darken-2" class="mb-1">
              <template #prepend-inner>
                <v-icon size="small" color="orange">mdi-hand-coin</v-icon>
              </template>
            </v-text-field>
            <div class="text-caption text-grey ml-1">
              *Biaya ini dicatat sebagai pengeluaran.
            </div>
          </div>
        </v-expand-transition>

      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-3 bg-grey-lighten-5">
        <v-spacer />
        <v-btn size="small" variant="text" @click="$emit('close')">Batal</v-btn>
        <v-btn size="small" color="primary" variant="flat" @click="save" width="100">Simpan</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

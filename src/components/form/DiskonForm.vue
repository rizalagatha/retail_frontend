<script setup lang="ts">
import { reactive, computed, ref, watch } from "vue";

const props = defineProps({
  subTotal: { type: Number, default: 0 },
  diskonPersen1: { type: Number, default: 0 },
  diskonPersen2: { type: Number, default: 0 },
  diskonRp: { type: Number, default: 0 },
  biayaKirim: { type: Number, default: 0 },
  biayaPlatform: { type: Number, default: 0 },
  isMarketplace: { type: Boolean, default: false },
  mode: { type: String, default: "persen" },
});

const emit = defineEmits(["close", "save"]);

// State Lokal untuk Input (Inisialisasi dari Props)
const inputDiskonRp = ref(0);
const inputBiayaKirim = ref(props.biayaKirim || 0);
const inputBiayaPlatform = ref(props.biayaPlatform || 0);

const formData = reactive({
  diskonPersen1: props.diskonPersen1 || 0,
  diskonPersen2: props.diskonPersen2 || 0,
  mode: props.mode,
});

// State Fokus untuk formatting display
const focusState = reactive({
  diskonRp: false,
  biayaKirim: false,
  biayaPlatform: false,
});

// --- Inisialisasi Mutually Exclusive ---
// Jika ada diskon persen 1 saat modal dibuka, pastikan input Rp nol (dan terkunci)
if (props.diskonPersen1 > 0) {
  inputDiskonRp.value = 0;
} else {
  // Jika tidak ada diskon persen 1, cari tahu berapa nominal murni dari diskonRp
  // (Mengembalikan nilai diskon manual tanpa campuran hitungan P2)
  const p2 = props.diskonPersen2 || 0;
  const total = props.subTotal || 0;
  let manualAwal = 0;

  if (p2 < 100) {
    manualAwal = (props.diskonRp - (p2 / 100) * total) / (1 - p2 / 100);
  }
  inputDiskonRp.value = Math.max(0, Math.round(manualAwal));
}

// --- Helper Format Rupiah ---
const formatRupiah = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

// --- Watchers Mutually Exclusive ---
// Jika user ngetik Persen 1, reset Nominal Rp
watch(
  () => formData.diskonPersen1,
  (newVal) => {
    if (newVal > 0) {
      inputDiskonRp.value = 0;
    }
  }
);

// --- Computed: Total Diskon ---
// Dihitung dengan rumus Tiering (Bertingkat) seperti di DiscountCostModal
const totalDiskonDihitung = computed(() => {
  const totalBruto = props.subTotal || 0;
  const nominalManual = inputDiskonRp.value || 0;
  const p1 = formData.diskonPersen1 || 0;
  const p2 = formData.diskonPersen2 || 0;

  let baseDiscount = 0;

  // Aturan Tiering: Hanya pakai salah satu sebagai diskon dasar
  if (p1 > 0) {
    baseDiscount = (p1 / 100) * totalBruto;
  } else {
    baseDiscount = nominalManual;
  }

  // Diskon 2 (MAPS) selalu dari SISA
  const remaining = totalBruto - baseDiscount;
  const disc2 = (p2 / 100) * remaining;

  return Math.round(baseDiscount + disc2);
});

const save = () => {
  emit("save", {
    diskonPersen1: formData.diskonPersen1,
    diskonPersen2: formData.diskonPersen2,
    diskonRp: totalDiskonDihitung.value, // Kirim Total Diskon Akhir ke Parent
    mode: formData.mode,
    biayaKirim: inputBiayaKirim.value,
    biayaPlatform: inputBiayaPlatform.value,
  });
  emit("close");
};
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="450px">
    <v-card>
      <v-toolbar color="primary" density="compact" class="px-4">
        <div class="text-subtitle-1 font-weight-bold text-white">Potongan & Biaya Tambahan</div>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 header-section">
        <div class="text-caption font-weight-bold text-primary mb-2">
          PILIH SALAH SATU DISKON DASAR
        </div>
        <v-row dense>
          <v-col cols="6">
            <v-text-field
              label="Disc % 1 (Member)"
              v-model.number="formData.diskonPersen1"
              variant="outlined"
              hide-details="auto"
              density="compact"
              suffix="%"
              class="mb-2"
              :disabled="inputDiskonRp > 0"
              :hint="inputDiskonRp > 0 ? 'Dinonaktifkan' : ''"
              persistent-hint
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              label="Diskon Nominal (Rp)"
              :model-value="focusState.diskonRp ? inputDiskonRp : formatRupiah(inputDiskonRp)"
              @update:model-value="
                inputDiskonRp = Number(String($event).replace(/[^0-9]/g, '')) || 0
              "
              @focus="focusState.diskonRp = true"
              @blur="focusState.diskonRp = false"
              variant="outlined"
              density="compact"
              hide-details="auto"
              class="mb-2"
              :disabled="formData.diskonPersen1 > 0"
              :hint="formData.diskonPersen1 > 0 ? 'Dinonaktifkan' : ''"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-divider class="my-4"></v-divider>

        <div class="text-caption font-weight-bold text-primary mb-2">DISKON TAMBAHAN (TIER 2)</div>
        <v-row dense>
          <v-col cols="6">
            <v-text-field
              label="Disc % 2 (MAPS)"
              v-model.number="formData.diskonPersen2"
              variant="outlined"
              hide-details="auto"
              density="compact"
              suffix="%"
              class="mb-4"
              :hint="`Total Potongan: Rp ${formatRupiah(totalDiskonDihitung)}`"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-divider class="my-4"></v-divider>

        <div class="text-caption font-weight-bold text-primary mb-2">BIAYA TAMBAHAN</div>

        <v-text-field
          label="Biaya Kirim (Ongkir)"
          :model-value="focusState.biayaKirim ? inputBiayaKirim : formatRupiah(inputBiayaKirim)"
          @update:model-value="inputBiayaKirim = Number(String($event).replace(/[^0-9]/g, '')) || 0"
          @focus="focusState.biayaKirim = true"
          @blur="focusState.biayaKirim = false"
          variant="outlined"
          hide-details
          density="compact"
          prefix="Rp"
          class="mb-3"
        />

        <v-expand-transition>
          <div v-if="isMarketplace">
            <v-text-field
              label="Biaya Layanan Platform (Admin)"
              :model-value="
                focusState.biayaPlatform ? inputBiayaPlatform : formatRupiah(inputBiayaPlatform)
              "
              @update:model-value="
                inputBiayaPlatform = Number(String($event).replace(/[^0-9]/g, '')) || 0
              "
              @focus="focusState.biayaPlatform = true"
              @blur="focusState.biayaPlatform = false"
              variant="outlined"
              hide-details
              density="compact"
              prefix="Rp"
              color="orange-darken-2"
              class="mb-1"
            >
              <template #prepend-inner>
                <v-icon size="small" color="orange">mdi-hand-coin</v-icon>
              </template>
            </v-text-field>
            <div class="text-caption text-grey ml-1">*Biaya ini dicatat sebagai pengeluaran.</div>
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

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

// State Lokal untuk Input
const inputDiskonRp = ref(0);
const inputBiayaKirim = ref(props.biayaKirim || 0);
const inputBiayaPlatform = ref(props.biayaPlatform || 0);

const formData = reactive({
  diskonPersen1: props.diskonPersen1 || 0,
  diskonPersen2: props.diskonPersen2 || 0,
  mode: props.mode,
});

const focusState = reactive({ diskonRp: false, biayaKirim: false, biayaPlatform: false });

// --- Inisialisasi Mutually Exclusive ---
if (props.diskonPersen1 > 0) {
  inputDiskonRp.value = 0;
} else {
  // [PERBAIKAN] Langsung gunakan props.diskonRp karena nilainya sekarang sudah murni (tidak kecampur Maps lagi)
  inputDiskonRp.value = props.diskonRp || 0;
}

const formatRupiah = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

watch(
  () => formData.diskonPersen1,
  (newVal) => {
    if (newVal > 0) inputDiskonRp.value = 0;
  }
);

// --- [BARU] LOGIKA KELAYAKAN PROMO MAPS (SOP TERBARU) ---
const isEligibleForMaps = computed(() => {
  if (props.subTotal < 200000) return false; // Rule 1: Min 200rb
  // Rule 2: Jika dapat diskon 10% (Distributor) dan total belanja >= 1 Juta, maka HANGUS
  if (formData.diskonPersen1 >= 10 && props.subTotal >= 1000000) return false;
  return true;
});

const mapsIneligibleReason = computed(() => {
  if (props.subTotal < 200000) return "Minimal belanja Rp 200.000 untuk promo ini.";
  if (formData.diskonPersen1 >= 10 && props.subTotal >= 1000000)
    return "Distributor (Diskon ≥ 10%) tidak dapat digabung dengan promo ini.";
  return "";
});

const toggleMapsPromo = () => {
  formData.diskonPersen2 = formData.diskonPersen2 === 5 ? 0 : 5;
};
// --------------------------------------------------------

// const totalDiskonDihitung = computed(() => {
//   const totalBruto = props.subTotal || 0;
//   const nominalManual = inputDiskonRp.value || 0;
//   const p1 = formData.diskonPersen1 || 0;
//   const p2 = formData.diskonPersen2 || 0;

//   let baseDiscount = p1 > 0 ? (p1 / 100) * totalBruto : nominalManual;
//   const remaining = totalBruto - baseDiscount;
//   const disc2 = (p2 / 100) * remaining;

//   return Math.round(baseDiscount + disc2);
// });

const save = () => {
  emit("save", {
    diskonPersen1: formData.diskonPersen1,
    diskonPersen2: formData.diskonPersen2,
    // [KUNCI PERBAIKAN] Kirim nominal dasarnya saja, bukan totalnya!
    diskonRp: inputDiskonRp.value,
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

        <div class="text-caption font-weight-bold text-primary mb-2">
          PROMO GOOGLE MAPS REVIEW (5%)
        </div>
        <v-row dense>
          <v-col cols="12">
            <v-btn
              :color="formData.diskonPersen2 === 5 ? 'success' : 'blue-grey-lighten-4'"
              :variant="formData.diskonPersen2 === 5 ? 'flat' : 'outlined'"
              :class="formData.diskonPersen2 === 5 ? 'text-white' : 'text-blue-grey-darken-2'"
              block
              class="mb-1 font-weight-bold"
              :disabled="!isEligibleForMaps"
              @click="toggleMapsPromo"
            >
              <v-icon start size="large">{{
                formData.diskonPersen2 === 5 ? "mdi-check-decagram" : "mdi-google-maps"
              }}</v-icon>
              {{
                formData.diskonPersen2 === 5
                  ? "Promo Maps Review Diterapkan (5%)"
                  : "Klaim Promo Review Maps (5%)"
              }}
            </v-btn>
            <div v-if="!isEligibleForMaps" class="text-caption text-error font-italic mb-3 px-1">
              * {{ mapsIneligibleReason }}
            </div>
            <div v-else class="text-caption text-medium-emphasis mb-3 px-1">
              *
              {{
                formData.diskonPersen2 === 5
                  ? `Total Potongan Review: Rp ${formatRupiah(
                      (5 / 100) * (props.subTotal - (formData.diskonPersen1 / 100) * props.subTotal)
                    )}`
                  : "Klik untuk menerapkan diskon tambahan 5%"
              }}
            </div>
          </v-col>
        </v-row>

        <v-divider class="my-2"></v-divider>

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

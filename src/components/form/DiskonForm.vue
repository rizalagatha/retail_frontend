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
  // Invoice dari SO: diskon & ongkir dihitung server, dialog hanya menampilkan
  dariSo: { type: Boolean, default: false },
  potonganInvoice: { type: Number, default: 0 },
});

const emit = defineEmits(["close", "save"]);

const formatRupiah = (v: number) => new Intl.NumberFormat("id-ID").format(Math.round(v || 0));

// State lokal untuk input
const inputDiskonRp = ref(0);
const inputBiayaKirim = ref(props.biayaKirim || 0);
const inputBiayaPlatform = ref(props.biayaPlatform || 0);

const formData = reactive({
  diskonPersen1: props.diskonPersen1 || 0,
  diskonPersen2: props.diskonPersen2 || 0,
  mode: props.mode,
});

const focusState = reactive({ diskonRp: false, biayaKirim: false, biayaPlatform: false });

// --- Inisialisasi mutually exclusive (Disc % 1 vs Diskon Rp) ---
if (!(props.diskonPersen1 > 0)) {
  inputDiskonRp.value = props.diskonRp || 0;
}

watch(
  () => formData.diskonPersen1,
  (newVal) => {
    if (Number(newVal) > 0) inputDiskonRp.value = 0;
  }
);

const onlyDigits = (v: unknown) => Number(String(v).replace(/[^0-9]/g, "")) || 0;

// --- Kelayakan promo Maps ---
const isEligibleForMaps = computed(() => {
  if (props.subTotal < 200000) return false; // Rule 1: min 200rb
  // Rule 2: diskon ≥ 10% (Distributor) dan belanja ≥ 1 juta → hangus
  if (Number(formData.diskonPersen1) >= 10 && props.subTotal >= 1000000) return false;
  return true;
});

const mapsIneligibleReason = computed(() => {
  if (props.subTotal < 200000) return "Minimal belanja Rp 200.000 untuk promo ini.";
  if (Number(formData.diskonPersen1) >= 10 && props.subTotal >= 1000000)
    return "Distributor (Diskon ≥ 10%) tidak dapat digabung dengan promo ini.";
  return "";
});

// Promo yang sudah dipilih otomatis dibatalkan kalau syaratnya tidak terpenuhi lagi
watch(
  isEligibleForMaps,
  (ok) => {
    if (!ok && !props.dariSo) formData.diskonPersen2 = 0;
  },
  { immediate: true }
);

const mapsAktif = computed(() => formData.diskonPersen2 === 5);

const toggleMapsPromo = () => {
  if (props.dariSo || !isEligibleForMaps.value) return;
  formData.diskonPersen2 = mapsAktif.value ? 0 : 5;
};

// --- Ringkasan ---
const diskonDasarRp = computed(() => {
  const p1 = Number(formData.diskonPersen1) || 0;
  return p1 > 0 ? (p1 / 100) * props.subTotal : inputDiskonRp.value;
});

const mapsRp = computed(() => (5 / 100) * Math.max(0, props.subTotal - diskonDasarRp.value));

const totalPotongan = computed(() =>
  Math.round(diskonDasarRp.value + (mapsAktif.value ? mapsRp.value : 0))
);

// --- Validasi ---
const errorPersen = computed(() => {
  const p = Number(formData.diskonPersen1) || 0;
  return p < 0 || p > 100 ? "Harus antara 0 dan 100%" : "";
});

const errorRp = computed(() => (inputDiskonRp.value > props.subTotal ? "Melebihi subtotal" : ""));

const bisaSimpan = computed(() => !errorPersen.value && !errorRp.value);

const save = () => {
  if (!bisaSimpan.value) return;
  emit("save", {
    diskonPersen1: Number(formData.diskonPersen1) || 0,
    diskonPersen2: formData.diskonPersen2,
    // Kirim nominal dasarnya saja, bukan totalnya
    diskonRp: inputDiskonRp.value,
    mode: formData.mode,
    biayaKirim: inputBiayaKirim.value,
    biayaPlatform: inputBiayaPlatform.value,
  });
  emit("close");
};
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="480px" @update:model-value="emit('close')">
    <v-card rounded="lg" class="diskon-modal-card">
      <div class="diskon-modal-header">
        <div class="header-icon-circle">
          <v-icon icon="mdi-sale-outline" size="20" color="white" />
        </div>
        <div class="header-text">
          <div class="header-title">Potongan &amp; Biaya Tambahan</div>
          <div class="header-subtitle">Subtotal Rp {{ formatRupiah(props.subTotal) }}</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" color="white" @click="emit('close')" />
      </div>

      <v-card-text class="diskon-body">
        <!-- ===== MODE INVOICE DARI SO: hanya tampilan ===== -->
        <template v-if="props.dariSo">
          <div class="so-lock-note">
            <v-icon size="18" color="#b71c1c">mdi-lock-outline</v-icon>
            <div>
              Diskon dan ongkir mengikuti SO. Diskon dibagi proporsional per invoice, dan ongkir
              hanya dibebankan di invoice pertama.
            </div>
          </div>
        </template>

        <!-- ===== MODE NORMAL ===== -->
        <template v-else>
          <div class="section-label">
            <v-icon size="14">mdi-percent-outline</v-icon>
            Diskon dasar <span class="section-hint">pilih salah satu</span>
          </div>
          <v-row dense>
            <v-col cols="6">
              <v-text-field
                label="Disc % 1 (Member)"
                v-model.number="formData.diskonPersen1"
                variant="outlined"
                density="compact"
                suffix="%"
                hide-details="auto"
                :disabled="inputDiskonRp > 0"
                :error-messages="errorPersen"
                :hint="inputDiskonRp > 0 ? 'Nonaktif (memakai Rp)' : ''"
                persistent-hint
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Diskon Nominal"
                :model-value="focusState.diskonRp ? inputDiskonRp : formatRupiah(inputDiskonRp)"
                @update:model-value="inputDiskonRp = onlyDigits($event)"
                @focus="focusState.diskonRp = true"
                @blur="focusState.diskonRp = false"
                variant="outlined"
                density="compact"
                prefix="Rp"
                hide-details="auto"
                :disabled="Number(formData.diskonPersen1) > 0"
                :error-messages="errorRp"
                :hint="Number(formData.diskonPersen1) > 0 ? 'Nonaktif (memakai %)' : ''"
                persistent-hint
              />
            </v-col>
          </v-row>

          <div class="section-label mt-5">
            <v-icon size="14">mdi-google-maps</v-icon>
            Promo Google Maps Review
          </div>
          <div
            class="maps-card"
            :class="{ 'is-on': mapsAktif, 'is-disabled': !isEligibleForMaps }"
            role="button"
            :tabindex="isEligibleForMaps ? 0 : -1"
            @click="toggleMapsPromo"
            @keydown.enter.prevent="toggleMapsPromo"
          >
            <div class="maps-icon">
              <v-icon :icon="mapsAktif ? 'mdi-check-decagram' : 'mdi-google-maps'" size="20" />
            </div>
            <div class="maps-text">
              <div class="maps-title">
                {{
                  mapsAktif ? "Promo Maps Review diterapkan (5%)" : "Klaim promo Maps Review (5%)"
                }}
              </div>
              <div v-if="!isEligibleForMaps" class="maps-sub text-error">
                {{ mapsIneligibleReason }}
              </div>
              <div v-else class="maps-sub">
                {{
                  mapsAktif
                    ? `Potongan Rp ${formatRupiah(mapsRp)}`
                    : `Estimasi potongan Rp ${formatRupiah(mapsRp)}`
                }}
              </div>
            </div>
          </div>

          <div class="section-label mt-5">
            <v-icon size="14">mdi-truck-delivery-outline</v-icon>
            Biaya tambahan
          </div>
          <v-text-field
            label="Biaya Kirim (Ongkir)"
            :model-value="focusState.biayaKirim ? inputBiayaKirim : formatRupiah(inputBiayaKirim)"
            @update:model-value="inputBiayaKirim = onlyDigits($event)"
            @focus="focusState.biayaKirim = true"
            @blur="focusState.biayaKirim = false"
            variant="outlined"
            density="compact"
            prefix="Rp"
            hide-details
          />

          <v-expand-transition>
            <div v-if="props.isMarketplace" class="mt-3">
              <v-text-field
                label="Biaya Layanan Platform (Admin)"
                :model-value="
                  focusState.biayaPlatform ? inputBiayaPlatform : formatRupiah(inputBiayaPlatform)
                "
                @update:model-value="inputBiayaPlatform = onlyDigits($event)"
                @focus="focusState.biayaPlatform = true"
                @blur="focusState.biayaPlatform = false"
                variant="outlined"
                density="compact"
                prefix="Rp"
                hide-details
              >
                <template #prepend-inner>
                  <v-icon size="small" color="#b71c1c">mdi-hand-coin</v-icon>
                </template>
              </v-text-field>
              <div class="field-note">Biaya ini dicatat sebagai pengeluaran.</div>
            </div>
          </v-expand-transition>
        </template>
      </v-card-text>

      <v-divider />

      <div class="diskon-summary">
        <div class="summary-row">
          <span class="summary-label">Total potongan</span>
          <span class="summary-value">
            Rp {{ formatRupiah(props.dariSo ? props.potonganInvoice : totalPotongan) }}
          </span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Biaya kirim</span>
          <span class="summary-value summary-value--sm">
            Rp {{ formatRupiah(props.dariSo ? props.biayaKirim : inputBiayaKirim) }}
          </span>
        </div>
      </div>

      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="tonal" color="grey-darken-1" @click="emit('close')">
          {{ props.dariSo ? "Tutup" : "Batal" }}
        </v-btn>
        <v-btn
          v-if="!props.dariSo"
          variant="flat"
          class="btn-simpan"
          :disabled="!bisaSimpan"
          @click="save"
        >
          Simpan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.diskon-modal-card {
  overflow: hidden;
}

.diskon-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 16px 20px;
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
}

.header-icon-circle {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.header-text {
  flex-grow: 1;
  min-width: 0;
}

.header-title {
  color: white;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.3;
}

.header-subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 500;
  margin-top: 1px;
}

.diskon-body {
  padding: 20px !important;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #b71c1c;
}

.section-hint {
  margin-left: 2px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: rgba(0, 0, 0, 0.45);
}

.field-note {
  margin: 4px 0 0 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.5);
}

/* Fokus input mengikuti tema merah */
.diskon-modal-card :deep(.v-field--focused .v-field__outline) {
  color: #b71c1c;
}
.diskon-modal-card :deep(.v-field--focused .v-label.v-field-label--floating) {
  color: #b71c1c;
}

/* Kartu promo Maps */
.maps-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(183, 28, 28, 0.2);
  border-radius: 10px;
  background: rgba(183, 28, 28, 0.03);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.maps-card:hover:not(.is-disabled) {
  background: rgba(183, 28, 28, 0.07);
}

.maps-card.is-on {
  border-color: #b71c1c;
  background: linear-gradient(135deg, rgba(183, 28, 28, 0.1) 0%, rgba(142, 0, 0, 0.04) 100%);
}

.maps-card.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
  border-style: dashed;
}

.maps-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b71c1c;
  background: rgba(183, 28, 28, 0.1);
}

.maps-card.is-on .maps-icon {
  color: white;
  background: #b71c1c;
}

.maps-title {
  font-size: 13px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.85);
}

.maps-sub {
  margin-top: 2px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
}

/* Catatan invoice dari SO */
.so-lock-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.45;
  background: rgba(183, 28, 28, 0.04);
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-left: 4px solid #b71c1c;
  border-radius: 8px;
}

/* Ringkasan */
.diskon-summary {
  padding: 12px 20px;
  background: linear-gradient(135deg, rgba(183, 28, 28, 0.06) 0%, rgba(142, 0, 0, 0.02) 100%);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-row + .summary-row {
  margin-top: 4px;
}

.summary-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(0, 0, 0, 0.6);
}

.summary-value {
  font-size: 18px;
  font-weight: 900;
  color: #b71c1c;
}

.summary-value--sm {
  font-size: 14px;
  font-weight: 800;
}

.btn-simpan {
  min-width: 100px;
  color: white !important;
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
}

.btn-simpan.v-btn--disabled {
  opacity: 0.45;
}
</style>

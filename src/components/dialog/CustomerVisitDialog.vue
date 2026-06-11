<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "select", type: "STORE" | "WA"): void;
  (e: "cancel"): void;
}>();

const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const select = (type: "STORE" | "WA") => emit("select", type);
const cancel = () => emit("cancel");
</script>

<template>
  <v-dialog v-model="internalValue" max-width="450px" persistent>
    <v-card class="rounded-xl pa-4">
      <v-card-title class="text-h6 font-weight-bold text-center pb-2">
        <v-icon color="primary" class="me-2" size="large">mdi-account-group-outline</v-icon>
        Trafik Kunjungan Customer
      </v-card-title>

      <v-card-text class="text-center pt-2 pb-4 text-body-2 text-medium-emphasis">
        Customer terdeteksi belum melakukan interaksi/kunjungan harian hari ini.<br />
        Silakan pilih metode kedatangan untuk akurasi data statistik:
      </v-card-text>

      <v-card-actions class="d-flex flex-column ga-3" style="gap: 12px">
        <v-btn
          block
          color="primary"
          variant="flat"
          size="large"
          prepend-icon="mdi-storefront-outline"
          class="font-weight-bold text-none rounded-lg ma-0"
          height="50"
          @click="select('STORE')"
        >
          Berkunjung Langsung ke Toko
        </v-btn>

        <v-btn
          block
          color="success"
          variant="flat"
          size="large"
          prepend-icon="mdi-whatsapp"
          class="font-weight-bold text-none rounded-lg ma-0"
          height="50"
          @click="select('WA')"
        >
          Order Masuk via WhatsApp (WA)
        </v-btn>
      </v-card-actions>

      <div class="text-center mt-4">
        <v-btn variant="text" size="small" color="grey-darken-1" @click="cancel">
          Batal Simpan Transaksi
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

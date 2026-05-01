<script setup lang="ts">
import { ref } from "vue";
import { useCashierSessionStore } from "@/stores/cashierSessionStore";

const sessionStore = useCashierSessionStore();
const modalAwal = ref(0);
const isSubmitting = ref(false);

const submit = async () => {
  isSubmitting.value = true;
  await sessionStore.startSession(modalAwal.value);
  isSubmitting.value = false;
};
</script>

<template>
  <v-dialog v-model="sessionStore.isStartModalVisible" persistent max-width="400px">
    <v-card class="rounded-lg text-center">
      <v-card-text class="pa-6">
        <v-icon size="64" color="primary" class="mb-3">mdi-cash-register</v-icon>
        <div class="text-h6 font-weight-bold mb-1">Buka Shift Kasir</div>
        <p class="text-body-2 text-grey-darken-1 mb-6">
          Silakan masukkan saldo uang fisik (Modal Awal) yang ada di laci Anda saat ini sebelum
          memulai transaksi.
        </p>

        <v-text-field
          label="Modal Awal Laci (Rp)"
          v-model.number="modalAwal"
          type="number"
          min="0"
          variant="outlined"
          density="compact"
          hide-details="auto"
          prepend-inner-icon="mdi-cash-multiple"
          class="mb-4 text-center font-weight-bold"
        />

        <v-btn
          color="primary"
          block
          size="large"
          @click="submit"
          :loading="isSubmitting"
          class="font-weight-bold"
        >
          MULAI TRANSAKSI
        </v-btn>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

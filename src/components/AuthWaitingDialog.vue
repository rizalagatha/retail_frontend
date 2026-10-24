<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean;
    judul?: string;
  }>(),
  { judul: "Menunggu ACC SPV..." }
);

const emit = defineEmits<{ (e: "tutup"): void }>();
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="360px"
    persistent
    transition="dialog-bottom-transition"
  >
    <v-card class="rounded-xl overflow-hidden elevation-10 border">
      <div class="bg-blue-lighten-5 pt-8 pb-6 d-flex justify-center position-relative">
        <v-progress-circular indeterminate color="primary" size="72" width="6">
          <v-icon color="primary" size="32" class="pulse-icon">mdi-cellphone-message</v-icon>
        </v-progress-circular>
      </div>

      <v-card-text class="text-center pt-6 pb-2 px-6">
        <h3 class="text-h6 font-weight-black text-grey-darken-3 mb-2" style="line-height: 1.2">
          {{ judul }}
        </h3>
        <p class="text-body-2 text-grey-darken-1 mb-0" style="line-height: 1.5">
          Permintaan telah masuk ke HP Supervisor.<br />
          Dokumen sudah tersimpan, statusnya menunggu ACC.
        </p>
      </v-card-text>

      <v-card-actions class="px-6 pb-6 pt-4 justify-center">
        <v-btn
          color="grey-darken-2"
          variant="tonal"
          block
          rounded="pill"
          height="44"
          class="text-none font-weight-bold"
          @click="emit('tutup')"
        >
          Tutup (Biar Jalan di Latar)
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.pulse-icon {
  animation: pulse-opacity 1.5s infinite ease-in-out;
}

@keyframes pulse-opacity {
  0% {
    opacity: 0.4;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
  100% {
    opacity: 0.4;
    transform: scale(0.95);
  }
}
</style>

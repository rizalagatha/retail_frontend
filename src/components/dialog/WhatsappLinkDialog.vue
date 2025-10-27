<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useToast } from 'vue-toastification';
import api from '@/services/api';
import type { AxiosError } from 'axios';
import { useWhatsAppDialog } from '@/composables/useWhatsAppDialog';

const toast = useToast();
const { showWhatsAppDialog, closeWhatsAppDialog } = useWhatsAppDialog();

const qrDataUrl = ref('');
const message = ref('Meminta QR Code dari server...');
let intervalId: ReturnType<typeof setInterval> | null = null;

const fetchQr = async () => {
  try {
    const response = await api.get('/whatsapp/qr');

    if (response.data.qrDataUrl) {
      qrDataUrl.value = response.data.qrDataUrl;
      message.value = 'Silakan scan QR Code di bawah ini menggunakan WhatsApp Anda.';
      if (intervalId) clearInterval(intervalId);
    } else {
      message.value = response.data.message || 'Menunggu server siap...';
    }
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat QR Code.');
  }
};

onMounted(() => {
  fetchQr();
  intervalId = setInterval(fetchQr, 5000);
});

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId);
});
</script>

<template>
  <v-dialog v-model="showWhatsAppDialog" max-width="520">
    <v-card class="pa-6 text-center">
      <v-card-title class="text-h6 mb-2">
        Tautkan Perangkat WhatsApp
      </v-card-title>

      <div v-if="qrDataUrl">
        <img :src="qrDataUrl" alt="QR Code WhatsApp" width="300" height="300" />
        <p class="mt-4">{{ message }}</p>
      </div>

      <div v-else>
        <v-progress-circular indeterminate size="64" color="primary" />
        <p class="mt-4">{{ message }}</p>
      </div>

      <v-divider class="my-4" />
      <div class="text-caption text-medium-emphasis mb-4">
        Buka WhatsApp di HP Anda → Setelan → Perangkat Tertaut → Tautkan Perangkat.
      </div>

      <v-card-actions class="justify-end">
        <v-btn text color="primary" @click="closeWhatsAppDialog">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

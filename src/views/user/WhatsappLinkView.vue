<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import type { AxiosError } from "axios";

const toast = useToast();
const qrDataUrl = ref("");
const message = ref("Meminta QR Code dari server...");
let intervalId: ReturnType<typeof setInterval> | null = null;

const fetchQr = async () => {
  try {
    const response = await api.get("/whatsapp/qr");

    if (response.data.qrDataUrl) {
      qrDataUrl.value = response.data.qrDataUrl;
      message.value = "Silakan scan QR Code di bawah ini menggunakan WhatsApp Anda.";
      // Jika QR sudah muncul, hentikan polling
      if (intervalId) {
        clearInterval(intervalId);
      }
    } else {
      message.value = response.data.message || "Menunggu server siap...";
    }
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat QR Code.");
  }
};

// onMounted dijalankan saat halaman dibuka
onMounted(() => {
  fetchQr(); // Panggil pertama kali
  // Set interval untuk polling setiap 5 detik
  intervalId = setInterval(fetchQr, 5000);
});

// onUnmounted dijalankan saat halaman akan ditutup/ditinggalkan
onUnmounted(() => {
  // INI BAGIAN PENTING: Hentikan polling saat meninggalkan halaman
  if (intervalId) {
    clearInterval(intervalId);
  }
});
</script>

<template>
  <PageLayout title="Tautkan Perangkat WhatsApp">
    <div class="d-flex justify-center align-center fill-height pa-8">
      <v-card class="text-center pa-6" max-width="500px">
        <div v-if="qrDataUrl">
          <v-card-title class="text-h6">Scan untuk Menghubungkan</v-card-title>
          <v-card-text>
            <img :src="qrDataUrl" alt="QR Code WhatsApp" width="300" height="300" />
            <p class="mt-4">{{ message }}</p>
          </v-card-text>
        </div>
        <div v-else>
          <v-progress-circular indeterminate size="64" color="primary" />
          <p class="mt-4">{{ message }}</p>
        </div>
        <v-divider class="my-4" />
        <div class="text-caption text-medium-emphasis">
          Buka WhatsApp di HP Anda > Setelan > Perangkat Tertaut > Tautkan Perangkat.
        </div>
      </v-card>
    </div>
  </PageLayout>
</template>

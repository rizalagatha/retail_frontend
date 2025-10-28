<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useToast } from 'vue-toastification';
import api from '@/services/api';
import type { AxiosError } from 'axios';
import { useWhatsAppDialog } from '@/composables/useWhatsappDialog'; // Asumsi ini ada

const toast = useToast();
const { showWhatsAppDialog, closeWhatsAppDialog } = useWhatsAppDialog();

// --- State Baru ---
const qrDataUrl = ref('');
const message = ref('Klik tombol di bawah untuk memulai tautan WhatsApp.');
const status = ref<'idle' | 'requesting' | 'polling' | 'qr' | 'ready' | 'disconnected' | 'error'>('idle');
const isLoadingLogout = ref(false); // Untuk tombol logout
// -----------------

let intervalId: ReturnType<typeof setInterval> | null = null;
let initialFetchDone = false;

const requestQrCode = async () => {
  if (status.value !== 'idle' && status.value !== 'error' && status.value !== 'disconnected') return; // Hindari klik ganda

  status.value = 'requesting'; // Tampilkan loading
  message.value = 'Meminta QR Code dari server...';
  qrDataUrl.value = ''; // Hapus QR lama
  await fetchStatus(true); // Panggil fetchStatus sekali untuk trigger & dapatkan status awal
  if (status.value !== 'ready' && status.value !== 'error') {
    startPolling(); // Mulai polling HANYA SETELAH request awal
  }
};

const fetchStatus = async (isInitialRequest = false) => {
  // Jangan fetch jika sedang proses logout atau belum di-trigger
  if (isLoadingLogout.value || (!isInitialRequest && status.value === 'idle')) return;

  try {
    const response = await api.get('/whatsapp/status');
    const currentStatus = response.data.status;
    const newQr = response.data.qrDataUrl;
    message.value = response.data.message || 'Memuat...';

    switch (currentStatus) {
      case 'INITIALIZING':
      case 'NOT_INITIALIZED': // Jika belum diinisialisasi backend
        status.value = isInitialRequest ? 'requesting' : 'polling'; // Tetap polling/requesting
        qrDataUrl.value = '';
        break;
      case 'QR_RECEIVED':
        status.value = 'qr';
        if (qrDataUrl.value !== newQr) { // Hanya update jika QR berubah
          qrDataUrl.value = newQr;
        }
        if (!intervalId) startPolling(); // Mulai polling jika belum
        break;
      case 'READY':
        status.value = 'ready';
        qrDataUrl.value = '';
        stopPolling();
        break;
      case 'DISCONNECTED':
      case 'AUTH_FAILURE':
      case 'ERROR_INIT':
        status.value = 'error';
        qrDataUrl.value = '';
        stopPolling(); // Berhenti polling saat error
        break;
      default:
        status.value = 'error';
        qrDataUrl.value = '';
        message.value = `Status tidak dikenal: ${currentStatus}`;
        stopPolling();
        break;
    }
    initialFetchDone = true;

  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    message.value = err.response?.data?.message || 'Gagal memeriksa status WhatsApp.';
    status.value = 'error';
    qrDataUrl.value = '';
    console.error('[WhatsApp Dialog] Fetch status error:', error);
    if (!intervalId) { // Jika polling berhenti, mulai lagi
      startPolling();
    }
  }
};

// --- Fungsi Baru: Logout ---
const logoutSession = async () => {
  isLoadingLogout.value = true;
  message.value = 'Sedang menghapus sesi...';
  try {
    // --- Panggil endpoint logout BARU ---
    const response = await api.delete('/whatsapp/logout');
    // ------------------------------------
    toast.success(response.data.message || 'Sesi berhasil dihapus.');
    status.value = 'idle'; // Kembali ke loading untuk re-fetch status
    qrDataUrl.value = '';
    message.value = 'Klik tombol di bawah untuk memulai tautan WhatsApp.';
    startPolling(); // Mulai polling lagi untuk mendapatkan QR baru
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus sesi.');
    // Status mungkin masih 'ready' atau jadi 'error', biarkan fetchStatus berikutnya yg cek
  } finally {
    isLoadingLogout.value = false;
  }
};
// ---------------------------

// --- Fungsi untuk memulai polling ---
const startPolling = () => {
  if (intervalId) return; // Jangan mulai jika sudah jalan
  console.log('[WhatsApp Dialog] Polling started.');
  intervalId = setInterval(fetchStatus, 5000); // Poll setiap 5 detik
};

const stopPolling = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[WhatsApp Dialog] Polling stopped.');
  }
};

// --- Lifecycle Hooks ---
onMounted(() => {
  // Panggil fetchStatus SEKALI saat mount untuk cek status terakhir (tanpa memulai polling)
  fetchStatus(true);
});

onUnmounted(() => {
  stopPolling();
});

// Watcher agar jika dialog ditutup dari luar, interval berhenti
watch(showWhatsAppDialog, (newValue) => {
  if (newValue) {
    // Saat dialog dibuka, fetch status sekali lagi
    // Jangan langsung startPolling, tunggu tombol ditekan
    if (!initialFetchDone || status.value === 'error' || status.value === 'disconnected') {
      fetchStatus(true);
    } else if (status.value === 'ready') {
      stopPolling(); // Pastikan berhenti jika sudah ready
    }
  } else {
    stopPolling(); // Selalu stop polling saat dialog ditutup
    status.value = 'idle'; // Reset status ke idle
    message.value = 'Klik tombol di bawah untuk memulai tautan WhatsApp.';
    qrDataUrl.value = '';
    initialFetchDone = false; // Reset flag
  }
});

</script>

<template>
  <v-dialog :model-value="showWhatsAppDialog" @update:modelValue="closeWhatsAppDialog" max-width="520" persistent>
    <v-card class="pa-6 text-center">
      <v-card-title class="text-h6 mb-2">
        Tautkan Perangkat WhatsApp
      </v-card-title>

      <div v-if="status === 'idle'">
        <v-icon size="80" color="grey" class="my-6">mdi-qrcode-scan</v-icon>
        <p class="mt-4 text-body-1">{{ message }}</p>
        <v-btn color="primary" @click="requestQrCode" class="mt-4" prepend-icon="mdi-qrcode-plus">
          Mulai Tautkan / Tampilkan QR
        </v-btn>
      </div>

      <div v-if="status === 'qr' && qrDataUrl">
        <img :src="qrDataUrl" alt="QR Code WhatsApp" width="300" height="300" class="elevation-2 rounded" />
        <p class="mt-4 text-body-2">{{ message }}</p>
      </div>

      <div v-else-if="status === 'requesting' || status === 'polling'">
        <v-progress-circular indeterminate size="64" color="primary" class="my-8" />
        <p class="mt-4 text-body-2">{{ message }}</p>
      </div>

      <div v-else-if="status === 'ready'">
        <v-icon size="80" color="success" class="my-6">mdi-check-circle-outline</v-icon>
        <p class="mt-4 text-body-1 font-weight-medium">{{ message }}</p>
        <v-btn color="error" variant="tonal" @click="logoutSession" :loading="isLoadingLogout" class="mt-4"
          prepend-icon="mdi-logout" size="small">
          Hapus Sesi / Logout
        </v-btn>
      </div>

      <div v-else-if="status === 'error' || status === 'disconnected'">
        <v-icon size="80" color="warning" class="my-6">mdi-alert-circle-outline</v-icon>
        <p class="mt-4 text-body-2">{{ message }}</p>
        <v-btn color="primary" variant="outlined" @click="requestQrCode" class="mt-4" prepend-icon="mdi-refresh"
          size="small">
          Coba Lagi
        </v-btn>
        <v-btn v-if="status === 'error'" color="error" variant="tonal" @click="logoutSession" :loading="isLoadingLogout"
          class="mt-4 ml-2" prepend-icon="mdi-delete-alert" size="small"
          title="Coba paksa hapus sesi jika gagal otentikasi">
          Hapus Sesi
        </v-btn>
      </div>


      <v-divider class="my-4" />
      <div class="text-caption text-medium-emphasis mb-4">
        Buka WhatsApp di HP Anda → Setelan → Perangkat Tertaut → Tautkan Perangkat.
      </div>

      <v-card-actions class="justify-end">
        <v-btn text color="primary" @click="closeWhatsAppDialog" :disabled="isLoadingLogout">Tutup</v-btn>
      </v-card-actions>

    </v-card>
  </v-dialog>
</template>

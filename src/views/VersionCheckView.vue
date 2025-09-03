<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';

// Ambil versi dari package.json
import packageJson from '../../package.json';

const clientVersion = ref<string>(packageJson.version || 'N/A');
const serverVersion = ref<string>('');
const isLoading = ref<boolean>(true);
const message = ref<string>('');
const messageType = ref<'success' | 'warning' | 'error'>('success');

const checkVersion = async () => {
  isLoading.value = true;
  message.value = '';
  try {
    const response = await api.get('/version');
    serverVersion.value = response.data.latestVersion;

    if (clientVersion.value === serverVersion.value) {
      message.value = 'Anda sudah menggunakan versi program terbaru.';
      messageType.value = 'success';
    } else {
      message.value = 'Versi baru tersedia! Silakan refresh halaman browser Anda (Ctrl + F5) untuk memperbarui.';
      messageType.value = 'warning';
    }
  } catch (error) {
    console.error('Gagal memeriksa versi:', error);
    message.value = 'Gagal memeriksa versi dari server.';
    messageType.value = 'error';
  } finally {
    isLoading.value = false;
  }
};

onMounted(checkVersion);
</script>

<template>
  <v-container class="py-6">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <v-card elevation="4" class="mx-auto">
          <!-- Header -->
          <v-card-title class="text-h5 text-center bg-surface-variant pa-6">
            <v-icon left class="me-2" color="primary">mdi-update</v-icon>
            Update Program
          </v-card-title>

          <v-card-text class="pa-6">
            <!-- Version Information Cards -->
            <v-row class="mb-4">
              <v-col cols="12" sm="6">
                <v-card variant="outlined" class="h-100">
                  <v-card-text class="text-center pa-4">
                    <v-icon size="32" color="primary" class="mb-2">mdi-laptop</v-icon>
                    <div class="text-body-2 text-medium-emphasis mb-1">Versi Program Anda</div>
                    <div class="text-h6 font-weight-bold text-high-emphasis">{{ clientVersion }}</div>
                  </v-card-text>
                </v-card>
              </v-col>

              <v-col cols="12" sm="6">
                <v-card variant="outlined" class="h-100">
                  <v-card-text class="text-center pa-4">
                    <v-icon size="32" color="success" class="mb-2">mdi-cloud-download</v-icon>
                    <div class="text-body-2 text-medium-emphasis mb-1">Versi Terbaru di Server</div>
                    <div class="text-h6 font-weight-bold text-high-emphasis">
                      <span v-if="isLoading">
                        <v-progress-circular size="20" width="2" indeterminate></v-progress-circular>
                      </span>
                      <span v-else>{{ serverVersion }}</span>
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>

            <!-- Status Message -->
            <v-alert 
              v-if="message && !isLoading" 
              :type="messageType" 
              variant="tonal"
              class="mb-4"
              :icon="getAlertIcon(messageType)"
            >
              {{ message }}
            </v-alert>

            <!-- Loading State -->
            <div v-if="isLoading && !message" class="text-center mb-4">
              <v-progress-circular 
                indeterminate 
                color="primary" 
                size="24"
                class="me-2"
              ></v-progress-circular>
              <span class="text-medium-emphasis">Memeriksa versi...</span>
            </div>

            <!-- Action Button -->
            <div class="text-center">
              <v-btn 
                color="primary"
                size="large"
                :loading="isLoading" 
                @click="checkVersion"
                prepend-icon="mdi-refresh"
                variant="elevated"
              >
                {{ isLoading ? 'Mengecek...' : 'Cek Ulang' }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts">
// Helper function untuk icon alert
function getAlertIcon(type: 'success' | 'warning' | 'error'): string {
  switch (type) {
    case 'success':
      return 'mdi-check-circle';
    case 'warning':
      return 'mdi-alert';
    case 'error':
      return 'mdi-alert-circle';
    default:
      return 'mdi-information';
  }
}
</script>

<style scoped>
/* Minimal custom styles - most styling handled by Vuetify */

/* Ensure equal height for version cards */
.h-100 {
  height: 100%;
}

/* Custom elevation for main card */
.v-card {
  border-radius: 12px !important;
}
</style>
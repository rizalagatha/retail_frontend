<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore';

const authStore = useAuthStore();
</script>

<template>
  <v-dialog v-model="authStore.isSessionExpired" persistent max-width="450px" :scrim="true">
    <v-card>
      <v-card-title class="d-flex align-center bg-warning pa-4">
        <v-icon color="white" class="mr-2" size="28">mdi-clock-alert-outline</v-icon>
        <span class="text-h6 text-white">Sesi Telah Habis</span>
      </v-card-title>

      <v-card-text class="pa-6">
        <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
          Sesi login Anda telah berakhir karena:
          <ul class="mt-2 ml-4">
            <li>Token telah kedaluwarsa</li>
            <li>Atau tidak ada aktivitas dalam waktu lama</li>
          </ul>
        </v-alert>
        <p class="text-body-1 mb-0">
          Silakan login kembali untuk melanjutkan menggunakan aplikasi.
        </p>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="pa-4">
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="elevated" @click="authStore.logout" size="large" prepend-icon="mdi-login">
          Login Kembali
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

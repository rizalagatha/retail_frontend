<script setup lang="ts">
import { ref } from 'vue';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from 'vue-toastification';
import { useRouter } from 'vue-router';

const toast = useToast();
const router = useRouter();

const kodeUser = ref('');
const password = ref('');
const isLoading = ref(false);
const showPassword = ref(false);

const authStore = useAuthStore();

const handleLogin = async () => {
  if (!kodeUser.value || !password.value) {
    toast.error('User dan Password harus diisi.');
    return;
  }

  isLoading.value = true;
  try {
    const response = await api.post('/auth/login', {
      kodeUser: kodeUser.value,
      password: password.value,
    });
    authStore.setLoginData(response.data); 
    toast.success('Login berhasil!');
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Terjadi kesalahan saat login.');
  } finally {
    isLoading.value = false;
  }
};

const handleCancel = () => {
  kodeUser.value = '';
  password.value = '';
  showPassword.value = false;
};
</script>

<template>
  <v-container class="fill-height d-flex align-center justify-center" fluid>
    <v-row align="center" justify="center" class="w-100">
      <v-col cols="12" sm="10" md="6" lg="4" xl="3">
        <v-card elevation="8" class="mx-auto" style="border-radius: 16px;">
          <!-- Header -->
          <v-card-title class="pa-0">
            <v-sheet
              color="primary"
              class="d-flex align-center justify-space-between pa-6 w-100"
              style="border-radius: 16px 16px 0 0;"
            >
              <div>
                <h2 class="text-white text-h5 mb-1 font-weight-bold">Selamat Datang</h2>
                <p class="text-white text-body-2 mb-0" style="opacity: 0.9;">
                  Masuk ke aplikasi Retail
                </p>
              </div>
              <v-avatar size="56" color="white" class="elevation-2">
                <v-icon size="32" color="primary">mdi-account-circle</v-icon>
              </v-avatar>
            </v-sheet>
          </v-card-title>

          <v-card-text class="pa-8">
            <v-form @submit.prevent="handleLogin">
              <!-- User Field -->
              <v-text-field
                v-model="kodeUser"
                label="Kode User"
                placeholder="Masukkan kode user"
                variant="outlined"
                prepend-inner-icon="mdi-account"
                class="mb-4"
                :rules="[v => !!v || 'Kode user harus diisi']"
                hide-details="auto"
                autofocus
              ></v-text-field>

              <!-- Password Field -->
              <v-text-field
                v-model="password"
                label="Password"
                placeholder="Masukkan password"
                :type="showPassword ? 'text' : 'password'"
                variant="outlined"
                prepend-inner-icon="mdi-lock"
                :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                @click:append-inner="showPassword = !showPassword"
                class="mb-6"
                :rules="[v => !!v || 'Password harus diisi']"
                hide-details="auto"
              ></v-text-field>

              <!-- Actions -->
              <div class="d-flex justify-space-between align-center">
                <v-btn
                  variant="text"
                  color="grey-darken-1"
                  @click="handleCancel"
                  :disabled="isLoading"
                  prepend-icon="mdi-close"
                >
                  Batal
                </v-btn>

                <v-btn
                  type="submit"
                  color="primary"
                  size="large"
                  :loading="isLoading"
                  variant="elevated"
                  prepend-icon="mdi-login"
                  min-width="120"
                >
                  {{ isLoading ? 'Masuk...' : 'Masuk' }}
                </v-btn>
              </div>
            </v-form>
          </v-card-text>

          <!-- Footer -->
          <v-divider></v-divider>
          <v-card-actions class="pa-4 justify-center">
            <div class="text-center">
              <div class="text-body-2 text-medium-emphasis mb-1">
                <v-icon size="16" class="me-1">mdi-shield-check</v-icon>
                Sistem Aplikasi Retail
              </div>
              <div class="text-caption text-medium-emphasis">
                Version 1.0 - Secure Login
              </div>
            </div>
          </v-card-actions>
        </v-card>

        <!-- Loading Overlay -->
        <v-overlay
          v-model="isLoading"
          contained
          class="d-flex align-center justify-center"
        >
          <div class="text-center">
            <v-progress-circular
              indeterminate
              size="48"
              width="4"
              color="primary"
            ></v-progress-circular>
            <div class="mt-3 text-white">Memverifikasi...</div>
          </div>
        </v-overlay>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
/* Custom styling for full height container */
.fill-height {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* Ensure proper width for responsiveness */
.w-100 {
  width: 100%;
}

/* Custom card shadow enhancement */
.v-card {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1) !important;
}

/* Loading overlay styling */
.v-overlay {
  border-radius: 16px;
}
</style>
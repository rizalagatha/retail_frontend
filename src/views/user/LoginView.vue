<script setup lang="ts">
import { ref } from 'vue';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from 'vue-toastification';
import { useRouter } from 'vue-router';
import { AxiosError } from 'axios';

// --- IMPORT ASSETS ---
// Pastikan file-file ini ada di folder src/assets/ Anda
import logoUrl from '@/assets/logo.png';
import heroImage from '@/assets/login-hero.jpg';

interface Branch {
  kode: string;
  nama: string;
}

const toast = useToast();
const router = useRouter();

// --- STATE ---
const kodeUser = ref('');
const password = ref('');
const isLoading = ref(false);
const showPassword = ref(false);
const isBranchDialogVisible = ref(false);
const branchList = ref<Branch[]>([]);
const tempToken = ref('');
const selectedCabang = ref<string | null>(null);
const authStore = useAuthStore();

// --- LOGIC ---
const handleLogin = async () => {
  if (!kodeUser.value || !password.value) {
    toast.error('User dan Password harus diisi.');
    return;
  }
  isLoading.value = true;
  try {
    const response = await api.post('/auth/login', { kodeUser: kodeUser.value, password: password.value });
    if (response.data.requiresBranchSelection) {
      branchList.value = response.data.branches;
      tempToken.value = response.data.tempToken;
      isBranchDialogVisible.value = true;
    } else {
      authStore.setLoginData(response.data.data);
      toast.success('Login berhasil!');
      router.push('/');
    }
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Terjadi kesalahan saat login.');
  } finally {
    isLoading.value = false;
  }
};

const handleBranchSelect = async () => {
  if (!selectedCabang.value) return;
  isLoading.value = true;
  isBranchDialogVisible.value = false;
  try {
    const response = await api.post('/auth/select-branch', { tempToken: tempToken.value, selectedCabang: selectedCabang.value });
    authStore.setLoginData(response.data);
    toast.success(`Login cabang ${selectedCabang.value} berhasil!`);
    router.push('/');
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal finalisasi login.');
  } finally {
    isLoading.value = false;
    selectedCabang.value = null;
    tempToken.value = '';
  }
};
</script>

<template>
  <v-container fluid class="pa-0 fill-height login-wrapper">
    <v-row no-gutters class="fill-height">

      <v-col cols="12" md="6" lg="7" class="d-none d-md-block hero-container">
        <div class="image-wrapper">
          <v-img :src="heroImage" cover class="fill-height zoom-effect" alt="Login Background">
            <template #placeholder>
              <div class="d-flex align-center justify-center fill-height bg-grey-lighten-4">
                <v-progress-circular indeterminate color="primary"></v-progress-circular>
              </div>
            </template>
            <div class="hero-overlay"></div>
          </v-img>
        </div>
      </v-col>

      <v-col cols="12" md="6" lg="5" class="bg-white d-flex flex-column position-relative form-side">

        <div class="brand-header pt-8 pr-8 text-right w-100 fade-in-down">
          <div class="d-inline-flex align-center gap-3 hover-scale">
            <img :src="logoUrl" alt="Kaosan Logo" height="32" class="mr-2" />
            <h3 class="text-h6 font-weight-bold text-grey-darken-4 tracking-wide"
              style="font-family: 'Roboto', sans-serif;">
              KAOSAN.OFFICIAL
            </h3>
          </div>
        </div>

        <div class="flex-grow-1 d-flex align-center justify-center pa-6 pa-md-16 fade-in-up">
          <div class="w-100" style="max-width: 400px;">

            <div class="mb-10">
              <h2 class="text-h4 font-weight-bold text-grey-darken-4 mb-2">Welcome Back!</h2>
              <p class="text-body-1 text-grey-darken-1 opacity-80">
                Masuk untuk Melanjutkan ke Aplikasi Retail.
              </p>
            </div>

            <v-form @submit.prevent="handleLogin">
              <div class="mb-5 input-group">
                <label class="text-caption font-weight-bold text-grey-darken-2 mb-1 d-block text-uppercase ls-1">User
                  ID</label>
                <v-text-field v-model="kodeUser" placeholder="Masukkan Kode User" variant="outlined" color="primary"
                  bg-color="grey-lighten-5" density="comfortable" hide-details="auto"
                  prepend-inner-icon="mdi-account-outline" class="custom-input" autofocus></v-text-field>
              </div>

              <div class="mb-8 input-group" style="animation-delay: 0.1s;">
                <div class="d-flex justify-space-between align-center mb-1">
                  <label
                    class="text-caption font-weight-bold text-grey-darken-2 d-block text-uppercase ls-1">Password</label>
                </div>
                <v-text-field v-model="password" placeholder="Masukkan Password"
                  :type="showPassword ? 'text' : 'password'" variant="outlined" color="primary"
                  bg-color="grey-lighten-5" density="comfortable" hide-details="auto"
                  prepend-inner-icon="mdi-lock-outline"
                  :append-inner-icon="showPassword ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
                  @click:append-inner="showPassword = !showPassword" class="custom-input"></v-text-field>
              </div>

              <v-btn type="submit" block color="primary" size="large" height="50"
                class="text-body-1 font-weight-bold mb-4 elevation-4 btn-hover-effect" :loading="isLoading">
                Login Sekarang
              </v-btn>

              <div class="text-center mt-6">
                <v-btn variant="text" size="small" class="text-caption text-grey-darken-1 hover-underline" to="/"
                  prepend-icon="mdi-arrow-left">
                  Kembali ke Beranda
                </v-btn>
              </div>
            </v-form>
          </div>
        </div>

        <div class="pb-4 text-center text-caption text-grey-lighten-1 d-md-none fade-in">
          &copy; 2025 IT Kencana Print.
        </div>

      </v-col>
    </v-row>

    <v-dialog v-model="isBranchDialogVisible" persistent max-width="400px" transition="dialog-bottom-transition">
      <v-card class="rounded-lg elevation-12">
        <v-card-title class="text-h6 pt-6 px-6 font-weight-bold text-primary">Pilih Lokasi Kerja</v-card-title>
        <v-card-text class="px-6 pb-2 pt-2">
          <p class="mb-4 text-body-2 text-grey-darken-1">
            Akun <strong>{{ kodeUser }}</strong> terdaftar di beberapa cabang.
          </p>
          <v-select v-model="selectedCabang" :items="branchList" item-title="nama" item-value="kode"
            label="Pilih Cabang" variant="outlined" density="comfortable" color="primary"
            bg-color="grey-lighten-5"></v-select>
        </v-card-text>
        <v-card-actions class="px-6 pb-6 pt-0">
          <v-spacer></v-spacer>
          <v-btn variant="text" color="grey-darken-1" @click="isBranchDialogVisible = false">Batal</v-btn>
          <v-btn color="primary" variant="elevated" class="px-6 btn-hover-effect" @click="handleBranchSelect"
            :disabled="!selectedCabang">
            Lanjut
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.login-wrapper {
  height: 100vh;
  overflow: hidden;
  background-color: #fff;
}

/* HERO IMAGE ANIMATION */
.hero-container {
  position: relative;
  background-color: #E3F2FD;
  /* Fallback */
  overflow: hidden;
}

.image-wrapper {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.zoom-effect {
  transition: transform 10s ease;
}

.hero-container:hover .zoom-effect {
  transform: scale(1.05);
}

/* PERUBAHAN 2: Menghapus background gradient agar gambar asli terlihat */
.hero-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* background: linear-gradient(...) <-- DIHAPUS */
  pointer-events: none;
}

/* TYPOGRAPHY */
.tracking-wide {
  letter-spacing: 0.05em;
}

.ls-1 {
  letter-spacing: 1px;
}

/* INPUT FIELD CUSTOMIZATION */
.custom-input {
  transition: all 0.3s ease;
}

.custom-input :deep(.v-field__outline__start),
.custom-input :deep(.v-field__outline__end),
.custom-input :deep(.v-field__outline__notch) {
  border-color: #E0E0E0 !important;
  transition: border-color 0.3s ease;
}

/* Hover effect pada input (sebelum klik) */
.custom-input:hover :deep(.v-field__outline__start),
.custom-input:hover :deep(.v-field__outline__end),
.custom-input:hover :deep(.v-field__outline__notch) {
  border-color: #BDBDBD !important;
}

/* Focus effect (Biru) */
.custom-input :deep(.v-field--focused .v-field__outline__start),
.custom-input :deep(.v-field--focused .v-field__outline__end),
.custom-input :deep(.v-field--focused .v-field__outline__notch) {
  border-color: #1976D2 !important;
  /* Primary Blue */
  border-width: 2px;
}

/* BUTTON ANIMATION */
.v-btn {
  text-transform: none;
  letter-spacing: 0.3px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.btn-hover-effect:hover {
  transform: translateY(-2px);
  /* Naik sedikit */
  box-shadow: 0 6px 12px rgba(25, 118, 210, 0.3) !important;
  /* Bayangan biru */
}

.hover-underline:hover {
  text-decoration: underline;
}

.hover-scale {
  transition: transform 0.3s ease;
}

.hover-scale:hover {
  transform: scale(1.02);
}

/* PAGE ENTRANCE ANIMATIONS */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translate3d(0, 20px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translate3d(0, -20px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.fade-in-up {
  animation: fadeInUp 0.8s ease-out forwards;
}

.fade-in-down {
  animation: fadeInDown 0.8s ease-out forwards;
}

/* Stagger animation for inputs */
.input-group {
  opacity: 0;
  animation: fadeInUp 0.6s ease-out forwards;
}

.input-group:nth-child(1) {
  animation-delay: 0.2s;
}

.input-group:nth-child(2) {
  animation-delay: 0.3s;
}
</style>

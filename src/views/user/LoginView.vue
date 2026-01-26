<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from 'vue-toastification';
import { useRouter } from 'vue-router';
import { AxiosError } from 'axios';
import { useTheme } from 'vuetify'; // [BARU] Import useTheme

// --- IMPORT ASSETS ---
import logoUrl from '@/assets/logo.png';
import heroImage from '@/assets/login-hero.jpg';

interface Branch {
  kode: string;
  nama: string;
}

const toast = useToast();
const router = useRouter();
const theme = useTheme(); // [BARU] Inisialisasi theme
const authStore = useAuthStore();

// --- STATE ---
const kodeUser = ref('');
const password = ref('');
const isLoading = ref(false);
const showPassword = ref(false);
const isBranchDialogVisible = ref(false);
const branchList = ref<Branch[]>([]);
const tempToken = ref('');
const selectedCabang = ref<string | null>(null);
const isChangePasswordVisible = ref(false);
const newPassword = ref('');
const confirmPassword = ref('');
const showNewPassword = ref(false);

// [BARU] Load Tema Tersimpan saat Halaman Dibuka
onMounted(() => {
  const savedTheme = localStorage.getItem('kaosan-theme');
  if (savedTheme) {
    theme.global.name.value = savedTheme;
  }
});

// // [MODIFIKASI] Toggle Dark Mode & Simpan ke LocalStorage
// const toggleTheme = () => {
//   const newTheme = theme.global.current.value.dark ? 'light' : 'dark';
//   theme.global.name.value = newTheme;
//   localStorage.setItem('kaosan-theme', newTheme); // Simpan preferensi
// };

// --- LOGIC ---
const handleLogin = async () => {
  if (!kodeUser.value || !password.value) {
    toast.error('User dan Password harus diisi.');
    return;
  }
  isLoading.value = true;
  try {
    const response = await api.post('/auth/login', {
      kodeUser: kodeUser.value,
      password: password.value
    });

    // CASE 1: Password Expired (3 Bulan)
    if (response.data.requiresPasswordChange) {
      tempToken.value = response.data.tempToken;
      isChangePasswordVisible.value = true;
      toast.warning(response.data.message);
      return;
    }

    // CASE 2: Membutuhkan Pilih Cabang
    if (response.data.requiresBranchSelection) {
      branchList.value = response.data.branches;
      tempToken.value = response.data.tempToken;
      isBranchDialogVisible.value = true;
    }
    // CASE 3: Login Normal Berhasil
    else {
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

const handleChangePassword = async () => {
  // Validasi Sederhana
  if (newPassword.value.length < 4) {
    return toast.error('Password minimal 4 karakter.');
  }
  if (newPassword.value !== confirmPassword.value) {
    return toast.error('Konfirmasi password tidak cocok.');
  }

  isLoading.value = true;
  try {
    await api.post('/auth/change-expired-password', {
      tempToken: tempToken.value,
      newPassword: newPassword.value
    });

    toast.success('Password berhasil diperbarui! Silakan login kembali.');

    // Reset Form & Tutup Dialog
    isChangePasswordVisible.value = false;
    newPassword.value = '';
    confirmPassword.value = '';
    password.value = ''; // Kosongkan password lama agar user input password baru
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memperbarui password.');
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
            <div class="hero-overlay" :class="{ 'dark-overlay': theme.global.current.value.dark }"></div>
          </v-img>
        </div>
      </v-col>

      <v-col cols="12" md="6" lg="5"
        class="d-flex flex-column position-relative form-side bg-surface transition-colors">

        <!-- <v-btn icon variant="tonal" size="small" class="theme-toggle-btn" @click="toggleTheme"
          :color="theme.global.current.value.dark ? 'yellow-lighten-3' : 'blue-grey-darken-2'">
          <v-icon>{{ theme.global.current.value.dark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
          <v-tooltip activator="parent" location="left">Ganti Tema</v-tooltip>
        </v-btn> -->

        <div class="brand-header pt-8 pr-8 text-right w-100 fade-in-down">
          <div class="d-inline-flex align-center gap-3 hover-scale">
            <img :src="logoUrl" alt="Kaosan Logo" height="32" class="mr-2" />
            <h3 class="text-h6 font-weight-bold tracking-wide transition-colors"
              :class="theme.global.current.value.dark ? 'text-white' : 'text-grey-darken-4'"
              style="font-family: 'Roboto', sans-serif;">
              KAOSAN.OFFICIAL
            </h3>
          </div>
        </div>

        <div class="flex-grow-1 d-flex align-center justify-center pa-6 pa-md-16 fade-in-up">
          <div class="w-100" style="max-width: 400px;">

            <div class="mb-10">
              <h2 class="text-h4 font-weight-bold mb-2 transition-colors"
                :class="theme.global.current.value.dark ? 'text-white' : 'text-grey-darken-4'">
                Welcome Back!
              </h2>
              <p class="text-body-1 opacity-80 transition-colors"
                :class="theme.global.current.value.dark ? 'text-grey-lighten-1' : 'text-grey-darken-1'">
                Masuk untuk Melanjutkan ke Aplikasi Retail.
              </p>
            </div>

            <v-form @submit.prevent="handleLogin">
              <div class="mb-5 input-group">
                <label class="text-caption font-weight-bold mb-1 d-block text-uppercase ls-1 transition-colors"
                  :class="theme.global.current.value.dark ? 'text-grey-lighten-2' : 'text-grey-darken-2'">
                  User ID
                </label>
                <v-text-field v-model="kodeUser" placeholder="Masukkan Kode User" variant="outlined" color="primary"
                  density="comfortable" hide-details="auto" prepend-inner-icon="mdi-account-outline"
                  class="custom-input" autofocus></v-text-field>
              </div>

              <div class="mb-8 input-group" style="animation-delay: 0.1s;">
                <div class="d-flex justify-space-between align-center mb-1">
                  <label class="text-caption font-weight-bold d-block text-uppercase ls-1 transition-colors"
                    :class="theme.global.current.value.dark ? 'text-grey-lighten-2' : 'text-grey-darken-2'">
                    Password
                  </label>
                </div>
                <v-text-field v-model="password" placeholder="Masukkan Password"
                  :type="showPassword ? 'text' : 'password'" variant="outlined" color="primary" density="comfortable"
                  hide-details="auto" prepend-inner-icon="mdi-lock-outline"
                  :append-inner-icon="showPassword ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
                  @click:append-inner="showPassword = !showPassword" class="custom-input"></v-text-field>
              </div>

              <v-btn type="submit" block color="primary" size="large" height="50"
                class="text-body-1 font-weight-bold mb-4 elevation-4 btn-hover-effect" :loading="isLoading">
                Login Sekarang
              </v-btn>

              <div class="text-center mt-6">
                <v-btn variant="text" size="small" class="text-caption hover-underline transition-colors"
                  :class="theme.global.current.value.dark ? 'text-grey-lighten-1' : 'text-grey-darken-1'" to="/"
                  prepend-icon="mdi-arrow-left">
                  Kembali ke Beranda
                </v-btn>
              </div>
            </v-form>
          </div>
        </div>

        <div class="pb-4 text-center text-caption text-medium-emphasis d-md-none fade-in">
          &copy; 2025 IT Kencana Print.
        </div>

      </v-col>
    </v-row>

    <v-dialog v-model="isBranchDialogVisible" persistent max-width="400px" transition="dialog-bottom-transition">
      <v-card class="rounded-lg elevation-12">
        <v-card-title class="text-h6 pt-6 px-6 font-weight-bold text-primary">Pilih Lokasi Kerja</v-card-title>
        <v-card-text class="px-6 pb-2 pt-2">
          <p class="mb-4 text-body-2 text-medium-emphasis">
            Akun <strong>{{ kodeUser }}</strong> terdaftar di beberapa cabang.
          </p>
          <v-select v-model="selectedCabang" :items="branchList" item-title="nama" item-value="kode"
            label="Pilih Cabang" variant="outlined" density="comfortable" color="primary"></v-select>
        </v-card-text>
        <v-card-actions class="px-6 pb-6 pt-0">
          <v-spacer></v-spacer>
          <v-btn variant="text" color="medium-emphasis" @click="isBranchDialogVisible = false">Batal</v-btn>
          <v-btn color="primary" variant="elevated" class="px-6 btn-hover-effect" @click="handleBranchSelect"
            :disabled="!selectedCabang">
            Lanjut
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isChangePasswordVisible" persistent max-width="450px">
      <v-card class="rounded-lg elevation-12 pa-4">
        <v-card-title class="text-h5 font-weight-bold text-error d-flex align-center">
          <v-icon start color="error">mdi-shield-alert</v-icon>
          Keamanan Akun
        </v-card-title>

        <v-card-text>
          <p class="mb-6 text-body-1">
            Password Anda sudah digunakan lebih dari <strong>3 bulan</strong>. Demi keamanan, Anda diwajibkan membuat
            password baru.
          </p>

          <v-form @submit.prevent="handleChangePassword">
            <div class="mb-4">
              <label class="text-caption font-weight-bold mb-1 d-block text-uppercase ls-1">Password Baru</label>
              <v-text-field v-model="newPassword" :type="showNewPassword ? 'text' : 'password'"
                placeholder="Masukkan Password Baru" variant="outlined" density="comfortable"
                prepend-inner-icon="mdi-lock-plus-outline"
                :append-inner-icon="showNewPassword ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
                @click:append-inner="showNewPassword = !showNewPassword" hide-details></v-text-field>
            </div>

            <div class="mb-6">
              <label class="text-caption font-weight-bold mb-1 d-block text-uppercase ls-1">Konfirmasi Password
                Baru</label>
              <v-text-field v-model="confirmPassword" type="password" placeholder="Ulangi Password Baru"
                variant="outlined" density="comfortable" prepend-inner-icon="mdi-lock-check-outline"
                hide-details></v-text-field>
            </div>

            <v-btn type="submit" block color="primary" size="large" class="font-weight-bold" :loading="isLoading"
              :disabled="!newPassword || newPassword !== confirmPassword">
              Perbarui & Login Kembali
            </v-btn>
          </v-form>
        </v-card-text>

        <v-card-actions class="justify-center">
          <v-btn variant="text" color="grey" @click="isChangePasswordVisible = false">Batal</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
/* UTAMA: Transisi Warna Halus */
.transition-colors {
  transition: background-color 0.3s ease, color 0.3s ease;
}

.login-wrapper {
  height: 100vh;
  overflow: hidden;
  /* Background container mengikuti variabel tema */
  background-color: rgb(var(--v-theme-background));
}

/* HERO IMAGE */
.hero-container {
  position: relative;
  background-color: rgb(var(--v-theme-surface));
  overflow: hidden;
}

.image-wrapper {
  height: 100%;
  width: 100%;
}

.zoom-effect {
  transition: transform 10s ease;
}

.hero-container:hover .zoom-effect {
  transform: scale(1.05);
}

.hero-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transition: background-color 0.3s ease;
}

/* Overlay hitam transparan saat Dark Mode */
.dark-overlay {
  background-color: rgba(0, 0, 0, 0.4);
}

/* INPUT FIELD STYLING (THEME AWARE) */
.custom-input {
  transition: all 0.3s ease;
}

/* Border default: gunakan opacity dari on-surface agar terlihat baik di dark/light */
.custom-input :deep(.v-field__outline__start),
.custom-input :deep(.v-field__outline__end),
.custom-input :deep(.v-field__outline__notch) {
  border-color: rgba(var(--v-theme-on-surface), 0.3) !important;
  transition: border-color 0.3s ease;
}

/* Border Hover */
.custom-input:hover :deep(.v-field__outline__start),
.custom-input:hover :deep(.v-field__outline__end),
.custom-input:hover :deep(.v-field__outline__notch) {
  border-color: rgba(var(--v-theme-on-surface), 0.6) !important;
}

/* Border Focus (Primary Color) */
.custom-input :deep(.v-field--focused .v-field__outline__start),
.custom-input :deep(.v-field--focused .v-field__outline__end),
.custom-input :deep(.v-field--focused .v-field__outline__notch) {
  border-color: rgb(var(--v-theme-primary)) !important;
  border-width: 2px;
}

/* POSISI TOMBOL TOGGLE (KANAN BAWAH) */
.theme-toggle-btn {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 20;
  /* Z-index tinggi agar di atas elemen lain */
  opacity: 0.8;
  transition: all 0.3s ease;
}

.theme-toggle-btn:hover {
  opacity: 1;
  transform: rotate(15deg);
}

/* TYPOGRAPHY & ANIMATION */
.tracking-wide {
  letter-spacing: 0.05em;
}

.ls-1 {
  letter-spacing: 1px;
}

.btn-hover-effect:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(var(--v-theme-primary), 0.3) !important;
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

<script setup lang="ts">
import { ref, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';

const toast = useToast();

// --- State ---
const passwordLama = ref('');
const passwordBaru = ref('');
const ulangiPassword = ref('');
const isLoading = ref(false);
const showPasswords = ref({
  old: false,
  new: false,
  confirm: false
});

// --- Validation Rules ---
const rules = {
  required: (value: string) => !!value || 'Field ini wajib diisi',
  minLength: (value: string) => value.length >= 6 || 'Password minimal 6 karakter',
  passwordMatch: (value: string) => value === passwordBaru.value || 'Password tidak cocok'
};

// --- Computed ---
const isFormValid = computed(() => {
  return passwordLama.value.length > 0 &&
         passwordBaru.value.length >= 6 &&
         ulangiPassword.value === passwordBaru.value;
});

const passwordStrength = computed(() => {
  const password = passwordBaru.value;
  if (!password) return { strength: 0, text: '', color: '' };
  
  let strength = 0;
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    numbers: /\d/.test(password),
    symbols: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };
  
  strength = Object.values(checks).filter(Boolean).length;
  
  if (strength <= 2) return { strength: strength * 20, text: 'Lemah', color: 'error' };
  if (strength <= 3) return { strength: strength * 20, text: 'Sedang', color: 'warning' };
  if (strength <= 4) return { strength: strength * 20, text: 'Kuat', color: 'success' };
  return { strength: 100, text: 'Sangat Kuat', color: 'success' };
});

// --- Methods ---
const togglePasswordVisibility = (field: 'old' | 'new' | 'confirm') => {
  showPasswords.value[field] = !showPasswords.value[field];
};

const handleChangePassword = async () => {
  if (!isFormValid.value) {
    toast.error('Mohon periksa kembali form Anda.');
    return;
  }

  isLoading.value = true;
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const kodeUser = userData.kode;

    if (!kodeUser) {
      toast.error('Sesi tidak valid, silakan login ulang.');
      return;
    }

    const payload = {
      kodeUser,
      passwordLama: passwordLama.value,
      passwordBaru: passwordBaru.value,
    };

    const response = await api.post('/users/change-password', payload);

    toast.success(response.data.message || 'Password berhasil diubah');
    
    // Reset form
    resetForm();
    
  } catch (error: any) {
    const message = error.response?.data?.message || 'Terjadi kesalahan saat mengubah password';
    toast.error(message);
  } finally {
    isLoading.value = false;
  }
};

const resetForm = () => {
  passwordLama.value = '';
  passwordBaru.value = '';
  ulangiPassword.value = '';
  showPasswords.value = { old: false, new: false, confirm: false };
};
</script>

<template>
  <div class="change-password-container">
    <v-card class="password-card" max-width="600px">
      <v-toolbar color="grey-lighten-4" density="compact">
          <v-icon class="ms-3">mdi-lock-reset</v-icon>
          <v-toolbar-title class="text-subtitle-1 font-weight-medium">Ganti Password</v-toolbar-title>
      </v-toolbar>

      <v-card-text class="pa-6">
        <v-form @submit.prevent="handleChangePassword">
          <div class="mb-4">
            <v-label class="mb-1 text-caption">Password Lama</v-label>
            <v-text-field
              v-model="passwordLama"
              :type="showPasswords.old ? 'text' : 'password'"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-lock-outline"
              :rules="[rules.required]"
              hide-details="auto"
              :append-inner-icon="showPasswords.old ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="togglePasswordVisibility('old')"
            ></v-text-field>
          </div>
          <div class="mb-2">
            <v-label class="mb-1 text-caption">Password Baru</v-label>
            <v-text-field
              v-model="passwordBaru"
              :type="showPasswords.new ? 'text' : 'password'"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-lock-plus-outline"
              :rules="[rules.required, rules.minLength]"
              hide-details="auto"
              :append-inner-icon="showPasswords.new ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="togglePasswordVisibility('new')"
            ></v-text-field>
          </div>
          <div v-if="passwordBaru" class="mb-4">
            <div class="d-flex justify-space-between align-center mb-1">
              <span class="text-caption text-medium-emphasis">Kekuatan Password</span>
              <span class="text-caption font-weight-medium" :class="`text-${passwordStrength.color}`">
                {{ passwordStrength.text }}
              </span>
            </div>
            <v-progress-linear :model-value="passwordStrength.strength" :color="passwordStrength.color" height="4" rounded />
          </div>
          <div class="mb-4">
            <v-label class="mb-1 text-caption">Ulangi Password Baru</v-label>
            <v-text-field
              v-model="ulangiPassword"
              :type="showPasswords.confirm ? 'text' : 'password'"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-lock-check-outline"
              :rules="[rules.required, rules.passwordMatch]"
              hide-details="auto"
              @keydown.enter="handleChangePassword"
              :append-inner-icon="showPasswords.confirm ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="togglePasswordVisibility('confirm')"
            ></v-text-field>
          </div>
          <v-alert type="info" variant="tonal" density="compact" icon="mdi-information-outline">
            <div class="text-caption">
              <strong>Tips password yang kuat:</strong> Minimal 8 karakter dengan kombinasi huruf besar, kecil, angka, dan simbol.
            </div>
          </v-alert>
        </v-form>
      </v-card-text>

      <v-divider></v-divider>
      <v-card-actions class="pa-3 bg-grey-lighten-4">
        <v-btn size="small" @click="resetForm" :disabled="isLoading">Reset</v-btn>
        <v-spacer />
        <v-btn
          size="small"
          color="primary"
          variant="elevated"
          :loading="isLoading"
          :disabled="!isFormValid || isLoading"
          @click="handleChangePassword"
        >
          Ganti Password
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<style scoped>
.change-password-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 48px); /* Tinggi viewport dikurangi app bar */
    background-color: #f4f5f7;
}
.password-card {
    border: 1px solid #e0e0e0;
}
</style>
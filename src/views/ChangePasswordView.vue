<script setup lang="ts">
import { ref, computed } from 'vue';
import api from '@/services/api';
import { showSuccessToast, showErrorToast } from '@/utils/toast';

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
    showErrorToast('Mohon periksa kembali form Anda.');
    return;
  }

  isLoading.value = true;
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const kodeUser = userData.kode;

    if (!kodeUser) {
      showErrorToast('Sesi tidak valid, silakan login ulang.');
      return;
    }

    const payload = {
      kodeUser,
      passwordLama: passwordLama.value,
      passwordBaru: passwordBaru.value,
    };

    const response = await api.post('/users/change-password', payload);

    showSuccessToast(response.data.message || 'Password berhasil diubah');
    
    // Reset form
    passwordLama.value = '';
    passwordBaru.value = '';
    ulangiPassword.value = '';
    showPasswords.value = { old: false, new: false, confirm: false };
    
  } catch (error: any) {
    const message = error.response?.data?.message || 'Terjadi kesalahan saat mengubah password';
    showErrorToast(message);
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
  <v-container class="fill-height">
    <v-row justify="center" align="center" class="fill-height">
      <v-col cols="12" sm="8" md="6" lg="5" xl="4">
        <v-card elevation="8" rounded="lg" class="password-card">
          <!-- Header -->
          <v-card-item class="bg-gradient-primary pa-6">
            <template #prepend>
              <v-avatar color="white" size="48">
                <v-icon color="primary" size="28">mdi-lock-reset</v-icon>
              </v-avatar>
            </template>
            <v-card-title class="text-white text-h5 font-weight-bold">
              Ganti Password
            </v-card-title>
            <v-card-subtitle class="text-white text-opacity-90">
              Jaga keamanan akun
            </v-card-subtitle>
          </v-card-item>

          <!-- Form -->
          <v-card-text class="pa-6">
            <v-form @submit.prevent="handleChangePassword">
              <!-- Password Lama -->
              <v-text-field
                v-model="passwordLama"
                label="Password Lama"
                :type="showPasswords.old ? 'text' : 'password'"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-lock-outline"
                :rules="[rules.required]"
                class="mb-4"
                :loading="isLoading"
              >
                <template #append-inner>
                  <v-btn
                    :icon="showPasswords.old ? 'mdi-eye-off' : 'mdi-eye'"
                    variant="text"
                    density="compact"
                    @click="togglePasswordVisibility('old')"
                  />
                </template>
              </v-text-field>

              <!-- Password Baru -->
              <v-text-field
                v-model="passwordBaru"
                label="Password Baru"
                :type="showPasswords.new ? 'text' : 'password'"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-lock-plus-outline"
                :rules="[rules.required, rules.minLength]"
                class="mb-2"
                :loading="isLoading"
              >
                <template #append-inner>
                  <v-btn
                    :icon="showPasswords.new ? 'mdi-eye-off' : 'mdi-eye'"
                    variant="text"
                    density="compact"
                    @click="togglePasswordVisibility('new')"
                  />
                </template>
              </v-text-field>

              <!-- Password Strength Indicator -->
              <div v-if="passwordBaru" class="mb-4">
                <div class="d-flex justify-space-between align-center mb-1">
                  <span class="text-caption text-medium-emphasis">Kekuatan Password</span>
                  <span class="text-caption font-weight-medium" :class="`text-${passwordStrength.color}`">
                    {{ passwordStrength.text }}
                  </span>
                </div>
                <v-progress-linear
                  :model-value="passwordStrength.strength"
                  :color="passwordStrength.color"
                  height="4"
                  rounded
                />
              </div>

              <!-- Ulangi Password -->
              <v-text-field
                v-model="ulangiPassword"
                label="Ulangi Password Baru"
                :type="showPasswords.confirm ? 'text' : 'password'"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-lock-check-outline"
                :rules="[rules.required, rules.passwordMatch]"
                class="mb-4"
                :loading="isLoading"
                @keydown.enter="handleChangePassword"
              >
                <template #append-inner>
                  <v-btn
                    :icon="showPasswords.confirm ? 'mdi-eye-off' : 'mdi-eye'"
                    variant="text"
                    density="compact"
                    @click="togglePasswordVisibility('confirm')"
                  />
                </template>
              </v-text-field>

              <!-- Password Tips -->
              <v-alert
                type="info"
                variant="tonal"
                density="compact"
                class="mb-6"
              >
                <template #prepend>
                  <v-icon>mdi-information-outline</v-icon>
                </template>
                <div class="text-caption">
                  <strong>Tips password yang kuat:</strong>
                  <ul class="mt-1 ml-4">
                    <li>Minimal 8 karakter</li>
                    <li>Kombinasi huruf besar, kecil, angka, dan simbol</li>
                    <li>Hindari informasi pribadi</li>
                  </ul>
                </div>
              </v-alert>
            </v-form>
          </v-card-text>

          <!-- Actions -->
          <v-card-actions class="pa-6 pt-0">
            <v-btn
              variant="outlined"
              @click="resetForm"
              :disabled="isLoading"
              prepend-icon="mdi-refresh"
            >
              Reset
            </v-btn>
            <v-spacer />
            <v-btn
              color="primary"
              variant="elevated"
              size="large"
              :loading="isLoading"
              :disabled="!isFormValid || isLoading"
              @click="handleChangePassword"
              prepend-icon="mdi-check"
            >
              Ganti Password
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.password-card {
  transition: transform 0.3s ease-in-out;
}

.password-card:hover {
  transform: translateY(-2px);
}

.bg-gradient-primary {
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)) 0%, rgb(var(--v-theme-primary-darken-1)) 100%);
}

/* Custom list styling for tips */
ul {
  list-style-type: disc;
}

li {
  margin: 2px 0;
}
</style>
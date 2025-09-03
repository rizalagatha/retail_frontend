<script setup lang="ts">
import { ref } from 'vue';
import api from '@/services/api';
import { showSuccessToast, showErrorToast } from '@/utils/toast';

const pin = ref<string>('');
const updateDc = ref<boolean>(false);
const updateStore = ref<boolean>(false);
const isLoading = ref<boolean>(false);

const handleUpdate = async () => {
  if (!updateDc.value && !updateStore.value) {
    showErrorToast('Silakan pilih cabang (DC atau Store) yang akan diupdate.');
    return;
  }
  if (!pin.value) {
    showErrorToast('PIN tidak boleh kosong.');
    return;
  }

  isLoading.value = true;
  try {
    const response = await api.post('/buffer-stock/update', {
      pin: pin.value,
      updateDc: updateDc.value,
      updateStore: updateStore.value,
    });
    showSuccessToast(response.data.message);
  } catch (error: any) {
    showErrorToast(error.response?.data?.message || 'Terjadi kesalahan saat update.');
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <v-card elevation="4" class="mx-auto">
          <!-- Header -->
          <v-card-title class="text-h5 text-center bg-primary text-white pa-6">
            <v-icon left class="me-2">mdi-database-sync</v-icon>
            Update Buffer Stok
          </v-card-title>

          <v-card-text class="pa-8">
            <!-- PIN Input -->
            <v-text-field
              v-model="pin"
              type="password"
              label="PIN Otorisasi"
              placeholder="Masukkan PIN Anda"
              variant="outlined"
              prepend-inner-icon="mdi-lock"
              class="mb-6"
              :rules="[v => !!v || 'PIN tidak boleh kosong']"
              hide-details="auto"
            ></v-text-field>

            <!-- Branch Selection -->
            <div class="mb-6">
              <v-card variant="outlined" class="pa-4">
                <v-card-subtitle class="text-medium-emphasis pa-0 mb-3">
                  <v-icon class="me-2" size="small">mdi-office-building</v-icon>
                  Pilih Cabang untuk diupdate
                </v-card-subtitle>
                
                <v-checkbox
                  v-model="updateDc"
                  color="primary"
                  hide-details
                  density="comfortable"
                >
                  <template v-slot:label>
                    <div class="d-flex align-center">
                      <v-icon class="me-2" size="small" color="primary">mdi-warehouse</v-icon>
                      <span class="font-weight-medium">Update Cabang DC</span>
                    </div>
                  </template>
                </v-checkbox>

                <v-checkbox
                  v-model="updateStore"
                  color="primary"
                  hide-details
                  density="comfortable"
                  class="mt-2"
                >
                  <template v-slot:label>
                    <div class="d-flex align-center">
                      <v-icon class="me-2" size="small" color="primary">mdi-store-multiple</v-icon>
                      <span class="font-weight-medium">Update Semua Store</span>
                    </div>
                  </template>
                </v-checkbox>
              </v-card>
            </div>

            <!-- Warning Message -->
            <v-alert
              type="warning"
              variant="tonal"
              class="mb-6"
              icon="mdi-alert-circle"
            >
              <div class="text-body-2">
                <strong>Perhatian:</strong> Proses update buffer stok akan mempengaruhi data inventory. 
                Pastikan PIN yang dimasukkan benar dan pilih cabang yang tepat.
              </div>
            </v-alert>

            <!-- Action Button -->
            <div class="text-center">
              <v-btn
                color="primary"
                size="large"
                :loading="isLoading"
                @click="handleUpdate"
                prepend-icon="mdi-database-sync"
                variant="elevated"
                :disabled="!updateDc && !updateStore"
                min-width="200"
              >
                {{ isLoading ? 'Memproses...' : 'Update Buffer Stok' }}
              </v-btn>
            </div>

            <!-- Status Info -->
            <div v-if="updateDc || updateStore" class="mt-4">
              <v-divider class="mb-3"></v-divider>
              <div class="text-center text-body-2 text-medium-emphasis">
                <v-icon class="me-1" size="small">mdi-information</v-icon>
                Target Update: 
                <v-chip
                  v-if="updateDc"
                  size="small"
                  color="primary"
                  variant="outlined"
                  class="ma-1"
                >
                  DC
                </v-chip>
                <v-chip
                  v-if="updateStore"
                  size="small"
                  color="primary"
                  variant="outlined"
                  class="ma-1"
                >
                  All Stores
                </v-chip>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
/* Minimal custom styles - most styling handled by Vuetify */

/* Custom card styling */
.v-card {
  border-radius: 12px !important;
}

/* Ensure proper spacing for checkbox labels */
.v-checkbox :deep(.v-label) {
  font-size: 0.95rem;
}
</style>
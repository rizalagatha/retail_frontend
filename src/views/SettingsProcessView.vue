<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import ConfirmationModal from '@/components/ConfirmationModal.vue';
import { showSuccessToast, showErrorToast } from '@/utils/toast';

const pin = ref<string>('');
const isLoading = ref<boolean>(false);
const currentProcess = ref<string>('');
const isModalVisible = ref(false);
const pendingProcess = ref<'sales' | 'cash' | null>(null);

const confirmRunProcess = (processType: 'sales' | 'cash') => {
  if (!pin.value) {
    showErrorToast('PIN harus diisi.');
    return;
  }
  pendingProcess.value = processType;
  isModalVisible.value = true;
};

const executeProcess = async () => {
  isModalVisible.value = false;
  if (!pendingProcess.value) return;

  isLoading.value = true;
  currentProcess.value = pendingProcess.value;

  const endpoint = pendingProcess.value === 'sales'
    ? 'http://192.168.1.73:8000/api/data-process/insert-sales-details'
    : 'http://192.168.1.73:8000/api/data-process/insert-cash-payments';

  try {
    const response = await axios.post(endpoint, { pin: pin.value });
    showSuccessToast(response.data.message || 'Proses selesai.');
  } catch (error: any) {
    showErrorToast(error.response?.data?.message || 'Terjadi kesalahan saat menjalankan proses.');
  } finally {
    isLoading.value = false;
    currentProcess.value = '';
    pendingProcess.value = null;
  }
};

const cancelProcess = () => {
  isModalVisible.value = false;
  pendingProcess.value = null;
};
</script>

<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" md="10" lg="8">
        <v-card elevation="4" class="mx-auto">
          <!-- Header -->
          <v-card-title class="text-h5 text-center bg-surface-variant pa-6">
            <v-icon left class="me-2" color="primary">mdi-cog-sync</v-icon>
            Proses Data Administratif
          </v-card-title>

          <v-card-text class="pa-8">
            <!-- Description -->
            <div class="text-center mb-6">
              <v-alert
                type="info"
                variant="tonal"
                icon="mdi-information"
                class="mb-4"
              >
                <div class="text-body-2">
                  Jalankan proses latar belakang untuk merapikan data transaksi.
                  <br>
                  <strong>Perhatian:</strong> Proses ini akan mempengaruhi data piutang dan tidak dapat dibatalkan.
                </div>
              </v-alert>
            </div>

            <!-- PIN Input -->
            <v-text-field
              v-model="pin"
              type="password"
              label="PIN Otorisasi"
              placeholder="Masukkan PIN untuk konfirmasi"
              variant="outlined"
              prepend-inner-icon="mdi-lock"
              class="mb-8"
              :rules="[v => !!v || 'PIN tidak boleh kosong']"
              hide-details="auto"
            ></v-text-field>

            <!-- Process Buttons -->
            <v-row class="mb-4">
              <v-col cols="12" md="6">
                <v-card 
                  variant="outlined" 
                  :class="{ 'bg-primary-lighten-5': isLoading && currentProcess === 'sales' }"
                  class="h-100"
                >
                  <v-card-text class="pa-4">
                    <div class="d-flex align-center mb-3">
                      <v-icon color="primary" class="me-2">mdi-receipt</v-icon>
                      <span class="font-weight-bold text-body-1">Penjualan Detail Piutang</span>
                    </div>
                    <div class="text-body-2 text-medium-emphasis mb-4">
                      Proses untuk memasukkan data detail penjualan ke dalam sistem piutang
                    </div>
                    <v-btn
                      color="primary"
                      block
                      size="large"
                      :loading="isLoading && currentProcess === 'sales'"
                      @click="confirmRunProcess('sales')"
                      prepend-icon="mdi-play"
                      variant="elevated"
                    >
                      {{ isLoading && currentProcess === 'sales' ? 'Memproses...' : 'Jalankan Proses' }}
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>

              <v-col cols="12" md="6">
                <v-card 
                  variant="outlined"
                  :class="{ 'bg-success-lighten-5': isLoading && currentProcess === 'cash' }"
                  class="h-100"
                >
                  <v-card-text class="pa-4">
                    <div class="d-flex align-center mb-3">
                      <v-icon color="success" class="me-2">mdi-cash</v-icon>
                      <span class="font-weight-bold text-body-1">Bayar Tunai Detail Piutang</span>
                    </div>
                    <div class="text-body-2 text-medium-emphasis mb-4">
                      Proses untuk memasukkan data pembayaran tunai langsung ke detail piutang
                    </div>
                    <v-btn
                      color="success"
                      block
                      size="large"
                      :loading="isLoading && currentProcess === 'cash'"
                      @click="confirmRunProcess('cash')"
                      prepend-icon="mdi-play"
                      variant="elevated"
                    >
                      {{ isLoading && currentProcess === 'cash' ? 'Memproses...' : 'Jalankan Proses' }}
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>

            <!-- Status Information -->
            <div v-if="isLoading" class="text-center">
              <v-divider class="mb-4"></v-divider>
              <div class="d-flex align-center justify-center">
                <v-progress-circular 
                  indeterminate 
                  color="primary" 
                  size="20"
                  class="me-2"
                ></v-progress-circular>
                <span class="text-medium-emphasis">
                  Sedang memproses {{ currentProcess === 'sales' ? 'data penjualan' : 'data pembayaran tunai' }}...
                </span>
              </div>
            </div>

            <!-- Warning -->
            <v-alert
              type="warning"
              variant="outlined"
              icon="mdi-alert-triangle"
              class="mt-6"
            >
              <div class="text-body-2">
                <strong>Peringatan:</strong> Pastikan tidak ada proses lain yang sedang berjalan. 
                Proses ini dapat memakan waktu beberapa menit tergantung volume data.
              </div>
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <ConfirmationModal
      v-if="isModalVisible"
      title="Konfirmasi Proses"
      message="Apakah Anda yakin ingin menjalankan proses ini? Tindakan ini tidak dapat dibatalkan."
      @confirm="executeProcess"
      @cancel="cancelProcess"
    />
  </v-container>
</template>

<style scoped>
/* Minimal custom styles - most styling handled by Vuetify */

/* Ensure equal height for process cards */
.h-100 {
  height: 100%;
}

/* Custom card styling */
.v-card {
  border-radius: 12px !important;
}

/* Background colors for active processes */
.bg-primary-lighten-5 {
  background-color: rgb(var(--v-theme-primary), 0.05) !important;
}

.bg-success-lighten-5 {
  background-color: rgb(var(--v-theme-success), 0.05) !important;
}
</style>
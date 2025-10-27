<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import api from '@/services/api';
import ConfirmationModal from '@/components/modal/ConfirmationModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import axios from 'axios';
import { useSettingsProcessDialog } from '@/composables/useSettingsProcessDialog';

const { isSettingsProcessDialogOpen, closeSettingsProcessDialog } = useSettingsProcessDialog();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '3';

const pin = ref<string>('');
const isLoading = ref<boolean>(false);
const currentProcess = ref<string>('');
const isModalVisible = ref(false);
const pendingProcess = ref<'sales' | 'cash' | null>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const hasEditPermission = computed(() => authStore.can(MENU_ID, 'edit'));

const confirmRunProcess = (processType: 'sales' | 'cash') => {
  if (!hasEditPermission.value) {
    toast.error('Anda tidak memiliki izin untuk menjalankan proses ini.');
    return;
  }
  if (!pin.value) {
    toast.error('PIN Otorisasi harus diisi.');
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

  const endpoint =
    pendingProcess.value === 'sales'
      ? '/data-process/insert-sales-details'
      : '/data-process/insert-cash-payments';

  try {
    const response = await api.post(endpoint, { pin: pin.value });
    toast.success(response.data.message || 'Proses selesai.');
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || error.message || 'Terjadi kesalahan saat menjalankan proses.');
    } else if (error instanceof Error) {
      toast.error(error.message || 'Terjadi kesalahan saat menjalankan proses.');
    } else {
      toast.error('Terjadi kesalahan saat menjalankan proses.');
    }
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

onMounted(() => {
  if (!hasViewPermission.value) {
    toast.error('Anda tidak memiliki izin untuk mengakses halaman ini.');
  }
});
</script>

<template>
  <v-dialog v-model="isSettingsProcessDialogOpen" max-width="960" persistent>
    <v-card class="pa-4">
      <div class="d-flex align-center justify-space-between mb-3">
        <div class="d-flex align-center">
          <v-icon color="primary" class="me-2">mdi-cog-sync</v-icon>
          <span class="text-subtitle-1 font-weight-medium">Proses Data Administratif</span>
        </div>
        <v-btn icon="mdi-close" variant="text" @click="closeSettingsProcessDialog" />
      </div>

      <v-divider class="mb-4" />

      <div v-if="!hasViewPermission" class="state-container">
        <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
        <h3 class="text-h6">Akses Ditolak</h3>
        <p class="body-1 mt-2">Anda tidak memiliki izin untuk melihat data ini.</p>
      </div>

      <div v-else class="process-container">
        <!-- Otorisasi -->
        <h3 class="section-title">Otorisasi</h3>
        <v-text-field v-model="pin" type="password" label="PIN Otorisasi" placeholder="Masukkan PIN untuk konfirmasi"
          variant="outlined" density="compact" prepend-inner-icon="mdi-lock-outline" hide-details="auto"
          :disabled="!hasEditPermission" />

        <v-divider class="my-5" />

        <!-- Pilihan Proses -->
        <h3 class="section-title">Pilih Proses</h3>
        <v-list lines="two" density="compact" class="process-list">
          <v-list-item>
            <template #prepend>
              <v-icon color="primary" class="mt-1">mdi-receipt-text-plus-outline</v-icon>
            </template>
            <v-list-item-title class="font-weight-medium">Penjualan Detail Piutang</v-list-item-title>
            <v-list-item-subtitle>
              Proses untuk memasukkan data detail penjualan ke dalam sistem piutang.
            </v-list-item-subtitle>
            <template #append>
              <v-btn color="primary" size="small" :loading="isLoading && currentProcess === 'sales'"
                @click="confirmRunProcess('sales')" prepend-icon="mdi-play" variant="tonal"
                :disabled="!hasEditPermission">
                Jalankan
              </v-btn>
            </template>
          </v-list-item>

          <v-divider class="my-2" />

          <v-list-item>
            <template #prepend>
              <v-icon color="success" class="mt-1">mdi-cash-multiple</v-icon>
            </template>
            <v-list-item-title class="font-weight-medium">Bayar Tunai Detail Piutang</v-list-item-title>
            <v-list-item-subtitle>
              Proses untuk memasukkan data pembayaran tunai langsung ke detail piutang.
            </v-list-item-subtitle>
            <template #append>
              <v-btn color="success" size="small" :loading="isLoading && currentProcess === 'cash'"
                @click="confirmRunProcess('cash')" prepend-icon="mdi-play" variant="tonal"
                :disabled="!hasEditPermission">
                Jalankan
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </div>

      <v-divider class="my-4" />

      <div v-if="isLoading" class="d-flex align-center">
        <v-progress-circular indeterminate color="primary" size="16" width="2" class="me-2" />
        <span>Sedang memproses {{ currentProcess === 'sales' ? 'data penjualan' : 'data pembayaran tunai' }}...</span>
      </div>
      <div v-else class="d-flex align-center">
        <v-icon size="x-small" class="me-2">mdi-alert-circle-outline</v-icon>
        <span>Proses ini akan mempengaruhi data piutang dan tidak dapat dibatalkan.</span>
      </div>

      <ConfirmationModal v-if="isModalVisible" title="Konfirmasi Proses"
        message="Apakah Anda yakin ingin menjalankan proses ini? Tindakan ini tidak dapat dibatalkan."
        @confirm="executeProcess" @cancel="cancelProcess" />
    </v-card>
  </v-dialog>
</template>

<style scoped>
.process-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.process-list {
  background: transparent;
}

.process-list .v-list-item-subtitle {
  white-space: normal;
  font-size: 0.75rem;
}

.state-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: #757575;
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import ConfirmationModal from '@/components/ConfirmationModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '3'; // ID Menu untuk halaman Pengaturan

const pin = ref<string>('');
const isLoading = ref<boolean>(false);
const currentProcess = ref<string>('');
const isModalVisible = ref(false);
const pendingProcess = ref<'sales' | 'cash' | null>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const hasEditPermission = computed(() => authStore.can(MENU_ID, 'edit')); // (1) Tambahkan computed untuk hak edit

const confirmRunProcess = (processType: 'sales' | 'cash') => {
  // (2) Tambahkan guard di dalam method
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

  const endpoint = pendingProcess.value === 'sales'
    ? '/data-process/insert-sales-details'
    : '/data-process/insert-cash-payments';

  try {
    const response = await api.post(endpoint, { pin: pin.value });
    toast.success(response.data.message || 'Proses selesai.');
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Terjadi kesalahan saat menjalankan proses.');
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
        toast.error("Anda tidak memiliki izin untuk mengakses halaman ini.");
    }
});
</script>

<template>
  <PageLayout 
    title="Proses Data Administratif" 
    desktop-mode 
    icon="mdi-cog-sync"
    max-width="960px"
  >
    <div v-if="!hasViewPermission" class="state-container">
        <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
        <h3 class="text-h6">Akses Ditolak</h3>
        <p class="body-1 mt-2">Anda tidak memiliki izin untuk melihat data ini.</p>
    </div>

    <div v-else class="process-container">
      <div class="desktop-form-section action-panel">
        <!-- Otorisasi -->
        <h3 class="section-title">Otorisasi</h3>
        <v-text-field
          v-model="pin"
          type="password"
          label="PIN Otorisasi"
          placeholder="Masukkan PIN untuk konfirmasi"
          variant="outlined"
          density="compact"
          prepend-inner-icon="mdi-lock-outline"
          hide-details="auto"
          :disabled="!hasEditPermission"
        ></v-text-field>
        
        <v-divider class="my-5"></v-divider>

        <!-- Pilihan Proses -->
        <h3 class="section-title">Pilih Proses</h3>
        <v-list lines="two" density="compact" class="process-list">
          <v-list-item>
            <template #prepend><v-icon color="primary" class="mt-1">mdi-receipt-text-plus-outline</v-icon></template>
            <v-list-item-title class="font-weight-medium">Penjualan Detail Piutang</v-list-item-title>
            <v-list-item-subtitle>Proses untuk memasukkan data detail penjualan ke dalam sistem piutang.</v-list-item-subtitle>
            <template #append>
              <v-btn
                color="primary"
                size="small"
                :loading="isLoading && currentProcess === 'sales'"
                @click="confirmRunProcess('sales')"
                prepend-icon="mdi-play"
                variant="tonal"
                :disabled="!hasEditPermission"
              >
                Jalankan
              </v-btn>
            </template>
          </v-list-item>

          <v-divider class="my-2"></v-divider>

          <v-list-item>
            <template #prepend><v-icon color="success" class="mt-1">mdi-cash-multiple</v-icon></template>
            <v-list-item-title class="font-weight-medium">Bayar Tunai Detail Piutang</v-list-item-title>
            <v-list-item-subtitle>Proses untuk memasukkan data pembayaran tunai langsung ke detail piutang.</v-list-item-subtitle>
             <template #append>
              <v-btn
                color="success"
                size="small"
                :loading="isLoading && currentProcess === 'cash'"
                @click="confirmRunProcess('cash')"
                prepend-icon="mdi-play"
                variant="tonal"
                :disabled="!hasEditPermission"
              >
                Jalankan
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </div>
    </div>

    <template #footer>
      <div v-if="isLoading" class="d-flex align-center">
        <v-progress-circular indeterminate color="primary" size="16" width="2" class="me-2"></v-progress-circular>
        <span>Sedang memproses {{ currentProcess === 'sales' ? 'data penjualan' : 'data pembayaran tunai' }}...</span>
      </div>
       <div v-else class="d-flex align-center">
        <v-icon size="x-small" class="me-2">mdi-alert-circle-outline</v-icon>
        <span>Proses ini akan mempengaruhi data piutang dan tidak dapat dibatalkan.</span>
      </div>
    </template>

    <ConfirmationModal
      v-if="isModalVisible"
      title="Konfirmasi Proses"
      message="Apakah Anda yakin ingin menjalankan proses ini? Tindakan ini tidak dapat dibatalkan."
      @confirm="executeProcess"
      @cancel="cancelProcess"
    />
  </PageLayout>
</template>

<style scoped>
.process-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 16px;
  height: 100%;
}
.action-panel {
  width: 100%;
  max-width: 700px;
}
.section-title {
  font-size: 0.875rem; /* 14px */
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}
.process-list {
  background: transparent;
}
.process-list .v-list-item-subtitle {
  white-space: normal;
  font-size: 0.75rem; /* 12px */
}

.state-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #757575;
}
</style>


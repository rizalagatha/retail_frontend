<script setup lang="ts">
import { ref, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import axios from 'axios';
import { useBufferStockDialog } from '@/composables/useBufferStockDialog';

interface ErrorResponse {
  message: string;
}

const toast = useToast();
const { showBufferStockDialog, closeBufferStockDialog } = useBufferStockDialog();

const pin = ref('');
const updateDc = ref(false);
const updateStore = ref(false);
const isLoading = ref(false);

const handleUpdate = async () => {
  if (!updateDc.value && !updateStore.value) {
    toast.error('Silakan pilih cabang (DC atau Store) yang akan diupdate.');
    return;
  }
  if (!pin.value) {
    toast.error('PIN Otorisasi harus diisi.');
    return;
  }

  isLoading.value = true;
  try {
    const response = await api.post('/buffer-stock/update', {
      pin: pin.value,
      updateDc: updateDc.value,
      updateStore: updateStore.value,
    });
    toast.success(response.data.message);
    closeBufferStockDialog();
  } catch (error: unknown) {
    if (axios.isAxiosError<ErrorResponse>(error)) {
      toast.error(error.response?.data?.message || 'Terjadi kesalahan saat update.');
    } else {
      console.error('Unexpected error:', error);
      toast.error('Terjadi kesalahan saat update (unknown error).');
    }
  } finally {
    isLoading.value = false;
  }
};

const statusText = computed(() => {
  const targets: string[] = [];
  if (updateDc.value) targets.push('DC');
  if (updateStore.value) targets.push('All Stores');
  return targets.length > 0 ? `Target Update: ${targets.join(' & ')}` : 'Pilih target update';
});
</script>

<template>
  <v-dialog v-model="showBufferStockDialog" max-width="520">
    <v-card class="pa-6">
      <v-card-title class="text-h6 mb-2 d-flex justify-space-between align-center">
        Update Buffer Stok
        <v-btn icon="mdi-close" size="small" variant="text" @click="closeBufferStockDialog" />
      </v-card-title>

      <v-divider class="mb-4" />

      <v-text-field v-model="pin" type="password" label="PIN Otorisasi" placeholder="Masukkan PIN Anda"
        variant="outlined" density="compact" prepend-inner-icon="mdi-lock-outline" hide-details="auto" />

      <v-divider class="my-5" />

      <h3 class="text-subtitle-2 mb-2">Pilih Target Update</h3>
      <v-checkbox v-model="updateDc" label="Update Cabang DC" density="compact" hide-details />
      <v-checkbox v-model="updateStore" label="Update Semua Store" density="compact" hide-details />

      <v-alert type="warning" variant="tonal" density="compact" class="mb-5 text-caption"
        icon="mdi-alert-circle-outline">
        Proses ini akan mempengaruhi data inventory. Pastikan PIN dan pilihan cabang sudah benar.
      </v-alert>

      <v-btn color="primary" :loading="isLoading" @click="handleUpdate" prepend-icon="mdi-database-sync-outline"
        variant="elevated" :disabled="(!updateDc && !updateStore) || !pin" block>
        {{ isLoading ? 'Memproses...' : 'Jalankan Update Buffer Stok' }}
      </v-btn>

      <v-divider class="my-4" />
      <div class="d-flex align-center text-caption text-medium-emphasis">
        <v-icon size="x-small" class="me-2">
          {{ (updateDc || updateStore) ? 'mdi-check-circle' : 'mdi-information-outline' }}
        </v-icon>
        <span>{{ statusText }}</span>
      </div>
    </v-card>
  </v-dialog>
</template>

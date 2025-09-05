<script setup lang="ts">
import { ref, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';

const toast = useToast();

const pin = ref<string>('');
const updateDc = ref<boolean>(false);
const updateStore = ref<boolean>(false);
const isLoading = ref<boolean>(false);

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
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Terjadi kesalahan saat update.');
  } finally {
    isLoading.value = false;
  }
};

const statusText = computed(() => {
    const targets = [];
    if (updateDc.value) targets.push('DC');
    if (updateStore.value) targets.push('All Stores');
    return targets.length > 0 ? `Target Update: ${targets.join(' & ')}` : 'Pilih target update';
});
</script>

<template>
  <PageLayout 
    title="Update Buffer Stok" 
    desktop-mode 
    icon="mdi-database-sync"
    max-width="960px"
  >
    <div class="update-container">
      <div class="desktop-form-section action-panel">
        <h3 class="section-title">Otorisasi</h3>
        <v-text-field
          v-model="pin"
          type="password"
          label="PIN Otorisasi"
          placeholder="Masukkan PIN Anda"
          variant="outlined"
          density="compact"
          prepend-inner-icon="mdi-lock-outline"
          hide-details="auto"
        ></v-text-field>
        
        <v-divider class="my-5"></v-divider>

        <h3 class="section-title">Pilih Target Update</h3>
        <div class="mb-4">
            <v-checkbox
              v-model="updateDc"
              label="Update Cabang DC"
              density="compact"
              hide-details
            ></v-checkbox>
            <v-checkbox
              v-model="updateStore"
              label="Update Semua Store"
              density="compact"
              hide-details
            ></v-checkbox>
        </div>
        
        <v-alert
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-5 text-caption"
          icon="mdi-alert-circle-outline"
        >
          Proses ini akan mempengaruhi data inventory. Pastikan PIN dan pilihan cabang sudah benar.
        </v-alert>

        <v-btn
          color="primary"
          :loading="isLoading"
          @click="handleUpdate"
          prepend-icon="mdi-database-sync-outline"
          variant="elevated"
          :disabled="(!updateDc && !updateStore) || !pin"
          block
        >
          {{ isLoading ? 'Memproses...' : 'Jalankan Update Buffer Stok' }}
        </v-btn>
      </div>
    </div>

    <template #footer>
      <div class="d-flex align-center">
        <v-icon size="x-small" class="me-2">{{ (updateDc || updateStore) ? 'mdi-check-circle' : 'mdi-information-outline' }}</v-icon>
        <span>{{ statusText }}</span>
      </div>
    </template>
  </PageLayout>
</template>

<style scoped>
.update-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 16px;
  height: 100%;
}

.action-panel {
  width: 100%;
  max-width: 500px; /* Batasi lebar agar fokus */
}

.section-title {
  font-size: 0.875rem; /* 14px */
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
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


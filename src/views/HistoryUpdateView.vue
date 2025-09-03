<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import BaseButton from '@/components/BaseButton.vue'; // (1) Impor BaseButton

// Tipe data untuk struktur history yang dikelompokkan
interface ReleaseHistory {
  [version: string]: {
    releaseDate: string;
    notes: string[];
  };
}

const history = ref<ReleaseHistory>({});
const limit = ref<number>(10);
const isLoading = ref<boolean>(true);
const error = ref<string | null>(null);

// Fungsi untuk mengambil data dari backend
const fetchHistory = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    const response = await api.get(`/history-updates?limit=${limit.value}`);
    history.value = response.data;
  } catch (err) {
    console.error('Gagal mengambil data history:', err);
    error.value = 'Tidak dapat memuat data dari server.';
  } finally {
    isLoading.value = false;
  }
};

// Panggil fetchHistory saat komponen pertama kali dimuat
onMounted(fetchHistory);
</script>

<template>
  <PageLayout title="History Update Program">
    <template #header-actions>
      <div class="d-flex align-center ga-3">
        <span class="text-medium-emphasis font-weight-medium">Tampilkan:</span>
        <v-text-field
          v-model.number="limit"
          type="number"
          min="1"
          variant="outlined"
          density="compact"
          style="width: 80px;"
          hide-details
          @keydown.enter="fetchHistory"
        ></v-text-field>
        <!-- (2) Ganti <button> dengan <BaseButton> -->
        <BaseButton @click="fetchHistory" variant="secondary">Refresh</BaseButton>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="isLoading" class="d-flex justify-center align-center" style="min-height: 400px;">
      <div class="text-center">
        <v-progress-circular
          indeterminate
          color="primary"
          size="48"
        ></v-progress-circular>
        <div class="mt-4 text-medium-emphasis">Memuat data...</div>
      </div>
    </div>

    <!-- Error State -->
    <v-alert
      v-else-if="error"
      type="error"
      variant="tonal"
      class="ma-4"
      :text="error"
    ></v-alert>

    <!-- No Data State -->
    <div v-else-if="Object.keys(history).length === 0" class="d-flex justify-center align-center" style="min-height: 400px;">
      <div class="text-center">
        <v-icon size="64" color="grey-lighten-1">mdi-history</v-icon>
        <div class="mt-4 text-medium-emphasis">Tidak ada data history yang ditemukan.</div>
      </div>
    </div>

    <!-- History Content -->
    <div v-else class="pa-2">
      <v-card
        v-for="(details, version) in history"
        :key="version"
        class="mb-4"
        elevation="2"
      >
        <!-- Release Header -->
        <v-card-title class="d-flex justify-space-between align-center bg-surface-variant">
          <h2 class="text-h6 font-weight-bold">Versi {{ version }}</h2>
          <v-chip
            color="grey"
            size="small"
            variant="tonal"
          >
            <v-icon start>mdi-calendar</v-icon>
            Release date: {{ details.releaseDate }}
          </v-chip>
        </v-card-title>

        <!-- Release Notes -->
        <v-card-text>
          <v-list density="compact">
            <v-list-item
              v-for="(note, index) in details.notes"
              :key="index"
            >
              <template v-slot:prepend>
                <v-icon size="small" color="grey-darken-1">mdi-circle-small</v-icon>
              </template>
              <v-list-item-title class="text-wrap">{{ note }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </div>
  </PageLayout>
</template>

<style scoped>
/* Minimal custom styles - most styling handled by Vuetify */

/* Ensure proper text wrapping for long notes */
.v-list-item-title {
  white-space: normal !important;
  line-height: 1.5;
}

/* Custom gap for toolbar items */
.ga-3 {
  gap: 0.75rem;
}
</style>
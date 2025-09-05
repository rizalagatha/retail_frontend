<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';

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
  <PageLayout title="History Update Program" desktop-mode icon="mdi-history">
    <template #header-actions>
      <div class="d-flex align-center ga-2">
        <span class="filter-label">Tampilkan:</span>
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
        <v-btn size="small" @click="fetchHistory" prepend-icon="mdi-refresh">Refresh</v-btn>
      </div>
    </template>

    <!-- Error State -->
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="ma-4"
      :text="error"
    ></v-alert>

    <!-- No Data State (setelah loading selesai dan tidak error) -->
    <div v-else-if="!isLoading && Object.keys(history).length === 0" class="state-container">
      <v-icon size="64" color="grey-lighten-1">mdi-database-off-outline</v-icon>
      <div class="mt-4 text-medium-emphasis">Tidak ada data history yang ditemukan.</div>
    </div>
    
    <!-- History Content -->
    <div v-else class="history-timeline-container">
      <v-timeline density="compact" align="start" side="end">
        <v-timeline-item
          v-for="(details, version) in history"
          :key="version"
          dot-color="primary"
          size="small"
        >
          <template #opposite>
            <div class="version-header">
              <span class="font-weight-bold">Versi {{ version }}</span>
              <span class="text-caption text-medium-emphasis">{{ details.releaseDate }}</span>
            </div>
          </template>
          
          <div class="release-notes">
            <v-list density="compact" class="py-0">
              <v-list-item
                v-for="(note, index) in details.notes"
                :key="index"
                class="px-0"
                min-height="24px"
              >
                <template #prepend>
                  <v-icon size="12" color="grey" class="me-2">mdi-circle-small</v-icon>
                </template>
                <v-list-item-title class="note-text">{{ note }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </v-timeline-item>
      </v-timeline>
    </div>

  </PageLayout>
</template>

<style scoped>
.filter-label {
    font-size: 12px;
    font-weight: 500;
    color: #424242;
}

.state-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
}

.history-timeline-container {
  padding: 16px 24px;
}

.version-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-top: 4px; /* Align with timeline dot */
}

.release-notes {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 8px 12px;
  background-color: #f9f9f9;
}

.note-text {
  font-size: 12px;
  line-height: 1.5;
  white-space: normal;
  color: #333;
}
</style>

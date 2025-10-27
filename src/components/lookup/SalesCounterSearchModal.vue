<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';

interface SalesCounter {
  kode: string;
  nama: string;
}

const emit = defineEmits(['close', 'sales-counter-selected']);

const salesCounters = ref<SalesCounter[]>([]);
const searchTerm = ref('');
const isLoading = ref(false);

const headers = [
  { title: 'Kode', key: 'kode', sortable: false },
  { title: 'Nama', key: 'nama', sortable: false },
];

const fetchAllSalesCounters = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/sales-counters');
    salesCounters.value = response.data;
  } catch (error) {
    console.error("Gagal mengambil daftar sales counter:", error);
  } finally {
    isLoading.value = false;
  }
};

const filteredSalesCounters = computed(() => {
  if (!searchTerm.value) {
    return salesCounters.value;
  }
  const lowerCaseSearch = searchTerm.value.toLowerCase();
  return salesCounters.value.filter(sc => 
    sc.kode.toLowerCase().includes(lowerCaseSearch) ||
    sc.nama.toLowerCase().includes(lowerCaseSearch)
  );
});

const selectSalesCounter = (sc: SalesCounter) => {
  emit('sales-counter-selected', sc);
};

onMounted(fetchAllSalesCounters);
</script>

<template>
  <v-dialog
    :model-value="true"
    @update:modelValue="emit('close')"
    max-width="900px"
    persistent
  >
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Sales Counter</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="searchTerm"
          label="Cari berdasarkan Kode atau Nama..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0"
          hide-details
        ></v-text-field>

        <v-data-table
          :headers="headers"
          :items="filteredSalesCounters"
          :loading="isLoading"
          hover
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
        >
          <template #item="{ item }">
            <tr @click="selectSalesCounter(item)" style="cursor: pointer;">
              <td>{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data sales counter.</div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-card {
    font-size: 12px;
}
.desktop-table {
    font-size: 11px;
}
.desktop-table :deep(td), .desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 28px !important;
}
</style>
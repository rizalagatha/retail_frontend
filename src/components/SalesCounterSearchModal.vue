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
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="700px">
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>Bantuan - Pilih Sales Counter</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="emit('close')"></v-btn>
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="searchTerm"
          label="Cari berdasarkan Kode atau Nama..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-4"
        ></v-text-field>
        <v-data-table
          :headers="[{ title: 'Kode', key: 'kode' }, { title: 'Nama', key: 'nama' }]"
          :items="filteredSalesCounters"
          :loading="isLoading"
          density="compact"
          hover
          @click:row="(_, { item }) => selectSalesCounter(item)"
        >
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

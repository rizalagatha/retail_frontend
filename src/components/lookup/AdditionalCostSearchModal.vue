<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';

interface AdditionalCost {
  tambahan: string;
  harga: number;
}

const emit = defineEmits(['close', 'cost-selected']);

const items = ref<AdditionalCost[]>([]);
const loading = ref(true);

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get('/price-proposal-form/search-additional-costs');
    items.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data biaya tambahan:", error);
  } finally {
    loading.value = false;
  }
};

const selectCost = (item: AdditionalCost) => {
  emit('cost-selected', item);
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="600px">
    <v-card class="dialog-card">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Harga Tambahan</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text>
        <v-data-table
          :headers="[{ title: 'Keterangan Tambahan', key: 'tambahan' }, { title: 'Harga', key: 'harga', align: 'end' }]"
          :items="items"
          :loading="loading"
          density="compact"
          class="desktop-table"
          hover
          @click:row="(_, { item }) => selectCost(item)"
        ></v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';

interface JenisKaos {
  JenisKaos: string;
}

const emit = defineEmits(['close', 'select']);
const items = ref<JenisKaos[]>([]);
const loading = ref(true);

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get('/setting-harga/search-jenis-kaos');
    items.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data Jenis Kaos:", error);
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: JenisKaos) => {
  emit('select', item.JenisKaos);
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="800px">
    <v-card class="dialog-card">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Jenis Kaos</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text>
        <v-data-table
          :headers="[{ title: 'Jenis Kaos', key: 'JenisKaos' }]"
          :items="items"
          :loading="loading"
          density="compact"
          class="desktop-table"
          hover
          @click:row="(_, { item }) => selectItem(item)"
        ></v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
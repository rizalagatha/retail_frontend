<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';

interface Product {
  Kode: string;
  Nama: string;
}

const props = defineProps<{ jenisKaos: string }>();
const emit = defineEmits(['close', 'product-selected']);

const items = ref<Product[]>([]);
const loading = ref(true);

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get('/price-proposal-form/search-products-by-type', {
      params: { jenisKaos: props.jenisKaos },
    });
    items.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data produk:", error);
  } finally {
    loading.value = false;
  }
};

const selectProduct = (item: Product) => {
  emit('product-selected', item);
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="800px">
    <v-card class="dialog-card">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Kode Barang</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text>
        <v-data-table
          :headers="[{ title: 'Kode', key: 'Kode' }, { title: 'Nama Barang', key: 'Nama' }]"
          :items="items"
          :loading="loading"
          density="compact"
          class="desktop-table"
          hover
          @click:row="(_, { item }) => selectProduct(item)"
        ></v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
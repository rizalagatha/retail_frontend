<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';

// --- Tipe Data Diperbarui ---
interface ProductVariant {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  harga: number;
  stok: number;
}

// --- Props & Emits ---
const props = defineProps({
  category: { type: String, required: true },
  gudang: { type: String, required: true },
});
const emit = defineEmits(['close', 'product-selected']);

// --- State ---
const items = ref<ProductVariant[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 10 });

// --- Headers Tabel Diperbarui ---
const headers = [
  { title: 'Kode', key: 'kode', sortable: false },
  { title: 'Barcode', key: 'barcode', sortable: false },
  { title: 'Nama Barang', key: 'nama', sortable: false, width: '30%' },
  { title: 'Ukuran', key: 'ukuran', sortable: false },
  { title: 'Harga', key: 'harga', sortable: false, align: 'end' },
  { title: 'Stok', key: 'stok', sortable: false, align: 'end' },
];

// --- Methods ---
const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await api.get('/barcode-form/search-products', {
      params: {
        term: search.value,
        category: props.category,
        gudang: props.gudang,
        page: page,
        itemsPerPage: itemsPerPage,
      },
    });
    
    if (response.data && Array.isArray(response.data.items)) {
        items.value = response.data.items;
        totalItems.value = response.data.total;
    } else { 
        items.value = [];
        totalItems.value = 0;
    }
  } catch (error) { 
    console.error("Gagal memuat data produk:", error);
    items.value = [];
    totalItems.value = 0;
  } 
  finally { loading.value = false; }
};

const selectVariant = (item: ProductVariant) => {
    if (item && item.kode) {
        // Kirim hanya kode seperti yang diharapkan parent
        emit('product-selected', { kode: item.kode });
        emit('close'); // Tutup dialog setelah memilih
    }
};

// --- Watchers ---
let searchTimeout: number;
watch(search, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        options.value.page = 1;
        loadItems(options.value);
    }, 500);
});
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="1200px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Varian Produk</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode, nama, atau barcode..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0"
          hide-details
        ></v-text-field>

        <v-data-table-server
          v-model:page="options.page"
          v-model:items-per-page="options.itemsPerPage"
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="loading"
          @update:options="loadItems"
          hover
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
        >
          <template #item="{ item }">
            <tr @click="selectVariant(item)" style="cursor: pointer;">
              <td>{{ item.kode }}</td>
              <td>{{ item.barcode }}</td>
              <td>{{ item.nama }}</td>
              <td>{{ item.ukuran }}</td>
              <td class="text-end">{{ new Intl.NumberFormat('id-ID').format(item.harga) }}</td>
              <td class="text-end font-weight-bold">{{ item.stok }}</td>
            </tr>
          </template>
        </v-data-table-server>
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

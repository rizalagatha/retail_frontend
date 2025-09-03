<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

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
    console.log('Produk dipilih:', item); // Debug log
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
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="1200px" persistent>
    <v-card>
      <v-toolbar color="primary" dark>
        <v-toolbar-title>Bantuan - Pilih Varian Produk</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode, nama, atau barcode..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          clearable
          class="mb-4"
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
          class="elevation-1"
          density="compact"
        >
          <!-- Gunakan slot item yang lebih sederhana -->
          <template #item.kode="{ item }">
            <td @click="selectVariant(item)" style="cursor: pointer;">{{ item.kode }}</td>
          </template>
          <template #item.barcode="{ item }">
            <td @click="selectVariant(item)" style="cursor: pointer;">{{ item.barcode }}</td>
          </template>
          <template #item.nama="{ item }">
            <td @click="selectVariant(item)" style="cursor: pointer;">{{ item.nama }}</td>
          </template>
          <template #item.ukuran="{ item }">
            <td @click="selectVariant(item)" style="cursor: pointer;">{{ item.ukuran }}</td>
          </template>
          <template #item.harga="{ item }">
            <td @click="selectVariant(item)" style="cursor: pointer;" class="text-end">
              {{ new Intl.NumberFormat('id-ID').format(item.harga) }}
            </td>
          </template>
          <template #item.stok="{ item }">
            <td @click="selectVariant(item)" style="cursor: pointer;" class="text-end font-weight-bold">
              {{ item.stok }}
            </td>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
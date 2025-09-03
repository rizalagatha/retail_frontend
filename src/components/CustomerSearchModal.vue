<script setup lang="ts">
import { ref, watch } from 'vue';
import axios from 'axios';

interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  level: string;
}

// --- Props & Emits ---
const props = defineProps({
  gudang: {
    type: String,
    required: true,
  }
});
const emit = defineEmits(['close', 'customer-selected']);

// --- State ---
const items = ref<Customer[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');

const headers = [
  { title: 'Kode', key: 'kode', sortable: false },
  { title: 'Nama Customer', key: 'nama', sortable: false },
  { title: 'Level', key: 'level', sortable: false },
  { title: 'Alamat', key: 'alamat', sortable: false },
  { title: 'Kota', key: 'kota', sortable: false },
];

// --- Methods ---
const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await axios.get('http://:8000/api/offer-form/search-customers', {
      params: {
        term: search.value,
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
    console.error("Gagal memuat data customer:", error);
    items.value = [];
    totalItems.value = 0;
  } finally {
    loading.value = false;
  }
};

const selectCustomer = (item: any) => {
    // Perbaikan Definitif: Selalu gunakan item.raw saat berinteraksi dengan event dari tabel
    const customerData = item ? item : item;
    if (customerData) {
        emit('customer-selected', customerData);
    }
};

// --- Watchers ---
let searchTimeout: number;
watch(search, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadItems({ page: 1, itemsPerPage: 10 });
    }, 500);
});
</script>

<template>
  <v-dialog
    :model-value="true"
    @update:model-value="emit('close')"
    max-width="900px"
    persistent
  >
    <v-card>
      <v-toolbar color="primary" dark>
        <v-toolbar-title>Bantuan - Pilih Customer</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode atau nama customer..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          clearable
          class="mb-4"
          hide-details
        ></v-text-field>

        <v-data-table-server
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="loading"
          @update:options="loadItems"
          @click:row="(_, { item }) => selectCustomer(item)"
          hover
          class="elevation-1"
        >
          <!-- Perbaikan: Gunakan 'item.raw' untuk mengakses data asli di dalam template -->
          <template #item="{ item }">
            <tr @click="selectCustomer(item)" style="cursor: pointer;">
              <td>{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
              <td>{{ item.level }}</td>
              <td>{{ item.alamat }}</td>
              <td>{{ item.kota }}</td>
            </tr>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>


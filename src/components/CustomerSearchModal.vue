<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';

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
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
  { title: 'Kode', key: 'kode', sortable: false },
  { title: 'Nama Customer', key: 'nama', sortable: false, width: '30%' },
  { title: 'Level', key: 'level', sortable: false },
  { title: 'Alamat', key: 'alamat', sortable: false },
  { title: 'Kota', key: 'kota', sortable: false },
];

// --- Methods ---
const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await api.get('/offer-form/search-customers', {
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

const selectCustomer = (item: Customer) => {
    if (item && item.kode) {
        emit('customer-selected', item);
        emit('close');
    }
};

// --- Watchers ---
let searchTimeout: number;
watch(search, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        options.value.page = 1; // Reset ke halaman pertama saat mencari
        loadItems(options.value);
    }, 500);
});
</script>

<template>
  <v-dialog
    :model-value="true"
    @update:model-value="$emit('close')"
    max-width="1200px"
    persistent
  >
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Customer</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode atau nama customer..."
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

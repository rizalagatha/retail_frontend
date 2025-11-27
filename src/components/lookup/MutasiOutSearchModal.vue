<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';

interface MutasiOut {
  Nomor: string;
  Tanggal: string;
  DariCabangNama: string;
  NoSO: string;
  Customer: string;
}

const emit = defineEmits(['close', 'mutasi-out-selected']);

const items = ref<MutasiOut[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
  { title: 'Nomor MO', key: 'Nomor' },
  { title: 'Tanggal', key: 'Tanggal' },
  { title: 'Dari Cabang', key: 'DariCabangNama' },
  { title: 'No. SO', key: 'NoSO' },
  { title: 'Customer', key: 'Customer' },
];

const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await api.get('/mutasi-in-form/search/mutasi-out', {
      params: {
        term: search.value,
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
    console.error("Gagal memuat data Mutasi Out:", error);
    items.value = [];
    totalItems.value = 0;
  } finally {
    loading.value = false;
  }
};

const selectMutasiOut = (item: MutasiOut) => {
  emit('mutasi-out-selected', item);
  emit('close');
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    options.value.page = 1;
    loadItems(options.value);
  }, 500);
});
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="1000px" persistent>
    <v-card class="d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Mutasi Out</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field v-model="search" label="Cari..." prepend-inner-icon="mdi-magnify" variant="outlined"
          density="compact" clearable class="mb-4 flex-shrink-0" hide-details autofocus></v-text-field>
        <v-data-table-server v-model:page="options.page" v-model:items-per-page="options.itemsPerPage"
          :headers="headers" :items="items" :items-length="totalItems" :loading="loading" @update:options="loadItems"
          hover class="desktop-table flex-grow-1" density="compact" fixed-header>
          <template #item="{ item }">
            <tr @click="selectMutasiOut(item)" style="cursor: pointer;">
              <td>{{ item.Nomor }}</td>
              <td>{{ format(parseISO(item.Tanggal), 'dd/MM/yyyy') }}</td>
              <td>{{ item.DariCabangNama }}</td>
              <td>{{ item.NoSO }}</td>
              <td>{{ item.Customer }}</td>
            </tr>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

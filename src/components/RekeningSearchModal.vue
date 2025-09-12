<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import api from '@/services/api';

interface Rekening {
  kode: string;
  nama: string;
  rekening: string;
}

const props = defineProps({
  cabang: { type: String, required: true }
});
const emit = defineEmits(['close', 'selected']);

const items = ref<Rekening[]>([]);
const loading = ref(true);
const search = ref('');

const headers = [
  { title: 'Kode Akun', key: 'kode', width: '150px' },
  { title: 'Nama Bank', key: 'nama' },
  { title: 'No. Rekening', key: 'rekening' },
];

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get('/so-form/lookup/rekening', {
      params: { term: search.value, cabang: props.cabang },
    });
    items.value = response.data;
  } catch (error) { console.error("Gagal memuat data rekening:", error); }
  finally { loading.value = false; }
};

const selectItem = (item: Rekening) => {
  emit('selected', item);
  emit('close');
};

watch(search, () => { setTimeout(loadItems, 500); });
onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="800px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 70vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title>Bantuan - Pilih Akun Bank</v-toolbar-title>
        <v-spacer/><v-btn icon="mdi-close" @click="$emit('close')"/>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field v-model="search" label="Cari..." variant="outlined" density="compact" clearable class="mb-4" hide-details autofocus/>
        <v-data-table :headers="headers" :items="items" :loading="loading" hover class="desktop-table flex-grow-1" density="compact" fixed-header :items-per-page="-1">
          <template #item="{ item }">
            <tr @click="selectItem(item)" style="cursor: pointer;">
              <td>{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
              <td>{{ item.rekening }}</td>
            </tr>
          </template>
          <template #bottom></template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

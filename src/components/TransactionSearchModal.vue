<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, parseISO } from 'date-fns';

interface Props {
  searchType: 'invoice' | 'deposit';
  cabang: string;
}
const props = defineProps<Props>();
const emit = defineEmits(['close', 'selected']);
const toast = useToast();

const items = ref<any[]>([]);
const loading = ref(true);
const search = ref('');

const headers = [
  { title: 'No. Transaksi', key: 'Nomor' },
  { title: 'Tanggal', key: 'Tanggal' },
  { title: 'Customer', key: 'Customer' },
  { title: 'Nominal', key: 'Nominal', align: 'end' },
  { title: 'Terbayar', key: 'Bayar', align: 'end' },
  { title: 'Sisa Saldo', key: 'Sisa', align: 'end' },
];

const loadItems = async () => {
  loading.value = true;
  try {
    const apiUrl = props.searchType === 'invoice'
      ? '/refund-form/lookup/invoice'
      : '/refund-form/lookup/deposit';
    const response = await api.get(apiUrl);
    items.value = response.data;
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal memuat data transaksi.');
  } finally {
    loading.value = false;
  }
};

const filteredItems = computed(() => {
  if (!search.value) return items.value;
  const lower = search.value.toLowerCase();
  return items.value.filter(item =>
    item.Nomor.toLowerCase().includes(lower) ||
    item.Customer.toLowerCase().includes(lower)
  );
});

const selectItem = (item: any) => {
  emit('selected', item);
  emit('close');
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="900px" persistent>
    <v-card class="d-flex flex-column" style="height: 70vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Transaksi ({{ props.searchType }})</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field v-model="search" label="Cari berdasarkan Nomor atau Customer..." prepend-inner-icon="mdi-magnify"
          variant="outlined" density="compact" clearable hide-details autofocus
          class="mb-4 flex-shrink-0"></v-text-field>
        <v-data-table :headers="headers" :items="filteredItems" :loading="loading" :search="search" hover
          density="compact" fixed-header class="desktop-table flex-grow-1">
          <template #item="{ item }">
            <tr @click="selectItem(item)" style="cursor: pointer;">
              <td>{{ item.Nomor }}</td>
              <td>{{ item.Tanggal }}</td>
              <td>{{ item.Customer }}</td>
              <td class="text-end">{{ (item.Nominal || 0).toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ (item.Bayar || 0).toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ (item.Sisa || 0).toLocaleString('id-ID') }}</td>
            </tr>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* (Style dari modal lain) */
.desktop-table :deep(td),
.desktop-table :deep(th) {
  font-size: 11px;
}
</style>

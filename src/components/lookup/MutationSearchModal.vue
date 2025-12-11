<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import api from '@/services/api';
import { format } from 'date-fns';

interface MutationItem {
  mso_tanggal: string;
  mso_nomor: string;
  mso_jenis: string;
  mso_ket: string;
  mso_dari: string;
}

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits(['close', 'selected']);

const isLoading = ref(false);
const items = ref<MutationItem[]>([]);
const search = ref('');
const dateRange = reactive({
  start: format(new Date(), 'yyyy-MM-01'),
  end: format(new Date(), 'yyyy-MM-dd')
});

const headers = [
  { title: 'Tanggal', key: 'mso_tanggal' },
  { title: 'No. Mutasi', key: 'mso_nomor' },
  { title: 'Marketplace', key: 'mso_jenis' },
  { title: 'Keterangan / Pesanan', key: 'mso_ket' },
  { title: 'Dari', key: 'mso_dari' },
  { title: 'Aksi', key: 'actions', align: 'end' },
] as const;

const fetchMutations = async () => {
  isLoading.value = true;
  try {
    const { data } = await api.get('/invoice-form/lookup/mutations', {
      params: {
        term: search.value,
        startDate: dateRange.start,
        endDate: dateRange.end
      }
    });
    items.value = data as MutationItem[];
  } catch (error) {
    console.error(error);
  } finally {
    isLoading.value = false;
  }
};

const selectItem = (item: MutationItem) => {
  emit('selected', item);
  emit('close');
};

watch(() => props.show, (val) => {
  if (val) fetchMutations();
});
</script>

<template>
  <v-dialog :model-value="show" max-width="800px" @update:model-value="emit('close')">
    <v-card>
      <v-card-title class="d-flex align-center bg-primary text-white">
        <span>Pilih Pesanan (Mutasi Masuk)</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="emit('close')"></v-btn>
      </v-card-title>

      <v-card-text class="pt-4">
        <v-row dense class="mb-2">
          <v-col cols="3">
            <v-text-field v-model="dateRange.start" type="date" density="compact" variant="outlined" label="Dari"
              hide-details />
          </v-col>
          <v-col cols="3">
            <v-text-field v-model="dateRange.end" type="date" density="compact" variant="outlined" label="Sampai"
              hide-details />
          </v-col>
          <v-col cols="4">
            <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" label="Cari No Pesanan / Mutasi"
              density="compact" variant="outlined" hide-details @keydown.enter="fetchMutations" />
          </v-col>
          <v-col cols="2">
            <v-btn color="primary" block @click="fetchMutations" :loading="isLoading">Cari</v-btn>
          </v-col>
        </v-row>

        <v-data-table :headers="headers" :items="items" :loading="isLoading" density="compact" class="border">
          <template #[`item.mso_tanggal`]="{ item }">
            {{ format(new Date(item.mso_tanggal), 'dd-MM-yyyy') }}
          </template>
          <template #[`item.mso_jenis`]="{ item }">
            <v-chip size="x-small" color="orange" label>{{ item.mso_jenis }}</v-chip>
          </template>
          <template #[`item.actions`]="{ item }">
            <v-btn size="small" color="success" variant="tonal" @click="selectItem(item)">Pilih</v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

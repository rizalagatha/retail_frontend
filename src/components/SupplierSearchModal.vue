<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';

interface Supplier {
  kode: string;
  nama: string;
}

const emit = defineEmits(['close', 'supplier-selected']);

const suppliers = ref<Supplier[]>([]);
const searchTerm = ref('');
const isLoading = ref(false);

const fetchAllSuppliers = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/suppliers');
    suppliers.value = response.data;
  } catch (error) {
    console.error("Gagal mengambil daftar supplier:", error);
  } finally {
    isLoading.value = false;
  }
};

const filteredSuppliers = computed(() => {
  if (!searchTerm.value) {
    return suppliers.value;
  }
  const lowerCaseSearch = searchTerm.value.toLowerCase();
  return suppliers.value.filter(supplier => 
    supplier.kode.toLowerCase().includes(lowerCaseSearch) ||
    supplier.nama.toLowerCase().includes(lowerCaseSearch)
  );
});

const selectSupplier = (supplier: Supplier) => {
  emit('supplier-selected', supplier);
};

onMounted(fetchAllSuppliers);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="700px">
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>Bantuan - Pilih Supplier</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="emit('close')"></v-btn>
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="searchTerm"
          label="Cari berdasarkan Kode atau Nama..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-4"
        ></v-text-field>
        <v-data-table
          :headers="[{ title: 'Kode', key: 'kode' }, { title: 'Nama', key: 'nama' }]"
          :items="filteredSuppliers"
          :loading="isLoading"
          density="compact"
          hover
          @click:row="(_, { item }) => selectSupplier(item)"
        >
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data supplier.</div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

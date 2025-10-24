<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';

const emit = defineEmits(['close', 'select']);

const items = ref<any[]>([]);
const searchTerm = ref('');
const isLoading = ref(false);

// Header berdasarkan query sqlbantuan TfrmBPBkaosan.FormKeyDown
const headers = [
  { title: 'No PO', key: 'nomor', width: '150px' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'No Referensi', key: 'referensi', width: '150px' },
  { title: 'Supplier', key: 'namaSupplier', minWidth: '200px' },
  { title: 'Keterangan', key: 'keterangan' },
];

const fetchPoList = async () => {
  isLoading.value = true;
  try {
    // Panggil endpoint yang sudah ada di poKaosanFormService
    const response = await api.get('/bpb-kaosan-form/po-referensi');
    items.value = response.data;
  } catch (error) {
    console.error("Gagal mengambil daftar PO:", error);
  } finally {
    isLoading.value = false;
  }
};

const filteredItems = computed(() => {
  if (!searchTerm.value) return items.value;
  const lower = searchTerm.value.toLowerCase();
  // Filter dari Delphi: 'Nomor,Referensi,Keterangan,Supplier'
  return items.value.filter(item =>
    item.nomor.toLowerCase().includes(lower) ||
    (item.referensi && item.referensi.toLowerCase().includes(lower)) ||
    (item.keterangan && item.keterangan.toLowerCase().includes(lower)) ||
    (item.namaSupplier && item.namaSupplier.toLowerCase().includes(lower))
  );
});

const selectItem = (item: any) => {
  emit('select', item);
};

onMounted(fetchPoList);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="900px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih PO (F1)</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field v-model="searchTerm" label="Cari berdasarkan No PO, Referensi, Keterangan, atau Supplier..."
          prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable class="mb-4 flex-shrink-0"
          hide-details></v-text-field>

        <v-data-table :headers="headers" :items="filteredItems" :loading="isLoading" hover
          class="desktop-table flex-grow-1" density="compact" fixed-header>
          <template #item="{ item }">
            <tr @click="selectItem(item)" style="cursor: pointer;">
              <td>{{ item.nomor }}</td>
              <td>{{ format(parseISO(item.tanggal), 'dd-MM-yyyy') }}</td>
              <td>{{ item.referensi }}</td>
              <td>{{ item.namaSupplier }}</td>
              <td>{{ item.keterangan }}</td>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data PO yang open.</div>
          </template>
        </v-data-table>
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

.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding: 0 8px !important;
  height: 28px !important;
}
</style>

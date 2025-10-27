<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format } from 'date-fns';

interface ReferensiItem {
  nomor: string;
  tanggal: string;
  namaSupplier: string;
  keterangan?: string;
}
interface Props {
  source: string;
}
const toast = useToast();

const props = defineProps<Props>();
const emit = defineEmits(['close', 'select']);

const items = ref<ReferensiItem[]>([]);
const searchTerm = ref('');
const isLoading = ref(false);

const headers = [
  { title: 'Nomor', key: 'nomor', width: '200px' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Supplier', key: 'namaSupplier', minWidth: '250px' },
  { title: 'Keterangan', key: 'keterangan' },
];

const formatTanggal = (tanggal: string) => {
  try {
    return format(new Date(tanggal), 'dd-MM-yyyy');
  } catch {
    return '-';
  }
};

const fetchReferensi = async () => {
  isLoading.value = true;
  try {
    let apiUrl = '';

    // Arahkan 'source' ke endpoint API yang benar
    if (props.source === 'pengajuan-produksi') {
      apiUrl = '/po-kaosan-form/referensi-pengajuan';
    } else {
      // Tambahkan sumber lain di sini jika ada
      toast.error(`Sumber referensi tidak dikenal: ${props.source}`);
      return;
    }

    const response = await api.get(apiUrl);
    items.value = response.data;
  } catch (error) {
    console.error("Gagal mengambil daftar referensi:", error);
  } finally {
    isLoading.value = false;
  }
};

const filteredItems = computed(() => {
  if (!searchTerm.value) return items.value;
  const lowerCaseSearch = searchTerm.value.toLowerCase();
  return items.value.filter(item =>
    item.nomor.toLowerCase().includes(lowerCaseSearch) ||
    item.namaSupplier.toLowerCase().includes(lowerCaseSearch) ||
    item.keterangan.toLowerCase().includes(lowerCaseSearch)
  );
});

const selectItem = (item: ReferensiItem) => {
  emit('select', item);
};

onMounted(fetchReferensi);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="900px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Referensi</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field v-model="searchTerm" label="Cari berdasarkan Nomor, Supplier, atau Keterangan..."
          prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable class="mb-4 flex-shrink-0"
          hide-details></v-text-field>

        <v-data-table :headers="headers" :items="filteredItems" :loading="isLoading" hover
          class="desktop-table flex-grow-1" density="compact" fixed-header>
          <template #item="{ item }">
            <tr @click="selectItem(item)" style="cursor: pointer;">
              <td>{{ item.nomor }}</td>
              <td>{{ formatTanggal(item.tanggal) }}</td>
              <td>{{ item.namaSupplier }}</td>
              <td>{{ item.keterangan }}</td>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data referensi.</div>
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

<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';

interface Gudang {
  kode: string;
  nama: string;
}

// --- Props & Emits ---
const props = defineProps({
  userCabang: {
    type: String,
    required: true,
  }
});
const emit = defineEmits(['close', 'gudang-selected']);

// --- State ---
const items = ref<Gudang[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
  { title: 'Kode', key: 'kode', sortable: false },
  { title: 'Nama Gudang', key: 'nama', sortable: false },
];

// --- Methods ---
const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await api.get('/warehouses', {
      params: {
        term: search.value,
        userCabang: props.userCabang,
        page: page,
        itemsPerPage: itemsPerPage,
      },
    });
    
    if (response.data && Array.isArray(response.data.items) && typeof response.data.total === 'number') {
        items.value = response.data.items;
        totalItems.value = response.data.total;
    } else {
        items.value = [];
        totalItems.value = 0;
    }
  } catch (error) {
    console.error("Gagal memuat data gudang:", error);
    items.value = [];
    totalItems.value = 0;
  } finally {
    loading.value = false;
  }
};

// Perbaikan: Fungsi untuk menangani pemilihan gudang
const selectGudang = (item: any) => {
    // Ekstrak data asli dari proxy Vue, pastikan mengambil kode dan nama
    const gudangData = {
        kode: item.kode,
        nama: item.nama
    };
    
    if (gudangData.kode) {
        console.log('Gudang selected:', gudangData); // Debug log
        emit('gudang-selected', gudangData);
    } else {
        console.warn('Data gudang tidak valid:', item);
    }
};

// --- Watchers ---
let searchTimeout: number;
watch(search, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        options.value.page = 1; // Reset ke halaman 1
        loadItems(options.value);
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
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Gudang</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode atau nama gudang..."
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
          <!-- Gunakan template slot untuk menampilkan data dan handle click -->
          <template #item="{ item }">
            <tr @click="selectGudang(item)" style="cursor: pointer;">
              <td>{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data gudang.</div>
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
<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import type { AxiosError } from 'axios';

const toast = useToast();

// Tipe Data
interface Product {
  uniqueId: string | number;
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  kategori: string;
  stok?: number;
}
interface LoadItemsOptions {
  page?: number;
  itemsPerPage?: number;
  sortBy?: string[]; // atau { key: string; order: 'asc' | 'desc' }[] kalau pakai Vuetify v-data-table
}
interface Props {
  source: string;
  gudang: string;
  multi?: boolean;
  filterKode?: string | null;
}

// Props & Emits
const props = defineProps<Props>();
const emit = defineEmits(['close', 'products-selected']);

// State
const items = ref<Product[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 10 });
const selected = ref<Product[]>([]);

// --- 1. Buat Headers Dinamis ---
const headers = computed(() => {
  if (props.source === 'qc-grid1-f1' || props.source === 'qc-grid2-f2' || props.source === 'mutasi-kirim') {
    // Tampilan F1 dari TfrmQC.cxGrdMasterEditKeyDown
    return [
      { title: 'Kode', key: 'kode', width: '150px' },
      { title: 'Barcode', key: 'barcode', width: '150px' },
      { title: 'Nama Barang', key: 'nama', minWidth: '300px' },
      { title: 'Ukuran', key: 'ukuran', width: '100px' },
      { title: 'Stok', key: 'stok', width: '100px' },
    ];
  }
  // Default (ambil-barang, po-barang, dll)
  return [
    { title: 'Kode', key: 'kode', width: '180px' },
    { title: 'Barcode', key: 'barcode', width: '150px' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran', width: '100px' },
    { title: 'Kategori', key: 'kategori', width: '120px' },
  ];
});

// Methods
const loadItems = async ({ page, itemsPerPage, sortBy }: LoadItemsOptions = {}) => {
  loading.value = true;
  try {
    let apiUrl = '';
    let params: Record<string, string | number | string[] | undefined> = {};
    let isClientSideFilter = false;

    // --- LOGIKA PEMILIHAN ENDPOINT ---
    if (props.source === 'qc-grid1-f1' || props.source === 'mutasi-kirim') {
      // Untuk QC Grid 1 dan Mutasi Kirim, ambil semua data dari endpoint masing-masing
      apiUrl = props.source === 'qc-grid1-f1'
        ? '/qc-ke-garmen-form/barang-lookup/all'
        : '/mutasi-kirim-form/lookup/products'; // <-- Endpoint baru
      isClientSideFilter = true;
    } else if (props.source === 'qc-grid2-f2') {
      apiUrl = '/qc-ke-garmen-form/barang-lookup/varian';
      params.kodeBarang = props.filterKode;
      console.log('🛰️ Call varian API dengan kodeBarang:', params.kodeBarang);
      isClientSideFilter = true;
    } else {
      // Logika paginasi server-side yang sudah ada
      if (props.source === 'minta-barang') apiUrl = '/minta-barang-form/lookup/products';
      else if (props.source === 'koreksi-stok') apiUrl = '/koreksi-stok-form/lookup/products';
      else if (props.source === 'pengajuan-barcode') apiUrl = '/pengajuan-barcode-form/lookup/products';
      else if (props.source === 'promo-applicable' || props.source === 'promo-bonus') apiUrl = '/promo-form/lookup/products';
      else if (props.source === 'ambil-barang') apiUrl = '/ambil-barang/lookup/products';

      if (!apiUrl) {
        toast.error('Sumber data modal tidak valid.');
        loading.value = false;
        return;
      }

      params = {
        term: search.value,
        gudang: props.gudang,
        page: page ?? options.value.page,
        itemsPerPage: itemsPerPage ?? options.value.itemsPerPage,
        sortBy: sortBy ?? [],
      };
    }

    const response = await api.get(apiUrl, { params });

    // --- 3. Perbarui Penanganan Respons ---
    if (isClientSideFilter) {
      items.value = response.data;
      totalItems.value = response.data.length;
    } else if (response.data && Array.isArray(response.data.items)) {
      items.value = response.data.items;
      totalItems.value = response.data.total;
    } else {
      items.value = [];
      totalItems.value = 0;
    }

  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    const message = error.response?.data?.message || 'Gagal memuat data produk.';
    toast.error(message);
  } finally {
    loading.value = false;
  }
};

const selectAndClose = (item: Product) => {
  // Untuk mode single-select (F1)
  emit('products-selected', [item]);
  emit('close');
};

const submitSelection = () => {
  // Untuk mode multi-select (F2)
  if (selected.value.length > 0) {
    emit('products-selected', selected.value);
    emit('close');
  } else {
    toast.warning('Pilih setidaknya satu produk.');
  }
};

const toggleSelection = (item: Product) => {
  const index = selected.value.findIndex(s => s.uniqueId === item.uniqueId);
  if (index > -1) {
    selected.value.splice(index, 1);
  } else {
    selected.value.push(item);
  }
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    options.value.page = 1;
    // Hanya panggil loadItems jika BUKAN qc-grid1-f1 (karena itu client-side filter)
    if (props.source !== 'qc-grid1-f1' && props.source !== 'mutasi-kirim' && props.source !== 'qc-grid2-f2') {
      loadItems(options.value);
    }
  }, 500);
});

watch(
  () => [props.source, props.filterKode],
  ([newSource, newKode]) => {
    console.log('🔁 Modal props berubah:', newSource, newKode);
    loadItems();
  },
  { immediate: true }
);

onMounted(() => {
  loadItems(options.value);
});
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="1200px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Produk
          <v-chip v-if="filterKode" size="small" color="white" class="ml-2">
            Varian dari: {{ filterKode }}
          </v-chip></v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field v-model="search" label="Cari berdasarkan kode, nama, atau barcode..." class="mb-4 flex-shrink-0"
          variant="outlined" density="comfortable" clearable hide-details></v-text-field>

        <v-data-table
          v-if="props.source === 'qc-grid1-f1' || props.source === 'mutasi-kirim' || props.source === 'qc-grid2-f2'"
          v-model="selected" :headers="headers" :items="items" :search="search" :loading="loading" :show-select="multi"
          return-object item-value="uniqueId" hover density="compact" fixed-header class="desktop-table flex-grow-1">
          <template #item="{ item }">
            <tr style="cursor: pointer;" @click="multi ? toggleSelection(item) : selectAndClose(item)">
              <td v-if="multi" @click.stop>
                <v-checkbox-btn :model-value="selected.some(s => s.uniqueId === item.uniqueId)"
                  @update:model-value="() => toggleSelection(item)" />
              </td>
              <td>{{ item.kode }}</td>
              <td>{{ item.barcode }}</td>
              <td>{{ item.nama }}</td>
              <td>{{ item.ukuran }}</td>
              <td class="text-end">{{ (item.stok || 0).toLocaleString('id-ID') }}</td>
            </tr>
          </template>
        </v-data-table>
        <v-data-table-server v-else v-model="selected" v-model:page="options.page"
          v-model:items-per-page="options.itemsPerPage" :headers="headers" :items="items" :items-length="totalItems"
          :loading="loading" :show-select="multi" return-object item-value="uniqueId" @update:options="loadItems" hover
          density="compact" fixed-header class="desktop-table flex-grow-1">
          <template #item="{ item }">
            <tr style="cursor: pointer;" @click="multi ? toggleSelection(item) : selectAndClose(item)">
              <td v-if="multi" @click.stop>
                <v-checkbox-btn :model-value="selected.some(s => s.uniqueId === item.uniqueId)"
                  @update:model-value="() => toggleSelection(item)" />
              </td>
              <td>{{ item.kode }}</td>
              <td>{{ item.barcode }}</td>
              <td>{{ item.nama }}</td>
              <td>{{ item.ukuran }}</td>
              <td>{{ item.kategori }}</td>
            </tr>
          </template>
        </v-data-table-server>
      </v-card-text>

      <div v-if="multi">
        <v-divider />
        <v-card-actions class="dialog-footer">
          <v-spacer />
          <v-btn size="small" @click="$emit('close')">Batal</v-btn>
          <v-btn size="small" color="primary" @click="submitSelection" :disabled="selected.length === 0">
            Pilih {{ selected.length > 0 ? `(${selected.length})` : '' }} Item
          </v-btn>
        </v-card-actions>
      </div>

    </v-card>
  </v-dialog>
</template>

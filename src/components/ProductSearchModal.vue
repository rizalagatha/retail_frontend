<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';

const toast = useToast();

// --- Tipe Data ---
interface ProductVariant {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  harga: number;
  stok: number;
}

// --- Props & Emits ---
const props = defineProps({
  category: { type: String, required: true },
  gudang: { type: String, required: true },
  multi: { type: Boolean, default: false }
});
// Emit 'products-selected' sekarang selalu mengirim array
const emit = defineEmits(['close', 'products-selected']);

// --- State ---
const items = ref<ProductVariant[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 10 });
const selected = ref<ProductVariant[]>([]);

const headers = [
  { title: 'Kode', key: 'kode', sortable: false },
  { title: 'Barcode', key: 'barcode', sortable: false },
  { title: 'Nama Barang', key: 'nama', sortable: false, width: '30%' },
  { title: 'Ukuran', key: 'ukuran', sortable: false },
  { title: 'Harga', key: 'harga', sortable: false, align: 'end' as const },
  { title: 'Stok', key: 'stok', sortable: false, align: 'end' as const },
];

// --- Methods ---
const loadItems = async (opts: { page: number, itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await api.get('/barcode-form/search-products', {
      params: {
        term: search.value,
        category: props.category,
        gudang: props.gudang,
        page: opts.page,
        itemsPerPage: opts.itemsPerPage,
      },
    });
    items.value = response.data.items || [];
    totalItems.value = response.data.total || 0;
  } catch (error) {
    console.error("Gagal memuat data produk:", error);
    items.value = [];
    totalItems.value = 0;
  }
  finally { loading.value = false; }
};

const selectAndClose = (item: ProductVariant | null) => {
  if (props.multi) {
    if (selected.value.length > 0) {
      emit('products-selected', selected.value);
      emit('close');
    } else {
      toast.warning('Pilih setidaknya satu produk.');
    }
  } else if (item) {
    emit('products-selected', [item]);
    emit('close');
  }
};

const toggleMulti = (item: ProductVariant) => {
  const idx = selected.value.findIndex(s => s.barcode === item.barcode);
  if (idx >= 0) {
    selected.value.splice(idx, 1); // unselect
  } else {
    selected.value.push(item); // select
  }
};

// --- Watchers ---
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
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="1200px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Produk</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field v-model="search" label="Cari berdasarkan kode, nama, atau barcode..."
          prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable class="mb-4 flex-shrink-0"
          hide-details></v-text-field>
        <v-data-table-server v-model="selected" :show-select="multi" return-object item-value="barcode"
          v-model:page="options.page" v-model:items-per-page="options.itemsPerPage" :headers="headers" :items="items"
          :items-length="totalItems" :loading="loading" @update:options="loadItems" hover
          class="desktop-table flex-grow-1" density="compact" fixed-header>
          <template #item="{ item }">
            <tr style="cursor: pointer;" @click="multi ? toggleMulti(item) : selectAndClose(item)">
              <td v-if="multi" @click.stop>
                <v-checkbox-btn :model-value="selected.some(s => s.barcode === item.barcode)"
                  @update:model-value="() => toggleMulti(item)" />
              </td>
              <td>{{ item.kode }}</td>
              <td>{{ item.barcode }}</td>
              <td>{{ item.nama }}</td>
              <td>{{ item.ukuran }}</td>
              <td class="text-end">{{ new Intl.NumberFormat('id-ID').format(item.harga) }}</td>
              <td class="text-end font-weight-bold">{{ item.stok }}</td>
            </tr>
          </template>
        </v-data-table-server>
      </v-card-text>

      <div v-if="multi">
        <v-divider />
        <v-card-actions class="dialog-footer">
          <v-spacer />
          <v-btn size="small" @click="$emit('close')">Batal</v-btn>
          <v-btn size="small" color="primary" @click="selectAndClose(null)" :disabled="selected.length === 0">
            Pilih {{ selected.length > 0 ? `(${selected.length})` : '' }} Item
          </v-btn>
        </v-card-actions>
      </div>
    </v-card>
  </v-dialog>
</template>
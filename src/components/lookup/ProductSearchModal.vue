<script setup lang="ts">
import { ref, watch } from 'vue';
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
  kategori?: string;
}

type ProductItem = {
  barcode: string | number;
  ukuran?: string | null;
};


// --- Props & Emits ---
const props = defineProps({
  category: { type: String, required: true },
  gudang: { type: String, required: true },
  multi: { type: Boolean, default: false },
  source: { type: String, default: 'default' },
  promoNomor: { type: String, default: '' }
});
// Emit 'products-selected' sekarang selalu mengirim array
const emit = defineEmits(['close', 'products-selected']);

// --- State ---
const items = ref<ProductVariant[]>([]);
const totalItems = ref(0);
const loading = ref(false);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 25 });
const selected = ref<ProductVariant[]>([]);
const requestId = ref(0);

const headers = [
  { title: 'Kode', key: 'kode', sortable: false, width: '120px' },
  { title: 'Barcode', key: 'barcode', sortable: false, width: '120px' },
  { title: 'Nama Barang', key: 'nama', sortable: false },
  { title: 'Kategori', key: 'kategori', sortable: false, width: '100px' }, // [BARU] Kolom Kategori
  { title: 'Ukuran', key: 'ukuran', sortable: false, width: '80px' },
  { title: 'Harga', key: 'harga', sortable: false, align: 'end' as const, width: '100px' },
  { title: 'Stok', key: 'stok', sortable: false, align: 'end' as const, width: '80px' },
];

// --- Methods ---
const loadItems = async (opts: { page: number, itemsPerPage: number }) => {
  const currentRequestId = ++requestId.value;
  loading.value = true;
  try {
    // Tentukan endpoint berdasarkan source
    let apiUrl = '/barcode-form/search-products'; // Endpoint default

    if (props.source === 'peminjaman') {
      apiUrl = '/peminjaman-barang-form/lookup/products';
    } else if (props.source === 'invoice-cash') {
      apiUrl = '/invoice-form/lookup/products';
    } else if (props.source === 'mutasi-kirim') {
      apiUrl = '/mutasi-kirim/lookup/products';
    } else if (props.source === 'minta-barang') {
      apiUrl = '/minta-barang-form/lookup/products';
    } else if (props.source === 'surat-pesanan') {
      apiUrl = '/invoice-form/lookup/products';
    } else if (props.source === 'penawaran') {
      apiUrl = '/invoice-form/lookup/products';
    } else if (props.source === 'surat-jalan') {
      apiUrl = '/invoice-form/lookup/products';
    }

    const response = await api.get(apiUrl, {
      params: {
        term: search.value.trim(),
        category: props.category,
        gudang: props.gudang,
        page: opts.page,
        itemsPerPage: opts.itemsPerPage,
        source: props.source,
        promoNomor: props.promoNomor,
      },
    });
    if (currentRequestId === requestId.value) {
      const list = (response.data.items || []).slice();

      // --- SORTING ---
      items.value = list.sort((a: ProductItem, b: ProductItem): number => {
        // 1) sort barcode numeric jika bisa
        const ab = Number(a.barcode);
        const bb = Number(b.barcode);

        if (!isNaN(ab) && !isNaN(bb)) {
          if (ab !== bb) return ab - bb;
        } else {
          // fallback string compare
          const cmp = String(a.barcode).localeCompare(String(b.barcode));
          if (cmp !== 0) return cmp;
        }

        // 2) jika barcode sama → urut ukuran bisnis
        const order = [
          'XS', 'S', 'M', 'L', 'XL',
          '2XL', 'XXL', '3XL', '4XL', '5XL',
          'OVERSIZE', 'ALL SIZE'
        ];

        const aa = String(a.ukuran ?? '').toUpperCase();
        const bb2 = String(b.ukuran ?? '').toUpperCase();

        const ia = order.indexOf(aa);
        const ib = order.indexOf(bb2);

        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;

        // 3) fallback alfabet
        return aa.localeCompare(bb2);
      });

      totalItems.value = response.data.total || 0;
    }
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
      // Deep copy untuk memutus referensi
      const selection = JSON.parse(JSON.stringify(selected.value));
      emit('products-selected', selection);
      emit('close');
    } else {
      toast.warning('Pilih setidaknya satu produk.');
    }
  } else if (item) {
    emit('products-selected', [item]); // Kirim array
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

const handleEnterKey = async () => {
  if (props.multi || !search.value.trim()) return;

  // Hentikan debounce timer agar tidak double request
  clearTimeout(searchTimeout);

  // Reset page ke 1 saat enter ditekan
  options.value.page = 1;

  await loadItems(options.value);

  // Auto-select logic
  const exactMatch = items.value.find(item =>
    item.barcode === search.value || item.kode === search.value
  );

  if (exactMatch) {
    selectAndClose(exactMatch);
  } else if (items.value.length === 1) {
    // Optional: Jika cuma ada 1 hasil, langsung pilih? (Bisa bahaya, opsional)
    // selectAndClose(items.value[0]);
  } else if (items.value.length === 0) {
    toast.warning(`Produk "${search.value}" tidak ditemukan.`);
  }
};

const getCategoryColor = (kategori: string | undefined) => {
  const k = (kategori || '').toUpperCase();
  switch (k) {
    case 'SESIONAL':
      return 'orange-darken-2'; // Warna Oranye untuk Sesional (Peringatan Promo)
    case 'PESANAN':
      return 'blue-darken-2';   // Warna Biru untuk Barang Pesanan
    case 'REGULER':
      return 'green-darken-2';  // Warna Hijau untuk Reguler (Aman)
    default:
      return 'grey-lighten-1';  // Default Abu-abu
  }
};

// --- Watchers ---
let searchTimeout: ReturnType<typeof setTimeout>;
// --- Debounce search ---
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    // Jika halaman bukan 1, ubah ke 1 (ini akan otomatis trigger loadItems via @update:options)
    if (options.value.page !== 1) {
      options.value.page = 1;
    } else {
      // Jika halaman sudah 1, table tidak mendeteksi perubahan, jadi load manual
      loadItems(options.value);
    }
  }, 400);
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
        <form @submit.prevent="handleEnterKey" class="mb-4 flex-shrink-0">
          <v-text-field v-model="search" label="Cari berdasarkan kode, nama, atau barcode..."
            prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable hide-details
            autofocus></v-text-field>
        </form>
        <v-data-table-server v-model="selected" :show-select="multi" return-object item-value="barcode"
          v-model:page="options.page" v-model:items-per-page="options.itemsPerPage" :headers="headers" :items="items"
          :items-length="totalItems" :loading="loading" @update:options="loadItems" hover
          class="desktop-table flex-grow-1" density="compact" fixed-header>
          <template #[`item.kategori`]="{ item }">
            <v-chip size="x-small" :color="getCategoryColor(item.kategori)" variant="flat"
              class="font-weight-bold text-white">
              {{ item.kategori || 'TANPA KATEGORI' }}
            </v-chip>
          </template>
          <template #[`item.harga`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.harga) }}
          </template>

          <template #[`item.stok`]="{ item }">
            <span :class="item.stok <= 0 ? 'text-red' : 'text-green'">{{ item.stok }}</span>
          </template>
          <template #item="{ item }">
            <tr style="cursor: pointer;" @click="multi ? toggleMulti(item) : selectAndClose(item)">
              <td v-if="multi" @click.stop>
                <v-checkbox-btn :model-value="selected.some(s => s.barcode === item.barcode)"
                  @update:model-value="() => toggleMulti(item)" />
              </td>
              <td>{{ item.kode }}</td>
              <td>{{ item.barcode }}</td>
              <td>{{ item.nama }}</td>
              <td>
                <v-chip size="x-small" :color="getCategoryColor(item.kategori)" variant="flat"
                  class="font-weight-bold text-white">
                  {{ item.kategori || 'TANPA KATEGORI' }}
                </v-chip>
              </td>
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

<style scoped>
.dialog-card {
  display: flex;
  flex-direction: column;
}

/* Memastikan tabel mengisi sisa ruang */
:deep(.v-table__wrapper) {
  height: 100%;
}
</style>

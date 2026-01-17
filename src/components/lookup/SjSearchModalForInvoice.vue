<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, parseISO } from 'date-fns';

interface Sj {
  NoSJ: string;
  TglSJ: string;
  NoPermintaan: string;
  NoTerimaSJ: string;
  NoSO: string;
  KdCus: string;
  Customer: string;
  Alamat: string;
  Kota: string;
}

const props = defineProps({
  cabang: { type: String, required: true }
});

const emit = defineEmits(['close', 'sj-selected']);
const toast = useToast();

const items = ref<Sj[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');

// Definisi Header sesuai request & referensi Delphi
const headers = [
  { title: 'No. SJ', key: 'NoSJ' },
  { title: 'Tanggal', key: 'TglSJ' },
  { title: 'No. Terima SJ', key: 'NoTerimaSJ' },
  { title: 'No. SO', key: 'NoSO' },
  { title: 'Kd. Cus', key: 'KdCus' },
  { title: 'Customer', key: 'Customer' },
  { title: 'Alamat', key: 'Alamat' },
  { title: 'Kota', key: 'Kota' },
];

const options = ref({ page: 1, itemsPerPage: 15, sortBy: [] });

const itemsPerPageOptions = [
  { value: 15, title: '15' },
  { value: 30, title: '30' },
  { value: 50, title: '50' },
  { value: -1, title: 'Semua' }, // Nilai -1 digunakan untuk "All"
];

const loadItems = async (optionsEvent?: any) => {
  loading.value = true;

  // Gunakan nilai dari event table, jika tidak ada gunakan state internal
  const { page, itemsPerPage } = optionsEvent || options.value;

  try {
    const response = await api.get('/invoice-form/lookup/sj-list', {
      params: {
        cabang: props.cabang,
        term: search.value,
        page: page,
        itemsPerPage: itemsPerPage, // Kirim -1 jika user pilih "Semua"
      },
    });

    // Pastikan menerima format { items, total } dari backend baru
    if (response.data && response.data.items) {
      items.value = response.data.items;
      totalItems.value = response.data.total;
    } else {
      // Fallback jika backend belum diupdate
      items.value = Array.isArray(response.data) ? response.data : [];
      totalItems.value = items.value.length;
    }
  } catch (error) {
    toast.error("Gagal memuat data Surat Jalan.", error);
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: Sj) => {
  emit('sj-selected', item);
  emit('close');
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    // Cukup reset ke page 1, v-data-table-server akan otomatis trigger loadItems
    // karena options.page berubah secara reaktif
    options.value.page = 1;
    loadItems();
  }, 500);
});

onMounted(() => {
  loadItems(options.value);
});
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1200px" persistent>
    <v-card class="d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Surat Jalan (KPR)</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field v-model="search" label="Cari berdasarkan nomor SJ, SO, atau nama customer..."
          prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable class="mb-4 flex-shrink-0"
          hide-details autofocus></v-text-field>

        <v-data-table-server v-model:page="options.page" v-model:items-per-page="options.itemsPerPage"
          :items-per-page-options="itemsPerPageOptions" :headers="headers" :items="items" :items-length="totalItems"
          :loading="loading" @update:options="loadItems" hover class="desktop-table flex-grow-1" density="compact"
          fixed-header>
          <template #item="{ item }">
            <tr @click="selectItem(item)" style="cursor: pointer;">
              <td class="font-weight-bold">{{ item.NoSJ }}</td>
              <td>{{ item.TglSJ ? format(parseISO(item.TglSJ), 'dd/MM/yyyy') : '-' }}</td>
              <td>
                <v-chip size="x-small" :color="item.NoTerimaSJ ? 'success' : 'error'" variant="flat">
                  {{ item.NoTerimaSJ || 'BELUM TERIMA' }}
                </v-chip>
              </td>
              <td>{{ item.NoSO || '-' }}</td>
              <td>{{ item.KdCus }}</td>
              <td>{{ item.Customer }}</td>
              <td class="text-truncate" style="max-width: 200px;">{{ item.Alamat }}</td>
              <td>{{ item.Kota }}</td>
            </tr>
          </template>

          <template #loading>
            <v-skeleton-loader type="table-row@5"></v-skeleton-loader>
          </template>
        </v-data-table-server>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-2">
        <v-spacer />
        <v-btn variant="text" @click="$emit('close')">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.desktop-table :deep(table) {
  width: 100%;
}

:deep(.v-data-table-footer) {
  padding-top: 8px;
}

.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

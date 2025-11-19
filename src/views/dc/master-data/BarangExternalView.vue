<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Tipe Data & State ---
interface Header {
  kode: string;
  nama: string;
  KtgProduk?: string;
  KtgBarang?: string;
  date_create?: string; // yyyy-MM-dd
  otomatis?: string;
  adaStok: 'Y' | 'N';
  status: 'AKTIF' | 'PASIF';
}
interface DetailItem {
  kode: string;
  ukuran: string;
  barcode: string;
  harga: number;
  hpp?: number; // optional karena hanya ada untuk cabang KDC
}
interface TableHeader {
  title: string;
  key: keyof DetailItem; // gunakan key dari DetailItem
  width?: string;
  align?: 'start' | 'center' | 'end';
}
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '219';

const masterData = ref<Header[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<Header[]>([]);
const expanded = ref<string[]>([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<Header | null>(() => isSingleSelected.value ? selected.value[0] : null);
const canEdit = computed(() => isSingleSelected.value);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Kode', key: 'kode', width: '180px', fixed: true },
  { title: 'Nama Barang', key: 'nama', minWidth: '300px', fixed: true },
  { title: 'KtgProduk', key: 'KtgProduk', width: '120px' },
  { title: 'KtgBarang', key: 'KtgBarang', width: '120px' },
  { title: 'Tgl Buat', key: 'date_create' },
  { title: 'Otomatis', key: 'otomatis' },
  { title: 'Log Stok', key: 'adaStok' },
  { title: 'Status', key: 'status' },
];

const detailHeaders = computed<TableHeader[]>(() => {
  const baseHeaders: TableHeader[] = [
    { title: 'Kode', key: 'kode', width: '180px' },
    { title: 'Ukuran', key: 'ukuran', width: '100px' },
    { title: 'Barcode', key: 'barcode', width: '150px' },
    { title: 'Harga', key: 'harga' },
  ];
  // Tambahkan HPP jika user KDC
  if (authStore.user?.cabang === 'KDC') {
    baseHeaders.push({ title: 'HPP', key: 'hpp' });
  }
  return baseHeaders;
});

// --- Methods ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/barang-external', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: Header[]) => {
  if (!newlyExpandedItems) return;
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.kode] && !loadingDetails.value.has(item.kode));
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.kode;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/barang-external/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}.`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const handleNew = () => router.push({ name: 'BarangExternalCreate' });
const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: 'BarangExternalEdit', params: { kode: selectedRow.value!.kode } });
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header Barang External");
    XLSX.writeFile(workbook, "Export_BarangExternal_Header.xlsx");
  } else if (type === 'detail') {
    loading.value = true;
    try {
      const response = await api.get('/barang-external/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Barang External");
      XLSX.writeFile(workbook, "Export_BarangExternal_Detail.xlsx");
    } catch (error) {
      const axiosError = error as AxiosError<{ message: string }>;
      toast.error(axiosError.response?.data?.message || 'Gagal mengekspor data detail.');
    } finally {
      loading.value = false;
    }
  }
};

// Logika pewarnaan dari Delphi
const getRowTextColor = (item: Header) => {
  if (item.status === 'PASIF') return 'text-red';
  if (item.adaStok === 'N') return 'text-blue';
  return '';
};

onMounted(() => {
  if (!authStore.can(MENU_ID, 'view')) {
    toast.error('Anda tidak memiliki hak akses untuk membuka halaman ini.');
    return router.push('/');
  }
  fetchData();
});
watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Master Barang External" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">
        Baru
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!canEdit"
        @click="handleEdit">
        Ubah
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="teal" prepend-icon="mdi-file-excel"
            v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"><v-list-item-title>Export Header</v-list-item-title></v-list-item>
          <v-list-item @click="exportData('detail')"><v-list-item-title>Export Detail</v-list-item-title></v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Tanggal Buat:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Pasif
          <v-icon color="blue" icon="mdi-square-rounded" size="small" class="ms-2"></v-icon> Tidak Ada Stok
        </div>
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="kode" density="compact" class="desktop-table header-browse-blue" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails" :item-class="getRowTextColor">

          <template #[`item.date_create`]="{ item }">
            {{ item.date_create ? format(parseISO(item.date_create), 'dd-MM-yyyy') : '' }}
          </template>

          <template #[`item.status`]="{ item }">
            <v-chip size="x-small" :color="item.status === 'AKTIF' ? 'success' : 'error'" variant="tonal">
              {{ item.status }}
            </v-chip>
          </template>


          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-4">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.kode)" class="text-center">Memuat detail...</div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.kode]" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template v-for="col in ['harga', 'hpp']" #[`item.${col}`]="{ item }" :key="col">
              <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
          </template>
          <template #bottom></template>
          </v-data-table>
      </div>
    </div>
    </td>
    </tr>
</template>
</AppDataTable>
</div>
</div>
</PageLayout>
</template>

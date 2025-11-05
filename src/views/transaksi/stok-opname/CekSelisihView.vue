<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Interface ---
interface SelisihItem {
  Kode: string;
  Barcode: string;
  Nama: string;
  Ukuran: string;
  Stok: number;
  Hitung: number;
  Selisih: number;
  Lokasi: string;
  Invoice: number;
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '22';

const items = ref<SelisihItem[]>([]);
const isLoading = ref(true);
const cabangOptions = ref<{ kode: string; nama: string }[]>([]);

const filters = reactive({
  // Tanggal tidak digunakan di query, hanya untuk tampilan
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
});

const headers = [
  { title: 'Kode', key: 'Kode', width: '150px', fixed: true },
  { title: 'Barcode', key: 'Barcode', width: '150px' },
  { title: 'Nama Barang', key: 'Nama', minWidth: '300px', fixed: true },
  { title: 'Ukuran', key: 'Ukuran', width: '100px' },
  { title: 'Stok Sistem', key: 'Stok', align: 'end', width: '120px' },
  { title: 'Stok Fisik', key: 'Hitung', align: 'end', width: '120px' },
  { title: 'Selisih', key: 'Selisih', align: 'end', width: '120px' },
  { title: 'Lokasi (Qty)', key: 'Lokasi', minWidth: '250px' },
  { title: 'Inv Stlh SO', key: 'Invoice', align: 'end', width: '120px' },
] as const;

const totalSummary = computed(() => {
  return {
    Stok: items.value.reduce((sum, item) => sum + (Number(item.Stok) || 0), 0),
    Hitung: items.value.reduce((sum, item) => sum + (Number(item.Hitung) || 0), 0),
    Selisih: items.value.reduce((sum, item) => sum + (Number(item.Selisih) || 0), 0),
  };
});

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/cek-selisih', { params: filters });
    items.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/cek-selisih/cabang-options');
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat pilihan cabang.', error);
  }
};

const exportToExcel = () => {
  if (items.value.length === 0) {
    return toast.warning('Tidak ada data untuk diekspor.');
  }
  const worksheet = XLSX.utils.json_to_sheet(items.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Cek Selisih Stok Opname");
  XLSX.writeFile(workbook, `CekSelisihSO_${filters.cabang}.xlsx`);
  toast.success('Data berhasil diekspor.');
};

const getRowClass = (item: SelisihItem) => {
  return item.Selisih !== 0 ? 'bg-red-lighten-5' : '';
};

onMounted(() => {
  fetchCabangOptions();
  fetchData();
});

watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Cek Selisih Stok Opname" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="teal" @click="exportToExcel" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-select v-model="filters.cabang" :items="cabangOptions" item-title="nama" item-value="kode" label="Cabang"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;"
          :readonly="authStore.user?.cabang !== 'KDC'" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-container">
        <AppDataTable :headers="headers" :items="items" :loading="isLoading" class="desktop-table" density="compact"
          fixed-header :items-per-page="-1" :item-class="getRowClass">
          <template #[`body.append`]>
            <tr class="bg-grey-lighten-4 font-weight-bold">
              <td :colspan="4" class="text-end">TOTAL :</td>
              <td class="text-end">{{ totalSummary.Stok.toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ totalSummary.Hitung.toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ totalSummary.Selisih.toLocaleString('id-ID') }}</td>
              <td colspan="2"></td>
            </tr>
          </template>


          <template #bottom></template>
        </AppDataTable>
      </div>
    </div>
  </PageLayout>
</template>

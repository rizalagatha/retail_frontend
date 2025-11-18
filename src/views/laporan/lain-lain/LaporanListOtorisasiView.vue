<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import api from '@/services/api';
import { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';
import { formatRupiah } from "@/utils/formatRupiah";

interface OtorisasiItem {
  nomor: string;
  transaksi: string;
  jenis: string;
  nominal: number;
  otoritator: string;
  tanggal: string;
  barcode: string;
  uniqueId: string;
}

const toast = useToast();
const isLoading = ref(false);
const masterData = ref<OtorisasiItem[]>([]);

// Filter tanggal
const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
});

// Filter teks
const selectedFilterField = ref('nomor');
const filterSearchValue = ref('');

// Pilihan filter kolom
const filterOptions = [
  { title: 'Nomor', value: 'nomor' },
  { title: 'Transaksi', value: 'transaksi' },
  { title: 'Jenis', value: 'jenis' },
  { title: 'Nominal', value: 'nominal' },
  { title: 'Otoritator', value: 'otoritator' },
  { title: 'Tanggal', value: 'tanggal' },
  { title: 'Barcode', value: 'barcode' },
];

// Header tabel
const headers = [
  { title: 'Nomor Otorisasi', key: 'nomor', fixed: true, width: '150px' },
  { title: 'Transaksi', key: 'transaksi', width: '180px' },
  { title: 'Jenis', key: 'jenis', width: '120px' },
  { title: 'Nominal', key: 'nominal', width: '120px' },
  { title: 'Otoritator', key: 'otoritator', width: '150px' },
  { title: 'Tanggal/Waktu', key: 'tanggal', width: '200px' },
  { title: 'Barcode', key: 'barcode', width: '150px' },
];

// Ambil data dari backend
const fetchMasterData = async () => {
  isLoading.value = true;
  masterData.value = [];
  try {
    const response = await api.get('/laporan-list-otorisasi/list-otorisasi', {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate
      },
    });

    const rows = (response.data?.data ?? response.data ?? []) as Record<string, unknown>[];

    masterData.value = rows.map((item, idx) => ({
      nomor: String(item.Nomor ?? item.nomor ?? ''),
      transaksi: String(item.Transaksi ?? item.transaksi ?? ''),
      jenis: String(item.Jenis ?? item.jenis ?? ''),
      nominal: Number(item.Nominal ?? item.nominal ?? 0),
      otoritator: String(item.Otoritator ?? item.otoritator ?? ''),
      tanggal: String(item.Tanggal ?? item.tanggal ?? ''),
      barcode: String(item.Barcode ?? item.barcode ?? ''),
      uniqueId: `${item.Nomor ?? item.nomor ?? ''}-${idx}`,
    }));
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat daftar otorisasi.');
  } finally {
    isLoading.value = false;
  }
};

// Computed filtering
const filteredData = computed(() => {
  const keyword = filterSearchValue.value.trim().toLowerCase();
  const field = selectedFilterField.value;

  if (!keyword) return masterData.value;

  return masterData.value.filter((item) => {
    const val = item[field as keyof OtorisasiItem];
    return val?.toString().toLowerCase().includes(keyword);
  });
});

// Lifecycle
onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });

</script>

<template>
  <PageLayout title="Daftar Otorisasi" icon="mdi-shield-check-outline">
    <template #header-actions>
      <v-btn size="small" prepend-icon="mdi-file-export" color="blue-grey" disabled>
        Export
      </v-btn>
    </template>

    <div class="browse-content">

      <!-- FILTER SECTION (standar theme) -->
      <div class="filter-section">
        <v-label class="filter-label font-weight-bold">Periode Transaksi:</v-label>

        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 160px;" class="ms-4" />

        <v-label class="mx-2">s/d</v-label>

        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 160px;" />

        <v-divider vertical class="mx-4"></v-divider>

        <!-- Filter text -->
        <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan" density="compact"
          hide-details variant="outlined" style="max-width: 200px;" />

        <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details variant="outlined"
          style="min-width: 250px;" clearable prepend-inner-icon="mdi-magnify" />

        <v-spacer></v-spacer>

        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="tonal" size="small" :loading="isLoading"
          color="primary" />
      </div>

      <!-- TABEL (menggunakan fill-height-table standar theme) -->
      <div class="fill-height-table mt-2">
        <AppDataTable :headers="headers" :items="filteredData" :loading="isLoading" class="desktop-table elevation-1"
          density="compact" fixed-header :items-per-page="20" item-value="uniqueId">

          <!-- Formatting kolom nominal -->
          <template #[`item.nominal`]="{ item }">
            {{ formatRupiah(item.nominal) }}
          </template>

          <!-- No Data -->
          <template #no-data>
            <div class="text-center py-4 text-grey">
              Tidak ada data otorisasi dalam periode ini.
            </div>
          </template>

          <!-- Loading Skeleton -->
          <template #loading>
            <v-skeleton-loader type="table-row@10"></v-skeleton-loader>
          </template>
        </AppDataTable>
      </div>

    </div>
  </PageLayout>
</template>

<style scoped>
/* Tidak perlu CSS tambahan — semuanya mengikuti desktop-theme.css */
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Interface ---
interface StokMinusItem {
  kode: string;
  barcode: string;
  kategori: string;
  nama: string;
  ukuran: string;
  stok: number;
}
interface Cabang {
  kode: string;
  nama: string;
}

// --- State ---
const authStore = useAuthStore();
const toast = useToast();
const isLoading = ref(true);
const items = ref<StokMinusItem[]>([]);
const cabangList = ref<Cabang[]>([]);

const filters = reactive({
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'KDC' : authStore.user?.cabang || '',
});

const grandTotalStok = computed(() => {
  return items.value.reduce((sum, item) => sum + (item.stok || 0), 0);
});

const tableHeaders = [
  { title: 'Cabang', key: 'cabang_nama', width: '120px' },
  { title: 'Kode', key: 'kode', width: '120px' },
  { title: 'Barcode', key: 'barcode', width: '120px' },
  { title: 'Kategori', key: 'kategori', width: '100px' },
  { title: 'Nama Barang', key: 'nama', minWidth: '300px' },
  { title: 'Ukuran', key: 'ukuran', width: '80px' },
  { title: 'Stok', key: 'stok', align: 'end', width: '100px' },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/laporan-stok-minus/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.', error);
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/laporan-stok-minus', {
      params: filters,
    });
    items.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data laporan.', error);
  } finally {
    isLoading.value = false;
  }
};

const exportData = () => {
  if (items.value.length === 0) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }

  // (Opsional) Ubah nama kolom agar lebih rapi di Excel
  const dataToExport = items.value.map(item => ({
    "Kode Barang": item.kode,
    "Barcode": item.barcode,
    "Kategori": item.kategori,
    "Nama Barang": item.nama,
    "Ukuran": item.ukuran,
    "Stok Minus": item.stok,
  }));

  try {
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stok Minus");

    // Buat nama file yang dinamis
    const fileName = `Laporan_Stok_Minus_${filters.cabang}_${filters.tanggal}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    toast.success("Data berhasil diekspor.");

  } catch (error) {
    toast.error("Gagal mengekspor data.");
    console.error("Export error:", error);
  }
};

// --- Lifecycle & Watchers ---
onMounted(() => {
  fetchCabangList();
  fetchData();
});

watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Stok Minus" icon="mdi-alert-octagon-outline">

    <template #header-actions>
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportData"
        :disabled="isLoading || items.length === 0">
        Export
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Gudang:</v-label>
        <v-select v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" style="max-width: 250px;" />
        <v-label class="filter-label ml-4">Stok s/d Tanggal:</v-label>
        <v-text-field v-model="filters.tanggal" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading"></v-btn>
      </div>

      <div class="table-wrapper">
        <AppDataTable :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
          class="desktop-table header-browse-blue" :items-per-page="-1" :height="'auto'">
          <template #[`item.stok`]="{ item }">
            <span class="text-red font-weight-bold">
              {{ item.stok }}
            </span>
          </template>

          <template #[`body.append`]>
            <tr class="total-row">
              <!-- Semua kolom sebelum stok -->
              <td :colspan="tableHeaders.length - 1" class="text-end font-weight-bold">
                TOTAL
              </td>

              <!-- Kolom stok -->
              <td class="text-end total-cell">
                <span class="text-red font-weight-black">
                  {{ new Intl.NumberFormat('id-ID').format(grandTotalStok) }}
                </span>
              </td>
            </tr>
          </template>

          <template #bottom></template>
        </AppDataTable>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 120px);
}

.filter-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  flex-shrink: 0;

  background-color: rgb(var(--v-theme-surface));
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section:deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-label {
  font-size: 0.875rem;
  font-weight: 500;
}

.table-wrapper {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.table-wrapper :deep(.v-table__wrapper) {
  overflow-y: auto !important;
  max-height: calc(100vh - 260px) !important;
}

.total-row {
  position: sticky;
  bottom: 0;
  z-index: 5;
}

.total-row td {
  background-color: rgb(var(--v-theme-surface));
  border-top: 2px solid rgba(var(--v-theme-on-surface), 0.2);
}

.total-cell {
  text-align: right;
  padding-right: 16px;
}

.total-cell .text-red {
  color: rgb(var(--v-theme-error)) !important;
}
</style>

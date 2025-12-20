<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Inisialisasi & State ---
interface StokStagnanItem {
  Cabang: string;
  StokAwal?: number;
  RpAwal?: number;
  QtyInv?: number;
  RpInvoice?: number;
  StokAkhir?: number;
  RpAkhir?: number;
}
interface TotalSummary {
  StokAwal: number;
  RpAwal: number;
  QtyInv: number;
  RpInvoice: number;
  StokAkhir: number;
  RpAkhir: number;
}
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '508';

const items = ref<StokStagnanItem[]>([]);
const isLoading = ref(true);

const currentYear = new Date().getFullYear();
const filters = reactive({
  tahun: currentYear,
  bulan: new Date().getMonth() + 1,
});

const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);
const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, title: format(new Date(0, i), 'MMMM') }));

// --- Headers dengan Grup ---
// const headers = [
//   { title: 'Cabang', key: 'Cabang', rowspan: 2, fixed: true, minWidth: '200px' },
//   { title: 'Stok Awal', colspan: 2, align: 'center' },
//   { title: 'Terjual', colspan: 2, align: 'center' },
//   { title: 'Stok Akhir', colspan: 2, align: 'center' },
// ];
// const subHeaders = [
//   { title: 'Qty', key: 'StokAwal', align: 'end' },
//   { title: 'Value', key: 'RpAwal', align: 'end' },
//   { title: 'Qty', key: 'QtyInv', align: 'end' },
//   { title: 'Value', key: 'RpInvoice', align: 'end' },
//   { title: 'Qty', key: 'StokAkhir', align: 'end' },
//   { title: 'Value', key: 'RpAkhir', align: 'end' },
// ];

// --- Kalkulasi Total ---
const totalSummary = computed<TotalSummary>(() => {
  if (!items.value || items.value.length === 0) return {
    StokAwal: 0,
    RpAwal: 0,
    QtyInv: 0,
    RpInvoice: 0,
    StokAkhir: 0,
    RpAkhir: 0,
  };
  return {
    StokAwal: items.value.reduce((sum, item) => sum + (Number(item.StokAwal) || 0), 0),
    RpAwal: items.value.reduce((sum, item) => sum + (Number(item.RpAwal) || 0), 0),
    QtyInv: items.value.reduce((sum, item) => sum + (Number(item.QtyInv) || 0), 0),
    RpInvoice: items.value.reduce((sum, item) => sum + (Number(item.RpInvoice) || 0), 0),
    StokAkhir: items.value.reduce((sum, item) => sum + (Number(item.StokAkhir) || 0), 0),
    RpAkhir: items.value.reduce((sum, item) => sum + (Number(item.RpAkhir) || 0), 0),
  };
});
const canView = computed(() => authStore.can(MENU_ID, 'view'));
// Asumsi export memerlukan izin view
const canExport = computed(() => authStore.can(MENU_ID, 'view'));

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/laporan-stok-stagnan', { params: filters });
    items.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};

const exportData = () => {
  // --- TAMBAHKAN PENGECEKAN IZIN ---
  if (!canExport.value) {
    toast.error('Anda tidak memiliki izin untuk mengekspor data.');
    return;
  }
  // ---------------------------------

  if (items.value.length === 0) return toast.warning('Tidak ada data untuk diekspor.');
  const worksheet = XLSX.utils.json_to_sheet(items.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Stok Stagnan");
  XLSX.writeFile(workbook, `Laporan_StokStagnan_${filters.tahun}-${filters.bulan}.xlsx`);
  toast.success('Data berhasil diekspor.');
};

onMounted(() => {
  // --- TAMBAHKAN PENGECEKAN AWAL ---
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    items.value = []; // Pastikan data kosong
    return; // Hentikan eksekusi
  }
  // ------------------------------------

  // fetchData(); // Hapus ini, karena watch immediate akan memanggil
});
watch(filters, () => {
  // --- TAMBAHKAN PENGECEKAN IZIN ---
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading jika belum
    items.value = []; // Kosongkan data
    return; // Hentikan jika tidak ada izin
  }
  // ---------------------------------
  fetchData();
}, { deep: true, immediate: true });
</script>

<template>
  <PageLayout title="Laporan Stok Stagnan" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="canExport" size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel">
        Export
      </v-btn>
    </template>

    <div v-if="!canView && !isLoading" class="state-container pa-4 text-center">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p>Anda tidak memiliki izin untuk melihat laporan ini.</p>
    </div>

    <div class="browse-content">
      <div class="filter-section">
        <v-select v-model="filters.tahun" :items="yearOptions" label="Tahun" density="compact" hide-details
          variant="outlined" style="max-width: 150px;" />
        <v-select v-model="filters.bulan" :items="monthOptions" item-title="title" item-value="value" label="Bulan"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 180px;" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-container">
        <table class="custom-table">
          <thead class="sticky-header">
            <tr class="header-row-1">
              <th rowspan="2" class="text-center">CABANG</th>
              <th colspan="2" class="text-center">STOK AWAL</th>
              <th colspan="2" class="text-center">PENJUALAN</th>
              <th colspan="2" class="text-center">STOK AKHIR</th>
            </tr>
            <tr class="header-row-2">
              <th class="text-end">QTY</th>
              <th class="text-end">RP</th>
              <th class="text-end">QTY</th>
              <th class="text-end">RP</th>
              <th class="text-end">QTY</th>
              <th class="text-end">RP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td colspan="7" class="text-center py-4">
                <v-progress-circular indeterminate color="primary" size="20" />
              </td>
            </tr>
            <tr v-else-if="items.length === 0">
              <td colspan="7" class="text-center py-4">Tidak ada data</td>
            </tr>
            <template v-else>
              <tr v-for="(item, index) in items" :key="index">
                <td>{{ item.Cabang }}</td>
                <td class="text-end">{{ (item.StokAwal || 0).toLocaleString('id-ID') }}</td>
                <td class="text-end">{{ (item.RpAwal || 0).toLocaleString('id-ID') }}</td>
                <td class="text-end">{{ (item.QtyInv || 0).toLocaleString('id-ID') }}</td>
                <td class="text-end">{{ (item.RpInvoice || 0).toLocaleString('id-ID') }}</td>
                <td class="text-end">{{ (item.StokAkhir || 0).toLocaleString('id-ID') }}</td>
                <td class="text-end">{{ (item.RpAkhir || 0).toLocaleString('id-ID') }}</td>
              </tr>
            </template>
          </tbody>
          <tfoot class="sticky-footer">
            <tr class="font-weight-bold">
              <td class="text-end">GRAND TOTAL :</td>
              <td class="text-end">{{ (totalSummary.StokAwal || 0).toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ (totalSummary.RpAwal || 0).toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ (totalSummary.QtyInv || 0).toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ (totalSummary.RpInvoice || 0).toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ (totalSummary.StokAkhir || 0).toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ (totalSummary.RpAkhir || 0).toLocaleString('id-ID') }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.table-container {
  height: calc(100vh - 180px);
  overflow-y: auto;
  overflow-x: auto;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  background-color: rgb(var(--v-theme-surface));
}

/* TABLE BASE */
.custom-table {
  width: 100%;
  border-collapse: collapse;
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-size: 11px;
}

/* STICKY HEADER */
.custom-table thead.sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: rgb(var(--v-theme-surface));
}

/* HEADER CELLS */
.custom-table thead th {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
}

/* BODY CELLS */
.custom-table tbody td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 6px 12px;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
}

/* ROW HOVER */
.custom-table tbody tr:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

/* STICKY FOOTER (GRAND TOTAL) */
.custom-table tfoot.sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 9;
  background-color: rgb(var(--v-theme-surface));
}

.custom-table tfoot td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
}

/* ALIGNMENT */
.text-center {
  text-align: center;
}

.text-end {
  text-align: right;
}

.font-weight-bold {
  font-weight: 600;
}

</style>

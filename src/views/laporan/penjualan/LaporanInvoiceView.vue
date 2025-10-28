<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
// Hapus import GudangSearchModal karena tidak lagi digunakan
// import GudangSearchModal from '@/components/GudangSearchModal.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface CabangOption {
  kode: string;
  nama: string;
}
interface MasterDataItem {
  Kode: string;
  Nama?: string;
  Level_nama?: string;
  Alamat?: string;
  Kota?: string;
  Nominal?: number;
  Hpp?: number;
  Laba?: number;
  Donasi?: number;
  PundiAmal?: number;
  Qty?: number;
}
interface DetailItem {
  kdcus: string;
  nama: string;
  alamat?: string;
  kota?: string;
  Qty?: number;
  Nominal?: number;
  Hpp?: number;
  Laba?: number;
  Donasi?: number;
  PundiAmal?: number;
}
interface DetailCustomer {
  kdcus: string;
  nama: string;
  alamat: string;
  kota: string;
  Qty: number;
  Nominal: number;
  Hpp?: number;
  Laba?: number;
}

// --- State & Inisialisasi ---
const toast = useToast();
const authStore = useAuthStore();
const CABKAOS = authStore.user?.cabang || 'KDC';

// State Laporan
const masterData = ref<MasterDataItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const isLoading = ref(false);
const loadingDetails = ref(new Set<string>());
const cabangList = ref<CabangOption[]>([]);
const expanded = ref<string[]>([]);
const reportType = ref<'tanggal' | 'customer' | 'level'>('tanggal');

// Filters
const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  gudangKode: CABKAOS === 'KDC' ? 'ALL' : CABKAOS,
  gudangNama: CABKAOS === 'KDC' ? 'Semua Cabang' : '',
});

// --- Logic Headers Tabel ---
const headersTanggal = [
  { title: filters.gudangKode === 'ALL' ? 'Cabang' : 'Kode', key: 'Kode', fixed: true, width: '100px' },
  { title: 'Tanggal', key: 'Tanggal', fixed: true, width: '120px' },
  { title: 'Nominal', key: 'Nominal', align: 'end' },
  ...(CABKAOS === 'KDC' ? [
    { title: 'HPP', key: 'Hpp', align: 'end' },
    { title: 'Laba', key: 'Laba', align: 'end' },
  ] : []),
  { title: 'Donasi', key: 'Donasi', align: 'end' },
  { title: 'Pundi Amal', key: 'PundiAmal', align: 'end' },
];

const headersCustomer = [
  { title: 'Kode', key: 'Kode', fixed: true, width: '80px' },
  { title: 'Nama', key: 'Nama', fixed: true, width: '250px' },
  { title: 'Level', key: 'Level_nama', width: '150px' },
  { title: 'Alamat', key: 'Alamat', sortable: false },
  { title: 'Kota', key: 'Kota' },
  { title: 'Nominal', key: 'Nominal' },
  ...(CABKAOS === 'KDC' ? [
    { title: 'HPP', key: 'Hpp' },
    { title: 'Laba', key: 'Laba' },
  ] : []),
  { title: 'Donasi', key: 'Donasi' },
  { title: 'Pundi Amal', key: 'PundiAmal' },
];

const headersLevel = [
  { title: 'Kode', key: 'Kode', fixed: true, width: '80px' },
  { title: 'Level', key: 'Level', fixed: true, width: '200px' },
  { title: 'Qty', key: 'Qty' },
  { title: 'Nominal', key: 'Nominal' },
  ...(CABKAOS === 'KDC' ? [
    { title: 'HPP', key: 'Hpp' },
    { title: 'Laba', key: 'Laba' },
  ] : []),
  { title: 'Donasi', key: 'Donasi' },
  { title: 'Pundi Amal', key: 'PundiAmal' },
  { key: 'data-table-expand', title: '' },
];

const detailHeadersLevel = [
  { title: 'Kode', key: 'kdcus', width: '80px' },
  { title: 'Nama', key: 'nama', width: '200px' },
  { title: 'Alamat', key: 'alamat', sortable: false },
  { title: 'Kota', key: 'kota', width: '120px' },
  { title: 'Qty', key: 'Qty', width: '80px' },
  { title: 'Nominal', key: 'Nominal' },
  ...(CABKAOS === 'KDC' ? [
    { title: 'HPP', key: 'Hpp' },
    { title: 'Laba', key: 'Laba' },
  ] : []),
];

const activeHeaders = computed(() => {
  switch (reportType.value) {
    case 'tanggal': return headersTanggal;
    case 'customer': return headersCustomer;
    case 'level': return headersLevel;
    default: return [];
  }
});

const totalSummary = computed(() => {
  if (!masterData.value.length) return {};
  const totals: Record<string, number> = {};
  activeHeaders.value.forEach(header => {
    const key = header.key;
    if (['Nominal', 'Hpp', 'Laba', 'Donasi', 'PundiAmal', 'Qty'].includes(key)) {
      totals[key] = masterData.value.reduce(
        (sum, item) => sum + (Number(item[key]) || 0),
        0
      );
    }
  });
  return totals;
});

// --- API Calls ---
const fetchCabangOptions = async () => {
  try {
    const response = await api.get<CabangOption[]>('/laporan-invoice/cabang/options');

    if (CABKAOS === 'KDC') {
      // Untuk KDC, tambahkan "Semua Cabang" di awal
      cabangList.value = [{ kode: 'ALL', nama: 'Semua Cabang' }, ...response.data];
    } else {
      // Untuk cabang lain, hanya tampilkan data mereka
      cabangList.value = response.data;
      const userCabang = cabangList.value.find(c => c.kode === CABKAOS);
      if (userCabang) {
        filters.gudangNama = userCabang.nama;
      }
    }
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat data cabang.');
    // Fallback
    if (CABKAOS === 'KDC') {
      cabangList.value = [{ kode: 'ALL', nama: 'Semua Cabang' }];
    } else {
      cabangList.value = [{ kode: CABKAOS, nama: `Cabang ${CABKAOS}` }];
    }
  }
};

const fetchMasterData = async () => {
  isLoading.value = true;
  details.value = {};
  expanded.value = [];
  try {
    const response = await api.get('/laporan-invoice/master', {
      params: { ...filters, reportType: reportType.value }
    });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || `Gagal memuat data Laporan ${reportType.value}.`);
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: Array<{ Kode: string }>) => {
  if (reportType.value !== 'level') return;

  const itemToLoad = newlyExpandedItems.find(item => {
    const id = item.Kode;
    return !details.value[id] && !loadingDetails.value.has(id);
  });

  if (!itemToLoad) return;

  const levelKode = itemToLoad.Kode;
  loadingDetails.value.add(levelKode);

  try {
    const response = await api.get<DetailCustomer[]>('/laporan-invoice/detail-customer-by-level', {
      params: { ...filters, levelKode },
    });

    details.value = { ...details.value, [levelKode]: response.data };
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || `Gagal memuat detail untuk Level ${levelKode}`);
  } finally {
    loadingDetails.value.delete(levelKode);
  }
};

// --- Event Handlers ---
const onGudangSelected = (selectedKode: string) => {
  if (selectedKode) {
    const selectedCabang = cabangList.value.find(c => c.kode === selectedKode);
    if (selectedCabang) {
      filters.gudangNama = selectedCabang.nama;
    }
  } else {
    filters.gudangNama = '';
  }
};

const clearGudangFilter = () => {
  if (CABKAOS === 'KDC') {
    filters.gudangKode = 'ALL';
    filters.gudangNama = 'Semua Cabang';
  }
};

const exportToExcel = () => {
  const ws = XLSX.utils.json_to_sheet(masterData.value);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Laporan Invoice ${reportType.value}`);
  XLSX.writeFile(wb, `LaporanInvoice_${reportType.value}_${filters.startDate}_sd_${filters.endDate}.xlsx`);
};

// --- Lifecycle & Watchers ---
onMounted(fetchCabangOptions);
watch([filters, reportType], fetchMasterData, { deep: true, immediate: true });
</script>

<template>
  <PageLayout title="Laporan Invoice Penjualan" icon="mdi-receipt-text-outline">
    <template #header-actions>
      <v-btn size="small" @click="exportToExcel" prepend-icon="mdi-file-excel" color="teal">Export</v-btn>
      <v-btn v-if="reportType === 'level'" size="small" @click="console.log('Cetak Laporan Level')"
        prepend-icon="mdi-printer" color="primary">
        Cetak
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section d-flex align-center flex-wrap">
        <v-radio-group v-model="reportType" inline density="compact" hide-details class="me-4">
          <v-radio label="Per Tanggal" value="tanggal" class="me-4" />
          <v-radio label="Per Pelanggan" value="customer" class="me-4" />
          <v-radio label="Per Level" value="level" />
        </v-radio-group>

        <v-label class="filter-label ms-4">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />

        <v-select v-model="filters.gudangKode" :items="cabangList" item-title="nama" item-value="kode" label="Cabang"
          density="compact" hide-details variant="outlined" style="max-width: 250px;" class="ms-4"
          :readonly="CABKAOS !== 'KDC'" clearable @click:clear="clearGudangFilter"
          @update:model-value="onGudangSelected" />

        <v-spacer />
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading"
          title="Muat Ulang Data" />
      </div>

      <div class="table-container">
        <v-data-table v-if="reportType === 'level'" :headers="activeHeaders" :items="masterData" :loading="isLoading"
          class="desktop-table main-table" density="compact" fixed-header show-expand item-value="Kode"
          v-model:expanded="expanded" @update:expanded="loadDetails" height="420px">
          <template v-slot:[`item.Nominal`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Nominal) }}
          </template>
          <template v-slot:[`item.Hpp`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Hpp) }}
          </template>
          <template v-slot:[`item.Laba`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Laba) }}
          </template>
          <template v-slot:[`item.Donasi`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Donasi) }}
          </template>
          <template v-slot:[`item.PundiAmal`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.PundiAmal) }}
          </template>
          <template v-slot:[`body.append`]>
            <tr class="bg-grey-lighten-4 font-weight-bold total-row-fixed">
              <td v-for="(header, index) in activeHeaders" :key="header.key" class="text-end pa-2">
                <template v-if="index === 0">TOTAL :</template>
                <template v-else-if="['Qty', 'Nominal', 'Hpp', 'Laba', 'Donasi', 'PundiAmal'].includes(header.key)">
                  {{ new Intl.NumberFormat('id-ID').format(totalSummary[header.key] || 0) }}
                </template>
                <template v-else>&nbsp;</template>
              </td>
            </tr>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-2">
                  <v-data-table :headers="detailHeadersLevel" :items="details[item.Kode]" density="compact"
                    class="detail-table" :items-per-page="-1">
                    <template #bottom></template>
                    <template v-slot:[`item.Nominal`]="{ item }">
                      {{ new Intl.NumberFormat('id-ID').format(item.Nominal) }}
                    </template>
                    <template v-slot:[`item.Hpp`]="{ item }">
                      {{ new Intl.NumberFormat('id-ID').format(item.Hpp) }}
                    </template>
                    <template v-slot:[`item.Laba`]="{ item }">
                      {{ new Intl.NumberFormat('id-ID').format(item.Laba) }}
                    </template>
                  </v-data-table>
                </div>
              </td>
            </tr>
          </template>
        </v-data-table>

        <v-data-table v-else :headers="activeHeaders" :items="masterData" :loading="isLoading"
          class="desktop-table main-table" density="compact" fixed-header height="420px">
          <template v-slot:[`item.Nominal`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Nominal) }}
          </template>
          <template v-slot:[`item.Hpp`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Hpp) }}
          </template>
          <template v-slot:[`item.Laba`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Laba) }}
          </template>
          <template v-slot:[`item.Donasi`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Donasi) }}
          </template>
          <template v-slot:[`item.PundiAmal`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.PundiAmal) }}
          </template>
          <template v-slot:[`body.append`]>
            <tr class="bg-grey-lighten-4 font-weight-bold total-row-fixed">
              <td v-for="(header, index) in activeHeaders" :key="header.key" class="text-end pa-2">
                <template v-if="index === 0">TOTAL :</template>
                <template v-else-if="['Nominal', 'Hpp', 'Laba', 'Donasi', 'PundiAmal'].includes(header.key)">
                  {{ new Intl.NumberFormat('id-ID').format(totalSummary[header.key] || 0) }}
                </template>
                <template v-else>&nbsp;</template>
              </td>
            </tr>
          </template>

        </v-data-table>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.filter-section {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  gap: 8px;
  /* Memberi jarak antar elemen filter */
}

.table-container {
  height: calc(100vh - 200px);
  /* Sesuaikan tinggi ini jika perlu */
  overflow-y: auto;
}

.desktop-table {
  white-space: nowrap;
}

/* Baris total tetap di bawah dan tidak ikut scroll */
.total-row-fixed {
  position: sticky;
  bottom: 0;
  z-index: 5;
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.05);
}

tr.bg-grey-lighten-4 {
  border-top: 2px solid #ccc;
}
</style>

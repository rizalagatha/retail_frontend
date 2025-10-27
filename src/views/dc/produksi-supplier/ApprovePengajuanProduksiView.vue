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

// --- Tipe Data & State ---
interface Header {
  nomor: string;
  tanggal: string;
  approved: string;
  noPO: string;
  cabang: string;
}
interface DetailItem {
  approve: 'Y' | 'N';
  nama: string;
  bahan: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  total: number;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '218';

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
const canApprove = computed(() => isSingleSelected.value);
const canCetak = computed(() => isSingleSelected.value);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'nomor', width: '200px' },
  { title: 'Tanggal', key: 'tanggal' }, { title: 'Cabang', key: 'cabang' },
  { title: 'Kd Sup', key: 'kdSup' }, { title: 'Supplier', key: 'supplier', minWidth: '200px' },
  { title: 'Keterangan', key: 'keterangan' }, { title: 'Tgl Approve', key: 'tglApprove' },
  { title: 'Approved', key: 'approved' }, { title: 'No. PO', key: 'noPO' },
  { title: 'Status PO', key: 'statusPO' },
];
const detailHeaders = [
  { title: 'Approve', key: 'approve', width: '80px' }, { title: 'Nama Barang', key: 'nama', minWidth: '300px' },
  { title: 'Bahan', key: 'bahan' }, { title: 'Ukuran', key: 'ukuran' },
  { title: 'Jumlah', key: 'jumlah' }, { title: 'Harga', key: 'harga' },
  { title: 'Total', key: 'total' },
];

// --- Methods ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/approve-pengajuan-produksi', { params: filters });
    masterData.value = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: Header[]) => {
  if (!newlyExpandedItems) return;
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor));
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/approve-pengajuan-produksi/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}.`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const handleApprove = () => {
  if (!canApprove.value) return;
  // Mengarahkan ke form approval terpisah (perlu dibuat)
  router.push({ name: 'ApprovePengajuanProduksiForm', params: { nomor: selectedRow.value!.nomor } });
};

const handleCetak = () => {
  if (!canCetak.value) return;
  // Menggunakan halaman cetak yang sudah ada
  const routeData = router.resolve({
    name: 'PengajuanProduksiPrint',
    params: { nomor: selectedRow.value!.nomor }
  });
  window.open(routeData.href, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header Pengajuan");
    XLSX.writeFile(workbook, "Export_PengajuanProduksi_Header.xlsx");
  } else if (type === 'detail') {
    loading.value = true;
    try {
      const response = await api.get('/approve-pengajuan-produksi/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Pengajuan");
      XLSX.writeFile(workbook, "Export_PengajuanProduksi_Detail.xlsx");
    } catch (err: unknown) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message || 'Gagal mengekspor data detail.');
    } finally {
      loading.value = false;
    }
  }
};

// Logika pewarnaan dari Delphi
const getRowTextColor = (item: Header) => {
  if (!item.approved) return 'text-red'; // Belum diapprove
  if (item.approved && !item.noPO) return 'text-blue'; // Sudah approve, belum PO
  return '';
};
const getDetailRowTextColor = (item: Header) => {
  if (item.approved === 'N') return 'text-red';
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
  <PageLayout title="Browse Approve Pengajuan Produksi" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" color="primary" prepend-icon="mdi-check-decagram"
        :disabled="!canApprove" @click="handleApprove">
        Approve
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" prepend-icon="mdi-printer"
        :disabled="!canCetak" @click="handleCetak">
        Cetak
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
        <v-label class="filter-label">Tgl Pengajuan:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Approve
          <v-icon color="blue" icon="mdi-square-rounded" size="small" class="ms-2"></v-icon> Belum PO
        </div>
      </div>

      <div class="table-container">
        <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails" :item-class="getRowTextColor">

          <template v-for="col in ['tanggal', 'tglApprove']" #[`item.${col}`]="{ item }" :key="col">
            <span>
              {{ item[col] ? format(parseISO(item[col]), 'dd-MM-yyyy') : '' }}
            </span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-4">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center">Memuat detail...</div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                      class="detail-table" :items-per-page="-1" :item-class="getDetailRowTextColor">
                      <template #[`item.approve`]="{ item }">
                        <v-chip size="x-small" :color="item.approve === 'Y' ? 'success' : 'error'">
                          {{ item.approve }}
                        </v-chip>
                      </template>
                      <template v-for="col in ['jumlah', 'harga', 'total']" #[`item.${col}`]="{ item }" :key="col">
              <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
          </template>
          <template #bottom></template>
        </v-data-table>
      </div>
    </div>
    </td>
    </tr>
</template>
</v-data-table>
</div>
</div>
</PageLayout>
</template>

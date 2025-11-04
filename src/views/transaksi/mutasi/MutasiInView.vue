<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import axios from 'axios';

interface MutasiInHeader {
  Nomor: string;
  Tanggal: string;
  DariCabangNama: string;
  MutasiOut?: string;
  NoSO?: string;
  Qty?: number;
  Invoice?: string;
  KdCus?: string;
  Customer?: string;
  Alamat?: string;
  Kota?: string;
  Keterangan?: string;
  Usr?: string;
}

interface MutasiInDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Qty: number;
}

interface MasterItem {
  Nomor: string;
  [key: string]: unknown; // sesuaikan properti lain jika mau lebih ketat
}

interface DetailItem {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Qty: number;
  [key: string]: unknown; // jika ada properti lain
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '44';

const masterData = ref<MutasiInHeader[]>([]);
const details = ref<Record<string, MutasiInDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MutasiInHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
});

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

const headers = [
  { title: 'Nomor', key: 'Nomor', width: '180px' },
  { title: 'Tanggal', key: 'Tanggal', width: '120px' },
  { title: 'Dari Cabang', key: 'DariCabangNama', width: '180px' },
  { title: 'No. Mutasi Out', key: 'MutasiOut', width: '180px' },
  { title: 'No. SO', key: 'NoSO', width: '180px' },
  { title: 'Qty', key: 'Qty', align: 'end' },
  { title: 'Invoice', key: 'Invoice', width: '180px' },
  { title: 'Kd Cus', key: 'KdCus', width: '120px' },
  { title: 'Customer', key: 'Customer', width: '250px' },
  { title: 'Alamat', key: 'Alamat', width: '350px' },
  { title: 'Kota', key: 'Kota', width: '150px' },
  { title: 'Keterangan', key: 'Keterangan', width: '250px' },
  { title: 'User', key: 'Usr', width: '120px' },
] as const;
const detailHeaders = [
  { title: 'Kode Barang', key: 'Kode' },
  { title: 'Nama Barang', key: 'Nama' },
  { title: 'Ukuran', key: 'Ukuran' },
  { title: 'Qty', key: 'Qty', align: 'end' },
] as const;

const fetchCabangList = async () => {
  try {
    const response = await api.get('/mutasi-in/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchMasterData = async () => {
  loading.value = true;
  try {
    const response = await api.get<MutasiInHeader[]>('/mutasi-in', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      toast.error(error.response.data?.message || 'Gagal mengambil data.');
    } else {
      toast.error('Gagal mengambil data.');
    }
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);
  try {
    const response = await api.get<DetailItem[]>(`/mutasi-in/details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      toast.error(error.response.data?.message || `Gagal memuat detail untuk ${itemToLoad.Nomor}`);
    } else {
      toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}`);
    }
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

const handleDelete = () => {
  if (!selectedRow.value) return;
  if (confirm(`Yakin ingin menghapus Mutasi In nomor ${selectedRow.value.Nomor}?`)) {
    api.delete(`/mutasi-in/${selectedRow.value.Nomor}`)
      .then(response => {
        toast.success(response.data.message);
        fetchMasterData();
      })
      .catch(error => {
        toast.error(error.response?.data?.message || 'Gagal menghapus data.');
      });
  }
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');
    try {
      const worksheet = XLSX.utils.json_to_sheet(masterData.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi In Header");
      XLSX.writeFile(workbook, "Export_Mutasi_In_Header.xlsx");
    } catch (error) { toast.error('Gagal membuat file Excel.', error); }
  } else if (type === 'detail') {
    try {
      toast.info('Mengambil data detail dari server...');
      const response = await api.get('/mutasi-in/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi In Detail");
      XLSX.writeFile(workbook, "Export_Mutasi_In_Detail.xlsx");
    } catch (error) { toast.error('Gagal mengekspor data detail.', error); }
  }
};
const printData = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].Nomor;
  const url = router.resolve({ name: 'Cetak Mutasi In', params: { nomor } }).href;
  window.open(url, '_blank');
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Mutasi In dari Produksi" icon="mdi-truck-plus-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="router.push({ name: 'MutasiInCreate' })">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!isSingleSelected"
        @click="router.push({ name: 'MutasiInEdit', params: { nomor: selectedRow?.Nomor } })">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        :disabled="!isSingleSelected" @click="handleDelete">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" prepend-icon="mdi-printer" color="green"
        :disabled="!isSingleSelected" @click="printData">
        Cetak
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')">
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />
        <v-spacer />
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table" fixed-header show-select
          return-object show-expand @update:expanded="loadDetails">
          <template #[`item.Tanggal`]="{ value }">
            {{ format(parseISO(value), 'dd/MM/yyyy') }}
          </template>
          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">Memuat
                      detail...</div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]" density="compact"
                      class="detail-table" :items-per-page="-1">
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

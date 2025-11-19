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

// --- Tipe Data ---
interface MasterItem {
  nomor: string;
  tanggal: string;
  nomorTerima: string | null;
  tglTerima: string | null;
  nomorTolak: string | null;
  tglTolak: string | null;
  asalGudang: string;
  keterangan: string;
  statusPengajuan: 'WAIT' | 'ACC' | 'TOLAK' | '';
  closing: 'Y' | 'N';
}
interface DetailItem {
  spk: string;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '211';

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);

const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  gudang: 'WH003', // Fixed value
  gudangNama: 'GUDANG JADI KAOSAN', // Nama gudang
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canTerima = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima && !selectedRow.value?.nomorTolak);
const canBatalTerima = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTerima && selectedRow.value?.closing !== 'Y');
const canTolak = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima && !selectedRow.value?.nomorTolak);
const canBatalTolak = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTolak);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor STBJ', key: 'nomor' }, { title: 'Tanggal', key: 'tanggal' },
  { title: 'Asal Gudang', key: 'asalGudang' }, { title: 'Nomor Terima', key: 'nomorTerima' },
  { title: 'Nomor Tolak', key: 'nomorTolak' }, { title: 'User Create', key: 'userCreate' }, // Tambah User Create
  { title: 'Closing', key: 'closing', align: 'center' }, // Tambah Closing
  { title: 'Pengajuan Ubah', key: 'statusPengajuan', align: 'center' },
] as const;
const detailHeaders = [
  { title: 'SPK', key: 'spk' },
  { title: 'Kode', key: 'kode' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
] as const;

// --- Methods ---

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/terima-stbj', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor));
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get('/terima-stbj/details', {
      params: { nomor: nomorToLoad }
    });
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleTerima = () => {
  if (!canTerima.value) return;
  // Kirim nomor STBJ (pengiriman) sebagai query
  router.push({ name: 'TerimaStbjCreate', query: { nomorKirim: selectedRow.value.nomor } });
};

const handleTolak = () => {
  if (!canTolak.value) return;
  router.push({ name: 'TolakStbjCreate', query: { nomorKirim: selectedRow.value.nomor } });
};

const handleBatalTerima = () => {
  if (!canBatalTerima.value) return;
  showConfirmation(
    'Konfirmasi Batal Terima',
    `Yakin membatalkan penerimaan untuk STBJ dengan nomor ${selectedRow.value.nomor}?`,
    async () => {
      try {
        // Gunakan query parameter, bukan path parameter
        const response = await api.delete('/terima-stbj/cancel-receipt', {
          params: { nomor: selectedRow.value.nomor }
        });
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error) {
        const err = error as AxiosError<{ message: string }>;
        toast.error(err.response?.data?.message || 'Gagal membatalkan penerimaan.');
      }
    }
  );
};

const handleBatalTolak = () => {
  if (!canBatalTolak.value) return;
  showConfirmation(
    'Konfirmasi Batal Tolak',
    `Yakin membatalkan penolakan untuk STBJ dengan nomor <strong>${selectedRow.value.nomor}</strong>?`,
    async () => {
      try {
        const response = await api.delete('/terima-stbj/cancel-rejection', {
          params: { nomor: selectedRow.value.nomor } // Kirim nomor pengiriman
        });
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error) {
        const err = error as AxiosError<{ message: string }>;
        toast.error(err.response?.data?.message || 'Gagal membatalkan penolakan.');
      }
    }
  );
};
const getRowTextColor = (item: MasterItem) => {
  if (!item.nomorTerima && !item.nomorTolak) return 'text-red';
  if (!!item.nomorTolak) return 'text-blue';
  return '';
};

const getCellClass = (item: MasterItem) => {
  if (item.statusPengajuan === 'WAIT') return 'bg-blue text-white';
  if (item.statusPengajuan === 'ACC') return 'bg-green text-white';
  if (item.statusPengajuan === 'TOLAK') return 'bg-red text-white';
  return '';
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diexport.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Terima STBJ Header");
    XLSX.writeFile(workbook, "Export_Terima_STBJ_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/terima-stbj/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diexport pada filter ini.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Terima STBJ Detail");
      XLSX.writeFile(workbook, "Export_Terima_STBJ_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Terima STBJ" icon="mdi-truck-check-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-check" color="primary"
        @click="handleTerima" :disabled="!canTerima">Terima</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-undo" color="error"
        @click="handleBatalTerima" :disabled="!canBatalTerima">Batal Terima</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-close" color="blue"
        @click="handleTolak" :disabled="!canTolak">Tolak</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-restore" color="orange"
        @click="handleBatalTolak" :disabled="!canBatalTolak">Batal Tolak</v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">Export</v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"><v-list-item-title>Export
              Header</v-list-item-title></v-list-item>
          <v-list-item @click="exportData('detail')"><v-list-item-title>Export
              Detail</v-list-item-title></v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Tgl Kirim:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-text-field label="Gudang" v-model="filters.gudang" density="compact" hide-details readonly variant="outlined"
          class="ms-4" style="max-width: 120px;" />
        <v-text-field v-model="filters.gudangNama" density="compact" hide-details readonly filled />
        <v-spacer />
        <div class="d-flex align-center ga-4 text-caption">
          <div><v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diproses</div>
          <div><v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> Ditolak</div>
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table header-browse-blue" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails">
          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'nomorTerima'">
                <span :class="getCellClass(item)" class="status-cell pa-1">
                  {{ item.nomorTerima }}
                </span>
              </template>
              <template v-else-if="['tanggal', 'tglTerima', 'tglTolak'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(item[header.key]), 'dd/MM/yyyy') : '' }}
              </template>
              <template v-else-if="header.key === 'statusPengajuan'">
                <v-chip v-if="item.statusPengajuan" size="x-small"
                  :color="item.statusPengajuan === 'ACC' ? 'green' : item.statusPengajuan === 'TOLAK' ? 'red' : 'blue'">
                  {{ item.statusPengajuan }}
                </v-chip>
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">Memuat
                      detail...
                    </div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                      class="detail-table" :items-per-page="-1">
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

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text> <strong>{{ dialogConfirm.text }}</strong> </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya,
            Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.status-cell {
  border-radius: 4px;
  display: inline-block;
  min-width: 80px;
  text-align: center;
}
</style>

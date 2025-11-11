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
  nomorTolak?: string;
  stbj?: string;
  tglTerima?: string;
  namaGudang?: string;
  user_create?: string;
  // tambahkan properti lain sesuai kebutuhan
}
interface DetailItem {
  spk: string;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  // tambahkan properti lain sesuai response API
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '212';

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
  cabang: 'KDC', // Terkunci di KDC
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canTerima = computed(() => isSingleSelected.value && !selectedRow.value?.nomorTerima);
const canBatalTerima = computed(() => isSingleSelected.value && !!selectedRow.value?.nomorTerima);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor Kirim', key: 'nomor' }, { title: 'Tanggal Kirim', key: 'tanggal' },
  { title: 'Nomor Tolak STBJ', key: 'nomorTolak' }, { title: 'Nomor STBJ', key: 'stbj' },
  { title: 'Nomor Terima', key: 'nomorTerima' }, { title: 'Tgl Terima', key: 'tglTerima' },
  { title: 'Dari Gudang', key: 'namaGudang' }, { title: 'User', key: 'user_create' },
];
const detailHeaders = [
  { title: 'SPK', key: 'spk' }, { title: 'Kode', key: 'kode' },
  { title: 'Nama Barang', key: 'nama' }, { title: 'Ukuran', key: 'ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
] as const;

// --- Methods ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/terima-repair', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal mengambil data.');
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
    const response = await api.get(`/terima-repair/details/${nomorToLoad}`);
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
  router.push({ name: 'TerimaRepairCreate', query: { nomorKirim: selectedRow.value.nomor } });
};

const handleBatalTerima = () => {
  if (!canBatalTerima.value) return;
  showConfirmation(
    'Konfirmasi Batal Terima',
    `Yakin membatalkan penerimaan untuk <strong>${selectedRow.value.nomor}</strong>?`,
    async () => {
      try {
        const response = await api.delete(`/terima-repair/cancel-receipt/${selectedRow.value.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error) {
        const axiosError = error as AxiosError<{ message: string }>;
        toast.error(axiosError.response?.data?.message || 'Gagal membatalkan penerimaan.');
      }
    }
  );
};

const getRowTextColor = (item: MasterItem) => {
  if (!item.nomorTerima) return 'text-red font-weight-bold';
  return '';
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');

    const workbook = XLSX.utils.book_new(); // Buat workbook baru
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header"); // Tambahkan sheet ke workbook
    XLSX.writeFile(workbook, "Export_TerimaRepair_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/terima-repair/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail");
      XLSX.writeFile(workbook, "Export_TerimaRepair_Detail.xlsx");
    } catch (err: unknown) {
      let message = 'Gagal mengekspor data detail.';

      if ((err as AxiosError)?.isAxiosError) {
        const axiosError = err as AxiosError<{ message?: string }>;
        message = axiosError.response?.data?.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      toast.error(message);
    }
  }
};


onMounted(() => {
  // --- TAMBAHKAN VALIDASI AKSES 'VIEW' DI SINI ---
  if (!authStore.can(MENU_ID, 'view')) {
    toast.error('Anda tidak memiliki hak akses untuk membuka halaman ini.');
    return router.push('/'); // Redirect ke halaman utama
  }
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Terima dari Gudang Repair" icon="mdi-wrench-check-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-check" color="primary"
        @click="handleTerima" :disabled="!canTerima">
        Terima
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-undo" color="error"
        @click="handleBatalTerima" :disabled="!canBatalTerima">
        Batal Terima
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
        <v-label class="filter-label">Tgl Kirim:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-text-field label="Cabang" v-model="filters.cabang" density="compact" hide-details variant="outlined"
          class="ms-4" readonly style="max-width: 150px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Diterima
        </div>
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails">
          <template v-for="header in headers" #[`item.${header.key}`]="{ item }" :key="header.key">
            <td :class="getRowTextColor(item)">
              <template v-if="['tanggal', 'tglTerima'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(item[header.key]), 'dd/MM/yyyy') : '' }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-2">
                  <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">Memuat detail...
                  </div>
                  <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                    class="detail-table" :items-per-page="-1">
                    <template #bottom></template>
                  </v-data-table>
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
        <v-card-text>
          <div v-html="dialogConfirm.text"></div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal"
            @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

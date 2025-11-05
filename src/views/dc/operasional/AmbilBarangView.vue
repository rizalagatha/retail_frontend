<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MintaBarangSearchModal from '@/components/lookup/MintaBarangSearchModal.vue';
import * as XLSX from 'xlsx';
import { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Tipe Data ---
interface MasterItem {
  nomor: string;
  tanggal: string;
  nomorTerima: string | null;
  tglTerima: string | null;
  store: string;
  namaStore: string;
  peminta: string;
  statusEdit: 'WAIT' | 'ACC' | 'TOLAK' | '';
  userCreate: string;
  closing: 'Y' | 'N';
}

interface DetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}
interface Product {
  kode: string;
  nama: string;
  ukuran?: string;
  jumlah?: number;
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '253';

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const isLookupVisible = ref(false);

const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  kodeBarang: '',
  namaBarang: '',
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canEdit = computed(() => isSingleSelected.value && selectedRow.value?.closing !== 'Y');
const canDelete = computed(() => isSingleSelected.value && selectedRow.value?.closing !== 'Y');


// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'nomor' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Nomor Terima', key: 'nomorTerima' },
  { title: 'Tgl Terima', key: 'tglTerima' },
  { title: 'Nama Store', key: 'namaStore' },
  { title: 'Peminta', key: 'peminta' },
  { title: 'Status Edit', key: 'statusEdit', align: 'center' },
  { title: 'User Create', key: 'userCreate' },
  { title: 'Closing', key: 'closing', align: 'center' },
] as const;
const detailHeaders = [
  { title: 'Kode Barang', key: 'kode' },
  { title: 'Nama Barang', key: 'nama', width: '350px' },
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
] as const;

// --- Methods ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/ambil-barang', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (expandedNomors: string[]) => {
  const newlyExpanded = expandedNomors.filter(nomor => !details.value[nomor] && !loadingDetails.value.has(nomor));
  for (const nomor of newlyExpanded) {
    loadingDetails.value.add(nomor);
    try {
      const response = await api.get('/ambil-barang/details', { params: { nomor } });
      details.value[nomor] = response.data;
    } catch (error: unknown) {
      // gunakan AxiosError handling jika perlu
      toast.error(`Gagal memuat detail untuk ${nomor}`, error);
    } finally {
      loadingDetails.value.delete(nomor);
    }
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleNew = () => {
  router.push({ name: 'AmbilBarangCreate' });
};

const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: 'AmbilBarangEdit', params: { id: selectedRow.value.nomor } });
};

const handleDelete = () => {
  if (!canDelete.value) return;
  showConfirmation(
    'Konfirmasi Hapus',
    `Yakin menghapus dokumen dengan nomor <strong>${selectedRow.value.nomor}</strong>?`,
    async () => {
      try {
        const response = await api.delete(`/ambil-barang/${selectedRow.value.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error) {
        const err = error as AxiosError<{ message: string }>;
        toast.error(err.response?.data?.message || 'Gagal menghapus data.');
      }
    }
  );
};

const getRowTextColor = (item: MasterItem) => {
  return !item.nomorTerima ? 'text-red' : '';
};

const getStatusCellClass = (status: string) => {
  if (status === 'WAIT') return 'bg-blue text-white';
  if (status === 'ACC') return 'bg-green text-white';
  if (status === 'TOLAK') return 'bg-red text-white';
  return '';
};

const handleProductSelected = (products: Product[]) => {
  if (products.length > 0) {
    filters.kodeBarang = products[0].kode;
    filters.namaBarang = products[0].nama;
    fetchMasterData(); // Langsung refresh data sesuai filter
  }
  isLookupVisible.value = false;
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diexport.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pengambilan Barang");
    XLSX.writeFile(workbook, "Export_Pengambilan_Barang_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/ambil-barang/export-detail', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diexport pada filter ini.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Pengambilan Barang");
      XLSX.writeFile(workbook, "Export_Pengambilan_Barang_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

onMounted(fetchMasterData);

watch(() => filters.kodeBarang, (newValue) => {
  // Jika kolom kode barang kosong (misalnya karena di-clear)
  if (!newValue) {
    filters.namaBarang = '';
    fetchMasterData(); // Otomatis refresh data
  }
});

</script>

<template>
  <PageLayout title="Browse Pengambilan Barang" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus" @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" @click="handleEdit" prepend-icon="mdi-pencil" :disabled="!canEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" prepend-icon="mdi-delete" @click="handleDelete"
        :disabled="!canDelete">Hapus</v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="teal" prepend-icon="mdi-file-excel"
            v-bind="props">
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
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" @change="fetchMasterData" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" @change="fetchMasterData" />
        <v-text-field v-model="filters.kodeBarang" label="Cari Kode Barang (F1)" density="compact" hide-details
          variant="outlined" style="max-width: 150px;" @keydown.enter="fetchMasterData"
          @keydown.f1.prevent="isLookupVisible = true" clearable />
        <v-btn icon="mdi-magnify" variant="text" size="small" class="me-2" @click="isLookupVisible = true" />
        <v-text-field v-model="filters.namaBarang" density="compact" hide-details variant="filled" readonly />
        <v-spacer />
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails">
          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'tanggal' || header.key === 'tglTerima'">
                {{ item[header.key] ? format(parseISO(item[header.key]), 'dd/MM/yyyy') : '' }}
              </template>
              <template v-else-if="header.key === 'statusEdit'">
                <v-chip v-if="item.statusEdit" size="x-small" :class="getStatusCellClass(item.statusEdit)">
                  {{ item.statusEdit }}
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
                      detail...</div>
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

    <MintaBarangSearchModal v-if="isLookupVisible" source="ambil-barang" :multi="false" gudang="K01"
      @close="isLookupVisible = false" @products-selected="handleProductSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
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

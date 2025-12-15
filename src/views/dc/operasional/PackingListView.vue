<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, subDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import ProductSearchModal from '@/components/lookup/ProductSearchModal.vue';
import AppDataTable from '@/components/AppDataTable.vue'; // Pastikan import ini ada
import * as XLSX from 'xlsx';
import { AxiosError } from 'axios';

// --- Tipe Data ---
interface PackingListHeader {
  Nomor: string;
  Tanggal: string;
  Store: string;
  Nama_Store: string;
  NoMinta: string;
  TglMinta: string;
  Status: string;
  NoSJFinal: string;
  Keterangan: string;
  Usr: string;
  [key: string]: unknown;
}

interface PackingListDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Jumlah: number;
  [key: string]: unknown;
}

interface Product {
  kode: string;
  nama: string;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '224'; // Samakan dengan backend

// --- State ---
const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'K01' : authStore.user?.cabang || '',
  kodeBarang: '',
  namaBarang: '',
});

const loading = ref(false);
const masterData = ref<PackingListHeader[]>([]);
const selected = ref<PackingListHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, PackingListDetail[]>>({});
const dialog = reactive({ searchProduct: false, confirm: false });
const confirmAction = ref<(() => void) | null>(null);
const confirmText = ref('');

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

// --- Konfigurasi Tabel ---
const masterHeaders = [
  { title: 'No. Packing List', key: 'Nomor', width: '150px' },
  { title: 'Tanggal', key: 'Tanggal', width: '100px' },
  { title: 'Store', key: 'Store', width: '80px' },
  { title: 'Nama Store', key: 'Nama_Store', width: '180px' },
  { title: 'No. Minta', key: 'NoMinta', width: '140px' },
  { title: 'Status', key: 'Status', width: '80px', align: 'center' },
  { title: 'No. SJ Final', key: 'NoSJFinal', width: '140px' },
  { title: 'Keterangan', key: 'Keterangan' },
  { title: 'User', key: 'Usr', width: '100px' },
];

const detailHeaders = [
  { title: 'Kode', key: 'Kode', width: '120px' },
  { title: 'Nama Barang', key: 'Nama' },
  { title: 'Ukuran', key: 'Ukuran', width: '80px' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '100px' },
] as const;

// --- Methods ---
// [TAMBAHAN] Helper untuk format angka (hilangkan desimal)
const formatNumber = (val: number | string) => {
  return Number(val).toLocaleString('id-ID');
};

const fetchMasterData = async () => {
  loading.value = true;
  masterData.value = [];
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/packing-list', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const fetchCabangList = async () => {
  try {
    const response = await api.get('/packing-list/lookup/cabang');
    cabangList.value = response.data;
  } catch {
    toast.error('Gagal memuat daftar cabang.');
  }
};

const loadDetails = async (newlyExpandedItems: PackingListHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/packing-list/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    details.value[nomorToLoad] = [];
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

// Navigasi ke Form Create
const handleNew = () => router.push({ name: 'PackingListCreate' });

// Navigasi ke Form Edit
const handleEdit = () => {
  if (!selectedRow.value) return;
  // Validasi: Jika sudah Closed (Jadi SJ), tidak bisa edit
  if (selectedRow.value.Status === 'C') {
    return toast.warning('Packing List sudah diproses menjadi Surat Jalan. Tidak bisa diubah.');
  }
  router.push({ name: 'PackingListEdit', params: { nomor: selectedRow.value.Nomor } });
};

// Hapus Data
const showDeleteConfirmation = () => {
  if (!selectedRow.value) return;
  if (selectedRow.value.Status === 'C') {
    return toast.warning('Packing List sudah diproses menjadi Surat Jalan. Tidak bisa dihapus.');
  }
  confirmAction.value = executeDelete;
  confirmText.value = `Yakin ingin hapus Packing List nomor ${selectedRow.value.Nomor}?`;
  dialog.confirm = true;
};

const executeDelete = async () => {
  if (!selectedRow.value) return;
  try {
    const response = await api.delete(`/packing-list/${selectedRow.value.Nomor}`);
    toast.success(response.data.message);
    fetchMasterData();
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus data.');
  }
};

// Fungsi untuk tombol Cetak di Header
const handlePrint = () => {
  // Pastikan ada 1 item yang dipilih
  if (selected.value.length !== 1) return;

  const item = selected.value[0]; // Ambil item pertama dari array seleksi

  const url = router.resolve({
    name: 'PackingListPrint',
    params: { nomor: item.Nomor }
  }).href;

  window.open(url, '_blank');
};

// Export Excel
const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    try {
      toast.info('Membuat file Excel Header...');
      const worksheet = XLSX.utils.json_to_sheet(masterData.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "PL Header");
      XLSX.writeFile(workbook, "Export_Packing_List_Header.xlsx");
      toast.success('File Header berhasil dibuat.');
    } catch {
      toast.error('Gagal membuat file Excel.');
    }
  } else if (type === 'detail') {
    try {
      toast.info('Mengambil data detail...');
      const response = await api.get('/packing-list/export-details', { params: filters });
      const detailsData = response.data;

      if (detailsData.length === 0) return toast.warning('Tidak ada data detail.');

      toast.info('Membuat file Excel Detail...');
      const worksheet = XLSX.utils.json_to_sheet(detailsData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "PL Detail");
      XLSX.writeFile(workbook, "Export_Packing_List_Detail.xlsx");
      toast.success('File Detail berhasil dibuat.');
    } catch {
      toast.error('Gagal mengekspor data detail.');
    }
  }
};

const onProductSelected = (products: Product[]) => {
  if (products.length > 0) {
    filters.kodeBarang = products[0].kode;
    filters.namaBarang = products[0].nama;
  }
  dialog.searchProduct = false;
};

// 1. Update Helper Teks (Sesuai update backend sebelumnya)
const getStatusText = (status: string) => {
  if (status === 'O' || status === 'OPEN') return 'OPEN';
  if (status === 'SENT') return 'KIRIM (OTW)';
  if (status === 'RECEIVED') return 'DITERIMA';
  return 'PROCESSED'; // Fallback
};

// 2. Update Helper Warna Chip (Sinkron dengan permintaan warna baris)
const getStatusChipColor = (status: string) => {
  if (status === 'O' || status === 'OPEN') return 'red';        // Merah
  if (status === 'SENT') return 'blue';                         // Biru
  if (status === 'RECEIVED') return 'grey-darken-3';            // Hitam/Gelap
  return 'blue';
};

// 3. [BARU] Helper Warna Baris (Row Text Color)
const rowProps = (data: { item: PackingListHeader }) => {
  const item = data.item;
  let textColor = '';

  // Logika Warna Baris
  if (item.Status === 'O' || item.Status === 'OPEN') {
    textColor = 'text-red font-weight-medium'; // Merah: Belum dibuat SJ
  } else if (item.Status === 'SENT') {
    textColor = 'text-blue'; // Biru: Sudah SJ (Sedang dikirim)
  } else if (item.Status === 'RECEIVED') {
    textColor = ''; // Hitam: Default (Sudah diterima)
  } else {
    // Fallback jika backend masih kirim status lama 'C'
    // Jika 'C' tapi belum ada NoTerima -> Biru, Jika ada -> Hitam
    textColor = (!item.NoTerima || item.NoTerima === '-') ? 'text-blue' : '';
  }

  return { class: textColor };
};

onMounted(async () => {
  await fetchCabangList();
  if (authStore.can(MENU_ID, 'view')) {
    fetchMasterData();
  } else {
    toast.error('Anda tidak memiliki hak akses.');
    router.push('/');
  }
});

let debounceTimer: number;
watch(filters, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchMasterData();
  }, 500);
}, { deep: true });

watch(() => filters.kodeBarang, (newVal) => {
  if (!newVal) filters.namaBarang = '';
});
</script>

<template>
  <PageLayout title="Packing List / Pra-SJ" icon="mdi-package-variant-closed">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">
        Baru
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="handleEdit">
        Ubah
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="showDeleteConfirmation">
        Hapus
      </v-btn>
      <v-btn size="small" color="secondary" prepend-icon="mdi-printer" :disabled="!isSingleSelected"
        @click="handlePrint">
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
        <v-divider vertical class="mx-2" />
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details />
        <v-label class="filter-label">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details />

        <v-select label="Cabang Tujuan" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />

        <v-text-field v-model="filters.kodeBarang" placeholder="Cari Barang (F1)" density="compact" hide-details
          clearable variant="outlined" style="max-width: 300px;" @keydown.f1.prevent="dialog.searchProduct = true">
        </v-text-field>
        <v-text-field v-model="filters.namaBarang" placeholder="Nama Barang" density="compact" hide-details readonly
          variant="outlined" class="filter-nama-barang" style="max-width: 200px;">
        </v-text-field>

        <v-spacer />
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="masterHeaders" :items="masterData"
          :loading="loading" :row-props="rowProps" item-value="Nomor" density="compact"
          class="desktop-table header-browse-blue" fixed-header show-select return-object show-expand
          @update:expanded="loadDetails">

          <template #[`item.Nomor`]="{ item }">
            <strong>{{ item.Nomor }}</strong>
          </template>

          <template #[`item.Tanggal`]="{ item }">
            {{ format(new Date(item.Tanggal as string), 'dd-MM-yyyy') }}
          </template>

          <template #[`item.Status`]="{ item }">
            <v-chip size="x-small" :color="getStatusChipColor(item.Status)" class="font-weight-bold" variant="flat">
              {{ getStatusText(item.Status) }}
            </v-chip>
          </template>

          <template #[`item.NoSJFinal`]="{ item }">
            <span :class="item.NoSJFinal !== '-' ? 'text-green font-weight-bold' : 'text-grey'">
              {{ item.NoSJFinal }}
            </span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>
                    <v-data-table v-else-if="details[item.Nomor]" class="detail-table" :headers="detailHeaders"
                      :items="details[item.Nomor]" density="compact" :items-per-page="-1">
                      <template #[`item.Jumlah`]="{ item }">
                        <strong>{{ formatNumber(item.Jumlah) }}</strong>
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-2">
                      Tidak ada data detail.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <ProductSearchModal v-if="dialog.searchProduct" category="ALL" :source="'surat-jalan'"
      :gudang="authStore.user?.cabang || ''" @close="dialog.searchProduct = false"
      @products-selected="onProductSelected" />

    <v-dialog v-model="dialog.confirm" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>{{ confirmText }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialog.confirm = false">Tidak</v-btn>
          <v-btn color="error" variant="tonal" @click="confirmAction && confirmAction(); dialog.confirm = false">
            Ya, Hapus
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.filter-nama-barang :deep(input) {
  font-size: 11px !important;
}
</style>

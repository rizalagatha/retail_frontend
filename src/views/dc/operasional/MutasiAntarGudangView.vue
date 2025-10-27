<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import MintaBarangSearchModal from '@/components/lookup/MintaBarangSearchModal.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data & State ---
interface MutasiHeader {
  nomor: string;
  tanggal: string;
  noSTBJ: string;
  closing: 'Y' | 'N';
  ngedit: 'WAIT' | 'ACC' | 'TOLAK' | '';
  keterangan: string;
  total?: number;
}
interface MutasiDetail {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '216';

const masterData = ref<MutasiHeader[]>([]);
const details = ref<Record<string, MutasiDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MutasiHeader[]>([]);
const expanded = ref<string[]>([]);

const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });
const dialogAlasan = reactive({
  show: false,
  alasan: '',
  isLoading: false,
});
const isBarangSearchVisible = ref(false);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  kodeBarang: '',
  namaBarang: '',
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MutasiHeader | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canEdit = computed(() => {
  if (!isSingleSelected.value) return false;
  return selectedRow.value?.noSTBJ === '' && selectedRow.value?.closing !== 'Y';
});
const canDelete = computed(() => canEdit.value); // Logika sama dengan edit
const canCetak = computed(() => isSingleSelected.value);
const canAjukan = computed(() => isSingleSelected.value && selectedRow.value?.noSTBJ === '');

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'nomor', width: '200px' }, { title: 'Tanggal', key: 'tanggal' },
  { title: 'Dari Gudang', key: 'dariGudang' }, { title: 'Ke Gudang', key: 'keGudang' },
  { title: 'Nama Store', key: 'namaStore' }, { title: 'Keterangan', key: 'keterangan' },
  { title: 'No. STBJ', key: 'noSTBJ' }, { title: 'Total', key: 'total' },
  { title: 'Status', key: 'ngedit' }, { title: 'User', key: 'usr' },
];
const detailHeaders = [
  { title: 'Kode', key: 'kode' }, { title: 'Nama Barang', key: 'nama', minWidth: '300px' },
  { title: 'Ukuran', key: 'ukuran' }, { title: 'Jumlah', key: 'jumlah' },
];

// --- Methods ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/mutasi-antar-gudang', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};
const loadDetails = async (newlyExpandedItems: MutasiHeader[]) => {
  if (!newlyExpandedItems) return;

  // Cari item yang baru saja di-expand, yang datanya belum ada dan belum sedang di-load
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor));

  // Jika tidak ada item baru untuk di-load (misalnya saat menutup baris), hentikan fungsi
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.nomor;
  loadingDetails.value.add(nomorToLoad);

  try {
    const response = await api.get(`/mutasi-antar-gudang/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}.`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};
const handleNew = () => router.push({ name: 'MutasiAntarGudangCreate' });
const handleEdit = () => {
  if (!canEdit.value) {
    if (selectedRow.value?.noSTBJ) return toast.error('Mutasi Otomatis dari STBJ. Tidak bisa diubah.');
    if (selectedRow.value?.closing === 'Y') return toast.error('Sudah Closing Stok Opname. Tidak bisa diubah.');
    return;
  }
  router.push({ name: 'MutasiAntarGudangEdit', params: { nomor: selectedRow.value!.nomor } });
};
const handleCetak = () => {
  if (!canCetak.value) return;
  const routeData = router.resolve({
    name: 'MutasiAntarGudangPrint',
    params: { nomor: selectedRow.value!.nomor }
  });
  window.open(routeData.href, '_blank');
};

const openDeleteDialog = () => {
  if (!canDelete.value) {
    if (selectedRow.value?.noSTBJ) return toast.error('Mutasi Otomatis dari STBJ. Tidak bisa dihapus.');
    if (selectedRow.value?.closing === 'Y') return toast.error('Sudah Closing Stok Opname. Tidak bisa dihapus.');
    return;
  }
  showConfirmation('Konfirmasi Hapus', `Yakin ingin hapus mutasi ${selectedRow.value!.nomor}?`, handleDelete);
};
const handleDelete = async () => {
  try {
    const response = await api.delete(`/mutasi-antar-gudang/${selectedRow.value!.nomor}`);
    toast.success(response.data.message);
    fetchData();
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal menghapus.');
  }
};

const openAlasanDialog = () => {
  if (!canAjukan.value) return;
  dialogAlasan.alasan = '';
  dialogAlasan.show = true;
};
const handleAjukan = async () => {
  if (!dialogAlasan.alasan.trim()) return toast.warning('Alasan harus diisi.');
  dialogAlasan.isLoading = true;
  try {
    const response = await api.post('/mutasi-antar-gudang/ajukan', {
      nomor: selectedRow.value!.nomor,
      tanggal: selectedRow.value!.tanggal,
      keterangan: selectedRow.value!.keterangan,
      alasan: dialogAlasan.alasan,
    });
    toast.success(response.data.message);
    dialogAlasan.show = false;
    fetchData();
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal mengajukan.');
  } finally {
    dialogAlasan.isLoading = false;
  }
};

const getRowTextColor = (item: MutasiHeader) => {
  if (item.noSTBJ) return 'text-blue';
  if (item.ngedit === 'WAIT') return 'text-blue font-weight-bold';
  if (item.ngedit === 'TOLAK') return 'text-red font-weight-bold';
  if (item.ngedit === 'ACC') return 'text-green font-weight-bold';
  return '';
};
const getStatusChipColor = (status: string) => {
  if (status === 'WAIT') return 'blue';
  if (status === 'TOLAK') return 'error';
  if (status === 'ACC') return 'success';
  return 'grey';
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header Mutasi");
    XLSX.writeFile(workbook, "Export_MutasiAG_Header.xlsx");
  } else if (type === 'detail') {
    // Ini memerlukan endpoint backend baru: /api/mutasi-antar-gudang/export-details
    try {
      loading.value = true;
      const response = await api.get('/mutasi-antar-gudang/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Mutasi");
      XLSX.writeFile(workbook, "Export_MutasiAG_Detail.xlsx");
    } catch (error) {
      const axiosError = error as AxiosError<{ message: string }>;
      toast.error(axiosError.response?.data?.message || 'Gagal mengekspor data detail.');
    } finally {
      loading.value = false;
    }
  }
};

const onBarangSelected = async (selectedProduct: { kode: string, nama: string }) => {
  filters.kodeBarang = selectedProduct.kode;
  filters.namaBarang = selectedProduct.nama;
  isBarangSearchVisible.value = false;
  await nextTick(); // pastikan reaktivitas & v-model ter-update
  fetchData();
};

const clearBarangFilter = () => {
  filters.kodeBarang = '';
  filters.namaBarang = '';
  fetchData(); // Muat ulang data tanpa filter barang
};

onMounted(fetchData);
watch(() => [filters.startDate, filters.endDate], fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Mutasi Stok Antar Gudang" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="handleEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="openDeleteDialog">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!canCetak"
        prepend-icon="mdi-printer" @click="handleCetak">Cetak</v-btn>
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
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" color="purple"
        prepend-icon="mdi-comment-question-outline" :disabled="!canAjukan" @click="openAlasanDialog">
        Pengajuan Perubahan
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />

        <v-text-field v-model="filters.kodeBarang" label="Cari Kode Barang (F1)" density="compact" hide-details
          variant="outlined" class="ms-4" style="max-width: 180px;" readonly @click="isBarangSearchVisible = true"
          @keydown.f1.prevent="isBarangSearchVisible = true" clearable @click:clear="clearBarangFilter"
          append-inner-icon="mdi-magnify" @click:append-inner="isBarangSearchVisible = true" />

        <v-text-field v-model="filters.namaBarang" label="Nama Barang" density="compact" hide-details variant="filled"
          class="ms-2" style="max-width: 300px;" readonly />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
      </div>

      <div class="table-container">
        <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails" :item-class="getRowTextColor">
          <template v-slot:[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal), 'dd-MM-yyyy') }}
          </template>
          <template v-slot:[`item.total`]="{ item }">
            {{ (item.total || 0).toLocaleString('id-ID') }}
          </template>
          <template v-slot:[`item.ngedit`]="{ item }">
            <v-chip v-if="item.ngedit" :color="getStatusChipColor(item.ngedit)" size="x-small">
              {{ item.ngedit }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-4">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center">
                      <v-progress-circular indeterminate color="primary" />
                      <div>Memuat detail...</div>
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
        </v-data-table>
      </div>
    </div>

    <MintaBarangSearchModal v-if="isBarangSearchVisible" source="ambil-barang" :gudang="authStore.user?.cabang || 'KDC'"
      @close="isBarangSearchVisible = false" @product-selected="onBarangSelected" />

    <v-dialog v-model="dialogAlasan.show" max-width="500px" persistent>
      <v-card>
        <v-card-title>Pengajuan Perubahan Data</v-card-title>
        <v-card-text>
          <v-textarea v-model="dialogAlasan.alasan" label="Alasan Perubahan" rows="3" variant="outlined" autofocus />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogAlasan.show = false">Batal</v-btn>
          <v-btn color="primary" @click="handleAjukan" :loading="dialogAlasan.isLoading">Ajukan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal"
            @click="() => { dialogConfirm.onConfirm(); dialogConfirm.show = false; }">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

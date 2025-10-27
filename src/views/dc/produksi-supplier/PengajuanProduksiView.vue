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
  tglApprove?: string;
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
const MENU_ID = '217';

const masterData = ref<Header[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<Header[]>([]);
const expanded = ref<string[]>([]);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<Header | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canEdit = computed(() => {
  if (!isSingleSelected.value) return false;
  // Validasi dari Delphi
  if (selectedRow.value?.approved) return false;
  if (authStore.user?.cabang !== 'KDC' && authStore.user?.cabang !== selectedRow.value?.cabang) return false;
  return true;
});
const canDelete = computed(() => canEdit.value); // Logika sama dengan edit
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
    const response = await api.get('/pengajuan-produksi', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
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
    const response = await api.get(`/pengajuan-produksi/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}.`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const handleNew = () => router.push({ name: 'PengajuanProduksiCreate' });
const handleEdit = () => {
  if (!canEdit.value) {
    if (selectedRow.value?.approved) return toast.error('Sudah diApprove. Tidak bisa diubah.');
    if (authStore.user?.cabang !== 'KDC' && authStore.user?.cabang !== selectedRow.value?.cabang) {
      return toast.error(`Data tsb punya Cabang ${selectedRow.value?.cabang}.`);
    }
    return;
  }
  router.push({ name: 'PengajuanProduksiEdit', params: { nomor: selectedRow.value!.nomor } });
};
const handleCetak = () => {
  if (!canCetak.value) return;
  const routeData = router.resolve({
    name: 'PengajuanProduksiPrint',
    params: { nomor: selectedRow.value!.nomor }
  });
  window.open(routeData.href, '_blank');
};

const openDeleteDialog = () => {
  if (!canDelete.value) {
    if (selectedRow.value?.approved) return toast.error('Sudah diApprove. Tidak bisa dihapus.');
    if (authStore.user?.cabang !== 'KDC' && authStore.user?.cabang !== selectedRow.value?.cabang) {
      return toast.error(`Data tsb punya Cabang ${selectedRow.value?.cabang}.`);
    }
    return;
  }
  showConfirmation('Konfirmasi Hapus', `Yakin ingin hapus pengajuan ${selectedRow.value!.nomor}?`, handleDelete);
};
const handleDelete = async () => {
  try {
    const response = await api.delete(`/pengajuan-produksi/${selectedRow.value!.nomor}`);
    toast.success(response.data.message);
    fetchData();
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus.');
  }
};

const exportData = async (type: 'header' | 'detail') => {
  // Cek hak akses lagi (opsional tapi bagus)
  if (!authStore.can(MENU_ID, 'view')) {
    return toast.error('Anda tidak memiliki hak akses untuk ekspor.');
  }

  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header Pengajuan");
    XLSX.writeFile(workbook, "Export_PengajuanProduksi_Header.xlsx");
    toast.success('Ekspor header berhasil.');
  } else if (type === 'detail') {
    // Ini memanggil endpoint 'export-details' yang sudah kita buat
    loading.value = true;
    try {
      const response = await api.get('/pengajuan-produksi/export-details', { params: filters });
      if (response.data.length === 0) {
        loading.value = false;
        return toast.warning('Tidak ada data detail untuk diekspor pada filter ini.');
      }

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Pengajuan");
      XLSX.writeFile(workbook, "Export_PengajuanProduksi_Detail.xlsx");
      toast.success('Ekspor detail berhasil.');
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      toast.error(err.response?.data?.message || 'Gagal mengekspor data detail.');
    } finally {
      loading.value = false;
    }
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

// Logika pewarnaan dari Delphi
const getRowTextColor = (item: Header) => {
  if (!item.approved) return 'text-red';
  if (item.approved && !item.noPO) return 'text-blue';
  return '';
};
const getDetailRowTextColor = (item: DetailItem) => {
  if (item.approve === 'N') return 'text-red';
  return '';
};

onMounted(fetchData);
watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Pengajuan Produksi" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!isSingleSelected"
        @click="handleEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" prepend-icon="mdi-delete"
        :disabled="!isSingleSelected" @click="openDeleteDialog">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" prepend-icon="mdi-printer"
        :disabled="!canCetak" @click="handleCetak">Cetak</v-btn>
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

          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal), 'dd-MM-yyyy') }}
          </template>

          <template #[`item.tglApprove`]="{ item }">
            {{ item.tglApprove ? format(parseISO(item.tglApprove), 'dd-MM-yyyy') : '' }}
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
              <td class="text-end">{{ (item[col as keyof typeof item] || 0).toLocaleString('id-ID') }}</td>
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

<v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
  <v-card>
    <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
    <v-card-text {{ dialogConfirm.text }}></v-card-text>
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

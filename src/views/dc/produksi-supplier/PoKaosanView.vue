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
  Nomor: string;
  Tanggal: string;
  Status: 'OPEN' | 'CLOSE' | 'ONPROSES';
}
interface DetailItem {
  Kode: string;
  Nama: string;
  Bahan: string;
  Ukuran: string;
  QtyPO: number;
  QtyBPB: number;
  Harga: number;
  Disc: number;
  NominalPO: number;
  Keterangan: string;
}
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '220';

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
const canEdit = computed(() => isSingleSelected.value);
const canDelete = computed(() => isSingleSelected.value && selectedRow.value?.Status !== 'ONPROSES' && selectedRow.value?.Status !== 'CLOSE');
const canCetak = computed(() => isSingleSelected.value);
const toggleCloseText = computed(() => selectedRow.value?.Status === 'CLOSE' ? 'Batal Close' : 'Close PO');

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'Nomor', width: '200px', fixed: true },
  { title: 'Tanggal', key: 'Tanggal' }, { title: 'Nominal', key: 'Nominal' },
  { title: 'Terbayar', key: 'Terbayar' }, { title: 'Sisa', key: 'Sisa' },
  { title: 'Kd Sup', key: 'Kdsup' }, { title: 'Supplier', key: 'Supplier', minWidth: '200px' },
  { title: 'Alamat', key: 'Alamat', minWidth: '250px' }, { title: 'Keterangan', key: 'Keterangan' },
  { title: 'Status', key: 'Status', align: 'center', fixed: true },
] as const;
const detailHeaders = [
  { title: 'Kode', key: 'Kode' }, { title: 'Nama Barang', key: 'Nama', minWidth: '300px' },
  { title: 'Bahan', key: 'Bahan' }, { title: 'Ukuran', key: 'Ukuran' },
  { title: 'Qty PO', key: 'QtyPO' }, { title: 'Qty BPB', key: 'QtyBPB' },
  { title: 'Harga', key: 'Harga' }, { title: 'Disc(%)', key: 'Disc' },
  { title: 'Nominal PO', key: 'NominalPO' }, { title: 'Keterangan', key: 'Keterangan' },
];

// --- Methods ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/po-kaosan', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: Header[]) => {
  if (!newlyExpandedItems) return;
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/po-kaosan/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}.`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const handleNew = () => router.push({ name: 'PoKaosanCreate' });
const handleEdit = () => {
  if (!canEdit.value) return;
  // Validasi dari Delphi
  if (selectedRow.value?.Status === 'ONPROSES' || selectedRow.value?.Status === 'CLOSE') {
    showConfirmation(
      'Konfirmasi Ubah',
      `PO tsb sudah ${selectedRow.value.Status}. Yakin ingin diubah?`,
      () => router.push({ name: 'PoKaosanEdit', params: { nomor: selectedRow.value!.Nomor } })
    );
  } else {
    router.push({ name: 'PoKaosanEdit', params: { nomor: selectedRow.value!.Nomor } });
  }
};
const handleCetak = () => {
  if (!canCetak.value) return;
  const routeData = router.resolve({
    name: 'PoKaosanPrint',
    params: { nomor: selectedRow.value!.Nomor }
  });
  window.open(routeData.href, '_blank');
};

const openDeleteDialog = () => {
  if (!canDelete.value) {
    if (selectedRow.value?.Status === 'ONPROSES') return toast.error('PO tsb sudah terima BPB. Tidak bisa dihapus.');
    if (selectedRow.value?.Status === 'CLOSE') return toast.error('PO tsb Sudah Close. Tidak bisa dihapus.');
    return;
  }
  showConfirmation('Konfirmasi Hapus', `Yakin ingin hapus PO ${selectedRow.value!.Nomor}?`, handleDelete);
};
const handleDelete = async () => {
  try {
    const response = await api.delete(`/po-kaosan/${selectedRow.value!.Nomor}`);
    toast.success(response.data.message);
    fetchData();
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal menghapus.');
  }
};

const handleToggleClose = () => {
  if (!isSingleSelected.value) return;
  const actionText = toggleCloseText.value;
  showConfirmation(`Konfirmasi ${actionText}`, `Yakin akan ${actionText} PO ${selectedRow.value!.Nomor}?`, executeToggleClose);
};
const executeToggleClose = async () => {
  try {
    const response = await api.patch(`/po-kaosan/toggle-close/${selectedRow.value!.Nomor}`);
    toast.success(response.data.message);
    // Update baris di frontend
    const index = masterData.value.findIndex(item => item.Nomor === selectedRow.value!.Nomor);
    if (index > -1) masterData.value[index].Status = response.data.newStatus;
    selected.value = [];
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal update status.');
  }
};

const exportData = async (type: 'header' | 'detail') => {
  // Cek hak akses
  if (!authStore.can(MENU_ID, 'view')) {
    return toast.error('Anda tidak memiliki hak akses untuk ekspor.');
  }

  if (type === 'header') {
    if (masterData.value.length === 0) {
      return toast.warning('Tidak ada data header untuk diekspor.');
    }
    // Ekspor data master yang sedang tampil di grid
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header PO Kaosan");
    XLSX.writeFile(workbook, "Export_PO_Kaosan_Header.xlsx");
    toast.success('Ekspor header berhasil.');

  } else if (type === 'detail') {
    // Panggil endpoint 'export-details' yang sudah kita buat di backend
    loading.value = true;
    try {
      const response = await api.get('/po-kaosan/export-details', { params: filters });

      if (response.data.length === 0) {
        loading.value = false;
        return toast.warning('Tidak ada data detail untuk diekspor pada filter ini.');
      }

      // Ekspor hasil respons dari API
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail PO Kaosan");
      XLSX.writeFile(workbook, "Export_PO_Kaosan_Detail.xlsx");
      toast.success('Ekspor detail berhasil.');
    } catch (error) {
      const axiosError = error as AxiosError<{ message: string }>;
      toast.error(axiosError.response?.data?.message || 'Gagal mengekspor data detail.');
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
  if (item.Status === 'OPEN') return 'text-red';
  if (item.Status === 'ONPROSES') return 'text-blue';
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
  <PageLayout title="Browse PO ke Supplier" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!canEdit"
        @click="handleEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" prepend-icon="mdi-delete"
        :disabled="!canDelete" @click="openDeleteDialog">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" prepend-icon="mdi-printer"
        :disabled="!canCetak" @click="handleCetak">Cetak</v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="teal" prepend-icon="mdi-file-excel"
            v-bind="props">Export</v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"><v-list-item-title>Export Header</v-list-item-title></v-list-item>
          <v-list-item @click="exportData('detail')"><v-list-item-title>Export Detail</v-list-item-title></v-list-item>
        </v-list>
      </v-menu>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" color="cyan"
        prepend-icon="mdi-lock-open-variant-outline" :disabled="!isSingleSelected" @click="handleToggleClose">
        {{ toggleCloseText }}
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Tanggal PO:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> OPEN
          <v-icon color="blue" icon="mdi-square-rounded" size="small" class="ms-2"></v-icon> ON PROSES
        </div>
      </div>

      <div class="table-container">
        <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails">
          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'Tanggal'">
                {{ format(parseISO(item.Tanggal), 'dd-MM-yyyy') }}
              </template>
              <template v-else-if="['Nominal', 'Terbayar', 'Sisa'].includes(header.key)">
                {{ (item[header.key] || 0).toLocaleString('id-ID') }}
              </template>
              <template v-else-if="header.key === 'Status'">
                <v-chip size="x-small"
                  :color="item.Status === 'OPEN' ? 'error' : (item.Status === 'CLOSE' ? 'success' : 'info')">
                  {{ item.Status }}
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
                <div class="detail-container pa-4">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center">Memuat detail...</div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template v-for="col in ['QtyPO', 'QtyBPB', 'Harga', 'NominalPO']" #[`item.${col}`]="{ item }"
                        :key="col">
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

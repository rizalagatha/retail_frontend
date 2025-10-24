<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';

// --- Tipe Data & State ---
interface Header {
  nomor: string;
  tanggal: string;
  nomorPO: string;
  cabang: string;
}
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '221';

const masterData = ref<Header[]>([]);
const details = ref<Record<string, any[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<Header[]>([]);
const expanded = ref<Header[]>([]);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<Header | null>(() => isSingleSelected.value ? selected.value[0] : null);
const canEdit = computed(() => isSingleSelected.value);
const canDelete = computed(() => isSingleSelected.value);
const canCetak = computed(() => isSingleSelected.value);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'nomor', width: '200px' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Nomor PO', key: 'nomorPO' },
  { title: 'Nominal BPB', key: 'nominalBPB', align: 'end' },
  { title: 'Kd Sup', key: 'kdsup' },
  { title: 'Supplier', key: 'suplier', minWidth: '200px' },

  // --- PASTIKAN 'key' MENGGUNAKAN HURUF KECIL ---
  { title: 'Alamat', key: 'alamat', minWidth: '250px' },
  { title: 'Cabang', key: 'cabang', width: '100px' },
  // ---------------------------------------------

  { title: 'Keterangan', key: 'keterangan' },
  { title: 'User', key: 'created' },
];
const detailHeaders = [
  { title: 'Kode', key: 'kode' }, { title: 'Nama Barang', key: 'nama', minWidth: '300px' },
  { title: 'Bahan', key: 'bahan' }, { title: 'Ukuran', key: 'ukuran' },
  { title: 'Qty Bagus', key: 'qtyBagus', align: 'end' }, { title: 'Qty BS', key: 'qtyBS', align: 'end' },
  { title: 'Qty Terima', key: 'qtyTerima', align: 'end' }, { title: 'Harga Bagus', key: 'hargaBagus', align: 'end' },
  { title: 'Harga BS', key: 'hargaBS', align: 'end' }, { title: 'Total', key: 'total', align: 'end' },
];

// --- Methods ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/bpb-kaosan', { params: filters });
    masterData.value = response.data;
  } catch (error: any) {
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
    const response = await api.get(`/bpb-kaosan/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}.`);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const handleNew = () => router.push({ name: 'BpbKaosanCreate' });
const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: 'BpbKaosanEdit', params: { nomor: selectedRow.value!.nomor } });
};
const handleCetak = () => {
  if (!canCetak.value) return;
  const routeData = router.resolve({
    name: 'BpbKaosanPrint',
    params: { nomor: selectedRow.value!.nomor }
  });
  window.open(routeData.href, '_blank');
};

const openDeleteDialog = () => {
  if (!canDelete.value) return;
  showConfirmation('Konfirmasi Hapus', `Yakin ingin hapus BPB ${selectedRow.value!.nomor}?`, handleDelete);
};
const handleDelete = async () => {
  try {
    // Mengirim data yang diperlukan (nomorPO dan cabang) di dalam body request
    const response = await api.delete(`/bpb-kaosan/${selectedRow.value!.nomor}`, {
      data: {
        nomorPO: selectedRow.value!.nomorPO,
        cabang: selectedRow.value!.cabang
      }
    });
    toast.success(response.data.message);
    fetchData();
  } catch (error: any) { toast.error(error.response?.data?.message || 'Gagal menghapus.'); }
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Header BPB Kaosan");
    XLSX.writeFile(workbook, "Export_BPB_Kaosan_Header.xlsx");
  } else if (type === 'detail') {
    loading.value = true;
    try {
      const response = await api.get('/bpb-kaosan/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail BPB Kaosan");
      XLSX.writeFile(workbook, "Export_BPB_Kaosan_Detail.xlsx");
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal mengekspor data detail.');
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

const getRowTextColor = (item: Header) => {
  // Tidak ada logika pewarnaan khusus di Delphi untuk halaman ini,
  // jadi kita kembalikan string kosong.
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
  <PageLayout title="Browse BPB dari Supplier" :menu-id="MENU_ID">
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
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Tanggal BPB:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
      </div>

      <div class="table-container">
        <v-data-table v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails">

          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'tanggal'">
                {{ format(parseISO(item.tanggal), 'dd-MM-yyyy') }}
              </template>
              <template v-else-if="['nominalBPB'].includes(header.key)">
                {{ (item[header.key] || 0).toLocaleString('id-ID') }}
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
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center">Memuat detail...</div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template v-for="col in ['qtyBagus', 'qtyBS', 'qtyTerima', 'hargaBagus', 'hargaBS', 'total']"
                        #[`item.${col}`]="{ item }">
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
    <v-card-text v-html="dialogConfirm.text"></v-card-text>
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

<style scoped>
.table-container {
  height: calc(100vh - 180px);
  overflow-y: auto;
}

.detail-table-wrapper {
  max-height: 400px;
  overflow-y: auto;
}
</style>

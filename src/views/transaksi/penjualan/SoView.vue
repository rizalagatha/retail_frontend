<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import AppDataTable from '@/components/AppDataTable.vue';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = '26';

// --- Interfaces ---
interface SoHeader {
  Nomor: string;
  Tanggal: string;
  Dateline: string;
  Status: string;
  StatusKirim: string;
  Aktif: string;
  AlasanClose: string;
  [key: string]: unknown;
}

interface SoDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  QtySO: number;
  QtyInvoice: number;
  BlmJadiInvoice: number;
  Nomor: string;
  Harga: number;
  TotalSO: number;
}

// --- State ---
const list = ref<SoHeader[]>([]);
const details = ref<{ [key: string]: SoDetail[] }>({});
const isLoading = ref(true);
const selected = ref<SoHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const isMounted = ref(false);
const cabangList = ref([]);
const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
  status: null as string | null,
});

// State untuk Dialog
const isCloseDialogVisible = ref(false);
const itemToClose = ref<SoHeader | null>(null);
const closeReason = ref('');
const isConfirmDeleteVisible = ref(false);
const itemToDelete = ref<SoHeader | null>(null);

// State untuk Filter Kustom
const filterOptions = ref([
  { title: 'Nomor', value: 'Nomor' },
  { title: 'Penawaran', value: 'Penawaran' },
  { title: 'Nama Customer', value: 'Nama' },
  { title: 'Keterangan', value: 'Keterangan' },
  { title: 'Sales Counter', value: 'SC' },
]);
const selectedFilterField = ref('Nama');
const filterSearchValue = ref('');

// --- Computed Properties ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);

const filteredList = computed(() => {
  if (!filterSearchValue.value) {
    return list.value;
  }
  return list.value.filter(item => {
    const itemValue = item[selectedFilterField.value];
    if (itemValue !== null && itemValue !== undefined) {
      return itemValue.toString().toLowerCase().includes(filterSearchValue.value.toLowerCase());
    }
    return false;
  });
});

const headers = [
  { title: 'Nomor', key: 'Nomor', width: '180px', fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: '120px' },
  { title: 'Dateline', key: 'Dateline', width: '120px' },
  { title: 'Penawaran', key: 'Penawaran', width: '180px' },
  { title: 'TOP', key: 'Top', align: 'end' },
  { title: 'Nominal', key: 'Nominal', align: 'end', width: '150px' },
  { title: 'Diskon', key: 'Diskon', align: 'end' },
  { title: 'DP', key: 'Dp', align: 'end' },
  { title: 'Qty SO', key: 'QtySO', align: 'end' },
  { title: 'Qty Inv', key: 'QtyInv', align: 'end' },
  { title: 'Belum', key: 'Belum', align: 'end' },
  { title: 'Status', key: 'Status', width: '150px' },
  { title: 'Alasan Close', key: 'AlasanClose', width: '250px' },
  { title: 'Status Kirim', key: 'StatusKirim', width: '150px' },
  { title: 'Kd Customer', key: 'kdcus', width: '120px' },
  { title: 'Nama Customer', key: 'Nama', width: '250px' },
  { title: 'Alamat', key: 'Alamat', width: '600px' },
  { title: 'Kota', key: 'Kota', width: '150px' },
  { title: 'Level', key: 'Level', width: '150px' },
  { title: 'Keterangan', key: 'Keterangan', width: '300px' },
  { title: 'Aktif', key: 'Aktif', align: 'center' },
  { title: 'Sales Counter', key: 'SC', width: '150px' },
] as const;

const detailHeaders = [
  { title: 'Nomor', key: 'Nomor', width: '120px' },
  { title: 'Kode', key: 'Kode', width: '100px' },
  { title: 'Barcode', key: 'Barcode', width: '120px' },
  { title: 'Nama Barang', key: 'Nama', width: '200px' },
  { title: 'Ukuran', key: 'Ukuran', width: '70px' },
  { title: 'Qty SO', key: 'QtySO', align: 'end', width: '80px' },
  { title: 'Harga', key: 'Harga', align: 'end', width: '100px' },
  { title: 'Total SO', key: 'TotalSO', align: 'end', width: '120px' },
  { title: 'Qty Invoice', key: 'QtyInvoice', align: 'end', width: '100px' },
  { title: 'Belum Jadi Inv', key: 'BlmJadiInvoice', align: 'end', width: '120px' },
] as const;

// --- Methods ---

const fetchCabangList = async () => {
  try {
    const response = await api.get('/so/lookup/cabang');
    cabangList.value = response.data;
  } catch {
    toast.error('Gagal memuat daftar cabang.');
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/so', {
      params: filters // <-- KIRIM SELURUH OBJEK FILTERS
    });
    list.value = response.data;
  } catch {
    toast.error('Gagal memuat data Surat Pesanan.');
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: SoHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/so/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    // Hapus dari daftar expanded jika gagal
    expanded.value = expanded.value.filter(nomor => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const openCloseDialog = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Status === 'CLOSE' || item.Status === 'DICLOSE') {
    toast.warning('SO ini sudah berstatus Close.');
    return;
  }
  itemToClose.value = item;
  closeReason.value = item.AlasanClose || '';
  isCloseDialogVisible.value = true;
};

// Di file: src/views/SoView.vue

const submitClose = async () => {
  if (!itemToClose.value) return;
  try {
    await api.post('/so/close', {
      nomor: itemToClose.value.Nomor,
      alasan: closeReason.value,
      user: authStore.user.kode, // Kirim data user untuk audit
    });
    toast.success('SO berhasil ditutup.');
    isCloseDialogVisible.value = false;

    // Perbarui status item yang dipilih di frontend secara langsung
    const itemInList = list.value.find(item => item.Nomor === itemToClose.value.Nomor);
    if (itemInList) {
      itemInList.Status = 'DICLOSE';
      itemInList.AlasanClose = closeReason.value;
    }

    selected.value = [];
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message || 'Gagal menutup SO.');
    } else if (typeof error === 'object' && error !== null && 'response' in error) {
      const e = error as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menutup SO.');
    } else {
      toast.error('Gagal menutup SO.');
    }
  }
};

const showDeleteConfirmation = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];

  // Validasi status di frontend untuk feedback cepat
  if (item.Status !== 'OPEN') {
    toast.warning(`SO dengan status "${item.Status}" tidak bisa dihapus.`);
    return;
  }

  itemToDelete.value = item;
  isConfirmDeleteVisible.value = true;
};

const executeDelete = async () => {
  if (!itemToDelete.value) return;
  try {
    await api.delete(`/so/${itemToDelete.value.Nomor}`);
    toast.success(`Surat Pesanan ${itemToDelete.value.Nomor} berhasil dihapus.`);
    fetchData();
    selected.value = [];
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message || 'Gagal menghapus data.');
    } else if (typeof error === 'object' && error !== null && 'response' in error) {
      const e = error as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menghapus data.');
    } else {
      toast.error('Gagal menghapus data.');
    }
  } finally {
    isConfirmDeleteVisible.value = false;
    itemToDelete.value = null;
  }
};

const getRowTextColor = (item: SoHeader) => {
  // Prioritas utama adalah status pasif
  if (item.Aktif === 'N') {
    return 'text-grey'; // Abu-abu
  }
  // Logika pewarnaan berdasarkan Status dan StatusKirim
  switch (item.Status) {
    case 'OPEN':
      return 'text-red font-weight-bold'; // Merah
    case 'PROSES':
      return item.StatusKirim === 'SEBAGIAN' ? 'text-purple font-weight-bold' : 'text-blue font-weight-bold'; // Magenta / Biru
    case 'JADI':
      return 'text-green-darken-2 font-weight-bold'; // Hijau Tua
    default:
      return ''; // Warna default untuk 'CLOSE', 'DICLOSE'
  }
};

const getStatusChip = (status: string) => {
  switch (status) {
    case 'OPEN': return { color: 'red', text: 'Open' };
    case 'PROSES': return { color: 'navy', text: 'Proses' };
    case 'JADI': return { color: 'olive', text: 'Jadi' };
    case 'CLOSE':
    case 'DICLOSE':
      return { color: 'grey-darken-1', text: 'Close' };
    default: return { color: 'grey', text: status };
  }
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];

  // Validasi dari Delphi
  if (item.Aktif === 'N') {
    toast.warning('No. Pesanan tersebut pasif. Tidak bisa dicetak.');
    return;
  }

  const url = router.resolve({
    name: 'Cetak Surat Pesanan',
    params: { nomor: item.Nomor }
  }).href;
  window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  const exportFilters = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    cabang: filters.cabang,
  };

  try {
    if (type === 'header') {
      if (list.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');

      toast.info('Membuat file Excel Header...');
      const worksheet = XLSX.utils.json_to_sheet(list.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SO Header");
      XLSX.writeFile(workbook, "Export_SO_Header.xlsx");
      toast.success('File Header berhasil dibuat.');

    } else if (type === 'detail') {
      toast.info('Mengambil data detail dari server...');
      const response = await api.get('/so/export-details', { params: exportFilters });

      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor.');

      toast.info('Membuat file Excel Detail...');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SO Detail");
      XLSX.writeFile(workbook, "Export_SO_Detail.xlsx");
      toast.success('File Detail berhasil dibuat.');
    }
  } catch {
    toast.error('Gagal mengekspor data.');
  }
};

onMounted(async () => { // <-- Jadikan async
  if (hasViewPermission.value) {
    // 1. Baca query parameter dari URL
    const queryStartDate = route.query.startDate as string;
    const queryEndDate = route.query.endDate as string;
    const queryStatus = route.query.status as string;

    // 2. Jika ada, timpa filter default
    if (queryStartDate && queryEndDate) {
      filters.startDate = queryStartDate;
      filters.endDate = queryEndDate;
    }
    if (queryStatus) {
      filters.status = queryStatus; // <-- Simpan status
    }

    // 3. Panggil load awal
    await fetchCabangList();
    await fetchData(); // Panggil sekali setelah filter di-set

    // 4. Aktifkan watch
    isMounted.value = true;
  }
});

watch(filters, () => {
  if (isMounted.value && hasViewPermission.value) {
    fetchData();
  }
}, { deep: true });
</script>

<template>
  <PageLayout title="Surat Pesanan" desktop-mode icon="mdi-file-document-multiple-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/surat-pesanan/new')">
        Baru
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="router.push(`/transaksi/penjualan/surat-pesanan/ubah/${selected[0].Nomor}`)">
        Ubah
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="showDeleteConfirmation">Hapus</v-btn>
      <v-btn v.if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="printData">Cetak</v-btn>
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
      <v-divider vertical class="mx-2"></v-divider>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" color="orange-darken-2"
        @click="openCloseDialog">Close SO</v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Periode:</span>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
        <span class="mx-2">s/d</span>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
        <span class="filter-label ms-4">Cabang:</span>
        <v-select v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" />

        <v-divider vertical class="mx-2"></v-divider>
        <div class="d-flex align-center ga-2">
          <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan" density="compact"
            hide-details variant="outlined" style="max-width: 180px;" />
          <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details variant="outlined"
            style="min-width: 250px;" clearable prepend-inner-icon="mdi-magnify" />
        </div>
        <v-chip v-if="filters.status" class="ms-4" color="primary" variant="tonal" closable
          @click:close="filters.status = null">
          Status: {{ filters.status === 'open' ? 'Open' : filters.status }}
        </v-chip>

        <v-spacer />
        <div class="legend-group">
          <div class="legend-item"><v-icon color="red" size="small">mdi-circle-medium</v-icon>Open</div>
          <div class="legend-item"><v-icon color="blue" size="small">mdi-circle-medium</v-icon>Proses</div>
          <div class="legend-item"><v-icon color="purple" size="small">mdi-circle-medium</v-icon>Kirim
            Sebagian</div>
          <div class="legend-item"><v-icon color="green-darken-2" size="small">mdi-circle-medium</v-icon>Jadi
          </div>
          <div class="legend-item"><v-icon color="grey" size="small">mdi-circle-medium</v-icon>Pasif</div>
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" :headers="headers" :items="filteredList" :loading="isLoading"
          :item-class="getRowTextColor" item-value="Nomor" density="compact" class="desktop-table" fixed-header
          show-select return-object show-expand @update:expanded="loadDetails">
          <template v-for="header in headers" #[`item.${header.key}`]="{ item }" :key="header.key">
            <td :class="getRowTextColor(item)">
              <template v-if="['Tanggal', 'Dateline'].includes(header.key)">
                {{
                  item[header.key]
                    ? format(parseISO(item[header.key] as string), 'dd/MM/yyyy')
                    : '-'
                }}
              </template>
              <template v-else-if="['Nominal', 'Diskon', 'Dp', 'QtySO', 'QtyInv', 'Belum'].includes(header.key)">
                {{ new Intl.NumberFormat('id-ID').format((item[header.key] as number) || 0) }}
              </template>
              <template v-else-if="header.key === 'Status'">
                <v-chip size="x-small" :color="getStatusChip(item.Status).color" variant="tonal">
                  {{ getStatusChip(item.Status).text }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'StatusKirim'">
                <v-chip size="x-small" :color="item.StatusKirim === 'BELUM' ? 'orange' : 'indigo'">
                  {{ item.StatusKirim }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'Aktif'">
                <v-chip size="x-small" :color="item.Aktif === 'Y' ? 'success' : 'grey'">
                  {{ item.Aktif === 'Y' ? 'Aktif' : 'Pasif' }}
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center py-2">Memuat
                      detail...</div>
                    <v-data-table v-else-if="details[item.Nomor]" :headers="detailHeaders" :items="details[item.Nomor]"
                      item-value="Kode" density="compact" class="detail-table" :items-per-page="-1">
                      <template #[`item.Nomor`]="{ item: detailItem }">
                        {{ detailItem.Nomor }}
                      </template>
                      <template #[`item.Harga`]="{ item: detailItem }">
                        {{ new Intl.NumberFormat('id-ID').format(detailItem.Harga as number ||
                          0) }}
                      </template>
                      <template #[`item.TotalSO`]="{ item: detailItem }">
                        {{ new Intl.NumberFormat('id-ID').format(detailItem.TotalSO as number ||
                          0) }}
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-2">
                      Tidak ada data detail untuk nomor ini.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isConfirmDeleteVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>Anda yakin ingin menghapus Surat Pesanan: <strong>{{ itemToDelete?.Nomor
        }}</strong>?</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="isConfirmDeleteVisible = false">Batal</v-btn>
          <v-btn color="error" @click="executeDelete">Ya, Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">Isi Alasan Close SO</v-card-title>
        <v-card-text class="pa-4">
          <p class="text-caption mb-2">Anda akan menutup SO Nomor: <strong>{{ itemToClose?.Nomor }}</strong>
          </p>
          <v-textarea v-model="closeReason" label="Alasan" rows="3" variant="outlined" autofocus></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="primary" @click="submitClose">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Kelas-kelas ini sekarang akan memberi warna pada teks */
.status-open {
  color: red !important;
}

.status-proses {
  color: navy !important;
}

.status-proses-sebagian {
  color: fuchsia !important;
}

.status-jadi {
  color: olive !important;
}

/* Styling untuk legend box */
.legend-group {
  display: flex;
  gap: 1rem;
  font-size: 10px;
  align-items: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.color-box {
  width: 12px;
  height: 12px;
  border: 1px solid #ccc;
}

.detail-table .v-data-table__td {
  white-space: nowrap;
  /* Mencegah teks wrapping */
  overflow: hidden;
  /* Menyembunyikan overflow */
  text-overflow: ellipsis;
  /* Menambahkan elipsis jika teks terpotong */
  padding-inline: 4px !important;
  /* Kurangi padding horizontal */
}

/* Override lebar header kolom */
.detail-table .v-data-table__th {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-inline: 4px !important;
  /* Kurangi padding horizontal */
  font-size: 0.75rem !important;
  /* Kecilkan ukuran font header */
}

/* Paksa lebar kolom pada thead dan tbody */
.detail-table table>thead>tr>th:nth-child(1),
.detail-table table>tbody>tr>td:nth-child(1) {
  width: 120px;
  min-width: 120px;
  max-width: 120px;
}

/* Nomor */
.detail-table table>thead>tr>th:nth-child(2),
.detail-table table>tbody>tr>td:nth-child(2) {
  width: 120px;
  min-width: 120px;
  max-width: 120px;
}

/* Barcode */
.detail-table table>thead>tr>th:nth-child(3),
.detail-table table>tbody>tr>td:nth-child(3) {
  width: 100px;
  min-width: 100px;
  max-width: 100px;
}

/* Kode */
.detail-table table>thead>tr>th:nth-child(4),
.detail-table table>tbody>tr>td:nth-child(4) {
  width: 200px;
  min-width: 200px;
  max-width: 200px;
}

/* Nama Barang */
.detail-table table>thead>tr>th:nth-child(5),
.detail-table table>tbody>tr>td:nth-child(5) {
  width: 70px;
  min-width: 70px;
  max-width: 70px;
}

/* Ukuran */
.detail-table table>thead>tr>th:nth-child(6),
.detail-table table>tbody>tr>td:nth-child(6) {
  width: 80px;
  min-width: 80px;
  max-width: 80px;
}

/* Qty SO */
.detail-table table>thead>tr>th:nth-child(7),
.detail-table table>tbody>tr>td:nth-child(7) {
  width: 100px;
  min-width: 100px;
  max-width: 100px;
}

/* Harga */
.detail-table table>thead>tr>th:nth-child(8),
.detail-table table>tbody>tr>td:nth-child(8) {
  width: 120px;
  min-width: 120px;
  max-width: 120px;
}

/* Total SO */
.detail-table table>thead>tr>th:nth-child(9),
.detail-table table>tbody>tr>td:nth-child(9) {
  width: 100px;
  min-width: 100px;
  max-width: 100px;
}

/* Qty Invoice */
.detail-table table>thead>tr>th:nth-child(10),
.detail-table table>tbody>tr>td:nth-child(10) {
  width: 120px;
  min-width: 120px;
  max-width: 120px;
}

/* Belum Jadi Inv */
.v-data-table.detail-table {
  max-width: fit-content;
  margin-inline: auto;
  background-color: transparent !important;
}

.table-container {
  position: relative;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

/* Wrapper untuk table dengan sticky scrollbar */
:deep(.desktop-table .v-table__wrapper) {
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(100vh - 280px);
}

/* Sticky horizontal scrollbar */
:deep(.desktop-table .v-table__wrapper)::-webkit-scrollbar {
  height: 12px;
}

:deep(.desktop-table .v-table__wrapper)::-webkit-scrollbar-track {
  background: #f1f1f1;
}

:deep(.desktop-table .v-table__wrapper)::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 6px;
}

:deep(.desktop-table .v-table__wrapper)::-webkit-scrollbar-thumb:hover {
  background: #555;
}

:deep(.desktop-table thead th) {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: white;
}

/* Alternatif: Sticky scrollbar menggunakan wrapper tambahan */
.table-container::after {
  content: '';
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  height: 12px;
  background: transparent;
  pointer-events: none;
  z-index: 12;
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
import { useRoute } from 'vue-router';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface OfferDetail {
  nomor: string;
  tanggal: string;
  cus_nama: string;
  nama_barang: string;
  qty: number;
  harga: number;
  diskon: number;
  total: number;
  [key: string]: unknown; // Optional, jika ada field lain yang tidak pasti
}

interface OfferItem {
  nomor: string;
  [key: string]: unknown; // opsional, kalau ada field lain
}

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = '42';

interface OfferHeader {
  nomor: string;
  tanggal: string;
  noSO: string;
  top: number;
  tempo: string;
  ppn: number;
  'disc%': number;
  diskon: number;
  nominal: number;
  kdcus: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  level: string;
  keterangan: string;
  alasan: string;
  created: string;
  alasanClose: string;
  noINV: string;
}

interface OfferDetail {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  qty: number;
  harga: number;
  diskon: number;
  total: number;
}

interface Branch {
  kode: string;
  nama: string;
}

// --- State ---
const offerList = ref<OfferHeader[]>([]);
const filterOptions = ref([
  { title: 'Nomor', value: 'nomor' },
  { title: 'Tanggal', value: 'tanggal' },
  { title: 'No. SO', value: 'noSO' },
  { title: 'TOP', value: 'top' },
  { title: 'Tgl Tempo', value: 'tempo' },
  { title: 'PPN', value: 'ppn' },
  { title: 'Disc %', value: 'disc%' },
  { title: 'Diskon', value: 'diskon' },
  { title: 'Nominal', value: 'nominal' },
  { title: 'Kode Customer', value: 'kdcus' },
  { title: 'Nama Customer', value: 'nama' },
  { title: 'Alamat', value: 'alamat' },
  { title: 'Kota', value: 'kota' },
  { title: 'Telepon', value: 'telp' },
  { title: 'Level', value: 'level' },
  { title: 'Keterangan', value: 'keterangan' },
  { title: 'Alasan Close', value: 'alasan' },
  { title: 'User', value: 'created' },
  { title: 'Status', value: 'status' },
]);
const isMounted = ref(false);
const selectedFilterField = ref('nomor'); // Filter default
const filterSearchValue = ref('');
const details = ref<{ [key: string]: OfferDetail[] }>({});
const isLoading = ref(true);
const expanded = ref<OfferHeader[]>([]);
const selected = ref<OfferHeader[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const branchList = ref<Branch[]>([]);
const isCloseDialogVisible = ref(false);
const closeReason = ref('');
const isClosing = ref(false);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const dialogDelete = ref(false);
const itemToDelete = ref<OfferHeader | null>(null);

const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
});

const tableHeaders = [
  { title: 'Nomor', key: 'nomor', width: '150px', fixed: true },
  { title: 'Tanggal', key: 'tanggal', width: '100px' },
  { title: 'No. SO', key: 'noSO', width: '150px' },
  { title: 'TOP', key: 'top', align: 'center', width: '70px' },
  { title: 'Tgl Tempo', key: 'tempo', width: '100px' },
  { title: 'PPN', key: 'ppn', align: 'end', width: '100px' },
  { title: 'Disc %', key: 'disc%', align: 'end', width: '80px' },
  { title: 'Diskon', key: 'diskon', align: 'end', width: '100px' },
  { title: 'Nominal', key: 'nominal', align: 'end', width: '120px' },
  { title: 'Kode Customer', key: 'kdcus', width: '120px' },
  { title: 'Nama Customer', key: 'nama', width: '250px' },
  { title: 'Alamat', key: 'alamat' },
  { title: 'Kota', key: 'kota', width: '150px' },
  { title: 'Telepon', key: 'telp', width: '120px' },
  { title: 'Level', key: 'level', width: '150px' },
  { title: 'Keterangan', key: 'keterangan', width: '250px' },
  { title: 'Alasan Close', key: 'alasan', width: '250px' },
  { title: 'User', key: 'created', width: '120px' },
  { title: 'Status', key: 'status', align: 'center', width: '120px' },
] as const;

const detailHeaders = [
  { title: 'Kode', key: 'kode' },
  { title: 'Barcode', key: 'barcode' },
  { title: 'Nama Barang', key: 'Nama' },
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'Qty', key: 'qty', align: 'end' },
  { title: 'Harga', key: 'harga', align: 'end' },
  { title: 'Diskon', key: 'diskon', align: 'end' },
  { title: 'Total', key: 'total', align: 'end' },
] as const;

const isSingleSelected = computed(() => selected.value.length === 1);
const canBeClosed = computed(() => {
  if (!isSingleSelected.value) return false;
  const selectedOffer = selected.value[0];
  // Tombol aktif hanya jika penawaran belum jadi SO dan belum punya alasan (status Open)
  return !selectedOffer.noSO && !selectedOffer.alasan;
});

const filteredOffers = computed(() => {
  // Jika tidak ada data asli atau tidak ada kata kunci, tampilkan semua
  if (!offerList.value || !filterSearchValue.value) {
    return offerList.value;
  }

  // Lakukan filter berdasarkan field yang dipilih dan kata kunci
  return offerList.value.filter(item => {
    const itemValue = item[selectedFilterField.value];
    if (itemValue) {
      return itemValue.toString().toLowerCase().includes(filterSearchValue.value.toLowerCase());
    }
    return false;
  });
});

// --- Methods ---
const fetchBranches = async () => {
  try {
    // Perbaikan: Panggil endpoint yang benar
    const response = await api.get('/warehouses/list', {
      params: { userCabang: authStore.user?.cabang }
    });
    branchList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.', error);
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/offers', {
      params: {
        // --- UBAH BAGIAN INI ---
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang: filters.cabang
        // -----------------------
      }
    });
    offerList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data penawaran.', error);
  } finally {
    isLoading.value = false;
  }
};

// Method yang diperbaiki untuk load details
const loadDetails = async (expandedItems: OfferHeader[]) => {

  // Extract nomor dari expanded items
  const expandedNomors = expandedItems.map(item => item.nomor);

  // Cari item yang baru di-expand (belum punya detail)
  for (const nomor of expandedNomors) {


    if (!details.value[nomor] && !loadingDetails.value.has(nomor)) {
      loadingDetails.value.add(nomor);

      try {
        const url = `/offers/${nomor}`;
        const response = await api.get(url);

        // Update details dengan spread operator untuk trigger reactivity
        details.value = {
          ...details.value,
          [nomor]: response.data
        };
      } catch (error) {
        console.error(`Error loading detail for ${nomor}:`, error);
        toast.error(`Gagal memuat detail untuk nomor ${nomor}`);
        // Remove dari expanded jika gagal load
        expanded.value = expanded.value.filter(item =>
          typeof item === 'string' ? item !== nomor : item.nomor !== nomor
        );
      } finally {
        loadingDetails.value.delete(nomor);
      }
    } else {
    }
  }
};

const editOffer = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].nomor;
  router.push(`/transaksi/penjualan/penawaran/ubah/${nomor}`);
};

const deleteOffer = async (item: OfferHeader) => {
  if (item.noSO || item.alasan) {
    toast.warning('Penawaran yang sudah menjadi SO atau ditutup tidak bisa dihapus.');
    return;
  }
  try {
    await api.delete(`/offers/${item.nomor}`);
    toast.success('Penawaran berhasil dihapus.');
    fetchData();
    selected.value = [];
  } catch (error) {
    toast.error('Gagal menghapus penawaran.', error);
  }
};

const confirmDelete = () => {
  if (!isSingleSelected.value) return;
  itemToDelete.value = selected.value[0];
  dialogDelete.value = true;
};

const deleteConfirmed = () => {
  if (itemToDelete.value) {
    deleteOffer(itemToDelete.value);
  }
  dialogDelete.value = false;
  itemToDelete.value = null;
};

const openCloseDialog = () => {
  if (!canBeClosed.value) return; // Validasi tambahan
  closeReason.value = selected.value[0].alasan || ''; // Isi dengan alasan yang ada jika ada
  isCloseDialogVisible.value = true;
};

const submitCloseOffer = async () => {
  if (!closeReason.value) {
    toast.error('Alasan harus diisi.');
    return;
  }
  isClosing.value = true;
  try {
    const nomor = selected.value[0].nomor;
    await api.post('/offers/close', {
      nomor,
      alasan: closeReason.value,
    });
    toast.success('Penawaran berhasil ditutup.');
    isCloseDialogVisible.value = false;
    fetchData(); // Muat ulang data untuk melihat status baru
    selected.value = []; // Kosongkan seleksi
  } catch (error) {
    toast.error('Gagal menutup penawaran.', error);
  } finally {
    isClosing.value = false;
  }
};

const exportHeaderData = () => {
  if (offerList.value.length === 0) {
    toast.warning('Tidak ada data header untuk diekspor.');
    return;
  }
  const worksheet = XLSX.utils.json_to_sheet(offerList.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Penawaran Header");
  XLSX.writeFile(workbook, "DaftarPenawaran_Header.xlsx");
  toast.success('Data header berhasil diekspor.');
};

const exportDetailData = async () => {
  toast.info('Menyiapkan data detail untuk diekspor...');
  try {
    const cabang = authStore.user?.cabang || '';
    const response = await api.get<OfferDetail[]>('/offers/export-details', {
      params: {
        startDate: filters.startDate, // <-- Ubah ini
        endDate: filters.endDate,   // <-- Ubah ini
        cabang
      }
    });
    const dataToExport = response.data;

    if (dataToExport.length === 0) {
      toast.warning('Tidak ada data detail untuk diekspor pada periode ini.');
      return;
    }

    // 1. Siapkan Judul dan Header
    const title = "FORM PENAWARAN";
    const dateRange = `Periode : ${format(new Date(filters.startDate), 'dd/MM/yyyy')} s/d ${format(new Date(filters.endDate), 'dd/MM/yyyy')}`;
    const tableHeaders = Object.keys(dataToExport[0]);

    // 2. Ubah data JSON menjadi array of arrays
    const tableData = dataToExport.map((row: OfferDetail) => Object.values(row));

    // 3. Gabungkan semua bagian menjadi satu array besar
    const excelData = [
      [title],
      [dateRange],
      [], // Baris kosong sebagai spasi
      tableHeaders,
      ...tableData
    ];

    // 4. Buat worksheet menggunakan aoa_to_sheet
    const ws = XLSX.utils.aoa_to_sheet(excelData);

    // 5. Atur penggabungan sel (merge)
    const merge = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } }, // Judul
      { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } }, // Rentang tanggal
    ];
    ws['!merges'] = merge;

    // (Opsional) Atur lebar kolom agar lebih rapi
    const colWidths = tableHeaders.map(header => ({ wch: header.length + 5 }));
    ws['!cols'] = colWidths;

    // 6. Buat workbook dan unduh file
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, "Detail Penawaran");

    XLSX.writeFile(workbook, "DetailPenawaran.xlsx");
    toast.success('Data detail berhasil diekspor.');

  } catch (error) {
    toast.error('Gagal mengekspor data detail.', error);
    console.error("Export detail error:", error);
  }
};

const printData = (item: OfferItem) => {
  if (!item || !item.nomor) {
    toast.error('Silakan pilih satu data untuk dicetak.');
    return;
  }

  const url = router.resolve({
    name: 'Cetak Penawaran',
    params: { nomor: item.nomor }
  }).href;

  window.open(url, '_blank');
};

const getRowTextColor = (item: OfferHeader) => {
  // Merah jika belum jadi SO dan belum ditutup (status Open)
  if (!item.noSO && !item.alasan) {
    return 'text-red font-weight-bold';
  }
  // Biru jika tidak jadi SO (ditutup dengan alasan)
  if (!item.noSO && item.alasan) {
    return 'text-blue font-weight-bold';
  }
  // Warna default untuk yang sudah jadi SO atau status lain
  return '';
};

const getStatusChip = (item: OfferHeader) => {
  if (item.noSO) return { text: 'Sudah Jadi SO', color: 'success' };
  if (item.alasan) return { text: 'Closed', color: 'blue-grey' };
  return { text: 'Open', color: 'grey' };
};

onMounted(async () => { // <-- Jadikan async
  if (hasViewPermission.value) {
    // 1. Baca query parameter dari URL
    const queryStartDate = route.query.startDate as string;
    const queryEndDate = route.query.endDate as string;

    // 2. Jika ada, timpa filter default (Asumsi 'filters' ada)
    if (queryStartDate && queryEndDate) {
      filters.startDate = queryStartDate;
      filters.endDate = queryEndDate;
    }

    // 3. Panggil fungsi load awal Anda
    await fetchBranches();
    await fetchData(); // Panggil fetchData SEKALI dengan filter yang benar

    // 4. Aktifkan watcher HANYA SETELAH load awal selesai
    isMounted.value = true;

  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});

// Watcher untuk expanded items sebagai backup
watch(expanded, (newExpanded) => {
  if (newExpanded.length > 0) {
    loadDetails(newExpanded);
  }
}, { deep: true });

watch(() => filters.cabang, () => {
  // Hanya panggil fetchData jika halaman SUDAH dimuat
  if (isMounted.value && hasViewPermission.value) {
    fetchData();
  }
});

// PS: Anda mungkin juga ingin menambahkan watch untuk tanggal jika diperlukan
watch(() => [filters.startDate, filters.endDate], () => {
  if (isMounted.value && hasViewPermission.value) {
    fetchData();
  }
});
</script>

<template>
  <PageLayout title="Penawaran">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/penawaran/new')">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="editOffer">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="confirmDelete">Hapus</v-btn>
      <v-btn size="small" color="green" prepend-icon="mdi-printer" @click="printData(selected[0])"
        :disabled="selected.length !== 1">
        Cetak
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" prepend-icon="mdi-file-excel"
        @click="exportHeaderData">Export Header</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" prepend-icon="mdi-file-download-outline"
        @click="exportDetailData">Export Detail</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!canBeClosed" color="blue"
        prepend-icon="mdi-lock-outline" @click="openCloseDialog">Close Penawaran</v-btn>
    </template>

    <div v-if="!hasViewPermission" class="text-center pa-8 text-grey">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p class="body-1 mt-2">Anda tidak memiliki izin untuk melihat data ini.</p>
    </div>

    <div v-else class="browse-content">
      <!-- Filter Section -->
      <div class="filter-section">
        <div class="d-flex align-center ga-2">
          <span class="filter-label">Periode:</span>
          <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
            style="min-width: 130px;"></v-text-field>
          <span>s/d</span>
          <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
            style="min-width: 130px;"></v-text-field>
        </div>
        <div class="d-flex align-center ga-2" style="min-width: 220px;">
          <span class="filter-label">Cabang:</span>
          <v-select v-model="filters.cabang" :items="branchList" item-title="nama" item-value="kode" density="compact"
            hide-details variant="outlined" style="max-width: 180px;"
            :menu-props="{ class: 'compact-select-list' }"></v-select>
        </div>
        <v-divider vertical class="mx-2"></v-divider>
        <div class="d-flex align-center ga-2">
          <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan" density="compact"
            hide-details variant="outlined" style="max-width: 180px;"></v-select>
          <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details variant="outlined"
            style="min-width: 250px;" clearable prepend-inner-icon="mdi-magnify"></v-text-field>
        </div>
        <v-spacer></v-spacer>
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Open
          <v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> Tidak Jadi SO
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <!-- Table Section -->
      <div class="table-container">
        <AppDataTable v-model="selected" :headers="tableHeaders" :items="filteredOffers" :loading="isLoading"
          item-value="nomor" density="compact" class="desktop-table" fixed-header show-select return-object show-expand
          @update:expanded="loadDetails">
          <template v-for="header in tableHeaders" #[`item.${header.key}`]="{ item }" :key="header.key">
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'tanggal' || header.key === 'tempo'">
                {{ item[header.key] ? format(new Date(item[header.key]), 'dd/MM/yyyy') : '-' }}
              </template>
              <template v-else-if="header.key === 'nominal'">
                {{ new Intl.NumberFormat('id-ID').format(item.nominal) }}
              </template>
              <template v-else-if="header.key === 'status'">
                <v-chip :color="getStatusChip(item).color" variant="tonal" size="x-small">
                  {{ getStatusChip(item).text }}
                </v-chip>
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>
          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center py-2">
                      <v-progress-circular indeterminate size="20" class="mr-2"></v-progress-circular>
                      <span class="text-caption">Memuat detail...</span>
                    </div>
                    <v-data-table v-else-if="details[item.nomor] && details[item.nomor].length > 0"
                      :headers="detailHeaders" :items="details[item.nomor]" density="compact" hide-default-footer
                      :items-per-page="-1" class="detail-table">
                      <template #[`item.harga`]="{ item: detailItem }">
                        {{ new Intl.NumberFormat('id-ID').format(detailItem.harga) }}
                      </template>
                      <template #[`item.diskon`]="{ item: detailItem }">
                        {{ new Intl.NumberFormat('id-ID').format(detailItem.diskon) }}
                      </template>
                      <template #[`item.total`]="{ item: detailItem }">
                        {{ new Intl.NumberFormat('id-ID').format(detailItem.total) }}
                      </template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <!-- Dialog untuk Close Penawaran -->
    <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
      <v-card>
        <v-card-title>
          <span class="text-h5">Isi Alasan Close Penawaran</span>
        </v-card-title>
        <v-card-text>
          <v-textarea v-model="closeReason" label="Alasan" rows="3" variant="outlined" autofocus
            :rules="[v => !!v || 'Alasan tidak boleh kosong']"></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="blue" :loading="isClosing" @click="submitCloseOffer">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- (8) Tambahkan Dialog Konfirmasi Hapus -->
    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text>Apakah Anda yakin ingin menghapus penawaran nomor <strong>{{ itemToDelete?.nomor
            }}</strong>?</v-card-text>
        <v-card-actions><v-spacer></v-spacer><v-btn @click="dialogDelete = false">Batal</v-btn><v-btn
            color="red-darken-1" variant="elevated"
            @click="deleteConfirmed">Hapus</v-btn><v-spacer></v-spacer></v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
:deep(.compact-select-list .v-list-item-title) {
  font-size: 11px !important;
}

:deep(.row-open td) {
  color: red !important;
}

:deep(.row-closed td) {
  color: blue !important;
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { format, subDays, parseISO, isValid } from 'date-fns';
import { useToast } from 'vue-toastification'; // Asumsi Anda menggunakan vue-toastification

// Tipe untuk data master QC
interface QCMaster {
  Nomor: string;
  Tanggal: string;
  NamaGudang: string;
  Keterangan: string;
  Kirim: number;
  Terima: number;
  Closing: 'Y' | 'N';
}

// Tipe untuk data detail QC
interface QCDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Jumlah: number;
  SudahTerima: number;
  no?: number; // nomor urut di tabel
}

// --- State Management & Inisialisasi ---
const toast = useToast();
const masterData = ref<QCMaster[]>([]);
const details = ref<Record<string, QCDetail[]>>({}); // Menyimpan detail yang sudah di-load
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<QCMaster[]>([]);
const expanded = ref<string[]>([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
});

// --- Computed Properties (Logika Turunan) ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<QCMaster | null>(() => isSingleSelected.value ? selected.value[0] : null);
const canEditOrDelete = computed(() => {
  if (!isSingleSelected.value) return false;
  // Logika dari Delphi: tidak bisa edit/hapus jika sudah closing
  return selectedRow.value?.Closing !== 'Y';
});

// --- Konfigurasi & Formatter Tabel ---
const formatTanggal = (dateString: string | undefined | null) => {
  if (!dateString) return '';
  const date = parseISO(dateString);
  return isValid(date) ? format(date, 'dd/MM/yyyy') : dateString;
};

const masterHeaders = [
  { title: 'Nomor', key: 'Nomor', minWidth: '160px', fixed: true },
  { title: 'Tanggal', key: 'Tanggal', minWidth: '120px' },
  { title: 'Gudang Tujuan', key: 'NamaGudang', minWidth: '150px' },
  { title: 'Keterangan', key: 'Keterangan', minWidth: '250px' },
  { title: 'Kirim', key: 'Kirim', align: 'end' },
  { title: 'Terima', key: 'Terima', align: 'end' },
  { title: 'Status', key: 'Close', align: 'center', minWidth: '100px' },
  { title: '', key: 'data-table-expand', fixed: true, sortable: false },
] as const;

const detailHeaders = [
  { title: 'No.', key: 'no', width: '60px' },
  { title: 'Kode Barang', key: 'Kode', minWidth: '150px' },
  { title: 'Nama Barang', key: 'Nama', minWidth: '300px' },
  { title: 'Ukuran', key: 'Ukuran' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end' },
  { title: 'Sudah Terima', key: 'SudahTerima', align: 'end' },
] as const;


// --- Methods (Aksi & Pengambilan Data) ---

const loadMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  details.value = {};
  try {
    masterData.value = await fetchQCMaster(filters);
  } catch (error) {
    toast.error('Gagal mengambil data master QC.');
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const loadDetails = async ({ item, value }: { item: QCMaster, value: boolean }) => {
  if (!value) return; // Hanya load saat expand, bukan collapse
  const nomor = item.Nomor;
  if (details.value[nomor] || loadingDetails.value.has(nomor)) return;

  loadingDetails.value.add(nomor);
  try {
    const detailData = await fetchQCDetails(nomor);
    details.value[nomor] = detailData.map((d, index) => ({ ...d, no: index + 1 }));
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomor}.`, error);
  } finally {
    loadingDetails.value.delete(nomor);
  }
};

// Kondisional styling untuk baris (pengganti cxGrdMasterStylesGetContentStyle)
const getRowProps = ({ item }: { item: QCMaster }) => {
  return {
    class: item.Closing === 'N' ? 'row-open-status' : ''
  };
};

// --- Tombol Aksi (CRUD) ---
const handleNew = () => {
  toast.info("Membuka form untuk menambah data QC baru...");
  // Di aplikasi nyata: router.push({ name: 'qcCreate' });
};

const handleEdit = () => {
  if (!canEditOrDelete.value || !selectedRow.value) return;
  toast.info(`Membuka form untuk mengubah data: ${selectedRow.value.Nomor}`);
  // Di aplikasi nyata: router.push({ name: 'qcEdit', params: { nomor: selectedRow.value.Nomor } });
};

const handleDelete = async () => {
  if (!canEditOrDelete.value || !selectedRow.value) return;
  const nomor = selectedRow.value.Nomor;
  if (confirm(`Yakin ingin hapus data nomor ${nomor}?`)) {
    try {
      await deleteQCRecord(nomor);
      toast.success(`Data ${nomor} berhasil dihapus.`);
      loadMasterData(); // Muat ulang data
    } catch (error) {
      toast.error(`Gagal menghapus data ${nomor}.`, error);
    }
  }
};

const handlePrint = () => {
  if (!isSingleSelected.value || !selectedRow.value) return;
  toast.info(`Mencetak data: ${selectedRow.value.Nomor}`);
  // Logika untuk membuka jendela cetak
};


// --- Lifecycle & Watchers ---
onMounted(loadMasterData);
watch(filters, loadMasterData, { deep: true });

</script>

<template>
  <div class="pa-4">
    <v-card flat>
      <v-card-title class="d-flex align-center pe-2">
        <v-icon icon="mdi-clipboard-check-outline" class="me-2"></v-icon>
        Browse Quality Control (QC)
        <v-spacer></v-spacer>
        <div class="d-flex ga-2">
          <v-btn size="small" color="primary" @click="handleNew">Baru</v-btn>
          <v-btn size="small" :disabled="!canEditOrDelete" @click="handleEdit">Ubah</v-btn>
          <v-btn size="small" color="error" :disabled="!canEditOrDelete" @click="handleDelete">Hapus</v-btn>
          <v-btn size="small" color="green" prepend-icon="mdi-printer" :disabled="!isSingleSelected"
            @click="handlePrint">
            Cetak
          </v-btn>
        </div>
      </v-card-title>

      <v-card-text class="d-flex align-center ga-2 py-2 filter-section">
        <label>Periode:</label>
        <input type="date" v-model="filters.startDate" class="date-input" />
        <label>s/d</label>
        <input type="date" v-model="filters.endDate" class="date-input" />
        <v-spacer></v-spacer>
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="orange" icon="mdi-square-rounded" size="small"></v-icon> Status Open
        </div>
        <v-btn @click="loadMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
      </v-card-text>

      <v-data-table v-model="selected" v-model:expanded="expanded" :headers="masterHeaders" :items="masterData"
        :loading="loading" item-value="Nomor" density="compact" class="elevation-1" fixed-header show-select
        return-object :item-props="getRowProps" @update:expanded="({ item, value }) => loadDetails({ item, value })">
        <template v-slot:[`item.Tanggal`]="{ item }">
          {{ formatTanggal(item['Tanggal']) }}
        </template>
        <template v-slot:[`item.Closing`]="{ item }">
          <v-chip :color="item['Closing'] === 'Y' ? 'success' : 'orange'" size="x-small">
            {{ item['Closing'] === 'Y' ? 'Closed' : 'Open' }}
          </v-chip>
        </template>

        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length">
              <div class="detail-container">
                <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">
                  <v-progress-circular indeterminate color="primary"></v-progress-circular>
                  <div class="text-caption mt-2">Memuat detail...</div>
                </div>
                <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor] || []" density="compact"
                  class="detail-table" :items-per-page="-1">
                  <template #bottom></template> </v-data-table>
              </div>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<style scoped>
.filter-section {
  background-color: #f7f7f7;
  border-bottom: 1px solid #e0e0e0;
}

.date-input {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 14px;
}

.detail-container {
  padding: 16px;
  background-color: #fafafa;
}

.detail-table {
  border: 1px solid #e0e0e0;
}

/* Style untuk baris dengan status 'Open' */
:deep(.row-open-status) {
  background-color: #FFFBE6 !important;
}

:deep(.row-open-status:hover) {
  background-color: #FFF3CD !important;
}
</style>

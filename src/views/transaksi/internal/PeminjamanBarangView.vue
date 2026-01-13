<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO, differenceInDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import AppDataTable from '@/components/AppDataTable.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface PeminjamanItem {
  idrec: string;
  nomor: string;
  tanggal: string;
  deadline: string;
  peminjam: string;
  statusEdit: 'WAIT' | 'ACC' | 'TOLAK' | '';
  statusKembali: 'Y' | 'N';
  userCreate: string;
  sisaHari?: number;
  noKembali?: string;
}

interface DetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}

interface PeminjamanItem {
  idrec: string;
  nomor: string;
  tanggal: string;
  deadline: string;
  peminjam: string; // Nama PIC
  statusEdit: "" | "WAIT" | "ACC" | "TOLAK";
  statusKembali: "Y" | "N";
  userCreate: string;
  sisaHari?: number; // Opsional karena ada tanda ?
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '56';

// --- State ---
const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
});

const loading = ref(true);
const masterData = ref<PeminjamanItem[]>([]);
const selected = ref<PeminjamanItem[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, DetailItem[]>>({});
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const headers = ref([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'nomor', width: 160, fixed: true },
  { title: 'No. Pengembalian', key: 'noKembali', width: 160 },
  { title: 'Store', key: 'store', width: 80 },
  { title: 'PIC Peminjam', key: 'pic', width: 150 },
  { title: 'Keterangan', key: 'keterangan', width: 200 },
  { title: 'Total Qty', key: 'totalQty', align: 'end', width: 100 },
  { title: 'Tanggal Pinjam', key: 'tanggal', width: 120 },
  { title: 'Deadline', key: 'deadline', width: 120 },
  { title: 'Sisa Hari', key: 'sisaHari', width: 100, align: 'center' },
  { title: 'Status ACC', key: 'statusEdit', align: 'center', width: 120 },
  { title: 'Sudah Kembali', key: 'statusKembali', align: 'center', width: 120 },
]);

const detailHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '120px' },
  { title: 'Nama Barang', key: 'nama', width: '350px' },
  { title: 'Ukuran', key: 'ukuran', width: '80px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '100px' },
] as const;

// --- Methods ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/peminjaman-barang', { params: filters });

    // Hitung aging sisa hari (Deadline - Hari Ini)
    masterData.value = response.data.map((item: PeminjamanItem) => {
      const deadline = parseISO(item.deadline);
      const sisa = differenceInDays(deadline, new Date());
      return { ...item, sisaHari: sisa };
    });
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data peminjaman.');
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: PeminjamanItem[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor));
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get('/peminjaman-barang/details', { params: { nomor: nomorToLoad } });
    details.value[nomorToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`, error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const getRowClass = (item: PeminjamanItem) => {
  if (item.statusKembali === 'Y') return 'text-green-darken-2 font-weight-medium'; // Hijau jika sudah beres
  if (item.sisaHari !== undefined && item.sisaHari < 0) return 'text-red-darken-4 font-weight-bold bg-red-lighten-5'; // Merah jika telat
  if (item.sisaHari !== undefined && item.sisaHari <= 3) return 'text-orange-darken-3 font-weight-bold'; // Oranye jika mepet
  return '';
};

// --- Actions ---
const handleNew = () => router.push({ path: '/transaksi/internal/peminjaman-barang/create' });

const handleDelete = () => {
  if (selected.value.length !== 1 || selected.value[0].statusEdit !== 'WAIT') {
    return toast.warning('Hanya data dengan status WAIT yang bisa dihapus.');
  }
  const nomor = selected.value[0].nomor;
  dialogConfirm.title = 'Konfirmasi Hapus';
  dialogConfirm.text = `Yakin menghapus peminjaman nomor <strong>${nomor}</strong>?`;
  dialogConfirm.onConfirm = async () => {
    try {
      await api.delete(`/peminjaman-barang/${nomor}`);
      toast.success('Peminjaman berhasil dihapus.');
      fetchMasterData();
    } catch (error) {
      toast.error('Gagal menghapus data.', error);
    }
  };
  dialogConfirm.show = true;
};

const handlePrint = () => {
  if (selected.value.length !== 1) return;
  const nomor = selected.value[0].nomor;

  // Membuka tab cetak
  const routeData = router.resolve({
    name: 'PeminjamanBarangPrint',
    params: { nomor: nomor }
  });
  window.open(routeData.href, '_blank');
};

const handleRowClick = (_event: MouseEvent, { item }: { item: PeminjamanItem }) => {
  // Pastikan ref 'selected' didefinisikan sebagai ref<PeminjamanItem[]>([])
  selected.value = [item];
};

onMounted(fetchMasterData);
</script>

<template>
  <PageLayout title="Monitoring Peminjaman Barang" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">Pinjam Baru</v-btn>
      <v-btn size="small" color="orange-darken-2" prepend-icon="mdi-keyboard-return"
        :disabled="selected.length !== 1 || selected[0].statusKembali === 'Y'"
        @click="router.push({ name: 'PeminjamanBarangReturn', params: { nomor: selected[0].nomor } })">
        Kembalikan
      </v-btn>
      <v-btn size="small" color="teal" prepend-icon="mdi-printer" @click="handlePrint"
        :disabled="selected.length !== 1">
        Cetak
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" prepend-icon="mdi-delete"
        @click="handleDelete" :disabled="selected.length !== 1">Hapus</v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label>Periode Pinjam:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 160px;" @change="fetchMasterData" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 160px;" @change="fetchMasterData" />
        <v-spacer />
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact"
          class="desktop-table header-browse-blue custom-highlight-table" fixed-header show-select show-expand
          single-select return-object @update:expanded="loadDetails" @click:row="handleRowClick">
          <template #[`item.nomor`]="{ item }">
            <span :class="getRowClass(item)">{{ item.nomor }}</span>
          </template>

          <template #[`item.noKembali`]="{ item }">
            <v-chip v-if="item.noKembali" size="x-small" color="green-darken-1" variant="flat" class="font-weight-bold">
              {{ item.noKembali }}
            </v-chip>
            <span v-else class="text-grey-lighten-1 text-caption">Belum Kembali</span>
          </template>

          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal), 'dd/MM/yyyy') }}
          </template>

          <template #[`item.deadline`]="{ item }">
            {{ format(parseISO(item.deadline), 'dd/MM/yyyy') }}
          </template>

          <template #[`item.sisaHari`]="{ item }">
            <v-chip v-if="item.statusKembali === 'N'" size="x-small"
              :color="item.sisaHari! < 0 ? 'red' : item.sisaHari! <= 3 ? 'orange' : 'grey'">
              {{ item.sisaHari }} Hari
            </v-chip>
            <v-icon v-else color="success" size="small">mdi-check-circle</v-icon>
          </template>

          <template #[`item.statusEdit`]="{ item }">
            <v-chip size="x-small"
              :color="item.statusEdit === 'ACC' ? 'green' : item.statusEdit === 'TOLAK' ? 'red' : 'blue'">
              {{ item.statusEdit }}
            </v-chip>
          </template>

          <template #[`item.statusKembali`]="{ item }">
            <v-icon :color="item.statusKembali === 'Y' ? 'success' : 'grey'" size="small">
              {{ item.statusKembali === 'Y' ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline' }}
            </v-icon>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container d-flex justify-start">
                  <div class="detail-table-wrapper">
                    <v-data-table v-if="details[item.nomor]" class="detail-table" :headers="detailHeaders"
                      :items="details[item.nomor]" density="compact" hide-default-footer fixed-header height="320"
                      :items-per-page="-1">
                      <template #[`item.jumlah`]="{ value }">
                        <div class="text-end font-weight-bold">{{ value }}</div>
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center pa-4 text-caption">Memuat detail...</div>
                  </div>
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
        <v-card-text class="pa-5 text-body-1 text-pre-line">
          {{ dialogConfirm.text }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya,
            Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.custom-highlight-table :deep(.v-data-table__tr--selected) {
  background-color: #E3F2FD !important;
  /* Biru muda saat dipilih */
}

.custom-highlight-table :deep(.v-data-table__tr:hover) {
  background-color: #F5F5F5 !important;
  /* Abu-abu saat hover */
  cursor: pointer;
}

.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
}

.filter-section {
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.table-container {
  flex-grow: 1;
  overflow: hidden;
}

.detail-container {
  padding: 12px;
  background-color: #f8f9fa;
  width: 100%;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  background: white;
}

.detail-table :deep(thead tr th) {
  background-color: #e3f2fd !important;
  /* Biru muda agar beda dengan header utama */
  color: #0d47a1 !important;
  font-size: 11px !important;
  height: 32px !important;
}

.text-pre-line {
  white-space: pre-line !important;
}
</style>

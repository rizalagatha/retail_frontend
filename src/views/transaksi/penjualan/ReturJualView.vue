<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import PrintOptionModal from '@/components/modal/PrintOptionModal.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from "axios";
import { formatRupiah } from "@/utils/formatRupiah";

// --- Tipe Data ---
interface MasterItem {
  nomor: string;
  tanggal: string;
  nominal: number;
  diBayarkan: number;
  sisa: number;
  invoice: string;
  jenis: string;
  keterangan: string;
  nama: string;
  closing: 'Y' | 'N';
}
interface DetailItem {
  kode: string;
  nama: string;
  rjd_ukuran: string;
  jumlah: number;
  harga: number;
  discPersen: number;
  diskon: number;
  total: number;
}
interface PaymentLinkItem {
  invoice: string;
  tanggal: string;
  nominal: number;
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '29';

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const paymentLinks = ref<Record<string, PaymentLinkItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const isPrintOptionVisible = ref(false);

const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

const canEdit = computed(() => {
  if (!isSingleSelected.value || !selectedRow.value) return false;
  // Paksa konversi ke Angka sebelum membandingkan
  return Number(selectedRow.value.diBayarkan) === 0;
});

const canDelete = computed(() => {
  if (!isSingleSelected.value || !selectedRow.value) return false;
  // Paksa konversi ke Angka dan cek status closing
  return Number(selectedRow.value.diBayarkan) === 0 && selectedRow.value.closing !== 'Y';
});

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'nomor', minWidth: '180px' },
  { title: 'Tanggal', key: 'tanggal', minWidth: '120px' },
  { title: 'Nominal', key: 'nominal', align: 'end' },
  { title: 'Dibayarkan', key: 'diBayarkan', align: 'end' },
  { title: 'Sisa', key: 'sisa', align: 'end' },
  { title: 'No. Invoice', key: 'invoice', minWidth: '180px' },
  { title: 'Jenis', key: 'jenis' },
  { title: 'Customer', key: 'nama' },
  { title: 'Keterangan', key: 'keterangan' },
  { title: 'Closing', key: 'closing', align: 'center' },
] as const;
const detailHeaders = [
  { title: 'Kode', key: 'kode' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'rjd_ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
  { title: 'Harga', key: 'harga', align: 'end' },
  { title: 'Disc %', key: 'discPersen', align: 'end' },
  { title: 'Diskon Rp', key: 'diskon', align: 'end' },
  { title: 'Total', key: 'total', align: 'end' },
] as const;
const paymentLinkHeaders = [
  { title: 'Invoice', key: 'invoice' },
  { title: 'Tanggal Bayar', key: 'tanggal' },
  { title: 'Nominal', key: 'nominal', align: 'end' },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
  try {
    // Ganti endpoint ke route yang baru saja kita buat
    const response = await api.get('/retur-jual/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.', error);
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/retur-jual', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.nomor]
  );
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const [detailsRes, paymentsRes] = await Promise.all([
      api.get(`/retur-jual/details/${nomorToLoad}`),
      api.get(`/retur-jual/payment-links/${nomorToLoad}`),
    ]);
    details.value[nomorToLoad] = detailsRes.data;
    paymentLinks.value[nomorToLoad] = paymentsRes.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`, error);
    console.error(error);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};


const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleNew = () => router.push({ name: 'ReturJualCreate' });
const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: 'ReturJualEdit', params: { nomor: selectedRow.value.nomor } });
};

const handleDelete = () => {
  if (!canDelete.value) return;
  showConfirmation(
    'Konfirmasi Hapus',
    `Yakin ingin menghapus Retur Jual ${selectedRow.value.nomor}?`,
    async () => {
      try {
        const response = await api.delete(`/retur-jual/${selectedRow.value.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (error) {
        const err = error as AxiosError<{ message?: string }>;
        toast.error(err.response?.data?.message || "Gagal menghapus data.");
      }
    }
  );
};

const handlePrint = () => {
  if (!isSingleSelected.value) return;
  isPrintOptionVisible.value = true; // Buka modal pilihan
};

const handlePrintSelection = (type: 'a4' | 'kasir') => {
  isPrintOptionVisible.value = false;
  const routeName = type === 'a4' ? 'ReturJualPrint' : 'ReturJualPrintKasir';
  const url = router.resolve({ name: routeName, params: { nomor: selectedRow.value.nomor } }).href;
  window.open(url, '_blank');
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header untuk diexport.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Retur Jual Header");
    XLSX.writeFile(workbook, "Export_ReturJual_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/retur-jual/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diexport.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Retur Jual Detail");
      XLSX.writeFile(workbook, "Export_ReturJual_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

onMounted(async () => {
  await fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Retur Jual" icon="mdi-keyboard-return">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" @click="handleEdit"
        :disabled="!canEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        @click="handleDelete" :disabled="!canDelete">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="handlePrint">
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
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="nomor" density="compact" class="desktop-table" fixed-header show-select
          show-expand return-object single-select @update:expanded="loadDetails">
          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal), 'dd/MM/yyyy') }}
          </template>

          <template #[`item.nominal`]="{ item }">
            {{ formatRupiah(item.nominal) }}
          </template>

          <template #[`item.diBayarkan`]="{ item }">
            {{ formatRupiah(item.diBayarkan) }}
          </template>

          <template #[`item.sisa`]="{ item }">
            {{ formatRupiah(item.sisa) }}
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <!-- Ganti class 'pa-4' dan tambahkan wrapper -->
                <div class="detail-container">
                  <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4">Memuat detail...
                  </div>
                  <div v-else class="detail-wrapper">
                    <div class="text-subtitle-2 font-weight-bold mb-2">Detail Barang Retur</div>
                    <!-- Tambahkan class="desktop-table detail-table" -->
                    <v-data-table :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                      class="desktop-table detail-table mb-4" :items-per-page="-1">
                      <template #bottom></template>
                    </v-data-table>

                    <div class="text-subtitle-2 font-weight-bold mb-2">Link Pembayaran</div>
                    <!-- Tambahkan class="desktop-table detail-table" -->
                    <v-data-table :headers="paymentLinkHeaders" :items="paymentLinks[item.nomor]" density="compact"
                      class="desktop-table detail-table" :items-per-page="-1">
                      <template #[`item.tanggal`]="{ item }">
                        {{ format(parseISO(item.tanggal), 'dd/MM/yyyy') }}
                      </template>
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

    <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir']" @close="isPrintOptionVisible = false"
      @select="handlePrintSelection" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya,
            Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

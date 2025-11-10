<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api'; // Pastikan path ini benar
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue'; // Pastikan path ini benar
import PrintOptionModal from '@/components/modal/PrintOptionModal.vue'; // Pastikan path ini benar
import * as XLSX from 'xlsx';
import AppDataTable from '@/components/AppDataTable.vue';

// --- Interfaces Potongan ---
interface PotonganHeader {
  Nomor: string;      // K01.POT.2509.0001
  Tanggal: string;    // 18/09/2025
  Nominal: number;    // Total Potongan Transaksi
  Dibayarkan: number; // Nilai yang sudah dibayarkan/dijurnal
  Akun: string;       // D-111198
  NamaAkun: string;   // Potongan Penjualan Kencana Print
  NoRekening: string; // 003
  Kdcus: string;      // K-01126
  Customer: string;   // KARYAWAN POTONG GAJI
  Alamat: string;
  Kota: string;
  Usr: string;
  Cab: string;
  Closing: string;    // Y/N
  Keterangan?: string;
  [key: string]: string | number | undefined;
}

interface PotonganDetail {
  tglbayar: string;
  invoice: string;
  bayar: number;
  angsur: string;
  nominal: number; // Nominal asli invoice
  terbayar: number; // Total terbayar (sebelum potongan ini)
  sisa_piutang: number; // Sisa piutang (sebelum potongan ini)
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '53'; // Ganti dengan ID menu untuk 'Potongan' jika berbeda

// --- State ---
const masterData = ref<PotonganHeader[]>([]);
const details = ref<Record<string, PotonganDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<PotonganHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<{ kode: string, nama: string }[]>([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  // Default cabang: 'K01' jika user 'KDC', atau cabang user sendiri
  cabang: authStore.user?.cabang === 'KDC' ? 'K01' : authStore.user?.cabang || '',
});

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<PotonganHeader | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);
const isPrintOptionVisible = ref(false);

const formatRupiah = (value: number | string | undefined): string => {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('id-ID').format(num);
};

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'Nomor', minWidth: '180px', fixed: true },
  { title: 'Tanggal', key: 'Tanggal', minWidth: '120px' },
  { title: 'Nominal', key: 'Nominal', minWidth: '120px' },
  { title: 'Dibayarkan', key: 'dBayarkan',minWidth: '120px' },
  { title: 'Akun', key: 'Akun', minWidth: '120px' },
  { title: 'Nama Akun', key: 'NamaAkun', minWidth: '250px' },
  { title: 'NoRekening', key: 'NoRekening', minWidth: '100px' },
  { title: 'Kdcus', key: 'Kdcust', minWidth: '100px' },
  { title: 'Customer', key: 'customer_nama', minWidth: '200px' },
  { title: 'Alamat', key: 'alamat', minWidth: '300px' },
  { title: 'Kota', key: 'Kota', minWidth: '150px' },
  { title: 'Usr', key: 'Usr', minWidth: '80px' },
  { title: 'Cab', key: 'Cab', minWidth: '80px' },
  { title: 'Closing', key: 'Closing', align: 'center', minWidth: '100px' },
] as const;

const detailHeaders = [
  { title: 'Tgl Bayar', key: 'tglbayar', width: '120px' },
  { title: 'No. Invoice', key: 'invoice', minWidth: '180px' },
  { title: 'Nominal Invoice', key: 'nominal', align: 'end' },
  { title: 'Terbayar (sblmnya)', key: 'terbayar', align: 'end' },
  { title: 'Sisa Piutang (sblmnya)', key: 'sisa_piutang', align: 'end' },
  { title: 'Dibayarkan Potongan', key: 'bayar', align: 'end', cellClass: 'font-weight-bold text-blue-darken-2' },
] as const;

// --- Methods ---

const fetchCabangList = async () => {
  try {
    const response = await api.get('/potongan/lookup/cabang-options');
    cabangList.value = response.data;
  } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = []; // Reset seleksi
  expanded.value = []; // Reset expand
  details.value = {}; // Reset detail data

  try {
    // Ganti endpoint menjadi /potongan
    const response = await api.get<PotonganHeader[]>('/potongan/master', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message);
    } else if (typeof error === 'object' && error !== null && 'response' in error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal mengambil data.');
    } else {
      toast.error('Gagal mengambil data.');
    }
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: PotonganHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item =>
    !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);
  try {
    // Kita akan memanggil endpoint baru 'browse-details'
    // agar tidak mengambil data 'header' yang tidak perlu
    const response = await api.get<PotonganDetail[]>(`/potongan/browse-details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data;
  } catch (error: unknown) {
    const msg = `Gagal memuat detail untuk ${itemToLoad.Nomor}.`;
    if (error instanceof Error) toast.error(`${msg}: ${error.message}`);
    else toast.error(msg);
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

// Logika pewarnaan baris (Misal: baris yang belum ditutup/Closing='N' diwarnai)
const getRowTextColor = (item: PotonganHeader) => {
  return item.Closing === 'N' ? 'text-orange-darken-3 font-weight-bold' : '';
};

const handleNew = () => {
  router.push({ name: 'PotonganCreate' }); // Ganti dengan nama route Anda
}

const handleEdit = () => {
  if (!isSingleSelected.value || !selectedRow.value) return;
  const nomor = selectedRow.value.Nomor;
  router.push({ name: 'PotonganEdit', params: { nomor } }); // Ganti dengan nama route Anda
};

const handlePrintSelection = (type: 'a4' | 'kasir' | 'wa') => {
  if (!isSingleSelected.value || !selectedRow.value) return;
  const nomor = selectedRow.value.Nomor;

  isPrintOptionVisible.value = false;

  if (type === 'a4' || type === 'kasir') {
    // Asumsi ada route untuk cetak Potongan
    const routeName = type === 'a4' ? 'PotonganPrintA4' : 'PotonganPrintKasir';
    const url = router.resolve({ name: routeName, params: { nomor } }).href;
    window.open(url, '_blank');
  } else if (type === 'wa') {
    // Biasanya Potongan tidak memiliki no HP pelanggan,
    // Anda mungkin perlu menyesuaikan logika atau menghapus opsi ini.
    toast.warning('Opsi kirim WA belum diimplementasikan atau tidak relevan untuk Potongan.');
  }
};

const openPrintOptions = () => {
  if (!isSingleSelected.value) return;
  isPrintOptionVisible.value = true;
};

const exportData = async (type: 'header' | 'detail') => {
  const fileName = `Export_Potongan_${type === 'header' ? 'Header' : 'Detail'}.xlsx`;

  try {
    if (type === 'header') {
      if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
      const worksheet = XLSX.utils.json_to_sheet(masterData.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Potongan Header");
      XLSX.writeFile(workbook, fileName);
    } else if (type === 'detail') {
      // Asumsi ada endpoint khusus untuk export detail dari backend
      const response = await api.get('/potongan/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Potongan Detail");
      XLSX.writeFile(workbook, fileName);
    }
    toast.success(`Data ${type} berhasil diekspor.`);
  } catch (error) {
    toast.error(`Gagal mengekspor data ${type}.`);
    console.error(error);
  }
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});

// Watcher untuk memuat ulang data saat filter berubah
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Daftar Potongan" icon="mdi-account-cash">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleNew">
        Baru
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" @click="handleEdit">
        Ubah
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="openPrintOptions">
        Cetak
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props"
            :disabled="loading || masterData.length === 0">
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
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="orange-darken-3" icon="mdi-square-rounded" size="small"></v-icon> Belum Closing
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" :loading="loading" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table" fixed-header show-select
          return-object show-expand @update:expanded="loadDetails">

          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td :class="getRowTextColor(item)">
              <template v-if="['Tanggal'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(String(item[header.key])), 'dd/MM/yyyy') : '' }}
              </template>
              <template v-else-if="['Nominal', 'Dibayarkan'].includes(header.key)">
                <span class="d-block text-right">{{ formatRupiah(item[header.key]) }}</span>
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success">YA</v-chip>
                <v-chip v-else size="x-small" color="error">TIDAK</v-chip>
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">Memuat detail...</div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template #[`item.tglbayar`]="{ value }">
                        {{ value ? format(parseISO(value), 'dd/MM/yyyy') : '' }}
                      </template>
                      <template #[`item.nominal`]="{ value }">
                        <span class="d-block text-right">{{ formatRupiah(value) }}</span>
                      </template>
                      <template #[`item.terbayar`]="{ value }">
                        <span class="d-block text-right">{{ formatRupiah(value) }}</span>
                      </template>
                      <template #[`item.sisa_piutang`]="{ value }">
                        <span class="d-block text-right">{{ formatRupiah(value) }}</span>
                      </template>
                      <template #[`item.bayar`]="{ value }">
                        <span class="d-block text-right">{{ formatRupiah(value) }}</span>
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
  </PageLayout>
</template>

<style scoped>
/* Styling dari komponen InvoiceView Anda */
.browse-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.filter-section {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  gap: 10px;
  border-bottom: 1px solid #ccc;
  background-color: #f7f7f7;
}

.filter-label {
  font-size: 0.85rem;
  font-weight: 500;
}

.table-container {
  flex-grow: 1;
  overflow: auto;
  /* Membuat tabel dapat di-scroll */
}

.desktop-table {
  /* Mengurangi padding untuk tampilan padat ala aplikasi desktop/grid */
  --v-table-header-height: 36px;
  /* Tinggi header yang lebih kecil */
}

/* Penyesuaian padding dan font untuk sel tabel agar lebih padat */
.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding-left: 8px !important;
  padding-right: 8px !important;
  height: 36px !important;
  font-size: 0.75rem !important;
  line-height: 1 !important;
}

/* Styling untuk Detail Table */
.detail-table-wrapper {
  max-height: 300px;
  /* Batasi tinggi container detail */
  overflow-y: auto;
  margin: 8px 0;
  border: 1px solid #ddd;
}

.detail-table :deep(td),
.detail-table :deep(th) {
  font-size: 0.75rem !important;
}
</style>

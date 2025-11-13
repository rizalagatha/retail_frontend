<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useRoute } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import PrintOptionModal from '@/components/modal/PrintOptionModal.vue';
import KasirPrintPreviewModal from "@/components/modal/KasirPrintPreviewModal.vue";
import * as XLSX from 'xlsx';

interface InvoiceHeader {
  Nomor: string;
  Tanggal: string;
  Posting: string;
  NomorSO?: string;
  TglSO?: string;
  Top?: number;
  Tempo?: string;
  LastPayment?: string;
  Diskon?: number;
  Dp?: number;
  Biayakirim?: number;
  Nominal?: number;
  Piutang?: number;
  Bayar?: number;
  SisaPiutang?: number;
  RpRetur?: number;
  Kdcus?: string;
  Nama?: string;
  Alamat?: string;
  Kota?: string;
  Telp?: string;
  Level?: string;
  Hp?: string;
  Member?: string;
  Keterangan?: string;
  RpTunai?: number;
  NoVoucher?: string;
  RpVoucher?: number;
  RpTransfer?: number;
  NoSetoran?: string;
  TglTransfer?: string;
  Akun?: string;
  NoRekening?: string;
  NoRetur?: string;
  SC?: string;
  Created?: string;
  Prn?: string;
  Puas?: string;
  Closing?: string;
  [key: string]: string | number | undefined;
}

interface InvoiceDetail {
  Kode: string;
  Barcode?: string;
  Nama: string;
  Ukuran?: string;
  Jumlah: number;
  Harga: number;
  'Dis%'?: number;
  Total: number;
  HargaAsli?: number;       // harga sebelum diskon (per pcs)
  DiskonAktif?: number;     // nilai diskon aktif per pcs
}

interface InvoiceItem {
  Nomor: string;
  Tanggal: string;
  Posting: string;
  NomorSO?: string;
  TglSO?: string;
  Top?: number;
  Tempo?: string;
  LastPayment?: string;
  Diskon?: number;
  Dp?: number;
  Biayakirim?: number;
  Nominal?: number;
  Piutang?: number;
  Hp?: string;
  Member?: string;
  SisaPiutang?: number;
  Closing?: string;
  [key: string]: unknown;
}


// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '27';

// --- State ---
const masterData = ref<InvoiceHeader[]>([]);
const details = ref<Record<string, InvoiceDetail[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<InvoiceHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const isKasirPreviewVisible = ref(false);
const selectedInvoice = ref<string | null>(null);

const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'K01' : authStore.user?.cabang || '',
  status: null as string | null,
});

const isMounted = ref(false);

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<InvoiceItem | null>(() =>
  isSingleSelected.value ? selected.value[0] as InvoiceItem : null
);
const isPrintOptionVisible = ref(false);

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Nomor', key: 'Nomor', minWidth: '180px', fixed: true },
  { title: 'Tanggal', key: 'Tanggal', minWidth: '120px' },
  { title: 'Posting', key: 'Posting', minWidth: '100px' },
  { title: 'No. SO', key: 'NomorSO', minWidth: '180px' },
  { title: 'Tgl SO', key: 'TglSO', minWidth: '120px' },
  { title: 'TOP', key: 'Top', minWidth: '70px' },
  { title: 'Jatuh Tempo', key: 'Tempo', minWidth: '120px' },
  { title: 'Last Payment', key: 'LastPayment', minWidth: '120px' },
  { title: 'Diskon', key: 'Diskon', minWidth: '120px' },
  { title: 'DP', key: 'Dp', minWidth: '120px' },
  { title: 'Biaya Kirim', key: 'Biayakirim', minWidth: '120px' },
  { title: 'Nominal', key: 'Nominal', minWidth: '150px' },
  { title: 'Piutang', key: 'Piutang', minWidth: '150px' },
  { title: 'Bayar', key: 'Bayar', minWidth: '150px' },
  { title: 'Sisa Piutang', key: 'SisaPiutang', minWidth: '150px' },
  { title: 'Rp Retur', key: 'RpRetur', minWidth: '120px' },
  { title: 'Kd Cus', key: 'Kdcus', minWidth: '120px' },
  { title: 'Customer', key: 'Nama', minWidth: '250px' },
  { title: 'Alamat', key: 'Alamat', minWidth: '350px' },
  { title: 'Kota', key: 'Kota', minWidth: '150px' },
  { title: 'Telepon', key: 'Telp', minWidth: '150px' },
  { title: 'Level', key: 'Level', minWidth: '150px' },
  { title: 'HP', key: 'Hp', minWidth: '150px' },
  { title: 'Nama Member', key: 'Member', minWidth: '250px' },
  { title: 'Keterangan', key: 'Keterangan', minWidth: '250px' },
  { title: 'Rp Tunai', key: 'RpTunai', minWidth: '120px' },
  { title: 'No Voucher', key: 'NoVoucher', minWidth: '150px' },
  { title: 'Rp Voucher', key: 'RpVoucher', minWidth: '120px' },
  { title: 'Rp Transfer', key: 'RpTransfer', minWidth: '120px' },
  { title: 'No Setoran', key: 'NoSetoran', minWidth: '180px' },
  { title: 'Tgl Transfer', key: 'TglTransfer', minWidth: '120px' },
  { title: 'Akun', key: 'Akun', minWidth: '120px' },
  { title: 'No Rekening', key: 'NoRekening', minWidth: '150px' },
  { title: 'No Retur', key: 'NoRetur', minWidth: '180px' },
  { title: 'SC', key: 'SC', minWidth: '150px' },
  { title: 'Created', key: 'Created', minWidth: '180px' },
  { title: 'Minus', key: 'Minus', minWidth: '80px', align: 'center' },
  { title: 'Prn', key: 'Prn', align: 'center' },
  { title: 'Puas', key: 'Puas', align: 'center' },
  { title: 'Closing', key: 'Closing', align: 'center' },
] as const;

const detailHeaders = [
  { title: 'Kode', key: 'Kode' },
  { title: 'Barcode', key: 'Barcode' },
  { title: 'Nama Barang', key: 'Nama', minWidth: '300px' },
  { title: 'Ukuran', key: 'Ukuran' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end' },
  { title: 'Harga', key: 'Harga', align: 'end' },
  { title: 'Dis %', key: 'Dis%', align: 'end' },
  { title: 'Total', key: 'Total', align: 'end' },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/invoices/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) { toast.error('Gagal memuat daftar cabang.', error); }
};

const fetchMasterData = async () => {
  loading.value = true;
  try {
    const response = await api.get<InvoiceHeader[]>('/invoices', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message);
    } else if (typeof error === 'object' && error !== null && 'response' in error) {
      // Type assertion untuk axios error
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal mengambil data.');
    } else {
      toast.error('Gagal mengambil data.');
    }
  } finally {
    loading.value = false;
  }
};


const loadDetails = async (newlyExpandedItems: InvoiceItem[]) => {
  const itemToLoad = newlyExpandedItems.find(item =>
    !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.Nomor);
  try {
    const response = await api.get<InvoiceDetail[]>(`/invoices/details/${itemToLoad.Nomor}`);
    details.value[itemToLoad.Nomor] = response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}: ${error.message}`);
    } else {
      toast.error(`Gagal memuat detail untuk ${itemToLoad.Nomor}`);
    }
  } finally {
    loadingDetails.value.delete(itemToLoad.Nomor);
  }
};

// const handleDelete = () => {
//     if (!selectedRow.value) return;
//     if (confirm(`Yakin ingin menghapus Invoice nomor ${selectedRow.value.Nomor}?`)) {
//         api.delete(`/invoices/${selectedRow.value.Nomor}`)
//             .then(response => {
//                 toast.success(response.data.message);
//                 fetchMasterData();
//             })
//             .catch(error => {
//                 toast.error(error.response?.data?.message || 'Gagal menghapus data.');
//             });
//     }
// };

const getRowClass = (item: InvoiceItem) => {
  // Kondisi 1: Sisa Piutang
  if (item.SisaPiutang > 0) {
    return 'row-sisa-piutang';
  }

  // Kondisi 2: Stok Minus (Akan berfungsi setelah Anda update backend)
  if (item.Minus === 'Y') {
    return 'row-stok-minus';
  }

  return ''; // Default
};

const handleNew = () => {
  router.push({ name: 'InvoiceCreate' });
}

const handleEdit = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].Nomor;
  router.push({ name: 'InvoiceEdit', params: { nomor } });
};

const printData = (type: 'invoice' | 'sj') => {
  if (!isSingleSelected.value) return;

  const item = selected.value[0];
  let routeName = '';

  if (type === 'invoice') {
    routeName = 'InvoicePrint'; // Nama route untuk cetak Invoice A4
  } else if (type === 'sj') {
    routeName = 'CetakInvoiceAsSJ';
  }

  const url = router.resolve({
    name: routeName,
    params: { nomor: item.Nomor }
  }).href;

  window.open(url, '_blank');
};

const openPrintOptions = () => {
  if (!isSingleSelected.value) return;
  isPrintOptionVisible.value = true;
};

const formatHpToWa = (hp: string) => {
  if (!hp) return '';
  let sanitizedHp = hp.replace(/[^0-9]/g, ''); // Hapus semua selain angka
  if (sanitizedHp.startsWith('0')) {
    sanitizedHp = '62' + sanitizedHp.substring(1); // Ganti 0 di depan dengan 62
  }
  return sanitizedHp;
};

const handlePrintSelection = async (type: 'a4' | 'kasir' | 'wa') => {
  const nomor = selectedRow.value?.Nomor;
  const item = selectedRow.value;

  if (!nomor || !item) return;

  // Tutup pilihan modal awal
  isPrintOptionVisible.value = false;

  // ===============================
  // PRINT KASIR (PAKAI MODAL PREVIEW)
  // ===============================
  if (type === 'kasir') {
    selectedInvoice.value = nomor;
    isKasirPreviewVisible.value = true;
    return;
  }

  // ===============================
  // PRINT A4 (MASIH TAB BARU)
  // ===============================
  if (type === 'a4') {
    const url = router.resolve({ name: 'InvoicePrint', params: { nomor } }).href;
    window.open(url, '_blank');
    return;
  }

  // ===============================
  // WHATSAPP
  // ===============================
  if (type === 'wa') {
    const memberHp = item.Hp;
    if (!memberHp) {
      return toast.error('No. HP Member tidak ada, tidak bisa kirim via WA.');
    }

    try {
      toast.info(`Mengirim struk ke ${memberHp}...`);
      const response = await api.post('/whatsapp/send-receipt', {
        nomor,
        hp: formatHpToWa(memberHp)
      });
      toast.success(response.data.message);
    } catch (error: unknown) {
      if (error instanceof Error) toast.error(error.message);
      else toast.error('Gagal mengirim struk via WhatsApp.');
    }
  }
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Invoice Header");
    XLSX.writeFile(workbook, "Export_Invoice_Header.xlsx");
  } else if (type === 'detail') {
    try {
      const response = await api.get('/invoices/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Invoice Detail");
      XLSX.writeFile(workbook, "Export_Invoice_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    }
  }
};

onMounted(async () => { // Jadikan async
  const queryStartDate = route.query.startDate as string;
  const queryEndDate = route.query.endDate as string;
  const queryStatus = route.query.status as string;

  if (queryStartDate && queryEndDate) {
    filters.startDate = queryStartDate;
    filters.endDate = queryEndDate;
  }
  if (queryStatus) { // <-- TAMBAHKAN INI
    filters.status = queryStatus;
  }

  // Tunggu cabang dan data master selesai diambil
  // dengan filter yang sudah benar (dari URL).
  await fetchCabangList();
  await fetchMasterData(); // <-- Panggil SEKALI di sini

  // Setelah semua pemuatan awal selesai,
  // baru aktifkan 'watch' untuk perubahan di masa depan.
  isMounted.value = true; // <-- PINDAHKAN KE AKHIR
});

watch(filters, () => {
  if (isMounted.value) { // <-- TAMBAHKAN KONDISI INI
    fetchMasterData();
  }
}, { deep: true });
</script>

<template>
  <PageLayout title="Invoice" icon="mdi-receipt-text">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="handleNew">
        Baru
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!isSingleSelected"
        @click="handleEdit">
        Ubah
      </v-btn>
      <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
                @click="handleDelete">Hapus</v-btn> -->
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="green" :disabled="!isSingleSelected"
        prepend-icon="mdi-printer" @click="openPrintOptions">
        Cetak
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" color="cyan" :disabled="!isSingleSelected"
        prepend-icon="mdi-truck-delivery-outline" @click="printData('sj')">
        Cetak SJ
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
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />
        <v-select label="Cabang" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />
        <v-chip v-if="filters.status" class="ms-4" color="primary" variant="tonal" closable
          @click:close="filters.status = null">
          Filter Aktif: {{ filters.status === 'belum_lunas' ? 'Belum Lunas' : filters.status }}
        </v-chip>
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="yellow-darken-3" icon="mdi-square-rounded" size="small"></v-icon> Stok Minus
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Lunas
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="masterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table" fixed-header show-select
          return-object show-expand @update:expanded="loadDetails"
          :item-props="(item) => ({ class: getRowClass(item) })">
          <template v-for="header in headers" :key="header.key" #[`item.${header.key}`]="{ item }">
            <td>
              <template
                v-if="['Tanggal', 'TglSO', 'TglSJ', 'LastPayment', 'TglTransfer', 'Created'].includes(header.key)">
                {{ item[header.key] ? format(parseISO(String(item[header.key])), 'dd/MM/yyyy') : '' }}
              </template>
              <template
                v-else-if="['Dis%', 'Diskon', 'Dp', 'Biayakirim', 'Nominal', 'Piutang', 'Bayar', 'SisaPiutang', 'RpVoucher', 'RpTransfer', 'RpRetur', 'RpTunai'].includes(header.key)">
                {{ formatRupiah(Number(item[header.key])) }}
              </template>
              <template v-else-if="header.key === 'Posting'">
                <v-chip size="x-small" :color="item.Posting === 'SUDAH' ? 'green' : 'grey'">{{ item.Posting }}</v-chip>
              </template>
              <template v-else-if="header.key === 'Closing'">
                <v-chip v-if="item.Closing === 'Y'" size="x-small" color="success">YA</v-chip>
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
                    <div v-if="loadingDetails.has(item.Nomor)" class="text-center pa-4">Memuat
                      detail...</div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.Nomor]" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template #[`item.Harga`]="{ item }">
                        <div class="harga-cell">
                          <div>{{ formatRupiah(item.HargaAsli || item.Harga) }}</div>
                          <div v-if="item.DiskonAktif && item.DiskonAktif > 0" class="promo-info">
                            (Promo {{ formatRupiah(item.Harga) }})
                            <div class="discount-info">-{{ formatRupiah(item.DiskonAktif) }}/pcs</div>
                          </div>
                        </div>
                      </template>
                      <template #[`item.Total`]="{ value }">
                        {{ formatRupiah(value) }}
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
    <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir', 'wa']" @close="isPrintOptionVisible = false"
      @select="handlePrintSelection" />
    <KasirPrintPreviewModal v-model="isKasirPreviewVisible" :nomorInvoice="selectedInvoice"
      @close="isKasirPreviewVisible = false" />
  </PageLayout>
</template>

<style scoped>
/* --- TAMBAHKAN STYLE BARU YANG LEBIH SPESIFIK INI --- */

/* Targetkan sel <td> di dalam baris 'row-sisa-piutang' */
.desktop-table :deep(tr.row-sisa-piutang > td) {
  background-color: #FFEBEE !important;
}

.desktop-table :deep(tr.row-sisa-piutang:hover > td) {
  background-color: #FFCDD2 !important;
  /* Warna saat di-hover */
}

/* Targetkan sel <td> di dalam baris 'row-stok-minus' */
.desktop-table :deep(tr.row-stok-minus > td) {
  background-color: #FFF9C4 !important;
}

.desktop-table :deep(tr.row-stok-minus:hover > td) {
  background-color: #FFF59D !important;
  /* Warna saat di-hover */
}

.harga-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.2;
}

.promo-info {
  color: #d32f2f;
  font-size: 0.8rem;
  font-weight: 500;
}

.discount-info {
  color: #9e9e9e;
  font-size: 0.75rem;
}
</style>

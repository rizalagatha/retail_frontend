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
import { formatRupiah } from "@/utils/formatRupiah";

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
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: 'start' | 'center' | 'end';
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
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
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'K01' : authStore.user?.cabang || '',
  status: null as string | null,
});

const isMounted = ref(false);

const filterOptions = ref([
  { title: 'Nomor Invoice', value: 'Nomor' },
  { title: 'Customer', value: 'Nama' },
  { title: 'Kd Customer', value: 'Kdcus' },
  { title: 'Alamat', value: 'Alamat' },
  { title: 'Kota', value: 'Kota' },
  { title: 'Nomor SO', value: 'NomorSO' },
  { title: 'Sales', value: 'SC' },
  { title: 'HP', value: 'Hp' },
]);

// DEFAULT → Nama customer
const selectedFilterField = ref('Nama');

// input pencarian
const filterSearchValue = ref('');

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<InvoiceItem | null>(() =>
  isSingleSelected.value ? selected.value[0] as InvoiceItem : null
);
const isPrintOptionVisible = ref(false);

const totalNominal = computed(() =>
  masterData.value.reduce((sum, r) => sum + (Number(r.Nominal) || 0), 0)
);

const totalBayar = computed(() =>
  masterData.value.reduce((sum, r) => sum + (Number(r.Bayar) || 0), 0)
);

const totalPiutang = computed(() =>
  masterData.value.reduce((sum, r) => sum + (Number(r.Piutang) || 0), 0)
);

const totalSisaPiutang = computed(() =>
  masterData.value.reduce((sum, r) => sum + (Number(r.SisaPiutang) || 0), 0)
);

const filteredMasterData = computed(() => {
  if (!filterSearchValue.value) return masterData.value;

  const key = selectedFilterField.value;
  const search = filterSearchValue.value.toLowerCase();

  return masterData.value.filter(item => {
    const val = item[key];
    if (!val) return false;
    return String(val).toLowerCase().includes(search);
  });
});

// --- Konfigurasi Tabel ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'Nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 120 },
  { title: 'Posting', key: 'Posting', width: 100 },
  { title: 'No. SO', key: 'NomorSO', width: 180 },
  { title: 'Tgl SO', key: 'TglSO', width: 120 },
  { title: 'TOP', key: 'Top', width: 70 },
  { title: 'Jatuh Tempo', key: 'Tempo', width: 120 },
  { title: 'Last Payment', key: 'LastPayment', width: 120 },
  { title: 'Diskon', key: 'Diskon', width: 120 },
  { title: 'DP', key: 'Dp', width: 120 },
  { title: 'Biaya Kirim', key: 'Biayakirim', width: 120 },
  { title: 'Nominal', key: 'Nominal', width: 150 },
  { title: 'Piutang', key: 'Piutang', width: 150 },
  { title: 'Bayar', key: 'Bayar', width: 150 },
  { title: 'Sisa Piutang', key: 'SisaPiutang', width: 150 },
  { title: 'Rp Retur', key: 'RpRetur', width: 120 },
  { title: 'Kd Cus', key: 'Kdcus', width: 120 },
  { title: 'Customer', key: 'Nama', width: 250 },
  { title: 'Alamat', key: 'Alamat', width: 700 },
  { title: 'Kota', key: 'Kota', width: 150 },
  { title: 'Telepon', key: 'Telp', width: 150 },
  { title: 'Level', key: 'Level', width: 150 },
  { title: 'HP', key: 'Hp', width: 150 },
  { title: 'Nama Member', key: 'Member', width: 250 },
  { title: 'Keterangan', key: 'Keterangan', width: 250 },
  { title: 'Rp Tunai', key: 'RpTunai', width: 120 },
  { title: 'No Voucher', key: 'NoVoucher', width: 150 },
  { title: 'Rp Voucher', key: 'RpVoucher', width: 120 },
  { title: 'Rp Transfer', key: 'RpTransfer', width: 120 },
  { title: 'No Setoran', key: 'NoSetoran', width: 180 },
  { title: 'Tgl Transfer', key: 'TglTransfer', width: 120 },
  { title: 'Akun', key: 'Akun', width: 120 },
  { title: 'No Rekening', key: 'NoRekening', width: 150 },
  { title: 'No Retur', key: 'NoRetur', width: 180 },
  { title: 'SC', key: 'SC', width: 150 },
  { title: 'Created', key: 'Created', width: 180 },
  { title: 'Minus', key: 'Minus', width: 80, align: 'center' },
  { title: 'Prn', key: 'Prn', align: 'center' },
  { title: 'Puas', key: 'Puas', align: 'center' },
  { title: 'Closing', key: 'Closing', align: 'center' },
]);

const detailHeaders = [
  { title: 'Kode', key: 'Kode' },
  { title: 'Barcode', key: 'Barcode' },
  { title: 'Nama Barang', key: 'Nama', width: '300px' },
  { title: 'Ukuran', key: 'Ukuran' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end' },
  { title: 'Harga', key: 'Harga', align: 'end' },
  { title: 'Dis %', key: 'Dis%', align: 'end' },
  { title: 'Total', key: 'Total', align: 'end' },
] as const;

// --- Methods ---
const handleRowClick = (event: Event, { item }: { item: InvoiceHeader }) => {
  // Toggle select: Jika sudah dipilih, jangan di-unselect (biar mirip behavior desktop)
  // Atau ganti logika: Klik row = set selected cuma row itu saja (single select behavior)

  selected.value = [item]; // Set item ini sebagai satu-satunya yang terpilih
};

const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  // Mencegah sorting saat mau resize
  e.preventDefault();
  e.stopPropagation();

  resizingColumn.value = column;
  startX.value = e.pageX;
  startWidth.value = column.width || 100; // Default width jika belum ada

  // Pasang event listener global
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = 'col-resize'; // Ubah kursor body
};

const onResizeMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;

  const diff = e.pageX - startX.value;
  const newWidth = Math.max(50, startWidth.value + diff); // Minimal 50px

  resizingColumn.value.width = newWidth;
};

const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = ''; // Reset kursor
};

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

    masterData.value = response.data.map(h => ({
      ...h,
      Nominal: Number(h.Nominal) || 0,
      Piutang: Number(h.Piutang) || 0,
      SisaPiutang: Number(h.SisaPiutang) || 0,   // <-- PENTING! JANGAN HITUNG ULANG
      Bayar: Number(h.Bayar) || 0,               // pastikan aman
      Dp: Number(h.Dp) || 0,
    }));

  } catch (error) {
    toast.error('Gagal mengambil data.', error);
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
  if (!isMounted.value) return;

  // Jika user sedang search → JANGAN fetch
  if (filterSearchValue.value) return;

  fetchMasterData();
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
        <div class="d-flex align-center ga-2 ms-4">
          <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Berdasarkan" density="compact"
            hide-details variant="outlined" style="max-width: 200px;" />

          <v-text-field v-model="filterSearchValue" label="Cari..." density="compact" hide-details variant="outlined"
            clearable prepend-inner-icon="mdi-magnify" style="min-width: 250px;" />
        </div>
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="yellow-darken-3" icon="mdi-square-rounded" size="small"></v-icon> Stok Minus
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Lunas
        </div>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="filteredMasterData"
          :loading="loading" item-value="Nomor" density="compact" class="desktop-table header-browse-blue" fixed-header
          show-select return-object @update:expanded="loadDetails" @click:row="handleRowClick"
          :item-props="(item) => ({ class: getRowClass(item) })">
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th :style="{
                  width: (header.width || 100) + 'px',
                  minWidth: (header.width || 100) + 'px',
                  maxWidth: (header.width || 100) + 'px',
                  boxSizing: 'border-box'
                }" class="resizable-header" :class="{ 'text-center': header.align === 'center', 'text-end': header.align === 'end' }"
                  @click="toggleSort(header)">
                  <div class="header-content">
                    <span>{{ header.title }}</span>

                    <v-icon v-if="isSorted(header)" size="small" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>
                  </div>

                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" @click.stop></div>
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn icon="mdi-chevron-down" :class="{ 'rotate-180': isExpanded(internalItem) }" size="x-small"
              variant="text" @click.stop="toggleExpand(internalItem)" />
          </template>

          <template v-for="header in headers.filter(h => h.key !== 'data-table-expand')" :key="header.key"
            #[`item.${header.key}`]="{ item }">
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
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <v-data-table :headers="detailHeaders" :items="details[item.Nomor]" density="compact"
                      hide-default-footer>
                      <template #[`item.Harga`]="{ item }">
                        <div class="harga-cell">
                          <template v-if="item.HargaAsli > item.Harga">
                            <div class="text-grey text-decoration-line-through">{{ formatRupiah(item.HargaAsli) }}</div>
                            <div>{{ formatRupiah(item.Harga) }}</div>
                          </template>
                          <template v-else>
                            <div>{{ formatRupiah(item.Harga) }}</div>
                          </template>
                        </div>
                      </template>
                      <template #[`item.Total`]="{ value }">
                        {{ formatRupiah(value) }}
                      </template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
      <div class="footer-summary">
        <div class="footer-item">
          <span>Grand Nominal:</span>
          <strong>{{ formatRupiah(totalNominal) }}</strong>
        </div>

        <div class="footer-item">
          <span>Grand Bayar:</span>
          <strong>{{ formatRupiah(totalBayar) }}</strong>
        </div>

        <div class="footer-item">
          <span>Grand Piutang:</span>
          <strong>{{ formatRupiah(totalPiutang) }}</strong>
        </div>

        <div class="footer-item">
          <span>Grand Sisa Piutang:</span>
          <strong>{{ formatRupiah(totalSisaPiutang) }}</strong>
        </div>
      </div>
    </div>

    <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir', 'wa']" @close="isPrintOptionVisible = false"
      @select="handlePrintSelection" />
    <KasirPrintPreviewModal v-model="isKasirPreviewVisible" :nomorInvoice="selectedInvoice"
      @close="isKasirPreviewVisible = false" />
  </PageLayout>
</template>

<style scoped>
.browse-content {
  display: flex;
  flex-direction: column;
  /* Hitung sisa tinggi: 100vh - (Tinggi Header/Navbar + Padding) */
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
  /* Sembunyikan scrollbar window utama */
}

.filter-section {
  flex-shrink: 0;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  /* CRITICAL: Agar flexbox mengizinkan anak elemen untuk scroll */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Sembunyikan scrollbar di wrapper ini */
}

.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  /* Pastikan area ini mengambil sisa tinggi */
  flex-grow: 1;
  height: 100% !important;

  /* Aktifkan scrollbar di SINI */
  overflow-x: auto !important;
  /* Scrollbar Horizontal */
  overflow-y: auto !important;
  /* Scrollbar Vertikal */

  /* Trik CSS agar scrollbar selalu terlihat (Opsional, tapi bagus) */
  scrollbar-width: thin;
}

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

.footer-summary {
  position: sticky;
  flex-shrink: 0;
  bottom: 0;
  z-index: 10;
  background: #f5f5f5;
  border-top: 1px solid #ccc;
  padding: 10px 20px;
  display: flex;
  gap: 40px;
  justify-content: flex-end;
  font-size: 14px;
}

.footer-item {
  display: flex;
  gap: 8px;
}

.detail-container {
  display: flex;
  /* UBAH INI: dari flex-end (kanan) menjadi flex-start (kiri) */
  justify-content: flex-start;
  padding: 16px 16px 16px 64px;
  /* Padding kiri lebih besar (64px) agar sejajar indentasi */
  background-color: #fafafa;
  border-bottom: 1px solid #e0e0e0;
  width: 100%;
  /* Pastikan lebar penuh */
}

/* Styling header tabel detail agar beda dikit (opsional) */
.detail-table :deep(thead tr th) {
  background-color: #f5f5f5 !important;
  /* Abu muda */
  color: #424242 !important;
  font-size: 10px !important;
  height: 32px !important;
}

.footer-summary {
  flex-shrink: 0;
  z-index: 5;
  /* Pastikan di atas scrollbar jika perlu */
}

.resizable-header {
  position: relative;
  /* Pastikan border dan background sesuai tema biru Anda */
  background-color: #e3f2fd !important;
  color: #0d47a1 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #1976d2 !important;
  padding: 0 8px !important;
  /* Reset padding agar muat */
  user-select: none;
  /* Supaya teks tidak terblok saat drag */
}

/* Konten Header (Teks) */
.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* Atau flex-start */
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Garis Penarik (Resizer Handle) */
.resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  /* Area klik selebar 5px */
  cursor: col-resize;
  /* Kursor berubah jadi panah kiri-kanan */
  z-index: 1;
}

/* Visualisasi garis saat di-hover (Opsional) */
.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid #1565c0;
  /* Muncul garis biru saat hover */
}
</style>

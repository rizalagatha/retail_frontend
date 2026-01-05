<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, subDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import ProductSearchModal from '@/components/lookup/ProductSearchModal.vue';
import AppDataTable from '@/components/AppDataTable.vue';
import * as XLSX from 'xlsx';
import { AxiosError } from 'axios';
import QRCode from 'qrcode';

// --- Tipe Data ---
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

interface PackingListHeader {
  Nomor: string;
  Tanggal: string;
  Store: string;
  Nama_Store: string;
  NoMinta: string;
  TglMinta: string;
  Status: string;
  NoSJFinal: string;
  Keterangan: string;
  Usr: string;
  [key: string]: unknown;
}

interface PackingListDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Jumlah: number;
}

interface Product {
  kode: string;
  nama: string;
}

interface ColumnFilter {
  type: 'multi' | 'custom';
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

interface PrintLabelData {
  nomorPL: string;
  nomorMinta: string;
  tujuan: string;
  totalQty: number;
  contentHtml: string;
  detailUkuran: string;
  namaBarang: string; // Tambahkan ini agar tidak error di template
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '224';

// --- State ---
const filters = reactive({
  startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '',
  kodeBarang: '',
  namaBarang: '',
});

const loading = ref(false);
const masterData = ref<PackingListHeader[]>([]);
const selected = ref<PackingListHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, PackingListDetail[]>>({});
const dialog = reactive({ searchProduct: false, confirm: false });
const confirmAction = ref<(() => void) | null>(null);
const confirmText = ref('');
const printData = ref<PrintLabelData | null>(null);
const isPrintingLabel = ref(false);

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: '', operator: '=', value: '' });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Header Definisi (Resizable) ---
const masterHeaders = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'No. Packing List', key: 'Nomor', width: 160, fixed: true },
  { title: 'Tanggal', key: 'Tanggal', width: 110 },
  { title: 'Store', key: 'Store', width: 80 },
  { title: 'Nama Store', key: 'Nama_Store', width: 200 },
  { title: 'No. Minta', key: 'NoMinta', width: 150 },
  { title: 'Status', key: 'Status', width: 100, align: 'center' },
  { title: 'No. SJ Final', key: 'NoSJFinal', width: 150 },
  { title: 'Keterangan', key: 'Keterangan', width: 300 },
  { title: 'User', key: 'Usr', width: 100 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'Kode', width: '120px' },
  { title: 'Nama Barang', key: 'Nama', width: '300px' },
  { title: 'Ukuran', key: 'Ukuran', width: '80px' },
  { title: 'Jumlah', key: 'Jumlah', align: 'end', width: '100px' },
] as const;

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

// --- Logic Filter Client-Side ---
const filteredList = computed(() => {
  let data = [...masterData.value];

  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    // MULTI FILTER
    if (f.type === 'multi' && f.values) {
      data = data.filter(row =>
        f.values!.includes(row[key] as string | number)
      );
    }

    // CUSTOM FILTER
    if (f.type === 'custom' && f.value !== undefined) {
      const target = String(f.value).toLowerCase();
      data = data.filter(row => {
        const v = row[key];
        if (v === null || v === undefined) return false;
        const s = String(v).toLowerCase();

        switch (f.operator) {
          case '=': return s === target;
          case '!=': return s !== target;
          case '>': return Number(s) > Number(target);
          case '>=': return Number(s) >= Number(target);
          case '<': return Number(s) < Number(target);
          case '<=': return Number(s) <= Number(target);
          case 'contains': return s.includes(target);
          case 'starts': return s.startsWith(target);
          case 'ends': return s.endsWith(target);
          default: return true;
        }
      });
    }
  }
  return data;
});

// --- Methods: Filter Logic ---
const uniqueValues = (key: string): Array<string | number> => {
  return Array.from(
    new Set(
      masterData.value
        .map(i => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== '')
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
};

const formatFilterValue = (key: string, val: string | number) => {
  if (!val) return '-';
  if (['Tanggal'].includes(key)) {
    try {
      return format(new Date(String(val)), 'dd/MM/yyyy');
    } catch {
      return val;
    }
  }
  return val;
};

const filterType = (key: string) => columnFilters.value[key]?.type ?? '';
const isFilterActive = (key: string) => Boolean(columnFilters.value[key]);
const clearColumnFilter = (key: string) => { delete columnFilters.value[key]; };

const toggleMultiSelectValue = (key: string, value: string | number) => {
  const f = columnFilters.value[key];
  if (!f || f.type !== 'multi') {
    columnFilters.value[key] = { type: 'multi', values: [value] };
    return;
  }
  const arr = f.values ?? [];
  if (arr.includes(value)) {
    f.values = arr.filter(v => v !== value);
    if (f.values.length === 0) delete columnFilters.value[key];
  } else {
    f.values = [...arr, value];
  }
};

const openCustomFilter = (key: string) => {
  customFilter.key = key;
  customFilter.operator = '=';
  customFilter.value = '';
  customFilterDialog.value = true;
};

const applyCustomFilter = () => {
  columnFilters.value[customFilter.key] = {
    type: 'custom',
    operator: customFilter.operator,
    value: customFilter.value
  };
  customFilterDialog.value = false;
};

const resetAllFilters = () => {
  columnFilters.value = {};
};

// --- Methods: Resize Logic ---
const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  e.preventDefault(); e.stopPropagation();
  resizingColumn.value = column;
  startX.value = e.pageX;
  startWidth.value = (typeof column.width === 'number' ? column.width : 100);
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = 'col-resize';
};
const onResizeMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;
  const diff = e.pageX - startX.value;
  resizingColumn.value.width = Math.max(50, startWidth.value + diff);
};
const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = '';
};

// --- Logic Selection ---
const handleRowClick = (_event: Event, { item }: { item: PackingListHeader }) => {
  selected.value = [item];
};

// --- Methods: Data ---
const formatNumber = (val: number | string) => {
  return Number(val).toLocaleString('id-ID');
};

const fetchMasterData = async () => {
  loading.value = true;
  masterData.value = [];
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/packing-list', { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const fetchCabangList = async () => {
  try {
    const response = await api.get('/packing-list/lookup/cabang');
    const list = response.data;

    // [BARU] Jika user KDC, tambahkan opsi ALL di paling atas
    if (authStore.user?.cabang === 'KDC') {
      list.unshift({ kode: 'ALL', nama: 'Semua Cabang' });
    }

    cabangList.value = list;
  } catch {
    toast.error('Gagal memuat daftar cabang.');
  }
};

const loadDetails = async (newlyExpandedItems: PackingListHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor));
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/packing-list/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    details.value[nomorToLoad] = [];
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

// --- Actions ---
const handleNew = () => router.push({ name: 'PackingListCreate' });

const handleEdit = () => {
  if (!selectedRow.value) return;
  if (selectedRow.value.Status === 'C' || selectedRow.value.Status === 'SENT') {
    return toast.warning('Packing List sudah diproses menjadi Surat Jalan. Tidak bisa diubah.');
  }
  router.push({ name: 'PackingListEdit', params: { nomor: selectedRow.value.Nomor } });
};

const showDeleteConfirmation = () => {
  if (!selectedRow.value) return;
  if (selectedRow.value.Status === 'C' || selectedRow.value.Status === 'SENT') {
    return toast.warning('Packing List sudah diproses menjadi Surat Jalan. Tidak bisa dihapus.');
  }
  confirmAction.value = executeDelete;
  confirmText.value = `Yakin ingin hapus Packing List nomor ${selectedRow.value.Nomor}?`;
  dialog.confirm = true;
};

const executeDelete = async () => {
  if (!selectedRow.value) return;
  try {
    const response = await api.delete(`/packing-list/${selectedRow.value.Nomor}`);
    toast.success(response.data.message);
    fetchMasterData();
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus data.');
  }
};

const handlePrint = () => {
  if (selected.value.length !== 1) return;
  const item = selected.value[0];
  const url = router.resolve({ name: 'PackingListPrint', params: { nomor: item.Nomor } }).href;
  window.open(url, '_blank');
};

// --- Fungsi Ambil Data Lengkap untuk Cetak QR ---
const handlePrintLabel = async (orientation: 'landscape' | 'portrait') => {
  if (!selectedRow.value) return;

  isPrintingLabel.value = true;
  try {
    const nomor = selectedRow.value.Nomor;
    const response = await api.get(`/packing-list/${nomor}`);
    const items = response.data as PackingListDetail[];

    // 1. Hitung total Qty dari seluruh baris detail
    const totalQty = items.reduce((sum, it) => sum + Number(it.Jumlah), 0);

    // 2. Grouping berdasarkan Nama Barang
    const grouped = new Map<string, number>();
    items.forEach((it) => {
      const currentQty = grouped.get(it.Nama) || 0;
      grouped.set(it.Nama, currentQty + Number(it.Jumlah));
    });

    const distinctItems = Array.from(grouped, ([name, qty]) => ({ name, qty }));

    // 3. Tentukan Nama Utama (Jika 1 barang pakai namanya, jika banyak pakai MIXED)
    const namaBarangUtama = distinctItems.length === 1
      ? distinctItems[0].name
      : "CAMPURAN / MIXED ITEMS";

    // 4. Buat Tabel Ringkasan (MAKSIMAL 7 ITEM)
    let contentHtml = `<table style="width:100%; border-collapse:collapse; font-size:6.5pt; line-height:1">`;
    distinctItems.slice(0, 7).forEach(item => {
      contentHtml += `
        <tr>
          <td style="text-align:left; padding-bottom:1px; border-bottom:0.1pt solid #eee; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px;">
            ${item.name}
          </td>
          <td style="text-align:right; font-weight:bold; width:35px">${item.qty}</td>
        </tr>`;
    });

    if (distinctItems.length > 7) {
      contentHtml += `<tr><td colspan="2" style="text-align:center; font-style:italic; font-size:5.5pt">... & ${distinctItems.length - 7} item lainnya</td></tr>`;
    }
    contentHtml += `</table>`;

    // 5. Rincian Ukuran (Footer)
    let footerText = items.slice(0, 10).map((it) => `${it.Ukuran}=${Math.floor(it.Jumlah)}`).join(', ');
    if (items.length > 10) footerText = "RINCIAN LENGKAP ADA PADA SURAT JALAN";

    const dataToPrint: PrintLabelData = {
      nomorPL: selectedRow.value.Nomor || '-',
      nomorMinta: selectedRow.value.NoMinta || '-',
      tujuan: selectedRow.value.Nama_Store || '-',
      totalQty: totalQty,
      contentHtml: contentHtml,
      detailUkuran: footerText,
      namaBarang: namaBarangUtama
    };

    // Panggil fungsi cetak dengan orientasi terpilih
    triggerLabelPrint(dataToPrint, orientation);

  } catch (error) {
    toast.error("Gagal mengambil data detail packing.");
    console.error(error);
  } finally {
    isPrintingLabel.value = false;
  }
};

const triggerLabelPrint = async (data: PrintLabelData, orientation: 'landscape' | 'portrait') => {
  const printWindow = document.createElement('iframe');
  printWindow.style.position = 'fixed';
  printWindow.style.top = '-9999px';
  document.body.appendChild(printWindow);

  const doc = printWindow.contentWindow?.document;
  if (!doc) return;

  // Generate QR (250px cukup untuk kualitas cetak thermal)
  const qrDataUrl = await QRCode.toDataURL(data.nomorPL, { margin: 1, width: 250 });

  const paperWidth = orientation === 'landscape' ? '70mm' : '50mm';
  const paperHeight = orientation === 'landscape' ? '50mm' : '70mm';

  const style = `
    <style>
      @page {
        size: ${paperWidth} ${paperHeight} ${orientation};
        margin: 0;
      }
      body {
        margin: 0; padding: 0;
        width: ${paperWidth}; height: ${paperHeight};
        font-family: 'Arial Narrow', Arial, sans-serif;
        background: white; overflow: hidden;
      }
      .label-container {
        width: ${paperWidth}; height: ${paperHeight};
        /* Padding kiri 5mm agar QR tidak mepet kiri kertas */
        padding: 1.5mm 4mm 1.5mm 5mm;
        box-sizing: border-box;
        display: flex; flex-direction: column;
        page-break-after: always;
      }
      .box {
        border: 1.2pt solid black;
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
      }

      .header-row {
        display: flex;
        border-bottom: 1.2pt solid black;
        padding: 2px;
        gap: 6px;
        align-items: center; /* QR dan Teks sejajar tengah secara vertikal */
      }

      .qr-area { width: 65px; height: 65px; flex-shrink: 0; }
      .qr-area img { width: 100%; height: 100%; }

      /* AREA INFORMASI (DIKECILKAN AGAR PROPORSIONAL) */
      .info-area { line-height: 1.2; font-weight: 700; flex-grow: 1; color: black; overflow: hidden; }

      /* No PL: 10.5pt (Cukup besar tapi tidak meluap) */
      .pl-no { font-size: 10.5pt; border-bottom: 0.8pt solid black; margin-bottom: 2px; white-space: nowrap; }

      /* Detail MT, TO, QTY: 9pt (Standar label logistik) */
      .mt-no, .to-store { font-size: 9pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .total-qty { font-size: 9pt; margin-top: 1px; font-weight: 800; }

      .body-area { flex-grow: 1; padding: 2px; display: flex; flex-direction: column; justify-content: start; overflow: hidden; }

      .footer-summary {
        font-size: 6.5pt; font-weight: bold; border-top: 1pt solid black;
        padding: 1px 2px; text-align: center; background: #f0f0f0;
        white-space: nowrap; overflow: hidden;
      }

      table { width: 100%; border-collapse: collapse; font-size: 7.2pt; table-layout: fixed; }
      td { padding: 1px 2px; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    </style>
  `;

  let htmlContent = '';
  for (let i = 0; i < 2; i++) {
    htmlContent += `
      <div class="label-container">
        <div class="box">
          <div class="header-row">
            <div class="qr-area"><img src="${qrDataUrl}" /></div>
            <div class="info-area">
              <div class="pl-no">${data.nomorPL}</div>
              <div class="mt-no">MT: ${data.nomorMinta}</div>
              <div class="to-store">TO: ${data.tujuan}</div>
              <div class="total-qty">TOTAL QTY: ${data.totalQty}</div>
            </div>
          </div>
          <div class="body-area">${data.contentHtml}</div>
          <div class="footer-summary">${data.detailUkuran}</div>
        </div>
      </div>
    `;
  }

  doc.write('<html><head>' + style + '</head><body>' + htmlContent + '</body></html>');
  doc.close();

  // Tunggu sejenak agar iframe siap
  setTimeout(() => {
    printWindow.contentWindow?.focus();
    printWindow.contentWindow?.print();
    setTimeout(() => document.body.removeChild(printWindow), 2500);
  }, 500);
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (masterData.value.length === 0) return toast.warning('Tidak ada data header.');
    try {
      const worksheet = XLSX.utils.json_to_sheet(masterData.value);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "PL Header");
      XLSX.writeFile(workbook, "Export_Packing_List_Header.xlsx");
    } catch {
      toast.error('Gagal membuat file Excel.');
    }
  } else if (type === 'detail') {
    try {
      const response = await api.get('/packing-list/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "PL Detail");
      XLSX.writeFile(workbook, "Export_Packing_List_Detail.xlsx");
    } catch {
      toast.error('Gagal mengekspor data detail.');
    }
  }
};

const onProductSelected = (products: Product[]) => {
  if (products.length > 0) {
    filters.kodeBarang = products[0].kode;
    filters.namaBarang = products[0].nama;
  }
  dialog.searchProduct = false;
};

// --- Helpers Display ---
const getStatusText = (status: string) => {
  if (status === 'O' || status === 'OPEN') return 'OPEN';
  if (status === 'SENT' || status === 'C') return 'KIRIM (OTW)';
  if (status === 'RECEIVED') return 'DITERIMA';
  return status;
};

const getStatusChipColor = (status: string) => {
  if (status === 'O' || status === 'OPEN') return 'red';
  if (status === 'SENT' || status === 'C') return 'blue';
  if (status === 'RECEIVED') return 'grey-darken-3';
  return 'grey';
};

const rowProps = (data: { item: PackingListHeader }) => {
  const item = data.item;
  let textColor = '';
  if (item.Status === 'O' || item.Status === 'OPEN') {
    textColor = 'text-red font-weight-medium';
  } else if (item.Status === 'SENT' || item.Status === 'C') {
    textColor = 'text-blue';
  } else {
    textColor = '';
  }
  return { class: textColor };
};

onMounted(async () => {
  await fetchCabangList();
  if (authStore.can(MENU_ID, 'view')) {
    fetchMasterData();
  } else {
    toast.error('Anda tidak memiliki hak akses.');
    router.push('/');
  }
});

let debounceTimer: number;
watch(filters, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { fetchMasterData(); }, 500);
}, { deep: true });

watch(() => filters.kodeBarang, (newVal) => { if (!newVal) filters.namaBarang = ''; });
</script>

<template>
  <PageLayout title="Packing List / Pra-SJ" icon="mdi-package-variant-closed">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="handleEdit">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="showDeleteConfirmation">Hapus</v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="secondary" prepend-icon="mdi-printer" :disabled="!isSingleSelected" v-bind="props">
            Cetak <v-icon end icon="mdi-chevron-down"></v-icon>
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="handlePrint">
            <template #prepend><v-icon size="small">mdi-file-document-outline</v-icon></template>
            <v-list-item-title>Cetak SJ (A4)</v-list-item-title>
          </v-list-item>

          <v-divider />
          <v-list-item @click="handlePrintLabel('landscape')" :loading="isPrintingLabel">
            <template #prepend><v-icon size="small" color="purple">mdi-file-image-outline</v-icon></template>
            <v-list-item-title>Label QR</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">Export</v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"><v-list-item-title>Export Header</v-list-item-title></v-list-item>
          <v-list-item @click="exportData('detail')"><v-list-item-title>Export Detail</v-list-item-title></v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-divider vertical class="mx-2" />
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined" />
        <v-label class="filter-label mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined" />

        <v-select label="Cabang Tujuan" v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
          density="compact" hide-details variant="outlined" class="ms-4" style="max-width: 200px;" />

        <v-text-field v-model="filters.kodeBarang" placeholder="Cari Barang (F1)" density="compact" hide-details
          clearable variant="outlined" style="max-width: 300px;" @keydown.f1.prevent="dialog.searchProduct = true">
        </v-text-field>
        <v-text-field v-model="filters.namaBarang" placeholder="Nama Barang" density="compact" hide-details readonly
          variant="outlined" class="filter-nama-barang ms-2" style="max-width: 200px;">
        </v-text-field>

        <v-spacer />

        <v-btn class="reset-filter-btn ms-2" color="error" variant="tonal" icon @click="resetAllFilters">
          <v-icon size="18">mdi-filter-off</v-icon>
        </v-btn>

        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="text" size="small" class="ms-2" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="masterHeaders" :items="filteredList"
          :loading="loading" :row-props="rowProps" item-value="Nomor" density="compact"
          class="desktop-table header-browse-blue" fixed-header show-select show-expand return-object single-select
          @update:expanded="loadDetails" @click:row="handleRowClick">
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th v-if="['data-table-expand', 'data-table-select'].includes(header.key)"
                  :style="{ width: header.width + 'px' }" class="resizable-header">
                  <div class="header-content"><span>{{ header.title }}</span></div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
                </th>

                <th v-else :style="{ width: header.width + 'px' }" class="resizable-header" @click="toggleSort(header)">
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="14">{{ getSortIcon(header) }}</v-icon>

                    <v-menu location="bottom start" :close-on-content-click="false">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="16" class="ms-1" @click.stop
                          :color="isFilterActive(header.key) ? 'blue' : ''"
                          :icon="filterType(header.key) === 'custom' ? 'mdi-filter-cog' : filterType(header.key) === 'multi' ? 'mdi-filter-multiple' : 'mdi-filter-variant'" />
                      </template>
                      <v-list class="filter-menu" density="compact">
                        <v-list-item @click="clearColumnFilter(header.key)">
                          <v-list-item-title class="text-caption font-weight-bold text-error">(Clear
                            Filter)</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item v-for="val in uniqueValues(header.key)" :key="val"
                          @click="toggleMultiSelectValue(header.key, val)">
                          <template #prepend>
                            <v-checkbox-btn :model-value="columnFilters[header.key]?.values?.includes(val)"
                              density="compact" />
                          </template>
                          <v-list-item-title>{{ formatFilterValue(header.key, val) }}</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click="openCustomFilter(header.key)">
                          <v-list-item-title class="text-caption text-primary">(Custom Filter...)</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn icon="mdi-chevron-down" :class="{ 'rotate-180': isExpanded(internalItem) }" size="x-small"
              variant="text" @click.stop="toggleExpand(internalItem)" />
          </template>

          <template #[`item.Nomor`]="{ item }">
            <strong>{{ item.Nomor }}</strong>
          </template>

          <template #[`item.Tanggal`]="{ item }">
            {{ format(new Date(item.Tanggal as string), 'dd-MM-yyyy') }}
          </template>

          <template #[`item.Status`]="{ item }">
            <v-chip size="x-small" :color="getStatusChipColor(item.Status)" class="font-weight-bold" variant="flat">
              {{ getStatusText(item.Status) }}
            </v-chip>
          </template>

          <template #[`item.NoSJFinal`]="{ item }">
            <span :class="item.NoSJFinal !== '-' ? 'text-green font-weight-bold' : 'text-grey'">
              {{ item.NoSJFinal }}
            </span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>
                    <v-data-table v-else-if="details[item.Nomor]" class="detail-table" :headers="detailHeaders"
                      :items="details[item.Nomor]" density="compact" :items-per-page="-1" hide-default-footer>
                      <template #[`item.Jumlah`]="{ item }">
                        <strong>{{ formatNumber(item.Jumlah) }}</strong>
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-2">
                      Tidak ada data detail.
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
      <div v-if="printData" class="print-only">
        <div v-for="i in 2" :key="i" class="label-print-container">
          <div class="label-print-box">
            <div class="label-header">
              <div class="qr-zone">
                <qrcode-vue :value="printData.nomorPL" :size="70" level="H" />
              </div>
              <div class="info-zone">
                <div class="line-info"><strong>{{ printData.nomorPL }}</strong></div>
                <div class="line-info">{{ printData.nomorMinta }}</div>
                <div class="line-info">{{ printData.tujuan }}</div>
                <div class="line-info">TOTAL QTY: {{ printData.totalQty }}</div>
              </div>
            </div>
            <div class="label-body">
              <div class="product-name">{{ printData.namaBarang }}</div>
              <div class="size-detail">{{ printData.detailUkuran }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ProductSearchModal v-if="dialog.searchProduct" category="ALL" :source="'surat-jalan'"
      :gudang="authStore.user?.cabang || ''" @close="dialog.searchProduct = false"
      @products-selected="onProductSelected" />

    <v-dialog v-model="dialog.confirm" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>{{ confirmText }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialog.confirm = false">Tidak</v-btn>
          <v-btn color="error" variant="tonal" @click="confirmAction && confirmAction(); dialog.confirm = false">
            Ya, Hapus
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold">Custom Filter</v-card-title>
        <v-card-text>
          <v-select v-model="customFilter.operator"
            :items="['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts', 'ends']" density="compact" hide-details
            class="mb-2" />
          <v-text-field v-model="customFilter.value" density="compact" hide-details autofocus placeholder="Value..." />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Batal</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">Terapkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Layout Full Height */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Table Style */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* Header Resize */
.resizable-header {
  position: relative;
  background-color: #e3f2fd !important;
  color: #0d47a1 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #1976d2 !important;
  padding: 0 8px !important;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
}

.resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 10;
}

.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid #1565c0;
}

/* Detail Sticky (Left) */
.detail-container {
  position: sticky;
  left: 0;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: flex-start;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-size: 11px !important;
  height: 32px !important;
}

.filter-menu {
  max-height: 300px;
  overflow-y: auto;
}

/* --- TOMBOL RESET FILTER --- */
.reset-filter-btn {
  width: 40px;
  height: 40px;

  border-radius: 6px !important;
  /* sama seperti input */
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}

.filter-nama-barang :deep(input) {
  font-size: 11px !important;
}

@media screen {
  .print-only {
    display: none;
  }
}

@media print {

  /* Sembunyikan semua elemen UI */
  body * {
    visibility: hidden;
  }

  .print-only,
  .print-only * {
    visibility: visible;
  }

  .print-only {
    position: absolute;
    left: 0;
    top: 0;
    width: 7cm;
  }

  @page {
    size: 7cm 5cm;
    margin: 0;
  }

  .label-print-container {
    width: 7cm;
    height: 5cm;
    page-break-after: always;
    display: flex;
    flex-direction: column;
    padding: 0.2cm;
    box-sizing: border-box;
    background: white;
  }

  .label-print-box {
    border: 1px solid black;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .label-header {
    display: flex;
    border-bottom: 1.5px solid black;
    padding: 5px;
    gap: 10px;
  }

  .info-zone {
    font-size: 10pt;
    line-height: 1.2;
    font-family: Arial, sans-serif;
  }

  .label-body {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 5px;
  }

  .product-name {
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    line-height: 1.1;
  }

  .size-detail {
    font-size: 13pt;
    font-weight: bold;
    margin-top: 5px;
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, addDays, isValid } from 'date-fns';
import type { AxiosError } from 'axios';
import axios from 'axios';

// Impor semua komponen modal yang akan digunakan
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
import GudangSearchModal from '@/components/lookup/GudangSearchModal.vue';
import SalesCounterSearchModal from '@/components/lookup/SalesCounterSearchModal.vue';
import ProductSearchModal from '@/components/lookup/ProductSearchModal.vue';
import PenawaranSearchModal from '@/components/lookup/PenawaranSearchModal.vue';
import SoDtfSearchModal from '@/components/lookup/SoDtfSearchModal.vue';
import PriceProposalSearchModal from '@/components/lookup/PriceProposalSearchModal.vue';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
import DpInputModal from '@/components/modal/DpInputModal.vue';
import CustomerForm from '@/components/form/CustomerForm.vue';
import DpListModal from '@/components/modal/DpListModal.vue';
import DiscountCostModal from '@/components/modal/DiscountCostModal.vue';

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '26';

// --- Interfaces ---
interface SoItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number | null;
  harga: number | null;
  diskonPersen: number;
  diskonRp: number;
  total: number;
  barcode: string;
  noSoDtf: string;
  noPengajuanHarga: string;
  pin: string;
}

interface DpItem {
  nomor: string;
  jenis: string;
  posting: string;
  fsk: string;
  nominal: number;
}

interface Customer {
  kode: string;
  nama: string;
  alamat?: string;
  kota?: string;
  telp?: string;
  discountRule?: {
    nominal: number;
    diskon1: number;
    diskon2: number;
  };
  level_kode: string;    // tambahan
  level_nama: string;    // tambahan
  top: number;           // tambahan
  franchise: 'Y' | 'N';
}

interface SoItemApi {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number | null;
  harga: number | null;
  diskonPersen: number;
  diskonRp: number;
  total: number;
  barcode: string;
  noSoDtf: string;
  noPengajuanHarga: string;
  pin: string;
}

interface Item {
  kode: string;
  jumlah: number;
  diskonPersen: number;
  noSoDtf?: string;
  noPengajuanHarga?: string;
  id: number;
  [key: string]: unknown;
}

interface PenawaranDetail {
  kode: string;
  jumlah: number;
  harga: number;
  diskonPersen?: number;
  diskonRp?: number;
  total?: number;
  noSoDtf?: string;
  noPengajuanHarga?: string;
  [key: string]: unknown;
}

interface SoDtfDetail {
  sd_nomor: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  total: number;
}

interface PriceProposalHeader {
  ph_nomor: string;
  ph_diskon: number;
}

interface PriceProposalDetail {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  harga: number;
  total: number;
  barcode: string;
}

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Surat Pesanan' : 'Buat Surat Pesanan');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');
const isLoading = ref(true);
const isSaving = ref(false);
const isSavingDisabled = ref(false);
const scannedBarcode = ref('');

const initialHeaderState = {
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  dateline: format(addDays(new Date(), -1), 'yyyy-MM-dd'),
  gudang: { kode: authStore.user?.cabang || '', nama: authStore.user?.cabangNama || '' },
  customer: null as Customer | null,
  penawaran: '',
  salesCounter: authStore.user?.kode || '',
  levelKode: '',
  levelNama: '',
  keterangan: '',
  telp: '',
  top: 0,
  alamat: '',
  kota: '',
  tempo: '',
  ppnPersen: 0,
  statusSo: 'PASIF',
  accDpPin: '',
};

const header = ref({ ...initialHeaderState });

const items = ref<SoItem[]>([]);
const dpItems = ref<DpItem[]>([]);

const footer = ref({
  totalSo: 0,
  diskonRp: 0,
  diskonPersen1: 0,
  diskonPersen2: 0,
  biayaKirim: 0,
  ppnRp: 0,
  netto: 0,
  grandTotal: 0,
  totalDp: 0,
  minimalDp: 0,
  belumDibayar: 0,
  pinTanpaDp: '',
  pinDiskon1: undefined,
  pinDiskon2: undefined,
});

// State untuk modals & dialogs
const isGudangSearchVisible = ref(false);
const isCustomerSearchVisible = ref(false);
const isSalesCounterSearchVisible = ref(false);
const isPenawaranSearchVisible = ref(false);
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
const isSoDtfSearchVisible = ref(false);
const isPriceProposalSearchVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);
const isPrintConfirmVisible = ref(false); // State untuk dialog baru
const printConfirmNomor = ref(''); // Untuk menyimpan nomor SO yang akan dicetak
const activeRowIndex = ref(0);
const isItemAuthModalVisible = ref(false);
const isDpAuthVisible = ref(false);
const activeItemIndexForAuth = ref(-1);
// const previousDiscount = ref({ persen1: 0, persen2: 0, item: 0 });
const previousItemDiscount = ref<{ index: number; diskonPersen: number; diskonRp: number }>({
  index: -1,
  diskonPersen: 0,
  diskonRp: 0
});
const challengeCode = ref('');
const itemAuthModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const dpAuthModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const isDpInputVisible = ref(false);
const isNewCustomerFormVisible = ref(false);
const focusedRowId = ref<number | string>(-1);
const isDiscountCostModalVisible = ref(false);
const isDpListModalVisible = ref(false);
const totalDiscountable = ref(0);

const formatRupiah = (angka: number) => {
  return new Intl.NumberFormat('id-ID').format(angka || 0);
};

const mainTableHeaders = [
  { title: 'Kode', key: 'kode', width: '180px' },
  { title: 'Nama Barang', key: 'nama', width: '250px' },
  { title: 'Ukuran', key: 'ukuran', width: '90px' },
  { title: 'Stok', key: 'stok', align: 'end', width: '80px' },
  { title: 'Jumlah', key: 'jumlah', width: '100px' },
  { title: 'Harga', key: 'harga', width: '120px' },
  { title: 'Diskon %', key: 'diskonPersen', width: '100px' },
  { title: 'Diskon Rp', key: 'diskonRp', width: '120px' },
  { title: 'Total', key: 'total', align: 'end', width: '140px' },
  { title: 'No. SO DTF', key: 'noSoDtf', width: '180px' },
  { title: 'No. Pengajuan', key: 'noPengajuanHarga', width: '180px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
] as const;

// const dpTableHeaders = [
//   { title: 'No. Setoran', key: 'nomor' },
//   { title: 'Jenis', key: 'jenis' },
//   { title: 'Nominal', key: 'nominal' },
//   { title: 'Posting', key: 'posting' },
//   { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
// ] as const;

// --- Computed Properties ---
const minimalDpText = computed(() => {
  const containsDtf = items.value.some(item => item.noSoDtf);
  const percentage = containsDtf ? 50 : 30;
  const amount = new Intl.NumberFormat('id-ID').format(footer.value.minimalDp);
  return `Minimal DP ${percentage}% dari nominal SO : ${amount}`;
});

// --- Functions ---
function toDateInputValue(dateStr: string) {
  if (!dateStr) return ''
  return dateStr.split('T')[0] // ambil yyyy-MM-dd saja
}

// --- Methods ---
const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {

    const response = await api.get(`/so-form/${nomor}`);
    const { headerData, itemsData, dpItemsData, footerData } = response.data;

    // ===== MAPPING HEADER =====
    header.value = {
      ...header.value,
      ...headerData,
      level: headerData.levelKode || '',
      levelKode: headerData.levelKode || '',
      levelNama: headerData.levelNama || '',
      tanggal: toDateInputValue(headerData.tanggal),
      dateline: toDateInputValue(headerData.dateline),
    };

    // ===== MAPPING FOOTER =====
    footer.value = {
      ...footer.value,
      ...footerData
    };

    // ===== MAPPING ITEMS =====
    items.value = itemsData.map((item: Item, index: number): Item => {
      return {
        ...item,
        id: Date.now() + Math.random() + index,
      };
    });

    // ===== MAPPING DP ITEMS =====
    dpItems.value = dpItemsData;

    // ===== EDIT PERMISSION CHECK =====
    if (!headerData.canEdit) {
      isSavingDisabled.value = true;
      toast.warning('SO ini sudah menjadi Invoice, data tidak bisa diubah.');
    }

    // ===== CRITICAL SECTION: ADD NEW ROW =====
    try {
      addNewRow();
    } catch (addRowError) {
      throw new Error(`addNewRow failed: ${addRowError.message}`);
    }

    // ===== CRITICAL SECTION: AWAIT NEXTTICK =====
    try {
      await nextTick();
    } catch (nextTickError) {
      throw new Error(`nextTick failed: ${nextTickError.message}`);
    }

    // ===== CRITICAL SECTION: CALCULATE TOTALS =====
    try {
      calculateTotals();
    } catch (calcError) {
      throw new Error(`calculateTotals failed: ${calcError.message}`);
    }

    toast.success(`Data untuk SO ${nomor} berhasil dimuat.`);

  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || err.message || 'Gagal memuat data SO.');
    router.push('/transaksi/penjualan/surat-pesanan');
  } finally {
    isLoading.value = false;
  }
};

const calculateTotals = () => {
  let totalSoBruto = 0;
  let newTotalDiscountable = 0; // Variabel sementara untuk total yang bisa didiskon
  let containsDtf = false;

  items.value.forEach(item => {
    const qty = Number(item.jumlah) || 0;
    const harga = Number(item.harga) || 0;

    // Logika diskon per item (tidak berubah)
    if (item.diskonPersen > 0) {
      item.diskonRp = (item.diskonPersen / 100) * harga;
    }
    item.total = qty * (harga - (item.diskonRp || 0));

    // Tambahkan ke total bruto (semua item)
    totalSoBruto += item.total;

    if (item.noSoDtf) {
      containsDtf = true;
    } else {
      // [PERUBAIKAN] Hanya item non-DTF yang masuk hitungan diskon faktur
      newTotalDiscountable += item.total;
    }
  });

  footer.value.totalSo = totalSoBruto; // Total SO adalah total bruto
  totalDiscountable.value = newTotalDiscountable; // Simpan total diskon-able ke ref

  // Kalkulasi Total DP (tidak berubah)
  const totalDp = dpItems.value.reduce((sum, dp) => sum + (dp.nominal || 0), 0);
  footer.value.totalDp = totalDp;

  // --- [PERBAIKAN] Kalkulasi Diskon Faktur ---

  // Ambil nilai diskon % dari footer
  const diskonPersen1 = footer.value.diskonPersen1 || 0;
  const diskonPersen2 = footer.value.diskonPersen2 || 0;

  // Cek apakah diskonRp diisi manual (dari modal)
  if (footer.value.diskonRp > 0) {
    // Jika diisi manual, biarkan.
    // (Modal sudah me-reset persen menjadi 0)
  } else {
    // Jika tidak, hitung diskonRp berdasarkan PERSEN dan total yang BISA DIDISKON
    const diskon1Rp = (diskonPersen1 / 100) * newTotalDiscountable;
    const afterDiscount1 = newTotalDiscountable - diskon1Rp;
    const diskon2Rp = (diskonPersen2 / 100) * afterDiscount1;
    footer.value.diskonRp = diskon1Rp + diskon2Rp;
  }

  // --- Kalkulasi Grand Total (berdasarkan Total Bruto) ---
  const netto = totalSoBruto - footer.value.diskonRp; // Netto = Total Bruto - Diskon Faktur
  footer.value.netto = netto;

  const ppnRp = (header.value.ppnPersen / 100) * netto;
  footer.value.ppnRp = ppnRp;

  const grandTotal = netto + ppnRp + (footer.value.biayaKirim || 0);
  footer.value.grandTotal = grandTotal;

  // Kalkulasi Minimal DP (berdasarkan Netto, sudah benar)
  if (containsDtf) {
    footer.value.minimalDp = 0.5 * footer.value.netto;
  } else {
    footer.value.minimalDp = 0.3 * footer.value.netto;
  }

  footer.value.belumDibayar = footer.value.grandTotal - footer.value.totalDp;

  // Penentuan Status SO (tidak berubah)
  const isLevel8 = header.value.levelKode?.toString().startsWith('8');
  if (isLevel8 || totalDp >= footer.value.minimalDp) {
    header.value.statusSo = 'AKTIF';
  } else {
    header.value.statusSo = 'PASIF';
  }
};

const openDpAuthorization = () => {
  challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
  isDpAuthVisible.value = true;
};

const openGudangSearch = () => {
  // Gudang hanya bisa diubah saat membuat SO baru
  if (!isEditMode.value) {
    isGudangSearchVisible.value = true;
  }
};

// const openCustomerSearch = () => {
//     if (!header.value.gudang.kode) {
//         toast.error('Pilih Gudang terlebih dahulu.');
//         return;
//     }
//     isCustomerSearchVisible.value = true;
// };

const openSalesCounterSearch = () => {
  isSalesCounterSearchVisible.value = true;
};

const openPenawaranSearch = () => {
  if (!header.value.gudang.kode) {
    toast.error('Pilih Gudang terlebih dahulu.');
    return;
  }
  isPenawaranSearchVisible.value = true;
};

const openProductSearch = (index: number, isMulti: boolean) => {
  if (!header.value.customer) {
    toast.error('Pilih Customer terlebih dahulu.');
    return;
  }
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti; // Set mode multi atau single
  isProductSearchVisible.value = true;
};

const openSoDtfSearch = (index: number) => {
  if (!header.value.customer) {
    toast.error('Pilih Customer terlebih dahulu.');
    return;
  }
  activeRowIndex.value = index;
  isSoDtfSearchVisible.value = true;
};

const openPriceProposalSearch = (index: number) => {
  if (!header.value.customer) {
    toast.error('Pilih Customer terlebih dahulu.');
    return;
  }
  activeRowIndex.value = index;
  isPriceProposalSearchVisible.value = true;
};

const save = () => {
  // --- Migrasi Validasi dari Delphi (btnSimpanClick) ---
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    return;
  }

  const todayString = format(new Date(), 'yyyy-MM-dd');

  if (header.value.dateline < todayString) {
    toast.error('Dateline tidak boleh kurang dari hari ini. Silakan periksa kembali.');
    return; // Blokir penyimpanan
  }

  if (!header.value.customer) {
    toast.error('Customer harus diisi.');
    return;
  }
  const validItems = items.value.filter(item => item.kode);
  if (validItems.length === 0) {
    toast.error('Detail barang harus diisi minimal 1 baris.');
    return;
  }
  for (const item of validItems) {
    if (!item.jumlah || item.jumlah <= 0) {
      toast.error(`Jumlah untuk barang '${item.nama}' harus diisi dan lebih dari 0.`);
      return;
    }
    if (item.harga === null || item.harga < 0) {
      toast.error(`Harga untuk barang '${item.nama}' harus diisi.`);
      return;
    }
  }
  if (footer.value.totalDp < footer.value.minimalDp && header.value.statusSo === 'PASIF') {
    toast.warning('DP di bawah Minimal DP. SO ini akan berstatus PASIF. Minta otorisasi atau lunasi DP agar SO menjadi AKTIF.');
    // Tidak menghentikan proses, hanya memberi peringatan
  }

  // Jika semua validasi lolos, tampilkan dialog konfirmasi
  showConfirmation(executeSave, "Anda yakin ingin menyimpan Surat Pesanan ini?");
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: {
        ...header.value,
        level: header.value.levelKode
      },
      footer: footer.value,
      details: items.value.filter(item => item.kode),
      dps: dpItems.value,
      isNew: !isEditMode.value,
      user: authStore.user // Pastikan user juga dikirim
    };
    const response = await api.post('/so-form/save', payload);
    toast.success(response.data.message);
    const soNomor = response.data.nomor;
    if (soNomor) {
      // 2. Simpan nomor untuk dialog
      printConfirmNomor.value = soNomor;
      // 3. Buka dialog konfirmasi cetak
      isPrintConfirmVisible.value = true;

      // (Kita tidak lagi router.push di sini)
      // router.push('/transaksi/penjualan/surat-pesanan');

    } else {
      // 4. Fallback jika 'nomor' tidak ditemukan di respons
      toast.error('Gagal mendapatkan nomor SO untuk dicetak. Mengarahkan ke daftar.');
      router.push('/transaksi/penjualan/surat-pesanan');
    }
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const handlePrintConfirm = () => {
  if (!printConfirmNomor.value) return;

  try {
    // 1. Resolve URL dari named route 'Cetak Surat Pesanan'
    const routeData = router.resolve({
      name: 'Cetak Surat Pesanan', // <-- Nama route dari yang Anda berikan
      params: { nomor: printConfirmNomor.value }
    });

    // 2. Buka URL di tab baru
    window.open(routeData.href, '_blank');

  } catch (error) {
    console.error("Gagal membuka halaman cetak SO:", error);
    toast.error('Gagal membuka halaman cetak. Pastikan route "Cetak Surat Pesanan" ada.');
  } finally {
    // 3. Tutup dialog dan kembali ke halaman browse
    isPrintConfirmVisible.value = false;
    printConfirmNomor.value = '';
    router.push('/transaksi/penjualan/surat-pesanan');
  }
};

// Fungsi ini dipanggil jika user menekan "Tidak, Kembali"
const handlePrintCancel = () => {
  isPrintConfirmVisible.value = false;
  printConfirmNomor.value = '';
  // Langsung kembali ke halaman browse
  router.push('/transaksi/penjualan/surat-pesanan');
};

const showConfirmation = (action: () => void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
};

const addNewRow = () => {
  // Cek agar tidak menambah baris kosong jika sudah ada
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(),
      kode: '',
      nama: '',
      ukuran: '',
      stok: 0,
      jumlah: null,
      harga: null,
      diskonPersen: 0,
      diskonRp: 0,
      total: 0,
      barcode: '',
      noSoDtf: '',
      noPengajuanHarga: '',
      pin: ''
    });
  }
};

const resetForm = () => {
  header.value = { ...initialHeaderState };
  items.value = [];
  dpItems.value = []; // Pastikan DP items juga direset
  addNewRow(); // Panggil ini untuk membuat baris kosong awal
};

const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
  calculateTotals(); // Hitung ulang total setelah menghapus
};

const onGudangSelected = (gudang: { kode: string, nama: string }) => {
  header.value.gudang = gudang;
  isGudangSearchVisible.value = false;
};

const onCustomerSelected = async (customer: Customer) => {
  isCustomerSearchVisible.value = false;
  if (!customer || !customer.kode) return;

  // 1. Cek Level Customer
  if (!customer.level_kode) {
    toast.error('Level Customer tersebut belum di-setting.');
    header.value.customer = null; // Kosongkan customer
    return;
  }

  // 2. Cek Customer Prioritas (Franchise)
  const gudang = header.value.gudang.kode;
  if (gudang === 'KPR' && customer.franchise !== 'Y') {
    toast.error('Customer bukan Customer Prioritas.');
    header.value.customer = null;
    return;
  }
  if (gudang !== 'KPR' && customer.franchise === 'Y') {
    toast.error('Customer Prioritas hanya bisa transaksi di Store KPR.');
    header.value.customer = null;
    return;
  }

  // Jika semua validasi lolos, isi data header
  header.value.customer = customer;
  header.value.levelKode = customer.level_kode; // utk backend
  header.value.levelNama = customer.level_nama; // utk tampilan
  header.value.top = customer.top;
  header.value.alamat = customer.alamat;
  header.value.kota = customer.kota;
  header.value.telp = customer.telp;

  calculateTotals();
  toast.success(`Customer ${customer.nama} berhasil dipilih.`);
};

const onSalesCounterSelected = (salesCounter: { kode: string, nama: string }) => {
  header.value.salesCounter = salesCounter.kode; // Asumsi Anda menyimpan kodenya
  // Jika Anda juga perlu menyimpan nama, tambahkan ref-nya di 'header'
  // header.value.salesCounterNama = salesCounter.nama;
  isSalesCounterSearchVisible.value = false;
};

const onPenawaranSelected = async (penawaran: { nomor: string }) => {
  isPenawaranSearchVisible.value = false;
  toast.info(`Memuat detail dari Penawaran ${penawaran.nomor}...`);
  try {
    // 1. Panggil API (yang sudah kita modif di backend)
    // API lama: /so-form/lookup/penawaran-details/
    // API baru di service Anda: /so-form/lookup/penawaran-details/ (Sama, bagus)
    const response = await api.get(`/so-form/lookup/penawaran-details/${penawaran.nomor}`);

    // 2. Destructure data baru dari backend
    const { header: penawaranHeader, details: penawaranDetails, customer } = response.data;

    // 3. Validasi customer yang didapat
    if (!customer || !customer.kode) {
      toast.error('Gagal memuat data customer dari penawaran tersebut.');
      return;
    }

    // 4. Jalankan validasi customer (dari fungsi onCustomerSelected)
    if (!customer.level_kode) {
      toast.error(`Level Customer '${customer.nama}' belum di-setting.`);
      return;
    }
    const gudang = header.value.gudang.kode;
    if (gudang === 'KPR' && customer.franchise !== 'Y') {
      toast.error(`Customer '${customer.nama}' bukan Customer Prioritas.`);
      return;
    }
    if (gudang !== 'KPR' && customer.franchise === 'Y') {
      toast.error(`Customer Prioritas '${customer.nama}' hanya bisa transaksi di Store KPR.`);
      return;
    }

    // 5. Jika lolos validasi, isi SEMUA data

    // --- Isi Data Customer ---
    header.value.customer = customer;
    header.value.levelKode = customer.level_kode;
    header.value.levelNama = customer.level_nama;
    header.value.alamat = customer.alamat;
    header.value.kota = customer.kota;
    header.value.telp = customer.telp;
    header.value.top = customer.top; // Ambil TOP dari data customer

    // --- Isi Data Penawaran ---
    header.value.penawaran = penawaranHeader.pen_nomor;
    // (Opsional: Anda bisa pilih mau pakai TOP customer atau TOP penawaran)
    // header.value.top = penawaranHeader.pen_top; // Ambil TOP dari Penawaran
    header.value.keterangan = penawaranHeader.pen_ket;
    header.value.ppnPersen = penawaranHeader.pen_ppn;

    footer.value.biayaKirim = penawaranHeader.pen_bkrm;
    footer.value.diskonRp = penawaranHeader.pen_disc;
    footer.value.diskonPersen1 = penawaranHeader.pen_disc1;
    footer.value.diskonPersen2 = penawaranHeader.pen_disc2;

    // --- Isi Data Item ---
    // (Pastikan 'stok' juga dikirim oleh backend di 'detailRows' jika diperlukan)
    items.value = penawaranDetails.map((d: PenawaranDetail) => ({
      ...d,
      id: Date.now() + Math.random(),
      stok: d.stok || 0, // Pastikan stok ada
    }));

    addNewRow(); // Tambah baris kosong
    calculateTotals(); // Hitung ulang semua

    toast.success(`Customer ${customer.nama} dan detail Penawaran berhasil dimuat.`);

  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(`Gagal memuat detail Penawaran: ${error.response?.data?.message || error.message}`);
    } else {
      toast.error('Gagal memuat detail Penawaran.');
    }
  }
};

// Ganti dengan fungsi yang sudah terisi lengkap ini
const onProductsSelected = (selectedProducts: SoItemApi[]) => {
  isProductSearchVisible.value = false;
  if (!selectedProducts || selectedProducts.length === 0) return;

  // Hapus baris kosong tempat F1/F2 ditekan
  items.value.splice(activeRowIndex.value, 1);

  // Loop melalui setiap produk yang dipilih dari modal
  selectedProducts.forEach(product => {
    // Cek duplikasi sebelum menambahkan
    const isDuplicate = items.value.some(item => item.barcode === product.barcode);
    if (!isDuplicate) {
      // Buat objek item SO yang lengkap dan tambahkan ke grid
      items.value.push({
        id: Date.now() + Math.random(), // Kunci unik sementara
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        harga: product.harga,
        jumlah: 1, // Default jumlah 1
        diskonPersen: 0,
        diskonRp: 0,
        total: product.harga, // Total awal adalah harga satuan
        barcode: product.barcode,
        noSoDtf: '',
        noPengajuanHarga: '',
        pin: ''
      });
    }
  });

  addNewRow(); // Tambah baris kosong baru di akhir
  calculateTotals(); // Hitung ulang semua total
};

const onSoDtfSelected = async (soDtf: { nomor: string }) => {
  isSoDtfSearchVisible.value = false;
  items.value.splice(activeRowIndex.value, 1);

  try {
    const response = await api.get<SoDtfDetail[]>(`/offer-form/search/so-dtf-details/${soDtf.nomor}`);
    const soDtfDetails = response.data;

    soDtfDetails.forEach((detail) => {
      const isDuplicate = items.value.some(item =>
        item.noSoDtf === detail.sd_nomor && item.ukuran === detail.ukuran
      );

      if (!isDuplicate) {
        items.value.push({
          id: Date.now() + Math.random(),
          kode: detail.sd_nomor,
          nama: detail.nama,
          ukuran: detail.ukuran,
          jumlah: detail.jumlah,
          harga: detail.harga,
          total: detail.total,
          noSoDtf: detail.sd_nomor,
          stok: 0, diskonPersen: 0, diskonRp: 0, barcode: '', noPengajuanHarga: '', pin: ''
        });
      }
    });

    addNewRow();
    calculateTotals();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(`Gagal memuat detail SO DTF ${soDtf.nomor}: ${error.response?.data?.message}`);
    } else {
      toast.error(`Gagal memuat detail SO DTF ${soDtf.nomor}`);
    }
  }
};

const onPriceProposalSelected = async (proposal: { nomor: string }) => {
  isPriceProposalSearchVisible.value = false;
  if (!proposal || !proposal.nomor) return;

  const isDuplicate = items.value.some(item => item.noPengajuanHarga === proposal.nomor);
  if (isDuplicate) {
    toast.error(`No. Pengajuan ${proposal.nomor} sudah diinput di baris lain.`);
    return;
  }

  toast.info(`Memuat detail dari Pengajuan Harga ${proposal.nomor}...`);

  try {
    const response = await api.get<{ headerData: PriceProposalHeader; itemsData: PriceProposalDetail[] }>(
      `/offer-form/search/price-proposal-details/${proposal.nomor}`
    );
    const { headerData, itemsData } = response.data;

    items.value.splice(activeRowIndex.value, 1);

    itemsData.forEach((detail) => {
      items.value.push({
        id: Date.now() + Math.random(),
        kode: detail.kode,
        nama: detail.nama,
        ukuran: detail.ukuran,
        stok: detail.stok,
        jumlah: detail.jumlah,
        harga: detail.harga,
        total: detail.total,
        diskonPersen: 0,
        diskonRp: 0,
        barcode: detail.barcode,
        noPengajuanHarga: headerData.ph_nomor,
        noSoDtf: '',
        pin: ''
      });
    });

    footer.value.diskonRp = headerData.ph_diskon || 0;

    addNewRow();
    calculateTotals();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(`Gagal memuat detail Pengajuan ${proposal.nomor}: ${error.response?.data?.message}`);
    } else {
      toast.error(`Gagal memuat detail Pengajuan ${proposal.nomor}`);
    }
  }
};

// const handleDiscount1Change = async () => {
//   // Jangan lakukan apa-apa jika customer belum dipilih
//   if (!header.value.customer || !header.value.customer.level_kode) {
//     return;
//   }

//   try {
//     // 1. Panggil API untuk mendapatkan diskon standar
//     const response = await api.get('/so-form/lookup/default-discount', {
//       params: {
//         level: header.value.customer.level_kode,
//         total: footer.value.totalSo,
//         gudang: header.value.gudang.kode,
//       }
//     });
//     const defaultDiscountValue = response.data.discount;
//     const enteredDiscount = footer.value.diskonPersen1;

//     // 2. Jika diskon yang diinput BERBEDA dari standar, minta otorisasi
//     if (enteredDiscount !== defaultDiscountValue && enteredDiscount > 0) {
//       previousDiscount.value.persen1 = defaultDiscountValue;
//       challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
//       isAuthModalVisible.value = true;
//     } else {
//       calculateTotals();
//     }
//   } catch (error: unknown) {
//     if (axios.isAxiosError(error)) {
//       toast.error('Gagal memvalidasi diskon standar: ' + (error.response?.data?.message || ''));
//     } else {
//       toast.error('Gagal memvalidasi diskon standar.');
//     }
//   }
// };

// // Fungsi untuk menangani perubahan Diskon % 2
// const handleDiscount2Change = () => {
//   if (footer.value.diskonPersen1 <= 0 && footer.value.diskonPersen2 > 0) {
//     toast.error('Diskon % 1 silahkan diisi dulu.');
//     footer.value.diskonPersen2 = 0;
//     return;
//   }
//   if (footer.value.diskonPersen2 > 0) {
//     previousDiscount.value.persen2 = 0;
//     challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
//     isAuth2ModalVisible.value = true;
//   } else {
//     calculateTotals();
//   }
// };

// Fungsi untuk menangani perubahan Diskon % per item
const handleItemDiscountChange = (index: number) => {
  const item = items.value[index];

  // Skip jika tidak ada perubahan atau diskon = 0
  if (item.diskonPersen === 0) {
    calculateTotals();
    return;
  }

  if (item.diskonPersen > 0) {
    // Backup nilai sebelum meminta otorisasi
    previousItemDiscount.value = {
      index: index,
      diskonPersen: 0, // Nilai lama (asumsi sebelumnya 0)
      diskonRp: 0
    };

    activeItemIndexForAuth.value = index;
    challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
    isItemAuthModalVisible.value = true;
  } else {
    calculateTotals();
  }
};

const onItemAuthSuccess = async (pin: string) => {
  try {
    await api.post('/auth-pin/validate', { code: challengeCode.value, pin: pin });
    items.value[activeItemIndexForAuth.value].pin = pin;

    // Clear backup setelah sukses
    previousItemDiscount.value = { index: -1, diskonPersen: 0, diskonRp: 0 };

    isItemAuthModalVisible.value = false;
    toast.success('Otorisasi diskon item berhasil.');
    calculateTotals();
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    if (axiosError.response?.status === 401) {
      if (itemAuthModalRef.value) {
        itemAuthModalRef.value.setFailed(
          axiosError.response.data?.message || 'Otorisasi Gagal.'
        );
      }
    } else {
      toast.error(axiosError.response?.data?.message || 'Terjadi kesalahan.');
    }
  }
};

const onItemAuthCancel = () => {
  isItemAuthModalVisible.value = false;

  // Restore nilai dari backup
  const backup = previousItemDiscount.value;
  if (backup.index !== -1 && items.value[backup.index]) {
    items.value[backup.index].diskonPersen = backup.diskonPersen;
    items.value[backup.index].diskonRp = backup.diskonRp;
  }

  // Reset backup
  previousItemDiscount.value = { index: -1, diskonPersen: 0, diskonRp: 0 };

  calculateTotals();
};

const onDpAuthSuccess = async (pin: string) => {
  try {
    await api.post('/auth-pin/validate', { code: challengeCode.value, pin: pin });

    // Simpan pin dan set status menjadi AKTIF
    footer.value.pinTanpaDp = pin;
    header.value.statusSo = 'AKTIF';

    isDpAuthVisible.value = false;
    toast.success('Otorisasi SO tanpa DP berhasil.');
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;

    if (dpAuthModalRef.value) {
      dpAuthModalRef.value.setFailed(
        axiosError.response?.data?.message || 'Otorisasi Gagal.'
      );
    }
  }
};

const onDpAuthCancel = () => {
  isDpAuthVisible.value = false;
};

const openDpInput = () => {
  if (!header.value.customer) {
    return toast.error('Customer harus diisi terlebih dahulu.');
  }
  isDpInputVisible.value = true;
};

const onDpSaved = (newDp: DpItem) => {
  dpItems.value.push(newDp);
  calculateTotals();
};

const removeDpRow = (itemToRemove: DpItem) => {
  dpItems.value = dpItems.value.filter(item => item.nomor !== itemToRemove.nomor);
  calculateTotals(); // Hitung ulang total setelah menghapus DP
};

const executePendingAction = () => {
  if (pendingAction.value) {
    pendingAction.value();
  }
  isConfirmDialogVisible.value = false;
};
const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
  pendingAction.value = null;
};
const closeForm = () => {
  router.push('/transaksi/penjualan/surat-pesanan');
};

const onNewCustomerSaved = (newCustomer: Customer) => {
  // Panggil onCustomerSelected untuk menjalankan semua validasi & mengisi form
  onCustomerSelected(newCustomer);
};

const handleBarcodeScan = async () => {
  if (!header.value.customer?.kode) { // Ganti 'header.value.customer?.kode' jika perlu
    toast.error('Pilih customer terlebih dahulu sebelum scan barcode!');
    return; // Hentikan fungsi jika customer belum dipilih
  }
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  // --- LOGIKA 1: Jika barang sudah ada di grid, tambah jumlahnya ---
  const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
  if (existingItem) {
    existingItem.jumlah += 1;
    // Panggil fungsi untuk hitung ulang total jika ada
    // calculateTotals();
    toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
    scannedBarcode.value = ''; // Kosongkan input untuk scan berikutnya
    return;
  }

  // --- LOGIKA 2: Jika barang belum ada, cari via API dan tambahkan baris baru ---
  try {
    // Panggil API baru yang kita buat
    const response = await api.get(`/so-form/by-barcode/${barcode}`, {
      params: { gudang: header.value.gudang.kode } // Sesuaikan dengan cara Anda menyimpan kode gudang
    });

    const product = response.data;

    // Cari baris kosong pertama untuk diganti
    const emptyRowIndex = items.value.findIndex(item => !item.kode);

    if (emptyRowIndex !== -1) {
      // Ganti baris kosong dengan data produk baru
      items.value.splice(emptyRowIndex, 1, {
        id: Date.now(),
        kode: product.kode as string,
        nama: product.nama as string,
        ukuran: product.ukuran as string,
        stok: Number(product.stok),
        harga: Number(product.harga),
        jumlah: 1, // Default jumlah 1
        diskonPersen: 0,
        diskonRp: 0,
        total: Number(product.harga),
        barcode: product.barcode as string,
        noSoDtf: '',            // default kosong
        noPengajuanHarga: '',   // default kosong
        pin: ''                 // default kosong
      });
      addNewRow(); // Tambah baris kosong baru di akhir
    } else {
      // Jika tidak ada baris kosong (seharusnya tidak terjadi jika addNewRow dipakai)
      // Anda bisa tambahkan logika push di sini
      toast.error("Tidak ada baris kosong untuk menambahkan item baru.");
    }

    // Panggil fungsi untuk hitung ulang total jika ada
    // calculateTotals();

  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      // Error berasal dari Axios
      toast.error(err.response?.data?.message || `Barcode ${barcode} tidak valid.`);
    } else if (err instanceof Error) {
      // Error JS biasa
      toast.error(err.message);
    } else {
      // Error tak dikenal
      toast.error(`Barcode ${barcode} tidak valid.`);
    }
  } finally {
    scannedBarcode.value = '';
  }
};

watch(
  // Daftar semua state yang akan memicu kalkulasi ulang
  [
    items,
    () => header.value.ppnPersen,
    () => footer.value.biayaKirim,
    () => footer.value.diskonPersen1,
    () => footer.value.diskonPersen2,
    () => footer.value.diskonRp,
  ],
  () => {
    calculateTotals();
  },
  { deep: true } // 'deep' diperlukan untuk memantau perubahan di dalam 'items'
);

watch(
  [() => header.value.tanggal, () => header.value.top],
  ([newTanggal, newTop]) => {
    const date = new Date(newTanggal);
    if (isValid(date)) {
      header.value.tempo = format(addDays(date, newTop || 0), 'yyyy-MM-dd');
    }
  },
  { immediate: true } // immediate: true agar langsung dihitung saat form dimuat
);

onMounted(() => {
  // Cek hak akses 'insert' (untuk baru) atau 'edit' (untuk ubah)
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data ini.`);
    router.back(); // Lempar user kembali ke halaman sebelumnya
    return;
  }

  if (isEditMode.value) {
    loadDataForEdit(route.params.nomor as string);
  } else {
    resetForm();
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-file-document-edit-outline">
    <template #header-actions>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save" @click="save" :loading="isSaving"
        :disabled="isSaving || isSavingDisabled">
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-cancel"
        @click="showConfirmation(resetForm, 'Batalkan perubahan dan kosongkan form?')">
        Batal
      </v-btn>
      <v-btn size="small"
        @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')">
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">
      <!-- Kolom Kiri -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="5">
              <v-text-field label="Gudang" :disabled="!!header.penawaran" :model-value="header.gudang.kode" readonly
                @click="openGudangSearch" :class="{ 'field-disabled': isEditMode }" variant="outlined" density="compact"
                hide-details append-inner-icon="mdi-magnify" />
            </v-col>
            <v-col cols="7">
              <v-text-field :model-value="header.gudang.nama" readonly filled density="compact" hide-details />
            </v-col>
            <v-col cols="6"><v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact"
                hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="6">
              <v-text-field label="Customer" :disabled="!!header.penawaran"
                :model-value="header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''" readonly
                @click="isCustomerSearchVisible = true" variant="outlined" density="compact" hide-details
                append-inner-icon="mdi-magnify">
                <template #prepend-inner>
                  <v-btn :disabled="!!header.penawaran" icon="mdi-account-plus" size="x-small" variant="tonal"
                    class="me-2" @click.stop="isNewCustomerFormVisible = true" title="Buat Customer Baru"></v-btn>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="6"><v-text-field label="Dateline" v-model="header.dateline" type="date" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="12">
              <v-text-field label="Alamat" :model-value="header.customer?.alamat" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Kota / Telp"
                :model-value="header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''" readonly
                filled density="compact" hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Level" v-model="header.levelNama" readonly filled density="compact" hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Penawaran" v-model="header.penawaran" readonly @click="openPenawaranSearch"
                variant="outlined" density="compact" hide-details append-inner-icon="mdi-magnify" />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Sales Counter" v-model="header.salesCounter" readonly @click="openSalesCounterSearch"
                variant="outlined" density="compact" hide-details append-inner-icon="mdi-magnify" />
            </v-col>
            <v-col cols="3">
              <v-text-field label="TOP" v-model.number="header.top" type="number" variant="outlined" density="compact"
                hide-details class="text-end" />
            </v-col>
            <v-col cols="5">
              <v-text-field label="Tempo/Tgl" v-model="header.tempo" type="date" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="4">
              <v-text-field label="PPN %" v-model.number="header.ppnPersen" type="number" variant="outlined"
                density="compact" hide-details class="text-end" />
            </v-col>
            <v-col cols="12"><v-text-field label="Keterangan" v-model="header.keterangan" variant="outlined"
                density="compact" hide-details /></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section status-section">
          <v-alert density="compact" variant="tonal" :color="header.statusSo === 'AKTIF' ? 'success' : 'error'"
            class="mb-2 d-flex align-center">
            Status SO: <strong>{{ header.statusSo }}</strong>
            <v-spacer />
            <div class="text-caption text-center">{{ minimalDpText }}</div>
            <v-tooltip location="bottom">
              <template #activator="{ props }">
                <v-icon v-bind="props"
                  :color="(footer.totalDp >= footer.minimalDp) || footer.pinTanpaDp ? 'success' : 'warning'">
                  {{ (footer.totalDp >= footer.minimalDp) || footer.pinTanpaDp ? 'mdi-check-circle' :
                    'mdi-alert-circle' }}
                </v-icon>
              </template>
              <span>{{ (footer.totalDp >= footer.minimalDp) || footer.pinTanpaDp ? 'DP Memenuhi Syarat/Ada Otorisasi' : 'DP Belum Cukup' }}</span>
            </v-tooltip>
          </v-alert>
        </div>
      </div>

      <!-- Kolom Kanan -->
      <div class="right-column">
        <div class="scanner-wrapper">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
            placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
            prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan">
          </v-text-field>
        </div>
        <!-- Wrapper untuk bagian yang bisa scroll -->
        <div class="scrollable-content">
          <div class="desktop-form-section main-grid-section">
            <v-data-table :headers="mainTableHeaders" :items="items" class="desktop-table vertically-aligned-table"
              fixed-header height="calc(100vh - 480px)">
              <template #[`item.kode`]="{ item, index }">
                <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                  placeholder="F1/F2..." @keydown.f1.prevent="openProductSearch(index, false)"
                  @keydown.f2.prevent="openProductSearch(index, true)">
                </v-text-field>
              </template>
              <template #[`item.nama`]="{ item }">
                <div class="product-name-cell">{{ item.nama }}</div>
              </template>
              <template #[`item.jumlah`]="{ item }">
                <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" density="compact"
                  hide-details class="text-end" :disabled="!item.kode" />
              </template>
              <template #[`item.harga`]="{ item }">
                <v-text-field
                  :value="focusedRowId === item.id ? item.harga : new Intl.NumberFormat('id-ID').format(item.harga || 0)"
                  @input="item.harga = Number(String($event.target.value).replace(/[^0-9]/g, '')) || 0"
                  @focus="focusedRowId = item.id" @blur="focusedRowId = -1" placeholder="0" type="text"
                  variant="underlined" density="compact" hide-details single-line class="text-end"
                  :disabled="!item.kode" :readonly="!!item.noSoDtf || !!item.noPengajuanHarga"></v-text-field>
              </template>
              <template #[`item.diskonPersen`]="{ item, index }">
                <v-text-field v-model.number="item.diskonPersen" type="number" variant="underlined" density="compact"
                  hide-details class="text-end" @blur="handleItemDiscountChange(index)" />
              </template>
              <template #[`item.diskonRp`]="{ item }">
                <v-text-field
                  :value="focusedRowId === item.id ? item.diskonRp : new Intl.NumberFormat('id-ID').format(item.diskonRp || 0)"
                  @input="item.diskonRp = Number(String($event.target.value).replace(/[^0-9]/g, '')) || 0"
                  @focus="focusedRowId = item.id"
                  @blur="focusedRowId = -1; handleItemDiscountChange(items.indexOf(item))" placeholder="0" type="text"
                  variant="underlined" density="compact" hide-details single-line class="text-end"
                  :disabled="!item.kode" :readonly="item.diskonPersen > 0"></v-text-field>
              </template>
              <template #[`item.total`]="{ item }">
                <div class="text-end text-body-2 font-weight-bold">
                  {{ new Intl.NumberFormat('id-ID').format(item.total || 0) }}
                </div>
              </template>
              <template #[`item.noSoDtf`]="{ item, index }">
                <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details
                  placeholder="F1..." @keydown.f1.prevent="openSoDtfSearch(index)" readonly>
                </v-text-field>
              </template>
              <template #[`item.noPengajuanHarga`]="{ item, index }">
                <v-text-field v-model="item.noPengajuanHarga" variant="underlined" density="compact" hide-details
                  placeholder="F1..." @keydown.f1.prevent="openPriceProposalSearch(index)" readonly>
                </v-text-field>
              </template>
              <template #[`item.actions`]="{ item }">
                <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                  @click="removeRow(item.id)" title="Hapus baris" />
              </template>
            </v-data-table>
          </div>
        </div>

        <div class="footer-summary-section">
          <v-row dense>

            <v-col cols="8">
              <v-row dense>
                <v-col cols="6">
                  <v-btn block color="teal" @click="openDpInput" prepend-icon="mdi-cash-plus">
                    Input DP (Uang Muka)
                  </v-btn>
                </v-col>

                <v-col cols="6">
                  <v-btn color="blue-darken-2" variant="outlined" block prepend-icon="mdi-sale"
                    @click="isDiscountCostModalVisible = true">
                    Atur Diskon & Biaya
                  </v-btn>
                </v-col>

                <v-col cols="6">
                  <v-btn v-if="header.statusSo === 'PASIF'" block color="orange" @click="openDpAuthorization"
                    prepend-icon="mdi-key-variant">
                    Minta Otorisasi
                  </v-btn>
                </v-col>

                <v-col cols="6">
                  <v-btn color="teal" variant="outlined" block prepend-icon="mdi-format-list-bulleted"
                    @click="isDpListModalVisible = true">
                    Lihat Rincian DP
                  </v-btn>
                </v-col>
              </v-row>
            </v-col>

            <v-col cols="4">
              <div class="summary-totals">
                <v-list density="compact" class="summary-list">
                  <v-list-item class="summary-total">
                    <v-list-item-title class="font-weight-bold">Grand Total</v-list-item-title>
                    <template #append>
                      <span class="text-h6 font-weight-black">{{ formatRupiah(footer.grandTotal) }}</span>
                    </template>
                  </v-list-item>

                  <v-list-item class="summary-total">
                    <v-list-item-title>Total DP</v-list-item-title>
                    <template #append>
                      <span class="text-h6">{{ formatRupiah(footer.totalDp) }}</span>
                    </template>
                  </v-list-item>

                  <v-list-item class="summary-total">
                    <v-list-item-title class="font-weight-bold">Belum Dibayar</v-list-item-title>
                    <template #append>
                      <span class="text-h6 font-weight-black"
                        :class="footer.belumDibayar > 0 ? 'text-error' : 'text-success'">
                        {{ formatRupiah(footer.belumDibayar) }}
                      </span>
                    </template>
                  </v-list-item>
                </v-list>
              </div>
            </v-col>

          </v-row>
        </div>
      </div>
    </div>

    <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''"
      @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" />
    <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="header.gudang.kode"
      @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
    <SalesCounterSearchModal v-if="isSalesCounterSearchVisible" @close="isSalesCounterSearchVisible = false"
      @sales-counter-selected="onSalesCounterSelected" />
    <PenawaranSearchModal v-if="isPenawaranSearchVisible" :cabang="header.gudang.kode"
      @close="isPenawaranSearchVisible = false" @selected="onPenawaranSelected" />
    <ProductSearchModal v-if="isProductSearchVisible" :gudang="header.gudang.kode" category="ALL"
      :multi="isMultiSelectProduct" source="surat-pesanan" :promo-nomor="header.penawaran"
      @close="isProductSearchVisible = false" @products-selected="onProductsSelected" />
    <AuthorizationModal ref="ItemAuthModalRef" v-if="isItemAuthModalVisible" title="Otorisasi Diskon per Item"
      :challenge-code="challengeCode" @close="onItemAuthCancel" @success="onItemAuthSuccess" />
    <AuthorizationModal ref="dpAuthModalRef" v-if="isDpAuthVisible" title="Otorisasi SO Tanpa DP"
      :challenge-code="challengeCode" @close="onDpAuthCancel" @success="onDpAuthSuccess" />
    <SoDtfSearchModal v-if="isSoDtfSearchVisible" :cabang="header.gudang.kode" :customerKode="header.customer?.kode"
      @close="isSoDtfSearchVisible = false" @selected="onSoDtfSelected" />
    <PriceProposalSearchModal v-if="isPriceProposalSearchVisible" :cabang="header.gudang.kode"
      :customerKode="header.customer?.kode" @close="isPriceProposalSearchVisible = false"
      @selected="onPriceProposalSelected" />
    <DpInputModal v-if="isDpInputVisible" :customerKode="header.customer?.kode" :minimal-dp="footer.minimalDp"
      :existing-dp="footer.totalDp" @close="isDpInputVisible = false" @dp-saved="onDpSaved" />
    <CustomerForm v-if="isNewCustomerFormVisible" @close="isNewCustomerFormVisible = false"
      @customer-saved="onNewCustomerSaved" />
    <DiscountCostModal v-if="isDiscountCostModalVisible" :footer-data="footer" :total-so="totalDiscountable"
      :customer="header.customer" :gudang-kode="header.gudang.kode" :ppn-persen="header.ppnPersen"
      @close="isDiscountCostModalVisible = false" @update="Object.assign(footer, $event)" />
    <DpListModal v-if="isDpListModalVisible" :dp-items="dpItems" @close="isDpListModalVisible = false"
      @remove-dp="removeDpRow($event)" />

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi</v-card-title>
        <v-card-text>{{ confirmText }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="executePendingAction">Ya, Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isPrintConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">
          Simpan Berhasil
        </v-card-title>
        <v-card-text>
          Surat Pesanan {{ printConfirmNomor }} berhasil disimpan.
          <br><br>
          Apakah Anda ingin mencetak dokumen ini sekarang?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="handlePrintCancel">
            Tidak, Kembali
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="handlePrintConfirm">
            Ya, Cetak
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  grid-template-columns: 450px 1fr;
  height: calc(100vh - 120px);
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

.scrollable-content {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  /* UBAH dari overflow-x: auto */
  display: flex;
  flex-direction: column;
}

.header-section {
  flex-shrink: 0;
}

.status-section {
  flex-grow: 1;
}

.main-grid-section {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  /* UBAH: biarkan v-data-table yang handle scroll */
  display: flex;
  flex-direction: column;
}

.main-grid-section .v-data-table {
  width: max-content;
  /* biarkan tabel selebar kontennya */
  min-width: 100%;
}

.desktop-table {
  width: 100%;
  flex-grow: 1;
  overflow: hidden;
  /* Penting! */
}

/* PENTING: Biarkan VDataTable wrapper yang handle SEMUA scrolling */
.desktop-table :deep(.v-table__wrapper) {
  overflow-x: auto !important;
  /* Horizontal scroll */
  overflow-y: auto !important;
  /* Vertical scroll */
  max-height: 100%;
}

/* TAMBAHAN: Pastikan tabel bisa lebih lebar dari container */
.desktop-table :deep(.v-table) {
  min-width: max-content;
}

.footer-summary-section {
  flex-shrink: 0;
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background-color: #fcfcfc;
  /* Sedikit warna latar */
}

.summary-totals {
  /* Class ini sekarang membungkus v-list */
  height: 100%;
}

.summary-list {
  background-color: transparent !important;
  /* PENTING: Hapus latar belakang v-list */
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  /* Memberi spasi antar total */
}

.summary-list .v-list-item {
  padding: 0 4px !important;
  min-height: 40px;
}

.summary-list .v-list-item-title {
  font-size: 0.95rem;
}

.dp-table {
  max-height: 150px;
}

.field-disabled {
  background-color: #f0f0f0;
  pointer-events: none;
}

.scanner-wrapper {
  font-size: 11px;
  max-width: 400px;
  flex: none;
  margin-bottom: 16px;
}

.vertically-aligned-table :deep(tbody tr td) {
  vertical-align: middle !important;
}

.product-name-cell {
  white-space: nowrap;
  /* tetap satu baris */
  line-height: 1.4;
  padding-top: 4px;
  padding-bottom: 4px;
  min-width: 250px;
  /* minimum width untuk kolom nama */
}
</style>

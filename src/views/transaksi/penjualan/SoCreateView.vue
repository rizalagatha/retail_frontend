<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick, reactive } from 'vue';
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
import JenisOrderModal from '@/components/modal/JenisOrderModal.vue';

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
  isCustomOrder?: boolean;
  isJasa?: boolean;

  ukuranKaos?: { ukuran: string; jumlah: number; harga: number }[];
  titikCetak?: { keterangan: string; sizeCetak: string; panjang: number; lebar: number }[];
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
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  harga: number;
  diskonPersen: number;
  diskonRp: number;
  total: number;
  barcode: string;
  noSoDtf: string;
  noPengajuanHarga: string;
  pin: string;
  isCustomOrder?: boolean;

  // tambahkan ini biar payload custom order valid:
  ukuranKaos?: { ukuran: string; jumlah: number; harga: number }[];
  titikCetak?: { keterangan: string; sizeCetak: string; panjang: number; lebar: number }[];
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

interface JenisOrderSaved {
  namaOrder: string;
  jenisOrder: string;
  namaBarang: string;
  kodeBarang: string;
  totalJumlah: number;
  totalHarga: number;

  // tambahan untuk custom order
  ukuranKaos?: { ukuran: string; jumlah: number; harga: number }[];
  titikCetak?: { keterangan: string; sizeCetak: string; panjang: number; lebar: number }[];
  hargaPerCm?: number;
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
const existingDpNomor = ref<string>('');
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
const dialogs = reactive({ jenisOrder: false });
const jenisOrderList = ref([]);
const loadingJenisOrder = ref(false);
const page = ref(1);
const rowsPerPage = ref(10);
// const formJenisOrder = reactive({
//   jenis: null,
//   ukuran: 0,
//   titik: 0,
// });

const formatRupiah = (angka: number) => {
  return new Intl.NumberFormat('id-ID').format(angka || 0);
};

const parseDate = (str: string) => {
  // aman: tidak di-convert ke timezone
  const [y, m, d] = str.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d), 12);
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
  const containsCustom = items.value.some(item => item.isCustomOrder);
  const percentage = containsDtf || containsCustom ? 50 : 30;
  const amount = new Intl.NumberFormat('id-ID').format(footer.value.minimalDp);
  return `Minimal DP ${percentage}% dari nominal SO : ${amount}`;
});

// const selectedPenawaran = computed(() => {
//   // Ambil nama barang pertama dari penawaran (kalau ada)
//   if (items.value.length > 0) {
//     const first = items.value.find(it => it.nama);
//     return first ? { namaBarang: first.nama } : null;
//   }
//   return null;
// });

/**
 * penawaranDetails → Dikirim ke modal JenisOrderModal
 *   Berisi semua kombinasi kodeBarang + ukuran
 *   Digunakan untuk validasi ukuran di dropdown Ukuran Kaos
 */
const penawaranDetails = computed(() => {
  const detailMap = new Map<string, { kodeBarang: string; namaBarang: string; ukuran?: string }>();

  items.value.forEach((it) => {
    if (it.kode && it.nama) {
      const key = `${it.kode}|${it.ukuran || ''}`;
      if (!detailMap.has(key)) {
        detailMap.set(key, {
          kodeBarang: it.kode,
          namaBarang: it.nama,
          ukuran: it.ukuran || '',
        });
      }
    }
  });

  return Array.from(detailMap.values());
});

/**
 * penawaranBarangList → Digunakan untuk dropdown Nama Barang di modal
 *   Berisi hanya satu item per kodeBarang (tanpa duplikat ukuran)
 */
const penawaranBarangList = computed(() => {
  const map = new Map<string, string>();
  items.value.forEach((it) => {
    if (it.kode && it.nama && !map.has(it.kode)) {
      map.set(it.kode, it.nama);
    }
  });
  return Array.from(map.entries()).map(([kodeBarang, namaBarang]) => ({
    kodeBarang,
    namaBarang,
  }));
});

const grandQty = computed(() =>
  items.value.reduce((sum, i) => sum + (Number(i.jumlah) || 0), 0)
);

const grandTotal = computed(() =>
  footer.value.totalSo || 0
);

// --- Functions ---
// function toDateInputValue(dateStr: string) {
//   if (!dateStr) return '';
//   return dateStr.substring(0, 10); // aman, tidak berubah timezone
// }

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
      tanggal: headerData.tanggal.substring(0, 10),
      dateline: headerData.dateline.substring(0, 10),
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
        isCustomOrder: item.isCustomOrder ?? false,
      };
    });

    // ===== MAPPING DP ITEMS =====
    dpItems.value = dpItemsData;
    existingDpNomor.value = dpItemsData.length > 0 ? dpItemsData[0].nomor : '';

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

const isDiscountableItem = (item: SoItem) => {
  // barang yang tidak boleh kena diskon:
  // 1. Jasa           → kode/nama mengandung jasa
  // 2. Custom Order   → isCustomOrder = true
  // 3. SO DTF         → ada noSoDtf
  const isJasa =
    item.kode?.toUpperCase().startsWith("JASA") ||
    item.kode?.toUpperCase().startsWith("JS") ||
    item.nama?.toLowerCase().includes("jasa") ||
    item.nama?.toLowerCase().includes("desain");

  return !isJasa && !item.isCustomOrder && !item.noSoDtf;
};

const calculateTotals = async () => {
  let totalSoBruto = 0;
  let newTotalDiscountable = 0; // Variabel sementara untuk total yang bisa didiskon
  let containsDtf = false;
  let containsCustomOrder = false;

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

    if (item.noSoDtf) containsDtf = true;
    if (item.isCustomOrder) containsCustomOrder = true; // 👈 deteksi jasa custom

    if (isDiscountableItem(item)) {
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
  if (footer.value.diskonRp > 0 && (diskonPersen1 === 0 && diskonPersen2 === 0)) {
    // manual mode
  } else {
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
  if (containsCustomOrder) {
    footer.value.minimalDp = 0.5 * footer.value.netto;
  } else if (containsDtf) {
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
  const validItems = items.value.filter(item => item.kode || item.isCustomOrder);
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
      details: items.value.filter(item => item.kode || item.isCustomOrder),
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
  const item = items.value.find(i => i.id === id);
  if (item?.isCustomOrder && item.noSoDtf) {
    toast.warning("Item custom ini sudah punya No. SO DTF dan tidak bisa dihapus.");
    return;
  }
  items.value = items.value.filter(item => item.id !== id);
  calculateTotals();
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

  await applyDefaultDiscount();
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

  selectedProducts.forEach(product => {

    // ================================
    // 1️⃣ DETEKSI PRODUK JASA
    // ================================
    const isJasa =
      product.kode.startsWith("JASA") ||
      product.kode.startsWith("JS") ||
      product.nama.toLowerCase().includes("jasa") ||
      product.nama.toLowerCase().includes("desain");

    // ================================
    // 2️⃣ HANDLING KHUSUS JASA
    // ================================
    if (isJasa) {
      // Jasa boleh tanpa ukuran
      product.ukuran = "";

      // Jasa boleh masuk berkali-kali → jangan cek duplikasi barcode
      items.value.push({
        id: Date.now() + Math.random(),
        kode: product.kode,
        nama: product.nama,
        ukuran: "",
        stok: product.stok ?? 0,
        harga: product.harga,
        jumlah: 1,
        diskonPersen: 0,
        diskonRp: 0,
        total: product.harga,
        barcode: product.barcode || product.kode, // fallback
        noSoDtf: '',
        noPengajuanHarga: '',
        pin: '',
        isCustomOrder: false,
        isJasa: true
      });

      return; // lanjut ke produk berikutnya
    }

    // ================================
    // 3️⃣ PRODUK NORMAL → CEK DUPLIKASI
    // ================================
    const isDuplicate = items.value.some(item => item.barcode === product.barcode);
    if (!isDuplicate) {
      items.value.push({
        id: Date.now() + Math.random(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        harga: product.harga,
        jumlah: 1,
        diskonPersen: 0,
        diskonRp: 0,
        total: product.harga,
        barcode: product.barcode,
        noSoDtf: '',
        noPengajuanHarga: '',
        pin: ''
      });
    }
  });

  addNewRow();
  calculateTotals();
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

const applyDefaultDiscount = async () => {
  if (!header.value.customer) return;
  if (!header.value.levelKode) return;

  try {
    const response = await api.get('/so-form/lookup/default-discount', {
      params: {
        level: header.value.levelKode,
        total: totalDiscountable.value,
        gudang: header.value.gudang.kode,
        hasPin: footer.value.pinTanpaDp ?? "",
        hasAcc: footer.value.pinDiskon1 ? "Y" : "N",
        penawaran: header.value.penawaran || "",
      }
    });

    const defaultDisc = Number(response.data.discount ?? 0);

    // Jangan set diskon jika user sudah ubah manual
    if (footer.value.diskonPersen1 && footer.value.diskonPersen1 !== 0) return;

    // Jika total 0, tidak hitung diskon
    if (totalDiscountable.value <= 0) return;

    // SET diskon dari backend
    footer.value.diskonPersen1 = defaultDisc;

  } catch (err) {
    console.error('Gagal ambil diskon default:', err);
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

  // ❌ Exclude jasa, custom order, dan DTF dari diskon item
  if (!isDiscountableItem(item)) {
    item.diskonPersen = 0;
    item.diskonRp = 0;
    calculateTotals();
    return;
  }

  // Skip jika diskon tidak diubah (0)
  if (item.diskonPersen === 0) {
    calculateTotals();
    return;
  }

  // Kalau diskon > 0 → minta otorisasi
  previousItemDiscount.value = {
    index: index,
    diskonPersen: 0,
    diskonRp: 0
  };

  activeItemIndexForAuth.value = index;
  challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
  isItemAuthModalVisible.value = true;
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

  // Pastikan minimal DP diupdate berdasarkan jenis item yang ada
  const containsCustomOrder = items.value.some(i => i.isCustomOrder);
  const containsDtf = items.value.some(i => i.noSoDtf);

  if (containsCustomOrder || containsDtf) {
    footer.value.minimalDp = 0.5 * footer.value.netto;
  } else {
    footer.value.minimalDp = 0.3 * footer.value.netto;
  }

  // Refresh status SO setelah DP masuk
  const totalDp = footer.value.totalDp;
  header.value.statusSo =
    totalDp >= footer.value.minimalDp ? 'AKTIF' : 'PASIF';
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

// const saveJenisOrder = async () => {
//   dialogs.jenisOrder = false;
//   if (!formJenisOrder.jenis) {
//     toast.error("Pilih jenis order terlebih dahulu.");
//     return;
//   }

//   header.value.jenisOrder = formJenisOrder.jenis;
//   header.value.ukuranOrder = formJenisOrder.ukuran;
//   header.value.titikOrder = formJenisOrder.titik;

//   // update DP minimal
//   if (formJenisOrder.jenis.toUpperCase().includes("CUSTOM")) {
//     footer.value.minimalDp = 0.5 * footer.value.netto;
//     toast.info("Minimal DP diubah menjadi 50% karena jenis order custom.");
//   } else {
//     footer.value.minimalDp = 0.3 * footer.value.netto;
//   }

//   // Hitung ulang harga otomatis via backend
//   try {
//     const { data } = await api.post("/so-form/hitung-harga", {
//       jenis: formJenisOrder.jenis,
//       ukuran: formJenisOrder.ukuran,
//       titik: formJenisOrder.titik,
//       items: items.value,
//     });
//     items.value = data.items;
//     calculateTotals();
//     toast.success("Harga berhasil diperbarui berdasarkan jenis order.");
//   } catch (err) {
//     toast.error("Gagal menghitung harga custom.", err);
//   }
// };

const handleJenisOrderSaved = (data: JenisOrderSaved) => {
  items.value.push({
    id: Date.now() + Math.random(),
    kode: '', // custom order
    nama: data.namaOrder || 'Order Custom',
    ukuran: '',
    stok: 0,
    jumlah: data.totalJumlah || 0,
    harga: data.totalHarga || 0,
    diskonPersen: 0,
    diskonRp: 0,
    total: data.totalHarga || 0,
    barcode: '',
    noSoDtf: '',
    noPengajuanHarga: '',
    pin: '',
    isCustomOrder: true,
    ukuranKaos: data.ukuranKaos || [],
    titikCetak: data.titikCetak || [],
  });

  calculateTotals();
  dialogs.jenisOrder = false;
  toast.success("Jenis Order Custom berhasil ditambahkan ke daftar item.");
};

const loadJenisOrder = async () => {
  loadingJenisOrder.value = true;
  try {
    const { data } = await api.get('/so-form/lookup/jenis-order');
    console.log('📦 Jenis Order:', data);
    jenisOrderList.value = data;
  } catch (err) {
    console.error('❌ Gagal load jenis order:', err);
  } finally {
    loadingJenisOrder.value = false;
  }
};

const openJenisOrderModal = () => {
  // 🔹 Validasi 1: Pastikan customer dipilih
  if (!header.value.customer) {
    toast.error('Pilih customer terlebih dahulu sebelum input jenis order.');
    return;
  }

  // 🔹 Validasi 2: Pastikan ada penawaran atau tabel item sudah keisi
  const hasPenawaran = !!header.value.penawaran;
  const hasItems = items.value.some(it => it.kode && it.nama);

  if (!hasPenawaran && !hasItems) {
    toast.error('Isi detail barang dari Penawaran terlebih dahulu sebelum input jenis order.');
    return;
  }

  // ✅ Semua aman, buka modal
  dialogs.jenisOrder = true;
};

const openSoDtfInNewTab = (item: SoItem) => {
  const url = router.resolve({
    path: '/transaksi/penjualan/dtf/so-dtf/new',
    query: { ref: item.kode || '' },
  }).href;
  window.open(url, '_blank'); // buka tab baru
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
    const date = parseDate(newTanggal);
    if (isValid(date)) {
      header.value.tempo = format(addDays(date, newTop || 0), 'yyyy-MM-dd');
    }
  },
  { immediate: true } // immediate: true agar langsung dihitung saat form dimuat
);

watch(() => dialogs.jenisOrder, (val) => {
  if (val) loadJenisOrder();
});

watch(totalDiscountable, async () => {
  await applyDefaultDiscount();
});

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

onMounted(async () => {
  try {
    loadingJenisOrder.value = true;
    const { data } = await api.get('/so-form/lookup/jenis-order'); // tanpa params
    jenisOrderList.value = data;
  } catch (error) {
    console.error('Gagal mengambil jenis order:', error);
  } finally {
    loadingJenisOrder.value = false;
  }
});

onMounted(() => {
  window.addEventListener("keydown", handleGlobalShortcuts);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalShortcuts);
});

const handleGlobalShortcuts = (e: KeyboardEvent) => {
  if (e.code === "F1") {
    e.preventDefault();
    openProductSearch(activeRowIndex.value, false);
  }

  if (e.code === "F2") {
    e.preventDefault();
    openProductSearch(activeRowIndex.value, true);
  }
};
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-file-document-edit-outline">
    <template #header-actions>
      <v-btn color="secondary" size="small" prepend-icon="mdi-tshirt-crew-outline"
        :disabled="!header.customer && !header.penawaran" @click="openJenisOrderModal">
        Input Jenis Order
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save" @click="save" :loading="isSaving"
        :disabled="isSaving || isSavingDisabled">
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-cancel"
        @click="showConfirmation(resetForm, 'Batalkan perubahan dan kosongkan form?')">
        Batal
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close"
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
            <v-data-table :headers="mainTableHeaders" :items="items" :page="page" :items-per-page="rowsPerPage"
              :item-key="'id'" class="desktop-table vertically-aligned-table" fixed-header height="calc(100vh - 480px)"
              :item-class="item => item.isCustomOrder ? 'custom-row' : ''">
              <template #[`item.kode`]="{ item, index }">
                <div class="d-flex align-center">
                  <v-icon v-if="item.isCustomOrder" color="blue" size="18" class="me-2"
                    title="Item Custom (Jenis Order)">
                    mdi-tshirt-crew-outline
                  </v-icon>

                  <v-text-field v-model="item.kode" @focus="activeRowIndex = index" @click="activeRowIndex = index"
                    variant="underlined" density="compact" hide-details placeholder="F1/F2..."
                    :disabled="item.isCustomOrder"
                    @keydown.f1.prevent="!item.isCustomOrder && openProductSearch(index, false)"
                    @keydown.f2.prevent="!item.isCustomOrder && openProductSearch(index, true)" />
                </div>
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
                <v-row dense align="center" no-gutters>
                  <v-col>
                    <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details
                      placeholder="F1..." @keydown.f1.prevent="openSoDtfSearch(index)" readonly />
                  </v-col>

                  <!-- Tombol untuk grid jasa custom -->
                  <v-col cols="auto" v-if="item.isCustomOrder">
                    <v-btn icon="mdi-plus-circle" size="x-small" color="primary" variant="text"
                      @click="openSoDtfInNewTab(item)" title="Buat SO DTF Baru" />
                  </v-col>
                </v-row>
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

          <div class="so-sticky-footer">
            <div class="footer-col label-left">TOTAL QTY</div>
            <div class="footer-col value-center">{{ grandQty }}</div>

            <div class="footer-col label-right">TOTAL NOMINAL</div>
            <div class="footer-col value-right">{{ formatRupiah(grandTotal) }}</div>
          </div>

          <div class="footer-summary-section">
            <v-row dense>
              <v-col cols="12" md="7" lg="6" xl="6">
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

              <v-col cols="12" md="5" lg="6" xl="6">
                <div class="summary-totals">
                  <v-list density="compact" class="summary-list">
                    <!-- Diskon Faktur (hanya muncul jika ada) -->
                    <v-list-item v-if="footer.diskonRp > 0" class="summary-discount">
                      <v-list-item-title class="text-error">Diskon Faktur</v-list-item-title>
                      <template #append>
                        <span class="text-body-1 text-error">- {{ formatRupiah(footer.diskonRp) }}</span>
                      </template>
                    </v-list-item>

                    <!-- Total DP -->
                    <v-list-item class="summary-total">
                      <v-list-item-title>Total DP</v-list-item-title>
                      <template #append>
                        <span class="text-h6">{{ formatRupiah(footer.totalDp) }}</span>
                      </template>
                    </v-list-item>

                    <!-- Belum Dibayar -->
                    <v-list-item class="summary-total summary-belum-bayar">
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
      :existing-dp="footer.totalDp" :existing-dp-nomor="existingDpNomor" @close="isDpInputVisible = false"
      @dp-saved="onDpSaved" />
    <CustomerForm v-if="isNewCustomerFormVisible" @close="isNewCustomerFormVisible = false"
      @customer-saved="onNewCustomerSaved" />
    <DiscountCostModal v-if="isDiscountCostModalVisible" :footer-data="footer" :total-so="totalDiscountable"
      :customer="header.customer" :gudang-kode="header.gudang.kode" :ppn-persen="header.ppnPersen"
      @close="isDiscountCostModalVisible = false" @update="Object.assign(footer, $event)" />
    <DpListModal v-if="isDpListModalVisible" :dp-items="dpItems" @close="isDpListModalVisible = false"
      @remove-dp="removeDpRow($event)" />
    <JenisOrderModal v-if="dialogs.jenisOrder" :model-value="dialogs.jenisOrder" :penawaran-details="penawaranDetails"
      :penawaran-barang-list="penawaranBarangList" @close="dialogs.jenisOrder = false" @saved="handleJenisOrderSaved" />

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
  height: 100%;
  flex-grow: 1;
}

/* PENTING: Biarkan VDataTable wrapper yang handle SEMUA scrolling */
.desktop-table :deep(.v-table__wrapper) {
  overflow-x: auto !important;
  overflow-y: auto !important;
  max-height: calc(100vh - 480px) !important;
  /* Sama dengan height v-data-table */
}

/* TAMBAHAN: Pastikan tabel bisa lebih lebar dari container */
.desktop-table :deep(.v-table) {
  min-width: max-content;
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

:deep(.custom-row) {
  background-color: #f3f8ff;
  /* biru muda */
  font-style: italic;
}

:deep(.v-icon.me-2) {
  margin-right: 6px;
  opacity: 0.8;
}

.so-sticky-footer {
  display: grid;
  grid-template-columns: 1fr 0.7fr 1fr 1fr;
  /* spacing kolom */
  align-items: center;
  padding: 8px 16px;
  border-top: 2px solid #1976d2;
  font-size: 15px;
  background: #fff;
  position: sticky;
  bottom: 0;
  z-index: 10;
}

.footer-col {
  padding: 4px 12px;
}

.label-left {
  font-weight: 600;
  text-align: left;
}

.value-center {
  font-weight: 700;
  text-align: center;
}

.label-right {
  font-weight: 600;
  text-align: right;
}

.value-right {
  font-weight: 900;
  text-align: right;
  font-size: 17px;
}

.v-data-table .v-input input {
  caret-color: transparent;
}

.footer-summary-section {
  flex-shrink: 0;
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background-color: #fcfcfc;
}

.summary-totals {
  height: auto !important;
  /* Selalu auto */
  min-height: auto !important;
  max-height: none !important;
  overflow-y: visible !important;
  /* Tidak perlu scroll */
}

.summary-list {
  background-color: transparent !important;
  height: auto !important;
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* Default gap */
}

.summary-list .v-list-item {
  padding: 4px 2px !important;
  /* Default padding */
  min-height: 32px !important;
  /* Default min-height */
}

.summary-list .v-list-item-title {
  font-size: 0.85rem;
  /* Default font */
  line-height: 1.3;
}

.summary-list .text-h6 {
  font-size: 1.05rem !important;
  /* Default font value */
  font-weight: 700 !important;
}

.summary-list .text-body-1 {
  font-size: 0.9rem !important;
}

.summary-discount .v-list-item-title,
.summary-discount span {
  font-size: 0.85rem;
}

.summary-total {
  margin-top: 0px;
}

.summary-total:first-child {
  margin-top: 0;
}

.summary-list .v-list-item:last-child {
  margin-top: 6px;
  padding-top: 6px !important;
  border-top: 1px solid #e0e0e0;
}

/* ===== RESPONSIVE MEDIA QUERIES ===== */

/* Layar sangat besar (1920px ke atas) - Desktop 4K */
@media (min-height: 1080px) {
  .summary-list {
    gap: 8px;
  }

  .summary-list .v-list-item {
    padding: 6px 4px !important;
    min-height: 40px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 1rem;
  }

  .summary-list .text-h6 {
    font-size: 1.25rem !important;
  }

  .summary-list .text-body-1 {
    font-size: 1.05rem !important;
  }
}

/* Layar besar (900px - 1080px) - Desktop standar */
@media (min-height: 900px) and (max-height: 1079px) {
  .summary-list {
    gap: 5px;
  }

  .summary-list .v-list-item {
    padding: 5px 3px !important;
    min-height: 36px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.9rem;
  }

  .summary-list .text-h6 {
    font-size: 1.15rem !important;
  }
}

/* Layar sedang (768px - 900px) - Laptop standar */
@media (min-height: 768px) and (max-height: 899px) {
  .summary-list {
    gap: 4px;
  }

  .summary-list .v-list-item {
    padding: 4px 2px !important;
    min-height: 32px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.85rem;
  }

  .summary-list .text-h6 {
    font-size: 1.05rem !important;
  }
}

/* Layar kecil (600px - 768px) - Laptop kecil */
@media (min-height: 600px) and (max-height: 767px) {
  .summary-list {
    gap: 3px;
  }

  .summary-list .v-list-item {
    padding: 3px 2px !important;
    min-height: 28px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.8rem;
    line-height: 1.2;
  }

  .summary-list .text-h6 {
    font-size: 0.95rem !important;
  }

  .summary-list .text-body-1 {
    font-size: 0.85rem !important;
  }

  .summary-list .v-list-item:last-child {
    margin-top: 4px;
    padding-top: 4px !important;
  }
}

/* Layar sangat kecil (di bawah 600px) - Tablet/Netbook */
@media (max-height: 599px) {
  .footer-summary-section {
    padding: 6px 8px;
    /* Padding lebih kecil */
  }

  .summary-list {
    gap: 2px;
  }

  .summary-list .v-list-item {
    padding: 2px 2px !important;
    min-height: 24px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.75rem;
    line-height: 1.1;
  }

  .summary-list .text-h6 {
    font-size: 0.9rem !important;
  }

  .summary-list .text-body-1 {
    font-size: 0.8rem !important;
  }

  .summary-discount .v-list-item-title,
  .summary-discount span {
    font-size: 0.75rem;
  }

  .summary-list .v-list-item:last-child {
    margin-top: 3px;
    padding-top: 3px !important;
  }
}

/* Responsive berdasarkan lebar layar (opsional, untuk sidebar collapse) */
@media (max-width: 1366px) {
  .summary-list .v-list-item-title {
    font-size: 0.8rem;
  }

  .summary-list .text-h6 {
    font-size: 1rem !important;
  }
}

@media (max-width: 1024px) {
  .summary-list .v-list-item {
    padding: 3px 2px !important;
    min-height: 28px !important;
  }

  .summary-list .v-list-item-title {
    font-size: 0.75rem;
  }

  .summary-list .text-h6 {
    font-size: 0.95rem !important;
  }
}
</style>

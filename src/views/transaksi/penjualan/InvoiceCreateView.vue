<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import api from '@/services/api';
import { format, parseISO, addDays } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
import SoSearchModalForInvoice from '@/components/lookup/SoSearchModalForInvoice.vue';
import ProductSearchModal from '@/components/lookup/ProductSearchModal.vue';
import PaymentModal from '@/components/modal/PaymentModal.vue';
import UnpaidDpSearchModal from '@/components/lookup/UnpaidDpSearchModal.vue';
import CustomerForm from '@/components/form/CustomerForm.vue';
import PromoSearchModal from '@/components/lookup/PromoSearchModal.vue';
import MemberForm from '@/components/form/MemberForm.vue';
import DiskonForm from '@/components/form/DiskonForm.vue';
import LinkedDpModal from '@/components/modal/LinkedDpModal.vue';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
// import SoDtfSearchModal from '@/components/lookup/SoDtfSearchModal.vue';
import PromoBonusModal from '@/components/modal/PromoBonusModal.vue';
import type { AxiosError } from 'axios';
import axios from 'axios';
import LogoKaosan from '@/assets/logo.png';
import LogoRezso from '@/assets/rezso.jpg';
import { formatRupiah } from "@/utils/formatRupiah";

// --- Tipe Data ---
interface Item {
  id: number;
  kode?: string;
  nama?: string;
  ukuran?: string;
  stok?: number;         // Stok Fisik (Showroom)
  stokPesanan?: number;  // Stok Pesanan (SO) [BARU]
  qtyso?: number;
  jumlah: number;
  harga?: number;
  diskonPersen?: number;
  diskonRp?: number;
  total?: number;
  barcode?: string;
  hpp?: number;
  kategori?: string;
  noSoDtf?: string;
  noPengajuanHarga?: string;
  terhitungPromo: boolean;
  promoQty?: number;
  _isHargaEditable: boolean;
  promo?: string;
  originalDiskonRp?: number;
  originalDiskonPersen?: number;
  subtotal?: number;
  lastPin?: string;
  isCustomOrder?: boolean;
  fromBackend?: boolean;
}
interface LinkedDp {
  nomor: string;
  jenis: string;
  nominal: number;
}
interface AuthDialogState {
  show: boolean;
  title: string;
  jenis: string;
  nominal: number;
  transaksi?: string;
  barcode?: string;
  keterangan?: string; // [PENTING] Untuk info detail di HP
  onSuccess: (data: { authNomor: string; approver: string }) => void;
  onCancel: () => void;
}
interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  level?: string;
  level_kode?: string;
  level_nama?: string;
}
interface Member {
  hp: string;
  nama: string;
  alamat: string;
  gender: string;
  usia: number;
  referensi: string;
}
interface ProductInput {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  stokFisik?: number;   // [BARU]
  stokPesanan?: number; // [BARU]
  harga: number;
  barcode: string;
  kategori: string;
  harga1?: number;
  harga2?: number;
  harga3?: number;
  harga4?: number;
}
interface DownPayment {
  nomor: string;
  jenis: string;
  nominal: number;
}
// interface SoDtf {
//   nomor: string;
//   // tambahkan properti lain jika ada
// }
// interface SoDtfItem {
//   kode: string;
//   nama: string;
//   ukuran: string;
//   jumlah: number;
//   harga: number;
// }
// interface ApiInvoiceItem {
//   invd_kode: string;
//   nama_barang: string;
//   invd_ukuran: string;
//   invd_jumlah: number;
//   invd_harga: number;
//   invd_diskon: number;
//   stok?: number;
//   stokSO?: number;
//   [key: string]: unknown;
// }

// interface InvoiceItem {
//   id: number;
//   kode: string;
//   nama: string;
//   ukuran: string;
//   jumlah: number;
//   harga: number;
//   diskonRp: number;
//   // field lain dari item jika perlu
//   [key: string]: unknown;
// }

interface ActivePromo {
  pro_nomor: string;
  pro_judul: string;
  pro_totalrp: number; // Minimal belanja
  pro_disrp: number; // Diskon Rp
  pro_diskon: number; // <-- TAMBAHKAN INI (untuk diskon 10%)
  pro_lipat: 'Y' | 'N';
}

interface SoItem {
  kode: string;
  nama: string;
  ukuran_dtf?: string;
  custom_json?: string;
  ukuran_asli?: string;
  stokFisik?: number;         // Stok Fisik (Showroom)
  stokPesanan?: number;  // Stok Pesanan (SO) [BARU]
  qtyso?: number;
  harga?: number;
  diskonPersen?: number;
  diskonRp?: number;
  total?: number;
  barcode?: string;
  hpp?: number;
  kategori?: string;
  noSoDtf?: string;
  terhitungPromo?: boolean;
  _isHargaEditable?: boolean;
  promo?: string;
  originalDiskonRp?: number;
  originalDiskonPersen?: number;
  lastPin?: string;
  isCustomOrder?: boolean;
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = '27';

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Invoice' : 'Buat Invoice');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');
const dynamicLogo = computed(() => {
  if (authStore.user?.cabang === 'K04') {
    return LogoRezso;
  }
  return LogoKaosan;
});
const isViewMode = computed(() => route.query.mode === "view");
const isReadonly = computed(() => {
  return isLockedFsk.value || isViewMode.value;
});
const isUserKon = computed(() => authStore.user?.cabang === 'KON');

const isLoading = ref(true);

const initialHeaderState = {
  nomor: '',
  idrec: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  gudang: { kode: authStore.user?.cabang || '', nama: authStore.user?.cabangNama || '' },
  customer: {
    kode: '',
    nama: '',
    alamat: '',
    kota: '',
    telp: '',
    level: '',
    level_kode: null,
    level_nama: null,
  } as Customer,
  nomorSo: '',
  tanggalSo: '',
  jenisOrderKode: '',
  jenisOrderNama: '',
  namaDtf: '',
  top: 0,
  tanggalTempo: '',
  salesCounter: authStore.user?.kode || '',
  keterangan: '',
  diskonPersen1: 0,
  diskonPersen2: 0,
  diskonRp: 0,
  biayaKirim: 0,
  ppnPersen: 0,
  nomorPromo: '',
  namaPromo: '',
  memberHp: '',
  memberNama: '',
  memberAlamat: '',
  memberGender: '',
  memberUsia: '',
  memberReferensi: '',

  // --- FIELD BARU MARKETPLACE ---
  isMarketplace: false,
  mpNama: 'SHOPEE',
  mpNomorPesanan: '',
  mpResi: '',
  mpBiayaPlatform: 0,
};

// [BARU] Daftar Marketplace
const marketplaceList = ['SHOPEE', 'TIKTOK SHOP'];
const isSaving = ref(false);

const header = reactive({ ...initialHeaderState });
const items = ref<Item[]>([]);
const linkedDps = ref<LinkedDp[]>([]);
const totals = reactive({
  subTotal: 0,
  totalDiskonItem: 0,
  totalDiskonFaktur: 0,
  nettoSetelahDiskon: 0,
  totalPpn: 0,
  grandTotal: 0,
  totalDp: 0,
  sisaPiutang: 0,
});

const dialogs = reactive({
  customerSearch: false,
  soSearch: false,
  productSearch: false,
  payment: false,
  unpaidDpSearch: false,
  customerForm: false,
  promoSearch: false,
  memberForm: false,
  diskonForm: false,
  linkedDp: false,
  // soDtfSearch: false,
  promoBonus: false
});

const authDialog = reactive<AuthDialogState>({
  show: false,
  title: '',
  jenis: '',
  nominal: 0,
  transaksi: '',
  barcode: '',
  keterangan: '',
  onSuccess: () => { },
  onCancel: () => { },
});

const activeItemForAuth = ref<Item | null>(null);
const originalDiscount = reactive({
  faktur: { persen1: 0, rp: 0, persen2: 0, biayaKirim: 0 },
  item: { persen: 0, rp: 0 }
});

const authPins = reactive({
  pinDiskon1: '',
  pinDiskon2: '',
  pinItem: {} as Record<string, string>, // Untuk menyimpan pin per item
});

const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const activeRowIndex = ref(0);
const isMultiSelectProduct = ref(false);
const salesCounters = ref([]);
const isSoLoaded = ref(false);
const memberHpToSearch = ref('');
const scannedBarcode = ref('');
const customerDiscountRule = ref(null);
const activePromoForBonus = ref({ nomor: '', qty: 0 });
const focusedRowId = ref<number | string>(-1);
const isLockedFsk = ref(false);
const activePromosList = ref<ActivePromo[]>([]); // Menyimpan daftar promo dari DB
const promoNotification = ref(''); // Teks untuk running text/alert
const potentialPromoDiscount = ref(0); // Menyimpan nominal potensi diskon
const isGrandOpeningPromo = ref(false);

// --- [BARU] Setup Audio & Refs ---
const audioSuccess = new Audio('/audio/beep_success.mp3');
const audioError = new Audio('/audio/beep_error.mp3');

// Ref untuk input barcode agar bisa auto-focus
const barcodeInputRef = ref<HTMLInputElement | null>(null);
const isScanning = ref(false); // State untuk loading scan

// --- Konfigurasi Tabel ---
const tableHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '120px' },
  { title: 'Nama Barang', key: 'nama', minWidth: '250px' }, // ubah ke minWidth
  { title: 'Kategori', key: 'kategori', width: '90px' },
  { title: 'Ukuran', key: 'ukuran', width: '50px' },
  { title: 'Stok Fisik', key: 'stok', align: 'end', width: '80px' },
  { title: 'Stok Pesan', key: 'stokPesanan', align: 'end', width: '80px' },
  { title: 'Qty SO', key: 'qtyso', align: 'end', width: '60px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '70px' },
  { title: 'Harga', key: 'harga', align: 'end', width: '80px' },
  { title: 'Disc %', key: 'diskonPersen', align: 'end', width: '70px' },
  { title: 'Diskon Rp', key: 'diskonRp', align: 'end', width: '80px' },
  { title: 'Total', key: 'total', align: 'end', width: '90px' },
  { title: 'Barcode', key: 'barcode', width: '90px' },
  { title: 'SO DTF', key: 'noSoDtf', width: '120px' },
  { title: 'Promo', key: 'terhitungPromo', align: 'center', width: '70px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
] as const;
// const linkedDpsHeaders = [
//     { title: 'Nomor Setoran', key: 'nomor' },
//     { title: 'Jenis', key: 'jenis' },
//     { title: 'Nominal', key: 'nominal', align: 'end' },
//     { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
// ];

// --- Methods ---
const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    const newItem: Item = {
      id: Date.now(),
      kode: '',          // tambahkan properti wajib
      nama: '',
      ukuran: '',
      stok: 0,
      qtyso: 0,
      jumlah: 0,
      harga: 0,
      diskonPersen: 0,
      diskonRp: 0,
      total: 0,
      barcode: '',
      hpp: 0,
      noSoDtf: '',
      kategori: '',
      terhitungPromo: false,
      _isHargaEditable: true,
      isCustomOrder: false,
      promoQty: 0,
    };
    items.value.push(newItem);
  }
};

const onDiskonSaved = (data: { diskonPersen1: number, diskonPersen2: number, diskonRp: number, biayaKirim: number, biayaPlatform: number, mode?: string }) => {
  // 1. Tentukan nilai target untuk Diskon (Sama seperti sebelumnya)
  const isPercentMode = data.mode !== 'rp' && (data.diskonPersen1 > 0 || data.diskonPersen2 > 0);

  const newDiskonPersen1 = isPercentMode ? data.diskonPersen1 : 0;
  const newDiskonPersen2 = isPercentMode ? data.diskonPersen2 : 0;
  const newDiskonRp = isPercentMode ? 0 : Number(data.diskonRp || 0);

  // 2. Deteksi Perubahan (Sama seperti sebelumnya)
  const isDiscountChanged =
    newDiskonPersen1 !== header.diskonPersen1 ||
    newDiskonPersen2 !== header.diskonPersen2 ||
    newDiskonRp !== header.diskonRp;

  // Fungsi Helper: Terapkan perubahan ke state Header
  const applyChanges = (authData?: { authNomor: string, approver: string }) => {
    header.diskonPersen1 = newDiskonPersen1;
    header.diskonPersen2 = newDiskonPersen2;
    header.diskonRp = newDiskonRp;

    // Update Biaya (Selalu diterapkan)
    header.biayaKirim = Number(data.biayaKirim || 0);
    header.mpBiayaPlatform = Number(data.biayaPlatform || 0);

    // [OPSIONAL] Jika backend butuh nomor otorisasi untuk divalidasi nanti saat simpan invoice
    if (authData) {
      // Pastikan Anda sudah menyiapkan field ini di state 'header'
      // header.authNomorDiskon = authData.authNomor;
      console.log("Otorisasi Diskon ID:", authData.authNomor);
    }

    // Hitung ulang total
    calculateTotals();
    toast.success('Data biaya & diskon diperbarui.');
  };

  // 3. Logika Percabangan Otorisasi
  if (isDiscountChanged) {
    // Hitung estimasi nominal
    let nominalAuth = 0;
    if (newDiskonRp > 0) {
      nominalAuth = newDiskonRp;
    } else {
      const subTotalNet = (items.value.reduce((sum, i) => sum + (i.total || 0), 0)) - totals.totalDiskonItem;
      nominalAuth = (subTotalNet * newDiskonPersen1) / 100;
    }

    // Susun Info Lengkap
    const custName = header.customer.nama || 'Umum';
    const infoDiskon = `Cust: ${custName}\nDiskon Faktur: ${isPercentMode ? newDiskonPersen1 + '%' : 'Rp ' + formatRupiah(newDiskonRp)}`;

    requestAuthorization(
      'Otorisasi Diskon Faktur',
      'DISKON_FAKTUR',
      nominalAuth,
      {
        transaksi: header.nomor ? header.nomor : 'DRAFT INVOICE',
        keteranganLengkap: infoDiskon, // <-- Kirim info ini
        barcode: ''
      },
      (authResult) => {
        applyChanges(authResult);
      },
      () => {
        toast.info('Perubahan diskon faktur dibatalkan.');
      }
    );

  } else {
    applyChanges();
  }
};

const handleItemDiscountChange = (item: Item) => {
  nextTick(() => {
    const originalRp = item.originalDiskonRp || 0;
    const originalPersen = item.originalDiskonPersen || 0;
    const currentRp = item.diskonRp || 0;
    const currentPersen = item.diskonPersen || 0;

    // Hanya minta otorisasi jika nilai berubah
    if (currentRp !== originalRp || currentPersen !== originalPersen) {

      // 1. Hitung Nominal Auth
      let diskonPerUnit = 0;
      if (currentRp > 0) {
        diskonPerUnit = currentRp;
      } else {
        diskonPerUnit = ((item.harga || 0) * currentPersen) / 100;
      }
      const totalNominalAuth = diskonPerUnit * (item.jumlah || 1);

      // 2. Set Context (untuk restore jika batal)
      activeItemForAuth.value = item;

      // 3. Susun Info Lengkap (Agar muncul di HP)
      const custName = header.customer.nama || 'Umum';
      const itemName = item.nama || 'Unknown Item';

      // Format: "Cust: ABC\nItem: Kaos Polos"
      const infoLengkap = `Cust: ${custName}\nItem: ${itemName}`;

      // 4. Request Auth
      requestAuthorization(
        `Otorisasi Diskon Item`,
        'DISKON_ITEM',
        totalNominalAuth,
        {
          barcode: item.barcode,
          transaksi: header.nomor ? header.nomor : 'DRAFT INVOICE',
          keteranganLengkap: infoLengkap   // <-- Kirim info ini
        },
        (authResult) => {
          // --- SUKSES (APPROVED) ---
          if (activeItemForAuth.value) {
            const currentItem = activeItemForAuth.value;

            // Update nilai original agar tidak minta auth lagi jika tidak diubah
            currentItem.originalDiskonRp = currentItem.diskonRp;
            currentItem.originalDiskonPersen = currentItem.diskonPersen;
            currentItem.lastPin = authResult.approver; // Simpan nama approver

            // Hitung ulang total baris
            currentItem.total = computeLineTotal(currentItem);
          }

          toast.success('Otorisasi diskon item disetujui.');
          calculateTotals();
          activeItemForAuth.value = null;
        },
        () => {
          // --- BATAL / DITOLAK ---
          if (activeItemForAuth.value) {
            // Kembalikan ke nilai lama
            activeItemForAuth.value.diskonRp = originalDiscount.item.rp;
            activeItemForAuth.value.diskonPersen = originalDiscount.item.persen;
            activeItemForAuth.value.total = computeLineTotal(activeItemForAuth.value);
          }
          toast.info('Perubahan diskon dibatalkan.');
          calculateTotals();
          activeItemForAuth.value = null;
        }
      );
    } else {
      // Jika tidak berubah, tetap hitung total untuk keamanan
      item.total = computeLineTotal(item);
      calculateTotals();
    }
  });
};

const onItemDiscountFocus = (item: Item) => {
  activeItemForAuth.value = item;
  originalDiscount.item = { persen: item.diskonPersen || 0, rp: item.diskonRp || 0 };
};

const requestAuthorization = (
  title: string,
  jenis: string,
  nominal: number,
  extraData: {
    transaksi?: string,
    barcode?: string,
    keteranganLengkap?: string
  } | null,
  onSuccess: (data: { authNomor: string; approver: string }) => void,
  onCancel: () => void
) => {
  authDialog.title = title;
  authDialog.jenis = jenis;
  authDialog.nominal = nominal;

  if (extraData) {
    authDialog.transaksi = extraData.transaksi || '';
    authDialog.barcode = extraData.barcode || '';
    // Mapping keteranganLengkap ke state keterangan dialog
    authDialog.keterangan = extraData.keteranganLengkap || '';
  } else {
    authDialog.transaksi = '';
    authDialog.barcode = '';
    authDialog.keterangan = '';
  }

  // [FIX] Wrapper untuk menutup modal sebelum menjalankan callback sukses
  // Ini mencegah modal "muter-muter" setelah Approved di HP
  authDialog.onSuccess = (data) => {
    authDialog.show = false;
    onSuccess(data);
  };

  authDialog.onCancel = onCancel;
  authDialog.show = true;
};

const fetchSalesCounters = async () => {
  try {
    const response = await api.get('/invoice-form/lookup/sales-counters');
    salesCounters.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat daftar Sales Counter.', error);
  }
};

const removeRow = (itemToDelete: Item) => {
  items.value = items.value.filter(item => item.id !== itemToDelete.id);
  if (items.value.length === 0) {
    addNewRow();
  }
};

// Fungsi untuk menghapus semua item dari SO DTF tertentu
const removeSoDtfItems = (itemWithSoDtf: Item) => {
  const soDtfNumber = itemWithSoDtf.noSoDtf;
  if (!soDtfNumber) return;
  items.value = items.value.filter(item => item.noSoDtf !== soDtfNumber);
  if (items.value.length === 0) {
    addNewRow();
  }
};

const handleDeleteItem = (item: Item) => {
  if (item.noSoDtf) {
    showConfirmation(
      'Konfirmasi Hapus SO DTF',
      `Anda yakin ingin menghapus semua item dari SO DTF No: ${item.noSoDtf}?`,
      () => removeSoDtfItems(item)
    );
  } else if (item.kode) {
    showConfirmation(
      'Konfirmasi Hapus Item',
      `Anda yakin ingin menghapus item: ${item.nama}?`,
      () => removeRow(item)
    );
  }
};

const handleClose = () => {
  // Tombol Tutup memicu konfirmasi manual,
  // Jika user klik Ya, paksa reset status agar guard global tidak mencegat lagi
  showConfirmation(
    'Tutup Form',
    'Data yang belum disimpan akan hilang. Yakin ingin menutup form?',
    () => {
      markAsSaved(); // Reset status
      router.back();
    }
  );
};

const openProductSearch = (index: number, isMulti: boolean) => {
  if (!header.customer.kode) return toast.error('Pilih customer terlebih dahulu.');
  if (header.nomorSo) return toast.info('Tidak bisa menambah item manual jika sudah terhubung ke SO.');

  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  dialogs.productSearch = true;
};

// const openSoDtfSearch = (item: Item, index: number) => {
//   // Cek semua kondisi di sini
//   if (header.nomorSo || item.kode) {
//     return; // Hentikan aksi jika sudah readonly
//   }
//   if (!header.customer.kode) {
//     return toast.error("Pilih customer terlebih dahulu.");
//   }

//   // Jika semua kondisi terpenuhi, buka modal
//   activeRowIndex.value = index;
//   dialogs.soDtfSearch = true;
// };

const onCustomerSelected = async (cust: Customer | null) => {
  if (cust) {
    // PERBAIKAN: Gabungkan level_kode dan level_nama secara manual
    const levelText = cust.level_kode ? `${cust.level_kode} - ${cust.level_nama}` : '';

    header.customer = {
      kode: cust.kode,
      nama: cust.nama,
      alamat: cust.alamat,
      kota: cust.kota,
      telp: cust.telp,
      level: levelText,
    };

    // PERBAIKAN: Panggil fungsi update member setelah customer dipilih
    updateMemberInfo(header.customer);

    // Ambil aturan diskon untuk customer yang baru dipilih
    try {
      const response = await api.get(`/invoice-form/lookup/discount-rule/${cust.kode}`);
      customerDiscountRule.value = response.data;
    } catch (error: unknown) {
      console.error(error);
      customerDiscountRule.value = null;
    }
  } else {
    // Kosongkan field jika tidak ada customer
    header.customer = { kode: '', nama: '', alamat: '', kota: '', telp: '', level: '' };
    updateMemberInfo(null);
  }

  if (customerDiscountRule.value && items.value.some(i => i.kode)) {
    await nextTick();
    applyDefaultDiscount();  // pasang diskon default reseller
    calculateTotals();        // hitung ulang total
  }
  dialogs.customerSearch = false;
};

const applyDefaultDiscount = () => {
  // [BARU] 1. Pengecekan Customer RETAIL / RETAILER
  // Pastikan ambil nama customer dengan aman (optional chaining)
  const custNama = header.customer?.nama?.toUpperCase() || '';

  // Jika customer RETAIL, paksa diskon 0 dan STOP.
  if (custNama.includes('RETAIL')) {
    header.diskonPersen1 = 0;
    return;
  }

  // --- Logika Lama ---
  const rule = customerDiscountRule.value;

  // Jangan terapkan jika tidak ada rule level atau jika data berasal dari SO (tarikan SO)
  if (!rule || header.nomorSo) {
    return;
  }

  // Logika dari Delphi: cek nominal belanja vs Rule Level
  if (totals.nettoSetelahDiskon >= rule.nominal1) {
    header.diskonPersen1 = rule.diskon1;
  } else if (totals.nettoSetelahDiskon >= rule.nominal2) {
    header.diskonPersen1 = rule.diskon2;
  } else {
    header.diskonPersen1 = 0;
  }
};

const onNewCustomerSaved = (customer: Customer) => {
  // bentuk tampilan (UI)
  const levelText = customer.level_kode
    ? `${customer.level_kode} - ${customer.level_nama}`
    : '';

  header.customer = {
    kode: customer.kode,
    nama: customer.nama,
    alamat: customer.alamat,
    kota: customer.kota,
    telp: customer.telp,

    // tampil di UI
    level: levelText,

    // data backend
    level_kode: customer.level_kode || null,
    level_nama: customer.level_nama || null,
  };

  dialogs.customerForm = false;
};

const onMemberSaved = (member: Member) => {
  header.memberHp = member.hp;
  header.memberNama = member.nama;
  header.memberAlamat = member.alamat;
  header.memberGender = member.gender;
  header.memberUsia = member.usia?.toString() ?? '';
  header.memberReferensi = member.referensi;

  dialogs.memberForm = false;
  toast.info('Data member telah diperbarui di form.');
};

const onPromoSelected = (promo: { nomor: string, namaPromo: string }) => {
  // Cek apakah promo berubah dan item sudah ada
  if (promo.nomor === 'PRO-2025-005' && items.value.some(i => i.kode)) {
    // Tampilkan konfirmasi
    showConfirmation(
      'Terapkan Promo?',
      'Menerapkan promo ini akan menghapus semua barang di keranjang. Lanjutkan?',
      () => {
        // User klik "Ya"
        header.nomorPromo = promo.nomor;
        header.namaPromo = promo.namaPromo;
        items.value = []; // Kosongkan grid
        addNewRow(); // Tambah baris kosong baru
        dialogs.promoSearch = false;
      }
    );
    // Saat 'showConfirmation' dipanggil, 'dialogConfirm.onConfirm' akan di-set
    // Kita juga perlu menangani 'Batal'
    dialogConfirm.onConfirm = () => {
      header.nomorPromo = promo.nomor;
      header.namaPromo = promo.namaPromo;
      items.value = [];
      addNewRow();
      dialogs.promoSearch = false;
      dialogConfirm.show = false; // Tutup dialog
    };

    // Jika user menutup/membatalkan dialog
    const unwatch = watch(() => dialogConfirm.show, (newValue) => {
      if (!newValue && dialogConfirm.onConfirm) { // Cek jika 'onConfirm' masih ada
        // 'onConfirm' belum dijalankan, artinya user klik Batal/Tutup
        unwatch();
        // Jangan set promo jika dibatalkan
      }
    });

  } else {
    // Jika grid kosong atau promo lain, langsung set
    header.nomorPromo = promo.nomor;
    header.namaPromo = promo.namaPromo;
    dialogs.promoSearch = false;
  }
};

function resolveUkuran(item: SoItem): string {
  // 1. Dari SO-DTF
  if (item.ukuran_dtf) return item.ukuran_dtf;

  // 2. Jika item custom JSON
  if (item.custom_json) {
    try {
      const parsed = JSON.parse(item.custom_json);
      if (Array.isArray(parsed.ukuranKaos) && parsed.ukuranKaos.length > 0) {
        return parsed.ukuranKaos[0].ukuran || "";
      }
    } catch { /* ignored */ }
  }

  // 3. fallback
  return item.ukuran_asli || "";
}

const onSoSelected = async (so: { Nomor: string }) => {
  console.log('onSoSelected called with:', so);

  dialogs.soSearch = false;
  if (!so.Nomor) return;

  if (header.nomorSo && header.nomorSo !== so.Nomor) {
    const confirmed = await new Promise((resolve) => {
      showConfirmation(
        'Ganti SO?',
        `Mengganti SO dari ${header.nomorSo} ke ${so.Nomor} akan menghapus semua item. Lanjutkan?`,
        () => resolve(true)
      );

      // Watch untuk deteksi jika user klik Batal
      const unwatch = watch(() => dialogConfirm.show, (newValue) => {
        if (!newValue) {
          unwatch();
          resolve(false);
        }
      });

      dialogConfirm.onConfirm = () => {
        resolve(true);
        unwatch();
      };
    });

    if (!confirmed) return; // User klik Batal
  }

  isLoading.value = true;
  try {
    console.log('Fetching SO details for:', so.Nomor);

    const response = await api.get(`/invoice-form/lookup/so-details/${so.Nomor}`);
    console.log('SO details response:', response.data);

    const { header: soHeader, items: soItems, dps } = response.data;

    // Reset items terlebih dahulu
    items.value = [];

    // --- Assign header dari SO ---
    Object.assign(header, {
      ...soHeader,
      tanggal: format(new Date(), "yyyy-MM-dd"), // tanggal invoice hari ini
    });

    // *** Perbaikan bagian jenis order ***
    header.jenisOrderKode = soHeader.jenisOrderKode || "";
    header.jenisOrderNama = soHeader.jenisOrderNama || "";  // <-- TAMBAHKAN INI
    header.namaDtf = soHeader.namaDtf || "";

    // [FIX] Gunakan soHeader, bukan headerRows[0]
    // Pastikan backend mengirim field ini di object 'header'
    header.mpNomorPesanan = soHeader.mpNomorPesanan || soHeader.so_mp_nomor_pesanan || '';
    header.mpResi = soHeader.mpResi || soHeader.so_mp_resi || '';

    // Cek flag marketplace. Backend mungkin mengirim boolean atau string 'Y'
    header.isMarketplace = soHeader.isMarketplace === true || soHeader.isMarketplace === 'Y' || soHeader.so_is_marketplace === 'Y';

    // --- Tanggal SO ---
    if (soHeader.tanggal) {
      const date = new Date(soHeader.tanggal);
      header.tanggalSo = date.toISOString().split("T")[0];
    } else {
      header.tanggalSo = "";
    }

    // --- Tanggal Tempo ---
    if (soHeader.tanggalTempo) {
      const date = new Date(soHeader.tanggalTempo);
      header.tanggalTempo = date.toISOString().split("T")[0];
    } else {
      header.tanggalTempo = "";
    }

    memberHpToSearch.value = soHeader.customer.telp || '';
    header.memberHp = soHeader.customer.telp || '';

    // Map items dengan memastikan semua field yang diperlukan ada
    items.value = soItems.map((item: SoItem, index: number) => {
      const ukuranFinal = resolveUkuran(item);

      return {
        id: Date.now() + index,
        kode: item.kode ?? "",
        nama: item.nama ?? "",
        ukuran: ukuranFinal,                 // 🔥 FIX UTAMA
        stok: Number(item.stokFisik || 0),       // Masuk ke kolom Stok Fisik
        stokPesanan: Number(item.stokPesanan || 0), // Masuk ke kolom Stok Pesan
        qtyso: item.qtyso ?? 0,
        jumlah: item.qtyso ?? 0,
        harga: item.harga ?? 0,
        diskonPersen: item.diskonPersen ?? 0,
        diskonRp: item.diskonRp ?? 0,
        total: item.total ?? 0,
        barcode: item.barcode ?? "",
        hpp: item.hpp ?? 0,
        kategori: item.kategori ?? "",
        noSoDtf: item.noSoDtf ?? "",
        terhitungPromo: item.terhitungPromo ?? false,
        _isHargaEditable: item._isHargaEditable ?? true,
        promo: item.promo ?? "",
        originalDiskonRp: item.originalDiskonRp ?? 0,
        originalDiskonPersen: item.originalDiskonPersen ?? 0,
        subtotal: (item.qtyso ?? 0) * (item.harga ?? 0),
        lastPin: item.lastPin ?? "",
        fromBackend: true,
      };
    });

    console.log('Mapped items:', items.value);

    linkedDps.value = dps;
    isSoLoaded.value = true;

    // Force reactivity update
    await nextTick();

  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    console.error('Error loading SO details:', axiosError);
    toast.error(axiosError.response?.data?.message || "Gagal memuat data SO.");
  }
  finally {
    isLoading.value = false;
  }
};

const onProductsSelected = (selectedProducts: ProductInput[]) => {
  dialogs.productSearch = false;
  if (!selectedProducts || selectedProducts.length === 0) return;

  const isPromoActive = header.nomorPromo === 'PRO-2025-005';
  const promoPrice = 33333;

  // Ambil Level Customer (String)
  const currentLevel = String(header.customer.level_kode || '1').trim();

  const newItems: Item[] = selectedProducts.map(product => {
    // Default: Selalu gunakan 'harga' (yang isinya brgd_harga atau 33333)
    let basePrice = Number(product.harga || 0);

    // PENGECUALIAN KHUSUS LEVEL 5
    if (currentLevel === '5') {
      // Pakai harga3
      // Jika harga3 kosong (0), tetap pakai 0 (agar user sadar harus input manual)
      // Jangan fallback ke harga retail!
      basePrice = Number(product.harga3 || 0);
    }
    // Level lain (1, 2, 3, 4) -> Tetap pakai basePrice (brgd_harga)

    const finalPrice = isPromoActive ? promoPrice : basePrice;

    // Pastikan editable jika bukan promo
    // Jika finalPrice 0, user WAJIB isi manual, jadi harus editable
    const isEditable = !isPromoActive;

    return {
      id: Date.now() + Math.random(),
      kode: product.kode,
      nama: product.nama,
      ukuran: product.ukuran,
      stok: Number(product.stokFisik || 0),       // Stok Fisik
      stokPesanan: Number(product.stokPesanan || 0), // Stok Pesanan

      harga: finalPrice,
      jumlah: 1,
      diskonPersen: 0,
      diskonRp: 0,

      total: finalPrice,

      barcode: product.barcode,
      qtyso: 0,
      noSoDtf: '',
      kategori: product.kategori || '',

      terhitungPromo: isPromoActive,
      _isHargaEditable: isEditable,

      hpp: 0
    };
  });

  if (items.value[activeRowIndex.value] && !items.value[activeRowIndex.value].kode) {
    items.value.splice(activeRowIndex.value, 1, ...newItems);
  } else {
    items.value.push(...newItems);
  }

  addNewRow();
  calculateTotals();

  audioSuccess.play().catch(() => { });
};

const onUnpaidDpSelected = (dp: DownPayment) => {
  dialogs.unpaidDpSearch = false;

  if (!linkedDps.value.some(d => d.nomor === dp.nomor)) {
    linkedDps.value.push(dp);
  } else {
    toast.warning('DP tersebut sudah ditambahkan.');
  }
};

// const onSoDtfSelected = async (soDtf: SoDtf) => {
//   dialogs.soDtfSearch = false;
//   if (!soDtf.nomor) return;

//   try {
//     const response = await api.get<SoDtfItem[]>(`/invoice-form/lookup/so-dtf-details/${soDtf.nomor}`);
//     const soDtfItems = response.data;

//     if (soDtfItems.length === 0) {
//       return toast.warning('SO DTF ini tidak memiliki detail item.');
//     }

//     const newItems = soDtfItems.map(item => ({
//       id: Date.now() + Math.random(),
//       kode: item.kode,
//       nama: item.nama,
//       ukuran: item.ukuran,
//       jumlah: item.jumlah,
//       harga: item.harga,
//       stok: 0,
//       qtyso: 0,
//       diskonPersen: 0,
//       diskonRp: 0,
//       total: item.jumlah * item.harga,
//       noSoDtf: item.kode,
//       terhitungPromo: false,
//       _isHargaEditable: true,
//     }));

//     items.value.splice(activeRowIndex.value, 1, ...newItems);
//     addNewRow();
//   } catch (error: unknown) {
//     // safe handling untuk unknown
//     if (axios.isAxiosError(error)) {
//       toast.error(error.response?.data?.message || 'Gagal memuat detail SO DTF.');
//     } else {
//       toast.error('Gagal memuat detail SO DTF.');
//     }
//   }
// };

const calculateTotals = () => {
  // ---------------------------------------------------------------------
  // [REVISI] 1 & 2: HITUNG BERSIH DARI ITEM DULU (BOTTOM-UP)
  // Agar support Diskon Persen maupun Rupiah dengan akurat
  // ---------------------------------------------------------------------
  let grossSubTotal = 0; // Total Kotor (Harga x Jumlah)
  let netItemTotal = 0;  // Total Bersih (item.total)

  // Loop sekali untuk update total per baris & akumulasi
  items.value.forEach((item) => {
    // a. Pastikan item.total terupdate logic terbaru
    item.total = computeLineTotal(item);

    // b. Akumulasi
    grossSubTotal += (item.jumlah || 0) * (item.harga || 0);
    netItemTotal += item.total;
  });

  // Total Diskon Item adalah selisih Kotor - Bersih
  const totalDiskonItem = grossSubTotal - netItemTotal;

  // Base calculation untuk tahap selanjutnya (Netto Item)
  const afterItemDiscount = netItemTotal;

  // ---------------------------------------------------------------------
  // FIX: JIKA INVOICE BERASAL DARI SO → DISKON FAKTUR TIDAK BOLEH DIHITUNG ULANG
  // ---------------------------------------------------------------------
  if (header.nomorSo) {
    totals.subTotal = netItemTotal; // Set Subtotal Bersih
    totals.totalDiskonItem = totalDiskonItem;
    totals.totalDiskonFaktur = Number(header.diskonRp || 0);

    const afterAllDiscount = afterItemDiscount - totals.totalDiskonFaktur;

    const totalPpn = afterAllDiscount * (header.ppnPersen / 100);
    const totalDp = linkedDps.value.reduce(
      (sum, dp) => sum + (dp.nominal || 0),
      0
    );

    totals.totalPpn = totalPpn;
    totals.grandTotal = afterAllDiscount + totalPpn + (header.biayaKirim || 0) - (header.mpBiayaPlatform || 0);
    totals.totalDp = totalDp;
    totals.sisaPiutang = Math.max(0, totals.grandTotal - totalDp);

    return; // ← STOP
  }

  // ---------------------------------------------------------------------
  // 3. DISKON FAKTUR (PERSEN)
  // ---------------------------------------------------------------------
  // Diskon persen diambil dari afterItemDiscount (Nilai bersih item)
  const diskon1Amount = (header.diskonPersen1 / 100) * afterItemDiscount;
  const afterDiscount1 = afterItemDiscount - diskon1Amount;

  const diskon2Amount = (header.diskonPersen2 / 100) * afterDiscount1;

  // ---------------------------------------------------------------------
  // 4. DISKON FAKTUR MANUAL (RP)
  // ---------------------------------------------------------------------
  const diskonManual = Number(header.diskonRp || 0);

  // ---------------------------------------------------------------------
  // 5. TOTAL DISKON FAKTUR (gabungan)
  // ---------------------------------------------------------------------
  const diskonFaktur = Math.round(
    diskonManual + diskon1Amount + diskon2Amount
  );

  // ---------------------------------------------------------------------
  // 6. NETTO SETELAH SEMUA DISKON
  // ---------------------------------------------------------------------
  const nettoSetelahDiskon = afterItemDiscount - diskonFaktur;

  // ---------------------------------------------------------------------
  // 7. PPN
  // ---------------------------------------------------------------------
  const totalPpn = nettoSetelahDiskon * (header.ppnPersen / 100);

  // ---------------------------------------------------------------------
  // 8. DP
  // ---------------------------------------------------------------------
  const totalDp = linkedDps.value.reduce(
    (sum, dp) => sum + (dp.nominal || 0),
    0
  );

  // ---------------------------------------------------------------------
  // 9. UPDATE TOTALS
  // ---------------------------------------------------------------------
  // SubTotal di sini kita isi dengan Net Item Total (Total yg sudah dikurangi diskon item)
  // Sesuai dengan logic 'netItemTotal' di atas.
  totals.subTotal = netItemTotal;

  totals.totalDiskonItem = totalDiskonItem;
  totals.totalDiskonFaktur = diskonFaktur;

  totals.nettoSetelahDiskon = nettoSetelahDiskon;
  totals.totalPpn = totalPpn;

  totals.grandTotal = Math.max(0, nettoSetelahDiskon + totalPpn + (header.biayaKirim || 0) - (header.mpBiayaPlatform || 0));

  totals.totalDp = totalDp;
  totals.sisaPiutang = Math.max(0, totals.grandTotal - totalDp);
};

const handleBonusSelection = (bonusItem: Item) => {
  dialogs.promoBonus = false;

  items.value.push({
    id: Date.now(),
    kode: bonusItem.kode,
    nama: `${bonusItem.nama} #BONUS`,
    ukuran: bonusItem.ukuran,
    stok: bonusItem.stok,
    qtyso: 0,
    jumlah: activePromoForBonus.value.qty, // Ambil qty dari promo
    harga: 0,
    diskonPersen: 0,
    diskonRp: 0,
    total: 0,
    promo: activePromoForBonus.value.nomor,
    _isHargaEditable: true,
    terhitungPromo: true,
  });
  addNewRow();
};

const applyPromoToItems = async (promoNomor: string) => {
  if (!promoNomor) return;

  try {
    const { data } = await api.get(`/invoice-form/lookup/promo-items/${promoNomor}`);
    const promoItems = data || [];

    items.value.forEach(item => {
      if (item.terhitungPromo === true) return;
      const match = promoItems.find(p => p.kode === item.kode && p.ukuran === item.ukuran);
      if (match) {
        const harga = item.harga || 0;
        const diskonPersen = match.discPersen || 0;
        const diskonRp = match.discRp || (harga * diskonPersen / 100);

        // Diskon berlaku untuk semua qty
        item.diskonPersen = diskonPersen;
        item.diskonRp = diskonRp;
        item.total = (item.jumlah || 0) * (harga - diskonRp);
        item.terhitungPromo = true;
      } else {
        item.diskonPersen = 0;
        item.diskonRp = 0;
        item.terhitungPromo = false;
        item.total = (item.jumlah || 0) * (item.harga || 0);
      }
    });

    calculateTotals();
  } catch (err) {
    console.error('Gagal menerapkan promo:', err);
  }
};

// const computeItemDiscount = (item: Item): number => {
//   const qty = item.jumlah || 0;
//   const perUnitDisc = item.diskonRp || 0;

//   if (item.terhitungPromo && (item.promoQty ?? 0) > 0) {
//     const discQty = Math.min(item.promoQty!, qty); // non-kelipatan: maksimal 1
//     return discQty * perUnitDisc;
//   }
//   // kasus diskon manual/normal: berlaku ke semua qty
//   return qty * perUnitDisc;
// };

const computeLineTotal = (item) => {
  const harga = item.harga || 0;
  const jumlah = item.jumlah || 0;
  const sub = harga * jumlah;

  let nominalDiskon = 0;

  // Logika Prioritas: Jika ada Diskon Rp, pakai itu. Jika tidak, pakai Persen.
  if ((item.diskonRp || 0) > 0) {
    nominalDiskon = (item.diskonRp || 0) * jumlah;
  } else {
    nominalDiskon = (sub * (item.diskonPersen || 0)) / 100;
  }

  // Cegah minus
  return Math.max(0, sub - nominalDiskon);
};

// --- Method Baru: Fetch Promo saat Mounted ---
// Pindahkan logic fetch promo dari handleProceedToPayment ke sini agar datanya standby
const fetchActivePromos = async () => {
  try {
    const response = await api.get('/invoice-form/lookup/active-promos', {
      params: { tanggal: header.tanggal, cabang: header.gudang.kode }
    });
    activePromosList.value = (response.data ?? []) as ActivePromo[];
  } catch (error) {
    console.error("Gagal memuat daftar promo:", error);
  }
};

// --- Method Baru: Cek Promo Real-time ---
// Fungsi ini hanya menghitung potensi, TIDAK mengubah header.diskonRp secara langsung
const checkRealtimePromoEligibility = () => {
  // Reset
  promoNotification.value = '';
  potentialPromoDiscount.value = 0;
  isGrandOpeningPromo.value = false; // Reset flag style

  // Jika sudah ada promo manual yang dipilih (F1), jangan timpa
  if (header.nomorPromo && header.nomorPromo !== '') return;

  const validItems = items.value.filter(i => i.kode);
  if (validItems.length === 0) return;

  let message = '';
  let discount = 0;

  // --- 1. LOGIKA KHUSUS GRAND OPENING (K11) ---
  if (header.gudang.kode === 'K11') {
    // Hitung total gross semua barang (kecuali jasa/ongkir jika ada filter khusus)
    const totalGross = validItems.reduce((sum, item) => {
      // Exclude item SO DTF / Pengajuan harga dari diskon otomatis jika diperlukan
      if (item.noSoDtf || item.noPengajuanHarga) return sum;
      return sum + ((item.harga || 0) * (item.jumlah || 0));
    }, 0);

    if (totalGross > 0) {
      discount = totalGross * 0.10; // 10% All Item
      message = `🎊 GRAND OPENING SPECIAL! Diskon 10% All Item Otomatis! (Hemat ${formatRupiah(discount)})`;
      isGrandOpeningPromo.value = true; // Aktifkan style khusus
    }
  }

  // --- 2. LOGIKA REGULER (Cabang Lain) ---
  else {
    const promo008 = activePromosList.value.find(p => p.pro_nomor === 'PRO-2025-008');
    const promo010 = activePromosList.value.find(p => p.pro_nomor === 'PRO-2025-010');

    // Hitung Total Reguler & Belanja
    const totalReguler = validItems.reduce((sum, item) => {
      if (item.kategori === 'REGULER' && !item.nama?.toUpperCase().includes('JERSEY')) {
        return sum + (item.total || 0);
      }
      return sum;
    }, 0);

    const totalBelanja = validItems.reduce((sum, item) => {
      if (!item.noSoDtf && !item.noPengajuanHarga) return sum + (item.total || 0);
      return sum;
    }, 0);

    // Cek Prioritas Promo Reguler
    if (promo010 && totalReguler >= 250000) {
      const kelipatan = Math.floor(totalReguler / 250000);
      discount = 25000 * kelipatan;
      message = `🎉 SELAMAT! Transaksi ini berhak mendapatkan Potongan Kelipatan Rp ${formatRupiah(discount)}!`;
    } else if (promo008 && totalBelanja >= promo008.pro_totalrp) {
      discount = promo008.pro_disrp * Math.floor(totalBelanja / promo008.pro_totalrp);
      message = `✨ DISKON BULANAN AKTIF: Anda berhak mendapatkan potongan Rp ${formatRupiah(discount)}`;
    }
  }

  // Update State UI
  if (message) {
    promoNotification.value = message;
    potentialPromoDiscount.value = discount;
  }
};

const handleProceedToPayment = async () => {
  // --- 1) Validasi dasar ---
  const validItems = items.value.filter(i => i.kode);
  if (!header.customer.kode) return toast.error("Customer harus diisi.");
  if (!header.customer.level) return toast.error("Level customer belum di-setting.");
  if (validItems.length === 0) return toast.error("Detail barang harus diisi.");

  for (const item of validItems) {
    const kodeUp = item.kode?.toUpperCase() || '';
    const isNonStock = kodeUp.startsWith("JASA") || kodeUp.includes("FILE");
    if ((item.harga || 0) === 0 && !item.promo && !header.isMarketplace && !isNonStock) {
      return toast.error(`Harga untuk ${item.nama} harus diisi.`);
    } else if ((item.harga || 0) === 0 && !item.promo && header.isMarketplace) {
      return toast.error(`Harga untuk ${item.nama} masih 0. Silakan input harga marketplace manual.`);
    }
  }

  const totalQty = validItems.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  if (totalQty <= 0) return toast.error('Qty Invoice kosong semua.');

  // --- 2) Validasi stok minus ---
  const stokOk = await checkStokMinus();
  if (!stokOk) return;

  // ============================================================
  // [FIX] RE-CALCULATE PROMO GRAND OPENING (PRO-2025-004)
  // ============================================================
  // Jika promo Grand Opening sedang terpilih, jalankan ulang perhitungan
  // untuk menangkap item baru yang ditambahkan setelah batal bayar.
  if (header.nomorPromo === 'PRO-2025-004') {
    // Panggil fungsi existing yang mengambil aturan valid dari backend
    // Fungsi ini akan mengecek item yang belum 'terhitungPromo'
    // dan menerapkan diskon (2000 utk Jersey, 10% utk lainnya, dll)
    await applyPromoToItems('PRO-2025-004');

    // Pastikan total terupdate di UI sebelum modal muncul
    calculateTotals();
  }
  // ============================================================

  // --- 3) Validasi promo spesifik (beli 3 = 100rb) ---
  if (header.nomorPromo === 'PRO-2025-005' && totalQty < 3) {
    return toast.error('Qty minimal 3 pcs untuk promo ini.');
  }

  // --- 4) Cek promo aktif & terapkan ---
  try {
    const promoResponse = await api.get('/invoice-form/lookup/active-promos', {
      params: { tanggal: header.tanggal, cabang: header.gudang.kode }
    });

    const activePromos = (promoResponse.data ?? []) as ActivePromo[];

    const promo004 = activePromos.find(p => p.pro_nomor === 'PRO-2025-004');
    const promo008 = activePromos.find(p => p.pro_nomor === 'PRO-2025-008');
    const promo010 = activePromos.find(p => p.pro_nomor === 'PRO-2025-010');

    let promoToApply: ActivePromo | null = null;
    let promoDiskon = 0;

    // Hitung total belanja REGULER saja
    const totalReguler = items.value.reduce((sum, item) => {
      if (item.kategori === 'REGULER' && !item.nama.toUpperCase().includes('JERSEY')) {
        return sum + (item.total || 0);
      }
      return sum;
    }, 0);

    const totalBelanja = items.value.reduce((sum, item) => {
      if (!item.noSoDtf && !item.noPengajuanHarga) return sum + (item.total || 0);
      return sum;
    }, 0);

    // === PROMO-2025-010 ===
    // Rp 25.000 per kelipatan 250.000 — hanya barang reguler
    if (promo010 && totalReguler >= 250000) {
      const kelipatan = Math.floor(totalReguler / 250000);
      promoDiskon = 25000 * kelipatan;
      promoToApply = promo010;
    }

    // === PROMO-2025-008 (fallback jika promo010 tidak memenuhi) ===
    if (!promoToApply && promo008 && totalBelanja >= promo008.pro_totalrp) {
      promoDiskon = promo008.pro_disrp * Math.floor(totalBelanja / promo008.pro_totalrp);
      promoToApply = promo008;
    }

    // Jika promo item-based (004) aktif, kita tetap apply juga—tapi tidak menimpa diskon faktur
    // Kalau kamu ingin 004 diprioritaskan di atas 008/009, pindahkan blok ini ke atas.
    if (promo004) {
      // Kalau belum ada promo F1 dipilih, tawarkan untuk apply item-based
      if (!header.nomorPromo) {
        const promoConfirmed = await new Promise<boolean>((resolve) => {
          showConfirmation(
            `Dapat ${promo004.pro_judul}`,
            `Promo ini memberikan diskon per item (sesuai daftar). Terapkan promo ini ke daftar barang?`,
            () => resolve(true)
          );

          const unwatch = watch(() => dialogConfirm.show, (open) => {
            if (!open) { unwatch(); resolve(false); }
          });

          dialogConfirm.onConfirm = () => {
            resolve(true);
            dialogConfirm.onConfirm = () => { };
            unwatch();
          };
        });

        if (promoConfirmed) {
          await applyPromoToItems(promo004.pro_nomor);
          header.nomorPromo = promo004.pro_nomor;
        }
      }
    }

    // Jika ada promo header-based yang memenuhi & belum ada promo F1 dipilih, tawarkan
    if (promoToApply && !header.nomorPromo) {
      const promoConfirmed = await new Promise<boolean>((resolve) => {
        showConfirmation(
          `Dapat ${promoToApply!.pro_judul}`,
          `Anda mendapatkan diskon promo ${formatRupiah(promoDiskon)}. Gunakan promo ini? (Diskon faktur lain akan direset)`,
          () => resolve(true)
        );

        const unwatch = watch(() => dialogConfirm.show, (open) => {
          if (!open) { unwatch(); resolve(false); }
        });

        dialogConfirm.onConfirm = () => {
          resolve(true);
          dialogConfirm.onConfirm = () => { };
          unwatch();
        };
      });

      if (promoConfirmed) {
        header.diskonPersen1 = 0;
        header.diskonPersen2 = 0;
        header.diskonRp = promoDiskon;
        header.nomorPromo = promoToApply.pro_nomor;
        calculateTotals();
      }
    }
  } catch (error) {
    console.error("❌ Gagal memeriksa promo otomatis:", error);
    toast.error('Gagal memeriksa promo otomatis.');
  }

  // --- 5) Promo tebus murah (bonus) ---
  if (header.nomorPromo === 'PRO-2025-002') {
    activePromoForBonus.value = { nomor: header.nomorPromo, qty: 1 };
    dialogs.promoBonus = true;
    return;
  }

  // [BARU] Percabangan Flow Pembayaran
  if (header.isMarketplace) {
    // FLOW MARKETPLACE (KON)
    // Tidak perlu bayar tunai sekarang. Langsung konfirmasi simpan.
    showConfirmation(
      'Simpan Transaksi Marketplace?',
      `Total Tagihan: ${formatRupiah(totals.grandTotal)}\n\nTransaksi ini akan dicatat sebagai PIUTANG ke ${header.mpNama}. Lanjutkan?`,
      () => executeSaveMarketplace() // Function baru khusus MP
    );
  } else {
    const proceedToPayment = () => { dialogs.payment = true; };
    if (!header.memberHp) {
      showConfirmation('Konfirmasi Member', 'No. HP Member kosong. Yakin akan melanjutkan?', proceedToPayment);
    } else {
      proceedToPayment();
    }
  }
};

// [BARU] Function Simpan Khusus Marketplace
const executeSaveMarketplace = async () => {
  // Kita buat payload pembayaran "Palsu" tapi Valid
  // Bayar 0, Sisanya masuk Piutang
  const dummyPayment = {
    tunai: 0,
    transfer: { nominal: 0 },
    voucher: { nominal: 0 },
    retur: { nominal: 0 },
    // Penting: Tandai ini pelunasan kredit/piutang di backend
    status: 'PIUTANG'
  };

  const payload = {
    header: header,
    items: items.value.filter(i => i.kode),
    footer: totals, // berisi total belanja
    payment: dummyPayment, // Kirim payment 0
    dps: linkedDps.value,
    isNew: !isEditMode.value,
    totals: totals,
  };

  isSaving.value = true; // Use existing isSaving ref if available or create one locally/globally
  // Panggil API Save
  try {
    const response = await api.post('/invoice-form/save', payload);
    toast.success(response.data.message);
    onSaveSuccess();
  } catch (error) {
    console.error(error);
    toast.error('Gagal menyimpan transaksi marketplace.');
  } finally {
    isSaving.value = false;
  }
};

const checkStokMinus = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const validItems = items.value.filter(i => i.kode);

    const itemsMinus = validItems.filter(item => {
      const kodeUp = item.kode?.toUpperCase() || '';

      // 1. Cek Pengecualian (JASA, FILE, SO-DTF tidak cek stok)
      const isNonStock = kodeUp.startsWith("JASA") || kodeUp.includes("FILE");

      if (isNonStock || item.kategori === 'SO-DTF' || item.noSoDtf) {
        return false;
      }

      // 2. Logika Validasi Stok Berdasarkan Konteks
      const qty = item.jumlah || 0;

      if (header.nomorSo) {
        // Konteks SO: Cek terhadap Stok Pesanan
        return qty > (item.stokPesanan || 0);
      } else {
        // Konteks Langsung: Cek terhadap Stok Fisik
        return qty > (item.stok || 0);
      }
    });

    if (itemsMinus.length > 0) {
      const itemNames = itemsMinus.map(i => `${i.nama} (${i.ukuran})`).join(', ');

      // Tentukan jenis stok untuk pesan konfirmasi agar user paham
      const jenisStok = header.nomorSo ? 'Pesanan' : 'Fisik';

      showConfirmation(
        'Konfirmasi Stok Minus',
        `Stok ${jenisStok} untuk item (${itemNames}) akan minus. Yakin akan melanjutkan?`,
        () => resolve(true)
      );

      // Watcher untuk tombol Batal/Tutup Dialog
      const unwatch = watch(() => dialogConfirm.show, (newValue) => {
        if (!newValue) {
          unwatch();
          // Jika onConfirm masih ada (belum dijalankan), berarti user klik batal/tutup
          if (dialogConfirm.onConfirm) {
            // do nothing or handle cancel specifics
          } else {
            // Dialog confirm sudah tereksekusi (resolve true), kalau belum berarti batal
            resolve(false);
          }

          // Fallback aman: jika user menutup dialog tanpa klik "Ya", kita anggap batal
          // (Logic watcher Anda sebelumnya agak kompleks, ini penyederhanaan yang aman)
          // Namun kita ikuti pola yang sudah ada:
          if (!dialogConfirm.onConfirm) {
            // Jika onConfirm sudah null, berarti sudah diklik Ya
          } else {
            resolve(false);
          }
        }
      });

      // Wrap onConfirm lama agar watcher bisa bersih
      const originalOnConfirm = dialogConfirm.onConfirm;
      dialogConfirm.onConfirm = () => {
        originalOnConfirm(); // Panggil resolve(true) yang dipassing showConfirmation
        unwatch();
      };

    } else {
      resolve(true);
    }
  });
};

const onSaveSuccess = () => {
  audioSuccess.play().catch(() => { });
  markAsSaved();
  // Dipanggil dari PaymentModal setelah save berhasil
  router.push({ name: 'Invoice' }); // Kembali ke halaman browse
};

const updateMemberInfo = (customer: Customer | null) => {
  const phone = customer?.telp || '';
  header.memberHp = phone;
  memberHpToSearch.value = phone;
};

const handleBarcodeScan = async () => {
  // 1. Cek Promo 005 (Scan non-aktif)
  if (header.nomorPromo === 'PRO-2025-005') {
    audioError.play().catch(() => { }); // Bunyi Error
    return toast.error('Scan barcode non-aktif saat promo ini. Gunakan F1/F2.');
  }

  // 2. Cek Customer
  if (!header.customer.kode) {
    audioError.play().catch(() => { });
    return toast.error('Pilih customer terlebih dahulu sebelum scan!');
  }

  const barcode = scannedBarcode.value;
  if (!barcode) return;

  // 3. Kunci Input
  isScanning.value = true;

  try {
    // A. Cek apakah barang sudah ada di list (Increment Qty)
    const existingItem = items.value.find(item => item.barcode === barcode && item.kode);

    if (existingItem) {
      existingItem.jumlah += 1;

      // Feedback Sukses
      audioSuccess.play().catch(() => { });
      toast.info(`+1 ${existingItem.nama}`);

      scannedBarcode.value = '';
      return; // Selesai, masuk finally
    }

    // B. Jika belum ada, Cari ke API
    const response = await api.get(`/invoice-form/by-barcode/${barcode}`, {
      params: { gudang: header.gudang.kode }
    });

    const product = response.data;

    // --- Logic penentuan harga (Copy dari kode lama Anda) ---
    const emptyRowIndex = items.value.findIndex(item => !item.kode);
    const currentLevel = String(header.customer.level_kode || '1').trim();
    let basePrice = Number(product.harga || 0);

    if (currentLevel === '5') basePrice = Number(product.harga3 || 0);
    else if (currentLevel === '2' && Number(product.harga2) > 0) basePrice = Number(product.harga2);
    else if (currentLevel === '3' && Number(product.harga3) > 0) basePrice = Number(product.harga3);
    else if (currentLevel === '4' && Number(product.harga4) > 0) basePrice = Number(product.harga4);

    const isPromoActive = header.nomorPromo === 'PRO-2025-005';
    const finalPrice = isPromoActive ? 33333 : basePrice;
    const isEditable = !isPromoActive;
    // --------------------------------------------------------

    const newItem = {
      id: Date.now(),
      kode: product.kode,
      nama: product.nama,
      ukuran: product.ukuran,
      stok: product.stok,
      harga: finalPrice,
      jumlah: 1,
      diskonPersen: 0,
      diskonRp: 0,
      total: finalPrice,
      barcode: product.barcode,
      qtyso: 0,
      kategori: product.kategori || '',
      terhitungPromo: isPromoActive,
      _isHargaEditable: isEditable,
    };

    if (emptyRowIndex !== -1) {
      items.value.splice(emptyRowIndex, 1, newItem);
    } else {
      items.value.push(newItem);
    }

    addNewRow();

    // Feedback Sukses
    audioSuccess.play().catch(() => { });
    toast.success(`OK: ${product.nama}`);
    scannedBarcode.value = '';

  } catch (error: unknown) {
    // Feedback Error
    audioError.play().catch(() => { });

    if (axios.isAxiosError(error) && error.response) {
      toast.error(error.response.data?.message || `Barcode ${barcode} tidak valid.`);
    } else {
      toast.error(`Barcode ${barcode} tidak valid.`);
    }

    // Select text agar user bisa langsung ganti tanpa hapus manual
    nextTick(() => {
      barcodeInputRef.value?.select();
    });

  } finally {
    isScanning.value = false;

    // [PENTING] Kembalikan fokus ke input scanner
    nextTick(() => {
      barcodeInputRef.value?.focus();
    });
  }
};

// const validateQty = (item: Item) => {
//   if (item.jumlah > (item.stok || 0)) {
//     item.jumlah = item.stok || 0;
//     toast.warning(`Jumlah tidak boleh melebihi stok (${item.stok}) untuk ${item.nama}`);
//   }
// };

const handleJumlahChange = async (item: Item) => {
  if (item.terhitungPromo) return;

  // Cek ke backend apakah ada promo untuk item ini
  try {
    const response = await api.get('/invoice-form/lookup/applicable-item-promo', {
      params: {
        kode: item.kode,
        ukuran: item.ukuran,
        tanggal: header.tanggal,
      }
    });

    const promo = response.data;
    if (promo) {
      // Terapkan diskon dari promo
      item.diskonPersen = promo.pb_disc || 0;
      item.diskonRp = promo.pb_diskon || 0;
      toast.success(`Promo diskon diterapkan untuk ${item.nama}`);
    }
  } catch (error) {
    // Tidak perlu menampilkan error jika promo tidak ditemukan
    console.error("Gagal memeriksa promo item:", error);
  }
};

// Tambahkan di helper function atau di dalam component
const generateIdRec = (cabang: string) => {
  const timestamp = format(new Date(), "yyyyMMddHHmmssSSS");
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${cabang}INV${timestamp}${random}`;
};

const resetForm = async () => {
  // Reset state ke awal
  Object.assign(header, initialHeaderState);

  // [BARU] GENERATE IDREC DI SINI (Idempotency Key)
  // ID ini dibuat saat form kosong. Jika user klik simpan berkali-kali karena lag,
  // ID yang dikirim ke backend TETAP SAMA, sehingga backend bisa mendeteksi duplikat.
  const userCabang = authStore.user?.cabang || 'K01';
  header.idrec = generateIdRec(userCabang);

  // Logic existing Anda
  if (authStore.user?.cabang === 'KON') {
    header.isMarketplace = true;
  }

  items.value = [];
  linkedDps.value = [];
  isSoLoaded.value = false;
  addNewRow();

  markAsSaved();

  try {
    const authStore = useAuthStore(); // (Opsional: authStore sudah ada di scope atas, tapi tidak apa-apa)
    const cabang = authStore.userCabang;

    console.log('User cabang from store:', cabang);

    if (!cabang || cabang === '-') {
      console.log('No cabang available');
      onCustomerSelected(null);
      return;
    }

    const response = await api.get(`/invoice-form/lookup/default-customer?cabang=${cabang}`);
    console.log('Default customer response:', response.data);

    if (response.data) {
      onCustomerSelected(response.data);
    } else {
      onCustomerSelected(null);
    }
  } catch (error) {
    console.error('Error fetching default customer:', error);
    onCustomerSelected(null);
  }
};

const getQtyClass = (item: Item) => {
  const kodeUp = item.kode?.toUpperCase() || '';

  // [FIX] Pengecualian Global:
  // JASA, FILE, dan SO-DTF (item yg punya noSoDtf) TIDAK PERLU warnai merah
  const isNonStock =
    kodeUp.startsWith("JASA") ||
    kodeUp.includes("FILE") ||
    !!item.noSoDtf ||              // <--- Tambahan Penting
    item.kategori === 'SO-DTF';    // <--- Tambahan Penting

  if (isNonStock) return '';

  // [FIX] Warna merah sesuai konteks
  if (header.nomorSo) {
    // Konteks SO: Cek Stok Pesanan
    if ((item.stokPesanan || 0) < (item.jumlah || 0)) return 'text-red font-weight-bold';
  } else {
    // Konteks Fisik: Cek Stok Fisik
    if ((item.stok || 0) < (item.jumlah || 0)) return 'text-red font-weight-bold';
  }

  return '';
};

const isHargaEditable = (item: Item) => {
  // Bisa diedit hanya kalau row ini memang ditandai editable
  return item._isHargaEditable === true;
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    await fetchActivePromos();
    const response = await api.get(`/invoice-form/${nomor}`);
    const { header: h, items: its, dps } = response.data;

    isLockedFsk.value = response.data.isLockedFsk === true;

    if (isLockedFsk.value) {
      toast.warning("Invoice sudah masuk FSK — mode baca saja.");
    }

    /* =======================
       HEADER
       ======================= */
    header.nomor = h.inv_nomor;
    header.tanggal = format(parseISO(h.inv_tanggal), 'yyyy-MM-dd');

    header.customer = {
      kode: h.inv_cus_kode,
      nama: h.cus_nama,
      alamat: h.cus_alamat,
      kota: h.cus_kota,
      telp: h.cus_telp,
      level: h.xLevel
    };

    header.nomorSo = h.inv_nomor_so || '';
    header.tanggalSo = h.so_tanggal ? format(parseISO(h.so_tanggal), 'yyyy-MM-dd') : '';
    header.top = h.inv_top;
    header.salesCounter = h.inv_sc;
    header.keterangan = h.inv_ket;

    header.diskonPersen1 = h.inv_disc1 || 0;
    header.diskonPersen2 = h.inv_disc2 || 0;
    header.diskonRp = 0;
    header.biayaKirim = h.inv_bkrm;

    header.ppnPersen = Number(h.inv_ppn) || 0;

    header.memberHp = h.inv_mem_hp || '';
    header.memberNama = h.inv_mem_nama || '';
    header.memberAlamat = h.inv_mem_alamat || '';
    header.memberGender = h.inv_mem_gender || '';
    header.memberUsia = h.inv_mem_usia || '';
    header.memberReferensi = h.inv_mem_referensi || '';

    try {
      const r = await api.get(
        `/invoice-form/lookup/discount-rule/${header.customer.kode}`
      );
      customerDiscountRule.value = r.data;
    } catch {
      customerDiscountRule.value = null;
    }

    header.nomorPromo = h.inv_pro_nomor || ''; // [PENTING] Set nomor promo dari backend
    header.namaPromo = h.namaPromo || '';      // [PENTING] Set nama promo

    // [BARU] Mapping Data Marketplace
    // Backend mengirim: inv_is_marketplace ('Y'/'N'), inv_mp_nama, dst.
    header.isMarketplace = h.inv_is_marketplace === 'Y';
    header.mpNama = h.inv_mp_nama || 'SHOPEE';
    header.mpNomorPesanan = h.inv_mp_nomor_pesanan || '';
    header.mpResi = h.inv_mp_resi || '';
    header.mpBiayaPlatform = Number(h.inv_mp_biaya_platform || 0);

    /* =======================
       ITEMS
       ======================= */

    items.value = its.map((it, idx) => {
      const harga = Number(it.harga);
      const qty = Number(it.jumlah);
      const diskRp = Number(it.diskonRp);
      const diskPersen = Number(it.diskonPersen || 0);

      const isPromoItem = (diskRp > 0 || diskPersen > 0) && !!header.nomorPromo;

      return {
        id: Date.now() + idx,

        kode: it.kode,
        nama: it.nama_barang,
        ukuran: it.ukuran,

        jumlah: qty,
        harga: harga, // Gunakan harga asli/netto dari backend

        diskonRp: diskRp,
        diskonPersen: diskPersen, // [FIX] Map diskon persen

        total: it.total, // Gunakan total dari backend agar akurat

        barcode: it.barcode || "",
        stok: it.stok || 0,        // Fisik
        stokPesanan: it.stokSO || 0, // Pesanan
        qtyso: it.qtySO || 0,

        kategori: it.kategori || '', // [FIX] Map kategori dari backend ('REGULER', etc)

        originalDiskonRp: diskRp,
        originalDiskonPersen: diskPersen,

        terhitungPromo: isPromoItem, // [FIX] Set status promo
        promoQty: 0,
        promo: isPromoItem ? header.nomorPromo : "",
        _isHargaEditable: true,

        nourut: it.nourut,
        fromBackend: true,
      };
    });

    addNewRow();

    linkedDps.value = dps;

    await nextTick();
    calculateTotals();
    applyDefaultDiscount(); // ini wajib dipanggil setelah load
    calculateTotals(); // hitung ulang setelah diskon berubah
    checkRealtimePromoEligibility();

    isSoLoaded.value = !!header.nomorSo;

    await nextTick();
    markAsSaved();

  } catch (error) {
    const msg = axios.isAxiosError(error)
      ? error.response?.data?.message
      : "Gagal memuat data Invoice.";
    toast.error(msg);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const handleClearSo = () => {
  showConfirmation(
    'Hapus SO?',
    'Menghapus SO akan mengosongkan semua item di keranjang. Lanjutkan?',
    async () => { // UBAH: Tambahkan async
      // Reset semua data terkait SO
      header.nomorSo = '';
      header.tanggalSo = '';
      header.diskonPersen1 = 0;
      header.diskonPersen2 = 0;
      header.diskonRp = 0;
      header.biayaKirim = 0;
      header.nomorPromo = '';
      header.namaPromo = '';

      // Kosongkan items dan linked DPs
      items.value = [];
      linkedDps.value = [];
      isSoLoaded.value = false;

      // Tambah baris kosong
      addNewRow();

      // [TAMBAHAN] Reset ke default customer
      try {
        const cabang = authStore.user?.cabang;

        if (cabang && cabang !== '-') {
          const response = await api.get(`/invoice-form/lookup/default-customer?cabang=${cabang}`);

          if (response.data) {
            onCustomerSelected(response.data);
            toast.success('SO berhasil dihapus. Customer direset ke default toko.');
          } else {
            onCustomerSelected(null);
            toast.success('SO berhasil dihapus. Silakan pilih customer.');
          }
        } else {
          onCustomerSelected(null);
          toast.success('SO berhasil dihapus. Silakan pilih customer.');
        }
      } catch (error) {
        console.error('Error fetching default customer:', error);
        onCustomerSelected(null);
        toast.success('SO berhasil dihapus. Silakan pilih customer.');
      }
    }
  );
};

const saveHeaderOnly = async () => {
  try {
    const payload = {
      nomor: header.nomor,
      customer: header.customer.kode,
      keterangan: header.keterangan,
      salesCounter: header.salesCounter,
      top: header.top,
      tanggal: header.tanggal,
      biayaKirim: header.biayaKirim,
      diskonPersen1: header.diskonPersen1,
      diskonRp: header.diskonRp,
      ppnPersen: header.ppnPersen,
      memberHp: header.memberHp,
      memberNama: header.memberNama,
      // [BARU] Tambahkan field MP ke payload update header
      isMarketplace: header.isMarketplace,
      mpNama: header.mpNama,
      mpNomorPesanan: header.mpNomorPesanan,
      mpResi: header.mpResi,
      mpBiayaPlatform: header.mpBiayaPlatform
    };

    await api.put(`/invoice-form/update-header/${header.nomor}`, payload);

    toast.success("Header invoice berhasil diperbarui.");
    router.push({ name: 'Invoice', params: { nomor: header.nomor } });
  } catch (error) {
    console.error(error);
    toast.error("Gagal menyimpan header invoice.");
  }
};

const getCategoryColor = (kategori: string | undefined) => {
  const k = (kategori || '').toUpperCase();
  switch (k) {
    case 'SESIONAL':
      return 'orange-darken-2';
    case 'PESANAN':
      return 'blue-darken-2';
    case 'REGULER':
      return 'green-darken-2';
    default:
      return 'grey-lighten-1';
  }
};

// Hitung tanggal tempo otomatis
watch(header, () => {
  if (header.top > 0 && header.tanggal) {
    header.tanggalTempo = format(addDays(new Date(header.tanggal), header.top), 'yyyy-MM-dd');
  }
}, { deep: true });

// Recalculate saat item berubah (harga, diskon, qty, promo, dsb)
watch(
  items,
  async (newItems) => {
    // Recalculate total hanya untuk item yang BUKAN promo
    newItems.forEach(item => {
      if (!item.terhitungPromo) {
        item.total = computeLineTotal(item);
      }
    });

    await nextTick();
    calculateTotals();

    // Terapkan aturan diskon customer hanya jika bukan promo
    if (!header.nomorPromo || header.nomorPromo.startsWith("PRO-")) {
      applyDefaultDiscount();
      calculateTotals();
    }

    checkRealtimePromoEligibility();
  },
  { deep: true }
);

// Jika ada DP tambahan dihubungkan
watch(linkedDps, calculateTotals, { deep: true });

const grandQty = computed(() =>
  items.value.reduce((sum, it) => sum + (Number(it.jumlah) || 0), 0)
);

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [header, items, linkedDps],
  () => {
    // Abaikan jika sedang loading awal (misal saat edit load data)
    if (isLoading.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Customer dipilih
    const hasHeader = (header.customer.kode !== '');

    // 2. Items: Ada item valid (kode terisi)
    const hasItems = items.value.some(i => i.kode);

    // 3. DP: Ada DP terhubung
    const hasDp = linkedDps.value.length > 0;

    if (hasHeader || hasItems || hasDp) {
      uiStore.setUnsavedChanges(true);
    } else {
      // Jika kembali kosong bersih
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

onMounted(() => {
  if (authStore.user?.cabang === 'KON') {
    header.isMarketplace = true;
  }

  markAsSaved();

  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data Invoice.`);
    router.push({ name: 'Invoice' }); // Arahkan kembali ke halaman browse
    return;
  }

  fetchSalesCounters();
  const nomor = route.params.nomor as string;
  if (isEditMode.value && nomor) {
    loadDataForEdit(nomor);
  } else {
    resetForm(); // Panggil resetForm untuk mode baru
  }
  isLoading.value = false;
  fetchActivePromos();
});

// Watcher untuk Toggle Marketplace
watch(() => header.isMarketplace, async (isOnline) => {
  if (isOnline) {
    // Logic jika mode online aktif (misal otomatis set customer Shopee)
  } else {
    // Jika dimatikan, mungkin reset customer atau biarkan user memilih
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-receipt-text-edit">
    <v-alert v-if="isLockedFsk" type="warning" class="mb-3">
      Invoice ini sudah masuk Form Setoran Kasir (FSK). Perubahan tidak diperbolehkan.
    </v-alert>
    <template #header-actions>
      <v-btn v-if="isEditMode" color="primary" size="small" prepend-icon="mdi-content-save" :disabled="isLockedFsk"
        @click="saveHeaderOnly">
        Simpan Header
      </v-btn>
      <v-btn v-if="!isEditMode" size="small" prepend-icon="mdi-cancel"
        @click="showConfirmation('Batalkan Isian', 'Batalkan dan kosongkan semua isian?', resetForm)">
        Batal
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click=handleClose>
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="mb-2 align-center" v-if="isUserKon">
            <v-col cols="12">
              <v-sheet class="d-flex align-center px-3 py-1 rounded bg-orange-lighten-5 border border-orange-lighten-2"
                elevation="0">
                <v-switch v-model="header.isMarketplace" color="orange-darken-3" density="compact" hide-details inset
                  class="font-weight-bold mr-2">
                  <template #label>
                    <span class="text-orange-darken-4 font-weight-medium">Mode Transaksi Online / Marketplace</span>
                  </template>
                </v-switch>
                <v-icon v-if="header.isMarketplace" color="orange-darken-3" class="ml-auto">mdi-store-check</v-icon>
              </v-sheet>
            </v-col>
          </v-row>

          <v-expand-transition>
            <div v-if="header.isMarketplace" class="mb-3">
              <v-sheet class="pa-3 rounded bg-white border border-dashed border-orange-lighten-2 elevation-0">
                <v-row dense>
                  <v-col cols="12" md="4">
                    <v-combobox label="Marketplace" v-model="header.mpNama" :items="marketplaceList"
                      prepend-inner-icon="mdi-store" variant="outlined" density="compact" bg-color="grey-lighten-5"
                      hide-details placeholder="Pilih Marketplace" :readonly="isReadonly"
                      class="required-field marketplace-combo"></v-combobox>
                  </v-col>

                  <v-col cols="12" md="4">
                    <v-text-field label="No. Pesanan / Order ID" v-model="header.mpNomorPesanan"
                      prepend-inner-icon="mdi-clipboard-text-outline" variant="outlined" density="compact"
                      bg-color="grey-lighten-5" hide-details placeholder="Contoh: 230801ABC..."
                      :readonly="isReadonly"></v-text-field>
                  </v-col>

                  <v-col cols="12" md="4">
                    <v-text-field label="No. Resi (AWB)" v-model="header.mpResi" prepend-inner-icon="mdi-barcode-scan"
                      variant="outlined" density="compact" bg-color="grey-lighten-5" hide-details
                      placeholder="Scan atau Ketik Resi" :readonly="isReadonly"></v-text-field>
                  </v-col>
                </v-row>
              </v-sheet>
            </div>
          </v-expand-transition>
          <v-row dense>
            <v-col cols="6">
              <v-text-field label="No. Invoice" v-model="header.nomor" readonly density="compact" filled hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="filled" density="compact"
                hide-details :readonly="isReadonly" />
            </v-col>
            <v-col cols="4">
              <v-text-field label="Kode Cabang" :model-value="header.gudang.kode" density="compact" filled hide-details
                :readonly="isReadonly" />
            </v-col>
            <v-col cols="8">
              <v-text-field label="Nama Cabang" :model-value="header.gudang.nama" density="compact" filled hide-details
                :readonly="isReadonly" />
            </v-col>
            <v-col cols="6">
              <v-text-field label="No. Pesanan (SO)" v-model="header.nomorSo" :readonly="isReadonly"
                :prepend-inner-icon="isReadonly ? '' : 'mdi-magnify'" density="compact" hide-details clearable
                :clear-icon="isReadonly ? '' : 'mdi-close'" @click="!isReadonly && (dialogs.soSearch = true)"
                @click:clear.prevent="!isReadonly && handleClearSo()" />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Tgl. SO"
                :model-value="header.tanggalSo ? format(parseISO(header.tanggalSo), 'dd-MM-yy') : ''"
                :readonly="isReadonly" filled density="compact" hide-details />
            </v-col>
            <v-col cols="4">
              <v-text-field label=" Kode Customer" :model-value="header.customer.kode" density="compact"
                :readonly="isSoLoaded" @click="(!isReadonly && !isSoLoaded) && (dialogs.customerSearch = true)"
                prepend-inner-icon="mdi-magnify" hide-details />
            </v-col>
            <v-col cols="8">
              <v-text-field label="Nama Customer" :model-value="header.customer.nama" :readonly="isReadonly"
                density="compact" hide-details>
                <template #append-inner>
                  <v-btn icon="mdi-account-plus" size="x-small" variant="tonal" :disabled="isReadonly"
                    @click.stop="!isReadonly && (dialogs.customerForm = true)" title="Buat Customer Baru">
                  </v-btn>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field label="Alamat" v-model="header.customer.alamat" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Kota" v-model="header.customer.kota" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Telepon" v-model="header.customer.telp" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Level" v-model="header.customer.level" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="2">
              <v-text-field label="TOP" v-model.number="header.top" type="number" min="0" density="compact"
                variant="outlined" hide-details :readonly="isReadonly" />
            </v-col>
            <v-col cols="4">
              <v-text-field label="Tgl. Jatuh Tempo" v-model="header.tanggalTempo" type="date" density="compact"
                readonly filled hide-details />
            </v-col>
            <v-col cols="12">
              <v-select label="Sales Counter" v-model="header.salesCounter" :items="salesCounters" variant="outlined"
                density="compact" hide-details :readonly="isReadonly" />
            </v-col>
            <v-col cols="4">
              <v-text-field label="Promo" v-model="header.nomorPromo"
                @click="!isReadonly && (dialogs.promoSearch = true)" prepend-inner-icon="mdi-magnify" density="compact"
                hide-details placeholder="F1 atau klik..." :readonly="isReadonly" />
            </v-col>
            <v-col cols="8">
              <v-text-field label="Nama Promo" v-model="header.namaPromo" density="compact" :readonly="isReadonly"
                filled hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Keterangan" v-model="header.keterangan" density="compact" variant="outlined"
                hide-details :readonly="isReadonly" />
            </v-col>
          </v-row>
          <v-input label="Info Member" :append-inner-icon="isReadonly ? '' : 'mdi-pencil'" hide-details
            class="custom-input-button" :class="{ 'disabled-input': isReadonly }"
            @click="!isReadonly && (dialogs.memberForm = true)">
            <div v-if="header.memberHp || header.memberNama" class="input-content">
              <strong>{{ header.memberHp }}</strong> - {{ header.memberNama }}
            </div>
            <div v-else class="input-placeholder">
              Klik untuk tambah/ubah member...
            </div>
          </v-input>
        </div>

      </div>

      <div class="right-column">
        <div class="top-right-header">
          <div v-if="!header.nomorSo" class="scanner-wrapper">
            <v-text-field ref="barcodeInputRef" v-model="scannedBarcode" label="Scan Barcode di Sini..."
              placeholder="Siap scan..." variant="outlined" density="compact" prepend-inner-icon="mdi-barcode-scan"
              hide-details clearable :loading="isScanning" :disabled="isScanning"
              @keydown.enter.prevent="handleBarcodeScan" autofocus />
          </div>

          <div class="logo-container">
            <v-img :src="dynamicLogo" max-width="60" contain />
          </div>
        </div>

        <div class="scrollable-table-wrapper">
          <div class="desktop-form-section table-section">
            <v-data-table :headers="tableHeaders" :items="items" class="desktop-table header-browse-blue"
              :items-per-page="-1" fixed-header height="calc(100vh - 420px)">
              <template v-slot:[`item.kode`]="{ item, index }">
                <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                  placeholder="F1/F2..." :readonly="isReadonly || !!header.nomorSo || !!item.noSoDtf"
                  :class="{ 'field-disabled': !!header.nomorSo || !!item.noSoDtf }"
                  @keydown.f1.prevent="!header.nomorSo && !item.noSoDtf && openProductSearch(index, false)"
                  @keydown.f2.prevent="!header.nomorSo && !item.noSoDtf && openProductSearch(index, true)" />
              </template>

              <template #[`item.kategori`]="{ item }">
                <div v-if="!item.isCustomOrder && item.kode">
                  <v-chip size="x-small" :color="getCategoryColor(item.kategori)" variant="flat"
                    class="font-weight-bold text-white">
                    {{ item.kategori || 'REG' }}
                  </v-chip>
                </div>
              </template>

              <template v-slot:[`item.jumlah`]="{ item }">
                <v-text-field v-model.number="item.jumlah" :readonly="isReadonly" type="number" min="0"
                  variant="underlined" density="compact" hide-details class="text-right" :class="getQtyClass(item)"
                  @blur="handleJumlahChange(item)" />
              </template>

              <template v-slot:[`item.harga`]="{ item }">
                <v-text-field :model-value="focusedRowId === item.id
                  ? item.harga
                  : formatRupiah(item.harga || 0)"
                  @update:model-value="item.harga = Number(String($event).replace(/[^0-9]/g, '')) || 0"
                  @focus="focusedRowId = item.id" @blur="focusedRowId = -1" type="text" min="0" variant="underlined"
                  density="compact" hide-details class="text-right" :readonly="isReadonly || !isHargaEditable(item)"
                  placeholder="0"></v-text-field>
              </template>

              <template v-slot:[`item.diskonPersen`]="{ item }">
                <v-text-field v-model.number="item.diskonPersen" :readonly="isReadonly" type="number" min="0"
                  variant="underlined" density="compact" hide-details class="text-right"
                  @blur="handleItemDiscountChange(item)" @focus="onItemDiscountFocus(item)" />
              </template>

              <template v-slot:[`item.diskonRp`]="{ item }">
                <v-text-field v-model.number="item.diskonRp" type="number" min="0" variant="underlined"
                  density="compact" hide-details class="text-right" :readonly="isReadonly"
                  @blur="handleItemDiscountChange(item)" @focus="onItemDiscountFocus(item)" />
              </template>

              <template v-slot:[`item.total`]="{ item }">
                <div class="text-end text-body-2 font-weight-bold pt-3 pb-1">
                  {{ formatRupiah(item.total) }}
                </div>
              </template>

              <template v-slot:[`item.noSoDtf`]="{ item }">
                <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details
                  :readonly="!!header.nomorSo || !!item.kode"
                  :class="{ 'field-disabled': !!header.nomorSo || !!item.kode }" filled />
              </template>

              <template v-slot:[`item.actions`]="{ item }">
                <v-btn v-if="item.kode" icon="mdi-delete" :disabled="isReadonly" variant="text" color="error"
                  size="x-small" @click="handleDeleteItem(item)"
                  :title="item.noSoDtf ? 'Hapus Semua Item SO DTF Ini' : 'Hapus Item Ini'">
                </v-btn>
              </template>
            </v-data-table>
          </div>
        </div>
        <div class="table-summary-footer">
          <div class="summary-row">
            <div class="label">Grand Qty</div>
            <div class="value">{{ grandQty }}</div>

            <div class="label">Grand Total</div>
            <div class="value">Rp {{ formatRupiah(totals.grandTotal) }}</div>
          </div>
        </div>

        <div class="footer-actions-section">
          <v-slide-y-transition>
            <div v-if="promoNotification" class="promo-card-wrapper mb-4">
              <div class="promo-card" :class="{ 'grand-opening-style': isGrandOpeningPromo }">

                <div class="card-texture"></div>
                <div class="card-shine"></div>

                <div class="card-content">
                  <div class="icon-container">
                    <div class="icon-circle pulse-animation">
                      <v-icon :icon="isGrandOpeningPromo ? 'mdi-party-popper' : 'mdi-ticket-percent-outline'" size="24"
                        color="white" />
                    </div>
                  </div>

                  <div class="text-container">
                    <div class="promo-label">
                      <v-icon icon="mdi-star-four-points" size="10" class="mr-1" color="yellow-lighten-3" />
                      {{ isGrandOpeningPromo ? 'SPECIAL OFFER' : 'YAYY!! DAPET DISKON!!!' }}
                    </div>
                    <div class="promo-message">{{ promoNotification }}</div>
                  </div>

                  <div class="action-container">
                    <div class="status-chip">
                      <span class="pulse-dot"></span>
                      Auto-Applied
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </v-slide-y-transition>
          <v-row align="center">
            <v-col cols="auto" class="d-flex ga-2">
              <v-btn size="small" prepend-icon="mdi-cash-multiple" @click="dialogs.linkedDp = true"
                :disabled="isReadonly || !header.customer.kode">
                Lihat DP
              </v-btn>
              <v-btn size="small" prepend-icon="mdi-sale" @click="dialogs.diskonForm = true" :disabled="isReadonly">
                Input Diskon/Biaya
              </v-btn>
            </v-col>

            <v-spacer></v-spacer>

            <v-col cols="auto">
              <v-btn color="primary" size="large" prepend-icon="mdi-credit-card-check" @click="handleProceedToPayment"
                :disabled="isReadonly || !authStore.can(MENU_ID, requiredPermission)">
                Lanjutkan ke Pembayaran
              </v-btn>
            </v-col>
          </v-row>
        </div>
      </div>
    </div>

    <CustomerSearchModal v-if="dialogs.customerSearch" :gudang="header.gudang.kode"
      @close="dialogs.customerSearch = false" @customer-selected="onCustomerSelected" />
    <CustomerForm v-if="dialogs.customerForm" @close="dialogs.customerForm = false"
      @customer-saved="onNewCustomerSaved" />
    <SoSearchModalForInvoice v-if="dialogs.soSearch" :cabang="header.gudang.kode" @close="dialogs.soSearch = false"
      @so-selected="onSoSelected" mode="invoice" />
    <ProductSearchModal v-if="dialogs.productSearch" :gudang="header.gudang.kode" category="ALL"
      :multi="isMultiSelectProduct" source="invoice-cash" :promo-nomor="header.nomorPromo"
      @close="dialogs.productSearch = false" @products-selected="onProductsSelected" />
    <UnpaidDpSearchModal v-if="dialogs.unpaidDpSearch" :customer-kode="header.customer.kode"
      @close="dialogs.unpaidDpSearch = false" @selected="onUnpaidDpSelected" />
    <PaymentModal v-if="dialogs.payment" :invoice-header="header" :invoice-items="items" :totals="totals"
      :auth-pins="authPins" :linked-dps="linkedDps" @close="dialogs.payment = false" @save-success="onSaveSuccess" />
    <PromoSearchModal v-if="dialogs.promoSearch" :tanggal="header.tanggal" @close="dialogs.promoSearch = false"
      @selected="onPromoSelected" />
    <MemberForm v-if="dialogs.memberForm" :initial-hp="memberHpToSearch" @close="dialogs.memberForm = false"
      @member-saved="onMemberSaved" />
    <DiskonForm v-if="dialogs.diskonForm" :sub-total="totals.subTotal" :diskon-persen1="header.diskonPersen1"
      :diskon-persen2="header.diskonPersen2" :diskon-rp="header.diskonRp" :biaya-kirim="header.biayaKirim"
      :biaya-platform="header.mpBiayaPlatform" :is-marketplace="header.isMarketplace"
      @close="dialogs.diskonForm = false" @save="onDiskonSaved" />
    <LinkedDpModal v-if="dialogs.linkedDp" :dps="linkedDps" @close="dialogs.linkedDp = false" />
    <AuthorizationModal v-if="authDialog.show" :title="authDialog.title" :jenis="authDialog.jenis"
      :nominal="authDialog.nominal" :transaksi="authDialog.transaksi" :barcode="authDialog.barcode"
      :keterangan="authDialog.keterangan" @success="authDialog.onSuccess"
      @close="() => { authDialog.show = false; authDialog.onCancel(); }" />
    <!-- <SoDtfSearchModal v-if="dialogs.soDtfSearch" :customer-kode="header.customer.kode" :cabang="header.gudang.kode"
      @close="dialogs.soDtfSearch = false" @selected="onSoDtfSelected" /> -->
    <PromoBonusModal v-if="dialogs.promoBonus" :promo-nomor="activePromoForBonus.nomor"
      @close="dialogs.promoBonus = false" @selected="handleBonusSelection" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.totals-summary {
  background-color: rgb(var(--v-theme-surface));
  border-radius: 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.custom-input-button {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.38);
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  height: 40px;

  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));

  display: flex;
  align-items: center;
}

.custom-input-button:hover {
  border-color: rgb(var(--v-theme-primary));
}

.input-content {
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
}

.input-placeholder {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

:deep(.qty-error input) {
  color: red !important;
  font-weight: bold;
}

.desktop-table :deep(.nama-barang-cell) {
  white-space: nowrap;
  /* tetap satu baris */
  min-width: 300px;
  /* minimum width untuk kolom nama */
  line-height: 1.4;
}

.desktop-table .v-data-table__td {
  white-space: normal !important;
  word-wrap: break-word !important;
}

.desktop-table td:nth-child(2) {
  /* kolom Nama Barang */
  max-width: 400px;
  /* boleh disesuaikan */
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
  height: 100%;
  /* Tambahkan ini */
}

.top-right-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: nowrap;
  flex-shrink: 0;
  /* Penting: jangan menyusut */
}

.scanner-wrapper {
  flex: 1 1 auto;
  min-width: 0;
}

.logo-container {
  width: 60px;
  flex-shrink: 0;
}

.scrollable-table-wrapper {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.table-section {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  /* Biarkan v-data-table yang handle scroll */
  display: flex;
  flex-direction: column;
}

.table-section .v-data-table {
  width: 100%;
  flex-grow: 1;
}

.desktop-table :deep(.v-table__wrapper) {
  overflow-x: auto !important;
  /* Horizontal scroll */
  overflow-y: auto !important;
  /* Vertical scroll */
  max-height: 100%;
}

/* Pastikan tabel bisa lebih lebar dari container */
.desktop-table :deep(.v-table) {
  min-width: max-content;
}

.footer-actions-section {
  flex-shrink: 0;
  /* Penting: jangan menyusut */
  padding: 8px 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.footer-actions-section .v-row {
  margin: 0 !important;
}

.table-summary-footer {
  /* Surface + gradient theme-aware */
  background: linear-gradient(135deg,
      rgba(var(--v-theme-surface), 0.98) 0%,
      rgba(var(--v-theme-primary), 0.06) 100%);

  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 12px 18px;
  font-size: 13px;
  flex-shrink: 0;

  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);

  box-shadow: 0 -3px 8px rgba(0, 0, 0, 0.25);
}

.summary-row {
  display: flex;
  justify-content: flex-end;
  gap: 40px;
  align-items: center;
  font-weight: 600;
}

/* Label (chip-like) */
.summary-row .label {
  color: rgba(var(--v-theme-on-surface), 0.75);
  background-color: rgba(var(--v-theme-primary), 0.12);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
}

/* Value (angka penting) */
.summary-row .value {
  min-width: 80px;
  text-align: right;
  color: rgb(var(--v-theme-on-surface));
  font-size: 14px;
  font-weight: 700;
}

/* Mewarnai Header Tabel */
.desktop-table :deep(thead tr th) {
  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important;
  /* Supaya lebih rapi */
}

.disabled-input {
  opacity: 0.5;
  pointer-events: none;
}

/* --- Premium Promo Card Styles --- */

.promo-card-wrapper {
  padding: 0 12px;
  perspective: 1000px;
}

.promo-card {
  position: relative;
  border-radius: 16px;
  overflow: hidden;

  /* --- OPSI WARNA GRADASI (Pilih salah satu) --- */

  /* Opsi 1: Royal Mystic (Biru Tua ke Ungu) - KESAN MEWAH & PROFESIONAL */
  background: linear-gradient(135deg, #1A2980 0%, #26D0CE 100%);

  /* Opsi 2: Sunset Vibes (Orange ke Pink) - KESAN HOT PROMO */
  /* background: linear-gradient(135deg, #FF512F 0%, #DD2476 100%); */

  /* Opsi 3: Lush Green (Hijau ke Teal) - KESAN HEMAT/CUAN */
  /* background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); */

  /* Shadow berwarna sesuai tema */
  box-shadow: 0 10px 25px -5px rgba(38, 208, 206, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: all 0.3s ease;
}

/* Style Khusus Grand Opening (Emas ke Merah Maroon - Kesan Meriah) */
.promo-card.grand-opening-style {
  background: linear-gradient(135deg, #FF512F 0%, #DD2476 100%) !important;
  box-shadow: 0 10px 25px -5px rgba(221, 36, 118, 0.5) !important;
  border: 1px solid rgba(255, 215, 0, 0.3) !important;
  /* Border agak keemasan */
}

.grand-opening-style .promo-label {
  color: #FFD700 !important;
  /* Teks label jadi emas */
}

/* Texture Pattern (Titik-titik background) */
.card-texture {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px);
  background-size: 12px 12px;
  /* Jarak antar titik */
  opacity: 0.6;
  z-index: 1;
}

.card-content {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: 16px 24px;
  gap: 16px;
  color: white;
}

/* --- ICON Styles --- */
.icon-container {
  flex-shrink: 0;
}

.icon-circle {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.pulse-animation {
  animation: softPulse 2s infinite;
}

/* --- TEXT Styles --- */
.text-container {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.promo-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
}

.promo-message {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: #ffffff;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* --- ACTION / BADGE Styles --- */
.action-container {
  flex-shrink: 0;
}

.status-chip {
  background: rgba(0, 0, 0, 0.2);
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background-color: #00E676;
  /* Hijau terang */
  border-radius: 50%;
  box-shadow: 0 0 8px #00E676;
  animation: blink 1.5s infinite;
}

/* --- ANIMATIONS --- */

/* Efek Kilau Lewat */
.card-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(to right,
      transparent 0%,
      rgba(255, 255, 255, 0.2) 50%,
      transparent 100%);
  transform: skewX(-25deg);
  z-index: 2;
  animation: shineMove 4s infinite ease-in-out;
  pointer-events: none;
}

/* [NEW] Style untuk mengecilkan font dropdown marketplace */
.marketplace-combo :deep(input) {
  font-size: 13px !important;
}

.marketplace-combo :deep(.v-field__input) {
  font-size: 13px !important;
  min-height: 32px !important;
  /* Adjust height if needed */
}

.marketplace-combo :deep(.v-label) {
  font-size: 13px !important;
}

/* Style untuk list item dropdown (saat dibuka) */
:deep(.v-list-item-title) {
  font-size: 13px !important;
}

@keyframes shineMove {
  0% {
    left: -100%;
    opacity: 0;
  }

  20% {
    opacity: 1;
  }

  50% {
    left: 200%;
    opacity: 0;
  }

  100% {
    left: 200%;
    opacity: 0;
  }
}

@keyframes softPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
    transform: scale(1);
  }

  70% {
    box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
    transform: scale(1.05);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
    transform: scale(1);
  }
}

@keyframes blink {

  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}
</style>

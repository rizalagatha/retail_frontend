<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
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
import SoDtfSearchModal from '@/components/lookup/SoDtfSearchModal.vue';
import PromoBonusModal from '@/components/modal/PromoBonusModal.vue';
import type { AxiosError } from 'axios';
import axios from 'axios';
import LogoKaosan from '@/assets/logo.png';
import LogoRezso from '@/assets/rezso.jpg';

// --- Tipe Data ---
interface Item {
  id: number;
  kode?: string;
  nama?: string;
  ukuran?: string;
  stok?: number;
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
  _isHargaEditable: boolean;
  promo?: string;
  originalDiskonRp?: number;
  originalDiskonPersen?: number;
  subtotal?: number;
  lastPin?: string;
}
interface LinkedDp {
  nomor: string;
  jenis: string;
  nominal: number;
}
interface DiskonFormData {
  diskonPersen1: number;
  diskonPersen2: number;
  diskonRp: number;
  biayaKirim: number;
}
interface AuthDialog {
  isFakturVisible: boolean;
  isItemVisible: boolean;
  title: string;
  challengeCode: string;
  onSuccess: (pin: string) => void;
  onCancel: () => void;
  show: boolean;
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
  harga: number;
  barcode: string;
}
interface DownPayment {
  nomor: string;
  jenis: string;
  nominal: number;
}
interface SoDtf {
  nomor: string;
  // tambahkan properti lain jika ada
}
interface SoDtfItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
}
interface ApiInvoiceItem {
  invd_kode: string;
  nama_barang: string;
  invd_ukuran: string;
  invd_jumlah: number;
  invd_harga: number;
  invd_diskon: number;
  // field tambahan jika ada
  [key: string]: unknown;
}

interface InvoiceItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  diskonRp: number;
  // field lain dari item jika perlu
  [key: string]: unknown;
}

interface ActivePromo {
  pro_nomor: string;
  pro_judul: string;
  pro_totalrp: number; // Minimal belanja
  pro_disrp: number; // Diskon Rp
  pro_diskon: number; // <-- TAMBAHKAN INI (untuk diskon 10%)
  pro_lipat: 'Y' | 'N';
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
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

const isLoading = ref(true);

const initialHeaderState = {
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  gudang: { kode: authStore.user?.cabang || '', nama: authStore.user?.cabangNama || '' },
  customer: { kode: '', nama: '', alamat: '', kota: '', telp: '', level: '' },
  nomorSo: '',
  tanggalSo: '',
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
};

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
  soDtfSearch: false,
  promoBonus: false
});

const authDialog = reactive<AuthDialog>({
  isFakturVisible: false,
  isItemVisible: false,
  title: '',
  challengeCode: '',
  onSuccess: () => { }, // 👈 sekarang valid
  onCancel: () => { },
  show: false,
});
const authModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);

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

// --- Konfigurasi Tabel ---
const tableHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '120px' },
  { title: 'Nama Barang', key: 'nama', minWidth: '250px' }, // ubah ke minWidth
  { title: 'Ukuran', key: 'ukuran', width: '50px' },
  { title: 'Stok', key: 'stok', align: 'end', width: '60px' },
  { title: 'Qty SO', key: 'qtyso', align: 'end', width: '60px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '70px' },
  { title: 'Harga', key: 'harga', align: 'end', width: '80px' },
  { title: 'Disc %', key: 'diskonPersen', align: 'end', width: '70px' },
  { title: 'Diskon Rp', key: 'diskonRp', align: 'end', width: '80px' },
  { title: 'Total', key: 'total', align: 'end', width: '90px' },
  { title: 'Barcode', key: 'barcode', width: '90px' },
  { title: 'No. SO DTF', key: 'noSoDtf', width: '120px' },
  { title: 'Kategori', key: 'kategori', width: '90px' },
  { title: 'Promo', key: 'terhitungPromo', align: 'center', width: '70px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
] as const;
// const linkedDpsHeaders = [
//     { title: 'Nomor Setoran', key: 'nomor' },
//     { title: 'Jenis', key: 'jenis' },
//     { title: 'Nominal', key: 'nominal', align: 'end' },
//     { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
// ];

const formatRupiah = (value: number) => {
  return new Intl.NumberFormat('id-ID').format(value || 0);
};

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
    };
    items.value.push(newItem);
  }
};

const onDiskonSaved = (data: DiskonFormData) => {
  if (data.diskonPersen1 !== header.diskonPersen1 ||
    data.diskonPersen2 !== header.diskonPersen2 ||
    data.diskonRp !== header.diskonRp) {

    originalDiscount.faktur = {
      persen1: header.diskonPersen1,
      persen2: header.diskonPersen2,
      rp: header.diskonRp,
      biayaKirim: header.biayaKirim,
    };

    requestAuthorization(
      'Otorisasi Diskon Faktur',
      (pin: string) => { // onSuccess
        if (data.diskonPersen1 !== header.diskonPersen1) authPins.pinDiskon1 = pin;
        if (data.diskonPersen2 !== header.diskonPersen2) authPins.pinDiskon2 = pin;
        header.diskonPersen1 = data.diskonPersen1;
        header.diskonPersen2 = data.diskonPersen2;
        header.diskonRp = data.diskonRp;
      },
      () => { // onCancel
        header.diskonPersen1 = originalDiscount.faktur.persen1;
        header.diskonPersen2 = originalDiscount.faktur.persen2;
        header.diskonRp = originalDiscount.faktur.rp;
      }
    );
  }

  header.biayaKirim = data.biayaKirim;
};

const handleItemDiscountChange = (item: Item) => {
  // Simpan nilai asli item sebelum diubah
  // Kita perlu menunggu 'tick' berikutnya agar v-model selesai update
  nextTick(() => {
    const originalRp = item.originalDiskonRp || 0;
    const originalPersen = item.originalDiskonPersen || 0;
    const currentRp = item.diskonRp || 0;
    const currentPersen = item.diskonPersen || 0;

    // Hanya panggil otorisasi jika nilainya benar-benar berubah
    if (currentRp !== originalRp || currentPersen !== originalPersen) {
      requestAuthorization(
        `Otorisasi Diskon: ${item.nama}`,
        (pin) => { // onSuccess
          if (activeItemForAuth.value) {
            activeItemForAuth.value.originalDiskonRp = activeItemForAuth.value.diskonRp;
            activeItemForAuth.value.originalDiskonPersen = activeItemForAuth.value.diskonPersen;
            activeItemForAuth.value.lastPin = pin; // contoh: simpan pin
          }
          toast.success('Otorisasi diskon item berhasil.');
        },
        () => {
          if (activeItemForAuth.value) {
            activeItemForAuth.value.diskonRp = originalDiscount.item.rp;
            activeItemForAuth.value.diskonPersen = originalDiscount.item.persen;
          }
        }
      );
    }
  });
};

const onItemDiscountFocus = (item: Item) => {
  activeItemForAuth.value = item;
  originalDiscount.item = { persen: item.diskonPersen || 0, rp: item.diskonRp || 0 };
};

const requestAuthorization = (title: string, onConfirm: (pin: string) => void, onCancel: () => void) => {
  authDialog.challengeCode = Math.floor(100 + Math.random() * 900).toString();
  authDialog.title = title;
  authDialog.onSuccess = onConfirm;
  authDialog.onCancel = onCancel;
  authDialog.show = true;
};

const handleAuthSuccess = async (pin: string) => {
  try {
    await api.post('/otorisasi/validate-pin', { pin, challengeCode: authDialog.challengeCode });
    toast.success('Otorisasi berhasil.');
    authDialog.onSuccess(pin);
    authDialog.show = false;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    authModalRef.value?.setFailed(err.response?.data?.message || 'PIN tidak valid');
  }
};

const handleAuthCancel = () => {
  authDialog.onCancel();
  authDialog.show = false;
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
  showConfirmation(
    'Tutup Form',
    'Data yang belum disimpan akan hilang. Yakin ingin menutup form?',
    () => router.back()
  );
};

const openProductSearch = (index: number, isMulti: boolean) => {
  if (!header.customer.kode) return toast.error('Pilih customer terlebih dahulu.');
  if (header.nomorSo) return toast.info('Tidak bisa menambah item manual jika sudah terhubung ke SO.');

  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  dialogs.productSearch = true;
};

const openSoDtfSearch = (item: Item, index: number) => {
  // Cek semua kondisi di sini
  if (header.nomorSo || item.kode) {
    return; // Hentikan aksi jika sudah readonly
  }
  if (!header.customer.kode) {
    return toast.error("Pilih customer terlebih dahulu.");
  }

  // Jika semua kondisi terpenuhi, buka modal
  activeRowIndex.value = index;
  dialogs.soDtfSearch = true;
};

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
  dialogs.customerSearch = false;
};

const applyDefaultDiscount = () => {
  const rule = customerDiscountRule.value;
  if (!rule || header.nomorSo) { // Jangan terapkan jika dari SO
    return;
  }

  // Logika dari Delphi: cek nominal belanja
  if (totals.nettoSetelahDiskon >= rule.nominal1) {
    header.diskonPersen1 = rule.diskon1;
  } else if (totals.nettoSetelahDiskon >= rule.nominal2) {
    header.diskonPersen1 = rule.diskon2;
  } else {
    header.diskonPersen1 = 0;
  }
};

const onNewCustomerSaved = (customer: Customer) => {
  header.customer = {
    kode: customer.kode,
    nama: customer.nama,
    alamat: customer.alamat,
    kota: customer.kota,
    telp: customer.telp,
    level: customer.level ?? '',
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

    // Assign header data
    Object.assign(header, soHeader);
    if (soHeader.tanggal) {
      const date = new Date(soHeader.tanggal);
      header.tanggalSo = date.toISOString().split('T')[0]; // Ambil bagian tanggal saja
    } else {
      header.tanggalSo = '';
    }

    if (soHeader.tanggalTempo) {
      const date = new Date(soHeader.tanggalTempo);
      header.tanggalTempo = date.toISOString().split('T')[0]; // Ambil bagian tanggal saja
    } else {
      header.tanggalTempo = '';
    }

    memberHpToSearch.value = soHeader.customer.telp || '';
    header.memberHp = soHeader.customer.telp || '';

    // Map items dengan memastikan semua field yang diperlukan ada
    items.value = soItems.map((item: Partial<Item>, index: number): Item => ({
      id: Date.now() + index,
      kode: item.kode ?? "",
      nama: item.nama ?? "",
      ukuran: item.ukuran ?? "",
      stok: item.stok ?? 0,
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
    }));

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
  // Sesuai permintaan Anda, harga 100rb / 3 = 33333
  const promoPrice = 33333;

  const newItems: Item[] = selectedProducts.map(product => ({
    id: Date.now() + Math.random(),
    kode: product.kode,
    nama: product.nama,
    ukuran: product.ukuran,
    stok: product.stok,
    harga: isPromoActive ? promoPrice : product.harga,
    jumlah: 1,
    diskonPersen: 0,
    diskonRp: 0,
    total: isPromoActive ? promoPrice : product.harga,
    barcode: product.barcode,
    qtyso: 0,
    noSoDtf: '',
    kategori: '',
    terhitungPromo: isPromoActive,
    _isHargaEditable: !isPromoActive,
    hpp: 0
  }));

  if (items.value[activeRowIndex.value] && !items.value[activeRowIndex.value].kode) {
    items.value.splice(activeRowIndex.value, 1, ...newItems);
  } else {
    items.value.push(...newItems);
  }
  addNewRow();
};

const onUnpaidDpSelected = (dp: DownPayment) => {
  dialogs.unpaidDpSearch = false;

  if (!linkedDps.value.some(d => d.nomor === dp.nomor)) {
    linkedDps.value.push(dp);
  } else {
    toast.warning('DP tersebut sudah ditambahkan.');
  }
};

const onSoDtfSelected = async (soDtf: SoDtf) => {
  dialogs.soDtfSearch = false;
  if (!soDtf.nomor) return;

  try {
    const response = await api.get<SoDtfItem[]>(`/invoice-form/lookup/so-dtf-details/${soDtf.nomor}`);
    const soDtfItems = response.data;

    if (soDtfItems.length === 0) {
      return toast.warning('SO DTF ini tidak memiliki detail item.');
    }

    const newItems = soDtfItems.map(item => ({
      id: Date.now() + Math.random(),
      kode: item.kode,
      nama: item.nama,
      ukuran: item.ukuran,
      jumlah: item.jumlah,
      harga: item.harga,
      stok: 0,
      qtyso: 0,
      diskonPersen: 0,
      diskonRp: 0,
      total: item.jumlah * item.harga,
      noSoDtf: item.kode,
      terhitungPromo: false,
      _isHargaEditable: true,
    }));

    items.value.splice(activeRowIndex.value, 1, ...newItems);
    addNewRow();
  } catch (error: unknown) {
    // safe handling untuk unknown
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || 'Gagal memuat detail SO DTF.');
    } else {
      toast.error('Gagal memuat detail SO DTF.');
    }
  }
};

const calculateTotals = () => {
  const subTotal = items.value.reduce((sum, item) => sum + (item.jumlah * item.harga), 0);
  const totalDiskonItem = items.value.reduce((sum, item) => sum + (item.jumlah * item.diskonRp), 0);

  const afterItemDiscount = subTotal - totalDiskonItem;

  const diskon1Amount = (header.diskonPersen1 / 100) * afterItemDiscount;
  const afterDiscount1 = afterItemDiscount - diskon1Amount;
  const diskon2Amount = (header.diskonPersen2 / 100) * afterDiscount1;

  const diskonFaktur = header.diskonRp + diskon1Amount + diskon2Amount;

  // (Tambahkan logika diskon persen 2 jika perlu)

  const nettoSetelahDiskon = subTotal - totalDiskonItem - diskonFaktur;
  const totalPpn = nettoSetelahDiskon * (header.ppnPersen / 100);
  const totalDp = linkedDps.value.reduce((sum, dp) => sum + (dp.nominal || 0), 0);

  totals.subTotal = subTotal;
  totals.totalDiskonItem = totalDiskonItem;
  totals.totalDiskonFaktur = diskonFaktur;
  totals.nettoSetelahDiskon = nettoSetelahDiskon;
  totals.totalPpn = totalPpn;
  totals.grandTotal = nettoSetelahDiskon + totalPpn + header.biayaKirim;
  totals.totalDp = totalDp;
  totals.sisaPiutang = totals.grandTotal - totalDp;
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

const handleProceedToPayment = async () => {
  // --- 1. VALIDASI DASAR ---
  const validItems = items.value.filter(i => i.kode);
  if (!header.customer.kode) return toast.error("Customer harus diisi.");
  if (!header.customer.level) return toast.error("Level customer belum di-setting.");
  if (validItems.length === 0) return toast.error("Detail barang harus diisi.");
  for (const item of validItems) {
    if ((item.harga || 0) === 0 && !item.promo) {
      return toast.error(`Harga untuk ${item.nama} harus diisi.`);
    }
  }
  const totalQty = validItems.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  if (totalQty <= 0) return toast.error('Qty Invoice kosong semua.');

  // --- 2. VALIDASI STOK MINUS ---
  const stokOk = await checkStokMinus();
  if (!stokOk) return;

  // --- 3. VALIDASI PROMO SPESIFIK ---
  if (header.nomorPromo === 'PRO-2025-005') { // PROMO BELI 3 HARGA 100RB
    if (totalQty < 3) {
      return toast.error('Qty belanja minimal 3 pcs untuk promo ini.');
    }
  }

  // --- 4. PENGECEKAN PROMO OTOMATIS ---
  try {
    const promoResponse = await api.get('/invoice-form/lookup/active-promos', {
      params: {
        tanggal: header.tanggal,
        cabang: header.gudang.kode
      }
    });

    // Gunakan interface yang baru ditambahkan
    const activePromos = promoResponse.data as ActivePromo[];

    const promo004 = activePromos.find((p: ActivePromo) => p.pro_nomor === 'PRO-2025-004'); // Grand Opening (10%)
    const promo008 = activePromos.find((p: ActivePromo) => p.pro_nomor === 'PRO-2025-008');
    const promo009 = activePromos.find((p: ActivePromo) => p.pro_nomor === 'PRO-2025-009');

    let promoToApply: ActivePromo | null = null;
    let promoDiskon = 0;

    const totalBelanjaPromo = items.value.reduce((sum, item) => {
      if (!item.noSoDtf && !item.noPengajuanHarga) {
        return sum + (item.total || 0);
      }
      return sum;
    }, 0);

    if (promo004 && totalBelanjaPromo >= promo004.pro_totalrp) {
      // Ini adalah promo 10%
      promoDiskon = (promo004.pro_diskon / 100) * totalBelanjaPromo;
      promoToApply = promo004;
    }

    if (!promoToApply && promo008 && totalBelanjaPromo >= promo008.pro_totalrp) {
      // Ini promo diskon Rp tetap (dari Delphi)
      promoDiskon = promo008.pro_disrp * Math.floor(totalBelanjaPromo / promo008.pro_totalrp);
      promoToApply = promo008;
    }

    // Cek Promo 009 (Lainnya)
    if (!promoToApply && promo009 && totalBelanjaPromo >= promo009.pro_totalrp) {
      promoDiskon = promo009.pro_disrp * Math.floor(totalBelanjaPromo / promo009.pro_totalrp);
      promoToApply = promo009;
    }

    // Jika ada promo diskon ditemukan DAN belum ada promo F1 yang dipilih
    if (promoToApply && promoDiskon > 0 && !header.nomorPromo) {
      const promoConfirmed = await new Promise((resolve) => {
         showConfirmation(
          `Dapat ${promoToApply.pro_judul}`,
          `Anda mendapatkan diskon promo ${formatRupiah(promoDiskon)}. Akan pakai promo ini? (Diskon faktur lain akan direset)`,
          () => resolve(true)
        );

        // [PERBAIKAN] Monitor 'Batal'
        // Jika dialog ditutup (show=false) tapi onConfirm belum dijalankan,
        // kita anggap 'Batal' (resolve(false)).
        const unwatch = watch(() => dialogConfirm.show, (newValue) => {
          if (!newValue) { // Jika dialog ditutup
            unwatch();
            if (dialogConfirm.onConfirm) { // Jika 'Ya' ditekan, onConfirm akan di-clear
              // 'Ya' sudah ditekan, resolve(true) sudah dipanggil
            } else {
              resolve(false); // 'Ya' tidak ditekan, user klik Batal/Tutup
            }
          }
        });

        // Ganti onConfirm agar me-resolve dan menghapus dirinya sendiri
        dialogConfirm.onConfirm = () => {
          resolve(true);
          dialogConfirm.onConfirm = () => {}; // Hapus onConfirm
          unwatch();
        };
      });

      if (promoConfirmed) {
        header.diskonPersen1 = 0;
        header.diskonPersen2 = 0;
        header.diskonRp = promoDiskon;
        header.nomorPromo = promoToApply.pro_nomor;
        calculateTotals(); // Hitung ulang
      }
    }

  } catch (error) {
    console.error("Gagal memeriksa promo otomatis:", error);
    toast.error('Gagal memeriksa promo otomatis.');
  }

  // --- 5. CEK PROMO BONUS (TEBUS MURAH) ---
  const promoTebusMurah = header.nomorPromo;
  if (promoTebusMurah === 'PRO-2025-002') {
    activePromoForBonus.value = { nomor: promoTebusMurah, qty: 1 };
    dialogs.promoBonus = true;
    return; // Berhenti di sini, tunggu bonus dipilih
  }

  // --- 6. VALIDASI NO HP & LANJUT KE PEMBAYARAN ---
  const proceedToPayment = () => { dialogs.payment = true; };

  if (!header.memberHp) {
    showConfirmation(
      'Konfirmasi Member',
      'No. HP Member kosong. Yakin akan melanjutkan?',
      proceedToPayment
    );
  } else {
    proceedToPayment();
  }
};

const checkStokMinus = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const validItems = items.value.filter(i => i.kode);
    const itemsMinus = validItems.filter(item =>
      (item.jumlah || 0) > (item.stok || 0) &&
      item.kategori !== 'SO-DTF' && // Asumsi item SO DTF boleh minus (sesuai Delphi)
      !item.noSoDtf // Dobel cek jika item dari SO DTF
      // NOTE: Anda mungkin perlu menambahkan 'item.logstok' jika ada
    );

    if (itemsMinus.length > 0) {
      const itemNames = itemsMinus.map(i => `${i.nama} (${i.ukuran})`).join(', ');

      // Gunakan dialog konfirmasi yang sudah ada
      showConfirmation(
        'Konfirmasi Stok Minus',
        `Stok untuk item (${itemNames}) akan minus. Yakin akan melanjutkan?`,
        () => resolve(true) // Jika "Ya", resolve true
      );

      // Kita perlu cara untuk mendeteksi 'Batal'.
      // Kita akan tambahkan watcher sementara.
      const unwatch = watch(() => dialogConfirm.show, (newValue) => {
        if (!newValue) { // Jika dialog ditutup
          unwatch();
          // Jika onConfirm tidak dipanggil, 'pendingAction' akan null
          if (dialogConfirm.onConfirm) {
            // 'onConfirm' sudah di-set, artinya 'Ya' sudah ditekan.
          } else {
            resolve(false); // Dialog ditutup tanpa konfirmasi (Batal)
          }
        }
      });

      // Reset onConfirm setelah 'showConfirmation'
      // agar kita bisa deteksi 'Batal'
      dialogConfirm.onConfirm = () => {
        resolve(true);
        // Hapus watcher
        unwatch();
      };

    } else {
      resolve(true); // Tidak ada stok minus, lanjut
    }
  });
};

const onSaveSuccess = () => {
  // Dipanggil dari PaymentModal setelah save berhasil
  router.push({ name: 'Invoice' }); // Kembali ke halaman browse
};

const updateMemberInfo = (customer: Customer | null) => {
  const phone = customer?.telp || '';
  header.memberHp = phone;
  memberHpToSearch.value = phone;
};

const handleBarcodeScan = async () => {
  if (header.nomorPromo === 'PRO-2025-005') {
    return toast.error('Scan barcode non-aktif saat promo ini. Silakan gunakan F1/F2 (klik kolom Kode) untuk mencari barang promo.');
  }

  if (!header.customer.kode) {
    return toast.error('Pilih customer terlebih dahulu sebelum scan!');
  }
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  // --- LOGIKA 1: Jika barang sudah ada di grid, tambah jumlahnya ---
  const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
  if (existingItem) {
    existingItem.jumlah += 1;
    toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
    scannedBarcode.value = ''; // Kosongkan input
    return;
  }

  // --- LOGIKA 2: Jika belum ada, cari via API ---
  try {
    // Gunakan endpoint yang sudah ada untuk produk
    const response = await api.get(`/invoice-form/by-barcode/${barcode}`, {
      params: { gudang: header.gudang.kode }
    });
    const product = response.data;

    // Cari baris kosong pertama untuk diganti
    const emptyRowIndex = items.value.findIndex(item => !item.kode);

    const newItem = {
      id: Date.now(),
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
      qtyso: 0,
      terhitungPromo: false,       // properti wajib
      _isHargaEditable: product.harga === 0, // properti wajib
    };

    if (emptyRowIndex !== -1) {
      items.value.splice(emptyRowIndex, 1, newItem);
    } else {
      items.value.push(newItem);
    }
    addNewRow();
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      toast.error(error.response.data?.message || `Barcode ${barcode} tidak valid.`);
    } else {
      toast.error(`Barcode ${barcode} tidak valid.`);
    }
  } finally {
    scannedBarcode.value = '';
  }
};

// const validateQty = (item: Item) => {
//   if (item.jumlah > (item.stok || 0)) {
//     item.jumlah = item.stok || 0;
//     toast.warning(`Jumlah tidak boleh melebihi stok (${item.stok}) untuk ${item.nama}`);
//   }
// };

const handleJumlahChange = async (item: Item) => {
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

const resetForm = async () => {
  Object.assign(header, initialHeaderState);
  items.value = [];
  linkedDps.value = [];
  isSoLoaded.value = false;
  addNewRow();

  try {
    const authStore = useAuthStore();
    const cabang = authStore.userCabang; // Ambil cabang dari authStore

    console.log('User cabang from store:', cabang); // Debug log

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

const getQtyClass = (item) => {
  // Hanya tandai merah kalau stok kurang dari jumlah DAN bukan item SO DTF
  if (!item.noSoDtf && item.stok < item.jumlah) {
    return 'text-red font-weight-bold';
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
    const response = await api.get(`/invoice-form/${nomor}`);
    const { header: dataHeader, items: dataItems, dps: dataDps } = response.data;

    header.nomor = dataHeader.inv_nomor;
    header.tanggal = format(parseISO(dataHeader.inv_tanggal), 'yyyy-MM-dd');
    header.customer = {
      kode: dataHeader.inv_cus_kode,
      nama: dataHeader.cus_nama,
      alamat: dataHeader.cus_alamat,
      kota: dataHeader.cus_kota,
      telp: dataHeader.cus_telp,
      level: dataHeader.xLevel
    };
    header.nomorSo = dataHeader.inv_nomor_so;
    header.tanggalSo = dataHeader.so_tanggal ? format(parseISO(dataHeader.so_tanggal), 'yyyy-MM-dd') : '';
    header.top = dataHeader.inv_top;
    header.salesCounter = dataHeader.inv_sc;
    header.keterangan = dataHeader.inv_ket;
    header.diskonPersen1 = dataHeader.inv_disc1;
    header.diskonRp = dataHeader.inv_disc;
    header.ppnPersen = dataHeader.inv_ppn;
    header.biayaKirim = dataHeader.inv_bkrm;
    header.memberHp = dataHeader.inv_mem_hp;
    header.memberNama = dataHeader.inv_mem_nama;

    items.value = dataItems.map((item: ApiInvoiceItem): InvoiceItem => ({
      id: Date.now() + Math.random(),
      kode: item.invd_kode,
      nama: item.nama_barang,
      ukuran: item.invd_ukuran,
      jumlah: item.invd_jumlah,
      harga: item.invd_harga,
      diskonRp: item.invd_diskon,
    }));
    addNewRow();

    linkedDps.value = dataDps;
    isSoLoaded.value = !!header.nomorSo;

  } catch (error: unknown) {
    let message = 'Gagal memuat data Invoice.';

    if (axios.isAxiosError(error)) {
      // Sekarang TypeScript tahu ini AxiosError
      message = error.response?.data?.message || message;
    }

    toast.error(message);
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

watch(header, () => {
  if (header.top > 0 && header.tanggal) {
    header.tanggalTempo = format(addDays(new Date(header.tanggal), header.top), 'yyyy-MM-dd');
  }
}, { deep: true });
watch(items, calculateTotals, { deep: true });
watch(linkedDps, calculateTotals, { deep: true });
watch(items, (newItems) => {
  // Loop melalui setiap item dan hitung ulang totalnya
  newItems.forEach(item => {
    const hargaSetelahDiskon = (item.harga || 0) - (item.diskonRp || 0);
    item.total = (item.jumlah || 0) * hargaSetelahDiskon;
  });
  // Panggil kalkulasi total keseluruhan
  calculateTotals();
}, { deep: true });
watch(items, () => {
  calculateTotals();
  applyDefaultDiscount(); // Terapkan diskon setelah total dihitung
}, { deep: true });

onMounted(() => {
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
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-receipt-text-edit">
    <template #header-actions>
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
          <v-row dense>
            <v-col cols="6">
              <v-text-field label="No. Invoice" v-model="header.nomor" readonly density="compact" filled hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="filled" density="compact"
                hide-details readonly />
            </v-col>
            <v-col cols="4">
              <v-text-field label="Kode Cabang" :model-value="header.gudang.kode" readonly density="compact" filled
                hide-details />
            </v-col>
            <v-col cols="8">
              <v-text-field label="Nama Cabang" :model-value="header.gudang.nama" readonly density="compact" filled
                hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="No. Pesanan (SO)" v-model="header.nomorSo" readonly @click="dialogs.soSearch = true"
                prepend-inner-icon="mdi-magnify" density="compact" hide-details clearable
                @click:clear="handleClearSo" />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Tgl. SO"
                :model-value="header.tanggalSo ? format(parseISO(header.tanggalSo), 'dd-MM-yy') : ''" readonly filled
                density="compact" hide-details />
            </v-col>
            <v-col cols="4">
              <v-text-field label=" Kode Customer" :model-value="header.customer.kode" density="compact"
                :readonly="isSoLoaded" @click="isSoLoaded ? null : dialogs.customerSearch = true"
                prepend-inner-icon="mdi-magnify" hide-details />
            </v-col>
            <v-col cols="8">
              <v-text-field label="Nama Customer" :model-value="header.customer.nama" readonly density="compact"
                hide-details>
                <template #append-inner>
                  <v-btn icon="mdi-account-plus" size="x-small" variant="tonal" class="me-2"
                    @click.stop="dialogs.customerForm = true" title="Buat Customer Baru"></v-btn>
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
                variant="outlined" hide-details />
            </v-col>
            <v-col cols="4">
              <v-text-field label="Tgl. Jatuh Tempo" v-model="header.tanggalTempo" type="date" density="compact"
                readonly filled hide-details />
            </v-col>
            <v-col cols="12">
              <v-select label="Sales Counter" v-model="header.salesCounter" :items="salesCounters" variant="outlined"
                density="compact" hide-details />
            </v-col>
            <v-col cols="4">
              <v-text-field label="Promo" v-model="header.nomorPromo" @click="dialogs.promoSearch = true"
                prepend-inner-icon="mdi-magnify" density="compact" hide-details placeholder="F1 atau klik..." />
            </v-col>
            <v-col cols="8">
              <v-text-field label="Nama Promo" v-model="header.namaPromo" density="compact" readonly filled
                hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Keterangan" v-model="header.keterangan" density="compact" variant="outlined"
                hide-details />
            </v-col>
          </v-row>
          <v-input label="Info Member" append-inner-icon="mdi-pencil" @click="dialogs.memberForm = true" hide-details
            class="custom-input-button">
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
            <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
              placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
              prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan" />
          </div>

          <div class="logo-container">
            <v-img :src="dynamicLogo" max-width="60" contain />
          </div>
        </div>

        <div class="scrollable-table-wrapper">
          <div class="desktop-form-section table-section">
            <v-data-table :headers="tableHeaders" :items="items" class="desktop-table" :items-per-page="-1" fixed-header
              height="calc(100vh - 420px)">
              <template v-slot:[`item.kode`]="{ item, index }">
                <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                  placeholder="F1/F2..." :readonly="!!header.nomorSo || !!item.noSoDtf"
                  :class="{ 'field-disabled': !!header.nomorSo || !!item.noSoDtf }"
                  @keydown.f1.prevent="!header.nomorSo && !item.noSoDtf && openProductSearch(index, false)"
                  @keydown.f2.prevent="!header.nomorSo && !item.noSoDtf && openProductSearch(index, true)" />
              </template>

              <template v-slot:[`item.jumlah`]="{ item }">
                <v-text-field v-model.number="item.jumlah" type="number" min="0" variant="underlined" density="compact"
                  hide-details class="text-right" :class="getQtyClass(item)" @blur="handleJumlahChange(item)" />
              </template>

              <template v-slot:[`item.harga`]="{ item }">
                <v-text-field
                  :model-value="focusedRowId === item.id ? item.harga : new Intl.NumberFormat('id-ID').format(item.harga || 0)"
                  @update:model-value="item.harga = Number(String($event).replace(/[^0-9]/g, '')) || 0"
                  @focus="focusedRowId = item.id" @blur="focusedRowId = -1" type="text" min="0" variant="underlined"
                  density="compact" hide-details class="text-right" :readonly="!isHargaEditable(item)"
                  placeholder="0"></v-text-field>
              </template>

              <template v-slot:[`item.diskonPersen`]="{ item }">
                <v-text-field v-model.number="item.diskonPersen" type="number" min="0" variant="underlined"
                  density="compact" hide-details class="text-right" @blur="handleItemDiscountChange(item)"
                  @focus="onItemDiscountFocus(item)" />
              </template>

              <template v-slot:[`item.diskonRp`]="{ item }">
                <v-text-field v-model.number="item.diskonRp" type="number" min="0" variant="underlined"
                  density="compact" hide-details class="text-right" @blur="handleItemDiscountChange(item)"
                  @focus="onItemDiscountFocus(item)" />
              </template>

              <template v-slot:[`item.total`]="{ item }">
                <div class="text-end text-body-2 font-weight-bold pt-3 pb-1">
                  {{ new Intl.NumberFormat('id-ID').format(item.total || 0) }}
                </div>
              </template>

              <template v-slot:[`item.noSoDtf`]="{ item, index }">
                <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details
                  placeholder="F1 atau Klik..." :readonly="!!header.nomorSo || !!item.kode"
                  :class="{ 'field-disabled': !!header.nomorSo || !!item.kode }" @click="openSoDtfSearch(item, index)"
                  @keydown.f1.prevent="openSoDtfSearch(item, index)" />
              </template>

              <template v-slot:[`item.actions`]="{ item }">
                <v-btn v-if="item.kode" icon="mdi-delete" variant="text" color="error" size="x-small"
                  @click="handleDeleteItem(item)"
                  :title="item.noSoDtf ? 'Hapus Semua Item SO DTF Ini' : 'Hapus Item Ini'">
                </v-btn>
              </template>
            </v-data-table>
          </div>
        </div>

        <div class="footer-actions-section">
          <v-row align="center">
            <v-col cols="auto" class="d-flex ga-2">
              <v-btn size="small" prepend-icon="mdi-cash-multiple" @click="dialogs.linkedDp = true"
                :disabled="!header.customer.kode">
                Lihat DP
              </v-btn>
              <v-btn size="small" prepend-icon="mdi-sale" @click="dialogs.diskonForm = true">
                Input Diskon/Biaya
              </v-btn>
            </v-col>

            <v-spacer></v-spacer>

            <v-col cols="auto">
              <v-btn color="primary" size="large" prepend-icon="mdi-credit-card-check" @click="handleProceedToPayment"
                :disabled="!authStore.can(MENU_ID, requiredPermission)">
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
      @so-selected="onSoSelected" />
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
    <DiskonForm v-if="dialogs.diskonForm" :diskon-persen1="header.diskonPersen1" :diskon-rp="header.diskonRp"
      :biaya-kirim="header.biayaKirim" @close="dialogs.diskonForm = false" :sub-total="totals.subTotal"
      @save="onDiskonSaved" />
    <LinkedDpModal v-if="dialogs.linkedDp" :dps="linkedDps" @close="dialogs.linkedDp = false" />
    <AuthorizationModal v-if="authDialog.show" ref="authModalRef" :title="authDialog.title"
      :challenge-code="authDialog.challengeCode" @close="handleAuthCancel" @success="handleAuthSuccess" />
    <SoDtfSearchModal v-if="dialogs.soDtfSearch" :customer-kode="header.customer.kode" :cabang="header.gudang.kode"
      @close="dialogs.soDtfSearch = false" @selected="onSoDtfSelected" />
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
  background-color: #f7f9fc;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.custom-input-button {
  border: 1px solid #BDBDBD;
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  background-color: #f7f7f7;
  height: 40px;
  /* Samakan dengan density compact */
  align-items: center;
}

.custom-input-button:hover {
  border-color: #666666;
}

.input-content {
  font-size: 11px;
}

.input-placeholder {
  font-size: 11px;
  color: #888888;
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
  border-top: 1px solid #e0e0e0;
}

.footer-actions-section .v-row {
  margin: 0 !important;
}
</style>

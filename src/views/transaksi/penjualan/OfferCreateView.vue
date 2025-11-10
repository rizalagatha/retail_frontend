<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
// import GudangSearchModal from '@/components/GudangSearchModal.vue';
import ProductSearchModal from '@/components/lookup/ProductSearchModal.vue';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
// import SoDtfSearchModal from '@/components/lookup/SoDtfSearchModal.vue';
import PriceProposalSearchModal from '@/components/lookup/PriceProposalSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useRoute } from 'vue-router';
import { format, addDays, isValid } from 'date-fns';
import axios, { AxiosError } from 'axios';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = '42';

// --- Interfaces ---
interface OfferItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  harga: number;
  isHargaReadonly: boolean;
  diskonPersen: number;
  diskonRp: number;
  total: number;
  barcode: string;
  // noSoDtf: string;
  noPengajuanHarga: string;
  pin: string;
}

interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  top: number;
  level: string;
  discountRule: DiscountRule;
}

interface Gudang {
  kode: string;
  nama: string;
}

interface DiscountRule {
  diskon1: number;
  diskon2: number;
  nominal: number;
}

interface Product {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  harga: number;
  barcode: string;
}

// --- State ---
const header = ref({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  gudang: { kode: authStore.user?.cabang || '', nama: 'Gudang Utama' } as Gudang,
  customer: null as Customer | null,
  customerKode: '', // Tambahan: untuk menyimpan kode customer sementara
  top: 0,
  tempo: format(new Date(), 'yyyy-MM-dd'),
  ppnPersen: 0,
  keterangan: '',
});

const items = ref<OfferItem[]>([]);
const footer = ref({
  total: 0,
  diskonRp: 0,
  diskonRpInput: 0,
  diskonPersen1: 0,
  diskonPersen2: 0,
  biayaKirim: 0,
  ppnRp: 0,
  netto: 0,
  grandTotal: 0,
  pinDiskon1: '',
  pinDiskon2: '',
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const productCategory = ref('Kaosan');

const isCustomerSearchVisible = ref(false);
// const isGudangSearchVisible = ref(false);
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
// const isSoDtfSearchVisible = ref(false);
const isPriceProposalSearchVisible = ref(false);
const activeRowIndex = ref(0);
const isSaving = ref(false);
const isConfirmDialogVisible = ref(false);
const focusedRowId = ref<number | string>(-1);
const isFooterDiskonRpFocused = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);
const isAuthModalVisible = ref(false);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const defaultDiscount = ref(0);

const previousDiscount = ref(0);
const isAuth2ModalVisible = ref(false);
const isPrintConfirmVisible = ref(false);
const printConfirmNomor = ref('');
const previousDiscount2 = ref(0);
const isItemAuthModalVisible = ref(false);
const activeItemIndexForAuth = ref(-1);
const previousItemDiscount = ref({ persen: 0, rp: 0 });
const challengeCode = ref('');
const authModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const auth2ModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);

const itemAuthModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);

const scannedBarcode = ref('');

footer.value.diskonRpInput = footer.value.diskonRp;
const isEditingDiskonRp = ref(false); // untuk menandai bahwa otorisasi dari diskon Rp

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah Penawaran: ${header.value.nomor}` : 'Buat Penawaran Baru');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const canEditFooter = computed(() => {
  // Tombol/field di footer hanya aktif jika customer sudah dipilih
  // DAN setidaknya ada satu baris barang yang sudah terisi (memiliki kode).
  return header.value.customer && items.value.some(item => item.kode);
});

const tableHeaders = [
  { title: 'Kode', key: 'kode', width: '300px' },
  { title: 'Barcode', key: 'barcode', sortable: false },
  { title: 'Nama Barang', key: 'nama', width: '900px' },
  { title: 'Ukuran', key: 'ukuran', width: '30px' },
  { title: 'Stok', key: 'stok', width: '30px', align: 'end' }, // <-- DIUBAH
  { title: 'Jml', key: 'jumlah', width: '30px', align: 'end' }, // <-- DIUBAH
  { title: 'Harga', key: 'harga', width: '90px', align: 'end' }, // <-- DIUBAH
  { title: 'Diskon %', key: 'diskonPersen', width: '30px', align: 'end' }, // <-- DIUBAH
  { title: 'Diskon Rp', key: 'diskonRp', width: '50px', align: 'end' }, // <-- DIUBAH
  { title: 'Total', key: 'total', align: 'end', width: '90px' },
  { title: 'No. Pengajuan', key: 'noPengajuanHarga', width: '90px' },
  { title: 'Barcode', key: 'barcode', width: '70px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '40px' },
] as const;

// --- Methods ---
const loadCustomerDetails = async () => {
  if (!header.value.customerKode) {
    // console.log('Tidak ada customer kode untuk dimuat');
    return;
  }

  // console.log('Loading customer details untuk kode:', header.value.customerKode);

  try {
    const response = await api.get(`/offer-form/customer-details/${header.value.customerKode}`);
    // console.log('Customer details response:', response.data);

    // Mapping data dari format API ke format frontend
    header.value.customer = {
      kode: header.value.customerKode, // Kode sudah kita punya
      nama: response.data.cus_nama || '',
      alamat: response.data.cus_alamat || '',
      kota: response.data.cus_kota || '',
      telp: response.data.cus_telp || '',
      top: response.data.cus_top || 0,
      level: response.data.xlevel || '',
      discountRule: {
        diskon1: response.data.diskon1 || 0,
        diskon2: response.data.diskon2 || 0,
        nominal: response.data.nominal || 0,
      }
    };

    header.value.top = response.data.cus_top || 0;
    // console.log('Customer data after mapping:', header.value.customer);
    toast.success('Detail customer berhasil dimuat.');
  } catch (error) {
    console.error('Error loading customer details:', error);
    toast.error('Gagal memuat detail customer.');
    // Reset customer jika gagal
    header.value.customer = null;
    header.value.top = 0;
  }
};

const loadOfferData = async (nomor: string) => {
  try {
    const response = await api.get(`/offer-form/edit-details/${nomor}`);
    const { headerData, itemsData, footerData } = response.data;

    // Isi semua state dengan data yang diterima dari server
    header.value = headerData;
    items.value = itemsData.map((item: Partial<OfferItem>): OfferItem => ({
      id: item.id || Date.now(),
      kode: item.kode || '',
      nama: item.nama || '',
      ukuran: item.ukuran || '',
      stok: item.stok || 0,
      jumlah: item.jumlah || 0,
      harga: item.harga || 0,
      isHargaReadonly: (item.harga || 0) > 0,
      diskonPersen: item.diskonPersen || 0,
      diskonRp: item.diskonRp || 0,
      total: item.total || 0,
      barcode: item.barcode || '',
      noPengajuanHarga: item.noPengajuanHarga || '',
      pin: item.pin || ''
    }));
    footer.value = footerData;

    toast.success(`Data untuk penawaran ${nomor} berhasil dimuat.`);
  } catch (error) {
    toast.error('Gagal memuat data penawaran.', error);
    router.push('/transaksi/penjualan/penawaran'); // Kembali ke daftar jika gagal
  }
};

const openCustomerSearch = () => { isCustomerSearchVisible.value = true; };
// const openGudangSearch = () => { isGudangSearchVisible.value = true; };

// Perbaikan: Hanya menerima kode customer dari modal
const onCustomerSelected = async (customer: { kode: string }) => {
  isCustomerSearchVisible.value = false;
  if (!customer || !customer.kode) return;

  try {
    const response = await api.get(`/offer-form/customer-details/${customer.kode}`, {
      params: { gudang: header.value.gudang.kode }
    });

    header.value.customer = response.data;
    header.value.top = response.data.top;
    applyDefaultDiscount();
    calculateTotals();
    toast.success(`Customer ${response.data.nama} berhasil dipilih.`);

  } catch (error: unknown) {
    // Cek dulu apakah error adalah AxiosError
    if (axios.isAxiosError(error) && error.response) {
      toast.error(error.response.data?.message || 'Gagal memuat detail customer.');
    } else {
      toast.error('Gagal memuat detail customer.');
    }
    header.value.customer = null;
  }
};

// const onGudangSelected = async (gudang: Gudang) => {
//     // console.log('Gudang received:', gudang); // Debug log

//     // Pastikan data gudang valid
//     if (!gudang || !gudang.kode) {
//         toast.error('Data gudang tidak valid.');
//         return;
//     }

//     header.value.gudang = gudang;
//     isGudangSearchVisible.value = false;

//     if (!isEditMode.value) {
//     }

//     // Debug: Cek apakah ada customerKode
//     // console.log('Customer kode saat ini:', header.value.customerKode);

//     // Setelah gudang dipilih, load detail customer jika sudah ada kode customer
//     if (header.value.customerKode) {
//         // console.log('Memulai load customer details untuk kode:', header.value.customerKode);
//         toast.info('Memuat detail customer...');
//         await loadCustomerDetails();
//     } else {
//         // console.log('Tidak ada customer kode, skip load customer details');
//     }
// };

const openProductSearch = (index: number, isMulti: boolean) => {
  if (!header.value.customer) {
    toast.error('Pilih Customer terlebih dahulu.');
    return;
  }
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  isProductSearchVisible.value = true;
};

const onProductsSelected = (selectedProducts: Product[]) => {
  isProductSearchVisible.value = false; // Tutup modal
  if (!selectedProducts || selectedProducts.length === 0) return;

  const newProducts = selectedProducts
    .filter(product => !items.value.some(item => item.barcode === product.barcode))
    .map(product => ({
      id: Date.now() + Math.random(),
      kode: product.kode,
      nama: product.nama,
      ukuran: product.ukuran,
      stok: product.stok,
      harga: product.harga,
      isHargaReadonly: product.harga > 0,
      jumlah: 1,
      diskonPersen: 0,
      diskonRp: 0,
      total: product.harga,
      barcode: product.barcode,
      // noSoDtf: '',
      noPengajuanHarga: '',
      pin: ''
    }));

  if (newProducts.length === 0) {
    toast.info("Semua produk yang dipilih sudah ada di dalam daftar.");
    return;
  }

  items.value.splice(activeRowIndex.value, 1, ...newProducts);

  addNewRow();
  calculateTotals();
};

const calculateTotals = () => {
  let subtotal = 0;
  items.value.forEach(item => {
    const price = Number(item.harga) || 0;
    const qty = Number(item.jumlah) || 0;
    let discountRp = Number(item.diskonRp) || 0;
    const discountPersen = Number(item.diskonPersen) || 0;

    // Prioritaskan diskon persen jika diisi
    if (discountPersen > 0) {
      discountRp = (discountPersen / 100) * price;
      item.diskonRp = discountRp; // Update diskon Rp
    }

    item.total = qty * (price - discountRp);
    subtotal += item.total;
  });

  footer.value.total = subtotal;

  // const rule = header.value.customer?.discountRule;
  // if (rule) {
  //     if (subtotal >= rule.nominal) {
  //         footer.value.diskonPersen1 = rule.diskon1;
  //     } else {
  //         footer.value.diskonPersen1 = rule.diskon2;
  //     }
  // } else {
  //     footer.value.diskonPersen1 = 0;
  // }

  const discount1 = (footer.value.diskonPersen1 / 100) * subtotal;
  const afterDiscount1 = subtotal - discount1;
  const discount2 = (footer.value.diskonPersen2 / 100) * afterDiscount1;
  footer.value.diskonRp = discount1 + discount2;
  const netto = subtotal - footer.value.diskonRp;
  footer.value.netto = netto;
  footer.value.ppnRp = (header.value.ppnPersen / 100) * netto;
  footer.value.grandTotal = netto + footer.value.ppnRp + (Number(footer.value.biayaKirim) || 0);
};

const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(),
      kode: '',
      nama: '',
      ukuran: '',
      stok: 0,
      jumlah: 0,
      harga: 0,
      isHargaReadonly: false,
      diskonPersen: 0,
      diskonRp: 0,
      total: 0,
      barcode: '',
      // noSoDtf: '',
      noPengajuanHarga: '',
      pin: '' // tambahkan ini
    });
  }
};


const removeRow = (index: number) => {
  items.value.splice(index, 1);
};

const save = async () => {
  // --- Validasi dari Delphi (btnSimpanClick) ---
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    return;
  }
  if (!header.value.customer) {
    toast.error('Customer harus dipilih terlebih dahulu.');
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
    if (!item.harga || item.harga < 0) { // Harga boleh 0, tapi tidak boleh null/undefined
      toast.error(`Harga untuk barang '${item.nama}' harus diisi.`);
      return;
    }
  }

  // --- Konfirmasi Simpan (dari MessageDlg) ---
  // Di sini kita akan menggunakan dialog konfirmasi yang sudah ada, jika Anda sudah membuatnya.
  // Jika belum, Anda bisa langsung menjalankan logika simpan.
  // Asumsi kita langsung simpan setelah validasi.

  isSaving.value = true;
  try {
    const payload = {
      header: header.value,
      footer: footer.value,
      details: validItems,
      user: authStore.user,
      isNew: !isEditMode.value,
    };

    const response = await api.post('/offer-form/save', payload);
    toast.success(response.data.message);

    // --- PERUBAHAN LOGIKA REDIRECT ---

    const nomorPenawaran = response.data.nomor;

    if (nomorPenawaran) {
      // 1. Simpan nomor untuk dialog
      printConfirmNomor.value = nomorPenawaran;
      // 2. Buka dialog konfirmasi cetak
      isPrintConfirmVisible.value = true;

      // (Kita tidak lagi router.push di sini)

    } else {
      // Fallback jika 'nomor' tidak ditemukan di respons
      toast.error('Gagal mendapatkan nomor dokumen untuk dicetak. Mengarahkan ke daftar.');
      router.push('/transaksi/penjualan/penawaran');
    }

    // --- AKHIR PERUBAHAN ---

  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message || 'Gagal menyimpan data penawaran.';
      toast.error(message);
    } else if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error('Gagal menyimpan data penawaran.');
    }
  } finally {
    isSaving.value = false;
  }
};

const handlePrintConfirm = () => {
  if (!printConfirmNomor.value) return;

  try {
    // 1. Resolve URL dari named route 'Cetak Penawaran'
    const routeData = router.resolve({
      name: 'Cetak Penawaran', // Pastikan 'name' ini SAMA PERSIS dengan di router Anda
      params: { nomor: printConfirmNomor.value }
    });

    // 2. Buka URL di tab baru
    window.open(routeData.href, '_blank');

  } catch (error) {
    console.error("Gagal membuka halaman cetak:", error);
    toast.error('Gagal membuka halaman cetak. Pastikan route "Cetak Penawaran" ada.');
  } finally {
    // 3. Tutup dialog dan kembali ke halaman browse
    isPrintConfirmVisible.value = false;
    printConfirmNomor.value = '';
    router.push('/transaksi/penjualan/penawaran');
  }
};

const handlePrintCancel = () => {
  isPrintConfirmVisible.value = false;
  printConfirmNomor.value = '';
  // Langsung kembali ke halaman browse
  router.push('/transaksi/penjualan/penawaran');
};

const resetForm = () => {
  header.value = {
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    gudang: { kode: authStore.user?.cabang || '', nama: 'Gudang Utama' },
    customer: null,
    customerKode: '',
    top: 0,
    tempo: format(new Date(), 'yyyy-MM-dd'),
    ppnPersen: 0,
    keterangan: '',
  };
  items.value = [];
  addNewRow();
};

const handleDiscountChange = async () => {
  // Jangan lakukan apa-apa jika customer belum dipilih
  if (!header.value.customer || !header.value.customer.level) {
    calculateTotals();
    return;
  }

  try {
    // 1. Panggil API untuk mendapatkan diskon standar
    const response = await api.get('/offer-form/get-default-discount', {
      params: {
        level: header.value.customer.level,
        total: footer.value.total,
        gudang: header.value.gudang.kode,
      }
    });
    const defaultDiscountValue = response.data.discount;

    // 2. Bandingkan diskon yang diinput dengan diskon standar
    const enteredDiscount = footer.value.diskonPersen1;

    // 3. Jika diskonnya berbeda (lebih besar atau lebih kecil) & bukan 0, minta otorisasi
    if (enteredDiscount !== defaultDiscountValue && enteredDiscount > 0) {
      previousDiscount.value = defaultDiscountValue; // Simpan nilai default untuk opsi batal
      challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
      isAuthModalVisible.value = true; // Buka modal otorisasi
    } else {
      // Jika diskonnya sama dengan standar, atau 0, langsung hitung
      calculateTotals();
    }
  } catch (error) {
    toast.error('Gagal memvalidasi diskon standar.', error);
    // Kembalikan ke nilai sebelumnya jika API gagal
    footer.value.diskonPersen1 = previousDiscount.value;
  }
};

const onAuthSuccess = async (pin: string) => {
  try {
    await api.post('/auth-pin/validate', {
      code: challengeCode.value,
      pin: pin
    });

    toast.success('Otorisasi diskon berhasil.');
    isAuthModalVisible.value = false; // Tutup modal

    // Cek field mana yang sedang diotorisasi
    if (isEditingDiskonRp.value) {
      // --- Ini untuk DISKON RP ---
      footer.value.pinDiskon1 = pin; // Simpan PIN
      // Sinkronkan input field (sebenarnya sudah sinkron)
      footer.value.diskonRpInput = footer.value.diskonRp;
      isEditingDiskonRp.value = false; // Reset flag
    } else {
      // --- Ini untuk DISKON PERSEN 1 ---
      footer.value.pinDiskon1 = pin; // Simpan PIN
      // Nilai sudah ada di v-model,
      // kita panggil calculateTotals() untuk memastikan
      // (meskipun 'watch' mungkin sudah menjalankannya)
      calculateTotals();
    }

  } catch (error: unknown) {
    // Logika error (JANGAN TUTUP MODAL JIKA GAGAL)
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        if (authModalRef.value) {
          authModalRef.value.setFailed(error.response.data.message || 'Otorisasi Gagal.');
        }
      } else {
        toast.error(error.response?.data?.message || 'Terjadi kesalahan.');
      }
    } else if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error('Terjadi kesalahan.');
    }
  }
};

const onDiskonRpBlur = () => {
  const newValue = Number(footer.value.diskonRpInput) || 0;

  // 1. Cek dulu apakah nilainya benar-benar berubah
  if (newValue === footer.value.diskonRp) {
    return; // Tidak ada perubahan, tidak perlu kalkulasi atau otorisasi
  }

  // 2. Simpan nilai LAMA (yang sah) untuk Batal
  previousDiscount.value = footer.value.diskonRp;

  // 3. SET nilai BARU-nya SEKARANG
  footer.value.diskonRp = newValue;
  // 'watch' akan otomatis memanggil calculateTotals() dan memperbarui tampilan

  // 4. Minta otorisasi
  challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
  isEditingDiskonRp.value = true;
  isAuthModalVisible.value = true;
};

const onAuthCancel = () => {
  isAuthModalVisible.value = false; // Selalu tutup modal

  if (isEditingDiskonRp.value) {
    // --- Logika Batal untuk DISKON RP ---
    footer.value.diskonRp = previousDiscount.value;
    footer.value.diskonRpInput = previousDiscount.value;
    isEditingDiskonRp.value = false; // Reset flag
  } else {
    // --- Logika Batal untuk DISKON PERSEN 1 ---
    // 'previousDiscount' sudah diisi oleh handleDiscountChange()
    footer.value.diskonPersen1 = previousDiscount.value;
  }
  // Saat nilai footer diubah (baik diskonRp atau diskonPersen1),
  // 'watch' akan otomatis memanggil calculateTotals()
  // dan mengembalikan perhitungannya ke nilai yang benar.
};

const handleItemDiscountChange = (index: number) => {
  const item = items.value[index];
  // Meniru logika Delphi: otorisasi diperlukan jika diskon diisi
  // (di dunia nyata, ini akan diperiksa ke backend)
  if (item.diskonPersen > 0 || item.diskonRp > 0) {
    activeItemIndexForAuth.value = index;
    previousItemDiscount.value = { persen: 0, rp: 0 }; // Asumsi diskon awal 0
    challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString(); // Buat kode acak
    isItemAuthModalVisible.value = true;
  } else {
    calculateTotals();
  }
};

const onItemAuthSuccess = async (pin: string) => {
  try {
    await api.post('/auth-pin/validate', {
      code: challengeCode.value,
      pin: pin
    });

    items.value[activeItemIndexForAuth.value].pin = pin; // Simpan PIN yang valid
    isItemAuthModalVisible.value = false;
    toast.success('Otorisasi diskon item berhasil.');
    calculateTotals();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      // Error dari Axios
      if (error.response?.status === 401) {
        if (itemAuthModalRef.value) {
          itemAuthModalRef.value.setFailed(error.response.data.message || 'Otorisasi Gagal.');
        }
      } else {
        toast.error(error.response?.data?.message || 'Terjadi kesalahan.');
      }
    } else if (error instanceof Error) {
      // Error JS biasa
      toast.error(error.message);
    } else {
      toast.error('Terjadi kesalahan.');
    }
  }
};

const onItemAuthCancel = () => {
  isItemAuthModalVisible.value = false;
  const item = items.value[activeItemIndexForAuth.value];
  // Kembalikan ke diskon sebelumnya jika dibatalkan
  item.diskonPersen = previousItemDiscount.value.persen;
  item.diskonRp = previousItemDiscount.value.rp;
  calculateTotals();
};

const handleDiscount2Change = () => {
  // Fungsi ini akan dipanggil saat input diskon % 2 selesai diisi
  // Otorisasi diperlukan jika Diskon % 1 sudah diisi dan Diskon % 2 diubah menjadi > 0
  if (footer.value.diskonPersen1 > 0 && footer.value.diskonPersen2 > 0) {
    previousDiscount2.value = 0; // Simpan nilai lama (asumsi dari 0)
    challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString(); // Buat kode acak
    isAuth2ModalVisible.value = true;
  } else {
    calculateTotals();
  }
};

const onAuth2Success = async (pin: string) => {
  try {
    // Panggil API validasi PIN yang baru
    await api.post('/auth-pin/validate', {
      code: challengeCode.value,
      pin: pin
    });

    footer.value.pinDiskon2 = pin; // Simpan PIN yang valid
    isAuth2ModalVisible.value = false;
    toast.success('Otorisasi diskon berhasil.');
    calculateTotals();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      // Error dari Axios
      if (error.response?.status === 401) {
        if (auth2ModalRef.value) {
          auth2ModalRef.value.setFailed(error.response.data.message || 'Otorisasi Gagal.');
        }
      } else {
        toast.error(error.response?.data?.message || 'Terjadi kesalahan.');
      }
    } else if (error instanceof Error) {
      // Error JS biasa
      toast.error(error.message);
    } else {
      toast.error('Terjadi kesalahan.');
    }
  }
};

const onAuth2Cancel = () => {
  isAuth2ModalVisible.value = false;
  footer.value.diskonPersen2 = previousDiscount2.value; // Kembalikan ke nilai sebelumnya
  calculateTotals();
};

// const openSoDtfSearch = (index: number) => {
//   if (!header.value.customer) {
//     toast.error('Pilih Customer terlebih dahulu.');
//     return;
//   }
//   activeRowIndex.value = index;
//   isSoDtfSearchVisible.value = true;
// };

const openPriceProposalSearch = (index: number) => {
  if (!header.value.customer) {
    toast.error('Pilih Customer terlebih dahulu.');
    return;
  }
  activeRowIndex.value = index;
  isPriceProposalSearchVisible.value = true;
};

// // Method untuk menangani hasil pilihan dari modal SO DTF
// const onSoDtfSelected = async (so: { nomor: string }) => {
//   isSoDtfSearchVisible.value = false;
//   items.value.splice(activeRowIndex.value, 1);

//   try {
//     const response = await api.get(`/so-dtf-form/${so.nomor}`);
//     const { header, detailsUkuran } = response.data;

//     detailsUkuran.forEach((detail: { ukuran: string; jumlah: number; harga: number }) => {
//       items.value.push({
//         id: Date.now() + Math.random(),
//         kode: header.sd_nomor,
//         nama: header.sd_nama,
//         ukuran: detail.ukuran,
//         jumlah: detail.jumlah,
//         harga: detail.harga,
//         total: detail.jumlah * detail.harga,
//         noSoDtf: header.sd_nomor,
//         stok: 0,
//         diskonPersen: 0,
//         diskonRp: 0,
//         barcode: '',
//         noPengajuanHarga: '',
//         pin: ''
//       });
//     });

//     addNewRow();
//   } catch (error: unknown) {
//     if (axios.isAxiosError(error)) {
//       toast.error(error.response?.data?.message || `Gagal memuat detail SO DTF ${so.nomor}`);
//     } else if (error instanceof Error) {
//       toast.error(error.message);
//     } else {
//       toast.error(`Gagal memuat detail SO DTF ${so.nomor}`);
//     }
//   }
// };

// Method untuk menangani hasil pilihan dari modal Pengajuan Harga
const onPriceProposalSelected = async (proposal: { nomor: string }) => {
  isPriceProposalSearchVisible.value = false;
  items.value.splice(activeRowIndex.value, 1);

  try {
    const response = await api.get(`/price-proposal-form/edit-details/${proposal.nomor}`);
    const { headerData, itemsData } = response.data;

    itemsData.forEach((detail: { kode: string; nama: string; ukuran: string; jumlah: number; harga: number; total: number }) => {
      items.value.push({
        id: Date.now() + Math.random(),
        kode: detail.kode,
        nama: detail.nama,
        ukuran: detail.ukuran,
        jumlah: detail.jumlah,
        harga: detail.harga,
        isHargaReadonly: detail.harga > 0,
        total: detail.total,
        stok: 0,
        diskonPersen: 0,
        diskonRp: 0,
        barcode: '',
        // noSoDtf: '', // tambahkan properti ini supaya sesuai tipe
        noPengajuanHarga: headerData.nomor, // pastikan ini string
        pin: ''
      });
    });

    addNewRow();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || `Gagal memuat detail Pengajuan ${proposal.nomor}`);
    } else if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error(`Gagal memuat detail Pengajuan ${proposal.nomor}`);
    }
  }
};

const showConfirmation = (action: () => void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
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
  router.push('/transaksi/penjualan/penawaran');
};

const applyDefaultDiscount = () => {
  const rule = header.value.customer?.discountRule;
  if (rule) {
    // Logika ini dipindahkan dari calculateTotals
    if (footer.value.total >= rule.nominal) {
      footer.value.diskonPersen1 = rule.diskon1;
    } else {
      footer.value.diskonPersen1 = rule.diskon2;
    }
  } else {
    footer.value.diskonPersen1 = 0;
  }
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
    const response = await api.get(`/offer-form/by-barcode/${barcode}`, {
      params: { gudang: header.value.gudang.kode } // Sesuaikan dengan cara Anda menyimpan kode gudang
    });

    const product = response.data;

    // Cari baris kosong pertama untuk diganti
    const emptyRowIndex = items.value.findIndex(item => !item.kode);

    if (emptyRowIndex !== -1) {
      // Ganti baris kosong dengan data produk baru
      items.value.splice(emptyRowIndex, 1, {
        id: Date.now(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        harga: product.harga,
        isHargaReadonly: product.harga > 0,
        jumlah: 1, // Default jumlah 1
        diskonPersen: 0,
        diskonRp: 0,
        total: product.harga,
        barcode: product.barcode,
        // noSoDtf: '',          // tambahkan properti default
        noPengajuanHarga: '', // tambahkan properti default
        pin: ''               // tambahkan properti default
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
    let message = `Barcode ${barcode} tidak valid.`;

    if (err instanceof AxiosError) {
      message = err.response?.data?.message || message;
    }

    toast.error(message);
  } finally {
    scannedBarcode.value = ''; // selalu kosongkan input
  }
};

watch(items, calculateTotals, { deep: true });
watch(footer, calculateTotals, { deep: true });
watch(() => header.value.ppnPersen, calculateTotals);

watch(() => header.value.top, (newTop) => {
  const date = new Date(header.value.tanggal);
  if (isValid(date)) {
    header.value.tempo = format(addDays(date, newTop || 0), 'yyyy-MM-dd');
  }
});
watch(() => header.value.tanggal, (newDate) => {
  const date = new Date(newDate);
  if (isValid(date)) {
    header.value.tempo = format(addDays(date, header.value.top || 0), 'yyyy-MM-dd');
  }
});
watch(() => header.value.customerKode, (newKode) => {
  if (newKode) loadCustomerDetails();
});

onMounted(() => {
  // Pengecekan otorisasi sebelum memuat apa pun
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin untuk ${requiredPermission.value === 'insert' ? 'membuat' : 'mengubah'} data penawaran.`);
    router.push('/transaksi/penjualan/penawaran');
    return;
  }

  if (isEditMode.value) {
    loadOfferData(route.params.nomor as string);
  } else {
    addNewRow();
  }
});


</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-file-document-edit-outline">
    <template #header-actions>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save"
        @click="showConfirmation(save, 'Anda yakin ingin menyimpan data penawaran ini?')" :loading="isSaving">
        Simpan
      </v-btn>
      <v-btn v-if="!isEditMode" size="small" prepend-icon="mdi-cancel"
        @click="showConfirmation(resetForm, 'Batalkan dan kosongkan semua isian?')">
        Batal
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close"
        @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')">
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6">
              <v-text-field label="Nomor" :model-value="header.nomor || '<Otomatis>'" readonly variant="filled"
                density="compact" hide-details>
              </v-text-field>
            </v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                density="compact" hide-details></v-text-field></v-col>
            <!-- <v-col cols="12"><v-text-field label="Gudang" :model-value="header.gudang.kode" readonly
                                @click="openGudangSearch" variant="outlined" density="compact" hide-details
                                append-inner-icon="mdi-magnify"></v-text-field></v-col> -->
            <v-col cols="12"><v-text-field label="Customer"
                :model-value="header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''" readonly
                @click="openCustomerSearch" variant="outlined" density="compact" hide-details
                append-inner-icon="mdi-magnify"></v-text-field></v-col>
            <v-col cols="12"><v-text-field label="Alamat" :model-value="header.customer?.alamat" readonly
                variant="filled" density="compact" hide-details></v-text-field></v-col>
            <v-col cols="6"><v-text-field label="Kota / Telp"
                :model-value="header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''" readonly
                variant="filled" density="compact" hide-details></v-text-field></v-col>
            <v-col cols="6"><v-text-field label="Level" :model-value="header.customer?.level" readonly variant="filled"
                density="compact" hide-details></v-text-field></v-col>
            <v-col cols="4"><v-text-field label="TOP" v-model.number="header.top" type="number" variant="outlined"
                density="compact" hide-details></v-text-field></v-col>
            <v-col cols="8"><v-text-field label="Tgl Tempo" v-model="header.tempo" type="date" variant="filled" readonly
                density="compact" hide-details></v-text-field></v-col>
            <v-col cols="12"><v-text-field label="Keterangan" v-model="header.keterangan" variant="outlined"
                density="compact" hide-details></v-text-field></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section footer-section">
          <v-row dense class="mb-2">
            <!-- <v-col cols="3">
              <v-text-field label="PPN %" v-model.number="header.ppnPersen" type="number" variant="outlined"
                density="compact" hide-details class="summary-field">
              </v-text-field>
            </v-col> -->
            <v-col cols="6">
              <v-text-field label="Biaya Kirim" v-model.number="footer.biayaKirim" type="number" variant="outlined"
                density="compact" hide-details class="summary-field text-right">
              </v-text-field>
            </v-col>
            <v-col cols="3">
              <v-text-field label="Disc%1" v-model.number="footer.diskonPersen1" type="number" variant="outlined"
                density="compact" hide-details @blur="handleDiscountChange">
              </v-text-field>
            </v-col>
            <v-col cols="3">
              <v-text-field label="Disc%2" v-model.number="footer.diskonPersen2" type="number" variant="outlined"
                density="compact" hide-details @blur="handleDiscount2Change">
              </v-text-field>
            </v-col>
          </v-row>
          <v-divider class="my-2"></v-divider>
          <v-text-field label="Diskon Rp"
            :model-value="isFooterDiskonRpFocused ? footer.diskonRpInput : new Intl.NumberFormat('id-ID').format(footer.diskonRpInput || 0)"
            @update:model-value="footer.diskonRpInput = Number(String($event).replace(/[^0-9]/g, '')) || 0"
            @focus="isFooterDiskonRpFocused = true" @blur="isFooterDiskonRpFocused = false; onDiskonRpBlur()"
            placeholder="0" type="text" variant="outlined" density="compact" hide-details
            class="summary-field text-right font-weight-black text-subtitle-1" />

          <v-text-field label="Total" :model-value="new Intl.NumberFormat('id-ID').format(footer.total)" readonly
            variant="filled" density="compact" hide-details class="summary-field text-right font-weight-bold" />

          <v-text-field label="Grand Total" :model-value="new Intl.NumberFormat('id-ID').format(footer.grandTotal)"
            readonly variant="filled" density="compact" hide-details
            class="summary-field text-right font-weight-bold" />
        </div>
      </div>

      <div class="desktop-form-section right-column">
        <div class="scanner-wrapper">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
            placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
            prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan">
          </v-text-field>
        </div>
        <v-data-table :headers="tableHeaders" :items="items" density="compact"
          class="desktop-table vertically-aligned-table" fixed-header :items-per-page="-1">
          <template #[`item.kode`]="{ item, index }">
            <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details placeholder="F1/F2..."
              @keydown.f1.prevent="openProductSearch(index, false)"
              @keydown.f2.prevent="openProductSearch(index, true)"></v-text-field>
          </template>

          <template #[`item.nama`]="{ item }">
            <div class="scrollable-cell">{{ item.nama }}</div>
          </template>

          <template #[`item.stok`]="{ item }">
            <v-text-field :model-value="item.stok" variant="underlined" density="compact" hide-details readonly
              single-line class="text-right" :disabled="!item.kode"></v-text-field>
          </template>

          <template #[`item.jumlah`]="{ item }">
            <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" dense hide-details single-line
              class="text-right" :disabled="!item.kode"></v-text-field>
          </template>

          <template #[`item.harga`]="{ item }">
            <v-text-field
              :model-value="focusedRowId === item.id ? item.harga : new Intl.NumberFormat('id-ID').format(item.harga || 0)"
              @update:model-value="item.harga = Number(String($event).replace(/[^0-9]/g, '')) || 0"
              @focus="focusedRowId = item.id" @blur="focusedRowId = -1" placeholder="0" type="text" variant="underlined"
              dense hide-details single-line class="text-right" :disabled="!item.kode"
              :readonly="item.isHargaReadonly"></v-text-field>
          </template>

          <template #[`item.diskonPersen`]="{ item }">
            <v-text-field v-model.number="item.diskonPersen" type="number" variant="underlined" dense hide-details
              single-line class="text-right" @blur="handleItemDiscountChange(items.indexOf(item))"
              :disabled="!item.kode"></v-text-field>
          </template>

          <template #[`item.diskonRp`]="{ item }">
            <v-text-field
              :model-value="focusedRowId === item.id ? item.diskonRp : new Intl.NumberFormat('id-ID').format(item.diskonRp || 0)"
              @update:model-value="item.diskonRp = Number(String($event).replace(/[^0-9]/g, '')) || 0"
              @focus="focusedRowId = item.id" @blur="focusedRowId = -1; handleItemDiscountChange(items.indexOf(item))"
              placeholder="0" type="text" variant="underlined" dense hide-details single-line class="text-right"
              :disabled="!item.kode"></v-text-field>
          </template>

          <template #[`item.total`]="{ item }">
            <div class="text-caption font-weight-bold text-right">
              {{ new Intl.NumberFormat('id-ID').format(item.total) }}
            </div>
          </template>

          <template #[`item.actions`]="{ item }">
            <v-btn icon="mdi-delete" size="x-small" variant="text" color="error"
              @click="removeRow(items.indexOf(item))"></v-btn>
          </template>

          <!-- <template #[`item.noSoDtf`]="{ item, index }">
            <v-text-field v-model="item.noSoDtf" variant="underlined" density="compact" hide-details placeholder="F1..."
              @keydown.f1.prevent="openSoDtfSearch(index)">
            </v-text-field>
          </template> -->

          <template #[`item.noPengajuanHarga`]="{ item, index }">
            <v-text-field v-model="item.noPengajuanHarga" variant="underlined" density="compact" hide-details
              placeholder="F1..." @keydown.f1.prevent="openPriceProposalSearch(index)">
            </v-text-field>
          </template>
          <template #bottom>
            <div class="pa-1 text-right border-t"><v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus"
                variant="text" color="primary">Tambah Baris</v-btn></div>
          </template>
        </v-data-table>
      </div>
    </div>

    <!-- Modals -->
    <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="header.gudang.kode"
      @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
    <!-- <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''"
            @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" /> -->
    <ProductSearchModal v-if="isProductSearchVisible" :category="'Kaosan'" :source="'penawaran'"
      :gudang="header.gudang.kode" :multi="isMultiSelectProduct" @close="isProductSearchVisible = false"
      @products-selected="onProductsSelected" />
    <AuthorizationModal ref="authModalRef" v-if="isAuthModalVisible"
      :title="isEditingDiskonRp ? 'Otorisasi Diskon Faktur (Rp)' : 'Otorisasi Diskon Faktur (%)'"
      :challenge-code="challengeCode" @close="onAuthCancel" @success="onAuthSuccess" />
    <AuthorizationModal ref="ItemAuthModalRef" v-if="isItemAuthModalVisible" title="Otorisasi Diskon per Item"
      :challenge-code="challengeCode" @close="onItemAuthCancel" @success="onItemAuthSuccess" />
    <AuthorizationModal ref="auth2ModalRef" v-if="isAuth2ModalVisible" title="Otorisasi Ganti Diskon 2"
      :challenge-code="challengeCode" @close="onAuth2Cancel" @success="onAuth2Success" />
    <!-- <SoDtfSearchModal v-if="isSoDtfSearchVisible" :cabang="header.gudang.kode" :customerKode="header.customer?.kode"
      @close="isSoDtfSearchVisible = false" @selected="onSoDtfSelected" /> -->
    <PriceProposalSearchModal v-if="isPriceProposalSearchVisible" :cabang="header.gudang.kode"
      :customerKode="header.customer?.kode" @close="isPriceProposalSearchVisible = false"
      @selected="onPriceProposalSelected" />

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">
          Konfirmasi
        </v-card-title>
        <v-card-text>
          {{ confirmText }}
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">
            Tidak
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="executePendingAction">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isPrintConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">
          Simpan Berhasil
        </v-card-title>
        <v-card-text>
          Data penawaran {{ printConfirmNomor }} berhasil disimpan.
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
/* Background color untuk left column sections - tone biru langit */
.left-column .desktop-form-section.header-section {
  background-color: #e3f2fd;
  /* Biru langit Material Design */
}

.left-column .desktop-form-section.footer-section {
  background-color: #fff3e0;
  /* Orange muda untuk section summary/total */
}

/* Background color untuk right column */
.right-column.desktop-form-section {
  background-color: #e8f4f8;
  /* Biru langit lebih muda */
}

/* Existing styles - jangan diubah */
.desktop-table :deep(.scrollable-cell) {
  white-space: nowrap;
  overflow-x: auto;
  max-width: 450px;
  min-width: 300px;
}

.scanner-wrapper {
  max-width: 400px;
  flex: none;
  margin-bottom: 16px;
}

.summary-field :deep(input) {
  font-weight: 900 !important;
  font-size: 1.1rem !important;
  padding-top: 10px !important;
}

.vertically-aligned-table :deep(tbody tr td) {
  vertical-align: middle !important;
}
</style>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, PropType } from 'vue';
import { useToast } from 'vue-toastification';
import api from '@/services/api';
import { useRouter } from 'vue-router';
import RekeningSearchModal from '../lookup/RekeningSearchModal.vue';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
import PrintOptionModal from './PrintOptionModal.vue';
import ReturJualSearchModal from '@/components/lookup/ReturJualSearchModal.vue';
import type { AxiosError } from 'axios';
import { formatRupiah } from "@/utils/formatRupiah";

interface BankAccount {
  kode: string;
  nama: string;
  rekening: string;
}
interface InvoiceItem {
  kode: string;
  [key: string]: unknown;
}

interface PrintKasirHeader {
  inv_nomor: string;
  created: string;
  user_create: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  gdg_inv_instagram?: string;
  gdg_inv_fb?: string;
  pro_lipat?: string;
  inv_kembali?: number;
  summary: Partial<{
    subTotal: number;
    diskon: number;
    ppn: number;
    netto: number;
    biayaKirim: number;
    dp: number;
    grandTotal: number;
    bayar: number;
    pundiAmal: number;
    kembali: number;
  }>;
}

interface PrintKasirDetail {
  invd_kode: string;
  nama_barang: string;
  invd_ukuran: string;
  invd_jumlah: number;
  invd_harga: number;
  total: number;

  // === new fields from backend ===
  harga_setelah_diskon?: number;
  harga_asli?: number;
  diskonRp?: number;

  // existing optional
  invd_diskon?: number;
  invd_harga_asli?: number;
  total_asli?: number;
}

interface PrintKasirData {
  header: PrintKasirHeader;
  details: PrintKasirDetail[];
}

interface LinkedDp {
  nomor: string;     // WAJIB: nomor DP (sh_nomor)
  nominal: number;   // sisa nominal
  isNew?: boolean;   // optional, untuk DP baru
}

interface KaryawanSearchResult {
  kar_nik: string;
  kar_nama: string;
  kar_alamat?: string; // Tanda ? artinya optional (bisa null/undefined)
}

// Interface untuk State Payment yang ada di reactive()
interface PaymentState {
  tunai: number;
  voucher: { nomor: string; nominal: number };
  transfer: {
    nominal: number | null;
    akun: { kode: string; nama: string; rekening: string };
    tanggal: string;
  };
  retur: { nomor: string; nominal: number };
  pundiAmal: number;
  pinBelumLunas?: string;
}

// Interface untuk Payload (Extend dari State + Field Tambahan)
interface PaymentPayload extends PaymentState {
  jenis: string;
  nikKaryawan?: string;  // Optional (?) agar bisa di-delete atau undefined
  namaKaryawan?: string; // Optional (?)
}

interface AuthDialogState {
  show: boolean;
  title: string;
  jenis: string;
  nominal: number;
  transaksi: string; // Tambahkan ini agar modal tahu ID transaksinya
  onSuccess: ((data: { authNomor: string, approver: string }) => void) | null;
  onCancel: (() => void) | null;
}

const props = defineProps({
  invoiceHeader: { type: Object, required: true },
  invoiceItems: { type: Array, required: true },
  totals: { type: Object, required: true },
  authPins: { type: Object, required: true },
  linkedDps: { type: Array as PropType<LinkedDp[]>, required: false },
});

const emit = defineEmits(['close', 'save-success']);

const toast = useToast();
const router = useRouter();

// --- State ---
const payment = reactive({
  tunai: 0,
  voucher: { nomor: '', nominal: 0 },
  transfer: { nominal: null as number | null, akun: { kode: '', nama: '', rekening: '' }, tanggal: new Date().toISOString().substring(0, 10) },
  retur: { nomor: '', nominal: 0 },
  pundiAmal: 0,
  pinBelumLunas: ''
});

// [BARU] State untuk Potong Gaji
const KODE_CUSTOMER_TRIGGER = 'K-01126';
const paymentTab = ref('umum'); // 'umum' | 'karyawan'
// State untuk Pencarian Karyawan
const karyawanList = ref<KaryawanSearchResult[]>([]);
const isSearchingKaryawan = ref(false);
const karyawan = reactive({
  nik: null as KaryawanSearchResult | null,
  nama: '',
  alamat: '',
  limitTotal: 0,
  terpakai: 0,
  sisaLimit: 0,
  isValid: false,
  isLoading: false,
  message: '',
});
const LIMIT_KARYAWAN = 500000;

onMounted(() => {
  if (props.invoiceHeader.customer.kode === KODE_CUSTOMER_TRIGGER) {
    paymentTab.value = 'karyawan';
  } else {
    paymentTab.value = 'umum';
  }
});

function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

const isSaving = ref(false);
const dialogs = reactive({
  rekeningSearch: false,
  returJualSearch: false,
});

const authDialog = reactive<AuthDialogState>({
  show: false,
  title: '',
  jenis: '',
  nominal: 0,
  transaksi: '', // Init kosong
  onSuccess: null,
  onCancel: null
});

const temporaryPin = ref('');
const isPrintOptionVisible = ref(false);
const savedInvoiceNumber = ref('');
const isFromSO = !!props.invoiceHeader.nomorSo;
const isTunaiFocused = ref(false);
const isTransferFocused = ref(false);
const isKasirPreviewVisible = ref(false);
const printKasirData = ref<PrintKasirData | null>(null);
const isPrintingKasir = ref(false);

import Logo from '@/assets/logo.png';
import InstagramLogo from '@/assets/instagram.jpg';
import FacebookLogo from '@/assets/facebook.jpg';
const appLogo = Logo;
const igLogo = InstagramLogo;
const fbLogo = FacebookLogo;
const dtPundi = new Date('2024-06-01');
const maxPundi = 500;

// --- Computed Properties for Real-time Calculation ---
const dpTotal = computed(() => {
  if (!props.linkedDps) return 0;
  return props.linkedDps.reduce((s, d) => s + (d.nominal || 0), 0);
});

const totalBayar = computed(() => {
  return dpTotal.value +
    (payment.tunai || 0) +
    (payment.voucher.nominal || 0) +
    (payment.transfer.nominal ?? 0) +
    (payment.retur.nominal || 0);
});

const kembali = computed(() => {
  const grand = props.totals.grandTotal || 0;
  return Math.max(totalBayar.value - grand, 0);
});

const nettoKembali = computed(() => {
  return Math.max(kembali.value - (payment.pundiAmal || 0), 0);
});

// [BARU] Computed: Cek apakah over limit
const isOverLimit = computed(() => {
  const grandTotal = props.totals.grandTotal || 0;
  // Cek total belanja bulan ini + transaksi sekarang
  const totalAfterTransaction = karyawan.terpakai + grandTotal;
  return totalAfterTransaction > LIMIT_KARYAWAN;
});

// --- Methods ---
// const printStylesKasir = `
//   @page {
//     size: 58mm auto;
//     margin: 0;
//   }
//   body, html {
//     margin: 0;
//     padding: 0;
//     font-family: 'Roboto Mono', monospace;
//     font-size: 9pt;
//     color: black;
//   }
//   .receipt {
//     width: 58mm;
//     padding: 3mm 5mm;
//     box-sizing: border-box;
//   }
//   .text-center { text-align: center; }
//   .logo { max-width: 12mm; margin: 0 auto 5px; display: block; }
//   .info, .items, .summary, .footer {
//     border-top: 1px dashed black;
//     padding-top: 5px;
//     margin-top: 5px;
//   }
//   .item-details, .summary-item {
//     display: flex;
//     justify-content: space-between;
//   }
//   .grand-total { font-weight: bold; }
//   .social-media {
//     display: flex;
//     justify-content: center;
//     gap: 8px;
//     margin-top: 5px;
//     flex-wrap: wrap;
//   }
//   .social-item {
//     display: flex;
//     align-items: center;
//     gap: 3px;
//   }
//   .social-item img { height: 8px; }
// `;

// ===== Helpers untuk item diskon di struk ====
// const getOriginalTotal = (d: PrintKasirDetail): number => {
//   if (typeof d.total_asli === 'number') return d.total_asli;
//   return getOriginalUnitPrice(d) * d.invd_jumlah;
// };

// const isDiscounted = (d: PrintKasirDetail): boolean => {
//   const disc = getUnitDiscount(d);
//   const isEligible = disc > 0 || (typeof d.invd_harga_asli === 'number' && d.invd_harga_asli > d.invd_harga);

//   // Cek apakah promo berlaku kelipatan
//   const kelipatanAktif = printKasirData.value?.header?.pro_lipat === 'Y';

//   if (!kelipatanAktif && isEligible) {
//     promoAppliedCount++;
//     return promoAppliedCount <= 1; // hanya item pertama yang tampil promo
//   }

//   // Jika promo kelipatan, semua eligible
//   return isEligible;
// };

// --- Helper Function BARU ---
const requestAuthorization = (
  title: string,
  jenis: string,
  nominal: number,
  onSuccess: (data: { authNomor: string, approver: string }) => void,
  onCancel: () => void
) => {
  authDialog.title = title;
  authDialog.jenis = jenis;
  authDialog.nominal = nominal;
  // Gunakan IDREC atau NOMOR Invoice sebagai referensi transaksi
  authDialog.transaksi = props.invoiceHeader.nomor || 'NEW_TRX';

  authDialog.onSuccess = onSuccess;
  authDialog.onCancel = onCancel;
  authDialog.show = true;
};

// --- Handler BARU ---
const handleAuthSuccess = (data: { authNomor: string, approver: string }) => {
  toast.success(`Disetujui oleh ${data.approver}`);
  if (authDialog.onSuccess) {
    authDialog.onSuccess(data);
  }
  authDialog.show = false;
};

const handleAuthClose = () => {
  if (authDialog.onCancel) {
    authDialog.onCancel();
  }
  authDialog.show = false;
};

const onRekeningSelected = (rekening: BankAccount) => {
  payment.transfer.akun = rekening;
  dialogs.rekeningSearch = false;
};

const onReturSelected = (retur: { Nomor: string, Sisa: number }) => {
  payment.retur.nomor = retur.Nomor;
  // Logika Delphi: ambil nilai terkecil antara sisa retur dan sisa piutang
  const sisaPiutang = props.totals.sisaPiutang;
  payment.retur.nominal = Math.min(retur.Sisa, sisaPiutang);
  dialogs.returJualSearch = false;
};

// [UPDATE] Handle Final Save
const handleFinalSave = async () => {

  // 1. JIKA MODE POTONG GAJI
  if (paymentTab.value === 'karyawan') {
    if (!karyawan.nik || !karyawan.isValid) {
      return toast.error('Silakan input dan validasi NIK karyawan terlebih dahulu.');
    }

    // Cek Otorisasi Limit
    if (isOverLimit.value) {

      requestAuthorization(
        'Otorisasi Limit Karyawan',
        'LIMIT_KARYAWAN', // Jenis
        props.totals.grandTotal, // Nominal transaksi yang mau diajukan
        (authResult) => { // Callback Sukses (Approved)
          // Simpan nama approver ke temporaryPin agar tersimpan di backend
          temporaryPin.value = authResult.approver;
          executeSave();
        },
        () => toast.info('Transaksi dibatalkan.') // Callback Batal
      );
      return;
    }

    // Jika aman, langsung simpan
    await executeSave();
    return;
  }

  // 2. JIKA MODE UMUM (Logic Lama)
  if (payment.transfer.nominal > 0 && !payment.transfer.akun.kode) {
    return toast.error('Akun bank untuk transfer harus diisi.');
  }

  // BANDINGKAN TOTAL BAYAR DENGAN GRAND TOTAL INVOICE
  const totalTagihanFinal = props.totals.grandTotal;
  const totalBayarSekarang = totalBayar.value; // DP + Tunai + TF + dll

  if (totalBayarSekarang < totalTagihanFinal) {
    const sisaTagihan = totalTagihanFinal - totalBayarSekarang;

    requestAuthorization(
      'Otorisasi Invoice Belum Lunas',
      'PIUTANG',      // Jenis
      sisaTagihan,    // Nominal kekurangan
      (authResult) => {
        // Simpan nama approver sebagai bukti
        payment.pinBelumLunas = authResult.approver;
        temporaryPin.value = authResult.approver;
        executeSave();
      },
      () => toast.info('Penyimpanan dibatalkan.')
    );
  } else {
    payment.pinBelumLunas = '';
    temporaryPin.value = '';
    await executeSave();
  }
};

// [BARU] Method Check Karyawan
const checkKaryawan = async (nikParam?: string) => {
  const nikString = nikParam || (karyawan.nik && typeof karyawan.nik === 'object' ? karyawan.nik.kar_nik : karyawan.nik);

  if (!nikString) return;

  karyawan.isLoading = true;
  try {
    // Endpoint baru di backend
    const response = await api.get(`/hrd/karyawan/${nikString}`);
    const res = response.data; // { found, active, data: { nik, nama, terpakaiBulanIni, ... } }

    if (!res.found) {
      toast.error(res.message || 'Karyawan tidak ditemukan');
      resetKaryawanData();
      return;
    }
    if (!res.active) {
      toast.error('Status karyawan tidak aktif.');
      resetKaryawanData();
      return;
    }

    if (res.found && res.active) {
      const d = res.data;
      karyawan.nama = d.nama;
      karyawan.alamat = d.alamat;
      karyawan.terpakai = d.terpakaiBulanIni;
      karyawan.sisaLimit = d.sisaLimit;
      karyawan.isValid = true;

      toast.success(`Data karyawan ditemukan: ${d.nama}`);
    }

  } catch (error) {
    console.error(error);
    toast.error('Gagal mengecek data karyawan.');
    resetKaryawanData();
  } finally {
    karyawan.isLoading = false;
  }
};

const resetKaryawanData = () => {
  karyawan.nik = null; // [UBAH INI] Reset ke null
  karyawan.nama = '';
  karyawan.alamat = '';
  karyawan.limitTotal = 0;
  karyawan.terpakai = 0;
  karyawan.sisaLimit = 0;
  karyawan.isValid = false;
  karyawan.message = '';
};

// [TAMBAHAN PENTING]
// Pastikan saat modal dibuka atau tab berubah, datanya bersih.
// Tambahkan watcher pada paymentTab.
watch(paymentTab, (newTab) => {
  if (newTab === 'karyawan') {
    // Jika masuk tab karyawan tapi belum ada data yang valid, reset inputan.
    if (!karyawan.isValid) {
      resetKaryawanData();
    }
  }
});

// Method Search (Debounced)
// Ini dipanggil saat user mengetik di field NIK/Nama
const onSearchKaryawan = debounce(async (v: string) => {
  if (!v || v.length < 3) {
    karyawanList.value = [];
    return;
  }

  isSearchingKaryawan.value = true;
  try {
    const { data } = await api.get('/hrd/search', { params: { term: v } });
    karyawanList.value = data;
  } catch (err) {
    console.error(err);
  } finally {
    isSearchingKaryawan.value = false;
  }
}, 400); // Tunggu 400ms setelah user selesai mengetik

// Method saat Karyawan Dipilih dari List
const onSelectKaryawan = async (selected: KaryawanSearchResult | null) => {
  // 1. Jika tombol X ditekan (Clear), selected akan bernilai null
  if (!selected) {
    resetKaryawanData();
    return;
  }

  // 2. Update State manual
  // TypeScript sekarang tahu bahwa 'selected' punya properti 'kar_nama'
  karyawan.nama = selected.kar_nama;

  // 3. Panggil Validasi ke Backend
  // TypeScript juga tahu 'selected' punya properti 'kar_nik'
  await checkKaryawan(selected.kar_nik);
};

const executeSave = async () => {
  if (isSaving.value) return;
  isSaving.value = true; // Kunci tombol
  try {
    // [FIX 1] Gunakan tipe 'any' atau Interface baru untuk payload
    // agar bisa menambahkan properti 'jenis' dan 'nikKaryawan' tanpa error
    const paymentPayload: PaymentPayload = {
      ...payment,
      jenis: 'UMUM'
    };

    // [LOGIKA DATA KARYAWAN]
    if (paymentTab.value === 'karyawan') {
      paymentPayload.jenis = 'POTONG_GAJI';

      // Pastikan NIK dan Nama terisi
      if (!karyawan.nik || !karyawan.nama) {
        throw new Error("Data Karyawan belum lengkap.");
      }

      // Ambil NIK (handle jika object autocomplete atau string)
      const nikFixed = typeof karyawan.nik === 'object' ? karyawan.nik.kar_nik : karyawan.nik;

      paymentPayload.nikKaryawan = nikFixed;
      paymentPayload.namaKaryawan = karyawan.nama;

      // Reset nominal pembayaran lain agar nol
      paymentPayload.tunai = 0;
      paymentPayload.voucher = { nominal: 0, nomor: '' };
      paymentPayload.transfer = {
        nominal: 0,
        akun: { kode: '', nama: '', rekening: '' },
        tanggal: payment.transfer.tanggal
      };
      paymentPayload.retur = { nominal: 0, nomor: '' };

    } else {
      paymentPayload.jenis = 'UMUM';
      // Hapus nikKaryawan jika ada sisa (opsional, tapi bersih)
      delete paymentPayload.nikKaryawan;
      delete paymentPayload.namaKaryawan;
    }

    const kembalianBeforePundi = Math.max(totalBayar.value - props.totals.grandTotal, 0);

    const tunaiAfterChange = Math.max(
      Number(payment.tunai || 0) - kembalianBeforePundi,
      0
    );

    const cleanDps = (props.linkedDps || [])
      .filter((dp) => dp.nominal > 0)
      .map((dp) => ({
        nomor: dp.nomor,
        nominal: Number(dp.nominal)
      }));

    const payload = {
      header: props.invoiceHeader,
      items: (props.invoiceItems as InvoiceItem[]).filter((item) => item.kode),
      dps: cleanDps,
      // Gunakan paymentPayload yang sudah kita modifikasi di atas
      payment: {
        ...paymentPayload,

        // Pastikan field numerik ter-convert dengan benar
        tunai: Number(paymentPayload.tunai || 0),
        tunaiAfterChange,
        transfer: { ...paymentPayload.transfer, nominal: Number(paymentPayload.transfer.nominal || 0) },
        voucher: { ...paymentPayload.voucher, nominal: Number(paymentPayload.voucher.nominal || 0) },
        retur: { ...paymentPayload.retur, nominal: Number(paymentPayload.retur.nominal || 0) },

        bayarTotal: totalBayar.value,
        kembali: kembali.value,
        pinBelumLunas: temporaryPin.value
      },
      totals: {
        subTotal: props.totals.subTotal,
        totalDiskonItem: props.totals.totalDiskonItem || 0,
        totalDiskonFaktur: props.totals.totalDiskonFaktur || 0,
        totalDp: props.totals.totalDp || 0,
        netto: props.totals.subTotal - (props.totals.totalDiskonItem || 0) - (props.totals.totalDiskonFaktur || 0),
        grandTotal: props.totals.grandTotal,
        sisaPiutang: correctedSisaPiutang.value
      },
      pins: props.authPins,
      isNew: !props.invoiceHeader.nomor,
    };

    const response = await api.post('/invoice-form/save', payload);
    toast.success(response.data.message);
    savedInvoiceNumber.value = response.data.nomor;

    // Langsung buka print option setelah save
    if (isFromSO) {
      // Jika berasal dari SO → langsung cetak A4
      handlePrintSelection('a4');
    } else {
      // Jika bukan dari SO → tampilkan opsi print
      isPrintOptionVisible.value = true;
    }

  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal menyimpan invoice.');
  } finally {
    if (temporaryPin.value === '') {
      // Indikator sederhana bahwa proses selesai (error/batal), buka kunci
      isSaving.value = false;
    }
  }
}

const formatHpToWa = (hp: string) => {
  if (!hp) return '';
  let sanitizedHp = hp.replace(/[^0-9]/g, ''); // Hapus semua selain angka
  if (sanitizedHp.startsWith('0')) {
    sanitizedHp = '62' + sanitizedHp.substring(1); // Ganti 0 di depan dengan 62
  }
  return sanitizedHp;
};

const handlePrintSelection = async (type: 'a4' | 'kasir' | 'wa') => {
  isPrintOptionVisible.value = false;
  const nomor = savedInvoiceNumber.value;
  if (!nomor) return;

  if (type === 'a4') {
    const routeName = 'InvoicePrint';
    const url = router.resolve({ name: routeName, params: { nomor } }).href;
    window.open(url, '_blank');
    emit('save-success', savedInvoiceNumber.value);

  } else if (type === 'kasir') {
    isPrintingKasir.value = true;
    try {
      const response = await api.get(`/invoice-form/print-kasir/${nomor}`);
      printKasirData.value = response.data as PrintKasirData;

      if (printKasirData.value?.details) {
        // --- NORMALISASI DETAIL (TANPA ANY) ---
        printKasirData.value.details = printKasirData.value.details.map(
          (d: PrintKasirDetail): PrintKasirDetail => {
            const hargaSetelah = Number(d.harga_setelah_diskon ?? d.invd_harga ?? 0);
            const hargaAsli = Number(
              d.harga_asli ??
              d.invd_harga_asli ??
              (d.invd_harga ?? 0) + (d.invd_diskon ?? 0)
            );
            const diskonRp = Number(d.invd_diskon ?? d.diskonRp ?? 0);
            const qty = Number(d.invd_jumlah ?? 0);

            return {
              ...d,
              invd_harga: hargaSetelah,
              invd_harga_asli: hargaAsli,
              invd_diskon: diskonRp,
              total: d.total ?? hargaSetelah * qty,
            };
          }
        );

        // ------ NORMALISASI SUMMARY (TANPA ANY) ------
        const h: PrintKasirHeader = printKasirData.value.header;

        if (!h.summary) h.summary = {};

        const details = printKasirData.value.details;

        const fallbackSubTotal = details.reduce(
          (sum, d) =>
            sum + (Number(d.invd_harga) + Number(d.invd_diskon ?? 0)) * Number(d.invd_jumlah),
          0
        );

        const fallbackNetto = details.reduce(
          (sum, d) => sum + Number(d.invd_harga) * Number(d.invd_jumlah),
          0
        );

        const fallbackDiskon = Math.max(fallbackSubTotal - fallbackNetto, 0);

        const s = h.summary;

        s.subTotal = Number(s.subTotal ?? fallbackSubTotal);
        s.diskon = Number(s.diskon ?? fallbackDiskon);
        s.netto = Number(s.netto ?? (s.subTotal - s.diskon));
        s.biayaKirim = Number(s.biayaKirim ?? 0);
        s.grandTotal = Number(s.grandTotal ?? (s.netto + s.biayaKirim));
        s.bayar = Number(s.bayar ?? 0);
        const rawKembali = Number(printKasirData.value.header.inv_kembali ?? (s.bayar - s.grandTotal));
        s.pundiAmal = Number(s.pundiAmal ?? 0);

        // KEMBALI SETELAH DONASI
        s.kembali = rawKembali;
      }

      isKasirPreviewVisible.value = true;
    } catch {
      toast.error("Gagal memuat data struk.");
    } finally {
      isPrintingKasir.value = false;
    }
  } else if (type === 'wa') {
    const memberHp = props.invoiceHeader.Hp || props.invoiceHeader.memberHp;
    if (!memberHp) {
      emit('save-success', savedInvoiceNumber.value); // Tutup meski gagal
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
      const axiosError = error as AxiosError<{ message?: string }>;
      toast.error(axiosError.response?.data?.message || 'Gagal mengirim struk via WhatsApp.');
    }
    emit('save-success', savedInvoiceNumber.value);
  }
};

// Ganti method triggerBrowserPrint dengan ini
const triggerBrowserPrint = () => {
  // Tutup preview modal DULU sebelum print
  isKasirPreviewVisible.value = false;

  // Tunggu sebentar agar modal benar-benar tertutup
  setTimeout(() => {
    const printContentEl = document.getElementById('kasir-print-area');
    if (!printContentEl) {
      toast.error("Area cetak kasir tidak ditemukan.");
      return;
    }

    const contentToPrint = printContentEl.innerHTML;

    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;

    const printWindow = window.open(
      '',
      '_blank',
      `width=${screenWidth},height=${screenHeight},left=0,top=0`
    );
    if (!printWindow) {
      toast.error("Popup diblokir. Izinkan popup untuk mencetak.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Struk Kasir</title>
          <style>
            @page {
              size: 58mm auto;
              margin: 0;
            }
            body, html {
              margin: 0;
              padding: 0;
              font-family: 'Roboto Mono', monospace;
              font-size: 9pt;
              color: black;
            }
            .receipt {
              width: 58mm;
              padding: 3mm 5mm;
              box-sizing: border-box;
            }
            .text-center { text-align: center; }
            .logo { max-width: 12mm; margin: 0 auto 5px; display: block; }
            .info, .items, .summary, .footer {
              border-top: 1px dashed black;
              padding-top: 5px;
              margin-top: 5px;
            }
            .item-details, .summary-item {
              display: flex;
              justify-content: space-between;
            }
            .grand-total { font-weight: bold; }
            .social-media {
              display: flex;
              justify-content: center;
              gap: 8px;
              margin-top: 5px;
              flex-wrap: wrap;
            }
            .social-item {
              display: flex;
              align-items: center;
              gap: 3px;
            }
            .social-item img { height: 8px; }
            .donation-text {
              margin-top: 6px;
              margin-bottom: 6px;
              padding: 4px 0;
              text-align: center;
              font-size: 8pt;
              font-weight: bold;
              border-top: 1px dashed black;
              border-bottom: 1px dashed black;
          }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${contentToPrint}
        </body>
      </html>
    `);
    printWindow.document.close();

    // Emit save-success setelah print dialog muncul
    emit('save-success', savedInvoiceNumber.value);
  }, 100);
};

// Hapus atau comment closeKasirPreview, ganti dengan ini
const closeKasirPreview = () => {
  isKasirPreviewVisible.value = false;
  printKasirData.value = null;
  // Emit save-success saat user tutup preview tanpa cetak
  emit('save-success', savedInvoiceNumber.value);
};

const onPrintModalClose = () => {
  isPrintOptionVisible.value = false;
  // JANGAN emit 'save-success'.
  // Jika user Batal, kita hanya kembali ke modal pembayaran.
};

const validateVoucher = async () => {
  const voucherNo = payment.voucher.nomor;
  if (!voucherNo) {
    payment.voucher.nominal = 0; // Reset nominal jika field kosong
    return;
  }

  try {
    const response = await api.post('/invoice-form/validate-voucher', {
      voucherNo: voucherNo,
      invoiceNo: props.invoiceHeader.nomor, // Kirim nomor invoice saat ini
    });
    payment.voucher.nominal = response.data.nominal;
    toast.success('Voucher valid.');
  } catch (error: unknown) {
    payment.voucher.nominal = 0;

    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal memvalidasi voucher.');
  }
};

const calculatePundiAmal = (kembali: number) => {
  if (!kembali || kembali <= 0) return 0;

  // Tanggal mulai berlaku Pundi
  if (new Date() < dtPundi) return 0;

  // ambil 3 digit terakhir (RightStr(...,3) Delphi)
  const threeDigits = kembali % 1000;

  if (kembali >= maxPundi) {
    if (threeDigits >= maxPundi) {
      return threeDigits - maxPundi;
    }
    return threeDigits;
  }

  return kembali;
};

const hitungPundiAmal = (details: PrintKasirDetail[]) => {
  if (!details || details.length === 0) return 0;

  let totalQty = 0;
  for (const item of details) {
    totalQty += Number(item.invd_jumlah) || 0;
  }

  return totalQty * maxPundi;
};

const correctedSubTotal = computed(() => {
  return (props.invoiceItems as InvoiceItem[])
    .filter(i => i.kode)
    .reduce((sum, item) => {
      const qty = Number(item.jumlah || 0);
      const hargaAsli = Number(item.harga || 0);
      return sum + hargaAsli * qty;
    }, 0);
});

const correctedGrandTotal = computed(() => {
  return (
    correctedSubTotal.value
    - (props.totals.totalDiskonItem || 0)
    - (props.totals.totalDiskonFaktur || 0)
    + Number(props.invoiceHeader.biayaKirim || 0)
  );
});

const correctedSisaPiutang = computed(() => {
  return correctedGrandTotal.value - Number(props.totals.totalDp || 0);
});

const effectiveSisaPiutang = computed(() => {
  return isFromSO
    ? props.totals.sisaPiutang   // gunakan backend (benar)
    : correctedSisaPiutang.value; // default existing logic
});

const sisaPiutangDisplay = computed(() => {
  const baseSisa = effectiveSisaPiutang.value;
  // Kurangi dengan nominal retur, pastikan tidak minus
  return Math.max(baseSisa - (payment.retur.nominal || 0), 0);
});

watch(kembali, (newVal) => {
  payment.pundiAmal = calculatePundiAmal(newVal);
});
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="800px" persistent>
    <v-card>
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title>Form Pembayaran</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" />
      </v-toolbar>

      <v-card-text class="pa-4">
        <v-row>
          <v-col cols="12" md="5">
            <div class="desktop-form-section mb-4">
              <div class="text-subtitle-2 font-weight-bold mb-2">Ringkasan Invoice</div>
              <div class="d-flex justify-space-between text-caption">
                <span>Sub Total:</span>
                <span>{{ formatRupiah(correctedSubTotal) }}</span>
              </div>
              <div class="d-flex justify-space-between text-caption">
                <span>Total Diskon:</span>
                <span>- {{ formatRupiah(totals.totalDiskonItem + totals.totalDiskonFaktur) }}</span>
              </div>
              <div class="d-flex justify-space-between text-caption">
                <span>Total PPN:</span>
                <span>+ {{ formatRupiah(totals.totalPpn) }}</span>
              </div>
              <div class="d-flex justify-space-between text-caption">
                <span>Biaya Kirim:</span>
                <span>+ {{ formatRupiah(invoiceHeader.biayaKirim) }}</span>
              </div>
              <v-divider class="my-2" />
              <div class="d-flex justify-space-between font-weight-bold">
                <span>Grand Total:</span>
                <span>{{ formatRupiah(totals.grandTotal) }}</span>
              </div>
              <div class="d-flex justify-space-between text-caption">
                <span>Total DP:</span>
                <span>- {{ formatRupiah(totals.totalDp) }}</span>
              </div>
              <v-divider class="my-2" />
              <div class="d-flex justify-space-between font-weight-bold text-h6 text-primary">
                <span>Sisa Piutang:</span>
                <span>{{ formatRupiah(sisaPiutangDisplay) }}</span>
              </div>
            </div>

            <div class="desktop-form-section" style="background-color: #f7f9fc;">
              <div class="d-flex justify-space-between">
                <span class="text-subtitle-1">Total Bayar:</span>
                <span class="text-subtitle-1 font-weight-bold">{{ formatRupiah(totalBayar) }}</span>
              </div>
              <v-divider class="my-2" />
              <div class="d-flex justify-space-between text-body-2">
                <span>Kembali:</span>
                <span>{{ formatRupiah(kembali) }}</span>
              </div>
              <div class="d-flex justify-space-between text-body-2">
                <span>Pundi Amal:</span>
                <span>{{ formatRupiah(payment.pundiAmal) }}</span>
              </div>
              <div class="d-flex justify-space-between text-h6 font-weight-bold">
                <span>Netto Kembali:</span>
                <span>{{ formatRupiah(nettoKembali) }}</span>
              </div>
            </div>
          </v-col>

          <v-col cols="12" md="7">
            <div class="desktop-form-section">
              <div class="text-subtitle-2 font-weight-bold mb-2">
                Metode Pembayaran:
                <span class="text-primary">{{ paymentTab === 'karyawan' ? 'Potong Gaji Karyawan' : 'Umum (Tunai/TF)'
                  }}</span>
              </div>

              <v-alert v-if="paymentTab === 'karyawan'" color="info" variant="tonal" icon="mdi-account-tie" class="mb-4"
                density="compact">
                Mode Khusus: <strong>Potong Gaji Karyawan</strong>
              </v-alert>
              <v-window v-model="paymentTab" class="pt-2">
                <v-window-item value="umum">
                  <v-text-field label="Tunai" :model-value="isTunaiFocused
                    ? (payment.tunai === 0 ? '' : payment.tunai)
                    : formatRupiah(payment.tunai)
                    " @update:model-value="payment.tunai = Number(String($event).replace(/[^0-9]/g, '')) || 0"
                    @focus="isTunaiFocused = true" @blur="isTunaiFocused = false" type="text" variant="outlined"
                    density="compact" hide-details class="text-end">
                    <template #prepend-inner>
                      <span class="input-prefix">Rp</span>
                    </template>
                  </v-text-field>
                  <v-row dense class="mt-2">
                    <v-col cols="6"><v-text-field label="No. Voucher" v-model="payment.voucher.nomor" variant="outlined"
                        density="compact" hide-details @blur="validateVoucher" /></v-col>
                    <v-col cols="6">
                      <v-text-field label="Nominal Voucher" v-model.number="payment.voucher.nominal" type="number"
                        variant="outlined" min="0" density="compact" hide-details>
                        <template #prepend-inner>
                          <span class="input-prefix">Rp</span>
                        </template>
                      </v-text-field>
                    </v-col>
                  </v-row>
                  <v-divider class="my-3" />
                  <v-text-field label="Transfer / Card" :model-value="isTransferFocused
                    ? (payment.transfer.nominal === null ? '' : payment.transfer.nominal)
                    : formatRupiah(payment.transfer.nominal ?? 0)" @update:model-value="
                      payment.transfer.nominal = $event === '' ? null : Number(String($event).replace(/[^0-9]/g, ''))
                      " @focus="isTransferFocused = true" @blur="isTransferFocused = false" type="text"
                    variant="outlined" min="0" density="compact" hide-details class="text-end">
                    <template #prepend-inner>
                      <span class="input-prefix">Rp</span>
                    </template>
                  </v-text-field>
                  <v-text-field label="Akun Bank"
                    :model-value="`${payment.transfer.akun.kode || ''} - ${payment.transfer.akun.nama || ''}`" readonly
                    @click="dialogs.rekeningSearch = true" prepend-inner-icon="mdi-magnify" variant="outlined"
                    density="compact" hide-details />
                  <v-text-field label="Tgl. Transfer" v-model="payment.transfer.tanggal" type="date" variant="outlined"
                    density="compact" hide-details />
                  <v-divider class="my-3" />
                  <v-row dense>
                    <v-col cols="6"><v-text-field label="No. Retur" v-model="payment.retur.nomor" variant="outlined"
                        density="compact" hide-details readonly @click="dialogs.returJualSearch = true"
                        @keydown.f1.prevent="dialogs.returJualSearch = true"
                        prepend-inner-icon="mdi-magnify"></v-text-field>
                    </v-col>
                    <v-col cols="6"><v-text-field label="Nominal Retur" v-model.number="payment.retur.nominal"
                        type="number" min="0" variant="outlined" density="compact" hide-details>
                        <template #prepend-inner>
                          <span class="input-prefix">Rp</span>
                        </template>
                      </v-text-field>
                    </v-col>
                  </v-row>
                </v-window-item>
                <v-window-item value="karyawan">
                  <v-row dense>
                    <v-col cols="12">
                      <v-autocomplete label="Cari Karyawan (Ketik Nama / NIK)" placeholder="Ketik minimal 3 karakter..."
                        v-model="karyawan.nik" :items="karyawanList" :loading="isSearchingKaryawan"
                        item-title="kar_nama" item-value="kar_nik" variant="outlined" density="compact"
                        hide-details="auto" clearable no-filter return-object @update:search="onSearchKaryawan"
                        @update:model-value="onSelectKaryawan">
                        <template v-slot:item="{ props, item }">
                          <v-list-item v-bind="props" :title="item.raw.kar_nama" :subtitle="item.raw.kar_nik">
                            <template v-slot:prepend>
                              <v-icon icon="mdi-account-tie" color="primary"></v-icon>
                            </template>
                          </v-list-item>
                        </template>

                        <template v-slot:selection="{ item }">
                          <span class="text-body-2 text-high-emphasis text-truncate"
                            style="width: 100%; max-width: 100%; display: block;">
                            <strong>{{ item.raw.kar_nik }}</strong> - {{ item.raw.kar_nama }}
                          </span>
                        </template>
                      </v-autocomplete>
                    </v-col>

                    <v-col cols="12" v-if="karyawan.isValid">
                      <v-card variant="tonal" color="info" class="mt-2">
                        <v-card-text>
                          <div class="text-subtitle-2 font-weight-bold">{{ karyawan.nama }}</div>
                          <div class="text-caption mb-2">{{ karyawan.alamat }}</div>

                          <v-divider class="mb-2"></v-divider>

                          <div class="d-flex justify-space-between text-caption">
                            <span>Limit Bulanan:</span>
                            <strong>{{ formatRupiah(500000) }}</strong>
                          </div>
                          <div class="d-flex justify-space-between text-caption">
                            <span>Terpakai Bulan Ini:</span>
                            <strong>{{ formatRupiah(karyawan.terpakai) }}</strong>
                          </div>
                          <div class="d-flex justify-space-between text-caption mt-1">
                            <span>Transaksi Ini:</span>
                            <strong>{{ formatRupiah(totals.grandTotal) }}</strong>
                          </div>

                          <v-divider class="my-2"></v-divider>

                          <div class="d-flex justify-space-between font-weight-bold"
                            :class="isOverLimit ? 'text-red' : 'text-success'">
                            <span>Status Limit:</span>
                            <span>{{ isOverLimit ? 'MELEBIHI LIMIT (Butuh Otorisasi)' : 'AMAN' }}</span>
                          </div>
                        </v-card-text>
                      </v-card>
                    </v-col>
                  </v-row>
                </v-window-item>
              </v-window>
            </div>
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn @click="$emit('close')" :disabled="isSaving">Batal</v-btn>
        <v-btn color="primary" @click="handleFinalSave" :loading="isSaving" :disabled="isSaving"
          prepend-icon="mdi-check-circle" size="large">
          Simpan Pembayaran & Invoice
        </v-btn>
      </v-card-actions>
    </v-card>

    <RekeningSearchModal v-if="dialogs.rekeningSearch" :cabang="invoiceHeader.gudang.kode"
      @close="dialogs.rekeningSearch = false" @selected="onRekeningSelected" />
    <AuthorizationModal v-if="authDialog.show" :title="authDialog.title" :jenis="authDialog.jenis"
      :nominal="authDialog.nominal" :transaksi="authDialog.transaksi" @close="handleAuthClose"
      @success="handleAuthSuccess" />
    <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir', 'wa']" @close="onPrintModalClose"
      @select="handlePrintSelection" />
    <ReturJualSearchModal v-if="dialogs.returJualSearch" :customer-kode="invoiceHeader.customer.kode"
      :invoice-nomor="invoiceHeader.nomor" @close="dialogs.returJualSearch = false" @selected="onReturSelected" />
  </v-dialog>

  <v-dialog v-model="isKasirPreviewVisible" max-width="400px" persistent>
    <v-card>
      <v-toolbar color="blue-grey" density="compact">
        <v-toolbar-title class="text-subtitle-1">Pratinjau Struk Kasir</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="closeKasirPreview" />
      </v-toolbar>

      <v-card-text class="pa-4 bg-grey-lighten-3">
        <div id="kasir-print-area">
          <div v-if="printKasirData" class="receipt">
            <div class="header text-center">
              <img :src="appLogo" alt="Logo" class="logo" />
              <strong>{{ printKasirData.header.perush_nama }}</strong>
              <div>{{ printKasirData.header.perush_alamat }}</div>
              <div>{{ printKasirData.header.perush_telp }}</div>
            </div>
            <div class="info">
              <div>NoBon: {{ printKasirData.header.inv_nomor }}</div>
              <div>Tgl: {{ printKasirData.header.created }} {{ printKasirData.header.user_create }}</div>
            </div>
            <div class="items">
              <div v-for="item in printKasirData?.details" :key="item.invd_kode" class="item"
                :class="{ 'item-discounted': item.invd_diskon > 0 }">
                <div>{{ item.nama_barang }} ({{ item.invd_ukuran }})</div>

                <template v-if="item.invd_diskon > 0">
                  <div class="item-details discounted">
                    <span class="line-through">
                      {{ item.invd_jumlah }} x {{ formatRupiah(item.invd_harga + item.invd_diskon) }}
                    </span>
                    <span class="line-through">
                      {{ formatRupiah((item.invd_harga + item.invd_diskon) * item.invd_jumlah) }}
                    </span>
                  </div>
                  <div class="item-details">
                    <span>
                      {{ item.invd_jumlah }} x {{ formatRupiah(item.invd_harga) }}
                      <small class="discount-label">(Promo -{{ formatRupiah(item.invd_diskon) }}/pcs)</small>
                    </span>
                    <span>{{ formatRupiah(item.total) }}</span>
                  </div>
                </template>

                <template v-else>
                  <div class="item-details">
                    <span>{{ item.invd_jumlah }} x {{ formatRupiah(item.invd_harga) }}</span>
                    <span>{{ formatRupiah(item.total) }}</span>
                  </div>
                </template>
              </div>
            </div>
            <div class="summary">
              <div class="summary-item">
                <span>Total (Sebelum Diskon)</span>
                <span>{{ formatRupiah(printKasirData.header.summary.subTotal) }}</span>
              </div>


              <div v-if="printKasirData.header.summary.diskon > 0" class="summary-item">
                <span>Total Diskon</span>
                <span>-{{ formatRupiah(printKasirData.header.summary.diskon) }}</span>
              </div>


              <div class="summary-item">
                <span>Netto (Setelah Diskon)</span>
                <span>{{ formatRupiah(printKasirData.header.summary.netto) }}</span>
              </div>


              <div class="summary-item"><span>Biaya Kirim </span><span>{{
                formatRupiah(printKasirData.header.summary.biayaKirim) }}</span></div>


              <div class="summary-item grand-total"><span>Grand Total </span><span>{{
                formatRupiah(printKasirData.header.summary.grandTotal) }}</span></div>
              <div class="summary-item"><span>Bayar </span><span>{{ formatRupiah(printKasirData.header.summary.bayar)
                  }}</span></div>
              <div class="summary-item" v-if="printKasirData.header.summary.pundiAmal">
                <span>Pundi Amal </span>
                <span>{{ formatRupiah(printKasirData.header.summary.pundiAmal) }}</span>
              </div>
              <div class="summary-item"><span>Kembali </span><span>{{
                formatRupiah(printKasirData.header.summary.kembali)
                  }}</span></div>
            </div>
            <div class="footer text-center">
              <div class="donation-text">
                Dengan membeli produk kaosan ini, Kaosan telah menyisihkan/peduli dengan sesama yg membutuhkan
                sebesar Rp {{ formatRupiah(hitungPundiAmal(printKasirData.details)) }}
              </div>
              <div>BARANG YANG SUDAH DIBELI TIDAK BISA DIKEMBALIKAN</div>
              <div>TERIMAKASIH ATAS KUNJUNGAN ANDA</div>
              <div class="social-media">
                <div class="social-item">
                  <img :src="igLogo" alt="Instagram" />
                  <span>{{ printKasirData.header.gdg_inv_instagram }}</span>
                </div>
                <div class="social-item">
                  <img :src="fbLogo" alt="Facebook" />
                  <span>{{ printKasirData.header.gdg_inv_fb }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="pa-4 dialog-footer">
        <v-spacer />
        <v-btn variant="text" @click="closeKasirPreview">Tutup</v-btn>
        <v-btn color="primary" @click="triggerBrowserPrint" prepend-icon="mdi-printer">
          Cetak Struk
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Menargetkan semua komponen di dalam kartu dialog */
.v-card :deep(.v-label) {
  font-size: 11px !important;
}

.v-card :deep(input),
.v-card :deep(textarea),
.v-card :deep(.v-select__selection-text) {
  font-size: 11px !important;
}

/* Mengatur jarak antar field agar lebih rapat */
.desktop-form-section :deep(.v-input) {
  margin-bottom: 8px !important;
}

/* Merapikan tampilan summary total */
.totals-summary {
  background-color: #f7f9fc;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.input-prefix {
  font-size: 11px;
  color: #555;
  margin-right: 8px;
  align-self: center;
  /* Memastikan 'Rp' di tengah secara vertikal */
}

.text-end :deep(input) {
  text-align: right;
}

.item-discounted {
  margin-bottom: 2px;
}

.item-details.discounted {
  color: #888;
  font-size: 8pt;
}

.line-through {
  text-decoration: line-through;
}

.discount-label {
  color: #c62828;
  font-weight: bold;
  font-size: 8pt;
  margin-left: 3px;
}

.summary-item span:first-child {
  color: #444;
}

.summary-item span:last-child {
  font-weight: 500;
}

.summary-item:nth-child(2) span:last-child {
  color: #c62828;
  /* Merah untuk diskon */
}

.summary-item:nth-child(3) span:last-child {
  color: #2e7d32;
  /* Hijau untuk netto */
}
</style>

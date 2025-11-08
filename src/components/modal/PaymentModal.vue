<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
import api from '@/services/api';
import { useRouter } from 'vue-router';
import RekeningSearchModal from '../lookup/RekeningSearchModal.vue';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
import PrintOptionModal from './PrintOptionModal.vue';
import ReturJualSearchModal from '@/components/lookup/ReturJualSearchModal.vue';
import SatisfactionSurveyModal from '@/components/modal/SatisfactionSurveyModal.vue';
import type { AxiosError } from 'axios';

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
  summary: {
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
  };
}

interface PrintKasirDetail {
  invd_kode: string;
  nama_barang: string;
  invd_ukuran: string;
  invd_jumlah: number;
  invd_harga: number;
  total: number;
}

interface PrintKasirData {
  header: PrintKasirHeader;
  details: PrintKasirDetail[];
}

const props = defineProps({
  invoiceHeader: { type: Object, required: true },
  invoiceItems: { type: Array, required: true },
  totals: { type: Object, required: true },
  authPins: { type: Object, required: true },
  linkedDps: { type: Object, required: false },
});

const emit = defineEmits(['close', 'save-success']);

const toast = useToast();
const router = useRouter();

// --- State ---
const payment = reactive({
  tunai: 0,
  voucher: { nomor: '', nominal: 0 },
  transfer: { nominal: 0, akun: { kode: '', nama: '', rekening: '' }, tanggal: new Date().toISOString().substring(0, 10) },
  retur: { nomor: '', nominal: 0 },
  pundiAmal: 0,
});

const isSaving = ref(false);
const dialogs = reactive({
  rekeningSearch: false,
  returJualSearch: false,
});

const authDialog = reactive({
  show: false,
  title: 'Otorisasi Invoice Belum Lunas',
  challengeCode: '',
});
const authModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const temporaryPin = ref('');
const authOnSuccess = ref<null | ((pin: string) => void)>(null);
const authOnCancel = ref<null | (() => void)>(null);
const isPrintOptionVisible = ref(false);
const savedInvoiceNumber = ref('');
const isSurveyVisible = ref(false);
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

// --- Computed Properties for Real-time Calculation ---
const totalBayar = computed(() => {
  return (payment.tunai || 0) + (payment.voucher.nominal || 0) + (payment.transfer.nominal || 0) + (payment.retur.nominal || 0);
});

const kembali = computed(() => {
  const sisa = props.totals.sisaPiutang || 0;
  const bayar = totalBayar.value;
  return bayar > sisa ? bayar - sisa : 0;
});

const nettoKembali = computed(() => {
  const sisaKembalian = kembali.value;
  return sisaKembalian >= 1000 ? sisaKembalian : 0;
});

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

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

const handleFinalSave = async () => {
  // Validasi frontend sebelum lanjut
  if (payment.transfer.nominal > 0 && !payment.transfer.akun.kode) {
    return toast.error('Akun bank untuk transfer harus diisi.');
  }

  // Cek apakah pembayaran kurang dari tagihan
  if (totalBayar.value < props.totals.sisaPiutang) {
    // Jika kurang, panggil modal otorisasi
    requestAuthorization(
      'Otorisasi Invoice Belum Lunas',
      (pin) => { // Fungsi yang akan dijalankan jika otorisasi berhasil
        temporaryPin.value = pin; // Simpan PIN untuk dikirim ke backend
        executeSave();
      },
      () => { // Fungsi jika dibatalkan
        toast.info('Penyimpanan dibatalkan.');
      }
    );
  } else {
    // Jika lunas, langsung simpan
    await executeSave();
  }
};

const requestAuthorization = (
  title: string,
  onSuccess: (pin: string) => void,
  onCancel: () => void
) => {
  authDialog.challengeCode = Math.floor(100 + Math.random() * 900).toString();
  authDialog.title = title;
  authOnSuccess.value = onSuccess;
  authOnCancel.value = onCancel;
  authDialog.show = true;
};

const handleAuthSuccess = async (pin: string) => {
  try {
    await api.post('/otorisasi/validate-pin', {
      pin,
      challengeCode: authDialog.challengeCode
    });
    toast.success('Otorisasi berhasil.');
    authDialog.show = false;
    temporaryPin.value = pin;

    await executeSave();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const err = error as { response?: { data?: { message?: string } } };
      authModalRef.value?.setFailed(err.response?.data?.message || 'PIN tidak valid');
    } else {
      authModalRef.value?.setFailed('Terjadi kesalahan.');
    }
  }
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: props.invoiceHeader,
      items: (props.invoiceItems as InvoiceItem[]).filter((item) => item.kode),
      dps: props.linkedDps,
      payment: {
        ...payment,
        pinBelumLunas: temporaryPin.value // Sertakan PIN jika ada
      },
      totals: props.totals,
      pins: props.authPins,
      isNew: !props.invoiceHeader.nomor,
    };

    const response = await api.post('/invoice-form/save', payload);
    toast.success(response.data.message);
    savedInvoiceNumber.value = response.data.nomor;

    isSurveyVisible.value = true;

  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal menyimpan invoice.');
  } finally {
    isSaving.value = false;
    temporaryPin.value = ''; // Reset PIN
  }
}

const handleSurveySubmit = async (rating: number) => {
  isSurveyVisible.value = false;
  const nomor = savedInvoiceNumber.value;

  try {
    await api.post('/invoice-form/save-satisfaction', { nomor, rating });
    toast.success('Terima kasih atas masukan Anda!');
  } catch {
    toast.error('Gagal menyimpan hasil survey.');
  }

  try {
    const printables = await api.get(`/invoice-form/check-printables/${nomor}`);

    if (printables.data.needsPrintKupon) {
      const kuponUrl = router.resolve({ name: 'CetakKupon', params: { nomor } }).href;
      window.open(kuponUrl, '_blank');
    }
    if (printables.data.needsPrintVoucher) {
      const voucherUrl = router.resolve({ name: 'CetakVoucher', params: { nomor } }).href;
      window.open(voucherUrl, '_blank');
    }
  } catch {
    toast.error('Gagal memeriksa data kupon/voucher.');
  }

  // Tampilkan print options
  if (isFromSO) {
    // Jika dari SO, langsung cetak A4
    handlePrintSelection('a4');
  } else {
    // Penjualan langsung → tampilkan pilihan print
    isPrintOptionVisible.value = true;
  }
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
  isPrintOptionVisible.value = false;
  const nomor = savedInvoiceNumber.value;
  if (!nomor) return;

  if (type === 'a4') {
    const routeName = 'InvoicePrint';
    const url = router.resolve({ name: routeName, params: { nomor } }).href;
    window.open(url, '_blank');
    emit('save-success', savedInvoiceNumber.value);

  } else if (type === 'kasir') {
    // [LOGIKA BARU] Buka Pratinjau Dialog
    isPrintingKasir.value = true;
    try {
      const response = await api.get(`/invoice-form/print-kasir/${nomor}`);
      printKasirData.value = response.data;
      isKasirPreviewVisible.value = true; // Buka modal preview
    } catch {
      toast.error("Gagal memuat data struk.");
    } finally {
      isPrintingKasir.value = false;
    }
    // 'onPrintModalClose()' akan dipanggil saat dialog pratinjau ditutup

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
  isKasirPreviewVisible.value = false;

  setTimeout(() => {
    const printContentEl = document.getElementById('kasir-print-area');
    if (!printContentEl) {
      toast.error("Area cetak kasir tidak ditemukan.");
      return;
    }

    const contentToPrint = printContentEl.innerHTML;

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      toast.error("Popup diblokir. Izinkan popup untuk mencetak.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Struk Kasir</title>
          <meta charset="UTF-8">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            @page {
              size: 58mm auto;
              margin: 0;
            }

            @media print {
              html, body {
                width: 58mm;
                margin: 0 !important;
                padding: 0 !important;
              }
            }

            body {
              width: 58mm;
              margin: 0;
              padding: 0;
              font-family: 'Courier New', 'Courier', monospace;
              font-size: 8pt;
              line-height: 1.3;
              color: #000;
              background: white;
            }

            .receipt {
              width: 100%;
              padding: 2mm 3mm;
              box-sizing: border-box;
            }

            .text-center {
              text-align: center;
            }

            .logo {
              max-width: 15mm;
              height: auto;
              margin: 2mm auto;
              display: block;
            }

            .header {
              margin-bottom: 3mm;
            }

            .header strong {
              font-size: 9pt;
              display: block;
              margin: 1mm 0;
            }

            .header div {
              font-size: 7pt;
              line-height: 1.2;
            }

            .info, .items, .summary, .footer {
              border-top: 1px dashed #000;
              padding-top: 2mm;
              margin-top: 2mm;
            }

            .info div {
              font-size: 7pt;
              margin: 0.5mm 0;
            }

            .item {
              margin-bottom: 2mm;
              font-size: 7pt;
            }

            .item > div:first-child {
              font-weight: bold;
              margin-bottom: 0.5mm;
            }

            .item-details, .summary-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 2mm;
            }

            .summary-item {
              font-size: 7pt;
              margin: 1mm 0;
            }

            .grand-total {
              font-weight: bold;
              font-size: 8pt;
              margin: 2mm 0;
              padding: 1mm 0;
            }

            .footer {
              margin-top: 3mm;
            }

            .footer div {
              font-size: 6pt;
              line-height: 1.3;
              margin: 1mm 0;
            }

            .donation-text {
              font-size: 6pt;
              margin-bottom: 2mm;
              line-height: 1.4;
            }

            .social-media {
              display: flex;
              justify-content: center;
              align-items: center;
              gap: 3mm;
              margin-top: 2mm;
              flex-wrap: wrap;
            }

            .social-item {
              display: flex;
              align-items: center;
              gap: 1mm;
              font-size: 6pt;
            }

            .social-item img {
              height: 3mm;
              width: auto;
            }

            /* Prevent page breaks */
            .receipt, .receipt * {
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${contentToPrint}
        </body>
      </html>
    `);
    printWindow.document.close();

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

watch(nettoKembali, () => {
  const sisaKembalian = kembali.value;
  payment.pundiAmal = (sisaKembalian > 0 && sisaKembalian < 1000) ? sisaKembalian : 0;
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
                <span>{{ formatRupiah(totals.subTotal) }}</span>
              </div>
              <div class="d-flex justify-space-between text-caption">
                <span>Total Diskon:</span>
                <span>- {{ formatRupiah(totals.totalDiskonFaktur) }}</span>
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
                <span>{{ formatRupiah(totals.sisaPiutang) }}</span>
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
              <div class="text-subtitle-2 font-weight-bold mb-2">Input Pembayaran</div>
              <v-text-field label="Tunai" :model-value="isTunaiFocused ? payment.tunai : formatRupiah(payment.tunai)"
                @update:model-value="payment.tunai = Number(String($event).replace(/[^0-9]/g, '')) || 0"
                @focus="isTunaiFocused = true" @blur="isTunaiFocused = false" type="text" min="0" variant="outlined"
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
              <v-text-field label="Transfer / Card"
                :model-value="isTransferFocused ? payment.transfer.nominal : formatRupiah(payment.transfer.nominal)"
                @update:model-value="payment.transfer.nominal = Number(String($event).replace(/[^0-9]/g, '')) || 0"
                @focus="isTransferFocused = true" @blur="isTransferFocused = false" type="text" variant="outlined"
                min="0" density="compact" hide-details class="text-end">
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
                <v-col cols="6"><v-text-field label="Nominal Retur" v-model.number="payment.retur.nominal" type="number"
                    min="0" variant="outlined" density="compact" hide-details>
                    <template #prepend-inner>
                      <span class="input-prefix">Rp</span>
                    </template>
                  </v-text-field>
                </v-col>
              </v-row>
            </div>
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn @click="$emit('close')" :disabled="isSaving">Batal</v-btn>
        <v-btn color="primary" @click="handleFinalSave" :loading="isSaving" prepend-icon="mdi-check-circle"
          size="large">
          Simpan Pembayaran & Invoice
        </v-btn>
      </v-card-actions>
    </v-card>

    <RekeningSearchModal v-if="dialogs.rekeningSearch" :cabang="invoiceHeader.gudang.kode"
      @close="dialogs.rekeningSearch = false" @selected="onRekeningSelected" />
    <AuthorizationModal v-if="authDialog.show" ref="authModalRef" :title="authDialog.title"
      :challenge-code="authDialog.challengeCode" @close="authDialog.show = false" @success="handleAuthSuccess" />
    <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir', 'wa']" @close="onPrintModalClose"
      @select="handlePrintSelection" />
    <ReturJualSearchModal v-if="dialogs.returJualSearch" :customer-kode="invoiceHeader.customer.kode"
      :invoice-nomor="invoiceHeader.nomor" @close="dialogs.returJualSearch = false" @selected="onReturSelected" />
    <SatisfactionSurveyModal v-if="isSurveyVisible" @close="isSurveyVisible = false" @submit="handleSurveySubmit" />
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
              <div v-for="item in printKasirData.details" :key="item.invd_kode" class="item">
                <div>{{ item.nama_barang }} ({{ item.invd_ukuran }})</div>
                <div class="item-details">
                  <span>{{ item.invd_jumlah }} x {{ formatRupiah(item.invd_harga) }}</span>
                  <span>{{ formatRupiah(item.total) }}</span>
                </div>
              </div>
            </div>
            <div class="summary">
              <div class="summary-item"><span>Total </span><span>{{ formatRupiah(printKasirData.header.summary.subTotal)
              }}</span></div>
              <div class="summary-item"><span>Diskon </span><span>{{ formatRupiah(printKasirData.header.summary.diskon)
              }}</span></div>
              <div class="summary-item"><span>Ppn </span><span>{{ formatRupiah(printKasirData.header.summary.ppn)
              }}</span></div>
              <div class="summary-item"><span>Netto </span><span>{{ formatRupiah(printKasirData.header.summary.netto)
              }}</span></div>
              <div class="summary-item"><span>Biaya Kirim </span><span>{{
                formatRupiah(printKasirData.header.summary.biayaKirim) }}</span></div>
              <div class="summary-item"><span>Dp </span><span>{{ formatRupiah(printKasirData.header.summary.dp)
              }}</span>
              </div>
              <div class="summary-item grand-total"><span>Grand Total </span><span>{{
                formatRupiah(printKasirData.header.summary.grandTotal) }}</span></div>
              <div class="summary-item"><span>Bayar </span><span>{{ formatRupiah(printKasirData.header.summary.bayar)
              }}</span></div>
              <div class="summary-item"><span>Pundi amal </span><span>{{
                formatRupiah(printKasirData.header.summary.pundiAmal) }}</span></div>
              <div class="summary-item"><span>Kembali </span><span>{{
                formatRupiah(printKasirData.header.summary.kembali)
                  }}</span></div>
            </div>
            <div class="footer text-center">
              <div v-if="printKasirData.header.summary.pundiAmal > 0" class="donation-text">
                Dengan membeli produk kaosan ini, Kaosan telah menyisihkan/peduli dengan sesama yg membutuhkan
                sebesar {{ formatRupiah(printKasirData.header.summary.pundiAmal) }}
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
</style>

<script setup lang="ts">
import { ref, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import RekeningSearchModal from '../lookup/RekeningSearchModal.vue';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';
import { formatRupiah } from "@/utils/formatRupiah";

interface Rekening {
  kode: string;
  nama: string;
  rekening: string;
}

interface PrintHeader {
  sh_jenis: number;
  sh_nomor: string;
  sh_tanggal: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  cus_nama: string;
  cus_alamat: string;
  cus_kota: string;
  cus_telp: string;
  sh_nominal: number;
  sh_ket: string;
  sh_norek?: string;
  rek_nama?: string;
  sh_tgltransfer?: string;
  terbilang: string;
}

interface NewDpItem {
  nomor: string;
  jenis: string;
  nominal: number;
  posting: string;
}

// --- Inisialisasi ---
const toast = useToast();
const authStore = useAuthStore();
const appLogo = Logo;

// --- Computed ---
const kekuranganDp = computed(() => {
  const kurang = props.minimalDp - props.existingDp;
  return kurang > 0 ? kurang : 0; // Pastikan tidak negatif
});

const documentTitle = computed(() => {
  if (!printHeaderData.value) return '';
  switch (printHeaderData.value.sh_jenis) {
    case 0: return 'CASH RECEIPT';
    case 1: return 'TRANSFER RECEIPT';
    case 2: return 'GIRO RECEIPT';
    default: return 'TANDA TERIMA PEMBAYARAN';
  }
});

const props = defineProps({
  customerKode: { type: String, required: true },
  minimalDp: { type: Number, default: 0 },
  existingDp: { type: Number, default: 0 },
  existingDpNomor: { type: String, default: "" },
  nomorSo: { type: String, required: true }
});
const emit = defineEmits(['close', 'dp-saved']);

const dpData = ref({
  tanggal: new Date().toISOString().substring(0, 10),
  jenis: 'TUNAI',
  nominal: 0,
  keterangan: 'DP',
  bankData: {
    akun: '',
    namaBank: '',
    norek: '',
    tglTransfer: new Date().toISOString().substring(0, 10),
  },
  giroData: {
    noGiro: '',
    tglGiro: new Date().toISOString().substring(0, 10),
    tglJatuhTempo: new Date().toISOString().substring(0, 10),
  }
});
const isSaving = ref(false);
const isRekeningSearchVisible = ref(false);
const isNominalFocused = ref(false); // Dari revisi separator sebelumnya
const isPrintPreviewVisible = ref(false); // Mengontrol dialog preview
const isPrinting = ref(false); // Loading untuk mengambil data cetak
const printHeaderData = ref<PrintHeader | null>(null); // Menyimpan data cetak
const newDpFromSave = ref<NewDpItem | null>(null); // Menyimpan data newDp untuk di-emit nanti

const save = async () => {
  if ((dpData.value.nominal || 0) === 0 && props.existingDpNomor) {
    try {
      const res = await api.post('/so-form/delete-dp', {
        nomor: props.existingDpNomor
      });
      toast.success(res.data.message || "DP berhasil dihapus.");

      emit("dp-saved", null);  // kasih tahu parent untuk refresh list DP
      emit("close");
      return; // STOP — jangan lanjut ke proses simpan DP baru
    } catch (err) {
      toast.error("Gagal menghapus DP.", err);
      return;
    }
  }
  // --- (Validasi Anda sebelumnya tetap di sini) ---
  const nominal = dpData.value.nominal || 0;
  if (nominal < kekuranganDp.value) {
    toast.warning(
      `DP kurang dari minimal (${formatRupiah(kekuranganDp.value)}). SO masih akan berstatus PASIF.`
    );
  }
  if ((dpData.value.nominal || 0) <= 0) {
    return toast.error('Nominal harus diisi.');
  }
  if (dpData.value.jenis === 'TRANSFER' && !dpData.value.bankData.akun) {
    return toast.error('Akun Bank harus dipilih.');
  }
  if (dpData.value.jenis === 'GIRO' && !dpData.value.giroData.noGiro) {
    return toast.error('No. Giro harus diisi.');
  }
  // --- Akhir Validasi ---

  isSaving.value = true;
  try {
    // 1. Simpan DP
    const payload = { ...dpData.value, customerKode: props.customerKode, nomorSo: props.nomorSo };
    const saveResponse = await api.post('/so-form/save-dp', payload);
    toast.success(saveResponse.data.message);

    const newDp = saveResponse.data.newDp;
    newDpFromSave.value = newDp; // Simpan data newDp untuk di-emit nanti

    // --- HAPUS LOGIKA 'window.open' LAMA DARI SINI ---
    // if (newDp && newDp.nomor) {
    //   const url = router.resolve({ ... });
    //   window.open(url, '_blank'); // <-- INI YANG MENYEBABKAN 4 SALINAN
    // }
    // emit('dp-saved', response.data.newDp);
    // emit('close');
    // --- AKHIR PENGHAPUSAN ---

    // 2. Alih-alih menutup, kita siapkan data cetak
    isSaving.value = false;
    isPrinting.value = true; // Tampilkan loading 'Memuat Pratinjau...'

    // 3. Panggil API data cetak
    const printResponse = await api.get(`/so-form/print-data/dp/${newDp.nomor}`);
    printHeaderData.value = printResponse.data;

    // 4. Tampilkan dialog pratinjau cetak
    isPrinting.value = false;
    isPrintPreviewVisible.value = true;

  } catch (error: unknown) {
    if (error && typeof error === "object" && "response" in error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Gagal menyimpan DP.");
    } else {
      toast.error("Gagal menyimpan DP.");
    }
    isSaving.value = false;
    isPrinting.value = false;
  }
};

const onNominalFocus = () => {
  isNominalFocused.value = true;
  if (dpData.value.nominal === 0) dpData.value.nominal = null;
};

const onNominalBlur = () => {
  isNominalFocused.value = false;
  if (!dpData.value.nominal) dpData.value.nominal = 0;
};

const handlePrint = () => {
  // Memanggil print preview browser
  window.print();
};

const closePrintPreview = () => {
  isPrintPreviewVisible.value = false;

  // SEKARANG baru kita emit dan tutup modal utama
  emit('dp-saved', newDpFromSave.value);
  emit('close');

  // Reset state
  printHeaderData.value = null;
  newDpFromSave.value = null;
};

const onRekeningSelected = (rekening: Rekening) => {
  dpData.value.bankData.akun = rekening.kode;
  dpData.value.bankData.namaBank = rekening.nama;
  dpData.value.bankData.norek = rekening.rekening;
  isRekeningSearchVisible.value = false;
};
</script>

<template>
  <v-dialog :model-value="!isPrintPreviewVisible" persistent max-width="500px">
    <v-card class="dialog-card">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Input DP (Uang Muka)</v-toolbar-title>
      </v-toolbar>
      <v-card-text class="pa-4">
        <v-row dense>
          <v-col cols="12"><v-text-field label="Tanggal" v-model="dpData.tanggal" type="date" variant="outlined"
              density="compact" /></v-col>
          <v-col cols="12"><v-select label="Jenis" v-model="dpData.jenis" :items="['TUNAI', 'TRANSFER', 'GIRO']"
              variant="outlined" density="compact" /></v-col>
          <v-col cols="12">
            <v-text-field label="Nominal"
              :model-value="isNominalFocused ? dpData.nominal : formatRupiah(dpData.nominal || 0)"
              @update:model-value="dpData.nominal = Number(String($event).replace(/[^0-9]/g, '')) || 0"
              @focus="onNominalFocus" @blur="onNominalBlur" type="text" variant="outlined" density="compact"
              class="text-end" />
          </v-col>
          <v-col cols="12"><v-text-field label="Keterangan" v-model="dpData.keterangan" variant="outlined"
              density="compact" /></v-col>

          <v-col v-if="dpData.jenis === 'TRANSFER'" cols="12">
            <v-divider class="my-2" />
            <v-text-field label="Akun Bank" v-model="dpData.bankData.akun" variant="outlined" density="compact"
              @click="isRekeningSearchVisible = true" readonly append-inner-icon="mdi-magnify" />
            <v-text-field label="Nama Bank" v-model="dpData.bankData.namaBank" density="compact" readonly filled />
            <v-text-field label="No. Rekening" v-model="dpData.bankData.norek" density="compact" readonly filled />
            <v-text-field label="Tgl. Transfer" v-model="dpData.bankData.tglTransfer" type="date" variant="outlined"
              density="compact" />
          </v-col>
          <v-col v-if="dpData.jenis === 'GIRO'" cols="12">
            <v-divider class="my-2" />
            <p class="text-subtitle-2 mb-2">Detail Giro</p>
            <v-text-field label="No. Giro" v-model="dpData.giroData.noGiro" variant="outlined" density="compact" />
            <v-text-field label="Tgl. Giro" v-model="dpData.giroData.tglGiro" type="date" variant="outlined"
              density="compact" class="mt-2" />
            <v-text-field label="Tgl. Jatuh Tempo" v-model="dpData.giroData.tglJatuhTempo" type="date"
              variant="outlined" density="compact" class="mt-2" />
          </v-col>
          <v-card-text class="pa-4">
            <v-alert density="compact" variant="tonal" class="mb-4">
              <div class="d-flex justify-space-between"><span>Minimal DP Total:</span> <strong>{{
                formatRupiah(minimalDp) }}</strong></div>
              <div class="d-flex justify-space-between"><span>Sudah Dibayar:</span> <strong>{{
                formatRupiah(existingDp) }}</strong></div>
              <v-divider class="my-1" />
              <div class="d-flex justify-space-between font-weight-bold"><span>Kekurangan:</span>
                <strong>{{ formatRupiah(kekuranganDp) }}</strong>
              </div>
            </v-alert>
            <v-row dense>
            </v-row>
          </v-card-text>
        </v-row>
      </v-card-text>
      <v-card-actions class="dialog-footer">
        <v-spacer />
        <v-btn size="small" @click="$emit('close')">Batal</v-btn>
        <v-btn size="small" color="primary" @click="save" :loading="isSaving || isPrinting"
          :disabled="isPrinting || isSaving">
          {{ isPrinting ? 'Memuat Pratinjau...' : 'Simpan' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="isPrintPreviewVisible" fullscreen persistent scrollable>
    <v-card class="d-flex flex-column print-dialog">
      <v-toolbar color="grey-darken-3" density="compact" class="print-toolbar">
        <v-toolbar-title>Pratinjau Cetak: {{ printHeaderData?.sh_nomor }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn prepend-icon="mdi-printer" @click="handlePrint">Cetak</v-btn>
        <v-btn icon="mdi-close" @click="closePrintPreview"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-0 grey-lighten-4 print-preview-area">

        <div class="print-container">
          <div v-if="printHeaderData" class="page">

            <div class="receipt-copy" v-for="copy in 2" :key="copy">
              <div class="company-header">
                <img :src="appLogo" alt="Logo" class="company-logo">
                <div class="company-info">
                  <div class="company-name">{{ printHeaderData.perush_nama }}</div>
                  <div>{{ printHeaderData.perush_alamat }}</div>
                  <div>Wa: {{ printHeaderData.perush_telp }}</div>
                </div>
              </div>
              <div class="document-title">{{ documentTitle }}</div>
              <div class="details-container">
                <div class="details-grid">
                  <div class="label">Nomor Dokumen</div>
                  <div class="value">: {{ printHeaderData.sh_nomor }}</div>
                  <div class="label">Tanggal Dokumen</div>
                  <div class="value">: {{ format(parseISO(printHeaderData.sh_tanggal), 'dd-MM-yyyy') }}</div>
                  <div class="label">Nama Customer</div>
                  <div class="value">: {{ printHeaderData.cus_nama }}</div>
                  <div class="label">Alamat</div>
                  <div class="value address-value">: {{ printHeaderData.cus_alamat }}, {{ printHeaderData.cus_kota }}
                  </div>
                  <div class="label">No. Kontak</div>
                  <div class="value">: {{ printHeaderData.cus_telp }}</div>
                  <div class="label">Nominal yang Diterima</div>
                  <div class="value">: Rp {{ formatRupiah(printHeaderData.sh_nominal) }}</div>
                  <div class="label">Terbilang</div>
                  <div class="value terbilang-value">: <em>{{ printHeaderData.terbilang }}</em></div>
                </div>
                <div v-if="printHeaderData.sh_jenis === 1" class="details-grid-right">
                  <div class="label">Akun</div>
                  <div class="value">: {{ printHeaderData.rek_nama }}</div>
                  <div class="label">No. Rekening</div>
                  <div class="value">: {{ printHeaderData.sh_norek }}</div>
                  <div class="label">Tgl. Transfer</div>
                  <div class="value">: {{ printHeaderData.sh_tgltransfer ?
                    format(parseISO(printHeaderData.sh_tgltransfer), 'dd-MM-yyyy') : '' }}</div>
                </div>
              </div>

              <div class="summary-no-details">
                <div class="keterangan-header">
                  <strong>Keterangan:</strong> {{ printHeaderData.sh_ket }}
                </div>
                <div class="total-header">
                  <strong>Total Bayar:</strong>
                  <span>Rp {{ formatRupiah(printHeaderData.sh_nominal) }}</span>
                </div>
              </div>

              <div class="signatures">
                <div class="signature-box">Yang Menyerahkan,<br><br><br>(____________________)</div>
                <div class="signature-box">Penerima,<br><br><br>(____________________)</div>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
  <RekeningSearchModal v-if="isRekeningSearchVisible" :cabang="authStore.user?.cabang || ''"
    @close="isRekeningSearchVisible = false" @selected="onRekeningSelected" />
</template>

<style scoped>
/* Style lokal untuk modal input */
.dialog-card :deep(.v-label) {
  font-size: 11px !important;
}

.dialog-card :deep(input),
.dialog-card :deep(.v-select__selection-text) {
  font-size: 12px !important;
}

.dialog-footer {
  background-color: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.dialog-footer {
  background-color: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.dialog-card :deep(.v-field--variant-filled),
.dialog-card :deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.text-end input {
  text-align: right;
}

/* --- STYLE BARU UNTUK PREVIEW AREA --- */
.print-dialog .print-preview-area {
  display: flex;
  justify-content: center;
  padding-top: 20px;
  padding-bottom: 20px;
  overflow-y: auto;
}

/* --- STYLE BARU UNTUK KETERANGAN (PENGGANTI DETAIL) --- */
.summary-no-details {
  border: 1px solid #333;
  margin-top: 15px;
}

.keterangan-header {
  padding: 8px;
  border-bottom: 1px solid #333;
}

.total-header {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  font-size: 1.1em;
  font-weight: bold;
  background-color: #f2f2f2;
}


/* ########################################## */
/* ### STYLE DIBAWAH INI DISALIN DARI DPPRINTVIEW.VUE ### */
/* ########################################## */

.page {
  font-family: 'Arial', sans-serif;
  font-size: 10pt;
  background: white;
  padding: 1.5cm;
  /* Padding kertas A4 */
  margin: 0;
  width: 21cm;
  /* Lebar A4 */
  min-height: 29.7cm;
  /* Tinggi A4 */
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  page-break-inside: avoid;
}

/* --- STYLE BARU UNTUK 2 SALINAN --- */
.receipt-copy {
  border-bottom: 2px dashed #ccc;
  padding-bottom: 1cm;
  margin-bottom: 1cm;
  page-break-after: auto;
  /* Pastikan salinan kedua di halaman baru jika tidak muat */
}

.receipt-copy:last-child {
  border-bottom: none;
  margin-bottom: 0;
  page-break-after: auto;
}

/* --- AKHIR STYLE 2 SALINAN --- */


.company-header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 10px;
}

.company-logo {
  height: 40px;
}

.company-name {
  font-weight: bold;
  font-size: 12pt;
}

.company-info {
  line-height: 1.4;
}

.document-title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  margin: 10px 0;
  border-top: 1px solid #333;
  border-bottom: 1px solid #333;
  padding: 5px 0;
}

.details-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.details-grid {
  display: grid;
  grid-template-columns: 160px auto;
  row-gap: 4px;
  line-height: 1.5;
  flex-grow: 1;
}

.details-grid-right {
  display: grid;
  grid-template-columns: 80px auto;
  font-size: 9pt;
  flex-shrink: 0;
}

.label {
  font-weight: bold;
}

.address-value,
.terbilang-value {
  font-style: italic;
}

.text-end {
  text-align: right;
}

.signatures {
  display: flex;
  justify-content: space-around;
  margin-top: 40px;
  /* Beri jarak lebih untuk TTD */
}

.signature-box {
  width: 40%;
  text-align: center;
  padding-top: 10px;
  height: 80px;
  /* Tinggi area TTD */
}

/* ### ATURAN PRINT GLOBAL (INI PENTING) ### */
/* Kita tidak bisa menggunakan 'scoped' untuk @media print
   karena kita perlu menargetkan 'body' */
</style>

<style>
@media print {

  /* Sembunyikan SEMUA elemen di body */
  body * {
    visibility: hidden !important;
  }

  /* Tampilkan HANYA kontainer cetak dan isinya */
  .print-container,
  .print-container * {
    visibility: visible !important;
  }

  /* Posisikan kontainer cetak menutupi seluruh halaman */
  .print-container {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Hilangkan bayangan dan margin dari 'page' */
  .page {
    box-shadow: none !important;
    margin: 0 !important;
    padding: 1cm !important;
    /* Beri margin cetak di sini */
    border: none !important;
    width: 100% !important;
    min-height: auto !important;
    page-break-inside: avoid;
  }

  /* Sembunyikan toolbar dialog cetak */
  .print-toolbar {
    display: none !important;
  }

  /* Atur agar salinan kedua tidak terpotong */
  .receipt-copy {
    page-break-inside: avoid;
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png'; // Pastikan path logo benar

// Tipe Data untuk Print (Sesuaikan dengan response backend)
interface PrintHeader {
  pl_nomor: string;
  pl_mt_nomor: string;
  pl_tanggal: string;
  pl_ket: string;
  store: string;       // Nama Store Tujuan
  perush_nama: string; // Nama DC Pengirim
  perush_alamat: string;
  perush_telp: string;
  user_create: string;
  date_create: string;
}

interface PrintDetail {
  kode: string;
  nama_barang: string;
  ukuran: string;
  jumlah: number;
  keterangan: string;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;

// [TAMBAHAN] Helper untuk format angka bulat
const formatNumber = (value: number | string) => {
  if (!value) return '0';
  // Konversi ke number, lalu format ke locale Indonesia tanpa desimal
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 0 });
};

// --- Fetch Data ---
const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    // Endpoint ini perlu dibuat di backend
    const response = await api.get(`/packing-list-form/print-data/${nomor}`);
    printData.value = response.data;

    if (printData.value?.header?.pl_nomor) {
      document.title = `PL_${printData.value.header.pl_nomor}`;
    }
  } catch (error) {
    alert("Gagal memuat data untuk dicetak.");
    console.error("Error fetching print data:", error);
  } finally {
    isLoading.value = false;
  }
};

// --- Auto Print Trigger ---
watch(isLoading, (newValue) => {
  if (newValue === false && printData.value) {
    nextTick(() => {
      window.print();
      // Opsional: window.close(); setelah print
    });
  }
});

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) fetchPrintData(nomor);
});
</script>

<template>
  <div class="print-container">
    <div v-if="isLoading" class="loading-state">Sedang memuat data...</div>

    <div v-if="printData" class="page">
      <div class="header-section">
        <div class="logo-wrapper">
          <img :src="appLogo" alt="Logo" class="logo" />
        </div>
        <div class="company-info">
          <div class="company-name">{{ printData.header.perush_nama }}</div>
          <div class="company-address">{{ printData.header.perush_alamat }}</div>
          <div class="company-contact">{{ printData.header.perush_telp }}</div>
        </div>
        <div class="doc-title-wrapper">
          <h1 class="doc-title">PACKING LIST</h1>
          <div class="doc-number">{{ printData.header.pl_nomor }}</div>
        </div>
      </div>

      <div class="info-section">
        <table class="info-table">
          <tr>
            <td class="label">Tanggal</td>
            <td class="separator">:</td>
            <td class="value">{{ format(parseISO(printData.header.pl_tanggal), 'dd-MM-yyyy') }}</td>

            <td class="label pl-4">Kepada Store</td>
            <td class="separator">:</td>
            <td class="value font-bold">{{ printData.header.store }}</td>
          </tr>
          <tr>
            <td class="label">No. Permintaan</td>
            <td class="separator">:</td>
            <td class="value">{{ printData.header.pl_mt_nomor || '-' }}</td>

            <td class="label pl-4">Keterangan</td>
            <td class="separator">:</td>
            <td class="value">{{ printData.header.pl_ket || '-' }}</td>
          </tr>
        </table>
      </div>

      <div class="items-section">
        <table class="items-table">
          <thead>
            <tr>
              <th class="col-no">NO</th>
              <th class="col-kode">KODE BARANG</th>
              <th class="col-nama">NAMA BARANG</th>
              <th class="col-ukuran">UKURAN</th>
              <th class="col-jumlah">QTY MINTA</th>
              <th class="col-picking">PICKING LIST</th>
              <th class="col-ket">KET</th>
              <th class="col-check">CHECK</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="text-center">{{ index + 1 }}</td>
              <td>{{ item.kode }}</td>
              <td>{{ item.nama_barang }}</td>
              <td class="text-center">{{ item.ukuran }}</td>
              <td class="text-right font-bold">{{ formatNumber(item.jumlah) }}</td>
              <td></td>
              <td>{{ item.keterangan }}</td>
              <td class="text-center">▢</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer-section">
        <div class="created-info">
          Dicetak pada: {{ format(new Date(), 'dd-MM-yyyy HH:mm') }} oleh {{ printData.header.user_create }}
        </div>

        <div class="signatures">
          <div class="sig-box">
            <div class="sig-title">Dibuat Oleh (Admin),</div>
            <div class="sig-space"></div>
            <div class="sig-name">( {{ printData.header.user_create }} )</div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Disiapkan Oleh (Picker),</div>
            <div class="sig-space"></div>
            <div class="sig-name">( .......................... )</div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Diperiksa Oleh (Checker),</div>
            <div class="sig-space"></div>
            <div class="sig-name">( .......................... )</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* Reset & Base Font */
body {
  margin: 0;
  padding: 0;
}

.print-container {
  font-family: 'Arial', sans-serif;
  font-size: 10pt;
  color: #000;
  background: #fff;
}

/* Page Setup A4 */
.page {
  width: 210mm;
  min-height: 297mm;
  padding: 10mm 15mm;
  margin: 0 auto;
  box-sizing: border-box;
  position: relative;
}

/* Header Styles */
.header-section {
  display: flex;
  align-items: flex-start;
  border-bottom: 2px solid #000;
  padding-bottom: 10px;
  margin-bottom: 15px;
}

.logo {
  height: 50px;
  width: auto;
  margin-right: 15px;
}

.company-info {
  flex: 1;
}

.company-name {
  font-size: 14pt;
  font-weight: bold;
}

.company-address {
  font-size: 9pt;
}

.doc-title-wrapper {
  text-align: right;
}

.doc-title {
  margin: 0;
  font-size: 18pt;
  font-weight: bold;
  letter-spacing: 2px;
}

.doc-number {
  font-size: 11pt;
  margin-top: 5px;
  font-weight: bold;
}

/* Info Table Styles */
.info-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 15px;
}

.info-table td {
  padding: 2px 0;
  vertical-align: top;
}

.label {
  width: 100px;
  font-weight: bold;
}

.separator {
  width: 10px;
  text-align: center;
}

.pl-4 {
  padding-left: 20px;
}

.font-bold {
  font-weight: bold;
}

/* Item Table Styles */
.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
}

.items-table th,
.items-table td {
  border: 1px solid #000;
  padding: 5px;
  font-size: 9pt;
}

.items-table th {
  background-color: #eee;
  font-weight: bold;
  text-align: center;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.col-no {
  width: 40px;
}

.col-kode {
  width: 120px;
}

.col-ukuran {
  width: 60px;
}

.col-jumlah {
  width: 60px;
}

.col-picking {
  width: 80px;
}

.col-check {
  width: 50px;
}

.text-center {
  text-align: center;
}

.text-right {
  text-align: right;
}

/* Footer Styles */
.footer-section {
  margin-top: 30px;
}

.created-info {
  font-size: 8pt;
  font-style: italic;
  margin-bottom: 10px;
  text-align: right;
}

.signatures {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.sig-box {
  width: 30%;
  text-align: center;
}

.sig-space {
  height: 60px;
}

.sig-name {
  font-weight: bold;
  border-top: 1px solid #000;
  padding-top: 5px;
  display: inline-block;
  min-width: 150px;
}

/* Print Media Query */
@media print {
  @page {
    size: A4;
    margin: 0;
  }

  .page {
    border: none;
    padding: 10mm 15mm;
    width: 100%;
  }

  .loading-state {
    display: none;
  }
}

/* ============================= */
/* FORCE LIGHT MODE FOR PRINT VIEW */
/* ============================= */

.print-container,
.print-container * {
  color: #000 !important;
  background: #fff !important;
}
</style>

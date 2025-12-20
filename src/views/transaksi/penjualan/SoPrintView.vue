<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';
import InstagramLogo from '@/assets/instagram.jpg'; // Import logo Instagram
import { formatRupiah } from "@/utils/formatRupiah";
import QRCode from "qrcode";

interface PrintHeader {
  so_nomor: string;
  so_tanggal: string;
  so_top: number;
  so_ket: string;
  so_sc: string;
  cus_nama: string;
  cus_alamat: string;
  cus_kota: string;
  cus_telp: string;
  gdg_inv_instagram: string;
  gdg_inv_alamat: string;
  gdg_inv_kota: string;
  gdg_inv_telp: string;
  gdg_akun: string;
  gdg_transferbank: string;
}

interface PrintItem {
  nama_barang: string;
  ukuran: string;
  qty: number;
  harga: number;
  diskon: number;
  total: number;
}

interface PrintSummary {
  terbilang: string;
  total: number;
  diskon: number;
  biaya_kirim: number;
  grand_total: number;
  dp: number;
  belumbayar: number;
}

interface PrintData {
  header: PrintHeader;
  details: PrintItem[];
  summary: PrintSummary;
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;
const instagramLogo = InstagramLogo; // Definisikan untuk digunakan di template
const qrCodeData = ref<string | null>(null);


const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/so/print-data/${nomor}`);
    printData.value = response.data;
    if (printData.value.header?.so_nomor) {
      document.title = printData.value.header.so_nomor;

      qrCodeData.value = await QRCode.toDataURL(printData.value.header.so_nomor, {
        width: 150,
        margin: 1
      });
    }
  } catch (error) {
    alert("Gagal memuat data untuk dicetak.");
    console.error("Error fetching print data:", error);
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (newValue) => {
  // Jika loading SUDAH SELESAI (dari true menjadi false)
  if (newValue === false) {
    // Tunggu satu tick lagi untuk memastikan DOM sudah 100% ter-update
    nextTick(() => {
      window.print();
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
    <div v-if="isLoading" class="text-center">Memuat data...</div>
    <div v-if="printData" class="page">
      <div class="watermark">BUKAN INVOICE</div>

      <div class="company-header">
        <!-- QR Code kiri -->
        <img v-if="qrCodeData" :src="qrCodeData" class="qr-code" />

        <div class="company-info">
          <div class="company-name">
            <img :src="instagramLogo" alt="Instagram" class="instagram-logo">
            <span class="instagram-text">{{ printData.header.gdg_inv_instagram }}</span>
          </div>
          <div>{{ printData.header.gdg_inv_alamat }}</div>
          <div>{{ printData.header.gdg_inv_kota }}</div>
          <div>{{ printData.header.gdg_inv_telp }}</div>
        </div>

        <!-- Logo kanan -->
        <img :src="appLogo" alt="Logo Perusahaan" class="company-logo-right">
      </div>
      <div class="document-title">Surat Pesanan</div>
      <div class="header-details">
        <div class="left-section">
          <div><span class="label">No. Pesanan:</span> {{ printData.header.so_nomor }}</div>
          <div><span class="label">Tanggal:</span> {{ format(parseISO(printData.header.so_tanggal),
            'dd-MM-yyyy') }}</div>
          <div><span class="label">Tempo:</span> {{ printData.header.so_top }} Hari</div>
          <div><span class="label">Keterangan:</span> {{ printData.header.so_ket }}</div>
        </div>
        <div class="right-section">
          <div><span class="label">Customer:</span> {{ printData.header.cus_nama }}</div>
          <div class="address-line">{{ printData.header.cus_alamat }} {{ printData.header.cus_kota }}</div>
          <div><span class="label"></span> {{ printData.header.cus_telp }}</div>
        </div>
      </div>
      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th class="no">No</th>
              <th class="nama">Nama</th>
              <th class="ukuran">Ukuran</th>
              <th class="qty">Qty</th>
              <th class="harga">Harga</th>
              <th class="diskon">Diskon</th>
              <th class="total">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no">{{ index + 1 }}</td>
              <td class="nama">{{ item.nama_barang }}</td>
              <td class="ukuran">{{ item.ukuran }}</td>
              <td class="qty">{{ item.qty }}</td>
              <td class="harga">{{ formatRupiah(item.harga) }}</td>
              <td class="diskon">{{ formatRupiah(item.diskon) }}</td>
              <td class="total">{{ formatRupiah(item.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="summary-section">
        <div class="terbilang-section">
          <strong>Terbilang:</strong>
          <em>{{ printData.summary.terbilang }}</em>
        </div>
        <div class="totals-table">
          <table>
            <tbody>
              <tr>
                <td>Total</td>
                <td>{{ formatRupiah(printData.summary.total) }}</td>
              </tr>
              <tr>
                <td>Diskon</td>
                <td>{{ formatRupiah(printData.summary.diskon) }}</td>
              </tr>
              <tr>
                <td>Biaya Kirim</td>
                <td>{{ formatRupiah(printData.summary.biaya_kirim) }}</td>
              </tr>
              <tr class="grand-total">
                <td>Grand Total</td>
                <td>{{ formatRupiah(printData.summary.grand_total) }}</td>
              </tr>
              <tr>
                <td>DP</td>
                <td>{{ formatRupiah(printData.summary.dp) }}</td>
              </tr>
              <tr class="grand-total">
                <td>Belum dibayar</td>
                <td>{{ formatRupiah(printData.summary.belumbayar) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="footer-signatures">
        <div class="signature-column">Sales Counter,</div>
        <div class="signature-column">Mengetahui,</div>
        <div class="signature-column">Customer,</div>
      </div>
      <div class="footer-names">
        <div class="name-column">( {{ printData.header.so_sc }} )</div>
        <div class="name-column">( .................... )</div>
        <div class="name-column">( {{ printData.header.cus_nama }} )</div>
      </div>
      <div class="note-section">
        Note:<br>

        <div v-if="printData.header.gdg_transferbank || printData.header.gdg_akun" class="bank-info">
          <strong>* Transfer Bank: {{ printData.header.gdg_transferbank }} {{ printData.header.gdg_akun }}</strong>
        </div>
        <em>*Apabila dalam waktu 30 hari setelah pemberitahuan bahwa barang telah selesai tidak dilakukan
          pengambilan, maka uang muka (DP) dianggap hangus dan barang sepenuhnya menjadi hak milik
          Kaosan.</em>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Styling Dasar */
.print-container {
  padding: 20mm;
  /* Sesuai standar cetak */
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 12px;
  color: #333;
  position: relative;
  /* Untuk posisi watermark */
}

.page {
  position: relative;
  border: 1px solid #ccc;
  padding: 15mm;
  min-height: 270mm;
  /* Tinggi minimal satu halaman A4 */
}

/* Watermark */
.watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-45deg);
  font-size: 72px;
  color: gray;
  /* abu-abu */
  font-weight: bold;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
  z-index: -1;
  opacity: 0.1;
  /* lebih stabil di print preview */
}

/* Header Perusahaan */
.company-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.company-info {
  flex-grow: 1;
}

.company-name {
  font-size: 18px;
  font-weight: bold;
  display: flex;
  /* Untuk mensejajarkan logo IG */
  align-items: center;
  gap: 5px;
  /* Spasi antara teks dan logo */
}

.instagram-logo {
  height: 18px;
  /* Ukuran logo Instagram */
  width: auto;
}

.instagram-text {
  font-size: 12px;
  /* Ukuran font untuk gdg_inv_instagram */
  font-weight: normal;
}

.company-logo-right {
  height: 50px;
  /* Ukuran logo utama */
  width: auto;
}

/* Judul Dokumen */
.document-title {
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 20px;
  text-decoration: underline;
}

/* Detail Header (No. Pesanan, Customer, dll.) */
.header-details {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.left-section,
.right-section {
  width: 48%;
}

.label {
  font-weight: bold;
  display: inline-block;
  width: 80px;
  /* Lebar label agar rapi */
}

.address-line {
  margin-left: 80px;
  /* Sesuaikan dengan lebar label */
}

/* Tabel Item */
.items-table {
  margin-bottom: 20px;
}

.items-table table {
  width: 100%;
  border-collapse: collapse;
}

.items-table th,
.items-table td {
  border: 1px solid #ccc;
  padding: 5px 8px;
  text-align: left;
}

.items-table th {
  background-color: #f0f0f0;
  font-weight: bold;
  text-transform: uppercase;
}

.items-table .no {
  width: 5%;
  text-align: center;
}

.items-table .nama {
  width: 35%;
}

.items-table .ukuran {
  width: 10%;
  text-align: center;
}

.items-table .qty {
  width: 8%;
  text-align: right;
}

.items-table .harga,
.items-table .diskon,
.items-table .total {
  width: 14%;
  /* Sesuaikan proporsi */
  text-align: right;
}

/* Ringkasan Total */
.summary-section {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.terbilang-section {
  flex-basis: 60%;
  font-size: 1.1em;
}

.totals-table {
  flex-basis: 35%;
}

.totals-table table {
  width: 100%;
  border-collapse: collapse;
}

.totals-table td {
  padding: 3px 8px;
  text-align: right;
}

.totals-table tr:not(:last-child) td {
  border-bottom: 1px dashed #eee;
}

.totals-table .grand-total td {
  font-weight: bold;
  border-top: 1px solid #ccc;
  padding-top: 5px;
}

/* Tanda Tangan */
.footer-signatures {
  display: flex;
  justify-content: space-around;
  text-align: center;
  margin-top: 40px;
  margin-bottom: 5px;
}

.signature-column {
  width: 30%;
}

.footer-names {
  display: flex;
  justify-content: space-around;
  text-align: center;
  margin-top: 30px;
  /* Jarak untuk tanda tangan */
}

.name-column {
  width: 30%;
  border-bottom: 1px solid #000;
  padding-bottom: 2px;
}


/* Catatan */
.note-section {
  margin-top: 20px;
  font-size: 0.9em;
  border-top: 1px solid #eee;
  padding-top: 10px;
}

.bank-info {
  margin-bottom: 5px;
  /* Memberi jarak ke teks disclaimer */
  font-size: 1.1em;
  /* Sedikit lebih besar agar terbaca jelas */
}

.qr-code {
  height: 40px;
  /* sama dengan company-logo-right */
  width: 40px;
  margin-right: 10px;
  object-fit: contain;
}

/* Media query untuk print */
@media print {
  .watermark {
    color: #999 !important;
    /* abu-abu */
    opacity: 0.1 !important;
    /* transparan */
    -webkit-print-color-adjust: exact;
    /* biar Chrome/Edge ikutin warna */
    print-color-adjust: exact;
  }

  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .print-container {
    margin: 0;
    padding: 0;
  }

  .page {
    border: none;
    box-shadow: none;
    margin: 0;
    padding: 0;
    min-height: auto;
  }

  .qr-code {
    height: 60px !important;
    width: 60px !important;
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

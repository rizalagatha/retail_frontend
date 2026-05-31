<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";
import InstagramLogo from "@/assets/instagram.jpg";
import { formatRupiah } from "@/utils/formatRupiah";
import QRCode from "qrcode";

interface PrintHeader {
  pen_nomor: string;
  pen_tanggal: string;
  cus_nama: string;
  cus_alamat: string;
  cus_telp: string;
  gdg_inv_alamat: string;
  gdg_inv_kota: string;
  gdg_inv_telp: string;
  gdg_akun: string;
  gdg_transferbank: string;
  user_create: string;
  total: number;
  diskon: number;
  ppn: number;
  biaya_kirim: number;
  grand_total: number;
  pen_ket?: string;
  total_dp: number;
  belum_dibayar: number;
  pen_jenis_order_nama?: string;
}

interface PrintDetail {
  nama_barang: string;
  ukuran: string;
  qty: number;
  harga: number;
  diskon: number;
  total: number;
}

interface DpDetail {
  nomor: string;
  jenis: string;
  nominal: number;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
  dps: DpDetail[];
}

// --- [FIX 1] Interface untuk raw detail dari API (menggantikan any) ---
interface RawPrintDetail extends PrintDetail {
  pend_custom?: string;
  sod_custom?: string;
  pend_custom_data?: string;
  pend_custom_nama?: string;
}

// --- [FIX 2] Interface untuk parsed custom data (menggantikan any dalam forEach) ---
interface CustomUkuranItem {
  ukuran: string;
  jumlah: number;
  harga: number;
}

interface CustomParsedData {
  ukuranKaos?: CustomUkuranItem[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;
const igLogo = InstagramLogo;
const qrCodeData = ref<string | null>(null);

function terbilang(n: number): string {
  n = Math.floor(n);
  if (n === 0) return "";
  if (n < 0) return "minus " + terbilang(Math.abs(n));
  const ang = [
    "",
    "satu",
    "dua",
    "tiga",
    "empat",
    "lima",
    "enam",
    "tujuh",
    "delapan",
    "sembilan",
    "sepuluh",
    "sebelas",
  ];
  if (n < 12) return ang[n];
  if (n < 20) return terbilang(n - 10) + " belas";
  if (n < 100) return (terbilang(Math.floor(n / 10)) + " puluh " + terbilang(n % 10)).trim();
  if (n < 200) return "seratus " + terbilang(n - 100);
  if (n < 1000) return terbilang(Math.floor(n / 100)) + " ratus " + terbilang(n % 100);
  if (n < 2000) return "seribu " + terbilang(n - 1000);
  if (n < 1000000) return terbilang(Math.floor(n / 1000)) + " ribu " + terbilang(n % 1000);
  if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + " juta " + terbilang(n % 1000000);
  return "angka terlalu besar";
}

const capitalize = (s: string) => {
  if (!s) return "Nol";
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Nol";
  return (cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()).trim();
};

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get<{
      header: PrintHeader;
      details: RawPrintDetail[];
      dps: DpDetail[];
    }>(`/offer-form/print-data/${nomor}`);
    const data = response.data;

    // [FIX] Menggunakan RawPrintDetail dan CustomParsedData — tidak ada any lagi
    const processedDetails: PrintDetail[] = [];

    data.details.forEach((item: RawPrintDetail) => {
      if ((item.pend_custom === "Y" || item.sod_custom === "Y") && item.pend_custom_data) {
        try {
          const parsed = JSON.parse(item.pend_custom_data) as CustomParsedData;
          if (parsed.ukuranKaos && parsed.ukuranKaos.length > 1) {
            parsed.ukuranKaos.forEach((u: CustomUkuranItem) => {
              processedDetails.push({
                ...item,
                nama_barang: item.pend_custom_nama || item.nama_barang,
                ukuran: u.ukuran,
                qty: u.jumlah,
                harga: u.harga,
                total: u.jumlah * u.harga,
                diskon: 0,
              });
            });
            return;
          }
        } catch (e) {
          console.error("Gagal pecah baris print Penawaran:", e);
        }
      }
      processedDetails.push(item);
    });

    printData.value = { ...data, details: processedDetails };

    if (printData.value.header?.pen_nomor) {
      document.title = printData.value.header.pen_nomor;
      qrCodeData.value = await QRCode.toDataURL(printData.value.header.pen_nomor, {
        width: 200,
        margin: 1,
      });
    }
  } catch (error) {
    console.error("Gagal memuat data cetak:", error);
    alert("Gagal memuat data untuk dicetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (newValue) => {
  if (newValue === false) {
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
      <div class="company-header">
        <img v-if="qrCodeData" :src="qrCodeData" class="qr-image" />

        <div class="company-info centered">
          <div class="company-name">
            <img :src="igLogo" class="icon-ig" />
            KAOSAN.OFFICIAL
          </div>
          <div>{{ printData.header.gdg_inv_alamat }}</div>
          <div>{{ printData.header.gdg_inv_kota }}</div>
          <div>{{ printData.header.gdg_inv_telp }}</div>
        </div>

        <img :src="appLogo" alt="Logo Perusahaan" class="company-logo-right" />
      </div>

      <div class="document-title">PENAWARAN</div>

      <div class="header-details">
        <div class="left-section">
          <div><span class="label">Nomor:</span> {{ printData.header.pen_nomor }}</div>
          <div>
            <span class="label">Tanggal:</span>
            {{ format(parseISO(printData.header.pen_tanggal), "dd-MM-yyyy") }}
          </div>
        </div>
        <div class="right-section">
          <div><span class="label">Customer:</span> {{ printData.header.cus_nama }}</div>
          <div class="address-line">{{ printData.header.cus_alamat }}</div>
          <div><span class="label">Telp:</span> {{ printData.header.cus_telp }}</div>
        </div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th class="no">No</th>
              <th class="nama">Nama Barang</th>
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
          <em>{{ capitalize(terbilang(printData.header.grand_total)) }} Rupiah</em>
        </div>
        <div class="totals-table">
          <table>
            <tbody>
              <tr>
                <td>Total</td>
                <td>{{ formatRupiah(printData.header.total) }}</td>
              </tr>
              <tr>
                <td>Diskon</td>
                <td>{{ formatRupiah(printData.header.diskon) }}</td>
              </tr>
              <tr v-if="printData.header.ppn > 0">
                <td>PPN</td>
                <td>{{ formatRupiah(printData.header.ppn) }}</td>
              </tr>
              <tr v-if="printData.header.biaya_kirim > 0">
                <td>Biaya Kirim</td>
                <td>{{ formatRupiah(printData.header.biaya_kirim) }}</td>
              </tr>
              <tr class="grand-total">
                <td>Grand Total</td>
                <td>{{ formatRupiah(printData.header.grand_total) }}</td>
              </tr>
              <tr v-if="printData.header.total_dp > 0">
                <td class="text-teal font-weight-bold">Uang Muka (DP)</td>
                <td class="text-teal font-weight-bold">
                  {{ formatRupiah(printData.header.total_dp) }}
                </td>
              </tr>
              <tr v-if="printData.header.total_dp > 0" class="balance-due">
                <td>Sisa Bayar</td>
                <td>{{ formatRupiah(printData.header.belum_dibayar) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="footer-signatures">
        <div class="signature-column">Dibuat Oleh,</div>
        <div class="signature-column">Mengetahui,</div>
      </div>
      <div class="footer-names">
        <div class="name-column">( {{ printData.header.user_create }} )</div>
        <div class="name-column">( ......................... )</div>
      </div>

      <div v-if="printData.header.gdg_transferbank || printData.header.gdg_akun" class="bank-info">
        <strong>
          * Transfer Bank: {{ printData.header.gdg_transferbank }}
          {{ printData.header.gdg_akun }}
        </strong>
      </div>

      <div v-if="printData.dps?.length > 0" class="dp-details-list">
        <strong>Rincian Pembayaran Uang Muka:</strong>
        <ul>
          <li v-for="dp in printData.dps" :key="dp.nomor">
            {{ dp.nomor }} ({{ dp.jenis }}) : {{ formatRupiah(dp.nominal) }}
          </li>
        </ul>
      </div>

      <div class="note-section">Note: {{ printData.header.pen_ket }}</div>
    </div>
  </div>
</template>

<style scoped>
/* ============================= */
/* FORCE LIGHT MODE              */
/* ============================= */
.print-container,
.print-container * {
  color: #000 !important;
  background: #fff !important;
}

.text-teal {
  color: #00796b !important;
}

/* ============================= */
/* LAYOUT HALAMAN                */
/* ============================= */
.print-container {
  font-family: "Arial", sans-serif;
  font-size: 10pt;
}

/* Kunci: min-height auto agar ikut konten, bukan fixed 29.7cm */
.page {
  background: white;
  padding: 1.5cm;
  margin: 20px auto;
  width: 21cm;
  min-height: auto; /* ← berbeda dari versi lama (29.7cm) */
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

/* ============================= */
/* COMPANY HEADER                */
/* ============================= */
.company-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid #333;
  padding-bottom: 10px;
  margin-bottom: 10px;
}

.company-info {
  font-size: 9pt;
  line-height: 1.4;
}

.company-info.centered {
  text-align: center;
  flex: 1;
  margin-top: -10px;
}

.company-name {
  font-weight: bold;
  font-size: 16pt;
  text-align: center;
  margin-top: 5px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.icon-ig {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}

.company-logo-right {
  width: 90px;
  height: auto;
}

.qr-image {
  width: 90px;
  height: 90px;
}

/* ============================= */
/* DOCUMENT TITLE                */
/* ============================= */
.document-title {
  text-align: center;
  font-size: 16pt;
  font-weight: bold;
  margin: 20px 0;
  text-decoration: underline;
}

/* ============================= */
/* HEADER DETAILS                */
/* ============================= */
.header-details {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
  font-size: 9pt;
  line-height: 1.5;
}

.left-section,
.right-section {
  width: 48%;
}

.header-details .label {
  font-weight: bold;
  display: inline-block;
  width: 60px;
}

.address-line {
  padding-left: 60px;
  white-space: pre-line;
}

/* ============================= */
/* ITEMS TABLE                   */
/* ============================= */
.items-table {
  margin-bottom: 10px;
}

.items-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}

.items-table th,
.items-table td {
  border: 1px solid #ccc;
  padding: 5px;
}

.items-table th {
  background-color: #f2f2f2 !important;
  font-weight: bold;
  text-align: center;
}

.no {
  width: 5%;
  text-align: center;
}
.nama {
  width: 45%;
}
.ukuran {
  width: 8%;
  text-align: center;
}
.qty {
  width: 8%;
  text-align: center;
}
.harga,
.diskon,
.total {
  width: 11%;
  text-align: right;
}

/* ============================= */
/* SUMMARY                       */
/* ============================= */
.summary-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-top: 10px;
}

.terbilang-section {
  font-size: 9pt;
  width: 60%;
}

.totals-table {
  width: 35%;
  font-size: 9pt;
}

.totals-table table {
  width: 100%;
}

.totals-table td {
  padding: 3px 8px;
}

.totals-table td:last-child {
  text-align: right;
}

.grand-total td {
  font-weight: bold;
  border-top: 1px solid #333;
  padding-top: 5px;
}

.balance-due td {
  background-color: #f9f9f9 !important;
  border-top: 2px solid #333;
  font-weight: bold;
  font-size: 11pt;
}

/* ============================= */
/* SIGNATURES                    */
/* ============================= */
.footer-signatures,
.footer-names {
  display: flex;
  justify-content: space-between;
  text-align: center;
  width: 60%;
}

.footer-signatures {
  margin-top: 30px;
}
.footer-names {
  margin-top: 30px;
}

.signature-column,
.name-column {
  flex: 1;
}

/* ============================= */
/* BANK INFO & DP LIST           */
/* ============================= */
.bank-info {
  font-size: 10pt;
  margin-top: 20px;
  border-top: 1px dashed #333;
  padding-top: 5px;
}

.dp-details-list {
  margin-top: 15px;
  font-size: 8.5pt;
  border-top: 1px dashed #ccc;
  padding-top: 5px;
}

.dp-details-list ul {
  margin: 5px 0;
  padding-left: 20px;
}

/* ============================= */
/* NOTE                          */
/* ============================= */
.note-section {
  margin-top: 15px;
  font-size: 9pt;
  border-top: 1px solid #eee;
  padding-top: 8px;
}

/* ============================= */
/* PRINT MEDIA                   */
/* ============================= */
@media print {
  @page {
    size: A4;
    margin: 1cm;
  }

  body * {
    visibility: hidden;
  }

  .print-container,
  .print-container * {
    visibility: visible;
  }

  .print-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }

  /* Halaman mengikuti konten saat print juga */
  .page {
    box-shadow: none;
    border: none;
    margin: 0;
    padding: 0;
    width: 100%;
    min-height: auto;
  }
}
</style>

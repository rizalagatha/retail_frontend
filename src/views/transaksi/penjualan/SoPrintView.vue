<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";
import LogoRezso from "@/assets/rezso.jpg";
import InstagramLogo from "@/assets/instagram.jpg"; // Import logo Instagram
import { formatRupiah } from "@/utils/formatRupiah";
import QRCode from "qrcode";

interface PrintHeader {
  so_nomor: string;
  so_tanggal: string;
  so_top: number;
  so_ket: string;
  so_sc: string;
  so_dateline: string | null;
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
  gdg_inv_komplain: string;
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
const instagramLogo = InstagramLogo; // Definisikan untuk digunakan di template
const qrCodeData = ref<string | null>(null);
const trackingCode = ref<string>("");

const dynamicLogo = computed(() => {
  // Cek jika data sudah ada dan nomor SO dimulai dengan K04
  if (printData.value?.header?.so_nomor?.startsWith("K04")) {
    return LogoRezso;
  }
  return Logo; // Default ke logo Kaosan
});

const encodeResi = (nomorSo: string) => {
  try {
    const parts = nomorSo.split(".SO.");
    // Jika format tidak standar, kembalikan apa adanya
    if (parts.length !== 2) return nomorSo;

    const cabang = parts[0]; // "K01"
    const numPart = parts[1].replace(".", ""); // "2604.0001" jadi "26040001"

    const num = Number(numPart);
    if (isNaN(num)) return nomorSo;

    // Rumus Obfuscation (dikali 7 ditambah angka acak) biar nggak berurutan
    const secretVal = num * 7 + 456789;

    // Ubah ke Alfanumerik (Base36) lalu Uppercase
    const encodedNum = secretVal.toString(36).toUpperCase();

    // Format: Awalan "KSN" + Kode Cabang + Kode Rahasia
    // Hasil: KSNK0130FRTS
    return `KSN${cabang}${encodedNum}`;
  } catch (e) {
    return nomorSo;
  }
};

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/so/print-data/${nomor}`);
    const data = response.data;

    // ========================================================
    // [PROSES MAPPING] Pecah baris jika ada data custom gabungan
    // ========================================================
    const processedDetails: PrintItem[] = [];

    data.details.forEach((item: any) => {
      // Cek apakah ini item custom dan punya rincian data (sod_custom_data)
      // Biasanya di sistem Mas Rizal, data teknis ada di field pcd_custom_data atau sod_custom_data
      if (item.sod_custom === "Y" && item.sod_custom_data) {
        try {
          const parsed = JSON.parse(item.sod_custom_data);
          if (parsed.ukuranKaos && parsed.ukuranKaos.length > 1) {
            parsed.ukuranKaos.forEach((u: any) => {
              processedDetails.push({
                ...item,
                nama_barang: item.sod_custom_nama || item.nama_barang,
                ukuran: u.ukuran,
                qty: u.jumlah,
                harga: u.harga,
                total: u.jumlah * u.harga,
                diskon: 0, // Diskon custom biasanya sudah include di harga atau ditaruh di faktur
              });
            });
            return; // Skip push item original
          }
        } catch (e) {
          console.error("Gagal pecah baris print SO:", e);
        }
      }
      // Jika reguler, masukkan apa adanya
      processedDetails.push(item);
    });

    // Masukkan kembali ke printData
    printData.value = {
      ...data,
      details: processedDetails,
    };
    // ========================================================

    if (printData.value.header?.so_nomor) {
      document.title = printData.value.header.so_nomor;
      trackingCode.value = encodeResi(printData.value.header.so_nomor);
      const linkTracking = `https://tracking.kaosanofficial.com/transaksi/penjualan/surat-pesanan/track/${trackingCode.value}?target=UMUM`;
      qrCodeData.value = await QRCode.toDataURL(linkTracking, { width: 150, margin: 1 });
    }
  } catch (error) {
    alert("Gagal memuat data untuk dicetak.");
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
            <img :src="instagramLogo" alt="Instagram" class="instagram-logo" />
            <span class="instagram-text">{{ printData.header.gdg_inv_instagram }}</span>
          </div>
          <div>{{ printData.header.gdg_inv_alamat }}</div>
          <div>{{ printData.header.gdg_inv_kota }}</div>
          <div>{{ printData.header.gdg_inv_telp }}</div>
        </div>

        <!-- Logo kanan -->
        <img :src="dynamicLogo" alt="Logo Perusahaan" class="company-logo-right" />
      </div>
      <div class="document-title">Surat Pesanan</div>
      <div class="header-details">
        <div class="left-section">
          <div><span class="label">No. Pesanan:</span> {{ printData.header.so_nomor }}</div>
          <div>
            <span class="label">Tanggal:</span>
            {{ format(parseISO(printData.header.so_tanggal), "dd-MM-yyyy") }}
          </div>
          <div v-if="printData.header.so_dateline">
            <span class="label text-blue-darken-2">Dateline:</span>
            <span class="font-weight-bold text-blue-darken-2">
              {{ format(parseISO(printData.header.so_dateline), "dd-MM-yyyy") }}
            </span>
          </div>
          <div><span class="label">Tempo:</span> {{ printData.header.so_top }} Hari</div>
          <div><span class="label">Keterangan:</span> {{ printData.header.so_ket }}</div>
        </div>
        <div class="right-section">
          <div><span class="label">Customer:</span> {{ printData.header.cus_nama }}</div>
          <div class="address-line">
            {{ printData.header.cus_alamat }} {{ printData.header.cus_kota }}
          </div>
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
        Note:<br />

        <div
          v-if="printData.header.gdg_transferbank || printData.header.gdg_akun"
          class="bank-info"
        >
          <strong
            >* Transfer Bank: {{ printData.header.gdg_transferbank }}
            {{ printData.header.gdg_akun }}</strong
          >
        </div>

        <div v-if="printData.header.gdg_inv_komplain" class="complain-info mb-1">
          <strong
            >* Jika terdapat kendala atau komplain terkait pesanan, silakan hubungi Pusat Bantuan
            kami di: {{ printData.header.gdg_inv_komplain }}</strong
          >
        </div>
        <em
          >*Apabila dalam waktu 30 hari setelah pemberitahuan bahwa barang telah selesai tidak
          dilakukan pengambilan, maka uang muka (DP) dianggap hangus dan barang sepenuhnya menjadi
          hak milik kami.</em
        >
        <div class="tracking-banner">
          <div class="tracking-qr-wrapper">
            <img v-if="qrCodeData" :src="qrCodeData" class="qr-code-tracking" />
            <div class="scan-badge">SCAN ME</div>
          </div>

          <div class="tracking-info">
            <div class="tracking-title">Lacak Pesanan Anda di:</div>
            <div class="tracking-website">www.kaosanofficial.com</div>
            <div class="tracking-text">Gunakan Nomor Resi Berikut:</div>
            <div class="tracking-resi">{{ trackingCode }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Styling Dasar */
.print-container {
  padding: 20mm;
  /* Sesuai standar cetak */
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
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
  font-size: 80px;
  /* Sedikit diperbesar */
  color: #cccccc !important;
  /* Gunakan abu-abu terang */
  font-weight: bold;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
  /* UBAH INI: Dari -1 menjadi 9999 */
  z-index: 9999;
  opacity: 0.15;
  /* Sedikit dinaikkan agar terlihat */
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

/* --- TRACKING BANNER STYLES --- */
.tracking-banner {
  margin-top: 15px;
  padding: 12px;
  border: 2px dashed #333;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 15px;
  background-color: #fcfcfc;
}

.tracking-qr-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 90px;
}

.qr-code-tracking {
  width: 80px;
  height: 80px;
  object-fit: contain;
  background-color: white;
  border: 1px solid #ddd;
  padding: 2px;
  border-radius: 4px;
}

.scan-badge {
  background-color: #000;
  color: #fff !important;
  font-size: 8pt;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 12px;
  margin-top: -8px; /* Menimpa sedikit bagian bawah QR */
  z-index: 2;
  letter-spacing: 0.5px;
  border: 1px solid #fff;
}

.tracking-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex-grow: 1;
}

.tracking-title {
  font-size: 9pt;
  color: #555;
  margin-bottom: 2px;
}

.tracking-website {
  font-size: 13pt;
  font-weight: 900;
  color: #0d47a1 !important; /* Warna biru elegan */
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}

.tracking-text {
  font-size: 9pt;
  color: #555;
}

.tracking-resi {
  font-size: 15pt;
  font-weight: 900;
  color: #000;
  letter-spacing: 2px;
  background-color: #eee;
  padding: 2px 8px;
  display: inline-block;
  width: max-content;
  border-radius: 4px;
  margin-top: 3px;
  border: 1px solid #ccc;
}

/* Media query untuk print */
@media print {
  .watermark {
    color: #cccccc !important;
    opacity: 0.15 !important;
    display: block !important;
    /* Pastikan tidak tersembunyi */
    -webkit-print-color-adjust: exact;
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

  .tracking-banner {
    background-color: #fcfcfc !important;
    border: 2px dashed #333 !important;
  }

  .scan-badge {
    background-color: #000 !important;
    color: #fff !important;
  }

  .tracking-website {
    color: #0d47a1 !important;
  }

  .tracking-resi {
    background-color: #eee !important;
  }
}

/* ============================= */
/* FORCE LIGHT MODE FOR PRINT VIEW */
/* ============================= */

.print-container,
.print-container *:not(.watermark) {
  color: #000 !important;
  background: #fff !important;
}

/* Pastikan watermark tetap transparan latar belakangnya */
.watermark {
  background: transparent !important;
}
</style>

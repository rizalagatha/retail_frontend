<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import LogoKaosan from '@/assets/logo.png';
// import { useAuthStore } from '@/stores/authStore'; // Tidak perlu store user lagi untuk header
import QRCode from "qrcode";

interface PrintHeader {
  gdg_inv_nama: string;
  gdg_inv_alamat: string;
  gdg_inv_kota: string;
  gdg_inv_telp: string;
  nomor: string;
  tanggal: string;
  cabang_kode: string;
  usr_ins: string;
}

interface PrintItem {
  kode: string;
  nama: string;
  ukuran: string;
  harga: number;
  jenis: string;
  ket: string;
  pcd_gambar_url: string | null;
}

interface PrintSticker {
  pcs_kode: string;
  pcs_kodes: string;
  nama: string;
  pcs_ukuran: string;
  pcs_jumlah: number;
  harga: number;
}

interface PrintResponse {
  header: PrintHeader;
  items: PrintItem[];
  stickers?: PrintSticker[];
}


const route = useRoute();
const printData = ref<PrintResponse | null>(null);
const isLoading = ref(true);
const logoUrl = LogoKaosan;
const qrCodeDataUrl = ref("");

// Helper URL
const getFullImageUrl = (url) => {
  if (!url) return "";

  // Kalau sudah full URL
  if (url.startsWith("http")) return url;

  // Pakai backend URL yang benar
  const backend = import.meta.env.VITE_API_URL || "http://localhost:8000";

  return `${backend}${url}`;
};

const formatRupiah = (val: number) => {
  return new Intl.NumberFormat('id-ID').format(val || 0);
};

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/pengajuan-barcode-form/print-a4/${nomor}`);
    printData.value = response.data;
    document.title = `Cetak Barcode - ${nomor}`;
  } catch (error) {
    alert("Gagal memuat data untuk dicetak.");
    console.error(error);
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (newValue) => {
  if (newValue === false) {
    nextTick(() => {
      setTimeout(() => window.print(), 800); // Delay agar gambar terload sempurna
    });
  }
});

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) fetchPrintData(nomor);
});

watch(printData, async (val) => {
  if (val) {
    qrCodeDataUrl.value = await QRCode.toDataURL(val.header.nomor);
  }
});
</script>

<template>
  <div class="print-container" v-if="printData">
    <div class="header-section">

      <!-- KOLOM KIRI -->
      <div class="header-left">
        <img :src="logoUrl" class="logo" />
        <div class="company-text">
          <div class="company-title">{{ printData.header.gdg_inv_nama }}</div>
          <div>{{ printData.header.gdg_inv_alamat }}</div>
          <div>{{ printData.header.gdg_inv_kota }}</div>
          <div>Telp. {{ printData.header.gdg_inv_telp }}</div>
        </div>
      </div>

      <!-- KOLOM KANAN (NOMOR + QR) -->
      <div class="header-right">
        <div class="doc-number">{{ printData.header.nomor }}</div>
        <img v-if="qrCodeDataUrl" :src="qrCodeDataUrl" class="qr-code" />
      </div>

    </div>

    <div class="info-grid">
      <div class="info-title">PENGAJUAN BARCODE BARU</div>
      <div class="info-item">
        <span class="label">Tanggal</span>: {{ format(parseISO(printData.header.tanggal), 'dd-MM-yyyy') }}
      </div>
      <div class="info-item">
        <span class="label">Cabang</span>: {{ printData.header.cabang_kode }}
      </div>
      <div class="info-item">
        <span class="label">Dibuat Oleh</span>: {{ printData.header.usr_ins }}
      </div>
    </div>

    <div class="table-section">
      <h3 class="section-title">Detail Barang</h3>
      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 5%">No</th>
            <th style="width: 65%">Detail Barang</th>
            <th style="width: 10%">Jenis</th>
            <th style="width: 20%">Gambar</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in printData.items" :key="index">
            <td class="text-center">{{ index + 1 }}</td>

            <!-- KOLOM DETAIL BARANG -->
            <td>
              <div><strong>Kode:</strong> {{ item.kode }}</div>
              <div><strong>Nama:</strong> {{ item.nama }}</div>
              <div><strong>Ukuran:</strong> {{ item.ukuran }}</div>
              <div><strong>Harga/Pcs:</strong> {{ formatRupiah(item.harga) }}</div>
              <div><strong>Harga DTF:</strong> {{ formatRupiah(item.harga) }}</div>
              <div><strong>Keterangan:</strong> {{ item.ket }}</div>
            </td>

            <!-- KOLOM JENIS -->
            <td class="text-center">{{ item.jenis }}</td>

            <!-- KOLOM GAMBAR -->
            <td class="text-center">
              <img v-if="item.pcd_gambar_url" :src="getFullImageUrl(item.pcd_gambar_url)" class="item-image-large" />
              <span v-else>-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="printData.stickers && printData.stickers.length > 0" class="table-section mt-4">
      <h3 class="section-title">Detail Stiker Tambahan</h3>
      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 5%">No</th>
            <th style="width: 10%">Kode Induk</th>
            <th style="width: 10%">Kode Stiker</th>
            <th style="width: 20%">Nama Stiker</th>
            <th style="width: 10%">Ukuran</th>
            <th style="width: 10%">Jumlah</th>
            <th style="width: 15%">Harga</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(sticker, index) in printData.stickers" :key="index">
            <td class="text-center">{{ index + 1 }}</td>
            <td>{{ sticker.pcs_kode }}</td>
            <td>{{ sticker.pcs_kodes }}</td>
            <td>{{ sticker.nama }}</td>
            <td class="text-center">{{ sticker.pcs_ukuran }}</td>
            <td class="text-center">{{ sticker.pcs_jumlah }}</td>
            <td class="text-end">{{ formatRupiah(sticker.harga) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="footer-signature">
      <div class="sig-box">
        <div class="sig-title">Dibuat Oleh,</div>
        <div class="sig-space"></div>
        <div class="sig-name">( {{ printData.header.usr_ins || '..........................' }} )</div>
      </div>

      <div class="sig-box">
        <div class="sig-title">Mengetahui,</div>
        <div class="sig-space"></div>
        <div class="sig-name">( .......................... )</div>
      </div>

      <div class="sig-box">
        <div class="sig-title">Diacc Oleh,</div>
        <div class="sig-space"></div>
        <div class="sig-name">( .......................... )</div>
      </div>
    </div>
  </div>
  <div v-else class="loading-text">Memuat data...</div>
</template>

<style scoped>
.print-container {
  font-family: 'Arial', sans-serif;
  font-size: 10pt;
  /* Jika portrait, mungkin perlu font lebih kecil, misal 9pt */
  color: black;
  padding: 10mm;

  width: 100%;
  /* Pastikan 100% agar mengikuti kertas */
  max-width: none;
  /* Hapus max-width */

  margin: 0 auto;
  background-color: white;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  /* semua sejajar */
  border-bottom: 1px solid #000;
  padding-bottom: 8px;
  margin-bottom: 10px;
}

/* KIRI */
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  justify-content: flex-start;
}

.logo {
  height: 48px;
}

.company-text {
  font-size: 9pt;
  line-height: 1.25;
}

.company-title {
  font-size: 11pt;
  font-weight: bold;
}

/* TENGAH */
.header-center {
  flex: 1;
  text-align: center;
}

.title-text {
  font-size: 15pt;
  font-weight: bold;
}

/* KANAN */
.header-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
}

.doc-number {
  font-size: 11pt;
  font-weight: bold;
}

.qr-code {
  width: 48px;
  height: 48px;
  border: 1px solid #000;
}

/* INFO GRID - Dibuat lebih rapat untuk landscape */
.info-title {
  grid-column: 1 / 4; /* 3 kolom total */
  text-align: center;
  font-size: 15pt;
  font-weight: bold;
  margin-bottom: 5px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  text-align: left;
  align-items: center;
  margin-bottom: 15px;
  font-size: 10pt;
  border-bottom: 1px solid #ddd;
  padding-bottom: 10px;
}

.info-item .label {
  font-weight: bold;
  display: inline-block;
  width: 80px;
}

/* TABLE */
.section-title {
  font-size: 11pt;
  font-weight: bold;
  margin-bottom: 5px;
  padding-bottom: 2px;
}

.print-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}

.print-table th,
.print-table td {
  border: 1px solid black;
  padding: 4px 6px;
  vertical-align: middle;
}

.print-table th {
  background-color: #f0f0f0;
  font-weight: bold;
  text-align: center;
  -webkit-print-color-adjust: exact;
  /* Paksa background warna saat print */
  print-color-adjust: exact;
}

.item-image-large {
  width: 320px;
  height: 320px;
  object-fit: cover;
  border: 1px solid #ccc;
}

.item-image-portrait {
  width: 100%;
  /* full lebar kolom */
  max-width: 180px;
  /* supaya tetap rapi */
  height: 180px;
  /* BATAS TINGGI */
  object-fit: cover;
  border: 1px solid #ccc;
  display: block;
  margin: 0 auto;
}

.text-center {
  text-align: center;
}

.text-end {
  text-align: right;
}

.mt-4 {
  margin-top: 20px;
}

.footer-signature {
  display: flex;
  justify-content: space-between;
  margin-top: 40px;
  padding: 0 30px;
}

.sig-box {
  width: 30%;
  text-align: center;
}

.sig-title {
  font-weight: bold;
  margin-bottom: 60px;
  /* Area kosong untuk tanda tangan */
}

.sig-name {
  font-weight: bold;
  border-top: 1px solid black;
  padding-top: 5px;
}

.loading-text {
  text-align: center;
  padding: 50px;
  font-size: 14pt;
}
</style>

<style>
@media print {
  @page {
    size: A4 portrait !important;
    orientation: portrait;
    margin: 5mm;
  }

  .logo {
    height: 48px !important;
  }

  .title-text {
    font-size: 13pt !important;
  }

  .item-image-large {
    width: 320px;
    height: 320px;
    object-fit: cover;
    border: 1px solid #ccc;
  }

  .print-container {
    padding: 3mm !important;
  }

  .header-section {
    margin-bottom: 5px !important;
  }

  .info-grid {
    margin-bottom: 5px !important;
    padding-bottom: 5px !important;
  }

  .table-section {
    margin-top: 8px !important;
  }

  .footer-signature {
    margin-top: 30px !important;
    padding: 0 20px !important;
  }

  .qr-code {
    width: 48px !important;
    height: 48px !important;
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

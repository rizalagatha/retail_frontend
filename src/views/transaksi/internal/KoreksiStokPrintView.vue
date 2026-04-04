<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";
import InstagramLogo from "@/assets/instagram.jpg";
import QRCode from "qrcode";

// --- Tipe Data Disesuaikan ---
interface PrintHeader {
  nomor: string;
  tanggal: string;
  keterangan: string;
  created: string;
  user_create: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  perush_instagram: string;
  perush_fb: string;
}
interface PrintDetail {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  koreksi: number;
  selisih: number;
  keterangan: string;
}
interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const qrCodeData = ref<string | null>(null);
const isLoading = ref(true);
const appLogo = Logo;
const instagramLogo = InstagramLogo;

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;

  try {
    const response = await api.get<PrintData>(`/koreksi-stok-form/print/${nomor}`);
    const data = response.data;

    printData.value = data;

    if (data.header?.nomor) {
      document.title = data.header.nomor;

      qrCodeData.value = await QRCode.toDataURL(data.header.nomor, {
        width: 140,
        margin: 1,
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
      <div class="header">
        <!-- Kolom kiri: QR -->
        <div class="left-col">
          <img v-if="qrCodeData" :src="qrCodeData" class="qr-code" />
        </div>

        <!-- Kolom tengah: informasi perusahaan -->
        <div class="company-info">
          <strong>{{ printData.header.perush_nama }}</strong>
          <div>{{ printData.header.perush_alamat }}</div>
          <div>{{ printData.header.perush_telp }}</div>

          <div v-if="printData.header.perush_instagram" class="instagram-info">
            <img :src="instagramLogo" alt="Instagram" class="instagram-logo" />
            <span>{{ printData.header.perush_instagram }}</span>
          </div>
        </div>

        <!-- Kolom kanan: logo -->
        <div class="right-col">
          <img :src="appLogo" alt="Logo" class="app-logo" />
        </div>
      </div>

      <div class="title">KOREKSI STOK</div>

      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.nomor }}</div>
        <div>
          <span class="label">Tanggal</span>:
          {{ format(parseISO(printData.header.tanggal), "dd-MM-yyyy") }}
        </div>
        <div class="keterangan">
          <span class="label">Keterangan</span>: {{ printData.header.keterangan }}
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th class="col-no">No</th>
            <th class="col-kode">Kode</th>
            <th class="col-nama">Nama Barang</th>
            <th class="col-ukuran">Ukuran</th>
            <th class="col-stok">Stok</th>
            <th class="col-koreksi">Koreksi</th>
            <th class="col-selisih">Selisih</th>
            <th class="col-keterangan-item">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in printData.details" :key="index">
            <td class="col-no">{{ index + 1 }}</td>
            <td class="col-kode">{{ item.kode }}</td>
            <td class="col-nama">{{ item.nama }}</td>
            <td class="col-ukuran">{{ item.ukuran }}</td>
            <td class="col-stok">{{ item.stok }}</td>
            <td class="col-koreksi">{{ item.koreksi }}</td>
            <td class="col-selisih">{{ item.selisih }}</td>
            <td class="col-keterangan-item">{{ item.keterangan }}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        <div class="signatures-row">
          <div class="signature-box">Dibuat Oleh,</div>
          <div class="signature-box">Mengetahui,</div>
          <div class="signature-box">Manager,</div>
        </div>
        <div class="names-row">
          <div class="signature-name">
            ( {{ printData.header.user_create || "..............." }} )
          </div>
          <div class="signature-name">( .................... )</div>
          <div class="signature-name">( .................... )</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.print-container {
  background: #eee;
  padding: 20px;
  font-family: "Arial", sans-serif;
  font-size: 9pt;
}

.page {
  background: white;
  margin: 0 auto;
  width: 210mm;
  min-height: 297mm;
  padding: 15mm;
  box-sizing: border-box;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
}

.header {
  display: grid;
  grid-template-columns: 60px 1fr 80px;
  /* 60px QR, tengah fleksibel, 80px logo */
  align-items: start;
  margin-bottom: 15px;
  width: 100%;
}

.left-col {
  display: flex;
  justify-content: flex-start;
}

.right-col {
  display: flex;
  justify-content: flex-end;
}

.company-info {
  font-size: 9pt;
  line-height: 1.4;
}

.instagram-info {
  display: flex;
  align-items: center;
  gap: 5px;
  /* Jarak antara logo dan teks */
  margin-top: 5px;
}

.instagram-logo {
  height: 12px;
  /* Ukuran logo Instagram */
  width: auto;
}

.qr-code {
  height: 52px;
  width: 52px;
  object-fit: contain;
}

.app-logo {
  /* Ganti nama class */
  height: 40px;
  max-width: 120px;
  object-fit: contain;
}

.title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  margin-bottom: 20px;
}

.info-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  margin-bottom: 15px;
}

.info-grid .label {
  font-weight: bold;
  min-width: 80px;
  /* Lebar minimum untuk label agar rapi */
}

/* Tabel Styling */
.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 30px;
}

.items-table th,
.items-table td {
  border: 1px solid black;
  padding: 6px 8px;
  /* Padding lebih besar */
  vertical-align: top;
}

.items-table thead th {
  font-weight: bold;
  text-align: center;
  background-color: #f0f0f0;
  /* Latar belakang untuk header tabel */
}

/* Lebar Kolom */
.col-no {
  width: 5%;
  text-align: center;
}

.col-kode {
  width: 15%;
}

.col-nama {
  width: 30%;
}

.col-ukuran {
  width: 10%;
  text-align: center;
}

.col-stok,
.col-koreksi,
.col-selisih {
  width: 8%;
  text-align: right;
}

.col-keterangan-item {
  width: auto;
}

/* Footer Styling */
.footer {
  margin-top: 30px;
  font-size: 9pt;
}

.signatures-row {
  display: flex;
  justify-content: space-around;
  text-align: center;
  margin-bottom: 50px;
  /* Jarak antara label dan garis tanda tangan */
}

.signature-box {
  flex: 1;
}

.names-row {
  display: flex;
  justify-content: space-around;
  text-align: center;
}

.signature-name {
  flex: 1;
}

/* Print Specific Styles */
@media print {
  @page {
    size: A4 portrait;
    margin: 15mm;
  }

  body {
    -webkit-print-color-adjust: exact !important;
    /* Untuk memastikan warna latar belakang tercetak */
    print-color-adjust: exact !important;
  }

  .print-container {
    padding: 0;
    background: none;
  }

  .page {
    margin: 0;
    padding: 0;
    border: none;
    box-shadow: none;
    width: auto;
    min-height: auto;
  }

  .items-table th {
    background-color: #f0f0f0 !important;
    /* Pastikan background header tabel tercetak */
  }

  .qr-code {
    height: 42px !important;
    width: 42px !important;
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

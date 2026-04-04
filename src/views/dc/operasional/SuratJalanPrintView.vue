<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";

interface PrintHeader {
  sj_nomor: string;
  sj_mt_nomor: string;
  sj_tanggal: string;
  sj_ket: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  store: string;
  date_create: string;
  user_create: string;
}

interface PrintDetail {
  sjd_kode: string;
  nama_barang: string;
  sjd_ukuran: string;
  sjd_jumlah: number;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/surat-jalan/print-data/${nomor}`);
    printData.value = response.data;

    const nomorSJ = printData.value?.header?.sj_nomor;
    if (nomorSJ) {
      document.title = nomorSJ;
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
      <!-- Loop untuk membuat dua copy surat jalan -->
      <div class="header">
        <img :src="appLogo" alt="Logo" class="logo" />
        <div class="company-info">
          <strong>{{ printData.header.perush_nama }}</strong>
          <div>{{ printData.header.perush_alamat }}</div>
          <div>{{ printData.header.perush_telp }}</div>
        </div>
      </div>

      <div class="title">SURAT JALAN</div>

      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.sj_nomor }}</div>
        <div><span class="label">No. Permintaan</span>: {{ printData.header.sj_mt_nomor }}</div>
        <div>
          <span class="label">Tanggal</span>:
          {{ format(parseISO(printData.header.sj_tanggal), "dd-MM-yyyy") }}
        </div>
        <div><span class="label">Ke Store</span>: {{ printData.header.store }}</div>
        <div class="keterangan">
          <span class="label">Keterangan</span>: {{ printData.header.sj_ket }}
        </div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th class="no">NO</th>
              <th class="kode">KODE</th>
              <th class="nama">NAMA BARANG</th>
              <th class="ukuran">UKURAN</th>
              <th class="jumlah">JUMLAH</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no">{{ index + 1 }}</td>
              <td class="kode">{{ item.sjd_kode }}</td>
              <td class="nama">{{ item.nama_barang }}</td>
              <td class="ukuran">{{ item.sjd_ukuran }}</td>
              <td class="jumlah">{{ item.sjd_jumlah }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer">
        <div class="created-date">
          Created: {{ format(parseISO(printData.header.date_create), "dd-MM-yyyy HH:mm") }}
        </div>
        <div class="footer">
          <div class="signatures">
            <div>Dibuat Oleh,</div>
            <div>Pengirim,</div>
            <div>Diterima Oleh,</div>
          </div>
          <div class="names">
            <div>( {{ printData.header.user_create }} )</div>
            <div>( .................... )</div>
            <div>( .................... )</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Pengaturan dasar untuk cetak */
body {
  margin: 0;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

.print-container {
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  font-size: 9pt;
  background-color: #fff;
  color: #000;
}

.page {
  width: 210mm;
  min-height: 297mm;
  padding: 10mm;
  margin: 0 auto;
  box-sizing: border-box;
}

.surat-jalan-instance {
  height: 130mm;
  /* Setengah halaman A4 dikurangi margin */
  display: flex;
  flex-direction: column;
  border: 1px solid #ccc;
  padding: 8mm;
  box-sizing: border-box;
}

/* Header */
.header {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  /* ✅ Pastikan rata kiri */
  align-items: flex-start;
  /* ✅ Ubah dari center ke flex-start */
  gap: 15px;
  /* ✅ Gunakan gap untuk jarak */
  margin-bottom: 8px;
  width: 100%;
}

.logo {
  height: 40px;
  width: auto;
  margin: 0;
  /* ✅ Hapus margin-right, gunakan gap di parent */
  flex-shrink: 0;
  /* ✅ Cegah logo menyusut */
}

.company-info {
  display: flex;
  flex-direction: column;
  text-align: left;
  font-size: 9pt;
  line-height: 1.4;
  flex: 1;
  /* ✅ Ambil sisa ruang */
}

/* Judul */
.title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  margin-bottom: 8px;
  text-decoration: underline;
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 15px;
  margin-bottom: 8px;
  font-size: 8.5pt;
}

.info-grid .label {
  display: inline-block;
  width: 90px;
  /* Lebar label yang konsisten */
}

.info-grid .keterangan {
  grid-column: 1 / -1;
  /* Membuat keterangan span 2 kolom */
}

/* Tabel Item */
.items-table {
  flex-grow: 1;
  /* Membuat tabel mengisi ruang yang tersedia */
}

.items-table table {
  width: 100%;
  border-collapse: collapse;
}

.items-table th,
.items-table td {
  border: 1px solid black;
  padding: 4px 6px;
  vertical-align: top;
}

.items-table thead th {
  font-weight: bold;
  text-align: center;
  background-color: #f0f0f0;
}

.items-table .no {
  width: 4%;
  text-align: center;
}

.items-table .kode {
  width: 18%;
}

.items-table .nama {
  width: 52%;
}

.items-table .ukuran {
  width: 13%;
  text-align: center;
}

.items-table .jumlah {
  width: 13%;
  text-align: right;
}

/* Footer */
.footer {
  padding-top: 10px;
  font-size: 8.5pt;
  position: relative;
}

.signatures {
  display: flex;
  justify-content: space-between;
  text-align: center;
}

.signatures > div {
  width: 30%;
}

.names {
  display: flex;
  justify-content: space-between;
  text-align: center;
  margin-top: 45px;
}

.names > div {
  width: 30%;
}

.created-date {
  text-align: right;
  font-size: 8pt;
  margin-top: 10px;
  /* Jarak dari tabel di atas */
  padding-bottom: 10px;
  /* Jarak ke tanda tangan di bawah */
}

/* Pengaturan untuk mode cetak */
@media print {
  .print-container {
    padding: 0;
  }

  .page {
    margin: 0;
    padding: 10mm;
    border: none;
    box-shadow: none;
  }

  .surat-jalan-instance {
    border: none;
    padding: 0;
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

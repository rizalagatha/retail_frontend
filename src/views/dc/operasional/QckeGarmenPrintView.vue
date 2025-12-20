<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';

interface PrintHeader {
  mut_nomor: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  gdg_nama: string;
  mut_tanggal: string;
  mut_ket: string;
}

interface PrintDetail {
  kode: string;
  Nama: string;
  ukuran: string;
  jumlah: number;
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
    const response = await api.get(`/qc-ke-garmen-form/print/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header.mut_nomor;
  } catch (error) {
    alert("Gagal memuat data untuk dicetak.");
    console.error("Error fetching print data:", error);
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (newValue) => {
  if (newValue === false) nextTick(() => window.print());
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
        <img :src="appLogo" alt="Logo" class="logo" />
        <div class="company-info">
          <strong>{{ printData.header.perush_nama }}</strong>
          <div>{{ printData.header.perush_alamat }}</div>
          <div>Telp. {{ printData.header.perush_telp }}</div>
        </div>
      </div>
      <div class="title">SURAT JALAN KE GARMEN (QC)</div>
      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.mut_nomor }}</div>
        <div><span class="label">Ke Gudang</span>: {{ printData.header.gdg_nama }}</div>
        <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.mut_tanggal), 'dd-MM-yyyy') }}
        </div>
        <div><span class="label">Keterangan</span>: {{ printData.header.mut_ket }}</div>
      </div>

      <div class="items-table">
        <table>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no center">{{ item.kode ? (index + 1) : '' }}</td>
              <td class="kode">{{ item.kode }}</td>
              <td class="nama">{{ item.Nama }}</td>
              <td class="ukuran center">{{ item.ukuran }}</td>
              <td class="qty right">{{ item.jumlah?.toLocaleString('id-ID') || '' }}</td>
              <td class="keterangan"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer">
        <div class="signatures">
          <div>Dibuat Oleh,</div>
          <div>Pengirim,</div>
          <div>Diterima Oleh,</div>
        </div>
        <div class="names">
          <div>( .................... )</div>
          <div>( .................... )</div>
          <div>( .................... )</div>
        </div>
      </div>
    </div>

    <div v-if="printData" class="page-separator"></div>

    <div v-if="printData" class="page">
      <div class="header">
        <img :src="appLogo" alt="Logo" class="logo" />
        <div class="company-info">
          <strong>{{ printData.header.perush_nama }}</strong>
          <div>{{ printData.header.perush_alamat }}</div>
          <div>Telp. {{ printData.header.perush_telp }}</div>
        </div>
      </div>
      <div class="title">SURAT JALAN KE GARMEN (QC)</div>
      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.mut_nomor }}</div>
        <div><span class="label">Ke Gudang</span>: {{ printData.header.gdg_nama }}</div>
        <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.mut_tanggal), 'dd-MM-yyyy') }}
        </div>
        <div><span class="label">Keterangan</span>: {{ printData.header.mut_ket }}</div>
      </div>

      <div class="items-table">
        <table>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no center">{{ item.kode ? (index + 1) : '' }}</td>
              <td class="kode">{{ item.kode }}</td>
              <td class="nama">{{ item.Nama }}</td>
              <td class="ukuran center">{{ item.ukuran }}</td>
              <td class="qty right">{{ item.jumlah?.toLocaleString('id-ID') || '' }}</td>
              <td class="keterangan"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer">
        <div class="signatures">
          <div>Dibuat Oleh,</div>
          <div>Pengirim,</div>
          <div>Diterima Oleh,</div>
        </div>
        <div class="names">
          <div>( .................... )</div>
          <div>( .................... )</div>
          <div>( .................... )</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.print-container {
  font-family: 'Arial', sans-serif;
  font-size: 10pt;
  color: black;
}

.page {
  padding: 10mm;
}

.header {
  display: flex;
  flex-direction: row;
  justify-content: flex-start; /* ✅ Pastikan rata kiri */
  align-items: flex-start; /* ✅ Ubah dari center ke flex-start */
  gap: 15px; /* ✅ Gunakan gap untuk jarak */
  margin-bottom: 8px;
  width: 100%;
}

.logo {
  height: 40px;
  width: auto;
  margin: 0; /* ✅ Hapus margin-right, gunakan gap di parent */
  flex-shrink: 0; /* ✅ Cegah logo menyusut */
}

.company-info {
  display: flex;
  flex-direction: column;
  text-align: left;
  font-size: 9pt;
  line-height: 1.4;
  flex: 1; /* ✅ Ambil sisa ruang */
}

.title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  margin: 10px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 2px 15px;
  margin-bottom: 10px;
  border-top: 1px solid black;
  border-bottom: 1px solid black;
  padding: 5px 0;
}

.info-grid .label {
  display: inline-block;
  width: 80px;
  font-weight: bold;
}

.items-table table {
  width: 100%;
  border-collapse: collapse;
}

.items-table th,
.items-table td {
  border: 1px solid black;
  padding: 4px 6px;
  height: 20px;
}

.items-table thead th {
  font-weight: bold;
  text-align: center;
  background-color: #f0f0f0;
}

.no {
  width: 5%;
}

.kode {
  width: 20%;
}

.nama {
  width: 40%;
}

.ukuran {
  width: 10%;
}

.qty {
  width: 10%;
}

.keterangan {
  width: 15%;
}

.center {
  text-align: center;
}

.right {
  text-align: right;
}

.footer {
  padding-top: 20px;
}

.signatures {
  display: flex;
  justify-content: space-around;
  text-align: center;
}

.names {
  display: flex;
  justify-content: space-around;
  text-align: center;
  margin-top: 50px;
}

.page-separator {
  border-bottom: 2px dashed #ccc;
  margin: 0 10mm;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 0;
    /* Margin diatur oleh .page */
  }

  body,
  .print-container {
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    border: none;
    box-shadow: none;
    margin: 0;
    padding: 10mm;
    height: 148mm;
    /* Pastikan tidak ada page-break di dalam satu salinan */
    page-break-inside: avoid;
  }

  /* Sembunyikan pemisah saat print */
  .page-separator {
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


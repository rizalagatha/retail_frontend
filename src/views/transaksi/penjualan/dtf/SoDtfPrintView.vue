<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format } from 'date-fns';
import Logo from '@/assets/logo.png';
import QRCode from 'qrcode';

interface PrintData {
  sd_nomor: string;
  sd_so_nomor: string;
  sd_tanggal: string;
  jo_nama: string;
  sd_nama: string;
  jumlah: number;
  ukuran: string;
  sd_kain: string;
  sd_finishing: string;
  sd_datekerja: string;
  sd_workshop: string;
  gdg_nama: string;
  sd_desain: string;
  sd_ket: string;
  sd_jo_kode: string;
  sd_customer?: string;
  imageUrl?: string;
  titik?: string;
  user_create: string;
  created?: string;
  salesNama: string;
  detailBarang: Array<{ nama: string; ukuran: string }>;
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;
const qrCodeData = ref<string | null>(null);

const barangList = computed(() => printData.value?.detailBarang || []);

// Tambahkan fungsi ini
const getFullImageUrl = (path: string | null | undefined) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  // path dari backend contoh: /images/KDC/...
  return `${import.meta.env.VITE_API_BASE_URL}${path}`;
};

const getJenisOrderDisplay = (joKode: string) => {
  switch (joKode) {
    case 'BR': return 'BORDIR';
    case 'SB': return 'SABLON';
    case 'SD': return 'DTF';
    default: return joKode;
  }
};

const fetchPrintData = async (nomor: string) => {
  try {
    const response = await api.get(`/so-dtf-form/print-data/${nomor}`);
    printData.value = response.data;
    if (printData.value.sd_nomor) {
      document.title = printData.value.sd_nomor;

      qrCodeData.value = await QRCode.toDataURL(printData.value.sd_nomor, {
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
  if (nomor) {
    fetchPrintData(nomor);
  }
});
</script>

<template>
  <div class="print-container">
    <div v-if="isLoading" class="text-center">Memuat data...</div>
    <div v-if="printData" class="page">
      <div class="page-header">
        <div class="header-left">
          <img :src="appLogo" alt="Logo" class="logo">

          <div class="title-block">
            <div class="main-title">SO {{ getJenisOrderDisplay(printData.sd_jo_kode) }}</div>
            <span>PO: {{ printData.sd_jo_kode }} {{ printData.sd_customer }}</span>
          </div>
        </div>

        <!-- QR Code kanan -->
        <div class="header-right">
          <img v-if="qrCodeData" :src="qrCodeData" class="qr-image">
        </div>
      </div>

      <div class="content-wrapper">
        <!-- Kolom Kiri: Data -->
        <div class="data-section">
          <div class="data-grid">
            <div class="label">No. SO DTF</div>
            <div class="value">: {{ printData.sd_nomor }}</div>
            <div class="label">No SO</div>
            <div class="value">: {{ printData.sd_so_nomor || '-' }}</div>
            <div class="label">Tanggal</div>
            <div class="value">: {{ format(new Date(printData.sd_tanggal), 'dd/MM/yyyy') }}</div>
            <div class="label">Jenis Order</div>
            <div class="value">: {{ printData.jo_nama }}</div>
            <div class="label">Nama Desain</div>
            <div class="value">: {{ printData.sd_nama }}</div>
            <div class="label">Jumlah</div>
            <div class="value">: {{ printData.jumlah }}</div>
            <div class="label">Kain</div>
            <div class="value">: {{ printData.sd_kain }}</div>
            <div class="label">Finishing</div>
            <div class="value">: {{ printData.sd_finishing }}</div>
            <div class="label">Date Line</div>
            <div class="value">: {{ format(new Date(printData.sd_datekerja), 'dd/MM/yyyy') }}</div>
            <div class="label">Workshop</div>
            <div class="value">: {{ printData.sd_workshop }} - {{ printData.gdg_nama }}</div>
            <div class="label">Desainer</div>
            <div class="value">: {{ printData.sd_desain }}</div>
            <div class="label">Keterangan</div>
            <div class="value keterangan-text">: {{ printData.sd_ket }}</div>
          </div>

          <div v-if="barangList.length" class="barang-table">
            <strong>DETAIL BARANG:</strong>
            <table>
              <thead>
                <tr>
                  <th>Nama Barang</th>
                  <th>Ukuran</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(b, i) in barangList" :key="i">
                  <td>{{ b.nama }}</td>
                  <td>{{ b.ukuran }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="titik-section">
            <strong>TITIK {{ printData.jo_nama }}:</strong>
            <pre class="titik-details">{{ printData.titik }}</pre>
          </div>

          <!-- TTD Section Kecil -->
          <div class="signatures">
            <div class="signature-box">
              <div>Kaosan SC,</div>
              <div class="name-line">( {{ printData.salesNama }} )</div>
            </div>
            <div class="signature-box">
              <div>Mengetahui,</div>
              <div class="name-line">( ......................... )</div>
            </div>
          </div>
        </div>

        <!-- Kolom Kanan: Gambar -->
        <div class="image-container">
          <div v-if="printData.imageUrl" class="image-box">
            <img :src="getFullImageUrl(printData.imageUrl)" alt="Design Preview">
          </div>
          <div v-else class="image-placeholder">
            <span>Preview Gambar</span>
          </div>
        </div>
      </div>

      <div class="footer">
        Dibuat oleh: {{ printData.user_create }} pada {{ printData.created }}
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page {
    size: A4 portrait;
    margin: 0.3cm 0.5cm !important;
  }

  /* ==== PAKSA SCALE 77% (AKURAT SESUAI PRINT PREVIEW KAMU) ==== */
  html {
    transform: scale(0.77) !important;
    transform-origin: top left !important;
    width: 130% !important;
    /* kompensasi penyusutan agar layout tidak gepeng */
  }

  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* === Visibility rules === */
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

  /* biarkan tinggi flexible */
  .page {
    width: 100% !important;
    min-height: auto !important;
    margin: 0 !important;
    padding: 0.3cm 0.5cm !important;
    box-shadow: none !important;
    page-break-after: always;
  }

  .image-box img {
    max-height: 250px !important;
  }
}

.page {
  background: white;
  padding: 0.3cm 0.5cm;
  margin: 10px auto;
  width: 21cm;
  min-height: 29.7cm;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  font-family: 'Arial', sans-serif;
  font-size: 10pt;
  color: #333;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1.5px solid black;
  padding-bottom: 5px;
  margin-bottom: 8px;
}

.header-left {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.title-block {
  display: flex;
  flex-direction: column;
}

.main-title {
  font-size: 16pt;
  font-weight: bold;
  margin-bottom: 2px;
}

.po-title {
  font-size: 11pt;
  font-weight: bold;
}

.qr-image {
  width: 50px;
  height: 50px;
  margin-left: 15px;
}

.header-right {
  font-size: 10pt;
  font-weight: bold;
}

.logo {
  width: 45px;
  height: auto;
  margin-right: 10px;
}

.main-title {
  font-size: 14pt;
  font-weight: bold;
}

/* Layout Utama: Data + Gambar */
.content-wrapper {
  display: flex;
  gap: 15px;
  margin-bottom: 10px;
  flex-grow: 1;
}

.data-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.data-grid {
  display: grid;
  grid-template-columns: 100px auto;
  row-gap: 3px;
  column-gap: 8px;
  margin-bottom: 10px;
}

.label {
  font-weight: bold;
  font-size: 9pt;
}

.value {
  word-wrap: break-word;
  font-size: 9pt;
}

.keterangan-text {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.barang-table {
  margin: 10px 0;
  font-size: 9pt;
}

.barang-table table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 5px;
}

.barang-table th,
.barang-table td {
  border: 1px solid #aaa;
  padding: 4px 6px;
}

.titik-section {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed #ccc;
  margin-bottom: 10px;
}

.titik-details {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 9pt;
  margin-top: 4px;
  margin-bottom: 0;
}

/* TTD Section - 2 Kolom Kecil */
.signatures {
  display: flex;
  gap: 25px;
  margin-top: 12px;
  text-align: center;
  font-size: 8.5pt;
}

.signature-box {
  width: 140px;
  /* Lebar tetap, kecil */
}

.name-line {
  margin-top: 35px;
  font-weight: bold;
}

/* Gambar Tanpa Border */
.image-container {
  width: 50%;
  flex-shrink: 0;
}

.image-box,
.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9f9f9;
  min-height: 500px;
}

.image-box img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-placeholder {
  color: #ccc;
  font-size: 14pt;
}

.footer {
  border-top: 1px solid #ccc;
  padding-top: 4px;
  margin-top: 8px;
  font-style: italic;
  font-size: 7.5pt;
  color: #555;
}
</style>

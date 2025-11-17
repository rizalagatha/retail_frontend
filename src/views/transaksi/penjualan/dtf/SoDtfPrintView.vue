<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format } from 'date-fns';
import Logo from '@/assets/logo.png';

interface PrintData {
  sd_nomor: string;
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
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;

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
          <span class="main-title">SO {{ getJenisOrderDisplay(printData.sd_jo_kode) }}</span>
        </div>
        <div class="header-right">
          <span>PO: {{ printData.sd_jo_kode }} {{ printData.sd_customer }}</span>
        </div>
      </div>

      <div class="content-wrapper">
        <!-- Kolom Kiri: Data -->
        <div class="data-section">
          <div class="data-grid">
            <div class="label">No. SO DTF</div>
            <div class="value">: {{ printData.sd_nomor }}</div>
            <div class="label">Tanggal</div>
            <div class="value">: {{ format(new Date(printData.sd_tanggal), 'dd/MM/yyyy') }}</div>
            <div class="label">Jenis Order</div>
            <div class="value">: {{ printData.jo_nama }}</div>
            <div class="label">Nama Desain</div>
            <div class="value">: {{ printData.sd_nama }}</div>
            <div class="label">Jumlah</div>
            <div class="value">: {{ printData.jumlah }}</div>
            <div class="label">Ukuran</div>
            <div class="value">: {{ printData.ukuran }}</div>
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

          <div class="titik-section">
            <strong>TITIK {{ printData.jo_nama }}:</strong>
            <pre class="titik-details">{{ printData.titik }}</pre>
          </div>

          <!-- TTD Section Kecil -->
          <div class="signatures">
            <div class="signature-box">
              <div>Kaosan SC,</div>
              <div class="name-line">( {{ printData.user_create }} )</div>
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
    size: A4;
    margin: 0.5cm;
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
}

.page {
  background: white;
  padding: 1cm;
  margin: 20px auto;
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
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid black;
  padding-bottom: 10px;
  margin-bottom: 15px;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  font-size: 12pt;
  font-weight: bold;
}

.logo {
  width: 60px;
  height: auto;
  margin-right: 15px;
}

.main-title {
  font-size: 18pt;
  font-weight: bold;
}

/* Layout Utama: Data + Gambar */
.content-wrapper {
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
  flex-grow: 1;
}

.data-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.data-grid {
  display: grid;
  grid-template-columns: 110px auto;
  row-gap: 4px;
  column-gap: 10px;
  margin-bottom: 15px;
}

.label {
  font-weight: bold;
  font-size: 9.5pt;
}

.value {
  word-wrap: break-word;
  font-size: 9.5pt;
}

.keterangan-text {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.titik-section {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px dashed #ccc;
  margin-bottom: 15px;
}

.titik-details {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 9.5pt;
  margin-top: 5px;
  margin-bottom: 0;
}

/* TTD Section - 2 Kolom Kecil */
.signatures {
  display: flex;
  gap: 30px;
  margin-top: 20px;
  text-align: center;
  font-size: 9pt;
}

.signature-box {
  width: 150px;
  /* Lebar tetap, kecil */
}

.name-line {
  margin-top: 40px;
  font-weight: bold;
}

/* Gambar Tanpa Border */
.image-container {
  width: 45%;
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
  padding-top: 5px;
  margin-top: 10px;
  font-style: italic;
  font-size: 8pt;
  color: #555;
}
</style>

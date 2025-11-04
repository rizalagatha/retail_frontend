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

      <div class="master-data">
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
          <div class="value">: {{ printData.sd_ket }}</div>
        </div>
        <div v-if="printData.imageUrl" class="image-preview">
          <img :src="getFullImageUrl(printData.imageUrl)" alt="Design Preview">
        </div>
      </div>

      <div class="titik-section">
        <strong>TITIK {{ printData.jo_nama }}:</strong>
        <pre class="titik-details">{{ printData.titik }}</pre>
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
}

.page {
  background: white;
  padding: 1.5cm;
  margin: 20px auto;
  width: 21cm;
  min-height: 29.7cm;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  font-family: 'Arial', sans-serif;
  /* <-- FONT BARU */
  font-size: 10pt;
  /* <-- Ukuran font disesuaikan */
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
  /* Ukuran logo */
  height: auto;
  margin-right: 15px;
}

.title-section {
  flex-grow: 1;
}

.main-title {
  font-size: 18pt;
  font-weight: bold;
}

.sub-title {
  font-size: 11pt;
  color: #555;
}

.master-data {
  display: flex;
  gap: 1rem;
  padding: 10px 0;
}

.data-grid {
  display: grid;
  grid-template-columns: 120px auto;
  row-gap: 5px;
  /* Jarak antar baris */
  column-gap: 10px;
  flex-grow: 1;
}

.label {
  font-weight: bold;
}

.image-preview {
  flex-shrink: 0;
  width: 150px;
  border: 1px solid #ccc;
  padding: 5px;
}

.image-preview img {
  width: 100%;
  height: auto;
}

.titik-section {
  border-top: 1px dashed #ccc;
  padding-top: 10px;
  margin-top: auto;
  /* Mendorong ke bawah */
}

.titik-details {
  white-space: pre-wrap;
  /* Agar baris baru (\n) berfungsi */
  font-family: inherit;
  font-size: inherit;
  margin-top: 5px;
}

.footer {
  border-top: 1px solid #ccc;
  padding-top: 5px;
  margin-top: 20px;
  font-style: italic;
  font-size: 8pt;
  color: #555;
}
</style>

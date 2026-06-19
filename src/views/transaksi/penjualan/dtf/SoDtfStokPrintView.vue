<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";
import QRCode from "qrcode";

interface PrintData {
  sd_nomor: string;
  sd_tanggal: string;
  jo_nama: string;
  sd_nama: string;
  jumlah: number;
  ukuran: string;
  sd_datekerja: string;
  gdg_nama: string;
  sd_desain: string;
  sd_ket: string;
  sd_jo_kode: string;
  imageUrl?: string;
  user_create: string;
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;
const qrCodeData = ref<string | null>(null);

const getFullImageUrl = (path: string | null | undefined, nomorSoDtf: string | undefined) => {
  // 1. Jika backend sudah mengembalikan URL lengkap (sangat jarang terjadi tapi buat jaga-jaga)
  if (path && path.startsWith("http")) return path;

  // 2. Jika tidak ada path, BIKIN MANUAL berdasarkan Standar Folder Backend Delphi
  // Format Standar Delphi/Backend: /images/{KODE_CABANG}/{NOMOR_SO}.jpg
  if (nomorSoDtf) {
    const cabang = nomorSoDtf.substring(0, 3); // Ambil 3 huruf pertama (misal: 'K01')

    // Kita paksa pakai .jpg karena aplikasi desktop menyimpannya dalam format .jpg
    return `${import.meta.env.VITE_API_BASE_URL}/images/${cabang}/${nomorSoDtf}.jpg`;
  }

  return null;
};

// Ubah computed property ini:
const imageFullUrl = computed(() =>
  getFullImageUrl(printData.value?.imageUrl, printData.value?.sd_nomor)
);

const getSoTitle = (joKode: string) => {
  let title = "SO STICKER";
  if (joKode === "SD") title = "SO DTF";
  else if (joKode === "DP") title = "SO DTF PREMIUM";
  return `${title} (Sticker)`;
};

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/so-dtf-stok-form/print-data/${nomor}`);

    const data = response.data as PrintData; // 🔥 penting

    printData.value = data;

    if (data.sd_nomor) {
      document.title = data.sd_nomor;

      qrCodeData.value = await QRCode.toDataURL(data.sd_nomor, {
        width: 200,
        margin: 1,
      });
    }
  } catch {
    alert("Gagal memuat data cetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (val) => {
  if (!val) {
    nextTick(() => window.print());
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
      <!-- HEADER -->
      <div class="page-header">
        <div class="header-left">
          <img :src="appLogo" class="logo" />

          <div class="header-title">
            <div class="main-title">{{ getSoTitle(printData.sd_jo_kode) }}</div>
          </div>
        </div>

        <!-- QR Code Kanan -->
        <div class="header-right">
          <img v-if="qrCodeData" :src="qrCodeData" class="qr-image" />
        </div>
      </div>

      <!-- MASTER DATA -->
      <div class="master-data">
        <div class="data-grid">
          <div class="label">No. SO DTF</div>
          <div class="value">: {{ printData.sd_nomor }}</div>

          <div class="label">Tanggal</div>
          <div class="value">: {{ format(parseISO(printData.sd_tanggal), "dd/MM/yyyy") }}</div>

          <div class="label">Jenis Order</div>
          <div class="value">: {{ printData.jo_nama }}</div>

          <div class="label">Nama Desain</div>
          <div class="value">: {{ printData.sd_nama }}</div>

          <div class="label">Jumlah</div>
          <div class="value">: {{ printData.jumlah }}</div>

          <div class="label">Ukuran</div>
          <div class="value">: {{ printData.ukuran }}</div>

          <div class="label">Date Line</div>
          <div class="value">: {{ format(parseISO(printData.sd_datekerja), "dd/MM/yyyy") }}</div>

          <div class="label">Workshop</div>
          <div class="value">: {{ printData.gdg_nama }}</div>

          <div class="label">Desainer</div>
          <div class="value">: {{ printData.sd_desain }}</div>

          <div class="label">Keterangan</div>
          <div class="value">: {{ printData.sd_ket }}</div>
        </div>
      </div>

      <!-- IMAGE -->
      <div class="image-section">
        <img v-if="imageFullUrl" :src="imageFullUrl" class="preview-big" />
        <div v-else class="no-image">No Image Available</div>
      </div>

      <!-- SIGNATURE -->
      <div class="signatures">
        <table>
          <thead>
            <tr>
              <th>Kaosan SC</th>
              <th>Mengetahui</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="signature-space">( {{ printData.user_create }} )</td>
              <td class="signature-space">( ......................... )</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* === PRINT SETTING === */
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
    top: 0;
    left: 0;
    width: 100%;
  }
}

/* === LAYOUT PAGE === */
.page {
  background: white;
  padding: 1.5cm;
  margin: 20px auto;
  width: 21cm;
  min-height: 29.7cm;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  font-family: "Arial", sans-serif;
  font-size: 10pt;
  color: #333;
  display: flex;
  flex-direction: column;
}

/* === HEADER === */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 2px solid #000;
  padding-bottom: 8px;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.header-right {
  display: flex;
  align-items: flex-start;
}

.qr-image {
  width: 50px;
  height: 50px;
}

.logo {
  width: 60px;
  margin-right: 20px;
}

.header-title {
  display: flex;
  flex-direction: column;
}

.main-title {
  font-size: 16pt;
  font-weight: bold;
}

/* === MASTER DATA === */
.master-data {
  margin-top: 10px;
}

.data-grid {
  display: grid;
  grid-template-columns: 110px auto;
  row-gap: 4px;
  column-gap: 10px;
}

.label {
  font-weight: bold;
}

/* === IMAGE === */
.image-section {
  margin: 25px 0;
  display: flex;
  justify-content: flex-start;
  /* FIX AGAR TIDAK TENGAH */
}

.preview-big {
  width: 260px;
  /* Lebih besar & proporsional */
  border: 1px solid #ccc;
  object-fit: contain;
}

.no-image {
  font-style: italic;
  color: gray;
}

/* === SIGNATURE === */
.signatures {
  margin-top: 40px;
  display: flex;
  justify-content: flex-end;
}

.signatures table {
  width: 400px;
  border-collapse: collapse;
  text-align: center;
}

.signatures th,
.signatures td {
  border: 1px solid #333;
  padding: 8px;
}

.signature-space {
  height: 60px;
  vertical-align: bottom;
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

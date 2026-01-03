<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';
import LogoReszo from '@/assets/rezso.jpg';
import QRCode from "qrcode";

interface PrintHeader {
  nomor: string;
  tanggal: string;
  keterangan: string;
  created: string;
  user_create: string;
  dariStore: string;
  keGudang: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
}
interface PrintDetail {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}
interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const qrCodeData = ref<string | null>(null);
const isLoading = ref(true);
const dynamicLogo = computed(() => {
  if (printData.value?.header?.nomor?.startsWith('K04')) {
    return LogoReszo;
  }
  return Logo;
});

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/retur-dc-form/print/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header.nomor;

    // ✅ Generate QR Code berdasarkan nomor retur DC
    qrCodeData.value = await QRCode.toDataURL(printData.value.header.nomor, {
      width: 180,
      margin: 1,
    });

  } catch {
    alert("Gagal memuat data untuk dicetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (val) => {
  if (!val) nextTick(() => window.print());
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
        <img :src="dynamicLogo" alt="Logo" class="logo" />

        <div class="company-info">
          <strong>{{ printData.header.perush_nama }}</strong>
          <div>{{ printData.header.perush_alamat }}</div>
          <div>Telp. {{ printData.header.perush_telp }}</div>
        </div>

        <!-- ✅ QR CODE DI KANAN HEADER -->
        <img v-if="qrCodeData" :src="qrCodeData" class="qr-code" />
      </div>

      <div class="title">Retur Barang ke DC</div>

      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.nomor }}</div>
        <div><span class="label">Dari Store</span>: {{ printData.header.dariStore }}</div>
        <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.tanggal), 'dd-MM-yyyy') }}
        </div>
        <div class="keterangan"><span class="label">Keterangan</span>: {{ printData.header.keterangan }}</div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th class="no">No</th>
            <th class="kode">Kode</th>
            <th class="nama">Nama Barang</th>
            <th class="ukuran">Ukuran</th>
            <th class="jumlah">Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in printData.details" :key="index">
            <td class="no">{{ index + 1 }}</td>
            <td class="kode">{{ item.kode }}</td>
            <td class="nama">{{ item.nama }}</td>
            <td class="ukuran">{{ item.ukuran }}</td>
            <td class="jumlah">{{ item.jumlah }}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        <div class="created-info">
          Created: {{ printData.header.created }}
        </div>
        <div class="signatures">
          <div>Admin,</div>
          <div>Pengirim,</div>
          <div>Diterima,</div>
        </div>
        <div class="names">
          <div>( {{ printData.header.user_create }} )</div>
          <div>( .................... )</div>
          <div>( .................... )</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.print-container {
  background: #eee;
  padding: 20px;
  font-family: 'Arial', sans-serif;
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
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 15px;
  /* ✅ Gunakan gap untuk jarak */
  margin-bottom: 20px;
  width: 100%;
}

.qr-code {
  height: 50px;
  width: 50px;
  object-fit: contain;
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

.title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  margin: 20px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 15px;
  margin-bottom: 15px;
}

.info-grid .label {
  display: inline-block;
  width: 90px;
  font-weight: bold;
}

.info-grid .keterangan {
  grid-column: 1 / -1;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

.items-table th,
.items-table td {
  border: 1px solid black;
  padding: 5px 8px;
  vertical-align: top;
}

.items-table thead th {
  font-weight: bold;
  text-align: center;
  background-color: #f0f0f0;
}

.items-table .no {
  width: 5%;
  text-align: center;
}

.items-table .kode {
  width: 20%;
}

.items-table .nama {
  width: auto;
}

.items-table .ukuran {
  width: 10%;
  text-align: center;
}

.items-table .jumlah {
  width: 10%;
  text-align: right;
}

.footer {
  margin-top: auto;
  padding-top: 30px;
  font-size: 9pt;
}

.created-info {
  text-align: right;
  font-size: 8pt;
  font-style: italic;
  margin-bottom: 20px;
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
  margin-top: 60px;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 15mm;
  }

  body,
  .page {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    background: #fff !important;
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

  .items-table thead th {
    background-color: #f0f0f0 !important;
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

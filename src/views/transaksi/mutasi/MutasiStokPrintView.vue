<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';
import QRCode from "qrcode";

interface PrintHeader {
  mso_nomor: string;
  jenis_mutasi: string;
  mso_tanggal: string;
  mso_so_nomor: string;
  mso_ket: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  created: string;
  user_create: string;
}

interface PrintDetail {
  msod_kode: string;
  nama: string;
  msod_ukuran: string;
  msod_jumlah: number;
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

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/mutasi-stok-form/print/${nomor}`);
    printData.value = response.data;

    if (printData.value.header?.mso_nomor) {
      // ✔ QR Code digenerate langsung — sama seperti Mutasi Out & Mutasi In
      qrCodeData.value = await QRCode.toDataURL(printData.value.header.mso_nomor, {
        width: 90,
        margin: 1
      });

      document.title = printData.value.header.mso_nomor;
    }
  } catch (error) {
    alert("Gagal memuat data untuk dicetak.");
    console.error("Error fetching print data:", error);
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (done) => {
  if (!done) {
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
        <div class="header-left">
          <img :src="appLogo" class="logo" />
          <div class="company-info">
            <strong>{{ printData.header.perush_nama }}</strong>
            <div>{{ printData.header.perush_alamat }}</div>
            <div>Telp. {{ printData.header.perush_telp }}</div>
          </div>
        </div>

        <div class="header-right">
          <img v-if="qrCodeData" :src="qrCodeData" class="qr-code" />
        </div>
      </div>

      <div class="title">Mutasi Stok</div>

      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.mso_nomor }}</div>
        <div><span class="label">Jenis Mutasi</span>: {{ printData.header.jenis_mutasi }}</div>
        <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.mso_tanggal), 'dd-MM-yyyy')
          }}</div>
        <div><span class="label">No. Pesanan</span>: {{ printData.header.mso_so_nomor }}</div>
        <div class="keterangan"><span class="label">Keterangan</span>: {{ printData.header.mso_ket }}</div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th class="no">No</th>
              <th class="kode">Kode</th>
              <th class="nama">Nama</th>
              <th class="ukuran">Ukuran</th>
              <th class="qty">Qty</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no">{{ index + 1 }}</td>
              <td class="kode">{{ item.msod_kode }}</td>
              <td class="nama">{{ item.nama }}</td>
              <td class="ukuran">{{ item.msod_ukuran }}</td>
              <td class="qty">{{ item.msod_jumlah }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="created-date">
        Created: {{ printData.header.created }}
      </div>

      <div class="footer">
        <div class="signatures">
          <div>Admin,</div>
          <div>Mengetahui,</div>
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
/* (Salin style dari MutasiOutPrintView.vue, sesuaikan jika perlu) */
.print-container {
  font-family: 'Segoe UI', Tahoma, sans-serif;
  font-size: 9pt;
}

.page {
  border: 1px solid #ccc;
  padding: 15mm;
  min-height: 120mm;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-bottom: 10px;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.logo {
  height: 40px;
  width: auto;
}

.company-info {
  display: flex;
  flex-direction: column;
  text-align: left;
  font-size: 8.5pt;
  line-height: 1.4;
}

.header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.qr-code {
  height: 40px;
  width: 40px;
  border: 1px solid #000;
}

.title {
  text-align: left;
  font-size: 14pt;
  font-weight: bold;
  margin-bottom: 8px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 15px;
  margin-bottom: 8px;
  font-size: 8.5pt;
}

.info-grid .label {
  display: inline-block;
  width: 80px;
}

.info-grid .keterangan {
  grid-column: 1 / -1;
}

.items-table {
  margin-top: 10px;
  width: 100%;
}

.items-table table {
  width: 100%;
  border-collapse: collapse;
}

.items-table th,
.items-table td {
  border: 1px solid black;
  padding: 4px 6px;
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
  width: 50%;
}

.items-table .ukuran {
  width: 10%;
  text-align: center;
}

.items-table .qty {
  width: 15%;
  text-align: right;
}

.created-date {
  text-align: right;
  font-size: 8pt;
  margin-top: 5px;
}

.footer {
  padding-top: 10px;
  font-size: 8.5pt;
}

.signatures {
  display: flex;
  justify-content: space-between;
  text-align: center;
}

.signatures>div {
  width: 30%;
}

.names {
  display: flex;
  justify-content: space-between;
  text-align: center;
  margin-top: 45px;
}

.names>div {
  width: 30%;
}

@media print {
  @page {
    size: A4;
    margin: 10mm;
  }

  body,
  .print-container {
    font-size: 8.5pt;
  }

  .page {
    border: none;
    box-shadow: none;
    margin: 0;
    padding: 0;
  }
}
</style>

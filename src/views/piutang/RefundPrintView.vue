<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';

interface PrintDetail {
  rfd_notrs: string;
  rfd_cus_kode: string;
  cus_nama: string;
  rfd_nominal: number;
  rfd_refund: number;
  rfd_ket: string;
  rfd_bank: string;
  rfd_norek: string;
  rfd_atasnama: string;
}

interface PrintHeader {
  rf_nomor: string;
  rf_tanggal: string;
  gdg_inv_nama: string;
  gdg_inv_alamat: string;
  gdg_inv_kota: string;
  gdg_inv_telp: string;
  totalRefund: number;
  terbilang: string;
  usr_signature: string;
  user_create: string;
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
    const response = await api.get(`/refund-form/print/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header.rf_nomor;
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
          <strong>{{ printData.header.gdg_inv_nama }}</strong>
          <div>{{ printData.header.gdg_inv_alamat }}, {{ printData.header.gdg_inv_kota }}</div>
          <div>Telp. {{ printData.header.gdg_inv_telp }}</div>
        </div>
      </div>

      <div class="title">Pengajuan Refund</div>

      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.rf_nomor }}</div>
        <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.rf_tanggal), 'dd-MM-yyyy') }}</div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th class="no">No</th>
              <th class="notrs">No. Transaksi</th>
              <th class="kdcus">KdCus</th>
              <th class="customer">Customer</th>
              <th class="nominal">Nominal</th>
              <th class="ket">Keterangan</th>
              <th class="bank">Bank Tujuan</th>
              <th class="norek">No. Rekening</th>
              <th class="an">Atas Nama</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no center">{{ index + 1 }}</td>
              <td class="notrs">{{ item.rfd_notrs }}</td>
              <td class="kdcus">{{ item.rfd_cus_kode }}</td>
              <td class="customer">{{ item.cus_nama }}</td>
              <td class="nominal right">{{ (item.rfd_refund || item.rfd_nominal || 0).toLocaleString('id-ID') }}</td>
              <td class="ket">{{ item.rfd_ket }}</td>
              <td class="bank">{{ item.rfd_bank }}</td>
              <td class="norek">{{ item.rfd_norek }}</td>
              <td class="an">{{ item.rfd_atasnama }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="text-end font-weight-bold">Total Refund:</td>
              <td class="right font-weight-bold">{{ (printData.header.totalRefund || 0).toLocaleString('id-ID') }}</td>
              <td colspan="4"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="terbilang">
        <strong>Terbilang:</strong>
        <em>{{ printData.header.terbilang }} Rupiah</em>
      </div>

      <div class="footer">
        <div class="signatures">
          <div>Dibuat Oleh,</div>
          <div>Mengetahui,</div>
          <div>Di Acc,</div>
        </div>
        <div class="names">
          <div>
            <img v-if="printData.header.usr_signature !== 'NO'"
              :src="`/images/signatures/${printData.header.usr_signature}.jpg`" class="signature-img" />
            <span v-else>( .................... )</span>
            <div>( {{ printData.header.user_create }} )</div>
          </div>
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
  font-size: 9pt;
  color: black;
}

.page {
  padding: 10mm;
}

.header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.logo {
  height: 40px;
  margin-right: 15px;
}

.company-info {
  font-size: 9pt;
}

.title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  margin: 10px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 15px;
  margin-bottom: 10px;
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
  padding: 3px 5px;
}

.items-table thead th {
  font-weight: bold;
  text-align: center;
}

.items-table tfoot td {
  border: none;
  padding-top: 5px;
}

.no {
  width: 3%;
}

.notrs {
  width: 12%;
}

.kdcus {
  width: 8%;
}

.customer {
  width: 15%;
}

.nominal {
  width: 10%;
}

.ket {
  width: 17%;
}

.bank {
  width: 10%;
}

.norek {
  width: 10%;
}

.an {
  width: 15%;
}

.center {
  text-align: center;
}

.right {
  text-align: right;
}

.font-weight-bold {
  font-weight: bold;
}

.terbilang {
  margin-top: 10px;
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

.signature-img {
  height: 45px;
  margin-bottom: 5px;
}

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

  .page {
    border: none;
    box-shadow: none;
    margin: 0;
    padding: 0;
  }

  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>

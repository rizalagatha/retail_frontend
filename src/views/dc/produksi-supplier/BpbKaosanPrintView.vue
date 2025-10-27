<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';

interface PrintHeader {
  bpb_nomor: string;
  bpb_tanggal: string;
  bpb_keterangan: string;
  perush_nama: string;
  perush_alamat: string;
  perush_kota: string;
  perush_telp: string;
  sup_nama: string;
  sup_alamat: string;
  sup_kota: string;
  totalQty: number;
  bpb_nominal: number;
  terbilang: string;
  user_create: string;
}

interface PrintDetail {
  bpbd_kode: string;
  nama: string;
  bahan: string;
  bpbd_ukuran: string;
  bpbd_bagus: number;
  bpbd_bs: number;
  bpbd_jumlah: number;
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
    const response = await api.get(`/bpb-kaosan-form/print/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header.bpb_nomor;
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
          <div>{{ printData.header.perush_alamat }}, {{ printData.header.perush_kota }}</div>
          <div>Telp. {{ printData.header.perush_telp }}</div>
        </div>
        <div class="title-doc">BPB</div>
      </div>

      <div class="info-grid">
        <div class="header-left">
          <div><span class="label">Nomor</span>: {{ printData.header.bpb_nomor }}</div>
          <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.bpb_tanggal), 'dd-MM-yyyy') }}
          </div>
          <div><span class="label">Keterangan</span>: {{ printData.header.bpb_keterangan }}</div>
        </div>
        <div class="header-right">
          <div><span class="label">Supplier</span>: {{ printData.header.sup_nama }}</div>
          <div><span class="label"></span> {{ printData.header.sup_alamat }}</div>
          <div><span class="label"></span> {{ printData.header.sup_kota }}</div>
        </div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th class="no">No</th>
              <th class="kode">Kode</th>
              <th class="nama">Nama</th>
              <th class="ukuran">Ukuran</th>
              <th class="jumlah">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no center">{{ index + 1 }}</td>
              <td class="kode">{{ item.bpbd_kode }}</td>
              <td class="nama">{{ item.nama }} {{ item.bahan }}</td>
              <td class="ukuran center">{{ item.bpbd_ukuran }}</td>
              <td class="jumlah" style="white-space: pre-wrap;">
                Bagus: {{ item.bpbd_bagus }}
                Bs: {{ item.bpbd_bs }}
                <strong>Total: {{ item.bpbd_jumlah }}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer">
        <div class="total-section">
          <div><span class="label">Total Qty:</span> {{ (printData.header.totalQty || 0).toLocaleString('id-ID') }}
          </div>
          <div><span class="label">Nominal:</span> {{ (printData.header.bpb_nominal || 0).toLocaleString('id-ID') }}
          </div>
        </div>
        <div class="terbilang">
          <strong>Terbilang:</strong>
          <em>{{ printData.header.terbilang }} Rupiah</em>
        </div>
      </div>
      <div class="signatures">
        <div>Dibuat Oleh,</div>
        <div>Checkers,</div>
        <div>Kepala Gudang,</div>
      </div>
      <div class="names">
        <div>( {{ printData.header.user_create }} )</div>
        <div>( .................... )</div>
        <div>( .................... )</div>
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
  align-items: flex-start;
  margin-bottom: 8px;
  position: relative;
}

.logo {
  height: 40px;
  margin-right: 15px;
}

.company-info {
  font-size: 9pt;
}

.title-doc {
  position: absolute;
  top: 0;
  right: 0;
  font-size: 14pt;
  font-weight: bold;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  vertical-align: top;
}

.items-table thead th {
  font-weight: bold;
  text-align: center;
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
  width: 15%;
}

.jumlah {
  width: 20%;
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

.footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding-top: 10px;
  border-top: 1px solid black;
}

.total-section {
  text-align: right;
}

.signatures {
  display: flex;
  justify-content: space-around;
  text-align: center;
  margin-top: 20px;
}

.names {
  display: flex;
  justify-content: space-around;
  text-align: center;
  margin-top: 50px;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 10mm;
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
    padding: 0;
  }
}
</style>

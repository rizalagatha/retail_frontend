<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';

const route = useRoute();
const printData = ref<any>(null);
const isLoading = ref(true);
const appLogo = Logo;

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/pengajuan-produksi-form/print/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header.pp_nomor;
  } catch (error) {
    alert("Gagal memuat data untuk dicetak.");
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
      </div>

      <div class="title">Pengajuan Produksi</div>
      <div class="created-info">Created: {{ printData.header.created }}</div>

      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.pp_nomor }}</div>
        <div><span class="label">Supplier</span>: {{ printData.header.sup_kode }} - {{ printData.header.sup_nama }}
        </div>
        <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.pp_tanggal), 'dd-MM-yyyy') }}</div>
        <div><span class="label">Alamat</span>: {{ printData.header.alamat }}</div>
        <div><span class="label">Keterangan</span>: {{ printData.header.pp_ket }}</div>
        <div><span class="label">Telepon</span>: {{ printData.header.sup_telp }}</div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th class="no">No</th>
              <th class="nama">Nama</th>
              <th class="bahan">Bahan</th>
              <th class="ukuran-qty">Qty dan Harga</th>
              <th class="total">Total</th>
              <th class="desain">Desain</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no center">{{ index + 1 }}</td>
              <td class="nama">{{ item.nama }}</td>
              <td class="bahan">{{ item.bahan }}</td>
              <td class="ukuran-qty" style="white-space: pre-wrap;">{{ item.ukuran_qty_harga }}</td>
              <td class="total right">{{ item.total_harga.toLocaleString('id-ID') }}</td>
              <td class="desain"></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="text-end font-weight-bold">Total Harga :</td>
              <td class="total right font-weight-bold">{{ printData.header.grandTotal.toLocaleString('id-ID') }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="footer">
        <div class="signatures">
          <div>Dibuat Oleh,</div>
          <div>Mengetahui,</div>
        </div>
        <div class="names">
          <div>( {{ printData.header.user_create }} )</div>
          <div>( .................... )</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* (Salin style dari MutasiAntarGudangPrintView.vue, sesuaikan lebar kolom) */
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
  align-items: center;
  margin-bottom: 5px;
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
  margin-bottom: 2px;
}

.created-info {
  text-align: center;
  font-size: 8pt;
  margin-bottom: 10px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
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
  padding: 4px 6px;
}

.items-table thead th {
  font-weight: bold;
  text-align: center;
  background-color: #f0f0f0;
}

.items-table tfoot td {
  border: none;
  padding-top: 5px;
}

.no {
  width: 5%;
}

.nama {
  width: 30%;
}

.bahan {
  width: 15%;
}

.ukuran-qty {
  width: 25%;
}

.total {
  width: 15%;
}

.desain {
  width: 10%;
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
  padding-top: 20px;
}

.signatures {
  display: flex;
  justify-content: space-between;
  text-align: center;
  padding: 0 50px;
}

.names {
  display: flex;
  justify-content: space-between;
  text-align: center;
  margin-top: 50px;
  padding: 0 50px;
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
  }

  .page {
    border: none;
    box-shadow: none;
    margin: 0;
    padding: 0;
  }
}
</style>

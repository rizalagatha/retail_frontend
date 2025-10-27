<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png'; // Pastikan path logo ini benar

interface PrintHeader {
  po_nomor: string;
  po_tanggal: string;
  po_referensi: string;
  po_note: string;
  bilang: string;
  tq: number;
  gtotal: number;
  perush_nama: string;
  perush_alamat: string;
  perush_kota: string;
  perush_telp: string;
  perush_fax: string;
  perush_namapemilik: string;
  sup_nama: string;
  alamat: string;
  sup_telp: string;
  sup_cp: string;
  created: string;
}

interface PrintDetail {
  nama: string;
  ket: string;
  ukuran_qty_harga: string;
  total_harga: number;
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
    // --- PASTIKAN URL MEMANGGIL ENDPOINT YANG BENAR ---
    const response = await api.get(`/po-kaosan-form/print/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header.po_nomor;
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
          <div>Telp. {{ printData.header.perush_telp }} / Fax. {{ printData.header.perush_fax }}</div>
        </div>
        <div class="title-doc">Purchase Order</div>
      </div>

      <div class="info-grid">
        <div class="supplier-info">
          <div class="supplier-label">Supplier:</div>
          <strong>{{ printData.header.sup_nama }}</strong>
          <div>{{ printData.header.alamat }}</div>
          <div>Telp. {{ printData.header.sup_telp }}</div>
          <div>Up. {{ printData.header.sup_cp }}</div>
        </div>
        <div class="po-info">
          <div><span class="label">No PO</span>: {{ printData.header.po_nomor }}</div>
          <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.po_tanggal), 'dd-MM-yyyy') }}
          </div>
          <div><span class="label">No Referensi</span>: {{ printData.header.po_referensi }}</div>
          <div class="created-info">Created: {{ printData.header.created }}</div>
        </div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th class="no">No</th>
              <th class="nama">Nama</th>
              <th class="ket">Ket</th>
              <th class="ukuran-qty">Qty dan Harga</th>
              <th class="total">Total</th>
              <th class="desain">Desain</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no center">{{ index + 1 }}</td>
              <td class="nama">{{ item.nama }}</td>
              <td class="ket">{{ item.ket }}</td>
              <td class="ukuran-qty" style="white-space: pre-wrap;">{{ item.ukuran_qty_harga }}</td>
              <td class="total right">{{ (item.total_harga || 0).toLocaleString('id-ID') }}</td>
              <td class="desain"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer">
        <div class="note-section">
          <strong>Note:</strong>
          <div class="note-content" style="white-space: pre-wrap;">{{ printData.header.po_note }}</div>
          <div class="terbilang">
            <strong>Terbilang:</strong>
            <em>{{ printData.header.bilang }} Rupiah</em>
          </div>
        </div>
        <div class="total-section">
          <div><span class="label">Total:</span> {{ (printData.header.tq || 0).toLocaleString('id-ID') }} Pcs</div>
          <div><span class="label">Total:</span> {{ (printData.header.gtotal || 0).toLocaleString('id-ID') }}</div>
        </div>
        <div class="signatures">
          <div>Hormat Kami,</div>
          <div class="signature-space">( {{ printData.header.perush_namapemilik }} )</div>
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
  grid-template-columns: 2fr 1fr;
  gap: 2px 15px;
  margin-bottom: 10px;
  border-top: 1px solid black;
  border-bottom: 1px solid black;
  padding: 5px 0;
}

.supplier-label {
  font-size: 8pt;
  text-transform: uppercase;
}

.po-info .label {
  display: inline-block;
  width: 80px;
}

.created-info {
  font-size: 8pt;
  margin-top: 5px;
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
  width: 4%;
}

.nama {
  width: 25%;
}

.ket {
  width: 20%;
}

.ukuran-qty {
  width: 25%;
  font-size: 9pt;
}

.total {
  width: 13%;
}

.desain {
  width: 13%;
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
  padding-top: 10px;
  display: grid;
  grid-template-columns: 3fr 1fr 1fr;
  border-top: 1px solid black;
}

.note-content {
  font-size: 9pt;
}

.terbilang {
  margin-top: 10px;
}

.total-section {
  text-align: right;
  padding-right: 10px;
  border-right: 1px solid black;
}

.total-section .label {
  font-weight: bold;
}

.signatures {
  text-align: center;
  padding-left: 10px;
}

.signature-space {
  margin-top: 60px;
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

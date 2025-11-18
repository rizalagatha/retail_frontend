<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';
import { formatRupiah } from "@/utils/formatRupiah";

interface ReturJualHeader {
  nomor: string;
  tanggal: string;
  invoice: string;
  keterangan: string;
  user_create: string;
  gudang: {
    nama: string;
    alamat: string;
    telp: string;
  };
  customer: {
    nama: string;
    alamat: string;
    kota: string;
    telp: string;
  };
  summary: {
    subtotal: number;
    diskon: number;
    grandTotal: number;
    terbilang: string;
  };
}

interface ReturJualDetail {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  diskon: number;
  total: number;
}

interface ReturJualPrintData {
  header: ReturJualHeader;
  details: ReturJualDetail[];
}

const route = useRoute();
const printData = ref<ReturJualPrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/retur-jual-form/print/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header?.nomor || 'Retur Jual';
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
        <img :src="appLogo" alt="Logo" class="logo" />
        <div class="company-info">
          <strong>{{ printData.header.gudang.nama }}</strong>
          <div>{{ printData.header.gudang.alamat }}</div>
          <div>{{ printData.header.gudang.telp }}</div>
        </div>
      </div>
      <div class="title">RETUR PENJUALAN</div>
      <div class="info-grid">
        <div class="info-left">
          <div><span class="label">Nomor</span>: {{ printData.header.nomor }}</div>
          <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.tanggal), 'dd-MM-yyyy')
          }}</div>
          <div><span class="label">No. Invoice</span>: {{ printData.header.invoice }}</div>
        </div>
        <div class="info-right">
          <div><span class="label">Customer</span>: {{ printData.header.customer.nama }}</div>
          <div class="alamat"><span class="label"></span> {{ printData.header.customer.alamat }}</div>
          <div class="alamat"><span class="label"></span> {{ printData.header.customer.kota }} / {{
            printData.header.customer.telp }}</div>
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
            <th class="qty">Qty</th>
            <th class="harga">Harga</th>
            <th class="harga">Diskon</th>
            <th class="harga">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in printData.details" :key="index">
            <td class="no">{{ index + 1 }}</td>
            <td class="kode">{{ item.kode }}</td>
            <td class="nama">{{ item.nama }}</td>
            <td class="ukuran">{{ item.ukuran }}</td>
            <td class="qty">{{ item.jumlah }}</td>
            <td class="harga">{{ formatRupiah(item.harga) }}</td>
            <td class="harga">{{ formatRupiah(item.diskon) }}</td>
            <td class="harga">{{ formatRupiah(item.total) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="footer-grid">
        <div class="terbilang-section">
          <strong>Terbilang:</strong>
          <em>{{ printData.header.summary.terbilang }}</em>
        </div>
        <div class="summary">
          <div class="summary-item"><span>Total :</span><span>{{
            formatRupiah(printData.header.summary.subtotal) }}</span></div>
          <div class="summary-item"><span>Diskon :</span><span>{{
            formatRupiah(printData.header.summary.diskon) }}</span></div>
          <div class="summary-item grand-total"><span>Grand Total :</span><span>{{
            formatRupiah(printData.header.summary.grandTotal) }}</span></div>
        </div>
      </div>
      <div class="signatures">
        <div class="signature-box">Sales Counter,</div>
        <div class="signature-box">Mengetahui,</div>
        <div class="signature-box">Customer,</div>
      </div>
      <div class="names">
        <div class="signature-name">( {{ printData.header.user_create }} )</div>
        <div class="signature-name">( .................... )</div>
        <div class="signature-name">( .................... )</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Style untuk tampilan di browser (sebelum print) */
.print-container {
  background: #f5f5f5;
  padding: 20px 0;
  font-family: 'Arial', sans-serif;
  font-size: 9pt;
}

.page {
  display: flex;
  flex-direction: column;
  background: white;
  margin: 0 auto;
  width: 210mm;
  min-height: 297mm;
  padding: 15mm;
  box-sizing: border-box;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.15);
}

.header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: flex-start;
  /* ✅ Ubah dari space-between ke flex-start */
  gap: 15px;
  /* ✅ Tambahkan gap untuk jarak logo & teks */
  margin-bottom: 10px;
  width: 100%;
}

.logo {
  height: 40px;
  width: auto;
  margin: 0;
  /* ✅ Reset margin */
  flex-shrink: 0;
  /* ✅ Cegah logo menyusut */
}

.company-info {
  display: flex;
  flex-direction: column;
  text-align: left;
  /* ✅ Pastikan teks rata kiri */
  font-size: 8.5pt;
  line-height: 1.3;
  flex: 1;
  /* ✅ Ambil sisa ruang */
}

.title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  text-decoration: underline;
  margin: 15px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 2px 15px;
  margin-bottom: 10px;
  font-size: 9pt;
}

.info-grid .label {
  display: inline-block;
  width: 80px;
  font-weight: bold;
}

.info-grid .alamat {
  padding-left: 80px;
}

.info-grid .keterangan {
  grid-column: 1 / -1;
  margin-top: 4px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
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
  background-color: #f0f0f0;
}

.items-table .no {
  width: 4%;
  text-align: center;
}

.items-table .kode {
  width: 15%;
}

.items-table .nama {
  width: auto;
}

.items-table .ukuran {
  width: 8%;
  text-align: center;
}

.items-table .qty {
  width: 8%;
  text-align: right;
}

.items-table .harga {
  width: 12%;
  text-align: right;
}

.footer-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  margin-top: 10px;
  gap: 20px;
  align-items: flex-start;
  border-top: 1px solid black;
  padding-top: 10px;
}

.terbilang-section {
  font-style: italic;
  font-weight: bold;
}

.summary .summary-item {
  display: flex;
  justify-content: space-between;
}

.summary .grand-total {
  font-weight: bold;
  border-top: 1px solid black;
  padding-top: 5px;
}

.signatures {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  text-align: center;
  margin-top: 20px;
}

.signature-space {
  height: 50px;
}

.names {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  text-align: center;
  margin-top: 50px;
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
    font-family: 'Arial', sans-serif !important;
    font-size: 9pt !important;
    color: #000 !important;
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
}
</style>

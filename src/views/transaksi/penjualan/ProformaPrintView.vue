<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";

// Tipe data disesuaikan dengan query backend
interface PrintHeader {
  nomor: string;
  nomorSo: string;
  tanggal: string;
  tempo: string;
  top: number;
  cus_nama: string;
  cus_alamat: string;
  cus_kota: string;
  cus_telp: string;
  gdg_inv_nama: string;
  gdg_inv_alamat: string;
  gdg_inv_kota: string;
  gdg_inv_telp: string;
  total: number;
  diskon: number;
  ppn: number;
  biayakirim: number;
  dprp: number;
  bilang: string;
  user_nama: string;
  ket: string;
  created: string;
}

interface PrintDetail {
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  disrp: number;
  subtotal: number;
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
    const response = await api.get(`/proforma-form/print/${nomor}`);
    printData.value = response.data;
    if (printData.value?.header?.nomor) {
      document.title = printData.value.header.nomor;
    }
  } catch (error) {
    alert("Gagal memuat data untuk dicetak.");
    console.error("Error fetching print data:", error);
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
          <div>{{ printData.header.gdg_inv_alamat }}</div>
          <div>{{ printData.header.gdg_inv_kota }} - Telp. {{ printData.header.gdg_inv_telp }}</div>
        </div>
        <div class="title">Proforma Invoice</div>
      </div>

      <div class="info-grid">
        <div><span class="label">Nomor SO</span>: {{ printData.header.nomorSo }}</div>
        <div><span class="label">Customer</span>: {{ printData.header.cus_nama }}</div>
        <div><span class="label">Nomor</span>: {{ printData.header.nomor }}</div>
        <div class="alamat">
          <span class="label">Alamat</span>: {{ printData.header.cus_alamat }},
          {{ printData.header.cus_kota }}, {{ printData.header.cus_telp }}
        </div>
        <div>
          <span class="label">Tanggal</span>:
          {{ format(parseISO(printData.header.tanggal), "dd-MM-yyyy") }}
        </div>
        <div>
          <span class="label">Tempo</span>: {{ printData.header.top }} hari /
          {{ format(parseISO(printData.header.tempo), "dd-MM-yyyy") }}
        </div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th class="no">No</th>
              <th class="nama">Nama</th>
              <th class="ukuran">Ukuran</th>
              <th class="qty">Qty</th>
              <th class="harga">Harga</th>
              <th class="diskon">Diskon</th>
              <th class="total">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="no">{{ index + 1 }}</td>
              <td class="nama">{{ item.nama }}</td>
              <td class="ukuran">{{ item.ukuran }}</td>
              <td class="qty">{{ item.jumlah }}</td>
              <td class="harga">{{ item.harga?.toLocaleString("id-ID") }}</td>
              <td class="diskon">{{ item.disrp?.toLocaleString("id-ID") }}</td>
              <td class="total">{{ item.subtotal?.toLocaleString("id-ID") }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="summary-grid">
        <div class="terbilang">
          Terbilang: <em>{{ printData.header.bilang }} rupiah</em>
        </div>
        <div class="summary-box">
          <table>
            <tr>
              <td>Total</td>
              <td>:</td>
              <td>{{ printData.header.total?.toLocaleString("id-ID") }}</td>
            </tr>
            <tr>
              <td>Diskon</td>
              <td>:</td>
              <td>{{ printData.header.diskon?.toLocaleString("id-ID") }}</td>
            </tr>
            <tr>
              <td>PPN</td>
              <td>:</td>
              <td>
                {{
                  (
                    (printData.header.ppn / 100) *
                    (printData.header.total - printData.header.diskon)
                  ).toLocaleString("id-ID")
                }}
              </td>
            </tr>
            <tr>
              <td>Netto</td>
              <td>:</td>
              <td>
                {{
                  (
                    printData.header.total -
                    printData.header.diskon +
                    (printData.header.ppn / 100) *
                      (printData.header.total - printData.header.diskon)
                  ).toLocaleString("id-ID")
                }}
              </td>
            </tr>
            <tr>
              <td>Biaya Kirim</td>
              <td>:</td>
              <td>{{ printData.header.biayakirim?.toLocaleString("id-ID") }}</td>
            </tr>
            <tr>
              <td>DP</td>
              <td>:</td>
              <td>{{ printData.header.dprp?.toLocaleString("id-ID") }}</td>
            </tr>
            <tr class="grand-total">
              <td>GRAND TOTAL</td>
              <td>:</td>
              <td>
                {{
                  (
                    printData.header.total -
                    printData.header.diskon +
                    (printData.header.ppn / 100) *
                      (printData.header.total - printData.header.diskon) +
                    printData.header.biayakirim -
                    printData.header.dprp
                  ).toLocaleString("id-ID")
                }}
              </td>
            </tr>
          </table>
        </div>
      </div>

      <div class="footer">
        <div class="signatures">
          <div>Dibuat Oleh,</div>
          <div>Mengetahui,</div>
          <div>Customer,</div>
        </div>
        <div class="names">
          <div>( {{ printData.header.user_nama }} )</div>
          <div>( .................... )</div>
          <div>( .................... )</div>
        </div>
        <div class="note">Note: {{ printData.header.ket }}</div>
        <div>Created: {{ printData.header.created }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Gunakan style yang mirip dengan contoh print view sebelumnya, sesuaikan kolom tabel */
.print-container {
  font-family: "Arial", sans-serif;
  font-size: 9pt;
  color: black;
}

.page {
  padding: 10mm;
}

.header {
  display: flex;
  align-items: center;
  /* Sejajarkan semua item secara vertikal di tengah */
  border-bottom: 2px solid black;
  padding-bottom: 8px;
}

.logo {
  height: 40px;
}

.company-info {
  /* INI BAGIAN PENTINGNYA */
  flex-grow: 1;
  /* Ambil semua ruang kosong yang tersedia */
  text-align: center;
  /* Posisikan teks info perusahaan di tengah */
  font-size: 8.5pt;
  padding: 0 15px;
  /* Beri sedikit jarak horizontal */
}

.title {
  font-size: 16pt;
  font-weight: bold;
  white-space: nowrap;
  flex-shrink: 0;
  /* Mencegah judul agar tidak mengecil */
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 15px;
  margin-top: 10px;
  border-top: 1px solid black;
  border-bottom: 1px solid black;
  padding: 5px 0;
}

.info-grid .label {
  display: inline-block;
  width: 60px;
}

.info-grid .alamat {
  grid-column: 2 / 3;
  grid-row: 2 / 4;
}

.items-table table {
  width: 100%;
  border-collapse: collapse;
}

.items-table th,
.items-table td {
  padding: 4px;
}

.items-table thead {
  border-top: 1px solid black;
  border-bottom: 1px solid black;
}

.items-table th {
  text-align: center;
}

.no {
  width: 5%;
}

.nama {
  width: 35%;
}

.ukuran {
  width: 8%;
  text-align: center;
}

.qty {
  width: 8%;
  text-align: right;
}

.harga,
.diskon,
.total {
  width: 15%;
  text-align: right;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  border-top: 1px solid black;
  padding-top: 5px;
  margin-top: 5px;
}

.terbilang {
  font-style: italic;
}

.summary-box table {
  float: right;
}

.summary-box td {
  padding: 1px 5px;
}

.summary-box td:nth-child(2) {
  text-align: center;
}

.summary-box td:nth-child(3) {
  text-align: right;
}

.grand-total {
  font-weight: bold;
  border-top: 1px solid black;
}

.footer {
  padding-top: 15px;
  font-size: 8.5pt;
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

.note {
  margin-top: 10px;
}

@media print {
  @page {
    size: A4;
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

/* ============================= */
/* FORCE LIGHT MODE FOR PRINT VIEW */
/* ============================= */

.print-container,
.print-container * {
  color: #000 !important;
  background: #fff !important;
}
</style>

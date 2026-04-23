<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";

// Tipe data disesuaikan dengan response backend getPrintData
interface PrintHeader {
  nomor: string;
  tanggal: string;
  keCabang: string; // Format: "KODE - Nama Workshop"
  keterangan: string;
  created: string;
  user_create: string;
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
const isLoading = ref(true);
const appLogo = Logo;

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    // [PERBAIKAN] Endpoint ke Mutasi Workshop Form
    const response = await api.get(`/mutasi-workshop-form/print-data/${nomor}`);

    printData.value = response.data;
    document.title = `Surat_Jalan_Workshop_${response.data.header.nomor}`;
  } catch {
    alert("Gagal memuat data untuk dicetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (newValue) => {
  if (newValue === false) {
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
    <div v-if="isLoading" class="text-center" style="padding: 50px">Memuat data cetakan...</div>

    <template v-if="printData">
      <div class="page">
        <div class="header">
          <img :src="appLogo" alt="Logo" class="logo" />
          <div class="company-info">
            <strong>{{ printData.header.perush_nama }}</strong>
            <div>{{ printData.header.perush_alamat }}</div>
            <div>Telp. {{ printData.header.perush_telp }}</div>
          </div>
        </div>

        <div class="title">SURAT JALAN KE WORKSHOP</div>

        <div class="info-grid">
          <div>
            <span class="label">Nomor SJ</span>: <strong>{{ printData.header.nomor }}</strong>
          </div>
          <div>
            <span class="label">Tujuan</span>: <strong>{{ printData.header.keCabang }}</strong>
          </div>
          <div>
            <span class="label">Tanggal</span>:
            {{ format(parseISO(printData.header.tanggal), "dd/MM/yyyy") }}
          </div>
          <div class="keterangan">
            <span class="label">Keterangan</span>: {{ printData.header.keterangan || "-" }}
          </div>
        </div>

        <div class="items-table">
          <table>
            <thead>
              <tr>
                <th class="no">NO</th>
                <th class="kode">KODE BARANG</th>
                <th class="nama">NAMA BARANG</th>
                <th class="ukuran">UKURAN</th>
                <th class="jumlah">JUMLAH</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in printData.details" :key="index">
                <td class="no text-center">{{ index + 1 }}</td>
                <td class="kode">{{ item.kode }}</td>
                <td class="nama">{{ item.nama }}</td>
                <td class="ukuran text-center">{{ item.ukuran }}</td>
                <td class="jumlah font-weight-bold">{{ item.jumlah }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="created-date">Dicetak: {{ printData.header.created }}</div>

        <div class="footer">
          <div class="signatures">
            <div class="sign-box">
              <div>Dibuat Oleh,</div>
              <div class="sign-space"></div>
              <div>( {{ printData.header.user_create }} )</div>
            </div>
            <div class="sign-box">
              <div>Pengirim,</div>
              <div class="sign-space"></div>
              <div>( .......................... )</div>
            </div>
            <div class="sign-box">
              <div>Penerima (Workshop),</div>
              <div class="sign-space"></div>
              <div>( .......................... )</div>
            </div>
          </div>
        </div>
      </div>

      <div class="page copy">
        <div class="header">
          <img :src="appLogo" alt="Logo" class="logo" />
          <div class="company-info">
            <strong>{{ printData.header.perush_nama }}</strong>
            <div>{{ printData.header.perush_alamat }}</div>
            <div>Telp. {{ printData.header.perush_telp }}</div>
          </div>
          <div
            style="
              font-weight: bold;
              font-size: 14pt;
              border: 2px solid #000;
              padding: 2px 8px;
              border-radius: 4px;
              opacity: 0.5;
            "
          >
            COPY
          </div>
        </div>

        <div class="title">SURAT JALAN KE WORKSHOP</div>

        <div class="info-grid">
          <div>
            <span class="label">Nomor SJ</span>: <strong>{{ printData.header.nomor }}</strong>
          </div>
          <div>
            <span class="label">Tujuan</span>: <strong>{{ printData.header.keCabang }}</strong>
          </div>
          <div>
            <span class="label">Tanggal</span>:
            {{ format(parseISO(printData.header.tanggal), "dd/MM/yyyy") }}
          </div>
          <div class="keterangan">
            <span class="label">Keterangan</span>: {{ printData.header.keterangan || "-" }}
          </div>
        </div>

        <div class="items-table">
          <table>
            <thead>
              <tr>
                <th class="no">NO</th>
                <th class="kode">KODE BARANG</th>
                <th class="nama">NAMA BARANG</th>
                <th class="ukuran">UKURAN</th>
                <th class="jumlah">JUMLAH</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in printData.details" :key="index">
                <td class="no text-center">{{ index + 1 }}</td>
                <td class="kode">{{ item.kode }}</td>
                <td class="nama">{{ item.nama }}</td>
                <td class="ukuran text-center">{{ item.ukuran }}</td>
                <td class="jumlah font-weight-bold">{{ item.jumlah }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="created-date">Dicetak: {{ printData.header.created }}</div>

        <div class="footer">
          <div class="signatures">
            <div class="sign-box">
              <div>Dibuat Oleh,</div>
              <div class="sign-space"></div>
              <div>( {{ printData.header.user_create }} )</div>
            </div>
            <div class="sign-box">
              <div>Pengirim,</div>
              <div class="sign-space"></div>
              <div>( .......................... )</div>
            </div>
            <div class="sign-box">
              <div>Penerima (Workshop),</div>
              <div class="sign-space"></div>
              <div>( .......................... )</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.print-container {
  font-family: "Segoe UI", Tahoma, sans-serif;
  font-size: 9pt;
  background-color: #fff;
  color: #000;
}

.page {
  /* Ukuran setengah halaman A4 portrait, dikurangi margin */
  height: 138mm;
  width: 190mm;
  padding: 10mm;
  margin: 0 auto;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px dashed #ccc;
  position: relative;
}

.page.copy {
  margin-top: 10mm;
}

.header {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 15px;
  margin-bottom: 8px;
  width: 100%;
}

.logo {
  height: 35px;
  width: auto;
  margin: 0;
  flex-shrink: 0;
}

.company-info {
  display: flex;
  flex-direction: column;
  text-align: left;
  font-size: 8.5pt;
  line-height: 1.4;
  flex: 1;
}

.title {
  text-align: left;
  font-size: 14pt;
  font-weight: bold;
  margin-bottom: 8px;
  text-decoration: underline;
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
  width: 70px;
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

.text-center {
  text-align: center;
}
.font-weight-bold {
  font-weight: bold;
}

.items-table .no {
  width: 5%;
}
.items-table .kode {
  width: 20%;
}
.items-table .nama {
  width: 50%;
}
.items-table .ukuran {
  width: 10%;
}
.items-table .jumlah {
  width: 15%;
  text-align: right;
}

.created-date {
  text-align: right;
  font-size: 7.5pt;
  margin-top: 5px;
  font-style: italic;
  color: #555;
}

.footer {
  margin-top: 15px;
  font-size: 8.5pt;
}

.signatures {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.sign-box {
  text-align: center;
  width: 30%;
}

.sign-space {
  height: 50px;
}

/* --- CSS KHUSUS UNTUK PRINT --- */
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  body,
  .print-container {
    margin: 0;
    padding: 0;
    background-color: #fff;
  }

  .page {
    border: none;
    box-shadow: none;
    margin: 0;
    padding: 10mm;
    page-break-after: avoid; /* Mencegah halaman kosong */
  }

  .page.copy {
    margin-top: 0;
  }
}

/* FORCE LIGHT MODE FOR PRINT VIEW */
.print-container,
.print-container * {
  color: #000 !important;
  background: #fff !important;
}
</style>

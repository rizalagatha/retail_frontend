<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';

// Tipe data disesuaikan dengan response backend
interface PrintHeader {
  nomor: string;
  tanggal: string;
  keCabang: string;
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
const copies = ref<PrintData[]>([]);

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/mutasi-kirim-form/print/${nomor}`);

    printData.value = response.data;

    // Logika Delphi: Duplikat untuk copy
    copies.value = [response.data, response.data];

    document.title = response.data.header.nomor;
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
    <div v-if="isLoading" class="text-center">Memuat data...</div>

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

        <div class="title">MUTASI ANTAR STORE</div>

        <div class="info-grid">
          <div><span class="label">Nomor</span>: {{ printData.header.nomor }}</div>
          <div><span class="label">Ke Cabang</span>: {{ printData.header.keCabang }}</div>
          <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.tanggal), 'dd/MM/yyyy') }}</div>
          <div class="keterangan"><span class="label">Keterangan</span>: {{ printData.header.keterangan }}</div>
        </div>

        <div class="items-table">
          <table>
            <thead>
              <tr>
                <th class="no">No</th>
                <th class="kode">Kode</th>
                <th class="nama">Nama Barang</th>
                <th class="ukuran">Ukuran</th>
                <th class="jumlah">Jumlah</th>
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
        </div>

        <div class="created-date">Created: {{ printData.header.created }}</div>

        <div class="footer">
          <div class="signatures">
            <div>Dibuat Oleh,</div>
            <div>Pengirim,</div>
            <div>Diterima Oleh,</div>
          </div>
          <div class="names">
            <div>( {{ printData.header.user_create }} )</div>
            <div>( .................... )</div>
            <div>( .................... )</div>
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
        </div>

        <div class="title">MUTASI ANTAR STORE</div>

        <div class="info-grid">
          <div><span class="label">Nomor</span>: {{ printData.header.nomor }}</div>
          <div><span class="label">Ke Cabang</span>: {{ printData.header.keCabang }}</div>
          <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.tanggal), 'dd/MM/yyyy') }}</div>
          <div class="keterangan"><span class="label">Keterangan</span>: {{ printData.header.keterangan }}</div>
        </div>

        <div class="items-table">
          <table>
            <thead>
              <tr>
                <th class="no">No</th>
                <th class="kode">Kode</th>
                <th class="nama">Nama Barang</th>
                <th class="ukuran">Ukuran</th>
                <th class="jumlah">Jumlah</th>
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
        </div>

        <div class="created-date">Created: {{ printData.header.created }}</div>

        <div class="footer">
          <div class="signatures">
            <div>Dibuat Oleh,</div>
            <div>Pengirim,</div>
            <div>Diterima Oleh,</div>
          </div>
          <div class="names">
            <div>( {{ printData.header.user_create }} )</div>
            <div>( .................... )</div>
            <div>( .................... )</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
<style scoped>
.print-container {
  font-family: 'Segoe UI', Tahoma, sans-serif;
  font-size: 9pt;
  background-color: #fff;
  color: #000;
}

.page {
  /* Ukuran setengah halaman A4 portrait, dikurangi margin */
  height: 138mm;
  width: 190mm;
  /* Lebar A4 dikurangi margin */
  padding: 10mm;
  margin: 0 auto;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px dashed #ccc;
}

.page.copy {
  margin-top: 10mm;
}

/* --- (Salin sisa CSS dari sebelumnya untuk .header, .title, .info-grid, dll) --- */
.header {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  /* ✅ Pastikan rata kiri */
  align-items: flex-start;
  /* ✅ Ubah dari center ke flex-start */
  gap: 15px;
  /* ✅ Gunakan gap untuk jarak */
  margin-bottom: 8px;
  width: 100%;
}

.logo {
  height: 35px;
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
  font-size: 8.5pt;
  line-height: 1.4;
  flex: 1;
  /* ✅ Ambil sisa ruang */
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

.items-table .jumlah {
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
    /* Atur margin kertas di sini */
    page-break-after: avoid;
  }

  .page.copy {
    margin-top: 0;
  }
}
</style>

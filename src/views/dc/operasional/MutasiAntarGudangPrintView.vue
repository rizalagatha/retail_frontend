<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png'; // Pastikan path logo ini benar

interface PrintHeader {
  mts_nomor: string;
  perush_nama: string;
  perush_alamat: string;
  perush_kota: string;
  perush_telp: string;
  mts_drcab: string;
  nama_dari_cabang: string;
  mts_tanggal: string; // ISO string
  mts_kecab: string;
  nama_ke_cabang: string;
  mts_ket: string;
}

interface PrintDetail {
  mtsd_kode: string;
  nama: string;
  mtsd_ukuran: string;
  mtsd_jumlah: number;
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
    // --- PERBAIKI URL DI SINI ---
    const response = await api.get(`/mutasi-antar-gudang-form/print/${nomor}`);

    printData.value = response.data;
    document.title = response.data.header.mts_nomor;
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
          <strong>{{ printData.header.perush_nama }}</strong>
          <div>{{ printData.header.perush_alamat }}, {{ printData.header.perush_kota }}</div>
          <div>Telp. {{ printData.header.perush_telp }}</div>
        </div>
      </div>

      <div class="title">Mutasi Stok</div>

      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.mts_nomor }}</div>
        <div><span class="label">Gudang</span>: {{ printData.header.mts_drcab }} ({{ printData.header.nama_dari_cabang
        }})</div>
        <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.mts_tanggal), 'dd-MM-yyyy') }}
        </div>
        <div><span class="label">Ke</span>: {{ printData.header.mts_kecab }} ({{ printData.header.nama_ke_cabang }})
        </div>
        <div class="keterangan"><span class="label">Keterangan</span>: {{ printData.header.mts_ket }}</div>
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
              <td class="no center">{{ index + 1 }}</td>
              <td class="kode">{{ item.mtsd_kode }}</td>
              <td class="nama">{{ item.nama }}</td>
              <td class="ukuran center">{{ item.mtsd_ukuran }}</td>
              <td class="qty right">{{ item.mtsd_jumlah }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer">
        <div class="signatures">
          <div>Admin,</div>
          <div>Pengirim,</div>
          <div>Diterima,</div>
        </div>
        <div class="names">
          <div>( .................... )</div>
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
  font-size: 10pt;
  color: black;
}

.page {
  padding: 10mm;
}

.header {
  display: flex;
  flex-direction: row;
  justify-content: flex-start; /* ✅ Pastikan rata kiri */
  align-items: flex-start; /* ✅ Ubah dari center ke flex-start */
  gap: 15px; /* ✅ Gunakan gap untuk jarak */
  margin-bottom: 8px;
  width: 100%;
}

.logo {
  height: 40px;
  width: auto;
  margin: 0; /* ✅ Hapus margin-right, gunakan gap di parent */
  flex-shrink: 0; /* ✅ Cegah logo menyusut */
}

.company-info {
  display: flex;
  flex-direction: column;
  text-align: left;
  font-size: 9pt;
  line-height: 1.4;
  flex: 1; /* ✅ Ambil sisa ruang */
}

.title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  margin-bottom: 10px;
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

.info-grid .keterangan {
  grid-column: 1 / -1;
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

.no {
  width: 5%;
}

.kode {
  width: 20%;
}

.nama {
  width: 50%;
}

.ukuran {
  width: 10%;
}

.qty {
  width: 15%;
}

.center {
  text-align: center;
}

.right {
  text-align: right;
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

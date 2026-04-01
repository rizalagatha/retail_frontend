<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import { useToast } from "vue-toastification";

import LogoKP from "@/assets/kp.jpg";

interface PrintHeader {
  nomor?: string;
  tanggal?: string;
  keterangan?: string;
  cabang?: string;
  user_create?: string;
  [key: string]: unknown; // Mengizinkan field tambahan dari backend
}

interface PrintItem {
  kode?: string;
  nama?: string;
  satuan?: string;
  jumlah?: number;
  keterangan?: string;
  [key: string]: unknown;
}

const route = useRoute();
const toast = useToast();
const nomor = route.params.nomor as string;

const isLoading = ref(true);
const header = ref<PrintHeader>({});
const items = ref<PrintItem[]>([]);

const loadData = async () => {
  try {
    const response = await api.get(`/minta-accesories-form/${nomor}`);
    header.value = response.data.header;
    items.value = response.data.items;
  } catch (error) {
    toast.error("Gagal memuat data cetak.", error);
  } finally {
    isLoading.value = false;
    nextTick(() => {
      setTimeout(() => {
        window.print();
      }, 500);
    });
  }
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  return format(parseISO(dateStr), "dd MMM yyyy");
};

const formatNumber = (num: number) => {
  return Number(num || 0).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

onMounted(() => {
  loadData();
});
</script>

<template>
  <div v-if="isLoading" class="d-flex justify-center align-center h-screen">
    <v-progress-circular indeterminate color="primary"></v-progress-circular>
  </div>

  <div v-else class="print-container">
    <div v-for="i in 2" :key="i" class="print-half">
      <div class="header-section">
        <div class="header-text">
          <h2 class="title">PERMINTAAN ACCESORIES</h2>
        </div>
        <div class="header-logo">
          <img :src="LogoKP" alt="Kencana Print Logo" />
        </div>
      </div>

      <div class="meta-section">
        <table class="meta-table left-meta">
          <tr>
            <td width="100">No.Permintaan</td>
            <td width="10">:</td>
            <td>{{ header.nomor }}</td>
          </tr>
          <tr>
            <td>Tanggal</td>
            <td>:</td>
            <td>{{ formatDate(header.tanggal) }}</td>
          </tr>
          <tr>
            <td>Keterangan</td>
            <td>:</td>
            <td>{{ header.keterangan || "-" }}</td>
          </tr>
        </table>

        <table class="meta-table right-meta">
          <tr>
            <td width="60">Cabang</td>
            <td width="10">:</td>
            <td>{{ header.cabang || "P03" }} -</td>
          </tr>
          <tr>
            <td>SPK</td>
            <td>:</td>
            <td></td>
          </tr>
        </table>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th width="30">No</th>
            <th width="100">Kode</th>
            <th>Nama</th>
            <th width="60">Satuan</th>
            <th width="80" class="text-right">Jumlah</th>
            <th width="150">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in items" :key="index">
            <td class="text-center">{{ index + 1 }}</td>
            <td>{{ item.kode }}</td>
            <td>{{ item.nama }}</td>
            <td class="text-center">{{ item.satuan }}</td>
            <td class="text-right">{{ formatNumber(item.jumlah) }}</td>
            <td>{{ item.keterangan || "-" }}</td>
          </tr>
        </tbody>
      </table>

      <div class="signature-section">
        <div class="sig-box">
          <div class="sig-title">Pemohon,</div>
          <div class="sig-name">( {{ header.user_create || "ANTA" }} )</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">Menyetujui,</div>
          <div class="sig-name">( Kepala Gudang )</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">Diserahkan,</div>
          <div class="sig-name">( Helper Gudang )</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">Diterima</div>
          <div class="sig-name">( Helper Produksi )</div>
        </div>
      </div>

      <div v-if="i === 1" class="cut-line"></div>
    </div>
  </div>
</template>

<style scoped>
/* Background area di luar kertas (di layar browser) */
:global(body) {
  background-color: #525659; /* Warna abu-abu ala PDF viewer */
}

/* Container utama yang membungkus kertas */
.print-container {
  font-family: Arial, sans-serif;
  font-size: 11px;
  color: black;
  background-color: white;

  /* Efek Kertas A4 di Layar */
  width: 210mm; /* Lebar standar A4 */
  min-height: 297mm; /* Tinggi standar A4 */
  margin: 20px auto; /* Ditengahkan di layar */
  padding: 10mm; /* Margin dalam kertas */
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); /* Efek bayangan kertas */
  box-sizing: border-box;
}

/* Pengaturan setengah kertas untuk rangkap */
.print-half {
  height: calc(148.5mm - 10mm); /* Setengah tinggi A4 dikurangi padding */
  display: flex;
  flex-direction: column;
  padding-bottom: 10px;
  box-sizing: border-box;
  overflow: hidden; /* Mencegah konten luber jika terlalu banyak */
}

.cut-line {
  border-bottom: 1px dashed #000;
  margin: 15px 0;
  width: 100%;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.title {
  font-size: 16px;
  font-weight: normal;
  margin: 0;
}

.header-logo img {
  height: 35px;
  object-fit: contain;
}

.meta-section {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.meta-table {
  border-collapse: collapse;
}

.meta-table td {
  padding: 2px 0;
  vertical-align: top;
}

.right-meta {
  width: 250px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 10px; /* Diperkecil agar muat di setengah A4 */
  border: 1px solid black;
}

.items-table th,
.items-table td {
  border: 1px solid black;
  padding: 4px 6px;
  vertical-align: top;
}

.items-table th {
  font-weight: normal;
  text-align: left;
}

.text-center {
  text-align: center !important;
}
.text-right {
  text-align: right !important;
}

/* Tanda Tangan */
.signature-section {
  display: flex;
  justify-content: space-between;
  margin-top: auto; /* Dorong ke bawah area setengah kertas */
  padding: 0 20px;
}

.sig-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 120px;
}

.sig-title {
  margin-bottom: 60px; /* Jarak untuk tanda tangan */
}

.sig-name {
  text-align: center;
}

/* =========================================
   PENGATURAN KHUSUS SAAT BENAR-BENAR DICETAK
   (Menghilangkan efek bayangan kertas di printer)
   ========================================= */
@media print {
  @page {
    size: A4 portrait;
    margin: 0; /* Margin diatur oleh padding print-container */
  }

  :global(body) {
    background-color: white; /* Kembalikan background ke putih */
  }

  .print-container {
    margin: 0;
    box-shadow: none; /* Hilangkan shadow kertas */
    width: 100%;
    height: 100%;
    page-break-after: avoid;
  }
}
</style>

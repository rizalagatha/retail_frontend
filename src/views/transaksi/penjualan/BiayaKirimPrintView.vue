<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';
import LogoReszo from '@/assets/rezso.jpg';
import { formatRupiah } from "@/utils/formatRupiah";
import { terbilang } from "@/utils/terbilang";

interface PrintData {
  header: {
    bk_nomor: string;
    bk_tanggal: string;
    bk_inv_nomor: string;
    bk_nominal: number;
    bk_ket: string;
    inv_cus_kode: string;
    cus_nama: string;
    cus_alamat: string;
    cus_kota: string;
    cus_telp: string;
    tgl_indo: string;
    gdg_inv_nama: string;
    gdg_inv_alamat: string;
    gdg_inv_telp: string;
  };
  details: Array<{
    tgl_bayar: string;
    uraian: string;
    nominal: number;
    keterangan: string;
  }>;
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);

// Logo Dinamis sesuai cabang
const dynamicLogo = computed(() => {
  if (printData.value?.header?.bk_nomor?.startsWith('K04')) {
    return LogoReszo;
  }
  return Logo;
});

const fetchPrintData = async (nomor: string) => {
  try {
    const response = await api.get(`/biaya-kirim-form/print/${nomor}`);
    printData.value = response.data;
    document.title = printData.value?.header?.bk_nomor || 'Print Biaya Kirim';
  } catch {
    alert("Gagal memuat data cetak.");
  } finally {
    isLoading.value = false;
  }
};

// Trigger Print otomatis setelah loading selesai
watch(isLoading, (newValue) => {
  if (newValue === false && printData.value) {
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
    <div v-if="isLoading" class="text-center pa-10">Memuat data cetak...</div>

    <div v-if="printData && printData.header" class="page">
      <div class="company-header">
        <img :src="dynamicLogo" alt="Logo" class="company-logo">
        <div class="company-info">
          <div class="company-name">{{ printData.header.gdg_inv_nama }}</div>
          <div>{{ printData.header.gdg_inv_alamat }}</div>
          <div>Telp/Wa: {{ printData.header.gdg_inv_telp }}</div>
        </div>
      </div>

      <div class="document-title">BIAYA KIRIM</div>

      <div class="details-container">
        <div class="details-grid">
          <div class="label">Nomor Transaksi</div>
          <div class="value">: {{ printData.header.bk_nomor }}</div>
          <div class="label">Tanggal</div>
          <div class="value">: {{ printData.header.tgl_indo }}</div>
          <div class="label">No. Invoice</div>
          <div class="value">: {{ printData.header.bk_inv_nomor }}</div>
          <div class="label">Biaya Kirim</div>
          <div class="value font-bold">: Rp {{ formatRupiah(printData.header.bk_nominal) }}</div>
          <div class="label">Terbilang</div>
          <div class="value terbilang-value">: # {{ terbilang(printData.header.bk_nominal) }} RUPIAH #</div>
          <div class="label">Keterangan</div>
          <div class="value">: {{ printData.header.bk_ket || '-' }}</div>
        </div>

        <div class="details-grid">
          <div class="label">Customer</div>
          <div class="value">: {{ printData.header.inv_cus_kode }} - {{ printData.header.cus_nama }}</div>
          <div class="label">Alamat</div>
          <div class="value address-value">: {{ printData.header.cus_alamat }}</div>
          <div class="label">Kota</div>
          <div class="value">: {{ printData.header.cus_kota }}</div>
        </div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th style="width: 5%;">No.</th>
              <th style="width: 15%;">Tgl. Bayar</th>
              <th style="width: 30%;">Uraian</th>
              <th class="text-end" style="width: 20%;">Nominal</th>
              <th style="width: 30%;">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="text-center">{{ index + 1 }}</td>
              <td class="text-center">
                {{ item.tgl_bayar ? format(parseISO(item.tgl_bayar), 'dd-MM-yyyy') : '-' }}
              </td>
              <td>{{ item.uraian }}</td>
              <td class="text-end">{{ formatRupiah(item.nominal) }}</td>
              <td>{{ item.keterangan }}</td>
            </tr>
            <tr v-if="printData.details.length === 0">
              <td colspan="5" class="text-center italic pa-4">Belum ada riwayat pembayaran</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="text-end font-bold">Grand Total</td>
              <td class="text-end font-bold">{{ formatRupiah(printData.header.bk_nominal) }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="signatures">
        <div class="signature-box">
          Dibuat Oleh,<br><br><br><br>
          ( ____________________ )
        </div>
        <div class="signature-box">
          Mengetahui,<br><br><br><br>
          ( ____________________ )
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  font-family: 'Arial', sans-serif;
  /* Mengganti font jadul ke Arial */
  font-size: 10pt;
  background: white;
  padding: 1cm;
  margin: 0 auto;
  width: 21cm;
  color: #000;
}

.company-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 5px;
}

.company-logo {
  height: 50px;
  object-fit: contain;
}

.company-name {
  font-weight: bold;
  font-size: 13pt;
  color: #000;
}

.document-title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  margin: 15px 0;
  border-top: 2px solid #000;
  border-bottom: 2px solid #000;
  padding: 5px 0;
  letter-spacing: 2px;
}

.details-container {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 20px;
  margin-bottom: 20px;
}

.details-grid {
  display: grid;
  grid-template-columns: 140px auto;
  row-gap: 5px;
  line-height: 1.4;
}

.label {
  font-weight: bold;
}

.font-bold {
  font-weight: bold;
}

.address-value,
.terbilang-value {
  font-style: italic;
}

.items-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
}

.items-table th,
.items-table td {
  border: 1px solid #000;
  padding: 6px 8px;
}

.items-table th {
  background-color: #f2f2f2 !important;
  text-transform: uppercase;
}

.text-end {
  text-align: right;
}

.text-center {
  text-align: center;
}

.italic {
  font-style: italic;
}

.signatures {
  display: flex;
  justify-content: space-between;
  margin-top: 40px;
  padding: 0 50px;
}

.signature-box {
  text-align: center;
  width: 200px;
}

@media print {
  @page {
    size: A4;
    margin: 0;
  }

  body {
    background: #fff;
  }

  .page {
    box-shadow: none;
    margin: 0;
    padding: 1.5cm;
  }

  .print-container * {
    color: #000 !important;
    background: #fff !important;
  }
}
</style>

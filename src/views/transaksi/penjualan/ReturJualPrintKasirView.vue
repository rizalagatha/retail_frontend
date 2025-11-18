<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png'; // Pastikan logo diimpor
import { formatRupiah } from "@/utils/formatRupiah";

interface PrintHeader {
  nomor: string;
  tanggal: string;
  invoice?: string;
  keterangan?: string;
  user_create: string;
  customer: {
    nama: string;
    alamat?: string;
    kota?: string;
    telp?: string;
  };
  gudang: {
    nama: string;
    alamat?: string;
    telp?: string;
  };
  summary: {
    subtotal: number;
    diskon: number;
    grandTotal: number;
    terbilang?: string;
  };
}

interface PrintDetail {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  diskon: number;
  total: number;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo; // Sediakan logo untuk template

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/retur-jual-form/print/${nomor}`);
    printData.value = response.data;
    document.title = `Struk Retur - ${response.data.header?.nomor}`;
  } catch {
    alert("Gagal memuat data untuk dicetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (val) => {
  if (!val) {
    nextTick(() => {
      setTimeout(() => window.print(), 200);
    });
  }
});

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) fetchPrintData(nomor);
});
</script>

<template>
  <div class="receipt">
    <div v-if="isLoading" class="text-center">Memuat...</div>
    <div v-if="printData" class="content">
      <div class="header text-center">
        <img :src="appLogo" alt="Logo" class="logo" />
        <strong>{{ printData.header.gudang.nama }}</strong>
        <div>{{ printData.header.gudang.alamat }}</div>
        <div>{{ printData.header.gudang.telp }}</div>
      </div>

      <div class="info">
        <div>No. Retur: {{ printData.header.nomor }}</div>
        <div>Tgl: {{ format(parseISO(printData.header.tanggal), 'dd/MM/yy HH:mm') }}</div>
        <div>Kasir: {{ printData.header.user_create }}</div>
        <div>Customer: {{ printData.header.customer.nama }}</div>
      </div>

      <div class="items">
        <div v-for="item in printData.details" :key="item.kode" class="item">
          <div>{{ item.nama }} ({{ item.ukuran }})</div>
          <div class="item-details">
            <span>{{ item.jumlah }} x {{ formatRupiah(item.harga) }}</span>
            <span>{{ formatRupiah(item.total) }}</span>
          </div>
        </div>
      </div>

      <div class="summary">
        <div class="summary-item">
          <span>Subtotal</span>
          <span>{{ formatRupiah(printData.header.summary.subtotal) }}</span>
        </div>
        <div class="summary-item">
          <span>Diskon</span>
          <span>{{ formatRupiah(printData.header.summary.diskon) }}</span>
        </div>
        <div class="summary-item grand-total">
          <span>TOTAL RETUR</span>
          <span>{{ formatRupiah(printData.header.summary.grandTotal) }}</span>
        </div>
      </div>

      <div class="footer text-center">
        <div>** RETUR PENJUALAN **</div>
        <div>TERIMAKASIH ATAS KUNJUNGAN ANDA</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.receipt {
  width: 58mm;
  /* Gunakan font yang lebih umum untuk printer kasir */
  font-family: 'monospace', 'Courier New';
  font-size: 8pt;
  color: black;
  padding: 2mm;
  box-sizing: border-box;
}

.text-center {
  text-align: center;
}

.logo {
  max-width: 12mm;
  /* Ukuran logo dikecilkan */
  margin: 0 auto 5px;
  display: block;
}

.info,
.items,
.summary,
.footer {
  border-top: 1px dashed black;
  padding-top: 5px;
  margin-top: 5px;
}

.item-details,
.summary-item {
  display: flex;
  justify-content: space-between;
}

.grand-total {
  font-weight: bold;
}

@media print {
  @page {
    size: 58mm auto;
    margin: 0;
  }

  body,
  .receipt {
    margin: 0;
    padding: 2mm;
    /* Beri sedikit padding saat print */
    background: #fff;
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import Logo from '@/assets/logo.png';
import InstagramLogo from '@/assets/instagram.jpg';
import FacebookLogo from '@/assets/facebook.jpg';
import { formatRupiah } from "@/utils/formatRupiah";

interface PrintSummary {
  subTotal: number;
  diskon: number;
  ppn: number;
  netto: number;
  biayaKirim: number;
  dp: number;
  grandTotal: number;
  bayar: number;
  pundiAmal: number;
  kembali: number;
}

interface PrintHeader {
  inv_nomor: string;
  created: string;
  user_create: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  gdg_inv_instagram: string;
  gdg_inv_fb: string;
  summary: PrintSummary;
}

interface PrintDetail {
  invd_kode: string;
  nama_barang: string;
  invd_ukuran: string;
  invd_jumlah: number;
  invd_harga: number;
  invd_harga_asli?: number; // harga sebelum diskon
  invd_diskon?: number;     // diskon total
  total: number;
  total_asli?: number;      // total sebelum diskon
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);

const appLogo = Logo;
const igLogo = InstagramLogo;
const fbLogo = FacebookLogo;
const maxPundi = 500;

const fetchPrintData = async (nomor: string) => {
  try {
    const response = await api.get(`/invoice-form/print-kasir/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header?.inv_nomor || 'Struk';
  } catch {
    alert('Gagal memuat data struk.');
  } finally {
    isLoading.value = false;
  }
};

// ✅ Hitung total sebelum diskon, total diskon, dan total setelah diskon
const calculateTotalsWithDiscount = (details: PrintDetail[]) => {
  let totalAsli = 0;
  let totalDiskon = 0;
  let totalNetto = 0;

  for (const item of details) {
    const qty = item.invd_jumlah || 0;
    const hargaAsli = item.invd_harga_asli ?? item.invd_harga ?? 0;
    const totalAsliItem = hargaAsli * qty;
    const totalItem = item.total ?? 0;
    const diskonItem = Math.max(0, totalAsliItem - totalItem);

    totalAsli += totalAsliItem;
    totalDiskon += diskonItem;
    totalNetto += totalItem;
  }

  return { totalAsli, totalDiskon, totalNetto };
};

const hitungPundiAmal = (details: PrintDetail[]) => {
  if (!details) return 0;

  let totalQty = 0;
  for (const item of details) {
    totalQty += Number(item.invd_jumlah) || 0;
  }

  return totalQty * maxPundi;
};

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) fetchPrintData(nomor);
});
</script>

<template>
  <div class="receipt">
    <div v-if="isLoading" class="text-center">Memuat data...</div>
    <div v-else-if="printData">
      <div class="header text-center">
        <img :src="appLogo" alt="Logo" class="logo" />
        <strong>{{ printData.header.perush_nama }}</strong>
        <div>{{ printData.header.perush_alamat }}</div>
        <div>{{ printData.header.perush_telp }}</div>
      </div>

      <div class="info">
        <div>NoBon: {{ printData.header.inv_nomor }}</div>
        <div>Tgl: {{ printData.header.created }} {{ printData.header.user_create }}</div>
      </div>

      <div class="items">
        <div v-for="item in printData.details" :key="item.invd_kode" class="item">
          <div>{{ item.nama_barang }} ({{ item.invd_ukuran }})</div>
          <div class="item-details">
            <span>{{ item.invd_jumlah }} x {{ formatRupiah(item.invd_harga) }}</span>
            <span>{{ formatRupiah(item.total) }}</span>
          </div>
        </div>
      </div>

      <!-- 🧾 Summary dengan perhitungan diskon -->
      <div class="summary" v-if="printData.details.length">
        <template v-if="calculateTotalsWithDiscount(printData.details).totalDiskon > 0">
          <div class="summary-item">
            <span>Total (Sebelum Diskon)</span>
            <span>{{ formatRupiah(calculateTotalsWithDiscount(printData.details).totalAsli) }}</span>
          </div>
          <div class="summary-item diskon">
            <span>Total Diskon</span>
            <span>-{{ formatRupiah(calculateTotalsWithDiscount(printData.details).totalDiskon) }}</span>
          </div>
          <div class="summary-item netto">
            <span>Netto (Setelah Diskon)</span>
            <span>{{ formatRupiah(calculateTotalsWithDiscount(printData.details).totalNetto) }}</span>
          </div>
        </template>

        <template v-else>
          <div class="summary-item">
            <span>Total</span>
            <span>{{ formatRupiah(printData.header.summary.subTotal) }}</span>
          </div>
        </template>

        <div class="summary-item">
          <span>Ppn</span>
          <span>{{ formatRupiah(printData.header.summary.ppn) }}</span>
        </div>
        <div class="summary-item">
          <span>Biaya Kirim</span>
          <span>{{ formatRupiah(printData.header.summary.biayaKirim) }}</span>
        </div>
        <div class="summary-item">
          <span>Dp</span>
          <span>{{ formatRupiah(printData.header.summary.dp) }}</span>
        </div>
        <div class="summary-item grand-total">
          <span>Grand Total</span>
          <span>{{ formatRupiah(printData.header.summary.grandTotal) }}</span>
        </div>
        <div class="summary-item">
          <span>Bayar</span>
          <span>{{ formatRupiah(printData.header.summary.bayar) }}</span>
        </div>
        <div class="summary-item">
          <span>Pundi Amal</span>
          <span>{{ formatRupiah(printData.header.summary.pundiAmal) }}</span>
        </div>
        <div class="summary-item">
          <span>Kembali</span>
          <span>{{ formatRupiah(printData.header.summary.kembali) }}</span>
        </div>
      </div>

      <div class="footer text-center">
        <div class="donation-text">
          Dengan membeli produk kaosan ini, Kaosan telah menyisihkan/peduli dengan sesama yg membutuhkan
          sebesar {{ formatRupiah(hitungPundiAmal(printData.details)) }}
        </div>
        <div>BARANG YANG SUDAH DIBELI TIDAK BISA DIKEMBALIKAN</div>
        <div>TERIMAKASIH ATAS KUNJUNGAN ANDA</div>
        <div class="social-media">
          <div class="social-item">
            <img :src="igLogo" alt="Instagram" />
            <span>{{ printData.header.gdg_inv_instagram }}</span>
          </div>
          <div class="social-item">
            <img :src="fbLogo" alt="Facebook" />
            <span>{{ printData.header.gdg_inv_fb }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.receipt {
  width: 58mm;
  font-family: 'Roboto Mono', monospace;
  font-size: 8pt;
  color: black;
}

.text-center {
  text-align: center;
}

.logo {
  max-width: 10mm;
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

/* Tambahan styling untuk diskon & netto */
.summary-item.diskon span:last-child {
  color: #c62828;
  font-weight: bold;
}

.summary-item.netto span:last-child {
  color: #2e7d32;
  font-weight: bold;
}

.donation-text {
  margin-top: 6px;
  margin-bottom: 6px;
  padding: 4px 0;
  text-align: center;
  font-size: 8pt;
  font-weight: bold;
  border-top: 1px dashed black;
  border-bottom: 1px dashed black;
}

.social-media {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 5px;
}

.social-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

.social-item img {
  height: 8px;
}

@media print {
  @page {
    size: 58mm auto;
    margin: 2mm;
  }
}
</style>

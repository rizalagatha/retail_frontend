<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import Logo from '@/assets/logo.png';
import InstagramLogo from '@/assets/instagram.jpg';
import FacebookLogo from '@/assets/facebook.jpg';

interface PrintHeader {
  inv_nomor: string;
  created: string;
  user_create: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  gdg_inv_instagram?: string;
  gdg_inv_fb?: string;
  summary: {
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
  };
}

interface PrintDetail {
  invd_kode: string;
  nama_barang: string;
  invd_ukuran: string;
  invd_jumlah: number;
  invd_harga: number;
  total: number;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const props = defineProps<{
  nomorInvoice: string;
}>();

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;
const igLogo = InstagramLogo;
const fbLogo = FacebookLogo;

const formatRupiah = (angka: number) => new Intl.NumberFormat('id-ID').format(Math.round(angka || 0));

const fetchPrintData = async (nomor: string) => {
  const tujuanHp = route.query.hp as string || '';

  try {
    const response = await api.get(`/invoice-form/print-kasir/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header?.inv_nomor || 'Struk';
    if (route.query.source === 'kasir') {
      // Cetak langsung ke printer POS (kiosk mode)
      await nextTick();
      window.print();
    } else if (route.query.source === 'whatsapp') {
      // Minta backend buat screenshot struk & kirim ke WA
      await api.post(`/whatsapp/send-receipt`, {
        nomor: props.nomorInvoice,  // ← invoice
        hp: tujuanHp,
      });
    }
  } catch { alert("Gagal memuat data struk."); }
  finally { isLoading.value = false; }
};

watch(printData, (newData) => {
  // Tonton 'printData'. Ketika nilainya berubah dari 'null' menjadi berisi data...
  if (newData) {
    // ...dan jika tujuannya BUKAN whatsapp...
    if (route.query.source !== 'whatsapp') {
      // ...tunggu DOM selesai di-render dengan data baru...
      nextTick(() => {
        // ...lalu panggil print.
        window.print();
      });
    }
  }
}, { immediate: false }); // 'immediate: false' penting agar tidak jalan saat inisialisasi

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    fetchPrintData(nomor);
  } else {
    alert("Nomor invoice tidak ditemukan.");
    isLoading.value = false;
  }
});
</script>

<template>
  <div class="receipt">
    <div v-if="isLoading" class="text-center">Memuat data...</div>
    <div v-if="printData">
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
      <div class="summary">
        <div class="summary-item"><span>Total </span><span>{{ formatRupiah(printData.header.summary.subTotal)
            }}</span></div>
        <div class="summary-item"><span>Diskon </span><span>{{ formatRupiah(printData.header.summary.diskon)
            }}</span></div>
        <div class="summary-item"><span>Ppn </span><span>{{ formatRupiah(printData.header.summary.ppn) }}</span>
        </div>
        <div class="summary-item"><span>Netto </span><span>{{ formatRupiah(printData.header.summary.netto)
            }}</span></div>
        <div class="summary-item"><span>Biaya Kirim
          </span><span>{{ formatRupiah(printData.header.summary.biayaKirim) }}</span></div>
        <div class="summary-item"><span>Dp </span><span>{{ formatRupiah(printData.header.summary.dp) }}</span>
        </div>
        <div class="summary-item grand-total"><span>Grand Total </span><span>{{
          formatRupiah(printData.header.summary.grandTotal) }}</span></div>
        <div class="summary-item"><span>Bayar </span><span>{{ formatRupiah(printData.header.summary.bayar)
            }}</span></div>
        <div class="summary-item"><span>Pundi amal </span><span>{{
          formatRupiah(printData.header.summary.pundiAmal) }}</span></div>
        <div class="summary-item"><span>Kembali </span><span>{{ formatRupiah(printData.header.summary.kembali)
            }}</span></div>
      </div>
      <div class="footer text-center">
        <div v-if="printData.header.summary.pundiAmal > 0" class="donation-text">
          Dengan membeli produk kaosan ini, Kaosan telah menyisihkan/peduli dengan sesama yg membutuhkan
          sebesar {{ formatRupiah(printData.header.summary.pundiAmal) }}
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

.donation-text {
  margin-bottom: 5px;
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

.info-grid {
  display: grid;
  /* Buat 2 kolom: satu untuk label, satu untuk nilai */
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  /* Atur jarak antar baris dan kolom */
  margin-bottom: 10px;
  align-items: center;
}

.info-grid .label {
  font-weight: bold;
  grid-column: 1 / 2;
  /* Pastikan label selalu di kolom pertama */
}

.info-grid .value {
  grid-column: 2 / 3;
  /* Pastikan nilai selalu di kolom kedua */
}

.info-grid .alamat {
  grid-column: 1 / -1;
  /* Biarkan alamat mengisi seluruh lebar */
  padding-left: 0;
  /* Hapus padding kiri jika ada */
}

/* Sedikit penyesuaian agar titik dua tidak menempel */
.info-grid .value::before {
  content: ":";
  margin-right: 8px;
}

@media print {
  @page {
    size: 58mm auto;
    margin: 2mm;
  }
}
</style>

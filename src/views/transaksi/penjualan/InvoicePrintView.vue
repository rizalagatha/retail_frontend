<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';
import InstagramLogo from '@/assets/instagram.jpg';
import FacebookLogo from '@/assets/facebook.jpg';

interface PrintHeaderSummary {
  subTotal: number;
  diskon: number;
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
  inv_tanggal: string;
  inv_nomor_so: string;
  cus_nama: string;
  cus_alamat: string;
  inv_top: number;
  tempo: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  inv_sc: string;
  gdg_inv_instagram: string;
  gdg_inv_fb: string;
  terbilang: string;
  summary: PrintHeaderSummary;
}

interface PrintDetail {
  invd_kode: string;
  nama_barang: string;
  invd_ukuran: string;
  invd_jumlah: number;
  invd_harga: number;
  invd_diskon: number;
  total: number;
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

const formatRupiah = (angka: number) => new Intl.NumberFormat('id-ID').format(Math.round(angka || 0));

const fetchPrintData = async (nomor: string) => {
  try {
    const response = await api.get(`/invoice-form/print/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header?.inv_nomor || 'Invoice';
  } catch {
    alert("Gagal memuat data untuk dicetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (newValue) => {
  // Jika loading SUDAH SELESAI (dari true menjadi false)
  if (newValue === false) {
    // Tunggu satu tick lagi untuk memastikan DOM sudah 100% ter-update
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
          <div>{{ printData.header.perush_alamat }}</div>
          <div>{{ printData.header.perush_telp }}</div>
        </div>
      </div>
      <div class="title">INVOICE</div>

      <div class="info-grid">
        <div class="info-left">
          <div><span class="label">Nomor</span>: {{ printData.header.inv_nomor }}</div>
          <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.inv_tanggal),
            'dd-MM-yyyy') }}</div>
          <div><span class="label">No. Pesanan</span>: {{ printData.header.inv_nomor_so }}</div>
        </div>
        <div class="info-right">
          <div class="info-line">
            <span class="label">Customer</span>
            <span>: {{ printData.header.cus_nama }}</span>
          </div>

          <div class="info-line alamat-multi">
            <span class="label"></span>
            <span>{{ printData.header.cus_alamat }}</span>
          </div>
          <div><span class="label">Top</span>: {{ printData.header.inv_top }} Hari</div>
          <div><span class="label">Jatuh Tempo</span>: {{ format(parseISO(printData.header.tempo),
            'dd-MM-yyyy') }}</div>
        </div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Kode</th>
              <th>Nama Barang</th>
              <th>Ukuran</th>
              <th>Qty</th>
              <th class="text-end">Harga</th>
              <th class="text-end">Diskon</th>
              <th class="text-end">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details" :key="index">
              <td class="text-center">{{ index + 1 }}</td>
              <td>{{ item.invd_kode }}</td>
              <td>{{ item.nama_barang }}</td>
              <td class="text-center">{{ item.invd_ukuran }}</td>
              <td class="text-center">{{ item.invd_jumlah }}</td>
              <td class="text-end">{{ formatRupiah(item.invd_harga) }}</td>
              <td class="text-end">{{ formatRupiah(item.invd_diskon) }}</td>
              <td class="text-end">{{ formatRupiah(item.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer-grid">
        <div class="terbilang-section">
          <strong>Terbilang:</strong>
          <em>{{ printData.header.terbilang }}</em>
        </div>
        <div class="summary">
          <div class="summary-item"><span>Total :</span><span>{{
            formatRupiah(printData.header.summary.subTotal) }}</span></div>
          <div class="summary-item"><span>Diskon :</span><span>{{
            formatRupiah(printData.header.summary.diskon) }}</span></div>
          <div class="summary-item"><span>Netto :</span><span>{{ formatRupiah(printData.header.summary.netto)
              }}</span></div>
          <div class="summary-item"><span>Biaya Kirim :</span><span>{{
            formatRupiah(printData.header.summary.biayaKirim) }}</span></div>
          <div class="summary-item"><span>DP :</span><span>{{ formatRupiah(printData.header.summary.dp)
              }}</span></div>
          <div class="summary-item grand-total"><span>Grand Total :</span><span>{{
            formatRupiah(printData.header.summary.grandTotal) }}</span></div>
          <div class="summary-item"><span>Bayar :</span><span>{{ formatRupiah(printData.header.summary.bayar)
              }}</span></div>
          <div class="summary-item"><span>Pundi amal :</span><span>{{
            formatRupiah(printData.header.summary.pundiAmal) }}</span></div>
          <div class="summary-item"><span>Kembali :</span><span>{{
            formatRupiah(printData.header.summary.kembali) }}</span></div>
        </div>
      </div>

      <div class="signatures">
        <div class="signature-box">
          <div>Sales Counter,</div>
          <div class="signature-space"></div>
          <div class="signature-name">( {{ printData.header.inv_sc }} )</div>
        </div>
        <div class="signature-box">
          <div>Mengetahui,</div>
          <div class="signature-space"></div>
          <div class="signature-name">( .................... )</div>
        </div>
        <div class="signature-box">
          <div>Customer,</div>
          <div class="signature-space"></div>
          <div class="signature-name">( .................... )</div>
        </div>
      </div>
      <div class="note">Note: Barang yg sudah dibeli tidak bisa dikembalikan. Terimakasih atas kunjungan anda.
      </div>

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
</template>

<style scoped>
/* Style untuk tampilan di browser (sebelum print) */
.print-container {
  background: #f5f5f5;
  padding: 20px 0;
}

.page {
  font-family: 'Arial', sans-serif;
  font-size: 9pt;
  display: flex;
  flex-direction: column;
  background: white;
  margin: 0 auto;

  /* Ukuran A4 Portrait untuk simulasi di layar */
  width: 210mm;
  min-height: 297mm;

  padding: 15mm;
  box-sizing: border-box;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.15);
}

/* (Salin sisa CSS untuk .header, .title, .info-grid, dll. dari kode Anda sebelumnya) */
.header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 15px;
  margin-bottom: 10px;
  width: 100%;
  /* penting */
}

.page>.header {
  align-self: flex-start !important;
  /* cegah center */
}

.company-info {
  display: flex;
  flex-direction: column;
  text-align: left;
  font-size: 8.5pt;
  line-height: 1.3;
  flex: 1; /* ✅ Agar company info mengambil sisa ruang */
}

.logo {
  height: 40px;
  width: auto;
  margin: 0; /* ✅ Hapus margin-right, gunakan gap di parent */
  flex-shrink: 0; /* ✅ Cegah logo menyusut */
}

.title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  text-decoration: underline;
  margin: 10px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 2px 15px;
  margin-bottom: 10px;
}

.info-grid .label {
  display: inline-block;
  width: 80px;
}

.info-grid .alamat {
  padding-left: 80px;
}

.items-table table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid black;
  padding: 3px 5px;
}

.text-end {
  text-align: right;
}

.text-center {
  text-align: center;
}

.terbilang-section {
  margin: 10px 0;
  font-style: italic;
  font-weight: bold;
}

.footer-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  margin-top: 10px;
  gap: 20px;
  align-items: flex-start;
}

.signatures {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  text-align: center;
  margin-top: 10px;
}

.signature-space {
  height: 40px;
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

.note {
  font-size: 8pt;
  margin-top: 15px;
  border-top: 1px solid black;
  padding-top: 5px;
}

.social-media {
  display: flex;
  gap: 20px;
  border-top: 1px solid black;
  padding-top: 5px;
  margin-top: auto;
}

.social-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.social-item img {
  height: 12px;
}

.info-line {
  display: flex;
  align-items: flex-start;
}

.info-line span:first-child {
  width: 80px; /* sama seperti label lain */
}

.alamat-multi span:last-child {
  margin-left: 3px;
  display: block;
}

/* --- ATURAN BARU YANG LEBIH SEDERHANA UNTUK PRINT --- */
@media print {

  /* Atur ukuran kertas dan margin cetak */
  @page {
    size: A4 portrait;
    margin: 15mm;
  }

  /* Paksa browser untuk menggunakan warna dan background */
  body,
  .page {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Hilangkan background abu-abu dari container saat print */
  .print-container {
    padding: 0;
    background: none;
  }

  /* Reset style visual dan PAKSA FONT saat mencetak */
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
}
</style>

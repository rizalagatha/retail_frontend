<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";
import LogoRezso from "@/assets/rezso.jpg";
import QRCode from "qrcode";

// --- DEFINISI INTERFACE CETAK ---
interface PrintHeader {
  nomor: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  customer_nama: string;
  tanggal: string;
  contact_nama: string;
  status: string;
  contact_telp: string;
  ref_nomor: string;
  kategori: string;
  keterangan: string;
  solusi: string;
  created_at: string;
  user_create: string;
  [key: string]: unknown; // Mengizinkan field tambahan dari backend
}

interface PrintDetail {
  kode: string;
  nama: string;
  ukuran: string;
  qty_invoice: number | string;
  qty: number | string;
  keterangan: string;
  [key: string]: unknown;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const qrCodeData = ref<string | null>(null);
const isLoading = ref(true);

const dynamicLogo = computed(() => {
  if (printData.value?.header?.nomor?.startsWith("K04")) {
    return LogoRezso;
  }
  return Logo;
});

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get<PrintData>(`/komplain-form/print/${nomor}`);

    const data = response.data;

    printData.value = data;

    document.title = "KOMPLAIN_" + data.header.nomor;

    qrCodeData.value = await QRCode.toDataURL(data.header.nomor, {
      width: 150,
      margin: 1,
    });
  } catch {
    alert("Gagal memuat data cetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (val) => {
  if (!val) {
    setTimeout(() => window.print(), 500);
  }
});

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) fetchPrintData(nomor);
});
</script>

<template>
  <div class="print-container">
    <div v-if="isLoading" class="text-center pa-10">Memuat data...</div>

    <div v-if="printData" class="page">
      <div class="header">
        <img :src="dynamicLogo" alt="Logo" class="logo" />
        <div class="company-info">
          <strong>{{ printData.header.perush_nama }}</strong>
          <div>{{ printData.header.perush_alamat }}</div>
          <div>Telp. {{ printData.header.perush_telp }}</div>
        </div>
        <img v-if="qrCodeData" :src="qrCodeData" class="qr-code" />
      </div>

      <div class="title">FORM KOMPLAIN CUSTOMER</div>

      <div class="info-grid">
        <div><span class="label">No. Komplain</span>: {{ printData.header.nomor }}</div>
        <div><span class="label">Customer</span>: {{ printData.header.customer_nama }}</div>

        <div>
          <span class="label">Tgl. Lapor</span>:
          {{ format(parseISO(printData.header.tanggal), "dd-MM-yyyy") }}
        </div>
        <div>
          <span class="label">Contact Person</span>: {{ printData.header.contact_nama || "-" }}
        </div>

        <div>
          <span class="label">Status</span>: <strong>{{ printData.header.status }}</strong>
        </div>
        <div>
          <span class="label">No. Telp CP</span>: {{ printData.header.contact_telp || "-" }}
        </div>

        <div><span class="label">Ref. Invoice</span>: {{ printData.header.ref_nomor }}</div>
        <div><span class="label">Kategori</span>: {{ printData.header.kategori }}</div>
      </div>

      <div class="section-container mb-4">
        <div class="section-title">I. KRONOLOGI / KETERANGAN KENDALA</div>
        <div class="text-box">
          {{ printData.header.keterangan || "-" }}
        </div>
      </div>

      <div class="section-title">II. DAFTAR BARANG BERMASALAH</div>
      <table class="items-table">
        <thead>
          <tr>
            <th class="no">No</th>
            <th class="kode">Kode Barang</th>
            <th class="nama">Nama Barang</th>
            <th class="ukuran">Size</th>
            <th style="width: 80px; text-align: center">Qty Inv</th>
            <th style="width: 90px; text-align: center">Qty Masalah</th>
            <th>Keterangan Per Item</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in printData.details" :key="index">
            <td class="no">{{ index + 1 }}</td>
            <td class="kode">{{ item.kode }}</td>
            <td class="nama">{{ item.nama }}</td>
            <td class="ukuran">{{ item.ukuran }}</td>
            <td style="text-align: center">{{ item.qty_invoice }}</td>
            <td style="text-align: center" class="font-weight-bold text-red">{{ item.qty }}</td>
            <td>{{ item.keterangan || "-" }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="printData.header.solusi" class="section-container mt-4">
        <div class="section-title">III. SOLUSI & TINDAK LANJUT PUSAT</div>
        <div
          class="text-box highlight-box"
          :class="printData.header.status === 'RESOLVED' ? 'bg-green' : 'bg-red'"
        >
          {{ printData.header.solusi }}
        </div>
      </div>

      <div class="footer">
        <div class="created-info">
          Dibuat: {{ printData.header.created_at }} | Dicetak:
          {{ format(new Date(), "dd/MM/yyyy HH:mm:ss") }}
        </div>

        <div class="signature-section">
          <div class="sig-title">PENGESAHAN</div>
          <div class="signatures">
            <div>
              Customer,
              <div class="sig-space"></div>
              ( {{ printData.header.customer_nama }} )
            </div>
            <div>
              Toko (CS),
              <div class="sig-space"></div>
              ( {{ printData.header.user_create }} )
            </div>
            <div>
              Pusat (QC/SPV),
              <div class="sig-space"></div>
              ( .................... )
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.print-container {
  background: #eee;
  padding: 20px;
  font-family: "Arial", sans-serif;
  font-size: 9pt;
}
.page {
  background: white;
  margin: 0 auto;
  width: 210mm;
  min-height: 297mm;
  padding: 15mm;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* Header Standar */
.header {
  display: flex;
  flex-direction: row;
  gap: 15px;
  margin-bottom: 10px;
  width: 100%;
  border-bottom: 2px solid black;
  padding-bottom: 10px;
}
.logo {
  height: 45px;
  width: auto;
  flex-shrink: 0;
}
.company-info {
  flex: 1;
  font-size: 9pt;
  line-height: 1.3;
}
.qr-code {
  height: 60px;
  width: 60px;
}

.title {
  text-align: center;
  font-size: 14pt;
  font-weight: bold;
  margin: 15px 0;
  text-decoration: underline;
}

/* Info Grid Meta */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 20px;
  margin-bottom: 15px;
}
.info-grid .label {
  display: inline-block;
  width: 100px;
  font-weight: bold;
}

/* Box Styling (Versi Oke) */
.section-title {
  font-weight: bold;
  font-size: 9pt;
  margin-bottom: 4px;
}
.text-box {
  border: 1px solid black;
  padding: 8px;
  min-height: 30px;
  line-height: 1.4;
  color: #000 !important; /* Paksa jadi hitam di layar */
}
.highlight-box {
  font-weight: bold;
}
.bg-green {
  background-color: #e8f5e9 !important;
}
.bg-red {
  background-color: #ffebee !important;
}

/* Table Detail */
.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 10px;
}
.items-table th,
.items-table td {
  border: 1px solid black;
  padding: 6px 8px;
  vertical-align: top;
}
.items-table thead th {
  background-color: #f0f0f0 !important;
  font-weight: bold;
  text-align: center;
}
.items-table .no {
  width: 30px;
  text-align: center;
}
.items-table .kode {
  width: 130px;
}
.items-table .ukuran {
  width: 60px;
  text-align: center;
}
.items-table .jumlah {
  width: 60px;
  text-align: right;
  font-weight: bold;
}

/* Footer & TTD */
.footer {
  margin-top: 30px; /* Dinamis mengikuti tabel */
  padding-top: 10px;
}
.created-info {
  text-align: right;
  font-size: 8pt;
  font-style: italic;
  margin-bottom: 10px;
}
.signature-section {
  border: 1px dashed #ccc;
  padding: 10px;
  border-radius: 5px;
  page-break-inside: avoid;
}
.sig-title {
  font-weight: bold;
  font-size: 10pt;
  border-bottom: 1px solid #eee;
  margin-bottom: 10px;
  color: #444;
}
.signatures {
  display: flex;
  justify-content: space-around;
  text-align: center;
}
.sig-space {
  height: 50px;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 10mm;
  }

  /* Tambahkan ini bro: Paksa semua teks jadi hitam saat diprint */
  .print-container,
  .print-container * {
    color: #000 !important; /* Paksa semua teks jadi hitam saat print */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-container {
    padding: 0;
    background: none;
  }
  .page {
    margin: 0;
    padding: 0;
    border: none;
    box-shadow: none;
    width: auto;
  }

  /* Pastikan warna background box tetap muncul tapi teks tetap hitam */
  .bg-green {
    background-color: #e8f5e9 !important;
  }
  .bg-red {
    background-color: #ffebee !important;
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";
import LogoRezso from "@/assets/rezso.jpg";
import QRCode from "qrcode";

interface PrintHeader {
  nomor: string;
  tanggal: string;
  deadline: string;
  keterangan: string;
  pic: string;
  created: string;
  user_create: string;
  approver: string; // Nama Supervisor yang ACC
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
    const response = await api.get<PrintData>(`/peminjaman-barang-form/print/${nomor}`);
    const data = response.data;

    printData.value = data;

    if (data.header?.nomor) {
      document.title = "PINJAM_" + data.header.nomor;

      qrCodeData.value = await QRCode.toDataURL(data.header.nomor, {
        width: 150,
        margin: 1,
      });
    }
  } catch {
    alert("Gagal memuat data cetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (val) => {
  if (!val) {
    // Beri sedikit delay agar gambar/QR ter-load sempurna sebelum dialog print muncul
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

      <div class="title">FORM PEMINJAMAN BARANG (INTERNAL)</div>

      <div class="info-grid">
        <div><span class="label">Nomor</span>: {{ printData.header.nomor }}</div>
        <div><span class="label">Peminjam (PIC)</span>: {{ printData.header.pic }}</div>
        <div>
          <span class="label">Tgl. Pinjam</span>:
          {{ format(parseISO(printData.header.tanggal), "dd-MM-yyyy") }}
        </div>
        <div>
          <span class="label">Deadline</span>:
          <strong style="text-decoration: underline">{{
            format(parseISO(printData.header.deadline), "dd-MM-yyyy")
          }}</strong>
        </div>
        <div class="keterangan">
          <span class="label">Peruntukan</span>: {{ printData.header.keterangan }}
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th class="no">No</th>
            <th class="kode">Kode Barang</th>
            <th class="nama">Nama Barang</th>
            <th class="ukuran">Size</th>
            <th class="jumlah">Qty</th>
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

      <div class="footer">
        <div class="created-info">Dicetak: {{ format(new Date(), "dd/MM/yyyy HH:mm:ss") }}</div>

        <div class="signature-section">
          <div class="sig-title">I. PENGAMBILAN BARANG</div>
          <div class="signatures">
            <div>
              Dibuat oleh,
              <div class="sig-space"></div>
              ( {{ printData.header.user_create }} )
            </div>
            <div>
              Peminjam,
              <div class="sig-space"></div>
              ( {{ printData.header.pic }} )
            </div>
            <div>
              Mengetahui,
              <div class="sig-space"></div>
              ( {{ printData.header.approver || "...................." }} )
            </div>
          </div>
        </div>

        <div class="signature-section" style="margin-top: 40px">
          <div class="sig-title">II. PENGEMBALIAN BARANG (Maks. 14 Hari)</div>
          <div class="signatures">
            <div>
              Diserahkan,
              <div class="sig-space"></div>
              ( {{ printData.header.pic }} )
            </div>
            <div>
              Diterima Admin,
              <div class="sig-space"></div>
              ( .................... )
            </div>
            <div>
              Diperiksa,
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
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

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

.info-grid .keterangan {
  grid-column: 1 / -1;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 5px;
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

.footer {
  margin-top: 30px;
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

  .print-container,
  .print-container * {
    color: #000 !important;
    background: #fff !important;
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

  .items-table thead th {
    background-color: #f0f0f0 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";
import LogoReszo from "@/assets/rezso.jpg";
import { formatRupiah } from "@/utils/formatRupiah";

interface PrintDetail1 {
  jenis: string;
  tgltrf?: string;
  kdcus: string;
  nmcus: string;
  inv: string;
  nomor_so?: string;
  nominal: number;
}

interface PrintDetail2 {
  jenis: string;
  summary_nominal: number;
  nominalv: number;
}

interface PrintHeader {
  fsk_nomor: string;
  fsk_tanggal: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  created: string;
  user_create: string;
}

interface PrintData {
  header: PrintHeader;
  details1: PrintDetail1[];
  details2: PrintDetail2[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const dynamicLogo = computed(() => {
  if (printData.value?.header?.fsk_nomor?.startsWith("K04")) {
    return LogoReszo;
  }
  return Logo;
});

// --- COMPUTED PROPERTIES UNTUK TOTAL ---
const totalNominalRincian = computed(() => {
  return printData.value?.details1.reduce((sum, item) => sum + item.nominal, 0) || 0;
});

const totalNominalRekap = computed(() => {
  return printData.value?.details2.reduce((sum, item) => sum + item.summary_nominal, 0) || 0;
});

const totalNominalVerifikasi = computed(() => {
  return printData.value?.details2.reduce((sum, item) => sum + item.nominalv, 0) || 0;
});
// --- AKHIR COMPUTED PROPERTIES ---

const fetchPrintData = async (nomor: string) => {
  try {
    const response = await api.get(`/fsk-form/print/${nomor}`);
    printData.value = response.data;
    document.title = response.data.header?.fsk_nomor || "FSK";
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
        <img :src="dynamicLogo" alt="Logo" class="logo" />
        <div class="company-info">
          <strong>{{ printData.header.perush_nama }}</strong>
          <div>{{ printData.header.perush_alamat }}</div>
          <div>{{ printData.header.perush_telp }}</div>
        </div>
      </div>

      <div class="title">Form Setoran Kasir</div>

      <div class="info-grid">
        <div><span class="label">Nomor Setoran</span>: {{ printData.header.fsk_nomor }}</div>
        <div>
          <span class="label">Tanggal Setor</span>:
          {{ format(parseISO(printData.header.fsk_tanggal), "dd-MM-yyyy") }}
        </div>
      </div>

      <div class="created-date">Created: {{ printData.header.created }}</div>

      <div class="items-table">
        <div class="table-title">RINCIAN SETORAN</div>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Jenis</th>
              <th>Tgl Transfer</th>
              <th>KdCus</th>
              <th>Nama Customer</th>
              <th>Invoice</th>
              <th>No. SO</th>
              <th class="text-end">Nominal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in printData.details1" :key="index">
              <td class="text-center">{{ index + 1 }}</td>
              <td>{{ item.jenis }}</td>
              <td>{{ item.tgltrf ? format(parseISO(item.tgltrf), "dd-MM-yyyy") : "" }}</td>
              <td>{{ item.kdcus }}</td>
              <td>{{ item.nmcus }}</td>
              <td>{{ item.inv }}</td>
              <td>{{ item.nomor_so || "-" }}</td>
              <td class="text-end">{{ formatRupiah(item.nominal) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="7" class="text-end grand-total">Total Setoran</td>
              <td class="text-end grand-total">{{ formatRupiah(totalNominalRincian) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="summary-section">
        <div class="summary-table">
          <div class="table-title">REKAPITULASI</div>
          <table>
            <thead>
              <tr>
                <th>Jenis Setoran</th>
                <th class="text-end">Total Nominal Setor</th>
                <th class="text-end">Nominal Verifikasi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in printData.details2" :key="item.jenis">
                <td>{{ item.jenis }}</td>
                <td class="text-end">{{ formatRupiah(item.summary_nominal) }}</td>
                <td class="text-end">{{ formatRupiah(item.nominalv) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="grand-total">
                <td>TOTAL</td>
                <td class="text-end">{{ formatRupiah(totalNominalRekap) }}</td>
                <td class="text-end">{{ formatRupiah(totalNominalVerifikasi) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="signatures">
          <div class="signature-box">
            <div>Dibuat Oleh,</div>
            <div class="signature-space"></div>
            <div class="signature-name">( {{ printData.header.user_create }} )</div>
          </div>
          <div class="signature-box">
            <div>Mengetahui,</div>
            <div class="signature-space"></div>
            <div class="signature-name">( Ka. TOKO )</div>
          </div>
          <div class="signature-box">
            <div>Diverifikasi,</div>
            <div class="signature-space"></div>
            <div class="signature-name">( Finance )</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Pengaturan dasar */
.page {
  font-family: "Segoe UI", Tahoma, sans-serif;
  font-size: 9pt;
}

.header {
  display: flex;
  flex-direction: row;
  justify-content: flex-start; /* ✅ Pastikan rata kiri */
  align-items: flex-start; /* ✅ Ubah dari center ke flex-start */
  gap: 15px; /* ✅ Gunakan gap untuk jarak */
  margin-bottom: 10px;
  width: 100%;
}

.print-container {
  font-family: "Segoe UI", Tahoma, sans-serif;
  font-size: 9pt;
  background-color: #e8e8e8; /* latar abu di luar kertas, biar kertas kelihatan jelas batasnya */
  padding: 20px 0;
  min-height: 100vh;
}

.page {
  width: 210mm;
  min-height: 297mm;
  padding: 10mm;
  margin: 0 auto;
  box-sizing: border-box;
  background: #fff;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.2); /* efek visual "lembar kertas" saat preview di layar */
}

.logo {
  height: 35px;
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
  text-decoration: underline;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 15px;
  margin-bottom: 5px;
  font-size: 9pt;
}

.info-grid .label {
  display: inline-block;
  width: 100px;
  font-weight: bold;
}

/* PERBAIKAN: Posisi Created Date */
.created-date {
  text-align: right;
  font-size: 8pt;
  margin-bottom: 5px;
}

.items-table,
.summary-section {
  margin-top: 10px;
}

.table-title {
  font-weight: bold;
  text-align: center;
  margin-bottom: 5px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid black;
  padding: 3px 5px;
  vertical-align: top;
}

th {
  background-color: #f0f0f0;
  text-align: center;
}

.text-center {
  text-align: center;
}

.text-end {
  text-align: right;
}

.grand-total {
  font-weight: bold;
}

.summary-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: 15px;
}

.summary-table {
  width: 45%;
}

/* PERBAIKAN: Struktur Signature */
.signatures {
  width: 50%;
  display: flex;
  text-align: center;
  justify-content: space-between;
}

.signature-box {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.signature-space {
  height: 40px;
}

.signature-name {
  border-top: 1px solid black;
  padding-top: 2px;
}

@media print {
  @page {
    size: A4;
    margin: 1cm;
  }

  body * {
    visibility: hidden;
  }

  .print-container,
  .print-container * {
    visibility: visible;
  }

  .print-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    background: #fff; /* override abu-abu, supaya tidak ikut nge-print */
    padding: 0;
  }

  .page {
    border: none;
    box-shadow: none; /* hilangkan bayangan kertas */
    margin: 0;
    padding: 0;
  }

  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}

/* ============================= */
/* FORCE LIGHT MODE FOR PRINT VIEW */
/* ============================= */

.print-container,
.print-container * {
  color: #000 !important;
  background: #fff !important;
}
</style>

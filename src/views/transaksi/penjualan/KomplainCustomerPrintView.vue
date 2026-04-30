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
  customer_nama: string;
  contact_nama?: string;
  contact_telp?: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  ref_nomor: string;
  nominal_inv: number; // <--- [TAMBAHAN] Tangkap nominal dari backend
  kategori: string;
  status: string;
  keterangan?: string;
  sumber_masalah?: string;
  solusi?: string;
  tanggung_jawab?: string;
  user_create: string;
  approver_nama?: string;
  approved_at?: string;
}

interface PrintDetail {
  nama: string;
  ukuran: string;
  qty: number;
  keterangan?: string | null;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const qrCodeData = ref<string | null>(null);
const isLoading = ref(true);

const dynamicLogo = computed(() =>
  printData.value?.header?.nomor?.startsWith("K04") ? LogoRezso : Logo
);

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get<PrintData>(`/komplain-form/print/${nomor}`);
    printData.value = response.data;
    document.title = "BAP_" + response.data.header.nomor;

    // Generate QR Code untuk Header
    qrCodeData.value = await QRCode.toDataURL(response.data.header.nomor, {
      width: 80,
      margin: 0,
    });
  } catch {
    alert("Gagal memuat data cetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (val) => {
  if (!val) setTimeout(() => window.print(), 500);
});
onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) fetchPrintData(nomor);
});
</script>

<template>
  <div class="print-container">
    <div v-if="isLoading" class="text-center pa-10">Memuat data...</div>

    <div v-if="printData" class="page bap-layout">
      <table class="bap-header-table">
        <tr>
          <td class="company-col">
            <h2 class="company-name">{{ printData.header.perush_nama }}</h2>
            <div class="company-address">{{ printData.header.perush_alamat }}</div>
            <div class="company-contact">Telp. {{ printData.header.perush_telp }}</div>
          </td>
          <td class="logo-col">
            <img v-if="qrCodeData" :src="qrCodeData" class="qr-code-header" />
            <img :src="dynamicLogo" alt="Logo" class="logo" />
          </td>
        </tr>
      </table>

      <div class="thick-line"></div>
      <div class="thin-line"></div>

      <h3 class="bap-title">BERITA ACARA DAN KOMPLAIN PRODUKSI</h3>

      <table class="bap-meta-table">
        <tr>
          <td width="100">Nomor BAP</td>
          <td width="10">:</td>
          <td width="280">
            <strong>{{ printData.header.nomor }}</strong>
          </td>
          <td width="100">Customer</td>
          <td width="10">:</td>
          <td>{{ printData.header.customer_nama }}</td>
        </tr>
        <tr>
          <td>Tanggal</td>
          <td>:</td>
          <td>{{ format(parseISO(printData.header.tanggal), "dd-MM-yyyy") }}</td>
          <td>Contact Person</td>
          <td>:</td>
          <td>
            {{ printData.header.contact_nama || "-" }} ({{ printData.header.contact_telp || "-" }})
          </td>
        </tr>
        <tr>
          <td>Cabang</td>
          <td>:</td>
          <td>{{ printData.header.perush_nama }}</td>
          <td>Ref Invoice</td>
          <td>:</td>
          <td>{{ printData.header.ref_nomor }}</td>
        </tr>
        <tr>
          <td>Kategori</td>
          <td>:</td>
          <td>{{ printData.header.kategori }}</td>
          <td>Status BAP</td>
          <td>:</td>
          <td>
            <strong>{{ printData.header.status }}</strong>
          </td>
        </tr>
        <!-- [BARU] Baris untuk Nominal Potensi Loss -->
        <tr>
          <td>Potensi Loss</td>
          <td>:</td>
          <td>
            <strong
              >Rp {{ Number(printData.header.nominal_inv || 0).toLocaleString("id-ID") }}</strong
            >
          </td>
          <td colspan="3"></td>
        </tr>
      </table>

      <div class="mb-5">
        <div class="box-section-title" style="text-align: left; margin-bottom: 6px">
          DAFTAR BARANG MASALAH / REVISI:
        </div>
        <ul class="barang-list">
          <li v-for="(item, index) in printData.details" :key="index">
            <strong>{{ item.nama }}</strong> (Size: {{ item.ukuran }}) &mdash; Qty Masalah:
            <strong>{{ item.qty }}</strong> pcs
            <span v-if="item.keterangan">
              &bull; <em>Ket: {{ item.keterangan }}</em></span
            >
          </li>
        </ul>
      </div>

      <div class="box-section-title text-center mt-4 mb-2">LAPORAN TOKO</div>
      <table class="bap-grid">
        <tr>
          <td class="bap-cell">
            <div class="bap-box">
              <div class="bap-label-box text-center">POKOK PERMASALAHAN</div>
              <div class="bap-content">{{ printData.header.keterangan || "-" }}</div>
            </div>
          </td>
          <td class="bap-cell">
            <div class="bap-box">
              <div class="bap-label-box text-center">SUMBER MASALAH</div>
              <div class="bap-content">{{ printData.header.sumber_masalah || "-" }}</div>
            </div>
          </td>
        </tr>
      </table>

      <div class="box-section-title text-center mt-5 mb-2">KEPUTUSAN PUSAT</div>
      <table class="bap-grid">
        <tr>
          <td class="bap-cell">
            <div class="bap-box">
              <div class="bap-label-box text-center">SOLUSI & TINDAK LANJUT</div>
              <div class="bap-content">{{ printData.header.solusi || "-" }}</div>
            </div>
          </td>
          <td class="bap-cell">
            <div class="bap-box">
              <div class="bap-label-box text-center">PERTANGGUNG JAWABAN</div>
              <div class="bap-content">{{ printData.header.tanggung_jawab || "-" }}</div>
            </div>
          </td>
        </tr>
      </table>

      <table class="bap-signatures mt-10">
        <tr>
          <td width="25%">Dibuat Oleh (Toko),</td>
          <td width="25%">Mengetahui (Customer),</td>
          <td width="25%">Disetujui (Pusat),</td>
          <td width="25%">Penyelesaian (Pusat),</td>
        </tr>
        <tr>
          <td class="sig-space"></td>
          <td class="sig-space"></td>
          <td class="sig-space relative-box">
            <div
              v-if="
                ['SUBMITTED', 'ON_REVIEW', 'RESOLVED'].includes(printData.header.status) &&
                printData.header.approver_nama
              "
              class="digital-stamp"
            >
              <div class="stamp-text">VERIFIED</div>
              <div class="stamp-date">
                {{ printData.header.approver_nama?.toUpperCase() }}<br />
                <span style="font-size: 6.5pt; font-weight: normal">{{
                  printData.header.approved_at
                }}</span>
              </div>
            </div>
          </td>
          <td class="sig-space relative-box">
            <div
              v-if="printData.header.status === 'RESOLVED' && printData.header.approver_nama"
              class="digital-stamp stamp-resolved"
            >
              <div class="stamp-text">RESOLVED</div>
              <div class="stamp-date">
                {{ printData.header.approver_nama?.toUpperCase() }}<br />
                <span style="font-size: 6.5pt; font-weight: normal">{{
                  printData.header.approved_at
                }}</span>
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <td>( {{ printData.header.user_create }} )</td>
          <td>( {{ printData.header.customer_nama }} )</td>
          <td>
            (
            {{
              ["SUBMITTED", "ON_REVIEW", "RESOLVED"].includes(printData.header.status)
                ? printData.header.approver_nama?.toUpperCase() || "..........................."
                : "..........................."
            }}
            )
          </td>
          <td>
            (
            {{
              printData.header.status === "RESOLVED"
                ? printData.header.approver_nama?.toUpperCase() || "..........................."
                : "..........................."
            }}
            )
          </td>
        </tr>
      </table>

      <div class="bap-footer-note">
        Dicetak pada: {{ format(new Date(), "dd/MM/yyyy HH:mm:ss") }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.print-container {
  background: #eee;
  padding: 20px;
  display: flex;
  justify-content: center;
}
.bap-layout {
  background: white;
  width: 210mm;
  min-height: 297mm;
  padding: 12mm 15mm;
  box-sizing: border-box;
  font-family: "Arial", sans-serif;
  font-size: 9pt;
  color: #000;
  position: relative;
}

/* HEADER */
.bap-header-table {
  width: 100%;
  border-collapse: collapse;
}
.company-name {
  margin: 0 0 4px 0;
  font-size: 14pt;
  font-weight: bold;
}
.company-address,
.company-contact {
  margin: 2px 0;
  font-size: 9pt;
}
.logo-col {
  text-align: right;
  vertical-align: top;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 15px;
}
.logo {
  height: 45px;
  width: auto;
}
.qr-code-header {
  height: 45px;
  width: 45px;
  object-fit: contain;
}

/* LINES & TITLE */
.thick-line {
  border-top: 3px solid black;
  margin-top: 5px;
  margin-bottom: 2px;
}
.thin-line {
  border-top: 1px solid black;
  margin-bottom: 15px;
}
.bap-title {
  text-align: center;
  text-decoration: underline;
  font-size: 12pt;
  margin-bottom: 20px;
  font-weight: bold;
}

/* META INFO GRID */
.bap-meta-table {
  width: 100%;
  font-size: 9pt;
  margin-bottom: 20px;
  border-collapse: collapse;
}
.bap-meta-table td {
  padding: 4px 0;
  vertical-align: top;
}

/* BARANG LIST */
.barang-list {
  margin: 0;
  padding-left: 20px;
  font-size: 9pt;
  line-height: 1.5;
}
.barang-list li {
  margin-bottom: 4px;
}

/* BOXES BAP GRID (2x2) */
.box-section-title {
  font-weight: bold;
  font-size: 9.5pt;
}
.bap-grid {
  width: 100%;
  border-collapse: separate;
  border-spacing: 10px;
  margin-left: -10px;
  margin-right: -10px;
}
.bap-cell {
  width: 50%;
  vertical-align: top;
}
.bap-box {
  border: 1.5px solid black;
  min-height: 150px;
  display: flex;
  flex-direction: column;
}
.bap-label-box {
  font-weight: bold;
  font-size: 8.5pt;
  padding: 8px 10px;
  border-bottom: 1px solid #ddd;
  background-color: #fafafa;
}
.bap-content {
  padding: 10px;
  font-size: 9pt;
  white-space: pre-wrap;
  line-height: 1.5;
  flex-grow: 1;
}

/* SIGNATURES & DIGITAL STAMP */
.bap-signatures {
  width: 100%;
  text-align: center;
  font-size: 9pt;
  page-break-inside: avoid;
}
.sig-space {
  height: 80px;
  vertical-align: middle;
}
.relative-box {
  position: relative;
}

/* Efek Tinta Stempel */
.digital-stamp {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-15deg);
  border: 2px solid #1976d2; /* Warna Biru Tinta */
  color: #1976d2 !important;
  padding: 4px 10px;
  border-radius: 4px;
  text-align: center;
  opacity: 0.85;
  font-family: "Courier New", Courier, monospace;
}
.stamp-text {
  font-size: 10pt;
  font-weight: bold;
  letter-spacing: 2px;
}
.stamp-date {
  font-size: 7pt; /* Ukuran diperkecil agar nama & waktu muat sebaris */
  border-top: 1px solid #1976d2;
  margin-top: 3px;
  padding-top: 2px;
}

/* Warna Hijau untuk Kolom Resolved */
.stamp-resolved {
  border-color: #388e3c;
  color: #388e3c !important;
}
.stamp-resolved .stamp-date {
  border-top-color: #388e3c;
}

.bap-footer-note {
  position: absolute;
  bottom: 12mm;
  left: 15mm;
  font-size: 7.5pt;
  font-style: italic;
  color: #555;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 10mm;
  }
  /* Paksa warna stempel biru & hijau tetap muncul di kertas */
  .print-container,
  .print-container * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Kecuali elemen lain dipaksa hitam agar hemat tinta */
  .bap-header-table,
  .bap-title,
  .bap-meta-table,
  .bap-grid,
  .bap-signatures {
    color: #000 !important;
  }
  .digital-stamp {
    color: #1976d2 !important;
    border-color: #1976d2 !important;
  }
  .stamp-resolved {
    color: #388e3c !important;
    border-color: #388e3c !important;
  }

  .print-container {
    padding: 0;
    background: none;
  }
  .bap-layout {
    margin: 0;
    padding: 0;
    border: none;
    box-shadow: none;
    width: 100%;
  }
  .bap-label-box {
    background-color: #fafafa !important;
  }
}
</style>

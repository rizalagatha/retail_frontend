<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format } from "date-fns";
import Logo from "@/assets/logo.png";
import QRCode from "qrcode";

interface FormHeader {
  nomor: string;
  soNomor: string;
  tanggal: string;
  salesKode: string;
  salesNama: string;
  customerKode: string;
  customerNama: string;
  customerAlamat: string;
  customerLevel: string;
  jenisOrderKode: string;
  jenisOrderNama: string;
  namaDtf: string;
  kain: string;
  finishing: string;
  desain: string;
  workshopKode: string;
  workshopNama: string;
  keterangan: string;
  user: string;
  imageUrl: string | null;
  noSoDtfRiil: string;
  revisiList: RevisiItem[];
}

interface RevisiItem {
  tr_id: number;
  tr_revisi_ke: number;
  tanggal_revisi: string;
  tr_catatan: string;
  tr_gambar: string | null;
}

interface DetailUkuran {
  ukuran: string;
  jumlah: number;
  namaBarang: string;
}

interface DetailTitik {
  keterangan: string;
  sizeCetak: string;
  panjang: number;
  lebar: number;
}

interface PrintData {
  header: FormHeader;
  detailsUkuran: DetailUkuran[];
  detailsTitik: DetailTitik[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;
const qrCodeData = ref<string | null>(null);

const barangList = computed(() => printData.value?.detailsUkuran || []);
const titikList = computed(() => printData.value?.detailsTitik || []);
const totalJumlah = computed(() =>
  barangList.value.reduce((sum, item) => sum + (item.jumlah || 0), 0)
);

const latestRevision = computed(() => {
  const revisiList = printData.value?.header?.revisiList || [];
  // Karena dari backend sudah di-ORDER BY ASC, revisi terakhir pasti ada di paling belakang array
  return revisiList.length > 0 ? revisiList[revisiList.length - 1] : null;
});

const latestImageUrl = computed(() => {
  return latestRevision.value?.tr_gambar || printData.value?.header?.imageUrl;
});

const statusRevisiText = computed(() => {
  if (latestRevision.value && latestRevision.value.tr_revisi_ke > 0) {
    return `Revisi ${latestRevision.value.tr_revisi_ke}`;
  }
  return "Desain Awal";
});

// Fungsi Ambil URL Gambar
const getFullImageUrl = (path?: string | null): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;

  // Langsung return path aslinya saja Mas!
  return path;
};

const getJenisOrderDisplay = (joKode: string) => {
  switch (joKode) {
    case "BR":
      return "BORDIR";
    case "SB":
      return "SABLON";
    case "SD":
      return "DTF";
    default:
      return joKode;
  }
};

const fetchPrintData = async (nomor: string) => {
  try {
    // Memanfaatkan API getById yang sudah kita rapikan sebelumnya
    const response = await api.get<PrintData>(`/so-dtf-trial-form/${nomor}`);
    const data = response.data;

    printData.value = data;

    if (data.header?.nomor) {
      document.title = data.header.nomor;

      qrCodeData.value = await QRCode.toDataURL(data.header.nomor, {
        width: 200,
        margin: 1,
      });
    }
  } catch (error) {
    console.error("Gagal memuat data cetak:", error);
    alert("Gagal memuat data untuk dicetak.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (newValue) => {
  if (newValue === false && printData.value) {
    // Kasi delay 500ms agar gambar sempat ter-render sebelum dialog print muncul
    nextTick(() => {
      setTimeout(() => window.print(), 500);
    });
  }
});

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    fetchPrintData(nomor);
  }
});
</script>

<template>
  <div class="print-container">
    <div v-if="isLoading" class="text-center py-10">Memuat data cetakan...</div>

    <div v-if="printData && printData.header" class="page">
      <div class="page-header">
        <div class="header-left">
          <img :src="appLogo" alt="Logo" class="logo" />

          <div class="title-block">
            <div class="main-title">
              TRIAL SO {{ getJenisOrderDisplay(printData.header.jenisOrderKode) }}
            </div>
            <span
              >Cust: {{ printData.header.customerKode }} - {{ printData.header.customerNama }}</span
            >
            <span v-if="printData.header.noSoDtfRiil" style="font-weight: bold; color: black">
              (Telah Jadi SO: {{ printData.header.noSoDtfRiil }})
            </span>
          </div>
        </div>

        <div class="header-right">
          <img v-if="qrCodeData" :src="qrCodeData" class="qr-image" />
        </div>
      </div>

      <div class="content-wrapper">
        <div class="data-section">
          <div class="data-grid">
            <div class="label">No. Trial</div>
            <div class="value">
              : <b>{{ printData.header.nomor }}</b>
            </div>

            <div class="label">Ref. SO</div>
            <div class="value">: {{ printData.header.soNomor || "-" }}</div>

            <div class="label">Tanggal</div>
            <div class="value">
              : {{ format(new Date(printData.header.tanggal), "dd/MM/yyyy") }}
            </div>

            <div class="label">Jenis Order</div>
            <div class="value">: {{ printData.header.jenisOrderNama }}</div>

            <div class="label">Nama Desain</div>
            <div class="value">: {{ printData.header.namaDtf }}</div>

            <div class="label">Status Desain</div>
            <div class="value">
              : <b>{{ statusRevisiText }}</b>
            </div>

            <div class="label">Jumlah Total</div>
            <div class="value">: {{ totalJumlah }} Pcs</div>

            <div class="label">Kain</div>
            <div class="value">: {{ printData.header.kain }}</div>

            <div class="label">Finishing</div>
            <div class="value">: {{ printData.header.finishing }}</div>

            <div class="label">Workshop</div>
            <div class="value">
              : {{ printData.header.workshopKode }} - {{ printData.header.workshopNama }}
            </div>

            <div class="label">Desainer</div>
            <div class="value">: {{ printData.header.desain || "-" }}</div>

            <div class="label">Catatan Trial</div>
            <div class="value keterangan-text">: {{ printData.header.keterangan || "-" }}</div>
          </div>

          <div v-if="barangList.length" class="barang-table">
            <strong>DETAIL KAOS:</strong>
            <table>
              <thead>
                <tr>
                  <th>Nama Barang</th>
                  <th style="width: 80px; text-align: center">Ukuran</th>
                  <th style="width: 80px; text-align: center">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(b, i) in barangList" :key="i">
                  <td>{{ b.namaBarang }}</td>
                  <td style="text-align: center">{{ b.ukuran }}</td>
                  <td style="text-align: center">{{ b.jumlah }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="titikList.length" class="titik-section">
            <strong>TITIK CETAK/BORDIR:</strong>
            <div v-for="(t, i) in titikList" :key="'titik' + i" class="titik-details">
              {{ i + 1 }}. {{ t.keterangan }} ({{ t.sizeCetak }})
              <span v-if="t.panjang > 0 || t.lebar > 0"
                >➔ P:{{ t.panjang }}cm × L:{{ t.lebar }}cm</span
              >
            </div>
          </div>

          <div class="signatures">
            <div class="signature-box">
              <div>Sales / Admin,</div>
              <div class="name-line">
                ( {{ printData.header.salesNama || printData.header.user }} )
              </div>
            </div>
            <div class="signature-box">
              <div>Mengetahui,</div>
              <div class="name-line">( ......................... )</div>
            </div>
          </div>
        </div>

        <div class="image-container">
          <div v-if="latestImageUrl" class="image-box">
            <img :src="getFullImageUrl(latestImageUrl)" alt="Design Preview" />
          </div>
          <div v-else class="image-placeholder">
            <span>Tidak Ada Gambar</span>
          </div>
        </div>
      </div>

      <div class="footer">
        Dicetak pada: {{ format(new Date(), "dd/MM/yyyy HH:mm") }} | Oleh:
        {{ printData.header.user }}
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page {
    size: A4 portrait;
    margin: 0.3cm 0.5cm !important;
  }

  /* ==== PAKSA SCALE 77% (AKURAT SESUAI PRINT PREVIEW KAMU) ==== */
  html {
    transform: scale(0.77) !important;
    transform-origin: top left !important;
    width: 130% !important;
    /* kompensasi penyusutan agar layout tidak gepeng */
  }

  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* === Visibility rules === */
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
  }

  /* biarkan tinggi flexible */
  .page {
    width: 100% !important;
    min-height: auto !important;
    margin: 0 !important;
    padding: 0.3cm 0.5cm !important;
    box-shadow: none !important;
    page-break-after: always;
  }

  .image-box img {
    max-height: 250px !important;
  }
}

.page {
  background: white;
  padding: 0.3cm 0.5cm;
  margin: 10px auto;
  width: 21cm;
  min-height: 29.7cm;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  font-family: "Arial", sans-serif;
  font-size: 10pt;
  color: #333;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1.5px solid black;
  padding-bottom: 5px;
  margin-bottom: 8px;
}

.header-left {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.title-block {
  display: flex;
  flex-direction: column;
}

.main-title {
  font-size: 16pt;
  font-weight: bold;
  margin-bottom: 2px;
}

.po-title {
  font-size: 11pt;
  font-weight: bold;
}

.qr-image {
  width: 50px;
  height: 50px;
  margin-left: 15px;
}

.header-right {
  font-size: 10pt;
  font-weight: bold;
}

.logo {
  width: 45px;
  height: auto;
  margin-right: 10px;
}

/* Layout Utama: Data + Gambar */
.content-wrapper {
  display: flex;
  gap: 15px;
  margin-bottom: 10px;
  flex-grow: 1;
}

.data-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.data-grid {
  display: grid;
  grid-template-columns: 100px auto;
  row-gap: 3px;
  column-gap: 8px;
  margin-bottom: 10px;
}

.label {
  font-weight: bold;
  font-size: 9pt;
}

.value {
  word-wrap: break-word;
  font-size: 9pt;
}

.keterangan-text {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.barang-table {
  margin: 10px 0;
  font-size: 9pt;
}

.barang-table table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 5px;
}

.barang-table th,
.barang-table td {
  border: 1px solid #aaa;
  padding: 4px 6px;
}

.titik-section {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed #ccc;
  margin-bottom: 10px;
}

.titik-details {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 9pt;
  margin-top: 4px;
  margin-bottom: 0;
}

/* TTD Section - 2 Kolom Kecil */
.signatures {
  display: flex;
  gap: 25px;
  margin-top: 12px;
  text-align: center;
  font-size: 8.5pt;
}

.signature-box {
  width: 140px;
}

.name-line {
  margin-top: 35px;
  font-weight: bold;
}

/* Gambar Tanpa Border */
.image-container {
  width: 50%;
  flex-shrink: 0;
  border-left: 1px dashed #ccc;
  padding-left: 15px;
}

.image-box,
.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: #fff;
  min-height: 400px;
}

.image-box img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-placeholder {
  color: #ccc;
  font-size: 14pt;
  margin-top: 50px;
}

.footer {
  border-top: 1px solid #ccc;
  padding-top: 4px;
  margin-top: 8px;
  font-style: italic;
  font-size: 7.5pt;
  color: #555;
}

/* FORCE LIGHT MODE FOR PRINT VIEW */
.print-container,
.print-container * {
  color: #000 !important;
  background: #fff !important;
}
</style>

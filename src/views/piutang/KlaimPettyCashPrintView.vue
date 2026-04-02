<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";
import LogoRezso from "@/assets/rezso.jpg";
import QRCode from "qrcode";
import { formatRupiah } from "@/utils/formatRupiah";

interface PrintDetail {
  pc_nomor: string;
  pcd_tanggal: string;
  pcd_pcv: number | string;
  pcd_kategori: string;
  pcd_keterangan: string;
  pcd_no_transaksi?: string;
  pcd_nominal: number;
  pcd_file?: string;
}

interface PrintHeader {
  pck_nomor: string;
  pck_tanggal: string;
  pck_cab: string;
  gdg_nama: string;
  pck_keterangan: string;
  pck_total: number;
  pck_status: string;
  pck_acc: string;
  user_create: string;
  // Detail gudang hasil JOIN dari backend (opsional menggunakan tanda '?')
  gdg_inv_nama?: string;
  gdg_inv_alamat?: string;
  gdg_inv_kota?: string;
  gdg_inv_telp?: string;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const route = useRoute();
const authStore = useAuthStore();
const printData = ref<PrintData | null>(null);
const qrCodeData = ref<string | null>(null);
const isLoading = ref(true);

const dynamicLogo = computed(() => {
  if (printData.value?.header?.pck_cab === "K04") return LogoRezso;
  return Logo;
});

const getImageUrl = (fileName: string) => {
  if (!fileName) return "";
  const apiUrl = api.defaults.baseURL || "";
  let baseUrl = apiUrl.replace(/\/api\/?$/, "");
  if (apiUrl.startsWith("/")) {
    baseUrl =
      window.location.port === "5173"
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : window.location.origin;
  }
  return `${baseUrl}/uploads/pettycash/${fileName}`;
};

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/petty-cash/klaim-finance/proses/${nomor}`);
    const data = response.data; // [PERBAIKAN] Simpan di variabel lokal dulu

    printData.value = data;
    document.title = "KLAIM_" + data.header.pck_nomor; // Ambil dari data lokal

    qrCodeData.value = await QRCode.toDataURL(data.header.pck_nomor, {
      width: 150,
      margin: 1,
    });
  } catch (error: unknown) {
    // Sekalian diamankan
    alert("Gagal memuat data cetak.");
    console.error(error);
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (val) => {
  if (!val) setTimeout(() => window.print(), 1000);
});

onMounted(() => {
  if (route.params.nomor) fetchPrintData(route.params.nomor as string);
});
</script>

<template>
  <div class="print-container">
    <div v-if="isLoading" class="text-center pa-10 no-print">Memuat data cetak...</div>

    <div v-if="printData" class="page">
      <div class="header">
        <img :src="dynamicLogo" alt="Logo" class="logo" />
        <div class="company-info">
          <strong>{{ printData.header.gdg_inv_nama || "PT. KAOSAN JAYA ABADI" }}</strong>
          <div>{{ printData.header.gdg_inv_alamat || "Jl. Padokan No. 1" }}</div>
          <div>Telp. {{ printData.header.gdg_inv_telp || "(0274) 123456" }}</div>
        </div>
        <img v-if="qrCodeData" :src="qrCodeData" class="qr-code" />
      </div>

      <div class="title">BUKTI KLAIM PETTY CASH (KOLEKTIF)</div>

      <div class="info-grid">
        <div><span class="label">No. Pengajuan</span>: {{ printData.header.pck_nomor }}</div>
        <div>
          <span class="label">Cabang</span>: {{ printData.header.pck_cab }} -
          {{ printData.header.gdg_nama }}
        </div>
        <div>
          <span class="label">Tanggal</span>:
          {{ format(parseISO(printData.header.pck_tanggal), "dd-MM-yyyy") }}
        </div>
        <div>
          <span class="label">Status</span>:
          <strong style="text-transform: uppercase">{{ printData.header.pck_status }}</strong>
        </div>
        <div class="keterangan">
          <span class="label">Keterangan</span>: {{ printData.header.pck_keterangan || "-" }}
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th class="no">No</th>
            <th width="110">Ref. Dokumen</th>
            <th>Kategori & Keterangan</th>
            <th width="150">Bukti Nota</th>
            <th class="nominal">Nominal (Rp)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in printData.details" :key="index" class="row-avoid-break">
            <td class="no">{{ index + 1 }}</td>
            <td class="text-center">
              <strong>{{ item.pc_nomor }}</strong
              ><br />
              <span style="font-size: 8px"
                >Tgl: {{ format(parseISO(item.pcd_tanggal), "dd/MM/yy") }}</span
              ><br />
              <span style="font-size: 8px">PCV: {{ item.pcd_pcv }}</span>
            </td>
            <td>
              <div style="font-weight: bold; font-size: 8pt; color: #444">
                {{ item.pcd_kategori }}
              </div>
              <div>{{ item.pcd_keterangan }}</div>

              <div
                v-if="item.pcd_no_transaksi"
                style="font-size: 8pt; color: #1565c0; margin-top: 3px; font-style: italic"
              >
                <strong>Resi:</strong> {{ item.pcd_no_transaksi }}
              </div>
            </td>

            <td class="text-center">
              <template v-if="item.pcd_file">
                <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 4px">
                  <template v-for="(fName, fIdx) in item.pcd_file.split(',')" :key="fIdx">
                    <img
                      v-if="!fName.toLowerCase().endsWith('.pdf')"
                      :src="getImageUrl(fName)"
                      class="nota-image-table"
                      style="margin-bottom: 4px"
                    />
                    <div
                      v-else
                      class="text-caption"
                      style="font-style: italic; font-size: 8pt; margin-bottom: 4px"
                    >
                      (PDF {{ fIdx + 1 }} Terlampir)
                    </div>
                  </template>
                </div>
              </template>
              <span v-else>-</span>
            </td>

            <td class="nominal">{{ formatRupiah(item.pcd_nominal) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="summary-row">
            <td colspan="4" class="text-right font-weight-bold">TOTAL DANA DICAIRKAN</td>
            <td class="nominal font-weight-bold" style="font-size: 10pt; color: green !important">
              {{ formatRupiah(printData.header.pck_total) }}
            </td>
          </tr>
        </tfoot>
      </table>

      <div class="footer">
        <div class="created-info">
          Dicetak pada: {{ format(new Date(), "dd/MM/yyyy HH:mm") }} oleh {{ authStore.user?.nama }}
        </div>

        <div class="signature-section">
          <div class="sig-title">PENGESAHAN BATCH KLAIM</div>
          <div class="signatures">
            <div>
              Dibuat Oleh (Store),
              <div class="sig-space"></div>
              ( {{ printData.header.user_create }} )
            </div>
            <div>
              Di-ACC (Supervisor),
              <div class="sig-space"></div>
              ( {{ printData.header.pck_acc || "...................." }} )
            </div>
            <div>
              Approved (Finance),
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
  color: #000;
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
  font-size: 8pt;
  line-height: 1.3;
}
.qr-code {
  height: 60px;
  width: 60px;
}
.title {
  text-align: center;
  font-size: 13pt;
  font-weight: bold;
  margin: 15px 0;
  text-decoration: underline;
  text-transform: uppercase;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 20px;
  margin-bottom: 15px;
}
.info-grid .label {
  display: inline-block;
  width: 90px;
  font-weight: bold;
}
.info-grid .keterangan {
  grid-column: 1 / -1;
  border-top: 1px solid #eee;
  padding-top: 4px;
}
.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 5px;
}
.items-table th,
.items-table td {
  border: 1px solid black;
  padding: 4px 6px;
  vertical-align: middle;
}
.items-table thead th {
  background-color: #f0f0f0 !important;
  font-weight: bold;
  text-align: center;
  text-transform: uppercase;
  font-size: 8pt;
}
.items-table .no {
  width: 30px;
  text-align: center;
}
.text-center {
  text-align: center;
}
.text-right {
  text-align: right;
}
.items-table .nominal {
  width: 100px;
  text-align: right;
  font-weight: bold;
}
.summary-row td {
  background-color: #f9f9f9 !important;
}
.row-avoid-break {
  page-break-inside: avoid;
}
.nota-image-table {
  width: 100%;
  max-width: 140px;
  max-height: 180px;
  object-fit: contain;
  display: block;
  margin: 0 auto;
}
.footer {
  padding-top: 10px;
  margin-top: 20px;
}
.created-info {
  text-align: right;
  font-size: 7pt;
  font-style: italic;
  margin-bottom: 5px;
}
.signature-section {
  border: 1px solid #000;
  padding: 10px;
  margin-top: 5px;
}
.sig-title {
  font-weight: bold;
  font-size: 9pt;
  border-bottom: 1px solid #000;
  margin-bottom: 10px;
  text-align: center;
}
.signatures {
  display: flex;
  justify-content: space-around;
  text-align: center;
}
.sig-space {
  height: 45px;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 10mm;
  }
  .no-print {
    display: none;
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

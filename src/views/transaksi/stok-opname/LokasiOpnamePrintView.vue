<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import LogoKaosan from "@/assets/logo.png";
import LogoRezso from "@/assets/rezso.jpg";

const route = useRoute();
const authStore = useAuthStore();
const isLoading = ref(true);

interface DetailBarang {
  hs_idrec: string;
  hs_kode: string;
  barcode: string;
  nama_barang: string;
  hs_ukuran: string;
  hs_qty: number;
  hs_operator: string;
  date_create: string;
  no_packing_list?: string;
  no_packing_produksi?: string;
  gdg_inv_nama?: string;
  gdg_inv_alamat?: string;
  gdg_inv_kota?: string;
  gdg_inv_telp?: string;
}

interface GudangInfo {
  gdg_inv_nama: string;
  gdg_inv_alamat: string;
  gdg_inv_kota: string;
  gdg_inv_telp: string;
}

interface LokasiData {
  cabang: string;
  lokasi: string;
  items: DetailBarang[];
}

interface LokasiOpnameRaw {
  lo_idrec: string;
  lo_cab: string;
  lo_lokasi: string;
  gdg_inv_nama?: string;
  gdg_inv_alamat?: string;
  gdg_inv_kota?: string;
  gdg_inv_telp?: string;
}

const reportData = ref<LokasiData[]>([]);
const gudangInfo = ref<GudangInfo | null>(null);
const currentDate = format(new Date(), "dd/MM/yyyy HH:mm");

const primaryCabang = computed(() =>
  reportData.value.length > 0 ? reportData.value[0].cabang : ""
);
const logo = computed(() => (primaryCabang.value === "K04" ? LogoRezso : LogoKaosan));

const loadData = async () => {
  const idString = route.query.ids as string;
  if (!idString) return;
  const ids = idString.split(",");
  isLoading.value = true;
  try {
    const cabangUser = authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang;
    const responseMaster = await api.get("/lokasi-opname", {
      params: { cabang: cabangUser, jenis: "ALL", tanggal: "ALL" },
    });
    const selectedLocations = responseMaster.data.filter((item: LokasiOpnameRaw) =>
      ids.includes(item.lo_idrec)
    );
    const resultPromises = selectedLocations.map(async (loc: LokasiOpnameRaw) => {
      const res = await api.get("/lokasi-opname/detail-barang", {
        params: { cabang: loc.lo_cab, lokasi: loc.lo_lokasi },
      });
      return { cabang: loc.lo_cab, lokasi: loc.lo_lokasi, items: res.data as DetailBarang[] };
    });
    reportData.value = await Promise.all(resultPromises);

    const firstLoc = selectedLocations[0];
    if (firstLoc) {
      gudangInfo.value = {
        gdg_inv_nama: firstLoc.gdg_inv_nama || "",
        gdg_inv_alamat: firstLoc.gdg_inv_alamat || "",
        gdg_inv_kota: firstLoc.gdg_inv_kota || "",
        gdg_inv_telp: firstLoc.gdg_inv_telp || "",
      };
    }
    setTimeout(() => {
      window.print();
    }, 800);
  } catch (error) {
    console.error("Gagal memuat data cetak", error);
  } finally {
    isLoading.value = false;
  }
};

const totalQty = (items: DetailBarang[]) => items.reduce((sum, item) => sum + item.hs_qty, 0);

onMounted(() => {
  loadData();
});
</script>

<template>
  <PrintLayout title="Lembar Validasi Stok Opname">
    <div v-if="isLoading" class="d-flex justify-center my-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <div v-else class="print-container">
      <!-- Header dokumen -->
      <div class="doc-header">
        <!-- Kiri: Logo + info perusahaan/gudang -->
        <div class="doc-header-left">
          <img :src="logo" class="doc-logo" alt="Logo" />
          <div class="doc-company-info">
            <div v-if="gudangInfo?.gdg_inv_nama" class="doc-gudang-nama">
              {{ gudangInfo.gdg_inv_nama }}
            </div>
            <div v-if="gudangInfo?.gdg_inv_alamat" class="doc-gudang-detail">
              {{ gudangInfo.gdg_inv_alamat }}, {{ gudangInfo.gdg_inv_kota }}
            </div>
            <div v-if="gudangInfo?.gdg_inv_telp" class="doc-gudang-detail">
              {{ gudangInfo.gdg_inv_telp }}
            </div>
          </div>
        </div>
        <!-- Kanan: Meta info -->
        <div class="doc-header-right">
          <table class="meta-table">
            <tr>
              <td>Dicetak oleh</td>
              <td>:</td>
              <td>{{ authStore.user?.nama || authStore.user?.kode }}</td>
            </tr>
            <tr>
              <td>Waktu cetak</td>
              <td>:</td>
              <td>{{ currentDate }}</td>
            </tr>
            <tr>
              <td>Jumlah lokasi</td>
              <td>:</td>
              <td>{{ reportData.length }}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Judul di bawah garis -->
      <div class="doc-divider"></div>
      <div class="doc-title-bar">LEMBAR VALIDASI STOK OPNAME</div>
      <div class="doc-divider-thin"></div>

      <!-- Per lokasi -->
      <div v-for="(data, index) in reportData" :key="index" class="location-section">
        <div class="location-header">
          <span class="location-label">LOKASI</span>
          <span class="location-code">{{ data.lokasi }}</span>
          <span class="location-cab">Cabang: {{ data.cabang }}</span>
          <span class="location-qty"
            >Total: <strong>{{ totalQty(data.items) }}</strong> pcs</span
          >
        </div>

        <table class="print-table">
          <thead>
            <tr>
              <th class="col-no">No</th>
              <th class="col-kode">Kode Barang</th>
              <th class="col-barcode">Barcode</th>
              <th class="col-nama">Nama Barang</th>
              <th class="col-ukuran">Ukuran</th>
              <th class="col-operator">Operator</th>
              <th v-if="data.cabang === 'KDC'" class="col-pl">No. PL</th>
              <th v-if="data.cabang === 'KDC'" class="col-prod">No. Prod</th>
              <th class="col-qty">Qty</th>
              <th class="col-validasi">Hitung 2</th>
              <th class="col-validasi">Hitung 3</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="data.items.length === 0">
              <td :colspan="data.cabang === 'KDC' ? 11 : 9" class="empty-row">
                (Tidak ada barang di lokasi ini)
              </td>
            </tr>
            <tr v-for="(item, idx) in data.items" :key="idx" :class="{ 'row-alt': idx % 2 === 1 }">
              <td class="text-center">{{ idx + 1 }}</td>
              <td class="kode-cell">{{ item.hs_kode }}</td>
              <td class="barcode-cell">{{ item.barcode || "-" }}</td>
              <td class="nama-cell">{{ item.nama_barang }}</td>
              <td class="text-center">{{ item.hs_ukuran }}</td>
              <td>{{ item.hs_operator }}</td>
              <td v-if="data.cabang === 'KDC'" class="text-center">
                {{ item.no_packing_list || "-" }}
              </td>
              <td v-if="data.cabang === 'KDC'" class="text-center">
                {{ item.no_packing_produksi || "-" }}
              </td>
              <td class="text-right qty-cell">{{ item.hs_qty }}</td>
              <td class="col-validasi-cell"></td>
              <td class="col-validasi-cell"></td>
            </tr>
          </tbody>
          <tfoot v-if="data.items.length > 0">
            <tr class="total-row">
              <td :colspan="data.cabang === 'KDC' ? 9 : 7" class="text-right">TOTAL KESELURUHAN</td>
              <td class="text-right total-qty">{{ totalQty(data.items) }}</td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- TTD satu kali di akhir semua lokasi -->
      <div class="ttd-section">
        <div class="ttd-box">
          <div class="ttd-label">Checker 1 (Input Awal)</div>
          <div class="ttd-space"></div>
          <div class="ttd-line"></div>
          <div class="ttd-name">(..............................)</div>
        </div>
        <div class="ttd-box">
          <div class="ttd-label">Checker 2 (Validasi)</div>
          <div class="ttd-space"></div>
          <div class="ttd-line"></div>
          <div class="ttd-name">(..............................)</div>
        </div>
        <div class="ttd-box">
          <div class="ttd-label">Checker 3</div>
          <div class="ttd-space"></div>
          <div class="ttd-line"></div>
          <div class="ttd-name">(..............................)</div>
        </div>
      </div>
    </div>
  </PrintLayout>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

:global(body) {
  background: #e0e0e0 !important;
  margin: 0;
  padding: 24px 0;
  min-height: 100vh;
}

.print-container {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10px;
  color: #000;
  width: 794px;
  min-width: 794px;
  margin: 0 auto;
  padding: 20px 24px;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Header */
.doc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.doc-header-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-shrink: 0;
}
.doc-logo {
  height: 48px;
  width: auto;
  object-fit: contain;
}
.doc-company-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.doc-gudang-nama {
  font-size: 11px;
  font-weight: 700;
  color: #111;
  line-height: 1.4;
}
.doc-gudang-detail {
  font-size: 9px;
  color: #555;
  line-height: 1.4;
}
.doc-header-right {
  flex-shrink: 0;
  text-align: right;
}
.meta-table {
  font-size: 9px;
  border-collapse: collapse;
}
.meta-table td {
  padding: 1px 3px;
  color: #444;
}
.meta-table td:first-child {
  white-space: nowrap;
}
.meta-table td:nth-child(2) {
  padding: 1px 4px;
}

/* Judul di bawah garis */
.doc-divider {
  border-top: 2px solid #000;
  margin-bottom: 6px;
}
.doc-title-bar {
  text-align: center;
  font-size: 13px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 5px 0 6px;
  color: #0d47a1;
}
.doc-divider-thin {
  border-top: 1px solid #ccc;
  margin-bottom: 10px;
}

/* Lokasi */
.location-section {
  margin-bottom: 20px;
  page-break-inside: avoid;
}
.location-header {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: #0d47a1;
  color: #fff;
  padding: 5px 10px;
  border-radius: 3px 3px 0 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.location-label {
  font-size: 9px;
  font-weight: bold;
  text-transform: uppercase;
  opacity: 0.8;
}
.location-code {
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.5px;
}
.location-cab {
  font-size: 9px;
  opacity: 0.85;
  margin-left: 4px;
}
.location-qty {
  margin-left: auto;
  font-size: 10px;
}

/* Tabel */
.print-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9px;
  table-layout: fixed;
}
.col-no {
  width: 24px;
}
.col-kode {
  width: 88px;
}
.col-barcode {
  width: 68px;
}
.col-nama {
  width: auto;
}
.col-ukuran {
  width: 44px;
}
.col-operator {
  width: 52px;
}
.col-pl {
  width: 54px;
}
.col-prod {
  width: 54px;
}
.col-qty {
  width: 32px;
}
.col-validasi {
  width: 58px;
  text-align: center;
}

.print-table th {
  background-color: #e3f2fd;
  color: #0d47a1;
  font-weight: bold;
  text-align: left;
  padding: 4px 5px;
  border: 0.5px solid #b0bec5;
  white-space: nowrap;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.print-table td {
  padding: 3px 5px;
  border: 0.5px solid #ddd;
  vertical-align: middle;
  word-break: break-word;
}
.nama-cell {
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
.kode-cell {
  font-weight: bold;
  color: #1565c0;
  font-size: 8px;
}
.barcode-cell {
  font-size: 8px;
}
.qty-cell {
  font-weight: bold;
}
.row-alt {
  background-color: #f9fbff;
}
.col-validasi-cell {
  background-color: #fffde7;
  border: 0.5px solid #f9a825 !important;
}
.text-center {
  text-align: center;
}
.text-right {
  text-align: right;
}
.empty-row {
  text-align: center;
  padding: 12px;
  color: #888;
  font-style: italic;
}

tfoot .total-row td {
  border-top: 1.5px solid #0d47a1;
  padding: 4px 5px;
  font-weight: bold;
  font-size: 10px;
  background-color: #e8eaf6;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.total-qty {
  color: #0d47a1;
  font-size: 12px;
}

/* TTD — di akhir konten, normal flow */
.ttd-section {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
  padding: 10px 16px 8px;
  border: 0.5px solid #ccc;
  border-radius: 4px;
  background: #fafafa;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ttd-box {
  width: 30%;
  text-align: center;
}
.ttd-label {
  font-size: 8.5px;
  font-weight: bold;
  color: #333;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.ttd-space {
  height: 32px;
}
.ttd-line {
  border-top: 1px solid #000;
  margin: 0 8px 4px;
}
.ttd-name {
  font-size: 8.5px;
  color: #555;
}

/* Print */
@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 10mm;
  }
  :global(body) {
    background: #fff !important;
    padding: 0 !important;
  }
  .print-container {
    width: 100% !important;
    min-width: unset !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    font-size: 9px;
  }
  .location-section {
    page-break-inside: avoid;
  }
  .print-table thead {
    display: table-header-group;
  }
  .print-table tr {
    page-break-inside: avoid;
  }
  .ttd-section {
    page-break-inside: avoid;
  }

  /* Paksa semua background warna tetap tercetak */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>

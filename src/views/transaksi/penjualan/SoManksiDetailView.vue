<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format } from "date-fns";

const route = useRoute();
const toast = useToast();

interface SoHeader {
  so_nomor: string;
  so_tanggal: string;
  so_dateline: string;
  perush_nama: string;
  so_cus_kode: string;
  custKaosanNama: string;
  sal_nama: string;
  jo_nama: string;
  so_jo_kode: string;
  so_divisi: number;
  so_nama: string;
  so_nama_ext: string;
  so_jumlah: number;
  so_ukuran: string;
  so_kain: string;
  so_finishing: string;
  so_gramasi: string;
  so_cab: string;
  so_tipe: string;
  so_statuskerja: string;
  so_standar_ukuran: string;
  so_varian_ukuran: string;
  so_nomor_po: string;
  so_tgl_po: string;
  so_datelinepo: string;
  so_sablon: string;
  so_bordir: string;
  so_sublim: string;
  so_warna_badan: string;
  so_warna_lengan: string;
  so_warna_lain: string;
  so_keterangan: string;
  so_aktif: string;
  so_close: number;
  so_cmo: string;
  kategoriUkuran: string | null;
  refPengajuanHarga: string;
}

interface KaosanItem {
  kode: string;
  nama: string;
  ukuran: string;
  qty: number;
}

interface SizeDetail {
  size: string;
  qty: number;
  ld: number;
  pb: number;
  plPendek: number;
  plPanjang: number;
  pBahu: number;
  lLengan: number;
  lManset: number;
  lPinggang: number;
  pCelana: number;
  lPanggul: number;
  lPaha: number;
  pesak: number;
  lLutut: number;
  lBawah: number;
}

const isLoading = ref(true);
const errorMessage = ref("");
const header = ref<SoHeader | null>(null);
const items = ref<KaosanItem[]>([]);
const sizes = ref<SizeDetail[]>([]);
const activeTab = ref(0);

const formatDate = (v: string | null) => {
  if (!v) return "-";
  try {
    return format(new Date(v), "dd/MM/yyyy");
  } catch {
    return "-";
  }
};

const isYes = (v: string) => v === "Y";

const showKolomAtasan = computed(
  () => header.value?.kategoriUkuran === "ATASAN" || header.value?.kategoriUkuran === "WEARPACK"
);
const showKolomBawahan = computed(
  () => header.value?.kategoriUkuran === "BAWAHAN" || header.value?.kategoriUkuran === "WEARPACK"
);

const totalSizeQty = computed(() => sizes.value.reduce((s, r) => s + (Number(r.qty) || 0), 0));
const totalKaosanQty = computed(() => items.value.reduce((s, r) => s + (Number(r.qty) || 0), 0));

const statusLabel = computed(() => {
  if (!header.value) return "-";
  if (header.value.so_close) return "Closed";
  if (header.value.so_cmo) return "Disetujui DC";
  return "Menunggu Validasi DC";
});
const statusColor = computed(() => {
  if (!header.value) return "grey";
  if (header.value.so_close) return "success";
  if (header.value.so_cmo) return "deep-purple";
  return "amber-darken-2";
});

const fetchDetail = async () => {
  const nomor = route.params.nomor as string;
  isLoading.value = true;
  try {
    const response = await api.get(`/so-manksi/${encodeURIComponent(nomor)}`);
    header.value = response.data.header;
    items.value = response.data.items;
    sizes.value = response.data.sizes;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    errorMessage.value = err.response?.data?.message || "Gagal memuat data SO Manksi.";
    toast.error(errorMessage.value);
  } finally {
    isLoading.value = false;
  }
};

const closeTab = () => window.close();

onMounted(fetchDetail);
</script>

<template>
  <div class="so-manksi-page">
    <div class="so-manksi-topbar">
      <div class="d-flex align-center">
        <v-icon icon="mdi-factory" class="mr-2"></v-icon>
        <span class="text-subtitle-1 font-weight-bold">
          Detail SO Manksi — {{ (route.params.nomor as string) || "" }}
        </span>
        <v-chip v-if="header" :color="statusColor" variant="tonal" size="small" class="ml-3">
          {{ statusLabel }}
        </v-chip>
        <v-chip color="grey" variant="tonal" size="x-small" class="ml-2">READ-ONLY</v-chip>
      </div>
      <v-btn size="small" variant="text" prepend-icon="mdi-close" @click="closeTab">Tutup</v-btn>
    </div>

    <div v-if="isLoading" class="so-manksi-loading">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <div v-else-if="errorMessage" class="so-manksi-loading">
      <v-icon size="48" color="error" class="mb-2">mdi-alert-circle-outline</v-icon>
      <div>{{ errorMessage }}</div>
    </div>

    <div v-else-if="header" class="so-manksi-body">
      <div class="pf-tab-nav">
        <button class="pf-tab-btn" :class="{ active: activeTab === 0 }" @click="activeTab = 0">
          SO
        </button>
        <button class="pf-tab-btn" :class="{ active: activeTab === 1 }" @click="activeTab = 1">
          Ket Ukuran
        </button>
        <button class="pf-tab-btn" :class="{ active: activeTab === 2 }" @click="activeTab = 2">
          Kaosan
        </button>
      </div>

      <div class="pf-tab-body">
        <!-- ============== TAB SO ============== -->
        <div v-show="activeTab === 0" class="so-layout">
          <div class="so-left">
            <div class="so-section">
              <div class="fr">
                <label class="lbl">Divisi</label>
                <span class="ro-val">{{ header.so_divisi }} - KAOSAN</span>
                <span
                  class="ml-auto status-lbl"
                  :class="header.so_aktif === 'N' ? 'pasif' : 'aktif'"
                >
                  Status: {{ header.so_aktif === "N" ? "PASIF" : "AKTIF" }}
                </span>
              </div>
              <div class="fr">
                <label class="lbl">Nomor SPK</label>
                <span class="ro-val">{{ header.so_nomor }}</span>
              </div>
              <div class="fr">
                <label class="lbl">Tanggal SPK</label>
                <span class="ro-val">{{ formatDate(header.so_tanggal) }}</span>
              </div>
              <div class="fr">
                <label class="lbl">Perusahaan</label>
                <span class="ro-val">{{ header.perush_nama }}</span>
              </div>
              <div class="fr">
                <label class="lbl">Customer</label>
                <span class="ro-val">{{ header.so_cus_kode }}</span>
              </div>
              <div class="fr">
                <label class="lbl">Cust Kaosan</label>
                <span class="ro-val">{{ header.custKaosanNama }}</span>
              </div>
              <div class="divider" />
              <div class="fr align-start">
                <div class="ref-col">
                  <div class="fr">
                    <label class="lbl">Jenis Order</label>
                    <span class="ro-val">{{ header.so_jo_kode }} - {{ header.jo_nama }}</span>
                  </div>
                  <div class="fr">
                    <label class="lbl">Kepentingan</label>
                    <span class="ro-val">{{ header.so_statuskerja }}</span>
                  </div>
                  <div class="fr">
                    <label class="lbl">Sales</label>
                    <span class="ro-val">{{ header.sal_nama }}</span>
                  </div>
                </div>
                <div class="fieldset-box ml-2" style="width: 240px; flex-shrink: 0">
                  <div class="fieldset-legend">PO</div>
                  <div class="fr mt-1">
                    <label class="lbl" style="width: 85px">Nomor PO</label>
                    <span class="ro-val">{{ header.so_nomor_po }}</span>
                  </div>
                  <div class="fr">
                    <label class="lbl" style="width: 85px">Tanggal PO</label>
                    <span class="ro-val">{{ formatDate(header.so_tgl_po) }}</span>
                  </div>
                  <div class="fr">
                    <label class="lbl" style="width: 85px">Dateline PO</label>
                    <span class="ro-val">{{ formatDate(header.so_datelinepo) }}</span>
                  </div>
                </div>
              </div>
              <div class="fr">
                <label class="lbl">Nama</label>
                <span class="ro-val">{{ header.so_nama }}</span>
              </div>
              <div class="fr">
                <label class="lbl">Nama Ext</label>
                <span class="ro-val">{{ header.so_nama_ext || "-" }}</span>
              </div>
              <div class="fr">
                <label class="lbl">Jumlah</label>
                <span class="ro-val">{{ header.so_jumlah }} pcs</span>
              </div>
              <div class="fr">
                <label class="lbl">Ket. Ukuran</label>
                <span class="ro-val">{{ header.so_ukuran || "-" }}</span>
                <span class="standar-badge ml-2"
                  >{{ header.so_standar_ukuran }} ({{ header.so_varian_ukuran }})</span
                >
              </div>
              <div class="fr">
                <label class="lbl">Gramasi</label>
                <span class="ro-val">{{ header.so_gramasi || "-" }}</span>
              </div>
              <div class="fr">
                <label class="lbl">Kain</label>
                <span class="ro-val">{{ header.so_kain }}</span>
              </div>
              <div class="fr">
                <label class="lbl">Finishing</label>
                <span class="ro-val">{{ header.so_finishing }}</span>
              </div>
              <div class="fr mt-1 shaded-row">
                <span class="chk-display" :class="{ on: isYes(header.so_sablon) }">Sablon</span>
                <span class="chk-display" :class="{ on: isYes(header.so_bordir) }">Bordir</span>
                <span class="chk-display" :class="{ on: isYes(header.so_sublim) }">Sublim</span>
              </div>
              <div class="fieldset-box mt-1">
                <div class="fieldset-legend">Warna</div>
                <div class="fr" style="gap: 5px">
                  <label class="lbl" style="width: 48px">Badan</label>
                  <span class="ro-val">{{ header.so_warna_badan || "-" }}</span>
                  <label class="lbl ml-2" style="width: 52px">Lengan</label>
                  <span class="ro-val">{{ header.so_warna_lengan || "-" }}</span>
                  <label class="lbl ml-2" style="width: 40px">Lain2</label>
                  <span class="ro-val">{{ header.so_warna_lain || "-" }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="so-right">
            <div class="fieldset-box">
              <div class="fieldset-legend">Info Tambahan</div>
              <div class="fr">
                <label class="lbl" style="width: 72px">Dateline SPK</label>
                <span class="ro-val">{{ formatDate(header.so_dateline) }}</span>
              </div>
              <div class="fr">
                <label class="lbl" style="width: 72px">Workshop</label>
                <span class="ro-val">{{ header.so_cab }}</span>
              </div>
              <div class="fr">
                <label class="lbl" style="width: 72px">Tipe SPK</label>
                <span class="ro-val">{{ header.so_tipe || "-" }}</span>
              </div>
              <div class="fr">
                <label class="lbl" style="width: 72px">CMO</label>
                <span class="ro-val">{{ header.so_cmo || "Belum disetujui" }}</span>
              </div>
              <div class="fr">
                <label class="lbl" style="width: 72px">Ref. PH</label>
                <span class="ro-val">{{ header.refPengajuanHarga || "-" }}</span>
              </div>
            </div>
            <div class="fieldset-box mt-2">
              <div class="fieldset-legend">Keterangan Produksi</div>
              <div class="keterangan-box">{{ header.so_keterangan || "-" }}</div>
            </div>
          </div>
        </div>

        <!-- ============== TAB KET UKURAN ============== -->
        <div v-show="activeTab === 1" class="uk-layout">
          <div class="uk-card" style="flex: 1">
            <div class="uk-card-title">Detail Ukuran</div>
            <div class="uk-table-wrap">
              <table class="uk-table">
                <thead>
                  <tr>
                    <th class="th-size">Size</th>
                    <th class="th-num">Qty</th>
                    <template v-if="showKolomAtasan">
                      <th class="th-num">LD</th>
                      <th class="th-num">PB</th>
                      <th class="th-num">PL Pendek</th>
                      <th class="th-num">PL Panjang</th>
                      <th class="th-num">P. Bahu</th>
                      <th class="th-num">L. Lengan</th>
                      <th class="th-num">L. Manset</th>
                    </template>
                    <template v-if="showKolomBawahan">
                      <th class="th-num">L. Pinggang</th>
                      <th class="th-num">P. Celana</th>
                      <th class="th-num">L. Panggul</th>
                      <th class="th-num">L. Paha</th>
                      <th class="th-num">Pesak</th>
                      <th class="th-num">L. Lutut</th>
                      <th class="th-num">L. Bawah</th>
                    </template>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, i) in sizes"
                    :key="i"
                    :class="{ 'row-active': Number(row.qty) > 0 }"
                  >
                    <td class="td-size">{{ row.size }}</td>
                    <td class="td-num">{{ row.qty }}</td>
                    <template v-if="showKolomAtasan">
                      <td class="td-num">{{ row.ld || "-" }}</td>
                      <td class="td-num">{{ row.pb || "-" }}</td>
                      <td class="td-num">{{ row.plPendek || "-" }}</td>
                      <td class="td-num">{{ row.plPanjang || "-" }}</td>
                      <td class="td-num">{{ row.pBahu || "-" }}</td>
                      <td class="td-num">{{ row.lLengan || "-" }}</td>
                      <td class="td-num">{{ row.lManset || "-" }}</td>
                    </template>
                    <template v-if="showKolomBawahan">
                      <td class="td-num">{{ row.lPinggang || "-" }}</td>
                      <td class="td-num">{{ row.pCelana || "-" }}</td>
                      <td class="td-num">{{ row.lPanggul || "-" }}</td>
                      <td class="td-num">{{ row.lPaha || "-" }}</td>
                      <td class="td-num">{{ row.pesak || "-" }}</td>
                      <td class="td-num">{{ row.lLutut || "-" }}</td>
                      <td class="td-num">{{ row.lBawah || "-" }}</td>
                    </template>
                  </tr>
                  <tr v-if="sizes.length === 0">
                    <td colspan="9" class="empty-row">Tidak ada detail ukuran.</td>
                  </tr>
                </tbody>
                <tfoot v-if="sizes.length > 0">
                  <tr>
                    <td class="td-total-lbl">Total</td>
                    <td class="td-total-val">{{ totalSizeQty }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <!-- ============== TAB KAOSAN ============== -->
        <div v-show="activeTab === 2" class="k-layout">
          <div class="k-section">
            <div class="k-header">
              <span class="k-title">Detail Barang Kaosan</span>
            </div>
            <div class="k-tbl-wrap">
              <table class="k-tbl">
                <thead>
                  <tr>
                    <th style="width: 32px" class="tc">No</th>
                    <th style="width: 150px">Kode</th>
                    <th>Nama Barang</th>
                    <th style="width: 100px">Ukuran</th>
                    <th style="width: 80px" class="tr">Qty Order</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in items" :key="idx">
                    <td class="tc bg-lbl">{{ idx + 1 }}</td>
                    <td class="td-plain">{{ row.kode }}</td>
                    <td class="td-plain">{{ row.nama }}</td>
                    <td class="td-plain">{{ row.ukuran }}</td>
                    <td class="td-plain tr fw text-blue">{{ row.qty }}</td>
                  </tr>
                  <tr v-if="items.length === 0">
                    <td colspan="5" class="empty-row">Data Barang Kaosan kosong.</td>
                  </tr>
                </tbody>
                <tfoot v-if="items.length > 0">
                  <tr>
                    <td colspan="4" class="tr fw foot-cell">TOTAL :</td>
                    <td class="tr fw foot-total">{{ totalKaosanQty }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.so-manksi-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f4f5f7;
  font-family: "Segoe UI", system-ui, sans-serif;
}

.so-manksi-topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.so-manksi-loading {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.so-manksi-body {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Tabs (sama pola dgn SalesOrderFormView asli) ── */
.pf-tab-nav {
  display: flex;
  background: #e0e0e0;
  border-bottom: 2px solid #bdbdbd;
  padding: 8px 20px 0;
  flex-shrink: 0;
}
.pf-tab-btn {
  padding: 6px 18px;
  font-size: 12px;
  font-weight: 600;
  color: #555;
  background: #eeeeee;
  border: 1px solid #ccc;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  margin-right: 4px;
}
.pf-tab-btn.active {
  background: white;
  color: #1565c0;
  border-color: #bdbdbd;
  border-bottom: 2px solid white;
  margin-bottom: -2px;
}
.pf-tab-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
}

/* ── Tab SO (mirror SalesOrderTabSo) ── */
.so-layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  font-size: 11px;
}
.so-left {
  flex: 1;
  min-width: 0;
}
.so-right {
  width: 320px;
  flex-shrink: 0;
}
.so-section {
  background: white;
  border: 1px solid #bdbdbd;
  padding: 10px 12px;
}
.fieldset-box {
  border: 1px solid #9e9e9e;
  padding: 8px 10px 7px;
  padding-top: 16px;
  position: relative;
  background: #fafafa;
  margin-top: 6px;
}
.fieldset-legend {
  position: absolute;
  top: -8px;
  left: 10px;
  background: #fafafa;
  padding: 0 4px;
  font-weight: 700;
  font-size: 11px;
  color: #424242;
}
.fr {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
  min-height: 22px;
}
.lbl {
  width: 100px;
  flex-shrink: 0;
  font-weight: 600;
  color: #333;
  font-size: 11px;
}
.ro-val {
  font-size: 12px;
  color: #212121;
  font-weight: 500;
}
.divider {
  height: 1px;
  background: #e0e0e0;
  margin: 6px 0;
}
.shaded-row {
  background: #f5f5f5;
  padding: 5px 8px;
  border: 1px solid #eee;
  border-radius: 2px;
  gap: 14px;
}
.chk-display {
  font-size: 11px;
  color: #9e9e9e;
  font-weight: 500;
}
.chk-display.on {
  color: #1565c0;
  font-weight: 700;
}
.chk-display.on::before {
  content: "✓ ";
}
.chk-display::before {
  content: "";
}
.standar-badge {
  font-size: 10px;
  background: #e3f2fd;
  color: #1565c0;
  padding: 2px 8px;
  border-radius: 3px;
  font-weight: 600;
}
.status-lbl {
  font-weight: 700;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
}
.status-lbl.aktif {
  color: #2e7d32;
  background: #e8f5e9;
}
.status-lbl.pasif {
  color: #c62828;
  background: #ffebee;
}
.keterangan-box {
  font-size: 12px;
  color: #424242;
  white-space: pre-wrap;
  min-height: 60px;
  padding: 6px 4px;
}

/* ── Tab Ket Ukuran (mirror SalesOrderTabUkuran) ── */
.uk-layout {
  display: flex;
  font-size: 11px;
}
.uk-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 10px 12px;
}
.uk-card-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #1565c0;
  margin-bottom: 8px;
}
.uk-table-wrap {
  border: 1px solid #bdbdbd;
  border-radius: 3px;
  overflow: auto;
}
.uk-table {
  border-collapse: collapse;
  font-size: 11px;
  width: 100%;
}
.uk-table thead th {
  background: #1565c0;
  color: white;
  font-weight: 600;
  padding: 6px 8px;
  white-space: nowrap;
  text-align: right;
}
.th-size {
  text-align: left !important;
  min-width: 80px;
}

.td-size {
  text-align: left !important;
  color: #424242;
}
.uk-table tbody td {
  border-bottom: 1px solid #eeeeee;
  padding: 6px 8px;
  text-align: right;
}
.td-size {
  text-align: left;
  color: #424242;
}
.uk-table tbody tr.row-active td {
  background: #e3f2fd;
  font-weight: 600;
}
.uk-table tfoot td {
  background: #f5f5f5;
  font-weight: 700;
  padding: 6px 8px;
  border-top: 2px solid #e0e0e0;
}
.td-total-lbl {
  text-align: left;
}
.td-total-val {
  text-align: right;
  color: #1565c0;
}

/* ── Tab Kaosan (mirror SalesOrderTabKaosan) ── */
.k-layout {
  font-size: 11px;
}
.k-section {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 10px 12px;
}
.k-header {
  margin-bottom: 6px;
}
.k-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #1565c0;
}
.k-tbl-wrap {
  border: 1px solid #e0e0e0;
  border-radius: 3px;
  overflow: auto;
}
.k-tbl {
  width: 100%;
  border-collapse: collapse;
}
.k-tbl thead th {
  background: #1565c0;
  color: white;
  font-weight: 700;
  padding: 6px 8px;
  font-size: 10px;
  text-transform: uppercase;
}
.k-tbl tbody td {
  border-bottom: 1px solid #f0f0f0;
  padding: 6px 8px;
}
.k-tbl tbody tr:nth-of-type(even) td {
  background: #fafafa;
}
.td-plain {
  color: #212121;
}
.bg-lbl {
  background: #f5f5f5 !important;
  color: #555;
}
.tc {
  text-align: center;
}
.tr {
  text-align: right;
}
.fw {
  font-weight: 600;
}
.text-blue {
  color: #1565c0;
}
.empty-row {
  text-align: center;
  color: #9e9e9e;
  font-style: italic;
  padding: 14px 8px;
}
.foot-cell {
  background: #f5f5f5;
}
.foot-total {
  background: #fff59d;
  color: #1565c0;
}

.ml-2 {
  margin-left: 8px;
}
.ml-auto {
  margin-left: auto;
}
.mt-1 {
  margin-top: 5px;
}
.mt-2 {
  margin-top: 10px;
}
.d-flex {
  display: flex;
}
.align-center {
  align-items: center;
}
.align-start {
  align-items: flex-start !important;
}

.ref-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
</style>

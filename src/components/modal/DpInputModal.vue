<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import RekeningSearchModal from "../lookup/RekeningSearchModal.vue";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import Logo from "@/assets/logo.png";
import { formatRupiah } from "@/utils/formatRupiah";
import axios from "axios";

interface Rekening {
  kode: string;
  nama: string;
  rekening: string;
}

interface PrintHeader {
  sh_jenis: number;
  sh_nomor: string;
  sh_tanggal: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  cus_nama: string;
  cus_alamat: string;
  cus_kota: string;
  cus_telp: string;
  sh_nominal: number;
  sh_ket: string;
  sh_norek?: string;
  rek_nama?: string;
  sh_tgltransfer?: string;
  terbilang: string;
}

interface NewDpItem {
  nomor: string;
  jenis: string;
  nominal: number;
  posting: string;
}

const toast = useToast();
const authStore = useAuthStore();
const appLogo = Logo;

const kekuranganDp = computed(() => {
  const kurang = props.minimalDp - props.existingDp;
  return kurang > 0 ? kurang : 0;
});

const documentTitle = computed(() => {
  if (!printHeaderData.value) return "";
  if (printHeaderData.value.sh_jenis === 1 && printHeaderData.value.sh_ket.includes("QRIS")) {
    return "QRIS RECEIPT";
  }
  switch (printHeaderData.value.sh_jenis) {
    case 0:
      return "CASH RECEIPT";
    case 1:
      return "TRANSFER RECEIPT";
    case 2:
      return "GIRO RECEIPT";
    default:
      return "TANDA TERIMA PEMBAYARAN";
  }
});

// Apakah kolom kanan perlu ditampilkan
const hasRightPanel = computed(
  () =>
    dpData.value.jenis === "TRANSFER" ||
    dpData.value.jenis === "QRIS" ||
    dpData.value.jenis === "GIRO"
);

const props = defineProps({
  customerKode: { type: String, required: true },
  minimalDp: { type: Number, default: 0 },
  existingDp: { type: Number, default: 0 },
  existingDpNomor: { type: String, default: "" },
  nomorSo: { type: String, required: true },
  source: { type: String, default: "SO" },
});
const emit = defineEmits(["close", "dp-saved"]);

const dpData = ref({
  tanggal: format(new Date(), "yyyy-MM-dd"),
  jenis: "TUNAI",
  nominal: 0 as number | null,
  keterangan: "DP",
  bankData: {
    akun: "",
    namaBank: "",
    norek: "",
    tglTransfer: format(new Date(), "yyyy-MM-dd"),
  },
  giroData: {
    noGiro: "",
    tglGiro: format(new Date(), "yyyy-MM-dd"),
    tglJatuhTempo: format(new Date(), "yyyy-MM-dd"),
  },
});

const isSaving = ref(false);
const isRekeningSearchVisible = ref(false);
const isNominalFocused = ref(false);
const isPrintPreviewVisible = ref(false);
const isPrinting = ref(false);
const printHeaderData = ref<PrintHeader | null>(null);
const newDpFromSave = ref<NewDpItem | null>(null);
const isPrintingNow = ref(false);

const save = async () => {
  if (!props.existingDpNomor) {
    const today = format(new Date(), "yyyy-MM-dd");
    if (dpData.value.tanggal !== today) {
      return toast.error(`Tanggal DP harus hari ini (${today}).`);
    }
  }

  const apiBasePath = props.source === "OFFER" ? "/offer-form" : "/so-form";

  if ((dpData.value.nominal || 0) === 0 && props.existingDpNomor) {
    try {
      const res = await api.post("/so-form/delete-dp", { nomor: props.existingDpNomor });
      toast.success(res.data.message || "DP berhasil dihapus.");
      emit("dp-saved", null);
      emit("close");
      return;
    } catch (err: unknown) {
      let errorMessage = "Gagal menghapus DP.";
      if (axios.isAxiosError(err)) errorMessage = err.response?.data?.message || errorMessage;
      else if (err instanceof Error) errorMessage = err.message;
      toast.error(errorMessage);
      return;
    }
  }

  const nominal = dpData.value.nominal || 0;
  if (nominal < kekuranganDp.value) {
    toast.warning(
      `DP kurang dari minimal (${formatRupiah(kekuranganDp.value)}). SO masih akan berstatus PASIF.`
    );
  }
  if ((dpData.value.nominal || 0) <= 0) return toast.error("Nominal harus diisi.");
  if (
    (dpData.value.jenis === "TRANSFER" || dpData.value.jenis === "QRIS") &&
    !dpData.value.bankData.akun
  ) {
    return toast.error("Akun Bank/QRIS harus dipilih.");
  }
  if (dpData.value.jenis === "GIRO" && !dpData.value.giroData.noGiro) {
    return toast.error("No. Giro harus diisi.");
  }

  isSaving.value = true;
  try {
    const payload = { ...dpData.value, customerKode: props.customerKode, nomorSo: props.nomorSo };
    const saveResponse = await api.post(`${apiBasePath}/save-dp`, payload);
    toast.success(saveResponse.data.message);
    const newDp = saveResponse.data.newDp;
    newDpFromSave.value = newDp;

    isSaving.value = false;
    isPrinting.value = true;

    const printResponse = await api.get(`${apiBasePath}/print-data/dp/${newDp.nomor}`);
    printHeaderData.value = printResponse.data;

    isPrinting.value = false;
    isPrintPreviewVisible.value = true;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "response" in error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Gagal menyimpan DP.");
    } else {
      toast.error("Gagal menyimpan DP.");
    }
    isSaving.value = false;
    isPrinting.value = false;
  }
};

const onNominalFocus = () => {
  isNominalFocused.value = true;
  if (dpData.value.nominal === 0) dpData.value.nominal = null;
};

const onNominalBlur = () => {
  isNominalFocused.value = false;
  if (!dpData.value.nominal) dpData.value.nominal = 0;
};

const handlePrint = () => {
  isPrintingNow.value = true;
  nextTick(() => {
    window.print();
    setTimeout(() => {
      isPrintingNow.value = false;
    }, 500);
  });
};

const closePrintPreview = () => {
  isPrintPreviewVisible.value = false;
  emit("dp-saved", newDpFromSave.value);
  emit("close");
  printHeaderData.value = null;
  newDpFromSave.value = null;
};

const onRekeningSelected = (rekening: Rekening) => {
  dpData.value.bankData.akun = rekening.kode;
  dpData.value.bankData.namaBank = rekening.nama;
  dpData.value.bankData.norek = rekening.rekening;
  isRekeningSearchVisible.value = false;
};
</script>

<template>
  <!-- Dialog Input DP -->
  <v-dialog
    :model-value="!isPrintPreviewVisible"
    persistent
    :max-width="hasRightPanel ? '780px' : '440px'"
  >
    <v-card class="dp-card">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          <v-icon start size="18">mdi-cash-plus</v-icon>
          Input DP (Uang Muka)
        </v-toolbar-title>
      </v-toolbar>

      <v-card-text class="pa-4">
        <v-row dense>
          <!-- ════════════ KOLOM KIRI: Data Dasar ════════════ -->
          <v-col :cols="hasRightPanel ? 5 : 12">
            <div class="section-label mb-2">Data Pembayaran</div>

            <v-text-field
              label="Tanggal"
              v-model="dpData.tanggal"
              type="date"
              variant="outlined"
              density="compact"
              hide-details
              class="mb-2"
              :min="format(new Date(), 'yyyy-MM-dd')"
              :max="format(new Date(), 'yyyy-MM-dd')"
            />

            <v-select
              label="Jenis Pembayaran"
              v-model="dpData.jenis"
              :items="['TUNAI', 'TRANSFER', 'QRIS', 'GIRO']"
              variant="outlined"
              density="compact"
              hide-details
              class="mb-2"
            />

            <v-text-field
              label="Nominal"
              :model-value="isNominalFocused ? dpData.nominal : formatRupiah(dpData.nominal || 0)"
              @update:model-value="
                dpData.nominal = Number(String($event).replace(/[^0-9]/g, '')) || 0
              "
              @focus="onNominalFocus"
              @blur="onNominalBlur"
              type="text"
              variant="outlined"
              density="compact"
              hide-details
              class="mb-2 nominal-field"
            />

            <v-text-field
              label="Keterangan"
              v-model="dpData.keterangan"
              variant="outlined"
              density="compact"
              hide-details
              class="mb-3"
            />

            <!-- Ringkasan DP -->
            <div class="dp-summary">
              <div class="dp-summary__row">
                <span>Minimal DP:</span>
                <strong>{{ formatRupiah(minimalDp) }}</strong>
              </div>
              <div class="dp-summary__row">
                <span>Sudah Dibayar:</span>
                <strong>{{ formatRupiah(existingDp) }}</strong>
              </div>
              <div class="dp-summary__divider" />
              <div class="dp-summary__row dp-summary__row--total">
                <span>Kekurangan:</span>
                <strong :class="kekuranganDp > 0 ? 'text-error' : 'text-success'">
                  {{ formatRupiah(kekuranganDp) }}
                </strong>
              </div>
            </div>
          </v-col>

          <!-- ════════════ DIVIDER ════════════ -->
          <v-col v-if="hasRightPanel" cols="1" class="d-flex justify-center">
            <v-divider vertical class="mx-1" />
          </v-col>

          <!-- ════════════ KOLOM KANAN: Detail Metode ════════════ -->
          <v-col v-if="hasRightPanel" cols="6">
            <!-- TRANSFER / QRIS -->
            <template v-if="dpData.jenis === 'TRANSFER' || dpData.jenis === 'QRIS'">
              <div class="section-label mb-2">
                {{ dpData.jenis === "QRIS" ? "Detail QRIS" : "Detail Transfer" }}
              </div>

              <v-text-field
                :label="dpData.jenis === 'QRIS' ? 'Akun Penampung QRIS' : 'Akun Bank'"
                v-model="dpData.bankData.akun"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
                readonly
                append-inner-icon="mdi-magnify"
                @click="isRekeningSearchVisible = true"
              />

              <v-text-field
                label="Nama Bank"
                v-model="dpData.bankData.namaBank"
                density="compact"
                variant="filled"
                readonly
                hide-details
                class="mb-2"
              />

              <v-text-field
                label="No. Rekening"
                v-model="dpData.bankData.norek"
                density="compact"
                variant="filled"
                readonly
                hide-details
                class="mb-2"
              />

              <v-text-field
                label="Tgl. Transfer"
                v-model="dpData.bankData.tglTransfer"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
              />
            </template>

            <!-- GIRO -->
            <template v-if="dpData.jenis === 'GIRO'">
              <div class="section-label mb-2">Detail Giro</div>

              <v-text-field
                label="No. Giro"
                v-model="dpData.giroData.noGiro"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              />

              <v-text-field
                label="Tgl. Giro"
                v-model="dpData.giroData.tglGiro"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              />

              <v-text-field
                label="Tgl. Jatuh Tempo"
                v-model="dpData.giroData.tglJatuhTempo"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
              />
            </template>

            <!-- TUNAI: tidak ada kolom kanan, tapi hasRightPanel false jadi v-col tidak muncul -->
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />
      <v-card-actions class="dp-footer">
        <v-spacer />
        <v-btn size="small" variant="text" @click="$emit('close')">Batal</v-btn>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          @click="save"
          :loading="isSaving || isPrinting"
          :disabled="isPrinting || isSaving"
        >
          <v-icon start size="16">mdi-content-save</v-icon>
          {{ isPrinting ? "Memuat Pratinjau..." : "Simpan & Cetak" }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Dialog Print Preview (tidak berubah) -->
  <v-dialog v-model="isPrintPreviewVisible" max-width="820px" persistent scrollable>
    <v-card class="d-flex flex-column print-dialog" style="max-height: 90vh">
      <v-toolbar color="grey-darken-3" density="compact" class="print-toolbar">
        <v-toolbar-title
          class="text-body-2 font-weight-bold"
          style="min-width: 0; overflow: visible; white-space: nowrap"
        >
          Pratinjau Cetak: {{ printHeaderData?.sh_nomor }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn prepend-icon="mdi-printer" @click="handlePrint">Cetak</v-btn>
        <v-btn icon="mdi-close" @click="closePrintPreview" />
      </v-toolbar>

      <v-card-text class="pa-0 grey-lighten-4 print-preview-area">
        <div class="print-container">
          <template v-if="printHeaderData">
            <div v-for="copy in 2" :key="copy" class="page" :class="{ 'copy-section': copy === 2 }">
              <div class="company-header">
                <img :src="appLogo" alt="Logo" class="company-logo" />
                <div class="company-info">
                  <div class="company-name">{{ printHeaderData.perush_nama }}</div>
                  <div>{{ printHeaderData.perush_alamat }}</div>
                  <div>Wa: {{ printHeaderData.perush_telp }}</div>
                </div>
              </div>

              <div class="document-title">{{ documentTitle }}</div>

              <div class="details-container">
                <div class="details-grid">
                  <div class="label">Nomor Dokumen</div>
                  <div class="value">: {{ printHeaderData.sh_nomor }}</div>
                  <div class="label">Tanggal Dokumen</div>
                  <div class="value">
                    : {{ format(parseISO(printHeaderData.sh_tanggal), "dd-MM-yyyy") }}
                  </div>
                  <div class="label">Nama Customer</div>
                  <div class="value">: {{ printHeaderData.cus_nama }}</div>
                  <div class="label">Alamat</div>
                  <div class="value address-value">
                    : {{ printHeaderData.cus_alamat }}, {{ printHeaderData.cus_kota }}
                  </div>
                  <div class="label">No. Kontak</div>
                  <div class="value">: {{ printHeaderData.cus_telp }}</div>
                  <div class="label">Nominal Diterima</div>
                  <div class="value">: Rp {{ formatRupiah(printHeaderData.sh_nominal) }}</div>
                  <div class="label">Terbilang</div>
                  <div class="value terbilang-value">
                    : <em>{{ printHeaderData.terbilang }}</em>
                  </div>
                </div>
              </div>

              <div class="summary-no-details">
                <div class="keterangan-header">
                  <strong>Keterangan:</strong> {{ printHeaderData.sh_ket }}
                </div>
                <div class="total-header">
                  <strong>Total Bayar:</strong>
                  <span>Rp {{ formatRupiah(printHeaderData.sh_nominal) }}</span>
                </div>
              </div>

              <div class="signatures">
                <div class="signature-box">
                  Yang Menyerahkan,<br /><br /><br />(____________________)
                </div>
                <div class="signature-box">Penerima,<br /><br /><br />(____________________)</div>
              </div>

              <div class="copy-label">
                {{ copy === 1 ? "LEMBAR CUSTOMER" : "LEMBAR ARSIP KASIR" }}
              </div>
            </div>
          </template>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>

  <RekeningSearchModal
    v-if="isRekeningSearchVisible"
    :cabang="authStore.user?.cabang || ''"
    @close="isRekeningSearchVisible = false"
    @selected="onRekeningSelected"
  />
</template>

<style scoped>
/* ── Dialog card ── */
.dp-card :deep(.v-label) {
  font-size: 11px !important;
}
.dp-card :deep(input),
.dp-card :deep(.v-select__selection-text) {
  font-size: 12px !important;
}

/* ── Section label ── */
.section-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #666;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 4px;
}

/* ── Nominal field rata kanan ── */
.nominal-field :deep(input) {
  text-align: right;
  font-weight: 700 !important;
  font-size: 13px !important;
}

/* ── Ringkasan DP ── */
.dp-summary {
  background: #f5f7fa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.8rem;
}
.dp-summary__row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}
.dp-summary__row--total {
  font-size: 0.85rem;
  margin-top: 2px;
}
.dp-summary__divider {
  border-top: 1px solid #ccc;
  margin: 4px 0;
}

/* ── Footer ── */
.dp-footer {
  background-color: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
}

/* ── Filled field (readonly info) ── */
.dp-card :deep(.v-field--variant-filled),
.dp-card :deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

/* ── Print preview area ── */
.print-dialog .print-preview-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #525659;
  padding: 24px 20px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
}

.print-container {
  width: 210mm;
  flex-shrink: 0;
  background: white;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}

.summary-no-details {
  border: 1px solid #000;
  margin-top: 10px;
}
.keterangan-header {
  padding: 8px;
  border-bottom: 1px solid #333;
}
.total-header {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  font-size: 1.1em;
  font-weight: bold;
  background-color: #f2f2f2;
}

/* ── Print page ── */
.page {
  width: 210mm;
  height: 140mm;
  padding: 8mm 12mm;
  background: white;
  box-sizing: border-box;
  position: relative;
  font-family: Arial, sans-serif;
  font-size: 9pt;
  border-bottom: 1px dashed #ccc;
}
.page:last-child {
  border-bottom: none;
}
.copy-label {
  position: absolute;
  bottom: 5mm;
  right: 12mm;
  font-size: 7pt;
  color: #777;
  font-style: italic;
}
.company-header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 10px;
}
.company-logo {
  height: 30px;
  object-fit: contain;
}
.company-name {
  font-weight: bold;
  font-size: 12pt;
}
.company-info {
  line-height: 1.4;
}
.document-title {
  text-align: center;
  font-size: 13pt;
  font-weight: bold;
  margin: 5px 0;
  border-top: 1px solid #000;
  border-bottom: 1px solid #000;
  padding: 3px 0;
}
.details-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.details-grid {
  display: grid;
  grid-template-columns: 160px auto;
  row-gap: 4px;
  line-height: 1.5;
  flex-grow: 1;
}
.label {
  font-weight: bold;
}
.address-value,
.terbilang-value {
  font-style: italic;
}
.signatures {
  display: flex;
  justify-content: space-around;
  margin-top: 10px;
}
.signature-box {
  width: 40%;
  text-align: center;
  height: 50px;
}
</style>

<style>
@media print {
  /* 1. Sembunyikan semua elemen UI */
  body > * {
    display: none !important;
  }

  /* 2. Tampilkan hanya overlay Vuetify yang berisi dialog */
  .v-overlay-container {
    display: block !important;
  }

  /* 3. Sembunyikan semua isi overlay kecuali print-container */
  .v-overlay-container * {
    visibility: hidden !important;
  }

  .print-container,
  .print-container * {
    visibility: visible !important;
  }

  /* 4. Reset semua wrapper dialog agar tidak clip */
  .v-overlay__content,
  .v-dialog,
  .v-card,
  .print-preview-area {
    overflow: visible !important;
    max-height: none !important;
    height: auto !important;
    position: static !important;
    transform: none !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  /* 5. Print container mengisi halaman */
  .print-container {
    position: static !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }

  /* 6. Setiap .page = setengah halaman A4 */
  .page {
    width: 100% !important;
    height: 148mm !important;
    padding: 8mm 12mm !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
    border-bottom: 1px dashed #999 !important;
    page-break-inside: avoid !important;
    page-break-after: always !important;
    display: block !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
  }

  .page:last-child {
    border-bottom: none !important;
    page-break-after: avoid !important;
  }

  @page {
    size: A4 portrait;
    margin: 5mm;
  }
}
</style>

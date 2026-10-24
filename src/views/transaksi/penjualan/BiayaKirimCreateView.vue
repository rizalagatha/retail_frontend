<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import { formatRupiah } from "@/utils/formatRupiah";
import InvoiceSearchModal from "@/components/lookup/InvoiceSearchModal.vue";
import type { AxiosError } from "axios";

interface BiayaKirimLookupInvoice {
  Nomor: string;
  Tanggal: string;
  Nominal: number;
  KdCus: string;
  Customer: string;
  Alamat: string;
  Sisa?: number;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "49";
const BROWSE_PATH = "/transaksi/penjualan/biaya-kirim";

// --- State ---
const isNew = ref(!route.params.nomor);
const isLoading = ref(false);
const dialogs = reactive({
  invoiceSearch: false,
  confirmSave: false, // Dialog "Yakin ingin simpan?"
  printOption: false, // Dialog "Ingin Cetak?"
});
const savedNomor = ref("");

const form = reactive({
  nomor: "AUTO",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  inv_nomor: "",
  inv_tanggal: "",
  nominal_inv: 0,
  cust_kode: "",
  cust_nama: "",
  cust_alamat: "",
  cust_kota: "",
  cust_telp: "",
  biaya: 0,
  keterangan: "",
});

// --- Methods ---

const openInvoiceSearch = () => {
  // Invoice hanya bisa dipilih saat membuat baru
  if (isNew.value) dialogs.invoiceSearch = true;
};

const loadInvoiceDetail = async (inv: BiayaKirimLookupInvoice) => {
  dialogs.invoiceSearch = false;
  isLoading.value = true;

  try {
    const res = await api.get(`/biaya-kirim-form/invoice-details/${inv.Nomor}`);
    const d = res.data;

    // Nomor invoice baru diisi setelah detailnya berhasil dimuat,
    // supaya form tidak pernah berisi invoice tanpa data customer.
    form.inv_nomor = inv.Nomor;
    form.inv_tanggal = d.inv_tanggal ? format(parseISO(d.inv_tanggal), "dd/MM/yyyy") : "";
    form.nominal_inv = d.nominal || 0;
    form.cust_kode = d.cus_kode;
    form.cust_nama = d.cus_nama;
    form.cust_alamat = d.cus_alamat;
    form.cust_kota = d.cus_kota;
    form.cust_telp = d.cus_telp;
  } catch (e) {
    const err = e as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil detail invoice.");
  } finally {
    isLoading.value = false;
  }
};

// Pemicu Simpan: Buka Dialog Konfirmasi dulu
const triggerSave = () => {
  if (!form.inv_nomor) return toast.warning("Invoice belum diisi");
  if (Number(form.biaya) <= 0) return toast.warning("Biaya Kirim belum diisi");
  dialogs.confirmSave = true;
};

const handleSave = async () => {
  dialogs.confirmSave = false;
  isLoading.value = true;

  try {
    const res = await api.post("/biaya-kirim-form/save", {
      isNew: isNew.value,
      header: form,
    });

    savedNomor.value = res.data.nomor;
    toast.success(`Tersimpan: ${res.data.nomor}`);

    // Setelah sukses, tawarkan cetak
    dialogs.printOption = true;
  } catch (err: unknown) {
    // Casting error ke AxiosError agar aman
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal simpan");
  } finally {
    isLoading.value = false;
  }
};

const handlePrint = () => {
  dialogs.printOption = false;
  const url = router.resolve({
    name: "Cetak Biaya Kirim",
    params: { nomor: savedNomor.value },
  }).href;
  window.open(url, "_blank");
  router.push(BROWSE_PATH);
};

const closeAll = () => {
  dialogs.printOption = false;
  router.push(BROWSE_PATH);
};

onMounted(async () => {
  if (!authStore.can(MENU_ID, isNew.value ? "insert" : "edit")) {
    toast.error("Anda tidak memiliki izin untuk membuka halaman ini.");
    router.replace(BROWSE_PATH);
    return;
  }

  if (isNew.value) return;

  const nomorDariUrl = route.params.nomor;

  // Mode "Ubah" tanpa nomor yang valid: jangan biarkan form kosong yang bisa disimpan
  if (!nomorDariUrl || nomorDariUrl === "undefined") {
    toast.error("Nomor biaya kirim tidak valid.");
    router.replace(BROWSE_PATH);
    return;
  }

  isLoading.value = true;
  try {
    const res = await api.get(`/biaya-kirim-form/${nomorDariUrl}`);
    const d = res.data;

    if (!d) {
      toast.error("Data tidak ditemukan di database.");
      router.replace(BROWSE_PATH);
      return;
    }

    // Mapping manual untuk memastikan data masuk ke property reactive yang benar
    form.nomor = d.bk_nomor;
    form.tanggal = d.bk_tanggal ? format(parseISO(d.bk_tanggal), "yyyy-MM-dd") : "";
    form.inv_nomor = d.bk_inv_nomor;
    form.inv_tanggal = d.inv_tanggal ? format(parseISO(d.inv_tanggal), "dd/MM/yyyy") : "";
    form.nominal_inv = d.nominal_inv || 0;
    form.cust_kode = d.cus_kode;
    form.cust_nama = d.cus_nama;
    form.cust_alamat = d.cus_alamat;
    form.cust_kota = d.cus_kota;
    form.cust_telp = d.cus_telp;
    form.biaya = d.bk_nominal;
    form.keterangan = d.bk_ket;
  } catch (e) {
    const err = e as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data biaya kirim.");
    router.replace(BROWSE_PATH);
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="isNew ? 'Input biaya kirim' : 'Ubah biaya kirim'" icon="mdi-truck-delivery">
    <template #header-actions>
      <v-btn
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-content-save"
        :loading="isLoading"
        @click="triggerSave"
        >Simpan</v-btn
      >
      <v-btn
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-close"
        @click="router.back()"
        >Batal</v-btn
      >
    </template>

    <div class="form-page">
      <div class="form-grid">
        <!-- ══════════ DOKUMEN DAN INVOICE ══════════ -->
        <section class="panel">
          <h3 class="panel-title">Dokumen dan invoice</h3>

          <div class="two-col mb-3">
            <div class="s-readonly">
              <span class="s-label">No. BK</span>
              <span class="s-value">{{
                form.nomor === "AUTO" ? "Otomatis saat disimpan" : form.nomor
              }}</span>
            </div>
            <v-text-field
              v-model="form.tanggal"
              label="Tanggal BK"
              type="date"
              density="compact"
              variant="outlined"
              hide-details
              class="form-field"
            />
          </div>

          <v-text-field
            v-model="form.inv_nomor"
            label="No. invoice (F1)"
            :prepend-inner-icon="isNew ? 'mdi-magnify' : undefined"
            readonly
            density="compact"
            variant="outlined"
            hide-details
            class="form-field mb-3"
            :class="{ 'is-locked': !isNew }"
            placeholder="Klik atau tekan F1 untuk mencari invoice"
            @click="openInvoiceSearch"
            @keydown.f1.prevent="openInvoiceSearch"
          />

          <div class="two-col mb-3">
            <div class="s-readonly" :class="{ 'is-empty': !form.inv_tanggal }">
              <span class="s-label">Tanggal invoice</span>
              <span class="s-value">{{ form.inv_tanggal || "-" }}</span>
            </div>
            <div class="s-readonly" :class="{ 'is-empty': !form.inv_nomor }">
              <span class="s-label">Nominal invoice</span>
              <span class="s-value amount">{{
                form.inv_nomor ? formatRupiah(form.nominal_inv) : "-"
              }}</span>
            </div>
          </div>

          <div class="customer-card" :class="{ 'is-empty': !form.cust_nama }">
            <template v-if="form.cust_nama">
              <div class="customer-name">{{ form.cust_kode }} - {{ form.cust_nama }}</div>
              <div class="customer-line">{{ form.cust_alamat || "-" }}</div>
              <div class="customer-line">
                {{ form.cust_kota || "-" }} / {{ form.cust_telp || "-" }}
              </div>
            </template>
            <span v-else class="customer-empty">Pilih invoice untuk mengisi data customer.</span>
          </div>
        </section>

        <!-- ══════════ BIAYA KIRIM ══════════ -->
        <section class="panel">
          <h3 class="panel-title">Biaya kirim</h3>

          <v-text-field
            v-model.number="form.biaya"
            label="Biaya kirim *"
            type="number"
            min="0"
            prefix="Rp"
            density="compact"
            variant="outlined"
            hide-details
            class="form-field biaya-field mb-3"
          />

          <v-textarea
            v-model="form.keterangan"
            label="Keterangan"
            rows="4"
            auto-grow
            density="compact"
            variant="outlined"
            hide-details
            class="form-field"
          />
        </section>
      </div>
    </div>

    <!-- Konfirmasi simpan -->
    <v-dialog v-model="dialogs.confirmSave" max-width="380">
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">
          <v-icon start size="small">mdi-help-circle</v-icon>
          Konfirmasi simpan
        </v-card-title>
        <v-card-text class="pa-4 pt-5">Yakin ingin menyimpan data Biaya Kirim ini?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogs.confirmSave = false">Batal</v-btn>
          <v-btn variant="flat" class="btn-primary-red" @click="handleSave">Ya, simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Tawaran cetak -->
    <v-dialog v-model="dialogs.printOption" max-width="400" persistent>
      <v-card class="dialog-card text-center pa-4">
        <v-icon color="success" size="56" class="mb-2">mdi-check-circle</v-icon>
        <v-card-title class="justify-center">Data tersimpan</v-card-title>
        <v-card-text>
          Nomor: <strong>{{ savedNomor }}</strong
          ><br />Ingin cetak bukti transaksi ini?
        </v-card-text>
        <v-card-actions class="justify-center">
          <v-btn
            variant="flat"
            class="btn-primary-red"
            prepend-icon="mdi-printer"
            @click="handlePrint"
            >Cetak</v-btn
          >
          <v-btn variant="tonal" class="btn-header-action ms-2" @click="closeAll">Tutup</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <InvoiceSearchModal
      v-if="dialogs.invoiceSearch"
      source="biaya-kirim"
      @close="dialogs.invoiceSearch = false"
      @invoice-selected="loadInvoiceDetail"
    />
  </PageLayout>
</template>

<style scoped>
.form-page {
  /* Tema merah lokal (DESIGN.md 10.3) */
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 4px 16px;
  font-size: 11px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}
@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ══════════ TOMBOL ══════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover {
  filter: brightness(1.08);
}
.btn-header-action {
  background-color: rgba(183, 28, 28, 0.08) !important;
  color: #b71c1c !important;
  font-weight: 700;
  border: 1px solid rgba(183, 28, 28, 0.2);
}
.btn-header-action:hover:not(:disabled) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.btn-primary-red:focus-visible,
.btn-header-action:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}

/* ══════════ PANEL ══════════ */
.panel {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
  padding: 12px;
}
.panel-title {
  margin: 0 0 10px;
  padding-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #b71c1c;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
}
.two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

/* Sel baca-saja disetarakan tinggi dan bentuknya dengan field compact (40px) */
.s-readonly {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 40px;
  padding: 4px 12px;
  border-radius: 8px;
  border-left: 3px solid #b71c1c;
  background-color: rgba(183, 28, 28, 0.04);
  min-width: 0;
}
.s-readonly.is-empty {
  border-left-color: rgba(var(--v-theme-on-surface), 0.2);
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}
.s-label {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.s-value {
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s-readonly.is-empty .s-value {
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.amount {
  font-variant-numeric: tabular-nums;
}

.customer-card {
  padding: 8px 10px;
  border-radius: 8px;
  border-left: 3px solid #b71c1c;
  background-color: rgba(183, 28, 28, 0.04);
}
.customer-card.is-empty {
  border-left-color: rgba(var(--v-theme-on-surface), 0.2);
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}
.customer-name {
  font-size: 12px;
  font-weight: 700;
}
.customer-line {
  margin-top: 2px;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.customer-empty {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

/* ══════════ FIELD ══════════ */
.form-field :deep(.v-field) {
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}
.form-field :deep(.v-field__outline) {
  display: none !important;
}
.form-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.form-field :deep(.v-field__input),
.form-field :deep(input),
.form-field :deep(textarea) {
  font-size: 11px !important;
  line-height: 1.4 !important;
}
.form-field :deep(.v-label) {
  font-size: 11px !important;
}
.form-field :deep(.v-label.v-field-label--floating) {
  font-size: 10px !important;
}
.form-field :deep(.v-field__prepend-inner .v-icon) {
  color: #b71c1c;
  opacity: 0.8;
}
.form-field.is-locked :deep(.v-field) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  border-color: rgba(var(--v-theme-on-surface), 0.12) !important;
}

/* Input utama form: biaya kirim. Rata kanan, angka tabular, ukuran sedikit lebih besar */
.biaya-field :deep(input) {
  font-size: 13px !important;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.biaya-field :deep(.v-field__prepend-inner),
.biaya-field :deep(.v-text-field__prefix) {
  font-size: 12px;
  font-weight: 700;
  color: #b71c1c;
}

/* ══════════ DIALOG ══════════ */
.dialog-card {
  border-radius: 12px;
  overflow: hidden;
}
.confirm-title {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}
</style>

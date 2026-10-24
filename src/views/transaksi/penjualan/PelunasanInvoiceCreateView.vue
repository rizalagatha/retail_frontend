<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import RekeningSearchModal from "@/components/lookup/RekeningSearchModal.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import type { AxiosError } from "axios";
import type { DataTableHeader } from "vuetify";

interface OutstandingItem {
  ph_nomor: string;
  inv_nomor: string;
  ph_tanggal: string;
  marketplace: string;
  no_pesanan: string;
  sisa_tagihan: number;
}

interface PaymentDetailItem {
  inv_nomor: string;
  inv_mp_nama: string;
  inv_mp_nomor_pesanan: string;
  nominal_bayar: number | string;
}

interface CustomerLookupResult {
  kode: string;
  nama: string;
  alamat: string;
}

interface RekeningLookupResult {
  kode: string;
  nama: string;
  rekening: string;
}

// --- Inisialisasi ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "50";

// --- State ---
const isViewMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => (isViewMode.value ? "Detail Pelunasan" : "Input Pelunasan Baru"));

const isLoading = ref(false);
const isSaving = ref(false);

const form = reactive({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  customer: {
    kode: "",
    nama: "",
    alamat: "",
  },
  metode: "TRANSFER",
  bankAccount: {
    kode: "",
    nama: "",
    rekening: "",
  },
  keterangan: "",
  userCreate: "",
});

interface InvoiceRow {
  ph_nomor?: string;
  inv_nomor: string;
  ph_tanggal?: string;
  marketplace?: string;
  no_pesanan?: string;
  sisa_tagihan?: number;
  bayar: number;
}

const invoiceList = ref<InvoiceRow[]>([]);
const selectedIds = ref<string[]>([]);

const dialogs = reactive({
  customerSearch: false,
  rekeningSearch: false,
});

// State untuk Dialog Konfirmasi
const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const totalAllocated = computed(() => {
  if (isViewMode.value) {
    return invoiceList.value.reduce((sum, item) => sum + (Number(item.bayar) || 0), 0);
  } else {
    return invoiceList.value
      .filter((item) => item.ph_nomor && selectedIds.value.includes(item.ph_nomor))
      .reduce((sum, item) => sum + (Number(item.bayar) || 0), 0);
  }
});

const isRowChecked = (item: InvoiceRow) =>
  !!item.ph_nomor && selectedIds.value.includes(item.ph_nomor);

const isOver = (item: InvoiceRow) =>
  isRowChecked(item) && (Number(item.bayar) || 0) > (item.sisa_tagihan ?? 0);

const jumlahMelebihi = computed(() => invoiceList.value.filter((i) => isOver(i)).length);

const jumlahInvoice = computed(() =>
  isViewMode.value ? invoiceList.value.length : selectedIds.value.length
);

const totalSisaTerpilih = computed(() =>
  invoiceList.value
    .filter((i) => isRowChecked(i))
    .reduce((sum, i) => sum + (i.sisa_tagihan ?? 0), 0)
);

const openCustomer = () => {
  if (!isViewMode.value) dialogs.customerSearch = true;
};
const openRekening = () => {
  if (!isViewMode.value) dialogs.rekeningSearch = true;
};

const tableHeaders = computed<DataTableHeader[]>(() => {
  const base: DataTableHeader[] = [
    { title: "No. Invoice", key: "inv_nomor", width: "140px" },
    { title: "Marketplace", key: "marketplace", width: "120px" },
    { title: "No. Pesanan", key: "no_pesanan", width: "180px" },
  ];

  if (isViewMode.value) {
    return [...base, { title: "Nominal Dibayar", key: "bayar", align: "end", width: "150px" }];
  } else {
    return [
      { title: "Tgl Piutang", key: "ph_tanggal", width: "110px" },
      ...base,
      { title: "Sisa Tagihan", key: "sisa_tagihan", align: "end", width: "130px" },
      { title: "Bayar Ini", key: "bayar", align: "end", width: "150px" },
    ];
  }
});

// --- Methods ---
const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const loadOutstanding = async () => {
  if (!form.customer.kode) return;
  isLoading.value = true;
  invoiceList.value = [];
  selectedIds.value = [];

  try {
    const response = await api.get(`/pelunasan-invoice/outstanding-piutang/${form.customer.kode}`);
    invoiceList.value = response.data.map((inv: OutstandingItem) => ({
      ph_nomor: inv.ph_nomor,
      inv_nomor: inv.inv_nomor,
      ph_tanggal: format(new Date(inv.ph_tanggal), "dd-MM-yyyy"),
      marketplace: inv.marketplace,
      no_pesanan: inv.no_pesanan,
      sisa_tagihan: Number(inv.sisa_tagihan),
      bayar: 0,
    }));
  } catch (error) {
    console.error(error);
    toast.error("Gagal memuat data piutang.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetail = async (nomor: string) => {
  isLoading.value = true;
  try {
    const { data } = await api.get(`/pelunasan-invoice/detail/${nomor}`);
    form.nomor = data.header.sh_nomor;
    form.tanggal = format(new Date(data.header.sh_tanggal), "yyyy-MM-dd");
    form.customer = {
      kode: data.header.sh_cus_kode,
      nama: data.header.cus_nama,
      alamat: data.header.cus_alamat,
    };
    form.metode = data.header.metode_bayar_desc;
    form.keterangan = data.header.sh_ket;
    form.bankAccount = {
      kode: data.header.sh_akun,
      nama: "",
      rekening: data.header.sh_norek,
    };
    form.userCreate = data.header.user_create;
    invoiceList.value = data.details.map((dtl: PaymentDetailItem) => ({
      inv_nomor: dtl.inv_nomor,
      marketplace: dtl.inv_mp_nama,
      no_pesanan: dtl.inv_mp_nomor_pesanan,
      bayar: Number(dtl.nominal_bayar),
    }));
  } catch (error: unknown) {
    const axiosErr = error as AxiosError<{ message: string }>;
    const msg =
      axiosErr.response?.data?.message || axiosErr.message || "Gagal memuat detail transaksi.";
    toast.error(msg);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

watch(selectedIds, (newSelection) => {
  if (isViewMode.value) return;
  invoiceList.value.forEach((item) => {
    if (item.ph_nomor && newSelection.includes(item.ph_nomor)) {
      if (item.bayar === 0) {
        item.bayar = item.sisa_tagihan || 0;
      }
    }
  });
});

const onCustomerSelected = (cust: CustomerLookupResult) => {
  form.customer = {
    kode: cust.kode,
    nama: cust.nama,
    alamat: cust.alamat,
  };
  dialogs.customerSearch = false;
  loadOutstanding();
};

const onRekeningSelected = (rek: RekeningLookupResult) => {
  form.bankAccount = {
    kode: rek.kode,
    nama: rek.nama,
    rekening: rek.rekening,
  };
  dialogs.rekeningSearch = false;
};

// --- LOGIC SIMPAN ---
// 1. Triggered by Button
const handleSave = () => {
  // Validasi Awal
  if (!form.customer.kode) return toast.error("Pilih customer terlebih dahulu.");
  if (totalAllocated.value <= 0) return toast.error("Tidak ada nominal yang dibayarkan.");
  if (totalAllocated.value <= 0) return toast.error("Tidak ada nominal yang dibayarkan.");
  if (jumlahMelebihi.value > 0) {
    return toast.error(`${jumlahMelebihi.value} invoice dibayar melebihi sisa tagihan.`);
  }
  if (form.metode === "TRANSFER" && !form.bankAccount.kode) {
    return toast.error("Pilih akun bank untuk metode transfer.");
  }

  // Tampilkan konfirmasi
  showConfirmation(
    "Konfirmasi Simpan",
    `Anda akan menyimpan pelunasan sebesar ${formatRupiah(totalAllocated.value)}. Lanjutkan?`,
    executeSave // Jika Ya, jalankan executeSave
  );
};

// 2. Eksekusi ke API
const executeSave = async () => {
  const invoicesToPay = invoiceList.value
    .filter(
      (item) =>
        typeof item.ph_nomor === "string" &&
        selectedIds.value.includes(item.ph_nomor) &&
        item.bayar > 0
    )
    .map((item) => ({
      inv_nomor: item.inv_nomor,
      bayar: item.bayar,
    }));

  isSaving.value = true;
  try {
    const payload = {
      customerKode: form.customer.kode,
      paymentDate: form.tanggal,
      paymentMethod: form.metode,
      bankAccount: form.bankAccount,
      totalBayar: totalAllocated.value,
      invoices: invoicesToPay,
      keterangan: form.keterangan,
    };

    const response = await api.post("/pelunasan-invoice/save-pelunasan", payload);

    markAsSaved();
    toast.success(response.data.message || "Pelunasan berhasil disimpan.");
    await router.push({ name: "PelunasanInvoice" });
  } catch (error: unknown) {
    // cast ke AxiosError
    const axiosErr = error as AxiosError<{ message?: string }>;

    // Filter error navigasi
    const msg = axiosErr.message ?? "";
    if (msg.includes("NavigationFailure") || msg.includes("No match for")) {
      console.warn("Navigasi gagal, tapi data tersimpan:", axiosErr);
      return;
    }

    console.error(axiosErr);
    toast.error(
      axiosErr.response?.data?.message || axiosErr.message || "Gagal menyimpan pelunasan."
    );
  } finally {
    isSaving.value = false;
  }
};

// --- LOGIC BATAL / RESET ---
const handleReset = () => {
  showConfirmation(
    "Reset Form",
    "Semua inputan akan dihapus dan kembali ke awal. Lanjutkan?",
    () => {
      // Reset State
      form.nomor = "";
      form.customer = { kode: "", nama: "", alamat: "" };
      form.bankAccount = { kode: "", nama: "", rekening: "" };
      form.keterangan = "";
      form.metode = "TRANSFER";
      invoiceList.value = [];
      selectedIds.value = [];
    }
  );
};

// --- LOGIC TUTUP ---
const handleClose = () => {
  if (isViewMode.value) {
    router.push({ name: "PelunasanInvoice" });
    return;
  }

  // Cek apakah ada data yang sudah diisi
  if (form.customer.kode || selectedIds.value.length > 0) {
    showConfirmation(
      "Tutup Form",
      "Data yang belum disimpan akan hilang. Yakin ingin menutup form?",
      () => {
        markAsSaved();
        // [FIX] Arahkan eksplisit ke list agar tidak nyangkut
        router.push({ name: "PelunasanInvoice" });
      }
    );
  } else {
    markAsSaved();
    router.push({ name: "PelunasanInvoice" });
  }
};

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    loadDetail(nomor);
  } else {
    if (!authStore.can(MENU_ID, "insert")) {
      toast.error("Akses ditolak.");
      router.back();
    }
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-hand-coin" desktop-mode>
    <template #header-actions>
      <v-btn
        v-if="!isViewMode"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-content-save"
        :loading="isSaving"
        :disabled="totalAllocated <= 0 || jumlahMelebihi > 0"
        @click="handleSave"
      >
        Simpan
      </v-btn>

      <v-btn
        v-if="!isViewMode"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-refresh"
        @click="handleReset"
      >
        Batal
      </v-btn>

      <v-btn
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-close"
        @click="handleClose"
      >
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">
      <!-- ───────── Panel kiri ───────── -->
      <div class="form-panel">
        <section class="panel-group">
          <h3 class="group-title">Bukti pelunasan</h3>

          <v-text-field
            label="Nomor bukti"
            v-model="form.nomor"
            readonly
            variant="outlined"
            density="compact"
            placeholder="(otomatis)"
            hide-details
            class="readonly-field nomor-field"
          />

          <v-text-field
            label="Tanggal bayar"
            v-model="form.tanggal"
            type="date"
            variant="outlined"
            density="compact"
            :readonly="isViewMode"
            hide-details
          />
        </section>

        <section class="panel-group">
          <h3 class="group-title">Pembayaran</h3>

          <div>
            <v-text-field
              label="Marketplace / customer"
              :model-value="form.customer.nama"
              readonly
              variant="outlined"
              density="compact"
              hide-details
              :append-inner-icon="!isViewMode ? 'mdi-magnify' : ''"
              :placeholder="!isViewMode ? 'Pilih customer' : ''"
              :class="isViewMode ? 'readonly-field' : 'search-field'"
              @click="openCustomer"
              @keydown.enter="openCustomer"
            />
            <div v-if="form.customer.alamat" class="field-note">
              {{ form.customer.alamat }}
            </div>
          </div>

          <div>
            <div class="field-caption">Metode pembayaran</div>
            <v-btn-toggle
              v-model="form.metode"
              mandatory
              divided
              density="compact"
              variant="outlined"
              class="metode-toggle"
              :disabled="isViewMode"
            >
              <v-btn value="TRANSFER">Transfer</v-btn>
              <v-btn value="TUNAI">Tunai</v-btn>
              <v-btn value="GIRO">Giro</v-btn>
            </v-btn-toggle>
          </div>

          <v-expand-transition>
            <div v-if="form.metode === 'TRANSFER' || isViewMode">
              <v-text-field
                label="Akun bank (masuk ke)"
                :model-value="
                  form.bankAccount.rekening
                    ? `${form.bankAccount.kode} - ${form.bankAccount.rekening}`
                    : ''
                "
                readonly
                variant="outlined"
                density="compact"
                hide-details
                :append-inner-icon="!isViewMode ? 'mdi-bank' : ''"
                :placeholder="!isViewMode ? 'Pilih akun bank' : ''"
                :class="isViewMode ? 'readonly-field' : 'search-field'"
                @click="openRekening"
                @keydown.enter="openRekening"
              />
            </div>
          </v-expand-transition>

          <v-textarea
            label="Keterangan"
            v-model="form.keterangan"
            variant="outlined"
            density="compact"
            rows="3"
            auto-grow
            :readonly="isViewMode"
            hide-details
          />
        </section>

        <div v-if="isViewMode" class="panel-meta">
          Dibuat oleh <strong>{{ form.userCreate }}</strong>
        </div>
      </div>

      <!-- ───────── Kolom kanan ───────── -->
      <div class="right-column">
        <div class="list-head">
          <h3 class="list-title">
            {{ isViewMode ? "Invoice yang dilunasi" : "Tagihan outstanding" }}
          </h3>
          <v-btn
            v-if="!isViewMode"
            size="x-small"
            variant="text"
            color="primary"
            prepend-icon="mdi-refresh"
            :loading="isLoading"
            :disabled="!form.customer.kode"
            @click="loadOutstanding"
          >
            Muat ulang
          </v-btn>
        </div>

        <div class="table-wrapper">
          <v-data-table
            v-model="selectedIds"
            :headers="tableHeaders"
            :items="invoiceList"
            :loading="isLoading"
            :show-select="!isViewMode"
            item-value="ph_nomor"
            density="compact"
            class="desktop-table"
            fixed-header
            height="100%"
            :items-per-page="-1"
            hide-default-footer
            :item-props="(item: InvoiceRow) => ({ class: isRowChecked(item) ? 'row-picked' : '' })"
          >
            <template v-slot:[`item.sisa_tagihan`]="{ item }">
              <span class="amount">{{ formatRupiah(item.sisa_tagihan ?? 0) }}</span>
            </template>

            <template v-slot:[`item.bayar`]="{ item }">
              <div v-if="!isViewMode" class="bayar-cell">
                <v-text-field
                  v-model.number="item.bayar"
                  type="number"
                  min="0"
                  :max="item.sisa_tagihan"
                  variant="outlined"
                  density="compact"
                  hide-details
                  prefix="Rp"
                  class="bayar-field"
                  :class="{ 'bayar-over': isOver(item) }"
                  :disabled="!isRowChecked(item)"
                  :aria-label="`Nominal bayar ${item.inv_nomor}`"
                />
                <div v-if="isOver(item)" class="over-note">
                  <v-icon size="12">mdi-alert</v-icon> Melebihi sisa
                </div>
              </div>
              <div v-else class="amount text-right">{{ formatRupiah(item.bayar) }}</div>
            </template>

            <template v-slot:no-data>
              <div class="empty-state">
                <v-icon icon="mdi-invoice-text-outline" size="36" />
                <template v-if="!form.customer.kode">
                  <p>Pilih customer untuk melihat tagihan yang belum lunas.</p>
                  <v-btn
                    v-if="!isViewMode"
                    size="small"
                    variant="flat"
                    class="btn-primary-red"
                    prepend-icon="mdi-magnify"
                    @click="openCustomer"
                  >
                    Pilih customer
                  </v-btn>
                </template>
                <p v-else>Customer ini tidak punya tagihan outstanding.</p>
              </div>
            </template>
          </v-data-table>
        </div>

        <div class="summary-bar">
          <div v-if="jumlahMelebihi > 0" class="summary-warn">
            <v-icon size="16">mdi-alert</v-icon>
            {{ jumlahMelebihi }} invoice dibayar melebihi sisa tagihan
          </div>

          <div class="summary-item">
            <span class="summary-label">{{
              isViewMode ? "Jumlah invoice" : "Invoice dipilih"
            }}</span>
            <span class="summary-value">{{ jumlahInvoice }}</span>
          </div>

          <div v-if="!isViewMode" class="summary-item">
            <span class="summary-label">Sisa tagihan terpilih</span>
            <span class="summary-value">{{ formatRupiah(totalSisaTerpilih) }}</span>
          </div>

          <div class="summary-item summary-total">
            <span class="summary-label">{{
              isViewMode ? "Total pelunasan" : "Total dibayarkan"
            }}</span>
            <span class="summary-value">{{ formatRupiah(totalAllocated) }}</span>
          </div>
        </div>
      </div>
    </div>

    <CustomerSearchModal
      v-if="dialogs.customerSearch"
      :gudang="authStore.user?.cabang ?? ''"
      @close="dialogs.customerSearch = false"
      @customer-selected="onCustomerSelected"
    />
    <RekeningSearchModal
      v-if="dialogs.rekeningSearch"
      :cabang="authStore.user?.cabang ?? ''"
      @close="dialogs.rekeningSearch = false"
      @selected="onRekeningSelected"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            variant="flat"
            class="btn-primary-red"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
          >
            Ya, lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* ══════════════ LAYOUT ══════════════ */
.form-grid-container {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 16px;
  height: calc(100vh - 64px - 48px);
  overflow: hidden;

  /* Tema merah lokal: checkbox, toggle, tombol teks di halaman ini ikut merah */
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* ══════════════ TOMBOL HEADER ══════════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover:not(:disabled) {
  filter: brightness(1.08);
}
.btn-primary-red:disabled {
  opacity: 0.45;
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

/* ══════════════ PANEL KIRI ══════════════ */
.form-panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  background-color: rgba(183, 28, 28, 0.04);
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-left: 4px solid #b71c1c;
  border-radius: 8px;
}

.panel-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.group-title {
  margin: 0;
  padding-bottom: 4px;
  font-size: 13px;
  font-weight: 700;
  color: #b71c1c;
  border-bottom: 1.5px solid rgba(183, 28, 28, 0.2);
}

/* Field putih di atas panel yang sedikit tinted */
.form-panel :deep(.v-field) {
  background-color: rgb(var(--v-theme-surface));
}

.field-caption {
  margin-bottom: 4px;
  font-size: 11px;
  opacity: 0.7;
}

.field-note {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.7;
}

/* Field hanya-baca: jelas bukan untuk diketik */
.readonly-field :deep(.v-field) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  box-shadow: none !important;
}
.readonly-field :deep(input) {
  color: rgba(var(--v-theme-on-surface), 0.75) !important;
  font-weight: 500;
}
.nomor-field :deep(input) {
  font-weight: 800 !important;
  color: #b71c1c !important;
}

/* Field pencarian: ikon jadi tombol (pola SoCreateView) */
.search-field :deep(.v-field) {
  cursor: pointer;
}
.search-field :deep(.v-field__append-inner) {
  display: flex;
  align-items: center;
}
.search-field :deep(.v-field__append-inner .v-icon) {
  font-size: 16px;
  color: #ffffff;
  background-color: #b71c1c;
  border-radius: 6px;
  padding: 5px;
  width: 24px;
  height: 24px;
  opacity: 1;
  transition: background-color 0.15s ease;
}
.search-field:hover :deep(.v-field__append-inner .v-icon) {
  background-color: #8e0000;
}
.search-field :deep(.v-field--focused .v-field__outline) {
  color: #b71c1c !important;
}

/* Metode pembayaran */
.metode-toggle {
  display: flex;
  width: 100%;
  height: 36px;
}
.metode-toggle :deep(.v-btn) {
  flex: 1;
  text-transform: none;
  font-weight: 600;
  letter-spacing: 0;
  background-color: rgb(var(--v-theme-surface));
}
.metode-toggle :deep(.v-btn--active) {
  background-color: #b71c1c;
  color: #ffffff;
}
.metode-toggle :deep(.v-btn__overlay) {
  display: none;
}

.panel-meta {
  margin-top: auto;
  padding-top: 12px;
  font-size: 11px;
  opacity: 0.75;
  border-top: 1px solid rgba(183, 28, 28, 0.15);
}

/* ══════════════ DAFTAR TAGIHAN ══════════════ */
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
}

.list-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.table-wrapper {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 8px;
}

.desktop-table {
  height: 100%;
}

.desktop-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  white-space: nowrap;
  border-bottom: 2px solid #8e0000 !important;
}
.desktop-table :deep(thead tr th .v-icon) {
  color: #ffffff !important;
}
/* Teks isi tabel: 11px, konsisten dengan header dan tabel detail di browse */
.desktop-table :deep(tbody tr td) {
  font-size: 11px !important;
}

.desktop-table :deep(tbody tr:hover > td) {
  background-color: rgba(183, 28, 28, 0.06);
}

/* Baris yang akan dibayar */
.desktop-table :deep(tbody tr.row-picked > td) {
  background-color: rgba(183, 28, 28, 0.09) !important;
}
.desktop-table :deep(tbody tr.row-picked > td:first-child) {
  box-shadow: inset 3px 0 0 #b71c1c;
}

.amount {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.bayar-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 4px 0;
}

.bayar-field {
  width: 170px;
}
.bayar-field :deep(input) {
  font-size: 11px;
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.bayar-field :deep(.v-text-field__prefix) {
  font-size: 11px;
}
.bayar-field :deep(input[type="number"]) {
  -moz-appearance: textfield;
  appearance: textfield;
}
.bayar-field :deep(input::-webkit-outer-spin-button),
.bayar-field :deep(input::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

/* Peringatan melebihi sisa: amber, supaya tidak tertukar dengan merah tema */
.bayar-over :deep(.v-field__outline) {
  color: #b26a00 !important;
  --v-field-border-opacity: 1;
}
.over-note {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 600;
  color: #b26a00;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  text-align: center;
}
.empty-state .v-icon {
  opacity: 0.4;
}
.empty-state p {
  margin: 0;
  font-size: 13px;
  opacity: 0.75;
}

/* ══════════════ RINGKASAN ══════════════ */
.summary-bar {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 32px;
  padding: 10px 16px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-top: 3px solid #b71c1c;
  border-radius: 8px;
}

.summary-warn {
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #b26a00;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.summary-label {
  font-size: 11px;
  opacity: 0.7;
}
.summary-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.summary-total .summary-value {
  font-size: 22px;
  font-weight: 800;
}

@media (max-width: 960px) {
  .form-grid-container {
    grid-template-columns: 1fr;
    height: auto;
    overflow: visible;
  }
  .form-panel {
    overflow: visible;
  }
  .table-wrapper {
    min-height: 360px;
  }
  .summary-bar {
    flex-wrap: wrap;
    gap: 16px;
  }
}
</style>

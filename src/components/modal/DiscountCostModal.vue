<script setup lang="ts">
import { ref, computed, watch, reactive, nextTick } from "vue";
import { useToast } from "vue-toastification";
import api from "@/services/api";
import AuthorizationModal from "@/components/modal/AuthorizationModal.vue";
import { formatRupiah } from "@/utils/formatRupiah";

// --- Interfaces ---
interface Customer {
  nama?: string;
  level_kode?: string;
}

interface FooterData {
  diskonPersen1: number;
  diskonPersen2: number;
  biayaKirim: number;
  diskonRp: number;
  pinDiskon1?: string;
  pinDiskon2?: string;
  authNomor?: string;
}

// --- [BARU] Interface Auth Dialog ---
interface AuthDialogState {
  show: boolean;
  title: string;
  jenis: string;
  nominal: number;
  transaksi?: string;
  barcode?: string;
  keterangan?: string;
  onSuccess: (data: { authNomor: string; approver: string }) => void;
  onCancel: () => void;
}

const props = defineProps({
  footerData: {
    type: Object as () => FooterData,
    required: true,
  },
  totalSo: {
    type: Number,
    required: true,
  },
  ppnPersen: {
    type: Number,
    required: true,
  },
  customer: {
    type: Object as () => Customer | null,
    required: true,
  },
  gudangKode: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    default: "SO", // Bisa 'SO' atau 'OFFER'
  },
  // Tambahkan nomor dokumen jika sudah ada (untuk audit otorisasi)
  docNo: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["close", "update"]);
const toast = useToast();

// --- State Lokal ---
const localFooter = ref(JSON.parse(JSON.stringify(props.footerData)) as FooterData);
const diskonRpInput = ref(props.footerData.diskonRp || 0); // State untuk input manual Rp
const isDiskonRpInputFocused = ref(false);
const previousDiskonRp = ref(0);
const isSaving = ref(false);
const isCheckingAuth = ref(false);
const pendingAuthCheck = ref(false);
const diskonManualRp = ref(0);

// --- [BARU] State Auth Dialog ---
const authDialog = reactive<AuthDialogState>({
  show: false,
  title: "",
  jenis: "",
  nominal: 0,
  transaksi: "",
  barcode: "",
  keterangan: "",
  onSuccess: () => {},
  onCancel: () => {},
});

// Penanda state agar tidak trigger watcher/blur saat restore
const isRestoring = ref(false);

// Backup state untuk fitur Cancel Otorisasi
const previousState = ref<FooterData | null>(null);

// Watcher untuk sync prop ke local state (jika modal dibuka ulang)
watch(
  () => props.footerData,
  (newVal) => {
    localFooter.value = JSON.parse(JSON.stringify(newVal));

    // [PERBAIKAN KUNCI]
    // Kita harus mencari tahu berapa nilai diskon manualnya.
    // Rumusnya: Diskon Total di Footer - (Hitungan Persen 1 & 2 dari Total SO)
    const totalBruto = Number(props.totalSo) || 0;
    const p1 = Number(newVal.diskonPersen1) || 0;
    const disc1 = (p1 / 100) * totalBruto;

    const p2 = Number(newVal.diskonPersen2) || 0;
    // Asumsi: disc2 dihitung setelah dikurangi disc1 & manual (karena kita sedang load awal, kita balik rumusnya).
    // Tapi untuk aman dan sederhana, kita asumsikan selisihnya adalah manual:
    const calculatedPersen = disc1 + (p2 / 100) * (totalBruto - disc1); // Perkiraan tanpa manual

    let manualAwal = Math.round((newVal.diskonRp || 0) - calculatedPersen);
    if (manualAwal < 0) manualAwal = 0;

    diskonManualRp.value = manualAwal;
  },
  { immediate: true, deep: true }
);

// --- Computed Properties ---
const diskonRp = computed(() => {
  const totalBruto = Number(props.totalSo) || 0;
  const nominalManual = Number(diskonManualRp.value) || 0; // [FIX] Gunakan state manual

  const p1 = Number(localFooter.value.diskonPersen1) || 0;
  const p2 = Number(localFooter.value.diskonPersen2) || 0;

  // 1. Diskon 1 dari total bruto
  const disc1 = (p1 / 100) * totalBruto;

  // 2. Diskon 2 (MAPS) dihitung dari sisa setelah (Nominal Manual + Diskon 1)
  const remaining = totalBruto - nominalManual - disc1;
  const disc2 = (p2 / 100) * remaining;

  // Total diskon adalah gabungan ketiganya (Ini akan dikirim ke form SO)
  return Math.round(nominalManual + disc1 + disc2);
});

const netto = computed(() => props.totalSo - diskonRp.value);
const ppnRp = computed(() => (props.ppnPersen / 100) * netto.value);
const grandTotal = computed(() => netto.value + ppnRp.value + (localFooter.value.biayaKirim || 0));

const displayDiskonRp = computed(() => {
  return isDiskonRpInputFocused.value
    ? String(diskonManualRp.value)
    : formatRupiah(diskonManualRp.value);
});

// Jalur API dinamis berdasarkan sumber [cite: 2025-09-03]
const apiBasePath = computed(() => (props.source === "OFFER" ? "/offer-form" : "/so-form"));
const discountLookupEndpoint = computed(() =>
  props.source === "OFFER" ? "/get-default-discount" : "/lookup/default-discount"
);

// Helper untuk label transaksi pada modal otorisasi
const transaksiLabel = computed(() => {
  const type = props.source === "OFFER" ? "PENAWARAN" : "SO";
  return props.docNo ? `${type} ${props.docNo}` : `DRAFT ${type}`;
});

// --- Helper Functions ---
const backupCurrentState = () => {
  previousState.value = JSON.parse(JSON.stringify(localFooter.value));
};

const restorePreviousState = async () => {
  if (!previousState.value) return;
  isRestoring.value = true;

  const prev = previousState.value;
  localFooter.value = { ...prev };

  // Khusus Rp, kembalikan input manualnya
  diskonManualRp.value = previousDiskonRp.value;

  await nextTick();
  isRestoring.value = false;
  previousState.value = null;
};

// --- [BARU] Helper Request Authorization ---
const requestAuthorization = (
  title: string,
  jenis: string,
  nominal: number,
  keteranganInfo: string,
  onSuccess: (data: { authNomor: string; approver: string }) => void,
  onCancel: () => void
) => {
  authDialog.title = title;
  authDialog.jenis = jenis;
  authDialog.nominal = nominal;

  authDialog.transaksi = transaksiLabel.value; // Bisa diisi nomor SO jika ada, tapi di modal biasanya draft
  authDialog.barcode = "";
  authDialog.keterangan = keteranganInfo;

  authDialog.onSuccess = (data) => {
    authDialog.show = false;
    onSuccess(data);
  };

  authDialog.onCancel = onCancel;
  authDialog.show = true;
};

// --- Handlers ---

// 1. Diskon Persen 1
const handleDiscount1Change = async () => {
  if (isRestoring.value) return;

  const enteredDiscount = Number(localFooter.value.diskonPersen1) || 0;
  // Ambil angka diskon lama sebelum diubah
  const oldDiscount = previousState.value ? Number(previousState.value.diskonPersen1) : 0;

  if (!props.customer || !props.customer.level_kode) return;

  // Jika nilainya tidak berubah sama sekali, jangan lakukan apa-apa
  if (enteredDiscount === oldDiscount) return;

  // Jika diubah, pastikan input nominal Rupiah direset ke 0
  diskonRpInput.value = 0;

  if (enteredDiscount === 0) {
    localFooter.value.pinDiskon1 = undefined; // Bersihkan otorisasi jika jadi 0
    return;
  }

  if (!props.customer || !props.customer.level_kode) {
    toast.error("Data Level Customer tidak terbaca! Tidak bisa merubah diskon.");
    localFooter.value.diskonPersen1 = 0;
    await restorePreviousState();
    return;
  }

  // [KUNCI PROSES SIMPAN] Tahan tombol Terapkan
  isCheckingAuth.value = true;
  pendingAuthCheck.value = true;

  try {
    // Kita tetap panggil API hanya untuk menampilkan info Standar vs Pengajuan di Modal Otorisasi
    const response = await api.get(`${apiBasePath.value}${discountLookupEndpoint.value}`, {
      params: { level: props.customer.level_kode, total: props.totalSo, gudang: props.gudangKode },
    });
    const defaultDiscountValue = Number(response.data.discount || 0);

    backupCurrentState();

    // Hapus PIN lama agar tidak ada celah bypass
    localFooter.value.pinDiskon1 = undefined;

    const estimasiNominal = (props.totalSo * enteredDiscount) / 100;
    const info = `Otorisasi Diskon: Std ${defaultDiscountValue}% -> Pengajuan ${enteredDiscount}%`;

    // [FIX] KARENA ADA PERUBAHAN ANGKA, LANGSUNG PAKSA MINTA OTORISASI
    requestAuthorization(
      "Otorisasi Diskon Faktur (%)",
      "DISKON_FAKTUR",
      estimasiNominal,
      info,
      (authResult) => {
        localFooter.value.pinDiskon1 = authResult.approver;
        if (authResult.authNomor) localFooter.value.authNomor = authResult.authNomor;
        toast.success("Diskon member disetujui.");
        pendingAuthCheck.value = false; // Lepas kunci
      },
      async () => {
        await restorePreviousState();
        toast.info("Perubahan diskon dibatalkan.");
        pendingAuthCheck.value = false; // Lepas kunci
      }
    );
  } catch (error) {
    await restorePreviousState();
    toast.error("Gagal memvalidasi diskon.", error);
    pendingAuthCheck.value = false;
  } finally {
    isCheckingAuth.value = false; // BUKA KUNCI CEK API
  }
};

// 2. Diskon Persen 2
// --- Di dalam DiscountCostModal.vue ---

const handleDiscount2Change = () => {
  if (isRestoring.value) return;

  const enteredDiscount2 = Number(localFooter.value.diskonPersen2) || 0;
  const oldDiscount2 = previousState.value ? Number(previousState.value.diskonPersen2) : 0;

  // Jika nilainya tidak berubah sama sekali, abaikan
  if (enteredDiscount2 === oldDiscount2) return;

  const hasBaseDiscount =
    Number(localFooter.value.diskonPersen1) > 0 || Number(diskonRpInput.value) > 0;

  if (!hasBaseDiscount && enteredDiscount2 > 0) {
    toast.warning("Diskon Dasar (Member atau Promo) belum terisi.");
    localFooter.value.diskonPersen2 = 0;
    return;
  }

  if (enteredDiscount2 > 0) {
    backupCurrentState();
    localFooter.value.pinDiskon2 = undefined; // Hapus PIN lama
    pendingAuthCheck.value = true; // Kunci Form

    const baseCut =
      Number(diskonManualRp.value) + (props.totalSo * localFooter.value.diskonPersen1) / 100;
    const afterBase = props.totalSo - baseCut;
    const estimasiNominalMaps = (afterBase * enteredDiscount2) / 100;
    const info = `Cust: ${
      props.customer?.nama || ""
    }\nPengajuan Diskon MAPS (2): ${enteredDiscount2}%`;

    requestAuthorization(
      "Otorisasi Diskon MAPS (Bertingkat)",
      "DISKON_FAKTUR",
      estimasiNominalMaps,
      info,
      (authResult) => {
        localFooter.value.pinDiskon2 = authResult.approver;
        if (authResult.authNomor) localFooter.value.authNomor = authResult.authNomor;
        toast.success("Diskon MAPS disetujui.");
        pendingAuthCheck.value = false;
      },
      async () => {
        await restorePreviousState();
        toast.info("Perubahan diskon dibatalkan.");
        pendingAuthCheck.value = false;
      }
    );
  } else {
    // Jika dihapus jadi 0
    localFooter.value.pinDiskon2 = undefined;
  }
};

// 3. Diskon Rupiah
const onDiskonRpFocus = () => {
  isDiskonRpInputFocused.value = true;
  if (!isRestoring.value) {
    previousDiskonRp.value = diskonManualRp.value; // [FIX] Gunakan diskonManualRp
    backupCurrentState();
  }
};

const onDiskonRpInput = (val: string) => {
  if (!isDiskonRpInputFocused.value) return;
  diskonManualRp.value = Number(val.replace(/[^0-9]/g, "")) || 0; // [FIX] Gunakan diskonManualRp
};

const onDiskonRpBlur = () => {
  isDiskonRpInputFocused.value = false;
  if (isRestoring.value) return;

  const newValue = diskonManualRp.value; // [FIX] Gunakan diskonManualRp
  const oldValue = previousDiskonRp.value;

  if (newValue !== oldValue && newValue > 0) {
    pendingAuthCheck.value = true;
    const info = `Cust: ${props.customer?.nama || ""}\nDiskon Tambahan Rupiah: ${formatRupiah(
      newValue
    )}`;

    requestAuthorization(
      "Otorisasi Diskon Rupiah",
      "DISKON_FAKTUR",
      newValue,
      info,
      (authResult) => {
        // Reset Persen jika input Rp manual
        localFooter.value.diskonPersen1 = 0;
        localFooter.value.diskonPersen2 = 0;

        localFooter.value.pinDiskon1 = authResult.approver;
        if (authResult.authNomor) {
          localFooter.value.authNomor = authResult.authNomor;
        }
        toast.success("Diskon Rp disetujui.");
        pendingAuthCheck.value = false;
      },
      async () => {
        await restorePreviousState();
        toast.info("Perubahan diskon dibatalkan.");
        pendingAuthCheck.value = false;
      }
    );
  }
};

// --- Actions ---
const saveAndClose = async () => {
  // [ANTI-BYPASS MUTLAK] Paksa kursor lepas dari input teks.
  // Ini akan langsung memicu event @blur detik itu juga dan mengaktifkan kunci auth.
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  // Beri jeda sistem untuk menarik nafas dan mengeksekusi request backend
  await new Promise((resolve) => setTimeout(resolve, 200));

  if (authDialog.show) {
    toast.warning("Selesaikan otorisasi diskon terlebih dahulu!");
    return;
  }

  if (isCheckingAuth.value || pendingAuthCheck.value) {
    toast.warning("Sistem sedang memvalidasi diskon. Mohon tunggu...");
    return;
  }

  isSaving.value = true;
  localFooter.value.diskonRp = diskonRp.value;

  if (diskonRpInput.value > 0) {
    localFooter.value.diskonPersen1 = 0;
    localFooter.value.diskonPersen2 = 0;
  }

  emit("update", localFooter.value);
  emit("close");
  isSaving.value = false;
};

const cancel = () => {
  emit("close");
};

const handleFocusDiscount = () => {
  if (!isRestoring.value) backupCurrentState();
};
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="500px">
    <v-card>
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title>Atur Diskon Faktur & Biaya Kirim</v-toolbar-title>
      </v-toolbar>

      <v-card-text class="pa-4">
        <v-row dense>
          <v-col cols="12">
            <v-text-field
              label="Biaya Kirim"
              v-model.number="localFooter.biayaKirim"
              type="number"
              variant="outlined"
              density="compact"
              hide-details
              class="text-end"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              label="Disc % 1"
              v-model.number="localFooter.diskonPersen1"
              @focus="handleFocusDiscount"
              @blur="handleDiscount1Change"
              type="number"
              variant="outlined"
              density="compact"
              hide-details
              class="text-end"
            />
          </v-col>

          <v-col cols="6">
            <v-text-field
              label="Disc % 2"
              v-model.number="localFooter.diskonPersen2"
              @focus="handleFocusDiscount"
              @blur="handleDiscount2Change"
              type="number"
              variant="outlined"
              density="compact"
              hide-details
              class="text-end"
            />
          </v-col>

          <v-col cols="12">
            <v-text-field
              label="Diskon Rp"
              :model-value="displayDiskonRp"
              @update:model-value="onDiskonRpInput"
              @focus="onDiskonRpFocus"
              @blur="onDiskonRpBlur"
              type="text"
              variant="outlined"
              density="compact"
              hide-details
              class="text-end"
            />
          </v-col>
        </v-row>

        <v-divider class="my-4"></v-divider>

        <v-list density="compact" class="summary-list">
          <v-list-item
            :title="props.source === 'OFFER' ? 'Total Penawaran (Bruto)' : 'Total SO (Bruto)'"
          >
            <template #append>{{ formatRupiah(props.totalSo) }}</template>
          </v-list-item>
          <v-list-item title="Diskon Faktur">
            <template #append>({{ formatRupiah(diskonRp) }})</template>
          </v-list-item>
          <v-list-item title="Netto (sebelum PPN)">
            <template #append>{{ formatRupiah(netto) }}</template>
          </v-list-item>
          <v-list-item title="PPN">
            <template #append>{{ formatRupiah(ppnRp) }}</template>
          </v-list-item>
          <v-list-item title="Biaya Kirim">
            <template #append>{{ formatRupiah(localFooter.biayaKirim || 0) }}</template>
          </v-list-item>
          <v-divider class="my-1" />
          <v-list-item class="summary-total">
            <v-list-item-title class="font-weight-bold">Grand Total</v-list-item-title>
            <template #append>
              <span class="text-h6 font-weight-bold">{{ formatRupiah(grandTotal) }}</span>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions class="dialog-footer">
        <v-spacer />
        <v-btn size="small" @click="cancel">Batal</v-btn>
        <v-btn size="small" color="primary" @click="saveAndClose" :loading="isSaving">
          Terapkan
        </v-btn>
      </v-card-actions>
    </v-card>

    <AuthorizationModal
      v-if="authDialog.show"
      :title="authDialog.title"
      :jenis="authDialog.jenis"
      :nominal="authDialog.nominal"
      :transaksi="authDialog.transaksi"
      :barcode="authDialog.barcode"
      :keterangan="authDialog.keterangan"
      @success="authDialog.onSuccess"
      @close="
        () => {
          authDialog.show = false;
          authDialog.onCancel();
        }
      "
    />
  </v-dialog>
</template>

<style scoped>
/* Style tetap sama seperti sebelumnya */
.dialog-footer {
  background-color: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
}

:deep(.v-field),
:deep(.v-field--variant-outlined),
:deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.summary-list .v-list-item {
  padding: 0 4px !important;
  min-height: 30px;
}

.summary-list .summary-total {
  min-height: 40px;
}

.text-end input {
  text-align: right;
}
</style>

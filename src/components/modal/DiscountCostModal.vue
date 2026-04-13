<script setup lang="ts">
import { ref, computed, watch, reactive, nextTick } from "vue";
import { useToast } from "vue-toastification";
import api from "@/services/api";
import AuthorizationModal from "@/components/modal/AuthorizationModal.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import axios from "axios";

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
    // [PERBAIKAN KUNCI 1]: Jangan timpa state lokal jika user sedang proses otorisasi
    if (isCheckingAuth.value || pendingAuthCheck.value) return;

    localFooter.value = {
      ...JSON.parse(JSON.stringify(newVal)),
      // Pertahankan PIN yang sudah diotorisasi di dalam modal
      pinDiskon1: localFooter.value?.pinDiskon1 || newVal.pinDiskon1,
      pinDiskon2: localFooter.value?.pinDiskon2 || newVal.pinDiskon2,
      authNomor: localFooter.value?.authNomor || newVal.authNomor
    };

    // [PERBAIKAN KUNCI 2]: Set nilai input manual Rp
    if (newVal.diskonPersen1 > 0) {
      diskonManualRp.value = 0;
      diskonRpInput.value = 0;
    } else {
      diskonManualRp.value = newVal.diskonRp || 0;
      diskonRpInput.value = newVal.diskonRp || 0;
    }
  },
  { immediate: true } // Hapus "deep: true" agar tidak ter-trigger oleh hal kecil di background
);

// --- Computed Properties ---
// --- [BARU] LOGIKA KELAYAKAN PROMO MAPS (SOP TERBARU) ---
const isEligibleForMaps = computed(() => {
  // Rule 1: Minimal belanja bruto 200rb
  if (props.totalSo < 200000) return false;

  // Rule 2: Evaluasi HANYA dari nilai diskon yang sedang AKTIF, bukan dari nama level.
  const persentaseManual =
    diskonManualRp.value > 0 ? (diskonManualRp.value / props.totalSo) * 100 : 0;
  const persentaseAktif = Math.max(localFooter.value.diskonPersen1, persentaseManual);

  // Kunci Maps HANYA JIKA diskon yang sedang dinikmati >= 10% DAN belanjanya >= 1 Juta
  if (persentaseAktif >= 10 && props.totalSo >= 1000000) return false;

  return true;
});

const mapsIneligibleReason = computed(() => {
  if (props.totalSo < 200000) return "Minimal belanja Rp 200.000 untuk promo ini.";

  const persentaseManual =
    diskonManualRp.value > 0 ? (diskonManualRp.value / props.totalSo) * 100 : 0;
  const persentaseAktif = Math.max(localFooter.value.diskonPersen1, persentaseManual);

  if (persentaseAktif >= 10 && props.totalSo >= 1000000)
    return "Diskon (≥ 10%) tidak dapat digabung dengan promo ini.";

  return "";
});

const toggleMapsPromo = () => {
  // Toggle antara 5% atau 0%
  localFooter.value.diskonPersen2 = localFooter.value.diskonPersen2 === 5 ? 0 : 5;
};
// --------------------------------------------------------

const diskonRp = computed(() => {
  const totalBruto = Number(props.totalSo) || 0;
  const nominalManual = Number(diskonManualRp.value) || 0;
  const p1 = Number(localFooter.value.diskonPersen1) || 0;
  const p2 = Number(localFooter.value.diskonPersen2) || 0;

  // Diskon Dasar (Pilih salah satu)
  const baseDiscount = p1 > 0 ? (p1 / 100) * totalBruto : nominalManual;

  // Diskon 2 (MAPS) dari SISA
  const remaining = totalBruto - baseDiscount;
  const disc2 = (p2 / 100) * remaining;

  return Math.round(baseDiscount + disc2);
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
  if (enteredDiscount === oldDiscount) return;

  if (enteredDiscount > 0) diskonManualRp.value = 0;

  if (enteredDiscount === 0) {
    localFooter.value.pinDiskon1 = undefined;
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
  } catch (error: unknown) {
    // [PERBAIKAN 2] Beri tipe unknown
    await restorePreviousState();

    // [PERBAIKAN 3] Ekstrak pesannya menjadi satu string aman
    let errorMessage = "Gagal memvalidasi diskon.";
    if (axios.isAxiosError(error)) {
      errorMessage = error.response?.data?.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    // [PERBAIKAN 4] Lempar 1 parameter string saja
    toast.error(errorMessage);
    pendingAuthCheck.value = false;
  } finally {
    isCheckingAuth.value = false; // BUKA KUNCI CEK API
  }
};

// 2. Diskon Persen 2
// --- Di dalam DiscountCostModal.vue ---

// const handleDiscount2Change = () => {
//   if (isRestoring.value) return;

//   const enteredDiscount2 = Number(localFooter.value.diskonPersen2) || 0;
//   const oldDiscount2 = previousState.value ? Number(previousState.value.diskonPersen2) : 0;

//   // Jika nilainya tidak berubah sama sekali, abaikan
//   if (enteredDiscount2 === oldDiscount2) return;

//   const hasBaseDiscount =
//     Number(localFooter.value.diskonPersen1) > 0 || Number(diskonRpInput.value) > 0;

//   if (!hasBaseDiscount && enteredDiscount2 > 0) {
//     toast.warning("Diskon Dasar (Member atau Promo) belum terisi.");
//     localFooter.value.diskonPersen2 = 0;
//     return;
//   }

//   if (enteredDiscount2 > 0) {
//     backupCurrentState();
//     localFooter.value.pinDiskon2 = undefined; // Hapus PIN lama
//     pendingAuthCheck.value = true; // Kunci Form

//     // Perhitungan Tiering untuk Nominal Otorisasi
//     let baseCut = 0;
//     if (localFooter.value.diskonPersen1 > 0) {
//       baseCut = (props.totalSo * localFooter.value.diskonPersen1) / 100;
//     } else {
//       baseCut = Number(diskonManualRp.value);
//     }
//     const afterBase = props.totalSo - baseCut;
//     const estimasiNominalMaps = (afterBase * enteredDiscount2) / 100;
//     const info = `Cust: ${
//       props.customer?.nama || ""
//     }\nPengajuan Diskon MAPS (2): ${enteredDiscount2}%`;

//     requestAuthorization(
//       "Otorisasi Diskon MAPS (Bertingkat)",
//       "DISKON_FAKTUR",
//       estimasiNominalMaps,
//       info,
//       (authResult) => {
//         localFooter.value.pinDiskon2 = authResult.approver;
//         if (authResult.authNomor) localFooter.value.authNomor = authResult.authNomor;
//         toast.success("Diskon MAPS disetujui.");
//         pendingAuthCheck.value = false;
//       },
//       async () => {
//         await restorePreviousState();
//         toast.info("Perubahan diskon dibatalkan.");
//         pendingAuthCheck.value = false;
//       }
//     );
//   } else {
//     // Jika dihapus jadi 0
//     localFooter.value.pinDiskon2 = undefined;
//   }
// };

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
        // [PERBAIKAN KUNCI 4]: MUTUALLY EXCLUSIVE
        // Reset Persen 1 jika input Rp manual disetujui
        localFooter.value.diskonPersen1 = 0;

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
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

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

  // [PERBAIKAN KUNCI 2]: Kirimkan nominal manual saja.
  localFooter.value.diskonRp = Number(diskonManualRp.value) || 0;

  if (localFooter.value.diskonRp > 0) {
    localFooter.value.diskonPersen1 = 0;
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
              :disabled="diskonManualRp > 0"
              :hint="diskonManualRp > 0 ? 'Dinonaktifkan' : ''"
              persistent-hint
            />
          </v-col>

          <v-col cols="6">
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
              :disabled="localFooter.diskonPersen1 > 0"
              :hint="localFooter.diskonPersen1 > 0 ? 'Dinonaktifkan' : ''"
              persistent-hint
            />
          </v-col>

          <v-col cols="12">
            <div class="text-caption font-weight-bold text-primary mb-1">
              PROMO GOOGLE MAPS REVIEW (5%)
            </div>
            <v-btn
              :color="localFooter.diskonPersen2 === 5 ? 'success' : 'blue-grey-lighten-4'"
              :variant="localFooter.diskonPersen2 === 5 ? 'flat' : 'outlined'"
              block
              class="mb-1 font-weight-bold"
              :disabled="!isEligibleForMaps"
              @click="toggleMapsPromo"
            >
              <v-icon start>{{
                localFooter.diskonPersen2 === 5 ? "mdi-check-decagram" : "mdi-google-maps"
              }}</v-icon>
              {{
                localFooter.diskonPersen2 === 5
                  ? "Promo Maps Diterapkan (5%)"
                  : "Klaim Promo Maps (5%)"
              }}
            </v-btn>
            <div v-if="!isEligibleForMaps" class="text-caption text-error font-italic mb-2">
              * {{ mapsIneligibleReason }}
            </div>
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

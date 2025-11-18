<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { useToast } from 'vue-toastification';
import api from '@/services/api';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
import axios, { type AxiosError } from 'axios';
import { formatRupiah } from "@/utils/formatRupiah";

interface Customer {
  level_kode: string;
}

interface FooterData {
  diskonPersen1: number;
  diskonPersen2: number;
  biayaKirim: number;
  diskonRp: number;
  pinDiskon1?: string;
  pinDiskon2?: string;
  // ... (properti footer lainnya)
}

const props = defineProps({
  footerData: {
    type: Object as () => FooterData,
    required: true
  },
  totalSo: {
    type: Number,
    required: true
  },
  ppnPersen: {
    type: Number,
    required: true
  },
  customer: {
    type: Object as () => Customer | null,
    required: true
  },
  gudangKode: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'update']);
const toast = useToast();

// Kita akan memindahkan state & logic ke sini
const localFooter = ref(JSON.parse(JSON.stringify(props.footerData)) as FooterData);
const previousState = ref<FooterData | null>(null);
const isRestoring = ref(false);
const isSaving = ref(false);
const isAuthModalVisible = ref(false);
const isAuth2ModalVisible = ref(false);
const challengeCode = ref('');
// const previousDiscount = ref({ persen1: 0, persen2: 0 });
const authModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const auth2ModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const isDiskonRpInputFocused = ref(false); // Kembalikan ini
const diskonRpInput = ref(props.footerData.diskonRp || 0); // State terpisah untuk input
const previousDiskonRp = ref(0);
const isAuthRpModalVisible = ref(false);
const authRpModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const diskonPersen1Input = ref(0);
const diskonPersen2Input = ref(0);

// Watch untuk sync dengan localFooter
watch(
  () => props.footerData,
  () => {
    diskonRpInput.value = 0; // RESET setiap buka modal
  },
  { immediate: true }
);

watch(() => localFooter.value.diskonPersen1, (newVal) => {
  diskonPersen1Input.value = newVal;
});

watch(() => localFooter.value.diskonPersen2, (newVal) => {
  diskonPersen2Input.value = newVal;
});

// --- Computed Properties (Kalkulasi Lokal) ---
// Kalkulasi ini sekarang terjadi di dalam modal
const diskonRp = computed(() => {
  // 1. Jika user input manual Diskon Rp, itu yang dipakai.
  if (diskonRpInput.value > 0) {
    return diskonRpInput.value;
  }

  // 2. Jika tidak, hitung dari persentase
  const diskon1 = (localFooter.value.diskonPersen1 / 100) * props.totalSo;
  const afterDiscount1 = props.totalSo - diskon1;
  const diskon2 = (localFooter.value.diskonPersen2 / 100) * afterDiscount1;
  return diskon1 + diskon2;
});

const netto = computed(() => {
  return props.totalSo - diskonRp.value;
});

const ppnRp = computed(() => {
  return (props.ppnPersen / 100) * netto.value;
});

const grandTotal = computed(() => {
  return netto.value + ppnRp.value + (localFooter.value.biayaKirim || 0);
});

// --- Fungsi Otorisasi (Dipindahkan dari parent) ---
const backupCurrentState = () => {
  previousState.value = JSON.parse(JSON.stringify(localFooter.value));
};

const restorePreviousState = async () => {
  if (!previousState.value) return;

  isRestoring.value = true;

  const prev = JSON.parse(JSON.stringify(previousState.value));

  // PAKSA update dengan menghapus dulu, baru isi
  localFooter.value = { ...localFooter.value, ...prev };
  diskonRpInput.value = prev.diskonRp ?? 0;

  await nextTick();

  isRestoring.value = false;
};

const handleDiscount1Change = async () => {
  diskonRpInput.value = 0;
  if (isRestoring.value) return; // PENTING!

  // Reset diskon Rp saat ubah persen
  diskonRpInput.value = 0;

  if (!props.customer || !props.customer.level_kode) {
    return;
  }

  const enteredDiscount = localFooter.value.diskonPersen1;

  // Jika 0, skip validasi
  if (enteredDiscount === 0) {
    return;
  }

  try {
    backupCurrentState();

    const response = await api.get('/so-form/lookup/default-discount', {
      params: {
        level: props.customer.level_kode,
        total: props.totalSo,
        gudang: props.gudangKode,
      }
    });
    const defaultDiscountValue = response.data.discount;

    if (enteredDiscount !== defaultDiscountValue && enteredDiscount > 0) {
      challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
      isAuthModalVisible.value = true;
    } else {
      // Kalau sama dengan default, clear backup
      previousState.value = null;
    }
  } catch (error: unknown) {
    await restorePreviousState();
    if (axios.isAxiosError(error)) {
      toast.error('Gagal memvalidasi diskon standar: ' + (error.response?.data?.message || ''));
    } else {
      toast.error('Gagal memvalidasi diskon standar.');
    }
  }
};

const handleDiscount2Change = () => {
  diskonRpInput.value = 0;
  if (isRestoring.value) return; // PENTING!

  diskonRpInput.value = 0;

  if (localFooter.value.diskonPersen1 <= 0 && localFooter.value.diskonPersen2 > 0) {
    toast.error('Diskon % 1 silahkan diisi dulu.');
    localFooter.value.diskonPersen2 = 0;
    return;
  }

  // Jika 0, skip validasi
  if (localFooter.value.diskonPersen2 === 0) {
    return;
  }

  if (localFooter.value.diskonPersen2 > 0) {
    backupCurrentState();
    challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
    isAuth2ModalVisible.value = true;
  }
};

const onAuthSuccess = async (pin: string) => {
  try {
    await api.post('/auth-pin/validate', { code: challengeCode.value, pin: pin });
    localFooter.value.pinDiskon1 = pin;
    isAuthModalVisible.value = false;
    previousState.value = null; // CLEAR BACKUP
    toast.success('Otorisasi diskon berhasil.');
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    if (axiosError.response?.status === 401) {
      if (authModalRef.value) {
        authModalRef.value.setFailed(axiosError.response.data?.message || 'Otorisasi Gagal.');
      }
    } else {
      toast.error(axiosError.response?.data?.message || 'Terjadi kesalahan.');
    }
  }
};

const onAuthCancel = async () => {
  isAuthModalVisible.value = false;
  await restorePreviousState();
};

const onAuth2Success = async (pin: string) => {
  try {
    await api.post('/auth-pin/validate', { code: challengeCode.value, pin: pin });
    localFooter.value.pinDiskon2 = pin;
    isAuth2ModalVisible.value = false;
    previousState.value = null; // CLEAR BACKUP
    toast.success('Otorisasi diskon 2 berhasil.');
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    if (axiosError.response?.status === 401) {
      if (auth2ModalRef.value) {
        auth2ModalRef.value.setFailed(axiosError.response.data?.message || 'Otorisasi Gagal.');
      }
    } else {
      toast.error(axiosError.response?.data?.message || 'Terjadi kesalahan.');
    }
  }
};

const onAuth2Cancel = async () => {
  isAuth2ModalVisible.value = false;
  await restorePreviousState();
};

const handleDiskonRpFocus = () => {
  previousDiskonRp.value = diskonRpInput.value;
};

const handleDiskonRpBlur = () => {
  if (isRestoring.value) return;

  const newValue = diskonRpInput.value;
  const oldValue = previousDiskonRp.value;

  if (newValue !== oldValue && newValue > 0) {
    // Backup dulu state sebelum meminta otorisasi
    backupCurrentState();
    // don't reset persen here; tunggu otorisasi sukses
    challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
    isAuthRpModalVisible.value = true;
  }
};

const onAuthRpSuccess = async (pin: string) => {
  localFooter.value.pinDiskon1 = pin; // Simpan pin (kita bisa pakai pin1)
  isAuthRpModalVisible.value = false;
  toast.success('Otorisasi diskon Rp berhasil.');
};

const onAuthRpCancel = async () => {
  isAuthRpModalVisible.value = false;
  await restorePreviousState();
};

const displayDiskonRp = computed(() => {
  return isDiskonRpInputFocused.value
    ? String(diskonRpInput.value)
    : formatRupiah(diskonRpInput.value);
});

const onDiskonRpInput = (val: string) => {
  if (!isDiskonRpInputFocused.value) return;
  diskonRpInput.value = Number(val.replace(/[^0-9]/g, '')) || 0;
};

const onDiskonRpFocus = () => {
  isDiskonRpInputFocused.value = true;
  handleDiskonRpFocus();
};

const onDiskonRpBlur = () => {
  isDiskonRpInputFocused.value = false;
  handleDiskonRpBlur();
};

const handleFocusDiscount1 = () => {
  if (isRestoring.value) return;
  backupCurrentState();
};

const handleFocusDiscount2 = () => {
  if (isRestoring.value) return;
  backupCurrentState();
};

// --- Simpan & Tutup ---
const saveAndClose = () => {
  // [PERBAIKAN] Update localFooter dengan nilai final
  localFooter.value.diskonRp = diskonRp.value; // Ambil dari computed
  // Reset persen jika Rp diisi
  if (diskonRpInput.value > 0) {
    localFooter.value.diskonPersen1 = 0;
    localFooter.value.diskonPersen2 = 0;
  }

  emit('update', localFooter.value);
  emit('close');
};

const cancel = () => {
  // Cukup tutup, tidak perlu kirim data
  emit('close');
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
            <v-text-field label="Biaya Kirim" v-model.number="localFooter.biayaKirim" type="number" variant="outlined"
              density="compact" hide-details class="text-end" />
          </v-col>
          <v-col cols="6">
            <v-text-field label="Disc % 1" v-model.number="localFooter.diskonPersen1" @focus="handleFocusDiscount1"
              @blur="handleDiscount1Change" type="number" variant="outlined" density="compact" hide-details
              class="text-end" />
          </v-col>

          <v-col cols="6">
            <v-text-field label="Disc % 2" v-model.number="localFooter.diskonPersen2" @focus="handleFocusDiscount2"
              @blur="handleDiscount2Change" type="number" variant="outlined" density="compact" hide-details
              class="text-end" />
          </v-col>

          <v-col cols="12">
            <v-text-field label="Diskon Rp" :model-value="displayDiskonRp" @update:model-value="onDiskonRpInput"
              @focus="onDiskonRpFocus" @blur="onDiskonRpBlur" type="text" variant="outlined" density="compact"
              hide-details class="text-end" />
          </v-col>
        </v-row>

        <v-divider class="my-4"></v-divider>

        <v-list density="compact" class="summary-list">
          <v-list-item title="Total SO (Bruto)">
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

    <AuthorizationModal ref="authModalRef" v-if="isAuthModalVisible" title="Otorisasi Diskon Faktur"
      :challenge-code="challengeCode" @close="onAuthCancel" @success="onAuthSuccess" />
    <AuthorizationModal ref="auth2ModalRef" v-if="isAuth2ModalVisible" title="Otorisasi Diskon Faktur 2"
      :challenge-code="challengeCode" @close="onAuth2Cancel" @success="onAuth2Success" />
    <AuthorizationModal ref="authRpModalRef" v-if="isAuthRpModalVisible" title="Otorisasi Diskon Faktur (Rp)"
      :challenge-code="challengeCode" @close="onAuthRpCancel" @success="onAuthRpSuccess" />
  </v-dialog>
</template>

<style scoped>
.dialog-footer {
  background-color: #f5f5f5;
  padding: 8px 12px;
}

.summary-list .v-list-item {
  padding: 0 4px !important;
  min-height: 30px;
}

.summary-list .v-list-item-title {
  font-size: 0.9rem;
}

.summary-list .summary-total {
  min-height: 40px;
}

.text-end input {
  text-align: right;
}
</style>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useToast } from 'vue-toastification';
import api from '@/services/api';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
import axios, { type AxiosError } from 'axios';

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
const isSaving = ref(false);
const isAuthModalVisible = ref(false);
const isAuth2ModalVisible = ref(false);
const challengeCode = ref('');
const previousDiscount = ref({ persen1: 0, persen2: 0 });
const authModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);
const auth2ModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);

// --- Computed Properties (Kalkulasi Lokal) ---
// Kalkulasi ini sekarang terjadi di dalam modal
const diskonRp = computed(() => {
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

const formatRupiah = (angka: number) => {
  return new Intl.NumberFormat('id-ID').format(angka || 0);
};

// --- Fungsi Otorisasi (Dipindahkan dari parent) ---

const handleDiscount1Change = async () => {
  if (!props.customer || !props.customer.level_kode) {
    return;
  }
  try {
    const response = await api.get('/so-form/lookup/default-discount', {
      params: {
        level: props.customer.level_kode,
        total: props.totalSo,
        gudang: props.gudangKode,
      }
    });
    const defaultDiscountValue = response.data.discount;
    const enteredDiscount = localFooter.value.diskonPersen1;

    if (enteredDiscount !== defaultDiscountValue && enteredDiscount > 0) {
      previousDiscount.value.persen1 = defaultDiscountValue;
      challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
      isAuthModalVisible.value = true;
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error('Gagal memvalidasi diskon standar: ' + (error.response?.data?.message || ''));
    } else {
      toast.error('Gagal memvalidasi diskon standar.');
    }
  }
};

const handleDiscount2Change = () => {
  if (localFooter.value.diskonPersen1 <= 0 && localFooter.value.diskonPersen2 > 0) {
    toast.error('Diskon % 1 silahkan diisi dulu.');
    localFooter.value.diskonPersen2 = 0;
    return;
  }
  if (localFooter.value.diskonPersen2 > 0) {
    previousDiscount.value.persen2 = 0;
    challengeCode.value = Math.floor(1000 + Math.random() * 9000).toString();
    isAuth2ModalVisible.value = true;
  }
};

const onAuthSuccess = async (pin: string) => {
  try {
    await api.post('/auth-pin/validate', { code: challengeCode.value, pin: pin });
    localFooter.value.pinDiskon1 = pin;
    isAuthModalVisible.value = false;
    toast.success('Otorisasi diskon berhasil.');
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>; // <-- Menjadi ini
    if (axiosError.response?.status === 401) {
      if (authModalRef.value) {
        authModalRef.value.setFailed(axiosError.response.data?.message || 'Otorisasi Gagal.');
      }
    } else {
      toast.error(axiosError.response?.data?.message || 'Terjadi kesalahan.');
    }
  }
};

const onAuthCancel = () => {
  isAuthModalVisible.value = false;
  localFooter.value.diskonPersen1 = previousDiscount.value.persen1;
};

const onAuth2Success = async (pin: string) => {
  try {
    await api.post('/auth-pin/validate', { code: challengeCode.value, pin: pin });
    localFooter.value.pinDiskon2 = pin;
    isAuth2ModalVisible.value = false;
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

const onAuth2Cancel = () => {
  isAuth2ModalVisible.value = false;
  localFooter.value.diskonPersen2 = previousDiscount.value.persen2;
};

// --- Simpan & Tutup ---
const saveAndClose = () => {
  // Update diskonRp berdasarkan kalkulasi terakhir
  localFooter.value.diskonRp = diskonRp.value;

  // Kirim data 'footer' yang sudah diperbarui kembali ke parent
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
            <v-text-field label="Disc % 1" v-model.number="localFooter.diskonPersen1" type="number" variant="outlined"
              density="compact" hide-details class="text-end" @blur="handleDiscount1Change" />
          </v-col>
          <v-col cols="6">
            <v-text-field label="Disc % 2" v-model.number="localFooter.diskonPersen2" type="number" variant="outlined"
              density="compact" hide-details class="text-end" @blur="handleDiscount2Change" />
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

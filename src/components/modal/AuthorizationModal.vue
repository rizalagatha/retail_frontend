<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { AxiosError } from 'axios';

const authStore = useAuthStore();

// --- Props ---
const props = defineProps<{
  title?: string;
  jenis?: string;
  nominal?: number;
  transaksi?: string;
  barcode?: string;
  keterangan?: string; // [1] Ini Info dari Parent (JANGAN DIUBAH)
  cabang?: string;
}>();

const emit = defineEmits(['close', 'success']);

// --- State ---
const step = ref<'input' | 'waiting'>('input');

// [2] UBAH NAMA VARIABEL INI (dari 'keterangan' jadi 'alasan')
const alasan = ref(''); // Ini input manual user

const authNomor = ref('');
const errorMessage = ref('');
const isSending = ref(false);
const pollingInterval = ref<ReturnType<typeof setInterval> | null>(null);

// --- Computed ---
const targetRole = computed(() => {
  return props.cabang ? `Pihak Toko ${props.cabang}` : 'Manager';
});

const isQtyType = computed(() => props.jenis === 'AMBIL_BARANG');

const labelNilai = computed(() => isQtyType.value ? 'Total Qty' : 'Nominal');

const formattedNilai = computed(() => {
  if (isQtyType.value) {
    // Format Angka Biasa + " Pcs"
    return (props.nominal || 0).toString() + ' Pcs';
  }
  // Format Rupiah
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(props.nominal || 0);
});

// --- Methods ---

const sendRequest = async () => {
  // [3] Gunakan 'alasan.value' untuk pengecekan
  if (!alasan.value.trim()) {
    errorMessage.value = 'Keterangan/Alasan wajib diisi.';
    return;
  }

  isSending.value = true;
  errorMessage.value = '';

  try {
    // [4] Gabungkan Info Barang (Props) + Alasan User (State)
    const finalKeterangan = props.keterangan
      ? `${props.keterangan}\n\nAlasan: ${alasan.value}`
      : alasan.value;

    const payload = {
      transaksi: props.transaksi,
      jenis: props.jenis,
      keterangan: finalKeterangan, // Kirim hasil gabungan
      nominal: props.nominal,
      cabang: authStore.user.cabang,
      user: authStore.user.kode,
      barcode: props.barcode,
      target_cabang: props.cabang
    };

    const response = await api.post('/auth-pin/request', payload);

    if (response.data.success) {
      authNomor.value = response.data.authNomor;
      step.value = 'waiting';
      startPolling();
    }
  } catch (err) {
    // 2. Ubah casting 'any' menjadi AxiosError dengan tipe data response yang diharapkan
    const error = err as AxiosError<{ message: string }>;

    // Sekarang TypeScript tahu bahwa 'response', 'data', dan 'message' itu valid
    errorMessage.value = error.response?.data?.message || 'Gagal mengirim permintaan.';
  } finally {
    isSending.value = false;
  }
};

const startPolling = () => {
  pollingInterval.value = setInterval(async () => {
    try {
      const response = await api.get(`/auth-pin/status/${authNomor.value}`);
      const data = response.data;

      if (data.status === 'APPROVED') {
        stopPolling();
        emit('success', { authNomor: authNomor.value, approver: data.approver });
      } else if (data.status === 'REJECTED') {
        stopPolling();
        errorMessage.value = `Permintaan ditolak oleh ${targetRole.value}.`;
        step.value = 'input';
      }
    } catch (error) {
      console.error("Gagal mengecek status otorisasi:", error);
    }
  }, 3000);
};

const stopPolling = () => {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value);
    pollingInterval.value = null;
  }
};

const handleCancel = () => {
  stopPolling();
  emit('close');
};

onUnmounted(() => {
  stopPolling();
});

const setFailed = (message: string) => {
  errorMessage.value = message;
};
defineExpose({ setFailed });
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="400px">
    <v-card>
      <v-card-title class="bg-primary text-white text-subtitle-1">
        {{ title || `Otorisasi ${targetRole}` }}
      </v-card-title>

      <v-card-text class="pt-4">
        <div v-if="step === 'input'">
          <div class="mb-4">
            <div class="d-flex justify-space-between text-caption text-grey-darken-1">
              <span>Jenis: <strong>{{ jenis }}</strong></span>
              <span v-if="nominal">
                {{ labelNilai }}: <strong>{{ formattedNilai }}</strong>
              </span>
            </div>

            <div v-if="props.keterangan" class="mt-2 pa-2 bg-grey-lighten-4 rounded text-caption">
               <div style="white-space: pre-wrap;">{{ props.keterangan }}</div>
            </div>
          </div>

          <v-textarea
            v-model="alasan"
            label="Keterangan / Alasan"
            variant="outlined" rows="3" auto-grow
            placeholder="Contoh: Barang display, reject minor, dll..."
            :error-messages="errorMessage"
            autofocus>
          </v-textarea>
        </div>

        <div v-else class="text-center py-6">
          <v-progress-circular indeterminate color="primary" size="64" class="mb-4"></v-progress-circular>
          <h3 class="text-h6 font-weight-bold">Menunggu Persetujuan...</h3>
          <p class="text-body-2 text-grey">
            Mohon tunggu, permintaan sedang dikirim ke
            <strong>{{ targetRole }}</strong>.
            <br>
            <span class="text-caption mt-2 d-block">
              ID Request: {{ authNomor }}
            </span>
          </p>
        </div>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer></v-spacer>
        <v-btn variant="text" color="grey-darken-1" @click="handleCancel">
          {{ step === 'waiting' ? 'Batalkan' : 'Tutup' }}
        </v-btn>
        <v-btn v-if="step === 'input'" color="primary" variant="flat" :loading="isSending" @click="sendRequest">
          Kirim Permintaan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

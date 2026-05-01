<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useCashierSessionStore } from "@/stores/cashierSessionStore";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "vue-toastification";
import api from "@/services/api";

interface SalesCounter {
  kode: string;
  nama: string;
}

const sessionStore = useCashierSessionStore();
const authStore = useAuthStore();
const toast = useToast();

const isSubmitting = ref(false);
const salesCounters = ref<{ kode: string; nama: string }[]>([]);
const isLoadingSc = ref(false);

const form = ref({
  kasirPengganti: null as string | null,
  pinPengganti: "",
  keterangan: "Istirahat / Sholat",
  pinUtama: "",
  saldoFisik: 0,
  kasirPenerima: null as string | null,
  pinPenerima: "",
  keteranganSelisih: "",
});

// Tarik data sales counter untuk dropdown
const fetchSalesCounters = async () => {
  isLoadingSc.value = true;
  try {
    const response = await api.get("/invoice-form/lookup/sales-counters");

    // Ambil daftar kasir selain user yang sedang login
    const filteredSc = (response.data as SalesCounter[]).filter(
      (sc) => sc.kode !== authStore.user?.kode
    );

    // [BARU] Tambahkan opsi Tutup Toko di urutan paling atas
    salesCounters.value = [
      { kode: "TUTUP_TOKO", nama: "🛑 TUTUP TOKO (END OF DAY)" },
      ...filteredSc,
    ];
  } catch (error) {
    console.error("Gagal load SC", error);
  } finally {
    isLoadingSc.value = false;
  }
};

onMounted(() => {
  fetchSalesCounters();
});

// Reset form tiap kali modal dibuka
watch(
  () => sessionStore.isHandoverModalVisible,
  (isOpen) => {
    if (isOpen) {
      form.value = {
        kasirPengganti: null,
        pinPengganti: "",
        keterangan: "Istirahat / Sholat",
        pinUtama: "",
        saldoFisik: 0,
        kasirPenerima: null,
        pinPenerima: "",
        keteranganSelisih: "",
      };
    }
  }
);

const mode = computed(() => sessionStore.handoverMode);
const sessionData = computed(() => sessionStore.session);

const formatRupiah = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

// Hitung selisih secara realtime (Blind Count)
// Saldo sistem sementara tidak ditampilkan ke user untuk mencegah kecurangan
const selisih = computed(() => {
  const sSistem = sessionData.value?.saldo_sistem || 0;
  return form.value.saldoFisik - sSistem;
});

const isSelisih = computed(() => form.value.saldoFisik > 0 && selisih.value !== 0);

const title = computed(() => {
  if (mode.value === "pause") return "Serah Terima Sementara";
  if (mode.value === "resume") return "Kembali Bertugas";
  if (mode.value === "end") return "Tutup Shift (End Session)";
  return "";
});

const colorTheme = computed(() => {
  if (mode.value === "pause") return "orange-darken-2";
  if (mode.value === "resume") return "success";
  if (mode.value === "end") return "error";
  return "primary";
});

const submit = async () => {
  isSubmitting.value = true;

  if (mode.value === "pause") {
    if (!form.value.kasirPengganti || !form.value.pinPengganti) {
      toast.warning("Kasir Pengganti dan PIN wajib diisi!");
      isSubmitting.value = false;
      return;
    }
    await sessionStore.pauseSession(
      form.value.kasirPengganti,
      form.value.pinPengganti,
      form.value.keterangan
    );
  } else if (mode.value === "resume") {
    if (!form.value.pinUtama) {
      toast.warning("PIN wajib diisi!");
      isSubmitting.value = false;
      return;
    }
    await sessionStore.resumeSession(form.value.pinUtama);
  } else if (mode.value === "end") {
    if (!form.value.kasirPenerima || !form.value.pinPenerima) {
      toast.warning("Kasir Shift Berikutnya dan PIN Penerima wajib diisi!");
      isSubmitting.value = false;
      return;
    }
    if (form.value.saldoFisik <= 0) {
      toast.warning("Saldo Fisik tidak boleh kosong atau 0.");
      isSubmitting.value = false;
      return;
    }
    if (selisih.value !== 0 && !form.value.keteranganSelisih) {
      toast.warning("Terdapat selisih saldo! Keterangan wajib diisi.");
      isSubmitting.value = false;
      return;
    }

    await sessionStore.endSession(
      form.value.kasirPenerima,
      form.value.pinPenerima,
      form.value.saldoFisik,
      form.value.keteranganSelisih
    );
  }

  isSubmitting.value = false;
};
</script>

<template>
  <v-dialog v-model="sessionStore.isHandoverModalVisible" persistent max-width="450px">
    <v-card class="rounded-lg">
      <v-toolbar :color="colorTheme" density="compact" class="px-4 text-white">
        <div class="text-subtitle-1 font-weight-bold">{{ title }}</div>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          @click="sessionStore.isHandoverModalVisible = false"
          variant="text"
          size="small"
        />
      </v-toolbar>

      <v-card-text class="pa-5">
        <template v-if="mode === 'pause'">
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4 text-caption">
            Laci akan dititipkan ke rekan Anda. Rekan pengganti wajib memasukkan PIN untuk ACC.
          </v-alert>

          <v-select
            v-model="form.kasirPengganti"
            :items="salesCounters"
            item-title="nama"
            item-value="kode"
            label="Pilih Kasir Pengganti"
            variant="outlined"
            density="compact"
            :loading="isLoadingSc"
          />

          <v-text-field
            v-model="form.pinPengganti"
            label="PIN Kasir Pengganti"
            type="password"
            variant="outlined"
            density="compact"
            placeholder="Masukkan PIN Rekan Anda"
          />

          <v-text-field
            v-model="form.keterangan"
            label="Keterangan"
            variant="outlined"
            density="compact"
            placeholder="Misal: Sholat Dzuhur"
          />
        </template>

        <template v-if="mode === 'resume'">
          <v-alert type="success" variant="tonal" density="compact" class="mb-4 text-caption">
            Laci saat ini dipegang oleh <b>{{ sessionData?.active_pengganti }}</b
            >. <br />
            Masukkan PIN Anda untuk mengambil alih kembali.
          </v-alert>

          <v-text-field
            v-model="form.pinUtama"
            label="PIN Anda (Kasir Utama)"
            type="password"
            variant="outlined"
            density="compact"
            placeholder="Masukkan PIN Anda"
            autofocus
            @keydown.enter="submit"
          />
        </template>

        <template v-if="mode === 'end'">
          <v-alert type="error" variant="tonal" density="compact" class="mb-4 text-caption">
            Serah terima laci kasir secara permanen ke Shift berikutnya. Lakukan
            <b>Penghitungan Buta (Blind Count)</b> terhadap fisik uang di laci Anda.
          </v-alert>

          <v-text-field
            v-model.number="form.saldoFisik"
            label="Total Uang Fisik di Laci (Rp)"
            type="number"
            min="0"
            variant="outlined"
            density="compact"
            class="mb-2 font-weight-bold"
          />

          <v-expand-transition>
            <div v-if="isSelisih" class="mb-3">
              <v-alert
                :type="selisih > 0 ? 'success' : 'error'"
                variant="flat"
                density="compact"
                class="text-caption mb-2 font-weight-bold text-white"
              >
                Selisih: {{ selisih > 0 ? "+" : "" }} Rp {{ formatRupiah(selisih) }}
              </v-alert>

              <v-textarea
                v-model="form.keteranganSelisih"
                label="Alasan Selisih (Wajib Diisi)"
                rows="2"
                variant="outlined"
                density="compact"
                hide-details
                placeholder="Jelaskan kenapa ada selisih uang..."
              />
            </div>
          </v-expand-transition>

          <v-divider class="my-3"></v-divider>

          <v-select
            v-model="form.kasirPenerima"
            :items="salesCounters"
            item-title="nama"
            item-value="kode"
            label="Pilih Kasir Shift Berikutnya"
            variant="outlined"
            density="compact"
            hide-details="auto"
            class="mb-3"
            :loading="isLoadingSc"
          />

          <v-text-field
            v-model="form.pinPenerima"
            :label="
              form.kasirPenerima === 'TUTUP_TOKO'
                ? 'PIN Anda (Konfirmasi Tutup Toko)'
                : 'PIN/Password Kasir Penerima'
            "
            type="password"
            autocomplete="new-password"
            variant="outlined"
            density="compact"
            hide-details
            :placeholder="
              form.kasirPenerima === 'TUTUP_TOKO' ? 'Masukkan PIN Anda' : 'Masukkan PIN Penerima'
            "
            @keydown.enter="submit"
          />
        </template>
      </v-card-text>

      <v-card-actions class="pa-4 bg-grey-lighten-5">
        <v-spacer />
        <v-btn
          variant="text"
          @click="sessionStore.isHandoverModalVisible = false"
          :disabled="isSubmitting"
          >Batal</v-btn
        >
        <v-btn
          :color="colorTheme"
          variant="flat"
          @click="submit"
          :loading="isSubmitting"
          width="100"
          >Simpan</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

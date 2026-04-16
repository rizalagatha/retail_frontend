<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import api from "@/services/api";
import { format, parseISO, subDays } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import axios from "axios";
import { useAuthStore } from "@/stores/authStore";
import { useAuthPolling } from "@/composables/useAuthPolling";

interface DraftPettyCash {
  nomor: string;
  tanggal: string;
  terpakai: number;
  keterangan: string;
  status: string;
}

const router = useRouter();
const toast = useToast();
const MENU_ID = "58"; // Sesuaikan dengan Menu ID Petty Cash Store
const { startGlobalPolling } = useAuthPolling();

const authStore = useAuthStore();
const loading = ref(true);
const isSaving = ref(false);
const draftItems = ref<DraftPettyCash[]>([]);
const form = ref({ keterangan: "" });
const isWaitingAuth = ref(false);

const filters = reactive({
  startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"), // Default 1 minggu
  endDate: format(new Date(), "yyyy-MM-dd"),
});

const totalKlaim = computed(() => {
  return draftItems.value.reduce((total, item) => total + Number(item.terpakai), 0);
});

const fetchDrafts = async () => {
  loading.value = true;
  try {
    const response = await api.get("/petty-cash/drafts-klaim", {
      params: filters,
    });
    draftItems.value = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN] Gunakan unknown
    let msg = "Gagal menarik data nota draft.";

    // Ambil pesan asli dari backend kalau ada
    if (axios.isAxiosError(error)) {
      msg = error.response?.data?.message || msg;
    }

    toast.error(msg); // [PERBAIKAN] Cuma kirim string
  } finally {
    loading.value = false;
  }
};

// --- STATE BACKGROUND POLLING ---
const pollingInterval = ref<ReturnType<typeof setInterval> | null>(null);
const isPolling = computed(() => pollingInterval.value !== null);

const handleSave = async () => {
  if (draftItems.value.length === 0) return toast.warning("Kosong.");

  isSaving.value = true;
  try {
    // 1. SUBMIT KLAIM DULU KE DATABASE (Status: SUBMITTED)
    const payloadToSubmit = {
      nomorList: draftItems.value.map((item) => item.nomor),
      keterangan: form.value.keterangan,
    };
    const submitRes = await api.post("/petty-cash/submit-klaim", payloadToSubmit);
    const generatedPckNomor = submitRes.data.pck_nomor;

    // 2. MINTA OTORISASI PAKAI NOMOR PCK
    const authPayload = {
      transaksi: generatedPckNomor,
      jenis: "KLAIM_PETTYCASH",
      keterangan: `Pengajuan Klaim Petty Cash\nTotal: ${formatRupiah(totalKlaim.value)}\nKet: ${
        form.value.keterangan || "-"
      }`,
      nominal: totalKlaim.value,
      cabang: authStore.user?.cabang,
      user: authStore.user?.kode,
      barcode: "",
      target_cabang: "",
    };
    const authResponse = await api.post("/auth-pin/request", authPayload);
    const generatedAuthNomor = authResponse.data.authNomor;

    // 3. MUNCULKAN POP-UP LOADING
    isWaitingAuth.value = true;
    toast.info("Terkirim! Proses berjalan di latar belakang, Anda bisa menutup dialog ini.");

    // 4. JALANKAN POLLING GLOBAL!
    // Kita titipkan "pesan" (callback) agar kalau kasir masih diam di halaman ini, pop-upnya nutup & datanya ke-refresh
    startGlobalPolling(generatedAuthNomor, () => {
      isWaitingAuth.value = false;
      fetchDrafts();
    });
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    toast.error(err.response?.data?.message || "Gagal memproses pengajuan.");
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  fetchDrafts();
});

// Fetch ulang data otomatis jika tanggal berubah
watch(
  () => [filters.startDate, filters.endDate],
  () => {
    fetchDrafts();
  }
);
</script>

<template>
  <PageLayout
    title="Form Pengajuan Klaim Petty Cash"
    :menu-id="MENU_ID"
    icon="mdi-text-box-plus-outline"
  >
    <template #header-actions>
      <v-btn size="small" variant="plain" prepend-icon="mdi-arrow-left" @click="router.back()"
        >Kembali</v-btn
      >
      <v-btn
        size="small"
        color="primary"
        prepend-icon="mdi-content-save-check"
        :loading="isSaving"
        :disabled="draftItems.length === 0 || isPolling"
        @click="handleSave"
      >
        {{ isPolling ? "Menunggu ACC SPV..." : "Simpan Pengajuan" }}
      </v-btn>
    </template>

    <div class="pa-4">
      <div class="form-container mb-4">
        <div class="d-flex align-center ga-3 px-4 py-2 bg-grey-lighten-4 border rounded-lg">
          <span class="font-weight-bold text-grey-darken-2" style="font-size: 11px"
            >FILTER NOTA:</span
          >

          <v-text-field
            v-model="filters.startDate"
            type="date"
            density="compact"
            variant="outlined"
            hide-details
            class="input-11px bg-white"
            style="max-width: 135px"
          />

          <span class="text-grey-darken-1" style="font-size: 11px">s/d</span>

          <v-text-field
            v-model="filters.endDate"
            type="date"
            density="compact"
            variant="outlined"
            hide-details
            class="input-11px bg-white"
            style="max-width: 135px"
          />

          <v-btn
            color="primary"
            variant="tonal"
            prepend-icon="mdi-refresh"
            @click="fetchDrafts"
            :loading="loading"
            height="32"
            class="btn-11px ms-2"
          >
            Refresh Data
          </v-btn>
        </div>
      </div>
      <div v-if="loading" class="text-center pa-10">
        <v-progress-circular indeterminate color="primary"></v-progress-circular>
        <div class="mt-3 text-caption">Menarik data nota draft...</div>
      </div>

      <div
        v-else-if="draftItems.length === 0"
        class="text-center pa-10 bg-grey-lighten-4 rounded-lg border"
      >
        <v-icon size="64" color="grey-lighten-1">mdi-inbox-remove</v-icon>
        <div class="text-h6 text-grey-darken-1 mt-4">Semua Bersih!</div>
        <div class="text-body-2 text-grey">
          Tidak ada dokumen Petty Cash berstatus DRAFT yang siap diajukan.
        </div>
      </div>

      <div v-else class="form-container">
        <v-alert type="info" variant="tonal" class="mb-4">
          <div class="d-flex justify-space-between align-center">
            <div>
              <div class="font-weight-bold">Pengumpulan Dokumen Otomatis</div>
              <div class="text-caption">
                Sistem menemukan {{ draftItems.length }} dokumen yang siap untuk digabungkan dan
                diajukan ke Supervisor.
              </div>
            </div>
            <div class="text-right">
              <div class="text-caption">Total Pengajuan:</div>
              <div class="text-h5 font-weight-black text-info">{{ formatRupiah(totalKlaim) }}</div>
            </div>
          </div>
        </v-alert>

        <div class="form-section mb-4">
          <v-textarea
            v-model="form.keterangan"
            label="Keterangan Pengajuan (Opsional)"
            placeholder="Contoh: Pengajuan klaim operasional minggu 1-2 Maret..."
            variant="outlined"
            density="compact"
            rows="2"
            hide-details
          />
        </div>

        <div class="form-section pa-0 overflow-hidden">
          <div class="bg-primary text-white pa-2 px-3 text-subtitle-2 font-weight-bold">
            Rincian Dokumen Terkait
          </div>
          <table class="w-100 detail-table">
            <thead>
              <tr class="bg-grey-lighten-3">
                <th width="50" class="text-center">NO</th>
                <th width="150">NOMOR DOKUMEN</th>
                <th width="120">TANGGAL</th>
                <th>KETERANGAN STORE</th>
                <th width="150" class="text-right">NOMINAL TERPAKAI</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in draftItems" :key="item.nomor">
                <td class="text-center">{{ index + 1 }}</td>
                <td class="font-weight-bold text-primary">{{ item.nomor }}</td>
                <td>{{ format(parseISO(item.tanggal), "dd/MM/yyyy") }}</td>
                <td>{{ item.keterangan || "-" }}</td>
                <td class="text-right font-weight-bold text-error">
                  {{ formatRupiah(item.terpakai) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <v-dialog
      v-model="isWaitingAuth"
      max-width="360px"
      persistent
      transition="dialog-bottom-transition"
    >
      <v-card class="rounded-xl overflow-hidden elevation-10 border">
        <div class="bg-blue-lighten-5 pt-8 pb-6 d-flex justify-center position-relative">
          <v-progress-circular indeterminate color="primary" size="72" width="6">
            <v-icon color="primary" size="32" class="pulse-icon">mdi-cellphone-message</v-icon>
          </v-progress-circular>
        </div>

        <v-card-text class="text-center pt-6 pb-2 px-6">
          <h3 class="text-h6 font-weight-black text-grey-darken-3 mb-2" style="line-height: 1.2">
            Menunggu ACC SPV...
          </h3>
          <p class="text-body-2 text-grey-darken-1 mb-0" style="line-height: 1.5">
            Permintaan telah masuk ke HP Supervisor.<br />
            Sistem sedang memantau persetujuan.
          </p>
        </v-card-text>

        <v-card-actions class="px-6 pb-6 pt-4 justify-center">
          <v-btn
            color="grey-darken-2"
            variant="tonal"
            block
            rounded="pill"
            height="44"
            class="text-none font-weight-bold"
            @click="isWaitingAuth = false"
          >
            Tutup (Biar Jalan di Latar)
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-container {
  max-width: 900px;
  margin: 0 auto;
}
.form-section {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: white;
  padding: 16px;
}
.detail-table {
  border-collapse: collapse;
  font-size: 12px;
}
.detail-table th,
.detail-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
  text-align: left;
}

.input-11px :deep(input) {
  font-size: 11px !important;
  padding-top: 6px !important;
  padding-bottom: 6px !important;
}

.btn-11px {
  font-size: 11px !important;
  text-transform: none !important;
  font-weight: 600;
}

.pulse-icon {
  animation: pulse-opacity 1.5s infinite ease-in-out;
}

@keyframes pulse-opacity {
  0% {
    opacity: 0.4;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
  100% {
    opacity: 0.4;
    transform: scale(0.95);
  }
}
</style>

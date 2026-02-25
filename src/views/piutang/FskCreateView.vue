<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import { isAxiosError } from "axios";
import { formatRupiah } from "@/utils/formatRupiah";

interface Detail1 {
  jenis: string;
  tgltrf: string;
  kdcus: string;
  nmcus: string;
  alamat: string;
  inv: string;
  nomor: string;
  nominal: number;
}

interface Detail2 {
  jenis: string;
  nominal: number;
  nominalv: number;
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "54";

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const totalNominalSetor = computed(() => {
  return details2.value.reduce((sum, item) => sum + (item.nominal || 0), 0);
});
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));
const isKdcUser = computed(() => authStore.user?.cabang === "KDC");
const isReadOnly = computed(() => {
  // Mode Read-Only aktif jika parameter readonly=true ATAU user berasal dari cabang KDC
  return route.query.readonly === "true" || isKdcUser.value;
});

const header = reactive({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang || "",
  dibuatOleh: authStore.user?.kode || "",
  diverifikasiOleh: "",
  tglVerifikasi: "",
});

const details1 = ref<Detail1[]>([]);
const details2 = ref<Detail2[]>([]);

const isLoading = ref(false);
const isSaving = ref(false);
const isDataLoaded = ref(false);
const isVerified = ref(false);

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const isAlreadyExists = ref(false);

// --- Konfigurasi Tabel ---
const tableHeaders1 = [
  { title: "Jenis Setoran", key: "jenis" },
  { title: "Tgl Transfer/Giro", key: "tgltrf" },
  { title: "Kd. Cus", key: "kdcus" },
  { title: "Nama Customer", key: "nmcus" },
  { title: "Alamat", key: "alamat" },
  { title: "No. Invoice", key: "inv" },
  { title: "No. Setor", key: "nomor" },
  { title: "Nominal", key: "nominal", align: "end" },
] as const;

const tableHeaders2 = [
  { title: "Jenis Setoran", key: "jenis" },
  { title: "Total Nominal Setor", key: "nominal", align: "end" },
  { title: "Nominal Verifikasi", key: "nominalv", align: "end" },
] as const;

// --- Methods ---
const loadData = async () => {
  isLoading.value = true;
  isDataLoaded.value = false;
  isAlreadyExists.value = false; // Reset status setiap load

  try {
    let response;
    if (isEditMode.value) {
      const nomor = route.params.nomor as string;
      response = await api.get(`/fsk-form/${nomor}`);
      const data = response.data;
      header.nomor = data.header.nomor;
      header.tanggal = format(parseISO(data.header.tanggal), "yyyy-MM-dd");
      header.dibuatOleh = data.header.createdBy;
      header.diverifikasiOleh = data.header.verifiedBy;
      header.tglVerifikasi = data.header.verifiedDate
        ? format(parseISO(data.header.verifiedDate), "dd-MM-yyyy")
        : "";
      isVerified.value = !!data.header.verifiedBy;
    } else {
      // Form Baru
      response = await api.get("/fsk-form/load-initial", { params: { tanggal: header.tanggal } });
    }

    details1.value = response.data.details1;
    details2.value = response.data.details2.map((d: Partial<Detail2>) => ({
      ...d,
      nominalv: d.nominalv ?? d.nominal ?? 0,
    })) as Detail2[];

    isDataLoaded.value = true;
    markAsSaved();

    if (isVerified.value) {
      toast.warning("Data ini sudah diverifikasi dan tidak bisa diubah.");
    }
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      const message = error.response?.data?.message || "";
      // CEK APAKAH ERROR KARENA SUDAH ADA FSK (Logika dari Backend yang kita buat tadi)
      if (message.includes("sudah membuat FSK")) {
        isAlreadyExists.value = true;
      }
      toast.error(message || "Gagal memuat data.");
    } else {
      toast.error("Gagal memuat data.");
    }
  } finally {
    isLoading.value = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: header,
      details1: details1.value,
      details2: details2.value,
      isNew: !isEditMode.value,
    };
    const response = await api.post("/fsk-form/save", payload);
    toast.success(response.data.message);
    markAsSaved();

    const nomorFSK = response.data.nomor;
    const url = router.resolve({ name: "FskPrint", params: { nomor: nomorFSK } }).href;
    window.open(url, "_blank");

    router.push({ name: "Fsk" });
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal menyimpan data.");
    } else {
      toast.error("Gagal menyimpan data.");
    }
  } finally {
    isSaving.value = false;
  }
};

const handleSave = () => {
  if (details1.value.length === 0) {
    return toast.error("Tidak ada data setoran untuk disimpan.");
  }
  showConfirmation(
    "Konfirmasi Simpan",
    "Anda yakin ingin menyimpan Form Setoran Kasir ini?",
    executeSave
  );
};

const handleClose = () => {
  showConfirmation(
    "Konfirmasi Tutup",
    "Data yang belum disimpan akan hilang. Yakin ingin menutup form?",
    () => {
      router.push({ name: "Fsk" });
    }
  );
};

watch(
  [details1, details2],
  () => {
    // Abaikan jika sedang loading atau saving
    if (isLoading.value || isSaving.value) return;

    // Jika data sudah dimuat dan ada isinya, set dirty
    if (isDataLoaded.value) {
      uiStore.setUnsavedChanges(true);
    }
  },
  { deep: true }
);

watch(
  () => header.tanggal,
  () => {
    if (!isEditMode.value) {
      loadData();
    }
  }
);

onMounted(() => {
  markAsSaved();

  if (!authStore.can(MENU_ID, requiredPermission.value) && !isKdcUser.value) {
    toast.error(
      `Anda tidak memiliki izin untuk ${isEditMode.value ? "mengubah" : "membuat"} data FSK.`
    );
    router.push({ name: "Fsk" });
    return;
  }
  if (isEditMode.value) {
    loadData();
  } else {
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout title="Form Setoran Kasir" desktop-mode icon="mdi-cash-multiple">
    <template #header-actions>
      <v-btn
        v-if="!isReadOnly"
        size="small"
        color="primary"
        @click="handleSave"
        :loading="isSaving"
        :disabled="!isDataLoaded || isVerified || isAlreadyExists"
        prepend-icon="mdi-content-save"
      >
        Simpan
      </v-btn>
      <v-btn size="small" @click="handleClose" prepend-icon="mdi-close">
        {{ isReadOnly ? "Tutup" : "Batal" }}
      </v-btn>
    </template>

    <v-alert
      type="warning"
      variant="tonal"
      density="compact"
      icon="mdi-alert-octagon"
      class="mb-4 text-caption mx-4 mt-2"
      border="start"
    >
      <strong>PERHATIAN (CLOSING TOKO):</strong> Pembuatan FSK hanya diperbolehkan
      <strong>1 kali per hari</strong>. Simpan FSK saat operasional toko benar-benar sudah berakhir.
      Pastikan semua Invoice, SO, dan DP hari ini sudah diinput sebelum menyimpan form ini.
    </v-alert>

    <v-alert v-if="isAlreadyExists" type="error" variant="flat" density="compact" class="mb-4 mx-4">
      Sistem mendeteksi FSK untuk tanggal ini sudah pernah dibuat. Anda tidak dapat membuat FSK
      ganda.
    </v-alert>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-text-field
            label="Nomor"
            v-model="header.nomor"
            readonly
            filled
            density="compact"
            hide-details
          >
            <template #append-inner
              ><span v-if="!isEditMode" class="text-caption">&lt;Baru&gt;</span></template
            >
          </v-text-field>
          <v-text-field
            label="Tanggal Setor"
            v-model="header.tanggal"
            type="date"
            variant="outlined"
            density="compact"
            hide-details
            :readonly="isEditMode || isReadOnly"
          />
          <v-text-field
            label="Store"
            v-model="header.cabang"
            readonly
            filled
            density="compact"
            hide-details
          />
          <v-text-field
            label="Dibuat Oleh"
            v-model="header.dibuatOleh"
            readonly
            filled
            density="compact"
            hide-details
          />
          <v-text-field
            label="Total Nominal Setor"
            :model-value="formatRupiah(totalNominalSetor)"
            readonly
            filled
            density="compact"
            hide-details
          />
          <v-text-field
            v-if="isEditMode"
            label="Diverifikasi"
            v-model="header.diverifikasiOleh"
            readonly
            filled
            density="compact"
            hide-details
          />
          <v-text-field
            v-if="isEditMode"
            label="Tgl Verifikasi"
            v-model="header.tglVerifikasi"
            readonly
            filled
            density="compact"
            hide-details
          />
        </div>
        <v-btn
          v-if="!isReadOnly"
          @click="loadData"
          :loading="isLoading"
          prepend-icon="mdi-refresh"
          color="primary"
          class="mt-4"
        >
          {{ isEditMode ? "Muat Ulang" : "Load Data Harian" }}
        </v-btn>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex: 3 1 0">
          <div class="text-subtitle-1 font-weight-bold mb-2">Rincian Setoran</div>
          <v-data-table
            :headers="tableHeaders1"
            :items="details1"
            density="compact"
            class="desktop-table fill-height-table header-blue"
            :items-per-page="-1"
            :loading="isLoading"
            fixed-header
            hover
          >
            <template #[`item.nominal`]="{ item }">
              {{ formatRupiah(item.nominal) }}
            </template>

            <template #[`item.tgltrf`]="{ item }">
              {{ item.tgltrf ? format(parseISO(item.tgltrf), "dd/MM/yyyy") : "" }}
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>

        <div class="desktop-form-section d-flex flex-column" style="flex: 1 1 0">
          <div class="text-subtitle-1 font-weight-bold mb-2">Rekapitulasi Setoran</div>
          <v-data-table
            :headers="tableHeaders2"
            :items="details2"
            density="compact"
            class="desktop-table header-blue"
            :items-per-page="-1"
            :loading="isLoading"
            fixed-header
          >
            <template #[`item.nominal`]="{ item }">
              {{ formatRupiah(item.nominal) }}
            </template>

            <template #[`item.nominalv`]="{ item }">
              {{ formatRupiah(item.nominalv) }}
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
          >
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Warna Header Biru Tua */
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  /* Biru Tua */
  color: #ffffff !important;
  /* Teks Putih */
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important;
}

.desktop-table :deep(tbody tr:hover td) {
  background-color: #f5f5f5 !important;
  /* Warna abu-abu muda saat hover */
  cursor: default;
  /* Ubah kursor jadi standar karena tidak bisa diklik */
}
</style>

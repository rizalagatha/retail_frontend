<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO, isBefore } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import type { AxiosError } from "axios";

// --- Tipe Data ---
interface Header {
  nomor: string;
  tanggal: string;
  nomorStbj: string;
  tanggalStbj: string;
  asalStbj: string;
  nomorSjGarmen: string;
  tanggalSjGarmen: string;
  nomorMutasiKps: string;
  tanggalMutasiKps: string;
  nomorMutasiKbs: string;
  tanggalMutasiKbs: string;
}
interface SummaryItem {
  spk: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  koli: number;
  keterangan: string;
}
interface AllocationItem {
  id: number;
  spk: string;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  kdc: number;
  kbs: number;
  kps: number;
  kpr: number;
  total: number;
  [key: string]: unknown; // untuk kolom tambahan jika ada
}
interface ResultItem {
  cab: string; // Store
  sj: string; // No. SJ
  terima: string; // No. Terima
  tglterima: string; // Tgl Terima
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "211";

const pageTitle = "Terima STBJ";

const header = reactive<Header>({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  nomorStbj: "",
  tanggalStbj: "",
  asalStbj: "P04", // <-- Nilai fixed
  // Field baru untuk input
  nomorSjGarmen: "",
  tanggalSjGarmen: format(new Date(), "yyyy-MM-dd"),
  nomorMutasiKps: "",
  tanggalMutasiKps: format(new Date(), "yyyy-MM-dd"),
  nomorMutasiKbs: "",
  tanggalMutasiKbs: format(new Date(), "yyyy-MM-dd"),
});
const summaryItems = ref<SummaryItem[]>([]);
const allocationItems = ref<AllocationItem[]>([]);
const resultItems = ref<ResultItem[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isLeftColumnVisible = ref(true);
const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const summaryHeaders = [
  { title: "SPK", key: "spk" },
  { title: "Nama", key: "nama" },
  { title: "Ukuran", key: "ukuran" },
  { title: "Jumlah", key: "jumlah", align: "end" },
  { title: "Koli", key: "koli", align: "end" },
  { title: "Keterangan", key: "keterangan" },
] as const;

const allocationHeaders = [
  { title: "SPK", key: "spk", width: "100px" },
  { title: "Kode Barang", key: "kode", width: "100px" },
  { title: "Nama Barang", key: "nama", minWidth: "350px" },
  { title: "Ukuran", key: "ukuran", width: "60px" },
  { title: "Jumlah", key: "jumlah", align: "end", width: "70px" },
  { title: "KDC", key: "kdc", align: "end", width: "70px" },
  { title: "KBS", key: "kbs", align: "end", width: "70px" },
  { title: "KPS", key: "kps", align: "end", width: "70px" },
  { title: "KPR", key: "kpr", align: "end", width: "70px" },
  { title: "Total Alokasi", key: "total", align: "end", width: "90px" },
] as const;

const resultHeaders = [
  { title: "Store", key: "cab" },
  { title: "No. SJ", key: "sj" },
  { title: "No. Terima", key: "terima" },
  { title: "Tgl Terima", key: "tglterima" },
] as const;

// --- Computed: Total Ringkasan Garmen ---
const totalSummary = computed(() => {
  return summaryItems.value.reduce(
    (acc, item) => {
      acc.jumlah += Number(item.jumlah) || 0;
      acc.koli += Number(item.koli) || 0;
      return acc;
    },
    { jumlah: 0, koli: 0 }
  );
});

// --- Computed: Total Alokasi Stok ---
const totalAllocation = computed(() => {
  return allocationItems.value.reduce(
    (acc, item) => {
      acc.jumlah += Number(item.jumlah) || 0;
      acc.kdc += Number(item.kdc) || 0;
      acc.kbs += Number(item.kbs) || 0;
      acc.kps += Number(item.kps) || 0;
      acc.kpr += Number(item.kpr) || 0;
      acc.total += Number(item.total) || 0;
      return acc;
    },
    { jumlah: 0, kdc: 0, kbs: 0, kps: 0, kpr: 0, total: 0 }
  );
});

const save = () => {
  if (!authStore.can(MENU_ID, "insert")) {
    return toast.error("Anda tidak memiliki hak akses untuk menyimpan data ini.");
  }

  // --- VALIDASI DARI DELPHI (btnSimpanClick) ---
  if (isBefore(new Date(header.tanggal), parseISO(header.tanggalStbj))) {
    return toast.error("Tanggal terima tidak boleh mundur dari tanggal STBJ.");
  }

  // Cek apakah ada alokasi yang melebihi jumlah STBJ
  const itemMelebihi = allocationItems.value.find((item) => item.kdc < 0);
  if (itemMelebihi) {
    return toast.error(
      `Pembagian alokasi untuk ${itemMelebihi.nama} melebihi jumlah STBJ. Tidak bisa disimpan.`
    );
  }
  // --- AKHIR VALIDASI ---

  showConfirmation(
    "Konfirmasi Simpan",
    "Anda yakin ingin menyimpan data penerimaan ini? Aksi ini akan membuat dokumen SJ dan Mutasi secara otomatis.",
    executeSave
  );
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header,
      summaryItems: summaryItems.value,
      allocationItems: allocationItems.value,
    };
    const response = await api.post("/terima-stbj-form/save", payload);
    toast.success(response.data.message);
    router.push({ name: "TerimaStbj" });
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const closeForm = () => router.push({ name: "TerimaStbj" });

onMounted(async () => {
  if (!authStore.can(MENU_ID, "view")) {
    toast.error("Anda tidak memiliki hak akses untuk membuka halaman ini.");
    return router.push("/"); // Redirect ke halaman utama
  }

  const nomorKirim = route.query.nomorKirim as string;
  if (!nomorKirim) {
    toast.error("Nomor STBJ Kirim tidak valid.");
    return router.back();
  }

  isLoading.value = true;
  try {
    const response = await api.get("/terima-stbj-form/load-from-stbj", {
      params: { nomorStbj: nomorKirim },
    });
    const data = response.data;

    header.nomorStbj = data.header.stbj_nomor;
    header.tanggalStbj = format(parseISO(data.header.stbj_tanggal), "yyyy-MM-dd");

    summaryItems.value = data.summaryItems;
    allocationItems.value = data.allocationItems.map(
      (
        item: Omit<
          AllocationItem,
          | "id"
          | "kdc"
          | "kbs"
          | "kps"
          | "kpr"
          | "k01"
          | "k02"
          | "k03"
          | "k04"
          | "k05"
          | "k06"
          | "total"
        >
      ) => ({
        ...item,
        id: Math.random(),
        kdc: 0,
        kbs: 0,
        kps: 0,
        kpr: 0,

        total: 0,
      })
    ) as AllocationItem[];
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data STBJ.");
    router.back();
  } finally {
    isLoading.value = false;
  }
});

watch(
  allocationItems,
  (newItems) => {
    newItems.forEach((item) => {
      const totalAlokasiStore = (item.kbs || 0) + (item.kps || 0) + (item.kpr || 0);
      // hapus: k01, k02, k03, k04, k05, k06
      item.total = totalAlokasiStore;
      item.kdc = (item.jumlah || 0) - totalAlokasiStore;

      if (item.kdc < 0) {
        toast.error(`Pembagian alokasi untuk ${item.nama} (${item.ukuran}) melebihi jumlah STBJ.`);
      }
    });
  },
  { deep: true }
);
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode>
    <template #header-actions>
      <v-btn
        size="small"
        :color="isLeftColumnVisible ? 'blue-grey' : 'primary'"
        :variant="isLeftColumnVisible ? 'tonal' : 'flat'"
        :prepend-icon="isLeftColumnVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
        @click="isLeftColumnVisible = !isLeftColumnVisible"
      >
        {{ isLeftColumnVisible ? "Sembunyikan Header" : "Tampilkan Header" }}
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        prepend-icon="mdi-content-save"
        color="primary"
        @click="save"
        :loading="isSaving"
      >
        Simpan
      </v-btn>
      <v-btn
        size="small"
        prepend-icon="mdi-refresh"
        @click="
          showConfirmation(
            'Konfirmasi Batal',
            'Tutup form? Perubahan yang belum disimpan akan hilang.',
            closeForm
          )
        "
      >
        Batal
      </v-btn>
    </template>

    <div class="form-grid-container" :class="{ 'hide-left': !isLeftColumnVisible }">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6">
              <v-text-field
                label="No. Terima"
                v-model="header.nomor"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. Terima"
                v-model="header.tanggal"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="6"
              ><v-text-field
                label="No. STBJ"
                v-model="header.nomorStbj"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. STBJ"
                v-model="header.tanggalStbj"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="12"
              ><v-text-field
                label="Asal STBJ"
                v-model="header.asalStbj"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="6"
              ><v-text-field
                label="No. SJ Garmen"
                v-model="header.nomorSjGarmen"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. SJ Garmen"
                v-model="header.tanggalSjGarmen"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="6"
              ><v-text-field
                label="No. Mutasi KPS"
                v-model="header.nomorMutasiKps"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. Mutasi KPS"
                v-model="header.tanggalMutasiKps"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="6"
              ><v-text-field
                label="No. Mutasi KBS"
                v-model="header.nomorMutasiKbs"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. Mutasi KBS"
                v-model="header.tanggalMutasiKbs"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1">
          <div class="text-subtitle-1 font-weight-bold mb-2">Hasil SJ / Mutasi Otomatis</div>
          <v-data-table
            :headers="resultHeaders"
            :items="resultItems"
            :loading="isLoading"
            class="desktop-table flex-grow-1"
            :items-per-page="-1"
            density="compact"
            fixed-header
          >
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="height: 35%">
          <div class="text-subtitle-1 font-weight-bold mb-2">Ringkasan dari Garmen</div>
          <v-data-table
            :headers="summaryHeaders"
            :items="summaryItems"
            :loading="isLoading"
            class="desktop-table flex-grow-1"
            :items-per-page="-1"
            density="compact"
            fixed-header
          >
            <template #[`body.append`]>
              <tr class="sticky-footer-row">
                <td colspan="3" class="text-end font-weight-bold bg-blue-lighten-5">TOTAL :</td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ totalSummary.jumlah.toLocaleString("id-ID") }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ totalSummary.koli.toLocaleString("id-ID") }}
                </td>
                <td class="bg-blue-lighten-5"></td>
              </tr>
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
        <div class="desktop-form-section d-flex flex-column" style="height: 65%">
          <div class="text-subtitle-1 font-weight-bold mb-2">Alokasi Stok ke Store</div>
          <v-data-table
            :headers="allocationHeaders"
            :items="allocationItems"
            :loading="isLoading"
            class="desktop-table flex-grow-1"
            :items-per-page="-1"
            density="compact"
            fixed-header
          >
            <template #[`item.kdc`]="{ item }">
              <div class="text-end font-weight-bold">{{ item.kdc || 0 }}</div>
            </template>
            <template #[`item.kbs`]="{ item }">
              <v-text-field
                v-model.number="item.kbs"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.kps`]="{ item }">
              <v-text-field
                v-model.number="item.kps"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.kpr`]="{ item }">
              <v-text-field
                v-model.number="item.kpr"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.total`]="{ item }">
              <div class="text-end font-weight-bold">{{ item.total || 0 }}</div>
            </template>
            <template #[`body.append`]>
              <tr class="sticky-footer-row">
                <td colspan="4" class="text-end font-weight-bold bg-blue-lighten-5">
                  TOTAL KESELURUHAN :
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ totalAllocation.jumlah.toLocaleString("id-ID") }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ totalAllocation.kdc.toLocaleString("id-ID") }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ totalAllocation.kbs.toLocaleString("id-ID") }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ totalAllocation.kps.toLocaleString("id-ID") }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ totalAllocation.kpr.toLocaleString("id-ID") }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ totalAllocation.total.toLocaleString("id-ID") }}
                </td>
              </tr>
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
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.desktop-table :deep(td) {
  font-size: 11px !important;
  white-space: nowrap;
  /* ✅ Memaksa semua kolom 1 baris */
  overflow: hidden;
  text-overflow: ellipsis;
  /* Tambahkan titik-titik jika terlalu panjang */
}

/* Khusus kolom Nama Barang agar tetap terlihat jelas */
.desktop-table :deep(.text-start) {
  white-space: nowrap !important;
}

/* Mengatur input field di dalam tabel agar lebih ramping */
.desktop-table :deep(.v-field__input) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  min-height: 24px !important;
  font-size: 11px !important;
}

.form-grid-container {
  display: grid;
  grid-template-columns: 25% 1fr;
  gap: 16px;
  padding: 16px;
  height: calc(100vh - 120px);
  transition: grid-template-columns 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.form-grid-container.hide-left {
  grid-template-columns: 0px 1fr;
}

.left-column {
  overflow: hidden;
  transition: opacity 0.25s ease, visibility 0.25s ease, transform 0.35s ease;
  transform-origin: left center;
}

.form-grid-container.hide-left .left-column {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  width: 0;
  padding: 0;
  transform: translateX(-20px);
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  /* Penting untuk scrolling */
}

.desktop-form-section {
  background-color: #fff;
  padding: 10px 12px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
}

.header-section {
  flex-shrink: 0;
  /* Header tidak akan menyusut */
}

/* Membuat tabel di dalam section bisa scroll */
.desktop-table {
  flex-grow: 1;
  overflow-y: auto;
}

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
  /* Supaya lebih rapi */
}

/* --- Sticky Footer Row --- */
.sticky-footer-row td {
  position: sticky;
  bottom: 0;
  z-index: 3;
  border-top: 2px solid #1976d2 !important;
  border-bottom: none !important;
  height: 36px !important;
}
</style>

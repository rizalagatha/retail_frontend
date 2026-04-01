<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
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
  nomorRb: string;
  tanggalRb: string;
  gudangAsalKode: string;
  gudangAsalNama: string;
  keterangan: string;
}
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  barcode: string;
  jumlahKirim: number; // Jumlah Kirim
  terima: number; // Jumlah Terima
  selisih: number;
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "214";

const pageTitle = computed(() => (isEditMode.value ? "Ubah Terima Retur" : "Buat Terima Retur"));
const isEditMode = computed(() => !!route.params.nomor);

const header = reactive<Header>({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  nomorRb: "",
  tanggalRb: "",
  gudangAsalKode: "",
  gudangAsalNama: "",
  keterangan: "",
});
const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const items = ref<Item[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const scannedBarcode = ref("");

const tableHeaders = [
  { title: "Kode Barang", key: "kode", width: "200px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "100px" },
  { title: "Jumlah Kirim", key: "jumlahKirim", align: "end", width: "120px" },
  { title: "Jumlah Terima", key: "terima", align: "end", width: "150px" },
  { title: "Selisih", key: "selisih", align: "end", width: "100px" },
] as const;

// --- Methods ---
const calculateSelisih = (item: Item) => {
  // Pastikan menggunakan 'jumlahKirim' sebagai pengurang, bukan 'jumlah'
  item.selisih = (item.terima || 0) - (item.jumlahKirim || 0);
};

const handleBarcodeScan = () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  const itemFound = items.value.find((item) => item.barcode === barcode);
  if (itemFound) {
    const newQty = (itemFound.terima || 0) + 1;

    if (newQty > itemFound.jumlahKirim) {
      // <-- ganti 'jumlah' jadi 'jumlahKirim'
      toast.error("Jumlah terima melebihi jumlah kirim.");
    } else {
      itemFound.terima = newQty;
      calculateSelisih(itemFound);
      toast.info(`Jumlah terima untuk ${itemFound.nama} ditambah.`);
    }
  } else {
    toast.warning("Barcode tidak ditemukan dalam daftar retur ini.");
  }

  scannedBarcode.value = "";
};

const save = () => {
  if (!authStore.can(MENU_ID, "insert")) {
    return toast.error("Anda tidak memiliki hak akses untuk menyimpan data ini.");
  }

  const tglTerima = new Date(header.tanggal);
  const tglKirim = parseISO(header.tanggalRb);
  if (isBefore(tglTerima, tglKirim))
    return toast.error("Tanggal terima tidak boleh mundur dari tanggal kirim.");

  showConfirmation(
    "Konfirmasi Simpan",
    "Anda yakin ingin menyimpan data penerimaan ini?",
    executeSave
  );
};

const executeSave = async () => {
  isSaving.value = true;
  const payload = {
    header,
    items: items.value.filter((i) => (i.terima || 0) > 0),
  };
  try {
    const response = await api.post("/terima-retur-form/save", payload);
    toast.success(response.data.message);
    router.push({ name: "TerimaRetur" });
  } catch (error: unknown) {
    let message = "Gagal menyimpan data.";
    if ((error as AxiosError).isAxiosError) {
      const axiosError = error as AxiosError<{ message: string }>;
      message = axiosError.response?.data?.message || message;
    }
    toast.error(message);
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

const closeForm = () => {
  router.push({ name: "TerimaRetur" });
};

// Logika untuk tombol Batal (di Delphi "Batal" = "Tutup")
const handleCancel = () => {
  showConfirmation(
    "Konfirmasi Batal",
    "Tutup form? Perubahan yang belum disimpan akan hilang.",
    closeForm
  );
};

// Logika untuk tombol Tutup (jika Anda ingin menambahkannya)
const handleClose = () => {
  showConfirmation(
    "Konfirmasi Tutup",
    "Tutup form? Perubahan yang belum disimpan akan hilang.",
    closeForm
  );
};

onMounted(async () => {
  if (!authStore.can(MENU_ID, "view")) {
    toast.error("Anda tidak memiliki hak akses untuk membuka halaman ini.");
    return router.push("/"); // Redirect ke halaman utama jika tidak ada akses
  }

  const nomorKirim = route.query.nomorKirim as string;
  if (!nomorKirim && !isEditMode.value) {
    toast.error("Nomor Retur Kirim tidak valid.");
    return router.back();
  }

  try {
    let response;
    if (isEditMode.value) {
      // Panggil endpoint getForEdit jika sudah dibuat
      // response = await api.get(`/terima-retur-form/${route.params.nomor}`);
    } else {
      response = await api.get(`/terima-retur-form/load-from-kirim/${nomorKirim}`);
    }
    const data = response.data;
    Object.assign(header, data.header);
    items.value = data.items.map((item: Item) => ({
      ...item,
      id: Date.now() + Math.random(),
      terima: item.jumlahKirim,
      selisih: 0,
    }));
  } catch (error: unknown) {
    let message = "Gagal memuat data.";
    if ((error as AxiosError).isAxiosError) {
      const axiosError = error as AxiosError<{ message?: string }>;
      message = axiosError.response?.data?.message || message;
    }
    toast.error(message);
    router.back();
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-package-check">
    <template #header-actions>
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
      <v-btn size="small" prepend-icon="mdi-refresh" @click="handleCancel">Batal</v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="handleClose">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12"
              ><v-text-field
                label="No. Terima"
                v-model="header.nomor"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Tgl. Terima"
                v-model="header.tanggal"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="No. Kirim (RB)"
                v-model="header.nomorRb"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Dari Gudang"
                v-model="header.gudangAsalNama"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-textarea
                label="Keterangan"
                v-model="header.keterangan"
                readonly
                filled
                rows="3"
                density="compact"
                hide-details
            /></v-col>
          </v-row>
        </div>
      </div>
      <div class="right-column">
        <div class="scanner-wrapper mb-4">
          <v-text-field
            v-model="scannedBarcode"
            label="Scan Barcode..."
            variant="outlined"
            density="compact"
            prepend-inner-icon="mdi-barcode-scan"
            hide-details
            clearable
            @keydown.enter.prevent="handleBarcodeScan"
          />
        </div>
        <div class="desktop-form-section d-flex flex-column fill-height">
          <v-data-table
            :headers="tableHeaders"
            :items="items"
            :loading="isLoading"
            class="desktop-table fill-height-table"
            fixed-header
            :items-per-page="-1"
          >
            <template #[`item.terima`]="{ item }">
              <v-text-field
                v-model.number="item.terima"
                type="number"
                variant="underlined"
                class="text-end"
                @update:model-value="calculateSelisih(item)"
                :max="item.jumlahKirim"
                min="0"
                density="compact"
                hide-details
              />
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
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important; /* Biru Tua */
  color: #ffffff !important; /* Teks Putih */
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important; /* Supaya lebih rapi */
}
</style>

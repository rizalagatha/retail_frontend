<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import type { AxiosError } from "axios";

// --- Tipe Data & State ---
interface Item {
  no: string;
  aktif: boolean;
  ukuran: string;
  hpp: number;
  harga: number;
  barcode: string;
  old: "Y" | "N";
}
interface Detail {
  brgd_ukuran: string;
  brgd_hpp: number;
  brgd_harga: number;
  brgd_barcode: string;
}
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "219";

const isEditMode = computed(() => !!route.params.kode);
const pageTitle = computed(() =>
  isEditMode.value ? "Ubah Barang External" : "Buat Barang External"
);
const canView = computed(() => authStore.can(MENU_ID, "view"));
const canInsert = computed(() => authStore.can(MENU_ID, "insert"));
const canEdit = computed(() => authStore.can(MENU_ID, "edit"));
const canSave = computed(() => (isEditMode.value ? canEdit.value : canInsert.value));
const isLoading = ref(true);
const isSaving = ref(false);
const isLoadingBarcode = ref(false);
const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
  onCancel: () => {
    dialogConfirm.show = false;
  }, // Tambahkan onCancel
});

const header = reactive({
  kode: "",
  date_create: format(new Date(), "yyyy-MM-dd"),
  brg_ktgp: "",
  brg_ktg: "",
  nama: "",
  bahan: "",
  brg_aktif: 0, // 0 = Aktif
  brg_bcdid: "0",
  imageUrl: null as string | null,
});
const items = ref<Item[]>([]);
const selectedFile = ref<File | null>(null);

// Opsi untuk filter
const kategoriOptions = ref<string[]>([]);
const ktgProdukOptions = ref<string[]>([]);
const hppPercentage = ref(0);

const headers = [
  { title: "No.", key: "no", width: "50px" },
  { title: "Aktif", key: "aktif", width: "80px" },
  { title: "Ukuran", key: "ukuran", width: "150px" },
  { title: "HPP", key: "hpp", width: "150px" },
  { title: "Harga Jual Retail", key: "harga", width: "150px" },
  { title: "Barcode", key: "barcode", width: "200px" },
];

// --- Methods ---
const loadInitialData = async () => {
  try {
    const response = await api.get("/barang-external-form/initial-data");
    kategoriOptions.value = response.data.kategoriOptions;
    ktgProdukOptions.value = response.data.ktgProdukOptions;
    hppPercentage.value = response.data.hppPercentage;
    if (kategoriOptions.value.length > 0) {
      header.brg_ktg = kategoriOptions.value[0];
    }
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat data awal.");
  }
};

const loadUkuran = async () => {
  try {
    const response = await api.get(`/barang-external-form/ukuran-options/${header.brg_ktg}`);
    items.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat daftar ukuran.");
  }
};

const loadDataForEdit = async (kode: string) => {
  try {
    const response = await api.get(`/barang-external-form/${kode}`);
    Object.assign(header, response.data.header);
    header.nama = response.data.header.brg_warna;
    header.bahan = response.data.header.brg_bahan;
    header.date_create = format(parseISO(response.data.header.date_create), "yyyy-MM-dd");

    await loadUkuran(); // Muat template ukuran

    // Ceklis dan isi data yang sudah ada
    response.data.details.forEach((detail: Detail) => {
      const item = items.value.find((i) => i.ukuran === detail.brgd_ukuran);
      if (item) {
        item.aktif = true;
        item.hpp = detail.brgd_hpp;
        item.harga = detail.brgd_harga;
        item.barcode = detail.brgd_barcode;
        item.old = "Y";
      }
    });
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data.");
  }
};

const onFileSelect = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    if (file.size > 1000000) {
      // 1MB
      toast.error("Ukuran gambar tidak boleh > 1 Mb.");
      return;
    }
    selectedFile.value = file;
    header.imageUrl = URL.createObjectURL(file);
  }
};
const clearImage = () => {
  selectedFile.value = null;
  header.imageUrl = null;
};

const resetForm = () => {
  // Reset header ke nilai default (mode Baru)
  header.kode = "";
  header.date_create = format(new Date(), "yyyy-MM-dd");
  header.brg_ktgp = ktgProdukOptions.value[0] || "";
  header.brg_ktg = kategoriOptions.value[0] || "";
  header.nama = "";
  header.bahan = "";
  header.brg_aktif = 0;
  header.brg_bcdid = "0";
  header.imageUrl = "";
  selectedFile.value = null;

  // Muat ulang ukuran
  loadUkuran();
};

const save = () => {
  if (!canSave.value) {
    toast.error("Anda tidak memiliki izin untuk menyimpan data ini.");
    return;
  }
  // Validasi
  if (!header.brg_ktgp) return toast.error("Kategori produk belum dipilih.");
  if (!header.nama) return toast.error("Nama barang harus diisi.");
  if (!items.value.some((i) => i.aktif)) return toast.error("Ukuran belum dipilih.");

  showConfirmation("Konfirmasi Simpan", "Yakin ingin simpan?", executeSave);
};

const executeSave = async () => {
  if (!canSave.value) {
    toast.error("Anda tidak memiliki izin untuk menyimpan data ini.");
    isSaving.value = false; // Pastikan loading dihentikan
    return;
  }
  isSaving.value = true;
  const formData = new FormData();
  const payload = {
    header: {
      ...header,
      brg_aktif: header.brg_aktif === 0 ? 0 : 1, // Konversi radio
    },
    items: items.value.filter((i) => i.aktif),
  };
  formData.append("data", JSON.stringify(payload));
  if (selectedFile.value) {
    formData.append("file", selectedFile.value);
  }

  try {
    const response = isEditMode.value
      ? await api.put(`/barang-external-form/${route.params.kode}`, formData)
      : await api.post("/barang-external-form", formData);

    toast.success(response.data.message);
    router.push({ name: "BarangExternal" });
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const showConfirmation = (
  title: string,
  text: string,
  onConfirm: () => void,
  onCancel?: () => void
) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = () => {
    onConfirm();
    dialogConfirm.show = false;
  };
  dialogConfirm.onCancel = () => {
    if (onCancel) onCancel();
    dialogConfirm.show = false;
  };
  dialogConfirm.show = true;
};

const handleBatal = () => {
  const action = isEditMode.value ? "memuat ulang" : "membersihkan";
  showConfirmation(
    "Konfirmasi Batal",
    `Yakin ingin membatalkan? Semua perubahan yang belum disimpan akan ${action} form.`,
    () => {
      // onConfirm
      if (isEditMode.value) {
        loadDataForEdit(route.params.kode as string); // Muat ulang data asli
      } else {
        resetForm(); // Reset ke form baru
      }
    }
  );
};

const handleTutup = () => {
  showConfirmation(
    "Konfirmasi Tutup",
    "Tutup form? Perubahan yang belum disimpan akan hilang.",
    () => {
      // onConfirm
      router.back();
    }
  );
};

// Hitung HPP otomatis
const updateHpp = (item: Item) => {
  item.hpp = (hppPercentage.value / 100) * item.harga;
};

const generateBarcode = (date: string, barcodeId: string, kodeUkuran: string): string => {
  console.log("generateBarcode params:", { date, barcodeId, kodeUkuran });

  if (!barcodeId || barcodeId === "0" || !kodeUkuran) {
    console.warn("Invalid params for generateBarcode");
    return "";
  }

  const ayy = format(new Date(date), "yy");
  const bcdIdNum = parseInt(barcodeId, 10);

  if (isNaN(bcdIdNum)) {
    console.error("barcodeId is not a number:", barcodeId);
    return "";
  }

  // Format: 10000 + id, ambil 4 digit terakhir
  const xid = String(10000 + bcdIdNum).slice(-4);
  const result = `${ayy}${xid}${kodeUkuran}`;

  console.log("Generated barcode:", result);
  return result;
};

const onAktifChanged = async (item: Item) => {
  if (!header.brg_ktg) {
    toast.error("Pilih kategori barang dulu sebelum aktifkan ukuran.");
    item.aktif = false;
    return;
  }

  if (!item.aktif) return;

  // Jangan generate ulang jika data lama
  if (item.old === "Y" && item.barcode) return;

  isLoadingBarcode.value = true;
  try {
    // Pastikan ID barcode sudah ada atau buat baru
    if (!header.brg_bcdid || header.brg_bcdid === "0") {
      const response = await api.get("/barang-external-form/get-new-barcode-id", {
        params: { date: header.date_create },
      });

      console.log("Response:", response.data); // Debug

      // Pastikan newId adalah number
      if (response?.data?.newId && typeof response.data.newId === "number") {
        header.brg_bcdid = String(response.data.newId);
        console.log("Set brg_bcdid to:", header.brg_bcdid);
        await nextTick();
      } else {
        throw new Error(`Invalid newId: ${JSON.stringify(response.data)}`);
      }
    }

    // Pastikan brg_bcdid valid sebelum generate barcode
    const bcdId = parseInt(header.brg_bcdid, 10);
    if (isNaN(bcdId)) {
      throw new Error(`Invalid brg_bcdid: ${header.brg_bcdid}`);
    }

    // Generate barcode
    item.barcode = generateBarcode(header.date_create, header.brg_bcdid, item.no);
    console.log("Generated barcode:", item.barcode);
    item.old = "N";
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    console.error("Error in onAktifChanged:", err);

    const message =
      err.response?.data?.message ||
      (err.message ? err.message : "Terjadi kesalahan saat membuat barcode.");

    toast.error("Gagal membuat barcode: " + message);
    item.aktif = false;
  } finally {
    isLoadingBarcode.value = false;
  }
};

onMounted(async () => {
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading
    toast.error("Anda tidak memiliki izin untuk mengakses halaman ini.");
    // Opsional: Redirect atau tampilkan pesan akses ditolak di template
    // router.replace({ name: 'Forbidden' }); // Contoh redirect
    return; // Hentikan eksekusi onMounted lebih lanjut
  }
  isLoading.value = true;
  try {
    // Muat opsi awal (kategori, dll)
    await loadInitialData();

    const kode = route.params.kode as string | undefined;

    if (kode) {
      // Mode edit: muat data; tangkap 404 supaya tidak uncaught
      try {
        await loadDataForEdit(kode);
      } catch (error) {
        const err = error as AxiosError<{ message?: string }>;

        const message =
          err.response?.data?.message ||
          (err.message ? err.message : "Kode barang external tidak ditemukan.");

        toast.error(message);
        // optional: redirect atau stop further actions
        // router.push({ name: 'BarangExternal' });
      }
    } else {
      // Mode baru: muat ukuran dan coba auto-generate barcode id (jika endpoint ada)
      try {
        await loadUkuran();

        // Coba generate barcode id otomatis, tapi bungkus supaya tidak crash kalau endpoint 404/500
        try {
          const response = await api.get("/barang-external-form/get-new-barcode-id", {
            params: { date: header.date_create },
          });
          // Pastikan response valid sebelum assign
          if (response?.data?.newId !== undefined) {
            header.brg_bcdid = String(response.data.newId);
          } else {
            console.warn("get-new-barcode-id returned no newId:", response);
          }
        } catch (error) {
          const err = error as AxiosError;
          console.warn("Auto-generate barcode ID failed:", err.response?.status, err.message);
          toast.info("Barcode ID otomatis tidak tersedia — isi manual jika diperlukan.");
          // tetap lanjut, user bisa centang dan memicu generation via checkbox
        }
      } catch (err) {
        toast.error("Gagal memuat daftar ukuran.");
        console.error(err);
      }
    }
  } catch (err) {
    toast.error("Gagal memuat data awal.");
    console.error(err);
  } finally {
    isLoading.value = false;
  }
});

watch(
  () => header.brg_ktg,
  () => {
    if (!isLoading.value) loadUkuran(); // Muat ulang ukuran jika kategori ganti
  }
);
</script>

<template>
  <PageLayout :title="pageTitle" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="canSave"
        color="primary"
        size="small"
        @click="save"
        :loading="isSaving"
        prepend-icon="mdi-content-save"
      >
        Simpan
      </v-btn>
      <v-btn size="small" @click="handleBatal" prepend-icon="mdi-refresh"> Batal </v-btn>
      <v-btn size="small" @click="handleTutup" prepend-icon="mdi-close"> Tutup </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="hide-details">
            <v-col cols="6"
              ><v-text-field label="Kode" v-model="header.kode" readonly filled density="compact"
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Date Create"
                v-model="header.date_create"
                type="date"
                readonly
                filled
                density="compact"
            /></v-col>

            <v-col cols="12"
              ><v-select
                label="Kategori Produk"
                v-model="header.brg_ktgp"
                :items="ktgProdukOptions"
                variant="outlined"
                density="compact"
            /></v-col>
            <v-col cols="12"
              ><v-select
                label="Kategori Barang"
                v-model="header.brg_ktg"
                :items="kategoriOptions"
                variant="outlined"
                density="compact"
                :readonly="isEditMode"
            /></v-col>

            <v-col cols="12"
              ><v-text-field
                label="Nama Barang"
                v-model="header.nama"
                variant="outlined"
                density="compact"
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Bahan"
                v-model="header.bahan"
                variant="outlined"
                density="compact"
            /></v-col>

            <v-col cols="12"
              ><v-radio-group v-model="header.brg_aktif" inline label="Status" density="compact">
                <v-radio label="Aktif" :value="0" />
                <v-radio label="Pasif" :value="1" /> </v-radio-group
            ></v-col>

            <v-col cols="12"
              ><v-text-field
                label="ID Barcode"
                v-model="header.brg_bcdid"
                variant="outlined"
                density="compact"
            /></v-col>

            <v-col cols="12">
              <v-img
                v-if="header.imageUrl"
                :src="header.imageUrl"
                height="150"
                contain
                class="border"
              />
              <div
                v-else
                class="border d-flex align-center justify-center"
                style="height: 150px; background-color: #f5f5f5"
              >
                (No Image)
              </div>
              <v-file-input
                label="Upload Gambar (Max 1MB)"
                @change="onFileSelect"
                variant="underlined"
                density="compact"
                clearable
                @click:clear="clearImage"
              />
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1">
          <v-data-table
            :headers="headers"
            :items="items"
            :loading="isLoading || isLoadingBarcode"
            class="desktop-table fill-height"
            density="compact"
            fixed-header
            :items-per-page="-1"
          >
            <template #[`item.aktif`]="{ item }">
              <v-checkbox-btn
                v-model="item.aktif"
                density="compact"
                hide-details
                @update:modelValue="() => onAktifChanged(item)"
              />
            </template>
            <template #[`item.hpp`]="{ item }">
              <v-text-field
                v-model.number="item.hpp"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.harga`]="{ item }">
              <v-text-field
                v-model.number="item.harga"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
                @update:modelValue="updateHpp(item)"
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
          <v-spacer />
          <v-btn text @click="dialogConfirm.onCancel">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* (Salin style dari MutasiAntarGudangFormView, tambahkan .hide-details) */
.hide-details :deep(.v-input__details) {
  display: none;
}

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

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import StoreSearchModal from "@/components/lookup/StoreSearchModal.vue";
import SoSearchModal from "@/components/lookup/SoSearchModal.vue";
import type { AxiosError } from "axios";
import type { DataTableHeader } from "vuetify";

// --- Tipe Data ---
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  barcode: string;
  jumlahSo?: number;
}

interface ItemResponse {
  kode: string;
  nama: string;
  ukuran: string;
  stok?: number;
  jumlah?: number;
  barcode?: string;
}

// --- Inisialisasi ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "803";

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? "Ubah Surat Jalan Workshop ke Store" : "Buat Surat Jalan Workshop ke Store"
);
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));

const isLoading = ref(true);
const isSaving = ref(false);

const header = reactive({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  store: { kode: "", nama: "" },
  soNomor: "",
  keterangan: "",
});

const items = ref<Item[]>([]);
const scannedBarcode = ref("");
const isLeftColumnVisible = ref(true);
const printConfirmNomor = ref("");
const isPrintConfirmVisible = ref(false);

// Modal states
const dialog = reactive({
  storeSearch: false,
  soSearch: false,
  confirm: false,
});

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

// --- Konfigurasi Tabel ---
const tableHeaders: DataTableHeader[] = [
  { title: "Kode Barang", key: "kode", width: "160px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "100px", align: "center" },
  { title: "Stok Workshop", key: "stok", align: "end", width: "120px" },
  { title: "Qty SO", key: "jumlahSo", align: "end", width: "80px" },
  { title: "Jumlah Kirim", key: "jumlah", align: "end", width: "120px" },
  { title: "Barcode", key: "barcode", width: "150px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
];

// --- Methods ---
const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now() + Math.random(),
      kode: "",
      nama: "",
      ukuran: "",
      stok: 0,
      jumlah: 0,
      barcode: "",
      jumlahSo: 0,
    });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter((item) => item.id !== id);
  if (items.value.length === 0) addNewRow();
};

const handleBarcodeScan = async () => {
  const barcode = scannedBarcode.value?.trim();
  const gudangAsal = authStore.user?.cabang;

  if (!barcode) return;
  if (!gudangAsal) {
    toast.error("Gudang workshop asal tidak terdefinisi!");
    return;
  }

  const existingItem = items.value.find((item) => item.barcode === barcode && item.kode);
  if (existingItem) {
    const maxQty = existingItem.jumlahSo ?? Infinity; // Infinity jika baris manual (tanpa SO)
    if (existingItem.jumlah >= maxQty) {
      toast.warning(
        `Jumlah ${existingItem.nama} (${existingItem.ukuran}) sudah mencapai batas SO (${maxQty}).`
      );
      scannedBarcode.value = "";
      return;
    }
    existingItem.jumlah += 1;
    toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
    scannedBarcode.value = "";
    return;
  }

  try {
    const response = await api.get(`/operasional/workshop/sj-workshop-form/by-barcode/${barcode}`, {
      params: { gudang: gudangAsal },
    });

    const product = response.data;

    // Cek apakah barcode ini ada di list SO
    const soItem = items.value.find(
      (item) =>
        item.barcode === product.barcode &&
        item.kode === product.kode &&
        item.ukuran === product.ukuran
    );

    if (soItem) {
      // Barang dari SO — increment dengan validasi
      const maxQty = soItem.jumlahSo ?? Infinity;
      if (soItem.jumlah >= maxQty) {
        toast.warning(
          `Jumlah ${soItem.nama} (${soItem.ukuran}) sudah mencapai batas SO (${maxQty}).`
        );
        scannedBarcode.value = "";
        return;
      }
      soItem.jumlah += 1;
      toast.success(`${soItem.nama} (${soItem.ukuran}): ${soItem.jumlah}/${maxQty}`);
      scannedBarcode.value = "";
      return;
    }

    // Barang baru (bukan dari SO) — tambah ke baris kosong
    const emptyRowIndex = items.value.findIndex((item) => !item.kode);
    if (emptyRowIndex !== -1) {
      items.value.splice(emptyRowIndex, 1, {
        id: Date.now() + Math.random(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: Number(product.stok || 0),
        jumlah: 1,
        barcode: product.barcode,
        jumlahSo: 0, // baris manual, tidak ada batas SO
      });
      addNewRow();
    } else {
      toast.error("Tidak ada baris kosong di tabel.");
    }
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Barcode tidak ditemukan.");
  } finally {
    scannedBarcode.value = "";
  }
};

const onSoSelected = async (so: { Nomor: string }) => {
  header.soNomor = so.Nomor;
  dialog.soSearch = false;

  // Load barang dari SO, jumlah = 0 (wajib scan)
  try {
    const res = await api.get("/operasional/workshop/sj-workshop-form/lookup/items-from-so", {
      params: { soNomor: so.Nomor, gudang: authStore.user?.cabang || "" },
    });

    // Set items dengan jumlah 0 — harus scan barcode
    items.value = res.data.map(
      (item: {
        kode: string;
        barcode: string;
        nama: string;
        ukuran: string;
        stok: number;
        jumlahSo: number;
      }) => ({
        id: Date.now() + Math.random(),
        kode: item.kode,
        barcode: item.barcode,
        nama: item.nama,
        ukuran: item.ukuran,
        stok: item.stok,
        jumlahSo: item.jumlahSo, // referensi qty SO
        jumlah: 0, // ← wajib 0, isi lewat scan
      })
    );

    addNewRow();
    toast.info(
      `${res.data.length} item dari SO ${so.Nomor} dimuat. Silakan scan barcode untuk mengisi jumlah.`
    );
  } catch {
    toast.error("Gagal memuat item dari SO.");
  }
};

const onStoreSelected = (store: { kode: string; nama: string }) => {
  header.store = store;
  dialog.storeSearch = false;
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const executeSave = async () => {
  const validItems = items.value.filter((i) => i.kode && i.jumlah > 0);
  isSaving.value = true;
  try {
    const payload = { header, items: validItems, isNew: !isEditMode.value };
    const response = await api.post("/operasional/workshop/sj-workshop-form/save", payload);
    toast.success(response.data.message);

    // Tampilkan dialog cetak
    printConfirmNomor.value = response.data.nomor;
    isPrintConfirmVisible.value = true;
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const handleSave = () => {
  if (!header.store.kode) return toast.error("Store tujuan harus diisi.");

  const today = format(new Date(), "yyyy-MM-dd");
  if (!isEditMode.value && header.tanggal !== today) {
    return toast.error(`Tanggal Surat Jalan harus hari ini (${today}).`);
  }

  const validItems = items.value.filter((i) => i.kode && i.jumlah > 0);
  if (validItems.length === 0)
    return toast.error("Detail barang kiriman harus diisi minimal 1 item.");

  showConfirmation(
    "Konfirmasi Simpan",
    "Apakah Anda yakin ingin menyimpan Surat Jalan ini?",
    executeSave
  );
};

const handlePrintConfirm = () => {
  const routeData = router.resolve({
    name: "SjWorkshopPrint",
    params: { nomor: printConfirmNomor.value },
  });
  window.open(routeData.href, "_blank");
  isPrintConfirmVisible.value = false;
  router.push({ name: "SjWorkshop" });
};

const handlePrintCancel = () => {
  isPrintConfirmVisible.value = false;
  router.push({ name: "SjWorkshop" });
};

const resetForm = () => {
  Object.assign(header, {
    nomor: "",
    tanggal: format(new Date(), "yyyy-MM-dd"),
    store: { kode: "", nama: "" },
    soNomor: "", // ← tambah
    keterangan: "",
  });
  items.value = [];
  addNewRow();
  toast.info("Formulir dibersihkan.");
};

const handleCancel = () => {
  showConfirmation(
    "Konfirmasi Batal",
    "Data inputan yang belum disimpan akan hilang. Lanjutkan?",
    resetForm
  );
};

const handleClose = () => {
  showConfirmation("Konfirmasi Tutup", "Tutup form dan kembali ke halaman browse?", () =>
    router.push({ name: "SjWorkshop" })
  );
};

onMounted(async () => {
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error("Anda tidak memiliki hak akses untuk halaman ini.");
    router.push({ name: "SjWorkshop" });
    return;
  }

  if (isEditMode.value) {
    const nomor = route.params.nomor as string;
    try {
      const response = await api.get(`/operasional/workshop/sj-workshop-form/${nomor}`);
      const data = response.data;
      header.nomor = data.header.nomor;
      header.tanggal = format(new Date(data.header.tanggal), "yyyy-MM-dd");
      header.store = { kode: data.header.store_kode, nama: data.header.store_nama };
      header.soNomor = data.header.soNomor || "";
      header.keterangan = data.header.keterangan;

      items.value = data.items.map((item: ItemResponse) => ({
        id: Date.now() + Math.random(),
        kode: item.kode,
        nama: item.nama,
        ukuran: item.ukuran,
        stok: Number(item.stok || 0),
        jumlah: Number(item.jumlah || 0),
        barcode: item.barcode || "",
      }));
    } catch {
      toast.error("Gagal memuat data Surat Jalan.");
      router.back();
    }
  }
  addNewRow();
  isLoading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-truck-fast-outline">
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
        size="small"
        color="primary"
        @click="handleSave"
        :loading="isSaving"
        prepend-icon="mdi-content-save"
        :disabled="!authStore.can(MENU_ID, requiredPermission)"
      >
        Simpan
      </v-btn>
      <v-btn size="small" @click="handleCancel" prepend-icon="mdi-refresh"> Batal </v-btn>
      <v-btn size="small" @click="handleClose" prepend-icon="mdi-close"> Tutup </v-btn>
    </template>

    <div class="form-grid-container" :class="{ 'hide-left': !isLeftColumnVisible }">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field
                label="Nomor SJ"
                v-model="header.nomor"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Tanggal"
                v-model="header.tanggal"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
                :disabled="isEditMode"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Ke Store Tujuan"
                v-model="header.store.kode"
                readonly
                variant="outlined"
                density="compact"
                hide-details
                placeholder="Klik untuk cari store..."
                append-inner-icon="mdi-magnify"
                @click="!isEditMode && (dialog.storeSearch = true)"
                :disabled="isEditMode"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Nama Store"
                v-model="header.store.nama"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Referensi SO (Telah LHK)"
                v-model="header.soNomor"
                readonly
                variant="outlined"
                density="compact"
                hide-details
                placeholder="Klik untuk cari SO..."
                append-inner-icon="mdi-magnify"
                @click="!isEditMode && (dialog.soSearch = true)"
                clearable
                @click:clear="header.soNomor = ''"
                :disabled="isEditMode"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                label="Keterangan"
                v-model="header.keterangan"
                rows="4"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <div class="d-flex align-center gap-2 mb-2">
            <v-text-field
              v-model="scannedBarcode"
              label="Scan Barcode Barang di Sini..."
              placeholder="Arahkan scanner lalu Enter..."
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-barcode-scan"
              hide-details
              clearable
              @keydown.enter.prevent="handleBarcodeScan"
            />
          </div>

          <v-data-table
            :headers="tableHeaders"
            :items="items"
            class="desktop-table fill-height-table"
            density="compact"
            fixed-header
            :items-per-page="-1"
          >
            <template #[`item.kode`]="{ item }">
              <v-text-field
                v-model="item.kode"
                variant="underlined"
                density="compact"
                hide-details
                readonly
              />
            </template>
            <template #[`item.nama`]="{ item }">
              <div class="scrollable-cell text-truncate" style="max-width: 380px">
                {{ item.nama }}
              </div>
            </template>
            <template #[`item.ukuran`]="{ item }">
              <div class="text-center font-weight-bold">{{ item.ukuran || "-" }}</div>
            </template>
            <template #[`item.stok`]="{ item }">
              <div class="text-right text-grey-darken-1 pr-2">{{ item.stok }}</div>
            </template>
            <template #[`item.jumlah`]="{ item }">
              <v-text-field
                v-model.number="item.jumlah"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-right"
                :class="item.jumlah > (item.jumlahSo ?? 0) ? 'text-error' : ''"
                readonly
              />
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
                :disabled="!item.kode"
                @click="removeRow(item.id)"
              />
            </template>
            <template #bottom>
              <div class="pa-2 text-right">
                <v-btn
                  size="small"
                  @click="addNewRow"
                  prepend-icon="mdi-plus"
                  variant="text"
                  color="primary"
                >
                  Tambah Baris Manual
                </v-btn>
              </div>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <StoreSearchModal
      v-if="dialog.storeSearch"
      @close="dialog.storeSearch = false"
      @store-selected="onStoreSelected"
    />
    <SoSearchModal
      v-if="dialog.soSearch"
      cabang="ALL"
      source="sj-workshop-lhk"
      @close="dialog.soSearch = false"
      @selected="onSoSelected"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
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

    <v-dialog v-model="isPrintConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Berhasil Disimpan</v-card-title>
        <v-card-text>
          SJ Workshop <strong>{{ printConfirmNomor }}</strong> berhasil disimpan.<br /><br />
          Apakah Anda ingin mencetak dokumen ini?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="handlePrintCancel">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="handlePrintConfirm"> Ya, Cetak </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
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

.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
}
</style>

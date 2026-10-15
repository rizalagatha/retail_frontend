<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";
import ProductSidePanel from "@/components/panel/ProductSidePanel.vue";
import type { ProductPanelSelection } from "@/components/panel/ProductSidePanel.vue";
import ReturJualOnlineSearchModal from "@/components/lookup/ReturJualOnlineSearchModal.vue";
import axios, { AxiosError } from "axios";

// --- Tipe Data ---
interface Header {
  nomor: string;
  tanggal: string;
  gudangDc: { kode: string; nama: string };
  keterangan: string;
}
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  harga: number;
  hargaDtf: number;
  jenis: string;
  ket: string;
  diskon: number;
  hargabaru: number;
  kodebaru: string;
  barcode: string;
  unitSerial?: string;
  unitSerials?: string[];
}

// Interface untuk parameter 'retur' dari modal pencarian
interface ReturJualLookup {
  Nomor: string;
  Tanggal: string;
  Invoice: string;
  Qty: number;
}

// Interface untuk data item yang diterima dari API load-from-rj
interface ItemFromRJ {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  stok: number;
  unitSerials?: string[];
}

interface BackendReturItem {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  stok: number | string;
  jumlah: number | string;
  harga?: number | string;
  // Tambahkan field lain jika ada dari backend
}

interface UnitForRetur {
  unitSerial: string;
  kode: string;
  ukuran: string;
  nama: string;
  barcode: string;
}

interface ProductByBarcode {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  stok: number | string;
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "32";
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? "Ubah Retur Barang ke DC" : "Buat Retur Barang ke DC"
);
const canView = computed(() => authStore.can(MENU_ID, "view"));
const canInsert = computed(() => authStore.can(MENU_ID, "insert"));
const canEdit = computed(() => authStore.can(MENU_ID, "edit"));
// Izin simpan bergantung pada mode (insert/edit)
const canSave = computed(() => (isEditMode.value ? canEdit.value : canInsert.value));
const isKON = computed(() => authStore.user?.cabang === "KON");
const dialogRJ = ref(false);

const header = reactive<Header>({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  gudangDc: { kode: "KDC", nama: "PUSAT" },
  keterangan: "",
});
const items = ref<Item[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const scannedBarcode = ref("");
const dialog = reactive({ gudangSearch: false });
const isProductPanelVisible = ref(false);
const activeRowIndex = ref(0);

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const tableHeaders = [
  { title: "Kode Barang", key: "kode", width: "100px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "60px" },
  { title: "Stok", key: "stok", align: "end", width: "60px" },
  { title: "Jumlah", key: "jumlah", align: "end", width: "60px" },
  { title: "Barcode", key: "barcode", width: "100px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
] as const;

// --- Methods ---
const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(),
      kode: "",
      nama: "",
      ukuran: "",
      stok: 0,
      jumlah: 0,
      harga: 0,
      hargaDtf: 0,
      jenis: "",
      ket: "",
      diskon: 0,
      hargabaru: 0,
      kodebaru: "",
      barcode: "",
    });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter((item) => item.id !== id);
  if (items.value.length === 0) addNewRow();
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const resetForm = () => {
  // Logic reset manual
  Object.assign(header, {
    nomor: "",
    tanggal: format(new Date(), "yyyy-MM-dd"),
    gudangDc: { kode: "KDC", nama: "PUSAT" },
    keterangan: "",
  });
  items.value = [];
  addNewRow();

  // [BARU] Reset status unsaved
  markAsSaved();
  toast.info("Form telah dibersihkan.");
};

const closeForm = () => router.push({ name: "ReturDc" });
const handleCancel = () => {
  showConfirmation("Konfirmasi Batal", "Batalkan semua perubahan dan kosongkan form?", resetForm);
};
const handleClose = () => showConfirmation("Konfirmasi Tutup", "Tutup form?", closeForm);

const onGudangSelected = (gudang: { kode: string; nama: string }) => {
  header.gudangDc = gudang;
  dialog.gudangSearch = false;
};

// const handleLoadFromStock = async () => {
//     showConfirmation(
//         'Konfirmasi Load Stok',
//         'Semua item di grid akan diganti dengan semua barang yang memiliki stok. Lanjutkan?',
//         async () => {
//             isLoading.value = true;
//             try {
//                 const response = await api.get('/retur-dc-form/load-all-stock');
//                 items.value = response.data.map((item: any) => ({
//                     ...item,
//                     id: Date.now() + Math.random(),
//                     jumlah: item.stok,
//                 }));
//                 addNewRow();
//                 toast.success('Semua item yang memiliki stok berhasil dimuat.');
//             } catch (error) {
//                 toast.error('Gagal memuat data stok.');
//             } finally {
//                 isLoading.value = false;
//             }
//         }
//     );
// };

const handleBarcodeScan = async () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  try {
    // 1) QR per-pcs (unit_serial)
    const unit = await fetchUnitBySerial(barcode);
    if (unit) {
      if (items.value.some((i) => i.unitSerial === unit.unitSerial)) {
        toast.info("Unit ini sudah ada di daftar.");
        playSound("error");
        return;
      }
      moveToTop(
        buildItem({
          kode: unit.kode,
          nama: unit.nama,
          ukuran: unit.ukuran,
          barcode: unit.barcode,
          unitSerial: unit.unitSerial,
        })
      );
      addNewRow();
      playSound("success");
      return;
    }

    // 2) Barcode SKU yang sudah ada di grid: tambah qty, pindah ke atas
    const existing = items.value.find((i) => i.kode && i.barcode === barcode);
    if (existing) {
      existing.jumlah = (existing.jumlah || 0) + 1;
      moveToTop(existing);
      toast.info(`Jumlah untuk ${existing.nama} ditambah.`);
      playSound("success");
      return;
    }

    // 3) Barcode SKU baru
    const { data: product } = await api.get<ProductByBarcode>(
      `/retur-dc-form/lookup/by-barcode/${encodeURIComponent(barcode)}`,
      { params: { gudang: authStore.user?.cabang } }
    );
    moveToTop(
      buildItem({
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        barcode: product.barcode,
        stok: Number(product.stok || 0),
      })
    );
    addNewRow();
    playSound("success");
  } catch (error: unknown) {
    toast.error(getErrorMessage(error, `Barcode ${barcode} tidak valid atau terjadi kesalahan.`));
    playSound("error");
  } finally {
    scannedBarcode.value = "";
  }
};

// --- SUARA SCAN ---
const BASE_URL = import.meta.env.BASE_URL;
const sfxSuccess = new Audio(`${BASE_URL}audio/beep_success.mp3`);
const sfxError = new Audio(`${BASE_URL}audio/beep_error.mp3`);

const playSound = (type: "success" | "error") => {
  const sfx = type === "success" ? sfxSuccess : sfxError;
  sfx.currentTime = 0;
  void sfx.play().catch(() => {
    // autoplay diblokir browser / file tidak termuat: abaikan, jangan ganggu alur scan
  });
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
};

const buildItem = (
  p: Pick<Item, "kode" | "nama" | "ukuran" | "barcode"> & Partial<Item>
): Item => ({
  id: Date.now() + Math.random(),
  stok: 0,
  jumlah: 1,
  harga: 0,
  hargaDtf: 0,
  jenis: "",
  ket: "",
  diskon: 0,
  hargabaru: 0,
  kodebaru: "",
  ...p,
});

// Pindahkan item ke baris paling atas (item baru: langsung disisipkan di atas).
// Baris kosong tetap di bawah karena addNewRow() hanya menambah kalau baris terakhir sudah terisi.
const moveToTop = (item: Item) => {
  const idx = items.value.findIndex((i) => i.id === item.id);
  if (idx === 0) return;
  if (idx > 0) items.value.splice(idx, 1);
  items.value.unshift(item);
};

// null = 404 (bukan unit_serial), error lain dilempar ke pemanggil
const fetchUnitBySerial = async (serial: string): Promise<UnitForRetur | null> => {
  try {
    const res = await api.get<UnitForRetur>(
      `/retur-dc-form/lookup/unit-for-retur/${encodeURIComponent(serial)}`,
      { params: { gudang: authStore.user?.cabang } }
    );
    return res.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
};

const openProductSearch = (index: number) => {
  activeRowIndex.value = index;
  isProductPanelVisible.value = true;
};

const onPanelProductsAdded = (selections: ProductPanelSelection[]) => {
  const productsToAdd = selections.filter(
    (p) => !items.value.some((item) => item.kode === p.kode && item.ukuran === p.ukuran)
  );

  if (productsToAdd.length === 0 && selections.length > 0) {
    return toast.info("Semua produk sudah ada di daftar.");
  }

  const newItems: Item[] = productsToAdd.map((p) => ({
    id: Date.now() + Math.random(),
    kode: p.kode,
    nama: p.nama,
    ukuran: p.ukuran || "-",
    stok: p.stok || 0,
    jumlah: p.jumlah || 1,
    harga: p.harga || 0,
    hargaDtf: p.harga || 0,
    jenis: "",
    ket: "",
    diskon: 0,
    hargabaru: 0,
    kodebaru: "",
    barcode: p.barcode || p.kode,
  }));

  // Sisipkan ke baris kosong yang sedang aktif dulu, sisanya di-append
  const emptyIdx = items.value.findIndex((item) => !item.kode);
  if (emptyIdx !== -1 && newItems.length > 0) {
    items.value.splice(emptyIdx, 1, newItems[0]);
    items.value.splice(emptyIdx + 1, 0, ...newItems.slice(1));
  } else {
    items.value.push(...newItems);
  }

  addNewRow();
};

const onRJSelected = async (retur: ReturJualLookup) => {
  dialogRJ.value = false;
  isLoading.value = true;
  try {
    // Memberikan tipe data pada response API
    const response = await api.get<ItemFromRJ[]>(`/retur-dc-form/load-from-rj/${retur.Nomor}`);

    header.keterangan = `RETUR DARI ONLINE: ${retur.Nomor}`;

    // Mapping data ke grid items dengan tipe yang aman
    items.value = response.data.map(
      (item: ItemFromRJ): Item => ({
        ...item,
        id: Date.now() + Math.random(),
        // Inisialisasi field tambahan yang dibutuhkan oleh interface Item
        harga: 0,
        hargaDtf: 0,
        jenis: "",
        ket: "",
        diskon: 0,
        hargabaru: 0,
        kodebaru: "",
      })
    );

    addNewRow();
    toast.success(`Berhasil memuat ${response.data.length} item dari Retur ${retur.Nomor}`);
  } catch (error) {
    // Menangani error logging tanpa 'any'
    const errorMessage = error instanceof Error ? error.message : "Terjadi kesalahan sistem";
    toast.error(`Gagal memuat barang: ${errorMessage}`);
  } finally {
    isLoading.value = false;
  }
};

const save = () => {
  if (!canSave.value) {
    toast.error("Anda tidak memiliki izin untuk menyimpan data ini.");
    return;
  }
  if (!header.keterangan || header.keterangan.trim() === "") {
    return toast.error("Keterangan wajib diisi.");
  }
  // --- VALIDASI DARI DELPHI ---
  if (!isEditMode.value && new Date(header.tanggal) < new Date(format(new Date(), "yyyy-MM-dd"))) {
    return toast.error("Tanggal tidak boleh mundur dari hari ini.");
  }
  const validItems = items.value.filter((i) => i.kode);
  if (validItems.length === 0) {
    return toast.error("Detail barang harus diisi.");
  }
  if (validItems.some((i) => (i.jumlah || 0) <= 0)) {
    return toast.error("Jumlah retur harus diisi dan lebih dari 0.");
  }
  // --- AKHIR VALIDASI ---

  // Stok tidak lagi memblokir simpan, hanya peringatan di dialog konfirmasi
  const melebihiStok = validItems.filter(
    (i) =>
      !i.unitSerial && (!i.unitSerials || i.unitSerials.length === 0) && (i.jumlah || 0) > i.stok
  );
  const teksKonfirmasi =
    melebihiStok.length > 0
      ? `${melebihiStok.length} item jumlahnya melebihi stok yang tercatat. Tetap simpan?`
      : "Anda yakin ingin menyimpan data ini?";

  showConfirmation("Konfirmasi Simpan", teksKonfirmasi, executeSave);
};

const executeSave = async () => {
  if (isSaving.value) return;

  if (!canSave.value) {
    toast.error("Anda tidak memiliki izin untuk menyimpan data ini.");
    isSaving.value = false; // Pastikan loading dihentikan
    return;
  }

  isSaving.value = true;
  const payload = {
    header,
    items: items.value.filter((i) => i.kode && (i.jumlah || 0) > 0),
    isNew: !isEditMode.value,
  };
  try {
    const response = await api.post("/retur-dc-form/save", payload);
    toast.success(response.data.message);

    markAsSaved();

    // --- ALUR CETAK OTOMATIS ---
    const nomorDokumen = response.data.nomor;
    if (nomorDokumen) {
      const url = router.resolve({ name: "ReturDcPrint", params: { nomor: nomorDokumen } }).href;
      window.open(url, "_blank");
    }
    // --- AKHIR ALUR CETAK ---

    router.push({ name: "ReturDc" }); // Arahkan kembali ke browse
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Cek apakah error dari Axios
      const axiosError = error as AxiosError<{ message: string }>;
      toast.error(axiosError.response?.data?.message || error.message || "Gagal menyimpan data.");
    } else {
      toast.error("Gagal menyimpan data.");
    }
  } finally {
    isSaving.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/retur-dc-form/${nomor}`);
    // Update Header
    Object.assign(header, response.data.header);
    header.tanggal = format(new Date(response.data.header.tanggal), "yyyy-MM-dd");

    // Update Items dengan normalisasi tipe data
    items.value = response.data.items.map((item: BackendReturItem) => ({
      ...item,
      id: Math.random(), // ID Unik tetap dibuat di frontend
      stok: Number(item.stok || 0),
      jumlah: Number(item.jumlah || 0),
      harga: Number(item.harga || 0),
      // Pastikan field lain yang diwajibkan oleh interface 'Item' diinisialisasi jika tidak ada dari backend
      hargaDtf: 0,
      jenis: "",
      ket: "",
      diskon: 0,
      hargabaru: 0,
      kodebaru: "",
    }));

    await nextTick();
    markAsSaved();
  } catch (error: unknown) {
    if (error instanceof Error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const message = axiosError.response?.data?.message || error.message || "Gagal memuat data.";
      toast.error(message);
    } else {
      toast.error("Gagal memuat data.");
    }
    router.back();
  }
};

const handleProductKeydown = (e: KeyboardEvent, index: number) => {
  if (e.key === "F1" || e.key === "F2") {
    e.preventDefault();
    openProductSearch(index);
  }
};

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [header, items],
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isLoading.value || isSaving.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Keterangan diisi
    const hasHeader = header.keterangan.trim() !== "";

    // 2. Items: Ada minimal 1 baris yang valid (kode terisi)
    const hasItems = items.value.some((i) => i.kode !== "");

    if (hasHeader || hasItems) {
      uiStore.setUnsavedChanges(true);
    } else {
      // Jika kembali kosong bersih
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

onMounted(async () => {
  markAsSaved();

  if (!canView.value) {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk mengakses halaman ini.");
    return;
  }

  isLoading.value = true;
  const nomor = route.params.nomor as string;

  // Sekarang pengecekan ini akan berhasil karena isEditMode reaktif
  if (isEditMode.value && nomor) {
    await loadDataForEdit(nomor);
  }

  // Baris kosong hanya ditambahkan jika diperlukan
  addNewRow();
  isLoading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-truck-minus-outline">
    <template #header-actions>
      <v-btn
        color="deep-purple-darken-1"
        size="small"
        prepend-icon="mdi-cart-plus"
        @click="isProductPanelVisible = true"
      >
        Cari Produk
      </v-btn>
      <v-btn
        size="small"
        prepend-icon="mdi-content-save"
        color="primary"
        @click="save"
        :loading="isSaving"
        >Simpan</v-btn
      >
      <v-btn size="small" prepend-icon="mdi-refresh" @click="handleCancel">Batal</v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="handleClose">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12"
              ><v-text-field
                label="No. Retur"
                v-model="header.nomor"
                readonly
                filled
                hide-details
                density="compact"
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Tanggal"
                v-model="header.tanggal"
                type="date"
                variant="outlined"
                hide-details
                density="compact"
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Gudang DC"
                v-model="header.gudangDc.kode"
                @click="dialog.gudangSearch = true"
                prepend-inner-icon="mdi-magnify"
                readonly
                variant="outlined"
                hide-details
                density="compact"
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Nama Gudang DC"
                v-model="header.gudangDc.nama"
                readonly
                filled
                hide-details
                density="compact"
            /></v-col>
            <v-col cols="12">
              <v-textarea
                label="Keterangan *"
                v-model="header.keterangan"
                rows="3"
                variant="outlined"
                hide-details="auto"
                density="compact"
                :rules="[(v) => !!v || 'Keterangan wajib diisi']"
              />
            </v-col>
            <!-- <v-col cols="12">
                            <v-btn block color="info" @click="handleLoadFromStock" prepend-icon="mdi-download"
                                :loading="isLoading">
                                Load from Stok
                            </v-btn>
                        </v-col> -->
            <v-col cols="12" v-if="isKON">
              <v-btn
                block
                color="orange-darken-3"
                @click="dialogRJ = true"
                prepend-icon="mdi-magnify-plus"
                :loading="isLoading"
              >
                Ambil dari Retur Online (KON)
              </v-btn>
            </v-col>
          </v-row>
        </div>
      </div>
      <div class="right-column">
        <div class="scanner-wrapper mb-4">
          <v-text-field
            v-model="scannedBarcode"
            label="Scan Barcode di Sini..."
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
            <template #[`item.kode`]="{ item, index }">
              <v-text-field
                v-model="item.kode"
                variant="underlined"
                density="compact"
                hide-details
                placeholder="Cari produk..."
                append-inner-icon="mdi-magnify"
                @click:append-inner="openProductSearch(index)"
                @keydown="handleProductKeydown($event, index)"
              />
            </template>
            <template #[`item.jumlah`]="{ item }">
              <v-text-field
                v-model.number="item.jumlah"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-center"
                min="0"
              />
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn
                v-if="item.kode"
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
                @click="removeRow(item.id)"
              />
            </template>
            <template #bottom>
              <div class="pa-2 text-right">
                <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus">Tambah Baris</v-btn>
              </div>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <GudangSearchModal
      v-if="dialog.gudangSearch"
      :user-cabang="authStore.user?.cabang || ''"
      source="retur-dc"
      @close="dialog.gudangSearch = false"
      @gudang-selected="onGudangSelected"
    />
    <ProductSidePanel
      v-model="isProductPanelVisible"
      :gudang="authStore.user?.cabang || ''"
      @products-added="onPanelProductsAdded"
    />
    <ReturJualOnlineSearchModal
      v-if="dialogRJ"
      @close="dialogRJ = false"
      @selected="onRJSelected"
    />

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
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
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
</style>

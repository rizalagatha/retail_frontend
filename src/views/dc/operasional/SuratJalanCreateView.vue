<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";
import StoreSearchModal from "@/components/lookup/StoreSearchModal.vue";
// import PermintaanSearchModal from '@/components/lookup/PermintaanSearchModal.vue';
import TerimaRbSearchModal from "@/components/lookup/TerimaRbSearchModal.vue";
import PackingListSearchModal from "@/components/lookup/PackingListSearchModal.vue";
import SoSearchModal from "@/components/lookup/SoSearchModal.vue";
import type { AxiosError } from "axios";
import type { DataTableHeader } from "vuetify";

// --- Tipe Data ---
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  minstok: number;
  maxstok: number;
  stok: number;
  minta: number;
  sudah: number;
  belum: number;
  jumlah: number;
  barcode: string;
}

interface ItemResponse {
  kode: string;
  nama: string;
  ukuran: string;
  minstok?: number;
  maxstok?: number;
  stok?: number;
  minta?: number;
  sudah?: number;
  // properti lainnya sesuai response
}

interface SuratJalanItem {
  kode: string;
  nama: string;
  jumlah: number;
  // tambahkan field lain sesuai data
}

interface PackingListSourceItem {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number | string;
  stokmin: number | string;
  stokmax: number | string;
  sudah: number | string;
  minta: number | string;
  jumlah: number | string;
  barcode: string;
}

interface PackingListSelection {
  Nomor: string;
  Tanggal: string;
  Keterangan?: string;
  Status?: string;
}

// --- Inisialisasi ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "213";

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? "Ubah Surat Jalan ke Store" : "Buat Surat Jalan ke Store"
);
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));

const isLoading = ref(true);
const isSaving = ref(false);

const header = reactive({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  gudang: { kode: authStore.user?.cabang || "", nama: "" },
  store: { kode: "", nama: "" },
  permintaan: "",
  soNomor: "", // <--- [BARU]
  keterangan: "",
});

const items = ref<Item[]>([]);
const scannedBarcode = ref("");
const isLeftColumnVisible = ref(true);

// Modal states
const dialog = reactive({
  gudangSearch: false,
  storeSearch: false,
  permintaanSearch: false,
  terimaRbSearch: false,
  lookup: false,
  packingListSearch: false,
  soSearch: false, // <--- [BARU]
});

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});
const activeRowIndex = ref(0); // eslint-disable-line @typescript-eslint/no-unused-vars

// --- Konfigurasi Tabel ---
const tableHeaders: DataTableHeader[] = [
  { title: "Kode Barang", key: "kode", width: "150px" }, // Dikecilkan
  { title: "Nama Barang", key: "nama" }, // Lebar fleksibel
  { title: "Ukuran", key: "ukuran", width: "100px" },
  { title: "Min Buffer", key: "minstok", align: "end", width: "100px" },
  { title: "Max Buffer", key: "maxstok", align: "end", width: "100px" },
  { title: "Stok", key: "stok", align: "end", width: "100px" },
  { title: "Minta", key: "minta", align: "end", width: "100px" },
  { title: "Sudah", key: "sudah", align: "end", width: "100px" },
  { title: "Belum", key: "belum", align: "end", width: "100px" },
  { title: "Jumlah", key: "jumlah", align: "end", width: "150px" },
  { title: "Barcode", key: "barcode", width: "150px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
];

// --- Methods ---
const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(),
      kode: "",
      nama: "",
      ukuran: "",
      minstok: 0,
      maxstok: 0,
      stok: 0,
      minta: 0,
      sudah: 0,
      belum: 0,
      jumlah: 0,
      barcode: "",
    });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter((item) => item.id !== id);
  if (items.value.length === 0) addNewRow();
};

const handleBarcodeScan = async () => {
  const barcode = scannedBarcode.value;
  if (!barcode || !header.gudang.kode) {
    if (!header.gudang.kode) toast.error("Pilih gudang terlebih dahulu!");
    return;
  }

  const existingItem = items.value.find((item) => item.barcode === barcode && item.kode);
  if (existingItem) {
    if (existingItem.jumlah + 1 > existingItem.stok) {
      toast.error(`Stok untuk ${existingItem.nama} (${existingItem.ukuran}) tidak mencukupi.`);
    } else {
      existingItem.jumlah += 1;
      toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
    }
    scannedBarcode.value = "";
    return;
  }

  try {
    type Product = {
      kode: string;
      nama: string;
      ukuran: string;
      stok: number;
      barcode: string;
      minstok?: number;
      maxstok?: number;
    };

    const response = await api.get<Product>(`/surat-jalan-form/by-barcode/${barcode}`, {
      params: { gudang: header.gudang.kode },
    });

    const product = response.data;
    const emptyRowIndex = items.value.findIndex((item) => !item.kode);

    if (emptyRowIndex !== -1) {
      items.value.splice(emptyRowIndex, 1, {
        id: Date.now(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        jumlah: 1,
        barcode: product.barcode,
        minstok: product.minstok || 0,
        maxstok: product.maxstok || 0,
        minta: 0,
        sudah: 0,
        belum: 0,
      });
      addNewRow();
    } else {
      toast.error("Tidak ada baris kosong untuk menambahkan item baru.");
    }
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message: string }>;
    if (axiosError.response?.data?.message) {
      toast.error(axiosError.response.data.message);
    } else if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error("Terjadi kesalahan");
    }
  }
};

const openStoreSearch = () => {
  dialog.storeSearch = true;
};

const openTerimaRbSearch = () => {
  dialog.terimaRbSearch = true;
};

const onTerimaRbSelected = async (terimaRb: { nomor: string }) => {
  dialog.terimaRbSearch = false;
  // Panggil fungsi yang sudah ada untuk memuat item ke grid
  await loadItemsFromSource(terimaRb.nomor);
};

const onStoreSelected = (store: { kode: string; nama: string }) => {
  header.store = store;
  dialog.storeSearch = false; // Tutup modal setelah memilih
};

const onGudangSelected = (gudang: { kode: string; nama: string }) => {
  header.gudang = gudang;
  dialog.gudangSearch = false; // Tutup modal setelah memilih
};

const onPermintaanSelected = async (permintaan: { nomor: string }) => {
  header.permintaan = permintaan.nomor;
  dialog.permintaanSearch = false;
  await loadItemsFromSource(permintaan.nomor);
};

// [UBAH] Fungsi Load Items (Mode HARD BLOCK)
// [UBAH] Fungsi Load Items (Mode HARD BLOCK DENGAN LOGIKA UKURAN)
const loadItemsFromPackingList = async (nomorPL: string) => {
  isLoading.value = true;
  try {
    const response = await api.get("/surat-jalan-form/load-from-pl", {
      params: { nomor: nomorPL },
    });

    const rawItems = response.data as (PackingListSourceItem & {
      harga: number;
      hpp: number;
      kategori: string;
    })[];

    // 1. Filter dan kumpulkan barang yang bermasalah (Harga atau HPP 0)
    const invalidItems = rawItems.filter((item) => {
      // Jika harga dan HPP sudah terisi (>0), berarti aman
      if (item.harga > 0 && item.hpp > 0) return false;

      const nama = (item.nama || "").toUpperCase();
      const ukuran = (item.ukuran || "").toUpperCase();
      const kategori = (item.kategori || "").toUpperCase();

      // Abaikan validasi jika kategori barang adalah PESANAN, JASA, atau BONUS
      if (kategori === "PESANAN" || kategori === "JASA" || kategori === "BONUS") return false;

      // Deteksi jenis baju berdasarkan nama
      const isAnak = nama.includes("ANAK");
      const isTunik = nama.includes("TUNIK");

      // Daftar ukuran yang WAJIB diinput harganya
      // (Termasuk SS dan XXL sebagai jaga-jaga penulisan variasi ukuran)
      const wajibDewasa = ["XS", "SS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL"];
      const wajibAnakTunik = ["XS", "SS", "S", "M", "L", "XL", "2XL", "XXL"];

      let isWajibHarga = false;

      if (isAnak || isTunik) {
        isWajibHarga = wajibAnakTunik.includes(ukuran);
      } else {
        // Asumsi sisanya adalah Kaos Dewasa Reguler
        isWajibHarga = wajibDewasa.includes(ukuran);
      }

      // Jika ukuran ini WAJIB tapi harganya/hpp-nya 0, maka item ini BERMASALAH (return true)
      return isWajibHarga && (item.harga === 0 || item.hpp === 0);
    });

    // 2. Jika ada yang bermasalah, TOLAK KERAS!
    if (invalidItems.length > 0) {
      // Ambil maksimal 5 nama barang biar toast-nya nggak kepanjangan
      const invalidNames = invalidItems
        .slice(0, 5)
        .map((i) => `• ${i.kode} - ${i.nama} (${i.ukuran})`)
        .join("\n");

      const moreText =
        invalidItems.length > 5 ? `\n...dan ${invalidItems.length - 5} item lainnya.` : "";

      toast.error(
        `GAGAL MEMUAT PACKING LIST!\n\nBarang berikut WAJIB disetting Harga/HPP di Master Data:\n${invalidNames}${moreText}\n\nSilakan update Master Barang terlebih dahulu!`,
        { timeout: 8000 } // Tahan agak lama biar sempat dibaca
      );
      return;
    }

    // 3. Jika aman semua (tidak ada yang kena return di atas), load ke grid
    items.value = rawItems.map((item) => ({
      id: Date.now() + Math.random(),
      kode: item.kode,
      nama: item.nama,
      ukuran: item.ukuran,
      stok: Number(item.stok),

      minstok: Number(item.stokmin),
      maxstok: Number(item.stokmax),
      sudah: Number(item.sudah),
      belum: Number(item.minta) - Number(item.sudah),

      minta: Number(item.minta),
      jumlah: Number(item.jumlah),
      barcode: item.barcode,
      harga: item.harga,
      hpp: item.hpp,
      kategori: item.kategori,
    }));

    addNewRow();
    toast.success("Semua item valid dan berhasil dimuat dari Packing List.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal memuat item Packing List.");
  } finally {
    isLoading.value = false;
  }
};

const onPackingListSelected = (pl: PackingListSelection) => {
  header.permintaan = pl.Nomor; // TypeScript sekarang tahu pl memiliki properti .Nomor
  dialog.packingListSearch = false;

  // Konfirmasi timpa data
  showConfirmation(
    "Load Packing List",
    "Data item akan diganti dengan isi Packing List. Lanjutkan?",
    () => loadItemsFromPackingList(pl.Nomor)
  );
};

const loadItemsFromSource = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get("/surat-jalan-form/load-items", {
      params: { nomor, gudang: header.gudang.kode },
    });
    items.value = response.data.map(
      (item: ItemResponse): Item => ({
        id: Date.now() + Math.random(),
        kode: item.kode,
        nama: item.nama,
        ukuran: item.ukuran,
        minstok: item.minstok || 0,
        maxstok: item.maxstok || 0,
        stok: item.stok || 0,
        minta: item.minta || 0,
        sudah: item.sudah || 0,
        belum: (item.minta || 0) - (item.sudah || 0),
        jumlah: 0,
        barcode: "",
      })
    );
    addNewRow();
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal memuat item.");
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
  const validItems = items.value.filter((i) => i.kode && i.jumlah > 0);

  isSaving.value = true;
  try {
    const payload = { header, items: validItems, isNew: !isEditMode.value };
    const response = await api.post("/surat-jalan-form/save", payload);
    toast.success(response.data.message);

    // Buka halaman cetak di tab baru, lalu reset form
    const nomorSJ = response.data.nomor;
    const url = router.resolve({ name: "Cetak Surat Jalan", params: { nomor: nomorSJ } }).href;
    window.open(url, "_blank");

    router.push({ name: "SuratJalanStore" });
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const handleSave = () => {
  // Validasi frontend sebelum konfirmasi
  if (!header.gudang.kode) return toast.error("Gudang harus diisi.");
  if (!header.store.kode) return toast.error("Store tujuan harus diisi.");
  // [BARU] Validasi Wajib SO jika ke Workshop W01
  if (header.store.kode === "W01" && !header.soNomor) {
    return toast.error("Referensi Surat Pesanan (SO) wajib diisi untuk pengiriman ke Workshop!");
  }
  // --- VALIDASI TANGGAL HARI INI ---
  const today = format(new Date(), "yyyy-MM-dd");
  if (header.tanggal !== today) {
    return toast.error(`Tanggal Surat Jalan harus hari ini (${today}).`);
  }
  // ----------------------------------------------
  const validItems = items.value.filter((i) => i.kode && i.jumlah > 0);
  if (validItems.length === 0) return toast.error("Detail barang harus diisi.");

  showConfirmation("Konfirmasi Simpan", "Apakah Anda yakin ingin menyimpan data ini?", executeSave);
};

const onSoSelected = (so: { nomor?: string; Nomor?: string; so_nomor?: string }) => {
  header.soNomor = so.nomor || so.Nomor || so.so_nomor || "";
  dialog.soSearch = false;
};

const resetForm = () => {
  const savedGudang = { ...header.gudang };
  Object.assign(header, {
    nomor: "",
    tanggal: format(new Date(), "yyyy-MM-dd"),
    gudang: savedGudang,
    store: { kode: "", nama: "" },
    permintaan: "",
    soNomor: "", // <--- [BARU]
    keterangan: "",
  });
  items.value = [];
  addNewRow();
  toast.info("Form telah dibersihkan.");
};

const handleCancel = () => {
  showConfirmation(
    "Konfirmasi Batal",
    "Data yang belum disimpan akan hilang. Lanjutkan?",
    resetForm
  );
};

const handleClose = () => {
  showConfirmation("Konfirmasi Tutup", "Tutup form dan kembali ke halaman browse?", () =>
    router.push({ name: "SuratJalanStore" })
  );
};

onMounted(async () => {
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(
      `Anda tidak memiliki izin untuk ${
        isEditMode.value ? "mengubah" : "membuat"
      } data Surat Jalan.`
    );
    router.push({ name: "SuratJalanStore" });
    return;
  }

  if (isEditMode.value) {
    const nomor = route.params.nomor as string;
    try {
      const response = await api.get(`/surat-jalan-form/${nomor}`);
      const data = response.data;
      header.nomor = data.header.nomor;
      header.tanggal = format(new Date(data.header.tanggal), "yyyy-MM-dd");
      header.gudang = { kode: data.header.gudang_kode, nama: data.header.gudang_nama };
      header.store = { kode: data.header.store_kode, nama: data.header.store_nama };
      header.permintaan = data.header.permintaan;
      header.keterangan = data.header.keterangan;
      header.soNomor = data.header.soNomor || "";
      items.value = data.items.map((item: unknown) => {
        const typedItem = item as SuratJalanItem;
        return {
          ...typedItem,
          id: Date.now() + Math.random(),
        };
      });
    } catch {
      toast.error("Gagal memuat data untuk diubah.");
      router.back();
    }
  } else {
    // Untuk form baru, coba fetch nama gudang default
    if (header.gudang.kode) {
      // Anda bisa buat endpoint lookup by ID atau handle di frontend
      header.gudang.nama = ""; // Placeholder
    }
  }
  addNewRow();
  isLoading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-truck-plus-outline">
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
      <!-- Left Column: Header -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field
                label="Nomor"
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
                :min="format(new Date(), 'yyyy-MM-dd')"
                :max="format(new Date(), 'yyyy-MM-dd')"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Gudang"
                v-model="header.gudang.kode"
                readonly
                @click="dialog.gudangSearch = true"
                prepend-inner-icon="mdi-magnify"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Nama Gudang"
                v-model="header.gudang.nama"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Ke Store"
                v-model="header.store.kode"
                @click="openStoreSearch"
                prepend-inner-icon="mdi-magnify"
                density="compact"
                hide-details
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
                label="Ref. Packing List"
                v-model="header.permintaan"
                append-inner-icon="mdi-magnify"
                readonly
                @click="!isEditMode && header.store.kode ? (dialog.packingListSearch = true) : null"
                density="compact"
                hide-details
                variant="outlined"
                :disabled="isEditMode || !header.store.kode"
                placeholder="Pilih Packing List..."
              />
            </v-col>
            <v-col cols="12" v-if="header.store.kode === 'W01'">
              <v-text-field
                label="Ref. Surat Pesanan (SO) - Wajib"
                v-model="header.soNomor"
                append-inner-icon="mdi-magnify"
                readonly
                @click="!isEditMode ? (dialog.soSearch = true) : null"
                density="compact"
                hide-details
                variant="outlined"
                bg-color="blue-lighten-5"
                :disabled="isEditMode"
                placeholder="Pilih Nomor SO..."
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                label="Keterangan"
                v-model="header.keterangan"
                rows="3"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>
        </div>
      </div>

      <!-- Right Column: Details -->
      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <div class="d-flex justify-space-between align-center mb-2">
            <div class="scanner-wrapper">
              <v-text-field
                v-model="scannedBarcode"
                label="Scan Barcode di Sini..."
                placeholder="Input barcode lalu tekan Enter"
                variant="outlined"
                density="compact"
                prepend-inner-icon="mdi-barcode-scan"
                hide-details
                clearable
                @keydown.enter.prevent="handleBarcodeScan"
              >
              </v-text-field>
            </div>
            <v-btn size="small" @click="openTerimaRbSearch" prepend-icon="mdi-package-down"
              >Load from Terima RB</v-btn
            >
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
              <div class="scrollable-cell">{{ item.nama }}</div>
            </template>
            <template #[`item.jumlah`]="{ item }">
              <v-text-field
                v-model.number="item.jumlah"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-right"
              />
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
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
                  >Tambah Baris</v-btn
                >
              </div>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <GudangSearchModal
      v-if="dialog.gudangSearch"
      :user-cabang="authStore.user?.cabang || ''"
      @close="dialog.gudangSearch = false"
      @gudang-selected="onGudangSelected"
    />
    <StoreSearchModal
      v-if="dialog.storeSearch"
      @close="dialog.storeSearch = false"
      @store-selected="onStoreSelected"
    />
    <PermintaanSearchModal
      v-if="dialog.permintaanSearch"
      :store-kode="header.store.kode"
      @close="dialog.permintaanSearch = false"
      @permintaan-selected="onPermintaanSelected"
    />
    <TerimaRbSearchModal
      v-if="dialog.terimaRbSearch"
      @close="dialog.terimaRbSearch = false"
      @terima-rb-selected="onTerimaRbSelected"
    />
    <PackingListSearchModal
      v-if="dialog.packingListSearch"
      :store-kode="header.store.kode"
      @close="dialog.packingListSearch = false"
      @selected="onPackingListSelected"
    />
    <SoSearchModal
      v-if="dialog.soSearch"
      cabang="ALL"
      source="surat-jalan-bordir"
      @close="dialog.soSearch = false"
      @selected="onSoSelected"
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
          >
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.desktop-table :deep(.scrollable-cell) {
  white-space: nowrap;
  overflow-x: auto;
  max-width: 450px;
  min-width: 300px;
  height: 22px;
  display: block;
  padding-bottom: 5px;
  margin-bottom: -5px;
}

.scanner-wrapper {
  max-width: 400px;
  /* <-- ATUR LEBAR MAKSIMUM DI SINI */
  flex: none;
  /* Mencegah flexbox meregangkan wrapper ini */
  margin-bottom: 16px;
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
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import AppDataTable from "@/components/AppDataTable.vue";
import axios from "axios";
import AccesoriesSearchModal from "@/components/lookup/AccesoriesSearchModal.vue";

interface Item {
  id: number;
  kode: string;
  nama: string;
  satuan: string;
  jumlah: number;
  keterangan: string;
}

interface SearchedItem {
  kode: string;
  nama: string;
  satuan: string;
  note?: string; // Bisa kosong (undefined)
}

interface ApiDetailItem {
  kode: string;
  nama: string;
  satuan: string;
  jumlah: string | number; // Terkadang dari DB keluar sebagai string
  keterangan: string;
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "225";

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? "Ubah Permintaan Kebutuhan" : "Buat Permintaan Kebutuhan"
);
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));

const isLoading = ref(false);
const isSaving = ref(false);

// Audio feedback
const audioSuccess = new Audio("/audio/beep_success.mp3");
const audioError = new Audio("/audio/beep_error.mp3");

// --- STATE HEADER & ITEMS ---
const header = reactive({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  cabang: "P03", // Terkunci mati
  gudangProduksiKode: "K0001", // Default Kode Gudang Produksi
  gudangProduksiNama: "KAOSAN", // Default Nama Gudang Produksi
  keterangan: "BARU", // Default Keterangan
});

const items = ref<Item[]>([]);
const activeRowIndex = ref(0);

// --- STATE SEARCH MODAL ---
const isSearchModalVisible = ref(false);

// --- STATE DIALOG KONFIRMASI ---
const isConfirmDialogVisible = ref(false);
const confirmText = ref("");
const pendingAction = ref<(() => void) | null>(null);

const tableHeaders = [
  { title: "No", key: "no", width: "50px", sortable: false },
  { title: "Kode Bahan", key: "kode", width: "150px" },
  { title: "Nama Bahan", key: "nama", minWidth: "300px" },
  { title: "Satuan", key: "satuan", width: "100px", align: "center" },
  { title: "Jumlah", key: "jumlah", width: "120px", align: "end" },
  { title: "Keterangan", key: "keterangan", minWidth: "200px" },
  { title: "Aksi", key: "actions", width: "60px", align: "center", sortable: false },
] as const;

// --- METHODS ---
const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now() + Math.random(),
      kode: "",
      nama: "",
      satuan: "",
      jumlah: 0,
      keterangan: "",
    });
  }
};

// --- HAPUS BARIS ---
const removeRow = (index: number) => {
  const item = items.value[index];
  if (item.kode) {
    showConfirmation(() => {
      items.value.splice(index, 1);
      if (items.value.length === 0) addNewRow();
    }, `Yakin ingin menghapus barang ${item.nama} dari daftar?`);
  } else {
    // Jika baris kosong belum ada isinya, langsung hapus saja
    items.value.splice(index, 1);
    if (items.value.length === 0) addNewRow();
  }
};

// --- F1 SEARCH HANDLER ---
const openSearchDialog = (index: number) => {
  activeRowIndex.value = index;
  isSearchModalVisible.value = true;
};

// --- F1 SEARCH HANDLER ---
const handleItemSelected = (barang: SearchedItem) => {
  // Cek duplikasi
  const isExist = items.value.some((i) => i.kode === barang.kode);
  if (isExist) {
    audioError.play().catch(() => {});
    toast.warning("Barang sudah ada di daftar.");
    return;
  }

  const currentRow = items.value[activeRowIndex.value];
  currentRow.kode = barang.kode;
  currentRow.nama = barang.nama;
  currentRow.satuan = barang.satuan;

  // [PERBAIKAN] Kosongkan keterangan agar user input manual
  currentRow.keterangan = "";

  currentRow.jumlah = 1;

  audioSuccess.play().catch(() => {});
  addNewRow(); // Tambahkan baris kosong baru di bawahnya
};

// --- SAVE & LOAD ---
const loadData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/minta-accesories-form/${nomor}`);
    const data = response.data;

    header.nomor = data.header.nomor;
    header.tanggal = data.header.tanggal ? format(parseISO(data.header.tanggal), "yyyy-MM-dd") : "";
    header.cabang = data.header.cabang || "P03";
    header.gudangProduksiKode = data.header.gudangProduksiKode || "K0001";
    header.gudangProduksiNama = "KAOSAN";
    header.keterangan = data.header.keterangan || "BARU";

    // Ganti tipe (it: any) menjadi (it: ApiDetailItem)
    items.value = data.items.map((it: ApiDetailItem, idx: number) => ({
      id: Date.now() + idx,
      kode: it.kode,
      nama: it.nama,
      satuan: it.satuan,
      // Pastikan selalu diconvert ke Number
      jumlah: Number(it.jumlah) || 0,
      keterangan: it.keterangan || "",
    }));

    addNewRow();
    markAsSaved();
  } catch (error) {
    toast.error("Gagal memuat data permintaan.", error);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const executeSave = async () => {
  const validItems = items.value.filter((i) => i.kode);
  isSaving.value = true;
  try {
    const payload = {
      header,
      items: validItems,
      isNew: !isEditMode.value,
    };

    const response = await api.post("/minta-accesories-form/save", payload);
    const savedNomor = response.data.nomor;
    toast.success(response.data.message);
    markAsSaved();

    // Buat promise untuk menunggu jawaban user
    const wantsToPrint = await new Promise((resolve) => {
      showConfirmation(() => resolve(true), "Data tersimpan. Ingin cetak permintaan?");

      // Tunggu user klik batal/tutup
      const unwatch = watch(isConfirmDialogVisible, (isOpen) => {
        if (!isOpen) {
          unwatch();
          resolve(false);
        }
      });
    });

    if (wantsToPrint) {
      const url = router.resolve({
        name: "MintaAccesoriesPrint",
        params: { nomor: savedNomor },
      }).href;
      window.open(url, "_blank");
    }

    router.push("/gudang-dc/operasional/minta-accesories");
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal menyimpan data.");
    } else {
      toast.error("Terjadi kesalahan saat menyimpan.");
    }
  } finally {
    isSaving.value = false;
  }
};

// Ini yang dipanggil saat tombol Simpan diklik
const handleSave = () => {
  const validItems = items.value.filter((i) => i.kode);
  if (validItems.length === 0) return toast.error("Detail barang tidak boleh kosong.");

  for (const item of validItems) {
    if (item.jumlah <= 0) {
      return toast.error(`Jumlah barang ${item.nama} harus lebih dari 0.`);
    }
  }

  showConfirmation(executeSave, "Yakin ingin menyimpan permintaan ini ke sistem?");
};

// --- TUTUP/BATAL FORM ---
const handleClose = () => {
  showConfirmation(() => {
    markAsSaved(); // Reset status unsaved changes
    router.back();
  }, "Batalkan transaksi dan tutup halaman ini? Data yang belum disimpan akan hilang.");
};

const showConfirmation = (action: () => void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
};

const executePendingAction = () => {
  if (pendingAction.value) pendingAction.value();
  isConfirmDialogVisible.value = false;
};

const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
  pendingAction.value = null;
};

onMounted(() => {
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Akses ditolak untuk ${isEditMode.value ? "mengubah" : "membuat"} data.`);
    router.back();
    return;
  }

  if (isEditMode.value) {
    loadData(route.params.nomor as string);
  } else {
    addNewRow();
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-hand-extended-outline">
    <template #header-actions>
      <v-btn
        color="primary"
        size="small"
        prepend-icon="mdi-content-save"
        :loading="isSaving"
        @click="handleSave"
      >
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="handleClose">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12" v-if="isEditMode">
              <v-text-field
                label="Nomor Permintaan"
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
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Cabang Peminta"
                v-model="header.cabang"
                variant="filled"
                density="compact"
                hide-details
                readonly
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                label="Gdg Prod"
                v-model="header.gudangProduksiKode"
                variant="filled"
                density="compact"
                hide-details
                readonly
              />
            </v-col>
            <v-col cols="8">
              <v-text-field
                label="Nama Gudang Produksi"
                v-model="header.gudangProduksiNama"
                variant="filled"
                density="compact"
                hide-details
                readonly
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Keterangan"
                v-model="header.keterangan"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="scrollable-table-wrapper">
          <div class="desktop-form-section table-section">
            <AppDataTable
              :headers="tableHeaders"
              :items="items"
              :loading="isLoading"
              density="compact"
              class="desktop-table header-browse-blue"
              fixed-header
              :items-per-page="-1"
            >
              <template #[`item.no`]="{ index }">{{ index + 1 }}</template>

              <template #[`item.kode`]="{ item, index }">
                <v-text-field
                  v-model="item.kode"
                  variant="underlined"
                  density="compact"
                  hide-details
                  readonly
                  placeholder="F1 = Cari"
                  class="font-weight-bold text-primary cursor-pointer"
                  @keydown.f1.prevent.stop="openSearchDialog(index)"
                  @click="openSearchDialog(index)"
                />
              </template>

              <template #[`item.satuan`]="{ item }">
                <div class="text-center">{{ item.satuan }}</div>
              </template>

              <template #[`item.jumlah`]="{ item }">
                <v-text-field
                  v-if="item.kode"
                  v-model.number="item.jumlah"
                  type="number"
                  min="1"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-right"
                />
              </template>

              <template #[`item.keterangan`]="{ item }">
                <v-text-field
                  v-if="item.kode"
                  v-model="item.keterangan"
                  variant="underlined"
                  density="compact"
                  hide-details
                />
              </template>

              <template #[`item.actions`]="{ item, index }">
                <v-btn
                  v-if="item.kode"
                  icon="mdi-delete"
                  color="error"
                  variant="text"
                  size="x-small"
                  @click="removeRow(index)"
                />
              </template>
            </AppDataTable>
          </div>
        </div>
      </div>
    </div>

    <AccesoriesSearchModal
      v-if="isSearchModalVisible"
      @close="isSearchModalVisible = false"
      @item-selected="handleItemSelected"
    />

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold bg-primary text-white d-flex align-center">
          <v-icon icon="mdi-help-circle-outline" class="mr-2"></v-icon>
          Konfirmasi
        </v-card-title>
        <v-card-text class="pt-4 text-body-1">
          {{ confirmText }}
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">Tidak</v-btn>
          <v-btn color="primary" variant="flat" @click="executePendingAction">Ya, Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Background area di luar kertas (di layar browser) */
:global(body) {
  background-color: #525659; /* Warna abu-abu ala PDF viewer */
}

/* Container utama yang membungkus kertas */
.print-container {
  font-family: Arial, sans-serif;
  font-size: 11px;
  color: black;
  background-color: white;

  /* Efek Kertas A4 di Layar */
  width: 210mm; /* Lebar standar A4 */
  min-height: 297mm; /* Tinggi standar A4 */
  margin: 20px auto; /* Ditengahkan di layar */
  padding: 10mm; /* Margin dalam kertas */
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); /* Efek bayangan kertas */
  box-sizing: border-box;
}

/* Pengaturan setengah kertas untuk rangkap */
.print-half {
  height: calc(148.5mm - 10mm); /* Setengah tinggi A4 dikurangi padding */
  display: flex;
  flex-direction: column;
  padding-bottom: 10px;
  box-sizing: border-box;
  overflow: hidden; /* Mencegah konten luber jika terlalu banyak */
}

.cut-line {
  border-bottom: 1px dashed #000;
  margin: 15px 0;
  width: 100%;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.title {
  font-size: 16px;
  font-weight: normal;
  margin: 0;
}

.header-logo img {
  height: 35px;
  object-fit: contain;
}

.meta-section {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.meta-table {
  border-collapse: collapse;
}

.meta-table td {
  padding: 2px 0;
  vertical-align: top;
}

.right-meta {
  width: 250px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 10px; /* Diperkecil agar muat di setengah A4 */
  border: 1px solid black;
}

.items-table th,
.items-table td {
  border: 1px solid black;
  padding: 4px 6px;
  vertical-align: top;
}

.items-table th {
  font-weight: normal;
  text-align: left;
}

.text-center {
  text-align: center !important;
}
.text-right {
  text-align: right !important;
}

/* Tanda Tangan */
.signature-section {
  display: flex;
  justify-content: space-between;
  margin-top: auto; /* Dorong ke bawah area setengah kertas */
  padding: 0 20px;
}

.sig-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 120px;
}

.sig-title {
  margin-bottom: 60px; /* Jarak untuk tanda tangan */
}

.sig-name {
  text-align: center;
}

/* =========================================
   PENGATURAN KHUSUS SAAT BENAR-BENAR DICETAK
   (Menghilangkan efek bayangan kertas di printer)
   ========================================= */
@media print {
  @page {
    size: A4 portrait;
    margin: 0; /* Margin diatur oleh padding print-container */
  }

  :global(body) {
    background-color: white; /* Kembalikan background ke putih */
  }

  .print-container {
    margin: 0;
    box-shadow: none; /* Hilangkan shadow kertas */
    width: 100%;
    height: 100%;
    page-break-after: avoid;
  }
}
</style>

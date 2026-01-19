<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import type { DataTableHeader } from "vuetify";

// --- Tipe Data ---
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  barcode: string;
  jumlahKirim: number;
  jumlahTerima: number;
}
interface ItemWithExtra extends Item {
  id: number;
  jumlahTerima: number;
}

// --- Inisialisasi ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "31";

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
// const pageTitle = computed(() =>
//     isEditMode.value ? 'Ubah Penerimaan Surat Jalan' : 'Form Terima Surat Jalan'
// );
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));

const isLoading = ref(true);
const isSaving = ref(false);
const scannedBarcode = ref("");

const header = reactive({
  nomor: "", // No Terima (akan digenerate backend)
  tanggalTerima: format(new Date(), "yyyy-MM-dd"),
  gudangTerima: { kode: authStore.user?.cabang || "", nama: "" },
  nomorSj: "",
  tanggalSj: "",
  nomorMinta: "",
  gudangAsal: { kode: "", nama: "" },
  keterangan: "",
});

const items = ref<Item[]>([]);

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => { },
});

// --- Konfigurasi Tabel ---
const tableHeaders: DataTableHeader[] = [
  { title: "Kode Barang", key: "kode" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran" },
  { title: "Jumlah Kirim", key: "jumlahKirim", align: "end" },
  { title: "Jumlah Terima", key: "jumlahTerima", align: "end", width: "150px" },
  { title: "Barcode", key: "barcode" },
];

// --- Methods ---
const loadData = async (nomorSj: string) => {
  try {
    const response = await api.get(`/terima-sj-form/${nomorSj}`);
    const data = response.data;

    // Isi header
    header.nomorSj = data.header.sj_nomor;
    header.tanggalSj = data.header.sj_tanggal;
    header.nomorMinta = data.header.sj_mt_nomor;
    header.gudangAsal = { kode: data.header.gudang_asal_kode, nama: data.header.gudang_asal_nama };
    header.keterangan = data.header.keterangan;

    const userCabang = authStore.user?.cabang || "";
    const isAutoTerima = ["K01", "KPR"].includes(userCabang);

    // Isi grid
    items.value = data.items.map(
      (item: Item): ItemWithExtra => ({
        ...item,
        id: Date.now() + Math.random(),
        jumlahTerima: isAutoTerima ? item.jumlahKirim : 0, // Jika K01 atau KPR, isi otomatis
      })
    );

    if (isAutoTerima) {
      toast.info(
        `Jumlah terima otomatis disamakan dengan jumlah kirim untuk cabang ${userCabang}.`
      );
    }
  } catch {
    toast.error("Gagal memuat data SJ untuk diterima.");
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const handleBarcodeScan = () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  const itemToUpdate = items.value.find((item) => item.barcode === barcode);

  if (itemToUpdate) {
    if (itemToUpdate.jumlahTerima < itemToUpdate.jumlahKirim) {
      itemToUpdate.jumlahTerima++;
    } else {
      toast.warning(`Jumlah terima untuk ${itemToUpdate.nama} sudah sesuai dengan jumlah kirim.`);
    }
  } else {
    toast.error(`Barcode ${barcode} tidak ditemukan dalam Surat Jalan ini.`);
  }
  scannedBarcode.value = ""; // Selalu kosongkan input
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
    const payload = { header, items: items.value };
    const response = await api.post("/terima-sj-form/save", payload);
    toast.success(response.data.message);
    router.push({ name: "TerimaSj" });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "response" in error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Gagal menyimpan data.");
    } else {
      toast.error("Gagal menyimpan data.");
    }
  } finally {
    isSaving.value = false;
  }
};

const handleSave = () => {
  // Validasi
  if (items.value.length === 0) return toast.error("Tidak ada item untuk diterima.");
  showConfirmation(
    "Konfirmasi Simpan",
    "Apakah Anda yakin ingin menyimpan penerimaan SJ ini?",
    executeSave
  );
};

const handleClose = () => {
  showConfirmation("Konfirmasi Tutup", "Tutup form dan kembali ke halaman browse?", () =>
    router.push({ name: "TerimaSj" })
  );
};

onMounted(() => {
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(
      `Anda tidak memiliki izin untuk ${isEditMode.value ? "mengubah" : "membuat"} data Terima SJ.`
    );
    router.push({ name: "TerimaSj" });
    return;
  }

  const nomorSj = route.params.nomor as string;
  if (nomorSj) {
    loadData(nomorSj);
  } else {
    toast.error("Nomor SJ tidak valid.");
    router.back();
  }
});
</script>

<template>
  <PageLayout title="Form Terima SJ" icon="mdi-package-variant-closed">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="handleSave" :loading="isSaving" prepend-icon="mdi-content-save"
        :disabled="!authStore.can(MENU_ID, requiredPermission)">
        Simpan
      </v-btn>
      <v-btn size="small" @click="handleClose" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div v-if="isLoading" class="text-center pa-8"><v-progress-circular indeterminate /></div>
    <div v-else class="form-grid-container">
      <!-- Left Column: Header -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-text-field label="Nomor Terima" v-model="header.nomor" readonly filled density="compact" hide-details />
          <v-text-field label="Tgl. Terima" v-model="header.tanggalTerima" type="date" variant="outlined"
            density="compact" hide-details />
          <v-text-field label="Gudang Terima" :model-value="`${header.gudangTerima.kode} - ${header.gudangTerima.nama}`"
            readonly filled density="compact" hide-details />
          <v-divider class="my-3" />
          <v-text-field label="No. Surat Jalan" v-model="header.nomorSj" readonly filled density="compact"
            hide-details />
          <v-text-field label="Tgl. Surat Jalan" :model-value="format(new Date(header.tanggalSj), 'dd-MM-yyyy')"
            readonly filled density="compact" hide-details />
          <v-text-field label="No. Permintaan" v-model="header.nomorMinta" readonly filled density="compact"
            hide-details />
          <v-text-field label="Dari Gudang" :model-value="`${header.gudangAsal.kode} - ${header.gudangAsal.nama}`"
            readonly filled density="compact" hide-details />
          <v-textarea label="Keterangan" v-model="header.keterangan" rows="3" readonly filled density="compact"
            hide-details />
        </div>
      </div>

      <!-- Right Column: Details -->
      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <div class="scanner-wrapper">
            <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini untuk Menambah Jumlah Terima"
              variant="outlined" density="compact" prepend-inner-icon="mdi-barcode-scan" hide-details clearable
              autofocus @keydown.enter.prevent="handleBarcodeScan"></v-text-field>
          </div>
          <v-data-table :headers="tableHeaders" :items="items" class="desktop-table fill-height-table" density="compact"
            fixed-header :items-per-page="-1">
            <template #[`item.jumlahTerima`]="{ item }">
              <v-text-field v-model.number="item.jumlahTerima" type="number" min="0" variant="underlined"
                density="compact" hide-details class="text-right" />
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
          <v-btn color="primary" variant="tonal" @click="
            dialogConfirm.onConfirm();
          dialogConfirm.show = false;
          ">Ya, Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.scanner-wrapper {
  max-width: 500px;
  flex: none;
  margin-bottom: 16px;
}
</style>

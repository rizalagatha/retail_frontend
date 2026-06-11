<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { format, parseISO } from "date-fns";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import axios from "axios";

// --- Interfaces ---
interface TerimaItem {
  id: number;
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  jumlahKirim: number;
  jumlahTerima: number;
}

// [PERBAIKAN] Interface khusus untuk data yang ditarik dari API agar tidak 'any'
interface ApiItemResponse {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  jumlahKirim: number | string;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();

// --- State ---
const isLoading = ref(false);
const isSaving = ref(false);
const isLeftColumnVisible = ref(true);
const scannedBarcode = ref("");
const isConfirmDialogVisible = ref(false); // [TAMBAHAN] State untuk dialog konfirmasi

const header = reactive({
  nomorKirim: "",
  tanggalKirim: "",
  gudangAsalNama: "",
  keterangan: "",
});

const items = ref<TerimaItem[]>([]);

const pageTitle = computed(() => `Terima Mutasi Workshop`);

// --- Table Headers ---
const tableHeaders = [
  { title: "No.", key: "no", width: "60px", sortable: false },
  { title: "Kode Barang", key: "kode", width: "140px" },
  { title: "Barcode", key: "barcode", width: "120px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "100px", align: "center" as const },
  { title: "Dikirim", key: "jumlahKirim", width: "120px", align: "center" as const },
  { title: "Diterima", key: "jumlahTerima", width: "120px", align: "center" as const },
  { title: "Status", key: "status", width: "100px", align: "center" as const },
];

// --- Load Data ---
const loadData = async (nomorKirim: string) => {
  isLoading.value = true;
  try {
    const res = await api.get("/terima-workshop-form/load-kirim", {
      params: { nomorKirim },
    });

    const data = res.data;
    header.nomorKirim = data.header.nomorKirim;
    header.tanggalKirim = data.header.tanggalKirim
      ? format(new Date(data.header.tanggalKirim), "yyyy-MM-dd")
      : "";
    header.gudangAsalNama = `${data.header.gudangAsalKode} - ${data.header.gudangAsalNama}`;
    header.keterangan = data.header.keterangan || "";

    // [PERBAIKAN] Terapkan ApiItemResponse sebagai pengganti 'any'
    items.value = data.items.map((item: ApiItemResponse, index: number) => ({
      id: Date.now() + index,
      kode: item.kode,
      barcode: item.barcode,
      nama: item.nama,
      ukuran: item.ukuran,
      jumlahKirim: Number(item.jumlahKirim) || 0,
      jumlahTerima: 0, // Default 0 biar harus discan / diisi manual
    }));
  } catch (err: unknown) {
    let msg = "Gagal memuat dokumen pengiriman.";
    if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
    toast.error(msg);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

// --- Barcode Scanner Logic ---
const handleBarcodeScan = () => {
  const barcode = scannedBarcode.value.trim().toUpperCase();
  if (!barcode) return;

  const item = items.value.find((i) => i.barcode === barcode || i.kode.toUpperCase() === barcode);

  if (!item) {
    toast.error("Barang tidak ditemukan dalam daftar kirim!");
    scannedBarcode.value = "";
    return;
  }

  if (item.jumlahTerima < item.jumlahKirim) {
    item.jumlahTerima += 1;
    toast.success(`${item.nama} terverifikasi (${item.jumlahTerima}/${item.jumlahKirim})`);
  } else {
    toast.warning("Qty Terima sudah memenuhi Qty Kirim.");
  }

  scannedBarcode.value = "";
};

// --- Utilities ---
const setAllTerima = () => {
  items.value.forEach((item) => {
    item.jumlahTerima = item.jumlahKirim;
  });
  toast.info("Semua Qty Terima disamakan dengan Qty Kirim.");
};

const handleCancel = () => {
  router.back();
};

// --- Validasi Sebelum Menyimpan (Buka Dialog) ---
const confirmSave = () => {
  if (items.value.length === 0) return toast.warning("Tidak ada barang untuk diterima.");

  // Validasi jumlah terima vs kirim
  const invalid = items.value.some((i) => i.jumlahTerima > i.jumlahKirim);
  if (invalid) {
    return toast.error("Gagal: Ada barang yang Qty Terimanya melebihi Qty Kirim!");
  }

  const itemsToSave = items.value.filter((i) => i.jumlahTerima > 0);
  if (itemsToSave.length === 0) {
    return toast.error("Minimal harus ada 1 barang yang diterima!");
  }

  // Jika semua lolos validasi, buka dialog konfirmasi
  isConfirmDialogVisible.value = true;
};

// --- Eksekusi Simpan Data ---
const executeSave = async () => {
  const itemsToSave = items.value.filter((i) => i.jumlahTerima > 0);

  isConfirmDialogVisible.value = false; // Tutup dialog
  isSaving.value = true;

  try {
    const payload = {
      header,
      items: itemsToSave,
    };

    const res = await api.post("/terima-workshop-form/save", payload);
    toast.success(res.data.message);
    router.back(); // Kembali ke halaman browse
  } catch (err: unknown) {
    let msg = "Gagal menyimpan penerimaan.";
    if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
    toast.error(msg);
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  const refKirim = route.query.refKirim as string;
  if (refKirim) {
    loadData(refKirim);
  } else {
    toast.error("Referensi Pengiriman tidak ditemukan.");
    router.back();
  }
});

const isAllVerified = computed(() => {
  if (items.value.length === 0) return false;
  return items.value.every((i) => i.jumlahTerima === i.jumlahKirim);
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-truck-check-outline">
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
        @click="confirmSave"
        :loading="isSaving"
        prepend-icon="mdi-content-save"
      >
        Simpan Penerimaan
      </v-btn>
      <v-btn size="small" @click="handleCancel" prepend-icon="mdi-arrow-left"> Kembali </v-btn>
    </template>

    <div class="form-grid-container" :class="{ 'hide-left': !isLeftColumnVisible }">
      <!-- Kolom Kiri: Header Info -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <div class="section-title">Dokumen Pengiriman (MWK)</div>
          <v-row dense>
            <v-col cols="12">
              <v-text-field
                label="Nomor Kirim"
                v-model="header.nomorKirim"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Tgl. Kirim"
                :model-value="
                  header.tanggalKirim ? format(parseISO(header.tanggalKirim), 'dd/MM/yyyy') : ''
                "
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Gudang / Workshop Asal"
                v-model="header.gudangAsalNama"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                label="Keterangan Kirim"
                v-model="header.keterangan"
                readonly
                filled
                rows="2"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>

          <v-divider class="my-3"></v-divider>
        </div>
      </div>

      <!-- Kolom Kanan: Detail & Scanner -->
      <div class="right-column">
        <div class="desktop-form-section scanner-section mb-2">
          <v-row dense align="center">
            <v-col cols="12" md="6">
              <v-text-field
                v-model="scannedBarcode"
                label="Scan Verifikasi Barang (Wajib)"
                placeholder="Arahkan scanner ke barcode..."
                variant="outlined"
                density="compact"
                prepend-inner-icon="mdi-barcode-scan"
                hide-details
                @keydown.enter.prevent="handleBarcodeScan"
                :color="isAllVerified ? 'success' : 'primary'"
              />
            </v-col>
            <v-col cols="12" md="6" class="text-right">
              <v-btn
                color="orange-darken-2"
                variant="tonal"
                size="small"
                prepend-icon="mdi-check-all"
                @click="setAllTerima"
              >
                Terima Semua (Bypass)
              </v-btn>
            </v-col>
          </v-row>
        </div>

        <div class="scrollable-content">
          <div class="desktop-form-section main-grid-section">
            <v-data-table
              :headers="tableHeaders"
              :items="items"
              :loading="isLoading"
              density="compact"
              class="desktop-table vertically-aligned-table"
              fixed-header
              :items-per-page="-1"
            >
              <template #[`item.no`]="{ index }">{{ index + 1 }}</template>

              <template #[`item.jumlahKirim`]="{ item }">
                <span class="font-weight-bold text-grey-darken-2">{{ item.jumlahKirim }}</span>
              </template>

              <template #[`item.jumlahTerima`]="{ item }">
                <v-text-field
                  v-model.number="item.jumlahTerima"
                  type="number"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-center font-weight-bold"
                  :color="item.jumlahTerima === item.jumlahKirim ? 'success' : 'primary'"
                />
              </template>

              <template #[`item.status`]="{ item }">
                <v-icon
                  v-if="item.jumlahTerima === item.jumlahKirim"
                  color="success"
                  size="small"
                  title="Sesuai"
                  >mdi-check-circle</v-icon
                >
                <v-icon
                  v-else-if="item.jumlahTerima > 0"
                  color="warning"
                  size="small"
                  title="Parsial"
                  >mdi-alert-circle</v-icon
                >
                <v-icon v-else color="error" size="small" title="Belum Diterima"
                  >mdi-close-circle</v-icon
                >
              </template>

              <template #bottom></template>
            </v-data-table>
          </div>
        </div>
      </div>
    </div>

    <!-- [TAMBAHAN] Dialog Konfirmasi Simpan -->
    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Simpan</v-card-title>
        <v-card-text>
          Apakah Anda yakin ingin menyimpan dokumen penerimaan mutasi workshop ini? <br /><br />
          <span class="text-caption text-error font-weight-bold"
            >*Pastikan fisik barang yang diterima sudah sesuai dengan sistem.</span
          >
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isConfirmDialogVisible = false"
            >Batal</v-btn
          >
          <v-btn color="primary" variant="tonal" @click="executeSave" :loading="isSaving"
            >Ya, Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  display: grid;
  grid-template-columns: 350px 1fr;
  height: calc(100vh - 120px);
  transition: grid-template-columns 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  gap: 12px;
}

.form-grid-container.hide-left {
  grid-template-columns: 0px 1fr;
}

.left-column {
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
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

.scrollable-content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
}

.header-section {
  flex-shrink: 0;
}

.main-grid-section {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.desktop-table {
  flex: 1 1 auto;
  min-height: 0;
}

.desktop-table :deep(.v-table__wrapper) {
  overflow-x: auto !important;
  overflow-y: auto !important;
}

.vertically-aligned-table :deep(tbody tr td) {
  vertical-align: middle !important;
}

.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: none !important;
}

.section-title {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 8px;
  color: #1a237e;
  border-left: 3px solid #1a237e;
  padding-left: 8px;
}
</style>

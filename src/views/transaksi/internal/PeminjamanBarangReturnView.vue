<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import { AxiosError } from "axios";

// --- Tipe Data ---
interface ReturnHeader {
  nomorPK: string; // Nomor Pengembalian (Auto)
  ref_nomor: string; // Nomor Peminjaman Asal
  tanggal: string; // Tanggal Pengembalian
  penerima: string; // Admin yang menerima
  pic_peminjam: string; // Orang yang meminjam (Readonly)
  keterangan: string; // Catatan tambahan
  cabang: string;
}

interface ReturnItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  qty_pinjam: number; // Total yang pernah dipinjam
  sisa_pinjam: number; // Sisa yang belum kembali
  jumlah_kembali: number; // Input qty yang dikembalikan sekarang
  barcode: string;
}

interface ApiReturnItem {
  pj_nomor: string;
  pic: string;
  pj_tanggal: string;
  pj_cab: string;
  ref_idrec_dtl: string;
  kode: string;
  ukuran: string;
  nama: string;
  qty_pinjam: number;
  qty_sudah_kembali: number;
  sisa_pinjam: number;
  barcode: string;
}

// --- Inisialisasi & State ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "56";

const loading = ref(true);
const isSaving = ref(false);
const scannedBarcode = ref("");
const barcodeInputRef = ref<HTMLInputElement | null>(null);

const formHeader = ref<ReturnHeader>({
  nomorPK: "AUTO",
  ref_nomor: route.params.nomor as string,
  tanggal: format(new Date(), "yyyy-MM-dd"),
  penerima: "",
  pic_peminjam: "",
  keterangan: "",
  cabang: authStore.user?.cabang || "",
});
const dialogPrint = reactive({
  show: false,
  nomor: "", // Ini akan diisi dengan nomor PJ (ref_nomor)
});

const items = ref<ReturnItem[]>([]);

const audioSuccess = new Audio("/audio/beep_success.mp3");
const audioError = new Audio("/audio/beep_error.mp3");

// --- Computed ---
const totalKembali = computed(() =>
  items.value.reduce((sum, item) => sum + (item.jumlah_kembali || 0), 0)
);

const headers = [
  { title: "No.", key: "no", sortable: false, width: "50px" },
  { title: "Kode Barang", key: "kode", sortable: false, width: "150px" },
  { title: "Barcode", key: "barcode", sortable: false, width: "120px" }, // <--- TAMBAHAN KOLOM BARCODE
  { title: "Nama Barang", key: "nama", sortable: false },
  { title: "Ukuran", key: "ukuran", sortable: false, width: "80px", align: "center" },
  { title: "Sisa Pinjam", key: "sisa_pinjam", sortable: false, align: "end", width: "100px" },
  { title: "Jml Kembali", key: "jumlah_kembali", sortable: false, align: "end", width: "110px" },
  { title: "Actions", key: "actions", sortable: false, width: "60px", align: "center" },
] as const;

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

// --- Methods ---

/**
 * Mengambil data barang yang masih dipinjam berdasarkan nomor referensi
 */
const fetchLoanData = async () => {
  loading.value = true;
  try {
    const response = await api.get(`/pengembalian-barang-form/loan/${formHeader.value.ref_nomor}`);
    if (response.data.length === 0) {
      toast.warning("Semua barang untuk dokumen ini sudah dikembalikan.");
      router.back();
      return;
    }

    items.value = response.data.map((it: ApiReturnItem, index: number) => ({
      ...it,
      id: index,
      jumlah_kembali: 0, // <--- Ubah jadi 0 agar defaultnya kosong
    }));

    formHeader.value.pic_peminjam = response.data[0].pic;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;

    toast.error(error.response?.data?.message || "Gagal memuat data pinjaman.");

    router.back();
  } finally {
    loading.value = false;
  }
};

const handleBarcodeScan = () => {
  if (!scannedBarcode.value) return;

  // Cari item di grid yang cocok dengan barcode yang di-scan
  const targetItem = items.value.find(
    (i) => i.barcode === scannedBarcode.value || i.kode === scannedBarcode.value
  );

  if (targetItem) {
    if (targetItem.jumlah_kembali < targetItem.sisa_pinjam) {
      targetItem.jumlah_kembali += 1;
      audioSuccess.play().catch(() => {});
      toast.success(`Scan OK: ${targetItem.nama}`);
    } else {
      audioError.play().catch(() => {});
      toast.warning("Jumlah kembali sudah mencapai batas sisa pinjam.");
    }
  } else {
    audioError.play().catch(() => {});
    toast.error("Barang tidak ditemukan dalam daftar pinjaman ini.");
  }

  scannedBarcode.value = "";
  nextTick(() => barcodeInputRef.value?.focus());
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

// Tahap 1: Validasi & Munculkan Dialog
const handleSaveRequest = () => {
  if (!formHeader.value.penerima) return toast.error("Nama penerima (Admin) wajib diisi.");

  const validItems = items.value.filter((i) => i.jumlah_kembali > 0);
  if (validItems.length === 0)
    return toast.error("Masukkan minimal satu barang yang dikembalikan.");

  for (const item of validItems) {
    if (item.jumlah_kembali > item.sisa_pinjam) {
      return toast.error(`Jumlah kembali ${item.nama} melebihi sisa pinjam!`);
    }
  }

  // Panggil fungsi showConfirmation yang sebelumnya unused
  showConfirmation(
    "Konfirmasi Simpan",
    `Apakah Anda yakin data pengembalian sudah benar?\nTotal barang kembali: ${totalKembali.value} Pcs`,
    () => executeSave()
  );
};

// Tahap 2: Eksekusi Simpan Permanen
const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: formHeader.value,
      items: items.value.filter((i) => i.jumlah_kembali > 0),
    };
    const response = await api.post("/pengembalian-barang-form/save", payload);
    toast.success(response.data.message || "Pengembalian berhasil disimpan.");

    // Tampilkan dialog cetak (menggunakan nomor PJ asli)
    dialogPrint.nomor = formHeader.value.ref_nomor;
    dialogPrint.show = true;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menyimpan pengembalian.");
  } finally {
    isSaving.value = false;
  }
};

const getReturnQtyClass = (item: ReturnItem) => {
  if (item.jumlah_kembali > item.sisa_pinjam) return "text-red font-weight-bold";
  if (item.jumlah_kembali === item.sisa_pinjam) return "text-green-darken-3 font-weight-bold";
  return "";
};

onMounted(fetchLoanData);
</script>

<template>
  <PageLayout title="Entry Pengembalian Barang" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        size="small"
        prepend-icon="mdi-content-save"
        color="primary"
        :loading="isSaving"
        @click="handleSaveRequest"
      >
        Simpan Pengembalian
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close" variant="tonal" @click="router.back()">
        Tutup
      </v-btn>
    </template>

    <div v-if="loading" class="state-container"><v-progress-circular indeterminate /></div>
    <div v-else class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-text-field
            label="No. Pengembalian"
            v-model="formHeader.nomorPK"
            readonly
            variant="filled"
            density="compact"
            hide-details
          />
          <v-text-field
            label="Ref. Nomor Pinjam"
            v-model="formHeader.ref_nomor"
            readonly
            variant="filled"
            density="compact"
            hide-details
            bg-color="blue-lighten-5"
          />
          <v-text-field
            label="PIC Peminjam"
            v-model="formHeader.pic_peminjam"
            readonly
            variant="filled"
            density="compact"
            hide-details
          />
          <v-text-field
            label="Tanggal Kembali"
            v-model="formHeader.tanggal"
            type="date"
            density="compact"
            variant="outlined"
            hide-details
          />
          <v-text-field
            label="Penerima (Admin)"
            v-model="formHeader.penerima"
            variant="outlined"
            density="compact"
            hide-details
            placeholder="Admin yang menerima barang..."
          />
          <v-textarea
            label="Keterangan / Kondisi Barang"
            v-model="formHeader.keterangan"
            variant="outlined"
            density="compact"
            hide-details
            rows="4"
            placeholder="Catatan kondisi barang saat kembali..."
          />
          <v-text-field
            label="Store / Cabang"
            :model-value="formHeader.cabang"
            readonly
            variant="filled"
            density="compact"
            hide-details
          />
        </div>
      </div>

      <div class="right-column">
        <div class="scanner-wrapper">
          <v-text-field
            ref="barcodeInputRef"
            v-model="scannedBarcode"
            label="Cepat: Scan Barcode Barang yang Kembali..."
            placeholder="Scan untuk tambah jumlah kembali..."
            variant="outlined"
            density="compact"
            prepend-inner-icon="mdi-barcode-scan"
            hide-details
            clearable
            @keydown.enter.prevent="handleBarcodeScan"
            autofocus
          />
        </div>

        <div class="table-container">
          <v-data-table
            :headers="headers"
            :items="items"
            class="desktop-table header-browse-blue"
            density="compact"
            fixed-header
            :items-per-page="-1"
          >
            <template v-slot:[`item.no`]="{ index }">{{ index + 1 }}</template>

            <template v-slot:[`item.sisa_pinjam`]="{ value }">
              <div class="text-end font-weight-bold text-blue-darken-4">{{ value }}</div>
            </template>

            <template #[`item.jumlah_kembali`]="{ item }">
              <v-text-field
                v-model.number="item.jumlah_kembali"
                type="number"
                density="compact"
                hide-details
                variant="underlined"
                :class="getReturnQtyClass(item)"
                @focus="$event.target.select()"
              />
            </template>

            <template v-slot:[`item.actions`]="{ index }">
              <v-btn
                icon="mdi-refresh"
                color="grey"
                variant="text"
                size="x-small"
                title="Reset ke 0"
                @click="items[index].jumlah_kembali = 0"
              />
            </template>

            <template #bottom></template>

            <template #tfoot>
              <tr class="font-weight-bold bg-grey-lighten-4">
                <td colspan="5" class="text-right">TOTAL KEMBALI:</td>
                <td class="text-right text-primary text-h6">{{ totalKembali }}</td>
                <td></td>
              </tr>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="450px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold py-3 bg-grey-lighten-4">
          <v-icon start color="primary">mdi-help-circle</v-icon>
          {{ dialogConfirm.title }}
        </v-card-title>
        <v-card-text class="pa-5 text-body-1">{{ dialogConfirm.text }}</v-card-text>
        <v-divider></v-divider>
        <v-card-actions class="pa-3">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            class="px-6"
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
  gap: 16px;
  height: calc(100vh - 120px);
  padding: 12px;
}

.v-card :deep(.v-label),
.desktop-table :deep(th),
.desktop-table :deep(td),
.v-card :deep(input),
.v-card :deep(textarea) {
  font-size: 11px !important;
}

.left-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.desktop-form-section {
  padding: 16px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background-color: white;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.scanner-wrapper {
  background-color: #fff3e0;
  /* Warna Oranye Muda untuk membedakan dengan form Pinjam */
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #ffe0b2;
}

.table-container {
  flex-grow: 1;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  overflow: hidden;
}

.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  height: 36px !important;
}

.text-primary {
  color: #0d47a1 !important;
}

.state-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 300px;
}
</style>

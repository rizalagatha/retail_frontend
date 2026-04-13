<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import { useToast } from "vue-toastification";
import PageLayout from "@/components/PageLayout.vue";
import type { AxiosError } from "axios";
import api from "@/services/api";
import { formatRupiah } from "@/utils/formatRupiah";
import axios from "axios";

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "58";

// [PERUBAHAN 1] Interface untuk file yang bisa menampung banyak data
interface PettyCashFile {
  fileRaw: File | null;
  fileName: string;
  previewUrl: string;
  isPdf: boolean;
}

interface PettyCashItem {
  id: number;
  tanggal: string;
  pcv: number | string;
  keterangan: string;
  no_transaksi: string;
  kategori: string;
  nominal: number;
  files: PettyCashFile[]; // [PERUBAHAN 2] Array of files
}

interface RawDetail {
  pcd_tanggal: string;
  pcd_pcv: number | string;
  pcd_keterangan: string;
  pcd_no_transaksi?: string;
  no_transaksi?: string; // alias dari backend
  pcd_kategori: string;
  pcd_nominal: number;
  pcd_file?: string;
  file?: string; // alias dari backend
}

const isEditMode = ref(false);
const isLoading = ref(true);
const isSaving = ref(false);

const dialogBantuan = ref(false);
const dialogPreview = ref(false);
const previewImageSrc = ref("");

// State Dialog Konfirmasi
const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const kategoriOptions = [
  "BIAYA POS DAN PENGIRIMAN",
  "BIAYA JAMUAN TAMU",
  "BIAYA PERLENGKAPAN KANTOR/TOKO",
  "BIAYA PERJALANAN DINAS",
  "BIAYA PERBAIKAN DAN PERAWATAN",
  "BIAYA SOSIAL KEMASYARAKATAN",
  "BIAYA KEBERSIHAN DAN RUMAH TANGGA",
  "BIAYA KONSUMSI KANTOR/PANTRY",
];

const infoKategori = [
  {
    jenis: "BIAYA POS DAN PENGIRIMAN",
    ket: "Biaya yang terkait dengan proses pengiriman dokumen dan stok antar store, DC atau pelanggan (di bawah ketentuan 100 pcs yang ditentukan wajib diklaimkan ke customer terkait)",
  },
  {
    jenis: "BIAYA JAMUAN TAMU",
    ket: "Biaya yang terkait dengan jamuan tamu khusus yang datang ke store, misal influencer dan teknisi berdasarkan approval dari STORE MANAGER atau SUPERVISOR",
  },
  {
    jenis: "BIAYA PERLENGKAPAN KANTOR/TOKO",
    ket: "Biaya yang terkait dengan kebutuhan alat tulis kantor dan kebutuhan primer toko yang telah ada persetujuan dari STORE MANAGER atau SUPERVISOR, misal : brosur dan alat peraga toko",
  },
  {
    jenis: "BIAYA PERJALANAN DINAS",
    ket: "Biaya yang terkait dengan BBM Karyawan yang ditunjuk melaksanakan tugas khusus berdasarkan approval dari STORE MANAGER atau SUPERVISOR",
  },
  {
    jenis: "BIAYA PERBAIKAN DAN PERAWATAN",
    ket: "Biaya yang terkait dengan proses perbaikan primer terkait alat-alat yang ada di masing-masing store dengan nilai perbaikan maksimal Rp. 200.000, lebih dari ketentuan tersebut maka wajib mengajukan approval ke STORE MANAGER atau SUPERVISOR",
  },
  {
    jenis: "BIAYA SOSIAL KEMASYARAKATAN",
    ket: "Biaya yang terkait dengan hubungan antara toko dengan masyarakat sekitar sesuai dengan ketentuan yang berlaku, misal : Jum'at berkah, iuran warga, dan sumbangan sosial",
  },
  {
    jenis: "BIAYA KEBERSIHAN DAN RUMAH TANGGA",
    ket: "Biaya yang terkait dengan kebutuhan alat-alat kebersihan dan rumah tangga sesuai dengan standard kebersihan yang telah ditentukan oleh DIVISI GENERAL AFFAIR",
  },
  {
    jenis: "BIAYA KONSUMSI KANTOR/PANTRY",
    ket: "Biaya yang terkait dengan kebutuhan konsumsi dapur atau pantry sesuai dengan azas kewajaran",
  },
];

const header = reactive({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang || "",
  keterangan: "",
  modal: 0,
  terpakai: 0,
  saldo: 0,
});

const items = ref<PettyCashItem[]>([]);

const canInsert = computed(() => authStore.can(MENU_ID, "insert"));
const canEdit = computed(() => authStore.can(MENU_ID, "edit"));
const canSave = computed(() => (isEditMode.value ? canEdit.value : canInsert.value));
const pageTitle = computed(() =>
  isEditMode.value ? "Ubah Laporan Petty Cash" : "Buat Laporan Petty Cash"
);

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const calculateTotals = () => {
  const total = items.value.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
  header.terpakai = total;
  header.saldo = Number(header.modal) - total;
};

const fetchCurrentSaldo = async () => {
  try {
    const response = await api.get("/petty-cash-form/saldo");
    // Set saldo yang didapat dari tabel mutasi
    header.modal = response.data.saldo !== null ? Number(response.data.saldo) : 1000000;
  } catch (error) {
    console.error("Gagal memuat saldo. Menggunakan default.", error);
    header.modal = 1000000; // Fallback jika terjadi error
  }
};

const addNewRow = () => {
  items.value.push({
    id: Date.now() + Math.random(),
    tanggal: format(new Date(), "yyyy-MM-dd"),
    pcv: "",
    keterangan: "",
    no_transaksi: "",
    kategori: "",
    nominal: 0,
    files: [], // [PERUBAHAN 3] Kosongkan array saat nambah baris
  });
};

const removeRow = (id: number) => {
  items.value = items.value.filter((item) => item.id !== id);
  calculateTotals();
  if (items.value.length === 0) addNewRow();
};

// [PERUBAHAN 4] Fungsi Handle Multiple File
const handleFileChange = (event: Event, item: PettyCashItem) => {
  const target = event.target as HTMLInputElement;
  if (!target.files) return;

  for (let i = 0; i < target.files.length; i++) {
    const file = target.files[i];

    if (file.size > 2 * 1024 * 1024) {
      toast.error(`Ukuran file ${file.name} maksimal 2MB!`);
      continue;
    }

    item.files.push({
      fileRaw: file,
      fileName: "",
      previewUrl: URL.createObjectURL(file),
      isPdf: file.type === "application/pdf",
    });
  }

  // Reset input agar bisa pilih foto lain/yang sama
  target.value = "";
};

// [PERUBAHAN 5] Fungsi Hapus 1 Foto dalam baris
const removeFile = (item: PettyCashItem, fileIndex: number) => {
  item.files.splice(fileIndex, 1);
};

const showPreview = (fileData: PettyCashFile) => {
  if (!fileData.previewUrl) return;

  if (fileData.isPdf) {
    window.open(fileData.previewUrl, "_blank");
  } else {
    previewImageSrc.value = fileData.previewUrl;
    dialogPreview.value = true;
  }
};

const validateData = () => {
  if (header.modal <= 0) return "Modal PC harus lebih dari 0.";
  if (items.value.length === 0) return "Minimal harus ada 1 transaksi pengeluaran.";

  for (let i = 0; i < items.value.length; i++) {
    const item = items.value[i];
    if (!item.keterangan) return `Keterangan pada baris ${i + 1} harus diisi.`;
    if (item.nominal <= 0) return `Nominal pada baris ${i + 1} tidak boleh 0.`;

    if (item.kategori && item.kategori.toUpperCase().includes("PENGIRIMAN")) {
      if (!item.no_transaksi || item.no_transaksi.trim() === "") {
        return `Nomor Transaksi / Resi wajib diisi untuk kategori Pengiriman pada baris ${i + 1}.`;
      }
    }
  }

  if (header.saldo < 0) return "Saldo PC tidak boleh minus! Total pengeluaran melebihi Modal.";
  return null;
};

const handleSaveRequest = () => {
  const errorMsg = validateData();
  if (errorMsg) {
    toast.warning(errorMsg);
    return;
  }
  showConfirmation(
    "Konfirmasi Simpan",
    "Apakah Anda yakin data laporan Petty Cash sudah benar dan ingin disimpan?",
    executeSave
  );
};

// [PERUBAHAN 6] Logic Execute Save untuk Multiple Files
const executeSave = async () => {
  isSaving.value = true;
  try {
    const formData = new FormData();
    formData.append("header", JSON.stringify({ ...header }));

    const payloadDetails = items.value.map((item, index) => {
      const existingFiles: string[] = [];

      // Loop semua file dalam array files
      item.files.forEach((f, fIdx) => {
        if (f.fileRaw) {
          // File baru dari harddisk, append dengan index dinamis
          formData.append(`file_${index}_${fIdx}`, f.fileRaw);
        } else if (f.fileName) {
          // File lama (saat Edit), simpan namanya untuk dikirim
          existingFiles.push(f.fileName);
        }
      });

      return {
        index,
        tanggal: item.tanggal,
        pcv: index + 1,
        keterangan: item.keterangan,
        no_transaksi: item.no_transaksi,
        kategori: item.kategori,
        nominal: item.nominal,
        existingFiles, // Kirim list file lama ke backend
      };
    });

    formData.append("details", JSON.stringify(payloadDetails));
    formData.append("isEditMode", String(isEditMode.value));

    const response = await api.post("/petty-cash-form/save", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    toast.success(response.data.message);
    router.push("/transaksi/internal/petty-cash");
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal menyimpan Laporan.");
  } finally {
    isSaving.value = false;
  }
};

const handleTutup = () => {
  const hasData = items.value.some((i) => i.keterangan || i.nominal > 0);
  if (hasData || isEditMode.value) {
    showConfirmation(
      "Batalkan Perubahan?",
      "Ada data yang belum disimpan. Yakin ingin keluar dari halaman ini?",
      () => router.back()
    );
  } else {
    router.back();
  }
};

const getApiBaseUrl = () => {
  const apiUrl = (api.defaults.baseURL || import.meta.env.VITE_API_BASE_URL || "") as string;
  return apiUrl.replace(/\/$/, "");
};

// [PERUBAHAN 7] Load Data dari format String Koma (NOTA-1.jpg,NOTA-2.pdf)
const loadData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/petty-cash-form/${nomor}`);
    const data = response.data;

    // Gunakan fungsi baru yang mempertahankan /api
    const apiBaseUrl = getApiBaseUrl();

    isEditMode.value = true;
    header.nomor = data.header.pc_nomor;
    header.tanggal = format(parseISO(data.header.pc_tanggal), "yyyy-MM-dd");
    header.cabang = data.header.pc_cab;
    header.keterangan = data.header.pc_ket || "";

    // [PERBAIKAN KUNCI]: Proteksi Modal agar tidak minus
    // Jika dari database modalnya 0 atau kosong, paksa tarik dari saldo aktif
    if (data.header.pc_modal && Number(data.header.pc_modal) > 0) {
      header.modal = Number(data.header.pc_modal);
    } else {
      await fetchCurrentSaldo();
    }

    items.value = data.details.map((d: RawDetail) => {
      const filesString = d.pcd_file || d.file || "";
      const filesArray = filesString ? filesString.split(",").map((f) => f.trim()) : [];

      const mappedFiles = filesArray.map((fName: string) => ({
        fileRaw: null,
        fileName: fName,
        previewUrl: `${apiBaseUrl}/uploads/pettycash/${fName}`,
        isPdf: fName.toLowerCase().endsWith(".pdf"),
      }));

      return {
        id: Math.random(),
        tanggal: format(parseISO(d.pcd_tanggal), "yyyy-MM-dd"),
        pcv: d.pcd_pcv,
        keterangan: d.pcd_keterangan,
        no_transaksi: d.pcd_no_transaksi || d.no_transaksi || "",
        kategori: d.pcd_kategori,
        nominal: d.pcd_nominal,
        files: mappedFiles,
      };
    });

    calculateTotals();
  } catch (error: unknown) {
    let msg = "Gagal memuat data laporan.";
    if (axios.isAxiosError(error)) {
      msg = error.response?.data?.message || msg;
    }
    toast.error(msg);
    router.push("/transaksi/internal/petty-cash");
  } finally {
    isLoading.value = false;
  }
};

watch(() => header.modal, calculateTotals);

onMounted(async () => {
  if (route.params.nomor) {
    await loadData(route.params.nomor as string);
  } else {
    // [PERBAIKAN] Tarik saldo mutasi sebelum menampilkan form
    await fetchCurrentSaldo();
    addNewRow();
    calculateTotals();
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-wallet-plus" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="canSave"
        color="primary"
        size="small"
        prepend-icon="mdi-content-save"
        :loading="isSaving"
        @click="handleSaveRequest"
        >Simpan</v-btn
      >
      <v-btn size="small" prepend-icon="mdi-close" variant="tonal" @click="handleTutup"
        >Batal / Tutup</v-btn
      >
    </template>

    <div v-if="isLoading" class="d-flex justify-center align-center h-100">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
    </div>

    <div v-else class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-text-field
            label="Cabang Toko"
            v-model="header.cabang"
            readonly
            variant="filled"
            density="compact"
            hide-details
          />
          <v-text-field
            label="Tanggal Laporan"
            v-model="header.tanggal"
            type="date"
            variant="outlined"
            density="compact"
            hide-details
          />
          <v-text-field
            label="Nomor Dokumen"
            v-model="header.nomor"
            readonly
            variant="filled"
            density="compact"
            hide-details
            placeholder="Otomatis"
          />
          <v-textarea
            label="Keterangan Umum"
            v-model="header.keterangan"
            variant="outlined"
            density="compact"
            hide-details
            rows="4"
            placeholder="Cth: Reimbursement Oktober..."
          />
        </div>
        <div
          class="desktop-form-section"
          style="background-color: #f8f9fa; border: 2px solid #e0e0e0"
        >
          <div class="d-flex justify-space-between align-center mb-3">
            <span class="text-caption font-weight-bold text-grey-darken-1">MODAL PETTY CASH</span>
            <span class="font-weight-bold" title="Saldo berjalan otomatis dari sistem">
              {{ formatRupiah(header.modal) }}
            </span>
          </div>

          <div class="d-flex justify-space-between align-center mb-3">
            <span class="text-caption font-weight-bold text-grey-darken-1">TOTAL TERPAKAI (-)</span>
            <span class="font-weight-bold text-error">{{ formatRupiah(header.terpakai) }}</span>
          </div>

          <v-divider class="mb-3"></v-divider>

          <div
            class="d-flex justify-space-between align-center rounded"
            :class="header.saldo < 0 ? 'bg-red-lighten-4' : 'bg-blue-lighten-5'"
            style="padding: 10px"
          >
            <span class="text-subtitle-2 font-weight-black">SALDO (SISA)</span>
            <span
              class="text-subtitle-1 font-weight-black"
              :class="header.saldo < 0 ? 'text-red-darken-4' : 'text-success'"
            >
              {{ formatRupiah(header.saldo) }}
            </span>
          </div>
        </div>
      </div>

      <div class="right-column">
        <div class="table-container">
          <div class="pa-2 bg-blue-lighten-5 border-b d-flex align-center">
            <v-btn
              size="small"
              color="primary"
              variant="elevated"
              prepend-icon="mdi-plus"
              @click="addNewRow"
            >
              Tambah Baris Nota
            </v-btn>
            <v-spacer></v-spacer>
            <span class="text-caption font-weight-bold text-primary">
              Total Baris: {{ items.length }}
            </span>
          </div>
          <div class="table-wrapper">
            <table class="w-100 petty-table desktop-table">
              <thead>
                <tr>
                  <th width="40" class="text-center">NO</th>
                  <th width="110">TANGGAL</th>
                  <th width="50" class="text-center">PCV</th>
                  <th>DESCRIPTION</th>
                  <th width="240">
                    <div class="d-flex align-center gap-1">
                      KATEGORI
                      <v-btn
                        icon="mdi-help-circle"
                        size="x-small"
                        variant="text"
                        color="white"
                        title="Lihat Ketentuan Biaya"
                        @click="dialogBantuan = true"
                      />
                    </div>
                  </th>
                  <th width="120" class="text-right">NOMINAL (Rp)</th>
                  <th width="200">UPLOAD NOTA</th>
                  <th width="40" class="text-center">ACT</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in items" :key="item.id">
                  <td class="text-center bg-grey-lighten-4">{{ index + 1 }}</td>
                  <td>
                    <input type="date" v-model="item.tanggal" class="compact-input w-100" />
                  </td>
                  <td class="text-center font-weight-bold text-grey-darken-1 bg-grey-lighten-4">
                    {{ index + 1 }}
                  </td>
                  <td>
                    <input
                      type="text"
                      v-model="item.keterangan"
                      class="compact-input w-100"
                      placeholder="Ket. pengeluaran..."
                    />
                    <div v-if="item.kategori && item.kategori.includes('PENGIRIMAN')" class="mt-1">
                      <input
                        type="text"
                        v-model="item.no_transaksi"
                        class="compact-input w-100 no-resi-input"
                        placeholder="No Transaksi / Resi (Wajib)"
                      />
                    </div>
                  </td>
                  <td>
                    <select
                      v-model="item.kategori"
                      class="compact-input w-100 select-style"
                      title="Pilih Kategori"
                    >
                      <option v-for="kat in kategoriOptions" :key="kat" :value="kat">
                        {{ kat }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      v-model.number="item.nominal"
                      class="compact-input w-100 text-right font-weight-bold text-error"
                      @blur="calculateTotals"
                    />
                  </td>

                  <td class="py-1">
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf"
                      class="file-input w-100 mb-1"
                      @change="handleFileChange($event, item)"
                    />

                    <div v-if="item.files.length > 0" class="d-flex flex-wrap gap-1 mt-1">
                      <div
                        v-for="(f, fIdx) in item.files"
                        :key="fIdx"
                        class="d-flex align-center bg-grey-lighten-3 rounded px-1 border"
                        style="font-size: 10px; max-width: 100%"
                      >
                        <v-btn
                          icon
                          size="x-small"
                          variant="text"
                          color="info"
                          class="mr-1"
                          style="width: 20px; height: 20px"
                          @click="showPreview(f)"
                        >
                          <v-icon size="x-small">{{
                            f.isPdf ? "mdi-file-pdf-box" : "mdi-image"
                          }}</v-icon>
                        </v-btn>
                        <span class="text-truncate" style="max-width: 45px">N-{{ fIdx + 1 }}</span>
                        <v-btn
                          icon
                          size="x-small"
                          variant="text"
                          color="error"
                          style="width: 20px; height: 20px"
                          @click="removeFile(item, fIdx)"
                        >
                          <v-icon size="x-small">mdi-close</v-icon>
                        </v-btn>
                      </div>
                    </div>
                  </td>

                  <td class="text-center">
                    <v-btn
                      icon="mdi-delete"
                      size="x-small"
                      variant="text"
                      color="error"
                      @click="removeRow(item.id)"
                    ></v-btn>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="450px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold py-3 bg-grey-lighten-4">
          <v-icon start color="primary">mdi-help-circle</v-icon> {{ dialogConfirm.title }}
        </v-card-title>
        <v-card-text class="pa-5 text-body-1">{{ dialogConfirm.text }}</v-card-text>
        <v-divider></v-divider>
        <v-card-actions class="pa-3">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            class="px-6"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogPreview" max-width="850px">
      <v-card class="rounded-lg">
        <v-card-title
          class="bg-grey-darken-3 text-white text-subtitle-1 font-weight-bold d-flex justify-space-between align-center py-2 px-4"
        >
          <div class="d-flex align-center">
            <v-icon size="small" class="me-2">mdi-image-search</v-icon> Preview Nota
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            size="small"
            @click="dialogPreview = false"
          ></v-btn>
        </v-card-title>
        <v-card-text
          class="pa-4 bg-grey-lighten-3 text-center d-flex justify-center align-center"
          style="min-height: 400px"
        >
          <img
            :src="previewImageSrc"
            alt="Preview Nota"
            style="
              max-width: 100%;
              max-height: 75vh;
              object-fit: contain;
              border: 1px solid #ccc;
              background: white;
              border-radius: 4px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            "
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogBantuan" max-width="900px" scrollable>
      <v-card>
        <v-card-title
          class="bg-primary text-white text-subtitle-1 font-weight-bold d-flex justify-space-between align-center py-2 px-4"
        >
          JENIS BIAYA DAN KETENTUAN PETTY CASH STORE
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            size="small"
            @click="dialogBantuan = false"
          ></v-btn>
        </v-card-title>
        <v-card-text class="pa-0">
          <table class="w-100 help-table">
            <thead>
              <tr>
                <th width="50" class="text-center bg-orange-lighten-1">NO.</th>
                <th width="250" class="bg-orange-lighten-1">JENIS BIAYA</th>
                <th class="bg-orange-lighten-1">KETERANGAN BIAYA</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(info, index) in infoKategori" :key="index">
                <td class="text-center font-weight-bold">{{ index + 1 }}</td>
                <td class="font-weight-bold">{{ info.jenis }}</td>
                <td>{{ info.ket }}</td>
              </tr>
            </tbody>
          </table>
        </v-card-text>
        <v-card-actions class="pa-3 bg-grey-lighten-4">
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="elevated" @click="dialogBantuan = false">Tutup</v-btn>
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
  padding: 12px;
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
.gap-1 {
  gap: 4px;
}
:deep(.v-label),
:deep(input),
:deep(select),
:deep(textarea) {
  font-size: 11px !important;
}
.table-container {
  flex-grow: 1;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: white;
}
.table-wrapper {
  overflow-y: auto;
  flex-grow: 1;
}
.petty-table {
  border-collapse: collapse;
  font-size: 11px !important;
}
.petty-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
}
.desktop-table thead tr th {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  height: 36px !important;
  padding: 6px;
  text-align: left;
  border-bottom: 2px solid #1976d2;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
  white-space: nowrap;
}
.petty-table td {
  padding: 2px 4px;
  border-bottom: 1px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
  vertical-align: middle;
  height: 32px;
}
.border-top {
  border-top: 1px solid rgba(0, 0, 0, 0.12);
}
.compact-input {
  border: 1px solid transparent;
  padding: 4px 6px;
  border-radius: 4px;
  outline: none;
  background-color: transparent;
  transition: all 0.2s;
  font-size: 11px !important;
  height: 24px;
}
.compact-input:hover {
  border-color: #e0e0e0;
  background-color: #fafafa;
}
.compact-input:focus {
  border-color: #1976d2;
  background-color: #fff;
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
}
.select-style {
  appearance: menulist;
  cursor: pointer;
}
.file-input {
  font-size: 11px !important;
  max-width: 140px;
}
.file-input::file-selector-button {
  background-color: #f5f5f5;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 10px;
}
.summary-footer {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  flex: none;
}
.summary-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  background: white;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  min-width: 180px;
}
.summary-box .label {
  font-size: 11px !important;
  color: #757575;
  text-transform: uppercase;
}
.summary-box .value {
  font-size: 14px !important;
  font-weight: 700;
  margin-top: 4px;
}
.summary-input {
  text-align: right;
  font-size: 14px !important;
  font-weight: 700;
  border: 1px solid #e0e0e0 !important;
  margin-top: 4px;
  height: 26px;
}
.total-box {
  background-color: #f1f8ff;
  border-color: #1976d2;
}
.help-table {
  border-collapse: collapse;
  font-size: 12px;
}
.help-table th,
.help-table td {
  border: 1px solid #e0e0e0;
  padding: 10px;
}
.help-table tbody tr:nth-child(even) {
  background-color: #f9f9f9;
}
.no-resi-input {
  background-color: #e3f2fd !important;
  border: 1px dashed #64b5f6 !important;
}
.no-resi-input:focus {
  border-color: #1976d2 !important;
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import SalesSearchModal from "@/components/lookup/SalesSearchModal.vue";
import JenisOrderStokSearchModal from "@/components/lookup/JenisOrderStokSearchModal.vue";
import WorkshopSearchModal from "@/components/lookup/WorkshopSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { format } from "date-fns";
import type { AxiosError } from "axios";

interface DetailItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  panjang: number | null;
  lebar: number | null;
  jumlah: number | null;
}
interface TemplateItem {
  kode: string;
  nama: string;
  ukuran: string;
  panjang?: number | null;
  lebar?: number | null;
}
interface SavedDetailItem {
  sds_kode: string;
  sds_ukuran: string;
  sds_jumlah: number;
  sds_panjang?: number | null;
  sds_lebar?: number | null;
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "36";

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => (isEditMode.value ? `Ubah SO DTF Stok` : "Buat SO DTF Stok Baru"));
const canView = computed(() => authStore.can(MENU_ID, "view"));
const canInsert = computed(() => authStore.can(MENU_ID, "insert"));
const canEdit = computed(() => authStore.can(MENU_ID, "edit"));
const canSave = computed(() => (isEditMode.value ? canEdit.value : canInsert.value));

const initialFormState = {
  nomor: null as string | null,
  tanggal: format(new Date(), "yyyy-MM-dd"),
  tglPengerjaan: format(new Date(), "yyyy-MM-dd"),
  salesKode: "",
  salesNama: "",
  jenisOrderKode: "",
  jenisOrderNama: "",
  namaDtf: "",
  desain: "",
  workshopKode: authStore.user?.cabang || "",
  workshopNama: "",
  keterangan: "",
  imageUrl: null as string | null, // Tambahkan ini
};

const form = ref({ ...initialFormState });
const items = ref<DetailItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);

// State untuk modals & dialogs
const isSalesSearchVisible = ref(false);
const isJenisOrderSearchVisible = ref(false);
const isWorkshopSearchVisible = ref(false);
const isImageFullscreenVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref("");
const pendingAction = ref<(() => void) | null>(null);

// State untuk gambar
const imagePreview = ref<string | undefined>(undefined);
const imageFile = ref<File | null>(null);
const isImageUploading = ref(false);

const totalJumlah = computed(() => items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0));

const tableHeaders = [
  { title: "No.", key: "no", sortable: false, width: "40px" },
  { title: "Kode", key: "kode", sortable: false, width: "120px" },
  { title: "Nama Barang", key: "nama", sortable: false, width: "250px" },
  { title: "Ukuran", key: "ukuran", sortable: false, width: "100px" },
  { title: "Panjang(cm)", key: "panjang", sortable: false, width: "100px", align: "end" },
  { title: "Lebar(cm)", key: "lebar", sortable: false, width: "100px", align: "end" },
  { title: "Jumlah", key: "jumlah", sortable: false, width: "120px" },
] as const;

const fetchTemplateItems = async (jenisOrder: string) => {
  if (!jenisOrder) {
    items.value = [];
    return;
  }
  isLoading.value = true;
  try {
    const response = await api.get(`/so-dtf-stok-form/lookup/template-items/${jenisOrder}`);
    items.value = response.data.map((item: TemplateItem, index: number) => ({
      id: Date.now() + index,
      kode: item.kode,
      nama: item.nama,
      ukuran: item.ukuran,
      panjang: item.panjang ?? null,
      lebar: item.lebar ?? null,
      jumlah: 0,
    }));
    form.value.namaDtf = jenisOrder === "SD" ? "STICKER DTF" : "STICKER DTF PREMIUM";
  } catch {
    toast.error("Gagal memuat template item.");
  } finally {
    isLoading.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/so-dtf-stok-form/${nomor}`);
    const { header, details } = response.data;

    form.value.nomor = header.sd_nomor;
    form.value.tanggal = format(new Date(header.sd_tanggal), "yyyy-MM-dd");
    form.value.tglPengerjaan = format(new Date(header.sd_datekerja), "yyyy-MM-dd");
    form.value.salesKode = header.sd_sal_kode;
    form.value.salesNama = header.sal_nama;
    form.value.jenisOrderKode = header.sd_jo_kode;
    form.value.jenisOrderNama = header.jo_nama;
    form.value.namaDtf = header.sd_nama;
    form.value.desain = header.sd_desain;
    form.value.workshopKode = header.sd_workshop;
    form.value.workshopNama = header.pab_nama;
    form.value.keterangan = header.sd_ket;
    form.value.imageUrl = header.imageUrl || null;

    imagePreview.value = getFullImageUrl(header.imageUrl);

    await fetchTemplateItems(header.sd_jo_kode);

    details.forEach((savedItem: SavedDetailItem) => {
      const itemToUpdate = items.value.find(
        (i) => i.kode === savedItem.sds_kode && i.ukuran === savedItem.sds_ukuran
      );
      if (itemToUpdate) {
        itemToUpdate.jumlah = savedItem.sds_jumlah;
        itemToUpdate.panjang = savedItem.sds_panjang ?? null;
        itemToUpdate.lebar = savedItem.sds_lebar ?? null;
      }
    });

    await nextTick();
    markAsSaved();
  } catch {
    toast.error("Gagal memuat data SO Stok.");
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const save = async () => {
  if (!canSave.value) {
    toast.error("Anda tidak memiliki izin untuk menyimpan data ini.");
    return;
  }
  // --- Validasi Data Sebelum Simpan ---
  if (!form.value.salesKode) {
    toast.error("Sales harus diisi.");
    return;
  }
  if (!form.value.jenisOrderKode) {
    toast.error("Jenis Order harus diisi.");
    return;
  }

  const validItems = items.value.filter((item) => item.jumlah && item.jumlah > 0);
  if (validItems.length === 0) {
    toast.error("Detail item harus diisi, pastikan ada jumlah yang lebih dari 0.");
    return;
  }

  // --- Proses Penyimpanan ---
  isSaving.value = true;
  const payload = {
    header: form.value,
    details: items.value.filter((item) => item.jumlah && item.jumlah > 0),
  };

  let nomorSoDtf = form.value.nomor;

  try {
    let response;
    if (isEditMode.value && nomorSoDtf) {
      response = await api.put(`/so-dtf-stok-form/${nomorSoDtf}`, payload);
      toast.success("Data berhasil diperbarui.");
    } else {
      response = await api.post("/so-dtf-stok-form", payload);
      nomorSoDtf = response.data.nomor;
      toast.success(`Data berhasil disimpan dengan nomor: ${nomorSoDtf}`);
    }

    markAsSaved();

    // Logika upload gambar
    if (!isEditMode.value && imageFile.value && nomorSoDtf) {
      const uploadSuccess = await uploadImageToServer(nomorSoDtf);
      if (!uploadSuccess) {
        toast.warning("Data berhasil disimpan, tapi gambar gagal diunggah.");
      }
    }

    router.push("/transaksi/penjualan/dtf/so-dtf-stok");
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const getFullImageUrl = (path: string | null): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  // Langsung return path aslinya (/images/K01/...), Nginx akan menyambung domainnya otomatis!
  return path;
};

const resetForm = () => {
  form.value = { ...initialFormState };
  items.value = [];
  imagePreview.value = undefined;
  imageFile.value = null;
  markAsSaved();
  toast.info("Form telah dikosongkan.");
};

const closeForm = () => {
  router.push("/transaksi/penjualan/dtf/so-dtf-stok");
};

const handleImageUpload = async () => {
  await nextTick();

  const file = imageFile.value;

  if (!file) {
    imagePreview.value = form.value.imageUrl ? getFullImageUrl(form.value.imageUrl) : undefined;
    return;
  }

  // Validasi ukuran
  if (file.size > 1024 * 1024) {
    toast.error("Ukuran file tidak boleh lebih dari 1MB.");
    imageFile.value = null;
    return;
  }

  // Validasi tipe
  if (!["image/jpeg", "image/jpg", "image/png", "image/gif"].includes(file.type)) {
    toast.error("Tipe file tidak valid. Gunakan JPG, PNG, atau GIF.");
    imageFile.value = null;
    return;
  }

  // Jika dalam mode edit dan sudah ada nomor, langsung upload
  if (form.value.nomor) {
    await uploadImageToServer(form.value.nomor);
  } else {
    // Jika mode tambah baru, hanya buat preview sementara
    imagePreview.value = URL.createObjectURL(file);
    toast.info("Gambar akan diupload setelah data disimpan");
  }
};

const uploadImageToServer = async (nomor: string): Promise<boolean> => {
  if (!imageFile.value) return true;

  isImageUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("image", imageFile.value);

    const response = await api.post(`/so-dtf-stok-form/upload-image/${nomor}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (response.data.success) {
      form.value.imageUrl = response.data.imageUrl;

      if (imagePreview.value && imagePreview.value.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview.value);
      }

      imagePreview.value = getFullImageUrl(response.data.imageUrl);
      imageFile.value = null;

      toast.success("Gambar berhasil diunggah");
      return true;
    } else {
      throw new Error(response.data.message || "Upload gagal");
    }
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error("Upload gagal: " + (axiosError.response?.data?.message || axiosError.message));
    return false;
  } finally {
    isImageUploading.value = false;
  }
};

const clearImage = () => {
  if (imagePreview.value && imagePreview.value.startsWith("blob:")) {
    URL.revokeObjectURL(imagePreview.value);
  }
  imagePreview.value = undefined;
  imageFile.value = null;
  form.value.imageUrl = null;
};

const showConfirmation = (action: () => void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
};

const executePendingAction = () => {
  if (pendingAction.value) {
    pendingAction.value();
  }
  isConfirmDialogVisible.value = false;
};

const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
  pendingAction.value = null;
};

const onSalesSelected = (sales: { kode: string; nama: string }) => {
  form.value.salesKode = sales.kode;
  form.value.salesNama = sales.nama;
  isSalesSearchVisible.value = false;
};

const onJenisOrderSelected = (jenisOrder: { kode: string; nama: string }) => {
  form.value.jenisOrderKode = jenisOrder.kode;
  form.value.jenisOrderNama = jenisOrder.nama;
  isJenisOrderSearchVisible.value = false;
};

const onWorkshopSelected = (workshop: { kode: string; nama: string }) => {
  form.value.workshopKode = workshop.kode;
  form.value.workshopNama = workshop.nama;
  isWorkshopSearchVisible.value = false;
};

watch(
  () => form.value.jenisOrderKode,
  (newVal) => {
    if (!isEditMode.value && newVal) {
      fetchTemplateItems(newVal);
    }
  }
);

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [form, items],
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isLoading.value || isSaving.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Sales dipilih atau Keterangan diisi
    const hasHeader = form.value.salesKode !== "" || form.value.keterangan.trim() !== "";

    // 2. Items: Ada item yang jumlahnya diisi > 0
    const hasItems = items.value.some((i) => (i.jumlah || 0) > 0);

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

  // --- TAMBAHKAN PENGECEKAN AWAL ---
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading
    toast.error("Anda tidak memiliki izin untuk mengakses halaman ini.");
    // Opsional: Redirect atau tampilkan pesan akses ditolak di template
    // router.replace({ name: 'Forbidden' });
    return; // Hentikan eksekusi onMounted
  }
  // ------------------------------------

  // --- Perubahan: Set isLoading di sini ---
  isLoading.value = true;
  // ------------------------------------

  const nomor = route.params.nomor as string;
  if (nomor) {
    await loadDataForEdit(nomor);
  } else {
    // Form baru, user perlu memilih Jenis Order untuk memuat grid
    isLoading.value = false; // Langsung set false jika form baru
  }
  // isLoading di set false di dalam loadDataForEdit atau di sini (jika form baru)
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-package-variant-closed-plus">
    <template #header-actions>
      <v-btn
        v-if="canSave"
        size="small"
        color="primary"
        @click="showConfirmation(save, 'Anda yakin ingin menyimpan data ini?')"
        :loading="isSaving"
        prepend-icon="mdi-content-save"
      >
        Simpan
      </v-btn>
      <v-btn
        v-if="!isEditMode"
        size="small"
        @click="showConfirmation(resetForm, 'Batalkan dan kosongkan semua isian?')"
        prepend-icon="mdi-refresh"
      >
        Batal
      </v-btn>
      <v-btn
        size="small"
        @click="
          showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')
        "
        prepend-icon="mdi-close"
      >
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container" v-if="!isLoading">
      <div class="left-column">
        <div class="desktop-form-section">
          <v-row dense>
            <v-col cols="12"
              ><v-text-field
                label="Nomor"
                :model-value="form.nomor || '<Otomatis>'"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Tanggal"
                v-model="form.tanggal"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
                :readonly="!canSave"
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Tgl Pengerjaan"
                v-model="form.tglPengerjaan"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Sales"
                :model-value="form.salesKode ? `${form.salesKode} - ${form.salesNama}` : ''"
                readonly
                @click="isSalesSearchVisible = true"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                :class="{ 'field-disabled': !canSave }"
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Jenis Order"
                :model-value="
                  form.jenisOrderKode ? `${form.jenisOrderKode} - ${form.jenisOrderNama}` : ''
                "
                readonly
                @click="isJenisOrderSearchVisible = true"
                :disabled="isEditMode"
                :class="{ 'field-disabled': isEditMode }"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Nama DTF"
                v-model="form.namaDtf"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Bag Desain"
                v-model="form.desain"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Workshop"
                :model-value="
                  form.workshopKode ? `${form.workshopKode} - ${form.workshopNama}` : ''
                "
                readonly
                @click="isWorkshopSearchVisible = true"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
            /></v-col>
          </v-row>
        </div>
      </div>
      <div class="right-column">
        <v-row dense>
          <!-- KOLOM KIRI: TABEL -->
          <v-col cols="12" md="8">
            <div class="desktop-form-section grid-section">
              <v-data-table
                :headers="tableHeaders"
                :items="items"
                density="compact"
                class="desktop-table header-browse-blue"
                fixed-header
                :items-per-page="-1"
              >
                <template #[`item.no`]="{ index }">
                  <div class="cell-text">{{ index + 1 }}</div>
                </template>
                <template #[`item.kode`]="{ item }">
                  <div class="cell-text">{{ item.kode }}</div>
                </template>
                <template #[`item.nama`]="{ item }">
                  <div class="cell-text">{{ item.nama }}</div>
                </template>
                <template #[`item.ukuran`]="{ item }">
                  <div class="cell-text">{{ item.ukuran }}</div>
                </template>
                <template #[`item.panjang`]="{ item }">
                  <div class="cell-text text-end">{{ item.panjang }}</div>
                </template>
                <template #[`item.lebar`]="{ item }">
                  <div class="cell-text text-end">{{ item.lebar }}</div>
                </template>
                <template #[`item.jumlah`]="{ item }">
                  <v-text-field
                    v-model.number="item.jumlah"
                    type="number"
                    min="0"
                    variant="underlined"
                    density="compact"
                    hide-details
                    class="text-end"
                    :readonly="!canSave"
                  />
                </template>
                <template #bottom>
                  <tfoot>
                    <tr class="total-row">
                      <td :colspan="tableHeaders.length - 1" class="text-right font-weight-bold">
                        Total Jumlah
                      </td>
                      <td class="text-right font-weight-bold">{{ totalJumlah }}</td>
                    </tr>
                  </tfoot>
                </template>
              </v-data-table>
            </div>
          </v-col>

          <!-- KOLOM KANAN: GAMBAR & KETERANGAN -->
          <v-col cols="12" md="4">
            <!-- Gambar Section -->
            <div class="desktop-form-section mb-3">
              <div class="image-upload-section">
                <div class="d-flex align-center ga-2 mb-3">
                  <v-file-input
                    v-model="imageFile"
                    label="Upload Gambar (Max 1MB)"
                    variant="outlined"
                    density="compact"
                    prepend-icon="mdi-camera"
                    hide-details
                    clearable
                    accept="image/jpeg,image/png,image/jpg,image/gif"
                    :loading="isImageUploading"
                    :disabled="isImageUploading || !canSave"
                    @update:model-value="handleImageUpload"
                  />
                  <v-btn
                    @click="clearImage"
                    :disabled="!imagePreview || isImageUploading"
                    icon="mdi-delete"
                    size="small"
                    variant="tonal"
                    color="error"
                    title="Hapus Gambar"
                  />
                </div>

                <div class="image-preview-container">
                  <div v-if="imagePreview" class="position-relative">
                    <v-img
                      :src="imagePreview"
                      height="200"
                      aspect-ratio="16/9"
                      cover
                      class="border rounded elevation-1 cursor-pointer"
                      @click="imagePreview ? (isImageFullscreenVisible = true) : null"
                      title="Klik untuk memperbesar"
                    >
                      <v-overlay
                        v-if="isImageUploading"
                        contained
                        persistent
                        class="d-flex align-center justify-center"
                      >
                        <div class="text-center text-white">
                          <v-progress-circular indeterminate color="primary" size="40" />
                          <div class="mt-2">Mengunggah...</div>
                        </div>
                      </v-overlay>
                    </v-img>

                    <div class="mt-2">
                      <v-chip v-if="imageFile" size="small" color="warning" variant="tonal">
                        <v-icon start size="small">mdi-clock-outline</v-icon>
                        Belum tersimpan
                      </v-chip>
                      <v-chip
                        v-else-if="form.imageUrl && imagePreview"
                        size="small"
                        color="success"
                        variant="tonal"
                      >
                        <v-icon start size="small">mdi-check</v-icon>
                        Tersimpan di server
                      </v-chip>
                    </div>
                  </div>

                  <div
                    v-else
                    class="border rounded d-flex align-center justify-center bg-grey-lighten-4"
                    style="height: 200px"
                  >
                    <div class="text-center text-grey">
                      <v-icon size="48" class="mb-2">mdi-image-outline</v-icon>
                      <div class="text-caption">Tidak ada gambar</div>
                      <div class="text-caption">Pilih file untuk upload otomatis</div>
                    </div>
                  </div>
                </div>

                <div v-if="isImageUploading" class="mt-2">
                  <v-progress-linear indeterminate color="primary" height="2" />
                  <div class="text-caption text-center mt-1">Sedang mengunggah gambar...</div>
                </div>
              </div>
            </div>

            <!-- Keterangan Section -->
            <div class="desktop-form-section">
              <v-textarea
                label="Keterangan"
                v-model="form.keterangan"
                rows="6"
                variant="outlined"
                density="compact"
                hide-details
              />
            </div>
          </v-col>
        </v-row>
      </div>
    </div>
    <v-skeleton-loader v-else type="article, actions"></v-skeleton-loader>

    <!-- Modals -->
    <SalesSearchModal
      v-if="isSalesSearchVisible"
      @close="isSalesSearchVisible = false"
      @sales-selected="onSalesSelected"
    />
    <JenisOrderStokSearchModal
      v-if="isJenisOrderSearchVisible"
      @close="isJenisOrderSearchVisible = false"
      @jenis-order-selected="onJenisOrderSelected"
    />
    <WorkshopSearchModal
      v-if="isWorkshopSearchVisible"
      @close="isWorkshopSearchVisible = false"
      @workshop-selected="onWorkshopSelected"
    />

    <!-- Fullscreen Image Modal -->
    <v-dialog v-model="isImageFullscreenVisible" max-width="90vw">
      <v-card>
        <v-toolbar density="compact" color="primary" dark>
          <v-toolbar-title>
            <v-icon start>mdi-image</v-icon>
            Preview Gambar - {{ form.nomor || "SO Baru" }}
          </v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" @click="isImageFullscreenVisible = false" variant="text" />
        </v-toolbar>

        <v-card-text class="pa-4 bg-grey-lighten-4">
          <div class="d-flex justify-center align-center" style="min-height: 60vh">
            <v-img
              :src="imagePreview"
              max-height="80vh"
              max-width="100%"
              contain
              class="rounded elevation-2"
            />
          </div>
        </v-card-text>

        <v-card-actions class="justify-space-between pa-4">
          <div>
            <v-chip v-if="imageFile" size="small" color="warning" variant="tonal">
              <v-icon start size="small">mdi-clock-outline</v-icon>
              Belum tersimpan
            </v-chip>
            <v-chip v-else-if="form.imageUrl" size="small" color="success" variant="tonal">
              <v-icon start size="small">mdi-check-circle</v-icon>
              Tersimpan di server
            </v-chip>
          </div>
          <v-btn
            color="primary"
            @click="isImageFullscreenVisible = false"
            prepend-icon="mdi-close"
            variant="tonal"
          >
            Tutup
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold"> Konfirmasi </v-card-title>
        <v-card-text>
          {{ confirmText }}
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog"> Tidak </v-btn>
          <v-btn color="primary" variant="tonal" @click="executePendingAction">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  padding: 12px;
  height: 100%;
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 12px;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.desktop-form-section {
  padding: 12px;
  border-radius: 4px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.left-column .desktop-form-section {
  flex-shrink: 0;
}

.notes-area {
  flex-grow: 1;
}

.image-section {
  flex-shrink: 0;
}

.image-preview {
  height: 120px;
}

.grid-section {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.desktop-table {
  font-size: 11px;
  flex-grow: 1;
}

.left-column .desktop-form-section :deep(.v-label) {
  font-size: 11px !important;
}

.left-column .desktop-form-section :deep(input),
.left-column .desktop-form-section :deep(.v-select__selection-text) {
  font-size: 12px !important;
}

.image-section :deep(.v-file-input .v-label) {
  font-size: 11px !important;
}

.image-section :deep(.v-file-input input),
.image-section :deep(.v-file-input .v-field__input) {
  font-size: 12px !important;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding: 0 8px !important;
  height: 32px !important;
}

.desktop-table :deep(input) {
  font-size: 11px !important;
}

.header-section :deep(.v-col) {
  padding-top: 4px;
  padding-bottom: 4px;
}

.header-section :deep(.v-label) {
  font-size: 11px !important;
}

.header-section :deep(input),
.header-section :deep(.v-select__selection-text) {
  font-size: 12px !important;
}

.cell-text {
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-end {
  text-align: right;
}

.total-row td {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12) !important;
}

.field-disabled {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  pointer-events: none;
}

.cursor-pointer {
  cursor: pointer;
  transition: opacity 0.2s;
}

.cursor-pointer:hover {
  opacity: 0.9;
}

.image-upload-section {
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  padding: 16px;
}

.image-preview-container {
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

:deep(.bg-grey-lighten-4) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>

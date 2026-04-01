<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import InvoiceSearchModal from "@/components/lookup/InvoiceSearchModal.vue";
import type { AxiosError } from "axios";

// --- Interface ---
interface KomplainItem {
  id: number;
  kode_barang: string;
  nama_barang: string;
  ukuran: string;
  qty_invoice: number; // [TAMBAHAN BARU]
  qty: number;
  keterangan: string;
  foto: string | null;
  foto_url: string | null;
  _fileObj?: File | null;
  isUploading?: boolean;
}

interface KomplainLog {
  cmpl_id: number;
  cmpl_status: string;
  cmpl_catatan: string;
  user_nama: string;
  date_create: string;
  [key: string]: unknown;
}

interface InvoiceDetailApiItem {
  kode_barang: string;
  nama_barang: string;
  ukuran: string;
  qty_invoice: number;
  [key: string]: unknown;
}

interface SelectedInvoice {
  Nomor: string;
  KdCus: string;
  Customer: string;
  [key: string]: unknown;
}

interface ApiKomplainDetail {
  kode_barang: string;
  nama_barang: string;
  ukuran: string;
  qty_invoice: number | string;
  qty: number | string;
  keterangan: string | null;
  foto: string | null;
}

// --- State & Setup ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "60";

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? "Detail / Ubah Komplain" : "Buat Komplain Baru"
);
const isLoading = ref(false);
const isSaving = ref(false);

const dialogs = reactive({
  invoiceSearch: false,
  resolve: false,
  confirm: false, // [TAMBAHAN BARU] Dialog konfirmasi elegan
});

const resolveForm = reactive({
  status: "RESOLVED",
  solusi: "",
  catatan: "",
});

const confirmData = reactive({
  title: "",
  message: "",
  color: "primary",
  icon: "mdi-help-circle",
  action: async () => {}, // Fungsi yang akan dijalankan jika user klik "Ya"
});

const isKDC = computed(() => authStore.user?.cabang === "KDC");
const canProcessReview = computed(
  () => isKDC.value && (authStore.can(MENU_ID, "edit") || authStore.can(MENU_ID, "insert"))
);

// Opsi Kategori Komplain
const kategoriOptions = [
  "SABLON RUSAK / LUNTUR",
  "SALAH UKURAN / WARNA",
  "JAHITAN LEPAS / CACAT",
  "KETERLAMBATAN PRODUKSI",
  "PELAYANAN TOKO",
  "LAIN-LAIN",
];

// --- State untuk Preview Gambar ---
const isPreviewOpen = ref(false);
const previewImageUrl = ref("");

const openPreview = (url: string | null) => {
  if (!url) return;
  previewImageUrl.value = url;
  isPreviewOpen.value = true;
};

// --- Data Header ---
const header = reactive({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  customer_kode: "",
  customer_nama: "",
  ref_jenis: "INVOICE",
  ref_nomor: "",
  kategori: "",
  keterangan: "",
  solusi: "", // [TAMBAH INI]
  contact_nama: "", // [TAMBAH INI]
  contact_telp: "", // [TAMBAH INI]
  status: "DRAFT",
});

// --- Data Detail ---
interface KomplainItem {
  id: number;
  kode_barang: string;
  nama_barang: string;
  ukuran: string;
  qty: number;
  keterangan: string;
  foto: string | null; // Menyimpan nama file (temp-xxx atau path asli)
  foto_url: string | null; // Menyimpan URL untuk preview di UI
  _fileObj?: File | null; // Objek file sementara sebelum diupload
  isUploading?: boolean;
}

const items = ref<KomplainItem[]>([]);
const logs = ref<KomplainLog[]>([]);

const tableHeaders = [
  { title: "Kode Barang", key: "kode_barang", width: "150px" },
  { title: "Nama Barang", key: "nama_barang", minWidth: "200px" },
  { title: "Ukuran", key: "ukuran", width: "80px" },
  { title: "Qty Inv", key: "qty_invoice", width: "80px", align: "center" }, // [TAMBAHAN BARU]
  { title: "Qty Masalah", key: "qty", width: "100px", align: "end" },
  { title: "Keterangan Kendala", key: "keterangan", minWidth: "200px" },
  { title: "Foto Bukti", key: "foto", width: "150px", align: "center" },
  { title: "Aksi", key: "actions", width: "60px", sortable: false, align: "center" },
] as const;

// --- Methods ---

const removeRow = (index: number) => {
  items.value.splice(index, 1);
};

// Validasi otomatis saat user mengetik Qty Masalah
const validateQty = (item: KomplainItem) => {
  if (item.qty > item.qty_invoice) {
    item.qty = item.qty_invoice;
    toast.warning(`Qty Masalah tidak boleh melebihi Qty Invoice (${item.qty_invoice}).`);
  } else if (item.qty < 0) {
    item.qty = 0;
  }
};

// Konfirmasi saat tombol kembali ditekan
const handleBack = () => {
  if (header.status === "DRAFT") {
    openConfirm(
      "Konfirmasi Kembali",
      "Perubahan yang belum disimpan (Draft) akan hilang. Apakah Anda yakin ingin kembali?",
      "error",
      "mdi-alert",
      () => {
        router.back();
      }
    );
  } else {
    router.back();
  }
};

const openConfirm = (
  title: string,
  message: string,
  color: string,
  icon: string,
  action: () => Promise<void> | void
) => {
  confirmData.title = title;
  confirmData.message = message;
  confirmData.color = color;
  confirmData.icon = icon;
  confirmData.action = async () => {
    await action();
    dialogs.confirm = false; // Tutup dialog setelah eksekusi selesai
  };
  dialogs.confirm = true;
};

const onInvoiceSelected = async (invoice: SelectedInvoice | null) => {
  if (invoice) {
    header.ref_nomor = invoice.Nomor;
    header.customer_kode = invoice.KdCus;
    header.customer_nama = invoice.Customer;
    header.ref_jenis = "INVOICE"; // Tetap simpan sebagai INVOICE di background

    isLoading.value = true;
    try {
      // Tarik detail barang dari backend
      const response = await api.get(`/komplain-form/lookup/invoice-details/${invoice.Nomor}`);
      const fetchedItems: InvoiceDetailApiItem[] = response.data;

      // Reset dan isi grid kanan dengan data dari invoice
      items.value = fetchedItems.map((item, idx: number) => ({
        id: Date.now() + idx,
        kode_barang: item.kode_barang,
        nama_barang: item.nama_barang,
        ukuran: item.ukuran,
        qty_invoice: Number(item.qty_invoice) || 0,
        qty: 0, // Default Qty komplain dinolkan agar user bisa input ulang sesuai kebutuhan
        keterangan: "",
        foto: null,
        foto_url: null,
      }));

      if (items.value.length === 0) {
        toast.warning("Invoice ini tidak memiliki detail barang.");
        // addNewRow(); <-- Hapus juga baris ini
      } else {
        toast.success("Barang dari invoice berhasil dimuat.");
      }
    } catch (error) {
      toast.error("Gagal menarik detail invoice.", error);
    } finally {
      isLoading.value = false;
    }
  }
  dialogs.invoiceSearch = false;
};

// Handle Upload Foto per Baris
const uploadFoto = async (item: KomplainItem) => {
  if (!item._fileObj) return;

  const formData = new FormData();
  formData.append("foto", item._fileObj);

  item.isUploading = true;
  try {
    const response = await api.post("/komplain-form/upload-foto", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    // Simpan nama file temp dari backend
    item.foto = response.data.fileName;
    item.foto_url = URL.createObjectURL(item._fileObj); // Preview lokal
    toast.success("Foto berhasil diunggah (sementara).");
  } catch (error) {
    toast.error("Gagal mengunggah foto.", error);
    item._fileObj = null;
  } finally {
    item.isUploading = false;
  }
};

const loadData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/komplain-form/${nomor}`);
    const { header: h, details, logs: l } = response.data;

    header.nomor = h.cmp_nomor;
    header.tanggal = h.cmp_tanggal ? format(parseISO(h.cmp_tanggal), "yyyy-MM-dd") : "";
    header.customer_kode = h.cmp_cus_kode;
    header.customer_nama = h.cus_nama;
    header.ref_jenis = h.cmp_ref_jenis;
    header.ref_nomor = h.cmp_ref_nomor;
    header.kategori = h.cmp_kategori;
    header.keterangan = h.cmp_keterangan;
    header.solusi = h.cmp_solusi || "";
    header.status = h.cmp_status;

    // [PERBAIKAN] Bebas dari any! Menggunakan ApiKomplainDetail
    items.value = details.map((d: ApiKomplainDetail, idx: number) => ({
      id: Date.now() + idx,
      kode_barang: d.kode_barang,
      nama_barang: d.nama_barang,
      ukuran: d.ukuran,
      qty_invoice: Number(d.qty_invoice) || 0,
      qty: Number(d.qty) || 0,
      keterangan: d.keterangan || "",
      foto: d.foto || null,
      foto_url: d.foto ? `${import.meta.env.VITE_API_BASE_URL}${d.foto}` : null,
    }));

    // addNewRow() sudah dihapus dari sini

    logs.value = l || [];
  } catch (error) {
    toast.error("Gagal memuat data komplain.", error);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const saveData = async (submitAfterSave = false) => {
  // 1. Validasi Header & Detail (Tetap sama seperti sebelumnya)
  if (!header.customer_kode) return toast.warning("Customer harus diisi. Silakan pilih Invoice.");
  if (!header.kategori) return toast.warning("Kategori masalah komplain harus dipilih.");
  if (!header.keterangan) return toast.warning("Keterangan atau kronologi singkat wajib diisi.");

  const validItems = items.value.filter((i) => i.kode_barang && i.nama_barang);
  if (validItems.length === 0)
    return toast.warning("Minimal satu barang bermasalah harus ada di tabel.");

  for (const item of validItems) {
    if (item.qty <= 0)
      return toast.warning(`Barang ${item.kode_barang} harus memiliki Qty Masalah lebih dari 0.`);
    if (item.qty > item.qty_invoice)
      return toast.warning(`Qty Masalah untuk ${item.kode_barang} melebihi batas Invoice.`);
  }

  // Fungsi internal untuk eksekusi API (agar bisa dipanggil dari dalam dialog)
  const executeSave = async () => {
    isSaving.value = true;
    try {
      const payload = { header, details: validItems, isNew: !isEditMode.value };
      const response = await api.post("/komplain-form/save", payload);
      const savedNomor = response.data.nomor;

      if (submitAfterSave) {
        await api.put(`/komplain-form/${savedNomor}/status`, {
          status: "SUBMITTED",
          catatan: "Tiket disubmit oleh toko untuk direview.",
        });
        toast.success("Komplain berhasil disimpan dan disubmit!");
        router.push({ name: "KomplainCustomer" });
      } else {
        toast.success(response.data.message);
        if (!isEditMode.value) {
          router.replace({ name: "KomplainCustomerEdit", params: { nomor: savedNomor } });
        } else {
          loadData(header.nomor); // Reload data
        }
      }
    } catch (error: unknown) {
      const err = error as AxiosError<{ message: string }>;
      toast.error(err.response?.data?.message || "Gagal menyimpan komplain.");
    } finally {
      isSaving.value = false;
    }
  };

  // 2. Panggil Konfirmasi Elegan jika akan di-Submit
  if (submitAfterSave) {
    openConfirm(
      "Konfirmasi Submit",
      "Apakah Anda yakin ingin melakukan Submit? Komplain yang telah disubmit tidak dapat diubah kembali oleh Toko.",
      "success",
      "mdi-send-check",
      executeSave
    );
  } else {
    await executeSave(); // Jika hanya simpan draft, langsung eksekusi tanpa dialog
  }
};

// --- Aksi Tim Pusat ---
const markAsOnReview = async () => {
  openConfirm(
    "Proses Review",
    "Tandai komplain ini sedang diinvestigasi / direview oleh Pusat?",
    "warning",
    "mdi-magnify-scan",
    async () => {
      isSaving.value = true;
      try {
        await api.put(`/komplain-form/${header.nomor}/status`, {
          status: "ON_REVIEW",
          catatan: "Tiket mulai diinvestigasi oleh Pusat.",
          solusi: "",
        });
        toast.success("Status tiket berubah menjadi ON REVIEW.");
        loadData(header.nomor);
      } catch (error) {
        toast.error("Gagal mengubah status komplain.", error);
      } finally {
        isSaving.value = false;
      }
    }
  );
};

const submitKeputusan = async () => {
  if (!resolveForm.solusi) {
    return toast.warning("Solusi / Tindak Lanjut wajib diisi!");
  }

  openConfirm(
    "Konfirmasi Keputusan",
    `Anda akan menyelesaikan komplain ini dengan keputusan: ${resolveForm.status}. Apakah Anda yakin?`,
    resolveForm.status === "RESOLVED" ? "success" : "error",
    "mdi-check-decagram",
    async () => {
      isSaving.value = true;
      try {
        await api.put(`/komplain-form/${header.nomor}/status`, {
          status: resolveForm.status,
          catatan: resolveForm.catatan,
          solusi: resolveForm.solusi,
        });
        toast.success(`Komplain berhasil di-${resolveForm.status.toLowerCase()}!`);
        dialogs.resolve = false; // Tutup juga modal form keputusannya
        loadData(header.nomor);
      } catch (error) {
        toast.error("Gagal memproses keputusan komplain.", error);
      } finally {
        isSaving.value = false;
      }
    }
  );
};

const printData = () => {
  if (!header.nomor) return;
  const url = router.resolve({
    name: "KomplainCustomerPrint",
    params: { nomor: header.nomor },
  }).href;
  window.open(url, "_blank");
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "DRAFT":
      return "grey";
    case "SUBMITTED":
      return "info";
    case "ON_REVIEW":
      return "warning";
    case "RESOLVED":
      return "success";
    case "REJECTED":
      return "error";
    default:
      return "grey-lighten-1";
  }
};

onMounted(() => {
  if (isEditMode.value) {
    loadData(route.params.nomor as string);
  }
  // addNewRow(); <-- Hapus baris ini agar tabel awalnya kosong dan rapi
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-comment-alert-outline">
    <template #header-actions>
      <v-btn
        v-if="header.status === 'DRAFT'"
        color="primary"
        variant="outlined"
        size="small"
        prepend-icon="mdi-content-save"
        :loading="isSaving"
        @click="saveData(false)"
      >
        Simpan Draft
      </v-btn>
      <v-btn
        v-if="header.status === 'DRAFT'"
        color="success"
        size="small"
        prepend-icon="mdi-send-check"
        :loading="isSaving"
        @click="saveData(true)"
      >
        Submit Komplain
      </v-btn>
      <v-btn
        v-if="canProcessReview && header.status === 'SUBMITTED'"
        color="warning"
        size="small"
        prepend-icon="mdi-magnify-scan"
        :loading="isSaving"
        @click="markAsOnReview"
      >
        Proses Review
      </v-btn>

      <v-btn
        v-if="canProcessReview && header.status === 'ON_REVIEW'"
        color="success"
        size="small"
        prepend-icon="mdi-check-decagram"
        @click="dialogs.resolve = true"
      >
        Selesaikan Komplain
      </v-btn>
      <v-btn
        v-if="isEditMode"
        color="green-darken-2"
        size="small"
        prepend-icon="mdi-printer"
        @click="printData"
      >
        Cetak
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-arrow-left" @click="handleBack">Kembali</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <div class="d-flex align-center justify-space-between mb-4">
            <h3 class="text-subtitle-1 font-weight-bold mb-0">Info Komplain</h3>
            <v-chip
              :color="getStatusColor(header.status)"
              size="small"
              class="font-weight-bold text-uppercase"
            >
              {{ header.status.replace("_", " ") }}
            </v-chip>
          </div>

          <v-row dense>
            <v-col cols="6">
              <v-text-field
                label="No. Komplain"
                v-model="header.nomor"
                readonly
                filled
                density="compact"
                hide-details
                placeholder="Otomatis"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Tanggal"
                v-model="header.tanggal"
                type="date"
                density="compact"
                hide-details
                :readonly="header.status !== 'DRAFT'"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Nama Customer (Member)"
                v-model="header.customer_nama"
                density="compact"
                hide-details
                readonly
                filled
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Nama CP (Pelapor)"
                v-model="header.contact_nama"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Nama pembawa barang"
                :readonly="header.status !== 'DRAFT'"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="No. Telp CP"
                v-model="header.contact_telp"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="WA / Telp aktif"
                :readonly="header.status !== 'DRAFT'"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                label="No. Invoice"
                v-model="header.ref_nomor"
                density="compact"
                variant="outlined"
                hide-details
                :readonly="header.status !== 'DRAFT'"
                placeholder="Klik icon cari ➔"
                prepend-inner-icon="mdi-magnify"
                @click:prepend-inner="header.status === 'DRAFT' && (dialogs.invoiceSearch = true)"
                @click="header.status === 'DRAFT' && (dialogs.invoiceSearch = true)"
              />
            </v-col>
            <v-col cols="12">
              <v-select
                label="Kategori Masalah"
                v-model="header.kategori"
                :items="kategoriOptions"
                density="compact"
                variant="outlined"
                hide-details
                :readonly="header.status !== 'DRAFT'"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                label="Keterangan / Kronologi Singkat"
                v-model="header.keterangan"
                density="compact"
                variant="outlined"
                hide-details
                rows="3"
                :readonly="header.status !== 'DRAFT'"
              />
            </v-col>
            <v-col cols="12" v-if="['RESOLVED', 'REJECTED'].includes(header.status)">
              <v-alert
                :type="header.status === 'RESOLVED' ? 'success' : 'error'"
                variant="tonal"
                density="compact"
                class="mt-2"
              >
                <div class="text-caption font-weight-bold mb-1">
                  Keputusan Pusat ({{ header.status }}):
                </div>
                <div class="text-caption">{{ header.solusi }}</div>
              </v-alert>
            </v-col>
          </v-row>

          <div v-if="isEditMode && logs.length > 0" class="mt-6">
            <h3 class="text-subtitle-2 font-weight-bold mb-2">Riwayat Tindakan</h3>
            <v-timeline density="compact" side="end" truncate-line="both">
              <v-timeline-item
                v-for="log in logs"
                :key="log.cmpl_id"
                :dot-color="getStatusColor(log.cmpl_status)"
                size="small"
              >
                <div class="text-caption font-weight-bold">{{ log.cmpl_status }}</div>
                <div class="text-caption">{{ log.cmpl_catatan }}</div>
                <div class="text-caption text-grey mt-1">
                  {{ log.user_nama }} • {{ format(new Date(log.date_create), "dd/MM/yyyy HH:mm") }}
                </div>
              </v-timeline-item>
            </v-timeline>
          </div>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section flex-grow-1 d-flex flex-column">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">Daftar Barang Bermasalah</h3>

          <v-data-table
            :headers="tableHeaders"
            :items="items"
            class="desktop-table header-browse-blue flex-grow-1"
            density="compact"
            :items-per-page="-1"
            hide-default-footer
          >
            <template #[`item.kode_barang`]="{ item }">
              <span class="font-weight-medium">{{ item.kode_barang }}</span>
            </template>
            <template #[`item.nama_barang`]="{ item }">
              <span>{{ item.nama_barang }}</span>
            </template>
            <template #[`item.ukuran`]="{ item }">
              <span>{{ item.ukuran }}</span>
            </template>
            <template #[`item.qty_invoice`]="{ item }">
              <span class="font-weight-medium text-grey-darken-2">{{ item.qty_invoice }}</span>
            </template>

            <template #[`item.qty`]="{ item }">
              <v-text-field
                v-model.number="item.qty"
                type="number"
                min="0"
                :max="item.qty_invoice"
                density="compact"
                variant="underlined"
                hide-details
                class="text-right"
                :readonly="header.status !== 'DRAFT'"
                @input="validateQty(item)"
              />
            </template>
            <template #[`item.keterangan`]="{ item }">
              <v-text-field
                v-model="item.keterangan"
                density="compact"
                variant="underlined"
                hide-details
                :readonly="header.status !== 'DRAFT'"
                placeholder="Contoh: Sablon mengelupas"
              />
            </template>

            <template #[`item.foto`]="{ item }">
              <div class="d-flex align-center justify-center pa-1">
                <v-avatar
                  v-if="item.foto_url"
                  rounded
                  size="40"
                  class="mr-2 border cursor-pointer"
                  @click="openPreview(item.foto_url)"
                >
                  <v-img :src="item.foto_url" cover></v-img>
                </v-avatar>

                <v-file-input
                  v-if="header.status === 'DRAFT'"
                  v-model="item._fileObj"
                  accept="image/png, image/jpeg"
                  density="compact"
                  variant="underlined"
                  hide-details
                  prepend-icon=""
                  prepend-inner-icon="mdi-camera"
                  placeholder="Pilih Foto"
                  :loading="item.isUploading"
                  @update:model-value="uploadFoto(item)"
                />
              </div>
            </template>

            <template #[`item.actions`]="{ index }">
              <v-btn
                v-if="header.status === 'DRAFT'"
                icon="mdi-delete"
                variant="text"
                color="error"
                size="small"
                @click="removeRow(index)"
              />
            </template>

            <template #bottom>
              <div
                class="pa-4 text-center text-caption text-grey font-italic"
                v-if="items.length === 0"
              >
                Silakan pilih No. Invoice terlebih dahulu untuk memuat daftar barang.
              </div>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <InvoiceSearchModal
      v-if="dialogs.invoiceSearch"
      source="komplain"
      @close="dialogs.invoiceSearch = false"
      @invoice-selected="onInvoiceSelected"
    />

    <v-dialog v-model="isPreviewOpen" max-width="800px">
      <v-card class="d-flex flex-column" style="max-height: 90vh">
        <v-toolbar color="primary" density="compact">
          <v-toolbar-title class="text-subtitle-2">Preview Foto Komplain</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="isPreviewOpen = false"
          ></v-btn>
        </v-toolbar>
        <v-card-text class="pa-0 text-center bg-grey-lighten-4 d-flex align-center justify-center">
          <v-img :src="previewImageUrl" max-height="80vh" contain class="w-100"></v-img>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogs.resolve" max-width="500px" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 bg-primary text-white"
          >Keputusan Final Komplain</v-card-title
        >
        <v-card-text class="pa-4">
          <p class="text-caption text-grey-darken-1 mb-3">
            Tentukan apakah komplain ini diterima (kesalahan Kaosan) atau ditolak (kesalahan
            Customer).
          </p>

          <v-radio-group
            v-model="resolveForm.status"
            inline
            density="compact"
            hide-details
            class="mb-4"
          >
            <v-radio label="Terima (RESOLVED)" value="RESOLVED" color="success"></v-radio>
            <v-radio label="Tolak (REJECTED)" value="REJECTED" color="error"></v-radio>
          </v-radio-group>

          <v-textarea
            v-model="resolveForm.solusi"
            label="Solusi / Tindak Lanjut *"
            placeholder="Contoh: Barang akan dicetak ulang hari ini. Toko silakan buat retur ke DC."
            variant="outlined"
            density="compact"
            rows="3"
            class="mb-3"
          ></v-textarea>

          <v-text-field
            v-model="resolveForm.catatan"
            label="Catatan Internal (Opsional)"
            placeholder="Hanya masuk ke riwayat timeline"
            variant="outlined"
            density="compact"
            hide-details
          ></v-text-field>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn @click="dialogs.resolve = false" variant="text" :disabled="isSaving">Batal</v-btn>
          <v-btn color="primary" @click="submitKeputusan" variant="flat" :loading="isSaving"
            >Simpan Keputusan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogs.confirm" max-width="400px" persistent>
      <v-card>
        <v-card-title :class="`bg-${confirmData.color} text-white d-flex align-center pa-3`">
          <v-icon :icon="confirmData.icon" class="mr-2" size="small"></v-icon>
          <span class="text-subtitle-1 font-weight-bold">{{ confirmData.title }}</span>
        </v-card-title>

        <v-card-text class="pa-4 pt-5 text-body-2 text-grey-darken-3">
          {{ confirmData.message }}
        </v-card-text>

        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            @click="dialogs.confirm = false"
            :disabled="isSaving"
            class="text-capitalize"
          >
            Batal
          </v-btn>
          <v-btn
            :color="confirmData.color"
            variant="flat"
            :loading="isSaving"
            @click="confirmData.action"
            class="text-capitalize px-4"
          >
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.desktop-table :deep(td) {
  padding: 0 8px !important;
  white-space: nowrap;
}
.desktop-table :deep(th) {
  white-space: nowrap;
}
</style>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import InvoiceSearchModal from "@/components/lookup/InvoiceSearchModal.vue";
import AuthorizationModal from "@/components/modal/AuthorizationModal.vue";
import axios from "axios";
import { formatRupiah } from "@/utils/formatRupiah";

// --- Interface ---
interface KomplainItem {
  id: number;
  kode_barang: string;
  nama_barang: string;
  ukuran: string;
  qty_invoice: number;
  qty: number;
  keterangan: string;
  foto: string | null;
  foto_url: string | null;
  _fileObj?: File | null;
  isUploading?: boolean;
  harga_satuan: number;
}
interface KomplainLog {
  cmpl_id: number;
  cmpl_status: string;
  cmpl_catatan: string;
  user_nama: string;
  date_create: string;
}
interface SelectedInvoice {
  Nomor: string;
  KdCus: string;
  Customer: string;
  Nominal: number;
}
interface ApiKomplainDetail {
  kode_barang: string;
  nama_barang: string;
  ukuran: string;
  qty_invoice: number | string;
  qty: number | string;
  keterangan: string | null;
  foto: string | null;
  harga_netto?: number | string;
  harga_satuan?: number | string;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "60";

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? "Detail Berita Acara (BAP)" : "Buat BAP Baru"
);
const potensiKerugian = computed(() => {
  return items.value.reduce((sum, item) => {
    return sum + Number(item.qty || 0) * Number(item.harga_satuan || 0);
  }, 0);
});
const isLoading = ref(false);
const isSaving = ref(false);

const dialogs = reactive({ invoiceSearch: false, confirm: false, auth: false });
const confirmData = reactive({
  title: "",
  message: "",
  color: "primary",
  icon: "mdi-help-circle",
  action: async () => {},
});

const isKDC = computed(() => authStore.user?.cabang === "KDC");

// Akses Control
const canEditDraft = computed(() => header.status === "DRAFT");
const canInputSolusi = computed(() => isKDC.value && header.status === "ON_REVIEW");
const canInputTanggungJawab = computed(() => isKDC.value && header.status === "RESOLVED");
const canProcessReview = computed(() => isKDC.value && authStore.can(MENU_ID, "edit"));

const kategoriOptions = [
  "SABLON RUSAK / LUNTUR",
  "SALAH UKURAN / WARNA",
  "JAHITAN LEPAS / CACAT",
  "KETERLAMBATAN PRODUKSI",
  "PELAYANAN TOKO",
  "KEKURANGAN BARANG",
  "LAIN-LAIN",
];

// --- STATE DIALOG PREVIEW ---
const isPreviewOpen = ref(false);
const previewImageUrl = ref<string>("");

const openPreview = (url: string | null) => {
  // Jika null, jangan buka dialog
  if (!url) return;
  previewImageUrl.value = url;
  isPreviewOpen.value = true;
};

const header = reactive({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  customer_kode: "",
  customer_nama: "",
  ref_jenis: "INVOICE",
  ref_nomor: "",
  nominal_inv: 0,
  kategori: "",
  keterangan: "",
  sumber_masalah: "",
  solusi: "",
  tanggung_jawab: "",
  contact_nama: "",
  contact_telp: "",
  status: "DRAFT",
});

const items = ref<KomplainItem[]>([]);
const logs = ref<KomplainLog[]>([]);

// [PERBAIKAN]: Table Headers dibikin lebih compact
const tableHeaders = [
  { title: "Info Barang", key: "barang_info", minWidth: "160px" },
  { title: "Qty Mslh", key: "qty", width: "80px", align: "center" },
  { title: "Foto", key: "foto", width: "70px", align: "center" },
  { title: "Aksi", key: "actions", width: "50px", sortable: false, align: "center" },
] as const;

const removeRow = (index: number) => items.value.splice(index, 1);
const validateQty = (item: KomplainItem) => {
  if (item.qty > item.qty_invoice) {
    item.qty = item.qty_invoice;
    toast.warning("Melebihi Qty Invoice.");
  } else if (item.qty < 0) item.qty = 0;
};

const handleBack = () => {
  if (header.status === "DRAFT")
    openConfirm("Konfirmasi", "Perubahan akan hilang. Kembali?", "error", "mdi-alert", () =>
      router.back()
    );
  else router.back();
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
    dialogs.confirm = false;
  };
  dialogs.confirm = true;
};

const onInvoiceSelected = async (invoice: SelectedInvoice | null) => {
  if (invoice) {
    header.ref_nomor = invoice.Nomor;
    header.customer_kode = invoice.KdCus;
    header.customer_nama = invoice.Customer;

    isLoading.value = true;
    try {
      const response = await api.get(`/komplain-form/lookup/invoice-details/${invoice.Nomor}`);
      items.value = response.data.map((item: ApiKomplainDetail, idx: number) => ({
        id: Date.now() + idx,
        kode_barang: item.kode_barang,
        nama_barang: item.nama_barang,
        ukuran: item.ukuran,
        qty_invoice: Number(item.qty_invoice) || 0,
        harga_satuan: Number(item.harga_netto) || 0,
        qty: 0,
        keterangan: "",
        foto: null,
        foto_url: null,
      }));
      if (items.value.length === 0) toast.warning("Invoice tidak memiliki detail.");
      else toast.success("Barang invoice dimuat.");
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      }
      toast.error("Gagal menarik detail invoice.");
    } finally {
      isLoading.value = false;
    }
  }
  dialogs.invoiceSearch = false;
};

const uploadFoto = async (item: KomplainItem) => {
  if (!item._fileObj) return;
  const formData = new FormData();
  formData.append("foto", item._fileObj);
  item.isUploading = true;
  try {
    const response = await api.post("/komplain-form/upload-foto", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    item.foto = response.data.fileName;
    item.foto_url = URL.createObjectURL(item._fileObj);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal mengunggah foto.");
    } else {
      toast.error("Gagal mengunggah foto.");
    }
    item._fileObj = null;
  } finally {
    item.isUploading = false;
  }
};

const hapusFoto = async (item: KomplainItem) => {
  // Jika ini data lama yang sudah tersimpan di database
  if (header.nomor && item.foto) {
    try {
      await api.delete(`/komplain-form/${header.nomor}/foto/${item.id}`);
      toast.success("Foto berhasil dihapus.");
    } catch {
      toast.error("Gagal menghapus foto dari server.");
      return; // Jangan hapus dari state jika server gagal
    }
  }

  // Jika ini data baru (blob) atau sudah berhasil hapus server
  if (item.foto_url && item.foto_url.startsWith("blob:")) {
    URL.revokeObjectURL(item.foto_url);
  }

  item.foto = null;
  item.foto_url = null;
  item._fileObj = null;
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
    header.nominal_inv = h.cmp_nominal_inv || 0;
    header.kategori = h.cmp_kategori;
    header.keterangan = h.cmp_keterangan;
    header.sumber_masalah = h.cmp_sumber_masalah || "";
    header.solusi = h.cmp_solusi || "";
    header.tanggung_jawab = h.cmp_tanggungjawab || "";
    header.status = h.cmp_status;

    items.value = details.map((d: ApiKomplainDetail, idx: number) => ({
      id: Date.now() + idx,
      kode_barang: d.kode_barang,
      nama_barang: d.nama_barang,
      ukuran: d.ukuran,
      qty_invoice: Number(d.qty_invoice) || 0,
      qty: Number(d.qty) || 0,
      keterangan: d.keterangan || "",
      foto: d.foto || null,
      foto_url: d.foto ? `${import.meta.env.VITE_API_BASE_URL || ""}${d.foto}` : null,

      // [PERBAIKAN] Langsung gunakan harga_satuan dari backend, jangan ditebak!
      harga_satuan: Number(d.harga_satuan) || 0,
    }));
    logs.value = l || [];
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal memuat BAP.");
    } else {
      toast.error("Gagal memuat BAP.");
    }
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const saveData = async (submitAfterSave = false) => {
  if (!header.customer_kode) return toast.warning("Customer harus diisi.");
  if (!header.kategori) return toast.warning("Kategori harus dipilih.");
  if (!header.keterangan) return toast.warning("Permasalahan wajib diisi.");

  const validItems = items.value.filter((i) => i.kode_barang && i.nama_barang);
  if (validItems.length === 0 && header.status === "DRAFT")
    return toast.warning("Tabel barang kosong.");

  const executeSave = async () => {
    header.nominal_inv = potensiKerugian.value;
    isSaving.value = true;
    try {
      // Simpan data sebagai DRAFT terlebih dahulu
      const payload = { header, details: validItems, isNew: !isEditMode.value };
      const response = await api.post("/komplain-form/save", payload);
      const savedNomor = response.data.nomor;
      header.nomor = savedNomor; // Amankan nomornya

      if (submitAfterSave) {
        // Buka modal Otorisasi setelah Draft berhasil disimpan
        dialogs.auth = true;
      } else {
        toast.success("BAP berhasil disimpan sebagai Draft.");
        if (!isEditMode.value)
          router.replace({ name: "KomplainCustomerEdit", params: { nomor: savedNomor } });
        else loadData(header.nomor);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Gagal menyimpan BAP.");
      } else {
        toast.error("Gagal menyimpan BAP.");
      }
    } finally {
      isSaving.value = false;
    }
  };

  if (submitAfterSave) {
    openConfirm(
      "Otorisasi Submit",
      "Anda membutuhkan persetujuan Supervisor (ESTU) untuk Submit BAP ini. Lanjutkan?",
      "primary",
      "mdi-shield-key",
      executeSave
    );
  } else {
    await executeSave();
  }
};

const handleAuthSuccess = async (authData: { authNomor: string; approver: string }) => {
  dialogs.auth = false;
  isSaving.value = true;
  try {
    await api.put(`/komplain-form/${header.nomor}/status`, {
      status: "SUBMITTED",
      catatan: `BAP disubmit. (Diotorisasi oleh: ${authData.approver})`,
    });
    toast.success("BAP berhasil disubmit dan diotorisasi!");
    router.push({ name: "KomplainCustomer" });
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal memproses Submit BAP setelah otorisasi.");
    } else {
      toast.error("Gagal memproses Submit BAP setelah otorisasi.");
    }
  } finally {
    isSaving.value = false;
  }
};

const markAsOnReview = async () => {
  openConfirm(
    "Proses Review",
    "Mulai investigasi BAP?",
    "warning",
    "mdi-magnify-scan",
    async () => {
      isSaving.value = true;
      try {
        await api.put(`/komplain-form/${header.nomor}/status`, {
          status: "ON_REVIEW",
          catatan: "Mulai diinvestigasi Pusat.",
        });
        toast.success("Status: ON REVIEW.");
        loadData(header.nomor);
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          toast.error(error.response?.data?.message || "Gagal update status.");
        } else {
          toast.error("Gagal update status.");
        }
      } finally {
        isSaving.value = false;
      }
    }
  );
};

const submitSolusi = async () => {
  if (!header.solusi) return toast.warning("Solusi belum diisi!");
  openConfirm(
    "Simpan Solusi",
    "Selesaikan BAP dan simpan solusi?",
    "success",
    "mdi-check",
    async () => {
      isSaving.value = true;
      try {
        await api.post("/komplain-form/save", { header, details: [], isNew: false });
        await api.put(`/komplain-form/${header.nomor}/status`, {
          status: "RESOLVED",
          catatan: "Solusi diberikan, menunggu pertanggungjawaban.",
        });
        toast.success("Solusi berhasil disimpan. Status: RESOLVED.");
        loadData(header.nomor);
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          toast.error(error.response?.data?.message || "Gagal menyimpan solusi.");
        } else {
          toast.error("Gagal menyimpan solusi.");
        }
      } finally {
        isSaving.value = false;
      }
    }
  );
};

const submitTanggungJawab = async () => {
  if (!header.tanggung_jawab) return toast.warning("Pertanggung Jawaban belum diisi!");
  openConfirm(
    "Simpan Pertanggung Jawaban",
    "Simpan data pertanggung jawaban?",
    "primary",
    "mdi-content-save",
    async () => {
      isSaving.value = true;
      try {
        await api.post("/komplain-form/save", { header, details: [], isNew: false });
        toast.success("Pertanggung Jawaban berhasil disimpan.");
        loadData(header.nomor);
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          toast.error(error.response?.data?.message || "Gagal menyimpan.");
        } else {
          toast.error("Gagal menyimpan.");
        }
      } finally {
        isSaving.value = false;
      }
    }
  );
};

const printData = () => {
  window.open(
    router.resolve({ name: "KomplainCustomerPrint", params: { nomor: header.nomor } }).href,
    "_blank"
  );
};
const getStatusColor = (status: string) => {
  return status === "DRAFT"
    ? "grey"
    : status === "SUBMITTED"
    ? "info"
    : status === "ON_REVIEW"
    ? "warning"
    : status === "RESOLVED"
    ? "success"
    : "error";
};

onMounted(() => {
  if (isEditMode.value) loadData(route.params.nomor as string);
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-file-document-edit-outline">
    <template #header-actions>
      <v-btn
        v-if="canEditDraft"
        color="primary"
        variant="outlined"
        size="small"
        prepend-icon="mdi-content-save"
        :loading="isSaving"
        @click="saveData(false)"
        >Simpan Draft</v-btn
      >
      <v-btn
        v-if="canEditDraft"
        color="success"
        size="small"
        prepend-icon="mdi-send-check"
        :loading="isSaving"
        @click="saveData(true)"
        >Submit BAP</v-btn
      >

      <v-btn
        v-if="canProcessReview && header.status === 'SUBMITTED'"
        color="warning"
        size="small"
        prepend-icon="mdi-magnify-scan"
        :loading="isSaving"
        @click="markAsOnReview"
        >Proses Review</v-btn
      >
      <v-btn
        v-if="canInputSolusi"
        color="success"
        size="small"
        prepend-icon="mdi-check-decagram"
        :loading="isSaving"
        @click="submitSolusi"
        >Simpan Solusi & Selesai</v-btn
      >
      <v-btn
        v-if="canInputTanggungJawab"
        color="primary"
        size="small"
        prepend-icon="mdi-content-save-all"
        :loading="isSaving"
        @click="submitTanggungJawab"
        >Simpan Penanggung Jawab</v-btn
      >

      <v-btn
        v-if="isEditMode"
        color="green-darken-2"
        size="small"
        prepend-icon="mdi-printer"
        @click="printData"
        >Cetak</v-btn
      >
      <v-btn size="small" prepend-icon="mdi-arrow-left" @click="handleBack">Kembali</v-btn>
    </template>

    <v-row class="mt-1 px-2" align="start">
      <v-col cols="12" md="4" class="d-flex flex-column gap-4">
        <v-card variant="outlined" class="rounded-lg shadow-sm bg-white">
          <v-card-title
            class="bg-grey-lighten-4 text-subtitle-2 font-weight-bold d-flex justify-space-between align-center px-4 py-3 border-b"
          >
            <span><v-icon start size="small">mdi-information-outline</v-icon> INFO HEADER</span>
            <v-chip
              :color="getStatusColor(header.status)"
              size="x-small"
              class="font-weight-bold text-uppercase"
              >{{ header.status.replace("_", " ") }}</v-chip
            >
          </v-card-title>
          <v-card-text class="pa-4">
            <v-row dense>
              <v-col cols="6"
                ><v-text-field
                  label="No. BAP"
                  v-model="header.nomor"
                  readonly
                  filled
                  density="compact"
                  hide-details
                  placeholder="Otomatis"
              /></v-col>
              <v-col cols="6"
                ><v-text-field
                  label="Tanggal"
                  v-model="header.tanggal"
                  type="date"
                  density="compact"
                  hide-details
                  :readonly="!canEditDraft"
                  variant="outlined"
              /></v-col>
              <v-col cols="12"
                ><v-text-field
                  label="Nama Customer"
                  v-model="header.customer_nama"
                  density="compact"
                  hide-details
                  readonly
                  filled
              /></v-col>
              <v-col cols="6"
                ><v-text-field
                  label="Nama CP"
                  v-model="header.contact_nama"
                  density="compact"
                  variant="outlined"
                  hide-details
                  :readonly="!canEditDraft"
                  placeholder="Nama Pelapor"
              /></v-col>
              <v-col cols="6"
                ><v-text-field
                  label="No. Telp CP"
                  v-model="header.contact_telp"
                  density="compact"
                  variant="outlined"
                  hide-details
                  :readonly="!canEditDraft"
                  placeholder="WA Aktif"
              /></v-col>
              <v-col cols="12"
                ><v-select
                  label="Kategori Masalah"
                  v-model="header.kategori"
                  :items="kategoriOptions"
                  density="compact"
                  variant="outlined"
                  hide-details
                  :readonly="!canEditDraft"
              /></v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <v-card variant="outlined" class="rounded-lg shadow-sm bg-white">
          <v-card-title
            class="bg-grey-lighten-4 text-subtitle-2 font-weight-bold px-4 py-3 border-b"
          >
            <v-icon start size="small">mdi-receipt-text-outline</v-icon> REFERENSI INVOICE
          </v-card-title>
          <v-card-text class="pa-4 pb-2">
            <v-row dense class="mb-3">
              <v-col cols="12"
                ><v-text-field
                  label="Cari No. Invoice"
                  v-model="header.ref_nomor"
                  density="compact"
                  variant="outlined"
                  hide-details
                  :readonly="!canEditDraft"
                  placeholder="Klik icon cari ➔"
                  prepend-inner-icon="mdi-magnify"
                  @click:prepend-inner="canEditDraft && (dialogs.invoiceSearch = true)"
                  @click="canEditDraft && (dialogs.invoiceSearch = true)"
              /></v-col>
              <v-col cols="12">
                <v-text-field
                  label="Potensi Kerugian (Rp)"
                  :model-value="formatRupiah(potensiKerugian)"
                  density="compact"
                  hide-details
                  readonly
                  filled
                  class="font-weight-bold text-error input-bg-red"
                  hint="Dihitung otomatis dari Qty Masalah x Harga Barang"
                  persistent-hint
                />
              </v-col>
            </v-row>
          </v-card-text>

          <v-data-table
            :headers="tableHeaders"
            :items="items"
            class="compact-table border-t"
            density="compact"
            :items-per-page="-1"
            hide-default-footer
          >
            <template #[`item.barang_info`]="{ item }">
              <div class="py-1">
                <div class="text-caption font-weight-bold text-primary">{{ item.kode_barang }}</div>
                <div
                  class="text-caption text-truncate"
                  style="max-width: 150px"
                  :title="item.nama_barang"
                >
                  {{ item.nama_barang }}
                </div>
                <div class="text-caption text-grey-darken-1">
                  Size: {{ item.ukuran }} | Qty Inv: {{ item.qty_invoice }}
                </div>
              </div>
            </template>
            <template #[`item.qty`]="{ item }">
              <v-text-field
                v-model.number="item.qty"
                type="number"
                min="0"
                :max="item.qty_invoice"
                density="compact"
                variant="outlined"
                hide-details
                class="text-center font-weight-bold"
                :readonly="!canEditDraft"
                @input="validateQty(item)"
              />
            </template>
            <template #[`item.foto`]="{ item }">
              <div class="d-flex justify-center">
                <div v-if="item.foto_url" class="position-relative" style="display: inline-block">
                  <v-avatar
                    rounded
                    size="32"
                    class="border cursor-pointer"
                    @click="openPreview(item.foto_url)"
                  >
                    <v-img :src="item.foto_url" cover></v-img>
                  </v-avatar>

                  <v-btn
                    v-if="canEditDraft"
                    icon="mdi-close-circle"
                    color="error"
                    variant="flat"
                    size="16"
                    class="position-absolute"
                    style="
                      top: -6px;
                      right: -6px;
                      height: 16px;
                      width: 16px;
                      min-width: 16px;
                      padding: 0;
                    "
                    @click.stop="hapusFoto(item)"
                    title="Ganti Gambar"
                  />
                </div>

                <v-file-input
                  :key="'input-' + item.id"
                  v-model="item._fileObj"
                  accept="image/png, image/jpeg"
                  density="compact"
                  variant="plain"
                  hide-details
                  prepend-icon=""
                  prepend-inner-icon="mdi-camera"
                  :loading="item.isUploading"
                  @update:model-value="uploadFoto(item)"
                />
              </div>
            </template>
            <template #[`item.actions`]="{ index }">
              <v-btn
                v-if="canEditDraft"
                icon="mdi-delete"
                variant="text"
                color="error"
                size="x-small"
                @click="removeRow(index)"
              />
            </template>
          </v-data-table>
        </v-card>

        <v-card
          v-if="isEditMode && logs.length > 0"
          variant="outlined"
          class="rounded-lg shadow-sm bg-white"
        >
          <v-card-title
            class="bg-grey-lighten-4 text-subtitle-2 font-weight-bold px-4 py-3 border-b"
          >
            <v-icon start size="small">mdi-history</v-icon> RIWAYAT TINDAKAN
          </v-card-title>
          <v-card-text class="pa-4">
            <v-timeline density="compact" side="end" truncate-line="both">
              <v-timeline-item
                v-for="log in logs"
                :key="log.cmpl_id"
                :dot-color="getStatusColor(log.cmpl_status)"
                size="x-small"
              >
                <div class="text-caption font-weight-bold">{{ log.cmpl_status }}</div>
                <div class="text-caption">{{ log.cmpl_catatan }}</div>
                <div class="text-caption text-grey mt-1">
                  {{ log.user_nama }} • {{ format(new Date(log.date_create), "dd/MM/yyyy HH:mm") }}
                </div>
              </v-timeline-item>
            </v-timeline>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="8" class="d-flex flex-column gap-4">
        <v-card
          variant="outlined"
          class="rounded-lg shadow-sm"
          style="border-color: #1976d2 !important"
        >
          <v-card-title
            class="bg-blue-lighten-5 text-blue-darken-3 text-subtitle-1 font-weight-bold text-center py-3 border-b border-blue-lighten-3"
          >
            LAPORAN TOKO
          </v-card-title>
          <v-card-text class="pa-4 bg-white">
            <v-row>
              <v-col cols="12" md="6">
                <v-textarea
                  label="POKOK PERMASALAHAN"
                  v-model="header.keterangan"
                  rows="10"
                  variant="outlined"
                  hide-details
                  :readonly="!canEditDraft"
                  bg-color="white"
                  placeholder="Jelaskan secara detail keluhan customer..."
                ></v-textarea>
              </v-col>
              <v-col cols="12" md="6">
                <v-textarea
                  label="SUMBER MASALAH (Analisa Toko)"
                  v-model="header.sumber_masalah"
                  rows="10"
                  variant="outlined"
                  hide-details
                  :readonly="!canEditDraft"
                  bg-color="white"
                  placeholder="Contoh: Kesalahan operator sablon, Misskomunikasi CS..."
                ></v-textarea>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <v-card
          variant="outlined"
          class="rounded-lg shadow-sm"
          style="border-color: #388e3c !important"
        >
          <v-card-title
            class="bg-green-lighten-5 text-green-darken-3 text-subtitle-1 font-weight-bold text-center py-3 border-b border-green-lighten-3"
          >
            KEPUTUSAN PUSAT
          </v-card-title>
          <v-card-text class="pa-4 bg-white">
            <v-row>
              <v-col cols="12" md="6">
                <v-textarea
                  label="SOLUSI DAN TINDAK LANJUT"
                  v-model="header.solusi"
                  rows="10"
                  variant="outlined"
                  hide-details
                  :readonly="!canInputSolusi && !canInputTanggungJawab"
                  :bg-color="canInputSolusi ? 'yellow-lighten-5' : 'white'"
                  placeholder="Diisi oleh KDC saat status ON REVIEW..."
                ></v-textarea>
              </v-col>
              <v-col cols="12" md="6">
                <v-textarea
                  label="PERTANGGUNG JAWABAN"
                  v-model="header.tanggung_jawab"
                  rows="10"
                  variant="outlined"
                  hide-details
                  :readonly="!canInputTanggungJawab"
                  :bg-color="canInputTanggungJawab ? 'yellow-lighten-5' : 'white'"
                  placeholder="Diisi setelah Solusi disepakati (RESOLVED)..."
                ></v-textarea>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <InvoiceSearchModal
      v-if="dialogs.invoiceSearch"
      source="komplain"
      @close="dialogs.invoiceSearch = false"
      @invoice-selected="onInvoiceSelected"
    />
    <AuthorizationModal
      v-if="dialogs.auth"
      jenis="SUBMIT_BAP"
      :transaksi="header.nomor"
      :title="`Otorisasi Submit BAP (${header.nomor})`"
      :keterangan="`Permintaan Submit BAP.\nKategori: ${
        header.kategori
      }\nPotensi Kerugian: ${formatRupiah(header.nominal_inv)}`"
      @close="
        dialogs.auth = false;
        loadData(header.nomor);
      "
      @success="handleAuthSuccess"
    />
    <v-dialog v-model="isPreviewOpen" max-width="800px"
      ><v-img :src="previewImageUrl"></v-img
    ></v-dialog>
    <v-dialog v-model="dialogs.confirm" max-width="400px" persistent>
      <v-card>
        <v-card-title :class="`bg-${confirmData.color} text-white`"
          ><v-icon start size="small">{{ confirmData.icon }}</v-icon>
          {{ confirmData.title }}</v-card-title
        >
        <v-card-text class="pa-4 pt-5">{{ confirmData.message }}</v-card-text>
        <v-card-actions
          ><v-spacer /><v-btn text @click="dialogs.confirm = false">Batal</v-btn
          ><v-btn :color="confirmData.color" variant="flat" @click="confirmData.action"
            >Ya</v-btn
          ></v-card-actions
        >
      </v-card>
    </v-dialog>

    <!-- Dialog Preview Gambar -->
    <v-dialog v-model="isPreviewOpen" max-width="800px">
      <v-card>
        <v-toolbar density="compact" color="primary">
          <v-toolbar-title class="text-subtitle-2 font-weight-bold"
            >Preview Foto Bukti</v-toolbar-title
          >
          <v-spacer />
          <v-btn icon="mdi-close" @click="isPreviewOpen = false" variant="text" />
        </v-toolbar>
        <v-card-text class="pa-0">
          <v-img :src="previewImageUrl || ''" contain class="bg-grey-lighten-4" max-height="70vh" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.gap-4 {
  gap: 16px;
}
.shadow-sm {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05) !important;
}
.border-b {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12) !important;
}
.border-t {
  border-top: 1px solid rgba(0, 0, 0, 0.12) !important;
}

/* Custom input styling for nominal to stand out */
.input-bg-red :deep(input) {
  color: #d32f2f !important;
  font-weight: bold;
}

/* ================================================== */
/* PAKSA KONSISTEN FONT 11PX UNTUK SEMUA INPUT & TEKS */
/* ================================================== */

/* Teks dalam input, textarea, dan dropdown */
:deep(.v-field__input),
:deep(.v-field__input input),
:deep(textarea),
:deep(.v-select__selection-text) {
  font-size: 11px !important;
  line-height: 1.4 !important;
}

/* Label normal */
:deep(.v-label) {
  font-size: 11px !important;
}

/* Label saat input diisi (melayang ke atas) dibikin lebih kecil dikit biar presisi */
:deep(.v-label.v-field-label--floating) {
  font-size: 10px !important;
}

/* Dropdown list menu */
:deep(.v-list-item-title) {
  font-size: 11px !important;
}

/* Judul Card dan Section biar proporsional */
.text-subtitle-1 {
  font-size: 12px !important;
}
.text-subtitle-2 {
  font-size: 11px !important;
}
.text-caption {
  font-size: 11px !important;
}

/* ================================================== */

/* Compact table for left column */
.compact-table :deep(th) {
  font-size: 11px !important;
  padding: 0 8px !important;
  white-space: nowrap;
  background: #f5f5f5;
}
.compact-table :deep(td) {
  font-size: 11px !important;
  padding: 4px 8px !important;
}
.compact-table :deep(.v-text-field input) {
  text-align: center;
  padding: 4px 0 !important;
  min-height: unset;
  font-size: 11px !important;
}
.compact-table :deep(.v-field__input) {
  min-height: 28px !important;
  padding-top: 0;
  padding-bottom: 0;
}
</style>

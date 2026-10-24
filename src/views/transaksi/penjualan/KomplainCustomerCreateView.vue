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

// Alur status untuk indikator di atas form
const alurLangkah = [
  { kode: "DRAFT", label: "Draft" },
  { kode: "SUBMITTED", label: "Diajukan" },
  { kode: "ON_REVIEW", label: "Direview pusat" },
  { kode: "RESOLVED", label: "Solusi diberikan" },
] as const;

const indeksLangkah = computed(() => alurLangkah.findIndex((s) => s.kode === header.status));

const solusiLocked = computed(() => !canInputSolusi.value && !canInputTanggungJawab.value);

const pusatHint = computed(() => {
  if (canInputSolusi.value) return "Isi solusi, lalu klik Simpan solusi & selesai.";
  if (canInputTanggungJawab.value) return "Isi pertanggungjawaban, lalu simpan.";
  return "";
});

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
  { title: "Kode", key: "kode_barang", width: "150px", sortable: false },
  { title: "Nama barang", key: "nama_barang", sortable: false },
  { title: "Ukuran", key: "ukuran", width: "80px", align: "center", sortable: false },
  { title: "Qty inv", key: "qty_invoice", width: "80px", align: "end", sortable: false },
  { title: "Qty masalah", key: "qty", width: "110px", align: "center", sortable: false },
  { title: "Foto", key: "foto", width: "120px", align: "center", sortable: false },
  { title: "", key: "actions", width: "50px", align: "center", sortable: false },
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
  const bolehBuka = isEditMode.value
    ? authStore.can(MENU_ID, "view") || authStore.can(MENU_ID, "edit")
    : authStore.can(MENU_ID, "insert");

  if (!bolehBuka) {
    toast.error("Anda tidak memiliki izin untuk membuka halaman ini.");
    router.back();
    return;
  }

  if (isEditMode.value) loadData(route.params.nomor as string);
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-file-document-edit-outline">
    <template #header-actions>
      <v-btn
        v-if="canEditDraft"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-content-save"
        :loading="isSaving"
        @click="saveData(false)"
        >Simpan draft</v-btn
      >
      <v-btn
        v-if="canEditDraft"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-send-check"
        :loading="isSaving"
        @click="saveData(true)"
        >Submit BAP</v-btn
      >
      <v-btn
        v-if="canProcessReview && header.status === 'SUBMITTED'"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-magnify-scan"
        :loading="isSaving"
        @click="markAsOnReview"
        >Proses review</v-btn
      >
      <v-btn
        v-if="canInputSolusi"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-check-decagram"
        :loading="isSaving"
        @click="submitSolusi"
        >Simpan solusi & selesai</v-btn
      >
      <v-btn
        v-if="canInputTanggungJawab"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-content-save-all"
        :loading="isSaving"
        @click="submitTanggungJawab"
        >Simpan pertanggungjawaban</v-btn
      >
      <v-btn
        v-if="isEditMode"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-printer"
        @click="printData"
        >Cetak</v-btn
      >
      <v-btn
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-arrow-left"
        @click="handleBack"
        >Kembali</v-btn
      >
    </template>

    <div class="form-page">
      <!-- ══════════ ALUR STATUS ══════════ -->
      <div class="alur-wrap">
        <ol class="alur" aria-label="Alur status BAP">
          <li
            v-for="(langkah, i) in alurLangkah"
            :key="langkah.kode"
            class="alur-step"
            :class="{ 'is-done': i < indeksLangkah, 'is-active': i === indeksLangkah }"
          >
            <span class="alur-dot">
              <v-icon v-if="i < indeksLangkah" size="12">mdi-check</v-icon>
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span class="alur-label">{{ langkah.label }}</span>
          </li>
        </ol>
      </div>

      <!-- ══════════ RINGKASAN ══════════ -->
      <section class="panel">
        <div class="summary-grid">
          <div class="s-readonly">
            <span class="s-label">No. BAP</span>
            <span class="s-value s-nomor">
              {{ header.nomor || "Otomatis saat disimpan" }}
              <v-chip
                :color="getStatusColor(header.status)"
                size="x-small"
                variant="flat"
                class="font-weight-bold text-uppercase"
                >{{ header.status.replace("_", " ") }}</v-chip
              >
            </span>
          </div>

          <v-text-field
            label="Tanggal"
            v-model="header.tanggal"
            type="date"
            density="compact"
            variant="outlined"
            hide-details
            class="form-field"
            :class="{ 'is-locked': !canEditDraft }"
            :readonly="!canEditDraft"
          />

          <v-select
            label="Kategori masalah"
            v-model="header.kategori"
            :items="kategoriOptions"
            density="compact"
            variant="outlined"
            hide-details
            class="form-field s-span-2"
            :class="{ 'is-locked': !canEditDraft }"
            :readonly="!canEditDraft"
            :menu-props="{ class: 'bap-menu' }"
          />

          <v-text-field
            label="No. invoice"
            v-model="header.ref_nomor"
            density="compact"
            variant="outlined"
            hide-details
            class="form-field"
            :class="{ 'is-locked': !canEditDraft }"
            :readonly="!canEditDraft"
            placeholder="Klik untuk mencari"
            prepend-inner-icon="mdi-magnify"
            @click:prepend-inner="canEditDraft && (dialogs.invoiceSearch = true)"
            @click="canEditDraft && (dialogs.invoiceSearch = true)"
          />

          <div class="s-readonly" :class="{ 'is-empty': !header.customer_kode }">
            <span class="s-label">Customer</span>
            <span class="s-value">
              {{
                header.customer_kode
                  ? `${header.customer_kode} - ${header.customer_nama}`
                  : "Pilih invoice terlebih dahulu"
              }}
            </span>
          </div>

          <v-text-field
            label="Nama CP"
            v-model="header.contact_nama"
            density="compact"
            variant="outlined"
            hide-details
            class="form-field"
            :class="{ 'is-locked': !canEditDraft }"
            :readonly="!canEditDraft"
            placeholder="Nama pelapor"
          />

          <v-text-field
            label="No. telp CP"
            v-model="header.contact_telp"
            density="compact"
            variant="outlined"
            hide-details
            class="form-field"
            :class="{ 'is-locked': !canEditDraft }"
            :readonly="!canEditDraft"
            placeholder="WA aktif"
          />
        </div>
      </section>

      <!-- ══════════ BARANG BERMASALAH ══════════ -->
      <section class="panel panel-flush">
        <div class="panel-head">
          <h3 class="panel-title">
            Barang bermasalah
            <span class="panel-count">({{ items.length }})</span>
          </h3>
          <div class="loss-inline" title="Dihitung dari qty masalah x harga barang">
            <span class="loss-label">Potensi kerugian</span>
            <strong class="loss-value">{{ formatRupiah(potensiKerugian) }}</strong>
          </div>
        </div>

        <v-data-table
          :headers="tableHeaders"
          :items="items"
          class="items-table"
          density="compact"
          :items-per-page="-1"
          hide-default-footer
        >
          <template #[`item.kode_barang`]="{ item }">
            <span class="item-kode">{{ item.kode_barang }}</span>
          </template>

          <template #[`item.nama_barang`]="{ item }">
            <span class="item-nama">{{ item.nama_barang }}</span>
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
              class="cell-qty"
              :readonly="!canEditDraft"
              @input="validateQty(item)"
            />
          </template>

          <template #[`item.foto`]="{ item }">
            <div class="d-flex justify-center align-center">
              <div v-if="item.foto_url" class="foto-wrap">
                <v-avatar rounded size="32" class="foto-thumb" @click="openPreview(item.foto_url)">
                  <v-img :src="item.foto_url" cover></v-img>
                </v-avatar>

                <v-btn
                  v-if="canEditDraft"
                  icon="mdi-close-circle"
                  color="error"
                  variant="flat"
                  size="16"
                  class="foto-remove"
                  @click.stop="hapusFoto(item)"
                  title="Ganti gambar"
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
              icon="mdi-delete-outline"
              variant="text"
              color="error"
              size="x-small"
              @click="removeRow(index)"
            />
          </template>

          <template #no-data>
            <div class="text-center text-caption text-grey pa-4">
              {{
                canEditDraft
                  ? "Belum ada barang. Pilih invoice di bagian atas untuk memuat barang."
                  : "Tidak ada barang."
              }}
            </div>
          </template>
        </v-data-table>
      </section>

      <!-- ══════════ LAPORAN TOKO | KEPUTUSAN PUSAT ══════════ -->
      <div class="narasi-grid">
        <section class="panel">
          <h3 class="panel-title">Laporan toko</h3>
          <div class="stack">
            <v-textarea
              label="Pokok permasalahan *"
              v-model="header.keterangan"
              rows="6"
              auto-grow
              variant="outlined"
              hide-details
              class="form-field"
              :class="{ 'is-locked': !canEditDraft }"
              :readonly="!canEditDraft"
              placeholder="Jelaskan secara detail keluhan customer..."
            />
            <v-textarea
              label="Sumber masalah (analisa toko)"
              v-model="header.sumber_masalah"
              rows="6"
              auto-grow
              variant="outlined"
              hide-details
              class="form-field"
              :class="{ 'is-locked': !canEditDraft }"
              :readonly="!canEditDraft"
              placeholder="Contoh: kesalahan operator sablon, miskomunikasi CS..."
            />
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h3 class="panel-title">Keputusan pusat</h3>
            <span v-if="pusatHint" class="panel-hint">{{ pusatHint }}</span>
          </div>
          <div class="stack">
            <v-textarea
              label="Solusi dan tindak lanjut"
              v-model="header.solusi"
              rows="6"
              auto-grow
              variant="outlined"
              hide-details
              class="form-field"
              :class="{ 'is-locked': solusiLocked, 'is-target': canInputSolusi }"
              :readonly="solusiLocked"
              placeholder="Diisi oleh KDC saat status On Review..."
            />
            <v-textarea
              label="Pertanggungjawaban"
              v-model="header.tanggung_jawab"
              rows="6"
              auto-grow
              variant="outlined"
              hide-details
              class="form-field"
              :class="{ 'is-locked': !canInputTanggungJawab, 'is-target': canInputTanggungJawab }"
              :readonly="!canInputTanggungJawab"
              placeholder="Diisi setelah solusi disepakati (Resolved)..."
            />
          </div>
        </section>
      </div>

      <!-- ══════════ RIWAYAT (tertutup default) ══════════ -->
      <v-expansion-panels v-if="isEditMode && logs.length > 0" variant="accordion" class="riwayat">
        <v-expansion-panel elevation="0">
          <v-expansion-panel-title>Riwayat tindakan ({{ logs.length }})</v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-timeline density="compact" side="end" truncate-line="both">
              <v-timeline-item
                v-for="log in logs"
                :key="log.cmpl_id"
                :dot-color="getStatusColor(log.cmpl_status)"
                size="x-small"
              >
                <div class="log-status">{{ log.cmpl_status.replace("_", " ") }}</div>
                <div class="log-note">{{ log.cmpl_catatan }}</div>
                <div class="log-meta">
                  {{ log.user_nama }} · {{ format(new Date(log.date_create), "dd/MM/yyyy HH:mm") }}
                </div>
              </v-timeline-item>
            </v-timeline>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

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

    <!-- Konfirmasi -->
    <v-dialog v-model="dialogs.confirm" max-width="400px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">
          <v-icon start size="small">{{ confirmData.icon }}</v-icon>
          {{ confirmData.title }}
        </v-card-title>
        <v-card-text class="pa-4 pt-5">{{ confirmData.message }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogs.confirm = false">Batal</v-btn>
          <v-btn variant="flat" class="btn-primary-red" @click="confirmData.action">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Preview foto -->
    <v-dialog v-model="isPreviewOpen" max-width="800px">
      <v-card class="dialog-card">
        <v-toolbar density="compact" class="modal-toolbar">
          <v-icon icon="mdi-image-outline" class="ms-2 me-1" size="20"></v-icon>
          <v-toolbar-title class="text-subtitle-1 font-weight-bold"
            >Preview foto bukti</v-toolbar-title
          >
          <v-spacer />
          <v-btn icon="mdi-close" @click="isPreviewOpen = false" variant="text" size="small" />
        </v-toolbar>
        <v-card-text class="pa-0">
          <v-img :src="previewImageUrl || ''" contain class="bg-grey-lighten-4" max-height="70vh" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-page {
  /* Tema merah lokal (DESIGN.md 10.3) */
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 11px;
  padding: 0 4px 16px;
}

/* ══════════ TOMBOL ══════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover {
  filter: brightness(1.08);
}
.btn-header-action {
  background-color: rgba(183, 28, 28, 0.08) !important;
  color: #b71c1c !important;
  font-weight: 700;
  border: 1px solid rgba(183, 28, 28, 0.2);
}
.btn-header-action:hover:not(:disabled) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.btn-primary-red:focus-visible,
.btn-header-action:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}

/* ══════════ ALUR STATUS (terpusat: dot di atas label, garis antar titik pusat) ══════════ */
.alur-wrap {
  padding: 14px 16px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
}
.alur {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  max-width: 720px;
  margin: 0 auto;
  padding: 0;
  list-style: none;
}
.alur-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
/* Garis dari titik pusat langkah sebelumnya ke titik pusat langkah ini */
.alur-step:not(:first-child)::before {
  content: "";
  position: absolute;
  top: 11px;
  right: 50%;
  width: 100%;
  height: 2px;
  background: rgba(var(--v-theme-on-surface), 0.12);
}
.alur-step.is-done:not(:first-child)::before,
.alur-step.is-active:not(:first-child)::before {
  background: #b71c1c;
}
.alur-dot {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: rgb(var(--v-theme-surface));
  border: 2px solid rgba(var(--v-theme-on-surface), 0.2);
}
.alur-step.is-done .alur-dot {
  background: #b71c1c;
  border-color: #b71c1c;
  color: #ffffff;
}
.alur-step.is-done .alur-label {
  color: rgba(var(--v-theme-on-surface), 0.75);
}
.alur-step.is-active .alur-dot {
  border-color: #b71c1c;
  color: #b71c1c;
  box-shadow: 0 0 0 3px rgba(183, 28, 28, 0.15);
}
.alur-step.is-active .alur-label {
  color: #b71c1c;
  font-weight: 700;
}

/* ══════════ PANEL ══════════ */
.panel {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
  padding: 12px;
}
.panel-flush {
  padding: 0;
  overflow: hidden;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
}
.panel-flush .panel-head {
  margin: 0;
  padding: 10px 12px;
}
.panel-title {
  margin: 0 0 10px;
  padding-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #b71c1c;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
}
.panel-head .panel-title {
  margin: 0;
  padding: 0;
  border: none;
}
.panel-count {
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-variant-numeric: tabular-nums;
}
.panel-hint {
  font-size: 11px;
  font-weight: 600;
  color: #b26a00;
}

/* ══════════ RINGKASAN ══════════ */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.s-span-2 {
  grid-column: span 2;
}
@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .s-span-2 {
    grid-column: auto;
  }
}

/* Sel baca-saja disetarakan tinggi dan bentuknya dengan field compact (40px) */
.s-readonly {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 40px;
  padding: 4px 12px;
  border-radius: 8px;
  border-left: 3px solid #b71c1c;
  background-color: rgba(183, 28, 28, 0.04);
  min-width: 0;
}
.s-readonly.is-empty {
  border-left-color: rgba(var(--v-theme-on-surface), 0.2);
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}
.s-label {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.s-value {
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s-readonly.is-empty .s-value {
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.s-nomor {
  display: flex;
  align-items: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}

/* ══════════ FIELD ══════════ */
.form-field :deep(.v-field) {
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}
.form-field :deep(.v-field__outline) {
  display: none !important;
}
.form-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.form-field :deep(.v-field__input),
.form-field :deep(input),
.form-field :deep(textarea),
.form-field :deep(.v-select__selection-text) {
  font-size: 11px !important;
  line-height: 1.4 !important;
}
.form-field :deep(.v-label) {
  font-size: 11px !important;
}
.form-field :deep(.v-label.v-field-label--floating) {
  font-size: 10px !important;
}
.form-field :deep(.v-field__prepend-inner .v-icon) {
  color: #b71c1c;
  opacity: 0.8;
}
.form-field.is-locked :deep(.v-field) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  border-color: rgba(var(--v-theme-on-surface), 0.12) !important;
}
.form-field.is-target :deep(.v-field) {
  border: 2px solid #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.05) !important;
}

/* ══════════ BARANG BERMASALAH ══════════ */
.loss-inline {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.loss-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
/* Nominal masalah: amber, bukan merah, supaya tidak menyaingi warna tema */
.loss-value {
  font-size: 16px;
  color: #b26a00;
  font-variant-numeric: tabular-nums;
}

.items-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  padding: 0 12px !important;
  height: 34px !important;
  white-space: nowrap;
  border-bottom: 2px solid #8e0000 !important;
}
.items-table :deep(td) {
  font-size: 11px !important;
  padding: 6px 12px !important;
}
.items-table :deep(td.v-data-table-column--align-end) {
  font-variant-numeric: tabular-nums;
}
.items-table :deep(tbody tr:nth-child(even) > td) {
  background-color: rgba(183, 28, 28, 0.025);
}
.items-table :deep(tbody tr:hover > td) {
  background-color: rgba(183, 28, 28, 0.07);
}

.item-kode {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.item-nama {
  white-space: normal;
  line-height: 1.3;
}

.cell-qty {
  max-width: 80px;
  margin: 0 auto;
}
.cell-qty :deep(input) {
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 11px !important;
  padding: 4px 0 !important;
  min-height: unset;
}
.cell-qty :deep(.v-field__input) {
  min-height: 28px !important;
  padding-top: 0;
  padding-bottom: 0;
}

.foto-wrap {
  position: relative;
  display: inline-block;
}
.foto-thumb {
  cursor: pointer;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
}
.foto-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  height: 16px;
  width: 16px;
  min-width: 16px;
  padding: 0;
}

/* ══════════ LAPORAN TOKO | KEPUTUSAN PUSAT ══════════ */
.narasi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}
@media (max-width: 1000px) {
  .narasi-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ══════════ RIWAYAT ══════════ */
.riwayat {
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
  overflow: hidden;
}
.riwayat :deep(.v-expansion-panel-title) {
  min-height: 40px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
  color: #b71c1c;
}
.riwayat :deep(.v-expansion-panel-text__wrapper) {
  padding: 4px 12px 12px;
}
.log-status {
  font-size: 11px;
  font-weight: 700;
}
.log-note {
  font-size: 11px;
}
.log-meta {
  margin-top: 2px;
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

/* ══════════ DIALOG (teleport, tetap membawa atribut scoped dari template ini) ══════════ */
.dialog-card {
  border-radius: 12px;
  overflow: hidden;
}
.modal-toolbar {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.modal-toolbar :deep(.v-toolbar-title),
.modal-toolbar :deep(.v-btn) {
  color: #ffffff !important;
}
.confirm-title {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}
</style>

<style>
/* Menu dropdown di-teleport ke luar halaman, jadi tidak bisa memakai scoped */
.bap-menu .v-list-item-title {
  font-size: 11px !important;
}
.bap-menu .v-list-item--active {
  background-color: rgba(183, 28, 28, 0.1) !important;
  color: #b71c1c !important;
}
.bap-menu .v-list-item:hover {
  background-color: rgba(183, 28, 28, 0.06) !important;
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import MintaBarangSearchModal from "@/components/lookup/MintaBarangSearchModal.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";
import AuthorizationModal from "@/components/modal/AuthorizationModal.vue";
import { AxiosError } from "axios";

// --- Tipe Data ---
interface FormHeader {
  nomor: string | null;
  tanggal: string;
  nomorTerima: string | null;
  gudangKode: string;
  gudangNama: string;
  storeKode: string;
  storeNama: string;
  peminta: string;
}
interface DetailItem {
  id: number;
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
}
interface Product {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  stok: number;
}

// --- [BARU] Interface Auth Dialog ---
interface AuthDialogState {
  show: boolean;
  title: string;
  jenis: string;
  nominal: number;
  transaksi?: string;
  barcode?: string;
  keterangan?: string;
  cabang?: string;
  onSuccess: (data: { authNomor: string; approver: string }) => void;
  onCancel: () => void;
}

// --- Inisialisasi & State ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "253";

const isEditMode = ref(false);
const loading = ref(true);
const formHeader = ref<FormHeader>({
  nomor: null,
  tanggal: format(new Date(), "yyyy-MM-dd"),
  nomorTerima: null,
  gudangKode: authStore.user?.cabang || "",
  gudangNama: authStore.user?.cabangNama || "",
  storeKode: "K01",
  storeNama: "PADOKAN",
  peminta: "",
});
const items = ref<DetailItem[]>([]);
const scannedBarcode = ref("");
const activeRowIndex = ref(0);
const isMultiSelectProduct = ref(false);
const isClosed = ref(false);

const audioSuccess = new Audio("/audio/beep_success.mp3");
const audioError = new Audio("/audio/beep_error.mp3");

const barcodeInputRef = ref<HTMLInputElement | null>(null);
const isScanning = ref(false); // State khusus untuk loading scan

// --- State Modal ---
const isLookupVisible = ref(false);
const isGudangLookupVisible = ref(false);
const approvalInfo = ref({ status: "", urut: 0 });

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

// --- [BARU] State Auth Dialog (Reactive) ---
const authDialog = reactive<AuthDialogState>({
  show: false,
  title: "",
  jenis: "",
  nominal: 0,
  transaksi: "",
  barcode: "",
  keterangan: "",
  cabang: "",
  onSuccess: () => {},
  onCancel: () => {},
});

// --- Computed Properties ---
const pageTitle = computed(() =>
  isEditMode.value ? "Ubah Pengambilan Barang" : "Buat Pengambilan Barang"
);
const totalJumlah = computed(() => items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0));

// --- Helper ---
const getErrorMessage = (err: unknown, fallback: string) => {
  const error = err as AxiosError<{ message?: string }>;
  return error.response?.data?.message || error.message || fallback;
};

// --- Headers Tabel ---
const headers = [
  { title: "No.", key: "no", sortable: false, width: "50px" },
  { title: "Kode Barang", key: "kode", sortable: false, width: "200px" },
  { title: "Nama Barang", key: "nama", sortable: false },
  { title: "Ukuran", key: "ukuran", sortable: false, width: "100px" },
  { title: "Stok", key: "stok", sortable: false, align: "end", width: "100px" },
  { title: "Jumlah", key: "jumlah", sortable: false, align: "end", width: "120px" },
  { title: "Actions", key: "actions", sortable: false, width: "80px", align: "center" },
] as const;

// --- [BARU] Helper Request Authorization ---
const requestAuthorization = (
  title: string,
  jenis: string,
  nominal: number,
  extraData: {
    transaksi?: string;
    barcode?: string;
    keteranganLengkap?: string;
    cabang?: string;
  } | null,
  onSuccess: (data: { authNomor: string; approver: string }) => void,
  onCancel: () => void
) => {
  authDialog.title = title;
  authDialog.jenis = jenis;
  authDialog.nominal = nominal;

  if (extraData) {
    authDialog.transaksi = extraData.transaksi || "";
    authDialog.barcode = extraData.barcode || "";
    authDialog.keterangan = extraData.keteranganLengkap || "";
    authDialog.cabang = extraData.cabang || "";
  } else {
    authDialog.transaksi = "";
    authDialog.barcode = "";
    authDialog.keterangan = "";
    authDialog.cabang = "";
  }

  // Wrapper agar modal tertutup sebelum callback dijalankan
  authDialog.onSuccess = (data) => {
    authDialog.show = false;
    onSuccess(data);
  };

  authDialog.onCancel = onCancel;
  authDialog.show = true;
};

// --- Methods ---
const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const refreshdata = () => {
  formHeader.value.peminta = "";
  formHeader.value.tanggal = format(new Date(), "yyyy-MM-dd");
  items.value = [];
  addNewRow();
  toast.info("Form telah dibatalkan dan direset.");
};

const addNewRow = () => {
  if (!items.value.some((item) => !item.kode)) {
    items.value.push({
      id: Date.now(),
      kode: "",
      barcode: "",
      nama: "",
      ukuran: "",
      stok: 0,
      jumlah: 0,
    });
  }
};

const loadDataForEdit = async (id: string) => {
  loading.value = true;
  try {
    const response = await api.get(`/ambil-barang-form/${id}`);
    formHeader.value = response.data.header;
    items.value = response.data.items.map((item: Record<string, unknown>) => ({
      ...item,
      id: Math.random(),
    }));
    addNewRow();

    if (response.data.header.closing === "Y") {
      isClosed.value = true;
      toast.warning("Dokumen ini sudah di-closing dan tidak dapat diubah.");
    }

    const responseStatus = await api.get(`/ambil-barang-form/${id}/approval-status`);
    approvalInfo.value = responseStatus.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data.");
    router.back();
  } finally {
    loading.value = false;
  }
};

const handleBarcodeScan = async () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;
  // 1. Kunci input agar tidak ada scan ganda saat loading
  isScanning.value = true;
  try {
    const response = await api.get("/ambil-barang-form/lookup/product-by-barcode", {
      params: { barcode, gudang: formHeader.value.gudangKode },
    });
    processProductSelection(response.data);
    audioSuccess.play().catch(() => {});
    toast.success(`OK: ${response.data.nama}`, { timeout: 1500 });
    scannedBarcode.value = "";
  } catch (error) {
    audioError.play().catch(() => {});
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Produk tidak ditemukan");
    nextTick(() => {
      barcodeInputRef.value?.select();
    });
  } finally {
    isScanning.value = false;

    // [PENTING] Kembalikan fokus ke input box secara paksa
    nextTick(() => {
      barcodeInputRef.value?.focus();
    });
  }
};

const handleBarcodeEnter = async (index: number) => {
  const barcode = items.value[index].kode;
  if (!barcode) return;
  try {
    const response = await api.get("/ambil-barang-form/lookup/product-by-barcode", {
      params: { barcode, gudang: formHeader.value.gudangKode },
    });
    const product = response.data;
    const existingIndex = items.value.findIndex(
      (i) => i.kode === product.kode && i.ukuran === product.ukuran && i !== items.value[index]
    );
    if (existingIndex !== -1) {
      items.value[existingIndex].jumlah += 1;
      items.value.splice(index, 1);
      toast.info("Jumlah item yang sudah ada ditambah 1.");
    } else {
      const currentItem = items.value[index];
      currentItem.kode = product.kode;
      currentItem.barcode = product.barcode;
      currentItem.nama = product.nama;
      currentItem.ukuran = product.ukuran;
      currentItem.stok = product.stok;
      currentItem.jumlah = 1;
    }
    addNewRow();

    nextTick(() => {
      // Kita perlu cara untuk akses ref input di dalam v-for
      // Ini agak tricky di Vuetify data-table, opsi termudah:
      // Biarkan user lanjut scan via Scanner Utama di atas (Recommended)

      // Jika user mau tetap di tabel:
      const inputs = document.querySelectorAll(".desktop-table input");
      if (inputs[inputs.length - 1]) {
        (inputs[inputs.length - 1] as HTMLElement).focus();
      }
    });
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Produk tidak ditemukan");
    items.value[index].kode = "";
  }
};

const openProductSearch = (index: number, isMulti: boolean) => {
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  isLookupVisible.value = true;
};

const onProductsSelected = (selectedProducts: Product[]) => {
  isLookupVisible.value = false;
  if (!selectedProducts || selectedProducts.length === 0) return;

  const productsToAdd = selectedProducts.filter(
    (p) => !items.value.some((item) => item.kode === p.kode && item.ukuran === p.ukuran)
  );

  if (productsToAdd.length < selectedProducts.length) {
    toast.info("Beberapa produk yang dipilih sudah ada di dalam daftar.");
  }
  if (productsToAdd.length === 0) return;

  const newItems = productsToAdd.map((product) => ({
    id: Date.now() + Math.random(),
    kode: product.kode,
    barcode: product.barcode,
    nama: product.nama,
    ukuran: product.ukuran,
    stok: product.stok,
    jumlah: 1,
  }));

  items.value.splice(activeRowIndex.value, 1, ...newItems);
  addNewRow();
};

const onGudangSelected = (gudang: { kode: string; nama: string }) => {
  formHeader.value.gudangKode = gudang.kode;
  formHeader.value.gudangNama = gudang.nama;
  isGudangLookupVisible.value = false;
};

const validateGudangKode = async () => {
  const kode = formHeader.value.gudangKode;
  if (!kode) {
    formHeader.value.gudangNama = "";
    return;
  }
  try {
    const response = await api.get(`/warehouses/${kode}`);
    if (response.data) {
      formHeader.value.gudangNama = response.data.nama;
    } else {
      formHeader.value.gudangNama = "";
      toast.error("Kode Gudang tidak ditemukan.");
    }
  } catch (err) {
    formHeader.value.gudangNama = "";
    toast.error(getErrorMessage(err, "Kode Gudang tidak ditemukan."));
  }
};

const processProductSelection = (product: Product) => {
  const existingItem = items.value.find(
    (i) => i.kode === product.kode && i.ukuran === product.ukuran
  );
  if (existingItem) {
    existingItem.jumlah += 1;
    toast.info("Jumlah item yang sudah ada ditambah 1.");
    return;
  }
  const emptyRowIndex = items.value.findIndex((item) => !item.kode);
  if (emptyRowIndex !== -1) {
    items.value.splice(emptyRowIndex, 1);
  }
  items.value.push({
    id: Date.now(),
    kode: product.kode,
    barcode: product.barcode,
    nama: product.nama,
    ukuran: product.ukuran,
    stok: product.stok,
    jumlah: 1,
  });
  addNewRow();
};

const deleteRow = (index: number) => {
  if (items.value.length > 1) {
    items.value.splice(index, 1);
  }
};

const validateForm = () => {
  if (!formHeader.value.peminta) {
    toast.error("Peminta harus diisi.");
    return false;
  }
  const validItems = items.value.filter((item) => item.kode && item.jumlah > 0);
  if (validItems.length === 0) {
    toast.error("Detail barang harus diisi minimal 1 baris.");
    return false;
  }
  for (const item of validItems) {
    if (item.jumlah > item.stok) {
      toast.error(`Jumlah untuk item ${item.nama} (${item.ukuran}) melebihi stok.`);
      return false;
    }
  }
  return true;
};

// --- [REFACTOR] Handle Save dengan Otorisasi Baru ---
const handleSave = () => {
  if (isEditMode.value && ["MINTA", "WAIT", "TOLAK"].includes(approvalInfo.value.status)) {
    toast.warning(
      "Transaksi ini sudah ditutup. Silakan ajukan & tunggu persetujuan untuk mengubah data."
    );
    return;
  }

  if (!validateForm()) return;

  showConfirmation("Konfirmasi Simpan", "Apakah Anda yakin ingin menyimpan data ini?", () => {
    // Susun info lengkap untuk HP User Store
    const infoLengkap = `Peminta: ${formHeader.value.peminta}\nGudang: ${formHeader.value.gudangNama}\nTotal Qty: ${totalJumlah.value}`;

    // Tentukan User Tujuan Otorisasi (Store Tujuan)
    // Di form ini: formHeader.value.storeKode (misal: 'K01')
    const targetBranch = formHeader.value.storeKode;

    requestAuthorization(
      "Otorisasi Ambil Barang",
      "AMBIL_BARANG", // Jenis Transaksi Baru
      totalJumlah.value, // Nominal = Total Qty (karena ambil barang biasanya internal/non-rupiah)
      {
        transaksi: formHeader.value.nomor || "DRAFT",
        keteranganLengkap: infoLengkap,
        // [PENTING] Tambahkan parameter cabang tujuan agar notifikasi masuk ke user cabang tersebut
        cabang: targetBranch,
      },
      (authResult) => {
        // Sukses -> Lanjut Simpan
        // Kita bisa kirim nama approver ke backend jika diperlukan
        executeSave(authResult.approver);
      },
      () => {
        toast.info("Simpan dibatalkan.");
      }
    );
  });
};

const handleBatal = () => {
  showConfirmation(
    "Konfirmasi Batal",
    "Semua perubahan yang belum disimpan akan hilang. Lanjutkan?",
    () => {
      refreshdata();
    }
  );
};

const handleTutup = () => {
  showConfirmation("Konfirmasi Tutup", "Anda yakin ingin menutup form ini?", () => {
    router.back();
  });
};

const executeSave = async (approverName: string = "") => {
  try {
    const payload = {
      header: formHeader.value,
      items: items.value.filter((item) => item.kode && item.jumlah > 0),
      approvalInfo: approvalInfo.value,
      approver: approverName, // Kirim info approver ke backend
      user: authStore.user,
    };

    const response = isEditMode.value
      ? await api.put(`/ambil-barang-form/${route.params.id}`, payload)
      : await api.post("/ambil-barang-form", payload);

    toast.success(response.data.message);
    router.push({ name: "AmbilBarang" });
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menyimpan data.");
  }
};

onMounted(() => {
  const id = route.params.id as string;
  if (id) {
    isEditMode.value = true;
    loadDataForEdit(id);
  } else {
    addNewRow();
    loading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        size="small"
        prepend-icon="mdi-content-save"
        color="primary"
        @click="handleSave"
        :disabled="isClosed"
        >Simpan</v-btn
      >
      <v-btn size="small" prepend-icon="mdi-refresh" variant="tonal" @click="handleBatal"
        >Batal</v-btn
      >
      <v-btn size="small" prepend-icon="mdi-close" @click="handleTutup">Tutup</v-btn>
    </template>

    <div v-if="loading" class="state-container"><v-progress-circular indeterminate /></div>
    <div v-else class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-alert
            v-if="isEditMode && approvalInfo.status && approvalInfo.status !== 'ACC'"
            :color="
              approvalInfo.status === 'WAIT'
                ? 'orange'
                : approvalInfo.status === 'TOLAK'
                ? 'error'
                : 'info'
            "
            density="compact"
            class="mb-3"
            variant="tonal"
          >
            <template v-if="approvalInfo.status === 'MINTA'"> Perlu Pengajuan Ubah </template>
            <template v-else-if="approvalInfo.status === 'WAIT'"> Menunggu Persetujuan </template>
            <template v-else-if="approvalInfo.status === 'TOLAK'"> Pengajuan Ditolak </template>
          </v-alert>
          <v-alert
            v-if="isEditMode && approvalInfo.status === 'ACC'"
            color="success"
            density="compact"
            class="mb-3"
            variant="tonal"
          >
            Perubahan Disetujui
          </v-alert>
          <v-text-field
            label="Nomor"
            v-model="formHeader.nomor"
            readonly
            variant="filled"
            density="compact"
            hide-details
          />
          <v-text-field
            label="Tanggal"
            v-model="formHeader.tanggal"
            type="date"
            density="compact"
            hide-details
          />
          <v-text-field
            label="No. Terima"
            v-model="formHeader.nomorTerima"
            readonly
            variant="filled"
            density="compact"
            hide-details
          />
          <div class="d-flex">
            <v-text-field
              label="Gudang (F1)"
              v-model="formHeader.gudangKode"
              density="compact"
              hide-details
              :disabled="isEditMode"
              @keydown.f1.prevent="isGudangLookupVisible = true"
              variant="outlined"
              @blur="validateGudangKode"
            />
            <v-text-field
              v-model="formHeader.gudangNama"
              class="ms-2"
              readonly
              variant="filled"
              density="compact"
              hide-details
            />
          </div>
          <v-text-field
            label="Ke Store"
            v-model="formHeader.storeNama"
            readonly
            variant="filled"
            density="compact"
            hide-details
          />
          <v-text-field
            label="Peminta"
            v-model="formHeader.peminta"
            density="compact"
            hide-details
            variant="outlined"
          />
        </div>
      </div>

      <div class="right-column">
        <div class="scanner-wrapper">
          <v-text-field
            ref="barcodeInputRef"
            v-model="scannedBarcode"
            label="Scan Barcode di Sini..."
            placeholder="Siap scan..."
            variant="outlined"
            density="compact"
            prepend-inner-icon="mdi-barcode-scan"
            hide-details
            clearable
            :loading="isScanning"
            :disabled="isScanning"
            @keydown.enter.prevent="handleBarcodeScan"
            autofocus
          />
        </div>

        <div class="table-container" style="height: 400px">
          <v-data-table
            :headers="headers"
            :items="items"
            class="desktop-table header-browse-blue"
            density="compact"
            fixed-header
            :items-per-page="-1"
          >
            <template v-slot:[`item.kode`]="{ item, index }">
              <v-text-field
                v-model="item.kode"
                variant="underlined"
                density="compact"
                hide-details
                placeholder="Barcode/F1/F2..."
                :readonly="!!item.nama"
                @keydown.enter.prevent="handleBarcodeEnter(index)"
                @keydown.f1.prevent="openProductSearch(index, false)"
                @keydown.f2.prevent="openProductSearch(index, true)"
              />
            </template>
            <template v-slot:[`item.jumlah`]="{ item }">
              <v-text-field
                v-model.number="item.jumlah"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-right"
              />
            </template>
            <template v-slot:[`item.actions`]="{ index }">
              <v-btn
                icon="mdi-delete"
                color="error"
                variant="text"
                size="x-small"
                @click="deleteRow(index)"
              />
            </template>
            <template #bottom></template>
            <template #tfoot>
              <tr class="font-weight-bold">
                <td colspan="5" class="text-right">Total:</td>
                <td class="text-right">{{ totalJumlah }}</td>
                <td></td>
              </tr>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>
          <div v-html="dialogConfirm.text"></div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              () => {
                dialogConfirm.onConfirm();
                dialogConfirm.show = false;
              }
            "
          >
            Ya
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <MintaBarangSearchModal
      v-if="isLookupVisible"
      source="ambil-barang"
      :multi="isMultiSelectProduct"
      :gudang="formHeader.gudangKode"
      @close="isLookupVisible = false"
      @products-selected="onProductsSelected"
    />

    <GudangSearchModal
      v-if="isGudangLookupVisible"
      :user-cabang="authStore.user?.cabang || ''"
      source="retur-dc"
      @close="isGudangLookupVisible = false"
      @gudang-selected="onGudangSelected"
    />

    <AuthorizationModal
      v-if="authDialog.show"
      :title="authDialog.title"
      :jenis="authDialog.jenis"
      :nominal="authDialog.nominal"
      :transaksi="authDialog.transaksi"
      :barcode="authDialog.barcode"
      :keterangan="authDialog.keterangan"
      :cabang="authDialog.cabang"
      @success="authDialog.onSuccess"
      @close="
        () => {
          authDialog.show = false;
          authDialog.onCancel();
        }
      "
    />
  </PageLayout>
</template>

<style scoped>
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important; /* Biru Tua */
  color: #ffffff !important; /* Teks Putih */
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important; /* Supaya lebih rapi */
}
</style>

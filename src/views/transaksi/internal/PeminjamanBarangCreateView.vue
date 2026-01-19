<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, addDays } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import ProductSearchModal from "@/components/lookup/ProductSearchModal.vue";
import AuthorizationModal from "@/components/modal/AuthorizationModal.vue";
import PenawaranSearchModal from "@/components/lookup/PenawaranSearchModal.vue";
import { AxiosError } from "axios";

// --- Tipe Data ---
interface FormHeader {
  idrec: string;
  nomor: string | null;
  tanggal: string;
  deadline: string;
  cabang: string;
  pic: string;
  keterangan: string;
  penawaran?: string;
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

interface LookupProduct {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  stok: number;
  kategori?: string;
}

// Interface untuk item detail yang datang dari API Penawaran
interface PenawaranDetailApi {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  barcode?: string;
}

// Interface untuk struktur lengkap response API
// interface PenawaranFullResponse {
//   header: {
//     pen_nomor: string;
//     pen_ket: string;
//     [key: string]: unknown; // Untuk field lain yang mungkin ada tapi belum didefinisikan
//   };
//   details: PenawaranDetailApi[];
// }

// --- Inisialisasi & State ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "56";

const isEditMode = ref(false);
const loading = ref(true);
const formHeader = ref<FormHeader>({
  idrec: "",
  nomor: null,
  tanggal: format(new Date(), "yyyy-MM-dd"),
  deadline: format(addDays(new Date(), 14), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang || "",
  pic: "",
  keterangan: "",
});
const authDialog = reactive<AuthDialogState>({
  show: false,
  title: "",
  jenis: "",
  nominal: 0,
  transaksi: "",
  barcode: "",
  keterangan: "",
  cabang: "",
  onSuccess: () => { },
  onCancel: () => { },
});
const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => { },
});
const dialogPrint = reactive({
  show: false,
  nomor: "",
});

const items = ref<DetailItem[]>([]);
const scannedBarcode = ref("");
const activeRowIndex = ref(0);
const isScanning = ref(false);
const isLookupVisible = ref(false);
const barcodeInputRef = ref<HTMLInputElement | null>(null);
const isPenawaranLookupVisible = ref(false);

const audioSuccess = new Audio("/audio/beep_success.mp3");
const audioError = new Audio("/audio/beep_error.mp3");

// --- Computed ---
const pageTitle = computed(() =>
  isEditMode.value ? "Ubah Peminjaman Barang" : "Buat Peminjaman Barang"
);
const totalJumlah = computed(() => items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0));

const headers = [
  { title: "No.", key: "no", sortable: false, width: "50px" },
  { title: "Kode Barang", key: "kode", sortable: false, width: "180px" },
  { title: "Nama Barang", key: "nama", sortable: false },
  { title: "Ukuran", key: "ukuran", sortable: false, width: "80px", align: "center" },
  { title: "Stok", key: "stok", sortable: false, align: "end", width: "90px" },
  { title: "Jumlah", key: "jumlah", sortable: false, align: "end", width: "110px" },
  { title: "Actions", key: "actions", sortable: false, width: "60px", align: "center" },
] as const;

// --- Methods ---
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

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleBarcodeScan = async () => {
  if (!formHeader.value.pic) {
    audioError.play().catch(() => { });
    toast.error("Silakan isi nama PIC Peminjam terlebih dahulu!");
    return;
  }

  if (!scannedBarcode.value) return;
  isScanning.value = true;
  try {
    const response = await api.get("/peminjaman-barang-form/lookup/product-by-barcode", {
      params: { barcode: scannedBarcode.value, cabang: formHeader.value.cabang },
    });
    processProductSelection(response.data);
    audioSuccess.play().catch(() => { });
    scannedBarcode.value = "";
    toast.success(`Ditambah: ${response.data.nama}`, { timeout: 1500 });
  } catch (error) {
    audioError.play().catch(() => { });
    toast.error("Produk tidak ditemukan", error);
  } finally {
    isScanning.value = false;
    nextTick(() => barcodeInputRef.value?.focus());
  }
};

const openProductSearch = (index: number) => {
  // --- VALIDASI PIC [BARU] ---
  if (!formHeader.value.pic) {
    toast.error("Silakan isi nama PIC Peminjam sebelum mencari barang!");
    return;
  }
  activeRowIndex.value = index;
  isLookupVisible.value = true;
};

/**
 * Memproses produk yang dipilih dari ProductSearchModal
 */
const onProductsSelected = (selectedProducts: LookupProduct[]) => {
  isLookupVisible.value = false;
  if (!selectedProducts || selectedProducts.length === 0) return;

  const newItems: DetailItem[] = selectedProducts.map((product) => ({
    id: Date.now() + Math.random(),
    kode: product.kode,
    barcode: product.barcode,
    nama: product.nama,
    ukuran: product.ukuran,
    stok: product.stok,
    jumlah: 1,
  }));

  // Ganti baris kosong yang sedang aktif atau tambahkan ke list
  const currentItem = items.value[activeRowIndex.value];
  if (currentItem && !currentItem.kode) {
    items.value.splice(activeRowIndex.value, 1, ...newItems);
  } else {
    items.value.push(...newItems);
  }

  addNewRow(); // Tambah baris kosong di akhir
  audioSuccess.play().catch(() => { });
};

const openPenawaranSearch = () => {
  if (!formHeader.value.cabang) {
    toast.error("Cabang/Gudang belum terdeteksi.");
    return;
  }
  isPenawaranLookupVisible.value = true;
};

const onPenawaranSelected = async (penawaran: { nomor: string }) => {
  isPenawaranLookupVisible.value = false;
  toast.info(`Memuat detail dari Penawaran ${penawaran.nomor}...`);

  try {
    // Mengambil detail penawaran (menggunakan endpoint yang sama dengan SO)
    const response = await api.get(`/so-form/lookup/penawaran-details/${penawaran.nomor}`, {
      params: { cabang: formHeader.value.cabang }, // Kirim cabang ke backend
    });
    const { header: penHeader, details: penDetails } = response.data;

    // Mapping ke Header Peminjaman
    formHeader.value.penawaran = penHeader.pen_nomor;
    formHeader.value.keterangan = penHeader.pen_ket;

    // Mapping ke Tabel Items Peminjaman
    // Kita bersihkan dulu item yang kosong
    items.value = penDetails.map((d: PenawaranDetailApi) => ({
      id: Date.now() + Math.random(),
      kode: d.kode,
      barcode: d.barcode || "",
      nama: d.nama,
      ukuran: d.ukuran || "",
      stok: d.stok || 0,
      jumlah: d.jumlah || 0,
    }));

    addNewRow(); // Tambah baris kosong di akhir
    toast.success(`Detail Penawaran ${penawaran.nomor} berhasil dimuat.`);
  } catch (error: unknown) {
    // Menangani error dengan tipe unknown/AxiosError
    const axiosError = error as AxiosError<{ message: string }>;
    const errorMessage = axiosError.response?.data?.message || "Gagal memuat detail penawaran.";

    toast.error(errorMessage);
    console.error(error);
  }
};

/**
 * Memproses satu produk hasil scan barcode
 */
const processProductSelection = (product: LookupProduct) => {
  const existing = items.value.find((i) => i.kode === product.kode && i.ukuran === product.ukuran);

  if (existing) {
    existing.jumlah += 1;
  } else {
    const emptyIdx = items.value.findIndex((item) => !item.kode);
    const newItem: DetailItem = {
      ...product,
      id: Date.now(),
      jumlah: 1,
    };

    if (emptyIdx !== -1) {
      items.value[emptyIdx] = newItem;
    } else {
      items.value.push(newItem);
    }
  }
  addNewRow();
};

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

const checkStokMinus = (): Promise<boolean> => {
  return new Promise((resolve) => {
    // Cari item yang jumlah pinjamnya > stok fisik
    const itemsMinus = items.value.filter((item) => {
      if (!item.kode) return false;
      return Number(item.jumlah || 0) > Number(item.stok || 0);
    });

    if (itemsMinus.length > 0) {
      const itemNames = itemsMinus.map((i) => `${i.nama} (${i.ukuran})`).join(", ");

      showConfirmation(
        "⚠️ Konfirmasi Stok Minus",
        `Barang berikut memiliki stok terbatas:\n\n(${itemNames}).\n\nStok akan menjadi MINUS jika dilanjutkan. Yakin tetap ingin meminjam?`,
        () => {
          // Jika user klik "Ya, Lanjutkan"
          resolve(true);
        }
      );

      // Listener jika user menutup dialog atau klik "Batal"
      const unwatch = watch(
        () => dialogConfirm.show,
        (isOpen) => {
          if (!isOpen) {
            unwatch();
            // Jika dialog tertutup tapi onConfirm belum dipanggil, resolve false
            setTimeout(() => {
              if (!dialogConfirm.show) resolve(false);
            }, 100);
          }
        }
      );
    } else {
      resolve(true); // Stok cukup semua
    }
  });
};

// --- Update fungsi Handle Simpan ---
const handleSaveRequest = async () => {
  if (!formHeader.value.pic) return toast.error("Nama peminjam (PIC) wajib diisi.");

  const validItems = items.value.filter((i) => i.kode && i.jumlah > 0);
  if (validItems.length === 0) return toast.error("Minimal 1 barang harus diinput.");

  // --- 1. Validasi Stok Minus (Sama seperti Invoice) ---
  const stokOk = await checkStokMinus();
  if (!stokOk) return; // Berhenti jika user membatalkan di warning stok minus

  // --- 2. Jika Stok OK atau User Setuju Minus, Lanjut Konfirmasi Simpan ---
  showConfirmation(
    "Konfirmasi Simpan",
    "Apakah Anda yakin data yang diinput sudah benar dan ingin mengirim permintaan otorisasi?",
    () => {
      handleSave(); // Menuju proses otorisasi PIN
    }
  );
};

const handleTutup = () => {
  // Cek jika sudah ada item yang diinput
  const hasData = items.value.some((i) => i.kode) || formHeader.value.pic;

  if (hasData) {
    showConfirmation(
      "Batalkan Input?",
      "Ada data yang belum disimpan. Yakin ingin keluar dari halaman ini?",
      () => router.back()
    );
  } else {
    router.back();
  }
};

const handleSave = () => {
  if (!formHeader.value.pic) return toast.error("Nama peminjam (PIC) wajib diisi.");
  const validItems = items.value.filter((i) => i.kode && i.jumlah > 0);
  if (validItems.length === 0) return toast.error("Minimal 1 barang harus diinput.");

  if (authStore.user?.cabang === "KDC") {
    // Kita kirim penanda bahwa ini adalah ACC otomatis dari sistem/user KDC
    const approverName = `AUTO_KDC_${authStore.user.nama || "SYSTEM"}`;
    executeSave(approverName);
    return;
  }

  // Susun info lengkap untuk Supervisor
  const infoLengkap =
    `Mohon persetujuan peminjaman barang:\n` +
    `PIC: ${formHeader.value.pic}\n` +
    `Keperluan: ${formHeader.value.keterangan}\n` +
    `Total: ${totalJumlah.value} Pcs`;

  requestAuthorization(
    "Otorisasi Peminjaman", // Judul Modal
    "PEMINJAMAN_BARANG", // Jenis Transaksi
    totalJumlah.value, // Nominal diisi dengan Qty barang
    {
      transaksi: formHeader.value.nomor || "DRAFT",
      keteranganLengkap: infoLengkap,
      cabang: "KDC",
    },
    (authResult) => {
      // Jika Approved, jalankan fungsi simpan permanen
      executeSave(authResult.approver);
    },
    () => {
      toast.info("Simpan dibatalkan.");
    }
  );
};

const executeSave = async (approverName: string = "") => {
  try {
    const payload = {
      header: formHeader.value,
      items: items.value.filter((item) => item.kode && item.jumlah > 0),
      approver: approverName,
      user: authStore.user,
    };

    const response = isEditMode.value
      ? await api.put(`/peminjaman-barang-form/${route.params.id}`, payload)
      : await api.post("/peminjaman-barang-form", payload);

    toast.success(response.data.message);

    // Tampilkan Dialog Cetak
    dialogPrint.nomor = response.data.nomor;
    dialogPrint.show = true;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menyimpan data.");
  }
};

const handlePrintAction = (confirm: boolean) => {
  dialogPrint.show = false;
  if (confirm) {
    // Buka tab baru untuk cetak
    const routeData = router.resolve({
      name: "PeminjamanBarangPrint",
      params: { nomor: dialogPrint.nomor },
    });
    window.open(routeData.href, "_blank");
  }
  // Kembali ke halaman browse setelah aksi cetak (Ya/Tidak)
  router.push({ name: "PeminjamanBarang" });
};

/**
 * Menentukan class CSS berdasarkan validasi stok
 */
const getQtyClass = (item: DetailItem): string => {
  const stokTersedia = Number(item.stok || 0);
  const qtyInput = Number(item.jumlah || 0);

  if (qtyInput > stokTersedia) {
    return "text-red font-weight-bold"; // Warna merah jika meminjam melebihi stok fisik
  }
  return "";
};

onMounted(() => {
  addNewRow();
  loading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" prepend-icon="mdi-content-save" color="primary" @click="handleSaveRequest">
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close" variant="tonal" @click="handleTutup">
        Tutup
      </v-btn>
    </template>

    <div v-if="loading" class="state-container"><v-progress-circular indeterminate /></div>
    <div v-else class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-text-field label="Nomor Dokumen" v-model="formHeader.nomor" readonly variant="filled" density="compact"
            hide-details />
          <v-text-field label="Referensi Penawaran" v-model="formHeader.penawaran" readonly variant="outlined"
            density="compact" hide-details append-inner-icon="mdi-magnify" clearable
            placeholder="Klik untuk cari penawaran..." @click="openPenawaranSearch"
            @click:clear="formHeader.penawaran = ''" />
          <v-text-field label="Tanggal Pinjam" v-model="formHeader.tanggal" type="date" density="compact"
            variant="outlined" hide-details />
          <v-text-field label="Deadline (14 Hari)" v-model="formHeader.deadline" readonly variant="filled"
            density="compact" hide-details bg-color="amber-lighten-5" />
          <v-text-field label="PIC Peminjam" v-model="formHeader.pic" variant="outlined" density="compact" hide-details
            placeholder="Nama peminjam..." />
          <v-textarea label="Keterangan / Peruntukan" v-model="formHeader.keterangan" variant="outlined"
            density="compact" hide-details rows="4" placeholder="Alasan peminjaman..." />
          <v-text-field label="Store / Cabang" :model-value="formHeader.cabang" readonly variant="filled"
            density="compact" hide-details />
        </div>
      </div>

      <div class="right-column">
        <div class="scanner-wrapper">
          <v-text-field ref="barcodeInputRef" v-model="scannedBarcode" label="Scan Barcode di Sini..."
            placeholder="Siap scan..." variant="outlined" density="compact" prepend-inner-icon="mdi-barcode-scan"
            hide-details clearable :loading="isScanning" :disabled="isScanning"
            @keydown.enter.prevent="handleBarcodeScan" autofocus />
        </div>

        <div class="table-container">
          <v-data-table :headers="headers" :items="items" class="desktop-table header-browse-blue" density="compact"
            fixed-header :items-per-page="-1">
            <template v-slot:[`item.no`]="{ index }">{{ index + 1 }}</template>

            <template v-slot:[`item.kode`]="{ item, index }">
              <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                placeholder="F1/F2..." :readonly="!!item.nama" @keydown.f1.prevent="openProductSearch(index)" />
            </template>

            <template #[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" density="compact" hide-details
                variant="underlined" :class="getQtyClass(item)" />
            </template>

            <template #[`item.stok`]="{ item }">
              <div class="text-end">{{ item.stok }}</div>
            </template>

            <template v-slot:[`item.actions`]="{ index }">
              <v-btn icon="mdi-delete" color="error" variant="text" size="x-small" @click="items.splice(index, 1)" />
            </template>

            <template #bottom></template>

            <template #tfoot>
              <tr class="font-weight-bold bg-grey-lighten-4">
                <td colspan="5" class="text-right">TOTAL QUANTITY:</td>
                <td class="text-right text-primary text-h6">{{ totalJumlah }}</td>
                <td></td>
              </tr>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <ProductSearchModal v-if="isLookupVisible" :gudang="formHeader.cabang" category="ALL" source="peminjaman"
      @close="isLookupVisible = false" @products-selected="onProductsSelected" />

    <PenawaranSearchModal v-if="isPenawaranLookupVisible" :cabang="formHeader.cabang"
      @close="isPenawaranLookupVisible = false" @selected="onPenawaranSelected" />

    <AuthorizationModal v-if="authDialog.show" :title="authDialog.title" :jenis="authDialog.jenis"
      :nominal="authDialog.nominal" :transaksi="authDialog.transaksi" :barcode="authDialog.barcode"
      :keterangan="authDialog.keterangan" :cabang="authDialog.cabang" @success="authDialog.onSuccess" @close="
        () => {
          authDialog.show = false;
          authDialog.onCancel();
        }
      " />

    <v-dialog v-model="dialogConfirm.show" max-width="450px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold py-3 bg-grey-lighten-4">
          <v-icon start color="primary">mdi-help-circle</v-icon>
          {{ dialogConfirm.title }}
        </v-card-title>
        <v-card-text class="pa-5 text-body-1">
          {{ dialogConfirm.text }}
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions class="pa-3">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="flat" @click="
            dialogConfirm.onConfirm();
          dialogConfirm.show = false;
          " class="px-6">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogPrint.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 bg-blue text-white">Simpan Berhasil</v-card-title>
        <v-card-text class="pa-5">
          Data peminjaman <strong>{{ dialogPrint.nomor }}</strong> telah disimpan.<br /><br />
          Apakah Anda ingin mencetak Form Peminjaman sekarang?
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions class="pa-3">
          <v-btn variant="text" @click="handlePrintAction(false)">Tutup</v-btn>
          <v-spacer></v-spacer>
          <v-btn color="primary" prepend-icon="mdi-printer" variant="flat" @click="handlePrintAction(true)">
            Ya, Cetak
          </v-btn>
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

/* Custom 11px font size untuk form dan tabel */
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
  background-color: #e3f2fd;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #bbdefb;
}

.table-container {
  flex-grow: 1;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  overflow: hidden;
}

/* Header Tabel Biru Tua identik dengan Ambil Barang */
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
</style>

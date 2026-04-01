<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import api from "@/services/api";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import InvoiceSearchModal from "@/components/lookup/InvoiceSearchModal.vue";
import MintaBarangSearchModal from "@/components/lookup/MintaBarangSearchModal.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";
import PrintOptionModal from "@/components/modal/PrintOptionModal.vue";
import type { AxiosError } from "axios";
import { formatRupiah } from "@/utils/formatRupiah";

// --- Tipe Data ---
interface Header {
  nomor: string;
  tanggal: string;
  cabangKode: string;
  cabangNama: string;
  invoice: string;
  customer: Customer | null;
  jenis: "Y" | "N" | "O"; // Y: Pengembalian, N: Tukar Barang, O: Retur Online
  keterangan: string;
  ppnPersen: number;
}
interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
}
interface Footer {
  subTotal: number;
  diskonPersen1: number;
  diskonPersen2: number;
  diskonRp: number;
  ppnRp: number;
  grandTotal: number;
}
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  qtyInv: number;
  jumlah: number; // Qty Retur
  harga: number;
  disc: number; // Diskon % per item
  diskon: number; // Diskon Rp per item
  total: number;
  barcode: string;
  sudah: number; // Qty sudah pernah diretur
}

interface InvoiceItem {
  kode: string;
  nama: string;
  harga: number;
  ukuran?: string;
}

interface ReturItem extends InvoiceItem {
  id: number;
  jumlah: number;
  total: number;
}

interface Product {
  kode: string;
  nama: string;
  ukuran: string;
  barcode: string;
  harga: number;
}

interface ApiReturItem {
  kode: string;
  nama: string;
  ukuran: string;
  barcode: string;
  qtyInv?: number | string;
  jumlah?: number | string;
  harga?: number | string;
  disc?: number | string;
  diskon?: number | string;
  total?: number | string;
  sudah?: number | string;
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "29";
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => (isEditMode.value ? "Ubah Retur Jual" : "Buat Retur Jual"));

// [PERBAIKAN] Definisi Initial State
const initialHeaderState: Header = {
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  cabangKode: authStore.user?.cabang || "",
  cabangNama: authStore.user?.cabangNama || "",
  invoice: "",
  customer: null,

  // [UBAH DI SINI] Default jadi 'N' (Tukar Barang) agar aman buat SC
  jenis: "N",

  keterangan: "",
  ppnPersen: 0,
};

const initialFooterState: Footer = {
  subTotal: 0,
  diskonPersen1: 0,
  diskonPersen2: 0,
  diskonRp: 0,
  ppnRp: 0,
  grandTotal: 0,
};

// Gunakan spread operator untuk inisialisasi reaktif
const header = reactive<Header>({ ...initialHeaderState });
const footer = reactive<Footer>({ ...initialFooterState });

const items = ref<Item[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const dialog = reactive({ invoiceSearch: false });
const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => { } });
const scannedBarcode = ref("");
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
const activeRowIndex = ref(0);
const isGudangSearchVisible = ref(false);
const isPrintOptionVisible = ref(false);
const savedDocumentNumber = ref<string | null>(null);

const tableHeaders = [
  { title: "Kode", key: "kode", width: "100px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "60px" },
  { title: "Qty Inv", key: "qtyInv", align: "end", width: "60px" },
  { title: "Qty Retur", key: "jumlah", align: "end", width: "60px" },
  { title: "Harga", key: "harga", align: "end", width: "70px" },
  { title: "Diskon %", key: "disc", align: "end", width: "60px" },
  { title: "Diskon Rp", key: "diskon", align: "end", width: "70px" },
  { title: "Total", key: "total", align: "end", width: "70px" },
  { title: "Barcode", key: "barcode", width: "90px" },
  { title: "Sudah Retur", key: "sudah", align: "end", width: "60px" },
] as const;

// --- Methods ---
const onInvoiceSelected = async (invoice: { nomor: string; tanggal: string }) => {
  const hariSejakInvoice = differenceInCalendarDays(new Date(), parseISO(invoice.tanggal));
  const isKON = authStore.user?.cabang === "KON";
  const isKPR = authStore.user?.cabang === "KPR";

  // Flag pembukaan akses sementara untuk K10
  const isTemporaryOpen = authStore.user?.cabang === "K01" && new Date() < new Date("2026-03-31");

  // Jika bukan KON, bukan K10 (temporary), dan invoice > 1 hari, maka blokir
  if (!isKON && !isKPR && !isTemporaryOpen && hariSejakInvoice > 1) {
    toast.error(`Invoice ${invoice.nomor} sudah lebih dari 1 hari dan tidak bisa diretur.`);
    dialog.invoiceSearch = false;
    return;
  }

  isLoading.value = true;
  dialog.invoiceSearch = false;
  try {
    const response = await api.get(`/retur-jual-form/load-from-invoice/${invoice.nomor}`);
    const { header: invHeader, items: invItems } = response.data;

    header.invoice = invHeader.invoice;
    header.customer = invHeader.customer;
    header.ppnPersen = invHeader.ppnPersen;
    footer.diskonRp = invHeader.diskonRp;
    footer.diskonPersen1 = invHeader.diskonPersen1;
    footer.diskonPersen2 = invHeader.diskonPersen2;

    items.value = invItems.map(
      (item: InvoiceItem): ReturItem => ({
        ...item,
        id: Date.now() + Math.random(),
        jumlah: 0,
        total: 0,
      })
    );

    calculateTotals();

    await nextTick();
    markAsSaved();
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data invoice.");
  } finally {
    isLoading.value = false;
  }
};

const calculateTotals = () => {
  // 1. Hitung Subtotal dari semua item
  let subTotal = 0;
  items.value.forEach((item) => {
    // Pastikan jumlah, harga, dan diskon adalah angka
    const jumlah = Number(item.jumlah) || 0;
    const harga = Number(item.harga) || 0;
    const diskon = Number(item.diskon) || 0;

    item.total = jumlah * (harga - diskon);
    subTotal += item.total;
  });
  footer.subTotal = subTotal;

  // 2. Hitung Diskon Faktur (meniru logika Delphi)
  let diskonFakturRp = 0;
  const diskonPersen1 = footer.diskonPersen1 || 0;
  const diskonPersen2 = footer.diskonPersen2 || 0;

  if (diskonPersen1 > 0) {
    // Jika Diskon % 1 diisi, hitung nilainya dan timpa Diskon Rp
    const diskon1 = Math.round((diskonPersen1 / 100) * subTotal);
    const subTotalAfterDisc1 = subTotal - diskon1;
    const diskon2 = Math.round((diskonPersen2 / 100) * subTotalAfterDisc1);
    diskonFakturRp = diskon1 + diskon2;
    footer.diskonRp = diskonFakturRp; // Nilai Diskon Rp diperbarui
  } else {
    // Jika Diskon % kosong, gunakan nilai Diskon Rp yang diinput manual
    diskonFakturRp = footer.diskonRp || 0;
  }

  // 3. Hitung Netto dan PPN
  const netto = subTotal - diskonFakturRp;
  footer.ppnRp = Math.round((header.ppnPersen / 100) * netto);

  // 4. Hitung Grand Total
  footer.grandTotal = Math.round(netto + footer.ppnRp);
};

const save = () => {
  if (!header.keterangan || header.keterangan.trim() === "") {
    return toast.error("Keterangan wajib diisi.");
  }
  // --- VALIDASI DARI DELPHI ---
  if (!isEditMode.value && new Date(header.tanggal) < new Date(format(new Date(), "yyyy-MM-dd"))) {
    return toast.error("Tanggal tidak boleh mundur dari hari ini.");
  }
  if (!header.customer) {
    return toast.error("Customer harus diisi.");
  }
  const validItems = items.value.filter((i) => i.kode && (i.jumlah || 0) > 0);
  if (validItems.length === 0) {
    return toast.error("Detail barang retur harus diisi minimal 1 baris.");
  }
  // --- AKHIR VALIDASI ---

  showConfirmation(
    "Konfirmasi Simpan",
    "Anda yakin ingin menyimpan data Retur Jual ini?",
    executeSave
  );
};

const executeSave = async () => {
  isSaving.value = true;
  const payload = {
    header,
    footer,
    items: items.value.filter((i) => i.kode && (i.jumlah || 0) > 0),
    isNew: !isEditMode.value,
  };
  try {
    const response = await api.post("/retur-jual-form/save", payload);
    toast.success(response.data.message);

    markAsSaved();

    // Simpan nomor dokumen yang baru saja disimpan
    savedDocumentNumber.value = response.data.nomor;
    // Buka modal pilihan cetak, BUKAN langsung halaman cetak
    isPrintOptionVisible.value = true;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};
const closeForm = () => router.push({ name: "ReturJual" });
const resetForm = () => {
  // Reset Header
  Object.assign(header, initialHeaderState);
  // Reset Footer
  Object.assign(footer, initialFooterState);

  items.value = [];
  addNewRow();

  // Reset status unsaved
  markAsSaved();
  toast.info("Form telah dibersihkan.");
};
const handleCancel = () => {
  showConfirmation(
    "Konfirmasi Batal",
    "Batalkan dan kosongkan semua isian?",
    resetForm // Panggil fungsi resetForm saat dikonfirmasi
  );
};
const handleClose = () =>
  showConfirmation(
    "Konfirmasi Tutup",
    "Tutup form? Perubahan yang belum disimpan akan hilang.",
    closeForm
  );

const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(),
      kode: "",
      nama: "",
      ukuran: "",
      qtyInv: 0,
      jumlah: 0,
      harga: 0,
      disc: 0,
      diskon: 0,
      total: 0,
      barcode: "",
      sudah: 0,
    });
  }
};

const handleBarcodeScan = async () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  // Cek jika item sudah ada di grid
  const existingItem = items.value.find((item) => item.barcode === barcode && item.kode);
  if (existingItem) {
    const newQty = (existingItem.jumlah || 0) + 1;
    // Validasi jumlah retur tidak melebihi qty invoice
    if (header.invoice && newQty > existingItem.qtyInv - existingItem.sudah) {
      toast.error("Jumlah retur melebihi jumlah yang dapat diretur dari invoice.");
    } else {
      existingItem.jumlah = newQty;
      toast.info(`Jumlah retur untuk ${existingItem.nama} ditambah.`);
    }
    scannedBarcode.value = "";
    return;
  }

  // Jika item belum ada, cari via API
  try {
    const response = await api.get(`/retur-jual-form/lookup/by-barcode/${barcode}`);
    const product = response.data;
    const emptyRowIndex = items.value.findIndex((item) => !item.kode);

    if (emptyRowIndex !== -1) {
      items.value.splice(emptyRowIndex, 1, {
        id: Date.now(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        barcode: product.barcode,
        harga: header.invoice ? 0 : product.harga, // Harga 0 jika dari invoice, sesuai Delphi
        jumlah: 1,
        qtyInv: 0, // Tidak ada referensi invoice
        sudah: 0,
        disc: 0,
        diskon: 0,
        total: 0,
      });
      addNewRow();
    } else {
      toast.error("Tidak ada baris kosong untuk menambahkan item.");
    }
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || `Barcode ${barcode} tidak valid.`);
  } finally {
    scannedBarcode.value = "";
  }
};

const openProductSearch = (index: number, isMulti: boolean) => {
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  isProductSearchVisible.value = true;
};

const onProductsSelected = (selectedProducts: Product[]) => {
  isProductSearchVisible.value = false;

  const productsToAdd = selectedProducts.filter(
    (p) => !items.value.some((item) => item.kode === p.kode && item.ukuran === p.ukuran)
  );

  const newItems = productsToAdd.map((product) => ({
    id: Date.now() + Math.random(),
    kode: product.kode,
    nama: product.nama,
    ukuran: product.ukuran,
    barcode: product.barcode,
    harga: header.invoice ? 0 : product.harga,
    jumlah: 1,
    qtyInv: 0,
    sudah: 0,
    disc: 0,
    diskon: 0,
    total: 0,
  }));

  if (newItems.length > 0) {
    items.value.splice(activeRowIndex.value, 1, ...newItems);
    addNewRow();
  }
};

const openGudangSearch = () => {
  // Hanya user KDC yang bisa mengubah cabang
  if (authStore.user?.cabang === "KDC") {
    isGudangSearchVisible.value = true;
  }
};

const onGudangSelected = (gudang: { kode: string; nama: string }) => {
  header.cabangKode = gudang.kode;
  header.cabangNama = gudang.nama;
  isGudangSearchVisible.value = false;
};

const handlePrintSelection = (type: "a4" | "kasir") => {
  isPrintOptionVisible.value = false;
  if (!savedDocumentNumber.value) return;

  const routeName = type === "a4" ? "ReturJualPrint" : "ReturJualPrintKasir";
  const url = router.resolve({
    name: routeName,
    params: { nomor: savedDocumentNumber.value },
  }).href;
  window.open(url, "_blank");

  // Setelah tab cetak terbuka, arahkan halaman utama kembali ke browse
  router.push({ name: "ReturJual" });
};

const onPrintModalClose = () => {
  isPrintOptionVisible.value = false;
  // Jika user menutup modal tanpa memilih, tetap arahkan ke halaman browse
  router.push({ name: "ReturJual" });
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/retur-jual-form/${nomor}`);
    const { header: returHeader, items: returItems } = response.data;

    // Isi Header
    Object.assign(header, returHeader);
    // Format tanggal agar input type="date" bisa membacanya (YYYY-MM-DD)
    header.tanggal = format(parseISO(returHeader.tanggal), "yyyy-MM-dd");

    // Isi Footer
    footer.diskonRp = Number(returHeader.diskonRp) || 0;
    footer.diskonPersen1 = Number(returHeader.diskonPersen1) || 0;
    footer.diskonPersen2 = Number(returHeader.diskonPersen2) || 0;

    // Isi Items
    items.value = returItems.map((item: ApiReturItem) => ({
      ...item,
      id: Date.now() + Math.random(), // ID unik untuk key v-for

      // Lakukan konversi Number() untuk semua field numerik
      // agar aman dari format string backend ("10.00")
      jumlah: Number(item.jumlah || 0),
      harga: Number(item.harga || 0),
      qtyInv: Number(item.qtyInv || 0),
      sudah: Number(item.sudah || 0),

      // Tambahkan field lain yang diperlukan interface Item
      disc: Number(item.disc || 0),
      diskon: Number(item.diskon || 0),
      total: Number(item.total || 0),
    }));

    calculateTotals(); // Hitung ulang total di foote
    toast.success(`Data Retur ${nomor} berhasil dimuat.`);

    await nextTick();
    markAsSaved();
  } catch (error) {
    toast.error(error.response?.data?.message || "Gagal memuat data Retur Jual.");
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const removeRow = (id: number) => {
  const index = items.value.findIndex((i) => i.id === id);
  if (index !== -1) items.value.splice(index, 1);
};

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [header, items, footer],
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isLoading.value || isSaving.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Invoice dipilih atau Keterangan diisi
    const hasHeader = header.invoice !== "" || header.keterangan.trim() !== "";

    // 2. Items: Ada item yang jumlah returnya > 0 (user mulai input retur)
    //    ATAU ada item baru ditambahkan manual (kode terisi)
    const hasItems = items.value.some(
      (i) => (i.jumlah || 0) > 0 || (i.kode !== "" && i.qtyInv === 0)
    );

    if (hasHeader || hasItems) {
      uiStore.setUnsavedChanges(true);
    } else {
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

onMounted(() => {
  markAsSaved();

  if (!authStore.can(MENU_ID, isEditMode.value ? "edit" : "insert")) {
    toast.error(
      `Anda tidak memiliki izin untuk ${isEditMode.value ? "mengubah" : "membuat"} data ini.`
    );
    router.back();
    return;
  }

  const nomor = route.params.nomor as string;
  if (isEditMode.value && nomor) {
    // Panggil fungsi ini jika mode "Ubah"
    loadDataForEdit(nomor);
  } else {
    // Mode "Baru"
    isLoading.value = false;
  }
});
watch(items, calculateTotals, { deep: true });
watch(
  [
    () => footer.diskonRp,
    () => footer.diskonPersen1,
    () => footer.diskonPersen2,
    () => header.ppnPersen,
  ],
  calculateTotals
);
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-keyboard-return">
    <template #header-actions>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save" @click="save"
        :loading="isSaving">Simpan</v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh" @click="handleCancel">Batal</v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="handleClose">Tutup</v-btn>
    </template>
    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6">
              <v-text-field label="Cabang" v-model="header.cabangKode" readonly
                :filled="authStore.user?.cabang !== 'KDC'"
                :variant="authStore.user?.cabang === 'KDC' ? 'outlined' : 'filled'" @click="openGudangSearch"
                density="compact" hide-details>
                <template #append-inner>
                  <v-icon v-if="authStore.user?.cabang === 'KDC'" @click="openGudangSearch">
                    mdi-magnify
                  </v-icon>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="6"><v-text-field v-model="header.cabangNama" readonly filled hide-details
                density="compact" /></v-col>
            <v-col cols="6"><v-text-field label="No. Retur" v-model="header.nomor" readonly filled hide-details
                density="compact" /></v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                hide-details density="compact" /></v-col>
            <v-col cols="12">
              <v-radio-group v-model="header.jenis" inline label="Jenis Retur" hide-details
                :key="authStore.user?.cabang">
                <v-radio label="Pengembalian" value="Y"></v-radio>
                <v-radio label="Tukar Barang" value="N"></v-radio>
                <v-radio v-if="authStore.user?.cabang === 'KON'" label="Retur Online (Ke DC)" value="O"></v-radio>
              </v-radio-group>
            </v-col>
            <v-col cols="12">
              <v-text-field label="No. Invoice" v-model="header.invoice" @click="dialog.invoiceSearch = true"
                prepend-inner-icon="mdi-magnify" readonly variant="outlined" hide-details density="compact" />
            </v-col>

            <v-col cols="12"><v-text-field label="Customer" :model-value="header.customer ? `${header.customer.kode} - ${header.customer.nama}` : ''
              " readonly filled hide-details density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Alamat" :model-value="header.customer?.alamat" readonly filled
                hide-details density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Kota / Telp" :model-value="header.customer ? `${header.customer.kota} / ${header.customer.telp}` : ''
              " readonly filled hide-details density="compact" /></v-col>

            <v-col cols="12">
              <v-textarea label="Keterangan *" v-model="header.keterangan" rows="3" variant="outlined"
                :class="{ 'bg-orange-lighten-5': header.jenis === 'O' }" hide-details="auto" density="compact"
                :rules="[(v) => !!v || 'Keterangan wajib diisi']" />
            </v-col>
          </v-row>
        </div>
      </div>
      <div class="right-column">
        <div class="scanner-wrapper mb-4">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..." variant="outlined" density="compact"
            prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan" />
        </div>
        <v-data-table :headers="tableHeaders" :items="items" class="desktop-table fill-height-table" hide-details
          density="compact" fixed-header :items-per-page="-1">
          <template #[`item.kode`]="{ item, index }">
            <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details placeholder="F1/F2..."
              @keydown.f1.prevent="openProductSearch(index, false)" @keydown.f2.prevent="openProductSearch(index, true)"
              :readonly="!!header.invoice" />
          </template>

          <template #[`item.jumlah`]="{ item }">
            <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" class="text-end"
              density="compact" hide-details
              :rules="[(v) => v <= item.qtyInv - item.sudah || `Maks: ${item.qtyInv - item.sudah}`]" min="0" />
          </template>

          <template #[`item.harga`]="{ item }">
            <v-text-field v-model.number="item.harga" type="number" variant="underlined" class="text-end"
              density="compact" hide-details readonly />
          </template>

          <template #[`item.disc`]="{ item }">
            <v-text-field v-model.number="item.disc" type="number" variant="underlined" class="text-end"
              density="compact" hide-details readonly />
          </template>

          <template #[`item.diskon`]="{ item }">
            <v-text-field v-model.number="item.diskon" type="number" variant="underlined" class="text-end"
              density="compact" hide-details readonly />
          </template>

          <template #[`item.actions`]="{ item }">
            <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
              @click="removeRow(item.id)" />
          </template>

          <template #bottom>
            <div class="pa-2 text-right">
              <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus">Tambah Baris</v-btn>
            </div>
          </template>
        </v-data-table>
        <div class="footer-section pa-4">
          <v-row dense>
            <v-col cols="4"><v-text-field label="Total" :model-value="formatRupiah(footer.subTotal)" readonly filled
                class="text-end" hide-details density="compact" /></v-col>
            <v-col cols="4"><v-text-field label="Diskon Rp" v-model.number="footer.diskonRp" type="number"
                variant="outlined" class="text-end" hide-details density="compact" /></v-col>
            <v-col cols="4"><v-text-field label="PPN" :model-value="formatRupiah(footer.ppnRp)" readonly filled
                class="text-end" hide-details density="compact" /></v-col>
            <v-col cols="4"></v-col>
            <v-col cols="4"><v-text-field label="Diskon % 1" v-model.number="footer.diskonPersen1" type="number"
                variant="outlined" class="text-end" hide-details density="compact" /></v-col>
            <v-col cols="4"><v-text-field label="Grand Total" :model-value="formatRupiah(footer.grandTotal)" readonly
                filled class="text-end font-weight-bold" hide-details density="compact" /></v-col>
            <v-col cols="4"></v-col>
            <v-col cols="4"><v-text-field label="Diskon % 2" v-model.number="footer.diskonPersen2" type="number"
                variant="outlined" class="text-end" hide-details density="compact" /></v-col>
          </v-row>
        </div>
      </div>
    </div>

    <InvoiceSearchModal v-if="dialog.invoiceSearch" source="retur-jual" @close="dialog.invoiceSearch = false"
      @invoice-selected="onInvoiceSelected" />
    <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''"
      @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" />
    <MintaBarangSearchModal v-if="isProductSearchVisible" :gudang="header.cabangKode" :multi="isMultiSelectProduct"
      source="retur-jual" @close="isProductSearchVisible = false" @products-selected="onProductsSelected" />
    <PrintOptionModal v-if="isPrintOptionVisible" :options="['a4', 'kasir']" @close="onPrintModalClose"
      @select="handlePrintSelection" />

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
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  /* Biru Tua */
  color: #ffffff !important;
  /* Teks Putih */
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important;
  /* Supaya lebih rapi */
}
</style>

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
const KODE_CUSTOMER_BEBAS_QTY_RETUR = "K0100351";

const isQtyLimitBypassed = computed(() => {
  return header.customer?.kode === KODE_CUSTOMER_BEBAS_QTY_RETUR;
});

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
const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => {} });
const scannedBarcode = ref("");
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
const activeRowIndex = ref(0);
const isGudangSearchVisible = ref(false);
const isPrintOptionVisible = ref(false);
const savedDocumentNumber = ref<string | null>(null);

const tableHeaders = [
  { title: "Kode", key: "kode", width: "140px" },
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
  { title: "", key: "actions", sortable: false, align: "center", width: "36px" },
] as const;

// --- Methods ---
const onInvoiceSelected = async (invoice: { nomor: string; tanggal: string }) => {
  const hariSejakInvoice = differenceInCalendarDays(new Date(), parseISO(invoice.tanggal));
  const isKON = authStore.user?.cabang === "KON";
  const isKPR = authStore.user?.cabang === "KPR";

  // Flag pembukaan akses sementara untuk K10
  const isTemporaryOpen = authStore.user?.cabang === "K07" && new Date() < new Date("2026-10-23");

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
  if (jumlahMelebihi.value > 0) {
    return toast.error(
      `Ada ${jumlahMelebihi.value} baris dengan qty retur melebihi sisa yang bisa diretur.`
    );
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
    // [BEBAS] Customer K0100351 dikecualikan dari validasi ini
    if (
      header.invoice &&
      !isQtyLimitBypassed.value &&
      newQty > existingItem.qtyInv - existingItem.sudah
    ) {
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
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;

    toast.error(err.response?.data?.message || "Gagal memuat data Retur Jual.");

    router.back();
  } finally {
    isLoading.value = false;
  }
};

const removeRow = (id: number) => {
  const index = items.value.findIndex((i) => i.id === id);
  if (index !== -1) items.value.splice(index, 1);
};

const sisaRetur = (item: Item): number => (Number(item.qtyInv) || 0) - (Number(item.sudah) || 0);

// Hanya baris asal invoice (qtyInv > 0) yang dibatasi
const isOver = (item: Item): boolean =>
  !!header.invoice &&
  !isQtyLimitBypassed.value &&
  !!item.kode &&
  Number(item.qtyInv) > 0 &&
  (Number(item.jumlah) || 0) > sisaRetur(item);

const jumlahMelebihi = computed(() => items.value.filter(isOver).length);

// Baris manual (tanpa referensi invoice) boleh dihapus; baris invoice cukup di-nol-kan
const canRemove = (item: Item): boolean => !!item.kode && Number(item.qtyInv) === 0;

const jumlahBarisTerisi = computed(() => items.value.filter((i) => i.kode).length);

const handleKodeKeydown = (e: KeyboardEvent, index: number) => {
  if (header.invoice) return;

  switch (e.key) {
    case "F1":
      e.preventDefault();
      openProductSearch(index, false);
      break;

    case "F2":
      e.preventDefault();
      openProductSearch(index, true);
      break;
  }
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
      <v-btn
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-content-save"
        :loading="isSaving"
        @click="save"
        >Simpan</v-btn
      >
      <v-btn
        v-if="!isEditMode"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-refresh"
        @click="handleCancel"
        >Batal</v-btn
      >
      <v-btn
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-close"
        @click="handleClose"
        >Tutup</v-btn
      >
    </template>

    <div class="form-grid-container">
      <!-- ══════════ KIRI: DATA DOKUMEN ══════════ -->
      <aside class="left-column">
        <section class="panel">
          <h3 class="panel-title">Dokumen</h3>

          <div class="kv">
            <span class="kv-label">No. retur</span>
            <span class="kv-value">{{ header.nomor || "-" }}</span>
          </div>

          <v-text-field
            label="Cabang"
            :model-value="`${header.cabangKode} - ${header.cabangNama}`"
            readonly
            density="compact"
            hide-details
            variant="outlined"
            class="form-field mb-3"
            :class="{ 'is-locked': authStore.user?.cabang !== 'KDC' }"
            @click="openGudangSearch"
          >
            <template #append-inner>
              <v-icon v-if="authStore.user?.cabang === 'KDC'" size="small">mdi-magnify</v-icon>
            </template>
          </v-text-field>

          <v-text-field
            label="Tanggal"
            v-model="header.tanggal"
            type="date"
            variant="outlined"
            density="compact"
            hide-details
            class="form-field mb-3"
          />

          <div class="field-caption">Jenis retur</div>
          <v-btn-toggle
            v-model="header.jenis"
            mandatory
            divided
            density="compact"
            variant="outlined"
            class="jenis-toggle"
            :key="authStore.user?.cabang"
          >
            <v-btn value="Y" size="small">Pengembalian</v-btn>
            <v-btn value="N" size="small">Tukar barang</v-btn>
            <v-btn v-if="authStore.user?.cabang === 'KON'" value="O" size="small"
              >Retur online (ke DC)</v-btn
            >
          </v-btn-toggle>
        </section>

        <section class="panel">
          <h3 class="panel-title">Invoice dan customer</h3>

          <v-text-field
            label="No. invoice"
            v-model="header.invoice"
            @click="dialog.invoiceSearch = true"
            prepend-inner-icon="mdi-magnify"
            readonly
            variant="outlined"
            density="compact"
            hide-details
            class="form-field mb-3"
          />

          <div class="customer-card" :class="{ 'is-empty': !header.customer }">
            <template v-if="header.customer">
              <div class="customer-name">
                {{ header.customer.kode }} - {{ header.customer.nama }}
              </div>
              <div class="customer-line">{{ header.customer.alamat || "-" }}</div>
              <div class="customer-line">
                {{ header.customer.kota || "-" }} / {{ header.customer.telp || "-" }}
              </div>
            </template>
            <span v-else class="customer-empty">Pilih invoice untuk mengisi data customer.</span>
          </div>
        </section>

        <section class="panel">
          <h3 class="panel-title">Keterangan</h3>
          <v-textarea
            label="Keterangan *"
            v-model="header.keterangan"
            rows="3"
            auto-grow
            variant="outlined"
            :class="{ 'bg-orange-lighten-5': header.jenis === 'O' }"
            class="form-field"
            hide-details="auto"
            density="compact"
            :rules="[(v) => !!v || 'Keterangan wajib diisi']"
          />
        </section>
      </aside>

      <!-- ══════════ KANAN: BARANG + TOTAL ══════════ -->
      <div class="right-column">
        <v-text-field
          v-model="scannedBarcode"
          placeholder="Scan barcode di sini lalu tekan Enter"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-barcode-scan"
          hide-details
          clearable
          class="scan-field"
          @keydown.enter.prevent="handleBarcodeScan"
        />

        <div class="table-card">
          <v-data-table
            :headers="tableHeaders"
            :items="items"
            class="desktop-table items-table"
            density="compact"
            fixed-header
            :items-per-page="-1"
          >
            <template #[`item.kode`]="{ item, index }">
              <v-text-field
                v-if="!header.invoice"
                v-model="item.kode"
                variant="underlined"
                density="compact"
                hide-details
                placeholder="F1 / F2"
                class="cell-input"
                @keydown="handleKodeKeydown($event, index)"
              />
              <span v-else class="cell-code">{{ item.kode }}</span>
            </template>

            <template #[`item.qtyInv`]="{ item }">
              <span class="num">{{ item.kode ? item.qtyInv : "" }}</span>
            </template>

            <template #[`item.jumlah`]="{ item }">
              <template v-if="item.kode">
                <v-text-field
                  v-model.number="item.jumlah"
                  type="number"
                  min="0"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="cell-input cell-qty"
                  :class="{ 'cell-over': isOver(item) }"
                />
                <div v-if="isOver(item)" class="cell-hint">Maks {{ sisaRetur(item) }}</div>
              </template>
            </template>

            <template #[`item.harga`]="{ item }">
              <span class="num">{{ item.kode ? formatRupiah(item.harga) : "" }}</span>
            </template>

            <template #[`item.disc`]="{ item }">
              <span class="num">{{ item.kode ? item.disc : "" }}</span>
            </template>

            <template #[`item.diskon`]="{ item }">
              <span class="num">{{ item.kode ? formatRupiah(item.diskon) : "" }}</span>
            </template>

            <template #[`item.total`]="{ item }">
              <span class="num font-weight-bold">{{
                item.kode ? formatRupiah(item.total) : ""
              }}</span>
            </template>

            <template #[`item.sudah`]="{ item }">
              <span class="num">{{ item.kode ? item.sudah : "" }}</span>
            </template>

            <template #[`item.actions`]="{ item }">
              <v-btn
                v-if="canRemove(item)"
                icon="mdi-delete-outline"
                size="x-small"
                variant="text"
                color="error"
                @click="removeRow(item.id)"
              />
            </template>

            <template #bottom>
              <div class="table-bottom">
                <span class="table-count">{{ jumlahBarisTerisi }} baris barang</span>
                <v-btn
                  size="small"
                  variant="tonal"
                  class="btn-header-action"
                  prepend-icon="mdi-plus"
                  @click="addNewRow"
                  >Tambah baris</v-btn
                >
              </div>
            </template>
          </v-data-table>
        </div>

        <!-- ══════════ FOOTER TOTAL ══════════ -->
        <div class="footer-section">
          <div class="discount-group">
            <div class="panel-title">Diskon faktur</div>
            <div class="discount-fields">
              <v-text-field
                label="Diskon % 1"
                v-model.number="footer.diskonPersen1"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
                class="form-field"
              />
              <v-text-field
                label="Diskon % 2"
                v-model.number="footer.diskonPersen2"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
                class="form-field"
              />
              <v-text-field
                label="Diskon Rp"
                v-model.number="footer.diskonRp"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
                class="form-field"
                :class="{ 'is-locked': footer.diskonPersen1 > 0 }"
                :readonly="footer.diskonPersen1 > 0"
              />
            </div>
            <div v-if="footer.diskonPersen1 > 0" class="field-note">
              Diskon Rp dihitung otomatis selama Diskon % 1 terisi.
            </div>
          </div>

          <dl class="summary">
            <div class="summary-row">
              <dt>Total</dt>
              <dd>{{ formatRupiah(footer.subTotal) }}</dd>
            </div>
            <div class="summary-row">
              <dt>Diskon faktur</dt>
              <dd>{{ formatRupiah(footer.diskonRp) }}</dd>
            </div>
            <div class="summary-row">
              <dt>PPN {{ header.ppnPersen ? `(${header.ppnPersen}%)` : "" }}</dt>
              <dd>{{ formatRupiah(footer.ppnRp) }}</dd>
            </div>
          </dl>

          <div class="grand-total">
            <span class="grand-label">Grand total</span>
            <strong class="grand-value">{{ formatRupiah(footer.grandTotal) }}</strong>
          </div>
        </div>
      </div>
    </div>

    <InvoiceSearchModal
      v-if="dialog.invoiceSearch"
      source="retur-jual"
      @close="dialog.invoiceSearch = false"
      @invoice-selected="onInvoiceSelected"
    />
    <GudangSearchModal
      v-if="isGudangSearchVisible"
      :user-cabang="authStore.user?.cabang || ''"
      @close="isGudangSearchVisible = false"
      @gudang-selected="onGudangSelected"
    />
    <MintaBarangSearchModal
      v-if="isProductSearchVisible"
      :gudang="header.cabangKode"
      :multi="isMultiSelectProduct"
      source="retur-jual"
      @close="isProductSearchVisible = false"
      @products-selected="onProductsSelected"
    />
    <PrintOptionModal
      v-if="isPrintOptionVisible"
      :options="['a4', 'kasir']"
      @close="onPrintModalClose"
      @select="handlePrintSelection"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn
            variant="tonal"
            class="btn-header-action"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya, lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* ══════════ LAYOUT: tinggi dikunci, tabel yang scroll, footer selalu kelihatan ══════════ */
.form-grid-container {
  /* Tema merah lokal: tombol toggle, fokus input, underline, checkbox ikut merah */
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;

  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 12px;
  height: calc(100vh - 64px - 32px - 28px);
  overflow: hidden;
  font-size: 11px;
}

.left-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

/* ══════════ TOMBOL HEADER ══════════ */
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

/* ══════════ PANEL KIRI ══════════ */
.panel {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
  padding: 12px;
}

.panel-title {
  margin: 0 0 10px;
  padding-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #b71c1c;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
}

.kv {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 12px;
}
.kv-label,
.field-caption {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.kv-value {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.field-caption {
  margin-bottom: 4px;
}
.field-note {
  margin-top: 6px;
  font-size: 11px;
  color: #b26a00;
}

/* Field editable: tinta merah tipis. Field terkunci: abu, tanpa border merah */
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
.form-field :deep(input),
.form-field :deep(textarea) {
  font-size: 11px;
}
.form-field.is-locked :deep(.v-field) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  border-color: rgba(var(--v-theme-on-surface), 0.12) !important;
}

/* Jenis retur: toggle merah */
.jenis-toggle {
  width: 100%;
  height: 30px !important;
}
.jenis-toggle .v-btn {
  flex: 1;
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.jenis-toggle .v-btn--active {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700;
}

/* Customer: blok info, bukan tiga input disabled */
.customer-card {
  padding: 8px 10px;
  border-radius: 8px;
  border-left: 3px solid #b71c1c;
  background-color: rgba(183, 28, 28, 0.04);
}
.customer-card.is-empty {
  border-left-color: rgba(var(--v-theme-on-surface), 0.2);
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}
.customer-name {
  font-size: 12px;
  font-weight: 700;
}
.customer-line {
  margin-top: 2px;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.customer-empty {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

/* ══════════ SCANNER ══════════ */
.scan-field {
  flex: none;
}
.scan-field :deep(.v-field) {
  font-size: 12px;
  border-radius: 10px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.3) !important;
  box-shadow: none !important;
}
.scan-field :deep(.v-field__outline) {
  display: none !important;
}
.scan-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.scan-field :deep(.v-field__prepend-inner .v-icon) {
  color: #b71c1c;
  opacity: 1;
}

/* ══════════ TABEL BARANG ══════════ */
.table-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
}

.items-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.items-table :deep(.v-table__wrapper) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.items-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 36px !important;
  border-bottom: 2px solid #8e0000 !important;
  box-shadow: none !important;
}

.items-table :deep(tbody tr td) {
  font-size: 11px !important;
}
.items-table :deep(tbody tr:nth-child(even) > td) {
  background-color: rgba(183, 28, 28, 0.025);
}
.items-table :deep(tbody tr:hover > td) {
  background-color: rgba(183, 28, 28, 0.07);
}

.num {
  font-variant-numeric: tabular-nums;
}
.cell-code {
  font-weight: 600;
}

.cell-input :deep(.v-field__input) {
  min-height: 26px;
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 11px;
}
.cell-qty :deep(input) {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
/* Melebihi sisa retur: amber, bukan merah, supaya tidak tertukar dengan warna tema */
.cell-over :deep(input) {
  color: #b26a00;
}
.cell-over :deep(.v-field__outline) {
  color: #b26a00 !important;
}
.cell-hint {
  font-size: 10px;
  text-align: right;
  color: #b26a00;
}

.table-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 2px solid rgba(183, 28, 28, 0.15);
  background-color: rgba(183, 28, 28, 0.03);
}
.table-count {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.65);
}

/* ══════════ FOOTER TOTAL ══════════ */
.footer-section {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  padding: 12px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
}

.discount-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.discount-fields :deep(input) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.summary {
  margin: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.summary-row dt {
  color: rgba(var(--v-theme-on-surface), 0.65);
}
.summary-row dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Satu elemen penanda: bar grand total */
.grand-total {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 10px;
  background-color: #b71c1c;
  color: #ffffff;
}
.grand-label {
  font-size: 11px;
  opacity: 0.85;
}
.grand-value {
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>

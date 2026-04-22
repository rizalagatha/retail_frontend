<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from "vue";
import { useRouter } from "vue-router";
import { useRoute } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import axios from "axios";
import JsBarcode from "jsbarcode";
import ProductSearchModal from "@/components/lookup/ProductSearchModal.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";

const fr = (v: number) => formatRupiah(v);

// Daftarkan JsBarcode ke window agar bisa diakses di iframe
(window as Window & { JsBarcode: typeof JsBarcode }).JsBarcode = JsBarcode;

// --- Store & Composables ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "11";

// --- Interface ---
interface BarcodeItem {
  id: number;
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  harga: number | null;
  jumlah: number | null;
}
interface ProductDetail {
  kode: string;
  nama: string;
  barcode: string;
  ukuran: string;
  harga: number;
}
interface PrintLabelItem {
  nomor: string;
  tgl: string;
  kode: string;
  ukuran: string;
  barcode: string;
  nama: string;
  harga: string;
  charga: string;
  nourut: number;
  layoutType: "XP-360B" | "360B";
}
interface BarcodeApiData {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  harga: number;
  jumlah: number;
}

// --- State Header & Form ---
const nomor = ref("");
const tanggal = ref(format(new Date(), "yyyy-MM-dd"));
const items = ref<BarcodeItem[]>([]);
const isSaving = ref(false);
const barcodeScanTerm = ref("");
const productCategory = ref("Kaosan");

// --- State Lookup/Modal ---
const isProductSearchModalVisible = ref(false);
const activeRowIndex = ref(-1);

// --- State Cetak & Pratinjau ---
const selectedPrinter = ref<"XP-360B" | "360B">("XP-360B");
const showPriceOnLabel = ref(false);
const isPrinting = ref(false);
const isPrintPreviewVisible = ref(false);
const printPreviewData = ref<PrintLabelItem[]>([]);
const isAfterSave = ref(false);

const isEditMode = computed(() => !!route.params.nomor);

// --- Konfigurasi Tabel ---
const tableHeaders = [
  { title: "#", key: "no", sortable: false, width: "40px" },
  { title: "Kode", key: "kode", sortable: false, width: "150px" },
  { title: "Barcode", key: "barcode", sortable: false, width: "150px" },
  { title: "Nama Barang", key: "nama", sortable: false, minWidth: "250px" },
  { title: "Size", key: "ukuran", sortable: false, width: "80px" },
  { title: "Harga", key: "harga", sortable: false, align: "end", width: "100px" },
  { title: "Jumlah", key: "jumlah", sortable: false, width: "120px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
] as const;

// --- FUNGSI CETAK ---
const printStylesXP360B = `
  @page {
    size: 68mm 15mm landscape;
    margin: 0 !important;
  }
  html, body {
    margin: 0; padding: 0;
    width: 68mm;
    height: auto !important; /* AWAS: Jangan di-fix 15mm agar label berikutnya muncul */
    overflow: visible !important;
    background-color: #fff;
    -webkit-print-color-adjust: exact;
  }
  .label-pair-container {
    display: flex;
    width: 68mm;
    height: 15mm; /* Tinggi per satu baris sticker (2 kolom) */
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5mm;
    box-sizing: border-box;
    page-break-after: always !important; /* Memaksa ganti baris sticker */
  }
  .barcode-label {
    width: 32mm;
    height: 14mm;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start; /* Ratakan konten ke kiri */
    text-align: left;        /* Ratakan teks ke kiri */
    overflow: hidden;
    padding: 0.5mm 0 0 0.5mm;  /* Padding kiri agar teks tidak nempel pinggir */
    box-sizing: border-box;
  }
  .item-name {
    font-size: 5pt; /* Font kecil agar muat banyak */
    font-weight: bold;
    font-family: 'Arial Narrow', Arial, sans-serif;
    line-height: 1;
    width: 100%;
    margin-bottom: 0.1mm;

    /* LOGIKA MAKSIMAL 2 BARIS */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: normal;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-size {
    font-size: 4.5pt;
    font-family: Arial;
    margin-bottom: 0.1mm;
  }
  .barcode-svg {
    width: 27mm !important;
    height: 5.5mm !important; /* Tinggi barcode dijaga agar teks bawah muat */
    margin: 0.1mm 0;
    margin-left: -0.8mm; /* Geser sedikit agar batang barcode mepet kiri */
  }
  .label-footer {
    display: flex;
    justify-content: space-between;
    width: 98%;
    font-size: 4.8pt;
    font-family: Arial, sans-serif;
    font-weight: bold;
  }
`;

// --- FUNGSI BISNIS ---

const getNextNumber = async () => {
  try {
    const cabang = authStore.user?.cabang || "";
    const response = await api.get("/barcode-form/next-number", {
      params: { cabang, tanggal: tanggal.value },
    });
    nomor.value = response.data.nextNumber;
  } catch {
    toast.error("Gagal mendapatkan nomor baru.");
  }
};

const openProductSearchModal = (rowIndex: number) => {
  activeRowIndex.value = rowIndex;
  isProductSearchModalVisible.value = true;
};

const handleProductsSelected = (products: ProductDetail[]) => {
  isProductSearchModalVisible.value = false;
  if (!products || products.length === 0) return;

  const newItems: BarcodeItem[] = products.map((p) => ({
    id: Date.now() + Math.random(),
    kode: p.kode,
    nama: p.nama,
    barcode: p.barcode,
    ukuran: p.ukuran,
    harga: p.harga,
    jumlah: 0,
  }));

  if (items.value[activeRowIndex.value] && !items.value[activeRowIndex.value].kode) {
    items.value.splice(activeRowIndex.value, 1, ...newItems);
  } else {
    items.value.splice(activeRowIndex.value + 1, 0, ...newItems);
  }

  addNewRow();
};

const handleBarcodeScan = async () => {
  if (!barcodeScanTerm.value) return;
  try {
    const response = await api.get(`/barcode-form/lookup/by-barcode/${barcodeScanTerm.value}`);
    const product = response.data;
    if (product) {
      const existingItem = items.value.find((i) => i.barcode === product.barcode);
      if (existingItem) {
        existingItem.jumlah = (existingItem.jumlah || 0) + 1;
      } else {
        if (items.value.length > 0 && !items.value[items.value.length - 1].kode) {
          items.value.pop();
        }
        items.value.push({ ...product, id: Date.now(), jumlah: 1, harga: product.harga || 0 });
      }
      addNewRow();
      await nextTick();
      document.getElementById("scan-barcode-field")?.focus();
    } else {
      toast.warning("Barcode tidak ditemukan.");
    }
  } catch {
    toast.error("Gagal mencari barcode.");
  } finally {
    barcodeScanTerm.value = "";
  }
};

const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(),
      kode: "",
      barcode: "",
      nama: "",
      ukuran: "",
      harga: null,
      jumlah: null,
    });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter((item) => item.id !== id);
  if (items.value.length === 0) {
    addNewRow();
  }
};

const resetForm = () => {
  getNextNumber();
  tanggal.value = format(new Date(), "yyyy-MM-dd");
  items.value = [];
  addNewRow();
  productCategory.value = "Kaosan";
  isAfterSave.value = false;
  markAsSaved();
  selectedPrinter.value = "XP-360B";
  showPriceOnLabel.value = false;
};

const save = async () => {
  isSaving.value = true;
  const validItems = items.value.filter((item) => item.kode && (item.jumlah || 0) > 0);

  if (validItems.length === 0) {
    toast.error("Tidak ada item yang valid.");
    isSaving.value = false;
    return;
  }

  try {
    const payload = {
      header: { nomor: nomor.value, tanggal: tanggal.value },
      details: validItems,
      user: { kode: authStore.user?.kode },
      isNew: !isEditMode.value,
    };

    // 1. Simpan ke Database
    await api.post("/barcode-form/save", payload);

    // 2. Tandai sebagai sudah tersimpan agar dialog "Unsaved Changes" tidak muncul
    isAfterSave.value = true;
    markAsSaved();

    toast.success(`Data barcode ${nomor.value} berhasil disimpan.`);

    // 3. Siapkan data untuk pratinjau cetak
    const printOptions = {
      showPrice: showPriceOnLabel.value,
      printerType: selectedPrinter.value,
    };
    const dataToPrint = preparePrintData(validItems, printOptions, nomor.value, tanggal.value);

    // 4. Buka Modal Pratinjau
    handlePrint(dataToPrint);

    // CATATAN: router.push dipindahkan ke fungsi closePreview
  } catch (error) {
    console.error(error);
    toast.error("Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const preparePrintData = (
  itemsToPrint: BarcodeItem[],
  options: { showPrice: boolean; printerType: "XP-360B" | "360B" },
  nomorDokumen: string,
  tanggalDokumen: string
): PrintLabelItem[] => {
  const outputLabels: PrintLabelItem[] = [];
  let labelCounter = 1;

  itemsToPrint.forEach((item) => {
    if (item.barcode && (item.jumlah || 0) > 0) {
      const qty = item.jumlah || 0;
      for (let i = 1; i <= qty; i++) {
        const hargaFormatted =
          options.showPrice && item.harga && item.harga > 0 ? fr(item.harga) : "";

        outputLabels.push({
          nomor: nomorDokumen,
          tgl: tanggalDokumen,
          kode: item.kode,
          ukuran: item.ukuran,
          barcode: item.barcode,
          nama: item.nama,
          harga: item.harga?.toString() ?? "",
          charga: hargaFormatted,
          nourut: labelCounter++,
          layoutType: options.printerType,
        });
      }
    }
  });
  return outputLabels;
};

const handlePrint = (dataForPrint: PrintLabelItem[]) => {
  if (dataForPrint.length === 0) {
    toast.warning("Tidak ada item valid untuk dicetak.");
    return;
  }
  isPrinting.value = true;
  printPreviewData.value = dataForPrint;
  isPrintPreviewVisible.value = true;
  isPrinting.value = false;
};

const testPrinter = () => {
  isAfterSave.value = false;
  const dummyItems: BarcodeItem[] = [
    {
      id: Date.now(),
      kode: "12345678",
      barcode: "12345678",
      nama: "TES PRINTER",
      ukuran: "TES",
      harga: 50000,
      jumlah: 4,
    },
  ];
  const printOptions = {
    showPrice: showPriceOnLabel.value,
    printerType: selectedPrinter.value,
  };
  const dataToPrint = preparePrintData(
    dummyItems,
    printOptions,
    "TES",
    format(new Date(), "dd/MM/yy")
  );
  handlePrint(dataToPrint);
};

const triggerBrowserPrint = () => {
  const printContent = document.getElementById("print-area");
  if (printContent) {
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.width = "68mm";
    printFrame.style.height = "400mm";
    printFrame.style.border = "none";
    printFrame.style.top = "-9999px";
    printFrame.style.left = "-9999px";
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      let stylesToInject = "";
      if (selectedPrinter.value === "XP-360B") {
        stylesToInject += printStylesXP360B;
      } else {
        stylesToInject += printStylesXP360B;
      }
      frameDoc.write(
        `<html><head><title>Cetak Barcode</title><style>${stylesToInject}</style></head><body>`
      );
      frameDoc.write(printContent.innerHTML);
      frameDoc.write("</body></html>");
      frameDoc.close();

      generateBarcodesInIframe(printFrame);

      setTimeout(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(printFrame);
        }, 1500);
      }, 500);

      closePreview();
    } else {
      toast.error("Area cetak tidak ditemukan.");
    }
  }
};

const generateBarcodesInIframe = (iframe: HTMLIFrameElement) => {
  const frameDoc = iframe.contentWindow?.document;
  if (frameDoc && window.JsBarcode) {
    const svgs = frameDoc.querySelectorAll(".barcode-svg");
    svgs.forEach((svgElement) => {
      const barcodeValue = svgElement.getAttribute("data-barcode-value");
      if (barcodeValue) {
        try {
          window.JsBarcode(svgElement as SVGElement, barcodeValue, {
            format: "CODE128",
            lineColor: "#000",
            width: 1, // Garis barcode tipis namun tajam
            height: 20, // Sesuaikan tinggi agar scanner mudah baca
            displayValue: false,
            margin: 0,
          });
        } catch (e) {
          console.error(e);
        }
      }
    });
  }
};

const generateBarcodesInPreview = async () => {
  await nextTick();
  const previewArea = document.getElementById("print-area");
  if (!previewArea || !window.JsBarcode) return;

  const svgs = previewArea.querySelectorAll<SVGElement>(".barcode-svg");
  svgs.forEach((svg) => {
    const value = svg.getAttribute("data-barcode-value");
    if (!value) return;
    try {
      JsBarcode(svg, value, {
        format: "CODE128C",
        lineColor: "#000",
        width: 1.2,
        height: 25,
        displayValue: false,
        margin: 1,
      });
    } catch (err) {
      console.error("JsBarcode preview error:", err);
    }
  });
};

const closePreview = () => {
  isPrintPreviewVisible.value = false;
  if (isAfterSave.value) {
    // Pastikan UI Store juga tahu bahwa data sudah bersih
    uiStore.setUnsavedChanges(false);
    router.push("/daftar/cetak-barcode");
  }
  isAfterSave.value = false;
};

const loadDataForEdit = async (docNomor: string) => {
  try {
    // 1. Tentukan tipe data kembalian pada api.get
    const response = await api.get<BarcodeApiData[]>(`/barcodes/${docNomor}`);

    // 2. Map data menggunakan interface BarcodeApiData untuk mengganti 'any'
    items.value = response.data.map((d: BarcodeApiData) => ({
      ...d,
      id: Date.now() + Math.random(), // Tetap beri ID unik untuk kebutuhan grid frontend
    }));

    addNewRow();

    // 3. Pastikan status "Unsaved Changes" direset setelah loading data selesai
    await nextTick();
    markAsSaved();
  } catch (error: unknown) {
    // 4. Gunakan AxiosError untuk menangani pesan error dari server
    if (axios.isAxiosError(error)) {
      const serverMessage = error.response?.data?.message || "Gagal memuat data edit.";
      toast.error(serverMessage);
    } else {
      toast.error("Terjadi kesalahan sistem saat memuat data.");
    }

    router.push("/daftar/cetak-barcode");
  }
};

watch(printPreviewData, (newVal) => {
  if (isPrintPreviewVisible.value && newVal.length > 0) {
    setTimeout(() => generateBarcodesInPreview(), 100);
  }
});

watch(
  items,
  (newItems) => {
    if (isSaving.value) return;
    const hasData = newItems.some((item) => item.kode !== "" || (item.jumlah || 0) > 0);
    if (hasData && !isAfterSave.value) {
      uiStore.setUnsavedChanges(true);
    } else if (!hasData) {
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

onMounted(() => {
  markAsSaved();
  if (!authStore.can(MENU_ID, "insert")) {
    toast.error("Anda tidak memiliki izin.");
    router.back();
    return;
  }

  // LOGIKA: Jika Edit Mode, ambil data dari API. Jika Baru, ambil nomor otomatis
  if (isEditMode.value) {
    nomor.value = route.params.nomor as string;
    loadDataForEdit(nomor.value);
  } else {
    getNextNumber();
    addNewRow();
  }
});
</script>

<template>
  <PageLayout title="Buat Cetak Barcode Baru" desktop-mode icon="mdi-barcode-plus">
    <template #header-actions>
      <v-btn
        size="small"
        color="secondary"
        @click="testPrinter"
        :loading="isPrinting"
        :disabled="isPrinting || isSaving"
        prepend-icon="mdi-printer-check"
      >
        Tes Printer
      </v-btn>
      <v-spacer></v-spacer>

      <v-btn
        size="small"
        @click="save"
        :loading="isSaving"
        color="primary"
        prepend-icon="mdi-content-save"
      >
        Simpan & Cetak
      </v-btn>
      <v-btn size="small" @click="resetForm" prepend-icon="mdi-refresh">Baru</v-btn>
      <v-btn size="small" @click="router.push('/daftar/cetak-barcode')" prepend-icon="mdi-close"
        >Tutup</v-btn
      >
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field
                v-model="nomor"
                label="Nomor"
                variant="filled"
                readonly
                density="compact"
                hide-details
              >
                <template #append-inner>
                  <span v-if="!nomor" class="text-caption text-medium-emphasis"
                    >&lt;Otomatis&gt;</span
                  >
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="tanggal"
                type="date"
                label="Tanggal"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field>
            </v-col>
          </v-row>
        </div>

        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-label class="mb-2 text-caption text-medium-emphasis"
                >Kategori Produk (untuk F1)</v-label
              >
              <v-radio-group
                v-model="productCategory"
                inline
                hide-details
                density="compact"
                class="mt-n1"
              >
                <v-radio label="Kaosan" value="Kaosan" color="primary"></v-radio>
                <v-radio label="Reszo" value="Reszo" color="primary"></v-radio>
              </v-radio-group>
            </v-col>

            <v-divider class="my-3 border-opacity-25"></v-divider>

            <v-col cols="12">
              <v-label class="mb-2 text-caption text-medium-emphasis">Opsi Cetak</v-label>
              <v-radio-group v-model="selectedPrinter" hide-details density="compact" class="mt-n1">
                <v-radio label="XP-360B (Layout A)" value="XP-360B" color="primary"></v-radio>
                <v-radio label="360B (Layout B)" value="360B" color="primary"></v-radio>
              </v-radio-group>
            </v-col>
            <v-col cols="12">
              <v-checkbox
                v-model="showPriceOnLabel"
                label="Tampilkan Harga Jual di Label"
                density="compact"
                hide-details
                class="mt-n2"
                color="primary"
              ></v-checkbox>
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="scanner-wrapper">
          <v-text-field
            v-model="barcodeScanTerm"
            label="Scan Barcode (Cari Produk)"
            variant="outlined"
            density="compact"
            prepend-inner-icon="mdi-barcode-scan"
            @keyup.enter="handleBarcodeScan"
            clearable
            hide-details
            id="scan-barcode-field"
            autofocus
          ></v-text-field>
        </div>

        <div class="desktop-form-section flex-grow-1 d-flex flex-column pa-0 overflow-hidden">
          <v-data-table
            :headers="tableHeaders"
            :items="items"
            density="compact"
            class="desktop-table header-browse-blue"
            fixed-header
            height="100%"
            :items-per-page="-1"
            no-data-text="Scan barcode atau cari kode (F1) untuk menambah item."
          >
            <template #[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>

            <template #[`item.kode`]="{ item, index }">
              <v-text-field
                v-model="item.kode"
                variant="underlined"
                density="compact"
                hide-details
                single-line
                placeholder="F1 = Cari"
                @keydown.f1.prevent="openProductSearchModal(index)"
                @click="!item.kode && openProductSearchModal(index)"
                readonly
                style="cursor: pointer"
              />
            </template>

            <template #[`item.harga`]="{ item }">
              {{ item.harga != null ? fr(item.harga) : "" }}
            </template>

            <template #[`item.jumlah`]="{ item }">
              <v-text-field
                v-model.number="item.jumlah"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                single-line
                min="0"
                @focus="$event.target.select()"
                @keydown.enter.prevent="addNewRow"
                class="text-end"
              />
            </template>

            <template #[`item.actions`]="{ item, index }">
              <v-icon
                v-if="items.length > 1 || (index === 0 && item.kode)"
                size="small"
                color="error"
                @click="removeRow(item.id)"
              >
                mdi-delete-outline
              </v-icon>
            </template>

            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>
    <ProductSearchModal
      v-if="isProductSearchModalVisible"
      :category="productCategory"
      :gudang="authStore.user?.cabang || 'K04'"
      source="minta-barang"
      :multi="true"
      @products-selected="handleProductsSelected"
      @close="isProductSearchModalVisible = false"
    />

    <v-dialog v-model="isPrintPreviewVisible" max-width="600px" scrollable>
      <v-card>
        <v-toolbar color="primary" density="compact">
          <v-toolbar-title>Pratinjau Cetak Barcode</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" @click="closePreview"></v-btn>
        </v-toolbar>

        <v-card-text class="pa-4 bg-background">
          <div id="print-area">
            <div
              v-for="i in Math.ceil(printPreviewData.length / 2)"
              :key="`page-${i}`"
              class="label-pair-container"
            >
              <div v-if="printPreviewData[(i - 1) * 2]" class="barcode-label">
                <div class="item-info item-name">{{ printPreviewData[(i - 1) * 2].nama }}</div>
                <div class="item-info item-size">{{ printPreviewData[(i - 1) * 2].ukuran }}</div>
                <svg
                  class="barcode-svg"
                  :data-barcode-value="printPreviewData[(i - 1) * 2].barcode"
                ></svg>
                <div class="label-footer">
                  <span>{{ printPreviewData[(i - 1) * 2].barcode }}</span>
                  <span>{{ printPreviewData[(i - 1) * 2].tgl }}</span>
                  <span>{{ printPreviewData[(i - 1) * 2].ukuran }}</span>
                  <span v-if="printPreviewData[(i - 1) * 2].charga">{{
                    printPreviewData[(i - 1) * 2].charga
                  }}</span>
                </div>
              </div>
              <div v-else class="barcode-label"></div>
              <div v-if="printPreviewData[(i - 1) * 2 + 1]" class="barcode-label">
                <div class="item-info item-name">{{ printPreviewData[(i - 1) * 2 + 1].nama }}</div>
                <div class="item-info item-size">
                  {{ printPreviewData[(i - 1) * 2 + 1].ukuran }}
                </div>
                <svg
                  class="barcode-svg"
                  :data-barcode-value="printPreviewData[(i - 1) * 2 + 1].barcode"
                ></svg>
                <div class="label-footer">
                  <span>{{ printPreviewData[(i - 1) * 2 + 1].barcode }}</span>
                  <span>{{ printPreviewData[(i - 1) * 2 + 1].tgl }}</span>
                  <span>{{ printPreviewData[(i - 1) * 2 + 1].ukuran }}</span>
                  <span v-if="printPreviewData[(i - 1) * 2 + 1].charga">{{
                    printPreviewData[(i - 1) * 2 + 1].charga
                  }}</span>
                </div>
              </div>
              <div v-else class="barcode-label"></div>
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="closePreview">Tutup</v-btn>
          <v-btn color="primary" @click="triggerBrowserPrint" prepend-icon="mdi-printer">
            Cetak via Browser
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Layout Grid */
.form-grid-container {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.desktop-form-section {
  padding: 12px 16px;
  /* [FIX DARK MODE] */
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}

/* Header Section (Kiri) */
.header-section {
  flex-shrink: 0;
  background-color: rgb(var(--v-theme-surface));
}

/* Panel Kiri Background (Biru/Abu Gelap) */
.left-column .desktop-form-section {
  background-color: var(--bg-panel-left);
}

/* [FIX INPUT NOMOR & TANGGAL] */
/* Memaksa background input transparan agar warna panel terlihat */
.header-section :deep(.v-field) {
  background-color: transparent !important;
  box-shadow: none !important;
}

/* Memastikan teks input terbaca (putih di dark, hitam di light) */
.header-section :deep(input),
.header-section :deep(.v-field__input) {
  color: rgb(var(--v-theme-on-surface)) !important;
  opacity: 1 !important;
}

/* Memastikan label terbaca */
.header-section :deep(.v-label) {
  color: rgba(var(--v-theme-on-surface), 0.7) !important;
}

/* Radio Button Styling (Kembalikan ke ukuran standar) */
:deep(.v-radio-group .v-label) {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.8);
  margin-bottom: 4px;
}

:deep(.v-radio) {
  /* Pastikan tidak ada scaling aneh */
  transform: none !important;
}

/* Scanner Input */
.scanner-wrapper {
  flex-shrink: 0;
  width: 100%;
}

/* Tabel Full Height */
.desktop-table {
  height: 100%;
  border: none !important;
}

.desktop-table :deep(.v-table__wrapper) {
  height: 100%;
  overflow-y: auto;
}

/* Input Angka di Tabel */
.v-data-table :deep(input[type="number"]) {
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
  color: rgb(var(--v-theme-on-surface));
}

.v-data-table :deep(input[type="number"]::-webkit-inner-spin-button),
.v-data-table :deep(input[type="number"]::-webkit-outer-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

/* Header Tabel */
.desktop-table :deep(thead tr th) {
  background-color: var(--table-head-bg) !important;
  color: var(--table-head-text) !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
}

.v-text-field :deep(input) {
  color: rgb(var(--v-theme-on-surface));
}
</style>

<style>
/* Preview container */
#print-area {
  background-color: #525659;
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.label-pair-container {
  width: 68mm !important;
  /* Pastikan preview tidak melebar ke 148mm */
  height: 15mm !important;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2) !important;
  margin-bottom: 10px !important;
}

.barcode-label {
  width: 32mm;
  height: 15mm;
  display: flex;
  flex-direction: column;
  align-items: flex-start !important;
  /* Preview kiri */
  text-align: left !important;
  /* Preview kiri */
  padding: 1mm 0 0 1.5mm !important;
  box-sizing: border-box;
}

/* Info teks */
.item-info {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  line-height: 1.2;
  margin: 0;
  color: #000000 !important;
  /* [FIX] Teks hitam */
}

.item-name {
  font-size: 6pt !important;
  font-family: "Arial Narrow", sans-serif !important;
  line-height: 1.1 !important;

  /* Samakan logika 2 baris di pratinjau */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  overflow: hidden;
}

.item-size {
  font-size: 9px;
  font-weight: normal;
  color: #000000 !important;
}

.barcode-svg {
  width: 95%;
  max-width: 100%;
  height: auto;
  margin: 1mm 0;
  display: block;
}

/* [FIX] Pastikan garis barcode dan teks barcode selalu hitam */
.barcode-svg rect {
  fill: #ffffff !important;
  /* Background barcode putih */
}

.barcode-svg g,
.barcode-svg path,
.barcode-svg line {
  stroke: #000000 !important;
  /* Garis barcode hitam */
  fill: #000000 !important;
}

.barcode-svg text {
  fill: #000000 !important;
  /* Angka barcode hitam */
}

.label-footer {
  font-size: 7px;
  display: flex;
  justify-content: space-between;
  width: 95%;
  margin-top: 1mm;
  gap: 3px;
  color: #000000 !important;
  /* [FIX] Teks footer hitam */
}

/* --- MODE PRINT (NON-SCOPED) --- */
@media print {
  body * {
    visibility: hidden !important;
  }

  #print-area,
  #print-area * {
    visibility: visible !important;
  }

  #print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    background: white !important;
    padding: 0 !important;
    display: block !important;
    margin: 0 !important;
    transform: translateX(6mm);
  }

  /* Ini adalah style dari printStylesXP360B */
  @page {
    size: 68mm 15mm landscape;
    margin: 0 !important;
  }

  .label-pair-container {
    width: 68mm !important;
    height: 15mm !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    page-break-after: always !important;
    margin: 0 !important;
    padding: 0 !important;
    background-color: white !important;
    color: black !important;
  }

  .barcode-label {
    width: 33mm !important;
    height: 15mm !important;
    padding: 0.5mm !important;
    font-size: 5px !important;
    line-height: 1.1 !important;
    background-color: white !important;
    color: black !important;
  }

  .item-name {
    font-size: 7pt;
    white-space: nowrap;
    /* Jika Nama terlalu panjang, ia akan tetap di satu baris tapi terpotong halus */
    overflow: hidden;
    text-overflow: clip;
    /* Alternatif: gunakan font condensed */
    font-family: "Arial Narrow", sans-serif;
  }

  .item-size {
    font-size: 4px !important;
    margin: 0 !important;
    color: black !important;
  }

  .barcode-svg {
    width: 28mm !important;
    height: 7mm !important;
    margin: 0.3mm 0 !important;
  }

  .barcode-svg line,
  .barcode-svg rect,
  .barcode-svg g {
    fill: black !important;
    stroke: black !important;
  }

  .label-footer {
    font-size: 3px !important;
    width: 90% !important;
    margin-top: 0 !important;
    color: black !important;
  }
}
</style>

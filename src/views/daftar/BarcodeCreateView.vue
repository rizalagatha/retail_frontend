<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import type { AxiosError } from 'axios';
import JsBarcode from 'jsbarcode';
import ProductSearchModal from '@/components/lookup/ProductSearchModal.vue';
import { formatRupiah } from "@/utils/formatRupiah";
const fr = (v: number) => formatRupiah(v);

// Daftarkan JsBarcode ke window agar bisa diakses di iframe
(window as Window & { JsBarcode: typeof JsBarcode }).JsBarcode = JsBarcode;

// --- Store & Composables ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '35'; // Diambil dari halaman browse Anda

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
interface ProductDetail { // Dari ProductSearchModal Anda
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
  charga: string; // harga terformat
  nourut: number;
  layoutType: 'XP-360B' | '360B';
}

// --- State Header & Form ---
const nomor = ref('');
const tanggal = ref(format(new Date(), 'yyyy-MM-dd'));
const items = ref<BarcodeItem[]>([]);
const isSaving = ref(false);
const barcodeScanTerm = ref('');
const productCategory = ref('Kaosan'); // State ini tetap dipakai

// --- State Lookup/Modal (Dari kode Retail Anda) ---
const isProductSearchModalVisible = ref(false);
const activeRowIndex = ref(-1);

// --- State Cetak & Pratinjau (BARU - Diimpor dari Franchise) ---
const selectedPrinter = ref<'XP-360B' | '360B'>('XP-360B');
const showPriceOnLabel = ref(false);
const isPrinting = ref(false); // Untuk tombol Tes Printer
const isPrintPreviewVisible = ref(false);
const printPreviewData = ref<PrintLabelItem[]>([]); // Data untuk pratinjau
const isAfterSave = ref(false);

// --- Konfigurasi Tabel ---
const tableHeaders = [
  { title: '#', key: 'no', sortable: false, width: '40px' },
  { title: 'Kode', key: 'kode', sortable: false, width: '150px' },
  { title: 'Barcode', key: 'barcode', sortable: false, width: '150px' },
  { title: 'Nama Barang', key: 'nama', sortable: false, minWidth: '250px' },
  { title: 'Size', key: 'ukuran', sortable: false, width: '80px' },
  { title: 'Harga', key: 'harga', sortable: false, align: 'end', width: '100px' },
  { title: 'Jumlah', key: 'jumlah', sortable: false, width: '120px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
] as const;

// --- FUNGSI CETAK (BARU - Diimpor dari Franchise) ---
// CSS untuk printer XP-360B (Layout A)
const printStylesXP360B = `
  @page {
    size: 68mm 15mm landscape;
    margin: 0;
  }
  #print-area {
    transform: translateX(6mm);
  }
  html, body {
    margin: 0; padding: 0;
    width: 68mm; height: auto;
    overflow: visible !important;
    font-family: Arial, sans-serif;
    /* Rotasi 180 derajat untuk printer thermal tertentu */
    /* transform: rotate(180deg); */
    /* transform-origin: center; */
  }
  .label-pair-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 68mm;
    height: 15mm;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
    page-break-after: always !important;
  }
  .label-pair-container:last-child { page-break-after: avoid; }
  .barcode-label {
    width: 33mm;
    height: 15mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    overflow: hidden;
    box-sizing: border-box;
    padding: 0.5mm 1mm;
    margin: 0;
    font-size: 5px;
    line-height: 1.1;
  }
  .item-info {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    margin: 0;
  }
  .item-name { font-weight: bold; }
  .item-size { font-weight: normal; }
  .barcode-svg {
    width: 28mm;
    height: 7mm;
    margin: 0.3mm 0;
    display: block;
  }
  .label-footer {
    display: flex;
    justify-content: space-between;
    width: 90%;
    font-size: 5px;
  }
  @media print {
    .barcode-label { border: none; }
  }
`;
// TODO: Tambahkan printStyles360B jika layoutnya berbeda

// --- FUNGSI BISNIS (Dipertahankan dari Retail / Diadaptasi) ---

const getNextNumber = async () => {
  try {
    const cabang = authStore.user?.cabang || '';
    const response = await api.get('/barcode-form/next-number', {
      params: { cabang, tanggal: tanggal.value }
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

  const newItems: BarcodeItem[] = products.map(p => ({
    id: Date.now() + Math.random(),
    kode: p.kode,
    nama: p.nama,
    barcode: p.barcode,
    ukuran: p.ukuran,
    harga: p.harga,
    jumlah: 0,
  }));

  // Ganti baris aktif jika kosong, atau sisipkan
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
      const existingItem = items.value.find(i => i.barcode === product.barcode);
      if (existingItem) {
        existingItem.jumlah = (existingItem.jumlah || 0) + 1;
      } else {
        // Hapus baris kosong terakhir jika ada
        if (items.value.length > 0 && !items.value[items.value.length - 1].kode) {
          items.value.pop();
        }
        items.value.push({ ...product, id: Date.now(), jumlah: 1, harga: product.harga || 0 });
      }
      addNewRow();
      // Fokus kembali ke input scan
      await nextTick();
      document.getElementById('scan-barcode-field')?.focus();
    } else {
      toast.warning('Barcode tidak ditemukan.');
    }
  } catch {
    toast.error('Gagal mencari barcode.');
  } finally {
    barcodeScanTerm.value = ''; // Selalu kosongkan
  }
};

const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({ id: Date.now(), kode: '', barcode: '', nama: '', ukuran: '', harga: null, jumlah: null });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
  if (items.value.length === 0) {
    addNewRow();
  }
};

const resetForm = () => {
  getNextNumber();
  tanggal.value = format(new Date(), 'yyyy-MM-dd');
  items.value = [];
  addNewRow();
  productCategory.value = 'Kaosan';
  selectedPrinter.value = 'XP-360B';
  showPriceOnLabel.value = false;
};

// --- FUNGSI SAVE & PRINT BARU (Diimpor dari Franchise) ---

const save = async () => {
  isSaving.value = true;
  const validItems = items.value.filter(item => item.kode && (item.jumlah || 0) > 0);
  if (validItems.length === 0) {
    toast.error('Tidak ada item yang valid untuk disimpan.');
    isSaving.value = false;
    return;
  }
  try {
    const payload = {
      header: { nomor: nomor.value, tanggal: tanggal.value },
      details: validItems,
      user: { kode: authStore.user?.kode },
      isNew: true // Asumsi form ini selalu 'Baru'
    };

    // Sesuaikan API call dengan service Anda
    await api.post('/barcode-form/save', payload);

    toast.success(`Data barcode ${nomor.value} berhasil disimpan. Siap untuk dicetak.`);

    isAfterSave.value = true;

    // --- Alur Baru: Panggil Pratinjau ---
    const printOptions = {
      showPrice: showPriceOnLabel.value,
      printerType: selectedPrinter.value,
    };
    const dataToPrint = preparePrintData(validItems, printOptions, nomor.value, format(new Date(tanggal.value), 'dd/MM/yy'));
    handlePrint(dataToPrint);
    // --- Akhir Alur Baru ---

  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const preparePrintData = (
  itemsToPrint: BarcodeItem[],
  options: { showPrice: boolean; printerType: 'XP-360B' | '360B' },
  nomorDokumen: string,
  tanggalDokumen: string
): PrintLabelItem[] => {
  const outputLabels = [];
  let labelCounter = 1;

  itemsToPrint.forEach(item => {
    if (item.barcode && (item.jumlah || 0) > 0) {
      const qty = item.jumlah || 0;
      for (let i = 1; i <= qty; i++) {
        const hargaFormatted = options.showPrice && item.harga && item.harga > 0
          ? fr(item.harga)
          : '';

        outputLabels.push({
          nomor: nomorDokumen,
          tgl: tanggalDokumen,
          kode: item.kode,
          ukuran: item.ukuran,
          barcode: item.barcode,
          nama: item.nama,
          harga: item.harga?.toString() ?? '',
          charga: hargaFormatted,
          nourut: labelCounter++,
          layoutType: options.printerType
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
  const dummyItems: BarcodeItem[] = [{
    id: Date.now(),
    kode: '12345678',
    barcode: '12345678',
    nama: 'TES PRINTER',
    ukuran: 'TES',
    harga: 50000,
    jumlah: 4, // Cetak 4 label (2 halaman)
  }];
  const printOptions = {
    showPrice: showPriceOnLabel.value,
    printerType: selectedPrinter.value,
  };
  const dataToPrint = preparePrintData(dummyItems, printOptions, 'TES', format(new Date(), 'dd/MM/yy'));
  handlePrint(dataToPrint);
};

const triggerBrowserPrint = () => {
  const printContent = document.getElementById('print-area');
  if (printContent) {
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.width = '100mm';
    printFrame.style.height = '400mm';
    printFrame.style.border = 'none';
    // Sembunyikan iframe di luar layar
    printFrame.style.top = '-9999px';
    printFrame.style.left = '-9999px';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      let stylesToInject = '';
      if (selectedPrinter.value === 'XP-360B') {
        stylesToInject += printStylesXP360B;
      } else {
        stylesToInject += printStylesXP360B; // Ganti jika '360B' punya style beda
      }
      frameDoc.write(`<html><head><title>Cetak Barcode</title><style>${stylesToInject}</style></head><body>`);
      frameDoc.write(printContent.innerHTML);
      frameDoc.write('</body></html>');
      frameDoc.close();

      // [LANGKAH PENTING DARI FRANCHISE]
      // Panggil generate barcode dari parent SEBELUM print
      generateBarcodesInIframe(printFrame);

      // Jeda 500ms untuk memastikan barcode selesai di-render
      setTimeout(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
        // Hapus iframe setelah print
        setTimeout(() => { document.body.removeChild(printFrame); }, 1500);
      }, 500);

      // Panggil fungsi close yang baru
      closePreview();

    } else {
      toast.error("Area cetak tidak ditemukan.");
    }
  }
};

// GANTI FUNGSI 'generateBarcodesInIframe' ANDA DENGAN INI
const generateBarcodesInIframe = (iframe: HTMLIFrameElement) => {
  const frameDoc = iframe.contentWindow?.document;
  // Gunakan JsBarcode dari 'window' UTAMA (parent)
  if (frameDoc && window.JsBarcode) {
    const svgs = frameDoc.querySelectorAll('.barcode-svg');
    svgs.forEach((svgElement) => {
      const barcodeValue = svgElement.getAttribute('data-barcode-value');
      if (barcodeValue) {
        try {
          // Panggil JsBarcode dari parent
          JsBarcode(svgElement as SVGElement, barcodeValue, {
            format: "CODE128C",
            lineColor: "#000",
            width: 1.2, // Sesuaikan dengan style cetak Anda
            height: 18, // Sesuaikan dengan style cetak Anda
            displayValue: false,
            margin: 1, // Sesuaikan dengan style cetak Anda
          });
        } catch (e) {
          console.error("JsBarcode error:", e);
        }
      }
    });
  }
};

const generateBarcodesInPreview = async () => {
  await nextTick(); // Tunggu DOM dialog di-render
  const previewArea = document.getElementById('print-area');
  if (!previewArea || !window.JsBarcode) return;

  const svgs = previewArea.querySelectorAll<SVGElement>('.barcode-svg');
  svgs.forEach(svg => {
    const value = svg.getAttribute('data-barcode-value');
    if (!value) return;
    try {
      JsBarcode(svg, value, {
        format: 'CODE128C',
        lineColor: '#000',
        width: 1.2,
        height: 25, // Lebih tinggi untuk preview
        displayValue: false,
        margin: 1,
      });
    } catch (err) { console.error('JsBarcode preview error:', err); }
  });
};

const closePreview = () => {
  isPrintPreviewVisible.value = false;
  if (isAfterSave.value) {
    router.push('/daftar/cetak-barcode');
  }
  isAfterSave.value = false;
};

// --- Watchers ---
watch(printPreviewData, (newVal) => {
  if (isPrintPreviewVisible.value && newVal.length > 0) {
    // Beri jeda agar dialog muncul sebelum generate barcode
    setTimeout(() => generateBarcodesInPreview(), 100);
  }
});

// --- Lifecycle ---
onMounted(() => {
  // Cek izin
  if (!authStore.can(MENU_ID, 'insert')) {
    toast.error("Anda tidak memiliki izin untuk membuat data ini.");
    router.back();
    return;
  }
  getNextNumber();
  addNewRow(); // Tambah baris kosong awal
});
</script>

<template>
  <PageLayout title="Buat Cetak Barcode Baru" desktop-mode icon="mdi-barcode-plus">
    <template #header-actions>
      <v-btn size="small" color="secondary" @click="testPrinter" :loading="isPrinting"
        :disabled="isPrinting || isSaving" prepend-icon="mdi-printer-check">
        Tes Printer
      </v-btn>
      <v-spacer></v-spacer>

      <v-btn size="small" @click="save" :loading="isSaving" color="primary" prepend-icon="mdi-content-save">
        Simpan & Cetak
      </v-btn>
      <v-btn size="small" @click="resetForm" prepend-icon="mdi-refresh">Baru</v-btn>
      <v-btn size="small" @click="router.push('/daftar/cetak-barcode')" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div class="form-grid-container">

      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field v-model="nomor" label="Nomor" variant="filled" readonly density="compact" hide-details>
                <template #append-inner>
                  <span v-if="!nomor" class="text-caption text-disabled">&lt;Otomatis&gt;</span>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field v-model="tanggal" type="date" label="Tanggal" variant="outlined" density="compact"
                hide-details></v-text-field>
            </v-col>
          </v-row>
        </div>

        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-label class="mb-2 text-caption">Kategori Produk (untuk F1)</v-label>
              <v-radio-group v-model="productCategory" inline hide-details density="compact" class="mt-n1">
                <v-radio label="Kaosan" value="Kaosan"></v-radio>
                <v-radio label="Reszo" value="Reszo"></v-radio>
              </v-radio-group>
            </v-col>

            <v-divider class="my-3"></v-divider>

            <v-col cols="12">
              <v-label class="mb-2 text-caption">Opsi Cetak</v-label>
              <v-radio-group v-model="selectedPrinter" hide-details density="compact" class="mt-n1">
                <v-radio label="XP-360B (Layout A)" value="XP-360B"></v-radio>
                <v-radio label="360B (Layout B)" value="360B"></v-radio>
              </v-radio-group>
            </v-col>
            <v-col cols="12">
              <v-checkbox v-model="showPriceOnLabel" label="Tampilkan Harga Jual di Label" density="compact"
                hide-details class="mt-n2"></v-checkbox>
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="scanner-wrapper">
          <v-text-field v-model="barcodeScanTerm" label="Scan Barcode (Cari Produk)" variant="outlined"
            density="compact" prepend-inner-icon="mdi-barcode-scan" @keyup.enter="handleBarcodeScan" clearable
            hide-details id="scan-barcode-field" autofocus></v-text-field>
        </div>

        <div class="desktop-form-section flex-grow-1 d-flex flex-column">
          <v-data-table :headers="tableHeaders" :items="items" density="compact" class="desktop-table" fixed-header
            height="100%" :items-per-page="-1" no-data-text="Scan barcode atau cari kode (F1) untuk menambah item.">
            <template #[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>

            <template #[`item.kode`]="{ item, index }">
              <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details single-line
                placeholder="F1 = Cari" @keydown.f1.prevent="openProductSearchModal(index)"
                @click="!item.kode && openProductSearchModal(index)" readonly style="cursor: pointer;" />
            </template>

            <template #[`item.harga`]="{ item }">
              {{ fr(item.harga) }}
            </template>

            <template #[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" density="compact"
                hide-details single-line min="0" @focus="$event.target.select()" @keydown.enter.prevent="addNewRow"
                class="text-end" />
            </template>

            <template #[`item.actions`]="{ item, index }">
              <v-icon v-if="items.length > 1 || (index === 0 && item.kode)" size="small" color="error"
                @click="removeRow(item.id)">
                mdi-delete-outline
              </v-icon>
            </template>

            <template #bottom></template> </v-data-table>
        </div>
      </div>

    </div>
    <ProductSearchModal v-if="isProductSearchModalVisible" :category="productCategory"
      :gudang="authStore.user?.cabang || 'K04'" source="minta-barang" :multi="true"
      @products-selected="handleProductsSelected" @close="isProductSearchModalVisible = false" />

    <v-dialog v-model="isPrintPreviewVisible" max-width="600px" scrollable>
      <v-card>
        <v-toolbar color="primary" density="compact">
          <v-toolbar-title>Pratinjau Cetak Barcode</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" @click="closePreview"></v-btn>
        </v-toolbar>

        <v-card-text class="pa-4 bg-grey-lighten-3">
          <div id="print-area">
            <div v-for="i in Math.ceil(printPreviewData.length / 2)" :key="`page-${i}`" class="label-pair-container">

              <div v-if="printPreviewData[(i - 1) * 2]" class="barcode-label">
                <div class="item-info item-name">{{ printPreviewData[(i - 1) * 2].nama }}</div>
                <div class="item-info item-size">{{ printPreviewData[(i - 1) * 2].ukuran }}</div>
                <svg class="barcode-svg" :data-barcode-value="printPreviewData[(i - 1) * 2].barcode"></svg>
                <div class="label-footer">
                  <span>{{ printPreviewData[(i - 1) * 2].barcode }}</span>
                  <span>{{ printPreviewData[(i - 1) * 2].tgl }}</span>
                  <span>{{ printPreviewData[(i - 1) * 2].ukuran }}</span>
                  <span v-if="printPreviewData[(i - 1) * 2].charga">{{ printPreviewData[(i - 1) * 2].charga }}</span>
                </div>
              </div>
              <div v-else class="barcode-label"></div>
              <div v-if="printPreviewData[(i - 1) * 2 + 1]" class="barcode-label">
                <div class="item-info item-name">{{ printPreviewData[(i - 1) * 2 + 1].nama }}</div>
                <div class="item-info item-size">{{ printPreviewData[(i - 1) * 2 + 1].ukuran }}</div>
                <svg class="barcode-svg" :data-barcode-value="printPreviewData[(i - 1) * 2 + 1].barcode"></svg>
                <div class="label-footer">
                  <span>{{ printPreviewData[(i - 1) * 2 + 1].barcode }}</span>
                  <span>{{ printPreviewData[(i - 1) * 2 + 1].tgl }}</span>
                  <span>{{ printPreviewData[(i - 1) * 2 + 1].ukuran }}</span>
                  <span v-if="printPreviewData[(i - 1) * 2 + 1].charga">{{ printPreviewData[(i - 1) * 2 + 1].charga
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
/* Styles untuk layout grid, left/right column */
.form-grid-container {
  display: grid;
  grid-template-columns: 350px 1fr;
  /* Lebar kolom kiri 350px */
  gap: 16px;
  /* (Tinggi diatur oleh PageLayout 'desktop-mode') */
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.desktop-form-section {
  padding: 12px 16px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header-section {
  flex-shrink: 0;
}

.scanner-wrapper {
  flex-shrink: 0;
  max-width: 400px;
}

:deep(.v-radio-group .v-label) {
  font-size: 0.875rem;
}

.desktop-table {
  height: 100%;
}

.desktop-table :deep(.v-table__wrapper) {
  height: 100%;
  overflow-y: auto;
}

/* Styling input di dalam tabel */
.v-data-table :deep(input[type='number']) {
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
}

.v-data-table :deep(input[type=number]::-webkit-inner-spin-button),
.v-data-table :deep(input[type=number]::-webkit-outer-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}
</style>

<style>
/* Preview container */
#print-area {
  background-color: #f5f5f5;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  overflow-y: auto;
}

/* Setiap baris label (2 kolom) */
.label-pair-container {
  width: 148mm;
  /* Lebar untuk preview */
  height: 32mm;
  background-color: white;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
  border-radius: 2px;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
  padding: 0;
  margin: 0;
}

/* Label individual */
.barcode-label {
  width: 74mm;
  height: 32mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-family: Arial, sans-serif;
  padding: 2mm;
  box-sizing: border-box;
  overflow: hidden;
}

/* Info teks */
.item-info {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  line-height: 1.2;
  margin: 0;
  color: #333;
}

.item-name {
  font-weight: bold;
  font-size: 11px;
  margin-bottom: 1mm;
}

.item-size {
  font-size: 9px;
  font-weight: normal;
}

.barcode-svg {
  width: 95%;
  max-width: 100%;
  height: auto;
  margin: 1mm 0;
  display: block;
}

.label-footer {
  font-size: 7px;
  display: flex;
  justify-content: space-between;
  width: 95%;
  margin-top: 1mm;
  gap: 3px;
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

    /* Geser ke kanan 4 mm */
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
  }

  .barcode-label {
    width: 33mm !important;
    height: 15mm !important;
    padding: 0.5mm !important;
    font-size: 5px !important;
    line-height: 1.1 !important;
  }

  .item-name {
    font-size: 5px !important;
    margin: 0 !important;
  }

  .item-size {
    font-size: 4px !important;
    margin: 0 !important;
  }

  .barcode-svg {
    width: 28mm !important;
    height: 7mm !important;
    margin: 0.3mm 0 !important;
  }

  .label-footer {
    font-size: 3px !important;
    width: 90% !important;
    margin-top: 0 !important;
  }
}
</style>

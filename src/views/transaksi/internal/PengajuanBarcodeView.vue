<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import axios, { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import JsBarcode from "jsbarcode";

if (typeof window !== "undefined") {
  // Menggabungkan tipe Window asli dengan properti JsBarcode
  (window as Window & { JsBarcode: typeof JsBarcode }).JsBarcode = JsBarcode;
}

// Interface Header (Wajib untuk Resize)
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
}

interface MasterItem {
  nomor: string;
  tanggal: string;
  usr: string;
  approved: string | null;
  tglApproval: string | null;
  closing: "Y" | "N";
}
interface DetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  barcodeBaru?: string;
}
interface PengajuanExportRow {
  Tanggal?: string | Date;
  [key: string]: unknown;
}
interface DetailData {
  items: DetailItem[];
  stickers: DetailItem[]; // Interface DetailItem bisa digunakan kembali
}
interface BarcodeItem {
  barcode: string;
  nama: string;
  ukuran: string;
  harga: number;
  jumlah: number;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "33";

// --- State ---
const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailData>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<{ kode: string; nama: string }[]>([]);
const isPrintDialogVisible = ref(false);
const isPrintLoading = ref(false);
const itemsToPrint = ref<BarcodeItem[]>([]);

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang || "",
});

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);

const canEdit = computed(
  () => isSingleSelected.value && !selectedRow.value?.approved && selectedRow.value?.closing !== "Y"
);
const canDelete = computed(
  () => isSingleSelected.value && !selectedRow.value?.approved && selectedRow.value?.closing !== "Y"
);
const canPrintBarcode = computed(() => isSingleSelected.value && !!selectedRow.value?.approved);

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "nomor", width: 180, fixed: true },
  { title: "Tanggal", key: "tanggal", width: 120 },
  { title: "User", key: "usr", width: 120 },
  { title: "Approved", key: "approved", width: 120 },
  { title: "Tgl Approval", key: "tglApproval", width: 120 },
  { title: "Closing", key: "closing", align: "center", width: 100 },
]);

const detailHeaders = [
  { title: "Kode", key: "kode", width: "150px" },
  { title: "Nama Barang", key: "nama", width: "300px" },
  { title: "Ukuran", key: "ukuran", width: "100px" },
  { title: "Jumlah", key: "jumlah", align: "end", width: "100px" },
  { title: "Harga", key: "harga", align: "end", width: "120px" },
  { title: "Barcode Baru", key: "barcodeBaru", width: "150px" },
] as const;

// --- Logic Resize Column ---
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  e.preventDefault();
  e.stopPropagation();
  resizingColumn.value = column;
  startX.value = e.pageX;
  startWidth.value = typeof column.width === "number" ? column.width : 100;
  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", onResizeEnd);
  document.body.style.cursor = "col-resize";
};

const onResizeMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;
  const diff = e.pageX - startX.value;
  resizingColumn.value.width = Math.max(50, startWidth.value + diff);
};

const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", onResizeEnd);
  document.body.style.cursor = "";
};

// --- Logic Selected Row ---
const handleRowClick = (_event: Event, { item }: { item: MasterItem }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/pengajuan-barcode/lookup/cabang");
    cabangList.value = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal memuat daftar cabang.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/pengajuan-barcode", { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor)
  );
  if (!itemToLoad) return;
  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/pengajuan-barcode/details/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = `Gagal memuat detail untuk ${nomorToLoad}`;
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;

    toast.error(msg);
    expanded.value = expanded.value.filter((nomor) => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleNew = () => router.push({ name: "PengajuanBarcodeCreate" });
const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: "PengajuanBarcodeEdit", params: { nomor: selectedRow.value?.nomor } });
};

const handleDelete = () => {
  if (!canDelete.value) return;
  showConfirmation(
    "Konfirmasi Hapus",
    `Yakin ingin menghapus dokumen ${selectedRow.value?.nomor}?`,
    async () => {
      try {
        const response = await api.delete(`/pengajuan-barcode/${selectedRow.value?.nomor}`);
        toast.success(response.data.message);
        fetchMasterData();
      } catch (err) {
        const error = err as AxiosError<{ message?: string }>;
        toast.error(error.response?.data?.message || "Gagal menghapus data.");
      }
    }
  );
};

// Helper Format Tanggal Indonesia
const formatDateIndo = (dateString: string | Date | null | undefined) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

// --- 2. Fungsi Export Data ---
const exportData = async (type: "header" | "detail") => {
  // === EXPORT HEADER ===
  if (type === "header") {
    // Casting masterData.value ke Interface MasterItem
    const currentList = masterData.value as MasterItem[];

    if (currentList.length === 0) {
      toast.warning("Tidak ada data header untuk diekspor.");
      return;
    }

    try {
      toast.info("Membuat file Excel Header...");

      // Mapping Header dengan Format Tanggal
      const formattedHeader = currentList.map((item) => ({
        ...item,
        tanggal: item.tanggal ? formatDateIndo(item.tanggal) : "",
        tglApproval: item.tglApproval ? formatDateIndo(item.tglApproval) : "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pengajuan Barcode Header");
      XLSX.writeFile(workbook, "Export_PengajuanBarcode_Header.xlsx");
      toast.success("File Header berhasil dibuat.");
    } catch (error: unknown) {
      // [PERBAIKAN]
      toast.error("Gagal membuat file Excel.");
      console.error(error); // Tetap log ke console untuk debug
    }

    // === EXPORT DETAIL ===
  } else if (type === "detail") {
    try {
      toast.info("Mengambil data detail dari server...");

      // Request API dengan Generic Type
      const response = await api.get<PengajuanExportRow[]>("/pengajuan-barcode/export-details", {
        params: filters,
      });

      const details = response.data;

      if (details.length === 0) {
        toast.warning("Tidak ada data detail untuk diekspor pada filter ini.");
        return;
      }

      toast.info("Membuat file Excel Detail...");

      // Mapping Detail dengan Format Tanggal
      const formattedDetail = details.map((row) => ({
        ...row,
        Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal) : "",
      }));

      // Setup Layout Excel (Judul, Periode, Tabel)
      const title = "LAPORAN DETAIL PENGAJUAN BARCODE";
      const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(
        filters.endDate
      )}`;
      const tableHeaders = Object.keys(formattedDetail[0]);

      // Konversi ke Array Values (Type Safe)
      const tableData = formattedDetail.map((row) => Object.values(row as Record<string, unknown>));

      const excelData = [[title], [dateRange], [], tableHeaders, ...tableData];

      const worksheet = XLSX.utils.aoa_to_sheet(excelData);

      // Merge Judul
      const merge = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } },
      ];
      worksheet["!merges"] = merge;

      // Auto Width
      const colWidths = tableHeaders.map((header) => ({ wch: header.length + 5 }));
      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pengajuan Barcode Detail");
      XLSX.writeFile(workbook, "Export_PengajuanBarcode_Detail.xlsx");
      toast.success("File Detail berhasil dibuat.");
    } catch (error) {
      let message = "Gagal mengekspor data detail.";
      if (error instanceof Error) message = error.message;
      toast.error(message);
    }
  }
};

// Method Baru: Cetak Form A4
const handleCetakA4 = () => {
  if (!isSingleSelected.value || !selectedRow.value) return;

  const url = router.resolve({
    name: "CetakBarcodeBaruA4", // Sesuai route yang Anda berikan
    params: { nomor: selectedRow.value.nomor },
  }).href;

  window.open(url, "_blank");
};

const getRowTextColor = (item: MasterItem): string => {
  return !item.approved ? "text-red font-weight-bold" : "";
};

// --- 1. Style Identik dengan Create View ---
const printStylesXP360B = `
  @page { size: 68mm 15mm landscape; margin: 0 !important; }
  html, body { margin: 0; padding: 0; width: 68mm; background-color: #fff; }
  .label-pair-container {
    display: flex; width: 68mm; height: 15mm;
    align-items: center; justify-content: space-between;
    padding: 0 1.5mm; box-sizing: border-box;
    page-break-after: always !important;
  }
  .barcode-label {
    width: 30.5mm; height: 14mm;
    display: flex; flex-direction: column;
    justify-content: flex-start; align-items: flex-start;
    text-align: left; overflow: hidden;
    padding: 0.5mm 0 0 0.5mm; box-sizing: border-box;
  }
  .item-name {
    font-size: 5.2pt; font-weight: bold; font-family: 'Arial Narrow', sans-serif;
    line-height: 1.1; width: 100%; height: 2.2em;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    white-space: normal; overflow: hidden; color: #000;
  }
  .item-size { font-size: 4.8pt; font-family: Arial; color: #000; margin-bottom: 0.1mm; }
  .barcode-svg { width: 27mm !important; height: 5.5mm !important; margin-left: -0.8mm; }
  .label-footer {
    display: flex; justify-content: space-between; width: 98%;
    font-size: 4.5pt; font-family: Arial, sans-serif; font-weight: bold; color: #000;
  }
`;

// --- 2. Render Barcode Iframe (Murni untuk Printer) ---
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
            width: 1, // [KUNCI] Batang barcode tipis agar tidak menyatu
            height: 20, // Tinggi yang pas untuk area 15mm
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

const barcodeSheets = computed(() => {
  if (!Array.isArray(itemsToPrint.value)) return [];

  const expandedItems = itemsToPrint.value.flatMap((item) =>
    Array.from({ length: item.jumlah || 0 }, () => ({
      barcode: item.barcode,
      nama: item.nama,
      ukuran: item.ukuran,
      harga: item.harga,
    }))
  );

  const sheets = [];
  for (let i = 0; i < expandedItems.length; i += 2) {
    sheets.push(expandedItems.slice(i, i + 2));
  }
  return sheets;
});

// --- Methods Cetak ---
const handleCetakBarcode = async () => {
  if (!canPrintBarcode.value || !selectedRow.value) return;

  isPrintLoading.value = true;
  isPrintDialogVisible.value = true;
  itemsToPrint.value = []; // Reset data lama

  try {
    // [FIX] Menggunakan endpoint print-barcode untuk mengambil data dtl2
    const response = await api.get(
      `/pengajuan-barcode-form/print-barcode/${selectedRow.value.nomor}`
    );

    const rawData = response.data;
    itemsToPrint.value = Array.isArray(rawData) ? rawData : rawData.data || [];

    if (itemsToPrint.value.length === 0) {
      toast.warning("Data barcode kosong atau belum di-approve.");
      isPrintDialogVisible.value = false;
      return;
    }

    // Tunggu DOM Dialog render elemen SVG
    await nextTick();
    renderBarcodes();
  } catch (err: unknown) {
    let msg = "Gagal memuat data barcode.";
    if (axios.isAxiosError(err)) {
      msg = err.response?.data?.message || msg;
    }
    toast.error(msg);
    isPrintDialogVisible.value = false;
  } finally {
    isPrintLoading.value = false;
  }
};

// --- 3. Render Barcode Dialog (Untuk Pratinjau di Layar) ---
const renderBarcodes = () => {
  barcodeSheets.value.forEach((sheet, sheetIndex) => {
    sheet.forEach((item, itemIndex) => {
      const elementId = `barcode-dialog-${sheetIndex}-${itemIndex}`;
      const canvas = document.getElementById(elementId);
      if (canvas && item.barcode) {
        JsBarcode(canvas, item.barcode, {
          format: "CODE128",
          width: 1.1, // Sedikit lebih lebar untuk layar monitor agar jelas
          height: 25,
          displayValue: false,
          margin: 0,
        });
      }
    });
  });
};

// --- 3. Update Fungsi triggerPrint ---
const triggerPrint = () => {
  const printContent = document.getElementById("print-area-barcode");
  if (printContent) {
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.visibility = "hidden";
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(`
        <html>
          <head><style>${printStylesXP360B}</style></head>
          <body>${printContent.innerHTML}</body>
        </html>
      `);
      frameDoc.close();
      generateBarcodesInIframe(printFrame);
      setTimeout(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(printFrame);
        }, 1000);
      }, 500);
    }
  }
};

onMounted(async () => {
  await fetchCabangList();
  fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Browse Pengajuan Barcode Baru" icon="mdi-barcode-scan">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        prepend-icon="mdi-plus"
        color="primary"
        @click="handleNew"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        prepend-icon="mdi-pencil"
        @click="handleEdit"
        :disabled="!canEdit"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        prepend-icon="mdi-delete"
        color="error"
        @click="handleDelete"
        :disabled="!canDelete"
        >Hapus</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        prepend-icon="mdi-printer"
        color="primary"
        @click="handleCetakA4"
        :disabled="!isSingleSelected"
      >
        Cetak Form (A4)
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')">
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        prepend-icon="mdi-printer"
        color="success"
        @click="handleCetakBarcode"
        :disabled="!canPrintBarcode"
      >
        Cetak Barcode Baru
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <v-select
          label="Cabang"
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 200px"
        />
        <v-spacer />
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum di-Approve
        </div>
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="masterData"
          :loading="loading"
          item-value="nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          show-expand
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  :style="{
                    width: header.width + 'px',
                    minWidth: header.width + 'px',
                    maxWidth: header.width + 'px',
                  }"
                  class="resizable-header"
                  :class="{
                    'text-center': header.align === 'center',
                    'text-end': header.align === 'end',
                  }"
                  @click="toggleSort(header)"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="small" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>
                  </div>
                  <div
                    class="resizer"
                    @mousedown.stop="onResizeStart($event, header)"
                    @click.stop
                  ></div>
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn
              icon="mdi-chevron-down"
              :class="{ 'rotate-180': isExpanded(internalItem) }"
              size="x-small"
              variant="text"
              @click.stop="toggleExpand(internalItem)"
            />
          </template>

          <template
            v-for="header in headers.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'tanggal'">
                {{ item.tanggal ? format(parseISO(item.tanggal), "dd/MM/yyyy") : "" }}
              </template>
              <template v-else-if="header.key === 'closing'">
                <v-chip v-if="item.closing === 'Y'" size="x-small" color="success">YA</v-chip>
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container d-flex flex-column ga-4">
                  <div class="detail-table-wrapper">
                    <div class="text-caption font-weight-bold pa-2 bg-grey-lighten-4">
                      ITEM KAOS
                    </div>
                    <v-data-table
                      :headers="detailHeaders"
                      :items="details[item.nomor]?.items"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    />
                  </div>

                  <div
                    v-if="details[item.nomor]?.stickers?.length > 0"
                    class="detail-table-wrapper"
                  >
                    <div class="text-caption font-weight-bold pa-2 bg-amber-lighten-5 text-brown">
                      STIKER TAMBAHAN
                    </div>
                    <v-data-table
                      :headers="detailHeaders"
                      :items="details[item.nomor]?.stickers"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    />
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isPrintDialogVisible" max-width="800px" scrollable>
      <v-card>
        <v-toolbar color="success" density="compact">
          <v-toolbar-title class="text-subtitle-1">Pratinjau Cetak Barcode Baru</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" @click="isPrintDialogVisible = false" variant="text"></v-btn>
        </v-toolbar>

        <v-card-text class="pa-4 bg-grey-lighten-4">
          <div v-if="isPrintLoading" class="text-center py-10">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
            <div class="mt-2 text-caption">Mengambil data Approval...</div>
          </div>

          <div id="print-area-barcode">
            <div
              v-for="(sheet, sheetIndex) in barcodeSheets"
              :key="sheetIndex"
              class="label-pair-container"
            >
              <div v-for="(item, itemIndex) in sheet" :key="itemIndex" class="barcode-label">
                <div class="item-name">{{ item.nama }}</div>
                <div class="item-size">{{ item.ukuran }}</div>

                <svg
                  class="barcode-svg"
                  :id="`barcode-dialog-${sheetIndex}-${itemIndex}`"
                  :data-barcode-value="item.barcode"
                ></svg>

                <div class="label-footer">
                  <span>{{ item.barcode }}</span>
                  <span>{{ format(new Date(), "dd/MM/yy") }}</span>
                  <span class="font-weight-bold">Rp {{ item.harga.toLocaleString("id-ID") }}</span>
                </div>
              </div>
              <div v-if="sheet.length === 1" class="barcode-label" style="visibility: hidden"></div>
            </div>
          </div>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn variant="text" @click="isPrintDialogVisible = false">Tutup</v-btn>
          <v-btn
            color="success"
            prepend-icon="mdi-printer"
            variant="flat"
            :disabled="isPrintLoading || itemsToPrint.length === 0"
            @click="triggerPrint"
          >
            Cetak Ke Printer Label
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* --- Layout Full Height --- */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 12px;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section:deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* --- Tabel Style --- */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* --- Header Resize --- */
.resizable-header {
  position: relative;

  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;

  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;

  border-bottom: 2px solid rgb(var(--v-theme-primary)) !important;
  padding: 0 8px !important;

  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header-content {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
}

.resizable-header.text-center .header-content {
  justify-content: center;
}

.resizable-header.text-end .header-content {
  justify-content: flex-end;
}

.resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 10;
}

.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid rgb(var(--v-theme-on-primary));
}

/* --- Detail Sticky --- */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;

  display: flex;
  justify-content: flex-start;
  align-items: flex-start;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);

  padding: 16px 16px 16px 64px;
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 600px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

.barcode-container-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.label-row-sheet {
  background: white;
  border: 1px dashed #bbb;
  width: 68mm;
  height: 15mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1.5mm;
  box-sizing: border-box;
}

.label-item-box {
  width: 31mm;
  height: 14mm;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  text-align: left;
  overflow: hidden;
  padding-top: 0.5mm;
}

/* Menggunakan Arial Narrow agar identik dengan BarcodeCreateView */
.label-item-name {
  font-family: "Arial Narrow", sans-serif;
  font-size: 6pt;
  font-weight: 700;
  white-space: nowrap;
  width: 100%;
  overflow: hidden;
  color: #000;
}

.label-item-info {
  font-family: Arial, sans-serif;
  font-size: 5pt;
  display: flex;
  gap: 6px;
  margin-bottom: 0.2mm;
  color: #000;
}

.label-item-box svg {
  width: 28mm !important;
  height: 8mm !important;
  /* Gunakan !important untuk memaksa driver printer */
  margin: 0;
  display: block;
}
</style>

<style>
/* Preview di dalam Modal Dialog */
#print-area-barcode {
  background-color: #525659;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.label-pair-container {
  background: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  /* Sifat box shadow ini akan otomatis hilang saat di-iframe-kan untuk print */
}

/* Memastikan elemen SVG bersih saat pratinjau */
.barcode-svg rect {
  fill: #fff !important;
}

.barcode-svg path {
  stroke: #000 !important;
}
</style>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import api from "@/services/api";
import axios from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

// --- INTERFACES ---
interface PriorityItem {
  kode: string;
  nama: string;
  ukuran: string;
  kategori: string;
  img_url: string;
  buffer_dc: number;
  stok_dc: number;
  spk_ready: number;
  spk_beredar: number;
  buffer_store: number;
  stok_store: number;
  gap_store: number;
  daily_need: string;
  cvg_saat_ini: string;
  cvg_setelah_wip: string;
  gap_buffer_dc: number;
  status: string;
  rekomendasi_spk: number;
  ranking_asli: number;
  brg_lengan: string;
  brg_warna: string;
  brg_jeniskain: string;
  [key: string]: unknown;
}

interface EditableItem extends PriorityItem {
  qty_input: number;
  selected: boolean;
  kepentingan: string;
  dateline: string;
  dateline_min: string;
  dateline_max: string;
}

const toast = useToast();

// --- STATE ---
const isLoading = ref(false);
const isGenerating = ref(false);
const rawData = ref<PriorityItem[]>([]);
const tableData = ref<EditableItem[]>([]);
const isInfoDialogOpen = ref(false);
const isConfirmDialogOpen = ref(false);

const planConfig = reactive({
  periodeStart: new Date().toISOString().split("T")[0],
  periodeEnd: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    return d.toISOString().split("T")[0];
  })(),
  targetHarian: 1750,
});

const currentPage = ref(1);
const itemsPerPage = ref(50);
const totalItems = ref(0);
const filters = reactive({
  kategori: "Semua",
  keyword: "",
});
const kategoriOptions = ["Semua", "REGULER", "SESIONAL", "PESANAN"];

const summaryData = reactive({
  totalStokDC: 0,
  skuKritis: 0,
  skuPerhatian: 0,
  skuAman: 0,
});

// --- COMPUTED ---
const totalKapasitas = computed(() => planConfig.targetHarian * 5);
const selectedItems = computed(() => tableData.value.filter((i) => i.selected));
const totalQtyRekomendasi = computed(() =>
  selectedItems.value.reduce((sum, i) => sum + (i.rekomendasi_spk || 0), 0)
);
const totalQtyInput = computed(() =>
  selectedItems.value.reduce((sum, i) => sum + (i.qty_input || 0), 0)
);
const sisaKapasitas = computed(() => totalKapasitas.value - totalQtyInput.value);
const sisaKapasitasPersen = computed(() =>
  totalKapasitas.value > 0 ? Math.round((sisaKapasitas.value / totalKapasitas.value) * 100) : 0
);
const allSelected = computed({
  get: () => tableData.value.length > 0 && tableData.value.every((i) => i.selected),
  set: (val: boolean) => {
    tableData.value.forEach((i) => (i.selected = val));
  },
});
const totalSpkBeredarDisplay = computed(() =>
  tableData.value.reduce((sum, i) => sum + (i.spk_beredar || 0), 0)
);

// --- STATE DETAIL DIALOG ---
const isDetailDialogOpen = ref(false);
const detailItem = ref<EditableItem | null>(null);
const detailTanggalMulai = ref(new Date().toISOString().split("T")[0]);
const detailCatatan = ref("");
const hoverPreviewUrl = ref("");
const kepentinganOptions = ref<string[]>([]);

// --- COMPUTED DETAIL ---
const predictedCoverageAfterSpk = computed(() => {
  if (!detailItem.value) return "0.0";
  const item = detailItem.value;
  const dailyNeed = Number(item.daily_need) || 1;
  const totalSetelahSpk = (item.stok_dc || 0) + (item.spk_ready || 0) + (item.qty_input || 0);
  return (totalSetelahSpk / dailyNeed).toFixed(1);
});

const alasanBadgeText = computed(() => {
  if (!detailItem.value) return "";
  const cvg = Number(detailItem.value.cvg_setelah_wip);
  if (cvg < 7) return "Coverage < 7 Hari";
  if (cvg <= 15) return "Coverage 7–15 Hari";
  return "Coverage Aman";
});

const alasanBadgeColor = computed(() => {
  if (!detailItem.value) return "success";
  const cvg = Number(detailItem.value.cvg_setelah_wip);
  if (cvg < 7) return "error";
  if (cvg <= 15) return "warning";
  return "success";
});

const alasanText = computed(() => {
  if (!detailItem.value) return "";
  const item = detailItem.value;
  return `${item.nama} (Size ${item.ukuran}) memiliki Coverage Setelah WIP ${
    item.cvg_setelah_wip
  } Hari. Stok DC saat ini ${Number(item.stok_dc).toLocaleString(
    "id-ID"
  )} pcs dengan kebutuhan harian ${item.daily_need} pcs. Gap DC tercatat ${Number(
    item.gap_buffer_dc
  ).toLocaleString("id-ID")} pcs setelah dikurangi SPK Beredar sebesar ${Number(
    item.spk_beredar
  ).toLocaleString("id-ID")} pcs, sehingga direkomendasikan pembuatan SPK baru sejumlah ${Number(
    item.rekomendasi_spk
  ).toLocaleString("id-ID")} pcs.`;
});

// --- METHODS DETAIL ---
const openDetail = (item: EditableItem) => {
  detailItem.value = item;
  detailTanggalMulai.value = new Date().toISOString().split("T")[0];
  detailCatatan.value = "";
  isDetailDialogOpen.value = true;
};

const closeDetail = () => {
  isDetailDialogOpen.value = false;
  detailItem.value = null;
};

const confirmFromDetail = () => {
  if (detailItem.value) {
    detailItem.value.selected = true;
  }
  toast.success("SKU dipilih untuk SPK.");
  closeDetail();
};

const rejectFromDetail = () => {
  if (detailItem.value) {
    detailItem.value.selected = false;
  }
  toast.info("Rekomendasi SKU ini ditolak.");
  closeDetail();
};

// --- HEADERS ---
const headers = [
  { title: "", key: "checkbox", width: 44, sortable: false },
  { title: "PRIORITAS", key: "ranking", width: 70, align: "center" as const },
  { title: "INFO SKU", key: "info_sku", minWidth: 220 },
  { title: "COVERAGE WIP (Hari)", key: "cvg_setelah_wip", align: "center" as const, width: 130 },
  { title: "GAP DC (pcs)", key: "gap_buffer_dc", align: "end" as const, width: 100 },
  { title: "SPK BEREDAR (pcs)", key: "spk_beredar", align: "end" as const, width: 120 },
  { title: "QTY REKOMENDASI (pcs)", key: "rekomendasi_spk", align: "end" as const, width: 140 },
  { title: "QTY SPK (INPUT)", key: "qty_input", align: "center" as const, width: 140 },
  { title: "KEPENTINGAN", key: "kepentingan", align: "center" as const, width: 150 }, // ← TAMBAH
  { title: "DATELINE", key: "dateline", align: "center" as const, width: 160 }, // ← TAMBAH
  { title: "AKSI", key: "aksi", align: "center" as const, width: 80, sortable: false },
];

// --- METHODS ---
const getImageUrl = (path: string) => {
  if (!path) return "";
  return `${import.meta.env.VITE_API_BASE_URL || ""}${path}`;
};

const fetchKepentinganOptions = async () => {
  try {
    const res = await api.get("/dc-planning/kepentingan-options");
    kepentinganOptions.value = res.data.data || [];
  } catch {
    toast.error("Gagal memuat daftar kepentingan.");
  }
};

// Ekstrak jo_kode di frontend (untuk kirim ke endpoint dateline-range)
const extractJoKodeFrontend = (kode: string) => {
  const parts = (kode || "").split("-");
  return (parts[0] || "XX").substring(0, 2).toUpperCase();
};

const fetchDatelineRange = async (item: EditableItem) => {
  if (!item.kepentingan) return;
  try {
    const joKode = extractJoKodeFrontend(item.kode);
    const res = await api.get("/dc-planning/dateline-range", {
      params: { kepentingan: item.kepentingan, joKode },
    });
    item.dateline_min = res.data.minDate;
    item.dateline_max = res.data.maxDate;
    // Default ke tanggal paling longgar (max) kalau belum diisi / di luar rentang
    if (!item.dateline || item.dateline < item.dateline_min || item.dateline > item.dateline_max) {
      item.dateline = res.data.maxDate;
    }
  } catch {
    toast.error("Gagal memuat rentang dateline.");
  }
};

const onKepentinganChange = (item: EditableItem) => {
  fetchDatelineRange(item);
};

const getCoverageColor = (val: number | string) => {
  const num = Number(val);
  if (num < 7) return "text-red-darken-2 font-weight-bold";
  if (num <= 15) return "text-orange-darken-2 font-weight-bold";
  return "text-green-darken-2 font-weight-bold";
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/dc-planning/priority", {
      params: { ...filters, page: currentPage.value, itemsPerPage: itemsPerPage.value },
    });

    rawData.value = response.data.data;
    totalItems.value = response.data.summary.totalItems;
    summaryData.totalStokDC = response.data.summary.totalStokDC;
    summaryData.skuKritis = response.data.summary.skuKritis;
    summaryData.skuPerhatian = response.data.summary.skuPerhatian;
    summaryData.skuAman = response.data.summary.skuAman;

    tableData.value = rawData.value.map((item) => ({
      ...item,
      qty_input: item.rekomendasi_spk,
      selected: false,
      kepentingan: "NORMAL", // ← default
      dateline: "",
      dateline_min: "",
      dateline_max: "",
    }));
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal memuat data.");
    }
  } finally {
    isLoading.value = false;
  }
};

const onUpdateOptions = (options: { page: number; itemsPerPage: number }) => {
  currentPage.value = options.page;
  itemsPerPage.value = options.itemsPerPage;
  fetchData();
};

let searchTimeout: ReturnType<typeof setTimeout>;
const onSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage.value = 1;
    fetchData();
  }, 600);
};

const openConfirm = () => {
  if (selectedItems.value.length === 0) {
    toast.warning("Pilih minimal 1 SKU untuk membuat SPK.");
    return;
  }
  isConfirmDialogOpen.value = true;
};

const generateSpk = async () => {
  isConfirmDialogOpen.value = false;
  isGenerating.value = true;
  try {
    const items = selectedItems.value
      .filter((i) => i.qty_input > 0)
      .map((i) => ({
        kode: i.kode,
        ukuran: i.ukuran,
        nama: i.nama,
        rekomendasi_spk: i.qty_input,
        brg_lengan: i.brg_lengan,
        brg_warna: i.brg_warna,
        brg_jeniskain: i.brg_jeniskain,
        kepentingan: i.kepentingan,
        dateline: i.dateline,
      }));

    const response = await api.post("/dc-planning/generate-spk-bulk", { items });
    toast.success(response.data.message);
    fetchData();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal membuat SPK.");
    }
  } finally {
    isGenerating.value = false;
  }
};

const exportExcel = async () => {
  if (selectedItems.value.length === 0) {
    toast.warning("Pilih minimal 1 SKU untuk diekspor.");
    return;
  }
  toast.info("Menyiapkan file export...");
  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Rekomendasi SPK");

    const cols = [
      { header: "Prioritas", key: "ranking_asli", width: 10, align: "center" as const },
      { header: "Kode", key: "kode", width: 20, align: "left" as const },
      { header: "Nama Barang", key: "nama", width: 40, align: "left" as const },
      { header: "Ukuran", key: "ukuran", width: 10, align: "center" as const },
      { header: "Kategori", key: "kategori", width: 14, align: "center" as const },
      { header: "Coverage WIP (Hari)", key: "cvg_setelah_wip", width: 20, align: "right" as const },
      {
        header: "Gap DC (pcs)",
        key: "gap_buffer_dc",
        width: 14,
        align: "right" as const,
        fmt: "#,##0",
      },
      {
        header: "SPK Beredar (pcs)",
        key: "spk_beredar",
        width: 18,
        align: "right" as const,
        fmt: "#,##0",
      },
      {
        header: "Rekomendasi SPK (pcs)",
        key: "rekomendasi_spk",
        width: 20,
        align: "right" as const,
        fmt: "#,##0",
      },
      {
        header: "QTY SPK Input (pcs)",
        key: "qty_input",
        width: 18,
        align: "right" as const,
        fmt: "#,##0",
      },
    ];

    sheet.columns = cols.map((c) => ({ width: c.width }));

    const headerRow = sheet.addRow(cols.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    selectedItems.value.forEach((item) => {
      const row = sheet.addRow(cols.map((c) => item[c.key] ?? ""));
      row.eachCell((cell, colNum) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { horizontal: cols[colNum - 1]?.align ?? "left", vertical: "middle" };
        if (cols[colNum - 1]?.fmt) cell.numFmt = cols[colNum - 1].fmt!;
      });
    });

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RekomendasiSPK_${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export berhasil.");
  } catch {
    toast.error("Gagal mengekspor data.");
  }
};

const showDetailImagePreview = () => {
  if (detailItem.value?.img_url) {
    hoverPreviewUrl.value = getImageUrl(detailItem.value.img_url);
  }
};

onMounted(() => {
  fetchKepentinganOptions();
  fetchData();
});

defineExpose({
  isInfoDialogOpen,
  planConfig,
});
</script>

<template>
  <div class="d-flex flex-column spk-rec-container">
    <!-- ── Filter + Summary (compact) ───────────────────────────── -->
    <div class="filter-bar d-flex align-center flex-shrink-0 mb-2">
      <v-select
        v-model="filters.kategori"
        :items="kategoriOptions"
        density="compact"
        hide-details
        variant="outlined"
        class="fixed-input kategori-input"
        @update:model-value="fetchData"
      />
      <v-text-field
        v-model="filters.keyword"
        placeholder="Cari SKU / Nama / Kode..."
        density="compact"
        hide-details
        variant="outlined"
        clearable
        prepend-inner-icon="mdi-magnify"
        class="keyword-input mx-2"
        @input="onSearchInput"
        @click:clear="
          filters.keyword = '';
          fetchData();
        "
      />

      <v-spacer />

      <div class="summary-block text-right me-3">
        <div class="summary-label">TOTAL SPK YANG BEREDAR</div>
        <div class="summary-value text-blue-darken-2">
          {{ totalSpkBeredarDisplay.toLocaleString("id-ID") }} pcs
        </div>
        <div class="summary-sub">SPK di Cutting + Jahit + QC + Packing</div>
      </div>

      <v-divider vertical class="mx-2" style="height: 32px" />

      <div class="summary-block text-right me-2" style="max-width: 200px">
        <div class="summary-label">INFORMASI</div>
        <div class="summary-sub">
          SPK Ready &lt;5 Hari sudah di GAP DC, tidak termasuk SPK Beredar.
        </div>
      </div>

      <v-btn
        icon="mdi-refresh"
        variant="text"
        size="small"
        color="primary"
        :loading="isLoading"
        @click="fetchData"
      />
    </div>

    <!-- ── Tabel ───────────────────────────────────────────────── -->
    <v-card variant="outlined" class="flex-grow-1 d-flex flex-column bg-white overflow-hidden">
      <AppDataTable
        :server="true"
        :items="tableData"
        :items-length="totalItems"
        :headers="headers"
        :loading="isLoading"
        :item-value="(item: EditableItem) => `${item.kode}_${item.ukuran}`"
        density="compact"
        class="spk-table"
        fixed-header
        hover
        @update:options="onUpdateOptions"
      >
        <template #[`item.checkbox`]="{ item }">
          <v-checkbox v-model="item.selected" density="compact" hide-details color="primary" />
        </template>

        <template #[`item.ranking`]="{ item }">
          <v-avatar
            :color="
              item.status === 'Kritis'
                ? 'error'
                : item.status === 'Perlu Perhatian'
                ? 'warning'
                : 'success'
            "
            size="24"
            class="font-weight-black text-white"
            style="font-size: 10px"
          >
            {{ item.ranking_asli }}
          </v-avatar>
        </template>

        <template #[`item.info_sku`]="{ item }">
          <div class="d-flex align-center py-1">
            <div
              class="thumb-hover-trigger me-2"
              @mouseenter="item.img_url && (hoverPreviewUrl = getImageUrl(item.img_url))"
              @mouseleave="hoverPreviewUrl = ''"
            >
              <v-avatar rounded size="30" color="grey-lighten-3" class="border">
                <v-img v-if="item.img_url" :src="getImageUrl(item.img_url)" cover />
                <v-icon v-else color="grey-lighten-1" size="small">mdi-image-outline</v-icon>
              </v-avatar>
            </div>
            <div>
              <div class="font-weight-bold text-primary sku-text">{{ item.kode }}</div>
              <div class="d-flex align-center ga-1">
                <span class="text-grey-darken-3 sku-text" :title="item.nama">{{ item.nama }}</span>
                <v-avatar size="16" color="blue-grey-darken-1" class="ukuran-chip">
                  <span class="text-white font-weight-bold">{{ item.ukuran }}</span>
                </v-avatar>
              </div>
              <div class="text-grey" style="font-size: 9px">{{ item.kategori }}</div>
            </div>
          </div>
        </template>

        <template #[`item.cvg_setelah_wip`]="{ item }">
          <span :class="getCoverageColor(item.cvg_setelah_wip)"
            >{{ item.cvg_setelah_wip }} Hari</span
          >
        </template>

        <template #[`item.gap_buffer_dc`]="{ item }">
          <span class="font-weight-bold text-blue-darken-2">{{
            Number(item.gap_buffer_dc).toLocaleString("id-ID")
          }}</span>
        </template>

        <template #[`item.spk_beredar`]="{ item }">
          <span class="text-grey-darken-2">{{
            Number(item.spk_beredar).toLocaleString("id-ID")
          }}</span>
        </template>

        <template #[`item.rekomendasi_spk`]="{ item }">
          <span class="font-weight-black text-primary">{{
            Number(item.rekomendasi_spk).toLocaleString("id-ID")
          }}</span>
        </template>

        <template #[`item.qty_input`]="{ item }">
          <div class="d-flex align-center justify-center">
            <v-text-field
              v-model.number="item.qty_input"
              type="number"
              density="compact"
              hide-details
              variant="outlined"
              style="width: 85px"
              min="0"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <span class="text-grey ms-1" style="font-size: 10px">pcs</span>
          </div>
        </template>

        <template #[`item.kepentingan`]="{ item }">
          <v-select
            v-model="item.kepentingan"
            :items="kepentinganOptions"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 130px; font-size: 11px"
            @update:model-value="onKepentinganChange(item)"
          />
        </template>

        <template #[`item.dateline`]="{ item }">
          <v-text-field
            v-model="item.dateline"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 140px"
            :min="item.dateline_min"
            :max="item.dateline_max"
          />
          <div
            v-if="item.dateline_min && item.dateline_max"
            class="text-grey"
            style="font-size: 9px"
          >
            {{ item.dateline_min }} s/d {{ item.dateline_max }}
          </div>
        </template>

        <template #[`item.aksi`]="{ item }">
          <v-btn
            size="x-small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-eye-outline"
            @click="openDetail(item)"
          >
            Detail
          </v-btn>
        </template>
      </AppDataTable>
    </v-card>

    <!-- ── Footer Sticky (compact) ───────────────────────────── -->
    <div class="spk-footer d-flex align-center flex-shrink-0">
      <v-checkbox
        v-model="allSelected"
        label="Pilih semua SKU"
        density="compact"
        hide-details
        color="primary"
        class="me-3 footer-check"
      />
      <v-btn
        size="small"
        variant="tonal"
        color="teal"
        prepend-icon="mdi-download"
        @click="exportExcel"
        class="me-3"
      >
        Export Excel
      </v-btn>

      <v-divider vertical class="mx-2" style="height: 32px" />

      <div class="footer-stat me-3">
        <div class="footer-stat-label">QTY REKOMENDASI (TERPILIH)</div>
        <div class="footer-stat-value text-blue-darken-2">
          {{ totalQtyRekomendasi.toLocaleString("id-ID") }} pcs
        </div>
      </div>
      <div class="footer-stat me-3">
        <div class="footer-stat-label">QTY SPK INPUT (TERPILIH)</div>
        <div class="footer-stat-value text-primary">
          {{ totalQtyInput.toLocaleString("id-ID") }} pcs
        </div>
      </div>
      <div class="footer-stat me-3">
        <div class="footer-stat-label">TOTAL KAPASITAS 5 HK</div>
        <div class="footer-stat-value text-grey-darken-3">
          {{ totalKapasitas.toLocaleString("id-ID") }} pcs
        </div>
      </div>
      <div class="footer-stat me-3">
        <div class="footer-stat-label">SISA KAPASITAS</div>
        <div class="footer-stat-value" :class="sisaKapasitas < 0 ? 'text-error' : 'text-success'">
          {{ sisaKapasitas.toLocaleString("id-ID") }} pcs ({{ sisaKapasitasPersen }}%)
        </div>
      </div>

      <v-spacer />

      <v-btn
        color="primary"
        variant="flat"
        size="small"
        prepend-icon="mdi-cog-refresh"
        :loading="isGenerating"
        @click="openConfirm"
        class="font-weight-bold"
      >
        Generata SPK 5 Hari Kerja Ini
      </v-btn>
    </div>

    <!-- ── Dialog Info: Kriteria, Rumus, Plan & Definisi ────────── -->
    <v-dialog v-model="isInfoDialogOpen" max-width="900">
      <v-card>
        <v-toolbar color="primary" density="compact">
          <v-toolbar-title class="text-subtitle-2 font-weight-bold">
            Kriteria, Rumus & Plan Rekomendasi SPK
          </v-toolbar-title>
          <v-btn icon="mdi-close" @click="isInfoDialogOpen = false" />
        </v-toolbar>
        <v-card-text class="pa-4 bg-grey-lighten-4">
          <div class="d-flex justify-end align-center mb-3">
            <span class="header-label me-2">Target Produksi per Hari (5 Hari Kerja)</span>
            <v-chip color="success" variant="flat" size="small" class="font-weight-black">
              {{ planConfig.targetHarian.toLocaleString("id-ID") }} pcs
            </v-chip>
          </div>

          <v-row dense>
            <v-col cols="12" md="4">
              <div class="info-card bg-blue-lighten-5 border-blue">
                <div class="info-title text-blue-darken-3">KRITERIA REKOMENDASI SPK</div>
                <div class="info-text text-grey-darken-2">SKU diurutkan berdasarkan prioritas:</div>
                <ol class="info-list ps-4 text-grey-darken-3">
                  <li>Coverage setelah WIP datang (terendah)</li>
                  <li>Gap Buffer DC (tertinggi)</li>
                </ol>
              </div>
            </v-col>

            <v-col cols="12" md="4">
              <div class="info-card bg-amber-lighten-5 border-amber">
                <div class="info-title text-amber-darken-4">RUMUS PENTING</div>
                <div class="info-text font-weight-bold text-grey-darken-3">
                  Qty Rekomendasi SPK = GAP DC − SPK BEREDAR
                </div>
                <ul class="info-list ps-4 text-grey-darken-2">
                  <li>
                    <strong>GAP DC</strong> = (Buffer DC + Gap Store) − (Stok DC + SPK Ready &lt;5
                    Hari)
                  </li>
                  <li>
                    <strong>SPK BEREDAR</strong> = SPK belum masuk Jahit ke Lipat
                    (Cutting/Jahit/QC/Packing)
                  </li>
                </ul>
                <div class="info-note">
                  <v-icon size="12" color="blue-darken-2">mdi-information</v-icon>
                  SPK Ready &lt;5 Hari tidak termasuk SPK Beredar.
                </div>
              </div>
            </v-col>

            <v-col cols="12" md="4">
              <div class="info-card">
                <div class="info-title text-grey-darken-3">PLAN SPK (PER 5 HARI KERJA)</div>
                <div class="plan-row">
                  <span class="text-grey-darken-1">Periode Plan SPK</span>
                  <span class="font-weight-medium"
                    >{{ planConfig.periodeStart }} – {{ planConfig.periodeEnd }}</span
                  >
                </div>
                <div class="plan-row">
                  <span class="text-grey-darken-1">Target per Hari (5 HK)</span>
                  <span class="font-weight-bold"
                    >{{ planConfig.targetHarian.toLocaleString("id-ID") }} pcs</span
                  >
                </div>
                <div class="plan-row">
                  <span class="text-grey-darken-1">Total Kapasitas 5 HK</span>
                  <span class="font-weight-black text-primary">
                    {{ totalKapasitas.toLocaleString("id-ID") }} pcs
                    <span class="text-grey" style="font-weight: 400"
                      >({{ planConfig.targetHarian.toLocaleString("id-ID") }} × 5)</span
                    >
                  </span>
                </div>
                <div class="info-note mt-1">
                  <v-icon size="12" color="blue-darken-2">mdi-clock-outline</v-icon>
                  Periode 5 hari kerja (Senin–Jumat).
                </div>
              </div>
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <v-row dense>
            <v-col cols="12" md="6">
              <v-card variant="flat" class="pa-3 border h-100 bg-white">
                <div class="text-caption font-weight-bold mb-2">DEFINISI KOLOM</div>
                <ul class="info-list ps-4">
                  <li>
                    <strong>Gap DC:</strong> (Buffer DC + Gap Store) − (Stok DC + SPK Ready &lt;5
                    Hari)
                  </li>
                  <li>
                    <strong>SPK Beredar:</strong> SPK aktif belum masuk proses Jahit ke Lipat
                    (Cutting/Jahit/QC/Packing)
                  </li>
                  <li>
                    <strong>SPK Ready &lt;5 Hari:</strong> WIP sudah masuk STBJ, siap masuk DC dalam
                    ≤5 hari
                  </li>
                  <li><strong>Qty Rekomendasi:</strong> Gap DC − SPK Beredar (minimal 0)</li>
                </ul>
              </v-card>
            </v-col>
            <v-col cols="12" md="6">
              <v-card variant="flat" class="pa-3 border h-100 bg-white">
                <div class="text-caption font-weight-bold mb-2">RUMUS COVERAGE</div>
                <ul class="info-list ps-4">
                  <li><strong>Coverage Setelah WIP:</strong> (Stok DC + SPK Ready) / Daily Need</li>
                  <li><strong>Daily Need:</strong> Gap Store / 30</li>
                  <li><strong>Status Kritis:</strong> Coverage &lt; 7 Hari</li>
                  <li><strong>Status Perhatian:</strong> 7–15 Hari</li>
                  <li><strong>Status Aman:</strong> &gt; 15 Hari</li>
                </ul>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- ── Dialog Konfirmasi Generate ─────────────────────────── -->
    <v-dialog v-model="isConfirmDialogOpen" max-width="440" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold pa-4">
          <v-icon color="primary" size="small" class="me-2">mdi-cog-refresh</v-icon>
          Konfirmasi Generate SPK
        </v-card-title>
        <v-card-text class="px-4 pb-2">
          <v-alert type="info" variant="tonal" density="compact" class="mb-3 text-caption">
            SPK akan dibuat otomatis berdasarkan jumlah yang diinput.
          </v-alert>
          <v-row dense class="text-caption">
            <v-col cols="7" class="text-grey-darken-1">SKU Terpilih</v-col>
            <v-col cols="5" class="font-weight-bold text-right"
              >{{ selectedItems.length }} SKU</v-col
            >
            <v-col cols="7" class="text-grey-darken-1">Total QTY SPK (Input)</v-col>
            <v-col cols="5" class="font-weight-bold text-right text-primary"
              >{{ totalQtyInput.toLocaleString("id-ID") }} pcs</v-col
            >
            <v-col cols="7" class="text-grey-darken-1">Sisa Kapasitas Setelah Generate</v-col>
            <v-col
              cols="5"
              class="font-weight-bold text-right"
              :class="sisaKapasitas < 0 ? 'text-error' : 'text-success'"
            >
              {{ sisaKapasitas.toLocaleString("id-ID") }} pcs
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-spacer />
          <v-btn
            variant="text"
            color="grey-darken-1"
            size="small"
            @click="isConfirmDialogOpen = false"
            >Batal</v-btn
          >
          <v-btn
            color="primary"
            variant="flat"
            size="small"
            :loading="isGenerating"
            @click="generateSpk"
            >Ya, Buat SPK Sekarang</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Dialog Detail Rekomendasi SPK ─────────────────────────── -->
    <v-dialog v-model="isDetailDialogOpen" max-width="640" persistent>
      <v-card v-if="detailItem">
        <v-toolbar color="primary" density="compact" style="height: auto !important">
          <v-toolbar-title class="text-subtitle-2 font-weight-bold py-2" style="line-height: 1.4">
            <div style="font-size: 11px; opacity: 0.85; font-weight: 500">
              Tinjau Rekomendasi SPK:
            </div>
            <div class="text-wrap">{{ detailItem.kode }} - {{ detailItem.nama }}</div>
          </v-toolbar-title>
          <v-btn icon="mdi-close" class="align-self-start mt-1" @click="closeDetail" />
        </v-toolbar>

        <v-card-text class="pa-4">
          <v-row dense>
            <!-- Kolom Kiri: Gambar & Info -->
            <v-col cols="12" md="4" class="text-center">
              <div
                class="thumb-hover-trigger d-inline-block mb-2"
                @mouseenter="showDetailImagePreview"
                @mouseleave="hoverPreviewUrl = ''"
              >
                <v-avatar rounded size="120" color="grey-lighten-3" class="border">
                  <v-img v-if="detailItem.img_url" :src="getImageUrl(detailItem.img_url)" cover />
                  <v-icon v-else color="grey-lighten-1" size="40">mdi-image-outline</v-icon>
                </v-avatar>
              </div>
              <div class="font-weight-bold" style="font-size: 12px">{{ detailItem.nama }}</div>
              <div class="text-grey" style="font-size: 11px">
                {{ detailItem.kode }} · {{ detailItem.ukuran }}
              </div>
              <v-chip size="x-small" class="mt-1" color="blue-grey" variant="tonal">{{
                detailItem.kategori
              }}</v-chip>
            </v-col>

            <!-- Kolom Kanan: Ringkasan & Analisis -->
            <v-col cols="12" md="8">
              <div class="detail-section-title">RINGKASAN RENCANA</div>
              <v-row dense class="mb-2">
                <v-col cols="6">
                  <div class="ringkasan-box bg-green-lighten-5 border-green">
                    <v-icon color="green-darken-2" size="18" class="mb-1"
                      >mdi-package-variant</v-icon
                    >
                    <div class="ringkasan-label">Jumlah Pcs Direkomendasikan</div>
                    <div class="ringkasan-value text-green-darken-3">
                      {{ Number(detailItem.rekomendasi_spk).toLocaleString("id-ID") }} Pcs
                    </div>
                  </div>
                </v-col>
                <v-col cols="6">
                  <div class="ringkasan-box bg-blue-lighten-5 border-blue">
                    <v-icon color="blue-darken-2" size="18" class="mb-1">mdi-chart-line</v-icon>
                    <div class="ringkasan-label">Prediksi Coverage Setelah SPK</div>
                    <div class="ringkasan-value text-blue-darken-3">
                      {{ predictedCoverageAfterSpk }} Hari
                    </div>
                  </div>
                </v-col>
              </v-row>

              <div class="detail-section-title">ANALISIS ALASAN</div>
              <v-chip
                size="x-small"
                :color="alasanBadgeColor"
                variant="flat"
                class="font-weight-bold mb-2"
              >
                {{ alasanBadgeText }}
              </v-chip>
              <div class="alasan-text">{{ alasanText }}</div>
            </v-col>
          </v-row>

          <v-divider class="my-3" />

          <!-- Konfigurasi SPK (simple, 1 baris) -->
          <div class="detail-section-title mb-2">KONFIGURASI SPK</div>
          <v-row dense>
            <v-col cols="4">
              <v-text-field
                v-model="detailTanggalMulai"
                type="date"
                label="Tanggal Mulai Produksi"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                v-model.number="detailItem.qty_input"
                type="number"
                label="Jumlah Pcs"
                density="compact"
                variant="outlined"
                hide-details
                min="0"
                @focus="($event.target as HTMLInputElement).select()"
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                v-model="detailCatatan"
                label="Catatan Peninjau (opsional)"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>
          </v-row>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-3">
          <v-btn variant="text" size="small" color="grey-darken-1" @click="closeDetail"
            >Simpan Draf</v-btn
          >
          <v-btn variant="outlined" size="small" color="grey-darken-1" @click="closeDetail"
            >Batal</v-btn
          >
          <v-spacer />
          <v-btn variant="tonal" size="small" color="error" @click="rejectFromDetail"
            >Tolak Rekomendasi</v-btn
          >
          <v-btn variant="flat" size="small" color="success" @click="confirmFromDetail">
            Konfirmasi SPK ({{ Number(detailItem.qty_input).toLocaleString("id-ID") }} Pcs)
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>

  <!-- ── Fullscreen Image Preview Overlay ─────────────────────── -->
  <Transition name="fade-zoom">
    <div v-if="hoverPreviewUrl" class="img-preview-overlay">
      <img :src="hoverPreviewUrl" alt="Preview" />
    </div>
  </Transition>
</template>

<style scoped>
.spk-rec-container {
  height: calc(100vh - 120px);
  min-height: 0;
}

/* Header label (dipakai di dalam dialog) */
.header-label {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.6);
}

/* Info Cards (dipakai di dalam dialog) */
.info-card {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  padding: 8px 10px;
  height: 100%;
  font-size: 11px;
}
.info-title {
  font-size: 11px;
  font-weight: 800;
  margin-bottom: 4px;
}
.info-text {
  font-size: 11px;
  margin-bottom: 2px;
}
.info-list {
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
}
.info-note {
  font-size: 10px;
  color: #1565c0;
  background: #e3f2fd;
  border-radius: 4px;
  padding: 4px 6px;
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.plan-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 3px;
  gap: 8px;
}

.border-blue {
  border-color: #1565c0 !important;
}
.border-amber {
  border-color: #f57f17 !important;
}

/* Filter bar */
.filter-bar {
  padding: 6px 8px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  gap: 4px;
}
.filter-bar :deep(.v-field__input),
.filter-bar :deep(.v-label) {
  font-size: 11px !important;
}
.kategori-input {
  width: 160px;
  flex: 0 0 auto;
}
.keyword-input {
  max-width: 280px;
  flex: 0 0 auto;
}

.summary-block {
  line-height: 1.3;
}
.summary-label {
  font-size: 9px;
  font-weight: 800;
  color: rgba(0, 0, 0, 0.6);
}
.summary-value {
  font-size: 13px;
  font-weight: 900;
}
.summary-sub {
  font-size: 9px;
  color: rgba(0, 0, 0, 0.5);
}

/* Table */
.spk-table {
  display: flex !important;
  flex-direction: column !important;
  flex-grow: 1;
  min-height: 0 !important;
}
.spk-table :deep(.v-data-table) {
  display: flex !important;
  flex-direction: column !important;
  flex-grow: 1;
  min-height: 0 !important;
}
.spk-table :deep(.v-data-table-footer) {
  position: sticky;
  bottom: 0;
  z-index: 5;
  background: #fff;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}
.spk-table :deep(.v-table__wrapper) {
  flex: 1 1 auto !important;
  overflow-y: auto !important;
}
.spk-table :deep(th) {
  font-size: 10px !important;
  font-weight: 800 !important;
  background-color: #f5f5f5 !important;
  text-transform: uppercase;
  white-space: nowrap;
}
.spk-table :deep(td) {
  font-size: 11px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}
.spk-table :deep(.v-field__input) {
  font-size: 11px !important;
}
.sku-text {
  font-size: 11px;
}

.ukuran-chip {
  font-size: 9px;
  flex-shrink: 0;
}
.ukuran-chip span {
  font-size: 9px;
}

/* Footer */
.spk-footer {
  position: sticky;
  bottom: 0;
  z-index: 6;
  background-color: #fafafa;
}
.footer-check :deep(.v-label) {
  font-size: 11px !important;
}
.footer-stat {
  text-align: center;
  line-height: 1.3;
}
.footer-stat-label {
  font-size: 9px;
  font-weight: 800;
  color: rgba(0, 0, 0, 0.6);
  text-transform: uppercase;
}
.footer-stat-value {
  font-size: 13px;
  font-weight: 900;
}

/* Detail Dialog */
.detail-section-title {
  font-size: 11px;
  font-weight: 800;
  color: rgba(0, 0, 0, 0.6);
  letter-spacing: 0.3px;
  margin-bottom: 6px;
}
.ringkasan-box {
  border: 1px solid;
  border-radius: 8px;
  padding: 10px;
  text-align: center;
}
.ringkasan-label {
  font-size: 10px;
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 2px;
}
.ringkasan-value {
  font-size: 16px;
  font-weight: 900;
}
.alasan-text {
  font-size: 11px;
  line-height: 1.6;
  color: rgba(0, 0, 0, 0.75);
}
.border-green {
  border-color: #2e7d32 !important;
}

/* Fix title dialog terpotong */
.spk-table :deep(.v-toolbar-title),
:deep(.v-dialog .v-toolbar-title) {
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important;
  line-height: 1.3;
  padding: 8px 0;
}
.thumb-hover-trigger {
  cursor: zoom-in;
}

.img-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  pointer-events: none;
}
.img-preview-overlay img {
  max-width: 80vw;
  max-height: 80vh;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  object-fit: contain;
}

.fade-zoom-enter-active {
  transition: opacity 0.2s ease;
}
.fade-zoom-enter-active img {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fade-zoom-leave-active {
  transition: opacity 0.15s ease;
}
.fade-zoom-enter-from {
  opacity: 0;
}
.fade-zoom-enter-from img {
  transform: scale(0.7);
}
.fade-zoom-leave-to {
  opacity: 0;
}
</style>

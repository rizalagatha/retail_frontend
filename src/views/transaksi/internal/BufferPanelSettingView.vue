<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useToast } from "vue-toastification";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useAuthStore } from "@/stores/authStore";
import AppDataTable from "@/components/AppDataTable.vue";
import type { AxiosError } from "axios";
import ExcelJS from "exceljs";

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

interface BufferItem {
  kode: string;
  nama: string;
  ukuran: string;
  kategori: "reg";
  avg_per_bulan: number;
  sales_kategori: "small" | "medium" | "large" | "xlarge" | null;
  is_pareto: boolean;
  pareto_group: "pendek" | "panjang" | "polo" | null;
  data_source: "pareto" | "pareto_small" | "toko_baru" | "tahun_lalu" | "fallback_5bln";
  buffer: number;
  min: number;
  max: number;
  rop: number;
  real_stok: number;
  spk_beredar?: number;
}

interface SesionalItem {
  kode: string;
  nama: string;
  sales_kategori: "small" | "medium" | "large" | "xlarge" | null;
}

interface StokCabangItem {
  kode_cabang: string;
  nama_cabang: string;
  stok: number;
}

interface SpkDetail {
  spk_nomor: string;
  spk_nama: string;
  spkd_qtyorder: number;
  spk_tanggal: string;
  spk_dateline: string;
}

const toast = useToast();
const authStore = useAuthStore();

// --- STATE CABANG ---
interface CabangList {
  kode: string;
  nama: string;
}
const cabangList = ref<CabangList[]>([]);
const selectedCabang = ref(authStore.user?.cabang || "");
const periodeOptions = ref<string[]>([]);
const selectedPeriode = ref<string | null>(null); // null = mode Live
const isExportingAll = ref(false);

// --- STATE SETTING (Parameter) ---
const isSettingOpen = ref(false);
const isInfoOpen = ref(false);
const isConfigSaving = ref(false);

const settings = ref({
  leadTime: 7,
  threshold: 20,
  weightTerkini: 65,
  sfReg: 1.5,
  alReg: 10,
  sfSea: 2.0,
  alSea: 20,
  sfOrd: 1.0,
  alOrd: 5,
});

// --- STATE FILTER & PAGINATION ---
const searchInput = ref(""); // Teks yang sedang diketik user di UI
const debouncedSearch = ref(""); // Teks yang akan dipakai untuk komputasi filter
let searchTimeout: ReturnType<typeof setTimeout>;

// Watcher untuk menunda kalkulasi sampai user berhenti mengetik (350ms)
watch(searchInput, (newVal) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    debouncedSearch.value = newVal;
    page.value = 1; // ← tambahkan ini
  }, 350);
});

const filterSize = ref("Semua");
const filterGrp = ref("Semua");
const page = ref(1);
const itemsPerPage = ref(50);

const filterSalesKtg = ref("Semua"); // small/medium/large/xlarge/Semua
const filterPareto = ref("Semua"); // Pareto/NonPareto/Semua

const tableContainerRef = ref<HTMLElement | null>(null);

// --- STATE DATA ---
const isLoading = ref(false);
const isSaving = ref(false);
const rawData = ref<BufferItem[]>([]);
const selected = ref<BufferItem[]>([]); // Untuk checkbox jika diperlukan

// --- LOGIC RESIZE COLUMN ---
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

// const glosarium = [
//   { s: "AVG", d: "Average — Rata-rata penjualan harian" },
//   { s: "AVG F.", d: "Average Final — Avg yang sudah dikalibrasi dengan metode MAX atau WA" },
//   {
//     s: "WA",
//     d: "Weighted Average — Metode rata-rata berbobot: menggabungkan Avg Terkini dan Avg Tahun Lalu sesuai porsi bobot yang diatur",
//   },
//   {
//     s: "MAX",
//     d: "Metode ambil nilai tertinggi antara Avg Terkini vs Avg Tahun Lalu, dipakai saat selisih keduanya masih dalam batas threshold (stabil)",
//   },
//   { s: "DMD", d: "Demand — Perkiraan kebutuhan stok toko selama Lead Time: AVG Final × Lead Time" },
//   { s: "BUF", d: "Buffer / Safety Stock — Cadangan pengaman: AVG Final × Safety Factor" },
//   { s: "ALW", d: "Allowance — Bantalan ekstra antisipasi lonjakan mendadak: Demand × % Allowance" },
//   { s: "MIN", d: "Stok Minimum — Batas bawah kritis persediaan toko: Demand + Buffer + Allowance" },
//   { s: "MAX", d: "Stok Maksimum — Kapasitas optimal rak/gudang toko: Stok MIN + Demand" },
//   {
//     s: "ROP",
//     d: "Reorder Point — Titik alarm restock: Demand + Buffer. Jika stok fisik ≤ ROP, segera ajukan pasokan ulang ke pusat",
//   },
//   { s: "SF", d: "Safety Factor — Pengali cadangan per kategori produk (Reguler/Sesional/Pesanan)" },
//   {
//     s: "LT",
//     d: "Lead Time — Target jumlah hari toko harus mampu bertahan tanpa pasokan baru dari pusat",
//   },
//   { s: "SKU", d: "Stock Keeping Unit — Kode unik per barang per ukuran" },
//   {
//     s: "THN LALU",
//     d: "Data penjualan periode musiman yang sama di tahun sebelumnya, digunakan untuk mendeteksi tren musiman",
//   },
// ];

// --- STOK PER CABANG ---
const isStokCabangDialogVisible = ref(false);
const selectedItemStokCabang = ref<BufferItem | null>(null);
const stokPerCabang = ref<StokCabangItem[]>([]);
const isLoadingStokCabang = ref(false);

const isSesionalDialogOpen = ref(false);
const isExporting = ref(false);
const sesionalItems = ref<SesionalItem[]>([]);
const isSavingSesional = ref(false);

const sesionalPage = ref(1);
const sesionalItemsPerPage = ref(20);
const sesionalSearch = ref("");

const filteredSesionalItems = computed(() => {
  const q = sesionalSearch.value.trim().toLowerCase();
  if (!q) return sesionalItems.value;
  return sesionalItems.value.filter(
    (i) => i.nama.toLowerCase().includes(q) || i.kode.toLowerCase().includes(q)
  );
});

const paginatedSesionalItems = computed(() => {
  const start = (sesionalPage.value - 1) * sesionalItemsPerPage.value;
  return filteredSesionalItems.value.slice(start, start + sesionalItemsPerPage.value);
});

const sesionalTotalPages = computed(() =>
  Math.ceil(filteredSesionalItems.value.length / sesionalItemsPerPage.value)
);

watch(sesionalSearch, () => {
  sesionalPage.value = 1;
});

const kategoriOptions = [
  { title: "Small", value: "small" },
  { title: "Medium", value: "medium" },
  { title: "Large", value: "large" },
  { title: "X Large", value: "xlarge" },
];

// --- DETAIL SPK PER SIZE ---
// State
const isSpkDetailOpen = ref(false);
const detailSpkList = ref<SpkDetail[]>([]);
const selectedItemSpk = ref<BufferItem | null>(null);

// Fungsi buka dialog
const openDetailSpk = async (item: BufferItem) => {
  selectedItemSpk.value = item;
  isSpkDetailOpen.value = true;
  try {
    const res = await api.get("/buffer-panel/detail-spk", {
      params: { kode: item.kode, ukuran: item.ukuran },
    });
    detailSpkList.value = res.data;
  } catch {
    toast.error("Gagal memuat detail SPK.");
  }
};

// --- ANOMALI ---
const anomaliFilter = ref<number | null>(null); // null = off, 4 = 4x, 3 = 3x, dst

const anomaliOptions = [
  { title: "Semua (tanpa filter)", value: null },
  { title: "Kecualikan lonjakan ≥ 4x", value: 4 },
  { title: "Kecualikan lonjakan ≥ 3x", value: 3 },
  { title: "Kecualikan lonjakan ≥ 2x", value: 2 },
];

// --- FETCH & SAVE CONFIG CABANG ---
const fetchConfig = async () => {
  try {
    const res = await api.get("/buffer-panel/config", {
      params: { cabang: selectedCabang.value },
    });
    if (res.data) {
      settings.value = {
        leadTime: res.data.bfc_lead_time ?? 7,
        threshold: res.data.bfc_threshold ?? 20,
        weightTerkini: res.data.bfc_weight_terkini ?? 65,
        sfReg: Number(res.data.bfc_sf_reg) || 1.5,
        alReg: res.data.bfc_al_reg ?? 10,
        sfSea: Number(res.data.bfc_sf_sea) || 2.0,
        alSea: res.data.bfc_al_sea ?? 20,
        sfOrd: Number(res.data.bfc_sf_ord) || 1.0,
        alOrd: res.data.bfc_al_ord ?? 5,
      };
    }
  } catch (error) {
    console.error("Gagal load config cabang", error);
  }
};

const fetchPeriodeOptions = async () => {
  try {
    const res = await api.get("/buffer-panel/periode-options");
    periodeOptions.value = res.data;
  } catch {
    toast.error("Gagal memuat daftar periode.");
  }
};

const saveBranchConfig = async () => {
  isConfigSaving.value = true;
  try {
    await api.post("/buffer-panel/config", {
      cabang: selectedCabang.value,
      ...settings.value,
    });
    toast.success("Parameter/Resep Cabang berhasil disimpan.");
    isSettingOpen.value = false;
  } catch {
    toast.error("Gagal menyimpan parameter cabang.");
  } finally {
    isConfigSaving.value = false;
  }
};

// --- FETCH CABANG & DATA PREVIEW ---
const fetchCabangList = async () => {
  try {
    // [UBAH] Arahkan ke endpoint yang baru kita buat
    const response = await api.get("/buffer-panel/cabang");
    cabangList.value = response.data;

    if (authStore.user?.cabang !== "KDC" && cabangList.value.length > 0) {
      selectedCabang.value = authStore.user?.cabang || "";
    } else if (authStore.user?.cabang === "KDC" && cabangList.value.length > 0) {
      selectedCabang.value = "KDC";
    }
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchPreviewData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/buffer-panel/preview", {
      params: { cabang: selectedCabang.value, periode: selectedPeriode.value },
    });
    rawData.value = response.data;
  } catch {
    toast.error("Gagal memuat data preview dari server.");
  } finally {
    isLoading.value = false;
  }
};

// --- FETCH STOK PER CABANG ---
const openStokCabang = async (item: BufferItem) => {
  selectedItemStokCabang.value = item;
  isStokCabangDialogVisible.value = true;
  isLoadingStokCabang.value = true;
  stokPerCabang.value = [];
  try {
    const res = await api.get("/buffer-panel/stok-per-cabang", {
      params: { kode: item.kode, ukuran: item.ukuran },
    });
    stokPerCabang.value = res.data;
  } catch {
    toast.error("Gagal memuat stok per cabang.");
  } finally {
    isLoadingStokCabang.value = false;
  }
};

// Fetch barang sesional dari backend
const fetchSesionalItems = async () => {
  try {
    const res = await api.get("/buffer-panel/sesional", {
      params: { cabang: selectedCabang.value },
    });
    sesionalItems.value = res.data;
  } catch {
    toast.error("Gagal memuat barang sesional.");
  }
};

const saveSesional = async () => {
  // Filter hanya yang sudah dipilih
  const toSave = sesionalItems.value.filter((i) => i.sales_kategori !== null);

  if (toSave.length === 0) {
    return toast.warning("Belum ada barang yang di-set kategorinya.");
  }

  isSavingSesional.value = true;
  try {
    await api.post("/buffer-panel/sesional", {
      cabang: selectedCabang.value,
      items: toSave,
    });
    toast.success(`${toSave.length} barang sesional berhasil disimpan.`);
    isSesionalDialogOpen.value = false;
  } catch {
    toast.error("Gagal menyimpan kategori sesional.");
  } finally {
    isSavingSesional.value = false;
  }
};

// --- LOGIKA KALKULASI OTOMATIS ---
const sizeOrder: Record<string, number> = {
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
  "2XL": 5,
  "3XL": 6,
  "4XL": 7,
  "5XL": 8,
};

const processedData = computed(() => {
  return [...rawData.value].sort((a, b) => {
    // 1. Urutkan berdasarkan Nama Barang (A-Z)
    if (a.nama < b.nama) return -1;
    if (a.nama > b.nama) return 1;

    // 2. Jika Namanya sama, urutkan berdasarkan urutan Size yang logis
    const orderA = sizeOrder[a.ukuran] || 99; // 99 untuk size tak dikenal
    const orderB = sizeOrder[b.ukuran] || 99;

    return orderA - orderB;
  });
});

// --- FILTERING UNTUK TABEL ---
const filteredData = computed(() => {
  const q = debouncedSearch.value.trim().toLowerCase();

  return processedData.value.filter((p) => {
    const matchSize = filterSize.value === "Semua" || p.ukuran === filterSize.value;
    const matchGrp = filterGrp.value === "Semua" || p.kategori === filterGrp.value;

    // Filter kategori sales
    const matchSalesKtg =
      filterSalesKtg.value === "Semua" ||
      (filterSalesKtg.value === "pareto" ? p.is_pareto : p.sales_kategori === filterSalesKtg.value);

    // Filter pareto
    const matchPareto =
      filterPareto.value === "Semua"
        ? true
        : filterPareto.value === "pareto"
        ? p.is_pareto
        : !p.is_pareto;

    if (!matchSize || !matchGrp || !matchSalesKtg || !matchPareto) return false;

    if (!q) return true;
    return (
      String(p.nama || "")
        .toLowerCase()
        .includes(q) ||
      String(p.kode || "")
        .toLowerCase()
        .includes(q)
    );
  });
});

const paginatedData = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  return filteredData.value.slice(start, end);
});

// --- TOTALS ---
const totals = computed(() => {
  return filteredData.value.reduce(
    (acc, p) => {
      acc.avg += Number(p.avg_per_bulan) || 0;
      acc.buf += Number(p.buffer) || 0;
      acc.min += Number(p.min) || 0;
      acc.max += Number(p.max) || 0;
      acc.rop += Number(p.rop) || 0;
      acc.real += Number(p.real_stok) || 0;
      acc.spk += Number(p.spk_beredar) || 0;
      return acc;
    },
    { avg: 0, buf: 0, min: 0, max: 0, rop: 0, real: 0, spk: 0 }
  );
});

const isVirtualCabang = computed(
  () => selectedCabang.value === "KPR" || selectedCabang.value === "TOKO_BARU"
);
const isHistoricalMode = computed(() => !!selectedPeriode.value);

// --- SAVE FINAL KE DATABASE TOKO ---
const saveFinalBuffer = async () => {
  if (filteredData.value.length === 0) return toast.warning("Tidak ada data untuk disimpan.");

  isSaving.value = true;
  try {
    const payload = filteredData.value.map((p) => ({
      kode: p.kode,
      ukuran: p.ukuran,
      min: p.min,
      max: p.max,
    }));

    const response = await api.post("/buffer-panel/save", {
      cabang: selectedCabang.value,
      items: payload,
    });
    toast.success(response.data?.message || "Buffer berhasil diterapkan ke database Toko!");

    // --> Tambahkan ini agar layar refresh dengan nilai buffer yang baru diupdate
    await fetchPreviewData();
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menerapkan buffer.");
  } finally {
    isSaving.value = false;
  }
};

const headers = computed<DataTableHeader[]>(() => {
  const baseHeaders: DataTableHeader[] = [
    { title: "KODE", key: "kode", width: 130, fixed: true },
    { title: "NAMA BARANG", key: "nama", width: 300 },
    { title: "SIZE", key: "ukuran", width: 70, align: "center" },
    { title: "KATEGORI", key: "kategori", width: 100, align: "center" },
  ];

  // Sembunyikan kolom ini jika cabang adalah KDC
  if (selectedCabang.value !== "KDC") {
    baseHeaders.push(
      { title: "AVG/BULAN", key: "avg_per_bulan", width: 110, align: "end" },
      { title: "KTG SALES", key: "sales_kategori", width: 110, align: "center" },
      { title: "PARETO", key: "is_pareto", width: 80, align: "center" },
      { title: "SUMBER DATA", key: "data_source", width: 120, align: "center" }
    );
  }

  baseHeaders.push(
    { title: "BUFFER/MIN", key: "min", width: 100, align: "end" },
    { title: "MAX", key: "max", width: 80, align: "end" }
  );

  // KDC tidak butuh ROP
  if (selectedCabang.value !== "KDC") {
    baseHeaders.push({ title: "ROP", key: "rop", width: 70, align: "end" });
  }

  baseHeaders.push({ title: "STOK AKTUAL", key: "real_stok", width: 120, align: "end" });

  if (selectedCabang.value === "KDC") {
    baseHeaders.push({ title: "SPK BEREDAR", key: "spk_beredar", width: 110, align: "end" });
  }

  return baseHeaders;
});

const openSesionalDialog = async () => {
  sesionalPage.value = 1;
  sesionalSearch.value = "";

  // Pastikan cabang sudah ada sebelum fetch
  if (!selectedCabang.value) {
    toast.warning("Pilih cabang terlebih dahulu.");
    return;
  }

  await fetchSesionalItems();
  isSesionalDialogOpen.value = true;
};

/// --- EXPORT ---
const exportBuffer = async () => {
  if (filteredData.value.length === 0) return toast.warning("Tidak ada data untuk diekspor.");
  isExporting.value = true;
  toast.info("Menyiapkan file export...");

  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Buffer Stok");

    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    const borderMedium: Partial<ExcelJS.Borders> = {
      top: { style: "medium" },
      left: { style: "thin" },
      bottom: { style: "medium" },
      right: { style: "thin" },
    };

    interface ExcelColumn {
      header: string;
      key: string;
      width: number;
      align: "left" | "center" | "right";
      fmt?: string;
    }

    const cols: ExcelColumn[] = [
      { header: "Kode", key: "kode", width: 16, align: "left" },
      { header: "Nama Barang", key: "nama", width: 40, align: "left" },
      { header: "Size", key: "ukuran", width: 8, align: "center" },
    ];

    if (selectedCabang.value !== "KDC") {
      cols.push(
        { header: "Avg/Bulan", key: "avg_per_bulan", width: 12, align: "right" },
        { header: "Ktg Sales", key: "sales_kategori", width: 12, align: "center" },
        { header: "Pareto", key: "pareto_group", width: 10, align: "center" },
        { header: "Sumber Data", key: "data_source", width: 14, align: "center" }
      );
    }

    cols.push(
      { header: "Buffer/MIN", key: "min", width: 12, align: "right", fmt: "#,##0" },
      { header: "MAX", key: "max", width: 12, align: "right", fmt: "#,##0" }
    );

    if (selectedCabang.value !== "KDC") {
      cols.push({ header: "ROP", key: "rop", width: 10, align: "right", fmt: "#,##0" });
    }

    cols.push({ header: "Stok Aktual", key: "real_stok", width: 13, align: "right", fmt: "#,##0" });

    if (selectedCabang.value === "KDC") {
      cols.push({
        header: "SPK Beredar",
        key: "spk_beredar",
        width: 13,
        align: "right",
        fmt: "#,##0",
      });
    }

    cols.push({ header: "Status", key: "_status", width: 12, align: "center" });

    sheet.columns = cols.map((c) => ({ width: c.width }));

    // Header row
    const headerRow = sheet.addRow(cols.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    // Warna per kategori sales
    const ktgBg: Record<string, string> = {
      small: "FFFFEBEE",
      medium: "FFFFF9C4",
      large: "FFF1F8E9",
      xlarge: "FFE8F5E9",
    };

    filteredData.value.forEach((item) => {
      // Menentukan status dengan logika KURANG
      let status = "OK";
      if (item.real_stok > item.max) {
        status = "OVERSTOCK";
      } else if (item.rop !== undefined && item.real_stok <= item.rop) {
        status = "RESTOCK!";
      } else if (item.real_stok < item.min) {
        status = "KURANG";
      }

      // Menentukan warna font
      const statusColor =
        status === "OVERSTOCK"
          ? "FFE65100" // Orange
          : status === "RESTOCK!"
          ? "FFC62828" // Red
          : status === "KURANG"
          ? "FFF9A825" // Yellow Darken
          : "FF2E7D32"; // Green (OK)

      const values = cols.map((c) => {
        if (c.key === "_status") return status;
        if (c.key === "pareto_group") return item.pareto_group ?? "—";
        if (c.key === "sales_kategori") return item.sales_kategori ?? "pareto";
        if (c.key === "data_source") {
          return item.data_source === "pareto"
            ? "Pareto+20%"
            : item.data_source === "pareto_small"
            ? "Pareto→Small"
            : item.data_source === "toko_baru"
            ? "Toko Baru"
            : item.data_source === "fallback_5bln"
            ? "5Bln Terakhir"
            : "Thn Lalu";
        }
        return (item[c.key as keyof BufferItem] as string | number) ?? "";
      });

      const row = sheet.addRow(values);
      const bg = item.is_pareto ? "FFF3E5F5" : ktgBg[item.sales_kategori ?? "small"] ?? "FFFAFAFA";

      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border = borderThin;
        cell.alignment = { horizontal: cols[colNum - 1]?.align ?? "left", vertical: "middle" };
        if (cols[colNum - 1]?.fmt) cell.numFmt = cols[colNum - 1].fmt!;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

        // Warna font kolom status
        if (cols[colNum - 1]?.key === "_status") {
          cell.font = { bold: true, color: { argb: statusColor } };
        }
        // Warna font pareto
        if (cols[colNum - 1]?.key === "pareto_group" && item.is_pareto) {
          cell.font = { bold: true, color: { argb: "FF7B1FA2" } };
        }
      });
    });

    // Grand total
    const totalRowNum = sheet.rowCount + 1;
    const totalValues = cols.map((c, i) => {
      if (i === 0) return "GRAND TOTAL :";
      if (c.key === "min") return filteredData.value.reduce((s, r) => s + r.min, 0);
      if (c.key === "max") return filteredData.value.reduce((s, r) => s + r.max, 0);
      if (c.key === "rop") return filteredData.value.reduce((s, r) => s + r.rop, 0);
      if (c.key === "real_stok") return filteredData.value.reduce((s, r) => s + r.real_stok, 0);
      if (c.key === "spk_beredar")
        return filteredData.value.reduce((s, r) => s + (r.spk_beredar || 0), 0);
      return "";
    });
    const totalRow = sheet.addRow(totalValues);
    sheet.mergeCells(`A${totalRowNum}:G${totalRowNum}`);
    totalRow.height = 22;
    totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      cell.border = borderMedium;
      cell.alignment = { horizontal: cols[colNum - 1]?.align ?? "right", vertical: "middle" };
      if (cols[colNum - 1]?.fmt) cell.numFmt = cols[colNum - 1].fmt!;
    });

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BufferStok_${selectedCabang.value}_${new Date().toISOString().slice(0, 7)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export berhasil.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data.");
  } finally {
    isExporting.value = false;
  }
};

const exportAllStores = async () => {
  isExportingAll.value = true;
  toast.info("Mengambil data semua toko... Ini mungkin memakan waktu.");

  try {
    const res = await api.get("/buffer-panel/export-all", {
      params: { periode: selectedPeriode.value },
    });
    const allData: { kode_cabang: string; nama_cabang: string; items: BufferItem[] }[] = res.data;

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    const cols = [
      { header: "Kode", key: "kode", width: 16 },
      { header: "Nama Barang", key: "nama", width: 40 },
      { header: "Size", key: "ukuran", width: 8 },
      { header: "Buffer/MIN", key: "min", width: 12, fmt: "#,##0" },
      { header: "MAX", key: "max", width: 12, fmt: "#,##0" },
      { header: "Stok Aktual", key: "real_stok", width: 13, fmt: "#,##0" },
    ];

    for (const cab of allData) {
      const sheetName = cab.kode_cabang.substring(0, 31);
      const sheet = workbook.addWorksheet(sheetName);
      sheet.columns = cols.map((c) => ({ width: c.width }));

      const headerRow = sheet.addRow(cols.map((c) => c.header));
      headerRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: "FF0D47A1" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = borderThin;
      });

      cab.items.forEach((item) => {
        const row = sheet.addRow(
          cols.map((c) => (item[c.key as keyof BufferItem] ?? "") as string | number)
        );
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.border = borderThin;
          if (cols[colNum - 1]?.fmt) cell.numFmt = cols[colNum - 1].fmt!;
        });
      });

      sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const periodeLabel = selectedPeriode.value || "Live";
    a.download = `BufferStok_SemuaToko_${periodeLabel}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export semua toko berhasil.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data semua toko.");
  } finally {
    isExportingAll.value = false;
  }
};

onMounted(async () => {
  await fetchCabangList();
  await fetchConfig();
  await fetchPeriodeOptions();
  fetchPreviewData();
});

// Tambah fungsi reset search
const clearSearch = () => {
  clearTimeout(searchTimeout); // ← cancel dulu
  searchInput.value = "";
  debouncedSearch.value = ""; // ← langsung reset
};

watch(filterGrp, () => {
  clearSearch();
  page.value = 1;
});

// Pisahkan watcher selectedCabang agar tidak bentrok dengan fetchConfig
watch(selectedCabang, async () => {
  clearSearch();
  page.value = 1;
  await fetchConfig();
  fetchPreviewData();
});

watch(selectedPeriode, () => {
  page.value = 1;
  fetchPreviewData();
});

watch(anomaliFilter, () => {
  page.value = 1;
});

watch([page, itemsPerPage], () => {
  // Gulirkan tabel kembali ke paling atas secara halus setiap kali halaman/jumlah baris diganti
  if (tableContainerRef.value) {
    tableContainerRef.value.scrollTop = 0;
  }
});
</script>

<template>
  <PageLayout title="Panel Setting Buffer" icon="mdi-database-sync-outline" desktop-mode>
    <template #header-actions>
      <v-btn
        color="blue-grey-darken-2"
        prepend-icon="mdi-information-outline"
        size="small"
        class="font-11 mr-2"
        variant="tonal"
        @click="isInfoOpen = true"
      >
        Panduan Buffer
      </v-btn>
      <v-btn
        color="teal-darken-1"
        prepend-icon="mdi-weather-sunset-up"
        size="small"
        variant="tonal"
        @click="openSesionalDialog"
      >
        Setting Sesional
      </v-btn>

      <v-btn
        color="teal"
        prepend-icon="mdi-file-excel"
        size="small"
        variant="tonal"
        :loading="isExporting"
        @click="exportBuffer"
      >
        Export
      </v-btn>
      <v-btn
        color="deep-purple"
        prepend-icon="mdi-database-export"
        size="small"
        variant="tonal"
        :loading="isExportingAll"
        @click="exportAllStores"
      >
        Export Semua Toko
      </v-btn>
      <!-- <v-btn
        color="orange-darken-3"
        prepend-icon="mdi-tune-vertical"
        size="small"
        variant="tonal"
        @click="isSettingOpen = true"
      >
        Atur Parameter (Resep)
      </v-btn> -->
      <v-btn
        color="primary"
        prepend-icon="mdi-content-save-check"
        size="small"
        :loading="isSaving"
        :disabled="isVirtualCabang || isHistoricalMode"
        @click="saveFinalBuffer"
      >
        Terapkan ke Toko
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section buffer-filter-section">
        <span class="filter-label">Cabang:</span>
        <v-select
          v-model="selectedCabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          class="cabang-select"
        />

        <v-select
          v-model="selectedPeriode"
          :items="[
            { title: '🔴 Live (Saat Ini)', value: null },
            ...periodeOptions.map((p) => ({ title: p, value: p })),
          ]"
          item-title="title"
          item-value="value"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 170px"
          label="Periode"
        />
        <v-chip
          v-if="selectedPeriode"
          size="x-small"
          color="orange"
          variant="tonal"
          class="font-weight-bold"
        >
          Mode Histori — data beku, tidak bisa diedit/disimpan
        </v-chip>

        <v-text-field
          v-model="searchInput"
          prepend-inner-icon="mdi-magnify"
          placeholder="Cari SKU / Nama Barang..."
          density="compact"
          variant="outlined"
          hide-details
          class="search-field"
        />

        <v-select
          v-model="filterGrp"
          :items="[
            { title: 'Semua Kategori', value: 'Semua' },
            { title: 'Reguler', value: 'reg' },
            { title: 'Sesional', value: 'sea' },
            { title: 'Pesanan', value: 'ord' },
          ]"
          item-title="title"
          item-value="value"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          class="kategori-select"
        />

        <v-select
          v-model="filterSalesKtg"
          :items="[
            { title: 'Semua Kategori Sales', value: 'Semua' },
            { title: '🔴 Small', value: 'small' },
            { title: '🟡 Medium', value: 'medium' },
            { title: '🟢 Large', value: 'large' },
            { title: '💚 X Large', value: 'xlarge' },
            { title: '🟣 Pareto', value: 'pareto' },
          ]"
          item-title="title"
          item-value="value"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 190px"
        />

        <v-select
          v-model="anomaliFilter"
          :items="anomaliOptions"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          prepend-inner-icon="mdi-alert-circle-outline"
          label="Filter Anomali"
          bg-color="surface"
          style="min-width: 200px"
          clearable
        />

        <v-chip
          v-if="anomaliFilter !== null"
          size="x-small"
          color="warning"
          variant="flat"
          class="font-weight-bold"
          prepend-icon="mdi-alert-circle"
          style="white-space: nowrap; flex-shrink: 0"
        >
          {{ filteredData.length }} item (anomali ≥{{ anomaliFilter }}x dikecualikan)
        </v-chip>

        <v-spacer />
        <v-chip color="blue-darken-2" size="small" variant="flat" class="font-weight-bold">
          Total: {{ filteredData.length }} SKU
        </v-chip>
      </div>

      <div class="table-container">
        <div class="table-scroll-area" ref="tableContainerRef">
          <AppDataTable
            :key="`table-${page}-${itemsPerPage}-${selectedCabang}-${filterGrp}-${debouncedSearch}`"
            v-model="selected"
            :headers="headers"
            :items="paginatedData"
            :loading="isLoading"
            :item-value="(item: BufferItem) => `${item.kode}||${item.ukuran}`"
            density="compact"
            class="desktop-table header-browse-blue"
            fixed-header
            :items-per-page="paginatedData.length"
            hide-default-footer
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

            <template #[`item.kategori`]="{ item }">
              <v-chip
                size="x-small"
                variant="flat"
                :color="
                  item.kategori === 'reg'
                    ? 'success'
                    : item.kategori === 'sea'
                    ? 'warning'
                    : 'primary'
                "
                class="font-weight-bold"
              >
                {{
                  item.kategori === "reg"
                    ? "Reguler"
                    : item.kategori === "sea"
                    ? "Sesional"
                    : item.kategori === "ord"
                    ? "Pesanan"
                    : item.kategori
                }}
              </v-chip>
            </template>

            <template #[`item.aktual_terkini`]="{ item }">
              <span class="text-blue-darken-3 font-weight-bold">
                {{ item.aktual_terkini }}
              </span>
            </template>

            <template #[`item.avg_a`]="{ item }">
              <div class="d-flex align-center justify-end gap-1">
                <span class="text-indigo-darken-1 font-weight-bold">
                  {{ Number(item.avg_a || 0).toFixed(1) }}
                </span>
                <span style="font-size: 8px" class="text-medium-emphasis">/hr</span>
              </div>
            </template>

            <template #[`item.avg_b`]="{ item }">
              <div class="d-flex align-center justify-end gap-1">
                <span class="text-indigo-darken-1 font-weight-bold">
                  {{ Number(item.avg_b || 0).toFixed(1) }}
                </span>
                <span style="font-size: 8px" class="text-medium-emphasis">/hr</span>
              </div>
            </template>

            <template #[`item.aktual_lalu`]="{ item }">
              <span class="text-deep-purple-darken-2 font-weight-bold">
                {{ item.aktual_lalu }}
              </span>
            </template>

            <template #[`item.selisih`]="{ item }">
              <div class="d-flex flex-column align-end">
                <span
                  class="font-weight-bold"
                  :class="item.selisih >= settings.threshold ? 'text-error' : 'text-success'"
                >
                  {{ item.selisih }}%
                </span>
                <span style="font-size: 8px" class="text-medium-emphasis">{{ item.method }}</span>
              </div>
            </template>

            <template #[`item.avgF`]="{ item }">
              <div
                class="bg-amber-lighten-5 text-amber-darken-4 font-weight-black pa-1 rounded text-center"
              >
                {{ item.avgF }}
              </div>
            </template>

            <template #[`item.demand`]="{ item }">
              <span class="text-purple-darken-2 font-weight-bold">{{ item.demand }}</span>
            </template>

            <template #[`item.buffer`]="{ item }">
              <span class="text-purple-darken-2 font-weight-bold">{{ item.buffer }}</span>
            </template>

            <template #[`item.allowance`]="{ item }">
              <span class="text-purple-darken-2 font-weight-bold">{{ item.allowance }}</span>
            </template>

            <template #[`item.min`]="{ item }">
              <div
                class="font-weight-black pa-1 rounded text-center"
                :class="
                  item.is_pareto
                    ? 'bg-purple-lighten-5 text-purple-darken-3'
                    : 'bg-red-lighten-5 text-error'
                "
              >
                {{ item.min }}
              </div>
            </template>

            <template #[`item.max`]="{ item }">
              <div
                class="bg-green-lighten-5 text-success font-weight-black pa-1 rounded text-center"
              >
                {{ item.max }}
              </div>
            </template>

            <template #[`item.rop`]="{ item }">
              <div
                class="bg-orange-lighten-5 text-orange-darken-4 font-weight-black pa-1 rounded text-center"
              >
                {{ item.rop }}
              </div>
            </template>

            <template #[`item.sales_kategori`]="{ item }">
              <template v-if="item.is_pareto">
                <span style="font-size: 10px; font-weight: 700" class="text-purple"> AVG+20% </span>
              </template>
              <v-chip
                v-else-if="item.sales_kategori"
                size="x-small"
                variant="flat"
                class="font-weight-bold"
                :color="
                  item.sales_kategori === 'xlarge'
                    ? 'green-darken-3'
                    : item.sales_kategori === 'large'
                    ? 'light-green'
                    : item.sales_kategori === 'medium'
                    ? 'yellow-darken-2'
                    : 'red-darken-1'
                "
                :style="
                  item.sales_kategori === 'medium'
                    ? 'color: #333 !important'
                    : item.sales_kategori === 'large'
                    ? 'color: #1b5e20 !important'
                    : ''
                "
              >
                {{ item.sales_kategori }}
              </v-chip>
              <span v-else class="text-medium-emphasis" style="font-size: 10px">—</span>
            </template>

            <template #[`item.is_pareto`]="{ item }">
              <v-chip
                v-if="item.is_pareto"
                size="x-small"
                variant="flat"
                class="font-weight-bold"
                :color="
                  item.pareto_group === 'pendek'
                    ? 'purple'
                    : item.pareto_group === 'panjang'
                    ? 'deep-purple'
                    : item.pareto_group === 'polo'
                    ? 'indigo'
                    : 'purple'
                "
              >
                {{
                  item.pareto_group === "pendek"
                    ? "▲ Pdek"
                    : item.pareto_group === "panjang"
                    ? "▼ Pjg"
                    : item.pareto_group === "polo"
                    ? "◆ Polo"
                    : "PARETO"
                }}
              </v-chip>
              <span v-else class="text-medium-emphasis" style="font-size: 11px">—</span>
            </template>

            <template #[`item.data_source`]="{ item }">
              <span
                style="font-size: 10px"
                :class="
                  item.data_source === 'pareto'
                    ? 'text-purple font-weight-bold'
                    : item.data_source === 'pareto_small'
                    ? 'text-purple'
                    : item.data_source === 'toko_baru'
                    ? 'text-grey'
                    : item.data_source === 'fallback_5bln'
                    ? 'text-orange'
                    : 'text-success'
                "
              >
                {{
                  item.data_source === "pareto"
                    ? "Pareto+20%"
                    : item.data_source === "pareto_small"
                    ? "Pareto→Small"
                    : item.data_source === "toko_baru"
                    ? "Toko Baru"
                    : item.data_source === "fallback_5bln"
                    ? "5Bln Terakhir"
                    : "Thn Lalu"
                }}
              </span>
            </template>

            <template #[`item.real_stok`]="{ item }">
              <div class="d-flex flex-column align-end">
                <span class="font-weight-bold">{{ item.real_stok }}</span>
                <span
                  v-if="item.real_stok > item.max && selectedCabang === 'KDC'"
                  style="
                    font-size: 8px;
                    font-weight: 700;
                    cursor: pointer;
                    text-decoration: underline;
                  "
                  class="text-orange-darken-3"
                  @click="openStokCabang(item)"
                  >OVERSTOCK ↗</span
                >
                <span
                  v-else-if="item.real_stok > item.max"
                  style="font-size: 8px; font-weight: 700"
                  class="text-orange-darken-3"
                  >OVERSTOCK</span
                >
                <span
                  v-else-if="item.rop !== undefined && item.real_stok <= item.rop"
                  style="font-size: 8px; font-weight: 700"
                  class="text-error"
                  >RESTOCK!</span
                >
                <span
                  v-else-if="item.real_stok < item.min"
                  style="font-size: 8px; font-weight: 700"
                  class="text-yellow-darken-3"
                  >KURANG</span
                >
                <span v-else style="font-size: 8px; font-weight: 700" class="text-success">OK</span>
              </div>
            </template>

            <template #[`item.spk_beredar`]="{ item }">
              <span
                v-if="item.spk_beredar > 0"
                class="font-weight-bold text-teal-darken-3"
                style="cursor: pointer; text-decoration: underline"
                @click="openDetailSpk(item)"
              >
                {{ item.spk_beredar }}
              </span>

              <span v-else class="text-medium-emphasis"> 0 </span>
            </template>

            <template #[`body.append`]>
              <tr class="qty-footer-row" v-if="!isLoading && filteredData.length > 0">
                <td colspan="4" class="text-end font-weight-bold" style="color: #0d47a1">TOTAL:</td>

                <template v-if="selectedCabang !== 'KDC'">
                  <td class="text-end font-weight-bold text-blue-darken-3">
                    {{ Number(totals.avg).toFixed(1) }}
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                </template>

                <td class="text-end font-weight-bold text-error">{{ totals.min }}</td>
                <td class="text-end font-weight-bold text-success">{{ totals.max }}</td>

                <td
                  v-if="selectedCabang !== 'KDC'"
                  class="text-end font-weight-bold text-orange-darken-4"
                >
                  {{ totals.rop }}
                </td>

                <td class="text-end font-weight-bold" style="color: #37474f">{{ totals.real }}</td>

                <td
                  v-if="selectedCabang === 'KDC'"
                  class="text-end font-weight-bold text-teal-darken-3"
                >
                  {{ totals.spk }}
                </td>
              </tr>
            </template>
          </AppDataTable>
        </div>

        <!-- Pagination manual di luar tabel, sticky di bawah -->
        <div class="table-pagination">
          <span class="pg-info">
            Menampilkan {{ (page - 1) * itemsPerPage + 1 }}–{{
              Math.min(page * itemsPerPage, filteredData.length)
            }}
            dari <strong>{{ filteredData.length }}</strong> SKU
          </span>
          <div class="pg-buttons">
            <button class="pg-btn" :disabled="page === 1" @click="page = 1">
              <v-icon size="13">mdi-page-first</v-icon>
            </button>
            <button class="pg-btn" :disabled="page === 1" @click="page--">
              <v-icon size="13">mdi-chevron-left</v-icon>
            </button>
            <span class="pg-current"
              >Hal. {{ page }} / {{ Math.ceil(filteredData.length / itemsPerPage) }}</span
            >
            <button
              class="pg-btn"
              :disabled="page >= Math.ceil(filteredData.length / itemsPerPage)"
              @click="page++"
            >
              <v-icon size="13">mdi-chevron-right</v-icon>
            </button>
            <button
              class="pg-btn"
              :disabled="page >= Math.ceil(filteredData.length / itemsPerPage)"
              @click="page = Math.ceil(filteredData.length / itemsPerPage)"
            >
              <v-icon size="13">mdi-page-last</v-icon>
            </button>
          </div>
          <div class="pg-perpage">
            <span class="filter-label">Tampilkan</span>
            <select class="pg-select" v-model.number="itemsPerPage" @change="page = 1">
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="200">200</option>
            </select>
            <span class="filter-label">baris</span>
          </div>
        </div>
      </div>
    </div>

    <v-dialog v-model="isInfoOpen" max-width="680px" scrollable>
      <v-card class="rounded-lg">
        <div
          class="d-flex align-center justify-space-between px-3 py-2"
          style="background: #455a64; color: white; flex-shrink: 0"
        >
          <span class="text-caption font-weight-bold"> PANDUAN SISTEM KALKULASI BUFFER STOK </span>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            color="white"
            @click="isInfoOpen = false"
          />
        </div>

        <v-card-text class="pa-4" style="font-size: 11px; line-height: 1.9">
          <div class="section-title text-blue-darken-3">1. PERIODE REFERENSI PENJUALAN</div>
          <div class="section-body">
            Sistem mengambil data penjualan
            <strong>5 bulan mulai dari bulan berjalan di tahun lalu</strong>. Contoh: jika sekarang
            <strong>Mei 2026</strong>, maka data yang diambil adalah
            <strong>Mei – September 2025</strong>.
            <div class="info-box mt-2">
              Periode ini otomatis bergeser setiap bulan mengikuti kalender berjalan.
            </div>
          </div>

          <div class="section-title text-teal-darken-2 mt-3">2. KONDISI TOKO &amp; SUMBER DATA</div>
          <div class="section-body">
            <table class="info-table">
              <thead>
                <tr>
                  <th>Kondisi Toko</th>
                  <th>Sumber Data</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Toko baru, belum ada penjualan sama sekali</td>
                  <td>Tidak ada data → buffer <strong>Small</strong></td>
                  <td><span class="label-grey">Toko Baru</span></td>
                </tr>
                <tr>
                  <td>Toko sudah jalan tapi belum punya history tahun lalu</td>
                  <td>Penjualan <strong>5 bulan terakhir</strong></td>
                  <td><span class="label-orange">5Bln Terakhir</span></td>
                </tr>
                <tr>
                  <td>Toko normal dengan history tahun lalu</td>
                  <td>Penjualan <strong>5 bulan musiman tahun lalu</strong></td>
                  <td><span class="label-green">Thn Lalu</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section-title text-orange-darken-3 mt-3">
            3. KATEGORI PENJUALAN → BUFFER STOK
          </div>
          <div class="section-body">
            Rata-rata penjualan per bulan per ukuran dikonversi ke kategori, lalu buffer diambil
            dari tabel berikut:
            <table class="info-table mt-2">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Avg/Bulan</th>
                  <th>S</th>
                  <th>M</th>
                  <th>L</th>
                  <th>XL</th>
                  <th>2XL</th>
                  <th>3XL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span class="label-red">Small</span></td>
                  <td>&lt; 10</td>
                  <td>10</td>
                  <td>10</td>
                  <td>20</td>
                  <td>20</td>
                  <td>5</td>
                  <td>5</td>
                </tr>
                <tr>
                  <td><span class="label-yellow">Medium</span></td>
                  <td>10 – &lt;15</td>
                  <td>15</td>
                  <td>15</td>
                  <td>30</td>
                  <td>30</td>
                  <td>10</td>
                  <td>10</td>
                </tr>
                <tr>
                  <td><span class="label-lightgreen">Large</span></td>
                  <td>15 – &lt;20</td>
                  <td>20</td>
                  <td>20</td>
                  <td>40</td>
                  <td>40</td>
                  <td>15</td>
                  <td>15</td>
                </tr>
                <tr>
                  <td><span class="label-green">X Large</span></td>
                  <td>≥ 20</td>
                  <td>30</td>
                  <td>30</td>
                  <td>60</td>
                  <td>60</td>
                  <td>20</td>
                  <td>20</td>
                </tr>
              </tbody>
            </table>
            <div class="info-box mt-2">
              <strong>MIN</strong> = Buffer &nbsp;|&nbsp; <strong>MAX</strong> = Buffer × 2
              &nbsp;|&nbsp; <strong>ROP</strong> = Buffer × 0.7 (titik alarm restock)
            </div>
          </div>

          <div class="section-title text-purple-darken-2 mt-3">
            4. BARANG PARETO (PERHITUNGAN KHUSUS)
          </div>
          <div class="section-body">
            Barang pareto ditentukan dari <strong>top penjualan per jenis</strong>
            berdasarkan periode musiman tahun lalu:
            <table class="info-table mt-2">
              <thead>
                <tr>
                  <th>Grup Pareto</th>
                  <th>Kriteria Barang</th>
                  <th>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span class="label-purple">Pendek</span></td>
                  <td>brg_lengan = PENDEK, brg_jeniskain COMBED 24S</td>
                  <td>Top 10</td>
                </tr>
                <tr>
                  <td><span class="label-deeppurple">Panjang</span></td>
                  <td>brg_lengan = PANJANG, brg_jeniskain COMBED 24S</td>
                  <td>Top 10</td>
                </tr>
                <tr>
                  <td><span class="label-indigo">Polo/Lacos</span></td>
                  <td>brg_jeniskaos = POLO/LACOS, brg_jeniskain CVC</td>
                  <td>Top 5</td>
                </tr>
              </tbody>
            </table>
            <div class="mt-2">
              <strong>Cara hitung buffer pareto:</strong>
              <code
                style="background: #f3e5f5; padding: 2px 6px; border-radius: 3px; font-size: 11px"
              >
                Buffer = Avg/Bulan (musiman) × 1.2, dibulatkan ke atas
              </code>
            </div>
            <div
              class="info-box mt-2"
              style="border-color: #ce93d8; background: #fce4ec; color: #6a1b9a"
            >
              <strong>Pengecualian:</strong> Ukuran dengan avg/bulan &lt; 10 tetap menggunakan
              buffer tabel kategori <span class="label-red">Small</span>, meskipun kode barangnya
              masuk daftar pareto. Label sumber data akan tampil sebagai
              <span class="label-purple" style="font-size: 10px">Pareto→Small</span>.
            </div>
          </div>

          <div class="section-title text-grey-darken-3 mt-3">5. INDIKATOR STATUS STOK AKTUAL</div>
          <div class="section-body">
            <table class="info-table">
              <tbody>
                <tr>
                  <td><span class="label-orange">OVERSTOCK</span></td>
                  <td>Stok Aktual &gt; MAX</td>
                </tr>
                <tr>
                  <td><span class="label-red">RESTOCK!</span></td>
                  <td>Stok Aktual ≤ ROP — segera ajukan pasokan ulang ke pusat</td>
                </tr>
                <tr>
                  <td><span class="label-yellow" style="color: #333">KURANG</span></td>
                  <td>Stok Aktual &lt; MIN tapi masih di atas ROP</td>
                </tr>
                <tr>
                  <td><span class="label-green">OK</span></td>
                  <td>Stok Aktual berada di antara MIN dan MAX</td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-card-text>

        <v-card-actions class="pa-3 border-t">
          <v-spacer />
          <v-btn
            color="blue-grey-darken-3"
            variant="flat"
            class="text-none font-weight-bold px-4"
            size="small"
            @click="isInfoOpen = false"
          >
            Saya Mengerti
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isSettingOpen" max-width="850px" persistent scrollable>
      <v-card class="rounded-lg">
        <v-toolbar color="orange-darken-3" density="compact">
          <v-icon start class="ml-4">mdi-tune-vertical</v-icon>
          <v-toolbar-title class="text-subtitle-2 font-weight-bold"
            >PARAMETER BUFFER — {{ selectedCabang }}</v-toolbar-title
          >
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="isSettingOpen = false" />
        </v-toolbar>

        <v-card-text class="pa-4 bg-grey-lighten-4" style="font-size: 11px">
          <v-row dense>
            <v-col cols="12" md="6">
              <v-card class="elevation-0 border h-100 pa-3">
                <div class="box-label text-blue-darken-2">① Global — Lead Time (Hari Toko)</div>
                <div class="d-flex align-center ga-3 mt-3">
                  <v-text-field
                    v-model.number="settings.leadTime"
                    type="number"
                    density="compact"
                    variant="outlined"
                    hide-details
                    suffix="Hari"
                    style="max-width: 120px"
                  />
                  <v-slider
                    v-model="settings.leadTime"
                    :min="1"
                    :max="60"
                    color="blue"
                    hide-details
                    class="flex-grow-1"
                  />
                </div>
                <div class="text-caption text-medium-emphasis mt-2">
                  <v-icon size="small" color="info">mdi-information</v-icon> Target hari agar toko
                  tidak kehabisan barang.
                </div>
              </v-card>
            </v-col>
            <v-col cols="12" md="6">
              <v-card class="elevation-0 border h-100 pa-3">
                <div class="box-label text-amber-darken-4">② Threshold & Bobot Weighted</div>
                <div class="d-flex align-center mt-2 ga-2 mb-2">
                  <span
                    class="font-weight-bold text-medium-emphasis"
                    style="width: 110px; font-size: 11px"
                    >Ambang Selisih:</span
                  >
                  <v-text-field
                    v-model.number="settings.threshold"
                    type="number"
                    density="compact"
                    variant="outlined"
                    hide-details
                    suffix="%"
                  />
                </div>
                <div class="d-flex justify-space-between text-caption font-weight-bold px-1">
                  <span class="text-blue">Terkini: {{ settings.weightTerkini }}%</span>
                  <span class="text-deep-purple"
                    >Thn Lalu: {{ 100 - settings.weightTerkini }}%</span
                  >
                </div>
                <v-slider
                  v-model="settings.weightTerkini"
                  :min="50"
                  :max="90"
                  step="5"
                  color="amber-darken-3"
                  hide-details
                  class="mt-n2"
                />
              </v-card>
            </v-col>
            <v-col cols="12" class="mt-2">
              <v-card class="elevation-0 border pa-3">
                <div class="box-label text-grey-darken-3 mb-3">
                  ③ Safety Factor & Allowance per Kelompok
                </div>
                <v-row dense>
                  <v-col
                    cols="4"
                    v-for="grp in [
                      { k: 'Reguler', s: 'sfReg', a: 'alReg', c: 'blue' },
                      { k: 'Seasonal', s: 'sfSea', a: 'alSea', c: 'teal' },
                      { k: 'Pesanan', s: 'sfOrd', a: 'alOrd', c: 'orange' },
                    ]"
                    :key="grp.k"
                  >
                    <div
                      class="border rounded pa-2"
                      :style="`border-top: 3px solid ${grp.c} !important`"
                    >
                      <div
                        class="font-weight-bold mb-1"
                        :class="`text-${grp.c}`"
                        style="font-size: 11px"
                      >
                        {{ grp.k }}
                      </div>
                      <v-text-field
                        v-model.number="settings[grp.s as keyof typeof settings]"
                        label="SF (x)"
                        type="number"
                        step="0.1"
                        density="compact"
                        variant="outlined"
                        hide-details
                        class="mb-1"
                      />
                      <v-text-field
                        v-model.number="settings[grp.a as keyof typeof settings]"
                        label="Allow (%)"
                        type="number"
                        density="compact"
                        variant="outlined"
                        hide-details
                      />
                    </div>
                  </v-col>
                </v-row>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>

        <v-card-actions class="pa-4 bg-white border-t">
          <v-spacer />
          <v-btn variant="text" @click="isSettingOpen = false" class="text-none font-weight-bold"
            >Batal</v-btn
          >
          <v-btn
            color="orange-darken-3"
            variant="flat"
            class="text-none font-weight-bold px-4"
            :loading="isConfigSaving"
            @click="saveBranchConfig"
            >Simpan Resep Cabang</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isStokCabangDialogVisible" max-width="480px" scrollable>
      <v-card class="rounded-lg overflow-hidden">
        <div
          class="d-flex align-center justify-space-between px-3 py-2"
          style="background: #e65100; color: white; flex-shrink: 0"
        >
          <div class="d-flex align-center gap-2">
            <v-icon size="16" color="white">mdi-store-outline</v-icon>
            <span class="text-caption font-weight-bold">
              Stok per Cabang — {{ selectedItemStokCabang?.kode }} /
              {{ selectedItemStokCabang?.ukuran }}
            </span>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            color="white"
            @click="isStokCabangDialogVisible = false"
          />
        </div>

        <v-card-text class="pa-0 bg-white" style="overflow-y: auto; max-height: 70vh">
          <div class="text-caption text-grey-darken-1 px-3 py-2 bg-grey-lighten-4 border-b">
            {{ selectedItemStokCabang?.nama }} — Size {{ selectedItemStokCabang?.ukuran }}
          </div>

          <div v-if="isLoadingStokCabang" class="text-center pa-6">
            <v-progress-circular indeterminate color="orange-darken-3" size="32" />
          </div>

          <div v-else>
            <div
              v-for="cabang in stokPerCabang.filter((c) => c.stok > 0)"
              :key="cabang.kode_cabang"
              class="d-flex align-center justify-space-between px-3 py-1 border-b"
              style="font-size: 11px; min-height: 28px"
              :style="cabang.stok > 0 ? '' : 'opacity: 0.4'"
            >
              <div class="d-flex align-center gap-2">
                <v-icon size="12" color="grey-darken-1">mdi-store</v-icon>
                <span>{{ cabang.nama_cabang }}</span>
              </div>
              <span class="font-weight-bold text-blue-darken-2">{{ cabang.stok }} pcs</span>
            </div>

            <div
              class="d-flex align-center justify-space-between px-3 py-2"
              style="font-size: 11px; background: #fff3e0; border-top: 2px solid #ef6c00"
            >
              <span class="font-weight-bold text-orange-darken-3">TOTAL</span>
              <span class="font-weight-black text-orange-darken-3">
                {{ stokPerCabang.reduce((s, c) => s + Number(c.stok), 0) }} pcs
              </span>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isSesionalDialogOpen" max-width="750px" scrollable persistent>
      <v-card class="rounded-lg">
        <v-toolbar color="teal-darken-1" density="compact">
          <v-toolbar-title
            class="text-subtitle-2 font-weight-bold"
            style="white-space: nowrap; overflow: visible"
          >
            SETTING KATEGORI BARANG SESIONAL — {{ selectedCabang || "..." }}
          </v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="isSesionalDialogOpen = false" />
        </v-toolbar>

        <!-- Search & Info bar -->
        <!-- Search & Info bar — ganti yang lama -->
        <div
          class="d-flex align-center gap-2 px-3 py-2 bg-grey-lighten-4 border-b"
          style="flex-wrap: nowrap"
        >
          <v-text-field
            v-model="sesionalSearch"
            placeholder="Cari kode / nama..."
            density="compact"
            hide-details
            variant="outlined"
            prepend-inner-icon="mdi-magnify"
            clearable
            style="max-width: 240px; font-size: 11px; flex-shrink: 0"
          />

          <div class="d-flex align-center gap-1" style="flex-shrink: 0">
            <v-chip size="x-small" color="orange" variant="tonal" class="font-weight-bold">
              {{ sesionalItems.filter((i) => !i.sales_kategori).length }} belum di-set
            </v-chip>
            <v-chip size="x-small" color="teal" variant="tonal" class="font-weight-bold">
              {{ sesionalItems.filter((i) => i.sales_kategori).length }} sudah di-set
            </v-chip>
          </div>

          <v-spacer />

          <span
            class="text-caption text-medium-emphasis"
            style="white-space: nowrap; flex-shrink: 0"
          >
            {{ filteredSesionalItems.length }} barang
          </span>
        </div>

        <!-- Tabel -->
        <v-card-text class="pa-0" style="max-height: 420px; overflow-y: auto">
          <v-table density="compact" style="font-size: 11px">
            <thead style="position: sticky; top: 0; z-index: 2">
              <tr style="background: #e0f2f1">
                <th style="font-size: 11px; padding: 6px 12px">Kode</th>
                <th style="font-size: 11px; padding: 6px 12px">Nama Barang</th>
                <th style="font-size: 11px; padding: 6px 12px; width: 180px" class="text-center">
                  Kategori Buffer
                  <span class="text-caption text-medium-emphasis ml-1">(semua ukuran)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="paginatedSesionalItems.length === 0">
                <td colspan="3" class="text-center text-grey py-4" style="font-size: 11px">
                  Tidak ada barang sesional.
                </td>
              </tr>
              <tr
                v-for="item in paginatedSesionalItems"
                :key="item.kode"
                style="height: 40px"
                :style="item.sales_kategori ? '' : 'background: #fffde7'"
              >
                <td style="font-size: 11px; padding: 4px 12px">{{ item.kode }}</td>
                <td style="font-size: 11px; padding: 4px 12px">
                  {{ item.nama }}
                  <span
                    v-if="!item.sales_kategori"
                    style="font-size: 9px; margin-left: 4px"
                    class="text-orange font-weight-bold"
                  >
                    ← belum di-set
                  </span>
                </td>
                <td style="padding: 4px 8px">
                  <v-select
                    v-model="
                      sesionalItems[sesionalItems.findIndex((s) => s.kode === item.kode)]
                        .sales_kategori
                    "
                    :items="[{ title: '— Belum di-set —', value: null }, ...kategoriOptions]"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    hide-details
                    variant="outlined"
                    style="font-size: 11px"
                    :placeholder="'— Belum di-set —'"
                  >
                    <template #selection="{ item: selItem }">
                      <span v-if="selItem.value === null" class="text-medium-emphasis"
                        >— Belum di-set —</span
                      >
                      <v-chip
                        v-else
                        size="x-small"
                        variant="flat"
                        :color="
                          selItem.value === 'xlarge'
                            ? 'green-darken-3'
                            : selItem.value === 'large'
                            ? 'light-green'
                            : selItem.value === 'medium'
                            ? 'yellow-darken-2'
                            : 'red-darken-1'
                        "
                        :style="
                          selItem.value === 'medium'
                            ? 'color:#333'
                            : selItem.value === 'large'
                            ? 'color:#1b5e20'
                            : ''
                        "
                      >
                        {{ selItem.title }}
                      </v-chip>
                    </template>
                  </v-select>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>

        <!-- Pagination bar -->
        <div
          class="d-flex align-center justify-space-between px-4 py-2 border-t"
          style="background: rgb(var(--v-theme-surface)); font-size: 11px"
        >
          <div class="d-flex align-center gap-2">
            <span class="text-medium-emphasis">Tampilkan</span>
            <select
              v-model.number="sesionalItemsPerPage"
              @change="sesionalPage = 1"
              style="
                appearance: none;
                background: rgba(var(--v-theme-on-surface), 0.05);
                border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
                border-radius: 4px;
                padding: 2px 20px 2px 8px;
                font-size: 11px;
                cursor: pointer;
              "
            >
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
            <span class="text-medium-emphasis">baris</span>
          </div>

          <div class="d-flex align-center gap-1">
            <v-btn
              icon="mdi-page-first"
              size="x-small"
              variant="text"
              :disabled="sesionalPage === 1"
              @click="sesionalPage = 1"
            />
            <v-btn
              icon="mdi-chevron-left"
              size="x-small"
              variant="text"
              :disabled="sesionalPage === 1"
              @click="sesionalPage--"
            />
            <span class="px-2 font-weight-bold">
              {{ sesionalPage }} / {{ sesionalTotalPages || 1 }}
            </span>
            <v-btn
              icon="mdi-chevron-right"
              size="x-small"
              variant="text"
              :disabled="sesionalPage >= sesionalTotalPages"
              @click="sesionalPage++"
            />
            <v-btn
              icon="mdi-page-last"
              size="x-small"
              variant="text"
              :disabled="sesionalPage >= sesionalTotalPages"
              @click="sesionalPage = sesionalTotalPages"
            />
          </div>

          <span class="text-medium-emphasis">
            {{ (sesionalPage - 1) * sesionalItemsPerPage + 1 }}–{{
              Math.min(sesionalPage * sesionalItemsPerPage, filteredSesionalItems.length)
            }}
            dari {{ filteredSesionalItems.length }} item
          </span>
        </div>

        <v-card-actions class="pa-3 border-t">
          <v-spacer />
          <v-btn variant="text" @click="isSesionalDialogOpen = false">Batal</v-btn>
          <v-btn
            color="teal-darken-1"
            variant="flat"
            class="text-none font-weight-bold px-4"
            :loading="isSavingSesional"
            @click="saveSesional"
          >
            Simpan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isSpkDetailOpen" max-width="900px" scrollable>
      <v-card class="rounded-lg">
        <v-toolbar color="teal-darken-3" density="compact">
          <v-toolbar-title class="text-subtitle-2 font-weight-bold">
            DETAIL SPK AKTIF — {{ selectedItemSpk?.kode }} / {{ selectedItemSpk?.ukuran }}
          </v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="isSpkDetailOpen = false" />
        </v-toolbar>

        <v-card-text class="pa-0" style="font-size: 11px; max-height: 70vh">
          <v-table density="compact" class="spk-detail-table">
            <thead class="bg-grey-lighten-4">
              <tr>
                <th class="py-2 px-3">Nomor SPK</th>
                <th class="py-2 px-3">Nama Barang</th>
                <th class="py-2 px-3 text-center">Qty</th>
                <th class="py-2 px-3">Tgl SPK</th>
                <th class="py-2 px-3 text-error">Dateline</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in detailSpkList" :key="s.spk_nomor">
                <td class="px-3 font-weight-bold text-blue-darken-3">{{ s.spk_nomor }}</td>
                <td class="px-3">{{ s.spk_nama }}</td>
                <td class="px-3 text-center font-weight-bold">{{ s.spkd_qtyorder }}</td>
                <td class="px-3 text-grey-darken-2">
                  {{ new Date(s.spk_tanggal).toLocaleDateString() }}
                </td>
                <td class="px-3 font-weight-bold text-error">
                  {{ new Date(s.spk_dateline).toLocaleDateString() }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Dialog Settings & Labels */
.box-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 4px;
}

/* Mengikuti Global CSS Table Resizer */
.resizable-header {
  position: relative;
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

.table-scroll-area {
  flex-grow: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.browse-content :deep(.v-table__wrapper) {
  flex-grow: 1;
  overflow: auto !important;
}

.qty-footer-row td {
  position: sticky !important;
  bottom: 0 !important;
  z-index: 5;
  background-color: #e3f2fd !important;
  border-top: 2px solid #0d47a1 !important;
  font-size: 11px !important;
  height: 36px !important;
  padding: 0 8px !important;
  white-space: nowrap;
}

/* Table font global */
.browse-content :deep(td),
.browse-content :deep(th) {
  font-size: 11px !important;
}

/* Filter section compact */
.filter-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
  font-size: 11px;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
}

.search-field {
  max-width: 220px;
}

/* Browse layout */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.browse-content :deep(.v-data-table) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.browse-content :deep(.v-table__wrapper) {
  flex-grow: 1;
  overflow: auto !important;
}

.table-pagination {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  font-size: 11px;
}

.pg-info {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
}

.pg-info strong {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 700;
}

.pg-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pg-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.1s;
}

.pg-btn:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.08);
}

.pg-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.pg-current {
  font-size: 11px;
  font-weight: 600;
  padding: 0 8px;
  white-space: nowrap;
}

.pg-perpage {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pg-select {
  appearance: none;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  padding: 2px 20px 2px 8px;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23999'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 5px center;
}

.buffer-filter-section {
  align-items: center !important;
  flex-wrap: nowrap !important;
  gap: 8px !important;
  padding: 6px 12px !important;
  overflow: hidden !important;
  height: auto !important;
}

/* Cabang select - lebar fixed */
.buffer-filter-section :deep(.cabang-select) {
  flex: 0 0 auto !important;
  width: 150px !important;
  max-width: 150px !important;
}

/* Search field - bisa flex grow */
.buffer-filter-section :deep(.search-field) {
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: 400px !important;
  min-width: 200px !important;
}

.buffer-filter-section :deep(.search-field .v-input__control),
.buffer-filter-section :deep(.search-field .v-field),
.buffer-filter-section :deep(.search-field .v-field__input),
.buffer-filter-section :deep(.search-field input) {
  width: 100% !important;
  min-width: 0 !important;
}

/* Kategori select - lebar fixed */
.buffer-filter-section :deep(.kategori-select) {
  flex: 0 0 auto !important;
  width: 150px !important;
  max-width: 150px !important;
}

.section-title {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}

.section-body {
  padding-left: 4px;
  color: rgba(0, 0, 0, 0.75);
}

.info-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.info-table th {
  background: #eceff1;
  padding: 4px 8px;
  text-align: left;
  border: 1px solid #cfd8dc;
  font-weight: 700;
}

.info-table td {
  padding: 4px 8px;
  border: 1px solid #eceff1;
  vertical-align: middle;
}

.info-box {
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 10px;
  color: #1565c0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

/* Label chips */
.label-red {
  background: #ffebee;
  color: #c62828;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
}
.label-yellow {
  background: #fff9c4;
  color: #f9a825;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
}
.label-lightgreen {
  background: #f1f8e9;
  color: #558b2f;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
}
.label-green {
  background: #e8f5e9;
  color: #2e7d32;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
}
.label-orange {
  background: #fff3e0;
  color: #e65100;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
}
.label-grey {
  background: #f5f5f5;
  color: #616161;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
}
.label-purple {
  background: #f3e5f5;
  color: #7b1fa2;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
}
.label-deeppurple {
  background: #ede7f6;
  color: #4527a0;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
}
.label-indigo {
  background: #e8eaf6;
  color: #283593;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
}

.spk-detail-table :deep(th),
.spk-detail-table :deep(td) {
  font-size: 11px !important;
  padding: 8px 12px !important;
}

.spk-detail-table :deep(tbody tr:hover) {
  background-color: #f1f8e9 !important;
}
</style>

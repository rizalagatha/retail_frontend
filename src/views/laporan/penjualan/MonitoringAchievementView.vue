<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import axios, { type AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatCurrency } from "@/utils/numberUtils";
import { AppConfig } from "@/config/appConfig";

interface DataTableHeader {
  title: string;
  key: string;
  width?: string | number;
  minWidth?: string | number;
  align?: "start" | "center" | "end";
  sortable?: boolean;
  fixed?: boolean;

  // [FIX] Tambahkan 2 baris ini agar property custom dikenali
  cellClass?: string;
  headerProps?: Record<string, unknown>;
}
interface DailyItem {
  kode_cabang: string;
  nama_cabang: string;
  hari: string;
  tanggal: string; // atau Date jika sudah parse
  omset: number;
  total_omset: number;
  target_bulanan: number;
  retur_jual: number;
  biaya_platform: number;
  ach: number;
  so_open_today: number;
  so_open_30days: number;
  so_open_accum: number;
  piutang_today: number;
  piutang_30days: number;
  piutang_accum: number;
}
interface WeeklyItem {
  kode_cabang: string;
  nama_cabang: string;
  nominal_w1: number;
  target_w1: number;
  nominal_w2: number;
  target_w2: number;
  nominal_w3: number;
  target_w3: number;
  nominal_w4: number;
  target_w4: number;
  nominal_w5: number;
  target_w5: number;
  total_nominal: number;
  total_target: number;
  [key: string]: unknown;
  // ACH bisa dihitung, jadi opsional
}
interface MonthlyItem {
  tahun: number;
  bulan: number;
  kode_cabang: string;
  nama_cabang: string;
  nominal: number;
  target: number;
  ach: number;
}
interface YtdItem {
  tahun: number;
  bulan: number;
  kode_cabang: string;
  nama_cabang: string;
  nominal: number;
  target: number;
  ach: number;
}
type WeeklyTotals = {
  nominal_w1: number;
  target_w1: number;
  nominal_w2: number;
  target_w2: number;
  nominal_w3: number;
  target_w3: number;
  nominal_w4: number;
  target_w4: number;
  nominal_w5: number;
  target_w5: number;
  total_nominal: number;
  total_target: number;
  ach_w1: number;
  ach_w2: number;
  ach_w3: number;
  ach_w4: number;
  ach_w5: number;
  total_ach: number;
  [key: string]: unknown;
};
interface DailySummary {
  omset: number;
  retur_jual: number;
  biaya_platform: number;
  total_omset: number;
  target_bulanan: number;
  ach: number;
  nominal: number;
  open_so: number; // [BARU]
  sisa_piutang: number; // [BARU]
}
interface MonthlySummary {
  nominal: number;
  target: number;
  ach: number;
}
interface YtdSummary {
  nominal: number;
  target: number;
  ach: number;
}
interface ExcelRow {
  [key: string]: string | number | undefined;
}
interface TargetWeek {
  minggu: number;
  nominal: number;
  label: string;
  start_date: string;
  end_date: string;
}
interface ExistingTarget {
  minggu: number;
  nominal: number;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "705";

const activeTab = ref("daily");
const isLoading = ref(false);
const cabangOptions = ref<{ kode: string; nama: string }[]>([]);

const dailyData = ref<DailyItem[]>([]);
const weeklyData = ref<WeeklyItem[]>([]);
const monthlyData = ref<MonthlyItem[]>([]);
const ytdData = ref<YtdItem[]>([]);

// --- State untuk Toggle Kolom ---
const expandSO = ref(false); // Toggle kolom SO
const expandPiutang = ref(false); // Toggle kolom Piutang

// --- State Baru untuk Input Target ---
const showTargetDialog = ref(false);
const isSubmittingTarget = ref(false);

// State loading khusus saat menarik data target
const isFetchingTarget = ref(false);

const currentYear = new Date().getFullYear();
const filters = reactive({
  tahun: currentYear,
  bulan: new Date().getMonth() + 1,
  cabang: (authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "") as string,
});
// Form Target
const targetForm = reactive({
  tahun: currentYear,
  bulan: new Date().getMonth() + 1,
  kode_gudang: "",
  weeks: [] as TargetWeek[],
});
const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  title: format(new Date(0, i), "MMMM"),
}));
const rupiah = (v: number) => formatCurrency(v || 0, AppConfig.roundingPolicy);

// Headers dinamis berdasarkan tab
// --- Definisi Headers untuk Setiap Tab ---
const headersDaily = computed<DataTableHeader[]>(() => {
  const h: DataTableHeader[] = [
    { title: "No", key: "no", sortable: false, width: "50px" },
    { title: "Kode Cabang", key: "kode_cabang" },
    { title: "Nama Cabang", key: "nama_cabang", minWidth: "150px" },
    { title: "Hari", key: "hari" },
    { title: "Tanggal", key: "tanggal" },
    { title: "Omset", key: "omset" },
    { title: "Retur", key: "retur_jual" },
  ];

  // [BARU] Tambahkan kolom Biaya Platform jika Cabang yang dipilih adalah KON
  if (filters.cabang === "KON" || filters.cabang === "ALL") {
    h.push({ title: "Biaya Platform", key: "biaya_platform" });
  }

  h.push({ title: "Tot. Omset", key: "total_omset" });

  // Group Open SO
  h.push({
    title: "Open SO (Hari Ini)",
    key: "so_open_today",
    cellClass: "bg-orange-lighten-5 text-orange-darken-4 font-weight-bold",
    headerProps: { class: "cursor-pointer" },
    sortable: false,
  });

  if (expandSO.value) {
    h.push(
      {
        title: "SO (30 Hari)",
        key: "so_open_30days",
        cellClass: "bg-orange-lighten-5",
        sortable: false,
      },
      {
        title: "SO (Akumulasi)",
        key: "so_open_accum",
        cellClass: "bg-orange-lighten-5 font-weight-black",
        sortable: false,
      }
    );
  }

  // Group Piutang
  h.push({
    title: "Sisa Piutang (Hari Ini)",
    key: "piutang_today",
    cellClass: "bg-red-lighten-5 text-red-darken-4 font-weight-bold",
    headerProps: { class: "cursor-pointer" },
    sortable: false,
  });

  if (expandPiutang.value) {
    h.push(
      {
        title: "Piutang (30 Hari)",
        key: "piutang_30days",
        cellClass: "bg-red-lighten-5",
        sortable: false,
      },
      {
        title: "Piutang (Akumulasi)",
        key: "piutang_accum",
        cellClass: "bg-red-lighten-5 font-weight-black",
        sortable: false,
      }
    );
  }

  // Kolom Akhir
  h.push({ title: "Target", key: "target_bulanan" }, { title: "Ach(%)", key: "ach" });

  return h;
});
// const headersWeeklyGroup = [
//   { title: 'No', rowspan: 2, key: 'no' }, { title: 'Kode Cabang', rowspan: 2, key: 'kode_cabang' }, { title: 'Nama Cabang', rowspan: 2, key: 'nama_cabang' },
//   { title: 'Minggu 1', colspan: 3, align: 'center' }, { title: 'Minggu 2', colspan: 3, align: 'center' },
//   { title: 'Minggu 3', colspan: 3, align: 'center' }, { title: 'Minggu 4', colspan: 3, align: 'center' },
//   { title: 'Minggu 5', colspan: 3, align: 'center' }, { title: 'Total', colspan: 3, align: 'center' },
// ];
// const headersWeeklySub = [
//   'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)',
//   'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)',
// ];
const headersMonthly = [
  { title: "Tahun", key: "tahun" },
  { title: "Bulan", key: "bulan" },
  { title: "Kode Cabang", key: "kode_cabang" },
  { title: "Nama Cabang", key: "nama_cabang" },
  { title: "Omset", key: "nominal" },
  { title: "Target", key: "target" },
  { title: "Ach(%)", key: "ach" },
];
const headersYtd = [
  { title: "No", key: "no", sortable: false, width: "50px" },
  { title: "Tahun", key: "tahun" },
  { title: "Bulan", key: "bulan" },
  { title: "Total Omset", key: "nominal" },
  { title: "Target", key: "target" },
  { title: "Ach(%)", key: "ach" },
];

// const activeHeaders = computed(() => {
//   switch (activeTab.value) {
//     case 'daily': return headersDaily;
//     case 'weekly': return headersWeekly;
//     case 'monthly': return headersMonthlyYTD;
//     case 'ytd': return headersMonthlyYTD;
//     default: return [];
//   }
// });

const totalSummary = computed<DailySummary>(
  () =>
    (activeTab.value === "daily"
      ? dailyTotalSummary.value
      : activeTab.value === "weekly"
      ? weeklyTotalSummary.value
      : activeTab.value === "monthly"
      ? monthlyTotalSummary.value
      : activeTab.value === "ytd"
      ? ytdTotalSummary.value
      : { omset: 0, total_omset: 0, target_bulanan: 0, ach: 0 }) as DailySummary
);

const dailyTotalSummary = computed(() => {
  if (!dailyData.value.length) {
    return {
      omset: 0,
      retur_jual: 0,
      biaya_platform: 0,
      total_omset: 0,
      so_open_today: 0,
      piutang_today: 0,
      so_open_30days: 0,
      so_open_accum: 0,
      piutang_30days: 0,
      piutang_accum: 0,
      target_bulanan: 0,
      ach: 0,
    };
  }

  const lastRow = dailyData.value[dailyData.value.length - 1];
  const sum = (key: keyof DailyItem) =>
    dailyData.value.reduce((s, i) => s + (Number(i[key]) || 0), 0);

  return {
    // === TIPE FLOW ===
    omset: sum("omset"),
    retur_jual: sum("retur_jual"),
    biaya_platform: sum("biaya_platform"), // [BARU]

    total_omset: lastRow.total_omset,

    // === TIPE KHUSUS ===
    so_open_today: sum("so_open_today"),
    piutang_today: sum("piutang_today"),

    // === TIPE SNAPSHOT ===
    so_open_30days: lastRow.so_open_30days,
    so_open_accum: lastRow.so_open_accum,

    piutang_30days: lastRow.piutang_30days,
    piutang_accum: lastRow.piutang_accum,

    target_bulanan: lastRow.target_bulanan,
    ach: lastRow.target_bulanan > 0 ? (lastRow.total_omset / lastRow.target_bulanan) * 100 : 0,
  };
});

const weeklyTotalSummary = computed<WeeklyTotals>(() => {
  const defaultTotals: WeeklyTotals = {
    nominal_w1: 0,
    target_w1: 0,
    ach_w1: 0,
    nominal_w2: 0,
    target_w2: 0,
    ach_w2: 0,
    nominal_w3: 0,
    target_w3: 0,
    ach_w3: 0,
    nominal_w4: 0,
    target_w4: 0,
    ach_w4: 0,
    nominal_w5: 0,
    target_w5: 0,
    ach_w5: 0,
    total_nominal: 0,
    total_target: 0,
    total_ach: 0,
  };

  if (!weeklyData.value || weeklyData.value.length === 0) {
    return defaultTotals;
  }

  const totals = weeklyData.value.reduce<WeeklyTotals>(
    (acc, item) => {
      // Tulis manual 5 minggu. Terlihat panjang, tapi ini yang paling disukai TypeScript!
      acc.nominal_w1 += Number(item.nominal_w1 || 0);
      acc.target_w1 += Number(item.target_w1 || 0);

      acc.nominal_w2 += Number(item.nominal_w2 || 0);
      acc.target_w2 += Number(item.target_w2 || 0);

      acc.nominal_w3 += Number(item.nominal_w3 || 0);
      acc.target_w3 += Number(item.target_w3 || 0);

      acc.nominal_w4 += Number(item.nominal_w4 || 0);
      acc.target_w4 += Number(item.target_w4 || 0);

      acc.nominal_w5 += Number(item.nominal_w5 || 0);
      acc.target_w5 += Number(item.target_w5 || 0);

      acc.total_nominal += Number(item.total_nominal || 0);
      acc.total_target += Number(item.total_target || 0);
      return acc;
    },
    { ...defaultTotals }
  );

  // Hitung ACH manual
  totals.ach_w1 = totals.target_w1 > 0 ? (totals.nominal_w1 / totals.target_w1) * 100 : 0;
  totals.ach_w2 = totals.target_w2 > 0 ? (totals.nominal_w2 / totals.target_w2) * 100 : 0;
  totals.ach_w3 = totals.target_w3 > 0 ? (totals.nominal_w3 / totals.target_w3) * 100 : 0;
  totals.ach_w4 = totals.target_w4 > 0 ? (totals.nominal_w4 / totals.target_w4) * 100 : 0;
  totals.ach_w5 = totals.target_w5 > 0 ? (totals.nominal_w5 / totals.target_w5) * 100 : 0;

  totals.total_ach =
    totals.total_target > 0 ? (totals.total_nominal / totals.total_target) * 100 : 0;

  return totals;
});
const monthlyTotalSummary = computed<MonthlySummary>(() => {
  if (!monthlyData.value || monthlyData.value.length === 0) {
    // Return object lengkap, tidak boleh kosong
    return { nominal: 0, target: 0, ach: 0 } as MonthlySummary;
  }

  const totals = {
    nominal: monthlyData.value.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0),
    target: monthlyData.value.reduce((sum, item) => sum + (Number(item.target) || 0), 0),
  };

  return {
    ...totals,
    ach: totals.target > 0 ? (totals.nominal / totals.target) * 100 : 0,
  } as MonthlySummary;
});

const ytdTotalSummary = computed<YtdSummary>(() => {
  if (!ytdData.value || ytdData.value.length === 0) {
    return { nominal: 0, target: 0, ach: 0 } as YtdSummary;
  }

  const totals = {
    nominal: ytdData.value.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0),
    target: ytdData.value.reduce((sum, item) => sum + (Number(item.target) || 0), 0),
  };

  return {
    ...totals,
    ach: totals.target > 0 ? (totals.nominal / totals.target) * 100 : 0,
  } as YtdSummary;
});

// Fungsi bantuan murni tanpa dynamic key
const getWeekNominal = (item: WeeklyItem, week: number): number => {
  if (week === 1) return Number(item.nominal_w1 || 0);
  if (week === 2) return Number(item.nominal_w2 || 0);
  if (week === 3) return Number(item.nominal_w3 || 0);
  if (week === 4) return Number(item.nominal_w4 || 0);
  if (week === 5) return Number(item.nominal_w5 || 0);
  return 0;
};

const getWeekTarget = (item: WeeklyItem, week: number): number => {
  if (week === 1) return Number(item.target_w1 || 0);
  if (week === 2) return Number(item.target_w2 || 0);
  if (week === 3) return Number(item.target_w3 || 0);
  if (week === 4) return Number(item.target_w4 || 0);
  if (week === 5) return Number(item.target_w5 || 0);
  return 0;
};

const getSummaryNominal = (week: number): number => {
  if (week === 1) return Number(weeklyTotalSummary.value.nominal_w1 || 0);
  if (week === 2) return Number(weeklyTotalSummary.value.nominal_w2 || 0);
  if (week === 3) return Number(weeklyTotalSummary.value.nominal_w3 || 0);
  if (week === 4) return Number(weeklyTotalSummary.value.nominal_w4 || 0);
  if (week === 5) return Number(weeklyTotalSummary.value.nominal_w5 || 0);
  return 0;
};

const getSummaryTarget = (week: number): number => {
  if (week === 1) return Number(weeklyTotalSummary.value.target_w1 || 0);
  if (week === 2) return Number(weeklyTotalSummary.value.target_w2 || 0);
  if (week === 3) return Number(weeklyTotalSummary.value.target_w3 || 0);
  if (week === 4) return Number(weeklyTotalSummary.value.target_w4 || 0);
  if (week === 5) return Number(weeklyTotalSummary.value.target_w5 || 0);
  return 0;
};

const getSummaryAch = (week: number): number => {
  if (week === 1) return Number(weeklyTotalSummary.value.ach_w1 || 0);
  if (week === 2) return Number(weeklyTotalSummary.value.ach_w2 || 0);
  if (week === 3) return Number(weeklyTotalSummary.value.ach_w3 || 0);
  if (week === 4) return Number(weeklyTotalSummary.value.ach_w4 || 0);
  if (week === 5) return Number(weeklyTotalSummary.value.ach_w5 || 0);
  return 0;
};

// Computed Check Hak Akses (KDC & ADMIN)
const canInputTarget = computed(() => {
  const user = authStore.user;
  // Sesuaikan 'user.kode' dengan field ID User di database/store Anda
  return user?.cabang === "KDC" && user?.kode === "ADMIN";
});

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/monitoring-achievement", {
      params: { ...filters, reportType: activeTab.value },
    });
    // Simpan data ke state yang sesuai
    if (activeTab.value === "daily") dailyData.value = response.data;
    else if (activeTab.value === "weekly") weeklyData.value = response.data;
    else if (activeTab.value === "monthly") monthlyData.value = response.data;
    else if (activeTab.value === "ytd") ytdData.value = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>; // <- cast ke AxiosError dengan kemungkinan ada property message
    if (error.response) {
      toast.error(
        error.response.data?.message || `Gagal memuat data. Status: ${error.response.status}`
      );
    } else if (error.request) {
      toast.error("Tidak ada respon dari server. Periksa koneksi.");
    } else {
      toast.error(`Terjadi kesalahan: ${error.message || "Unknown error"}`);
    }
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get("/monitoring-achievement/cabang-options");
    cabangOptions.value = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN] Tambahkan unknown
    let msg = "Gagal memuat filter cabang.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg); // [PERBAIKAN] Cuma kirim string
  }
};

const exportData = () => {
  let dataToExport: ExcelRow[] = [];
  let worksheet: XLSX.WorkSheet | null = null;
  let fileName = `Laporan_Monitoring_Achievement_${filters.tahun}-${filters.bulan}.xlsx`;
  let sheetName = "Data";

  const dailyTotals = dailyTotalSummary.value;
  const weeklyTotals = weeklyTotalSummary.value;
  const monthlyTotals = monthlyTotalSummary.value;
  const ytdTotals = ytdTotalSummary.value;

  // --- Ambil Data dan Format Sesuai Tab Aktif ---
  switch (activeTab.value) {
    case "daily":
      if (dailyData.value.length === 0)
        return toast.warning("Tidak ada data Harian untuk diekspor.");
      sheetName = "Daily";
      fileName = `Laporan_Harian_${filters.cabang}_${filters.tahun}-${filters.bulan}.xlsx`;
      dataToExport = dailyData.value.map((item, index) => {
        const rowData: ExcelRow = {
          No: index + 1,
          "Kode Cabang": item.kode_cabang,
          "Nama Cabang": item.nama_cabang,
          Hari: item.hari,
          Tanggal: item.tanggal ? format(new Date(item.tanggal), "dd-MM-yyyy") : "",
          "Omset Harian": item.omset,
          "Retur Jual": item.retur_jual,
        };

        // [BARU] Masukkan ke Excel jika cabang = KON
        if (filters.cabang === "KON" || filters.cabang === "ALL") {
          rowData["Biaya Platform"] = item.biaya_platform;
        }

        rowData["Total Omset Kumulatif"] = item.total_omset;
        rowData["Target Bulanan"] = item.target_bulanan;
        rowData["Ach (%)"] = item.ach;

        return rowData;
      });

      // Tambahkan Grand Total
      if (dailyTotals && Object.keys(dailyTotals).length > 0) {
        dataToExport.push({}); // Baris kosong

        const grandTotalRow: ExcelRow = {
          No: "",
          "Kode Cabang": "",
          "Nama Cabang": "",
          Hari: "",
          Tanggal: "GRAND TOTAL:",
          "Omset Harian": dailyTotals.omset,
          "Retur Jual": dailyTotals.retur_jual,
        };

        // [BARU] Masukkan Grand Total ke Excel jika cabang = KON
        if (filters.cabang === "KON" || filters.cabang === "ALL") {
          grandTotalRow["Biaya Platform"] = dailyTotals.biaya_platform;
        }

        grandTotalRow["Total Omset Kumulatif"] = dailyTotals.total_omset;
        grandTotalRow["Target Bulanan"] = dailyTotals.target_bulanan;
        grandTotalRow["Ach (%)"] = dailyTotals.ach;

        dataToExport.push(grandTotalRow);
      }
      break;

    case "weekly":
      if (weeklyData.value.length === 0)
        return toast.warning("Tidak ada data Mingguan untuk diekspor.");
      sheetName = "Weekly";
      fileName = `Laporan_Mingguan_${filters.tahun}-${filters.bulan}.xlsx`;
      dataToExport = weeklyData.value.map((item, index) => ({
        No: index + 1,
        "Kode Cabang": item.kode_cabang,
        "Nama Cabang": item.nama_cabang,
        "Omset W1": item.nominal_w1,
        "Target W1": item.target_w1,
        "Ach W1 (%)": item.target_w1 > 0 ? (item.nominal_w1 / item.target_w1) * 100 : 0,
        "Omset W2": item.nominal_w2,
        "Target W2": item.target_w2,
        "Ach W2 (%)": item.target_w2 > 0 ? (item.nominal_w2 / item.target_w2) * 100 : 0,
        "Omset W3": item.nominal_w3,
        "Target W3": item.target_w3,
        "Ach W3 (%)": item.target_w3 > 0 ? (item.nominal_w3 / item.target_w3) * 100 : 0,
        "Omset W4": item.nominal_w4,
        "Target W4": item.target_w4,
        "Ach W4 (%)": item.target_w4 > 0 ? (item.nominal_w4 / item.target_w4) * 100 : 0,
        "Omset W5": item.nominal_w5,
        "Target W5": item.target_w5,
        "Ach W5 (%)": item.target_w5 > 0 ? (item.nominal_w5 / item.target_w5) * 100 : 0,
        "Total Omset": item.total_nominal,
        "Total Target": item.total_target,
        "Total Ach (%)": item.total_target > 0 ? (item.total_nominal / item.total_target) * 100 : 0,
      }));
      // Tambahkan Grand Total
      if (weeklyTotals && Object.keys(weeklyTotals).length > 0) {
        dataToExport.push({}); // Baris kosong
        dataToExport.push({
          No: "",
          "Kode Cabang": "",
          "Nama Cabang": "GRAND TOTAL:",
          "Omset W1": weeklyTotals.nominal_w1, // <-- Akses properti dari weeklyTotals
          "Target W1": weeklyTotals.target_w1,
          "Ach W1 (%)": weeklyTotals.ach_w1,
          "Omset W2": weeklyTotals.nominal_w2,
          "Target W2": weeklyTotals.target_w2,
          "Ach W2 (%)": weeklyTotals.ach_w2,
          "Omset W3": weeklyTotals.nominal_w3,
          "Target W3": weeklyTotals.target_w3,
          "Ach W3 (%)": weeklyTotals.ach_w3,
          "Omset W4": weeklyTotals.nominal_w4,
          "Target W4": weeklyTotals.target_w4,
          "Ach W4 (%)": weeklyTotals.ach_w4,
          "Omset W5": weeklyTotals.nominal_w5,
          "Target W5": weeklyTotals.target_w5,
          "Ach W5 (%)": weeklyTotals.ach_w5,
          "Total Omset": weeklyTotals.total_nominal,
          "Total Target": weeklyTotals.total_target,
          "Total Ach (%)": weeklyTotals.total_ach,
        });
      }
      break;

    case "monthly":
      if (monthlyData.value.length === 0)
        return toast.warning("Tidak ada data Bulanan untuk diekspor.");
      sheetName = "Monthly";
      fileName = `Laporan_Bulanan_${filters.tahun}-${filters.bulan}.xlsx`;
      dataToExport = monthlyData.value.map((item, index) => ({
        No: index + 1,
        Tahun: item.tahun,
        Bulan: monthOptions.find((m) => m.value === item.bulan)?.title || item.bulan,
        "Kode Cabang": item.kode_cabang,
        "Nama Cabang": item.nama_cabang,
        Omset: item.nominal,
        Target: item.target,
        "Ach (%)": item.ach,
      }));
      // Tambahkan Grand Total
      if (monthlyTotals && Object.keys(monthlyTotals).length > 0) {
        dataToExport.push({}); // Baris kosong
        dataToExport.push({
          No: "",
          Tahun: "",
          Bulan: "",
          "Kode Cabang": "",
          "Nama Cabang": "GRAND TOTAL:",
          Omset: monthlyTotals.nominal, // <-- Akses properti dari monthlyTotals
          Target: monthlyTotals.target,
          "Ach (%)": monthlyTotals.ach,
        });
      }
      break;

    case "ytd":
      if (ytdData.value.length === 0)
        return toast.warning("Tidak ada data Year to Date untuk diekspor.");
      sheetName = "YearToDate";
      fileName = `Laporan_Ytd_${filters.cabang}_${filters.tahun}.xlsx`;
      dataToExport = ytdData.value.map((item, index) => ({
        No: index + 1,
        Tahun: item.tahun,
        Bulan: monthOptions.find((m) => m.value === item.bulan)?.title || item.bulan,
        "Kode Cabang": item.kode_cabang, // Tambahkan ini jika perlu
        "Nama Cabang": item.nama_cabang, // Tambahkan ini jika perlu
        "Total Omset": item.nominal,
        Target: item.target,
        "Ach (%)": item.ach,
      }));
      // Tambahkan Grand Total
      if (ytdTotals && Object.keys(ytdTotals).length > 0) {
        dataToExport.push({}); // Baris kosong
        dataToExport.push({
          No: "",
          Tahun: "",
          Bulan: "GRAND TOTAL:",
          "Kode Cabang": "",
          "Nama Cabang": "",
          "Total Omset": ytdTotals.nominal, // <-- Akses properti dari ytdTotals
          Target: ytdTotals.target,
          "Ach (%)": ytdTotals.ach,
        });
      }
      break;

    default:
      toast.error("Tab tidak valid untuk ekspor.");
      return;
  }

  // --- Buat Worksheet & Download ---
  try {
    toast.info(`Membuat file Excel untuk tab ${sheetName}...`);
    if (dataToExport.length === 0) {
      toast.error("Tidak ada data sama sekali untuk diekspor.");
      return;
    }
    worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Optional: Atur lebar kolom (bisa disesuaikan)
    const firstDataRow = dataToExport.find((row) => row.No === 1) || dataToExport[0];
    const cols = Object.keys(firstDataRow).map((key) => ({
      wch: key.includes("Nama")
        ? 30
        : key.includes("Cabang")
        ? 15
        : key.includes("Tanggal")
        ? 12
        : key.includes("%")
        ? 8
        : 12,
    }));
    if (worksheet) worksheet["!cols"] = cols;

    // Atur format angka untuk kolom numerik (contoh)
    dataToExport.forEach((_row, r) => {
      // Cek jika baris BUKAN baris kosong atau label GRAND TOTAL
      const rowData = dataToExport[r];
      const isDataRow =
        rowData &&
        Object.values(rowData).some((val) => val !== "" && !String(val).includes("GRAND TOTAL"));

      if (isDataRow) {
        // Ambil keys dari baris ini atau baris data pertama
        const keys = Object.keys(rowData);
        keys.forEach((key, c) => {
          const cellRef = XLSX.utils.encode_cell({ r: r + 1, c }); // +1 karena header otomatis json_to_sheet

          // --- PERBAIKAN: Tambahkan cek worksheet && worksheet[cellRef] ---
          if (worksheet && worksheet[cellRef]) {
            const cellValue = worksheet[cellRef].v;

            if (typeof cellValue === "number") {
              if (key.includes("%")) {
                worksheet[cellRef].z = "0.00%";
                worksheet[cellRef].t = "n";
                // Cek jika nilai belum dibagi 100 (misalnya dari total summary)
                if (cellValue > 1 || cellValue < -1) {
                  worksheet[cellRef].v = cellValue / 100;
                }
              } else if (
                !key.toLowerCase().includes("no") &&
                !key.toLowerCase().includes("tahun") &&
                !key.toLowerCase().includes("bulan")
              ) {
                worksheet[cellRef].z = "#,##0";
                worksheet[cellRef].t = "n";
              }
            } else if (
              key.includes("%") &&
              typeof cellValue === "string" &&
              cellValue.endsWith("%")
            ) {
              // Jika sudah string dengan %, coba konversi
              const numValue = parseFloat(cellValue.replace("%", ""));
              if (!isNaN(numValue)) {
                worksheet[cellRef].v = numValue / 100;
                worksheet[cellRef].z = "0.00%";
                worksheet[cellRef].t = "n";
              }
            }
          }
          // -----------------------------------------------------------------
        });
      }
    });

    if (!worksheet) {
      throw new Error("Worksheet gagal dibuat.");
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
    toast.success(`File ${fileName} berhasil diekspor.`);
  } catch (error) {
    toast.error("Gagal membuat file Excel.");
    console.error("Export Excel error:", error);
  }
};

const openTargetDialog = () => {
  targetForm.tahun = filters.tahun;
  targetForm.bulan = filters.bulan;
  targetForm.kode_gudang = "";
  targetForm.weeks = generateFourWeeks(filters.tahun, filters.bulan);
  showTargetDialog.value = true;
};

const saveTarget = async () => {
  if (!targetForm.kode_gudang) {
    toast.warning("Silakan pilih cabang terlebih dahulu.");
    return;
  }

  isSubmittingTarget.value = true;
  try {
    const payload = {
      tahun: targetForm.tahun,
      bulan: targetForm.bulan,
      kode_gudang: targetForm.kode_gudang,
      targets: targetForm.weeks.map((w) => ({
        minggu: w.minggu,
        nominal: w.nominal,
        start_date: w.start_date, // <--- KIRIM TANGGAL ASLI
        end_date: w.end_date, // <--- KIRIM TANGGAL ASLI
      })),
    };

    await api.post("/monitoring-achievement/save-target", payload);

    toast.success("Target berhasil disimpan!");
    showTargetDialog.value = false;

    // Refresh data utama jika filter tahun/bulan sama
    if (filters.tahun === targetForm.tahun && filters.bulan === targetForm.bulan) {
      fetchData();
    }
  } catch (err: unknown) {
    // Casting error ke tipe AxiosError dengan struktur response yang diharapkan
    const error = err as AxiosError<{ message: string }>;

    // Sekarang TypeScript mengenali .response.data.message
    toast.error(error.response?.data?.message || "Gagal menyimpan target.");
  } finally {
    isSubmittingTarget.value = false;
  }
};

// Hitung total target di form untuk preview
const totalTargetInput = computed(() => {
  return targetForm.weeks.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
});

// [PERBAIKAN] Fungsi Generate Tepat 4 Minggu
const generateFourWeeks = (year: number, month: number) => {
  // Ambil tanggal terakhir di bulan tersebut (28, 29, 30, atau 31)
  const lastDay = new Date(year, month, 0).getDate();
  const strMonth = String(month).padStart(2, "0");

  return [
    {
      minggu: 1,
      start_date: `${year}-${strMonth}-01`,
      end_date: `${year}-${strMonth}-07`,
      label: "Minggu 1 (Tgl 1 - 7)",
      nominal: 0,
    },
    {
      minggu: 2,
      start_date: `${year}-${strMonth}-08`,
      end_date: `${year}-${strMonth}-14`,
      label: "Minggu 2 (Tgl 8 - 14)",
      nominal: 0,
    },
    {
      minggu: 3,
      start_date: `${year}-${strMonth}-15`,
      end_date: `${year}-${strMonth}-21`,
      label: "Minggu 3 (Tgl 15 - 21)",
      nominal: 0,
    },
    {
      minggu: 4,
      start_date: `${year}-${strMonth}-22`,
      end_date: `${year}-${strMonth}-${String(lastDay).padStart(2, "0")}`,
      label: `Minggu 4 (Tgl 22 - ${lastDay})`, // <--- Otomatis mengikuti akhir bulan
      nominal: 0,
    },
  ];
};

// Fungsi untuk menyedot data target dari database
const fetchExistingTarget = async () => {
  if (!targetForm.kode_gudang) return;

  isFetchingTarget.value = true;
  try {
    const response = await api.get("/monitoring-achievement/target-detail", {
      params: {
        tahun: targetForm.tahun,
        bulan: targetForm.bulan,
        cabang: targetForm.kode_gudang,
      },
    });

    // [PERBAIKAN] Cast tipe datanya
    const existingData = response.data as ExistingTarget[];

    if (existingData && existingData.length > 0) {
      targetForm.weeks.forEach((w) => {
        // [PERBAIKAN] Tidak perlu ': any' lagi karena TS sudah tahu d itu ExistingTarget
        const found = existingData.find((d) => d.minggu === w.minggu);
        w.nominal = found ? Number(found.nominal) : 0;
      });
      toast.info("Data target ditemukan. Menampilkan data tersimpan.");
    } else {
      targetForm.weeks.forEach((w) => (w.nominal = 0));
    }
  } catch (error) {
    console.error("Gagal menarik data target:", error);
    toast.error("Gagal mengecek data target sebelumnya.");
  } finally {
    isFetchingTarget.value = false;
  }
};

onMounted(() => {
  fetchCabangOptions();
  fetchData();
});
watch(activeTab, (newTab) => {
  // Reset filter cabang ke default saat pindah tab
  if (newTab === "weekly" || newTab === "monthly") {
    // Untuk weekly dan monthly, tidak perlu filter cabang spesifik
    // Biarkan kosong atau set ke default
  } else if (newTab === "daily" || newTab === "ytd") {
    // Untuk daily dan ytd, kembalikan ke default user
    if (authStore.user?.cabang !== "KDC") {
      // [PERBAIKAN] Tambahkan fallback || "" agar TS yakin ini pasti string
      filters.cabang = authStore.user?.cabang || "";
    }
  }

  // Fetch data akan otomatis terpanggil karena ada watch di [filters, activeTab]
});

// Watcher agar jika Tahun/Bulan di pop-up diubah, label dan tanggalnya otomatis update
watch(
  () => [targetForm.tahun, targetForm.bulan, targetForm.kode_gudang],
  async ([newTahun, newBulan, newGudang], [oldTahun, oldBulan]) => {
    // 1. Jika Tahun atau Bulan berubah, generate ulang kalendernya (Tgl 1-7, dst)
    if (newTahun !== oldTahun || newBulan !== oldBulan) {
      targetForm.weeks = generateFourWeeks(Number(newTahun), Number(newBulan));
    }

    // 2. Jika Gudang (Cabang) sudah dipilih, langsung sedot datanya
    if (newGudang) {
      await fetchExistingTarget();
    } else {
      // Jika gudang dikosongkan, reset nominal jadi 0
      targetForm.weeks.forEach((w) => (w.nominal = 0));
    }
  }
);

watch([filters, activeTab], fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Monitoring Achievement" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="canInputTarget"
        size="small"
        color="primary"
        prepend-icon="mdi-target"
        class="mr-2"
        @click="openTargetDialog"
      >
        Input Target
      </v-btn>
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportData">
        Export
      </v-btn>
    </template>

    <v-tabs v-model="activeTab" class="mb-2">
      <v-tab value="daily">Daily</v-tab>
      <v-tab value="weekly">Weekly</v-tab>
      <v-tab value="monthly">Monthly</v-tab>
      <v-tab value="ytd">Year to Date</v-tab>
    </v-tabs>

    <div class="browse-content">
      <div class="filter-section">
        <v-select
          v-model="filters.tahun"
          :items="yearOptions"
          label="Tahun"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
        />
        <v-select
          v-if="activeTab !== 'ytd'"
          v-model="filters.bulan"
          :items="monthOptions"
          item-title="title"
          item-value="value"
          label="Bulan"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 180px"
        />
        <v-select
          v-if="activeTab === 'daily' || activeTab === 'ytd'"
          v-model="filters.cabang"
          :items="cabangOptions"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 200px"
          :readonly="authStore.user?.cabang !== 'KDC'"
        />
        <v-spacer />
        <v-btn
          @click="fetchData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="isLoading"
        />
      </div>

      <div class="table-container">
        <v-window v-model="activeTab">
          <!-- Tab Daily -->
          <v-window-item value="daily">
            <AppDataTable
              :headers="headersDaily"
              :items="dailyData"
              :loading="isLoading"
              class="desktop-table header-browse-blue"
              density="compact"
              height="550"
              fixed-header
              :items-per-page="-1"
            >
              <template v-slot:[`header.so_open_today`]="{ column }">
                <div
                  class="d-flex align-center justify-end cursor-pointer"
                  @click.stop="expandSO = !expandSO"
                  title="Klik untuk lihat detail"
                >
                  <v-icon
                    size="small"
                    :icon="expandSO ? 'mdi-chevron-left' : 'mdi-chevron-right'"
                    class="mr-1 text-orange-darken-4"
                  ></v-icon>
                  <span class="text-orange-darken-4">{{ column.title }}</span>
                </div>
              </template>

              <template v-slot:[`header.piutang_today`]="{ column }">
                <div
                  class="d-flex align-center justify-end cursor-pointer"
                  @click.stop="expandPiutang = !expandPiutang"
                  title="Klik untuk lihat detail"
                >
                  <v-icon
                    size="small"
                    :icon="expandPiutang ? 'mdi-chevron-left' : 'mdi-chevron-right'"
                    class="mr-1 text-red-darken-4"
                  ></v-icon>
                  <span class="text-red-darken-4">{{ column.title }}</span>
                </div>
              </template>

              <template v-slot:[`item.no`]="{ index }">{{ index + 1 }}</template>
              <template v-slot:[`item.tanggal`]="{ item }">
                <span class="font-weight-medium">{{
                  format(new Date(item.tanggal), "dd-MM-yyyy")
                }}</span>
              </template>

              <template
                v-for="key in [
                  'omset',
                  'retur_jual',
                  'biaya_platform',
                  'total_omset',
                  'target_bulanan',
                  'so_open_today',
                  'so_open_30days',
                  'so_open_accum',
                  'piutang_today',
                  'piutang_30days',
                  'piutang_accum',
                ]"
                v-slot:[`item.${key}`]="{ item }"
              >
                {{ rupiah(item[key]) }}
              </template>

              <template v-slot:[`item.ach`]="{ item }">
                <td class="text-end">
                  <v-chip
                    size="small"
                    :color="item.ach < 100 ? 'error' : item.ach < 200 ? 'success' : 'primary'"
                  >
                    {{ (item.ach || 0).toFixed(2) }}%
                  </v-chip>
                </td>
              </template>

              <template v-slot:[`body.append`]>
                <tr class="bg-grey-lighten-3 font-weight-bold total-row-sticky text-caption">
                  <td colspan="5" class="text-start pl-4">GRAND TOTAL :</td>

                  <td class="text-start">{{ rupiah(dailyTotalSummary.omset) }}</td>
                  <td class="text-start">{{ rupiah(dailyTotalSummary.retur_jual) }}</td>
                  <td
                    v-if="filters.cabang === 'KON' || filters.cabang === 'ALL'"
                    class="text-start text-red-darken-1"
                  >
                    {{ rupiah(dailyTotalSummary.biaya_platform) }}
                  </td>
                  <td class="text-start">{{ rupiah(dailyTotalSummary.total_omset) }}</td>

                  <td class="text-start bg-orange-lighten-5 text-orange-darken-4">
                    {{ rupiah(dailyTotalSummary.so_open_today) }}
                  </td>
                  <td v-if="expandSO" class="text-start bg-orange-lighten-5">
                    {{ rupiah(dailyTotalSummary.so_open_30days) }}
                  </td>
                  <td v-if="expandSO" class="text-start bg-orange-lighten-5">
                    {{ rupiah(dailyTotalSummary.so_open_accum) }}
                  </td>

                  <td class="text-start bg-red-lighten-5 text-red-darken-4">
                    {{ rupiah(dailyTotalSummary.piutang_today) }}
                  </td>
                  <td v-if="expandPiutang" class="text-start bg-red-lighten-5">
                    {{ rupiah(dailyTotalSummary.piutang_30days) }}
                  </td>
                  <td v-if="expandPiutang" class="text-start bg-red-lighten-5">
                    {{ rupiah(dailyTotalSummary.piutang_accum) }}
                  </td>

                  <td class="text-start">{{ rupiah(dailyTotalSummary.target_bulanan) }}</td>
                  <td class="text-start">{{ (dailyTotalSummary.ach || 0).toFixed(2) }}%</td>
                </tr>
              </template>
            </AppDataTable>
          </v-window-item>

          <!-- Tab Weekly -->
          <v-window-item value="weekly">
            <div style="overflow-x: auto">
              <table class="weekly-table">
                <thead>
                  <tr>
                    <th rowspan="2" style="min-width: 40px">No</th>
                    <th rowspan="2" style="min-width: 80px">Kode Cabang</th>
                    <th rowspan="2" style="min-width: 120px">Nama Cabang</th>
                    <th colspan="3" class="text-center">Minggu 1</th>
                    <th colspan="3" class="text-center">Minggu 2</th>
                    <th colspan="3" class="text-center">Minggu 3</th>
                    <th colspan="3" class="text-center">Minggu 4</th>
                    <th colspan="3" class="text-center">Minggu 5</th>
                    <th colspan="3" class="text-center">Total</th>
                  </tr>
                  <tr>
                    <template v-for="w in 6" :key="w">
                      <th class="text-end" style="min-width: 100px">Omset</th>
                      <th class="text-end" style="min-width: 100px">Target</th>
                      <th class="text-center" style="min-width: 70px">Ach(%)</th>
                    </template>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="isLoading">
                    <td colspan="21" class="text-center py-4">Loading...</td>
                  </tr>
                  <tr v-else-if="weeklyData.length === 0">
                    <td colspan="21" class="text-center py-4">Tidak ada data</td>
                  </tr>
                  <template v-else>
                    <tr v-for="(item, index) in weeklyData" :key="index">
                      <td class="text-center">{{ index + 1 }}</td>
                      <td>{{ item.kode_cabang }}</td>
                      <td>{{ item.nama_cabang }}</td>
                      <template v-for="w in 5" :key="w">
                        <td class="text-end">{{ rupiah(getWeekNominal(item, w)) }}</td>
                        <td class="text-end">{{ rupiah(getWeekTarget(item, w)) }}</td>
                        <td class="text-center">
                          <v-chip
                            size="x-small"
                            :color="
                              (() => {
                                const t = getWeekTarget(item, w);
                                const n = getWeekNominal(item, w);
                                const val = t > 0 ? (n / t) * 100 : 0;
                                return val < 100 ? 'error' : val < 200 ? 'success' : 'primary';
                              })()
                            "
                          >
                            {{
                              (() => {
                                const t = getWeekTarget(item, w);
                                const n = getWeekNominal(item, w);
                                return t > 0 ? ((n / t) * 100).toFixed(2) : "0.00";
                              })()
                            }}%
                          </v-chip>
                        </td>
                      </template>
                      <td class="text-end font-weight-bold">{{ rupiah(item.total_nominal) }}</td>
                      <td class="text-end font-weight-bold">{{ rupiah(item.total_target) }}</td>
                      <td class="text-center">
                        <v-chip
                          size="x-small"
                          :color="
                            (item.total_target > 0
                              ? (item.total_nominal / item.total_target) * 100
                              : 0) >= 100
                              ? 'success'
                              : 'error'
                          "
                        >
                          {{
                            (item.total_target > 0
                              ? (item.total_nominal / item.total_target) * 100
                              : 0
                            ).toFixed(2)
                          }}%
                        </v-chip>
                      </td>
                    </tr>
                  </template>
                </tbody>
                <tfoot v-if="weeklyData.length > 0">
                  <tr class="total-row-sticky">
                    <td colspan="3" class="text-end">GRAND TOTAL :</td>
                    <template v-for="w in 5" :key="w">
                      <td class="text-end">{{ rupiah(getSummaryNominal(w)) }}</td>
                      <td class="text-end">{{ rupiah(getSummaryTarget(w)) }}</td>
                      <td class="text-center">{{ getSummaryAch(w).toFixed(2) }}%</td>
                    </template>
                    <td class="text-end">{{ rupiah(weeklyTotalSummary.total_nominal) }}</td>
                    <td class="text-end">{{ rupiah(weeklyTotalSummary.total_target) }}</td>
                    <td class="text-center">
                      {{ (weeklyTotalSummary.total_ach || 0).toFixed(2) }}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </v-window-item>

          <!-- Tab Monthly -->
          <v-window-item value="monthly">
            <AppDataTable
              :headers="headersMonthly"
              :items="monthlyData"
              :loading="isLoading"
              class="desktop-table header-browse-blue"
              density="compact"
              fixed-header
              :items-per-page="-1"
            >
              <template
                v-for="col in ['nominal', 'target']"
                :key="col"
                v-slot:[`item.${col}`]="{ item }"
              >
                <td class="text-end">{{ rupiah(item[col]) }}</td>
              </template>
              <template v-slot:[`item.ach`]="{ item }">
                <td class="text-end">
                  <v-chip
                    size="small"
                    :color="item.ach < 100 ? 'error' : item.ach < 200 ? 'success' : 'primary'"
                  >
                    {{ (item.ach || 0).toFixed(2) }}%
                  </v-chip>
                </td>
              </template>
              <template v-slot:[`body.append`]>
                <tr class="total-row-sticky">
                  <td></td>
                  <td></td>
                  <td></td>
                  <td class="text-start">GRAND TOTAL :</td>
                  <td class="text-start">{{ rupiah(totalSummary.nominal) }}</td>
                  <td class="text-start">{{ rupiah(totalSummary.target_bulanan) }}</td>
                  <td class="text-start">{{ (totalSummary.ach || 0).toFixed(2) }}%</td>
                </tr>
              </template>
              <template #bottom></template>
            </AppDataTable>
          </v-window-item>

          <!-- Tab Year to Date -->
          <v-window-item value="ytd">
            <AppDataTable
              :headers="headersYtd"
              :items="ytdData"
              :loading="isLoading"
              class="desktop-table header-browse-blue"
              density="compact"
              fixed-header
              :items-per-page="-1"
            >
              <template v-slot:[`item.no`]="{ index }">
                {{ index + 1 }}
              </template>
              <template v-slot:[`item.bulan`]="{ item }">
                {{ monthOptions.find((m) => m.value === item.bulan)?.title }}
              </template>
              <template
                v-for="col in ['nominal', 'target']"
                :key="col"
                v-slot:[`item.${col}`]="{ item }"
              >
                <td class="text-end">{{ rupiah(item[col]) }}</td>
              </template>
              <template v-slot:[`item.ach`]="{ item }">
                <td class="text-end">
                  <v-chip size="small" :color="item.ach >= 100 ? 'success' : 'error'">
                    {{ (item.ach || 0).toFixed(2) }}%
                  </v-chip>
                </td>
              </template>
              <template v-slot:[`body.append`]>
                <tr class="total-row-sticky">
                  <td></td>
                  <td></td>
                  <td class="text-start">GRAND TOTAL :</td>
                  <td class="text-start">{{ rupiah(totalSummary.nominal) }}</td>
                  <td class="text-start">{{ rupiah(totalSummary.target_bulanan) }}</td>
                  <td class="text-start">{{ (totalSummary.ach || 0).toFixed(2) }}%</td>
                </tr>
              </template>
              <template #bottom></template>
            </AppDataTable>
          </v-window-item>
        </v-window>
      </div>
    </div>

    <v-dialog v-model="showTargetDialog" max-width="600px" persistent>
      <v-card>
        <v-card-title class="bg-primary text-white"> Input Target Store </v-card-title>
        <v-card-text class="pt-4">
          <v-row dense>
            <v-col cols="4">
              <v-select
                v-model="targetForm.tahun"
                :items="yearOptions"
                label="Tahun"
                density="compact"
                variant="outlined"
              />
            </v-col>
            <v-col cols="4">
              <v-select
                v-model="targetForm.bulan"
                :items="monthOptions"
                item-title="title"
                item-value="value"
                label="Bulan"
                density="compact"
                variant="outlined"
              />
            </v-col>
            <v-col cols="4">
              <v-select
                v-model="targetForm.kode_gudang"
                :items="cabangOptions.filter((c) => c.kode !== 'ALL')"
                item-title="nama"
                item-value="kode"
                label="Cabang"
                density="compact"
                variant="outlined"
              />
            </v-col>
          </v-row>

          <v-divider class="my-3"></v-divider>
          <div class="text-subtitle-2 mb-2">Rincian Target Mingguan</div>

          <v-row dense v-for="(week, index) in targetForm.weeks" :key="index">
            <v-col cols="5" class="d-flex align-center">
              <span class="text-body-2">{{ week.label }}</span>
            </v-col>
            <v-col cols="7">
              <v-text-field
                :model-value="week.nominal ? week.nominal.toLocaleString('id-ID') : ''"
                @update:model-value="
                  (val) => (week.nominal = Number(String(val).replace(/[^0-9]/g, '')) || 0)
                "
                prefix="Rp"
                type="text"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>
          </v-row>

          <div class="mt-4 p-2 bg-grey-lighten-4 rounded d-flex justify-space-between align-center">
            <span class="font-weight-bold">Total Target Bulan Ini:</span>
            <span class="text-h6 text-primary">{{ rupiah(totalTargetInput) }}</span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showTargetDialog = false">Batal</v-btn>
          <v-btn color="primary" variant="flat" @click="saveTarget" :loading="isSubmittingTarget">
            Simpan Target
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  padding: 16px;
}

.filter-section {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  gap: 8px;
}

.table-container {
  /* overflow-x: auto; */
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

:deep(.v-table__wrapper) {
  max-height: 500px;
  /* tinggi scroll area */
  overflow-y: auto !important;
  /* wajib agar sticky bisa berfungsi */
  position: relative;
  /* buat referensi posisi sticky */
}

/* Styling untuk tabel weekly */
.weekly-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px !important;
  background: white;
}

.weekly-table th,
.weekly-table td {
  padding: 6px 8px !important;
  border: 1px solid #e0e0e0;
  font-size: 11px !important;
  white-space: nowrap;
}

.weekly-table thead th {
  background-color: #f5f5f5;
  font-weight: 600;
  font-size: 11px !important;
  position: sticky;
  top: 0;
  z-index: 10;
}

.weekly-table tbody td {
  font-size: 11px !important;
}

/* Override v-chip untuk tabel weekly */
.weekly-table :deep(.v-chip) {
  font-size: 10px !important;
  height: 18px !important;
  padding: 0 4px !important;
  min-width: 50px;
}

.weekly-table :deep(.v-chip__content) {
  padding: 0 !important;
}

/* Alignment khusus */
.text-end {
  text-align: right !important;
}

.text-center {
  text-align: center !important;
}

.font-weight-bold {
  font-weight: 600 !important;
}

.grand-total-row {
  background-color: #f5f5f5 !important;
}

.total-row-sticky td {
  position: sticky;
  bottom: 0;
  z-index: 20;
  /* pastikan lebih tinggi dari header */
  background-color: #eeeeee !important;
  border-top: 2px solid #bdbdbd !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  padding: 10px 16px !important;
}

/* Penyesuaian kecil untuk font tabel weekly agar konsisten */
.weekly-table .total-row-sticky td {
  font-size: 11px !important;
  padding: 8px !important;
  background-color: #f5f5f5 !important;
  /* Samakan dengan tfoot weekly sebelumnya */
  border-top: 2px solid #9e9e9e !important;
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive, watch } from "vue";
import { gsap } from "gsap";
import api from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";
import { useTheme } from "vuetify";
import type { AxiosError } from "axios";
import { formatRupiah } from "@/utils/formatRupiah";
import { Bar, Line } from "vue-chartjs";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
} from "chart.js";
import type { ChartData, ChartOptions } from "chart.js";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/plus-jakarta-sans";

ChartJS.register(
  LineElement,
  PointElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler
);

ChartJS.defaults.font.family =
  '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", "Roboto", sans-serif';

interface CabangOption {
  kode: string;
  nama: string;
}

interface StoreBreakdown {
  kode_cabang: string;
  nama_cabang: string;
  nominal: number;
  target: number;
  ach: number;
  prevNominal: number;
  growthPercent: number;
}

interface TrendPoint {
  tahun: number;
  bulan: number;
  label: string;
  nominal: number;
  target: number;
  ach: number;
}

interface TargetAchievementData {
  isKDC: boolean;
  isViewingAll: boolean;
  cabangLabel: string;
  periodeLabel: string;
  tahun: number;
  bulan: number;
  nominal: number;
  target: number;
  ach: number;
  growthPercent: number;
  perStore: StoreBreakdown[];
  trend: TrendPoint[];
}

interface CardFormula {
  definisi: string;
  rumus: string;
  ambang: string;
  catatan?: string;
}

interface StokMinusRow {
  kode: string;
  nama: string;
  ukuran: string;
  cabang: string;
  qty: number;
}

interface SummaryCard {
  key: string;
  title: string;
  icon?: string;
  current: number;
  total: number | null;
  nominal?: number;
  percent: number | null;
  status: "baik" | "perhatian" | "kritis" | "netral";
  type?: string;
  unit?: string;
  fractionDigits?: number;
  jumlahLhk?: number;
  harian?: HarianPoint[];
  extra?: {
    label: string;
    current: number;
    total: number;
  };
  pcsMinus?: number;
  preview?: StokMinusRow[];
  formula?: CardFormula | null;
}

interface HarianPoint {
  tanggal: string;
  meter: number;
}

interface DetailRow {
  nomor: string;
  invNomor?: string;
  tanggal?: string;
  dateline?: string;
  customer?: string;
  nominal?: number;
  status?: string;
  ukuran?: string;
  cabang?: string;
  qty?: number;
}

type StatusFilter = "kritis" | "perhatian" | "baik";

interface CardMeta {
  group: string;
  routeName?: string;
  wide?: boolean;
  layout?: "stok" | "harian";
  routeParam?: string;
}

interface CardGroupView {
  key: string;
  title: string;
  cards: SummaryCard[];
  kritis: number;
  perhatian: number;
  baik: number;
}

// Pengelompokan + tujuan klik baris detail per card. Card dari backend yang
// belum terdaftar di sini tetap tampil (grup "Lainnya"), hanya tanpa navigasi.
const CARD_GROUPS: { key: string; title: string }[] = [
  { key: "penawaran", title: "Penawaran & Pengajuan Harga" },
  { key: "pesanan", title: "Surat Pesanan" },
  { key: "pelanggan", title: "Pelanggan" },
  { key: "transaksi", title: "Retur, Refund & Peminjaman" },
  { key: "produksi", title: "Produksi & Stok" },
  { key: "lainnya", title: "Lainnya" },
];

const CARD_META: Record<string, CardMeta> = {
  penawaran_belum_follow_up: { group: "penawaran", routeName: "Ubah Penawaran" },
  penawaran_closing: { group: "penawaran", routeName: "Ubah Penawaran" },
  pengajuan_harga_open: { group: "penawaran", routeName: "Ubah Pengajuan Harga" },
  sp_belum_invoice: { group: "pesanan", routeName: "SuratPesananEdit" },
  sp_belum_ready: { group: "pesanan", routeName: "SuratPesananEdit" },
  sp_over_deadline: { group: "pesanan", routeName: "SuratPesananEdit" },
  sp_belum_dp: { group: "pesanan", routeName: "SuratPesananEdit" },
  sp_siap_belum_diambil: { group: "pesanan", routeName: "SuratPesananEdit" },
  sp_belum_lunas: { group: "pesanan", routeName: "SuratPesananEdit" },
  customer_baru: { group: "pelanggan" },
  repeat_order: { group: "pelanggan" },
  retur_jual: { group: "transaksi", routeName: "ReturJualEdit" },
  refund_approve: { group: "transaksi", routeName: "RefundEdit" },
  peminjaman_belum_kembali: {
    group: "transaksi",
    routeName: "PeminjamanBarangEdit",
    routeParam: "id",
  },
  minta_barang_belum_diproses: { group: "produksi", routeName: "MintaBarangEdit" },
  produksi_terlambat: { group: "produksi", routeName: "SoManksiDetail" },
  pet_dtf_panjang: { group: "produksi", wide: true, layout: "harian" },
  stok_minus: { group: "produksi", wide: true, layout: "stok" },
};

const authStore = useAuthStore();
const toast = useToast();
const router = useRouter();
const vuetifyTheme = useTheme();
const isDark = computed(() => vuetifyTheme.global.current.value.dark);
const chartInk = computed(() => (isDark.value ? "243, 232, 228" : "31, 26, 25"));
const cards = ref<SummaryCard[]>([]);
// Nilai "current" yang benar-benar dirender di layar, terpisah dari
// nilai asli di `cards` — supaya bisa di-tween pelan-pelan saat berubah,
// bukan langsung loncat begitu data baru datang dari polling.
const displayCurrent = reactive<Record<string, number>>({});
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const animateCardNumbers = (newCards: SummaryCard[]) => {
  newCards.forEach((card) => {
    // Pertama muncul: berhitung naik dari 0 (kecuali reduced motion)
    if (!(card.key in displayCurrent)) {
      if (prefersReducedMotion()) {
        displayCurrent[card.key] = card.current;
        return;
      }
      displayCurrent[card.key] = 0;
      gsap.to(displayCurrent, {
        [card.key]: card.current,
        duration: 1.3,
        delay: 0.45,
        ease: "power2.out",
      });
      return;
    }
    if (displayCurrent[card.key] === card.current) return;
    gsap.to(displayCurrent, {
      [card.key]: card.current,
      duration: 1.2,
      ease: "power2.out",
    });
  });
};

const displayTa = reactive({ ach: 0, nominal: 0 });
let taInitialized = false;

const animateHeroNumbers = (data: TargetAchievementData) => {
  if (!taInitialized) {
    taInitialized = true;
    if (prefersReducedMotion()) {
      displayTa.ach = data.ach;
      displayTa.nominal = data.nominal;
      return;
    }
    gsap.to(displayTa, {
      ach: data.ach,
      nominal: data.nominal,
      duration: 1.4,
      delay: 0.2,
      ease: "power2.out",
    });
    return;
  }
  gsap.to(displayTa, { ach: data.ach, nominal: data.nominal, duration: 1.2, ease: "power2.out" });
};

const loadingCards = ref(true);
const taData = ref<TargetAchievementData | null>(null);
const loadingTa = ref(true);
const lastUpdated = ref<Date | null>(null);
const lastUpdatedLabel = computed(() =>
  lastUpdated.value
    ? lastUpdated.value.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : ""
);

const showStoreBreakdown = ref(false);
const storeBreakdownMounted = ref(false);
const toggleStoreBreakdown = () => {
  showStoreBreakdown.value = !showStoreBreakdown.value;
  if (showStoreBreakdown.value) storeBreakdownMounted.value = true;
};

const introDone = ref(false);
let introTimer: number | undefined;
const showDetailDialog = ref(false);
const detailLoading = ref(false);
const detailRows = ref<DetailRow[]>([]);
const activeCard = ref<SummaryCard | null>(null);
const detailPage = ref(1);
const detailFinished = ref(false);
const detailLoadingMore = ref(false);
const DETAIL_PAGE_SIZE = 30;
const cabangList = ref<CabangOption[]>([]);
const selectedCabang = ref<string>("ALL");
const now = new Date();
const selectedBulan = ref(now.getMonth() + 1);
const selectedTahun = ref(now.getFullYear());

const bulanOptions = [
  { title: "Januari", value: 1 },
  { title: "Februari", value: 2 },
  { title: "Maret", value: 3 },
  { title: "April", value: 4 },
  { title: "Mei", value: 5 },
  { title: "Juni", value: 6 },
  { title: "Juli", value: 7 },
  { title: "Agustus", value: 8 },
  { title: "September", value: 9 },
  { title: "Oktober", value: 10 },
  { title: "November", value: 11 },
  { title: "Desember", value: 12 },
];

const fetchCabangOptions = async () => {
  if (!isKDC.value) return;
  try {
    const res = await api.get<CabangOption[]>("/dashboard/cabang-options");
    cabangList.value = res.data.filter((c) => c.kode !== "ALL"); // BARU — buang entri ALL bawaan API
  } catch {
    // silent — dropdown opsional, tidak perlu toast kalau gagal
  }
};

const cabangParam = () =>
  isKDC.value && selectedCabang.value !== "ALL" ? selectedCabang.value : undefined;

const fetchSummary = async (isBackground = false) => {
  if (!isBackground) loadingCards.value = true;
  try {
    const res = await api.get<SummaryCard[]>("/dashboard/work-summary", {
      params: {
        cabang: cabangParam(),
        bulan: selectedBulan.value,
        tahun: selectedTahun.value,
      },
    });
    cards.value = res.data;
    lastUpdated.value = new Date();
    animateCardNumbers(res.data);
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat ringkasan pekerjaan.");
  } finally {
    if (!isBackground) loadingCards.value = false;
  }
};

const fetchTargetAchievement = async (isBackground = false) => {
  if (!isBackground) loadingTa.value = true;
  try {
    const res = await api.get<TargetAchievementData>("/dashboard/target-achievement-summary", {
      params: {
        cabang: cabangParam(),
        bulan: selectedBulan.value,
        tahun: selectedTahun.value,
      },
    });
    taData.value = res.data;
    animateHeroNumbers(res.data);
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat target achievement.");
  } finally {
    if (!isBackground) loadingTa.value = false;
  }
};
const openDetail = async (card: SummaryCard) => {
  activeCard.value = card;
  showDetailDialog.value = true;
  detailLoading.value = true;
  detailRows.value = [];
  detailPage.value = 1;
  detailFinished.value = false;

  try {
    const res = await api.get<DetailRow[]>(`/dashboard/work-summary-detail/${card.key}`, {
      params: {
        page: 1,
        limit: DETAIL_PAGE_SIZE,
        cabang: cabangParam(),
        bulan: selectedBulan.value,
        tahun: selectedTahun.value,
      },
    });
    detailRows.value = res.data;
    if (res.data.length < DETAIL_PAGE_SIZE) detailFinished.value = true;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat detail.");
  } finally {
    detailLoading.value = false;
  }
};

const loadMoreDetail = async () => {
  if (!activeCard.value || detailLoadingMore.value || detailFinished.value) return;
  detailLoadingMore.value = true;
  detailPage.value += 1;

  try {
    const res = await api.get<DetailRow[]>(
      `/dashboard/work-summary-detail/${activeCard.value.key}`,
      {
        params: {
          page: detailPage.value,
          limit: DETAIL_PAGE_SIZE,
          cabang: cabangParam(),
          bulan: selectedBulan.value,
          tahun: selectedTahun.value,
        },
      }
    );
    detailRows.value.push(...res.data);
    if (res.data.length < DETAIL_PAGE_SIZE) detailFinished.value = true;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat data tambahan.");
  } finally {
    detailLoadingMore.value = false;
  }
};

const onIntersectDetail = (isIntersecting: boolean) => {
  if (isIntersecting) loadMoreDetail();
};

const canNavigate = (card: SummaryCard | null) => !!card && !!CARD_META[card.key]?.routeName;

const goToDetail = (row: DetailRow) => {
  const card = activeCard.value;
  if (!card) return;
  const meta = CARD_META[card.key];
  if (!meta?.routeName) return;
  const url = router.resolve({
    name: meta.routeName,
    params: { [meta.routeParam ?? "nomor"]: row.nomor },
  }).href;
  window.open(url, "_blank");
};

const refreshAll = () => {
  fetchSummary();
  fetchTargetAchievement();
};

const statusLabel = (s: SummaryCard["status"]) =>
  s === "kritis"
    ? "Kritis"
    : s === "perhatian"
    ? "Perlu perhatian"
    : s === "baik"
    ? "Baik"
    : "Info";

const achColor = (ach: number) => (ach >= 100 ? "success" : ach >= 80 ? "warning" : "error");

const isKDC = computed(() => authStore.user?.cabang === "KDC");

const statusFilter = ref<StatusFilter | null>(null);

const statusOptions = computed(() => {
  const count = (s: SummaryCard["status"]) => cards.value.filter((c) => c.status === s).length;
  return [
    { key: "kritis" as const, label: "Kritis", count: count("kritis") },
    { key: "perhatian" as const, label: "Perlu perhatian", count: count("perhatian") },
    { key: "baik" as const, label: "Baik", count: count("baik") },
  ];
});

const toggleStatusFilter = (key: StatusFilter) => {
  statusFilter.value = statusFilter.value === key ? null : key;
};

// Urutan card tetap (tidak diurutkan ulang saat polling) supaya posisi tidak loncat;
// status ditunjukkan lewat penanda, bukan lewat urutan.
const cardGroups = computed<CardGroupView[]>(() => {
  const buckets = new Map<string, SummaryCard[]>();
  for (const card of cards.value) {
    const key = CARD_META[card.key]?.group ?? "lainnya";
    const list = buckets.get(key);
    if (list) list.push(card);
    else buckets.set(key, [card]);
  }

  return CARD_GROUPS.flatMap((def) => {
    const all = buckets.get(def.key) ?? [];
    const visible = statusFilter.value ? all.filter((c) => c.status === statusFilter.value) : all;
    if (visible.length === 0) return [];
    return [
      {
        key: def.key,
        title: def.title,
        cards: visible,
        kritis: all.filter((c) => c.status === "kritis").length,
        perhatian: all.filter((c) => c.status === "perhatian").length,
        baik: all.filter((c) => c.status === "baik").length,
      },
    ];
  });
});

const isWide = (card: SummaryCard) => CARD_META[card.key]?.wide === true;

const cardLayout = (card: SummaryCard) => CARD_META[card.key]?.layout ?? "standar";

// Grafik harian PET DTF
const hariIni = (() => {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
})();

const harianMax = (card: SummaryCard) => Math.max(0, ...(card.harian ?? []).map((h) => h.meter));

const harianTinggi = (card: SummaryCard, meter: number) => {
  const max = harianMax(card);
  return max > 0 ? `${(meter / max) * 100}%` : "0%";
};

const hariKe = (iso: string) => Number(iso.slice(8, 10));
const labelHari = (iso: string) => hariKe(iso) === 1 || hariKe(iso) % 5 === 0;

const harianRingkasan = (card: SummaryCard) => {
  const max = harianMax(card);
  if (max <= 0) return "";
  const puncak = (card.harian ?? []).find((h) => h.meter === max);
  if (!puncak) return "";
  const tgl = new Date(`${puncak.tanggal}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
  return `Tersibuk ${tgl}: ${formatNumber(puncak.meter, 1)} m`;
};

const formatQty = (n: number) => n.toLocaleString("id-ID");

const formatNumber = (n: number, digits: number) =>
  n.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const formatPercent = (p: number) =>
  `${p.toLocaleString("id-ID", { maximumFractionDigits: p < 10 ? 1 : 0 })}%`;

type DetailMode = "stok" | "ph" | "meter" | "hari" | "umum";

const detailMode = computed<DetailMode>(() => {
  const key = activeCard.value?.key;
  if (activeCard.value?.type === "stok-detail") return "stok";
  if (key === "pengajuan_harga_open") return "ph";
  if (key === "pet_dtf_panjang") return "meter";
  if (key === "peminjaman_belum_kembali") return "hari";
  return "umum";
});

const detailCustomerLabel = computed(() => {
  const key = activeCard.value?.key;
  if (key === "pet_dtf_panjang") return "STORE";
  if (key === "peminjaman_belum_kembali") return "STORE - PIC";
  return "CUSTOMER";
});

// Lebar sel label di footer: sisakan satu kolom untuk total bila modenya punya total
const footerLabelSpan = computed(() =>
  detailMode.value === "umum" || detailMode.value === "meter" ? 3 : 4
);

const detailTotalQty = computed(() => detailRows.value.reduce((acc, r) => acc + (r.qty ?? 0), 0));

const rowKey = (row: DetailRow) => [row.nomor, row.ukuran, row.cabang].join("|");

const detailTotalNominal = computed(() =>
  detailRows.value.reduce((acc, r) => acc + (r.nominal || 0), 0)
);

const growthUp = computed(() => (taData.value?.growthPercent ?? 0) >= 0);

const trendChartData = computed<ChartData<"line">>(() => ({
  labels: taData.value?.trend.map((t) => t.label) ?? [],
  datasets: [
    {
      data: taData.value?.trend.map((t) => t.ach) ?? [],
      borderColor: `rgb(${chartInk.value})`,
      backgroundColor: `rgba(${chartInk.value}, 0.08)`,
      borderWidth: 1.5,
      fill: true,
      tension: 0.4,
      pointRadius: 2,
    },
  ],
}));

const perStoreChartData = computed<ChartData<"bar">>(() => {
  const stores = taData.value?.perStore ?? [];
  const up = isDark.value ? "#5fc46a" : "#2e7d32";
  const down = isDark.value ? "#ff6b5e" : "#b71c1c";
  return {
    labels: stores.map((s) => s.nama_cabang),
    datasets: [
      {
        data: stores.map((s) => Number(s.growthPercent.toFixed(1))),
        backgroundColor: stores.map((s) =>
          s.growthPercent > 0 ? up : s.growthPercent < 0 ? down : "#9e9e9e"
        ),
        borderRadius: 4,
        barThickness: 14,
      },
    ],
  };
});

const perStoreChartOptions = computed<ChartOptions<"bar">>(() => {
  const tick = isDark.value ? "#a89b97" : "#6f6663";
  return {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.x ?? 0;
            return `${val > 0 ? "+" : ""}${val}% vs bulan lalu`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { callback: (v) => `${v}%`, font: { size: 9 }, color: tick },
        grid: { color: `rgba(${chartInk.value}, 0.08)` },
      },
      y: {
        ticks: { font: { size: 10 }, color: tick },
        grid: { display: false },
      },
    },
  };
});

const trendChartOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
    tooltip: {
      enabled: true,
      callbacks: {
        title: (items) => {
          const point = taData.value?.trend[items[0].dataIndex];
          return point ? `${point.label} ${point.tahun}` : "";
        },
        label: (ctx) => {
          const point = taData.value?.trend[ctx.dataIndex];
          if (!point) return "";
          return [
            `Achievement: ${point.ach.toFixed(1)}%`,
            `Omset: ${formatRupiah(point.nominal)}`,
            `Target: ${formatRupiah(point.target)}`,
          ];
        },
      },
    },
  },
  scales: {
    x: { display: false },
    y: { display: false },
  },
};

watch(selectedCabang, () => {
  fetchSummary();
  fetchTargetAchievement(); // opsional — kalau mau Target Achievement juga ikut scope ke cabang terpilih
});

watch([selectedBulan, selectedTahun], () => {
  fetchSummary();
  fetchTargetAchievement();
});

watch(loadingCards, (loading) => {
  if (!loading && !introDone.value && introTimer === undefined) {
    introTimer = window.setTimeout(() => {
      introDone.value = true;
    }, 2800);
  }
});

let pollingInterval: number;

const startPolling = () => {
  pollingInterval = window.setInterval(() => {
    if (document.hidden) return; // skip kalau tab tidak aktif, sama seperti HomeView
    fetchSummary(true);
    fetchTargetAchievement(true);
  }, 30000);
};

onMounted(() => {
  fetchCabangOptions();
  refreshAll();
  startPolling();
});

onUnmounted(() => {
  clearInterval(pollingInterval);
  window.clearTimeout(introTimer);
});
</script>

<template>
  <div class="work-summary pa-2 pa-md-0" :class="{ 'ws-intro': !introDone, 'ws-dark': isDark }">
    <header class="ws-head">
      <div class="ws-head-text">
        <h2 class="ws-title">Summary Hasil Pekerjaan</h2>
        <p class="ws-subtitle">
          Ringkasan status surat pesanan dan proses lainnya
          <span v-if="lastUpdatedLabel" class="ws-updated">Diperbarui {{ lastUpdatedLabel }}</span>
        </p>
      </div>

      <div class="ws-filter-bar">
        <v-select
          v-model="selectedBulan"
          :items="bulanOptions"
          density="compact"
          variant="outlined"
          hide-details
          class="ws-filter-select ws-filter-bulan"
        />
        <v-text-field
          v-model.number="selectedTahun"
          type="number"
          density="compact"
          variant="outlined"
          hide-details
          class="ws-filter-select ws-filter-tahun"
        />
        <v-select
          v-if="isKDC"
          v-model="selectedCabang"
          :items="[{ kode: 'ALL', nama: 'Semua Cabang' }, ...cabangList]"
          item-title="nama"
          item-value="kode"
          density="compact"
          variant="outlined"
          hide-details
          class="ws-filter-select ws-filter-cabang"
        />
      </div>

      <v-btn
        size="small"
        variant="outlined"
        class="ws-refresh text-none"
        :loading="loadingCards || loadingTa"
        @click="refreshAll"
      >
        Muat ulang
      </v-btn>
    </header>

    <div v-if="loadingTa" class="ta-hero ta-hero--loading">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <section
      v-else-if="taData"
      class="ta-hero"
      :data-tone="achColor(taData.ach)"
      aria-label="Target achievement"
    >
      <div class="ta-hero-body">
        <div class="ta-hero-main">
          <h3 class="ta-hero-label">
            Target achievement
            <span class="ta-hero-scope">{{ taData.cabangLabel }}</span>
          </h3>

          <div class="ta-hero-figure">
            <span class="ta-hero-percent">{{ displayTa.ach.toFixed(1) }}<small>%</small></span>
            <span class="ta-hero-growth" :data-dir="growthUp ? 'up' : 'down'">
              <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
                <path v-if="growthUp" d="M5 1 9.5 9h-9z" />
                <path v-else d="M5 9 .5 1h9z" />
              </svg>
              <span class="ws-sr">{{ growthUp ? "Naik" : "Turun" }}</span>
              {{ Math.abs(taData.growthPercent).toFixed(1) }}% dari bulan lalu
            </span>
          </div>

          <div
            class="ta-rail"
            role="img"
            :aria-label="`Tercapai ${taData.ach.toFixed(1)} persen dari target`"
          >
            <div class="ta-rail-fill" :style="{ '--w': Math.min(100, taData.ach) + '%' }" />
          </div>

          <div class="ta-hero-sub">
            <b>{{ formatRupiah(Math.round(displayTa.nominal)) }}</b>
            dari target {{ formatRupiah(taData.target) }}
          </div>

          <button
            v-if="taData.isViewingAll && taData.perStore.length > 0"
            type="button"
            class="ta-toggle"
            :aria-expanded="showStoreBreakdown"
            aria-controls="ta-breakdown"
            @click="toggleStoreBreakdown"
          >
            Rincian per cabang
            <span class="ta-toggle-count">{{ taData.perStore.length }}</span>
            <svg
              class="ta-toggle-chev"
              viewBox="0 0 12 12"
              width="12"
              height="12"
              aria-hidden="true"
            >
              <path d="M2.5 4.5 6 8l3.5-3.5" />
            </svg>
          </button>
        </div>

        <div class="ta-hero-chart">
          <Line :data="trendChartData" :options="trendChartOptions" />
        </div>
      </div>

      <div id="ta-breakdown" class="ta-breakdown" :class="{ 'is-open': showStoreBreakdown }">
        <div class="ta-breakdown-clip">
          <div v-if="storeBreakdownMounted && taData.isViewingAll" class="ta-breakdown-inner">
            <p class="ta-breakdown-title">
              Pertumbuhan per cabang dibanding bulan lalu, {{ taData.periodeLabel }}
            </p>
            <div class="ta-breakdown-grid">
              <div
                class="ta-breakdown-chart"
                :style="{ height: `${Math.max(160, taData.perStore.length * 26)}px` }"
              >
                <Bar :data="perStoreChartData" :options="perStoreChartOptions" />
              </div>
              <ul
                class="ta-breakdown-list"
                :style="{ maxHeight: `${Math.max(160, taData.perStore.length * 26)}px` }"
              >
                <li v-for="store in taData.perStore" :key="store.kode_cabang">
                  <span class="ta-store-nm">{{ store.nama_cabang }}</span>
                  <b
                    class="ta-store-gr"
                    :data-dir="
                      store.growthPercent > 0 ? 'up' : store.growthPercent < 0 ? 'down' : 'flat'
                    "
                    >{{ store.growthPercent > 0 ? "+" : ""
                    }}{{ store.growthPercent.toFixed(0) }}%</b
                  >
                  <span class="ta-store-sub">
                    {{ formatRupiah(store.nominal) }}
                    <span>bulan lalu {{ formatRupiah(store.prevNominal) }}</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div
      v-if="!loadingCards && cards.length > 0"
      class="ws-status-filter"
      role="group"
      aria-label="Filter berdasarkan status"
    >
      <button
        v-for="opt in statusOptions"
        :key="opt.key"
        type="button"
        class="ws-chip"
        :class="{ 'is-active': statusFilter === opt.key }"
        :aria-pressed="statusFilter === opt.key"
        :disabled="opt.count === 0"
        @click="toggleStatusFilter(opt.key)"
      >
        <span class="ws-chip-dot" :data-status="opt.key" />
        {{ opt.label }}
        <b>{{ opt.count }}</b>
      </button>
      <button v-if="statusFilter" type="button" class="ws-chip-reset" @click="statusFilter = null">
        Tampilkan semua
      </button>
    </div>

    <v-row v-if="loadingCards" justify="center" class="pa-10">
      <v-progress-circular indeterminate color="primary" size="40" />
    </v-row>

    <div v-else-if="cards.length === 0" class="ws-filter-empty">Belum ada data ringkasan.</div>

    <template v-else>
      <div v-if="cardGroups.length === 0" class="ws-filter-empty">
        Tidak ada card dengan status ini.
        <button type="button" class="ws-chip-reset" @click="statusFilter = null">
          Tampilkan semua
        </button>
      </div>

      <section
        v-for="(group, gi) in cardGroups"
        :key="group.key"
        class="ws-group"
        :style="{ '--g': gi }"
      >
        <div class="ws-group-head">
          <h3 class="ws-group-title">{{ group.title }}</h3>
          <div class="ws-group-summary">
            <span v-if="group.kritis" data-status="kritis">{{ group.kritis }} kritis</span>
            <span v-if="group.perhatian" data-status="perhatian">
              {{ group.perhatian }} perlu perhatian
            </span>
            <span v-if="!group.kritis && !group.perhatian && group.baik" class="ws-group-ok"
              >Semua baik</span
            >
          </div>
        </div>

        <v-row dense>
          <v-col
            v-for="(card, ci) in group.cards"
            :key="card.key"
            cols="12"
            sm="6"
            :md="isWide(card) ? 12 : 4"
            :lg="isWide(card) ? 6 : 3"
          >
            <article class="ws-card" :data-status="card.status" :style="{ '--i': ci }">
              <div class="ws-card-head">
                <button type="button" class="ws-card-open" @click="openDetail(card)">
                  {{ card.title }}
                </button>

                <v-menu v-if="card.formula" :close-on-content-click="false" location="bottom end">
                  <template #activator="{ props: activatorProps }">
                    <button
                      v-bind="activatorProps"
                      type="button"
                      class="ws-info-btn"
                      :aria-label="`Cara hitung ${card.title}`"
                    >
                      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.5" />
                        <path d="M8 7.3v3.9M8 4.8v.2" />
                      </svg>
                    </button>
                  </template>
                  <div class="ws-formula" :class="{ 'ws-dark': isDark }">
                    <div class="ws-formula-title">{{ card.title }}</div>
                    <dl>
                      <dt>Yang dihitung</dt>
                      <dd>{{ card.formula.definisi }}</dd>
                      <dt>Rumus</dt>
                      <dd class="ws-formula-rumus">{{ card.formula.rumus }}</dd>
                      <dt>Status</dt>
                      <dd>{{ card.formula.ambang }}</dd>
                      <template v-if="card.formula.catatan">
                        <dt>Catatan</dt>
                        <dd>{{ card.formula.catatan }}</dd>
                      </template>
                    </dl>
                  </div>
                </v-menu>
              </div>

              <!-- Card lebar: stok minus dengan pratinjau item -->
              <template v-if="cardLayout(card) === 'stok'">
                <div class="ws-stok-body">
                  <div class="ws-stok-summary">
                    <div class="ws-card-metric">
                      <span class="ws-card-number">{{
                        Math.round(displayCurrent[card.key] ?? card.current)
                      }}</span>
                      <span class="ws-card-number-total">item</span>
                    </div>
                    <div v-if="card.pcsMinus" class="ws-card-meta">
                      {{ formatQty(card.pcsMinus) }} pcs
                    </div>
                    <span class="ws-card-status-text ws-stok-status" :data-status="card.status">
                      {{ statusLabel(card.status) }}
                    </span>
                  </div>

                  <ul v-if="card.preview && card.preview.length" class="ws-stok-list">
                    <li
                      v-for="(row, ri) in card.preview"
                      :key="`${row.kode}|${row.ukuran}|${row.cabang}`"
                      class="ws-stok-item"
                      :style="{ '--j': ri }"
                    >
                      <span class="ws-stok-nama">{{ row.nama || row.kode }}</span>
                      <span class="ws-stok-qty">{{ formatQty(row.qty) }}</span>
                      <span class="ws-stok-sub">
                        <span>{{ row.kode }}</span>
                        <span>{{ row.ukuran }}</span>
                        <span>{{ row.cabang }}</span>
                      </span>
                    </li>
                  </ul>
                  <div v-else class="ws-stok-empty">
                    <svg
                      class="ws-clear-mark"
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M7.5 12.5l3 3 6-6.5" />
                    </svg>
                    Tidak ada stok minus saat ini.
                  </div>
                </div>
                <button
                  v-if="card.current > (card.preview?.length ?? 0)"
                  type="button"
                  class="ws-stok-more"
                  @click="openDetail(card)"
                >
                  Lihat semua {{ card.current }} item
                </button>
              </template>

              <!-- Card lebar: tren harian (PET DTF) -->
              <template v-else-if="cardLayout(card) === 'harian'">
                <div class="ws-pet-body">
                  <div class="ws-stok-summary">
                    <div class="ws-card-metric">
                      <span class="ws-card-number">{{
                        formatNumber(
                          displayCurrent[card.key] ?? card.current,
                          card.fractionDigits ?? 0
                        )
                      }}</span>
                      <span class="ws-card-number-total">{{ card.unit }}</span>
                    </div>
                    <div class="ws-card-meta">{{ card.jumlahLhk ?? 0 }} LHK</div>
                    <div v-if="card.jumlahLhk" class="ws-card-meta">
                      rata-rata {{ formatNumber(card.current / card.jumlahLhk, 1) }} m per LHK
                    </div>
                  </div>

                  <div class="ws-pet-chart">
                    <p v-if="harianRingkasan(card)" class="ws-pet-peak">
                      {{ harianRingkasan(card) }}
                    </p>
                    <p v-else class="ws-pet-peak">Belum ada pemakaian di bulan ini.</p>
                    <div
                      class="ws-pet-bars"
                      role="img"
                      :aria-label="`Grafik pemakaian PET DTF per hari. ${harianRingkasan(card)}`"
                    >
                      <div
                        v-for="(h, hi) in card.harian"
                        :key="h.tanggal"
                        class="ws-pet-col"
                        aria-hidden="true"
                        :style="{ '--h': harianTinggi(card, h.meter), '--j': hi }"
                      >
                        <span class="ws-pet-track">
                          <span
                            class="ws-pet-bar"
                            :class="{
                              'is-peak': h.meter > 0 && h.meter === harianMax(card),
                              'is-future': h.tanggal > hariIni,
                            }"
                          />
                        </span>
                        <span class="ws-pet-day">{{
                          labelHari(h.tanggal) ? hariKe(h.tanggal) : ""
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Card standar -->
              <template v-else>
                <div class="ws-card-metric">
                  <span class="ws-card-number">{{
                    formatNumber(displayCurrent[card.key] ?? card.current, card.fractionDigits ?? 0)
                  }}</span>
                  <span v-if="card.total !== null" class="ws-card-number-total">
                    /{{ card.total }}
                  </span>
                  <span v-else-if="card.unit" class="ws-card-number-total">{{ card.unit }}</span>
                </div>

                <div v-if="card.extra" class="ws-card-meta">
                  {{ card.extra.current.toLocaleString("id-ID") }}/{{
                    card.extra.total.toLocaleString("id-ID")
                  }}
                  {{ card.extra.label }}
                </div>
                <div
                  v-if="card.nominal"
                  class="ws-card-meta"
                  :class="{ 'ws-card-nominal': card.status === 'netral' }"
                >
                  {{ formatRupiah(card.nominal) }}
                </div>

                <div v-if="card.status !== 'netral'" class="ws-card-footer">
                  <div v-if="card.percent !== null" class="ws-card-track">
                    <div class="ws-card-fill" :style="{ '--w': card.percent + '%' }" />
                  </div>
                  <span v-if="card.percent !== null" class="ws-card-pct">
                    {{ formatPercent(card.percent) }}
                  </span>
                  <span class="ws-card-status-text" :data-status="card.status">
                    {{ statusLabel(card.status) }}
                  </span>
                </div>
              </template>
            </article>
          </v-col>
        </v-row>
      </section>
    </template>
  </div>

  <v-dialog
    v-model="showDetailDialog"
    max-width="960"
    scrollable
    class="ws-dialog"
    :class="{ 'ws-dark': isDark }"
  >
    <v-card class="rounded-xl overflow-hidden ws-dialog-card">
      <div class="detail-dialog-header">
        <span class="detail-dialog-title">{{ activeCard?.title }}</span>
        <button type="button" class="ws-close" aria-label="Tutup" @click="showDetailDialog = false">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </div>

      <v-card-text class="pa-0 ws-detail-scroll" style="max-height: 60vh; overflow-y: auto">
        <div v-if="detailLoading" class="text-center pa-10">
          <v-progress-circular indeterminate color="primary" size="36" />
        </div>

        <div v-else-if="detailRows.length === 0" class="ws-clear">
          <svg class="ws-clear-mark" viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M7.5 12.5l3 3 6-6.5" />
          </svg>
          <div class="detail-empty-text">Tidak ada data.</div>
        </div>

        <template v-else>
          <v-table density="compact" hover class="ws-detail-table">
            <thead>
              <tr v-if="detailMode === 'stok'">
                <th class="detail-th" style="width: 150px">KODE</th>
                <th class="detail-th">NAMA BARANG</th>
                <th class="detail-th text-center" style="width: 80px">UKURAN</th>
                <th class="detail-th" style="width: 160px">GUDANG</th>
                <th class="detail-th text-right" style="width: 90px">QTY</th>
              </tr>
              <tr v-else>
                <th class="detail-th" style="width: 160px">NOMOR</th>
                <th class="detail-th" style="width: 110px">TANGGAL</th>
                <th class="detail-th">{{ detailCustomerLabel }}</th>
                <th v-if="detailMode === 'ph'" class="detail-th" style="width: 170px">STATUS</th>
                <th
                  v-else-if="detailMode === 'meter'"
                  class="detail-th text-right"
                  style="width: 130px"
                >
                  PANJANG (M)
                </th>
                <th
                  v-else-if="detailMode === 'hari'"
                  class="detail-th text-right"
                  style="width: 150px"
                >
                  TERLAMBAT (HARI)
                </th>
                <th v-else class="detail-th text-right" style="width: 160px">NOMINAL</th>
              </tr>
            </thead>
            <tbody>
              <template v-if="detailMode === 'stok'">
                <tr v-for="row in detailRows" :key="rowKey(row)">
                  <td class="detail-td font-weight-bold">{{ row.nomor }}</td>
                  <td class="detail-td">{{ row.customer || "-" }}</td>
                  <td class="detail-td text-center">{{ row.ukuran }}</td>
                  <td class="detail-td">{{ row.cabang }}</td>
                  <td class="detail-td text-right font-weight-bold ws-qty-minus">
                    {{ formatQty(row.qty ?? 0) }}
                  </td>
                </tr>
              </template>
              <template v-else>
                <tr
                  v-for="row in detailRows"
                  :key="rowKey(row)"
                  :class="{ 'detail-row-clickable': canNavigate(activeCard) }"
                  @click="goToDetail(row)"
                >
                  <td
                    class="detail-td font-weight-bold"
                    :class="canNavigate(activeCard) ? 'text-primary' : ''"
                  >
                    {{ row.nomor }}
                  </td>
                  <td class="detail-td text-no-wrap">{{ row.tanggal }}</td>
                  <td class="detail-td">{{ row.customer || "-" }}</td>
                  <td v-if="detailMode === 'ph'" class="detail-td">
                    <span class="ws-status-pill">{{ row.status }}</span>
                  </td>
                  <td
                    v-else-if="detailMode === 'meter'"
                    class="detail-td text-right font-weight-medium"
                  >
                    {{ formatNumber(row.qty ?? 0, 2) }}
                  </td>
                  <td
                    v-else-if="detailMode === 'hari'"
                    class="detail-td text-right font-weight-medium"
                  >
                    {{ formatQty(row.qty ?? 0) }}
                  </td>
                  <td v-else class="detail-td text-right font-weight-medium">
                    {{ row.nominal ? formatRupiah(row.nominal) : "-" }}
                  </td>
                </tr>
              </template>
            </tbody>
            <tfoot>
              <tr class="detail-total-row">
                <td class="detail-td font-weight-bold" :colspan="footerLabelSpan">
                  {{ detailMode === "ph" || detailMode === "hari" ? "JUMLAH" : "TOTAL" }} ({{
                    detailRows.length
                  }}
                  data dimuat{{ !detailFinished ? ", belum semua" : "" }})
                </td>
                <td v-if="detailMode === 'umum'" class="detail-td text-right font-weight-bold">
                  {{ formatRupiah(detailTotalNominal) }}
                </td>
                <td
                  v-else-if="detailMode === 'meter'"
                  class="detail-td text-right font-weight-bold"
                >
                  {{ formatNumber(detailTotalQty, 2) }}
                </td>
                <td
                  v-else-if="detailMode === 'stok'"
                  class="detail-td text-right font-weight-bold ws-qty-minus"
                >
                  {{ formatQty(detailTotalQty) }}
                </td>
              </tr>
            </tfoot>
          </v-table>

          <div v-intersect="onIntersectDetail" class="pa-4 text-center w-100">
            <v-progress-circular
              v-if="detailLoadingMore"
              indeterminate
              color="primary"
              size="22"
              width="3"
            />
            <div v-else-if="detailFinished" class="detail-finished-text">
              -- Semua {{ detailRows.length }} data telah ditampilkan --
            </div>
          </div>
        </template>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3" style="background: var(--ws-paper)">
        <span class="detail-count-text">{{ detailRows.length }} data dimuat</span>
        <v-spacer />
        <v-btn
          variant="text"
          size="small"
          class="text-none font-weight-bold"
          @click="showDetailDialog = false"
        >
          Tutup
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.work-summary {
  color: var(--ws-ink);
}
.ws-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ── Header ── */
.ws-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
  margin-bottom: 20px;
}
.ws-head-text {
  flex: 1 1 280px;
  min-width: 0;
}
.ws-title {
  margin: 0;
  font-family: var(--ws-serif);
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
}
.ws-subtitle {
  margin: 4px 0 0;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--ws-muted);
}
.ws-updated {
  display: inline-block;
  margin-left: 10px;
  font-variant-numeric: tabular-nums;
}
.ws-refresh {
  border-color: var(--ws-line) !important;
  font-weight: 700 !important;
}

/* ── Filter bar (bulan/tahun/cabang) ── */
.ws-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  background: var(--ws-paper);
  border-radius: 12px;
  border: 1px solid var(--ws-line);
}
.ws-filter-select :deep(.v-field) {
  border-radius: 8px;
  font-size: 0.8rem;
}
.ws-filter-select :deep(.v-field__input) {
  min-height: 36px !important;
  padding-top: 4px;
  padding-bottom: 4px;
  font-weight: 600;
  font-size: 0.8rem;
}
.ws-filter-select :deep(.v-field__outline) {
  --v-field-border-opacity: 0.14;
}
.ws-filter-bulan {
  width: 128px;
  flex-shrink: 0;
}
.ws-filter-tahun {
  width: 84px;
  flex-shrink: 0;
}
.ws-filter-tahun :deep(input) {
  text-align: center;
}
.ws-filter-cabang {
  width: 170px;
  flex-shrink: 0;
}
@media (max-width: 720px) {
  .ws-filter-bar {
    width: 100%;
    order: 3;
  }
  .ws-filter-bulan,
  .ws-filter-tahun,
  .ws-filter-cabang {
    flex: 1 1 0;
    width: auto;
  }
}

/* ── Hero: target achievement ── */
.ta-hero {
  margin-bottom: 20px;
  padding: 22px 26px;
  border-radius: 16px;
  background: var(--ws-paper);
  border: 1px solid var(--ws-line);
}
.ta-hero--loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
}
.ta-hero-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 32px;
}
.ta-hero-main {
  flex: 1 1 320px;
  min-width: 0;
}
.ta-hero-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  margin: 0;
  font-family: var(--ws-serif);
  font-size: 1.05rem;
  font-weight: 600;
}
.ta-hero-scope {
  font-family: var(--ws-sans);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ws-muted);
}
.ta-hero-figure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 16px;
  margin-top: 8px;
}
.ta-hero-percent {
  font-size: clamp(2.6rem, 5vw, 3.6rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.ta-hero-percent small {
  margin-left: 2px;
  font-size: 0.5em;
  font-weight: 700;
  color: var(--ws-muted);
}
.ta-hero[data-tone="success"] .ta-hero-percent {
  color: var(--ws-baik);
}
.ta-hero[data-tone="warning"] .ta-hero-percent {
  color: var(--ws-perhatian);
}
.ta-hero[data-tone="error"] .ta-hero-percent {
  color: var(--ws-kritis);
}
.ta-hero-growth {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ta-hero-growth svg {
  fill: currentColor;
}
.ta-hero-growth[data-dir="up"] {
  color: var(--ws-baik);
}
.ta-hero-growth[data-dir="down"] {
  color: var(--ws-kritis);
}

.ta-rail {
  max-width: 520px;
  height: 6px;
  margin-top: 16px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(var(--ws-ink-rgb), 0.09);
}
.ta-rail-fill {
  width: var(--w);
  height: 100%;
  border-radius: inherit;
  background: var(--ws-ink);
  transition: width 0.8s var(--ws-ease);
  animation: ta-rail-in 1.3s var(--ws-ease) 0.2s backwards;
}
.ta-hero[data-tone="success"] .ta-rail-fill {
  background: var(--ws-baik);
}
.ta-hero[data-tone="warning"] .ta-rail-fill {
  background: var(--ws-perhatian);
}
.ta-hero[data-tone="error"] .ta-rail-fill {
  background: var(--ws-kritis);
}
@keyframes ta-rail-in {
  from {
    width: 0;
  }
}
.ta-hero-sub {
  margin-top: 10px;
  font-size: 0.85rem;
  color: var(--ws-muted);
  font-variant-numeric: tabular-nums;
}
.ta-hero-sub b {
  font-weight: 700;
  color: var(--ws-ink);
}
.ta-hero-chart {
  flex: 0 1 240px;
  width: 240px;
  height: 84px;
}
@media (max-width: 600px) {
  .ta-hero-chart {
    flex-basis: 100%;
    width: 100%;
    height: 64px;
  }
}

.ta-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  margin-top: 12px;
  padding: 0 14px;
  border: 1px solid var(--ws-line);
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ws-ink);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}
.ta-toggle-count {
  color: var(--ws-muted);
  font-variant-numeric: tabular-nums;
}
.ta-toggle-chev {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.45s var(--ws-ease);
}
.ta-toggle[aria-expanded="true"] .ta-toggle-chev {
  transform: rotate(180deg);
}
@media (hover: hover) {
  .ta-toggle:hover {
    background: rgba(var(--ws-ink-rgb), 0.05);
    border-color: rgba(var(--ws-ink-rgb), 0.3);
  }
}
.ta-toggle:active {
  transform: scale(0.985);
}
.ta-toggle:focus-visible,
.ws-chip:focus-visible,
.ws-chip-reset:focus-visible,
.ws-info-btn:focus-visible,
.ws-stok-more:focus-visible {
  outline: 2px solid var(--ws-ink);
  outline-offset: 2px;
}

/* Rincian per cabang: buka sebaris (accordion), bukan popover */
.ta-breakdown {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.55s var(--ws-ease);
}
.ta-breakdown.is-open {
  grid-template-rows: 1fr;
}
.ta-breakdown-clip {
  min-height: 0;
  overflow: hidden;
  /* tertutup = keluar dari urutan tab dan pembaca layar */
  visibility: hidden;
  transition: visibility 0s linear 0.55s;
}
.ta-breakdown.is-open .ta-breakdown-clip {
  visibility: visible;
  transition-delay: 0s;
}
.ta-breakdown-inner {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--ws-line);
}
.ta-breakdown-title {
  margin: 0 0 12px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ws-muted);
}
.ta-breakdown-grid {
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  gap: 20px;
  align-items: start;
}
@media (max-width: 760px) {
  .ta-breakdown-grid {
    grid-template-columns: 1fr;
  }
}
.ta-breakdown-chart {
  position: relative;
}
.ta-breakdown-list {
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.ta-breakdown-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 12px;
  padding: 7px 0;
  border-top: 1px solid var(--ws-line);
}
.ta-breakdown-list li:first-child {
  padding-top: 0;
  border-top: 0;
}
.ta-store-nm {
  grid-column: 1;
  font-size: 0.8rem;
  font-weight: 700;
}
.ta-store-sub {
  grid-column: 1;
  font-size: 0.7rem;
  color: var(--ws-muted);
  font-variant-numeric: tabular-nums;
}
.ta-store-sub span {
  margin-left: 8px;
}
.ta-store-gr {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  font-size: 0.85rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.ta-store-gr[data-dir="up"] {
  color: var(--ws-baik);
}
.ta-store-gr[data-dir="down"] {
  color: var(--ws-kritis);
}
.ta-store-gr[data-dir="flat"] {
  color: var(--ws-muted);
}

/* ── Filter status ── */
.ws-status-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ws-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 14px 0 11px;
  border: 1px solid var(--ws-line);
  border-radius: 999px;
  background: var(--ws-paper);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ws-muted);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.ws-chip b {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
@media (hover: hover) {
  .ws-chip:hover:not(:disabled) {
    border-color: rgba(var(--ws-ink-rgb), 0.35);
    color: var(--ws-ink);
  }
}
.ws-chip:disabled {
  opacity: 0.45;
  cursor: default;
}
.ws-chip.is-active {
  background: var(--ws-ink);
  border-color: var(--ws-ink);
  color: var(--ws-paper);
}
.ws-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.ws-chip-dot[data-status="kritis"] {
  background: var(--ws-kritis);
}
.ws-chip-dot[data-status="perhatian"] {
  background: var(--ws-perhatian);
}
.ws-chip-dot[data-status="baik"] {
  background: var(--ws-baik);
}
.ws-chip-reset {
  padding: 8px 6px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ws-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.ws-filter-empty {
  padding: 32px 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--ws-muted);
}

/* ── Grup ── */
.ws-group {
  margin-top: 32px;
}
.ws-group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.ws-group-title {
  margin: 0;
  font-family: var(--ws-serif);
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.ws-group-summary {
  display: flex;
  gap: 14px;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--ws-muted);
}
.ws-group-summary span[data-status]::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: currentColor;
}
.ws-group-summary span[data-status="kritis"] {
  color: var(--ws-kritis);
}
.ws-group-summary span[data-status="perhatian"] {
  color: var(--ws-perhatian);
}

/* ── Card ── */
.ws-card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 14px 16px 14px 18px;
  border: 1px solid var(--ws-line);
  border-radius: 14px;
  background: var(--ws-paper);
  transition: transform 0.35s var(--ws-ease), box-shadow 0.35s var(--ws-ease),
    border-color 0.2s ease;
}
@media (hover: hover) {
  .ws-card:hover {
    transform: translateY(-3px);
    border-color: rgba(var(--ws-ink-rgb), 0.22);
    box-shadow: 0 10px 24px var(--ws-shadow);
  }
}
@media (hover: none) {
  .ws-card:active {
    transform: scale(0.985);
  }
}
/* Tepi kiri hanya untuk yang perlu tindakan */
.ws-card::before {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: transparent;
  transform-origin: top;
}
.ws-card[data-status="kritis"]::before {
  background: var(--ws-kritis);
}
.ws-card[data-status="perhatian"]::before {
  background: var(--ws-perhatian);
}

.ws-card-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}
/* Judul = tombol; ::after membentang jadi area klik seluruh card */
.ws-card-open {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.35;
  text-align: left;
  color: var(--ws-ink);
  cursor: pointer;
}
.ws-card-open::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
.ws-card-open:focus-visible {
  outline: none;
}
.ws-card-open:focus-visible::after {
  outline: 2px solid var(--ws-ink);
  outline-offset: 2px;
}
.ws-info-btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: -8px -9px -8px 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ws-muted);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}
.ws-info-btn svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
}
.ws-info-btn[aria-expanded="true"] {
  background: rgba(var(--ws-ink-rgb), 0.08);
  color: var(--ws-ink);
}
@media (hover: hover) {
  .ws-info-btn:hover {
    background: rgba(var(--ws-ink-rgb), 0.08);
    color: var(--ws-ink);
  }
}

.ws-card-metric {
  display: flex;
  align-items: baseline;
  gap: 4px;
  line-height: 1;
}
.ws-card-number {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.ws-card-number-total {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ws-muted);
  font-variant-numeric: tabular-nums;
}
.ws-card-meta {
  margin-top: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ws-muted);
  font-variant-numeric: tabular-nums;
}
.ws-card-nominal {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ws-ink);
  font-variant-numeric: tabular-nums;
}
.ws-card-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 16px;
}
.ws-card-track {
  flex: 1;
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(var(--ws-ink-rgb), 0.09);
}
.ws-card-fill {
  width: var(--w);
  height: 100%;
  border-radius: inherit;
  background: rgba(var(--ws-ink-rgb), 0.4);
  transition: width 0.8s var(--ws-ease);
}
.ws-card[data-status="perhatian"] .ws-card-fill {
  background: var(--ws-perhatian);
}
.ws-card[data-status="kritis"] .ws-card-fill {
  background: var(--ws-kritis);
}
.ws-card-pct {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--ws-muted);
  font-variant-numeric: tabular-nums;
}
.ws-card-status-text {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 800;
  white-space: nowrap;
  color: var(--ws-muted);
}
.ws-card-status-text[data-status="kritis"] {
  color: var(--ws-kritis);
}
.ws-card-status-text[data-status="perhatian"] {
  color: var(--ws-perhatian);
}
.ws-card-status-text[data-status="baik"] {
  color: var(--ws-baik);
}

/* ── Card lebar: stok minus ── */
.ws-stok-body {
  display: grid;
  flex: 1;
  grid-template-columns: 150px 1fr;
  gap: 18px;
  min-height: 0;
}
.ws-stok-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.ws-stok-status {
  margin-top: 4px;
  margin-left: 0;
}
.ws-stok-list {
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ws-stok-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 12px;
  padding: 7px 0;
  border-top: 1px solid var(--ws-line);
}
.ws-stok-item:first-child {
  padding-top: 0;
  border-top: 0;
}
.ws-stok-nama {
  grid-column: 1;
  grid-row: 1;
  overflow: hidden;
  font-size: 0.78rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-stok-qty {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--ws-kritis);
  font-variant-numeric: tabular-nums;
}
.ws-stok-sub {
  display: flex;
  grid-column: 1;
  grid-row: 2;
  gap: 12px;
  overflow: hidden;
  font-size: 0.7rem;
  color: var(--ws-muted);
  white-space: nowrap;
}
.ws-stok-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--ws-muted);
}
.ws-stok-more {
  align-self: flex-start;
  position: relative;
  z-index: 1;
  margin-top: 10px;
  padding: 6px 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ws-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
@media (max-width: 600px) {
  .ws-stok-body {
    grid-template-columns: 1fr;
  }
  .ws-pet-body {
    grid-template-columns: 1fr;
  }
}
/* ── Card lebar: PET DTF (tren harian) ── */
.ws-pet-body {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(150px, max-content) minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
}
.ws-pet-chart {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}
.ws-pet-peak {
  margin: 0;
  font-size: 0.75rem;
  color: var(--ws-muted);
}
.ws-pet-bars {
  display: flex;
  gap: 3px;
  height: 96px;
}
.ws-pet-col {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.ws-pet-track {
  display: flex;
  flex: 1;
  align-items: flex-end;
}
.ws-pet-bar {
  width: 100%;
  height: var(--h);
  min-height: 2px;
  border-radius: 2px 2px 0 0;
  background: rgba(var(--ws-ink-rgb), 0.55);
  transform-origin: bottom;
}
.ws-pet-bar.is-peak {
  background: rgba(var(--ws-ink-rgb), 0.9);
}
.ws-pet-bar.is-future {
  background: rgba(var(--ws-ink-rgb), 0.12);
}
.ws-pet-day {
  height: 14px;
  font-size: 0.62rem;
  line-height: 14px;
  text-align: center;
  white-space: nowrap;
  color: var(--ws-muted);
  font-variant-numeric: tabular-nums;
}

/* ── Gerak: hanya saat pertama muat (.ws-intro dicabut setelah ~2,8 dtk) ── */
@keyframes ws-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
}
@keyframes ws-rise-sm {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@keyframes ws-edge {
  from {
    transform: scaleY(0);
  }
}
@keyframes ws-bar {
  from {
    width: 0;
  }
}
@keyframes ws-grow {
  from {
    transform: scaleY(0);
  }
}
.ws-intro .ta-hero {
  animation: ws-rise 0.8s var(--ws-ease) backwards;
}
.ws-intro .ws-group-head {
  animation: ws-rise-sm 0.7s var(--ws-ease) calc(var(--g) * 120ms + 150ms) backwards;
}
.ws-intro .ws-card {
  animation: ws-rise 0.8s var(--ws-ease) calc(var(--g) * 120ms + var(--i) * 55ms + 200ms) backwards;
}
.ws-intro .ws-card[data-status="kritis"]::before,
.ws-intro .ws-card[data-status="perhatian"]::before {
  animation: ws-edge 0.7s var(--ws-ease) calc(var(--g) * 120ms + var(--i) * 55ms + 650ms) backwards;
}
.ws-intro .ws-card-fill {
  animation: ws-bar 1s var(--ws-ease) calc(var(--g) * 120ms + var(--i) * 55ms + 550ms) backwards;
}
.ws-intro .ws-stok-item {
  animation: ws-rise-sm 0.6s var(--ws-ease) calc(var(--g) * 120ms + var(--j) * 60ms + 450ms)
    backwards;
}
.ws-intro .ws-pet-bar {
  animation: ws-grow 0.7s var(--ws-ease) calc(var(--g) * 120ms + var(--j) * 14ms + 450ms) backwards;
}

@media (prefers-reduced-motion: reduce) {
  .work-summary *,
  .work-summary *::before,
  .work-summary *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>

<style>
.work-summary,
.ws-dialog,
.ws-formula {
  --ws-ink-rgb: 31, 26, 25;
  --ws-paper: #faf6f4;
  --ws-ink: rgb(var(--ws-ink-rgb));
  --ws-muted: #6f6663;
  --ws-line: #e9dfdb;
  --ws-kritis: #b71c1c;
  --ws-perhatian: #b45309;
  --ws-baik: #2e7d32;
  --ws-shadow: rgba(60, 20, 15, 0.1);
  --ws-shadow-lg: rgba(60, 20, 15, 0.16);
  --ws-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --ws-serif: "Playfair Display Variable", "Playfair Display", Georgia, serif;
  --ws-sans: "Plus Jakarta Sans Variable", "Plus Jakarta Sans", "Roboto", sans-serif;
  font-family: var(--ws-sans);
}

/* Tema gelap: nilai merah/amber/hijau dicerahkan supaya kontras di latar gelap */
.work-summary.ws-dark,
.ws-dialog.ws-dark,
.ws-formula.ws-dark {
  --ws-ink-rgb: 243, 232, 228;
  --ws-paper: #1f1a19;
  --ws-muted: #a89b97;
  --ws-line: #352c2a;
  --ws-kritis: #ff6b5e;
  --ws-perhatian: #f0a23b;
  --ws-baik: #5fc46a;
  --ws-shadow: rgba(0, 0, 0, 0.45);
  --ws-shadow-lg: rgba(0, 0, 0, 0.6);
}

/* Tanda "kosong/aman": centang tergambar sekali */
.ws-clear {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 16px;
}
.ws-clear-mark {
  flex-shrink: 0;
}
.ws-clear-mark circle,
.ws-clear-mark path {
  fill: none;
  stroke: var(--ws-baik);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ws-clear-mark path {
  stroke-dasharray: 20;
  animation: ws-draw 0.7s var(--ws-ease) 0.15s backwards;
}
@keyframes ws-draw {
  from {
    stroke-dashoffset: 20;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ws-clear-mark path {
    animation: none;
  }
}

/* ── Dialog detail ── */
.ws-dialog .ws-dialog-card {
  background: var(--ws-paper);
}
.detail-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--ws-line);
}
.detail-dialog-title {
  font-family: var(--ws-serif);
  font-size: 1.15rem;
  font-weight: 600;
}
.ws-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-right: -8px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ws-muted);
  cursor: pointer;
}
.ws-close svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.ws-close:hover {
  background: rgba(var(--ws-ink-rgb), 0.08);
  color: var(--ws-ink);
}
.ws-close:focus-visible {
  outline: 2px solid var(--ws-ink);
  outline-offset: 2px;
}
.ws-detail-scroll {
  position: relative;
}
.ws-detail-table {
  background: transparent !important;
}
.ws-detail-table .v-table__wrapper {
  overflow: visible !important;
}
.ws-detail-table thead th {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--ws-paper) !important;
  color: var(--ws-muted) !important;
  border-bottom: 2px solid rgba(var(--ws-ink-rgb), 0.22) !important;
}
.ws-detail-table tfoot td {
  position: sticky;
  bottom: 0;
  z-index: 5;
  background: var(--ws-paper) !important;
  border-top: 2px solid rgba(var(--ws-ink-rgb), 0.22) !important;
}
.detail-th {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.detail-td {
  font-size: 0.8rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.detail-total-row td {
  font-size: 0.8rem;
}
.detail-row-clickable {
  cursor: pointer;
}
.detail-row-clickable:hover {
  background: rgba(var(--ws-ink-rgb), 0.05);
}
.detail-empty-text,
.detail-finished-text {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--ws-muted);
}
.ws-qty-minus {
  color: var(--ws-kritis);
  font-variant-numeric: tabular-nums;
}
.ws-status-pill {
  display: inline-block;
  padding: 2px 9px;
  border: 1px solid rgba(var(--ws-ink-rgb), 0.2);
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: rgba(var(--ws-ink-rgb), 0.8);
  white-space: nowrap;
}

/* ── Popover rumus (klik, jadi aman di tablet) ── */
.ws-formula {
  width: 300px;
  max-width: calc(100vw - 32px);
  padding: 14px 16px 16px;
  border: 1px solid var(--ws-line);
  border-radius: 12px;
  background: var(--ws-paper);
  box-shadow: 0 10px 28px var(--ws-shadow-lg);
}
.ws-formula-title {
  font-family: var(--ws-serif);
  font-size: 1rem;
  font-weight: 600;
}
.ws-formula dl {
  margin: 0;
}
.ws-formula dt {
  margin-top: 10px;
  font-size: 0.68rem;
  font-weight: 800;
  color: var(--ws-muted);
}
.ws-formula dd {
  margin: 3px 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--ws-ink);
}
.ws-formula dd.ws-formula-rumus {
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(var(--ws-ink-rgb), 0.05);
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import api from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";
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

ChartJS.register(
  LineElement,
  PointElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler
);

interface CabangOption {
  kode: string;
  nama: string;
}

interface SummaryCard {
  key: string;
  title: string;
  icon: string;
  current: number;
  total: number | null;
  nominal?: number;
  percent: number | null;
  status: "baik" | "perhatian" | "kritis" | "netral";
  extra?: {
    label: string;
    current: number;
    total: number;
  };
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

interface DetailRow {
  nomor: string;
  invNomor?: string;
  tanggal?: string;
  dateline?: string;
  customer?: string;
  nominal?: number;
}

const authStore = useAuthStore();
const toast = useToast();
const router = useRouter();
const cards = ref<SummaryCard[]>([]);
const loadingCards = ref(true);
const taData = ref<TargetAchievementData | null>(null);
const loadingTa = ref(true);
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

const fetchSummary = async () => {
  loadingCards.value = true;
  try {
    const res = await api.get<SummaryCard[]>("/dashboard/work-summary", {
      params: { cabang: cabangParam() },
    });
    cards.value = res.data;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat ringkasan pekerjaan.");
  } finally {
    loadingCards.value = false;
  }
};

const fetchTargetAchievement = async () => {
  loadingTa.value = true;
  try {
    const res = await api.get<TargetAchievementData>("/dashboard/target-achievement-summary", {
      params: { cabang: cabangParam() },
    });
    taData.value = res.data;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat target achievement.");
  } finally {
    loadingTa.value = false;
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
      params: { page: 1, limit: DETAIL_PAGE_SIZE, cabang: cabangParam() },
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
      { params: { page: detailPage.value, limit: DETAIL_PAGE_SIZE, cabang: cabangParam() } }
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

const canNavigate = (card: SummaryCard | null) =>
  card?.key !== "customer_baru" && card?.key !== "repeat_order";

const goToDetail = (row: DetailRow) => {
  if (!activeCard.value || !canNavigate(activeCard.value)) return;

  let url = "";
  if (activeCard.value.key === "produksi_terlambat") {
    url = router.resolve({ name: "SoManksiDetail", params: { nomor: row.nomor } }).href;
  } else if (
    activeCard.value.key === "penawaran_belum_follow_up" ||
    activeCard.value.key === "penawaran_closing"
  ) {
    url = router.resolve({ name: "Ubah Penawaran", params: { nomor: row.nomor } }).href;
  } else if (activeCard.value.key === "minta_barang_belum_diproses") {
    url = router.resolve({ name: "MintaBarangEdit", params: { nomor: row.nomor } }).href;
  } else {
    url = router.resolve({ name: "SuratPesananEdit", params: { nomor: row.nomor } }).href;
  }
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
    ? "Perlu Perhatian"
    : s === "baik"
    ? "Baik"
    : "Info";

const achColor = (ach: number) => (ach >= 100 ? "success" : ach >= 80 ? "warning" : "error");

const isTargetAchieved = computed(() => (taData.value?.ach ?? 0) >= 100);

const isKDC = computed(() => authStore.user?.cabang === "KDC");

const detailTotalNominal = computed(() =>
  detailRows.value.reduce((acc, r) => acc + (r.nominal || 0), 0)
);

const growthIcon = computed(() =>
  (taData.value?.growthPercent ?? 0) >= 0 ? "mdi-trending-up" : "mdi-trending-down"
);
const growthColor = computed(() =>
  (taData.value?.growthPercent ?? 0) >= 0 ? "text-success" : "text-error"
);

const trendChartData = computed<ChartData<"line">>(() => ({
  labels: taData.value?.trend.map((t) => t.label) ?? [],
  datasets: [
    {
      data: taData.value?.trend.map((t) => t.ach) ?? [],
      borderColor: "#42A5F5",
      backgroundColor: "rgba(66,165,245,0.15)",
      fill: true,
      tension: 0.4,
      pointRadius: 2,
    },
  ],
}));

const perStoreChartData = computed<ChartData<"bar">>(() => {
  const stores = taData.value?.perStore ?? [];
  return {
    labels: stores.map((s) => s.nama_cabang),
    datasets: [
      {
        data: stores.map((s) => Number(s.growthPercent.toFixed(1))),
        backgroundColor: stores.map((s) =>
          s.growthPercent > 0 ? "#4CAF50" : s.growthPercent < 0 ? "#F44336" : "#9E9E9E"
        ),
        borderRadius: 4,
        barThickness: 14,
      },
    ],
  };
});

const perStoreChartOptions: ChartOptions<"bar"> = {
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
      ticks: { callback: (v) => `${v}%`, font: { size: 9 } },
      grid: { color: "rgba(0,0,0,0.06)" },
    },
    y: {
      ticks: { font: { size: 10 } },
      grid: { display: false },
    },
  },
};

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

onMounted(() => {
  fetchCabangOptions(); // BARU — sebelumnya dideklarasikan tapi tidak pernah dipanggil
  refreshAll();
});
</script>

<template>
  <div class="work-summary pa-2 pa-md-0">
    <div class="d-flex align-center mb-5 flex-wrap ga-3">
      <div>
        <h2 class="ws-title">Summary Hasil Pekerjaan</h2>
        <p class="ws-subtitle">Ringkasan status Surat Pesanan &amp; proses lainnya</p>
      </div>
      <v-spacer />
      <v-select
        v-if="isKDC"
        v-model="selectedCabang"
        :items="[{ kode: 'ALL', nama: 'Semua Cabang' }, ...cabangList]"
        item-title="nama"
        item-value="kode"
        density="compact"
        variant="outlined"
        hide-details
        style="min-width: 200px"
        class="ws-cabang-select"
      />
      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-refresh"
        class="text-none font-weight-bold"
        @click="refreshAll"
        :loading="loadingCards || loadingTa"
      >
        Refresh
      </v-btn>
    </div>

    <v-card
      v-if="loadingTa"
      elevation="0"
      class="ta-hero-card mb-6 d-flex justify-center align-center"
      style="min-height: 140px"
    >
      <v-progress-circular indeterminate color="primary" size="32" />
    </v-card>

    <v-card
      v-else-if="taData"
      elevation="0"
      class="ta-hero-card mb-6"
      :class="isTargetAchieved ? 'ta-hero--achieved' : 'ta-hero--behind'"
    >
      <div class="ta-hero-content d-flex flex-wrap align-center justify-space-between ga-4">
        <div
          class="ta-hero-info"
          :class="{ 'ta-hero-info--hoverable': taData.isViewingAll && taData.perStore.length > 0 }"
        >
          <div class="ta-hero-label">
            <v-icon size="14" class="mr-1">mdi-target</v-icon>
            Target Achievement — {{ taData.cabangLabel }}
            <v-icon
              v-if="taData.isViewingAll && taData.perStore.length > 0"
              size="12"
              class="ml-1 ta-hero-hint-icon"
            >
              mdi-information-outline
            </v-icon>
          </div>
          <div class="d-flex align-baseline ga-3 mt-1">
            <span class="ta-hero-percent" :class="`text-${achColor(taData.ach)}`">
              {{ taData.ach.toFixed(1) }}%
            </span>
            <span class="ta-hero-growth" :class="growthColor">
              <v-icon size="14">{{ growthIcon }}</v-icon>
              {{ Math.abs(taData.growthPercent).toFixed(1) }}% vs bulan lalu
            </span>
          </div>
          <div class="ta-hero-sub">
            {{ formatRupiah(taData.nominal) }}
            <span class="text-medium-emphasis">/ {{ formatRupiah(taData.target) }}</span>
          </div>

          <v-menu
            v-if="taData.isViewingAll && taData.perStore.length > 0"
            activator="parent"
            open-on-hover
            location="bottom start"
            :close-on-content-click="false"
          >
            <v-card max-width="680" elevation="4" class="rounded-lg">
              <v-list-item class="bg-primary-lighten-5 py-2">
                <v-list-item-title class="text-caption font-weight-bold">
                  Growth per Cabang vs Bulan Lalu — {{ taData.periodeLabel }}
                </v-list-item-title>
              </v-list-item>
              <v-divider />

              <div class="d-flex">
                <div
                  class="pa-3 flex-shrink-0"
                  style="width: 340px; border-right: 1px solid rgba(0, 0, 0, 0.08)"
                  :style="{ height: `${Math.max(160, taData.perStore.length * 26)}px` }"
                >
                  <Bar :data="perStoreChartData" :options="perStoreChartOptions" />
                </div>

                <v-list
                  density="compact"
                  class="py-0 flex-grow-1"
                  :style="{
                    maxHeight: `${Math.max(160, taData.perStore.length * 26)}px`,
                    overflowY: 'auto',
                  }"
                >
                  <v-list-item v-for="store in taData.perStore" :key="store.kode_cabang">
                    <v-list-item-title class="text-caption font-weight-medium">
                      {{ store.nama_cabang }}
                    </v-list-item-title>
                    <v-list-item-subtitle class="text-caption">
                      {{ formatRupiah(store.nominal) }}
                      <span class="text-disabled"
                        >(prev: {{ formatRupiah(store.prevNominal) }})</span
                      >
                    </v-list-item-subtitle>
                    <template #append>
                      <v-chip
                        size="x-small"
                        :color="
                          store.growthPercent > 0
                            ? 'success'
                            : store.growthPercent < 0
                            ? 'error'
                            : 'grey'
                        "
                        variant="flat"
                        class="font-weight-bold"
                      >
                        {{ store.growthPercent > 0 ? "+" : ""
                        }}{{ store.growthPercent.toFixed(0) }}%
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </div>
            </v-card>
          </v-menu>
        </div>

        <div class="ta-hero-chart">
          <Line :data="trendChartData" :options="trendChartOptions" />
        </div>
      </div>
    </v-card>

    <div class="ws-legend mb-3">
      <span class="ws-legend-item">
        <span class="ws-legend-dot bg-success" />
        Baik — tidak ada kendala
      </span>
      <span class="ws-legend-item">
        <span class="ws-legend-dot bg-warning" />
        Perlu Perhatian
      </span>
      <span class="ws-legend-item">
        <span class="ws-legend-dot bg-error" />
        Kritis — segera ambil tindakan
      </span>
    </div>

    <v-row v-if="loadingCards" justify="center" class="pa-10">
      <v-progress-circular indeterminate color="primary" size="40" />
    </v-row>

    <v-row v-else-if="cards.length === 0" justify="center" class="pa-10">
      <div class="text-center text-medium-emphasis">
        <v-icon size="44" color="success">mdi-check-all</v-icon>
        <div class="mt-2 ws-empty-text">Belum ada data ringkasan.</div>
      </div>
    </v-row>

    <v-row v-else dense>
      <v-col v-for="card in cards" :key="card.key" cols="12" sm="6" md="4" lg="3">
        <div class="ws-card" :data-status="card.status" @click="openDetail(card)">
          <div class="ws-card-head">
            <span class="ws-card-icon" :data-status="card.status">
              <v-icon size="16">{{ card.icon }}</v-icon>
            </span>
            <span class="ws-card-title">{{ card.title }}</span>
          </div>

          <div class="ws-card-metric">
            <span class="ws-card-number">{{ card.current }}</span>
            <span v-if="card.total !== null" class="ws-card-number-total">/{{ card.total }}</span>
          </div>

          <div v-if="card.extra" class="ws-card-extra">
            {{ card.extra.current.toLocaleString("id-ID") }}/{{
              card.extra.total.toLocaleString("id-ID")
            }}
            <span class="ws-card-extra-label">{{ card.extra.label }}</span>
          </div>

          <div v-if="card.nominal" class="ws-card-nominal">
            {{ formatRupiah(card.nominal) }}
          </div>

          <div v-if="card.status !== 'netral'" class="ws-card-footer">
            <div class="ws-card-track">
              <div
                class="ws-card-fill"
                :data-status="card.status"
                :style="{ width: (card.percent ?? 0) + '%' }"
              />
            </div>
            <span class="ws-card-status-text" :data-status="card.status">{{
              statusLabel(card.status)
            }}</span>
          </div>
        </div>
      </v-col>
    </v-row>
  </div>

  <v-dialog v-model="showDetailDialog" max-width="960" scrollable class="ws-dialog">
    <v-card class="rounded-xl overflow-hidden ws-dialog-card">
      <div class="detail-dialog-header">
        <div class="d-flex align-center">
          <v-icon size="20" class="mr-2">{{ activeCard?.icon }}</v-icon>
          <span class="detail-dialog-title">{{ activeCard?.title }}</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="showDetailDialog = false" />
      </div>

      <v-card-text class="pa-0 ws-detail-scroll" style="max-height: 60vh; overflow-y: auto">
        <div v-if="detailLoading" class="text-center pa-10">
          <v-progress-circular indeterminate color="primary" size="36" />
        </div>

        <div v-else-if="detailRows.length === 0" class="text-center pa-10 text-medium-emphasis">
          <v-icon size="40" color="success">mdi-check-circle-outline</v-icon>
          <div class="mt-2 detail-empty-text">Tidak ada data.</div>
        </div>

        <template v-else>
          <v-table density="compact" hover class="ws-detail-table">
            <thead>
              <tr>
                <th class="detail-th" style="width: 160px">NOMOR</th>
                <th class="detail-th" style="width: 110px">TANGGAL</th>
                <th class="detail-th">CUSTOMER</th>
                <th class="detail-th text-right" style="width: 160px">NOMINAL</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in detailRows"
                :key="row.nomor"
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
                <td class="detail-td text-right font-weight-medium">
                  {{ row.nominal ? formatRupiah(row.nominal) : "-" }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="detail-total-row">
                <td class="detail-td font-weight-bold" colspan="3">
                  TOTAL ({{ detailRows.length }} data dimuat{{
                    !detailFinished ? ", belum semua" : ""
                  }})
                </td>
                <td class="detail-td text-right font-weight-bold">
                  {{ formatRupiah(detailTotalNominal) }}
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
      <v-card-actions class="pa-3 bg-grey-lighten-5">
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
@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");

.work-summary {
  font-family: "Plus Jakarta Sans", "Roboto", sans-serif;
}
.ws-title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: rgb(var(--v-theme-on-surface));
  margin: 0;
}
.ws-subtitle {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin: 2px 0 0;
}
.ws-empty-text {
  font-size: 0.85rem;
  font-weight: 500;
}

/* ── Target Achievement hero (tidak diubah) ── */
.ta-hero-card {
  border-radius: 20px;
  padding: 22px 26px;
  background: linear-gradient(
    135deg,
    rgba(var(--v-theme-primary), 0.06),
    rgba(var(--v-theme-primary), 0.01)
  );
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  position: relative;
  overflow: hidden;
  isolation: isolate;
}
.ta-hero-content {
  position: relative;
  z-index: 2;
}
.ta-hero-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 1;
}
.ta-hero--behind::before {
  animation: wind-gust-red 2.6s ease-in-out infinite;
}
.ta-hero--achieved::before {
  animation: wind-gust-green 2.8s ease-in-out infinite;
}
@keyframes wind-gust-red {
  0% {
    box-shadow: inset 0 0 0 0 rgba(244, 67, 54, 0), 0 0 0 0 rgba(244, 67, 54, 0);
  }
  8% {
    box-shadow: inset 0 0 24px 2px rgba(244, 67, 54, 0.35), 0 0 28px 4px rgba(244, 67, 54, 0.3);
  }
  22% {
    box-shadow: inset 0 0 6px 1px rgba(244, 67, 54, 0.1), 0 0 6px 1px rgba(244, 67, 54, 0.08);
  }
  32%,
  100% {
    box-shadow: inset 0 0 0 0 rgba(244, 67, 54, 0), 0 0 0 0 rgba(244, 67, 54, 0);
  }
}
@keyframes wind-gust-green {
  0% {
    box-shadow: inset 0 0 0 0 rgba(76, 175, 80, 0), 0 0 0 0 rgba(76, 175, 80, 0);
  }
  8% {
    box-shadow: inset 0 0 22px 2px rgba(76, 175, 80, 0.3), 0 0 26px 4px rgba(76, 175, 80, 0.25);
  }
  22% {
    box-shadow: inset 0 0 6px 1px rgba(76, 175, 80, 0.08), 0 0 6px 1px rgba(76, 175, 80, 0.06);
  }
  32%,
  100% {
    box-shadow: inset 0 0 0 0 rgba(76, 175, 80, 0), 0 0 0 0 rgba(76, 175, 80, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ta-hero--behind::before,
  .ta-hero--achieved::before {
    animation: none;
  }
  .ta-hero--behind::before {
    box-shadow: inset 0 0 0 1px rgba(244, 67, 54, 0.3);
  }
  .ta-hero--achieved::before {
    box-shadow: inset 0 0 0 1px rgba(76, 175, 80, 0.3);
  }
}
.ta-hero-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.6);
  display: flex;
  align-items: center;
}
.ta-hero-percent {
  font-size: 2.4rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
}
.ta-hero-growth {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.8rem;
  font-weight: 700;
}
.ta-hero-sub {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin-top: 4px;
}
.ta-hero-chart {
  width: 220px;
  height: 80px;
  cursor: default;
}
@media (max-width: 600px) {
  .ta-hero-chart {
    width: 100%;
    height: 60px;
  }
}
.ta-hero-info {
  position: relative;
}
.ta-hero-info--hoverable {
  cursor: pointer;
  border-radius: 10px;
  padding: 4px 8px;
  margin: -4px -8px;
  transition: background 0.15s ease;
}
.ta-hero-info--hoverable:hover {
  background: rgba(var(--v-theme-primary), 0.05);
}
.ta-hero-hint-icon {
  color: rgba(var(--v-theme-on-surface), 0.4);
  vertical-align: middle;
}

/* ── Legend (tidak diubah) ── */
.ws-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 10px 14px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-radius: 10px;
}
.ws-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.65);
}
.ws-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

/* ── Summary cards (REDESIGN) ── */
.ws-card {
  position: relative;
  border-radius: 10px;
  padding: 16px 18px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.09);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  height: 100%;
}
.ws-card:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.18);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}

.ws-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.ws-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.55);
  background: rgba(var(--v-theme-on-surface), 0.055);
}
.ws-card-icon[data-status="kritis"] {
  color: #b3261e;
  background: rgba(179, 38, 30, 0.08);
}
.ws-card-icon[data-status="perhatian"] {
  color: #a15c00;
  background: rgba(161, 92, 0, 0.08);
}
.ws-card-icon[data-status="baik"] {
  color: #1b6e3c;
  background: rgba(27, 110, 60, 0.08);
}

.ws-card-title {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.5);
  line-height: 1.25;
}

.ws-card-metric {
  display: flex;
  align-items: baseline;
  gap: 3px;
  line-height: 1;
}
.ws-card-number {
  font-size: 1.65rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: rgb(var(--v-theme-on-surface));
  font-variant-numeric: tabular-nums;
}
.ws-card-number-total {
  font-size: 0.95rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-variant-numeric: tabular-nums;
}

.ws-card-extra {
  font-size: 0.76rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.ws-card-extra-label {
  font-size: 0.66rem;
  font-weight: 500;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.35);
  margin-left: 2px;
}

.ws-card-nominal {
  font-size: 0.78rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-top: 3px;
}

.ws-card-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.ws-card-track {
  flex-grow: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  overflow: hidden;
}
.ws-card-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.ws-card-fill[data-status="kritis"] {
  background: #c62828;
}
.ws-card-fill[data-status="perhatian"] {
  background: #b8790a;
}
.ws-card-fill[data-status="baik"] {
  background: #2e7d32;
}

.ws-card-status-text {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}
.ws-card-status-text[data-status="kritis"] {
  color: #c62828;
}
.ws-card-status-text[data-status="perhatian"] {
  color: #b8790a;
}
.ws-card-status-text[data-status="baik"] {
  color: #2e7d32;
}
</style>

<style>
@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");

.ws-dialog .ws-dialog-card {
  font-family: "Plus Jakarta Sans", "Roboto", sans-serif;
}
.ws-detail-table thead th {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #eef2ff !important;
  color: #3730a3 !important;
  border-bottom: 2px solid #6366f1 !important;
}
.ws-detail-scroll {
  position: relative;
}
.ws-detail-table .v-table__wrapper {
  overflow: visible !important;
}

.ws-detail-table thead th {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #eef2ff !important;
  color: #3730a3 !important;
  border-bottom: 2px solid #6366f1 !important;
}

.ws-detail-table tfoot td {
  position: sticky;
  bottom: 0;
  z-index: 5;
  background: #f8fafc !important;
  border-top: 2px solid #94a3b8 !important;
}

.detail-total-row td {
  font-size: 0.8rem;
}

.detail-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: rgb(var(--v-theme-surface));
}
.detail-dialog-title {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.detail-th {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.detail-td {
  font-size: 0.8rem;
  font-weight: 500;
}
.detail-row-clickable {
  cursor: pointer;
}
.detail-row-clickable:hover {
  background: rgba(var(--v-theme-primary), 0.05);
}
.detail-empty-text,
.detail-finished-text {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.detail-count-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>

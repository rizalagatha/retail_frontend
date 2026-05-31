<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from "vue";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";
import { initPivot, jQuery as jq } from "@/lib/pivottable-setup";

// CSS pivot di-import di main.ts:
//   import "pivottable/dist/pivot.css"
//   import "jquery-ui/dist/themes/base/jquery-ui.css"

// ─── Types ────────────────────────────────────────────────────────────────────
interface SalesRecord {
  Nomor?: string;
  Tahun: number;
  Bulan: number;
  Tanggal?: string;
  KdCus?: string;
  Customer?: string;
  Level_?: string;
  Kode?: string;
  Nama: string;
  Ukuran: string;
  Qty: number;
  Nominal: number;
  Store: string;
  NamaStore: string;
  KtgProduk: string;
  KtgBarang?: string;
  JenisKain?: string;
  Warna?: string;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
const toast = useToast();
const router = useRouter();
const auth = useAuthStore();
const MENU_ID = "506";

// ─── State ────────────────────────────────────────────────────────────────────
const allData = ref<SalesRecord[]>([]); // raw → tab Data Mentah
const pivotData = ref<SalesRecord[]>([]); // agregat → PivotTable.js
const isLoading = ref(true);
const isLoadingMore = ref(false);
const activeTab = ref<"pivot" | "raw">("pivot");

const pivotContainer = ref<HTMLElement | null>(null);
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const PAGE_SIZE = 100;
const displayedRows = ref(PAGE_SIZE);

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
});

// ─── Computed ─────────────────────────────────────────────────────────────────
const visibleRows = computed(() => allData.value.slice(0, displayedRows.value));
const hasMore = computed(() => displayedRows.value < allData.value.length);

const totalQty = computed(() => allData.value.reduce((s, r) => s + (Number(r.Qty) || 0), 0));
const totalNominal = computed(() =>
  allData.value.reduce((s, r) => s + (Number(r.Nominal) || 0), 0)
);

// ─── PivotTable.js ─────────────────────────────────────────────────────────────
const renderPivot = async () => {
  await nextTick();
  await nextTick();
  if (!pivotContainer.value || pivotData.value.length === 0) return;

  // Load jquery-ui + pivottable dari CDN secara berurutan
  await initPivot();

  const plainData = pivotData.value.map((row) => ({
    Store: String(row.Store ?? ""),
    NamaStore: String(row.NamaStore ?? ""),
    Tahun: Number(row.Tahun ?? 0),
    Bulan: Number(row.Bulan ?? 0),
    Nama: String(row.Nama ?? ""),
    KtgProduk: String(row.KtgProduk ?? ""),
    Ukuran: String(row.Ukuran ?? ""),
    Qty: Number(row.Qty ?? 0),
    Nominal: Number(row.Nominal ?? 0),
  }));

  let savedConfig: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem("pivot_config_penjualan");
    if (raw) savedConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (jq(pivotContainer.value) as any).empty().pivotUI(
    plainData,
    {
      rows: (savedConfig.rows as string[]) ?? ["Nama"],
      cols: (savedConfig.cols as string[]) ?? ["Store"],
      vals: (savedConfig.vals as string[]) ?? ["Nominal"],
      aggregatorName: (savedConfig.aggregatorName as string) ?? "Sum",
      rendererName: (savedConfig.rendererName as string) ?? "Table",
      hiddenAttributes: [],
      onRefresh: (config: Record<string, unknown>) => {
        localStorage.setItem("pivot_config_penjualan", JSON.stringify(config));
      },
    },
    true
  );
};

// ─── Infinite Scroll ──────────────────────────────────────────────────────────
const loadMore = () => {
  if (!hasMore.value || isLoadingMore.value) return;
  isLoadingMore.value = true;
  setTimeout(() => {
    displayedRows.value = Math.min(displayedRows.value + PAGE_SIZE, allData.value.length);
    isLoadingMore.value = false;
  }, 80);
};

const setupObserver = () => {
  observer?.disconnect();
  if (!sentinel.value) return;
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) loadMore();
    },
    { threshold: 0.1 }
  );
  observer.observe(sentinel.value);
};

// ─── Data Fetching ─────────────────────────────────────────────────────────────
const fetchData = async () => {
  isLoading.value = true;
  displayedRows.value = PAGE_SIZE;
  try {
    // Fetch paralel: raw untuk Data Mentah, agregat untuk Pivot
    const [rawRes, aggRes] = await Promise.all([
      api.get("/laporan-penjualan-pivot", { params: filters }),
      api.get("/laporan-penjualan-pivot/aggregated", { params: filters }),
    ]);
    allData.value = rawRes.data;
    pivotData.value = aggRes.data;
  } catch (err) {
    const e = err as AxiosError<{ message?: string }>;
    toast.error(e.response?.data?.message || "Gagal memuat data.");
  } finally {
    isLoading.value = false;
    if (activeTab.value === "pivot") {
      await nextTick();
      await nextTick();
      renderPivot();
    } else {
      await nextTick();
      setupObserver();
    }
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────
const exportData = () => {
  if (!allData.value.length) return toast.warning("Tidak ada data untuk diekspor.");
  const ws = XLSX.utils.json_to_sheet(allData.value);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Laporan Penjualan");
  XLSX.writeFile(wb, `Laporan_Penjualan_${filters.startDate}_${filters.endDate}.xlsx`);
};

const goToChart = () => {
  const r = router.resolve({ name: "LaporanPenjualanChart", query: { ...filters } });
  window.open(r.href, "_blank");
};

const formatRp = (val: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(val);

// ─── Watchers ─────────────────────────────────────────────────────────────────
watch(activeTab, async (tab) => {
  if (tab === "pivot") {
    await nextTick();
    await nextTick();
    renderPivot();
  } else {
    await nextTick();
    setupObserver();
  }
});

watch(sentinel, () => {
  if (activeTab.value === "raw") setupObserver();
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => fetchData());
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <PageLayout title="Laporan Penjualan" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportData">
        Export Excel
      </v-btn>
      <v-btn
        size="small"
        color="primary"
        variant="tonal"
        append-icon="mdi-chart-bar"
        @click="goToChart"
      >
        Grafik
      </v-btn>
    </template>

    <div class="pivot-layout">
      <!-- ── Filter Bar ─────────────────────────────────────────────── -->
      <div class="filter-bar">
        <span class="filter-label">Tanggal Invoice:</span>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          @change="fetchData"
        />
        <span class="filter-sep">s/d</span>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          @change="fetchData"
        />

        <!-- Ringkasan -->
        <v-chip
          v-if="!isLoading"
          size="small"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-database"
        >
          {{ allData.length.toLocaleString("id-ID") }} transaksi
        </v-chip>
        <v-chip
          v-if="!isLoading"
          size="small"
          color="green-darken-1"
          variant="tonal"
          prepend-icon="mdi-cash"
        >
          Rp {{ formatRp(totalNominal) }}
        </v-chip>

        <v-spacer />
        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="isLoading"
          @click="fetchData"
        />
      </div>

      <!-- ── Tabs ───────────────────────────────────────────────────── -->
      <v-tabs v-model="activeTab" density="compact" class="pivot-tabs">
        <v-tab value="pivot">
          <v-icon start size="16">mdi-table-pivot</v-icon>
          Pivot Interaktif
        </v-tab>
        <v-tab value="raw">
          <v-icon start size="16">mdi-table</v-icon>
          Data Mentah
          <v-chip v-if="!isLoading" size="x-small" class="ms-2" color="grey">
            {{ allData.length.toLocaleString("id-ID") }}
          </v-chip>
        </v-tab>
      </v-tabs>

      <!-- ── Content ────────────────────────────────────────────────── -->
      <div class="tab-content">
        <!-- Loading -->
        <div v-if="isLoading" class="loading-overlay">
          <v-progress-circular indeterminate size="48" color="primary" />
          <div class="mt-3" style="font-size: 11px; color: #888">Memuat data...</div>
        </div>

        <!-- Pivot Tab -->
        <div v-show="!isLoading && activeTab === 'pivot'" class="pivot-wrapper">
          <div class="pivot-hint">
            <v-icon size="14" color="grey">mdi-gesture-drag</v-icon>
            Drag field ke baris/kolom. Tersedia: Store, NamaStore, Tahun, Bulan, Nama, KtgProduk,
            Ukuran, Qty, Nominal.
          </div>
          <div ref="pivotContainer" class="pivot-container" />
        </div>

        <!-- Raw Tab -->
        <div v-show="!isLoading && activeTab === 'raw'" class="raw-wrapper">
          <div class="raw-table-scroll">
            <table class="raw-table">
              <thead>
                <tr>
                  <th class="col-no">#</th>
                  <th class="col-store">Store</th>
                  <th class="col-tgl">Tanggal</th>
                  <th class="col-nomor">Nomor</th>
                  <th class="col-cus">Customer</th>
                  <th class="col-nama">Nama Barang</th>
                  <th class="col-ukuran">Ukuran</th>
                  <th class="col-qty">Qty</th>
                  <th class="col-nominal">Nominal</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in visibleRows" :key="`${row.Nomor}_${row.Kode}_${idx}`">
                  <td class="col-no">{{ idx + 1 }}</td>
                  <td class="col-store">
                    <v-chip size="x-small" color="primary" variant="tonal">{{ row.Store }}</v-chip>
                  </td>
                  <td class="col-tgl">
                    {{ row.Tanggal ? format(parseISO(row.Tanggal), "dd/MM/yyyy") : "-" }}
                  </td>
                  <td class="col-nomor">{{ row.Nomor }}</td>
                  <td class="col-cus">{{ row.Customer }}</td>
                  <td class="col-nama">{{ row.Nama }}</td>
                  <td class="col-ukuran">{{ row.Ukuran }}</td>
                  <td class="col-qty">{{ row.Qty.toLocaleString("id-ID") }}</td>
                  <td class="col-nominal">{{ formatRp(row.Nominal) }}</td>
                </tr>
              </tbody>
              <!-- Summary footer -->
              <tfoot>
                <tr class="summary-row">
                  <td colspan="7" class="text-right font-weight-bold">TOTAL:</td>
                  <td class="col-qty font-weight-bold">{{ totalQty.toLocaleString("id-ID") }}</td>
                  <td class="col-nominal font-weight-bold text-primary">
                    {{ formatRp(totalNominal) }}
                  </td>
                </tr>
              </tfoot>
            </table>

            <!-- Sentinel -->
            <div ref="sentinel" class="sentinel">
              <div v-if="isLoadingMore" class="sentinel-inner">
                <v-progress-circular indeterminate size="18" color="primary" />
                <span class="ms-2">Memuat lebih banyak...</span>
              </div>
              <div v-else-if="!hasMore && allData.length > 0" class="sentinel-inner">
                <v-icon size="14" color="grey">mdi-check-circle-outline</v-icon>
                <span class="ms-1"
                  >Semua {{ allData.length.toLocaleString("id-ID") }} baris ditampilkan</span
                >
              </div>
            </div>
          </div>

          <!-- Floating counter -->
          <div class="row-counter">
            {{ Math.min(displayedRows, allData.length).toLocaleString("id-ID") }}
            / {{ allData.length.toLocaleString("id-ID") }}
          </div>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
/* ─── Global 11px ─────────────────────────────────────────────────────────── */
.pivot-layout,
.pivot-layout :deep(*) {
  font-size: 11px;
}

/* ─── Layout ──────────────────────────────────────────────────────────────── */
.pivot-layout {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 112px);
  overflow: hidden;
}

.filter-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.filter-label {
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
}
.filter-sep {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.pivot-tabs {
  flex-shrink: 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.tab-content {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

/* ─── Loading ─────────────────────────────────────────────────────────────── */
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(var(--v-theme-surface));
  z-index: 10;
}

/* ─── Pivot Tab ───────────────────────────────────────────────────────────── */
.pivot-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.pivot-hint {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  background: rgba(var(--v-theme-primary), 0.03);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.pivot-container {
  flex: 1 1 auto;
  overflow: auto;
  padding: 12px;
}

/* PivotTable.js overrides */
:deep(.pvtUi),
:deep(.pvtUi *) {
  font-size: 11px !important;
  font-family: inherit !important;
}

:deep(.pvtUi) {
  border: none !important;
  background: transparent !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

:deep(.pvtUi td) {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1) !important;
  background: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

:deep(.pvtAxisContainer),
:deep(.pvtVals) {
  background: rgba(var(--v-theme-primary), 0.04) !important;
  border: 1px solid rgba(var(--v-theme-primary), 0.15) !important;
  border-radius: 4px !important;
  min-height: 48px !important;
  padding: 4px !important;
}

:deep(.pvtAttr) {
  background: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgb(var(--v-theme-primary)) !important;
  border: 1px solid rgba(var(--v-theme-primary), 0.25) !important;
  border-radius: 3px !important;
  padding: 2px 7px !important;
  font-weight: 600 !important;
  cursor: grab !important;
}
:deep(.pvtAttr:active) {
  cursor: grabbing !important;
}

:deep(.pvtTable th) {
  background: rgb(13, 71, 161) !important;
  color: #fff !important;
  font-weight: 700 !important;
  padding: 5px 9px !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  white-space: nowrap !important;
}

:deep(.pvtTable td) {
  padding: 3px 9px !important;
  text-align: right !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
}

:deep(.pvtTotal),
:deep(.pvtGrandTotal) {
  font-weight: 700 !important;
  background: rgba(var(--v-theme-primary), 0.07) !important;
}

:deep(.pvtRowLabel),
:deep(.pvtColLabel) {
  text-align: left !important;
  font-weight: 600 !important;
}

:deep(select.pvtRenderer),
:deep(select.pvtAggregator) {
  padding: 3px 5px !important;
  border-radius: 3px !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2) !important;
  background: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

:deep(.pvtFilterBox) {
  padding: 8px !important;
  min-width: 200px !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15) !important;
  border-radius: 6px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15) !important;
  background: rgb(var(--v-theme-surface)) !important;
}

:deep(.pvtFilterBox p) {
  display: flex !important;
  gap: 6px !important;
  margin: 6px 0 0 !important;
}

:deep(.pvtFilterBox button) {
  flex: 1 !important;
  padding: 4px 8px !important;
  border-radius: 4px !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2) !important;
  background: rgba(var(--v-theme-primary), 0.08) !important;
  color: rgb(var(--v-theme-primary)) !important;
  cursor: pointer !important;
  font-weight: 600 !important;
}

:deep(.pvtCheckContainer) {
  max-height: 200px !important;
  overflow-y: auto !important;
}

/* ─── Raw Table ───────────────────────────────────────────────────────────── */
.raw-wrapper {
  height: 100%;
  position: relative;
  overflow: hidden;
}

.raw-table-scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: auto;
}

.raw-table {
  width: 100%;
  border-collapse: collapse;
}

.raw-table thead {
  position: sticky;
  top: 0;
  z-index: 5;
}

.raw-table th {
  background: rgb(13, 71, 161) !important;
  color: #fff !important;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  white-space: nowrap;
}

.raw-table td {
  padding: 4px 9px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  vertical-align: middle;
}

.raw-table tbody tr:hover td {
  background: rgba(var(--v-theme-primary), 0.04);
}

/* Summary footer */
.raw-table tfoot {
  position: sticky;
  bottom: 0;
  z-index: 4;
}
.summary-row td {
  background: rgba(var(--v-theme-primary), 0.06) !important;
  border-top: 2px solid rgb(13, 71, 161) !important;
  padding: 5px 9px;
}

/* Column widths */
.col-no {
  width: 44px;
  text-align: center;
  color: #999;
}
.col-store {
  width: 70px;
}
.col-tgl {
  width: 90px;
  white-space: nowrap;
}
.col-nomor {
  width: 130px;
  font-family: monospace;
}
.col-cus {
  min-width: 160px;
}
.col-nama {
  min-width: 220px;
}
.col-ukuran {
  width: 66px;
  text-align: center;
}
.col-qty {
  width: 70px;
  text-align: right;
  font-weight: 600;
}
.col-nominal {
  width: 110px;
  text-align: right;
  font-weight: 600;
}

/* Sentinel */
.sentinel {
  padding: 14px;
  display: flex;
  justify-content: center;
}
.sentinel-inner {
  display: flex;
  align-items: center;
  padding: 5px 14px;
  border-radius: 14px;
  background: rgba(var(--v-theme-surface-variant), 0.5);
  color: rgba(var(--v-theme-on-surface), 0.55);
}

/* Floating counter */
.row-counter {
  position: absolute;
  bottom: 10px;
  right: 14px;
  background: rgba(13, 71, 161, 0.88);
  color: #fff;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 10px;
  pointer-events: none;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from "vue";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import axios, { type AxiosError } from "axios";
// jQuery, jquery-ui, pivottable di-init via initPivot() — CDN approach
import { initPivot, jQuery as jq } from "@/lib/pivottable-setup";

// ─── Types ───────────────────────────────────────────────────────────────────
interface StokItem {
  Cabang: string;
  Kode: string;
  Nama: string;
  Ukuran: string;
  Stok: number;
}

interface CabangOption {
  kode: string;
  nama: string;
}

// ─── Init ────────────────────────────────────────────────────────────────────
const toast = useToast();
const router = useRouter();
const auth = useAuthStore();
const MENU_ID = "507";

// ─── State ───────────────────────────────────────────────────────────────────
const allData = ref<StokItem[]>([]); // semua data dari API
const isLoading = ref(true);
const isLoadingMore = ref(false);
const cabangOptions = ref<CabangOption[]>([]);

// Tab: "pivot" | "raw"
const activeTab = ref<"pivot" | "raw">("pivot");

// Infinite scroll state
const PAGE_SIZE = 80;
const displayedRows = ref(PAGE_SIZE); // berapa baris yang dirender
const scrollTarget = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
const sentinel = ref<HTMLElement | null>(null);

const filters = reactive({
  cabang: auth.user?.cabang === "KDC" ? "ALL" : auth.user?.cabang || "",
  tampilkanKosong: false,
});

// PivotTable DOM ref
const pivotContainer = ref<HTMLElement | null>(null);

// ─── Computed ─────────────────────────────────────────────────────────────────
// Baris yang ditampilkan di tab raw (lazy)
const visibleRows = computed(() => allData.value.slice(0, displayedRows.value));

const hasMore = computed(() => displayedRows.value < allData.value.length);

// Kolom dinamis berdasarkan cabang yang muncul di data
const dynamicCols = computed(() => {
  const cabangSet = new Set(allData.value.map((r) => r.Cabang));
  return [...cabangSet].sort();
});

// ─── PivotTable.js ────────────────────────────────────────────────────────────
const renderPivot = async () => {
  await nextTick();
  await nextTick();
  if (!pivotContainer.value || allData.value.length === 0) return;

  // Load jquery-ui + pivottable dari CDN secara berurutan
  // Urutan terjamin 100% karena pakai script tag, bukan bundle
  await initPivot();

  const plainData = allData.value.map((row) => ({
    Cabang: String(row.Cabang ?? ""),
    Nama: String(row.Nama ?? ""),
    Ukuran: String(row.Ukuran ?? ""),
    Stok: Number(row.Stok ?? 0),
  }));

  let savedConfig: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem("pivot_config_stok");
    if (raw) savedConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (jq(pivotContainer.value) as any).empty().pivotUI(
    plainData,
    {
      rows: (savedConfig.rows as string[]) ?? ["Nama"],
      cols: (savedConfig.cols as string[]) ?? ["Cabang"],
      vals: (savedConfig.vals as string[]) ?? ["Stok"],
      aggregatorName: (savedConfig.aggregatorName as string) ?? "Sum",
      rendererName: (savedConfig.rendererName as string) ?? "Table",
      hiddenAttributes: ["Kode"],
      onRefresh: (config: Record<string, unknown>) => {
        localStorage.setItem("pivot_config_stok", JSON.stringify(config));
      },
    },
    true
  );
};

// ─── Infinite Scroll ─────────────────────────────────────────────────────────
const setupObserver = () => {
  if (observer) observer.disconnect();
  if (!sentinel.value) return;

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore.value && !isLoadingMore.value) {
        loadMore();
      }
    },
    { threshold: 0.1 }
  );
  observer.observe(sentinel.value);
};

const loadMore = () => {
  if (!hasMore.value) return;
  isLoadingMore.value = true;
  // Gunakan setTimeout agar browser sempat render sebelum nambah data
  setTimeout(() => {
    displayedRows.value = Math.min(displayedRows.value + PAGE_SIZE, allData.value.length);
    isLoadingMore.value = false;
  }, 100);
};

// ─── Data Fetching ────────────────────────────────────────────────────────────
const fetchData = async () => {
  isLoading.value = true;
  displayedRows.value = PAGE_SIZE; // reset scroll setiap fetch baru
  try {
    const res = await api.get("/laporan-stok-pivot", { params: filters });
    allData.value = res.data;

    // Setelah data masuk, render pivot jika tab pivot aktif
    if (activeTab.value === "pivot") {
      await nextTick();
      renderPivot();
    }
  } catch (err) {
    const e = err as AxiosError<{ message?: string }>;
    toast.error(e.response?.data?.message || "Gagal memuat data.");
  } finally {
    isLoading.value = false;
    // Setup observer setelah DOM dirender
    await nextTick();
    setupObserver();
  }
};

const fetchCabangOptions = async () => {
  try {
    const res = await api.get("/laporan-stok-pivot/cabang-options");
    cabangOptions.value = res.data;
  } catch (err: unknown) {
    let msg = "Gagal memuat filter cabang.";
    if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
    toast.error(msg);
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────
const exportData = () => {
  if (allData.value.length === 0) return toast.warning("Tidak ada data untuk diekspor.");
  const ws = XLSX.utils.json_to_sheet(allData.value);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Laporan Stok");
  XLSX.writeFile(wb, "Laporan_Stok_Pivot.xlsx");
};

const goToChart = () => {
  const r = router.resolve({
    name: "LaporanStokChart",
    query: { cabang: filters.cabang, tampilkanKosong: String(filters.tampilkanKosong) },
  });
  window.open(r.href, "_blank");
};

// ─── Watchers ─────────────────────────────────────────────────────────────────
watch(activeTab, async (tab) => {
  if (tab === "pivot") {
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
onMounted(async () => {
  await fetchCabangOptions();
  await fetchData();
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <PageLayout title="Laporan Stok (Pivot)" :menu-id="MENU_ID">
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
      <!-- ── Filter Bar ──────────────────────────────────────────────── -->
      <div class="filter-bar">
        <v-select
          v-model="filters.cabang"
          :items="cabangOptions"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
          :readonly="auth.user?.cabang !== 'KDC'"
          @update:model-value="fetchData"
        />
        <v-checkbox
          v-model="filters.tampilkanKosong"
          label="Tampilkan Stok Kosong"
          density="compact"
          hide-details
          @update:model-value="fetchData"
        />
        <v-chip
          v-if="!isLoading"
          size="small"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-database"
        >
          {{ allData.length.toLocaleString("id-ID") }} baris
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

      <!-- ── Tabs ────────────────────────────────────────────────────── -->
      <v-tabs v-model="activeTab" density="compact" class="pivot-tabs">
        <v-tab value="pivot">
          <v-icon start size="18">mdi-table-pivot</v-icon>
          Pivot Interaktif
        </v-tab>
        <v-tab value="raw">
          <v-icon start size="18">mdi-table</v-icon>
          Data Mentah
          <v-chip v-if="!isLoading" size="x-small" class="ms-2" color="grey">
            {{ allData.length.toLocaleString("id-ID") }}
          </v-chip>
        </v-tab>
      </v-tabs>

      <!-- ── Content ─────────────────────────────────────────────────── -->
      <div class="tab-content">
        <!-- Loading overlay -->
        <div v-if="isLoading" class="loading-overlay">
          <v-progress-circular indeterminate size="56" color="primary" />
          <div class="text-body-2 mt-3 text-medium-emphasis">Memuat data...</div>
        </div>

        <!-- TAB PIVOT — v-show agar DOM tetap ada, pivot bisa dirender -->
        <div v-show="!isLoading && activeTab === 'pivot'" class="pivot-wrapper">
          <div class="pivot-hint">
            <v-icon size="14" color="grey">mdi-gesture-drag</v-icon>
            Drag field ke baris/kolom untuk mengubah tampilan. Klik header untuk sorting.
          </div>
          <div ref="pivotContainer" class="pivot-container" />
        </div>

        <!-- TAB RAW -->
        <div v-show="!isLoading && activeTab === 'raw'" class="raw-wrapper">
          <div class="raw-table-scroll">
            <table class="raw-table">
              <thead>
                <tr>
                  <th class="col-no">#</th>
                  <th class="col-cabang">Cabang</th>
                  <th class="col-kode">Kode</th>
                  <th class="col-nama">Nama Barang</th>
                  <th class="col-ukuran">Ukuran</th>
                  <th class="col-stok">Stok</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, idx) in visibleRows"
                  :key="`${row.Kode}_${row.Ukuran}_${row.Cabang}`"
                  :class="{ 'row-zero': row.Stok === 0 }"
                >
                  <td class="col-no">{{ idx + 1 }}</td>
                  <td class="col-cabang">
                    <v-chip size="x-small" color="primary" variant="tonal">{{ row.Cabang }}</v-chip>
                  </td>
                  <td class="col-kode">{{ row.Kode }}</td>
                  <td class="col-nama">{{ row.Nama }}</td>
                  <td class="col-ukuran">{{ row.Ukuran }}</td>
                  <td class="col-stok" :class="{ zero: row.Stok === 0 }">
                    {{ row.Stok.toLocaleString("id-ID") }}
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Sentinel untuk IntersectionObserver -->
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
/* ─── Global 11px ────────────────────────────────────────────────────────── */
.pivot-layout,
.pivot-layout :deep(*) {
  font-size: 11px;
}

/* ─── Layout ─────────────────────────────────────────────────────────────── */
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
  padding: 0;
}

.pivot-hint {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  background: rgba(var(--v-theme-primary), 0.03);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.pivot-container {
  flex: 1 1 auto;
  overflow: auto;
  padding: 16px;
}

/* PivotTable.js override — 11px konsisten */
:deep(.pvtUi) {
  font-family: inherit !important;
  font-size: 11px !important;
  border: none !important;
  background: transparent !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

:deep(.pvtUi *) {
  font-size: 11px !important;
  font-family: inherit !important;
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
  border-radius: 6px !important;
  min-height: 56px !important;
}

:deep(.pvtAttr) {
  background: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgb(var(--v-theme-primary)) !important;
  border: 1px solid rgba(var(--v-theme-primary), 0.25) !important;
  border-radius: 4px !important;
  padding: 3px 8px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  cursor: grab !important;
}

:deep(.pvtAttr:active) {
  cursor: grabbing !important;
}

:deep(.pvtTable) {
  border-collapse: collapse !important;
  font-size: 11px !important;
}

:deep(.pvtTable th) {
  background: rgb(var(--v-theme-primary)) !important;
  color: #fff !important;
  font-weight: 700 !important;
  padding: 6px 10px !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  white-space: nowrap !important;
}

:deep(.pvtTable td) {
  padding: 4px 10px !important;
  text-align: right !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
}

:deep(.pvtTotal),
:deep(.pvtGrandTotal) {
  font-weight: 700 !important;
  background: rgba(var(--v-theme-primary), 0.06) !important;
}

:deep(.pvtRowLabel),
:deep(.pvtColLabel) {
  text-align: left !important;
  font-weight: 600 !important;
  background: rgba(var(--v-theme-surface-variant), 0.5) !important;
}

:deep(select.pvtRenderer),
:deep(select.pvtAggregator) {
  font-size: 11px !important;
  padding: 4px 6px !important;
  border-radius: 4px !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2) !important;
  background: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* ─── Raw Tab ─────────────────────────────────────────────────────────────── */
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
  font-size: 12px;
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
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  white-space: nowrap;
}

.raw-table td {
  padding: 5px 10px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  color: rgb(var(--v-theme-on-surface));
  vertical-align: middle;
}

.raw-table tbody tr:hover td {
  background: rgba(var(--v-theme-primary), 0.04);
}

.raw-table tbody tr.row-zero td {
  opacity: 0.45;
}

/* Column widths */
.col-no {
  width: 50px;
  text-align: center;
}
.col-cabang {
  width: 100px;
}
.col-kode {
  width: 130px;
  font-family: monospace;
  font-size: 11px;
}
.col-nama {
  min-width: 240px;
}
.col-ukuran {
  width: 70px;
}
.col-stok {
  width: 100px;
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

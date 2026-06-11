<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from "vue";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { useToast } from "vue-toastification";

interface RealStockItem {
  cabang: string;
  kode: string;
  nama: string;
  ukuran: string;
  stok_fisik: number;
  stok_pesanan: number;
  pesanan_proses: number;
  detail_pesanan_proses: string;
  stok_real: number;
  sudah_minta: number;
  detail_sudah_minta: string;
}

interface CabangOption {
  kode: string;
  nama: string;
}

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "update:overbookedCount", count: number): void;
}>();

const toast = useToast();
const authStore = useAuthStore();

// --- State ---
const items = ref<RealStockItem[]>([]);
const cabangOptions = ref<CabangOption[]>([]);
const isLoading = ref(false);
const isLoadingMore = ref(false);

const filters = reactive({
  search: "",
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  page: 1,
  limit: 40,
});

const hasMore = ref(true);

// --- Infinite Scroll Setup ---
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const isKDC = computed(() => authStore.user?.cabang === "KDC");

const overbookedCount = computed(() => items.value.filter((i) => i.stok_real < 0).length);

// --- Methods ---
const fetchCabangOptions = async () => {
  try {
    const res = await api.get("/dashboard/cabang-options");
    cabangOptions.value = res.data;
  } catch {
    toast.error("Gagal memuat pilihan cabang.");
  }
};

const fetchData = async (isLoadMore = false) => {
  if (isLoadMore) {
    isLoadingMore.value = true;
  } else {
    isLoading.value = true;
    filters.page = 1;
    items.value = [];
    hasMore.value = true;
  }

  try {
    const res = await api.get<RealStockItem[]>("/dashboard/real-stock", {
      params: filters,
    });

    if (isLoadMore) {
      items.value = [...items.value, ...res.data];
    } else {
      items.value = res.data;
    }

    // Jika data yang kembali kurang dari limit, tandai data sudah habis
    if (res.data.length < filters.limit) {
      hasMore.value = false;
    }
  } catch {
    toast.error("Gagal memuat data stok real-time.");
  } finally {
    isLoading.value = false;
    isLoadingMore.value = false;
  }
};

const fetchOverbookedCount = async () => {
  try {
    const res = await api.get<RealStockItem[]>("/dashboard/real-stock", {
      params: {
        cabang: filters.cabang,
        limit: 9999, // ambil semua tapi tanpa detail berat
        page: 1,
        countOnly: true, // flag ke backend untuk query ringan
      },
    });
    const count = res.data.filter((i) => i.stok_real < 0).length;
    emit("update:overbookedCount", count);
  } catch {
    // silent fail
  }
};

onMounted(() => {
  fetchOverbookedCount();
});

const handleLoadMore = () => {
  if (!hasMore.value || isLoadingMore.value || isLoading.value) return;
  filters.page++;
  fetchData(true);
};

const setupObserver = () => {
  if (observer) observer.disconnect();
  if (!sentinel.value) return;

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore.value) {
        handleLoadMore();
      }
    },
    { threshold: 0.1 }
  );
  observer.observe(sentinel.value);
};

// Debounce pencarian teks agar tidak nembak API setiap ketikan huruf
let searchTimeout: NodeJS.Timeout;
watch(
  () => filters.search,
  () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      fetchData();
    }, 400);
  }
);

watch(
  () => filters.cabang,
  () => {
    fetchData();
  }
);

watch(isOpen, async (val) => {
  if (val) {
    await fetchCabangOptions();
    await fetchData();
    await nextTick();
    setupObserver();
  } else {
    observer?.disconnect();
    // Hitung dan emit saat dialog ditutup (data sudah ada)
    emit("update:overbookedCount", overbookedCount.value);
  }
});

watch(overbookedCount, (val) => {
  emit("update:overbookedCount", val);
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <v-dialog v-model="isOpen" max-width="1200px" scrollable persistent>
    <v-card class="rounded-lg">
      <v-toolbar color="blue-darken-4" density="comfortable">
        <v-icon start class="ms-4">mdi-package-variant-closed</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          PENCARIAN DATA STOK REAL-TIME TOKO
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="isOpen = false" />
      </v-toolbar>

      <v-card-text class="pa-4 bg-grey-lighten-4">
        <div class="filter-bar mb-4 pa-3 bg-white rounded-lg border d-flex align-center gap-3">
          <v-text-field
            v-model="filters.search"
            prepend-inner-icon="mdi-magnify"
            label="Cari Artikel / SKU (contoh: Combed 24S Hitam)"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            class="flex-grow-1"
          />
          <v-select
            v-model="filters.cabang"
            :items="cabangOptions"
            item-title="nama"
            item-value="kode"
            label="Pilih Cabang"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 250px"
            :readonly="!isKDC"
          />
          <v-btn
            icon="mdi-refresh"
            variant="tonal"
            color="primary"
            size="small"
            :loading="isLoading"
            @click="fetchData()"
          />
        </div>

        <div class="mb-4 pa-3 rounded-lg alert-info border-left-warning text-caption">
          <v-icon color="amber-darken-3" class="me-1" size="small">mdi-alert-circle-outline</v-icon>
          <strong>Informasi Rumus Penghitungan Kuota Sisa:</strong> Stok Siap Terjual dihitung murni
          berdasarkan
          <span class="text-blue-darken-3 font-weight-bold">Stok Fisik (On Hand)</span> yang
          dikurangi dengan
          <span class="text-orange-darken-4 font-weight-bold"
            >Pesanan Ter-booking (Fixed Booked SO)</span
          >. Segera koordinasikan dengan Sales Counter jika ada SKU berstatus
          <span class="text-red font-weight-bold">OVERBOOKED (-)</span>.
        </div>

        <div class="table-scroll-wrapper border rounded-lg bg-white">
          <table class="realstock-table">
            <thead>
              <tr>
                <th class="text-center" style="width: 60px">No</th>
                <th v-if="isKDC" style="width: 100px">Cabang</th>
                <th style="width: 180px">SKU / Kode Artikel</th>
                <th>Nama Barang / Deskripsi</th>
                <th class="text-center" style="width: 90px">Ukuran</th>
                <th class="text-right" style="width: 140px">Stok Fisik (On Hand)</th>
                <th class="text-right" style="width: 140px">Pesanan Ready (Booked)</th>
                <th class="text-right" style="width: 140px">Pesanan Proses (Fluktuatif)</th>
                <th class="text-center" style="width: 180px">Stok Siap Terjual (Kuota)</th>
                <th class="text-right" style="width: 140px">Sudah Minta</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="isLoading && items.length === 0">
                <td :colspan="isKDC ? 8 : 7" class="text-center py-10">
                  <v-progress-circular indeterminate color="primary" size="32" class="mb-2" />
                  <div class="text-caption text-medium-emphasis">
                    Menyinkronkan data stok real-time...
                  </div>
                </td>
              </tr>

              <tr v-else-if="items.length === 0">
                <td
                  :colspan="isKDC ? 8 : 7"
                  class="text-center py-10 text-grey font-italic text-caption"
                >
                  Tidak ada data barang yang memenuhi kriteria pencarian.
                </td>
              </tr>

              <tr
                v-for="(item, idx) in items"
                :key="`${item.cabang}_${item.kode}_${item.ukuran}`"
                :class="{ 'row-danger-bg': item.stok_real < 0 }"
              >
                <td class="text-center text-medium-emphasis font-weight-bold">{{ idx + 1 }}</td>
                <td v-if="isKDC">
                  <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-bold">{{
                    item.cabang
                  }}</v-chip>
                </td>
                <td class="sku-cell font-weight-bold">{{ item.kode }}</td>
                <td class="nama-cell">{{ item.nama }}</td>
                <td class="text-center font-weight-bold">{{ item.ukuran }}</td>
                <td class="text-right font-weight-medium">
                  {{ item.stok_fisik.toLocaleString("id-ID") }} pcs
                </td>
                <td class="text-right text-blue-darken-2 font-weight-medium">
                  {{ item.stok_pesanan.toLocaleString("id-ID") }} pcs
                </td>

                <td class="text-right text-orange-darken-3 font-weight-medium">
                  <div class="d-flex flex-column align-end">
                    <span class="cursor-pointer">
                      {{ item.pesanan_proses.toLocaleString("id-ID") }} pcs
                    </span>
                    <span style="font-size: 9px; opacity: 0.7">(Rencana Perubahan)</span>
                  </div>

                  <!-- Tooltip Detail -->
                  <v-tooltip
                    activator="parent"
                    location="top"
                    max-width="350"
                    v-if="item.detail_pesanan_proses"
                  >
                    <div class="text-caption font-weight-bold mb-1">Detail SO Pending:</div>
                    <div class="text-caption" v-html="item.detail_pesanan_proses"></div>
                  </v-tooltip>
                </td>

                <td class="text-center">
                  <div v-if="item.stok_real >= 0" class="status-box status-safe">
                    <span class="qty-display"
                      >{{ item.stok_real.toLocaleString("id-ID") }} pcs</span
                    >
                    <span class="status-lbl"
                      ><v-icon size="10">mdi-check-circle</v-icon> AMAN / READY</span
                    >
                  </div>
                  <div v-else class="status-box status-danger">
                    <span class="qty-display"
                      >{{ item.stok_real.toLocaleString("id-ID") }} pcs *</span
                    >
                    <span class="status-lbl"
                      ><v-icon size="10">mdi-alert</v-icon> OVERBOOKED !</span
                    >
                  </div>
                </td>

                <td class="text-right text-indigo-darken-2 font-weight-medium">
                  <div class="d-flex flex-column align-end">
                    <span class="cursor-pointer">
                      {{ item.sudah_minta.toLocaleString("id-ID") }} pcs
                    </span>
                    <span style="font-size: 9px; opacity: 0.7">(Dalam Perjalanan)</span>
                  </div>

                  <v-tooltip
                    activator="parent"
                    location="top"
                    max-width="400"
                    v-if="item.detail_sudah_minta"
                  >
                    <div class="text-caption font-weight-bold mb-1">
                      Detail Barang Dalam Perjalanan:
                    </div>
                    <div class="text-caption" v-html="item.detail_sudah_minta" />
                  </v-tooltip>
                </td>
              </tr>
            </tbody>
          </table>

          <div ref="sentinel" class="sentinel-trigger">
            <div
              v-if="isLoadingMore"
              class="d-flex align-center justify-center py-3 text-caption text-medium-emphasis"
            >
              <v-progress-circular indeterminate size="16" color="primary" class="me-2" />
              Memuat data artikel berikutnya...
            </div>
            <div
              v-else-if="!hasMore && items.length > 0"
              class="text-center py-3 text-caption text-grey font-italic"
            >
              <v-icon size="14" class="me-1">mdi-check-all</v-icon> Seluruh data kecocokan stok real
              telah ditampilkan
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="bg-white border-t pa-3">
        <v-spacer />
        <v-btn
          color="grey-darken-1"
          variant="text"
          size="small"
          class="font-weight-bold"
          @click="isOpen = false"
        >
          Tutup Dialog
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Aturan Font Konsisten 11px */
.realstock-table,
.filter-bar :deep(*),
.alert-info {
  font-size: 11px;
}

.table-scroll-wrapper {
  max-height: calc(100vh - 260px);
  overflow-y: auto;
  overflow-x: auto;
}

.realstock-table {
  width: 100%;
  border-collapse: collapse;
}

.realstock-table thead {
  position: sticky;
  top: 0;
  z-index: 5;
}

.realstock-table th {
  background-color: #0d47a1 !important; /* Biru Tua Konsisten */
  color: #ffffff !important;
  font-weight: bold;
  text-transform: uppercase;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  white-space: nowrap;
}

.realstock-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #e0e0e0;
  color: #212121;
  vertical-align: middle;
}

.realstock-table tbody tr:hover td {
  background-color: #f5f5f5;
}

.sku-cell {
  color: #1565c0;
}

/* Alert Info System Styling */
.alert-info {
  background-color: #fffde7;
  color: #5d4037;
  border: 1px solid #fff59d;
}
.border-left-warning {
  border-left: 4px solid #fbc02d !important;
}

/* Status Box System (Hijau / Merah Kustom Sesuai Gambar Mockup) */
.status-box {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3px 12px;
  border-radius: 4px;
  min-width: 130px;
}

.qty-display {
  font-size: 12px;
  font-weight: 900;
}

.status-lbl {
  font-size: 9px;
  font-weight: bold;
  text-transform: uppercase;
}

.status-safe {
  background-color: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}

.status-danger {
  background-color: #ffebee;
  color: #c62828;
  border: 1px solid #ef9a9a;
}

.row-danger-bg td {
  background-color: #fff8f8;
}

.sentinel-trigger {
  width: 100%;
  min-height: 20px;
}

.gap-3 {
  gap: 12px;
}
</style>

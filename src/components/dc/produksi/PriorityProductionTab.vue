<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import api from "@/services/api";
import axios from "axios";

// --- INTERFACES ---
interface PriorityItem {
  kode: string;
  nama: string;
  ukuran: string;
  kategori: string;
  img_url: string;
  buffer_store: number;
  stok_store: number;
  kekurangan_store: number;
  buffer_dc: number;
  stok_dc: number;
  gap_dc: number;
  spk_beredar: number;
  coverage_dc: number;
  status: string;
  rekomendasi_spk: number;
  ranking_asli: number;
}

interface StoreDetailItem {
  cabang_nama: string;
  buffer: number;
  stok_aktual: number;
  kekurangan: number;
}

const toast = useToast();

// --- STATE ---
const isLoading = ref(false);
const isFetchingNextPage = ref(false); // [BARU] Status loading untuk Infinite Scroll
const priorityData = ref<PriorityItem[]>([]);
const expandedRows = ref<string[]>([]);
const storeDetails = ref<Record<string, StoreDetailItem[]>>({});
const loadingDetails = ref<Record<string, boolean>>({});

// State Pagination & Summary
const currentPage = ref(1);
const itemsPerPage = 50;
const summaryData = reactive({
  totalItems: 0,
  totalStokDC: 0,
  coverageProduksi: 0,
  kapasitasHarian: 1750,
  skuKritis: 0,
  skuPerhatian: 0,
  skuAman: 0,
});

// Mengecek apakah masih ada data yang bisa di-load
const hasMore = computed(() => priorityData.value.length < summaryData.totalItems);

const getImageUrl = (path: string) => {
  if (!path) return "";
  return `${import.meta.env.VITE_API_BASE_URL || ""}${path}`;
};

// --- STATE DIALOG ---
const isPreviewOpen = ref(false);
const previewImageUrl = ref("");
const previewNamaBarang = ref("");

const openPreview = (item: PriorityItem) => {
  previewImageUrl.value = getImageUrl(item.img_url);
  previewNamaBarang.value = item.nama;
  isPreviewOpen.value = true;
};

const filters = reactive({
  kategori: "Semua",
  keyword: "",
});

const kategoriOptions = ["Semua", "REGULER", "SESIONAL", "PESANAN"];

// --- HEADERS ---
const headers = [
  { title: "", key: "data-table-expand", width: 50 },
  { title: "RANK", key: "ranking", width: 60, align: "center" as const },
  { title: "INFO SKU", key: "info_sku", minWidth: 250 },
  { title: "BFFR STORE", key: "buffer_store", align: "end" as const },
  { title: "STOK STORE", key: "stok_store", align: "end" as const },
  { title: "GAP STORE", key: "kekurangan_store", align: "end" as const },
  { title: "BFFR DC", key: "buffer_dc", align: "end" as const },
  { title: "STOK DC", key: "stok_dc", align: "end" as const },
  { title: "GAP DC", key: "gap_dc", align: "end" as const },
  { title: "SPK AKTIF", key: "spk_beredar", align: "end" as const },
  { title: "COVERAGE", key: "coverage_dc", align: "center" as const },
  { title: "STATUS", key: "status", align: "center" as const },
];

// --- API METHODS ---
// Ditambah argumen isLoadMore untuk mendeteksi mode Paging vs Mode Refresh
const fetchPriorityData = async (isLoadMore = false) => {
  if (isLoadMore) {
    isFetchingNextPage.value = true;
  } else {
    isLoading.value = true;
    currentPage.value = 1; // Reset halaman
  }

  try {
    const response = await api.get("/dc-planning/priority", {
      params: {
        ...filters,
        page: currentPage.value,
        itemsPerPage: itemsPerPage,
      },
    });

    if (isLoadMore) {
      // Tambahkan data baru ke bawah data lama
      priorityData.value.push(...response.data.data);
    } else {
      // Timpa semua data (saat refresh/ganti filter)
      priorityData.value = response.data.data;
    }

    summaryData.totalItems = response.data.summary.totalItems;
    summaryData.totalStokDC = response.data.summary.totalStokDC;
    summaryData.coverageProduksi = response.data.summary.coverageProduksi;
    summaryData.kapasitasHarian = response.data.summary.kapasitasHarian;
    summaryData.skuKritis = response.data.summary.skuKritis;
    summaryData.skuPerhatian = response.data.summary.skuPerhatian;
    summaryData.skuAman = response.data.summary.skuAman;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal memuat data prioritas.");
    } else {
      toast.error("Gagal memuat data prioritas.");
    }
  } finally {
    isLoading.value = false;
    isFetchingNextPage.value = false;
  }
};

// [BARU] Fungsi pemicu saat user men-scroll tabel sampai bawah
const loadMore = (isIntersecting: boolean) => {
  // Hanya panggil API jika elemen terlihat (isIntersecting), masih ada data (hasMore), dan sedang tidak loading
  if (isIntersecting && hasMore.value && !isLoading.value && !isFetchingNextPage.value) {
    currentPage.value++;
    fetchPriorityData(true);
  }
};

const fetchStoreDetails = async (kode: string, ukuran: string) => {
  const key = `${kode}_${ukuran}`;
  if (storeDetails.value[key]) return;

  loadingDetails.value[key] = true;
  try {
    const response = await api.get("/dc-planning/store-details", {
      params: { kode, ukuran },
    });
    storeDetails.value[key] = response.data.data;
  } catch (error) {
    console.error("Gagal memuat rincian toko:", error);
  } finally {
    loadingDetails.value[key] = false;
  }
};

const onRowExpand = (item: PriorityItem, isExpanded: boolean) => {
  if (isExpanded) {
    fetchStoreDetails(item.kode, item.ukuran);
  }
};

let searchTimeout: ReturnType<typeof setTimeout>;
const onSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    fetchPriorityData(false);
  }, 600);
};

const getStatusColor = (status: string) => {
  if (status === "Kritis") return "error";
  if (status === "Perlu Perhatian") return "warning";
  return "success";
};

onMounted(() => {
  fetchPriorityData();
});
</script>

<template>
  <div class="d-flex flex-column h-100 gap-4">
    <v-row dense class="flex-shrink-0">
      <v-col>
        <v-card class="bg-blue-lighten-5 border-blue h-100" variant="outlined">
          <v-card-text class="d-flex align-center pa-3">
            <v-avatar color="blue-darken-2" rounded class="me-3">
              <v-icon>mdi-warehouse</v-icon>
            </v-avatar>
            <div>
              <div class="text-caption text-blue-darken-3 font-weight-bold">Stok DC Saat Ini</div>
              <div class="text-subtitle-1 font-weight-black text-blue-darken-4">
                {{ summaryData.totalStokDC.toLocaleString("id-ID") }}
                <span class="text-caption">pcs</span>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col>
        <v-card class="bg-indigo-lighten-5 border-indigo h-100" variant="outlined">
          <v-card-text class="d-flex align-center pa-3">
            <v-avatar color="indigo-darken-2" rounded class="me-3">
              <v-icon>mdi-calendar-clock</v-icon>
            </v-avatar>
            <div>
              <div class="text-caption text-indigo-darken-3 font-weight-bold">
                Coverage Produksi
              </div>
              <div class="text-subtitle-1 font-weight-black text-indigo-darken-4">
                {{ summaryData.coverageProduksi }} <span class="text-caption">Hari</span>
              </div>
              <div class="text-caption" style="font-size: 9px !important">
                ({{ summaryData.kapasitasHarian.toLocaleString("id-ID") }} pcs/hari)
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col>
        <v-card class="bg-red-lighten-5 border-red h-100" variant="outlined">
          <v-card-text class="d-flex align-center pa-3">
            <v-avatar color="red-darken-2" rounded class="me-3">
              <v-icon>mdi-alert-octagon</v-icon>
            </v-avatar>
            <div>
              <div class="text-caption text-red-darken-3 font-weight-bold">
                SKU Kritis (&lt; 7 Hari)
              </div>
              <div class="text-subtitle-1 font-weight-black text-red-darken-4">
                {{ summaryData.skuKritis }} <span class="text-caption">SKU</span>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col>
        <v-card class="bg-orange-lighten-5 border-orange h-100" variant="outlined">
          <v-card-text class="d-flex align-center pa-3">
            <v-avatar color="orange-darken-2" rounded class="me-3">
              <v-icon>mdi-chart-timeline-variant</v-icon>
            </v-avatar>
            <div>
              <div class="text-caption text-orange-darken-3 font-weight-bold">Perlu Perhatian</div>
              <div class="text-subtitle-1 font-weight-black text-orange-darken-4">
                {{ summaryData.skuPerhatian }} <span class="text-caption">SKU</span>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col>
        <v-card class="bg-green-lighten-5 border-green h-100" variant="outlined">
          <v-card-text class="d-flex align-center pa-3">
            <v-avatar color="green-darken-2" rounded class="me-3">
              <v-icon>mdi-check-decagram</v-icon>
            </v-avatar>
            <div>
              <div class="text-caption text-green-darken-3 font-weight-bold">
                SKU Aman (&gt; 15 Hari)
              </div>
              <div class="text-subtitle-1 font-weight-black text-green-darken-4">
                {{ summaryData.skuAman }} <span class="text-caption">SKU</span>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <div class="filter-section dc-planning-filter shadow-sm bg-white rounded border">
      <div class="d-flex align-center ga-2 flex-shrink-0 flex-wrap filter-group-left ms-2">
        <v-label class="filter-label">Kategori SKU:</v-label>
        <v-select
          v-model="filters.kategori"
          :items="kategoriOptions"
          density="compact"
          hide-details
          variant="outlined"
          class="fixed-input kategori-input"
          @update:model-value="fetchPriorityData(false)"
        />
      </div>

      <div class="d-flex align-center flex-grow-1 mx-4 filter-group-center">
        <v-text-field
          v-model="filters.keyword"
          placeholder="Cari SKU / Nama Barang..."
          density="compact"
          hide-details
          variant="outlined"
          clearable
          prepend-inner-icon="mdi-magnify"
          class="flex-grow-input keyword-input"
          @input="onSearchInput"
          @click:clear="
            filters.keyword = '';
            fetchPriorityData(false);
          "
        />
      </div>

      <div class="d-flex align-center flex-shrink-0 filter-group-right me-2">
        <v-btn
          color="primary"
          variant="tonal"
          icon="mdi-refresh"
          size="small"
          title="Refresh Data"
          :loading="isLoading"
          @click="fetchPriorityData(false)"
        />
      </div>
    </div>

    <v-card
      variant="outlined"
      class="flex-grow-1 d-flex flex-column bg-white shadow-sm overflow-hidden"
    >
      <v-data-table
        v-model:expanded="expandedRows"
        :headers="headers"
        :items="priorityData"
        :loading="isLoading"
        :item-value="(item) => `${item.kode}_${item.ukuran}`"
        show-expand
        density="compact"
        class="compact-table d-flex flex-column h-100"
        fixed-header
        hover
        hide-default-footer
        :items-per-page="-1"
        @update:expanded="
          (val) => {
            priorityData.forEach((item) => {
              const rowKey = `${item.kode}_${item.ukuran}`;
              if (val.includes(rowKey)) onRowExpand(item, true);
            });
          }
        "
      >
        <template #[`item.ranking`]="{ item }">
          <div class="font-weight-bold text-red-darken-3 text-center">#{{ item.ranking_asli }}</div>
        </template>

        <template #[`item.info_sku`]="{ item }">
          <div class="d-flex align-center py-1">
            <v-avatar
              rounded
              size="36"
              color="grey-lighten-3"
              class="me-3 border cursor-pointer"
              @click="openPreview(item)"
            >
              <v-img v-if="item.img_url" :src="getImageUrl(item.img_url)" cover />
              <v-icon v-else color="grey-lighten-1" size="small">mdi-image-outline</v-icon>
            </v-avatar>

            <div>
              <div class="font-weight-bold text-primary">{{ item.kode }}</div>
              <div class="text-grey-darken-3" :title="item.nama">
                {{ item.nama }}
              </div>
              <div class="text-caption text-grey" style="font-size: 9px !important">
                Size: <span class="font-weight-bold text-black">{{ item.ukuran }}</span> | Kat:
                {{ item.kategori }}
              </div>
            </div>
          </div>
        </template>

        <template #[`item.kekurangan_store`]="{ item }">
          <span :class="item.kekurangan_store > 0 ? 'text-error font-weight-bold' : ''">
            {{ item.kekurangan_store }}
          </span>
        </template>

        <template #[`item.gap_dc`]="{ item }">
          <span :class="item.gap_dc > 0 ? 'text-error font-weight-bold' : ''">
            {{ item.gap_dc }}
          </span>
        </template>

        <template #[`item.coverage_dc`]="{ item }">
          <span class="font-weight-medium">{{ item.coverage_dc }} Hari</span>
        </template>

        <template #[`item.status`]="{ item }">
          <v-chip
            :color="getStatusColor(item.status)"
            size="x-small"
            class="font-weight-bold text-uppercase"
            variant="flat"
          >
            {{ item.status }}
          </v-chip>
        </template>

        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="bg-grey-lighten-4 pa-0 border-b">
              <div class="pa-4">
                <div class="text-caption font-weight-bold mb-2 text-primary d-flex align-center">
                  <v-icon start size="small">mdi-storefront</v-icon>
                  Rincian Kekurangan Per Toko — {{ item.nama }} ({{ item.ukuran }})
                </div>

                <v-progress-linear
                  v-if="loadingDetails[`${item.kode}_${item.ukuran}`]"
                  indeterminate
                  color="primary"
                  height="2"
                  class="mb-2"
                />

                <v-table v-else density="compact" class="sub-table bg-white rounded border">
                  <thead class="bg-grey-lighten-3">
                    <tr>
                      <th class="text-left text-caption font-weight-bold">Nama Toko</th>
                      <th class="text-right text-caption font-weight-bold">Buffer Store</th>
                      <th class="text-right text-caption font-weight-bold">Stok Aktual</th>
                      <th class="text-right text-caption font-weight-bold text-red">Kekurangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(toko, idx) in storeDetails[`${item.kode}_${item.ukuran}`]"
                      :key="idx"
                    >
                      <td class="text-caption">{{ toko.cabang_nama }}</td>
                      <td class="text-caption text-right">{{ toko.buffer }}</td>
                      <td class="text-caption text-right">{{ toko.stok_aktual }}</td>
                      <td class="text-caption text-right font-weight-bold text-red">
                        {{ toko.kekurangan }}
                      </td>
                    </tr>
                    <tr
                      v-if="
                        !storeDetails[`${item.kode}_${item.ukuran}`] ||
                        storeDetails[`${item.kode}_${item.ukuran}`].length === 0
                      "
                    >
                      <td colspan="4" class="text-center text-caption text-grey py-4">
                        Tidak ada data toko yang kurang (Aman).
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
            </td>
          </tr>
        </template>

        <template #bottom>
          <div
            v-intersect="loadMore"
            class="d-flex justify-center align-center py-4 bg-white border-t"
          >
            <v-progress-circular
              v-if="isFetchingNextPage"
              indeterminate
              color="primary"
              size="24"
              width="3"
              class="me-2"
            />
            <span v-if="isFetchingNextPage" class="text-caption text-primary font-weight-bold">
              Memuat data selanjutnya...
            </span>
            <span
              v-else-if="!hasMore && priorityData.length > 0"
              class="text-caption text-grey font-weight-bold"
            >
              Semua data ({{ summaryData.totalItems }} SKU) telah ditampilkan.
            </span>
          </div>
        </template>
      </v-data-table>
    </v-card>
  </div>

  <!-- Preview Dialog -->
  <v-dialog v-model="isPreviewOpen" max-width="600">
    <v-card>
      <v-toolbar color="primary" density="compact" style="height: auto !important">
        <v-toolbar-title
          class="text-subtitle-2 text-wrap py-3"
          style="line-height: 1.3 !important; white-space: normal !important"
        >
          {{ previewNamaBarang }}
        </v-toolbar-title>

        <v-btn icon="mdi-close" class="align-self-start mt-1" @click="isPreviewOpen = false" />
      </v-toolbar>

      <v-card-text class="pa-0">
        <v-img :src="previewImageUrl" class="bg-grey-lighten-3" />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" variant="text" @click="isPreviewOpen = false">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.shadow-sm {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05) !important;
}

.max-w-md {
  max-width: 400px;
}

/* KONSISTENSI FONT 11PX (Sesuai Request) */
.filter-section :deep(.v-field__input),
.filter-section :deep(.v-select__selection-text) {
  font-size: 11px !important;
}
.filter-section :deep(.v-label) {
  font-size: 11px !important;
}

/* Pastikan card pembungkus memiliki tinggi terbatas atau flex */
.compact-table {
  /* Hapus atau sesuaikan jika perlu */
  height: 100% !important;
  display: flex;
  flex-direction: column;
}

/* Kunci utama: Paksa pembungkus tabel memiliki scroll di dalam */
.compact-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  overflow-y: auto !important;
  /* Berikan tinggi maksimal agar header tetap di atas saat scroll */
  max-height: calc(100vh - 250px); /* Sesuaikan angka 250px dengan tinggi header/filter di atas */
}

.compact-table :deep(th) {
  font-size: 11px !important;
  font-weight: 700 !important;
  background-color: #f5f5f5 !important;
  text-transform: uppercase;
  white-space: nowrap;
}

.compact-table :deep(td) {
  font-size: 11px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

.sub-table {
  border-collapse: collapse;
  width: 100%;
}
.sub-table th,
.sub-table td {
  border-bottom: 1px solid #eeeeee;
  padding: 4px 8px !important;
}

/* --- LOKAL OVERRIDE FILTER DC PLANNING --- */
/* Menjamin kotak pencarian melar dan dropdown kategori lebih panjang */
.dc-planning-filter :deep(.fixed-input) {
  flex: 0 0 auto !important;
}

.dc-planning-filter :deep(.kategori-input) {
  width: 250px !important;
}

.dc-planning-filter :deep(.flex-grow-input) {
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: none !important;
}

.dc-planning-filter :deep(.flex-grow-input .v-input__control),
.dc-planning-filter :deep(.flex-grow-input .v-field) {
  width: 100% !important;
}

.dc-planning-filter :deep(.keyword-input) {
  width: 100% !important;
  min-width: unset !important;
}

.cursor-pointer {
  cursor: pointer;
  transition: opacity 0.2s;
}
.cursor-pointer:hover {
  opacity: 0.8;
}
</style>

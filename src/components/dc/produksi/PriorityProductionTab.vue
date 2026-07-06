<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
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
const priorityData = ref<PriorityItem[]>([]);
const expandedRows = ref<string[]>([]);
const storeDetails = ref<Record<string, StoreDetailItem[]>>({});
const loadingDetails = ref<Record<string, boolean>>({});

// State Pagination & Summary
const currentPage = ref(1);
const itemsPerPage = ref(50); // Ganti dari const ke ref agar reaktif dengan AppDataTable
const summaryData = reactive({
  totalItems: 0,
  totalStokDC: 0,
  coverageProduksi: 0,
  kapasitasHarian: 1750,
  skuKritis: 0,
  skuPerhatian: 0,
  skuAman: 0,
});

const getImageUrl = (path: string) => {
  if (!path) return "";
  return `${import.meta.env.VITE_API_BASE_URL || ""}${path}`;
};

// --- STATE DIALOGS ---
const isPreviewOpen = ref(false);
const previewImageUrl = ref("");
const previewNamaBarang = ref("");
const isFormulaDialogOpen = ref(false); // [BARU] State untuk Dialog Rumus

const openPreview = (item: PriorityItem) => {
  previewImageUrl.value = getImageUrl(item.img_url);
  previewNamaBarang.value = item.nama;
  isPreviewOpen.value = true;
};

// --- FILTER & HEADERS ---
const filters = reactive({
  kategori: "Semua",
  keyword: "",
});

const kategoriOptions = ["Semua", "REGULER", "SESIONAL", "PESANAN"];

// [REVISI] Header Tabel Sesuai Desain Baru
const headers = [
  { title: "", key: "data-table-expand", width: 50 },
  { title: "RANK", key: "ranking", width: 60, align: "center" as const },
  { title: "INFO SKU", key: "info_sku", minWidth: 250 },
  { title: "BUFFER DC (pcs)", key: "buffer_dc", align: "end" as const },
  { title: "STOK DC (pcs)", key: "stok_dc", align: "end" as const },
  { title: "SPK READY < 5 HARI (WIP) (pcs)", key: "spk_ready", align: "end" as const },
  { title: "BUFFER STORE (pcs)", key: "buffer_store", align: "end" as const },
  { title: "STOK STORE (pcs)", key: "stok_store", align: "end" as const },
  { title: "GAP STORE (pcs)", key: "gap_store", align: "end" as const },
  { title: "DAILY NEED (pcs/hari)", key: "daily_need", align: "end" as const },
  { title: "COVERAGE SAAT INI (Hari)", key: "cvg_saat_ini", align: "center" as const },
  { title: "COVERAGE SETELAH WIP DATANG (Hari)", key: "cvg_setelah_wip", align: "center" as const },
  { title: "GAP BUFFER DC (pcs)", key: "gap_buffer_dc", align: "end" as const },
  { title: "STATUS", key: "status", align: "center" as const },
];

// --- API METHODS ---
const fetchPriorityData = async () => {
  isLoading.value = true;

  try {
    const response = await api.get("/dc-planning/priority", {
      params: {
        ...filters,
        page: currentPage.value,
        itemsPerPage: itemsPerPage.value,
      },
    });

    priorityData.value = response.data.data;
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
  }
};

const onUpdateOptions = (options: { page: number; itemsPerPage: number }) => {
  currentPage.value = options.page;
  itemsPerPage.value = options.itemsPerPage;
  fetchPriorityData();
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

// Tangkap update expand dari tabel dengan tipe data string[]
const onExpandedUpdate = (val: string[]) => {
  priorityData.value.forEach((item) => {
    const rowKey = `${item.kode}_${item.ukuran}`;
    if (val.includes(rowKey)) fetchStoreDetails(item.kode, item.ukuran);
  });
};

let searchTimeout: ReturnType<typeof setTimeout>;
const onSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage.value = 1; // Kembali ke hal 1 jika search
    fetchPriorityData();
  }, 600);
};

// [REVISI] Mengatur warna dan format teks berdasarkan kolom
const getStatusColor = (status: string) => {
  if (status === "Kritis") return "error";
  if (status === "Perlu Perhatian") return "warning";
  return "success";
};
const getTextColor = (val: number | string) => {
  if (Number(val) > 0) return "text-error font-weight-bold";
  return "";
};
const getCoverageColor = (val: number | string) => {
  const num = Number(val);
  if (num < 7) return "text-error font-weight-bold";
  if (num <= 15) return "text-warning font-weight-bold";
  return "text-success font-weight-bold";
};

onMounted(() => {
  fetchPriorityData();
});
</script>

<template>
  <div class="d-flex flex-column gap-4 planning-container">
    <div class="d-flex align-center justify-space-between flex-shrink-0 ms-2">
      <div class="d-flex align-center">
        <h2 class="text-h6 font-weight-bold me-2">Prioritas Produksi</h2>
        <v-btn
          icon="mdi-information-outline"
          variant="text"
          size="small"
          color="primary"
          @click="isFormulaDialogOpen = true"
          title="Definisi & Rumus Kalkulasi"
        />
      </div>
    </div>

    <v-row dense class="flex-shrink-0">
      <v-col cols="12" md="3">
        <v-card class="bg-blue-lighten-5 border-blue h-100" variant="outlined">
          <v-card-text class="d-flex align-center pa-3">
            <v-avatar color="blue-darken-2" rounded class="me-3"
              ><v-icon>mdi-warehouse</v-icon></v-avatar
            >
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

      <v-col cols="12" md="3">
        <v-card class="bg-red-lighten-5 border-red h-100" variant="outlined">
          <v-card-text class="d-flex align-center pa-3">
            <v-avatar color="red-darken-2" rounded class="me-3"
              ><v-icon>mdi-alert-octagon</v-icon></v-avatar
            >
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

      <v-col cols="12" md="3">
        <v-card class="bg-orange-lighten-5 border-orange h-100" variant="outlined">
          <v-card-text class="d-flex align-center pa-3">
            <v-avatar color="orange-darken-2" rounded class="me-3"
              ><v-icon>mdi-chart-timeline-variant</v-icon></v-avatar
            >
            <div>
              <div class="text-caption text-orange-darken-3 font-weight-bold">
                SKU Perlu Perhatian (7-15 Hari)
              </div>
              <div class="text-subtitle-1 font-weight-black text-orange-darken-4">
                {{ summaryData.skuPerhatian }} <span class="text-caption">SKU</span>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="3">
        <v-card class="bg-green-lighten-5 border-green h-100" variant="outlined">
          <v-card-text class="d-flex align-center pa-3">
            <v-avatar color="green-darken-2" rounded class="me-3"
              ><v-icon>mdi-check-decagram</v-icon></v-avatar
            >
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
          @update:model-value="fetchPriorityData"
        />
      </div>
      <div class="d-flex align-center flex-grow-1 mx-4 filter-group-center">
        <v-text-field
          v-model="filters.keyword"
          placeholder="Cari SKU / Nama Barang / Kode..."
          density="compact"
          hide-details
          variant="outlined"
          clearable
          prepend-inner-icon="mdi-magnify"
          class="flex-grow-input keyword-input"
          @input="onSearchInput"
          @click:clear="
            filters.keyword = '';
            fetchPriorityData();
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
          @click="fetchPriorityData"
        />
      </div>
    </div>

    <v-card
      variant="outlined"
      class="flex-grow-1 d-flex flex-column bg-white shadow-sm overflow-hidden"
    >
      <AppDataTable
        v-model:expanded="expandedRows"
        :server="true"
        :items="priorityData"
        :items-length="summaryData.totalItems"
        :headers="headers"
        :loading="isLoading"
        :item-value="(item: PriorityItem) => `${item.kode}_${item.ukuran}`"
        show-expand
        density="compact"
        class="compact-table"
        fixed-header
        hover
        @update:options="onUpdateOptions"
        @update:expanded="onExpandedUpdate"
      >
        <template #[`item.ranking`]="{ item }">
          <div class="font-weight-bold text-grey-darken-3 text-center">
            #{{ item.ranking_asli }}
          </div>
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
              <div class="d-flex align-center ga-2">
                <span class="text-grey-darken-3 sku-nama" :title="item.nama">{{ item.nama }}</span>
                <v-avatar size="20" color="blue-grey-darken-1" class="ukuran-chip">
                  <span class="text-white font-weight-bold">{{ item.ukuran }}</span>
                </v-avatar>
              </div>
              <div class="text-caption text-grey" style="font-size: 9px !important">
                {{ item.kategori }}
              </div>
            </div>
          </div>
        </template>

        <template #[`item.spk_ready`]="{ item }"
          ><span class="text-primary font-weight-bold">{{ item.spk_ready }}</span></template
        >
        <template #[`item.gap_store`]="{ item }"
          ><span :class="getTextColor(item.gap_store)">{{ item.gap_store }}</span></template
        >
        <template #[`item.cvg_saat_ini`]="{ item }"
          ><span :class="getCoverageColor(item.cvg_saat_ini)"
            >{{ item.cvg_saat_ini }} Hari</span
          ></template
        >
        <template #[`item.cvg_setelah_wip`]="{ item }"
          ><span :class="getCoverageColor(item.cvg_setelah_wip)"
            >{{ item.cvg_setelah_wip }} Hari</span
          ></template
        >
        <template #[`item.gap_buffer_dc`]="{ item }"
          ><span :class="getTextColor(item.gap_buffer_dc)">{{ item.gap_buffer_dc }}</span></template
        >

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
                <div v-else class="sub-table-wrapper">
                  <v-table density="compact" class="sub-table bg-white rounded border">
                    <thead class="bg-grey-lighten-3">
                      <tr>
                        <th class="text-left text-caption font-weight-bold col-toko">Nama Toko</th>
                        <th class="text-right text-caption font-weight-bold col-num">
                          Buffer Store
                        </th>
                        <th class="text-right text-caption font-weight-bold col-num">
                          Stok Aktual
                        </th>
                        <th class="text-right text-caption font-weight-bold text-red col-num">
                          Kekurangan
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(toko, idx) in storeDetails[`${item.kode}_${item.ukuran}`]"
                        :key="idx"
                      >
                        <td class="text-caption col-toko">{{ toko.cabang_nama }}</td>
                        <td class="text-caption text-right col-num">{{ toko.buffer }}</td>
                        <td class="text-caption text-right col-num">{{ toko.stok_aktual }}</td>
                        <td class="text-caption text-right font-weight-bold text-red col-num">
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
              </div>
            </td>
          </tr>
        </template>
      </AppDataTable>
    </v-card>
  </div>

  <v-dialog v-model="isFormulaDialogOpen" max-width="800">
    <v-card>
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1 font-weight-bold"
          >Definisi & Rumus Kalkulasi</v-toolbar-title
        >
        <v-btn icon="mdi-close" @click="isFormulaDialogOpen = false" />
      </v-toolbar>
      <v-card-text class="pa-4 bg-grey-lighten-4">
        <v-row dense>
          <v-col cols="12" md="6">
            <v-card variant="flat" class="pa-3 border h-100 bg-white">
              <div class="text-subtitle-2 font-weight-bold mb-2">DEFINISI</div>
              <ul class="text-caption ps-4" style="line-height: 1.6">
                <li><strong>Gap Store:</strong> MAX(Buffer Store - Stok Store, 0)</li>
                <li><strong>Daily Need:</strong> Gap Store / 30 (asumsi kebutuhan 30 hari)</li>
                <li>
                  <strong>SPK Ready (&lt; 5 Hari):</strong> Barang yang sudah masuk proses Jahit →
                  Lipat dan siap masuk ke DC dalam &le; 5 hari (WIP)
                </li>
                <li>
                  <strong>Gap Buffer DC:</strong> Target Buffer DC dikurangi persediaan (Jika
                  negatif = 0)
                </li>
              </ul>
            </v-card>
          </v-col>

          <v-col cols="12" md="6">
            <v-card variant="flat" class="pa-3 border h-100 bg-white">
              <div class="text-subtitle-2 font-weight-bold mb-2">RUMUS COVERAGE</div>
              <ul class="text-caption ps-4" style="line-height: 1.6">
                <li>
                  <strong>Coverage Saat Ini:</strong><br />
                  <span class="font-italic text-grey-darken-1">Stok DC / Daily Need</span>
                </li>
                <li class="mt-2">
                  <strong>Coverage Setelah WIP Datang:</strong><br />
                  <span class="font-italic text-grey-darken-1">(Stok DC + WIP) / Daily Need</span>
                </li>
                <li class="mt-2">
                  <strong>Gap Buffer DC:</strong><br />
                  <span class="font-italic text-grey-darken-1"
                    >(Buffer DC + Gap Store) - (Stok DC + WIP)</span
                  >
                </li>
              </ul>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>

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
    </v-card>
  </v-dialog>

  <v-dialog v-model="isFormulaDialogOpen" max-width="800">
    <v-card>
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1 font-weight-bold"
          >Definisi & Rumus Kalkulasi</v-toolbar-title
        >
        <v-btn icon="mdi-close" @click="isFormulaDialogOpen = false" />
      </v-toolbar>
      <v-card-text class="pa-4 bg-grey-lighten-4">
        <v-row dense>
          <v-col cols="12" md="6">
            <v-card variant="flat" class="pa-3 border h-100 bg-white">
              <div class="text-subtitle-2 font-weight-bold mb-2">DEFINISI</div>
              <ul class="text-caption ps-4" style="line-height: 1.6">
                <li><strong>Gap Store:</strong> MAX(Buffer Store - Stok Store, 0)</li>
                <li><strong>Daily Need:</strong> Gap Store / 30 (asumsi kebutuhan 30 hari)</li>
                <li>
                  <strong>SPK Ready (&lt; 5 Hari):</strong> WIP yang sudah masuk proses Jahit &rarr;
                  Lipat dan siap masuk ke DC dalam &le; 5 hari
                </li>
                <li>
                  <strong>Gap Buffer DC:</strong> Target Buffer DC dikurangi persediaan (Jika
                  negatif = 0)
                </li>
              </ul>
            </v-card>
          </v-col>
          <v-col cols="12" md="6">
            <v-card variant="flat" class="pa-3 border h-100 bg-white">
              <div class="text-subtitle-2 font-weight-bold mb-2">RUMUS COVERAGE</div>
              <ul class="text-caption ps-4" style="line-height: 1.6">
                <li>
                  <strong>Coverage Saat Ini:</strong><br /><span
                    class="font-italic text-grey-darken-1"
                    >Stok DC / Daily Need</span
                  >
                </li>
                <li class="mt-2">
                  <strong>Coverage Setelah WIP Datang:</strong><br /><span
                    class="font-italic text-grey-darken-1"
                    >(Stok DC + SPK Ready) / Daily Need</span
                  >
                </li>
                <li class="mt-2">
                  <strong>Gap Buffer DC:</strong><br /><span class="font-italic text-grey-darken-1"
                    >(Buffer DC + Gap Store) - (Stok DC + SPK Ready)</span
                  >
                </li>
              </ul>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
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

/* KONSISTENSI FONT 11PX */
.filter-section :deep(.v-field__input),
.filter-section :deep(.v-select__selection-text) {
  font-size: 11px !important;
}
.filter-section :deep(.v-label) {
  font-size: 11px !important;
}

/* Kunci Tinggi Container Utama */
.planning-container {
  height: calc(100vh - 120px);
  min-height: 0;
}

/* --- CSS UNTUK APP DATA TABLE & PAGINATION --- */

/* 1. Root pembungkus AppDataTable */
.compact-table {
  display: flex !important;
  flex-direction: column !important;
  flex-grow: 1;
  min-height: 0 !important; /* Wajib agar tidak meluber */
}

/* 2. Komponen internal v-data-table (Ini yang mendesak footer jika tidak dikunci) */
.compact-table :deep(.v-data-table) {
  display: flex !important;
  flex-direction: column !important;
  flex-grow: 1;
  min-height: 0 !important;
}

/* 3. Area scrollable isi tabel */
.compact-table :deep(.v-table__wrapper) {
  flex: 1 1 auto !important;
  overflow-y: auto !important;
}

/* 4. Pastikan form-field di dalam tabel ukurannya tetap kecil */
.compact-table :deep(th) {
  font-size: 10px !important;
  font-weight: 800 !important;
  background-color: #f5f5f5 !important;
  text-transform: uppercase;
  white-space: nowrap;
  letter-spacing: 0.2px;
}
.compact-table :deep(td) {
  font-size: 11px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

/* Sub-table Expanded */
.sub-table {
  border-collapse: collapse;
  width: 100%;
}
.sub-table th,
.sub-table td {
  border-bottom: 1px solid #eeeeee;
  padding: 4px 8px !important;
}

/* Filter Override */
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

/* Batasi lebar tabel detail agar tidak melar penuh */
.sub-table-wrapper {
  max-width: 480px;
}

.sub-table {
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
}
.sub-table th,
.sub-table td {
  border-bottom: 1px solid #eeeeee;
  padding: 4px 10px !important;
}
.sub-table .col-toko {
  width: 45%;
}
.sub-table .col-num {
  width: 18.33%;
}

/* Nama barang di info_sku dengan chip ukuran */
.sku-nama {
  font-size: 11px;
  line-height: 1.3;
}

.ukuran-chip {
  font-size: 9px;
  flex-shrink: 0;
}
.ukuran-chip span {
  font-size: 9px;
}
</style>

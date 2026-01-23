<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import AppDataTable from "@/components/AppDataTable.vue";

// --- 1. Definisi Interface yang Hilang ---
interface DataTableHeader {
  title: string;
  key: string;
  width?: number | string;
  fixed?: boolean;
  align?: "start" | "center" | "end";
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
  class?: string;
}

interface StokMinusItem {
  KODE: string;
  NAMA: string;
  BARCODE: string;
  KATEGORI: string;
  TOTAL_MINUS: number;
  cabang_nama?: string;
  [key: string]: unknown; // Untuk ukuran dinamis (S, M, L, dll)
}

interface DetailItem {
  ukuran: string;
  tanggal: string;
  referensi: string;
  no_pesanan?: string;
  keterangan: string;
  masuk: number;
  keluar: number;
  saldo: number;
}

interface Cabang {
  kode: string;
  nama: string;
}

// --- 2. Perbaikan State ---
const authStore = useAuthStore();
const toast = useToast();
const isLoading = ref(true);
const stokList = ref<StokMinusItem[]>([]); // Ganti 'items' menjadi 'stokList'
const cabangList = ref<Cabang[]>([]);
const expanded = ref<StokMinusItem[]>([]);
const headers = ref<DataTableHeader[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loadingDetails = ref(new Set<string>()); // Tambahkan loadingDetails

const filters = reactive({
  tanggal: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "KDC" : authStore.user?.cabang || "",
});

// Perbaiki computed menggunakan key yang benar (TOTAL_MINUS)
const grandTotalStok = computed(() => {
  // Gunakan optional chaining sebelum reduce
  return stokList.value?.reduce((sum, item) => sum + (item.TOTAL_MINUS || 0), 0) || 0;
});

// Header detail tetap konstan
const detailHeaders = [
  { title: "SIZE", key: "ukuran", width: "80px", align: "start" },
  { title: "TANGGAL", key: "tanggal", width: "120px" },
  { title: "NOMOR", key: "referensi", width: "180px" },
  { title: "NO. PESANAN", key: "no_pesanan", width: "180px" },
  /* [FIX] Ganti key 'keterangan' menjadi 'transaksi' agar data muncul */
  { title: "TRANSAKSI", key: "transaksi", width: "250px" },
  { title: "IN", key: "masuk", align: "end", width: "80px" },
  { title: "OUT", key: "keluar", align: "end", width: "80px" },
  {
    title: "SALDO",
    key: "saldo",
    align: "end",
    width: "100px",
    cellProps: { class: "font-weight-bold" },
  },
] as const;

const sortSizes = (a: string, b: string) => {
  const sizeOrder = [
    "XXXS",
    "XXS",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "2XL",
    "3XL",
    "4XL",
    "5XL",
    "6XL",
    "7XL",
    "ALLSIZE",
  ];
  const idxA = sizeOrder.indexOf(a.toUpperCase());
  const idxB = sizeOrder.indexOf(b.toUpperCase());
  return idxA !== -1 && idxB !== -1 ? idxA - idxB : a.localeCompare(b);
};

// --- 3. Perbaikan Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/laporan-stok-minus/lookup/cabang");
    cabangList.value = response.data;
  } catch (error) {
    toast.error("Gagal memuat daftar cabang.", error);
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/laporan-stok-minus", { params: filters });
    // Berikan tipe data secara eksplisit pada response data
    const rawData: StokMinusItem[] = response.data;

    if (rawData && rawData.length > 0) {
      const staticKeys = [
        "KODE",
        "NAMA",
        "BARCODE",
        "KATEGORI",
        "TOTAL_MINUS",
        "cabang_nama",
        "cabang_kode",
      ];
      const sizeSet = new Set<string>();

      // FIX: Menghilangkan 'any' dengan memanfaatkan interface StokMinusItem
      rawData.forEach((item) => {
        Object.keys(item).forEach((key) => {
          if (!staticKeys.includes(key)) sizeSet.add(key);
        });
      });

      const dynamicSizes = Array.from(sizeSet).sort(sortSizes);

      headers.value = [
        { title: "", key: "data-table-expand", width: 40 },
        { title: "Kode", key: "KODE", width: 120, fixed: true },
        { title: "Nama Barang", key: "NAMA", minWidth: 250 },
        { title: "Kategori", key: "KATEGORI", width: 100 },
        ...dynamicSizes.map((sz) => ({
          title: sz,
          key: sz,
          width: 65,
          align: "center" as const,
        })),
        {
          title: "Total Minus",
          key: "TOTAL_MINUS",
          width: 100,
          align: "end",
          class: "font-weight-bold",
        },
      ];
      stokList.value = rawData;
    } else {
      stokList.value = [];
    }
  } catch (error) {
    toast.error("Gagal memuat data laporan.", error);
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpanded: StokMinusItem[]) => {
  const item = newlyExpanded.find((i) => i && !details.value[i.KODE]);
  if (!item) return;

  loadingDetails.value.add(item.KODE);
  try {
    const response = await api.get<DetailItem[]>(`/laporan-stok-minus/details`, {
      params: {
        kode: item.KODE,
        cabang: filters.cabang,
        tanggal: filters.tanggal,
      },
    });
    // Simpan hasil ke state details
    details.value[item.KODE] = response.data;
  } catch (error) {
    toast.error("Gagal memuat detail transaksi.", error);
  } finally {
    loadingDetails.value.delete(item.KODE);
  }
};

const exportData = () => {
  if (stokList.value.length === 0) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }

  const dataToExport = stokList.value.map((item) => ({
    "Kode Barang": item.KODE,
    "Nama Barang": item.NAMA,
    Barcode: item.BARCODE,
    Kategori: item.KATEGORI,
    "Total Minus": item.TOTAL_MINUS,
  }));

  try {
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stok Minus");
    XLSX.writeFile(workbook, `Laporan_Stok_Minus_${filters.cabang}_${filters.tanggal}.xlsx`);
    toast.success("Data berhasil diekspor.");
  } catch (error) {
    toast.error("Gagal mengekspor data.", error);
  }
};

// --- Lifecycle & Watchers ---
onMounted(() => {
  fetchCabangList();
  fetchData();
});

watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Stok Minus" icon="mdi-alert-octagon-outline">
    <template #header-actions>
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportData"
        :disabled="isLoading || stokList?.length === 0">
        Export
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-select v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode" label="Gudang"
          density="compact" hide-details variant="outlined" style="max-width: 250px" />
        <v-text-field v-model="filters.tanggal" type="date" label="Per Tanggal" density="compact" hide-details
          variant="outlined" style="max-width: 180px" class="ml-4" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-wrapper">
        <AppDataTable v-model:expanded="expanded" :headers="headers" :items="stokList" item-value="KODE" return-object
          show-expand @update:expanded="loadDetails" class="desktop-table header-browse-blue">
          <template #[`body.append`]>
            <tr class="total-row">
              <td :colspan="headers.length - 1" class="total-cell-label">GRAND TOTAL MINUS</td>
              <td class="total-cell-value">
                {{ grandTotalStok.toLocaleString("id-ID") }}
              </td>
            </tr>
          </template>
          <template v-for="h in headers.filter((x) => x.align === 'center')" :key="h.key"
            #[`item.${h.key}`]="{ value }">
            <span v-if="Number(value) < 0" class="text-red font-weight-bold">
              {{ value }}
            </span>
            <span v-else class="text-grey-lighten-1">0</span>
          </template>

          <template #[`item.TOTAL_MINUS`]="{ value }">
            <span class="text-red-darken-4 font-weight-black">{{ value }}</span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0 bg-grey-lighten-4">
                <div class="detail-container pa-4">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.KODE)" class="text-center pa-4">
                      Memuat detail transaksi...
                    </div>

                    <v-data-table v-else :headers="detailHeaders" :items="details[item.KODE] || []" density="compact"
                      class="detail-table-card" :items-per-page="-1" hide-default-footer fixed-header>
                      <template #[`item.tanggal`]="{ value }">
                        {{ value ? format(parseISO(value), "dd-MM-yyyy") : "-" }}
                      </template>
                      <template #[`item.keluar`]="{ value }">
                        <span class="text-red font-weight-bold">{{ value }}</span>
                      </template>
                      <template #[`item.saldo`]="{ value }">
                        <span :class="value < 0 ? 'text-red' : ''" class="font-weight-bold">
                          {{ value }}
                        </span>
                      </template>
                      <template #bottom></template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
/* 1. Layout Dasar */
.browse-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 120px);
}

.filter-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  flex-shrink: 0;
  background-color: rgb(var(--v-theme-surface));
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.table-wrapper {
  flex-grow: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* ⭐ INGAT: JANGAN SCROLL DI SINI */
}

.desktop-table {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.desktop-table :deep(.v-table__wrapper) {
  position: relative;
  overflow-y: auto;
}

/* LABEL */
.total-cell-label {
  position: sticky;
  bottom: 0;
  z-index: 5;

  background-color: #f5f5f5;
  text-align: right;
  font-weight: 700;
  font-size: 11px;
  padding: 8px;

  border-top: 2px solid rgba(0, 0, 0, 0.12);
}

/* VALUE */
.total-cell-value {
  position: sticky;
  bottom: 0;
  z-index: 6;

  background-color: #f5f5f5;
  font-weight: 800;
  font-size: 12px;
  text-align: right;

  border-top: 2px solid rgba(0, 0, 0, 0.12);
}

/* 2. Konsistensi Font Header Tabel Utama */
.desktop-table :deep(thead tr th) {
  font-size: 11px !important;
  /* Samakan dengan detail */
  font-weight: bold !important;
  text-transform: uppercase !important;
  height: 40px !important;
}

.desktop-table :deep(tbody tr td) {
  font-size: 11px !important;
}

/* 3. Konsistensi Font Header Tabel Detail */
.detail-table-card :deep(thead tr th) {
  background-color: #0d47a1 !important;
  /* Biru Tua Kartu Stok */
  color: #ffffff !important;
  font-weight: bold !important;
  font-size: 11px !important;
  /* Konsisten 11px */
  text-transform: uppercase !important;
  height: 32px !important;
  position: sticky !important;
  top: 0;
  z-index: 10;
}

.detail-table-card :deep(tbody tr td) {
  font-size: 11px !important;
  height: 28px !important;
  border-bottom: 1px solid #f0f0f0 !important;
}

.detail-table-card :deep(.v-table__wrapper) {
  max-height: 400px !important;
  overflow-y: auto !important;
  overflow-x: auto !important;
}

/* 4. Dekorasi dan Area Expand */
.detail-container {
  display: flex;
  justify-content: flex-start;
  background-color: #f5f5f5;
  border-left: 4px solid #d32f2f;
  /* Aksen merah stok minus */
}

.detail-table-wrapper {
  width: 100%;
  max-width: 1100px;
  background-color: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  overflow: hidden;
}

/* Pewarnaan Baris Total */
.total-row td {
  font-size: 11px !important;
  background-color: #f5f5f5 !important;
  border-top: 2px solid rgba(0, 0, 0, 0.12) !important;
}
</style>

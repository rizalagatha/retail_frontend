<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import MasterProductSearchModal from "@/components/lookup/MasterProductSearchModal.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

// --- Tipe Data ---
interface GudangOption {
  kode: string;
  nama: string;
  sts: number; // 0=Store, 1=DC, dll
}
interface MasterDataItem {
  kode: string;
  nama: string;
  ukuran?: string;
  stokAwal?: number;
  selisihSop?: number;
  koreksi?: number;
  returJual?: number;
  terimaSJ?: number;
  mutStoreTerima?: number;
  mutInPesan?: number;
  mutInProduksi?: number;
  invoice?: number;
  returKeDC?: number;
  mutStoreKirim?: number;
  mutOutPesan?: number;
  mutOutProduksi?: number;
  saldoAkhir?: number;
  mutKeBs?: number;
  mutMasukBs?: number;
  mutKeluarBs?: number;
}
interface DetailItem {
  id: string;
  tanggal: string;
  nomor?: string;
  no_pesanan?: string;
  In?: number;
  Out?: number;
  transaksi?: string;
  saldo?: number;
}
interface DetailHeader {
  title: string;
  key: string;
  align?: "start" | "center" | "end";
  cellProps?: { class?: string }; // <--- tidak pakai any
  headerProps?: { class?: string };
}
interface DetailExportRow {
  ID: string;
  Tanggal: string;
  Nomor?: string;
  "No. Pesanan"?: string;
  Transaksi?: string;
  In?: number;
  Out?: number;
  Saldo?: number;
}

// --- State & Inisialisasi ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "502";

const masterData = ref<MasterDataItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const isLoading = ref(true);
const loadingDetails = ref(new Set<string>());
const gudangList = ref<GudangOption[]>([]);
const isProductSearchVisible = ref(false);

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  gudang: authStore.user?.cabang || "",
  gudangDc: 0,
  kodeBarang: "",
  namaBarang: "",
  jenisStok: "showroom",
});

// --- Header Tabel ---
const headersShowroom = [
  { title: "Kode", key: "kode", fixed: true, width: "100px" },
  { title: "Nama Barang", key: "nama", fixed: true, width: "200px" },
  { title: "Ukuran", key: "ukuran" },
  { title: "Stok Awal", key: "stokAwal", align: "end" },
  { title: "Selisih SOP", key: "selisihSop", align: "end" },
  { title: "Koreksi", key: "koreksi", align: "end" },
  { title: "Retur Jual", key: "returJual", align: "end" },
  { title: "Terima SJ", key: "terimaSJ", align: "end" },
  { title: "Terima Mutasi", key: "mutStoreTerima", align: "end" },
  { title: "Mutasi In (Pesan)", key: "mutInPesan", align: "end" },
  {
    title: "Mutasi In (Prod)",
    key: "mutInProduksi",
    align: "end",
    cellProps: { class: "text-green" },
  },
  { title: "Invoice", key: "invoice", align: "end" },
  { title: "Retur ke DC", key: "returKeDC", align: "end" },
  { title: "Kirim Mutasi", key: "mutStoreKirim", align: "end" },
  { title: "Mutasi Out (Pesan)", key: "mutOutPesan", align: "end" },
  {
    title: "Mutasi Out (Prod)",
    key: "mutOutProduksi",
    align: "end",
    cellProps: { class: "text-red" },
  },
  { title: "Mutasi ke BS", key: "mutKeBs", align: "end", cellProps: { class: "text-red" } },
  {
    title: "Saldo Akhir",
    key: "saldoAkhir",
    align: "end",
    cellProps: { class: "font-weight-bold" },
  },
] as const;

const headersBs = [
  { title: "Kode", key: "kode", fixed: true, width: "100px" },
  { title: "Nama Barang", key: "nama", fixed: true, width: "200px" },
  { title: "Ukuran", key: "ukuran" },
  { title: "Stok Awal", key: "stokAwal", align: "end" },
  { title: "Masuk BS", key: "mutMasukBs", align: "end", cellProps: { class: "text-green" } },
  { title: "Keluar BS", key: "mutKeluarBs", align: "end", cellProps: { class: "text-red" } },
  {
    title: "Saldo Akhir",
    key: "saldoAkhir",
    align: "end",
    cellProps: { class: "font-weight-bold" },
  },
] as const;

const isBsTab = computed(() => filters.jenisStok !== "showroom");
const headers = computed(() => (isBsTab.value ? headersBs : headersShowroom));

const emptyState = computed(() => {
  if (!filters.kodeBarang) {
    return {
      icon: "mdi-text-search-variant",
      title: "Pilih Produk Terlebih Dahulu",
      desc: 'Gunakan filter "Gudang" dan "Kode Barang" (F1) untuk memuat laporan kartu stok.',
    };
  }
  return {
    icon: "mdi-magnify-close",
    title: isBsTab.value ? "Belum Ada Stok Bad Stock" : "Tidak Ada Mutasi",
    desc: isBsTab.value
      ? "Barang ini belum punya mutasi Bad Stock pada gudang dan periode yang dipilih."
      : "Barang ini tidak punya stok maupun mutasi pada gudang dan periode yang dipilih.",
  };
});

const canView = computed(() => authStore.can(MENU_ID, "view"));
// Asumsi export memerlukan izin view
const canExport = computed(() => authStore.can(MENU_ID, "view"));

// --- Detail Headers Berdasarkan Gudang ---
const detailHeaders = ref<DetailHeader[]>([]);

const generateHeaders = () => {
  detailHeaders.value = [
    {
      title: "ID",
      key: "id",
      align: "start",
      cellProps: { class: "d-none" },
      headerProps: { class: "d-none" },
    },
    { title: "Tanggal", key: "tanggal", align: "start" },
    { title: "Nomor", key: "nomor", align: "start" },
    { title: "No. Pesanan", key: "no_pesanan", align: "start" },
    { title: "Transaksi", key: "transaksi", align: "start" },
    { title: "In", key: "In", align: "end" },
    { title: "Out", key: "Out", align: "end" },
    { title: "Saldo", key: "saldo", align: "end", cellProps: { class: "font-weight-bold" } },
  ];
};

// --- Helper Format Tanggal ---
const formatDateDisplay = (dateStr: string | undefined) => {
  if (!dateStr || dateStr === "-") return "-";
  try {
    // Gunakan parseISO jika string ISO, atau new Date() jika standard
    const date = new Date(dateStr);
    // Cek validitas tanggal
    if (isNaN(date.getTime())) return dateStr;
    return format(date, "dd-MM-yyyy"); // Format: 10-12-2025
  } catch {
    return dateStr;
  }
};

// --- API Calls ---
const fetchGudangList = async () => {
  try {
    const response = await api.get("/laporan-kartu-stok/lookup/gudang-options");
    gudangList.value = response.data;

    const defaultGudang = response.data.find((g: GudangOption) => g.kode === filters.gudang);
    if (defaultGudang) {
      filters.gudangDc = defaultGudang.sts;
      generateHeaders();
    }
  } catch {
    toast.error("Gagal memuat daftar gudang.");
  }
};
const expanded = ref([]);

const fetchMasterData = async () => {
  isLoading.value = true;
  details.value = {};
  expanded.value = [];
  try {
    const response = await api.get("/laporan-kartu-stok/product-list", { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat data produk.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterDataItem[]) => {
  // 'newlyExpandedItems' adalah array objek dari 'masterData'

  const itemToLoad = newlyExpandedItems.find((item) => {
    // [FIX] Buat ID unik dari kode + ukuran
    const idProduk = item.kode + (item.ukuran || "");
    return !details.value[idProduk] && !loadingDetails.value.has(idProduk);
  });

  if (!itemToLoad) return;

  // [FIX] Buat ID unik lagi untuk dipakai
  const idProduk = itemToLoad.kode + (itemToLoad.ukuran || "");

  loadingDetails.value.add(idProduk);
  try {
    const response = await api.get<DetailItem[]>("/laporan-kartu-stok/kartu-stok-details", {
      // 'filters' sudah berisi gudang, startDate, endDate
      params: { ...filters, id: idProduk }, // Kirim ID unik yang benar
    });

    details.value = {
      ...details.value,
      [idProduk]: response.data,
    };
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || `Gagal memuat detail untuk ${idProduk}`);
  } finally {
    loadingDetails.value.delete(idProduk);
  }
};

// --- Event Handlers ---
const onGudangSelected = (gudangKode: string) => {
  const selected = gudangList.value.find((g) => g.kode === gudangKode);
  if (selected) {
    filters.gudangDc = selected.sts;
    generateHeaders();
  }
};

const openProductSearch = () => {
  isProductSearchVisible.value = true;
};
const onProductSelected = (product: { kode: string; nama: string }) => {
  filters.kodeBarang = product.kode;
  filters.namaBarang = product.nama;
  isProductSearchVisible.value = false;
  fetchMasterData();
};
const clearProductFilter = () => {
  filters.kodeBarang = "";
  filters.namaBarang = "";
  masterData.value = [];
  details.value = {};
};

const exportData = (type: "header" | "detail") => {
  if (!canExport.value) {
    toast.error("Anda tidak memiliki izin untuk mengekspor data.");
    return;
  }

  const wb = XLSX.utils.book_new();

  // ========== EXPORT HEADER ==========
  if (type === "header") {
    if (masterData.value.length === 0) {
      toast.warning("Tidak ada data header untuk diekspor.");
      return;
    }

    const wsHeader = XLSX.utils.json_to_sheet(masterData.value);
    XLSX.utils.book_append_sheet(wb, wsHeader, "Header");

    XLSX.writeFile(
      wb,
      `LaporanKartuStok-Header-${filters.jenisStok}-${filters.kodeBarang}-${filters.startDate}_sd_${filters.endDate}.xlsx`
    );

    toast.success("Export Header berhasil.");
    return;
  }

  // ========== EXPORT DETAIL ==========
  if (type === "detail") {
    if (!filters.kodeBarang) {
      toast.warning("Pilih produk terlebih dahulu.");
      return;
    }

    const allKeys = Object.keys(details.value);
    if (allKeys.length === 0) {
      toast.warning("Tidak ada detail mutasi (perlu expand dulu).");
      return;
    }

    const detailRows: DetailExportRow[] = [];

    for (const key of allKeys) {
      const rows = details.value[key];
      if (!rows) continue;

      rows.forEach((r) => {
        detailRows.push({
          ID: r.id,
          Tanggal: formatDateDisplay(r.tanggal),
          Nomor: r.nomor,
          "No. Pesanan": r.no_pesanan || "-",
          Transaksi: r.transaksi,
          In: r.In,
          Out: r.Out,
          Saldo: r.saldo,
        });
      });
    }

    if (detailRows.length === 0) {
      toast.warning("Tidak ada data detail untuk diekspor.");
      return;
    }

    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detail");

    XLSX.writeFile(
      wb,
      `LaporanKartuStok-Detail-${filters.jenisStok}-${filters.kodeBarang}-${filters.startDate}_sd_${filters.endDate}.xlsx`
    );

    toast.success("Export Detail berhasil.");
    return;
  }
};

// --- Lifecycle ---
onMounted(async () => {
  if (!canView.value) {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    masterData.value = [];
    return;
  }

  await fetchGudangList();

  // [PERBAIKAN REFRESH]
  // Cek jika filter kodeBarang sudah ada nilainya saat halaman di-refresh
  if (filters.kodeBarang) {
    fetchMasterData(); // Langsung panggil fetch
  } else {
    // Jika tidak ada, baru kita set loading false (menampilkan pesan 'Pilih Produk')
    isLoading.value = false;
  }
});
// 1. Watcher ini HANYA bereaksi pada perubahan filter utama
//    (Tanggal, Gudang, Jenis Stok)
watch(
  [() => filters.startDate, () => filters.endDate, () => filters.gudang, () => filters.jenisStok],
  () => {
    // Hanya fetch jika kode barang SUDAH diisi
    if (filters.kodeBarang) {
      fetchMasterData();
    }
  }
);

// 2. Watcher ini HANYA bereaksi pada perubahan Kode Barang
watch(
  () => filters.kodeBarang,
  (newKode) => {
    if (newKode) {
      // Jika kode baru dipilih (dari onProductSelected), fetch data
      fetchMasterData();
    }
    // Jika 'newKode' kosong (dari clearProductFilter),
    // kita tidak melakukan apa-apa (karena 'clear' sudah mengosongkan tabel)
  }
);
</script>

<template>
  <PageLayout title="Laporan Kartu Stok" icon="mdi-file-chart-outline">
    <template #header-actions>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn
            size="small"
            variant="tonal"
            class="btn-header-action"
            prepend-icon="mdi-file-excel"
            v-bind="props"
          >
            Export
          </v-btn>
        </template>

        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')">
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div v-if="!canView && !isLoading" class="state-container pa-4 text-center">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p>Anda tidak memiliki izin untuk melihat laporan ini.</p>
    </div>

    <div class="browse-content">
      <div class="filter-section">
        <div class="filter-group">
          <span class="filter-label">Periode:</span>
          <v-text-field
            v-model="filters.startDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            class="periode-field"
          />
          <span class="filter-sep">s/d</span>
          <v-text-field
            v-model="filters.endDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            class="periode-field"
          />
        </div>

        <span class="filter-divider" />

        <div class="filter-group">
          <span class="filter-label">Gudang:</span>
          <v-select
            v-model="filters.gudang"
            :items="gudangList"
            item-title="nama"
            item-value="kode"
            density="compact"
            hide-details
            variant="outlined"
            class="gudang-field"
            :menu-props="{ class: 'kr-red' }"
            @update:model-value="onGudangSelected"
          />
        </div>

        <span class="filter-divider" />

        <v-btn-toggle
          v-model="filters.jenisStok"
          mandatory
          density="compact"
          variant="text"
          class="jenis-toggle"
        >
          <v-btn value="showroom" size="small">Showroom</v-btn>
          <v-btn value="bs_cetak" size="small">BS Cetak</v-btn>
          <v-btn value="bs_produksi" size="small">BS Produksi</v-btn>
        </v-btn-toggle>

        <span class="filter-divider" />

        <div class="filter-group">
          <v-text-field
            v-model="filters.kodeBarang"
            placeholder="Kode Barang (F1)"
            density="compact"
            hide-details
            variant="outlined"
            class="kode-field"
            readonly
            clearable
            @click="openProductSearch"
            @keydown.f1.prevent="openProductSearch"
            @click:clear="clearProductFilter"
          >
            <template #append-inner>
              <v-icon @click="openProductSearch">mdi-magnify</v-icon>
            </template>
          </v-text-field>
          <v-text-field
            v-model="filters.namaBarang"
            placeholder="Nama barang"
            readonly
            density="compact"
            hide-details
            variant="outlined"
            class="nama-field"
          />
        </div>

        <v-spacer />

        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="isLoading"
          title="Muat Ulang Data"
          class="btn-refresh"
          @click="fetchMasterData"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          :headers="headers"
          :items="masterData"
          :loading="isLoading"
          class="desktop-table header-browse-blue"
          density="compact"
          fixed-header
          show-expand
          return-object
          :item-value="(item: MasterDataItem) => item.kode + (item.ukuran || '')"
          v-model:expanded="expanded"
          @update:expanded="loadDetails"
        >
          <template #no-data>
            <div class="empty-data-wrapper custom-empty-state">
              <v-icon size="64" color="#b71c1c" class="mb-4 empty-icon">
                {{ emptyState.icon }}
              </v-icon>
              <h4 class="text-h6 empty-title">{{ emptyState.title }}</h4>
              <p class="text-body-2 empty-desc mt-2">{{ emptyState.desc }}</p>
            </div>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0 expanded-cell">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div
                      v-if="loadingDetails.has(item.kode + (item.ukuran || ''))"
                      class="text-center pa-4"
                    >
                      <v-progress-circular indeterminate color="#b71c1c" size="24" />
                      <div class="mt-2 text-caption">Memuat detail mutasi...</div>
                    </div>

                    <v-data-table
                      v-else
                      :headers="detailHeaders"
                      :items="details[item.kode + (item.ukuran || '')]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                    >
                      <!-- Sembunyikan kolom ID -->
                      <template #[`item.id`]="{ item }">
                        <span class="d-none">{{ item.id }}</span>
                      </template>
                      <template #[`item.tanggal`]="{ item }">
                        <span>{{ formatDateDisplay(item.tanggal) }}</span>
                      </template>
                      <template #[`item.In`]="{ item }">
                        {{ item.In ? item.In.toLocaleString("id-ID") : 0 }}
                      </template>
                      <template #[`item.Out`]="{ item }">
                        {{ item.Out ? item.Out.toLocaleString("id-ID") : 0 }}
                      </template>
                      <template #[`item.saldo`]="{ item }">
                        <strong>{{ item.saldo ? item.saldo.toLocaleString("id-ID") : 0 }}</strong>
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
    <MasterProductSearchModal
      v-if="isProductSearchVisible"
      :gudang="filters.gudang"
      @close="isProductSearchVisible = false"
      @product-selected="onProductSelected"
    />
  </PageLayout>
</template>

<style scoped>
/* Layout full height + tema merah lokal (DESIGN.md 10.3) */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;

  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
}

/* ══════════ TOMBOL HEADER ══════════ */
.btn-header-action {
  background-color: rgba(183, 28, 28, 0.08) !important;
  color: #b71c1c !important;
  font-weight: 700;
  border: 1px solid rgba(183, 28, 28, 0.2);
}
.btn-header-action:hover:not(:disabled) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.btn-header-action:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}

/* ══════════ FILTER ══════════ */
.filter-section {
  flex-shrink: 0;
  padding: 8px 10px !important;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px !important;
  background-color: rgba(183, 28, 28, 0.03);
  border-bottom: 2px solid rgba(183, 28, 28, 0.15);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-divider {
  flex: none;
  width: 1px;
  height: 22px;
  background-color: rgba(183, 28, 28, 0.2);
}

.filter-label,
.filter-sep {
  font-size: 12px;
  font-weight: 600;
  color: #b71c1c;
  white-space: nowrap;
}
.filter-sep {
  font-size: 11px;
}

/* Lebar field dikunci (!important: menimpa CSS global filter-section) */
.filter-section .periode-field {
  --w: 150px;
}
.filter-section .gudang-field {
  --w: 180px;
}
.filter-section .kode-field {
  --w: 170px;
}
.filter-section .nama-field {
  --w: 240px;
}
.filter-section .periode-field,
.filter-section .gudang-field,
.filter-section .kode-field,
.filter-section .nama-field {
  flex: none !important;
  width: var(--w) !important;
  min-width: var(--w) !important;
  max-width: var(--w) !important;
}

/* Global (.filter-section .v-input = flex) membuat .v-input__control menyusut ke isi.
   Paksa control mengisi lebar field yang sudah dikunci di atas. */
.filter-section .periode-field :deep(.v-input__control),
.filter-section .gudang-field :deep(.v-input__control),
.filter-section .kode-field :deep(.v-input__control),
.filter-section .nama-field :deep(.v-input__control) {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

/* Global memaksa input[type="date"] selebar 110px */
.filter-section .periode-field :deep(input[type="date"]) {
  width: 100% !important;
}

.filter-section .periode-field :deep(.v-field),
.filter-section .gudang-field :deep(.v-field),
.filter-section .kode-field :deep(.v-field),
.filter-section .nama-field :deep(.v-field) {
  width: 100%;
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}
.filter-section .periode-field :deep(.v-field__outline),
.filter-section .gudang-field :deep(.v-field__outline),
.filter-section .kode-field :deep(.v-field__outline),
.filter-section .nama-field :deep(.v-field__outline) {
  display: none !important;
}
.filter-section .periode-field :deep(.v-field--focused),
.filter-section .gudang-field :deep(.v-field--focused),
.filter-section .kode-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.filter-section .gudang-field :deep(.v-field__append-inner .v-icon),
.filter-section .kode-field :deep(.v-field__append-inner .v-icon) {
  color: #b71c1c !important;
}
.filter-section .kode-field :deep(input) {
  cursor: pointer;
}
.filter-section .nama-field :deep(.v-field) {
  background-color: rgba(183, 28, 28, 0.06) !important;
}

/* Toggle jenis stok */
.jenis-toggle {
  flex: none !important;
  width: auto !important;
  height: 32px !important;
  border: 1px solid rgba(183, 28, 28, 0.25);
  border-radius: 8px;
  overflow: hidden;
}
.jenis-toggle :deep(.v-btn) {
  flex: none !important;
  width: auto !important;
  min-width: 0 !important;
  height: 30px !important;
  padding: 0 14px !important;
  border-radius: 0 !important;
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  color: #b71c1c;
}
.jenis-toggle :deep(.v-btn + .v-btn) {
  border-left: 1px solid rgba(183, 28, 28, 0.25);
}
.jenis-toggle :deep(.v-btn--active) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
}
.jenis-toggle :deep(.v-btn--active .v-btn__overlay) {
  opacity: 0;
}

.btn-refresh {
  color: #b71c1c !important;
}

/* ══════════ TABEL ══════════ */
.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.desktop-table {
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;

  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

.desktop-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  white-space: nowrap;
  border-bottom: 2px solid #8e0000 !important;
}

.desktop-table :deep(thead tr th .v-icon),
.desktop-table :deep(thead tr th .v-data-table-header__sort-icon) {
  color: #ffffff !important;
}

/* Sel data (sel baris expand dikecualikan supaya padding-nya tetap 0) */
.desktop-table :deep(td:not(.expanded-cell)) {
  font-size: 11px !important;
  padding: 0 8px !important;
  height: 36px !important;
  white-space: nowrap;
}

/* Sel data (baris expand dan baris no-data dikecualikan) */
.desktop-table :deep(tbody tr:not(.v-data-table-rows-no-data) > td:not(.expanded-cell)) {
  font-size: 11px !important;
  padding: 0 8px !important;
  height: 36px !important;
  white-space: nowrap;
}

.desktop-table :deep(tbody tr:nth-child(even) > td) {
  background-color: rgba(183, 28, 28, 0.025);
}
.desktop-table :deep(tbody tr:hover > td) {
  background-color: rgba(183, 28, 28, 0.07);
}

/* ══════════ EMPTY STATE ══════════ */
.custom-empty-state {
  padding: 64px 32px;
}
.empty-icon {
  opacity: 0.35;
}
.empty-title {
  color: #8e0000;
  font-weight: 700;
}
.empty-desc {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

/* ══════════ DETAIL (EXPAND) ══════════ */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;

  display: flex;
  justify-content: flex-start;
  align-items: flex-start;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);

  padding: 16px;
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-left: 3px solid #b71c1c;
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 32px !important;
}

/* ══════════ FOOTER PAGING (milik AppDataTable) ══════════ */
.desktop-table :deep(.custom-pagination-footer) {
  border-top: 2px solid rgba(183, 28, 28, 0.15);
  background-color: rgba(183, 28, 28, 0.03);
}

.desktop-table :deep(.items-per-page-select .v-field) {
  border-radius: 8px;
  background-color: rgba(183, 28, 28, 0.05);
}
.desktop-table :deep(.items-per-page-select .v-field__outline) {
  color: rgba(183, 28, 28, 0.25) !important;
}

.desktop-table :deep(.pagination-text) {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.desktop-table :deep(.custom-pagination-footer .v-pagination__item),
.desktop-table :deep(.custom-pagination-footer .v-pagination__prev),
.desktop-table :deep(.custom-pagination-footer .v-pagination__next) {
  background-color: rgba(183, 28, 28, 0.06) !important;
  border: none !important;
}
.desktop-table :deep(.custom-pagination-footer .v-pagination__item .v-btn),
.desktop-table :deep(.custom-pagination-footer .v-pagination__prev .v-btn),
.desktop-table :deep(.custom-pagination-footer .v-pagination__next .v-btn) {
  color: #b71c1c !important;
}

.desktop-table :deep(.custom-pagination-footer .v-pagination__item--is-active),
.desktop-table :deep(.custom-pagination-footer .v-pagination__item--is-active .v-btn) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import AppDataTable from "@/components/AppDataTable.vue";
import LocationGeneratorModal from "@/components/modal/LocationGeneratorModal.vue";
import LokasiOpnamePrintModal from "@/components/modal/LokasiOpnamePrintModal.vue";
import { format, parseISO } from "date-fns";
import type { AxiosError } from "axios";
import * as XLSX from 'xlsx';

interface LokasiOpname {
  lo_idrec: string;
  lo_cab: string;
  lo_lokasi: string;
  lo_jenis_nama: string | null;
  user_create: string;
  date_create: string;
  cab_nama?: string;
  total_hitung: number;
  operator_hitung: string;
}

// Interface untuk data mentah dari API
interface RawSoDate {
  st_tanggal: string;
}

// Interface untuk opsi yang digunakan di v-select
interface SoDateOption {
  st_tanggal: string;
  formattedLabel: string;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "18";

const items = ref<LokasiOpname[]>([]);
const isLoading = ref(true);
const selected = ref<LokasiOpname[]>([]);
const isGeneratorVisible = ref(false);
const cabangOptions = ref([]);
const isDeleteDialogOpen = ref(false);
const itemToDelete = ref<string | null>(null);
const isPrintModalVisible = ref(false);
const masterOptions = ref([]);
const soDateOptions = ref<SoDateOption[]>([]);

const filters = reactive({
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  jenis: "ALL",
  tanggal: "ALL", // Filter tanggal default
});

const headers = [
  { title: "Cabang", key: "lo_cab", width: 100 },
  { title: "Kode Lokasi", key: "lo_lokasi", width: 150 },
  { title: "Jenis Lokasi", key: "lo_jenis_nama", width: 180 },
  { title: "Qty Terhitung", key: "total_hitung", width: 130, align: "end" },
  { title: "Operator Hitung", key: "operator_hitung", width: 180 },
  { title: "Dibuat Oleh", key: "user_create", width: 150 },
  { title: "Waktu Input", key: "date_create", width: 200 },
  { title: "Aksi", key: "actions", width: 80, align: "center", sortable: false },
];

const isAuthorizedForGenerator = computed(() => {
  const user = authStore.user;

  // Izinkan jika user adalah RIO dari KDC
  // ATAU jika user adalah ADMINISTRATOR (untuk kebutuhan setup awal/debugging)
  return (user?.cabang === "KDC" && user?.kode === "RIO") || user?.kode === "ADMIN";
});

const fetchSoDates = async () => {
  try {
    const response = await api.get("/lokasi-opname/so-dates", {
      params: { cabang: filters.cabang }
    });

    // Gunakan interface RawSoDate sebagai pengganti any
    const rawData = response.data as RawSoDate[];

    soDateOptions.value = rawData.map((d: RawSoDate): SoDateOption => ({
      st_tanggal: d.st_tanggal,
      formattedLabel: format(parseISO(d.st_tanggal), "dd/MM/yyyy")
    }));

    if (soDateOptions.value.length > 0 && filters.tanggal === 'ALL') {
      filters.tanggal = soDateOptions.value[0].st_tanggal;
    }
  } catch {
    soDateOptions.value = [];
  }
};

const fetchMasterOptions = async () => {
  try {
    const response = await api.get("/lokasi-opname/master");
    // Tambahkan opsi 'SEMUA JENIS' di awal array
    masterOptions.value = [{ jenis: "SEMUA JENIS", kode: "ALL" }, ...response.data];
  } catch {
    toast.error("Gagal memuat filter jenis lokasi.");
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/lokasi-opname", { params: filters });

    // --- PERBAIKAN SORTING DI SINI ---
    // Gunakan numeric: true agar BX2 muncul sebelum BX10
    const sortedData = response.data.sort((a: LokasiOpname, b: LokasiOpname) => {
      return a.lo_lokasi.localeCompare(b.lo_lokasi, undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    });

    items.value = sortedData;
    // ---------------------------------

  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get("/hitung-stok/cabang-options");
    cabangOptions.value = response.data;
  } catch {
    toast.error("Gagal memuat pilihan cabang.");
  }
};

const handleBulkGenerate = async (data: { locations: string[]; jenisNama: string }) => {
  isLoading.value = true;
  try {
    const payload = {
      cabang: filters.cabang,
      locations: data.locations, // Ambil array lokasinya
      jenisNama: data.jenisNama, // Ambil nama jenisnya (misal: "Kardus Sementara")
    };

    const response = await api.post("/lokasi-opname/generate", payload);

    toast.success(response.data.message);
    isGeneratorVisible.value = false;
    fetchData(); // Refresh list
  } catch (error: unknown) {
    // Ganti any jadi unknown
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal generate lokasi.");
  } finally {
    isLoading.value = false;
  }
};

const promptDelete = (id: string) => {
  itemToDelete.value = id;
  isDeleteDialogOpen.value = true;
};

const handleDeleteConfirm = async () => {
  if (!itemToDelete.value) return;

  isLoading.value = true;
  try {
    const response = await api.delete(`/lokasi-opname/${itemToDelete.value}`);
    toast.success(response.data.message || "Lokasi berhasil dihapus.");
    fetchData(); // Refresh tabel
  } catch (error: unknown) {
    // Ganti any jadi unknown
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal menghapus lokasi.");
  } finally {
    isDeleteDialogOpen.value = false;
    itemToDelete.value = null;
    isLoading.value = false;
  }
};

const handleOpenPrint = () => {
  if (selected.value.length === 0) {
    toast.warning("Pilih lokasi yang akan dicetak.");
    return;
  }
  isPrintModalVisible.value = true;
};

const exportToExcel = () => {
  if (items.value.length === 0) return toast.warning('Tidak ada data untuk diekspor.');

  // Mapping data agar header di Excel lebih rapi
  const dataToExport = items.value.map(item => ({
    'Cabang': item.lo_cab,
    'Kode Lokasi': item.lo_lokasi,
    'Jenis Lokasi': item.lo_jenis_nama || '-',
    'Qty Terhitung': item.total_hitung,
    'Operator Hitung': item.operator_hitung,
    'Dibuat Oleh': item.user_create,
    'Waktu Input': item.date_create ? format(parseISO(item.date_create), "dd/MM/yyyy HH:mm") : "-"
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Master Lokasi Opname");
  XLSX.writeFile(workbook, `Master_Lokasi_Opname_${filters.cabang}.xlsx`);
  toast.success('Data berhasil diekspor ke Excel.');
};

const printToPDF = () => {
  if (items.value.length === 0) return toast.warning('Tidak ada data untuk dicetak.');
  window.print(); // Memicu dialog cetak/save as PDF browser
};

watch(() => filters.cabang, () => {
  filters.tanggal = "ALL";
  fetchSoDates();
});

onMounted(() => {
  fetchCabangOptions();
  fetchMasterOptions();
  fetchSoDates();
  fetchData();
});

watch(
  filters,
  () => {
    // Reset seleksi saat filter berubah agar tidak terjadi salah cetak data lama
    selected.value = [];
    fetchData();
  },
  { deep: true }
);
</script>

<template>
  <PageLayout title="Master Lokasi Opname" :menu-id="MENU_ID" icon="mdi-map-marker-plus-outline">
    <template #header-actions>
      <v-btn v-if="isAuthorizedForGenerator" size="small" color="primary" prepend-icon="mdi-plus-box-multiple"
        @click="isGeneratorVisible = true" :disabled="filters.cabang === 'ALL'">
        Generate Lokasi
      </v-btn>
      <v-btn size="small" color="green-darken-1" prepend-icon="mdi-printer" :disabled="selected.length === 0"
        @click="handleOpenPrint">
        Cetak Label ({{ selected.length }})
      </v-btn>
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportToExcel">
        Export Excel
      </v-btn>
      <v-btn size="small" color="deep-orange-darken-1" prepend-icon="mdi-file-pdf-box" @click="printToPDF">
        Cetak PDF
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section py-2 px-4 d-flex align-center ga-4 border-bottom">
        <v-select v-model="filters.cabang" :items="cabangOptions" item-title="nama" item-value="kode"
          label="Pilih Cabang" density="compact" hide-details variant="outlined" style="max-width: 250px" />
        <v-alert v-if="filters.cabang === 'ALL'" type="warning" density="compact" variant="tonal"
          class="text-caption py-1">
          Pilih cabang spesifik untuk mengaktifkan generator.
        </v-alert>
        <v-select v-model="filters.jenis" :items="masterOptions" item-title="jenis" item-value="jenis"
          label="Jenis Lokasi" density="compact" hide-details variant="outlined" style="max-width: 200px" />
        <v-select v-model="filters.tanggal" :items="soDateOptions" item-title="formattedLabel" item-value="st_tanggal"
          label="Tanggal SO" density="compact" hide-details variant="outlined" style="max-width: 180px">
          <template #prepend-item>
            <v-list-item title="SEMUA TANGGAL" value="ALL" @click="filters.tanggal = 'ALL'" />
            <v-divider class="mb-2" />
          </template>
        </v-select>
        <v-spacer />
        <v-btn icon="mdi-refresh" variant="text" size="small" @click="fetchData" :loading="isLoading" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" :headers="headers" :items="items" :loading="isLoading" item-value="lo_idrec"
          density="compact" class="desktop-table header-browse-blue" height="100%" fixed-header show-select
          return-object>
          <template #[`item.date_create`]="{ value }">
            {{ value ? format(parseISO(value), "dd/MM/yyyy HH:mm") : "-" }}
          </template>

          <template #[`item.total_hitung`]="{ value }">
            <v-chip :color="value > 0 ? 'success' : 'grey-lighten-1'" size="x-small" class="font-weight-bold"
              variant="flat">
              {{ value.toLocaleString('id-ID') }}
            </v-chip>
          </template>

          <template #[`item.actions`]="{ item }">
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" icon="mdi-delete-outline" size="x-small" variant="text"
              color="error" @click="promptDelete(item.lo_idrec)" />
          </template>
        </AppDataTable>
      </div>
    </div>

    <LocationGeneratorModal v-if="isGeneratorVisible" :cabang="filters.cabang" @close="isGeneratorVisible = false"
      @generate="handleBulkGenerate" />
    <LokasiOpnamePrintModal v-if="isPrintModalVisible" :items="selected" @close="isPrintModalVisible = false" />

    <v-dialog v-model="isDeleteDialogOpen" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold d-flex align-center">
          <v-icon color="error" class="me-2">mdi-alert-circle</v-icon>
          Konfirmasi Hapus
        </v-card-title>

        <v-card-text class="pa-4 text-body-1">
          Apakah Anda yakin ingin menghapus lokasi ini dari daftar opname? Tindakan ini tidak dapat
          dibatalkan.
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-3">
          <v-spacer />
          <v-btn text size="small" color="grey-darken-1" @click="isDeleteDialogOpen = false">
            Batal
          </v-btn>
          <v-btn color="error" variant="flat" size="small" :loading="isLoading" @click="handleDeleteConfirm">
            Ya, Hapus Lokasi
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* 1. Layout Utama: Menghilangkan scrollbar browser halaman */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  /* Batasi tinggi sesuai sisa layar */
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  padding: 8px 16px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

/* 2. Container Tabel: Memaksa pagination tetap di dasar container */
.table-container {
  flex-grow: 1;
  min-height: 0;
  /* Penting untuk Flexbox agar tabel bisa mengecil */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: 0;
  background: white;
}

/* 3. Pengaturan Tabel Master (Scrollbar Vertikal & Horizontal) */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
  overflow-y: auto !important;
  /* Scroll Vertikal Master */
  overflow-x: auto !important;
  /* Scroll Horizontal Master */
}

/* Memaksa isi tabel melebar ke samping agar scrollbar horizontal muncul jika kolom banyak */
.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* Header Tabel Warna Biru Tua (Konsisten dengan Browse lainnya) */
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
}

@media print {

  /* Sembunyikan semua elemen kecuali tabel */
  :deep(.v-navigation-drawer),
  :deep(.v-app-bar),
  .filter-section,
  .header-actions,
  :deep(.v-pagination),
  :deep(.v-table__footer),
  .v-btn {
    display: none !important;
  }

  .table-container {
    height: auto !important;
    overflow: visible !important;
  }

  .browse-content {
    height: auto !important;
    padding: 0 !important;
  }

  .desktop-table {
    border: 1px solid #000;
  }

  /* Paksa tabel mencetak border */
  :deep(table) {
    width: 100% !important;
    border-collapse: collapse !important;
  }

  :deep(th),
  :deep(td) {
    border: 1px solid #ddd !important;
    padding: 8px !important;
    color: black !important;
  }
}
</style>

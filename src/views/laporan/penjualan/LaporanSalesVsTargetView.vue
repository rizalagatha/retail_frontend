<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, startOfMonth, endOfMonth } from "date-fns";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import { applyRoundingPolicy } from "@/utils/numberUtils";
import { AppConfig } from "@/config/appConfig";

// --- Inisialisasi & State ---
interface SalesVsTargetItem {
  tahun: number;
  bulan: number;
  kode_cabang: string;
  nama_cabang: string;
  qty_bulan_ini: number;
  nominal_bulan_ini: number;
  target_bulan_ini: number;
  persen_target_bulan_ini?: number;
  qty_bulan_lalu: number;
  nominal_bulan_lalu: number;
  persen_bulan_lalu?: number;
  realisasi_kumulatif: number;
  target_kumulatif: number;
  persen_target_kumulatif?: number;
  realisasi_bulan_ini_thn_lalu: number;
  persen_thn_lalu?: number;
  realisasi_akhir_tahun: number;
  target_akhir_tahun: number;
  persen_target_akhir_tahun?: number;
}
interface TotalSummary {
  qty_bulan_ini: number;
  nominal_bulan_ini: number;
  target_bulan_ini: number;
  persen_target_bulan_ini: number;
  qty_bulan_lalu: number;
  nominal_bulan_lalu: number;
  persen_bulan_lalu: number;
  realisasi_kumulatif: number;
  target_kumulatif: number;
  persen_target_kumulatif: number;
  realisasi_bulan_ini_thn_lalu: number;
  persen_thn_lalu: number;
  realisasi_akhir_tahun: number;
  target_akhir_tahun: number;
  persen_target_akhir_tahun: number;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "509";

const items = ref<SalesVsTargetItem[]>([]);
const isLoading = ref(true);
const cabangOptions = ref([]);

const currentYear = new Date().getFullYear();
const filters = reactive({
  tahun: currentYear,
  bulan: new Date().getMonth() + 1, // Bulan di JS 0-11, di SQL 1-12
});

const yearOptions = [currentYear - 1, currentYear, currentYear + 1];
const monthOptions = [
  { value: 1, title: "Januari" },
  { value: 2, title: "Februari" },
  { value: 3, title: "Maret" },
  { value: 4, title: "April" },
  { value: 5, title: "Mei" },
  { value: 6, title: "Juni" },
  { value: 7, title: "Juli" },
  { value: 8, title: "Agustus" },
  { value: 9, title: "September" },
  { value: 10, title: "Oktober" },
  { value: 11, title: "November" },
  { value: 12, title: "Desember" },
];

// const headers = [
//   { title: 'No', key: 'no', sortable: false, width: '50px', rowspan: 2 },
//   { title: 'Tahun', key: 'tahun', rowspan: 2 },
//   { title: 'Bulan', key: 'bulan', rowspan: 2 },
//   { title: 'Kode Cabang', key: 'kode_cabang', rowspan: 2 },
//   { title: 'Nama Cabang', key: 'nama_cabang', minWidth: '200px', rowspan: 2 },
//   { title: 'Bulan Ini', colspan: 4, align: 'center' },
//   { title: 'Bulan Lalu', colspan: 3, align: 'center' },
//   { title: 'Kum. s.d Bulan Ini', colspan: 3, align: 'center' },
//   { title: 'Bulan Ini Tahun Lalu', colspan: 2, align: 'center' },
//   { title: 's.d Akhir Tahun', colspan: 3, align: 'center' },
// ];
// // Sub-headers untuk kolom yang digabung
// const subHeaders = [
//   { title: 'Qty', key: 'qty_bulan_ini', align: 'end' },
//   { title: 'Nominal', key: 'nominal_bulan_ini', align: 'end' },
//   { title: 'Target', key: 'target_bulan_ini', align: 'end' },
//   { title: '%', key: 'persen_target_bulan_ini', align: 'end', sortable: false },
//   { title: 'Qty', key: 'qty_bulan_lalu', align: 'end' },
//   { title: 'Nominal', key: 'nominal_bulan_lalu', align: 'end' },
//   { title: '%', key: 'persen_bulan_lalu', align: 'end', sortable: false },
//   { title: 'Realisasi', key: 'realisasi_kumulatif', align: 'end' },
//   { title: 'Target', key: 'target_kumulatif', align: 'end' },
//   { title: '%', key: 'persen_target_kumulatif', align: 'end', sortable: false },
//   { title: 'Realisasi', key: 'realisasi_bulan_ini_thn_lalu', align: 'end' },
//   { title: '%', key: 'persen_thn_lalu', align: 'end', sortable: false },
//   { title: 'Realisasi', key: 'realisasi_akhir_tahun', align: 'end' }, // Placeholder
//   { title: 'Target', key: 'target_akhir_tahun', align: 'end' },
//   { title: '%', key: 'persen_target_akhir_tahun', align: 'end', sortable: false },
// ];

const totalSummary = computed<TotalSummary>(() => {
  if (!items.value || items.value.length === 0) {
    return {
      qty_bulan_ini: 0,
      nominal_bulan_ini: 0,
      target_bulan_ini: 0,
      persen_target_bulan_ini: 0,
      qty_bulan_lalu: 0,
      nominal_bulan_lalu: 0,
      persen_bulan_lalu: 0,
      realisasi_kumulatif: 0,
      target_kumulatif: 0,
      persen_target_kumulatif: 0,
      realisasi_bulan_ini_thn_lalu: 0,
      persen_thn_lalu: 0,
      realisasi_akhir_tahun: 0,
      target_akhir_tahun: 0,
      persen_target_akhir_tahun: 0,
    };
  }

  // Helper: Bulatkan angka sesuai konfigurasi global (ROUND_1, ROUND_50, dll)
  const rnd = (val: number) => applyRoundingPolicy(val, AppConfig.roundingPolicy);

  // Hitung total dari data raw, lalu bulatkan hasilnya
  const totals = {
    qty_bulan_ini: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.qty_bulan_ini) || 0), 0)
    ),
    nominal_bulan_ini: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.nominal_bulan_ini) || 0), 0)
    ),
    target_bulan_ini: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.target_bulan_ini) || 0), 0)
    ),

    qty_bulan_lalu: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.qty_bulan_lalu) || 0), 0)
    ),
    nominal_bulan_lalu: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.nominal_bulan_lalu) || 0), 0)
    ),

    realisasi_kumulatif: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.realisasi_kumulatif) || 0), 0)
    ),
    target_kumulatif: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.target_kumulatif) || 0), 0)
    ),

    realisasi_bulan_ini_thn_lalu: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.realisasi_bulan_ini_thn_lalu) || 0), 0)
    ),

    realisasi_akhir_tahun: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.realisasi_akhir_tahun) || 0), 0)
    ),

    target_akhir_tahun: rnd(
      items.value.reduce((sum, item) => sum + (Number(item.target_akhir_tahun) || 0), 0)
    ),
  };

  return {
    ...totals,
    persen_target_bulan_ini: totals.target_bulan_ini
      ? (totals.nominal_bulan_ini / totals.target_bulan_ini) * 100
      : 0,

    // [FIX] Hapus pengurangannya, jadikan rasio pencapaian terhadap bulan lalu
    persen_bulan_lalu: totals.nominal_bulan_lalu
      ? (totals.nominal_bulan_ini / totals.nominal_bulan_lalu) * 100
      : 0,

    persen_target_kumulatif: totals.target_kumulatif
      ? (totals.realisasi_kumulatif / totals.target_kumulatif) * 100
      : 0,

    // [FIX] Hapus pengurangannya, jadikan rasio pencapaian terhadap tahun lalu
    persen_thn_lalu: totals.realisasi_bulan_ini_thn_lalu
      ? (totals.nominal_bulan_ini / totals.realisasi_bulan_ini_thn_lalu) * 100
      : 0,

    persen_target_akhir_tahun: totals.target_akhir_tahun
      ? (totals.realisasi_kumulatif / totals.target_akhir_tahun) * 100
      : 0,
  };
});

const canView = computed(() => authStore.can(MENU_ID, "view"));
// Asumsi export memerlukan izin view
const canExport = computed(() => authStore.can(MENU_ID, "view"));

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/sales-vs-target", { params: filters });
    items.value = response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    // Buat rentang tanggal dari filter tahun dan bulan
    const year = filters.tahun;
    const month = filters.bulan - 1; // Bulan di JS dimulai dari 0
    const startDate = format(startOfMonth(new Date(year, month)), "yyyy-MM-dd");
    const endDate = format(endOfMonth(new Date(year, month)), "yyyy-MM-dd");

    const response = await api.get("/sales-vs-target/dynamic-cabang-options", {
      params: { startDate, endDate },
    });
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error("Gagal memuat filter cabang dinamis.", error);
  }
};

const exportToExcel = () => {
  if (!canExport.value) {
    toast.error("Anda tidak memiliki izin untuk mengekspor data.");
    return;
  }
  if (items.value.length === 0) return toast.warning("Tidak ada data untuk diekspor.");
  const worksheet = XLSX.utils.json_to_sheet(items.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sales VS Target");
  XLSX.writeFile(workbook, `Laporan_SalesVsTarget_${filters.tahun}-${filters.bulan}.xlsx`);
  toast.success("Data berhasil diekspor.");
};

onMounted(() => {
  // --- TAMBAHKAN PENGECEKAN AWAL ---
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    items.value = []; // Pastikan data kosong
  }
  // Tidak perlu memanggil fetchData/fetchCabangOptions di sini
  // karena watch immediate: true akan melakukannya (setelah cek izin)
  // ------------------------------------
});

// Watcher ini akan memantau SEMUA perubahan di object 'filters'
watch(
  filters,
  () => {
    // --- TAMBAHKAN PENGECEKAN IZIN ---
    if (!canView.value) {
      isLoading.value = false; // Hentikan loading jika belum
      items.value = []; // Kosongkan data
      // Tidak perlu toast di sini karena onMounted akan menanganinya
      return; // Hentikan jika tidak ada izin
    }
    // ---------------------------------

    fetchData();
    fetchCabangOptions(); // Panggil kedua fungsi saat filter berubah
  },
  { deep: true, immediate: true }
);
</script>

<template>
  <PageLayout title="Laporan Sales VS Target" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="canExport"
        size="small"
        color="teal"
        @click="exportToExcel"
        prepend-icon="mdi-file-excel"
      >
        Export
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-select
          v-model="filters.tahun"
          :items="yearOptions"
          label="Tahun"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
        />
        <v-select
          v-model="filters.bulan"
          :items="monthOptions"
          item-title="title"
          item-value="value"
          label="Bulan"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 180px"
        />
        <v-spacer />
        <v-btn
          @click="fetchData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="isLoading"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          :headers="[]"
          :items="items"
          :loading="isLoading"
          class="desktop-table header-browse-blue"
          density="compact"
          fixed-header
          :items-per-page="-1"
        >
          <!-- Multi-Level Header menggunakan slot #thead -->
          <template #thead>
            <thead>
              <!-- Baris Header Level 1 (Grup) -->
              <tr>
                <th rowspan="2" class="text-center font-weight-bold border-header">No</th>
                <th rowspan="2" class="text-center font-weight-bold border-header">Tahun</th>
                <th rowspan="2" class="text-center font-weight-bold border-header">Bulan</th>
                <th rowspan="2" class="text-center font-weight-bold border-header">Kode Cabang</th>
                <th
                  rowspan="2"
                  class="text-center font-weight-bold border-header"
                  style="min-width: 200px"
                >
                  Nama Cabang
                </th>
                <th
                  colspan="4"
                  class="text-center font-weight-bold border-header bg-blue-lighten-4"
                >
                  Bulan Ini
                </th>
                <th
                  colspan="3"
                  class="text-center font-weight-bold border-header bg-green-lighten-4"
                >
                  Bulan Lalu
                </th>
                <th
                  colspan="3"
                  class="text-center font-weight-bold border-header bg-orange-lighten-4"
                >
                  Kum. s.d Bulan Ini
                </th>
                <th
                  colspan="2"
                  class="text-center font-weight-bold border-header bg-purple-lighten-4"
                >
                  Bulan Ini Tahun Lalu
                </th>
                <th colspan="3" class="text-center font-weight-bold border-header bg-red-lighten-4">
                  s.d Akhir Tahun
                </th>
              </tr>

              <!-- Baris Header Level 2 (Detail Kolom) -->
              <tr>
                <!-- Bulan Ini -->
                <th class="text-center font-weight-bold border-header bg-blue-lighten-5">Qty</th>
                <th class="text-center font-weight-bold border-header bg-blue-lighten-5">
                  Nominal
                </th>
                <th class="text-center font-weight-bold border-header bg-blue-lighten-5">Target</th>
                <th class="text-center font-weight-bold border-header bg-blue-lighten-5">%</th>

                <!-- Bulan Lalu -->
                <th class="text-center font-weight-bold border-header bg-green-lighten-5">Qty</th>
                <th class="text-center font-weight-bold border-header bg-green-lighten-5">
                  Nominal
                </th>
                <th class="text-center font-weight-bold border-header bg-green-lighten-5">%</th>

                <!-- Kumulatif -->
                <th class="text-center font-weight-bold border-header bg-orange-lighten-5">
                  Realisasi
                </th>
                <th class="text-center font-weight-bold border-header bg-orange-lighten-5">
                  Target
                </th>
                <th class="text-center font-weight-bold border-header bg-orange-lighten-5">%</th>

                <!-- Tahun Lalu -->
                <th class="text-center font-weight-bold border-header bg-purple-lighten-5">
                  Realisasi
                </th>
                <th class="text-center font-weight-bold border-header bg-purple-lighten-5">%</th>

                <!-- Akhir Tahun -->
                <th class="text-center font-weight-bold border-header bg-red-lighten-5">
                  Realisasi
                </th>
                <th class="text-center font-weight-bold border-header bg-red-lighten-5">Target</th>
                <th class="text-center font-weight-bold border-header bg-red-lighten-5">%</th>
              </tr>
            </thead>
          </template>

          <template #item="{ item, index }">
            <tr>
              <td class="text-center border-cell">{{ index + 1 }}</td>
              <td class="text-center border-cell">{{ item.tahun }}</td>
              <td class="text-center border-cell">{{ item.bulan }}</td>
              <td class="border-cell">{{ item.kode_cabang }}</td>
              <td class="border-cell">{{ item.nama_cabang }}</td>

              <td class="text-end border-cell">{{ formatRupiah(item.qty_bulan_ini) }}</td>
              <td class="text-end border-cell">{{ formatRupiah(item.nominal_bulan_ini) }}</td>
              <td class="text-end border-cell">{{ formatRupiah(item.target_bulan_ini) }}</td>
              <td class="text-end border-cell">
                {{
                  item.target_bulan_ini > 0
                    ? Math.max(0, (item.nominal_bulan_ini / item.target_bulan_ini) * 100).toFixed(2)
                    : 0
                }}%
              </td>

              <td class="text-end border-cell">{{ formatRupiah(item.qty_bulan_lalu) }}</td>
              <td class="text-end border-cell">{{ formatRupiah(item.nominal_bulan_lalu) }}</td>
              <td class="text-end border-cell">
                {{
                  item.nominal_bulan_lalu > 0
                    ? ((item.nominal_bulan_ini / item.nominal_bulan_lalu) * 100).toFixed(2)
                    : 0
                }}%
              </td>

              <td class="text-end border-cell">{{ formatRupiah(item.realisasi_kumulatif) }}</td>
              <td class="text-end border-cell">{{ formatRupiah(item.target_kumulatif) }}</td>
              <td class="text-end border-cell">
                {{
                  item.target_kumulatif > 0
                    ? ((item.realisasi_kumulatif / item.target_kumulatif) * 100).toFixed(2)
                    : 0
                }}%
              </td>

              <td class="text-end border-cell">
                {{ formatRupiah(item.realisasi_bulan_ini_thn_lalu) }}
              </td>
              <td class="text-end border-cell">
                {{
                  item.realisasi_bulan_ini_thn_lalu > 0
                    ? ((item.nominal_bulan_ini / item.realisasi_bulan_ini_thn_lalu) * 100).toFixed(
                        2
                      )
                    : 0
                }}%
              </td>

              <td class="text-end border-cell">{{ formatRupiah(item.realisasi_akhir_tahun) }}</td>
              <td class="text-end border-cell">{{ formatRupiah(item.target_akhir_tahun) }}</td>
              <td class="text-end border-cell">
                {{
                  item.target_akhir_tahun > 0
                    ? Math.max(
                        0,
                        (item.realisasi_kumulatif / item.target_akhir_tahun) * 100
                      ).toFixed(2)
                    : 0
                }}%
              </td>
            </tr>
          </template>

          <template #tfoot>
            <tr class="bg-grey-lighten-3 font-weight-bold">
              <td colspan="5" class="text-end border-cell">GRAND TOTAL :</td>

              <td class="text-end border-cell">{{ formatRupiah(totalSummary.qty_bulan_ini) }}</td>
              <td class="text-end border-cell">
                {{ formatRupiah(totalSummary.nominal_bulan_ini) }}
              </td>
              <td class="text-end border-cell">
                {{ formatRupiah(totalSummary.target_bulan_ini) }}
              </td>
              <td class="text-end border-cell">
                {{ totalSummary.persen_target_bulan_ini?.toFixed(2) }}%
              </td>

              <td class="text-end border-cell">{{ formatRupiah(totalSummary.qty_bulan_lalu) }}</td>
              <td class="text-end border-cell">
                {{ formatRupiah(totalSummary.nominal_bulan_lalu) }}
              </td>
              <td class="text-end border-cell">
                {{ totalSummary.persen_bulan_lalu?.toFixed(2) }}%
              </td>

              <td class="text-end border-cell">
                {{ formatRupiah(totalSummary.realisasi_kumulatif) }}
              </td>
              <td class="text-end border-cell">
                {{ formatRupiah(totalSummary.target_kumulatif) }}
              </td>
              <td class="text-end border-cell">
                {{ totalSummary.persen_target_kumulatif?.toFixed(2) }}%
              </td>

              <td class="text-end border-cell">
                {{ formatRupiah(totalSummary.realisasi_bulan_ini_thn_lalu) }}
              </td>
              <td class="text-end border-cell">{{ totalSummary.persen_thn_lalu?.toFixed(2) }}%</td>

              <td class="text-end border-cell">
                {{ formatRupiah(totalSummary.realisasi_akhir_tahun) }}
              </td>
              <td class="text-end border-cell">
                {{ formatRupiah(totalSummary.target_akhir_tahun) }}
              </td>
              <td class="text-end border-cell">
                {{ totalSummary.persen_target_akhir_tahun?.toFixed(2) }}%
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  padding: 16px;
}

.filter-section {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  gap: 8px;
}

.table-container {
  overflow-x: auto;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

/* Border styling untuk header */
:deep(.border-header) {
  border: 1px solid #bdbdbd !important;
  padding: 12px 16px !important;
  font-size: 0.875rem !important;
  white-space: nowrap;
  vertical-align: middle !important;
}

/* Header level 1 (grup) - padding lebih besar */
:deep(thead tr:first-child th) {
  padding: 14px 20px !important;
  font-size: 0.9rem !important;
}

/* Header level 2 (detail) - padding normal */
:deep(thead tr:nth-child(2) th) {
  padding: 10px 12px !important;
}

/* Border styling untuk cells */
:deep(.border-cell) {
  border: 1px solid #e0e0e0 !important;
  padding: 6px 12px !important;
}

/* Sticky header - agar header tetap terlihat saat scroll */
:deep(.v-data-table) {
  max-height: calc(100vh - 250px);
}

:deep(thead th) {
  position: sticky;
  z-index: 3;
  background: white;
}

/* Level 1 header (grup) */
:deep(thead tr:first-child th) {
  top: 0;
  min-height: 50px;
}

/* Level 2 header (detail kolom) */
:deep(thead tr:nth-child(2) th) {
  top: 50px;
  /* Sesuaikan dengan tinggi header level 1 yang lebih besar */
}

/* Hover effect untuk rows */
:deep(tbody tr:hover) {
  background-color: #f5f5f5;
}
</style>

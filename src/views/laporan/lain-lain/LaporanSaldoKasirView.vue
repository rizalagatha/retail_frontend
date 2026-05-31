<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";

// --- Inisialisasi & State ---
interface LaporanSaldoKasirItem {
  Jenis: string;
  Tanggal: string;
  Nominal: number | string;
  "Tanggal Verifikasi": string;
  "Nominal Verifikasi": number | string;
  Saldo: number | string;
  Keterangan: string;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "601";

const items = ref<LaporanSaldoKasirItem[]>([]);
const isLoading = ref(true);
const gudangOptions = ref<{ kode: string; nama: string }[]>([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  gudangKode: authStore.user?.cabang || "",
});

const headers = [
  { title: "Jenis", key: "Jenis" },
  { title: "Tanggal", key: "Tanggal" },
  { title: "Nominal", key: "Nominal", align: "end" },
  { title: "Tanggal Verifikasi", key: "Tanggal Verifikasi" },
  { title: "Nominal Verifikasi", key: "Nominal Verifikasi", align: "end" },
  { title: "Saldo", key: "Saldo", align: "end" },
  { title: "Keterangan", key: "Keterangan" },
];

// --- Kalkulasi Total ---
const totalSummary = computed(() => {
  if (!items.value || items.value.length === 0) {
    return {
      Nominal: 0,
      "Nominal Verifikasi": 0,
      Saldo: 0,
    };
  }

  const totals = {
    Nominal: items.value.reduce((sum, item) => sum + (Number(item.Nominal) || 0), 0),
    "Nominal Verifikasi": items.value.reduce(
      (sum, item) => sum + (Number(item["Nominal Verifikasi"]) || 0),
      0
    ),
    Saldo: items.value.reduce((sum, item) => sum + (Number(item.Saldo) || 0), 0),
  };
  return totals;
});

// Format currency helper
const formatCurrency = (value: number) => {
  return (value || 0).toLocaleString("id-ID");
};

// Format date helper
const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
};

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/laporan-saldo-kasir", { params: filters });
    items.value = Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    console.error("Fetch error:", err);
    const message = err.response?.data?.message || "Gagal memuat data.";
    toast.error(message);
    items.value = [];
  } finally {
    isLoading.value = false;
  }
};

const fetchGudangOptions = async () => {
  try {
    const response = await api.get("/laporan-saldo-kasir/gudang-options");
    gudangOptions.value = Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error("Fetch gudang options error:", error);
    toast.error("Gagal memuat filter gudang.");
    gudangOptions.value = [];
  }
};

const exportData = () => {
  if (items.value.length === 0) return toast.warning("Tidak ada data untuk diekspor.");
  const worksheet = XLSX.utils.json_to_sheet(items.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Saldo Kasir");
  XLSX.writeFile(workbook, `Laporan_SaldoKasir_${filters.gudangKode}.xlsx`);
  toast.success("Data berhasil diekspor.");
};

onMounted(() => {
  fetchGudangOptions();
  fetchData();
});

// Hapus watch yang lama, ganti dengan debounce
let timeoutId: ReturnType<typeof setTimeout> | null = null;
watch(
  filters,
  () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fetchData();
    }, 500);
  },
  { deep: true }
);
</script>

<template>
  <PageLayout title="Laporan Saldo Kasir" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel"
        >Export</v-btn
      >
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <v-select
          v-model="filters.gudangKode"
          :items="gudangOptions"
          item-title="nama"
          item-value="kode"
          label="Store"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 200px"
          :readonly="authStore.user?.cabang !== 'KDC'"
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

      <div class="table-wrapper">
        <div class="table-container">
          <table class="custom-table">
            <thead class="sticky-header">
              <tr>
                <th
                  v-for="header in headers"
                  :key="header.key"
                  :class="header.align === 'end' ? 'text-end' : 'text-center'"
                >
                  {{ header.title }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="isLoading">
                <td :colspan="headers.length" class="text-center py-4">
                  <v-progress-circular indeterminate color="primary" size="20" />
                </td>
              </tr>
              <tr v-else-if="items.length === 0">
                <td :colspan="headers.length" class="text-center py-4">Tidak ada data</td>
              </tr>
              <template v-else>
                <tr v-for="(item, index) in items" :key="index">
                  <td>{{ item.Jenis }}</td>
                  <td class="text-center">{{ formatDate(item.Tanggal) }}</td>
                  <td class="text-end">{{ formatCurrency(Number(item.Nominal || 0)) }}</td>
                  <td class="text-center">
                    {{ formatDate(String(item["Tanggal Verifikasi"] || "")) }}
                  </td>
                  <td class="text-end">
                    {{ formatCurrency(Number(item["Nominal Verifikasi"] || 0)) }}
                  </td>
                  <td class="text-end">{{ formatCurrency(Number(item.Saldo || 0)) }}</td>
                  <td>{{ item.Keterangan }}</td>
                </tr>
              </template>
            </tbody>
            <tfoot class="sticky-footer">
              <tr class="font-weight-bold">
                <td colspan="2" class="text-end">GRAND TOTAL :</td>
                <td class="text-end">{{ formatCurrency(totalSummary.Nominal) }}</td>
                <td></td>
                <td class="text-end">{{ formatCurrency(totalSummary["Nominal Verifikasi"]) }}</td>
                <td class="text-end">{{ formatCurrency(totalSummary.Saldo) }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
}

/* FILTER */
.filter-section {
  display: flex;
  align-items: center;
  padding: 12px;
  gap: 8px;
  flex-shrink: 0;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-label {
  font-size: 14px;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}

/* WRAPPER */
.table-wrapper {
  flex: 1;
  overflow: hidden;
  margin: 0 12px 12px 12px;

  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  background-color: rgb(var(--v-theme-surface));
}

.table-container {
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgb(var(--v-theme-surface));
}

/* TABLE BASE */
.custom-table {
  width: 100%;
  border-collapse: collapse;
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-size: 11px;
}

/* STICKY HEADER */
.custom-table thead.sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: rgb(var(--v-theme-surface));
}

/* HEADER CELLS */
.custom-table thead th {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  white-space: nowrap;
  color: rgb(var(--v-theme-on-surface));
}

/* BODY CELLS */
.custom-table tbody td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 6px 12px;
  font-size: 11px;
  white-space: nowrap;
  color: rgb(var(--v-theme-on-surface));
}

/* ROW STATES */
.custom-table tbody tr:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

/* STICKY FOOTER (GRAND TOTAL) */
.custom-table tfoot.sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 9;
  background-color: rgb(var(--v-theme-surface));
}

.custom-table tfoot td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
}

/* ALIGNMENT */
.text-center {
  text-align: center;
}

.text-end {
  text-align: right;
}

.font-weight-bold {
  font-weight: 600;
}

/* SCROLLBAR (DARK SAFE) */
.table-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.table-container::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.35);
  border-radius: 4px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-on-surface), 0.5);
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import type ExcelJS from "exceljs";
import PageLayout from "@/components/PageLayout.vue";
import type { AxiosError } from "axios";

// --- Inisialisasi & State ---
interface DeadStockItem {
  cabang: string;
  "Nama Cabang": string;
  KtgProduk: string;
  KtgBarang: string;
  "Kelompok Barang": string;
  "Jenis Kain": string;
  Warna: string;
  "Kode Barang": string;
  Barcode: string;
  "Nama Barang": string;
  Ukuran: string;
  Stok: number;
  RealSales: number;
  AvgSales: number;
  "Last Terima Tanggal": string | null;
  "No Dokumen Terima": string;
  "Sumber Terima": "SJ" | "STBJ" | null;
  "Umur (Hari)": number;
  "Umur (Bulan)": number;
  "Umur (Tahun)": number;
  "Kategori Umur": "Dead Stock" | "Slow Moving" | "Standar" | "Fast Moving";
}

interface CabangOption {
  kode: string;
  nama: string;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "510";

const items = ref<DeadStockItem[]>([]);
const isLoading = ref(true);
const isExporting = ref(false);
const cabangOptions = ref<CabangOption[]>([]);
const totalItems = ref(0);

const filters = reactive({
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  minUmur: 90,
  avgPeriod: 12,
});

const pagination = reactive({
  page: 1,
  itemsPerPage: 50,
});

const itemsPerPageOptions = [25, 50, 100, 200];

const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalItems.value / pagination.itemsPerPage))
);

const rangeLabel = computed(() => {
  if (totalItems.value === 0) return "0 data";
  const start = (pagination.page - 1) * pagination.itemsPerPage + 1;
  const end = Math.min(pagination.page * pagination.itemsPerPage, totalItems.value);
  return `${start}-${end} dari ${totalItems.value} data`;
});

const periodOptions = [
  { title: "1 Kuartal (3 Bln)", value: 3 },
  { title: "2 Kuartal (6 Bln)", value: 6 },
  { title: "3 Kuartal (9 Bln)", value: 9 },
  { title: "Tahunan (12 Bln)", value: 12 },
];

const kategoriColorMap: Record<string, string> = {
  "Dead Stock": "error",
  "Slow Moving": "warning",
  Standar: "info",
  "Fast Moving": "success",
};

const headers = computed(() => [
  { title: "No", key: "no" },
  { title: "Kode Cabang", key: "cabang" },
  { title: "Nama Cabang", key: "Nama Cabang" },
  { title: "KtgProduk", key: "KtgProduk" },
  { title: "KtgBarang", key: "KtgBarang" },
  { title: "Kelompok Barang", key: "Kelompok Barang" },
  { title: "Jenis Kain", key: "Jenis Kain" },
  { title: "Warna", key: "Warna" },
  { title: "Kode Barang", key: "Kode Barang" },
  { title: "Barcode", key: "Barcode" },
  { title: "Nama Barang", key: "Nama Barang" },
  { title: "Ukuran", key: "Ukuran" },
  { title: "Stok", key: "Stok" },
  { title: `Riil Terjual (${filters.avgPeriod} Bln)`, key: "RealSales" },
  { title: `Avg Sale (${filters.avgPeriod} Bln)`, key: "AvgSales" },
  { title: "Last Terima Tanggal", key: "Last Terima Tanggal" },
  { title: "No Dokumen Terima", key: "No Dokumen Terima" },
  { title: "Umur (Hari)", key: "Umur (Hari)" },
  { title: "Kategori Umur", key: "Kategori Umur" },
]);

// --- Kalkulasi Total (halaman berjalan saja, bukan grand total keseluruhan) ---
const totalStok = computed(() => {
  return items.value.reduce((sum, item) => sum + (Number(item.Stok) || 0), 0);
});

const formatDateSafe = (dateStr: string | null) => {
  if (!dateStr || dateStr === "0000-00-00" || dateStr === "0000-00-00T00:00:00.000Z") {
    return "-";
  }
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return "-";
  return format(dateObj, "dd/MM/yyyy");
};

// --- Methods ---
const fetchData = async () => {
  if (!filters.minUmur || filters.minUmur <= 0) {
    toast.warning("Harap isi umur (hari) lebih besar dari 0.");
    items.value = [];
    totalItems.value = 0;
    return;
  }

  isLoading.value = true;
  try {
    const response = await api.get("/laporan-dead-stok", {
      params: {
        ...filters,
        page: pagination.page,
        pageSize: pagination.itemsPerPage,
      },
    });
    items.value = response.data.items;
    totalItems.value = response.data.total;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    if (error.response) {
      toast.error(
        error.response.data?.message || `Gagal memuat data. Status: ${error.response.status}`
      );
    } else if (error.request) {
      toast.error("Tidak ada respon dari server. Periksa koneksi.");
    } else {
      toast.error(`Terjadi kesalahan: ${error.message}`);
    }
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get("/laporan-dead-stok/cabang-options");
    cabangOptions.value = response.data;
  } catch (err) {
    const error = err as Error;
    toast.error(error.message || "Gagal memuat filter cabang.");
  }
};

const getRowTextColor = (item: DeadStockItem) => {
  if (!item["Last Terima Tanggal"] || item["Last Terima Tanggal"] === "0000-00-00") {
    return "text-blue-darken-2 font-italic";
  }
  if (Number(item.AvgSales) === 0 && Number(item.Stok) > 0) {
    return "text-red font-weight-bold";
  }
  if (Number(item.AvgSales) > 0 && Number(item.AvgSales) < 0.5) {
    return "text-orange";
  }
  return "";
};

// Ekspor mengambil SELURUH data yang cocok filter (bukan cuma halaman aktif)
const exportData = async () => {
  if (totalItems.value === 0) return toast.warning("Tidak ada data untuk diekspor.");
  toast.info("Menyiapkan file export...");
  isExporting.value = true;

  try {
    const response = await api.get("/laporan-dead-stok", {
      params: { ...filters, all: true },
    });
    const exportItems: DeadStockItem[] = response.data.items;

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Laporan Dead Stock");

    const colDefs: {
      header: string;
      key: keyof DeadStockItem | "no";
      width: number;
      align: ExcelJS.Alignment["horizontal"];
    }[] = [
      { header: "No", key: "no", width: 6, align: "center" },
      { header: "Kode Cabang", key: "cabang", width: 12, align: "center" },
      { header: "Nama Cabang", key: "Nama Cabang", width: 20, align: "left" },
      { header: "Ktg Produk", key: "KtgProduk", width: 14, align: "left" },
      { header: "Ktg Barang", key: "KtgBarang", width: 14, align: "left" },
      { header: "Kelompok Barang", key: "Kelompok Barang", width: 18, align: "left" },
      { header: "Jenis Kain", key: "Jenis Kain", width: 14, align: "left" },
      { header: "Warna", key: "Warna", width: 14, align: "left" },
      { header: "Kode Barang", key: "Kode Barang", width: 18, align: "left" },
      { header: "Barcode", key: "Barcode", width: 16, align: "left" },
      { header: "Nama Barang", key: "Nama Barang", width: 40, align: "left" },
      { header: "Ukuran", key: "Ukuran", width: 10, align: "center" },
      { header: "Stok", key: "Stok", width: 10, align: "right" },
      {
        header: `Riil Terjual (${filters.avgPeriod} Bln)`,
        key: "RealSales",
        width: 18,
        align: "right",
      },
      { header: `Avg Sale (${filters.avgPeriod} Bln)`, key: "AvgSales", width: 16, align: "right" },
      {
        header: "Last Terima Tanggal",
        key: "Last Terima Tanggal",
        width: 18,
        align: "center",
      },
      { header: "No Dokumen Terima", key: "No Dokumen Terima", width: 20, align: "left" },
      { header: "Sumber Terima", key: "Sumber Terima", width: 12, align: "center" },
      { header: "Umur (Hari)", key: "Umur (Hari)", width: 12, align: "right" },
      { header: "Kategori Umur", key: "Kategori Umur", width: 16, align: "center" },
    ];

    sheet.columns = colDefs.map((c) => ({ width: c.width }));

    const headerRow = sheet.addRow(colDefs.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    const kategoriFontColor: Record<string, string> = {
      "Dead Stock": "FFC62828",
      "Slow Moving": "FFFB8C00",
      Standar: "FF1565C0",
      "Fast Moving": "FF2E7D32",
    };

    exportItems.forEach((item, index) => {
      const rowValues = colDefs.map((c) => {
        if (c.key === "no") return index + 1;
        if (c.key === "Last Terima Tanggal") return formatDateSafe(item["Last Terima Tanggal"]);
        if (c.key === "AvgSales") return Number(Number(item.AvgSales || 0).toFixed(1));
        return item[c.key as keyof DeadStockItem] ?? "";
      });
      const dataRow = sheet.addRow(rowValues);

      const noDate = !item["Last Terima Tanggal"] || item["Last Terima Tanggal"] === "0000-00-00";
      const isDead = Number(item.AvgSales) === 0 && Number(item.Stok) > 0;
      const isSlow = Number(item.AvgSales) > 0 && Number(item.AvgSales) < 0.5;

      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        const colDef = colDefs[colNum - 1];
        cell.alignment = { horizontal: colDef?.align ?? "left", vertical: "middle" };

        if (noDate) {
          cell.font = { italic: true, color: { argb: "FF1565C0" } };
        } else if (isDead) {
          cell.font = { bold: true, color: { argb: "FFC62828" } };
        } else if (isSlow) {
          cell.font = { color: { argb: "FFFB8C00" } };
        }

        const key = colDef?.key;
        if (key === "RealSales" && Number(item.RealSales) > 0) {
          cell.font = { ...(cell.font ?? {}), bold: true, color: { argb: "FF1565C0" } };
        }
        if (key === "Kategori Umur") {
          cell.font = {
            bold: true,
            color: { argb: kategoriFontColor[item["Kategori Umur"]] ?? "FF000000" },
          };
        }
      });
    });

    const totalRowData = colDefs.map((c, i) => {
      if (i === 11) return "GRAND TOTAL :";
      if (c.key === "Stok") return exportItems.reduce((s, r) => s + (Number(r.Stok) || 0), 0);
      return "";
    });
    const totalRow = sheet.addRow(totalRowData);
    totalRow.height = 20;
    totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      cell.border = {
        top: { style: "medium" },
        left: { style: "thin" },
        bottom: { style: "medium" },
        right: { style: "thin" },
      };
      const colDef = colDefs[colNum - 1];
      cell.alignment = { horizontal: colDef?.align ?? "left", vertical: "middle" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Laporan_DeadStock_${filters.cabang}_${format(new Date(), "yyyyMMdd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data berhasil diekspor.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data.");
  } finally {
    isExporting.value = false;
  }
};

onMounted(() => {
  fetchCabangOptions();
  fetchData();
});

// Perubahan filter → reset ke halaman 1
watch(
  filters,
  () => {
    pagination.page = 1;
    fetchData();
  },
  { deep: true }
);

// Ganti halaman → fetch langsung (tanpa reset)
watch(() => pagination.page, fetchData);

// Ganti jumlah per halaman → reset ke halaman 1
watch(
  () => pagination.itemsPerPage,
  () => {
    pagination.page = 1;
    fetchData();
  }
);
</script>

<template>
  <PageLayout title="Laporan Dead Stock / Umur Barang" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        size="small"
        color="teal"
        @click="exportData"
        prepend-icon="mdi-file-excel"
        :loading="isExporting"
        >Export</v-btn
      >
    </template>

    <div class="browse-content">
      <div class="filter-section d-flex align-center pa-2 ga-4">
        <v-select
          v-model="filters.cabang"
          :items="cabangOptions"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 220px"
          :readonly="authStore.user?.cabang !== 'KDC'"
        />

        <v-text-field
          v-model.number="filters.minUmur"
          label="Umur Barang (Hari) >="
          type="number"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 200px"
        />

        <v-select
          v-model="filters.avgPeriod"
          :items="periodOptions"
          label="Periode Rata-rata"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 200px"
          prepend-inner-icon="mdi-chart-line"
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
                <th v-for="header in headers" :key="header.key" class="text-center">
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
                <tr v-for="(item, index) in items" :key="index" :class="getRowTextColor(item)">
                  <td class="text-center">
                    {{ (pagination.page - 1) * pagination.itemsPerPage + index + 1 }}
                  </td>
                  <td>{{ item.cabang }}</td>
                  <td>{{ item["Nama Cabang"] }}</td>
                  <td>{{ item.KtgProduk }}</td>
                  <td>{{ item.KtgBarang }}</td>
                  <td>{{ item["Kelompok Barang"] }}</td>
                  <td>{{ item["Jenis Kain"] }}</td>
                  <td>{{ item.Warna }}</td>
                  <td>{{ item["Kode Barang"] }}</td>
                  <td>{{ item.Barcode }}</td>
                  <td class="nama-barang">{{ item["Nama Barang"] }}</td>
                  <td class="text-center">{{ item.Ukuran }}</td>
                  <td class="text-end">{{ (item.Stok || 0).toLocaleString("id-ID") }}</td>
                  <td
                    class="text-end font-weight-bold"
                    :class="item.RealSales > 0 ? 'text-blue' : 'text-grey'"
                  >
                    {{ (item.RealSales || 0).toLocaleString("id-ID") }}
                  </td>
                  <td class="text-end" :class="item.AvgSales > 0 ? 'text-primary' : 'text-grey'">
                    {{ Number(item.AvgSales || 0).toFixed(1) }}
                  </td>
                  <td class="text-center">
                    {{ formatDateSafe(item["Last Terima Tanggal"]) }}
                  </td>
                  <td>
                    {{ item["No Dokumen Terima"] }}
                    <v-chip
                      v-if="item['Sumber Terima']"
                      size="x-small"
                      variant="tonal"
                      class="ml-1"
                    >
                      {{ item["Sumber Terima"] }}
                    </v-chip>
                  </td>
                  <td class="text-end">{{ item["Umur (Hari)"] }}</td>
                  <td class="text-center">
                    <v-chip
                      size="x-small"
                      :color="kategoriColorMap[item['Kategori Umur']] || 'grey'"
                      variant="flat"
                    >
                      {{ item["Kategori Umur"] }}
                    </v-chip>
                  </td>
                </tr>
              </template>
            </tbody>
            <tfoot class="sticky-footer">
              <tr class="font-weight-bold">
                <td colspan="12" class="text-end">TOTAL HALAMAN INI :</td>
                <td class="text-end">{{ totalStok.toLocaleString("id-ID") }}</td>
                <td colspan="5"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="pagination-section d-flex align-center pa-2 ga-4">
        <span class="text-caption">{{ rangeLabel }}</span>
        <v-spacer />
        <v-select
          v-model="pagination.itemsPerPage"
          :items="itemsPerPageOptions"
          label="Per halaman"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 130px"
        />
        <v-pagination
          v-model="pagination.page"
          :length="totalPages"
          :total-visible="5"
          density="comfortable"
          size="small"
        />
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

.filter-section,
.pagination-section {
  flex-shrink: 0;
}

.table-wrapper {
  flex: 1;
  overflow: hidden;
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

.custom-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-size: 11px;
}

.custom-table thead.sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: rgb(var(--v-theme-surface));
}

.custom-table thead th {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  white-space: nowrap;
  min-width: 80px;
  color: rgb(var(--v-theme-on-surface));
}

.custom-table tbody td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 6px 12px;
  font-size: 11px;
  white-space: nowrap;
  color: rgb(var(--v-theme-on-surface));
}

.custom-table tbody td.nama-barang {
  max-width: 350px;
  white-space: normal;
  word-wrap: break-word;
}

.custom-table tbody tr:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

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

.text-center {
  text-align: center;
}

.text-end {
  text-align: right;
}

.font-weight-bold {
  font-weight: 600;
}

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

:deep(.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

.text-orange {
  color: #fb8c00 !important;
}
</style>

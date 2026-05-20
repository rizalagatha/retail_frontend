<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import ExcelJS from "exceljs";
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
  "Last Terima STBJ/Tanggal": string | null;
  "No STBJ/SJ": string;
  "Umur (Hari)": number;
  "Umur (Bulan)": number;
  "Umur (Tahun)": number;
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
const cabangOptions = ref<CabangOption[]>([]);

const filters = reactive({
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  minUmur: 90,
  avgPeriod: 12, // Default 1 tahun
});

// Opsi untuk filter periode
const periodOptions = [
  { title: "1 Kuartal (3 Bln)", value: 3 },
  { title: "2 Kuartal (6 Bln)", value: 6 },
  { title: "3 Kuartal (9 Bln)", value: 9 },
  { title: "Tahunan (12 Bln)", value: 12 },
];

const headers = computed(() => [
  { title: "No", key: "no" },
  { title: "Kode Cabang", key: "cabang" },
  { title: "Nama Cabang", key: "Nama Cabang" },
  { title: "KtgProduk", key: "KtgProduk" },
  { title: "KtgBarang", key: "KtgBarang" },
  { title: "Kelompok Barang", key: "Kelompok Barang" }, // 👈 Tambahkan ini
  { title: "Jenis Kain", key: "Jenis Kain" }, // 👈 Tambahkan ini
  { title: "Warna", key: "Warna" },
  { title: "Kode Barang", key: "Kode Barang" },
  { title: "Barcode", key: "Barcode" },
  { title: "Nama Barang", key: "Nama Barang" },
  { title: "Ukuran", key: "Ukuran" },
  { title: "Stok", key: "Stok" },
  // Judul kolom sekarang mengikuti nilai filter avgPeriod
  { title: `Riil Terjual (${filters.avgPeriod} Bln)`, key: "RealSales" },
  { title: `Avg Sale (${filters.avgPeriod} Bln)`, key: "AvgSales" },
  { title: "Last Terima Tanggal", key: "Last Terima STBJ/Tanggal" },
  { title: "No STBJ/SJ", key: "No STBJ/SJ" },
  { title: "Umur (Hari)", key: "Umur (Hari)" },
  { title: "Umur (Bulan)", key: "Umur (Bulan)" },
  { title: "Umur (Tahun)", key: "Umur (Tahun)" },
]);

// --- Kalkulasi Total ---
const totalStok = computed(() => {
  return items.value.reduce((sum, item) => sum + (Number(item.Stok) || 0), 0);
});

const formatDateSafe = (dateStr: string | null) => {
  if (!dateStr || dateStr === "0000-00-00" || dateStr === "0000-00-00T00:00:00.000Z") {
    return "-"; // Tampilkan strip jika tidak ada tanggal
  }

  const dateObj = new Date(dateStr);

  // Cek apakah objek tanggal valid
  if (isNaN(dateObj.getTime())) {
    return "-";
  }

  return format(dateObj, "dd/MM/yyyy");
};

// --- Methods ---
const fetchData = async () => {
  // --- TAMBAHKAN VALIDASI INI ---
  if (!filters.minUmur || filters.minUmur <= 0) {
    toast.warning("Harap isi umur (hari) lebih besar dari 0.");
    items.value = []; // Kosongkan tabel
    return; // Hentikan pemanggilan API
  }
  // ---------------------------------

  isLoading.value = true;
  try {
    const response = await api.get("/laporan-dead-stok", { params: filters });
    items.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;

    if (error.response) {
      // Error dari server (HTTP 4xx/5xx)
      toast.error(
        error.response.data?.message || `Gagal memuat data. Status: ${error.response.status}`
      );
    } else if (error.request) {
      // Request dibuat tapi tidak ada response
      toast.error("Tidak ada respon dari server. Periksa koneksi.");
    } else {
      // Error lain (misal konfigurasi axios)
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

// Fungsi pewarnaan baris berdasarkan logika Average Sales
const getRowTextColor = (item: DeadStockItem) => {
  if (!item["Last Terima STBJ/Tanggal"] || item["Last Terima STBJ/Tanggal"] === "0000-00-00") {
    return "text-blue-darken-2 font-italic";
  }

  // Jika penjualan 0 (Mati total) dan stok masih ada
  if (Number(item.AvgSales) === 0 && Number(item.Stok) > 0) {
    return "text-red font-weight-bold";
  }
  // Jika penjualan sangat lambat (misal < 0.5 per bulan)
  if (Number(item.AvgSales) > 0 && Number(item.AvgSales) < 0.5) {
    return "text-orange";
  }
  return "";
};

const exportData = async () => {
  if (items.value.length === 0) return toast.warning("Tidak ada data untuk diekspor.");
  toast.info("Menyiapkan file export...");

  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Laporan Dead Stock");

    // ── Definisi kolom ─────────────────────────────────────
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
        key: "Last Terima STBJ/Tanggal",
        width: 18,
        align: "center",
      },
      { header: "No STBJ/SJ", key: "No STBJ/SJ", width: 20, align: "left" },
      { header: "Umur (Hari)", key: "Umur (Hari)", width: 12, align: "right" },
      { header: "Umur (Bulan)", key: "Umur (Bulan)", width: 14, align: "right" },
      { header: "Umur (Tahun)", key: "Umur (Tahun)", width: 14, align: "right" },
    ];

    // Set column widths
    sheet.columns = colDefs.map((c) => ({ width: c.width }));

    // ── Header row ─────────────────────────────────────────
    const headerRow = sheet.addRow(colDefs.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
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

    // ── Data rows ──────────────────────────────────────────
    items.value.forEach((item, index) => {
      const rowValues = colDefs.map((c) => {
        if (c.key === "no") return index + 1;
        if (c.key === "Last Terima STBJ/Tanggal")
          return formatDateSafe(item["Last Terima STBJ/Tanggal"]);
        if (c.key === "AvgSales") return Number(Number(item.AvgSales || 0).toFixed(1));
        return item[c.key as keyof DeadStockItem] ?? "";
      });

      const dataRow = sheet.addRow(rowValues);

      // Tentukan warna baris
      const noDate =
        !item["Last Terima STBJ/Tanggal"] || item["Last Terima STBJ/Tanggal"] === "0000-00-00";
      const isDead = Number(item.AvgSales) === 0 && Number(item.Stok) > 0;
      const isSlow = Number(item.AvgSales) > 0 && Number(item.AvgSales) < 0.5;

      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        // Border semua sel
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        // Alignment per kolom
        const colDef = colDefs[colNum - 1];
        cell.alignment = { horizontal: colDef?.align ?? "left", vertical: "middle" };

        // Warna font berdasarkan kondisi
        if (noDate) {
          cell.font = { italic: true, color: { argb: "FF1565C0" } }; // biru italic
        } else if (isDead) {
          cell.font = { bold: true, color: { argb: "FFC62828" } }; // merah bold
        } else if (isSlow) {
          cell.font = { color: { argb: "FFFB8C00" } }; // oranye
        }

        // Kolom RealSales — biru kalau > 0
        const key = colDef?.key;
        if (key === "RealSales" && Number(item.RealSales) > 0) {
          cell.font = { ...(cell.font ?? {}), bold: true, color: { argb: "FF1565C0" } };
        }
      });
    });

    // ── Grand Total row ────────────────────────────────────
    const totalRowData = colDefs.map((c, i) => {
      if (i === 11) return "GRAND TOTAL :"; // kolom Ukuran → label
      if (c.key === "Stok") return items.value.reduce((s, r) => s + (Number(r.Stok) || 0), 0);
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

    // ── Download ───────────────────────────────────────────
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
  }
};

onMounted(() => {
  fetchCabangOptions();
  fetchData(); // Muat data awal berdasarkan filter default
});

watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Dead Stock / Umur Barang" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel"
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
          style="max-width: 200px"
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
                  <td class="text-center">{{ index + 1 }}</td>
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
                    {{ formatDateSafe(item["Last Terima STBJ/Tanggal"]) }}
                  </td>
                  <td>{{ item["No STBJ/SJ"] }}</td>
                  <td class="text-end">{{ item["Umur (Hari)"] }}</td>
                  <td class="text-end">{{ item["Umur (Bulan)"] }}</td>
                  <td class="text-end">{{ item["Umur (Tahun)"] }}</td>
                </tr>
              </template>
            </tbody>
            <tfoot class="sticky-footer">
              <tr class="font-weight-bold">
                <td colspan="12" class="text-end">GRAND TOTAL :</td>
                <td class="text-end">{{ totalStok.toLocaleString("id-ID") }}</td>
                <td colspan="6"></td>
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
  flex-shrink: 0;
}

/* WRAPPER */
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

/* TABLE BASE */
.custom-table {
  width: max-content;
  min-width: 100%;
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
  min-width: 80px;
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

/* NAMA BARANG WRAP */
.custom-table tbody td.nama-barang {
  max-width: 350px;
  white-space: normal;
  word-wrap: break-word;
}

/* ROW HOVER */
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

/* Pewarnaan Baris */
:deep(.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

.text-orange {
  color: #fb8c00 !important;
  /* Warna Orange untuk peringatan sedang */
}
</style>

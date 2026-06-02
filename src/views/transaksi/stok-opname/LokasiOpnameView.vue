<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import AppDataTable from "@/components/AppDataTable.vue";
import LocationGeneratorModal from "@/components/modal/LocationGeneratorModal.vue";
import LokasiOpnamePrintModal from "@/components/modal/LokasiOpnamePrintModal.vue";
import { format, parseISO } from "date-fns";
import type { AxiosError } from "axios";
import ExcelJS from "exceljs";

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

// Tambahan: Interface untuk Detail Barang
interface DetailBarang {
  hs_idrec: string;
  hs_kode: string;
  barcode: string;
  nama_barang: string;
  hs_ukuran: string;
  hs_qty: number;
  hs_operator: string;
  date_create: string;
  no_packing_list?: string;
  no_packing_produksi?: string;
}

interface RawSoDate {
  st_tanggal: string;
}

interface SoDateOption {
  st_tanggal: string;
  formattedLabel: string;
}

interface MasterOption {
  jenis: string;
  kode: string;
}

interface Cabang {
  kode: string;
  nama: string;
}

const toast = useToast();
const router = useRouter();
const authStore = useAuthStore();
const MENU_ID = "18";

const items = ref<LokasiOpname[]>([]);
const isLoading = ref(true);
const selected = ref<LokasiOpname[]>([]);
const isGeneratorVisible = ref(false);
const cabangOptions = ref<Cabang[]>([]);
const isDeleteDialogOpen = ref(false);
const itemToDelete = ref<string | null>(null);
const isPrintModalVisible = ref(false);
const masterOptions = ref<MasterOption[]>([]);
const soDateOptions = ref<SoDateOption[]>([]);

// State untuk fitur Expand Detail
const expanded = ref<string[]>([]);
const detailLoading = ref<Set<string>>(new Set());
const detailData = ref<{ [lokasiId: string]: DetailBarang[] }>({});

const filters = reactive<{
  cabang: string;
  jenis: string;
  tanggal: string;
}>({
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang ?? "",
  jenis: "ALL",
  tanggal: "ALL",
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
  return (user?.cabang === "KDC" && user?.kode === "RIO") || user?.kode === "ADMIN";
});

const fetchSoDates = async () => {
  try {
    const response = await api.get("/lokasi-opname/so-dates", {
      params: { cabang: filters.cabang },
    });
    const rawData = response.data as RawSoDate[];
    soDateOptions.value = rawData.map(
      (d: RawSoDate): SoDateOption => ({
        st_tanggal: d.st_tanggal,
        formattedLabel: format(parseISO(d.st_tanggal), "dd/MM/yyyy"),
      })
    );
    if (soDateOptions.value.length > 0 && filters.tanggal === "ALL") {
      filters.tanggal = soDateOptions.value[0].st_tanggal;
    }
  } catch {
    soDateOptions.value = [];
  }
};

const fetchMasterOptions = async () => {
  try {
    const response = await api.get("/lokasi-opname/master");
    masterOptions.value = [{ jenis: "SEMUA JENIS", kode: "ALL" }, ...response.data];
  } catch {
    toast.error("Gagal memuat filter jenis lokasi.");
  }
};

const fetchData = async () => {
  isLoading.value = true;
  expanded.value = []; // Reset expand saat data berubah
  try {
    const response = await api.get("/lokasi-opname", { params: filters });
    const sortedData = response.data.sort((a: LokasiOpname, b: LokasiOpname) => {
      return a.lo_lokasi.localeCompare(b.lo_lokasi, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    items.value = sortedData;
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

// Fungsi baru untuk memuat detail barang ketika baris di-expand
const loadDetailBarang = async (newlyExpandedItems: LokasiOpname[]) => {
  // Cari item yang baru saja di-expand tapi datanya belum ada di memori
  const itemToLoad = newlyExpandedItems.find(
    (item) => !detailData.value[item.lo_idrec] && !detailLoading.value.has(item.lo_idrec)
  );

  if (!itemToLoad) return; // Jika tidak ada yang perlu di-load, keluar

  // Hanya load jika lokasi tersebut memang ada isinya
  if (itemToLoad.total_hitung === 0) {
    detailData.value[itemToLoad.lo_idrec] = [];
    return;
  }

  detailLoading.value.add(itemToLoad.lo_idrec);

  try {
    const response = await api.get<DetailBarang[]>("/lokasi-opname/detail-barang", {
      params: { cabang: itemToLoad.lo_cab, lokasi: itemToLoad.lo_lokasi },
    });
    detailData.value[itemToLoad.lo_idrec] = response.data;
  } catch {
    toast.error(`Gagal memuat detail barang untuk lokasi ${itemToLoad.lo_lokasi}`);
    // Tutup baris yang gagal di-load
    expanded.value = expanded.value.filter((id) => id !== itemToLoad.lo_idrec);
  } finally {
    detailLoading.value.delete(itemToLoad.lo_idrec);
  }
};

const handleBulkGenerate = async (data: { locations: string[]; jenisNama: string }) => {
  isLoading.value = true;
  try {
    const payload = {
      cabang: filters.cabang,
      locations: data.locations,
      jenisNama: data.jenisNama,
    };
    const response = await api.post("/lokasi-opname/generate", payload);
    toast.success(response.data.message);
    isGeneratorVisible.value = false;
    fetchData();
  } catch (error: unknown) {
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
    await api.delete(`/lokasi-opname/${itemToDelete.value}`);
    toast.success("Lokasi berhasil dihapus.");
    fetchData();
  } catch {
    toast.error("Gagal menghapus lokasi.");
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

const exportToExcel = async (type: "header" | "detail") => {
  if (items.value.length === 0) return toast.warning("Tidak ada data untuk diekspor.");

  toast.info(`Menyiapkan export ${type}...`);

  const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  const borderMedium: Partial<ExcelJS.Borders> = {
    top: { style: "medium" },
    left: { style: "thin" },
    bottom: { style: "medium" },
    right: { style: "thin" },
  };

  const workbook = new ExcelJS.Workbook();

  if (type === "header") {
    const sheet = workbook.addWorksheet("Master Lokasi Opname");

    const cols = [
      { header: "Cabang", key: "lo_cab", width: 12 },
      { header: "Kode Lokasi", key: "lo_lokasi", width: 18 },
      { header: "Jenis Lokasi", key: "lo_jenis_nama", width: 22 },
      { header: "Qty Terhitung", key: "total_hitung", width: 16, numFmt: "#,##0" },
      { header: "Operator Hitung", key: "operator_hitung", width: 22 },
      { header: "Dibuat Oleh", key: "user_create", width: 18 },
      { header: "Waktu Input", key: "date_create", width: 20 },
    ];

    sheet.columns = cols.map((c) => ({ width: c.width }));

    // Header row
    const headerRow = sheet.addRow(cols.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    // Data rows
    items.value.forEach((item) => {
      const row = sheet.addRow(
        cols.map((c) => {
          if (c.key === "date_create") {
            return item.date_create ? format(parseISO(item.date_create), "dd/MM/yyyy HH:mm") : "-";
          }
          return (item as Record<string, unknown>)[c.key] ?? "-";
        })
      );
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border = borderThin;
        cell.alignment = {
          vertical: "middle",
          horizontal: cols[colNum - 1]?.numFmt ? "right" : "left",
        };
        if (cols[colNum - 1]?.numFmt) cell.numFmt = cols[colNum - 1].numFmt!;
      });
    });

    // Total row
    const totalRow = sheet.addRow(
      cols.map((c, i) =>
        i === 0
          ? "TOTAL :"
          : c.key === "total_hitung"
          ? items.value.reduce((s, r) => s + (r.total_hitung || 0), 0)
          : ""
      )
    );
    totalRow.height = 22;
    totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      cell.border = borderMedium;
      cell.alignment = {
        horizontal: cols[colNum - 1]?.numFmt ? "right" : "left",
        vertical: "middle",
      };
      if (cols[colNum - 1]?.numFmt) cell.numFmt = cols[colNum - 1].numFmt!;
    });

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  } else {
    // Export detail — fetch semua detail untuk item yang ada
    toast.info("Mengambil data detail semua lokasi...");

    const allDetails: Array<Record<string, unknown>> = [];

    for (const item of items.value) {
      if (item.total_hitung === 0) continue;
      try {
        const res = await api.get("/lokasi-opname/detail-barang", {
          params: { cabang: item.lo_cab, lokasi: item.lo_lokasi },
        });
        const rows = res.data as Array<Record<string, unknown>>;
        rows.forEach((r) => {
          allDetails.push({
            Cabang: item.lo_cab,
            "Kode Lokasi": item.lo_lokasi,
            "Jenis Lokasi": item.lo_jenis_nama || "-",
            "Kode Barang": r.hs_kode,
            Barcode: r.barcode || "-",
            "Nama Barang": r.nama_barang,
            Ukuran: r.hs_ukuran,
            Qty: r.hs_qty,
            Operator: r.hs_operator,
            "No. PL": r.no_packing_list || "-",
            "No. Prod": r.no_packing_produksi || "-",
            "Waktu Scan": r.date_create
              ? format(parseISO(String(r.date_create)), "dd/MM/yyyy HH:mm:ss")
              : "-",
          });
        });
      } catch {
        // skip lokasi yang gagal
      }
    }

    if (allDetails.length === 0) return toast.warning("Tidak ada data detail.");

    // Sheet 1: Detail flat
    const sheet1 = workbook.addWorksheet("Detail Barang");
    const keys = Object.keys(allDetails[0]);
    const numericKeys = ["Qty"];

    sheet1.columns = keys.map((k) => ({
      width: ["Nama Barang"].includes(k) ? 32 : ["Kode Barang", "Barcode"].includes(k) ? 18 : 14,
    }));

    const h1 = sheet1.addRow(keys);
    h1.height = 22;
    h1.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    let prevLokasi = "";
    let prevCabang = "";
    allDetails.forEach((row) => {
      const lokasiKey = `${row["Cabang"]}||${row["Kode Lokasi"]}`;
      const isNew = lokasiKey !== `${prevCabang}||${prevLokasi}`;
      prevCabang = String(row["Cabang"]);
      prevLokasi = String(row["Kode Lokasi"]);

      // Kolom identitas hanya tampil di baris pertama per lokasi
      const identityKeys = new Set(["Cabang", "Kode Lokasi", "Jenis Lokasi"]);

      const dataRow = sheet1.addRow(
        keys.map((k) => {
          if (identityKeys.has(k) && !isNew) return ""; // kosongkan jika bukan baris pertama
          return row[k] ?? "";
        })
      );

      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const key = keys[colNum - 1] ?? "";
        cell.border = {
          left: { style: "thin" },
          right: { style: "thin" },
          bottom: { style: "thin" },
          top: isNew ? { style: "medium" } : { style: "thin" },
        };
        cell.alignment = {
          horizontal: numericKeys.includes(key) ? "right" : "left",
          vertical: "middle",
        };
        if (numericKeys.includes(key)) cell.numFmt = "#,##0";
      });
    });

    // Sheet 2: Ringkasan per lokasi
    const sheet2 = workbook.addWorksheet("Ringkasan per Lokasi");
    const sumCols = [
      { header: "Cabang", width: 12, align: "left" as const },
      { header: "Kode Lokasi", width: 18, align: "left" as const },
      { header: "Jenis Lokasi", width: 22, align: "left" as const },
      { header: "Total Item", width: 12, align: "right" as const, fmt: "#,##0" },
      { header: "Total Qty", width: 12, align: "right" as const, fmt: "#,##0" },
    ];
    sheet2.columns = sumCols.map((c) => ({ width: c.width }));
    const h2 = sheet2.addRow(sumCols.map((c) => c.header));
    h2.height = 22;
    h2.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    let grandQty = 0;
    items.value.forEach((item) => {
      const lokDetail = allDetails.filter(
        (d) => d["Kode Lokasi"] === item.lo_lokasi && d["Cabang"] === item.lo_cab
      );
      const qty = lokDetail.reduce((s, d) => s + Number(d.Qty || 0), 0);
      grandQty += qty;
      const r = sheet2.addRow([
        item.lo_cab,
        item.lo_lokasi,
        item.lo_jenis_nama || "-",
        lokDetail.length,
        qty,
      ]);
      r.eachCell({ includeEmpty: true }, (cell, i) => {
        cell.border = borderThin;
        cell.alignment = { horizontal: sumCols[i - 1]?.align ?? "left", vertical: "middle" };
        if (sumCols[i - 1]?.fmt) cell.numFmt = sumCols[i - 1].fmt!;
      });
    });

    const totalR = sheet2.addRow(["TOTAL :", "", "", allDetails.length, grandQty]);
    const totalRowNum = sheet2.rowCount;
    sheet2.mergeCells(`A${totalRowNum}:C${totalRowNum}`);
    totalR.height = 22;
    totalR.eachCell({ includeEmpty: true }, (cell, i) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      cell.border = borderMedium;
      cell.alignment = { horizontal: sumCols[i - 1]?.align ?? "left", vertical: "middle" };
      if (sumCols[i - 1]?.fmt) cell.numFmt = sumCols[i - 1].fmt!;
    });

    sheet1.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
    sheet2.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Export_Lokasi_Opname_${type}_${filters.cabang}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Export berhasil.");
};

const printToPDF = () => {
  if (selected.value.length === 0) {
    toast.warning("Pilih lokasi yang ingin dicetak daftar barangnya.");
    return;
  }

  // Ambil ID lokasi yang dipilih dan gabungkan dengan koma
  const ids = selected.value.map((item) => item.lo_idrec).join(",");

  // Arahkan ke halaman print baru dengan membawa parameter ID
  const routeUrl = router.resolve({
    name: "LokasiOpnamePrint",
    query: { ids: ids },
  });
  window.open(routeUrl.href, "_blank");
};

watch(
  () => filters.cabang,
  () => {
    filters.tanggal = "ALL";
    fetchSoDates();
  }
);

onMounted(() => {
  fetchCabangOptions();
  fetchMasterOptions();
  fetchSoDates();
  fetchData();
});

watch(
  filters,
  () => {
    selected.value = [];
    fetchData();
  },
  { deep: true }
);
</script>

<template>
  <PageLayout title="Master Lokasi Opname" :menu-id="MENU_ID" icon="mdi-map-marker-plus-outline">
    <template #header-actions>
      <v-btn
        v-if="isAuthorizedForGenerator"
        size="small"
        color="primary"
        prepend-icon="mdi-plus-box-multiple"
        @click="isGeneratorVisible = true"
        :disabled="filters.cabang === 'ALL'"
      >
        Generate Lokasi
      </v-btn>
      <v-btn
        size="small"
        color="green-darken-1"
        prepend-icon="mdi-printer"
        :disabled="selected.length === 0"
        @click="handleOpenPrint"
      >
        Cetak Label ({{ selected.length }})
      </v-btn>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportToExcel('header')">
            <v-list-item-title>Export Master Lokasi</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportToExcel('detail')">
            <v-list-item-title>Export Detail Barang</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
      <v-btn
        size="small"
        color="deep-orange-darken-1"
        prepend-icon="mdi-file-document-outline"
        :disabled="selected.length === 0"
        @click="printToPDF"
      >
        Cetak A4 ({{ selected.length }})
      </v-btn>
      <!-- <v-btn
        color="error"
        variant="flat"
        size="small"
        :loading="isLoading"
        @click="handleDeleteConfirm"
      >
        Ya, Hapus Lokasi
      </v-btn> -->
    </template>

    <div class="browse-content">
      <div class="filter-section py-2 px-4 d-flex align-center ga-4 border-bottom">
        <v-select
          v-model="filters.cabang"
          :items="cabangOptions"
          item-title="nama"
          item-value="kode"
          label="Pilih Cabang"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 250px"
        />
        <v-select
          v-model="filters.jenis"
          :items="masterOptions"
          item-title="jenis"
          item-value="jenis"
          label="Jenis Lokasi"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 200px"
        />
        <v-select
          v-model="filters.tanggal"
          :items="soDateOptions"
          item-title="formattedLabel"
          item-value="st_tanggal"
          label="Tanggal SO"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        >
          <template #prepend-item>
            <v-list-item title="SEMUA TANGGAL" value="ALL" @click="filters.tanggal = 'ALL'" />
            <v-divider class="mb-2" />
          </template>
        </v-select>
        <v-spacer />
        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          @click="fetchData"
          :loading="isLoading"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="items"
          :loading="isLoading"
          item-value="lo_idrec"
          density="compact"
          class="desktop-table header-browse-blue"
          height="100%"
          fixed-header
          show-select
          show-expand
          return-object
          :row-props="({ item }: { item: LokasiOpname }) => ({
            class: selected.some(s => s.lo_idrec === item.lo_idrec) ? 'row-selected' : '',
            style: 'cursor: pointer',
            onClick: (e: MouseEvent) => {
              // Jangan trigger jika klik pada checkbox, expand, atau tombol delete
              const target = e.target as HTMLElement;
              if (target.closest('.v-checkbox-btn') || target.closest('.v-btn')) return;
              const idx = selected.findIndex(s => s.lo_idrec === item.lo_idrec);
              if (idx >= 0) selected.splice(idx, 1);
              else selected.push(item);
            }
          })"
          @update:expanded="loadDetailBarang"
        >
          <template #[`item.date_create`]="{ value }">
            {{ value ? format(parseISO(value), "dd/MM/yyyy HH:mm") : "-" }}
          </template>

          <template #[`item.total_hitung`]="{ value }">
            <v-chip
              :color="value > 0 ? 'success' : 'grey-lighten-1'"
              size="x-small"
              class="font-weight-bold"
              variant="flat"
            >
              {{ value.toLocaleString("id-ID") }}
            </v-chip>
          </template>

          <template #[`item.actions`]="{ item }">
            <v-btn
              icon="mdi-delete-outline"
              size="x-small"
              color="error"
              @click="promptDelete(item.lo_idrec)"
            />
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div
                      v-if="detailLoading.has(item.lo_idrec)"
                      class="text-center pa-4 text-caption"
                    >
                      <v-progress-circular indeterminate size="24" color="primary" class="mr-2" />
                      Memuat rincian barang...
                    </div>

                    <div
                      v-else-if="
                        !detailData[item.lo_idrec] || detailData[item.lo_idrec].length === 0
                      "
                      class="text-center pa-4 text-caption text-grey"
                    >
                      Lokasi ini masih kosong (belum ada barang yang dihitung).
                    </div>

                    <table v-else class="inner-detail-table">
                      <thead>
                        <tr>
                          <th>Kode Barang</th>
                          <th>Barcode</th>
                          <th>Nama Barang</th>
                          <th>Ukuran</th>
                          <th class="text-right">Qty</th>
                          <th>Operator</th>
                          <th v-if="item.lo_cab === 'KDC'">No. PL</th>
                          <th v-if="item.lo_cab === 'KDC'">No. Prod</th>
                          <th>Waktu Scan</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="brg in detailData[item.lo_idrec]" :key="brg.hs_idrec">
                          <td class="font-weight-bold text-blue-darken-3">{{ brg.hs_kode }}</td>
                          <td>{{ brg.barcode || "-" }}</td>
                          <td>{{ brg.nama_barang }}</td>
                          <td>{{ brg.hs_ukuran }}</td>
                          <td class="text-right font-weight-bold">{{ brg.hs_qty }}</td>
                          <td>{{ brg.hs_operator }}</td>
                          <td v-if="item.lo_cab === 'KDC'" class="text-purple-darken-3">
                            {{ brg.no_packing_list || "-" }}
                          </td>
                          <td v-if="item.lo_cab === 'KDC'" class="text-orange-darken-3">
                            {{ brg.no_packing_produksi || "-" }}
                          </td>
                          <td class="text-caption text-grey-darken-1">
                            {{
                              brg.date_create
                                ? format(parseISO(brg.date_create), "dd/MM HH:mm:ss")
                                : "-"
                            }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <LocationGeneratorModal
      v-if="isGeneratorVisible"
      :cabang="filters.cabang"
      @close="isGeneratorVisible = false"
      @generate="handleBulkGenerate"
    />
    <LokasiOpnamePrintModal
      v-if="isPrintModalVisible"
      :items="selected"
      @close="isPrintModalVisible = false"
    />

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
          <v-btn
            color="error"
            variant="flat"
            size="small"
            :loading="isLoading"
            @click="handleDeleteConfirm"
          >
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

/* Tambahan CSS Khusus untuk Detail Tabel */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 2px solid rgba(var(--v-theme-primary), 0.2);
  padding: 12px 16px 16px 64px; /* Memberi ruang di kiri agar sejajar dengan chevron */
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  background-color: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  overflow-x: auto; /* ← ini yang penting */
  overflow-y: visible;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.inner-detail-table {
  width: max-content; /* ← biarkan tabel melebar melebihi container */
  min-width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.inner-detail-table thead th {
  background-color: #eceff1;
  color: #37474f;
  font-weight: bold;
  text-transform: uppercase;
  padding: 6px 12px;
  border-bottom: 1px solid #cfd8dc;
  text-align: left;
}

.inner-detail-table tbody td {
  padding: 6px 12px;
  border-bottom: 1px solid #eeeeee;
  color: #424242;
}

.inner-detail-table tbody tr:hover {
  background-color: #f5f5f5;
}

.inner-detail-table tbody tr:last-child td {
  border-bottom: none;
}

:deep(tr.row-selected td) {
  background-color: #bbdefb !important;
  color: #0d47a1 !important;
  font-weight: 600 !important;
}

:deep(tr.row-selected:hover td) {
  background-color: #90caf9 !important;
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import { format } from "date-fns";
import type { Alignment, Cell } from "exceljs";

interface PelunasanHeader {
  sh_nomor: string;
  sh_tanggal: string;
  cus_nama: string;
  sh_ket: string;
  sh_jenis: number; // supaya mapping jenis_bayar jelas
  jenis_bayar: string; // hasil mapping di FE
  total_bayar: number;
  user_create: string;
  [key: string]: unknown; // jika masih ada field lain dari API
}

interface PelunasanDetail {
  inv_nomor: string;
  inv_tanggal: string;
  inv_mp_nama: string;
  inv_mp_nomor_pesanan: string;
  nominal_bayar: number;
}

interface PelunasanHeaderBackend {
  sh_nomor: string;
  sh_tanggal: string;
  cus_nama: string;
  sh_ket: string;
  sh_jenis: number;
  total_bayar: number;
  user_create: string;
  // jika backend kirim field lain, tambahkan di sini
}

interface PelunasanHeader extends PelunasanHeaderBackend {
  jenis_bayar: string;
}

interface PelunasanDetailBackend {
  inv_nomor: string;
  inv_tanggal: string | null;
  inv_mp_nama: string | null;
  inv_mp_nomor_pesanan: string | null;
  nominal_bayar: number;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "50";

// --- State ---
const isLoading = ref(false);
const items = ref<PelunasanHeader[]>([]);
const totalItems = ref(0);
const selected = ref<PelunasanHeader[]>([]);
const selectedRow = computed<PelunasanHeader | null>(() =>
  selected.value.length === 1 ? selected.value[0] : null
);
const expanded = ref<PelunasanHeader[]>([]);
const details = ref<Record<string, PelunasanDetail[]>>({});
const loadingDetails = ref(new Set<string>());

const filters = reactive({
  page: 1,
  itemsPerPage: 15,
  term: "",
  startDate: format(new Date(), "yyyy-MM-01"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  // [BARU] Inisialisasi filter cabang
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
});

const cabangList = ref<{ kode: string; nama: string }[]>([]);
const isKdc = computed(() => authStore.user?.cabang === "KDC");
const isRowSelected = (item: PelunasanHeader) => selectedRow.value?.sh_nomor === item.sh_nomor;

const toHeader = (item: PelunasanHeaderBackend): PelunasanHeader => ({
  ...item,
  jenis_bayar: item.sh_jenis === 1 ? "TRANSFER" : item.sh_jenis === 2 ? "GIRO" : "TUNAI",
});

// [BARU] Hitung Grand Total dari items yang tampil
const grandTotal = computed(() => {
  return items.value.reduce((sum, item) => sum + (Number(item.total_bayar) || 0), 0);
});

// --- Headers ---
const headers = [
  { title: "", key: "data-table-expand", width: "50px", sortable: false, fixed: true },
  { title: "Nomor Bukti", key: "sh_nomor", width: "180px" },
  { title: "Tanggal", key: "sh_tanggal", width: "120px" },
  { title: "Customer", key: "cus_nama", minWidth: "200px" },
  { title: "Keterangan", key: "sh_ket", minWidth: "250px" },
  { title: "Metode", key: "jenis_bayar", width: "120px" },
  { title: "Total Bayar", key: "total_bayar", align: "end", width: "150px" },
  { title: "User", key: "user_create", width: "120px" },
];

const detailHeaders = [
  { title: "No. Invoice", key: "inv_nomor", width: "200px" },
  { title: "Tgl Invoice", key: "inv_tanggal", width: "120px" },
  { title: "Marketplace", key: "inv_mp_nama", width: "150px" },
  { title: "No. Pesanan", key: "inv_mp_nomor_pesanan", width: "200px" },
  { title: "Nominal Dilunasi", key: "nominal_bayar", align: "end", width: "150px" },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
  if (!isKdc.value) return;
  try {
    const response = await api.get<{ kode: string; nama: string }[]>("/minta-barang/lookup/cabang"); // Re-use lookup cabang yang sudah ada
    const cabangLain = response.data.filter((c) => c.kode !== "ALL");
    cabangList.value = [{ kode: "ALL", nama: "SEMUA CABANG" }, ...cabangLain];
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const { data } = await api.get("/pelunasan-invoice/history", { params: filters });
    items.value = (data.items as PelunasanHeaderBackend[]).map(toHeader);
    totalItems.value = data.total;
  } catch (error) {
    console.error(error);
    toast.error("Gagal memuat data history.");
  } finally {
    isLoading.value = false;
  }
};

// [FIXED] Fungsi Load Detail
const loadDetails = async (newExpandedItems: PelunasanHeader[]) => {
  // KARENA 'return-object' AKTIF, newExpandedItems berisi Array Object.
  // Kita cari item yang sh_nomor-nya belum ada di cache 'details'

  const itemToLoad = newExpandedItems.find((item) => {
    const nomor = item.sh_nomor; // Ambil ID dari object
    return !details.value[nomor] && !loadingDetails.value.has(nomor);
  });

  if (!itemToLoad) return;

  const nomor = itemToLoad.sh_nomor; // Pastikan yang dipakai adalah string ID

  loadingDetails.value.add(nomor);
  try {
    const { data } = await api.get(`/pelunasan-invoice/detail/${nomor}`);

    // Format detail
    details.value[nomor] = (data.details as PelunasanDetailBackend[]).map(
      (d: PelunasanDetailBackend): PelunasanDetail => ({
        inv_nomor: d.inv_nomor,
        inv_tanggal: d.inv_tanggal ? format(new Date(d.inv_tanggal), "dd-MM-yyyy") : "-",
        inv_mp_nama: d.inv_mp_nama ?? "-",
        inv_mp_nomor_pesanan: d.inv_mp_nomor_pesanan ?? "-",
        nominal_bayar: d.nominal_bayar,
      })
    );
  } catch (error) {
    console.error(error);
    toast.error(`Gagal memuat detail ${nomor}`);
  } finally {
    loadingDetails.value.delete(nomor);
  }
};

const handleCreate = () => {
  router.push({ name: "PelunasanInvoiceForm" });
};

const handleEdit = () => {
  if (!selectedRow.value) return;
  router.push({ name: "PelunasanInvoiceForm", params: { nomor: selectedRow.value.sh_nomor } });
};

const handleRowClick = (_event: Event, { item }: { item: PelunasanHeader }) => {
  selected.value = [item];
};

// ── Export ─────────────────────────────────────────────────
const EXPORT_LIMIT = 5000;
const EXPORT_BATCH = 5; // jumlah request detail paralel
const isExporting = ref(false);

// Ambil SEMUA bukti sesuai filter aktif, bukan hanya halaman yang tampil
const fetchAllHeaders = async (): Promise<PelunasanHeader[]> => {
  const { data } = await api.get("/pelunasan-invoice/history", {
    params: { ...filters, page: 1, itemsPerPage: EXPORT_LIMIT },
  });
  const rows = (data.items as PelunasanHeaderBackend[]).map(toHeader);
  if (rows.length < Number(data.total)) {
    toast.warning(
      `Hanya ${rows.length} dari ${data.total} bukti yang terambil. Persempit periode lalu export lagi.`
    );
  }
  return rows;
};

const exportData = async (type: "header" | "detail") => {
  if (isExporting.value) return;
  isExporting.value = true;

  try {
    const headerRows = await fetchAllHeaders();
    if (headerRows.length === 0) {
      toast.warning("Tidak ada data untuk diekspor.");
      return;
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

    // ── Helper ─────────────────────────────────────────────
    interface ExportCol {
      header: string;
      width: number;
      align: Alignment["horizontal"];
      fmt?: string;
      wrap?: boolean;
    }

    const border = {
      top: { style: "thin" as const },
      left: { style: "thin" as const },
      bottom: { style: "thin" as const },
      right: { style: "thin" as const },
    };

    const fmtTgl = (v: string | null | undefined) => {
      if (!v) return "-";
      try {
        return format(new Date(v), "dd-MM-yyyy");
      } catch {
        return String(v);
      }
    };

    const applyHeader = (cell: Cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB71C1C" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = border;
    };

    const applyTotal = (cell: Cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      cell.border = {
        top: { style: "medium" },
        left: { style: "thin" },
        bottom: { style: "medium" },
        right: { style: "thin" },
      };
    };

    // ══════════════════════════════════════════════════════
    // EXPORT HEADER
    // ══════════════════════════════════════════════════════
    if (type === "header") {
      const sheet = workbook.addWorksheet("Pelunasan Header");

      const cols: ExportCol[] = [
        { header: "Nomor Bukti", width: 22, align: "left" },
        { header: "Tanggal", width: 13, align: "center" },
        { header: "Customer", width: 30, align: "left" },
        { header: "Keterangan", width: 40, align: "left", wrap: true },
        { header: "Metode", width: 12, align: "center" },
        { header: "Total Bayar", width: 18, align: "right", fmt: "#,##0" },
        { header: "User", width: 14, align: "center" },
      ];
      sheet.columns = cols.map((c) => ({ width: c.width }));

      const headerRow = sheet.addRow(cols.map((c) => c.header));
      headerRow.height = 22;
      headerRow.eachCell({ includeEmpty: true }, (cell) => applyHeader(cell));

      let total = 0;
      headerRows.forEach((h) => {
        total += Number(h.total_bayar) || 0;
        const row = sheet.addRow([
          h.sh_nomor,
          fmtTgl(h.sh_tanggal),
          h.cus_nama || "",
          h.sh_ket || "",
          h.jenis_bayar,
          Number(h.total_bayar) || 0,
          h.user_create || "",
        ]);
        row.eachCell({ includeEmpty: true }, (cell, i) => {
          const col = cols[i - 1];
          cell.border = border;
          cell.alignment = {
            horizontal: col.align,
            vertical: "middle",
            wrapText: col.wrap ?? false,
          };
          if (col.fmt) cell.numFmt = col.fmt;
        });
      });

      const totalRow = sheet.addRow([
        `TOTAL (${headerRows.length} bukti)`,
        "",
        "",
        "",
        "",
        total,
        "",
      ]);
      sheet.mergeCells(`A${totalRow.number}:E${totalRow.number}`);
      totalRow.height = 22;
      totalRow.eachCell({ includeEmpty: true }, (cell, i) => {
        applyTotal(cell);
        cell.alignment = { horizontal: i <= 5 ? "left" : "right", vertical: "middle" };
        if (cols[i - 1].fmt) cell.numFmt = cols[i - 1].fmt!;
      });

      sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

      // ══════════════════════════════════════════════════════
      // EXPORT DETAIL (satu baris per invoice yang dilunasi)
      // ══════════════════════════════════════════════════════
    } else {
      toast.info(`Mengambil detail ${headerRows.length} bukti...`);

      // Ambil detail per batch; TIDAK menulis ke cache `details` (format cache beda)
      const detailMap = new Map<string, PelunasanDetailBackend[]>();
      for (let i = 0; i < headerRows.length; i += EXPORT_BATCH) {
        const batch = headerRows.slice(i, i + EXPORT_BATCH);
        const results = await Promise.all(
          batch.map((h) => api.get(`/pelunasan-invoice/detail/${h.sh_nomor}`))
        );
        batch.forEach((h, idx) => {
          detailMap.set(h.sh_nomor, results[idx].data.details as PelunasanDetailBackend[]);
        });
      }

      const sheet = workbook.addWorksheet("Pelunasan Detail");

      const cols: ExportCol[] = [
        { header: "Nomor Bukti", width: 22, align: "left" },
        { header: "Tgl Pelunasan", width: 14, align: "center" },
        { header: "Customer", width: 28, align: "left" },
        { header: "Metode", width: 12, align: "center" },
        { header: "No. Invoice", width: 24, align: "left" },
        { header: "Tgl Invoice", width: 13, align: "center" },
        { header: "Marketplace", width: 18, align: "left" },
        { header: "No. Pesanan", width: 26, align: "left" },
        { header: "Nominal Dilunasi", width: 18, align: "right", fmt: "#,##0" },
      ];
      sheet.columns = cols.map((c) => ({ width: c.width }));

      const headerRow = sheet.addRow(cols.map((c) => c.header));
      headerRow.height = 22;
      headerRow.eachCell({ includeEmpty: true }, (cell) => applyHeader(cell));

      let total = 0;
      let jumlahBaris = 0;
      let toggle = false;

      headerRows.forEach((h) => {
        const list = detailMap.get(h.sh_nomor) ?? [];
        if (list.length === 0) return;

        // Warna selang-seling per bukti
        const bg = toggle ? "FFFDF3F3" : "FFFFFFFF";
        toggle = !toggle;

        list.forEach((d, idx) => {
          total += Number(d.nominal_bayar) || 0;
          jumlahBaris++;

          const row = sheet.addRow([
            h.sh_nomor,
            fmtTgl(h.sh_tanggal),
            h.cus_nama || "",
            h.jenis_bayar,
            d.inv_nomor,
            fmtTgl(d.inv_tanggal),
            d.inv_mp_nama ?? "-",
            d.inv_mp_nomor_pesanan ?? "-",
            Number(d.nominal_bayar) || 0,
          ]);

          row.eachCell({ includeEmpty: true }, (cell, i) => {
            const col = cols[i - 1];
            cell.border = {
              left: { style: "thin" },
              right: { style: "thin" },
              bottom: { style: "thin" },
              top: idx === 0 ? { style: "medium" } : { style: "thin" },
            };
            cell.alignment = { horizontal: col.align, vertical: "middle" };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
            if (col.fmt) cell.numFmt = col.fmt;
          });
        });
      });

      if (jumlahBaris === 0) {
        toast.warning("Tidak ada data detail untuk diekspor.");
        return;
      }

      const totalRow = sheet.addRow([
        `TOTAL (${headerRows.length} bukti, ${jumlahBaris} invoice)`,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        total,
      ]);
      sheet.mergeCells(`A${totalRow.number}:H${totalRow.number}`);
      totalRow.height = 22;
      totalRow.eachCell({ includeEmpty: true }, (cell, i) => {
        applyTotal(cell);
        cell.alignment = { horizontal: i <= 8 ? "left" : "right", vertical: "middle" };
        if (cols[i - 1].fmt) cell.numFmt = cols[i - 1].fmt!;
      });

      sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    }

    // ── Download ───────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Pelunasan_Marketplace_${type === "header" ? "Header" : "Detail"}_${
      filters.startDate
    }_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Export ${type} berhasil!`);
  } catch (error) {
    console.error("Error Export:", error);
    toast.error("Gagal mengekspor data.");
  } finally {
    isExporting.value = false;
  }
};

watch(
  filters,
  () => {
    if (!isLoading.value) fetchData();
  },
  { deep: true }
);

onMounted(() => {
  if (!authStore.can(MENU_ID, "view")) {
    toast.error("Akses ditolak.");
    router.push("/");
    return;
  }
  fetchCabangList();
  fetchData();
});
</script>

<template>
  <PageLayout title="Riwayat Pelunasan Marketplace" icon="mdi-hand-coin">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        prepend-icon="mdi-plus"
        class="btn-primary-red"
        variant="flat"
        @click="handleCreate"
      >
        Buat Pelunasan Baru
      </v-btn>

      <v-btn
        size="small"
        prepend-icon="mdi-pencil"
        variant="tonal"
        class="btn-header-action"
        :disabled="!selectedRow"
        @click="handleEdit"
      >
        Lihat / Ubah
      </v-btn>

      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn
            size="small"
            prepend-icon="mdi-file-excel"
            variant="tonal"
            class="btn-header-action"
            :loading="isExporting"
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

    <div class="browse-content">
      <div class="filter-section">
        <v-text-field
          v-model="filters.startDate"
          type="date"
          label="Dari"
          density="compact"
          variant="outlined"
          hide-details
          class="periode-field"
        />
        <v-text-field
          v-model="filters.endDate"
          type="date"
          label="S/D"
          density="compact"
          variant="outlined"
          hide-details
          class="periode-field"
        />

        <v-divider vertical class="mx-1" style="height: 28px" />

        <v-select
          v-if="isKdc"
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          class="cabang-select"
          :menu-props="{ class: 'pelunasan-filter-menu' }"
        />

        <v-text-field
          v-model="filters.term"
          label="Cari nomor bukti atau customer"
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
          hide-details
          clearable
          class="search-field"
        />

        <v-spacer />

        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          color="primary"
          :loading="isLoading"
          @click="fetchData"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model:expanded="expanded"
          v-model="selected"
          show-select
          single-select
          v-model:page="filters.page"
          v-model:items-per-page="filters.itemsPerPage"
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="isLoading"
          show-expand
          return-object
          fixed-header
          item-value="sh_nomor"
          class="desktop-table header-browse-blue"
          density="compact"
          :item-props="(item: PelunasanHeader) => ({ class: isRowSelected(item) ? 'row-selected' : '' })"
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
        >
          <template #[`body.append`]>
            <tr class="sticky-footer">
              <td colspan="7" class="footer-label">
                Total halaman ini ({{ items.length }} dari {{ totalItems }} bukti)
              </td>
              <td class="footer-amount">{{ formatRupiah(grandTotal) }}</td>
              <td></td>
            </tr>
          </template>

          <template #[`item.sh_tanggal`]="{ item }">
            {{ format(new Date(item.sh_tanggal), "dd-MM-yyyy") }}
          </template>

          <template #[`item.total_bayar`]="{ item }">
            <span class="amount">{{ formatRupiah(item.total_bayar) }}</span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <v-data-table
                      v-if="details[item.sh_nomor]"
                      :headers="detailHeaders"
                      :items="details[item.sh_nomor]"
                      density="compact"
                      class="detail-table"
                      hide-default-footer
                      :items-per-page="-1"
                    >
                      <template #[`item.nominal_bayar`]="{ item: d }">
                        <span class="amount">{{ formatRupiah(d.nominal_bayar) }}</span>
                      </template>
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
/* ══════════════ LAYOUT ══════════════ */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;

  /* Tema merah lokal: komponen Vuetify di dalam halaman ini ikut merah */
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.desktop-table {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.desktop-table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  position: relative; /* agar footer total tetap menempel */
  scrollbar-width: thin;
}

/* ══════════════ TOMBOL HEADER ══════════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover {
  filter: brightness(1.08);
}

.btn-header-action {
  background-color: rgba(183, 28, 28, 0.08) !important;
  color: #b71c1c !important;
  font-weight: 700;
  border: 1px solid rgba(183, 28, 28, 0.2);
}
.btn-header-action:hover:not(:disabled) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.btn-header-action:disabled {
  opacity: 0.4;
}
.btn-primary-red:focus-visible,
.btn-header-action:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}

/* ══════════════ FILTER ══════════════ */
.filter-section {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 12px;
  background-color: rgba(183, 28, 28, 0.03);
  border-bottom: 2px solid rgba(183, 28, 28, 0.15);
}

.filter-section .periode-field {
  flex: 0 0 150px;
}
.filter-section .cabang-select {
  flex: 0 0 190px;
}
.filter-section .search-field {
  flex: 0 1 340px;
  min-width: 220px;
}

.filter-section :deep(.v-divider) {
  border-color: rgba(183, 28, 28, 0.25);
}

.filter-section :deep(.v-label) {
  font-size: 11px !important;
  opacity: 0.8;
}

.filter-section :deep(.v-field__input) {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
  min-height: 32px !important;
}

.filter-section .periode-field :deep(.v-field),
.filter-section .cabang-select :deep(.v-field),
.filter-section .search-field :deep(.v-field) {
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}

.filter-section .periode-field :deep(.v-field__outline),
.filter-section .cabang-select :deep(.v-field__outline),
.filter-section .search-field :deep(.v-field__outline) {
  display: none !important;
}

.filter-section .periode-field :deep(.v-field--focused),
.filter-section .cabang-select :deep(.v-field--focused),
.filter-section .search-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}

.filter-section .search-field :deep(.v-field__prepend-inner .v-icon),
.filter-section .cabang-select :deep(.v-select__menu-icon) {
  color: #b71c1c !important;
  opacity: 1 !important;
}

/* ══════════════ HEADER TABEL ══════════════ */
.desktop-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #8e0000 !important;
}

/* Ikon sort, expand, dan checkbox "pilih semua" harus putih di atas merah */
.desktop-table :deep(thead tr th .v-icon),
.desktop-table :deep(thead tr th .v-data-table-header__sort-icon) {
  color: #ffffff !important;
}

/* ══════════════ BARIS ══════════════ */
.desktop-table :deep(tbody tr:not(.sticky-footer):nth-child(even) > td) {
  background-color: rgba(183, 28, 28, 0.025);
}

.desktop-table :deep(tbody tr:not(.sticky-footer):hover > td) {
  background-color: rgba(183, 28, 28, 0.07);
}

/* Baris terpilih: wajib terlihat, karena Export Detail bergantung pada pilihan */
.desktop-table :deep(tbody tr.row-selected > td) {
  background-color: rgba(183, 28, 28, 0.12) !important;
}
.desktop-table :deep(tbody tr.row-selected > td:first-child) {
  box-shadow: inset 3px 0 0 #b71c1c;
}

.amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.desktop-table :deep(tbody tr:not(.sticky-footer)) {
  cursor: pointer;
}

/* ══════════════ BARIS TOTAL ══════════════ */
.sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 5;
  box-shadow: 0 -3px 6px -4px rgba(0, 0, 0, 0.3);
}

.sticky-footer td {
  height: 48px !important;
  vertical-align: middle;
  background-color: rgb(var(--v-theme-surface)) !important;
  border-top: 2px solid #b71c1c;
  color: rgb(var(--v-theme-on-surface));
}

.sticky-footer .footer-label {
  text-align: right;
  padding-right: 16px;
  font-size: 12px;
  opacity: 0.75;
}

.sticky-footer .footer-amount {
  text-align: right;
  font-size: 14px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* ══════════════ DETAIL (expanded row) ══════════════ */
.detail-container {
  display: flex;
  justify-content: flex-start;
  padding: 16px 16px 16px 64px;
  width: 100%;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-left: 3px solid #b71c1c;
  border-radius: 4px;
}

.detail-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-size: 10px !important;
  height: 32px !important;
  text-transform: uppercase;
}

.detail-table :deep(tbody tr td) {
  font-size: 11px !important;
}

/* ══════════════ PAGINATION ══════════════ */
.desktop-table :deep(.v-data-table-footer) {
  padding: 8px 16px !important;
  border-top: 2px solid rgba(183, 28, 28, 0.15);
  background-color: rgba(183, 28, 28, 0.03);
}

.desktop-table :deep(.v-data-table-footer__items-per-page .v-field) {
  border-radius: 8px;
  background-color: rgba(183, 28, 28, 0.05);
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon) {
  background-color: rgba(183, 28, 28, 0.06);
  border-radius: 8px !important;
  min-width: 32px !important;
  width: 32px;
  height: 32px;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon .v-icon) {
  color: #b71c1c;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover) {
  background-color: #b71c1c;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover .v-icon) {
  color: #ffffff !important;
}

.desktop-table :deep(.v-pagination .v-btn--active) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
}
</style>

<style>
/* Menu dropdown di-teleport ke luar halaman, jadi tidak bisa memakai scoped */
.pelunasan-filter-menu .v-list-item--active {
  background-color: rgba(183, 28, 28, 0.1) !important;
  color: #b71c1c !important;
}
.pelunasan-filter-menu .v-list-item:hover {
  background-color: rgba(183, 28, 28, 0.06) !important;
}
</style>

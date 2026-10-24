<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import AppDataTable from "@/components/AppDataTable.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import { formatRupiah } from "@/utils/formatRupiah";
import type { DataTableHeader } from "vuetify";
import type { AxiosError } from "axios";

// --- Interfaces ---
interface BiayaKirimItem {
  Nomor: string;
  Tanggal: string;
  Invoice: string;
  BiayaKirim: number;
  Bayar: number;
  SisaPiutang: number;
  KdCus: string;
  Customer: string;
  Alamat: string;
  Kota: string;
  Keterangan: string;
  Created: string;
  Closing: string;
}

interface DetailBayar {
  NomorBK: string;
  Tanggal: string;
  Uraian: string;
  Bayar: number;
  Keterangan: string;
}

interface Cabang {
  kode: string;
  nama: string;
}

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = "49"; // Digunakan untuk cek izin akses

// --- State ---
const list = ref<BiayaKirimItem[]>([]);
const details = ref<Record<string, DetailBayar[]>>({});
const isLoading = ref(true);
const selected = ref<BiayaKirimItem[]>([]);
const expanded = ref<BiayaKirimItem[]>([]);
const loadingDetails = ref(new Set<string>());
const isMounted = ref(false);
const cabangList = ref<Cabang[]>([]);
const tableKey = ref(0);

const selectedRow = computed<BiayaKirimItem | null>(() => selected.value[0] ?? null);

// --- Pagination State (default sama dengan AppDataTable: 50) ---
const serverItemsLength = ref(0);
const options = ref({ page: 1, itemsPerPage: 50 });

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  search: "",
});

// --- Headers ---
const headers: DataTableHeader[] = [
  { title: "", key: "data-table-expand", width: "50px", fixed: true },
  { title: "Nomor", key: "Nomor", width: "160px", fixed: true },
  { title: "Tanggal", key: "Tanggal", width: "120px" },
  { title: "No. Invoice", key: "Invoice", width: "160px" },
  { title: "Biaya Kirim", key: "BiayaKirim", width: "130px", align: "end" },
  { title: "Bayar", key: "Bayar", width: "130px", align: "end" },
  { title: "Sisa Piutang", key: "SisaPiutang", width: "130px", align: "end" },
  { title: "Kd Cust", key: "KdCus", width: "110px" },
  { title: "Nama Customer", key: "Customer", width: "250px" },
  { title: "Closing", key: "Closing", width: "90px", align: "center" },
];

const detailHeaders: DataTableHeader[] = [
  { title: "Nomor BK", key: "NomorBK", width: "150px" },
  { title: "Tanggal", key: "Tanggal", width: "150px" },
  { title: "Uraian", key: "Uraian", width: "200px" },
  { title: "Bayar", key: "Bayar", align: "end", width: "130px" },
  { title: "Keterangan", key: "Keterangan" },
];

// --- Methods ---
const handleRowClick = (event: Event, { item }: { item: BiayaKirimItem }) => {
  // Klik pada checkbox / tombol expand punya aksinya sendiri, jangan ikut mengubah seleksi
  const target = event.target as HTMLElement | null;
  if (target?.closest(".v-selection-control, .v-btn")) return;

  selected.value = selectedRow.value?.Nomor === item.Nomor ? [] : [item];
};

// Penanda baris terpilih (kelas .row-selected diwarnai di CSS)
const rowProps = ({ item }: { item: BiayaKirimItem }) =>
  selectedRow.value?.Nomor === item.Nomor ? { class: "row-selected" } : {};

const fetchData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get("/biaya-kirim", {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang: filters.cabang,
        search: filters.search,
        page: options.value.page,
        limit: options.value.itemsPerPage,
      },
    });
    // Backend mengembalikan { items, total }
    list.value = response.data.items || response.data;
    serverItemsLength.value = response.data.total ?? list.value.length;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data biaya kirim.");
  } finally {
    isLoading.value = false;
  }
};

// AppDataTable menyimpan page-nya sendiri dan tidak bisa diatur dari luar.
// Kalau sedang bukan di halaman 1, remount (key) supaya kembali ke halaman 1.
const reloadFromFirstPage = () => {
  if (options.value.page !== 1) {
    options.value = { page: 1, itemsPerPage: 50 };
    expanded.value = [];
    tableKey.value++;
  }
  fetchData();
};

// Dipanggil AppDataTable saat user ganti halaman / jumlah baris
const onOptionsUpdate = (opt: { page: number; itemsPerPage: number }) => {
  options.value = { page: opt.page, itemsPerPage: opt.itemsPerPage };
  fetchData();
};

const loadDetails = async (rows: BiayaKirimItem[]) => {
  for (const row of rows) {
    const key = row.Nomor;
    // Lewati jika sudah ada data atau sedang dimuat
    if (details.value[key] || loadingDetails.value.has(key)) continue;

    loadingDetails.value.add(key);
    try {
      const response = await api.get(`/biaya-kirim/details/${key}`);
      details.value[key] = response.data;
    } catch (error) {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message || `Gagal memuat detail untuk ${key}`);
    } finally {
      loadingDetails.value.delete(key);
    }
  }
};

// Penggunaan MENU_ID untuk keamanan tombol
const canCreate = computed(() => authStore.can(MENU_ID, "insert"));
const canEdit = computed(() => authStore.can(MENU_ID, "edit"));
const canDelete = computed(() => authStore.can(MENU_ID, "delete"));

// --- Watchers ---
let searchTimeout: ReturnType<typeof setTimeout>;
watch(
  () => filters.search,
  () => {
    if (!isMounted.value) return;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(reloadFromFirstPage, 500);
  }
);

watch([() => filters.startDate, () => filters.endDate, () => filters.cabang], () => {
  if (isMounted.value) reloadFromFirstPage();
});

onMounted(async () => {
  if (!authStore.can(MENU_ID, "view")) {
    toast.error("Anda tidak memiliki hak akses ke halaman ini.");
    router.replace("/");
    return;
  }

  try {
    const resCab = await api.get("/so/lookup/cabang");
    // Endpoint sudah bisa mengembalikan "ALL"; buang dulu agar tidak dobel
    const daftar = (resCab.data as Cabang[]).filter((c) => c.kode !== "ALL");
    cabangList.value =
      authStore.user?.cabang === "KDC"
        ? [{ kode: "ALL", nama: "Semua Cabang" }, ...daftar]
        : daftar;
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }

  await fetchData();
  isMounted.value = true;
});
</script>

<template>
  <PageLayout title="Biaya Kirim" desktop-mode icon="mdi-truck-delivery">
    <template #header-actions>
      <v-btn
        v-if="canCreate"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-plus"
        to="/transaksi/penjualan/biaya-kirim/baru"
        >Baru</v-btn
      >
      <v-btn
        v-if="canEdit"
        size="small"
        variant="tonal"
        class="btn-header-action"
        :disabled="!selectedRow"
        prepend-icon="mdi-pencil"
        @click="router.push(`/transaksi/penjualan/biaya-kirim/edit/${selectedRow?.Nomor}`)"
      >
        Ubah
      </v-btn>
      <v-btn
        v-if="canDelete"
        size="small"
        variant="tonal"
        class="btn-header-action"
        :disabled="!selectedRow"
        prepend-icon="mdi-delete-outline"
      >
        Hapus
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
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
        <v-select
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          class="cabang-select"
          :menu-props="{ class: 'bk-filter-menu' }"
        />
        <v-text-field
          v-model="filters.search"
          label="Cari no. BK, invoice, atau customer..."
          density="compact"
          hide-details
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
          clearable
          class="search-field"
        />
        <v-spacer />
        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          class="btn-refresh"
          :loading="isLoading"
          title="Muat ulang data"
          @click="fetchData"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          :key="tableKey"
          v-model="selected"
          v-model:expanded="expanded"
          server
          :items-length="serverItemsLength"
          :headers="headers"
          :items="list"
          :loading="isLoading"
          item-value="Nomor"
          select-strategy="single"
          return-object
          show-select
          show-expand
          hover
          density="compact"
          class="desktop-table"
          fixed-header
          :row-props="rowProps"
          @update:options="onOptionsUpdate"
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
        >
          <template #[`item.Tanggal`]="{ item }">
            {{ item.Tanggal ? format(parseISO(item.Tanggal), "dd/MM/yyyy") : "-" }}
          </template>

          <template #[`item.BiayaKirim`]="{ value }">
            <span class="amount">{{ formatRupiah(value) }}</span>
          </template>
          <template #[`item.Bayar`]="{ value }">
            <span class="amount">{{ formatRupiah(value) }}</span>
          </template>
          <template #[`item.SisaPiutang`]="{ value }">
            <span class="amount" :class="{ 'sisa-ada': value !== 0 }">{{
              formatRupiah(value)
            }}</span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div class="detail-title">
                      <v-icon size="small">mdi-history</v-icon>
                      Detail pembayaran biaya kirim
                    </div>

                    <v-data-table
                      :headers="detailHeaders"
                      :items="details[item.Nomor] || []"
                      :loading="loadingDetails.has(item.Nomor)"
                      density="compact"
                      hide-default-footer
                      class="table-detail-bk"
                    >
                      <template v-slot:[`item.Tanggal`]="{ value }">
                        {{ value ? format(parseISO(value), "dd/MM/yyyy HH:mm") : "-" }}
                      </template>

                      <template v-slot:[`item.Bayar`]="{ value }">
                        <span class="amount">{{ formatRupiah(value) }}</span>
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
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 110px);

  /* Tema merah lokal (DESIGN.md 10.3) */
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
}

/* ══════════ TOMBOL HEADER ══════════ */
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

/* ══════════ FILTER ══════════ */
.filter-section {
  flex-shrink: 0;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: rgba(183, 28, 28, 0.03);
  border-bottom: 2px solid rgba(183, 28, 28, 0.15);
}
.filter-label,
.filter-sep {
  font-size: 12px;
  font-weight: 600;
  color: #b71c1c;
}
.filter-sep {
  font-size: 11px;
}

.filter-section .periode-field {
  flex: none;
  width: 150px;
}
.filter-section .cabang-select {
  flex: none;
  width: 190px;
  margin-left: 8px;
}
.filter-section .search-field {
  flex: none;
  width: 280px;
}

.filter-section .periode-field :deep(.v-field),
.filter-section .cabang-select :deep(.v-field),
.filter-section .search-field :deep(.v-field) {
  width: 100%;
  font-size: 11px;
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
  opacity: 0.8 !important;
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
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
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

.desktop-table :deep(td) {
  font-size: 11px !important;
  white-space: nowrap;
  cursor: pointer; /* Memberi isyarat visual baris bisa diklik */
}

/* Tint baris memakai background-image (bukan background-color) karena kolom
   Nomor dan expand bersifat sticky: latar opaque bawaan harus tetap ada agar
   isi yang digulir tidak tembus di bawahnya. */
.desktop-table :deep(tbody tr:nth-child(even) > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.03), rgba(183, 28, 28, 0.03));
}
.desktop-table :deep(tbody tr:hover > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.08), rgba(183, 28, 28, 0.08));
}
.desktop-table :deep(tr.row-selected > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.14), rgba(183, 28, 28, 0.14)) !important;
  font-weight: 700;
}

.amount {
  font-variant-numeric: tabular-nums;
}
/* Sisa piutang: amber, bukan merah, supaya tidak menyaingi warna tema */
.sisa-ada {
  color: #b26a00;
  font-weight: 700;
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
  padding: 16px 16px 16px 64px;
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

.detail-title {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  color: #b71c1c;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
}

.table-detail-bk :deep(table) {
  font-size: 11px !important;
}
.table-detail-bk :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
}
.table-detail-bk :deep(td) {
  cursor: default;
}
.table-detail-bk :deep(tbody tr > td) {
  background-image: none !important;
  font-weight: 400;
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

<style>
/* Menu dropdown di-teleport ke luar halaman, jadi tidak bisa memakai scoped */
.bk-filter-menu .v-list-item--active {
  background-color: rgba(183, 28, 28, 0.1) !important;
  color: #b71c1c !important;
}
.bk-filter-menu .v-list-item:hover {
  background-color: rgba(183, 28, 28, 0.06) !important;
}
</style>

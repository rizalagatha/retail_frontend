<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO, startOfMonth } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

interface KomplainHeader {
  cmp_nomor: string;
  cmp_tanggal: string;
  cus_nama: string;
  cmp_ref_nomor: string;
  cmp_ref_jenis: string;
  cmp_kategori: string;
  cmp_status: string;
  [key: string]: unknown; // Jika ada field lain dari backend
}

interface KomplainDetail {
  cmpd_id: number;
  kode_barang: string;
  nama_barang: string;
  ukuran: string;
  qty: number | string;
  keterangan: string;
  [key: string]: unknown;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "60";

const items = ref<KomplainHeader[]>([]);
const totalItems = ref(0);
const loading = ref(true);

const selected = ref<KomplainHeader[]>([]);
const expanded = ref<KomplainHeader[]>([]);
const tableKey = ref(0);
const expandedData = ref<Record<string, KomplainDetail[]>>({});
const loadingExpand = ref<Record<string, boolean>>({});

// Data list cabang (Sama seperti SoView)
interface CabangOption {
  kode: string;
  nama: string;
}
const cabangList = ref<CabangOption[]>([]);

const isKDC = computed(() => authStore.user?.cabang === "KDC");

const filters = reactive({
  search: "",
  status: "ALL",
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  // [BARU] Tambahkan default Tanggal (Dari awal bulan s/d hari ini)
  startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
});

const options = ref({
  page: 1,
  itemsPerPage: 50,
});

const statusOptions = [
  { title: "Semua Status", value: "ALL" },
  { title: "Draft", value: "DRAFT" },
  { title: "Submitted", value: "SUBMITTED" },
  { title: "On Review", value: "ON_REVIEW" },
  { title: "Resolved", value: "RESOLVED" },
  { title: "Rejected", value: "REJECTED" },
];

const headers = [
  { title: "", key: "data-table-expand", width: 50, sortable: false },
  { title: "No. Komplain", key: "cmp_nomor", width: "160px" },
  { title: "Tanggal", key: "cmp_tanggal", width: "100px" },
  { title: "Customer", key: "cus_nama", width: "200px" },
  { title: "Referensi", key: "cmp_ref_nomor", width: "160px" },
  { title: "Kategori", key: "cmp_kategori", width: "150px" },
  { title: "Status", key: "cmp_status", align: "center", width: "120px" },
] as const;

// Tarik daftar cabang untuk dropdown KDC
const fetchCabangList = async () => {
  if (!isKDC.value) return; // Toko tidak butuh list cabang
  try {
    const response = await api.get("/so/lookup/cabang"); // Memanfaatkan endpoint yang sudah ada
    cabangList.value = response.data;
    const hasAll = cabangList.value.some((c) => c.kode === "ALL");
    if (!hasAll) {
      cabangList.value.unshift({ kode: "ALL", nama: "Semua Cabang" });
    }
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const loadItems = async () => {
  loading.value = true;
  selected.value = [];
  try {
    const response = await api.get("/komplain", {
      params: {
        term: filters.search,
        status: filters.status,
        cabang: filters.cabang,
        // [BARU] Kirim parameter tanggal ke backend
        startDate: filters.startDate,
        endDate: filters.endDate,
        page: options.value.page,
        itemsPerPage: options.value.itemsPerPage,
      },
    });
    items.value = response.data.items || [];
    totalItems.value = response.data.total || 0;
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data komplain.");
  } finally {
    loading.value = false;
  }
};

const handleExpand = async (newExpanded: KomplainHeader[]) => {
  const newItems = newExpanded.filter((row) => !expandedData.value[row.cmp_nomor]);

  for (const row of newItems) {
    const nomor = row.cmp_nomor;
    loadingExpand.value[nomor] = true;
    try {
      const response = await api.get(`/komplain-form/${nomor}`);
      expandedData.value[nomor] = response.data.details;
    } catch (error: unknown) {
      const err = error as AxiosError<{ message?: string }>;

      toast.error(err.response?.data?.message || `Gagal memuat detail barang untuk ${nomor}`);

      expandedData.value[nomor] = [];
    } finally {
      loadingExpand.value[nomor] = false;
    }
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "DRAFT":
      return "grey";
    case "SUBMITTED":
      return "info";
    case "ON_REVIEW":
      return "warning";
    case "RESOLVED":
      return "success";
    case "REJECTED":
      return "error";
    default:
      return "grey-lighten-1";
  }
};

const handleRowClick = (event: Event, { item }: { item: KomplainHeader }) => {
  // Klik pada checkbox / tombol expand punya aksinya sendiri, jangan ikut mengubah seleksi
  const target = event.target as HTMLElement | null;
  if (target?.closest(".v-selection-control, .v-btn")) return;

  if (selected.value[0]?.cmp_nomor === item.cmp_nomor) {
    selected.value = [];
  } else {
    selected.value = [item];
  }
};

const handleCreate = () => {
  router.push({ name: "KomplainCustomerCreate" });
};

const handleEditSelected = () => {
  if (selected.value.length === 0) return toast.warning("Pilih data terlebih dahulu.");
  const nomor = selected.value[0].cmp_nomor;
  router.push({ name: "KomplainCustomerEdit", params: { nomor } });
};

const printData = () => {
  if (selected.value.length === 0) return toast.warning("Pilih data komplain terlebih dahulu.");
  const nomor = selected.value[0].cmp_nomor;
  const url = router.resolve({ name: "KomplainCustomerPrint", params: { nomor } }).href;
  window.open(url, "_blank");
};

// AppDataTable menyimpan page-nya sendiri dan tidak bisa diatur dari luar.
// Kalau sedang bukan di halaman 1, remount (key) supaya kembali ke halaman 1.
const reloadFromFirstPage = () => {
  if (options.value.page !== 1) {
    options.value = { page: 1, itemsPerPage: 50 };
    expanded.value = [];
    tableKey.value++;
  }
  loadItems();
};

// Dipanggil AppDataTable saat user ganti halaman / jumlah baris
const onOptionsUpdate = (opt: { page: number; itemsPerPage: number }) => {
  options.value = { page: opt.page, itemsPerPage: opt.itemsPerPage };
  loadItems();
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(
  () => filters.search,
  () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(reloadFromFirstPage, 500);
  }
);

watch(
  [() => filters.status, () => filters.cabang, () => filters.startDate, () => filters.endDate],
  reloadFromFirstPage
);

onMounted(async () => {
  if (!authStore.can(MENU_ID, "view")) {
    toast.error("Anda tidak memiliki hak akses ke halaman ini.");
    router.replace("/");
    return;
  }
  await fetchCabangList();
  loadItems();
});
</script>

<template>
  <PageLayout title="Daftar Komplain Customer" icon="mdi-comment-alert-outline">
    <template #header-actions>
      <v-btn
        v-if="!isKDC && authStore.can(MENU_ID, 'insert')"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-plus"
        @click="handleCreate"
      >
        Buat komplain baru
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit') || authStore.can(MENU_ID, 'view')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-pencil"
        :disabled="selected.length === 0"
        @click="handleEditSelected"
      >
        Lihat / proses
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-printer"
        :disabled="selected.length === 0"
        @click="printData"
      >
        Cetak
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
        <v-text-field
          v-model="filters.search"
          label="Cari no. komplain, customer, atau ref..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          class="search-field"
        />
        <v-select
          v-if="isKDC"
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          variant="outlined"
          density="compact"
          hide-details
          class="cabang-select"
          :menu-props="{ class: 'komplain-filter-menu' }"
        />
        <v-select
          v-model="filters.status"
          :items="statusOptions"
          label="Status"
          variant="outlined"
          density="compact"
          hide-details
          class="status-select"
          :menu-props="{ class: 'komplain-filter-menu' }"
        />
        <v-spacer />
        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          class="btn-refresh"
          :loading="loading"
          title="Muat ulang data"
          @click="loadItems"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          :key="tableKey"
          v-model="selected"
          v-model:expanded="expanded"
          server
          :items-length="totalItems"
          :headers="headers"
          :items="items"
          :loading="loading"
          item-value="cmp_nomor"
          select-strategy="single"
          return-object
          show-select
          show-expand
          hover
          class="desktop-table"
          density="compact"
          fixed-header
          @update:options="onOptionsUpdate"
          @update:expanded="handleExpand"
          @click:row="handleRowClick"
        >
          <template #[`item.cmp_tanggal`]="{ item }">
            {{ item.cmp_tanggal ? format(parseISO(item.cmp_tanggal), "dd/MM/yyyy") : "" }}
          </template>

          <template #[`item.cmp_ref_nomor`]="{ item }">
            <div class="font-weight-medium">{{ item.cmp_ref_nomor }}</div>
            <div class="text-caption text-grey">{{ item.cmp_ref_jenis }}</div>
          </template>

          <template #[`item.cmp_status`]="{ item }">
            <v-chip
              :color="getStatusColor(item.cmp_status)"
              size="x-small"
              variant="flat"
              class="font-weight-bold text-uppercase"
            >
              {{ item.cmp_status.replace("_", " ") }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingExpand[item.cmp_nomor]" class="text-center pa-4">
                      <v-progress-circular indeterminate size="24" color="primary" />
                      <span class="ml-2 text-caption">Memuat detail barang...</span>
                    </div>
                    <v-table v-else density="compact" class="detail-table">
                      <thead>
                        <tr>
                          <th class="text-left">Kode barang</th>
                          <th class="text-left">Nama barang</th>
                          <th class="text-center">Ukuran</th>
                          <th class="text-right">Qty masalah</th>
                          <th class="text-left">Kendala</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="dtl in expandedData[item.cmp_nomor]" :key="dtl.cmpd_id">
                          <td>{{ dtl.kode_barang }}</td>
                          <td>{{ dtl.nama_barang }}</td>
                          <td class="text-center">{{ dtl.ukuran }}</td>
                          <td class="text-right qty-masalah">{{ dtl.qty }}</td>
                          <td>{{ dtl.keterangan || "-" }}</td>
                        </tr>
                        <tr v-if="!expandedData[item.cmp_nomor]?.length">
                          <td colspan="5" class="text-center text-grey text-caption pa-2">
                            Tidak ada detail barang
                          </td>
                        </tr>
                      </tbody>
                    </v-table>
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
  height: calc(100vh - 64px - 32px);
  overflow: hidden;

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

.filter-label {
  font-size: 12px;
  font-weight: 600;
  color: #b71c1c;
}
.filter-sep {
  font-size: 11px;
  font-weight: 600;
  color: #b71c1c;
}

.filter-section .periode-field {
  flex: none;
  width: 150px;
}
.filter-section .search-field {
  flex: none;
  width: 270px;
  margin-left: 8px;
}
.filter-section .cabang-select {
  flex: none;
  width: 190px;
}
.filter-section .status-select {
  flex: none;
  width: 160px;
}

.filter-section .periode-field :deep(.v-field),
.filter-section .search-field :deep(.v-field),
.filter-section .cabang-select :deep(.v-field),
.filter-section .status-select :deep(.v-field) {
  width: 100%;
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}

.filter-section .periode-field :deep(.v-field__outline),
.filter-section .search-field :deep(.v-field__outline),
.filter-section .cabang-select :deep(.v-field__outline),
.filter-section .status-select :deep(.v-field__outline) {
  display: none !important;
}

.filter-section .periode-field :deep(.v-field--focused),
.filter-section .search-field :deep(.v-field--focused),
.filter-section .cabang-select :deep(.v-field--focused),
.filter-section .status-select :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.07) !important;
}

.filter-section .search-field :deep(.v-field__prepend-inner .v-icon),
.filter-section .cabang-select :deep(.v-select__menu-icon),
.filter-section .status-select :deep(.v-select__menu-icon) {
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
  padding: 0 8px !important;
  height: 36px !important;
  white-space: nowrap;
  cursor: pointer; /* Memberi isyarat visual baris bisa diklik */
}

.desktop-table :deep(th.v-data-table__th--select-row),
.desktop-table :deep(td.v-data-table__td--select-row) {
  width: 44px;
  padding: 0 4px !important;
}

.desktop-table :deep(tbody tr:nth-child(even) > td) {
  background-color: rgba(183, 28, 28, 0.025);
}
.desktop-table :deep(tbody tr:hover > td) {
  background-color: rgba(183, 28, 28, 0.07);
}

/* Baris terpilih */
.desktop-table :deep(tr.v-data-table__selected > td),
.desktop-table :deep(tr.v-data-table__tr--selected > td) {
  background-color: rgba(183, 28, 28, 0.12) !important;
}

/* ══════════ DETAIL (EXPAND) ══════════ */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;

  display: flex;
  justify-content: flex-start;
  align-items: flex-start;

  background-color: rgba(183, 28, 28, 0.02);
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

.detail-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
}
.detail-table :deep(tbody td) {
  font-size: 11px !important;
}

/* Qty masalah: amber, bukan merah, supaya tidak menyaingi warna tema */
.qty-masalah {
  color: #b26a00;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
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
.komplain-filter-menu .v-list-item--active {
  background-color: rgba(183, 28, 28, 0.1) !important;
  color: #b71c1c !important;
}
.komplain-filter-menu .v-list-item:hover {
  background-color: rgba(183, 28, 28, 0.06) !important;
}
</style>

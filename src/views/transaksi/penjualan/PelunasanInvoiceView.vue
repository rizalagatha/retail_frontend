<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import { format } from "date-fns";
import * as XLSX from "xlsx";

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

interface DetailExportRow {
  "Nomor Bukti": string;
  "Tanggal Pelunasan": string;
  Customer: string;
  "No Invoice": string;
  Marketplace: string;
  "No Pesanan": string;
  "Nominal Dilunasi": number;
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
const isSingleSelected = computed(() => selected.value.length === 1);

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
    const response = await api.get("/minta-barang/lookup/cabang"); // Re-use lookup cabang yang sudah ada
    cabangList.value = [{ kode: "ALL", nama: "SEMUA CABANG" }, ...response.data];
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const { data } = await api.get("/pelunasan-invoice/history", { params: filters });
    items.value = (data.items as PelunasanHeaderBackend[]).map((item) => ({
      ...item,
      jenis_bayar: item.sh_jenis === 1 ? "TRANSFER" : item.sh_jenis === 2 ? "GIRO" : "TUNAI",
    })) as PelunasanHeader[];
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
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  router.push({ name: "PelunasanInvoiceForm", params: { nomor: item.sh_nomor } });
};

const exportData = async (type: "header" | "detail") => {
  if (type === "header") {
    if (items.value.length === 0) return toast.warning("Tidak ada data header.");
    const dataToExport = items.value.map((i) => ({
      "Nomor Bukti": i.sh_nomor,
      Tanggal: format(new Date(i.sh_tanggal), "dd-MM-yyyy"),
      Customer: i.cus_nama,
      Keterangan: i.sh_ket,
      Metode: i.jenis_bayar,
      "Total Bayar": i.total_bayar,
      User: i.user_create,
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pelunasan Header");
    XLSX.writeFile(workbook, "Pelunasan_Marketplace_Header.xlsx");
  } else if (type === "detail") {
    if (selected.value.length === 0)
      return toast.warning("Pilih minimal satu data untuk export detail.");
    try {
      const detailExport: DetailExportRow[] = [];
      for (const header of selected.value) {
        let detailItems: PelunasanDetail[] = details.value[header.sh_nomor];
        if (!detailItems) {
          const res = await api.get(`/pelunasan-invoice/detail/${header.sh_nomor}`);
          detailItems = res.data.details;
          details.value[header.sh_nomor] = detailItems;
        }
        detailItems.forEach((d: PelunasanDetail) => {
          detailExport.push({
            "Nomor Bukti": header.sh_nomor,
            "Tanggal Pelunasan": format(new Date(header.sh_tanggal), "dd-MM-yyyy"),
            Customer: header.cus_nama,
            "No Invoice": d.inv_nomor,
            Marketplace: d.inv_mp_nama,
            "No Pesanan": d.inv_mp_nomor_pesanan,
            "Nominal Dilunasi": d.nominal_bayar,
          });
        });
      }
      const worksheet = XLSX.utils.json_to_sheet(detailExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pelunasan Detail");
      XLSX.writeFile(workbook, "Pelunasan_Marketplace_Detail.xlsx");
    } catch {
      toast.error("Gagal mengekspor data detail.");
    }
  }
};

const handleRowClick = (event: Event, { item }: { item: PelunasanHeader }) => {
  const index = selected.value.findIndex((s: PelunasanHeader) => s.sh_nomor === item.sh_nomor);

  if (index === -1) {
    selected.value.push(item);
  } else {
    selected.value.splice(index, 1);
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
        color="primary"
        size="small"
        prepend-icon="mdi-plus"
        @click="handleCreate"
      >
        Buat Pelunasan Baru
      </v-btn>

      <v-btn
        size="small"
        prepend-icon="mdi-pencil"
        :disabled="!isSingleSelected"
        @click="handleEdit"
      >
        Lihat / Ubah
      </v-btn>

      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Header (Semua)</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')" :disabled="selected.length === 0">
            <v-list-item-title>Export Detail (Terpilih)</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section d-flex align-center flex-wrap ga-2 px-3 py-2 border-bottom">
        <v-text-field
          v-model="filters.startDate"
          type="date"
          label="Dari"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 145px"
        />
        <v-text-field
          v-model="filters.endDate"
          type="date"
          label="S/D"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 145px"
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
          style="max-width: 180px"
        />

        <v-text-field
          v-model="filters.term"
          label="Cari Nomor Bukti / Customer..."
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
          hide-details
          clearable
          style="max-width: 300px"
        />

        <v-spacer />

        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          color="grey-darken-1"
          @click="fetchData"
          :loading="isLoading"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          v-model:page="filters.page"
          v-model:items-per-page="filters.itemsPerPage"
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="isLoading"
          show-select
          show-expand
          return-object
          item-value="sh_nomor"
          class="desktop-table elevation-1 header-browse-blue"
          density="compact"
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
        >
          <template #[`body.append`]>
            <tr class="sticky-footer bg-grey-lighten-4">
              <td colspan="7" class="text-right font-weight-bold text-grey-darken-3 pr-4">
                GRAND TOTAL :
              </td>
              <td class="text-right font-weight-black text-primary text-body-2">
                {{ formatRupiah(grandTotal) }}
              </td>
              <td></td>
            </tr>
          </template>
          <template #[`item.sh_tanggal`]="{ item }">
            {{ format(new Date(item.sh_tanggal), "dd-MM-yyyy") }}
          </template>

          <template #[`item.total_bayar`]="{ item }">
            <span class="font-weight-bold text-primary">{{ formatRupiah(item.total_bayar) }}</span>
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
                        {{ formatRupiah(d.nominal_bayar) }}
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
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  background-color: rgb(var(--v-theme-surface));
  /* Kurangi padding agar lebih rapat secara vertikal */
  padding: 6px 12px !important;
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

.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section:deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
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
  /* ⭐ WAJIB */
}

.desktop-table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  /* ⭐ BUKAN height */
  min-height: 0;
  /* ⭐ WAJIB */
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
  /* agar sticky footer tetap jalan */
  scrollbar-width: thin;
}

/* Header Tabel Utama */
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
}

/* Detail Row Styling (Rata Kiri) */
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
  border-radius: 4px;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-size: 10px !important;
  height: 32px !important;
  text-transform: uppercase;
}

.detail-table :deep(tbody tr td) {
  font-size: 11px !important;
}

.sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 5;

  background-color: rgb(var(--v-theme-surface)) !important;
  border-top: 2px solid rgba(var(--v-theme-on-surface), 0.12);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.35);
}

.sticky-footer td {
  background-color: rgb(var(--v-theme-surface)) !important;
  font-size: 12px !important;
  height: 48px !important;
  color: rgb(var(--v-theme-on-surface));
}
</style>

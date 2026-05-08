<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import { formatRupiah } from "@/utils/formatRupiah";
import type { DataTableHeader } from "vuetify"; // Import tipe header resmi

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
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());
const isMounted = ref(false);
const cabangList = ref<Cabang[]>([]);
const selectedRow = ref<BiayaKirimItem | null>(null);

// --- Pagination State ---
const serverItemsLength = ref(0);
const options = reactive({
  page: 1,
  itemsPerPage: 10,
  sortBy: [] as { key: string; order: string }[],
});

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  search: "", // <--- TAMBAHAN STATE SEARCH
});

// Timeout untuk debounce search
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

// --- Headers dengan Tipe Data Strict ---
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
const handleRowClick = (_event: MouseEvent, { item }: { item: BiayaKirimItem }) => {
  // Jika baris yang sama diklik lagi, hapus seleksi (toggle)
  if (selectedRow.value?.Nomor === item.Nomor) {
    selectedRow.value = null;
  } else {
    selectedRow.value = item;
  }
};

// --- Fungsi pendukung untuk styling baris yang terpilih ---
const rowProps = (data: { item: BiayaKirimItem }) => {
  if (selectedRow.value && data.item.Nomor === selectedRow.value.Nomor) {
    return { class: "bg-blue-lighten-4 selected-row-active" };
  }
  return {};
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/biaya-kirim", {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang: filters.cabang,
        search: filters.search, // <-- Kirim param search
        page: options.page,
        limit: options.itemsPerPage,
      },
    });
    // Backend harus mengembalikan { items, total } untuk pagination
    list.value = response.data.items || response.data;
    serverItemsLength.value = response.data.total || response.data.length;
  } finally {
    isLoading.value = false;
  }
};

const onSearchInput = () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    options.page = 1; // Jika mencari sesuatu, kembali ke halaman 1
    fetchData();
  }, 500); // 500ms delay debounce
};

// Fix "Unexpected any" pada newlyExpandedItems
const loadDetails = async (expandedKeys: string[]) => {
  // Ambil key (Nomor BK) terbaru yang di-expand
  const lastKey = expandedKeys[expandedKeys.length - 1];

  // Validasi: Jika key kosong, atau sudah ada data, atau sedang loading, batalkan.
  if (!lastKey || details.value[lastKey] || loadingDetails.value.has(lastKey)) return;

  loadingDetails.value.add(lastKey);

  try {
    const response = await api.get(`/biaya-kirim/details/${lastKey}`);
    // Simpan data detail menggunakan key Nomor BK
    details.value[lastKey] = response.data;
  } catch (error) {
    console.error("Gagal load detail:", error);
    toast.error(`Gagal memuat detail untuk ${lastKey}`);
  } finally {
    loadingDetails.value.delete(lastKey);
  }
};

// Penggunaan MENU_ID untuk keamanan tombol
const canCreate = computed(() => authStore.can(MENU_ID, "insert"));
const canEdit = computed(() => authStore.can(MENU_ID, "edit"));
const canDelete = computed(() => authStore.can(MENU_ID, "delete"));

onMounted(async () => {
  const resCab = await api.get("/so/lookup/cabang");
  cabangList.value = resCab.data;
  if (authStore.user?.cabang === "KDC")
    cabangList.value.unshift({ kode: "ALL", nama: "Semua Cabang" });
  await fetchData();
  isMounted.value = true;
});

// Watch pagination & filters untuk fetch ulang data
watch(
  () => [options.page, options.itemsPerPage],
  () => {
    if (isMounted.value) fetchData();
  }
);
watch(
  () => [filters.startDate, filters.endDate, filters.cabang], // Pisahkan watcher agar input 'search' tidak tumpang tindih
  () => {
    if (isMounted.value) {
      options.page = 1;
      fetchData();
    }
  }
);
</script>

<template>
  <PageLayout title="Biaya Kirim" desktop-mode icon="mdi-truck-delivery">
    <template #header-actions>
      <v-btn
        v-if="canCreate"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        to="/transaksi/penjualan/biaya-kirim/baru"
        >Baru</v-btn
      >
      <v-btn
        v-if="canEdit"
        size="small"
        :disabled="!selectedRow"
        prepend-icon="mdi-pencil"
        @click="router.push(`/transaksi/penjualan/biaya-kirim/edit/${selectedRow?.Nomor}`)"
      >
        Ubah
      </v-btn>
      <v-btn
        v-if="canDelete"
        size="small"
        color="error"
        :disabled="!selectedRow"
        prepend-icon="mdi-delete"
      >
        Hapus
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section px-2">
        <div class="d-flex align-center ga-1 w-100 flex-wrap">
          <v-text-field
            v-model="filters.startDate"
            type="date"
            label="Dari"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 140px"
          />
          <v-text-field
            v-model="filters.endDate"
            type="date"
            label="S/D"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 140px"
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
            style="max-width: 150px"
          />

          <v-text-field
            v-model="filters.search"
            label="Cari No BK / Invoice / Customer..."
            density="compact"
            hide-details
            variant="outlined"
            prepend-inner-icon="mdi-magnify"
            clearable
            style="max-width: 300px; margin-left: 8px"
            @input="onSearchInput"
            @click:clear="onSearchInput"
          />

          <v-spacer />
          <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" />
        </div>
      </div>

      <div class="table-container">
        <v-data-table-server
          v-model:expanded="expanded"
          v-model:page="options.page"
          v-model:items-per-page="options.itemsPerPage"
          :headers="headers"
          :items="list"
          :items-length="serverItemsLength"
          :loading="isLoading"
          item-value="Nomor"
          density="compact"
          class="desktop-table header-browse-blue custom-grid-11"
          fixed-header
          show-expand
          :row-props="rowProps"
          @click:row="handleRowClick"
          @update:expanded="loadDetails"
        >
          <template #[`item.Tanggal`]="{ item }">
            {{ format(parseISO(item.Tanggal), "dd/MM/yyyy") }}
          </template>

          <template #[`item.BiayaKirim`]="{ value }">{{ formatRupiah(value) }}</template>
          <template #[`item.Bayar`]="{ value }">{{ formatRupiah(value) }}</template>
          <template #[`item.SisaPiutang`]="{ value }">
            <span :class="value !== 0 ? 'bg-red text-white px-2 rounded' : ''">{{
              formatRupiah(value)
            }}</span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0 bg-blue-lighten-5">
                <div class="py-4 px-12">
                  <h4 class="mb-2 text-primary detail-title">
                    <v-icon size="small">mdi-history</v-icon> Detail Pembayaran Biaya Kirim
                  </h4>

                  <v-data-table
                    :headers="detailHeaders"
                    :items="details[item.Nomor] || []"
                    :loading="loadingDetails.has(item.Nomor)"
                    density="compact"
                    hide-default-footer
                    class="table-detail-bk border"
                  >
                    <template v-slot:[`item.Tanggal`]="{ value }">
                      {{ value ? format(parseISO(value), "dd/MM/yyyy HH:mm") : "-" }}
                    </template>

                    <template v-slot:[`item.Bayar`]="{ value }">
                      {{ formatRupiah(value) }}
                    </template>
                  </v-data-table>
                </div>
              </td>
            </tr>
          </template>
        </v-data-table-server>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
/* Konsistensi Font 11px */
.custom-grid-11 :deep(table),
.table-detail-bk :deep(table) {
  font-size: 11px !important;
}

.detail-title {
  font-size: 11px !important;
  font-weight: bold;
  text-transform: uppercase;
}

.table-detail-bk :deep(th) {
  background-color: #f5f5f5 !important;
  font-weight: bold !important;
}

.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 110px);
}

.table-container {
  flex-grow: 1;
  overflow: hidden;
}

/* Membuat baris terlihat bisa diklik */
:deep(.v-data-table__tr) {
  cursor: pointer;
  transition: background-color 0.2s;
}

/* Style tambahan saat baris aktif */
:deep(.selected-row-active) {
  font-weight: bold;
}
</style>

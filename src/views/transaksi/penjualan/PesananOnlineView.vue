<script setup lang="ts">
import { ref, reactive, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { format } from "date-fns";
import { formatRupiah } from "@/utils/formatRupiah";

interface PesananOnline {
  mso_tanggal: string;
  mso_nomor: string;
  mso_jenis: string;
  mso_ket: string;
  no_resi?: string;
  mso_dari: string;
  inv_nomor?: string;
  total_penjualan: number;
  user_create: string;
}

// --- Config ---
const MENU_ID = "56";
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();

// --- State ---
const isLoading = ref(false);
const items = ref<PesananOnline[]>([]);
const totalItems = ref(0);

const filters = reactive({
  page: 1,
  itemsPerPage: 15,
  term: "",
  startDate: format(new Date(), "yyyy-MM-01"),
  endDate: format(new Date(), "yyyy-MM-dd"),
});

// --- Table Headers ---
const headers = [
  { title: "Tanggal", key: "mso_tanggal", width: "100px" },
  { title: "No. Mutasi", key: "mso_nomor", width: "140px" },
  { title: "Marketplace", key: "mso_jenis", width: "120px" },
  { title: "Info Pesanan", key: "info_pesanan", minWidth: "250px" },
  { title: "Sumber", key: "mso_dari", width: "80px", align: "center" },
  { title: "No. Invoice", key: "inv_nomor", width: "140px" },
  { title: "Total Jual", key: "total_penjualan", align: "end", width: "120px" },
  { title: "User", key: "user_create", width: "100px" },
] as const;

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const { data } = await api.get("/pesanan-online", { params: filters });
    items.value = data.items;
    totalItems.value = data.total;
  } catch (error) {
    console.error(error);
    toast.error("Gagal memuat data pesanan.");
  } finally {
    isLoading.value = false;
  }
};

const handleCreate = () => {
  // Arahkan ke Form Input Pesanan (MarketplaceOrderCreateView yang sebelumnya dibuat)
  // Pastikan Anda mendaftarkan route untuk form tersebut dengan nama 'PesananOnlineCreate' atau sesuai.
  router.push({ name: "PesananOnlineCreate" });
};

// --- Watchers ---
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
  fetchData();
});
</script>

<template>
  <PageLayout title="Daftar Pesanan Online" icon="mdi-shopping-outline">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        color="primary"
        size="small"
        prepend-icon="mdi-plus"
        @click="handleCreate"
      >
        Input Pesanan Baru
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section pa-2 mb-2 bg-white border-bottom">
        <v-row dense align="center">
          <v-col cols="12" md="2">
            <v-text-field
              v-model="filters.startDate"
              type="date"
              label="Dari Tanggal"
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-text-field
              v-model="filters.endDate"
              type="date"
              label="Sampai Tanggal"
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12" md="5">
            <v-text-field
              v-model="filters.term"
              label="Cari No Pesanan / Resi / Mutasi..."
              density="compact"
              variant="outlined"
              prepend-inner-icon="mdi-magnify"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="12" md="3" class="d-flex justify-end">
            <v-btn
              icon="mdi-refresh"
              variant="text"
              size="small"
              color="grey-darken-1"
              @click="fetchData"
              title="Refresh"
            />
          </v-col>
        </v-row>
      </div>

      <div class="table-container">
        <v-data-table-server
          v-model:page="filters.page"
          v-model:items-per-page="filters.itemsPerPage"
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="isLoading"
          class="desktop-table elevation-1 header-browse-blue"
          density="compact"
          fixed-header
          height="calc(100vh - 220px)"
        >
          <template #[`item.mso_tanggal`]="{ item }">
            {{ format(new Date(item.mso_tanggal), "dd-MM-yyyy") }}
          </template>

          <template #[`item.mso_jenis`]="{ item }">
            <v-chip
              size="x-small"
              :color="
                item.mso_jenis === 'SHOPEE'
                  ? 'orange'
                  : item.mso_jenis === 'TOKOPEDIA'
                  ? 'green'
                  : 'blue'
              "
              class="font-weight-bold"
            >
              {{ item.mso_jenis }}
            </v-chip>
          </template>

          <template #[`item.info_pesanan`]="{ item }">
            <div class="py-1">
              <div class="font-weight-medium text-body-2">{{ item.mso_ket }}</div>
              <div v-if="item.no_resi" class="text-caption text-grey-darken-1 d-flex align-center">
                <v-icon size="12" class="mr-1">mdi-barcode</v-icon>
                Resi: {{ item.no_resi }}
              </div>
            </div>
          </template>

          <template #[`item.mso_dari`]="{ item }">
            <v-chip size="x-small" variant="outlined">{{ item.mso_dari }}</v-chip>
          </template>

          <template #[`item.inv_nomor`]="{ item }">
            <span class="text-primary font-weight-medium">{{ item.inv_nomor || "-" }}</span>
          </template>

          <template #[`item.total_penjualan`]="{ item }">
            {{ formatRupiah(item.total_penjualan) }}
          </template>
        </v-data-table-server>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
/* Styling sama seperti browse view lain */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  border-bottom: 1px solid #e0e0e0;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header Biru */
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
}

.desktop-table :deep(.v-table__wrapper) {
  height: 100% !important;
  scrollbar-width: thin;
}
</style>

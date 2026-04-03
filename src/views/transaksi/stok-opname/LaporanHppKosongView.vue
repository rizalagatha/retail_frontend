<script setup lang="ts">
import { ref, reactive, onMounted, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import { VDataTableServer } from "vuetify/components/VDataTable";
import { useRouter } from "vue-router";
import type { AxiosError } from "axios";

interface HppKosongItem {
  Kode: string;
  Barcode: string;
  Nama: string;
  Ukuran: string;
  Stok: number;
  Hpp: number;
}

interface Cabang {
  kode: string;
  nama: string;
}

type NumericCol = "Stok" | "Hpp";

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = "704";

const items = ref<HppKosongItem[]>([]);
const loading = ref(true);
const totalItems = ref(0);
const options = ref({ page: 1, itemsPerPage: 10 });
const cabangOptions = ref<Cabang[]>([]);

const filters = reactive<{
  cabang: string;
}>({
  cabang: authStore.user?.cabang ?? "KDC",
});

const headers = [
  { title: "No", key: "no", sortable: false, width: "50px" },
  { title: "Kode", key: "Kode", width: "180px" },
  { title: "Barcode", key: "Barcode", width: "150px" },
  { title: "Nama Barang", key: "Nama", minWidth: "300px" },
  { title: "Ukuran", key: "Ukuran", width: "100px" },
  { title: "Stok", key: "Stok", align: "end" },
  { title: "HPP", key: "Hpp", align: "end" },
] as const;

// --- Methods ---
const fetchData = async () => {
  loading.value = true;
  try {
    const params = {
      ...filters,
      page: options.value.page,
      itemsPerPage: options.value.itemsPerPage,
    };
    const response = await api.get("/laporan-hpp-kosong", { params });
    items.value = response.data.items;
    totalItems.value = response.data.totalItems;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get("/laporan-hpp-kosong/cabang-options");
    cabangOptions.value = response.data;
    // Set default filter setelah opsi dimuat
    if (authStore.user?.cabang && authStore.user?.cabang !== "KDC") {
      filters.cabang = authStore.user.cabang;
    } else {
      filters.cabang = "ALL"; // KDC default ke SEMUA
    }
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat filter cabang.");
  }
};

const exportData = async () => {
  loading.value = true;
  try {
    // Ambil semua data (tanpa paginasi) untuk ekspor
    const params = { ...filters, page: 1, itemsPerPage: -1 };
    const response = await api.get("/laporan-hpp-kosong", { params });

    if (response.data.items.length === 0) {
      toast.warning("Tidak ada data untuk diekspor.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(response.data.items);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "HPP Kosong");
    XLSX.writeFile(workbook, `Laporan_HPP_Kosong_${filters.cabang}.xlsx`);
    toast.success("Data berhasil diekspor.");
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengekspor data.");
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  if (!authStore.can(MENU_ID, "view")) {
    toast.error("Anda tidak memiliki hak akses untuk membuka halaman ini.");
    return router.push("/");
  }
  fetchCabangOptions();
  // fetchData akan terpicu oleh watch(filters) saat cabangOptions selesai dimuat
});

// Watcher untuk memuat ulang data saat filter atau paginasi berubah
watch(filters, fetchData, { deep: true });
watch(options, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="List HPP 0 Ada Stok" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        color="teal"
        prepend-icon="mdi-file-excel"
        @click="exportData"
      >
        Export
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
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
        <v-spacer />
        <v-btn
          @click="fetchData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="loading"
        />
      </div>

      <div class="table-container">
        <v-data-table-server
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="loading"
          v-model:page="options.page"
          v-model:items-per-page="options.itemsPerPage"
          @update:options="options = $event"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
        >
          <template #[`item.no`]="{ index }">
            {{ (options["page"] - 1) * options["itemsPerPage"] + index + 1 }}
          </template>
          <template
            v-for="col in ['Stok', 'Hpp'] as NumericCol[]"
            #[`item.${col}`]="{ item }"
            :key="col"
          >
            <td class="text-end">
              {{ (item[col] || 0).toLocaleString("id-ID") }}
            </td>
          </template>
        </v-data-table-server>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.filter-section {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-container {
  height: calc(100vh - 180px);
  /* Sesuaikan tinggi jika perlu */
  overflow-y: auto;
}
</style>

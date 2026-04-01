<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import type { AxiosError } from "axios";

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

const selected = ref<string[]>([]);
const expanded = ref<string[]>([]);
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
  // Default ALL untuk KDC, default cabang sendiri untuk toko
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
});

const options = ref({
  page: 1,
  itemsPerPage: 15,
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
        cabang: filters.cabang, // Kirim parameter cabang
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

const handleExpand = async (newExpanded: string[]) => {
  const newItems = newExpanded.filter((nomor) => !expandedData.value[nomor]);

  for (const nomor of newItems) {
    loadingExpand.value[nomor] = true;
    try {
      const response = await api.get(`/komplain-form/${nomor}`);
      expandedData.value[nomor] = response.data.details;
    } catch (error) {
      toast.error(`Gagal memuat detail barang untuk ${nomor}`, error);
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

const handleRowClick = (_event: Event, { item }: { item: KomplainHeader }) => {
  if (selected.value[0] === item.cmp_nomor) {
    selected.value = [];
  } else {
    selected.value = [item.cmp_nomor];
  }
};

const handleCreate = () => {
  router.push({ name: "KomplainCustomerCreate" });
};

const handleEditSelected = () => {
  if (selected.value.length === 0) return toast.warning("Pilih data terlebih dahulu.");
  const nomor = selected.value[0];
  router.push({ name: "KomplainCustomerEdit", params: { nomor } });
};

const printData = () => {
  if (selected.value.length === 0) return toast.warning("Pilih data komplain terlebih dahulu.");
  const nomor = selected.value[0];
  const url = router.resolve({ name: "KomplainCustomerPrint", params: { nomor } }).href;
  window.open(url, "_blank");
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(
  () => filters.search,
  () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      options.value.page = 1;
      loadItems();
    }, 500);
  }
);

watch([() => filters.status, () => filters.cabang], () => {
  options.value.page = 1;
  loadItems();
});

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
        color="primary"
        prepend-icon="mdi-plus"
        size="small"
        class="mr-2"
        @click="handleCreate"
      >
        Buat Komplain Baru
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit') || authStore.can(MENU_ID, 'view')"
        color="warning"
        prepend-icon="mdi-pencil"
        size="small"
        :disabled="selected.length === 0"
        @click="handleEditSelected"
      >
        Lihat / Proses
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        color="green-darken-2"
        prepend-icon="mdi-printer"
        size="small"
        class="mr-2"
        :disabled="selected.length === 0"
        @click="printData"
      >
        Cetak
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-text-field
          v-model="filters.search"
          label="Cari No. Komplain, Customer, atau Ref..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width: 250px"
        />

        <v-select
          v-if="isKDC"
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          label="Pilih Cabang"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 200px"
        />

        <v-select
          v-model="filters.status"
          :items="statusOptions"
          label="Filter Status"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 150px"
        />
        <v-spacer />
        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="loading"
          @click="loadItems"
          title="Refresh Data"
        />
      </div>

      <div class="table-container">
        <v-data-table-server
          v-model="selected"
          v-model:expanded="expanded"
          v-model:page="options.page"
          v-model:items-per-page="options.itemsPerPage"
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="loading"
          item-value="cmp_nomor"
          select-strategy="single"
          show-expand
          hover
          class="desktop-table header-browse-blue flex-grow-1"
          density="compact"
          fixed-header
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
              size="small"
              variant="flat"
              class="font-weight-bold text-uppercase"
            >
              {{ item.cmp_status.replace("_", " ") }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container bg-grey-lighten-5">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingExpand[item.cmp_nomor]" class="text-center pa-4">
                      <v-progress-circular
                        indeterminate
                        size="24"
                        color="primary"
                      ></v-progress-circular>
                      <span class="ml-2 text-caption">Memuat detail barang...</span>
                    </div>
                    <v-table v-else density="compact" class="bg-white">
                      <thead>
                        <tr>
                          <th
                            class="text-left font-weight-bold text-white"
                            style="background-color: #0d47a1"
                          >
                            KODE BARANG
                          </th>
                          <th
                            class="text-left font-weight-bold text-white"
                            style="background-color: #0d47a1"
                          >
                            NAMA BARANG
                          </th>
                          <th
                            class="text-center font-weight-bold text-white"
                            style="background-color: #0d47a1"
                          >
                            UKURAN
                          </th>
                          <th
                            class="text-right font-weight-bold text-white"
                            style="background-color: #0d47a1"
                          >
                            QTY MASALAH
                          </th>
                          <th
                            class="text-left font-weight-bold text-white"
                            style="background-color: #0d47a1"
                          >
                            KENDALA
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="dtl in expandedData[item.cmp_nomor]" :key="dtl.cmpd_id">
                          <td>{{ dtl.kode_barang }}</td>
                          <td>{{ dtl.nama_barang }}</td>
                          <td class="text-center">{{ dtl.ukuran }}</td>
                          <td class="text-right text-error font-weight-bold">{{ dtl.qty }}</td>
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
        </v-data-table-server>
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
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

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
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  white-space: nowrap;
}

.desktop-table :deep(td) {
  font-size: 12px !important;
  padding: 0 8px !important;
  height: 36px !important;
  white-space: nowrap;
  cursor: pointer; /* Memberi isyarat visual baris bisa diklik */
}

/* Detail Sticky & Wrapper */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;

  display: flex;
  justify-content: flex-start;
  align-items: flex-start;

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
  border-radius: 4px;
  overflow: hidden;
}

/* Penyorotan Baris yang Terpilih */
.desktop-table :deep(tr.v-data-table__selected) {
  background-color: #e3f2fd !important;
}
</style>

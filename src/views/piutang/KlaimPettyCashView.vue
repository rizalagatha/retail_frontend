<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import axios from "axios";

// --- INTERFACES ---
interface KlaimItem {
  nomor: string;
  tanggal: string;
  cabang: string;
  namaCabang?: string;
  keterangan: string;
  terpakai: number | string;
  status: string;
  approver: string | null;
  userCreate: string;
  modal?: number; // <-- TAMBAHKAN INI
  saldo?: number; // <-- TAMBAHKAN INI
  [key: string]: unknown;
}

interface KlaimDetail {
  pc_nomor: string;
  pcd_pcv: string | number;
  pcd_tanggal: string;
  pcd_kategori: string;
  pcd_keterangan: string;
  pcd_nominal: number;
  pcd_file: string | null;
  [key: string]: unknown;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const isPusat = computed(() => authStore.user?.cabang === "KDC");
const userCabang = computed(() => authStore.user?.cabang || "");
const MENU_ID = "59"; // Menu Finance

// --- State ---
const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  // [PERBAIKAN] Dinamis berdasarkan asal usul user
  cabang: isPusat.value ? "ALL" : userCabang.value,
  status: "ACC",
});

const cabangList = ref<{ kode: string; nama: string }[]>([]);
// Opsi filter ditambahkan ACC
const statusOptions = ["ALL", "ACC", "APPROVED", "REJECTED", "SUBMITTED"];

const loading = ref(true);
const masterData = ref<KlaimItem[]>([]);
const selected = ref<KlaimItem[]>([]);

// Untuk Expand Rincian Nota
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, KlaimDetail[]>>({});

const dialogPreview = ref(false);
const previewImageSrc = ref("");

const headers = ref([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor Pengajuan", key: "nomor", width: 170, fixed: true },
  { title: "Tgl. Pengajuan", key: "tanggal", width: 110 },
  { title: "Cabang", key: "cabang", width: 160 },
  // --- [BARU] Kolom Modal & Saldo ---
  { title: "Modal Awal", key: "modal", align: "end", width: 120 },
  { title: "Total Klaim", key: "terpakai", align: "end", width: 120 },
  { title: "Sisa Saldo", key: "saldo", align: "end", width: 120 },
  // ---------------------------------
  { title: "Status", key: "status", align: "center", width: 110 },
  { title: "Otorisasi SPV", key: "approver", width: 120 },
  { title: "User Store", key: "userCreate", width: 100 },
]);

const getImageUrl = (fileName: string) => {
  if (!fileName) return "";

  let apiUrl = (api.defaults.baseURL || import.meta.env.VITE_API_BASE_URL || "") as string;

  // Bersihkan garis miring (slash) di paling ujung jika ada
  apiUrl = apiUrl.replace(/\/$/, "");

  // [KUNCI PERBAIKAN]: Paksa tambahkan '/api' jika belum ada!
  // Ini memastikan Nginx selalu meneruskan pencarian gambar ini ke Backend Node.js
  if (!apiUrl.endsWith("/api")) {
    apiUrl += "/api";
  }

  // Hasilnya pasti dan selalu: .../api/uploads/pettycash/nama_file.jpg
  return `${apiUrl}/uploads/pettycash/${fileName.trim()}`;
};

const showPreview = (fileName: string) => {
  if (!fileName) return;
  const url = getImageUrl(fileName);
  if (fileName.toLowerCase().endsWith(".pdf")) {
    window.open(url, "_blank");
  } else {
    previewImageSrc.value = url;
    dialogPreview.value = true;
  }
};

const getRowClass = (item: KlaimItem) => {
  if (item.status === "APPROVED") return "text-success font-weight-medium";
  if (item.status === "REJECTED") return "text-error font-weight-bold";
  if (item.status === "ACC") return "text-primary font-weight-bold bg-blue-lighten-5"; // Highlight ACC
  if (item.status === "SUBMITTED") return "text-orange-darken-2 font-weight-medium";
  return "text-grey-darken-3";
};

const fetchCabangList = async () => {
  try {
    const response = await api.get("/minta-barang/lookup/cabang");

    if (isPusat.value) {
      // Kalau pusat, bisa lihat semua
      cabangList.value = [{ kode: "ALL", nama: "SEMUA CABANG" }, ...response.data];
    } else {
      // Kalau toko, saring HANYA cabang dia sendiri
      cabangList.value = response.data.filter(
        (c: { kode: string; nama: string }) => c.kode === userCabang.value
      );
    }
  } catch (error) {
    console.error("Gagal memuat cabang", error);
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/petty-cash/klaim-finance", { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal mengambil data Klaim Petty Cash.";
    if (axios.isAxiosError(error)) {
      msg = error.response?.data?.message || msg;
    }
    toast.error(msg); // Kirim string saja ke sini
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: KlaimItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor)
  );
  if (!itemToLoad) return;

  const pckNomor = itemToLoad.nomor;
  loadingDetails.value.add(pckNomor);
  try {
    const response = await api.get(`/petty-cash/klaim-finance/detail/${pckNomor}`);
    details.value[pckNomor] = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal memuat detail nota.";
    if (axios.isAxiosError(error)) {
      msg = error.response?.data?.message || msg;
    }
    toast.error(msg);
  } finally {
    loadingDetails.value.delete(pckNomor);
  }
};

const handleProcess = () => {
  if (selected.value.length !== 1) return;
  const item = selected.value[0];
  // Arahkan ke form proses menggunakan pck_nomor
  router.push({ path: `/piutang/klaim-petty-cash/proses/${item.nomor}` });
};

const handlePrint = () => {
  if (selected.value.length !== 1) return;
  const item = selected.value[0];
  if (item.status !== "APPROVED") {
    return toast.warning("Hanya dokumen yang sudah APPROVED yang bisa dicetak.");
  }
  const routeData = router.resolve({ name: "KlaimPettyCashPrint", params: { nomor: item.nomor } });
  window.open(routeData.href, "_blank");
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});
</script>

<template>
  <PageLayout title="Klaim Petty Cash (Finance)" :menu-id="MENU_ID" icon="mdi-wallet-check-outline">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        color="primary"
        prepend-icon="mdi-file-document-edit-outline"
        :disabled="selected.length !== 1 || !['ACC', 'SUBMITTED'].includes(selected[0].status)"
        @click="handleProcess"
      >
        Proses Klaim
      </v-btn>
      <v-btn
        size="small"
        color="secondary"
        prepend-icon="mdi-printer"
        :disabled="selected.length !== 1 || selected[0].status !== 'APPROVED'"
        @click="handlePrint"
      >
        Cetak Bukti
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label>Periode:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 140px"
          @change="fetchMasterData"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 140px"
          @change="fetchMasterData"
        />

        <v-label class="ms-4">Cabang:</v-label>
        <v-select
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          :readonly="!isPusat"
          :variant="!isPusat ? 'filled' : 'outlined'"
          style="max-width: 200px"
          class="ms-2"
          @update:model-value="fetchMasterData"
        />

        <v-label class="ms-4">Status:</v-label>
        <v-select
          v-model="filters.status"
          :items="statusOptions"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          class="ms-2"
          @update:model-value="fetchMasterData"
        />

        <v-spacer />
        <v-btn
          @click="fetchMasterData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="loading"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="masterData"
          :loading="loading"
          item-value="nomor"
          density="compact"
          class="desktop-table custom-highlight-table header-browse-blue"
          show-select
          show-expand
          return-object
          @click:row="(_event: MouseEvent, { item }: { item: KlaimItem }) => selected = [item]"
          @update:expanded="loadDetails"
        >
          <template #[`item.nomor`]="{ item }">
            <span :class="getRowClass(item)">{{ item.nomor }}</span>
          </template>

          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal), "dd/MM/yyyy") }}
          </template>

          <template #[`item.cabang`]="{ item }">
            <b>{{ item.cabang }}</b> - {{ item.namaCabang }}
          </template>

          <template #[`item.modal`]="{ item }">
            <span class="font-weight-medium text-grey-darken-2">{{
              formatRupiah(Number(item.modal) || 0)
            }}</span>
          </template>

          <template #[`item.terpakai`]="{ item }">
            <span class="text-error font-weight-bold">{{ formatRupiah(item.terpakai) }}</span>
          </template>

          <template #[`item.saldo`]="{ item }">
            <span
              class="font-weight-black"
              :class="item.saldo !== undefined && item.saldo < 0 ? 'text-error' : 'text-primary'"
            >
              {{ formatRupiah(Number(item.saldo) || 0) }}
            </span>
          </template>

          <template #[`item.approver`]="{ item }">
            <span class="text-caption font-weight-bold text-grey-darken-2">{{
              item.approver || "-"
            }}</span>
          </template>

          <template #[`item.status`]="{ item }">
            <v-chip
              size="x-small"
              variant="flat"
              class="font-weight-bold"
              :color="
                item.status === 'APPROVED'
                  ? 'success'
                  : item.status === 'ACC'
                  ? 'primary'
                  : item.status === 'REJECTED'
                  ? 'error'
                  : 'grey-darken-1'
              "
            >
              {{ item.status }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="pa-3 bg-grey-lighten-4 border-b">
                  <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-2">
                    <v-progress-circular
                      indeterminate
                      size="24"
                      color="primary"
                    ></v-progress-circular>
                    <span class="ml-2 text-caption">Memuat rincian nota pengajuan...</span>
                  </div>

                  <div
                    v-else-if="details[item.nomor] && details[item.nomor].length > 0"
                    class="detail-wrapper"
                  >
                    <table class="w-100 detail-table bg-white">
                      <thead>
                        <tr>
                          <th width="120" class="text-center">NO. PETTY CASH</th>
                          <th width="60" class="text-center">PCV</th>
                          <th width="90">TGL. NOTA</th>
                          <th width="200">KATEGORI</th>
                          <th>KETERANGAN NOTA</th>
                          <th width="110" class="text-right">NOMINAL</th>
                          <th width="80" class="text-center">CEK NOTA</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(d, idx) in details[item.nomor]" :key="idx">
                          <td class="text-center font-weight-bold text-grey">{{ d.pc_nomor }}</td>
                          <td class="text-center font-weight-bold text-grey-darken-2">
                            {{ d.pcd_pcv }}
                          </td>
                          <td>{{ format(parseISO(d.pcd_tanggal), "dd/MM/yy") }}</td>
                          <td class="text-caption font-weight-bold">{{ d.pcd_kategori }}</td>
                          <td class="text-caption">{{ d.pcd_keterangan }}</td>
                          <td class="text-right font-weight-bold text-error">
                            {{ formatRupiah(d.pcd_nominal) }}
                          </td>
                          <td class="text-center">
                            <v-btn
                              v-if="d.pcd_file"
                              icon
                              size="x-small"
                              color="primary"
                              variant="tonal"
                              title="Preview"
                              @click="showPreview(d.pcd_file)"
                            >
                              <v-icon size="small">{{
                                d.pcd_file.toLowerCase().endsWith(".pdf")
                                  ? "mdi-file-pdf-box"
                                  : "mdi-image-search"
                              }}</v-icon>
                            </v-btn>
                            <span v-else class="text-grey-lighten-1">-</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-else class="text-center text-caption text-grey pa-2">
                    Tidak ada rincian ditemukan.
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="dialogPreview" max-width="850px">
      <v-card class="rounded-lg">
        <v-card-title
          class="bg-grey-darken-3 text-white text-subtitle-1 font-weight-bold d-flex justify-space-between align-center py-2 px-4"
        >
          <div class="d-flex align-center">
            <v-icon size="small" class="me-2">mdi-image-search</v-icon> Preview Nota (Finance)
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            size="small"
            @click="dialogPreview = false"
          ></v-btn>
        </v-card-title>
        <v-card-text
          class="pa-4 bg-grey-lighten-3 text-center d-flex justify-center align-center"
          style="min-height: 400px"
        >
          <img
            :src="previewImageSrc"
            alt="Preview Nota"
            style="
              max-width: 100%;
              max-height: 75vh;
              object-fit: contain;
              border: 1px solid #ccc;
              background: white;
              border-radius: 4px;
            "
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.custom-highlight-table :deep(.v-data-table__tr--selected) {
  background-color: #e3f2fd !important;
}
.custom-highlight-table :deep(.v-data-table__tr:hover) {
  background-color: #f5f5f5 !important;
  cursor: pointer;
}
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 110px);
  overflow: hidden;
}
.filter-section {
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: 0 12px 12px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
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
  overflow-y: auto;
  overflow-x: auto;
}
.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}
.border-b {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.detail-wrapper {
  max-width: 1000px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  border: 1px solid #e0e0e0;
}
.detail-table {
  border-collapse: collapse;
  font-size: 11px;
}
.detail-table th {
  background-color: #e3f2fd;
  color: #0d47a1;
  font-weight: bold;
  padding: 6px 8px;
  text-align: left;
  border-bottom: 2px solid #1976d2;
}
.detail-table td {
  padding: 4px 8px;
  border-bottom: 1px solid #eeeeee;
  vertical-align: middle;
}
.detail-table tbody tr:hover {
  background-color: #fafafa;
}
</style>

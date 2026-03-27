<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, subDays, addDays, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import AppDataTable from "@/components/AppDataTable.vue";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "57"; // Sesuai instruksi

// --- Interfaces ---
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
}

interface DasborItem {
  TglPengerjaan: string;
  Kuota: number;
  TotalSO: number;
  TotalKaos: number;
  Sisa: number;
}

interface DetailItem {
  SoBordir: string;
  TglPengerjaan: string;
  Nama: string;
  JumlahKaos: number;
  Status: string;
  Alasan: string;
}

// --- State ---
const dasborList = ref<DasborItem[]>([]);
const details = ref<{ [key: string]: DetailItem[] }>({});
const isLoading = ref(true);
const startDate = ref(format(subDays(new Date(), 2), "yyyy-MM-dd"));
const endDate = ref(format(addDays(new Date(), 7), "yyyy-MM-dd"));
const cabangList = ref<{ kode: string; nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || "");
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

// --- Header Definisi ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Tgl Pengerjaan", key: "TglPengerjaan", width: 180, align: "start" },
  { title: "Kuota Harian", key: "Kuota", width: 120, align: "start" },
  { title: "Total SO", key: "TotalSO", width: 100, align: "start" },
  { title: "Jumlah Kaos", key: "TotalKaos", width: 120, align: "start" },
  { title: "Sisa Kuota", key: "Sisa", width: 120, align: "start" },
]);

const detailHeaders = [
  { title: "SO Bordir", key: "SoBordir", width: "150px" },
  { title: "Nama Customer", key: "Nama", width: "250px" },
  { title: "Jml Kaos", key: "JumlahKaos", align: "center", width: "90px" },
  { title: "Status", key: "Status", align: "center", width: "100px" },
  { title: "Keterangan", key: "Alasan", width: "200px" },
] as const;

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/dasbor-bordir/cabang-list");
    cabangList.value = response.data;
    if (authStore.user?.cabang === "KDC" && cabangList.value.length > 0) {
      selectedCabang.value = cabangList.value[0].kode;
    }
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value || !selectedCabang.value) return;
  isLoading.value = true;
  try {
    const response = await api.get("/dasbor-bordir", {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
      },
    });
    dasborList.value = response.data;
  } catch {
    toast.error("Gagal memuat data dasbor bordir.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: string[]) => {
  const tglToLoad = newlyExpandedItems.find(
    (tgl) => !details.value[tgl] && !loadingDetails.value.has(tgl)
  );

  if (!tglToLoad) return;

  loadingDetails.value.add(tglToLoad);
  try {
    const response = await api.get(`/dasbor-bordir/detail`, {
      params: { tanggal: tglToLoad, cabang: selectedCabang.value },
    });
    details.value[tglToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk tanggal ${tglToLoad}`);
    expanded.value = expanded.value.filter((tgl) => tgl !== tglToLoad);
  } finally {
    loadingDetails.value.delete(tglToLoad);
  }
};

const getStatusColor = (status: string) => {
  if (status === "Ready") return "success";
  if (status === "Pending") return "error";
  return "orange-darken-2"; // Untuk Antri
};

// Logika warna baris jika minus
const getRowClass = (item: DasborItem) => {
  return item.Sisa < 0 ? "row-sisa-minus" : "";
};

const exportData = async (type: "header" | "detail") => {
  const endpoint =
    type === "header" ? "/dasbor-bordir/export-header" : "/dasbor-bordir/export-detail";
  const fileName = type === "header" ? "DasborBordir_Header.xlsx" : "DasborBordir_Detail.xlsx";
  toast.info(`Mempersiapkan file ${fileName}...`);
  try {
    const response = await api.get(endpoint, {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
      },
    });
    const worksheet = XLSX.utils.json_to_sheet(response.data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, fileName);
    toast.success("File berhasil diekspor.");
  } catch {
    toast.error("Gagal mengekspor data.");
  }
};

onMounted(() => {
  if (hasViewPermission.value) {
    fetchCabangList();
    fetchData();
  }
});

watch([startDate, endDate, selectedCabang], fetchData);
</script>

<template>
  <PageLayout title="Dasbor Antrian Bordir" desktop-mode icon="mdi-tshirt-crew">
    <template #header-actions>
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props"
            >Export</v-btn
          >
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Rekap Harian</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')">
            <v-list-item-title>Export Detail SO</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Tgl Pengerjaan:</span>
        <v-text-field
          v-model="startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 140px"
        />
        <span class="mx-2">s/d</span>
        <v-text-field
          v-model="endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 140px"
        />

        <span class="filter-label ms-4">Cabang:</span>
        <v-select
          v-model="selectedCabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />

        <v-spacer />
        <v-btn
          @click="fetchData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          title="Muat Ulang Data"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model:expanded="expanded"
          :headers="headers"
          :items="dasborList"
          :loading="isLoading"
          item-value="TglPengerjaan"
          density="compact"
          class="desktop-table header-browse-purple"
          fixed-header
          show-expand
          @update:expanded="loadDetails"
          :item-props="(item) => ({ class: getRowClass(item) })"
        >
          <template #headers="{ columns }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  :style="{
                    width: header.width + 'px',
                    minWidth: header.width + 'px',
                    maxWidth: header.width + 'px',
                  }"
                  class="custom-header"
                  :class="{
                    'text-center': header.align === 'center',
                    'text-end': header.align === 'end',
                  }"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                  </div>
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn
              icon="mdi-chevron-down"
              :class="{ 'rotate-180': isExpanded(internalItem) }"
              size="x-small"
              variant="text"
              @click.stop="toggleExpand(internalItem)"
            />
          </template>

          <template
            v-for="header in headers.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td>
              <template v-if="header.key === 'TglPengerjaan'">
                <div class="font-weight-bold text-deep-purple-darken-3">
                  {{ format(parseISO(item.TglPengerjaan), "dd MMMM yyyy") }}
                </div>
              </template>

              <template v-else-if="header.key === 'Kuota'">
                <div class="font-weight-medium text-grey-darken-1 text-center">
                  {{ item.Kuota }} pcs
                </div>
              </template>

              <template v-else-if="header.key === 'TotalKaos'">
                <div class="font-weight-bold text-center">{{ item.TotalKaos }} pcs</div>
              </template>

              <template v-else-if="header.key === 'Sisa'">
                <div
                  class="font-weight-bold text-center text-body-1"
                  :class="item.Sisa < 0 ? 'text-error' : 'text-success'"
                >
                  {{ item.Sisa }}
                </div>
              </template>

              <template v-else>
                <div class="text-center">{{ item[header.key] }}</div>
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.TglPengerjaan)" class="text-center py-4">
                      <v-progress-circular
                        indeterminate
                        size="24"
                        color="deep-purple"
                        class="mr-2"
                      ></v-progress-circular>
                    </div>
                    <v-data-table
                      v-else-if="details[item.TglPengerjaan]"
                      :headers="detailHeaders"
                      :items="details[item.TglPengerjaan]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.SoBordir`]="{ item: dItem }">
                        <span class="font-weight-bold text-deep-purple">{{ dItem.SoBordir }}</span>
                      </template>

                      <template #[`item.JumlahKaos`]="{ item: dItem }">
                        <span class="font-weight-bold">{{ dItem.JumlahKaos }} pcs</span>
                      </template>

                      <template #[`item.Status`]="{ item: dItem }">
                        <v-chip
                          :color="getStatusColor(dItem.Status)"
                          size="small"
                          variant="flat"
                          class="font-weight-bold"
                        >
                          {{ dItem.Status }}
                        </v-chip>
                      </template>

                      <template #[`item.Alasan`]="{ item: dItem }">
                        <span class="text-error font-italic text-caption">{{
                          dItem.Alasan || "-"
                        }}</span>
                      </template>

                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center text-caption py-4 text-grey">
                      Belum ada SO yang dijadwalkan pada tanggal ini.
                    </div>
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
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  flex-shrink: 0;
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

.custom-header {
  background-color: #ede7f6 !important; /* light purple */
  color: #4527a0 !important; /* dark purple */
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #5e35b1 !important;
  padding: 0 16px !important;
}

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
  max-width: 850px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.detail-table :deep(th) {
  background-color: #f5f5f5 !important;
  color: #333333 !important; /* Tambahkan ini agar teks jadi gelap */
  font-weight: bold !important; /* Opsional: Biar headernya lebih tegas */
  font-size: 11px !important;
}

.detail-table :deep(td) {
  color: #333333 !important;
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.rotate-180 {
  transform: rotate(180deg);
}

/* Pewarnaan Highlight Jika Sisa Minus */
.row-sisa-minus :deep(td) {
  color: #d32f2f !important;
  background-color: #ffebee !important;
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

// --- Tipe Data ---
interface ProformaItem {
  nomor: string;
  tanggal: string;
  customer: string;
  nominal: number;
  tempo: string;
  keterangan: string;
  closing: "Y" | "N";
}

interface ProformaDetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  total: number;
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "28";

const masterData = ref<ProformaItem[]>([]);
const details = ref<Record<string, ProformaDetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<ProformaItem[]>([]);
const expanded = ref<string[]>([]);
const branchOptions = ref<{ kode: string; nama: string }[]>([]);

const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => {} });

const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang || "",
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<ProformaItem | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);

const canEdit = computed(() => isSingleSelected.value && selectedRow.value?.closing !== "Y");
const canDelete = computed(() => isSingleSelected.value && selectedRow.value?.closing !== "Y");
const canCetak = computed(() => isSingleSelected.value);

// --- Konfigurasi Tabel ---
const headers = [
  { title: "Nomor", key: "nomor", width: "150px" },
  { title: "Tanggal", key: "tanggal", width: "100px" },
  { title: "Customer", key: "customer", width: "250px" },
  { title: "Nominal", key: "nominal", align: "end", width: "120px" },
  { title: "Tempo", key: "tempo", width: "100px" },
  { title: "Keterangan", key: "keterangan" },
  { title: "Closing", key: "closing", align: "center", width: "80px" },
] as const;
const detailHeaders = [
  { title: "Kode", key: "kode" },
  { title: "Nama Barang", key: "nama", width: "350px" },
  { title: "Ukuran", key: "ukuran" },
  { title: "Jumlah", key: "jumlah", align: "end" },
  { title: "Harga", key: "harga", align: "end" },
  { title: "Total", key: "total", align: "end" },
] as const;

// --- Methods ---
const fetchBranchOptions = async () => {
  try {
    const response = await api.get("/proforma/branch-options");
    branchOptions.value = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;

    toast.error(err.response?.data?.message || "Gagal memuat pilihan cabang.");
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/proforma", { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: ProformaItem[]) => {
  // Cari item yang baru saja di-expand, yang datanya belum ada dan belum sedang di-load
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor)
  );

  // Jika tidak ada item baru untuk di-load (misalnya saat menutup baris), hentikan fungsi
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.nomor;

  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get("/proforma/details", { params: { nomor: nomorToLoad } });
    details.value[nomorToLoad] = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;

    toast.error(err.response?.data?.message || `Gagal memuat detail untuk ${nomorToLoad}.`);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const handleNew = () => router.push({ name: "ProformaCreate" });
const handleEdit = () => {
  if (!canEdit.value) return;
  router.push({ name: "ProformaEdit", params: { id: selectedRow.value!.nomor } });
};
const handleCetak = () => {
  if (!canCetak.value) return;
  // Logika cetak, bisa sama dengan edit atau buka halaman khusus
  router.push({
    name: "ProformaEdit",
    params: { id: selectedRow.value!.nomor },
    query: { print: "true" },
  });
};

const handleDelete = () => {
  if (!canDelete.value) return;
  dialogConfirm.title = "Konfirmasi Hapus";
  dialogConfirm.text = `Yakin menghapus Proforma Invoice dengan nomor <strong>${
    selectedRow.value!.nomor
  }</strong>?`;
  dialogConfirm.onConfirm = async () => {
    try {
      const response = await api.delete(`/proforma/${selectedRow.value!.nomor}`);
      toast.success(response.data.message);
      fetchMasterData();
    } catch (err) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message || "Gagal menghapus data.");
    }
  };
  dialogConfirm.show = true;
};

const exportData = async (type: "header" | "detail") => {
  if (type === "header") {
    if (masterData.value.length === 0)
      return toast.warning("Tidak ada data header untuk diexport.");
    const worksheet = XLSX.utils.json_to_sheet(masterData.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Proforma Invoice");
    XLSX.writeFile(workbook, "Export_Proforma_Header.xlsx");
  } else if (type === "detail") {
    try {
      const response = await api.get("/proforma/export-detail", { params: filters });
      if (response.data.length === 0)
        return toast.warning("Tidak ada data detail untuk diexport pada filter ini.");

      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Proforma Invoice");
      XLSX.writeFile(workbook, "Export_Proforma_Detail.xlsx");
    } catch (error: unknown) {
      const err = error as AxiosError<{ message?: string }>;

      toast.error(err.response?.data?.message || "Gagal mengekspor data detail.");
    }
  }
};

onMounted(() => {
  fetchBranchOptions();
  fetchMasterData();
});
</script>

<template>
  <PageLayout title="Browse Proforma Invoice" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        prepend-icon="mdi-plus"
        color="primary"
        @click="handleNew"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        prepend-icon="mdi-pencil"
        @click="handleEdit"
        :disabled="!canEdit"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        prepend-icon="mdi-delete"
        color="error"
        @click="handleDelete"
        :disabled="!canDelete"
        >Hapus</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        prepend-icon="mdi-printer"
        color="green"
        @click="handleCetak"
        :disabled="!canCetak"
        >Cetak</v-btn
      >
      <v-menu offset-y v-if="authStore.can(MENU_ID, 'view')">
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props"
            >Export</v-btn
          >
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"
            ><v-list-item-title>Export Header</v-list-item-title></v-list-item
          >
          <v-list-item @click="exportData('detail')"
            ><v-list-item-title>Export Detail</v-list-item-title></v-list-item
          >
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Periode:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
          @change="fetchMasterData"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
          @change="fetchMasterData"
        />
        <v-select
          v-model="filters.cabang"
          :items="branchOptions"
          item-title="nama"
          item-value="kode"
          label="Cabang"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 200px"
          @update:modelValue="fetchMasterData"
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
          :items-length="masterData.length"
          :loading="loading"
          item-value="nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          show-expand
          return-object
          single-select
          @update:expanded="loadDetails"
        >
          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item["tanggal"]), "dd/MM/yyyy") }}
          </template>

          <template #[`item.nominal`]="{ item }">
            {{ new Intl.NumberFormat("id-ID").format(item["nominal"] || 0) }}
          </template>

          <template #[`item.closing`]="{ item }">
            <v-chip size="x-small" :color="item['closing'] === 'Y' ? 'red' : 'green'">
              {{ item["closing"] }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)">Memuat detail...</div>
                    <v-data-table
                      v-else
                      :headers="detailHeaders"
                      :items="details[item.nomor]"
                      density="compact"
                      class="detail-table"
                    >
                      <template #bottom></template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>
    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              () => {
                dialogConfirm.onConfirm();
                dialogConfirm.show = false;
              }
            "
            >Ya</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

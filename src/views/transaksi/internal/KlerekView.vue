<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import { useRouter } from "vue-router";
import type { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

interface KlerekItem {
  nomor: string; // inv_id tmp, kunci proses di backend
  tanggal: string;
  ket: string;
  nominal: number;
  kdcus: string;
  nmcus: string;
  setor: string;
  klerek: string | null;
}

interface KlerekSkipped {
  nomor: string;
  alasan: string;
}

interface KlerekResult {
  message: string;
  processed: number;
  skipped: KlerekSkipped[];
  warnings: string[];
}

interface CabangOption {
  kode: string;
  nama: string;
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = "34";

const items = ref<KlerekItem[]>([]);
const loading = ref(true);
const isProcessing = ref(false);
const cabangOptions = ref<CabangOption[]>([]);
const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => {} });
const resultDialog = reactive<{
  show: boolean;
  message: string;
  skipped: KlerekSkipped[];
  warnings: string[];
}>({ show: false, message: "", skipped: [], warnings: [] });

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang || "KDC",
});

const headers = [
  { title: "No", key: "no", sortable: false, width: "50px" },
  { title: "Tanggal", key: "tanggal" },
  { title: "Inv. Bazar", key: "ket" }, // nomor bazar asli
  { title: "Nominal", key: "nominal" },
  { title: "KdCus", key: "kdcus" },
  { title: "Customer", key: "nmcus" },
  { title: "No. Setoran", key: "setor" },
  { title: "Invoice Reguler", key: "klerek" }, // nomor invoice baru
];

const totalSummary = computed(() => {
  return {
    nominal: items.value.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0),
  };
});

// --- Methods ---
const fetchData = async () => {
  loading.value = true;
  try {
    const response = await api.get("/klerek", { params: filters });
    items.value = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get("/klerek/cabang-options");
    cabangOptions.value = response.data;
    // Set default jika KDC
    if (authStore.user?.cabang === "KDC" && cabangOptions.value.length > 0) {
      filters.cabang = cabangOptions.value[0].kode;
    }
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat filter cabang.");
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const openProsesDialog = () => {
  // Tambahkan pengecekan jika klerek bernilai '0'
  const unpostedItems = items.value.filter((item) => !item.klerek || item.klerek === "0");

  if (unpostedItems.length === 0) {
    return toast.warning("Tidak ada data yang akan di posting.");
  }
  showConfirmation(
    "Konfirmasi Proses Klerek",
    `Yakin akan memproses ${unpostedItems.length} invoice (total Rp ${unpostedItems
      .reduce((s, i) => s + (Number(i.nominal) || 0), 0)
      .toLocaleString("id-ID")})?`,
    executeProses
  );
};

const executeProses = async () => {
  if (isProcessing.value) return;
  isProcessing.value = true;
  try {
    const payload = {
      items: items.value
        .filter((item) => !item.klerek || item.klerek === "0")
        .map((item) => ({ nomor: item.nomor })),
      cabang: filters.cabang,
    };
    const response = await api.post<KlerekResult>("/klerek/proses", payload);
    const { message, skipped = [], warnings = [] } = response.data;

    if (skipped.length > 0 || warnings.length > 0) {
      resultDialog.message = message;
      resultDialog.skipped = skipped;
      resultDialog.warnings = warnings;
      resultDialog.show = true;
    } else {
      toast.success(message);
    }
    await fetchData();
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal memproses klerek.");
  } finally {
    isProcessing.value = false;
  }
};

onMounted(() => {
  if (!authStore.can(MENU_ID, "view")) {
    toast.error("Anda tidak memiliki hak akses untuk membuka halaman ini.");
    return router.push("/");
  }
  fetchCabangOptions();
  fetchData();
});

watch(filters, fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Klerek (Transfer Invoice Bazar)" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-check-all"
        @click="openProsesDialog"
        :loading="isProcessing"
      >
        Proses Klerek
      </v-btn>
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
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <v-select
          v-model="filters.cabang"
          :items="cabangOptions"
          item-title="nama"
          item-value="kode"
          label="Cabang Bazar"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
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
        <AppDataTable
          :headers="headers"
          :items="items"
          :loading="loading"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          :items-per-page="25"
        >
          <template #[`item.no`]="{ index }">{{ index + 1 }}</template>
          <template #[`item.tanggal`]="{ item }">{{
            format(parseISO(item.tanggal), "dd-MM-yyyy")
          }}</template>
          <template #[`item.nominal`]="{ item }">
            <div class="text-end">{{ (item.nominal || 0).toLocaleString("id-ID") }}</div>
          </template>
          <template #[`item.klerek`]="{ item }">
            <v-chip
              v-if="item.klerek && item.klerek !== '0'"
              color="success"
              size="x-small"
              variant="tonal"
            >
              {{ item.klerek }}
            </v-chip>
            <v-chip v-else color="error" size="x-small" variant="tonal"> Belum </v-chip>
          </template>
          <template #[`body.append`]>
            <tr class="bg-grey-lighten-3 font-weight-bold total-row-sticky">
              <td colspan="3" class="text-end">GRAND TOTAL :</td>
              <td class="text-start">{{ totalSummary.nominal.toLocaleString("id-ID") }}</td>
              <td colspan="4"></td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>
          {{ dialogConfirm.text }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
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

  <v-dialog v-model="resultDialog.show" max-width="560px">
    <v-card>
      <v-card-title class="text-h6 font-weight-bold">Hasil Proses Klerek</v-card-title>
      <v-card-text>
        <div class="mb-3">{{ resultDialog.message }}</div>

        <div v-if="resultDialog.skipped.length" class="mb-3">
          <div class="text-subtitle-2 text-error mb-1">
            Dilewati ({{ resultDialog.skipped.length }})
          </div>
          <v-list density="compact" class="pa-0">
            <v-list-item v-for="s in resultDialog.skipped" :key="s.nomor" class="px-0">
              <v-list-item-title class="text-body-2">{{ s.nomor }}</v-list-item-title>
              <v-list-item-subtitle class="text-wrap">{{ s.alasan }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </div>

        <div v-if="resultDialog.warnings.length">
          <div class="text-subtitle-2 text-warning mb-1">
            Perlu dicek manual ({{ resultDialog.warnings.length }})
          </div>
          <ul class="ps-4 text-body-2">
            <li v-for="(w, i) in resultDialog.warnings" :key="i">{{ w }}</li>
          </ul>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" variant="tonal" @click="resultDialog.show = false">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.filter-section {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.desktop-table {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto !important;
  overflow-x: auto !important;
}

/* --- TAMBAHKAN STYLE INI --- */
.total-row-sticky td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  background-color: #eeeeee !important;
  border-top: 1px solid #ccc;
}
</style>

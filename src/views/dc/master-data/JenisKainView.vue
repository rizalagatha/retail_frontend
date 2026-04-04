<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import MasterSimpleFormModal from "@/components/form/MasterSimpleFormModal.vue";
import * as XLSX from "xlsx";
import type { AxiosError } from "axios";

// --- Tipe Data ---
interface JenisKain {
  Kode: string;
  JenisKain: string;
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "201";

const dataList = ref<JenisKain[]>([]);
const loading = ref(true);
const selected = ref<JenisKain[]>([]);
const dialogConfirm = ref(false);
const itemToDelete = ref<JenisKain | null>(null);
const isFormModalVisible = ref(false);

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<JenisKain | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);

// --- Konfigurasi Tabel ---
const headers = [
  { title: "Kode", key: "Kode", width: "150px" },
  { title: "Jenis Kain", key: "JenisKain" },
];

// --- Methods ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  try {
    const response = await api.get<JenisKain[]>("/jenis-kain");
    dataList.value = response.data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error("Gagal mengambil data.");
    }
  } finally {
    loading.value = false;
  }
};

const handleNew = () => {
  isFormModalVisible.value = true;
};

const handleDelete = () => {
  if (!isSingleSelected.value) return;
  itemToDelete.value = selectedRow.value;
  dialogConfirm.value = true;
};

const confirmDelete = async () => {
  if (!itemToDelete.value) return;
  try {
    const jenisKain = itemToDelete.value.JenisKain;
    const response = await api.delete(`/jenis-kain/${encodeURIComponent(jenisKain)}`);
    toast.success(response.data.message);
    fetchData();
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;

    toast.error(error.response?.data?.message || error.message || "Gagal menghapus data.");
  } finally {
    dialogConfirm.value = false;
    itemToDelete.value = null;
  }
};

const exportData = () => {
  if (dataList.value.length === 0) return toast.warning("Tidak ada data untuk diexport.");
  const worksheet = XLSX.utils.json_to_sheet(dataList.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Jenis Kain");
  XLSX.writeFile(workbook, "Export_Jenis_Kain.xlsx");
};

// Dipanggil setelah modal berhasil menyimpan
const onDataSaved = () => {
  fetchData();
};

onMounted(fetchData);
</script>

<template>
  <PageLayout title="Browse Jenis Kain" icon="mdi-texture-box">
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
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        prepend-icon="mdi-delete"
        color="error"
        @click="handleDelete"
        :disabled="!isSingleSelected"
        >Hapus</v-btn
      >
      <v-btn size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel"
        >Export</v-btn
      >
    </template>

    <div class="browse-content">
      <div class="table-container">
        <v-data-table
          v-model="selected"
          :headers="headers"
          :items="dataList"
          :loading="loading"
          item-value="Kode"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          single-select
        >
        </v-data-table>
      </div>
    </div>

    <MasterSimpleFormModal
      v-if="isFormModalVisible"
      title="Tambah Jenis Kain Baru"
      apiUrl="/jenis-kain"
      label1="Kode"
      field1="Kode"
      label2="Jenis Kain"
      field2="JenisKain"
      @close="isFormModalVisible = false"
      @saved="onDataSaved"
    />

    <v-dialog v-model="dialogConfirm" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Anda yakin ingin menghapus jenis kain: <strong>{{ itemToDelete?.JenisKain }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm = false">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="confirmDelete">Ya, Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

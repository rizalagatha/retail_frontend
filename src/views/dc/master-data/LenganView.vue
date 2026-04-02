<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import MasterSimpleFormModal from "@/components/form/MasterSimpleFormModal.vue";
import * as XLSX from "xlsx";
import axios from "axios";

// --- Tipe Data ---
interface LenganItem {
  Lengan: string;
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "203";

const dataList = ref<LenganItem[]>([]);
const loading = ref(true);
const selected = ref<LenganItem[]>([]);
const dialogConfirm = ref(false);
const itemToDelete = ref<LenganItem | null>(null);
const isFormModalVisible = ref(false);

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<LenganItem | null>(() =>
  isSingleSelected.value ? selected.value[0] : null
);

// --- Konfigurasi Tabel ---
const headers = [{ title: "Lengan", key: "Lengan" }];

// --- Methods ---
const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  try {
    const response = await api.get<LenganItem[]>("/lengan");
    dataList.value = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let errorMessage = "Gagal mengambil data.";
    if (axios.isAxiosError(error)) {
      errorMessage = error.response?.data?.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    // Lempar 1 parameter string saja
    toast.error(errorMessage);
  } finally {
    loading.value = false;
  }
};

const handleNew = () => {
  isFormModalVisible.value = true;
};

const onDataSaved = () => {
  fetchData();
};

const handleDelete = () => {
  if (!isSingleSelected.value) return;
  itemToDelete.value = selectedRow.value;
  dialogConfirm.value = true;
};

const confirmDelete = async () => {
  if (!itemToDelete.value) return;
  try {
    const lengan = itemToDelete.value.Lengan;
    const response = await api.delete(`/lengan/${encodeURIComponent(lengan)}`);
    toast.success(response.data.message);
    fetchData();
  } catch {
    toast.error("Gagal menghapus data.");
  } finally {
    dialogConfirm.value = false;
    itemToDelete.value = null;
  }
};

const exportData = () => {
  if (dataList.value.length === 0) return toast.warning("Tidak ada data untuk diexport.");
  const worksheet = XLSX.utils.json_to_sheet(dataList.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Lengan");
  XLSX.writeFile(workbook, "Export_Lengan.xlsx");
};

const handleRowClick = (_event: Event, { item }: { item: LenganItem }) => {
  selected.value = [item];
};

onMounted(fetchData);
</script>

<template>
  <PageLayout title="Browse Lengan" icon="mdi-tshirt-crew-outline">
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
          item-value="Lengan"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          single-select
          hover
          @click:row="handleRowClick"
        >
        </v-data-table>
      </div>
    </div>

    <MasterSimpleFormModal
      v-if="isFormModalVisible"
      title="Tambah Lengan Baru"
      apiUrl="/lengan"
      label1="Lengan"
      field1="Lengan"
      :show-field2="false"
      @close="isFormModalVisible = false"
      @saved="onDataSaved"
    />

    <v-dialog v-model="dialogConfirm" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Anda yakin ingin menghapus Lengan: <strong>{{ itemToDelete?.Lengan }}</strong
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

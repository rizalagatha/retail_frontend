<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import MasterSimpleFormModal from '@/components/form/MasterSimpleFormModal.vue';
import type { AxiosError } from 'axios';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '202';

// ✅ Definisikan tipe untuk data warna kain
interface WarnaKain {
  Kode: string;
  Warna: string;
}

// State
const dataList = ref<WarnaKain[]>([]);
const loading = ref(true);
const selected = ref<WarnaKain[]>([]);
const dialogConfirm = ref(false);
const itemToDelete = ref<WarnaKain | null>(null);
const isFormModalVisible = ref(false);

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));

const headers = [
  { title: 'Kode', key: 'Kode', width: '150px' },
  { title: 'Warna Kain', key: 'Warna' },
];

const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  try {
    const response = await api.get<WarnaKain[]>('/warna-kain');
    dataList.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
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
    const warna = itemToDelete.value.Warna;
    const response = await api.delete<{ message: string }>(
      `/warna-kain/${encodeURIComponent(warna)}`
    );
    toast.success(response.data.message);
    fetchData();
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus data.');
  } finally {
    dialogConfirm.value = false;
    itemToDelete.value = null;
  }
};

const exportData = () => {
  if (dataList.value.length === 0) return toast.warning('Tidak ada data untuk diexport.');
  const worksheet = XLSX.utils.json_to_sheet(dataList.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Warna Kain');
  XLSX.writeFile(workbook, 'Export_Warna_Kain.xlsx');
};

onMounted(fetchData);
</script>


<template>
  <PageLayout title="Browse Warna Kain" icon="mdi-palette">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        @click="handleDelete" :disabled="!isSingleSelected">Hapus</v-btn>
      <v-btn size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div class="browse-content">
      <div class="table-container">
        <v-data-table v-model="selected" :headers="headers" :items="dataList" :loading="loading" item-value="Kode"
          density="compact" class="desktop-table" fixed-header show-select return-object single-select>
        </v-data-table>
      </div>
    </div>

    <MasterSimpleFormModal v-if="isFormModalVisible" title="Tambah Warna Kain Baru" apiUrl="/warna-kain" label1="Kode"
      field1="Kode" label2="Warna Kain" field2="Warna" @close="isFormModalVisible = false" @saved="onDataSaved" />

    <v-dialog v-model="dialogConfirm" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Anda yakin ingin menghapus warna kain: <strong>{{ itemToDelete?.Warna }}</strong>?
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

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'vue-router';
import { AxiosError } from 'axios';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '41';

interface LhkItem {
  Tanggal: string;
  Cab: string;
  SoDtf: string;
  [key: string]: unknown;
}

// --- State ---
const lhkList = ref<LhkItem[]>([]);
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || '');
const selected = ref<LhkItem[]>([]);

const isConfirmDialogVisible = ref(false);
const itemToDelete = ref<LhkItem | null>(null);

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);

const canEditOrDelete = computed(() => {
  if (!isSingleSelected.value) return false;

  const userCabang = authStore.user?.cabang;
  const recordCabang = selected.value[0].Cab;

  // User KDC boleh melakukan apa saja (sesuai asumsi dari Delphi, KDC punya akses luas)
  if (userCabang === 'KDC') return true;

  // Selain itu, cabang user harus sama dengan cabang di data
  return userCabang === recordCabang;
});

const headers = [
  { title: 'Tanggal', key: 'Tanggal', width: '120px' },
  { title: 'Cabang', key: 'Cab', width: '100px' },
  { title: 'No. SO DTF', key: 'SoDtf', width: '180px' },
  { title: 'Nama DTF', key: 'NamaDTF', width: '250px' },
  { title: 'Depan', key: 'Depan', align: 'end', width: '100px' },
  { title: 'Belakang', key: 'Belakang', align: 'end', width: '100px' },
  { title: 'Lengan', key: 'Lengan', align: 'end', width: '100px' },
  { title: 'Variasi', key: 'Variasi', align: 'end', width: '100px' },
  { title: 'Saku', key: 'Saku', align: 'end', width: '100px' },
  { title: 'Panjang (Mtr)', key: 'PanjangMtr', align: 'end', width: '120px' },
  { title: 'Buangan (Mtr)', key: 'BuanganMtr', align: 'end', width: '120px' },
  { title: 'Keterangan', key: 'Keterangan', width: '300px' },
] as const;

const footerProps = { 'items-per-page-options': [10, 25, 50, -1] };
const getItemId = (item: LhkItem) => `${item.Tanggal}-${item.SoDtf}-${item.Cab}`;

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/lhk-so-dtf/cabang-list');
    cabangList.value = response.data;
    // Jika user KDC, defaultnya adalah KDC itu sendiri, bukan 'ALL'
    if (authStore.user?.cabang === 'KDC') {
      selectedCabang.value = 'KDC';
    }
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.', error);
  }
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value || !selectedCabang.value) return;
  isLoading.value = true;
  try {
    const response = await api.get('/lhk-so-dtf', {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
      }
    });
    lhkList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data LHK SO DTF.', error);
  } finally {
    isLoading.value = false;
  }
};

const showDeleteConfirmation = () => {
  if (!isSingleSelected.value) return;
  itemToDelete.value = selected.value[0];
  isConfirmDialogVisible.value = true;
};

const deleteItem = async () => {
  if (!itemToDelete.value) return;
  try {
    await api.delete('/lhk-so-dtf', {
      params: {
        Tanggal: format(parseISO(itemToDelete.value.Tanggal), 'yyyy-MM-dd'),
        SoDtf: itemToDelete.value.SoDtf,
        Cab: itemToDelete.value.Cab
      }
    });
    toast.success('Data LHK berhasil dihapus.');
    fetchData();
    selected.value = [];
  } catch (err) {
    if (err instanceof AxiosError) {
      toast.error(err.response?.data?.message || 'Gagal menghapus data.');
    } else {
      toast.error('Gagal menghapus data.');
    }
  } finally {
    isConfirmDialogVisible.value = false;
    itemToDelete.value = null;
  }
};

const handleEdit = () => {
  if (!canEditOrDelete.value) return;
  const selectedItem = selected.value[0];
  router.push({
    path: '/transaksi/penjualan/dtf/lhk-so-dtf/edit', // Gunakan path eksplisit
    query: {
      tanggal: format(parseISO(selectedItem.Tanggal), 'yyyy-MM-dd'),
      cabang: selectedItem.Cab
    }
  });
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
  <PageLayout title="LHK SO DTF" desktop-mode icon="mdi-clipboard-text-clock">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/dtf/lhk-so-dtf/edit')">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!canEditOrDelete" prepend-icon="mdi-pencil"
        @click="handleEdit">
        Ubah
      </v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!canEditOrDelete"
        prepend-icon="mdi-delete" @click="showDeleteConfirmation">
        Hapus
      </v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Periode:</span>
        <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined"
          style="min-width: 140px;" />
        <span class="mx-2">s/d</span>
        <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined"
          style="min-width: 140px;" />
        <span class="filter-label ms-4">Store:</span>
        <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" style="max-width: 180px;" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" title="Muat Ulang Data" />
      </div>

      <AppDataTable v-model="selected" :headers="headers" :items="lhkList" :loading="isLoading" :item-value="getItemId"
        :footer-props="footerProps" density="compact" class="desktop-table fill-height-table" fixed-header show-select
        return-object>
        <template v-slot:[`item.Tanggal`]="{ item }">
          {{ format(new Date(item.Tanggal), 'dd/MM/yyyy') }}
        </template>
      </AppDataTable>
    </div>

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Anda yakin ingin menghapus data LHK untuk SO: <strong>{{ itemToDelete?.SoDtf }}</strong>
          pada tanggal <strong>{{ itemToDelete ? format(new Date(itemToDelete.Tanggal), 'dd/MM/yyyy') : '' }}</strong>?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isConfirmDialogVisible = false">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="deleteItem">Ya, Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

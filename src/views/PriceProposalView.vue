<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import { useRouter } from 'vue-router';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '38';

interface PriceProposal {
  nomor: string;
  tanggal: string;
  kdcus: string;
  customer: string;
  jenisKaos: string;
  keterangan: string;
  approval: string;
  cabang: string;
  created: string;
}

// --- State ---
const proposals = ref<PriceProposal[]>([]);
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const selectedCabang = ref(authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang || '');
const belumApproval = ref(true);
const cabangList = ref([]);
const selected = ref<PriceProposal[]>([]);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const dialogDelete = ref(false);
const itemToDelete = ref<PriceProposal | null>(null);

const tableHeaders = [
  { title: 'Nomor', key: 'nomor' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Customer', key: 'customer' },
  { title: 'Jenis Kaos', key: 'jenisKaos' },
  { title: 'Keterangan', key: 'keterangan' },
  { title: 'Approval', key: 'approval' },
  { title: 'Cabang', key: 'cabang' },
  { title: 'User', key: 'created' },
];

const isSingleSelected = computed(() => selected.value.length === 1);

// --- Methods ---
const fetchCabangList = async () => {
  try {
    // Asumsi API ini ada untuk mengambil daftar cabang
    const response = await api.get('/offers/branch-options', {
      params: { userCabang: authStore.user?.cabang }
    });
    // Tambahkan opsi "ALL" jika user adalah KDC
    if (authStore.user?.cabang === 'KDC') {
      cabangList.value = [{ kode: 'ALL', nama: 'SEMUA CABANG' }, ...response.data];
    } else {
      cabangList.value = response.data;
    }
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.');
  }
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value) {
    return; // Hentikan fungsi jika salah satu tanggal kosong
  }
  isLoading.value = true;
  try {
    const response = await api.get('/price-proposals', {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
        belumApproval: belumApproval.value,
      }
    });
    proposals.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data pengajuan harga.');
  } finally {
    isLoading.value = false;
  }
};

const editProposal = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].nomor;
  router.push(`/pengajuan-harga/ubah/${nomor}`);
};

const deleteProposal = async (item: PriceProposal) => {
  try {
    // Asumsi endpoint hapus ada di /api/price-proposals/:nomor
    await api.delete(`/price-proposals/${item.nomor}`);
    toast.success(`Pengajuan harga ${item.nomor} berhasil dihapus.`);
    fetchData();
    selected.value = [];
  } catch (error) {
    toast.error('Gagal menghapus pengajuan harga.');
  }
};

const confirmDelete = () => {
  if (!isSingleSelected.value) return;
  itemToDelete.value = selected.value[0];
  dialogDelete.value = true;
};

const deleteConfirmed = () => {
  if (itemToDelete.value) {
    deleteProposal(itemToDelete.value);
  }
  dialogDelete.value = false;
  itemToDelete.value = null;
};

onMounted(() => {
  // (4) Cek hak view sebelum memuat data
  if (authStore.can(MENU_ID, 'view')) {
    hasViewPermission.value = true;
    fetchData();
    fetchCabangList();
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});

watch([selectedCabang, belumApproval, startDate, endDate], () => {
  if (hasViewPermission.value) fetchData();
});
</script>

<template>
  <PageLayout title="Pengajuan Harga" desktop-mode icon="mdi-cash-plus">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" prepend-icon="mdi-plus"
        @click="router.push('/pengajuan-harga/new')">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
        @click="editProposal">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="confirmDelete">Hapus</v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <!-- Filter Section -->
      <div class="filter-section">
        <div class="d-flex align-center ga-2">
          <span class="filter-label">Periode:</span>
          <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined"
            style="min-width: 140px;"></v-text-field>
          <span>s/d</span>
          <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined"
            style="min-width: 140px;"></v-text-field>
        </div>
        <div class="d-flex align-center ga-2" style="min-width: 220px;">
          <span class="filter-label">Cabang:</span>
          <v-select v-model="selectedCabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
            hide-details variant="outlined" style="max-width: 180px;"
            :menu-props="{ class: 'compact-select-list' }"></v-select>
        </div>
        <v-checkbox v-model="belumApproval" label="Belum Approve" hide-details density="compact"></v-checkbox>
        <v-spacer></v-spacer>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <!-- Table Section -->
      <v-data-table v-model="selected" :headers="tableHeaders" :items="proposals" :loading="isLoading"
        item-value="nomor" density="compact" class="desktop-table" fixed-header show-select return-object>
        <template #item.tanggal="{ item }">
          {{ format(new Date(item.tanggal), 'dd/MM/yyyy') }}
        </template>
        <template #item.approval="{ item }">
          <v-chip :color="item.approval ? 'success' : 'error'" variant="tonal" size="x-small">
            {{ item.approval || 'Belum' }}
          </v-chip>
        </template>
      </v-data-table>
    </div>

    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text>Apakah Anda yakin ingin menghapus pengajuan harga nomor <strong>{{ itemToDelete?.nomor
        }}</strong>?</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialogDelete = false">Batal</v-btn>
          <v-btn color="red-darken-1" variant="elevated" @click="deleteConfirmed">Hapus</v-btn>
          <v-spacer></v-spacer>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  border: 1px solid #e0e0e0;
  background-color: #ffffff;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.filter-section {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 10px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.filter-label {
  font-size: 11px;
  font-weight: 500;
  color: #424242;
}

.desktop-table {
  font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding: 0 8px !important;
  height: 28px !important;
}

.state-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #757575;
}

.filter-section :deep(input),
.filter-section :deep(.v-label),
.filter-section :deep(.v-select__selection-text) {
  font-size: 11px !important;
}

/* Mengatur tinggi dari field agar lebih ringkas */
.filter-section :deep(.v-field) {
  height: 36px;
}

.filter-section :deep(.v-field__input) {
  min-height: 36px;
  padding-top: 0;
  padding-bottom: 0;
}

:deep(.compact-select-list .v-list-item-title) {
    font-size: 11px !important;
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import { useRouter } from 'vue-router';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '11';

interface BarcodeHeader {
  nomor: string;
  tanggal: string;
  user: string;
}

interface BarcodeDetail {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
}

// --- State ---
const headers = ref<BarcodeHeader[]>([]);
const details = ref<{ [key: string]: BarcodeDetail[] }>({});
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const expandedRows = ref<Set<string>>(new Set()); // Menggunakan Set untuk performa
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

const detailHeaders = [
    { title: 'Kode', key: 'kode'},
    { title: 'Barcode', key: 'barcode'},
    { title: 'Nama', key: 'nama'},
    { title: 'Ukuran', key: 'ukuran'},
    { title: 'Jumlah', key: 'jumlah', align: 'end' },
] as const;

const tableHeaders = [
  { title: 'Nomor', key: 'nomor' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'User', key: 'user' },
  { title: 'Action', key: 'actions', sortable: false, width: '100px' },
] as const;

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const cabang = authStore.user?.cabang || '';
    const response = await api.get('/barcodes', {
      params: { startDate: startDate.value, endDate: endDate.value, cabang }
    });
    headers.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};

const toggleExpand = async (nomor: string) => {
    if (expandedRows.value.has(nomor)) {
        expandedRows.value.delete(nomor);
    } else {
        expandedRows.value.add(nomor);
        if (!details.value[nomor]) {
            try {
                const response = await api.get(`/barcodes/${nomor}`);
                details.value = { ...details.value, [nomor]: response.data };
            } catch (error) {
                toast.error(`Gagal memuat detail untuk nomor ${nomor}`);
            }
        }
    }
};

const goToCreatePage = () => {
    router.push('/cetak-barcode/new');
};

onMounted(() => {
  if (hasViewPermission.value) {
    fetchData();
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});
</script>

<template>
  <PageLayout title="Cetak Barcode" desktop-mode icon="mdi-barcode-scan">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="goToCreatePage" prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn size="small" prepend-icon="mdi-pencil" disabled>Ubah</v-btn>
      <v-btn size="small" prepend-icon="mdi-delete" disabled>Hapus</v-btn>
    </template>
    
    <div v-if="!hasViewPermission" class="state-container">
        <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
        <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <!-- Filter Section -->
      <div class="filter-section">
        <span class="filter-label">Periode:</span>
        <v-text-field v-model="startDate" type="date" density="compact" hide-details variant="outlined" style="min-width: 140px;"></v-text-field>
        <span>s/d</span>
        <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined" style="min-width: 140px;"></v-text-field>
        <v-spacer></v-spacer>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <!-- Table Section -->
      <div v-if="isLoading" class="state-container">
        <v-progress-circular indeterminate color="primary"></v-progress-circular>
        <div class="mt-2 text-caption">Memuat data...</div>
      </div>
      
      <div v-else class="table-wrapper">
        <v-table density="compact" class="desktop-table">
          <thead>
            <tr>
              <th v-for="header in tableHeaders" :key="header.key" :style="{width: header.width}">{{ header.title }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="item in headers" :key="item.nomor">
              <tr>
                <td>{{ item.nomor }}</td>
                <td>{{ format(new Date(item.tanggal), 'dd/MM/yyyy') }}</td>
                <td>{{ item.user }}</td>
                <td>
                  <v-btn
                    @click="toggleExpand(item.nomor)"
                    :icon="expandedRows.has(item.nomor) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                    size="x-small"
                    variant="text"
                    color="primary"
                  ></v-btn>
                </td>
              </tr>
              
              <tr v-if="expandedRows.has(item.nomor)" class="expanded-row">
                <td :colspan="tableHeaders.length">
                  <div v-if="!details[item.nomor]" class="text-center py-2">
                    <v-progress-circular indeterminate size="20" class="mr-2"></v-progress-circular>
                    <span class="text-caption">Memuat detail...</span>
                  </div>
                  <v-data-table
                    v-else-if="details[item.nomor] && details[item.nomor].length > 0"
                    :headers="detailHeaders"
                    :items="details[item.nomor]"
                    density="compact"
                    hide-default-footer
                    :items-per-page="-1"
                    class="detail-table"
                  ></v-data-table>
                  <div v-else class="text-center py-2 text-caption text-medium-emphasis">
                    Tidak ada detail ditemukan untuk nomor {{ item.nomor }}
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </v-table>
      </div>
    </div>
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
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid #e0e0e0;
    flex-shrink: 0;
}
.filter-label {
    font-size: 11px;
    font-weight: 500;
    color: #424242;
}
.table-wrapper {
    flex-grow: 1;
    overflow-y: auto;
}
.desktop-table {
    font-size: 11px;
}
.desktop-table :deep(td), .desktop-table :deep(th) {
    padding: 4px 8px !important;
    height: 28px !important;
}
.desktop-table :deep(thead) {
    background-color: #f5f5f5;
}
.expanded-row td {
    padding: 8px 16px !important;
    background-color: #fafafa;
}
.state-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #757575;
}
.detail-table {
    font-size: 10px;
}
</style>


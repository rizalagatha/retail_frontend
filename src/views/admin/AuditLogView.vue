<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
// import { useAuthStore } from '@/stores/authStore'; // (Opsional, jika tidak dipakai bisa dihapus)
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import AppDataTable from '@/components/AppDataTable.vue';
import { AxiosError } from 'axios';
import DataViewer from '@/components/DataViewer.vue'; // Pastikan path ini benar

// --- Interface & Type Definitions ---
interface DataTableHeader {
  title: string;
  key: string;
  width?: string | number;
  minWidth?: string | number;
  align?: 'start' | 'center' | 'end';
  sortable?: boolean;
  fixed?: boolean;
  cellClass?: string;
  headerProps?: Record<string, unknown>;
}

interface AuditLogItem {
  id: number;
  user_id: string;
  action: string;
  module: string;
  target_id: string;
  note: string;
  old_values: string | null;
  new_values: string | null;
  ip_address: string;
  user_agent: string;
  user_cabang: string;
  log_date: string;
}

const toast = useToast();
const MENU_ID = '602';

const isLoading = ref(false);
const logs = ref<AuditLogItem[]>([]);
const totalItems = ref(0);
const moduleOptions = ref<string[]>([]);
const cabangOptions = ref<string[]>([]);

// State untuk Modal Detail
const showDetailModal = ref(false);
const selectedLog = ref<AuditLogItem | null>(null);

// Default Filter: Hari ini
const today = new Date().toISOString().substr(0, 10);
const filters = reactive({
  startDate: today,
  endDate: today,
  module: 'ALL',
  user: '',
  action: 'ALL',
  cabang: 'ALL', // Tambah filter cabang
  page: 1,
  itemsPerPage: 15
});

const actionOptions = ref<string[]>([]);

// --- Headers Table ---
const headers = computed<DataTableHeader[]>(() => [
  { title: 'Waktu', key: 'log_date', width: '160px' },
  { title: 'User', key: 'user_id', width: '120px' },
  { title: 'Cab', key: 'user_cabang', width: '80px' },
  { title: 'Action', key: 'action', width: '120px', align: 'center' },
  { title: 'Modul', key: 'module', width: '150px' },
  { title: 'Target ID', key: 'target_id', width: '180px' },
  { title: 'Keterangan', key: 'note', minWidth: '300px' },
  { title: 'Detail', key: 'actions', sortable: false, align: 'center', width: '80px', fixed: true },
]);

// --- Methods ---

const fetchCabang = async () => {
  try {
    const response = await api.get('/audit-logs/cabang');
    cabangOptions.value = ['ALL', ...response.data];
  } catch (error) {
    console.error("Gagal load cabang", error);
  }
};

const fetchModules = async () => {
  try {
    const response = await api.get('/audit-logs/modules');
    moduleOptions.value = ['ALL', ...response.data];
  } catch (error) {
    console.error("Gagal load modules", error);
  }
};

const fetchActions = async () => {
  try {
    const response = await api.get('/audit-logs/actions');
    // Default 'ALL', sisanya dari database
    actionOptions.value = ['ALL', ...response.data];
  } catch (error) {
    console.error("Gagal load actions", error);
    // Fallback jika API gagal (opsional)
    actionOptions.value = ['ALL', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'];
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const params = {
      ...filters,
      page: filters.page,
      itemsPerPage: filters.itemsPerPage
    };
    const response = await api.get('/audit-logs', { params });
    logs.value = response.data.items;
    totalItems.value = response.data.total;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data log audit.');
  } finally {
    isLoading.value = false;
  }
};

const openDetail = (item: AuditLogItem) => {
  selectedLog.value = item;
  showDetailModal.value = true;
};

// Helper Format Tanggal
const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'dd-MM-yyyy HH:mm:ss');
  } catch {
    return dateStr;
  }
};

// Helper untuk parse JSON string menjadi Object (agar aman)
const parseJson = (jsonStr: string | null) => {
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
};

// Helper Warna Badge Action (Update agar support dynamic action, beri warna default)
const getActionColor = (action: string) => {
  switch (action?.toUpperCase()) {
    case 'CREATE': return 'success';
    case 'UPDATE': return 'warning';
    case 'DELETE': return 'error';
    case 'APPROVE': return 'info';
    case 'CANCEL': case 'REJECT': return 'grey-darken-3'; // Tambah REJECT jika ada
    case 'LOGIN': return 'primary';
    case 'REQUEST_EDIT': return 'purple'; // Biar beda
    default: return 'secondary'; // Warna default untuk action tak dikenal
  }
};

const onUpdateOptions = (opts: { page: number; itemsPerPage: number }) => {
  filters.page = opts.page;
  filters.itemsPerPage = opts.itemsPerPage;
  fetchData();
};

// --- Lifecycle & Watchers ---
onMounted(() => {
  fetchModules();
  fetchActions();
  fetchCabang();
  fetchData();
});

watch(
  () => [filters.startDate, filters.endDate, filters.module, filters.action, filters.cabang],
  () => {
    filters.page = 1;
    fetchData();
  },
  { deep: true }
);

watch(() => filters.page, fetchData); // Fetch saat pagination berubah

</script>

<template>
  <PageLayout title="Audit Trail Log" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" icon="mdi-refresh" variant="text" :loading="isLoading" @click="fetchData" />
    </template>

    <div class="audit-content">
      <div class="filter-section d-flex align-center flex-wrap ga-3 mb-3">
        <v-text-field type="date" v-model="filters.startDate" label="Dari" density="compact" hide-details
          variant="outlined" style="max-width: 170px" />

        <v-text-field type="date" v-model="filters.endDate" label="Sampai" density="compact" hide-details
          variant="outlined" style="max-width: 170px" />

        <v-select v-model="filters.cabang" :items="cabangOptions" label="Cabang" density="compact" hide-details
          variant="outlined" style="max-width: 140px" />

        <v-select v-model="filters.module" :items="moduleOptions" label="Modul" density="compact" hide-details
          variant="outlined" style="max-width: 160px" />

        <v-select v-model="filters.action" :items="actionOptions" label="Action" density="compact" hide-details
          variant="outlined" style="max-width: 140px" />

        <v-text-field v-model="filters.user" label="Cari User" prepend-inner-icon="mdi-account-search" density="compact"
          hide-details variant="outlined" style="max-width: 180px" @keyup.enter="fetchData" />

        <v-btn color="primary" @click="fetchData">
          Cari
        </v-btn>

        <v-btn icon="mdi-refresh" variant="text" @click="fetchData" />
      </div>


      <div class="table-container elevation-1 rounded bg-white">
        <AppDataTable :server="true" :headers="headers" :items="logs" :loading="isLoading"
          class="desktop-table header-browse-blue" density="compact" fixed-header height="600px"
          :items-length="totalItems" @update:options="onUpdateOptions">
          <template v-slot:[`item.log_date`]="{ item }">
            <span class="text-caption">{{ formatDate(item.log_date) }}</span>
          </template>

          <template v-slot:[`item.user_id`]="{ item }">
            <span class="font-weight-bold text-primary">{{ item.user_id }}</span>
          </template>

          <template v-slot:[`item.action`]="{ item }">
            <v-chip size="x-small" :color="getActionColor(item.action)" class="font-weight-bold text-uppercase">
              {{ item.action }}
            </v-chip>
          </template>

          <template v-slot:[`item.note`]="{ item }">
            <span class="text-body-2 text-truncate d-block" style="max-width: 400px;" :title="item.note">
              {{ item.note }}
            </span>
          </template>

          <template v-slot:[`item.actions`]="{ item }">
            <v-btn size="x-small" color="info" variant="tonal" icon="mdi-eye" @click="openDetail(item)"
              title="Lihat Detail"></v-btn>
          </template>

        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="showDetailModal" max-width="1000px" scrollable>
      <v-card v-if="selectedLog">
        <v-card-title class="bg-grey-lighten-3 d-flex justify-space-between align-center">
          <span class="text-subtitle-1 font-weight-bold">Detail Log #{{ selectedLog.id }}</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="showDetailModal = false"></v-btn>
        </v-card-title>

        <v-divider></v-divider>

        <v-card-text class="pa-4" style="max-height: 75vh;">
          <div class="bg-grey-lighten-4 pa-3 rounded mb-4 border">
            <v-row dense>
              <v-col cols="12" md="6">
                <div class="d-flex mb-1">
                  <strong style="width: 80px;">User:</strong>
                  <span class="text-primary font-weight-bold">{{ selectedLog.user_id }}</span>
                </div>
                <div class="d-flex mb-1">
                  <strong style="width: 80px;">Waktu:</strong>
                  <span>{{ formatDate(selectedLog.log_date) }}</span>
                </div>
                <div class="d-flex">
                  <strong style="width: 80px;">Modul:</strong>
                  <span>{{ selectedLog.module }}</span>
                </div>
              </v-col>
              <v-col cols="12" md="6">
                <div class="d-flex mb-1">
                  <strong style="width: 80px;">IP:</strong>
                  <span class="text-grey-darken-2">{{ selectedLog.ip_address }}</span>
                </div>
                <div class="d-flex mb-1">
                  <strong style="width: 80px;">Browser:</strong>
                  <span class="text-caption text-grey-darken-2 text-truncate" :title="selectedLog.user_agent">
                    {{ selectedLog.user_agent }}
                  </span>
                </div>
                <div class="d-flex">
                  <strong style="width: 80px;">Target:</strong>
                  <span class="font-weight-medium">{{ selectedLog.target_id }}</span>
                </div>
              </v-col>
            </v-row>
            <v-divider class="my-2"></v-divider>
            <div class="pa-2 bg-blue-lighten-5 rounded border border-blue-lighten-3 text-blue-darken-3">
              <strong>Catatan:</strong> {{ selectedLog.note }}
            </div>
          </div>

          <v-row>
            <v-col cols="12" md="6">
              <div class="d-flex align-center mb-2">
                <v-icon color="error" size="small" class="mr-2">mdi-minus-circle-outline</v-icon>
                <h4 class="text-error mb-0">Data Lama (Before)</h4>
              </div>

              <div class="data-box bg-red-lighten-5 border-red">
                <div v-if="selectedLog.old_values">
                  <DataViewer :data="parseJson(selectedLog.old_values)" />
                </div>
                <div v-else class="empty-state text-error">
                  <v-icon icon="mdi-cancel" class="mb-2"></v-icon>
                  <div>Tidak ada data lama (Aksi Create/Login)</div>
                </div>
              </div>
            </v-col>

            <v-col cols="12" md="6">
              <div class="d-flex align-center mb-2">
                <v-icon color="success" size="small" class="mr-2">mdi-plus-circle-outline</v-icon>
                <h4 class="text-success mb-0">Data Baru (After)</h4>
              </div>

              <div class="data-box bg-green-lighten-5 border-green">
                <div v-if="selectedLog.new_values">
                  <DataViewer :data="parseJson(selectedLog.new_values)" />
                </div>
                <div v-else class="empty-state text-success">
                  <v-icon icon="mdi-cancel" class="mb-2"></v-icon>
                  <div>Tidak ada data baru (Aksi Delete)</div>
                </div>
              </div>
            </v-col>
          </v-row>

        </v-card-text>
      </v-card>
    </v-dialog>

  </PageLayout>
</template>

<style scoped>
.audit-content {
  padding: 16px;
}

.table-container {
  overflow: hidden;
}

/* Styling Data Box */
.data-box {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 16px;
  height: 450px;
  /* Tinggi fix agar rapi */
  overflow-y: auto;
  /* Scroll jika konten panjang */
  font-size: 13px;
  background-color: #fff;
}

.border-red {
  border-color: #ffcdd2 !important;
}

.border-green {
  border-color: #c8e6c9 !important;
}

.bg-red-lighten-5 {
  background-color: #ffebee !important;
}

.bg-green-lighten-5 {
  background-color: #e8f5e9 !important;
}

/* Empty State Style */
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  font-style: italic;
}
</style>

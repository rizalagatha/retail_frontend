<!-- views/BrowseCustomer.vue -->
<template>
  <v-container fluid class="pa-6">
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <h2 class="text-h4">Master Customer</h2>
        <v-chip color="primary" variant="outlined">
          Total: {{ filteredCustomers.length }}
        </v-chip>
      </v-card-title>

      <!-- Toolbar -->
      <v-card-text>
        <v-row class="mb-4">
          <v-col cols="12" md="8">
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                color="success"
                prepend-icon="mdi-plus"
                @click="handleAdd"
                variant="elevated"
              >
                Baru
              </v-btn>
              
              <v-btn
                color="primary"
                prepend-icon="mdi-pencil"
                :disabled="!selectedCustomer"
                @click="handleEdit"
                variant="elevated"
              >
                Ubah
              </v-btn>
              
              <v-btn
                color="error"
                prepend-icon="mdi-delete"
                :disabled="!selectedCustomer || selectedCustomer.status === 'AKTIF'"
                @click="handleDelete"
                variant="elevated"
              >
                Hapus
              </v-btn>
              
              <v-btn
                color="info"
                prepend-icon="mdi-refresh"
                :loading="loading"
                @click="refreshData"
                variant="elevated"
              >
                Refresh
              </v-btn>
            </div>
          </v-col>
          
          <v-col cols="12" md="4" class="d-flex justify-end">
            <div class="d-flex ga-2">
              <v-btn
                color="orange"
                prepend-icon="mdi-file-export"
                @click="handleExport"
                variant="outlined"
              >
                Export
              </v-btn>
              
              <v-btn
                color="purple"
                prepend-icon="mdi-file-export-outline"
                @click="handleExportDetail"
                variant="outlined"
              >
                Export Detail
              </v-btn>
            </div>
          </v-col>
        </v-row>

        <!-- Search Bar -->
        <v-text-field
          v-model="searchQuery"
          prepend-inner-icon="mdi-magnify"
          label="Cari customer (kode, nama, alamat, kota)..."
          clearable
          variant="outlined"
          class="mb-4"
          hide-details
        />

        <!-- Data Table -->
        <v-data-table
          v-model:selected="selectedRows"
          :headers="headers"
          :items="filteredCustomers"
          :loading="loading"
          item-key="kode"
          show-select
          return-object
          class="elevation-2"
          hover
          @click:row="onRowClick"
          :items-per-page="25"
          :items-per-page-options="[10, 25, 50, 100]"
        >
          <!-- Status Column -->
          <template #item.status="{ item }">
            <v-chip
              :color="item.status === 'AKTIF' ? 'success' : 'error'"
              size="small"
              variant="elevated"
            >
              {{ item.status }}
            </v-chip>
          </template>

          <!-- Level Column -->
          <template #item.level="{ item }">
            <v-chip
              v-if="item.level"
              color="primary"
              size="small"
              variant="outlined"
            >
              {{ item.level }}
            </v-chip>
            <span v-else class="text-grey">-</span>
          </template>

          <!-- Tanggal Lahir Column -->
          <template #item.tglLahir="{ item }">
            {{ formatDate(item.tglLahir) }}
          </template>

          <!-- Actions Column -->
          <template #item.actions="{ item }">
            <div class="d-flex ga-1">
              <v-btn
                icon="mdi-pencil"
                size="small"
                color="primary"
                variant="text"
                @click.stop="handleEdit(item)"
              />
              <v-btn
                icon="mdi-delete"
                size="small"
                color="error"
                variant="text"
                :disabled="item.status === 'AKTIF'"
                @click.stop="handleDelete(item)"
              />
            </div>
          </template>

          <!-- No Data -->
          <template #no-data>
            <div class="text-center pa-4">
              <v-icon size="64" color="grey-lighten-1">mdi-account-search</v-icon>
              <div class="text-h6 mt-2">Tidak ada data customer</div>
              <div class="text-body-2 text-grey">
                Klik tombol "Baru" untuk menambah customer pertama
              </div>
            </div>
          </template>

          <!-- Loading -->
          <template #loading>
            <div class="text-center pa-4">
              <v-progress-circular indeterminate color="primary" />
              <div class="mt-2">Memuat data customer...</div>
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h5">
          <v-icon color="error" class="mr-2">mdi-delete-alert</v-icon>
          Konfirmasi Hapus
        </v-card-title>
        <v-card-text>
          <div class="text-body-1">
            Yakin ingin menghapus customer berikut?
          </div>
          <div class="mt-3 pa-3 bg-grey-lighten-4 rounded">
            <div><strong>Kode:</strong> {{ customerToDelete?.kode }}</div>
            <div><strong>Nama:</strong> {{ customerToDelete?.nama }}</div>
          </div>
          <v-alert
            type="warning"
            variant="tonal"
            class="mt-3"
          >
            Data yang sudah dihapus tidak dapat dikembalikan!
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="deleteDialog = false"
          >
            Batal
          </v-btn>
          <v-btn
            color="error"
            variant="elevated"
            :loading="deleting"
            @click="confirmDelete"
          >
            Hapus
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar for notifications -->
    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="4000"
      location="top"
    >
      <div class="d-flex align-center">
        <v-icon class="mr-2">{{ snackbar.icon }}</v-icon>
        {{ snackbar.message }}
      </div>
      <template #actions>
        <v-btn
          variant="text"
          icon="mdi-close"
          @click="snackbar.show = false"
        />
      </template>
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import api from '@/utils/api';

// Types
interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  nama_kontak: string;
  tglLahir: string;
  top: string;
  level: string;
  status: 'AKTIF' | 'PASIF';
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface SnackbarState {
  show: boolean;
  message: string;
  color: 'success' | 'error' | 'warning' | 'info';
  icon: string;
}

// Composables
const router = useRouter();
const authStore = useAuthStore();

// Reactive State
const customers = ref<Customer[]>([]);
const loading = ref(false);
const deleting = ref(false);
const searchQuery = ref('');
const selectedRows = ref<Customer[]>([]);
const selectedCustomer = ref<Customer | null>(null);
const deleteDialog = ref(false);
const customerToDelete = ref<Customer | null>(null);

const snackbar = ref<SnackbarState>({
  show: false,
  message: '',
  color: 'success',
  icon: 'mdi-check'
});

// Computed
const filteredCustomers = computed(() => {
  if (!searchQuery.value) return customers.value;
  
  const query = searchQuery.value.toLowerCase().trim();
  return customers.value.filter(customer => 
    customer.nama.toLowerCase().includes(query) ||
    customer.kode.toLowerCase().includes(query) ||
    customer.alamat.toLowerCase().includes(query) ||
    customer.kota.toLowerCase().includes(query) ||
    customer.nama_kontak.toLowerCase().includes(query)
  );
});

// Table Headers - sesuai dengan SQL query di Delphi
const headers = [
  { 
    title: 'Kode', 
    key: 'kode', 
    sortable: true,
    width: '120px'
  },
  { 
    title: 'Nama', 
    key: 'nama', 
    sortable: true,
    width: '250px'
  },
  { 
    title: 'Alamat', 
    key: 'alamat', 
    sortable: true,
    width: '200px'
  },
  { 
    title: 'Kota', 
    key: 'kota', 
    sortable: true,
    width: '120px'
  },
  { 
    title: 'Telp', 
    key: 'telp', 
    sortable: true,
    width: '120px'
  },
  { 
    title: 'Nama Kontak', 
    key: 'nama_kontak', 
    sortable: true,
    width: '150px'
  },
  { 
    title: 'Tgl Lahir', 
    key: 'tglLahir', 
    sortable: true,
    width: '120px'
  },
  { 
    title: 'TOP', 
    key: 'top', 
    sortable: true,
    width: '80px'
  },
  { 
    title: 'Level', 
    key: 'level', 
    sortable: true,
    width: '140px'
  },
  { 
    title: 'Status', 
    key: 'status', 
    sortable: true,
    width: '100px'
  },
  { 
    title: 'Actions', 
    key: 'actions', 
    sortable: false,
    width: '100px'
  }
];

// Methods
const showMessage = (
  message: string, 
  type: 'success' | 'error' | 'warning' | 'info' = 'success'
) => {
  const iconMap = {
    success: 'mdi-check-circle',
    error: 'mdi-alert-circle',
    warning: 'mdi-alert',
    info: 'mdi-information'
  };

  snackbar.value = {
    show: true,
    message,
    color: type,
    icon: iconMap[type]
  };
};

const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  try {
    return new Date(dateString).toLocaleDateString('id-ID');
  } catch {
    return '-';
  }
};

// API Methods - equivalent dari Delphi procedures
const fetchCustomers = async () => {
  loading.value = true;
  try {
    // Equivalent dari btnRefreshClick di Delphi
    const response = await api.get<ApiResponse<Customer[]>>('/customers');
    
    if (response.data.success) {
      customers.value = response.data.data;
      showMessage(`Data customer berhasil dimuat (${response.data.data.length} records)`);
    } else {
      showMessage(response.data.message || 'Gagal memuat data customer', 'error');
    }
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    showMessage(
      error.response?.data?.message || 'Gagal memuat data customer', 
      'error'
    );
  } finally {
    loading.value = false;
  }
};

const refreshData = () => {
  selectedRows.value = [];
  selectedCustomer.value = null;
  fetchCustomers();
};

// Equivalent dari cxButton2Click (Add New)
const handleAdd = async () => {
  try {
    // Check permission - equivalent dari cekinsert di Delphi
    const permissionResponse = await api.get('/permissions/check', {
      params: {
        userId: authStore.user?.kode,
        action: 'insert',
        module: 'CustomerBrowse'
      }
    });

    if (!permissionResponse.data.allowed) {
      showMessage('Anda tidak berhak menambah data di modul ini', 'warning');
      return;
    }

    router.push('/customers/add');
  } catch (error) {
    console.error('Error checking permission:', error);
    // Jika error permission check, tetap lanjutkan ke form (fallback)
    router.push('/customers/add');
  }
};

// Equivalent dari cxButton1Click (Edit)
const handleEdit = async (customer?: Customer) => {
  const targetCustomer = customer || selectedCustomer.value;
  
  if (!targetCustomer) {
    showMessage('Pilih customer terlebih dahulu', 'info');
    return;
  }

  try {
    // Check permission - equivalent dari cekedit di Delphi
    const permissionResponse = await api.get('/permissions/check', {
      params: {
        userId: authStore.user?.kode,
        action: 'edit',
        module: 'CustomerBrowse'
      }
    });

    if (!permissionResponse.data.allowed) {
      showMessage('Anda tidak berhak mengubah data di modul ini', 'warning');
      return;
    }

    router.push(`/customers/edit/${targetCustomer.kode}`);
  } catch (error) {
    console.error('Error checking permission:', error);
    // Jika error permission check, tetap lanjutkan ke form (fallback)
    router.push(`/customers/edit/${targetCustomer.kode}`);
  }
};

// Equivalent dari cxButton4Click (Delete)
const handleDelete = async (customer?: Customer) => {
  const targetCustomer = customer || selectedCustomer.value;
  
  if (!targetCustomer) {
    showMessage('Pilih customer terlebih dahulu', 'info');
    return;
  }

  try {
    // Check permission - equivalent dari cekdelete di Delphi
    const permissionResponse = await api.get('/permissions/check', {
      params: {
        userId: authStore.user?.kode,
        action: 'delete',
        module: 'CustomerBrowse'
      }
    });

    if (!permissionResponse.data.allowed) {
      showMessage('Anda tidak berhak menghapus data di modul ini', 'warning');
      return;
    }

    // Check status aktif - equivalent dari Delphi check
    if (targetCustomer.status === 'AKTIF') {
      showMessage('Status aktif. tidak bisa dihapus.', 'warning');
      return;
    }

    customerToDelete.value = targetCustomer;
    deleteDialog.value = true;
  } catch (error) {
    console.error('Error checking permission:', error);
    showMessage('Gagal memeriksa hak akses', 'error');
  }
};

const confirmDelete = async () => {
  if (!customerToDelete.value) return;

  deleting.value = true;
  try {
    // Equivalent dari delete query di Delphi
    const response = await api.delete(`/customers/${customerToDelete.value.kode}`);
    
    if (response.data.success) {
      // Remove from local state
      customers.value = customers.value.filter(
        c => c.kode !== customerToDelete.value!.kode
      );
      selectedRows.value = [];
      selectedCustomer.value = null;
      
      showMessage('Customer berhasil dihapus', 'success');
    } else {
      showMessage(response.data.message || 'Gagal menghapus customer', 'error');
    }
  } catch (error: any) {
    console.error('Error deleting customer:', error);
    showMessage(
      error.response?.data?.message || 'Gagal menghapus customer', 
      'error'
    );
  } finally {
    deleting.value = false;
    deleteDialog.value = false;
    customerToDelete.value = null;
  }
};

const handleExport = () => {
  // TODO: Implement export functionality
  showMessage('Fitur export sedang dalam pengembangan', 'info');
};

const handleExportDetail = () => {
  // TODO: Implement export detail functionality
  showMessage('Fitur export detail sedang dalam pengembangan', 'info');
};

// Event Handlers
const onRowClick = (event: any, { item }: { item: Customer }) => {
  selectedCustomer.value = item;
};

// Watchers
watch(selectedRows, (newSelection) => {
  selectedCustomer.value = newSelection.length > 0 ? newSelection[0] : null;
});

// Lifecycle
onMounted(async () => {
  // Check authentication first
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }

  // Equivalent dari FormShow di Delphi
  await fetchCustomers();
});
</script>

<style scoped>
.v-data-table :deep(.v-data-table__tr--active) {
  background-color: rgba(25, 118, 210, 0.12);
}

.v-data-table :deep(.v-data-table__tr:hover) {
  background-color: rgba(0, 0, 0, 0.04);
}

/* Custom styling untuk chip status */
.v-chip.v-chip--size-small {
  height: 24px;
  font-size: 0.75rem;
}

/* Responsif untuk mobile */
@media (max-width: 768px) {
  .v-container {
    padding: 16px !important;
  }
  
  .d-flex.flex-wrap.ga-2 {
    flex-direction: column;
    gap: 8px;
  }
  
  .d-flex.ga-2 {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'vue-router';
import { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

// Interface Header (Wajib untuk Resize)
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: 'start' | 'center' | 'end';
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
}

interface LhkItem {
  Tanggal: string;
  Cab: string;     // kalau backend kirim Cab
  cab: string;     // kalau backend kirim cab
  SoDtf: string;
  [key: string]: unknown;
}

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '41';

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

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: 'Tanggal', key: 'Tanggal', width: 120 },
  { title: 'Cabang', key: 'cab', width: 100 },
  { title: 'No. SO DTF', key: 'SoDtf', width: 180 },
  { title: 'Nama DTF', key: 'NamaDTF', width: 250 },
  { title: 'Depan', key: 'depan', width: 100 },
  { title: 'Belakang', key: 'belakang', width: 100 },
  { title: 'Lengan', key: 'lengan', width: 100 },
  { title: 'Variasi', key: 'variasi', width: 100 },
  { title: 'Saku', key: 'saku', width: 100 },
  { title: 'Panjang (Mtr)', key: 'PanjangMtr', width: 120 },
  { title: 'Buangan (Mtr)', key: 'BuanganMtr', width: 120 },
  { title: 'Keterangan', key: 'Keterangan', width: 300 },
]);

// --- Logic Resize Column ---
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  e.preventDefault();
  e.stopPropagation();
  resizingColumn.value = column;
  startX.value = e.pageX;
  startWidth.value = (typeof column.width === 'number' ? column.width : 100);
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = 'col-resize';
};

const onResizeMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;
  const diff = e.pageX - startX.value;
  resizingColumn.value.width = Math.max(50, startWidth.value + diff);
};

const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = '';
};

// --- Logic Selected Row ---
const handleRowClick = (_event: Event, { item }: { item: LhkItem }) => {
  selected.value = [item];
};

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const isSingleSelected = computed(() => selected.value.length === 1);
const canEditOrDelete = computed(() => {
  if (!isSingleSelected.value) return false;
  const userCabang = authStore.user?.cabang;
  const recordCabang = selected.value[0].cab;
  if (userCabang === 'KDC') return true;
  return userCabang === recordCabang;
});

const footerProps = { 'items-per-page-options': [10, 25, 50, -1] };
const getItemId = (item: LhkItem) => `${item.Tanggal}-${item.SoDtf}-${item.Cab}`;

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get('/lhk-so-dtf/cabang-list');
    cabangList.value = response.data;
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
        Cab: itemToDelete.value.cab
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
    path: '/transaksi/penjualan/dtf/lhk-so-dtf/edit',
    query: {
      tanggal: format(parseISO(selectedItem.Tanggal), 'yyyy-MM-dd'),
      cabang: selectedItem.cab
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

      <div class="table-container">
        <AppDataTable v-model="selected" :headers="headers" :items="lhkList" :loading="isLoading"
          :item-value="getItemId" :footer-props="footerProps" density="compact" class="desktop-table header-browse-blue"
          fixed-header show-select return-object @click:row="handleRowClick">
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  :style="{ width: header.width + 'px', minWidth: header.width + 'px', maxWidth: header.width + 'px' }"
                  class="resizable-header"
                  :class="{ 'text-center': header.align === 'center', 'text-end': header.align === 'end' }"
                  @click="toggleSort(header)">
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="small" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" @click.stop></div>
                </th>
              </template>
            </tr>
          </template>

          <template v-for="header in headers" #[`item.${header.key}`]="{ item }" :key="header.key">
            <td>
              <template v-if="header.key === 'Tanggal'">
                {{ format(new Date(item.Tanggal), 'dd/MM/yyyy') }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>
        </AppDataTable>
      </div>
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

<style scoped>
/* --- Layout Full Height --- */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  flex-shrink: 0;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* --- Tabel Desktop Style --- */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* --- Header Resize --- */
.resizable-header {
  position: relative;
  background-color: #e3f2fd !important;
  color: #0d47a1 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #1976d2 !important;
  padding: 0 8px !important;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header-content {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
}

.resizable-header.text-center .header-content {
  justify-content: center;
}

.resizable-header.text-end .header-content {
  justify-content: flex-end;
}

.resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 10;
}

.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid #1565c0;
}

/* --- Utility & State --- */
.state-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

/* Pastikan field filter tidak putih */
.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section :deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
}
</style>

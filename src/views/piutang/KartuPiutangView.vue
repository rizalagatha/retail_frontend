<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
import KartuPiutangDetailModal from '@/components/modal/KartuPiutangDetailModal.vue';
import type { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';
import { formatRupiah } from "@/utils/formatRupiah";

// --- Interface Header (Wajib untuk Resize) ---
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

// --- Tipe Data ---
interface PiutangItem {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  nominalNota: number;
  terbayar: number;
  sisaPiutang: number;
  status: 'Aktif' | 'Pasif';
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '52';

const masterData = ref<PiutangItem[]>([]);
const loading = ref(true);
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const dialogs = reactive({ customerSearch: false, detailModal: false });
const selected = ref<PiutangItem[]>([]);

const filters = reactive({
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang,
  customerKode: '',
  customerNama: '',
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<PiutangItem | null>(() => isSingleSelected.value ? selected.value[0] : null);
const canView = computed(() => authStore.can(MENU_ID, 'view'));
const canViewDetail = computed(() => authStore.can(MENU_ID, 'view'));

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: 'Kode', key: 'kode', width: 120, fixed: true },
  { title: 'Nama Customer', key: 'nama', width: 250 },
  { title: 'Alamat', key: 'alamat', width: 300 },
  { title: 'Kota', key: 'kota', width: 150 },
  { title: 'Nominal Nota', key: 'nominalNota', align: 'end', width: 120 },
  { title: 'Terbayar', key: 'terbayar', align: 'end', width: 120 },
  { title: 'Sisa Piutang', key: 'sisaPiutang', align: 'end', width: 120 },
  { title: 'Status', key: 'status', align: 'center', width: 100 },
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
const handleRowClick = (_event: Event, { item }: { item: PiutangItem }) => {
  selected.value = [item];
};

// --- Methods ---
const getRowTextColor = (item: PiutangItem) => {
  if (item.status === 'Pasif') return 'text-red font-weight-bold';
  return '';
};

const fetchCabangList = async () => {
  try {
    const response = await api.get('/kartu-piutang/lookup/cabang');
    cabangList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat daftar cabang.', error);
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/kartu-piutang', { params: filters });
    masterData.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const onCustomerSelected = (customer: { kode: string; nama: string; }) => {
  filters.customerKode = customer.kode;
  filters.customerNama = customer.nama;
  dialogs.customerSearch = false;
};

const handleViewDetails = () => {
  if (!canViewDetail.value) {
    toast.error('Anda tidak memiliki izin untuk melihat detail.');
    return;
  }
  if (isSingleSelected.value) {
    dialogs.detailModal = true;
  }
};

// --- Lifecycle & Watchers ---
onMounted(async () => {
  if (!canView.value) {
    loading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    masterData.value = [];
    return;
  }
  await fetchCabangList();
});

watch(filters, () => {
  if (!canView.value) {
    loading.value = false;
    masterData.value = [];
    return;
  }
  fetchMasterData();
}, { deep: true, immediate: true });
</script>

<template>
  <PageLayout title="Browse Kartu Piutang" icon="mdi-account-cash-outline">
    <template #header-actions>
    </template>

    <div v-if="!canView && !loading" class="state-container pa-4 text-center">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p>Anda tidak memiliki izin untuk melihat halaman ini.</p>
    </div>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label">Filter Customer:</v-label>
        <v-text-field v-model="filters.customerKode" placeholder="Semua Customer" density="compact" hide-details
          variant="outlined" style="max-width: 180px;" append-inner-icon="mdi-magnify" readonly
          @click="dialogs.customerSearch = true" clearable
          @click:clear="filters.customerKode = ''; filters.customerNama = ''" />
        <v-text-field :model-value="filters.customerNama" readonly filled density="compact" hide-details
          style="max-width: 300px;" />

        <v-label class="filter-label ms-4">Cabang:</v-label>
        <v-select v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode" density="compact"
          hide-details variant="outlined" style="max-width: 200px;" />
        <v-spacer />

        <v-btn color="primary" @click="handleViewDetails" :disabled="!isSingleSelected || !canViewDetail"
          prepend-icon="mdi-file-document-outline" variant="elevated" class="btn-detail">
          Lihat Detail
        </v-btn>
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" :headers="headers" :items="masterData" :loading="loading" item-value="kode"
          density="compact" class="desktop-table header-browse-blue" fixed-header show-select return-object
          single-select @click:row="handleRowClick">
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
            <td :class="getRowTextColor(item)">
              <template v-if="['nominalNota', 'terbayar', 'sisaPiutang'].includes(header.key)">
                {{ formatRupiah(item[header.key]) }}
              </template>
              <template v-else-if="header.key === 'status'">
                <v-chip :color="item.status === 'Aktif' ? 'success' : 'error'" size="small" variant="tonal">
                  {{ item.status }}
                </v-chip>
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>
        </AppDataTable>
      </div>
    </div>

    <CustomerSearchModal v-if="dialogs.customerSearch" :gudang="authStore.user?.cabang || ''"
      @close="dialogs.customerSearch = false" @customer-selected="onCustomerSelected" />
    <KartuPiutangDetailModal v-if="dialogs.detailModal && selectedRow" :customer-kode="selectedRow.kode"
      :cabang="filters.cabang" @close="dialogs.detailModal = false" />
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
  flex-shrink: 0;
  padding: 8px;
  border-bottom: 1px solid #e0e0e0;
  background: white;
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* --- Tabel Style --- */
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

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: #d32f2f !important;
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.filter-section .v-btn.btn-detail {
  height: 36px !important;      /* Kembalikan tinggi normal */
  width: auto !important;       /* Lebar otomatis sesuai teks */
  min-width: 120px !important;  /* Lebar minimal agar enak dilihat */
  padding: 0 16px !important;   /* Kembalikan padding */
  font-size: 0.875rem !important; /* Ukuran font normal */
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface SopHeader {
  nomor: string;
  tanggal: string;
  transfer: 'Y' | 'N';
  selisih_qty: number
  nominal: number;
  keterangan: string;
}

interface SopDetail {
  Kode: string;
  Nama: string;
  Ukuran: string;
  Stok: number;
  Jumlah: number;
  Selisih: number;
  Hpp: number;
  Nominal: number;
  Lokasi: string;
}

interface DetailSummary {
  Stok: number;
  Jumlah: number;
  Selisih: number;
  Nominal: number;
}

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

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '24';

// --- State ---
const items = ref<SopHeader[]>([]);
const selected = ref<SopHeader[]>([]);
const expanded = ref<string[]>([]);
const details = ref<Record<string, SopDetail[]>>({});
const loadingDetails = ref(new Set<string>());
const isLoading = ref(true);
const cabangOptions = ref([]);

const filters = reactive({
  startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
});

const authModal = reactive({
  show: false,
  challengeCode: '',
  isLoading: false,
});
const authModalRef = ref<InstanceType<typeof AuthorizationModal> | null>(null);

// --- Computed ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<SopHeader | null>(() => isSingleSelected.value ? selected.value[0] : null);
const canTransfer = computed(() => isSingleSelected.value && selectedRow.value?.transfer !== 'Y');
const canEdit = computed(() => isSingleSelected.value);

// --- Headers (Style Biru & Resize) ---
const headers = ref<DataTableHeader[]>([
  { title: '', key: 'data-table-expand', width: 50, fixed: true },
  { title: 'Nomor', key: 'nomor', width: 180, fixed: true },
  { title: 'Tanggal', key: 'tanggal', width: 120 },
  { title: 'Selisih Qty', key: 'selisih_qty', align: 'end', width: 120 },
  { title: 'Nominal Selisih', key: 'nominal', align: 'end', width: 150 },
  { title: 'Keterangan', key: 'keterangan', width: 300 },
  { title: 'Transfer', key: 'transfer', align: 'center', width: 100 },
]);

const detailHeaders = [
  { title: 'Kode', key: 'Kode' },
  { title: 'Nama Barang', key: 'Nama' },
  { title: 'Ukuran', key: 'Ukuran' },
  { title: 'Stok Sistem', key: 'Stok', align: 'end' },
  { title: 'Jumlah Fisik', key: 'Jumlah', align: 'end' },
  { title: 'Selisih', key: 'Selisih', align: 'end' },
  { title: 'HPP', key: 'Hpp', align: 'end' },
  { title: 'Nominal', key: 'Nominal', align: 'end' },
  { title: 'Lokasi', key: 'Lokasi' },
] as const;

// --- Resize Logic (Sama seperti Penawaran) ---
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

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/proses-stok-opname', { params: filters });
    items.value = response.data;
    const ids = items.value.map(i => i.nomor);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      console.error("DUPLICATE KEYS DETECTED!", ids);
      // Ini penyebab error jika ada duplikat
    }
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/warehouses/list', {
      params: { userCabang: authStore.user?.cabang }
    });
    cabangOptions.value = response.data;
  } catch {
    // Silent fail
  }
};

const handleNew = () => router.push({ name: 'ProsesStokOpnameCreate' });

const handleEdit = () => {
  if (!canEdit.value) return;
  const isReadOnly = selectedRow.value?.transfer === 'Y';
  router.push({
    name: 'ProsesStokOpnameEdit',
    params: { nomor: selectedRow.value!.nomor },
    query: { readonly: isReadOnly ? 'true' : 'false' }
  });
};

const handleRowClick = (_event: Event, { item }: { item: SopHeader }) => {
  selected.value = [item];
};

const loadDetails = async (expandedItems: (SopHeader | string)[]) => {

  // TypeScript sekarang pintar:
  // Jika 'item' bukan string, dia otomatis menganggapnya sebagai 'SopHeader'
  const expandedNomors = expandedItems.map(item =>
    typeof item === 'string' ? item : item.nomor
  );

  for (const nomor of expandedNomors) {
    if (!details.value[nomor] && !loadingDetails.value.has(nomor)) {
      loadingDetails.value.add(nomor);
      try {
        const response = await api.get(`/proses-stok-opname/details/${nomor}`);
        // Gunakan spread operator untuk reaktivitas
        details.value = { ...details.value, [nomor]: response.data };
      } catch (error) {
        toast.error(`Gagal memuat detail untuk ${nomor}.`, error);
      } finally {
        loadingDetails.value.delete(nomor);
      }
    }
  }
};

const openTransferDialog = () => {
  if (!canTransfer.value) return;
  authModal.challengeCode = String(Math.floor(Math.random() * (999 - 100 + 1) + 100));
  authModal.show = true;
};

const onAuthSuccess = async (pin: string) => {
  authModal.isLoading = true;
  try {
    await api.post('/proses-stok-opname/validate-pin', {
      code: authModal.challengeCode,
      pin: pin,
    });
    const response = await api.post(`/proses-stok-opname/transfer/${selectedRow.value!.nomor}`);
    toast.success(response.data.message);
    authModal.show = false;
    fetchData();
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    authModalRef.value?.setFailed(err.response?.data?.message || 'Terjadi kesalahan');
  } finally {
    authModal.isLoading = false;
  }
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (items.value.length === 0) return toast.warning('Tidak ada data header.');
    const worksheet = XLSX.utils.json_to_sheet(items.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Proses Stok Opname");
    XLSX.writeFile(workbook, "Export_ProsesSOP_Header.xlsx");
  } else if (type === 'detail') {
    try {
      isLoading.value = true;
      const response = await api.get('/proses-stok-opname/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail.');
      const worksheet = XLSX.utils.json_to_sheet(response.data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detail Proses SOP");
      XLSX.writeFile(workbook, "Export_ProsesSOP_Detail.xlsx");
    } catch (error) {
      toast.error('Gagal mengekspor data detail.', error);
    } finally {
      isLoading.value = false;
    }
  }
};

const makeDetailSummary = (nomor: string): DetailSummary => {
  const currentDetails = details.value[nomor] || [];
  return {
    Stok: currentDetails.reduce((sum, item) => sum + Number(item.Stok || 0), 0),
    Jumlah: currentDetails.reduce((sum, item) => sum + Number(item.Jumlah || 0), 0),
    Selisih: currentDetails.reduce((sum, item) => sum + Number(item.Selisih || 0), 0),
    Nominal: currentDetails.reduce((sum, item) => sum + Number(item.Nominal || 0), 0),
  };
};

onMounted(() => {
  fetchCabangOptions();
  fetchData();
});

watch(filters, fetchData, { deep: true });

// Tambahkan blok ini di bagian bawah script setup
onBeforeUnmount(() => {
  // Kosongkan data agar Vue tidak tempbingung saat menghapus DOM
  items.value = [];
  expanded.value = [];
  selected.value = [];
  details.value = {};
});
</script>

<template>
  <PageLayout title="Proses Stok Opname" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-plus" color="primary"
        @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!isSingleSelected"
        @click="handleEdit">Ubah</v-btn>

      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props">
            Export
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')">
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>
          <v-list-item @click="exportData('detail')">
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" color="success" :disabled="!canTransfer"
        @click="openTransferDialog" prepend-icon="mdi-swap-horizontal-bold">
        Transfer SOP
      </v-btn>
    </template>

    <div class="browse-content">

      <div class="filter-section">
        <div class="d-flex align-center ga-2">
          <span class="filter-label">Periode:</span>
          <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
            style="min-width: 130px;"></v-text-field>
          <span>s/d</span>
          <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
            style="min-width: 130px;"></v-text-field>
        </div>

        <div class="d-flex align-center ga-2 ms-4" v-if="authStore.user?.cabang === 'KDC'">
          <span class="filter-label">Cabang:</span>
          <v-select v-model="filters.cabang" :items="cabangOptions" item-title="nama" item-value="kode"
            density="compact" hide-details variant="outlined" style="min-width: 180px;" placeholder="Pilih Cabang">
          </v-select>
        </div>

        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="items"
          :loading="isLoading" item-value="nomor" return-object show-select show-expand density="compact"
          class="desktop-table" fixed-header @update:expanded="loadDetails" @click:row="handleRowClick">
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <th v-for="header in columns" :key="header.key"
                :style="{ width: header.width + 'px', minWidth: header.width + 'px' }" class="resizable-header"
                :class="{ 'text-center': header.align === 'center', 'text-end': header.align === 'end' }"
                @click="header.key !== 'data-table-expand' ? toggleSort(header) : null">

                <div class="header-content">
                  <span>{{ header.title }}</span>
                  <v-icon v-if="header.key !== 'data-table-expand' && isSorted(header)" size="14" class="ms-1">
                    {{ getSortIcon(header) }}
                  </v-icon>
                </div>

                <div v-if="header.key !== 'data-table-expand'" class="resizer"
                  @mousedown.stop="onResizeStart($event, header)">
                </div>
              </th>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn icon="mdi-chevron-down" :class="{ 'rotate-180': isExpanded(internalItem) }" size="x-small"
              variant="text" @click.stop="toggleExpand(internalItem)" />
          </template>

          <template #[`item.tanggal`]="{ item }">
            {{ item.tanggal ? format(parseISO(item.tanggal), 'dd/MM/yyyy') : '-' }}
          </template>

          <template #[`item.selisih_qty`]="{ item }">
            <span :class="(item.selisih_qty || 0) < 0 ? 'text-red font-weight-bold' : 'text-green font-weight-bold'">
              {{ (item.selisih_qty || 0).toLocaleString('id-ID') }}
            </span>
          </template>

          <template #[`item.nominal`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.nominal || 0) }}
          </template>

          <template #[`item.transfer`]="{ item }">
            <v-chip size="x-small" :color="item.transfer === 'Y' ? 'success' : 'grey'" variant="tonal">
              {{ item.transfer === 'Y' ? 'SUDAH' : 'BELUM' }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center py-4">
                      <v-progress-circular indeterminate size="24" color="primary" class="mr-2" />
                      <span class="text-caption">Memuat detail...</span>
                    </div>

                    <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor] || []" density="compact"
                      hide-default-footer :items-per-page="-1" class="detail-table">
                      <template #[`item.Stok`]="{ item: d }">{{ (d.Stok || 0).toLocaleString('id-ID') }}</template>
                      <template #[`item.Jumlah`]="{ item: d }">{{ (d.Jumlah || 0).toLocaleString('id-ID') }}</template>
                      <template #[`item.Selisih`]="{ item: d }">
                        <span :class="(d.Selisih || 0) < 0 ? 'text-red' : (d.Selisih || 0) > 0 ? 'text-green' : ''">
                          {{ (d.Selisih || 0).toLocaleString('id-ID') }}
                        </span>
                      </template>
                      <template #[`item.Hpp`]="{ item: d }">{{ new Intl.NumberFormat('id-ID').format(d.Hpp || 0)
                        }}</template>
                      <template #[`item.Nominal`]="{ item: d }">{{ new Intl.NumberFormat('id-ID').format(d.Nominal || 0)
                        }}</template>

                      <template #[`body.append`]>
            <tr class="bg-grey-lighten-4 font-weight-bold">
              <td colspan="3" class="text-end">TOTAL :</td>
              <td class="text-end">{{ (makeDetailSummary(item.nomor).Stok || 0).toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ (makeDetailSummary(item.nomor).Jumlah || 0).toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ (makeDetailSummary(item.nomor).Selisih || 0).toLocaleString('id-ID') }}</td>
              <td></td>
              <td class="text-end">{{ new Intl.NumberFormat('id-ID').format(makeDetailSummary(item.nomor).Nominal || 0)
                }}</td>
              <td></td>
            </tr>
          </template>
          </v-data-table>
      </div>
    </div>
    </td>
    </tr>
</template>
</AppDataTable>
</div>
</div>

<AuthorizationModal v-if="authModal.show" ref="authModalRef" title="Transfer Stok Opname"
  :challenge-code="authModal.challengeCode" @close="authModal.show = false" @success="onAuthSuccess" />

</PageLayout>
</template>

<style scoped>
/* 1. Layout Utama Full Height - PENTING AGAR TABEL MUNCUL */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  /* Sesuaikan offset tinggi layout Anda */
  overflow: hidden;
}

/* 2. Filter Section */
.filter-section {
  flex-shrink: 0;
  padding: 8px 16px;
  border-bottom: 1px solid #e0e0e0;
  background: white;
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-label {
  font-size: 0.875rem;
  font-weight: 500;
}

/* 3. Table Container */
.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 4. Desktop Table Full Height */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* 5. Custom Header Style (Biru seperti Penawaran) */
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
  white-space: nowrap;
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

/* Resizer Handle */
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

/* 6. Sticky Detail Row Style */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  background-color: #fafafa;
  padding: 16px 16px 16px 64px;
  border-bottom: 1px solid #e0e0e0;
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 1000px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background-color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.detail-table :deep(thead tr th) {
  background-color: #f5f5f5 !important;
  color: #424242 !important;
  font-size: 10px !important;
  height: 32px !important;
  text-transform: uppercase;
  font-weight: bold !important;
}

/* Utilitas Warna */
.text-red {
  color: #d32f2f !important;
}

.text-green {
  color: #2e7d32 !important;
}

.rotate-180 {
  transform: rotate(180deg);
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, subDays, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import AuthorizationModal from '@/components/modal/AuthorizationModal.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

// --- Tipe Data & State ---
interface SopHeader {
  nomor: string;
  tanggal: string;
  transfer: 'Y' | 'N';
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

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '24';

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

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<SopHeader | null>(() => isSingleSelected.value ? selected.value[0] : null);
const canTransfer = computed(() => isSingleSelected.value && selectedRow.value?.transfer !== 'Y');
const canEdit = computed(() => isSingleSelected.value);

const headers = [
  { title: 'Nomor', key: 'nomor', width: '200px' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Nominal Selisih', key: 'nominal', align: 'end' },
  { title: 'Keterangan', key: 'keterangan' },
  { title: 'Transfer', key: 'transfer', align: 'center' },
] as const;
const detailHeaders = [
  { title: 'Kode', key: 'Kode', width: '150px' }, { title: 'Nama Barang', key: 'Nama', minWidth: '300px' },
  { title: 'Ukuran', key: 'Ukuran', width: '100px' }, { title: 'Stok Sistem', key: 'Stok', align: 'end' },
  { title: 'Jumlah Fisik', key: 'Jumlah', align: 'end' }, { title: 'Selisih', key: 'Selisih', align: 'end' },
  { title: 'HPP', key: 'Hpp', align: 'end' }, { title: 'Nominal', key: 'Nominal', align: 'end' },
  { title: 'Lokasi', key: 'Lokasi' },
] as const;

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/proses-stok-opname', { params: filters });
    items.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};
const fetchCabangOptions = async () => {
  try {
    // Asumsi endpoint ini sudah ada dari modul sebelumnya
    const response = await api.get('/proses-stok-opname/cabang-options');
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat pilihan cabang.', error);
  }
};
const handleNew = () => router.push({ name: 'ProsesStokOpnameCreate' });
const handleEdit = () => {
  if (!canEdit.value) return;

  // Cek apakah baris yang dipilih sudah ditransfer
  const isReadOnly = selectedRow.value?.transfer === 'Y';

  router.push({
    name: 'ProsesStokOpnameEdit',
    params: { nomor: selectedRow.value!.nomor },
    // Kirim status read-only sebagai query parameter
    query: { readonly: isReadOnly ? 'true' : 'false' }
  });
};

const loadDetails = async (newlyExpandedItems: SopHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.nomor] && !loadingDetails.value.has(item.nomor));
  if (!itemToLoad) return;

  loadingDetails.value.add(itemToLoad.nomor);
  try {
    const response = await api.get(`/proses-stok-opname/details/${itemToLoad.nomor}`);
    details.value[itemToLoad.nomor] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${itemToLoad.nomor}.`, error);
  } finally {
    loadingDetails.value.delete(itemToLoad.nomor);
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
    // 1. Validasi PIN terlebih dahulu
    await api.post('/proses-stok-opname/validate-pin', {
      code: authModal.challengeCode,
      pin: pin,
    });

    // 2. Jika PIN benar, jalankan proses transfer
    const response = await api.post(`/proses-stok-opname/transfer/${selectedRow.value!.nomor}`);

    toast.success(response.data.message);
    authModal.show = false;
    fetchData();

  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    // Jika gagal, tampilkan error di modal
    authModalRef.value?.setFailed(err.response?.data?.message || 'Terjadi kesalahan');
  } finally {
    authModal.isLoading = false;
  }
};

const exportData = async (type: 'header' | 'detail') => {
  if (type === 'header') {
    if (items.value.length === 0) return toast.warning('Tidak ada data header untuk diekspor.');
    const worksheet = XLSX.utils.json_to_sheet(items.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Proses Stok Opname");
    XLSX.writeFile(workbook, "Export_ProsesSOP_Header.xlsx");
  } else if (type === 'detail') {
    try {
      isLoading.value = true;
      const response = await api.get('/proses-stok-opname/export-details', { params: filters });
      if (response.data.length === 0) return toast.warning('Tidak ada data detail untuk diekspor pada filter ini.');

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
  fetchCabangOptions(); // Panggil fungsi yang sudah diisi
  fetchData();
});

watch(filters, fetchData, { deep: true });
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
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 180px;" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="headers" :items="items"
          :loading="isLoading" item-value="nomor" return-object single-select show-expand show-select
          @update:expanded="loadDetails">
          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item['tanggal']), 'dd-MM-yyyy') }}
          </template>
          <template #[`item.nominal`]="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item['nominal'] || 0) }}
          </template>
          <template #[`item.transfer`]="{ item }">
            <v-chip size="small" :color="item['transfer'] === 'Y' ? 'success' : 'grey'">
              {{ item['transfer'] === 'Y' ? 'SUDAH' : 'BELUM' }}
            </v-chip>
          </template>
          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-4">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center">Memuat detail...
                    </div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template #[`body.append`]>
            <tr class="bg-grey-lighten-4 font-weight-bold">
              <td colspan="4" class="text-end">TOTAL :</td>

              <td class="text-end">{{ makeDetailSummary(item.nomor).Stok.toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ makeDetailSummary(item.nomor).Jumlah.toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ makeDetailSummary(item.nomor).Selisih.toLocaleString('id-ID') }}</td>
              <td class="text-end">{{ makeDetailSummary(item.nomor).Nominal.toLocaleString('id-ID') }}</td>

              <td></td>
            </tr>
          </template>

          <template #bottom></template>
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

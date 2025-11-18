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
// Izin untuk membuka detail sama dengan izin view utama
const canViewDetail = computed(() => authStore.can(MENU_ID, 'view'));

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Kode', key: 'kode', width: '120px' },
  { title: 'Nama Customer', key: 'nama', width: '300px' },
  { title: 'Alamat', key: 'alamat' },
  { title: 'Kota', key: 'kota', width: '150px' },
  { title: 'Nominal Nota', key: 'nominalNota' },
  { title: 'Terbayar', key: 'terbayar' },
  { title: 'Sisa Piutang', key: 'sisaPiutang', cellProps: { class: 'font-weight-bold' } },
  { title: 'Status', key: 'status', align: 'center' },
] as const;

// --- Methods ---
const getRowTextColor = (item: PiutangItem) => {
  if (item.status === 'Pasif') return 'text-red';
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
  selected.value = []; // Reset pilihan saat data dimuat ulang
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
  // --- TAMBAHKAN PENGECEKAN IZIN ---
  if (!canViewDetail.value) {
    toast.error('Anda tidak memiliki izin untuk melihat detail.');
    return;
  }
  // ---------------------------------

  if (isSingleSelected.value) {
    dialogs.detailModal = true;
  }
};

// --- Lifecycle & Watchers ---
onMounted(async () => { // <-- Jadikan async
  // --- TAMBAHKAN PENGECEKAN AWAL ---
  if (!canView.value) {
    loading.value = false; // Hentikan loading
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    masterData.value = []; // Pastikan data kosong
    return; // Hentikan eksekusi
  }
  // ------------------------------------

  // Panggil fetchCabangList jika punya izin
  await fetchCabangList();
  // Tidak perlu memanggil fetchMasterData di sini,
  // karena watch immediate: true akan melakukannya (setelah cek izin di watch)
});

watch(filters, () => {
  // --- TAMBAHKAN PENGECEKAN IZIN ---
  if (!canView.value) {
    loading.value = false; // Hentikan loading jika belum
    masterData.value = []; // Kosongkan data
    return; // Hentikan jika tidak ada izin
  }
  // ---------------------------------
  fetchMasterData();
}, { deep: true, immediate: true }); // immediate: true tetap diperlukan
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
          prepend-icon="mdi-file-document-outline">
          Lihat Detail
        </v-btn>
      </div>

      <div class="table-container">
        <AppDataTable v-model="selected" :headers="headers" :items="masterData" :loading="loading" class="desktop-table"
          density="compact" fixed-header show-select single-select return-object item-value="kode">
          <template #[`item.nominalNota`]="{ item }">
            <td :class="getRowTextColor(item)" class="text-end">
              {{ formatRupiah(item.nominalNota) }}
            </td>
          </template>
          <template #[`item.terbayar`]="{ item }">
            <td :class="getRowTextColor(item)" class="text-end">
              {{ formatRupiah(item.terbayar) }}
            </td>
          </template>
          <template #[`item.sisaPiutang`]="{ item }">
            <td :class="getRowTextColor(item)" class="text-end font-weight-bold">
              {{ formatRupiah(item.sisaPiutang) }}
            </td>
          </template>
          <template #[`item.status`]="{ item }">
            <td :class="getRowTextColor(item)" class="text-center">
              <v-chip :color="item.status === 'Aktif' ? 'success' : 'error'" size="small" variant="tonal">
                {{ item.status }}
              </v-chip>
            </td>
          </template>
          <template #[`item.kode`]="{ item }">
            <td :class="getRowTextColor(item)">
              {{ item.kode }}
            </td>
          </template>
          <template #[`item.nama`]="{ item }">
            <td :class="getRowTextColor(item)">
              {{ item.nama }}
            </td>
          </template>
          <template #[`item.alamat`]="{ item }">
            <td :class="getRowTextColor(item)">
              {{ item.alamat }}
            </td>
          </template>
          <template #[`item.kota`]="{ item }">
            <td :class="getRowTextColor(item)">
              {{ item.kota }}
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

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface MasterItem {
  kode: string;
  nama: string;
  kategori: string;
}
interface DetailItem {
  ukuran: string;
  barcode: string;
  hpp: number;
  harga: number;
  laba: number;
}
interface VariantItem {
  ukuran: string;
  barcode: string;
  hpp: number;
  harga: number;
  laba?: number;
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '206';

const masterData = ref<MasterItem[]>([]);
const details = ref<Record<string, DetailItem[]>>({});
const loading = ref(true);
const loadingDetails = ref(new Set<string>());
const selected = ref<MasterItem[]>([]);
const expanded = ref<MasterItem[]>([]);

// State untuk Modal Update
const isUpdateModalVisible = ref(false);
const isUpdating = ref(false);
const itemToUpdate = ref<MasterItem | null>(null);
const variantsToUpdate = ref<VariantItem[]>([]);
const hppPercentage = ref({ Kaosan: 0, Rezso: 0 }); // Untuk menyimpan persentase HPP

const filters = reactive({
  kategori: 'All',
  hargaKosong: false,
});

const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<MasterItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

// --- Konfigurasi Tabel ---
const headers = [
  { title: 'Kategori', key: 'kategori', width: '120px' },
  { title: 'Kode', key: 'kode', width: '180px' },
  { title: 'Nama Barang', key: 'nama' },
];

const detailHeaders = [
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'Barcode', key: 'barcode' },
  { title: 'HPP', key: 'hpp', align: 'end' },
  { title: 'Harga Jual', key: 'harga', align: 'end' },
  { title: 'Laba', key: 'laba', align: 'end' },
] as const;

const updateModalHeaders = [
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'HPP', key: 'hpp', width: '200px' },
  { title: 'Harga Jual', key: 'harga', width: '200px' },
  { title: 'Barcode', key: 'barcode' },
];


// --- Methods ---
const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get('/price-list', { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    // [FIX] Tambahkan ini agar loading berhenti
    loading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MasterItem[]) => {
  const itemToLoad = newlyExpandedItems.find(item => !details.value[item.kode] && !loadingDetails.value.has(item.kode));
  if (!itemToLoad) return;
  const kodeToLoad = itemToLoad.kode;

  loadingDetails.value.add(kodeToLoad);
  try {
    const response = await api.get(`/price-list/details/${kodeToLoad}`);
    details.value[kodeToLoad] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${kodeToLoad}`, error);
  } finally {
    loadingDetails.value.delete(kodeToLoad);
  }
};

const openUpdateModal = async (item: MasterItem) => {
  if (!item) return;
  itemToUpdate.value = item;

  // Cek apakah detail sudah ada di cache
  if (details.value[item.kode]) {
    variantsToUpdate.value = JSON.parse(JSON.stringify(details.value[item.kode]));
    isUpdateModalVisible.value = true;
  } else {
    // Jika belum ada, fetch dari API terlebih dahulu
    loading.value = true; // Tampilkan loading di tabel utama
    try {
      const response = await api.get(`/price-list/details/${item.kode}`);
      // Simpan data ke cache untuk nanti
      details.value[item.kode] = response.data;
      // Salin data ke state modal
      variantsToUpdate.value = JSON.parse(JSON.stringify(response.data));
      // Buka modal setelah data siap
      isUpdateModalVisible.value = true;
    } catch (error) {
      toast.error(`Gagal memuat detail untuk ${item.kode}`, error);
    } finally {
      loading.value = false;
    }
  }
};

const calculateHpp = (variant: VariantItem) => {
  const percentage =
    itemToUpdate.value?.kategori === 'Rezso'
      ? hppPercentage.value.Rezso
      : hppPercentage.value.Kaosan;

  if (variant.harga > 0) {
    variant.hpp = Math.round((percentage / 100) * variant.harga);
  } else {
    variant.hpp = 0;
  }
};

const executeUpdate = async () => {
  if (!itemToUpdate.value) return;
  isUpdating.value = true;
  try {
    const payload = {
      kode: itemToUpdate.value.kode,
      variants: variantsToUpdate.value,
    };
    const response = await api.put('/price-list/update', payload);
    toast.success(response.data.message);

    // Update data di grid browse
    details.value[itemToUpdate.value.kode] = JSON.parse(JSON.stringify(variantsToUpdate.value));
    isUpdateModalVisible.value = false;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengupdate harga.');
  } finally {
    isUpdating.value = false;
  }
};

const handleUpdateClick = () => {
  showConfirmation(
    'Konfirmasi Update',
    'Yakin ingin mengupdate harga untuk produk ini?',
    executeUpdate
  );
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

onMounted(async () => {
  // Ambil persentase HPP dari backend jika belum ada
  // Untuk saat ini, kita hardcode sesuai contoh Delphi
  hppPercentage.value = { Kaosan: 70, Rezso: 60 }; // Asumsi dari lblHpp.Caption

  await fetchMasterData();
});

watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Price List" icon="mdi-tag-multiple-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" color="primary" prepend-icon="mdi-cash-edit"
        @click="openUpdateModal(selectedRow)" :disabled="!isSingleSelected">
        Update Harga
      </v-btn>

    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-radio-group v-model="filters.kategori" inline label="Kategori:" hide-details density="compact">
          <v-radio label="All" value="All"></v-radio>
          <v-radio label="Kaosan" value="Kaosan"></v-radio>
          <v-radio label="Rezso" value="Rezso"></v-radio>
        </v-radio-group>
        <v-checkbox v-model="filters.hargaKosong" label="Tampilkan yg harga-nya kosong saja" hide-details
          density="compact" class="ms-4" />
      </div>

      <div class="table-container">
        <v-data-table v-model="selected" :headers="headers" :items="masterData" :loading="loading" class="desktop-table header-browse-blue"
          density="compact" fixed-header show-select single-select return-object show-expand item-value="kode"
          @update:expanded="loadDetails">
          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-2">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.kode)" class="text-center pa-4">Memuat
                      detail...
                    </div>
                    <v-data-table v-else :headers="detailHeaders" :items="details[item.kode]" density="compact"
                      class="detail-table" :items-per-page="-1">
                      <template #bottom></template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </v-data-table>
      </div>
    </div>

    <v-dialog v-model="isUpdateModalVisible" max-width="1000px" persistent scrollable>
      <v-card>
        <v-toolbar color="primary" density="compact">
          <v-toolbar-title>Update Harga: {{ itemToUpdate?.nama }}</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" @click="isUpdateModalVisible = false" />
        </v-toolbar>
        <v-card-text>
          <v-data-table :headers="updateModalHeaders" :items="variantsToUpdate" class="desktop-table header-browse-blue"
            :items-per-page="-1">
            <template #[`item.hpp`]="{ item }">
              <v-text-field v-model.number="item.hpp" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>
            <template #[`item.harga`]="{ item }">
              <v-text-field v-model.number="item.harga" type="number" variant="underlined" density="compact"
                hide-details class="text-end" @update:model-value="calculateHpp(item)" />
            </template>
            <template #bottom></template>
          </v-data-table>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn text @click="isUpdateModalVisible = false">Batal</v-btn>
          <v-btn color="primary" @click="handleUpdateClick" :loading="isUpdating">
            Update
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

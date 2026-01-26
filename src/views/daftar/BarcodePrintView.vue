<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
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

type TableHeader = {
  title: string
  key: string
  sortable?: boolean
  width?: string
}

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
const expanded = ref<string[]>([]);
const selected = ref<BarcodeHeader[]>([]);
const showDeleteDialog = ref(false);

const isSingleSelected = computed(() => selected.value.length === 1);
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

const detailHeaders = [
  { title: 'Kode', key: 'kode' },
  { title: 'Barcode', key: 'barcode' },
  { title: 'Nama', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
] as const;

const tableHeaders: TableHeader[] = [
  { title: "Nomor", key: "nomor" },
  { title: "Tanggal", key: "tanggal" },
  { title: "User", key: "user" },
]

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const cabang = authStore.user?.cabang || '';
    const response = await api.get('/barcodes', {
      params: { startDate: startDate.value, endDate: endDate.value, cabang }
    });
    headers.value = response.data;
  } catch {
    toast.error('Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: BarcodeHeader[]) => {
  // 1. Terima array berisi OBJEK (bukan string)

  // 2. Cari OBJEK yang baru di-expand
  const itemToLoad = newlyExpandedItems.find(
    (item: BarcodeHeader) => !details.value[item.nomor]
  );

  // 3. Jika tidak ada yang baru, hentikan
  if (!itemToLoad) return;

  // 4. Ambil 'nomor' dari OBJEK tersebut
  const itemToLoadKey = itemToLoad.nomor;

  // (Tambahkan state loading detail jika perlu)
  // loadingDetails.value.add(itemToLoadKey);
  try {
    // 5. Panggil API dengan 'nomor' yang sudah benar
    const response = await api.get(`/barcodes/${itemToLoadKey}`);
    details.value[itemToLoadKey] = response.data;
  } catch (error) {
    toast.error(`Gagal memuat detail untuk ${itemToLoadKey}`, error);
    expanded.value = expanded.value.filter(k => k !== itemToLoadKey);
  } finally {
    // (Hapus state loading detail jika perlu)
    // loadingDetails.value.delete(itemToLoadKey);
  }
};

const goToEditPage = () => {
  if (isSingleSelected.value) {
    const item = selected.value[0];
    router.push(`/daftar/cetak-barcode/edit/${item.nomor}`);
  }
};

const openDeleteConfirm = () => {
  if (isSingleSelected.value) showDeleteDialog.value = true;
};

const confirmDelete = async () => {
  const item = selected.value[0];
  showDeleteDialog.value = false;
  try {
    await api.delete(`/barcode-form/delete/${item.nomor}`);
    toast.success("Data berhasil dihapus");
    fetchData();
    selected.value = [];
  } catch (error) {
    toast.error("Gagal menghapus data.", error);
  }
};

const goToCreatePage = () => {
  router.push('/daftar/cetak-barcode/new');
};

watch([startDate, endDate], () => {
  fetchData(); // Panggil fungsi fetch data Anda
});

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
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="goToCreatePage"
        prepend-icon="mdi-plus">Baru</v-btn>

      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" prepend-icon="mdi-pencil" :disabled="!isSingleSelected"
        @click="goToEditPage">Ubah</v-btn>

      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        :disabled="!isSingleSelected" @click="openDeleteConfirm">
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
          style="min-width: 140px;"></v-text-field>
        <span>s/d</span>
        <v-text-field v-model="endDate" type="date" density="compact" hide-details variant="outlined"
          style="min-width: 140px;"></v-text-field>
        <v-spacer></v-spacer>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <div class="table-wrapper">
        <AppDataTable v-model="selected" v-model:expanded="expanded" :headers="tableHeaders" :items="headers"
          :loading="isLoading" item-value="nomor" density="compact" class="desktop-table header-browse-blue"
          fixed-header show-select select-strategy="single" return-object show-expand @update:expanded="loadDetails">
          <template #[`item.tanggal`]="{ item }">
            {{ format(new Date(item.tanggal), 'dd/MM/yyyy') }}
          </template>

          <template #expanded-row="{ columns, item }">
            <tr class="expanded-row">
              <td :colspan="columns.length">

                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="!details[item.nomor]" class="text-center py-2">
                      <v-progress-circular indeterminate size="20" class="mr-2"></v-progress-circular>
                      <span class="text-caption">Memuat detail...</span>
                    </div>
                    <AppDataTable v-else-if="details[item.nomor] && details[item.nomor].length > 0"
                      :headers="detailHeaders" :items="details[item.nomor]" density="compact" hide-default-footer
                      :items-per-page="-1" class="detail-table"></AppDataTable>
                    <div v-else class="text-center py-2 text-caption text-medium-emphasis">
                      Tidak ada detail ditemukan untuk nomor {{ item.nomor }}
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>

        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon> Konfirmasi Hapus
        </v-card-title>
        <v-card-text>
          Apakah Anda yakin ingin menghapus data barcode <strong>{{ selected[0]?.nomor }}</strong>? Tindakan ini tidak
          dapat
          dibatalkan.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showDeleteDialog = false">Batal</v-btn>
          <v-btn color="error" variant="flat" @click="confirmDelete">Ya, Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </PageLayout>
</template>

<style scoped>
.table-wrapper {
  flex-grow: 1;
  overflow-y: auto;
}

.expanded-row td {
  padding: 0 !important;
  background-color: #fafafa;
}
</style>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api'; // (1) Gunakan instance API terpusat
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import { useRouter } from 'vue-router';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '11'; // (2) Definisikan ID Menu

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
const expandedRows = ref<Set<string>>(new Set());
const hasViewPermission = ref(false); // State untuk kontrol tampilan

const detailHeaders = [
    { title: 'Kode', key: 'kode'},
    { title: 'Barcode', key: 'barcode'},
    { title: 'Nama', key: 'nama'},
    { title: 'Ukuran', key: 'ukuran'},
    { title: 'Jumlah', key: 'jumlah'},
];

const tableHeaders = [
  { title: 'Nomor', key: 'nomor' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'User', key: 'user' },
  { title: 'Action', key: 'actions', sortable: false, width: '100px' },
];

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  try {
    const cabang = authStore.user?.cabang || '';
    const response = await api.get('/barcodes', { // (3) Gunakan API
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
                const response = await api.get(`/barcodes/${nomor}`); // (3) Gunakan API
                details.value = {
                    ...details.value,
                    [nomor]: response.data
                };
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
  // (4) Cek hak view sebelum memuat data
  if (authStore.can(MENU_ID, 'view')) {
    hasViewPermission.value = true;
    fetchData();
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});
</script>

<template>
  <PageLayout title="Cetak Barcode">
    <template #header-actions>
      <!-- (5) Tombol "Baru" hanya muncul jika punya hak 'insert' -->
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" color="primary" @click="goToCreatePage" prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn prepend-icon="mdi-pencil" disabled>Ubah</v-btn>
      <v-btn prepend-icon="mdi-delete" disabled>Hapus</v-btn>
    </template>
    
    <!-- (6) Tampilkan pesan akses ditolak jika tidak punya hak view -->
    <div v-if="!hasViewPermission" class="text-center pa-8 text-grey">
        <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
        <h3 class="text-h6">Akses Ditolak</h3>
        <p class="body-1 mt-2">Anda tidak memiliki izin untuk melihat data ini.</p>
    </div>

    <v-card v-else>
      <v-card-title class="d-flex align-center pe-2">
        <v-icon icon="mdi-barcode-scan"></v-icon> &nbsp; Daftar Cetak Barcode
        <v-spacer></v-spacer>
        <div class="d-flex align-center ga-2">
            <v-text-field v-model="startDate" type="date" density="compact" hide-details style="min-width: 140px;"></v-text-field>
            <span>s/d</span>
            <v-text-field v-model="endDate" type="date" density="compact" hide-details style="min-width: 140px;"></v-text-field>
            <v-btn @click="fetchData" icon="mdi-refresh" variant="text"></v-btn>
        </div>
      </v-card-title>
      <v-divider></v-divider>
      
      <div v-if="isLoading" class="text-center py-8">
        <v-progress-circular indeterminate color="primary"></v-progress-circular>
        <div class="mt-2">Memuat data...</div>
      </div>
      
      <div v-else>
        <v-table>
          <thead>
            <tr>
              <th class="text-left">Nomor</th>
              <th class="text-left">Tanggal</th>
              <th class="text-left">User</th>
              <th class="text-left" style="width: 100px;">Action</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="item in headers" :key="item.nomor">
              <tr class="hover:bg-grey-lighten-4">
                <td>{{ item.nomor }}</td>
                <td>{{ format(new Date(item.tanggal), 'dd/MM/yyyy') }}</td>
                <td>{{ item.user }}</td>
                <td>
                  <v-btn
                    @click="toggleExpand(item.nomor)"
                    :icon="expandedRows.has(item.nomor) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                    size="small"
                    variant="text"
                    color="primary"
                  ></v-btn>
                </td>
              </tr>
              
              <tr v-if="expandedRows.has(item.nomor)" class="bg-grey-lighten-5">
                <td :colspan="tableHeaders.length" class="pa-4">
                  <div v-if="!details[item.nomor]" class="text-center py-4">
                    <v-progress-circular indeterminate size="24" color="primary"></v-progress-circular>
                    <div class="mt-2">Memuat detail...</div>
                  </div>
                  
                  <div v-else-if="details[item.nomor] && details[item.nomor].length > 0">
                    <h6 class="mb-3 text-primary">Detail Items</h6>
                    <v-data-table
                      :headers="detailHeaders"
                      :items="details[item.nomor]"
                      density="compact"
                      hide-default-footer
                      :items-per-page="-1"
                      class="elevation-1"
                    ></v-data-table>
                  </div>
                  
                  <div v-else class="text-center py-4 text-muted-emphasis">
                    <v-icon icon="mdi-information-outline" class="mb-2"></v-icon>
                    <div>Tidak ada detail ditemukan untuk nomor {{ item.nomor }}</div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </v-table>
      </div>
    </v-card>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import { useRouter } from 'vue-router';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();

interface PriceProposal {
  nomor: string;
  tanggal: string;
  kdcus: string;
  customer: string;
  jenisKaos: string;
  keterangan: string;
  approval: string;
  cabang: string;
  created: string;
}

// --- State ---
const proposals = ref<PriceProposal[]>([]);
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const selectedCabang = ref('ALL');
const belumApproval = ref(true);
const cabangList = ref([]);
const selected = ref<PriceProposal[]>([]);

const tableHeaders = [
  { title: 'Nomor', key: 'nomor' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Customer', key: 'customer' },
  { title: 'Jenis Kaos', key: 'jenisKaos' },
  { title: 'Keterangan', key: 'keterangan' },
  { title: 'Approval', key: 'approval' },
  { title: 'Cabang', key: 'cabang' },
  { title: 'User', key: 'created' },
];

const isSingleSelected = computed(() => selected.value.length === 1);

// --- Methods ---
const fetchCabangList = async () => {
    try {
        // Asumsi API ini ada untuk mengambil daftar cabang
        const response = await api.get('/offers/branch-options', {
            params: { userCabang: authStore.user?.cabang }
        });
        // Tambahkan opsi "ALL" jika user adalah KDC
        if (authStore.user?.cabang === 'KDC') {
            cabangList.value = [{ kode: 'ALL', nama: 'SEMUA CABANG' }, ...response.data];
        } else {
            cabangList.value = response.data;
        }
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.');
    }
};

const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/price-proposals', {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedCabang.value,
                belumApproval: belumApproval.value,
            }
        });
        proposals.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data pengajuan harga.');
    } finally {
        isLoading.value = false;
    }
};

const editProposal = () => {
    if (!isSingleSelected.value) return;
    const nomor = selected.value[0].nomor;
    router.push(`/pengajuan-harga/ubah/${nomor}`);
};

onMounted(() => {
    fetchData();
    fetchCabangList();
});

watch([selectedCabang, belumApproval, startDate, endDate], fetchData);
</script>

<template>
  <PageLayout title="Pengajuan Harga">
    <template #header-actions>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="router.push('/pengajuan-harga/new')">Baru</v-btn>
      <v-btn :disabled="!isSingleSelected" prepend-icon="mdi-pencil" @click="editProposal">Ubah</v-btn>
      <v-btn :disabled="!isSingleSelected" prepend-icon="mdi-delete">Hapus</v-btn>
    </template>
    
    <v-card>
      <v-card-title class="d-flex align-center pe-2 ga-4 flex-wrap">
        <!-- Filter Periode -->
        <div class="d-flex align-center ga-2">
            <span>Filter Periode:</span>
            <v-text-field v-model="startDate" type="date" density="compact" hide-details style="min-width: 140px;"></v-text-field>
            <span>s/d</span>
            <v-text-field v-model="endDate" type="date" density="compact" hide-details style="min-width: 140px;"></v-text-field>
        </div>

        <!-- Filter Cabang -->
        <div class="d-flex align-center ga-2" style="min-width: 200px;">
            <span>Cabang:</span>
            <v-select
                v-model="selectedCabang"
                :items="cabangList"
                item-title="nama"
                item-value="kode"
                density="compact"
                hide-details
                variant="outlined"
            ></v-select>
        </div>

        <!-- Filter Approval -->
        <v-checkbox
            v-model="belumApproval"
            label="Tampilkan yang belum di-approve saja"
            hide-details
            density="compact"
        ></v-checkbox>

        <v-spacer></v-spacer>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" color="primary"></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      
      <v-data-table
        :headers="tableHeaders"
        :items="proposals"
        :loading="isLoading"
        item-value="nomor"
        show-select
        return-object
      >
        <template #item.tanggal="{ item }">
            {{ format(new Date(item.tanggal), 'dd/MM/yyyy') }}
        </template>
        <template #item.approval="{ item }">
          <v-chip :color="item.approval ? 'success' : 'red'" variant="tonal" size="small">
            {{ item.approval || 'Belum' }}
          </v-chip>
        </template>
      </v-data-table>
    </v-card>
  </PageLayout>
</template>


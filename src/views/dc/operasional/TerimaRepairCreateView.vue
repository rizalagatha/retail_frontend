<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import type { AxiosError } from 'axios';

interface AllocationItem {
  id: number;
  spk: string;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  kdc: number;
  kbs: number;
  kps: number;
  k01: number;
  k02: number;
  k03: number;
  total: number;
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '212';

const header = reactive({
  nomor: '', tanggal: format(new Date(), 'yyyy-MM-dd'),
  nomorKirim: '', tanggalKirim: '', dariGudang: '', keterangan: '',
});
const allocationItems = ref<AllocationItem[]>([]);
const resultItems = ref<AllocationItem[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const allocationHeaders = [
  { title: 'SPK', key: 'spk' }, { title: 'Kode Barang', key: 'kode' },
  { title: 'Nama Barang', key: 'nama' }, { title: 'Ukuran', key: 'ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' },
  { title: 'KDC', key: 'kdc', align: 'end', width: '90px' },
  { title: 'KBS', key: 'kbs', align: 'end', width: '90px' },
  { title: 'KPS', key: 'kps', align: 'end', width: '90px' },
  { title: 'K01', key: 'k01', align: 'end', width: '90px' },
  { title: 'K02', key: 'k02', align: 'end', width: '90px' },
  { title: 'K03', key: 'k03', align: 'end', width: '90px' },
  { title: 'Total', key: 'total', align: 'end' },
] as const;
const resultHeaders = [
  { title: 'Store', key: 'cab' },
  { title: 'No. SJ/Mutasi', key: 'nomor' },
];

watch(allocationItems, (newItems) => {
  newItems.forEach(item => {
    const totalAlokasi = (item.kbs || 0) + (item.kps || 0) + (item.k01 || 0) + (item.k02 || 0) + (item.k03 || 0);
    item.total = totalAlokasi;
    item.kdc = (item.jumlah || 0) - totalAlokasi;
    if (item.kdc < 0) {
      toast.error(`Alokasi untuk ${item.nama} (${item.ukuran}) melebihi jumlah.`);
    }
  });
}, { deep: true });

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const save = () => {
  if (!authStore.can(MENU_ID, 'insert')) {
    return toast.error('Anda tidak memiliki hak akses untuk menyimpan data ini.');
  }

  const itemMelebihi = allocationItems.value.find(item => item.kdc < 0);
  if (itemMelebihi) {
    return toast.error(`Pembagian alokasi melebihi jumlah. Tidak bisa disimpan.`);
  }
  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data penerimaan ini?', executeSave);
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = { header, items: allocationItems.value };
    const response = await api.post('/terima-repair-form/save', payload);
    toast.success(response.data.message);
    router.push({ name: 'TerimaRepair' });
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

onMounted(async () => {
  if (!authStore.can(MENU_ID, 'view')) {
    toast.error('Anda tidak memiliki hak akses untuk membuka halaman ini.');
    return router.push('/'); // Redirect ke halaman utama jika tidak ada akses
  }

  const nomorKirim = route.query.nomorKirim as string;
  if (!nomorKirim) {
    toast.error('Nomor Kirim tidak valid.');
    return router.back();
  }

  isLoading.value = true;
  try {
    const response = await api.get(`/terima-repair-form/load-from-kirim`, { params: { nomorKirim } });
    const data = response.data;

    header.nomorKirim = data.header.gr_nomor;
    header.tanggalKirim = format(parseISO(data.header.gr_tanggal), 'yyyy-MM-dd');
    header.dariGudang = data.header.gdg_nama;
    header.keterangan = data.header.gr_ket;

    // --- PERBAIKAN DI SINI ---
    allocationItems.value = data.detailItems.map((item: AllocationItem) => ({
      ...item,
      id: Math.random(),
      kdc: 0,
      kbs: 0,
      kps: 0,
      k01: 0,
      k02: 0,
      k03: 0,
      total: 0
    })) as AllocationItem[];
    // --- AKHIR PERBAIKAN ---

  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal memuat data.');
    router.back();
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout title="Terima dari Gudang Repair" desktop-mode>
    <template #header-actions>
      <v-btn size="small" prepend-icon="mdi-content-save" color="primary" @click="save"
        :loading="isSaving">Simpan</v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh"
        @click="showConfirmation('Konfirmasi Batal', 'Tutup form?', () => router.back())">Batal</v-btn>
    </template>
    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="compact-form">
            <v-col cols="6"><v-text-field label="No. Terima" v-model="header.nomor" readonly filled /></v-col>
            <v-col cols="6"><v-text-field label="Tgl. Terima" v-model="header.tanggal" type="date"
                variant="outlined" /></v-col>
            <v-col cols="6"><v-text-field label="No. Kirim" v-model="header.nomorKirim" readonly filled /></v-col>
            <v-col cols="6"><v-text-field label="Tgl. Kirim" v-model="header.tanggalKirim" readonly filled /></v-col>
            <v-col cols="12"><v-text-field label="Dari Gudang" v-model="header.dariGudang" readonly filled /></v-col>
            <v-col cols="12"><v-textarea label="Keterangan" v-model="header.keterangan" readonly filled
                rows="3" /></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Hasil SJ / Mutasi Otomatis</div>
          <v-data-table :headers="resultHeaders" :items="resultItems" class="desktop-table flex-grow-1"
            :items-per-page="-1" density="compact" fixed-header>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Alokasi Stok</div>
          <v-data-table :headers="allocationHeaders" :items="allocationItems" :loading="isLoading"
            class="desktop-table flex-grow-1" :items-per-page="-1" density="compact" fixed-header>
            <template #[`item.kdc`]="{ item }">
              <div class="text-end font-weight-bold">{{ item.kdc || 0 }}</div>
            </template>
            <template #[`item.kbs`]="{ item }">
              <v-text-field v-model.number="item.kbs" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>
            <template #[`item.kps`]="{ item }">
              <v-text-field v-model.number="item.kps" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>
            <template #[`item.k01`]="{ item }">
              <v-text-field v-model.number="item.k01" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>
            <template #[`item.k02`]="{ item }">
              <v-text-field v-model.number="item.k02" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>
            <template #[`item.k03`]="{ item }">
              <v-text-field v-model.number="item.k03" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>
            <template #[`item.total`]="{ item }">
              <div class="text-end">{{ item.total || 0 }}</div>
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn color="primary" variant="tonal"
            @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.desktop-table :deep(thead tr th) {
  background-color: #0D47A1 !important; /* Biru Tua */
  color: #ffffff !important;            /* Teks Putih */
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  border-bottom: none !important; /* Supaya lebih rapi */
}
</style>

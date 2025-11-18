<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO, isBefore } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface Header {
  nomor: string;
  tanggal: string;
  nomorStbj: string;
  tanggalStbj: string;
  asalStbj: string;
  nomorSjGarmen: string;
  tanggalSjGarmen: string;
  nomorMutasiKps: string;
  tanggalMutasiKps: string;
  nomorMutasiKbs: string;
  tanggalMutasiKbs: string;
}
interface SummaryItem {
  spk: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  koli: number;
  keterangan: string;
}
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
  kpr: number;
  k01: number;
  k02: number;
  k03: number;
  k04: number;
  k05: number;
  k06: number;
  total: number;
  [key: string]: unknown; // untuk kolom tambahan jika ada
}
interface ResultItem {
  cab: string;      // Store
  sj: string;       // No. SJ
  terima: string;   // No. Terima
  tglterima: string; // Tgl Terima
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '211';

const pageTitle = 'Terima STBJ';

const header = reactive<Header>({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  nomorStbj: '',
  tanggalStbj: '',
  asalStbj: 'P04', // <-- Nilai fixed
  // Field baru untuk input
  nomorSjGarmen: '',
  tanggalSjGarmen: format(new Date(), 'yyyy-MM-dd'),
  nomorMutasiKps: '',
  tanggalMutasiKps: format(new Date(), 'yyyy-MM-dd'),
  nomorMutasiKbs: '',
  tanggalMutasiKbs: format(new Date(), 'yyyy-MM-dd'),
});
const summaryItems = ref<SummaryItem[]>([]);
const allocationItems = ref<AllocationItem[]>([]);
const resultItems = ref<ResultItem[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const summaryHeaders = [
  { title: 'SPK', key: 'spk' }, { title: 'Nama', key: 'nama' }, { title: 'Ukuran', key: 'ukuran' },
  { title: 'Jumlah', key: 'jumlah', align: 'end' }, { title: 'Koli', key: 'koli', align: 'end' }, { title: 'Keterangan', key: 'keterangan' },
] as const;
const allocationHeaders = [
  { title: 'SPK', key: 'spk', width: '100px' },
  { title: 'Kode Barang', key: 'kode', width: '100px' },
  { title: 'Nama Barang', key: 'nama' }, // <-- Biarkan tanpa lebar agar fleksibel
  { title: 'Ukuran', key: 'ukuran', width: '40px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '40px' },
  { title: 'KDC', key: 'kdc', align: 'end', width: '40px' },
  { title: 'KBS', key: 'kbs', align: 'end', width: '40px' },
  { title: 'KPS', key: 'kps', align: 'end', width: '40px' },
  { title: 'KPR', key: 'kpr', align: 'end', width: '40px' },
  { title: 'K01', key: 'k01', align: 'end', width: '40px' },
  { title: 'K02', key: 'k02', align: 'end', width: '40px' },
  { title: 'K03', key: 'k03', align: 'end', width: '40px' },
  { title: 'K04', key: 'k04', align: 'end', width: '40px' },
  { title: 'K05', key: 'k05', align: 'end', width: '40px' },
  { title: 'K06', key: 'k06', align: 'end', width: '40px' },
  { title: 'Total Alokasi', key: 'total', align: 'end', width: '40px' },
] as const;
const resultHeaders = [
  { title: 'Store', key: 'cab' }, { title: 'No. SJ', key: 'sj' },
  { title: 'No. Terima', key: 'terima' }, { title: 'Tgl Terima', key: 'tglterima' },
] as const;

const save = () => {
  if (!authStore.can(MENU_ID, 'insert')) {
    return toast.error('Anda tidak memiliki hak akses untuk menyimpan data ini.');
  }

  // --- VALIDASI DARI DELPHI (btnSimpanClick) ---
  if (isBefore(new Date(header.tanggal), parseISO(header.tanggalStbj))) {
    return toast.error('Tanggal terima tidak boleh mundur dari tanggal STBJ.');
  }

  // Cek apakah ada alokasi yang melebihi jumlah STBJ
  const itemMelebihi = allocationItems.value.find(item => item.kdc < 0);
  if (itemMelebihi) {
    return toast.error(`Pembagian alokasi untuk ${itemMelebihi.nama} melebihi jumlah STBJ. Tidak bisa disimpan.`);
  }
  // --- AKHIR VALIDASI ---

  showConfirmation(
    'Konfirmasi Simpan',
    'Anda yakin ingin menyimpan data penerimaan ini? Aksi ini akan membuat dokumen SJ dan Mutasi secara otomatis.',
    executeSave
  );
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = { header, summaryItems: summaryItems.value, allocationItems: allocationItems.value };
    const response = await api.post('/terima-stbj-form/save', payload);
    toast.success(response.data.message);
    router.push({ name: 'TerimaStbj' });
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const closeForm = () => router.push({ name: 'TerimaStbj' });

onMounted(async () => {
  if (!authStore.can(MENU_ID, 'view')) {
    toast.error('Anda tidak memiliki hak akses untuk membuka halaman ini.');
    return router.push('/'); // Redirect ke halaman utama
  }

  const nomorKirim = route.query.nomorKirim as string;
  if (!nomorKirim) {
    toast.error('Nomor STBJ Kirim tidak valid.');
    return router.back();
  }

  isLoading.value = true;
  try {
    const response = await api.get('/terima-stbj-form/load-from-stbj', {
      params: { nomorStbj: nomorKirim }
    });
    const data = response.data;

    header.nomorStbj = data.header.stbj_nomor;
    header.tanggalStbj = format(parseISO(data.header.stbj_tanggal), 'yyyy-MM-dd');

    summaryItems.value = data.summaryItems;
    allocationItems.value = data.allocationItems.map((item: Omit<AllocationItem, 'id' | 'kdc' | 'kbs' | 'kps' | 'kpr' | 'k01' | 'k02' | 'k03' | 'k04' | 'k05' | 'k06' | 'total'>) => ({
      ...item,
      id: Math.random(),
      kdc: 0, kbs: 0, kps: 0, kpr: 0,
      k01: 0, k02: 0, k03: 0, k04: 0, k05: 0, k06: 0,
      total: 0
    })) as AllocationItem[];
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat data STBJ.');
    router.back();
  } finally {
    isLoading.value = false;
  }
});

watch(allocationItems, (newItems) => {
  newItems.forEach(item => {
    // 1. Hitung total alokasi ke semua store (selain KDC)
    const totalAlokasiStore = (item.kbs || 0) + (item.kps || 0) + (item.kpr || 0) +
      (item.k01 || 0) + (item.k02 || 0) + (item.k03 || 0) +
      (item.k04 || 0) + (item.k05 || 0) + (item.k06 || 0);
    item.total = totalAlokasiStore;

    // 2. Hitung sisa stok untuk KDC
    item.kdc = (item.jumlah || 0) - totalAlokasiStore;

    // 3. Tampilkan warning jika alokasi melebihi jumlah
    if (item.kdc < 0) {
      toast.error(`Pembagian alokasi untuk ${item.nama} (${item.ukuran}) melebihi jumlah STBJ.`);
    }
  });
}, { deep: true });
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode>
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-content-save" color="primary"
        @click="save" :loading="isSaving">
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh"
        @click="showConfirmation('Konfirmasi Batal', 'Tutup form? Perubahan yang belum disimpan akan hilang.', closeForm)">
        Batal
      </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6"><v-text-field label="No. Terima" v-model="header.nomor" readonly filled density="compact"
                hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tgl. Terima" v-model="header.tanggal" type="date" variant="outlined"
                density="compact" hide-details /></v-col>

            <v-col cols="6"><v-text-field label="No. STBJ" v-model="header.nomorStbj" readonly filled density="compact"
                hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tgl. STBJ" v-model="header.tanggalStbj" readonly filled
                density="compact" hide-details /></v-col>

            <v-col cols="12"><v-text-field label="Asal STBJ" v-model="header.asalStbj" readonly filled density="compact"
                hide-details /></v-col>

            <v-col cols="6"><v-text-field label="No. SJ Garmen" v-model="header.nomorSjGarmen" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tgl. SJ Garmen" v-model="header.tanggalSjGarmen" type="date"
                variant="outlined" density="compact" hide-details /></v-col>

            <v-col cols="6"><v-text-field label="No. Mutasi KPS" v-model="header.nomorMutasiKps" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tgl. Mutasi KPS" v-model="header.tanggalMutasiKps" type="date"
                variant="outlined" density="compact" hide-details /></v-col>

            <v-col cols="6"><v-text-field label="No. Mutasi KBS" v-model="header.nomorMutasiKbs" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tgl. Mutasi KBS" v-model="header.tanggalMutasiKbs" type="date"
                variant="outlined" density="compact" hide-details /></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Hasil SJ / Mutasi Otomatis</div>
          <v-data-table :headers="resultHeaders" :items="resultItems" :loading="isLoading"
            class="desktop-table flex-grow-1" :items-per-page="-1" density="compact" fixed-header>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="height: 35%;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Ringkasan dari Garmen</div>
          <v-data-table :headers="summaryHeaders" :items="summaryItems" :loading="isLoading"
            class="desktop-table flex-grow-1" :items-per-page="-1" density="compact" fixed-header>
            <template #bottom></template>
          </v-data-table>
        </div>
        <div class="desktop-form-section d-flex flex-column" style="height: 65%;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Alokasi Stok ke Store</div>
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
            <template #[`item.kpr`]="{ item }">
              <v-text-field v-model.number="item.kpr" type="number" variant="underlined" density="compact" hide-details
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
            <template #[`item.k04`]="{ item }">
              <v-text-field v-model.number="item.k04" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>
            <template #[`item.k05`]="{ item }">
              <v-text-field v-model.number="item.k05" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>
            <template #[`item.k06`]="{ item }">
              <v-text-field v-model.number="item.k06" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>
            <template #[`item.total`]="{ item }">
              <div class="text-end font-weight-bold">{{ item.total || 0 }}</div>
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
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal"
            @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  display: grid;
  /* Kolom kiri 35%, kolom kanan 65% */
  grid-template-columns: 35% 1fr;
  gap: 16px;
  padding: 16px;
  height: calc(100vh - 120px);
  /* Sesuaikan tinggi agar pas di layar */
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  /* Penting untuk scrolling */
}

.desktop-form-section {
  background-color: #fff;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
}

.header-section {
  flex-shrink: 0;
  /* Header tidak akan menyusut */
}

/* Membuat tabel di dalam section bisa scroll */
.desktop-table {
  flex-grow: 1;
  overflow-y: auto;
}

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

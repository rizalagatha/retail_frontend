<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import type { AxiosError } from 'axios';

// --- Interface ---
interface ScannedItem {
  barcode: string;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  lokasi: string;
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '23';

const isLoading = ref(false);
const scannedItems = ref<ScannedItem[]>([]);

const form = reactive({
  lokasi: '',
  barcode: '',
  kodeBarang: '',
  namaBarang: '',
  ukuran: '',
});

const headers = [
  { title: 'No.', key: 'no', sortable: false, width: '50px' },
  { title: 'Barcode', key: 'barcode', width: '150px' },
  { title: 'Kode', key: 'kode', width: '150px' },
  { title: 'Nama Barang', key: 'nama', minWidth: '300px' },
  { title: 'Ukuran', key: 'ukuran', width: '100px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '100px' },
  { title: 'Lokasi (Qty)', key: 'lokasi' },
] as const;

// --- Methods ---
const focusBarcodeField = () => {
  document.getElementById('barcode-field')?.focus();
};

const handleScan = async () => {
  if (!form.lokasi) {
    toast.error('Silahkan isi Lokasi terlebih dahulu.');
    document.getElementById('lokasi-field')?.focus();
    return;
  }
  if (!form.barcode) {
    return; // Jangan lakukan apa-apa jika barcode kosong
  }

  try {
    // 1. Ambil detail produk berdasarkan barcode
    const productResponse = await api.get(`/hitung-stok-form/product-by-barcode/${form.barcode}`);
    const product = productResponse.data;

    // Tampilkan info produk di form
    form.kodeBarang = product.brg_kode;
    form.namaBarang = product.nama;
    form.ukuran = product.brgd_ukuran;

    // 2. Kirim data scan ke backend untuk diproses (INSERT/UPDATE)
    await api.post('/hitung-stok-form/process-scan', {
      lokasi: form.lokasi,
      barcode: form.barcode,
      product: product
    });

    // 3. Muat ulang daftar item yang sudah di-scan untuk lokasi ini
    await fetchScannedItems();

    // 4. Reset dan fokus kembali ke input barcode
    form.barcode = '';
    nextTick(() => {
      document.getElementById('barcode-field')?.focus();
    });

  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memproses scan.');
    form.barcode = '';
  }
};

const fetchScannedItems = async () => {
  if (!form.lokasi) {
    scannedItems.value = [];
    return;
  }
  isLoading.value = true;
  try {
    const response = await api.get('/hitung-stok-form/scanned-items', {
      params: { lokasi: form.lokasi }
    });
    scannedItems.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat item yang sudah di-scan.');
  } finally {
    isLoading.value = false;
  }

};

onMounted(() => {
  // Fokus ke field lokasi saat halaman pertama kali dibuka
  nextTick(() => {
    document.getElementById('lokasi-field')?.focus();
  });
});
</script>

<template>
  <PageLayout title="Hitung Stok" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" @click="router.back()">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <h2 class="text-h5 font-weight-bold text-primary mb-4">Hitung Stok {{ authStore.user?.cabang }}</h2>
          <v-text-field id="lokasi-field" v-model="form.lokasi" label="LOKASI" variant="outlined" density="compact"
            class="mb-4" @blur="fetchScannedItems" @keydown.enter="focusBarcodeField()" hide-details />
          <v-text-field id="barcode-field" v-model="form.barcode" label="Scan Barcode" variant="outlined"
            density="compact" class="mb-4" @keydown.enter.prevent="handleScan" autofocus hide-details />
          <v-text-field label="Kode Barang" v-model="form.kodeBarang" readonly filled density="compact" hide-details />
          <v-text-field label="Nama Barang" v-model="form.namaBarang" readonly filled density="compact" hide-details />
          <v-text-field label="Ukuran" v-model="form.ukuran" readonly filled density="compact" hide-details />
        </div>
      </div>

      <div class="right-column">
        <div class="table-container">
          <v-data-table :headers="headers" :items="scannedItems" :loading="isLoading" class="desktop-table fill-height"
            density="compact" fixed-header :items-per-page="-1">
            <template #[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

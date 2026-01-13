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

// --- Tambahkan Audio Objects dengan path yang benar ---
// Di Vite/Vue, file di /public diakses langsung dari root '/'
const audioSuccess = new Audio('/audio/beep_success.mp3');
const audioError = new Audio('/audio/beep_error.mp3');

// Pastikan volume penuh
audioSuccess.volume = 1.0;
audioError.volume = 1.0;

const playSuccess = () => {
  audioSuccess.currentTime = 0;
  audioSuccess.play().catch(e => {
    console.error("Gagal memutar suara sukses. Browser mungkin memblokir audio:", e);
  });
};

const playError = () => {
  audioError.currentTime = 0;
  audioError.play().catch(e => {
    console.error("Gagal memutar suara error. Browser mungkin memblokir audio:", e);
  });
};

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
  { title: 'Actions', key: 'actions', sortable: false, width: '80px', align: 'center' },
] as const;

// --- Methods ---
const focusBarcodeField = () => {
  document.getElementById('barcode-field')?.focus();
};

// Fungsi untuk memancing suara agar diizinkan oleh browser
const unlockAudio = () => {
  // Putar suara kosong atau durasi sangat singkat untuk 'pancingan'
  audioSuccess.play().then(() => {
    audioSuccess.pause();
    audioSuccess.currentTime = 0;
  }).catch(() => { });

  // Lepas event listener setelah sekali klik
  document.removeEventListener('click', unlockAudio);
};

onMounted(() => {
  // Tambahkan listener klik global untuk mengaktifkan audio
  document.addEventListener('click', unlockAudio);

  nextTick(() => {
    document.getElementById('lokasi-field')?.focus();
  });
});

const handleScan = async () => {
  if (!form.lokasi) {
    playError();
    toast.error('Silahkan isi Lokasi terlebih dahulu.');
    document.getElementById('lokasi-field')?.focus();
    return;
  }
  if (!form.barcode) return;

  try {
    // 1. Ambil detail produk
    const productResponse = await api.get(`/hitung-stok-form/product-by-barcode/${form.barcode}`);
    const product = productResponse.data;

    form.kodeBarang = product.brg_kode;
    form.namaBarang = product.nama;
    form.ukuran = product.brgd_ukuran;

    // 2. Kirim data scan
    await api.post('/hitung-stok-form/process-scan', {
      lokasi: form.lokasi,
      barcode: form.barcode,
      product: product
    });

    // 3. Feedback Suara Sukses
    playSuccess();

    // 4. Refresh data
    await fetchScannedItems();

    form.barcode = '';
    nextTick(() => {
      document.getElementById('barcode-field')?.focus();
    });

  } catch (error) {
    playError(); // Feedback Suara Error
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memproses scan.');
    form.barcode = '';
    // Focus kembali agar bisa scan ulang
    nextTick(() => document.getElementById('barcode-field')?.focus());
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

const updateQty = async (item: ScannedItem, delta: number) => {
  // Cegah jumlah menjadi minus di sisi frontend
  if (item.jumlah + delta < 0) return;

  try {
    await api.post('/hitung-stok-form/update-qty', {
      lokasi: form.lokasi,
      barcode: item.barcode,
      delta: delta // Mengirim +1 atau -1
    });

    playSuccess();
    // Refresh daftar item untuk mendapatkan total terbaru
    await fetchScannedItems();
  } catch (error) {
    playError();
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memperbarui jumlah.');
  }
};

const deleteRow = async (item: ScannedItem) => {
  // Tambahkan konfirmasi agar tidak tidak sengaja terhapus
  if (!confirm(`Hapus seluruh scan untuk barang: ${item.nama}?`)) return;

  try {
    await api.delete('/hitung-stok-form/delete-item', {
      params: {
        lokasi: form.lokasi,
        barcode: item.barcode
      }
    });

    playSuccess();
    toast.success('Item berhasil dihapus dari daftar scan.');
    await fetchScannedItems();
  } catch (error) {
    playError();
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus item.');
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
            <template #[`item.jumlah`]="{ item }">
              <div class="d-flex align-center justify-end">
                <v-btn icon="mdi-minus" size="x-small" variant="tonal" color="error" class="mr-2"
                  :disabled="item.jumlah <= 0" @click="updateQty(item, -1)"></v-btn>

                <span class="font-weight-bold" style="min-width: 30px; text-align: center;">
                  {{ item.jumlah }}
                </span>

                <v-btn icon="mdi-plus" size="x-small" variant="tonal" color="success" class="ml-2"
                  @click="updateQty(item, 1)"></v-btn>
              </div>
            </template>

            <template #[`item.actions`]="{ item }">
              <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="deleteRow(item)"></v-btn>
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

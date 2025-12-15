<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import StoreSearchModal from '@/components/lookup/StoreSearchModal.vue';
import PermintaanSearchModal from '@/components/lookup/PermintaanSearchModal.vue';
import MintaBarangSearchModal from '@/components/lookup/MintaBarangSearchModal.vue'; // Untuk tambah manual
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface Item {
  id: number; // ID Unik untuk key di v-for
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;    // Stok DC saat ini
  minta: number;   // Jumlah permintaan dari store (referensi)
  jumlah: number;  // Jumlah yang akan dikirim (inputan user)
  barcode: string;
  keterangan?: string;
}

interface ItemResponse {
  kode: string;
  nama: string;
  ukuran: string;
  stok?: number;
  minta?: number;
  jumlah?: number;
  barcode?: string;
}

interface SearchResult {
  kode: string;
  nama: string;
  ukuran: string;
  barcode: string;
  stok?: number; // Opsional karena tidak semua endpoint lookup mengembalikan stok
}

interface BackendItem {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number | string; // Bisa string jika dari SQL Decimal
  stok: number | string;
  barcode: string;
  keterangan?: string;
}

// --- Inisialisasi ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '224';

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Packing List' : 'Buat Packing List Baru');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const isLoading = ref(true);
const isSaving = ref(false);

const header = reactive({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  store: { kode: '', nama: '' },
  permintaan: '',
  keterangan: '',
});

const items = ref<Item[]>([]);
const scannedBarcode = ref('');

// Dialogs
const dialog = reactive({
  storeSearch: false,
  permintaanSearch: false,
  productSearch: false, // Untuk tambah item manual
  confirm: false
});

const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const tableHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '120px' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', width: '80px' },
  { title: 'Stok DC', key: 'stok', align: 'end', width: '100px' },
  { title: 'Minta', key: 'minta', align: 'end', width: '100px' },
  { title: 'Jml Kirim', key: 'jumlah', align: 'end', width: '120px' },
  { title: 'Keterangan', key: 'keterangan', width: '150px' },
  { title: 'Hapus', key: 'actions', sortable: false, width: '50px' },
] as const;

// --- Methods ---
// [TAMBAHAN] Helper formatting
const formatNumber = (val: number | string) => {
  return Number(val).toLocaleString('id-ID'); // Otomatis hilangkan desimal tak perlu
};

const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  // Hanya tambah baris baru jika baris terakhir sudah terisi
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(), kode: '', nama: '', ukuran: '',
      stok: 0, minta: 0, jumlah: 0, barcode: ''
    });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
  if (items.value.length === 0) addNewRow();
};

// Scan Barcode
const handleBarcodeScan = async () => {
  // --- VALIDASI BARU ---
  if (!header.store.kode) {
    toast.warning("Silakan pilih Store Tujuan terlebih dahulu!");
    scannedBarcode.value = ''; // Kosongkan input agar user tidak bingung
    return;
  }
  // ---------------------
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  // Cek apakah item sudah ada di grid
  const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
  if (existingItem) {
    existingItem.jumlah += 1;
    toast.info(`Jumlah untuk ${existingItem.nama} ditambah.`);
    scannedBarcode.value = '';
    return;
  }

  // Jika belum ada, cari ke backend
  try {
    const response = await api.get(`/packing-list-form/barcode/${barcode}`);
    const product = response.data;

    // Cari baris kosong
    const emptyRowIndex = items.value.findIndex(item => !item.kode);

    const newItem: Item = {
      id: Date.now(),
      kode: product.kode,
      nama: product.nama,
      ukuran: product.ukuran,
      stok: product.stok || 0,
      minta: 0, // Scan manual tidak punya referensi minta
      jumlah: 1,
      barcode: product.barcode
    };

    if (emptyRowIndex !== -1) {
      items.value.splice(emptyRowIndex, 1, newItem);
    } else {
      items.value.push(newItem);
    }
    addNewRow(); // Siapkan baris kosong berikutnya

  } catch (error) {
    toast.error("Barcode tidak ditemukan.", error);
  } finally {
    scannedBarcode.value = '';
  }
};

// 2. Tambahkan Method Baru untuk Buka Modal Cari Barang
const openProductSearch = () => {
  // --- VALIDASI BARU ---
  if (!header.store.kode) {
    toast.warning("Silakan pilih Store Tujuan terlebih dahulu!");
    return;
  }
  // ---------------------

  dialog.productSearch = true;
};

// Load Items dari Permintaan Store
const loadItemsFromRequest = async (nomorPermintaan: string) => {
  isLoading.value = true;
  try {
    const response = await api.get('/packing-list-form/load-request', { params: { nomor: nomorPermintaan } });

    // Replace items atau append? Biasanya replace jika load dokumen
    // Kita kosongkan dulu biar bersih
    items.value = [];

    const newItems = response.data.map((item: ItemResponse) => ({
      id: Date.now() + Math.random(),
      kode: item.kode,
      nama: item.nama,
      ukuran: item.ukuran,
      stok: Number(item.stok) || 0,
      minta: Number(item.minta) || 0,
      jumlah: Number(item.minta) || 0, // Default jumlah kirim = jumlah minta
      barcode: item.barcode || ''
    }));

    items.value = [...newItems];
    addNewRow();

    toast.success(`Berhasil memuat ${newItems.length} item dari permintaan.`);
  } catch (err) {
    // Casting error menjadi AxiosError agar properti response terbaca
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat detail permintaan.");
  } finally {
    isLoading.value = false;
  }
};

// --- Event Handlers Modal ---
const onStoreSelected = (store: { kode: string, nama: string }) => {
  header.store = store;
  dialog.storeSearch = false;
  // Jika ganti store, kosongkan permintaan karena permintaan terikat store
  header.permintaan = '';
};

const onPermintaanSelected = async (permintaan: { nomor: string }) => {
  header.permintaan = permintaan.nomor;
  dialog.permintaanSearch = false;
  // Tanya user: mau load item otomatis?
  showConfirmation(
    'Load Item?',
    'Apakah Anda ingin memuat daftar barang dari permintaan ini ke tabel? (Data tabel saat ini akan ditimpa)',
    () => loadItemsFromRequest(permintaan.nomor)
  );
};

const onProductSelected = (products: SearchResult[]) => {
  products.forEach(p => {
    // Cek duplikat (Kode + Ukuran)
    const exists = items.value.find(i => i.kode === p.kode && i.ukuran === p.ukuran);

    if (!exists) {
      const emptyIdx = items.value.findIndex(i => !i.kode);

      const newItem = {
        id: Date.now() + Math.random(),
        kode: p.kode,
        nama: p.nama,
        ukuran: p.ukuran || 'ALLSIZE',
        // Note: source 'minta-barang' mungkin tidak return stok real-time (tergantung query backend).
        // Jika tidak ada, default 0. Nanti sistem validasi saat simpan.
        stok: p.stok || 0,
        minta: 0,
        jumlah: 1,
        barcode: p.barcode || ''
      };

      if (emptyIdx !== -1) items.value.splice(emptyIdx, 1, newItem);
      else items.value.push(newItem);
    }
  });

  dialog.productSearch = false;
  addNewRow(); // Tambah baris kosong baru di bawah
};

// --- Save & Utility ---
const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleSave = () => {
  if (!header.store.kode) return toast.error('Pilih Store tujuan.');
  const validItems = items.value.filter(i => i.kode && i.jumlah > 0);
  if (validItems.length === 0) return toast.error('Belum ada item yang diinput.');

  showConfirmation('Simpan Data', 'Yakin ingin menyimpan Packing List ini?', executeSave);
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const validItems = items.value.filter(i => i.kode && i.jumlah > 0);
    const payload = {
      header,
      items: validItems,
      isNew: !isEditMode.value
    };

    const response = await api.post('/packing-list-form/save', payload);
    toast.success(response.data.message);
    const nomorPL = response.data.nomor;

    // 1. Buka Tab Cetak
    const url = router.resolve({ name: 'PackingListPrint', params: { nomor: nomorPL } }).href;
    window.open(url, '_blank');

    // 2. Redirect Halaman Ini Kembali ke Browse/List
    router.push({ name: 'PackingList' }); // <--- TAMBAHKAN INI

  } catch (err) {
    // Casting error menjadi AxiosError
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/packing-list-form/form/${nomor}`);
    const data = response.data;

    header.nomor = data.header.nomor;
    header.tanggal = format(new Date(data.header.tanggal), 'yyyy-MM-dd');
    header.store = { kode: data.header.store_kode, nama: data.header.store_nama };
    header.permintaan = data.header.permintaan;
    header.keterangan = data.header.keterangan;

    items.value = (data.items as BackendItem[]).map((item) => ({
      id: Date.now() + Math.random(),
      kode: item.kode,
      nama: item.nama,
      ukuran: item.ukuran,
      stok: Number(item.stok),
      minta: 0,
      jumlah: Number(item.jumlah),
      barcode: item.barcode,
      keterangan: item.keterangan || ''
    }));
    addNewRow();

  } catch (error) {
    toast.error('Gagal memuat data edit.', error);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error('Akses ditolak.');
    router.push({ name: 'PackingList' });
    return;
  }

  if (isEditMode.value) {
    loadDataForEdit(route.params.nomor as string);
  } else {
    isLoading.value = false;
    addNewRow();
  }
});

// Styling helpers
const getStockColor = (item: Item) => {
  if (item.jumlah > item.stok) return 'text-red font-weight-bold'; // Warning Stok Kurang
  return '';
};
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-package-variant-closed">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="handleSave" :loading="isSaving" prepend-icon="mdi-content-save">
        Simpan
      </v-btn>
      <v-btn size="small" @click="router.back()" prepend-icon="mdi-close">
        Batal
      </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field label="Nomor PL" v-model="header.nomor" readonly placeholder="(Otomatis)" density="compact"
                hide-details variant="filled" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Tanggal" v-model="header.tanggal" type="date" density="compact" hide-details
                variant="outlined" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Store Tujuan" v-model="header.store.kode" append-inner-icon="mdi-magnify" readonly
                @click="dialog.storeSearch = true" density="compact" hide-details variant="outlined"
                placeholder="Pilih Store..." />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Nama Store" v-model="header.store.nama" readonly density="compact" hide-details
                variant="filled" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="No. Permintaan" v-model="header.permintaan" append-inner-icon="mdi-magnify" readonly
                @click="!isEditMode && header.store.kode ? dialog.permintaanSearch = true : null" density="compact"
                hide-details variant="outlined" :disabled="isEditMode || !header.store.kode"
                placeholder="Opsional (Load Minta Barang)" />
            </v-col>
            <v-col cols="12">
              <v-textarea label="Keterangan" v-model="header.keterangan" rows="3" density="compact" hide-details
                variant="outlined" />
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <div class="d-flex justify-space-between align-center mb-2 ga-2">
            <div class="scanner-wrapper flex-grow-1">
              <v-text-field v-model="scannedBarcode" label="Scan Barcode (F1 untuk Cari)"
                placeholder="Scan item untuk tambah/update jumlah..." variant="outlined" density="compact"
                prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan"
                @keydown.f1.prevent="openProductSearch" autofocus />
            </div>

            <v-btn size="small" color="secondary" variant="tonal" prepend-icon="mdi-magnify" @click="openProductSearch">
              Cari Barang
            </v-btn>
          </div>

          <v-data-table :headers="tableHeaders" :items="items" class="desktop-table fill-height-table" density="compact"
            fixed-header :items-per-page="-1" :loading="isLoading">

            <template #[`item.kode`]="{ item }">
              <span class="font-weight-medium">{{ item.kode }}</span>
            </template>

            <template #[`item.stok`]="{ item }">
              {{ formatNumber(item.stok) }}
            </template>

            <template #[`item.minta`]="{ item }">
              {{ formatNumber(item.minta) }}
            </template>

            <template #[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" step="1" min="0" variant="underlined"
                density="compact" hide-details class="text-right input-jumlah" :class="getStockColor(item)" />
            </template>

            <template #[`item.keterangan`]="{ item }">
              <v-text-field v-model="item.keterangan" variant="underlined" density="compact" hide-details />
            </template>

            <template #[`item.actions`]="{ item }">
              <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                @click="removeRow(item.id)" tabindex="-1" />
            </template>

            <template #bottom>
              <div class="pa-2 text-right">
                <v-btn size="small" variant="text" color="primary" @click="addNewRow" prepend-icon="mdi-plus">Tambah
                  Baris</v-btn>
              </div>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <StoreSearchModal v-if="dialog.storeSearch" @close="dialog.storeSearch = false" @store-selected="onStoreSelected" />

    <PermintaanSearchModal v-if="dialog.permintaanSearch" :store-kode="header.store.kode"
      @close="dialog.permintaanSearch = false" @permintaan-selected="onPermintaanSelected" />

    <MintaBarangSearchModal v-if="dialog.productSearch" source="minta-barang" :gudang="authStore.user?.cabang || ''"
      :multi="true" @close="dialog.productSearch = false" @products-selected="onProductSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px">
      <v-card>
        <v-card-title class="text-h6">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </PageLayout>
</template>

<style scoped>
.scanner-wrapper {
  max-width: 400px;
}

.input-jumlah :deep(input) {
  text-align: right;
}
</style>

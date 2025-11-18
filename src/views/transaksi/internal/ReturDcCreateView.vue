<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import GudangSearchModal from '@/components/lookup/GudangSearchModal.vue';
import MintaBarangSearchModal from '@/components/lookup/MintaBarangSearchModal.vue';
import axios, { AxiosError } from 'axios';

// --- Tipe Data ---
interface Header {
  nomor: string;
  tanggal: string;
  gudangDc: { kode: string, nama: string };
  keterangan: string;
}
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  harga: number;
  hargaDtf: number;
  jenis: string;
  ket: string;
  diskon: number;
  hargabaru: number;
  kodebaru: string;
  barcode: string;
}
interface ProductSelected {
  kode: string;
  ukuran: string;
}

interface ProductDetail {
  kode: string;
  ukuran: string;
  nama: string;
  barcode: string;
  stok: number;
  harga: number;
  // tambahkan properti lain sesuai response API
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '32';
const isEditMode = ref(false);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Retur Barang ke DC' : 'Buat Retur Barang ke DC');
const canView = computed(() => authStore.can(MENU_ID, 'view'));
const canInsert = computed(() => authStore.can(MENU_ID, 'insert'));
const canEdit = computed(() => authStore.can(MENU_ID, 'edit'));
// Izin simpan bergantung pada mode (insert/edit)
const canSave = computed(() => isEditMode.value ? canEdit.value : canInsert.value);

const header = reactive<Header>({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  gudangDc: { kode: 'KDC', nama: 'PUSAT' },
  keterangan: '',
});
const items = ref<Item[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const scannedBarcode = ref('');
const dialog = reactive({ gudangSearch: false, productSearch: false });
const isMultiSelectProduct = ref(false);
const activeRowIndex = ref(0);

const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const tableHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '100px' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', width: '60px' },
  { title: 'Stok', key: 'stok', align: 'end', width: '60px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '60px' },
  { title: 'Barcode', key: 'barcode', width: '100px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
] as const;

// --- Methods ---
const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(),
      kode: '',
      nama: '',
      ukuran: '',
      stok: 0,
      jumlah: 0,
      harga: 0,
      hargaDtf: 0,
      jenis: '',
      ket: '',
      diskon: 0,
      hargabaru: 0,
      kodebaru: '',
      barcode: ''
    });
  }
};


const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
  if (items.value.length === 0) addNewRow();
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const closeForm = () => router.push({ name: 'ReturDc' });
const handleCancel = () => { /* Logika Batal/Reset Form */ };
const handleClose = () => showConfirmation('Konfirmasi Tutup', 'Tutup form?', closeForm);

const onGudangSelected = (gudang: { kode: string, nama: string }) => {
  header.gudangDc = gudang;
  dialog.gudangSearch = false;
};

// const handleLoadFromStock = async () => {
//     showConfirmation(
//         'Konfirmasi Load Stok',
//         'Semua item di grid akan diganti dengan semua barang yang memiliki stok. Lanjutkan?',
//         async () => {
//             isLoading.value = true;
//             try {
//                 const response = await api.get('/retur-dc-form/load-all-stock');
//                 items.value = response.data.map((item: any) => ({
//                     ...item,
//                     id: Date.now() + Math.random(),
//                     jumlah: item.stok,
//                 }));
//                 addNewRow();
//                 toast.success('Semua item yang memiliki stok berhasil dimuat.');
//             } catch (error) {
//                 toast.error('Gagal memuat data stok.');
//             } finally {
//                 isLoading.value = false;
//             }
//         }
//     );
// };

const handleBarcodeScan = async () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;
  const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
  if (existingItem) {
    existingItem.jumlah = (existingItem.jumlah || 0) + 1;
    toast.info(`Jumlah untuk ${existingItem.nama} ditambah.`);
    scannedBarcode.value = '';
    return;
  }
  try {
    const response = await api.get(`/retur-dc-form/lookup/by-barcode/${barcode}`, { params: { gudang: authStore.user?.cabang } });
    const product = response.data;
    const emptyRowIndex = items.value.findIndex(item => !item.kode);
    if (emptyRowIndex !== -1) {
      items.value.splice(emptyRowIndex, 1, { ...product, id: Date.now(), jumlah: 1 });
      addNewRow();
    }
  } catch (error: unknown) { // <-- 2. Catch as 'unknown'
    // --- 3. Refactored Error Handling ---
    let errorMessage = `Barcode ${barcode} tidak valid atau terjadi kesalahan.`; // Default message
    if (axios.isAxiosError(error)) {
      // Now TypeScript knows 'error' is an AxiosError
      const axiosError = error as AxiosError<{ message?: string }>; // Optional: Cast for clearer data access
      if (axiosError.response?.data?.message) {
        errorMessage = axiosError.response.data.message;
      } else if (axiosError.message) {
        errorMessage = axiosError.message; // Use Axios's generic message if no specific one
      }
    } else if (error instanceof Error) {
      errorMessage = error.message; // Handle generic JS Errors
    }
    toast.error(errorMessage);
    // ------------------------------------
  } finally {
    scannedBarcode.value = '';
  }
};

const openProductSearch = (index: number, isMulti: boolean) => {
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  dialog.productSearch = true;
};

const onProductsSelected = async (selectedProducts: ProductSelected[]) => {
  dialog.productSearch = false;

  const productsToAdd = selectedProducts.filter(
    p => !items.value.some(item => item.kode === p.kode && item.ukuran === p.ukuran)
  );

  if (productsToAdd.length === 0 && selectedProducts.length > 0)
    return toast.info('Semua produk sudah ada di daftar.');

  try {
    const detailPromises = productsToAdd.map(p =>
      api.get<ProductDetail>('/retur-dc-form/lookup/product-details', {
        params: { kode: p.kode, ukuran: p.ukuran, gudang: authStore.user?.cabang },
      })
    );

    const responses = await Promise.all(detailPromises);

    const newItems = responses.map(res => ({
      ...res.data,
      id: Date.now() + Math.random(),
      jumlah: 1,
      hargaDtf: res.data.harga || 0,
      jenis: '',
      ket: '',
      diskon: 0,
      hargabaru: 0,
      kodebaru: ''
    }));

    items.value.splice(activeRowIndex.value, 1, ...newItems);
    addNewRow();
  } catch (error: unknown) {
    toast.error('Gagal memuat detail produk.');
    console.error(error);
  }
};

const save = () => {
  if (!canSave.value) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    return;
  }
  // --- VALIDASI DARI DELPHI ---
  if (!isEditMode.value && new Date(header.tanggal) < new Date(format(new Date(), 'yyyy-MM-dd'))) {
    return toast.error('Tanggal tidak boleh mundur dari hari ini.');
  }
  const validItems = items.value.filter(i => i.kode);
  if (validItems.length === 0) {
    return toast.error('Detail barang harus diisi.');
  }
  if (validItems.some(i => (i.jumlah || 0) <= 0)) {
    return toast.error('Jumlah retur harus diisi dan lebih dari 0.');
  }
  if (validItems.some(i => (i.jumlah || 0) > i.stok)) {
    return toast.error('Ada jumlah retur yang melebihi stok yang tersedia.');
  }
  // --- AKHIR VALIDASI ---

  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data ini?', executeSave);
};

const executeSave = async () => {
  if (!canSave.value) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    isSaving.value = false; // Pastikan loading dihentikan
    return;
  }

  isSaving.value = true;
  const payload = {
    header,
    items: items.value.filter(i => i.kode && (i.jumlah || 0) > 0),
    isNew: !isEditMode.value,
  };
  try {
    const response = await api.post('/retur-dc-form/save', payload);
    toast.success(response.data.message);

    // --- ALUR CETAK OTOMATIS ---
    const nomorDokumen = response.data.nomor;
    if (nomorDokumen) {
      const url = router.resolve({ name: 'ReturDcPrint', params: { nomor: nomorDokumen } }).href;
      window.open(url, '_blank');
    }
    // --- AKHIR ALUR CETAK ---

    router.push({ name: 'ReturDc' }); // Arahkan kembali ke browse
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Cek apakah error dari Axios
      const axiosError = error as AxiosError<{ message: string }>;
      toast.error(axiosError.response?.data?.message || error.message || 'Gagal menyimpan data.');
    } else {
      toast.error('Gagal menyimpan data.');
    }
  } finally {
    isSaving.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  try {
    const response = await api.get(`/retur-dc-form/${nomor}`);
    Object.assign(header, response.data.header);
    header.tanggal = format(parseISO(header.tanggal), 'yyyy-MM-dd');
    items.value = response.data.items.map((item: Item) => ({
      ...item,
      id: Date.now() + Math.random(), // tambahkan id unik
    }));
  } catch (error: unknown) {
    if (error instanceof Error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const message = axiosError.response?.data?.message || error.message || 'Gagal memuat data.';
      toast.error(message);
    } else {
      toast.error('Gagal memuat data.');
    }
    router.back();
  }
};

onMounted(async () => {
  // --- TAMBAHKAN PENGECEKAN AWAL ---
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading
    toast.error('Anda tidak memiliki izin untuk mengakses halaman ini.');
    // Opsional: Redirect atau tampilkan pesan akses ditolak di template
    // router.replace({ name: 'Forbidden' });
    return; // Hentikan eksekusi onMounted
  }
  // ------------------------------------

  // --- Perubahan: Set isLoading di sini ---
  isLoading.value = true;
  // ------------------------------------

  const nomor = route.params.nomor as string;
  if (isEditMode.value && nomor) {
    await loadDataForEdit(nomor);
  } else {
    // Form baru, pastikan isEditMode false
    isEditMode.value = false; // Tambahkan ini untuk kejelasan
  }
  addNewRow(); // Tambah baris kosong di akhir (untuk baru atau edit)
  isLoading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-truck-minus-outline">
    <template #header-actions>
      <v-btn size="small" prepend-icon="mdi-content-save" color="primary" @click="save"
        :loading="isSaving">Simpan</v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh" @click="handleCancel">Batal</v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="handleClose">Tutup</v-btn>
    </template>
    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12"><v-text-field label="No. Retur" v-model="header.nomor" readonly filled hide-details
                density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                hide-details density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Gudang DC" v-model="header.gudangDc.kode"
                @click="dialog.gudangSearch = true" prepend-inner-icon="mdi-magnify" readonly variant="outlined"
                hide-details density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Nama Gudang DC" v-model="header.gudangDc.nama" readonly filled
                hide-details density="compact" /></v-col>
            <v-col cols="12"><v-textarea label="Keterangan" v-model="header.keterangan" rows="3" variant="outlined"
                hide-details density="compact" /></v-col>
            <!-- <v-col cols="12">
                            <v-btn block color="info" @click="handleLoadFromStock" prepend-icon="mdi-download"
                                :loading="isLoading">
                                Load from Stok
                            </v-btn>
                        </v-col> -->
          </v-row>
        </div>
      </div>
      <div class="right-column">
        <div class="scanner-wrapper mb-4">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..." variant="outlined" density="compact"
            prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan" />
        </div>
        <div class="desktop-form-section d-flex flex-column fill-height">
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading"
            class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
            <template #[`item.kode`]="{ item, index }">
              <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                placeholder="F1/F2..." @keydown.f1.prevent="openProductSearch(index, false)"
                @keydown.f2.prevent="openProductSearch(index, true)" />
            </template>
            <template #[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" density="compact"
                hide-details class="text-center" :rules="[v => v <= item.stok || 'Max stok']" min="0" />
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                @click="removeRow(item.id)" />
            </template>
            <template #bottom>
              <div class="pa-2 text-right"><v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus">Tambah
                  Baris</v-btn></div>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <GudangSearchModal v-if="dialog.gudangSearch" :user-cabang="authStore.user?.cabang || ''" source="retur-dc"
      @close="dialog.gudangSearch = false" @gudang-selected="onGudangSelected" />
    <MintaBarangSearchModal v-if="dialog.productSearch" :gudang="authStore.user?.cabang || ''"
      :multi="isMultiSelectProduct" source="koreksi-stok" @close="dialog.productSearch = false"
      @products-selected="onProductsSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya,
            Lanjutkan</v-btn>
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

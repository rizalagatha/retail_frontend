<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import SoSearchModal from '@/components/lookup/SoSearchModal.vue';
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
import MintaBarangSearchModal from '@/components/lookup/MintaBarangSearchModal.vue';
import { AxiosError } from 'axios';

interface Customer {
  kode: string;
  nama: string;
  alamat: string;
}

interface FormHeader {
  nomor: string;
  tanggal: string;
  soNomor: string;
  customer: Customer | null;
  keterangan: string;
  gudang?: { kode: string; nama?: string };
}

interface Product {
  kode: string;
  nama: string;
  ukuran?: string;
  stok?: number;
  harga?: number;
  barcode?: string;
  // tambahkan properti lain sesuai API
}

interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran?: string;
  stokmin?: number;
  stokmax?: number;
  sudahminta?: number;
  sj?: number;
  stok?: number;
  mino?: number;
  jumlah?: number;
  barcode?: string;
  harga?: number;
}

interface SoItem {
  kode: string;
  nama: string;
  ukuran?: string;
  stok?: number;
  jumlah?: number;
  barcode?: string;
  // properti lain sesuai response API
}

interface SoDetailsResponse {
  items: SoItem[];
  customer: Customer;
}

interface MintaBarangHeader {
  nomor: string;
  tanggal: string;
  soNomor?: string;
  customer?: Customer;
  keterangan?: string;
}

interface MintaBarangItem {
  id: number;
  kode: string;
  nama: string;
  ukuran?: string;
  stokmin?: number;
  stokmax?: number;
  sudahminta?: number;
  sj?: number;
  stok?: number;
  mino?: number;
  jumlah?: number;
  barcode?: string;
  harga?: number;      // tambahkan properti harga
  diskonPersen?: number;
  diskonRp?: number;
  total?: number;
}

interface LoadMintaBarangResponse {
  header: MintaBarangHeader;
  items: MintaBarangItem[];
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '37';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Minta Barang ke DC' : 'Buat Minta Barang ke DC');

const initialHeaderState: FormHeader = {
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  soNomor: '',
  customer: null,
  keterangan: '',
};

const formHeader = ref<FormHeader>({ ...initialHeaderState });
const items = ref<Item[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isSoSearchVisible = ref(false);
const isCustomerSearchVisible = ref(false);
const isProductSearchVisible = ref(false);
const isMultiSelectProduct = ref(false);
const activeRowIndex = ref(0);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);
const scannedBarcode = ref('');

const tableHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '250px' },
  { title: 'Nama Barang', key: 'nama', minWidth: '250px' },
  { title: 'Ukuran', key: 'ukuran', width: '30px' },
  { title: 'Stok Min', key: 'stokmin', align: 'end', width: '30px' },
  { title: 'Stok Max', key: 'stokmax', align: 'end', width: '30px' },
  { title: 'Sudah Minta', key: 'sudahminta', align: 'end', width: '30px' },
  { title: 'SJ Blm Diterima', key: 'sj', align: 'end', width: '30px' },
  { title: 'Stok', key: 'stok', align: 'end', width: '30px' },
  { title: 'Minta Otomatis', key: 'mino', align: 'end', width: '30px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '40px' },
  { title: 'Barcode', key: 'barcode', width: '100px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '40px' },
] as const;

const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({ id: Date.now(), kode: '', nama: '', jumlah: null });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
};

const resetForm = () => {
  formHeader.value = { ...initialHeaderState };
  items.value = [];
  addNewRow();
};

const openProductSearch = (index: number, isMulti: boolean) => {
  if (!formHeader.value.customer?.kode) { // Ganti 'header.value.customer?.kode' jika perlu
    toast.error('Pilih customer terlebih dahulu sebelum menambah item!');
    return; // Hentikan fungsi jika customer belum dipilih
  }
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  isProductSearchVisible.value = true;
};

const onProductsSelected = (selectedProducts: Product[]) => {
  isProductSearchVisible.value = false;
  if (!selectedProducts || selectedProducts.length === 0) return;

  // Saring produk duplikat yang sudah ada di grid
  const productsToAdd = selectedProducts.filter(p =>
    !items.value.some(item => item.kode === p.kode && item.ukuran === p.ukuran)
  );

  if (productsToAdd.length === 0) {
    toast.info("Semua produk yang dipilih sudah ada di dalam daftar.");
    if (!items.value.some(item => !item.kode)) {
      addNewRow();
    }
    return;
  }

  // Ubah produk terpilih menjadi format item untuk grid
  // Tidak perlu API call tambahan karena semua data (stok, harga) sudah ada
  const newItems = productsToAdd.map(product => ({
    ...product, // Salin semua properti dari produk (kode, nama, ukuran, stok, harga, barcode)
    id: Date.now() + Math.random(),
    jumlah: 1, // Atur jumlah awal
    // Set nilai default untuk kolom lain jika perlu
    stokmin: 0,
    stokmax: 0,
    sudahminta: 0,
    sj: 0,
    mino: 0,
  }));

  // Ganti baris kosong saat ini dengan item-item baru
  items.value.splice(activeRowIndex.value, 1, ...newItems);

  // Tambahkan baris kosong baru di akhir
  addNewRow();
};

const openCustomerSearch = () => {
  // Customer hanya bisa dipilih jika belum ada SO yang dipilih
  if (!formHeader.value.soNomor) {
    isCustomerSearchVisible.value = true;
  }
};

const onCustomerSelected = (customer: Customer) => {
  formHeader.value.customer = customer;
  isCustomerSearchVisible.value = false;
};

const onSoSelected = async (so: { Nomor: string; Customer: string; KdCus: string; Alamat: string }) => {
  isSoSearchVisible.value = false;
  formHeader.value.soNomor = so.Nomor;
  formHeader.value.customer = {
    kode: so.KdCus,
    nama: so.Customer,
    alamat: so.Alamat
  };
  isLoading.value = true;

  try {
    const response = await api.get<SoDetailsResponse>(`/minta-barang-form/lookup/so-details/${so.Nomor}`);

    items.value = response.data.items.map((item: SoItem, index: number) => ({
      ...item,
      id: Date.now() + index
    }));

    formHeader.value.customer = response.data.customer;
    addNewRow();

  } catch (error: unknown) {
    toast.error('Gagal memuat detail SO.', error);
  } finally {
    isLoading.value = false;
  }
};

const showConfirmation = (action: () => void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
};
const executePendingAction = () => {
  if (pendingAction.value) {
    pendingAction.value();
  }
  isConfirmDialogVisible.value = false;
};
const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
  pendingAction.value = null;
};
const closeForm = () => {
  router.push('/transaksi/internal/minta-barang');
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get<LoadMintaBarangResponse>(`/minta-barang-form/${nomor}`);
    const { header, items: loadedItems } = response.data;

    // Isi header form
    formHeader.value = {
      ...formHeader.value,
      ...header,
      tanggal: format(new Date(header.tanggal), 'yyyy-MM-dd'),
    };

    // Isi grid
    items.value = loadedItems.map((item: MintaBarangItem) => ({
      ...item,
      id: Date.now() + Math.random()
    }));

    addNewRow();

  } catch (error: unknown) {
    toast.error('Gagal memuat data.', error);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const save = () => {
  if (!authStore.can(MENU_ID, isEditMode.value ? 'edit' : 'insert')) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    return;
  }
  // --- Migrasi Validasi dari Delphi (btnSimpanClick) ---
  if (!formHeader.value.soNomor && !formHeader.value.customer?.kode) {
    toast.error('No. Pesanan atau Customer harus diisi.');
    return;
  }
  const validItems = items.value.filter(item => item.kode);
  if (validItems.length === 0) {
    toast.error('Detail barang harus diisi minimal 1 baris.');
    return;
  }
  const totalQty = validItems.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  if (totalQty === 0) {
    toast.error('Jumlah minta masih kosong semua.');
    return;
  }

  // Jika semua validasi lolos, tampilkan dialog konfirmasi
  showConfirmation(executeSave, "Anda yakin ingin menyimpan data Minta Barang ini?");
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: formHeader.value,
      items: items.value.filter(item => item.kode && (item.jumlah || 0) > 0),
      isNew: !isEditMode.value,
    };
    const response = await api.post('/minta-barang-form/save', payload);
    toast.success(response.data.message);
    router.push('/transaksi/internal/minta-barang');
  } catch (error) {
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const handleBarcodeScan = async () => {
  // Validasi dasar: gudang dan barcode harus ada
  const gudangKode = authStore.user?.cabang; // Menggunakan gudang dari user yang login
  if (!formHeader.value.customer?.kode) {
    toast.error('Pilih customer terlebih dahulu sebelum scan barcode!');
    return;
  }
  if (!gudangKode) {
    toast.error('Gudang tidak terdefinisi, tidak bisa scan barcode!');
    return;
  }
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  // Cek apakah item dengan barcode yang sama sudah ada di grid
  const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
  if (existingItem) {
    // Jika sudah ada, cukup tambahkan jumlahnya
    existingItem.jumlah = (existingItem.jumlah || 0) + 1;
    toast.info(`Jumlah untuk ${existingItem.nama} ditambah menjadi ${existingItem.jumlah}`);
    scannedBarcode.value = ''; // Kosongkan input scanner
    return;
  }

  try {
    // --- PERUBAHAN ENDPOINT ---
    // Panggil endpoint baru yang spesifik untuk minta barang
    const response = await api.get<MintaBarangItem>(`/minta-barang-form/by-barcode/${barcode}`, {
      params: { gudang: gudangKode }
    });

    const product = response.data;

    // Cari baris kosong pertama di grid untuk diisi
    const emptyRowIndex = items.value.findIndex(item => !item.kode);
    if (emptyRowIndex !== -1) {
      // --- PENYESUAIAN KOLOM ---
      // Ganti baris kosong dengan data produk, termasuk nilai default untuk kolom yang tidak ada dari API
      items.value.splice(emptyRowIndex, 1, {
        id: Date.now(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        harga: product.harga,
        barcode: product.barcode,
        jumlah: 1, // Jumlah awal saat scan
        // Kolom tambahan dari grid Minta Barang diisi nilai default
        stokmin: 0,
        stokmax: 0,
        sudahminta: 0,
        sj: 0,
        mino: 0,
      });
      addNewRow(); // Tambah baris kosong baru di akhir
    } else {
      toast.error("Tidak ada baris kosong untuk menambahkan item baru.");
    }

  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      toast.error(err.response?.data?.message || `Barcode ${barcode} tidak valid.`);
    } else {
      toast.error(`Barcode ${barcode} tidak valid.`);
    }
  } finally {
    scannedBarcode.value = ''; // Selalu kosongkan input scanner
  }
};

onMounted(() => {
  // Cek hak akses 'insert' (untuk baru) atau 'edit' (untuk ubah)
  if (!authStore.can(MENU_ID, isEditMode.value ? 'edit' : 'insert')) {
    toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data ini.`);
    router.back(); // Lempar user kembali ke halaman sebelumnya
    return;
  }

  const nomor = route.params.nomor as string;
  if (isEditMode.value && nomor) {
    loadDataForEdit(nomor);
  } else {
    resetForm();
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-playlist-plus">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="save" :loading="isSaving">
        Simpan
      </v-btn>
      <v-btn size="small" @click="showConfirmation(resetForm, 'Batalkan perubahan dan kosongkan form?')">
        Batal
      </v-btn>
      <v-btn size="small"
        @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')">
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field label="Nomor" v-model="formHeader.nomor" readonly filled density="compact" hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Tanggal" v-model="formHeader.tanggal" type="date" density="compact" hide-details
                variant="outlined" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="No. Pesanan" v-model="formHeader.soNomor" readonly @click="isSoSearchVisible = true"
                density="compact" hide-details :class="{ 'field-disabled': isEditMode }" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Customer" :model-value="formHeader.customer?.kode" readonly
                @click="openCustomerSearch" density="compact" hide-details
                :class="{ 'field-disabled': !!formHeader.soNomor }" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Nama Customer" :model-value="formHeader.customer?.nama" readonly filled
                density="compact" hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Alamat" :model-value="formHeader.customer?.alamat" readonly filled density="compact"
                hide-details rows="2" />
            </v-col>
            <v-col cols="12">
              <v-textarea label="Keterangan" v-model="formHeader.keterangan" density="compact" hide-details
                variant="outlined" rows="3" />
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="scanner-wrapper">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..."
            placeholder="Input barcode lalu tekan Enter" variant="outlined" density="compact"
            prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan">
          </v-text-field>
        </div>
        <div class="table-scroll-wrapper">
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
            class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
            <template v-slot:[`item.kode`]="{ item, index }">
              <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                placeholder="F1/F2..." @keydown.f1.prevent="openProductSearch(index, false)"
                @keydown.f2.prevent="openProductSearch(index, true)" />
            </template>

            <template v-slot:[`item.nama`]="{ item }">
              <span class="nama-barang" :title="item.nama">{{ item.nama }}</span>
            </template>

            <template v-slot:[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" min="0" variant="underlined" density="compact"
                hide-details class="text-end" />
            </template>

            <template v-slot:[`item.actions`]="{ item }">
              <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                @click="removeRow(item.id)" title="Hapus baris" />
            </template>

            <template #bottom>
              <div class="pa-2 text-right">
                <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus" variant="text" color="primary">
                  Tambah Baris
                </v-btn>
              </div>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <SoSearchModal v-if="isSoSearchVisible" :cabang="authStore.user?.cabang || ''" @close="isSoSearchVisible = false"
      @selected="onSoSelected" />
    <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="authStore.user?.cabang || ''"
      @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
    <MintaBarangSearchModal v-if="isProductSearchVisible" :gudang="authStore.user?.cabang || ''" :multi="true"
      source="minta-barang" @close="isProductSearchVisible = false" @products-selected="onProductsSelected" />

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi</v-card-title>
        <v-card-text>{{ confirmText }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="executePendingAction">Ya, Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  padding: 12px;
  height: 100%;
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 12px;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.right-column .desktop-form-section {
  flex-grow: 1;
  display: flex;
}

.right-column .v-data-table {
  flex-grow: 1;
}

.field-disabled {
  background-color: #f0f0f0;
  pointer-events: none;
}

.left-column :deep(.v-label) {
  font-size: 11px !important;
}

.left-column :deep(input),
.left-column :deep(.v-select__selection-text) {
  font-size: 12px !important;
}

.scanner-wrapper {
  max-width: 400px;
  /* <-- ATUR LEBAR MAKSIMUM DI SINI */
  flex: none;
  /* Mencegah flexbox meregangkan wrapper ini */
  margin-bottom: 16px;
}

.table-scroll-wrapper {
  overflow-x: auto;
  /* ✅ biar bisa scroll horizontal */
  width: 100%;
}

/* Hilangkan wrapping teks */
.desktop-table .v-data-table__td {
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

/* Kolom Nama Barang biar panjang penuh */
.desktop-table td:nth-child(2) {
  min-width: 600px;
  /* sesuaikan dengan kebutuhanmu */
}

/* Biar teks nama barang tetap rapi */
.nama-barang {
  display: inline-block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

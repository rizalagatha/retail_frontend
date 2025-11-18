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
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface Header {
  nomor: string;
  tanggal: string;
  keterangan: string;
}
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok: number; // Stok sistem (awal)
  jumlah: number; // Stok fisik (input)
  selisih: number;
  hpp: number;
  total: number;
  keterangan: string;
  barcode: string;
}
interface ProductLookup {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  hpp: number;
  barcode: string;
  // tambahkan field lain jika ada dari API lookup
}
interface ProductItem {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  selisih: number;
  hpp: number;
  total: number;
  keterangan: string;
  barcode: string;
  // tambahkan properti lain jika ada
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '25';
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Koreksi Stok' : 'Buat Koreksi Stok');

const header = reactive<Header>({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  keterangan: '',
});
const items = ref<Item[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const dialog = reactive({ productSearch: false });
const isMultiSelectProduct = ref(false);
const activeRowIndex = ref(0);
const isGudangSearchVisible = ref(false);
const scannedBarcode = ref('');

// --- State Dialog Konfirmasi ---
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const tableHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '100px' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', align: 'end', width: '50px' },
  { title: 'Stok Awal', key: 'stok', align: 'end', width: '50px' },
  { title: 'Jml Fisik', key: 'jumlah', align: 'end', width: '50px' },
  { title: 'Selisih', key: 'selisih', align: 'end', width: '50px' },
  { title: 'HPP', key: 'hpp', align: 'end', width: '50px' },
  { title: 'Nominal', key: 'total', align: 'end', width: '50px' },
  { title: 'Keterangan', key: 'keterangan', width: '120px' },
  { title: 'Barcode', key: 'barcode', width: '90px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '40px' },
] as const;

// --- Methods ---
const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.kode) {
    items.value.push({ id: Date.now(), kode: '', nama: '', ukuran: '', stok: 0, jumlah: 0, selisih: 0, hpp: 0, total: 0, keterangan: '', barcode: '' });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
  if (items.value.length === 0) addNewRow();
};

const calculateRow = (item: Item) => {
  item.selisih = (item.jumlah || 0) - (item.stok || 0);
  item.total = item.selisih * (item.hpp || 0);
};

const openProductSearch = (index: number, isMulti: boolean) => {
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  dialog.productSearch = true;
};

const onProductsSelected = async (selectedProducts: ProductLookup[]) => {
  dialog.productSearch = false;

  const productsToAdd = selectedProducts.filter(
    p => !items.value.some(item => item.kode === p.kode && item.ukuran === p.ukuran)
  );

  if (productsToAdd.length === 0) {
    return toast.info('Semua produk yang dipilih sudah ada di daftar.');
  }

  try {
    const detailPromises = productsToAdd.map(p =>
      api.get<ProductLookup>('/koreksi-stok-form/lookup/product-details', {
        params: {
          kode: p.kode,
          ukuran: p.ukuran,
          gudang: authStore.user?.cabang,
          tanggal: header.tanggal
        }
      })
    );

    const responses = await Promise.all(detailPromises);

    const newItems: Item[] = responses.map(res => {
      const newItem: Item = {
        ...res.data,
        id: Date.now() + Math.random(),
        jumlah: 0,
        selisih: 0,
        total: 0,
        keterangan: ''
      };
      calculateRow(newItem);
      return newItem;
    });

    items.value.splice(activeRowIndex.value, 1, ...newItems);
    addNewRow();
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal memuat detail produk.');
  }
};

const onGudangSelected = (gudang: { kode: string, nama: string }) => {
  // Di form ini, gudang tidak bisa diubah, jadi fungsi ini mungkin tidak diperlukan
  // tapi kita siapkan jika ada kebutuhan di masa depan.
  console.log('Gudang dipilih:', gudang);
  isGudangSearchVisible.value = false;
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const resetForm = () => {
  Object.assign(header, { nomor: '', tanggal: format(new Date(), 'yyyy-MM-dd'), keterangan: '' });
  items.value = [];
  addNewRow();
  toast.info('Form telah dibersihkan.');
};

const closeForm = () => router.push({ name: 'KoreksiStok' });
const handleCancel = () => showConfirmation('Konfirmasi Batal', 'Batalkan semua perubahan dan kosongkan form?', resetForm);
const handleClose = () => showConfirmation('Konfirmasi Tutup', 'Tutup form? Perubahan yang belum disimpan akan hilang.', closeForm);

const save = () => {
  // --- VALIDASI DARI DELPHI ---
  if (!isEditMode.value && new Date(header.tanggal) < new Date(format(new Date(), 'yyyy-MM-dd'))) {
    return toast.error('Tanggal tidak boleh mundur dari hari ini.');
  }
  if (!header.keterangan.trim()) {
    return toast.error('Keterangan harus diisi.');
  }
  const validItems = items.value.filter(i => i.kode);
  if (validItems.length === 0) {
    return toast.error('Detail barang harus diisi minimal 1 baris.');
  }
  // --- AKHIR VALIDASI ---

  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data Koreksi Stok ini?', executeSave);
};

const executeSave = async () => {
  isSaving.value = true;
  const payload = {
    header,
    items: items.value.filter(i => i.kode),
    isNew: !isEditMode.value
  };
  try {
    const response = await api.post('/koreksi-stok-form/save', payload);
    toast.success(response.data.message);
    const nomorDokumen = response.data.nomor;
    if (nomorDokumen) {
      const url = router.resolve({ name: 'KoreksiStokPrint', params: { nomor: nomorDokumen } }).href;
      window.open(url, '_blank');
    }
    router.push({ name: 'KoreksiStok' });
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  try {
    const response = await api.get<{ header: Header; items: ProductItem[] }>(`/koreksi-stok-form/${nomor}`);
    Object.assign(header, response.data.header);
    header.tanggal = format(parseISO(header.tanggal), 'yyyy-MM-dd');
    items.value = response.data.items.map(item => {
      const newItem = { ...item, id: Date.now() + Math.random() };
      calculateRow(newItem);
      return newItem;
    });
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || 'Gagal memuat data.');
    router.back();
  }
};

const handleBarcodeScan = async () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  // Cek duplikasi
  const existingItem = items.value.find(item => item.barcode === barcode && item.kode);
  if (existingItem) {
    toast.warning('Barang sudah ada di dalam daftar.');
    scannedBarcode.value = '';
    return;
  }

  try {
    const response = await api.get(`/koreksi-stok-form/lookup/by-barcode/${barcode}`, {
      params: {
        gudang: authStore.user?.cabang,
        tanggal: header.tanggal
      }
    });
    const product = response.data;

    const emptyRowIndex = items.value.findIndex(item => !item.kode);
    if (emptyRowIndex !== -1) {
      const newItem: Item = { ...product, id: Date.now(), jumlah: product.stok, selisih: 0, total: 0, keterangan: '' };
      calculateRow(newItem);
      items.value.splice(emptyRowIndex, 1, newItem);
      addNewRow();
    } else {
      toast.error("Tidak ada baris kosong untuk menambahkan item.");
    }
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || `Barcode ${barcode} tidak valid.`);
  } finally {
    scannedBarcode.value = '';
  }
};

onMounted(async () => {
  if (!authStore.can(MENU_ID, isEditMode.value ? 'edit' : 'insert')) {
    toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data ini.`);
    return router.back();
  }

  const nomor = route.params.nomor as string;
  if (isEditMode.value && nomor) {
    await loadDataForEdit(nomor);
  }
  addNewRow();
  isLoading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-file-check-outline">
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
            <v-col cols="12">
              <v-text-field label="No. Koreksi" v-model="header.nomor" readonly filled hide-details density="compact" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined" hide-details
                density="compact" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Gudang" :model-value="`${authStore.user?.cabang} - ${authStore.user?.cabangNama}`"
                readonly filled hide-details density="compact" append-inner-icon="mdi-magnify"
                @click:append-inner="isGudangSearchVisible = true" />
            </v-col>
            <v-col cols="12">
              <v-textarea label="Keterangan" v-model="header.keterangan" variant="outlined" rows="3" hide-details
                density="compact" />
            </v-col>
            <v-col cols="12">
              <div class="text-caption text-medium-emphasis mt-1">
                Note: Jumlah koreksi adalah jumlah stok awal fisik pada tanggal koreksi tersebut.
              </div>
            </v-col>
          </v-row>
        </div>
      </div>
      <div class="right-column">
        <div class="scanner-wrapper mb-4">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode di Sini..." variant="outlined" density="compact"
            prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan" />
        </div>
        <div class="desktop-form-section d-flex flex-column fill-height">
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
            class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
            <template v-slot:[`item.kode`]="{ item, index }">
              <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                placeholder="F1/F2..." @keydown.f1.prevent="openProductSearch(index, false)"
                @keydown.f2.prevent="openProductSearch(index, true)" />
            </template>
            <template v-slot:[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" density="compact"
                hide-details class="text-end" @update:model-value="calculateRow(item)" />
            </template>
            <template v-slot:[`item.keterangan`]="{ item }">
              <v-text-field v-model="item.keterangan" variant="underlined" density="compact" hide-details />
            </template>
            <template v-slot:[`item.actions`]="{ item }">
              <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                @click="removeRow(item.id)" />
            </template>
            <template #bottom>
              <div class="pa-2 text-right">
                <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus">Tambah Baris</v-btn>
              </div>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <MintaBarangSearchModal v-if="dialog.productSearch" :gudang="authStore.user?.cabang || ''"
      :multi="isMultiSelectProduct" source="koreksi-stok" @close="dialog.productSearch = false"
      @products-selected="onProductsSelected" />

    <GudangSearchModal v-if="isGudangSearchVisible" :user-cabang="authStore.user?.cabang || ''" :only-dc="true"
      @close="isGudangSearchVisible = false" @gudang-selected="onGudangSelected" />

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

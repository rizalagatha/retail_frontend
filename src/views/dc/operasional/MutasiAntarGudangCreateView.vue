<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MintaBarangSearchModal from '@/components/lookup/MintaBarangSearchModal.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data & State ---
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  barcode: string;
}
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '216';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Mutasi Antar Gudang' : 'Buat Mutasi Antar Gudang');
const canView = computed(() => authStore.can(MENU_ID, 'view'));
const canInsert = computed(() => authStore.can(MENU_ID, 'insert'));
const canEdit = computed(() => authStore.can(MENU_ID, 'edit'));
// Pengecekan izin gabungan untuk tombol 'Simpan'
const canSave = computed(() => isEditMode.value ? canEdit.value : canInsert.value);
const isLoading = ref(true);
const isDataLoading = ref(true);
const isSaving = ref(false);
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
  onCancel: () => { dialogConfirm.show = false; } // <-- 3. Tambahkan onCancel default
});
const dialogConfirmCetak = reactive({
  show: false,
  nomor: '',
  onConfirm: () => { },
  onCancel: () => { }
});

const header = reactive({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  dariGudang: 'KDC',
  keGudang: 'KBS',
  keterangan: '',
});
const items = ref<Item[]>([]);
const gudangOptions = ref<string[]>([]);
const scannedBarcode = ref('');
const isBarangSearchVisible = ref(false);
const isModalMultiSelect = ref(false);
const activeRowIndex = ref(0);

const headers = [
  { title: 'No.', key: 'no', sortable: false, width: '50px' },
  { title: 'Kode Barang', key: 'kode', width: '200px' },
  { title: 'Nama Barang', key: 'nama', minWidth: '300px' },
  { title: 'Ukuran', key: 'ukuran', width: '100px' },
  { title: 'Stok', key: 'stok', width: '100px' },
  { title: 'Jumlah', key: 'jumlah', width: '150px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

// --- Methods ---
const loadDataForEdit = async (nomor: string) => {
  try {
    const response = await api.get(`/mutasi-antar-gudang-form/${nomor}`);
    const data = response.data;
    header.nomor = data.header.mts_nomor;
    header.tanggal = format(parseISO(data.header.mts_tanggal), 'yyyy-MM-dd');
    header.dariGudang = data.header.dariGudang;
    header.keGudang = data.header.mts_kecab;
    header.keterangan = data.header.mts_ket;
    items.value = data.items.map(item => ({ ...item, id: Math.random() }));
    addNewRow();
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data.');
  }
};

const fetchGudangOptions = async () => {
  try {
    const response = await api.get('/mutasi-antar-gudang-form/gudang-options');
    gudangOptions.value = response.data;
  } catch (error) { toast.error('Gagal memuat opsi gudang.', error); }
};

const handleBarcodeScan = async () => {
  if (!scannedBarcode.value) return;
  try {
    const response = await api.get('/mutasi-antar-gudang-form/product-by-barcode', {
      params: { barcode: scannedBarcode.value, cabang: header.dariGudang }
    });
    const product = response.data;
    const isDuplicate = items.value.some(item => item.kode === product.kode && item.ukuran === product.ukuran);
    if (isDuplicate) {
      toast.warning('Barang ini sudah ada di daftar.');
    } else {
      // Hapus baris kosong jika ada, lalu tambahkan item baru
      items.value = items.value.filter(item => item.kode);
      items.value.push({
        id: Date.now(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        stok: product.stok,
        jumlah: 1,
        barcode: product.barcode,
      });
      addNewRow(); // Tambah baris kosong baru di akhir
    }
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Barcode tidak ditemukan.');
  } finally {
    scannedBarcode.value = '';
  }
};

const addNewRow = () => {
  if (!items.value.find(item => item.kode === '')) {
    items.value.push({ id: Date.now(), kode: '', nama: '', ukuran: '', stok: 0, jumlah: 0, barcode: '' });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
  if (items.value.length === 0) addNewRow();
};

const save = () => {
  if (!canSave.value) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    return;
  }
  // Validasi dari btnSimpanClick Delphi
  if (header.dariGudang === header.keGudang) return toast.error('Gudang tidak boleh sama.');
  if (!items.value.some(item => item.kode && item.jumlah > 0)) return toast.error('Detail barang harus diisi.');

  for (const item of items.value) {
    if (item.kode && (item.jumlah === 0 || !item.jumlah)) {
      return toast.error(`Jumlah untuk ${item.nama} harus diisi.`);
    }
    if (item.jumlah > item.stok) {
      return toast.error(`Jumlah untuk ${item.nama} melebihi stok (${item.stok}).`);
    }
  }
  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data mutasi ini?', executeSave);
};

const executeSave = async () => {
  if (!canSave.value) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    isSaving.value = false; // Pastikan loading dihentikan
    return;
  }
  isSaving.value = true;
  try {
    const payload = {
      header,
      items: items.value.filter(item => item.kode && item.jumlah > 0)
    };

    const response = isEditMode.value
      ? await api.put(`/mutasi-antar-gudang-form/${route.params.nomor}`, payload)
      : await api.post('/mutasi-antar-gudang-form', payload);

    toast.success(response.data.message);
    const savedNomor = response.data.nomor;

    // Panggil dialog cetak
    dialogConfirmCetak.nomor = savedNomor;
    dialogConfirmCetak.onConfirm = () => {
      const routeData = router.resolve({ name: 'MutasiAntarGudangPrint', params: { nomor: savedNomor } });
      window.open(routeData.href, '_blank');
      router.push({ name: 'MutasiAntarGudang' });
    };
    dialogConfirmCetak.onCancel = () => {
      router.push({ name: 'MutasiAntarGudang' });
    };
    dialogConfirmCetak.show = true;

  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void, onCancel?: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = () => {
    onConfirm();
    dialogConfirm.show = false;
  };
  dialogConfirm.onCancel = () => {
    if (onCancel) onCancel();
    dialogConfirm.show = false;
  };
  dialogConfirm.show = true;
};

// Dipanggil saat menekan F1 atau F2 di grid
const openBarangSearch = (index: number, isMulti: boolean) => {
  if (isEditMode.value) return;
  activeRowIndex.value = index;
  isModalMultiSelect.value = isMulti;
  isBarangSearchVisible.value = true;
};

// Dipanggil saat menekan Enter di kolom "Kode Barang" di grid
const handleGridBarcodeEnter = async (item: Item, index: number) => {
  const barcode = item.kode; // 'kode' field digunakan untuk input barcode
  if (!barcode || isEditMode.value) return;

  // 1. Cek duplikat di frontend (logika Delphi)
  const isDuplicate = items.value.some((existingItem, i) =>
    existingItem.barcode === barcode && i !== index
  );
  if (isDuplicate) {
    toast.warning(`Barcode ${barcode} sudah ada di daftar.`);
    item.kode = ''; // Kosongkan input
    return;
  }

  // 2. Panggil API (logika 'loadbrg')
  try {
    const response = await api.get('/mutasi-antar-gudang-form/product-by-barcode', {
      params: { barcode: barcode, cabang: header.dariGudang }
    });
    const product = response.data;

    // 3. Update baris saat ini
    item.kode = product.kode;
    item.nama = product.nama;
    item.ukuran = product.ukuran;
    item.stok = product.stok;
    item.jumlah = 1;
    item.barcode = product.barcode;

    addNewRow(); // Tambah baris kosong baru di bawahnya

    // Fokus ke input jumlah di baris ini
    nextTick(() => {
      document.getElementById(`jumlah-${item.id}`)?.focus();
    });

  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Barcode tidak terdaftar.');
    item.kode = ''; // Kosongkan input
  }
};

// Dipanggil setelah memilih dari MintaBarangSearchModal
const onProductsSelected = (products: Item[]) => {
  isBarangSearchVisible.value = false;
  if (!products || products.length === 0) return;

  if (isModalMultiSelect.value) {
    // Mode F2 (Multi-select)
    products.forEach(product => {
      const isDuplicate = items.value.some(item =>
        item.kode === product.kode && item.ukuran === product.ukuran
      );
      if (!isDuplicate) {
        const lastIndex = items.value.length - 1;
        items.value.splice(lastIndex, 0, {
          id: Date.now() + Math.random(),
          ...product,
          jumlah: 1
        });
      }
    });
  } else {
    // Mode F1 (Single-select)
    const product = products[0];
    const isDuplicate = items.value.some((item, index) =>
      item.kode === product.kode &&
      item.ukuran === product.ukuran &&
      index !== activeRowIndex.value
    );

    if (isDuplicate) {
      return toast.warning(`Barang ${product.nama} (${product.ukuran}) sudah ada di daftar.`);
    }

    const targetRow = items.value[activeRowIndex.value];
    if (targetRow) {
      Object.assign(targetRow, { ...product, jumlah: 1 });
    }
  }

  addNewRow(); // Pastikan baris kosong tetap ada di akhir
};


onMounted(async () => {
  // --- TAMBAHKAN PENGECEKAN AWAL ---
  if (!canView.value) {
    isLoading.value = false;
    isDataLoading.value = false;
    toast.error('Anda tidak memiliki izin untuk mengakses halaman ini.');
    // Opsional: Tampilkan pesan akses ditolak di template atau redirect
    // router.replace({ name: 'Forbidden' });
    return; // Hentikan eksekusi
  }
  // ------------------------------------

  // --- Perubahan: Set isLoading di sini, bukan di awal ---
  isLoading.value = true;
  isDataLoading.value = true;
  // ------------------------------------

  await fetchGudangOptions();
  const nomor = route.params.nomor as string;
  if (nomor) {
    await loadDataForEdit(nomor);
  } else {
    addNewRow();
  }
  isLoading.value = false;
  isDataLoading.value = false;
});

watch(() => header.dariGudang, (newValue, oldValue) => {
  // Hanya jalankan jika:
  // - Tidak sedang dalam proses loading awal
  // - Tidak dalam mode Edit (karena di mode edit, 'dariGudang' di-lock)
  // - Nilai benar-benar berubah
  if (isDataLoading.value || isEditMode.value || newValue === oldValue) {
    return;
  }

  // Cek apakah grid memiliki data (kode tidak kosong)
  const hasData = items.value.some(item => item.kode !== '');

  if (hasData) {
    showConfirmation(
      'Konfirmasi Ganti Gudang',
      'Detail barang sudah ada. Yakin ingin ganti gudang asal? (Data di grid akan dihapus)',
      () => {
        // Aksi jika "Ya": Hapus grid
        items.value = [];
        addNewRow();
      },
      () => {
        // Aksi jika "Tidak": Kembalikan ke nilai lama
        isDataLoading.value = true; // Set flag agar watcher tidak re-trigger
        header.dariGudang = oldValue;
        nextTick(() => {
          isDataLoading.value = false;
        });
      }
    );
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="canSave" color="primary" @click="save" :loading="isSaving" size="small"
        prepend-icon="mdi-content-save">
        Simpan
      </v-btn>
      <v-btn size="small"
        @click="() => showConfirmation('Konfirmasi Batal', 'Batalkan perubahan?', () => router.back())">
        Batal
      </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6"><v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact"
                hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="6"><v-select label="Dari Gudang" v-model="header.dariGudang" :items="gudangOptions"
                :readonly="isEditMode || !canSave" density="compact" hide-details /></v-col>
            <v-col cols="6"><v-select label="Ke Gudang" v-model="header.keGudang" :items="gudangOptions"
                :readonly="isEditMode" density="compact" hide-details /></v-col>
            <v-col cols="12"><v-textarea label="Keterangan" v-model="header.keterangan" rows="3" variant="outlined"
                density="compact" hide-details /></v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="scanner-wrapper mb-4">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode untuk Menambah Item..." variant="outlined"
            density="compact" prepend-inner-icon="mdi-barcode-scan" hide-details clearable
            @keydown.enter.prevent="handleBarcodeScan" />
        </div>
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1;">
          <v-data-table :headers="headers" :items="items" :loading="isLoading" class="desktop-table fill-height"
            density="compact" fixed-header :items-per-page="-1">
            <template #[`item.no`]="{ index }">{{ index + 1 }}</template>
            <template #[`item.kode`]="{ item, index }">
              <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                :readonly="isEditMode || !!item.nama || !canSave" placeholder="Scan/F1/F2..."
                @keydown.f1.prevent="openBarangSearch(index, false)" @keydown.f2.prevent="openBarangSearch(index, true)"
                @keydown.enter.prevent="handleGridBarcodeEnter(item, index)" />
            </template>
            <template #[`item.stok`]="{ item }">
              <td class="text-end">{{ item.stok || 0 }}</td>
            </template>
            <template #[`item.jumlah`]="{ item }">
              <v-text-field :id="`jumlah-${item.id}`" v-model.number="item.jumlah" type="number" variant="underlined"
                density="compact" hide-details class="text-end" :max="item.stok" min="0"
                :readonly="!item.kode || !canSave" />
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                @click="removeRow(item.id)" :disabled="!canSave" />
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>

    <MintaBarangSearchModal v-if="isBarangSearchVisible" source="ambil-barang" :gudang="header.dariGudang"
      :multi="isModalMultiSelect" @close="isBarangSearchVisible = false" @products-selected="onProductsSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.onCancel">
            {{ dialogConfirm.onConfirm.name === 'executeSave' ? 'Batal' : 'Tidak' }}
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm">
            {{ dialogConfirm.onConfirm.name === 'executeSave' ? 'Ya' : 'Ya, Lanjutkan' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <template>
      <v-dialog v-model="dialogConfirmCetak.show" max-width="400px" persistent>
        <v-card>
          <v-card-title class="text-h6 font-weight-bold">Berhasil Disimpan</v-card-title>
          <v-card-text>
            Berhasil Simpan dengan Nomor <strong>{{ dialogConfirmCetak.nomor }}</strong>.
            <br />
            Ingin Cetak transaksi?
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text @click="dialogConfirmCetak.onCancel">Tidak</v-btn>
            <v-btn color="primary" variant="tonal" @click="dialogConfirmCetak.onConfirm">Ya, Cetak</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>
  </PageLayout>
</template>

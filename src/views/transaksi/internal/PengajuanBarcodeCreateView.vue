<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MintaBarangSearchModal from '@/components/lookup/MintaBarangSearchModal.vue';
import StickerSearchModal from '@/components/lookup/StickerSearchModal.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface Header {
  nomor: string;
  tanggal: string;
  approved: string | null;
}
interface Item {
  id: number;
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  harga: number; // Harga/Pcs
  hargaDtf: number; // Harga + Total Stiker
  jenis: string;
  ket: string;
  diskon: number;
  hargabaru: number;
  kodebaru: string;
  imageUrl: string | null;
  fileObject?: File | null;
}
interface BackendItem {
  kode: string;
  barcode: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  jenis: string;
  ket: string;
  hpp: number;
  nama: string;
  stok: number;
  kodebaru: string;
  diskon: number;
  hargabaru: number;
  pcd_gambar_url: string | null; // <-- Kunci utamanya di sini
}
interface StickerItem {
  id: number;
  kode: string; // Kode item kaos parent
  kodes: string; // Kode stiker
  barcode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  harga: number;
}
interface ProductDetail {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  stok: number;
  harga: number;
  hpp: number;
}
interface StickerResponse {
  pcs_kode: string;
  pcs_kodes: string;
  barcode: string;
  nama: string;
  pcs_ukuran: string;
  stok: number;
  pcs_jumlah: number;
  harga: number;
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '33';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Pengajuan Barcode' : 'Buat Pengajuan Barcode');
const hasApprovalRights = computed(() => authStore.user?.canApprovePrice); // Asumsi hak akses
const canView = computed(() => authStore.can(MENU_ID, 'view'));
const canInsert = computed(() => authStore.can(MENU_ID, 'insert'));
const canEdit = computed(() => authStore.can(MENU_ID, 'edit'));
// Izin simpan bergantung pada mode (insert/edit)
const canSave = computed(() => isEditMode.value ? canEdit.value : canInsert.value);
const canApprove = computed(() => authStore.user?.canApprovePrice || false);

const header = reactive<Header>({ nomor: '', tanggal: format(new Date(), 'yyyy-MM-dd'), approved: null });
const items = ref<Item[]>([]);
const stickers = ref<StickerItem[]>([]);
const jenisRejectOptions = ref([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isApproved = ref(false);

const dialogs = reactive({ productSearch: false, stickerSearch: false, confirm: false });
const isMultiSelectProduct = ref(false);
const activeRowIndex = ref(0);
// const activeParentKode = ref('');
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });
const formatRupiah = (value: number) => {
  return new Intl.NumberFormat('id-ID').format(Math.round(value || 0));
};
const selectedKaosItem = ref<Item[]>([]);
const isUploading = reactive<Record<number, boolean>>({});
const fileInputRef = ref<HTMLInputElement | null>(null); // <-- TAMBAHKAN INI
const activeUploadItem = ref<Item | null>(null);

const previewDialog = reactive({
  show: false,
  url: '',
});

// --- Konfigurasi Tabel ---
const itemsHeaders = computed(() => [
  { title: 'Kode Kaos', key: 'kode', width: '100px' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', width: '60px' },
  { title: 'Gambar', key: 'image', width: '220px', sortable: false },
  { title: 'Stok', key: 'stok', width: '60px', 'v-if': !hasApprovalRights.value },
  { title: 'Jumlah', key: 'jumlah', width: '60px' },
  { title: 'Harga/Pcs', key: 'harga', width: '60px' },
  { title: 'Harga DTF', key: 'hargaDtf', width: '60px' },
  { title: 'Jenis', key: 'jenis', width: '100px' },
  { title: 'Ket', key: 'ket', width: '100px' },
  ...(hasApprovalRights.value ? [
    { title: 'Diskon %', key: 'diskon', width: '60px' },
    { title: 'Harga Baru', key: 'hargabaru', width: '90px' },
    { title: 'Barcode Baru', key: 'kodebaru', width: '90px' },
  ] : []),
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
].filter(h => h['v-if'] !== false));

const stickersHeaders = computed(() => [
  { title: 'Kode Kaos Induk', key: 'kode', width: '150px' },
  { title: 'Kode Stiker', key: 'kodes', width: '150px' },
  { title: 'Nama Stiker', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', width: '60px' },
  { title: 'Stok', key: 'stok', width: '60px', 'v-if': !hasApprovalRights.value },
  { title: 'Jumlah', key: 'jumlah', width: '60px' },
  { title: 'Harga', key: 'harga', width: '80px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
].filter(h => h['v-if'] !== false));

// 2. Helper untuk mendapatkan URL origin backend dari baseURL axios
// (misal: 'http://localhost:3000/api' -> 'http://localhost:3000')
let backendOrigin = '';
try {
  // Cek dulu apakah baseURL valid dan merupakan URL absolut
  if (api.defaults.baseURL && (api.defaults.baseURL.startsWith('http://') || api.defaults.baseURL.startsWith('https://'))) {
    // Jika ya, ambil origin-nya
    backendOrigin = new URL(api.defaults.baseURL).origin;
  } else {
    // Jika baseURL relative ('/api'), undefined, atau invalid (seperti '103.94.238.252' saja),
    // kita asumsikan backend (dan gambar) ada di origin yang sama dengan frontend.
    backendOrigin = window.location.origin;
  }
} catch (e) {
  // Fallback jika terjadi error aneh
  console.warn("Gagal mem-parse baseURL API, menggunakan location.origin sebagai fallback.", e);
  backendOrigin = window.location.origin;
}

// --- Methods ---
const addNewRow = () => {
  const last = items.value[items.value.length - 1];
  if (!last || last.kode) {
    items.value.push({
      id: Date.now() + Math.random(),
      kode: '',
      nama: '',
      ukuran: '',
      stok: 0,
      jumlah: 1,
      harga: 0,
      hargaDtf: 0,
      jenis: '',
      ket: '',
      barcode: '',
      diskon: 0,
      hargabaru: 0,
      kodebaru: '',
      imageUrl: null, // <-- TAMBAHKAN INI
      fileObject: null
    });
  }
};

const addNewStickerRow = () => {
  // Tombol ini hanya akan aktif jika ada kaos yang dipilih
  const parentKode = selectedKaosItem.value[0]?.kode;
  if (!parentKode) {
    toast.error('Pilih satu baris item kaos di tabel atas terlebih dahulu.');
    return;
  }

  const lastStickerForParent = stickers.value.filter(s => s.kode === parentKode).pop();
  if (!lastStickerForParent || lastStickerForParent.kodes) {
    stickers.value.push({
      id: Date.now() + Math.random(),
      kode: parentKode, // Set kode induk
      kodes: '', nama: '', ukuran: '', stok: 0, jumlah: 1, harga: 0, barcode: ''
    });
  }
};

const removeRow = (id: number) => { items.value = items.value.filter(i => i.id !== id); if (items.value.length === 0) addNewRow(); };
const removeStickerRow = (id: number) => { stickers.value = stickers.value.filter(s => s.id !== id); };

const openProductSearch = (index: number, isMulti: boolean) => {
  activeRowIndex.value = index;
  isMultiSelectProduct.value = isMulti;
  dialogs.productSearch = true;
};

const calculateHargaDtf = () => {
  items.value.forEach(item => {
    if (!item.kode) return;
    const totalStickerPrice = stickers.value
      .filter(sticker => sticker.kode === item.kode)
      .reduce((sum, sticker) => sum + (sticker.harga * sticker.jumlah), 0);
    item.hargaDtf = (item.harga * item.jumlah) + totalStickerPrice;
  });
};

const onProductsSelected = async (selectedProducts: ProductDetail[]) => {
  dialogs.productSearch = false;

  const productsToAdd = selectedProducts.filter(
    (p) => !items.value.some((item) => item.kode === p.kode && item.ukuran === p.ukuran)
  );

  if (productsToAdd.length === 0 && selectedProducts.length > 0) {
    return toast.info("Semua produk yang dipilih sudah ada di daftar.");
  }

  try {
    const detailPromises = productsToAdd.map((p) =>
      api.get<ProductDetail>("/pengajuan-barcode-form/lookup/product-details", {
        params: { kode: p.kode, ukuran: p.ukuran, gudang: authStore.user?.cabang },
      })
    );

    const responses = await Promise.all(detailPromises);

    const newItems: Item[] = responses.map((res) => ({
      id: Date.now() + Math.random(),
      kode: res.data.kode,
      barcode: res.data.barcode,
      nama: res.data.nama,
      ukuran: res.data.ukuran,
      stok: res.data.stok,
      harga: res.data.harga,
      hargaDtf: 0, // ✅ tambahkan ini
      jenis: "",
      ket: "",
      jumlah: 1,
      diskon: 0,
      hargabaru: 0,
      kodebaru: "",
      imageUrl: null, // <-- TAMBAHKAN INI
      fileObject: null
    }));

    items.value.splice(activeRowIndex.value, 1, ...newItems);
    addNewRow();
  } catch (error) {
    toast.error("Gagal memuat detail produk.");
    console.error(error);
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => { dialogConfirm.title = title; dialogConfirm.text = text; dialogConfirm.onConfirm = onConfirm; dialogConfirm.show = true; };
const closeForm = () => router.push({ name: 'PengajuanBarcode' });
const handleCancel = () => {
  showConfirmation('Konfirmasi Batal', 'Batalkan semua perubahan dan kosongkan form?', resetForm);
};
const handleClose = () => showConfirmation('Konfirmasi Tutup', 'Tutup form?', closeForm);

const save = () => {
  if (!canSave.value) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    return;
  }
  // Validasi dari Delphi
  if (!isEditMode.value && new Date(header.tanggal) < new Date(format(new Date(), 'yyyy-MM-dd'))) {
    return toast.error('Tanggal tidak boleh mundur dari hari ini.');
  }

  const validItems = items.value.filter(i => i.kode);
  if (validItems.length === 0) return toast.error('Detail item harus diisi.');

  for (const item of validItems) {
    if (!item.jumlah || item.jumlah <= 0) return toast.error(`Jumlah untuk item '${item.nama}' harus diisi.`);
    if (!item.harga || item.harga <= 0) return toast.error(`Harga untuk item '${item.nama}' harus diisi.`);
    if (!item.jenis) return toast.error(`Jenis untuk item '${item.nama}' harus diisi.`);
    if (item.jumlah > item.stok && !hasApprovalRights.value) return toast.error(`Jumlah untuk '${item.nama}' tidak boleh melebihi stok.`);
  }

  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data ini?', executeSave);
};

const executeSave = async () => {
  if (!canSave.value) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    isSaving.value = false; // Pastikan loading dihentikan
    return;
  }
  isSaving.value = true;
  let savedNomor = isEditMode.value ? header.nomor : '';
  try {
    const payload = {
      header,
      items: items.value.filter(i => i.kode),
      stickers: stickers.value.filter(s => s.kodes),
      isNew: !isEditMode.value,
      isApproved: isApproved.value,
    };
    const response = await api.post('/pengajuan-barcode-form/save', payload);
    toast.success(response.data.message);

    if (!isEditMode.value) {
      savedNomor = response.data.nomor;
    }

    // --- STEP 2: Upload Gambar yang Tertunda ---
    const itemsWithFiles = items.value.filter(item => item.fileObject);

    if (itemsWithFiles.length > 0) {
      toast.info(`Mengunggah ${itemsWithFiles.length} gambar...`);

      for (const item of itemsWithFiles) {
        if (!item.fileObject) continue; // Pengecekan typescript

        isUploading[item.id] = true;
        const formData = new FormData();
        formData.append('image', item.fileObject);
        formData.append('nomor', savedNomor); // Gunakan nomor yang sudah tersimpan/baru
        formData.append('kode', item.kode);
        formData.append('ukuran', item.ukuran);

        try {
          // Panggil API upload per item
          await api.post('/pengajuan-barcode-form/upload-item-image', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          // Bersihkan file object setelah berhasil
          item.fileObject = null;

        } catch (uploadError) {
          toast.error(`Gagal upload gambar untuk ${item.nama} (${item.ukuran}).`, uploadError);
        } finally {
          isUploading[item.id] = false;
        }
      }
    }

    // --- STEP 3: Selesai ---
    router.push({ name: 'PengajuanBarcode' }); // Kembali ke browse

  } catch (error) { // Error dari STEP 1 (Save Utama)
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || err.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
    // Bersihkan local URL object untuk menghindari memory leak
    items.value.forEach(item => {
      if (item.fileObject && item.imageUrl && item.imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.imageUrl);
      }
    });
  }
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/pengajuan-barcode-form/${nomor}`);
    const data = response.data;

    Object.assign(header, data.header);
    header.tanggal = format(parseISO(header.tanggal), 'yyyy-MM-dd');
    isApproved.value = !!data.header.approved;

    items.value = data.items.map((item: BackendItem) => ({
      ...item, // Sebarkan semua properti yang namanya sama (kode, nama, dll)

      // Properti khusus frontend
      id: Date.now() + Math.random(),
      hargaDtf: 0,
      fileObject: null,

      // Petakan properti backend ke properti frontend
      imageUrl: item.pcd_gambar_url || null,
    }));

    // --- PERBAIKAN DI SINI ---
    stickers.value = data.stickers.map((item: StickerResponse) => ({
      id: Date.now() + Math.random(),
      kode: item.pcs_kode,
      kodes: item.pcs_kodes,
      barcode: item.barcode,
      nama: item.nama,
      ukuran: item.pcs_ukuran,
      stok: item.stok,
      jumlah: item.pcs_jumlah,
      harga: item.harga,
    }));

    // --- Picu kalkulasi ulang setelah data terisi ---
    calculateHargaDtf();

    toast.success(`Data ${nomor} berhasil dimuat.`);
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    const message = err.response?.data?.message || 'Gagal memuat data.';
    toast.error(message);
    router.back();
  } finally {
    addNewRow();
    addNewStickerRow();
    isLoading.value = false;
  }
};

const triggerFileUpload = (item: Item) => {
  if (!item.kode || isUploading[item.id]) {
    return;
  }

  // TIDAK ADA LAGI PENGECEKAN 'isEditMode'
  activeUploadItem.value = item;
  fileInputRef.value?.click();
};

const getFullImageUrl = (url: string | null) => {
  if (!url) return '';
  // Jika sudah URL penuh (http) atau URL lokal (blob), langsung pakai
  if (url.startsWith('http') || url.startsWith('blob:')) {
    return url;
  }
  // Jika URL relatif (dimulai dengan '/'), gabungkan dengan origin backend
  return `${backendOrigin}${url}`;
};

const openImage = (url: string | null) => {
  if (url) {
    // window.open(url, '_blank'); // <-- HAPUS INI

    // UBAH JADI INI:
    previewDialog.url = getFullImageUrl(url); // Gunakan helper untuk URL penuh
    previewDialog.show = true; // Buka dialog
  }
};

const onFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  const item = activeUploadItem.value;

  if (!file || !item) {
    if (target) target.value = ''; // Reset input
    return;
  }

  // 1. Simpan file object ke state
  item.fileObject = file;

  // 2. Buat URL preview lokal
  if (item.imageUrl && item.imageUrl.startsWith('blob:')) {
    // Hapus URL blob lama jika ada untuk hindari memory leak
    URL.revokeObjectURL(item.imageUrl);
  }
  item.imageUrl = URL.createObjectURL(file); // Ini akan menampilkan preview

  // 3. Reset
  activeUploadItem.value = null;
  if (target) target.value = ''; // Selalu reset file input
};

const resetForm = () => {
  Object.assign(header, { nomor: '', tanggal: format(new Date(), 'yyyy-MM-dd'), approved: null });
  items.value = [];
  stickers.value = [];
  addNewRow();
  toast.info('Form telah dibersihkan.');
};

const openStickerSearch = (index: number) => {
  if (selectedKaosItem.value.length === 0) {
    return toast.error('Pilih satu baris item kaos di tabel atas untuk menambahkan stiker.');
  }
  activeRowIndex.value = index;
  dialogs.stickerSearch = true;
};

const onStickersSelected = (selectedSticker: StickerItem | null) => {
  dialogs.stickerSearch = false;
  if (!selectedSticker) return;

  // 1. Dapatkan item kaos induk yang sedang aktif dari tabel atas
  const parentItem = selectedKaosItem.value[0];
  if (!parentItem || !parentItem.kode) {
    return toast.error('Kesalahan: Tidak ada item kaos induk yang dipilih.');
  }

  // 2. Cek duplikasi stiker untuk item kaos yang sama
  const isDuplicate = stickers.value.some(
    (s: StickerItem) =>
      s.kodes === selectedSticker.kodes &&
      s.ukuran === selectedSticker.ukuran &&
      s.kode === parentItem.kode
  );
  if (isDuplicate) {
    return toast.error('Stiker ini sudah ditambahkan untuk item kaos tersebut.');
  }

  // 3. Ambil baris stiker kosong yang akan diisi
  const targetItem = stickers.value[activeRowIndex.value];

  // 4. Isi semua data dengan benar
  targetItem.kode = parentItem.kode;
  targetItem.kodes = selectedSticker.kodes;
  targetItem.nama = selectedSticker.nama;
  targetItem.barcode = selectedSticker.barcode;
  targetItem.ukuran = selectedSticker.ukuran;
  targetItem.stok = selectedSticker.stok;
  targetItem.harga = selectedSticker.harga;
  targetItem.jumlah = 1;
};

watch([items, stickers], calculateHargaDtf, { deep: true });

onMounted(async () => {
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading
    toast.error('Anda tidak memiliki izin untuk mengakses halaman ini.');
    // Opsional: Redirect atau tampilkan pesan akses ditolak di template
    // router.replace({ name: 'Forbidden' });
    return; // Hentikan eksekusi onMounted
  }
  isLoading.value = true;
  try {
    const response = await api.get('/pengajuan-barcode-form/lookup/jenis-reject');
    jenisRejectOptions.value = response.data;
  } catch (e) { toast.error('Gagal memuat opsi Jenis.', e); }

  const nomor = route.params.nomor as string;
  if (isEditMode.value && nomor) {
    // Panggil fungsi ini jika URL berisi nomor (mode edit)
    await loadDataForEdit(nomor);
  } else {
    // Mode "Baru"
    addNewRow();
    addNewStickerRow();
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-barcode-scan">
    <template #header-actions>
      <v-btn v-if="canSave" size="small" prepend-icon="mdi-content-save" color="primary" @click="save"
        :loading="isSaving">
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh" @click="handleCancel">Batal</v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="handleClose">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12"><v-text-field label="No. Pengajuan" v-model="header.nomor" readonly filled hide-details
                density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                hide-details density="compact" :readonly="!canSave || isApproved" /></v-col>
            <v-checkbox v-if="hasApprovalRights" v-model="isApproved" :label="`Approved oleh: ${authStore.user?.kode}`"
              hide-details density="compact" :readonly="!canApprove" />
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="min-height: 300px;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Detail Item Pengajuan</div>
          <div class="table-wrapper-scroll">
            <v-data-table v-model="selectedKaosItem" :headers="itemsHeaders" :items="items" class="desktop-table"
              fixed-header :items-per-page="-1" show-select single-select return-object>
              <template v-slot:[`item.kode`]="{ item, index }">
                <v-text-field v-model="item.kode" variant="underlined" placeholder="F1/F2..."
                  @keydown.f1.prevent="openProductSearch(index, false)"
                  @keydown.f2.prevent="openProductSearch(index, true)"
                  :readonly="hasApprovalRights || isApproved || !canSave" />
              </template>
              <template v-slot:[`item.jumlah`]="{ item }">
                <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" class="text-end"
                  :readonly="hasApprovalRights || isApproved || !canSave" />
              </template>
              <template v-slot:[`item.image`]="{ item }">
                <v-img v-if="item.imageUrl" :src="getFullImageUrl(item.imageUrl)" height="50" width="50"
                  aspect-ratio="1" class="mt-1" @click="openImage(item.imageUrl)"
                  style="cursor: pointer; border: 1px solid #ddd;" title="Klik untuk melihat gambar" />

                <v-btn v-else size="small" variant="outlined" prepend-icon="mdi-camera" @click="triggerFileUpload(item)"
                  :loading="isUploading[item.id]" :disabled="!item.kode || isUploading[item.id]"
                  title="Upload gambar (Simpan draft dulu)">
                  Upload
                </v-btn>
              </template>
              <template v-slot:[`item.harga`]="{ item }">
                <v-text-field v-model.number="item.harga" type="number" variant="underlined" class="text-end"
                  :readonly="hasApprovalRights || isApproved || !canSave" />
              </template>
              <template v-slot:[`item.hargaDtf`]="{ item }">
                <v-text-field :model-value="formatRupiah(item.hargaDtf)" variant="underlined" class="text-end" readonly
                  filled />
              </template>
              <template v-slot:[`item.jenis`]="{ item }">
                <v-select v-model="item.jenis" :items="jenisRejectOptions" variant="underlined" density="compact"
                  hide-details :readonly="hasApprovalRights || isApproved || !canSave" />
              </template>
              <template v-slot:[`item.ket`]="{ item }">
                <v-text-field v-model="item.ket" variant="underlined"
                  :readonly="hasApprovalRights || isApproved || !canSave" />
              </template>
              <template v-slot:[`item.diskon`]="{ item }">
                <v-text-field v-model.number="item.diskon" type="number" variant="underlined" class="text-end"
                  :readonly="!canApprove || isApproved" />
              </template>
              <template v-slot:[`item.hargabaru`]="{ item }">
                <v-text-field v-model.number="item.hargabaru" type="number" variant="underlined" class="text-end"
                  :readonly="!canApprove || isApproved" />
              </template>
              <template v-slot:[`item.actions`]="{ item }">
                <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                  @click="removeRow(item.id)" />
              </template>
              <template #bottom>
                <div class="pa-2 text-right">
                  <v-btn size="small" @click="addNewStickerRow" prepend-icon="mdi-plus"
                    :disabled="selectedKaosItem.length === 0">
                    Tambah Stiker
                  </v-btn>
                </div>
              </template>
            </v-data-table>
          </div>
        </div>

        <div class="desktop-form-section d-flex flex-column" style="min-height: 200px;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Detail Stiker Tambahan</div>
          <div class="table-wrapper-scroll">
            <v-data-table :headers="stickersHeaders" :items="stickers" class="desktop-table flex-grow-1" fixed-header
              :items-per-page="-1">
              <template v-slot:[`item.kodes`]="{ item, index }">
                <v-text-field v-model="item.kodes" variant="underlined" density="compact" hide-details
                  placeholder="F1..." @keydown.f1.prevent="openStickerSearch(index)" :readonly="hasApprovalRights" />
              </template>
              <template v-slot:[`item.jumlah`]="{ item }">
                <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" density="compact"
                  hide-details class="text-end" :readonly="hasApprovalRights" />
              </template>
              <template v-slot:[`item.harga`]="{ item }">
                <div class="text-end">{{ formatRupiah(item.harga) }}</div>
              </template>
              <template v-slot:[`item.actions`]="{ item }">
                <v-btn v-if="item.kodes" icon="mdi-delete" size="x-small" variant="text" color="error"
                  @click="removeStickerRow(item.id)" />
              </template>
              <template #bottom>
                <div class="pa-2 text-right"><v-btn size="small" @click="addNewStickerRow()" prepend-icon="mdi-plus"
                    :disabled="selectedKaosItem.length === 0 || isApproved || !canSave">Tambah Stiker</v-btn></div>
              </template>
            </v-data-table>
          </div>
        </div>

      </div>
    </div> <input type="file" ref="fileInputRef" @change="onFileSelect" style="display: none;" accept="image/*" />

    <MintaBarangSearchModal v-if="dialogs.productSearch" source="pengajuan-barcode"
      :gudang="authStore.user?.cabang || ''" :multi="isMultiSelectProduct" @close="dialogs.productSearch = false"
      @products-selected="onProductsSelected" />
    <StickerSearchModal v-if="dialogs.stickerSearch" :gudang="authStore.user?.cabang || ''"
      @close="dialogs.stickerSearch = false" @selected="onStickersSelected" />

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

    <v-dialog v-model="previewDialog.show" max-width="600px">
      <v-card>
        <v-img :src="previewDialog.url" max-height="80vh" contain />
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" text @click="previewDialog.show = false">Tutup</v-btn>
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
  grid-template-columns: 350px 1fr;
  /* Lebar kolom kiri 350px */
  gap: 12px;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* Jarak antara 2 tabel di kolom kanan */
  min-height: 0;
}

.desktop-form-section {
  display: flex;
  flex-direction: column;
}

.right-column .desktop-form-section {
  flex: 1;
  /* Agar kedua bagian tabel mengisi ruang yang tersedia */
}

.table-wrapper-scroll {
  /* Mengaktifkan scroll horizontal dan vertikal */
  overflow: auto;

  /* Penting: 'flex-grow: 1' dan 'flex-basis: 0'
    membuat wrapper ini mengisi sisa ruang
    dan mengizinkannya menyusut/tumbuh.
  */
  flex-grow: 1;
  flex-basis: 0;
  min-height: 0;
  /* Mencegah overflow aneh pada flex column */
}

/* Memaksa semua sel tabel menjadi 1 baris */
.desktop-table.nowrap-table :deep(td),
.desktop-table.nowrap-table :deep(th) {
  white-space: nowrap !important;
}

.text-end :deep(input) {
  text-align: right;
}
</style>

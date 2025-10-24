<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import SupplierSearchModal from '@/components/SupplierSearchModal.vue';
import ReferensiSearchModal from '@/components/ReferensiSearchModal.vue';
import MintaBarangSearchModal from '@/components/MintaBarangSearchModal.vue';

// --- Tipe Data & State ---
interface Item {
  id: number;
  kode: string;
  nama: string;
  bahan: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  diskon: number;
  total: number;
  ket: string;
  gambar: string;
  fileObject?: File;
}
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '220';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah PO Kaosan' : 'Buat PO Kaosan');
const isLoading = ref(true);
const isSaving = ref(false);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { }, onCancel: () => { dialogConfirm.show = false } });
const isSupplierSearchVisible = ref(false);
const isReferensiSearchVisible = ref(false);
const isBarangSearchVisible = ref(false);
const activeRowIndex = ref(0);
const fileInput = ref<HTMLInputElement | null>(null); // <-- Tambahkan ini
const activeItemForUpload = ref<Item | null>(null); // <-- Tambahkan ini
const dialogConfirmCetak = reactive({
  show: false,
  nomor: '',
  onConfirm: () => { },
  onCancel: () => { }
});

const header = reactive({
  po_nomor: '<-- Kosong=Baru',
  po_tanggal: format(new Date(), 'yyyy-MM-dd'),
  po_referensi: '',
  po_ket: '',
  po_note: '',
  po_sup_kode: '',
  sup_nama: '',
  sup_alamat: '',
  sup_kota: '',
  po_status_ppn: false,
  po_ppn: 0,
  po_nominal: 0,
  lblbpb: false, // Untuk status "SUDAH INPUT BPB"
});
const items = ref<Item[]>([]);

const headers = [
  { title: 'No.', key: 'no', sortable: false, width: '40px' },
  { title: 'Kode', key: 'kode', width: '150px' },
  { title: 'Nama', key: 'nama', width: '250px' },
  { title: 'Bahan', key: 'bahan', width: '100px' },
  { title: 'Ukuran', key: 'ukuran', width: '100px' },
  { title: 'Jumlah', key: 'jumlah', align: 'end', width: '100px' },
  { title: 'Harga Beli', key: 'harga', align: 'end', width: '130px' },
  { title: 'Diskon(%)', key: 'diskon', align: 'end', width: '100px' },
  { title: 'Total', key: 'total', align: 'end', width: '150px' },
  { title: 'Keterangan', key: 'ket', width: '200px' },
  { title: 'Gambar', key: 'gambar', sortable: false, width: '200px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

// --- Computed Totals (dari hitung) ---
const total = computed(() => items.value.reduce((sum, item) => sum + (item.total || 0), 0));
const ppnNominal = computed(() => header.po_status_ppn ? (total.value * (header.po_ppn / 100)) : 0);
const grandTotal = computed(() => total.value + ppnNominal.value);

// --- Methods ---
const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/po-kaosan-form/${nomor}`);
    const { header: dataHeader, items: dataItems } = response.data;
    Object.assign(header, dataHeader);
    items.value = dataItems.map(item => ({ ...item, id: Math.random() }));
    addNewRow();
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal memuat data PO.');
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const onSupplierSelected = async (sup: { kode: string }) => {
  // Implementasi dari edtsupKodeExit
  try {
    const response = await api.get(`/po-kaosan-form/supplier-details/${sup.kode}`);
    const data = response.data;
    header.po_sup_kode = sup.kode;
    header.sup_nama = data.sup_nama;
    header.sup_alamat = data.sup_alamat;
    header.sup_kota = data.sup_kota;
    isSupplierSearchVisible.value = false;
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal mengambil data supplier.');
  }
};

const onReferensiSelected = async (ref: any) => {
  // Implementasi dari edtreferensiExit
  isReferensiSearchVisible.value = false;
  header.po_referensi = ref.nomor;
  isLoading.value = true;
  try {
    const response = await api.get(`/po-kaosan-form/from-pengajuan/${ref.nomor}`);
    const { header: refHeader, items: refItems } = response.data;
    header.po_sup_kode = refHeader.pp_sup_kode;
    header.po_ket = refHeader.pp_ket;
    header.sup_nama = refHeader.Sup_nama;
    header.sup_alamat = refHeader.Sup_alamat;
    header.sup_kota = refHeader.Sup_kota;
    items.value = refItems.map((item: any) => ({ ...item, id: Math.random() }));
    addNewRow();
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal memuat data referensi.');
    header.po_referensi = ''; // Kosongkan jika gagal
  } finally {
    isLoading.value = false;
  }
};

const addNewRow = () => {
  // Implementasi dari initgrid
  if (!items.value.find(item => item.nama === '')) {
    items.value.push({
      id: Date.now(), kode: '', nama: '', bahan: '', ukuran: '',
      jumlah: 0, harga: 0, diskon: 0, total: 0, ket: '', gambar: ''
    });
  }
};

const removeRow = (id: number) => {
  // Implementasi dari cxGrdMainKeyUp (VK_DELETE)
  items.value = items.value.filter(item => item.id !== id);
  if (items.value.length === 0) addNewRow();
};

const save = () => {
  // Validasi dari btnSimpanClick
  if (!header.po_referensi) return toast.error('No. Referensi harus diisi.');
  if (!header.po_sup_kode) return toast.error('Supplier harus diisi.');
  const validItems = items.value.filter(i => i.nama);
  if (validItems.length === 0) return toast.error('Detail harus diisi.');
  if (validItems.some(i => (i.jumlah || 0) === 0)) return toast.error('Jumlah tidak boleh kosong.');
  if (validItems.some(i => (i.harga || 0) === 0)) return toast.error('Harga beli harus diisi.');

  showConfirmation('Konfirmasi Simpan', 'Yakin ingin simpan?', executeSave);
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const formData = new FormData();
    const payload = {
      header: { ...header, po_nominal: grandTotal.value },
      items: items.value.filter(i => i.nama),
      isEdit: isEditMode.value
    };
    formData.append('data', JSON.stringify(payload));

    payload.items.forEach((item, index) => {
      if (item.fileObject) {
        formData.append(`file_${index}`, item.fileObject);
      }
    });

    const response = isEditMode.value
      ? await api.put(`/po-kaosan-form/${route.params.nomor}`, payload)
      : await api.post('/po-kaosan-form', payload);

    toast.success(response.data.message);
    const savedNomor = response.data.nomor;

    // Panggil dialog cetak
    dialogConfirmCetak.nomor = savedNomor;
    dialogConfirmCetak.onConfirm = () => {
      const routeData = router.resolve({ name: 'PoKaosanPrint', params: { nomor: savedNomor } });
      window.open(routeData.href, '_blank');
      router.push({ name: 'PoKaosan' });
    };
    dialogConfirmCetak.onCancel = () => {
      router.push({ name: 'PoKaosan' });
    };
    dialogConfirmCetak.show = true;
  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void, onCancel?: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = () => { onConfirm(); dialogConfirm.show = false; };
  dialogConfirm.onCancel = () => { if (onCancel) onCancel(); dialogConfirm.show = false; };
  dialogConfirm.show = true;
};

const handleBatal = () => {
  showConfirmation('Konfirmasi Batal', 'Batalkan semua perubahan?', () => {
    if (isEditMode.value) loadDataForEdit(route.params.nomor as string);
    else router.go(0);
  });
};
const handleTutup = () => {
  showConfirmation('Konfirmasi Tutup', 'Tutup form? Perubahan yang belum disimpan akan hilang.', () => {
    router.back();
  });
};

const validateReferensi = () => {
  if (!header.po_referensi) {
    toast.error('No. Referensi harus diisi dulu.');
    // Fokus kembali ke field referensi
    document.getElementById('referensi-field')?.focus();
    return false;
  }
  return true;
};

const openBarangSearch = (index: number) => {
  if (!validateReferensi()) return;
  activeRowIndex.value = index;
  isBarangSearchVisible.value = true;
};

const onBarangSelected = (products: any[]) => {
  isBarangSearchVisible.value = false;
  if (!products || products.length === 0) return;

  const product = products[0]; // F1 hanya single select

  // Cek duplikat
  if (items.value.some((item, i) => item.kode === product.kode && item.ukuran === product.ukuran && i !== activeRowIndex.value)) {
    return toast.warning('Barang ini sudah ada di daftar.');
  }

  // Update baris
  const targetRow = items.value[activeRowIndex.value];
  if (targetRow) {
    targetRow.kode = product.kode;
    targetRow.nama = product.nama;
    targetRow.bahan = product.bahan || '';
    targetRow.ukuran = product.ukuran;
    targetRow.harga = product.harga || 0;
    targetRow.jumlah = 1;
  }
  addNewRow();
};

const handleGridBarcodeEnter = async (item: Item, index: number) => {
  if (!validateReferensi()) return;
  const barcode = item.kode; // 'kode' field dipakai untuk input barcode
  if (!barcode) return;

  // 1. Cek duplikat di frontend
  if (items.value.some((existingItem, i) => existingItem.barcode === barcode && i !== index)) {
    return toast.warning(`Barcode ${barcode} sudah ada di daftar.`);
  }

  // 2. Panggil API (logika 'loadbrg' by barcode)
  try {
    const response = await api.get('/po-kaosan-form/product-by-barcode', {
      params: { barcode }
    });
    const product = response.data;

    // 3. Update baris saat ini
    item.kode = product.kode;
    item.nama = product.nama;
    item.bahan = product.bahan;
    item.ukuran = product.ukuran;
    item.harga = product.harga;
    item.jumlah = 1;
    item.barcode = product.barcode;

    addNewRow();

    nextTick(() => {
      document.getElementById(`jumlah-${item.id}`)?.focus();
    });

  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Barcode tidak terdaftar.');
    item.kode = ''; // Kosongkan input
  }
};

const triggerFileUpload = (item: Item) => {
  activeItemForUpload.value = item;
  fileInput.value?.click();
};

const onFileSelect = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file && activeItemForUpload.value) {
    if (file.size > 1000000) { // 1MB
      toast.error('Ukuran gambar tidak boleh > 1 Mb.');
      return;
    }
    activeItemForUpload.value.fileObject = file;
    activeItemForUpload.value.gambar = 'NEW'; // Tandai sebagai file baru
  }
  if (fileInput.value) fileInput.value.value = '';
};

// Logika hitung total (dari 'hitung' dan 'cl...PropertiesEditValueChanged')
watch(items, (newItems) => {
  newItems.forEach(item => {
    item.total = (item.jumlah || 0) * (item.harga || 0) * ((100 - (item.diskon || 0)) / 100);
  });
}, { deep: true });

onMounted(async () => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    await loadDataForEdit(nomor);
  } else {
    addNewRow();
  }
  isLoading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn color="primary" size="small" @click="save" :loading="isSaving"
        prepend-icon="mdi-content-save">Simpan</v-btn>
      <v-btn @click="handleBatal" size="small" prepend-icon="mdi-refresh">Batal</v-btn>
      <v-btn @click="handleTutup" size="small" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="hide-details">
            <v-col cols="6">
              <v-text-field label="Nomor" v-model="header.po_nomor" readonly filled density="compact" />
              <v-chip v-if="header.lblbpb" color="red" size="small" label>SUDAH INPUT BPB</v-chip>
            </v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.po_tanggal" type="date" variant="outlined"
                density="compact" /></v-col>
            <v-col cols="12">
              <v-text-field label="Nomor Referensi (F1)" v-model="header.po_referensi" density="compact"
                append-inner-icon="mdi-magnify" @click:append-inner="isReferensiSearchVisible = true"
                @keydown.f1.prevent="isReferensiSearchVisible = true" />
            </v-col>
            <v-col cols="12"><v-textarea label="Keterangan" v-model="header.po_ket" rows="2" variant="outlined"
                density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Supplier (F1)" v-model="header.po_sup_kode" density="compact"
                append-inner-icon="mdi-magnify" @click:append-inner="isSupplierSearchVisible = true"
                @keydown.f1.prevent="isSupplierSearchVisible = true" /></v-col>
            <v-col cols="12"><v-text-field label="Nama Supplier" v-model="header.sup_nama" readonly filled
                density="compact" /></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section">
          <v-row dense class="hide-details">
            <v-col cols="6">
              <v-textarea label="Note" v-model="header.po_note" rows="4" variant="outlined" density="compact" />
            </v-col>
            <v-col cols="6">
              <v-row dense>
                <v-col cols="12"><v-text-field label="Total" :model-value="total.toLocaleString('id-ID')" readonly
                    filled density="compact" class="text-right" /></v-col>
                <v-col cols="4"><v-checkbox v-model="header.po_status_ppn" label="PPN" density="compact"
                    hide-details /></v-col>
                <v-col cols="8"><v-text-field v-model.number="header.po_ppn" :readonly="!header.po_status_ppn"
                    type="number" suffix="%" density="compact" /></v-col>
                <v-col cols="12"><v-text-field label="Grand Total" :model-value="grandTotal.toLocaleString('id-ID')"
                    readonly filled density="compact" class="text-right font-weight-bold" /></v-col>
              </v-row>
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1;">
          <v-data-table :headers="headers" :items="items" :loading="isLoading" class="desktop-table fill-height"
            density="compact" fixed-header :items-per-page="-1">
            <template #item.no="{ index }">{{ index + 1 }}</template>
            <template #item.kode="{ item, index }">
              <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                :readonly="!!item.nama" placeholder="Scan/F1..." @keydown.f1.prevent="openBarangSearch(index)"
                @keydown.enter.prevent="handleGridBarcodeEnter(item, index)" />
            </template>
            <template #item.nama="{ item }"><v-text-field v-model="item.nama" variant="underlined" density="compact"
                hide-details /></template>
            <template #item.bahan="{ item }"><v-text-field v-model="item.bahan" variant="underlined" density="compact"
                hide-details /></template>
            <template #item.ukuran="{ item }"><v-text-field v-model="item.ukuran" variant="underlined" density="compact"
                hide-details /></template>
            <template #item.jumlah="{ item }">
              <v-text-field :id="`jumlah-${item.id}`" v-model.number="item.jumlah" type="number" variant="underlined"
                density="compact" hide-details class="text-end" :readonly="!item.kode" />
            </template>
            <template #item.harga="{ item }"><v-text-field v-model.number="item.harga" type="number"
                variant="underlined" density="compact" hide-details class="text-end" /></template>
            <template #item.diskon="{ item }"><v-text-field v-model.number="item.diskon" type="number"
                variant="underlined" density="compact" hide-details class="text-end" /></template>
            <template #item.total="{ item }">
              <td class="text-end">{{ (item.total || 0).toLocaleString('id-ID') }}</td>
            </template>
            <template #item.ket="{ item }"><v-text-field v-model="item.ket" variant="underlined" density="compact"
                hide-details /></template>
            <template #item.gambar="{ item }">
              <div class-="d-flex align-center pa-1">
                <v-btn size="x-small" icon="mdi-upload" @click="triggerFileUpload(item)" class="me-2" />
                <div class="text-truncate" style="font-size: 10px;">
                  <v-icon v-if="item.fileObject" color="primary" size="small">mdi-file-image</v-icon>
                  <v-icon v-else-if="item.gambar" color="success" size="small">mdi-check-circle</v-icon>
                  {{ item.fileObject?.name || (item.gambar ? 'File lama tersimpan' : 'Belum ada file') }}
                </div>
                <v-btn v-if="item.fileObject || item.gambar" icon="mdi-close-circle" size="x-small" variant="text"
                  color="error" @click="item.gambar = ''; item.fileObject = undefined" />
              </div>
            </template>
            <template #item.actions="{ item }">
              <v-btn v-if="item.nama" icon="mdi-delete" size="x-small" variant="text" color="error"
                @click="removeRow(item.id)" />
            </template>
            <template #bottom>
              <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus" class="ma-2">Tambah Baris</v-btn>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <SupplierSearchModal v-if="isSupplierSearchVisible" @close="isSupplierSearchVisible = false"
      @supplier-selected="onSupplierSelected" />
    <ReferensiSearchModal v-if="isReferensiSearchVisible" source="pengajuan-produksi"
      @close="isReferensiSearchVisible = false" @select="onReferensiSelected" />
    <MintaBarangSearchModal v-if="isBarangSearchVisible" source="po-barang" :gudang="authStore.user?.cabang || 'KDC'"
      :multi="false" @close="isBarangSearchVisible = false" @products-selected="onBarangSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text v-html="dialogConfirm.text"></v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.onCancel">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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

    <input type="file" ref="fileInput" @change="onFileSelect" accept="image/jpeg, image/png" style="display: none;" />
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  display: grid;
  grid-template-columns: 40% 1fr;
  gap: 16px;
  padding: 16px;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
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
}

.fill-height {
  flex-grow: 1;
}

.desktop-table {
  flex-grow: 1;
}

.hide-details :deep(.v-input__details) {
  display: none;
}
</style>

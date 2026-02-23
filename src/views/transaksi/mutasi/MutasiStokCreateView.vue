<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import SoSearchModalForMutasi from '@/components/lookup/SoSearchModalForMutasi.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  qtyso: number;
  produksi: number;
  pesan: number;
  ready: number;
  showroom: number;
  kurang: number;
  jumlah: number;
  barcode: string;
  masuk: number;
  keluar: number;
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = '45';

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Mutasi Stok' : 'Buat Mutasi Stok');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');
const summaryTotals = computed(() => {
  const totalJumlah = items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  const totalShowroom = items.value.reduce((sum, item) => sum + (item.showroom || 0), 0);
  const totalPesan = items.value.reduce((sum, item) => sum + (item.pesan || 0), 0);

  return {
    totalJumlah,
    totalShowroom,
    totalPesan
  };
});

const initialHeaderState = {
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  nomorSo: '',
  jenisMutasi: 'SP', // SP: Showroom ke Pesanan, PS: Pesanan ke Showroom
  keterangan: '',
};
const header = reactive({ ...initialHeaderState });
const items = ref<Item[]>([]);

const isLoading = ref(true);
const isSaving = ref(false);
const isDataSaved = ref(false);

const dialog = reactive({
  soSearch: false,
  confirm: false,
});
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const tableHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '150px' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', width: '80px' },
  { title: 'Qty Pesan', key: 'qtyso', align: 'end', width: '100px' },
  { title: 'Produksi', key: 'produksi', align: 'end', width: '100px' },
  { title: 'Stok Pesan', key: 'pesan', align: 'end', width: '100px' },
  { title: 'Ready', key: 'ready', align: 'end', width: '100px' },
  { title: 'Stok Showroom', key: 'showroom', align: 'end', width: '120px' },
  { title: 'Kurang', key: 'kurang', align: 'end', width: '100px' },
  { title: 'Qty Mutasi', key: 'jumlah', align: 'end', width: '150px' },
  { title: 'Barcode', key: 'barcode', width: '150px' },
] as const;

// --- Methods ---
const loadDataFromSo = async (nomorSo: string) => {
  isLoading.value = true;
  try {
    const response = await api.get<Item[]>(`/mutasi-stok-form/load-from-so/${nomorSo}`);
    items.value = response.data.map((item) => ({
      ...item,
      id: Date.now() + Math.random(),
      jumlah: 0,
      masuk: item.masuk || 0,
      keluar: item.keluar || 0,
    }));
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat detail SO.');
    header.nomorSo = ''; // Reset jika gagal
  } finally {
    isLoading.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/mutasi-stok-form/${nomor}`);
    const { header: msoHeader, items: msoItems } = response.data;
    header.nomor = msoHeader.nomor;
    header.tanggal = format(parseISO(msoHeader.tanggal), 'yyyy-MM-dd');
    header.nomorSo = msoHeader.nomorSo;
    header.jenisMutasi = msoHeader.jenisMutasi;
    header.keterangan = msoHeader.keterangan;
    items.value = msoItems.map((item: Item) => ({
      ...item,
      id: Date.now() + Math.random(),
    }));
    isDataSaved.value = true;
    await nextTick();
    markAsSaved();
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data.');
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const resetForm = () => {
  Object.assign(header, initialHeaderState);
  items.value = [];
  isDataSaved.value = false;
  markAsSaved();
  toast.info('Form telah dibersihkan.');
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const executeSave = async () => {
  isSaving.value = true;
  const validItems = items.value.filter(item => item.kode && (item.jumlah || 0) > 0);
  const payload = { header, items: validItems, isNew: !isEditMode.value };
  try {
    const response = await api.post('/mutasi-stok-form/save', payload);
    toast.success(response.data.message);

    markAsSaved();

    // --- Arahkan ke Halaman Cetak ---
    const nomorMSO = response.data.nomor;
    const url = router.resolve({ name: 'Cetak Mutasi Stok', params: { nomor: nomorMSO } }).href;
    window.open(url, '_blank');

    router.push({ name: 'MutasiStok' }); // Kembali ke halaman browse
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const handleSave = () => {
  if (!header.nomorSo) return toast.error('No. Pesanan harus diisi.');
  const validItems = items.value.filter(i => i.kode);
  if (validItems.length === 0) return toast.error('Detail barang harus diisi.');

  const totalQty = validItems.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  if (totalQty <= 0) return toast.error('Qty Mutasi kosong semua.');

  for (const item of validItems) {
    const qtyMutasi = item.jumlah || 0;
    // if (header.jenisMutasi === 'SP' && qtyMutasi > item.showroom) {
    //   return toast.error(`Qty Mutasi untuk ${item.nama} (${item.ukuran}) melebihi Stok Showroom.`);
    // }
    if (header.jenisMutasi === 'PS' && qtyMutasi > item.pesan) {
      return toast.error(`Qty Mutasi untuk ${item.nama} (${item.ukuran}) melebihi Stok Pesanan.`);
    }
  }

  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data Mutasi Stok ini?', executeSave);
};

const handleCancel = () => {
  showConfirmation('Konfirmasi Batal', 'Data yang belum disimpan akan hilang. Lanjutkan?', resetForm);
};

const handleClose = () => {
  showConfirmation('Konfirmasi Tutup', 'Tutup form dan kembali ke halaman browse?', () => router.push({ name: 'MutasiStok' }));
};

const onSoSelected = (so: { Nomor: string }) => {
  header.nomorSo = so.Nomor;
  dialog.soSearch = false;
  loadDataFromSo(so.Nomor);
};

const getQtyMutasiClass = (item: Item) => {
  const qtyMutasi = item.jumlah || 0;
  if (header.jenisMutasi === 'SP' && qtyMutasi > item.showroom) return 'qty-error';
  if (header.jenisMutasi === 'PS' && qtyMutasi > item.pesan) return 'qty-error';
  return '';
};

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [header, items],
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isLoading.value || isSaving.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Nomor SO dipilih atau Keterangan diisi
    const hasHeader = (header.nomorSo !== '') || (header.keterangan.trim() !== '');

    // 2. Items: Grid sudah terisi (dari SO atau manual)
    const hasItems = items.value.length > 0;

    if (hasHeader || hasItems) {
      uiStore.setUnsavedChanges(true);
    } else {
      // Jika kembali kosong bersih
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

// Perbaikan logika auto-load di MutasiStokCreate.vue
onMounted(() => {
  markAsSaved();

  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin.`);
    router.push({ name: 'MutasiStok' });
    return;
  }

  // --- LOGIKA AUTO-LOAD YANG DIPERBAIKI ---
  const refSo = route.query.refSo as string;
  const refJenis = route.query.jenis as string; // 👈 Ambil jenis dari URL

  if (refSo) {
    header.nomorSo = refSo;
    // Jika ada jenis di URL (PS), pakai itu. Jika tidak, default 'SP'
    header.jenisMutasi = refJenis || 'SP';
    loadDataFromSo(refSo);
  }

  const nomor = route.params.nomor as string;
  if (isEditMode.value && nomor) {
    loadDataForEdit(nomor);
  } else if (!refSo) {
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-swap-horizontal-bold">
    <template #header-actions>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save" @click="handleSave" :loading="isSaving"
        :disabled="isSaving || !authStore.can(MENU_ID, requiredPermission)">
        Simpan
      </v-btn>
      <v-btn size="small" @click="handleCancel" prepend-icon="mdi-refresh">Batal</v-btn>
      <v-btn size="small" @click="handleClose" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact" hide-details>
                <template #append-inner><span v-if="!isEditMode" class="text-caption">&lt;Otomatis&gt;</span></template>
              </v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined" density="compact"
                hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="No. Pesanan" v-model="header.nomorSo" @click="dialog.soSearch = true"
                prepend-inner-icon="mdi-magnify" density="compact" hide-details :readonly="isEditMode" />
            </v-col>
            <v-col cols="12">
              <v-radio-group v-model="header.jenisMutasi" inline hide-details :readonly="isEditMode">
                <template v-slot:label>
                  <div class="text-caption">Jenis Mutasi</div>
                </template>
                <v-radio label="Showroom ke Pesanan" value="SP"></v-radio>
                <v-radio label="Pesanan ke Showroom" value="PS"></v-radio>
              </v-radio-group>
            </v-col>
            <v-col cols="12">
              <v-textarea label="Keterangan" v-model="header.keterangan" variant="outlined" rows="3" density="compact"
                hide-details />
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
            class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
            <template #[`item.nama`]="{ item }">
              <div class="nama-barang-cell">{{ item.nama }}</div>
            </template>
            <template #[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" min="0" variant="underlined" density="compact"
                hide-details class="text-end" :class="getQtyMutasiClass(item)" />
            </template>
            <template #bottom></template>
          </v-data-table>
          <div class="table-summary sticky-footer">
            <div class="summary-row">
              <div class="label">Total Pesanan:</div>
              <div class="value">{{ summaryTotals.totalPesan }}</div>
            </div>
            <div class="summary-row">
              <div class="label">Total Showroom:</div>
              <div class="value">{{ summaryTotals.totalShowroom }}</div>
            </div>
            <div class="summary-row">
              <div class="label">Total Qty Mutasi:</div>
              <div class="value">{{ summaryTotals.totalJumlah }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SoSearchModalForMutasi v-if="dialog.soSearch" @close="dialog.soSearch = false" @so-selected="onSoSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.desktop-table :deep(td) {
  vertical-align: middle !important;
}

.desktop-table :deep(.nama-barang-cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 350px;
}

:deep(.qty-error input) {
  color: red !important;
  font-weight: bold;
}

.table-summary {
  border-top: 1px solid #ddd;
  padding: 10px 16px;
  background: white;
  display: flex;
  justify-content: flex-end;
  gap: 40px;
  font-size: 14px;
}

.summary-row {
  display: flex;
  gap: 10px;
}

.summary-row .label {
  font-weight: bold;
}

.sticky-footer {
  position: sticky;
  bottom: 0;
  background: white;
  z-index: 5;
  border-top: 1px solid #ccc;
}

.desktop-table :deep(thead tr th) {
  background-color: #0D47A1 !important;
  /* Biru Tua */
  color: #ffffff !important;
  /* Teks Putih */
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important;
  /* Supaya lebih rapi */
}
</style>

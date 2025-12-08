<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import api from '@/services/api';
import { format, parseISO, isBefore } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface Header {
  nomorTerima: string;
  tanggalTerima: string;
  nomorKirim: string;
  tanggalKirim: string;
  gudangAsalKode: string;
  gudangAsalNama: string;
  keterangan: string;
}
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  barcode: string;
  jumlahKirim: number;
  jumlahTerima: number;
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = '47';

const pageTitle = 'Buat Mutasi Antar Store Terima';
const canView = computed(() => authStore.can(MENU_ID, 'view'));
const canInsert = computed(() => authStore.can(MENU_ID, 'insert'));

const header = reactive<Header>({
  nomorTerima: '',
  tanggalTerima: format(new Date(), 'yyyy-MM-dd'),
  nomorKirim: '',
  tanggalKirim: '',
  gudangAsalKode: '',
  gudangAsalNama: '',
  keterangan: '',
});
const items = ref<Item[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const scannedBarcode = ref('');
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const tableHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '200px' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', width: '100px' },
  { title: 'Qty Kirim', key: 'jumlahKirim', width: '120px' },
  { title: 'Qty Terima', key: 'jumlahTerima', width: '150px' },
  { title: 'Barcode', key: 'barcode', width: '150px' },
] as const;

// --- Methods ---
const handleBarcodeScan = () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;
  const itemFound = items.value.find(item => item.barcode === barcode);
  if (itemFound) {
    const newQty = (itemFound.jumlahTerima || 0) + 1;
    if (newQty > itemFound.jumlahKirim) {
      toast.error('Jumlah terima melebihi jumlah kirim.');
    } else {
      itemFound.jumlahTerima = newQty;
      toast.info(`Jumlah terima untuk ${itemFound.nama} ditambah.`);
    }
  } else {
    toast.warning('Barcode tidak ditemukan dalam daftar pengiriman ini.');
  }
  scannedBarcode.value = '';
};

const save = () => {
  if (!canInsert.value) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    return;
  }
  // Validasi dari Delphi
  const validItems = items.value.filter(i => i.kode);
  if (validItems.length === 0) return toast.error('Detail barang kosong.');
  const tglTerima = new Date(header.tanggalTerima);
  const tglKirim = parseISO(header.tanggalKirim);
  if (isBefore(tglTerima, tglKirim)) return toast.error('Tanggal terima tidak boleh mundur dari tanggal kirim.');

  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data penerimaan ini?', executeSave);
};

const executeSave = async () => {
  if (!canInsert.value) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    isSaving.value = false; // Pastikan loading dihentikan
    return;
  }
  isSaving.value = true;
  const payload = {
    header,
    items: items.value.filter(i => (i.jumlahTerima || 0) > 0)
  };
  try {
    const response = await api.post('/mutasi-terima-form/save', payload);
    toast.success(response.data.message);
    markAsSaved();
    router.push({ name: 'MutasiTerima' });
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const closeForm = () => {
  router.push({ name: 'MutasiTerima' });
};

// Logika untuk tombol Batal (di Delphi "Batal" = "Tutup")
const handleCancel = () => {
  showConfirmation('Konfirmasi Batal', 'Tutup form? Perubahan yang belum disimpan akan hilang.', closeForm);
};

// Logika untuk tombol Tutup
const handleClose = () => {
  showConfirmation('Konfirmasi Tutup', 'Tutup form? Perubahan yang belum disimpan akan hilang.', closeForm);
};

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [items, header], // Pantau items (jumlah terima) dan header (tanggal)
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isLoading.value || isSaving.value) return;

    // Cek apakah ada perubahan
    // 1. Items: Ada item yang jumlah terimanya > 0 (artinya user sudah mulai input terima)
    //    ATAU user mengubah tanggal terima (header)
    //    Catatan: Karena form ini "Load from Kirim", data awal items sudah ada.
    //    Kita bisa anggap "Dirty" jika user mengubah apapun setelah load selesai.

    uiStore.setUnsavedChanges(true);
  },
  { deep: true }
);

onMounted(async () => {
  markAsSaved();
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading
    toast.error('Anda tidak memiliki izin untuk mengakses halaman ini.');
    // Opsional: Redirect atau tampilkan pesan akses ditolak di template
    // router.replace({ name: 'Forbidden' });
    return; // Hentikan eksekusi onMounted
  }

  isLoading.value = true;

  const nomorKirim = route.query.nomorKirim as string;
  if (!nomorKirim) {
    toast.error('Nomor pengiriman tidak valid.');
    router.back();
    return;
  }
  try {
    const response = await api.get(`/mutasi-terima-form/load-from-kirim/${nomorKirim}`);
    const data = response.data;
    Object.assign(header, data.header);
    items.value = data.items.map((item: Omit<Item, 'id' | 'jumlahTerima'>) => ({
      ...item,
      id: Date.now() + Math.random(),
      jumlahTerima: item.jumlahKirim, // default = jumlahKirim
    })) as Item[];
    await nextTick();
    markAsSaved();
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data pengiriman.');
    router.back();
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-package-variant-plus">
    <template #header-actions>
      <v-btn v-if="canInsert" size="small" prepend-icon="mdi-content-save" color="primary" @click="save"
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
            <v-col cols="12"><v-text-field label="No. Terima" v-model="header.nomorTerima" readonly filled
                density="compact" hide-details /></v-col>
            <v-col cols="12"><v-text-field label="Tgl. Terima" v-model="header.tanggalTerima" type="date"
                variant="outlined" density="compact" hide-details :readonly="!canInsert" /></v-col>
            <v-col cols="12"><v-text-field label="No. Kirim" v-model="header.nomorKirim" readonly filled
                density="compact" hide-details /></v-col>
            <v-col cols="12">
              <v-text-field label="Tgl. Kirim"
                :model-value="header.tanggalKirim ? format(parseISO(header.tanggalKirim), 'dd/MM/yyyy') : ''" readonly
                filled density="compact" hide-details />
            </v-col>
            <v-col cols="12"><v-text-field label="Gudang Kirim" v-model="header.gudangAsalNama" readonly filled
                density="compact" hide-details /></v-col>
            <v-col cols="12"><v-textarea label="Keterangan" v-model="header.keterangan" readonly filled
                density="compact" hide-details rows="3" /></v-col>
          </v-row>
        </div>
      </div>
      <div class="right-column">
        <div class="scanner-wrapper mb-4">
          <v-text-field v-model="scannedBarcode" label="Scan Barcode..." variant="outlined" density="compact"
            prepend-inner-icon="mdi-barcode-scan" hide-details clearable @keydown.enter.prevent="handleBarcodeScan"
            :readonly="!canInsert" />
        </div>
        <div class="desktop-form-section d-flex flex-column fill-height">
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
            class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
            <template #[`item.jumlahTerima`]="{ item }">
              <v-text-field v-model.number="item.jumlahTerima" type="number" min="0" :max="item.jumlahKirim"
                variant="underlined" density="compact" hide-details class="text-end" :readonly="!canInsert" />
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>
    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">
            Ya, Lanjutkan
          </v-btn>
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

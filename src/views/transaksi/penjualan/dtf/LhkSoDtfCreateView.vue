<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { format } from 'date-fns';
import SoPoSearchModal from '@/components/lookup/SoPoSearchModal.vue';
import axios from 'axios';

interface LhkItem {
  id: number;
  kode: string;
  nama: string;
  depan: number;
  belakang: number;
  lengan: number;
  variasi: number;
  saku: number;
  jumlah: number;
  jumlahSistem: number;
  panjang: number;
  buangan: number;
  luasSistem: number; // Dari SO Sistem
  luasRiil: number;
  reject: number;
  ket: string;
}

interface LhkApiResponseItem {
  lhk_nomor: string;
  tanggal: string;
  kode: string;
  nama: string;
  cab: string;
  depan: number | null;
  belakang: number | null;
  lengan: number | null;
  variasi: number | null;
  saku: number | null;
  jumlah: number | null;
  jumlahSistem: number | null;
  panjang: number | null;
  buangan: number | null;
  luas_sistem: number | null;
  reject: number;
  keterangan: string;
}

// Tambahkan interface JenisOrder
interface JenisOrder {
  kode: string;
  nama: string;
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = '41';

const selectedTanggal = ref(format(new Date(), 'yyyy-MM-dd'));
const selectedCabang = ref(authStore.user?.cabang || '');
const items = ref<LhkItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const jenisOrderOptions = ref<JenisOrder[]>([]);

const isSoSearchVisible = ref(false); // Untuk F1
const isPoSearchVisible = ref(false); // Untuk F2
const activeRowIndex = ref(0);

const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);

const isSpkSearchVisible = ref(false);

const isEditMode = computed(() => !!route.query.nomorLhk);
const formHeader = reactive({
  lhkNomor: '',
  panjang: 0,
  buangan: 0,
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
  jenisOrder: null as JenisOrder | null, // Tambahkan ini
});

const pageTitle = computed(() => isEditMode.value ? `Ubah LHK Jasa` : `Buat LHK Jasa`);
const canView = computed(() => authStore.can(MENU_ID, 'view'));
const canEdit = computed(() => authStore.can(MENU_ID, 'edit'));
const canSave = computed(() => authStore.can(MENU_ID, 'insert'));
const totalLuasSistem = computed(() => items.value.reduce((sum, i) => sum + (i.luasSistem || 0), 0));
// Rumus: Luas Sistem / 60 (Lebar Bahan)
const panjangSistemEstimasi = computed(() => {
  if (totalLuasSistem.value === 0) return 0;
  return Number((totalLuasSistem.value / 60).toFixed(2));
});
const totalLuasRiil = computed(() => {
  const p = Number(formHeader.panjang) || 0;
  const b = Number(formHeader.buangan) || 0;
  // Rumus: (Panjang + Buangan) * 60 cm lebar bahan
  return Math.round((p + b) * 60);
});
const selisihLuas = computed(() => totalLuasRiil.value - totalLuasSistem.value);
const isShowMeasurement = computed(() => {
  if (!formHeader.jenisOrder) return false; // Sembunyikan jika belum pilih jenis

  const namaOrder = formHeader.jenisOrder.nama.toUpperCase();
  // Muncul HANYA jika mengandung kata 'DTF'
  return namaOrder.includes('SABLON DTF') || namaOrder.includes('DTF PREMIUM');
});

const totalJumlahKaosSummary = computed(() => {
  return items.value.reduce((sum, item) => sum + (Number(item.jumlahSistem) || 0), 0);
});

const isKdcUser = computed(() => authStore.user?.cabang === 'KDC');

// Fetch Jenis Order saat Mount
onMounted(async () => {
  const res = await api.get('/lhk-so-dtf-form/jenis-order');
  jenisOrderOptions.value = res.data;

  // Default ke Sablon DTF jika ada
  const dtf = jenisOrderOptions.value.find(j => j.nama.includes('DTF'));
  if (dtf) formHeader.jenisOrder = dtf;

  loadLhkData();
});

const tableHeaders = [
  { title: 'No.', key: 'no', width: '50px', sortable: false },
  { title: 'PO/SO DTF', key: 'kode', width: '125px' },
  { title: 'Nama DTF', key: 'nama', width: '400px' },
  { title: 'Jumlah Kaos (pcs)', key: 'jumlah', width: '80px', align: 'center' as const },
  { title: 'Reject', key: 'reject', width: '80px', align: 'center' as const },
  { title: 'Depan', key: 'depan', width: '80px', align: 'center' as const },
  { title: 'Belakang', key: 'belakang', width: '80px', align: 'center' as const },
  { title: 'Lengan', key: 'lengan', width: '80px', align: 'center' as const },
  { title: 'Variasi', key: 'variasi', width: '80px', align: 'center' as const },
  { title: 'Saku', key: 'saku', width: '80px', align: 'center' as const },
  { title: 'Keterangan', key: 'ket' },
  { title: 'Actions', key: 'actions', width: '50px' },
];

const loadLhkData = async () => {
  // [FIX] Hanya panggil data jika ada parameter nomorLhk (Mode Edit)
  if (!route.query.nomorLhk) {
    items.value = [];
    addNewRowIfNeeded();
    return;
  }

  // [FIX] Reset header jika tidak ada nomorLhk (Mode Baru / Klik Batal)
  if (!route.query.nomorLhk) {
    items.value = [];
    formHeader.panjang = 0; // Reset ke 0
    formHeader.buangan = 0; // Reset ke 0
    formHeader.lhkNomor = '';
    addNewRowIfNeeded();
    return;
  }

  isLoading.value = true;
  try {
    const response = await api.get<LhkApiResponseItem[]>(`/lhk-so-dtf-form/detail/${route.query.nomorLhk}`);
    const data = response.data;

    if (data.length > 0) {
      formHeader.lhkNomor = data[0].lhk_nomor;
      formHeader.panjang = data[0].panjang;
      formHeader.buangan = data[0].buangan;
      formHeader.tanggal = format(new Date(data[0].tanggal), 'yyyy-MM-dd');
      formHeader.cabang = data[0].cab;

      items.value = data.map((item, index): LhkItem => ({
        id: Date.now() + index,
        kode: item.kode,
        nama: item.nama,

        depan: item.depan ?? 0,
        belakang: item.belakang ?? 0,
        lengan: item.lengan ?? 0,
        variasi: item.variasi ?? 0,
        saku: item.saku ?? 0,

        jumlah: item.jumlah ?? 0,
        jumlahSistem: item.jumlahSistem ?? 0,
        reject: item.reject ?? 0,

        panjang: item.panjang ?? 0,
        buangan: item.buangan ?? 0,

        luasSistem: item.luas_sistem || 0,
        luasRiil: 0,
        ket: item.keterangan || ''
      }));
    }
  } catch (error) {
    toast.error('Gagal memuat data LHK.', error);
  } finally {
    // addNewRowIfNeeded();
    isLoading.value = false;
    markAsSaved();
  }
};

const addNewRowIfNeeded = () => {
  if (isEditMode.value) return;

  const isBordir = (formHeader.jenisOrder?.nama || '').toUpperCase().includes('BORDIR');
  const lastItem = items.value[items.value.length - 1];

  // Jika Bordir dan sudah ada item yang memiliki kode, berhenti di sini (jangan tambah baris)
  if (isBordir && items.value.some(item => item.kode !== '')) {
    return;
  }

  if (!lastItem || lastItem.kode) {
    items.value.push({
      id: Date.now(),
      kode: '',
      nama: '',
      jumlah: 0,
      jumlahSistem: 0,
      reject: 0,
      panjang: 0,
      buangan: 0,
      luasSistem: 0,
      luasRiil: 0,
      ket: '',
      depan: 0, belakang: 0, lengan: 0, variasi: 0, saku: 0 // Pastikan semua field inisialisasi
    });
  }
};

const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
  addNewRowIfNeeded();
};

const openSoSearchModal = (index: number) => {
  activeRowIndex.value = index;
  isSoSearchVisible.value = true;
};

const openPoSearchModal = (index: number) => {
  activeRowIndex.value = index;
  isPoSearchVisible.value = true;
};

// 2. Fungsi untuk membuka modal SPK
const openSpkSearchModal = (index: number) => {
  activeRowIndex.value = index;
  isSpkSearchVisible.value = true;
};

const onSoPoSelected = async (selectedItem: { kode: string, nama: string }) => {
  const activeItem = items.value[activeRowIndex.value];
  if (items.value.some(i => i.kode === selectedItem.kode && i.id !== activeItem.id)) {
    return toast.error(`Nomor ${selectedItem.kode} sudah ada.`);
  }

  try {
    const res = await api.get(`/lhk-so-dtf-form/specs/${selectedItem.kode}`);
    activeItem.kode = selectedItem.kode;
    activeItem.nama = selectedItem.nama;
    activeItem.luasSistem = res.data.totalLuasSistem || 0;
    activeItem.jumlahSistem = res.data.totalKaos || 0;
    activeItem.jumlah = 0;

    // Hanya panggil penambahan baris jika BUKAN Bordir
    const isBordir = (formHeader.jenisOrder?.nama || '').toUpperCase().includes('BORDIR');
    if (!isBordir) {
      addNewRowIfNeeded();
    }

    isSoSearchVisible.value = false;
    isPoSearchVisible.value = false;
  } catch (error) {
    toast.error("Gagal mengambil spesifikasi SO.", error);
  }
};

watch(() => formHeader.jenisOrder, (newVal) => {
  // 1. Reset inputan meteran (Panjang & Buangan) menjadi 0
  formHeader.panjang = 0;
  formHeader.buangan = 0;

  // 2. Kosongkan seluruh isi tabel
  // Hal ini penting untuk menjaga integritas data agar nomor SO DTF
  // tidak tercampur ke dalam laporan Bordir atau sebaliknya.
  items.value = [];

  // 3. Inisialisasi ulang baris kosong
  // Fungsi addNewRowIfNeeded akan otomatis mendeteksi jenis pekerjaan baru
  // dan memberikan 1 baris kosong yang sesuai (termasuk limitasi untuk Bordir).
  addNewRowIfNeeded();

  if (newVal) {
    toast.info(`Mode input diubah ke: ${newVal.nama}`);
  }
});

// --- Watcher untuk Hitung Luas Riil (60 * P * B) ---
watch(items, (newItems) => {
  newItems.forEach(item => {
    if (item.panjang > 0 && item.buangan > 0) {
      // Rumus: 60 (Lebar Bahan) * Panjang * Buangan
      item.luasRiil = Math.round(60 * item.panjang * item.buangan);
    } else {
      item.luasRiil = 0;
    }
  });
}, { deep: true });

const save = async () => {
  isSaving.value = true;
  try {
    const validItems = items.value.filter(item => item.kode && item.nama);

    // Validasi input global di header
    if (isShowMeasurement.value && formHeader.panjang <= 0) {
      toast.error("Panjang minimal harus diisi untuk Sablon DTF!");
      isSaving.value = false; // Reset loading state jika gagal validasi
      return;
    }

    if (validItems.length === 0) {
      toast.error("Minimal harus mengisi satu SO/PO!");
      isSaving.value = false;
      return;
    }

    await api.post('/lhk-so-dtf-form', {
      tanggal: formHeader.tanggal, // [FIX 3] Gunakan data dari formHeader
      cabang: formHeader.cabang,   // [FIX 3] Gunakan data dari formHeader
      jenisOrder: formHeader.jenisOrder,
      panjang: isShowMeasurement.value ? formHeader.panjang : 0,
      buangan: isShowMeasurement.value ? formHeader.buangan : 0,
      isEdit: isEditMode.value,
      lhkNomor: formHeader.lhkNomor,
      items: validItems
    });

    toast.success('Data LHK berhasil disimpan.');
    markAsSaved();
    router.push('/transaksi/penjualan/dtf/lhk-so-dtf');
  } catch (error) {
    let msg = 'Gagal menyimpan data.';
    if (axios.isAxiosError(error)) {
      msg = error.response?.data?.message || msg;
    }
    toast.error(msg);
  } finally {
    isSaving.value = false;
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

// Buat fungsi baru untuk navigasi Tutup agar bisa dipanggil
const closeForm = () => {
  markAsSaved();
  router.push('/transaksi/penjualan/dtf/lhk-so-dtf');
};

// --- WATCHERS (UNSAVED CHANGES) ---
// Pantau perubahan pada array items
watch(
  items,
  (newItems) => {
    // Abaikan jika sedang loading awal atau saving
    if (isLoading.value || isSaving.value) return;

    // Cek apakah ada data yang "bermakna" (kode terisi)
    // atau ada perubahan nilai pada baris yang sudah ada
    const hasData = newItems.some(item => item.kode !== '');

    if (hasData) {
      uiStore.setUnsavedChanges(true);
    } else {
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

// Pantau perubahan tanggal/cabang (karena ini me-reload data, kita perlu handle khusus)
watch([selectedTanggal, selectedCabang], async () => {
  // Jika user ganti tanggal/cabang, data akan diload ulang.
  // Kita biarkan proses loadLhkData yang mereset status unsaved di finally block.
  await loadLhkData();
});

onMounted(() => {
  // Reset status awal
  markAsSaved();

  if (route.query.tanggal && route.query.cabang) {
    selectedTanggal.value = route.query.tanggal as string;
    selectedCabang.value = route.query.cabang as string;
  }
  loadLhkData();
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-clipboard-edit-outline">
    <template #header-actions>
      <v-btn v-if="canSave" size="small" color="primary"
        @click="showConfirmation(save, 'Anda yakin ingin menyimpan data LHK ini?')" :loading="isSaving"
        prepend-icon="mdi-content-save">
        Simpan
      </v-btn>
      <v-btn v-if="canEdit" size="small"
        @click="showConfirmation(loadLhkData, 'Batalkan perubahan dan muat ulang data asli?')"
        prepend-icon="mdi-refresh">
        Batal
      </v-btn>
      <v-btn size="small" @click="showConfirmation(closeForm, 'Tutup form? Perubahan yang belum disimpan akan hilang.')"
        prepend-icon="mdi-close">
        Tutup
      </v-btn>
    </template>

    <div v-if="!canView" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section mb-3">
          <div class="text-subtitle-2 font-weight-bold mb-3">Informasi LHK</div>
          <v-row dense>
            <v-col cols="12">
              <v-text-field label="Nomor LHK" v-model="formHeader.lhkNomor" density="compact" hide-details
                variant="filled" readonly placeholder="(Otomatis)" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Store" v-model="formHeader.cabang" density="compact" hide-details variant="outlined"
                readonly filled />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Tanggal" v-model="formHeader.tanggal" type="date" density="compact" hide-details
                variant="outlined" />
            </v-col>
            <v-col cols="12">
              <v-select v-model="formHeader.jenisOrder" :items="jenisOrderOptions" item-title="nama" return-object
                label="Jenis Pekerjaan" density="compact" variant="outlined" hide-details />
            </v-col>
          </v-row>
        </div>

        <div v-if="isShowMeasurement" class="desktop-form-section mb-3 bg-blue-lighten-5">
          <div class="text-subtitle-2 font-weight-bold mb-2">Ukuran Cetak Riil</div>
          <v-row dense>
            <v-col cols="6">
              <v-text-field v-model.number="formHeader.panjang" label="Panjang" type="number" variant="outlined"
                density="compact" hide-details class="custom-suffix" suffix="cm" />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model.number="formHeader.buangan" label="Buangan" type="number" variant="outlined"
                density="compact" hide-details class="custom-suffix" suffix="cm" />
            </v-col>
          </v-row>
        </div>

        <div v-if="isShowMeasurement || (formHeader.jenisOrder?.nama || '').toUpperCase().includes('BORDIR')"
          class="desktop-form-section">
          <div class="text-subtitle-2 font-weight-bold mb-2">
            {{ isShowMeasurement ? 'Perhitungan Pemakaian Bahan' : 'Perhitungan Produksi Bordir' }}
          </div>

          <v-list density="compact" class="pa-0">
            <v-list-item class="px-0">
              <v-list-item-title class="text-caption">Total Qty (Sistem)</v-list-item-title>
              <template #append>
                <span class="font-weight-bold text-deep-orange">
                  {{ totalJumlahKaosSummary.toLocaleString() }} Pcs
                </span>
              </template>
            </v-list-item>

            <template v-if="isKdcUser">
              <template v-if="isShowMeasurement">
                <v-list-item class="px-0">
                  <v-list-item-title class="text-caption">Total Luas Riil</v-list-item-title>
                  <template #append>
                    <span class="font-weight-bold text-blue">{{ totalLuasRiil.toLocaleString() }} cm²</span>
                  </template>
                </v-list-item>

                <v-list-item class="px-0">
                  <v-list-item-title class="text-caption">Total Luas Sistem</v-list-item-title>
                  <template #append>
                    <span class="font-weight-bold">{{ totalLuasSistem.toLocaleString() }} cm²</span>
                  </template>
                </v-list-item>

                <v-list-item class="px-0 min-h-30 bg-grey-lighten-5 rounded mt-1">
                  <template #title>
                    <span class="text-caption font-weight-bold">Estimasi Panjang (Sistem)</span>
                  </template>
                  <template #append>
                    <span class="font-weight-black">{{ panjangSistemEstimasi.toLocaleString() }} cm</span>
                  </template>
                </v-list-item>

                <v-divider class="my-2"></v-divider>

                <v-list-item class="px-0">
                  <v-list-item-title class="font-weight-bold">Selisih (±)</v-list-item-title>
                  <template #append>
                    <span class="font-weight-black" :class="selisihLuas > 0 ? 'text-error' : 'text-success'">
                      {{ selisihLuas.toLocaleString() }} cm²
                    </span>
                  </template>
                </v-list-item>
              </template>
            </template>

            <div v-else-if="isShowMeasurement" class="text-caption text-grey-darken-1 mt-2 font-italic">
              * Detail perhitungan luasan hanya dapat dilihat oleh admin pusat.
            </div>
          </v-list>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
            class="desktop-table" fixed-header :items-per-page="-1">
            <template #[`item.no`]="{ index }">
              <div class="cell-text">{{ index + 1 }}</div>
            </template>

            <template #[`item.kode`]="{ item, index }">
              <v-text-field v-model="item.kode" :readonly="isEditMode" :variant="isEditMode ? 'filled' : 'underlined'"
                density="compact" hide-details :placeholder="isEditMode ? '' : 'F1:SO, F2:PO, F3:SPK'"
                @keydown.f1.prevent="!isEditMode && openSoSearchModal(index)"
                @keydown.f2.prevent="!isEditMode && openPoSearchModal(index)"
                @keydown.f3.prevent="!isEditMode && openSpkSearchModal(index)" />
            </template>

            <template #[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" density="compact"
                hide-details class="text-center tiny-input font-weight-bold" />
            </template>

            <template #[`item.reject`]="{ item }">
              <v-text-field v-model.number="item.reject" type="number" variant="underlined" density="compact"
                hide-details class="text-center tiny-input text-error font-weight-bold" />
            </template>

            <template v-for="col in ['depan', 'belakang', 'lengan', 'variasi', 'saku']" :key="col"
              #[`item.${col}`]="{ item }">
              <v-text-field v-model.number="item[col]" type="number" variant="underlined" density="compact" hide-details
                class="text-center tiny-input" />
            </template>

            <template #[`item.ket`]="{ item }">
              <v-text-field v-model="item.ket" variant="underlined" density="compact" hide-details />
            </template>

            <template #[`item.actions`]="{ item }">
              <v-btn v-if="!isEditMode && items.length > 1" icon="mdi-delete" size="x-small" variant="text"
                color="error" @click="removeRow(item.id)" />
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>

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

    <SoPoSearchModal v-if="isSoSearchVisible" :cabang="selectedCabang" tipe="SO" :prefix="formHeader.jenisOrder?.kode"
      @close="isSoSearchVisible = false" @selected="onSoPoSelected" />

    <SoPoSearchModal v-if="isPoSearchVisible" :cabang="selectedCabang" tipe="PO" @close="isPoSearchVisible = false"
      @selected="onSoPoSelected" />

    <SoPoSearchModal v-if="isSpkSearchVisible" :cabang="selectedCabang" tipe="SPK" @close="isSpkSearchVisible = false"
      @selected="onSoPoSelected" />
  </PageLayout>
</template>

<style scoped>
/* Mengatur text biasa di dalam sel (untuk kolom No.) */
.cell-text {
  padding: 0 8px;
}

.text-end :deep(input) {
  text-align: right;
}

/* Mengecilkan teks "cm" pada input */
:deep(.custom-suffix .v-field__suffix) {
  font-size: 9px !important;
  opacity: 0.6;
  padding-left: 2px;
  text-transform: lowercase;
}

/* Mengatur input angka agar lebih compact */
.tiny-input :deep(input) {
  padding: 4px 0 !important;
  font-size: 11px !important;
  text-align: center;
}

.custom-suffix :deep(input) {
  font-size: 12px !important;
}

.text-caption {
  font-size: 11px !important;
}

.nama-dtf-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  font-size: 11px;
}

/* Merapatkan jarak antar kolom v-data-table */
:deep(.v-data-table__td) {
  padding: 0 4px !important;
}

.form-grid-container {
  display: grid;
  grid-template-columns: 320px 1fr;
  /* Lebar kolom kiri tetap */
  gap: 16px;
  height: calc(100vh - 120px);
}

/* Styling Khusus Suffix cm agar tidak besar */
:deep(.custom-suffix .v-field__suffix) {
  font-size: 10px !important;
  font-weight: normal;
  opacity: 0.7;
}

.tiny-input :deep(input) {
  padding: 4px 0 !important;
  font-size: 12px !important;
  text-align: center;
}

.desktop-table :deep(thead tr th) {
  font-size: 11px !important;
  white-space: nowrap;
}

.bg-blue-lighten-5 {
  background-color: #e3f2fd !important;
  border: 1px solid #bbdefb;
}

.text-blue {
  color: #1976d2;
}

:deep(.v-data-table__td:nth-child(3)) {
  font-size: 11px;
  line-height: 1.2;
  white-space: normal !important;
  /* Mengizinkan teks pindah baris */
  word-break: break-word;
  padding: 8px 4px !important;
}
</style>

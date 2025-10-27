<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import SoDtfStokSearchModal from '@/components/lookup/SoDtfStokSearchModal.vue';
import { AxiosError } from 'axios';

interface LhkItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  qtyso: number;
  sudah: number;
  belum: number;
  jumlah: number | null;
}

// --- Interfaces & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '48';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah LHK SO DTF Stok` : 'Buat LHK SO DTF Stok');
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const canSaveOrEdit = computed(() => {
  // User bisa menyimpan jika punya hak 'insert' (untuk data baru)
  // ATAU hak 'edit' (untuk data yang sudah ada)
  return authStore.can(MENU_ID, 'insert') || authStore.can(MENU_ID, 'edit');
});

const formHeader = ref({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  soNomor: '',
  cabang: authStore.user?.cabang || '',
});

const items = ref([]);
const isLoading = ref(false);
const isSaving = ref(false);
const isSoSearchVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => Promise<void>) | (() => void) | null>(null);
const isQtyConfirmVisible = ref(false);
const itemToValidate = ref<LhkItem | null>(null);
const originalJumlah = ref(0);

const tableHeaders = [
  { title: 'No.', key: 'no', sortable: false, width: '50px' },
  { title: 'Kode Barang', key: 'kode', sortable: false },
  { title: 'Nama Barang', key: 'nama', sortable: false },
  { title: 'Ukuran', key: 'ukuran', sortable: false },
  { title: 'Qty SO', key: 'qtyso', sortable: false, align: 'end' },
  { title: 'Sudah LHK', key: 'sudah', sortable: false, align: 'end' },
  { title: 'Belum LHK', key: 'belum', sortable: false, align: 'end' },
  { title: 'Jumlah', key: 'jumlah', sortable: false, width: '150px' },
] as const;

// --- Methods ---
const onSoSelected = async (so: { nomor: string }) => {
  isSoSearchVisible.value = false;
  formHeader.value.soNomor = so.nomor;
  isLoading.value = true;
  try {
    const response = await api.get(`/lhk-so-dtf-stok-form/lookup/so-stok-details/${so.nomor}`);
    items.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat detail SO Stok.', error);
  } finally {
    isLoading.value = false;
  }
};

const save = () => {
  if (!formHeader.value.soNomor) {
    toast.error('Nomor SO DTF harus dipilih terlebih dahulu.');
    return;
  }

  const validItems = items.value.filter(item => item.nama);
  if (validItems.length === 0) {
    toast.error('Detail item tidak boleh kosong.');
    return;
  }

  const totalQty = items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  if (totalQty === 0) {
    toast.error('Jumlah (Qty) kosong semua, tidak ada data untuk disimpan.');
    return;
  }

  // langsung konfirmasi → lalu jalankan executeSave
  showConfirmation(executeSave, "Anda yakin ingin menyimpan data LHK ini?");
};

// Buat fungsi executeSave terpisah dan async
const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: formHeader.value,
      // Kirim hanya item yang memiliki jumlah > 0
      items: items.value.filter(item => item.nama && (item.jumlah || 0) > 0),
      isNew: !isEditMode.value,
    };

    const response = await api.post('/lhk-so-dtf-stok-form/save/', payload);
    toast.success(response.data.message);

    if (isEditMode.value) {
      // setelah edit sukses, langsung balik ke browse
      router.push('/transaksi/penjualan/dtf/lhk-so-dtf-stok');
    } else {
      // setelah insert sukses, juga balik ke browse
      router.push('/transaksi/penjualan/dtf/lhk-so-dtf-stok');
    }

  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/lhk-so-dtf-stok-form/${nomor}`);
    const { header, items: loadedItems } = response.data;

    // Isi header form
    formHeader.value.nomor = header.ds_nomor;
    formHeader.value.tanggal = format(new Date(header.ds_tanggal), 'yyyy-MM-dd');
    formHeader.value.soNomor = header.ds_sd_nomor;

    // Isi grid
    items.value = loadedItems.map((item: Partial<LhkItem>, index: number) => ({
      ...item,
      id: Date.now() + index
    })) as LhkItem[];
  } catch (err) {
    if (err instanceof AxiosError) {
      toast.error(err.response?.data?.message || 'Gagal memuat data LHK.');
    } else {
      toast.error('Gagal memuat data LHK.');
    }
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const closeForm = () => router.push('/transaksi/penjualan/dtf/lhk-so-dtf-stok');

const showConfirmation = (action: () => Promise<void> | void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
};

const executePendingAction = async () => {
  if (pendingAction.value) {
    // 'await' akan memastikan kita menunggu fungsi (misal: save) selesai
    await pendingAction.value();
  }
  isConfirmDialogVisible.value = false;
};

const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
  pendingAction.value = null;
};

const onJumlahFocus = (item: LhkItem) => {
  // Simpan nilai asli saat field mendapatkan fokus
  originalJumlah.value = item.jumlah || 0;
};

const validateJumlah = (item: LhkItem) => {
  // Cek jika nilai baru lebih besar dari sisa kuota ('belum')
  if ((item.jumlah || 0) > (item.belum || 0)) {
    itemToValidate.value = item;
    isQtyConfirmVisible.value = true; // Tampilkan dialog konfirmasi
  }
};

const confirmQty = () => {
  // User memilih "Ya", biarkan nilai baru dan tutup dialog
  isQtyConfirmVisible.value = false;
  itemToValidate.value = null;
};

const revertQty = () => {
  // User memilih "Tidak", kembalikan ke nilai asli dan tutup dialog
  if (itemToValidate.value) {
    itemToValidate.value.jumlah = originalJumlah.value;
  }
  isQtyConfirmVisible.value = false;
  itemToValidate.value = null;
};

const loadLhkData = async () => {
  if (!formHeader.value.nomor) return;
  isLoading.value = true;
  try {
    await loadDataForEdit(formHeader.value.nomor); // gunakan fungsi yang sudah ada
  } finally {
    isLoading.value = false;
  }
};

const resetForm = () => {
  formHeader.value = {
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    soNomor: '',
    cabang: authStore.user?.cabang || '',
  };
  items.value = [];
};

onMounted(() => {
  if (!hasViewPermission.value) return;

  const nomor = route.params.nomor as string;
  if (isEditMode.value && nomor) {
    loadDataForEdit(nomor);
  } else {
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-package-variant-closed-edit">
    <template #header-actions>
      <v-btn v-if="canSaveOrEdit" size="small" color="primary" @click="save" :loading="isSaving"
        prepend-icon="mdi-content-save">
        Simpan
      </v-btn>

      <v-btn size="small"
        @click="showConfirmation(isEditMode ? loadLhkData : resetForm, isEditMode ? 'Batalkan perubahan dan muat ulang data asli?' : 'Kosongkan form?')"
        prepend-icon="mdi-refresh">
        Batal
      </v-btn>

      <v-btn size="small"
        @click="showConfirmation(async () => { await closeForm(); }, 'Tutup form? Perubahan yang belum disimpan akan hilang.')"
        prepend-icon="mdi-close">
        Tutup
      </v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field label="Nomor LHK" v-model="formHeader.nomor" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Tanggal" v-model="formHeader.tanggal" type="date" density="compact" hide-details
                variant="outlined" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Cabang" :model-value="formHeader.cabang" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="No. SO DTF Stok" v-model="formHeader.soNomor" readonly
                @click="isSoSearchVisible = true" prepend-inner-icon="mdi-magnify" density="compact" hide-details
                variant="outlined" :disabled="isEditMode" />
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
            class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
            <template v-slot:[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>
            <template v-slot:[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" min="0" variant="underlined" density="compact"
                hide-details class="text-end" @focus="onJumlahFocus(item)" @blur="validateJumlah(item)" />
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>

    <SoDtfStokSearchModal v-if="isSoSearchVisible" :cabang="formHeader.cabang" @close="isSoSearchVisible = false"
      @selected="onSoSelected" />

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">
          Konfirmasi
        </v-card-title>
        <v-card-text>
          {{ confirmText }}
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">
            Tidak
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="executePendingAction">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isQtyConfirmVisible" max-width="450px" persistent>
      <v-card>
        <v-card-title class="text-h6">
          <v-icon color="warning" class="me-2">mdi-alert-circle-outline</v-icon>
          Konfirmasi Kuantitas
        </v-card-title>
        <v-card-text>
          Qty LHK yang diinput ({{ itemToValidate?.jumlah }}) lebih besar dari sisa kuota SO ({{
            itemToValidate?.belum
          }}).
          <br>
          Yakin akan dilanjutkan?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="revertQty">
            Tidak (Batalkan)
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="confirmQty">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

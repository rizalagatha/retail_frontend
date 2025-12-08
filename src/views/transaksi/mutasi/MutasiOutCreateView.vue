<script setup lang="ts">
import { ref, onMounted, computed, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { format } from 'date-fns';
import SoSearchModal from '@/components/lookup/SoSearchModal.vue';
import WorkshopSearchModal from '@/components/lookup/WorkshopSearchModal.vue';
import type { AxiosError } from 'axios';

interface MutasiOutItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  stok?: number;
  qtyso?: number;
  sudah?: number;
  belum?: number;
  jumlah?: number;
  barcode?: string;
}

interface SoDetailItem {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  qtyso: number;
  sudah: number;
  belum: number;
  jumlah: number;
  barcode: string;
}

interface MutasiOutHeader {
  mo_nomor: string;
  mo_tanggal: string;
  mo_so_nomor: string;
  mo_kecab: string;
  pab_nama: string;
  mo_ket: string;
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = '43';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Mutasi Out' : 'Buat Mutasi Out');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const initialHeaderState = {
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  soNomor: '',
  keCabang: '',
  keCabangNama: '',
  keterangan: '',
};
const formHeader = ref({ ...initialHeaderState });
const items = ref<MutasiOutItem[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isSavingDisabled = ref(false);
const isSoSearchVisible = ref(false);
const isWorkshopSearchVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);

const tableHeaders = [
  { title: 'Kode Barang', key: 'kode' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran' },
  { title: 'Stok Showroom', key: 'stok', align: 'end' },
  { title: 'Qty SO', key: 'qtyso', align: 'end' },
  { title: 'Sudah', key: 'sudah', align: 'end' },
  { title: 'Belum', key: 'belum', align: 'end' },
  { title: 'Qty Out', key: 'jumlah', align: 'end', width: '150px' },
  { title: 'Barcode', key: 'barcode' },
] as const;

const onSoSelected = async (so: { Nomor: string }) => {
  isSoSearchVisible.value = false;
  formHeader.value.soNomor = so.Nomor;
  isLoading.value = true;
  try {
    const response = await api.get<SoDetailItem[]>(`/mutasi-out-form/lookup/so-details/${so.Nomor}`);
    items.value = response.data.map((item, index) => ({ ...item, id: Date.now() + index }));
  } catch (error: unknown) {
    toast.error('Gagal memuat detail SO.');
    console.error(error);
  } finally {
    isLoading.value = false;
  }
};

const onWorkshopSelected = (workshop: { kode: string, nama: string }) => {
  formHeader.value.keCabang = workshop.kode;
  formHeader.value.keCabangNama = workshop.nama;
  isWorkshopSearchVisible.value = false;
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get<{ header: MutasiOutHeader; items: MutasiOutItem[] }>(
      `/mutasi-out-form/${nomor}`
    );
    const { header, items: loadedItems } = response.data;

    formHeader.value.nomor = header.mo_nomor;
    formHeader.value.tanggal = format(new Date(header.mo_tanggal), 'yyyy-MM-dd');
    formHeader.value.soNomor = header.mo_so_nomor;
    formHeader.value.keCabang = header.mo_kecab;
    formHeader.value.keCabangNama = header.pab_nama;
    formHeader.value.keterangan = header.mo_ket;

    items.value = loadedItems.map(item => ({ ...item, id: Date.now() + Math.random() }));

    await nextTick();
    markAsSaved();
  } catch (error: unknown) {
    toast.error('Gagal memuat data.');
    console.error(error);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const save = () => {
  if (!formHeader.value.keCabang) return toast.error('Cabang tujuan harus diisi.');
  if (items.value.length === 0 || !items.value.some(i => i.nama)) return toast.error('Detail barang harus diisi.');
  const totalQtyOut = items.value.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  if (totalQtyOut === 0) return toast.error('Qty Out kosong semua.');

  for (const item of items.value) {
    if ((item.jumlah || 0) > (item.stok || 0)) {
      return toast.error(`Qty Out untuk ${item.nama} (${item.ukuran}) melebihi stok.`);
    }
    if ((item.jumlah || 0) > (item.belum || 0)) {
      return toast.error(`Qty Out untuk ${item.nama} (${item.ukuran}) melebihi sisa SO.`);
    }
  }
  showConfirmation(executeSave, "Anda yakin ingin menyimpan data Mutasi Out ini?");
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: formHeader.value,
      items: items.value.filter(item => (item.jumlah || 0) > 0),
      isNew: !isEditMode.value,
    };
    const response = await api.post<{ message: string; nomor: string }>('/mutasi-out-form/save', payload);
    toast.success(response.data.message);

    markAsSaved();

    const nomorMutasi = response.data.nomor;
    const url = router.resolve({
      name: 'Cetak Mutasi Out',
      params: { nomor: nomorMutasi }
    }).href;
    window.open(url, '_blank');

    router.push('/transaksi/mutasi/out-produksi');
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const resetForm = () => {
  formHeader.value = { ...initialHeaderState };
  items.value = [];
  markAsSaved();
  toast.info('Form telah dibersihkan.');
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
  router.push('/transaksi/mutasi/out-produksi');
};

const getQtyOutClass = (item: MutasiOutItem): string => {
  const qtyOut = item.jumlah || 0;
  const stok = item.stok || 0;
  const belum = item.belum || 0;

  return qtyOut > stok || qtyOut > belum ? 'qty-error' : '';
};

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [formHeader, items],
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isLoading.value || isSaving.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Nomor SO dipilih atau Keterangan diisi
    const hasHeader = (formHeader.value.soNomor !== '') || (formHeader.value.keterangan.trim() !== '');

    // 2. Items: Ada item yang sudah masuk ke grid
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

onMounted(() => {
  markAsSaved();

  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data Mutasi Out.`);
    router.push({ name: 'MutasiOut' }); // Arahkan kembali ke halaman browse
    return;
  }

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
      <v-btn v-if="authStore.can(MENU_ID, requiredPermission)" size="small" prepend-icon="mdi-content-save"
        color="primary" @click="save" :loading="isSaving" :disabled="isSaving || isSavingDisabled">
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-cancel"
        @click="showConfirmation(resetForm, 'Batalkan dan kosongkan form?')">Batal</v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="showConfirmation(closeForm, 'Tutup form?')">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field label="Nomor" v-model="formHeader.nomor" readonly filled density="compact" hide-details>
                <template #append-inner>
                  <span v-if="!formHeader.nomor" style="color: #888; font-size: 11px;">&lt;Otomatis&gt;</span>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field label="Tanggal" v-model="formHeader.tanggal" type="date" variant="outlined"
                density="compact" hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="No. SO" v-model="formHeader.soNomor" readonly @click="isSoSearchVisible = true"
                prepend-inner-icon="mdi-magnify" density="compact" hide-details
                :class="{ 'field-disabled': isEditMode }" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Ke Cabang"
                :model-value="formHeader.keCabang ? `${formHeader.keCabang} - ${formHeader.keCabangNama}` : ''" readonly
                @click="isWorkshopSearchVisible = true" prepend-inner-icon="mdi-magnify" density="compact"
                hide-details />
            </v-col>
            <v-col cols="12">
              <v-textarea label="Keterangan" v-model="formHeader.keterangan" variant="outlined" rows="3"
                density="compact" hide-details />
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
            class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
            <template #[`item.jumlah`]="{ item }">
              <v-text-field v-model.number="item.jumlah" type="number" min="0" variant="underlined" density="compact"
                hide-details class="text-end" :class="getQtyOutClass(item)" />
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>
    <SoSearchModal v-if="isSoSearchVisible" :cabang="authStore.user?.cabang || ''" @close="isSoSearchVisible = false"
      @selected="onSoSelected" />
    <WorkshopSearchModal v-if="isWorkshopSearchVisible" :user-cabang="authStore.user?.cabang || ''"
      @close="isWorkshopSearchVisible = false" @workshop-selected="onWorkshopSelected" />
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
:deep(.qty-error input) {
  color: red !important;
  font-weight: bold;
}

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

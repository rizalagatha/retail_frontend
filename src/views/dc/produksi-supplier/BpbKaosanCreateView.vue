<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import PoSearchModal from '@/components/lookup/PoSearchModal.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data & State ---
interface Item {
  id: number;
  kode: string; nama: string; bahan: string; ukuran: string;
  qtyPO: number; qtyBagus: number; qtyBS: number; jumlah: number;
  sudah: number; kurang: number; hargaBagus: number; hargaBS: number; total: number;
}
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '221';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah BPB Kaosan' : 'Buat BPB Kaosan');
const isLoading = ref(true);
const isSaving = ref(false);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { }, onCancel: () => { dialogConfirm.show = false } });
const isPoSearchVisible = ref(false);
const dialogConfirmCetak = reactive({
  show: false,
  nomor: '',
  onConfirm: () => { },
  onCancel: () => { }
});

const header = reactive({
  nomor: '<--Kosong=Baru',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  nomorPO: '',
  tanggalPO: '',
  referensi: '',
  gudangKode: authStore.user?.cabang || '',
  gudangNama: authStore.user?.cabangNama || '',
  keterangan: '',
  supplierKode: '',
  supplierNama: '',
  alamat: '',
  kota: '',
  totalBPB: 0,
});
const items = ref<Item[]>([]);

const headers = [
  { title: 'No.', key: 'no', sortable: false, width: '40px' },
  { title: 'Nama Barang', key: 'nama', width: '250px' },
  { title: 'Bahan', key: 'bahan', width: '100px' },
  { title: 'Ukuran', key: 'ukuran', width: '100px' },
  { title: 'Qty PO', key: 'qtyPO', width: '90px' },
  { title: 'Qty Bagus', key: 'qtyBagus', width: '120px' },
  { title: 'Qty BS', key: 'qtyBS', width: '120px' },
  { title: 'Qty Terima', key: 'jumlah', width: '110px' },
  { title: 'Sudah', key: 'sudah', width: '90px' },
  { title: 'Kurang', key: 'kurang', width: '90px' },
  { title: 'Harga Bagus', key: 'hargaBagus', width: '130px' },
  { title: 'Harga BS', key: 'hargaBS', width: '130px' },
  { title: 'Total', key: 'total', width: '150px' },
];

// --- Computed Totals (dari hitung) ---
const totalBPB = computed(() => items.value.reduce((sum, item) => sum + (item.total || 0), 0));

// --- Methods ---
const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/bpb-kaosan-form/${nomor}`);
    const { header: dataHeader, items: dataItems } = response.data;
    Object.assign(header, dataHeader);
    items.value = dataItems.map(item => ({ ...item, id: Math.random() }));
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data BPB.');
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const onPoSelected = async (po: { nomor: string }) => {
  isPoSearchVisible.value = false;
  isLoading.value = true;
  try {
    const response = await api.get(`/bpb-kaosan-form/from-po/${po.nomor}`);
    const { header: poHeader, items: poItems } = response.data;
    header.nomorPO = po.nomor;
    header.tanggalPO = poHeader.tanggalPO;
    header.referensi = poHeader.referensi;
    header.supplierKode = poHeader.supplierKode;
    header.supplierNama = poHeader.supplierNama;
    header.alamat = poHeader.alamat;
    header.kota = poHeader.kota;
    items.value = (poItems as Partial<Item>[]).map(item => ({
      ...item,
      id: Math.random(),
      qtyPO: item.qtyPO ?? 0,
      qtyBagus: item.qtyBagus ?? 0,
      qtyBS: item.qtyBS ?? 0,
      jumlah: item.jumlah ?? 0,
      sudah: item.sudah ?? 0,
      kurang: item.kurang ?? 0,
      hargaBagus: item.hargaBagus ?? 0,
      hargaBS: item.hargaBS ?? 0,
      total: item.total ?? 0,
      kode: item.kode ?? '',
      nama: item.nama ?? '',
      bahan: item.bahan ?? '',
      ukuran: item.ukuran ?? ''
    }));
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data PO.');
  } finally {
    isLoading.value = false;
  }
};

const save = () => {
  // Validasi dari btnSimpanClick
  if (!header.nomorPO) return toast.error('Nomor PO belum diisi.');
  const totalQty = items.value.reduce((sum, i) => sum + i.jumlah, 0);
  if (totalQty === 0) return toast.error('Qty Terima belum diisi.');

  showConfirmation('Konfirmasi Simpan', 'Yakin ingin simpan?', executeSave);
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: { ...header, totalBPB: totalBPB.value },
      items: items.value.filter(i => i.jumlah > 0),
      isEdit: isEditMode.value
    };

    const response = isEditMode.value
      ? await api.put(`/bpb-kaosan-form/${route.params.nomor}`, payload)
      : await api.post('/bpb-kaosan-form', payload);

    toast.success(response.data.message);
    const savedNomor = response.data.nomor;

    // Panggil dialog cetak
    dialogConfirmCetak.nomor = savedNomor;
    dialogConfirmCetak.onConfirm = () => {
      const routeData = router.resolve({ name: 'BpbKaosanPrint', params: { nomor: savedNomor } });
      window.open(routeData.href, '_blank');
      router.push({ name: 'BpbKaosan' });
    };
    dialogConfirmCetak.onCancel = () => {
      router.push({ name: 'BpbKaosan' });
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
  dialogConfirm.onConfirm = () => { onConfirm(); dialogConfirm.show = false; };
  dialogConfirm.onCancel = () => { if (onCancel) onCancel(); dialogConfirm.show = false; };
  dialogConfirm.show = true;
};

const resetForm = () => {
  // Logika dari refreshdata
  header.nomor = '<--Kosong=Baru';
  header.nomorPO = '';
  header.tanggalPO = '';
  header.referensi = '';
  header.supplierKode = '';
  header.supplierNama = '';
  header.alamat = '';
  header.kota = '';
  header.tanggal = format(new Date(), 'yyyy-MM-dd');
  header.keterangan = '';
  items.value = [];
};

const handleBatal = () => {
  // Logika dari btnBatalClick
  showConfirmation('Konfirmasi Batal', 'Ingin membatalkan transaksi?', () => {
    if (isEditMode.value) {
      loadDataForEdit(route.params.nomor as string);
    } else {
      resetForm();
    }
  });
};
const handleTutup = () => {
  // Logika dari btntutupClick
  showConfirmation('Konfirmasi Tutup', 'Akan ditutup?', () => {
    router.back();
  });
};

watch(items, (newItems) => {
  newItems.forEach(item => {
    item.jumlah = (item.qtyBagus || 0) + (item.qtyBS || 0);
    item.kurang = (item.qtyPO || 0) - (item.sudah || 0) - item.jumlah;
    item.total = (item.qtyBagus || 0) * (item.hargaBagus || 0) + (item.qtyBS || 0) * (item.hargaBS || 0);
  });
}, { deep: true });

onMounted(async () => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    await loadDataForEdit(nomor);
  }
  isLoading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn color="primary" @click="save" size="small" :loading="isSaving"
        prepend-icon="mdi-content-save">Simpan</v-btn>
      <v-btn @click="handleBatal" size="small" prepend-icon="mdi-refresh">Batal</v-btn>
      <v-btn @click="handleTutup" size="small" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="hide-details">
            <v-col cols="6"><v-text-field label="Nomor" v-model="header.nomor" readonly filled
                density="compact" /></v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                density="compact" /></v-col>
            <v-col cols="6">
              <v-text-field label="Nomor PO (F1)" v-model="header.nomorPO" :readonly="isEditMode"
                append-inner-icon="mdi-magnify" @click:append-inner="isPoSearchVisible = true"
                @keydown.f1.prevent="isPoSearchVisible = true" density="compact" />
            </v-col>
            <v-col cols="6"><v-text-field label="Tgl. PO" v-model="header.tanggalPO" type="date" readonly filled
                density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="No. Referensi" v-model="header.referensi" readonly filled
                density="compact" /></v-col>
            <v-col cols="6"><v-text-field label="Gudang" v-model="header.gudangKode" readonly filled
                density="compact" /></v-col>
            <v-col cols="6"><v-text-field label="Nama Gudang" v-model="header.gudangNama" readonly filled
                density="compact" /></v-col>
            <v-col cols="12"><v-textarea label="Keterangan" v-model="header.keterangan" rows="2" variant="outlined"
                density="compact" /></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section">
          <div class="text-subtitle-1 font-weight-bold mb-2">Supplier</div>
          <v-row dense class="hide-details">
            <v-col cols="6"><v-text-field label="Kode" v-model="header.supplierKode" readonly filled
                density="compact" /></v-col>
            <v-col cols="6"><v-text-field label="Nama" v-model="header.supplierNama" readonly filled
                density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Alamat" v-model="header.alamat" readonly filled
                density="compact" /></v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1;">
          <v-data-table :headers="headers" :items="items" :loading="isLoading" class="desktop-table fill-height"
            density="compact" fixed-header :items-per-page="-1">
            <template #[`item.no`]="{ index }">{{ index + 1 }}</template>

            <!-- Kolom readonly text -->
            <template v-for="col in ['nama', 'bahan', 'ukuran']" :key="col" #[`item.${col}`]="{ item }">
              <td class="readonly-cell">{{ item[col] }}</td>
            </template>

            <!-- Kolom numeric readonly -->
            <template v-for="col in ['qtyPO', 'jumlah', 'sudah', 'kurang', 'total']" :key="col"
              #[`item.${col}`]="{ item }">
              <td class="text-end readonly-cell">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
            </template>

            <!-- Kolom input editable -->
            <template v-for="col in ['qtyBagus', 'qtyBS', 'hargaBagus', 'hargaBS']" :key="col"
              #[`item.${col}`]="{ item }">
              <v-text-field v-model.number="item[col]" type="number" variant="underlined" density="compact" hide-details
                class="text-end" />
            </template>

            <template #bottom></template>
          </v-data-table>
        </div>
        <div class="desktop-form-section d-flex align-center">
          <v-spacer />
          <span class="font-weight-bold me-4">Total BPB:</span>
          <v-text-field :model-value="totalBPB.toLocaleString('id-ID')" readonly filled density="compact" hide-details
            class="text-right font-weight-bold" style="max-width: 250px;" />
        </div>
      </div>
    </div>

    <PoSearchModal v-if="isPoSearchVisible" @close="isPoSearchVisible = false" @select="onPoSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
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
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  display: grid;
  grid-template-columns: 40% 1fr;
  gap: 16px;
  padding: 16px;
}

.left-column .desktop-form-section :deep(.v-label) {
  font-size: 11px !important;
  opacity: 0.9;
  margin-bottom: 2px;
}

.left-column .desktop-form-section :deep(input),
.left-column .desktop-form-section :deep(.v-select__selection-text),
.left-column .desktop-form-section :deep(textarea) {
  font-size: 12px !important;
}

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

.readonly-cell {
  background-color: #f5f5f5;
}
</style>

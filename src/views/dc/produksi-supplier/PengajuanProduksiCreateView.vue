<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import SupplierSearchModal from '@/components/lookup/SupplierSearchModal.vue';
import { AxiosError } from 'axios';

// --- Tipe Data & State ---
interface Item {
  id: number;
  nama: string;
  bahan: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  total: number;
  filegambar: string; // 'Y' (sudah ada) atau '' (kosong/hapus)
  fileObject?: File;  // File baru yang akan di-upload
}
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '217';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Pengajuan Produksi' : 'Buat Pengajuan Produksi');
const isLoading = ref(true);
const isSaving = ref(false);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { }, onCancel: () => { dialogConfirm.show = false; } });
const isSupplierSearchVisible = ref(false);
const dialogConfirmCetak = reactive({
  show: false,
  nomor: '',
  onConfirm: () => { },
  onCancel: () => { }
});

const header = reactive({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
  keterangan: '',
  supplierKode: '',
  supplierNama: '',
  alamat: '',
  telepon: '',
});
const items = ref<Item[]>([]);

const headers = [
  { title: 'No.', key: 'no', sortable: false, width: '40px' },
  { title: 'Nama Barang', key: 'nama', width: '250px' },
  { title: 'Bahan', key: 'bahan', width: '150px' },
  { title: 'Ukuran', key: 'ukuran', width: '120px' },
  { title: 'Jumlah', key: 'jumlah', width: '100px' },
  { title: 'Harga', key: 'harga', width: '120px' },
  { title: 'Total', key: 'total', width: '150px' },
  { title: 'File Upload', key: 'filegambar', sortable: false, width: '250px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

// --- Computed Properties ---
const totalNominal = computed(() => {
  return items.value.reduce((sum, item) => sum + (item.total || 0), 0);
});

// --- Methods ---
const loadDataForEdit = async (nomor: string) => {
  try {
    const response = await api.get(`/pengajuan-produksi-form/${nomor}`);
    Object.assign(header, response.data.header);
    items.value = response.data.items.map(item => ({ ...item, id: Math.random() }));
    addNewRow();
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data.');
  }
};

const onSupplierSelected = (sup: { kode: string, nama: string, alamat: string, kota: string, telp: string }) => {
  header.supplierKode = sup.kode;
  header.supplierNama = sup.nama;
  header.alamat = `${sup.alamat} ${sup.kota}`;
  header.telepon = sup.telp;
  isSupplierSearchVisible.value = false;
};

const addNewRow = () => {
  if (!items.value.some(item => !item.nama)) {
    items.value.push({
      id: Date.now(), nama: '', bahan: '', ukuran: '',
      jumlah: 0, harga: 0, total: 0, filegambar: '',
    });
  }
};
const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
  if (items.value.length === 0) addNewRow();
};
const onFileSelect = (file: File | null, item: Item) => {
  if (file) {
    if (file.size > 1000000) { // Validasi 1MB
      toast.error('Ukuran gambar tidak boleh > 1 Mb.');
      return;
    }
    item.fileObject = file;
    item.filegambar = 'NEW'; // Tandai sebagai file baru
  }
};

const save = () => {
  // Validasi dari btnSimpanClick Delphi
  if (!header.supplierKode) return toast.error('Supplier harus diisi.');
  const validItems = items.value.filter(item => item.nama && item.jumlah > 0);
  if (validItems.length === 0) return toast.error('Detail barang harus diisi.');
  for (const item of validItems) {
    if ((item.harga || 0) === 0) {
      return toast.error(`Harga untuk ${item.nama} harus diisi.`);
    }
  }
  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data pengajuan ini?', executeSave);
};

const executeSave = async () => {
  isSaving.value = true;

  // Gunakan FormData untuk mengirim file
  const formData = new FormData();
  const payload = {
    header,
    items: items.value.filter(item => item.nama && item.jumlah > 0)
  };
  // Kirim data JSON sebagai string
  formData.append('data', JSON.stringify(payload));

  // Lampirkan file-file baru
  payload.items.forEach((item, index) => {
    if (item.fileObject) {
      formData.append(`file_${index}`, item.fileObject);
    }
  });

  try {
    const response = isEditMode.value
      ? await api.put(`/pengajuan-produksi-form/${route.params.nomor}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      : await api.post('/pengajuan-produksi-form', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

    toast.success(response.data.message);
    const savedNomor = response.data.nomor;

    // Panggil dialog cetak
    dialogConfirmCetak.nomor = savedNomor;
    dialogConfirmCetak.onConfirm = () => {
      const routeData = router.resolve({ name: 'PengajuanProduksiPrint', params: { nomor: savedNomor } });
      window.open(routeData.href, '_blank');
      router.push({ name: 'PengajuanProduksi' });
    };
    dialogConfirmCetak.onCancel = () => {
      router.push({ name: 'PengajuanProduksi' });
    };
    dialogConfirmCetak.show = true;
  } catch (err) {
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

const validateUkuran = async (item: Item) => {
  if (!item.ukuran) return; // Jangan validasi jika kosong

  try {
    await api.get(`/pengajuan-produksi-form/validate-ukuran/${item.ukuran}`);
    // Jika berhasil (status 200), tidak terjadi apa-apa
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal validasi ukuran.');
    item.ukuran = ''; // Kosongkan field
  }
};

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
      <v-btn size="small"
        @click="() => showConfirmation('Konfirmasi Batal', 'Batalkan perubahan?', () => router.back())">Batal</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6"><v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact"
                hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="12"><v-text-field label="Cabang" v-model="header.cabang" readonly filled density="compact"
                hide-details /></v-col>
            <v-col cols="12">
              <v-text-field label="Supplier (F1)" v-model="header.supplierKode" density="compact"
                append-inner-icon="mdi-magnify" @click:append-inner="isSupplierSearchVisible = true"
                @keydown.f1.prevent="isSupplierSearchVisible = true" hide-details />
            </v-col>
            <v-col cols="12"><v-text-field label="Nama Supplier" v-model="header.supplierNama" readonly filled
                density="compact" hide-details /></v-col>
            <v-col cols="12"><v-textarea label="Alamat" v-model="header.alamat" rows="2" readonly filled
                density="compact" hide-details /></v-col>
            <v-col cols="12"><v-text-field label="Telepon" v-model="header.telepon" readonly filled density="compact"
                hide-details /></v-col>
            <v-col cols="12"><v-textarea label="Keterangan" v-model="header.keterangan" rows="3" variant="outlined"
                density="compact" hide-details /></v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1;">
          <v-data-table :headers="headers" :items="items" :loading="isLoading" class="desktop-table fill-height"
            density="compact" fixed-header :items-per-page="-1">
            <template #[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>

            <template v-for="col in ['nama', 'bahan', 'ukuran']" :key="col" #[`item.${col}`]="{ item }">
              <v-text-field v-model="item[col]" variant="underlined" density="compact" hide-details
                v-if="col !== 'ukuran'" />
              <v-text-field v-model="item.ukuran" variant="underlined" density="compact" hide-details
                @blur="validateUkuran(item)" v-else />
            </template>

            <template v-for="col in ['jumlah', 'harga']" :key="col" #[`item.${col}`]="{ item }">
              <v-text-field v-model.number="item[col]" type="number" variant="underlined" density="compact" hide-details
                class="text-end" @update:modelValue="item.total = item.jumlah * item.harga" />
            </template>

            <template #[`item.total`]="{ item }">
              <td class="text-end">{{ (item.total || 0).toLocaleString('id-ID') }}</td>
            </template>

            <template #[`item.filegambar`]="{ item }">
              <v-file-input :label="item.filegambar === 'Y' ? 'Ganti File?' : 'Upload File'"
                @change="(e) => onFileSelect(e.target.files[0], item)" variant="underlined" density="compact"
                hide-details clearable @click:clear="item.filegambar = ''; item.fileObject = undefined">
                <template v-slot:prepend-inner>
                  <v-icon v-if="item.filegambar === 'Y'" color="success">mdi-check-circle</v-icon>
                </template>
              </v-file-input>
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn v-if="item.nama" icon="mdi-delete" size="x-small" variant="text" color="error"
                @click="removeRow(item.id)" />
            </template>
            <template #bottom>
              <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus" class="ma-2">Tambah Baris</v-btn>
            </template>
          </v-data-table>
        </div>
        <div class="desktop-form-section d-flex align-center">
          <v-spacer />
          <span class="font-weight-bold me-4">Total:</span>
          <v-text-field :model-value="totalNominal.toLocaleString('id-ID')" readonly filled density="compact"
            hide-details class="text-right font-weight-bold" style="max-width: 250px;" />
        </div>
      </div>
    </div>

    <SupplierSearchModal v-if="isSupplierSearchVisible" @close="isSupplierSearchVisible = false"
      @supplier-selected="onSupplierSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}></v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal"
            @click="() => { dialogConfirm.onConfirm(); dialogConfirm.show = false; }">Ya</v-btn>
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

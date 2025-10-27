<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data & State ---
interface Header {
  nomor: string;
  tanggal: string;
  cabang: string;
  keterangan: string;
  supplierKode: string;
  supplierNama: string;
  alamat: string;
  telepon: string;
  approved: string;
  tglApprove: string;
  isApproved: boolean; // Checkbox header
}
interface Item {
  id: number;
  no: number;
  nama: string;
  bahan: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  total: number;
  approved: boolean; // Checkbox detail
}
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '218';

const isLoading = ref(true);
const isSaving = ref(false);
const pageTitle = ref('Approve Pengajuan Produksi');
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
  onCancel: () => { dialogConfirm.show = false; } // <-- 3. Tambahkan onCancel default
});

const header = reactive<Header>({
  nomor: '', tanggal: '', cabang: '', keterangan: '', supplierKode: '',
  supplierNama: '', alamat: '', telepon: '', approved: '',
  tglApprove: format(new Date(), 'yyyy-MM-dd'), isApproved: false
});
const items = ref<Item[]>([]);
const isDataLoading = ref(true); // Untuk flag 'xLoad' Delphi

const headers = [
  { title: 'No.', key: 'no', sortable: false, width: '40px' },
  { title: 'Approve', key: 'approved', sortable: false, width: '80px' },
  { title: 'Nama Barang', key: 'nama', width: '250px' },
  { title: 'Bahan', key: 'bahan', width: '150px' },
  { title: 'Ukuran', key: 'ukuran', width: '120px' },
  { title: 'Jumlah', key: 'jumlah', width: '100px' },
  { title: 'Harga', key: 'harga', width: '120px' },
  { title: 'Total', key: 'total', width: '150px' },
];

// --- Methods ---
const loadData = async (nomor: string) => {
  isLoading.value = true;
  isDataLoading.value = true;
  try {
    const response = await api.get(`/approve-pengajuan-form/${nomor}`);
    Object.assign(header, response.data.header);
    items.value = response.data.items;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat data.');
    router.back();
  } finally {
    isLoading.value = false;
    isDataLoading.value = false;
  }
};

const save = () => {
  // Validasi dari btnSimpanClick Delphi
  const itemsApproved = items.value.some(item => item.approved);
  if (header.isApproved && !itemsApproved) {
    showConfirmation(
      'Konfirmasi Simpan',
      'Tidak ada item yang diapprove. Yakin akan dilanjutkan?',
      executeSave
    );
  } else {
    showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan approval ini?', executeSave);
  }
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = { header, items: items.value };
    const response = await api.put(`/approve-pengajuan-form/${route.params.nomor}`, payload);
    toast.success(response.data.message);
    router.push({ name: 'ApprovePengajuanProduksi' });
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
    if (onCancel) onCancel(); // Jalankan callback onCancel jika ada
    dialogConfirm.show = false;
  };
  dialogConfirm.show = true;
};

const handleBatal = () => {
  showConfirmation('Konfirmasi Batal', 'Akan membatalkan perubahan dan memuat ulang data asli. Lanjutkan?', () => {
    loadData(route.params.nomor as string);
  });
};

const handleTutup = () => {
  showConfirmation('Konfirmasi Tutup', 'Tutup form? Perubahan yang belum disimpan akan hilang.', () => {
    router.back();
  });
};

// --- Watchers (Logika dari ckapvClick & clapprovedPropertiesEditValueChanged) ---
watch(() => header.isApproved, (newValue) => {
  // Abaikan jika sedang proses loading data awal
  if (isDataLoading.value) return;

  isDataLoading.value = true;

  if (newValue) {
    // --- Logika jika ckapv.Checked = true (MENG-APPROVE) ---

    // PERBAIKAN: Hanya isi 'approved' jika fieldnya masih kosong.
    // Jika sudah ada (dari load data), biarkan nama approver yang lama.
    if (!header.approved) {
      header.approved = authStore.user?.kode || 'USER';
    }

    // Ceklis semua item
    items.value.forEach(item => item.approved = true);

    // Selesai operasi, kembalikan flag
    setTimeout(() => { isDataLoading.value = false; }, 50);

  } else {
    // --- Logika jika ckapv.Checked = false (MEMBATALKAN APPROVE) ---

    // Cek jika ada item yang masih di-check ATAU header sudah punya nama approver
    const anyItemChecked = items.value.some(item => item.approved);
    if (anyItemChecked || header.approved) {

      // Tampilkan konfirmasi "Batalkan Verifikasi?"
      showConfirmation(
        'Batalkan Verifikasi?',
        'Anda yakin ingin membatalkan verifikasi ini? Semua item akan di-uncheck.',
        () => {
          // Aksi jika "Ya" (onConfirm): Kosongkan semua
          header.approved = '';
          items.value.forEach(item => item.approved = false);
          isDataLoading.value = false;
        },
        () => {
          // Aksi jika "Tidak" (onCancel): KEMBALIKAN KE CHECKED
          header.isApproved = true;
          isDataLoading.value = false;
        }
      );
    } else {
      // Jika tidak ada yang di-check, langsung uncheck saja
      header.approved = '';
      items.value.forEach(item => item.approved = false);
      isDataLoading.value = false;
    }
  }
});

watch(items, (newItems) => {
  if (isDataLoading.value) return;
  // Jika ada item yang di-ceklist, pastikan header juga ter-ceklist
  if (newItems.some(item => item.approved)) {
    if (!header.isApproved) {
      isDataLoading.value = true; // Set flag xLoad
      header.isApproved = true;
      header.approved = authStore.user?.kode || 'USER';
      setTimeout(() => { isDataLoading.value = false; }, 100);
    }
  }
}, { deep: true });


onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    loadData(nomor);
  } else {
    toast.error('Nomor pengajuan tidak valid.');
    router.back();
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn color="primary" size="small" @click="save" :loading="isSaving"
        prepend-icon="mdi-content-save">Simpan</v-btn>
      <v-btn size="small" @click="handleBatal" prepend-icon="mdi-refresh">Batal</v-btn>
      <v-btn size="small" @click="handleTutup" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="hide-details">
            <v-col cols="12"><v-text-field label="Nomor" v-model="header.nomor" readonly filled
                density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" readonly filled
                density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Cabang" v-model="header.cabang" readonly filled
                density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Keterangan" v-model="header.keterangan" readonly filled
                density="compact" /></v-col>
          </v-row>
          <v-divider class="my-4" />
          <v-row dense class="hide-details">
            <v-col cols="12"><v-text-field label="Supplier" v-model="header.supplierNama" readonly filled
                density="compact" /></v-col>
            <v-col cols="12"><v-textarea label="Alamat" v-model="header.alamat" rows="2" readonly filled
                density="compact" /></v-col>
            <v-col cols="12"><v-text-field label="Telepon" v-model="header.telepon" readonly filled
                density="compact" /></v-col>
          </v-row>
          <v-divider class="my-4" />
          <v-row dense class="hide-details">
            <v-col cols="12">
              <v-checkbox-btn v-model="header.isApproved" label="Approve Pengajuan" color="primary" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Tanggal Approve" v-model="header.tglApprove" type="date" variant="outlined"
                density="compact" :disabled="!header.isApproved" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Approved By" v-model="header.approved" readonly filled density="compact" />
            </v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1;">
          <v-data-table :headers="headers" :items="items" :loading="isLoading" class="desktop-table fill-height"
            density="compact" fixed-header :items-per-page="-1" show-select v-model-select="items" item-value="id"
            select-strategy="page">
            <template #[`item.no`]="{ item }">
              {{ item.no }}
            </template>
            <template #[`item.approved`]="{ item }">
              <v-checkbox-btn v-model="item.approved" density="compact" hide-details />
            </template>
            <template v-for="col in ['jumlah', 'harga', 'total']" #[`item.${col}`]="{ item }" :key="col">
              <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
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
          <v-spacer />
          <v-btn text @click="dialogConfirm.onCancel">
            {{ (dialogConfirm.title === 'Konfirmasi Simpan' || dialogConfirm.title === 'Konfirmasi Batal') ? 'Batal' :
              'Tidak' }}
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm">
            Ya
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* (Salin style dari MutasiAntarGudangFormView, tambahkan .hide-details) */
.hide-details :deep(.v-input__details) {
  display: none;
}
</style>

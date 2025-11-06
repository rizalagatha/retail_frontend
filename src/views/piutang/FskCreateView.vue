<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import { isAxiosError } from 'axios';

interface Detail1 {
  jenis: string;
  tgltrf: string;
  kdcus: string;
  nmcus: string;
  alamat: string;
  inv: string;
  nomor: string;
  nominal: number;
}

interface Detail2 {
  jenis: string;
  nominal: number;
  nominalv: number;
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '54';

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
// const pageTitle = computed(() => isEditMode.value ? 'Ubah Form Setoran Kasir' : 'Buat Form Setoran Kasir');
const totalNominalSetor = computed(() => {
  // Gunakan .reduce() untuk menjumlahkan semua nilai 'nominal' di tabel rekapitulasi
  return details2.value.reduce((sum, item) => sum + (item.nominal || 0), 0);
});
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const header = reactive({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  cabang: authStore.user?.cabang || '',
  dibuatOleh: authStore.user?.kode || '',
  diverifikasiOleh: '',
  tglVerifikasi: '',
});

const details1 = ref<Detail1[]>([]);
const details2 = ref<Detail2[]>([]);

const isLoading = ref(false);
const isSaving = ref(false);
const isDataLoaded = ref(false); // Untuk menandai jika data sudah diload
const isVerified = ref(false); // Untuk menandai jika sudah diverifikasi finance

const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

// --- Konfigurasi Tabel ---
const tableHeaders1 = [
  { title: 'Jenis Setoran', key: 'jenis' },
  { title: 'Tgl Transfer/Giro', key: 'tgltrf' },
  { title: 'Kd. Cus', key: 'kdcus' },
  { title: 'Nama Customer', key: 'nmcus' },
  { title: 'Alamat', key: 'alamat' },
  { title: 'No. Invoice', key: 'inv' },
  { title: 'No. Setor', key: 'nomor' },
  { title: 'Nominal', key: 'nominal', align: 'end' },
] as const;
const tableHeaders2 = [
  { title: 'Jenis Setoran', key: 'jenis' },
  { title: 'Total Nominal Setor', key: 'nominal', align: 'end' },
  { title: 'Nominal Verifikasi', key: 'nominalv', align: 'end' },
] as const;

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

// --- Methods ---
const loadData = async () => {
  isLoading.value = true;
  isDataLoaded.value = false;
  try {
    let response;
    if (isEditMode.value) {
      const nomor = route.params.nomor as string;
      response = await api.get(`/fsk-form/${nomor}`);
      const data = response.data;
      // Isi header
      header.nomor = data.header.nomor;
      header.tanggal = format(parseISO(data.header.tanggal), 'yyyy-MM-dd');
      header.dibuatOleh = data.header.createdBy;
      header.diverifikasiOleh = data.header.verifiedBy;
      header.tglVerifikasi = data.header.verifiedDate ? format(parseISO(data.header.verifiedDate), 'dd-MM-yyyy') : '';
      isVerified.value = !!data.header.verifiedBy;
    } else {
      response = await api.get('/fsk-form/load-initial', { params: { tanggal: header.tanggal } });
    }

    details1.value = response.data.details1;
    details2.value = response.data.details2.map((d: Partial<Detail2>) => ({
      ...d,
      nominalv: d.nominalv ?? d.nominal ?? 0,
    })) as Detail2[]; // Pre-fill nominal verifikasi
    isDataLoaded.value = true;

    if (isVerified.value) {
      toast.warning('Data ini sudah diverifikasi dan tidak bisa diubah.');
    }

  } catch (error: unknown) {
    if (isAxiosError(error)) {
      toast.error(error.response?.data?.message || 'Gagal memuat data.');
    } else {
      toast.error('Gagal memuat data.');
    }
  } finally {
    isLoading.value = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: header,
      details1: details1.value,
      details2: details2.value,
      isNew: !isEditMode.value
    };
    const response = await api.post('/fsk-form/save', payload);
    toast.success(response.data.message);

    // --- ARAHKAN KE HALAMAN CETAK ---
    const nomorFSK = response.data.nomor;
    const url = router.resolve({ name: 'FskPrint', params: { nomor: nomorFSK } }).href;
    window.open(url, '_blank');

    router.push({ name: 'Fsk' });
  } catch (error: unknown) { // [PERBAIKAN] Tambahkan penanganan error
    if (isAxiosError(error)) {
      toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } else {
      toast.error('Gagal menyimpan data.');
    }
  } finally {
    isSaving.value = false;
  }
};

const handleSave = () => {
  if (details1.value.length === 0) {
    return toast.error('Tidak ada data setoran untuk disimpan.');
  }
  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan Form Setoran Kasir ini?', executeSave);
};

const handleClose = () => {
  // Tambahkan dialog konfirmasi untuk tombol Tutup
  showConfirmation('Konfirmasi Tutup', 'Data yang belum disimpan akan hilang. Yakin ingin menutup form?', () => {
    router.push({ name: 'Fsk' });
  });
};

onMounted(() => {
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data FSK.`);
    router.push({ name: 'Fsk' }); // Arahkan kembali ke halaman browse
    return;
  }
  if (isEditMode.value) {
    loadData();
  } else {
    isLoading.value = false; // Mode baru, tunggu user klik "Refresh"
  }
});
</script>

<template>
  <PageLayout title="Form Setoran Kasir" desktop-mode icon="mdi-cash-multiple">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="handleSave" :loading="isSaving"
        :disabled="!isDataLoaded || isVerified || !authStore.can(MENU_ID, requiredPermission)"
        prepend-icon="mdi-content-save">
        Simpan
      </v-btn>
      <v-btn size="small" @click="handleClose" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact" hide-details>
            <template #append-inner><span v-if="!isEditMode" class="text-caption">&lt;Baru&gt;</span></template>
          </v-text-field>
          <v-text-field label="Tanggal Setor" v-model="header.tanggal" type="date" variant="outlined" density="compact"
            hide-details :readonly="isEditMode" />
          <v-text-field label="Store" v-model="header.cabang" readonly filled density="compact" hide-details />
          <v-text-field label="Dibuat Oleh" v-model="header.dibuatOleh" readonly filled density="compact"
            hide-details />
          <v-text-field label="Total Nominal Setor" :model-value="formatRupiah(totalNominalSetor)" readonly filled
            density="compact" hide-details />
          <v-text-field v-if="isEditMode" label="Diverifikasi" v-model="header.diverifikasiOleh" readonly filled
            density="compact" hide-details />
          <v-text-field v-if="isEditMode" label="Tgl Verifikasi" v-model="header.tglVerifikasi" readonly filled
            density="compact" hide-details />
        </div>
        <v-btn @click="loadData" :loading="isLoading" prepend-icon="mdi-refresh" color="primary" class="mt-4">
          {{ isEditMode ? 'Muat Ulang' : 'Load Data Harian' }}
        </v-btn>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex: 3 1 0;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Rincian Setoran</div>
          <v-data-table :headers="tableHeaders1" :items="details1" density="compact"
            class="desktop-table fill-height-table" :items-per-page="-1" :loading="isLoading">
            <template #[`item.nominal`]="{ item }">
              {{ formatRupiah(item.nominal) }}
            </template>

            <template #[`item.tgltrf`]="{ item }">
              {{ item.tgltrf ? format(parseISO(item.tgltrf), 'dd/MM/yyyy') : '' }}
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
        <div class="desktop-form-section d-flex flex-column" style="flex: 1 1 0;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Rekapitulasi Setoran</div>
          <v-data-table :headers="tableHeaders2" :items="details2" density="compact" class="desktop-table"
            :items-per-page="-1" :loading="isLoading">
            <template #[`item.nominal`]="{ item }">
              {{ formatRupiah(item.nominal) }}
            </template>

            <template #[`item.nominalv`]="{ item }">
              {{ formatRupiah(item.nominalv) }}
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
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import TransactionSearchModal from '@/components/lookup/TransactionSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useRoute } from 'vue-router';
import { format, addDays, parseISO, isValid } from 'date-fns';
import axios, { AxiosError } from 'axios';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = '55';
const API_BASE_PATH = '/refund-form';

// --- Interfaces (Disesuaikan dari Delphi CDS) ---
interface RefundDetail {
  id: number;
  nomor: string; // rfd_notrs
  tanggal: string;
  kdcus: string; // rfd_cus_kode
  customer: string; // cus_nama
  nominal: number; // rfd_nominal (Saldo)
  refund: number; // rfd_refund (Jumlah refund)
  apv: boolean;
  ket: string; // rfd_ket
  iddrec: string; // rfd_iddrec
  bank: string; // rfd_bank
  norek: string; // rfd_norek
  atasnama: string; // rfd_atasnama
}

interface RefundHeader {
  nomor: string; // rf_nomor
  tanggal: string; // rf_tanggal
  userCreate: string; // user_create
  userApv: string; // rf_acc
  isProcessed: boolean; // ckProses
  isApproved: boolean; // ckApv
  keterangan: string;
}

// --- State (Disesuaikan dari Form Delphi) ---
const header = ref<RefundHeader>({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  userCreate: authStore.user?.username || '',
  userApv: '',
  isProcessed: false,
  isApproved: false,
  keterangan: '',
});

const items = ref<RefundDetail[]>([]);

// State untuk Kontrol UI
const isTransactionSearchVisible = ref(false);
const activeRowIndex = ref(0);
const searchType = ref<'invoice' | 'deposit'>('invoice'); // F1 atau F2
const isSaving = ref(false);
const isLoading = ref(true);
const isDataLoading = ref(false);
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
  onCancel: () => { dialogConfirm.show = false; }
});
const dialogConfirmCetak = reactive({
  show: false,
  nomor: '',
  onConfirm: () => { },
  onCancel: () => { }
});

// Komputasi Sisa Saldo (Analogi total refund yang diajukan)
const totalRefund = computed(() => {
  return items.value
    .filter(item => item.nomor)
    .reduce((sum, item) => sum + (Number(item.refund) || 0), 0);
});

// Komputasi Izin Aproval (Analogi zAccKor di Delphi)
const isApprover = computed(() => authStore.user?.cabang === 'KDC');
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value
    ? `Ubah Refund: ${header.value?.nomor || ''}`
    : 'Pengajuan Refund'
);
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const tableHeaders = [
  { title: 'No. Transaksi', key: 'nomor', width: '150px' },
  { title: 'Customer', key: 'customer', width: '200px' },
  { title: 'Nominal Saldo', key: 'nominal', align: 'end', width: '120px' },
  { title: 'Refund (Rp)', key: 'refund', align: 'end', width: '120px' },
  { title: 'APV', key: 'apv', width: '50px' },
  { title: 'Bank', key: 'bank', width: '120px' },
  { title: 'No. Rekening', key: 'norek', width: '120px' },
  { title: 'Atas Nama', key: 'atasnama', width: '150px' },
  { title: 'Keterangan', key: 'ket', width: '250px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '40px' },
] as const;


// --- Methods Logic (Mencerminkan Delphi) ---
const showConfirmation = (title: string, text: string, onConfirm: () => void, onCancel?: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = () => { onConfirm(); dialogConfirm.show = false; };
  dialogConfirm.onCancel = () => { if (onCancel) onCancel(); dialogConfirm.show = false; };
  dialogConfirm.show = true;
};

// Inisialisasi/Reset Form
const initForm = async () => {
  header.value = {
    nomor: '',
    tanggal: format(new Date(), 'yyyy-MM-dd'),
    userCreate: authStore.user?.username || '',
    userApv: '',
    isProcessed: false,
    isApproved: false,
    keterangan: '',
  };
  items.value = [];
  addNewRow();
};

// Logika penambahan baris (Analogi initgrid dan append di CDS)
const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.nomor) {
    items.value.push({
      id: Date.now() + Math.random(),
      nomor: '', tanggal: '', kdcus: '', customer: '',
      nominal: 0, refund: 0, apv: false, ket: '',
      iddrec: '', bank: '', norek: '', atasnama: '',
    });
  }
};

// Logika Load Data (Analogi loaddataall)
const loadRefundData = async (nomor: string) => {
  isLoading.value = true;
  isDataLoading.value = true;
  try {
    // Panggil API yang benar (dari prompt sebelumnya)
    const response = await api.get(`${API_BASE_PATH}/${nomor}`);

    // --- PERBAIKAN DI SINI ---
    // Backend mengirim { header, details }, bukan { headerData, detailsData }
    const { header: dataHeader, details: dataDetails } = response.data;

    if (dataHeader) {
      isEditMode.value = true;

      // Gunakan Object.assign untuk memperbarui ref, BUKAN menggantinya
      Object.assign(header.value, dataHeader);

      items.value = dataDetails.map((item: any) => ({
        ...item,
        id: Math.random(), // Buat ID unik untuk v-for
      }));

      addNewRow();
      toast.success(`Data refund ${nomor} berhasil dimuat.`);
    } else {
      toast.error('Data header tidak ditemukan dalam respons.');
      router.push({ name: 'RefundCreate' });
    }
    // --- AKHIR PERBAIKAN ---

  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal memuat data refund.');
    router.push({ name: 'RefundCreate' }); // Kembali ke form kosong
  } finally {
    isLoading.value = false;
    isDataLoading.value = false;
  }
};

// Handler F1 (Pencarian Invoice dengan Saldo Negatif)
const openSearchInvoice = (index: number) => {
  if (header.value.isApproved || isApprover.value) return;
  activeRowIndex.value = index;
  searchType.value = 'invoice';
  isTransactionSearchVisible.value = true;
};

// Handler F2 (Pencarian Setoran dengan Saldo Positif/Lebih Bayar)
const openSearchDeposit = (index: number) => {
  if (header.value.isApproved || isApprover.value) return;
  activeRowIndex.value = index;
  searchType.value = 'deposit';
  isTransactionSearchVisible.value = true;
};

// Logika untuk mengisi data setelah pencarian (Analogi F1/F2 result processing)
const onTransactionSelected = (selectedTransaction: any) => {
  isTransactionSearchVisible.value = false;
  const existingItem = items.value.find(item => item.nomor === selectedTransaction.Nomor);
  if (existingItem) {
    toast.warning(`Nomor transaksi ${selectedTransaction.Nomor} sudah ada.`);
    return;
  }
  const item = items.value[activeRowIndex.value];
  if (item) {
    item.nomor = selectedTransaction.Nomor;
    item.tanggal = selectedTransaction.Tanggal;
    item.kdcus = selectedTransaction.Kdcus;
    item.customer = selectedTransaction.Customer;
    item.nominal = Math.abs(selectedTransaction.Sisa);
    item.iddrec = `${authStore.user?.cabang || 'K01'}RF${Date.now()}`;
  }
  addNewRow();
};

// Logika persetujuan per baris (Analogi clapvPropertiesEditValueChanged)
const handleLineItemApproval = (item: RefundDetail) => {
  // Logika clapvPropertiesEditValueChanged
  if (item.apv) {
    item.refund = item.nominal;
  } else {
    item.refund = 0;
  }
  updateHeaderApprovalStatus();
};

// Logika Cek Approval Header (Analogi cekapv)
const updateHeaderApprovalStatus = () => {
  // Logika cekapv
  const anyApproved = items.value.some(item => item.apv);
  if (anyApproved) {
    header.value.isApproved = true;
  } else {
    header.value.isApproved = false;
  }
};

const removeRow = (id: number) => {
  if (isApprover.value || header.value.isApproved) return;
  items.value = items.value.filter(i => i.id !== id);
  if (items.value.length === 0) addNewRow();
  updateHeaderApprovalStatus();
};


// Logika Simpan (Analogi simpandata dan btnSimpanClick)
const save = () => {
  // Validasi dari btnSimpanClick
  const validItems = items.value.filter(item => item.nomor);
  if (validItems.length === 0) {
    toast.error('Detail transaksi harus diisi minimal 1 baris.');
    return;
  }

  if (isApprover.value) {
    // Validasi Approver
    for (const item of validItems) {
      if (item.apv && item.refund <= 0) return toast.error(`Refund untuk ${item.nomor} harus > 0.`);
      if (item.apv && item.refund > item.nominal) return toast.error(`Refund ${item.nomor} melebihi saldo.`);
      if (item.apv && (!item.bank || !item.norek || !item.atasnama)) return toast.error(`Detail Bank ${item.nomor} wajib diisi.`);
    }
    if (header.value.isApproved && !validItems.some(i => i.apv)) {
      showConfirmation(
        'Konfirmasi Simpan',
        'Tidak ada item yang diapprove. Yakin akan dilanjutkan?',
        executeSave
      );
      return;
    }
  }

  showConfirmation('Konfirmasi Simpan', 'Yakin ingin simpan?', executeSave);
};

// Metode Konfirmasi dan Pembatalan (Analogi MessageDlg)
const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header: header.value,
      details: items.value.filter(item => item.nomor),
      isNew: !isEditMode.value,
      isApprover: isApprover.value,
    };

    const response = isEditMode.value
      ? await api.put(`${API_BASE_PATH}/${header.value.nomor}`, payload)
      : await api.post(`${API_BASE_PATH}/`, payload);

    toast.success(response.data.message);
    const savedNomor = response.data.nomor;

    // Panggil dialog cetak
    dialogConfirmCetak.nomor = savedNomor;
    dialogConfirmCetak.onConfirm = () => {
      const routeData = router.resolve({ name: 'RefundPrint', params: { nomor: savedNomor } });
      window.open(routeData.href, '_blank');
      router.push({ name: 'RefundBrowse' });
    };
    dialogConfirmCetak.onCancel = () => {
      router.push({ name: 'RefundBrowse' });
    };
    dialogConfirmCetak.show = true;

  } catch (error: any) {
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const handleBatal = () => {
  showConfirmation('Konfirmasi Batal', 'Akan membatalkan perubahan?', () => {
    if (isEditMode.value) loadRefundData(route.params.nomor as string);
    else initForm();
  });
};

const handleTutup = () => {
  showConfirmation('Konfirmasi Tutup', 'Tutup form? Perubahan yang belum disimpan akan hilang.', () => {
    router.back();
  });
};

// --- Watchers & Lifecycle ---
watch(items, updateHeaderApprovalStatus, { deep: true }); // Update header APV jika ada perubahan detail

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    loadRefundData(nomor);
  } else {
    initForm();
  }
  isLoading.value = false;
});

</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-cash-refund">
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
                density="compact" :readonly="isApprover" /></v-col>
            <v-col cols="6"><v-text-field label="User Pengaju" v-model="header.userCreate" readonly filled
                density="compact" /></v-col>
            <v-col cols="6"><v-text-field label="User Approval" v-model="header.userApv" readonly filled
                density="compact" /></v-col>
            <v-col cols="6"><v-checkbox label="Proses" v-model="header.isProcessed" density="compact" hide-details
                :disabled="!isApprover" /></v-col>
            <v-col cols="6"><v-checkbox label="Approve" v-model="header.isApproved" density="compact" hide-details
                :disabled="!isApprover" /></v-col>
            <v-col cols="12"><v-textarea label="Keterangan" v-model="header.keterangan" rows="3" variant="outlined"
                density="compact" :readonly="isApprover" /></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section">
          <div class="text-subtitle-1 font-weight-bold text-success mb-2">Ringkasan</div>
          <v-text-field label="Total Refund Diajukan" :model-value="totalRefund.toLocaleString('id-ID')" readonly filled
            density="compact" hide-details class="text-right font-weight-bold text-h6" />
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1;">
          <div class="text-subtitle-1 font-weight-bold mb-2">Detail Transaksi (F1=Invoice, F2=Deposit)</div>
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" class="desktop-table fill-height"
            density="compact" fixed-header :items-per-page="-1">
            <template #item.nomor="{ item, index }">
              <v-text-field v-model="item.nomor" variant="underlined" density="compact" hide-details
                placeholder="F1/F2..." @keydown.f1.prevent="openSearchInvoice(index)"
                @keydown.f2.prevent="openSearchDeposit(index)"
                :readonly="!!item.nomor || isApprover || header.isApproved" />
            </template>
            <template #item.nominal="{ item }">
              <td class="text-end">{{ (item.nominal || 0).toLocaleString('id-ID') }}</td>
            </template>
            <template #item.refund="{ item }">
              <v-text-field v-model.number="item.refund" type="number" variant="underlined" density="compact"
                hide-details class="text-end" :disabled="!isApprover || !item.apv" :readonly="!item.apv"
                :max="item.nominal" min="0" />
            </template>
            <template #item.apv="{ item }">
              <v-checkbox-btn v-model="item.apv" density="compact" hide-details
                :disabled="!isApprover || header.isApproved || !item.nomor" @change="handleLineItemApproval(item)" />
            </template>
            <template #item.bank="{ item }"><v-text-field v-model="item.bank" variant="underlined" density="compact"
                hide-details :disabled="!isApprover || !item.apv" /></template>
            <template #item.norek="{ item }"><v-text-field v-model="item.norek" variant="underlined" density="compact"
                hide-details :disabled="!isApprover || !item.apv" /></template>
            <template #item.atasnama="{ item }"><v-text-field v-model="item.atasnama" variant="underlined"
                density="compact" hide-details :disabled="!isApprover || !item.apv" /></template>
            <template #item.ket="{ item }"><v-text-field v-model="item.ket" variant="underlined" density="compact"
                hide-details :disabled="isApprover" /></template>
            <template #item.actions="{ item, index }">
              <v-btn v-if="item.nomor && !isApprover && !header.isApproved" icon="mdi-delete" size="x-small"
                variant="text" color="error" @click="showConfirmation(() => removeRow(index), 'Hapus baris ini?')" />
            </template>
            <template #bottom>
              <v-btn v-if="!isApprover && !header.isApproved" size="small" @click="addNewRow" prepend-icon="mdi-plus"
                class="ma-2">Tambah Baris</v-btn>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <TransactionSearchModal v-if="isTransactionSearchVisible" :searchType="searchType"
      :cabang="authStore.user?.cabang || 'K01'" @close="isTransactionSearchVisible = false"
      @selected="onTransactionSelected" />

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
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  display: grid;
  grid-template-columns: 35% 1fr;
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

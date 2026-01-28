<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import TransactionSearchModal from '@/components/lookup/TransactionSearchModal.vue';
import SoSearchModal from '@/components/lookup/SoSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useRoute } from 'vue-router';
import { format } from 'date-fns';
import axios from 'axios';

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

interface Transaction {
  Nomor: string;
  Tanggal: string;
  Kdcus: string;
  Customer: string;
  Sisa: number;
}

interface SoSearchResult {
  Nomor: string;
  Tanggal: string;
  KdCus: string;
  Customer: string;
  // field lain dari backend: Alamat, Kota, qtyso, qtyinv
}

interface RefundApiDetail {
  nomor: string;
  tanggal: string;
  kdcus: string;
  customer: string;
  nominal: number;
  refund: number;
  apv: boolean | number | string; // Fleksibel untuk berbagai format DB
  ket: string;
  iddrec: string;
  bank: string;
  norek: string;
  atasnama: string;
}

// --- State (Disesuaikan dari Form Delphi) ---
const header = ref<RefundHeader>({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  userCreate: authStore.user?.kode || '',
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
const isEditMode = ref(false);
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
const isSoSearchVisible = ref(false);

// Komputasi Sisa Saldo (Analogi total refund yang diajukan)
const totalRefund = computed(() => {
  return items.value
    .filter(item => item.nomor)
    .reduce((sum, item) => sum + (Number(item.refund) || 0), 0);
});

// Komputasi Izin Aproval (Analogi zAccKor di Delphi)
const isApprover = computed(() => {
  // Opsi A: Jika backend sudah diupdate dan user sudah login ulang
  if (authStore.user?.canApproveRefund) return true;

  // Opsi B: Hardcode di frontend sebagai backup (jika user belum relogin)
  const allowedUsers = ['DARUL', 'LIA', 'HANI', 'DEVI'];
  const currentUser = authStore.user?.kode?.toUpperCase() || '';
  return allowedUsers.includes(currentUser);
});

const pageTitle = computed(() =>
  isEditMode.value
    ? `Ubah Refund: ${header.value?.nomor || ''}`
    : 'Pengajuan Refund'
);
const canView = computed(() => authStore.can(MENU_ID, 'view'));
const canInsert = computed(() => authStore.can(MENU_ID, 'insert'));
const canEdit = computed(() => authStore.can(MENU_ID, 'edit'));
// Izin simpan bergantung pada mode dan apakah user adalah approver atau bukan
const canSave = computed(() => {
  // Jika Approver, mereka bisa 'edit' (meskipun hanya checkbox APV/Refund/Bank)
  if (isApprover.value) return canEdit.value;
  // Jika bukan Approver, mereka bisa 'insert' (baru) atau 'edit' (jika belum diapprove)
  return isEditMode.value ? (canEdit.value && !header.value.isApproved) : canInsert.value;
});
// Izin approve hanya jika KDC DAN punya hak edit
const canApprove = computed(() => isApprover.value && canEdit.value);

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
    userCreate: authStore.user?.nama || '',
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
// 1. Logika saat data dimuat (SAMA PERSIS DELPHI loaddataall)
const loadRefundData = async (nomor: string) => {
  isLoading.value = true;
  isDataLoading.value = true;
  try {
    const response = await api.get(`${API_BASE_PATH}/${nomor}`);
    const { header: dataHeader, details: dataDetails } = response.data;

    Object.assign(header.value, dataHeader);

    items.value = (dataDetails || []).map((item: RefundApiDetail) => ({
      ...item,
      id: Math.random(),
      // Lakukan normalisasi tipe data di sini
      apv: item.apv === true || item.apv === 1 || item.apv === 'Y',
    }));

    addNewRow();

    toast.success(`Data refund ${nomor} berhasil dimuat.`);
  } catch (error: unknown) {
    let msg = 'Gagal memuat data.';

    // 1. Cek apakah error berasal dari Axios
    if (axios.isAxiosError<{ message: string }>(error)) {
      // Sekarang TypeScript tahu 'error' adalah AxiosError
      // Kita juga mendefinisikan bahwa data response memiliki properti 'message'
      msg = error.response?.data?.message || error.message || msg;
    }
    // 2. Cek apakah error standar Javascript (misal: logic error)
    else if (error instanceof Error) {
      msg = error.message;
    }

    toast.error(msg);
    // Pastikan nama route tujuan benar (biasanya kalau gagal load data kembali ke Browse/List)
    router.push({ name: 'Refund' });
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
const onTransactionSelected = (selectedTransaction: Transaction) => {
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

// [TAMBAH] Handler F3 (Pencarian Sales Order)
const openSearchSo = (index: number) => {
  if (header.value.isApproved || isApprover.value) return;
  activeRowIndex.value = index;
  isSoSearchVisible.value = true;
};

// [TAMBAH] Logika setelah SO dipilih
const onSoSelected = async (selectedSo: SoSearchResult) => {
  isSoSearchVisible.value = false;

  // 1. Validasi awal duplikasi (Cek apakah SO ini sudah pernah dipilih sebelumnya secara global, opsional)
  // const existingItem = items.value.find(item => item.ket && item.ket.includes(selectedSo.Nomor));

  isLoading.value = true; // Tampilkan loading sebentar

  try {
    // 2. Panggil API Backend yang baru dibuat
    // Pastikan path sesuai route backend Anda
    const response = await api.get(`${API_BASE_PATH}/lookup/so-details/${selectedSo.Nomor}`);

    const { header, dps } = response.data;

    // Jika tidak ada DP yang bisa direfund
    if (!dps || dps.length === 0) {
      toast.warning(`SO ${selectedSo.Nomor} ditemukan, tetapi tidak ada DP/Uang Muka yang tersisa.`);
      return;
    }

    // 3. Masukkan DP ke dalam Grid
    // Kita hapus baris kosong aktif jika ada (baris tempat user menekan F3)
    const currentItem = items.value[activeRowIndex.value];
    let isFirstInsert = true;

    for (const dp of dps) {
      // Data yang akan dimasukkan
      const rowData = {
        nomor: dp.nomor, // Nomor Bukti DP (Misal: K01UM...)
        tanggal: dp.tanggal,
        kdcus: header.kdcus,
        customer: header.customer,
        nominal: Number(dp.nominal), // Sisa saldo DP
        refund: 0, // Default refund 0 (user isi sendiri) atau bisa disamakan dp.nominal
        apv: false,
        ket: `Refund DP SO ${header.nomor} (${dp.jenis})`, // Keterangan otomatis
        iddrec: `${authStore.user?.cabang || 'K01'}RF${Date.now() + Math.random()}`,
        bank: '', norek: '', atasnama: ''
      };

      // Cek duplikasi per item DP agar tidak masuk 2x
      const isDpExist = items.value.find(i => i.nomor === dp.nomor);
      if (isDpExist) {
        toast.info(`DP ${dp.nomor} sudah ada di list.`);
        continue;
      }

      if (isFirstInsert && currentItem && !currentItem.nomor) {
        // Jika baris aktif masih kosong, pakai baris itu
        Object.assign(currentItem, { ...rowData, id: currentItem.id }); // Pertahankan ID lama reactivity
        isFirstInsert = false;
      } else {
        // Jika ada lebih dari 1 DP, atau baris aktif sudah terisi, push baris baru
        items.value.push({
          ...rowData,
          id: Date.now() + Math.random()
        });
      }
    }

    // Pastikan ada baris kosong baru di paling bawah untuk input selanjutnya
    addNewRow();

  } catch (error) {
    console.error(error);
    toast.error("Gagal mengambil detail DP dari SO.");
  } finally {
    isLoading.value = false;
  }
};

// 2. Logika saat Centang APV diklik (SAMA PERSIS DELPHI clapvPropertiesEditValueChanged)
const handleLineItemApproval = (item: RefundDetail) => {
  if (!isApprover.value) return;

  // Jika uncheck, bersihkan semua input Finance di baris tersebut
  if (!item.apv) {
    item.refund = 0; // Lock kembali ke 0 jika batal APV
    item.bank = '';
    item.norek = '';
    item.atasnama = '';
  }
};

// 3. Logika Update Header (SAMA PERSIS DELPHI cekapv)
const updateHeaderApprovalStatus = () => {
  if (!isApprover.value) return;

  // Cek apakah ada setidaknya satu item yang dicentang (APV = True)
  const anyApproved = items.value.some(item => item.apv === true);

  // Update checkbox Header 'Approve'
  header.value.isApproved = anyApproved;
};

const removeRow = (id: number) => {
  if (isApprover.value || header.value.isApproved) return;
  items.value = items.value.filter(i => i.id !== id);
  if (items.value.length === 0) addNewRow();
  updateHeaderApprovalStatus();
};


// Logika Simpan (Analogi simpandata dan btnSimpanClick)
const simpanData = () => {
  if (!canSave.value) return toast.error('Izin ditolak.');

  const validItems = items.value.filter(item => item.nomor);
  if (validItems.length === 0) return toast.error('Minimal 1 baris terisi.');

  if (isApprover.value) {
    for (const item of validItems) {
      // Jika baris di-APV, maka nominal, bank, dan norek wajib diisi manual
      if (item.apv) {
        if (item.refund <= 0) return toast.error(`Nominal refund untuk ${item.nomor} belum diisi.`);
        if (!item.bank || !item.norek) return toast.error(`Data rekening untuk ${item.nomor} tidak lengkap.`);
      }
    }
  }

  showConfirmation('Konfirmasi Simpan', 'Simpan data pengajuan?', executeSave);
};

// Metode Konfirmasi dan Pembatalan (Analogi MessageDlg)
const executeSave = async () => {
  if (!canSave.value) {
    toast.error('Anda tidak memiliki izin untuk menyimpan data ini.');
    return;
  }
  isSaving.value = true;
  try {
    const detailsToSend = items.value
      .filter(item => item.nomor)
      .map(item => ({
        ...item,
        // Jika User adalah Approver DAN item TIDAK dicentang,
        // maka kirim refund = 0 (artinya ditolak/tidak diapprove baris ini)
        // Jika dicentang, gunakan nominal asli (item.refund)
        refund: isApprover.value ? (item.apv ? item.refund : 0) : item.refund
      }));

    const payload = {
      header: header.value,
      details: detailsToSend,
      isNew: !header.value.nomor,
      isApprover: isApprover.value,
    };

    const url = header.value.nomor
      ? `${API_BASE_PATH}/${header.value.nomor}` // Edit (PUT)
      : `${API_BASE_PATH}/`;                     // Baru (POST)

    const response = header.value.nomor
      ? await api.put(url, payload)
      : await api.post(url, payload);

    toast.success(response.data.message);
    const savedNomor = response.data.nomor;

    // Panggil dialog cetak
    dialogConfirmCetak.nomor = savedNomor;
    dialogConfirmCetak.onConfirm = () => {
      const routeData = router.resolve({ name: 'RefundPrint', params: { nomor: savedNomor } });
      window.open(routeData.href, '_blank');
      router.push({ name: 'Refund' });
    };
    dialogConfirmCetak.onCancel = () => {
      router.push({ name: 'Refund' });
    };
    dialogConfirmCetak.show = true;

  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      // Sekarang AxiosError digunakan untuk akses properti response
      toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } else if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error('Terjadi kesalahan yang tidak diketahui.');
    }
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

// // --- Watchers & Lifecycle ---
// watch(items, updateHeaderApprovalStatus, { deep: true }); // Update header APV jika ada perubahan detail

onMounted(async () => {
  // --- PENGECEKAN AWAL OTORISASI ---
  if (!canView.value) {
    isLoading.value = false;
    isDataLoading.value = false; // Assuming you have this ref
    toast.error('Anda tidak memiliki izin untuk mengakses halaman ini.');
    return;
  }
  // ------------------------------------

  isLoading.value = true;
  isDataLoading.value = true; // Assuming you have this ref

  const nomor = route.params.nomor as string;

  if (nomor) {
    // Mode Edit: Panggil fungsi load data refund
    await loadRefundData(nomor);
  } else {
    // Mode Baru: Panggil fungsi inisialisasi form
    await initForm(); // Panggil initForm untuk reset/inisialisasi
    isEditMode.value = false; // Pastikan false saat baru
  }

  // Set loading flags to false AFTER data loading/initialization is complete
  isLoading.value = false;
  isDataLoading.value = false; // Assuming you have this ref
});

</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-cash-refund">
    <template #header-actions>
      <v-btn v-if="canSave" color="primary" size="small" @click="simpanData" :loading="isSaving"
        prepend-icon="mdi-content-save">
        Simpan
      </v-btn>
      <v-btn size="small" @click="handleBatal" prepend-icon="mdi-refresh"> Batal
      </v-btn>
      <v-btn @click="handleTutup" size="small" prepend-icon="mdi-close">
        Tutup
      </v-btn>
    </template>

    <div v-if="!canView && !isLoading && !isDataLoading" class="state-container pa-4 text-center">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p>Anda tidak memiliki izin untuk melihat halaman ini.</p>
    </div>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="hide-details">
            <v-col cols="6"><v-text-field label="Nomor" v-model="header.nomor" readonly filled
                density="compact" /></v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined"
                density="compact" :readonly="isApprover || !canSave || header.isApproved" /></v-col>
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
          <div class="text-subtitle-1 font-weight-bold mb-2">Detail Transaksi (F1=Invoice, F2=Deposit, F3=Sales Order)
          </div>
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" class="desktop-table fill-height"
            density="compact" fixed-header :items-per-page="-1">
            <template v-slot:[`item.nomor`]="{ item, index }">
              <v-text-field v-model="item.nomor" variant="underlined" density="compact" hide-details
                placeholder="F1 (Inv) / F2 (Dep) / F3 (SO)..." @keydown.f1.prevent="openSearchInvoice(index)"
                @keydown.f2.prevent="openSearchDeposit(index)" @keydown.f3.prevent="openSearchSo(index)"
                :readonly="!!item.nomor || isApprover || header.isApproved || !canSave" />
            </template>
            <template v-slot:[`item.nominal`]="{ item }">
              <td class="text-end">{{ (item.nominal || 0).toLocaleString('id-ID') }}</td>
            </template>
            <template v-slot:[`item.refund`]="{ item }">
              <v-text-field v-model.number="item.refund" type="number" variant="underlined" density="compact"
                hide-details class="text-end" placeholder="0" :readonly="!isApprover || !item.apv || header.isApproved"
                :max="item.nominal" min="0" />
            </template>
            <template v-slot:[`item.apv`]="{ item }">
              <v-checkbox-btn v-model="item.apv" density="compact" hide-details
                :disabled="!isApprover || header.isApproved || !item.nomor"
                @change="() => handleLineItemApproval(item)" />
            </template>

            <template v-slot:[`item.bank`]="{ item }">
              <v-text-field v-model="item.bank" variant="underlined" density="compact" hide-details
                :disabled="!isApprover || !item.apv || header.isApproved" />
            </template>
            <template v-slot:[`item.norek`]="{ item }">
              <v-text-field v-model="item.norek" variant="underlined" density="compact" hide-details
                :disabled="!canApprove || !item.apv" />
            </template>
            <template v-slot:[`item.atasnama`]="{ item }">
              <v-text-field v-model="item.atasnama" variant="underlined" density="compact" hide-details
                :disabled="!canApprove || !item.apv" />
            </template>
            <template v-slot:[`item.ket`]="{ item }">
              <v-text-field v-model="item.ket" variant="underlined" density="compact" hide-details
                :readonly="isApprover || header.isApproved || !canSave" />
            </template>
            <template v-slot:[`item.actions`]="{ item }">
              <v-btn v-if="item.nomor && !isApprover && !header.isApproved" icon="mdi-delete" size="x-small"
                variant="text" color="error" :disabled="!canSave"
                @click="showConfirmation('Konfirmasi', 'Hapus baris ini?', () => removeRow(item.id))" />
            </template>
            <template #bottom>
              <v-btn v-if="!isApprover && !header.isApproved" size="small" @click="addNewRow" prepend-icon="mdi-plus"
                :disabled="!canSave" class="ma-2">Tambah Baris</v-btn>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <TransactionSearchModal v-if="isTransactionSearchVisible" :searchType="searchType"
      :cabang="authStore.user?.cabang || 'K01'" @close="isTransactionSearchVisible = false"
      @selected="onTransactionSelected" />
    <SoSearchModal v-if="isSoSearchVisible" :cabang="authStore.user?.cabang || 'K01'" source="mutasi-out"
      @close="isSoSearchVisible = false" @selected="onSoSelected" />

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

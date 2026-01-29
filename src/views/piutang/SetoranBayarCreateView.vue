<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
import RekeningSearchModal from '@/components/lookup/RekeningSearchModal.vue';
import UnpaidInvoiceSearchModal from '@/components/lookup/UnpaidInvoiceSearchModal.vue';
import InvoiceSearchModal from '@/components/lookup/InvoiceSearchModal.vue';
import SoSearchModal from '@/components/lookup/SoSearchModal.vue';
import { AxiosError } from 'axios';
import { formatRupiah } from "@/utils/formatRupiah";

// --- Tipe Data ---
interface Header {
  nomor: string;
  tanggal: string;
  customer: { kode: string; nama: string; alamat: string; kota: string; telp: string };
  jenisSetor: 'TUNAI' | 'TRANSFER' | 'GIRO';
  nominal: number;
  terbayar: number;
  sisa: number;
  keterangan: string;
  akun: { kode: string; nama: string; rekening: string };
  tanggalTransfer: string;
  nomorGiro: string;
  tanggalGiro: string;
  tanggalJatuhTempo: string;
  nomorSo: string;
  minimalDp: number;
  totalDp?: number;
  sisaMinimalDp?: number;
  minimalPercent?: number;
  containsCustomOrDtf?: boolean;
}
interface Item {
  id: number;
  invoice: string;
  tanggal: string;
  top: number;
  jatuhTempo: string;
  nominal: number;
  terbayar: number;
  sisa: number;
  bayar: number;
  tglBayar: string;
  lunasi: boolean;
  keterangan: string;
  angsur: string;
}
interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
}
interface Akun {
  kode: string;
  nama: string;
  rekening: string;
}

interface InvoiceItem {
  invoice: string;
  tanggal: string;
  top: number;
  jatuhTempo: string;
  nominal: number;
  terbayar: number;
  sisa: number;
}

interface InvoiceItem {
  invoice: string;
  tanggal: string;
  top: number;
  jatuhTempo: string;
  nominal: number;
  terbayar: number;
  sisa: number;
}

interface BiayaKirimLookupInvoice {
  Nomor: string;
  Tanggal: string;
  Nominal: number;
  Bayar: number;
  Sisa: number;
  KdCus: string;
  Customer: string;
  Alamat: string;
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = '51';

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Setoran Pembayaran' : 'Buat Setoran Pembayaran');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const initialHeaderState: Header = {
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  customer: { kode: '', nama: '', alamat: '', kota: '', telp: '' },
  jenisSetor: 'TUNAI',
  nominal: 0,
  terbayar: 0,
  sisa: 0,
  keterangan: '',
  akun: { kode: '', nama: '', rekening: '' },
  tanggalTransfer: format(new Date(), 'yyyy-MM-dd'),
  nomorGiro: '',
  tanggalGiro: format(new Date(), 'yyyy-MM-dd'),
  tanggalJatuhTempo: format(new Date(), 'yyyy-MM-dd'),
  nomorSo: '',
  minimalDp: 0,
  minimalPercent: 30,
  containsCustomOrDtf: false,
};
const header = reactive<Header>({ ...initialHeaderState });
const items = ref<Item[]>([]);

const isLoading = ref(true);
const isSaving = ref(false);
const focusedRowId = ref<number | string>(-1);
const isSoSearchVisible = ref(false);
const lockSoMode = ref(false);
const statusSo = ref<'AKTIF' | 'PASIF' | ''>('');

// handler untuk header.nominal
function onHeaderNominalFocus() {
  focusedRowId.value = 'header_nominal';
}
function onHeaderNominalBlur() {
  focusedRowId.value = -1;
}
function onHeaderNominalUpdate(val: string | number) {
  // val bisa string (formatted) atau number (ketika user ketik)
  header.nominal = Number(String(val).replace(/[^0-9]/g, '')) || 0;
}

const dialog = reactive({
  customerSearch: false,
  rekeningSearch: false,
  invoiceSearch: false,
  confirm: false,
});
const activeRowIndex = ref(0);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });
const isPosted = ref(false);
const dialogBk = ref(false);

const tableHeaders = [
  { title: 'No. Invoice', key: 'invoice', width: '150px' },
  { title: 'Tgl Invoice', key: 'tanggal', width: '110px' },
  { title: 'TOP', key: 'top', align: 'end', width: '70px' },
  { title: 'Jatuh Tempo', key: 'jatuhTempo', width: '110px' },
  { title: 'Nominal', key: 'nominal', align: 'end', width: '120px' },
  { title: 'Terbayar', key: 'terbayar', align: 'end', width: '120px' },
  { title: 'Sisa Piutang', key: 'sisa', align: 'end', width: '120px' },
  { title: 'Bayar', key: 'bayar', align: 'end', width: '150px' },
  { title: 'Lunasi', key: 'lunasi', align: 'center', sortable: false, width: '80px' },
  { title: 'Tgl Bayar', key: 'tglBayar', width: '130px' },
  { title: 'Keterangan', key: 'keterangan', width: '200px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
] as const;

// --- Methods ---
const calculateTotals = () => {
  const totalBayar = items.value.reduce((sum, item) => sum + (item.bayar || 0), 0);
  header.terbayar = totalBayar;
  header.sisa = header.nominal - totalBayar;
};

const addNewRow = () => {
  const lastItem = items.value[items.value.length - 1];
  if (!lastItem || lastItem.invoice) {
    items.value.push({
      id: Date.now(), invoice: '', tanggal: '', top: 0, jatuhTempo: '', nominal: 0,
      terbayar: 0, sisa: 0, bayar: 0, tglBayar: format(new Date(), 'yyyy-MM-dd'),
      lunasi: false, keterangan: '', angsur: ''
    });
  }
};
const removeRow = (id: number) => {
  items.value = items.value.filter(item => item.id !== id);
  if (items.value.length === 0) addNewRow();
  calculateTotals();
};

const onCustomerSelected = (customer: Customer) => {
  header.customer = customer;
  dialog.customerSearch = false;
  items.value = []; // Reset grid saat ganti customer
  addNewRow();
};

const openRekeningSearch = () => {
  dialog.rekeningSearch = true;
};
const onRekeningSelected = (akun: Akun) => {
  header.akun = akun;
  dialog.rekeningSearch = false;
};

const openUnpaidInvoiceSearch = (index: number) => {
  if (!header.customer.kode) return toast.error('Pilih customer terlebih dahulu.');
  activeRowIndex.value = index;
  dialog.invoiceSearch = true;
};

const onUnpaidInvoiceSelected = (invoice: InvoiceItem) => {
  dialog.invoiceSearch = false;
  const isDuplicate = items.value.some(item => item.invoice === invoice.invoice);
  if (isDuplicate) return toast.warning('Invoice tersebut sudah ada di dalam daftar.');

  const targetItem = items.value[activeRowIndex.value];
  if (targetItem) {
    Object.assign(targetItem, { ...invoice, id: targetItem.id, bayar: 0, lunasi: false, tglBayar: format(new Date(), 'yyyy-MM-dd') });
  }
  addNewRow();
};

const handleLunasi = (item: Item) => {
  if (item.lunasi) {
    const sisaSetoran = header.nominal - items.value.filter(i => i.id !== item.id).reduce((sum, i) => sum + (i.bayar || 0), 0);
    item.bayar = Math.min(item.sisa, sisaSetoran);
  } else {
    item.bayar = 0;
  }
  calculateTotals();
};

const resetForm = () => {
  Object.assign(header, initialHeaderState);
  items.value = [];
  addNewRow();
  markAsSaved();
};

const resetFormWithToast = () => {
  resetForm();
  toast.info('Form telah dibersihkan.');
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
    const payload = { header, items: items.value, isNew: !isEditMode.value };
    const response = await api.post('/setoran-bayar-form/save', payload);
    toast.success(response.data.message);

    markAsSaved();

    // Arahkan ke halaman cetak
    const nomorSetoran = response.data.nomor;
    const url = router.resolve({ name: 'CetakSetoranBayar', params: { nomor: nomorSetoran } }).href;
    window.open(url, '_blank');

    router.push({ name: 'SetoranBayar' });
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const handleSave = () => {
  // Validasi frontend
  if (!header.customer.kode) return toast.error('Customer harus diisi.');
  if (!header.nominal || header.nominal <= 0) return toast.error('Nominal setoran harus diisi.');
  if (header.sisa < 0) return toast.error('Sisa setoran tidak boleh minus. Periksa kembali alokasi pembayaran.');

  // --- VALIDASI TANGGAL HARI INI ---
  const today = format(new Date(), 'yyyy-MM-dd');
  if (header.tanggal !== today) {
    return toast.error(`Tanggal Setoran harus hari ini (${today}).`);
  }
  // ---------------------------------

  showConfirmation('Konfirmasi Simpan', 'Apakah Anda yakin ingin menyimpan data ini?', executeSave);
};

const handleCancel = () => {
  showConfirmation('Konfirmasi Batal', 'Data yang belum disimpan akan hilang. Lanjutkan?', resetFormWithToast);
};

const handleClose = () => {
  showConfirmation('Konfirmasi Tutup', 'Tutup form dan kembali ke halaman browse?', () => router.push({ name: 'SetoranBayar' }));
};

const openSoSearch = () => {
  // kalau sudah locked via SO, biarkan tetap buka? Delphi: cuma boleh pilih SO jika customer diisi
  if (!header.customer || !header.customer.kode) {
    toast.error('Pilih customer terlebih dahulu.');
    return;
  }
  isSoSearchVisible.value = true;
};

const onSoSelected = async (item: { Nomor: string; KdCus?: string; Customer?: string }) => {
  try {
    isLoading.value = true;

    // Ambil detail SO terbaru dari backend
    const resp = await api.get(`/setoran-bayar-form/so/${encodeURIComponent(item.Nomor)}`);
    const data = resp.data;

    if (!data) {
      toast.error("SO tidak ditemukan.");
      return;
    }

    // 1️⃣ Set nomor SO
    header.nomorSo = data.nomor || item.Nomor;

    // 2️⃣ Set customer
    if (data.customer?.kode) {
      header.customer = {
        kode: data.customer.kode,
        nama: data.customer.nama ?? "",
        alamat: data.customer.alamat ?? "",
        kota: data.customer.kota ?? "",
        telp: data.customer.telp ?? "",
      };
    } else if (item.KdCus) {
      header.customer = {
        kode: item.KdCus,
        nama: item.Customer || "",
        alamat: "",
        kota: "",
        telp: "",
      };
    }

    // 3️⃣ Minimal DP, total DP, sisa minimal DP
    header.minimalDp = Number(data.minimalDp || 0);       // TOTAL dp wajib (30/50%)
    header.totalDp = Number(data.totalDp || 0);         // sudah dibayar
    header.sisaMinimalDp = Number(data.sisaMinimalDp || 0);   // kekurangan DP
    header.minimalPercent = Number(data.minimalPercent || 30);
    header.containsCustomOrDtf = !!data.containsCustomOrDtf;

    // 4️⃣ Nominal default → sisa minimal DP (boleh diubah oleh user)
    header.nominal = Math.round(header.sisaMinimalDp);

    // 5️⃣ Isi field "terbayar" dan "sisa"
    header.terbayar = header.totalDp;
    header.sisa = Math.max(0, header.minimalDp - header.totalDp);

    // 6️⃣ Kunci customer jika SO dipilih
    lockSoMode.value = true;

    // 7️⃣ Set status aktif/pasif
    statusSo.value = data.soAktif === "Y" ? "AKTIF" : "PASIF";

    // 8️⃣ Jika SO sudah jadi invoice → load invoice grid
    if (data.isInvoiced) {
      toast.info("Memuat invoice dari SO...");

      const invResp = await api.get("/setoran-bayar-form/lookup/invoices-from-so", {
        params: { nomorSo: item.Nomor },
      });

      const invItems = invResp.data || [];

      items.value = invItems.map((inv: InvoiceItem) => ({
        id: Date.now() + Math.random(),
        invoice: inv.invoice,
        tanggal: inv.tanggal,
        top: inv.top,
        jatuhTempo: inv.jatuhTempo,
        nominal: inv.nominal,
        terbayar: inv.terbayar,
        sisa: inv.sisa,
        bayar: 0,
        tglBayar: format(new Date(), "yyyy-MM-dd"),
        lunasi: false,
        keterangan: "",
        angsur: "",
      }));

      addNewRow();
      calculateTotals();
    }

    // Tutup modal
    isSoSearchVisible.value = false;

  } catch (error) {
    console.error("onSoSelected error", error);
    toast.error("Gagal memuat detail SO.");
  } finally {
    isLoading.value = false;
  }
};

const clearSo = () => {
  header.nomorSo = "";
  header.minimalDp = 0;
  lockSoMode.value = false;

  // Reset nominal
  header.nominal = 0;

  // Reset grid
  items.value = [];
  addNewRow();

  toast.info("Nomor SO dibersihkan.");
};

const openBkSearch = (index: number) => {
  if (!header.customer.kode) return toast.error('Pilih customer terlebih dahulu.');
  activeRowIndex.value = index;
  dialogBk.value = true;
};

const onBkSelected = (bk: BiayaKirimLookupInvoice) => {
  dialogBk.value = false;

  // Validasi duplikasi menggunakan properti yang sudah pasti ada (Nomor)
  const isDuplicate = items.value.some(item => item.invoice === bk.Nomor);
  if (isDuplicate) return toast.warning('Biaya Kirim tersebut sudah ada dalam daftar.');

  const targetItem = items.value[activeRowIndex.value];
  if (targetItem) {
    // Mapping data secara aman tanpa type casting 'any'
    Object.assign(targetItem, {
      invoice: bk.Nomor,
      tanggal: bk.Tanggal,
      nominal: bk.Nominal,
      terbayar: bk.Bayar,
      sisa: bk.Sisa,
      bayar: 0,
      tglBayar: format(new Date(), 'yyyy-MM-dd')
    });
  }

  // Tambahkan baris kosong baru di bawahnya agar kasir bisa input invoice lain
  addNewRow();
};

// --- WATCHERS (UNSAVED CHANGES) ---
// Pantau perubahan pada header dan items
watch(
  [items, header], // Pantau array items dan object header
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isLoading.value || isSaving.value) return;

    // Cek apakah ada data yang "bermakna" (bukan baris kosong default)
    // atau header sudah diisi (customer dipilih)
    const hasItems = items.value.some(i => i.invoice !== '' || i.nominal > 0);
    const hasHeader = header.customer.kode !== '' || header.nominal > 0;

    if (hasItems || hasHeader) {
      uiStore.setUnsavedChanges(true);
    } else {
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

onMounted(() => {
  const nomor = route.params.nomor as string;

  markAsSaved();

  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin untuk ${isEditMode.value ? 'mengubah' : 'membuat'} data Setoran.`);
    router.push({ name: 'SetoranBayar' });
    return;
  }

  if (isEditMode.value && nomor) {
    isLoading.value = true;

    api.get(`/setoran-bayar-form/${nomor}`)
      .then(response => {
        const data = response.data;

        // --- Isi header ---
        header.nomor = data.header.nomor;
        header.tanggal = format(new Date(data.header.tanggal), 'yyyy-MM-dd');
        header.customer = {
          kode: data.header.customer_kode,
          nama: data.header.customer_nama,
          alamat: data.header.customer_alamat,
          kota: data.header.customer_kota,
          telp: data.header.customer_telp,
        };
        header.jenisSetor = data.header.jenisSetor;
        header.nominal = data.header.nominal;
        header.keterangan = data.header.keterangan;
        header.akun = {
          kode: data.header.akun_kode,
          nama: data.header.akun_nama,
          rekening: data.header.akun_rekening
        };
        header.tanggalTransfer = data.header.tanggalTransfer
          ? format(new Date(data.header.tanggalTransfer), 'yyyy-MM-dd')
          : '';
        header.nomorGiro = data.header.nomorGiro;
        header.tanggalGiro = data.header.tanggalGiro
          ? format(new Date(data.header.tanggalGiro), 'yyyy-MM-dd')
          : '';
        header.tanggalJatuhTempo = data.header.tanggalJatuhTempo
          ? format(new Date(data.header.tanggalJatuhTempo), 'yyyy-MM-dd')
          : '';
        header.nomorSo = data.header.nomorSo;

        // --- Isi detail grid ---
        items.value = data.items.map((item: Partial<Item>) => ({
          id: Date.now() + Math.random(),
          invoice: item.invoice || '',
          tanggal: item.tanggal || '',
          top: item.top || 0,
          jatuhTempo: item.jatuhTempo || '',
          nominal: item.nominal || 0,
          terbayar: item.terbayar || 0,
          sisa: item.sisa || 0,
          bayar: 0, // default 0
          tglBayar: format(new Date(), 'yyyy-MM-dd'), // default hari ini
          lunasi: false,
          keterangan: item.keterangan || '',
          angsur: item.angsur || '',
        }));
        addNewRow();
        calculateTotals();

        // --- Cek posting ---
        isPosted.value = data.header.isPosted;
        if (isPosted.value) {
          toast.warning('Data ini sudah di-posting oleh finance dan tidak bisa diubah.');
        }
        nextTick(() => {
          markAsSaved();
        });
      })
      .catch((err: unknown) => {
        const error = err as AxiosError<{ message: string }>;
        toast.error(error.response?.data?.message || 'Gagal memuat data setoran.');
        router.back();
      })
      .finally(() => {
        isLoading.value = false;
      });
  } else {
    // Mode baru
    resetForm();
    isLoading.value = false;
  }
});

watch(() => header.nominal, calculateTotals);
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-cash-multiple">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="handleSave" :loading="isSaving" prepend-icon="mdi-content-save"
        :disabled="!authStore.can(MENU_ID, requiredPermission)">
        Simpan
      </v-btn>
      <v-btn size="small" @click="handleCancel" prepend-icon="mdi-refresh">Batal</v-btn>
      <v-btn size="small" @click="handleClose" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6">
              <v-text-field label="Cabang" v-model="authStore.user.cabang" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Nomor" v-model="header.nomor" readonly filled density="compact" hide-details>
                <template #append-inner><span v-if="!isEditMode"
                    class="text-caption text-disabled">&lt;Baru&gt;</span></template>
              </v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field label="Tanggal" v-model="header.tanggal" type="date" variant="outlined" density="compact"
                hide-details :min="format(new Date(), 'yyyy-MM-dd')" :max="format(new Date(), 'yyyy-MM-dd')" />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Customer" v-model="header.customer.nama" readonly :disabled="lockSoMode"
                @click="() => { if (!lockSoMode) dialog.customerSearch = true }" prepend-inner-icon="mdi-magnify"
                density="compact" hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Alamat" v-model="header.customer.alamat" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Kota" v-model="header.customer.kota" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Telepon" v-model="header.customer.telp" readonly filled density="compact"
                hide-details />
            </v-col>

            <v-col cols="12">
              <v-radio-group v-model="header.jenisSetor" inline label="Jenis Setor" density="compact" hide-details>
                <v-radio label="Tunai" value="TUNAI"></v-radio>
                <v-radio label="Transfer" value="TRANSFER"></v-radio>
                <v-radio label="Giro" value="GIRO"></v-radio>
              </v-radio-group>
            </v-col>

            <!-- Panel Transfer -->
            <v-expand-transition>
              <div v-if="header.jenisSetor === 'TRANSFER'" class="w-100">
                <v-row dense>
                  <v-col cols="6">
                    <v-text-field label="No. Akun" v-model="header.akun.kode" readonly @click="openRekeningSearch"
                      prepend-inner-icon="mdi-magnify" density="compact" hide-details />
                  </v-col>
                  <v-col cols="6">
                    <v-text-field label="No. Rekening" v-model="header.akun.rekening" readonly filled density="compact"
                      hide-details />
                  </v-col>
                  <v-col cols="12">
                    <v-text-field label="Nama Bank" v-model="header.akun.nama" readonly filled density="compact"
                      hide-details />
                  </v-col>
                  <v-col cols="12">
                    <v-text-field label="Tgl. Transfer" v-model="header.tanggalTransfer" type="date" variant="outlined"
                      density="compact" hide-details />
                  </v-col>
                </v-row>
              </div>
            </v-expand-transition>

            <!-- Panel Giro -->
            <v-expand-transition>
              <div v-if="header.jenisSetor === 'GIRO'" class="w-100">
                <v-row dense>
                  <v-col cols="12">
                    <v-text-field label="No. Giro" v-model="header.nomorGiro" variant="outlined" density="compact"
                      hide-details />
                  </v-col>
                  <v-col cols="6">
                    <v-text-field label="Tgl. Giro" v-model="header.tanggalGiro" type="date" variant="outlined"
                      density="compact" hide-details />
                  </v-col>
                  <v-col cols="6">
                    <v-text-field label="Jatuh Tempo" v-model="header.tanggalJatuhTempo" type="date" variant="outlined"
                      density="compact" hide-details />
                  </v-col>
                </v-row>
              </div>
            </v-expand-transition>

            <v-col cols="12">
              <v-text-field label="Keterangan" v-model="header.keterangan" rows="2" variant="outlined" density="compact"
                hide-details />
            </v-col>

            <v-divider class="my-4" />

            <v-row dense>

              <!-- NOMOR SO (6 kolom) -->
              <v-col cols="12" md="6">
                <v-text-field v-model="header.nomorSo" label="Nomor SO" readonly variant="outlined" density="compact"
                  hide-details>
                  <template #append-inner>
                    <v-btn icon="mdi-magnify" variant="text" density="compact" @click="openSoSearch" />
                    <v-btn icon="mdi-close" variant="text" density="compact" v-if="header.nomorSo" @click="clearSo" />
                  </template>
                </v-text-field>
              </v-col>

              <!-- MINIMAL DP (Muncul hanya jika ada SO) -->
              <v-col cols="12" md="6" v-if="header.nomorSo">
                <v-text-field :model-value="formatRupiah(header.minimalDp)"
                  :label="`Minimal DP (${header.minimalPercent || 30}%)`" readonly filled density="compact"
                  hide-details />
              </v-col>

              <!-- SPACER agar baris tetap seimbang (jika tidak ada SO minimal) -->
              <v-col cols="12" md="4" v-else></v-col>

              <!-- STATUS SO -->
              <v-col cols="12" v-if="header.nomorSo">
                <div v-if="statusSo === 'AKTIF'"
                  class="pa-2 rounded bg-green-lighten-4 text-green-darken-3 text-caption">
                  ✔ SO Aktif — Minimal DP terpenuhi
                </div>

                <div v-else-if="statusSo === 'PASIF'"
                  class="pa-2 rounded bg-red-lighten-4 text-red-darken-3 text-caption">
                  ✖ SO Pasif — Minimal DP belum terpenuhi
                </div>
              </v-col>

              <!-- NOMINAL SETORAN (Selalu muncul) -->
              <v-col cols="12" md="6">
                <v-text-field
                  :model-value="focusedRowId === 'header_nominal' ? header.nominal : formatRupiah(header.nominal)"
                  @focus="onHeaderNominalFocus" @blur="onHeaderNominalBlur" @update:model-value="onHeaderNominalUpdate"
                  label="Nominal Setoran" variant="outlined" density="compact" hide-details class="font-weight-bold"
                  :readonly="isPosted" />
              </v-col>

              <!-- TERBAYAR (Selalu muncul) -->
              <v-col cols="6" md="3">
                <v-text-field :model-value="formatRupiah(header.terbayar)" label="Terbayar" readonly filled
                  density="compact" hide-details />
              </v-col>

              <!-- SISA (Selalu muncul) -->
              <v-col cols="6" md="3">
                <v-text-field :model-value="formatRupiah(header.sisa)" label="Sisa" readonly filled density="compact"
                  hide-details />
              </v-col>

            </v-row>

          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <v-data-table :headers="tableHeaders" :items="items" :loading="isLoading" density="compact"
            class="desktop-table fill-height-table" fixed-header :items-per-page="-1">
            <template #[`item.invoice`]="{ item, index }">
              <v-text-field v-model="item.invoice" variant="underlined" density="compact" hide-details
                @keydown.f1.prevent="openUnpaidInvoiceSearch(index)" @keydown.f2.prevent="openBkSearch(index)"
                :readonly="lockSoMode" placeholder="F1 (Inv) / F2 (BK)..." />
            </template>
            <template #[`item.tanggal`]="{ value }">
              {{ value ? format(parseISO(value), 'dd-MM-yyyy') : '' }}
            </template>
            <template #[`item.jatuhTempo`]="{ value }">
              {{ value ? format(parseISO(value), 'dd-MM-yyyy') : '' }}
            </template>
            <template #[`item.nominal`]="{ value }">
              {{ formatRupiah(value) }}
            </template>
            <template #[`item.terbayar`]="{ value }">
              {{ formatRupiah(value) }}
            </template>
            <template #[`item.sisa`]="{ value }">
              {{ formatRupiah(value) }}
            </template>
            <template #[`item.bayar`]="{ item }">
              <v-text-field :model-value="focusedRowId === item.id ? item.bayar : formatRupiah(item.bayar)"
                @focus="focusedRowId = item.id" @blur="focusedRowId = -1"
                @update:model-value="item.bayar = Number(String($event).replace(/[^0-9]/g, '')) || 0; calculateTotals();"
                variant="underlined" density="compact" hide-details class="text-right" />
            </template>
            <template #[`item.lunasi`]="{ item }">
              <v-checkbox v-model="item.lunasi" @change="handleLunasi(item)" hide-details density="compact" />
            </template>
            <template #[`item.tglBayar`]="{ item }">
              <v-text-field v-model="item.tglBayar" type="date" variant="underlined" density="compact" hide-details />
            </template>
            <template #[`item.keterangan`]="{ item }">
              <v-text-field v-model="item.keterangan" variant="underlined" density="compact" hide-details />
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="removeRow(item.id)" />
            </template>
            <template #bottom>
              <div class="pa-2 text-right"><v-btn size="small" @click="() => { if (!lockSoMode) addNewRow(); }"
                  :disabled="lockSoMode" prepend-icon="mdi-plus" variant="text" color="primary">Tambah Invoice</v-btn>
              </div>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <CustomerSearchModal v-if="dialog.customerSearch" :gudang="authStore.user?.cabang || ''"
      @close="dialog.customerSearch = false" @customer-selected="onCustomerSelected" />
    <RekeningSearchModal v-if="dialog.rekeningSearch" :cabang="authStore.user?.cabang || ''"
      @close="dialog.rekeningSearch = false" @selected="onRekeningSelected" />
    <UnpaidInvoiceSearchModal v-if="dialog.invoiceSearch" :customer-kode="header.customer.kode"
      @close="dialog.invoiceSearch = false" @invoice-selected="onUnpaidInvoiceSelected" />
    <SoSearchModal v-if="isSoSearchVisible" :cabang="authStore.user?.cabang || ''" source="setoran-bayar"
      :customer="header.customer.kode" @close="isSoSearchVisible = false" @selected="onSoSelected" />
    <InvoiceSearchModal v-if="dialogBk" source="biaya-kirim" :customer-kode="header.customer.kode"
      @close="dialogBk = false" @invoice-selected="onBkSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false">Ya,
            Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
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

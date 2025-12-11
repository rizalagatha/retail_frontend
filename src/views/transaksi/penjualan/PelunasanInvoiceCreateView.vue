<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
import RekeningSearchModal from '@/components/lookup/RekeningSearchModal.vue';
import { formatRupiah } from "@/utils/formatRupiah";
import type { AxiosError } from 'axios';
import type { DataTableHeader } from 'vuetify';

interface OutstandingItem {
  ph_nomor: string;
  inv_nomor: string;
  ph_tanggal: string;
  marketplace: string;
  no_pesanan: string;
  sisa_tagihan: number;
}

interface PaymentDetailItem {
  inv_nomor: string;
  inv_mp_nama: string;
  inv_mp_nomor_pesanan: string;
  nominal_bayar: number | string;
}

interface CustomerLookupResult {
  kode: string;
  nama: string;
  alamat: string;
}

interface RekeningLookupResult {
  kode: string;
  nama: string;
  rekening: string;
}

// --- Inisialisasi ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = '50';

// --- State ---
const isViewMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isViewMode.value ? 'Detail Pelunasan' : 'Input Pelunasan Baru');

const isLoading = ref(false);
const isSaving = ref(false);

const form = reactive({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  customer: {
    kode: '',
    nama: '',
    alamat: ''
  },
  metode: 'TRANSFER',
  bankAccount: {
    kode: '',
    nama: '',
    rekening: ''
  },
  keterangan: '',
  userCreate: ''
});

interface InvoiceRow {
  ph_nomor?: string;
  inv_nomor: string;
  ph_tanggal?: string;
  marketplace?: string;
  no_pesanan?: string;
  sisa_tagihan?: number;
  bayar: number;
}

const invoiceList = ref<InvoiceRow[]>([]);
const selectedIds = ref<string[]>([]);

const dialogs = reactive({
  customerSearch: false,
  rekeningSearch: false,
});

// State untuk Dialog Konfirmasi
const dialogConfirm = reactive({
  show: false,
  title: '',
  text: '',
  onConfirm: () => { },
});

const totalAllocated = computed(() => {
  if (isViewMode.value) {
    return invoiceList.value.reduce((sum, item) => sum + (Number(item.bayar) || 0), 0);
  } else {
    return invoiceList.value
      .filter(item => item.ph_nomor && selectedIds.value.includes(item.ph_nomor))
      .reduce((sum, item) => sum + (Number(item.bayar) || 0), 0);
  }
});

const tableHeaders = computed<DataTableHeader[]>(() => {
  const base: DataTableHeader[] = [
    { title: 'No. Invoice', key: 'inv_nomor', width: '140px' },
    { title: 'Marketplace', key: 'marketplace', width: '120px' },
    { title: 'No. Pesanan', key: 'no_pesanan', width: '180px' },
  ];

  if (isViewMode.value) {
    return [
      ...base,
      { title: 'Nominal Dibayar', key: 'bayar', align: 'end', width: '150px' },
    ];
  } else {
    return [
      { title: 'Tgl Piutang', key: 'ph_tanggal', width: '110px' },
      ...base,
      { title: 'Sisa Tagihan', key: 'sisa_tagihan', align: 'end', width: '130px' },
      { title: 'Bayar Ini', key: 'bayar', align: 'end', width: '150px' },
    ];
  }
});

// --- Methods ---
const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const loadOutstanding = async () => {
  if (!form.customer.kode) return;
  isLoading.value = true;
  invoiceList.value = [];
  selectedIds.value = [];

  try {
    const response = await api.get(`/pelunasan-invoice/outstanding-piutang/${form.customer.kode}`);
    invoiceList.value = response.data.map((inv: OutstandingItem) => ({
      ph_nomor: inv.ph_nomor,
      inv_nomor: inv.inv_nomor,
      ph_tanggal: format(new Date(inv.ph_tanggal), 'dd-MM-yyyy'),
      marketplace: inv.marketplace,
      no_pesanan: inv.no_pesanan,
      sisa_tagihan: Number(inv.sisa_tagihan),
      bayar: 0
    }));
  } catch (error) {
    console.error(error);
    toast.error("Gagal memuat data piutang.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetail = async (nomor: string) => {
  isLoading.value = true;
  try {
    const { data } = await api.get(`/pelunasan-invoice/detail/${nomor}`);
    form.nomor = data.header.sh_nomor;
    form.tanggal = format(new Date(data.header.sh_tanggal), 'yyyy-MM-dd');
    form.customer = {
      kode: data.header.sh_cus_kode,
      nama: data.header.cus_nama,
      alamat: data.header.cus_alamat
    };
    form.metode = data.header.metode_bayar_desc;
    form.keterangan = data.header.sh_ket;
    form.bankAccount = {
      kode: data.header.sh_akun,
      nama: '',
      rekening: data.header.sh_norek
    };
    form.userCreate = data.header.user_create;
    invoiceList.value = data.details.map((dtl: PaymentDetailItem) => ({
      inv_nomor: dtl.inv_nomor,
      marketplace: dtl.inv_mp_nama,
      no_pesanan: dtl.inv_mp_nomor_pesanan,
      bayar: Number(dtl.nominal_bayar)
    }));

  } catch (error: unknown) {
    const axiosErr = error as AxiosError<{ message: string }>;
    const msg = axiosErr.response?.data?.message || axiosErr.message || "Gagal memuat detail transaksi.";
    toast.error(msg);
    router.back();
  } finally {
    isLoading.value = false;
  }
};

watch(selectedIds, (newSelection) => {
  if (isViewMode.value) return;
  invoiceList.value.forEach(item => {
    if (item.ph_nomor && newSelection.includes(item.ph_nomor)) {
      if (item.bayar === 0) {
        item.bayar = item.sisa_tagihan || 0;
      }
    }
  });
});

const onCustomerSelected = (cust: CustomerLookupResult) => {
  form.customer = {
    kode: cust.kode,
    nama: cust.nama,
    alamat: cust.alamat
  };
  dialogs.customerSearch = false;
  loadOutstanding();
};

const onRekeningSelected = (rek: RekeningLookupResult) => {
  form.bankAccount = {
    kode: rek.kode,
    nama: rek.nama,
    rekening: rek.rekening
  };
  dialogs.rekeningSearch = false;
};

// --- LOGIC SIMPAN ---
// 1. Triggered by Button
const handleSave = () => {
  // Validasi Awal
  if (!form.customer.kode) return toast.error("Pilih customer terlebih dahulu.");
  if (totalAllocated.value <= 0) return toast.error("Tidak ada nominal yang dibayarkan.");
  if (form.metode === 'TRANSFER' && !form.bankAccount.kode) {
    return toast.error("Pilih akun bank untuk metode transfer.");
  }

  // Tampilkan konfirmasi
  showConfirmation(
    'Konfirmasi Simpan',
    `Anda akan menyimpan pelunasan sebesar ${formatRupiah(totalAllocated.value)}. Lanjutkan?`,
    executeSave // Jika Ya, jalankan executeSave
  );
};

// 2. Eksekusi ke API
const executeSave = async () => {
  const invoicesToPay = invoiceList.value
    .filter(item => selectedIds.value.includes(item.ph_nomor) && item.bayar > 0)
    .map(item => ({
      inv_nomor: item.inv_nomor,
      bayar: item.bayar
    }));

  isSaving.value = true;
  try {
    const payload = {
      customerKode: form.customer.kode,
      paymentDate: form.tanggal,
      paymentMethod: form.metode,
      bankAccount: form.bankAccount,
      totalBayar: totalAllocated.value,
      invoices: invoicesToPay,
      keterangan: form.keterangan
    };

    const response = await api.post('/pelunasan-invoice/save-pelunasan', payload);

    markAsSaved();
    toast.success(response.data.message || "Pelunasan berhasil disimpan.");
    await router.push({ name: 'PelunasanInvoice' });

  } catch (error: unknown) {
    // cast ke AxiosError
    const axiosErr = error as AxiosError<{ message?: string }>;

    // Filter error navigasi
    const msg = axiosErr.message ?? '';
    if (
      msg.includes('NavigationFailure') ||
      msg.includes('No match for')
    ) {
      console.warn("Navigasi gagal, tapi data tersimpan:", axiosErr);
      return;
    }

    console.error(axiosErr);
    toast.error(
      axiosErr.response?.data?.message ||
      axiosErr.message ||
      "Gagal menyimpan pelunasan."
    );
  } finally {
    isSaving.value = false;
  }
};

// --- LOGIC BATAL / RESET ---
const handleReset = () => {
  showConfirmation(
    'Reset Form',
    'Semua inputan akan dihapus dan kembali ke awal. Lanjutkan?',
    () => {
      // Reset State
      form.nomor = '';
      form.customer = { kode: '', nama: '', alamat: '' };
      form.bankAccount = { kode: '', nama: '', rekening: '' };
      form.keterangan = '';
      form.metode = 'TRANSFER';
      invoiceList.value = [];
      selectedIds.value = [];
    }
  );
};

// --- LOGIC TUTUP ---
const handleClose = () => {
  if (isViewMode.value) {
    router.push({ name: 'PelunasanInvoice' });
    return;
  }

  // Cek apakah ada data yang sudah diisi
  if (form.customer.kode || selectedIds.value.length > 0) {
    showConfirmation(
      'Tutup Form',
      'Data yang belum disimpan akan hilang. Yakin ingin menutup form?',
      () => {
        markAsSaved();
        // [FIX] Arahkan eksplisit ke list agar tidak nyangkut
        router.push({ name: 'PelunasanInvoice' });
      }
    );
  } else {
    markAsSaved();
    router.push({ name: 'PelunasanInvoice' });
  }
};

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    loadDetail(nomor);
  } else {
    if (!authStore.can(MENU_ID, 'insert')) {
      toast.error("Akses ditolak.");
      router.back();
    }
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-hand-coin" desktop-mode>

    <template #header-actions>
      <v-btn v-if="!isViewMode" color="success" size="small" prepend-icon="mdi-content-save" :loading="isSaving"
        :disabled="totalAllocated <= 0" @click="handleSave">
        Simpan
      </v-btn>

      <v-btn v-if="!isViewMode" color="warning" variant="tonal" size="small" prepend-icon="mdi-refresh"
        @click="handleReset">
        Batal
      </v-btn>

      <v-btn size="small" prepend-icon="mdi-close" @click="handleClose">
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">

      <div class="left-column">
        <div class="desktop-form-section header-section">
          <div class="text-subtitle-2 font-weight-bold mb-3 text-primary">INFORMASI PEMBAYARAN</div>

          <v-text-field label="Nomor Bukti" v-model="form.nomor" readonly variant="filled" density="compact"
            placeholder="(Otomatis)" hide-details class="mb-3" />

          <v-text-field label="Tanggal Bayar" v-model="form.tanggal" type="date" variant="outlined" density="compact"
            :readonly="isViewMode" hide-details class="mb-3" />

          <v-text-field label="Customer / Marketplace" :model-value="form.customer.nama" readonly variant="outlined"
            density="compact" :append-inner-icon="!isViewMode ? 'mdi-magnify' : ''"
            :placeholder="!isViewMode ? 'Pilih Customer...' : ''"
            @click="!isViewMode && (dialogs.customerSearch = true)" hide-details
            :class="{ 'field-disabled': isViewMode }" class="mb-3" />

          <v-select label="Metode Pembayaran" v-model="form.metode" :items="['TRANSFER', 'TUNAI', 'GIRO']"
            variant="outlined" density="compact" :readonly="isViewMode" hide-details class="mb-3" />

          <v-expand-transition>
            <div v-if="form.metode === 'TRANSFER' || isViewMode">
              <v-text-field label="Akun Bank (Masuk Ke)"
                :model-value="form.bankAccount.rekening ? `${form.bankAccount.kode} - ${form.bankAccount.rekening}` : ''"
                readonly variant="outlined" density="compact" :append-inner-icon="!isViewMode ? 'mdi-bank' : ''"
                @click="!isViewMode && (dialogs.rekeningSearch = true)" hide-details class="mb-3" />
            </div>
          </v-expand-transition>

          <v-textarea label="Keterangan" v-model="form.keterangan" variant="outlined" density="compact" rows="3"
            :readonly="isViewMode" hide-details />
        </div>

        <div v-if="isViewMode" class="mt-auto pt-4 text-caption text-grey">
          <div>Dibuat oleh: <strong>{{ form.userCreate }}</strong></div>
        </div>
      </div>

      <div class="right-column">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="text-subtitle-2 font-weight-bold text-grey-darken-2">
            DAFTAR TAGIHAN (INVOICE)
          </div>
          <v-btn v-if="!isViewMode" size="x-small" variant="text" prepend-icon="mdi-refresh" :loading="isLoading"
            @click="loadOutstanding" :disabled="!form.customer.kode">
            Refresh
          </v-btn>
        </div>

        <div class="table-wrapper flex-grow-1">
          <v-data-table v-model="selectedIds" :headers="tableHeaders" :items="invoiceList" :loading="isLoading"
            :show-select="!isViewMode" item-value="ph_nomor" density="compact"
            class="desktop-table header-browse-blue border" fixed-header height="100%" :items-per-page="-1"
            hide-default-footer>
            <template v-slot:[`item.sisa_tagihan`]="{ item }">
              <span class="font-weight-medium">{{ formatRupiah(item.sisa_tagihan) }}</span>
            </template>

            <template v-slot:[`item.bayar`]="{ item }">
              <div v-if="!isViewMode">
                <v-text-field v-model.number="item.bayar" type="number" min="0" :max="item.sisa_tagihan"
                  variant="underlined" density="compact" hide-details class="text-right input-bayar"
                  :class="{ 'font-weight-bold text-primary': item.bayar > 0 }" prefix="Rp" />
              </div>
              <div v-else class="text-right font-weight-bold text-success">
                {{ formatRupiah(item.bayar) }}
              </div>
            </template>

            <template v-slot:no-data>
              <div class="pa-8 text-center text-grey">
                <v-icon icon="mdi-invoice-text-outline" size="40" class="mb-2 text-grey-lighten-1" />
                <div v-if="!form.customer.kode">Silakan pilih Customer terlebih dahulu.</div>
                <div v-else>Tidak ada tagihan outstanding.</div>
              </div>
            </template>
          </v-data-table>
        </div>

        <div
          class="footer-summary mt-2 pa-3 bg-grey-lighten-4 rounded border d-flex align-center justify-space-between">
          <div class="text-caption text-grey-darken-1 font-weight-medium">
            {{ isViewMode ? 'TOTAL PELUNASAN' : 'TOTAL YANG AKAN DIBAYARKAN' }}
          </div>
          <div class="text-h5 font-weight-bold" :class="isViewMode ? 'text-success' : 'text-primary'">
            {{ formatRupiah(totalAllocated) }}
          </div>
        </div>

      </div>
    </div>

    <CustomerSearchModal v-if="dialogs.customerSearch" :gudang="authStore.user?.cabang"
      @close="dialogs.customerSearch = false" @customer-selected="onCustomerSelected" />
    <RekeningSearchModal v-if="dialogs.rekeningSearch" :cabang="authStore.user?.cabang"
      @close="dialogs.rekeningSearch = false" @selected="onRekeningSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  display: flex;
  gap: 16px;
  height: calc(100vh - 64px - 48px);
  overflow: hidden;
}

.left-column {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-right: 4px;
}

.right-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.table-wrapper {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
}

.desktop-table {
  height: 100%;
}

.desktop-table :deep(th) {
  background-color: #0D47A1 !important;
  color: white !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  white-space: nowrap;
}

.input-bayar :deep(input) {
  text-align: right;
}

.field-disabled {
  pointer-events: none;
  opacity: 0.8;
}

.header-section {
  border: 1px solid #e0e0e0;
  padding: 16px;
  border-radius: 8px;
  background-color: #fff;
}
</style>

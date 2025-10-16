<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { format, addDays, parseISO, isValid } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/CustomerSearchModal.vue';
import AuthorizationModal from '@/components/AuthorizationModal.vue';
import { useToast } from 'vue-toastification';
import axios, { AxiosError } from 'axios';
import api from '@/services/api';

// --- Type Definitions ---
interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  level: string;
  isFranchise?: boolean;
}

interface Gudang {
  kode: string;
  nama: string;
}

interface Akun {
  kode: string;
  nama: string;
  rekening: string;
}

interface PotonganHeader {
  nomor: string;
  tanggal: string;
  gudang: Gudang;
  customer: Customer;
  nominalPotongan: number;
  akun: Akun;
  sisaPotongan: number;
  totalTerbayar: number;
}

interface PotonganDetail {
  id: number;
  invoice: string; // ptd_inv
  tanggalInvoice: string;
  top: number;
  jatuhTempo: string;
  nominalInvoice: number; // ph_nominal
  terbayarPiutang: number; // mBayar
  sisaPiutang: number; // (nominal - terbayar)
  bayar: number; // ptd_bayar (Potongan yang diterapkan ke inv ini)
  lunasi: boolean;
  tglBayar: string; // ptd_tanggal
  angsuranId: string; // ptd_angsur
}

// Mock API functions for demonstration
const mockApi = {
  getMaxNomor: (cabang: string, tanggal: string) => {
    const datePart = format(parseISO(tanggal), 'yyMM');
    return `${cabang}.POT.${datePart}.0001`;
  },
  fetchCustomer: async (kode: string, gudangKode: string): Promise<Customer | null> => {
    console.log(`[MOCK] Fetching customer ${kode}`);
    return { kode, nama: 'PT Contoh Jaya', alamat: 'Jl. Mock', kota: 'Mockville', telp: '123', level: 'Level 1' };
  },
  fetchInvoiceDetail: async (invoice: string): Promise<any> => {
    console.log(`[MOCK] Fetching invoice detail for ${invoice}`);
    return {
      invoice, tglInvoice: '2024-01-01', top: 30,
      nominal: 5000000, bayar: 1000000, sisa: 4000000
    };
  },
  syncData: (nomor: string) => {
    console.log(`[SYNC] Syncing data for ${nomor}`);
    return true;
  }
};

const toast = useToast();
const router = useRouter();
const route = useRoute();

const isEditMode = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const xdis = ref(0);
const authDialog = reactive({
  show: false,
  title: 'Otorisasi Potongan Piutang',
  kodeO: '',
  onSuccess: () => { },
  onCancel: () => { },
});

const header = reactive<PotonganHeader>({
  nomor: '',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  gudang: { kode: 'K01', nama: 'KANTOR PUSAT' },
  customer: { kode: '', nama: '', alamat: '', kota: '', telp: '', level: '' },
  nominalPotongan: 0,
  akun: { kode: 'D-111198', nama: 'POTONGAN PENJUALAN KENCANA PRINT', rekening: '003' },
  sisaPotongan: 0,
  totalTerbayar: 0,
});

const items = ref<PotonganDetail[]>([]);

const dialogs = reactive({
  customerSearch: false,
  nomorSearch: false,
  invoiceSearch: false,
});

// Computed properties
const pageTitle = computed(() => isEditMode.value ? 'Ubah Transaksi Potongan Piutang' : 'Input Potongan Piutang Baru');
const isHeaderDisabled = computed(() => isEditMode.value || items.value.some(item => !!item.invoice));

const tableHeaders = [
  { title: 'No', key: 'no', sortable: false, width: '40px' },
  { title: 'No. Invoice', key: 'invoice', sortable: false, width: '150px' },
  { title: 'Tgl. Invoice', key: 'tanggalInvoice', sortable: false, width: '100px' },
  { title: 'TOP', key: 'top', align: 'end', sortable: false, width: '60px' },
  { title: 'Jatuh Tempo', key: 'jatuhTempo', sortable: false, width: '100px' },
  { title: 'Nominal Inv', key: 'nominalInvoice', align: 'end', sortable: false, width: '120px' },
  { title: 'Terbayar', key: 'terbayarPiutang', align: 'end', sortable: false, width: '120px' },
  { title: 'Sisa Piutang', key: 'sisaPiutang', align: 'end', sortable: false, width: '120px' },
  { title: 'Bayar (Potongan)', key: 'bayar', align: 'end', sortable: false, width: '120px' },
  { title: 'Lunas?', key: 'lunasi', align: 'center', sortable: false, width: '80px' },
  { title: 'Aksi', key: 'actions', sortable: false, width: '60px' },
];

// Utility functions and event handlers
const calculateTotals = () => {
  let xTerbayar = 0;
  items.value.forEach(item => {
    if (item.invoice) {
      xTerbayar += item.bayar || 0;
    }
  });
  header.totalTerbayar = xTerbayar;
  header.sisaPotongan = header.nominalPotongan - xTerbayar;
};

const addNewRow = () => {
  if (items.value.length === 0 || items.value[items.value.length - 1].invoice) {
    items.value.push({
      id: Date.now() + Math.random(),
      invoice: '',
      tanggalInvoice: '',
      top: 0,
      jatuhTempo: '',
      nominalInvoice: 0,
      terbayarPiutang: 0,
      sisaPiutang: 0,
      bayar: 0,
      lunasi: false,
      tglBayar: format(new Date(), 'yyyy-MM-dd'),
      angsuranId: '',
    });
  }
};

const refreshData = () => {
  isEditMode.value = false;
  header.nomor = '';
  header.tanggal = format(new Date(), 'yyyy-MM-dd');
  header.customer = { kode: '', nama: '', alamat: '', kota: '', telp: '', level: '' };
  header.nominalPotongan = 0;
  header.akun = { kode: 'D-111198', nama: 'POTONGAN PENJUALAN KENCANA PRINT', rekening: '003' };
  items.value = [];
  addNewRow();
  calculateTotals();
};

const handleNomorSearch = () => {
  if (isEditMode.value) return;
  dialogs.nomorSearch = true;
};

const onNomorSelected = (nomor: string) => {
  header.nomor = nomor;
  loadDataAll(nomor);
  dialogs.nomorSearch = false;
};

const handleCustomerSearch = () => {
  if (isHeaderDisabled.value) {
    toast.error('Tidak dapat mengubah customer jika sudah ada invoice.');
    return;
  }
  dialogs.customerSearch = true;
};

const onCustomerSelected = async (cust: Customer | null) => {
  dialogs.customerSearch = false;
  if (cust) {
    header.customer = {
      kode: cust.kode,
      nama: cust.nama,
      alamat: cust.alamat,
      kota: cust.kota,
      telp: cust.telp,
      level: cust.level || '',
    };
    items.value = [];
    addNewRow();
  } else {
    refreshData();
  }
};

const handleNominalExit = () => {
  calculateTotals();
};

const handleInvoiceSearch = (item: PotonganDetail) => {
  if (isHeaderDisabled.value || !header.customer.kode) {
    toast.error('Customer harus diisi terlebih dahulu.');
    return;
  }
  dialogs.invoiceSearch = true;
};

const onInvoiceSelected = async (invoice: string) => {
  const activeItem = items.value.find(i => !i.invoice);
  if (!activeItem) return;

  const isDuplicate = items.value.some(i => i.invoice === invoice && i.id !== activeItem.id);
  if (isDuplicate) {
    toast.error(`Invoice ${invoice} sudah diinput.`);
    return;
  }

  const detail = await mockApi.fetchInvoiceDetail(invoice);

  if (detail) {
    const cAngsur = header.gudang.kode + 'POT' + format(new Date(), 'yyyyMMddHHmmssSSS');

    Object.assign(activeItem, {
      invoice: detail.invoice,
      tanggalInvoice: detail.tglInvoice,
      top: detail.top,
      jatuhTempo: format(addDays(parseISO(detail.tglInvoice), detail.top), 'yyyy-MM-dd'),
      nominalInvoice: detail.nominal,
      terbayarPiutang: detail.bayar,
      sisaPiutang: detail.sisa,
      bayar: 0,
      lunasi: false,
      tglBayar: format(new Date(), 'yyyy-MM-dd'),
      angsuranId: cAngsur,
    });
    addNewRow();
    calculateTotals();
  }
  dialogs.invoiceSearch = false;
};

const handleBayarChange = (item: PotonganDetail) => {
  if (!item.invoice) {
    item.bayar = 0;
    return;
  }

  if (item.bayar > item.sisaPiutang) {
    toast.error('Pembayaran melebihi sisa piutang.');
    item.bayar = item.sisaPiutang;
  } else if (item.bayar > header.sisaPotongan + (xdis.value || 0) && !isEditMode.value) {
    toast.error('Pembayaran melebihi sisa nominal potongan.');
    item.bayar = header.nominalPotongan - header.totalTerbayar;
  }

  calculateTotals();

  if (header.gudang.kode !== 'KDC' && item.bayar > 0) {
    xdis.value = item.bayar;
    const cpin = format(new Date(), 'yyyMMddHHmmssS');
    authDialog.kodeO = cpin.slice(-3);
    authDialog.show = true;
    authDialog.onSuccess = () => {
      xdis.value = 0;
    };
    authDialog.onCancel = () => {
      item.bayar = 0;
      calculateTotals();
      xdis.value = 0;
    };
  }
};

const handleLunasiChange = (item: PotonganDetail) => {
  if (!item.invoice) {
    item.lunasi = false;
    return;
  }

  if (item.lunasi) {
    const currentSisaPotongan = header.sisaPotongan + (item.bayar || 0);
    if (item.sisaPiutang > currentSisaPotongan) {
      item.bayar = currentSisaPotongan;
    } else {
      item.bayar = item.sisaPiutang;
    }
  } else {
    item.bayar = 0;
  }

  if (item.bayar > 0) {
    handleBayarChange(item);
  } else {
    calculateTotals();
  }
};

const handleDeleteItem = (itemToDelete: PotonganDetail) => {
  items.value = items.value.filter(item => item.id !== itemToDelete.id);
  addNewRow();
  calculateTotals();
};

const handleAuthSuccess = () => {
  authDialog.show = false;
  authDialog.onSuccess();
};

const handleAuthCancel = () => {
  authDialog.show = false;
  authDialog.onCancel();
};

const simpanData = async () => {
  const isSisaZero = header.sisaPotongan === 0;

  if (!isSisaZero) {
    if (!confirm('Sisa Potongan masih ada. Yakin ingin simpan?')) return;
  }

  isSaving.value = true;
  try {
    if (!header.customer.kode) { toast.error('Customer harus diisi.'); return; }
    if (header.nominalPotongan <= 0) { toast.error('Nominal harus diisi.'); return; }
    if (header.sisaPotongan < 0) { toast.error('Sisa pembayaran minus. Cek lagi.'); return; }
    if (!header.akun.kode) { toast.error('No.Akun harus diisi.'); return; }

    if (!isEditMode.value) {
      header.nomor = mockApi.getMaxNomor(header.gudang.kode, header.tanggal);
    }

    await api.post('/potongan/save', {
      header: header,
      details: items.value.filter(i => i.invoice)
    });

    mockApi.syncData(header.nomor);

    toast.success(`Transaksi Potongan ${header.nomor} berhasil disimpan.`);
    refreshData();
  } catch (error) {
    const errorMessage = error instanceof AxiosError ? error.response?.data?.message : 'Gagal Simpan. Lakukan Rollback.';
    toast.error(errorMessage);
    console.error(error);
  } finally {
    isSaving.value = false;
  }
};

const loadDataAll = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/potongan/edit/${nomor}`);
    const data = response.data;

    if (data.header) {
      isEditMode.value = true;
      Object.assign(header, data.header);
      items.value = data.details.map((item: any, index: number) => ({
        ...item,
        id: index,
        lunasi: item.bayar >= item.sisaPiutang,
      }));
      addNewRow();
      calculateTotals();
    } else {
      toast.error('Nomor tersebut tidak ditemukan.');
      isEditMode.value = false;
      refreshData();
    }
  } catch (error) {
    toast.error('Gagal memuat data.');
    console.error(error);
    refreshData();
  } finally {
    isLoading.value = false;
  }
};

watch(() => header.nominalPotongan, calculateTotals);
watch(items, calculateTotals, { deep: true });

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    loadDataAll(nomor);
  } else {
    refreshData();
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-receipt">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="simpanData" :loading="isSaving"
        :disabled="isSaving || header.totalTerbayar === 0">
        Simpan
      </v-btn>
      <v-btn v-if="!isEditMode" size="small" @click="refreshData">
        Batal
      </v-btn>
      <v-btn size="small" @click="router.push('/piutang/potongan')">
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <v-card class="desktop-form-section header-section" elevation="0">
          <v-card-text>
            <v-row dense>
              <v-col cols="6">
                <v-text-field label="Kode Cabang" v-model="header.gudang.kode" density="compact" readonly
                  variant="filled" hide-details />
              </v-col>
              <v-col cols="6">
                <v-text-field label="Tanggal" v-model="header.tanggal" type="date" density="compact"
                  :readonly="isEditMode" hide-details variant="outlined" />
              </v-col>
              <v-col cols="6">
                <v-text-field label="Nama Cabang" v-model="header.gudang.nama" density="compact" readonly
                  variant="filled" hide-details />
              </v-col>
              <v-col cols="6">
                <v-text-field label="Nomor Potongan" v-model="header.nomor" density="compact"
                  :readonly="isEditMode" @click="!isEditMode && handleNomorSearch()"
                  prepend-inner-icon="mdi-magnify" placeholder="F1 atau Klik..." hide-details class="mb-2"
                  variant="outlined">
                  <template #append-inner>
                    <v-chip size="small" :color="isEditMode ? 'orange' : 'success'">
                      {{ isEditMode ? 'Ubah' : 'Baru' }}
                    </v-chip>
                  </template>
                </v-text-field>
              </v-col>
              
              <v-divider class="my-2"></v-divider>
              <v-card-text class="pa-2 text-caption font-weight-bold">Data Customer</v-card-text>
              
              <v-col cols="6">
                <v-text-field label="Kode Customer" v-model="header.customer.kode" density="compact"
                  :readonly="isHeaderDisabled" @click="handleCustomerSearch"
                  @keydown.f1.prevent="handleCustomerSearch" prepend-inner-icon="mdi-magnify"
                  placeholder="F1 atau Klik..." hide-details variant="outlined" />
              </v-col>
              <v-col cols="6">
                <v-text-field label="Nama Customer" v-model="header.customer.nama" density="compact"
                  readonly hide-details variant="filled" />
              </v-col>
              <v-col cols="6">
                <v-text-field label="Alamat" v-model="header.customer.alamat" density="compact" readonly
                  hide-details variant="filled" />
              </v-col>
              <v-col cols="6">
                <v-text-field label="Kota" v-model="header.customer.kota" density="compact" readonly
                  hide-details variant="filled" />
              </v-col>
              <v-col cols="6">
                <v-text-field label="Telepon" v-model="header.customer.telp" density="compact" readonly
                  hide-details variant="filled" />
              </v-col>
              
              <v-divider class="my-2"></v-divider>
              <v-card-text class="pa-2 text-caption font-weight-bold">Potongan & Akun</v-card-text>
              
              <v-col cols="6">
                <v-text-field id="edtNominal" label="Nominal Potongan (IDR)" v-model.number="header.nominalPotongan"
                  type="number" min="0" density="compact" :readonly="isEditMode" @blur="handleNominalExit"
                  hide-details variant="outlined" />
              </v-col>
              <v-col cols="6">
                <v-text-field label="Kode Akun" v-model="header.akun.kode" density="compact" readonly
                  hide-details variant="filled" />
              </v-col>
              <v-col cols="6">
                <v-text-field label="No. Rekening" v-model="header.akun.rekening" density="compact"
                  readonly hide-details variant="filled" />
              </v-col>
              <v-col cols="12">
                <v-text-field label="Nama Akun" v-model="header.akun.nama" density="compact" readonly
                  hide-details variant="filled" />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
        
        <v-card class="desktop-form-section footer-section mt-4" elevation="2">
          <v-card-title class="pa-2 text-success">Ringkasan</v-card-title>
          <v-card-text>
            <v-text-field label="Total Potongan Dialokasikan"
              :model-value="header.totalTerbayar.toLocaleString('id-ID')" readonly
              variant="filled" density="compact" hide-details
              class="text-right font-weight-bold text-h6 summary-field"></v-text-field>
              
            <v-text-field label="Sisa Potongan"
              :model-value="header.sisaPotongan.toLocaleString('id-ID')" readonly
              variant="filled" density="compact" hide-details
              :class="['text-right', 'font-weight-bold', 'text-h6', 'summary-field', header.sisaPotongan < 0 ? 'text-error' : '']"></v-text-field>
          </v-card-text>
        </v-card>
      </div>

      <div class="right-column">
        <v-card class="desktop-form-section" elevation="2">
          <v-card-title class="pa-2 text-secondary">Detail Invoice Piutang yang Dipotong</v-card-title>
          <v-data-table :headers="tableHeaders" :items="items" item-value="id" class="full-height-table"
            :items-per-page="-1">
            <template #item.no="{ index }">{{ index + 1 }}</template>
            <template #item.invoice="{ item, index }">
              <v-text-field v-model="item.invoice" variant="underlined" density="compact" hide-details
                placeholder="F1 atau Klik..." :readonly="isHeaderDisabled || !!item.invoice"
                @click="!isHeaderDisabled && !item.invoice && handleInvoiceSearch(item)"
                @keydown.f1.prevent="!isHeaderDisabled && !item.invoice && handleInvoiceSearch(item)" />
            </template>
            <template #item.tanggalInvoice="{ item }">
              <span class="text-caption">
                {{ item.tanggalInvoice ? format(parseISO(item.tanggalInvoice), 'dd/MM/yyyy') : '' }}
              </span>
            </template>
            <template #item.jatuhTempo="{ item }">
              <span class="text-caption">
                {{ item.jatuhTempo ? format(parseISO(item.jatuhTempo), 'dd/MM/yyyy') : '' }}
              </span>
            </template>
            <template #item.nominalInvoice="{ item }">
              <span class="text-caption text-right d-block">
                {{ item.nominalInvoice.toLocaleString('id-ID') }}
              </span>
            </template>
            <template #item.terbayarPiutang="{ item }">
              <span class="text-caption text-right d-block">
                {{ item.terbayarPiutang.toLocaleString('id-ID') }}
              </span>
            </template>
            <template #item.sisaPiutang="{ item }">
              <span class="text-caption text-right d-block">
                {{ item.sisaPiutang.toLocaleString('id-ID') }}
              </span>
            </template>
            <template #item.bayar="{ item }">
              <v-text-field v-model.number="item.bayar" type="number" min="0" variant="underlined"
                density="compact" hide-details class="text-right" :disabled="isEditMode || !item.invoice"
                @blur="handleBayarChange(item)" />
            </template>
            <template #item.lunasi="{ item }">
              <v-checkbox v-model="item.lunasi" density="compact" :disabled="isEditMode || !item.invoice"
                @change="handleLunasiChange(item)" hide-details class="justify-center" />
            </template>
            <template #item.actions="{ item }">
              <v-btn v-if="item.invoice && !isEditMode" icon="mdi-delete" variant="text" color="error" size="x-small"
                @click="handleDeleteItem(item)" title="Hapus Baris" />
            </template>
            <template #tfoot>
              <tr>
                <td colspan="8" class="text-right font-weight-bold">Total Potongan Dialokasikan:</td>
                <td class="text-right font-weight-bold">
                  {{ header.totalTerbayar.toLocaleString('id-ID') }}
                </td>
                <td colspan="2"></td>
              </tr>
              <tr>
                <td colspan="8" class="text-right font-weight-bold">Sisa Potongan:</td>
                <td :class="['text-right', 'font-weight-bold', header.sisaPotongan < 0 ? 'text-error' : '']">
                  {{ header.sisaPotongan.toLocaleString('id-ID') }}
                </td>
                <td colspan="2"></td>
              </tr>
              <tr>
                 <td colspan="11">
                    <div class="pa-2 d-flex justify-end">
                       <v-btn v-if="!isEditMode && items.some(i => i.invoice === '')" color="primary" prepend-icon="mdi-plus" @click="addNewRow">
                         Tambah Baris
                       </v-btn>
                    </div>
                 </td>
              </tr>
            </template>
          </v-data-table>
        </v-card>
      </div>
    </div>
    
    <CustomerSearchModal v-if="dialogs.customerSearch" :gudang="header.gudang.kode"
      @close="dialogs.customerSearch = false" @customer-selected="onCustomerSelected" />
    <AuthorizationModal v-if="authDialog.show" :title="authDialog.title" :challenge-code="authDialog.kodeO"
      @close="handleAuthCancel" @success="handleAuthSuccess" />

    <v-overlay :model-value="isLoading || isSaving" class="align-center justify-center" contained persistent>
      <v-progress-circular color="primary" indeterminate size="64"></v-progress-circular>
    </v-overlay>
  </PageLayout>
</template>


<style scoped>
/* Struktur grid untuk desktop layout */
.form-grid-container {
    display: grid;
    grid-template-columns: 350px 1fr; /* Kolom kiri tetap, kolom kanan mengisi sisa */
    gap: 16px;
    height: 100%;
}

.left-column {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.right-column {
    /* Pastikan kolom kanan mengisi sisa ruang */
    min-height: 500px;
    display: flex;
    flex-direction: column;
}

.desktop-table :deep(.v-data-table__wrapper) {
    overflow-x: auto;
    overflow-y: auto;
    height: 100%;
}

.desktop-table :deep(.v-text-field) {
    margin: 0 !important;
    padding: 0 !important;
}

/* Custom style untuk field summary agar terlihat berbeda */
.summary-field :deep(input) {
    font-size: 1.1rem;
    color: #1b5e20 !important; /* Hijau tua */
}
</style>
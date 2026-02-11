<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { format, parseISO } from 'date-fns';
import { formatRupiah } from "@/utils/formatRupiah";
import InvoiceSearchModal from '@/components/lookup/InvoiceSearchModal.vue';
import type { AxiosError } from 'axios';

interface BiayaKirimLookupInvoice {
  Nomor: string;
  Tanggal: string;
  Nominal: number;
  KdCus: string;
  Customer: string;
  Alamat: string;
  Sisa?: number;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();

// --- State ---
const isNew = ref(!route.params.nomor);
const isLoading = ref(false);
const dialogs = reactive({
  invoiceSearch: false,
  confirmSave: false, // Dialog "Yakin ingin simpan?"
  printOption: false  // Dialog "Ingin Cetak?"
});
const savedNomor = ref('');

const form = reactive({
  nomor: 'AUTO',
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  inv_nomor: '',
  inv_tanggal: '',
  nominal_inv: 0,
  cust_kode: '',
  cust_nama: '',
  cust_alamat: '',
  cust_kota: '',
  cust_telp: '',
  biaya: 0,
  keterangan: ''
});

// --- Methods ---

const loadInvoiceDetail = async (inv: BiayaKirimLookupInvoice) => {
  dialogs.invoiceSearch = false;
  form.inv_nomor = inv.Nomor;

  try {
    const res = await api.get(`/biaya-kirim-form/invoice-details/${inv.Nomor}`);
    const d = res.data;

    // Mapping data dari hasil API ke form
    form.inv_tanggal = d.inv_tanggal ? format(parseISO(d.inv_tanggal), 'dd/MM/yyyy') : '';
    form.nominal_inv = d.nominal || 0;
    form.cust_kode = d.cus_kode;
    form.cust_nama = d.cus_nama;
    form.cust_alamat = d.cus_alamat;
    form.cust_kota = d.cus_kota;
    form.cust_telp = d.cus_telp;
  } catch (e) {
    toast.error("Gagal ambil detail invoice", e);
  }
};

// Pemicu Simpan: Buka Dialog Konfirmasi dulu
const triggerSave = () => {
  if (!form.inv_nomor) return toast.warning("Invoice belum diisi");
  if (Number(form.biaya) <= 0) return toast.warning("Biaya Kirim belum diisi");
  dialogs.confirmSave = true;
};

const handleSave = async () => {
  dialogs.confirmSave = false;
  isLoading.value = true;

  try {
    const res = await api.post('/biaya-kirim-form/save', {
      isNew: isNew.value,
      header: form
    });

    savedNomor.value = res.data.nomor;
    toast.success(`Tersimpan: ${res.data.nomor}`);

    // Setelah sukses, tawarkan cetak
    dialogs.printOption = true;
  } catch (err: unknown) {
    // Casting error ke AxiosError agar aman
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal simpan");
  } finally {
    isLoading.value = false;
  }
};

const handlePrint = () => {
  dialogs.printOption = false;
  const url = router.resolve({ name: 'Cetak Biaya Kirim', params: { nomor: savedNomor.value } }).href;
  window.open(url, '_blank');
  router.push('/transaksi/penjualan/biaya-kirim');
};

const closeAll = () => {
  dialogs.printOption = false;
  router.push('/transaksi/penjualan/biaya-kirim');
};

onMounted(async () => {
  const nomorDariUrl = route.params.nomor;

  // Hanya jalankan jika bukan mode "Baru" dan parameter nomor tersedia
  if (!isNew.value && nomorDariUrl && nomorDariUrl !== 'undefined') {
    isLoading.value = true;
    try {
      const res = await api.get(`/biaya-kirim-form/${nomorDariUrl}`);
      const d = res.data;

      if (d) {
        // Mapping manual untuk memastikan data masuk ke property reactive yang benar
        form.nomor = d.bk_nomor;
        form.tanggal = d.bk_tanggal ? format(parseISO(d.bk_tanggal), 'yyyy-MM-dd') : '';
        form.inv_nomor = d.bk_inv_nomor;
        form.inv_tanggal = d.inv_tanggal ? format(parseISO(d.inv_tanggal), 'dd/MM/yyyy') : '';
        form.nominal_inv = d.nominal_inv || 0;
        form.cust_kode = d.cus_kode;
        form.cust_nama = d.cus_nama;
        form.cust_alamat = d.cus_alamat;
        form.cust_kota = d.cus_kota;
        form.cust_telp = d.cus_telp;
        form.biaya = d.bk_nominal;
        form.keterangan = d.bk_ket;
      } else {
        toast.error("Data tidak ditemukan di database.");
      }
    } catch (e) {
      toast.error("Gagal memuat data: " + e);
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  }
});
</script>

<template>
  <PageLayout :title="isNew ? 'Input Biaya Kirim' : 'Edit Biaya Kirim'" icon="mdi-truck-delivery">
    <template #header-actions>
      <v-btn color="primary" size="small" @click="triggerSave" :loading="isLoading">Simpan</v-btn>
      <v-btn variant="outlined" size="small" class="ms-2" @click="router.back()">Batal</v-btn>
    </template>

    <div class="standard-form-11">
      <v-row dense>
        <v-col cols="12" md="6">
          <v-card variant="outlined" class="pa-4 custom-border">
            <div class="section-title mb-4">INFORMASI TRANSAKSI</div>
            <v-row dense>
              <v-col cols="6"><v-text-field v-model="form.nomor" label="Nomor BK" readonly density="compact"
                  variant="filled" /></v-col>
              <v-col cols="6"><v-text-field v-model="form.tanggal" label="Tanggal BK" type="date"
                  density="compact" /></v-col>
            </v-row>
            <v-text-field v-model="form.inv_nomor" label="Nomor Invoice (F1)" prepend-inner-icon="mdi-magnify" readonly
              @click="isNew && (dialogs.invoiceSearch = true)" density="compact" />
            <v-row dense>
              <v-col cols="6"><v-text-field v-model="form.inv_tanggal" label="Tanggal Invoice" readonly
                  density="compact" variant="filled" /></v-col>
              <v-col cols="6"><v-text-field :model-value="formatRupiah(form.nominal_inv)" label="Nominal Invoice"
                  readonly density="compact" variant="filled" /></v-col>
            </v-row>
          </v-card>
        </v-col>
        <v-col cols="12" md="6">
          <v-card variant="outlined" class="pa-4 custom-border">
            <div class="section-title mb-4">PENERIMA & BIAYA</div>
            <v-text-field v-model="form.cust_nama" label="Nama Customer" readonly density="compact" variant="filled" />
            <v-textarea v-model="form.cust_alamat" label="Alamat" readonly rows="2" density="compact"
              variant="filled" />
            <v-row dense>
              <v-col cols="6"><v-text-field v-model="form.cust_kota" label="Kota" readonly density="compact"
                  variant="filled" /></v-col>
              <v-col cols="6"><v-text-field v-model="form.cust_telp" label="Telepon" readonly density="compact"
                  variant="filled" /></v-col>
            </v-row>
            <v-row dense class="mt-2">
              <v-col cols="6"><v-text-field v-model.number="form.biaya" label="Biaya Kirim (Rp)" type="number"
                  density="compact" variant="outlined" class="biaya-field" color="success" /></v-col>
              <v-col cols="6"><v-text-field v-model="form.keterangan" label="Keterangan" density="compact"
                  variant="outlined" /></v-col>
            </v-row>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <v-dialog v-model="dialogs.confirmSave" max-width="350">
      <v-card>
        <v-card-title class="text-subtitle-1">Konfirmasi Simpan</v-card-title>
        <v-card-text class="text-body-2">Yakin ingin menyimpan data Biaya Kirim ini?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogs.confirmSave = false">Batal</v-btn>
          <v-btn color="primary" @click="handleSave">Ya, Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogs.printOption" max-width="400" persistent>
      <v-card class="text-center pa-4">
        <v-icon color="success" size="64" class="mb-2">mdi-check-circle</v-icon>
        <v-card-title class="justify-center">Data Tersimpan!</v-card-title>
        <v-card-text>Nomor: <strong>{{ savedNomor }}</strong><br>Ingin cetak bukti transaksi ini?</v-card-text>
        <v-card-actions class="justify-center">
          <v-btn color="primary" variant="elevated" prepend-icon="mdi-printer" @click="handlePrint">Cetak</v-btn>
          <v-btn variant="outlined" class="ms-2" @click="closeAll">Tutup</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <InvoiceSearchModal v-if="dialogs.invoiceSearch" source="biaya-kirim" @close="dialogs.invoiceSearch = false"
      @invoice-selected="loadInvoiceDetail" />
  </PageLayout>
</template>

<style scoped>
.standard-form-11 :deep(.v-label),
.standard-form-11 :deep(input),
.standard-form-11 :deep(textarea) {
  font-size: 11px !important;
}

.section-title {
  font-size: 11px;
  font-weight: 800;
  color: #1976D2;
  border-bottom: 2px solid #e3f2fd;
}

.biaya-field :deep(input) {
  font-size: 13px !important;
  color: #2E7D32 !important;
  font-weight: bold;
}
</style>

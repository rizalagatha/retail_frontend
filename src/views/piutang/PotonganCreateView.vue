<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";
import InvoiceSearchModal from "@/components/lookup/InvoiceSearchModal.vue";
import BiayaKirimSearchModal from "@/components/lookup/BiayaKirimSearchModal.vue";
import { useToast } from "vue-toastification";
import type { AxiosError } from "axios";
import api from "@/services/api";
import axios from "axios";

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
  [key: string]: string | number | Gudang | Customer | Akun | undefined;
}

interface PotonganDetail {
  id: number;
  invoice: string;
  tanggalInvoice: string;
  top: number;
  jatuhTempo: string;
  nominalInvoice: number;
  terbayarPiutang: number;
  sisaPiutang: number;
  bayar: number;
  lunasi: boolean;
  tglBayar: string;
  angsuranId: string;
  pin: string;
  [key: string]: string | number | boolean | undefined; // [TAMBAHKAN INI] Lebih spesifik
}

interface SelectedInvoice {
  invoice: string;
  tanggalInvoice: string;
  top: number;
  jatuhTempo: string;
  nominalInvoice: number;
  terbayarPiutang: number;
  sisaPiutang: number;
}

interface BiayaKirimItem {
  Nomor: string;
  Tanggal: string;
  Nominal: number;
  Bayar: number;
  Sisa: number;
}

const toast = useToast();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const MENU_ID = "53";

const isEditMode = ref(false);
const isLoading = ref(true);
const isSaving = ref(false);

const header = reactive<PotonganHeader>({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  gudang: { kode: "K01", nama: "KANTOR PUSAT" },
  customer: { kode: "", nama: "", alamat: "", kota: "", telp: "", level: "" },
  nominalPotongan: 0,
  akun: { kode: "D-111198", nama: "POTONGAN PENJUALAN KENCANA PRINT", rekening: "003" },
  sisaPotongan: 0,
  totalTerbayar: 0,
});

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
  onCancel: () => {
    dialogConfirm.show = false;
  },
});

const items = ref<PotonganDetail[]>([]);

const dialogs = reactive({
  customerSearch: false,
  invoiceSearch: false,
  gudangSearch: false,
  biayaKirimSearch: false,
});

// Computed properties
const pageTitle = computed(() =>
  isEditMode.value ? "Ubah Transaksi Potongan Piutang" : "Input Potongan Piutang Baru"
);
const isHeaderDisabled = computed(
  () => isEditMode.value || items.value.some((item) => !!item.invoice)
);
const canView = computed(() => authStore.can(MENU_ID, "view"));
const canInsert = computed(() => authStore.can(MENU_ID, "insert"));
const canEdit = computed(() => authStore.can(MENU_ID, "edit"));
// Izin simpan bergantung pada mode (insert/edit)
const canSave = computed(() => (isEditMode.value ? canEdit.value : canInsert.value));

const tableHeaders = [
  { title: "No", key: "no", sortable: false, width: "40px" },
  { title: "No. Invoice", key: "invoice", sortable: false, width: "150px" },
  { title: "Tgl. Invoice", key: "tanggalInvoice", sortable: false, width: "100px" },
  { title: "TOP", key: "top", align: "end", sortable: false, width: "60px" },
  { title: "Jatuh Tempo", key: "jatuhTempo", sortable: false, width: "100px" },
  { title: "Nominal Inv", key: "nominalInvoice", align: "end", sortable: false, width: "120px" },
  { title: "Terbayar", key: "terbayarPiutang", align: "end", sortable: false, width: "120px" },
  { title: "Sisa Piutang", key: "sisaPiutang", align: "end", sortable: false, width: "120px" },
  { title: "Bayar (Potongan)", key: "bayar", align: "end", sortable: false, width: "120px" },
  { title: "Lunas?", key: "lunasi", align: "center", sortable: false, width: "80px" },
  { title: "Aksi", key: "actions", sortable: false, width: "60px" },
] as const;

// Utility functions and event handlers
const calculateTotals = () => {
  let xTerbayar = 0;
  items.value.forEach((item) => {
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
      invoice: "",
      tanggalInvoice: "",
      top: 0,
      jatuhTempo: "",
      nominalInvoice: 0,
      terbayarPiutang: 0,
      sisaPiutang: 0,
      bayar: 0,
      lunasi: false,
      tglBayar: format(new Date(), "yyyy-MM-dd"),
      angsuranId: "",
      pin: "",
    });
  }
};

const resetForm = () => {
  isEditMode.value = false;
  header.nomor = "";
  header.tanggal = format(new Date(), "yyyy-MM-dd");
  header.customer = { kode: "", nama: "", alamat: "", kota: "", telp: "", level: "" };
  header.nominalPotongan = 0;
  // Data akun dan gudang dari initial load
  loadInitialData();
  items.value = [];
  addNewRow();
  calculateTotals();
};

const loadInitialData = async () => {
  try {
    const response = await api.get("/potongan-form/initial-data");
    header.gudang = response.data.gudang;
    header.akun = response.data.akun;
  } catch (error: unknown) {
    let msg = "Gagal memuat data awal form.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  }
};

const handleBatal = () => {
  showConfirmation("Konfirmasi Batal", "Akan membatalkan semua perubahan?", () => {
    if (isEditMode.value) {
      loadDataAll(route.params.nomor as string);
    } else {
      resetForm();
    }
  });
};

const handleTutup = () => {
  showConfirmation(
    "Konfirmasi Tutup",
    "Tutup form? Perubahan yang belum disimpan akan hilang.",
    () => {
      router.push("/piutang/potongan"); // Pastikan ini rute browse
    }
  );
};

const handleCustomerSearch = () => {
  if (isHeaderDisabled.value) {
    toast.error("Tidak dapat mengubah customer jika sudah ada invoice.");
    return;
  }
  dialogs.customerSearch = true;
};

const onCustomerSelected = async (cust: Customer | null) => {
  dialogs.customerSearch = false;
  if (cust) {
    header.customer = { ...cust, level: cust.level || "" };
    items.value = [];
    addNewRow();
  } else {
    // Jangan refresh, cukup clear customer
    header.customer = { kode: "", nama: "", alamat: "", kota: "", telp: "", level: "" };
    items.value = [];
    addNewRow();
  }
};

const handleGudangSearch = () => {
  if (isHeaderDisabled.value) {
    toast.warning("Tidak dapat mengubah cabang jika sudah ada invoice terpilih.");
    return;
  }
  dialogs.gudangSearch = true;
};

const onGudangSelected = (gudang: Gudang) => {
  dialogs.gudangSearch = false;
  if (gudang && gudang.kode !== header.gudang.kode) {
    header.gudang = gudang;

    // Reset customer dan items karena pindah cabang
    header.customer = { kode: "", nama: "", alamat: "", kota: "", telp: "", level: "" };
    items.value = [];
    addNewRow();
    calculateTotals();
    toast.success(`Cabang diubah ke ${gudang.nama}. Customer direset.`);
  }
};

const handleNominalExit = () => {
  calculateTotals();
};

const handleInvoiceSearch = () => {
  if (isHeaderDisabled.value || !header.customer.kode) {
    toast.error("Customer harus diisi terlebih dahulu.");
    return;
  }
  dialogs.invoiceSearch = true;
};

const onInvoiceSelected = async (invoice: SelectedInvoice) => {
  const activeItem = items.value.find((i) => !i.invoice);
  if (!activeItem) return;

  const isDuplicate = items.value.some(
    (i) => i.invoice === invoice.invoice && i.id !== activeItem.id
  );
  if (isDuplicate) {
    toast.error(`Invoice ${invoice.invoice} sudah diinput.`);
    return;
  }

  const cAngsur = header.gudang.kode + "POT" + format(new Date(), "yyyyMMddHHmmssSSS");

  Object.assign(activeItem, {
    invoice: invoice.invoice,
    tanggalInvoice: invoice.tanggalInvoice,
    top: invoice.top,
    jatuhTempo: invoice.jatuhTempo,
    nominalInvoice: invoice.nominalInvoice,
    terbayarPiutang: invoice.terbayarPiutang,
    sisaPiutang: invoice.sisaPiutang,
    bayar: 0,
    lunasi: false,
    tglBayar: format(new Date(), "yyyy-MM-dd"),
    angsuranId: cAngsur,
  });

  addNewRow();
  calculateTotals();
  dialogs.invoiceSearch = false;
};

// Fungsi pencarian
const handleBiayaKirimSearch = () => {
  if (isHeaderDisabled.value || !header.customer.kode) {
    toast.error("Customer harus diisi terlebih dahulu.");
    return;
  }
  dialogs.biayaKirimSearch = true;
};

// Fungsi saat dipilih
const onBiayaKirimSelected = async (bk: BiayaKirimItem) => {
  const activeItem = items.value.find((i) => !i.invoice);
  if (!activeItem) return;

  const isDuplicate = items.value.some((i) => i.invoice === bk.Nomor && i.id !== activeItem.id);

  if (isDuplicate) {
    toast.error(`Biaya Kirim ${bk.Nomor} sudah diinput.`);
    return;
  }

  const cAngsur = header.gudang.kode + "POT" + format(new Date(), "yyyyMMddHHmmssSSS");

  Object.assign(activeItem, {
    invoice: bk.Nomor,
    tanggalInvoice: bk.Tanggal,
    top: 0,
    jatuhTempo: bk.Tanggal,
    nominalInvoice: bk.Nominal,
    terbayarPiutang: bk.Bayar,
    sisaPiutang: bk.Sisa,
    bayar: 0,
    lunasi: false,
    tglBayar: format(new Date(), "yyyy-MM-dd"),
    angsuranId: cAngsur,
  });

  addNewRow();
  calculateTotals();
  dialogs.biayaKirimSearch = false;
};

// --- [REFACTOR] Handle Bayar Change (Auth Baru) ---
const handleBayarChange = (item: PotonganDetail) => {
  if (!item.invoice) {
    item.bayar = 0;
    return;
  }

  // 1. Hitung total bayar dari baris LAIN (selain baris yang sedang diedit)
  const terbayarLain = items.value.reduce((sum, i) => {
    return i.id !== item.id ? sum + (Number(i.bayar) || 0) : sum;
  }, 0);

  // 2. Hitung jatah potongan yang benar-benar tersisa untuk baris ini
  const jatahTersisa = header.nominalPotongan - terbayarLain;

  // 3. Validasi & Koreksi Otomatis
  if (item.bayar > item.sisaPiutang) {
    toast.error("Pembayaran melebihi sisa piutang.");
    // Ambil nilai terkecil antara sisa piutang atau jatah tersisa
    item.bayar = Math.min(item.sisaPiutang, jatahTersisa > 0 ? jatahTersisa : 0);
  } else if (item.bayar > jatahTersisa && !isEditMode.value) {
    toast.error("Pembayaran melebihi sisa nominal potongan yang tersedia.");
    item.bayar = jatahTersisa > 0 ? jatahTersisa : 0;
  }

  // 4. Proteksi Anti-Minus Mutlak
  if (item.bayar < 0) item.bayar = 0;

  // 5. Kalkulasi Total Akhir
  calculateTotals();
};

const handleLunasiChange = (item: PotonganDetail) => {
  if (!item.invoice) {
    item.lunasi = false;
    return;
  }

  if (item.lunasi) {
    // Hitung jatah yang tersedia tanpa menghitung baris ini
    const terbayarLain = items.value.reduce((sum, i) => {
      return i.id !== item.id ? sum + (Number(i.bayar) || 0) : sum;
    }, 0);
    const jatahTersisa = header.nominalPotongan - terbayarLain;

    if (item.sisaPiutang > jatahTersisa) {
      item.bayar = jatahTersisa > 0 ? jatahTersisa : 0;
    } else {
      item.bayar = item.sisaPiutang;
    }
  } else {
    item.bayar = 0;
  }

  // Proteksi Anti-Minus
  if (item.bayar < 0) item.bayar = 0;

  // Kalkulasi Total Akhir
  calculateTotals();
};

const handleDeleteItem = (itemToDelete: PotonganDetail) => {
  items.value = items.value.filter((item) => item.id !== itemToDelete.id);
  addNewRow();
  calculateTotals();
};

const simpanData = () => {
  if (!canSave.value) {
    toast.error("Anda tidak memiliki izin untuk menyimpan data ini.");
    return;
  }
  // Validasi
  if (!header.customer.kode) {
    toast.error("Customer harus diisi.");
    return;
  }
  if (header.nominalPotongan <= 0) {
    toast.error("Nominal harus diisi.");
    return;
  }
  if (header.sisaPotongan < 0) {
    toast.error("Sisa pembayaran minus. Cek lagi.");
    return;
  }
  if (!header.akun.kode) {
    toast.error("No.Akun harus diisi.");
    return;
  }
  if (header.totalTerbayar === 0) {
    toast.error("Total alokasi potongan masih nol.");
    return;
  }

  if (header.sisaPotongan !== 0) {
    showConfirmation(
      "Konfirmasi Simpan",
      "Sisa Potongan masih ada. Yakin ingin simpan?",
      executeSave
    );
  } else {
    showConfirmation("Konfirmasi Simpan", "Yakin ingin simpan?", executeSave);
  }
};

const executeSave = async () => {
  if (!canSave.value) {
    toast.error("Anda tidak memiliki izin untuk menyimpan data ini.");
    isSaving.value = false; // Pastikan loading dihentikan
    return;
  }
  isSaving.value = true;
  try {
    const payload = {
      header,
      details: items.value.filter((i) => i.invoice && i.bayar > 0),
      isEditMode: isEditMode.value,
    };

    const response = isEditMode.value
      ? await api.put(`/potongan-form/${header.nomor}`, payload)
      : await api.post("/potongan-form", payload);

    toast.success(response.data.message);

    // --- [PERBAIKAN] Arahkan kembali ke halaman browse ---
    router.push("/piutang/potongan");
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    const errorMessage = error.response?.data?.message || "Gagal Simpan. Lakukan Rollback.";
    toast.error(errorMessage);
    console.error(error);
  } finally {
    isSaving.value = false;
  }
};

const loadDataAll = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/potongan-form/${nomor}`);
    const data = response.data;

    isEditMode.value = true;
    Object.assign(header, data.header);
    items.value = (data.details as PotonganDetail[]).map((item) => ({
      ...item,
      id: Math.random(),
      lunasi: item.bayar >= item.sisaPiutang,
      pin: "", // Reset pin saat load (karena sudah tersimpan di backend)
    }));
    addNewRow();
    calculateTotals();
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    const errorMessage = error.response?.data?.message || "Nomor tersebut tidak ditemukan.";
    toast.error(errorMessage);
    isEditMode.value = false;
    resetForm();
  } finally {
    isLoading.value = false;
  }
};

const showConfirmation = (
  title: string,
  text: string,
  onConfirm: () => void,
  onCancel?: () => void
) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = () => {
    onConfirm();
    dialogConfirm.show = false;
  };
  dialogConfirm.onCancel = () => {
    if (onCancel) onCancel();
    dialogConfirm.show = false;
  };
  dialogConfirm.show = true;
};

const handleInvoiceKeydown = (e: KeyboardEvent, item: PotonganDetail) => {
  if (isHeaderDisabled.value || item.invoice || !canSave.value) {
    return;
  }

  switch (e.key) {
    case "F1":
      e.preventDefault();
      handleInvoiceSearch();
      break;

    case "F2":
      e.preventDefault();
      handleBiayaKirimSearch();
      break;
  }
};

watch(() => header.nominalPotongan, calculateTotals);
watch(items, calculateTotals, { deep: true });

onMounted(async () => {
  // --- TAMBAHKAN PENGECEKAN AWAL ---
  if (!canView.value) {
    isLoading.value = false; // Hentikan loading
    toast.error("Anda tidak memiliki izin untuk mengakses halaman ini.");
    // Opsional: Redirect atau tampilkan pesan akses ditolak di template
    // router.replace({ name: 'Forbidden' });
    return; // Hentikan eksekusi onMounted
  }
  // ------------------------------------

  // --- Perubahan: Set isLoading di sini ---
  isLoading.value = true;
  // ------------------------------------

  await loadInitialData(); // Muat data gudang & akun
  const nomor = route.params.nomor as string;
  if (nomor) {
    await loadDataAll(nomor); // Ini akan set isEditMode
  } else {
    // --- Perbaikan: Panggil resetForm hanya jika tidak edit ---
    resetForm();
    // -----------------------------------------------------
  }
  isLoading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" icon="mdi-receipt" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        v-if="canSave"
        color="primary"
        size="small"
        @click="simpanData"
        :loading="isSaving"
        prepend-icon="mdi-content-save"
      >
        Simpan
      </v-btn>
      <v-btn v-if="!isEditMode" size="small" @click="handleBatal">Batal</v-btn>
      <v-btn @click="handleTutup" size="small" prepend-icon="mdi-close"> Tutup </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="hide-details">
            <v-col cols="6">
              <v-text-field
                label="Kode Cabang"
                v-model="header.gudang.kode"
                density="compact"
                :readonly="isHeaderDisabled || !canSave"
                @click="!isHeaderDisabled && handleGudangSearch()"
                @keydown.f1.prevent="!isHeaderDisabled && handleGudangSearch()"
                prepend-inner-icon="mdi-magnify"
                placeholder="F1 atau Klik..."
                variant="outlined"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Tanggal"
                v-model="header.tanggal"
                type="date"
                density="compact"
                :readonly="isEditMode || !canSave"
                variant="outlined"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Nama Cabang"
                v-model="header.gudang.nama"
                density="compact"
                readonly
                variant="filled"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Nomor Potongan"
                v-model="header.nomor"
                density="compact"
                readonly
                filled
                hide-details
                placeholder="Kosong=Baru"
              >
                <template #append-inner>
                  <v-chip size="small" :color="isEditMode ? 'orange' : 'success'">
                    {{ isEditMode ? "Ubah" : "Baru" }}
                  </v-chip>
                </template>
              </v-text-field>
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Kode Customer"
                v-model="header.customer.kode"
                density="compact"
                :readonly="isHeaderDisabled || !canSave"
                @click="handleCustomerSearch"
                @keydown.f1.prevent="handleCustomerSearch"
                prepend-inner-icon="mdi-magnify"
                placeholder="F1 atau Klik..."
                variant="outlined"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Nama Customer"
                v-model="header.customer.nama"
                density="compact"
                readonly
                variant="filled"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Alamat"
                v-model="header.customer.alamat"
                density="compact"
                readonly
                variant="filled"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Kota"
                v-model="header.customer.kota"
                density="compact"
                readonly
                variant="filled"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Telepon"
                v-model="header.customer.telp"
                density="compact"
                readonly
                variant="filled"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                id="edtNominal"
                label="Nominal Potongan (IDR)"
                v-model.number="header.nominalPotongan"
                type="number"
                min="0"
                density="compact"
                :readonly="isEditMode || !canSave"
                @blur="handleNominalExit"
                variant="outlined"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Kode Akun"
                v-model="header.akun.kode"
                density="compact"
                readonly
                variant="filled"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="No. Rekening"
                v-model="header.akun.rekening"
                density="compact"
                readonly
                variant="filled"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Nama Akun"
                v-model="header.akun.nama"
                density="compact"
                readonly
                variant="filled"
              />
            </v-col>
          </v-row>
        </div>
        <div class="desktop-form-section">
          <div class="text-subtitle-1 font-weight-bold text-success mb-2">Ringkasan</div>
          <v-text-field
            label="Total Potongan Dialokasikan"
            :model-value="header.totalTerbayar.toLocaleString('id-ID')"
            readonly
            variant="filled"
            density="compact"
            hide-details
            class="text-right font-weight-bold text-h6 summary-field"
          ></v-text-field>

          <v-text-field
            label="Sisa Potongan"
            :model-value="header.sisaPotongan.toLocaleString('id-ID')"
            readonly
            variant="filled"
            density="compact"
            hide-details
            :class="[
              'text-right',
              'font-weight-bold',
              'text-h6',
              'summary-field',
              header.sisaPotongan < 0 ? 'text-error' : '',
            ]"
          ></v-text-field>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column" style="flex-grow: 1">
          <div class="text-subtitle-1 font-weight-bold mb-2">
            Detail Invoice Piutang yang Dipotong
          </div>
          <v-data-table
            :headers="tableHeaders"
            :items="items"
            item-value="id"
            class="desktop-table fill-height"
            density="compact"
            fixed-header
            :items-per-page="-1"
          >
            <template v-slot:[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>
            <template v-slot:[`item.invoice`]="{ item }">
              <v-text-field
                v-model="item.invoice"
                variant="underlined"
                density="compact"
                hide-details
                placeholder="F1=Inv, F2=BK"
                :readonly="isHeaderDisabled || !!item.invoice || !canSave"
                @click="!isHeaderDisabled && !item.invoice && handleInvoiceSearch()"
                @keydown="handleInvoiceKeydown($event, item)"
              >
                <template #append-inner v-if="!isHeaderDisabled && !item.invoice && canSave">
                  <v-icon
                    size="small"
                    color="info"
                    @click.stop="handleBiayaKirimSearch"
                    title="Cari Biaya Kirim (F2)"
                  >
                    mdi-truck-delivery
                  </v-icon>
                </template>
              </v-text-field>
            </template>
            <template v-slot:[`item.tanggalInvoice`]="{ item }">
              <span class="text-caption">
                {{ item.tanggalInvoice ? format(parseISO(item.tanggalInvoice), "dd/MM/yyyy") : "" }}
              </span>
            </template>
            <template v-slot:[`item.jatuhTempo`]="{ item }">
              <span class="text-caption">
                {{ item.jatuhTempo ? format(parseISO(item.jatuhTempo), "dd/MM/yyyy") : "" }}
              </span>
            </template>
            <template v-slot:[`item.nominalInvoice`]="{ item }">
              <span class="text-caption text-right d-block">
                {{ (item.nominalInvoice || 0).toLocaleString("id-ID") }}
              </span>
            </template>
            <template v-slot:[`item.terbayarPiutang`]="{ item }">
              <span class="text-caption text-right d-block">
                {{ (item.terbayarPiutang || 0).toLocaleString("id-ID") }}
              </span>
            </template>
            <template v-slot:[`item.sisaPiutang`]="{ item }">
              <span class="text-caption text-right d-block">
                {{ (item.sisaPiutang || 0).toLocaleString("id-ID") }}
              </span>
            </template>
            <template v-slot:[`item.bayar`]="{ item }">
              <v-text-field
                v-model.number="item.bayar"
                type="number"
                min="0"
                variant="underlined"
                density="compact"
                hide-details
                class="text-right"
                :disabled="isEditMode || !item.invoice || !canSave"
                @blur="handleBayarChange(item)"
              />
            </template>
            <template v-slot:[`item.lunasi`]="{ item }">
              <v-checkbox
                v-model="item.lunasi"
                density="compact"
                :disabled="isEditMode || !item.invoice || !canSave"
                @change="handleLunasiChange(item)"
                hide-details
                class="justify-center"
              />
            </template>
            <template v-slot:[`item.actions`]="{ item }">
              <v-btn
                v-if="item.invoice && !isEditMode"
                icon="mdi-delete"
                variant="text"
                color="error"
                size="x-small"
                @click="handleDeleteItem(item)"
                :disabled="!canSave"
                title="Hapus Baris"
              />
            </template>
            <template #bottom>
              <v-btn
                v-if="!isEditMode && items.some((i) => i.invoice === '')"
                size="small"
                color="primary"
                prepend-icon="mdi-plus"
                @click="addNewRow"
                :disabled="!canSave"
                class="ma-2"
              >
                Tambah Baris
              </v-btn>
            </template>
          </v-data-table>
        </div>
      </div>
    </div>

    <GudangSearchModal
      v-if="dialogs.gudangSearch"
      :user-cabang="authStore.user?.cabang || ''"
      @close="dialogs.gudangSearch = false"
      @gudang-selected="onGudangSelected"
    />
    <CustomerSearchModal
      v-if="dialogs.customerSearch"
      :gudang="header.gudang.kode"
      source="invoice"
      @close="dialogs.customerSearch = false"
      @customer-selected="onCustomerSelected"
    />
    <InvoiceSearchModal
      v-if="dialogs.invoiceSearch"
      source="potongan-piutang"
      :customer-kode="header.customer.kode"
      :gudang-kode="header.gudang.kode"
      @close="dialogs.invoiceSearch = false"
      @invoice-selected="onInvoiceSelected"
    />
    <BiayaKirimSearchModal
      v-if="dialogs.biayaKirimSearch"
      :customer-kode="header.customer.kode"
      :gudang-kode="header.gudang.kode"
      @close="dialogs.biayaKirimSearch = false"
      @selected="onBiayaKirimSelected"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text {{ dialogConfirm.text }}></v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.onCancel">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-overlay
      :model-value="isLoading || isSaving"
      class="align-center justify-center"
      contained
      persistent
    >
      <v-progress-circular color="primary" indeterminate size="64"></v-progress-circular>
    </v-overlay>
  </PageLayout>
</template>

<style scoped>
/* Struktur grid untuk desktop layout */
.form-grid-container {
  display: grid;
  grid-template-columns: 40% 1fr;
  /* Kolom kiri 40% */
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

.desktop-form-section.header-section {
  flex-shrink: 0;
}

.hide-details :deep(.v-input__details) {
  display: none;
}

.right-column .desktop-form-section {
  flex-grow: 1;
}

.desktop-table {
  flex-grow: 1;
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

.summary-field :deep(input) {
  font-size: 1.1rem;
  color: #1b5e20 !important;
}

/* --- PERBAIKAN FONT SIZE --- */
/* Atur font size untuk label dan input di left-column */
.left-column .desktop-form-section :deep(.v-label) {
  font-size: 11px !important;
  opacity: 0.9;
  margin-bottom: 2px;
}

.left-column .desktop-form-section :deep(input),
.left-column .desktop-form-section :deep(.v-select__selection-text),
.left-column .desktop-form-section :deep(textarea) {
  font-size: 11px !important;
  /* Diubah dari 12px menjadi 11px */
}

/* ------------------------ */
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
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

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, addDays, parseISO, isValid } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import SoSearchModal from "@/components/lookup/SoSearchModal.vue";
import InvoiceSearchModal from "@/components/lookup/InvoiceSearchModal.vue";
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import AuthWaitingDialog from "@/components/AuthWaitingDialog.vue";
import { useAuthPolling } from "@/composables/useAuthPolling";
import type { AxiosError } from "axios";

// --- Tipe Data ---
type SumberTipe = "SO" | "INVOICE";

interface FormHeader {
  cabang: string;
  nomor: string | null;
  tanggal: string;
  nomorSo: string;
  refInvoice: string;
  tanggalSo: string | null;
  customerKode: string;
  customerNama: string;
  alamat: string;
  kota: string;
  level: string;
  top: number;
  tempo: string;
  keterangan: string;
  ppn: number;
}
interface SummaryState {
  diskonPersen: number;
  diskon: number;
  biayaKirim: number;
  dp: number;
}
interface DetailItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  diskonPersen: number;
  diskonRp: number;
  barcode: string;
}
interface ItemResponse extends Omit<DetailItem, "id"> {
  id?: number;
}
interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  level_kode: string;
  level_nama: string;
}
interface SoHeaderResponse extends SummaryState {
  tanggalSo: string | null;
  customerKode: string;
  customerNama: string;
  alamat: string;
  kota: string;
  levelKode: string;
  levelNama: string;
  top: number;
  ppn: number;
}
interface InvoiceHeaderResponse extends SoHeaderResponse {
  nomorSo: string;
}
interface SoResponse {
  header: SoHeaderResponse;
  items: ItemResponse[];
}
interface InvoiceResponse {
  header: InvoiceHeaderResponse;
  items: ItemResponse[];
}
interface ProformaResponse {
  header: FormHeader & SummaryState & { statusAcc: string };
  items: ItemResponse[];
}
interface SaveResponse {
  message: string;
  nomor?: string;
}

// --- Inisialisasi & State ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const { startGlobalPolling } = useAuthPolling();
const MENU_ID = "28";
const BROWSE_ROUTE = "Proforma";

const isEditMode = ref(false);
const busy = ref(true);
const isSoLookupVisible = ref(false);
const isInvoiceLookupVisible = ref(false);
const isCustomerLookupVisible = ref(false);
const isWaitingAuth = ref(false);

const confirmDlg = reactive({
  show: false,
  title: "",
  text: "",
  okLabel: "Ya, Lanjutkan",
  onConfirm: () => {},
});
const saveDlg = reactive({ show: false, alasan: "" });

const createHeader = (): FormHeader => ({
  cabang: authStore.user?.cabang || "",
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  nomorSo: "",
  refInvoice: "",
  tanggalSo: null,
  customerKode: "",
  customerNama: "",
  alamat: "",
  kota: "",
  level: "",
  top: 0,
  tempo: format(new Date(), "yyyy-MM-dd"),
  keterangan: "",
  ppn: 0,
});

const formHeader = reactive<FormHeader>(createHeader());
const summary = reactive<SummaryState>({ diskonPersen: 0, diskon: 0, biayaKirim: 0, dp: 0 });
const items = ref<DetailItem[]>([]);

// Sumber dokumen: dari SO atau dari Invoice (alternatif)
const sumberTipe = ref<SumberTipe>("SO");
// Nomor sumber yang datanya benar-benar sedang tampil di form (mencegah nomor diketik ≠ data)
const sumberLoaded = ref("");
// Status ACC dokumen yang sedang diubah ("" = baru / dokumen lama tanpa ACC)
const statusAcc = ref("");

// ID lokal bernilai negatif agar tidak pernah bentrok dengan ID dari server
let rowSeq = 0;
const nextId = () => --rowSeq;

// --- Helper ---
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => n.toLocaleString("id-ID");

const toRow = (it: ItemResponse): DetailItem => ({
  id: it.id ?? nextId(),
  kode: it.kode,
  nama: it.nama,
  ukuran: it.ukuran,
  jumlah: num(it.jumlah),
  harga: num(it.harga),
  diskonPersen: num(it.diskonPersen),
  diskonRp: num(it.diskonRp),
  barcode: it.barcode,
});

const errMsg = (err: unknown, fallback: string) =>
  (err as AxiosError<{ message: string }>).response?.data?.message || fallback;

const askConfirm = (
  title: string,
  text: string,
  onConfirm: () => void,
  okLabel = "Ya, Lanjutkan"
) => {
  confirmDlg.title = title;
  confirmDlg.text = text;
  confirmDlg.okLabel = okLabel;
  confirmDlg.onConfirm = onConfirm;
  confirmDlg.show = true;
};
const runConfirm = () => {
  confirmDlg.show = false;
  confirmDlg.onConfirm();
};

// Input nomor sumber mengikuti mode (SO / Invoice)
const nomorSumber = computed({
  get: () => (sumberTipe.value === "INVOICE" ? formHeader.refInvoice : formHeader.nomorSo),
  set: (v: string) => {
    if (sumberTipe.value === "INVOICE") formHeader.refInvoice = v;
    else formHeader.nomorSo = v;
  },
});
const labelSumber = computed(() =>
  sumberTipe.value === "INVOICE" ? "No. Invoice (F1)" : "No. SO (F1)"
);

// --- Computed (pengganti prosedur 'hitung') ---
const subtotal = computed(() => items.value.reduce((t, i) => t + num(i.jumlah) * num(i.harga), 0));
const totalDiskonItem = computed(() => items.value.reduce((t, i) => t + num(i.diskonRp), 0));
const totalSetelahDiskonItem = computed(() => subtotal.value - totalDiskonItem.value);
const totalDiskonHeader = computed(
  () => totalSetelahDiskonItem.value * (num(summary.diskonPersen) / 100) + num(summary.diskon)
);
const totalDiskonSemua = computed(() => totalDiskonItem.value + totalDiskonHeader.value);
const dpp = computed(() => totalSetelahDiskonItem.value - totalDiskonHeader.value);
const totalPpn = computed(() => dpp.value * (num(formHeader.ppn) / 100));
const grandTotal = computed(() => dpp.value + totalPpn.value);
const netto = computed(() => grandTotal.value + num(summary.biayaKirim) - num(summary.dp));

const validItems = computed(() => items.value.filter((i) => i.kode && num(i.jumlah) > 0));
const jumlahNol = computed(() => items.value.length - validItems.value.length);
const catatanNol = computed(() =>
  jumlahNol.value > 0 ? `${jumlahNol.value} baris berjumlah 0 tidak akan ikut disimpan.` : ""
);
const sumberDirty = computed(
  () => !isEditMode.value && !!sumberLoaded.value && nomorSumber.value.trim() !== sumberLoaded.value
);
const sumberTarget = computed(() => !isEditMode.value && !sumberLoaded.value);
const alasanValid = computed(() => saveDlg.alasan.trim().length >= 5);

// --- Watchers ---
watch([() => formHeader.tanggal, () => formHeader.top], ([tgl, top]) => {
  const d = parseISO(tgl);
  const t = Number(top);
  // top bisa "" saat field dikosongkan; jangan sampai format() melempar RangeError
  if (!isValid(d) || !Number.isFinite(t) || t < 0) return;
  formHeader.tempo = format(addDays(d, Math.trunc(t)), "yyyy-MM-dd");
});

// --- Methods ---
const clearSumber = () => {
  // Di mode Invoice, No. SO hanyalah turunan dari invoice yang dimuat
  if (sumberTipe.value === "INVOICE") formHeader.nomorSo = "";
  formHeader.tanggalSo = null;
  formHeader.customerKode = "";
  formHeader.customerNama = "";
  formHeader.alamat = "";
  formHeader.kota = "";
  formHeader.level = "";
  formHeader.top = 0;
  formHeader.ppn = 0;
  summary.diskon = 0;
  summary.diskonPersen = 0;
  summary.biayaKirim = 0;
  summary.dp = 0;
  items.value = [];
  sumberLoaded.value = "";
};

// Ganti mode sumber: kosongkan semuanya supaya tidak ada data campuran SO dan Invoice
const gantiSumber = () => {
  formHeader.nomorSo = "";
  formHeader.refInvoice = "";
  clearSumber();
};

const isiDariSumber = (h: SoHeaderResponse, rows: ItemResponse[]) => {
  formHeader.tanggalSo = h.tanggalSo;
  formHeader.customerKode = h.customerKode;
  formHeader.customerNama = h.customerNama;
  formHeader.alamat = h.alamat;
  formHeader.kota = h.kota;
  formHeader.level = `${h.levelKode} - ${h.levelNama}`;
  formHeader.top = num(h.top);
  formHeader.ppn = num(h.ppn);
  summary.diskon = num(h.diskon);
  summary.diskonPersen = num(h.diskonPersen);
  summary.biayaKirim = num(h.biayaKirim);
  summary.dp = num(h.dp);
  items.value = rows.map(toRow);
};

const loadFromSumber = async () => {
  const nomor = nomorSumber.value.trim();
  if (isEditMode.value || !nomor) return;

  busy.value = true;
  try {
    if (sumberTipe.value === "INVOICE") {
      const response = await api.get<InvoiceResponse>(`/proforma-form/from-invoice/${nomor}`);
      formHeader.refInvoice = nomor;
      formHeader.nomorSo = response.data.header.nomorSo ?? "";
      isiDariSumber(response.data.header, response.data.items);
    } else {
      const response = await api.get<SoResponse>(`/proforma-form/from-so/${nomor}`, {
        params: { branchCode: formHeader.cabang },
      });
      formHeader.nomorSo = nomor;
      formHeader.refInvoice = "";
      isiDariSumber(response.data.header, response.data.items);
    }
    sumberLoaded.value = nomor;
    toast.success(
      `Data dari ${sumberTipe.value === "INVOICE" ? "invoice" : "SO"} ${nomor} berhasil dimuat.`
    );
  } catch (err) {
    // Jangan biarkan data sumber sebelumnya menempel pada nomor yang gagal dimuat
    clearSumber();
    toast.error(
      errMsg(err, `Gagal memuat data ${sumberTipe.value === "INVOICE" ? "invoice" : "SO"}.`)
    );
  } finally {
    busy.value = false;
  }
};

const loadDataForEdit = async (id: string) => {
  busy.value = true;
  try {
    const response = await api.get<ProformaResponse>(`/proforma-form/${id}`);
    const { header: h, items: rows } = response.data;

    // Salin field satu per satu: jangan sampai field asing dari server ikut masuk ke payload simpan
    formHeader.cabang = h.cabang;
    formHeader.nomor = h.nomor;
    formHeader.tanggal = h.tanggal;
    formHeader.nomorSo = h.nomorSo;
    formHeader.refInvoice = h.refInvoice ?? "";
    formHeader.tanggalSo = h.tanggalSo;
    formHeader.customerKode = h.customerKode;
    formHeader.customerNama = h.customerNama;
    formHeader.alamat = h.alamat;
    formHeader.kota = h.kota;
    formHeader.level = h.level;
    formHeader.top = num(h.top);
    formHeader.tempo = h.tempo;
    formHeader.keterangan = h.keterangan ?? "";
    formHeader.ppn = num(h.ppn);

    summary.diskonPersen = num(h.diskonPersen);
    summary.diskon = num(h.diskon);
    summary.biayaKirim = num(h.biayaKirim);
    summary.dp = num(h.dp);

    items.value = rows.map(toRow);
    sumberTipe.value = formHeader.refInvoice ? "INVOICE" : "SO";
    sumberLoaded.value = formHeader.refInvoice || h.nomorSo;
    statusAcc.value = h.statusAcc ?? "";
  } catch (err) {
    toast.error(errMsg(err, "Gagal memuat data Proforma."));
    router.replace({ name: BROWSE_ROUTE });
  } finally {
    busy.value = false;
  }
};

// Hitung ulang diskon Rp baris setelah jumlah / diskon % diedit.
// nextTick: pastikan v-model sudah menulis nilai barunya.
const recalcDiskonRp = (item: DetailItem) => {
  void nextTick(() => {
    item.diskonRp = Math.round((num(item.jumlah) * num(item.harga) * num(item.diskonPersen)) / 100);
  });
};

const validate = (): string | null => {
  if (!formHeader.tanggal) return "Tanggal harus diisi.";
  if (!nomorSumber.value.trim())
    return sumberTipe.value === "INVOICE" ? "Nomor Invoice harus diisi." : "Nomor SO harus diisi.";
  if (!isEditMode.value && nomorSumber.value.trim() !== sumberLoaded.value)
    return "Nomor sumber belum dimuat. Tekan Enter atau pilih lewat F1.";
  if (!formHeader.customerKode) return "Customer harus diisi (muat dari sumber).";
  if (items.value.length === 0) return "Detail barang tidak boleh kosong.";
  if (validItems.value.length === 0) return "Minimal satu barang dengan jumlah lebih dari 0.";
  if (items.value.some((i) => num(i.jumlah) < 0 || num(i.harga) < 0))
    return "Jumlah dan harga tidak boleh negatif.";
  if (items.value.some((i) => num(i.diskonPersen) < 0 || num(i.diskonPersen) > 100))
    return "Diskon % per barang harus antara 0 dan 100.";
  if (num(formHeader.top) < 0) return "TOP tidak boleh negatif.";
  if (num(summary.diskonPersen) < 0 || num(summary.diskonPersen) > 100)
    return "Diskon (%) harus antara 0 dan 100.";
  if (num(formHeader.ppn) < 0 || num(formHeader.ppn) > 100)
    return "PPN (%) harus antara 0 dan 100.";
  if (num(summary.diskon) < 0 || num(summary.biayaKirim) < 0 || num(summary.dp) < 0)
    return "Diskon, biaya kirim, dan DP tidak boleh negatif.";
  if (dpp.value < 0) return "Total diskon melebihi subtotal.";
  if (netto.value < 0) return "DP melebihi total tagihan (netto negatif).";
  return null;
};

// Simpan = isi alasan dulu, lalu simpan dan ajukan ACC Manager Retail
const handleSave = () => {
  const err = validate();
  if (err) {
    toast.error(err);
    return;
  }
  saveDlg.alasan = "";
  saveDlg.show = true;
};

const submitSave = () => {
  if (!alasanValid.value) return;
  saveDlg.show = false;
  void executeSave(saveDlg.alasan.trim());
};

const keBrowse = () => {
  isWaitingAuth.value = false;
  router.push({ name: BROWSE_ROUTE });
};

const requestAcc = async (nomor: string, alasan: string) => {
  const sumber =
    sumberTipe.value === "INVOICE"
      ? `Invoice ${formHeader.refInvoice}`
      : `SO ${formHeader.nomorSo}`;
  // o_ket maksimal 255 karakter; alasan dibatasi 100 dan baris pertama tampil di notifikasi
  const keterangan = [
    `Proforma ${nomor}: ${alasan}`,
    `Cust: ${formHeader.customerNama.slice(0, 30)}`,
    `Sumber: ${sumber}`,
    `Diskon: ${fmt(Math.round(totalDiskonSemua.value))}`,
    `Netto: ${fmt(Math.round(netto.value))}`,
  ]
    .join("\n")
    .slice(0, 255);

  const authResponse = await api.post<{ authNomor: string }>("/auth-pin/request", {
    transaksi: nomor,
    jenis: "PROFORMA",
    keterangan,
    nominal: Math.round(netto.value),
    cabang: authStore.user?.cabang,
    user: authStore.user?.kode,
    barcode: "",
    target_cabang: "",
  });

  isWaitingAuth.value = true;
  startGlobalPolling(
    authResponse.data.authNomor,
    () => {
      // Hanya pindah kalau kasir masih melihat dialog
      if (isWaitingAuth.value) keBrowse();
    },
    {
      pesanDisetujui: (approver) =>
        `Proforma ${nomor} disetujui ${approver}. Sudah bisa dicetak dari daftar proforma.`,
      pesanDitolak: `Proforma ${nomor} ditolak Manager Retail. Ubah lalu ajukan ulang.`,
    }
  );
};

const executeSave = async (alasan: string) => {
  busy.value = true;
  let nomorDokumen = "";
  try {
    const payload = {
      header: {
        ...formHeader,
        top: num(formHeader.top),
        ppn: num(formHeader.ppn),
        diskonPersen: num(summary.diskonPersen),
        diskon: num(summary.diskon),
        biayaKirim: num(summary.biayaKirim),
        dp: num(summary.dp),
      },
      items: validItems.value,
    };

    const response = isEditMode.value
      ? await api.put<SaveResponse>(`/proforma-form/${route.params.id}`, payload)
      : await api.post<SaveResponse>("/proforma-form", payload);

    nomorDokumen = response.data.nomor ?? formHeader.nomor ?? "";
  } catch (err) {
    toast.error(errMsg(err, "Gagal menyimpan data."));
    busy.value = false;
    return;
  }

  try {
    await requestAcc(nomorDokumen, alasan);
  } catch (authErr) {
    toast.warning(
      `Proforma ${nomorDokumen} tersimpan (status menunggu ACC), tetapi permintaan ACC gagal terkirim: ${errMsg(
        authErr,
        "periksa koneksi"
      )}. Buka dokumennya lalu simpan ulang untuk mengajukan lagi.`
    );
    router.push({ name: BROWSE_ROUTE });
  } finally {
    busy.value = false;
  }
};

const onSoSelected = (selectedSo: { Nomor: string }) => {
  formHeader.nomorSo = selectedSo.Nomor;
  isSoLookupVisible.value = false;
  loadFromSumber();
};

const onInvoiceSelected = (selected: { Nomor: string }) => {
  formHeader.refInvoice = selected.Nomor;
  isInvoiceLookupVisible.value = false;
  loadFromSumber();
};

const onCustomerSelected = (customer: Customer) => {
  formHeader.customerKode = customer.kode;
  formHeader.customerNama = customer.nama;
  formHeader.alamat = customer.alamat;
  formHeader.kota = customer.kota;
  formHeader.level = `${customer.level_kode} - ${customer.level_nama}`;
  isCustomerLookupVisible.value = false;
};

const openSumberLookup = () => {
  if (isEditMode.value) return;
  if (sumberTipe.value === "INVOICE") isInvoiceLookupVisible.value = true;
  else isSoLookupVisible.value = true;
};

const resetForm = () => {
  Object.assign(formHeader, createHeader());
  sumberTipe.value = "SO";
  statusAcc.value = "";
  clearSumber();
};

const handleBatal = () => {
  askConfirm("Konfirmasi Batal", "Perubahan yang belum disimpan akan hilang. Lanjutkan?", () => {
    if (isEditMode.value) {
      loadDataForEdit(route.params.id as string);
      toast.info("Perubahan dibatalkan.");
    } else {
      resetForm();
    }
  });
};

const handleTutup = () => {
  askConfirm("Konfirmasi Tutup", "Anda yakin ingin menutup form ini?", () => {
    router.push({ name: BROWSE_ROUTE });
  });
};

const removeRow = (id: number) => {
  const idx = items.value.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const item = items.value[idx];
  askConfirm("Konfirmasi Hapus", `Anda yakin ingin menghapus item: ${item.nama}?`, () => {
    items.value.splice(idx, 1);
    toast.info("Baris berhasil dihapus.");
  });
};

const rowProps = ({ item }: { item: DetailItem }) => ({
  class: num(item.jumlah) <= 0 ? "row-zero" : "",
});

// --- Konfigurasi Tabel ---
const tableHeaders = [
  { title: "No", key: "no", sortable: false, width: "44px" },
  { title: "Kode Barang", key: "kode", sortable: false, width: "150px", minWidth: "150px" },
  { title: "Nama Barang", key: "nama", sortable: false, minWidth: "200px" },
  { title: "Ukuran", key: "ukuran", sortable: false, width: "70px" },
  { title: "Jumlah", key: "jumlah", sortable: false, width: "80px", align: "end" },
  { title: "Harga", key: "harga", sortable: false, width: "100px", align: "end" },
  { title: "Disk %", key: "diskonPersen", sortable: false, width: "70px", align: "end" },
  { title: "Disk Rp", key: "diskonRp", sortable: false, width: "100px", align: "end" },
  { title: "Total", key: "total", sortable: false, width: "110px", align: "end" },
  { title: "Barcode", key: "barcode", sortable: false, width: "120px" },
  { title: "", key: "actions", sortable: false, width: "44px", align: "center" },
] as const;

onMounted(async () => {
  const id = route.params.id as string | undefined;
  const needed = id ? "edit" : "insert";
  if (!authStore.can(MENU_ID, needed)) {
    toast.error("Anda tidak memiliki akses untuk halaman ini.");
    busy.value = false;
    router.replace({ name: BROWSE_ROUTE });
    return;
  }

  if (id) {
    isEditMode.value = true;
    await loadDataForEdit(id);
  } else {
    busy.value = false;
  }
});
</script>

<template>
  <PageLayout
    :title="isEditMode ? 'Ubah Proforma Invoice' : 'Buat Proforma Invoice'"
    :menu-id="MENU_ID"
  >
    <template #header-actions>
      <v-btn
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-content-save"
        :loading="busy"
        @click="handleSave"
        >Simpan</v-btn
      >
      <v-btn
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-refresh"
        :disabled="busy"
        @click="handleBatal"
        >Batal</v-btn
      >
      <v-btn
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-close"
        :disabled="busy"
        @click="handleTutup"
        >Tutup</v-btn
      >
    </template>

    <div class="form-page">
      <v-overlay v-model="busy" contained persistent class="align-center justify-center">
        <v-progress-circular indeterminate color="white" />
      </v-overlay>

      <!-- ══════════ KIRI: DOKUMEN, CUSTOMER, PEMBAYARAN ══════════ -->
      <div class="col-left">
        <section class="panel">
          <div class="panel-title">
            Dokumen
            <span v-if="statusAcc" class="acc-badge" :class="`acc-${statusAcc.toLowerCase()}`">
              {{ statusAcc }}
            </span>
          </div>

          <v-btn-toggle
            v-if="!isEditMode"
            v-model="sumberTipe"
            mandatory
            density="compact"
            variant="text"
            class="sumber-toggle mb-2"
            @update:model-value="gantiSumber"
          >
            <v-btn value="SO" size="small">Dari SO</v-btn>
            <v-btn value="INVOICE" size="small">Dari Invoice</v-btn>
          </v-btn-toggle>

          <div class="grid-2">
            <v-text-field
              label="Cabang"
              :model-value="formHeader.cabang"
              readonly
              variant="outlined"
              density="compact"
              hide-details
              class="form-field is-locked"
            />
            <v-text-field
              label="Nomor"
              :model-value="formHeader.nomor"
              placeholder="Otomatis"
              readonly
              variant="outlined"
              density="compact"
              hide-details
              class="form-field is-locked"
            />
            <v-text-field
              label="Tanggal"
              v-model="formHeader.tanggal"
              type="date"
              variant="outlined"
              density="compact"
              hide-details
              class="form-field"
            />
            <v-text-field
              :label="labelSumber"
              v-model="nomorSumber"
              :readonly="isEditMode"
              placeholder="F1 untuk cari..."
              :append-inner-icon="isEditMode ? undefined : 'mdi-magnify'"
              variant="outlined"
              density="compact"
              hide-details
              :class="['form-field', { 'is-locked': isEditMode, 'is-target': sumberTarget }]"
              @keydown.enter.prevent="loadFromSumber"
              @keydown.f1.prevent="openSumberLookup"
              @click:append-inner="openSumberLookup"
            />
          </div>
          <v-text-field
            v-if="sumberTipe === 'INVOICE'"
            label="No. SO (dari invoice)"
            :model-value="formHeader.nomorSo || '-'"
            readonly
            variant="outlined"
            density="compact"
            hide-details
            class="form-field is-locked mt-2"
          />
          <div v-if="sumberDirty" class="hint hint-warn">
            Nomor diubah. Tekan Enter untuk memuat ulang, atau data lama tetap dipakai.
          </div>
          <div v-else-if="sumberTarget" class="hint">
            Masukkan nomor {{ sumberTipe === "INVOICE" ? "invoice" : "SO" }} lalu tekan Enter (atau
            F1) untuk memuat customer dan barang.
          </div>
          <div v-else-if="isEditMode" class="hint">
            Menyimpan perubahan akan mengajukan ACC ulang; cetak tertahan sampai disetujui.
          </div>
        </section>

        <section class="panel">
          <div class="panel-title">Customer</div>
          <div
            class="customer-card"
            tabindex="0"
            @keydown.f1.prevent="isCustomerLookupVisible = true"
          >
            <template v-if="formHeader.customerKode">
              <div class="cust-name">{{ formHeader.customerNama }}</div>
              <div class="cust-line">{{ formHeader.alamat }}</div>
              <div class="cust-line">{{ formHeader.kota }}</div>
              <div class="cust-line cust-level">Level: {{ formHeader.level }}</div>
            </template>
            <div v-else class="cust-empty">Belum ada customer. Muat dari SO.</div>
          </div>
          <v-btn
            size="x-small"
            variant="tonal"
            class="btn-header-action mt-2"
            prepend-icon="mdi-magnify"
            :disabled="busy"
            @click="isCustomerLookupVisible = true"
            >Ganti customer (F1)</v-btn
          >
        </section>

        <section class="panel">
          <div class="panel-title">Pembayaran</div>
          <div class="grid-2">
            <v-text-field
              label="TOP (hari)"
              v-model.number="formHeader.top"
              type="number"
              min="0"
              hide-spin-buttons
              variant="outlined"
              density="compact"
              hide-details
              class="form-field"
            />
            <v-text-field
              label="Jatuh Tempo"
              :model-value="formHeader.tempo"
              type="date"
              readonly
              variant="outlined"
              density="compact"
              hide-details
              class="form-field is-locked"
            />
          </div>
          <v-textarea
            label="Keterangan"
            v-model="formHeader.keterangan"
            rows="2"
            auto-grow
            variant="outlined"
            density="compact"
            hide-details
            class="form-field mt-2"
          />
        </section>
      </div>

      <!-- ══════════ KANAN: DETAIL & RINGKASAN ══════════ -->
      <div class="col-right">
        <section class="panel items-panel">
          <div class="panel-title">
            Detail Barang
            <span class="panel-count">{{ items.length }} baris</span>
            <span v-if="jumlahNol > 0" class="panel-warn"
              >{{ jumlahNol }} baris berjumlah 0 tidak akan disimpan</span
            >
          </div>

          <div class="table-wrap">
            <v-data-table
              :headers="tableHeaders"
              :items="items"
              item-value="id"
              class="item-table"
              density="compact"
              fixed-header
              hide-default-footer
              :items-per-page="-1"
              :row-props="rowProps"
            >
              <template #no-data>
                <div class="empty-items">
                  Belum ada barang. Pilih sumber (SO atau Invoice) lalu muat dengan Enter atau F1.
                </div>
              </template>
              <template #[`item.no`]="{ index }">{{ index + 1 }}</template>
              <template #[`item.jumlah`]="{ item }">
                <v-text-field
                  v-model.number="item.jumlah"
                  type="number"
                  min="0"
                  hide-spin-buttons
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="cell-input"
                  @update:model-value="recalcDiskonRp(item)"
                />
              </template>
              <template #[`item.harga`]="{ item }">
                <span class="num-cell">{{ fmt(num(item.harga)) }}</span>
              </template>
              <template #[`item.diskonPersen`]="{ item }">
                <v-text-field
                  v-model.number="item.diskonPersen"
                  type="number"
                  min="0"
                  max="100"
                  hide-spin-buttons
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="cell-input"
                  @update:model-value="recalcDiskonRp(item)"
                />
              </template>
              <template #[`item.diskonRp`]="{ item }">
                <span class="num-cell">{{ fmt(num(item.diskonRp)) }}</span>
              </template>
              <template #[`item.total`]="{ item }">
                <span class="num-cell total-cell">{{
                  fmt(num(item.jumlah) * num(item.harga) - num(item.diskonRp))
                }}</span>
              </template>
              <template #[`item.actions`]="{ item }">
                <v-btn
                  icon="mdi-delete-outline"
                  size="x-small"
                  variant="text"
                  class="btn-delete-row"
                  title="Hapus baris ini"
                  :disabled="busy"
                  @click="removeRow(item.id)"
                />
              </template>
            </v-data-table>
          </div>
        </section>

        <section class="panel summary-panel">
          <div class="panel-title">
            Ringkasan
            <span v-if="items.length === 0" class="panel-count"
              >Terisi otomatis setelah SO dimuat</span
            >
          </div>
          <div class="grid-summary">
            <v-text-field
              label="Subtotal"
              title="Setelah diskon per barang"
              :model-value="fmt(totalSetelahDiskonItem)"
              readonly
              variant="outlined"
              density="compact"
              hide-details
              class="form-field is-locked num-field"
            />
            <v-text-field
              label="Diskon (%)"
              v-model.number="summary.diskonPersen"
              type="number"
              min="0"
              max="100"
              hide-spin-buttons
              variant="outlined"
              density="compact"
              hide-details
              class="form-field num-field"
            />
            <v-text-field
              label="Diskon (Rp)"
              v-model.number="summary.diskon"
              type="number"
              min="0"
              hide-spin-buttons
              variant="outlined"
              density="compact"
              hide-details
              class="form-field num-field"
            />
            <v-text-field
              label="DPP"
              :model-value="fmt(dpp)"
              readonly
              variant="outlined"
              density="compact"
              hide-details
              class="form-field is-locked num-field"
            />
            <v-text-field
              label="PPN (%)"
              v-model.number="formHeader.ppn"
              type="number"
              min="0"
              max="100"
              hide-spin-buttons
              variant="outlined"
              density="compact"
              hide-details
              class="form-field num-field"
            />
            <v-text-field
              label="Total PPN"
              :model-value="fmt(totalPpn)"
              readonly
              variant="outlined"
              density="compact"
              hide-details
              class="form-field is-locked num-field"
            />
            <v-text-field
              label="Biaya Kirim"
              v-model.number="summary.biayaKirim"
              type="number"
              min="0"
              hide-spin-buttons
              variant="outlined"
              density="compact"
              hide-details
              class="form-field num-field"
            />
            <v-text-field
              label="DP"
              v-model.number="summary.dp"
              type="number"
              min="0"
              hide-spin-buttons
              variant="outlined"
              density="compact"
              hide-details
              class="form-field num-field"
            />
          </div>

          <div class="total-bar">
            <div class="tb-block">
              <div class="tb-label">Grand Total</div>
              <div class="tb-value">{{ fmt(grandTotal) }}</div>
            </div>
            <div class="tb-block tb-netto" :class="{ 'is-negative': netto < 0 }">
              <div class="tb-label">Netto (Grand Total + Biaya Kirim − DP)</div>
              <div class="tb-value">{{ fmt(netto) }}</div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <SoSearchModal
      v-if="isSoLookupVisible"
      :cabang="formHeader.cabang"
      @close="isSoLookupVisible = false"
      @selected="onSoSelected"
    />
    <InvoiceSearchModal
      v-if="isInvoiceLookupVisible"
      source="proforma"
      @close="isInvoiceLookupVisible = false"
      @invoice-selected="onInvoiceSelected"
    />
    <CustomerSearchModal
      v-if="isCustomerLookupVisible"
      :gudang="formHeader.cabang"
      @close="isCustomerLookupVisible = false"
      @customer-selected="onCustomerSelected"
    />

    <!-- Dialog konfirmasi (simpan / batal / tutup / hapus baris) -->
    <v-dialog v-model="confirmDlg.show" max-width="400px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">{{ confirmDlg.title }}</v-card-title>
        <v-card-text class="pt-4">{{ confirmDlg.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmDlg.show = false">Batal</v-btn>
          <v-btn variant="flat" class="btn-primary-red" @click="runConfirm">{{
            confirmDlg.okLabel
          }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog simpan: alasan wajib untuk permintaan ACC -->
    <v-dialog v-model="saveDlg.show" max-width="440px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">Simpan dan Ajukan ACC</v-card-title>
        <v-card-text class="pt-4">
          <div class="mb-3">
            Proforma ini perlu disetujui Manager Retail sebelum bisa dicetak.
            {{ catatanNol }}
          </div>
          <v-textarea
            v-model="saveDlg.alasan"
            label="Alasan pengajuan"
            maxlength="100"
            counter="100"
            rows="2"
            auto-grow
            variant="outlined"
            density="compact"
            color="#b71c1c"
            autofocus
            class="form-field"
            :hint="alasanValid ? '' : 'Wajib diisi, minimal 5 karakter.'"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="saveDlg.show = false">Batal</v-btn>
          <v-btn variant="flat" class="btn-primary-red" :disabled="!alasanValid" @click="submitSave"
            >Simpan dan Ajukan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <AuthWaitingDialog
      :model-value="isWaitingAuth"
      judul="Menunggu ACC Manager Retail..."
      @tutup="keBrowse"
    />
  </PageLayout>
</template>

<style scoped>
/* ══════════ HALAMAN ══════════ */
.form-page {
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;

  position: relative;
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}
.col-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.col-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
}

/* ══════════ TOMBOL ══════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover {
  filter: brightness(1.08);
}
.btn-header-action {
  background-color: rgba(183, 28, 28, 0.08) !important;
  color: #b71c1c !important;
  font-weight: 700;
  border: 1px solid rgba(183, 28, 28, 0.2);
}
.btn-header-action:hover:not(:disabled) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.btn-header-action:disabled {
  opacity: 0.4;
}
.btn-primary-red:focus-visible,
.btn-header-action:focus-visible,
.btn-delete-row:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}
.btn-delete-row {
  color: #b71c1c !important;
}

/* ══════════ PANEL ══════════ */
.panel {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
  padding: 10px 12px 12px;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #b71c1c;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding-bottom: 6px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
}
.panel-count {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: none;
  letter-spacing: 0;
}
.panel-warn {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: #b26a00;
  text-transform: none;
  letter-spacing: 0;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.grid-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
@media (min-width: 1600px) {
  .grid-summary {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
}

.hint {
  margin-top: 8px;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.hint-warn {
  color: #b26a00;
  font-weight: 600;
}

/* ══════════ FIELD ══════════ */
.form-field :deep(.v-label) {
  font-size: 11px;
}
.form-field :deep(.v-field__append-inner .v-icon) {
  color: #b71c1c !important;
  opacity: 0.85 !important;
}
.form-field :deep(input),
.form-field :deep(textarea) {
  font-size: 11px;
}

.form-field :deep(.v-field) {
  --v-field-border-radius: 8px;
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  box-shadow: none !important;
}
/* Outline tetap dipakai (label mengambang tinggal di dalamnya), cukup diwarnai merah */
.form-field :deep(.v-field__outline) {
  color: #b71c1c;
  --v-field-border-opacity: 0.3;
}
.form-field :deep(.v-field--focused) {
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.form-field :deep(.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 1;
}
.form-field :deep(.v-label.v-field-label) {
  font-size: 11px;
}

/* Field terkunci (hasil hitung / dari sistem) */
.form-field.is-locked :deep(.v-field) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
}
.form-field.is-locked :deep(.v-field__outline) {
  color: rgb(var(--v-theme-on-surface));
  --v-field-border-opacity: 0.15;
}

/* Field yang sedang menunggu input */
.form-field.is-target :deep(.v-field__outline) {
  --v-field-border-opacity: 1;
  --v-field-border-width: 2px;
}

.num-field :deep(input) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ══════════ CUSTOMER ══════════ */
.customer-card {
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-left: 3px solid #b71c1c;
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(183, 28, 28, 0.03);
  min-height: 74px;
  outline: none;
}
.customer-card:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}
.cust-name {
  font-size: 13px;
  font-weight: 700;
}
.cust-line {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.75);
}
.cust-level {
  margin-top: 2px;
  font-weight: 600;
  color: #b71c1c;
}
.cust-empty {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  padding-top: 20px;
  text-align: center;
}

/* ══════════ TABEL DETAIL ══════════ */
.items-panel {
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.table-wrap {
  flex: 0 1 auto;
  min-height: 120px;
  display: flex;
  flex-direction: column;
}
.item-table {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.item-table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto !important;
}
.item-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 36px !important;
  border-bottom: 2px solid #8e0000 !important;
  white-space: nowrap;
}
.item-table :deep(tbody td) {
  font-size: 11px !important;
  height: 36px !important;
  white-space: nowrap;
}
.item-table :deep(tbody tr:nth-child(even) > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.03), rgba(183, 28, 28, 0.03));
}
.item-table :deep(tbody tr:hover > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.08), rgba(183, 28, 28, 0.08));
}
/* Baris berjumlah 0: tidak akan disimpan */
.item-table :deep(tbody tr.row-zero > td) {
  color: #b26a00;
}

.cell-input {
  min-width: 0;
}
.cell-input :deep(input) {
  font-size: 11px;
  text-align: right;
  padding-top: 2px;
  padding-bottom: 2px;
  min-height: 28px;
  font-variant-numeric: tabular-nums;
}
.cell-input :deep(.v-field__outline) {
  color: #b71c1c;
}

.num-cell {
  display: block;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.total-cell {
  font-weight: 700;
}

.empty-items {
  padding: 28px 0;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

/* ══════════ RINGKASAN ══════════ */
.summary-panel {
  flex-shrink: 0;
  padding-bottom: 10px;
}
.total-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 8px;
  padding: 6px 16px;
  border-radius: 8px;
  background: #b71c1c;
  color: #ffffff;
}
.tb-block {
  display: flex;
  flex-direction: column;
}
.tb-netto {
  align-items: flex-end;
}
.tb-label {
  font-size: 11px;
  text-transform: uppercase;
  opacity: 0.85;
}
.tb-value {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.tb-netto .tb-value {
  font-size: 24px;
  line-height: 1.2;
}
.tb-netto.is-negative .tb-value {
  color: #ffd54f;
}

/* ══════════ SUMBER & STATUS ACC ══════════ */
.sumber-toggle {
  height: 30px !important;
  border: 1px solid rgba(183, 28, 28, 0.25);
  border-radius: 8px;
  overflow: hidden;
}
.sumber-toggle :deep(.v-btn) {
  height: 28px !important;
  padding: 0 14px !important;
  border-radius: 0 !important;
  font-size: 11px !important;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  color: #b71c1c;
}
.sumber-toggle :deep(.v-btn + .v-btn) {
  border-left: 1px solid rgba(183, 28, 28, 0.25);
}
.sumber-toggle :deep(.v-btn--active) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
}
.sumber-toggle :deep(.v-btn--active .v-btn__overlay) {
  opacity: 0;
}

.acc-badge {
  margin-left: auto;
  padding: 1px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}
.acc-menunggu {
  background: #fff3e0;
  color: #b26a00;
}
.acc-acc {
  background: #e8f5e9;
  color: #2e7d32;
}
.acc-ditolak {
  background: #ffebee;
  color: #b71c1c;
}

/* ══════════ DIALOG ══════════ */
.dialog-card {
  border-radius: 12px;
  overflow: hidden;
}
.confirm-title {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}
</style>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, addDays } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import SoSearchModal from "@/components/lookup/SoSearchModal.vue";
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import type { AxiosError } from "axios";

// --- Tipe Data ---
interface FormHeader {
  cabang: string;
  nomor: string | null;
  tanggal: string;
  nomorSo: string;
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
interface DetailItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  diskonPersen: number; // disc %
  diskonRp: number; // diskon Rp
  barcode: string;
}
interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  level_kode: string;
  level_nama: string;
}

// --- Inisialisasi & State ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "28";

const isEditMode = ref(false);
const loading = ref(true);
const isSoLookupVisible = ref(false);
const isCustomerLookupVisible = ref(false);
const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => {} });
const dialogConfirmSave = reactive({ show: false, title: "", text: "", onConfirm: () => {} });
const dialogConfirmPrint = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
  onCancel: () => {},
});

const formHeader = reactive<FormHeader>({
  cabang: authStore.user?.cabang || "",
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  nomorSo: "",
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

const items = ref<DetailItem[]>([]);

const summary = reactive({
  diskonPersen: 0,
  diskon: 0,
  biayaKirim: 0,
  dp: 0,
});

// --- Computed Properties (Pengganti prosedur 'hitung' di Delphi) ---
const subtotal = computed(() => {
  return items.value.reduce((total, item) => {
    const itemTotal = (item.jumlah || 0) * (item.harga || 0);
    return total + itemTotal;
  }, 0);
});

const totalDiskonItem = computed(() => {
  return items.value.reduce((total, item) => total + (item.diskonRp || 0), 0);
});

const totalSetelahDiskonItem = computed(() => subtotal.value - totalDiskonItem.value);

const totalDiskonHeader = computed(() => {
  const diskonDariPersen = totalSetelahDiskonItem.value * (summary.diskonPersen / 100);
  return diskonDariPersen + summary.diskon;
});

const dpp = computed(() => totalSetelahDiskonItem.value - totalDiskonHeader.value);
const totalPpn = computed(() => dpp.value * (formHeader.ppn / 100));
const grandTotal = computed(() => dpp.value + totalPpn.value);
const netto = computed(() => grandTotal.value + summary.biayaKirim - summary.dp);

// --- Watchers ---
watch([() => formHeader.tanggal, () => formHeader.top], ([newTanggal, newTop]) => {
  if (newTanggal && newTop >= 0) {
    formHeader.tempo = format(addDays(new Date(newTanggal), newTop), "yyyy-MM-dd");
  }
});

// --- Methods ---
const loadFromSO = async () => {
  if (!formHeader.nomorSo) return;
  loading.value = true;
  try {
    const response = await api.get(`/proforma-form/from-so/${formHeader.nomorSo}`, {
      params: { branchCode: formHeader.cabang },
    });
    const { header, items: soItems } = response.data;

    // --- Copy Header Fields ---
    formHeader.tanggalSo = header.tanggalSo;
    formHeader.customerKode = header.customerKode;
    formHeader.customerNama = header.customerNama;
    formHeader.alamat = header.alamat;
    formHeader.kota = header.kota;
    formHeader.level = `${header.levelKode} - ${header.levelNama}`;
    formHeader.top = header.top;
    formHeader.ppn = header.ppn;
    summary.diskon = header.diskon;
    summary.diskonPersen = header.diskonPersen;
    summary.biayaKirim = header.biayaKirim;
    summary.dp = header.dp;

    // --- Copy Detail Items ---
    items.value = soItems.map(
      (item: {
        kode: string;
        nama: string;
        ukuran: string;
        jumlah: number;
        harga: number;
        diskonPersen: number;
        diskonRp: number;
        barcode: string;
      }) => ({
        id: Math.random(), // Tambahan untuk key unik
        kode: item.kode,
        nama: item.nama,
        ukuran: item.ukuran,
        jumlah: item.jumlah,
        harga: item.harga,
        diskonPersen: item.diskonPersen,
        diskonRp: item.diskonRp,
        barcode: item.barcode,
      })
    );
    toast.success(`Data dari SO ${formHeader.nomorSo} berhasil dimuat.`);
  } catch (err) {
    const error = err as AxiosError<{ message: string }>; // <-- cast ke AxiosError
    toast.error(error.response?.data?.message || "Gagal memuat data SO.");
  } finally {
    loading.value = false;
  }
};

const loadDataForEdit = async (id: string) => {
  loading.value = true;
  try {
    const response = await api.get(`/proforma-form/${id}`);
    const { header, items: proformaItems } = response.data;

    // Salin data ke state, gunakan Object.assign untuk kemudahan
    Object.assign(formHeader, header);
    Object.assign(summary, header); // summary juga diisi dari data header
    items.value = proformaItems;
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat data Proforma.");
    router.back();
  } finally {
    loading.value = false;
  }
};

const handleSave = () => {
  if (!formHeader.nomorSo) return toast.error("Nomor SO harus diisi.");
  if (!formHeader.customerKode) return toast.error("Customer harus diisi (Load dari SO).");
  if (items.value.length === 0) return toast.error("Detail barang tidak boleh kosong.");

  dialogConfirmSave.title = "Konfirmasi Simpan";
  dialogConfirmSave.text = "Apakah Anda yakin ingin menyimpan data Proforma Invoice ini?";
  dialogConfirmSave.onConfirm = executeSave; // Panggil fungsi executeSave saat dikonfirmasi
  dialogConfirmSave.show = true;
};

const executeSave = async () => {
  loading.value = true;
  try {
    const payload = {
      header: { ...formHeader, ...summary },
      items: items.value.filter((item) => item.kode && item.jumlah > 0),
    };

    const response = isEditMode.value
      ? await api.put(`/proforma-form/${route.params.id}`, payload)
      : await api.post("/proforma-form", payload);

    const nomorProforma = response.data.nomor; // Ambil nomor dari respons
    toast.success(response.data.message);

    // Tampilkan dialog konfirmasi cetak SETELAH save berhasil
    dialogConfirmPrint.title = "Cetak Dokumen";
    dialogConfirmPrint.text = `Data berhasil disimpan dengan nomor <strong>${nomorProforma}</strong>. Apakah Anda ingin mencetak?`;
    dialogConfirmPrint.show = true;
    // Aksi jika user klik "Cetak"
    dialogConfirmPrint.onConfirm = () => {
      const printRoute = router.resolve({
        name: "ProformaPrint",
        params: { nomor: nomorProforma },
      });
      window.open(printRoute.href, "_blank");
      router.push({ name: "Proforma" });
    };
    // Aksi jika user klik "Tutup"
    dialogConfirmPrint.onCancel = () => {
      router.push({ name: "Proforma" });
    };
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    loading.value = false;
  }
};

const onSoSelected = (selectedSo: { Nomor: string }) => {
  formHeader.nomorSo = selectedSo.Nomor;
  isSoLookupVisible.value = false;
  // Otomatis load data setelah SO dipilih
  loadFromSO();
};

const onCustomerSelected = (customer: Customer) => {
  formHeader.customerKode = customer.kode;
  formHeader.customerNama = customer.nama;
  formHeader.alamat = customer.alamat;
  formHeader.kota = customer.kota;
  formHeader.level = `${customer.level_kode} - ${customer.level_nama}`;
  isCustomerLookupVisible.value = false;
};

const handleBatal = () => {
  dialogConfirm.title = "Konfirmasi Batal";
  dialogConfirm.text = "Perubahan yang belum disimpan akan hilang. Lanjutkan?";
  dialogConfirm.onConfirm = () => {
    if (isEditMode.value) {
      loadDataForEdit(route.params.id as string); // Muat ulang data asli
      toast.info("Perubahan dibatalkan.");
    } else {
      // Reset form ke kondisi awal jika mode 'Baru'
      // (implementasi refreshdata jika diperlukan)
      router.go(0); // Cara sederhana untuk refresh halaman
    }
  };
  dialogConfirm.show = true;
};

const handleTutup = () => {
  dialogConfirm.title = "Konfirmasi Tutup";
  dialogConfirm.text = "Anda yakin ingin menutup form ini?";
  dialogConfirm.onConfirm = () => {
    router.back();
  };
  dialogConfirm.show = true;
};

const removeRow = (id: number) => {
  const itemIndex = items.value.findIndex((i) => i.id === id);
  if (itemIndex === -1) return;

  const item = items.value[itemIndex];

  // Minta konfirmasi sebelum menghapus
  dialogConfirm.title = "Konfirmasi Hapus";
  dialogConfirm.text = `Anda yakin ingin menghapus item: ${item.nama}?`;
  dialogConfirm.onConfirm = () => {
    // Hapus dari array items
    items.value.splice(itemIndex, 1);
    toast.info("Baris berhasil dihapus.");

    // Karena ini computed property, subtotal akan update otomatis,
    // tapi kalau mau main aman, tidak usah memanggil fungsi hitung apapun
    // selama semuanya pakai computed.
  };
  dialogConfirm.show = true;
};

// --- Konfigurasi Tabel ---
const tableHeaders = [
  { title: "No", key: "no", sortable: false, width: "50px" },
  { title: "Kode Barang", key: "kode", sortable: false, width: "100px" },
  { title: "Nama Barang", key: "nama", sortable: false },
  { title: "Ukuran", key: "ukuran", sortable: false, width: "50px" },
  { title: "Jumlah", key: "jumlah", sortable: false, width: "50px" },
  { title: "Harga", key: "harga", sortable: false, width: "80px" },
  { title: "Diskon %", key: "diskonPersen", sortable: false, width: "60px" },
  { title: "Diskon Rp", key: "diskonRp", sortable: false, width: "60px" },
  { title: "Total", key: "total", sortable: false, width: "80px" },
  { title: "Barcode", key: "barcode", sortable: false, width: "90px" },
  { title: "Aksi", key: "actions", sortable: false, width: "50px", align: "center" },
];

onMounted(() => {
  const id = route.params.id as string;
  if (id) {
    isEditMode.value = true;
    loadDataForEdit(id);
  } else {
    loading.value = false;
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
        color="primary"
        size="small"
        prepend-icon="mdi-content-save"
        @click="handleSave"
        :loading="loading"
        >Simpan</v-btn
      >
      <v-btn
        size="small"
        variant="tonal"
        prepend-icon="mdi-refresh"
        @click="handleBatal"
        :disabled="loading"
        >Batal</v-btn
      >
      <v-btn size="small" prepend-icon="mdi-close" @click="handleTutup" :disabled="loading"
        >Tutup</v-btn
      >
    </template>

    <v-overlay v-model="loading" contained class="align-center justify-center"
      ><v-progress-circular indeterminate
    /></v-overlay>

    <div v-if="!loading" class="form-grid-container">
      <!-- LEFT COLUMN: HEADER -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6"
              ><v-text-field
                label="Cabang"
                v-model="formHeader.cabang"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Nomor"
                v-model="formHeader.nomor"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tanggal"
                v-model="formHeader.tanggal"
                type="date"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6">
              <v-text-field
                label="No. SO (F1)"
                v-model="formHeader.nomorSo"
                :readonly="isEditMode"
                density="compact"
                hide-details
                @keydown.enter="loadFromSO"
                @keydown.f1.prevent="isSoLookupVisible = true"
                placeholder="F1 untuk cari..."
                append-inner-icon="mdi-magnify"
                @click:append-inner="isSoLookupVisible = true"
              />
            </v-col>
          </v-row>
        </div>
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12">
              <v-text-field
                label="Customer (F1)"
                v-model="formHeader.customerNama"
                append-inner-icon="mdi-magnify"
                @click:append-inner="isCustomerLookupVisible = true"
                @keydown.f1.prevent="isCustomerLookupVisible = true"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12"
              ><v-text-field
                label="Alamat"
                v-model="formHeader.alamat"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Level"
                v-model="formHeader.level"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Kota"
                v-model="formHeader.kota"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="4"
              ><v-text-field
                label="TOP (hari)"
                v-model.number="formHeader.top"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="8"
              ><v-text-field
                label="Jatuh Tempo"
                v-model="formHeader.tempo"
                type="date"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-textarea
                label="Keterangan"
                v-model="formHeader.keterangan"
                variant="outlined"
                density="compact"
                hide-details
                rows="2"
            /></v-col>
          </v-row>
        </div>
      </div>

      <!-- RIGHT COLUMN: DETAILS & SUMMARY -->
      <div class="right-column">
        <div class="table-container">
          <v-data-table
            :headers="tableHeaders"
            :items="items"
            class="desktop-table fill-height"
            density="compact"
            fixed-header
            :items-per-page="-1"
          >
            <template v-slot:[`item.jumlah`]="{ item }">
              <v-text-field
                v-model.number="item.jumlah"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-right"
              />
            </template>
            <template v-slot:[`item.harga`]="{ item }">
              <v-text-field
                v-model.number="item.harga"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-right"
              />
            </template>
            <template v-slot:[`item.diskonPersen`]="{ item }">
              <v-text-field
                v-model.number="item.diskonPersen"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-right"
              />
            </template>
            <template v-slot:[`item.diskonRp`]="{ item }">
              {{ (item.diskonRp || 0).toLocaleString("id-ID") }}
            </template>
            <template v-slot:[`item.total`]="{ item }">
              {{
                ((item.jumlah || 0) * (item.harga || 0) - (item.diskonRp || 0)).toLocaleString(
                  "id-ID"
                )
              }}
            </template>
            <template v-slot:[`item.barcode`]="{ item }">
              {{ item.barcode }}
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
                title="Hapus baris ini"
                @click="removeRow(item.id)"
              ></v-btn>
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
        <div class="desktop-form-section">
          <v-row dense>
            <v-col
              ><v-text-field
                label="Subtotal"
                :model-value="totalSetelahDiskonItem.toLocaleString('id-ID')"
                readonly
                filled
                density="compact"
                hide-details
                class="text-right"
            /></v-col>
            <v-col
              ><v-text-field
                label="Diskon (%)"
                v-model.number="summary.diskonPersen"
                density="compact"
                hide-details
                class="text-right"
            /></v-col>
            <v-col
              ><v-text-field
                label="Diskon (Rp)"
                v-model.number="summary.diskon"
                density="compact"
                hide-details
                class="text-right"
            /></v-col>
            <v-col
              ><v-text-field
                label="PPN (%)"
                v-model.number="formHeader.ppn"
                density="compact"
                hide-details
                class="text-right"
                style="max-width: 100px"
            /></v-col>
            <v-col
              ><v-text-field
                label="Total PPN"
                :model-value="totalPpn.toLocaleString('id-ID')"
                readonly
                filled
                density="compact"
                hide-details
                class="text-right"
            /></v-col>
          </v-row>
          <v-row dense class="mt-2">
            <v-col
              ><v-text-field
                label="Grand Total"
                :model-value="grandTotal.toLocaleString('id-ID')"
                readonly
                filled
                density="compact"
                hide-details
                class="text-right font-weight-bold"
            /></v-col>
            <v-col
              ><v-text-field
                label="Biaya Kirim"
                v-model.number="summary.biayaKirim"
                density="compact"
                hide-details
                class="text-right"
            /></v-col>
            <v-col
              ><v-text-field
                label="DP"
                v-model.number="summary.dp"
                density="compact"
                hide-details
                class="text-right"
            /></v-col>
            <v-col
              ><v-text-field
                label="Netto"
                :model-value="netto.toLocaleString('id-ID')"
                readonly
                filled
                density="compact"
                hide-details
                class="text-right font-weight-bold"
            /></v-col>
          </v-row>
        </div>
      </div>
    </div>

    <SoSearchModal
      v-if="isSoLookupVisible"
      :cabang="formHeader.cabang"
      @close="isSoLookupVisible = false"
      @selected="onSoSelected"
    />
    <CustomerSearchModal
      v-if="isCustomerLookupVisible"
      :gudang="formHeader.cabang"
      @close="isCustomerLookupVisible = false"
      @customer-selected="onCustomerSelected"
    />

    <!-- Dialog Konfirmasi (Lengkap) -->
    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              () => {
                dialogConfirm.onConfirm();
                dialogConfirm.show = false;
              }
            "
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogConfirmSave.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirmSave.title }}</v-card-title>

        <v-card-text>{{ dialogConfirmSave.text }}</v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirmSave.show = false">Batal</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              () => {
                dialogConfirmSave.onConfirm();
                dialogConfirmSave.show = false;
              }
            "
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogConfirmPrint.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirmPrint.title }}</v-card-title>

        <v-card-text v-html="dialogConfirmPrint.text"></v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn
            text
            @click="
              () => {
                dialogConfirmPrint.onCancel();
                dialogConfirmPrint.show = false;
              }
            "
            >Tutup</v-btn
          >
          <v-btn
            color="primary"
            @click="
              () => {
                dialogConfirmPrint.onConfirm();
                dialogConfirmPrint.show = false;
              }
            "
            >Cetak</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important; /* Biru Tua */
  color: #ffffff !important; /* Teks Putih */
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important; /* Supaya lebih rapi */
}
</style>

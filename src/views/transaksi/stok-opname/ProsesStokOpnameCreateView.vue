<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";
import type { AxiosError } from "axios";

// --- Interface ---
interface StokOpnameItem {
  id: number;
  Kode: string;
  Nama: string;
  Ukuran: string;
  Stok: number;
  Jumlah: number;
  Selisih: number;
  hpp: number;
  Total: number;
  Lokasi: string;
  Barcode: string;
  lokasi: string;
}

// --- Inisialisasi & State ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "24";

const isEditMode = ref(false);
const isLoading = ref(true);
const isGudangLookupVisible = ref(false);
const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => { } });

const page = ref(1);
const itemsPerPage = ref(50);

const formHeader = reactive({
  nomor: "",
  tanggal: "",
  gudang: authStore.user?.cabang || "",
  gudangNama: authStore.user?.cabangNama || "",
  keterangan: "STOK OPNAME",
});

const items = ref<StokOpnameItem[]>([]);

const headers = [
  { title: "No.", key: "no", sortable: false, width: "50px" },
  { title: "Kode", key: "Kode", width: "150px" },
  { title: "Nama Barang", key: "Nama", minWidth: "300px" },
  { title: "Ukuran", key: "Ukuran", width: "100px" },
  { title: "Stok Awal", key: "Stok", align: "end" },
  { title: "Jumlah Fisik", key: "Jumlah", align: "end" },
  { title: "Selisih", key: "Selisih", align: "end" },
  { title: "HPP", key: "hpp", align: "end" },
  { title: "Total", key: "Total", align: "end" },
  { title: "Lokasi", key: "lokasi", align: "start", width: "200px" },
] as const;

const totalKoreksi = computed(() => {
  return items.value.reduce(
    (sum, item) => sum + (Number(item.Selisih) || 0) * (Number(item.hpp) || 0),
    0
  );
});
const isReadOnly = computed(() => route.query.readonly === "true");

// --- Methods ---

const addNewRow = () => {
  if (!items.value.some((item) => !item.Kode)) {
    items.value.push({
      id: Date.now(),
      Kode: "",
      Nama: "",
      Ukuran: "",
      Stok: 0,
      Jumlah: 0,
      Selisih: 0,
      hpp: 0,
      Total: 0,
      Lokasi: "",
      Barcode: "",
      lokasi: "",
    });
  }
};

const handleItemAdd = async (index: number) => {
  const item = items.value[index];
  const barcode = item.Kode; // Field 'Kode' kita gunakan untuk input barcode
  if (!barcode) return;

  // Cek duplikat di frontend
  const isDuplicate = items.value.some(
    (existingItem, i) => existingItem.Barcode === barcode && i !== index
  );
  if (isDuplicate) {
    toast.error(`Barcode ${barcode} sudah ada di dalam daftar.`);
    item.Kode = ""; // Kosongkan kembali input
    return;
  }

  try {
    isLoading.value = true;
    const response = await api.get(`/proses-stok-opname-form/product-details/${barcode}`, {
      params: {
        cabang: formHeader.gudang,
        tanggalSop: formHeader.tanggal,
      },
    });

    // Isi baris saat ini dengan data dari API
    const productData = response.data;
    items.value[index] = {
      ...item,
      ...productData,
      Jumlah: 0,
      Selisih: 0 - productData.Stok,
      Total: (0 - productData.Stok) * productData.hpp,
    };

    addNewRow(); // Tambah baris kosong baru di bawahnya

    // Fokus ke field Jumlah di baris yang baru diisi
    nextTick(() => {
      const inputJumlah = document.getElementById(`jumlah-${item.id}`);
      inputJumlah?.focus();
    });
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data barang.");
    item.Kode = ""; // Kosongkan input jika barcode tidak ditemukan
  } finally {
    isLoading.value = false;
  }
};

const loadInitialData = async () => {
  if (authStore.user?.cabang === "KDC" && formHeader.gudang === "KDC") {
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  try {
    const response = await api.get("/proses-stok-opname-form/initial-data", {
      params: { cabang: formHeader.gudang },
    });

    formHeader.tanggal = response.data.tanggal;
    items.value = response.data.items.map((item: StokOpnameItem) => ({
      ...item,
      id: Math.random(),
      Total: (Number(item.Selisih) || 0) * (Number(item.hpp) || 0),
    }));
    page.value = 1;
  } catch (error: unknown) {
    // Gunakan unknown, bukan any
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data awal.");
  } finally {
    isLoading.value = false;
  }
};

const handleSave = () => {
  // --- VALIDASI DARI btnSimpanClick DELPHI ---
  if (!formHeader.keterangan.trim()) {
    toast.error("Keterangan harus diisi.");
    return;
  }
  if (items.value.length === 0 || !items.value.some((item) => item.Kode)) {
    toast.error("Detail barang harus diisi.");
    return;
  }
  const itemWithZeroHpp = items.value.find((item) => item.Kode && (!item.hpp || item.hpp === 0));
  if (itemWithZeroHpp) {
    toast.error(
      `HPP untuk barang ${itemWithZeroHpp.Nama} (${itemWithZeroHpp.Ukuran}) harus diisi.`
    );
    return;
  }
  // --- AKHIR VALIDASI ---

  dialogConfirm.title = "Konfirmasi Simpan";
  dialogConfirm.text = "Apakah Anda yakin ingin menyimpan data Stok Opname ini?";
  dialogConfirm.onConfirm = async () => {
    isLoading.value = true;
    try {
      const payload = {
        header: formHeader,
        items: items.value.filter((item) => item.Kode), // Kirim hanya baris yang berisi data
      };

      let response;
      if (isEditMode.value) {
        response = await api.put(`/proses-stok-opname-form/${route.params.nomor}`, payload);
      } else {
        response = await api.post("/proses-stok-opname-form", payload);
      }

      toast.success(response.data.message);
      router.push({ name: "ProsesStokOpname" }); // Kembali ke halaman browse
    } catch (error) {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message || "Gagal menyimpan data.");
    } finally {
      isLoading.value = false;
    }
  };
  dialogConfirm.show = true;
};

const loadDataForEdit = async (id: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/proses-stok-opname-form/${id}`);
    const { header, items: sopItems } = response.data;

    // Isi form header
    formHeader.nomor = header.nomor;
    formHeader.tanggal = header.tanggal;
    formHeader.keterangan = header.keterangan;
    formHeader.gudang = header.gudang;
    // (Isi gudangNama jika perlu)

    // Isi tabel detail
    items.value = sopItems.map((item) => ({
      ...item,
      Total: (Number(item.Selisih) || 0) * (Number(item.hpp) || 0),
    }));
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data.");
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const handleHitungStok = () => {
  dialogConfirm.title = "Konfirmasi Hitung Ulang";
  dialogConfirm.text =
    "Operasi ini akan menghapus semua data di tabel dan menggantinya dengan hasil perhitungan ulang. Lanjutkan?";
  dialogConfirm.onConfirm = loadInitialData; // Panggil ulang fungsi yang sudah ada
  dialogConfirm.show = true;
};

const onGudangSelected = (gudang: { kode: string; nama: string }) => {
  formHeader.gudang = gudang.kode;
  formHeader.gudangNama = gudang.nama;
  isGudangLookupVisible.value = false;
};

const validateGudangKode = async () => {
  if (!formHeader.gudang) {
    formHeader.gudangNama = "";
    return;
  }
  try {
    const response = await api.get(`/warehouses/${formHeader.gudang}`);
    formHeader.gudangNama = response.data.nama;
  } catch (error) {
    formHeader.gudangNama = "";
    toast.error("Kode Gudang tidak ditemukan.", error);
  }
};

const handleFromDatabase = () => {
  dialogConfirm.title = "Muat dari Database";
  dialogConfirm.text =
    "Operasi ini akan menghapus semua data di tabel dan menggantinya dengan data dari staging. Lanjutkan?";
  dialogConfirm.onConfirm = async () => {
    isLoading.value = true;
    try {
      const response = await api.get("/proses-stok-opname-form/from-database");
      // Ganti data di grid dengan hasil dari API
      items.value = response.data.items.map((item) => ({
        ...item,
        id: Math.random(), // Beri ID unik untuk v-for
      }));
      toast.success("Data berhasil dimuat dari database.");
    } catch (error) {
      const axiosError = error as AxiosError<{ message: string }>;
      toast.error(axiosError.response?.data?.message || "Gagal memuat data.");
    } finally {
      isLoading.value = false;
    }
  };
  dialogConfirm.show = true;
};

// Pantau perubahan gudang: jika Admin ganti cabang, data langsung refresh
watch(
  () => formHeader.gudang,
  (newVal) => {
    if (newVal && !isEditMode.value) {
      loadInitialData();
    }
  }
);

onMounted(() => {
  const id = route.params.nomor as string;
  if (id) {
    isEditMode.value = true;
    loadDataForEdit(id); // Memanggil fungsi agar tidak "assigned but never used"
  } else {
    if (authStore.user?.cabang !== "KDC") {
      loadInitialData();
    } else {
      isLoading.value = false;
    }
    addNewRow();
  }
});
</script>

<template>
  <PageLayout :title="isEditMode ? 'Ubah Stok Opname' : 'Buat Stok Opname'" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="handleSave" :loading="isLoading" :disabled="isReadOnly">Simpan</v-btn>
      <v-btn size="small" @click="router.back()">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6"><v-text-field label="SOP" v-model="formHeader.nomor" readonly filled density="compact"
                hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="formHeader.tanggal" type="date" readonly filled
                density="compact" hide-details /></v-col>
            <v-col cols="6">
              <v-text-field label="Gudang (F1)" v-model="formHeader.gudang" density="compact" hide-details
                :readonly="isEditMode || authStore.user?.cabang !== 'KDC'"
                @keydown.f1.prevent="isGudangLookupVisible = true" @blur="validateGudangKode"
                append-inner-icon="mdi-magnify" @click:append-inner="isGudangLookupVisible = true" />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model="formHeader.gudangNama" label="Nama Gudang" readonly filled density="compact"
                hide-details />
            </v-col>
            <v-col cols="12">
              <v-text-field label="Keterangan" v-model="formHeader.keterangan" density="compact" :readonly="isReadOnly"
                hide-details>
              </v-text-field>
            </v-col>
            <v-btn color="secondary" @click="handleFromDatabase" :loading="isLoading"
              :disabled="isReadOnly || isEditMode" prepend-icon="mdi-database-arrow-down">
              From Database
            </v-btn>
            <v-btn color="info" @click="handleHitungStok" :loading="isLoading" :disabled="isReadOnly || isEditMode"
              prepend-icon="mdi-calculator">
              Hitung Stok
            </v-btn>
          </v-row>
        </div>
      </div>

      <div class="right-column">
        <div class="table-container">
          <v-data-table v-model:page="page" :items-per-page="itemsPerPage" :headers="headers" :items="items"
            :loading="isLoading" class="desktop-table fill-height" density="compact" fixed-header>
            <template v-slot:[`item.no`]="{ index }">
              {{ (page - 1) * itemsPerPage + index + 1 }}
            </template>

            <template v-slot:[`item.Kode`]="{ item, index }">
              <v-text-field v-model="item.Kode" variant="underlined" density="compact" hide-details
                :readonly="!!item.Nama" placeholder="Scan Barcode..." @keydown.enter.prevent="handleItemAdd(index)" />
            </template>

            <template v-slot:[`item.Jumlah`]="{ item }">
              <v-text-field :id="`jumlah-${item.id}`" v-model.number="item.Jumlah" type="number" variant="underlined"
                density="compact" hide-details class="text-right" @update:modelValue="
                  (val) => {
                    const jumlah = Number(val) || 0;
                    const stok = Number(item.Stok) || 0;
                    const hpp = Number(item.hpp) || 0;

                    item.Selisih = jumlah - stok;
                    item.Total = item.Selisih * hpp;
                  }
                " />
            </template>

            <template v-for="col in ['Stok', 'Selisih', 'hpp', 'Total']" #[`item.${col}`]="{ item }">
              {{ (item[col] || 0).toLocaleString("id-ID") }}
            </template>
          </v-data-table>
        </div>
        <div class="desktop-form-section d-flex align-center">
          <v-spacer />
          <span class="font-weight-bold me-4">Total Koreksi:</span>
          <v-text-field :model-value="totalKoreksi.toLocaleString('id-ID')" readonly filled density="compact"
            hide-details class="text-right font-weight-bold" style="max-width: 250px" />
        </div>
      </div>
    </div>

    <GudangSearchModal v-if="isGudangLookupVisible" :user-cabang="authStore.user?.cabang || ''" :only-dc="false"
      source="stok-opname" @close="isGudangLookupVisible = false" @gudang-selected="onGudangSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>
          <div v-html="dialogConfirm.text"></div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="
            () => {
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            }
          ">Ya, Lanjutkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

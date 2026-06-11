<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";
import MintaBarangSearchModal from "@/components/lookup/MintaBarangSearchModal.vue";
import type { AxiosError } from "axios";

// --- Tipe Data & State ---
interface Item1 {
  id: number;
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  stok: number;
  jumlah: number;
  sudah: number;
  belum: number;
  closing: string;
  jumlahx: number; // Untuk validasi
}
interface Item2 {
  id: number;
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  resize: string;
  tanggal: string;
  mutasi: string;
  kodelama: string;
  ukuranlama: string;
  closing: string;
  jumlahx: number; // Untuk validasi
}
interface Grid1RowClick {
  item: Item1;
  index: number;
}
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "215"; // Ganti ke 210 sesuai referensi

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => (isEditMode.value ? "Ubah QC ke Garmen" : "Buat QC ke Garmen"));
const isLoading = ref(true);
const isDataLoading = ref(true); // Flag xLoad
const isSaving = ref(false);
const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
  onCancel: () => {
    dialogConfirm.show = false;
  },
});
const isGudangSearchVisible = ref(false);
const isBarangSearchVisible = ref(false);
const barangSearchTargetGrid = ref(1);
const barangSearchFilter = ref<{ kode: string | null }>({ kode: null });
const barangSearchSource = ref("qc-grid1-f1");
const dialogConfirmCetak = reactive({
  show: false,
  nomor: "",
  onConfirm: () => {},
  onCancel: () => {},
});

const header = reactive({
  nomor: "<--Kosong=Baru",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  gudang: "GJ001",
  namaGudang: "GUDANG BARANG JADI JERON",
  keterangan: "",
  closing: "",
});
const items1 = ref<Item1[]>([]);
const items2 = ref<Item2[]>([]);
const activeGrid1Row = ref<Item1 | null>(null);

const headers1 = [
  { title: "No.", key: "no", sortable: false, width: "40px" },
  { title: "Kode Barang", key: "kode", width: "200px" },
  { title: "Nama Barang", key: "nama", minWidth: "300px" },
  { title: "Ukuran", key: "ukuran", width: "100px" },
  { title: "Stok", key: "stok", width: "90px" },
  { title: "Jumlah", key: "jumlah", width: "120px" },
  { title: "Sudah Terima", key: "sudah", width: "120px" },
  { title: "Belum Terima", key: "belum", width: "120px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
];
const headers2 = [
  { title: "No.", key: "no", sortable: false, width: "40px" },
  { title: "Kode Barang", key: "kode", width: "150px" },
  { title: "Nama Barang", key: "nama", minWidth: "250px" },
  { title: "Ukuran", key: "ukuran", width: "80px" },
  { title: "Jumlah", key: "jumlah", width: "100px" },
  { title: "Tanggal", key: "tanggal", width: "110px" },
  { title: "No Mutasi", key: "mutasi", width: "140px" },
  { title: "Kode Lama", key: "kodelama", width: "120px" },
  { title: "Ukuran Lama", key: "ukuranlama", width: "100px" },
  { title: "Resize", key: "resize", width: "70px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
];

// --- Methods ---
const loadDataForEdit = async (nomor: string) => {
  isDataLoading.value = true;
  try {
    const response = await api.get(`/qc-ke-garmen-form/${nomor}`);
    const { header: dataHeader, items1: dataItems1, items2: dataItems2 } = response.data;

    Object.assign(header, dataHeader);
    items1.value = dataItems1.map((item: Item1) => ({
      ...item,
      id: Math.random(),
    }));

    // ✅ Pastikan semua field ter-map
    items2.value = dataItems2.map((item: Item2) => ({
      ...item,
      id: Math.random(),
      tanggal: item.tanggal || format(new Date(), "yyyy-MM-dd"),
      mutasi: item.mutasi || "",
      kodelama: item.kodelama || "",
      ukuranlama: item.ukuranlama || "",
    }));

    addNewRow1();
    addNewRow2();
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data.");
    router.back();
  } finally {
    isDataLoading.value = false;
    isLoading.value = false;
  }
};

const onGudangSelected = (gudang: { kode: string; nama: string }) => {
  header.gudang = gudang.kode;
  header.namaGudang = gudang.nama;
  isGudangSearchVisible.value = false;
};

const openBarangSearch = (grid: number, filterKode: string | null = null) => {
  if (header.closing === "Y") return;

  barangSearchTargetGrid.value = grid;

  if (grid === 2 && !filterKode) {
    filterKode = activeGrid1Row.value?.kode || null;
  }

  barangSearchFilter.value.kode = filterKode;

  barangSearchSource.value =
    grid === 1 ? "qc-grid1-f1" : filterKode ? "qc-grid2-f2" : "qc-grid1-f1";

  isBarangSearchVisible.value = true;
};

const handleOpenBarangSearchF2 = () => {
  if (!activeGrid1Row.value?.kode) {
    return toast.warning("Pilih barang di Grid 1 yang sudah terisi dulu.");
  }

  openBarangSearch(2, activeGrid1Row.value.kode);
};

const onSelectGrid1Row = (event: MouseEvent, payload: Grid1RowClick) => {
  activeGrid1Row.value = payload.item;
};

// --- FUNGSI BARU: Enter di Grid 1 (loadbrg) ---
const handleGridBarcodeEnterGrid1 = async (item: Item1) => {
  const barcode = item.kode;
  if (!barcode || header.closing === "Y") return;

  if (items1.value.some((i) => i.barcode === barcode && i.id !== item.id)) {
    toast.warning(`Barcode ${barcode} sudah di-input.`);
    return (item.kode = "");
  }
  try {
    const product = await api.get("/qc-ke-garmen-form/product-by-barcode-grid1", {
      params: { barcode },
    });
    item.kode = product.data.kode;
    item.barcode = product.data.barcode;
    item.nama = product.data.nama;
    item.ukuran = product.data.ukuran;
    item.stok = product.data.stok;
    item.jumlah = 1;
    addNewRow1();
    nextTick(() => {
      document.getElementById(`jumlah-${item.id}`)?.focus();
    });
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Barcode tidak terdaftar.");
    item.kode = "";
  }
};

// --- FUNGSI BARU: Enter di Grid 2 (loadbrg2) ---
const handleGridBarcodeEnterGrid2 = async (item: Item2) => {
  const barcode = item.kode;
  if (!barcode || header.closing === "Y") return;

  if (!activeGrid1Row.value) {
    toast.warning('Pilih item di grid "Kirim" terlebih dahulu.');
    return (item.kode = "");
  }

  try {
    const product = await api.get("/qc-ke-garmen-form/product-by-barcode-grid2", {
      params: { barcode },
    });

    item.kode = product.data.kode;
    item.barcode = product.data.barcode;
    item.nama = product.data.nama;
    item.ukuran = product.data.ukuran;
    item.jumlah = 1;
    item.closing = "N";

    const item1 = activeGrid1Row.value;
    item.kodelama = item1.kode;
    item.ukuranlama = item1.ukuran;
    item.tanggal = format(new Date(), "yyyy-MM-dd");
    item.resize =
      item1.kode === product.data.kode && item1.ukuran === product.data.ukuran ? "N" : "Y";

    addNewRow2();
    nextTick(() => {
      document.getElementById(`jumlah2-${item.id}`)?.focus();
    });
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Barcode tidak terdaftar.");
    item.kode = "";
  }
};

const onBarangSelected = (
  products: { kode: string; barcode: string; nama: string; ukuran: string; stok: number }[]
) => {
  isBarangSearchVisible.value = false;
  if (products.length === 0) return;

  const product = products[0];
  const isGrid1 = barangSearchTargetGrid.value === 1;

  if (isGrid1) {
    // --- Grid 1 (Item1) ---
    const targetRow = items1.value[items1.value.length - 1] as Item1;
    if (!targetRow) return;

    // Cek duplikat
    if (items1.value.some((item) => item.kode === product.kode && item.ukuran === product.ukuran)) {
      return toast.warning("Barang ini sudah ada di daftar.");
    }

    targetRow.id = Date.now();
    targetRow.kode = product.kode;
    targetRow.barcode = product.barcode;
    targetRow.nama = product.nama;
    targetRow.ukuran = product.ukuran;
    targetRow.stok = product.stok;
    targetRow.jumlah = 1;
    targetRow.closing = "N";

    addNewRow1();

    nextTick(() => {
      const inputElement = document.getElementById(
        `jumlah-${targetRow.id}`
      ) as HTMLInputElement | null;
      inputElement?.focus();
    });
  } else {
    // --- Grid 2 (Item2) ---
    const targetRow = items2.value[items2.value.length - 1] as Item2;
    if (!targetRow) return;

    // Cek duplikat
    if (items2.value.some((item) => item.kode === product.kode && item.ukuran === product.ukuran)) {
      return toast.warning("Barang ini sudah ada di daftar.");
    }

    targetRow.id = Date.now();
    targetRow.kode = product.kode;
    targetRow.barcode = product.barcode;
    targetRow.nama = product.nama;
    targetRow.ukuran = product.ukuran;
    targetRow.jumlah = 1;
    targetRow.closing = "N";

    if (activeGrid1Row.value) {
      targetRow.kodelama = activeGrid1Row.value.kode;
      targetRow.ukuranlama = activeGrid1Row.value.ukuran;
      targetRow.tanggal = format(new Date(), "yyyy-MM-dd");
      targetRow.resize =
        activeGrid1Row.value.kode !== product.kode || activeGrid1Row.value.ukuran !== product.ukuran
          ? "Y"
          : "N";
    }

    addNewRow2();

    nextTick(() => {
      const inputElement = document.getElementById(
        `jumlah2-${targetRow.id}`
      ) as HTMLInputElement | null;
      inputElement?.focus();
    });
  }
};

const addNewRow1 = () => {
  if (!items1.value.find((item) => !item.kode)) {
    items1.value.push({
      id: Date.now(),
      kode: "",
      barcode: "",
      nama: "",
      ukuran: "",
      stok: 0,
      jumlah: 0,
      sudah: 0,
      belum: 0,
      closing: "N",
      jumlahx: 0,
    });
  }
};
const removeRow1 = (id: number) => {
  const item = items1.value.find((i) => i.id === id);
  if (!item) return;

  // Validasi 1: Cek apakah item sudah diterima di grid 2
  // Sesuai Delphi: If (cxGrdMaster2.DataController.Values[0, clNama2.Index] <> null)
  const hasGrid2Data = items2.value.some(
    (i) => i.kodelama === item.kode && i.ukuranlama === item.ukuran && i.jumlah > 0
  );
  if (hasGrid2Data) {
    return toast.error("Sudah ada pengembalian barang. Tidak bisa dihapus.");
  }

  // Validasi 2: Cek status closing item
  // Sesuai Delphi: if CDS.FieldByName('closing').AsString='Y'
  if (item.closing === "Y") {
    return toast.error("Sudah Closing. Tidak bisa dihapus.");
  }

  // Tampilkan konfirmasi
  // Sesuai Delphi: if MessageDlg('Ingin dihapus?',mtCustom,[mbYes,mbNo], 0) = mrYes
  showConfirmation("Konfirmasi Hapus", "Ingin dihapus?", () => {
    // Hapus item
    items1.value = items1.value.filter((i) => i.id !== id);
    // Tambah baris kosong jika grid jadi kosong
    // Sesuai Delphi: If CDS.Eof then initgrid;
    if (items1.value.length === 0) {
      addNewRow1();
    }
  });
};
const addNewRow2 = () => {
  if (!items2.value.find((item) => !item.kode)) {
    items2.value.push({
      id: Date.now(),
      kode: "",
      barcode: "",
      nama: "",
      ukuran: "",
      jumlah: 0,
      resize: "N",
      tanggal: format(new Date(), "yyyy-MM-dd"),
      mutasi: "", // ✅ kosong untuk baris baru
      kodelama: "", // ✅ diisi saat pilih barang
      ukuranlama: "", // ✅ diisi saat pilih barang
      closing: "N",
      jumlahx: 0,
    });
  }
};
const removeRow2 = (id: number) => {
  const item = items2.value.find((i) => i.id === id);
  if (!item) return;

  // Validasi: Cek status closing item
  // Sesuai Delphi: if CDS2.FieldByName('closing').AsString='Y'
  if (item.closing === "Y") {
    return toast.error("Sudah Closing. Tidak bisa dihapus.");
  }

  // Tampilkan konfirmasi
  // Sesuai Delphi: if MessageDlg('Ingin dihapus?',mtCustom,[mbYes,mbNo], 0) = mrYes
  showConfirmation("Konfirmasi Hapus", "Ingin dihapus?", () => {
    // Hapus item
    items2.value = items2.value.filter((i) => i.id !== id);
    // Tambah baris kosong jika grid jadi kosong
    // Sesuai Delphi: If CDS2.Eof then initgrid2;
    if (items2.value.length === 0) {
      addNewRow2();
    }
  });
};

const save = () => {
  if (header.closing === "Y") return toast.error("Sudah Closing. Tidak bisa diubah.");
  if (!header.gudang) return toast.error("Ke Gudang harus diisi.");

  const validItems1 = items1.value.filter((i) => i.kode);
  if (validItems1.length === 0) return toast.error("Detail Kirim harus diisi.");
  if (validItems1.some((i) => (i.jumlah || 0) === 0))
    return toast.error("Jumlah Kirim tidak boleh nol.");
  if (validItems1.some((i) => i.jumlah > i.stok)) return toast.error("Jumlah Kirim melebihi stok.");

  showConfirmation("Konfirmasi Simpan", "Anda yakin ingin menyimpan data QC ini?", executeSave);
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header,
      items1: items1.value.filter((i) => i.kode && i.jumlah > 0),
      items2: items2.value.filter((i) => i.kode && i.jumlah > 0),
      isEdit: isEditMode.value,
    };

    const response = isEditMode.value
      ? await api.put(`/qc-ke-garmen-form/${route.params.nomor}`, payload)
      : await api.post("/qc-ke-garmen-form", payload);

    toast.success(response.data.message);
    const savedNomor = response.data.nomor;

    // Panggil dialog cetak
    dialogConfirmCetak.nomor = savedNomor;
    dialogConfirmCetak.onConfirm = () => {
      const routeData = router.resolve({ name: "QcGarmenPrint", params: { nomor: savedNomor } });
      window.open(routeData.href, "_blank");
      router.push({ name: "QcGarmen" });
    };
    dialogConfirmCetak.onCancel = () => {
      router.push({ name: "QcGarmen" });
    };
    dialogConfirmCetak.show = true;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
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

const refreshForm = () => {
  header.nomor = "<--Kosong=Baru";
  header.tanggal = format(new Date(), "yyyy-MM-dd");
  header.gudang = "GJ002";
  header.namaGudang = "GUDANG BARANG JADI P1";
  header.keterangan = "";
  header.closing = "";
  items1.value = [];
  items2.value = [];
  addNewRow1();
  addNewRow2();
};

const handleBatal = () => {
  showConfirmation("Konfirmasi Batal", "Akan membatalkan perubahan?", () => {
    if (isEditMode.value) {
      loadDataForEdit(route.params.nomor as string);
    } else {
      refreshForm();
    }
  });
};

const handleTutup = () => {
  showConfirmation(
    "Konfirmasi Tutup",
    "Tutup form? Perubahan yang belum disimpan akan hilang.",
    () => {
      router.back();
    }
  );
};

const handleGrid1Keydown = (e: KeyboardEvent, item: Item1) => {
  switch (e.key) {
    case "F1":
      e.preventDefault();
      openBarangSearch(1, null);
      break;

    case "Enter":
      e.preventDefault();
      handleGridBarcodeEnterGrid1(item);
      break;
  }
};

const handleGrid2Keydown = (e: KeyboardEvent, item: Item2) => {
  switch (e.key) {
    case "F1":
      e.preventDefault();
      openBarangSearch(2, null);
      break;

    case "F2":
      e.preventDefault();
      handleOpenBarangSearchF2();
      break;

    case "Enter":
      e.preventDefault();
      handleGridBarcodeEnterGrid2(item);
      break;
  }
};

const handleGudangKeydown = (e: KeyboardEvent) => {
  if (e.key === "F1") {
    e.preventDefault();
    isGudangSearchVisible.value = true;
  }
};

onMounted(async () => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    await loadDataForEdit(nomor);
  } else {
    addNewRow1();
    addNewRow2();
  }
  isLoading.value = false;
  isDataLoading.value = false;
});
</script>

<template>
  <PageLayout :title="pageTitle" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        color="primary"
        size="small"
        @click="save"
        :loading="isSaving"
        prepend-icon="mdi-content-save"
        :disabled="header.closing === 'Y'"
        >Simpan</v-btn
      >
      <v-btn @click="handleBatal" size="small" prepend-icon="mdi-refresh">Batal</v-btn>
      <v-btn @click="handleTutup" size="small" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense class="hide-details">
            <v-col cols="6">
              <v-text-field
                label="Nomor"
                v-model="header.nomor"
                readonly
                filled
                density="compact"
              />
              <v-chip v-if="header.closing === 'Y'" color="error" size="small" label
                >SUDAH CLOSING</v-chip
              >
            </v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tanggal"
                v-model="header.tanggal"
                type="date"
                variant="outlined"
                density="compact"
            /></v-col>
            <v-col cols="12">
              <v-text-field
                label="Ke Gudang (F1)"
                v-model="header.gudang"
                append-inner-icon="mdi-magnify"
                @click:append-inner="isGudangSearchVisible = true"
                @keydown="handleGudangKeydown"
                density="compact"
              />
            </v-col>
            <v-col cols="12"
              ><v-text-field
                label="Nama Gudang"
                v-model="header.namaGudang"
                readonly
                filled
                density="compact"
            /></v-col>
            <v-col cols="12"
              ><v-textarea
                label="Keterangan"
                v-model="header.keterangan"
                rows="3"
                variant="outlined"
                density="compact"
            /></v-col>
          </v-row>
        </div>
      </div>

      <div class="right-column" style="grid-template-rows: 1fr 1fr; gap: 16px; display: grid">
        <div class="desktop-form-section d-flex flex-column">
          <div class="text-subtitle-1 font-weight-bold mb-2">
            Item Kirim ke Garmen (F1 untuk tambah)
          </div>
          <v-data-table
            :headers="headers1"
            :items="items1"
            :loading="isLoading"
            class="desktop-table fill-height"
            density="compact"
            fixed-header
            :items-per-page="-1"
            @click:row="onSelectGrid1Row"
            :item-class="(item: Item1) => item.id === activeGrid1Row?.id ? 'bg-blue-lighten-5' : ''"
          >
            <template v-slot:[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>
            <template v-slot:[`item.kode`]="{ item }">
              <v-text-field
                v-model="item.kode"
                variant="underlined"
                density="compact"
                hide-details
                placeholder="Scan/F1..."
                @keydown="handleGrid1Keydown($event, item)"
                :readonly="!!item.nama || header.closing === 'Y'"
              />
            </template>
            <template v-slot:[`item.stok`]="{ item }">
              <td class="text-end">{{ (item.stok || 0).toLocaleString("id-ID") }}</td>
            </template>
            <template v-slot:[`item.jumlah`]="{ item }">
              <v-text-field
                :id="`jumlah-${item.id}`"
                v-model.number="item.jumlah"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
                :readonly="header.closing === 'Y'"
              />
            </template>
            <template v-slot:[`item.sudah`]="{ item }">
              <td class="text-end">{{ (item.sudah || 0).toLocaleString("id-ID") }}</td>
            </template>
            <template v-slot:[`item.belum`]="{ item }">
              <td class="text-end">{{ (item.belum || 0).toLocaleString("id-ID") }}</td>
            </template>
            <template v-slot:[`item.actions`]="{ item }">
              <v-btn
                v-if="item.kode && header.closing !== 'Y'"
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
                @click="removeRow1(item.id)"
              />
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
        <div class="desktop-form-section d-flex flex-column">
          <div class="text-subtitle-1 font-weight-bold mb-2">
            Item Terima / Resize (F1: All, F2: Sesuai Item Kirim)
          </div>
          <v-data-table
            :headers="headers2"
            :items="items2"
            :loading="isLoading"
            class="desktop-table fill-height"
            density="compact"
            fixed-header
            :items-per-page="-1"
          >
            <template v-slot:[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>
            <template v-slot:[`item.kode`]="{ item }">
              <v-text-field
                v-model="item.kode"
                variant="underlined"
                density="compact"
                hide-details
                placeholder="Scan/F1/F2..."
                @keydown="handleGrid2Keydown($event, item)"
                :readonly="!!item.nama || item.closing === 'Y'"
              />
            </template>
            <template v-slot:[`item.tanggal`]="{ item }">
              <v-menu :close-on-content-click="false">
                <template v-slot:activator="{ props }">
                  <v-text-field
                    v-model="item.tanggal"
                    type="date"
                    variant="underlined"
                    density="compact"
                    hide-details
                    :readonly="item.closing === 'Y'"
                    v-bind="props"
                  />
                </template>
              </v-menu>
            </template>
            <template v-slot:[`item.jumlah`]="{ item }">
              <v-text-field
                :id="`jumlah2-${item.id}`"
                v-model.number="item.jumlah"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
                :readonly="item.closing === 'Y'"
              />
            </template>
            <template v-slot:[`item.resize`]="{ item }">
              <v-chip size="x-small" :color="item.resize === 'Y' ? 'primary' : 'default'">
                {{ item.resize }}
              </v-chip>
            </template>
            <template v-slot:[`item.mutasi`]="{ item }">
              <span class="text-caption">{{ item.mutasi || "-" }}</span>
            </template>
            <template v-slot:[`item.kodelama`]="{ item }">
              <span class="text-caption text-grey-darken-1">{{ item.kodelama || "-" }}</span>
            </template>
            <template v-slot:[`item.ukuranlama`]="{ item }">
              <span class="text-caption text-grey-darken-1">{{ item.ukuranlama || "-" }}</span>
            </template>
            <template v-slot:[`item.actions`]="{ item }">
              <v-btn
                v-if="item.kode && item.closing !== 'Y'"
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
                @click="removeRow2(item.id)"
              />
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>

    <GudangSearchModal
      v-if="isGudangSearchVisible"
      source="qc-ke-garmen"
      :user-cabang="authStore.user?.cabang || ''"
      @close="isGudangSearchVisible = false"
      @select="onGudangSelected"
    />
    <MintaBarangSearchModal
      v-if="isBarangSearchVisible"
      :key="barangSearchSource + (barangSearchFilter.kode || '')"
      :source="barangSearchSource"
      :gudang="authStore.user?.cabang || 'KDC'"
      :filter-kode="barangSearchFilter.kode"
      :multi="false"
      @close="isBarangSearchVisible = false"
      @products-selected="onBarangSelected"
    />

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
          Berhasil Simpan dengan Nomor <strong>{{ dialogConfirmCetak.nomor }}</strong
          >.
          <br />
          Ingin Cetak transaksi?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirmCetak.onCancel">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirmCetak.onConfirm"
            >Ya, Cetak</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* (Salin style dari MutasiAntarGudangFormView, tambahkan .hide-details) */
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
  height: 100%;
}

.desktop-table {
  flex-grow: 1;
}

.hide-details :deep(.v-input__details) {
  display: none;
}

.text-caption {
  font-size: 0.75rem;
}

.text-grey-darken-1 {
  color: #757575;
}

/* Highlight resize */
.v-chip.v-chip--size-x-small {
  font-weight: 600;
}
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

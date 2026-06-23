<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import TshirtTypeSearchModal from "@/components/lookup/TshirtTypeSearchModal.vue";
import ProductVariantSearchModal from "@/components/lookup/ProductVariantSearchModal.vue";
import AdditionalCostSearchModal from "@/components/lookup/AdditionalCostSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { useRouter, useRoute } from "vue-router";
import { format } from "date-fns";
import { formatRupiah } from "@/utils/formatRupiah";
import type { AxiosError } from "axios";

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "38";

// --- Interfaces ---
interface SizeItem {
  id?: number; // <--- Tambahkan ini
  ukuran?: string; // <--- Tambahkan ini
  size: string;
  qty: number | null;
  hargaPcs: number;
  hargaKaos: number;
  totalHarga: number;
  kodeBarang: string;
  namaBarang: string;
  isManualPrice?: boolean;
}
interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  top: number;
  level: string;
}

interface AdditionalCostItem {
  id: number;
  tambahan: string;
  harga: number;
}

interface CostsDetail {
  cm: number;
  min: number;
}

interface Costs {
  bordir?: CostsDetail;
  dtf?: CostsDetail;
}

interface TshirtTypeResponse {
  sizes: SizeItem[];
  costs?: Costs;
}

interface AdditionalCostResponse {
  pht_jenis: string;
  pht_harga: number;
}

interface TemplateSize {
  ukuran?: string;
  hargaPcs: number;
}

interface SavedSize {
  phs_size: string;
  phs_jumlah: number;
  phs_harga: number;
  phs_kode: string;
  nama_barang?: string;
}

// --- State ---
const activeTab = ref("pengajuan");
const isLoadingData = ref(false);
const header = ref({
  nomor: "",
  tanggal: new Date().toISOString().substr(0, 10),
  approval: "",
  isApproved: false,
  customerKode: "",
  customerNama: "",
  keterangan: "",
  jenisKaos: "",
  ketersediaan: "Custom", // Stok atau Custom
});
const sizeItems = ref<SizeItem[]>([]);
const additionalCostItems = ref<AdditionalCostItem[]>([]);
const imagePreview = ref<string | null>(null);
const selectedFile = ref<File | null>(null);
const footer = ref({
  hargaBruto: 0,
  diskon: 0,
  hargaNetto: 0,
});

const bordirCost = ref(0);
const dtfCost = ref(0);

const isCustomerSearchVisible = ref(false);
const isTshirtTypeSearchVisible = ref(false);
const isSaving = ref(false);

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? `Ubah Pengajuan Harga: ${header.value.nomor}` : "Buat Pengajuan Harga"
);
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));

const isProductVariantSearchVisible = ref(false);
const activeItemIndexForProductSearch = ref(0);

const isUpdateAllConfirmVisible = ref(false);
const selectedProductForUpdate = ref<{ Kode: string; Nama: string } | null>(null);

const isAdditionalCostSearchVisible = ref(false);
const activeAdditionalCostIndex = ref(0);

const totalHargaTambahan = computed(() => {
  return additionalCostItems.value.reduce((sum, item) => sum + (item.harga || 0), 0);
});

const bordirItems = ref(Array.from({ length: 8 }, () => ({ p: 0, l: 0 })));
const biayaPerCmBordir = ref(0);
const bordirMinCharge = ref(3000);
const totalLuasBordir = computed(() => {
  return bordirItems.value.reduce((total, item) => {
    return total + (item.p || 0) * (item.l || 0);
  }, 0);
});

const dtfItems = ref(Array.from({ length: 8 }, () => ({ p: 0, l: 0 })));
const biayaPerCmDtf = ref(0);
const dtfMinCharge = ref(3000);

const totalHargaBordir = computed(() => {
  return Math.round(totalLuasBordir.value * (biayaPerCmBordir.value || 0));
});

const totalLuasDtf = computed(() => {
  return dtfItems.value.reduce((total, item) => {
    return total + (item.p || 0) * (item.l || 0);
  }, 0);
});

const totalHargaDtf = computed(() => {
  return Math.round(totalLuasDtf.value * (biayaPerCmDtf.value || 0));
});

const isSaveConfirmVisible = ref(false);
const isCancelConfirmVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref("");
const pendingAction = ref<(() => void) | null>(null);

// --- Methods ---
const onFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    if (file.size > 500000) {
      toast.error("Ukuran gambar tidak boleh melebihi 500 KB.");
      return;
    }
    selectedFile.value = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};
const openCustomerSearch = () => {
  isCustomerSearchVisible.value = true;
};
const onCustomerSelected = (customer: Customer) => {
  isCustomerSearchVisible.value = false;
  if (customer) {
    header.value.customerKode = customer.kode;
    header.value.customerNama = customer.nama;
  }
};
const openTshirtTypeSearch = () => {
  isTshirtTypeSearchVisible.value = true;
};
const onTshirtTypeSelected = async (type: { jenisKaos: string }) => {
  header.value.jenisKaos = type.jenisKaos;
  isTshirtTypeSearchVisible.value = false;

  try {
    const response = await api.get<TshirtTypeResponse>("/price-proposal-form/tshirt-type-details", {
      params: {
        jenisKaos: type.jenisKaos,
        custom: header.value.ketersediaan === "Custom" ? "Y" : "N",
      },
    });

    const data = response.data;

    // Map data ukuran seperti biasa
    if (data && Array.isArray(data.sizes)) {
      sizeItems.value = data.sizes.map((item) => ({
        id: Date.now() + Math.random(),
        size: item.ukuran ?? "",
        ukuran: item.ukuran,
        qty: null,
        hargaPcs: item.hargaPcs,
        isManualPrice: item.hargaPcs === 0,
        totalHarga: 0,
        hargaKaos: 0,
        kodeBarang: "",
        namaBarang: "",
      }));
    }

    // Ambil data biaya dari respons
    const costs = data.costs;
    if (costs) {
      if (costs.bordir) {
        biayaPerCmBordir.value = costs.bordir.cm || 0;
        bordirMinCharge.value = costs.bordir.min || 0;
      }
      if (costs.dtf) {
        biayaPerCmDtf.value = costs.dtf.cm || 0;
        dtfMinCharge.value = costs.dtf.min || 0;
      }
    }
  } catch (error) {
    toast.error("Gagal memuat detail harga jenis kaos.");
    console.error("Error onTshirtTypeSelected:", error);
  }
};

const save = () => {
  // 1. Validasi Header
  if (!header.value.customerKode) return toast.error("Customer harus diisi.");
  if (!header.value.jenisKaos) return toast.error("Jenis Kaos harus diisi.");

  // 2. Cek apakah ada qty yang diisi
  const totalQty = sizeItems.value.reduce((sum, item) => sum + (item.qty || 0), 0);
  if (totalQty === 0) return toast.error("Jumlah order (Qty) belum diisi.");

  // 3. [MANDATORY] Validasi Pemilihan Warna Barang (Kode/Nama Barang)
  const incompleteItems = sizeItems.value.filter((item) => (item.qty || 0) > 0 && !item.kodeBarang);
  if (incompleteItems.length > 0) {
    const missingSizes = incompleteItems.map((i) => i.size).join(", ");
    return toast.error(
      `Silakan pilih warna barang (klik icon cari atau Tekan F1) untuk ukuran: ${missingSizes}`
    );
  }

  // 4. [MANDATORY] Validasi Wajib Upload Gambar sebelum bisa Simpan
  if (!selectedFile.value && !imagePreview.value) {
    return toast.error("Gambar desain/referensi wajib diunggah sebelum menyimpan pengajuan harga.");
  }

  // Jika semua lolos, tampilkan dialog konfirmasi simpan
  isSaveConfirmVisible.value = true;
};

const executeSave = async () => {
  isSaveConfirmVisible.value = false;
  isSaving.value = true;

  try {
    // Filter dan persiapkan data dengan benar
    const filteredDetails = sizeItems.value.filter((item) => (item.qty || 0) > 0);
    const filteredAdditionalCosts = additionalCostItems.value.filter(
      (item) => item.tambahan && item.tambahan.trim() && (item.harga || 0) > 0
    );

    const payload = {
      header: header.value,
      details: filteredDetails,
      bordirItems: bordirItems.value,
      dtfItems: dtfItems.value,
      additionalCostItems: filteredAdditionalCosts,
      footer: footer.value,
      user: authStore.user,
      isNew: !isEditMode.value,
      // Tambahkan data yang hilang
      biayaPerCmBordir: biayaPerCmBordir.value,
      bordirMinCharge: bordirMinCharge.value,
      bordirCost: bordirCost.value,
      biayaPerCmDtf: biayaPerCmDtf.value,
      dtfMinCharge: dtfMinCharge.value,
      dtfCost: dtfCost.value,
    };

    // 1. Simpan data utama
    const response = await api.post("/price-proposal-form/save", payload);
    markAsSaved();

    const savedNomor = isEditMode.value ? header.value.nomor : response.data.nomor;

    // 2. Jika ada file, unggah sekarang menggunakan nomor yang sudah pasti ada
    if (selectedFile.value && savedNomor) {
      const formData = new FormData();
      formData.append("image", selectedFile.value);
      try {
        // Upload ke endpoint yang menyertakan nomor di URL
        await api.post(`/price-proposal-form/upload-image/${savedNomor}`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        toast.info("Gambar berhasil diunggah.");
      } catch (uploadError: unknown) {
        const err = uploadError as AxiosError;

        console.error("Upload Error:", err);
        console.error("Upload Error Response:", err.response?.data);

        toast.warning("Data berhasil disimpan, tapi gambar gagal diunggah.");
      }
    }

    toast.success(response.data.message);
    router.push("/transaksi/penjualan/pengajuan/pengajuan-harga");
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;

    console.error("Save Error:", err);
    console.error("Save Error Response:", err.response?.data);

    toast.error(err.response?.data?.message || "Gagal menyimpan data pengajuan.");
  } finally {
    isSaving.value = false;
  }
};

const resetForm = () => {
  // Reset header
  header.value = {
    nomor: "",
    tanggal: new Date().toISOString().substr(0, 10),
    approval: "",
    isApproved: false,
    customerKode: "",
    customerNama: "",
    keterangan: "",
    jenisKaos: "",
    ketersediaan: "Custom",
  };

  // Reset size items
  sizeItems.value = [];
  additionalCostItems.value = [];
  imagePreview.value = null;
  selectedFile.value = null;

  // Reset footer
  footer.value = {
    hargaBruto: 0,
    diskon: 0,
    hargaNetto: 0,
  };

  // Reset Bordir & DTF
  bordirItems.value = Array.from({ length: 8 }, () => ({ p: 0, l: 0 }));
  dtfItems.value = Array.from({ length: 8 }, () => ({ p: 0, l: 0 }));
  biayaPerCmBordir.value = 0;
  bordirMinCharge.value = 3000;
  bordirCost.value = 0;
  biayaPerCmDtf.value = 0;
  dtfMinCharge.value = 3000;
  dtfCost.value = 0;

  activeTab.value = "pengajuan";
};

const confirmCancel = () => {
  isCancelConfirmVisible.value = true;
};

const executeCancel = () => {
  isCancelConfirmVisible.value = false;
  resetForm(); // Panggil fungsi resetForm yang sudah ada
};

const calculateTotals = async () => {
  // 1. Hitung total biaya tambahan (Bordir, DTF, dan dari tabel)
  const totalAdditionalCostsFromTable = additionalCostItems.value.reduce(
    (sum, item) => sum + (item.harga || 0),
    0
  );

  // Total tambahan = bordir + dtf + tambahan manual
  const totalAdditionalCost =
    (bordirCost.value || 0) + (dtfCost.value || 0) + totalAdditionalCostsFromTable;

  // 2. Hitung total harga kaos dan total bruto
  let brutoTotal = 0;
  sizeItems.value.forEach((item) => {
    const hargaDasar = item.hargaPcs || 0;
    const qty = item.qty || 0;

    // Harga kaos = harga dasar per pcs + total biaya tambahan
    const hargaKaos = hargaDasar + totalAdditionalCost;
    item.hargaKaos = hargaKaos; // Simpan untuk ditampilkan jika perlu

    // Total per baris = harga kaos * qty
    item.totalHarga = hargaKaos * qty;

    brutoTotal += item.totalHarga;
  });

  footer.value.hargaBruto = brutoTotal;

  // 3. Ambil diskon dari backend
  try {
    const response = await api.get("/price-proposal-form/get-discount", {
      params: { bruto: brutoTotal },
    });
    footer.value.diskon = response.data.diskonRp || 0;
  } catch (error) {
    console.error("Gagal mengambil diskon:", error);
    footer.value.diskon = 0; // Reset diskon jika gagal
  }

  // 4. Hitung harga netto
  footer.value.hargaNetto = footer.value.hargaBruto - footer.value.diskon;
};

const openProductSearch = (index: number) => {
  if (!header.value.jenisKaos) {
    toast.error("Pilih 'Jenis Kaos' terlebih dahulu.");
    return;
  }
  activeItemIndexForProductSearch.value = index;
  isProductVariantSearchVisible.value = true;
};

const onProductVariantSelected = (product: { Kode: string; Nama: string }) => {
  isProductVariantSearchVisible.value = false;
  selectedProductForUpdate.value = product; // Simpan produk yang dipilih
  isUpdateAllConfirmVisible.value = true; // Buka dialog konfirmasi
};

const handleUpdateAllConfirm = (updateAll: boolean) => {
  isUpdateAllConfirmVisible.value = false; // Tutup dialog
  const product = selectedProductForUpdate.value;
  if (!product) return;

  if (updateAll) {
    // Jika "Yes", update semua baris
    sizeItems.value.forEach((item) => {
      if (item.qty !== null && item.qty > 0) {
        // Hanya update baris yang ada Qty
        item.kodeBarang = product.Kode;
        item.namaBarang = product.Nama;
      }
    });
  } else {
    // Jika "No", update hanya baris yang aktif
    const activeItem = sizeItems.value[activeItemIndexForProductSearch.value];
    if (activeItem) {
      activeItem.kodeBarang = product.Kode;
      activeItem.namaBarang = product.Nama;
    }
  }
  selectedProductForUpdate.value = null; // Reset
};

const addAdditionalCostRow = () => {
  additionalCostItems.value.push({
    id: Date.now(),
    tambahan: "",
    harga: 0,
  });
};

const removeAdditionalCostRow = (id: number) => {
  additionalCostItems.value = additionalCostItems.value.filter((item) => item.id !== id);
};

const openAdditionalCostSearch = (index: number) => {
  // Meniru logic Delphi: hanya buka jika harga masih 0
  if (additionalCostItems.value[index]?.harga === 0) {
    activeAdditionalCostIndex.value = index;
    isAdditionalCostSearchVisible.value = true;
  }
};

const onAdditionalCostSelected = (cost: { tambahan: string; harga: number }) => {
  isAdditionalCostSearchVisible.value = false;

  // Cek duplikat (meniru logic Delphi)
  const isDuplicate = additionalCostItems.value.some(
    (item, index) => item.tambahan === cost.tambahan && index !== activeAdditionalCostIndex.value
  );

  if (isDuplicate) {
    toast.warning(`Harga tambahan "${cost.tambahan}" sudah diinput.`);
    return;
  }

  // Update baris yang aktif
  const activeItem = additionalCostItems.value[activeAdditionalCostIndex.value];
  if (activeItem) {
    activeItem.tambahan = cost.tambahan;
    activeItem.harga = cost.harga;
  }
};

const applyBordirCost = () => {
  let finalCost = totalHargaBordir.value;
  // Terapkan biaya minimum jika ada
  if (finalCost > 0 && finalCost < bordirMinCharge.value) {
    finalCost = bordirMinCharge.value;
  }

  // Set nilai ke `bordirCost` yang digunakan di fungsi Hitung utama
  bordirCost.value = finalCost;
  toast.success(`Biaya Bordir sebesar ${formatRupiah(finalCost)} diterapkan.`);

  // Pindah kembali ke tab utama
  activeTab.value = "pengajuan";
};

const applyDtfCost = () => {
  let finalCost = totalHargaDtf.value;
  // Terapkan biaya minimum jika ada
  if (finalCost > 0 && finalCost < dtfMinCharge.value) {
    finalCost = dtfMinCharge.value;
  }

  // Set nilai ke `dtfCost` yang digunakan di fungsi Hitung utama
  dtfCost.value = finalCost;
  toast.success(`Biaya DTF sebesar ${formatRupiah(finalCost)} diterapkan.`);

  // Pindah kembali ke tab utama
  activeTab.value = "pengajuan";
};

const loadOfferData = async (nomor: string) => {
  isLoadingData.value = true;
  try {
    const response = await api.get(`/price-proposal-form/${nomor}`);
    const data = response.data;

    // --- Isi state Header ---
    header.value.nomor = data.header.ph_nomor;
    header.value.tanggal = format(new Date(data.header.ph_tanggal), "yyyy-MM-dd");
    header.value.customerKode = data.header.ph_kd_cus;
    header.value.customerNama = data.header.cus_nama; // ← karena cus_nama sudah ada di query join
    header.value.keterangan = data.header.ph_ket;
    header.value.jenisKaos = data.header.ph_jenis;
    header.value.ketersediaan = data.header.ph_custom === "Y" ? "Custom" : "Stok";
    header.value.approval = data.header.ph_apv;
    header.value.isApproved = !!data.header.ph_apv;

    // --- Isi state Bordir, DTF, dan Biaya Tambahan ---
    if (data.bordir) {
      bordirCost.value = data.bordir.phb_rpbordir || 0;
      biayaPerCmBordir.value = data.bordir.phb_cmbordir || 0;
      for (let i = 1; i <= 8; i++) {
        bordirItems.value[i - 1].p = data.bordir[`phb_bordirp${i}`] || 0;
        bordirItems.value[i - 1].l = data.bordir[`phb_bordirl${i}`] || 0;
      }
    }

    if (data.dtf) {
      dtfCost.value = data.dtf.phd_rpdtf || 0;
      biayaPerCmDtf.value = data.dtf.phd_cmdtf || 0;
      for (let i = 1; i <= 8; i++) {
        dtfItems.value[i - 1].p = data.dtf[`phd_dtfp${i}`] || 0;
        dtfItems.value[i - 1].l = data.dtf[`phd_dtfl${i}`] || 0;
      }
    }

    additionalCostItems.value = ((data.additionalCosts as AdditionalCostResponse[]) || []).map(
      (c) => ({
        id: Date.now() + Math.random(),
        tambahan: c.pht_jenis,
        harga: c.pht_harga,
      })
    );

    // --- Logika Pengisian Tabel Ukuran ---
    if (header.value.jenisKaos) {
      // Ambil template size dari API sesuai jenis kaos dan custom/stok
      const templateSizesResponse = await api.get("/price-proposal-form/tshirt-type-details", {
        params: {
          jenisKaos: header.value.jenisKaos,
          custom: header.value.ketersediaan === "Custom" ? "Y" : "N",
        },
      });

      let templateSizes = templateSizesResponse.data.sizes || [];

      if (templateSizes && !Array.isArray(templateSizes)) {
        templateSizes = [templateSizes];
      }

      // Buat array sizeItems dari template sizes
      const allSizeItems = templateSizes.map((template: TemplateSize) => ({
        id: Date.now() + Math.random(),
        size: template.ukuran ?? "",
        qty: 0, // default
        hargaPcs: template.hargaPcs || 0,
        hargaKaos: template.hargaPcs || 0,
        totalHarga: 0,
        kodeBarang: "",
        namaBarang: "",
      }));

      // Update dengan data yang sudah tersimpan dari backend
      (data.sizes || []).forEach((savedItem: SavedSize) => {
        const itemToUpdate = allSizeItems.find((i: SizeItem) => i.size === savedItem.phs_size);
        if (itemToUpdate) {
          itemToUpdate.qty = savedItem.phs_jumlah;
          itemToUpdate.hargaPcs = savedItem.phs_harga;
          itemToUpdate.isManualPrice = savedItem.phs_harga === 0;
          itemToUpdate.kodeBarang = savedItem.phs_kode;
          itemToUpdate.namaBarang = savedItem.nama_barang || "";
          itemToUpdate.hargaKaos = savedItem.phs_harga; // harga dasar
          itemToUpdate.totalHarga = savedItem.phs_jumlah * savedItem.phs_harga;
        }
      });

      sizeItems.value = allSizeItems;
    } else {
      // fallback kalau jenisKaos kosong
      sizeItems.value = (data.sizes || []).map((s: SavedSize) => ({
        id: Date.now() + Math.random(),
        size: s.phs_size,
        qty: s.phs_jumlah,
        hargaPcs: s.phs_harga,
        kodeBarang: s.phs_kode,
        namaBarang: s.nama_barang || "",
        hargaKaos: s.phs_harga,
        totalHarga: s.phs_jumlah * s.phs_harga,
      }));
    }

    imagePreview.value = data.imageUrl;

    await nextTick();
    calculateTotals();

    toast.success(`Data untuk ${nomor} berhasil dimuat.`);

    markAsSaved();
  } catch (error) {
    toast.error("Gagal memuat data pengajuan untuk diedit.");
    console.error("Load Offer Error:", error);
    router.push("/transaksi/penjualan/pengajuan/pengajuan-harga");
  } finally {
    isLoadingData.value = false; // <--- Tambahkan di sini
  }
};

const showConfirmation = (action: () => void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
};

const executePendingAction = () => {
  if (pendingAction.value) {
    pendingAction.value();
  }
  isConfirmDialogVisible.value = false;
};

const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
  pendingAction.value = null;
};

const closeForm = () => {
  router.push("/transaksi/penjualan/pengajuan/pengajuan-harga");
};

watch(
  () => header.value.isApproved,
  (isNowApproved) => {
    // 1. Cek Hak Akses (Role Finance/Direksi)
    if (!authStore.user?.canApprovePrice) {
      if (isNowApproved && !header.value.approval) {
        toast.error("Anda tidak memiliki hak untuk melakukan approval.");
        nextTick(() => {
          header.value.isApproved = false; // Reset centang di UI
        });
      }
      return;
    }

    // 2. Logika untuk user yang MEMILIKI hak approval
    if (isNowApproved) {
      // (Validasi Gambar SUDAH DIHAPUS DARI SINI)

      // Hanya isi nama approver jika sebelumnya masih kosong
      if (!header.value.approval) {
        header.value.approval = authStore.user?.kode || "UNKNOWN";
      }
    } else {
      header.value.approval = "";
    }
  }
);

watch(
  [() => sizeItems.value.map((i) => i.qty), bordirCost, dtfCost, additionalCostItems],
  calculateTotals,
  { deep: true }
);

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [header, sizeItems, additionalCostItems, footer, bordirItems, dtfItems],
  () => {
    // Abaikan jika sedang loading awal atau saving
    if (isSaving.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Customer atau Jenis Kaos dipilih
    const hasHeader = header.value.customerKode !== "" || header.value.jenisKaos !== "";

    // 2. Items: Ada item yang qty-nya > 0
    const hasItems = sizeItems.value.some((i) => (i.qty || 0) > 0);

    // 3. Biaya Tambahan: Ada input biaya tambahan
    const hasAdditional = additionalCostItems.value.length > 0;

    if (hasHeader || hasItems || hasAdditional) {
      uiStore.setUnsavedChanges(true);
    } else {
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

// Watcher untuk merespon perubahan mode Stok / Custom
watch(
  () => header.value.ketersediaan,
  async (newVal) => {
    // Jangan jalankan jika jenis kaos belum dipilih atau sedang memuat data edit
    if (!header.value.jenisKaos || isLoadingData.value) return;

    try {
      const response = await api.get<TshirtTypeResponse>(
        "/price-proposal-form/tshirt-type-details",
        {
          params: {
            jenisKaos: header.value.jenisKaos,
            custom: newVal === "Custom" ? "Y" : "N",
          },
        }
      );

      const data = response.data;
      if (data && Array.isArray(data.sizes)) {
        // Perbarui harga, tapi pertahankan Qty, Kode Barang, dan Nama Barang yang sudah diisi
        sizeItems.value = data.sizes.map((item) => {
          const existing = sizeItems.value.find((i) => i.size === item.ukuran);
          return {
            id: existing?.id || Date.now() + Math.random(),
            size: item.ukuran ?? "",
            ukuran: item.ukuran,
            qty: existing?.qty || null, // Pertahankan Qty sebelumnya
            hargaPcs: item.hargaPcs,
            isManualPrice: item.hargaPcs === 0,
            totalHarga: 0,
            hargaKaos: 0,
            kodeBarang: existing?.kodeBarang || "", // Pertahankan warna
            namaBarang: existing?.namaBarang || "", // Pertahankan warna
          };
        });

        // Perbarui standar biaya Bordir & DTF jika ada
        const costs = data.costs;
        if (costs) {
          biayaPerCmBordir.value = costs.bordir?.cm || 0;
          bordirMinCharge.value = costs.bordir?.min || 0;
          biayaPerCmDtf.value = costs.dtf?.cm || 0;
          dtfMinCharge.value = costs.dtf?.min || 0;
        }

        calculateTotals();
        toast.success(`Harga otomatis disesuaikan untuk mode ${newVal}.`);
      }
    } catch (error) {
      toast.error("Gagal menyesuaikan harga.");
      console.error("Error updating ketersediaan prices:", error);
    }
  }
);

onMounted(() => {
  markAsSaved();
  // Cek otorisasi terlebih dahulu
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(
      `Anda tidak memiliki izin untuk ${
        requiredPermission.value === "insert" ? "membuat" : "mengubah"
      } data.`
    );
    router.push("/transaksi/penjualan/pengajuan/pengajuan-harga"); // "Tendang" kembali ke halaman daftar
    return; // Hentikan eksekusi lebih lanjut
  }

  // Jika diizinkan, lanjutkan logika yang sudah ada
  if (isEditMode.value) {
    loadOfferData(route.params.nomor as string);
  } else {
    // Logika untuk form baru (misalnya getNextNumber)
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-cash-plus">
    <template #header-actions>
      <v-btn
        size="small"
        color="primary"
        prepend-icon="mdi-content-save"
        @click="save"
        :loading="isSaving"
        >Simpan</v-btn
      >
      <v-btn size="small" prepend-icon="mdi-cancel" @click="confirmCancel">Batal</v-btn>
      <v-btn
        size="small"
        prepend-icon="mdi-close"
        @click="
          showConfirmation(
            closeForm,
            'Anda yakin ingin menutup form? Perubahan yang belum disimpan akan hilang.'
          )
        "
      >
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container">
      <!-- Kolom Kiri -->
      <div class="left-column">
        <div class="desktop-form-section">
          <div class="header-grid">
            <div class="grid-item-nomor">
              <v-text-field
                label="Nomor"
                v-model="header.nomor"
                readonly
                variant="filled"
                density="compact"
                hide-details
              ></v-text-field>
            </div>
            <div class="grid-item-tanggal">
              <v-text-field
                label="Tanggal"
                v-model="header.tanggal"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field>
            </div>
            <div class="grid-item-approval">
              <v-checkbox
                v-model="header.isApproved"
                :label="`Approval: ${header.approval}`"
                :disabled="!authStore.user?.canApprovePrice"
                density="compact"
                hide-details
              ></v-checkbox>
            </div>
            <div class="grid-item-upload">
              <v-file-input
                label="Upload Gambar"
                @change="onFileChange"
                accept="image/jpeg, image/png"
                variant="outlined"
                density="compact"
                hide-details
                prepend-icon="mdi-upload"
              ></v-file-input>
            </div>
            <div class="grid-item-customer">
              <v-text-field
                label="Customer"
                v-model="header.customerKode"
                readonly
                placeholder="Tekan F1 atau Klik Cari..."
                @keydown.f1.prevent="openCustomerSearch"
                @click="openCustomerSearch"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                @click:append-inner="openCustomerSearch"
              ></v-text-field>
            </div>
            <div class="grid-item-customer-nama">
              <v-text-field
                :model-value="header.customerNama"
                readonly
                variant="filled"
                density="compact"
                hide-details
              ></v-text-field>
            </div>
            <div class="grid-item-keterangan">
              <v-text-field
                label="Keterangan"
                v-model="header.keterangan"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field>
            </div>
            <div class="grid-item-radio">
              <v-radio-group v-model="header.ketersediaan" inline hide-details density="compact"
                ><v-radio label="Stok" value="Stok"></v-radio
                ><v-radio label="Custom" value="Custom"></v-radio
              ></v-radio-group>
            </div>
            <div class="grid-item-jenis-kaos">
              <v-text-field
                label="Jenis Kaos"
                v-model="header.jenisKaos"
                readonly
                placeholder="Tekan F1 atau klik..."
                @click="openTshirtTypeSearch"
                @keydown.f1.prevent="openTshirtTypeSearch"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                @click:append-inner="openTshirtTypeSearch"
              ></v-text-field>
            </div>
          </div>
        </div>
        <div class="desktop-form-section footer-section">
          <v-row dense>
            <v-col md="12">
              <v-text-field
                label="Harga Bruto"
                :model-value="formatRupiah(footer.hargaBruto)"
                readonly
                variant="filled"
                density="compact"
                hide-details
                class="summary-field"
              ></v-text-field>
              <v-text-field
                label="Diskon"
                :model-value="formatRupiah(footer.diskon)"
                readonly
                variant="filled"
                density="compact"
                hide-details
                class="summary-field"
              ></v-text-field>
              <v-text-field
                label="Harga Netto"
                :model-value="formatRupiah(footer.hargaNetto)"
                readonly
                variant="filled"
                density="compact"
                hide-details
                class="font-weight-bold summary-field"
              ></v-text-field>
            </v-col>
            <v-col md="8" class="d-flex align-center">
              <div class="text-caption text-medium-emphasis pa-2">
                <p class="font-weight-bold">Note:</p>
                <p>Harga Kaos = Harga/Pcs + Total Harga Tambahan.</p>
                <p>Total Harga = Qty Order x Harga Kaos.</p>
                <p class="mt-2 font-weight-bold">Diskon:</p>
                <p>
                  - Jika Harga Netto >= 3 juta dan Harga Netto kurang dari 6 juta=5% dari Harga
                  Netto.
                </p>
                <p>- Jika Harga Netto >= 6 juta = 10% dari Harga Netto.</p>
              </div>
            </v-col>
          </v-row>
        </div>
      </div>

      <!-- Kolom Kanan -->
      <div class="desktop-form-section right-column">
        <v-tabs v-model="activeTab" density="compact" class="tabs-header">
          <v-tab value="pengajuan">Pengajuan Harga</v-tab>
          <v-tab value="bordir">Bordir</v-tab>
          <v-tab value="dtf">DTF</v-tab>
          <v-tab value="gambar">Lihat Gambar</v-tab>
        </v-tabs>
        <v-window v-model="activeTab" class="flex-grow-1">
          <v-window-item value="pengajuan" class="window-item">
            <div class="d-flex fill-height">
              <!-- Tabel utama -->
              <div class="main-table-container">
                <v-data-table
                  :items="sizeItems"
                  :headers="[
                    { title: 'Size', key: 'size' },
                    { title: 'Qty Order', key: 'qty' },
                    { title: 'Harga/Pcs', key: 'hargaPcs', align: 'end' },
                    { title: 'Harga Kaos', key: 'hargaKaos', align: 'end' },
                    { title: 'Total Harga', key: 'totalHarga', align: 'end' },
                    { title: 'Kode Barang', key: 'kodeBarang' },
                    { title: 'Nama Barang', key: 'namaBarang' },
                  ]"
                  no-data-text="Pilih Jenis Kaos untuk menampilkan data"
                  density="compact"
                  class="desktop-table"
                  fixed-header
                  height="calc(100vh - 280px)"
                >
                  <template #[`item.qty`]="{ item }">
                    <v-text-field
                      v-model.number="item.qty"
                      type="number"
                      variant="underlined"
                      density="compact"
                      hide-details
                    ></v-text-field>
                  </template>

                  <template #[`item.hargaKaos`]="{ item }">
                    {{ formatRupiah(item.hargaKaos || 0) }}
                  </template>

                  <template #[`item.hargaPcs`]="{ item }">
                    <v-text-field
                      v-model.number="item.hargaPcs"
                      type="number"
                      variant="underlined"
                      density="compact"
                      hide-details
                      class="text-end"
                      :readonly="item.hargaPcs > 0 && !item.isManualPrice"
                      :placeholder="formatRupiah(0)"
                      @update:model-value="calculateTotals"
                    ></v-text-field>
                  </template>

                  <template #[`item.kodeBarang`]="{ item }">
                    <v-text-field
                      v-model="item.kodeBarang"
                      variant="underlined"
                      density="compact"
                      hide-details
                      placeholder="F1..."
                      :class="{ 'bg-red-lighten-5': (item.qty ?? 0) > 0 && !item.kodeBarang }"
                      @keydown.f1.prevent="openProductSearch(sizeItems.indexOf(item))"
                    >
                    </v-text-field>
                  </template>
                </v-data-table>
              </div>
              <!-- Side tabel -->
              <div class="side-table-container">
                <div
                  class="pa-2 font-weight-medium text-caption d-flex justify-space-between align-center"
                >
                  <span>Harga Tambahan</span>
                  <v-btn
                    @click="addAdditionalCostRow"
                    size="x-small"
                    variant="tonal"
                    prepend-icon="mdi-plus"
                    >Tambah</v-btn
                  >
                </div>
                <v-divider></v-divider>
                <div class="pa-2">
                  <v-text-field
                    label="Bordir/cm2"
                    v-model.number="bordirCost"
                    type="number"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mb-2"
                  ></v-text-field>
                  <v-text-field
                    label="DTF/cm2"
                    v-model.number="dtfCost"
                    type="number"
                    variant="outlined"
                    density="compact"
                    hide-details
                  ></v-text-field>
                </div>
                <v-divider></v-divider>
                <v-data-table
                  :items="additionalCostItems"
                  :headers="[
                    { title: 'Keterangan', key: 'tambahan' },
                    { title: 'Harga', key: 'harga' },
                    { title: '', key: 'actions', sortable: false, width: '40px', align: 'center' },
                  ]"
                  density="compact"
                  class="desktop-table flex-grow-1"
                  fixed-header
                  height="100%"
                  hide-default-footer
                >
                  <template #[`item.tambahan`]="{ item }">
                    <v-text-field
                      v-model="item.tambahan"
                      variant="underlined"
                      density="compact"
                      hide-details
                      placeholder="F1..."
                      readonly
                      @keydown.f1.prevent="
                        openAdditionalCostSearch(additionalCostItems.indexOf(item))
                      "
                      @click="openAdditionalCostSearch(additionalCostItems.indexOf(item))"
                      style="cursor: pointer"
                    ></v-text-field>
                  </template>

                  <template #[`item.harga`]="{ item }">
                    <span class="text-caption">
                      {{ formatRupiah(item.harga || 0) }}
                    </span>
                  </template>

                  <template #[`item.actions`]="{ item }">
                    <v-btn
                      v-if="authStore.user?.canApprovePrice"
                      icon="mdi-delete"
                      size="x-small"
                      variant="text"
                      color="error"
                      @click="removeAdditionalCostRow(item.id)"
                      title="Hapus Tambahan"
                    ></v-btn>
                  </template>
                </v-data-table>
                <div class="total-footer">
                  <v-text-field
                    label="Total Harga Tambahan"
                    :model-value="formatRupiah(totalHargaTambahan)"
                    readonly
                    variant="filled"
                    density="compact"
                    hide-details
                    class="text-right"
                  ></v-text-field>
                </div>
              </div>
            </div>
          </v-window-item>
          <v-window-item value="bordir" class="window-item">
            <div class="calculation-grid">
              <div class="input-column">
                <template v-for="(item, index) in bordirItems.slice(0, 4)" :key="index">
                  <div class="label-cell">Bordir {{ index + 1 }}</div>
                  <div>
                    <v-text-field
                      v-model.number="item.p"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                    ></v-text-field>
                  </div>
                  <div>
                    <v-text-field
                      v-model.number="item.l"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                    ></v-text-field>
                  </div>
                  <div class="result-cell">{{ (item.p || 0) * (item.l || 0) }}</div>
                </template>
              </div>
              <div class="input-column">
                <template v-for="(item, index) in bordirItems.slice(4, 8)" :key="index">
                  <div class="label-cell">Bordir {{ index + 5 }}</div>
                  <div>
                    <v-text-field
                      v-model.number="item.p"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                    ></v-text-field>
                  </div>
                  <div>
                    <v-text-field
                      v-model.number="item.l"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                    ></v-text-field>
                  </div>
                  <div class="result-cell">{{ (item.p || 0) * (item.l || 0) }}</div>
                </template>
              </div>
              <div class="summary-section">
                <v-row dense>
                  <v-col cols="8">
                    <v-alert density="compact" variant="tonal" class="text-caption h-100">
                      Note: Biaya akan diterapkan ke tab "Pengajuan Harga".
                    </v-alert>
                  </v-col>
                  <v-col cols="4">
                    <v-text-field
                      label="Luas Bordir /Cm2"
                      :model-value="totalLuasBordir"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                    ></v-text-field>
                    <v-text-field
                      label="Biaya /Cm2"
                      v-model.number="biayaPerCmBordir"
                      type="number"
                      density="compact"
                      variant="filled"
                      readonly
                      hide-details
                    ></v-text-field>
                    <v-text-field
                      label="Total Harga"
                      :model-value="formatRupiah(totalHargaBordir)"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                      class="font-weight-bold"
                    ></v-text-field>
                  </v-col>
                </v-row>
              </div>
              <div class="button-section">
                <v-btn size="small" color="primary" @click="applyBordirCost">OK</v-btn>
              </div>
            </div>
          </v-window-item>
          <v-window-item value="dtf" class="window-item">
            <div class="calculation-grid">
              <div class="input-column">
                <template v-for="(item, index) in dtfItems.slice(0, 4)" :key="index">
                  <div class="label-cell">DTF {{ index + 1 }}</div>
                  <div>
                    <v-text-field
                      v-model.number="item.p"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                    ></v-text-field>
                  </div>
                  <div>
                    <v-text-field
                      v-model.number="item.l"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                    ></v-text-field>
                  </div>
                  <div class="result-cell">{{ (item.p || 0) * (item.l || 0) }}</div>
                </template>
              </div>
              <div class="input-column">
                <template v-for="(item, index) in dtfItems.slice(4, 8)" :key="index">
                  <div class="label-cell">DTF {{ index + 5 }}</div>
                  <div>
                    <v-text-field
                      v-model.number="item.p"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                    ></v-text-field>
                  </div>
                  <div>
                    <v-text-field
                      v-model.number="item.l"
                      type="number"
                      density="compact"
                      variant="outlined"
                      hide-details
                    ></v-text-field>
                  </div>
                  <div class="result-cell">{{ (item.p || 0) * (item.l || 0) }}</div>
                </template>
              </div>
              <div class="summary-section">
                <v-row dense>
                  <v-col cols="8">
                    <v-alert density="compact" variant="tonal" class="text-caption h-100">
                      Note: Biaya akan diterapkan ke tab "Pengajuan Harga".
                    </v-alert>
                  </v-col>
                  <v-col cols="4">
                    <v-text-field
                      label="Luas DTF /Cm2"
                      :model-value="totalLuasDtf"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                    ></v-text-field>
                    <v-text-field
                      label="Biaya /Cm2"
                      v-model.number="biayaPerCmDtf"
                      type="number"
                      density="compact"
                      variant="filled"
                      readonly
                      hide-details
                    ></v-text-field>
                    <v-text-field
                      label="Total Harga"
                      :model-value="formatRupiah(totalHargaDtf)"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                      class="font-weight-bold"
                    ></v-text-field>
                  </v-col>
                </v-row>
              </div>
              <div class="button-section">
                <v-btn size="small" color="primary" @click="applyDtfCost">OK</v-btn>
              </div>
            </div>
          </v-window-item>
          <v-window-item value="gambar" class="window-item">
            <div class="image-preview-container">
              <v-img :src="imagePreview" v-if="imagePreview" contain class="preview-image"></v-img>
              <div v-else class="state-container">
                <v-icon size="64" class="mb-4">mdi-image-off-outline</v-icon>
                <h3 class="text-h6">Tidak Ada Gambar</h3>
                <p class="body-1 mt-2">Silakan unggah gambar di form header.</p>
              </div>
            </div>
          </v-window-item>
        </v-window>
      </div>
    </div>

    <!-- Modals -->
    <CustomerSearchModal
      v-if="isCustomerSearchVisible"
      :gudang="authStore.user?.cabang || ''"
      @close="isCustomerSearchVisible = false"
      @customer-selected="onCustomerSelected"
    />
    <TshirtTypeSearchModal
      v-if="isTshirtTypeSearchVisible"
      :custom-type="header.ketersediaan === 'Custom' ? 'Y' : 'N'"
      @close="isTshirtTypeSearchVisible = false"
      @type-selected="onTshirtTypeSelected"
    />
    <ProductVariantSearchModal
      v-if="isProductVariantSearchVisible"
      :jenis-kaos="header.jenisKaos"
      @close="isProductVariantSearchVisible = false"
      @product-selected="onProductVariantSelected"
    />
    <AdditionalCostSearchModal
      v-if="isAdditionalCostSearchVisible"
      @close="isAdditionalCostSearchVisible = false"
      @cost-selected="onAdditionalCostSelected"
    />

    <v-dialog v-model="isUpdateAllConfirmVisible" max-width="500px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-medium">
          <v-icon color="primary" class="me-2">mdi-help-circle-outline</v-icon>
          Konfirmasi Update
        </v-card-title>
        <v-card-text class="pb-0">
          Anda memilih kode barang: <strong>{{ selectedProductForUpdate?.Kode }}</strong
          >.
          <br />
          Apakah Anda ingin menerapkan kode barang ini ke semua baris yang memiliki Qty?
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn @click="handleUpdateAllConfirm(false)">Hanya Baris Ini</v-btn>
          <v-btn color="primary" variant="elevated" @click="handleUpdateAllConfirm(true)"
            >Ya, Update Semua</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isSaveConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6">Konfirmasi Simpan</v-card-title>
        <v-card-text>Apakah Anda yakin ingin menyimpan data pengajuan ini?</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="isSaveConfirmVisible = false">Tidak</v-btn>
          <v-btn color="primary" variant="elevated" @click="executeSave">Ya, Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isCancelConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6">Konfirmasi Batal</v-card-title>
        <v-card-text
          >Semua data yang belum disimpan akan hilang. Apakah Anda yakin ingin
          membatalkan?</v-card-text
        >
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="isCancelConfirmVisible = false">Tidak</v-btn>
          <v-btn color="primary" variant="elevated" @click="executeCancel">Ya, Batal</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold"> Konfirmasi </v-card-title>
        <v-card-text>
          {{ confirmText }}
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog"> Tidak </v-btn>
          <v-btn color="primary" variant="tonal" @click="executePendingAction">
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.left-column .desktop-form-section:not(.footer-section),
.left-column .desktop-form-section.footer-section,
.right-column.desktop-form-section {
  background-color: rgb(var(--v-theme-surface));
  padding: 16px;
  border-radius: 8px;
}

/* Kurangi gap di header-grid */
.header-grid {
  gap: 4px 8px !important;
}

/* Pastikan semua v-field tetap putih dengan rounded corner */
.desktop-form-section :deep(.v-field) {
  background-color: rgb(var(--v-theme-surface));
  border-radius: 4px;
}

.desktop-form-section:deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface));
}

.desktop-form-section .v-field--variant-outlined {
  background-color: white !important;
  border-radius: 4px !important;
}

/* Hilangkan margin bottom pada v-input */
.desktop-form-section .v-input {
  margin-bottom: 0 !important;
}

/* Kurangi padding pada v-row di footer section */
.footer-section .v-row {
  margin: -4px !important;
}

.footer-section .v-col {
  padding: 4px !important;
}

.footer-section {
  margin-top: auto;
  /* Mendorong footer ke bawah kolom kiri */
}

.detail-section {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.desktop-table {
  font-size: 11px !important;
  text-align: right;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding: 0 8px !important;
  height: 28px !important;
}

.desktop-table :deep(input) {
  font-size: 11px !important;
  /* Samakan dengan font-size .desktop-table */
}

.tabs-header {
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.window-item {
  height: 100%;
}

.header-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  align-items: center;
}

.header-grid .grid-item-customer-nama,
.header-grid .grid-item-keterangan,
.header-grid .grid-item-jenis-kaos {
  grid-column: span 2;
}

/* Mengatur font untuk label (Nomor, Tanggal, Customer, dll.) */
.desktop-form-section :deep(.v-label) {
  font-size: 11px !important;
}

/* Mengatur font untuk teks yang diketik di dalam field */
.desktop-form-section :deep(input) {
  font-size: 12px !important;
}

/* Mengatur font untuk label pada radio button */
.desktop-form-section :deep(.v-radio-group .v-label) {
  font-size: 12px !important;
}

.main-table-container {
  width: 75%;
  /* Diperbesar dari 66.66% */
  height: 100%;
  display: flex;
  flex-direction: column;
}

.side-table-container {
  width: 25%;
  /* Diperkecil dari 33.33% */
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.main-table-container .v-data-table,
.side-table-container .v-data-table {
  flex: 1;
  overflow-y: auto;
  /* aktifkan scroll */
}

.image-preview-container {
  padding: 16px;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  background-color: rgb(var(--v-theme-background));
}

.preview-image {
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.state-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.summary-field {
  margin-bottom: 4px;
}

.total-footer {
  flex-shrink: 0;
  padding: 4px;
  border-top: 1px solid #e0e0e0;
  background-color: #f5f5f5;
}

.calculation-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* Dua kolom utama */
  grid-template-rows: auto 1fr auto;
  /* Baris untuk input, summary, dan tombol */
  gap: 16px 24px;
  padding: 16px;
  font-size: 12px;
  height: 100%;
}

.input-column {
  display: grid;
  grid-template-columns: 60px 1fr 1fr 1fr;
  gap: 8px 12px;
  align-items: center;
}

.input-column:first-child {
  grid-area: 1 / 1;
}

.input-column:nth-child(2) {
  grid-area: 1 / 2;
}

.header-cell {
  font-size: 11px;
  color: #555;
}

.label-cell {
  text-align: right;
  font-weight: 500;
}

.result-cell {
  text-align: right;
  font-weight: bold;
  font-family: monospace;
  padding: 4px 8px;
  background-color: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  color: rgb(var(--v-theme-on-surface));
  border-radius: 4px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.summary-section {
  grid-column: 1 / 3;
  /* Membentang di kedua kolom */
  grid-row: 2;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.summary-section .v-text-field {
  margin-bottom: 8px;
}

/* Bagian tombol di paling bawah */
.button-section {
  grid-column: 1 / 3;
  /* Membentang di kedua kolom */
  grid-row: 3;
  text-align: center;
}

.image-preview-container {
  padding: 16px;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  /* Memberi latar belakang netral */
}

.preview-image {
  max-width: 100%;
  max-height: 400px;
  /* batasi tinggi maksimal */
  border: 1px solid #e0e0e0;
  background-color: white;
  object-fit: contain;
  /* biar aspect ratio tetap */
}

.state-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.desktop-table :deep(thead tr th) {
  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important;
  /* Supaya lebih rapi */
}

.window-item {
  height: 100%;
  min-height: 0;
  /* WAJIB untuk flex child */
}

.main-table-container,
.side-table-container {
  height: 100%;
  min-height: 0;
}
</style>

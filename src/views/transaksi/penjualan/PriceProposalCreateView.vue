<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import TshirtTypeSearchModal from "@/components/lookup/TshirtTypeSearchModal.vue";
import ProductVariantSearchModal from "@/components/lookup/ProductVariantSearchModal.vue";
import AdditionalCostSearchModal from "@/components/lookup/AdditionalCostSearchModal.vue";
import JenisKainSearchModal from "@/components/lookup/JenisKainSearchModal.vue";
import WarnaKainSearchModal from "@/components/lookup/WarnaKainSearchModal.vue";
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
  id?: number;
  ukuran?: string;
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
  defaultKain?: string | null;
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
  phs_kategori?: string;
  nama_barang?: string;
}

interface JenisKainOption {
  nama: string;
  Kode: string;
}

interface WarnaOption {
  nama: string;
}

interface BarangDraft {
  pbd_kode_barang_draft: string;
  pbd_jeniskaos: string;
  pbd_tipe: string;
  pbd_lengan: string;
  pbd_jeniskain: string;
  pbd_warna: string;
  pbd_deskripsi: string;
  pbd_kategori: string;
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
  jenisKain: "",
  warna: "",
  kodeBarangDraft: "",
  kodeBarangDeskripsi: "",
  status: "",
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
const accCustomerChecked = ref(false);
const accCustomerProofFile = ref<File | null>(null);
const accCustomerProofPreview = ref<string | null>(null);
const isConfirmingAccCustomer = ref(false);
const isAccCustomerLocked = computed(
  () => !!header.value.status && header.value.status !== "DRAFT"
);
const isFormLocked = computed(() => {
  if (!header.value.status || header.value.status === "DRAFT") return false;
  if (header.value.status === "ACC_CUSTOMER" && authStore.user?.canApprovePrice) return false;
  return true;
});
const isConfirmingAccFinance = ref(false);
const isAccFinanceLocked = computed(
  () => !!header.value.status && header.value.status !== "ACC_CUSTOMER"
);

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? `Ubah Pengajuan Harga: ${header.value.nomor}` : "Buat Pengajuan Harga"
);
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));
const isCustomMode = computed(() => header.value.ketersediaan === "Custom");
const isStokMode = computed(() => header.value.ketersediaan === "Stok");

const isProductVariantSearchVisible = ref(false);
const activeItemIndexForProductSearch = ref(0);

const isUpdateAllConfirmVisible = ref(false);
const selectedProductForUpdate = ref<{ Kode: string; Nama: string } | null>(null);

const isAdditionalCostSearchVisible = ref(false);
const activeAdditionalCostIndex = ref(0);

const isJenisKainSearchVisible = ref(false);
const isWarnaSearchVisible = ref(false);

const totalHargaTambahan = computed(() => {
  return additionalCostItems.value.reduce((sum, item) => sum + (item.harga || 0), 0);
});

const bordirItems = ref(Array.from({ length: 8 }, () => ({ p: 0, l: 0 })));
// [BARU] Flat rate LAMA (dari tbiayatambahan/DB) — tetap dipertahankan untuk
// dokumen dengan tanggal SEBELUM 1 Agustus 2026, supaya edit dokumen lama
// tidak ikut ketiban tier baru yang salah periode.
const biayaPerCmBordirFlat = ref(0);
const bordirMinCharge = ref(3000);

// [BARU] Total qty order (semua ukuran) — basis penentuan tier harga bordir
// sesuai Memo Internal 1 Agustus 2026.
const totalQty = computed(() => sizeItems.value.reduce((sum, item) => sum + (item.qty || 0), 0));

const isNewBordirRule = computed(() => header.value.tanggal >= "2026-08-01");

// [BARU] Biaya per cm² bordir — computed, bukan ref manual lagi.
// Mulai 1 Agustus 2026: tier berdasar total qty order (Memo Internal).
// Sebelum itu: tetap pakai flat rate dari master data (tbiayatambahan),
// supaya histori transaksi lama tidak berubah nilainya.
const biayaPerCmBordir = computed(() => {
  if (!isNewBordirRule.value) return biayaPerCmBordirFlat.value;

  const qty = totalQty.value;
  if (qty >= 500) return 100;
  if (qty >= 20) return 250;
  if (qty >= 11) return 500;
  return 1000; // 1 - 10 pcs
});

// [BARU] Label tier aktif — buat ditampilin ke SC di tab Bordir biar jelas
// kuantitas berapa lagi kena tarif berapa, tanpa perlu buka memo manual.
const bordirTierLabel = computed(() => {
  if (!isNewBordirRule.value) return null;
  const qty = totalQty.value;
  if (qty >= 500) return "≥ 500 pcs";
  if (qty >= 20) return "20 - 499 pcs";
  if (qty >= 11) return "11 - 19 pcs";
  return "1 - 10 pcs";
});
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
const onAccCustomerFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    if (file.size > 500000) {
      toast.error("Ukuran bukti tidak boleh melebihi 500 KB.");
      return;
    }
    accCustomerProofFile.value = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      accCustomerProofPreview.value = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const confirmAccCustomer = async () => {
  if (!header.value.nomor) {
    toast.error("Simpan Pengajuan Harga terlebih dahulu sebelum Acc Customer.");
    return;
  }

  // [BARU] Khusus Sublim: wajib ada desain eksplisit (upload sendiri ATAU
  // pilih dari katalog) sebelum Acc Customer. Thumbnail default kategori
  // (fallback otomatis) TIDAK dihitung sebagai "sudah ada desain" — itu
  // cuma placeholder visual, bukan pilihan SC yang sebenarnya.
  if (isSublimMode.value) {
    const hasExplicitDesign =
      !!sublimDesignFile.value || !!sublimForm.value.katalogId || !!sublimForm.value.katalogGambar;
    if (!hasExplicitDesign) {
      toast.error(
        "Desain Jersey wajib diisi (upload sendiri atau pilih dari katalog) sebelum Acc Customer."
      );
      return;
    }
  }

  // [BARU] Gambar desain/referensi wajib ada sebelum Acc Customer — form
  // terkunci setelahnya, ini titik terakhir user masih bisa upload.
  if (!selectedFile.value && !imagePreview.value) {
    toast.error("Gambar desain/referensi wajib diunggah sebelum Acc Customer.");
    return;
  }

  if (!accCustomerProofFile.value && !accCustomerProofPreview.value) {
    toast.error("Upload bukti Acc Customer (screenshot) terlebih dahulu.");
    return;
  }
  isConfirmingAccCustomer.value = true;
  try {
    if (accCustomerProofFile.value) {
      const formData = new FormData();
      formData.append("image", accCustomerProofFile.value);
      await api.post(`/price-proposal-form/upload-acc-customer/${header.value.nomor}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    await api.patch(`/price-proposals/${header.value.nomor}/approve-customer`, {});
    header.value.status = "ACC_CUSTOMER";
    accCustomerChecked.value = true;
    toast.success("Pengajuan Harga berhasil di-Acc Customer.");
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal melakukan Acc Customer.");
    accCustomerChecked.value = false;
  } finally {
    isConfirmingAccCustomer.value = false;
  }
};
const confirmAccFinance = async () => {
  if (header.value.status !== "ACC_CUSTOMER") {
    toast.error("Pengajuan Harga harus berstatus Acc Customer dulu.");
    return;
  }
  if (!authStore.user?.canApprovePrice) {
    toast.error("Anda tidak memiliki hak approval Finance.");
    return;
  }

  isConfirmingAccFinance.value = true;
  try {
    const response = await api.patch(`/price-proposals/${header.value.nomor}/approve-finance`, {});
    header.value.status = "ACC_FINANCE";
    if (response.data.finalKode) {
      header.value.kodeBarangDraft = response.data.finalKode;
    }
    toast.success(
      response.data.finalKode
        ? `Acc Finance berhasil. Kode Barang Final: ${response.data.finalKode}`
        : "Acc Finance berhasil."
    );
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal melakukan Acc Finance.");
  } finally {
    isConfirmingAccFinance.value = false;
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

    const costs = data.costs;
    if (costs) {
      if (costs.bordir) {
        biayaPerCmBordirFlat.value = costs.bordir.cm || 0; // [UBAH]
        bordirMinCharge.value = costs.bordir.min || 0;
      }
      if (costs.dtf) {
        biayaPerCmDtf.value = costs.dtf.cm || 0;
        dtfMinCharge.value = costs.dtf.min || 0;
      }
    }

    // [BARU] Auto-fill Jenis Kain dari default yang terpasang di master
    // jenis kaos — berlaku untuk mode Stok maupun Custom (Sublim punya
    // alur kain sendiri di tab Sublim, tidak lewat sini).
    if (data.defaultKain) {
      header.value.jenisKain = data.defaultKain;
    }
  } catch (error) {
    toast.error("Gagal memuat detail harga jenis kaos.");
    console.error("Error onTshirtTypeSelected:", error);
  }
};

// --- [BARU] Jenis Kain & Warna (khusus mode Custom) ---
const openJenisKainSearch = () => {
  isJenisKainSearchVisible.value = true;
};
const onJenisKainSelected = (item: JenisKainOption) => {
  isJenisKainSearchVisible.value = false;
  header.value.jenisKain = item.nama;
};
const openWarnaSearch = () => {
  isWarnaSearchVisible.value = true;
};
const onWarnaSelected = (item: WarnaOption) => {
  isWarnaSearchVisible.value = false;
  header.value.warna = item.nama;
};

const save = () => {
  if (isFormLocked.value) {
    toast.error(
      `Pengajuan Harga dengan status "${header.value.status}" tidak bisa diubah lagi lewat form ini.`
    );
    return;
  }
  if (!header.value.customerKode) return toast.error("Customer harus diisi.");
  // [DIUBAH] skip untuk Sublim — jenis kain dipilih di tab Sublim, bukan di header
  if (header.value.ketersediaan !== "Sublim" && !header.value.jenisKaos) {
    return toast.error("Jenis Kaos harus diisi.");
  }

  const totalQty = sizeItems.value.reduce((sum, item) => sum + (item.qty || 0), 0);
  // [DIUBAH] skip untuk Sublim — qty-nya dicek di blok validasi Sublim di bawah
  if (!isSublimMode.value && totalQty === 0) {
    return toast.error("Jumlah order (Qty) belum diisi.");
  }

  if (isCustomMode.value || isStokMode.value) {
    if (!header.value.jenisKain)
      return toast.error(`Jenis Kain harus diisi untuk Pengajuan ${header.value.ketersediaan}.`);
    if (!header.value.warna)
      return toast.error(`Warna harus diisi untuk Pengajuan ${header.value.ketersediaan}.`);
  }

  if (isSublimMode.value) {
    if (!sublimForm.value.kain) return toast.error("Jenis Kain Sublim wajib dipilih.");
    if (!sublimForm.value.warna) return toast.error("Warna Kaos wajib dipilih.");
    if (!sublimForm.value.jerseyChoice) return toast.error("Jenis Jersey wajib dipilih.");
    if (totalJerseyQty.value === 0 && totalCelanaQty.value === 0) {
      return toast.error("Isi minimal qty Jersey atau Celana.");
    }
  }

  isSaveConfirmVisible.value = true;
};

const executeSave = async () => {
  isSaveConfirmVisible.value = false;
  isSaving.value = true;

  try {
    const filteredDetails = sizeItems.value.filter((item) => (item.qty || 0) > 0);
    const filteredAdditionalCosts = additionalCostItems.value.filter(
      (item) => item.tambahan && item.tambahan.trim() && (item.harga || 0) > 0
    );

    const [jeniskaosPart, ...lenganPartsArr] = sublimForm.value.jerseyChoice.split("|");
    const payload = {
      header: header.value,
      details: filteredDetails,
      sublim: isSublimMode.value
        ? {
            kain: sublimForm.value.kain,
            warna: sublimForm.value.warna,
            jeniskaos: jeniskaosPart,
            baseLengan: lenganPartsArr.join("|"),
            lenganPanjang: sublimForm.value.lenganPanjang,
            katalogId: sublimForm.value.katalogId,
            katalogGambar: sublimForm.value.katalogGambar,
            jerseySizes: jerseySizes.value,
            celanaSizes: celanaSizes.value,
          }
        : null,
      bordirItems: bordirItems.value,
      dtfItems: dtfItems.value,
      additionalCostItems: filteredAdditionalCosts,
      footer: footer.value,
      user: authStore.user,
      isNew: !isEditMode.value,
      biayaPerCmBordir: biayaPerCmBordir.value,
      bordirMinCharge: bordirMinCharge.value,
      bordirCost: bordirCost.value,
      biayaPerCmDtf: biayaPerCmDtf.value,
      dtfMinCharge: dtfMinCharge.value,
      dtfCost: dtfCost.value,
    };

    const response = await api.post("/price-proposal-form/save", payload);
    markAsSaved();

    const savedNomor = isEditMode.value ? header.value.nomor : response.data.nomor;

    if (selectedFile.value && savedNomor) {
      const formData = new FormData();
      formData.append("image", selectedFile.value);
      try {
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

    if (sublimDesignFile.value && savedNomor) {
      const formData = new FormData();
      formData.append("image", sublimDesignFile.value);
      try {
        await api.post(`/price-proposal-form/sublim/upload-design/${savedNomor}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } catch {
        toast.warning("Data tersimpan, tapi desain custom gagal diunggah.");
      }
    }

    const successMessage = response.data.kodeBarangDraft
      ? `${response.data.message} Kode Barang Draft: ${response.data.kodeBarangDraft}`
      : response.data.message;
    toast.success(successMessage);
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
    jenisKain: "",
    warna: "",
    kodeBarangDraft: "",
    kodeBarangDeskripsi: "",
    status: "",
  };

  sizeItems.value = [];
  additionalCostItems.value = [];
  imagePreview.value = null;
  selectedFile.value = null;
  accCustomerChecked.value = false;
  accCustomerProofFile.value = null;
  accCustomerProofPreview.value = null;

  footer.value = {
    hargaBruto: 0,
    diskon: 0,
    hargaNetto: 0,
  };

  bordirItems.value = Array.from({ length: 8 }, () => ({ p: 0, l: 0 }));
  dtfItems.value = Array.from({ length: 8 }, () => ({ p: 0, l: 0 }));
  biayaPerCmBordirFlat.value = 0;
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
  resetForm();
};

const calculateTotals = async () => {
  const totalAdditionalCostsFromTable = additionalCostItems.value.reduce(
    (sum, item) => sum + (item.harga || 0),
    0
  );

  const totalAdditionalCost =
    (bordirCost.value || 0) + (dtfCost.value || 0) + totalAdditionalCostsFromTable;

  let brutoTotal = 0;
  sizeItems.value.forEach((item) => {
    const hargaDasar = item.hargaPcs || 0;
    const qty = item.qty || 0;

    const hargaKaos = hargaDasar + totalAdditionalCost;
    item.hargaKaos = hargaKaos;

    item.totalHarga = hargaKaos * qty;

    brutoTotal += item.totalHarga;
  });

  footer.value.hargaBruto = brutoTotal;

  try {
    const response = await api.get("/price-proposal-form/get-discount", {
      params: { bruto: brutoTotal },
    });
    footer.value.diskon = response.data.diskonRp || 0;
  } catch (error) {
    console.error("Gagal mengambil diskon:", error);
    footer.value.diskon = 0;
  }

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
  selectedProductForUpdate.value = product;
  isUpdateAllConfirmVisible.value = true;
};

const handleUpdateAllConfirm = (updateAll: boolean) => {
  isUpdateAllConfirmVisible.value = false;
  const product = selectedProductForUpdate.value;
  if (!product) return;

  if (updateAll) {
    sizeItems.value.forEach((item) => {
      if (item.qty !== null && item.qty > 0) {
        item.kodeBarang = product.Kode;
        item.namaBarang = product.Nama;
      }
    });
  } else {
    const activeItem = sizeItems.value[activeItemIndexForProductSearch.value];
    if (activeItem) {
      activeItem.kodeBarang = product.Kode;
      activeItem.namaBarang = product.Nama;
    }
  }
  selectedProductForUpdate.value = null;
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
  if (additionalCostItems.value[index]?.harga === 0) {
    activeAdditionalCostIndex.value = index;
    isAdditionalCostSearchVisible.value = true;
  }
};

const onAdditionalCostSelected = (cost: { tambahan: string; harga: number }) => {
  isAdditionalCostSearchVisible.value = false;

  const isDuplicate = additionalCostItems.value.some(
    (item, index) => item.tambahan === cost.tambahan && index !== activeAdditionalCostIndex.value
  );

  if (isDuplicate) {
    toast.warning(`Harga tambahan "${cost.tambahan}" sudah diinput.`);
    return;
  }

  const activeItem = additionalCostItems.value[activeAdditionalCostIndex.value];
  if (activeItem) {
    activeItem.tambahan = cost.tambahan;
    activeItem.harga = cost.harga;
  }
};

const applyBordirCost = () => {
  let finalCost = totalHargaBordir.value;
  if (finalCost > 0 && finalCost < bordirMinCharge.value) {
    finalCost = bordirMinCharge.value;
  }

  bordirCost.value = finalCost;
  toast.success(`Biaya Bordir sebesar ${formatRupiah(finalCost)} diterapkan.`);

  activeTab.value = "pengajuan";
};

const applyDtfCost = () => {
  let finalCost = totalHargaDtf.value;
  if (finalCost > 0 && finalCost < dtfMinCharge.value) {
    finalCost = dtfMinCharge.value;
  }

  dtfCost.value = finalCost;
  toast.success(`Biaya DTF sebesar ${formatRupiah(finalCost)} diterapkan.`);

  activeTab.value = "pengajuan";
};

const loadOfferData = async (nomor: string) => {
  isLoadingData.value = true;
  try {
    const response = await api.get(`/price-proposal-form/${nomor}`);
    const data = response.data;

    header.value.nomor = data.header.ph_nomor;
    header.value.tanggal = format(new Date(data.header.ph_tanggal), "yyyy-MM-dd");
    header.value.customerKode = data.header.ph_kd_cus;
    header.value.customerNama = data.header.cus_nama;
    header.value.keterangan = data.header.ph_ket;
    header.value.jenisKaos = data.header.ph_jenis;
    header.value.ketersediaan = data.header.ph_sublim_kain
      ? "Sublim"
      : data.header.ph_custom === "Y"
      ? "Custom"
      : "Stok";
    header.value.approval = data.header.ph_apv;
    header.value.isApproved = !!data.header.ph_apv;

    // [BARU] Isi ulang Jenis Kain / Warna / Kode Draft dari kombinasi draft aktif
    const barangDraft = data.barangDraft as BarangDraft | null;
    header.value.jenisKain = barangDraft?.pbd_jeniskain || "";
    header.value.warna = barangDraft?.pbd_warna || "";
    header.value.kodeBarangDraft = barangDraft?.pbd_kode_barang_draft || "";
    header.value.kodeBarangDeskripsi = barangDraft?.pbd_deskripsi || "";
    header.value.status = data.header.ph_status || "DRAFT";
    // [BARU] Populate ulang state Sublim kalau mode-nya Sublim
    if (header.value.ketersediaan === "Sublim") {
      const draft = barangDraft;

      sublimForm.value.kain = data.header.ph_sublim_kain || "";
      sublimForm.value.warna = draft?.pbd_warna || "";
      sublimForm.value.katalogId = data.header.ph_sublim_katalog_id || null;
      sublimForm.value.katalogGambar = data.header.ph_sublim_katalog_gambar || null;
      sublimForm.value.katalogNama = data.sublimKatalogNama || "";

      if (draft && draft.pbd_kategori === "UTAMA") {
        const lengan = draft.pbd_lengan || "";
        if (lengan.startsWith("PANJANG")) {
          sublimForm.value.lenganPanjang = true;
          sublimForm.value.jerseyChoice = `${draft.pbd_jeniskaos}|${lengan.replace(
            /^PANJANG/,
            "PENDEK"
          )}`;
        } else {
          sublimForm.value.lenganPanjang = false;
          sublimForm.value.jerseyChoice = `${draft.pbd_jeniskaos}|${lengan}`;
        }
      }

      if (sublimForm.value.kain) {
        await fetchSublimJenisJersey();
      }

      const allSizes = (data.sizes || []) as (SavedSize & { phs_kategori?: string })[];
      const jerseyRows = allSizes.filter((s) => s.phs_kategori !== "CELANA");
      const celanaRows = allSizes.filter((s) => s.phs_kategori === "CELANA");

      jerseySizes.value = SUBLIM_SIZE_LIST.map((size) => {
        const found = jerseyRows.find((r) => r.phs_size === size);
        return { size, qty: found ? found.phs_jumlah : 0 };
      });
      celanaSizes.value = CELANA_SIZE_LIST.map((size) => {
        const found = celanaRows.find((r) => r.phs_size === size);
        return { size, qty: found ? found.phs_jumlah : 0 };
      });
    }
    accCustomerProofPreview.value = data.accCustomerProofUrl || null;
    accCustomerChecked.value = isAccCustomerLocked.value;

    if (data.bordir) {
      bordirCost.value = data.bordir.phb_rpbordir || 0;
      // [UBAH] Simpan nilai cm² yang tersimpan sebagai flat rate — kalau
      // dokumen ini tanggal-nya sebelum 1 Agustus 2026, nilai INI yang
      // dipakai (computed di atas otomatis fallback ke sini). Kalau
      // sesudahnya, computed akan pakai tier baru dan nilai ini diabaikan.
      biayaPerCmBordirFlat.value = data.bordir.phb_cmbordir || 0;
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

    if (header.value.ketersediaan === "Sublim") {
      sizeItems.value = [];
    } else if (header.value.jenisKaos) {
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

      const allSizeItems = templateSizes.map((template: TemplateSize) => ({
        id: Date.now() + Math.random(),
        size: template.ukuran ?? "",
        qty: 0,
        hargaPcs: template.hargaPcs || 0,
        hargaKaos: template.hargaPcs || 0,
        totalHarga: 0,
        kodeBarang: "",
        namaBarang: "",
      }));

      (data.sizes || []).forEach((savedItem: SavedSize) => {
        const itemToUpdate = allSizeItems.find((i: SizeItem) => i.size === savedItem.phs_size);
        if (itemToUpdate) {
          itemToUpdate.qty = savedItem.phs_jumlah;
          itemToUpdate.hargaPcs = savedItem.phs_harga;
          itemToUpdate.isManualPrice = savedItem.phs_harga === 0;
          itemToUpdate.kodeBarang = savedItem.phs_kode;
          // [BARU] Untuk Custom, nama barang dipakai dari deskripsi draft (karena
          // kode belum tentu ada di tbarangdc sampai Acc Finance nanti)
          itemToUpdate.namaBarang =
            header.value.ketersediaan === "Custom"
              ? header.value.kodeBarangDeskripsi
              : savedItem.nama_barang || "";
          itemToUpdate.hargaKaos = savedItem.phs_harga;
          itemToUpdate.totalHarga = savedItem.phs_jumlah * savedItem.phs_harga;
        }
      });

      sizeItems.value = allSizeItems;
    } else {
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
    isLoadingData.value = false;
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

// --- STATE SUBLIM ---
const sublimForm = ref({
  kain: "",
  warna: "",
  jerseyChoice: "",
  lenganPanjang: false,
  katalogId: null as number | null,
  katalogNama: "",
  katalogGambar: null as string | null, // [BARU]
});

const sublimUploadRef = ref<HTMLInputElement | null>(null);
const sublimDesignFile = ref<File | null>(null);
const sublimDesignPreview = ref<string | null>(null);
const isEditingKain = ref(false);
const isEditingJersey = ref(false);
const isSublimWarnaSearchVisible = ref(false);

const openSublimWarnaSearch = () => {
  isSublimWarnaSearchVisible.value = true;
};
const onSublimWarnaSelected = (item: WarnaOption) => {
  isSublimWarnaSearchVisible.value = false;
  sublimForm.value.warna = item.nama;
};

const isKatalogKategoriModalVisible = ref(false);
const sublimKatalogKategoriList = ref<
  { id: number; nama: string; gambar: string | null; keterangan: string | null }[]
>([]);
const isLoadingKatalogKategori = ref(false);

const selectedJenisJersey = computed(
  () =>
    sublimJenisJerseyOptions.value.find(
      (o) => `${o.jeniskaos}|${o.lengan}` === sublimForm.value.jerseyChoice
    ) || null
);

const selectedDesignThumbnail = computed(
  () =>
    sublimDesignPreview.value ||
    sublimForm.value.katalogGambar ||
    selectedJenisJersey.value?.thumbnail ||
    null
);

const SUBLIM_SIZE_LIST = ["S", "M", "L", "XL", "2XL", "3XL"];
const CELANA_SIZE_LIST = ["28", "30", "32", "34", "36", "38"];

const sublimKainOptions = ref<{ nama: string; gambar: string | null; keterangan: string | null }[]>(
  []
);
const sublimJenisJerseyOptions = ref<
  { jeniskaos: string; lengan: string; label: string; thumbnail: string | null }[]
>([]);
const jerseySizes = ref(SUBLIM_SIZE_LIST.map((size) => ({ size, qty: 0 })));
const celanaSizes = ref(CELANA_SIZE_LIST.map((size) => ({ size, qty: 0 })));

const sublimPreview = ref({ jerseyHargaPerPcs: 0, celanaHargaPerPcs: 0, lenganFinal: "" });
const isSublimMode = computed(() => header.value.ketersediaan === "Sublim");

const totalJerseyQty = computed(() =>
  jerseySizes.value.reduce((s, r) => s + (Number(r.qty) || 0), 0)
);
const totalCelanaQty = computed(() =>
  celanaSizes.value.reduce((s, r) => s + (Number(r.qty) || 0), 0)
);

const fetchSublimKain = async () => {
  const response = await api.get("/price-proposal-form/sublim/kain-options");
  sublimKainOptions.value = response.data;
};
const fetchSublimJenisJersey = async () => {
  if (!sublimForm.value.kain) return;
  const response = await api.get("/price-proposal-form/sublim/jenis-jersey-options", {
    params: { kain: sublimForm.value.kain },
  });
  sublimJenisJerseyOptions.value = response.data;
};
const refreshSublimPreview = async () => {
  if (!sublimForm.value.kain || !sublimForm.value.jerseyChoice) return;
  const [jeniskaos, ...lenganParts] = sublimForm.value.jerseyChoice.split("|");
  const baseLengan = lenganParts.join("|");
  try {
    const response = await api.post("/price-proposal-form/sublim/preview-harga", {
      kain: sublimForm.value.kain,
      jeniskaos,
      baseLengan,
      lenganPanjang: sublimForm.value.lenganPanjang,
      jerseyQty: totalJerseyQty.value,
      celanaQty: totalCelanaQty.value,
    });
    sublimPreview.value = response.data;
  } catch (error) {
    console.error("Gagal preview harga sublim:", error);
  }
};

const openKatalogKategoriModal = async () => {
  if (!selectedJenisJersey.value) return;
  isKatalogKategoriModalVisible.value = true;
  isLoadingKatalogKategori.value = true;
  try {
    const response = await api.get("/price-proposal-form/sublim/katalog-by-kategori", {
      params: {
        jeniskaos: selectedJenisJersey.value.jeniskaos,
        lengan: selectedJenisJersey.value.lengan,
      },
    });
    sublimKatalogKategoriList.value = response.data;
  } catch {
    toast.error("Gagal memuat katalog desain.");
  } finally {
    isLoadingKatalogKategori.value = false;
  }
};

const selectKatalogDesain = (item: { id: number; nama: string; gambar: string | null }) => {
  sublimForm.value.katalogId = item.id;
  sublimForm.value.katalogNama = item.nama;
  sublimForm.value.katalogGambar = item.gambar;
  sublimDesignFile.value = null;
  sublimDesignPreview.value = null;
  isKatalogKategoriModalVisible.value = false;
};

const onSublimDesignChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 1_000_000) {
    toast.error("Ukuran gambar tidak boleh melebihi 1 MB.");
    return;
  }
  sublimDesignFile.value = file;
  sublimForm.value.katalogId = null;
  sublimForm.value.katalogNama = "";
  sublimForm.value.katalogGambar = null;
  const reader = new FileReader();
  reader.onload = (ev) => {
    sublimDesignPreview.value = ev.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const handleQtyFocus = (e: FocusEvent) => {
  (e.target as HTMLInputElement).select();
};

watch(
  () => sublimForm.value.jerseyChoice,
  () => {
    if (isLoadingData.value) return;
    sublimForm.value.katalogId = null;
    sublimForm.value.katalogNama = "";
    sublimForm.value.katalogGambar = null;
    sublimDesignFile.value = null;
    sublimDesignPreview.value = null;
  }
);

// watch(
//   () => header.value.isApproved,
//   (isNowApproved) => {
//     if (!authStore.user?.canApprovePrice) {
//       if (isNowApproved && !header.value.approval) {
//         toast.error("Anda tidak memiliki hak untuk melakukan approval.");
//         nextTick(() => {
//           header.value.isApproved = false;
//         });
//       }
//       return;
//     }

//     if (isNowApproved) {
//       if (!header.value.approval) {
//         header.value.approval = authStore.user?.kode || "UNKNOWN";
//       }
//     } else {
//       header.value.approval = "";
//     }
//   }
// );

watch(
  () => sublimForm.value.kain,
  (newVal) => {
    if (isLoadingData.value) return;
    sublimForm.value.jerseyChoice = "";
    isEditingJersey.value = false;
    if (newVal) {
      fetchSublimJenisJersey();
    } else {
      sublimJenisJerseyOptions.value = [];
    }
  }
);

watch(
  [
    () => sublimForm.value.kain,
    () => sublimForm.value.jerseyChoice,
    () => sublimForm.value.lenganPanjang,
    jerseySizes,
    celanaSizes,
  ],
  refreshSublimPreview,
  { deep: true }
);

watch(
  [() => sizeItems.value.map((i) => i.qty), bordirCost, dtfCost, additionalCostItems],
  calculateTotals,
  { deep: true }
);

watch(
  [header, sizeItems, additionalCostItems, footer, bordirItems, dtfItems],
  () => {
    if (isSaving.value) return;

    const hasHeader = header.value.customerKode !== "" || header.value.jenisKaos !== "";

    const hasItems = sizeItems.value.some((i) => (i.qty || 0) > 0);

    const hasAdditional = additionalCostItems.value.length > 0;

    if (hasHeader || hasItems || hasAdditional) {
      uiStore.setUnsavedChanges(true);
    } else {
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

watch(
  () => header.value.ketersediaan,
  async (newVal) => {
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
        sizeItems.value = data.sizes.map((item) => {
          const existing = sizeItems.value.find((i) => i.size === item.ukuran);
          return {
            id: existing?.id || Date.now() + Math.random(),
            size: item.ukuran ?? "",
            ukuran: item.ukuran,
            qty: existing?.qty || null,
            hargaPcs: item.hargaPcs,
            isManualPrice: item.hargaPcs === 0,
            totalHarga: 0,
            hargaKaos: 0,
            kodeBarang: existing?.kodeBarang || "",
            namaBarang: existing?.namaBarang || "",
          };
        });

        const costs = data.costs;
        if (costs) {
          biayaPerCmBordirFlat.value = costs.bordir?.cm || 0; // [UBAH]
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

watch(
  () => header.value.ketersediaan,
  (newVal, oldVal) => {
    if (newVal === "Sublim") {
      activeTab.value = "sublim";
    } else if (oldVal === "Sublim") {
      // Balik dari Sublim ke Stok/Custom — kembalikan ke tab utama
      activeTab.value = "pengajuan";
    }
  }
);

watch(
  () => header.value.ketersediaan,
  (newVal, oldVal) => {
    if (isLoadingData.value) return;
    if (oldVal === undefined || oldVal === newVal) return;

    // Stok <-> Custom: biarkan watcher lama yang urus recalc harga,
    // jenisKaos memang sengaja dipertahankan di sana.
    const involvesSublim = newVal === "Sublim" || oldVal === "Sublim";
    if (!involvesSublim) return;

    // Salah satu sisi Sublim -> reset total, struktur datanya beda sepenuhnya
    sizeItems.value = [];
    header.value.jenisKaos = "";
    header.value.jenisKain = "";
    header.value.warna = "";
    header.value.kodeBarangDraft = "";
    header.value.kodeBarangDeskripsi = "";

    if (oldVal === "Sublim") {
      sublimForm.value = {
        kain: "",
        warna: "",
        jerseyChoice: "",
        lenganPanjang: false,
        katalogId: null,
        katalogNama: "",
        katalogGambar: null,
      };
      sublimDesignFile.value = null;
      sublimDesignPreview.value = null;
      jerseySizes.value = SUBLIM_SIZE_LIST.map((size) => ({ size, qty: 0 }));
      celanaSizes.value = CELANA_SIZE_LIST.map((size) => ({ size, qty: 0 }));
      sublimJenisJerseyOptions.value = [];
      isEditingKain.value = false;
      isEditingJersey.value = false;
    }
  }
);

onMounted(() => {
  markAsSaved();
  fetchSublimKain();
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(
      `Anda tidak memiliki izin untuk ${
        requiredPermission.value === "insert" ? "membuat" : "mengubah"
      } data.`
    );
    router.push("/transaksi/penjualan/pengajuan/pengajuan-harga");
    return;
  }

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
        :disabled="isFormLocked"
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

    <v-alert v-if="isFormLocked" type="warning" variant="tonal" density="compact" class="mb-3">
      Pengajuan Harga ini berstatus <strong>{{ header.status }}</strong> — form terkunci, tidak bisa
      diubah lagi.
    </v-alert>

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
              <v-text-field
                :model-value="
                  header.status === 'ACC_FINANCE'
                    ? `Disetujui: ${header.approval}`
                    : 'Belum Acc Finance'
                "
                readonly
                variant="filled"
                density="compact"
                hide-details
                :prepend-inner-icon="
                  header.status === 'ACC_FINANCE' ? 'mdi-check-decagram' : 'mdi-clock-outline'
                "
              ></v-text-field>
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
                @click="!isFormLocked && openCustomerSearch()"
                :disabled="isFormLocked"
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
                :readonly="isFormLocked"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field>
            </div>
            <div class="grid-item-radio">
              <v-radio-group
                v-model="header.ketersediaan"
                inline
                hide-details
                density="compact"
                :disabled="isFormLocked"
              >
                <v-radio label="Stok" value="Stok"></v-radio>
                <v-radio label="Custom" value="Custom"></v-radio>
                <v-radio label="Sublim" value="Sublim"></v-radio>
              </v-radio-group>
            </div>
            <template v-if="header.ketersediaan !== 'Sublim'">
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

              <!-- [DIUBAH] sekarang tampil untuk Stok DAN Custom, bukan cuma Custom -->
              <div class="grid-item-jenis-kain">
                <v-text-field
                  label="Jenis Kain"
                  v-model="header.jenisKain"
                  readonly
                  placeholder="Tekan F1 atau klik..."
                  @click="openJenisKainSearch"
                  @keydown.f1.prevent="openJenisKainSearch"
                  variant="outlined"
                  density="compact"
                  hide-details
                  append-inner-icon="mdi-magnify"
                  @click:append-inner="openJenisKainSearch"
                ></v-text-field>
              </div>
              <div class="grid-item-warna">
                <v-text-field
                  label="Warna"
                  v-model="header.warna"
                  readonly
                  placeholder="Tekan F1 atau klik..."
                  @click="openWarnaSearch"
                  @keydown.f1.prevent="openWarnaSearch"
                  variant="outlined"
                  density="compact"
                  hide-details
                  append-inner-icon="mdi-magnify"
                  @click:append-inner="openWarnaSearch"
                ></v-text-field>
              </div>

              <!-- Kode Barang Draft tetap khusus Custom (cuma itu yang generate kode) -->
              <div
                v-if="(isCustomMode || isStokMode) && header.kodeBarangDraft"
                class="grid-item-kode-draft"
              >
                <v-text-field
                  label="Kode Barang Draft"
                  :model-value="header.kodeBarangDraft"
                  readonly
                  variant="filled"
                  density="compact"
                  hide-details
                ></v-text-field>
              </div>
            </template>
            <template v-else>
              <!-- [BARU] pengganti area yang kosong pas Sublim, biar tinggi card konsisten -->
              <div class="grid-item-jenis-kaos">
                <v-alert type="info" variant="tonal" density="compact">
                  Jenis Kain & model Jersey dipilih di tab <strong>Sublim</strong>.
                </v-alert>
              </div>
            </template>
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
          <v-tab value="sublim">Sublim</v-tab>
          <v-tab value="gambar">Lihat Gambar</v-tab>
          <v-tab value="accCustomer">Acc Customer</v-tab>
          <v-tab
            value="accFinance"
            v-if="authStore.user?.canApprovePrice || header.status !== 'DRAFT'"
          >
            Acc Finance
          </v-tab>
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
                      :disabled="isFormLocked"
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
                      :disabled="isFormLocked"
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
                    <!-- Mode Custom: readonly, ditentukan backend saat simpan -->
                    <v-text-field
                      v-if="isCustomMode || isStokMode"
                      :model-value="header.kodeBarangDraft || 'Otomatis saat disimpan'"
                      readonly
                      :disabled="isFormLocked"
                      variant="underlined"
                      density="compact"
                      hide-details
                    ></v-text-field>
                    <!-- Mode Stok: tetap search produk existing seperti semula -->
                    <v-text-field
                      v-else
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
                      v-if="!isFormLocked"
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
                      :model-value="biayaPerCmBordir"
                      type="number"
                      density="compact"
                      variant="filled"
                      readonly
                      hide-details
                    ></v-text-field>
                    <v-chip
                      v-if="bordirTierLabel"
                      size="x-small"
                      color="primary"
                      variant="tonal"
                      class="mb-2"
                    >
                      Tier aktif: {{ bordirTierLabel }} ({{ totalQty }} pcs)
                    </v-chip>
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
          <v-window-item value="sublim" class="window-item">
            <div class="pa-4 sublim-tab">
              <div class="sublim-layout">
                <!-- KANAN (25%) — ringkasan step yang sudah selesai, statis di atas -->
                <div class="sublim-right">
                  <div
                    v-if="sublimForm.kain"
                    class="sublim-summary-card"
                    @click="isEditingKain = true"
                  >
                    <img
                      :src="sublimKainOptions.find((k) => k.nama === sublimForm.kain)?.gambar || ''"
                    />
                    <div class="sublim-summary-card-label">{{ sublimForm.kain }}</div>
                    <div class="sublim-summary-card-action">Ganti kain</div>
                  </div>
                  <div
                    v-if="sublimForm.jerseyChoice"
                    class="sublim-summary-card"
                    @click="isEditingJersey = true"
                  >
                    <img :src="selectedDesignThumbnail || ''" />
                    <div class="sublim-summary-card-label">{{ selectedJenisJersey?.label }}</div>
                    <div class="sublim-summary-card-action">Ganti jenis</div>
                  </div>
                </div>

                <!-- KIRI (75%) — konten step yang lagi aktif -->
                <div class="sublim-left">
                  <!-- Step 1 -->
                  <template v-if="!sublimForm.kain || isEditingKain">
                    <div class="sublim-step-label">
                      <span class="sublim-step-num">1</span> Pilih Jenis Kain
                    </div>
                    <v-row dense>
                      <v-col
                        v-for="item in sublimKainOptions"
                        :key="item.nama"
                        cols="6"
                        sm="4"
                        md="4"
                      >
                        <div
                          class="kain-card"
                          :class="{ 'kain-card-selected': sublimForm.kain === item.nama }"
                          @click="
                            sublimForm.kain = item.nama;
                            isEditingKain = false;
                          "
                        >
                          <div class="kain-card-img-wrap">
                            <v-img v-if="item.gambar" :src="item.gambar" height="90" cover></v-img>
                            <div v-else class="kain-card-placeholder">
                              <v-icon size="24">mdi-image-off-outline</v-icon>
                            </div>
                            <v-scale-transition>
                              <div v-if="sublimForm.kain === item.nama" class="kain-check-badge">
                                <v-icon size="12" color="white">mdi-check</v-icon>
                              </div>
                            </v-scale-transition>
                          </div>
                          <div class="kain-card-name">{{ item.nama }}</div>
                          <div v-if="item.keterangan" class="kain-card-desc">
                            {{ item.keterangan }}
                          </div>
                        </div>
                      </v-col>
                    </v-row>
                  </template>

                  <!-- Step 2 -->
                  <template v-else-if="!sublimForm.jerseyChoice || isEditingJersey">
                    <div class="sublim-step-label">
                      <span class="sublim-step-num">2</span> Pilih Jenis Jersey
                    </div>
                    <v-row dense>
                      <v-col
                        v-for="opt in sublimJenisJerseyOptions"
                        :key="`${opt.jeniskaos}-${opt.lengan}`"
                        cols="6"
                        sm="4"
                        md="4"
                      >
                        <div
                          class="jersey-card"
                          :class="{
                            'jersey-card-selected':
                              sublimForm.jerseyChoice === `${opt.jeniskaos}|${opt.lengan}`,
                          }"
                          @click="
                            sublimForm.jerseyChoice = `${opt.jeniskaos}|${opt.lengan}`;
                            isEditingJersey = false;
                          "
                        >
                          <div class="jersey-card-img-wrap">
                            <v-img
                              v-if="opt.thumbnail"
                              :src="opt.thumbnail"
                              height="100"
                              contain
                            ></v-img>
                            <div v-else class="kain-card-placeholder">
                              <v-icon size="24">mdi-tshirt-crew-outline</v-icon>
                            </div>
                            <v-scale-transition>
                              <div
                                v-if="sublimForm.jerseyChoice === `${opt.jeniskaos}|${opt.lengan}`"
                                class="kain-check-badge"
                              >
                                <v-icon size="12" color="white">mdi-check</v-icon>
                              </div>
                            </v-scale-transition>
                          </div>
                          <div class="jersey-card-name">{{ opt.label }}</div>
                        </div>
                      </v-col>
                    </v-row>
                  </template>

                  <!-- Step 3 -->
                  <template v-else>
                    <div class="sublim-step-label">
                      <span class="sublim-step-num">3</span> Atur Desain & Ukuran
                    </div>

                    <v-text-field
                      v-model="sublimForm.warna"
                      label="Warna Kaos"
                      readonly
                      placeholder="Tekan F1 atau klik..."
                      @click="openSublimWarnaSearch"
                      @keydown.f1.prevent="openSublimWarnaSearch"
                      variant="outlined"
                      density="compact"
                      hide-details
                      append-inner-icon="mdi-magnify"
                      @click:append-inner="openSublimWarnaSearch"
                      class="mb-3"
                      style="max-width: 320px"
                    ></v-text-field>

                    <div class="sublim-options-row">
                      <v-checkbox
                        v-model="sublimForm.lenganPanjang"
                        label="Lengan Panjang (+Rp7.500)"
                        hide-details
                        density="compact"
                        class="flex-grow-0"
                      ></v-checkbox>
                      <v-spacer></v-spacer>
                      <v-btn
                        size="small"
                        variant="tonal"
                        prepend-icon="mdi-image-multiple-outline"
                        @click="openKatalogKategoriModal"
                        >Lihat Katalog</v-btn
                      >
                      <v-btn
                        size="small"
                        variant="tonal"
                        color="primary"
                        prepend-icon="mdi-upload"
                        class="ml-2"
                        @click="sublimUploadRef?.click()"
                        >Upload Desain Sendiri</v-btn
                      >
                      <input
                        ref="sublimUploadRef"
                        type="file"
                        accept="image/jpeg,image/png"
                        style="display: none"
                        @change="onSublimDesignChange"
                      />
                    </div>

                    <div v-if="selectedDesignThumbnail" class="sublim-design-preview">
                      <img :src="selectedDesignThumbnail" class="sublim-design-preview-img" />
                      <div class="ml-3">
                        <div class="text-caption text-medium-emphasis">Desain terpilih</div>
                        <div class="text-body-2 font-weight-medium">
                          {{
                            sublimForm.katalogNama ||
                            (sublimDesignFile ? sublimDesignFile.name : "Desain default kategori")
                          }}
                        </div>
                      </div>
                    </div>

                    <v-expand-transition>
                      <div v-if="selectedDesignThumbnail">
                        <v-divider class="my-4"></v-divider>
                        <div class="d-flex sublim-tables-row">
                          <div class="sublim-main-col">
                            <div class="text-caption font-weight-bold mb-1 px-1">
                              Jersey — Harga/pcs:
                              {{ formatRupiah(sublimPreview.jerseyHargaPerPcs) }}
                              <span v-if="sublimPreview.lenganFinal" class="text-medium-emphasis"
                                >({{ sublimPreview.lenganFinal }})</span
                              >
                            </div>
                            <v-table density="compact">
                              <thead>
                                <tr>
                                  <th>Size</th>
                                  <th class="text-right">Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr v-for="row in jerseySizes" :key="row.size">
                                  <td>{{ row.size }}</td>
                                  <td>
                                    <v-text-field
                                      v-model.number="row.qty"
                                      type="number"
                                      variant="underlined"
                                      density="compact"
                                      hide-details
                                      class="text-right"
                                      @focus="handleQtyFocus"
                                    ></v-text-field>
                                  </td>
                                </tr>
                              </tbody>
                            </v-table>
                          </div>
                          <div class="sublim-side-col">
                            <div class="pa-2 font-weight-medium text-caption">
                              Celana (Opsional)
                            </div>
                            <v-divider></v-divider>
                            <v-table density="compact">
                              <thead>
                                <tr>
                                  <th>Size</th>
                                  <th class="text-right">Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr v-for="row in celanaSizes" :key="row.size">
                                  <td>{{ row.size }}</td>
                                  <td>
                                    <v-text-field
                                      v-model.number="row.qty"
                                      type="number"
                                      variant="underlined"
                                      density="compact"
                                      hide-details
                                      class="text-right"
                                      @focus="handleQtyFocus"
                                    ></v-text-field>
                                  </td>
                                </tr>
                              </tbody>
                            </v-table>
                            <v-divider></v-divider>
                            <div class="total-footer">
                              <div class="text-caption text-medium-emphasis mb-1">
                                Harga/pcs: {{ formatRupiah(sublimPreview.celanaHargaPerPcs) }}
                              </div>
                              <v-text-field
                                label="Total Harga Celana"
                                :model-value="
                                  formatRupiah(totalCelanaQty * sublimPreview.celanaHargaPerPcs)
                                "
                                readonly
                                variant="filled"
                                density="compact"
                                hide-details
                              ></v-text-field>
                            </div>
                          </div>
                        </div>
                      </div>
                    </v-expand-transition>
                  </template>
                </div>
              </div>
            </div>

            <!-- Modal Lihat Katalog — tidak berubah dari sebelumnya -->
            <v-dialog v-model="isKatalogKategoriModalVisible" max-width="700px">
              <v-card>
                <v-card-title>Katalog Desain — {{ selectedJenisJersey?.label }}</v-card-title>
                <v-card-text>
                  <div v-if="isLoadingKatalogKategori" class="text-center py-6">
                    <v-progress-circular indeterminate color="primary"></v-progress-circular>
                  </div>
                  <v-row v-else dense>
                    <v-col v-for="item in sublimKatalogKategoriList" :key="item.id" cols="4">
                      <div class="jersey-card" @click="selectKatalogDesain(item)">
                        <div class="jersey-card-img-wrap">
                          <v-img v-if="item.gambar" :src="item.gambar" height="110" contain></v-img>
                          <div v-else class="kain-card-placeholder">
                            <v-icon size="28">mdi-image-off-outline</v-icon>
                          </div>
                        </div>
                        <div class="jersey-card-name">{{ item.nama }}</div>
                      </div>
                    </v-col>
                    <v-col
                      v-if="sublimKatalogKategoriList.length === 0"
                      cols="12"
                      class="text-center text-caption text-medium-emphasis pa-4"
                    >
                      Belum ada desain lain untuk kategori ini.
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>
            </v-dialog>
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
          <v-window-item value="accCustomer" class="window-item">
            <div class="pa-4 acc-customer-tab">
              <template v-if="!header.nomor">
                <v-alert type="info" variant="tonal">
                  Simpan Pengajuan Harga terlebih dahulu sebelum bisa melakukan Acc Customer.
                </v-alert>
              </template>
              <template v-else>
                <div class="acc-customer-layout">
                  <!-- Kolom Kiri: Kontrol -->
                  <div class="acc-customer-controls">
                    <v-checkbox
                      v-model="accCustomerChecked"
                      label="Customer sudah menyetujui (Acc Customer)"
                      :disabled="isAccCustomerLocked"
                      hide-details
                      class="mb-4"
                    ></v-checkbox>

                    <v-file-input
                      label="Upload Bukti Acc Customer (screenshot)"
                      accept="image/jpeg, image/png"
                      variant="outlined"
                      density="compact"
                      prepend-icon="mdi-upload"
                      :disabled="isAccCustomerLocked"
                      @change="onAccCustomerFileChange"
                      class="mb-4"
                    ></v-file-input>

                    <v-btn
                      color="primary"
                      prepend-icon="mdi-check-circle-outline"
                      :loading="isConfirmingAccCustomer"
                      :disabled="isAccCustomerLocked || !accCustomerChecked"
                      @click="confirmAccCustomer"
                      class="mb-4"
                      block
                    >
                      Konfirmasi Acc Customer
                    </v-btn>

                    <v-alert v-if="isAccCustomerLocked" type="success" variant="tonal">
                      Pengajuan Harga ini sudah di-Acc Customer.
                    </v-alert>
                  </div>

                  <!-- Kolom Kanan: Preview Gambar -->
                  <div class="acc-customer-preview">
                    <v-img
                      v-if="accCustomerProofPreview"
                      :src="accCustomerProofPreview"
                      max-height="320"
                      contain
                      class="preview-image"
                    ></v-img>
                    <div v-else class="preview-placeholder">
                      <v-icon size="48" class="mb-2">mdi-image-off-outline</v-icon>
                      <span class="text-caption">Belum ada bukti diunggah</span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </v-window-item>
          <v-window-item value="accFinance" class="window-item">
            <div class="pa-4" style="max-width: 480px">
              <template v-if="header.status !== 'ACC_CUSTOMER' && header.status !== 'ACC_FINANCE'">
                <v-alert type="info" variant="tonal">
                  Pengajuan Harga harus di-Acc Customer terlebih dahulu sebelum Acc Finance.
                </v-alert>
              </template>
              <template v-else-if="!authStore.user?.canApprovePrice">
                <v-alert type="warning" variant="tonal">
                  Anda tidak memiliki hak approval Finance untuk halaman ini.
                </v-alert>
              </template>
              <template v-else>
                <p class="text-body-2 mb-4">
                  Kode Barang Draft saat ini: <strong>{{ header.kodeBarangDraft || "-" }}</strong
                  >. Konfirmasi Acc Finance akan mengunci kode barang ini menjadi final di master
                  barang.
                </p>

                <v-btn
                  color="primary"
                  prepend-icon="mdi-bank-check"
                  block
                  :loading="isConfirmingAccFinance"
                  :disabled="isAccFinanceLocked"
                  @click="confirmAccFinance"
                  class="mb-4"
                >
                  Konfirmasi Acc Finance
                </v-btn>

                <v-alert v-if="header.status === 'ACC_FINANCE'" type="success" variant="tonal">
                  Pengajuan Harga ini sudah di-Acc Finance. Kode barang final:
                  <strong>{{ header.kodeBarangDraft }}</strong>
                </v-alert>
              </template>
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
    <JenisKainSearchModal
      v-if="isJenisKainSearchVisible"
      @close="isJenisKainSearchVisible = false"
      @jenis-kain-selected="onJenisKainSelected"
    />
    <WarnaKainSearchModal
      v-if="isWarnaSearchVisible"
      @close="isWarnaSearchVisible = false"
      @warna-kain-selected="onWarnaSelected"
    />
    <WarnaKainSearchModal
      v-if="isSublimWarnaSearchVisible"
      @close="isSublimWarnaSearchVisible = false"
      @warna-kain-selected="onSublimWarnaSelected"
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

.header-grid {
  gap: 4px 8px !important;
}

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

.desktop-form-section .v-input {
  margin-bottom: 0 !important;
}

.footer-section .v-row {
  margin: -4px !important;
}

.footer-section .v-col {
  padding: 4px !important;
}

.footer-section {
  margin-top: auto;
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
.header-grid .grid-item-jenis-kaos,
.header-grid .grid-item-kode-draft {
  grid-column: span 2;
}

.desktop-form-section :deep(.v-label) {
  font-size: 11px !important;
}

.desktop-form-section :deep(input) {
  font-size: 12px !important;
}

.desktop-form-section :deep(.v-radio-group .v-label) {
  font-size: 12px !important;
}

.keterangan-produksi-field :deep(textarea) {
  font-size: 11px !important;
  line-height: 1.4;
}
.keterangan-produksi-field :deep(.v-field__input) {
  max-height: 140px;
  overflow-y: auto;
}

.main-table-container {
  width: 75%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.side-table-container {
  width: 25%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.main-table-container .v-data-table,
.side-table-container .v-data-table {
  flex: 1;
  overflow-y: auto;
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
  grid-template-rows: auto 1fr auto;
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
  grid-row: 2;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.summary-section .v-text-field {
  margin-bottom: 8px;
}

.button-section {
  grid-column: 1 / 3;
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
}

.preview-image {
  max-width: 100%;
  max-height: 400px;
  border: 1px solid #e0e0e0;
  background-color: white;
  object-fit: contain;
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
}

.window-item {
  height: 100%;
  min-height: 0;
}

.main-table-container,
.side-table-container {
  height: 100%;
  min-height: 0;
}

.acc-customer-tab {
  height: 100%;
  overflow-y: auto;
}

.acc-customer-tab {
  height: 100%;
  overflow-y: auto;
}

.acc-customer-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.acc-customer-controls {
  flex: 0 0 420px;
  max-width: 420px;
}

.acc-customer-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  padding: 16px;
  background-color: rgb(var(--v-theme-surface));
  min-height: 320px;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.sublim-tables-row {
  align-items: stretch;
}

.sublim-main-col {
  width: 75%;
  padding-right: 16px;
}

.sublim-side-col {
  width: 25%;
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-left: 16px;
  display: flex;
  flex-direction: column;
}

.kain-card,
.jersey-card {
  border: 1.5px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  background: rgb(var(--v-theme-surface));
}

.kain-card:hover,
.jersey-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
  border-color: rgba(var(--v-theme-primary), 0.5);
}

.kain-card-selected,
.jersey-card-selected {
  border-color: rgb(var(--v-theme-primary));
  border-width: 2px;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.15);
}

.kain-card-img-wrap,
.jersey-card-img-wrap {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.kain-card-placeholder {
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.35);
}

.kain-check-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.kain-card-name,
.jersey-card-name {
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  margin-top: 6px;
  line-height: 1.3;
}

.kain-card-desc {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-align: center;
  margin-top: 2px;
}

.sublim-tab {
  max-width: 960px;
  max-height: calc(100vh - 250px);
  overflow-y: auto;
}

.sublim-step-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}

.sublim-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  color: white;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.sublim-layout {
  display: grid;
  grid-template-columns: 1fr 3fr;
  gap: 20px;
  align-items: start;
}

.sublim-left {
  min-width: 0;
}

.sublim-right {
  min-width: 0;
  position: sticky;
  top: 0;
}

.sublim-summary-card {
  border: 1.5px solid rgba(var(--v-theme-primary), 0.4);
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
  background: rgba(var(--v-theme-primary), 0.05);
  transition: border-color 0.15s, background 0.15s;
  margin-bottom: 12px;
}

.sublim-summary-card:hover {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.09);
}

.sublim-summary-card img {
  width: 100%;
  height: 70px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
  margin-bottom: 6px;
}

.sublim-summary-card-label {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
}

.sublim-summary-card-action {
  font-size: 10px;
  color: rgb(var(--v-theme-primary));
  margin-top: 2px;
}

.sublim-options-row {
  display: flex;
  align-items: center;
  padding: 10px 4px;
}

.sublim-design-preview {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  margin-top: 8px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.06);
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
}

.sublim-design-preview-img {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  display: block;
}
</style>

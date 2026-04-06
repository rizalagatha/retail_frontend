<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { format, addDays, isAfter, parseISO } from "date-fns";
import { AxiosError } from "axios";

// --- Import Modals ---
import CustomerSearchModal from "@/components/lookup/CustomerSearchModal.vue";
import SalesSearchModal from "@/components/lookup/SalesSearchModal.vue";
import JenisOrderSearchModal from "@/components/lookup/JenisOrderSearchModal.vue";
import JenisKainSearchModal from "@/components/lookup/JenisKainSearchModal.vue";
import WorkshopSearchModal from "@/components/lookup/WorkshopSearchModal.vue";
import SoSearchModalForInvoice from "@/components/lookup/SoSearchModalForInvoice.vue";

// --- Interfaces ---
interface FormHeader {
  nomor: string | null;
  tanggal: string;
  tglPengerjaan: string;
  datelineCustomer: string;
  salesKode: string;
  salesNama: string;
  customerKode: string;
  customerNama: string;
  customerAlamat: string;
  customerLevel: string;
  jenisOrderKode: string;
  jenisOrderNama: string;
  namaDtf: string;
  kain: string;
  finishing: string;
  desain: string;
  workshopKode: string;
  workshopNama: string;
  keterangan: string;
  hargaPerCm: number;
  user: string;
  imageUrl: string | null;
  [key: string]: unknown;
}
interface DetailUkuran {
  id: number;
  ukuran: string;
  jumlah: number; // Hapus | null
  harga: number; // Hapus | null
  namaBarang: string; // Hapus opsional ?
}
interface DetailTitik {
  id: number;
  keterangan: string;
  sizeCetak: string;
  panjang: number; // Hapus | null
  lebar: number; // Hapus | null
}
interface SoDtfPayload {
  header: FormHeader;
  detailsUkuran: DetailUkuran[];
  detailsTitik: DetailTitik[];
}
interface SoItem {
  id: string | number;
  isCustomOrder: boolean;
  nama: string;
  sod_custom_nama?: string;
  sourceItems?: { nama: string }[];
  ukuranKaos: {
    ukuran: string;
    jumlah: number;
    harga: number;
  }[];
  titikCetak: {
    keterangan: string;
    sizeCetak: string;
    panjang: number;
    lebar: number;
  }[];
}

type SoSelected = {
  nomor?: string;
  Nomor?: string;
  so_nomor?: string;
  soNomor?: string;
};

// --- State & Dependencies ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "35";

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? `Ubah SO DTF: ${form.value.nomor}` : "Buat SO DTF Baru"
);
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));

const isLoading = ref(true);
const isSaving = ref(false);
const isInitializing = ref(false);
const isRestoringData = ref(false);

const initialFormState = {
  nomor: null,
  soNomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  tglPengerjaan: format(new Date(), "yyyy-MM-dd"),
  datelineCustomer: "",
  salesKode: "",
  salesNama: "",
  customerKode: "",
  customerNama: "",
  customerAlamat: "",
  customerLevel: "",
  jenisOrderKode: "",
  jenisOrderNama: "",
  namaDtf: "",
  kain: "",
  finishing: "",
  desain: "",
  workshopKode: authStore.user?.cabang || "",
  workshopNama: authStore.user?.cabangNama || "",
  keterangan: "",
  hargaPerCm: 0,
  user: authStore.user?.kode || "",
  imageUrl: null as string | null,
};

const form = ref<FormHeader>({ ...initialFormState });
const detailsUkuran = ref<DetailUkuran[]>([]);
const detailsTitik = ref<DetailTitik[]>([]);
const imagePreview = ref<string | null>(null);
const imageFile = ref<File | null>(null);
const isImageUploading = ref(false);
const sisaKuota = ref(0);
const isImageFullscreenVisible = ref(false); // State untuk modal fullscreen
const isConfirmDialogVisible = ref(false);
const confirmText = ref("");
const pendingAction = ref<(() => void) | null>(null);
const isPrintConfirmVisible = ref(false); // State untuk dialog cetak baru
const printConfirmNomor = ref(""); // Untuk menyimpan nomor SO DTF yang akan dicetak
const ukuranKaosList = ref<string[]>([]);

// --- Modal Visibility State ---
const isCustomerSearchVisible = ref(false);
const isSalesSearchVisible = ref(false);
const isJenisOrderSearchVisible = ref(false);
const isJenisKainSearchVisible = ref(false);
const isWorkshopSearchVisible = ref(false);
const isSoSearchVisible = ref(false);
const sizeCetakList = ref(["A3", "A4", "A5", "Logo", "Custom"]);

// --- Computed Properties for Totals ---
const totalJumlahKaos = computed(() => {
  return detailsUkuran.value.reduce((sum, item) => sum + (item.jumlah || 0), 0);
});

const totalTitik = computed(() => {
  const titikCount = detailsTitik.value.filter((d) => d.keterangan).length;
  return totalJumlahKaos.value * titikCount;
});

const isHargaReadonly = computed(() => {
  const autoCalcTypes = ["SD", "DP", "TG", "BR"];
  return autoCalcTypes.includes(form.value.jenisOrderKode);
});

const bordirMultiplier = computed(() => {
  return totalJumlahKaos.value >= 20 ? 100 : 200;
});

// === Perhitungan Luas Bordir ===
const totalLuasBordir = computed(() => {
  if (form.value.jenisOrderKode !== "BR") return 0;
  return detailsTitik.value.reduce((sum, t) => {
    return sum + (t.panjang || 0) * (t.lebar || 0);
  }, 0);
});

// === Perhitungan Luas & Harga Bordir ===
const totalHargaBordir = computed(() => {
  if (form.value.jenisOrderKode !== "BR") return 0;

  const qtyKaos = totalJumlahKaos.value;
  if (qtyKaos <= 0) return 0;

  const mult = bordirMultiplier.value; // Ambil 100 atau 200

  const totalHargaJasaPerKaos = detailsTitik.value.reduce((sum, t) => {
    if (t.panjang && t.lebar) {
      const luas = Number(t.panjang) * Number(t.lebar);
      const hargaKalkulasi = luas * mult;

      // Aturan Minimum: Rp 5.000 per titik lokasi bordir
      return sum + Math.max(hargaKalkulasi, 5000);
    }
    return sum;
  }, 0);

  return totalHargaJasaPerKaos * qtyKaos;
});

// === Perhitungan Luas DTF ===
const totalLuasDtf = computed(() => {
  if (form.value.jenisOrderKode !== "SD") return 0;
  return detailsTitik.value.reduce((sum, t) => {
    return sum + (t.panjang || 0) * (t.lebar || 0);
  }, 0);
});

const totalHargaDtf = computed(() => {
  if (form.value.jenisOrderKode !== "SD") return 0;
  const harga = form.value.customerLevel === "KORPORASI" ? 15 : 25;
  return totalLuasDtf.value * harga * totalJumlahKaos.value;
});

// 1. Hitung batas dinamis Dateline Customer
const maxDatelineDate = computed(() => {
  const startDate = parseISO(form.value.tanggal);
  const prefix = form.value.workshopKode.charAt(0).toUpperCase();

  // Workshop P = H+7, Workshop K = H+3
  const daysToAdd = prefix === "P" ? 7 : 3;
  return format(addDays(startDate, daysToAdd), "yyyy-MM-dd");
});

// 2. Watcher untuk mengunci (Lock) nilai agar tidak melebihi H+3 / H+7
watch(
  () => form.value.datelineCustomer,
  (newVal) => {
    if (newVal && isAfter(parseISO(newVal), parseISO(maxDatelineDate.value))) {
      toast.warning(
        `Dateline Customer workshop ${form.value.workshopKode} maksimal adalah ${maxDatelineDate.value}`
      );
      // Paksa balik ke batas maksimal
      form.value.datelineCustomer = maxDatelineDate.value;
    }
  }
);

const isPanjangLebarReadonly = (item: DetailTitik): boolean => {
  return !!item.sizeCetak && item.sizeCetak !== "Custom";
};

// --- Methods ---
const getFullImageUrl = (path: string | null) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  // Karena kita sudah mengatur proxy /images di Vite (untuk lokal)
  // dan alias /images/ di Nginx (untuk server),
  // kita cukup kembalikan path aslinya saja (misal: /images/K06/K06.SD.2604.0001.jpg).
  // Browser akan cerdas otomatis menyesuaikan domain depannya!
  return path;
};

const addDetailUkuran = () => {
  // Logic lama: ...detailsUkuran.value[detailsUkuran.value.length - 1].ukuran
  // Ubah menjadi:
  if (
    detailsUkuran.value.length === 0 ||
    detailsUkuran.value[detailsUkuran.value.length - 1].ukuran
  ) {
    detailsUkuran.value.push({
      id: Date.now(),
      ukuran: "",
      jumlah: 0,
      harga: 0,
      namaBarang: "",
    });
  }
};
const removeDetailUkuran = (id: number) => {
  detailsUkuran.value = detailsUkuran.value.filter((d) => d.id !== id);
};
const addDetailTitik = () => {
  if (
    detailsTitik.value.length === 0 ||
    detailsTitik.value[detailsTitik.value.length - 1].keterangan
  ) {
    detailsTitik.value.push({
      id: Date.now(),
      keterangan: "",
      sizeCetak: form.value.jenisOrderKode === "SD" ? "Custom" : "",
      panjang: 0,
      lebar: 0,
    });
  }
};
const removeDetailTitik = (id: number) => {
  detailsTitik.value = detailsTitik.value.filter((d) => d.id !== id);
};

const fetchDataForEdit = async (nomor: string) => {
  isRestoringData.value = true;
  isLoading.value = true;
  isInitializing.value = true;
  try {
    const response = await api.get(`/so-dtf-form/${nomor}`);
    const data = response.data;

    // Set form data
    form.value = {
      nomor: data.header.nomor,
      soNomor: data.header.soNomor || "",
      tanggal: format(new Date(data.header.tanggal), "yyyy-MM-dd"),
      tglPengerjaan: format(new Date(data.header.tglPengerjaan), "yyyy-MM-dd"),
      datelineCustomer: format(new Date(data.header.datelineCustomer), "yyyy-MM-dd"),
      salesKode: data.header.salesKode || "",
      salesNama: data.header.salesNama || "",
      customerKode: data.header.customerKode || "",
      customerNama: data.header.customerNama || "",
      customerAlamat: data.header.customerAlamat || "",
      customerLevel: data.header.customerLevel || "",
      jenisOrderKode: data.header.jenisOrderKode || "",
      jenisOrderNama: data.header.jenisOrderNama || "",
      namaDtf: data.header.namaDtf || "",
      kain: data.header.kain || "",
      finishing: data.header.finishing || "",
      desain: data.header.desain || "",
      workshopKode: data.header.workshopKode || "",
      workshopNama: data.header.workshopNama || "",
      keterangan: data.header.keterangan || "",
      hargaPerCm: data.header.hargaPerCm || 0,
      user: data.header.user || "",
      imageUrl: data.header.imageUrl || null,
    };

    // Set preview dari gambar existing (jika ada)
    imagePreview.value = getFullImageUrl(data.header.imageUrl);

    // Clear file input karena ini data existing
    imageFile.value = null;

    detailsTitik.value = data.detailsTitik.map((d: Omit<DetailTitik, "id">, i: number) => ({
      ...d,
      id: Date.now() + i + 1000,
    }));

    detailsUkuran.value = data.detailsUkuran.map((d: DetailUkuran, i: number) => ({
      id: Date.now() + i,
      namaBarang: d.namaBarang,
      ukuran: d.ukuran,
      jumlah: d.jumlah ?? 0,
      harga: d.harga ?? 0,
    }));
    toast.success(`Data untuk ${nomor} berhasil dimuat.`);

    await nextTick();
    markAsSaved();
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;

    console.error("Error loading data:", err);

    // Ambil pesan error dari response API jika ada
    toast.error(err.response?.data?.message || "Gagal memuat data SO DTF");

    router.push("/transaksi/penjualan/dtf/so-dtf");
  } finally {
    isRestoringData.value = false;
    isInitializing.value = false;
    isLoading.value = false;
  }
};

const handleFileSelection = async () => {
  await nextTick();

  const file = imageFile.value;

  // Jika tidak ada file atau file di-clear
  if (!file) {
    imagePreview.value = form.value.imageUrl ? getFullImageUrl(form.value.imageUrl) : null;
    return;
  }

  // Validasi ukuran
  if (file.size > 1024 * 1024) {
    toast.error("Ukuran file tidak boleh lebih dari 1MB.");
    imageFile.value = null;
    return;
  }

  // Validasi tipe
  if (!["image/jpeg", "image/jpg", "image/png", "image/gif"].includes(file.type)) {
    toast.error("Tipe file tidak valid. Gunakan JPG, PNG, atau GIF.");
    imageFile.value = null;
    return;
  }

  // Jika dalam mode edit dan sudah ada nomor, langsung upload
  if (form.value.nomor) {
    await uploadImageToServer(form.value.nomor);
  } else {
    // Jika mode tambah baru, hanya buat preview sementara
    imagePreview.value = URL.createObjectURL(file);
    toast.info("Gambar akan diupload setelah data disimpan");
  }
};

const clearImage = () => {
  // Cleanup blob URL
  if (imagePreview.value && imagePreview.value.startsWith("blob:")) {
    URL.revokeObjectURL(imagePreview.value);
  }

  imagePreview.value = null;
  imageFile.value = null;
  form.value.imageUrl = null;
};

const resetForm = () => {
  form.value = { ...initialFormState };
  detailsUkuran.value = [];
  detailsTitik.value = [];
  imagePreview.value = null;
  imageFile.value = null;

  // Panggil addDetailUkuran agar baris pertama punya struktur yang benar
  addDetailUkuran();

  // Reset titik manual agar aman
  detailsTitik.value.push({
    id: Date.now(),
    keterangan: "",
    sizeCetak: form.value.jenisOrderKode === "SD" ? "Custom" : "",
    panjang: 0,
    lebar: 0,
  });

  markAsSaved();
};

const uploadImageToServer = async (nomor: string): Promise<boolean> => {
  if (!imageFile.value) return true;

  isImageUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("image", imageFile.value);

    const response = await api.post(`/so-dtf-form/upload-image/${nomor}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (response.data.success) {
      form.value.imageUrl = response.data.imageUrl;

      // Cleanup blob URL lama jika ada
      if (imagePreview.value && imagePreview.value.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview.value);
      }

      imagePreview.value = getFullImageUrl(response.data.imageUrl);
      imageFile.value = null; // Clear file input setelah berhasil upload

      toast.success("Gambar berhasil diunggah");
      return true;
    } else {
      throw new Error(response.data.message || "Upload gagal");
    }
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error("Upload gagal: " + (err.response?.data?.message || err.message));
    return false;
  } finally {
    isImageUploading.value = false;
  }
};

const save = async () => {
  // Validasi existing...
  if (!form.value.salesKode) {
    toast.error("Sales harus diisi.");
    return;
  }
  if (!form.value.customerKode) {
    toast.error("Customer harus diisi.");
    return;
  }
  if (!form.value.jenisOrderKode) {
    toast.error("Jenis Order harus diisi.");
    return;
  }

  if (!form.value.soNomor) {
    toast.error("Nomor Surat Pesanan (SO) wajib diisi. Silakan cari terlebih dahulu.");
    return;
  }

  if (!form.value.datelineCustomer) {
    toast.error("Dateline Customer wajib diisi.");
    return;
  }

  // Pastikan Dateline Customer tidak lebih cepat dari Tgl Pengerjaan sistem
  if (isAfter(parseISO(form.value.tglPengerjaan), parseISO(form.value.datelineCustomer))) {
    toast.error(
      `Dateline Customer tidak boleh lebih cepat dari estimasi pengerjaan (${form.value.tglPengerjaan})`
    );
    return;
  }

  const validDetailsUkuran = detailsUkuran.value.filter((d) => d.ukuran && d.jumlah);
  const validDetailsTitik = detailsTitik.value.filter(
    (d) => d.keterangan && d.panjang > 0 && d.lebar > 0
  );

  if (validDetailsUkuran.length === 0) {
    toast.error("Detail Ukuran Kaos harus diisi minimal 1 baris.");
    return;
  }

  if (validDetailsTitik.length === 0) {
    toast.error("Detail Titik Bordir/Cetak harus diisi minimal 1 baris.");
    return;
  }

  for (const item of validDetailsUkuran) {
    if (!item.jumlah || item.jumlah <= 0) {
      toast.error(`Jumlah untuk ukuran '${item.ukuran}' harus lebih dari 0.`);
      return;
    }

    if (!item.harga || item.harga <= 0) {
      toast.error(`Harga untuk ukuran '${item.ukuran}' harus diisi (lebih dari 0).`);
      return;
    }
  }

  for (const item of validDetailsTitik) {
    if (form.value.jenisOrderKode === "TG" && !item.sizeCetak) {
      toast.error(
        `Size Cetak untuk '${item.keterangan}' harus dipilih jika Jenis Order adalah DTG.`
      );
      return;
    }
    if (!item.panjang || item.panjang <= 0) {
      toast.error(`Panjang untuk '${item.keterangan}' harus lebih dari 0.`);
      return;
    }
    if (!item.lebar || item.lebar <= 0) {
      toast.error(`Lebar untuk '${item.keterangan}' harus lebih dari 0.`);
      return;
    }

    if (form.value.jenisOrderKode === "BR") {
      for (const item of detailsTitik.value) {
        if (item.keterangan) {
          const luas = (item.panjang || 0) * (item.lebar || 0);
          if (luas > 0 && luas < 25) {
            // Hanya peringatan, karena sistem sudah otomatis meng-up ke 25 cm2 di hitungan
            toast.info(
              `Titik '${item.keterangan}' di bawah 5x5cm, akan dikenakan tarif minimal Rp 5.000.`
            );
          }
        }
      }

      if (totalJumlahKaos.value < 1) {
        toast.error("Minimal order adalah 1 pcs.");
        return;
      }
    }
  }

  showConfirmation(async () => {
    isSaving.value = true;
    let savedNomor: string = ""; // Deklarasikan di scope yang lebih tinggi

    try {
      // 1. Simpan data utama
      const payload: SoDtfPayload = {
        header: { ...form.value },
        detailsUkuran: validDetailsUkuran,
        detailsTitik: validDetailsTitik,
      };

      if (isEditMode.value) {
        if (!form.value.nomor) {
          toast.error("Nomor tidak ditemukan, tidak bisa update.");
          isSaving.value = false;
          return;
        }
        // TANGKAP RESPON DI SINI
        const response = await api.put(`/so-dtf-form/${form.value.nomor}`, payload);

        // Ambil nomor terbaru dari server (siapa tahu berubah karena ganti jenis order)
        savedNomor = response.data.sd_nomor || form.value.nomor;
        form.value.nomor = savedNomor; // Update UI
      } else {
        const headerWithoutNomor = { ...payload.header };
        Reflect.deleteProperty(headerWithoutNomor, "nomor");

        const cleanPayload = {
          ...payload,
          header: headerWithoutNomor,
        };
        const response = await api.post("/so-dtf-form", cleanPayload);
        savedNomor = response.data.header.sd_nomor;
      }

      toast.success("Data berhasil disimpan.");

      markAsSaved();

      // 2. Upload gambar jika ada
      if (!isEditMode.value && imageFile.value) {
        const uploadSuccess = await uploadImageToServer(savedNomor);
        if (!uploadSuccess) {
          toast.warning("Data berhasil disimpan, tapi gambar gagal diunggah.");
        }
      }

      // --- PERUBAHAN LOGIKA REDIRECT DIMULAI DI SINI ---

      // 3. Alih-alih router.push, tampilkan dialog cetak
      if (savedNomor) {
        printConfirmNomor.value = savedNomor;
        isPrintConfirmVisible.value = true; // Buka dialog baru
      } else {
        // Fallback jika (karena alasan aneh) nomor tidak ada
        toast.error("Gagal mendapatkan nomor, kembali ke daftar.");
        router.push("/transaksi/penjualan/dtf/so-dtf");
      }

      // HAPUS router.push lama:
      // router.push("/transaksi/penjualan/dtf/so-dtf");

      // --- AKHIR PERUBAHAN ---
    } catch (err) {
      const error = err as AxiosError<{ message: string }>;
      console.error("Save error:", error);
      toast.error(error.response?.data?.message || "Gagal menyimpan data.");
    } finally {
      isSaving.value = false;
      // isConfirmDialogVisible ditutup oleh executePendingAction
    }
  }, "Anda yakin ingin menyimpan data ini?");
};

// Fungsi ini dipanggil jika user menekan "Ya, Cetak"
const handlePrintConfirm = () => {
  if (!printConfirmNomor.value) return;

  try {
    // 1. Resolve URL dari named route 'Cetak SO DTF'
    const routeData = router.resolve({
      name: "Cetak SO DTF", // Ini 'name' dari route yang Anda berikan
      params: { nomor: printConfirmNomor.value },
    });

    // 2. Buka URL di tab baru
    window.open(routeData.href, "_blank");
  } catch (error) {
    console.error("Gagal membuka halaman cetak SO DTF:", error);
    toast.error('Gagal membuka halaman cetak. Pastikan route "Cetak SO DTF" ada.');
  } finally {
    // 3. Tutup dialog dan kembali ke halaman browse
    isPrintConfirmVisible.value = false;
    printConfirmNomor.value = "";
    router.push("/transaksi/penjualan/dtf/so-dtf");
  }
};

// Fungsi ini dipanggil jika user menekan "Tidak, Kembali"
const handlePrintCancel = () => {
  isPrintConfirmVisible.value = false;
  printConfirmNomor.value = "";
  // Langsung kembali ke halaman browse
  router.push("/transaksi/penjualan/dtf/so-dtf");
};

const cancel = () => {
  router.push("/transaksi/penjualan/dtf/so-dtf");
};

const fetchSisaKuota = async () => {
  if (form.value.jenisOrderKode !== "SD") {
    sisaKuota.value = 0;
    return;
  }
  try {
    const response = await api.get("/so-dtf-form/sisa-kuota", {
      params: {
        cabang: form.value.workshopKode,
        tanggalKerja: form.value.tglPengerjaan,
      },
    });
    sisaKuota.value = response.data.sisaKuota;
  } catch (error) {
    const err = error as Error;
    toast.error(err.message || "Gagal mengambil data sisa kuota.");
  }
};

const openCustomerSearch = () => {
  isCustomerSearchVisible.value = true;
};
const onCustomerSelected = (customer: {
  kode: string;
  nama: string;
  alamat: string;
  level_nama: string;
}) => {
  form.value.customerKode = customer.kode;
  form.value.customerNama = customer.nama;
  form.value.customerAlamat = customer.alamat;
  form.value.customerLevel = customer.level_nama;
  isCustomerSearchVisible.value = false;
};

const openSalesSearch = () => {
  isSalesSearchVisible.value = true;
};
const onSalesSelected = (sales: { kode: string; nama: string }) => {
  form.value.salesKode = sales.kode;
  form.value.salesNama = sales.nama;
  isSalesSearchVisible.value = false;
};

const openJenisOrderSearch = () => {
  isJenisOrderSearchVisible.value = true;
};
const onJenisOrderSelected = (jenisOrder: { kode: string; nama: string }) => {
  form.value.jenisOrderKode = jenisOrder.kode;
  form.value.jenisOrderNama = jenisOrder.nama;
  isJenisOrderSearchVisible.value = false;

  // 🔥 Jika jenis order SABLON DTF (SD), set default Size Cetak = "Custom"
  if (jenisOrder.kode === "SD") {
    detailsTitik.value.forEach((t) => {
      t.sizeCetak = "Custom";
    });
  }
};

const openJenisKainSearch = () => {
  isJenisKainSearchVisible.value = true;
};
const onJenisKainSelected = (jenisKain: { nama: string }) => {
  form.value.kain = jenisKain.nama;
  isJenisKainSearchVisible.value = false;
};

const openWorkshopSearch = () => {
  isWorkshopSearchVisible.value = true;
};
const onWorkshopSelected = (workshop: { kode: string; nama: string }) => {
  form.value.workshopKode = workshop.kode;
  form.value.workshopNama = workshop.nama;
  isWorkshopSearchVisible.value = false;
};

const onSizeCetakChange = async (item: DetailTitik, index: number) => {
  addDetailTitik();

  if (!item.sizeCetak || !form.value.jenisOrderKode) return;

  if (item.sizeCetak === "Custom") {
    detailsTitik.value[index].panjang = 0;
    detailsTitik.value[index].lebar = 0;
    return;
  }

  try {
    const response = await api.get("/so-dtf-form/lookup/ukuran-sodtf-detail", {
      params: { jenisOrder: form.value.jenisOrderKode, ukuran: item.sizeCetak },
    });

    if (response.data) {
      detailsTitik.value[index].panjang = response.data.panjang;
      detailsTitik.value[index].lebar = response.data.lebar;
    }
  } catch (error) {
    console.error("Gagal mengambil detail ukuran SODTF:", error);
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

const fetchUkuranKaosList = async () => {
  // <-- TAMBAHKAN FUNGSI INI
  try {
    const response = await api.get("/so-dtf-form/lookup/ukuran-kaos");
    ukuranKaosList.value = response.data;
  } catch (error) {
    const err = error as Error;
    toast.error(err.message || "Gagal mengambil daftar ukuran kaos.");
  }
};

const fetchSizeCetakList = async (jenisOrder: string) => {
  if (!jenisOrder) {
    sizeCetakList.value = ["Custom"]; // Default hanya Custom jika belum pilih jenis order
    return;
  }
  try {
    const response = await api.get("/so-dtf-form/lookup/size-cetak", {
      params: { jenisOrder },
    });
    // Tambahkan "Custom" di akhir list
    sizeCetakList.value = [...response.data, "Custom"];
  } catch (error) {
    const err = error as Error;
    toast.error(err.message || "Gagal memuat daftar size cetak.");
    sizeCetakList.value = ["Custom"];
  }
};

const getHargaDTG = async () => {
  try {
    const response = await api.post("/so-dtf-form/calculate-dtg-price", {
      detailsTitik: detailsTitik.value,
      totalJumlahKaos: totalJumlahKaos.value,
    });
    return response.data.harga || 0;
  } catch (error) {
    const err = error as Error;
    toast.error(err.message || "Gagal menghitung harga DTG.");
    return 0;
  }
};

/**
 * Fungsi utama untuk menghitung semua harga.
 */
const calculatePrices = async () => {
  if (isEditMode.value && isRestoringData.value) return;

  if (isLoading.value || isInitializing.value) return;

  if (totalJumlahKaos.value <= 0) {
    // Jika tidak ada jumlah, reset semua harga
    form.value.hargaPerCm = 0;
    detailsUkuran.value.forEach((item) => (item.harga = 0));
    return;
  }

  const jenisOrder = form.value.jenisOrderKode;
  let hargaPerCm = 0;
  let hargaSatuan = 0;

  // Menghitung total luas dari grid kedua (Titik Bordir/Cetak)
  const totalLuas = detailsTitik.value.reduce((sum, item) => {
    return sum + (item.panjang || 0) * (item.lebar || 0);
  }, 0);

  // Menentukan harga berdasarkan Jenis Order (mirip blok if/else if di Delphi)
  switch (jenisOrder) {
    case "SB": // Sablon Plastisol (Minimal 20 Pcs)
      detailsTitik.value.forEach((t) => {
        if (t.sizeCetak === "A3") hargaSatuan += 35000;
        else if (t.sizeCetak === "A4") hargaSatuan += 20000;
        else if (t.sizeCetak === "A5") hargaSatuan += 10000;
      });
      break;
    case "SD": // Sablon DTF
      hargaPerCm = form.value.customerLevel === "KORPORASI" ? 15 : 25;
      hargaSatuan = totalJumlahKaos.value > 0 ? totalHargaDtf.value / totalJumlahKaos.value : 0;
      break;
    case "DP": // DTF Premium
      hargaPerCm = 35;
      hargaSatuan = totalLuas * hargaPerCm;
      break;
    case "BR": // BORDIR
      hargaPerCm = bordirMultiplier.value; // Dinamis: 100 atau 200
      hargaSatuan = totalJumlahKaos.value > 0 ? totalHargaBordir.value / totalJumlahKaos.value : 0;
      break;
    case "TG": // DTG
      hargaPerCm = 0;
      hargaSatuan = await getHargaDTG(); // Memanggil fungsi placeholder
      break;
    default:
      hargaPerCm = 0;
      hargaSatuan = 0;
      break;
  }

  // Update state di form
  form.value.hargaPerCm = hargaPerCm;

  // Update semua baris di grid pertama dengan harga satuan yang sama
  detailsUkuran.value.forEach((item) => {
    if (item.ukuran && item.jumlah) {
      item.harga = hargaSatuan;
    } else {
      item.harga = 0;
    }
  });
};

const openSoSearch = () => {
  isSoSearchVisible.value = true;
};

const onSoSelected = async (selected: SoSelected, targetLineId: string | null = null) => {
  try {
    const nomorSo = selected.nomor || selected.Nomor || selected.so_nomor || selected.soNomor;

    if (!nomorSo) {
      toast.error("Nomor SO tidak ditemukan.");
      return;
    }

    const res = await api.get(`/so-dtf-form/so-detail/${nomorSo}`);
    const soData = res.data;

    // ==============================
    // 1. NOMOR SO
    // ==============================
    form.value.soNomor = soData.header.nomor;

    // ==============================
    // 2. CUSTOMER
    // ==============================
    form.value.customerKode = soData.header.customerKode;
    form.value.customerNama = soData.header.customerNama;
    form.value.customerAlamat = soData.header.customerAlamat;
    form.value.customerLevel = soData.header.levelNama;

    // ==============================
    // 3. SALES
    // ==============================
    form.value.salesKode = soData.header.salesKode || form.value.salesKode;
    form.value.salesNama = soData.header.salesNama || form.value.salesNama;

    // ==============================
    // 4. JENIS ORDER
    // ==============================
    form.value.jenisOrderKode = soData.header.jenisOrderKode || "";
    form.value.jenisOrderNama = soData.header.jenisOrderNama || "";

    // ==============================
    // 5. NAMA DTF
    // ==============================
    form.value.namaDtf = soData.header.namaDtf || "";

    // Harga/cm2 (logic asli)
    if (form.value.jenisOrder) {
      const hres = await api.get("/so-dtf-form/lookup/jenis-order-harga", {
        params: { kode: form.value.jenisOrder },
      });
      form.value.hargaPerCm = hres.data.harga || 0;
    } else {
      form.value.hargaPerCm = 0;
    }

    // ============================================
    // 6. DETAIL CUSTOM SAJA (LOGIC ASLI)
    // ============================================
    // --- 2. FILTERING DETAIL ITEM ---
    // Cari item custom yang spesifik berdasarkan targetLineId
    let customItems: SoItem[] = soData.items.filter((x: SoItem) => x.isCustomOrder);

    if (targetLineId) {
      // Filter agar hanya mengambil baris yang kita klik tadi di halaman SO
      // Catatan: Pastikan backend mengirimkan field 'id' atau 'sod_idrec' yang sinkron
      customItems = customItems.filter((x: SoItem) => String(x.id) === String(targetLineId));
    }

    // Jika setelah difilter item tidak ditemukan (mungkin SO belum disave ulang)
    if (customItems.length === 0) {
      toast.warning("Baris item custom tidak ditemukan. Memuat semua item custom.");
      customItems = soData.items.filter((x: SoItem) => x.isCustomOrder);
    }

    // ---- Grid Ukuran ----
    detailsUkuran.value = [];
    customItems.forEach((item: SoItem, idx: number) => {
      form.value.namaDtf = item.sod_custom_nama || item.nama;
      item.ukuranKaos.forEach((u, i2: number) => {
        detailsUkuran.value.push({
          // [PERBAIKAN] Gunakan Math.random() agar ID benar-benar Unik!
          id: Date.now() + Math.floor(Math.random() * 1000000),
          namaBarang:
            item.sourceItems && item.sourceItems.length > 0
              ? item.sourceItems[0].nama
              : item.sod_custom_nama || item.nama,
          ukuran: u.ukuran,
          jumlah: u.jumlah,
          harga: u.harga,
        });
      });
    });
    addDetailUkuran();

    // ---- Grid Titik Cetak ----
    detailsTitik.value = [];
    customItems.forEach((item: SoItem, idx: number) => {
      item.titikCetak.forEach((t, i2: number) => {
        detailsTitik.value.push({
          // [PERBAIKAN] Gunakan Math.random() agar ID benar-benar Unik!
          id: Date.now() + Math.floor(Math.random() * 1000000),
          keterangan: t.keterangan,
          sizeCetak: t.sizeCetak,
          panjang: t.panjang,
          lebar: t.lebar,
        });
      });
    });
    addDetailTitik();

    toast.success(`SO ${nomorSo} berhasil dimuat.`);
  } catch (err) {
    console.error(err);
    toast.error("Gagal load SO.");
  }
};

// const cleanupPreviewUrl = () => {
//   if (imagePreview.value && imagePreview.value.startsWith('blob:')) {
//     URL.revokeObjectURL(imagePreview.value);
//   }
// };

watch(
  () => [form.value.tglPengerjaan, form.value.jenisOrderKode],
  () => {
    fetchSisaKuota();
  },
  { immediate: true }
);

watch(
  () => form.value.jenisOrderKode,
  (newJenisOrder, oldJenisOrder) => {
    // Selalu ambil daftar size cetak yang baru
    fetchSizeCetakList(newJenisOrder);

    // HANYA kosongkan isian jika user secara manual mengubah jenis order
    // (yaitu, saat nilai lama tidak kosong dan tidak dalam mode edit)
    if (isLoading.value) return;
    if (!isEditMode.value && oldJenisOrder) {
      detailsTitik.value.forEach((item) => (item.sizeCetak = ""));
    }
  }
);

watch(
  [detailsUkuran, detailsTitik, () => form.value.jenisOrderKode, () => form.value.customerLevel],
  async () => {
    if (isLoading.value || isInitializing.value || isRestoringData.value) return;
    await calculatePrices();
  },
  { deep: true }
);

// --- WATCHERS (UNSAVED CHANGES) ---
watch(
  [form, detailsUkuran, detailsTitik],
  () => {
    // Abaikan jika sedang loading awal, restoring data, atau proses simpan
    if (isLoading.value || isSaving.value || isRestoringData.value || isInitializing.value) return;

    // Cek apakah form "kotor"
    // 1. Header: Customer atau Sales dipilih
    const hasHeader = form.value.customerKode !== "" || form.value.salesKode !== "";

    // 2. Details Ukuran: Ada data selain baris kosong default
    // (Cek apakah ada ukuran yang diisi atau jumlah > 0)
    const hasUkuran = detailsUkuran.value.some((d) => d.ukuran !== "" || (d.jumlah || 0) > 0);

    // 3. Details Titik: Ada keterangan diisi
    const hasTitik = detailsTitik.value.some((d) => d.keterangan !== "");

    if (hasHeader || hasUkuran || hasTitik) {
      uiStore.setUnsavedChanges(true);
    } else {
      // Jika kembali kosong bersih
      uiStore.setUnsavedChanges(false);
    }
  },
  { deep: true }
);

onMounted(async () => {
  markAsSaved();

  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(
      `Anda tidak memiliki izin untuk ${
        requiredPermission.value === "insert" ? "membuat" : "mengubah"
      } data.`
    );
    router.back();
    return;
  }

  const nomor = route.params.nomor as string;
  // 1. Tangkap parameter refSo dari URL
  const refSo = route.query.refSo as string;
  const lineId = route.query.lineId as string;

  if (nomor) {
    fetchDataForEdit(nomor);
  } else if (refSo) {
    isLoading.value = true;
    // Kirim lineId ke fungsi penarik data
    await onSoSelected({ nomor: refSo }, typeof lineId === "string" ? lineId : null);
    isLoading.value = false;
  } else {
    // Mode Create Baru kosong
    resetForm();
    isLoading.value = false;
  }

  fetchUkuranKaosList();
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-printer-3d-nozzle">
    <template #header-actions>
      <v-btn
        size="small"
        color="primary"
        @click="save"
        :loading="isSaving"
        prepend-icon="mdi-content-save"
        >Simpan</v-btn
      >
      <v-btn
        v-if="!isEditMode"
        size="small"
        @click="
          showConfirmation(resetForm, 'Anda yakin ingin membatalkan? Semua isian akan dikosongkan.')
        "
        prepend-icon="mdi-refresh"
      >
        Batal
      </v-btn>
      <v-btn
        size="small"
        @click="
          showConfirmation(
            cancel,
            'Anda yakin ingin menutup form? Perubahan yang belum disimpan akan hilang.'
          )
        "
        prepend-icon="mdi-close"
      >
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container" v-if="!isLoading">
      <!-- LEFT COLUMN -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6"
              ><v-text-field
                label="Nomor"
                :model-value="form.nomor || '<Otomatis>'"
                readonly
                variant="filled"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tanggal"
                v-model="form.tanggal"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl Pengerjaan"
                v-model="form.tglPengerjaan"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6">
              <v-text-field
                label="Dateline Customer (Wajib)"
                v-model="form.datelineCustomer"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
                placeholder="Pilih tanggal"
                :max="maxDatelineDate"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Ambil dari Surat Pesanan (SO)"
                readonly
                prepend-inner-icon="mdi-magnify"
                placeholder="Klik untuk mencari..."
                v-model="form.soNomor"
                variant="outlined"
                density="compact"
                hide-details
                @click="openSoSearch"
              />
            </v-col>
            <v-col cols="6"
              ><v-text-field
                label="Sales"
                :model-value="form.salesKode ? `${form.salesKode} - ${form.salesNama}` : ''"
                readonly
                @click="openSalesSearch"
                @keydown.f1.prevent="openSalesSearch"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="F1 atau klik..."
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Customer"
                :model-value="
                  form.customerKode ? `${form.customerKode} - ${form.customerNama}` : ''
                "
                readonly
                @click="openCustomerSearch"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="Klik untuk mencari..."
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Level"
                :model-value="form.customerLevel"
                readonly
                filled
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Sisa Kuota"
                :model-value="sisaKuota"
                readonly
                filled
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="8">
              <v-text-field
                label="Jenis Order"
                :model-value="
                  form.jenisOrderKode ? `${form.jenisOrderKode} - ${form.jenisOrderNama}` : ''
                "
                readonly
                @click="openJenisOrderSearch()"
                @keydown.f1.prevent="openJenisOrderSearch()"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="F1 atau klik untuk mencari..."
              />
            </v-col>
            <v-col cols="4"
              ><v-text-field
                label="Harga/cm2"
                :model-value="form.hargaPerCm"
                readonly
                filled
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Nama DTF"
                v-model="form.namaDtf"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Kain"
                :model-value="form.kain"
                @click="openJenisKainSearch"
                @keydown.f1.prevent="openJenisKainSearch"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="F1 atau klik..."
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Finishing"
                v-model="form.finishing"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Bag. Desain"
                v-model="form.desain"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Workshop"
                :model-value="
                  form.workshopKode ? `${form.workshopKode} - ${form.workshopNama}` : ''
                "
                @click="openWorkshopSearch"
                @keydown.f1.prevent="openWorkshopSearch"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="F1 atau klik..."
                readonly
            /></v-col>
          </v-row>
        </div>
      </div>

      <!-- RIGHT COLUMN -->
      <div class="right-column">
        <v-row dense>
          <!-- KOLOM KIRI: TABEL-TABEL -->
          <v-col cols="12" md="6">
            <!-- Tabel Ukuran Kaos -->
            <div class="desktop-form-section mb-4">
              <div class="d-flex align-center mb-2">
                <span class="text-subtitle-2">Ukuran Kaos</span>

                <v-spacer />

                <!-- TOMBOL TAMBAH UKURAN -->
                <v-btn
                  icon="mdi-plus"
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  class="me-2"
                  @click="addDetailUkuran"
                  title="Tambah Ukuran Kaos"
                ></v-btn>

                <v-text-field
                  label="Total Jumlah"
                  :model-value="totalJumlahKaos"
                  readonly
                  filled
                  density="compact"
                  hide-details
                  style="max-width: 120px"
                />
              </div>
              <v-table density="compact" class="desktop-table header-browse-blue">
                <thead>
                  <tr>
                    <th style="width: 40px">#</th>
                    <th>Nama Barang</th>
                    <th>Ukuran</th>
                    <th class="text-end" style="width: 60px">Jumlah</th>
                    <th class="text-end" style="width: 60px">Harga/Pcs</th>
                    <th style="width: 40px"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in detailsUkuran" :key="item.id">
                    <td class="pt-2 text-center">{{ index + 1 }}</td>
                    <td>
                      <v-text-field
                        v-model="item.namaBarang"
                        variant="underlined"
                        density="compact"
                        hide-details
                      />
                    </td>
                    <td>
                      <v-combobox
                        v-model="item.ukuran"
                        :items="ukuranKaosList"
                        @change="!isEditMode && addDetailUkuran()"
                        variant="underlined"
                        density="compact"
                        hide-details
                      />
                    </td>
                    <td>
                      <v-text-field
                        v-model.number="item.jumlah"
                        type="number"
                        variant="underlined"
                        density="compact"
                        hide-details
                        class="text-end"
                        min="0"
                      />
                    </td>
                    <td>
                      <v-text-field
                        v-model.number="item.harga"
                        type="number"
                        variant="underlined"
                        density="compact"
                        hide-details
                        class="text-end"
                        :readonly="isHargaReadonly"
                      />
                    </td>
                    <td>
                      <v-btn
                        v-if="index < detailsUkuran.length - 1"
                        icon="mdi-delete"
                        size="x-small"
                        variant="text"
                        color="error"
                        @click="removeDetailUkuran(item.id)"
                      />
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>

            <!-- Tabel Titik Bordir/Cetak -->
            <div class="desktop-form-section">
              <div class="d-flex align-center mb-2">
                <span class="text-subtitle-2">Titik Bordir/Cetak</span>

                <v-spacer />

                <!-- TOMBOL TAMBAH TITIK CETAK -->
                <v-btn
                  icon="mdi-plus"
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  class="me-2"
                  @click="addDetailTitik"
                  title="Tambah Titik Cetak"
                ></v-btn>

                <v-text-field
                  label="Total Titik"
                  :model-value="totalTitik"
                  readonly
                  filled
                  density="compact"
                  hide-details
                  style="max-width: 120px"
                />
              </div>
              <v-table density="compact" class="desktop-table header-browse-blue">
                <thead>
                  <tr>
                    <th style="width: 40px">#</th>
                    <th>Keterangan</th>
                    <th style="width: 100px">Size Cetak</th>
                    <th class="text-end" style="width: 70px">P(cm)</th>
                    <th class="text-end" style="width: 70px">L(cm)</th>
                    <th style="width: 40px"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in detailsTitik" :key="item.id">
                    <td class="pt-2 text-center">{{ index + 1 }}</td>
                    <td>
                      <v-text-field
                        v-model="item.keterangan"
                        @change="!isEditMode && addDetailTitik()"
                        variant="underlined"
                        density="compact"
                        hide-details
                      />
                    </td>
                    <td>
                      <v-combobox
                        v-model="item.sizeCetak"
                        :items="sizeCetakList"
                        @update:model-value="() => onSizeCetakChange(item, index)"
                        variant="underlined"
                        density="compact"
                        hide-details
                      />
                    </td>
                    <td>
                      <v-text-field
                        v-model.number="item.panjang"
                        type="number"
                        variant="underlined"
                        density="compact"
                        hide-details
                        class="text-end"
                        :readonly="isPanjangLebarReadonly(item)"
                        :class="{ 'field-readonly': isPanjangLebarReadonly(item) }"
                      />
                    </td>
                    <td>
                      <v-text-field
                        v-model.number="item.lebar"
                        type="number"
                        variant="underlined"
                        density="compact"
                        hide-details
                        class="text-end"
                        :readonly="isPanjangLebarReadonly(item)"
                        :class="{ 'field-readonly': isPanjangLebarReadonly(item) }"
                      />
                    </td>
                    <td>
                      <v-btn
                        v-if="index < detailsTitik.length - 1"
                        icon="mdi-delete"
                        size="x-small"
                        variant="text"
                        color="error"
                        @click="removeDetailTitik(item.id)"
                      />
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
            <div
              class="desktop-form-section mt-4"
              v-if="['BR', 'SD'].includes(form.jenisOrderKode)"
            >
              <div class="perhitungan-box">
                <v-row dense>
                  <!-- Bordir -->
                  <v-col cols="12" v-if="form.jenisOrderKode === 'BR'">
                    <v-alert density="compact" variant="tonal" type="info" class="mb-2">
                      Perhitungan Bordir
                    </v-alert>

                    <v-text-field
                      label="Luas Bordir /Cm² (Per Titik)"
                      :model-value="totalLuasBordir"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                      class="mb-2"
                    />

                    <v-text-field
                      label="Biaya /Cm²"
                      :model-value="bordirMultiplier"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                      class="mb-2"
                    />

                    <v-text-field
                      label="Total Harga Bordir"
                      :model-value="totalHargaBordir"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                  <!-- DTF -->
                  <v-col cols="12" v-if="form.jenisOrderKode === 'SD'">
                    <v-alert density="compact" variant="tonal" type="info" class="mb-2">
                      Perhitungan DTF
                    </v-alert>

                    <v-text-field
                      label="Luas DTF /Cm²"
                      :model-value="totalLuasDtf"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                      class="mb-2"
                    />

                    <v-text-field
                      label="Biaya /Cm²"
                      :model-value="form.customerLevel === 'KORPORASI' ? 15 : 25"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                      class="mb-2"
                    />

                    <v-text-field
                      label="Total Harga DTF"
                      :model-value="totalHargaDtf"
                      readonly
                      variant="filled"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                </v-row>
              </div>
            </div>
          </v-col>

          <!-- KOLOM KANAN: GAMBAR & KETERANGAN -->
          <v-col cols="12" md="6">
            <div class="desktop-form-section mb-4">
              <div class="image-upload-section">
                <!-- File Input -->
                <div class="d-flex align-center ga-2 mb-3">
                  <v-file-input
                    v-model="imageFile"
                    label="Upload Gambar (Max 1MB)"
                    variant="outlined"
                    density="compact"
                    prepend-icon="mdi-camera"
                    hide-details
                    clearable
                    accept="image/jpeg,image/png,image/jpg,image/gif"
                    :loading="isImageUploading"
                    :disabled="isImageUploading"
                    @update:model-value="handleFileSelection"
                  />
                  <v-btn
                    @click="clearImage"
                    :disabled="!imagePreview || isImageUploading"
                    icon="mdi-delete"
                    size="small"
                    variant="tonal"
                    color="error"
                    title="Hapus Gambar"
                  />
                </div>

                <!-- Image Preview -->
                <div class="image-preview-container">
                  <div v-if="imagePreview" class="position-relative">
                    <v-img
                      :src="imagePreview"
                      height="200"
                      aspect-ratio="16/9"
                      cover
                      class="border rounded elevation-1 cursor-pointer"
                      @click="imagePreview ? (isImageFullscreenVisible = true) : null"
                      title="Klik untuk memperbesar"
                    >
                      <v-overlay
                        v-if="isImageUploading"
                        contained
                        persistent
                        class="d-flex align-center justify-center"
                      >
                        <div class="text-center text-white">
                          <v-progress-circular indeterminate color="primary" size="40" />
                          <div class="mt-2">Mengunggah...</div>
                        </div>
                      </v-overlay>
                    </v-img>

                    <!-- Image Info -->
                    <div class="mt-2">
                      <v-chip v-if="imageFile" size="small" color="warning" variant="tonal">
                        <v-icon start size="small">mdi-clock-outline</v-icon>
                        Belum tersimpan
                      </v-chip>
                      <v-chip
                        v-else-if="form.imageUrl && imagePreview"
                        size="small"
                        color="success"
                        variant="tonal"
                      >
                        <v-icon start size="small">mdi-check</v-icon>
                        Tersimpan di server
                      </v-chip>
                    </div>
                  </div>

                  <!-- Placeholder -->
                  <div
                    v-else
                    class="border rounded d-flex align-center justify-center bg-grey-lighten-4"
                    style="height: 200px"
                  >
                    <div class="text-center text-grey">
                      <v-icon size="48" class="mb-2">mdi-image-outline</v-icon>
                      <div class="text-caption">Tidak ada gambar</div>
                      <div class="text-caption">Pilih file untuk upload otomatis</div>
                    </div>
                  </div>
                </div>

                <!-- Upload Progress -->
                <div v-if="isImageUploading" class="mt-2">
                  <v-progress-linear indeterminate color="primary" height="2" />
                  <div class="text-caption text-center mt-1">Sedang mengunggah gambar...</div>
                </div>
              </div>
            </div>

            <!-- Keterangan di bawah gambar -->
            <div class="desktop-form-section">
              <v-textarea
                label="Keterangan"
                v-model="form.keterangan"
                rows="6"
                variant="outlined"
                density="compact"
                hide-details
              />
            </div>
          </v-col>
        </v-row>
      </div>
    </div>
    <v-skeleton-loader v-else type="article, actions"></v-skeleton-loader>

    <!-- Modals -->
    <CustomerSearchModal
      v-if="isCustomerSearchVisible"
      :gudang="form.workshopKode"
      @close="isCustomerSearchVisible = false"
      @customer-selected="onCustomerSelected"
    />
    <SalesSearchModal
      v-if="isSalesSearchVisible"
      @close="isSalesSearchVisible = false"
      @sales-selected="onSalesSelected"
    />
    <JenisOrderSearchModal
      v-if="isJenisOrderSearchVisible"
      @close="isJenisOrderSearchVisible = false"
      @jenis-order-selected="onJenisOrderSelected"
    />
    <JenisKainSearchModal
      v-if="isJenisKainSearchVisible"
      @close="isJenisKainSearchVisible = false"
      @jenis-kain-selected="onJenisKainSelected"
    />
    <WorkshopSearchModal
      v-if="isWorkshopSearchVisible"
      @close="isWorkshopSearchVisible = false"
      @workshop-selected="onWorkshopSelected"
    />
    <SoSearchModalForInvoice
      v-if="isSoSearchVisible"
      :cabang="authStore.user?.cabang || ''"
      @close="isSoSearchVisible = false"
      @so-selected="onSoSelected"
      mode="dtf"
    />

    <!-- Fullscreen Image Modal -->
    <v-dialog v-model="isImageFullscreenVisible" max-width="90vw">
      <v-card>
        <v-toolbar density="compact" color="primary" dark>
          <v-toolbar-title>
            <v-icon start>mdi-image</v-icon>
            Preview Gambar - {{ form.nomor || "SO Baru" }}
          </v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" @click="isImageFullscreenVisible = false" variant="text" />
        </v-toolbar>

        <v-card-text class="pa-4 bg-grey-lighten-4">
          <div class="d-flex justify-center align-center" style="min-height: 60vh">
            <v-img
              :src="imagePreview || undefined"
              max-height="80vh"
              max-width="100%"
              contain
              class="rounded elevation-2"
            />
          </div>
        </v-card-text>

        <v-card-actions class="justify-space-between pa-4">
          <div>
            <v-chip v-if="imageFile" size="small" color="warning" variant="tonal">
              <v-icon start size="small">mdi-clock-outline</v-icon>
              Belum tersimpan
            </v-chip>
            <v-chip v-else-if="form.imageUrl" size="small" color="success" variant="tonal">
              <v-icon start size="small">mdi-check-circle</v-icon>
              Tersimpan di server
            </v-chip>
          </div>
          <v-btn
            color="primary"
            @click="isImageFullscreenVisible = false"
            prepend-icon="mdi-close"
            variant="tonal"
          >
            Tutup
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirmation Dialog -->
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

    <v-dialog v-model="isPrintConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold"> Simpan Berhasil </v-card-title>
        <v-card-text>
          SO DTF {{ printConfirmNomor }} berhasil disimpan. <br /><br />
          Apakah Anda ingin mencetak dokumen ini sekarang?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="handlePrintCancel">
            Tidak, Kembali
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="handlePrintConfirm"> Ya, Cetak </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.image-notes-section {
  flex-shrink: 0;
}

.text-end :deep(input) {
  text-align: right;
}

.field-disabled {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  pointer-events: none;
}

.field-readonly {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

.field-readonly :deep(input) {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.cursor-pointer {
  cursor: pointer;
  transition: opacity 0.2s;
}

.cursor-pointer:hover {
  opacity: 0.9;
}

.image-upload-section {
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  padding: 16px;
}

.image-preview-container {
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.image-preview-container .v-img {
  transition: transform 0.2s;
}

.image-preview-container:hover .v-img {
  transform: scale(1.01);
}

.image-preview-container .bg-grey-lighten-4 {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

:deep(.bg-grey-lighten-4) {
  background-color: rgb(var(--v-theme-background)) !important;
}

.cursor-pointer {
  cursor: pointer;
  transition: opacity 0.2s;
}

.cursor-pointer:hover {
  opacity: 0.9;
}

.perhitungan-box.compact {
  max-width: 260px;
  margin: 0 auto;
  padding: 12px;
  border-radius: 12px;

  background-color: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.25);
}

.perhitungan-box.compact .v-text-field {
  max-width: 200px;
  margin-left: auto;
  margin-right: auto;
}

.desktop-form-section {
  background-color: rgb(var(--v-theme-surface));
}
</style>

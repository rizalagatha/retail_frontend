<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { format } from "date-fns";
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
  soNomor: string;
  tanggal: string;
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
  revisiList: RevisiItem[];
  noSoDtfRiil: string;
  [key: string]: unknown;
}
interface DetailUkuran {
  id: number;
  ukuran: string;
  jumlah: number;
  harga: number;
  namaBarang: string;
}
interface DetailTitik {
  id: number;
  keterangan: string;
  sizeCetak: string;
  panjang: number;
  lebar: number;
}
interface SoDtfPayload {
  header: FormHeader;
  detailsUkuran: DetailUkuran[];
  detailsTitik: DetailTitik[];
  newRevision?: { isAdding: boolean; catatan: string };
}
interface SoItem {
  id: string | number;
  isCustomOrder: boolean;
  nama: string;
  sod_custom_nama?: string;
  sourceItems?: { nama: string }[];
  ukuranKaos: { ukuran: string; jumlah: number; harga: number }[];
  titikCetak: { keterangan: string; sizeCetak: string; panjang: number; lebar: number }[];
}
type SoSelected = {
  nomor?: string;
  Nomor?: string;
  so_nomor?: string;
  soNomor?: string;
};

interface RevisiItem {
  tr_id: number;
  tr_revisi_ke: number;
  tanggal_revisi: string;
  tr_catatan: string;
  tr_gambar: string | null;
}

// --- State & Dependencies ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "61";

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() =>
  isEditMode.value ? `Ubah SO DTF Trial: ${form.value.nomor}` : "Buat SO DTF Trial Baru"
);
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));

const isLoading = ref(true);
const isSaving = ref(false);
const isInitializing = ref(false);
const isRestoringData = ref(false);
const isReadOnly = computed(() => route.query.readonly === "true");

const initialFormState = {
  nomor: null,
  soNomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
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
  revisiList: [],
  noSoDtfRiil: "",
};

const form = ref<FormHeader>({ ...initialFormState });
const detailsUkuran = ref<DetailUkuran[]>([]);
const detailsTitik = ref<DetailTitik[]>([]);
const imagePreview = ref<string | null>(null);
const imageFile = ref<File | null>(null);
const isImageUploading = ref(false);
const isImageFullscreenVisible = ref(false);
const isConfirmDialogVisible = ref(false);
const confirmText = ref("");
const pendingAction = ref<(() => void) | null>(null);
const isPrintConfirmVisible = ref(false);
const printConfirmNomor = ref("");
const ukuranKaosList = ref<string[]>([]);
const sizeCetakList = ref(["A3", "A4", "A5", "Logo", "Custom"]);

// --- Modal Visibility State ---
const isCustomerSearchVisible = ref(false);
const isSalesSearchVisible = ref(false);
const isJenisOrderSearchVisible = ref(false);
const isJenisKainSearchVisible = ref(false);
const isWorkshopSearchVisible = ref(false);
const isSoSearchVisible = ref(false); // Modal Pencarian SO

// --- Computed Properties for Totals ---
const totalJumlahKaos = computed(() => 1);
const totalTitik = computed(() => detailsTitik.value.filter((d) => d.keterangan).length * 1);
const isHargaReadonly = computed(() =>
  ["SD", "DP", "TG", "BR"].includes(form.value.jenisOrderKode)
);
const bordirMultiplier = computed(() => 200);

const totalLuasBordir = computed(() => {
  if (form.value.jenisOrderKode !== "BR") return 0;
  return detailsTitik.value
    .filter((t) => t.keterangan)
    .reduce((sum, t) => sum + (t.panjang || 0) * (t.lebar || 0), 0);
});
const totalHargaBordir = computed(() => {
  if (form.value.jenisOrderKode !== "BR") return 0;
  const mult = bordirMultiplier.value;
  const totalHargaJasaPerKaos = detailsTitik.value.reduce((sum, t) => {
    if (t.panjang && t.lebar) return sum + Math.max(t.panjang * t.lebar * mult, 5000);
    return sum;
  }, 0);
  return totalHargaJasaPerKaos * 1; // Dikali 1 Pcs
});

const totalLuasDtf = computed(() => {
  if (form.value.jenisOrderKode !== "SD") return 0;
  return detailsTitik.value
    .filter((t) => t.keterangan)
    .reduce((sum, t) => sum + (t.panjang || 0) * (t.lebar || 0), 0);
});

const totalHargaDtf = computed(() => {
  if (form.value.jenisOrderKode !== "SD") return 0;
  const harga = form.value.customerLevel === "KORPORASI" ? 15 : 25;
  return totalLuasDtf.value * harga * 1; // Dikali 1 pcs
});

const isPanjangLebarReadonly = (item: DetailTitik): boolean =>
  !!item.sizeCetak && item.sizeCetak !== "Custom";

// --- STATE REVISI & FULLSCREEN ---
const isAddingRevision = ref(false);
const newRevisionCatatan = ref("");
const fullscreenImageSrc = ref("");

// --- Methods ---
const getFullImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http")) return imagePath;

  return imagePath;
};

const addDetailUkuran = () => {
  // Karena trial dilock 1 pcs, cegah tambah baris kalau sudah ada
  if (detailsUkuran.value.length === 0) {
    detailsUkuran.value.push({
      id: Date.now(),
      ukuran: "",
      jumlah: 1, // [PERBAIKAN] Langsung isi 1, bukan 0
      harga: 0,
      namaBarang: "",
    });
  }
};
const removeDetailUkuran = (id: number) =>
  (detailsUkuran.value = detailsUkuran.value.filter((d) => d.id !== id));

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
const removeDetailTitik = (id: number) =>
  (detailsTitik.value = detailsTitik.value.filter((d) => d.id !== id));

const fetchDataForEdit = async (nomor: string) => {
  isRestoringData.value = true;
  isLoading.value = true;
  isInitializing.value = true;
  try {
    const response = await api.get(`/so-dtf-trial-form/${nomor}`);
    const data = response.data;

    form.value = {
      nomor: data.header.nomor,
      soNomor: data.header.soNomor || "",
      tanggal: format(new Date(data.header.tanggal), "yyyy-MM-dd"),
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
      revisiList: data.header.revisiList || [],
      noSoDtfRiil: data.header.noSoDtfRiil || "",
    };

    imagePreview.value = getFullImageUrl(data.header.imageUrl);
    imageFile.value = null;

    detailsTitik.value = data.detailsTitik.map((d: Omit<DetailTitik, "id">, i: number) => ({
      ...d,
      id: Date.now() + i + 1000,
    }));
    if (data.detailsUkuran && data.detailsUkuran.length > 0) {
      const d = data.detailsUkuran[0];
      detailsUkuran.value = [
        {
          id: Date.now(),
          namaBarang: d.namaBarang,
          ukuran: d.ukuran,
          jumlah: 1,
          harga: d.harga ?? 0,
        },
      ];
    } else {
      detailsUkuran.value = [{ id: Date.now(), namaBarang: "", ukuran: "", jumlah: 1, harga: 0 }];
    }
    toast.success(`Data untuk ${nomor} berhasil dimuat.`);

    await nextTick();
    markAsSaved();
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data SO DTF Trial");
    router.push("/transaksi/penjualan/dtf/so-dtf-trial");
  } finally {
    isRestoringData.value = false;
    isInitializing.value = false;
    isLoading.value = false;
  }
};

const handleFileSelection = async () => {
  await nextTick();
  const file = imageFile.value;

  if (!file) {
    imagePreview.value = form.value.imageUrl ? getFullImageUrl(form.value.imageUrl) : null;
    return;
  }

  if (file.size > 1024 * 1024) {
    toast.error("Ukuran file Max 1MB.");
    imageFile.value = null;
    return;
  }
  if (!["image/jpeg", "image/jpg", "image/png", "image/gif"].includes(file.type)) {
    toast.error("Tipe file tidak valid.");
    imageFile.value = null;
    return;
  }

  // [PERBAIKAN KUNCI]
  // JANGAN PERNAH AUTO-UPLOAD! Cukup bikin preview sementaranya saja.
  // Upload ke server baru akan jalan nanti pas Mas Rizal klik tombol "Simpan"
  imagePreview.value = URL.createObjectURL(file);
};

const clearImage = () => {
  if (imagePreview.value && imagePreview.value.startsWith("blob:"))
    URL.revokeObjectURL(imagePreview.value);
  imagePreview.value = null;
  imageFile.value = null;
  form.value.imageUrl = null;
};

const openFullscreen = (url: string) => {
  fullscreenImageSrc.value = url;
  isImageFullscreenVisible.value = true;
};

const resetForm = () => {
  form.value = { ...initialFormState, tanggal: format(new Date(), "yyyy-MM-dd") };

  // [PERBAIKAN] Langsung hardcode 1 baris dengan jumlah 1
  detailsUkuran.value = [{ id: Date.now(), ukuran: "", jumlah: 1, harga: 0, namaBarang: "" }];

  detailsTitik.value = [
    {
      id: Date.now(),
      keterangan: "",
      sizeCetak: form.value.jenisOrderKode === "SD" ? "Custom" : "",
      panjang: 0,
      lebar: 0,
    },
  ];

  imagePreview.value = null;
  imageFile.value = null;

  // Reset state revisi
  isAddingRevision.value = false;
  newRevisionCatatan.value = "";

  markAsSaved();
};

const uploadImageToServer = async (nomor: string, revisiKe: number = 0): Promise<boolean> => {
  if (!imageFile.value) return true;
  isImageUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("image", imageFile.value);

    // [UBAH ENDPOINT] Tambahkan revisiKe
    const response = await api.post(
      `/so-dtf-trial-form/upload-image/${nomor}/${revisiKe}`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      }
    );
    if (response.data.success) {
      form.value.imageUrl = response.data.imageUrl;
      if (imagePreview.value && imagePreview.value.startsWith("blob:"))
        URL.revokeObjectURL(imagePreview.value);
      imagePreview.value = getFullImageUrl(response.data.imageUrl);
      imageFile.value = null;
      toast.success("Gambar berhasil diunggah");
      return true;
    } else throw new Error(response.data.message || "Upload gagal");
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error("Upload gagal: " + (err.response?.data?.message || err.message));
    return false;
  } finally {
    isImageUploading.value = false;
  }
};

const save = async () => {
  if (!isEditMode.value) {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    if (form.value.tanggal !== todayStr) {
      toast.error("Tanggal SO Trial baru harus hari ini!");
      form.value.tanggal = todayStr;
      return;
    }
  }

  if (isEditMode.value && isAddingRevision.value && !newRevisionCatatan.value) {
    return toast.error("Catatan Revisi harus diisi jika Anda ingin menambah revisi baru.");
  }

  if (!form.value.salesKode) return toast.error("Sales harus diisi.");
  if (!form.value.customerKode) return toast.error("Customer harus diisi.");
  if (!form.value.jenisOrderKode) return toast.error("Jenis Order harus diisi.");

  const validDetailsUkuran = detailsUkuran.value.filter((d) => d.ukuran && d.jumlah);
  const validDetailsTitik = detailsTitik.value.filter(
    (d) => d.keterangan && d.panjang > 0 && d.lebar > 0
  );

  if (validDetailsUkuran.length === 0) return toast.error("Detail Ukuran Kaos harus diisi.");
  if (validDetailsTitik.length === 0) return toast.error("Detail Titik Bordir/Cetak harus diisi.");

  for (const item of validDetailsUkuran) {
    if (!item.jumlah || item.jumlah <= 0)
      return toast.error(`Jumlah untuk ukuran '${item.ukuran}' harus lebih dari 0.`);
    if (!item.harga || item.harga <= 0)
      return toast.error(`Harga untuk ukuran '${item.ukuran}' harus diisi.`);
  }

  for (const item of validDetailsTitik) {
    if (form.value.jenisOrderKode === "TG" && !item.sizeCetak)
      return toast.error(`Size Cetak DTG harus dipilih.`);
    if (!item.panjang || item.panjang <= 0)
      return toast.error(`Panjang '${item.keterangan}' harus > 0.`);
    if (!item.lebar || item.lebar <= 0) return toast.error(`Lebar '${item.keterangan}' harus > 0.`);
  }

  showConfirmation(async () => {
    isSaving.value = true;
    let savedNomor: string = "";
    let targetRevisiKe: number = 0;

    try {
      const payload: SoDtfPayload = {
        header: { ...form.value },
        detailsUkuran: validDetailsUkuran,
        detailsTitik: validDetailsTitik,
        newRevision: { isAdding: isAddingRevision.value, catatan: newRevisionCatatan.value }, // <--- Kirim ke backend
      };

      if (isEditMode.value) {
        if (!form.value.nomor) throw new Error("Nomor tidak ditemukan.");
        const response = await api.put(`/so-dtf-trial-form/${form.value.nomor}`, payload);
        savedNomor = response.data.header?.nomor || response.data.nomor || form.value.nomor;
        targetRevisiKe = response.data.revisiKe || 0; // <--- Tangkap dari backend
        form.value.nomor = savedNomor;
      } else {
        const headerWithoutNomor = { ...payload.header };
        Reflect.deleteProperty(headerWithoutNomor, "nomor");
        const response = await api.post("/so-dtf-trial-form", {
          ...payload,
          header: headerWithoutNomor,
        });
        savedNomor = response.data.nomor;
        targetRevisiKe = 0;
      }

      toast.success("Trial berhasil disimpan.");
      markAsSaved();

      // [UBAH] Pass targetRevisiKe
      if (imageFile.value) await uploadImageToServer(savedNomor, targetRevisiKe);

      if (savedNomor) {
        printConfirmNomor.value = savedNomor;
        isPrintConfirmVisible.value = true;
      } else {
        router.push("/transaksi/penjualan/dtf/so-dtf-trial");
      }
    } catch (err) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message || "Gagal menyimpan data.");
    } finally {
      isSaving.value = false;
    }
  }, "Anda yakin ingin menyimpan data perhitungan trial ini?");
};

const handlePrintConfirm = () => {
  if (!printConfirmNomor.value) return;
  try {
    const routeData = router.resolve({
      name: "Cetak SO DTF Trial",
      params: { nomor: printConfirmNomor.value },
    });
    window.open(routeData.href, "_blank");
  } catch {
    toast.error("Gagal membuka halaman cetak.");
  } finally {
    isPrintConfirmVisible.value = false;
    printConfirmNomor.value = "";
    router.push("/transaksi/penjualan/dtf/so-dtf-trial");
  }
};

const handlePrintCancel = () => {
  isPrintConfirmVisible.value = false;
  printConfirmNomor.value = "";
  router.push("/transaksi/penjualan/dtf/so-dtf-trial");
};

const handleAccDesain = () => {
  if (!form.value.nomor) return;

  // Arahkan ke halaman Create SO DTF Riil dengan membawa parameter 'refTrial'
  // ⚠️ PENTING: Pastikan path '/transaksi/penjualan/dtf/so-dtf/new' ini
  // sesuai dengan rute halaman form SO DTF asli di project Mas Rizal ya!
  router.push({
    path: "/transaksi/penjualan/dtf/so-dtf/new",
    query: { refTrial: form.value.nomor },
  });
};

const cancel = () => router.push("/transaksi/penjualan/dtf/so-dtf-trial");

// --- Lookup Triggers ---
const openSoSearch = () => {
  isSoSearchVisible.value = true;
};

const onSoSelected = async (selected: SoSelected, targetLineId: string | null = null) => {
  try {
    const nomorSo = selected.nomor || selected.Nomor || selected.so_nomor || selected.soNomor;
    if (!nomorSo) return toast.error("Nomor SO tidak ditemukan.");

    const res = await api.get(`/so-dtf-trial-form/so-detail/${nomorSo}`);
    const soData = res.data;

    form.value.soNomor = soData.header.nomor;
    form.value.customerKode = soData.header.customerKode;
    form.value.customerNama = soData.header.customerNama;
    form.value.customerAlamat = soData.header.customerAlamat;
    form.value.customerLevel = soData.header.levelNama;
    form.value.salesKode = soData.header.salesKode || form.value.salesKode;
    form.value.salesNama = soData.header.salesNama || form.value.salesNama;
    form.value.jenisOrderKode = soData.header.jenisOrderKode || "";
    form.value.jenisOrderNama = soData.header.jenisOrderNama || "";
    form.value.namaDtf = soData.header.namaDtf || "";

    if (form.value.jenisOrderKode) {
      // Menarik harga per cm dari Master Harga (Opsional, menyesuaikan)
      form.value.hargaPerCm = 0;
    }

    let customItems: SoItem[] = soData.items.filter((x: SoItem) => x.isCustomOrder);
    if (targetLineId)
      customItems = customItems.filter((x: SoItem) => String(x.id) === String(targetLineId));
    if (customItems.length === 0) customItems = soData.items.filter((x: SoItem) => x.isCustomOrder);

    detailsUkuran.value = [];
    if (customItems.length > 0) {
      const item = customItems[0];
      form.value.namaDtf = item.sod_custom_nama || item.nama;
      const u = item.ukuranKaos[0]; // Ambil ukuran pertama saja

      detailsUkuran.value.push({
        id: Date.now(),
        namaBarang: item.sourceItems?.length
          ? item.sourceItems[0].nama
          : item.sod_custom_nama || item.nama,
        ukuran: u ? u.ukuran : "",
        jumlah: 1, // DILOCK JADI 1
        harga: u ? u.harga : 0,
      });
    } else {
      detailsUkuran.value.push({ id: Date.now(), namaBarang: "", ukuran: "", jumlah: 1, harga: 0 });
    }

    detailsTitik.value = [];
    customItems.forEach((item: SoItem) => {
      item.titikCetak.forEach((t) => {
        detailsTitik.value.push({
          id: Date.now() + Math.floor(Math.random() * 1000000),
          keterangan: t.keterangan,
          sizeCetak: t.sizeCetak,
          panjang: t.panjang,
          lebar: t.lebar,
        });
      });
    });
    addDetailTitik();

    toast.success(`Data Trial berhasil ditarik dari SO ${nomorSo}`);
  } catch (err) {
    console.error(err);
    toast.error("Gagal load detail Surat Pesanan.");
  }
};

const openCustomerSearch = () => {
  if (form.value.soNomor)
    return toast.warning("Customer tidak bisa diubah karena ditarik dari SO.");
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
  if (jenisOrder.kode === "SD")
    detailsTitik.value.forEach((t) => {
      t.sizeCetak = "Custom";
    });
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
    const response = await api.get("/so-dtf-trial-form/lookup/ukuran-sodtf-detail", {
      params: { jenisOrder: form.value.jenisOrderKode, ukuran: item.sizeCetak },
    });
    if (response.data) {
      detailsTitik.value[index].panjang = response.data.panjang;
      detailsTitik.value[index].lebar = response.data.lebar;
    }
  } catch (error) {
    console.error("Gagal mengambil detail ukuran:", error);
  }
};

const showConfirmation = (action: () => void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
};
const executePendingAction = () => {
  if (pendingAction.value) pendingAction.value();
  isConfirmDialogVisible.value = false;
};
const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
  pendingAction.value = null;
};

const fetchUkuranKaosList = async () => {
  try {
    const response = await api.get("/so-dtf-trial-form/lookup/ukuran-kaos");
    ukuranKaosList.value = response.data;
  } catch (error) {
    console.error(error);
  }
};

const fetchSizeCetakList = async (jenisOrder: string) => {
  if (!jenisOrder) {
    sizeCetakList.value = ["Custom"];
    return;
  }
  try {
    const response = await api.get("/so-dtf-trial-form/lookup/size-cetak", {
      params: { jenisOrder },
    });
    sizeCetakList.value = [...response.data, "Custom"];
  } catch {
    sizeCetakList.value = ["Custom"];
  }
};

const getHargaDTG = async () => {
  try {
    const response = await api.post("/so-dtf-trial-form/calculate-dtg-price", {
      detailsTitik: detailsTitik.value,
      totalJumlahKaos: totalJumlahKaos.value,
    });
    return response.data.harga || 0;
  } catch {
    return 0;
  }
};

const calculatePrices = async () => {
  if (isEditMode.value && isRestoringData.value) return;
  if (isLoading.value || isInitializing.value) return;

  if (totalJumlahKaos.value <= 0) {
    form.value.hargaPerCm = 0;
    detailsUkuran.value.forEach((item) => (item.harga = 0));
    return;
  }

  const jenisOrder = form.value.jenisOrderKode;
  let hargaPerCm = 0;
  let hargaSatuan = 0;

  const totalLuas = detailsTitik.value.reduce(
    (sum, item) => sum + (item.panjang || 0) * (item.lebar || 0),
    0
  );

  switch (jenisOrder) {
    case "SB":
      detailsTitik.value.forEach((t) => {
        if (t.sizeCetak === "A3") hargaSatuan += 35000;
        else if (t.sizeCetak === "A4") hargaSatuan += 20000;
        else if (t.sizeCetak === "A5") hargaSatuan += 10000;
      });
      break;
    case "SD":
      hargaPerCm = form.value.customerLevel === "KORPORASI" ? 15 : 25;
      hargaSatuan = totalJumlahKaos.value > 0 ? totalHargaDtf.value / totalJumlahKaos.value : 0;
      break;
    case "DP":
      hargaPerCm = 35;
      hargaSatuan = totalLuas * hargaPerCm;
      break;
    case "BR":
      hargaPerCm = bordirMultiplier.value;
      hargaSatuan = totalJumlahKaos.value > 0 ? totalHargaBordir.value / totalJumlahKaos.value : 0;
      break;
    case "TG":
      hargaPerCm = 0;
      hargaSatuan = await getHargaDTG();
      break;
    default:
      hargaPerCm = 0;
      hargaSatuan = 0;
      break;
  }

  form.value.hargaPerCm = hargaPerCm;
  detailsUkuran.value.forEach((item) => {
    if (item.ukuran && item.jumlah) item.harga = hargaSatuan;
    else item.harga = 0;
  });
};

watch(
  () => form.value.jenisOrderKode,
  (newJenisOrder, oldJenisOrder) => {
    fetchSizeCetakList(newJenisOrder);
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

watch(
  [form, detailsUkuran, detailsTitik],
  () => {
    if (isLoading.value || isSaving.value || isRestoringData.value || isInitializing.value) return;
    const hasHeader = form.value.customerKode !== "" || form.value.salesKode !== "";
    const hasUkuran = detailsUkuran.value.some((d) => d.ukuran !== "" || (d.jumlah || 0) > 0);
    const hasTitik = detailsTitik.value.some((d) => d.keterangan !== "");
    uiStore.setUnsavedChanges(hasHeader || hasUkuran || hasTitik);
  },
  { deep: true }
);

onMounted(async () => {
  markAsSaved();
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error("Anda tidak memiliki izin akses.");
    router.back();
    return;
  }

  const nomor = route.params.nomor as string;
  const refSo = route.query.refSo as string;
  const lineId = route.query.lineId as string;

  if (nomor) {
    fetchDataForEdit(nomor);
  } else if (refSo) {
    isLoading.value = true;
    await onSoSelected({ nomor: refSo }, typeof lineId === "string" ? lineId : null);
    isLoading.value = false;
  } else {
    resetForm();
    isLoading.value = false;
  }
  fetchUkuranKaosList();
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-flask-outline">
    <template #header-actions>
      <v-btn
        v-if="isEditMode && !form.noSoDtfRiil && !isReadOnly"
        size="small"
        color="success"
        @click="
          showConfirmation(handleAccDesain, 'ACC Desain ini dan buat Surat Pesanan (SO) DTF Riil?')
        "
        prepend-icon="mdi-check-decagram"
        >ACC & Buat SO</v-btn
      >
      <v-btn
        size="small"
        color="primary"
        @click="save"
        :loading="isSaving"
        prepend-icon="mdi-content-save"
        :disabled="isReadOnly"
        >Simpan</v-btn
      >
      <v-btn
        v-if="!isEditMode"
        size="small"
        @click="showConfirmation(resetForm, 'Batal dan kosongkan isian?')"
        prepend-icon="mdi-refresh"
        >Batal</v-btn
      >
      <v-btn size="small" @click="showConfirmation(cancel, 'Tutup form?')" prepend-icon="mdi-close"
        >Tutup</v-btn
      >
    </template>

    <div class="form-grid-container" v-if="!isLoading">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6">
              <v-text-field
                label="Nomor Trial"
                :model-value="form.nomor || '<Otomatis>'"
                readonly
                variant="filled"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Tanggal Transaksi"
                v-model="form.tanggal"
                type="date"
                :variant="isEditMode ? 'filled' : 'outlined'"
                density="compact"
                hide-details
                :readonly="isEditMode || isReadOnly"
                :class="{ 'field-readonly': isEditMode || isReadOnly }"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                label="Ambil Data dari Surat Pesanan (SO)"
                readonly
                prepend-inner-icon="mdi-magnify"
                placeholder="Klik untuk mencari SO yang sudah DP..."
                v-model="form.soNomor"
                variant="outlined"
                density="compact"
                hide-details
                @click="!isReadOnly && openSoSearch()"
                :disabled="isReadOnly"
              />
            </v-col>

            <v-col cols="6">
              <v-text-field
                label="Sales"
                :model-value="form.salesKode ? `${form.salesKode} - ${form.salesNama}` : ''"
                readonly
                @click="!isReadOnly && openSalesSearch()"
                @keydown.f1.prevent="!isReadOnly && openSalesSearch()"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="F1 atau klik..."
                :disabled="isReadOnly"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                label="Customer"
                :model-value="
                  form.customerKode ? `${form.customerKode} - ${form.customerNama}` : ''
                "
                readonly
                @click="!isReadOnly && openCustomerSearch()"
                @keydown.f1.prevent="!isReadOnly && openCustomerSearch()"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="F1 atau klik..."
                :disabled="!!form.soNomor || isReadOnly"
                :class="{ 'field-disabled': !!form.soNomor }"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                label="Level Customer"
                :model-value="form.customerLevel"
                readonly
                filled
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="8">
              <v-text-field
                label="Jenis Order"
                :model-value="
                  form.jenisOrderKode ? `${form.jenisOrderKode} - ${form.jenisOrderNama}` : ''
                "
                readonly
                @click="!isReadOnly && openJenisOrderSearch()"
                @keydown.f1.prevent="!isReadOnly && openJenisOrderSearch()"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="F1 atau klik..."
                :disabled="isReadOnly"
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                label="Harga/cm2"
                :model-value="form.hargaPerCm"
                readonly
                filled
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                label="Nama DTF / Design"
                v-model="form.namaDtf"
                variant="outlined"
                density="compact"
                hide-details
                :readonly="isReadOnly"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Kain"
                :model-value="form.kain"
                @click="!isReadOnly && openJenisKainSearch()"
                @keydown.f1.prevent="!isReadOnly && openJenisKainSearch()"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="F1 atau klik..."
                :readonly="isReadOnly"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Finishing"
                v-model="form.finishing"
                variant="outlined"
                density="compact"
                hide-details
                :readonly="isReadOnly"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Bag. Desain"
                v-model="form.desain"
                variant="outlined"
                density="compact"
                hide-details
                :readonly="isReadOnly"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                label="Workshop"
                :model-value="
                  form.workshopKode ? `${form.workshopKode} - ${form.workshopNama}` : ''
                "
                @click="!isReadOnly && openWorkshopSearch()"
                @keydown.f1.prevent="!isReadOnly && openWorkshopSearch()"
                variant="outlined"
                density="compact"
                hide-details
                append-inner-icon="mdi-magnify"
                placeholder="F1 atau klik..."
                readonly
                :disabled="isReadOnly"
              />
            </v-col>
          </v-row>

          <div class="desktop-form-section mt-4" v-if="form.noSoDtfRiil">
            <v-alert density="compact" type="success" variant="tonal" class="mb-0">
              Telah diangkat menjadi SO Riil: <b>{{ form.noSoDtfRiil }}</b>
            </v-alert>
          </div>

          <div class="desktop-form-section mt-4" v-if="isEditMode">
            <h3 class="text-subtitle-1 font-weight-bold mb-2">Riwayat Revisi Desain</h3>
            <div v-if="form.revisiList && form.revisiList.length > 0">
              <v-timeline density="compact" side="end">
                <v-timeline-item
                  v-for="rev in form.revisiList"
                  :key="rev.tr_id"
                  size="small"
                  :dot-color="rev.tr_revisi_ke === 0 ? 'grey' : 'primary'"
                >
                  <div class="d-flex flex-column bg-grey-lighten-4 rounded pa-3 border">
                    <div class="d-flex justify-space-between align-center mb-2">
                      <strong class="text-primary">{{
                        rev.tr_revisi_ke === 0 ? "Desain Awal" : "Revisi " + rev.tr_revisi_ke
                      }}</strong>
                      <span class="text-caption text-grey">{{ rev.tanggal_revisi }}</span>
                    </div>
                    <p class="text-caption mb-2">{{ rev.tr_catatan || "-" }}</p>
                    <v-img
                      v-if="rev.tr_gambar"
                      :src="getFullImageUrl(rev.tr_gambar)"
                      height="120"
                      cover
                      class="rounded cursor-pointer border"
                      @click="openFullscreen(getFullImageUrl(rev.tr_gambar))"
                    />
                  </div>
                </v-timeline-item>
              </v-timeline>
            </div>
            <div v-else class="text-center pa-4 text-grey text-caption">
              Belum ada riwayat gambar.
            </div>
          </div>
        </div>
      </div>

      <div class="right-column">
        <v-row dense>
          <v-col cols="12" md="6">
            <div class="desktop-form-section mb-4">
              <div class="d-flex align-center mb-2">
                <span class="text-subtitle-2">Ukuran Kaos (Max. 1 Pcs)</span>
                <v-spacer />
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
                        :readonly="isReadOnly"
                      />
                    </td>
                    <td>
                      <v-combobox
                        v-model="item.ukuran"
                        :items="ukuranKaosList"
                        @change="!isEditMode && !isReadOnly && addDetailUkuran()"
                        variant="underlined"
                        density="compact"
                        hide-details
                        :readonly="isReadOnly"
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
                        readonly
                        max="1"
                        min="1"
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
                        :readonly="isHargaReadonly || isReadOnly"
                      />
                    </td>
                    <td>
                      <v-btn
                        v-if="index < detailsUkuran.length - 1 && !isReadOnly"
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

            <div class="desktop-form-section">
              <div class="d-flex align-center mb-2">
                <span class="text-subtitle-2">Titik Bordir/Cetak</span>
                <v-spacer />
                <v-btn
                  v-if="!isReadOnly"
                  icon="mdi-plus"
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  class="me-2"
                  @click="addDetailTitik"
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
                        @change="!isEditMode && !isReadOnly && addDetailTitik()"
                        variant="underlined"
                        density="compact"
                        hide-details
                        :readonly="isReadOnly"
                      />
                    </td>
                    <td>
                      <v-combobox
                        v-model="item.sizeCetak"
                        :items="sizeCetakList"
                        @update:model-value="() => !isReadOnly && onSizeCetakChange(item, index)"
                        variant="underlined"
                        density="compact"
                        hide-details
                        :readonly="isReadOnly"
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
                        :readonly="isPanjangLebarReadonly(item) || isReadOnly"
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
                        :readonly="isPanjangLebarReadonly(item) || isReadOnly"
                        :class="{ 'field-readonly': isPanjangLebarReadonly(item) }"
                      />
                    </td>
                    <td>
                      <v-btn
                        v-if="index < detailsTitik.length - 1 && !isReadOnly"
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
                  <v-col cols="12" v-if="form.jenisOrderKode === 'BR'">
                    <v-alert density="compact" variant="tonal" type="info" class="mb-2"
                      >Perhitungan Bordir</v-alert
                    >
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
                  <v-col cols="12" v-if="form.jenisOrderKode === 'SD'">
                    <v-alert density="compact" variant="tonal" type="info" class="mb-2"
                      >Perhitungan DTF</v-alert
                    >
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

          <v-col cols="12" md="6">
            <div class="desktop-form-section mb-4" v-if="!isReadOnly">
              <div
                v-if="isEditMode"
                class="mb-4 bg-blue-lighten-5 px-4 py-2 rounded border border-info"
              >
                <v-checkbox
                  v-model="isAddingRevision"
                  label="Upload Desain Revisi Baru"
                  color="primary"
                  hide-details
                  density="compact"
                />
              </div>

              <div v-if="!isEditMode || isAddingRevision" class="image-upload-section">
                <h4 class="text-subtitle-2 mb-3">
                  {{ isEditMode ? "Form Revisi Baru" : "Desain Awal" }}
                </h4>
                <div class="d-flex align-center ga-2 mb-3">
                  <v-file-input
                    v-model="imageFile"
                    label="Upload Gambar (Max 1MB)"
                    variant="outlined"
                    density="compact"
                    prepend-inner-icon="mdi-camera"
                    prepend-icon=""
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
                  />
                </div>
                <div class="image-preview-container">
                  <div v-if="imagePreview" class="position-relative">
                    <v-img
                      :src="imagePreview"
                      height="200"
                      aspect-ratio="16/9"
                      cover
                      class="border rounded elevation-1 cursor-pointer"
                      @click="openFullscreen(imagePreview)"
                    >
                      <v-overlay
                        v-if="isImageUploading"
                        contained
                        persistent
                        class="d-flex align-center justify-center"
                        ><div class="text-center text-white">
                          <v-progress-circular indeterminate color="primary" size="40" /></div
                      ></v-overlay>
                    </v-img>
                  </div>
                  <div
                    v-else
                    class="border rounded d-flex align-center justify-center bg-grey-lighten-4"
                    style="height: 200px"
                  >
                    <div class="text-center text-grey">
                      <v-icon size="48" class="mb-2">mdi-image-outline</v-icon>
                      <div class="text-caption">Tidak ada gambar</div>
                    </div>
                  </div>
                </div>

                <div class="mt-4">
                  <v-textarea
                    v-if="isEditMode"
                    label="Catatan Revisi (Wajib)"
                    v-model="newRevisionCatatan"
                    rows="3"
                    variant="outlined"
                    density="compact"
                    hide-details
                    bg-color="white"
                  />

                  <v-textarea
                    v-else
                    label="Keterangan / Catatan Awal"
                    v-model="newRevisionCatatan"
                    rows="3"
                    variant="outlined"
                    density="compact"
                    hide-details
                    bg-color="white"
                  />
                </div>
              </div>
            </div>
            <div class="desktop-form-section">
              <v-textarea
                label="Keterangan / Catatan Tambahan"
                v-model="form.keterangan"
                rows="6"
                variant="outlined"
                density="compact"
                hide-details
                :readonly="isReadOnly"
              />
            </div>
          </v-col>
        </v-row>
      </div>
    </div>
    <v-skeleton-loader v-else type="article, actions"></v-skeleton-loader>

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

    <v-dialog v-model="isImageFullscreenVisible" max-width="90vw">
      <v-card>
        <v-toolbar density="compact" color="primary" dark
          ><v-toolbar-title><v-icon start>mdi-image</v-icon> Preview Gambar</v-toolbar-title
          ><v-spacer /><v-btn
            icon="mdi-close"
            @click="isImageFullscreenVisible = false"
            variant="text"
        /></v-toolbar>
        <v-card-text class="pa-4 bg-grey-lighten-4">
          <div class="d-flex justify-center align-center" style="min-height: 60vh">
            <v-img
              :src="fullscreenImageSrc"
              max-height="80vh"
              max-width="100%"
              contain
              class="rounded elevation-2"
            />
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi</v-card-title>
        <v-card-text>{{ confirmText }}</v-card-text>
        <v-card-actions
          ><v-spacer></v-spacer
          ><v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">Tidak</v-btn
          ><v-btn color="primary" variant="tonal" @click="executePendingAction"
            >Ya, Lanjutkan</v-btn
          ></v-card-actions
        >
      </v-card>
    </v-dialog>

    <v-dialog v-model="isPrintConfirmVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Simpan Berhasil</v-card-title>
        <v-card-text
          >Trial {{ printConfirmNomor }} berhasil disimpan.<br /><br />Ingin mencetak form hitungan
          ini?</v-card-text
        >
        <v-card-actions
          ><v-spacer></v-spacer
          ><v-btn color="grey-darken-1" variant="text" @click="handlePrintCancel">Tidak</v-btn
          ><v-btn color="primary" variant="tonal" @click="handlePrintConfirm"
            >Ya, Cetak</v-btn
          ></v-card-actions
        >
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* --- LAYOUT GRID KIRI & KANAN --- */
.form-grid-container {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
  height: calc(100vh - 115px);
  padding: 16px;
  background-color: #f8f9fa;
  overflow: hidden;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 4px;
}

.left-column::-webkit-scrollbar,
.right-column::-webkit-scrollbar {
  width: 6px;
}
.left-column::-webkit-scrollbar-thumb,
.right-column::-webkit-scrollbar-thumb {
  background-color: #bdbdbd;
  border-radius: 4px;
}

/* --- KOTAK FORM (SECTION) --- */
.desktop-form-section {
  background-color: white !important;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.header-section .v-row {
  margin-top: -4px;
  margin-bottom: -4px;
}
.header-section .v-col {
  padding-top: 4px;
  padding-bottom: 4px;
}

/* --- TABEL & LAINNYA --- */
.desktop-table {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  overflow: hidden;
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
  background-color: white;
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

.perhitungan-box {
  padding: 12px;
  border-radius: 8px;
  background-color: #f0f8ff;
  border: 1px solid #90caf9;
}
</style>

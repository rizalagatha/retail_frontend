<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import { AxiosError } from 'axios';

// --- Import Modals ---
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
import SalesSearchModal from '@/components/lookup/SalesSearchModal.vue';
import JenisOrderSearchModal from '@/components/lookup/JenisOrderSearchModal.vue';
import JenisKainSearchModal from '@/components/lookup/JenisKainSearchModal.vue';
import WorkshopSearchModal from '@/components/lookup/WorkshopSearchModal.vue';

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
  jumlah: number | null;
  harga: number | null;
}
interface DetailTitik {
  id: number;
  keterangan: string;
  sizeCetak: string;
  panjang: number | null;
  lebar: number | null;
}
interface SoDtfPayload {
  header: FormHeader;
  detailsUkuran: DetailUkuran[];
  detailsTitik: DetailTitik[];
}
type DetailUkuranApi = Omit<DetailUkuran, 'id'>;

// --- State & Dependencies ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '35';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? `Ubah SO DTF: ${form.value.nomor}` : 'Buat SO DTF Baru');
const requiredPermission = computed(() => isEditMode.value ? 'edit' : 'insert');

const isLoading = ref(true);
const isSaving = ref(false);

const initialFormState = {
  nomor: null,
  tanggal: format(new Date(), 'yyyy-MM-dd'),
  tglPengerjaan: format(new Date(), 'yyyy-MM-dd'),
  datelineCustomer: format(new Date(), 'yyyy-MM-dd'),
  salesKode: '', salesNama: '',
  customerKode: '', customerNama: '', customerAlamat: '', customerLevel: '',
  jenisOrderKode: '', jenisOrderNama: '',
  namaDtf: '', kain: '', finishing: '', desain: '',
  workshopKode: authStore.user?.cabang || '',
  workshopNama: authStore.user?.cabangNama || '',
  keterangan: '',
  hargaPerCm: 0,
  user: authStore.user?.kode || '',
  imageUrl: null as string | null
};

const form = ref<FormHeader>({ ...initialFormState })
const detailsUkuran = ref<DetailUkuran[]>([]);
const detailsTitik = ref<DetailTitik[]>([]);
const imagePreview = ref<string | null>(null)
const imageFile = ref<File | null>(null)
const isImageUploading = ref(false);
const sisaKuota = ref(0);
const isImageFullscreenVisible = ref(false); // State untuk modal fullscreen
const isConfirmDialogVisible = ref(false);
const confirmText = ref('');
const pendingAction = ref<(() => void) | null>(null);
const ukuranKaosList = ref<string[]>([]);

// --- Modal Visibility State ---
const isCustomerSearchVisible = ref(false);
const isSalesSearchVisible = ref(false);
const isJenisOrderSearchVisible = ref(false);
const isJenisKainSearchVisible = ref(false);
const isWorkshopSearchVisible = ref(false);
const sizeCetakList = ref(['A3', 'A4', 'A5', 'Logo', 'Custom']);

// --- Computed Properties for Totals ---
const totalJumlahKaos = computed(() => {
  return detailsUkuran.value.reduce((sum, item) => sum + (item.jumlah || 0), 0);
});

const totalTitik = computed(() => {
  const titikCount = detailsTitik.value.filter(d => d.keterangan).length;
  return totalJumlahKaos.value * titikCount;
});

const isHargaReadonly = computed(() => {
  const autoCalcTypes = ['SD', 'DP', 'TG', 'BR'];
  return autoCalcTypes.includes(form.value.jenisOrderKode);
});

const isPanjangLebarReadonly = (item: DetailTitik) => {
  return item.sizeCetak && item.sizeCetak !== 'Custom';
};

// --- Methods ---
const getFullImageUrl = (path: string | null) => {
  if (!path) return null
  if (path.startsWith("http")) return path

  // path dari backend contoh: /images/KDC/...
  return `${import.meta.env.VITE_API_BASE_URL}${path}`
}

const addDetailUkuran = () => {
  if (detailsUkuran.value.length === 0 || detailsUkuran.value[detailsUkuran.value.length - 1].ukuran) {
    detailsUkuran.value.push({ id: Date.now(), ukuran: '', jumlah: null, harga: null });
  }
};
const removeDetailUkuran = (id: number) => {
  detailsUkuran.value = detailsUkuran.value.filter(d => d.id !== id);
};
const addDetailTitik = () => {
  if (detailsTitik.value.length === 0 || detailsTitik.value[detailsTitik.value.length - 1].keterangan) {
    detailsTitik.value.push({ id: Date.now(), keterangan: '', sizeCetak: '', panjang: null, lebar: null });
  }
};
const removeDetailTitik = (id: number) => {
  detailsTitik.value = detailsTitik.value.filter(d => d.id !== id);
};

const fetchDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {

    const response = await api.get(`/so-dtf-form/${nomor}`);
    const data = response.data;

    // Set form data
    form.value = {
      nomor: data.header.nomor,
      tanggal: format(new Date(data.header.tanggal), 'yyyy-MM-dd'),
      tglPengerjaan: format(new Date(data.header.tglPengerjaan), 'yyyy-MM-dd'),
      datelineCustomer: format(new Date(data.header.datelineCustomer), 'yyyy-MM-dd'),
      salesKode: data.header.salesKode || '',
      salesNama: data.header.salesNama || '',
      customerKode: data.header.customerKode || '',
      customerNama: data.header.customerNama || '',
      customerAlamat: data.header.customerAlamat || '',
      customerLevel: data.header.customerLevel || '',
      jenisOrderKode: data.header.jenisOrderKode || '',
      jenisOrderNama: data.header.jenisOrderNama || '',
      namaDtf: data.header.namaDtf || '',
      kain: data.header.kain || '',
      finishing: data.header.finishing || '',
      desain: data.header.desain || '',
      workshopKode: data.header.workshopKode || '',
      workshopNama: data.header.workshopNama || '',
      keterangan: data.header.keterangan || '',
      hargaPerCm: data.header.hargaPerCm || 0,
      user: data.header.user || '',
      imageUrl: data.header.imageUrl || null
    };

    // Set preview dari gambar existing (jika ada)
    imagePreview.value = getFullImageUrl(data.header.imageUrl);

    // Clear file input karena ini data existing
    imageFile.value = null;

    // Set detail data
    detailsUkuran.value = (data.detailsUkuran as DetailUkuranApi[]).map((d, i) => ({
      ...d,
      id: Date.now() + i
    }));

    detailsTitik.value = data.detailsTitik.map((d: Omit<DetailTitik, 'id'>, i: number) => ({
      ...d,
      id: Date.now() + i + 1000
    }));

    addDetailUkuran();
    addDetailTitik();

    toast.success(`Data untuk ${nomor} berhasil dimuat.`);

  } catch (error) {
    const err = error as AxiosError<{ message: string }>;

    console.error('Error loading data:', err);

    // Ambil pesan error dari response API jika ada
    toast.error(err.response?.data?.message || 'Gagal memuat data SO DTF');

    router.push('/transaksi/penjualan/dtf/so-dtf');
  } finally {
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
  if (imagePreview.value && imagePreview.value.startsWith('blob:')) {
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
  addDetailUkuran();
  addDetailTitik();
};

const uploadImageToServer = async (nomor: string): Promise<boolean> => {
  if (!imageFile.value) return true;

  isImageUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("image", imageFile.value);

    const response = await api.post(`/so-dtf-form/upload-image/${nomor}`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });

    if (response.data.success) {
      form.value.imageUrl = response.data.imageUrl;

      // Cleanup blob URL lama jika ada
      if (imagePreview.value && imagePreview.value.startsWith('blob:')) {
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

  const validDetailsUkuran = detailsUkuran.value.filter(d => d.ukuran && d.jumlah);
  const validDetailsTitik = detailsTitik.value.filter(d => d.keterangan);

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
  }

  for (const item of validDetailsTitik) {
    if (form.value.jenisOrderKode === 'TG' && !item.sizeCetak) {
      toast.error(`Size Cetak untuk '${item.keterangan}' harus dipilih jika Jenis Order adalah DTG.`);
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
  }

  showConfirmation(async () => {
    isSaving.value = true;

    try {
      // 1. Simpan data utama
      const payload: SoDtfPayload = {
        header: { ...form.value },
        detailsUkuran: validDetailsUkuran,
        detailsTitik: validDetailsTitik
      };

      let savedNomor: string;

      if (isEditMode.value) {
        if (!form.value.nomor) {
          toast.error("Nomor tidak ditemukan, tidak bisa update.")
          return
        }
        await api.put(`/so-dtf-form/${form.value.nomor}`, payload)
        savedNomor = form.value.nomor
      } else {
        delete payload.header.nomor // jangan kirim null
        const response = await api.post("/so-dtf-form", payload)
        savedNomor = response.data.header.sd_nomor
      }

      toast.success("Data berhasil disimpan.")

      // 2. Upload gambar jika ada
      if (!isEditMode.value && imageFile.value) {
        const uploadSuccess = await uploadImageToServer(savedNomor);
        if (!uploadSuccess) {
          toast.warning("Data berhasil disimpan, tapi gambar gagal diunggah.");
        }
      }

      router.push("/transaksi/penjualan/dtf/so-dtf")
    } catch (err) {
      const error = err as AxiosError<{ message: string }>
      console.error("Save error:", error)
      toast.error(error.response?.data?.message || "Gagal menyimpan data.")
    } finally {
      isSaving.value = false
    }
  }, "Anda yakin ingin menyimpan data ini?")
}

const cancel = () => {
  router.push('/transaksi/penjualan/dtf/so-dtf');
};

const fetchSisaKuota = async () => {
  if (form.value.jenisOrderKode !== 'SD') {
    sisaKuota.value = 0;
    return;
  }
  try {
    const response = await api.get('/so-dtf-form/sisa-kuota', {
      params: {
        cabang: form.value.workshopKode,
        tanggalKerja: form.value.tglPengerjaan
      }
    });
    sisaKuota.value = response.data.sisaKuota;
  } catch (error) {
    toast.error("Gagal mengambil data sisa kuota.", error);
    sisaKuota.value = 0;
  }
};

const openCustomerSearch = () => { isCustomerSearchVisible.value = true; };
const onCustomerSelected = (customer: { kode: string, nama: string, alamat: string, level: string }) => {
  form.value.customerKode = customer.kode;
  form.value.customerNama = customer.nama;
  form.value.customerAlamat = customer.alamat;
  form.value.customerLevel = customer.level;
  isCustomerSearchVisible.value = false;
};

const openSalesSearch = () => { isSalesSearchVisible.value = true; };
const onSalesSelected = (sales: { kode: string, nama: string }) => {
  form.value.salesKode = sales.kode;
  form.value.salesNama = sales.nama;
  isSalesSearchVisible.value = false;
};

const openJenisOrderSearch = () => { isJenisOrderSearchVisible.value = true; };
const onJenisOrderSelected = (jenisOrder: { kode: string, nama: string }) => {
  form.value.jenisOrderKode = jenisOrder.kode;
  form.value.jenisOrderNama = jenisOrder.nama;
  isJenisOrderSearchVisible.value = false;
};

const openJenisKainSearch = () => { isJenisKainSearchVisible.value = true; };
const onJenisKainSelected = (jenisKain: { nama: string }) => {
  form.value.kain = jenisKain.nama;
  isJenisKainSearchVisible.value = false;
};

const openWorkshopSearch = () => { isWorkshopSearchVisible.value = true; };
const onWorkshopSelected = (workshop: { kode: string, nama: string }) => {
  form.value.workshopKode = workshop.kode;
  form.value.workshopNama = workshop.nama;
  isWorkshopSearchVisible.value = false;
};

const onSizeCetakChange = async (item: DetailTitik, index: number) => {
  // Tambahkan baris baru jika perlu
  addDetailTitik();

  if (!item.sizeCetak || !form.value.jenisOrderKode) return;

  // Jika pilih "Custom", kosongkan nilai dan biarkan user input manual
  if (item.sizeCetak === 'Custom') {
    detailsTitik.value[index].panjang = null;
    detailsTitik.value[index].lebar = null;
    return;
  }

  // Untuk selain Custom, ambil dari API dan set readonly
  try {
    const response = await api.get('/so-dtf-form/lookup/ukuran-sodtf-detail', {
      params: {
        jenisOrder: form.value.jenisOrderKode,
        ukuran: item.sizeCetak,
      }
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

const fetchUkuranKaosList = async () => { // <-- TAMBAHKAN FUNGSI INI
  try {
    const response = await api.get('/so-dtf-form/lookup/ukuran-kaos');
    ukuranKaosList.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat daftar ukuran kaos.', error);
  }
};

const fetchSizeCetakList = async (jenisOrder: string) => {
  if (!jenisOrder) {
    sizeCetakList.value = ['Custom']; // Default hanya Custom jika belum pilih jenis order
    return;
  }
  try {
    const response = await api.get('/so-dtf-form/lookup/size-cetak', {
      params: { jenisOrder }
    });
    // Tambahkan "Custom" di akhir list
    sizeCetakList.value = [...response.data, 'Custom'];
  } catch (error) {
    toast.error('Gagal memuat daftar size cetak.', error);
    sizeCetakList.value = ['Custom'];
  }
};

const getHargaDTG = async () => {
  try {
    const response = await api.post('/so-dtf-form/calculate-dtg-price', {
      detailsTitik: detailsTitik.value,
      totalJumlahKaos: totalJumlahKaos.value
    });
    return response.data.harga || 0;
  } catch (error) {
    toast.error("Gagal menghitung harga DTG.", error);
    return 0;
  }
};

/**
 * Fungsi utama untuk menghitung semua harga.
 */
const calculatePrices = async () => {
  if (totalJumlahKaos.value <= 0) {
    // Jika tidak ada jumlah, reset semua harga
    form.value.hargaPerCm = 0;
    detailsUkuran.value.forEach(item => item.harga = 0);
    return;
  }

  const jenisOrder = form.value.jenisOrderKode;
  let hargaPerCm = 0;
  let hargaSatuan = 0;

  // Menghitung total luas dari grid kedua (Titik Bordir/Cetak)
  const totalLuas = detailsTitik.value.reduce((sum, item) => {
    return sum + ((item.panjang || 0) * (item.lebar || 0));
  }, 0);

  // Menentukan harga berdasarkan Jenis Order (mirip blok if/else if di Delphi)
  switch (jenisOrder) {
    case 'SD': // Sablon
      hargaPerCm = form.value.customerLevel === 'KORPORASI' ? 15 : 25;
      hargaSatuan = totalLuas * hargaPerCm;
      break;
    case 'DP': // DTF Premium
      hargaPerCm = 35;
      hargaSatuan = totalLuas * hargaPerCm;
      break;
    case 'BR': // Bordir
      hargaPerCm = 100;
      hargaSatuan = totalLuas * hargaPerCm;
      break;
    case 'TG': // DTG
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
  detailsUkuran.value.forEach(item => {
    if (item.ukuran && item.jumlah) {
      item.harga = hargaSatuan;
    } else {
      item.harga = 0;
    }
  });
};

// const cleanupPreviewUrl = () => {
//   if (imagePreview.value && imagePreview.value.startsWith('blob:')) {
//     URL.revokeObjectURL(imagePreview.value);
//   }
// };

watch(
  () => [form.value.tglPengerjaan, form.value.jenisOrderKode],
  () => { fetchSisaKuota(); },
  { immediate: true }
);

watch(
  () => form.value.jenisOrderKode,
  (newJenisOrder, oldJenisOrder) => {
    // Selalu ambil daftar size cetak yang baru
    fetchSizeCetakList(newJenisOrder);

    // HANYA kosongkan isian jika user secara manual mengubah jenis order
    // (yaitu, saat nilai lama tidak kosong dan tidak dalam mode edit)
    if (oldJenisOrder && !isEditMode.value) {
      detailsTitik.value.forEach(item => {
        item.sizeCetak = '';
      });
    }
  }
);

watch(
  // Daftar semua state yang perlu dipantau
  [detailsUkuran, detailsTitik, () => form.value.jenisOrderKode, () => form.value.customerLevel],
  async () => {
    calculatePrices();
  },
  { deep: true } // deep: true penting untuk memantau perubahan di dalam array of objects
);

onMounted(() => {
  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin untuk ${requiredPermission.value === 'insert' ? 'membuat' : 'mengubah'} data.`);
    router.back();
    return;
  }
  const nomor = route.params.nomor as string;
  if (nomor) {
    fetchDataForEdit(nomor);
  } else {
    resetForm();
    isLoading.value = false;
  }
  fetchUkuranKaosList();
});

</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-printer-3d-nozzle">
    <template #header-actions>
      <v-btn size="small" color="primary" @click="save" :loading="isSaving"
        prepend-icon="mdi-content-save">Simpan</v-btn>
      <v-btn v-if="!isEditMode" size="small"
        @click="showConfirmation(resetForm, 'Anda yakin ingin membatalkan? Semua isian akan dikosongkan.')"
        prepend-icon="mdi-refresh">
        Batal
      </v-btn>
      <v-btn size="small"
        @click="showConfirmation(cancel, 'Anda yakin ingin menutup form? Perubahan yang belum disimpan akan hilang.')"
        prepend-icon="mdi-close">
        Tutup
      </v-btn>
    </template>

    <div class="form-grid-container" v-if="!isLoading">
      <!-- LEFT COLUMN -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6"><v-text-field label="Nomor" :model-value="form.nomor || '<Otomatis>'" readonly
                variant="filled" density="compact" hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tanggal" v-model="form.tanggal" type="date" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Tgl Pengerjaan" v-model="form.tglPengerjaan" type="date"
                variant="outlined" density="compact" hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Dateline Customer" v-model="form.datelineCustomer" type="date"
                variant="outlined" density="compact" hide-details /></v-col>
            <v-col cols="12"><v-text-field label="Sales"
                :model-value="form.salesKode ? `${form.salesKode} - ${form.salesNama}` : ''" readonly
                @click="openSalesSearch" @keydown.f1.prevent="openSalesSearch" variant="outlined" density="compact"
                hide-details append-inner-icon="mdi-magnify" placeholder="F1 atau klik..." /></v-col>
            <v-col cols="12"><v-text-field label="Customer"
                :model-value="form.customerKode ? `${form.customerKode} - ${form.customerNama}` : ''" readonly
                @click="openCustomerSearch" variant="outlined" density="compact" hide-details
                append-inner-icon="mdi-magnify" placeholder="Klik untuk mencari..." /></v-col>
            <v-col cols="6"><v-text-field label="Level" :model-value="form.customerLevel" readonly filled
                variant="outlined" density="compact" hide-details /></v-col>
            <v-col cols="6"><v-text-field label="Sisa Kuota" :model-value="sisaKuota" readonly filled variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="8">
              <v-text-field label="Jenis Order"
                :model-value="form.jenisOrderKode ? `${form.jenisOrderKode} - ${form.jenisOrderNama}` : ''" readonly
                @click="isEditMode ? null : openJenisOrderSearch()"
                @keydown.f1.prevent="isEditMode ? null : openJenisOrderSearch()" variant="outlined" density="compact"
                hide-details append-inner-icon="mdi-magnify" placeholder="F1 atau klik untuk mencari..."
                :class="{ 'field-disabled': isEditMode }" />
            </v-col>
            <v-col cols="4"><v-text-field label="Harga/cm2" :model-value="form.hargaPerCm" readonly filled
                variant="outlined" density="compact" hide-details /></v-col>
            <v-col cols="12"><v-text-field label="Nama DTF" v-model="form.namaDtf" variant="outlined" density="compact"
                hide-details /></v-col>
            <v-col cols="12"><v-text-field label="Kain" :model-value="form.kain" @click="openJenisKainSearch"
                @keydown.f1.prevent="openJenisKainSearch" variant="outlined" density="compact" hide-details
                append-inner-icon="mdi-magnify" placeholder="F1 atau klik..." /></v-col>
            <v-col cols="12"><v-text-field label="Finishing" v-model="form.finishing" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="12"><v-text-field label="Bag. Desain" v-model="form.desain" variant="outlined"
                density="compact" hide-details /></v-col>
            <v-col cols="12"><v-text-field label="Workshop"
                :model-value="form.workshopKode ? `${form.workshopKode} - ${form.workshopNama}` : ''"
                @click="openWorkshopSearch" @keydown.f1.prevent="openWorkshopSearch" variant="outlined"
                density="compact" hide-details append-inner-icon="mdi-magnify" placeholder="F1 atau klik..."
                readonly /></v-col>
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
                <v-text-field label="Total Jumlah" :model-value="totalJumlahKaos" readonly filled density="compact"
                  hide-details style="max-width: 120px;" />
              </div>
              <v-table density="compact" class="desktop-table">
                <thead>
                  <tr>
                    <th style="width: 40px;">#</th>
                    <th>Ukuran</th>
                    <th class="text-end" style="width: 90px;">Jumlah</th>
                    <th class="text-end" style="width: 120px;">Harga/Pcs</th>
                    <th style="width: 40px;"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in detailsUkuran" :key="item.id">
                    <td class="pt-2 text-center">{{ index + 1 }}</td>
                    <td>
                      <v-combobox v-model="item.ukuran" :items="ukuranKaosList" @update:model-value="addDetailUkuran"
                        variant="underlined" density="compact" hide-details />
                    </td>
                    <td>
                      <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" density="compact"
                        hide-details class="text-end" min="0" />
                    </td>
                    <td>
                      <v-text-field v-model.number="item.harga" type="number" variant="underlined" density="compact"
                        hide-details class="text-end" :readonly="isHargaReadonly" />
                    </td>
                    <td>
                      <v-btn v-if="index < detailsUkuran.length - 1" icon="mdi-delete" size="x-small" variant="text"
                        color="error" @click="removeDetailUkuran(item.id)" />
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
                <v-text-field label="Total Titik" :model-value="totalTitik" readonly filled density="compact"
                  hide-details style="max-width: 120px;" />
              </div>
              <v-table density="compact" class="desktop-table">
                <thead>
                  <tr>
                    <th style="width: 40px;">#</th>
                    <th>Keterangan</th>
                    <th style="width: 100px;">Size Cetak</th>
                    <th class="text-end" style="width: 70px;">P(cm)</th>
                    <th class="text-end" style="width: 70px;">L(cm)</th>
                    <th style="width: 40px;"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in detailsTitik" :key="item.id">
                    <td class="pt-2 text-center">{{ index + 1 }}</td>
                    <td>
                      <v-text-field v-model="item.keterangan" @update:model-value="addDetailTitik" variant="underlined"
                        density="compact" hide-details />
                    </td>
                    <td>
                      <v-combobox v-model="item.sizeCetak" :items="sizeCetakList"
                        @update:model-value="onSizeCetakChange(item, index)" variant="underlined" density="compact"
                        hide-details />
                    </td>
                    <td>
                      <v-text-field v-model.number="item.panjang" type="number" variant="underlined" density="compact"
                        hide-details class="text-end" :readonly="isPanjangLebarReadonly(item)"
                        :class="{ 'field-readonly': isPanjangLebarReadonly(item) }" />
                    </td>
                    <td>
                      <v-text-field v-model.number="item.lebar" type="number" variant="underlined" density="compact"
                        hide-details class="text-end" :readonly="isPanjangLebarReadonly(item)"
                        :class="{ 'field-readonly': isPanjangLebarReadonly(item) }" />
                    </td>
                    <td>
                      <v-btn v-if="index < detailsTitik.length - 1" icon="mdi-delete" size="x-small" variant="text"
                        color="error" @click="removeDetailTitik(item.id)" />
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-col>

          <!-- KOLOM KANAN: GAMBAR & KETERANGAN -->
          <v-col cols="12" md="6">
            <div class="desktop-form-section mb-4">
              <div class="image-upload-section">
                <!-- File Input -->
                <div class="d-flex align-center ga-2 mb-3">
                  <v-file-input v-model="imageFile" label="Upload Gambar (Max 1MB)" variant="outlined" density="compact"
                    prepend-icon="mdi-camera" hide-details clearable accept="image/jpeg,image/png,image/jpg,image/gif"
                    :loading="isImageUploading" :disabled="isImageUploading"
                    @update:model-value="handleFileSelection" />
                  <v-btn @click="clearImage" :disabled="!imagePreview || isImageUploading" icon="mdi-delete"
                    size="small" variant="tonal" color="error" title="Hapus Gambar" />
                </div>

                <!-- Image Preview -->
                <div class="image-preview-container">
                  <div v-if="imagePreview" class="position-relative">
                    <v-img :src="imagePreview" height="200" aspect-ratio="16/9" cover
                      class="border rounded elevation-1 cursor-pointer"
                      @click="imagePreview ? isImageFullscreenVisible = true : null" title="Klik untuk memperbesar">
                      <v-overlay v-if="isImageUploading" contained persistent
                        class="d-flex align-center justify-center">
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
                      <v-chip v-else-if="form.imageUrl && imagePreview" size="small" color="success" variant="tonal">
                        <v-icon start size="small">mdi-check</v-icon>
                        Tersimpan di server
                      </v-chip>
                    </div>
                  </div>

                  <!-- Placeholder -->
                  <div v-else class="border rounded d-flex align-center justify-center bg-grey-lighten-4"
                    style="height: 200px;">
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
                  <div class="text-caption text-center mt-1">
                    Sedang mengunggah gambar...
                  </div>
                </div>
              </div>
            </div>

            <!-- Keterangan di bawah gambar -->
            <div class="desktop-form-section">
              <v-textarea label="Keterangan" v-model="form.keterangan" rows="6" variant="outlined" density="compact"
                hide-details />
            </div>
          </v-col>
        </v-row>
      </div>
    </div>
    <v-skeleton-loader v-else type="article, actions"></v-skeleton-loader>

    <!-- Modals -->
    <CustomerSearchModal v-if="isCustomerSearchVisible" :gudang="form.workshopKode"
      @close="isCustomerSearchVisible = false" @customer-selected="onCustomerSelected" />
    <SalesSearchModal v-if="isSalesSearchVisible" @close="isSalesSearchVisible = false"
      @sales-selected="onSalesSelected" />
    <JenisOrderSearchModal v-if="isJenisOrderSearchVisible" @close="isJenisOrderSearchVisible = false"
      @jenis-order-selected="onJenisOrderSelected" />
    <JenisKainSearchModal v-if="isJenisKainSearchVisible" @close="isJenisKainSearchVisible = false"
      @jenis-kain-selected="onJenisKainSelected" />
    <WorkshopSearchModal v-if="isWorkshopSearchVisible" @close="isWorkshopSearchVisible = false"
      @workshop-selected="onWorkshopSelected" />

    <!-- Fullscreen Image Modal -->
    <v-dialog v-model="isImageFullscreenVisible" max-width="90vw">
      <v-card>
        <v-toolbar density="compact" color="primary" dark>
          <v-toolbar-title>
            <v-icon start>mdi-image</v-icon>
            Preview Gambar - {{ form.nomor || 'SO Baru' }}
          </v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" @click="isImageFullscreenVisible = false" variant="text" />
        </v-toolbar>

        <v-card-text class="pa-4 bg-grey-lighten-4">
          <div class="d-flex justify-center align-center" style="min-height: 60vh;">
            <v-img :src="imagePreview" max-height="80vh" max-width="100%" contain class="rounded elevation-2" />
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
          <v-btn color="primary" @click="isImageFullscreenVisible = false" prepend-icon="mdi-close" variant="tonal">
            Tutup
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirmation Dialog -->
    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">
          Konfirmasi
        </v-card-title>
        <v-card-text>
          {{ confirmText }}
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">
            Tidak
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="executePendingAction">
            Ya, Lanjutkan
          </v-btn>
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
  background-color: #f5f5f5;
  pointer-events: none;
}

.field-readonly {
  background-color: #fafafa;
}

.field-readonly :deep(input) {
  color: #666;
}

.cursor-pointer {
  cursor: pointer;
  transition: opacity 0.2s;
}

.cursor-pointer:hover {
  opacity: 0.9;
}

.image-upload-section {
  background-color: #fafafa;
  border: 1px solid #e0e0e0;
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

.cursor-pointer {
  cursor: pointer;
  transition: opacity 0.2s;
}

.cursor-pointer:hover {
  opacity: 0.9;
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";

interface Cabang {
  kode: string;
  nama: string;
}

interface ManifestKirimHeader {
  Nomor: string;
  Tanggal: string;
  Jam?: string;
  Gudang: string;
  Tujuan?: string;
  NamaGudang?: string;
  JenisKirim: string;
  Driver: string;
  PlatNomor: string;
  Ekspedisi: string;
  NoResi: string;
  TotalSj: number;
  TotalKoli: number;
  TotalQty: number;
  BeratKg?: number;
  Keterangan?: string;
  Status: string;
  Usr?: string;
  DateCreate?: string;
  ttdPengirim?: string;
  ttdDriver?: string;
}

interface ManifestKirimItem {
  idDrec?: string;
  manifestNomor?: string;
  sjNomor: string;
  sjTanggal?: string;
  noPackingList?: string;
  storeKode: string;
  storeNama?: string;
  koli: number;
  qty: number;
  keterangan?: string;
  referensiGabung?: string;
}

interface AvailableSjItem {
  sjNomor: string;
  sjTanggal: string;
  noMinta?: string;
  noPackingList?: string;
  storeKode: string;
  storeNama: string;
  keterangan?: string;
  totalQty: number;
}

const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();

// Parameters & Layout State
const editNomor = computed(() => (route.query.nomor as string) || "");
const isNew = computed(() => !editNomor.value);
const isLeftColumnVisible = ref(true);

// Loading & Modal State
const loading = ref(false);
const saving = ref(false);
const cabangList = ref<Cabang[]>([]);

// Lookup Modals State
const showGudangAsalModal = ref(false);
const showGudangTujuanModal = ref(false);

// User Cabang Info
const userCabangKode = computed(
  () =>
    (authStore.user as { cabang?: string; Cabang?: string })?.cabang ||
    (authStore.user as { cabang?: string; Cabang?: string })?.Cabang ||
    ""
);
const userCabangNama = computed(
  () =>
    (authStore.user as { cabangNama?: string; CabangNama?: string })?.cabangNama ||
    (authStore.user as { cabangNama?: string; CabangNama?: string })?.CabangNama ||
    ""
);

// Header State
const header = reactive({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  jam: format(new Date(), "HH:mm"),
  gudang: userCabangKode.value || "",
  tujuan: "",
  jenisKirim: "ARMADA_SENDIRI",
  driver: "",
  platNomor: "",
  ekspedisi: "",
  noResi: "",
  beratKg: 0,
  keterangan: "",
  status: "TERCATAT",
  dateCreate: "",
  ttdPengirim: "",
  ttdDriver: "",
});

// Items Selected in Manifest
const items = ref<ManifestKirimItem[]>([]);

// TTD Signature Modal State
const showTtdModal = ref(false);
const ttdRole = ref<"pengirim" | "driver">("pengirim");
const signatureCanvasRef = ref<HTMLCanvasElement | null>(null);
const isDrawing = ref(false);
let ctx: CanvasRenderingContext2D | null = null;

const openTtdModal = (role: "pengirim" | "driver") => {
  ttdRole.value = role;
  showTtdModal.value = true;
  nextTick(() => {
    initCanvas();
  });
};

const initCanvas = () => {
  const canvas = signatureCanvasRef.value;
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || 440;
  canvas.height = 180;
  ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const existing = ttdRole.value === "pengirim" ? header.ttdPengirim : header.ttdDriver;
  if (existing) {
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
    };
    img.src = existing;
  } else {
    clearSignature();
  }
};

const getCanvasCoords = (e: MouseEvent | TouchEvent) => {
  const canvas = signatureCanvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  let clientX = 0;
  let clientY = 0;
  if ("touches" in e && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if ("clientX" in e) {
    clientX = (e as MouseEvent).clientX;
    clientY = (e as MouseEvent).clientY;
  }
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
};

const startDrawing = (e: MouseEvent | TouchEvent) => {
  e.preventDefault();
  isDrawing.value = true;
  if (!ctx) return;
  const coords = getCanvasCoords(e);
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
};

const draw = (e: MouseEvent | TouchEvent) => {
  if (!isDrawing.value || !ctx) return;
  e.preventDefault();
  const coords = getCanvasCoords(e);
  ctx.lineTo(coords.x, coords.y);
  ctx.stroke();
};

const stopDrawing = () => {
  isDrawing.value = false;
};

const clearSignature = () => {
  const canvas = signatureCanvasRef.value;
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
};

const saveSignature = () => {
  const canvas = signatureCanvasRef.value;
  if (!canvas) return;
  const dataUrl = canvas.toDataURL("image/png");
  if (ttdRole.value === "pengirim") {
    header.ttdPengirim = dataUrl;
    toast.success("Tanda Tangan Pengirim disimpan.");
  } else {
    header.ttdDriver = dataUrl;
    toast.success("Tanda Tangan Driver disimpan.");
  }
  showTtdModal.value = false;
};

// Modal Selection Available SJ & Barcode Scanner
const showSjModal = ref(false);
const availableSjList = ref<AvailableSjItem[]>([]);
const loadingAvailableSj = ref(false);
const sjSearch = ref("");
const scannedBarcode = ref("");
const barcodeInputRef = ref<{ focus: () => void; $el?: HTMLElement } | null>(null);

const focusBarcodeInput = () => {
  setTimeout(() => {
    if (barcodeInputRef.value) {
      if (typeof barcodeInputRef.value.focus === "function") {
        barcodeInputRef.value.focus();
      } else if (barcodeInputRef.value.$el?.querySelector("input")) {
        (barcodeInputRef.value.$el.querySelector("input") as HTMLInputElement)?.focus();
      }
    }
  }, 50);
};

// Handlers Selection Gudang
const onGudangAsalSelected = (selectedGudang: { kode: string; nama: string }) => {
  if (!cabangList.value.some((c) => c.kode === selectedGudang.kode)) {
    cabangList.value.push(selectedGudang);
  }
  header.gudang = selectedGudang.kode;
  showGudangAsalModal.value = false;
};

const onGudangTujuanSelected = (selectedGudang: { kode: string; nama: string }) => {
  if (!cabangList.value.some((c) => c.kode === selectedGudang.kode)) {
    cabangList.value.push(selectedGudang);
  }
  header.tujuan = selectedGudang.kode;
  showGudangTujuanModal.value = false;
};

// Auto select gudang pengirim jika input cocok dengan kode/nama secara langsung
const onGudangAsalSearch = (val: string) => {
  if (!val) return;
  const match = cabangList.value.find((c) => c.kode.toUpperCase() === val.trim().toUpperCase());
  if (match) {
    header.gudang = match.kode;
  }
};

// Auto select gudang tujuan jika input cocok dengan kode/nama secara langsung
const onGudangTujuanSearch = (val: string) => {
  if (!val) return;
  const match = cabangList.value.find((c) => c.kode.toUpperCase() === val.trim().toUpperCase());
  if (match) {
    header.tujuan = match.kode;
  }
};

// User & Serah Terima Info
const currentUser = computed(
  () => authStore.user?.nama || authStore.user?.kode || "Petugas Gudang"
);

// Display Computed Nomor Manifest (Format: [GUDANG].MP.[YYMM].[NNNN])
const displayManifestNomor = computed(() => {
  if (header.nomor) return header.nomor;
  const dateObj = header.tanggal ? new Date(header.tanggal) : new Date();
  const yyMM = format(dateObj, "yyMM");
  const gudangKode = header.gudang ? header.gudang.trim().toUpperCase() : "KDC";
  return `${gudangKode}.MP.${yyMM}.XXXX`;
});

// Helper formatting title item autocomplete
const getCabangTitle = (item: unknown): string => {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (typeof item === "object" && item !== null) {
    const rawObj = item as { raw?: Cabang; kode?: string; nama?: string };
    const raw = rawObj.raw ? rawObj.raw : (rawObj as Cabang);
    if (!raw || (!raw.kode && !raw.nama)) return "";
    return `${raw.kode || ""} - ${raw.nama || ""}`;
  }
  return String(item);
};

// Fetch daftar gudang/cabang dari tgudang
const fetchCabangList = async () => {
  try {
    const response = await api.get<Cabang[]>("/surat-jalan/lookup/cabang");
    cabangList.value = response.data;
  } catch (error: unknown) {
    console.error("Gagal memuat daftar gudang/cabang", error);
  }
};

// Filter Available SJ yang belum ada di daftar items saat ini & sesuai header.tujuan
const filteredAvailableSj = computed(() => {
  const existingSjSet = new Set(items.value.map((i) => i.sjNomor));
  return availableSjList.value.filter((sj) => {
    // 1. Abaikan SJ yang sudah dimuat di tabel
    if (existingSjSet.has(sj.sjNomor)) return false;

    // 2. Jika tujuan pengiriman di header sudah dipilih/terisi,
    // filter hanya SJ yang menuju ke store/gudang tujuan yang sama!
    if (header.tujuan) {
      return sj.storeKode.toUpperCase() === header.tujuan.trim().toUpperCase();
    }

    return true;
  });
});

// Total Computation
const totalSj = computed(() => items.value.length);
const totalKoliFisik = computed(() =>
  items.value.reduce((acc, cur) => acc + (Number(cur.koli) || 0), 0)
);
const totalQtyPcs = computed(() =>
  items.value.reduce((acc, cur) => acc + (Number(cur.qty) || 0), 0)
);

// Available Options for Referensi Gabungan
const otherSjOptions = (currentSjNomor: string) => {
  return items.value
    .filter((i) => i.sjNomor !== currentSjNomor && i.koli > 0)
    .map((i) => ({
      title: `${i.sjNomor} (${i.storeNama || i.storeKode})`,
      value: i.sjNomor,
    }));
};

// Helper tracking SJ apa saja yang bergabung ke SJ tertentu
const getAttachedSjs = (sjNomor: string) => {
  return items.value.filter((i) => i.referensiGabung === sjNomor).map((i) => i.sjNomor);
};

// Load Available SJ langsung via api instance
const loadAvailableSj = async () => {
  loadingAvailableSj.value = true;
  try {
    const response = await api.get<AvailableSjItem[]>("/manifest-kirim/available-sj", {
      params: {
        gudang: header.gudang,
        store: sjSearch.value,
      },
    });
    availableSjList.value = response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    toast.error(err.response?.data?.message || "Gagal memuat daftar Surat Jalan.");
  } finally {
    loadingAvailableSj.value = false;
  }
};

let sjDebounceTimer: ReturnType<typeof setTimeout>;
watch(sjSearch, () => {
  clearTimeout(sjDebounceTimer);
  sjDebounceTimer = setTimeout(() => {
    loadAvailableSj();
  }, 400);
});

// Watcher items untuk mengisi otomatis tujuan pengiriman dari item pertama jika belum diisi
watch(
  items,
  (newItems) => {
    if (newItems.length > 0 && !header.tujuan) {
      header.tujuan = newItems[0].storeKode;
    }
  },
  { deep: true }
);

const openSjModal = () => {
  sjSearch.value = "";
  showSjModal.value = true;
  loadAvailableSj();
};

// Tambah SJ ke Manifest
const addSjToManifest = (sj: AvailableSjItem) => {
  // Jika header.tujuan sudah diisi dan beda dengan storeKode SJ yang coba ditambahkan
  if (header.tujuan && header.tujuan.trim().toUpperCase() !== sj.storeKode.toUpperCase()) {
    toast.error(
      `SJ ${sj.sjNomor} bertujuan ke ${
        sj.storeNama || sj.storeKode
      }, tidak sesuai dengan Tujuan Pengiriman (${header.tujuan}).`
    );
    return;
  }

  items.value.push({
    sjNomor: sj.sjNomor,
    sjTanggal: sj.sjTanggal,
    noPackingList: sj.noPackingList || `PL-${sj.sjNomor.split(".").pop() || "001"}`,
    storeKode: sj.storeKode,
    storeNama: sj.storeNama,
    koli: 1, // Default custom input koli user = 1
    qty: sj.totalQty,
    keterangan: "",
    referensiGabung: "",
  });

  // Jika header.tujuan belum diisi, otomatis isi dari SJ pertama ini!
  if (!header.tujuan) {
    header.tujuan = sj.storeKode;
  }

  toast.success(`Surat Jalan ${sj.sjNomor} ditambahkan ke manifest.`);
  focusBarcodeInput();
};

const processSingleCode = async (code: string) => {
  if (!code) return;

  const exists = items.value.some(
    (i) =>
      i.sjNomor.toUpperCase() === code.toUpperCase() ||
      (i.noPackingList && i.noPackingList.toUpperCase() === code.toUpperCase())
  );
  if (exists) {
    toast.warning(`Surat Jalan / PL ${code} sudah ada di dalam manifest.`);
    return;
  }

  const match = availableSjList.value.find(
    (sj) =>
      sj.sjNomor.toUpperCase() === code.toUpperCase() ||
      (sj.noPackingList && sj.noPackingList.toUpperCase() === code.toUpperCase())
  );

  if (match) {
    addSjToManifest(match);
    return;
  }

  try {
    const response = await api.get<AvailableSjItem[]>("/manifest-kirim/available-sj", {
      params: {
        gudang: header.gudang,
        store: code,
      },
    });
    const found = response.data.find(
      (sj) =>
        sj.sjNomor.toUpperCase() === code.toUpperCase() ||
        (sj.noPackingList && sj.noPackingList.toUpperCase() === code.toUpperCase()) ||
        sj.storeKode.toUpperCase() === code.toUpperCase()
    );

    if (found) {
      addSjToManifest(found);
    } else if (response.data.length === 1) {
      addSjToManifest(response.data[0]);
    } else if (response.data.length > 1) {
      availableSjList.value = response.data;
      sjSearch.value = code;
      showSjModal.value = true;
      toast.info(`Ditemukan ${response.data.length} Surat Jalan. Silakan pilih.`);
    } else {
      toast.error(`Surat Jalan / Packing List "${code}" tidak ditemukan atau tidak tersedia.`);
    }
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    toast.error(err.response?.data?.message || "Gagal memindai Surat Jalan.");
  }
};

// Scan Barcode (Dapat memproses 1 atau beberapa barcode berurutan sekaligus)
const handleBarcodeScan = async () => {
  const rawInput = scannedBarcode.value ? scannedBarcode.value.trim() : "";
  if (!rawInput) return;

  scannedBarcode.value = "";

  const codes = rawInput
    .split(/[\r\n,\s]+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  for (const code of codes) {
    await processSingleCode(code);
  }

  focusBarcodeInput();
};

const handleScannerKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleBarcodeScan();
  }
};

// Handler pengaman input koli (wajib angka non-negatif)
const onKoliInput = (item: ManifestKirimItem) => {
  if (
    item.koli === undefined ||
    item.koli === null ||
    isNaN(Number(item.koli)) ||
    Number(item.koli) < 0
  ) {
    item.koli = 0;
  } else {
    item.koli = Math.floor(Math.abs(Number(item.koli)));
  }

  // Jika Koli > 0 (MANDIRI), reset referensiGabung menjadi "" agar tidak nyangkut
  if (Number(item.koli) > 0) {
    item.referensiGabung = "";
  } else {
    // Jika Koli diubah menjadi 0, SJ ini tidak bisa lagi menjadi induk/penampung SJ lain.
    // Bersihkan referensiGabung pada SJ lain yang menunjuk ke SJ ini.
    items.value.forEach((other) => {
      if (other.referensiGabung === item.sjNomor) {
        other.referensiGabung = "";
      }
    });
  }
};

// Hapus SJ dari Manifest
const removeSjFromManifest = (index: number) => {
  const removed = items.value[index];
  items.value.splice(index, 1);
  if (removed) {
    // Bersihkan referensiGabung pada SJ lain yang menunjuk ke SJ yang dihapus ini
    items.value.forEach((other) => {
      if (other.referensiGabung === removed.sjNomor) {
        other.referensiGabung = "";
      }
    });
  }
};

// Load Data jika Edit
const loadEditData = async () => {
  if (!editNomor.value) return;
  loading.value = true;
  try {
    const response = await api.get<{ header: ManifestKirimHeader; items: ManifestKirimItem[] }>(
      `/manifest-kirim/${encodeURIComponent(editNomor.value)}`
    );
    const h = response.data.header;
    header.nomor = h.Nomor;
    header.tanggal = h.Tanggal
      ? format(new Date(h.Tanggal), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd");
    header.jam = h.Jam || format(new Date(), "HH:mm");
    header.gudang = h.Gudang;
    header.tujuan = h.Tujuan || (items.value.length > 0 ? items.value[0].storeKode : "");
    header.jenisKirim = h.JenisKirim || "ARMADA_SENDIRI";
    header.driver = h.Driver || "";
    header.platNomor = h.PlatNomor || "";
    header.ekspedisi = h.Ekspedisi || "";
    header.noResi = h.NoResi || "";
    header.beratKg = h.BeratKg || 0;
    header.keterangan = h.Keterangan || "";
    header.status = h.Status || "TERCATAT";
    header.dateCreate = h.DateCreate || "";
    header.ttdPengirim = h.ttdPengirim || "";
    header.ttdDriver = h.ttdDriver || "";

    items.value = response.data.items.map((it) => ({
      ...it,
      noPackingList: it.noPackingList || `PL-${it.sjNomor.split(".").pop() || "001"}`,
      referensiGabung: it.referensiGabung || "",
    }));
    if (items.value.length > 0 && !header.tujuan) {
      header.tujuan = items.value[0].storeKode;
    }
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    toast.error(err.response?.data?.message || "Gagal memuat data edit manifest.");
    router.push("/gudang-dc/operasional/manifest-kirim");
  } finally {
    loading.value = false;
  }
};

// Simpan Manifest
const submitForm = async (targetStatus = "DIKIRIM") => {
  if (!header.tanggal) {
    toast.error("Tanggal manifest harus diisi.");
    return;
  }
  if (!header.gudang) {
    toast.error("Pengirim (Gudang Asal) harus dipilih.");
    return;
  }
  if (items.value.length === 0) {
    toast.error("Pilih minimal satu Surat Jalan untuk dimuat ke manifest.");
    return;
  }

  if (!header.tujuan && items.value.length > 0) {
    header.tujuan = items.value[0].storeKode;
  }

  // Validasi Koli (wajib angka non-negatif)
  for (const item of items.value) {
    if (
      item.koli === undefined ||
      item.koli === null ||
      isNaN(Number(item.koli)) ||
      Number(item.koli) < 0
    ) {
      toast.error(`Jumlah Koli untuk SJ ${item.sjNomor} tidak valid (harus angka, minimal 0).`);
      return;
    }
  }

  // Validasi Koli 0 wajib referensi gabung
  const invalidItem = items.value.find((i) => Number(i.koli) === 0 && !i.referensiGabung);
  if (invalidItem) {
    toast.error(
      `SJ ${invalidItem.sjNomor} memiliki Koli 0. WAJIB pilih referensi penggabungan SJ!`
    );
    return;
  }

  saving.value = true;
  header.status = targetStatus;
  try {
    const response = await api.post<{ message: string; nomor: string }>("/manifest-kirim", {
      header: { ...header },
      items: items.value,
      isNew: isNew.value,
    });
    toast.success(response.data.message);
    router.push("/gudang-dc/operasional/manifest-kirim");
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    toast.error(err.response?.data?.message || "Gagal menyimpan Manifest Kirim.");
  } finally {
    saving.value = false;
  }
};

const goBack = () => {
  router.push("/gudang-dc/operasional/manifest-kirim");
};

onMounted(async () => {
  await fetchCabangList();
  const uKode = userCabangKode.value;
  const uNama = userCabangNama.value;
  if (uKode) {
    if (!cabangList.value.some((c) => c.kode === uKode)) {
      cabangList.value.push({ kode: uKode, nama: uNama || uKode });
    }
    if (isNew.value && !header.gudang) {
      header.gudang = uKode;
    }
  }
  if (!isNew.value) {
    loadEditData();
  }
});
</script>

<template>
  <PageLayout
    :title="
      isNew ? 'Buat Manifest Pengiriman' : `Edit Manifest: ${header.nomor} ${displayManifestNomor}`
    "
    icon="mdi-truck-cargo-container"
  >
    <template #header-actions>
      <v-btn
        size="small"
        :color="isLeftColumnVisible ? 'blue-grey' : 'primary'"
        :variant="isLeftColumnVisible ? 'tonal' : 'flat'"
        :prepend-icon="isLeftColumnVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
        @click="isLeftColumnVisible = !isLeftColumnVisible"
      >
        {{ isLeftColumnVisible ? "Sembunyikan Header" : "Tampilkan Header" }}
      </v-btn>
      <v-btn
        size="small"
        color="primary"
        prepend-icon="mdi-content-save"
        :loading="saving"
        @click="submitForm('DIKIRIM')"
      >
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh" @click="goBack"> Batal </v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="goBack"> Tutup </v-btn>
    </template>

    <div class="form-grid-container" :class="{ 'hide-left': !isLeftColumnVisible }">
      <!-- Left Column: Header -->
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="12" v-if="!isNew">
              <v-text-field
                label="Nomor Manifest"
                v-model="header.nomor"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                label="Tanggal Pengiriman"
                v-model="header.tanggal"
                type="date"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>

            <v-col cols="12">
              <v-autocomplete
                label="Pengirim"
                v-model="header.gudang"
                :items="cabangList"
                :item-title="getCabangTitle"
                item-value="kode"
                placeholder="Cari Kode / Nama Asal..."
                persistent-placeholder
                density="compact"
                variant="outlined"
                hide-details
                clearable
                auto-select-first
                @update:search="onGudangAsalSearch"
                @click:append-inner="showGudangAsalModal = true"
              >
                <template #selection="{ item }">
                  <div
                    v-if="item && item.raw && typeof item.raw === 'object' && item.raw.kode"
                    class="d-flex align-center gap-1 overflow-hidden"
                  >
                    <v-chip
                      color="primary"
                      size="x-small"
                      variant="flat"
                      class="font-weight-bold me-1 flex-shrink-0"
                    >
                      {{ item.raw.kode }}
                    </v-chip>
                    <span class="text-caption font-weight-medium text-truncate">{{
                      item.raw.nama
                    }}</span>
                  </div>
                  <span v-else-if="item && item.title" class="text-caption font-weight-medium">{{
                    item.title
                  }}</span>
                </template>

                <template #item="{ props: itemProps, item }">
                  <v-list-item v-bind="itemProps" title="">
                    <template #title>
                      <div class="d-flex align-center gap-2">
                        <v-chip
                          color="primary"
                          size="x-small"
                          variant="flat"
                          class="font-weight-bold me-1"
                        >
                          {{ item.raw.kode }}
                        </v-chip>
                        <span class="font-weight-medium text-caption">{{ item.raw.nama }}</span>
                      </div>
                    </template>
                  </v-list-item>
                </template>
              </v-autocomplete>
            </v-col>

            <v-col cols="12">
              <v-autocomplete
                label="Tujuan Pengiriman"
                v-model="header.tujuan"
                :items="cabangList"
                :item-title="getCabangTitle"
                item-value="kode"
                placeholder="Cari Kode / Nama Tujuan..."
                persistent-placeholder
                density="compact"
                variant="outlined"
                hide-details
                clearable
                auto-select-first
                @update:search="onGudangTujuanSearch"
                @click:append-inner="showGudangTujuanModal = true"
              >
                <template #selection="{ item }">
                  <div
                    v-if="item && item.raw && typeof item.raw === 'object' && item.raw.kode"
                    class="d-flex align-center gap-1 overflow-hidden"
                  >
                    <v-chip
                      color="secondary"
                      size="x-small"
                      variant="flat"
                      class="font-weight-bold me-1 flex-shrink-0"
                    >
                      {{ item.raw.kode }}
                    </v-chip>
                    <span class="text-caption font-weight-medium text-truncate">{{
                      item.raw.nama
                    }}</span>
                  </div>
                  <span v-else-if="item && item.title" class="text-caption font-weight-medium">{{
                    item.title
                  }}</span>
                </template>

                <template #item="{ props: itemProps, item }">
                  <v-list-item v-bind="itemProps" title="">
                    <template #title>
                      <div class="d-flex align-center gap-2">
                        <v-chip
                          color="secondary"
                          size="x-small"
                          variant="flat"
                          class="font-weight-bold me-1"
                        >
                          {{ item.raw.kode }}
                        </v-chip>
                        <span class="font-weight-medium text-caption">{{ item.raw.nama }}</span>
                      </div>
                    </template>
                  </v-list-item>
                </template>
              </v-autocomplete>
            </v-col>

            <v-col cols="12">
              <v-select
                label="Metode Pengiriman"
                v-model="header.jenisKirim"
                :items="[
                  { title: 'Internal (Armada Sendiri)', value: 'ARMADA_SENDIRI' },
                  { title: 'Ekspedisi / Paket', value: 'EKSPEDISI' },
                  { title: 'Ambil Sendiri', value: 'AMBIL_SENDIRI' },
                ]"
                item-title="title"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                label="Driver"
                v-model="header.driver"
                placeholder="Nama Driver"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>

            <v-col cols="12" v-if="header.jenisKirim === 'EKSPEDISI'">
              <v-text-field
                label="Ekspedisi"
                v-model="header.ekspedisi"
                placeholder="Contoh: JNE / POS"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>

            <v-col cols="12" v-if="header.jenisKirim === 'EKSPEDISI'">
              <v-text-field
                label="No. Resi"
                v-model="header.noResi"
                placeholder="Masukkan No. Resi (opsional)"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>

            <v-col
              cols="12"
              v-if="header.jenisKirim === 'ARMADA_SENDIRI' || header.jenisKirim === 'KURIR'"
            >
              <v-text-field
                label="Kendaraan / Plat Nomor"
                v-model="header.platNomor"
                placeholder="B 1234 XX"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                label="Catatan Pengiriman"
                v-model="header.keterangan"
                placeholder="Catatan tambahan..."
                rows="3"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>
          </v-row>
        </div>
      </div>

      <!-- Right Column: Details -->
      <div class="right-column">
        <div class="desktop-form-section d-flex flex-column fill-height">
          <div class="d-flex align-center gap-2 mb-2">
            <!-- Scanner — flex-grow agar melebar -->
            <v-text-field
              ref="barcodeInputRef"
              v-model="scannedBarcode"
              label="Scan Barcode di Sini..."
              placeholder="Input barcode lalu tekan Enter"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-barcode-scan"
              hide-details
              clearable
              autofocus
              style="flex: 1; min-width: 0"
              @keydown="handleScannerKeydown"
            />

            <v-btn
              size="small"
              color="primary"
              prepend-icon="mdi-plus"
              class="font-weight-medium"
              @click="openSjModal"
            >
              + Tambah SJ
            </v-btn>
          </div>

          <!-- Table List dengan Header Biru Tua -->
          <v-table
            density="compact"
            class="manifest-table desktop-table fill-height-table border rounded-lg"
          >
            <thead>
              <tr
                class="bg-grey-lighten-3 text-uppercase text-caption font-weight-bold text-center"
              >
                <th style="width: 40px" class="text-center">No.</th>
                <th style="width: 150px" class="text-center">No. Surat Jalan</th>
                <th style="width: 95px" class="text-center">Tanggal SJ</th>
                <th style="width: 140px" class="text-center">No. Packing List</th>
                <th class="text-center">Nama Store</th>
                <th style="width: 100px" class="text-center">Qty (Pcs)</th>
                <th style="width: 100px" class="text-center">Koli</th>
                <th style="width: 100px" class="text-center">Status</th>
                <th style="width: 200px" class="text-center">Referensi Gabung</th>
                <th style="width: 140px" class="text-center">Keterangan</th>
                <th style="width: 50px" class="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="items.length === 0">
                <td colspan="11" class="text-center py-6 text-grey">
                  Belum ada Surat Jalan dalam manifest ini. Klik
                  <strong>"+ Tambah SJ / PL"</strong> untuk menambahkan data.
                </td>
              </tr>
              <tr v-for="(item, index) in items" :key="item.sjNomor" class="table-row-hover">
                <td>{{ index + 1 }}</td>
                <td class="font-weight-bold text-primary">{{ item.sjNomor }}</td>
                <td>
                  {{ item.sjTanggal ? format(new Date(item.sjTanggal), "dd-MM-yyyy") : "-" }}
                </td>
                <td class="text-grey-darken-2 font-weight-medium">{{ item.noPackingList }}</td>
                <td class="font-weight-medium">{{ item.storeNama }} ({{ item.storeKode }})</td>
                <td class="text-end font-weight-bold">{{ item.qty }}</td>
                <td class="text-end">
                  <v-text-field
                    v-model.number="item.koli"
                    type="number"
                    min="0"
                    step="1"
                    density="compact"
                    variant="outlined"
                    hide-details
                    class="text-end font-weight-bold input-koli"
                    @input="onKoliInput(item)"
                    @blur="onKoliInput(item)"
                  />
                </td>
                <td class="text-center">
                  <v-chip
                    :color="item.koli > 0 ? 'success' : 'warning'"
                    size="x-small"
                    variant="flat"
                    class="font-weight-bold"
                  >
                    {{ item.koli > 0 ? "MANDIRI" : "DIGABUNG" }}
                  </v-chip>
                </td>
                <td>
                  <v-select
                    v-if="item.koli === 0"
                    v-model="item.referensiGabung"
                    :items="otherSjOptions(item.sjNomor)"
                    item-title="title"
                    item-value="value"
                    placeholder="Pilih SJ Tujuan..."
                    density="compact"
                    variant="outlined"
                    hide-details
                    class="select-compact"
                  />
                  <div
                    v-else-if="getAttachedSjs(item.sjNomor).length > 0"
                    class="d-flex align-center gap-1"
                  >
                    <v-chip color="info" size="x-small" variant="tonal" class="font-weight-bold">
                      <v-icon size="12" class="me-1">mdi-package-variant-closed</v-icon>
                      Menampung {{ getAttachedSjs(item.sjNomor).length }} SJ ({{
                        getAttachedSjs(item.sjNomor).join(", ")
                      }})
                    </v-chip>
                  </div>
                  <span v-else class="text-grey text-caption">-</span>
                </td>
                <td>
                  <v-text-field
                    v-model="item.keterangan"
                    placeholder="Ket..."
                    density="compact"
                    variant="outlined"
                    hide-details
                  />
                </td>
                <td class="text-center">
                  <v-btn
                    icon="mdi-delete-outline"
                    size="x-small"
                    variant="text"
                    color="error"
                    @click="removeSjFromManifest(index)"
                  />
                </td>
              </tr>
            </tbody>

            <!-- Total Footer Row -->
            <tfoot v-if="items.length > 0">
              <tr class="bg-grey-lighten-4 font-weight-bold text-caption">
                <td colspan="5" class="text-end font-weight-bold uppercase pe-4">TOTAL :</td>
                <td class="text-end text-primary font-weight-bold">{{ totalQtyPcs }}</td>
                <td class="text-end text-success font-weight-bold">{{ totalKoliFisik }}</td>
                <td colspan="4"></td>
              </tr>
            </tfoot>
          </v-table>
        </div>
      </div>
    </div>

    <!-- 3. Bottom Section: Keterangan Pendukung & Ringkasan Total Card -->
    <v-row class="mt-4 mb-4" density="comfortable" v-if="items.length > 0 || !isNew">
      <!-- Card 1: Ringkasan Total KPI -->
      <v-col cols="12" sm="6" md="3">
        <v-card
          class="rounded-lg border elevation-1 h-100 d-flex flex-column justify-space-between"
        >
          <div>
            <v-card-title
              class="text-subtitle-2 font-weight-bold bg-grey-lighten-4 py-2 px-3 border-b d-flex align-center"
            >
              <v-icon size="18" color="primary" class="me-2">mdi-chart-box-outline</v-icon>
              Ringkasan Total
            </v-card-title>
            <v-card-text class="pa-3 text-caption">
              <div
                class="d-flex justify-space-between align-center mb-2 pa-2 bg-blue-lighten-5 rounded border"
              >
                <span class="font-weight-bold text-blue-darken-3">TOTAL KOLI</span>
                <span class="text-h6 font-weight-black text-primary"
                  >{{ totalKoliFisik }} Koli</span
                >
              </div>
              <div class="d-flex justify-space-between mb-1">
                <span class="text-grey-darken-1">Total Surat Jalan</span>
                <span class="font-weight-bold">{{ totalSj }} SJ</span>
              </div>
              <div class="d-flex justify-space-between mb-1">
                <span class="text-grey-darken-1">Total Qty (PCS)</span>
                <span class="font-weight-bold text-primary">{{ totalQtyPcs }} Pcs</span>
              </div>
            </v-card-text>
          </div>
          <div class="pa-3 border-t bg-grey-lighten-5">
            <div class="d-flex justify-space-between align-center text-caption">
              <span class="text-grey-darken-1">Status Manifest</span>
              <v-chip
                :color="isNew ? 'warning' : 'success'"
                size="x-small"
                variant="flat"
                class="font-weight-bold"
              >
                {{ isNew ? "BELUM DISIMPAN" : header.status || "DRAFT" }}
              </v-chip>
            </div>
          </div>
        </v-card>
      </v-col>

      <!-- Card 2: Diserahkan Oleh -->
      <v-col cols="12" sm="6" md="3">
        <v-card
          class="rounded-lg border elevation-1 h-100 d-flex flex-column justify-space-between"
        >
          <div>
            <v-card-title
              class="text-subtitle-2 font-weight-bold bg-grey-lighten-4 py-2 px-3 border-b d-flex align-center"
            >
              <v-icon size="18" color="primary" class="me-2">mdi-account-check-outline</v-icon>
              Diserahkan Oleh (Pengirim)
            </v-card-title>
            <v-card-text class="pa-3 text-caption">
              <div class="d-flex justify-space-between mb-1">
                <span class="text-grey-darken-1">Nama</span>
                <span class="font-weight-bold text-grey-darken-4">{{ currentUser }}</span>
              </div>
              <div class="d-flex justify-space-between align-center mb-1">
                <span class="text-grey-darken-1">Waktu Kirim</span>
                <div class="d-flex align-center gap-1">
                  <input
                    type="time"
                    v-model="header.jam"
                    class="text-caption font-weight-medium px-1 rounded border text-grey-darken-4"
                    style="
                      outline: none;
                      background: #f8f9fa;
                      border: 1px solid #ccc;
                      font-size: 11px;
                      height: 22px;
                      cursor: pointer;
                    "
                  />
                  <span class="font-weight-medium">WIB</span>
                </div>
              </div>
              <div class="d-flex justify-space-between align-center">
                <span class="text-grey-darken-1">Lokasi Pengirim</span>
                <v-chip color="primary" size="x-small" variant="flat" class="font-weight-bold">
                  {{
                    getCabangTitle(cabangList.find((c) => c.kode === header.gudang)) ||
                    header.gudang ||
                    "-"
                  }}
                </v-chip>
              </div>
            </v-card-text>
          </div>
          <div class="pa-3 border-t text-center">
            <div v-if="header.ttdPengirim" class="mb-2">
              <img
                :src="header.ttdPengirim"
                alt="TTD Pengirim"
                style="max-height: 45px; border: 1px dashed #94a3b8; border-radius: 4px"
              />
            </div>
            <v-btn
              :color="header.ttdPengirim ? 'success' : 'primary'"
              :variant="header.ttdPengirim ? 'tonal' : 'outlined'"
              size="small"
              block
              prepend-icon="mdi-draw"
              @click="openTtdModal('pengirim')"
            >
              {{ header.ttdPengirim ? "✓ Lihat / Ubah TTD Pengirim" : "TTD Pengirim" }}
            </v-btn>
          </div>
        </v-card>
      </v-col>

      <!-- Card 3: Diterima Oleh -->
      <v-col cols="12" sm="6" md="3">
        <v-card
          class="rounded-lg border elevation-1 h-100 d-flex flex-column justify-space-between"
        >
          <div>
            <v-card-title
              class="text-subtitle-2 font-weight-bold bg-grey-lighten-4 py-2 px-3 border-b d-flex align-center"
            >
              <v-icon size="18" color="primary" class="me-2">mdi-truck-delivery-outline</v-icon>
              Diterima Oleh (Driver)
            </v-card-title>
            <v-card-text class="pa-3 text-caption">
              <div class="d-flex justify-space-between mb-1">
                <span class="text-grey-darken-1">Nama Driver</span>
                <span class="font-weight-bold text-grey-darken-4">{{ header.driver || "-" }}</span>
              </div>
              <div class="d-flex justify-space-between mb-1">
                <span class="text-grey-darken-1">Ekspedisi / Armada</span>
                <span class="font-weight-medium">{{ header.ekspedisi || "Armada Sendiri" }}</span>
              </div>
              <div class="d-flex justify-space-between align-center mb-1">
                <span class="text-grey-darken-1">Waktu</span>
                <div class="d-flex align-center gap-1">
                  <input
                    type="time"
                    v-model="header.jam"
                    class="text-caption font-weight-medium px-1 rounded border text-grey-darken-4"
                    style="
                      outline: none;
                      background: #f8f9fa;
                      border: 1px solid #ccc;
                      font-size: 11px;
                      height: 22px;
                      cursor: pointer;
                    "
                  />
                  <span class="font-weight-medium">WIB</span>
                </div>
              </div>
              <div class="d-flex justify-space-between align-center">
                <span class="text-grey-darken-1">Lokasi Tujuan</span>
                <v-chip color="secondary" size="x-small" variant="flat" class="font-weight-bold">
                  {{
                    getCabangTitle(cabangList.find((c) => c.kode === header.tujuan)) ||
                    header.tujuan ||
                    "-"
                  }}
                </v-chip>
              </div>
            </v-card-text>
          </div>
          <div class="pa-3 border-t text-center">
            <div v-if="header.ttdDriver" class="mb-2">
              <img
                :src="header.ttdDriver"
                alt="TTD Driver"
                style="max-height: 45px; border: 1px dashed #94a3b8; border-radius: 4px"
              />
            </div>
            <v-btn
              :color="header.ttdDriver ? 'success' : 'primary'"
              :variant="header.ttdDriver ? 'tonal' : 'outlined'"
              size="small"
              block
              prepend-icon="mdi-draw"
              @click="openTtdModal('driver')"
            >
              {{ header.ttdDriver ? "✓ Lihat / Ubah TTD Driver" : "TTD Driver" }}
            </v-btn>
          </div>
        </v-card>
      </v-col>

      <!-- Card 4: QR Code & Status Stepper -->
      <v-col cols="12" sm="6" md="3">
        <v-card class="rounded-lg border elevation-1 h-100 d-flex flex-column">
          <v-card-title
            class="text-subtitle-2 font-weight-bold bg-grey-lighten-4 py-2 px-3 border-b d-flex align-center justify-space-between"
          >
            <div class="d-flex align-center">
              <v-icon size="18" color="primary" class="me-2">mdi-qrcode-scan</v-icon>
              <span>QR Code & Status</span>
            </div>
            <v-chip
              size="x-small"
              :color="
                isNew
                  ? 'warning'
                  : header.status === 'SELESAI' || header.status === 'TERKIRIM'
                  ? 'success'
                  : 'primary'
              "
              class="font-weight-bold"
            >
              {{ isNew ? "DRAFT" : header.status || "TERCATAT" }}
            </v-chip>
          </v-card-title>

          <v-card-text
            class="pa-3 d-flex flex-column align-center justify-center flex-grow-1 text-center"
          >
            <!-- QR Code Display Box -->
            <div class="qr-box pa-2 border rounded-lg bg-white mb-2 elevation-1">
              <svg
                width="65"
                height="65"
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                :style="isNew ? 'opacity: 0.35;' : ''"
              >
                <rect width="100" height="100" fill="white" />
                <path d="M10 10H40V40H10V10ZM15 15V35H35V15H15Z" fill="black" />
                <path d="M20 20H30V30H20V20Z" fill="black" />
                <path d="M60 10H90V40H60V10ZM65 15V35H85V15H65Z" fill="black" />
                <path d="M70 20H80V30H70V20Z" fill="black" />
                <path d="M10 60H40V90H10V60ZM15 65V85H35V65H15Z" fill="black" />
                <path d="M20 70H30V80H20V70Z" fill="black" />
                <rect x="50" y="50" width="10" height="10" fill="black" />
                <rect x="70" y="50" width="20" height="10" fill="black" />
                <rect x="50" y="70" width="10" height="20" fill="black" />
                <rect x="70" y="70" width="20" height="20" fill="black" />
              </svg>
            </div>

            <div class="font-weight-bold text-caption text-primary mb-2">
              {{ displayManifestNomor }}
            </div>

            <!-- Vertical Progress Steps -->
            <div class="stepper-vertical text-start w-100 border-t pt-2 mt-1">
              <!-- Step 1: Pembuatan / Tercatat -->
              <div class="step-item d-flex align-center gap-2 mb-2">
                <div
                  :class="[
                    'step-circle',
                    isNew ? 'bg-warning text-white' : 'bg-success text-white',
                  ]"
                >
                  <v-icon size="12" color="white">{{ isNew ? "mdi-pencil" : "mdi-check" }}</v-icon>
                </div>
                <div>
                  <div class="font-weight-bold text-caption text-grey-darken-3">
                    1. {{ isNew ? "PEMBUATAN DRAFT" : "TERCATAT" }}
                  </div>
                </div>
              </div>

              <!-- Step 2: Serah Terima & Dikirim -->
              <div class="step-item d-flex align-center gap-2 mb-2">
                <div
                  :class="[
                    'step-circle',
                    !isNew &&
                    (header.status === 'DIKIRIM' || header.ttdPengirim || header.ttdDriver)
                      ? 'bg-primary text-white'
                      : 'bg-grey-lighten-2 text-grey-darken-2',
                  ]"
                >
                  <v-icon
                    size="12"
                    :color="
                      !isNew && (header.status === 'DIKIRIM' || header.ttdPengirim)
                        ? 'white'
                        : 'grey'
                    "
                  >
                    {{
                      !isNew && (header.status === "DIKIRIM" || header.ttdPengirim)
                        ? "mdi-truck-fast"
                        : "2"
                    }}
                  </v-icon>
                </div>
                <div>
                  <div
                    class="font-weight-bold text-caption"
                    :class="
                      !isNew && (header.status === 'DIKIRIM' || header.ttdPengirim)
                        ? 'text-primary'
                        : 'text-grey-darken-1'
                    "
                  >
                    2. SERAH TERIMA & DIKIRIM
                  </div>
                </div>
              </div>

              <!-- Step 3: Diterima Store / Selesai -->
              <div class="step-item d-flex align-center gap-2">
                <div
                  :class="[
                    'step-circle',
                    header.status === 'SELESAI' || header.status === 'TERKIRIM'
                      ? 'bg-success text-white'
                      : 'bg-grey-lighten-2 text-grey-darken-2',
                  ]"
                >
                  <v-icon
                    size="12"
                    :color="
                      header.status === 'SELESAI' || header.status === 'TERKIRIM' ? 'white' : 'grey'
                    "
                  >
                    {{
                      header.status === "SELESAI" || header.status === "TERKIRIM"
                        ? "mdi-check-all"
                        : "3"
                    }}
                  </v-icon>
                </div>
                <div>
                  <div
                    class="font-weight-bold text-caption"
                    :class="
                      header.status === 'SELESAI' || header.status === 'TERKIRIM'
                        ? 'text-success'
                        : 'text-grey'
                    "
                  >
                    3. DITERIMA STORE (SELESAI)
                  </div>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Modal Lookup Gudang Asal -->
    <GudangSearchModal
      v-if="showGudangAsalModal"
      :user-cabang="authStore.userCabang || 'KDC'"
      @close="showGudangAsalModal = false"
      @gudang-selected="onGudangAsalSelected"
    />

    <!-- Modal Lookup Gudang Tujuan -->
    <GudangSearchModal
      v-if="showGudangTujuanModal"
      :user-cabang="authStore.userCabang || 'KDC'"
      @close="showGudangTujuanModal = false"
      @gudang-selected="onGudangTujuanSelected"
    />

    <!-- Dialog Lookup Pilih Surat Jalan yang Tersedia -->
    <v-dialog v-model="showSjModal" max-width="850px">
      <v-card class="rounded-lg">
        <v-card-title
          class="bg-primary text-white d-flex align-center justify-space-between py-3 px-4"
        >
          <div class="d-flex align-center gap-2">
            <span class="text-subtitle-1 font-weight-bold">Pilih Surat Jalan untuk Dimuat</span>
            <v-chip
              v-if="header.tujuan"
              color="white"
              class="bg-primary text-white align-center font-weight-bold ms-2"
              size="small"
            >
              <v-icon start size="14" color="white">mdi-filter-variant</v-icon>
              Filter Tujuan: {{ header.tujuan }}
            </v-chip>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            density="compact"
            @click="showSjModal = false"
          />
        </v-card-title>

        <v-card-text class="pt-4">
          <v-row density="compact" class="mb-3">
            <v-col cols="12" sm="8">
              <v-text-field
                v-model="sjSearch"
                label="Cari No. SJ / Store / Packing List"
                prepend-inner-icon="mdi-magnify"
                density="compact"
                hide-details
                clearable
                variant="outlined"
                @keyup.enter="loadAvailableSj"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-btn color="secondary" block prepend-icon="mdi-filter" @click="loadAvailableSj">
                Cari SJ
              </v-btn>
            </v-col>
          </v-row>

          <v-table
            density="compact"
            class="border rounded-lg"
            style="max-height: 380px; overflow-y: auto"
          >
            <thead>
              <tr class="bg-grey-lighten-3">
                <th>No. Surat Jalan</th>
                <th>Tanggal</th>
                <th>Store Tujuan</th>
                <th class="text-right">Total Qty (Pcs)</th>
                <th class="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingAvailableSj">
                <td colspan="5" class="text-center py-4">Memuat Surat Jalan yang tersedia...</td>
              </tr>
              <tr v-else-if="filteredAvailableSj.length === 0">
                <td colspan="5" class="text-center py-4 text-grey">
                  Tidak ada Surat Jalan yang tersedia/siap dikirim.
                </td>
              </tr>
              <tr v-for="sj in filteredAvailableSj" :key="sj.sjNomor">
                <td class="font-weight-medium text-primary">{{ sj.sjNomor }}</td>
                <td>{{ sj.sjTanggal ? format(new Date(sj.sjTanggal), "dd/MM/yyyy") : "-" }}</td>
                <td>{{ sj.storeNama }} ({{ sj.storeKode }})</td>
                <td class="text-right font-weight-bold text-primary">{{ sj.totalQty }}</td>
                <td class="text-center">
                  <v-btn
                    color="primary"
                    size="x-small"
                    prepend-icon="mdi-plus"
                    @click="addSjToManifest(sj)"
                  >
                    Pilih
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>

        <v-card-actions class="px-4 pb-3 justify-end">
          <v-btn color="secondary" variant="outlined" @click="showSjModal = false">Selesai</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog Canvas Tanda Tangan Digital -->
    <v-dialog v-model="showTtdModal" max-width="500px">
      <v-card class="rounded-lg">
        <v-card-title
          class="bg-primary text-white d-flex align-center justify-space-between py-3 px-4"
        >
          <div class="d-flex align-center gap-2">
            <v-icon color="white">mdi-draw</v-icon>
            <span class="text-subtitle-1 font-weight-bold">
              {{ ttdRole === "pengirim" ? "Tanda Tangan Pengirim" : "Tanda Tangan Driver" }}
            </span>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            density="compact"
            @click="showTtdModal = false"
          />
        </v-card-title>

        <v-card-text class="pa-4 text-center">
          <p class="text-caption text-grey-darken-1 mb-2">
            Silakan goreskan tanda tangan pada papan di bawah ini menggunakan Mouse atau Layar
            Sentuh.
          </p>

          <div
            class="border rounded-lg pa-1 bg-grey-lighten-4 d-inline-block shadow-inner w-100"
            style="position: relative"
          >
            <canvas
              ref="signatureCanvasRef"
              style="
                width: 100%;
                height: 180px;
                background: #ffffff;
                cursor: crosshair;
                touch-action: none;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
              "
              @mousedown="startDrawing"
              @mousemove="draw"
              @mouseup="stopDrawing"
              @mouseleave="stopDrawing"
              @touchstart="startDrawing"
              @touchmove="draw"
              @touchend="stopDrawing"
            ></canvas>
            <div
              style="
                position: absolute;
                bottom: 15px;
                left: 0;
                right: 0;
                pointer-events: none;
                border-bottom: 1px dashed #cbd5e1;
                margin: 0 20px;
              "
            ></div>
          </div>
        </v-card-text>

        <v-card-actions class="pa-3 border-t bg-grey-lighten-5 d-flex justify-space-between">
          <v-btn
            color="error"
            variant="outlined"
            size="small"
            prepend-icon="mdi-delete"
            @click="clearSignature"
          >
            Bersihkan
          </v-btn>
          <div class="d-flex gap-2">
            <v-btn variant="text" size="small" @click="showTtdModal = false">Batal</v-btn>
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              prepend-icon="mdi-check"
              @click="saveSignature"
            >
              Simpan TTD
            </v-btn>
          </div>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.desktop-table :deep(.scrollable-cell) {
  white-space: nowrap;
  overflow-x: auto;
  max-width: 450px;
  min-width: 300px;
  height: 22px;
  display: block;
  padding-bottom: 5px;
  margin-bottom: -5px;
}

.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom: none !important;
}

.form-grid-container {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  height: calc(100vh - 120px);
  transition: grid-template-columns 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.form-grid-container.hide-left {
  grid-template-columns: 0px 1fr;
}

.left-column {
  overflow: hidden;
  transition: opacity 0.25s ease, visibility 0.25s ease, transform 0.35s ease;
  transform-origin: left center;
}

.form-grid-container.hide-left .left-column {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  width: 0;
  padding: 0;
  transform: translateX(-20px);
}

.input-koli :deep(input) {
  text-align: right;
  font-weight: bold;
}

.step-circle {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  flex-shrink: 0;
}
</style>

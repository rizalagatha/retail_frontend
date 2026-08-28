<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import GudangSearchModal from "@/components/lookup/GudangSearchModal.vue";
import QrcodeVue from "qrcode.vue";

interface Cabang {
  kode: string;
  nama: string;
}

interface ManifestKirimHeader {
  nomor?: string;
  Nomor?: string;
  tanggal?: string;
  Tanggal?: string;
  jam?: string;
  Jam?: string;
  gudang?: string;
  Gudang?: string;
  tujuan?: string;
  Tujuan?: string;
  namaGudang?: string;
  NamaGudang?: string;
  jenisKirim?: string;
  JenisKirim?: string;
  driver?: string;
  Driver?: string;
  platNomor?: string;
  PlatNomor?: string;
  ekspedisi?: string;
  Ekspedisi?: string;
  noResi?: string;
  NoResi?: string;
  totalSj?: number;
  TotalSj?: number;
  totalKoli?: number;
  TotalKoli?: number;
  totalQty?: number;
  TotalQty?: number;
  beratKg?: number;
  BeratKg?: number;
  keterangan?: string;
  Keterangan?: string;
  status?: string;
  Status?: string;
  usr?: string;
  Usr?: string;
  userCreate?: string;
  dateCreate?: string;
  DateCreate?: string;
  ttdPengirim?: string;
  ttdDriver?: string;
  [key: string]: unknown;
}

interface ManifestKirimItem {
  idDrec?: string;
  manifestNomor?: string;
  isCustom?: boolean;
  sjNomor?: string;
  namaBarang?: string;
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

// Daftar Pilihan Ekspedisi
const ekspedisiOptions = [
  "Bestindo",
  "Tam Cargo",
  "Jaya Sakti (Travel)",
  "SAA (Travel)",
  "City Trans (Travel)",
  "Kalog",
  "B.I. Xpress",
];

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
  jenisKirim: "",
  driver: "",
  platNomor: "",
  ekspedisi: "",
  noResi: "",
  beratKg: 0,
  keterangan: "",
  status: "TERCATAT",
  dateCreate: "",
  userCreate: "",
  ttdPengirim: "",
  ttdDriver: "",
});

// Status Kuncian Edit (Jika sudah ditandatangani lengkap oleh Pengirim dan Driver ATAU status sudah DIKIRIM/SELESAI)
const isTtdLengkap = computed(() => Boolean(header.ttdPengirim && header.ttdDriver));
const isDikirimOrDone = computed(() =>
  ["DIKIRIM", "SELESAI", "TERKIRIM"].includes((header.status || "").toUpperCase())
);
const isDocumentLocked = computed(
  () => !isNew.value && (isTtdLengkap.value || isDikirimOrDone.value)
);
const isEkspedisi = computed(() => (header.jenisKirim || "").toUpperCase() === "EKSPEDISI");

// 1. Ekspedisi: hanya boleh input resi saja jika dokumen terkunci
const isResiOnlyEdit = computed(() => isDocumentLocked.value && isEkspedisi.value);
// 2. Non-Ekspedisi: tidak boleh diedit sama sekali jika dokumen terkunci (terkunci penuh)
const isFullyLocked = computed(() => isDocumentLocked.value && !isEkspedisi.value);
// 3. Field header/detail umum terkunci jika dokumen terkunci
const isFieldLocked = computed(() => isDocumentLocked.value);

// Items Selected in Manifest (Daftar Surat Jalan & Barang Lain-lain)
const items = ref<ManifestKirimItem[]>([]);

// Helper mendapatkan Store Tujuan efektif:
// Jika sudah ada SJ di atasnya, samakan dengan SJ tersebut; jika belum, ambil dari Form Tujuan Pengiriman (header.tujuan)
const getEffectiveStore = () => {
  const existingSj = items.value.find((i) => !i.isCustom && i.storeKode);
  if (existingSj) {
    return {
      kode: existingSj.storeKode,
      nama: existingSj.storeNama || getCabangNama(existingSj.storeKode),
    };
  }
  const kode = header.tujuan || "";
  return {
    kode,
    nama: getCabangNama(kode),
  };
};

const addCustomItem = () => {
  const targetStore = getEffectiveStore();
  items.value.push({
    isCustom: true,
    sjNomor: "",
    namaBarang: "",
    storeKode: targetStore.kode,
    storeNama: targetStore.nama,
    koli: 1,
    qty: 0,
    keterangan: "",
    referensiGabung: "",
  });

  if (!header.tujuan && targetStore.kode) {
    header.tujuan = targetStore.kode;
  }
};

// Hapus Item (SJ atau Barang Lain-lain) dari Manifest
const removeManifestItem = (index: number) => {
  const removed = items.value[index];
  const removedKey = removed ? removed.sjNomor || removed.namaBarang : "";
  items.value.splice(index, 1);
  if (removedKey) {
    // Bersihkan referensiGabung pada baris lain yang menunjuk ke baris yang dihapus ini
    items.value.forEach((other) => {
      if (other.referensiGabung === removedKey) {
        other.referensiGabung = "";
      }
    });
  }
};

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
const resiInputRef = ref<HTMLInputElement | null>(null);

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

const focusResiInput = () => {
  setTimeout(() => {
    if (resiInputRef.value) {
      resiInputRef.value.focus();
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
  if (items.value.length > 0) {
    toast.warning("Tujuan Pengiriman terkunci karena daftar muatan sudah terisi.");
    showGudangTujuanModal.value = false;
    return;
  }
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
  if (items.value.length > 0) return;
  if (!val) return;
  const match = cabangList.value.find((c) => c.kode.toUpperCase() === val.trim().toUpperCase());
  if (match) {
    header.tujuan = match.kode;
  }
};

const userCreate = computed(() => {
  return header.userCreate;
});

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

const getCabangNama = (kode?: string): string => {
  if (!kode) return "";
  const match = cabangList.value.find((c) => c.kode.toUpperCase() === kode.trim().toUpperCase());
  return match ? match.nama : kode;
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
  const existingSjSet = new Set(
    items.value.filter((i) => i.sjNomor).map((i) => i.sjNomor as string)
  );
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
const totalSj = computed(() => items.value.filter((i) => !i.isCustom && i.sjNomor).length);
const totalCustom = computed(() => items.value.filter((i) => i.isCustom || !i.sjNomor).length);
const totalKoliFisik = computed(() =>
  items.value.reduce((acc, cur) => acc + (Number(cur.koli) || 0), 0)
);
const totalQtyPcs = computed(() =>
  items.value.reduce((acc, cur) => acc + (Number(cur.qty) || 0), 0)
);

// Direct Print Logic
const handlePrint = () => {
  const nomor = header.nomor || editNomor.value;
  if (!nomor) {
    toast.error("Simpan dokumen manifest terlebih dahulu sebelum mencetak.");
    return;
  }
  const routeData = router.resolve({
    name: "ManifestKirimPrint",
    params: { nomor },
  });
  window.open(routeData.href, "_blank");
};

// Available Options for Referensi Gabungan
const otherItemOptions = (currentIndex: number) => {
  return items.value
    .map((item, idx) => ({ item, idx }))
    .filter(({ item, idx }) => idx !== currentIndex && Number(item.koli) > 0)
    .map(({ item, idx }) => {
      const label = item.sjNomor || item.namaBarang || `Baris #${idx + 1}`;
      return {
        title: label,
        value: label,
      };
    });
};

// Helper tracking item apa saja yang bergabung ke item tertentu
const getAttachedCount = (itemKey?: string) => {
  if (!itemKey) return 0;
  return items.value.filter((i) => i.referensiGabung === itemKey).length;
};

const getAttachedList = (itemKey?: string) => {
  if (!itemKey) return [];
  return items.value
    .filter((i) => i.referensiGabung === itemKey)
    .map((i) => i.sjNomor || i.namaBarang || "Item");
};

// Helper mendeteksi baris pertama Barang Lain-lain untuk pembatas tabel
const isFirstCustom = (index: number): boolean => {
  if (!items.value[index]?.isCustom) return false;
  return index === items.value.findIndex((i) => i.isCustom);
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

// Jika form field Tujuan Pengiriman diubah saat belum ada SJ, sinkronkan store pada barang lain-lain
watch(
  () => header.tujuan,
  (newTujuan) => {
    const hasSj = items.value.some((i) => !i.isCustom && i.storeKode);
    if (!hasSj && newTujuan) {
      const nama = getCabangNama(newTujuan);
      items.value.forEach((it) => {
        if (it.isCustom) {
          it.storeKode = newTujuan;
          it.storeNama = nama;
        }
      });
    }
  }
);

const openSjModal = () => {
  sjSearch.value = "";
  showSjModal.value = true;
  loadAvailableSj();
};

// Tambah SJ ke Manifest
const addSjToManifest = (sj: AvailableSjItem) => {
  // 1. Cek jika header.tujuan sudah diisi dan beda dengan storeKode SJ yang coba ditambahkan
  if (header.tujuan && header.tujuan.trim().toUpperCase() !== sj.storeKode.trim().toUpperCase()) {
    toast.error(
      `Surat Jalan ${sj.sjNomor} bertujuan ke "${sj.storeNama || sj.storeKode}" (${sj.storeKode}), berbeda dengan Tujuan Pengiriman yang dipilih (${header.tujuan}). Silakan periksa kembali Tujuan Pengiriman Anda!`
    );
    return;
  }

  // 2. Cek jika di tabel sudah ada SJ lain yang tujuannya berbeda
  const existingSj = items.value.find((i) => !i.isCustom && i.storeKode);
  if (
    existingSj &&
    existingSj.storeKode &&
    existingSj.storeKode.trim().toUpperCase() !== sj.storeKode.trim().toUpperCase()
  ) {
    toast.error(
      `Surat Jalan ${sj.sjNomor} bertujuan ke "${sj.storeNama || sj.storeKode}" (${sj.storeKode}), berbeda dengan Surat Jalan sebelumnya yang menuju ke "${existingSj.storeNama || existingSj.storeKode}" (${existingSj.storeKode}). Semua SJ dalam satu manifest harus menuju ke store yang sama. Silakan periksa kembali Tujuan Pengiriman Anda!`
    );
    return;
  }

  const newSjItem: ManifestKirimItem = {
    isCustom: false,
    sjNomor: sj.sjNomor,
    sjTanggal: sj.sjTanggal,
    noPackingList: sj.noPackingList || `PL-${sj.sjNomor.split(".").pop() || "001"}`,
    storeKode: sj.storeKode,
    storeNama: sj.storeNama,
    koli: 1, // Default custom input koli user = 1
    qty: sj.totalQty,
    keterangan: "",
    referensiGabung: "",
  };

  // Pastikan SJ selalu berada di atas kelompok Barang Lain-lain
  const firstCustomIdx = items.value.findIndex((i) => i.isCustom);
  if (firstCustomIdx !== -1) {
    items.value.splice(firstCustomIdx, 0, newSjItem);
  } else {
    items.value.push(newSjItem);
  }

  // Jika di atasnya ada SJ, samakan store tujuan seluruh barang lain-lain mengikuti SJ ini
  items.value.forEach((it) => {
    if (it.isCustom) {
      it.storeKode = sj.storeKode;
      it.storeNama = sj.storeNama;
    }
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
      (i.sjNomor && i.sjNomor.toUpperCase() === code.toUpperCase()) ||
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
      toast.error(`No. SJ/PL "${code}" tidak ditemukan.`);
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

// Load Data jika Edit
const loadEditData = async () => {
  if (!editNomor.value) return;
  loading.value = true;
  try {
    const response = await api.get<{
      header: ManifestKirimHeader;
      items: (ManifestKirimItem & { namaBarang?: string })[];
    }>(`/manifest-kirim/${encodeURIComponent(editNomor.value)}`);
    const h = (response.data.header || {}) as ManifestKirimHeader;
    header.nomor = String(h.nomor || h.Nomor || "");
    const rawTgl = (h.tanggal || h.Tanggal) as string;
    header.tanggal = rawTgl
      ? format(new Date(rawTgl), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd");
    header.jam = String(h.jam || h.Jam || format(new Date(), "HH:mm"));
    header.gudang = String(h.gudang || h.Gudang || userCabangKode.value || "");
    header.tujuan = String(h.tujuan || h.Tujuan || "");
    header.jenisKirim = String(h.jenisKirim || h.JenisKirim || "");
    header.driver = String(h.driver || h.Driver || "");
    header.platNomor = String(h.platNomor || h.PlatNomor || "");
    header.ekspedisi = String(h.ekspedisi || h.Ekspedisi || "");
    header.noResi = String(h.noResi || h.NoResi || "");
    header.beratKg = Number(h.beratKg || h.BeratKg || 0);
    header.keterangan = String(h.keterangan || h.Keterangan || "");
    header.status = String(h.status || h.Status || "TERCATAT");
    header.dateCreate = String(h.dateCreate || h.DateCreate || "");
    header.userCreate = String(h.userCreate || "");
    header.ttdPengirim = String(h.ttdPengirim || h.ttdPengirim || "");
    header.ttdDriver = String(h.ttdDriver || h.ttdDriver || "");

    const allReceivedItems = (response.data.items || []) as (ManifestKirimItem & {
      namaBarang?: string;
    })[];

    items.value = allReceivedItems
      .map((it) => {
        const isCustom = !it.sjNomor || String(it.sjNomor).trim() === "";
        return {
          ...it,
          isCustom,
          sjNomor: it.sjNomor || "",
          namaBarang: it.namaBarang || "",
          noPackingList: it.noPackingList || "",
          referensiGabung: it.referensiGabung || "",
        };
      })
      .sort((a, b) => {
        if (!a.isCustom && b.isCustom) return -1;
        if (a.isCustom && !b.isCustom) return 1;
        return 0;
      });

    if (items.value.length > 0) {
      const firstSj = items.value.find((i) => !i.isCustom && i.storeKode);
      if (firstSj) {
        header.tujuan = firstSj.storeKode;
      } else if (!header.tujuan && items.value[0].storeKode) {
        header.tujuan = items.value[0].storeKode;
      }
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
const submitForm = async () => {
  if (isFullyLocked.value) {
    toast.error(
      "Manifest sudah ditandatangani oleh pengirim dan penerima. Perubahan data tidak diizinkan."
    );
    return;
  }

  if (!header.tanggal) {
    toast.error("Tanggal manifest harus diisi.");
    return;
  }
  if (!header.gudang) {
    toast.error("Pengirim (Gudang Asal) harus dipilih.");
    return;
  }
  if (items.value.length === 0) {
    toast.error("Tambahkan minimal satu Surat Jalan atau Barang Lain-lain ke dalam manifest.");
    return;
  }

  // Validasi & Penyelarasan Tujuan Pengiriman
  const firstSj = items.value.find((i) => !i.isCustom && i.storeKode);
  if (firstSj) {
    const primaryStore = String(firstSj.storeKode).trim().toUpperCase();

    // 1. Cek jika header.tujuan berbeda dengan toko tujuan SJ
    if (header.tujuan && header.tujuan.trim().toUpperCase() !== primaryStore) {
      toast.error(
        `Tujuan Pengiriman (${header.tujuan}) tidak sesuai dengan Store Tujuan Surat Jalan (${primaryStore}). Silakan periksa kembali Tujuan Pengiriman Anda!`
      );
      return;
    }

    // 2. Pastikan seluruh SJ memiliki toko tujuan yang sama
    for (const item of items.value) {
      if (!item.isCustom && item.storeKode && String(item.storeKode).trim().toUpperCase() !== primaryStore) {
        toast.error(
          `Surat Jalan ${item.sjNomor} bertujuan ke "${item.storeKode}", berbeda dengan Surat Jalan lainnya (${primaryStore}). Semua SJ harus menuju ke store yang sama!`
        );
        return;
      }
    }
    // Selaraskan header.tujuan dengan store tujuan SJ
    header.tujuan = primaryStore;
  } else {
    if (!header.tujuan) {
      toast.error("Tujuan Pengiriman wajib dipilih.");
      return;
    }
  }

  // Validasi seluruh baris muatan
  for (let idx = 0; idx < items.value.length; idx++) {
    const item = items.value[idx];
    if (item.isCustom) {
      if (!item.namaBarang || item.namaBarang.trim() === "") {
        toast.error(`Nama / Deskripsi Barang pada baris ke-${idx + 1} wajib diisi.`);
        return;
      }
    } else {
      if (!item.sjNomor) {
        toast.error(`Nomor Surat Jalan pada baris ke-${idx + 1} tidak valid.`);
        return;
      }
    }

    // Pastikan storeKode setiap baris mengikuti header.tujuan
    item.storeKode = header.tujuan;

    if (
      item.koli === undefined ||
      item.koli === null ||
      isNaN(Number(item.koli)) ||
      Number(item.koli) < 0
    ) {
      toast.error(`Jumlah Koli pada baris ke-${idx + 1} tidak valid (harus angka, minimal 0).`);
      return;
    }

    if (Number(item.koli) === 0 && !item.referensiGabung) {
      const itemLabel = item.sjNomor || item.namaBarang || `Baris #${idx + 1}`;
      toast.error(`Item "${itemLabel}" memiliki Koli 0. WAJIB pilih referensi penggabungan!`);
      return;
    }
  }

  const payloadItems = items.value.map((i) => ({
    ...i,
    sjNomor: i.isCustom ? null : i.sjNomor || null,
    namaBarang: i.isCustom ? i.namaBarang || null : null,
    storeKode: i.storeKode || header.tujuan || header.gudang,
    koli: Number(i.koli || 0),
    qty: Number(i.qty || 0),
    keterangan: i.keterangan || "",
    referensiGabung: i.referensiGabung || null,
  }));

  saving.value = true;
  // Jika TTD pengirim dan driver lengkap -> DIKIRIM, jika belum -> DRAFT (kecuali jika sebelumnya sudah DIKIRIM)
  const isTtdLengkapVal = Boolean(header.ttdPengirim && header.ttdDriver);
  if (isTtdLengkapVal) {
    header.status = "DIKIRIM";
  } else if (!header.status || header.status === "TERCATAT" || isNew.value) {
    header.status = "DRAFT";
  }
  try {
    const response = await api.post<{ message: string; nomor: string }>("/manifest-kirim", {
      header: { ...header },
      items: payloadItems,
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
    :title="isNew ? 'Buat Manifest Pengiriman' : `Edit Manifest: ${header.nomor}`"
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
        color="secondary"
        variant="outlined"
        prepend-icon="mdi-printer"
        @click="handlePrint"
      >
        Cetak
      </v-btn>
      <v-btn
        size="small"
        color="primary"
        prepend-icon="mdi-content-save"
        :loading="saving"
        :disabled="isFullyLocked"
        @click="submitForm"
      >
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh" @click="goBack"> Batal </v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="goBack"> Tutup </v-btn>
    </template>

    <!-- Alert Banner Status Kuncian Manifest -->
    <v-alert
      v-if="isFullyLocked"
      type="warning"
      variant="tonal"
      density="compact"
      icon="mdi-lock"
      class="mb-3 font-weight-medium"
    >
      Manifest ini sudah ditandatangani lengkap oleh Pengirim dan Penerima. Seluruh data telah
      dikunci dan tidak dapat diubah.
    </v-alert>
    <v-alert
      v-else-if="isResiOnlyEdit"
      type="info"
      variant="tonal"
      density="compact"
      icon="mdi-information-outline"
      class="mb-3 font-weight-medium"
    >
      Manifest pengiriman ekspedisi ini sudah ditandatangani lengkap. Perubahan hanya diperbolehkan
      untuk <strong>No. Resi</strong> saja.
    </v-alert>

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
                :disabled="isFieldLocked"
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
                :disabled="isFieldLocked"
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
                :disabled="isFieldLocked"
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
                :disabled="isFieldLocked"
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
                :disabled="isFieldLocked"
              />
            </v-col>

            <v-col cols="12" v-if="header.jenisKirim === 'EKSPEDISI'">
              <v-combobox
                label="Ekspedisi"
                v-model="header.ekspedisi"
                :items="ekspedisiOptions"
                placeholder="Pilih atau ketik nama ekspedisi..."
                density="compact"
                variant="outlined"
                hide-details
                clearable
                :disabled="isFieldLocked"
              />
            </v-col>

            <v-col cols="12" v-if="header.jenisKirim === 'EKSPEDISI'">
              <v-text-field
                ref="resiInputRef"
                label="No. Resi"
                v-model="header.noResi"
                placeholder="Scan / Ketik No. Resi"
                density="compact"
                variant="outlined"
                hide-details
                clearable
                :disabled="isFullyLocked"
                @keydown.enter.prevent="header.noResi = header.noResi?.trim() ?? ''"
              >
                <template #append-inner>
                  <v-tooltip location="top" text="Fokus ke scanner untuk scan barcode resi">
                    <template #activator="{ props }">
                      <v-icon
                        v-bind="props"
                        size="20"
                        color="primary"
                        :class="{ 'cursor-pointer': !isFullyLocked }"
                        :disabled="isFullyLocked"
                        @click="!isFullyLocked && focusResiInput()"
                      >
                        mdi-barcode-scan
                      </v-icon>
                    </template>
                  </v-tooltip>
                </template>
              </v-text-field>
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
                :disabled="isFieldLocked"
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
                :disabled="isFieldLocked"
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
              :autofocus="!isFieldLocked"
              :disabled="isFieldLocked"
              style="flex: 1; min-width: 0"
              @keydown="handleScannerKeydown"
            />

            <v-btn
              size="small"
              color="primary"
              prepend-icon="mdi-plus"
              class="font-weight-medium"
              :disabled="isFieldLocked"
              @click="openSjModal"
            >
              + Tambah SJ
            </v-btn>

            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              class="font-weight-medium"
              :disabled="isFieldLocked"
              @click="addCustomItem"
            >
              + Tambah Barang Lain-lain
            </v-btn>
          </div>

          <!-- Table List Tunggal (Surat Jalan & Barang Lain-lain) -->
          <v-table
            density="compact"
            class="manifest-table desktop-table fill-height-table border rounded-lg"
          >
            <thead>
              <tr
                class="bg-grey-lighten-3 text-uppercase text-caption font-weight-bold text-center"
              >
                <th style="width: 40px" class="text-center">No.</th>
                <th style="width: 170px" class="text-center">No. Surat Jalan / Barang</th>
                <th style="width: 95px" class="text-center">Tanggal SJ</th>
                <th style="width: 130px" class="text-center">No. Packing List</th>
                <th class="text-center">Store Tujuan</th>
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
                  Belum ada Surat Jalan atau Barang Lain-lain dalam manifest ini. Klik
                  <strong>"+ Tambah SJ"</strong> atau <strong>"+ Tambah Barang Lain-lain"</strong>.
                </td>
              </tr>
              <template v-for="(item, index) in items" :key="index">
                <!-- Pembatas Baris jika memasuki kelompok Barang Lain-lain -->
                <tr
                  v-if="isFirstCustom(index) && totalSj > 0"
                  class="bg-blue-grey-lighten-5 text-caption font-weight-bold"
                >
                  <td colspan="11" class="py-1 px-3 text-blue-grey-darken-4 border-t border-b">
                    <div class="d-flex align-center gap-2">
                      <span class="text-uppercase" style="font-size: 11px; letter-spacing: 0.5px">
                        Barang Lain-lain (Non-SJ / Custom)
                      </span>
                    </div>
                  </td>
                </tr>

                <tr class="table-row-hover">
                  <td class="text-center">{{ index + 1 }}</td>

                  <!-- Jika Item Surat Jalan: 3 kolom terpisah (No SJ, Tanggal, No PL) -->
                  <template v-if="!item.isCustom">
                    <td class="font-weight-bold text-primary">{{ item.sjNomor }}</td>
                    <td class="text-center">
                      {{ item.sjTanggal ? format(new Date(item.sjTanggal), "dd-MM-yyyy") : "-" }}
                    </td>
                    <td class="text-grey-darken-2 font-weight-medium">
                      {{ item.noPackingList || "-" }}
                    </td>
                  </template>

                  <!-- Jika Barang Lain-lain: Kolom Nama Barang Memanjang (Colspan 3) -->
                  <template v-else>
                    <td colspan="3">
                      <v-text-field
                        v-model="item.namaBarang"
                        placeholder="Nama Barang (misal: Rak Display, Banner Promo, ATK)..."
                        density="compact"
                        variant="outlined"
                        hide-details
                        :disabled="isFieldLocked"
                      />
                    </td>
                  </template>

                  <!-- Store Tujuan (Mengikuti tujuan manifest di atas, readonly) -->
                  <td>
                    <span class="font-weight-medium">
                      {{
                        item.storeNama ||
                        getCabangNama(item.storeKode || header.tujuan) ||
                        header.tujuan ||
                        "-"
                      }}
                      <template v-if="item.storeKode || header.tujuan">
                        ({{ item.storeKode || header.tujuan }})
                      </template>
                    </span>
                  </td>

                  <!-- Qty -->
                  <td class="text-end">
                    <span v-if="!item.isCustom" class="font-weight-bold">
                      {{ item.qty }}
                    </span>
                    <v-text-field
                      v-else
                      v-model.number="item.qty"
                      type="number"
                      min="0"
                      step="1"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="text-end font-weight-bold"
                      :disabled="isFieldLocked"
                    />
                  </td>

                  <!-- Koli -->
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
                      :disabled="isFieldLocked"
                      @input="onKoliInput(item)"
                      @blur="onKoliInput(item)"
                    />
                  </td>

                  <!-- Status Koli -->
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

                  <!-- Referensi Gabung -->
                  <td>
                    <v-select
                      v-if="item.koli === 0"
                      v-model="item.referensiGabung"
                      :items="otherItemOptions(index)"
                      item-title="title"
                      item-value="value"
                      placeholder="Gabung Ke..."
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="select-compact font-weight-medium"
                      :disabled="isFieldLocked"
                    />
                    <v-tooltip
                      v-else-if="getAttachedCount(item.sjNomor || item.namaBarang) > 0"
                      location="top"
                    >
                      <template #activator="{ props: tipProps }">
                        <v-chip
                          v-bind="tipProps"
                          color="info"
                          size="x-small"
                          variant="tonal"
                          class="font-weight-bold cursor-pointer px-2"
                        >
                          <v-icon size="12" class="me-1">mdi-link-variant</v-icon>
                          +{{ getAttachedCount(item.sjNomor || item.namaBarang) }} Gabungan
                        </v-chip>
                      </template>
                      <span
                        >Item Gabung:
                        {{ getAttachedList(item.sjNomor || item.namaBarang).join(", ") }}</span
                      >
                    </v-tooltip>
                    <span v-else class="text-grey text-caption">-</span>
                  </td>

                  <!-- Keterangan -->
                  <td>
                    <v-text-field
                      v-model="item.keterangan"
                      placeholder="Ket..."
                      density="compact"
                      variant="outlined"
                      hide-details
                      :disabled="isFieldLocked"
                    />
                  </td>

                  <!-- Aksi Hapus -->
                  <td class="text-center">
                    <v-btn
                      icon="mdi-delete-outline"
                      size="x-small"
                      variant="text"
                      color="error"
                      :disabled="isFieldLocked"
                      @click="removeManifestItem(index)"
                    />
                  </td>
                </tr>
              </template>
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
              <div class="d-flex justify-space-between mb-1" v-if="totalCustom > 0">
                <span class="text-grey-darken-1">Barang Lain-lain</span>
                <span class="font-weight-bold text-primary">{{ totalCustom }} Item</span>
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
                <span class="font-weight-bold text-grey-darken-4">{{ userCreate }}</span>
              </div>
              <div class="d-flex justify-space-between align-center mb-1">
                <span class="text-grey-darken-1">Waktu Kirim</span>
                <div class="d-flex align-center gap-1">
                  <input
                    type="time"
                    v-model="header.jam"
                    :disabled="isFieldLocked"
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
              :disabled="isFieldLocked"
              @click="openTtdModal('pengirim')"
            >
              {{
                header.ttdPengirim
                  ? isFieldLocked
                    ? "✓ TTD Pengirim (Terkunci)"
                    : "✓ Lihat / Ubah TTD Pengirim"
                  : "TTD Pengirim"
              }}
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
                <span class="text-grey-darken-1">Metode Pengiriman</span>
                <span class="font-weight-medium">{{ header.jenisKirim }}</span>
              </div>
              <div class="d-flex justify-space-between align-center mb-1">
                <span class="text-grey-darken-1">Waktu Diterima</span>
                <div class="d-flex align-center gap-1">
                  <input
                    type="time"
                    v-model="header.jam"
                    :disabled="isFieldLocked"
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
              :disabled="isFieldLocked"
              @click="openTtdModal('driver')"
            >
              {{
                header.ttdDriver
                  ? isFieldLocked
                    ? "✓ TTD Driver (Terkunci)"
                    : "✓ Lihat / Ubah TTD Driver"
                  : "TTD Driver"
              }}
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
            <!-- QR Code Display Box Dinamis -->
            <div class="qr-box pa-2 border rounded-lg bg-white mb-2 elevation-1 d-inline-block">
              <QrcodeVue
                :value="displayManifestNomor"
                :size="65"
                level="M"
                render-as="svg"
                :style="isNew ? 'opacity: 0.35;' : ''"
              />
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
                <th>Tanggal SJ</th>
                <th>Store Tujuan</th>
                <th class="text-right">Qty (Pcs)</th>
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

@media print {
  body * {
    visibility: hidden !important;
  }
  .print-area,
  .print-area * {
    visibility: visible !important;
  }
  .print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    padding: 8mm !important;
    background: #ffffff !important;
    color: #000000 !important;
    margin: 0 !important;
  }
  .no-print,
  .v-overlay-container {
    display: none !important;
  }
}
</style>

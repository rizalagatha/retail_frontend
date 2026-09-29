<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch, nextTick, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import { formatRupiah } from "@/utils/formatRupiah";
import { useToast } from "vue-toastification";
import { getFabricTexture } from "@/utils/fabricTextures";
import { vReveal } from "@/directives/reveal";
import CountUp from "@/components/CountUp.vue";

// Import logo secara aman untuk Vite/Webpack
import LogoKaosan from "@/assets/logo.png";
import ShopeeLogo from "@/assets/shopee.png";
import TokpedLogo from "@/assets/tokped.png";
import TiktokLogo from "@/assets/tiktok.png";

const router = useRouter();
const toast = useToast();

const searchInput = ref("");
const isLoading = ref(false);
const errorMessage = ref("");

const isPromoDialogVisible = ref(false);
const selectedPromo = ref<PromoItem | null>(null);

// --- TIPE DATA ---
interface SearchItem {
  title: string;
  value: string;
}

interface SoData {
  nomorSo: string;
  penerima: string;
  kontakKomplain?: string;
  items: SearchItem[];
}

interface PromoItem {
  pro_jenis: number;
  pro_judul: string;
  pro_diskon: number;
  pro_disrp: number;
  pro_rpvoucher: number;
  pro_totalrp: number;
  pro_totalqty: number;
  pro_keterangan: string;
  pro_tanggal2: string;
}

interface TitikCetak {
  nama: string;
  panjang: number;
  lebar: number;
}

interface StokItem {
  kode: string;
  jenis_kain: string;
  jenis_kaos: string;
  lengan: string;
  nama: string;
  ukuran: string;
  harga: number;
  stok: number;
  total_terjual: number;
  jenis_kain_final?: string;
  gambar_url?: string;
  urutan?: number;

  galeri?: { url: string; index: number }[] | string;
}

interface StoreItem {
  kode: string;
  nama: string;
}

interface ContactItem {
  kode: string;
  nama: string;
  telepon: string;
  alamat: string;
  wa_link: string | null;
}

interface GroupedStokItem {
  kode: string;
  nama: string;
  harga: number;
  hargaMin: number;
  hargaMax: number;
  jenis_kain_final: string;
  lengan: string;
  total_terjual: number;
  total_stok: number;
  gambar_url: string | null; // <--- TAMBAH INI
  urutan: number; // <--- TAMBAH INI
  galeri: { url: string; index: number }[];
  variants: StokItem[];
}

// State hasil pencarian SO
const isFound = ref(false);
const soData = ref<SoData | null>(null);
const selectedItem = ref<string | null>(null);

// State Promo
const activePromos = ref<PromoItem[]>([]);
const isLoadingPromo = ref(true);

// State Cek Stok
const isCekStokDialogVisible = ref(false);
const cekStokPhase = ref<"select-store" | "select-category" | "show-stok">("select-store");
const NAMA_PRESET = ["Dada Kiri", "Punggung", "Lengan Kiri", "Lengan Kanan", "Kerah", "Dada Kanan"];
const searchStokKeyword = ref("");
const stokResults = ref<StokItem[]>([]);
const isLoadingStok = ref(false);

const publicStores = ref<StoreItem[]>([]);
const selectedStore = ref<string | null>(null);
const selectedKategori = ref<string>("ALL");
const selectedLengan = ref<string>("SEMUA");

const stokPage = ref(1);

const displayCount = ref(20); // awalnya tampil 20
const sentinel = ref<HTMLElement | null>(null); // elemen anchor di bawah grid

const isInternalNetwork = ref(false);

const isImageFullscreenVisible = ref(false);
const fullscreenImageIndex = ref(0);

const normalizedStokResults = computed(() => {
  return stokResults.value.map((item) => ({
    ...item,
    jenis_kain_final: (item.jenis_kain || "").trim() === "" ? "LAIN-LAIN" : item.jenis_kain.trim(),
  }));
});

const kategoriList = computed(() => {
  const catCount: Record<string, number> = {};

  masterGroupedStok.value.forEach((item) => {
    const jenis = item.jenis_kain_final;
    if (!catCount[jenis]) catCount[jenis] = 0;
    catCount[jenis] += 1;
  });

  return Object.keys(catCount).sort((a, b) => {
    if (a === "LAIN-LAIN") return 1;
    if (b === "LAIN-LAIN") return -1;
    return catCount[b] - catCount[a];
  });
});

const KEEP_UPPER = new Set(["DTF", "CVC", "UV", "PT", "CV", "RP", "SD", "DP", "BR", "SB"]);
const KEEP_LOWER = new Set(["dan", "atau", "di", "ke", "dari", "untuk", "yang", "dengan", "s/d"]);

// "PROMO KAOSAN 2026 - DISKON ITEM" -> "Promo Kaosan 2026 - Diskon Item"
const titleCase = (s: string) => {
  const words = (s || "").trim().toLowerCase().split(/\s+/);
  return words
    .map((w, i) => {
      const up = w.toUpperCase();
      // kode seperti COMBED 24S, RP100RB, atau singkatan dipertahankan kapital
      if (KEEP_UPPER.has(up) || (/\d/.test(w) && /[a-z]/.test(w) && w.length <= 8)) return up;
      if (i > 0 && KEEP_LOWER.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
};

const sentenceCase = (s: string) => {
  const t = (s || "").trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Nominal rupiah: "25.000" tetap utuh, "Rp" dipisah supaya angka mendapat ruang penuh
const promoValue = (p: PromoItem) => {
  if (p.pro_diskon > 0)
    return { prefix: "", before: "", num: Number(p.pro_diskon), after: "%", label: "Diskon" };
  if (p.pro_disrp > 0)
    return { prefix: "Rp", before: "", num: Number(p.pro_disrp), after: "", label: "Potongan" };
  if (p.pro_rpvoucher > 0)
    return { prefix: "Rp", before: "", num: Number(p.pro_rpvoucher), after: "", label: "Voucher" };
  if (p.pro_totalqty > 0)
    return {
      prefix: "",
      before: "Beli ",
      num: Number(p.pro_totalqty),
      after: "",
      label: "Lebih hemat",
    };
  return null;
};

// Helper untuk mengurutkan ukuran secara logis (S, M, L, XL, dst)
const getSizeRank = (size: string) => {
  const s = size.toUpperCase().trim();
  const ranks: Record<string, number> = {
    XS: 1,
    SS: 2,
    S: 3,
    M: 4,
    L: 5,
    XL: 6,
    XXL: 7,
    "2XL": 7,
    "3XL": 8,
    "4XL": 9,
    "5XL": 10,
  };
  if (ranks[s]) return ranks[s];
  const numericSize = parseInt(s);
  if (!isNaN(numericSize)) return 20 + numericSize;
  return 999;
};

// const filteredStok = computed(() => {
//   let data = [...normalizedStokResults.value];

//   // Filter Kategori
//   if (selectedKategori.value !== "ALL") {
//     data = data.filter((item) => item.jenis_kain_final === selectedKategori.value);
//   }

//   // Filter Pencarian
//   if (searchStokKeyword.value) {
//     const q = searchStokKeyword.value.toLowerCase();
//     data = data.filter(
//       (item) => item.nama.toLowerCase().includes(q) || item.ukuran.toLowerCase().includes(q)
//     );
//   }

//   // Urutkan item berdasarkan Nama (A-Z) yang di dalamnya sudah mengandung Warna
//   // Jika nama sama, urutkan berdasarkan Ukuran yang benar (S, M, L, XL)
//   data.sort((a, b) => {
//     if (a.nama === b.nama) {
//       return getSizeRank(a.ukuran) - getSizeRank(b.ukuran);
//     }
//     return a.nama.localeCompare(b.nama);
//   });

//   return data;
// });

const masterGroupedStok = computed(() => {
  const map = new Map<string, GroupedStokItem>();
  const cacheBuster = `?t=${new Date().getTime()}`; // <--- [BARU] Bikin timestamp

  normalizedStokResults.value.forEach((item: StokItem) => {
    if (!map.has(item.kode)) {
      let galeriArray: { url: string; index: number }[] = [];
      try {
        const rawGaleri = item.galeri
          ? typeof item.galeri === "string"
            ? JSON.parse(item.galeri)
            : item.galeri
          : [];

        // [PERBAIKAN] Tambahkan cache buster ke setiap URL di dalam galeri
        galeriArray = rawGaleri.map((g: { url: string; index: number }) => ({
          ...g,
          url: g.url ? `${g.url}${cacheBuster}` : g.url,
        }));
      } catch {
        galeriArray = [];
      }

      // [BARU] LOGIKA KATEGORI CUSTOM (Pisahkan Anak & Tunik)
      let kategoriFinal = item.jenis_kain_final || "LAIN-LAIN";
      const namaUpper = item.nama.toUpperCase();
      const jenisKaosUpper = (item.jenis_kaos || "").toUpperCase();

      if (
        namaUpper.includes("ANAK") ||
        jenisKaosUpper.includes("ANAK") ||
        namaUpper.includes("KIDS")
      ) {
        kategoriFinal = "KAOS ANAK";
      } else if (namaUpper.includes("TUNIK") || jenisKaosUpper.includes("TUNIK")) {
        kategoriFinal = "TUNIK";
      }

      map.set(item.kode, {
        kode: item.kode,
        nama: item.nama,
        harga: item.harga,
        hargaMin: item.harga > 0 ? item.harga : 999999999,
        hargaMax: item.harga,
        jenis_kain_final: kategoriFinal,
        lengan: (item.lengan || "").toUpperCase(),
        total_terjual: 0,
        total_stok: 0,
        // [PERBAIKAN] Tambahkan cache buster juga ke gambar utama
        gambar_url: item.gambar_url ? `${item.gambar_url}${cacheBuster}` : null,
        urutan: item.urutan || 9999,
        galeri: galeriArray,
        variants: [],
      });
    }

    const group = map.get(item.kode)!;
    group.total_stok += item.stok;
    group.total_terjual += Number(item.total_terjual || 0);

    if (item.harga > group.hargaMax) group.hargaMax = item.harga;
    if (item.harga > 0 && item.harga < group.hargaMin) group.hargaMin = item.harga;

    group.variants.push(item);
  });

  const result = Array.from(map.values());
  result.forEach((group) => {
    if (group.hargaMin === 999999999) group.hargaMin = 0;
    group.variants.sort((a, b) => getSizeRank(a.ukuran) - getSizeRank(b.ukuran));
  });

  return result;
});

const filteredGroupedStok = computed(() => {
  let data = [...masterGroupedStok.value];

  // Filter Kategori
  if (selectedKategori.value !== "ALL") {
    data = data.filter((item) => item.jenis_kain_final === selectedKategori.value);
  }

  // [BARU] Filter Lengan
  if (selectedLengan.value !== "SEMUA") {
    data = data.filter((item) => item.lengan.includes(selectedLengan.value));
  }

  // Filter Pencarian
  if (searchStokKeyword.value) {
    const q = searchStokKeyword.value.toLowerCase();
    data = data.filter(
      (item) => item.nama.toLowerCase().includes(q) || item.kode.toLowerCase().includes(q)
    );
  }

  // Urutkan berdasarkan total terjual terbanyak, lalu A-Z
  data.sort((a, b) => {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    if (b.total_terjual !== a.total_terjual) return b.total_terjual - a.total_terjual;
    return a.nama.localeCompare(b.nama);
  });

  return data;
});

const stokPaginated = computed(() => filteredGroupedStok.value.slice(0, displayCount.value));

const isStokDetailDialogVisible = ref(false);
const selectedProductStok = ref<GroupedStokItem | null>(null);

const openStokDetail = (product: GroupedStokItem) => {
  selectedProductStok.value = product;
  isStokDetailDialogVisible.value = true;
};

watch([searchStokKeyword, selectedLengan, selectedKategori], () => {
  displayCount.value = 20;
  stokPage.value = 1;
});
// Observer untuk load more
let observer: IntersectionObserver | null = null;

const setupObserver = () => {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        if (displayCount.value < filteredGroupedStok.value.length) {
          displayCount.value += 20;
        }
      }
    },
    { threshold: 0.1 }
  );
  if (sentinel.value) observer.observe(sentinel.value);
};

// Pasang observer saat fase show-stok
watch(cekStokPhase, async (val) => {
  if (val === "show-stok") {
    await nextTick();
    setupObserver();
  } else {
    observer?.disconnect();
  }
});

onUnmounted(() => {
  observer?.disconnect();
});
// --- STATE PUSAT BANTUAN ---
const isBantuanDialogVisible = ref(false);
const storeContacts = ref<ContactItem[]>([]);
const searchBantuan = ref("");
const isLoadingBantuan = ref(false);

// --- STATE & LOGIC ESTIMASI HARGA CUSTOM ---
const isEstimasiDialogVisible = ref(false);

const estimasiForm = reactive({
  jenis: "SD",
  qty: 12,
  sizeCetak: "A4",
  titiks: [{ nama: "Dada Kiri", panjang: 10, lebar: 12 }] as TitikCetak[],
});

const jenisCustomOptions = [
  { title: "Sablon DTF", value: "SD" },
  { title: "DTF Premium", value: "DP" },
  { title: "Bordir Komputer", value: "BR" },
  { title: "Sablon Manual", value: "SB" },
];

const tambahTitik = () => {
  const usedNames = estimasiForm.titiks.map((t) => t.nama);
  const nama =
    NAMA_PRESET.find((n) => !usedNames.includes(n)) || `Titik ${estimasiForm.titiks.length + 1}`;
  estimasiForm.titiks.push({ nama, panjang: 10, lebar: 10 });
};

const hapusTitik = (index: number) => {
  estimasiForm.titiks.splice(index, 1);
};

const hasilEstimasi = computed(() => {
  const { jenis, qty, sizeCetak, titiks } = estimasiForm;
  if (qty < 1 || titiks.length === 0) return { satuan: 0, total: 0, perTitik: [] };

  if (jenis === "SB") {
    const hargaPerTitik = sizeCetak === "A3" ? 35000 : sizeCetak === "A4" ? 20000 : 10000;
    const satuan = hargaPerTitik * titiks.length;
    return {
      satuan,
      total: satuan * qty,
      perTitik: titiks.map((t) => ({ nama: t.nama, luas: 0, harga: hargaPerTitik })),
    };
  }

  const hpCm2 = jenis === "SD" ? 25 : jenis === "DP" ? 35 : 150; // BR = 150/cm²

  const perTitik = titiks.map((t) => {
    const luas = (t.panjang || 0) * (t.lebar || 0);
    let harga = luas * hpCm2;
    if (jenis === "BR" && harga < 5000) harga = 5000;
    return { nama: t.nama, luas, harga };
  });

  const satuan = perTitik.reduce((sum, t) => sum + t.harga, 0);
  return { satuan, total: satuan * qty, perTitik };
});

const openEstimasi = () => {
  estimasiForm.jenis = "SD";
  estimasiForm.qty = 12;
  estimasiForm.titiks = [{ nama: "Dada Kiri", panjang: 10, lebar: 12 }];
  isEstimasiDialogVisible.value = true;
};

const fetchPublicStores = async () => {
  try {
    const response = await api.get("/so/public/stores");
    publicStores.value = response.data;
  } catch (error) {
    console.error("Gagal memuat daftar toko:", error);
  }
};

const fetchPromos = async () => {
  try {
    isLoadingPromo.value = true;

    // [FIX] Pakai format tanggal lokal (bukan UTC) agar tidak terjadi offset -7 jam
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`; // "2026-06-01" berdasarkan waktu lokal browser

    const response = await api.get("/so/public/active-promos", {
      params: { cabang: "K01", tanggal: today },
    });
    activePromos.value = response.data;
  } catch (error) {
    console.error("Gagal memuat promo:", error);
  } finally {
    isLoadingPromo.value = false;
  }
};

// --- FUNGSI CEK STOK PUBLIK ---
// const cariStokPublik = async () => {
//   if (!selectedStore.value) return;
//   isLoadingStok.value = true;
//   stokPage.value = 1; // ← reset ke halaman 1
//   try {
//     const response = await api.get("/so/public/cek-stok", {
//       params: { cabang: selectedStore.value, q: searchStokKeyword.value },
//     });
//     stokResults.value = response.data;
//     if (stokResults.value.length === 0) toast.info("Barang tidak ditemukan di Store ini.");
//   } catch {
//     toast.error("Gagal memuat data stok dari server.");
//   } finally {
//     isLoadingStok.value = false;
//   }
// };

// const openCekStok = () => {
//   stokResults.value = [];
//   searchStokKeyword.value = "";
//   selectedStore.value = null;
//   cekStokPhase.value = "select-store";
//   isCekStokDialogVisible.value = true;
// };

const pilihStore = async (kode: string) => {
  selectedStore.value = kode;
  stokResults.value = [];
  searchStokKeyword.value = "";
  selectedKategori.value = "ALL";
  stokPage.value = 1;

  // Langsung pindah ke fase kategori, loading tampil di sana
  cekStokPhase.value = "select-category";
  isLoadingStok.value = true;

  try {
    const response = await api.get("/so/public/cek-stok", {
      params: { cabang: kode, q: "" },
    });
    stokResults.value = response.data;
    if (stokResults.value.length === 0) {
      toast.info("Stok di Store ini sedang kosong.");
    }
  } catch {
    toast.error("Gagal memuat data stok dari server.");
  } finally {
    isLoadingStok.value = false;
  }
};

const pilihKategori = (kategori: string) => {
  selectedKategori.value = kategori;
  stokPage.value = 1; // ← pastikan baris ini ada
  searchStokKeyword.value = "";
  cekStokPhase.value = "show-stok";
};
const kembaliPilihStore = () => {
  selectedStore.value = null;
  stokResults.value = [];
  cekStokPhase.value = "select-store";
};

const kembaliPilihKategori = () => {
  cekStokPhase.value = "select-category";
  searchStokKeyword.value = "";
};

const openFullscreen = (index: number) => {
  fullscreenImageIndex.value = index;
  isImageFullscreenVisible.value = true;
};

const checkNetworkStatus = async () => {
  try {
    const response = await api.get("/auth/check-ip"); // Sesuaikan path jika prefix route auth Anda berbeda
    isInternalNetwork.value = response.data.isLocal;
  } catch (error) {
    console.error("Gagal mendeteksi jaringan", error);
    isInternalNetwork.value = false;
  }
};

// --- FUNGSI DECODE UNTUK BACA RESI ---
const decodeResi = (resi: string) => {
  try {
    const raw = resi.trim().toUpperCase();
    if (!raw.startsWith("KSN")) return raw;
    const cabang = raw.substring(3, 6);
    const encodedNum = raw.substring(6);
    const secretVal = parseInt(encodedNum, 36);
    if (isNaN(secretVal)) return raw;
    const origNum = (secretVal - 456789) / 7;
    if (!Number.isInteger(origNum)) return raw;
    let numStr = origNum.toString();
    if (numStr.length < 8) {
      numStr = numStr.padStart(8, "0");
    }
    const part1 = numStr.substring(0, 4);
    const part2 = numStr.substring(4);
    return `${cabang}.SO.${part1}.${part2}`;
  } catch {
    return resi;
  }
};

const cariPesanan = async () => {
  if (!searchInput.value) return;

  isLoading.value = true;
  errorMessage.value = "";
  isFound.value = false;
  selectedItem.value = null;

  try {
    const rawInput = searchInput.value;
    const realSoNumber = decodeResi(rawInput);
    const response = await api.get(`/so/search-track/${realSoNumber}`);
    soData.value = response.data;

    if (soData.value) {
      soData.value.items.unshift({
        title: "🔍 Lacak Semua (Keseluruhan)",
        value: "UMUM",
      });
    }

    isFound.value = true;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    errorMessage.value = err.response?.data?.message || "Pesanan tidak ditemukan.";
  } finally {
    isLoading.value = false;
  }
};

const encodeResi = (nomorSo: string) => {
  try {
    const parts = nomorSo.split(".SO.");
    if (parts.length !== 2) return nomorSo;
    const cabang = parts[0];
    const numPart = parts[1].replace(".", "");
    const num = Number(numPart);
    if (isNaN(num)) return nomorSo;
    const secretVal = num * 7 + 456789;
    const encodedNum = secretVal.toString(36).toUpperCase();
    return `KSN${cabang}${encodedNum}`;
  } catch {
    return nomorSo;
  }
};

const lanjutLacak = () => {
  const target = selectedItem.value || "UMUM";

  if (soData.value) {
    const secureNomor = encodeResi(soData.value.nomorSo);
    router.push({
      path: `/transaksi/penjualan/surat-pesanan/track/${secureNomor}`,
      query: { target: target },
    });
  }
};

const klaimPromo = (promo: PromoItem) => {
  selectedPromo.value = promo;
  isPromoDialogVisible.value = true;
};

const daysLeft = (tgl2: string): number => {
  const end = new Date(tgl2);
  end.setHours(23, 59, 59);
  const diff = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const filteredContacts = computed(() => {
  if (!searchBantuan.value) return storeContacts.value;
  const q = searchBantuan.value.toLowerCase();
  return storeContacts.value.filter(
    (store) =>
      store.nama.toLowerCase().includes(q) ||
      (store.alamat && store.alamat.toLowerCase().includes(q))
  );
});

const openBantuan = async () => {
  isBantuanDialogVisible.value = true;
  if (storeContacts.value.length === 0) {
    isLoadingBantuan.value = true;
    try {
      const response = await api.get("/so/public/contacts");
      storeContacts.value = response.data;
    } catch {
      toast.error("Gagal memuat data kontak toko.");
    } finally {
      isLoadingBantuan.value = false;
    }
  }
};

const formatPromoValue = (promo: PromoItem): string => {
  if (promo.pro_diskon > 0) return `Diskon ${promo.pro_diskon}%`;
  if (promo.pro_disrp > 0) return `Potongan ${formatRupiah(promo.pro_disrp)}`;
  if (promo.pro_rpvoucher > 0) return `Voucher ${formatRupiah(promo.pro_rpvoucher)}`;
  if (promo.pro_totalqty > 0) return `Beli ${promo.pro_totalqty} Lebih Hemat`;
  return "Harga Spesial";
};

onMounted(() => {
  fetchPromos();
  fetchPublicStores();
  checkNetworkStatus();
});
</script>

<template>
  <div class="tracking-layout t-page">
    <!-- HEADER -->
    <header class="t-header">
      <div class="t-header-inner">
        <a href="https://kaosanofficial.com" target="_blank" class="t-brand">
          <img :src="LogoKaosan" height="36" alt="Kaosan" />
        </a>
        <nav class="t-nav">
          <a href="https://kaosanofficial.com" target="_blank">Beranda</a>
          <a href="https://kaosanofficial.com/layanan" target="_blank">Layanan</a>
          <router-link to="/katalog">Katalog</router-link>
          <v-btn
            v-if="isInternalNetwork"
            color="#B71C1C"
            variant="flat"
            size="small"
            class="text-white font-weight-bold text-none px-4"
            prepend-icon="mdi-login-variant"
            @click="router.push({ path: '/login', query: { redirect: '/admin-katalog' } })"
          >
            Staff Login
          </v-btn>
        </nav>
      </div>
    </header>

    <!-- HERO -->
    <section class="t-hero">
      <div class="t-hero-inner">
        <div class="t-eyebrow">Lacak Pesanan</div>
        <h1 class="t-hero-title">
          <span class="t-line" style="--n: 0">Sudah sampai</span>
          <em class="t-line" style="--n: 1">mana</em>
          <span class="t-line" style="--n: 2">pesananmu?</span>
        </h1>
        <p class="t-hero-sub">
          Masukkan nomor resi untuk melihat proses produksi sampai pesanan siap diambil.
        </p>
      </div>
    </section>

    <main class="t-main">
      <!-- PANEL PENCARIAN -->
      <section class="t-search" :class="{ 't-search--loading': isLoading }">
        <div class="t-search-row">
          <v-text-field
            v-model="searchInput"
            placeholder="Nomor resi, contoh: KSNK01..."
            variant="outlined"
            color="#B71C1C"
            bg-color="white"
            hide-details="auto"
            class="t-search-input search-field-red"
            density="comfortable"
            prepend-inner-icon="mdi-magnify"
            :error-messages="errorMessage"
            @keyup.enter="cariPesanan"
          ></v-text-field>
          <v-btn
            color="#B71C1C"
            height="48"
            class="text-white px-8 font-weight-bold text-none t-search-btn"
            :loading="isLoading"
            :disabled="isLoading"
            @click="cariPesanan"
          >
            {{ isLoading ? "Mencari..." : "Lacak" }}
          </v-btn>
        </div>

        <v-expand-transition>
          <div v-if="isFound && soData" class="t-found">
            <div class="t-found-head">
              <div>
                <div class="t-found-label">Atas nama</div>
                <div class="t-found-name">{{ soData.penerima }}</div>
              </div>
              <span class="t-found-badge">
                <v-icon size="14">mdi-check</v-icon> Pesanan ditemukan
              </span>
            </div>

            <div class="t-found-label mb-2">Pilih barang yang ingin dilacak</div>
            <v-select
              v-model="selectedItem"
              :items="soData.items"
              item-title="title"
              item-value="value"
              placeholder="Pilih barang"
              variant="outlined"
              density="comfortable"
              color="#B71C1C"
              hide-details="auto"
              class="mb-4 search-field-red"
            ></v-select>

            <v-btn
              block
              size="large"
              color="#B71C1C"
              class="font-weight-bold text-white text-none"
              :disabled="!selectedItem"
              @click="lanjutLacak"
            >
              Lihat rincian proses
              <v-icon end>mdi-arrow-right</v-icon>
            </v-btn>
          </div>
        </v-expand-transition>

        <ol v-if="!isFound" class="t-steps">
          <li><span>1</span> Masukkan nomor resi dari struk atau WhatsApp</li>
          <li><span>2</span> Pilih barang yang ingin dilacak</li>
          <li><span>3</span> Lihat tahapan dari produksi sampai siap</li>
        </ol>
      </section>

      <!-- PROMO -->
      <v-expand-transition>
        <section v-if="!isLoadingPromo && activePromos.length > 0" class="t-section">
          <div class="t-section-head">
            <h2 class="t-section-title">Promo yang sedang berlaku</h2>
            <span class="t-section-note">{{ activePromos.length }} promo</span>
          </div>

          <div class="t-promo-grid">
            <article
              v-for="(promo, index) in activePromos"
              :key="index"
              class="t-coupon"
              v-reveal="index"
            >
              <div class="t-coupon-value">
                <template v-if="promoValue(promo)">
                  <span class="t-coupon-label">{{ promoValue(promo)!.label }}</span>
                  <span v-if="promoValue(promo)!.prefix" class="t-coupon-prefix">
                    {{ promoValue(promo)!.prefix }}
                  </span>
                  <span class="t-coupon-big">
                    <CountUp
                      :to="promoValue(promo)!.num"
                      :before="promoValue(promo)!.before"
                      :after="promoValue(promo)!.after"
                    />
                  </span>
                </template>
                <template v-else>
                  <span class="t-coupon-label">Harga</span>
                  <span class="t-coupon-big">Spesial</span>
                </template>
              </div>

              <div class="t-coupon-body">
                <h3 class="t-coupon-title">{{ titleCase(promo.pro_judul) }}</h3>

                <div v-if="promo.pro_totalrp > 0 || promo.pro_totalqty > 0" class="t-coupon-min">
                  <template v-if="promo.pro_totalrp > 0">
                    Min. belanja {{ formatRupiah(promo.pro_totalrp) }}
                  </template>
                  <template v-else>Min. {{ promo.pro_totalqty }} item</template>
                </div>

                <p class="t-coupon-desc">
                  {{ sentenceCase(promo.pro_keterangan || "Berlaku untuk pemesanan di Kaosan.") }}
                </p>

                <div class="t-coupon-foot">
                  <span
                    class="t-coupon-days"
                    :class="{ 't-urgent': daysLeft(promo.pro_tanggal2) <= 7 }"
                  >
                    <i class="t-dot"></i>
                    {{
                      daysLeft(promo.pro_tanggal2) === 0
                        ? "Berakhir hari ini"
                        : `${daysLeft(promo.pro_tanggal2)} hari lagi`
                    }}
                  </span>
                  <button class="t-coupon-btn" @click="klaimPromo(promo)">
                    Cara klaim
                    <v-icon size="14">mdi-arrow-right</v-icon>
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </v-expand-transition>

      <!-- LAYANAN -->
      <section class="t-section" v-reveal>
        <div class="t-section-head">
          <h2 class="t-section-title">Layanan Kaosan</h2>
        </div>

        <div class="t-service-grid">
          <button class="t-service" v-reveal="0" @click="router.push('/katalog')">
            <span class="t-service-icon"><v-icon size="22">mdi-hanger</v-icon></span>
            <span class="t-service-text">
              <span class="t-service-name">Katalog Produk</span>
              <span class="t-service-desc">Lihat koleksi berdasarkan jenis kain</span>
            </span>
            <v-icon class="t-service-arrow" size="18">mdi-arrow-right</v-icon>
          </button>

          <button class="t-service" v-reveal="1" @click="router.push('/cek-stok')">
            <span class="t-service-icon"><v-icon size="22">mdi-store-search-outline</v-icon></span>
            <span class="t-service-text">
              <span class="t-service-name">Cek Stok Store <em class="t-beta">Beta</em></span>
              <span class="t-service-desc">Ketersediaan barang siap jual per store</span>
            </span>
            <v-icon class="t-service-arrow" size="18">mdi-arrow-right</v-icon>
          </button>

          <button class="t-service" v-reveal="2" @click="openEstimasi">
            <span class="t-service-icon"
              ><v-icon size="22">mdi-calculator-variant-outline</v-icon></span
            >
            <span class="t-service-text">
              <span class="t-service-name">Estimasi Harga Custom <em class="t-beta">Beta</em></span>
              <span class="t-service-desc">Hitung biaya sablon dan bordir</span>
            </span>
            <v-icon class="t-service-arrow" size="18">mdi-arrow-right</v-icon>
          </button>

          <button class="t-service" v-reveal="3" @click="openBantuan">
            <span class="t-service-icon"><v-icon size="22">mdi-headset</v-icon></span>
            <span class="t-service-text">
              <span class="t-service-name">Pusat Bantuan</span>
              <span class="t-service-desc">Hubungi CS di store terdekat</span>
            </span>
            <v-icon class="t-service-arrow" size="18">mdi-arrow-right</v-icon>
          </button>
        </div>
      </section>
    </main>

    <!-- FOOTER -->
    <footer class="t-footer">
      <div class="t-footer-inner">
        <v-expand-transition>
          <div v-if="isFound && soData?.kontakKomplain" class="t-complaint">
            <div class="t-complaint-title">Layanan pengaduan konsumen KAOSAN</div>
            <div class="t-complaint-text">{{ soData.kontakKomplain }} (WhatsApp)</div>

            <div class="t-complaint-title mt-4">
              Direktorat Jenderal Perlindungan Konsumen dan Tertib Niaga, Kementerian Perdagangan
              Republik Indonesia
            </div>
            <div class="t-complaint-text">0853 111 1010 (WhatsApp)</div>
          </div>
        </v-expand-transition>

        <div class="t-footer-row">
          <div class="t-copy">
            <img :src="LogoKaosan" height="20" alt="Kaosan" class="grayscale" />
            <span
              >&copy; {{ new Date().getFullYear() }} KAOSAN. Semua hak dilindungi
              undang-undang.</span
            >
          </div>

          <div class="t-social">
            <v-btn
              icon
              variant="text"
              color="grey-darken-3"
              size="small"
              href="https://instagram.com/kaosan.official"
              target="_blank"
              class="social-btn"
            >
              <v-icon size="22" class="social-icon">mdi-instagram</v-icon>
            </v-btn>
            <v-btn
              icon
              variant="text"
              color="grey-darken-3"
              size="small"
              href="https://www.facebook.com/kaosanofficiall"
              target="_blank"
              class="social-btn"
            >
              <v-icon size="22" class="social-icon">mdi-facebook</v-icon>
            </v-btn>
            <v-btn
              icon
              variant="text"
              size="small"
              href="https://www.tiktok.com/@kaosanofficial_"
              target="_blank"
              class="social-btn"
            >
              <img :src="TiktokLogo" alt="TikTok" class="social-img" />
            </v-btn>
            <v-btn
              icon
              variant="text"
              size="small"
              href="https://shopee.co.id/kaosan_official"
              target="_blank"
              class="social-btn"
            >
              <img :src="ShopeeLogo" alt="Shopee" class="social-img" />
            </v-btn>
            <v-btn
              icon
              variant="text"
              size="small"
              href="https://www.tokopedia.com/kaosanofficial-118"
              target="_blank"
              class="social-btn"
            >
              <img :src="TokpedLogo" alt="Tokopedia" class="social-img" />
            </v-btn>
          </div>
        </div>
      </div>
    </footer>

    <v-dialog v-model="isPromoDialogVisible" max-width="400px" :scrim="true">
      <v-card v-if="selectedPromo" rounded="xl" class="overflow-hidden">
        <div
          style="
            background: linear-gradient(135deg, #d32f2f 0%, #ef5350 100%);
            padding: 28px 24px 20px;
            text-align: center;
            position: relative;
          "
        >
          <v-btn
            icon="mdi-close"
            size="small"
            variant="text"
            style="position: absolute; top: 8px; right: 8px; color: rgba(255, 255, 255, 0.8)"
            @click="isPromoDialogVisible = false"
          ></v-btn>

          <div
            style="
              width: 64px;
              height: 64px;
              border-radius: 50%;
              background: rgba(255, 255, 255, 0.2);
              border: 2px solid rgba(255, 255, 255, 0.4);
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 12px;
            "
          >
            <v-icon size="32" color="white">mdi-ticket-percent</v-icon>
          </div>
          <div class="text-h6 font-weight-bold text-white mb-1">Promo ini untukmu!</div>
          <div class="text-caption text-white opacity-80">Kunjungi store terdekat untuk klaim</div>
        </div>

        <div
          style="
            height: 5px;
            background: repeating-linear-gradient(
              90deg,
              #ffd700 0px,
              #ffd700 12px,
              #ff6b6b 12px,
              #ff6b6b 24px,
              #4ecdc4 24px,
              #4ecdc4 36px
            );
          "
        ></div>

        <v-card-text class="pa-5">
          <div class="text-center mb-4">
            <v-chip color="orange-lighten-4" size="small" class="font-weight-medium">
              <v-icon start size="10" color="orange-darken-3">mdi-circle</v-icon>
              <span class="text-orange-darken-3">Terbatas — segera klaim sebelum habis</span>
            </v-chip>
          </div>

          <v-card variant="tonal" color="red-lighten-5" rounded="lg" class="mb-4 pa-3">
            <div class="text-subtitle-2 font-weight-bold text-grey-darken-3 mb-1">
              {{ selectedPromo.pro_judul }}
            </div>
            <div class="text-h6 font-weight-black" style="color: #d32f2f">
              {{ formatPromoValue(selectedPromo) }}
            </div>
            <div class="text-caption text-grey-darken-1 mt-1">
              Berlaku hingga: {{ selectedPromo.pro_tanggal2.split("T")[0] }}
            </div>
          </v-card>

          <v-card variant="outlined" rounded="lg" class="mb-5 pa-3">
            <div class="d-flex align-center gap-3">
              <div
                style="
                  width: 44px;
                  height: 44px;
                  border-radius: 10px;
                  background: #ffebee;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  flex-shrink: 0;
                "
              >
                <v-icon color="#D32F2F">mdi-store</v-icon>
              </div>
              <div>
                <div class="text-subtitle-2 font-weight-bold">Store Kaosan Terdekat</div>
                <div class="text-caption text-grey-darken-1">
                  Tunjukkan halaman ini ke kasir saat tiba
                </div>
              </div>
            </div>
          </v-card>

          <div class="d-flex justify-space-around mb-5">
            <div
              v-for="(step, i) in [
                { icon: 'mdi-store-marker', label: 'Kunjungi store' },
                { icon: 'mdi-card-account-details', label: 'Tunjukkan ke kasir' },
                { icon: 'mdi-tag-heart', label: 'Nikmati diskonnya' },
              ]"
              :key="i"
              class="text-center"
              style="flex: 1"
            >
              <div
                style="
                  width: 36px;
                  height: 36px;
                  border-radius: 50%;
                  background: #ffebee;
                  border: 1.5px solid #ef9e9e;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  margin: 0 auto 6px;
                "
              >
                <span class="text-caption font-weight-bold" style="color: #d32f2f">{{
                  i + 1
                }}</span>
              </div>
              <div class="text-caption text-grey-darken-1" style="line-height: 1.3">
                {{ step.label }}
              </div>
            </div>
          </div>

          <v-btn
            block
            size="large"
            color="#D32F2F"
            class="text-white font-weight-bold mb-2"
            rounded="lg"
            prepend-icon="mdi-map-marker"
          >
            Cari Store Terdekat
          </v-btn>
          <v-btn
            block
            variant="text"
            size="small"
            class="text-grey"
            @click="isPromoDialogVisible = false"
          >
            Nanti saja
          </v-btn>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isCekStokDialogVisible" max-width="900px" scrollable>
      <v-card class="rounded-xl overflow-hidden" style="max-height: 90vh">
        <v-toolbar color="#D32F2F" density="compact" style="padding: 0 4px 0 0">
          <div class="d-flex align-center pl-3 flex-grow-1 overflow-hidden">
            <v-icon color="white" size="18" class="flex-shrink-0 mr-2"
              >mdi-store-search-outline</v-icon
            >
            <span class="text-body-2 font-weight-bold text-white text-truncate">
              Cek Stok Store
            </span>
          </div>
          <v-btn
            icon="mdi-close"
            color="white"
            variant="text"
            size="small"
            @click="isCekStokDialogVisible = false"
          ></v-btn>
        </v-toolbar>

        <v-card-text class="pa-4 bg-grey-lighten-4">
          <template v-if="cekStokPhase === 'select-store'">
            <p class="text-caption text-grey-darken-2 mb-4">
              Pilih store terlebih dahulu untuk melihat ketersediaan stok barang siap jual.
            </p>

            <v-row class="d-none d-sm-flex">
              <v-col v-for="store in publicStores" :key="store.kode" cols="12" sm="6" md="4">
                <v-card
                  elevation="0"
                  class="border rounded-xl pa-3 d-flex align-center bg-white card-hover cursor-pointer"
                  :class="{ 'border-red': selectedStore === store.kode }"
                  style="border-width: 1.5px !important"
                  @click="pilihStore(store.kode)"
                >
                  <v-avatar size="44" color="red-lighten-5" class="mr-3 flex-shrink-0">
                    <v-icon color="#D32F2F" size="22">mdi-store</v-icon>
                  </v-avatar>
                  <div class="flex-grow-1 overflow-hidden">
                    <div class="font-weight-bold text-subtitle-2 text-grey-darken-3 text-truncate">
                      {{ store.nama }}
                    </div>
                    <div class="text-caption text-grey-darken-1">Store Kaosan</div>
                  </div>
                  <v-icon color="#D32F2F" size="20">mdi-chevron-right</v-icon>
                </v-card>
              </v-col>
            </v-row>

            <div class="d-flex d-sm-none flex-column" style="gap: 8px">
              <v-card
                v-for="store in publicStores"
                :key="store.kode"
                elevation="0"
                class="border rounded-xl pa-3 d-flex align-center bg-white cursor-pointer"
                @click="pilihStore(store.kode)"
              >
                <v-avatar size="40" color="red-lighten-5" class="mr-3 flex-shrink-0">
                  <v-icon color="#D32F2F" size="20">mdi-store</v-icon>
                </v-avatar>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="font-weight-bold text-subtitle-2 text-grey-darken-3 text-truncate">
                    {{ store.nama }}
                  </div>
                  <div class="text-caption text-grey-darken-1">Store Kaosan</div>
                </div>
                <v-icon color="grey-lighten-1" size="20">mdi-chevron-right</v-icon>
              </v-card>
            </div>
          </template>

          <template v-else-if="cekStokPhase === 'select-category'">
            <div class="d-flex align-center mb-4 gap-2">
              <v-btn
                variant="outlined"
                size="small"
                prepend-icon="mdi-arrow-left"
                @click="kembaliPilihStore"
                class="text-none font-weight-medium"
                style="border-color: #ddd; color: #555"
                >Ganti Store</v-btn
              >
              <v-chip
                color="red-lighten-4"
                size="small"
                class="font-weight-bold"
                style="color: #d32f2f"
                prepend-icon="mdi-store"
              >
                {{ publicStores.find((s) => s.kode === selectedStore)?.nama || selectedStore }}
              </v-chip>
            </div>

            <!-- Loading saat fetch -->
            <div v-if="isLoadingStok" class="text-center pa-8">
              <v-progress-circular indeterminate color="#D32F2F" size="36"></v-progress-circular>
              <div class="text-caption text-grey-darken-1 mt-3">Memuat data stok...</div>
            </div>

            <template v-else>
              <p class="text-caption text-grey-darken-2 mb-4">
                Pilih kategori jenis kain yang ingin Anda lihat.
              </p>

              <v-row dense>
                <v-col cols="6" sm="4" md="3">
                  <v-card
                    elevation="0"
                    class="border rounded-lg overflow-hidden card-hover bg-white h-100"
                    @click="pilihKategori('ALL')"
                  >
                    <div v-html="getFabricTexture('SEMUA')" style="line-height: 0"></div>
                    <div class="pa-2 text-center">
                      <div class="font-weight-bold text-caption text-grey-darken-3">SEMUA</div>
                      <div class="text-caption text-grey" style="font-size: 10px">
                        {{ masterGroupedStok.length }} item
                      </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col v-for="kat in kategoriList" :key="kat" cols="6" sm="4" md="3">
                  <v-card
                    elevation="0"
                    class="border rounded-lg overflow-hidden card-hover bg-white h-100"
                    @click="pilihKategori(kat)"
                  >
                    <div v-html="getFabricTexture(kat)" style="line-height: 0"></div>
                    <div class="pa-2 text-center">
                      <div class="font-weight-bold text-caption text-grey-darken-3">{{ kat }}</div>
                      <div class="text-caption text-grey" style="font-size: 10px">
                        {{ masterGroupedStok.filter((i) => i.jenis_kain_final === kat).length }}
                        item
                      </div>
                    </div>
                  </v-card>
                </v-col>
              </v-row>
            </template>
          </template>

          <template v-else-if="cekStokPhase === 'show-stok'">
            <div class="d-flex align-center mb-3 gap-2 flex-wrap">
              <v-btn
                variant="outlined"
                size="small"
                prepend-icon="mdi-arrow-left"
                class="font-weight-medium text-none"
                style="border-color: #ddd; color: #555"
                @click="kembaliPilihKategori"
              >
                Kategori
              </v-btn>
              <v-chip
                color="red-lighten-4"
                size="small"
                class="font-weight-bold text-uppercase"
                style="color: #d32f2f"
                prepend-icon="mdi-layers-outline"
              >
                {{ selectedKategori === "ALL" ? "Semua Kategori" : selectedKategori }}
              </v-chip>
            </div>

            <div class="lengan-toggle mb-3">
              <button
                v-for="opt in [
                  { label: 'Semua', value: 'SEMUA' },
                  { label: 'Pendek', value: 'PENDEK' },
                  { label: 'Panjang', value: 'PANJANG' },
                ]"
                :key="opt.value"
                class="lengan-btn"
                :class="{ 'lengan-btn--active': selectedLengan === opt.value }"
                @click="selectedLengan = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>

            <v-text-field
              v-model="searchStokKeyword"
              placeholder="Cari nama / kode warna..."
              variant="outlined"
              density="compact"
              hide-details
              bg-color="white"
              prepend-inner-icon="mdi-magnify"
              class="search-field-red mb-4"
            ></v-text-field>

            <div class="shopee-grid-wrapper mt-2">
              <div v-if="isLoadingStok" class="text-center pa-8">
                <v-progress-circular indeterminate color="#D32F2F" size="36"></v-progress-circular>
                <div class="text-caption text-grey-darken-1 mt-3">Memuat data stok...</div>
              </div>

              <div
                v-else-if="stokPaginated.length === 0"
                class="text-center pa-8 text-grey bg-white border rounded-lg"
              >
                <v-icon size="48" class="mb-2">mdi-package-variant-closed</v-icon><br />
                <span class="text-caption">Barang tidak ditemukan.</span>
              </div>

              <v-row v-else dense>
                <v-col v-for="(item, i) in stokPaginated" :key="i" cols="6" sm="4" md="3">
                  <v-card
                    class="shopee-card h-100 d-flex flex-column"
                    elevation="0"
                    @click="openStokDetail(item)"
                  >
                    <div class="product-img-wrapper bg-grey-lighten-4">
                      <v-img
                        v-if="item.gambar_url"
                        :src="item.gambar_url"
                        height="100%"
                        width="100%"
                        cover
                      >
                        <template #placeholder>
                          <div class="d-flex align-center justify-center fill-height">
                            <v-progress-circular
                              indeterminate
                              color="grey-lighten-1"
                              size="20"
                            ></v-progress-circular>
                          </div>
                        </template>
                        <template #error>
                          <div
                            class="texture-fill h-100"
                            v-html="getFabricTexture(item.jenis_kain_final)"
                          ></div>
                        </template>
                      </v-img>

                      <div
                        v-else
                        class="texture-fill"
                        v-html="getFabricTexture(item.jenis_kain_final)"
                      ></div>

                      <div class="size-badge">{{ item.variants.length }} Ukuran</div>
                    </div>

                    <v-card-text class="pa-2 d-flex flex-column flex-grow-1 bg-white">
                      <div
                        class="product-name text-caption font-weight-medium text-grey-darken-4 mb-1"
                        :title="item.nama"
                      >
                        {{ item.nama }}
                        <v-tooltip
                          activator="parent"
                          location="top"
                          open-delay="200"
                          max-width="250"
                        >
                          {{ item.nama }}
                        </v-tooltip>
                      </div>

                      <div class="mt-auto">
                        <div class="text-caption text-red-darken-2 font-weight-black">
                          <template v-if="item.hargaMin !== item.hargaMax">
                            Rp {{ formatRupiah(item.hargaMin) }} - {{ formatRupiah(item.hargaMax) }}
                          </template>
                          <template v-else> Rp {{ formatRupiah(item.hargaMin) }} </template>
                        </div>

                        <div class="d-flex align-center justify-space-between mt-1">
                          <span class="text-grey-darken-1" style="font-size: 9px"
                            >Kode: {{ item.kode }}</span
                          >
                          <span class="text-grey-darken-1" style="font-size: 9px"
                            >Terjual: {{ item.total_terjual }}</span
                          >
                        </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </div>

            <div ref="sentinel" class="sentinel"></div>
            <div v-if="displayCount < filteredGroupedStok.length" class="text-center pa-4">
              <v-progress-circular indeterminate color="#D32F2F" size="24"></v-progress-circular>
              <div class="text-caption text-grey-darken-1 mt-2">Memuat lebih banyak...</div>
            </div>
            <div
              v-else-if="filteredGroupedStok.length > 0"
              class="text-center pa-3 text-caption text-grey"
            >
              Semua {{ filteredGroupedStok.length }} produk sudah ditampilkan
            </div>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isStokDetailDialogVisible" max-width="400px" scrollable>
      <v-card class="rounded-xl overflow-hidden">
        <v-toolbar color="#D32F2F" density="compact" style="padding: 0 4px 0 0">
          <div class="d-flex align-center pl-3 flex-grow-1 overflow-hidden">
            <v-icon color="white" size="18" class="flex-shrink-0 mr-2">mdi-tshirt-crew</v-icon>
            <span class="text-body-2 font-weight-bold text-white text-truncate">
              Rincian Ukuran
            </span>
          </div>
          <v-btn
            icon="mdi-close"
            color="white"
            variant="text"
            size="small"
            @click="isStokDetailDialogVisible = false"
          ></v-btn>
        </v-toolbar>

        <v-card-text class="pa-4 bg-white">
          <div v-if="selectedProductStok">
            <v-carousel
              v-if="selectedProductStok.galeri && selectedProductStok.galeri.length > 0"
              height="360"
              hide-delimiter-background
              show-arrows="hover"
              class="rounded-lg mb-4 bg-grey-lighten-4 border"
            >
              <v-carousel-item v-for="(img, i) in selectedProductStok.galeri" :key="i">
                <v-img
                  :src="img.url"
                  cover
                  height="100%"
                  style="cursor: zoom-in"
                  @click="openFullscreen(i)"
                >
                  <template #placeholder>
                    <div class="d-flex align-center justify-center fill-height">
                      <v-progress-circular
                        indeterminate
                        color="grey-lighten-1"
                      ></v-progress-circular>
                    </div>
                  </template>
                  <template #error>
                    <div class="d-flex align-center justify-center fill-height bg-grey-lighten-3">
                      <v-icon size="40" color="grey">mdi-image-broken-variant</v-icon>
                    </div>
                  </template>
                </v-img>
              </v-carousel-item>
            </v-carousel>

            <div
              v-else
              class="rounded-lg overflow-hidden mb-4 border bg-grey-lighten-4"
              style="height: 360px"
            >
              <div
                class="texture-fill h-100"
                v-html="getFabricTexture(selectedProductStok.jenis_kain_final)"
              ></div>
            </div>

            <div class="font-weight-bold text-subtitle-1 mb-1" style="line-height: 1.2">
              {{ selectedProductStok.nama }}
            </div>
            <div class="text-caption text-grey-darken-1 mb-4">
              Kode: {{ selectedProductStok.kode }}
            </div>

            <v-divider class="mb-4"></v-divider>

            <div class="text-caption font-weight-bold text-grey-darken-3 mb-2 mt-2">
              Pilih Ukuran
            </div>
            <div class="d-flex flex-wrap" style="gap: 8px">
              <div
                v-for="variant in selectedProductStok.variants"
                :key="variant.ukuran"
                class="uniqlo-size-box"
                tabindex="0"
                :class="{
                  'out-of-stock': variant.stok <= 0,
                  'low-stock': variant.stok > 0 && variant.stok <= 3,
                  'in-stock': variant.stok > 3,
                }"
              >
                {{ variant.ukuran }}
                <div v-if="variant.stok <= 0" class="strikethrough-line"></div>

                <v-tooltip
                  activator="parent"
                  location="top"
                  open-on-click
                  content-class="bg-grey-darken-4 text-caption font-weight-bold"
                >
                  {{ variant.stok <= 0 ? "Stok Habis" : `Sisa Stok: ${variant.stok} Pcs` }}
                </v-tooltip>
              </div>
            </div>

            <div
              class="d-flex align-center gap-3 mt-6 text-caption font-weight-medium text-grey-darken-2"
            >
              <div class="d-flex align-center gap-1">
                <div
                  style="width: 14px; height: 14px; background: #2e7d32; border-radius: 3px"
                ></div>
                Tersedia
              </div>
              <div class="d-flex align-center gap-1">
                <div
                  style="width: 14px; height: 14px; background: #d32f2f; border-radius: 3px"
                ></div>
                Menipis
              </div>
              <div class="d-flex align-center gap-1">
                <div
                  style="
                    width: 14px;
                    height: 14px;
                    background: #f5f5f5;
                    border: 1px solid #e0e0e0;
                    position: relative;
                    border-radius: 3px;
                    overflow: hidden;
                  "
                >
                  <div
                    style="
                      position: absolute;
                      top: 50%;
                      left: -20%;
                      width: 140%;
                      height: 1.5px;
                      background: #bdbdbd;
                      transform: rotate(-45deg);
                    "
                  ></div>
                </div>
                Habis
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="isImageFullscreenVisible"
      max-width="100vw"
      :scrim="true"
      style="background: rgba(0, 0, 0, 0.95)"
    >
      <v-card color="transparent" elevation="0" style="background: transparent">
        <!-- Tombol tutup -->
        <v-btn
          icon="mdi-close"
          variant="flat"
          color="white"
          size="small"
          style="
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 9999;
            background: rgba(0, 0, 0, 0.5);
          "
          @click="isImageFullscreenVisible = false"
        />

        <v-carousel
          v-if="selectedProductStok?.galeri?.length"
          v-model="fullscreenImageIndex"
          height="100vh"
          hide-delimiter-background
          show-arrows="hover"
          style="background: transparent"
        >
          <v-carousel-item v-for="(img, i) in selectedProductStok.galeri" :key="i">
            <div
              class="d-flex align-center justify-center"
              style="height: 100vh; background: rgba(0, 0, 0, 0.9); cursor: zoom-out"
              @click="isImageFullscreenVisible = false"
            >
              <v-img :src="img.url" contain max-height="95vh" max-width="95vw" @click.stop />
            </div>
          </v-carousel-item>
        </v-carousel>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isEstimasiDialogVisible" max-width="500px" scrollable>
      <v-card class="rounded-xl overflow-hidden">
        <v-toolbar color="#D32F2F" density="compact" style="padding: 0 4px 0 0">
          <div class="d-flex align-center pl-3 flex-grow-1 overflow-hidden">
            <v-icon color="white" size="18" class="flex-shrink-0 mr-2"
              >mdi-calculator-variant-outline</v-icon
            >
            <span class="text-body-2 font-weight-bold text-white text-truncate">
              Kalkulator Harga Custom
            </span>
          </div>
          <v-btn
            icon="mdi-close"
            color="white"
            variant="text"
            size="small"
            @click="isEstimasiDialogVisible = false"
          ></v-btn>
        </v-toolbar>
        <v-card-text class="pa-0 bg-white" style="overflow-y: auto">
          <div class="pa-4 pa-sm-5">
            <p class="text-caption text-grey-darken-1 mb-4" style="line-height: 1.5">
              Hitung perkiraan biaya jasa cetak/bordir.<br />
              <span style="color: #d32f2f">*Belum termasuk harga kaos polos.</span>
            </p>

            <!-- Jenis Custom -->
            <div class="mb-4">
              <div class="text-caption font-weight-bold text-grey-darken-2 mb-2">Jenis Custom</div>
              <div class="jenis-grid">
                <button
                  v-for="opt in jenisCustomOptions"
                  :key="opt.value"
                  class="jenis-btn"
                  :class="{ 'jenis-btn--active': estimasiForm.jenis === opt.value }"
                  @click="estimasiForm.jenis = opt.value"
                >
                  <!-- SVG ikon per jenis (sama seperti sebelumnya) -->
                  <svg
                    v-if="opt.value === 'SD'"
                    width="28"
                    height="28"
                    viewBox="0 0 32 32"
                    fill="none"
                  >
                    <rect
                      x="4"
                      y="10"
                      width="24"
                      height="14"
                      rx="3"
                      :fill="estimasiForm.jenis === 'SD' ? '#FFEBEE' : '#f0f0f0'"
                      :stroke="estimasiForm.jenis === 'SD' ? '#D32F2F' : '#ccc'"
                      stroke-width="1.5"
                    />
                    <rect
                      x="10"
                      y="4"
                      width="12"
                      height="8"
                      rx="1.5"
                      :fill="estimasiForm.jenis === 'SD' ? '#FFCDD2' : '#e0e0e0'"
                    />
                    <rect
                      x="10"
                      y="18"
                      width="12"
                      height="8"
                      rx="1.5"
                      :fill="estimasiForm.jenis === 'SD' ? '#FFEBEE' : '#f5f5f5'"
                      :stroke="estimasiForm.jenis === 'SD' ? '#FFCDD2' : '#e8e8e8'"
                      stroke-width="1"
                    />
                    <circle
                      cx="23"
                      cy="14"
                      r="2"
                      :fill="estimasiForm.jenis === 'SD' ? '#D32F2F' : '#ccc'"
                    />
                  </svg>
                  <svg
                    v-else-if="opt.value === 'DP'"
                    width="28"
                    height="28"
                    viewBox="0 0 32 32"
                    fill="none"
                  >
                    <path
                      d="M16 4L19.5 11.5L28 12.5L22 18.5L23.5 27L16 23L8.5 27L10 18.5L4 12.5L12.5 11.5L16 4Z"
                      :fill="estimasiForm.jenis === 'DP' ? '#FFEBEE' : '#f0f0f0'"
                      :stroke="estimasiForm.jenis === 'DP' ? '#D32F2F' : '#ccc'"
                      stroke-width="1.5"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <svg
                    v-else-if="opt.value === 'BR'"
                    width="28"
                    height="28"
                    viewBox="0 0 32 32"
                    fill="none"
                  >
                    <path
                      d="M8 24C10 18 14 12 20 8"
                      :stroke="estimasiForm.jenis === 'BR' ? '#D32F2F' : '#ccc'"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                    <path
                      d="M12 24C13 20 16 15 22 11"
                      :stroke="estimasiForm.jenis === 'BR' ? '#FFCDD2' : '#e0e0e0'"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                    <circle
                      cx="22"
                      cy="7"
                      r="3"
                      :fill="estimasiForm.jenis === 'BR' ? '#D32F2F' : '#ccc'"
                    />
                  </svg>
                  <svg
                    v-else-if="opt.value === 'SB'"
                    width="28"
                    height="28"
                    viewBox="0 0 32 32"
                    fill="none"
                  >
                    <rect
                      x="5"
                      y="5"
                      width="22"
                      height="16"
                      rx="2"
                      :fill="estimasiForm.jenis === 'SB' ? '#FFEBEE' : '#f0f0f0'"
                      :stroke="estimasiForm.jenis === 'SB' ? '#D32F2F' : '#ccc'"
                      stroke-width="1.5"
                    />
                    <rect
                      x="9"
                      y="9"
                      width="14"
                      height="8"
                      rx="1"
                      :fill="estimasiForm.jenis === 'SB' ? '#FFCDD2' : '#e0e0e0'"
                    />
                    <path
                      d="M12 21L12 27M20 21L20 27M10 27L22 27"
                      :stroke="estimasiForm.jenis === 'SB' ? '#D32F2F' : '#ccc'"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                  </svg>
                  <span>{{ opt.title }}</span>
                </button>
              </div>
            </div>

            <!-- Jumlah -->
            <div class="mb-4">
              <div class="text-caption font-weight-bold text-grey-darken-2 mb-2">
                Jumlah Pesanan
              </div>
              <div class="qty-wrap">
                <button
                  class="qty-btn"
                  @click="estimasiForm.qty = Math.max(1, estimasiForm.qty - 1)"
                >
                  <v-icon size="18">mdi-minus</v-icon>
                </button>
                <input v-model.number="estimasiForm.qty" type="number" class="qty-input" min="1" />
                <span class="qty-unit">Pcs</span>
                <button class="qty-btn" @click="estimasiForm.qty++">
                  <v-icon size="18">mdi-plus</v-icon>
                </button>
              </div>
            </div>

            <!-- ===== TITIK CETAK MULTI ===== -->
            <div v-if="['SD', 'DP', 'BR'].includes(estimasiForm.jenis)">
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="text-caption font-weight-bold text-grey-darken-2">Titik Cetak</div>
                <button class="tambah-titik-btn" @click="tambahTitik">
                  <v-icon size="13">mdi-plus</v-icon>
                  Tambah Titik
                </button>
              </div>

              <div v-for="(titik, i) in estimasiForm.titiks" :key="i" class="titik-item">
                <!-- Header titik: nomor + nama + hapus -->
                <div class="d-flex align-center mb-2" style="gap: 6px">
                  <div class="titik-badge">{{ i + 1 }}</div>
                  <input
                    v-model="titik.nama"
                    class="titik-nama-input"
                    placeholder="Nama titik cetak..."
                  />
                  <button
                    v-if="estimasiForm.titiks.length > 1"
                    class="titik-hapus-btn"
                    @click="hapusTitik(i)"
                  >
                    <v-icon size="14">mdi-close</v-icon>
                  </button>
                </div>

                <!-- Dimensi -->
                <div class="d-flex align-center" style="gap: 6px">
                  <v-text-field
                    v-model.number="titik.panjang"
                    label="Panjang (cm)"
                    type="number"
                    variant="outlined"
                    density="compact"
                    hide-details
                    bg-color="white"
                    class="search-field-red"
                    style="flex: 1"
                  ></v-text-field>
                  <span class="text-h6 text-grey-lighten-1" style="font-weight: 300">×</span>
                  <v-text-field
                    v-model.number="titik.lebar"
                    label="Lebar (cm)"
                    type="number"
                    variant="outlined"
                    density="compact"
                    hide-details
                    bg-color="white"
                    class="search-field-red"
                    style="flex: 1"
                  ></v-text-field>
                  <div class="titik-luas">
                    <strong>{{ (titik.panjang || 0) * (titik.lebar || 0) }}</strong>
                    <span>cm²</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Ukuran Sablon Manual -->
            <div v-if="estimasiForm.jenis === 'SB'" class="mb-3">
              <div class="text-caption font-weight-bold text-grey-darken-2 mb-2">
                Ukuran Cetak per Titik
              </div>
              <div class="d-flex gap-2 mb-3">
                <button
                  v-for="sz in ['A3', 'A4', 'A5']"
                  :key="sz"
                  class="size-btn"
                  :class="{ 'size-btn--active': estimasiForm.sizeCetak === sz }"
                  @click="estimasiForm.sizeCetak = sz"
                >
                  {{ sz }}
                </button>
              </div>

              <!-- Titik untuk sablon manual -->
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="text-caption font-weight-bold text-grey-darken-2">Titik Cetak</div>
                <button class="tambah-titik-btn" @click="tambahTitik">
                  <v-icon size="13">mdi-plus</v-icon>
                  Tambah Titik
                </button>
              </div>
              <div
                v-for="(titik, i) in estimasiForm.titiks"
                :key="i"
                class="titik-item titik-item--simple d-flex align-center"
                style="gap: 8px"
              >
                <div class="titik-badge">{{ i + 1 }}</div>
                <input
                  v-model="titik.nama"
                  class="titik-nama-input"
                  placeholder="Nama titik..."
                  style="flex: 1"
                />
                <v-chip
                  size="x-small"
                  color="red-lighten-4"
                  style="color: #d32f2f; font-weight: 700"
                >
                  {{ estimasiForm.sizeCetak }}
                </v-chip>
                <button
                  v-if="estimasiForm.titiks.length > 1"
                  class="titik-hapus-btn"
                  @click="hapusTitik(i)"
                >
                  <v-icon size="14">mdi-close</v-icon>
                </button>
              </div>
            </div>
          </div>

          <!-- Result Section -->
          <div class="estimasi-result">
            <!-- Per-titik breakdown (hanya untuk DTF/Bordir) -->
            <div
              v-if="hasilEstimasi.perTitik.length > 1 && estimasiForm.jenis !== 'SB'"
              class="titik-breakdown"
            >
              <div v-for="(t, i) in hasilEstimasi.perTitik" :key="i" class="breakdown-row">
                <span class="breakdown-nama">{{ t.nama || `Titik ${i + 1}` }}</span>
                <span class="breakdown-detail">{{ t.luas }} cm² → {{ formatRupiah(t.harga) }}</span>
              </div>
              <div class="breakdown-divider"></div>
            </div>

            <div class="result-row">
              <div class="d-flex align-center" style="gap: 4px">
                <v-icon size="14" color="#D32F2F">mdi-tag-outline</v-icon>
                <span class="result-label">
                  Harga jasa / pcs
                  <span
                    v-if="estimasiForm.titiks.length > 1"
                    style="color: #d32f2f; font-weight: 700"
                  >
                    ({{ estimasiForm.titiks.length }} titik)
                  </span>
                </span>
              </div>
              <span class="result-value">{{ formatRupiah(hasilEstimasi.satuan) }}</span>
            </div>

            <div class="result-divider"></div>

            <div class="result-main">
              <span class="result-total-label">Total estimasi jasa</span>
              <span class="result-total-value">{{ formatRupiah(hasilEstimasi.total) }}</span>
              <span class="result-qty-note">
                untuk {{ estimasiForm.qty }} pcs · {{ estimasiForm.titiks.length }} titik cetak
              </span>
            </div>

            <p class="result-disclaimer">
              <v-icon size="12" color="#aaa" class="mr-1">mdi-information-outline</v-icon>
              Estimasi biaya jasa saja — harga final dikonfirmasi CS saat pemesanan.
            </p>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isBantuanDialogVisible" max-width="500px" scrollable>
      <v-card class="rounded-xl overflow-hidden" style="max-height: 90vh">
        <v-toolbar color="#D32F2F" density="compact" style="padding: 0 4px 0 0; flex-shrink: 0">
          <div class="d-flex align-center pl-3 flex-grow-1 overflow-hidden">
            <v-icon color="white" size="18" class="flex-shrink-0 mr-2">mdi-headset</v-icon>
            <span class="text-body-2 font-weight-bold text-white text-truncate">
              Pusat Bantuan Kaosan
            </span>
          </div>
          <v-btn
            icon="mdi-close"
            color="white"
            variant="text"
            size="small"
            @click="isBantuanDialogVisible = false"
          ></v-btn>
        </v-toolbar>

        <v-card-text class="pa-4 bg-grey-lighten-4" style="overflow-y: auto">
          <p class="text-caption text-grey-darken-2 mb-4">
            Butuh bantuan? Silakan hubungi Customer Service di toko Kaosan terdekat dari lokasi
            Anda.
          </p>

          <v-text-field
            v-model="searchBantuan"
            placeholder="Cari nama toko / kota..."
            variant="outlined"
            density="compact"
            hide-details
            bg-color="white"
            prepend-inner-icon="mdi-magnify"
            class="search-field-red mb-4"
          ></v-text-field>

          <div v-if="isLoadingBantuan" class="text-center pa-6">
            <v-progress-circular indeterminate color="#D32F2F" size="32"></v-progress-circular>
          </div>

          <div v-else class="d-flex flex-column" style="gap: 12px">
            <v-card
              v-for="store in filteredContacts"
              :key="store.kode"
              elevation="0"
              class="border rounded-lg pa-3 bg-white"
            >
              <div class="d-flex align-start">
                <v-avatar size="44" color="green-lighten-5" class="mr-3 flex-shrink-0 mt-1">
                  <v-icon color="green-darken-1" size="24">mdi-whatsapp</v-icon>
                </v-avatar>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="font-weight-bold text-subtitle-2 text-grey-darken-3 mb-1">
                    {{ store.nama }}
                  </div>

                  <div class="text-caption text-grey-darken-1 mb-1" style="line-height: 1.3">
                    <v-icon size="14" class="mr-1">mdi-map-marker</v-icon>
                    {{ store.alamat || "Alamat tidak tersedia" }}
                  </div>

                  <div
                    class="text-caption font-weight-bold text-green-darken-3 mb-2"
                    style="line-height: 1.3"
                  >
                    <v-icon size="14" class="mr-1">mdi-phone</v-icon>
                    {{ store.telepon || "Nomor tidak tersedia" }}
                  </div>

                  <v-btn
                    v-if="store.wa_link"
                    :href="store.wa_link"
                    target="_blank"
                    color="green-darken-1"
                    variant="flat"
                    size="small"
                    class="font-weight-bold text-none rounded-pill px-4"
                    prepend-icon="mdi-chat-processing-outline"
                  >
                    Hubungi Sekarang
                  </v-btn>
                  <v-chip v-else size="small" color="grey" variant="tonal">
                    Nomor tidak tersedia
                  </v-chip>
                </div>
              </div>
            </v-card>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.tracking-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.z-10 {
  z-index: 10;
}

.gap-2 {
  gap: 8px;
}
.gap-4 {
  gap: 16px;
}

/* [PERBAIKAN] Gradient disesuaikan dengan merah pekat #D32F2F dan #EF5350 */
.bg-brand {
  background: linear-gradient(135deg, #d32f2f 0%, #ef5350 100%);
}

.text-brand {
  color: #d32f2f !important;
}

.border-dashed {
  border-top-style: dashed !important;
}

/* HERO BANNER */
.hero-banner {
  height: 320px;
  background: linear-gradient(135deg, #d32f2f 0%, #ef5350 100%);
  position: relative;
}

/* Bikin kotak search naik menindih banner (Overlap) */
.search-container {
  margin-top: -60px;
  position: relative;
  z-index: 5;
  max-width: 900px;
}

/* [PERBAIKAN] Border saat field difokuskan ikut warna merah */
.search-field-red :deep(.v-field--focused) {
  border-color: #d32f2f !important;
}

/* --- KUPON PROMO STYLE --- */
.promo-card {
  transition: all 0.3s ease;
  border: 1px solid #ffebee !important; /* warna merah sangat muda */
}
.promo-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(211, 47, 47, 0.15) !important;
  border-color: #d32f2f !important;
}

/* Bikin efek bolong di pinggiran kupon */
.coupon-cutout {
  position: absolute;
  width: 20px;
  height: 20px;
  background-color: #f5f5f5; /* sama dengan warna background grey-lighten-4 */
  border-radius: 50%;
  bottom: 40px; /* Sejajar dengan garis putus-putus */
}
.coupon-cutout.left {
  left: -10px;
  border-right: 1px solid #ffebee;
}
.coupon-cutout.right {
  right: -10px;
  border-left: 1px solid #ffebee;
}

.card-hover {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}

.border-red {
  border-color: #d32f2f !important;
  background-color: #fff5f5 !important;
}

/* Tabel: tampil di desktop, sembunyi di mobile */
.stok-table-wrap {
  display: block;
}
.stok-card-list {
  display: none;
  flex-direction: column;
  gap: 8px;
}

/* ===== ESTIMASI HARGA DIALOG ===== */

/* Grid tombol jenis */
.jenis-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.jenis-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px 8px;
  border-radius: 10px;
  border: 1.5px solid #e8e8e8;
  background: #fafafa;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.2;
}
.jenis-btn:hover {
  border-color: #d32f2f;
  background: #fff5f5;
  color: #d32f2f;
}
.jenis-btn--active {
  border-color: #d32f2f !important;
  background: #fff5f5 !important;
  color: #d32f2f !important;
}

/* Qty stepper */
.qty-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1.5px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  width: fit-content;
}
.qty-btn {
  width: 40px;
  height: 40px;
  background: #f5f5f5;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  transition: background 0.1s;
}
.qty-btn:hover {
  background: #ffebee;
  color: #d32f2f;
}
.qty-input {
  width: 64px;
  height: 40px;
  border: none;
  border-left: 1px solid #e0e0e0;
  border-right: none;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: #333;
  outline: none;
  -moz-appearance: textfield;
  appearance: textfield;
}
.qty-input::-webkit-inner-spin-button,
.qty-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}
.qty-unit {
  padding: 0 10px;
  font-size: 13px;
  color: #999;
  border-left: 1px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
  height: 40px;
  line-height: 40px;
}

/* Tombol ukuran sablon */
.size-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1.5px solid #e0e0e0;
  background: #fafafa;
  font-size: 13px;
  font-weight: 700;
  color: #666;
  cursor: pointer;
  transition: all 0.12s;
}
.size-btn:hover {
  border-color: #d32f2f;
  color: #d32f2f;
  background: #fff5f5;
}
.size-btn--active {
  border-color: #d32f2f !important;
  background: #d32f2f !important;
  color: #fff !important;
}

/* Result section — light version */
.estimasi-result {
  background: #fff8f8;
  border-top: 2px dashed #f5c6c6;
  padding: 16px 20px 14px;
}
.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.result-label {
  font-size: 13px;
  color: #888;
}
.result-value {
  font-size: 14px;
  font-weight: 700;
  color: #555;
}
.result-divider {
  height: 1px;
  background: #f0d0d0;
  margin: 10px 0;
}
.result-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}
.result-total-label {
  font-size: 12px;
  color: #999;
}
.result-total-value {
  font-size: 30px;
  font-weight: 900;
  color: #d32f2f;
  line-height: 1;
  letter-spacing: -0.5px;
}
.result-qty-note {
  font-size: 11px;
  color: #bbb;
}
.result-disclaimer {
  font-size: 10px;
  color: #bbb;
  line-height: 1.5;
  border-top: 1px solid #f0e0e0;
  padding-top: 10px;
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

/* Tombol tambah titik */
.tambah-titik-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #fff5f5;
  border: 1.5px solid #ffcdd2;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  color: #d32f2f;
  cursor: pointer;
  transition: all 0.12s;
}
.tambah-titik-btn:hover {
  background: #ffebee;
  border-color: #d32f2f;
}

/* Titik cetak item card */
.titik-item {
  background: #fafafa;
  border: 1.5px solid #eee;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  transition: border-color 0.12s;
}
.titik-item:hover {
  border-color: #ffcdd2;
}
.titik-item--simple {
  padding: 8px 12px;
}

/* Badge nomor titik */
.titik-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #d32f2f;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Input nama titik */
.titik-nama-input {
  flex: 1;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: #333;
  outline: none;
  background: #fff;
  min-width: 0;
}
.titik-nama-input:focus {
  border-color: #d32f2f;
}

/* Tombol hapus titik */
.titik-hapus-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid #ffcdd2;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ef9a9a;
  flex-shrink: 0;
  transition: all 0.12s;
}
.titik-hapus-btn:hover {
  background: #ffebee;
  color: #d32f2f;
  border-color: #d32f2f;
}

/* Luas per titik */
.titik-luas {
  font-size: 10px;
  color: #aaa;
  text-align: center;
  min-width: 40px;
  line-height: 1.3;
}
.titik-luas strong {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #d32f2f;
}

/* Breakdown per titik di result */
.titik-breakdown {
  margin-bottom: 8px;
}
.breakdown-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 3px 0;
  border-bottom: 1px dotted #f0e0e0;
}
.breakdown-row:last-of-type {
  border-bottom: none;
}
.breakdown-nama {
  color: #777;
  font-weight: 600;
}
.breakdown-detail {
  color: #aaa;
}
.breakdown-divider {
  height: 1px;
  background: #f0d0d0;
  margin: 6px 0 8px;
}

/* === SHOPEE GRID STYLE === */
.shopee-card {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  overflow: hidden;
  cursor: pointer;
}

.shopee-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.15) !important; /* Glow merah tipis */
  border-color: #ffcdd2;
}

.product-img-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1; /* Bikin kotak sempurna (persegi) */
  overflow: hidden;
}

.texture-fill {
  width: 100%;
  height: 100%;
  opacity: 0.8; /* Agak transparan biar tidak terlalu mencolok */
}

/* Biar SVG dari fungsi getFabricTexture memenuhi kotak */
.texture-fill :deep(svg) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.size-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e0e0e0;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 900;
  color: #d32f2f;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stock-badge {
  position: absolute;
  top: 0;
  left: 0;
  padding: 2px 6px;
  border-bottom-right-radius: 8px;
  font-size: 9px;
  font-weight: 700;
  color: white;
  z-index: 2;
}

.product-name {
  font-size: 11px !important; /* Kunci ukuran font agar konsisten di HP & Desktop */
  line-height: 1.4 !important; /* Jarak antar baris */
  height: 31px !important; /* Pasti pas untuk 2 baris (11px * 1.4 * 2) */

  /* Logika pemotongan teks dengan titik-titik */
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;

  white-space: normal !important;
  word-break: break-word !important; /* Paksa potong kata yang kepanjangan */
}

/* ===== UNIQLO SIZE BOX (FILLED VERSION) ===== */
.uniqlo-size-box {
  min-width: 32px;
  height: 32px;
  padding: 0 4px;
  font-size: 11px;
  border-radius: 5px;
  overflow: hidden; /* ← INI yang kurang */
  position: relative;
}

.uniqlo-size-box:active {
  transform: scale(0.95);
}

.uniqlo-size-box:hover {
  opacity: 0.9;
}

/* Tersedia (Hijau Fill) */
.uniqlo-size-box.in-stock {
  background-color: #2e7d32;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(46, 125, 50, 0.3);
}

/* Menipis - Kurang dari 3 (Merah Fill) */
.uniqlo-size-box.low-stock {
  background-color: #d32f2f;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(211, 47, 47, 0.3);
}

/* Habis (Abu-abu & Garis) */
.uniqlo-size-box.out-of-stock {
  background-color: #f5f5f5;
  color: #9e9e9e;
  border: 1px solid #e0e0e0;
}

/* Garis diagonal pencoret untuk barang habis */
.strikethrough-line {
  position: absolute;
  top: 50%;
  left: -10%;
  width: 120%;
  height: 1.5px;
  background-color: #bdbdbd;
  transform: rotate(-45deg);
}

/* ===== FOOTER SOCIAL MEDIA ===== */
.social-btn {
  transition: all 0.2s ease-in-out;
}
.social-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* ===== FOOTER SOCIAL MEDIA ===== */
.grayscale {
  filter: grayscale(100%);
}

.social-btn {
  transition: all 0.2s ease-in-out;
}

/* Mengatur ukuran gambar PNG agar pas dengan icon MDI */
.social-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  filter: grayscale(100%) opacity(0.8); /* Bikin abu-abu dulu */
  transition: all 0.2s ease-in-out;
}

.social-icon {
  transition: all 0.2s ease-in-out;
}

/* Efek saat tombol di-hover */
.social-btn:hover {
  transform: translateY(-3px);
}

.social-btn:hover .social-img {
  filter: grayscale(0%) opacity(1); /* Warna asli gambar muncul */
  transform: scale(1.1);
}

.social-btn:hover .social-icon {
  color: #d32f2f !important; /* Warna merah untuk IG/FB */
  transform: scale(1.1);
}

.lengan-toggle {
  display: flex;
  gap: 6px;
}

.lengan-btn {
  padding: 4px 14px;
  border-radius: 20px;
  border: 1.5px solid #e0e0e0;
  background: #fff;
  font-size: 11px;
  font-weight: 600;
  color: #777;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}

.lengan-btn:hover {
  border-color: #d32f2f;
  color: #d32f2f;
  background: #fff5f5;
}

.lengan-btn--active {
  border-color: #d32f2f !important;
  background: #d32f2f !important;
  color: #fff !important;
}

.sentinel {
  height: 1px;
  width: 100%;
}

@media (max-width: 599px) {
  .stok-table-wrap {
    display: none;
  }
  .stok-card-list {
    display: flex;
  }
}

/* Responsif untuk layar HP */
@media (max-width: 600px) {
  .hero-banner {
    height: 250px;
  }
  .search-container {
    margin-top: -40px;
  }
}

/* ================= TRACKING HOME: TAMPILAN BARU ================= */
.t-page {
  --t-red: #b71c1c;
  --t-red-soft: #fdecea;
  --t-ink: #1f1a19;
  --t-muted: #6f6663;
  --t-line: #e9dfdb;
  --t-bg: #faf6f4;
  --t-serif: "Playfair Display", Georgia, "Times New Roman", serif;
  background: var(--t-bg) !important;
  color: var(--t-ink);
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}

/* ---------- Header ---------- */
.t-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--t-line);
}
.t-header-inner {
  max-width: 1040px;
  margin: 0 auto;
  height: 60px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.t-brand {
  display: inline-flex;
}
.t-nav {
  display: flex;
  align-items: center;
  gap: 24px;
}
.t-nav a {
  font-size: 13px;
  font-weight: 600;
  color: var(--t-ink);
  text-decoration: none;
  position: relative;
}
.t-nav a::after {
  content: "";
  position: absolute;
  left: 0;
  right: 100%;
  bottom: -4px;
  height: 2px;
  background: var(--t-red);
  transition: right 0.2s ease;
}
.t-nav a:hover::after {
  right: 0;
}

/* ---------- Hero ---------- */
.t-hero {
  background: var(--t-red);
  color: #fff;
  padding: 56px 20px 104px;
}
.t-hero-inner {
  max-width: 1040px;
  margin: 0 auto;
}
.t-eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.8;
  margin-bottom: 14px;
}
.t-hero-title {
  margin: 0;
  max-width: 16ch;
  font-family: var(--t-serif);
  font-weight: 600;
  font-size: clamp(34px, 6vw, 60px);
  line-height: 1.05;
  letter-spacing: -0.015em;
}
.t-hero-title em {
  font-style: italic;
  font-weight: 500;
}
.t-hero-sub {
  margin: 16px 0 0;
  max-width: 46ch;
  font-size: 15px;
  line-height: 1.6;
  opacity: 0.9;
}

/* ---------- Main ---------- */
.t-main {
  max-width: 1040px;
  margin: -64px auto 0;
  padding: 0 20px 56px;
  position: relative;
  z-index: 2;
}

/* ---------- Panel pencarian ---------- */
.t-search {
  max-width: 760px;
  margin: 0 auto 56px;
  padding: 20px;
  background: #fff;
  border: 1px solid var(--t-line);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(60, 20, 15, 0.1);
}
.t-search-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.t-search-input {
  flex: 1;
}
.t-search-btn {
  flex-shrink: 0;
  letter-spacing: 0;
}
.t-steps {
  list-style: none;
  margin: 18px 0 0;
  padding: 16px 0 0;
  border-top: 1px dashed var(--t-line);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.t-steps li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 12px;
  line-height: 1.45;
  color: var(--t-muted);
}
.t-steps li span {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: var(--t-red);
  background: var(--t-red-soft);
}

.t-found {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--t-line);
}
.t-found-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.t-found-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--t-muted);
}
.t-found-name {
  font-family: var(--t-serif);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}
.t-found-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #2e7d32;
  background: #e8f5e9;
}

/* ---------- Section ---------- */
.t-section {
  margin-bottom: 96px;
}
.t-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 12px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--t-line);
}
.t-section-title {
  margin: 0;
  font-family: var(--t-serif);
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.t-section-note {
  font-size: 12px;
  color: var(--t-muted);
}

/* ---------- Promo ---------- */
.t-coupon {
  --cut: 9px;
  position: relative;
  display: flex;
  min-height: 170px;
  background: #fff;
  border-radius: 12px;
  filter: drop-shadow(0 6px 14px rgba(60, 20, 15, 0.1));
  transition: transform 0.25s ease, filter 0.25s ease;
}
.t-coupon:hover {
  transform: translateY(-3px) rotate(-0.4deg);
  filter: drop-shadow(0 12px 22px rgba(60, 20, 15, 0.16));
}

/* Panel nilai (kiri) */
/* Satu kolom lebih lega: kupon jadi lebih lebar, tidak berdesakan */
.t-promo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 20px;
}

/* Panel nilai: lebar tetap, isi tidak boleh pecah */
.t-coupon-value {
  flex: 0 0 132px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 16px 8px;
  color: #fff;
  text-align: center;
  background: var(--t-red);
  border-radius: 12px 0 0 12px;
  -webkit-mask: radial-gradient(circle var(--cut) at 100% 0, transparent 98%, #000) top / 100% 51%
      no-repeat,
    radial-gradient(circle var(--cut) at 100% 100%, transparent 98%, #000) bottom / 100% 51%
      no-repeat;
  mask: radial-gradient(circle var(--cut) at 100% 0, transparent 98%, #000) top / 100% 51% no-repeat,
    radial-gradient(circle var(--cut) at 100% 100%, transparent 98%, #000) bottom / 100% 51%
      no-repeat;
}
.t-coupon-label {
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  opacity: 0.85;
}
.t-coupon-prefix {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  opacity: 0.9;
}
.t-coupon-big {
  font-family: var(--t-serif);
  font-size: 30px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap; /* jangan pernah pecah */
  font-variant-numeric: lining-nums;
}

.t-coupon-body {
  padding: 18px 20px 16px 22px;
}
.t-coupon-title {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.005em;
}
.t-coupon-desc {
  font-size: 12.5px;
  line-height: 1.55;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}

/* Footer dua sisi, tidak menumpuk */
.t-coupon-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px dashed #eadfda;
}
.t-coupon-days {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--t-muted);
  white-space: nowrap;
}
.t-coupon-btn {
  flex-shrink: 0;
  white-space: nowrap;
}

/* Nomor besar yang sangat panjang mengecil otomatis */
@media (max-width: 420px) {
  .t-promo-grid {
    grid-template-columns: 1fr;
  }
  .t-coupon-value {
    flex-basis: 112px;
  }
  .t-coupon-big {
    font-size: 26px;
  }
}

/* Detail (kanan) */
.t-coupon-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 18px 14px 20px;
  border-radius: 0 12px 12px 0;
  background: radial-gradient(circle var(--cut) at 0 0, transparent 98%, #fff) top / 100% 51%
      no-repeat,
    radial-gradient(circle var(--cut) at 0 100%, transparent 98%, #fff) bottom / 100% 51% no-repeat;
  /* garis sobekan putus-putus */
  border-left: 2px dashed #e4d6d1;
}
.t-coupon-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
}
.t-coupon-min {
  margin-top: 6px;
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #7a4b00;
  background: #fff1d6;
}
.t-coupon-desc {
  flex: 1;
  margin: 8px 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--t-muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.t-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2e9e5b;
}
.t-coupon-days.t-urgent {
  color: var(--t-red);
}
.t-coupon-days.t-urgent .t-dot {
  background: var(--t-red);
  animation: t-pulse 1.6s ease-in-out infinite;
}
@keyframes t-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(183, 28, 28, 0.5);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(183, 28, 28, 0);
  }
}
.t-coupon-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 800;
  color: var(--t-red);
  cursor: pointer;
}
.t-coupon-btn .v-icon {
  transition: transform 0.18s ease;
}
.t-coupon-btn:hover .v-icon {
  transform: translateX(4px);
}

@media (max-width: 599px) {
  .t-promo-grid {
    grid-template-columns: 1fr;
  }
  .t-coupon-value {
    flex-basis: 34%;
  }
}

/* ---------- Layanan ---------- */
.t-service-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.t-service {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  text-align: left;
  background: #fff;
  border: 1px solid var(--t-line);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.18s ease;
}
.t-service:hover,
.t-service:focus-visible {
  border-color: var(--t-red);
  transform: translateY(-2px);
  outline: none;
}
.t-service-icon {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--t-red);
  background: var(--t-red-soft);
}
.t-service-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.t-service-name {
  font-size: 14px;
  font-weight: 700;
}
.t-service-desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--t-muted);
}
.t-beta {
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 9.5px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--t-red);
  background: var(--t-red-soft);
}
.t-service-arrow {
  color: #b9aca7;
  transition: transform 0.18s ease, color 0.18s ease;
}
.t-service:hover .t-service-arrow {
  color: var(--t-red);
  transform: translateX(3px);
}

/* ---------- Footer ---------- */
.t-footer {
  margin-top: auto;
  background: #fff;
  border-top: 1px solid var(--t-line);
}
.t-footer-inner {
  max-width: 1040px;
  margin: 0 auto;
  padding: 28px 20px;
}
.t-complaint {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--t-line);
}
.t-complaint-title {
  font-size: 13px;
  font-weight: 700;
}
.t-complaint-text {
  margin-top: 2px;
  font-size: 13px;
  color: var(--t-muted);
}
.t-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.t-copy {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--t-muted);
}
.t-social {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ---------- Mobile ---------- */
@media (max-width: 599px) {
  .t-nav a:not(:last-child) {
    display: none;
  }
  .t-hero {
    padding: 36px 16px 92px;
  }
  .t-main {
    padding: 0 14px 40px;
  }
  .t-search {
    padding: 14px;
    margin-bottom: 40px;
  }
  .t-search-row {
    flex-direction: column;
  }
  .t-search-btn {
    width: 100%;
  }
  .t-steps {
    grid-template-columns: 1fr;
  }
  .t-service-grid {
    grid-template-columns: 1fr;
  }
}
@media (min-width: 900px) {
  .t-service-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .t-service {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 20px;
  }
  .t-service-arrow {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .t-promo,
  .t-service,
  .t-service-arrow,
  .t-nav a::after {
    transition: none;
  }
}

.reveal {
  opacity: 0;
  transform: translateY(36px) scale(0.97);
  transition: opacity 0.7s ease var(--d, 0ms),
    transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0ms);
  will-change: opacity, transform;
}
.reveal--in {
  opacity: 1;
  transform: none;
}

/* Hero: muncul bertahap saat halaman dibuka */
.t-eyebrow,
.t-hero-sub {
  opacity: 0;
  animation: t-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.t-line {
  display: inline-block;
  margin-right: 0.28em;
  opacity: 0;
  animation: t-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: calc(0.15s + var(--n, 0) * 90ms);
}
.t-line:last-child {
  margin-right: 0;
}
.t-eyebrow {
  animation-delay: 0.05s;
}
.t-hero-title {
  animation-delay: 0.15s;
}
.t-hero-sub {
  animation-delay: 0.3s;
}
.t-search {
  animation: t-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.4s both;
}
@keyframes t-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.t-search:focus-within {
  box-shadow: 0 16px 40px rgba(183, 28, 28, 0.16);
  transition: box-shadow 0.25s ease;
}

@media (prefers-reduced-motion: reduce) {
  .t-eyebrow,
  .t-hero-title,
  .t-hero-sub,
  .t-search {
    animation: none;
    opacity: 1;
  }
  .t-line {
    animation: none;
    opacity: 1;
  }
  .t-coupon-days.t-urgent .t-dot {
    animation: none;
  }
}

.t-coupon.reveal--in {
  transition: transform 0.25s ease, filter 0.25s ease;
}
.t-service.reveal--in {
  transition: border-color 0.18s ease, transform 0.18s ease;
}
.t-search {
  position: relative;
  overflow: hidden;
}
.t-search--loading::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  height: 3px;
  width: 40%;
  background: var(--t-red);
  animation: t-bar 1s ease-in-out infinite;
}
@keyframes t-bar {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

.t-found-name,
.t-found-label {
  animation: t-slide-left 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
}
.t-found-badge {
  animation: t-slide-left 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.28s both;
}
@keyframes t-slide-left {
  from {
    opacity: 0;
    transform: translateX(-18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>

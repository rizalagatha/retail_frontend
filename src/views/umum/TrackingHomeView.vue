<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import { formatRupiah } from "@/utils/formatRupiah";
import { useToast } from "vue-toastification";
import CustomPagination from "@/components/CustomPagination.vue";
import { getFabricTexture } from "@/utils/fabricTextures";

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
  pro_jenis: string;
  pro_judul: string;
  pro_diskon: number;
  pro_disrp: number;
  pro_rpvoucher: number;
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
  jenis_kain_final: string;
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

const stokPage = ref(1);
const stokPerPage = ref(10);

const isInternalNetwork = ref(false);

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

  normalizedStokResults.value.forEach((item: StokItem) => {
    if (!map.has(item.kode)) {
      // [FIX] Parse galeri jika string, atau gunakan array kosong jika null
      let galeriArray = [];
      try {
        galeriArray = item.galeri
          ? typeof item.galeri === "string"
            ? JSON.parse(item.galeri)
            : item.galeri
          : [];
      } catch {
        galeriArray = [];
      }

      map.set(item.kode, {
        kode: item.kode,
        nama: item.nama,
        harga: item.harga,
        jenis_kain_final: item.jenis_kain_final || "LAIN-LAIN",
        total_terjual: 0,
        total_stok: 0,
        gambar_url: item.gambar_url || null,
        urutan: item.urutan || 9999,
        galeri: galeriArray, // <--- Simpan galeri
        variants: [],
      });
    }
    const group = map.get(item.kode)!;
    group.total_stok += item.stok;
    group.total_terjual += Number(item.total_terjual || 0);
    group.variants.push(item);
  });

  // Sort varian di dalam tiap grup berdasarkan ukuran
  const result = Array.from(map.values());
  result.forEach((group) => {
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

  // Filter Pencarian
  if (searchStokKeyword.value) {
    const q = searchStokKeyword.value.toLowerCase();
    data = data.filter(
      (item) => item.nama.toLowerCase().includes(q) || item.kode.toLowerCase().includes(q)
    );
  }

  // Urutkan berdasarkan total terjual terbanyak, lalu A-Z
  data.sort((a, b) => {
    // 1. Prioritaskan berdasarkan urutan tampil (1, 2, 3... dst)
    if (a.urutan !== b.urutan) {
      return a.urutan - b.urutan;
    }
    // 2. Jika urutan sama (misal sama-sama 9999), urutkan berdasarkan yang paling laku
    if (b.total_terjual !== a.total_terjual) {
      return b.total_terjual - a.total_terjual;
    }
    // 3. Terakhir berdasarkan abjad
    return a.nama.localeCompare(b.nama);
  });

  return data;
});

const stokPaginated = computed(() =>
  filteredGroupedStok.value.slice(
    (stokPage.value - 1) * stokPerPage.value,
    stokPage.value * stokPerPage.value
  )
);

const isStokDetailDialogVisible = ref(false);
const selectedProductStok = ref<GroupedStokItem | null>(null);

const openStokDetail = (product: GroupedStokItem) => {
  selectedProductStok.value = product;
  isStokDetailDialogVisible.value = true;
};

watch(searchStokKeyword, () => {
  stokPage.value = 1;
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
    const response = await api.get(`/so/public/active-promos?cabang=K01`);
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

const openCekStok = () => {
  stokResults.value = [];
  searchStokKeyword.value = "";
  selectedStore.value = null;
  cekStokPhase.value = "select-store";
  isCekStokDialogVisible.value = true;
};

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
  <div class="tracking-layout bg-grey-lighten-4">
    <header
      class="bg-white elevation-2 px-4 px-md-10 py-3 d-flex align-center position-sticky w-100"
      style="top: 0; z-index: 100"
    >
      <a
        href="https://kaosanofficial.com"
        target="_blank"
        class="d-flex align-center text-decoration-none"
      >
        <img :src="LogoKaosan" height="40" alt="Logo Kaosan" class="cursor-pointer" />
      </a>
      <v-spacer></v-spacer>
      <div class="d-none d-sm-flex gap-4 text-body-2 font-weight-medium text-grey-darken-3">
        <a
          href="https://kaosanofficial.com"
          target="_blank"
          class="text-decoration-none text-grey-darken-3"
          >Beranda</a
        >
        <a
          href="https://kaosanofficial.com/layanan"
          target="_blank"
          class="text-decoration-none text-grey-darken-3"
          >Layanan</a
        >
        <v-btn
          v-if="isInternalNetwork"
          color="#D32F2F"
          variant="flat"
          size="small"
          class="text-white font-weight-bold text-none px-4 rounded-pill ml-2"
          prepend-icon="mdi-login-variant"
          @click="router.push({ path: '/login', query: { redirect: '/admin-katalog' } })"
        >
          Staff Login
        </v-btn>
      </div>
    </header>

    <div class="hero-banner d-flex flex-column align-center justify-center text-center px-4">
      <h1
        class="text-h4 text-md-h3 font-weight-black text-white mb-2"
        style="text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2)"
      >
        Lacak Pesanan Kaosan
      </h1>
      <p class="text-subtitle-1 text-md-h6 text-white opacity-90 font-weight-regular">
        Pantau status produksi dan pengiriman pesanan Anda dengan mudah
      </p>
    </div>

    <v-container class="search-container mb-10">
      <v-card class="rounded-lg elevation-4 pa-2 pa-sm-4 bg-white mb-8" max-width="800" mx-auto>
        <div class="d-flex flex-column flex-sm-row gap-2 align-start">
          <v-text-field
            v-model="searchInput"
            placeholder="Masukkan Nomor Resi Pesanan (Contoh: KSNK...)"
            variant="outlined"
            color="#D32F2F"
            bg-color="white"
            hide-details="auto"
            class="flex-grow-1 w-100 search-field-red"
            density="comfortable"
            prepend-inner-icon="mdi-magnify"
            :error-messages="errorMessage"
            @keyup.enter="cariPesanan"
          ></v-text-field>

          <v-btn
            color="#D32F2F"
            height="48"
            class="text-white px-8 font-weight-bold text-subtitle-1 w-100 w-sm-auto mt-2 mt-sm-0"
            :loading="isLoading"
            @click="cariPesanan"
          >
            Lacak
          </v-btn>
        </div>

        <v-expand-transition>
          <div v-if="isFound && soData" class="mt-6 border-t pt-6 px-2">
            <div class="d-flex justify-space-between align-center mb-4 flex-wrap gap-2">
              <div>
                <div class="text-caption text-grey-darken-1">Pelanggan</div>
                <div class="text-h6 font-weight-bold text-grey-darken-3" style="line-height: 1.2">
                  {{ soData.penerima }}
                </div>
              </div>
              <v-chip color="success" variant="flat" class="font-weight-bold">
                <v-icon start size="small">mdi-check-circle</v-icon>
                Pesanan Ditemukan
              </v-chip>
            </div>

            <p class="text-subtitle-2 font-weight-bold text-grey-darken-2 mb-2">
              Pilih Barang yang Ingin Dilacak Spesifik:
            </p>

            <v-select
              v-model="selectedItem"
              :items="soData.items"
              item-title="title"
              item-value="value"
              placeholder="-- Pilih Barang --"
              variant="outlined"
              density="comfortable"
              color="#D32F2F"
              hide-details="auto"
              class="mb-4 search-field-red"
            ></v-select>

            <v-btn
              block
              size="large"
              color="#D32F2F"
              class="font-weight-bold text-white mt-2"
              :disabled="!selectedItem"
              @click="lanjutLacak"
            >
              Lihat Rincian Proses
              <v-icon right class="ml-2">mdi-arrow-right</v-icon>
            </v-btn>
          </div>
        </v-expand-transition>
      </v-card>

      <v-expand-transition>
        <div
          v-if="!isLoadingPromo && activePromos.length > 0"
          class="promo-section mb-10"
          style="max-width: 900px; margin: 0 auto"
        >
          <div class="d-flex align-center mb-4 px-2">
            <v-icon color="#D32F2F" size="28" class="mr-2">mdi-ticket-percent</v-icon>
            <h2 class="text-h6 font-weight-bold text-grey-darken-3 mb-0">
              Promo Spesial Buat Kamu!
            </h2>
          </div>

          <v-row>
            <v-col cols="12" sm="6" md="4" v-for="(promo, index) in activePromos" :key="index">
              <v-card
                elevation="2"
                class="promo-card rounded-xl h-100 d-flex flex-column position-relative overflow-hidden bg-white"
              >
                <div
                  class="bg-brand py-2 px-4 text-white text-caption font-weight-bold text-uppercase d-flex justify-space-between"
                >
                  <span>{{ promo.pro_jenis === "VOUCHER" ? "Voucher" : "Diskon Spesial" }}</span>
                  <v-icon size="small" color="white">mdi-star-four-points</v-icon>
                </div>

                <v-card-text class="pa-4 flex-grow-1 d-flex flex-column">
                  <div
                    class="text-subtitle-1 font-weight-black text-grey-darken-4 mb-1"
                    style="line-height: 1.2"
                  >
                    {{ promo.pro_judul }}
                  </div>

                  <div class="text-h5 font-weight-black text-brand mb-2">
                    <template v-if="promo.pro_diskon > 0">
                      Diskon {{ promo.pro_diskon }}%
                    </template>
                    <template v-else-if="promo.pro_disrp > 0">
                      Potongan {{ formatRupiah(promo.pro_disrp) }}
                    </template>
                    <template v-else-if="promo.pro_rpvoucher > 0">
                      Voucher {{ formatRupiah(promo.pro_rpvoucher) }}
                    </template>
                    <template v-else-if="promo.pro_totalqty > 0">
                      Beli {{ promo.pro_totalqty }} Lebih Hemat
                    </template>
                    <template v-else> Harga Spesial </template>
                  </div>

                  <div class="text-caption text-grey-darken-1 mb-3">
                    {{ promo.pro_keterangan || "Berlaku untuk pemesanan di Kaosan." }}
                  </div>

                  <v-spacer></v-spacer>

                  <div
                    class="mt-auto pt-3 border-t border-dashed d-flex align-center justify-space-between"
                  >
                    <div class="d-flex flex-column">
                      <span class="text-grey-darken-1" style="font-size: 0.65rem"
                        >Berlaku hingga:</span
                      >
                      <span class="text-caption font-weight-bold text-grey-darken-3">{{
                        promo.pro_tanggal2.split("T")[0]
                      }}</span>
                    </div>
                    <v-btn
                      size="small"
                      color="#D32F2F"
                      variant="flat"
                      class="text-white font-weight-bold text-none rounded-pill px-5"
                      @click="klaimPromo(promo)"
                    >
                      Klaim
                    </v-btn>
                  </div>
                </v-card-text>

                <div class="coupon-cutout left"></div>
                <div class="coupon-cutout right"></div>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-expand-transition>

      <v-row justify="center" style="max-width: 900px; margin: 0 auto">
        <v-col cols="12" sm="4">
          <v-card
            elevation="0"
            class="border rounded-lg pa-4 d-flex align-center h-100 bg-white card-hover"
            @click="openCekStok"
          >
            <v-icon size="40" color="#D32F2F" class="mr-4">mdi-store-search-outline</v-icon>
            <div>
              <div class="font-weight-bold text-subtitle-2">Cek Stok Store</div>
              <div class="text-caption text-grey-darken-1">Lihat ketersediaan barang ready</div>
            </div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card
            elevation="0"
            class="border rounded-lg pa-4 d-flex align-center h-100 bg-white card-hover"
            @click="openEstimasi"
          >
            <v-icon size="40" color="#D32F2F" class="mr-4">mdi-calculator-variant-outline</v-icon>
            <div>
              <div class="font-weight-bold text-subtitle-2">Estimasi Harga Custom</div>
              <div class="text-caption text-grey-darken-1">Hitung biaya sablon & bordir</div>
            </div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card
            elevation="0"
            class="border rounded-lg pa-4 d-flex align-center h-100 bg-white card-hover"
            @click="openBantuan"
          >
            <v-icon size="40" color="#D32F2F" class="mr-4">mdi-help-circle-outline</v-icon>
            <div>
              <div class="font-weight-bold text-subtitle-2">Pusat Bantuan</div>
              <div class="text-caption text-grey-darken-1">Hubungi CS Kaosan</div>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <footer class="bg-white border-t mt-auto py-8">
      <v-container class="px-4 px-md-10">
        <v-expand-transition>
          <div v-if="isFound && soData?.kontakKomplain" class="mb-8">
            <div
              class="text-caption font-weight-bold text-grey-darken-3 mb-2"
              style="font-size: 13px !important"
            >
              Hubungi Kami Untuk Layanan Pengaduan Konsumen KAOSAN:
            </div>
            <div class="text-caption text-grey-darken-2" style="font-size: 13px !important">
              {{ soData.kontakKomplain }} (WhatsApp)
            </div>

            <div
              class="text-caption font-weight-bold text-grey-darken-3 mb-2 mt-4"
              style="font-size: 13px !important"
            >
              Layanan Pengaduan Konsumen, Direktorat Jenderal Perlindungan Konsumen dan Tertib
              Niaga, Kementerian Perdagangan Republik Indonesia:
            </div>
            <div class="text-caption text-grey-darken-2" style="font-size: 13px !important">
              0853 111 1010 (WhatsApp)
            </div>

            <v-divider class="my-6"></v-divider>
          </div>
        </v-expand-transition>

        <div class="d-flex flex-column flex-md-row align-center justify-space-between">
          <div class="text-caption text-grey-darken-1 mb-4 mb-md-0 d-flex align-center">
            <img
              :src="LogoKaosan"
              height="20"
              alt="Logo Kaosan"
              class="mr-3 opacity-60 grayscale"
            />
            Hak Cipta &copy; {{ new Date().getFullYear() }} KAOSAN. Semua hak dilindungi
            undang-undang.
          </div>

          <div class="d-flex align-center gap-2">
            <v-btn
              icon
              variant="text"
              color="grey-darken-4"
              size="small"
              href="https://instagram.com/kaosan.official"
              target="_blank"
              class="social-btn"
            >
              <v-icon size="24" class="social-icon">mdi-instagram</v-icon>
            </v-btn>

            <v-btn
              icon
              variant="text"
              color="grey-darken-4"
              size="small"
              href="https://www.facebook.com/kaosanofficiall"
              target="_blank"
              class="social-btn"
            >
              <v-icon size="24" class="social-icon">mdi-facebook</v-icon>
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
      </v-container>
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
                          Rp {{ formatRupiah(item.harga) }}
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

            <CustomPagination
              v-model="stokPage"
              v-model:per-page="stokPerPage"
              :total="filteredGroupedStok.length"
            />
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
              height="280"
              hide-delimiter-background
              show-arrows="hover"
              class="rounded-lg mb-4 bg-grey-lighten-4 border"
            >
              <v-carousel-item v-for="(img, i) in selectedProductStok.galeri" :key="i">
                <v-img :src="img.url" cover height="100%">
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
              style="height: 280px"
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
  position: relative;
  min-width: 48px;
  height: 48px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  border-radius: 6px;
  user-select: none;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
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
</style>

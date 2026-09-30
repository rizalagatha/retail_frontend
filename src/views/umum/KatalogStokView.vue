<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useDisplay } from "vuetify";
import api from "@/services/api";
import { getFabricTexture } from "@/utils/fabricTextures";
import LogoKaosan from "@/assets/logo.png";
import { isKiosk } from "@/composables/useKiosk";

// --- Tipe Data ---
interface StoreItem {
  kode: string;
  nama: string;
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
  gambar_url?: string | null;
  urutan?: number;
  galeri?: { url: string; index: number }[] | string | null;
}

interface GroupedStokItem {
  kode: string;
  nama: string;
  hargaMin: number;
  hargaMax: number;
  jenis_kain_final: string;
  lengan: string;
  total_terjual: number;
  total_stok: number;
  gambar_url: string | null;
  urutan: number;
  galeri: { url: string; index: number }[];
  variants: StokItem[];
}

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { xs } = useDisplay();

const ROUTE_NAME = "Katalog Stok";
const homePath = computed(() => (isKiosk.value ? "/kiosk" : "/"));
const CACHE_TTL_MS = 5 * 60 * 1000;
const LOW_STOCK_TOTAL = 5; // total stok semua ukuran <= ini dianggap "sisa sedikit"

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(n) || 0)}`;

// --- Fase dari URL ---
const tokoParam = computed(() => (route.params.toko as string) || "");
const kategoriParam = computed(() => (route.params.kategori as string) || "");
const phase = computed<"store" | "category" | "products">(() =>
  !tokoParam.value ? "store" : !kategoriParam.value ? "category" : "products"
);
const selectedKategori = computed(() =>
  kategoriParam.value === "semua" ? "ALL" : kategoriParam.value
);

// --- Daftar toko ---
const stores = ref<StoreItem[]>([]);
const isLoadingStores = ref(true);
const currentStore = computed(() => stores.value.find((s) => s.kode === tokoParam.value) || null);

const fetchStores = async () => {
  try {
    const { data } = await api.get("/so/public/stores");
    stores.value = data;
  } catch {
    toast.error("Gagal memuat daftar toko.");
  } finally {
    isLoadingStores.value = false;
  }
};

// --- Data stok (di-cache per toko) ---
const stokCache = new Map<string, { items: StokItem[]; buster: string; at: number }>();
const stokResults = ref<StokItem[]>([]);
const imgBuster = ref("");
const isLoadingStok = ref(false);
const stokError = ref(false);

const loadStok = async (kode: string, force = false) => {
  const cached = stokCache.get(kode);
  if (cached && !force && Date.now() - cached.at < CACHE_TTL_MS) {
    stokResults.value = cached.items;
    imgBuster.value = cached.buster;
    stokError.value = false;
    return;
  }

  isLoadingStok.value = true;
  stokError.value = false;
  stokResults.value = [];
  try {
    const { data } = await api.get("/so/public/cek-stok", { params: { cabang: kode, q: "" } });
    const buster = `?t=${Date.now()}`;
    stokCache.set(kode, { items: data, buster, at: Date.now() });
    if (tokoParam.value !== kode) return; // user sudah pindah toko saat menunggu
    stokResults.value = data;
    imgBuster.value = buster;
  } catch {
    if (tokoParam.value === kode) stokError.value = true;
  } finally {
    if (tokoParam.value === kode) isLoadingStok.value = false;
  }
};

// --- Pengelompokan per kode barang ---
const getSizeRank = (size: string) => {
  const s = (size || "").toUpperCase().trim();
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
  const n = parseInt(s);
  return isNaN(n) ? 999 : 20 + n;
};

const masterGrouped = computed<GroupedStokItem[]>(() => {
  const map = new Map<string, GroupedStokItem>();
  const bust = imgBuster.value;

  stokResults.value.forEach((item) => {
    if (!map.has(item.kode)) {
      let galeri: { url: string; index: number }[] = [];
      try {
        const raw = item.galeri
          ? typeof item.galeri === "string"
            ? JSON.parse(item.galeri)
            : item.galeri
          : [];
        galeri = raw.map((g: { url: string; index: number }) => ({
          ...g,
          url: g.url ? `${g.url}${bust}` : g.url,
        }));
      } catch {
        galeri = [];
      }

      let kategori = (item.jenis_kain || "").trim() || "LAIN-LAIN";
      const namaUp = (item.nama || "").toUpperCase();
      const kaosUp = (item.jenis_kaos || "").toUpperCase();
      if (namaUp.includes("ANAK") || kaosUp.includes("ANAK") || namaUp.includes("KIDS")) {
        kategori = "KAOS ANAK";
      } else if (namaUp.includes("TUNIK") || kaosUp.includes("TUNIK")) {
        kategori = "TUNIK";
      }

      const harga = Number(item.harga) || 0;
      map.set(item.kode, {
        kode: item.kode,
        nama: item.nama,
        hargaMin: harga > 0 ? harga : Number.MAX_SAFE_INTEGER,
        hargaMax: harga,
        jenis_kain_final: kategori,
        lengan: (item.lengan || "").toUpperCase(),
        total_terjual: 0,
        total_stok: 0,
        gambar_url: item.gambar_url ? `${item.gambar_url}${bust}` : null,
        urutan: item.urutan || 9999,
        galeri,
        variants: [],
      });
    }

    const g = map.get(item.kode)!;
    const harga = Number(item.harga) || 0;
    g.total_stok += Number(item.stok) || 0;
    g.total_terjual += Number(item.total_terjual) || 0;
    if (harga > g.hargaMax) g.hargaMax = harga;
    if (harga > 0 && harga < g.hargaMin) g.hargaMin = harga;
    g.variants.push(item);
  });

  const result = Array.from(map.values());
  result.forEach((g) => {
    if (g.hargaMin === Number.MAX_SAFE_INTEGER) g.hargaMin = 0;
    g.variants.sort((a, b) => getSizeRank(a.ukuran) - getSizeRank(b.ukuran));
  });
  return result;
});

const kategoriList = computed(() => {
  const count: Record<string, number> = {};
  masterGrouped.value.forEach((i) => {
    count[i.jenis_kain_final] = (count[i.jenis_kain_final] || 0) + 1;
  });
  return Object.keys(count)
    .sort((a, b) => {
      if (a === "LAIN-LAIN") return 1;
      if (b === "LAIN-LAIN") return -1;
      return count[b] - count[a];
    })
    .map((nama) => ({ nama, jumlah: count[nama] }));
});

// --- Filter (lengan & pencarian disimpan di query URL) ---
const lengan = computed(() => String(route.query.lengan || "SEMUA").toUpperCase());
const searchTerm = computed(() => String(route.query.q || ""));
const searchInput = ref(String(route.query.q || ""));

const lenganOptions = [
  { label: "Semua", value: "SEMUA" },
  { label: "Pendek", value: "PENDEK" },
  { label: "Panjang", value: "PANJANG" },
];

const setLengan = (value: string) => {
  router.replace({ query: { ...route.query, lengan: value === "SEMUA" ? undefined : value } });
};

let searchTimer: ReturnType<typeof setTimeout>;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    router.replace({ query: { ...route.query, q: v.trim() || undefined } });
  }, 300);
});

const filteredProducts = computed(() => {
  let data = [...masterGrouped.value];

  if (selectedKategori.value !== "ALL") {
    data = data.filter((i) => i.jenis_kain_final === selectedKategori.value);
  }
  if (lengan.value !== "SEMUA") {
    data = data.filter((i) => i.lengan.includes(lengan.value));
  }
  if (searchTerm.value) {
    const q = searchTerm.value.toLowerCase();
    data = data.filter((i) => i.nama.toLowerCase().includes(q) || i.kode.toLowerCase().includes(q));
  }

  data.sort((a, b) => {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    if (b.total_terjual !== a.total_terjual) return b.total_terjual - a.total_terjual;
    return a.nama.localeCompare(b.nama);
  });
  return data;
});

// --- Load more (infinite scroll) ---
const displayCount = ref(20);
const visibleProducts = computed(() => filteredProducts.value.slice(0, displayCount.value));
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const setupObserver = () => {
  observer?.disconnect();
  if (!sentinel.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && displayCount.value < filteredProducts.value.length) {
        displayCount.value += 20;
      }
    },
    { rootMargin: "300px" }
  );
  observer.observe(sentinel.value);
};

watch(displayCount, async () => {
  await nextTick();
  setupObserver();
});

watch([filteredProducts], () => {
  displayCount.value = 20;
});

// --- Navigasi ---
const pilihStore = (kode: string) => router.push({ name: ROUTE_NAME, params: { toko: kode } });
const pilihKategori = (nama: string) =>
  router.push({
    name: ROUTE_NAME,
    params: { toko: tokoParam.value, kategori: nama === "ALL" ? "semua" : nama },
  });

const goBack = () => {
  if (phase.value === "products")
    router.push({ name: ROUTE_NAME, params: { toko: tokoParam.value } });
  else if (phase.value === "category" && !isKiosk.value) router.push({ name: ROUTE_NAME });
  else router.push(homePath.value);
};

const headerTitle = computed(() => {
  if (phase.value === "store") return "Cek Stok Store";
  const toko = currentStore.value?.nama || tokoParam.value;
  return phase.value === "category" ? toko : `${toko}`;
});
const headerSub = computed(() => {
  if (phase.value === "store") return "Pilih store untuk melihat barang ready";
  if (phase.value === "category") return "Pilih kategori jenis kain";
  return selectedKategori.value === "ALL" ? "Semua kategori" : selectedKategori.value;
});

// --- Detail produk ---
const isDetailVisible = ref(false);
const selectedProduct = ref<GroupedStokItem | null>(null);
const isFullscreenVisible = ref(false);
const fullscreenIndex = ref(0);

const openDetail = (p: GroupedStokItem) => {
  selectedProduct.value = p;
  isDetailVisible.value = true;
};
const openFullscreen = (i: number) => {
  fullscreenIndex.value = i;
  isFullscreenVisible.value = true;
};

const isLowStock = (p: GroupedStokItem) => p.total_stok > 0 && p.total_stok <= LOW_STOCK_TOTAL;

// --- Sinkronisasi dengan route ---
watch(
  tokoParam,
  (kode) => {
    if (kode) loadStok(kode);
    else stokResults.value = [];
  },
  { immediate: true }
);

// Toko yang tidak dikenal -> kembali ke daftar toko
watch([stores, tokoParam], () => {
  if (isLoadingStores.value || !tokoParam.value) return;
  if (!stores.value.some((s) => s.kode === tokoParam.value)) {
    router.replace({ name: ROUTE_NAME });
  }
});

watch([phase, kategoriParam], async () => {
  searchInput.value = String(route.query.q || "");
  displayCount.value = 20;
  window.scrollTo({ top: 0 });
  await nextTick();
  setupObserver();
});

watch(
  () => [phase.value, isLoadingStok.value],
  async () => {
    await nextTick();
    setupObserver();
  }
);

watch([headerTitle, headerSub], () => {
  document.title = `${headerTitle.value} - Katalog Kaosan`;
});

onMounted(() => {
  fetchStores();
  document.title = `${headerTitle.value} - Katalog Kaosan`;
});

onUnmounted(() => {
  observer?.disconnect();
  clearTimeout(searchTimer);
});
</script>

<template>
  <div class="k-page">
    <!-- HEADER -->
    <header class="k-header">
      <v-btn icon variant="text" size="small" aria-label="Kembali" @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="k-header-title">
        <div class="k-title">{{ headerTitle }}</div>
        <div class="k-sub">{{ headerSub }}</div>
      </div>
      <v-spacer />
      <router-link :to="homePath" class="k-home-link">
        <img :src="LogoKaosan" height="28" alt="Kaosan" />
      </router-link>
    </header>

    <!-- ================= FASE 1: PILIH TOKO ================= -->
    <main v-if="phase === 'store'" class="k-container">
      <p class="k-hint">Pilih store untuk melihat ketersediaan barang siap jual.</p>

      <div v-if="isLoadingStores" class="k-store-grid">
        <div v-for="n in 8" :key="n" class="k-skel k-skel-store"></div>
      </div>

      <div v-else class="k-store-grid">
        <button
          v-for="(store, i) in stores"
          :key="store.kode"
          class="k-store-card k-enter"
          :style="{ '--i': i }"
          @click="pilihStore(store.kode)"
        >
          <span class="k-store-avatar"><v-icon color="#D32F2F" size="22">mdi-store</v-icon></span>
          <span class="k-store-text">
            <span class="k-store-name">{{ store.nama }}</span>
            <span class="k-store-sub">Store Kaosan</span>
          </span>
          <v-icon color="#D32F2F" size="20">mdi-chevron-right</v-icon>
        </button>
      </div>
    </main>

    <!-- ================= FASE 2: PILIH KATEGORI ================= -->
    <main v-else-if="phase === 'category'" class="k-container">
      <p class="k-hint">Pilih kategori jenis kain yang ingin dilihat.</p>

      <div v-if="isLoadingStok" class="k-cat-grid">
        <div v-for="n in 8" :key="n" class="k-skel k-skel-cat"></div>
      </div>

      <div v-else-if="stokError" class="k-state">
        <v-icon size="48" color="grey">mdi-wifi-off</v-icon>
        <div class="k-state-title">Gagal memuat data stok</div>
        <v-btn color="#D32F2F" class="text-white text-none" @click="loadStok(tokoParam, true)">
          Coba Lagi
        </v-btn>
      </div>

      <div v-else-if="masterGrouped.length === 0" class="k-state">
        <v-icon size="48" color="grey">mdi-package-variant-closed</v-icon>
        <div class="k-state-title">Stok di store ini sedang kosong</div>
      </div>

      <div v-else class="k-cat-grid">
        <button class="k-cat-card k-enter" style="--i: 0" @click="pilihKategori('ALL')">
          <div class="k-cat-tex" v-html="getFabricTexture('SEMUA')"></div>
          <div class="k-cat-body">
            <div class="k-cat-name">SEMUA</div>
            <div class="k-cat-count">{{ masterGrouped.length }} item</div>
          </div>
        </button>

        <button
          v-for="(kat, i) in kategoriList"
          :key="kat.nama"
          class="k-cat-card k-enter"
          :style="{ '--i': i + 1 }"
          @click="pilihKategori(kat.nama)"
        >
          <div class="k-cat-tex" v-html="getFabricTexture(kat.nama)"></div>
          <div class="k-cat-body">
            <div class="k-cat-name">{{ kat.nama }}</div>
            <div class="k-cat-count">{{ kat.jumlah }} item</div>
          </div>
        </button>
      </div>
    </main>

    <!-- ================= FASE 3: GRID PRODUK ================= -->
    <template v-else>
      <div class="k-toolbar">
        <div class="k-toolbar-inner">
          <div class="k-chips">
            <router-link
              :to="{ name: ROUTE_NAME, params: { toko: tokoParam } }"
              class="k-chip k-chip-link"
            >
              <v-icon size="14">mdi-layers-outline</v-icon>
              {{ selectedKategori === "ALL" ? "Semua Kategori" : selectedKategori }}
              <v-icon size="14">mdi-pencil-outline</v-icon>
            </router-link>

            <div class="k-lengan">
              <button
                v-for="opt in lenganOptions"
                :key="opt.value"
                class="k-lengan-btn"
                :class="{ 'k-lengan-btn--active': lengan === opt.value }"
                @click="setLengan(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <v-text-field
            v-model="searchInput"
            placeholder="Cari nama / kode warna..."
            variant="outlined"
            density="compact"
            hide-details
            clearable
            bg-color="white"
            prepend-inner-icon="mdi-magnify"
            class="k-search"
          />
        </div>
      </div>

      <main class="k-container">
        <div v-if="isLoadingStok" class="k-grid">
          <div v-for="n in 8" :key="n" class="k-skel k-skel-card"></div>
        </div>

        <div v-else-if="stokError" class="k-state">
          <v-icon size="48" color="grey">mdi-wifi-off</v-icon>
          <div class="k-state-title">Gagal memuat data stok</div>
          <v-btn color="#D32F2F" class="text-white text-none" @click="loadStok(tokoParam, true)">
            Coba Lagi
          </v-btn>
        </div>

        <div v-else-if="filteredProducts.length === 0" class="k-state">
          <v-icon size="48" color="grey">mdi-magnify-close</v-icon>
          <div class="k-state-title">
            {{ searchTerm ? `Tidak ada hasil untuk "${searchTerm}"` : "Barang tidak ditemukan" }}
          </div>
          <div class="k-state-sub">Coba kata kunci lain atau ubah filter lengan.</div>
        </div>

        <template v-else>
          <div class="k-count">{{ filteredProducts.length }} produk</div>

          <div class="k-grid">
            <article
              v-for="(item, i) in visibleProducts"
              :key="item.kode"
              class="k-card k-enter"
              :style="{ '--i': i % 20 }"
              tabindex="0"
              @click="openDetail(item)"
              @keydown.enter="openDetail(item)"
            >
              <div class="k-card-img">
                <v-img v-if="item.gambar_url" :src="item.gambar_url" cover aspect-ratio="1">
                  <template #placeholder>
                    <div class="k-img-loading"></div>
                  </template>
                  <template #error>
                    <div class="k-tex" v-html="getFabricTexture(item.jenis_kain_final)"></div>
                  </template>
                </v-img>
                <div v-else class="k-tex" v-html="getFabricTexture(item.jenis_kain_final)"></div>

                <span v-if="item.total_stok <= 0" class="k-badge k-badge-out">Habis</span>
                <span v-else-if="isLowStock(item)" class="k-badge k-badge-low">Sisa sedikit</span>

                <span v-if="item.total_terjual > 0" class="k-badge k-badge-sold">
                  <v-icon size="11">mdi-fire</v-icon>
                  {{ item.total_terjual.toLocaleString("id-ID") }} terjual
                </span>
                <span class="k-badge k-badge-size">{{ item.variants.length }} Ukuran</span>
              </div>

              <div class="k-card-body">
                <h3 class="k-card-name" :title="item.nama">{{ item.nama }}</h3>
                <div class="k-card-price">
                  <template v-if="item.hargaMin !== item.hargaMax">
                    {{ rp(item.hargaMin) }} -
                    {{ new Intl.NumberFormat("id-ID").format(item.hargaMax) }}
                  </template>
                  <template v-else>{{ rp(item.hargaMin) }}</template>
                </div>
                <div class="k-card-code" :title="item.kode">Kode: {{ item.kode }}</div>
              </div>
            </article>
          </div>

          <div ref="sentinel" class="k-sentinel"></div>
          <div v-if="displayCount < filteredProducts.length" class="k-more">
            <v-progress-circular indeterminate color="#D32F2F" size="22" />
          </div>
          <div v-else class="k-end">
            Semua {{ filteredProducts.length }} produk sudah ditampilkan
          </div>
        </template>
      </main>
    </template>

    <!-- ================= DIALOG DETAIL UKURAN ================= -->
    <v-dialog v-model="isDetailVisible" max-width="420" scrollable :fullscreen="xs">
      <v-card class="k-detail">
        <div
          class="k-detail-bar"
          style="background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)"
        >
          <v-icon color="white" size="18" class="mr-2">mdi-tshirt-crew</v-icon>
          <span class="k-detail-bar-title">Rincian Ukuran</span>
          <v-spacer />
          <v-btn
            icon="mdi-close"
            color="white"
            variant="text"
            size="small"
            aria-label="Tutup"
            @click="isDetailVisible = false"
          />
        </div>

        <v-card-text v-if="selectedProduct" class="pa-4">
          <v-carousel
            v-if="selectedProduct.galeri.length > 0"
            height="340"
            hide-delimiter-background
            show-arrows="hover"
            class="k-carousel"
          >
            <v-carousel-item v-for="(img, i) in selectedProduct.galeri" :key="i">
              <v-img
                :src="img.url"
                cover
                height="100%"
                style="cursor: zoom-in"
                @click="openFullscreen(i)"
              >
                <template #error>
                  <div class="k-img-broken">
                    <v-icon size="40" color="grey">mdi-image-broken-variant</v-icon>
                  </div>
                </template>
              </v-img>
            </v-carousel-item>
          </v-carousel>
          <div v-else class="k-carousel k-carousel-tex">
            <div class="k-tex" v-html="getFabricTexture(selectedProduct.jenis_kain_final)"></div>
          </div>

          <h2 class="k-detail-name">{{ selectedProduct.nama }}</h2>
          <div class="k-detail-code">Kode: {{ selectedProduct.kode }}</div>

          <div class="k-detail-label">Pilih Ukuran</div>
          <div class="k-sizes">
            <div
              v-for="v in selectedProduct.variants"
              :key="v.ukuran"
              class="k-size"
              tabindex="0"
              :class="{
                'k-size--out': Number(v.stok) <= 0,
                'k-size--low': Number(v.stok) > 0 && Number(v.stok) <= 3,
                'k-size--ok': Number(v.stok) > 3,
              }"
            >
              {{ v.ukuran }}
              <span v-if="Number(v.stok) <= 0" class="k-size-strike"></span>
              <v-tooltip activator="parent" location="top" open-on-click>
                {{ Number(v.stok) <= 0 ? "Stok Habis" : `Sisa Stok: ${v.stok} Pcs` }}
              </v-tooltip>
            </div>
          </div>

          <div class="k-legend">
            <span><i class="k-dot k-dot-ok"></i>Tersedia</span>
            <span><i class="k-dot k-dot-low"></i>Menipis</span>
            <span><i class="k-dot k-dot-out"></i>Habis</span>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- ================= FULLSCREEN GAMBAR ================= -->
    <v-dialog v-model="isFullscreenVisible" fullscreen>
      <div class="k-fs">
        <v-btn
          icon="mdi-close"
          variant="flat"
          color="white"
          size="small"
          class="k-fs-close"
          @click="isFullscreenVisible = false"
        />
        <v-carousel
          v-if="selectedProduct?.galeri?.length"
          v-model="fullscreenIndex"
          height="100vh"
          hide-delimiter-background
          show-arrows="hover"
          style="background: transparent"
        >
          <v-carousel-item v-for="(img, i) in selectedProduct.galeri" :key="i">
            <div class="k-fs-slide" @click="isFullscreenVisible = false">
              <v-img :src="img.url" contain max-height="95vh" max-width="95vw" @click.stop />
            </div>
          </v-carousel-item>
        </v-carousel>
      </div>
    </v-dialog>
  </div>
</template>

<style scoped>
.k-page {
  --k-red: #d32f2f;
  --k-red-dark: #b71c1c;
  --k-header-h: 56px;
  min-height: 100vh;
  background: #f5f5f5;
}

/* ---------- HEADER ---------- */
.k-header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: var(--k-header-h);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  background: linear-gradient(135deg, var(--k-red) 0%, var(--k-red-dark) 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(183, 28, 28, 0.35);
}
.k-header :deep(.v-btn) {
  color: #fff;
}
.k-header-title {
  min-width: 0;
  margin-left: 4px;
}
.k-title {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.k-sub {
  font-size: 11px;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.k-home-link {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
}

/* ---------- LAYOUT ---------- */
.k-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 12px 40px;
}
.k-hint {
  font-size: 12px;
  color: #666;
  margin: 0 0 12px;
}

/* ---------- TOOLBAR STICKY ---------- */
.k-toolbar {
  position: sticky;
  top: var(--k-header-h);
  z-index: 40;
  background: rgba(245, 245, 245, 0.96);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid #e8e8e8;
}
.k-toolbar-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.k-chips {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.k-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  background: #ffebee;
  color: var(--k-red-dark);
  border: 1px solid #ffcdd2;
  text-decoration: none;
}
.k-chip-link:hover {
  background: #ffcdd2;
}
.k-lengan {
  display: flex;
  gap: 6px;
}
.k-lengan-btn {
  padding: 4px 14px;
  border-radius: 999px;
  border: 1.5px solid #e0e0e0;
  background: #fff;
  font-size: 11px;
  font-weight: 700;
  color: #777;
  cursor: pointer;
  transition: all 0.12s;
}
.k-lengan-btn:hover {
  border-color: var(--k-red);
  color: var(--k-red);
}
.k-lengan-btn--active {
  border-color: var(--k-red) !important;
  background: var(--k-red) !important;
  color: #fff !important;
}
.k-search :deep(.v-field--focused .v-field__outline) {
  color: var(--k-red) !important;
}
.k-search :deep(.v-field) {
  border-radius: 10px;
}

/* ---------- PILIH TOKO ---------- */
.k-store-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.k-store-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1.5px solid #eee;
  border-radius: 14px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.k-store-card:hover,
.k-store-card:focus-visible {
  transform: translateY(-2px);
  border-color: #ffcdd2;
  box-shadow: 0 6px 16px rgba(211, 47, 47, 0.14);
  outline: none;
}
.k-store-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #ffebee;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.k-store-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.k-store-name {
  font-size: 14px;
  font-weight: 700;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.k-store-sub {
  font-size: 11px;
  color: #888;
}

/* ---------- PILIH KATEGORI ---------- */
.k-cat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.k-cat-card {
  border: 1px solid #eee;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  padding: 0;
  text-align: center;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.k-cat-card:hover,
.k-cat-card:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  outline: none;
}
.k-cat-tex {
  line-height: 0;
}
.k-cat-tex :deep(svg) {
  width: 100%;
  height: auto;
}
.k-cat-body {
  padding: 8px;
}
.k-cat-name {
  font-size: 12px;
  font-weight: 800;
  color: #333;
}
.k-cat-count {
  font-size: 10px;
  color: #999;
}

/* ---------- GRID PRODUK ---------- */
.k-count {
  font-size: 11px;
  color: #777;
  margin-bottom: 8px;
}
.k-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.k-card {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.k-card:hover,
.k-card:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(211, 47, 47, 0.16);
  border-color: #ffcdd2;
  outline: none;
}
.k-card-img {
  position: relative;
  aspect-ratio: 1 / 1;
  background: #eee;
  overflow: hidden;
}
.k-tex {
  width: 100%;
  height: 100%;
  opacity: 0.85;
}
.k-tex :deep(svg) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.k-img-loading {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #eee 25%, #f7f7f7 50%, #eee 75%);
  background-size: 200% 100%;
  animation: k-shimmer 1.3s infinite linear;
}
.k-badge {
  position: absolute;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.5;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.k-badge-size {
  right: 6px;
  bottom: 6px;
  background: rgba(255, 255, 255, 0.95);
  color: var(--k-red);
  border: 1px solid #e0e0e0;
}
.k-badge-sold {
  left: 6px;
  bottom: 6px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
}
.k-badge-low {
  left: 0;
  top: 0;
  border-radius: 0 0 8px 0;
  background: #ef6c00;
  color: #fff;
}
.k-badge-out {
  left: 0;
  top: 0;
  border-radius: 0 0 8px 0;
  background: #616161;
  color: #fff;
}
.k-card-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.k-card-name {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  color: #222;
  min-height: 32px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.k-card-price {
  font-size: 13px;
  font-weight: 900;
  color: var(--k-red);
}
.k-card-code {
  font-size: 10px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.k-sentinel {
  height: 1px;
}
.k-more,
.k-end {
  text-align: center;
  padding: 16px;
  font-size: 11px;
  color: #999;
}

/* ---------- STATE KOSONG / ERROR ---------- */
.k-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 12px;
  text-align: center;
}
.k-state-title {
  font-size: 14px;
  font-weight: 700;
  color: #444;
}
.k-state-sub {
  font-size: 12px;
  color: #999;
}

/* ---------- SKELETON ---------- */
.k-skel {
  border-radius: 12px;
  background: linear-gradient(90deg, #ececec 25%, #f6f6f6 50%, #ececec 75%);
  background-size: 200% 100%;
  animation: k-shimmer 1.3s infinite linear;
}
.k-skel-store {
  height: 68px;
}
.k-skel-cat {
  height: 130px;
}
.k-skel-card {
  aspect-ratio: 3 / 4;
}
@keyframes k-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* ---------- ANIMASI MASUK (stagger) ---------- */
.k-enter {
  opacity: 0;
  transform: translateY(8px);
  animation: k-fade-up 0.35s ease forwards;
  animation-delay: calc(var(--i, 0) * 25ms);
}
@keyframes k-fade-up {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---------- DETAIL DIALOG ---------- */
.k-detail {
  border-radius: 16px;
  overflow: hidden;
}
.k-detail-bar {
  display: flex;
  align-items: center;
  padding: 6px 6px 6px 14px;
  background: linear-gradient(135deg, var(--k-red) 0%, var(--k-red-dark) 100%);
}
.k-detail-bar-title {
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}
.k-carousel {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #eee;
  margin-bottom: 14px;
  background: #f5f5f5;
}
.k-carousel-tex {
  height: 340px;
}
.k-img-broken {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: #eee;
}
.k-detail-name {
  margin: 0 0 2px;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
}
.k-detail-code {
  font-size: 11px;
  color: #888;
  margin-bottom: 14px;
}
.k-detail-label {
  font-size: 11px;
  font-weight: 800;
  color: #444;
  margin-bottom: 8px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}
.k-sizes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.k-size {
  position: relative;
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: default;
}
.k-size--ok {
  background: #2e7d32;
  color: #fff;
}
.k-size--low {
  background: var(--k-red);
  color: #fff;
}
.k-size--out {
  background: #f5f5f5;
  color: #9e9e9e;
  border: 1px solid #e0e0e0;
}
.k-size-strike {
  position: absolute;
  top: 50%;
  left: -10%;
  width: 120%;
  height: 1.5px;
  background: #bdbdbd;
  transform: rotate(-45deg);
}
.k-legend {
  display: flex;
  gap: 14px;
  margin-top: 16px;
  font-size: 11px;
  font-weight: 600;
  color: #666;
}
.k-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.k-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
.k-dot-ok {
  background: #2e7d32;
}
.k-dot-low {
  background: var(--k-red);
}
.k-dot-out {
  background: #f5f5f5;
  border: 1px solid #ccc;
}

/* ---------- FULLSCREEN GAMBAR ---------- */
.k-fs {
  background: rgba(0, 0, 0, 0.95);
  height: 100%;
}
.k-fs-close {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
}
.k-fs-slide {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}

.k-detail-bar {
  flex-shrink: 0;
  min-height: 44px;
}

/* ---------- RESPONSIF ---------- */
@media (min-width: 600px) {
  .k-store-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .k-cat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .k-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  .k-toolbar-inner {
    flex-direction: row;
    align-items: center;
  }
  .k-chips {
    flex-wrap: nowrap;
  }
  .k-search {
    max-width: 320px;
    margin-left: auto;
  }
}
@media (min-width: 960px) {
  .k-store-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .k-cat-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .k-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* ---------- HORMATI REDUCED MOTION ---------- */
@media (prefers-reduced-motion: reduce) {
  .k-enter {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .k-skel,
  .k-img-loading {
    animation: none;
  }
  .k-card,
  .k-store-card,
  .k-cat-card {
    transition: none;
  }
}
</style>

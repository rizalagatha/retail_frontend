<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import api from "@/services/api";
import { getFabricTexture } from "@/utils/fabricTextures";
import LogoKaosan from "@/assets/logo.png";

interface CatalogRow {
  kode: string;
  jenis_kain: string;
  jenis_kaos: string;
  lengan: string;
  nama: string;
  harga_min: number | null;
  harga_max: number | null;
  ukuran: string | null;
  ukuran_harga: string | null;
  gambar_url: string | null;
  urutan: number;
  galeri: string | { url: string; index: number }[] | null;
}

interface Product {
  kode: string;
  nama: string;
  kategori: string;
  lengan: string;
  hargaMin: number;
  hargaMax: number;
  ukuran: string[];
  ukuranHarga: { ukuran: string; harga: number }[];
  gambar: string | null;
  urutan: number;
  galeri: { url: string; index: number }[];
  coverIndex: number;
}

const route = useRoute();
const router = useRouter();
const { xs, mdAndUp } = useDisplay();

const ROUTE_NAME = "Katalog";
const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(n) || 0)}`;

const formatHarga = (min: number, max: number) => {
  if (!max || max <= 0) return null; // semua 0 -> tidak ada harga
  if (min === max) return rp(min);
  return `${rp(min)} - ${new Intl.NumberFormat("id-ID").format(max)}`;
};

const selectedHarga = computed(() =>
  selected.value ? formatHarga(selected.value.hargaMin, selected.value.hargaMax) : null
);

// --- Fase dari URL ---
const kategoriParam = computed(() => (route.params.kategori as string) || "");
const phase = computed<"category" | "products">(() =>
  kategoriParam.value ? "products" : "category"
);
const selectedKategori = computed(() =>
  kategoriParam.value === "semua" ? "ALL" : kategoriParam.value
);

// --- Data ---
const rows = ref<CatalogRow[]>([]);
const isLoading = ref(true);
const hasError = ref(false);

const loadCatalog = async () => {
  isLoading.value = true;
  hasError.value = false;
  try {
    const { data } = await api.get("/so/public/katalog");
    rows.value = data;
  } catch {
    hasError.value = true;
  } finally {
    isLoading.value = false;
  }
};

const sizeRank = (size: string) => {
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

const products = computed<Product[]>(() =>
  rows.value.map((r) => {
    let galeri: { url: string; index: number }[] = [];
    try {
      const raw = r.galeri ? (typeof r.galeri === "string" ? JSON.parse(r.galeri) : r.galeri) : [];
      galeri = raw;
    } catch {
      galeri = [];
    }

    let kategori = (r.jenis_kain || "").trim() || "LAIN-LAIN";
    const namaUp = (r.nama || "").toUpperCase();
    const kaosUp = (r.jenis_kaos || "").toUpperCase();
    if (namaUp.includes("ANAK") || kaosUp.includes("ANAK") || namaUp.includes("KIDS"))
      kategori = "KAOS ANAK";
    else if (namaUp.includes("TUNIK") || kaosUp.includes("TUNIK")) kategori = "TUNIK";

    const min = Number(r.harga_min) || 0;
    const max = Number(r.harga_max) || 0;

    let ukuranHarga: { ukuran: string; harga: number }[] = [];
    try {
      ukuranHarga = r.ukuran_harga ? JSON.parse(r.ukuran_harga) : [];
    } catch {
      ukuranHarga = [];
    }
    ukuranHarga = ukuranHarga
      .map((u) => ({ ukuran: u.ukuran, harga: Number(u.harga) || 0 }))
      .sort((a, b) => sizeRank(a.ukuran) - sizeRank(b.ukuran));

    // Pilih 1 foto acak dari galeri sebagai foto kartu (fallback ke gambar_url)
    const coverIndex = galeri.length ? Math.floor(Math.random() * galeri.length) : 0;
    const gambar = galeri.length ? galeri[coverIndex].url : r.gambar_url;

    return {
      kode: r.kode,
      nama: r.nama,
      kategori,
      lengan: (r.lengan || "").toUpperCase(),
      hargaMin: min || max,
      hargaMax: max || min,
      ukuran: r.ukuran ? r.ukuran.split(",") : [],
      ukuranHarga,
      gambar,
      coverIndex,
      urutan: r.urutan || 9999,
      galeri,
    };
  })
);

// Cover acak per kategori. Dipilih sekali saat data dimuat (bukan tiap render),
// jadi tidak berganti-ganti saat user bolak-balik atau mengetik.
const coverMap = ref<Record<string, string>>({});
const semuaCovers = ref<string[]>([]);
const heroImages = ref<string[]>([]);

const shuffle = <T>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

watch(
  products,
  (list) => {
    const groups = new Map<string, string[]>();
    list.forEach((p) => {
      if (!p.gambar) return;
      if (!groups.has(p.kategori)) groups.set(p.kategori, []);
      groups.get(p.kategori)!.push(p.gambar);
    });

    const picked: Record<string, string> = {};
    groups.forEach((imgs, kategori) => {
      picked[kategori] = imgs[Math.floor(Math.random() * imgs.length)];
    });
    coverMap.value = picked;

    // Kartu "SEMUA": 4 foto acak dari kategori yang berbeda
    semuaCovers.value = shuffle(Object.values(picked)).slice(0, 4);

    // Hero: 8 foto dari jenis kain berbeda (kalau kain < 8, sisanya diisi foto produk acak)
    const hero = shuffle(Object.values(picked)).slice(0, 8);
    if (hero.length < 8) {
      const extra = shuffle(
        list.map((p) => p.gambar).filter((g): g is string => !!g && !hero.includes(g))
      );
      hero.push(...extra.slice(0, 8 - hero.length));
    }
    heroImages.value = hero;
  },
  { immediate: true }
);

const kategoriList = computed(() => {
  const count: Record<string, number> = {};
  products.value.forEach((p) => {
    count[p.kategori] = (count[p.kategori] || 0) + 1;
  });

  return Object.keys(count)
    .sort((a, b) => {
      if (a === "LAIN-LAIN") return 1;
      if (b === "LAIN-LAIN") return -1;
      return count[b] - count[a];
    })
    .map((nama) => ({
      nama,
      jumlah: count[nama],
      cover: coverMap.value[nama] || null,
    }));
});

// --- Filter (di query URL) ---
const lengan = computed(() => String(route.query.lengan || "SEMUA").toUpperCase());
const searchTerm = computed(() => String(route.query.q || ""));
const searchInput = ref(String(route.query.q || ""));
const lenganOptions = [
  { label: "Semua", value: "SEMUA" },
  { label: "Pendek", value: "PENDEK" },
  { label: "Panjang", value: "PANJANG" },
];

const setLengan = (v: string) =>
  router.replace({ query: { ...route.query, lengan: v === "SEMUA" ? undefined : v } });

let searchTimer: ReturnType<typeof setTimeout>;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(
    () => router.replace({ query: { ...route.query, q: v?.trim() || undefined } }),
    300
  );
});

const filtered = computed(() => {
  let data = [...products.value];
  if (selectedKategori.value !== "ALL")
    data = data.filter((p) => p.kategori === selectedKategori.value);
  if (lengan.value !== "SEMUA") data = data.filter((p) => p.lengan.includes(lengan.value));
  if (searchTerm.value) {
    const q = searchTerm.value.toLowerCase();
    data = data.filter((p) => p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q));
  }
  return data.sort((a, b) => a.urutan - b.urutan || a.nama.localeCompare(b.nama));
});

// --- Load more ---
const displayCount = ref(20);
const visible = computed(() => filtered.value.slice(0, displayCount.value));
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const onIntersect = (entries: IntersectionObserverEntry[]) => {
  if (!entries[0].isIntersecting) return;
  if (displayCount.value >= filtered.value.length) return;
  displayCount.value += 20;
  // Re-observe supaya terpicu lagi kalau konten masih pendek
  const el = sentinel.value;
  if (el && observer) {
    observer.unobserve(el);
    nextTick(() => observer?.observe(el));
  }
};

// Function ref: observer menempel otomatis setiap kali elemen sentinel dibuat ulang
// (penting karena grid sekarang ikut transisi dan elemennya diganti saat filter berubah)
const setSentinel = (el: unknown) => {
  sentinel.value = (el as HTMLElement) || null;
  if (!el) return;
  observer ??= new IntersectionObserver(onIntersect, { rootMargin: "300px" });
  observer.disconnect();
  observer.observe(el as Element);
};

watch(filtered, () => {
  displayCount.value = 20;
});
// Animasi stagger kartu hanya dimainkan saat pertama masuk ke halaman produk,
// bukan setiap ganti jenis kain
const firstGrid = ref(true);
watch(selectedKategori, () => {
  firstGrid.value = false;
});
watch(phase, (p) => {
  if (p === "category") firstGrid.value = true;
});

const scrollTop = () => window.scrollTo({ top: 0 });

// --- Gambar: fade-in saat selesai dimuat ---
const imgFailed = reactive<Record<string, boolean>>({});
const onImgLoad = (e: Event) => (e.target as HTMLImageElement).classList.add("is-loaded");

// --- Navigasi ---
const pilihKategori = (nama: string) =>
  router.push({
    name: ROUTE_NAME,
    params: { kategori: nama === "ALL" ? "semua" : nama },
    query: route.query,
  });
const goBack = () =>
  phase.value === "products" ? router.push({ name: ROUTE_NAME }) : router.push("/");

// --- Detail ---
const detailVisible = ref(false);
const selected = ref<Product | null>(null);
const detailIndex = ref(0);

const openDetail = (p: Product) => {
  selected.value = p;
  detailIndex.value = p.coverIndex;
  detailVisible.value = true;
};

const detailImages = computed<string[]>(() => {
  const s = selected.value;
  if (!s) return [];
  if (s.galeri.length) return s.galeri.map((g) => g.url);
  return s.gambar ? [s.gambar] : [];
});

// Harga per ukuran dipecah per kolom, maksimal 7 ukuran per kolom
const PRICE_PER_COLUMN = 7;
const priceColumns = computed(() => {
  const list = selected.value?.ukuranHarga ?? [];
  const cols: { ukuran: string; harga: number }[][] = [];
  for (let i = 0; i < list.length; i += PRICE_PER_COLUMN) {
    cols.push(list.slice(i, i + PRICE_PER_COLUMN));
  }
  return cols;
});

// --- Lightbox (gambar fullscreen) ---
const lightboxOpen = ref(false);
const lbDx = ref(0);
const lbDy = ref(0);
const lbDir = ref(1);

const openLightbox = (index: number, e?: Event) => {
  const el = e?.currentTarget as HTMLElement | null;
  if (el) {
    // Titik asal animasi = posisi gambar yang diklik (relatif ke tengah layar)
    const r = el.getBoundingClientRect();
    lbDx.value = r.left + r.width / 2 - window.innerWidth / 2;
    lbDy.value = r.top + r.height / 2 - window.innerHeight / 2;
  } else {
    lbDx.value = 0;
    lbDy.value = 0;
  }
  detailIndex.value = index;
  lightboxOpen.value = true;
};
const closeLightbox = () => {
  lightboxOpen.value = false;
};
const lbStep = (dir: 1 | -1) => {
  const n = detailImages.value.length;
  if (n < 2) return;
  lbDir.value = dir;
  detailIndex.value = (detailIndex.value + dir + n) % n;
};

let touchX = 0;
const onLbTouchStart = (e: TouchEvent) => {
  touchX = e.changedTouches[0].clientX;
};
const onLbTouchEnd = (e: TouchEvent) => {
  const d = e.changedTouches[0].clientX - touchX;
  if (Math.abs(d) > 50) lbStep(d < 0 ? 1 : -1);
};

// Capture phase: Esc menutup lightbox saja, tidak ikut menutup dialog detail
const onLbKey = (e: KeyboardEvent) => {
  if (!lightboxOpen.value) return;
  if (e.key === "Escape") {
    e.stopPropagation();
    closeLightbox();
  } else if (e.key === "ArrowLeft") {
    e.stopPropagation();
    lbStep(-1);
  } else if (e.key === "ArrowRight") {
    e.stopPropagation();
    lbStep(1);
  }
};

watch(detailVisible, (v) => {
  if (!v) lightboxOpen.value = false;
});

onMounted(() => {
  document.title = "Katalog Produk - Kaosan";
  loadCatalog();
  window.addEventListener("keydown", onLbKey, true);
});
onUnmounted(() => {
  observer?.disconnect();
  clearTimeout(searchTimer);
  window.removeEventListener("keydown", onLbKey, true);
});
</script>

<template>
  <div class="k-page">
    <header class="k-header">
      <v-btn icon variant="text" size="small" aria-label="Kembali" @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="k-header-title">
        <div class="k-title">Katalog Produk</div>
        <div class="k-sub">
          {{
            phase === "category"
              ? "Pilih jenis kain"
              : selectedKategori === "ALL"
              ? "Semua kategori"
              : selectedKategori
          }}
        </div>
      </div>
      <v-spacer />
      <router-link to="/" class="k-home-link"
        ><img :src="LogoKaosan" height="28" alt="Kaosan"
      /></router-link>
    </header>

    <!-- Transisi antar halaman: kategori <-> produk -->
    <Transition name="k-page" mode="out-in" appear @before-enter="scrollTop">
      <!-- ============ KATEGORI ============ -->
      <div v-if="phase === 'category'" key="category">
        <section v-if="!isLoading && heroImages.length" class="k-hero">
          <div class="k-hero-grid">
            <div
              v-for="(src, i) in heroImages"
              :key="src"
              class="k-hero-tile"
              :style="{ '--i': i }"
            >
              <img :src="src" alt="" decoding="async" @load="onImgLoad" />
            </div>
          </div>

          <div class="k-hero-overlay">
            <div class="k-hero-eyebrow">Kaosan Official</div>
            <h1 class="k-hero-title">Polos yang <em>berkarakter.</em></h1>
            <p class="k-hero-sub">Dipilih per kain, dibuat untuk dipakai setiap hari.</p>
            <div class="k-hero-actions">
              <button class="k-hero-btn k-hero-btn--solid" @click="pilihKategori('ALL')">
                Lihat semua koleksi
              </button>
              <router-link to="/cek-stok" class="k-hero-btn k-hero-btn--ghost">
                Cek stok store
              </router-link>
            </div>
          </div>
        </section>

        <main class="k-container">
          <p class="k-hint">Pilih jenis kain untuk melihat koleksi kami.</p>
          <Transition name="k-fade" mode="out-in">
            <div v-if="isLoading" key="loading" class="k-cat-grid">
              <div v-for="n in 8" :key="n" class="k-skel k-skel-cat"></div>
            </div>

            <div v-else-if="hasError" key="error" class="k-state">
              <v-icon size="48" color="grey">mdi-wifi-off</v-icon>
              <div class="k-state-title">Gagal memuat katalog</div>
              <v-btn color="#D32F2F" class="text-white text-none" @click="loadCatalog"
                >Coba Lagi</v-btn
              >
            </div>

            <div v-else key="ready" class="k-cat-grid">
              <button class="k-cat-card k-enter" style="--i: 0" @click="pilihKategori('ALL')">
                <div class="k-cat-cover k-cat-cover--mosaic">
                  <img
                    v-for="(src, n) in semuaCovers"
                    :key="n"
                    :src="src"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    @load="onImgLoad"
                  />
                </div>
                <div class="k-cat-body">
                  <div class="k-cat-name">SEMUA</div>
                  <div class="k-cat-count">{{ products.length }} produk</div>
                </div>
              </button>

              <button
                v-for="(kat, i) in kategoriList"
                :key="kat.nama"
                class="k-cat-card k-enter"
                :style="{ '--i': (i + 1) % 12 }"
                @click="pilihKategori(kat.nama)"
              >
                <div class="k-cat-cover">
                  <img
                    v-if="kat.cover && !imgFailed['cat-' + kat.nama]"
                    :src="kat.cover"
                    :alt="kat.nama"
                    loading="lazy"
                    decoding="async"
                    @load="onImgLoad"
                    @error="imgFailed['cat-' + kat.nama] = true"
                  />
                  <div v-else class="k-cat-tex" v-html="getFabricTexture(kat.nama)"></div>
                </div>
                <div class="k-cat-body">
                  <div class="k-cat-name">{{ kat.nama }}</div>
                  <div class="k-cat-count">{{ kat.jumlah }} produk</div>
                </div>
              </button>
            </div>
          </Transition>
        </main>
      </div>

      <!-- ============ PRODUK ============ -->
      <div v-else key="products">
        <!-- Toolbar hanya untuk layar kecil -->
        <div v-if="!mdAndUp" class="k-toolbar">
          <div class="k-toolbar-inner">
            <div class="k-chips">
              <router-link :to="{ name: ROUTE_NAME }" class="k-chip">
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
              placeholder="Cari nama / warna..."
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

        <div class="k-container k-shop" :class="{ 'k-shop--side': mdAndUp }">
          <!-- SIDEBAR (desktop) -->
          <aside v-if="mdAndUp" class="k-side">
            <v-text-field
              v-model="searchInput"
              placeholder="Cari nama / warna..."
              variant="outlined"
              density="compact"
              hide-details
              clearable
              bg-color="white"
              prepend-inner-icon="mdi-magnify"
              class="k-search"
            />

            <div class="k-side-title">Jenis kain</div>
            <nav class="k-side-list">
              <button
                class="k-side-item"
                :class="{ 'k-side-item--active': selectedKategori === 'ALL' }"
                @click="pilihKategori('ALL')"
              >
                <span>Semua</span><small>{{ products.length }}</small>
              </button>
              <button
                v-for="kat in kategoriList"
                :key="kat.nama"
                class="k-side-item"
                :class="{ 'k-side-item--active': selectedKategori === kat.nama }"
                @click="pilihKategori(kat.nama)"
              >
                <span>{{ kat.nama }}</span
                ><small>{{ kat.jumlah }}</small>
              </button>
            </nav>

            <div class="k-side-title">Lengan</div>
            <div class="k-lengan k-lengan--wrap">
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
          </aside>

          <!-- AREA PRODUK -->
          <main class="k-shop-main">
            <Transition name="k-swap">
              <div v-if="isLoading" key="loading" class="k-grid">
                <div v-for="n in 8" :key="n" class="k-skel k-skel-card"></div>
              </div>

              <div v-else-if="filtered.length === 0" key="empty" class="k-state">
                <v-icon size="48" color="grey">mdi-magnify-close</v-icon>
                <div class="k-state-title">
                  {{
                    searchTerm ? `Tidak ada hasil untuk "${searchTerm}"` : "Produk tidak ditemukan"
                  }}
                </div>
              </div>

              <div v-else :key="`grid-${selectedKategori}-${lengan}`">
                <div class="k-count">{{ filtered.length }} produk</div>
                <div class="k-grid">
                  <article
                    v-for="(p, i) in visible"
                    :key="p.kode"
                    :class="['k-card', { 'k-enter': firstGrid }]"
                    :style="{ '--i': i % 12 }"
                    tabindex="0"
                    @click="openDetail(p)"
                    @keydown.enter="openDetail(p)"
                  >
                    <div class="k-card-img">
                      <div class="k-img-loading"></div>
                      <img
                        v-if="p.gambar && !imgFailed[p.kode]"
                        :src="p.gambar"
                        :alt="p.nama"
                        class="k-img"
                        loading="lazy"
                        decoding="async"
                        @load="onImgLoad"
                        @error="imgFailed[p.kode] = true"
                      />
                      <div v-else class="k-tex" v-html="getFabricTexture(p.kategori)"></div>
                    </div>
                    <div class="k-card-body">
                      <h3 class="k-card-name" :title="p.nama">{{ p.nama }}</h3>
                      <div v-if="formatHarga(p.hargaMin, p.hargaMax)" class="k-card-price">
                        {{ formatHarga(p.hargaMin, p.hargaMax) }}
                      </div>
                      <div v-else class="k-card-price k-card-price--na">
                        Hubungi store untuk harga
                      </div>
                    </div>
                  </article>
                </div>

                <div :ref="setSentinel" class="k-sentinel"></div>
                <div v-if="displayCount < filtered.length" class="k-more">
                  <v-progress-circular indeterminate color="#D32F2F" size="22" />
                </div>
              </div>
            </Transition>
          </main>
        </div>
      </div>
    </Transition>

    <!-- ============ DETAIL PRODUK ============ -->
    <v-dialog
      v-model="detailVisible"
      max-width="920"
      scrollable
      :fullscreen="xs"
      :transition="xs ? 'k-sheet' : 'k-dialog'"
    >
      <v-card v-if="selected" class="k-detail">
        <div
          class="k-detail-bar"
          style="background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)"
        >
          <span class="k-detail-bar-title">Detail Produk</span>
          <v-spacer />
          <v-btn
            icon="mdi-close"
            color="white"
            variant="text"
            size="small"
            aria-label="Tutup"
            @click="detailVisible = false"
          />
        </div>

        <v-card-text class="pa-4 pa-sm-6">
          <div class="k-detail-layout">
            <div class="k-detail-media">
              <v-carousel
                v-if="detailImages.length"
                v-model="detailIndex"
                height="100%"
                hide-delimiter-background
                :hide-delimiters="detailImages.length < 2"
                :show-arrows="detailImages.length > 1 ? 'hover' : false"
                class="k-carousel"
              >
                <v-carousel-item v-for="(src, i) in detailImages" :key="i">
                  <v-img
                    :src="src"
                    cover
                    height="100%"
                    class="k-zoomable"
                    @click="openLightbox(i, $event)"
                  >
                    <template #error>
                      <div class="k-img-broken">
                        <v-icon size="40" color="grey">mdi-image-broken-variant</v-icon>
                      </div>
                    </template>
                  </v-img>
                </v-carousel-item>
              </v-carousel>
              <div v-else class="k-carousel">
                <div class="k-tex" v-html="getFabricTexture(selected.kategori)"></div>
              </div>

              <div v-if="detailImages.length" class="k-zoom-hint" aria-hidden="true">
                <v-icon size="16">mdi-magnify-plus-outline</v-icon>
                <span class="k-zoom-hint-text">Perbesar</span>
              </div>
            </div>

            <div class="k-detail-info">
              <h2 class="k-detail-name">{{ selected.nama }}</h2>
              <div v-if="selectedHarga" class="k-detail-price">{{ selectedHarga }}</div>
              <div v-else class="k-detail-price k-card-price--na">Hubungi store untuk harga</div>

              <template v-if="priceColumns.length">
                <div class="k-detail-label">Harga per ukuran</div>
                <div
                  class="k-price-cols"
                  :style="{ gridTemplateColumns: `repeat(${priceColumns.length}, minmax(0, 1fr))` }"
                >
                  <div v-for="(col, ci) in priceColumns" :key="ci" class="k-price-list">
                    <div v-for="u in col" :key="u.ukuran" class="k-price-row">
                      <span class="k-size">{{ u.ukuran }}</span>
                      <span class="k-price-val" :class="{ 'k-price-val--na': !u.harga }">
                        {{ u.harga ? rp(u.harga) : "Hubungi store" }}
                      </span>
                    </div>
                  </div>
                </div>
              </template>

              <div class="k-note">
                <v-icon size="16" color="#D32F2F">mdi-information-outline</v-icon>
                <span>
                  Ketersediaan stok berbeda di tiap store. Cek di menu
                  <router-link to="/cek-stok">Cek Stok Store</router-link>.
                </span>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- ============ LIGHTBOX ============ -->
    <Teleport to="body">
      <Transition name="k-lb">
        <div
          v-if="lightboxOpen"
          class="k-lb"
          role="dialog"
          aria-modal="true"
          :style="{ '--dx': lbDx + 'px', '--dy': lbDy + 'px', '--dir': lbDir }"
          @click="closeLightbox"
          @touchstart.passive="onLbTouchStart"
          @touchend.passive="onLbTouchEnd"
        >
          <button class="k-lb-btn k-lb-close" aria-label="Tutup" @click.stop="closeLightbox">
            <v-icon>mdi-close</v-icon>
          </button>

          <template v-if="detailImages.length > 1">
            <button class="k-lb-btn k-lb-prev" aria-label="Sebelumnya" @click.stop="lbStep(-1)">
              <v-icon>mdi-chevron-left</v-icon>
            </button>
            <button class="k-lb-btn k-lb-next" aria-label="Berikutnya" @click.stop="lbStep(1)">
              <v-icon>mdi-chevron-right</v-icon>
            </button>
            <div class="k-lb-count">{{ detailIndex + 1 }} / {{ detailImages.length }}</div>
          </template>

          <Transition name="k-lb-slide" mode="out-in">
            <img
              :key="detailIndex"
              :src="detailImages[detailIndex]"
              alt=""
              class="k-lb-img"
              @click.stop
            />
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.k-page,
.k-page :deep(input),
.k-page :deep(.v-btn),
.k-page :deep(.v-field),
.k-detail,
.k-lb {
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}

/* Hierarki teks */
.k-card-name {
  font-weight: 600;
  font-size: 13px;
  letter-spacing: -0.005em;
}
.k-card-price {
  font-weight: 800;
  font-size: 14px;
}
.k-cat-name {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.k-detail-name {
  letter-spacing: -0.01em;
}

.k-page {
  --k-red: #d32f2f;
  --k-red-dark: #b71c1c;
  --k-header-h: 56px;
  min-height: 100vh;
  background: radial-gradient(900px 380px at 10% -100px, rgba(211, 47, 47, 0.1), transparent 70%),
    radial-gradient(700px 320px at 100% 0, rgba(255, 171, 145, 0.16), transparent 70%), #faf6f4;
}
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
.k-container {
  max-width: 1360px;
  margin: 0 auto;
  padding: 16px 16px 40px;
}
.k-hint {
  font-size: 12px;
  color: #666;
  margin: 0 0 12px;
}
.k-swap-enter-active {
  transition: opacity 0.25s ease;
}
.k-swap-leave-active {
  transition: opacity 0.15s ease;
  position: absolute;
  width: 100%;
}
.k-swap-enter-from,
.k-swap-leave-to {
  opacity: 0;
}
.k-shop-main {
  position: relative;
}

.k-toolbar {
  position: sticky;
  top: var(--k-header-h);
  z-index: 40;
  background: rgba(250, 246, 244, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid #e8e8e8;
}
.k-toolbar-inner {
  max-width: 1360px;
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
}
.k-lengan-btn:hover {
  border-color: var(--k-red);
  color: var(--k-red);
  background: #fff5f5;
}
.k-lengan-btn:active {
  transform: scale(0.95);
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
  transform: translateY(-5px);
  box-shadow: 0 14px 28px rgba(183, 28, 28, 0.22);
  border-color: var(--k-red);
  outline: none;
}
.k-cat-card:active {
  transform: translateY(-1px) scale(0.985);
  transition-duration: 0.08s;
}
.k-cat-card:hover .k-cat-name {
  color: var(--k-red-dark);
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
  transform: translateY(-5px);
  box-shadow: 0 14px 28px rgba(183, 28, 28, 0.22);
  border-color: var(--k-red);
  outline: none;
}
.k-card:active {
  transform: translateY(-1px) scale(0.985);
  box-shadow: 0 4px 10px rgba(183, 28, 28, 0.2);
  transition-duration: 0.08s;
}
.k-card-img {
  position: relative;
  aspect-ratio: 1 / 1;
  background: #eee;
  overflow: hidden;
}
.k-card-price--na {
  font-size: 11px;
  font-weight: 600;
  color: #999;
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
.k-card-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
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
.k-card:hover .k-card-name {
  color: var(--k-red-dark);
}
.k-card-price {
  font-size: 13px;
  font-weight: 900;
  color: var(--k-red);
}
.k-sentinel {
  height: 1px;
}
.k-more {
  text-align: center;
  padding: 16px;
}

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

.k-skel {
  border-radius: 12px;
  background: linear-gradient(90deg, #ececec 25%, #f6f6f6 50%, #ececec 75%);
  background-size: 200% 100%;
  animation: k-shimmer 1.3s infinite linear;
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

.k-detail {
  border-radius: 16px;
  overflow: hidden;
}
.k-detail-bar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 44px;
  padding: 6px 6px 6px 14px;
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
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
}
.k-detail-price {
  font-size: 15px;
  font-weight: 900;
  color: var(--k-red);
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
  min-width: 36px;
  height: 34px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ffebee;
  color: var(--k-red-dark);
  border: 1px solid #ffcdd2;
}
.k-note {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin-top: 16px;
  padding: 10px;
  border-radius: 8px;
  background: #fff5f5;
  font-size: 11px;
  color: #666;
  line-height: 1.4;
}
.k-note a {
  color: var(--k-red);
  font-weight: 700;
}

.k-cat-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top; /* foto model: pertahankan bagian dada-kaos, potong bawah */
  transition: transform 0.35s ease;
}
.k-cat-card:hover .k-cat-cover img {
  transform: scale(1.1);
}
.k-cat-cover--mosaic {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
}
.k-cat-cover--mosaic img {
  object-position: center 20%;
}
@media (prefers-reduced-motion: reduce) {
  .k-cat-cover img {
    transition: none;
  }
}
.k-detail-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.k-detail-media {
  height: 340px;
}
.k-detail-media .k-carousel {
  height: 100%;
  margin-bottom: 0;
}
.k-detail-info {
  min-width: 0;
}
.k-price-list {
  display: flex;
  flex-direction: column;
  border: 1px solid #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
}
.k-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #f5f5f5;
}
.k-price-row:last-child {
  border-bottom: none;
}
.k-price-row:nth-child(even) {
  background: #fafafa;
}
.k-price-val {
  font-size: 13px;
  font-weight: 800;
  color: var(--k-red);
}
.k-price-val--na {
  font-size: 11px;
  font-weight: 600;
  color: #999;
}
@media (min-width: 700px) {
  .k-detail-layout {
    flex-direction: row;
    gap: 24px;
  }
  .k-detail-media {
    flex: 0 0 48%;
    height: 480px;
  }
  .k-detail-info {
    flex: 1;
  }
  .k-detail-name {
    font-size: 20px;
  }
  .k-detail-price {
    font-size: 18px;
  }
}

@media (min-width: 600px) {
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
  .k-cat-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .k-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
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
  .k-card:hover,
  .k-card:active,
  .k-cat-card:hover,
  .k-cat-card:active {
    transform: none;
  }
}

.k-card,
.k-cat-card {
  border-color: #f1e9e6;
  box-shadow: 0 1px 2px rgba(60, 30, 20, 0.05);
}

/* ============ TRANSISI HALAMAN ============ */
.k-page-enter-active {
  transition: opacity 0.32s ease, transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}
.k-page-leave-active {
  transition: opacity 0.16s ease;
}
.k-page-enter-from {
  opacity: 0;
  transform: translateY(14px);
}
.k-page-leave-to {
  opacity: 0;
}

.k-fade-enter-active {
  transition: opacity 0.3s ease;
}
.k-fade-leave-active {
  transition: opacity 0.14s ease;
}
.k-fade-enter-from,
.k-fade-leave-to {
  opacity: 0;
}

/* ============ GAMBAR: SHIMMER -> FADE-IN ============ */
.k-card-img .k-img-loading,
.k-card-img .k-img,
.k-card-img .k-tex {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.k-card-img .k-tex {
  opacity: 1;
  background: #f5f5f5;
}
.k-img {
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.5s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.k-img.is-loaded {
  opacity: 1;
}
.k-card:hover .k-img.is-loaded {
  transform: scale(1.08);
}

.k-cat-cover {
  background: linear-gradient(90deg, #ececec 25%, #f6f6f6 50%, #ececec 75%);
  background-size: 200% 100%;
  animation: k-shimmer 1.3s infinite linear;
}
.k-cat-cover img {
  opacity: 0;
  transition: opacity 0.5s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.k-cat-cover img.is-loaded {
  opacity: 1;
}

/* ============ DETAIL ============ */
.k-detail-media {
  position: relative;
}
.k-zoomable {
  cursor: zoom-in;
}
.k-zoom-hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 6px;
  border-radius: 999px;
  color: #fff;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(4px);
  pointer-events: none;
  transition: gap 0.2s ease, padding 0.2s ease, background 0.2s ease;
}
.k-zoom-hint-text {
  max-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
  transition: max-width 0.25s ease;
}
.k-detail-media:hover .k-zoom-hint {
  gap: 6px;
  padding: 6px 12px 6px 8px;
  background: rgba(0, 0, 0, 0.6);
}
.k-detail-media:hover .k-zoom-hint-text {
  max-width: 80px;
}

.k-price-cols {
  display: grid;
  gap: 10px;
  align-items: start;
}
.k-price-row {
  gap: 6px;
  padding: 6px 10px;
}
.k-price-row .k-size {
  min-width: 34px;
  height: 28px;
  padding: 0 6px;
  font-size: 11px;
}
.k-price-val {
  font-size: 12px;
}
.k-price-val--na {
  font-size: 10px;
}

@media (min-width: 700px) {
  .k-detail-media {
    flex: 0 0 42%;
    height: 460px;
  }
}

/* ============ LIGHTBOX ============ */
.k-lb {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.92);
  cursor: zoom-out;
  touch-action: pan-y;
}
.k-lb-img {
  max-width: 94vw;
  max-height: 92vh;
  object-fit: contain;
  border-radius: 6px;
  cursor: default;
  user-select: none;
  -webkit-user-drag: none;
}
.k-lb-btn {
  position: absolute;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(4px);
  cursor: pointer;
  transition: background 0.15s ease;
}
.k-lb-btn:hover {
  background: rgba(255, 255, 255, 0.28);
}
.k-lb-close {
  top: 16px;
  right: 16px;
}
.k-lb-prev {
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
}
.k-lb-next {
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
}
.k-lb-count {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
}

/* Buka/tutup: backdrop fade, gambar melesat dari/ke posisi thumbnail */
.k-lb-enter-active,
.k-lb-leave-active {
  transition: opacity 0.3s ease;
}
.k-lb-enter-from,
.k-lb-leave-to {
  opacity: 0;
}
.k-lb-enter-active .k-lb-img,
.k-lb-leave-active .k-lb-img {
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}
.k-lb-enter-from .k-lb-img,
.k-lb-leave-to .k-lb-img {
  transform: translate(var(--dx, 0px), var(--dy, 0px)) scale(0.45);
}

/* Ganti gambar di dalam lightbox */
.k-lb-slide-enter-active,
.k-lb-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.k-lb-slide-enter-from {
  opacity: 0;
  transform: translateX(calc(var(--dir, 1) * 40px));
}
.k-lb-slide-leave-to {
  opacity: 0;
  transform: translateX(calc(var(--dir, 1) * -40px));
}

@media (prefers-reduced-motion: reduce) {
  .k-page-enter-active,
  .k-page-leave-active,
  .k-fade-enter-active,
  .k-fade-leave-active,
  .k-lb-enter-active,
  .k-lb-leave-active,
  .k-lb-slide-enter-active,
  .k-lb-slide-leave-active,
  .k-img,
  .k-cat-cover img {
    transition: none !important;
  }
}
.k-hero {
  position: relative;
  overflow: hidden;
  background: #e9e1dd;
  border-radius: 0;
  box-shadow: 0 10px 30px rgba(60, 30, 20, 0.14);
}
/* Desktop: 8 foto sebaris, tiap foto berbentuk potret, tinggi hero jauh lebih pendek */
.k-hero-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: 1fr;
  gap: 2px;
  height: clamp(220px, 20vw, 340px);
}
.k-hero-overlay {
  padding: 28px max(20px, calc((100vw - 1360px) / 2 + 16px));
}
.k-hero-title {
  font-size: clamp(28px, 4vw, 52px);
}
@media (max-width: 959px) {
  .k-hero-grid {
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(2, 1fr);
    height: 280px;
  }
  .k-hero-overlay {
    padding: 16px;
    background: linear-gradient(
      0deg,
      rgba(20, 8, 6, 0.8) 0%,
      rgba(20, 8, 6, 0.2) 65%,
      transparent 100%
    );
  }
}
.k-hero-tile {
  position: relative;
  overflow: hidden;
  background: #ddd;
  opacity: 0;
  animation: k-fade-up 0.6s ease forwards;
  animation-delay: calc(var(--i, 0) * 70ms);
}
.k-hero-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  opacity: 0;
  transform: scale(1.06);
  transition: opacity 0.6s ease, transform 6s ease-out;
}
.k-hero-tile img.is-loaded {
  opacity: 1;
  transform: scale(1);
}

/* Overlay teks: gradasi gelap dari kiri supaya teks terbaca di atas foto apa pun */
.k-hero-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  opacity: 0.85;
  margin-bottom: 6px;
}
.k-hero-title {
  margin: 0;
  max-width: 14ch;
  font-family: "Playfair Display", Georgia, "Times New Roman", serif;
  font-weight: 600;
  font-size: clamp(28px, 5.2vw, 58px);
  line-height: 1.05;
  letter-spacing: -0.01em;
}
.k-hero-title em {
  font-style: italic;
  font-weight: 500;
}
.k-hero-sub {
  margin: 10px 0 16px;
  max-width: 34ch;
  font-size: clamp(12px, 1.4vw, 15px);
  line-height: 1.5;
  opacity: 0.92;
}
.k-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.k-hero-btn {
  padding: 9px 18px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  border: 1.5px solid #fff;
  transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.k-hero-btn:hover {
  transform: translateY(-1px);
}
.k-hero-btn--solid {
  background: #fff;
  color: var(--k-red-dark);
}
.k-hero-btn--ghost {
  background: transparent;
  color: #fff;
}
.k-hero-btn--ghost:hover {
  background: rgba(255, 255, 255, 0.16);
}
.k-side .k-search {
  max-width: none;
  width: 100%;
  margin-left: 0;
}

@media (prefers-reduced-motion: reduce) {
  .k-hero-tile,
  .k-hero-tile img {
    animation: none;
    opacity: 1;
    transform: none;
    transition: none;
  }
}

/* Grid kategori: 5 kolom di layar lebar */
@media (min-width: 1280px) {
  .k-cat-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

/* ============ HERO ============ */
.k-hero {
  position: relative;
  overflow: hidden;
  background: #e9e1dd;
  box-shadow: 0 10px 30px rgba(60, 30, 20, 0.14);
}
.k-hero-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  height: clamp(220px, 20vw, 340px);
}
.k-hero-tile {
  position: relative;
  overflow: hidden;
  background: #ddd;
  opacity: 0;
  animation: k-fade-up 0.6s ease forwards;
  animation-delay: calc(var(--i, 0) * 70ms);
}
.k-hero-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  opacity: 0;
  transform: scale(1.06);
  transition: opacity 0.6s ease, transform 6s ease-out;
}
.k-hero-tile img.is-loaded {
  opacity: 1;
  transform: scale(1);
}

.k-hero-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 28px max(20px, calc((100vw - 1360px) / 2 + 16px));
  color: #fff;
  background: linear-gradient(
      90deg,
      rgba(20, 8, 6, 0.72) 0%,
      rgba(20, 8, 6, 0.35) 45%,
      transparent 75%
    ),
    linear-gradient(0deg, rgba(20, 8, 6, 0.5) 0%, transparent 45%);
}
.k-hero-eyebrow {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  opacity: 0.85;
}
.k-hero-title {
  margin: 0;
  max-width: 14ch;
  font-family: "Playfair Display", Georgia, "Times New Roman", serif;
  font-size: clamp(28px, 4vw, 52px);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.01em;
}
.k-hero-title em {
  font-style: italic;
  font-weight: 500;
}
.k-hero-sub {
  margin: 10px 0 16px;
  max-width: 34ch;
  font-size: clamp(12px, 1.4vw, 15px);
  line-height: 1.5;
  opacity: 0.92;
}
.k-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.k-hero-btn {
  padding: 9px 18px;
  border: 1.5px solid #fff;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}
.k-hero-btn:hover {
  transform: translateY(-1px);
}
.k-hero-btn--solid {
  background: #fff;
  color: var(--k-red-dark);
}
.k-hero-btn--ghost {
  background: transparent;
  color: #fff;
}
.k-hero-btn--ghost:hover {
  background: rgba(255, 255, 255, 0.16);
}

@media (max-width: 959px) {
  .k-hero-grid {
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(2, 1fr);
    height: 280px;
  }
  .k-hero-overlay {
    padding: 16px;
    background: linear-gradient(
      0deg,
      rgba(20, 8, 6, 0.8) 0%,
      rgba(20, 8, 6, 0.2) 65%,
      transparent 100%
    );
  }
}
@media (prefers-reduced-motion: reduce) {
  .k-hero-tile,
  .k-hero-tile img {
    animation: none;
    opacity: 1;
    transform: none;
    transition: none;
  }
}

/* ============ LAYOUT DENGAN SIDEBAR ============ */
.k-shop--side {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}
.k-shop-main {
  position: relative;
  min-width: 0;
}
.k-side {
  position: sticky;
  top: calc(var(--k-header-h) + 16px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.k-side-title {
  margin-top: 14px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eadfda;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6f6663;
}
.k-side-list {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 420px);
  min-height: 120px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.k-side-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  border-left: 3px solid transparent;
  background: none;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: #3a3231;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, padding-left 0.15s ease,
    color 0.15s ease;
}
.k-side-item small {
  font-size: 11px;
  font-weight: 600;
  color: #9a908c;
}
.k-side-item:hover {
  padding-left: 14px;
  border-left-color: rgba(211, 47, 47, 0.45);
  background: rgba(211, 47, 47, 0.1);
  color: var(--k-red-dark);
}
.k-side-item:active {
  background: rgba(211, 47, 47, 0.18);
}
.k-side-item--active {
  border-left-color: var(--k-red);
  background: rgba(211, 47, 47, 0.08);
  color: var(--k-red-dark);
  font-weight: 800;
}
.k-lengan--wrap {
  flex-wrap: wrap;
}

/* Kolom produk menyesuaikan lebar area setelah sidebar */
@media (min-width: 960px) {
  .k-shop--side .k-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (min-width: 1280px) {
  .k-shop--side .k-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (min-width: 1700px) {
  .k-shop--side .k-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}
@media (hover: none) {
  .k-card:hover,
  .k-cat-card:hover {
    transform: none;
    box-shadow: 0 1px 2px rgba(60, 30, 20, 0.05);
    border-color: #f1e9e6;
  }
  .k-card:hover .k-img.is-loaded,
  .k-cat-card:hover .k-cat-cover img {
    transform: none;
  }
}

.k-hero-overlay {
  padding: 28px max(20px, calc((100vw - 1360px) / 2 + 16px));
}
.k-hero-title {
  font-size: clamp(28px, 4vw, 52px);
}
@media (max-width: 959px) {
  .k-hero-overlay {
    padding: 16px;
    background: linear-gradient(
      0deg,
      rgba(20, 8, 6, 0.8) 0%,
      rgba(20, 8, 6, 0.2) 65%,
      transparent 100%
    );
  }
}
</style>

<style>
/* Dialog detail: desktop = naik + zoom halus, HP = bottom sheet */
.k-dialog-enter-active {
  transition: opacity 0.3s ease, transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}
.k-dialog-leave-active {
  transition: opacity 0.18s ease, transform 0.22s ease-in;
}
.k-dialog-enter-from,
.k-dialog-leave-to {
  opacity: 0;
  transform: translateY(24px) scale(0.96);
}

.k-sheet-enter-active {
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}
.k-sheet-leave-active {
  transition: transform 0.26s ease-in;
}
.k-sheet-enter-from,
.k-sheet-leave-to {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .k-dialog-enter-active,
  .k-dialog-leave-active,
  .k-sheet-enter-active,
  .k-sheet-leave-active {
    transition: none !important;
  }
}
</style>

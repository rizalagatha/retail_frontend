<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import api from "@/services/api";
import LogoKaosan from "@/assets/logo.png";
import SiteFooter from "@/components/SiteFooter.vue";
import ProductPlaceholder from "@/components/ProductPlaceholder.vue";
import { isKiosk } from "@/composables/useKiosk";
import { PREMIUM_FABRICS } from "@/data/premiumFabrics";

import "@fontsource-variable/cormorant";
import "@fontsource-variable/cormorant/wght-italic.css";
import "@fontsource-variable/jost";

interface CatalogRow {
  kode: string;
  jenis_kain: string;
  jenis_kaos: string;
  lengan: string;
  ktg: string;
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
const { mdAndUp } = useDisplay();

const ROUTE_NAME = "Katalog";
const homePath = computed(() => (isKiosk.value ? "/kiosk" : "/"));
const fromPremium = computed(() => route.query.from === "premium");

watch(fromPremium, (v) => document.documentElement.classList.toggle("theme-premium", v), {
  immediate: true,
});

// Cocokkan nama produk ke kain premium (kata kunci terpanjang menang)
const premiumFabricOf = (namaUp: string): string | null => {
  let best: string | null = null;
  let bestLen = 0;
  for (const f of PREMIUM_FABRICS) {
    for (const k of f.kata) {
      const key = k.toUpperCase();
      if (namaUp.includes(key) && key.length > bestLen) {
        best = f.nama;
        bestLen = key.length;
      }
    }
  }
  return best;
};
const premiumOrder = (nama: string) => PREMIUM_FABRICS.findIndex((f) => f.nama === nama);

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

const allProducts = computed<Product[]>(() =>
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
    if ((r.ktg || "").trim().toUpperCase() === "KIDDIFY") kategori = "KIDDIFY";
    else if (namaUp.includes("ANAK") || kaosUp.includes("ANAK") || namaUp.includes("KIDS"))
      kategori = "KAOS ANAK";
    else if (namaUp.includes("TUNIK") || kaosUp.includes("TUNIK")) kategori = "TUNIK";

    if (fromPremium.value) kategori = premiumFabricOf(namaUp) ?? "";

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

    // Foto kartu = foto utama (galeri pertama), fallback ke gambar_url
    const coverIndex = 0;
    const gambar = galeri.length ? galeri[0].url : r.gambar_url;

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

// Mode Premium: hanya produk yang cocok dengan salah satu kain premium
const products = computed(() =>
  fromPremium.value ? allProducts.value.filter((p) => p.kategori) : allProducts.value
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
    // Cover & hero memakai foto utama (galeri pertama), bukan foto acak
    const mainPhoto = (p: Product) => p.galeri[0]?.url ?? p.gambar;

    list.forEach((p) => {
      const main = mainPhoto(p);
      if (!main) return;
      if (!groups.has(p.kategori)) groups.set(p.kategori, []);
      groups.get(p.kategori)!.push(main);
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
        list.map(mainPhoto).filter((g): g is string => !!g && !hero.includes(g))
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
      if (fromPremium.value) return premiumOrder(a) - premiumOrder(b);
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
const searchInput = ref(String(route.query.q || ""));
const searchTerm = ref(searchInput.value.trim());
const lenganOptions = [
  { label: "Semua", value: "SEMUA" },
  { label: "Pendek", value: "PENDEK" },
  { label: "Panjang", value: "PANJANG" },
];

const setLengan = (v: string) =>
  router.replace({
    query: {
      ...route.query,
      q: searchTerm.value || undefined,
      lengan: v === "SEMUA" ? undefined : v,
    },
  });

// Simpan kata kunci di URL (agar bisa dibagikan) tanpa memicu router,
// supaya halaman tidak dirender ulang dan fokus kolom tidak hilang
const syncSearchToUrl = (q: string) => {
  const url = new URL(window.location.href);
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  window.history.replaceState(window.history.state, "", url);
};

let searchTimer: ReturnType<typeof setTimeout>;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTerm.value = v?.trim() || "";
    syncSearchToUrl(searchTerm.value);
  }, 400);
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
  return data.sort(
    (a, b) =>
      Number(!a.gambar) - Number(!b.gambar) || a.urutan - b.urutan || a.nama.localeCompare(b.nama)
  );
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

// Pintasan "/" untuk fokus ke kolom pencarian (desktop)
const searchEl = ref<HTMLInputElement | null>(null);
const onSlashKey = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (e.key !== "/" || tag === "INPUT" || tag === "TEXTAREA") return;
  e.preventDefault();
  searchEl.value?.focus();
};

// --- Gambar: fade-in saat selesai dimuat ---
const imgFailed = reactive<Record<string, boolean>>({});
const onImgLoad = (e: Event) => (e.target as HTMLImageElement).classList.add("is-loaded");

// --- Navigasi ---
const pilihKategori = (nama: string) =>
  router.push({
    name: ROUTE_NAME,
    params: { kategori: nama === "ALL" ? "semua" : nama },
    query: { ...route.query, q: searchTerm.value || undefined },
  });

const goBack = () => {
  if (fromPremium.value) {
    router.push({ path: "/kiosk/premium", query: { kain: route.query.kain } });
    return;
  }
  if (phase.value === "products") router.push({ name: ROUTE_NAME });
  else router.push(homePath.value);
};
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

// Kunci gulir halaman saat panel terbuka, Esc menutup panel (lightbox punya Esc sendiri)
watch(detailVisible, (v) => {
  document.documentElement.style.overflow = v ? "hidden" : "";
});
const onDrawerKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && detailVisible.value && !lightboxOpen.value) detailVisible.value = false;
};

onMounted(() => {
  document.title = "Katalog Produk - Kaosan";
  loadCatalog();
  window.addEventListener("keydown", onDrawerKey);
  window.addEventListener("keydown", onLbKey, true);
  window.addEventListener("keydown", onSlashKey);
});
onUnmounted(() => {
  observer?.disconnect();
  clearTimeout(searchTimer);
  window.removeEventListener("keydown", onDrawerKey);
  document.documentElement.style.overflow = "";
  document.documentElement.classList.remove("theme-premium");
  window.removeEventListener("keydown", onLbKey, true);
  window.removeEventListener("keydown", onSlashKey);
});
</script>

<template>
  <div class="k-page" :class="{ 'k-page--premium': fromPremium }">
    <header class="k-header">
      <v-btn icon variant="text" size="small" aria-label="Kembali" @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="k-header-title">
        <div class="k-title">{{ fromPremium ? "Premium Collection" : "Katalog Produk" }}</div>
        <div class="k-sub">
          {{
            phase === "category"
              ? "Pilih jenis kain"
              : selectedKategori === "ALL"
              ? fromPremium
                ? "Semua kain premium"
                : "Semua kategori"
              : selectedKategori
          }}
        </div>
      </div>
      <v-spacer />
      <router-link :to="homePath" class="k-home-link"
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
                  <ProductPlaceholder v-else />
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
              <router-link :to="{ name: ROUTE_NAME, query: route.query }" class="k-chip">
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
            <label class="k-searchbox">
              <v-icon size="18" class="k-searchbox-icon">mdi-magnify</v-icon>
              <input
                ref="searchEl"
                v-model="searchInput"
                type="search"
                class="k-searchbox-input"
                placeholder="Cari kaos atau warna"
                autocomplete="off"
                aria-label="Cari produk"
              />
              <button
                v-if="searchInput"
                type="button"
                class="k-searchbox-clear"
                aria-label="Hapus pencarian"
                @click.prevent="searchInput = ''"
              >
                <v-icon size="14">mdi-close</v-icon>
              </button>
              <kbd v-else class="k-searchbox-key">/</kbd>
            </label>

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

            <router-link :to="{ path: '/tracking', query: { bantuan: '1' } }" class="k-side-help">
              <v-icon size="16">mdi-headset</v-icon>
              Butuh bantuan? Hubungi store
            </router-link>
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
                      <div v-if="p.gambar && !imgFailed[p.kode]" class="k-img-loading"></div>
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
                      <ProductPlaceholder v-else class="k-ph" />
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

    <SiteFooter max-width="1360px" :dark="fromPremium" />

    <!-- ============ DETAIL PRODUK ============ -->
    <Teleport to="body">
      <Transition name="k-drawer">
        <div
          v-if="detailVisible && selected"
          class="k-drawer-wrap"
          @click.self="detailVisible = false"
        >
          <aside
            class="k-detail k-drawer"
            :class="{ 'k-detail--premium': fromPremium }"
            role="dialog"
            aria-modal="true"
          >
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

            <div class="k-drawer-body">
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
                  <ProductPlaceholder />
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
                    :style="{
                      gridTemplateColumns: `repeat(${priceColumns.length}, minmax(0, 1fr))`,
                    }"
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
          </aside>
        </div>
      </Transition>
    </Teleport>

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

<style scoped src="../../styles/katalog.css"></style>
<style src="../../styles/katalog-global.css"></style>

<style scoped>
/* ===== Tema Premium (aktif bila datang dari halaman Premium) ===== */
.k-page--premium {
  --k-red: #d8bd84;
  --k-red-dark: #e6cf98;
  color: #f3e8d2;
  font-family: "Jost Variable", system-ui, sans-serif;
  background: radial-gradient(900px 600px at 78% 10%, rgba(160, 110, 40, 0.16), transparent 70%),
    radial-gradient(700px 500px at 0% 100%, rgba(120, 18, 18, 0.28), transparent 70%), #0e0605;
}
.k-page--premium .k-header {
  background: #0e0605;
  border-bottom: 1px solid rgba(216, 189, 132, 0.28);
  box-shadow: none;
}
.k-page--premium .k-title {
  font-family: "Cormorant Variable", Georgia, serif;
  font-size: 22px;
  font-weight: 600;
  color: #e6cf98;
}
.k-page--premium .k-sub {
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(243, 232, 210, 0.6);
}
.k-page--premium .k-hint,
.k-page--premium .k-count {
  color: rgba(243, 232, 210, 0.6);
}

/* Kartu produk */
.k-page--premium .k-card {
  background: #170e0b;
  border-color: rgba(216, 189, 132, 0.18);
  box-shadow: none;
}
.k-page--premium .k-card:hover,
.k-page--premium .k-card:focus-visible {
  border-color: #d8bd84;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(216, 189, 132, 0.35);
}
.k-page--premium .k-card-name {
  font-family: "Cormorant Variable", Georgia, serif;
  font-size: 16px;
  font-weight: 600;
  color: #f3e8d2;
}
.k-page--premium .k-card:hover .k-card-name {
  color: #e6cf98;
}
.k-page--premium .k-card-price {
  font-weight: 500;
  letter-spacing: 0.04em;
  color: #d8bd84;
}
.k-page--premium .k-card-price--na {
  color: rgba(243, 232, 210, 0.45);
}
.k-page--premium .k-card-img {
  background: #241714;
}

/* Sidebar */
.k-page--premium .k-side-title {
  font-weight: 500;
  letter-spacing: 0.26em;
  color: #d8bd84;
  border-bottom-color: rgba(216, 189, 132, 0.25);
}
.k-page--premium .k-side-item {
  color: rgba(243, 232, 210, 0.75);
}
.k-page--premium .k-side-item small {
  color: rgba(243, 232, 210, 0.4);
}
.k-page--premium .k-side-item:hover,
.k-page--premium .k-side-item--active {
  color: #e6cf98;
  background: rgba(216, 189, 132, 0.1);
  border-left-color: #d8bd84;
}
.k-page--premium .k-side-help {
  color: rgba(243, 232, 210, 0.6);
}
.k-page--premium .k-side-help:hover {
  color: #e6cf98;
}

/* Pencarian dan filter */
.k-page--premium .k-searchbox {
  background: #170e0b;
  box-shadow: 0 0 0 1px rgba(216, 189, 132, 0.3);
}
.k-page--premium .k-searchbox:focus-within {
  box-shadow: 0 0 0 1px #d8bd84, 0 6px 18px rgba(216, 189, 132, 0.14);
}
.k-page--premium .k-searchbox-input {
  color: #f3e8d2;
}
.k-page--premium .k-searchbox-input::placeholder,
.k-page--premium .k-searchbox-icon {
  color: rgba(243, 232, 210, 0.45);
}
.k-page--premium .k-searchbox-key,
.k-page--premium .k-searchbox-clear {
  color: #d8bd84;
  background: rgba(216, 189, 132, 0.12);
  box-shadow: none;
}
.k-page--premium .k-lengan-btn {
  color: rgba(243, 232, 210, 0.7);
  background: transparent;
  border-color: rgba(216, 189, 132, 0.3);
}
.k-page--premium .k-lengan-btn:hover {
  color: #e6cf98;
  background: rgba(216, 189, 132, 0.08);
}
.k-page--premium .k-lengan-btn--active {
  color: #1a0d0b !important;
  background: #d8bd84 !important;
  border-color: #d8bd84 !important;
}

/* Toolbar HP, status kosong, skeleton */
.k-page--premium .k-toolbar {
  background: rgba(14, 6, 5, 0.94);
  border-bottom-color: rgba(216, 189, 132, 0.2);
}
.k-page--premium .k-chip {
  color: #e6cf98;
  background: rgba(216, 189, 132, 0.1);
  border-color: rgba(216, 189, 132, 0.3);
}
.k-page--premium .k-state {
  color: #f3e8d2;
  background: #170e0b;
  border-color: rgba(216, 189, 132, 0.2);
}
.k-page--premium .k-state-title {
  color: #f3e8d2;
}
.k-page--premium .k-skel {
  background: linear-gradient(90deg, #1d1411 25%, #2a1c17 50%, #1d1411 75%);
  background-size: 200% 100%;
}

/* ===== Dialog detail ===== */
.k-detail--premium {
  color: #f3e8d2 !important;
  background: #120a08 !important;
  border: 1px solid rgba(216, 189, 132, 0.35);
  font-family: "Jost Variable", system-ui, sans-serif;
}
.k-detail--premium .k-detail-bar {
  background: linear-gradient(135deg, #1d0f0c, #0e0605) !important;
  border-bottom: 1px solid rgba(216, 189, 132, 0.35);
}
.k-detail--premium .k-detail-bar-title {
  font-family: "Cormorant Variable", Georgia, serif;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #e6cf98;
}
.k-detail--premium .k-detail-bar :deep(.v-btn) {
  color: #e6cf98 !important;
}
.k-detail--premium .k-detail-name {
  font-family: "Cormorant Variable", Georgia, serif;
  font-size: 26px;
  font-weight: 600;
  color: #f3e8d2;
}
.k-detail--premium .k-detail-price,
.k-detail--premium .k-price-val {
  font-weight: 500;
  color: #e6cf98;
}
.k-detail--premium .k-price-val--na {
  color: rgba(243, 232, 210, 0.45);
}
.k-detail--premium .k-detail-label {
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #d8bd84;
  border-top-color: rgba(216, 189, 132, 0.25);
}
.k-detail--premium .k-price-list {
  border-color: rgba(216, 189, 132, 0.22);
}
.k-detail--premium .k-price-row {
  background: transparent;
  border-bottom-color: rgba(216, 189, 132, 0.12);
}
.k-detail--premium .k-price-row:nth-child(even) {
  background: rgba(216, 189, 132, 0.05);
}
.k-detail--premium .k-size {
  color: #e6cf98;
  background: rgba(216, 189, 132, 0.12);
  border-color: rgba(216, 189, 132, 0.35);
}
.k-detail--premium .k-carousel {
  background: #241714;
  border-color: rgba(216, 189, 132, 0.25);
}
.k-detail--premium .k-note {
  color: rgba(243, 232, 210, 0.75);
  background: rgba(216, 189, 132, 0.08);
}
.k-detail--premium .k-note a {
  color: #e6cf98;
}
</style>

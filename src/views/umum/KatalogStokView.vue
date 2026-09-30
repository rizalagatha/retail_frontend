<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import api from "@/services/api";
import LogoKaosan from "@/assets/logo.png";
import SiteFooter from "@/components/SiteFooter.vue";
import ProductPlaceholder from "@/components/ProductPlaceholder.vue";
import { isKiosk, PAMERAN_KODE } from "@/composables/useKiosk";

interface StokRow {
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

interface SizeStock {
  ukuran: string;
  harga: number;
  stok: number;
}

interface Product {
  kode: string;
  nama: string;
  kategori: string;
  lengan: string;
  hargaMin: number;
  hargaMax: number;
  totalStok: number;
  terjual: number;
  sizes: SizeStock[];
  gambar: string | null;
  urutan: number;
  galeri: { url: string; index: number }[];
  coverIndex: number;
}

type StokState = "ok" | "low" | "out";

const route = useRoute();
const router = useRouter();
const { xs, mdAndUp } = useDisplay();

const ROUTE_NAME = "Katalog Stok";
const POLL_MS = 20_000;
const HANYA_ADA_STOK = true; // false = barang habis tetap tampil dengan label "Habis"
const STOK_MENIPIS_TOTAL = 5; // total semua ukuran <= ini: "Sisa sedikit"
const STOK_MENIPIS_UKURAN = 3; // stok satu ukuran <= ini: oranye

const homePath = computed(() => (isKiosk.value ? "/kiosk" : "/"));
const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(n) || 0)}`;

const formatHarga = (min: number, max: number) => {
  if (!max || max <= 0) return null;
  if (min === max) return rp(min);
  return `${rp(min)} - ${new Intl.NumberFormat("id-ID").format(max)}`;
};

// --- Fase dari URL ---
const kategoriParam = computed(() => (route.params.kategori as string) || "");
const phase = computed<"category" | "products">(() =>
  kategoriParam.value ? "products" : "category"
);
const selectedKategori = computed(() =>
  kategoriParam.value === "semua" ? "ALL" : kategoriParam.value
);

// --- Data (stok B02, disegarkan berkala) ---
const rows = ref<StokRow[]>([]);
const isLoading = ref(true);
const hasError = ref(false);

const loadStok = async (silent = false) => {
  if (!silent) {
    isLoading.value = true;
    hasError.value = false;
  }
  try {
    const { data } = await api.get("/so/public/cek-stok", {
      params: { cabang: PAMERAN_KODE, q: "" },
    });
    rows.value = data;
  } catch {
    if (!silent) hasError.value = true;
  } finally {
    if (!silent) isLoading.value = false;
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

// Foto kartu dipilih sekali per kode, agar tidak berganti tiap stok disegarkan
const coverPick = new Map<string, number>();
const pickCover = (kode: string, total: number) => {
  if (!total) return 0;
  if (!coverPick.has(kode)) coverPick.set(kode, Math.floor(Math.random() * total));
  return coverPick.get(kode)!;
};

const products = computed<Product[]>(() => {
  const map = new Map<string, Product>();

  rows.value.forEach((r) => {
    let p = map.get(r.kode);
    if (!p) {
      let galeri: { url: string; index: number }[] = [];
      try {
        galeri = r.galeri ? (typeof r.galeri === "string" ? JSON.parse(r.galeri) : r.galeri) : [];
      } catch {
        galeri = [];
      }

      let kategori = (r.jenis_kain || "").trim() || "LAIN-LAIN";
      const namaUp = (r.nama || "").toUpperCase();
      const kaosUp = (r.jenis_kaos || "").toUpperCase();
      if (namaUp.includes("ANAK") || kaosUp.includes("ANAK") || namaUp.includes("KIDS"))
        kategori = "KAOS ANAK";
      else if (namaUp.includes("TUNIK") || kaosUp.includes("TUNIK")) kategori = "TUNIK";

      const coverIndex = pickCover(r.kode, galeri.length);
      p = {
        kode: r.kode,
        nama: r.nama,
        kategori,
        lengan: (r.lengan || "").toUpperCase(),
        hargaMin: 0,
        hargaMax: 0,
        totalStok: 0,
        terjual: 0,
        sizes: [],
        gambar: galeri.length ? galeri[coverIndex].url : r.gambar_url ?? null,
        urutan: r.urutan || 9999,
        galeri,
        coverIndex,
      };
      map.set(r.kode, p);
    }

    const stok = Math.max(0, Number(r.stok) || 0);
    p.sizes.push({ ukuran: r.ukuran, harga: Number(r.harga) || 0, stok });
    p.totalStok += stok;
    p.terjual += Number(r.total_terjual) || 0;
  });

  map.forEach((p) => {
    p.sizes.sort((a, b) => sizeRank(a.ukuran) - sizeRank(b.ukuran));
    const prices = p.sizes.map((s) => s.harga).filter((h) => h > 0);
    p.hargaMin = prices.length ? Math.min(...prices) : 0;
    p.hargaMax = prices.length ? Math.max(...prices) : 0;
  });

  return [...map.values()];
});

const stocked = computed(() =>
  HANYA_ADA_STOK ? products.value.filter((p) => p.totalStok > 0) : products.value
);

const totalPcs = computed(() => stocked.value.reduce((sum, p) => sum + p.totalStok, 0));

// --- Cover & hero (dipilih sekali saat data pertama tiba) ---
const coverMap = ref<Record<string, string>>({});
const semuaCovers = ref<string[]>([]);
const heroImages = ref<string[]>([]);
const panelImages = ref<string[]>([]);

const shuffle = <T>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const mainPhoto = (p: Product) => p.galeri[0]?.url ?? p.gambar;

let coversReady = false;
watch(
  stocked,
  (list) => {
    if (coversReady || !list.length) return;
    coversReady = true;

    const groups = new Map<string, string[]>();
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
    semuaCovers.value = shuffle(Object.values(picked)).slice(0, 4);

    const hero = shuffle(Object.values(picked)).slice(0, 8);
    if (hero.length < 8) {
      const extra = shuffle(
        list.map(mainPhoto).filter((g): g is string => !!g && !hero.includes(g))
      );
      hero.push(...extra.slice(0, 8 - hero.length));
    }
    heroImages.value = hero;
    panelImages.value = shuffle([
      ...new Set(list.map(mainPhoto).filter((g): g is string => !!g)),
    ]).slice(0, 12);
  },
  { immediate: true }
);

// Dua kolom foto untuk panel kiri; tiap kolom diulang sampai cukup panjang agar loop tidak bolong
const panelColumns = computed(() => {
  const half = Math.ceil(panelImages.value.length / 2);
  return [panelImages.value.slice(0, half), panelImages.value.slice(half)]
    .filter((c) => c.length)
    .map((c) => {
      let col = c;
      while (col.length < 4) col = [...col, ...c];
      return col;
    });
});

const kategoriList = computed(() => {
  const count: Record<string, number> = {};
  stocked.value.forEach((p) => {
    count[p.kategori] = (count[p.kategori] || 0) + 1;
  });
  return Object.keys(count)
    .sort((a, b) => {
      if (a === "LAIN-LAIN") return 1;
      if (b === "LAIN-LAIN") return -1;
      return count[b] - count[a];
    })
    .map((nama) => ({ nama, jumlah: count[nama], cover: coverMap.value[nama] || null }));
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

// Kata kunci disimpan di URL tanpa memicu router, agar fokus kolom tidak hilang
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
  let data = [...stocked.value];
  if (selectedKategori.value !== "ALL")
    data = data.filter((p) => p.kategori === selectedKategori.value);
  if (lengan.value !== "SEMUA") data = data.filter((p) => p.lengan.includes(lengan.value));
  if (searchTerm.value) {
    const q = searchTerm.value.toLowerCase();
    data = data.filter((p) => p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q));
  }
  return data.sort(
    (a, b) =>
      Number(!a.gambar) - Number(!b.gambar) ||
      a.urutan - b.urutan ||
      b.terjual - a.terjual ||
      a.nama.localeCompare(b.nama)
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
  const el = sentinel.value;
  if (el && observer) {
    observer.unobserve(el);
    nextTick(() => observer?.observe(el));
  }
};

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

// Stagger kartu hanya sekali saat masuk ke halaman produk
const firstGrid = ref(true);
watch(selectedKategori, () => {
  firstGrid.value = false;
});
watch(phase, (p) => {
  if (p === "category") firstGrid.value = true;
});

const scrollTop = () => window.scrollTo({ top: 0 });

const searchEl = ref<HTMLInputElement | null>(null);
const onSlashKey = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (e.key !== "/" || tag === "INPUT" || tag === "TEXTAREA") return;
  e.preventDefault();
  searchEl.value?.focus();
};

const imgFailed = reactive<Record<string, boolean>>({});
const onImgLoad = (e: Event) => (e.target as HTMLImageElement).classList.add("is-loaded");

// --- Status stok ---
const totalState = (n: number): StokState =>
  n <= 0 ? "out" : n <= STOK_MENIPIS_TOTAL ? "low" : "ok";
const sizeState = (n: number): StokState =>
  n <= 0 ? "out" : n <= STOK_MENIPIS_UKURAN ? "low" : "ok";
const sizeLabel = (n: number) =>
  n <= 0 ? "Habis" : n <= STOK_MENIPIS_UKURAN ? `Sisa ${n}` : `${n} pcs`;

// --- Navigasi ---
const pilihKategori = (nama: string) =>
  router.push({
    name: ROUTE_NAME,
    params: { kategori: nama === "ALL" ? "semua" : nama },
    query: { ...route.query, q: searchTerm.value || undefined },
  });
const goBack = () =>
  phase.value === "products" ? router.push({ name: ROUTE_NAME }) : router.push(homePath.value);

const headerSub = computed(() =>
  phase.value === "category"
    ? "Pilih jenis kain"
    : selectedKategori.value === "ALL"
    ? "Semua kategori"
    : selectedKategori.value
);

// --- Detail (dibaca dari data terbaru, jadi stok di dialog ikut berubah) ---
const detailVisible = ref(false);
const selectedKode = ref<string | null>(null);
const selected = computed(() => products.value.find((p) => p.kode === selectedKode.value) ?? null);
const detailIndex = ref(0);

const openDetail = (p: Product) => {
  selectedKode.value = p.kode;
  detailIndex.value = p.coverIndex;
  detailVisible.value = true;
};

const selectedHarga = computed(() =>
  selected.value ? formatHarga(selected.value.hargaMin, selected.value.hargaMax) : null
);

const detailImages = computed<string[]>(() => {
  const s = selected.value;
  if (!s) return [];
  if (s.galeri.length) return s.galeri.map((g) => g.url);
  return s.gambar ? [s.gambar] : [];
});

// Ukuran dipecah per kolom (maksimal 7); di HP satu kolom saja
const perColumn = computed(() => (xs.value ? 20 : 7));
const sizeColumns = computed(() => {
  const list = selected.value?.sizes ?? [];
  const cols: SizeStock[][] = [];
  for (let i = 0; i < list.length; i += perColumn.value) {
    cols.push(list.slice(i, i + perColumn.value));
  }
  return cols;
});

// --- Lightbox ---
const lightboxOpen = ref(false);
const lbDx = ref(0);
const lbDy = ref(0);
const lbDir = ref(1);

const openLightbox = (index: number, e?: Event) => {
  const el = e?.currentTarget as HTMLElement | null;
  if (el) {
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

let pollTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  document.title = "Stok Pameran - Kaosan";
  loadStok();
  pollTimer = setInterval(() => {
    if (!document.hidden) loadStok(true);
  }, POLL_MS);
  window.addEventListener("keydown", onLbKey, true);
  window.addEventListener("keydown", onSlashKey);
});
onUnmounted(() => {
  observer?.disconnect();
  clearTimeout(searchTimer);
  clearInterval(pollTimer);
  window.removeEventListener("keydown", onLbKey, true);
  window.removeEventListener("keydown", onSlashKey);
});
</script>

<template>
  <div class="k-page">
    <header class="k-header">
      <v-btn icon variant="text" size="small" aria-label="Kembali" @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="k-header-title">
        <div class="k-title">Stok Pameran</div>
        <div class="k-sub">{{ headerSub }}</div>
      </div>
      <v-spacer />
      <router-link :to="homePath" class="k-home-link">
        <img :src="LogoKaosan" height="28" alt="Kaosan" />
      </router-link>
    </header>

    <Transition name="k-page" mode="out-in" appear @before-enter="scrollTop">
      <!-- ============ KATEGORI ============ -->
      <div v-if="phase === 'category'" key="category" class="sp-split">
        <aside class="sp-panel">
          <div class="sp-panel-bg" aria-hidden="true">
            <div
              v-for="(col, ci) in panelColumns"
              :key="ci"
              class="sp-col"
              :class="ci % 2 ? 'sp-col--down' : 'sp-col--up'"
              :style="{ '--speed': 55 + ci * 12 + 's' }"
            >
              <img
                v-for="(src, i) in [...col, ...col]"
                :key="i"
                :src="src"
                alt=""
                decoding="async"
                @load="onImgLoad"
              />
            </div>
          </div>
          <div class="sp-panel-shade"></div>

          <div class="sp-panel-body">
            <span class="sp-live"><i></i>Stok langsung</span>
            <div class="sp-num">{{ isLoading ? "-" : totalPcs.toLocaleString("id-ID") }}</div>
            <div class="sp-num-label">pcs siap di {{ stocked.length }} model</div>

            <h1 class="sp-title">Stok <em>Pameran</em></h1>
            <p class="sp-sub">Jumlah tiap ukuran berkurang otomatis saat terjual.</p>
            <div class="k-hero-actions">
              <button class="k-hero-btn k-hero-btn--solid" @click="pilihKategori('ALL')">
                Lihat semua stok
              </button>
              <router-link to="/katalog" class="k-hero-btn k-hero-btn--ghost">
                Lihat katalog
              </router-link>
            </div>
          </div>
        </aside>

        <main class="sp-list">
          <p class="k-hint">Pilih jenis kain untuk melihat stok yang tersedia.</p>
          <Transition name="k-fade" mode="out-in">
            <div v-if="isLoading" key="loading" class="k-cat-grid">
              <div v-for="n in 8" :key="n" class="k-skel k-skel-cat"></div>
            </div>

            <div v-else-if="hasError" key="error" class="k-state">
              <v-icon size="48" color="grey">mdi-wifi-off</v-icon>
              <div class="k-state-title">Gagal memuat stok</div>
              <v-btn color="#D32F2F" class="text-white text-none" @click="loadStok()">
                Coba Lagi
              </v-btn>
            </div>

            <div v-else-if="!stocked.length" key="empty" class="k-state">
              <v-icon size="48" color="grey">mdi-package-variant-closed</v-icon>
              <div class="k-state-title">Belum ada stok pameran yang tersedia</div>
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
                  <div class="k-cat-count">{{ stocked.length }} model</div>
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
                  <div class="k-cat-count">{{ kat.jumlah }} model</div>
                </div>
              </button>
            </div>
          </Transition>
        </main>
      </div>

      <!-- ============ PRODUK ============ -->
      <div v-else key="products">
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
                <span>Semua</span><small>{{ stocked.length }}</small>
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

            <router-link to="/katalog" class="k-side-help">
              <v-icon size="16">mdi-hanger</v-icon>
              Lihat katalog lengkap
            </router-link>
          </aside>

          <main class="k-shop-main">
            <Transition name="k-swap">
              <div v-if="isLoading" key="loading" class="k-grid">
                <div v-for="n in 8" :key="n" class="k-skel k-skel-card"></div>
              </div>

              <div v-else-if="hasError" key="error" class="k-state">
                <v-icon size="48" color="grey">mdi-wifi-off</v-icon>
                <div class="k-state-title">Gagal memuat stok</div>
                <v-btn color="#D32F2F" class="text-white text-none" @click="loadStok()">
                  Coba Lagi
                </v-btn>
              </div>

              <div v-else-if="filtered.length === 0" key="empty" class="k-state">
                <v-icon size="48" color="grey">mdi-magnify-close</v-icon>
                <div class="k-state-title">
                  {{
                    searchTerm ? `Tidak ada hasil untuk "${searchTerm}"` : "Barang tidak ditemukan"
                  }}
                </div>
              </div>

              <div v-else :key="`grid-${selectedKategori}-${lengan}`">
                <div class="k-count">{{ filtered.length }} model</div>
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

                      <span v-if="totalState(p.totalStok) === 'out'" class="k-badge k-badge-out">
                        Habis
                      </span>
                      <span
                        v-else-if="totalState(p.totalStok) === 'low'"
                        class="k-badge k-badge-low"
                      >
                        Sisa sedikit
                      </span>
                    </div>
                    <div class="k-card-body">
                      <h3 class="k-card-name" :title="p.nama">{{ p.nama }}</h3>
                      <div v-if="formatHarga(p.hargaMin, p.hargaMax)" class="k-card-price">
                        {{ formatHarga(p.hargaMin, p.hargaMax) }}
                      </div>
                      <div v-else class="k-card-price k-card-price--na">
                        Tanya petugas untuk harga
                      </div>
                      <div class="k-card-stock" :class="`k-card-stock--${totalState(p.totalStok)}`">
                        <i></i>{{ p.totalStok > 0 ? `${p.totalStok} pcs siap` : "Habis" }}
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

    <SiteFooter max-width="1360px" />

    <!-- ============ DETAIL ============ -->
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
          <span class="k-detail-bar-title">Stok Pameran</span>
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
                <ProductPlaceholder />
              </div>

              <div v-if="detailImages.length" class="k-zoom-hint" aria-hidden="true">
                <v-icon size="16">mdi-magnify-plus-outline</v-icon>
                <span class="k-zoom-hint-text">Perbesar</span>
              </div>
            </div>

            <div class="k-detail-info">
              <h2 class="k-detail-name">{{ selected.nama }}</h2>
              <div class="k-detail-code">Kode: {{ selected.kode }}</div>
              <div v-if="selectedHarga" class="k-detail-price">{{ selectedHarga }}</div>
              <div v-else class="k-detail-price k-card-price--na">Tanya petugas untuk harga</div>

              <div class="k-total" :class="`k-total--${totalState(selected.totalStok)}`">
                <i></i>
                {{ selected.totalStok > 0 ? `Total ${selected.totalStok} pcs siap` : "Stok habis" }}
              </div>

              <template v-if="sizeColumns.length">
                <div class="k-detail-label">Stok dan harga per ukuran</div>
                <div
                  class="k-price-cols"
                  :style="{ gridTemplateColumns: `repeat(${sizeColumns.length}, minmax(0, 1fr))` }"
                >
                  <div v-for="(col, ci) in sizeColumns" :key="ci" class="k-price-list">
                    <div
                      v-for="s in col"
                      :key="s.ukuran"
                      class="k-price-row k-srow"
                      :class="{ 'k-srow--out': s.stok <= 0 }"
                    >
                      <span class="k-size">{{ s.ukuran }}</span>
                      <span class="k-price-val" :class="{ 'k-price-val--na': !s.harga }">
                        {{ s.harga ? rp(s.harga) : "-" }}
                      </span>
                      <span class="k-stok-pill" :class="`k-stok-pill--${sizeState(s.stok)}`">
                        {{ sizeLabel(s.stok) }}
                      </span>
                    </div>
                  </div>
                </div>
              </template>

              <div class="k-note">
                <v-icon size="16" color="#D32F2F">mdi-information-outline</v-icon>
                <span>
                  Stok diperbarui otomatis dan bisa berubah saat ada penjualan.
                  <router-link to="/katalog">Lihat katalog lengkap</router-link>.
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

<style scoped src="../../styles/katalog.css"></style>
<style src="../../styles/katalog-global.css"></style>

<style scoped>
/* Khusus halaman stok */
.k-badge {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  padding: 3px 9px;
  border-radius: 0 0 10px 0;
  font-size: 10px;
  font-weight: 800;
  color: #fff;
}
.k-badge-low {
  background: #ef6c00;
}
.k-badge-out {
  background: #616161;
}

.k-card-stock,
.k-total {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #2e7d32;
}
.k-card-stock i,
.k-total i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2e9e5b;
}
.k-card-stock--low,
.k-total--low {
  color: #b45309;
}
.k-card-stock--low i,
.k-total--low i {
  background: #ef6c00;
}
.k-card-stock--out,
.k-total--out {
  color: #757575;
}
.k-card-stock--out i,
.k-total--out i {
  background: #9e9e9e;
}

.k-total {
  align-self: flex-start;
  margin-bottom: 14px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  background: #e8f5e9;
}
.k-total--low {
  background: #fff1e0;
}
.k-total--out {
  background: #f0f0f0;
}
.k-detail-code {
  margin-bottom: 8px;
  font-size: 11px;
  color: #8a7f7b;
}

.k-srow {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
}
.k-srow .k-price-val {
  text-align: right;
}
.k-srow--out .k-size {
  opacity: 0.5;
  text-decoration: line-through;
}
.k-stok-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
}
.k-stok-pill--ok {
  color: #2e7d32;
  background: #e8f5e9;
}
.k-stok-pill--low {
  color: #b45309;
  background: #fff1e0;
}
.k-stok-pill--out {
  color: #8a8a8a;
  background: #f0f0f0;
}

/* ---------- Halaman kategori: panel kiri 30% + daftar kain 70% ---------- */
.sp-split {
  display: grid;
  grid-template-columns: minmax(320px, 30%) minmax(0, 1fr);
  align-items: start;
}
.sp-panel {
  position: sticky;
  top: var(--k-header-h);
  align-self: start;
  height: calc(100vh - var(--k-header-h));
  overflow: hidden;
  color: #fff;
  background: #1a0d0b;
}
.sp-panel-bg {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 0 6px;
  overflow: hidden;
}
.sp-col {
  will-change: transform;
  animation: sp-up var(--speed, 60s) linear infinite;
}
.sp-col--down {
  animation-name: sp-down;
}
.sp-col img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  margin-bottom: 6px; /* margin (bukan gap) agar loop -50% pas */
  border-radius: 10px;
  object-fit: cover;
  object-position: center 20%;
  opacity: 0;
  transition: opacity 0.6s ease;
}
.sp-col img.is-loaded {
  opacity: 1;
}
@keyframes sp-up {
  to {
    transform: translateY(-50%);
  }
}
@keyframes sp-down {
  from {
    transform: translateY(-50%);
  }
  to {
    transform: translateY(0);
  }
}
.sp-panel-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    0deg,
    rgba(20, 8, 6, 0.94) 0%,
    rgba(20, 8, 6, 0.72) 55%,
    rgba(20, 8, 6, 0.45) 100%
  );
}
.sp-panel-body {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: clamp(24px, 3vw, 44px);
}
.sp-live {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.14);
}
.sp-live i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff5252;
  animation: sp-pulse 1.6s ease-in-out infinite;
}
.sp-num {
  margin-top: 18px;
  font-size: clamp(64px, 7vw, 132px);
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.sp-num-label {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  opacity: 0.85;
}
.sp-title {
  margin: clamp(20px, 4vh, 44px) 0 0;
  font-family: "Playfair Display", Georgia, "Times New Roman", serif;
  font-size: clamp(30px, 3vw, 52px);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.01em;
}
.sp-title em {
  font-style: italic;
  font-weight: 500;
}
.sp-sub {
  margin: 10px 0 18px;
  max-width: 30ch;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.9;
}
.sp-list {
  min-width: 0;
  padding: 24px clamp(16px, 2.4vw, 40px) 48px;
}
.sp-list .k-cat-grid {
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}
@keyframes sp-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 82, 82, 0.6);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 82, 82, 0);
  }
}

/* HP dan layar portrait: panel ditumpuk di atas, lebih pendek */
@media (max-width: 959px), (orientation: portrait) {
  .sp-split {
    grid-template-columns: 1fr;
  }
  .sp-panel {
    position: relative;
    top: 0;
    height: auto;
  }
  .sp-panel-body {
    min-height: 340px;
  }
  .sp-num {
    font-size: clamp(56px, 14vw, 110px);
  }
  .sp-list .k-cat-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .sp-col {
    animation: none;
  }
  .sp-col img {
    transition: none;
  }
}
</style>

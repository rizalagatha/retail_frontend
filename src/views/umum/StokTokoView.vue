<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import LogoKaosan from "@/assets/logo.png";
import SiteFooter from "@/components/SiteFooter.vue";
import ProductPlaceholder from "@/components/ProductPlaceholder.vue";
import { PAMERAN_KODE } from "@/composables/useKiosk";
import { useCartStore, type CartLineInput } from "@/stores/cartStore";

interface StoreItem {
  kode: string;
  nama: string;
}
interface StokRow {
  kode: string;
  jenis_kain: string;
  jenis_kaos: string;
  lengan: string;
  ktg?: string;
  nama: string;
  ukuran: string;
  harga: number;
  stok: number;
  total_terjual: number;
  gambar_url?: string | null;
  urutan?: number;
  galeri?: { url: string; index: number }[] | string | null;
  harga_promo?: number | null;
}
interface SizeStock {
  ukuran: string;
  harga: number;
  stok: number;
  hargaPromo: number | null;
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
  urutan: number;
  gambar: string | null;
  galeri: { url: string; index: number }[];
  promoMin: number;
  promoMax: number;
  promoPersen: number;
  sizes: SizeStock[];
}

const route = useRoute();
const router = useRouter();
const ROUTE_NAME = "Stok Toko";
const LOW_TOTAL = 5;
const LOW_SIZE = 3;
// Keranjang hanya aktif di build katalog (subdomain), bukan di tracking/kiosk
const cartAktif = import.meta.env.VITE_APP_MODE === "KATALOG";
const cart = useCartStore();
const homePath = cartAktif ? "/" : "/tracking";

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(n) || 0)}`;
const formatHarga = (min: number, max: number) => {
  if (!max || max <= 0) return null;
  return min === max ? rp(min) : `${rp(min)} - ${new Intl.NumberFormat("id-ID").format(max)}`;
};

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
const storeError = ref(false);
const currentStore = computed(() => stores.value.find((s) => s.kode === tokoParam.value) || null);

const fetchStores = async () => {
  isLoadingStores.value = true;
  storeError.value = false;
  try {
    const { data } = await api.get<StoreItem[]>("/so/public/stores");
    stores.value = data.filter((s) => s.kode !== PAMERAN_KODE); // pameran punya halaman sendiri
  } catch {
    storeError.value = true;
  } finally {
    isLoadingStores.value = false;
  }
};

const storeQuery = ref("");
const storesShown = computed(() => {
  const q = storeQuery.value.trim().toLowerCase();
  return q ? stores.value.filter((s) => s.nama.toLowerCase().includes(q)) : stores.value;
});

// --- Data stok (cache per toko, 5 menit) ---
const cache = new Map<string, { rows: StokRow[]; at: number }>();
const inflight = new Map<string, Promise<StokRow[]>>();
const CACHE_MS = 5 * 60_000;
const rows = ref<StokRow[]>([]);
const isLoading = ref(false);
const hasError = ref(false);

// Satu request per toko, dibagi bersama antara prefetch dan loadStok
const fetchRows = (kode: string): Promise<StokRow[]> => {
  const pending = inflight.get(kode);
  if (pending) return pending;
  const p = api
    .get<StokRow[]>("/so/public/cek-stok", { params: { cabang: kode, q: "" } })
    .then(({ data }) => {
      cache.set(kode, { rows: data, at: Date.now() });
      return data;
    })
    .finally(() => inflight.delete(kode));
  inflight.set(kode, p);
  return p;
};

// Dipanggil saat kursor/jari menyentuh baris store, supaya data sudah jalan sebelum diklik
const prefetchStok = (kode: string) => {
  const c = cache.get(kode);
  if (c && Date.now() - c.at < CACHE_MS) return;
  fetchRows(kode).catch(() => undefined);
};

const loadStok = async (kode: string, force = false) => {
  const c = cache.get(kode);
  if (c && !force && Date.now() - c.at < CACHE_MS) {
    rows.value = c.rows;
    hasError.value = false;
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  hasError.value = false;
  rows.value = [];
  try {
    const data = await fetchRows(kode);
    if (tokoParam.value === kode) rows.value = data;
  } catch {
    if (tokoParam.value === kode) hasError.value = true;
  } finally {
    if (tokoParam.value === kode) isLoading.value = false;
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
      if ((r.ktg || "").trim().toUpperCase() === "KIDDIFY") kategori = "KIDDIFY";
      else if (namaUp.includes("ANAK") || kaosUp.includes("ANAK") || namaUp.includes("KIDS"))
        kategori = "KAOS ANAK";
      else if (namaUp.includes("TUNIK") || kaosUp.includes("TUNIK")) kategori = "TUNIK";

      p = {
        kode: r.kode,
        nama: r.nama,
        kategori,
        lengan: (r.lengan || "").toUpperCase(),
        hargaMin: 0,
        hargaMax: 0,
        totalStok: 0,
        terjual: 0,
        urutan: r.urutan || 9999,
        gambar: galeri.length ? galeri[0].url : r.gambar_url ?? null,
        galeri,
        promoMin: 0,
        promoMax: 0,
        promoPersen: 0,
        sizes: [],
      };
      map.set(r.kode, p);
    }
    const stok = Math.max(0, Number(r.stok) || 0);
    p.sizes.push({
      ukuran: r.ukuran,
      harga: Number(r.harga) || 0,
      hargaPromo: r.harga_promo ? Number(r.harga_promo) : null,
      stok,
    });
    p.totalStok += stok;
    p.terjual += Number(r.total_terjual) || 0;
  });
  map.forEach((p) => {
    p.sizes.sort((a, b) => sizeRank(a.ukuran) - sizeRank(b.ukuran));
    const prices = p.sizes.map((s) => s.harga).filter((h) => h > 0);
    p.hargaMin = prices.length ? Math.min(...prices) : 0;
    p.hargaMax = prices.length ? Math.max(...prices) : 0;
    const akhir = p.sizes.map((s) => s.hargaPromo ?? s.harga).filter((h) => h > 0);
    const persen = p.sizes
      .filter((s) => s.hargaPromo && s.harga > 0)
      .map((s) => Math.round((1 - (s.hargaPromo as number) / s.harga) * 100));
    p.promoPersen = persen.length ? Math.max(...persen) : 0;
    p.promoMin = akhir.length ? Math.min(...akhir) : 0;
    p.promoMax = akhir.length ? Math.max(...akhir) : 0;
  });
  return [...map.values()];
});

const kategoriList = computed(() => {
  const count: Record<string, number> = {};
  const cover: Record<string, string> = {};
  products.value.forEach((p) => {
    count[p.kategori] = (count[p.kategori] || 0) + 1;
    if (!cover[p.kategori] && p.gambar) cover[p.kategori] = p.gambar;
  });
  return Object.keys(count)
    .sort((a, b) => {
      if (a === "LAIN-LAIN") return 1;
      if (b === "LAIN-LAIN") return -1;
      return count[b] - count[a];
    })
    .map((nama) => ({ nama, jumlah: count[nama], cover: cover[nama] || null }));
});

// --- Filter ---
const lengan = ref("SEMUA");
const search = ref("");
const lenganOptions = [
  { label: "Semua", value: "SEMUA" },
  { label: "Pendek", value: "PENDEK" },
  { label: "Panjang", value: "PANJANG" },
];

const filtered = computed(() => {
  let data = [...products.value];
  if (selectedKategori.value !== "ALL")
    data = data.filter((p) => p.kategori === selectedKategori.value);
  if (lengan.value !== "SEMUA") data = data.filter((p) => p.lengan.includes(lengan.value));
  const q = search.value.trim().toLowerCase();
  if (q)
    data = data.filter((p) => p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q));
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
const setSentinel = (el: unknown) => {
  sentinel.value = (el as HTMLElement) || null;
  if (!el) return;
  observer ??= new IntersectionObserver(
    (e) => {
      if (e[0].isIntersecting && displayCount.value < filtered.value.length)
        displayCount.value += 20;
    },
    { rootMargin: "300px" }
  );
  observer.disconnect();
  observer.observe(el as Element);
};
watch([filtered], () => (displayCount.value = 20));

// --- Status stok ---
const totalState = (n: number) => (n <= 0 ? "out" : n <= LOW_TOTAL ? "low" : "ok");
const sizeState = (n: number) => (n <= 0 ? "out" : n <= LOW_SIZE ? "low" : "ok");
const sizeLabel = (n: number) => (n <= 0 ? "Habis" : n <= LOW_SIZE ? `Sisa ${n}` : `${n} pcs`);

// --- Gambar ---
const imgFailed = reactive<Record<string, boolean>>({});
const onImgLoad = (e: Event) => (e.target as HTMLImageElement).classList.add("is-loaded");

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
  else if (phase.value === "category") router.push({ name: ROUTE_NAME });
  else router.push(homePath);
};

const headerTitle = computed(() =>
  phase.value === "store" ? "Cek Stok Store" : currentStore.value?.nama || tokoParam.value
);
const headerSub = computed(() =>
  phase.value === "store"
    ? "Pilih store"
    : phase.value === "category"
    ? "Pilih jenis kain"
    : selectedKategori.value === "ALL"
    ? "Semua kategori"
    : selectedKategori.value
);

// --- Detail ---
const detailVisible = ref(false);
const selectedKode = ref<string | null>(null);
const selected = computed(() => products.value.find((p) => p.kode === selectedKode.value) ?? null);
const openDetail = (p: Product) => {
  selectedKode.value = p.kode;
  detailVisible.value = true;
};
const detailImages = computed<string[]>(() => {
  const s = selected.value;
  if (!s) return [];
  return s.galeri.length ? s.galeri.map((g) => g.url) : s.gambar ? [s.gambar] : [];
});
const selectedHarga = computed(() =>
  selected.value ? formatHarga(selected.value.hargaMin, selected.value.hargaMax) : null
);
const selectedPromoHarga = computed(() =>
  selected.value && selected.value.promoPersen > 0
    ? formatHarga(selected.value.promoMin, selected.value.promoMax)
    : null
);

watch(detailVisible, (v) => (document.documentElement.style.overflow = v ? "hidden" : ""));
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && detailVisible.value) detailVisible.value = false;
};

// --- Keranjang ---
// Satu keranjang = satu store. Bila user menambah dari store lain, tanyakan dulu.
const bentrok = ref<{ toko: StoreItem; line: CartLineInput } | null>(null);

const bisaTambah = (kode: string, s: SizeStock) =>
  s.harga > 0 && s.stok > 0 && cart.qtyOf(kode, s.ukuran) < s.stok;

const tambahKeranjang = (p: Product, s: SizeStock) => {
  const toko = currentStore.value;
  if (!toko) return;
  const line: CartLineInput = {
    kode: p.kode,
    ukuran: s.ukuran,
    nama: p.nama,
    gambar: p.gambar,
    harga: s.harga,
    hargaPromo: s.hargaPromo,
    stok: s.stok,
  };
  if (cart.add(toko, line) === "beda-toko") bentrok.value = { toko, line };
};

const kosongkanLaluTambah = () => {
  const b = bentrok.value;
  if (!b) return;
  cart.kosongkan();
  cart.add(b.toko, b.line);
  bentrok.value = null;
};

// --- Sinkron dengan route ---
watch(
  tokoParam,
  (kode) => {
    search.value = "";
    lengan.value = "SEMUA";
    if (kode) loadStok(kode);
    else rows.value = [];
  },
  { immediate: true }
);
watch([phase, kategoriParam], () => {
  search.value = "";
  displayCount.value = 20;
  window.scrollTo({ top: 0 });
});
// Toko tidak dikenal -> kembali ke daftar toko
watch([stores, tokoParam], () => {
  if (isLoadingStores.value || !tokoParam.value) return;
  if (!stores.value.some((s) => s.kode === tokoParam.value)) router.replace({ name: ROUTE_NAME });
});

onMounted(() => {
  document.title = "Cek Stok Store - Kaosan";
  fetchStores();
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  observer?.disconnect();
  window.removeEventListener("keydown", onKey);
  document.documentElement.style.overflow = "";
});
</script>

<template>
  <div class="k-page">
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

    <!-- ============ PILIH TOKO ============ -->
    <template v-if="phase === 'store'">
      <section class="sx-hero" aria-labelledby="sx-judul">
        <div class="sx-hero-in">
          <h1 id="sx-judul" class="sx-judul">Mau cek stok di store mana?</h1>
          <p class="sx-lead">Pilih store untuk melihat model, ukuran, dan sisa stoknya.</p>
        </div>
      </section>

      <main class="k-container sx-main">
        <div v-if="isLoadingStores" class="sx-list" aria-hidden="true">
          <div v-for="n in 9" :key="n" class="k-skel sx-skel"></div>
        </div>

        <div v-else-if="storeError" class="k-state">
          <div class="k-state-title">Daftar store belum bisa dimuat</div>
          <p class="sx-state-note">Periksa koneksi internetmu, lalu coba lagi.</p>
          <v-btn color="#D32F2F" class="text-white text-none" @click="fetchStores">
            Coba lagi
          </v-btn>
        </div>

        <template v-else>
          <label v-if="stores.length > 8" class="sx-find">
            <span class="sx-sr">Cari store</span>
            <input
              v-model="storeQuery"
              type="search"
              placeholder="Cari nama store"
              autocomplete="off"
              enterkeyhint="search"
            />
          </label>

          <ul v-if="storesShown.length" class="sx-list">
            <li
              v-for="(s, i) in storesShown"
              :key="s.kode"
              class="sx-item k-enter"
              :style="{ '--i': i % 12 }"
            >
              <button
                type="button"
                class="sx-row"
                @click="pilihStore(s.kode)"
                @pointerenter="prefetchStok(s.kode)"
                @focus="prefetchStok(s.kode)"
              >
                <span class="sx-name">{{ s.nama }}</span>
                <span class="sx-go" aria-hidden="true"></span>
              </button>
            </li>
          </ul>

          <div v-else-if="storeQuery.trim()" class="k-state">
            <div class="k-state-title">Tidak ada store “{{ storeQuery.trim() }}”</div>
            <button type="button" class="sx-clear" @click="storeQuery = ''">Hapus pencarian</button>
          </div>
          <div v-else class="k-state">
            <div class="k-state-title">Belum ada store yang ditampilkan</div>
          </div>
        </template>
      </main>
    </template>

    <!-- ============ PILIH KAIN ============ -->
    <main v-else-if="phase === 'category'" class="k-container">
      <p class="k-hint">Pilih jenis kain yang ingin dilihat.</p>

      <div v-if="isLoading" class="k-cat-grid">
        <div v-for="n in 8" :key="n" class="k-skel k-skel-cat"></div>
      </div>
      <div v-else-if="hasError" class="k-state">
        <div class="k-state-title">Gagal memuat data stok</div>
        <v-btn color="#D32F2F" class="text-white text-none" @click="loadStok(tokoParam, true)">
          Coba Lagi
        </v-btn>
      </div>
      <div v-else-if="!products.length" class="k-state">
        <div class="k-state-title">Stok di store ini sedang kosong</div>
      </div>
      <div v-else class="k-cat-grid">
        <button class="k-cat-card k-enter" style="--i: 0" @click="pilihKategori('ALL')">
          <div class="k-cat-cover k-cat-cover--mosaic">
            <img
              v-for="(k, n) in kategoriList.filter((x) => x.cover).slice(0, 4)"
              :key="n"
              :src="k.cover!"
              alt=""
              loading="lazy"
              decoding="async"
              @load="onImgLoad"
            />
          </div>
          <div class="k-cat-body">
            <div class="k-cat-name">SEMUA</div>
            <div class="k-cat-count">{{ products.length }} model</div>
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
    </main>

    <!-- ============ PRODUK ============ -->
    <main v-else class="k-container">
      <div class="st-filters">
        <div class="k-lengan">
          <button
            v-for="opt in lenganOptions"
            :key="opt.value"
            class="k-lengan-btn"
            :class="{ 'k-lengan-btn--active': lengan === opt.value }"
            @click="lengan = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <v-text-field
          v-model="search"
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

      <div v-if="isLoading" class="k-grid">
        <div v-for="n in 8" :key="n" class="k-skel k-skel-card"></div>
      </div>
      <div v-else-if="hasError" class="k-state">
        <div class="k-state-title">Gagal memuat data stok</div>
        <v-btn color="#D32F2F" class="text-white text-none" @click="loadStok(tokoParam, true)">
          Coba Lagi
        </v-btn>
      </div>
      <div v-else-if="!filtered.length" class="k-state">
        <div class="k-state-title">Barang tidak ditemukan</div>
      </div>
      <template v-else>
        <div class="k-count">{{ filtered.length }} model</div>
        <div class="k-grid">
          <article
            v-for="(p, i) in visible"
            :key="p.kode"
            class="k-card k-enter"
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
              <span v-if="totalState(p.totalStok) === 'out'" class="st-badge st-badge--out"
                >Habis</span
              >
              <span v-else-if="totalState(p.totalStok) === 'low'" class="st-badge st-badge--low">
                Sisa sedikit
              </span>
              <span v-if="p.promoPersen > 0" class="k-promo-badge">-{{ p.promoPersen }}%</span>
            </div>
            <div class="k-card-body">
              <h3 class="k-card-name">{{ p.nama }}</h3>
              <div v-if="p.promoPersen > 0" class="k-card-price k-card-price--promo">
                <span>{{ formatHarga(p.promoMin, p.promoMax) }}</span>
                <s class="k-price-old">{{ formatHarga(p.hargaMin, p.hargaMax) }}</s>
              </div>
              <div v-else-if="formatHarga(p.hargaMin, p.hargaMax)" class="k-card-price">
                {{ formatHarga(p.hargaMin, p.hargaMax) }}
              </div>
              <div v-else class="k-card-price k-card-price--na">Hubungi store untuk harga</div>
              <div class="st-stock" :class="`st-stock--${totalState(p.totalStok)}`">
                <i></i>{{ p.totalStok > 0 ? `${p.totalStok} pcs` : "Habis" }}
              </div>
            </div>
          </article>
        </div>
        <div :ref="setSentinel" class="k-sentinel"></div>
      </template>
    </main>

    <SiteFooter max-width="1360px" />

    <!-- ============ PANEL DETAIL ============ -->
    <Teleport to="body">
      <Transition name="k-drawer">
        <div
          v-if="detailVisible && selected"
          class="k-drawer-wrap"
          @click.self="detailVisible = false"
        >
          <aside class="k-detail k-drawer" role="dialog" aria-modal="true">
            <div
              class="k-detail-bar"
              style="background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)"
            >
              <span class="k-detail-bar-title">{{ currentStore?.nama || "Stok Store" }}</span>
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
              <div class="k-detail-layout">
                <div class="k-detail-media">
                  <v-carousel
                    v-if="detailImages.length"
                    height="100%"
                    hide-delimiter-background
                    :hide-delimiters="detailImages.length < 2"
                    :show-arrows="detailImages.length > 1 ? 'hover' : false"
                    class="k-carousel"
                  >
                    <v-carousel-item v-for="(src, i) in detailImages" :key="i">
                      <v-img :src="src" cover height="100%">
                        <template #error>
                          <div class="k-img-broken">
                            <v-icon size="40" color="grey">mdi-image-broken-variant</v-icon>
                          </div>
                        </template>
                      </v-img>
                    </v-carousel-item>
                  </v-carousel>
                  <div v-else class="k-carousel"><ProductPlaceholder /></div>
                </div>

                <div class="k-detail-info">
                  <h2 class="k-detail-name">{{ selected.nama }}</h2>
                  <div class="st-code">Kode: {{ selected.kode }}</div>
                  <div v-if="selectedPromoHarga" class="k-detail-price k-detail-price--promo">
                    {{ selectedPromoHarga }}
                    <s class="k-price-old">{{ selectedHarga }}</s>
                    <span class="k-promo-chip">Promo -{{ selected.promoPersen }}%</span>
                  </div>
                  <div v-else-if="selectedHarga" class="k-detail-price">{{ selectedHarga }}</div>
                  <div v-else class="k-detail-price k-card-price--na">
                    Hubungi store untuk harga
                  </div>

                  <div class="k-detail-label">Stok dan harga per ukuran</div>
                  <div class="k-price-list">
                    <div
                      v-for="s in selected.sizes"
                      :key="s.ukuran"
                      class="k-price-row st-srow"
                      :class="{ 'st-srow--out': s.stok <= 0, 'st-srow--cart': cartAktif }"
                    >
                      <span class="k-size">{{ s.ukuran }}</span>
                      <span class="k-price-val" :class="{ 'k-price-val--na': !s.harga }">
                        <template v-if="s.hargaPromo">
                          <s class="k-price-old">{{ rp(s.harga) }}</s>
                          {{ rp(s.hargaPromo) }}
                        </template>
                        <template v-else>{{ s.harga ? rp(s.harga) : "-" }}</template>
                      </span>
                      <span class="st-pill" :class="`st-pill--${sizeState(s.stok)}`">
                        {{ sizeLabel(s.stok) }}
                      </span>
                      <button
                        v-if="cartAktif"
                        type="button"
                        class="st-add"
                        :disabled="!bisaTambah(selected.kode, s)"
                        :aria-label="`Tambah ukuran ${s.ukuran} ke keranjang`"
                        @click="tambahKeranjang(selected, s)"
                      >
                        <v-icon size="18">mdi-cart-plus</v-icon>
                        <span v-if="cart.qtyOf(selected.kode, s.ukuran)" class="st-add-n">
                          {{ cart.qtyOf(selected.kode, s.ukuran) }}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div class="k-note">
                    <v-icon size="16" color="#D32F2F">mdi-information-outline</v-icon>
                    <span>Stok dapat berubah sewaktu-waktu. Hubungi store untuk memastikan.</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>

    <v-dialog :model-value="!!bentrok" max-width="380" @update:model-value="bentrok = null">
      <v-card v-if="bentrok">
        <v-card-title class="text-subtitle-1 font-weight-bold" style="color: #b71c1c">
          Ganti store?
        </v-card-title>
        <v-card-text>
          Keranjangmu berisi barang dari <b>{{ cart.tokoNama }}</b
          >. Satu keranjang hanya untuk satu store. Kosongkan lalu mulai dari
          <b>{{ bentrok.toko.nama }}</b
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="bentrok = null">Batal</v-btn>
          <v-btn variant="flat" color="#b71c1c" class="text-white" @click="kosongkanLaluTambah">
            Kosongkan dan tambah
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped src="../../styles/katalog.css"></style>

<style scoped>
/* ===== Pilih store ===== */
.sx-hero {
  background: #b71c1c;
  color: #faf6f4;
  padding: 28px 0 10px;
}
.sx-hero-in {
  max-width: 1360px;
  margin: 0 auto;
  padding: 0 16px;
}
.sx-hero-in::after {
  content: "";
  display: block;
  margin-top: 24px;
  border-top: 2px dashed rgba(250, 246, 244, 0.5);
}
.sx-judul {
  max-width: 16ch;
  margin: 0;
  font-family: "Playfair Display Variable", "Playfair Display", Georgia, serif;
  font-size: clamp(30px, 6.4vw, 52px);
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -0.01em;
}
.sx-lead {
  max-width: 42ch;
  margin: 12px 0 0;
  font-family: "Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.55;
  color: rgba(250, 246, 244, 0.86);
}
@media (min-width: 600px) {
  .sx-hero {
    padding: 44px 0 12px;
  }
  .sx-hero-in {
    padding: 0 24px;
  }
}

.sx-main {
  padding-top: 20px;
}
.sx-find {
  display: block;
  max-width: 420px;
  margin: 0 0 8px;
}
.sx-find input {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  border: 1px solid #e9dfdb;
  border-radius: 12px;
  background: #fff;
  font: inherit;
  font-size: 16px; /* 16px: mencegah iOS memperbesar layar saat fokus */
  color: #1f1a19;
}
.sx-find input:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 1px;
}
.sx-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.sx-list {
  margin: 0;
  padding: 0;
  list-style: none;
  columns: 1;
  column-gap: 40px;
}
@media (min-width: 720px) {
  .sx-list {
    columns: 2;
  }
}
@media (min-width: 1100px) {
  .sx-list {
    columns: 3;
  }
}
.sx-item {
  break-inside: avoid;
}
.sx-skel {
  height: 44px;
  margin-bottom: 14px;
  break-inside: avoid;
}

.sx-row {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 4px;
  border: 0;
  border-bottom: 1px solid #e9dfdb;
  background: none;
  font: inherit;
  text-align: left;
  color: #1f1a19;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sx-row::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 2px;
  background: #b71c1c;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.28s ease;
}
.sx-name {
  font-family: "Playfair Display Variable", "Playfair Display", Georgia, serif;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  transition: color 0.2s ease;
}
.sx-go {
  flex: none;
  width: 9px;
  height: 9px;
  margin-right: 6px;
  border-top: 2px solid #b9aca7;
  border-right: 2px solid #b9aca7;
  transform: rotate(45deg);
  transition: transform 0.2s ease, border-color 0.2s ease;
}
.sx-row:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}
.sx-row:focus-visible::after {
  transform: scaleX(1);
}
.sx-row:active {
  background: rgba(183, 28, 28, 0.06);
}
@media (hover: hover) {
  .sx-row:hover::after {
    transform: scaleX(1);
  }
  .sx-row:hover .sx-name {
    color: #b71c1c;
  }
  .sx-row:hover .sx-go {
    transform: translateX(4px) rotate(45deg);
    border-color: #b71c1c;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sx-row::after,
  .sx-name,
  .sx-go {
    transition: none;
  }
}

.sx-state-note {
  margin: 0 0 14px;
  font-size: 13px;
  color: #6f6663;
}
.sx-clear {
  border: 0;
  background: none;
  padding: 6px 2px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  color: #b71c1c;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.st-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.st-filters .k-search {
  flex: 1 1 240px;
  max-width: 340px;
}

.st-badge {
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
.st-badge--low {
  background: #ef6c00;
}
.st-badge--out {
  background: #616161;
}
.st-stock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #2e7d32;
}
.st-stock i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2e9e5b;
}
.st-stock--low {
  color: #b45309;
}
.st-stock--low i {
  background: #ef6c00;
}
.st-stock--out {
  color: #757575;
}
.st-stock--out i {
  background: #9e9e9e;
}

.st-code {
  margin-bottom: 8px;
  font-size: 11px;
  color: #8a7f7b;
}
.st-srow {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
}
.st-srow .k-price-val {
  text-align: right;
}
.st-srow--out .k-size {
  opacity: 0.5;
  text-decoration: line-through;
}
.st-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
}
.st-pill--ok {
  color: #2e7d32;
  background: #e8f5e9;
}
.st-pill--low {
  color: #b45309;
  background: #fff1e0;
}
.st-pill--out {
  color: #8a8a8a;
  background: #f0f0f0;
}
.st-srow--cart {
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
}
.st-add {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e9dfdb;
  border-radius: 50%;
  color: #b71c1c;
  background: #fff;
  cursor: pointer;
}
.st-add:active:not(:disabled) {
  transform: scale(0.94);
}
.st-add:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.st-add-n {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  color: #fff;
  background: #b71c1c;
}
</style>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import LogoKaosan from "@/assets/logo.png";
import SiteFooter from "@/components/SiteFooter.vue";
import ProductPlaceholder from "@/components/ProductPlaceholder.vue";
import { PAMERAN_KODE } from "@/composables/useKiosk";

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
  urutan: number;
  gambar: string | null;
  galeri: { url: string; index: number }[];
  sizes: SizeStock[];
}

const route = useRoute();
const router = useRouter();
const ROUTE_NAME = "Stok Toko";
const LOW_TOTAL = 5;
const LOW_SIZE = 3;

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

// --- Data stok (cache per toko, 5 menit) ---
const cache = new Map<string, { rows: StokRow[]; at: number }>();
const rows = ref<StokRow[]>([]);
const isLoading = ref(false);
const hasError = ref(false);

const loadStok = async (kode: string, force = false) => {
  const c = cache.get(kode);
  if (c && !force && Date.now() - c.at < 5 * 60_000) {
    rows.value = c.rows;
    hasError.value = false;
    return;
  }
  isLoading.value = true;
  hasError.value = false;
  rows.value = [];
  try {
    const { data } = await api.get<StokRow[]>("/so/public/cek-stok", {
      params: { cabang: kode, q: "" },
    });
    cache.set(kode, { rows: data, at: Date.now() });
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
        sizes: [],
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
  else router.push("/tracking");
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

watch(detailVisible, (v) => (document.documentElement.style.overflow = v ? "hidden" : ""));
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && detailVisible.value) detailVisible.value = false;
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
      <router-link to="/tracking" class="k-home-link">
        <img :src="LogoKaosan" height="28" alt="Kaosan" />
      </router-link>
    </header>

    <!-- ============ PILIH TOKO ============ -->
    <main v-if="phase === 'store'" class="k-container">
      <p class="k-hint">Pilih store untuk melihat ketersediaan barang siap jual.</p>

      <div v-if="isLoadingStores" class="st-store-grid">
        <div v-for="n in 8" :key="n" class="k-skel" style="height: 68px"></div>
      </div>
      <div v-else-if="storeError" class="k-state">
        <v-icon size="48" color="grey">mdi-wifi-off</v-icon>
        <div class="k-state-title">Gagal memuat daftar store</div>
        <v-btn color="#D32F2F" class="text-white text-none" @click="fetchStores">Coba Lagi</v-btn>
      </div>
      <div v-else class="st-store-grid">
        <button
          v-for="(s, i) in stores"
          :key="s.kode"
          class="st-store k-enter"
          :style="{ '--i': i % 12 }"
          @click="pilihStore(s.kode)"
        >
          <span class="st-store-ico"><v-icon size="22" color="#D32F2F">mdi-store</v-icon></span>
          <span class="st-store-text">
            <b>{{ s.nama }}</b>
            <small>Store Kaosan</small>
          </span>
          <v-icon size="20" color="#D32F2F">mdi-chevron-right</v-icon>
        </button>
      </div>
    </main>

    <!-- ============ PILIH KAIN ============ -->
    <main v-else-if="phase === 'category'" class="k-container">
      <p class="k-hint">Pilih jenis kain yang ingin dilihat.</p>

      <div v-if="isLoading" class="k-cat-grid">
        <div v-for="n in 8" :key="n" class="k-skel k-skel-cat"></div>
      </div>
      <div v-else-if="hasError" class="k-state">
        <v-icon size="48" color="grey">mdi-wifi-off</v-icon>
        <div class="k-state-title">Gagal memuat data stok</div>
        <v-btn color="#D32F2F" class="text-white text-none" @click="loadStok(tokoParam, true)">
          Coba Lagi
        </v-btn>
      </div>
      <div v-else-if="!products.length" class="k-state">
        <v-icon size="48" color="grey">mdi-package-variant-closed</v-icon>
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
        <v-icon size="48" color="grey">mdi-wifi-off</v-icon>
        <div class="k-state-title">Gagal memuat data stok</div>
        <v-btn color="#D32F2F" class="text-white text-none" @click="loadStok(tokoParam, true)">
          Coba Lagi
        </v-btn>
      </div>
      <div v-else-if="!filtered.length" class="k-state">
        <v-icon size="48" color="grey">mdi-magnify-close</v-icon>
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
            </div>
            <div class="k-card-body">
              <h3 class="k-card-name">{{ p.nama }}</h3>
              <div v-if="formatHarga(p.hargaMin, p.hargaMax)" class="k-card-price">
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
                  <div v-if="selectedHarga" class="k-detail-price">{{ selectedHarga }}</div>
                  <div v-else class="k-detail-price k-card-price--na">
                    Hubungi store untuk harga
                  </div>

                  <div class="k-detail-label">Stok dan harga per ukuran</div>
                  <div class="k-price-list">
                    <div
                      v-for="s in selected.sizes"
                      :key="s.ukuran"
                      class="k-price-row st-srow"
                      :class="{ 'st-srow--out': s.stok <= 0 }"
                    >
                      <span class="k-size">{{ s.ukuran }}</span>
                      <span class="k-price-val" :class="{ 'k-price-val--na': !s.harga }">
                        {{ s.harga ? rp(s.harga) : "-" }}
                      </span>
                      <span class="st-pill" :class="`st-pill--${sizeState(s.stok)}`">
                        {{ sizeLabel(s.stok) }}
                      </span>
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
  </div>
</template>

<style scoped src="../../styles/katalog.css"></style>

<style scoped>
.st-store-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
@media (min-width: 600px) {
  .st-store-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (min-width: 960px) {
  .st-store-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
.st-store {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #f1e9e6;
  border-radius: 14px;
  font: inherit;
  text-align: left;
  background: #fff;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.st-store:hover,
.st-store:focus-visible {
  transform: translateY(-3px);
  border-color: var(--k-red);
  box-shadow: 0 10px 22px rgba(183, 28, 28, 0.16);
  outline: none;
}
.st-store:active {
  transform: scale(0.985);
}
@media (hover: none) {
  .st-store:hover {
    transform: none;
    box-shadow: none;
    border-color: #f1e9e6;
  }
}
.st-store-ico {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #ffebee;
}
.st-store-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.st-store-text b {
  font-size: 14px;
  font-weight: 700;
  color: #1f1a19;
}
.st-store-text small {
  font-size: 11px;
  color: #8a7f7b;
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
</style>

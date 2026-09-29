<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
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
}

const route = useRoute();
const router = useRouter();
const { xs } = useDisplay();

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

    return {
      kode: r.kode,
      nama: r.nama,
      kategori,
      lengan: (r.lengan || "").toUpperCase(),
      hargaMin: min || max,
      hargaMax: max || min,
      ukuran: r.ukuran ? r.ukuran.split(",") : [],
      ukuranHarga,
      gambar: r.gambar_url,
      urutan: r.urutan || 9999,
      galeri,
    };
  })
);

// Cover acak per kategori. Dipilih sekali saat data dimuat (bukan tiap render),
// jadi tidak berganti-ganti saat user bolak-balik atau mengetik.
const coverMap = ref<Record<string, string>>({});
const semuaCovers = ref<string[]>([]);

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

const setupObserver = async () => {
  await nextTick();
  observer?.disconnect();
  if (!sentinel.value) return;
  observer = new IntersectionObserver(
    (e) => {
      if (e[0].isIntersecting && displayCount.value < filtered.value.length) {
        displayCount.value += 20;
        setupObserver();
      }
    },
    { rootMargin: "300px" }
  );
  observer.observe(sentinel.value);
};

watch(filtered, () => {
  displayCount.value = 20;
  setupObserver();
});
watch([phase, isLoading], () => {
  window.scrollTo({ top: 0 });
  setupObserver();
});

// --- Navigasi ---
const pilihKategori = (nama: string) =>
  router.push({ name: ROUTE_NAME, params: { kategori: nama === "ALL" ? "semua" : nama } });
const goBack = () =>
  phase.value === "products" ? router.push({ name: ROUTE_NAME }) : router.push("/");

// --- Detail ---
const detailVisible = ref(false);
const selected = ref<Product | null>(null);
const openDetail = (p: Product) => {
  selected.value = p;
  detailVisible.value = true;
};

onMounted(() => {
  document.title = "Katalog Produk - Kaosan";
  loadCatalog();
});
onUnmounted(() => {
  observer?.disconnect();
  clearTimeout(searchTimer);
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

    <!-- KATEGORI -->
    <main v-if="phase === 'category'" class="k-container">
      <p class="k-hint">Pilih jenis kain untuk melihat koleksi kami.</p>

      <div v-if="isLoading" class="k-cat-grid">
        <div v-for="n in 8" :key="n" class="k-skel k-skel-cat"></div>
      </div>
      <div v-else-if="hasError" class="k-state">
        <v-icon size="48" color="grey">mdi-wifi-off</v-icon>
        <div class="k-state-title">Gagal memuat katalog</div>
        <v-btn color="#D32F2F" class="text-white text-none" @click="loadCatalog">Coba Lagi</v-btn>
      </div>
      <div v-else class="k-cat-grid">
        <button class="k-cat-card k-enter" style="--i: 0" @click="pilihKategori('ALL')">
          <div class="k-cat-cover k-cat-cover--mosaic">
            <img v-for="(src, n) in semuaCovers" :key="n" :src="src" alt="" loading="lazy" />
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
          :style="{ '--i': i + 1 }"
          @click="pilihKategori(kat.nama)"
        >
          <div class="k-cat-cover">
            <img v-if="kat.cover" :src="kat.cover" :alt="kat.nama" loading="lazy" />
            <div v-else class="k-cat-tex" v-html="getFabricTexture(kat.nama)"></div>
          </div>
          <div class="k-cat-body">
            <div class="k-cat-name">{{ kat.nama }}</div>
            <div class="k-cat-count">{{ kat.jumlah }} produk</div>
          </div>
        </button>
      </div>
    </main>

    <!-- PRODUK -->
    <template v-else>
      <div class="k-toolbar">
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

      <main class="k-container">
        <div v-if="isLoading" class="k-grid">
          <div v-for="n in 8" :key="n" class="k-skel k-skel-card"></div>
        </div>
        <div v-else-if="filtered.length === 0" class="k-state">
          <v-icon size="48" color="grey">mdi-magnify-close</v-icon>
          <div class="k-state-title">
            {{ searchTerm ? `Tidak ada hasil untuk "${searchTerm}"` : "Produk tidak ditemukan" }}
          </div>
        </div>
        <template v-else>
          <div class="k-count">{{ filtered.length }} produk</div>
          <div class="k-grid">
            <article
              v-for="(p, i) in visible"
              :key="p.kode"
              class="k-card k-enter"
              :style="{ '--i': i % 20 }"
              tabindex="0"
              @click="openDetail(p)"
              @keydown.enter="openDetail(p)"
            >
              <div class="k-card-img">
                <v-img v-if="p.gambar" :src="p.gambar" cover aspect-ratio="1">
                  <template #placeholder><div class="k-img-loading"></div></template>
                  <template #error
                    ><div class="k-tex" v-html="getFabricTexture(p.kategori)"></div
                  ></template>
                </v-img>
                <div v-else class="k-tex" v-html="getFabricTexture(p.kategori)"></div>
              </div>
              <div class="k-card-body">
                <h3 class="k-card-name" :title="p.nama">{{ p.nama }}</h3>
                <div v-if="formatHarga(p.hargaMin, p.hargaMax)" class="k-card-price">
                  {{ formatHarga(p.hargaMin, p.hargaMax) }}
                </div>
                <div v-else class="k-card-price k-card-price--na">Hubungi store untuk harga</div>
              </div>
            </article>
          </div>
          <div ref="sentinel" class="k-sentinel"></div>
          <div v-if="displayCount < filtered.length" class="k-more">
            <v-progress-circular indeterminate color="#D32F2F" size="22" />
          </div>
        </template>
      </main>
    </template>

    <!-- DETAIL (tanpa stok) -->
    <v-dialog v-model="detailVisible" max-width="860" scrollable :fullscreen="xs">
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
                v-if="selected.galeri.length"
                height="100%"
                hide-delimiter-background
                show-arrows="hover"
                class="k-carousel"
              >
                <v-carousel-item v-for="(img, i) in selected.galeri" :key="i">
                  <v-img :src="img.url" cover height="100%">
                    <template #error>
                      <div class="k-img-broken">
                        <v-icon size="40" color="grey">mdi-image-broken-variant</v-icon>
                      </div>
                    </template>
                  </v-img>
                </v-carousel-item>
              </v-carousel>
              <div v-else-if="selected.gambar" class="k-carousel">
                <v-img :src="selected.gambar" cover height="100%" />
              </div>
              <div v-else class="k-carousel">
                <div class="k-tex" v-html="getFabricTexture(selected.kategori)"></div>
              </div>
            </div>

            <div class="k-detail-info">
              <h2 class="k-detail-name">{{ selected.nama }}</h2>
              <div v-if="selectedHarga" class="k-detail-price">{{ selectedHarga }}</div>
              <div v-else class="k-detail-price k-card-price--na">Hubungi store untuk harga</div>

              <div v-if="selected.ukuranHarga.length" class="k-detail-label">Harga per ukuran</div>
              <div v-if="selected.ukuranHarga.length" class="k-price-list">
                <div v-for="u in selected.ukuranHarga" :key="u.ukuran" class="k-price-row">
                  <span class="k-size">{{ u.ukuran }}</span>
                  <span class="k-price-val" :class="{ 'k-price-val--na': !u.harga }">
                    {{ u.harga ? rp(u.harga) : "Hubungi store" }}
                  </span>
                </div>
              </div>

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
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 12px 40px;
}
.k-hint {
  font-size: 12px;
  color: #666;
  margin: 0 0 12px;
}

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

.k-cat-cover {
  aspect-ratio: 1 / 1;
  background: #eee;
  overflow: hidden;
  line-height: 0;
}
.k-cat-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top; /* foto model: pertahankan bagian dada-kaos, potong bawah */
  transition: transform 0.35s ease;
}
.k-cat-card:hover .k-cat-cover img {
  transform: scale(1.05);
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
  .k-card,
  .k-cat-card {
    transition: none;
  }
}
</style>

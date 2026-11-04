<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, type Directive } from "vue";
import api from "@/services/api";
import LogoKaosan from "@/assets/logo.png";
import SiteFooter from "@/components/SiteFooter.vue";
import ProductPlaceholder from "@/components/ProductPlaceholder.vue";
import { PAMERAN_KODE } from "@/composables/useKiosk";
import { PREMIUM_FABRICS } from "@/data/premiumFabrics";
import "@fontsource-variable/cormorant";
import "@fontsource-variable/cormorant/wght-italic.css";
import "@fontsource-variable/jost";

interface Galeri {
  url: string;
  index: number;
}
interface CatalogRow {
  kode: string;
  jenis_kain: string;
  jenis_kaos: string;
  ktg: string;
  nama: string;
  harga_min: number | null;
  harga_max: number | null;
  promo_min?: number | null;
  promo_max?: number | null;
  promo_persen?: number | null;
  gambar_url: string | null;
  urutan: number;
  galeri: string | Galeri[] | null;
}
interface StoreItem {
  kode: string;
  nama: string;
}
interface Fabric {
  nama: string;
  jumlah: number;
  cover: string | null;
}
interface PromoItem {
  kode: string;
  nama: string;
  foto: string | null;
  persen: number;
  harga: string;
  hargaAsli: string | null;
}

const RAK_MAX = 10; // jumlah kain di rak (sisanya ada di halaman katalog)
const PROMO_MAX = 4;

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(n) || 0)}`;
const formatHarga = (min: number, max: number): string | null => {
  if (!max || max <= 0) return null;
  return min === max ? rp(min) : `${rp(min)} - ${new Intl.NumberFormat("id-ID").format(max)}`;
};

// Harus sama dengan penentuan kategori di KatalogView: rute /katalog/:kategori mencocokkan nama ini
const kategoriOf = (r: CatalogRow): string => {
  const namaUp = (r.nama || "").toUpperCase();
  const kaosUp = (r.jenis_kaos || "").toUpperCase();
  if ((r.ktg || "").trim().toUpperCase() === "KIDDIFY") return "KIDDIFY";
  if (namaUp.includes("ANAK") || kaosUp.includes("ANAK") || namaUp.includes("KIDS"))
    return "KAOS ANAK";
  if (namaUp.includes("TUNIK") || kaosUp.includes("TUNIK")) return "TUNIK";
  return (r.jenis_kain || "").trim() || "LAIN-LAIN";
};

// Foto utama = galeri pertama, cadangan gambar_url
const fotoUtama = (r: CatalogRow): string | null => {
  try {
    const raw = typeof r.galeri === "string" ? (JSON.parse(r.galeri) as Galeri[]) : r.galeri;
    if (Array.isArray(raw) && raw.length) return raw[0].url;
  } catch {
    /* galeri rusak: pakai gambar_url */
  }
  return r.gambar_url;
};

// --- Data ---
const rows = ref<CatalogRow[]>([]);
const isLoading = ref(true);
const hasError = ref(false);
const stores = ref<StoreItem[]>([]);

const loadCatalog = async () => {
  isLoading.value = true;
  hasError.value = false;
  try {
    const { data } = await api.get<CatalogRow[]>("/so/public/katalog");
    rows.value = data;
  } catch {
    hasError.value = true;
  } finally {
    isLoading.value = false;
    await nextTick();
    syncArrows();
  }
};

const loadStores = async () => {
  try {
    const { data } = await api.get<StoreItem[]>("/so/public/stores");
    stores.value = data.filter((s) => s.kode !== PAMERAN_KODE); // pameran punya halaman sendiri
  } catch {
    stores.value = []; // bagian store disembunyikan, halaman tetap jalan
  }
};

const produk = computed(() =>
  [...rows.value]
    .sort((a, b) => (a.urutan || 9999) - (b.urutan || 9999) || a.nama.localeCompare(b.nama))
    .map((r) => ({ r, kategori: kategoriOf(r), foto: fotoUtama(r) }))
);

// Kain berurutan menurut jumlah produk; cover = produk pertama (urutan katalog) yang punya foto
const fabrics = computed<Fabric[]>(() => {
  const map = new Map<string, Fabric>();
  produk.value.forEach(({ kategori, foto }) => {
    const f = map.get(kategori) ?? { nama: kategori, jumlah: 0, cover: null };
    f.jumlah += 1;
    if (!f.cover && foto) f.cover = foto;
    map.set(kategori, f);
  });
  return [...map.values()].sort((a, b) => {
    if (a.nama === "LAIN-LAIN") return 1;
    if (b.nama === "LAIN-LAIN") return -1;
    return b.jumlah - a.jumlah;
  });
});

const rak = computed(() => fabrics.value.slice(0, RAK_MAX));
const semuaCovers = computed(() =>
  fabrics.value
    .map((f) => f.cover)
    .filter((c): c is string => !!c)
    .slice(0, 4)
);

const promo = computed<PromoItem[]>(() =>
  produk.value
    .filter(({ r }) => Number(r.promo_persen) > 0 && Number(r.promo_max) > 0)
    .sort((a, b) => Number(b.r.promo_persen) - Number(a.r.promo_persen))
    .slice(0, PROMO_MAX)
    .map(({ r, foto }) => ({
      kode: r.kode,
      nama: r.nama,
      foto,
      persen: Number(r.promo_persen),
      harga: formatHarga(Number(r.promo_min) || 0, Number(r.promo_max) || 0) ?? "",
      hargaAsli: formatHarga(Number(r.harga_min) || 0, Number(r.harga_max) || 0),
    }))
);

const fakta = computed(() => {
  if (!rows.value.length) return "";
  const dasar = `${rows.value.length} produk dalam ${fabrics.value.length} jenis kain`;
  return stores.value.length ? `${dasar}, tersedia di ${stores.value.length} store.` : `${dasar}.`;
});

// --- Gambar: fade-in saat selesai dimuat, placeholder bila gagal ---
const rusak = reactive<Record<string, boolean>>({});
const tandaiRusak = (src: string | null) => {
  if (src) rusak[src] = true;
};
const onImgLoad = (e: Event) => (e.target as HTMLImageElement).classList.add("is-loaded");
// Gambar yang sudah ada di cache tidak memicu event load lagi
const tandaiCache = (el: unknown) => {
  const img = el as HTMLImageElement | null;
  if (img?.complete && img.naturalWidth) img.classList.add("is-loaded");
};

// --- Premium: daftar kain + satu foto per kain (maks 3) untuk bingkai lengkung ---
const PREM_LIST_MAX = 8;
const premiumList = computed(() => PREMIUM_FABRICS.slice(0, PREM_LIST_MAX));
const premiumSisa = computed(() => Math.max(0, PREMIUM_FABRICS.length - PREM_LIST_MAX));
const premiumFotos = computed<string[]>(() => {
  const out: string[] = [];
  for (const f of PREMIUM_FABRICS) {
    if (out.length >= 3) break;
    const keys = f.kata.map((k) => k.toUpperCase());
    const hit = produk.value.find(
      ({ r, foto }) => foto && keys.some((k) => (r.nama || "").toUpperCase().includes(k))
    );
    if (hit?.foto && !out.includes(hit.foto) && !rusak[hit.foto]) out.push(hit.foto);
  }
  return out;
});

// --- Rak: panah geser (desktop) ---
const scroller = ref<HTMLElement | null>(null);
const canPrev = ref(false);
const canNext = ref(false);
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function syncArrows() {
  const el = scroller.value;
  if (!el) return;
  canPrev.value = el.scrollLeft > 8;
  canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 8;
}
const geser = (arah: 1 | -1) =>
  scroller.value?.scrollBy({
    left: arah * scroller.value.clientWidth * 0.8,
    behavior: reduceMotion() ? "auto" : "smooth",
  });

const keCaraPesan = () =>
  document
    .getElementById("cara-pesan")
    ?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });

// --- Muncul saat di-scroll: v-reveal (opsional: v-reveal="n" = urutan jeda 80ms x n) ---
let revealIO: IntersectionObserver | null = null;

const settle = (e: TransitionEvent) => {
  const el = e.currentTarget as HTMLElement;
  if (e.target !== el) return;
  el.removeEventListener("transitionend", settle);
  // lepas atribut agar transisi bawaan elemen (mis. hover kartu) kembali berlaku
  delete el.dataset.rv;
  el.style.removeProperty("--rv-i");
};

const getRevealIO = (): IntersectionObserver | null => {
  if (revealIO) return revealIO;
  if (typeof IntersectionObserver === "undefined") return null;
  revealIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target as HTMLElement;
        el.addEventListener("transitionend", settle);
        el.dataset.rv = "1";
        revealIO?.unobserve(el);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  return revealIO;
};

const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    const io = getRevealIO();
    if (!io || reduceMotion()) return; // tanpa observer / reduced-motion: tampil biasa
    el.style.setProperty("--rv-i", String(binding.value ?? 0));
    el.dataset.rv = "0";
    io.observe(el);
  },
  unmounted(el) {
    revealIO?.unobserve(el);
  },
};

onMounted(() => {
  loadCatalog();
  loadStores();
  window.addEventListener("resize", syncArrows);
});
onUnmounted(() => {
  window.removeEventListener("resize", syncArrows);
  revealIO?.disconnect();
  revealIO = null;
});
</script>

<template>
  <div class="lp">
    <!-- ============ HERO ============ -->
    <section class="lp-hero">
      <div class="lp-wrap">
        <header class="lp-bar">
          <router-link to="/" class="lp-logo" aria-label="Kaosan, ke beranda">
            <img :src="LogoKaosan" alt="" />
          </router-link>
          <nav class="lp-nav" aria-label="Menu utama">
            <router-link to="/katalog" class="lp-nav-hide">Katalog</router-link>
            <router-link to="/kiosk/premium" class="lp-nav-hide">Premium</router-link>
            <router-link to="/cek-stok-store" class="lp-nav-hide">Cek stok store</router-link>
            <a href="#cara-pesan" class="lp-nav-hide" @click.prevent="keCaraPesan">Cara pesan</a>
            <router-link to="/cek-stok-store" class="lp-nav-pill">Cek stok store</router-link>
          </nav>
        </header>
      </div>

      <div class="lp-hero-in">
        <div class="lp-copy">
          <h1 class="lp-title">Polos yang berkarakter.</h1>
          <p class="lp-sub">
            Kaos polos yang dipilih per kain. Cek stok di store terdekat, susun daftar belanja, lalu
            kirim lewat WhatsApp.
          </p>
          <div class="lp-cta">
            <router-link to="/cek-stok-store" class="lp-btn lp-btn--solid"
              >Mulai belanja</router-link
            >
            <router-link to="/katalog" class="lp-btn lp-btn--ghost">Lihat katalog</router-link>
          </div>
          <p v-if="fakta" class="lp-facts">{{ fakta }}</p>
        </div>

        <!-- Rak: tiap jenis kain tergantung di rel -->
        <div v-if="isLoading || hasError || rak.length" class="lp-rack">
          <template v-if="!isLoading && !hasError">
            <button
              v-show="canPrev"
              type="button"
              class="lp-arrow lp-arrow--prev"
              aria-label="Kain sebelumnya"
              @click="geser(-1)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                <path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              v-show="canNext"
              type="button"
              class="lp-arrow lp-arrow--next"
              aria-label="Kain berikutnya"
              @click="geser(1)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </template>

          <div ref="scroller" class="lp-scroll" @scroll.passive="syncArrows">
            <div v-if="isLoading" class="lp-track lp-track--skel" aria-hidden="true">
              <div v-for="n in 4" :key="n" class="lp-item">
                <span class="lp-neck"></span>
                <span class="lp-swing">
                  <span class="lp-photo lp-skel"></span>
                </span>
              </div>
            </div>

            <div v-else-if="hasError" class="lp-rack-msg">
              <p>Daftar kain belum bisa dimuat.</p>
              <button type="button" class="lp-btn lp-btn--ghost" @click="loadCatalog">
                Coba lagi
              </button>
            </div>

            <div v-else class="lp-track">
              <router-link
                :to="{ name: 'Katalog', params: { kategori: 'semua' } }"
                class="lp-item"
                :style="{ '--i': 0 }"
              >
                <span class="lp-neck"></span>
                <span class="lp-swing">
                  <span class="lp-sway">
                    <svg class="lp-hanger" viewBox="0 0 84 28" aria-hidden="true">
                      <path
                        d="M42 1 L2 27 H82 Z"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linejoin="round"
                      />
                    </svg>
                    <span class="lp-photo">
                      <span class="lp-mosaic">
                        <img
                          v-for="(src, n) in semuaCovers"
                          :key="n"
                          :ref="tandaiCache"
                          :src="src"
                          alt=""
                          decoding="async"
                          @load="onImgLoad"
                        />
                      </span>
                    </span>
                    <span class="lp-cap">
                      <b>Semua koleksi</b><small>{{ rows.length }} produk</small>
                    </span>
                  </span>
                </span>
              </router-link>

              <router-link
                v-for="(f, i) in rak"
                :key="f.nama"
                :to="{ name: 'Katalog', params: { kategori: f.nama } }"
                class="lp-item"
                :style="{ '--i': i + 1 }"
              >
                <span class="lp-neck"></span>
                <span class="lp-swing">
                  <span class="lp-sway">
                    <svg class="lp-hanger" viewBox="0 0 84 28" aria-hidden="true">
                      <path
                        d="M42 1 L2 27 H82 Z"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linejoin="round"
                      />
                    </svg>
                    <span class="lp-photo">
                      <img
                        v-if="f.cover && !rusak[f.cover]"
                        :ref="tandaiCache"
                        :src="f.cover"
                        alt=""
                        decoding="async"
                        @load="onImgLoad"
                        @error="tandaiRusak(f.cover)"
                      />
                      <ProductPlaceholder v-else />
                    </span>
                    <span class="lp-cap">
                      <b>{{ f.nama }}</b
                      ><small>{{ f.jumlah }} produk</small>
                    </span>
                  </span>
                </span>
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="lp-wrap">
      <!-- ============ PROMO ============ -->
      <section v-if="promo.length" class="lp-sec" aria-labelledby="lp-promo-h">
        <h2 id="lp-promo-h" v-reveal class="lp-h2">Sedang promo</h2>
        <div class="lp-promo-grid">
          <router-link
            v-for="(p, i) in promo"
            :key="p.kode"
            v-reveal="i"
            :to="{ name: 'Katalog', params: { kategori: 'semua' }, query: { q: p.kode } }"
            class="lp-pcard"
          >
            <span class="lp-pimg">
              <img
                v-if="p.foto && !rusak[p.foto]"
                :ref="tandaiCache"
                :src="p.foto"
                alt=""
                loading="lazy"
                decoding="async"
                @load="onImgLoad"
                @error="tandaiRusak(p.foto)"
              />
              <ProductPlaceholder v-else />
              <span class="lp-badge">-{{ p.persen }}%</span>
            </span>
            <span class="lp-pbody">
              <h3 class="lp-pname">{{ p.nama }}</h3>
              <span class="lp-pprice">
                {{ p.harga }}
                <s v-if="p.hargaAsli">{{ p.hargaAsli }}</s>
              </span>
            </span>
          </router-link>
        </div>
      </section>
    </div>

    <div class="lp-wrap">
      <!-- ============ CARA PESAN ============ -->
      <section id="cara-pesan" class="lp-sec lp-how" aria-labelledby="lp-how-h">
        <div>
          <h2 id="lp-how-h" v-reveal class="lp-h2">Belanja dari store terdekat</h2>
          <p v-reveal="1" class="lp-lead">
            Susun daftar belanja dari stok yang benar-benar ada di store pilihanmu.
          </p>
          <router-link v-reveal="2" to="/cek-stok-store" class="lp-btn lp-btn--red lp-how-cta"
            >Pilih store</router-link
          >
        </div>

        <ol class="lp-steps">
          <li v-reveal="0" class="lp-step">
            <span class="lp-num" aria-hidden="true">1</span>
            <div>
              <h3>Pilih store</h3>
              <p>Stok tiap store berbeda, jadi mulai dari store yang paling dekat denganmu.</p>
              <div v-if="stores.length" class="lp-pills">
                <router-link
                  v-for="s in stores"
                  :key="s.kode"
                  :to="{ name: 'Stok Toko', params: { toko: s.kode } }"
                  class="lp-pill"
                  >{{ s.nama }}</router-link
                >
              </div>
            </div>
          </li>
          <li v-reveal="1" class="lp-step">
            <span class="lp-num" aria-hidden="true">2</span>
            <div>
              <h3>Pilih kain dan ukuran</h3>
              <p>Lihat harga dan stok per ukuran, lalu tambahkan ke keranjang.</p>
            </div>
          </li>
          <li v-reveal="2" class="lp-step">
            <span class="lp-num" aria-hidden="true">3</span>
            <div>
              <h3>Kirim ke WhatsApp store</h3>
              <p>
                Daftar belanjamu terkirim sebagai pesan. Keranjang tidak menahan stok, ketersediaan
                akhir dikonfirmasi store.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <!-- ============ PREMIUM ============ -->
      <section v-if="premiumList.length" class="lp-prem" aria-labelledby="lp-prem-h">
        <div class="lp-wrap lp-prem-in">
          <div>
            <h2 id="lp-prem-h" v-reveal class="lp-prem-h">Premium <em>Collection</em></h2>
            <p v-reveal="1" class="lp-prem-lead">
              {{ PREMIUM_FABRICS.length }} kain pilihan, masing-masing dengan karakter dan
              perawatannya sendiri.
            </p>
            <ul class="lp-prem-list">
              <li v-for="(f, i) in premiumList" :key="f.id" v-reveal="2 + Math.min(i, 4)">
                <router-link :to="{ path: '/kiosk/premium', query: { kain: f.id } }">{{
                  f.nama
                }}</router-link>
              </li>
            </ul>
            <p v-if="premiumSisa" v-reveal="4" class="lp-prem-more">
              dan {{ premiumSisa }} kain lainnya.
            </p>
            <router-link v-reveal="4" to="/kiosk/premium" class="lp-btn lp-btn--gold"
              >Jelajahi Premium Collection</router-link
            >
          </div>

          <div
            v-if="isLoading || premiumFotos.length"
            class="lp-arches"
            :data-n="isLoading ? 3 : premiumFotos.length"
            aria-hidden="true"
          >
            <template v-if="isLoading">
              <span v-for="n in 3" :key="n" class="lp-arch lp-arch--skel"></span>
            </template>
            <template v-else>
              <span v-for="(src, k) in premiumFotos" :key="src" v-reveal="k + 1" class="lp-arch">
                <img
                  :ref="tandaiCache"
                  :src="src"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  @load="onImgLoad"
                  @error="tandaiRusak(src)"
                />
              </span>
            </template>
          </div>
        </div>
      </section>
    </div>

    <SiteFooter class="lp-foot" max-width="1320px" dark />
  </div>
</template>

<style scoped>
.lp {
  --red: #b71c1c;
  --red-deep: #8e0000;
  --red-price: #d32f2f;
  --ink: #1f1a19;
  --muted: #6f6663;
  --line: #e9dfdb;
  --bg: #faf6f4;
  --on-red: #faf6f4;
  --on-red-2: rgba(250, 246, 244, 0.86);
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --serif: "Playfair Display Variable", "Playfair Display", Georgia, serif;
  --sans: "Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif;
  --gutter: clamp(20px, 4vw, 56px);
  --wrap: 1320px;
  --cw: clamp(176px, 58vw, 236px);
  min-height: 100vh;
  color: var(--ink);
  background: var(--bg);
  font-family: var(--sans);
}
.lp *,
.lp *::before,
.lp *::after {
  box-sizing: border-box;
}
/* :where() menjaga spesifisitas tetap rendah, supaya warna tombol tidak tertimpa */
.lp :where(a) {
  color: inherit;
  text-decoration: none;
}
.lp-wrap {
  max-width: var(--wrap);
  margin: 0 auto;
  padding: 0 var(--gutter);
}

/* ===== Hero ===== */
.lp-hero {
  position: relative;
  overflow: hidden;
  color: var(--on-red);
  background: var(--red);
}
/* garis jahitan di tepi bawah */
.lp-hero::after {
  content: "";
  position: absolute;
  left: var(--gutter);
  right: var(--gutter);
  bottom: 16px;
  border-top: 2px dashed rgba(250, 246, 244, 0.4);
  pointer-events: none;
}
.lp-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 76px;
}
.lp-logo {
  display: block;
  padding: 3px;
  background: #fff;
  border-radius: 11px;
  line-height: 0;
}
.lp-logo img {
  display: block;
  width: auto;
  height: 38px;
  border-radius: 8px;
}
.lp-nav {
  display: flex;
  align-items: center;
  gap: 28px;
}
.lp-nav a {
  padding: 10px 0;
  border-bottom: 2px solid transparent;
  font-size: 0.9375rem;
  font-weight: 600;
  transition: border-color 0.3s var(--ease);
}
.lp-nav-hide {
  display: none;
}
.lp-nav .lp-nav-pill {
  padding: 9px 16px;
  border: 1.5px solid rgba(250, 246, 244, 0.6);
  border-radius: 999px;
}

.lp-hero-in {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 36px;
  padding: 28px 0 64px var(--gutter);
}
.lp-copy {
  padding-right: var(--gutter);
}
.lp-title {
  margin: 0;
  font-family: var(--serif);
  font-size: clamp(2.7rem, 11.5vw, 4.5rem);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.lp-sub {
  max-width: 27rem;
  margin: 20px 0 0;
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--on-red-2);
}
.lp-cta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 28px;
}
.lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 26px;
  border: 1.5px solid transparent;
  border-radius: 999px;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.3s var(--ease), color 0.3s var(--ease);
}
.lp-btn--solid {
  color: var(--red);
  background: var(--on-red);
}
.lp-btn--ghost {
  color: var(--on-red);
  background: transparent;
  border-color: rgba(250, 246, 244, 0.6);
}
.lp-btn--red {
  color: var(--on-red);
  background: var(--red);
}
.lp-facts {
  margin: 22px 0 0;
  font-size: 0.8125rem;
  color: var(--on-red-2);
  font-variant-numeric: tabular-nums;
}

/* ===== Rak ===== */
.lp-rack {
  position: relative;
  min-width: 0;
}
.lp-scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.lp-scroll::-webkit-scrollbar {
  display: none;
}
.lp-track {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 28px;
  width: max-content;
  padding: 0 var(--gutter) 6px 0;
}
/* rel */
.lp-track::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 4px;
  border-radius: 2px;
  background: var(--on-red);
  box-shadow: 0 5px 8px rgba(40, 4, 4, 0.35);
}
.lp-item {
  position: relative;
  flex: none;
  width: var(--cw);
  scroll-snap-align: start;
}
/* panjang gantungan dibuat beragam supaya rak terlihat alami */
.lp-item:nth-child(5n + 1) {
  --drop: 30px;
}
.lp-item:nth-child(5n + 2) {
  --drop: 54px;
}
.lp-item:nth-child(5n + 3) {
  --drop: 38px;
}
.lp-item:nth-child(5n + 4) {
  --drop: 64px;
}
.lp-item:nth-child(5n) {
  --drop: 46px;
}
.lp-neck {
  position: relative;
  display: block;
  width: 2px;
  height: var(--drop);
  margin: 0 auto;
  background: var(--on-red);
}
/* cincin tempat gantungan melingkari rel */
.lp-neck::before {
  content: "";
  position: absolute;
  top: -5px;
  left: 50%;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  border: 2px solid var(--on-red);
  border-radius: 50%;
  background: var(--red);
}
.lp-swing,
.lp-sway {
  display: block;
  transform-origin: 50% 0;
}
.lp-hanger {
  display: block;
  width: 84px;
  height: 28px;
  margin: 0 auto -1px;
  overflow: visible;
  color: var(--on-red);
}
.lp-photo {
  position: relative;
  display: block;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(60, 6, 6, 0.35);
  box-shadow: 0 26px 34px -14px rgba(40, 4, 4, 0.6);
}
.lp-photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  opacity: 0;
  transition: opacity 0.5s ease;
}
.lp-photo img.is-loaded {
  opacity: 1;
}
.lp-mosaic {
  display: grid;
  grid-template: 1fr 1fr / 1fr 1fr;
  height: 100%;
}
.lp-cap {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 2px 0;
}
.lp-cap b {
  font-size: 0.9375rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.lp-cap small {
  flex: none;
  font-size: 0.8125rem;
  color: var(--on-red-2);
  font-variant-numeric: tabular-nums;
}
.lp-track--skel .lp-swing {
  animation: none;
}
.lp-skel {
  background: rgba(250, 246, 244, 0.14);
  animation: lp-pulse 1.4s ease-in-out infinite;
}
.lp-rack-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 40px var(--gutter) 0 0;
}
.lp-rack-msg p {
  margin: 0;
  color: var(--on-red-2);
}
.lp-arrow {
  position: absolute;
  top: 190px;
  z-index: 2;
  display: none;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border: 0;
  border-radius: 50%;
  color: var(--red);
  background: var(--on-red);
  box-shadow: 0 10px 22px rgba(40, 4, 4, 0.4);
  cursor: pointer;
}
.lp-arrow--prev {
  left: 12px;
}
.lp-arrow--next {
  right: calc(var(--gutter) - 6px);
}
.lp-arrow svg {
  width: 20px;
  height: 20px;
}

/* ===== Seksi di atas krem ===== */
.lp-sec {
  padding: 72px 0 0;
}
.lp-h2 {
  margin: 0;
  font-family: var(--serif);
  font-size: clamp(1.75rem, 4.2vw, 2.5rem);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
.lp-promo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 28px;
}
.lp-pcard {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  transition: box-shadow 0.4s var(--ease), transform 0.4s var(--ease);
}
.lp-pimg {
  position: relative;
  display: block;
  aspect-ratio: 1 / 1;
  background: #f1e9e5;
}
.lp-pimg img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  opacity: 0;
  transition: opacity 0.5s ease;
}
.lp-pimg img.is-loaded {
  opacity: 1;
}
.lp-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--on-red);
  background: var(--red);
}
.lp-pbody {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px 14px;
}
.lp-pname {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.lp-pprice {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin-top: auto;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--red-price);
  font-variant-numeric: tabular-nums;
}
.lp-pprice s {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--muted);
}

.lp-how {
  display: grid;
  gap: 32px;
}
.lp-lead {
  max-width: 26rem;
  margin: 16px 0 0;
  font-size: 1rem;
  line-height: 1.65;
  color: var(--muted);
}
.lp-how-cta {
  margin-top: 24px;
}
.lp-steps {
  margin: 0;
  padding: 0;
  list-style: none;
}
.lp-step {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 6px 16px;
  padding: 22px 0;
  border-top: 1px solid var(--line);
}
.lp-step:last-child {
  border-bottom: 1px solid var(--line);
}
.lp-num {
  font-family: var(--serif);
  font-size: 2.5rem;
  font-weight: 600;
  line-height: 1;
  color: var(--red);
}
.lp-step h3 {
  margin: 4px 0 6px;
  font-size: 1.0625rem;
  font-weight: 700;
}
.lp-step p {
  max-width: 34rem;
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--muted);
}
.lp-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.lp-pill {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  transition: color 0.25s var(--ease), border-color 0.25s var(--ease);
}
.lp-foot {
  margin-top: 0;
}

/* ===== Premium Collection (band gelap-emas) ===== */
.lp-prem {
  --pm-gold: #d8bd84;
  --pm-gold-hi: #e6cf98;
  --pm-gold-lo: #c9a95e;
  --pm-line: rgba(216, 189, 132, 0.2);
  --pm-cream: #f3e8d2;
  --pm-bg: #0e0605;
  --pm-serif: "Cormorant Variable", "Cormorant Garamond", Georgia, serif;
  --pm-sans: "Jost Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
  position: relative;
  margin-top: 88px;
  padding: 72px 0 64px;
  color: var(--pm-cream);
  font-family: var(--pm-sans);
  background: radial-gradient(800px 520px at 82% 40%, rgba(160, 110, 40, 0.18), transparent 70%),
    radial-gradient(620px 420px at 0% 100%, rgba(120, 18, 18, 0.3), transparent 70%), var(--pm-bg);
}
/* garis jahitan emas di tepi atas, gema dari garis jahitan merah di hero */
.lp-prem::before {
  content: "";
  position: absolute;
  top: 14px;
  left: var(--gutter);
  right: var(--gutter);
  border-top: 2px dashed rgba(216, 189, 132, 0.28);
  pointer-events: none;
}
.lp-prem-in {
  display: grid;
  gap: 40px;
}
.lp-prem-h {
  margin: 0;
  font-family: var(--pm-serif);
  font-size: clamp(2.5rem, 8vw, 4.25rem);
  font-weight: 600;
  line-height: 1.02;
  letter-spacing: -0.01em;
}
.lp-prem-h em {
  font-style: italic;
  color: var(--pm-gold);
}
.lp-prem-lead {
  max-width: 40ch;
  margin: 16px 0 0;
  font-size: 1rem;
  font-weight: 300;
  line-height: 1.7;
  color: rgba(243, 232, 210, 0.8);
}
.lp-prem-list {
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
  columns: 1;
  column-gap: 36px;
}
.lp-prem-list li {
  break-inside: avoid;
}
.lp-prem-list a {
  position: relative;
  display: block;
  padding: 12px 2px;
  border-bottom: 1px solid var(--pm-line);
  font-family: var(--pm-serif);
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1.2;
  color: rgba(243, 232, 210, 0.92);
  transition: color 0.25s var(--ease);
}
.lp-prem-list a::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 2px;
  background: var(--pm-gold);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.3s var(--ease);
}
.lp-prem-more {
  margin: 14px 0 0;
  font-size: 0.8125rem;
  color: rgba(243, 232, 210, 0.6);
}
.lp-btn--gold {
  margin-top: 30px;
  color: #1a0d0b;
  background: var(--pm-gold);
}

/* foto berbingkai lengkung */
.lp-arches {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: flex-end;
  gap: 22px; /* lebih lebar dari 2 x ring (10px) agar bingkai tidak bertabrakan */
  height: min(46vh, 320px);
  padding: 12px 12px 0;
  order: -1;
}
.lp-arches::before {
  content: "";
  position: absolute;
  z-index: -1;
  inset: -10% -14% 0;
  background: radial-gradient(closest-side, rgba(216, 189, 132, 0.2), transparent 72%);
}
.lp-arch {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  border-radius: 999px 999px 14px 14px;
  background: #1d1411;
  box-shadow: 0 0 0 3px var(--pm-bg), 0 0 0 4px var(--pm-gold-lo), 0 0 0 9px var(--pm-bg),
    0 0 0 10px rgba(216, 189, 132, 0.3), 0 24px 48px rgba(0, 0, 0, 0.5);
}
.lp-arches:not([data-n="1"]) .lp-arch:nth-child(1) {
  height: 76%;
}
.lp-arches:not([data-n="1"]) .lp-arch:nth-child(3) {
  height: 64%;
}
.lp-arch img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
  opacity: 0;
  transition: opacity 0.6s ease;
}
.lp-arch img.is-loaded {
  opacity: 1;
}
.lp-arch--skel {
  background: linear-gradient(90deg, #1d1411 25%, #2a1c17 50%, #1d1411 75%);
  background-size: 200% 100%;
  animation: lp-pshim 1.6s linear infinite;
}
@keyframes lp-pshim {
  to {
    background-position: -200% 0;
  }
}

.lp .lp-prem a:focus-visible {
  outline: 2px solid var(--pm-gold);
  outline-offset: 3px;
}
.lp-prem-list a:active {
  color: var(--pm-gold);
}
@media (hover: hover) {
  .lp-btn--gold:hover {
    background: var(--pm-gold-hi);
  }
  .lp-prem-list a:hover {
    color: var(--pm-gold);
  }
  .lp-prem-list a:hover::after {
    transform: scaleX(1);
  }
}
@media (min-width: 640px) {
  .lp-prem-list {
    columns: 2;
  }
}
@media (min-width: 960px) {
  .lp-prem {
    padding: 96px 0 88px;
  }
  .lp-prem-in {
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
    align-items: center;
    gap: 64px;
  }
  .lp-arches {
    order: 0;
    height: min(58vh, 460px);
  }
}

/* ===== Muncul saat di-scroll (diatur oleh v-reveal) ===== */
.lp [data-rv] {
  transition: opacity 0.9s var(--ease), translate 0.9s var(--ease);
  transition-delay: calc(var(--rv-i, 0) * 80ms);
}
.lp [data-rv="0"] {
  opacity: 0;
  translate: 0 28px;
}

/* ===== Fokus ===== */
.lp a:focus-visible,
.lp button:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 3px;
}
.lp-hero a:focus-visible,
.lp-hero button:focus-visible {
  outline-color: var(--on-red);
}

/* ===== Gerak: gantungan jatuh sekali saat halaman dibuka ===== */
@keyframes lp-hang {
  0% {
    opacity: 0;
    transform: rotate(-5deg) translateY(-10px);
  }
  55% {
    opacity: 1;
    transform: rotate(1.6deg);
  }
  80% {
    transform: rotate(-0.6deg);
  }
  100% {
    opacity: 1;
    transform: rotate(0);
  }
}
@keyframes lp-sway {
  0% {
    transform: rotate(0);
  }
  35% {
    transform: rotate(2.2deg);
  }
  70% {
    transform: rotate(-1.2deg);
  }
  100% {
    transform: rotate(0);
  }
}
@keyframes lp-pulse {
  50% {
    opacity: 0.55;
  }
}
.lp-swing {
  animation: lp-hang 1.1s var(--ease) both;
  animation-delay: calc(var(--i, 0) * 80ms + 150ms);
}

@media (hover: hover) {
  .lp-nav a:hover {
    border-bottom-color: var(--on-red);
  }
  .lp-btn--solid:hover {
    background: #fff;
  }
  .lp-btn--ghost:hover {
    background: rgba(250, 246, 244, 0.14);
  }
  .lp-btn--red:hover {
    background: var(--red-deep);
  }
  .lp-item:hover .lp-sway {
    animation: lp-sway 1.2s var(--ease);
  }
  .lp-pcard:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 30px rgba(60, 20, 15, 0.14);
  }
  .lp-pill:hover {
    color: var(--red);
    border-color: var(--red);
  }
}
@media (hover: none) {
  .lp-btn:active,
  .lp-pcard:active {
    transform: scale(0.97);
  }
}

/* ===== Lebar layar ===== */
@media (min-width: 760px) {
  .lp-nav-hide {
    display: inline-block;
  }
  .lp-nav .lp-nav-pill {
    display: none;
  }
  .lp-promo-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 18px;
  }
}
@media (min-width: 960px) {
  .lp {
    --cw: 228px;
  }
  .lp-hero-in {
    grid-template-columns: minmax(0, 27rem) minmax(0, 1fr);
    align-items: start;
    gap: 24px;
    padding: 44px 0 80px max(var(--gutter), calc((100% - var(--wrap)) / 2 + var(--gutter)));
  }
  .lp-copy {
    padding-top: 28px;
    padding-right: 0;
  }
  .lp-arrow {
    display: inline-flex;
  }
  .lp-how {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 64px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lp *,
  .lp *::before,
  .lp *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>

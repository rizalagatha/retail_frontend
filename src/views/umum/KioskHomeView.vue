<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import LogoKaosan from "@/assets/logo.png";
import QrKaostudio from "@/assets/qr-kaostudio.png";
import { PAMERAN_KODE } from "@/composables/useKiosk";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/manrope";
import "@fontsource-variable/cormorant";
import "@fontsource-variable/cormorant/wght-italic.css";
import "@fontsource-variable/jost";

interface CatalogRow {
  gambar_url: string | null;
}
interface StokRow {
  kode: string;
  stok: number;
}
interface Promo {
  pro_judul: string;
  pro_diskon: number;
  pro_disrp: number;
  pro_rpvoucher: number;
  pro_totalqty: number;
  pro_tanggal2: string;
}

const router = useRouter();

// ====== SESUAIKAN ======
const SIGNAGE_URL = import.meta.env.VITE_SIGNAGE_URL as string | undefined;
const ATTRACT_AFTER_MS = 45_000; // diam sebelum layar tunggu (signage) muncul
const PHOTO_ROTATE_MS = 4_000;
const PROMO_ROTATE_MS = 6_000;
const STOK_POLL_MS = 20_000;
// =======================

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rupiah = (n: number) => new Intl.NumberFormat("id-ID").format(Number(n) || 0);
const nice = (s: string) => (s || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

// ---------- Foto ----------
const photos = ref<string[]>([]);
const produkCount = ref(0);

const shuffle = <T>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const loadPhotos = async () => {
  try {
    const { data } = await api.get<CatalogRow[]>("/so/public/katalog");
    produkCount.value = data.length;
    photos.value = shuffle(data.map((r) => r.gambar_url).filter((u): u is string => !!u)).slice(
      0,
      30
    );
  } catch {
    photos.value = []; // tanpa foto, latar tetap gradasi gelap
  }
};

const COLS = 5;
const columns = computed(() => {
  const per = Math.ceil(photos.value.length / COLS) || 1;
  return Array.from({ length: COLS }, (_, i) => photos.value.slice(i * per, (i + 1) * per)).filter(
    (c) => c.length
  );
});

const tick = ref(0);
const tilePhoto = computed(() =>
  photos.value.length ? photos.value[tick.value % photos.value.length] : null
);

// ---------- Stok pameran (angka hidup) ----------
const stokTotal = ref<number | null>(null);
const stokModels = ref(0);
const stokShown = ref(0);
let raf = 0;

const loadStok = async () => {
  try {
    const { data } = await api.get<StokRow[]>("/so/public/cek-stok", {
      params: { cabang: PAMERAN_KODE, q: "" },
    });
    stokTotal.value = data.reduce((a, r) => a + Math.max(0, Number(r.stok) || 0), 0);
    stokModels.value = new Set(data.filter((r) => Number(r.stok) > 0).map((r) => r.kode)).size;
  } catch {
    // pertahankan angka terakhir
  }
};

// Angka bergerak dari nilai lama ke nilai baru, jadi pengurangan stok terlihat
watch(stokTotal, (to) => {
  if (to === null) return;
  cancelAnimationFrame(raf);
  if (reduceMotion) {
    stokShown.value = to;
    return;
  }
  const from = stokShown.value;
  const t0 = performance.now();
  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / 900);
    stokShown.value = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
});

// ---------- Promo ----------
const promos = ref<Promo[]>([]);
const promoIdx = ref(0);

const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate()
  ).padStart(2, "0")}`;
};

const loadPromos = async () => {
  try {
    const { data } = await api.get<Promo[]>("/so/public/active-promos", {
      params: { cabang: "K01", tanggal: today() },
    });
    promos.value = data;
  } catch {
    promos.value = [];
  }
};

const promoValue = (p: Promo) => {
  if (p.pro_diskon > 0) return { label: "Diskon", big: `${Number(p.pro_diskon)}%` };
  if (p.pro_disrp > 0) return { label: "Potongan", big: `Rp${rupiah(p.pro_disrp)}` };
  if (p.pro_rpvoucher > 0) return { label: "Voucher", big: `Rp${rupiah(p.pro_rpvoucher)}` };
  if (p.pro_totalqty > 0) return { label: "Bundling", big: `Beli ${p.pro_totalqty}` };
  return { label: "Promo", big: "Spesial" };
};

const daysLeft = (d: string) => {
  const end = new Date(d);
  end.setHours(23, 59, 59);
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
};

const currentPromo = computed(() =>
  promos.value.length ? promos.value[promoIdx.value % promos.value.length] : null
);
const currentValue = computed(() => (currentPromo.value ? promoValue(currentPromo.value) : null));
const currentDays = computed(() => {
  if (!currentPromo.value) return "";
  const d = daysLeft(currentPromo.value.pro_tanggal2);
  return d === 0 ? "Berakhir hari ini" : `Sisa ${d} hari`;
});

// ---------- Progres pesanan (ilustrasi tile Lacak) ----------
const steps = ["Diproses", "Produksi", "QC", "Siap"];

// ---------- Layar tunggu / signage ----------
const attract = ref(false);
let idleTimer: ReturnType<typeof setTimeout> | undefined;

const arm = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => (attract.value = true), ATTRACT_AFTER_MS);
};
const wake = () => {
  attract.value = false;
  arm();
};

// Perbesar iframe signage agar video 1280x720 mengisi layar (tepi hitam terpotong)
const VIDEO_W = 1280;
const VIDEO_H = 720;
const attractScale = ref(1);
const calcScale = () => {
  const portrait = window.innerHeight > window.innerWidth;
  const w = portrait ? window.innerHeight : window.innerWidth; // iframe diputar 90deg di portrait
  const h = portrait ? window.innerWidth : window.innerHeight;
  attractScale.value = Math.min(w / VIDEO_W, h / VIDEO_H);
};

// Di luar layar tunggu: sentuhan hanya mengatur ulang timer. Di layar tunggu, penutupan ditangani lapisan .kh-attract-wake
const onPointer = () => {
  if (!attract.value) arm();
};

let photoTimer: ReturnType<typeof setInterval> | undefined;
let promoTimer: ReturnType<typeof setInterval> | undefined;
let stokTimer: ReturnType<typeof setInterval> | undefined;
let slowTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  loadPhotos();
  loadPromos();
  loadStok();
  arm();
  calcScale();
  photoTimer = setInterval(() => tick.value++, PHOTO_ROTATE_MS);
  promoTimer = setInterval(() => {
    if (promos.value.length > 1) promoIdx.value++;
  }, PROMO_ROTATE_MS);
  stokTimer = setInterval(loadStok, STOK_POLL_MS);
  slowTimer = setInterval(loadPromos, 600_000); // kiosk menyala berhari-hari, promo perlu disegarkan
  window.addEventListener("resize", calcScale);
  window.addEventListener("pointerdown", onPointer, { passive: true });
});
onUnmounted(() => {
  clearTimeout(idleTimer);
  clearInterval(photoTimer);
  clearInterval(promoTimer);
  clearInterval(stokTimer);
  clearInterval(slowTimer);
  cancelAnimationFrame(raf);
  window.removeEventListener("resize", calcScale);
  window.removeEventListener("pointerdown", onPointer);
});
</script>

<template>
  <div class="kh">
    <!-- LATAR: kolom foto bergerak -->
    <div class="kh-bg" aria-hidden="true">
      <div
        v-for="(col, ci) in columns"
        :key="ci"
        class="kh-col"
        :class="ci % 2 ? 'kh-col--down' : 'kh-col--up'"
        :style="{ '--speed': 70 + ci * 9 + 's' }"
      >
        <img v-for="(src, i) in [...col, ...col]" :key="i" :src="src" alt="" decoding="async" />
      </div>
    </div>
    <div class="kh-shade"></div>

    <main class="kh-content">
      <section class="kh-brand">
        <span class="kh-logo"><img :src="LogoKaosan" height="36" alt="Kaosan" /></span>
        <div class="kh-eyebrow">Selamat datang</div>
        <h1 class="kh-title">Kaosan</h1>
        <p class="kh-sub">Kaos polos dari berbagai jenis kain. Sentuh untuk mulai.</p>
      </section>

      <section class="kh-grid">
        <!-- KATALOG: foto bergantian -->
        <button class="kh-tile kh-tile--katalog" style="--i: 0" @click="router.push('/katalog')">
          <Transition name="kh-photo">
            <img
              v-if="tilePhoto"
              :key="tilePhoto"
              :src="tilePhoto"
              class="kh-tile-photo"
              alt=""
              decoding="async"
            />
          </Transition>
          <span class="kh-tile-text">
            <span class="kh-tile-title">Katalog</span>
            <span class="kh-tile-desc">
              {{
                produkCount
                  ? `${produkCount} produk, dikelompokkan per jenis kain`
                  : "Lihat koleksi berdasarkan jenis kain"
              }}
            </span>
          </span>
        </button>

        <!-- KAOS STUDIO: kaos yang berganti warna dan area cetak -->
        <button
          class="kh-tile kh-tile--studio"
          style="--i: 1"
          @click="router.push('/kiosk/studio')"
        >
          <span class="kh-studio-art" aria-hidden="true">
            <svg class="kh-studio-shirt" viewBox="0 0 120 120">
              <defs>
                <linearGradient id="kh-shade" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#fff" stop-opacity="0.3" />
                  <stop offset="0.55" stop-color="#fff" stop-opacity="0" />
                  <stop offset="1" stop-color="#000" stop-opacity="0.3" />
                </linearGradient>
              </defs>
              <ellipse class="kh-studio-ground" cx="60" cy="112" rx="30" ry="4" />
              <path
                class="kh-studio-body"
                d="M40 14 L16 28 L24 50 L36 44 L36 104 Q36 106 38 106 L82 106 Q84 106 84 104 L84 44 L96 50 L104 28 L80 14 Q74 24 60 24 Q46 24 40 14 Z"
              />
              <path
                fill="url(#kh-shade)"
                d="M40 14 L16 28 L24 50 L36 44 L36 104 Q36 106 38 106 L82 106 Q84 106 84 104 L84 44 L96 50 L104 28 L80 14 Q74 24 60 24 Q46 24 40 14 Z"
              />
              <path class="kh-studio-neck" d="M42 14 Q60 10 78 14 Q74 24 60 24 Q46 24 42 14 Z" />
              <path class="kh-studio-seam" d="M40 14 Q46 24 60 24 Q74 24 80 14" />
              <path class="kh-studio-seam" d="M38 19 Q34 32 36 44 M82 19 Q86 32 84 44" />
              <path class="kh-studio-fold" d="M44 96 Q52 84 50 70 M76 98 Q70 86 72 72" />
              <rect class="kh-studio-guide" x="46" y="44" width="28" height="28" rx="3" />
              <g class="kh-studio-motif">
                <circle pathLength="100" cx="60" cy="52" r="4.5" />
                <path pathLength="100" d="M47 70 L56 58 L61 65 L66 59 L73 70 Z" />
              </g>
            </svg>
            <span class="kh-studio-sw"><i></i><i></i><i></i><i></i></span>
          </span>
          <span class="kh-studio-qr">
            <img
              :src="QrKaostudio"
              alt="Kode QR menuju kaostudio.kaosanofficial.com"
              draggable="false"
            />
          </span>
          <span class="kh-studio-main">
            <span class="kh-studio-badge">Baru</span>
            <span class="kh-tile-text">
              <span class="kh-tile-title">KaoStudio</span>
              <span class="kh-tile-desc">Rancang desain kaosmu, harga langsung terhitung</span>
            </span>
          </span>
        </button>

        <!-- STOK PAMERAN: angka hidup -->
        <button class="kh-tile kh-tile--stok" style="--i: 2" @click="router.push('/cek-stok')">
          <span class="kh-live"><i class="kh-live-dot"></i>Stok langsung</span>
          <span class="kh-stok-num">{{ stokTotal === null ? "-" : rupiah(stokShown) }}</span>
          <span class="kh-tile-text">
            <span class="kh-tile-title">Stok Pameran</span>
            <span class="kh-tile-desc">
              {{
                stokModels
                  ? `pcs siap di ${stokModels} model`
                  : "Ketersediaan barang di pameran ini"
              }}
            </span>
          </span>
        </button>

        <!-- LACAK: garis progres -->
        <button class="kh-tile kh-tile--lacak" style="--i: 3" @click="router.push('/tracking')">
          <span class="kh-tile-text">
            <span class="kh-tile-title">Lacak Pesanan</span>
            <span class="kh-tile-desc">Masukkan nomor resi dari struk atau WhatsApp</span>
          </span>
          <span class="kh-steps" aria-hidden="true">
            <span class="kh-steps-track"><i class="kh-steps-fill"></i></span>
            <span v-for="s in steps" :key="s" class="kh-step">
              <i class="kh-step-dot"></i><em>{{ s }}</em>
            </span>
          </span>
        </button>

        <!-- PREMIUM: koleksi kain pilihan -->
        <button
          class="kh-tile kh-tile--premium"
          style="--i: 5"
          @click="router.push('/kiosk/premium')"
        >
          <span class="kh-prem-sheen" aria-hidden="true"></span>
          <span class="kh-prem-frame" aria-hidden="true"></span>
          <span class="kh-prem-body">
            <span class="kh-prem-eyebrow"><i></i>Koleksi Pilihan<i></i></span>
            <span class="kh-prem-title">Premium</span>
            <span class="kh-prem-desc">Keunggulan tiap jenis kain</span>
          </span>
        </button>

        <!-- INFO & PROMO: kupon dari promo aktif -->
        <button class="kh-tile kh-tile--info" style="--i: 4" @click="attract = true">
          <span class="kh-tile-text">
            <span class="kh-tile-title">Info &amp; Promo</span>
            <span class="kh-tile-desc">
              {{
                promos.length ? "Promo yang sedang berlaku" : "Tayangan promo dan informasi Kaosan"
              }}
            </span>
          </span>
          <Transition name="kh-swap" mode="out-in">
            <span v-if="currentPromo && currentValue" :key="promoIdx" class="kh-coupon">
              <span class="kh-coupon-val">
                <small>{{ currentValue.label }}</small>
                <b>{{ currentValue.big }}</b>
              </span>
              <span class="kh-coupon-body">
                <strong>{{ nice(currentPromo.pro_judul) }}</strong>
                <em>{{ currentDays }}</em>
              </span>
            </span>
          </Transition>
        </button>
      </section>
    </main>

    <!-- LAYAR TUNGGU / SIGNAGE -->
    <Transition name="kh-fade">
      <div v-if="attract" class="kh-attract">
        <iframe
          v-if="SIGNAGE_URL"
          :src="SIGNAGE_URL"
          title="Signage Kaosan"
          allow="autoplay"
          tabindex="-1"
          :style="{ pointerEvents: 'auto', '--kh-scale': attractScale }"
        ></iframe>
        <div class="kh-attract-wake" @pointerdown="wake"></div>
        <div class="kh-attract-hint"><span class="kh-pulse"></span>Sentuh layar untuk mulai</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.kh {
  --kh-display: "Bricolage Grotesque Variable", "Plus Jakarta Sans", system-ui, sans-serif;
  --kh-body: "Manrope Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
  position: fixed;
  inset: 0;
  overflow: hidden;
  color: #fff;
  background: #1a0d0b;
  font-family: var(--kh-body);
}

/* ---------- Latar ---------- */
.kh-bg {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  padding: 0 12px;
  overflow: hidden;
}
.kh-col {
  will-change: transform;
  animation: kh-up var(--speed, 80s) linear infinite;
}
.kh-col--down {
  animation-name: kh-down;
}
.kh-col img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  margin-bottom: 12px; /* margin (bukan gap) agar loop -50% pas tanpa loncat */
  border-radius: 14px;
  object-fit: cover;
  object-position: center 20%;
}
@keyframes kh-up {
  to {
    transform: translateY(-50%);
  }
}
@keyframes kh-down {
  from {
    transform: translateY(-50%);
  }
  to {
    transform: translateY(0);
  }
}
.kh-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
      90deg,
      rgba(20, 8, 6, 0.92) 0%,
      rgba(20, 8, 6, 0.7) 45%,
      rgba(20, 8, 6, 0.5) 100%
    ),
    radial-gradient(900px 500px at 0% 100%, rgba(183, 28, 28, 0.35), transparent 70%);
}

/* ---------- Isi ---------- */
.kh-content {
  position: relative;
  z-index: 2;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(260px, 0.7fr) 1.5fr;
  align-items: center;
  gap: 2.5vw;
  padding: 5vh 3.5vw 5vh 3vw;
}
.kh-brand > * {
  opacity: 0;
  animation: kh-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.kh-brand > :nth-child(1) {
  animation-delay: 0.05s;
}
.kh-brand > :nth-child(2) {
  animation-delay: 0.15s;
}
.kh-brand > :nth-child(3) {
  animation-delay: 0.25s;
}
.kh-brand > :nth-child(4) {
  animation-delay: 0.4s;
}
.kh-logo {
  display: inline-flex;
  margin-bottom: 4vh;
  padding: 8px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
}
.kh-eyebrow {
  font-size: clamp(12px, 1vw, 16px);
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  opacity: 0.8;
}
.kh-title {
  margin: 1.5vh 0 2vh;
  font-family: var(--kh-display);
  font-size: clamp(64px, min(8.2vw, 17vh), 150px);
  font-weight: 800;
  line-height: 0.88;
  letter-spacing: -0.045em;
  max-width: 100%;
  overflow-wrap: normal;
}
.kh-sub {
  max-width: 26ch;
  margin: 0;
  font-size: clamp(15px, 1.5vw, 24px);
  font-weight: 500;
  line-height: 1.5;
  opacity: 0.9;
}

/* ---------- Bento ---------- */
.kh-grid {
  display: grid;
  grid-template-columns: 1.25fr 1fr 1fr;
  grid-template-rows: minmax(0, 1.1fr) minmax(0, 1.25fr) auto;
  grid-template-areas:
    "katalog studio studio"
    "katalog stok lacak"
    "premium info info";
  gap: 1.6vw;
  height: min(86vh, 900px);
}
.kh-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  min-height: 0;
  padding: clamp(18px, 2vw, 32px);
  overflow: hidden;
  border: none;
  border-radius: 28px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  animation: kh-tile-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(0.3s + var(--i) * 0.1s);
  transition: transform 0.12s ease;
}
/* transform dibiarkan bebas, karena animasi masuk memakai properti translate/scale */
.kh-tile:active {
  transform: scale(0.96);
}
.kh-tile-title {
  display: block;
  font-family: var(--kh-display);
  font-size: clamp(22px, min(2.4vw, 3.6vh), 44px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.025em;
}
.kh-tile-desc {
  display: block;
  margin-top: 6px;
  max-width: 30ch;
  font-size: clamp(13px, 1.1vw, 19px);
  font-weight: 500;
  line-height: 1.4;
  opacity: 0.8;
}
.kh-tile--stok .kh-tile-title,
.kh-tile--lacak .kh-tile-title {
  white-space: nowrap;
}

/* Katalog */
.kh-tile--katalog {
  grid-area: katalog;
  justify-content: flex-end;
  color: #fff;
  background: #2a1512;
}
.kh-tile--katalog::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    0deg,
    rgba(20, 8, 6, 0.9) 0%,
    rgba(20, 8, 6, 0.15) 60%,
    transparent 100%
  );
}
.kh-tile--katalog .kh-tile-text {
  position: relative;
  z-index: 1;
}
.kh-tile-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
}
.kh-photo-enter-active,
.kh-photo-leave-active {
  transition: opacity 1s ease;
}
.kh-photo-enter-from,
.kh-photo-leave-to {
  opacity: 0;
}

/* Kaos Studio */
.kh-tile--studio {
  grid-area: studio;
  flex-direction: row;
  align-items: stretch;
  justify-content: flex-start;
  gap: clamp(14px, 1.6vw, 26px);
  padding: clamp(12px, 1.2vw, 18px) clamp(18px, 2vw, 32px) clamp(12px, 1.2vw, 18px)
    clamp(12px, 1.2vw, 18px);
  color: #1f1a19;
  background: #faf6f4;
}
.kh-studio-qr {
  flex: none;
  display: flex;
  height: 100%;
  max-width: 42%;
  aspect-ratio: 378 / 603;
  overflow: hidden;
  border: 1.5px solid #7a1626;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(122, 22, 38, 0.1);
  pointer-events: none;
}
.kh-studio-qr img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}
.kh-studio-main {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  padding: clamp(6px, 0.8vw, 14px) 0;
}
.kh-tile--studio .kh-studio-art {
  width: clamp(90px, 9vw, 160px);
}
.kh-tile--studio .kh-tile-desc {
  max-width: 22ch;
}
.kh-tile--studio .kh-tile-text {
  position: relative;
  z-index: 1;
}
.kh-studio-badge {
  position: relative;
  z-index: 1;
  align-self: flex-start;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: clamp(11px, 0.9vw, 15px);
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fff;
  background: #b71c1c;
}
.kh-studio-art {
  position: absolute;
  top: 8%;
  right: 5%;
  width: clamp(120px, 13vw, 220px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  animation: kh-art-bob 6s ease-in-out infinite;
}
.kh-studio-shirt {
  width: 100%;
  overflow: visible;
}
.kh-studio-ground {
  fill: rgba(60, 20, 15, 0.14);
}
.kh-studio-body {
  fill: #b71c1c;
  animation: kh-shirt-color 12s ease-in-out infinite;
}
.kh-studio-neck {
  fill: rgba(0, 0, 0, 0.32);
}
.kh-studio-seam {
  fill: none;
  stroke: rgba(255, 255, 255, 0.28);
  stroke-width: 0.8;
  stroke-linecap: round;
}
.kh-studio-fold {
  fill: none;
  stroke: rgba(0, 0, 0, 0.14);
  stroke-width: 1;
  stroke-linecap: round;
}
.kh-studio-guide {
  fill: none;
  stroke: rgba(255, 255, 255, 0.85);
  stroke-width: 1.1;
  stroke-dasharray: 2.5 2.5;
  animation: kh-guide 3s ease-in-out infinite;
}
.kh-studio-motif {
  fill: none;
  stroke: #fff;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.kh-studio-motif > * {
  stroke-dasharray: 100;
  animation: kh-motif 3s ease-in-out infinite;
}
.kh-studio-sw {
  display: flex;
  gap: 7px;
}
.kh-studio-sw i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  opacity: 0.35;
  animation: kh-sw 12s ease-in-out infinite;
}
.kh-studio-sw i:nth-child(1) {
  background: #b71c1c;
}
.kh-studio-sw i:nth-child(2) {
  background: #1f3a5f;
  animation-delay: 3s;
}
.kh-studio-sw i:nth-child(3) {
  background: #2f6b4f;
  animation-delay: 6s;
}
.kh-studio-sw i:nth-child(4) {
  background: #1f1a19;
  animation-delay: 9s;
}
@keyframes kh-art-bob {
  50% {
    transform: translateY(-5px);
  }
}
@keyframes kh-guide {
  0%,
  12% {
    opacity: 1;
  }
  28%,
  92% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
@keyframes kh-motif {
  0%,
  14% {
    stroke-dashoffset: 100;
    opacity: 1;
  }
  55%,
  86% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}
@keyframes kh-sw {
  0%,
  22% {
    opacity: 1;
    transform: scale(1.35);
  }
  28%,
  100% {
    opacity: 0.35;
    transform: scale(1);
  }
}
@keyframes kh-shirt-color {
  0%,
  20% {
    fill: #b71c1c;
  }
  25%,
  45% {
    fill: #1f3a5f;
  }
  50%,
  70% {
    fill: #2f6b4f;
  }
  75%,
  95% {
    fill: #1f1a19;
  }
  100% {
    fill: #b71c1c;
  }
}

/* Premium */
.kh-prem-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    105deg,
    transparent 38%,
    rgba(233, 208, 150, 0.2) 50%,
    transparent 62%
  );
  transform: translateX(-130%);
  animation: kh-sheen 7s ease-in-out infinite;
}
@keyframes kh-sheen {
  0%,
  55% {
    transform: translateX(-130%);
  }
  100% {
    transform: translateX(130%);
  }
}

/* Premium */
.kh-tile--premium {
  grid-area: premium;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #f3e8d2;
  background: radial-gradient(120% 140% at 50% 0%, #2a1712 0%, #130907 55%, #0a0403 100%);
  box-shadow: inset 0 0 0 1px rgba(216, 189, 132, 0.55), 0 18px 40px rgba(0, 0, 0, 0.4);
}
.kh-prem-frame {
  position: absolute;
  inset: 9px;
  pointer-events: none;
  border: 1px solid rgba(216, 189, 132, 0.28);
  border-radius: 20px;
}
.kh-prem-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.kh-prem-eyebrow {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: "Jost Variable", system-ui, sans-serif;
  font-size: clamp(10px, 0.8vw, 13px);
  font-weight: 500;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: #d8bd84;
}
.kh-prem-eyebrow i {
  width: 26px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #d8bd84);
}
.kh-prem-eyebrow i:last-child {
  transform: scaleX(-1);
}
.kh-prem-title {
  font-family: "Cormorant Variable", "Cormorant Garamond", Georgia, serif;
  font-size: clamp(34px, 3.4vw, 62px);
  font-style: italic;
  font-weight: 600;
  line-height: 1.05;
  color: transparent;
  background: linear-gradient(100deg, #f6ead0 0%, #e6cf98 45%, #c9a95e 100%);
  -webkit-background-clip: text;
  background-clip: text;
  padding-bottom: 0.14em;
}
.kh-prem-desc {
  font-family: "Jost Variable", system-ui, sans-serif;
  font-size: clamp(12px, 0.95vw, 16px);
  font-weight: 300;
  letter-spacing: 0.12em;
  color: rgba(243, 232, 210, 0.75);
}

/* Lacak */
.kh-tile--lacak {
  grid-area: lacak;
  color: #fff;
  background: #b71c1c;
}
.kh-steps {
  position: relative;
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding-top: 8px;
}
.kh-steps-track {
  position: absolute;
  top: 15px;
  left: 8px;
  right: 8px;
  height: 3px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.3);
}
.kh-steps-fill {
  display: block;
  width: 100%;
  height: 100%;
  background: #fff;
  transform-origin: left center;
  animation: kh-fill 6s linear infinite;
}
.kh-step {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.kh-step em {
  font-size: clamp(11px, 0.95vw, 16px);
  font-style: normal;
  font-weight: 700;
  opacity: 0.85;
}
.kh-step-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.45);
  background: #b71c1c;
}
.kh-step:nth-child(2) .kh-step-dot {
  border-color: #fff;
  background: #fff;
}
.kh-step:nth-child(3) .kh-step-dot {
  animation: kh-dot-a 6s linear infinite;
}
.kh-step:nth-child(4) .kh-step-dot {
  animation: kh-dot-b 6s linear infinite;
}
.kh-step:nth-child(5) .kh-step-dot {
  animation: kh-dot-c 6s linear infinite;
}
@keyframes kh-fill {
  0% {
    transform: scaleX(0);
    opacity: 1;
  }
  80%,
  92% {
    transform: scaleX(1);
    opacity: 1;
  }
  100% {
    transform: scaleX(1);
    opacity: 0;
  }
}
@keyframes kh-dot-a {
  0%,
  25% {
    border-color: rgba(255, 255, 255, 0.45);
    background: #b71c1c;
  }
  28%,
  92% {
    border-color: #fff;
    background: #fff;
  }
  100% {
    border-color: rgba(255, 255, 255, 0.45);
    background: #b71c1c;
  }
}
@keyframes kh-dot-b {
  0%,
  51% {
    border-color: rgba(255, 255, 255, 0.45);
    background: #b71c1c;
  }
  54%,
  92% {
    border-color: #fff;
    background: #fff;
  }
  100% {
    border-color: rgba(255, 255, 255, 0.45);
    background: #b71c1c;
  }
}
@keyframes kh-dot-c {
  0%,
  77% {
    border-color: rgba(255, 255, 255, 0.45);
    background: #b71c1c;
  }
  80%,
  92% {
    border-color: #fff;
    background: #fff;
  }
  100% {
    border-color: rgba(255, 255, 255, 0.45);
    background: #b71c1c;
  }
}

/* Stok pameran */
.kh-tile--stok {
  grid-area: stok;
  color: #1f1a19;
  background: #faf6f4;
}
.kh-live {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: clamp(11px, 0.9vw, 15px);
  font-weight: 800;
  color: #b71c1c;
  background: #fdecea;
}
.kh-live-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #b71c1c;
  animation: kh-pulse 1.6s ease-in-out infinite;
}
.kh-stok-num {
  font-family: var(--kh-display);
  font-size: clamp(40px, min(5vw, 8vh), 96px);
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: #b71c1c;
}
.kh-tile--stok {
  gap: 2px;
  padding-bottom: clamp(12px, 1.6vh, 24px);
}
.kh-tile--stok .kh-tile-text {
  margin-top: auto;
}
.kh-tile--stok .kh-tile-desc {
  margin-top: 2px;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.kh-tile--stok .kh-tile-desc {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* Info & promo */
.kh-tile--info {
  grid-area: info;
  flex-direction: row;
  align-items: center;
  gap: 2vw;
  color: #fff;
  background: #2a1512;
  flex-wrap: nowrap;
  gap: clamp(12px, 1.6vw, 28px);
  padding-top: clamp(12px, 1.8vh, 24px);
  padding-bottom: clamp(12px, 1.8vh, 24px);
}
.kh-coupon {
  --split: 36%;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  min-width: 0;
  flex: 1 1 auto;
  max-width: 460px;
  min-height: clamp(78px, 11vh, 110px);
  overflow: hidden;
  border-radius: 16px;
  color: #1f1a19;
  background: #faf6f4;
  -webkit-mask: radial-gradient(circle 9px at var(--split) 0, transparent 98%, #000) top / 100% 51%
      no-repeat,
    radial-gradient(circle 9px at var(--split) 100%, transparent 98%, #000) bottom / 100% 51%
      no-repeat;
  mask: radial-gradient(circle 9px at var(--split) 0, transparent 98%, #000) top / 100% 51%
      no-repeat,
    radial-gradient(circle 9px at var(--split) 100%, transparent 98%, #000) bottom / 100% 51%
      no-repeat;
}
.kh-coupon-val {
  flex: 0 0 var(--split);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  text-align: center;
  color: #fff;
  background: #b71c1c;
}
.kh-coupon-val small {
  font-size: clamp(10px, 0.8vw, 13px);
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  opacity: 0.85;
}
.kh-coupon-val b {
  font-family: var(--kh-display);
  font-size: clamp(18px, 2vw, 34px);
  font-weight: 800;
  line-height: 1.05;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}
.kh-coupon-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 12px 16px;
  border-left: 2px dashed #e4d6d1;
}
.kh-coupon-body strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: clamp(13px, 1.2vw, 20px);
  font-weight: 800;
  line-height: 1.25;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.kh-coupon-body em {
  font-size: clamp(11px, 0.9vw, 15px);
  font-style: normal;
  font-weight: 600;
  color: #6f6663;
}
.kh-swap-enter-active,
.kh-swap-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.kh-swap-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.kh-swap-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* ---------- Layar tunggu ---------- */
.kh-attract {
  --kh-rot: 90deg; /* ubah ke -90deg bila video tampil terbalik */
  position: absolute;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  background: radial-gradient(120% 90% at 50% 50%, #3a0d0d 0%, #1a0707 60%, #0d0303 100%);
}
.kh-attract iframe {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1280px;
  height: 720px;
  border: none;
  background: transparent;
  transform: translate(-50%, -50%) scale(var(--kh-scale, 1));
  transform-origin: center center;
}
/* Lapisan penutup layar tunggu: semua area kecuali sudut kanan-bawah 120px (tombol unmute) */
.kh-attract-wake {
  position: absolute;
  inset: 0;
  clip-path: polygon(
    0 0,
    100% 0,
    100% calc(100% - 120px),
    calc(100% - 120px) calc(100% - 120px),
    calc(100% - 120px) 100%,
    0 100%
  );
}
.kh-attract-hint {
  position: absolute;
  left: 50%;
  bottom: 5vh;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 14px 28px;
  border-radius: 999px;
  font-size: clamp(16px, 1.6vw, 26px);
  font-weight: 700;
  color: #fff;
  background: rgba(20, 8, 6, 0.7);
  backdrop-filter: blur(6px);
  transform: translateX(-50%);
  pointer-events: none;
}
.kh-pulse {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ff5252;
  animation: kh-pulse 1.6s ease-in-out infinite;
}
.kh-fade-enter-active,
.kh-fade-leave-active {
  transition: opacity 0.5s ease;
}
.kh-fade-enter-from,
.kh-fade-leave-to {
  opacity: 0;
}

/* ---------- Animasi ---------- */
@keyframes kh-rise {
  from {
    opacity: 0;
    transform: translateY(28px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes kh-tile-in {
  from {
    opacity: 0;
    translate: 0 28px;
    scale: 0.97;
  }
  to {
    opacity: 1;
    translate: none;
    scale: none;
  }
}
@keyframes kh-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 82, 82, 0.6);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(255, 82, 82, 0);
  }
}

/* ---------- Portrait ---------- */
@media (orientation: portrait) {
  .kh-col:nth-child(n + 4) {
    display: none;
  }
  .kh-bg {
    grid-template-columns: repeat(3, 1fr);
  }
  .kh-content {
    grid-template-columns: minmax(300px, 0.8fr) 1.5fr;
    grid-template-rows: auto minmax(0, 1fr);
    align-items: stretch;
    gap: 5vh;
    padding: 7vh 6vw 8vh;
  }
  .kh-title {
    font-size: clamp(88px, 18vw, 220px);
  }
  .kh-sub {
    max-width: 32ch;
    font-size: clamp(18px, 2.6vw, 32px);
  }
  .kh-grid {
    grid-template-rows: minmax(0, 1.1fr) minmax(0, 0.9fr) minmax(0, 0.8fr) auto auto;
    grid-template-areas:
      "katalog katalog"
      "studio studio"
      "stok lacak"
      "premium premium"
      "info info";
    max-height: 84vh;
    height: 100%;
  }
  .kh-tile--info {
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
  }
  .kh-tile--info .kh-tile-text {
    flex: 0 1 auto;
    min-width: 0;
  }
  .kh-tile--info .kh-tile-title {
    white-space: nowrap;
    font-size: clamp(22px, 2.2vw, 38px);
  }
  .kh-coupon {
    min-width: 0;
  }
  .kh-attract iframe {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 1280px;
    height: 720px;
    transform: translate(-50%, -50%) rotate(var(--kh-rot)) scale(var(--kh-scale, 1));
    transform-origin: center center;
  }
  /* iframe diputar 90deg: sudut kanan-bawah asli pindah ke kiri-bawah */
  .kh-attract-wake {
    clip-path: polygon(
      0 0,
      100% 0,
      100% 100%,
      120px 100%,
      120px calc(100% - 120px),
      0 calc(100% - 120px)
    );
  }
}

@media (prefers-reduced-motion: reduce) {
  .kh-col,
  .kh-live-dot,
  .kh-pulse,
  .kh-step-dot {
    animation: none;
  }
  .kh-brand > *,
  .kh-tile {
    animation: none;
    opacity: 1;
  }
  .kh-steps-fill {
    animation: none;
  }
  .kh-step-dot {
    border-color: #fff;
    background: #fff;
  }
  .kh-studio-art,
  .kh-studio-body,
  .kh-studio-guide,
  .kh-studio-motif > *,
  .kh-studio-sw i {
    animation: none;
  }
  .kh-studio-guide {
    opacity: 0;
  }
  kh-prem-sheen {
    animation: none;
  }
}

/* Tile kecil di grid 3 kolom: rapatkan label progres dan batasi deskripsi */
.kh-tile--lacak .kh-tile-desc,
.kh-tile--stok .kh-tile-desc {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.kh-tile--lacak .kh-step em {
  font-size: clamp(10px, 0.8vw, 14px);
}

/* 19" (5:4): kolom sempit, perbanyak ruang vertikal */
@media (max-aspect-ratio: 4/3) and (orientation: landscape) {
  .kh-content {
    grid-template-columns: minmax(240px, 0.6fr) 1.6fr;
    gap: 2vw;
  }
  .kh-title {
    font-size: clamp(56px, min(7vw, 15vh), 130px);
  }
  .kh-tile--stok .kh-stok-num {
    font-size: clamp(36px, min(4.4vw, 7vh), 80px);
  }
}

/* Layar pendek (14" 1366x768 dan sejenis) */
@media (max-height: 800px) and (orientation: landscape) {
  .kh-tile {
    padding: 14px 18px;
  }
  .kh-tile--info .kh-tile-desc,
  .kh-tile--stok .kh-tile-desc {
    display: none;
  }
  .kh-tile--stok .kh-stok-num {
    font-size: clamp(34px, 7vh, 64px);
  }
  .kh-tile--premium .kh-prem-desc {
    display: none;
  }
}
</style>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import api from "@/services/api";
import LogoKaosan from "@/assets/logo.png";
import ProductPlaceholder from "@/components/ProductPlaceholder.vue";
import { isKiosk } from "@/composables/useKiosk";
import { PREMIUM_FABRICS } from "@/data/premiumFabrics";
import "@fontsource-variable/cormorant";
import "@fontsource-variable/cormorant/wght-italic.css";
import "@fontsource-variable/jost";

interface CatalogRow {
  nama: string;
  gambar_url: string | null;
  galeri: string | { url: string; index: number }[] | null;
}

const router = useRouter();
const route = useRoute();

// ====== SESUAIKAN ======
const AUTO_MS = 14_000; // ganti kain otomatis
const RESUME_MS = 45_000; // jeda otomatis setelah layar disentuh
const PHOTOS_PER_FABRIC = 3;
// =======================

const fabrics = PREMIUM_FABRICS;

// Butiran emas melayang (posisi tetap, bukan acak, agar tidak berubah tiap render)
const dust = Array.from({ length: 16 }, (_, i) => ({
  x: (i * 37 + 8) % 100,
  s: 2 + (i % 3),
  d: 16 + ((i * 3) % 10),
  dl: -((i * 1.9) % 16),
}));

const homePath = computed(() => (isKiosk.value ? "/kiosk" : "/"));
const pad = (n: number) => String(n).padStart(2, "0");

// Kembali dari katalog: buka kain yang tadi dilihat
const startIdx = Math.max(
  0,
  fabrics.findIndex((f) => f.id === route.query.kain)
);
const idx = ref(startIdx);
const current = computed(() => fabrics[idx.value]);

// ---------- Foto dari katalog ----------
const rows = ref<CatalogRow[]>([]);
const loadCatalog = async () => {
  try {
    const { data } = await api.get<CatalogRow[]>("/so/public/katalog");
    rows.value = data;
  } catch {
    rows.value = [];
  }
};

const mainPhoto = (r: CatalogRow): string | null => {
  try {
    const g = typeof r.galeri === "string" ? JSON.parse(r.galeri) : r.galeri;
    return g?.[0]?.url ?? r.gambar_url;
  } catch {
    return r.gambar_url;
  }
};

const photoMap = computed(() =>
  fabrics.map((f) => {
    const keys = f.kata.map((k) => k.toUpperCase());
    const out: string[] = [];
    for (const r of rows.value) {
      const nama = (r.nama || "").toUpperCase();
      if (!keys.some((k) => nama.includes(k))) continue;
      const p = mainPhoto(r);
      if (p && !out.includes(p)) out.push(p);
      if (out.length >= PHOTOS_PER_FABRIC) break;
    }
    return out;
  })
);
const photos = computed(() => photoMap.value[idx.value] ?? []);

// ---------- Navigasi + autoplay ----------
const autoplay = ref(true);
let tickTimer: ReturnType<typeof setInterval> | undefined;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;

const next = () => {
  idx.value = (idx.value + 1) % fabrics.length;
};
const select = (i: number) => {
  idx.value = i;
  autoplay.value = false;
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => (autoplay.value = true), RESUME_MS);
};

const navEl = ref<HTMLElement | null>(null);
watch(idx, async () => {
  await nextTick();
  navEl.value
    ?.querySelector(".is-active")
    ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
});

const openCollection = () => {
  router.push({
    path: `/katalog/${encodeURIComponent(current.value.nama)}`,
    query: { from: "premium", kain: current.value.id },
  });
};

onMounted(() => {
  document.title = "Premium Collection - Kaosan";
  loadCatalog();
  tickTimer = setInterval(() => {
    if (autoplay.value) next();
  }, AUTO_MS);
  document.documentElement.classList.add("theme-premium");
});
onUnmounted(() => {
  clearInterval(tickTimer);
  clearTimeout(resumeTimer);
  document.documentElement.classList.remove("theme-premium");
});
</script>

<template>
  <div class="pm">
    <span
      v-for="(p, n) in dust"
      :key="n"
      class="pm-dust"
      aria-hidden="true"
      :style="{ '--x': p.x + '%', '--s': p.s + 'px', '--d': p.d + 's', '--dl': p.dl + 's' }"
    ></span>
    <header class="pm-top">
      <button class="pm-back" aria-label="Kembali" @click="router.push(homePath)">
        <v-icon size="22">mdi-arrow-left</v-icon>
      </button>
      <div class="pm-brand">
        <span class="pm-brand-eyebrow"><i></i>Kaosan<i></i></span>
        <span class="pm-brand-title">Premium <em>Collection</em></span>
      </div>
      <span class="pm-logo"><img :src="LogoKaosan" height="28" alt="Kaosan" /></span>
    </header>

    <div class="pm-body">
      <nav ref="navEl" class="pm-nav" aria-label="Jenis kain premium">
        <button
          v-for="(f, i) in fabrics"
          :key="f.id"
          class="pm-nav-item"
          :class="{ 'is-active': i === idx }"
          @click="select(i)"
        >
          <span class="pm-nav-no">{{ pad(i + 1) }}</span>
          <span class="pm-nav-name">{{ f.nama }}</span>
        </button>
      </nav>

      <main class="pm-stage">
        <div class="pm-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <Transition name="pm-fade" mode="out-in">
          <article :key="idx" class="pm-card">
            <span class="pm-ghost" aria-hidden="true">{{ pad(idx + 1) }}</span>

            <div class="pm-text">
              <div class="pm-no">
                <span>{{ pad(idx + 1) }}</span>
                <i></i>
                <small>dari {{ pad(fabrics.length) }}</small>
              </div>
              <h2 class="pm-name">
                <span>{{ current.nama }}</span>
              </h2>
              <p class="pm-tag">{{ current.judul }}</p>
              <i class="pm-line"></i>
              <p class="pm-desc">{{ current.isi }}</p>

              <dl class="pm-meta">
                <div>
                  <dt>Cocok untuk</dt>
                  <dd>{{ current.cocok }}</dd>
                </div>
                <div v-if="current.perawatan">
                  <dt>Perawatan</dt>
                  <dd>{{ current.perawatan }}</dd>
                </div>
              </dl>

              <button class="pm-cta" @click="openCollection">
                Lihat koleksi
                <v-icon size="20">mdi-arrow-right</v-icon>
              </button>
            </div>

            <div class="pm-photos" :data-n="Math.max(photos.length, 1)">
              <template v-if="photos.length">
                <div v-for="(src, k) in photos" :key="src" class="pm-arch" :style="{ '--k': k }">
                  <img :src="src" alt="" decoding="async" />
                </div>
              </template>
              <div v-else class="pm-arch" style="--k: 0">
                <ProductPlaceholder label="Foto segera hadir" />
              </div>
            </div>
          </article>
        </Transition>
      </main>
    </div>

    <div class="pm-progress" aria-hidden="true">
      <i
        :key="`${idx}-${autoplay}`"
        class="pm-progress-fill"
        :class="{ run: autoplay }"
        :style="{ animationDuration: AUTO_MS + 'ms' }"
      ></i>
    </div>
  </div>
</template>

<style scoped>
.pm {
  --pm-gold: #d8bd84;
  --pm-gold-soft: rgba(216, 189, 132, 0.28);
  --pm-cream: #f3e8d2;
  --pm-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--pm-cream);
  --pm-serif: "Cormorant Variable", "Cormorant Garamond", Georgia, serif;
  --pm-sans: "Jost Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-family: var(--pm-sans);
  background: radial-gradient(900px 600px at 78% 30%, rgba(160, 110, 40, 0.16), transparent 70%),
    radial-gradient(700px 500px at 0% 100%, rgba(120, 18, 18, 0.28), transparent 70%), #0e0605;
}
/* butiran halus agar latar tidak terlihat datar */
.pm::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.06;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}

/* ---------- Header ---------- */
.pm-top {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  height: 92px;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 28px;
  border-bottom: 1px solid var(--pm-gold-soft);
}
.pm-back {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--pm-gold-soft);
  border-radius: 50%;
  color: var(--pm-gold);
  background: transparent;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.12s ease;
}
.pm-back:active {
  transform: scale(0.92);
  background: rgba(216, 189, 132, 0.14);
}
.pm-brand {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}
.pm-brand-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--pm-gold);
  display: flex;
  align-items: center;
  gap: 14px;
}
.pm-brand-eyebrow i {
  width: 34px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--pm-gold));
}
.pm-brand-eyebrow i:last-child {
  transform: scaleX(-1);
}
.pm-brand-title {
  font-family: var(--pm-serif);
  font-size: 32px;
  font-weight: 500;
}
.pm-brand-title em {
  font-style: italic;
  color: var(--pm-gold);
}
.pm-logo {
  margin-left: auto;
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
}

/* ---------- Body ---------- */
.pm-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(250px, 26%) 1fr;
}

/* ---------- Daftar kain ---------- */
.pm-nav {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 28px 0 28px 28px;
  scrollbar-width: none;
  border-right: 1px solid rgba(216, 189, 132, 0.12);
  -webkit-mask-image: linear-gradient(transparent, #000 7%, #000 93%, transparent);
  mask-image: linear-gradient(transparent, #000 7%, #000 93%, transparent);
}
.pm-nav::-webkit-scrollbar {
  display: none;
}
.pm-nav-item {
  position: relative;
  flex-shrink: 0;
  min-height: 50px;
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 12px 18px 12px 0;
  border: none;
  background: none;
  text-align: left;
  color: rgba(243, 232, 210, 0.45);
  cursor: pointer;
  transition: color 0.35s ease, transform 0.5s var(--pm-ease);
}
.pm-nav-item::before {
  content: "";
  position: absolute;
  left: -28px;
  top: 50%;
  width: 0;
  height: 1px;
  background: var(--pm-gold);
  transition: width 0.5s var(--pm-ease);
}
.pm-nav-no {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
}
.pm-nav-name {
  font-family: var(--pm-serif);
  font-size: 23px;
  font-weight: 600;
  line-height: 1.2;
}
.pm-nav-item.is-active {
  color: var(--pm-gold);
  transform: translateX(14px);
  text-shadow: 0 0 22px rgba(216, 189, 132, 0.35);
}
.pm-nav-item.is-active::before {
  width: 22px;
}
.pm-nav-item:active {
  color: var(--pm-cream);
}

/* ---------- Panggung ---------- */
.pm-stage {
  position: relative;
  min-width: 0;
  padding: 4vh 4vw 9vh 3.5vw;
}
.pm-card {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  align-items: center;
  gap: 3vw;
}
.pm-fade-enter-active {
  transition: opacity 0.4s ease;
}
.pm-fade-leave-active {
  transition: opacity 0.25s ease;
}
.pm-fade-enter-from,
.pm-fade-leave-to {
  opacity: 0;
}

.pm-ghost {
  position: absolute;
  right: -1%;
  top: -6%;
  font-family: var(--pm-serif);
  font-size: clamp(220px, 30vw, 480px);
  line-height: 1;
  color: transparent;
  -webkit-text-stroke: 1px rgba(216, 189, 132, 0.12);
  pointer-events: none;
  animation: pm-ghost-in 1.6s var(--pm-ease) both;
}

.pm-text {
  position: relative;
  z-index: 1;
  min-width: 0;
}
.pm-text > * {
  animation: pm-rise 0.9s var(--pm-ease) both;
}
.pm-no {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: var(--pm-gold);
  animation-delay: 0.05s;
}
.pm-no i {
  width: 48px;
  height: 1px;
  background: var(--pm-gold-soft);
}
.pm-no small {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(243, 232, 210, 0.45);
}
.pm-name {
  margin: 18px 0 0;
  overflow: hidden;
  font-family: var(--pm-serif);
  font-size: clamp(48px, 5.6vw, 104px);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.01em;
  animation: none;
  padding-bottom: 0.08em;
}
.pm-name span {
  display: block;
  color: transparent;
  background: linear-gradient(
        105deg,
        transparent 42%,
        rgba(255, 252, 238, 0.95) 50%,
        transparent 58%
      )
      no-repeat,
    linear-gradient(180deg, #f6ead0 0%, #e6cf98 45%, #b8964f 100%);
  background-size: 250% 100%, 100% 100%;
  background-position: 150% 0, 0 0;
  -webkit-background-clip: text;
  background-clip: text;
  animation: pm-reveal 1s var(--pm-ease) 0.12s both, pm-glint 8s ease-in-out 1.6s infinite;
}
.pm-tag {
  margin: 14px 0 0;
  font-family: var(--pm-serif);
  font-size: clamp(24px, 2.3vw, 40px);
  font-style: italic;
  line-height: 1.3;
  color: var(--pm-gold);
  animation-delay: 0.3s;
}
.pm-line {
  display: block;
  width: 84px;
  height: 1px;
  margin: 24px 0;
  background: linear-gradient(90deg, var(--pm-gold), transparent);
  transform-origin: left center;
  animation: pm-draw 1.1s var(--pm-ease) 0.4s both;
}
.pm-desc {
  max-width: 46ch;
  margin: 0;
  font-size: clamp(15px, 1.25vw, 21px);
  font-weight: 300;
  line-height: 1.75;
  color: rgba(243, 232, 210, 0.84);
  animation-delay: 0.5s;
}
.pm-meta {
  margin: 26px 0 0;
  display: grid;
  gap: 16px;
  animation-delay: 0.62s;
}
.pm-meta div {
  max-width: 46ch;
}
.pm-meta dt {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--pm-gold);
}
.pm-meta dd {
  margin: 6px 0 0;
  font-size: clamp(14px, 1.1vw, 18px);
  line-height: 1.5;
}
.pm-cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  margin-top: 30px;
  padding: 0 28px;
  border: 1px solid var(--pm-gold);
  border-radius: 999px;
  font: inherit;
  font-family: var(--pm-sans);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--pm-gold);
  background: transparent;
  cursor: pointer;
  animation-delay: 0.74s;
  transition: background 0.3s ease, color 0.3s ease, transform 0.12s ease;
}
.pm-cta:hover,
.pm-cta:active {
  color: #1a0d0b;
  background: var(--pm-gold);
}
.pm-cta:active {
  transform: scale(0.96);
}

/* ---------- Foto berbingkai lengkung ---------- */
.pm-photos {
  position: relative;
  z-index: 1;
  height: min(72vh, 660px);
  display: flex;
  align-items: flex-end;
  gap: 16px;
}
.pm-arch {
  --arch-r: 999px 999px 18px 18px;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  border-radius: var(--arch-r);
  box-shadow: 0 0 0 3px #0e0605, 0 0 0 4px #c9a95e, 0 0 0 10px #0e0605,
    0 0 0 11px rgba(216, 189, 132, 0.3), 0 28px 56px rgba(0, 0, 0, 0.5);
  animation: pm-arch-in 1.3s var(--pm-ease) both;
  animation-delay: calc(0.25s + var(--k) * 0.16s);
}
.pm-photos:not([data-n="1"]) .pm-arch:nth-child(1) {
  height: 76%;
}
.pm-photos:not([data-n="1"]) .pm-arch:nth-child(2) {
  height: 100%;
}
.pm-photos:not([data-n="1"]) .pm-arch:nth-child(3) {
  height: 64%;
}
.pm-arch img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center 20%;
  animation: pm-zoom 1.8s var(--pm-ease) both;
  animation-delay: calc(0.25s + var(--k) * 0.16s);
}

/* ---------- Bingkai tipis + sudut emas ---------- */
.pm-frame {
  position: absolute;
  inset: 2.2vh 2vw 5.5vh 1.6vw;
  pointer-events: none;
  border: 1px solid rgba(216, 189, 132, 0.13);
}
.pm-frame i {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 1px solid var(--pm-gold);
}
.pm-frame i:nth-child(1) {
  top: -1px;
  left: -1px;
  border-width: 1px 0 0 1px;
}
.pm-frame i:nth-child(2) {
  top: -1px;
  right: -1px;
  border-width: 1px 1px 0 0;
}
.pm-frame i:nth-child(3) {
  bottom: -1px;
  left: -1px;
  border-width: 0 0 1px 1px;
}
.pm-frame i:nth-child(4) {
  bottom: -1px;
  right: -1px;
  border-width: 0 1px 1px 0;
}

/* ---------- Butiran emas ---------- */
.pm-dust {
  position: absolute;
  z-index: 0;
  bottom: -10px;
  left: var(--x);
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  background: #e6cf98;
  opacity: 0;
  pointer-events: none;
  animation: pm-float var(--d) linear var(--dl) infinite;
}

/* ---------- Cahaya di belakang foto ---------- */
.pm-photos::before {
  content: "";
  position: absolute;
  z-index: -1;
  inset: -14% -20% -4%;
  background: radial-gradient(closest-side, rgba(216, 189, 132, 0.24), transparent 72%);
  animation: pm-breathe 6s ease-in-out infinite;
}

/* ---------- Progres ---------- */
.pm-progress {
  position: relative;
  z-index: 2;
  height: 2px;
  background: rgba(216, 189, 132, 0.12);
}
.pm-progress-fill {
  display: block;
  height: 100%;
  width: 0;
  background: var(--pm-gold);
}
.pm-progress-fill.run {
  animation: pm-progress linear forwards;
}

/* ---------- Animasi ---------- */
@keyframes pm-rise {
  from {
    opacity: 0;
    transform: translateY(22px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes pm-reveal {
  from {
    transform: translateY(105%);
  }
  to {
    transform: none;
  }
}
@keyframes pm-draw {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
@keyframes pm-arch-in {
  from {
    clip-path: inset(100% 0 0 0 round 999px 999px 18px 18px);
  }
  to {
    clip-path: inset(0 0 0 0 round 999px 999px 18px 18px);
  }
}
@keyframes pm-zoom {
  from {
    transform: scale(1.22);
  }
  to {
    transform: scale(1);
  }
}
@keyframes pm-ghost-in {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes pm-progress {
  to {
    width: 100%;
  }
}

@keyframes pm-glint {
  0%,
  62% {
    background-position: 150% 0, 0 0;
  }
  82%,
  100% {
    background-position: -50% 0, 0 0;
  }
}
@keyframes pm-float {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  15% {
    opacity: 0.55;
  }
  85% {
    opacity: 0.3;
  }
  100% {
    transform: translate(28px, -105vh);
    opacity: 0;
  }
}
@keyframes pm-breathe {
  0%,
  100% {
    opacity: 0.7;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.06);
  }
}

/* ---------- Portrait ---------- */
@media (orientation: portrait) {
  .pm-body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .pm-nav {
    order: 2;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 10px 24px 14px;
    border-right: none;
    border-top: 1px solid rgba(216, 189, 132, 0.12);
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent);
    mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent);
  }
  .pm-nav-item {
    white-space: nowrap;
    padding: 12px 20px;
  }
  .pm-nav-item::before {
    left: 20px;
    right: 20px;
    top: auto;
    bottom: 4px;
    width: 0;
  }
  .pm-nav-item.is-active {
    transform: none;
  }
  .pm-nav-item.is-active::before {
    width: calc(100% - 40px);
  }
  .pm-stage {
    padding: 3vh 6vw 2vh;
    overflow-y: auto;
  }
  .pm-card {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    align-items: start;
    gap: 3vh;
    height: auto;
  }
  .pm-photos {
    order: -1;
    height: 30vh;
  }
  .pm-name {
    font-size: clamp(40px, 8vw, 72px);
  }
  .pm-desc,
  .pm-meta div {
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pm-text > *,
  .pm-name span,
  .pm-line,
  .pm-arch,
  .pm-arch img,
  .pm-ghost,
  .pm-dust,
  .pm-photos::before,
  .pm-name span,
  .pm-progress-fill.run {
    animation: none;
  }
  .pm-progress-fill.run {
    width: 100%;
  }
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import LogoKaosan from "@/assets/logo.png";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/manrope";

interface Tile {
  key: string;
  title: string;
  desc: string;
  icon: string;
  to?: string;
}

const router = useRouter();

// ====== SESUAIKAN ======
const PAMERAN_KODE = "B02"; // kode cabang pameran
const SIGNAGE_URL = import.meta.env.VITE_SIGNAGE_URL as string | undefined;
const ATTRACT_AFTER_MS = 45_000; // diam sebelum layar tunggu (signage) muncul
// =======================

const tiles: Tile[] = [
  {
    key: "katalog",
    title: "Katalog",
    desc: "Lihat koleksi kaos berdasarkan jenis kain",
    icon: "mdi-hanger",
    to: "/katalog",
  },
  {
    key: "tracking",
    title: "Lacak Pesanan",
    desc: "Cek sampai mana proses pesananmu",
    icon: "mdi-package-variant-closed",
    to: "/tracking",
  },
  {
    key: "stok",
    title: "Stok Pameran",
    desc: "Ketersediaan barang di pameran ini",
    icon: "mdi-store-search-outline",
    to: `/cek-stok/${PAMERAN_KODE}`,
  },
  {
    key: "info",
    title: "Info & Promo",
    desc: "Tayangan promo dan informasi Kaosan",
    icon: "mdi-television-play",
  },
];

// --- Foto latar ---
const photos = ref<string[]>([]);

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
    const { data } = await api.get<{ gambar_url: string | null }[]>("/so/public/katalog");
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

// --- Foto bergantian pada tile Katalog ---
const tick = ref(0);
const tilePhoto = computed(() =>
  photos.value.length ? photos.value[tick.value % photos.value.length] : null
);
let tickTimer: ReturnType<typeof setInterval> | undefined;

// --- Layar tunggu / signage ---
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

const open = (t: Tile) => {
  if (t.to) router.push(t.to);
  else attract.value = true; // tile Info & Promo memutar signage
};

onMounted(() => {
  loadPhotos();
  arm();
  tickTimer = setInterval(() => tick.value++, 4000);
  window.addEventListener("pointerdown", wake, { passive: true });
});
onUnmounted(() => {
  clearTimeout(idleTimer);
  clearInterval(tickTimer);
  window.removeEventListener("pointerdown", wake);
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

    <!-- ISI -->
    <main class="kh-content">
      <section class="kh-brand">
        <span class="kh-logo"><img :src="LogoKaosan" height="36" alt="Kaosan" /></span>
        <div class="kh-eyebrow">Selamat datang</div>
        <h1 class="kh-title">Kaosan</h1>
        <p class="kh-sub">Kaos polos dari berbagai jenis kain. Sentuh untuk mulai.</p>
      </section>

      <section class="kh-grid">
        <button
          v-for="(t, i) in tiles"
          :key="t.key"
          class="kh-tile"
          :class="{ 'kh-tile--photo': t.key === 'katalog' }"
          :style="{ '--i': i }"
          @click="open(t)"
        >
          <Transition v-if="t.key === 'katalog'" name="kh-photo">
            <img
              v-if="tilePhoto"
              :key="tilePhoto"
              :src="tilePhoto"
              class="kh-tile-photo"
              alt=""
              decoding="async"
            />
          </Transition>

          <span class="kh-tile-icon"
            ><v-icon size="34">{{ t.icon }}</v-icon></span
          >
          <span class="kh-tile-text">
            <span class="kh-tile-title">{{ t.title }}</span>
            <span class="kh-tile-desc">{{ t.desc }}</span>
          </span>
          <v-icon class="kh-tile-go" size="28">mdi-arrow-right</v-icon>
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
        ></iframe>
        <div class="kh-attract-hint"><span class="kh-pulse"></span>Sentuh layar untuk mulai</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.kh {
  position: fixed;
  inset: 0;
  overflow: hidden;
  color: #fff;
  background: #1a0d0b;
  --kh-display: "Bricolage Grotesque Variable", "Plus Jakarta Sans", system-ui, sans-serif;
  --kh-body: "Manrope Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
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
  grid-template-columns: minmax(300px, 0.85fr) 1.35fr;
  align-items: center;
  gap: 4vw;
  padding: 5vh 5vw;
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
  font-size: clamp(72px, 10vw, 176px);
  font-weight: 800;
  line-height: 0.88;
  letter-spacing: -0.045em;
}
.kh-sub {
  max-width: 26ch;
  margin: 0;
  font-size: clamp(15px, 1.5vw, 24px);
  line-height: 1.5;
  opacity: 0.9;
}

/* ---------- Tile ---------- */
.kh-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: minmax(0, 1fr);
  gap: 2vw;
  height: min(72vh, 780px);
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
  text-align: left;
  color: #1f1a19;
  background: #faf6f4;
  cursor: pointer;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  opacity: 0;
  animation: kh-rise 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: calc(0.3s + var(--i) * 0.1s);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.kh-tile:active {
  transform: scale(0.96);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}
.kh-tile > :not(.kh-tile-photo) {
  position: relative;
  z-index: 1;
}
.kh-tile-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(56px, 5vw, 76px);
  height: clamp(56px, 5vw, 76px);
  border-radius: 20px;
  color: #b71c1c;
  background: #fdecea;
  animation: kh-bob 4s ease-in-out infinite;
  animation-delay: calc(var(--i) * 0.6s);
}
.kh-tile-title {
  display: block;
  font-family: var(--kh-display);
  font-size: clamp(26px, 2.6vw, 46px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.025em;
}
.kh-tile-desc {
  display: block;
  margin-top: 6px;
  max-width: 24ch;
  font-size: clamp(13px, 1.1vw, 19px);
  line-height: 1.4;
  color: #6f6663;
}
.kh-tile-go {
  position: absolute !important;
  top: clamp(18px, 2vw, 32px);
  right: clamp(18px, 2vw, 32px);
  color: #b71c1c;
  transition: transform 0.2s ease;
}
.kh-tile:active .kh-tile-go {
  transform: translateX(6px);
}

/* Tile bergambar (Katalog) */
.kh-tile--photo {
  color: #fff;
  background: #2a1512;
}
.kh-tile--photo::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(
    0deg,
    rgba(20, 8, 6, 0.85) 0%,
    rgba(20, 8, 6, 0.2) 65%,
    transparent 100%
  );
}
.kh-tile--photo .kh-tile-desc {
  color: rgba(255, 255, 255, 0.85);
}
.kh-tile--photo .kh-tile-go {
  color: #fff;
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

/* ---------- Layar tunggu ---------- */
.kh-attract {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: #000;
}
.kh-attract iframe {
  width: 100%;
  height: 100%;
  border: none;
  pointer-events: none; /* sentuhan ditangkap beranda untuk menutup layar tunggu */
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
@keyframes kh-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
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

@media (orientation: portrait) {
  .kh-content {
    grid-template-columns: 1fr;
    align-content: center;
    gap: 4vh;
  }
  .kh-grid {
    height: 46vh;
  }
}
@media (prefers-reduced-motion: reduce) {
  .kh-col,
  .kh-tile-icon,
  .kh-pulse {
    animation: none;
  }
  .kh-brand > *,
  .kh-tile {
    animation: none;
    opacity: 1;
  }
}
</style>

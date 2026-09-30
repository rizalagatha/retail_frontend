import { ref } from "vue";
import type { Router } from "vue-router";

const STORAGE_KEY = "kaosan_kiosk";
export const PAMERAN_KODE = "B02"; // kode cabang pameran, satu sumber untuk seluruh kiosk
// Kaos Studio (situs terpisah), dibuka di dalam iframe agar tombol Beranda dan timer diam tetap berlaku
export const STUDIO_URL =
  (import.meta.env.VITE_STUDIO_URL as string | undefined) ||
  "https://kaostudio.kaosanofficial.com/";
const STUDIO_ORIGIN = new URL(STUDIO_URL).origin;
const STUDIO_PATH = "/kiosk/studio";
const IDLE_STUDIO_MS = 180_000; // di studio, pelanggan boleh diam lebih lama

const IDLE_MS = 90_000; // tanpa sentuhan sebelum peringatan muncul
export const WARN_SECONDS = 15; // hitung mundur sebelum kembali ke beranda

export const isKiosk = ref(false);
export const idleWarning = ref(false);
export const countdown = ref(WARN_SECONDS);

let idleTimer: ReturnType<typeof setTimeout> | undefined;
let tickTimer: ReturnType<typeof setInterval> | undefined;
let started = false;

export function startKiosk(router: Router) {
  if (started) return;

  // Aktif lewat ?kiosk=1, lalu diingat selama sesi browser berjalan
  if (new URLSearchParams(window.location.search).get("kiosk") === "1") {
    sessionStorage.setItem(STORAGE_KEY, "1");
  }
  isKiosk.value = sessionStorage.getItem(STORAGE_KEY) === "1";
  if (!isKiosk.value) return;
  started = true;

  document.documentElement.classList.add("is-kiosk");

  const onHome = () => router.currentRoute.value.path === "/kiosk";

  function stopWarn() {
    idleWarning.value = false;
    clearInterval(tickTimer);
  }

  function goHome() {
    stopWarn();
    if (!onHome()) router.push("/kiosk");
    arm();
  }

  function startWarn() {
    // Beranda punya layar tunggu sendiri, tidak perlu peringatan
    if (onHome()) return arm();
    idleWarning.value = true;
    countdown.value = WARN_SECONDS;
    tickTimer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0) goHome();
    }, 1000);
  }

  function arm() {
    clearTimeout(idleTimer);
    const limit = router.currentRoute.value.path === STUDIO_PATH ? IDLE_STUDIO_MS : IDLE_MS;
    idleTimer = setTimeout(startWarn, limit);
  }

  function onActivity() {
    if (idleWarning.value) stopWarn();
    arm();
  }

  ["pointerdown", "keydown"].forEach((ev) =>
    window.addEventListener(ev, onActivity, { passive: true })
  );

  // Aktivitas di dalam iframe Kaos Studio tidak sampai ke window ini, jadi studio mengirimnya lewat postMessage
  window.addEventListener("message", (e) => {
    if (e.origin === STUDIO_ORIGIN && e.data?.type === "kiosk-activity") onActivity();
  });

  // Pasang ulang timer tiap pindah halaman agar batasnya sesuai halaman baru
  router.afterEach(() => arm());

  // Cegah menu klik kanan dan zoom (cubit di layar sentuh terbaca sebagai Ctrl+wheel)
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );

  arm();
}

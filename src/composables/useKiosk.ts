import { ref } from "vue";
import type { Router } from "vue-router";

const STORAGE_KEY = "kaosan_kiosk";
export const PAMERAN_KODE = "B02"; // kode cabang pameran, satu sumber untuk seluruh kiosk
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
    idleTimer = setTimeout(startWarn, IDLE_MS);
  }

  function onActivity() {
    if (idleWarning.value) stopWarn();
    arm();
  }

  ["pointerdown", "keydown"].forEach((ev) =>
    window.addEventListener(ev, onActivity, { passive: true })
  );

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

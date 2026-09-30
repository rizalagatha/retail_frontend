<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isKiosk, idleWarning, countdown, WARN_SECONDS } from "@/composables/useKiosk";

const route = useRoute();
const router = useRouter();
const showHome = computed(() => isKiosk.value && route.path !== "/kiosk");
</script>

<template>
  <template v-if="isKiosk">
    <Transition name="ko-pop">
      <button
        v-if="showHome"
        class="ko-home"
        aria-label="Kembali ke beranda"
        @click="router.push('/kiosk')"
      >
        <v-icon size="26">mdi-home-outline</v-icon>
        <span>Beranda</span>
      </button>
    </Transition>

    <Transition name="ko-fade">
      <div v-if="idleWarning" class="ko-warn" role="alertdialog" aria-live="assertive">
        <div class="ko-card">
          <div class="ko-ringwrap">
            <svg class="ko-ring" viewBox="0 0 100 100" :style="{ '--dur': WARN_SECONDS + 's' }">
              <circle class="ko-ring-bg" cx="50" cy="50" r="44" />
              <circle class="ko-ring-fg" cx="50" cy="50" r="44" />
            </svg>
            <span class="ko-count">{{ countdown }}</span>
          </div>
          <h3 class="ko-title">Masih di sini?</h3>
          <p class="ko-sub">
            Sentuh layar untuk melanjutkan. Jika tidak, layar kembali ke beranda.
          </p>
        </div>
      </div>
    </Transition>
  </template>
</template>

<style>
/* Global: hanya berlaku saat kelas is-kiosk terpasang */
html.is-kiosk {
  overscroll-behavior: none;
  touch-action: manipulation;
}
html.is-kiosk body {
  user-select: none;
  -webkit-user-select: none;
}
html.is-kiosk input,
html.is-kiosk textarea {
  user-select: text;
  -webkit-user-select: text;
}
</style>

<style scoped>
.ko-home {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 60px;
  padding: 0 26px 0 20px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 16px;
  font-weight: 800;
  color: #fff;
  background: #b71c1c;
  box-shadow: 0 10px 28px rgba(183, 28, 28, 0.4);
  cursor: pointer;
  transition: transform 0.12s ease;
}
.ko-home:active {
  transform: scale(0.95);
}

.ko-warn {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 8, 6, 0.78);
  backdrop-filter: blur(6px);
}
.ko-card {
  width: min(440px, 88vw);
  padding: 36px 32px;
  border-radius: 28px;
  text-align: center;
  background: #fff;
}
.ko-ringwrap {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto 18px;
}
.ko-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ko-ring circle {
  fill: none;
  stroke-width: 6;
}
.ko-ring-bg {
  stroke: #f0e4e0;
}
.ko-ring-fg {
  stroke: #b71c1c;
  stroke-linecap: round;
  stroke-dasharray: 276.5;
  animation: ko-ring var(--dur, 15s) linear forwards;
}
@keyframes ko-ring {
  to {
    stroke-dashoffset: 276.5;
  }
}
.ko-count {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 44px;
  font-weight: 600;
  color: #b71c1c;
}
.ko-title {
  margin: 0 0 6px;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 30px;
  font-weight: 600;
}
.ko-sub {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: #6f6663;
}

.ko-pop-enter-active,
.ko-pop-leave-active {
  transition: opacity 0.25s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.ko-pop-enter-from,
.ko-pop-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}
.ko-fade-enter-active,
.ko-fade-leave-active {
  transition: opacity 0.3s ease;
}
.ko-fade-enter-from,
.ko-fade-leave-to {
  opacity: 0;
}
</style>

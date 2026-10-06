<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  title: string;
  text?: string;
  eyebrow?: string;
  live?: string;
}>();

// Kata terakhir judul dimiringkan, titik di ujung
const head = computed(() => props.title.split(" ").slice(0, -1).join(" "));
const tail = computed(() => props.title.split(" ").slice(-1)[0]);

const hangers = [{ x: 92 }, { x: 176, swing: true }, { x: 270 }];
</script>

<template>
  <div class="es" role="status">
    <svg class="es-art" viewBox="0 0 360 64" aria-hidden="true">
      <line class="es-draw es-rail" x1="16" y1="14" x2="344" y2="14" pathLength="100" />
      <circle class="es-cap" cx="16" cy="14" r="4" />
      <circle class="es-cap" cx="344" cy="14" r="4" />
      <g v-for="(h, i) in hangers" :key="i" :transform="`translate(${h.x} 14)`">
        <g class="es-hanger" :class="{ 'es-hanger--swing': h.swing }" :style="{ '--i': i + 1 }">
          <circle class="es-ring" cx="0" cy="0" r="3.2" />
          <path class="es-draw" d="M0 3.2 V12" pathLength="100" />
          <path
            class="es-draw"
            d="M0 12 L-34 32 Q-39 36 -33 36 H33 Q39 36 34 32 L0 12"
            pathLength="100"
          />
        </g>
      </g>
    </svg>

    <p class="es-eyebrow">{{ eyebrow ?? "Belum ada barang" }}</p>
    <h2 class="es-title">
      {{ head }} <em>{{ tail }}</em
      >.
    </h2>
    <p v-if="text" class="es-text">{{ text }}</p>

    <div v-if="$slots.default" class="es-actions"><slot /></div>

    <p v-if="live" class="es-live"><i></i>{{ live }}</p>
  </div>
</template>

<style scoped>
.es {
  --es-red: #b71c1c;
  --es-ink: #1f1a19;
  --es-muted: #6f6663;
  --es-line: #cdbab4;
  --es-ease: cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: clamp(40px, 9vh, 110px) 24px;
  text-align: center;
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--es-ink);
}
.es-art {
  width: min(420px, 78%);
  margin-bottom: 28px;
  overflow: visible;
}
.es-art line,
.es-art path,
.es-art circle {
  fill: none;
  stroke: #b9aca7;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.es-art .es-rail {
  stroke: var(--es-line);
  stroke-width: 3;
}
.es-art .es-cap {
  fill: var(--es-line);
  stroke: none;
}
.es-hanger--swing path,
.es-hanger--swing circle {
  stroke: var(--es-red);
}
.es-draw {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: es-draw 0.9s var(--es-ease) forwards;
  animation-delay: calc(0.15s + var(--i, 0) * 0.2s);
}
.es-hanger {
  transform-origin: 0 0;
}
.es-hanger--swing {
  animation: es-swing 5s ease-in-out 1.6s infinite;
}

.es-eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--es-muted);
  animation: es-rise 0.8s var(--es-ease) 0.5s both;
}
.es-title {
  margin: 10px 0 0;
  max-width: 18ch;
  font-family: "Playfair Display", Georgia, serif;
  font-size: clamp(28px, 3vw, 44px);
  font-weight: 600;
  line-height: 1.12;
  letter-spacing: -0.01em;
  animation: es-rise 0.8s var(--es-ease) 0.6s both;
}
.es-title em {
  font-weight: 500;
  color: var(--es-red);
}
.es-text {
  max-width: 44ch;
  margin: 14px 0 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--es-muted);
  animation: es-rise 0.8s var(--es-ease) 0.72s both;
}
.es-actions {
  margin-top: 24px;
  animation: es-rise 0.8s var(--es-ease) 0.84s both;
}
.es-actions :slotted(.es-btn) {
  display: inline-flex;
  align-items: center;
  min-height: 52px;
  padding: 0 28px;
  border: 1.5px solid var(--es-red);
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-decoration: none;
  color: var(--es-red);
  background: transparent;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.12s ease;
}
.es-actions :slotted(.es-btn:hover),
.es-actions :slotted(.es-btn:active) {
  color: #fff;
  background: var(--es-red);
}
.es-actions :slotted(.es-btn:active) {
  transform: scale(0.97);
}
.es-live {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 26px 0 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--es-muted);
  animation: es-rise 0.8s var(--es-ease) 0.96s both;
}
.es-live i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2e9e5b;
  animation: es-ping 2s ease-out infinite;
}

@keyframes es-draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes es-swing {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(6deg);
  }
  75% {
    transform: rotate(-6deg);
  }
}
@keyframes es-rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}
@keyframes es-ping {
  0% {
    box-shadow: 0 0 0 0 rgba(46, 158, 91, 0.5);
  }
  80%,
  100% {
    box-shadow: 0 0 0 8px rgba(46, 158, 91, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .es-draw,
  .es-hanger--swing,
  .es-eyebrow,
  .es-title,
  .es-text,
  .es-actions,
  .es-live,
  .es-live i {
    animation: none;
  }
  .es-draw {
    stroke-dashoffset: 0;
  }
}
</style>

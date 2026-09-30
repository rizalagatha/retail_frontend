<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: "Foto segera hadir" });
</script>

<template>
  <div class="ph" role="img" :aria-label="label">
    <svg class="ph-shirt" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        class="ph-line"
        pathLength="100"
        d="M22 8 L8 16 L14 28 L20 25 L20 56 L44 56 L44 25 L50 28 L56 16 L42 8 C40 12 36 14 32 14 C28 14 24 12 22 8 Z"
      />
    </svg>
    <span class="ph-label">{{ label }}</span>
  </div>
</template>

<style scoped>
.ph {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: linear-gradient(160deg, #f7f1ee 0%, #efe6e2 100%);
}
.ph-shirt {
  width: 38%;
  min-width: 40px;
  max-width: 96px;
  animation: ph-float 4s ease-in-out infinite;
}
.ph-line {
  stroke: #c9b3ab;
  stroke-width: 1.6;
  stroke-linejoin: round;
  stroke-linecap: round;
  stroke-dasharray: 100;
  animation: ph-draw 4s ease-in-out infinite;
}
.ph-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #a1928d;
}
@keyframes ph-draw {
  0% {
    stroke-dashoffset: 100;
  }
  45%,
  80% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -100;
  }
}
@keyframes ph-float {
  50% {
    transform: translateY(-4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ph-shirt,
  .ph-line {
    animation: none;
    stroke-dashoffset: 0;
  }
}
</style>

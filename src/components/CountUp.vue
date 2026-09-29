<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";

const props = defineProps<{
  to: number;
  before?: string;
  after?: string;
  duration?: number;
}>();

const el = ref<HTMLElement | null>(null);
const shown = ref(0);
let io: IntersectionObserver | null = null;
let raf = 0;

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: Number.isInteger(props.to) ? 0 : 1,
  }).format(n);

const run = () => {
  const dur = props.duration ?? 800;
  const t0 = performance.now();
  const tick = (t: number) => {
    const p = Math.min(1, (t - t0) / dur);
    shown.value = props.to * (1 - Math.pow(1 - p, 3)); // ease-out
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
};

onMounted(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    shown.value = props.to;
    return;
  }
  io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      run();
      io?.disconnect();
    },
    { threshold: 0.6 }
  );
  if (el.value) io.observe(el.value);
});

onBeforeUnmount(() => {
  io?.disconnect();
  cancelAnimationFrame(raf);
});
</script>

<template>
  <span ref="el" class="count-up">{{ before }}{{ fmt(shown) }}{{ after }}</span>
</template>

<style scoped>
.count-up {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>

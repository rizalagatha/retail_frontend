<script setup lang="ts">
import WorkSummaryDashboard from "@/components/WorkSummaryDashboard.vue";
import { useSwipeNavigate } from "@/composables/useSwipeNavigate";
import { useRouter } from "vue-router";

const router = useRouter();
const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useSwipeNavigate({
  onSwipeRight: () => router.push({ name: "Home" }),
});
</script>

<template>
  <div
    class="work-summary-page"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <div class="pl-4 pl-md-6 pr-4 pr-md-6 pb-6 pt-4">
      <WorkSummaryDashboard />
    </div>
  </div>
</template>

<style scoped>
.work-summary-page {
  min-height: 100vh;
  touch-action: pan-y;
}
.side-nav--expanded {
  width: 220px;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.1);
}
@media (max-width: 600px) {
  .work-summary-page {
    padding-left: 52px;
  }
}
</style>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from "vue-router";
import { useAuthStore } from "./stores/authStore";

const authStore = useAuthStore();
const route = useRoute();

// panggil sekali di awal supaya state sinkron dengan localStorage
onMounted(() => {
  authStore.checkAuthStatus();
  authStore.initConnectivityCheck();
});

onUnmounted(() => {
  authStore.clearConnectivityCheck();
});

const layoutComponent = computed(() => {
  const layoutName = route.meta.layout || 'DefaultLayout';
  return defineAsyncComponent(() => import(`@/layouts/${layoutName}.vue`));
});

// update title halaman
const updateTitle = () => {
  const title = route.meta?.title || route.name || "Retail";
  document.title = `${title} - Retail Kaosan`;
};

// pantau perubahan route
watch(
  () => route.path,
  () => updateTitle(),
  { immediate: true }
);
</script>

<template>
  <v-app class="desktop-app-container">
    <component :is="layoutComponent" />

  </v-app>
</template>

<style scoped>
/* optional: supaya main penuh */
.v-main {
  min-height: 100vh;
}
</style>

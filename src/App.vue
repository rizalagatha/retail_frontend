<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from "vue-router";
import { useAuthStore } from "./stores/authStore";
import { useUiStore } from "@/stores/uiStore"; // Import UI Store

const authStore = useAuthStore();
const uiStore = useUiStore(); // Panggil UI Store
const route = useRoute();

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

const updateTitle = () => {
  const title = route.meta?.title || route.name || "Retail";
  document.title = `${title} - Retail Kaosan`;
};

watch(
  () => route.path,
  () => updateTitle(),
  { immediate: true }
);
</script>

<template>
  <v-app class="desktop-app-container bg-background" :theme="uiStore.isDark ? 'dark' : 'light'">
    <component :is="layoutComponent" />
  </v-app>
</template>

<style scoped>
.v-main {
  min-height: 100vh;
}
</style>

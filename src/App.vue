<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "./stores/authStore";
import { useUiStore } from "@/stores/uiStore"; // Import UI Store
import { startKiosk } from "@/composables/useKiosk";
import KioskOverlay from "@/components/KioskOverlay.vue";

const authStore = useAuthStore();
const uiStore = useUiStore(); // Panggil UI Store
const route = useRoute();
const router = useRouter();

onMounted(() => {
  authStore.checkAuthStatus();
  authStore.initConnectivityCheck();
  startKiosk(router); // hanya aktif bila dibuka dengan ?kiosk=1
});

onUnmounted(() => {
  authStore.clearConnectivityCheck();
});

const layoutComponent = computed(() => {
  const layoutName = route.meta.layout || "DefaultLayout";
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
    <KioskOverlay />
  </v-app>
</template>

<style scoped>
.v-main {
  min-height: 100vh;
}
/* Global — dropdown kota combobox */
.v-overlay__content .v-list-item-title {
  font-size: 12px !important;
}

.v-overlay__content .v-list-item-subtitle {
  font-size: 10px !important;
}
</style>

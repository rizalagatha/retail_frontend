<script setup lang="ts">
import { watch, onMounted } from "vue";
import { useRoute } from "vue-router";
import Navbar from "./components/Navbar.vue";
import { useAuthStore } from "./stores/authStore";

const authStore = useAuthStore();
const route = useRoute();

// panggil sekali di awal supaya state sinkron dengan localStorage
onMounted(() => {
  authStore.checkAuthStatus();
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
  <v-app>
    <!-- Navbar hanya tampil kalau sudah login -->
    <Navbar v-if="authStore.isAuthenticated" />

    <v-main class="bg-grey-lighten-4">
      <router-view />
    </v-main>
  </v-app>
</template>

<style scoped>
/* optional: supaya main penuh */
.v-main {
  min-height: 100vh;
}
</style>

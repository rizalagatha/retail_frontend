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
  <v-app class="desktop-app-container">
    <router-view />

    <v-dialog v-model="authStore.isSessionExpired" persistent max-width="450px">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="warning" class="me-2">mdi-clock-alert-outline</v-icon>
          <span class="text-h6">Sesi Telah Habis</span>
        </v-card-title>
        <v-card-text>
          Sesi login Anda telah berakhir karena tidak ada aktivitas. Silakan login kembali untuk melanjutkan.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="elevated" @click="authStore.logout" block>
            Login Kembali
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </v-app>
</template>

<style scoped>
/* optional: supaya main penuh */
.v-main {
  min-height: 100vh;
}
</style>

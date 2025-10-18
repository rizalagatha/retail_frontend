<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, watch } from 'vue';
import { useRoute } from "vue-router";
import { useAuthStore } from "./stores/authStore";

const authStore = useAuthStore();
const route = useRoute();

// panggil sekali di awal supaya state sinkron dengan localStorage
onMounted(() => {
  authStore.checkAuthStatus();
  authStore.initConnectivityCheck();
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

    <v-dialog v-model="authStore.isSessionExpired" persistent max-width="450px">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="warning" class="me-2">mdi-clock-alert-outline</v-icon>
          <span class="text-h6">Sesi Telah Habis</span>
        </v-card-title>
        <v-card-text>
          Sesi login Anda telah berakhir. Silakan login kembali untuk melanjutkan.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="elevated" @click="authStore.logout" block>
            Login Kembali
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-footer v-if="authStore.isAuthenticated" app class="pa-2" style="font-size: 12px;">
      <div class="d-flex align-center">
        <v-icon size="small" class="mr-2">mdi-account-circle-outline</v-icon>
        <strong>{{ authStore.user?.nama }}</strong>
        <span class="mx-2 text-disabled">|</span>
        <span>{{ authStore.user?.cabangNama }}</span>
      </div>

      <v-spacer></v-spacer>

      <div class="d-flex align-center">
        <div v-if="authStore.isOnline" class="d-flex align-center">
          <v-icon color="success" size="small" class="mr-1">mdi-circle</v-icon>
          <span class="mr-4">Online</span>
        </div>
        <div v-else class="d-flex align-center">
          <v-icon color="error" size="small" class="mr-1">mdi-circle-off-outline</v-icon>
          <span class="mr-4 font-weight-bold text-error">Offline</span>
        </div>

        <span class="text-medium-emphasis">© 2025 IT Kencana Print</span>
      </div>
    </v-footer>
  </v-app>
</template>

<style scoped>
/* optional: supaya main penuh */
.v-main {
  min-height: 100vh;
}
</style>

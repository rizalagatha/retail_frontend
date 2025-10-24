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

  </v-app>
</template>

<style scoped>
/* optional: supaya main penuh */
.v-main {
  min-height: 100vh;
}
</style>

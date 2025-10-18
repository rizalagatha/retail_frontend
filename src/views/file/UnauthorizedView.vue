<script setup lang="ts">
import PageLayout from '@/components/PageLayout.vue';
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <PageLayout title="Akses Ditolak" :desktop-mode="false">
    <div class="state-container">
        <v-icon size="80" class="mb-4">mdi-lock-outline</v-icon>
        <h1 class="text-h4 font-weight-bold">Akses Ditolak</h1>
        <p class="text-medium-emphasis mt-2 mb-6">
            Maaf, Anda tidak memiliki izin untuk mengakses halaman ini.
        </p>
        <v-btn
          color="primary"
          @click="router.push('/')"
          prepend-icon="mdi-home"
          variant="elevated"
          size="large"
        >
          Kembali ke Beranda
        </v-btn>
    </div>
  </PageLayout>
</template>

<style scoped>
.state-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    text-align: center;
    padding: 16px;
    color: #424242;
}
</style>

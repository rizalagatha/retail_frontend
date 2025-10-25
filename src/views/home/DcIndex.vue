<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import PageLayout from '@/components/PageLayout.vue';

const router = useRouter();

const mainMenus = ref([
  {
    title: 'Master Data',
    description: 'Kelola data master jenis kain, warna, barang, price list, dan promo.',
    icon: 'mdi-database-outline',
    path: '/gudang-dc/master-data',
  },
  {
    title: 'Operasional Gudang',
    description: 'Transaksi gudang DC: terima STBJ, surat jalan, pengambilan, retur, dan mutasi.',
    icon: 'mdi-forklift',
    path: '/gudang-dc/operasional',
  },
]);
</script>

<template>
  <PageLayout title="Menu Gudang DC" icon="mdi-warehouse">
    <div class="pa-4">
      <v-row justify="center">
        <v-col v-for="item in mainMenus" :key="item.path" cols="12" sm="6" md="5">
          <v-card class="d-flex flex-column fill-height" hover elevation="2" @click="router.push(item.path)">
            <v-card-title class="d-flex align-center">
              <v-icon :icon="item.icon" class="mr-3" color="primary" size="32"></v-icon>
              <span class="text-h6 font-weight-bold">{{ item.title }}</span>
            </v-card-title>
            <v-card-text class="flex-grow-1">{{ item.description }}</v-card-text>
            <v-divider></v-divider>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn color="primary" variant="text" :to="item.path">Buka</v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </div>
  </PageLayout>
</template>

<style scoped>
.v-card {
  transition: all 0.2s ease-in-out;
}

.v-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
}
</style>

<script setup lang="ts">
import { ref } from "vue";
import PageLayout from "@/components/PageLayout.vue";
import PriorityProductionTab from "@/components/dc/produksi/PriorityProductionTab.vue";
// import SpkRecommendationTab from "@/components/dc/produksi/SpkRecommendationTab.vue";

const activeTab = ref("priority");
</script>

<template>
  <PageLayout title="Perencanaan Produksi (PPIC)" icon="mdi-factory">
    <v-tabs v-model="activeTab" color="primary" density="compact">
      <v-tab value="priority">Prioritas Produksi</v-tab>
      <v-tab value="recommendation">Rekomendasi SPK</v-tab>
    </v-tabs>

    <v-window v-model="activeTab" class="mt-4">
      <v-window-item value="priority">
        <PriorityProductionTab />
      </v-window-item>

      <v-window-item value="recommendation">
        <SpkRecommendationTab />
      </v-window-item>
    </v-window>
  </PageLayout>
</template>

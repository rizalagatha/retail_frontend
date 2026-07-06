<script setup lang="ts">
import { ref } from "vue";
import PageLayout from "@/components/PageLayout.vue";
import PriorityProductionTab from "@/components/dc/produksi/PriorityProductionTab.vue";
import SpkRecommendationTab from "@/components/dc/produksi/SpkRecommendationTab.vue";

const activeTab = ref("priority");
const spkTabRef = ref<InstanceType<typeof SpkRecommendationTab> | null>(null);

const openSpkInfoDialog = () => {
  if (spkTabRef.value) {
    spkTabRef.value.isInfoDialogOpen = true;
  }
};
</script>

<template>
  <PageLayout title="Perencanaan Produksi (PPIC)" icon="mdi-factory">
    <template #header-actions>
      <v-btn
        v-if="activeTab === 'recommendation'"
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-information-outline"
        @click="openSpkInfoDialog"
      >
        Kriteria & Rumus SPK
      </v-btn>
    </template>

    <v-tabs v-model="activeTab" color="primary" density="compact">
      <v-tab value="priority">Prioritas Produksi</v-tab>
      <v-tab value="recommendation">Rekomendasi SPK</v-tab>
    </v-tabs>

    <v-window v-model="activeTab" class="mt-4">
      <v-window-item value="priority">
        <PriorityProductionTab />
      </v-window-item>

      <v-window-item value="recommendation">
        <SpkRecommendationTab ref="spkTabRef" />
      </v-window-item>
    </v-window>
  </PageLayout>
</template>

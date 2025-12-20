<script setup lang="ts">
import { ref, computed } from 'vue';
import { faqData, type FaqCategory } from '@/config/faq';

const props = defineProps({
  modelValue: Boolean
});

const emit = defineEmits(['update:modelValue']);

// Proxy v-model untuk dialog utama
const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const search = ref('');

// --- FITUR ZOOM GAMBAR (BARU) ---
const zoomDialog = ref(false);
const selectedImage = ref('');

const openZoom = (imageUrl: string) => {
  selectedImage.value = imageUrl;
  zoomDialog.value = true;
};
// --------------------------------

// Logic Filter
const filteredFaq = computed<FaqCategory[]>(() => {
  if (!search.value) return faqData;
  const keyword = search.value.toLowerCase();

  return faqData.map(group => {
    const matchingItems = group.items.filter(item =>
      item.q.toLowerCase().includes(keyword) ||
      item.a.toLowerCase().replace(/<[^>]*>?/gm, '').toLowerCase().includes(keyword) // Cari di text jawaban (strip HTML)
    );

    return { ...group, items: matchingItems };
  }).filter(group => group.items.length > 0);
});
</script>

<template>
  <v-dialog v-model="isOpen" max-width="700" scrollable transition="dialog-bottom-transition">
    <v-card class="rounded-lg d-flex flex-column" style="max-height: 85vh;">

      <v-card-title class="d-flex align-center bg-teal-darken-3 text-white py-3 px-4">
        <v-icon start icon="mdi-comment-question-outline" class="mr-2" />
        <div>
          <div class="text-h6 font-weight-bold">Pusat Bantuan</div>
          <div class="text-caption opacity-80">Cari solusi masalah Anda di sini</div>
        </div>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" density="compact" @click="isOpen = false"></v-btn>
      </v-card-title>

      <div class="px-4 py-3 faq-search">
        <v-text-field v-model="search" prepend-inner-icon="mdi-magnify"
          label="Ketik pertanyaan (misal: stok, retur, password)..." variant="outlined" density="compact" hide-details
          bg-color="white" clearable autofocus class="rounded-lg"></v-text-field>
      </div>

      <v-card-text class="pa-0 faq-body" style="overflow-y: auto;">

        <div v-if="filteredFaq.length === 0" class="text-center pa-10 text-grey-darken-1">
          <v-icon size="64" class="mb-2 text-grey-lighten-1">mdi-emoticon-confused-outline</v-icon>
          <div class="text-h6">Tidak ditemukan</div>
        </div>

        <div v-else class="pa-2">
          <template v-for="(group, i) in filteredFaq" :key="i">
            <div class="d-flex align-center px-4 py-2 mt-2 text-teal-darken-4 font-weight-bold text-uppercase"
              style="font-size: 0.75rem; letter-spacing: 1px;">
              <v-icon size="small" start :icon="group.icon || 'mdi-circle-small'" class="mr-2 opacity-50" />
              {{ group.category }}
            </div>

            <v-expansion-panels variant="inset" class="mb-2">
              <v-expansion-panel v-for="(item, j) in group.items" :key="j" elevation="1" rounded="lg">
                <v-expansion-panel-title class="text-subtitle-2 font-weight-medium">
                  {{ item.q }}
                </v-expansion-panel-title>

                <v-expansion-panel-text class="text-body-2 faq-answer pt-2">

                  <div v-html="item.a" class="text-grey-darken-3 mb-3" style="white-space: pre-wrap;"></div>

                  <div v-if="item.images && item.images.length > 0" class="d-flex flex-wrap ga-3 mt-2">

                    <v-card v-for="(img_path, k) in item.images" :key="k" variant="outlined" color="grey-lighten-2"
                      class="d-inline-block rounded-lg overflow-hidden image-thumbnail-card">
                      <v-img :src="img_path" height="120" width="180" cover
                        class="bg-grey-lighten-3 cursor-pointer zoom-hover" @click="openZoom(img_path)">
                        <template v-slot:placeholder>
                          <div class="d-flex align-center justify-center fill-height">
                            <v-progress-circular indeterminate color="grey" size="20"></v-progress-circular>
                          </div>
                        </template>
                      </v-img>
                    </v-card>

                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </template>
        </div>
      </v-card-text>

      <v-divider></v-divider>
      <v-card-actions class="faq-footer pa-3">
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="isOpen = false">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="zoomDialog" max-width="95vw" max-height="95vh" z-index="3000" scrim="black">
    <v-card class="bg-black d-flex align-center justify-center position-relative" style="min-height: 50vh;">

      <v-btn icon="mdi-close" variant="text" color="white" size="large"
        class="position-absolute top-0 right-0 mt-2 mr-2" style="z-index: 3001; background-color: rgba(0,0,0,0.5);"
        @click="zoomDialog = false"></v-btn>

      <v-img :src="selectedImage" width="100%" height="100%" max-height="90vh" contain>
        <template v-slot:placeholder>
          <div class="d-flex align-center justify-center fill-height">
            <v-progress-circular indeterminate color="white" size="50"></v-progress-circular>
          </div>
        </template>
      </v-img>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* ===== FAQ MODAL DARK/LIGHT SAFE ===== */

/* Search input text */
.faq-search :deep(input) {
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* Placeholder */
.faq-search :deep(input::placeholder) {
  color: rgba(var(--v-theme-on-surface), 0.6) !important;
}

/* Icon search */
.faq-search :deep(.v-field__prepend-inner .v-icon) {
  color: rgba(var(--v-theme-on-surface), 0.7) !important;
}
.faq-body {
  background-color: rgb(var(--v-theme-surface));
}

/* Jawaban FAQ */
.faq-answer {
  color: rgb(var(--v-theme-on-surface));
}

/* List & paragraf di dalam jawaban */
.faq-answer p,
.faq-answer li {
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.6;
}

/* Penekanan */
.faq-answer strong {
  color: rgba(var(--v-theme-on-surface), 0.9);
}

:deep(.v-expansion-panel-title) {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
}

.faq-footer {
  background-color: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

/* ganti border lama */
.border-bottom {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.cursor-pointer {
  cursor: pointer;
}

/* Efek hover pada thumbnail gambar */
.zoom-hover {
  transition: transform 0.2s, filter 0.2s;
}

.zoom-hover:hover {
  transform: scale(1.05);
  filter: brightness(0.9);
}

.z-index-10 {
  z-index: 10;
}

.shadow-none {
  box-shadow: none !important;
}
</style>

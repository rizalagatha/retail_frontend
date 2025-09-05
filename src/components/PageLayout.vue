<script setup lang="ts">
import { computed } from 'vue';

// --- Props ---
interface Props {
  title: string;
  icon?: string;
  loading?: boolean;
  desktopMode?: boolean;
  maxWidth?: string; // Prop baru untuk mengontrol lebar maksimum
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'mdi-file-document-outline',
  loading: false,
  desktopMode: true,
  maxWidth: '100%' // Default ke lebar penuh, bisa di-override per halaman
});

// --- Emits ---
const emit = defineEmits<{
  'update:loading': [value: boolean]
}>();

// --- Computed ---
const containerClass = computed(() => ({
  'page-container': true,
  'desktop-mode': props.desktopMode,
  'modern-mode': !props.desktopMode,
}));

const loadingModel = computed({
  get: () => props.loading,
  set: (value: boolean) => emit('update:loading', value)
});
</script>

<template>
  <div :class="containerClass" :style="{ maxWidth: maxWidth }">
    <!-- Header Section -->
    <div class="page-header">
      <div class="page-title-section">
        <v-icon size="small" class="title-icon">{{ icon }}</v-icon>
        <h1 class="page-title">{{ title }}</h1>
      </div>
      <div class="header-actions">
        <slot name="header-actions" />
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="content-area">
        <!-- Loading Overlay -->
        <v-overlay v-model="loadingModel" contained persistent class="d-flex align-center justify-center">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </v-overlay>
        
        <!-- Slot Konten Utama -->
        <div class="content-wrapper">
          <slot />
        </div>

        <!-- Slot Footer (untuk Status Bar) -->
        <div v-if="$slots.footer" class="content-footer">
          <slot name="footer" />
        </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * LAYOUT UTAMA
 * Bekerja sama dengan desktop-app.css untuk menciptakan tampilan yang diinginkan.
*/

.page-container {
  display: flex;
  flex-direction: column;
  margin: 0 auto; /* Pusatkan container secara horizontal */
  width: 100%;
}

/* Gaya Desktop Mode */
.desktop-mode {
  height: calc(100vh - 48px); /* Tinggi viewport dikurangi tinggi app bar */
  padding: 8px 12px;
  gap: 8px;
}

/* Gaya Web Modern */
.modern-mode {
  padding: 24px;
  gap: 16px;
}

/* Header */
.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.desktop-mode .page-header {
  min-height: 36px;
  margin-bottom: 0;
}
.page-title-section {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title-icon {
  color: #555;
}
.page-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #212121;
}
.desktop-mode .page-title {
  font-size: 1rem; /* Judul lebih kecil di mode desktop */
}
.header-actions {
  display: flex;
  gap: 8px;
}

/* Area Konten Utama */
.content-area {
  flex-grow: 1;
  min-height: 0; /* Penting untuk flexbox scrolling */
  position: relative; /* Untuk v-overlay */
  display: flex;
  flex-direction: column;
  
  /* Menerapkan style dari desktop-app.css jika dalam mode desktop */
  background: var(--content-bg, #ffffff);
  border: var(--content-border, 1px solid #e0e0e0);
  border-radius: var(--content-radius, 8px);
  box-shadow: var(--content-shadow, 0 1px 3px rgba(0,0,0,0.05));
}
.desktop-mode .content-area {
   --content-bg: #ffffff;
   --content-border: 1px solid #dcdcdc;
   --content-radius: 4px;
   --content-shadow: none;
}
.content-wrapper {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 0;
  padding: var(--wrapper-padding, 16px);
}
.desktop-mode .content-wrapper {
  --wrapper-padding: 0; /* Padding diatur oleh section di dalam komponen anak */
}

/* Footer (Status Bar) */
.content-footer {
  flex-shrink: 0;
  /* Menerapkan style dari desktop-app.css */
  border-top: 1px solid #e0e0e0;
}
</style>


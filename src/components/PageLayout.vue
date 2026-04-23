<script setup lang="ts">
import { computed } from "vue";

interface Props {
  title: string;
  icon?: string;
  loading?: boolean;
  desktopMode?: boolean;
  maxWidth?: string;
}

const props = withDefaults(defineProps<Props>(), {
  icon: "mdi-file-document-outline",
  loading: false,
  desktopMode: true,
  maxWidth: "100%",
});

const emit = defineEmits<{
  "update:loading": [value: boolean];
}>();

const containerClass = computed(() => ({
  "page-container": true,
  "desktop-mode": props.desktopMode,
  "modern-mode": !props.desktopMode,
}));

const loadingModel = computed({
  get: () => props.loading,
  set: (value: boolean) => emit("update:loading", value),
});
</script>

<template>
  <div :class="containerClass" :style="{ maxWidth: maxWidth }">
    <div class="page-header">
      <div class="page-title-section">
        <v-icon size="small" class="title-icon">{{ icon }}</v-icon>
        <h1 class="page-title">{{ title }}</h1>
      </div>
      <div class="header-actions hide-scrollbar">
        <slot name="header-actions" />
      </div>
    </div>

    <div class="content-area">
      <v-overlay
        v-model="loadingModel"
        contained
        persistent
        class="d-flex align-center justify-center"
      >
        <v-progress-circular indeterminate color="primary"></v-progress-circular>
      </v-overlay>

      <div class="content-wrapper">
        <slot />
      </div>

      <div v-if="$slots.footer" class="content-footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  width: 100%;
}

.desktop-mode {
  height: calc(100vh - 48px);
  padding: 8px 12px;
  gap: 8px;
}

.modern-mode {
  padding: 24px;
  gap: 16px;
}

.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  position: sticky;
  top: 64px;
  z-index: 99;

  /* [FIX DARK MODE] Gunakan background aplikasi, bukan putih */
  background-color: rgb(var(--v-theme-background));

  padding-top: 8px;
  padding-bottom: 8px;
}

.desktop-mode .page-header {
  min-height: 36px;
  margin-bottom: 0;
  padding-top: 4px;
  padding-bottom: 8px;
}

.page-title-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.title-icon {
  /* [FIX DARK MODE] Warna icon adaptif */
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.page-title {
  font-size: 1.25rem;
  font-weight: 600;
  /* [FIX DARK MODE] Warna teks adaptif */
  color: rgb(var(--v-theme-on-background));
  white-space: nowrap;
}

.desktop-mode .page-title {
  font-size: 1rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.content-area {
  flex-grow: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;

  /* [FIX DARK MODE] Background Konten mengikuti Surface (Putih/Abu Gelap) */
  background: rgb(var(--v-theme-surface));

  /* [FIX DARK MODE] Border tipis adaptif */
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));

  border-radius: 8px;
  box-shadow: none;
}

.desktop-mode .content-area {
  border-radius: 4px;
}

.content-wrapper {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 16px;
}

.desktop-mode .content-wrapper {
  padding: 0;
}

.content-footer {
  flex-shrink: 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background-color: rgb(var(--v-theme-surface));
}

/* =========================================================
   [BARU] PENGATURAN RESPONSIVE UNTUK MOBILE (HP & TABLET)
   ========================================================= */
@media (max-width: 600px) {
  .desktop-mode {
    /* 104px = Navbar (64px) + Footer (40px).
       Gunakan 100dvh agar tidak tertutup address bar HP */
    height: calc(100dvh - 104px);
    padding: 4px 6px;
    gap: 6px;
  }

  .modern-mode {
    padding: 12px;
    gap: 12px;
  }

  .page-header {
    /* Judul dan Tombol jadi atas-bawah */
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding-top: 8px;
    padding-bottom: 4px;
  }

  .desktop-mode .page-header {
    min-height: auto;
  }

  .page-title {
    font-size: 1.1rem !important;
  }

  .header-actions {
    width: 100%;
    /* Mengubah deretan tombol jadi bisa di-scroll ke samping */
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch; /* Smooth scroll di iOS */
  }

  /* Hilangkan scrollbar agar UI bersih tapi tetap bisa di-swipe */
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .hide-scrollbar {
    -ms-overflow-style: none; /* IE and Edge */
    scrollbar-width: none; /* Firefox */
  }
}
</style>

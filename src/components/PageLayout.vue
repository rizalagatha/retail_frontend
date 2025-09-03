<script setup lang="ts">
import { computed } from 'vue';

// --- Props ---
interface Props {
  title: string;
  subtitle?: string;
  icon?: string;
  breadcrumbs?: Array<{
    title: string;
    to?: string;
    disabled?: boolean;
  }>;
  loading?: boolean;
  maxWidth?: string | number;
  fluid?: boolean;
  elevation?: number;
  desktopMode?: boolean; // New prop untuk enable desktop mode
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: '',
  icon: '',
  breadcrumbs: () => [],
  loading: false,
  maxWidth: '100%',
  fluid: true,
  elevation: 1,
  desktopMode: true // Default true untuk desktop-style
});

// --- Emits ---
const emit = defineEmits<{
  'update:loading': [value: boolean]
}>();

// --- Computed ---
const containerClass = computed(() => ({
  'px-4 px-md-6': !props.fluid,
  'px-2': props.fluid,
  'desktop-container': props.desktopMode,
  'traditional-container': !props.desktopMode
}));

const cardStyle = computed(() => ({
  maxWidth: props.maxWidth === '100%' ? undefined : props.maxWidth
}));

// Computed for loading with getter/setter
const loadingModel = computed({
  get: () => props.loading,
  set: (value: boolean) => emit('update:loading', value)
});
</script>

<template>
  <div 
    :class="containerClass"
    class="page-container"
  >
    <!-- Header Section - Fixed Height -->
    <div class="page-header-section" :class="{ 'classic-header': classicStyle }">
      <!-- Breadcrumbs -->
      <div v-if="breadcrumbs.length > 0" class="breadcrumbs-section">
        <template v-if="classicStyle">
          <!-- Classic breadcrumbs -->
          <div class="classic-breadcrumbs">
            <span 
              v-for="(item, index) in breadcrumbs" 
              :key="index"
              class="breadcrumb-classic"
            >
              <router-link v-if="item.to && !item.disabled" :to="item.to">
                {{ item.title }}
              </router-link>
              <span v-else>{{ item.title }}</span>
              <span v-if="index < breadcrumbs.length - 1"> > </span>
            </span>
          </div>
        </template>
        <template v-else>
          <v-breadcrumbs
            :items="breadcrumbs"
            density="compact"
            class="enhanced-breadcrumbs"
          >
            <template #divider>
              <v-icon size="14" color="surface-variant">mdi-chevron-right</v-icon>
            </template>
            <template #item="{ item }">
              <v-breadcrumbs-item
                :to="item.to"
                :disabled="item.disabled"
                class="breadcrumb-item"
              >
                {{ item.title }}
              </v-breadcrumbs-item>
            </template>
          </v-breadcrumbs>
        </template>
      </div>

      <!-- Title and Actions -->
      <div class="title-actions-row" :class="{ 'classic-title-row': classicStyle }">
        <div class="title-section">
          <!-- Classic Icon or Modern Icon -->
          <div v-if="icon" class="icon-section">
            <v-icon 
              v-if="classicStyle"
              :icon="icon" 
              size="16" 
              class="classic-icon"
            />
            <v-avatar
              v-else
              size="40"
              color="primary"
              variant="tonal"
              class="mr-3 header-icon"
            >
              <v-icon :icon="icon" size="20" />
            </v-avatar>
          </div>

          <!-- Title & Subtitle -->
          <div class="header-content">
            <h1 class="page-title" :class="{ 'classic-title': classicStyle }">
              {{ title }}
            </h1>
            <p 
              v-if="subtitle"
              class="page-subtitle"
              :class="{ 'classic-subtitle': classicStyle }"
            >
              {{ subtitle }}
            </p>
          </div>
        </div>

        <!-- Header Actions -->
        <div class="header-actions" :class="{ 'classic-actions': classicStyle }">
          <slot name="header-actions" />
        </div>
      </div>
    </div>

    <!-- Main Content Area - Flexible Height -->
    <div class="content-section">
      <!-- Classic Form Style or Modern Card Style -->
      <div 
        v-if="classicStyle"
        class="desktop-form main-content-classic"
      >
        <!-- Loading Overlay Classic -->
        <div 
          v-if="loadingModel" 
          class="classic-loading-overlay"
        >
          <div class="classic-loading-content">
            <div class="classic-spinner"></div>
            <span class="classic-loading-text">Memuat konten...</span>
          </div>
        </div>

        <!-- Classic Content -->
        <div class="classic-content-wrapper">
          <slot />
        </div>

        <!-- Classic Footer -->
        <div v-if="$slots.footer" class="desktop-statusbar">
          <slot name="footer" />
        </div>
      </div>

      <!-- Modern Card Style -->
      <v-card 
        v-else
        :elevation="elevation"
        class="main-content-card"
        :style="cardStyle"
      >
        <!-- Loading Overlay -->
        <v-overlay
          v-model="loadingModel"
          contained
          persistent
          class="d-flex align-center justify-center loading-overlay"
        >
          <div class="text-center loading-content">
            <v-progress-circular
              indeterminate
              color="primary"
              size="40"
              width="3"
              class="mb-3"
            />
            <v-card-subtitle class="loading-text">
              Memuat konten...
            </v-card-subtitle>
          </div>
        </v-overlay>

        <!-- Scrollable Content -->
        <div class="content-wrapper">
          <slot />
        </div>

        <!-- Footer - Fixed if needed -->
        <div v-if="$slots.footer" class="card-footer">
          <v-divider class="footer-divider" />
          <div class="footer-content">
            <slot name="footer" />
          </div>
        </div>
      </v-card>
    </div>

    <!-- Floating Action Button -->
    <teleport to="body" v-if="$slots.fab">
      <div class="fab-container">
        <slot name="fab" />
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* Desktop-Style Container */
.page-container {
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-background));
}

.desktop-container {
  height: 100vh;
  overflow: hidden;
  padding: 12px 16px;
}

.traditional-container {
  min-height: 100vh;
  padding: 24px 16px;
}

/* Classic Desktop App Integration */
.desktop-app-container.page-container {
  height: 100vh;
  overflow: hidden;
  background: #f0f0f0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 11px;
}

/* Header Section - Fixed Height */
.page-header-section {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.classic-header {
  margin-bottom: 4px;
}

.breadcrumbs-section {
  margin-bottom: 8px;
}

/* Classic Breadcrumbs */
.classic-breadcrumbs {
  font-size: 10px;
  color: #666;
  padding: 2px 0;
}

.breadcrumb-classic {
  color: #666;
}

.breadcrumb-classic a {
  color: #0066cc;
  text-decoration: none;
}

.breadcrumb-classic a:hover {
  text-decoration: underline;
}

.title-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.classic-title-row {
  gap: 8px;
  margin-bottom: 4px;
}

.title-section {
  display: flex;
  align-items: center;
  min-width: 0; /* Allow text truncation */
}

.icon-section {
  margin-right: 8px;
}

.classic-icon {
  color: #333;
}

.header-content {
  min-width: 0; /* Allow text truncation */
}

.header-actions {
  flex-shrink: 0;
}

.classic-actions {
  gap: 4px;
}

/* Content Section - Flexible Height */
.content-section {
  flex: 1;
  min-height: 0; /* Important for flexbox */
  display: flex;
  flex-direction: column;
}

/* Classic Form Style */
.main-content-classic {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
}

.classic-content-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  padding: 0;
}

/* Classic Loading */
.classic-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.classic-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.classic-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e0e0e0;
  border-top: 2px solid #4a90e2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.classic-loading-text {
  font-size: 10px;
  color: #666;
}

.main-content-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 12px !important;
  box-shadow: var(--v-shadow-key-umbra-opacity, rgba(0, 0, 0, 0.2)) 0px 2px 4px -1px,
              var(--v-shadow-key-penumbra-opacity, rgba(0, 0, 0, 0.14)) 0px 4px 5px 0px,
              var(--v-shadow-key-ambient-opacity, rgba(0, 0, 0, 0.12)) 0px 1px 10px 0px;
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
}

.content-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  min-height: 0; /* Important for scrolling */
}

/* Scrollbar Styling */
.content-wrapper::-webkit-scrollbar {
  width: 8px;
}

.content-wrapper::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 4px;
}

.content-wrapper::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface-variant), 0.3);
  border-radius: 4px;
}

.content-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-on-surface-variant), 0.5);
}

/* Header Styles - Compact */
.header-icon {
  transition: all 0.2s ease;
}

.page-title {
  font-family: var(--v-theme-font-family-primary, 'Roboto', sans-serif) !important;
  font-size: 1.5rem !important;
  font-weight: 600 !important;
  line-height: 1.3 !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.classic-title {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
  font-size: 12px !important;
  font-weight: bold !important;
  color: #333 !important;
  margin: 0 !important;
}

.page-subtitle {
  font-size: 0.875rem !important;
  font-weight: 400 !important;
  color: rgb(var(--v-theme-on-surface-variant)) !important;
  margin: 2px 0 0 0 !important;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.classic-subtitle {
  font-size: 10px !important;
  color: #666 !important;
  font-weight: normal !important;
  margin: 0 !important;
}

/* Breadcrumbs - Compact */
.enhanced-breadcrumbs {
  background: rgba(var(--v-theme-surface-variant), 0.2);
  border-radius: 8px;
  padding: 6px 12px !important;
  min-height: auto !important;
}

.breadcrumb-item {
  font-size: 0.75rem !important;
  font-weight: 500 !important;
}

/* Footer - Fixed Height */
.card-footer {
  flex-shrink: 0;
  background: rgba(var(--v-theme-surface-variant), 0.1);
  border-top: 1px solid rgba(var(--v-theme-outline-variant), 0.2);
}

.footer-content {
  padding: 12px 16px;
}

.footer-divider {
  opacity: 0.3;
}

/* Loading Overlay */
.loading-overlay {
  background: rgba(var(--v-theme-surface), 0.95) !important;
  backdrop-filter: blur(8px);
}

.loading-text {
  font-size: 0.875rem !important;
  color: rgb(var(--v-theme-on-surface-variant)) !important;
  margin-top: 0 !important;
}

/* FAB Container */
.fab-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
}

/* Responsive Design */
@media (max-width: 960px) {
  .desktop-container {
    height: 100vh;
    padding: 8px 12px;
  }
  
  .title-actions-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .header-actions {
    align-self: stretch;
  }
  
  .page-title {
    font-size: 1.375rem !important;
    white-space: normal;
  }
  
  .page-subtitle {
    white-space: normal;
  }
  
  .content-wrapper {
    padding: 12px;
  }
}

@media (max-width: 600px) {
  .desktop-container {
    padding: 6px 8px;
  }
  
  .page-title {
    font-size: 1.25rem !important;
  }
  
  .page-subtitle {
    font-size: 0.8125rem !important;
  }
  
  .content-wrapper {
    padding: 10px;
  }
  
  .enhanced-breadcrumbs {
    padding: 4px 8px !important;
  }
  
  .fab-container {
    bottom: 16px;
    right: 16px;
  }
}

/* Utility classes for content */
:deep(.desktop-table) {
  height: 100%;
}

:deep(.desktop-form) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.desktop-form .v-card-text) {
  flex: 1;
  overflow-y: auto;
}

/* Dark theme adjustments */
.v-theme--dark .main-content-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.v-theme--dark .enhanced-breadcrumbs {
  background: rgba(var(--v-theme-surface-variant), 0.15);
}

/* Print styles */
@media print {
  .page-container {
    height: auto !important;
    overflow: visible !important;
  }
  
  .content-wrapper {
    overflow: visible !important;
    height: auto !important;
  }
  
  .fab-container {
    display: none !important;
  }
}</style>
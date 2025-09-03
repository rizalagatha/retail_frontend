<script setup lang="ts">
import PageLayout from '@/components/PageLayout.vue';

// Path ke file PDF di dalam folder public
const manualPdfPath = '/manual-program.pdf';
</script>

<template>
  <PageLayout title="Manual Program">
    <v-container class="py-8">
      <v-row justify="center">
        <v-col cols="12" md="10" lg="8">
          <v-card elevation="4" class="mx-auto">
            <!-- Header -->
            <v-card-title class="text-h5 text-center bg-surface-variant pa-6">
              <v-icon left class="me-2" color="primary">mdi-book-open-page-variant</v-icon>
              Manual Penggunaan Program
            </v-card-title>

            <v-card-text class="pa-8 text-center">
              <!-- Main Description -->
              <div class="mb-6">
                <v-icon size="64" color="primary" class="mb-4">mdi-file-pdf-box</v-icon>
                <div class="text-h6 mb-3 font-weight-medium">Dokumentasi Lengkap Aplikasi Retail</div>
                <div class="text-body-1 text-medium-emphasis mb-4" style="line-height: 1.6;">
                  Dokumentasi lengkap mengenai cara penggunaan aplikasi Retail dapat diakses melalui 
                  manual PDF. Panduan ini mencakup semua fitur dan langkah-langkah penggunaan aplikasi.
                </div>
              </div>

              <!-- Features Info -->
              <v-row class="mb-6">
                <v-col cols="12" sm="4">
                  <v-card variant="outlined" class="pa-4 h-100">
                    <v-icon color="success" class="mb-2">mdi-check-circle</v-icon>
                    <div class="text-body-2 font-weight-medium mb-1">Panduan Lengkap</div>
                    <div class="text-caption text-medium-emphasis">Step-by-step untuk semua fitur</div>
                  </v-card>
                </v-col>
                <v-col cols="12" sm="4">
                  <v-card variant="outlined" class="pa-4 h-100">
                    <v-icon color="info" class="mb-2">mdi-image-multiple</v-icon>
                    <div class="text-body-2 font-weight-medium mb-1">Dengan Screenshot</div>
                    <div class="text-caption text-medium-emphasis">Visual guide dengan gambar</div>
                  </v-card>
                </v-col>
                <v-col cols="12" sm="4">
                  <v-card variant="outlined" class="pa-4 h-100">
                    <v-icon color="warning" class="mb-2">mdi-lightbulb</v-icon>
                    <div class="text-body-2 font-weight-medium mb-1">Tips & Tricks</div>
                    <div class="text-caption text-medium-emphasis">Shortcut dan best practices</div>
                  </v-card>
                </v-col>
              </v-row>

              <!-- Action Button -->
              <v-btn
                :href="manualPdfPath"
                target="_blank"
                rel="noopener noreferrer"
                color="primary"
                size="x-large"
                prepend-icon="mdi-download"
                variant="elevated"
                class="mb-6"
                min-width="250"
              >
                Buka Manual Program (PDF)
              </v-btn>

              <!-- Additional Info -->
              <v-alert
                type="info"
                variant="tonal"
                icon="mdi-information"
              >
                <div class="text-body-2">
                  <div class="mb-2">
                    <strong>Informasi:</strong> Manual akan terbuka di tab browser baru dalam format PDF.
                  </div>
                  <div>
                    Pastikan Anda memiliki aplikasi pembaca PDF di browser atau komputer Anda. 
                    Jika mengalami masalah, coba gunakan browser yang berbeda atau update browser Anda.
                  </div>
                </div>
              </v-alert>

              <!-- Help Section -->
              <v-divider class="my-6"></v-divider>
              
              <div class="text-body-2 text-medium-emphasis">
                <v-icon class="me-1" size="small">mdi-help-circle</v-icon>
                Butuh bantuan lebih lanjut? Hubungi tim support untuk assistance.
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </PageLayout>
</template>

<style scoped>
/* Minimal custom styles - most styling handled by Vuetify */

/* Ensure equal height for feature cards */
.h-100 {
  height: 100%;
}

/* Custom card styling */
.v-card {
  border-radius: 12px !important;
}

/* Hover effect for feature cards */
.v-card.v-card--variant-outlined:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.2s ease-in-out;
}
</style>
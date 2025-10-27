<script setup lang="ts">
import { useManualProgramDialog } from '@/composables/useManualProgramDialog';

const { showManualDialog, closeManualDialog } = useManualProgramDialog();

// Path ke file PDF di folder public
const manualPdfPath = '/manual-program.pdf';

const openPdf = () => {
  window.open(manualPdfPath, '_blank', 'noopener,noreferrer');
};
</script>

<template>
  <v-dialog v-model="showManualDialog" max-width="700">
    <v-card rounded="xl">
      <v-card-title class="text-h6 font-weight-bold d-flex align-center">
        <v-icon color="primary" class="me-2">mdi-book-open-page-variant</v-icon>
        Manual Program
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="closeManualDialog" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pt-5 pb-2">
        <div class="text-center mb-6">
          <v-icon size="64" color="primary" class="mb-3">mdi-file-pdf-box-outline</v-icon>
          <h2 class="text-h6 font-weight-medium mb-2">Dokumentasi Aplikasi</h2>
          <p class="text-body-2 text-medium-emphasis">
            Panduan lengkap cara penggunaan, fitur, dan tips untuk memaksimalkan aplikasi Retail Kaosan.
          </p>
        </div>

        <v-divider class="my-4"></v-divider>

        <h3 class="text-subtitle-1 font-weight-medium text-center mb-4">
          Isi Panduan Meliputi:
        </h3>

        <v-row dense justify="center">
          <v-col cols="12" md="4">
            <div class="feature-item">
              <v-icon color="success" class="me-3">mdi-check-circle-outline</v-icon>
              <div>
                <div class="font-weight-medium">Panduan Lengkap</div>
                <div class="text-caption text-medium-emphasis">Langkah demi langkah penggunaan fitur</div>
              </div>
            </div>
          </v-col>
          <v-col cols="12" md="4">
            <div class="feature-item">
              <v-icon color="info" class="me-3">mdi-image-multiple-outline</v-icon>
              <div>
                <div class="font-weight-medium">Dilengkapi Screenshot</div>
                <div class="text-caption text-medium-emphasis">Panduan visual untuk setiap proses</div>
              </div>
            </div>
          </v-col>
          <v-col cols="12" md="4">
            <div class="feature-item">
              <v-icon color="warning" class="me-3">mdi-lightbulb-on-outline</v-icon>
              <div>
                <div class="font-weight-medium">Tips & Trik</div>
                <div class="text-caption text-medium-emphasis">Shortcut dan praktik terbaik</div>
              </div>
            </div>
          </v-col>
        </v-row>

        <v-alert type="info" variant="tonal" density="compact" class="mt-5 text-caption">
          Manual akan terbuka di tab baru. Pastikan Anda memiliki pembaca PDF di browser Anda.
        </v-alert>
      </v-card-text>

      <v-divider />

      <v-card-actions class="d-flex justify-center py-4">
        <v-btn color="primary" prepend-icon="mdi-download-outline" variant="elevated" min-width="200" @click="openPdf">
          Buka Manual (PDF)
        </v-btn>
        <v-btn color="default" variant="text" min-width="100" @click="closeManualDialog">
          Tutup
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.feature-item {
  display: flex;
  align-items: center;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  background-color: #f9f9f9;
  height: 100%;
}
</style>

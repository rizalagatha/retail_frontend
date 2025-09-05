<script setup lang="ts">
import PageLayout from '@/components/PageLayout.vue';

// Path ke file PDF di dalam folder public
const manualPdfPath = '/manual-program.pdf';
</script>

<template>
  <PageLayout title="Manual Program" desktop-mode icon="mdi-book-open-page-variant">
    <div class="manual-container">
      <div class="desktop-form-section content-card">
        <!-- Bagian Header -->
        <div class="text-center mb-6">
          <v-icon size="60" color="primary" class="mb-3">mdi-file-pdf-box-outline</v-icon>
          <h2 class="text-h6 font-weight-medium">Dokumentasi Aplikasi</h2>
          <p class="text-body-2 text-medium-emphasis mt-2 mx-auto" style="max-width: 600px;">
            Panduan lengkap mengenai cara penggunaan, fitur, dan tips untuk memaksimalkan penggunaan aplikasi Retail Kaosan.
          </p>
        </div>

        <v-divider class="my-4"></v-divider>

        <!-- Bagian Isi Panduan -->
        <div class="mb-6">
          <h3 class="text-subtitle-1 font-weight-medium text-center mb-4">Isi Panduan Meliputi:</h3>
          <v-row dense justify="center">
            <v-col cols="12" md="4">
              <div class="feature-item">
                <v-icon color="success" class="me-3">mdi-check-circle-outline</v-icon>
                <div>
                  <div class="font-weight-medium">Panduan Lengkap</div>
                  <div class="text-caption text-medium-emphasis">Penjelasan langkah demi langkah</div>
                </div>
              </div>
            </v-col>
            <v-col cols="12" md="4">
              <div class="feature-item">
                <v-icon color="info" class="me-3">mdi-image-multiple-outline</v-icon>
                <div>
                  <div class="font-weight-medium">Dilengkapi Screenshot</div>
                  <div class="text-caption text-medium-emphasis">Panduan visual dengan gambar</div>
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
        </div>
        
        <v-spacer></v-spacer> <!-- Mendorong tombol ke bawah -->

        <!-- Bagian Tombol Aksi -->
        <div class="text-center mt-4">
           <v-alert
              type="info"
              variant="tonal"
              density="compact"
              class="mb-4 text-left text-caption"
            >
              Manual akan terbuka di tab browser baru. Pastikan Anda memiliki aplikasi pembaca PDF terinstal.
            </v-alert>
          <v-btn
            :href="manualPdfPath"
            target="_blank"
            rel="noopener noreferrer"
            color="primary"
            size="large"
            prepend-icon="mdi-download-outline"
            variant="elevated"
            min-width="300"
          >
            Buka Manual (PDF)
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Informasi Tambahan di Footer -->
    <template #footer>
      <div class="d-flex align-center justify-end w-100">
        <span>Butuh bantuan lebih lanjut? Hubungi tim support.</span>
      </div>
    </template>
  </PageLayout>
</template>

<style scoped>
.manual-container {
  padding: 12px;
  height: 100%;
  display: flex;
}

.content-card {
  width: 100%;
  max-width: 950px; /* Batasi lebar agar mudah dibaca */
  margin: 0 auto; /* Pusatkan kartu */
  display: flex;
  flex-direction: column;
}

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


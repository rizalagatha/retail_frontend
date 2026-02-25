<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useMemoInternalDialog } from '@/composables/useMemoInternalDialog';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { useToast } from 'vue-toastification';

interface Memo {
  id: number;
  title: string;
  filename: string;
  date: string;
  url: string;
}

const { showMemoDialog, closeMemoDialog } = useMemoInternalDialog();
const authStore = useAuthStore();
const toast = useToast();

const tab = ref('list');
const isLoading = ref(false);
const memos = ref<Memo[]>([]);
const selectedPdfUrl = ref<string | null>(null);

// --- State baru untuk Resize ---
const dialogWidth = ref(900);
const dialogHeight = ref(750);
const isResizing = ref(false);

const startResize = () => { // Parameter 'e' dihapus karena tidak digunakan
  isResizing.value = true;
  window.addEventListener('mousemove', handleResize);
  window.addEventListener('mouseup', stopResize);
};

const handleResize = (e: MouseEvent) => {
  if (!isResizing.value) return;

  // Hitung selisih dari posisi layar (agar lebih natural)
  // Anda bisa menyesuaikan angka pengurang (offset) sesuai kebutuhan layout
  const newWidth = e.clientX - (window.innerWidth - dialogWidth.value) / 2;
  const newHeight = e.clientY - (window.innerHeight - dialogHeight.value) / 2;

  // Set batas minimal agar tidak terlalu kecil
  if (newWidth > 500) dialogWidth.value = newWidth;
  if (newHeight > 400) dialogHeight.value = newHeight;
};

const stopResize = () => {
  isResizing.value = false;
  window.removeEventListener('mousemove', handleResize);
  window.removeEventListener('mouseup', stopResize);
};

// Form Upload
const uploadData = ref({ title: '', file: null as File | null });

const isKdc = computed(() => authStore.user?.cabang === 'KDC');

const fetchMemos = async () => {
  isLoading.value = true;
  try {
    const res = await api.get('/memo-internal'); // Asumsi endpoint API
    memos.value = res.data;
  } catch (error) {
    console.error("Gagal load memo", error);
  } finally {
    isLoading.value = false;
  }
};

const handleUpload = async () => {
  if (!uploadData.value.file || !uploadData.value.title) return;

  const formData = new FormData();
  formData.append('file', uploadData.value.file);
  formData.append('title', uploadData.value.title);

  try {
    isLoading.value = true;
    await api.post('/memo-internal/upload', formData);
    toast.success("Memo berhasil diupload");
    uploadData.value = { title: '', file: null };
    tab.value = 'list';
    fetchMemos();
  } catch (error) {
    toast.error("Gagal upload memo", error);
  } finally {
    isLoading.value = false;
  }
};

const viewPdf = (url: string) => {
  console.log("[DEBUG FRONTEND] Membuka PDF via URL:", url);

  if (!url || url.includes('undefined')) {
    toast.error("URL Memo tidak valid.");
    return;
  }

  // Gunakan origin dari browser saat ini (menghasilkan https://103.94.238.252)
  const baseUrl = window.location.origin;

  // Hasil akhirnya: https://103.94.238.252/memos/memo-xxx.pdf
  selectedPdfUrl.value = `${baseUrl}${url}`;
};

onMounted(fetchMemos);
</script>

<template>
  <v-dialog v-model="showMemoDialog" :width="dialogWidth" :height="dialogHeight" scrollable persistent>
    <v-card rounded="xl" :class="['resizable-card d-flex flex-column fill-height', { 'is-resizing': isResizing }]">
      <v-toolbar color="primary" density="compact" class="flex-grow-0">
        <v-icon class="ms-4">mdi-bulletin-board</v-icon>
        <v-toolbar-title class="text-subtitle-1">Memo Internal Management</v-toolbar-title>
        <v-spacer></v-spacer>
        <span class="text-caption opacity-70 me-4">{{ Math.round(dialogWidth) }}x{{ Math.round(dialogHeight) }}</span>
        <v-btn icon="mdi-close" variant="text" @click="closeMemoDialog" />
      </v-toolbar>

      <v-tabs v-model="tab" bg-color="grey-lighten-4" color="primary" grow class="flex-grow-0">
        <v-tab value="list">Daftar Memo</v-tab>
        <v-tab v-if="isKdc" value="upload">Upload Memo Baru</v-tab>
      </v-tabs>

      <v-card-text class="pa-0 flex-grow-1 overflow-hidden">
        <v-window v-model="tab" class="fill-height">
          <v-window-item value="list" class="fill-height">
            <v-row no-gutters class="fill-height">
              <v-col cols="4" class="border-e overflow-y-auto fill-height">
                <v-list lines="two">
                  <v-list-item v-for="memo in memos" :key="memo.id" @click="viewPdf(memo.url)"
                    :active="selectedPdfUrl === memo.url" color="primary">
                    <template #prepend>
                      <v-icon color="red">mdi-file-pdf-box</v-icon>
                    </template>
                    <v-list-item-title class="font-weight-bold text-truncate">{{ memo.title }}</v-list-item-title>
                    <v-list-item-subtitle>{{ memo.date }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-col>

              <v-col cols="8" class="bg-grey-darken-3 d-flex align-center justify-center fill-height relative">
                <embed v-if="selectedPdfUrl" :src="selectedPdfUrl" type="application/pdf" width="100%" height="100%" />
                <div v-else class="text-white text-center">
                  <v-icon size="64" class="mb-2 opacity-20">mdi-pdf-box</v-icon>
                  <p>Pilih memo untuk melihat isi dokumen</p>
                </div>
              </v-col>
            </v-row>
          </v-window-item>

          <v-window-item value="upload" v-if="isKdc" class="pa-10">
            <v-form @submit.prevent="handleUpload">
              <v-text-field v-model="uploadData.title" label="Judul Memo" variant="outlined"
                prepend-inner-icon="mdi-format-title" class="mb-4" />
              <v-file-input v-model="uploadData.file" label="Pilih File PDF" variant="outlined" accept="application/pdf"
                prepend-inner-icon="mdi-file-upload" />
              <v-btn color="primary" block size="large" type="submit" :loading="isLoading" class="mt-6">
                Simpan & Publish Memo
              </v-btn>
            </v-form>
          </v-window-item>
        </v-window>
      </v-card-text>

      <div class="resize-handle" @mousedown="startResize">
        <v-icon size="small" color="grey">mdi-resize-bottom-right</v-icon>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.resizable-card {
  position: relative;
  user-select: none;
  display: flex;
  flex-direction: column;
}

.resize-handle {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Overlay transparan di atas iframe */
.resizable-card::after {
  content: "";
  display: none;
  /* Sembunyikan secara default */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  background: transparent;
}

/* Tampilkan overlay HANYA saat sedang resize */
.resizable-card.is-resizing::after {
  display: block;
}

:deep(.v-window__container),
:deep(.v-window-item) {
  height: 100%;
}
</style>

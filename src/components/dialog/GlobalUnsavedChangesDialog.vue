<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import { useRouter } from 'vue-router';
import { nextTick } from 'vue';

const uiStore = useUiStore();
const router = useRouter();

const confirmLeave = async () => {
  // 1. Simpan dulu rute tujuan ke variabel lokal
  // KARENA: uiStore.closeLeaveDialog() akan menghapus pendingRoute di store
  const targetRoute = uiStore.pendingRoute;

  // 2. Reset status "Belum Disimpan" agar tidak dicegat lagi oleh navigation guard
  uiStore.setUnsavedChanges(false);

  // 3. Tutup dialog (ini bikin uiStore.pendingRoute jadi null)
  uiStore.closeLeaveDialog();

  await nextTick();

  // 4. Navigasi menggunakan variabel lokal yang sudah kita simpan di langkah 1
  if (targetRoute) {
    // Gunakan fullPath agar query params (seperti ?page=1) tetap terbawa
    router.push(targetRoute.fullPath);
  }
};

const cancelLeave = () => {
  uiStore.closeLeaveDialog();
};
</script>

<template>
  <v-dialog v-model="uiStore.isLeaveDialogVisible" max-width="420" persistent>
    <v-card class="rounded-lg">
      <v-card-title class="text-h6 font-weight-bold d-flex align-center bg-warning text-white py-3">
        <v-icon start icon="mdi-alert-circle-outline" class="mr-2"></v-icon>
        Data Belum Disimpan
      </v-card-title>

      <v-card-text class="pt-4 text-body-1">
        Anda memiliki perubahan yang belum disimpan pada halaman ini.
        <br><br>
        Jika Anda keluar sekarang, perubahan data akan <strong>hilang</strong>.
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="px-4 py-3 bg-grey-lighten-5">
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="cancelLeave" class="font-weight-medium">
          Batal (Tetap di sini)
        </v-btn>

        <v-btn color="error" variant="flat" @click="confirmLeave" prepend-icon="mdi-exit-run" class="px-4">
          Ya, Keluar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

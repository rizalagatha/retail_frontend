<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore';
import Navbar from '@/components/Navbar.vue'; // Pastikan path Navbar benar
import ChangePasswordDialog from '@/components/dialog/ChangePasswordDialog.vue';
import WhatsAppLinkDialog from '@/components/dialog/WhatsappLinkDialog.vue';
import BufferStockDialog from '@/components/dialog/BufferStockDialog.vue';
import SettingsProcessDialog from '@/components/dialog/SettingsProcessDialog.vue';
import { useSettingsProcessDialog } from '@/composables/useSettingsProcessDialog';
import ManualProgramDialog from '@/components/dialog/ManualProgramDialog.vue';

const authStore = useAuthStore();
const { isSettingsProcessDialogOpen, closeSettingsProcessDialog } = useSettingsProcessDialog();
</script>

<template>
  <div>
    <Navbar v-if="authStore.isAuthenticated" />
    <v-main>
      <router-view />
    </v-main>

    <v-footer v-if="authStore.isAuthenticated" app class="pa-2" style="font-size: 12px; border-top: 1px solid #e0e0e0;">
      <div class="d-flex align-center">
        <v-icon size="small" class="mr-2">mdi-account-circle-outline</v-icon>
        <strong>{{ authStore.user?.nama }}</strong>
        <span class="mx-2 text-disabled">|</span>
        <span>{{ authStore.user?.cabangNama }}</span>
      </div>

      <v-spacer></v-spacer>

      <div class="d-flex align-center">
        <div v-if="authStore.isOnline" class="d-flex align-center">
          <v-icon color="success" size="small" class="mr-1">mdi-circle</v-icon>
          <span class="mr-4">Online</span>
        </div>
        <div v-else class="d-flex align-center">
          <v-icon color="error" size="small" class="mr-1">mdi-circle-off-outline</v-icon>
          <span class="mr-4 font-weight-bold text-error">Offline</span>
        </div>
        <span class="text-medium-emphasis">© 2025 IT Kencana Print</span>
      </div>
    </v-footer>

    <ChangePasswordDialog />

    <WhatsAppLinkDialog />

    <BufferStockDialog />

    <SettingsProcessDialog v-if="isSettingsProcessDialogOpen" @close="closeSettingsProcessDialog" />

    <ManualProgramDialog />
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore';
import Navbar from '@/components/Navbar.vue';
import { defineAsyncComponent } from 'vue';

// Import composables atau store untuk state dialog
import { usePasswordDialog } from '@/composables/usePasswordDialog';
import { useWhatsAppDialog } from '@/composables/useWhatsappDialog';
import { useBufferStockDialog } from '@/composables/useBufferStockDialog'; // Contoh
import { useSettingsProcessDialog } from '@/composables/useSettingsProcessDialog';
import { useManualProgramDialog } from '@/composables/useManualProgramDialog'; // Contoh

// Import komponen dialog (lazy load jika memungkinkan untuk performa lebih baik)
const ChangePasswordDialog = defineAsyncComponent(() => import('@/components/dialog/ChangePasswordDialog.vue'));
const WhatsAppLinkDialog = defineAsyncComponent(() => import('@/components/dialog/WhatsappLinkDialog.vue'));
const BufferStockDialog = defineAsyncComponent(() => import('@/components/dialog/BufferStockDialog.vue'));
const SettingsProcessDialog = defineAsyncComponent(() => import('@/components/dialog/SettingsProcessDialog.vue'));
const ManualProgramDialog = defineAsyncComponent(() => import('@/components/dialog/ManualProgramDialog.vue'));

const authStore = useAuthStore();

// Dapatkan state visibilitas dari composables/store
const { showPasswordDialog, closePasswordDialog } = usePasswordDialog(); // Contoh
const { showWhatsAppDialog, closeWhatsAppDialog } = useWhatsAppDialog();
const { showBufferStockDialog, closeBufferStockDialog } = useBufferStockDialog();
const { isSettingsProcessDialogOpen, closeSettingsProcessDialog } = useSettingsProcessDialog();
const { showManualDialog, closeManualDialog } = useManualProgramDialog(); // Contoh

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

    <ChangePasswordDialog v-if="showPasswordDialog" @close="closePasswordDialog" />

    <WhatsAppLinkDialog v-if="showWhatsAppDialog" @close="closeWhatsAppDialog" />

    <BufferStockDialog v-if="showBufferStockDialog" @close="closeBufferStockDialog" />
    <SettingsProcessDialog v-if="isSettingsProcessDialogOpen" @close="closeSettingsProcessDialog" />

    <ManualProgramDialog v-if="showManualDialog" @close="closeManualDialog" />
  </div>
</template>

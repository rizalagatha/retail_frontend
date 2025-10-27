<script setup lang="ts">
defineProps<{
  title: string;
  message: string;
}>();

const emit = defineEmits(['confirm', 'cancel']);
</script>

<template>
  <v-dialog v-model="isOpen" max-width="450">
    <v-card>
      <v-card-title class="text-h6">{{ title }}</v-card-title>
      <v-card-text>{{ message }}</v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" color="secondary" @click="emit('cancel')">
          Batal
        </v-btn>
        <v-btn color="error" @click="emit('confirm')">
          Yakin
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
// Gunakan composable state jika perlu trigger dialog dari luar
import { ref } from 'vue';
export const isOpen = ref(false);
</script>

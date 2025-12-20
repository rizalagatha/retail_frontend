<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'success' | 'danger' | 'secondary';
  disabled?: boolean;
}>(), {
  variant: 'primary',
  disabled: false,
});

const color = computed(() => {
  switch (props.variant) {
    case 'success': return 'success';
    case 'danger': return 'error';
    case 'secondary': return 'secondary'; // Pastikan 'secondary' didefinisikan di theme vuetify.ts jika mau warna spesifik
    default: return 'primary';
  }
});
</script>

<template>
  <v-btn :color="color" :disabled="props.disabled" elevation="1" class="text-white">
    <slot></slot>
  </v-btn>
</template>

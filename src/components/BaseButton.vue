<script setup lang="ts">
import { computed } from 'vue';
import { VBtn } from 'vuetify/components';

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'success' | 'danger' | 'secondary';
  disabled?: boolean;
}>(), {
  variant: 'primary',
  disabled: false,
});

const color = computed(() => {
  switch (props.variant) {
    case 'success':
      return 'success';
    case 'danger':
      return 'error';
    case 'secondary':
      return 'secondary';
    default:
      return 'primary';
  }
});
</script>

<template>
  <v-btn :color="color" :disabled="props.disabled" elevation="1">
    <slot></slot>
  </v-btn>
</template>

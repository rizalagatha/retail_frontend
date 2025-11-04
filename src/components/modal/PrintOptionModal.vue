<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  // Prop baru untuk menerima daftar pilihan yang diizinkan
  options: {
    type: Array as () => ('a4' | 'kasir' | 'wa')[],
    default: () => ['a4', 'kasir', 'wa'] // Pilihan default jika tidak ada prop yang dikirim
  }
});

const emit = defineEmits(['close', 'select']);

// Objek untuk menyimpan detail setiap pilihan
const allOptions = {
  a4: { title: 'Invoice A4', icon: 'mdi-file-document-outline' },
  kasir: { title: 'Struk Kasir (POS)', icon: 'mdi-receipt-text-outline' },
  wa: { title: 'Kirim via WhatsApp', icon: 'mdi-whatsapp' }
};

// Computed property untuk memfilter pilihan yang akan ditampilkan
const displayOptions = computed(() => {
  return props.options.map(key => ({
    key,
    ...allOptions[key]
  }));
});
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" persistent max-width="400px">
    <v-card>
      <v-card-title>Pilih Format Cetak</v-card-title>
      <v-card-text>
        <v-list density="compact">
          <v-list-item v-for="option in displayOptions" :key="option.key" @click="emit('select', option.key)"
            :prepend-icon="option.icon">
            <v-list-item-title>{{ option.title }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn text @click="emit('close')">Batal</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

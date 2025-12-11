<script setup lang="ts">
import { computed } from 'vue';

// HAPUS import static data
// import { changelogData } from '@/data/changelog';

const props = defineProps({
  modelValue: Boolean,
  items: { // [BARU] Terima data dari parent
    type: Array as () => any[],
    default: () => []
  },
  loading: Boolean // [BARU] Status loading
});

const emit = defineEmits(['update:model-value']);

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:model-value', val)
});

const getColor = (type: string) => {
  if (type === 'major') return 'primary';
  return 'grey'; // Default abu-abu biar rapi
};
</script>

<template>
  <v-dialog v-model="isOpen" max-width="600px" scrollable>
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center bg-primary text-white">
        <span>Riwayat Pembaruan</span>
        <v-btn icon="mdi-close" variant="text" color="white" @click="isOpen = false"></v-btn>
      </v-card-title>

      <v-card-text style="max-height: 500px;" class="pa-4">

        <div v-if="loading" class="d-flex justify-center align-center py-5">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </div>

        <v-timeline v-else density="compact" align="start" side="end">
          <v-timeline-item v-for="(log, i) in items" :key="i" :dot-color="getColor(log.type)" size="small">
            <div class="mb-4">
              <div class="font-weight-bold text-h6">
                v{{ log.version }}
                <span v-if="log.date !== '-'" class="text-caption text-grey ml-2">({{ log.date }})</span>
              </div>

              <ul class="pl-4 mt-2 text-body-2 text-grey-darken-3">
                <li v-for="(change, idx) in log.changes" :key="idx" class="mb-1">

                  <template v-if="typeof change === 'string'">
                    {{ change }}
                  </template>

                  <template v-else>
                    <div class="font-weight-bold mt-1">{{ change.title }}</div>
                    <ul class="pl-4" style="list-style-type: circle;">
                      <li v-for="(subItem, subIdx) in change.items" :key="subIdx" class="mb-0 text-grey-darken-2">
                        {{ subItem }}
                      </li>
                    </ul>
                  </template>

                </li>
              </ul>
            </div>
          </v-timeline-item>
        </v-timeline>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" @click="isOpen = false">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

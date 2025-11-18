<script setup lang="ts">
import { formatRupiah } from "@/utils/formatRupiah";

// 1. Definisikan Interface
interface DpItem {
  nomor: string;
  jenis: string;
  posting: string;
  fsk: string; // Kolom ini ada di interface SoCreateView
  nominal: number;
}

// 2. Tentukan Props dengan tipe yang benar
const props = defineProps({
  dpItems: {
    type: Array as () => DpItem[],
    required: true
  }
});

// 3. Tentukan Emits (termasuk event baru)
const emit = defineEmits(['close', 'remove-dp']);

// 4. Definisikan Headers di sini
const dpTableHeaders = [
  { title: 'No. Setoran', key: 'nomor', width: '200px' },
  { title: 'Jenis', key: 'jenis', width: '100px' },
  { title: 'Nominal', key: 'nominal', align: 'end', width: '150px' },
  { title: 'Posting', key: 'posting', width: '100px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
] as const;

// 6. Fungsi Emitter: Meminta parent untuk menghapus item
const requestRemoveDp = (item: DpItem) => {
  // Hanya user yang bisa menghapus DP yang 'BELUM' diposting
  if (item.posting === 'SUDAH') {
    alert('DP yang sudah diposting tidak dapat dihapus.');
    return;
  }
  emit('remove-dp', item);
};
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="800px">
    <v-card>
      <v-toolbar color="teal" density="compact">
        <v-toolbar-title>Rincian Uang Muka (DP)</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-0">

        <v-data-table :headers="dpTableHeaders" :items="props.dpItems" density="compact" class="desktop-table"
          :items-per-page="-1" fixed-header>
          <template #[`item.nomor`]="{ item }">
            <v-text-field :model-value="item.nomor" variant="underlined" density="compact" hide-details readonly
              filled />
          </template>
          <template #[`item.jenis`]="{ item }">
            <v-text-field :model-value="item.jenis" variant="underlined" density="compact" hide-details readonly
              filled />
          </template>
          <template #[`item.nominal`]="{ item }">
            <v-text-field :model-value="formatRupiah(item.nominal)" variant="underlined" density="compact" hide-details
              class="text-end" readonly filled />
          </template>
          <template #[`item.actions`]="{ item }">
            <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="requestRemoveDp(item)"
              title="Hapus DP" :disabled="item.posting === 'SUDAH'" />
          </template>
          <template #bottom></template> </v-data-table>

      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.desktop-table {
  max-height: 400px;
  /* Batasi tinggi tabel di dalam modal */
}

.text-end input {
  text-align: right;
}
</style>

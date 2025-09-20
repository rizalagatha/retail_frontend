<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps({
    dps: { type: Array as () => any[], required: true }
});

const emit = defineEmits(['close']);

const headers = [
    { title: 'Nomor Setoran', key: 'nomor' },
    { title: 'Jenis', key: 'jenis' },
    { title: 'Nominal', key: 'nominal', align: 'end' },
];

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);
</script>

<template>
    <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="700px" persistent>
        <v-card>
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">DP Terkait</v-toolbar-title>
                <v-spacer />
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>

            <v-card-text class="pa-4">
                <v-data-table :headers="headers" :items="props.dps" density="compact" class="desktop-table"
                    :items-per-page="-1" hide-default-footer>
                    <template #item.nominal="{ value }">
                        {{ formatRupiah(value) }}
                    </template>
                    <template #no-data>
                        <div class="text-center pa-4">Belum ada DP yang ditambahkan.</div>
                    </template>
                </v-data-table>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>
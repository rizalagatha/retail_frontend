<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import api from '@/services/api';

interface Workshop {
    kode: string;
    nama: string;
}

const emit = defineEmits(['close', 'workshop-selected']);

const items = ref<Workshop[]>([]);
const loading = ref(true);
const search = ref('');

const headers = [
    { title: 'Kode', key: 'kode', sortable: false, width: '150px' },
    { title: 'Nama Workshop', key: 'nama', sortable: false },
];

const loadItems = async () => {
    loading.value = true;
    try {
        const response = await api.get('/so-dtf-form/search/workshop', {
            params: { term: search.value },
        });
        items.value = response.data;
    } catch (error) {
        console.error("Gagal memuat data workshop:", error);
        items.value = [];
    } finally {
        loading.value = false;
    }
};

const selectWorkshop = (item: Workshop) => {
    if (item && item.kode) {
        emit('workshop-selected', item);
        emit('close');
    }
};

let searchTimeout: number;
watch(search, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadItems();
    }, 500);
});

onMounted(() => {
    loadItems();
});
</script>

<template>
    <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="800px" persistent>
        <v-card class="dialog-card d-flex flex-column" style="height: 60vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Workshop</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari berdasarkan kode atau nama workshop..."
                    prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable
                    class="mb-4 flex-shrink-0" hide-details autofocus></v-text-field>
                <v-data-table :headers="headers" :items="items" :loading="loading" hover
                    class="desktop-table flex-grow-1" density="compact" fixed-header :items-per-page="-1">
                    <template #item="{ item }">
                        <tr @click="selectWorkshop(item)" style="cursor: pointer;">
                            <td>{{ item.kode }}</td>
                            <td>{{ item.nama }}</td>
                        </tr>
                    </template>
                    <template #bottom></template>
                </v-data-table>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<style scoped>
.dialog-card {
    font-size: 12px;
}

.desktop-table {
    font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 28px !important;
}
</style>
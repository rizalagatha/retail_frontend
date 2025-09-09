<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import api from '@/services/api';
import { format } from 'date-fns';

interface SoDtfItem {
    nomor: string;
    tanggal: string;
    namaDtf: string;
    keterangan: string;
}

const props = defineProps({
    cabang: { type: String, required: true },
    customerKode: { type: String, required: true }
});
const emit = defineEmits(['close', 'selected']);

const items = ref<SoDtfItem[]>([]);
const loading = ref(true);
const search = ref('');

const headers = [
    { title: 'Nomor', key: 'nomor', sortable: false, width: '200px' },
    { title: 'Tanggal', key: 'tanggal', sortable: false, width: '120px' },
    { title: 'Nama DTF', key: 'namaDtf', sortable: false, width: '40%' },
    { title: 'Keterangan', key: 'keterangan', sortable: false },
];

const loadItems = async () => {
    loading.value = true;
    try {
        const response = await api.get('/offer-form/search/so-dtf', {
            params: {
                term: search.value,
                cabang: props.cabang,
                customerKode: props.customerKode
            },
        });
        items.value = response.data;
    } catch (error) {
        console.error("Gagal memuat data SO DTF:", error);
    } finally {
        loading.value = false;
    }
};

const selectItem = (item: SoDtfItem) => {
    emit('selected', item);
    emit('close');
};

let searchTimeout: number;
watch(search, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadItems(), 500);
});

onMounted(loadItems);
</script>

<template>
    <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1200px" persistent>
        <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih SO DTF</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari berdasarkan Nomor atau Nama DTF..."
                    prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable
                    class="mb-4 flex-shrink-0" hide-details autofocus></v-text-field>
                <v-data-table :headers="headers" :items="items" :loading="loading" hover
                    class="desktop-table flex-grow-1" density="compact" fixed-header :items-per-page="-1">
                    <template #item="{ item }">
                        <tr @click="selectItem(item)" style="cursor: pointer;">
                            <td>{{ item.nomor }}</td>
                            <td>{{ format(new Date(item.tanggal), 'dd/MM/yyyy') }}</td>
                            <td>{{ item.namaDtf }}</td>
                            <td>{{ item.keterangan }}</td>
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
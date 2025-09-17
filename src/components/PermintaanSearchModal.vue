<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';

interface Permintaan {
    nomor: string;
    tanggal: string;
    otomatis: string;
    keterangan: string;
}

const props = defineProps({
    storeKode: { type: String, required: true }
});
const emit = defineEmits(['close', 'permintaan-selected']);

const items = ref<Permintaan[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
    { title: 'Nomor', key: 'nomor' },
    { title: 'Tanggal', key: 'tanggal' },
    { title: 'Otomatis', key: 'otomatis' },
    { title: 'Keterangan', key: 'keterangan' },
];

const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
    loading.value = true;
    try {
        const response = await api.get('/surat-jalan-form/search/permintaan', {
            params: {
                storeKode: props.storeKode,
                term: search.value,
                page: page,
                itemsPerPage: itemsPerPage,
            },
        });
        if (response.data && Array.isArray(response.data.items)) {
            items.value = response.data.items;
            totalItems.value = response.data.total;
        } else {
            items.value = [];
            totalItems.value = 0;
        }
    } catch (error) {
        console.error("Gagal memuat data permintaan:", error);
        items.value = [];
        totalItems.value = 0;
    } finally {
        loading.value = false;
    }
};

const selectPermintaan = (item: Permintaan) => {
    emit('permintaan-selected', item);
    emit('close');
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        options.value.page = 1;
        loadItems(options.value);
    }, 500);
});
</script>

<template>
    <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="900px" persistent>
        <v-card class="d-flex flex-column" style="height: 80vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih No. Permintaan</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari..." prepend-inner-icon="mdi-magnify" variant="outlined"
                    density="compact" clearable class="mb-4 flex-shrink-0" hide-details autofocus></v-text-field>
                <v-data-table-server v-model:page="options.page" v-model:items-per-page="options.itemsPerPage"
                    :headers="headers" :items="items" :items-length="totalItems" :loading="loading"
                    @update:options="loadItems" hover class="desktop-table flex-grow-1" density="compact" fixed-header>
                    <template #item="{ item }">
                        <tr @click="selectPermintaan(item)" style="cursor: pointer;">
                            <td>{{ item.nomor }}</td>
                            <td>{{ item.tanggal }}</td>
                            <td>{{ item.otomatis }}</td>
                            <td>{{ item.keterangan }}</td>
                        </tr>
                    </template>
                </v-data-table-server>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>
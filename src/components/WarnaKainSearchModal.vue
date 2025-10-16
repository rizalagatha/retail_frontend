<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';

interface WarnaKain {
    nama: string;
}

const emit = defineEmits(['close', 'warna-kain-selected']);

const items = ref<WarnaKain[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
    { title: 'Nama Warna Kain', key: 'nama', sortable: false },
];

const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
    loading.value = true;
    try {
        // Ganti endpoint sesuai dengan route lookup warna kain Anda
        const response = await api.get('/barang-dc-form/lookup/warna-kain', {
            params: {
                term: search.value,
                page: page,
                itemsPerPage: itemsPerPage,
            },
        });
        items.value = response.data.items;
        totalItems.value = response.data.total;
    } catch (error) {
        console.error("Gagal memuat data warna kain:", error);
    } finally {
        loading.value = false;
    }
};

const selectWarnaKain = (item: WarnaKain) => {
    if (item && item.nama) {
        emit('warna-kain-selected', item);
        emit('close');
    }
};

let searchTimeout: any;
watch(search, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        options.value.page = 1;
        loadItems(options.value);
    }, 500);
});

</script>

<template>
    <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="600px" persistent>
        <v-card class="dialog-card d-flex flex-column" style="height: 60vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Warna Kain</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari berdasarkan nama warna kain..."
                    prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable
                    class="mb-4 flex-shrink-0" hide-details autofocus></v-text-field>
                <v-data-table-server v-model:page="options.page" v-model:items-per-page="options.itemsPerPage"
                    :headers="headers" :items="items" :items-length="totalItems" :loading="loading"
                    @update:options="loadItems" hover class="desktop-table flex-grow-1" density="compact" fixed-header>
                    <template #item="{ item }">
                        <tr @click="selectWarnaKain(item)" style="cursor: pointer;">
                            <td>{{ item.nama }}</td>
                        </tr>
                    </template>
                </v-data-table-server>
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
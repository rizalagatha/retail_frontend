<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';

interface Sales {
    kode: string;
    nama: string;
    alamat: string;
}

const emit = defineEmits(['close', 'sales-selected']);

const items = ref<Sales[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
    { title: 'Kode', key: 'kode', sortable: false, width: '150px' },
    { title: 'Nama Sales', key: 'nama', sortable: false, width: '40%' },
    { title: 'Alamat', key: 'alamat', sortable: false },
];

const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
    loading.value = true;
    try {
        const response = await api.get('/so-dtf-form/search/sales', {
            params: {
                term: search.value,
                page: page,
                itemsPerPage: itemsPerPage,
            },
        });
        items.value = response.data.items;
        totalItems.value = response.data.total; // Simpan total item
    } catch (error) {
        console.error("Gagal memuat data sales:", error);
        items.value = [];
        totalItems.value = 0;
    } finally {
        loading.value = false;
    }
};


const selectSales = (item: Sales) => {
    if (item && item.kode) {
        emit('sales-selected', item);
    }
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        options.value.page = 1; // Reset ke halaman 1 saat mencari
        loadItems(options.value);
    }, 500);
});

</script>

<template>
    <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1000px" persistent>
        <v-card class="dialog-card d-flex flex-column" style="height: 70vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Sales</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari berdasarkan kode atau nama sales..."
                    prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable
                    class="mb-4 flex-shrink-0" hide-details autofocus></v-text-field>
                <v-data-table-server v-model:page="options.page" v-model:items-per-page="options.itemsPerPage"
                    :headers="headers" :items="items" :items-length="totalItems" :loading="loading"
                    @update:options="loadItems" hover class="desktop-table flex-grow-1" density="compact" fixed-header>
                    <template #item="{ item }">
                        <tr @click="selectSales(item)" style="cursor: pointer;">
                            <td>{{ item.kode }}</td>
                            <td>{{ item.nama }}</td>
                            <td>{{ item.alamat }}</td>
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

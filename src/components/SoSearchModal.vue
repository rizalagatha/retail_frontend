<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';
import { format } from 'date-fns';

const props = defineProps({
    cabang: { type: String, required: true }
});
const emit = defineEmits(['close', 'selected']);

const items = ref([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
    { title: 'Nomor SO', key: 'Nomor' },
    { title: 'Tanggal', key: 'Tanggal' },
    { title: 'Kode Customer', key: 'KdCus' },
    { title: 'Nama Customer', key: 'Customer' },
];

const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
    loading.value = true;
    try {
        const response = await api.get('/mutasi-out-form/lookup/so', {
            params: {
                term: search.value,
                cabang: props.cabang,
                page: page,
                itemsPerPage: itemsPerPage,
            },
        });
        items.value = response.data.items;
        totalItems.value = response.data.total;
    } catch (error) { console.error("Gagal memuat data SO:", error); }
    finally { loading.value = false; }
};

const selectItem = (item: any) => {
    emit('selected', item);
    emit('close');
};

watch(search, () => {
    options.value.page = 1;
    setTimeout(() => loadItems(options.value), 500);
});
</script>

<template>
    <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1000px" persistent>
        <v-card class="dialog-card d-flex flex-column" style="height: 70vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title>Bantuan - Pilih Surat Pesanan (SO)</v-toolbar-title>
                <v-spacer /><v-btn icon="mdi-close" @click="$emit('close')" />
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari Nomor SO atau Nama Customer..." variant="outlined"
                    density="compact" clearable class="mb-4" hide-details autofocus />

                <v-data-table-server v-model:page="options.page" v-model:items-per-page="options.itemsPerPage"
                    :headers="headers" :items="items" :items-length="totalItems" :loading="loading"
                    @update:options="loadItems" hover class="desktop-table flex-grow-1" density="compact" fixed-header>
                    <template #item="{ item }">
                        <tr @click="selectItem(item)" style="cursor: pointer;">
                            <td>{{ item.Nomor }}</td>
                            <td>{{ format(new Date(item.Tanggal), 'dd/MM/yyyy') }}</td>
                            <td>{{ item.KdCus }}</td>
                            <td>{{ item.Customer }}</td>
                        </tr>
                    </template>
                </v-data-table-server>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>
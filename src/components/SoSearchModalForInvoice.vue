<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, parseISO } from 'date-fns';

interface So {
    Nomor: string;
    Tanggal: string;
    Customer: string;
    Alamat: string;
    Kota: string;
}

const props = defineProps({
    cabang: { type: String, required: true }
});
const emit = defineEmits(['close', 'selected']);
const toast = useToast();

const items = ref<So[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 15 });

const headers = [
    { title: 'Nomor SO', key: 'Nomor' },
    { title: 'Tanggal', key: 'Tanggal' },
    { title: 'Customer', key: 'Customer' },
    { title: 'Alamat', key: 'Alamat' },
    { title: 'Kota', key: 'Kota' },
];

const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
    loading.value = true;
    try {
        const response = await api.get('/invoice-form/lookup/so', {
            params: {
                cabang: props.cabang,
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
    } catch {
        toast.error("Gagal memuat data SO.");
        items.value = [];
        totalItems.value = 0;
    } finally {
        loading.value = false;
    }
};

const selectItem = (item: So) => {
    emit('selected', item);
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

onMounted(() => {
    loadItems(options.value);
});
</script>

<template>
    <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1000px" persistent>
        <v-card class="d-flex flex-column" style="height: 80vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Surat Pesanan (SO)</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari berdasarkan nomor SO atau nama customer..."
                    prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable
                    class="mb-4 flex-shrink-0" hide-details autofocus></v-text-field>
                <v-data-table-server v-model:page="options.page" v-model:items-per-page="options.itemsPerPage"
                    :headers="headers" :items="items" :items-length="totalItems" :loading="loading"
                    @update:options="loadItems" hover class="desktop-table flex-grow-1" density="compact" fixed-header>
                    <template #item="{ item }">
                        <tr @click="selectItem(item)" style="cursor: pointer;">
                            <td>{{ item.Nomor }}</td>
                            <td>{{ format(parseISO(item.Tanggal), 'dd/MM/yyyy') }}</td>
                            <td>{{ item.Customer }}</td>
                            <td>{{ item.Alamat }}</td>
                            <td>{{ item.Kota }}</td>
                        </tr>
                    </template>
                </v-data-table-server>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>
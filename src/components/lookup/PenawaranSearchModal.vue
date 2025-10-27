<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import api from '@/services/api';
import { format } from 'date-fns';

const props = defineProps({
    cabang: { type: String, required: true },
    customerKode: { type: String, required: true },
});
const emit = defineEmits(['close', 'selected']);

const items = ref([]);
const loading = ref(true);
const search = ref('');

const headers = [
    { title: 'Nomor', key: 'nomor', width: '180px' },
    { title: 'Tanggal', key: 'tanggal', width: '120px' },
    { title: 'Kd. Cus', key: 'kdcus', width: '120px' },
    { title: 'Customer', key: 'customer', width: '250px' },
    { title: 'Level', key: 'level' },
    { title: 'Alamat', key: 'alamat' },
    { title: 'Keterangan', key: 'keterangan' },
];

const loadItems = async () => {
    loading.value = true;
    try {
        const response = await api.get('/so-form/lookup/penawaran', {
            params: { term: search.value, cabang: props.cabang, customerKode: props.customerKode },
        });
        items.value = response.data;
    } catch (error) { console.error("Gagal memuat data Penawaran:", error); }
    finally { loading.value = false; }
};

const selectItem = <T>(item: T) => {
  emit('selected', item);
  emit('close');
};

watch(search, () => { setTimeout(loadItems, 500); });
onMounted(loadItems);
</script>

<template>
    <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1000px" persistent>
        <v-card class="dialog-card d-flex flex-column" style="height: 70vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title>Bantuan - Pilih Penawaran</v-toolbar-title>
                <v-spacer /><v-btn icon="mdi-close" @click="$emit('close')" />
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari..." variant="outlined" density="compact" clearable
                    class="mb-4" hide-details />
                <v-data-table :headers="headers" :items="items" :loading="loading" hover
                    class="desktop-table flex-grow-1" density="compact" fixed-header :items-per-page="-1">
                    <template #item="{ item }">
                        <tr @click="selectItem(item)" style="cursor: pointer;">
                            <td>{{ item.nomor }}</td>
                            <td>{{ format(new Date(item.tanggal), 'dd/MM/yyyy') }}</td>
                            <td>{{ item.kdcus }}</td>
                            <td>{{ item.customer }}</td>
                            <td>{{ item.level }}</td>
                            <td>{{ item.alamat }}</td>
                            <td>{{ item.keterangan }}</td>
                        </tr>
                    </template>
                    <template #bottom></template>
                </v-data-table>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

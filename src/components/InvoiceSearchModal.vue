<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, parseISO } from 'date-fns';

interface Invoice {
  nomor: string;
  tanggal: string;
  cus_nama: string;
}

const emit = defineEmits(['close', 'invoice-selected']);
const toast = useToast();

const items = ref<Invoice[]>([]);
const loading = ref(true);
const search = ref('');

const headers = [
    { title: 'Nomor Invoice', key: 'nomor' },
    { title: 'Tanggal', key: 'tanggal' },
    { title: 'Customer', key: 'cus_nama' },
];

const loadItems = async () => {
    loading.value = true;
    try {
        const response = await api.get('/retur-jual-form/lookup/invoices');
        items.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat daftar invoice.', error);
    } finally {
        loading.value = false;
    }
};

const selectItem = (item: Invoice) => {
    emit('invoice-selected', item);
    emit('close');
};

onMounted(loadItems);
</script>

<template>
    <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="900px" persistent>
        <v-card class="d-flex flex-column" style="height: 70vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Invoice</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field
                    v-model="search"
                    label="Cari berdasarkan Nomor, Tanggal, atau Customer..."
                    prepend-inner-icon="mdi-magnify"
                    variant="outlined"
                    density="compact"
                    clearable
                    hide-details
                    autofocus
                    class="mb-4 flex-shrink-0"
                ></v-text-field>
                <v-data-table
                    :headers="headers"
                    :items="items"
                    :loading="loading"
                    :search="search"
                    hover
                    density="compact"
                    fixed-header
                    class="flex-grow-1"
                >
                    <template #item="{ item }">
                        <tr @click="selectItem(item)" style="cursor: pointer;">
                            <td>{{ item.nomor }}</td>
                            <td>{{ format(parseISO(item.tanggal), 'dd/MM/yyyy') }}</td>
                            <td>{{ item.cus_nama }}</td>
                        </tr>
                    </template>
                </v-data-table>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>
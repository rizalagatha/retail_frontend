<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';

interface Retur {
    Nomor: string;
    Tanggal: string;
    Nominal: number;
    Sisa: number;
}

const props = defineProps({
    customerKode: { type: String, required: true },
    invoiceNomor: { type: String, required: true },
});
const emit = defineEmits(['close', 'selected']);
const toast = useToast();

const items = ref<Retur[]>([]);
const loading = ref(true);

const headers = [
    { title: 'Nomor Retur', key: 'Nomor' },
    { title: 'Tanggal', key: 'Tanggal' },
    { title: 'Sisa Nominal', key: 'Sisa', align: 'end' },
] as const;

const loadItems = async () => {
    loading.value = true;
    try {
        const response = await api.get('/invoice-form/lookup/retur-jual', {
            params: { customerKode: props.customerKode, invoiceNomor: props.invoiceNomor },
        });
        items.value = response.data;
    } catch (error) {
        toast.error("Gagal memuat data retur jual.", error);
    } finally {
        loading.value = false;
    }
};

onMounted(loadItems);
</script>

<template>
    <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="700px" persistent>
        <v-card>
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title>Bantuan - Pilih Retur Jual</v-toolbar-title>
                <v-spacer /><v-btn icon="mdi-close" @click="$emit('close')" />
            </v-toolbar>
            <v-card-text class="pa-4">
                <v-data-table :headers="headers" :items="items" :loading="loading" density="compact" hover
                    @click:row="(_, { item }) => emit('selected', item)" />
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';

interface Promo {
    nomor: string;
    namaPromo: string;
}

const props = defineProps({
    tanggal: { type: String, required: true }
});
const emit = defineEmits(['close', 'selected']);
const toast = useToast();

const items = ref<Promo[]>([]);
const loading = ref(false);
const search = ref('');

const headers = [
    { title: 'Nomor Promo', key: 'nomor' },
    { title: 'Nama Promo', key: 'namaPromo' },
];

const loadItems = async () => {
    loading.value = true;
    try {
        const response = await api.get('/invoice-form/lookup/promo', {
            params: { term: search.value, tanggal: props.tanggal },
        });
        items.value = response.data;
    } catch (error) {
        toast.error("Gagal memuat data promo.");
    } finally {
        loading.value = false;
    }
};

const selectItem = (item: Promo) => {
    emit('selected', item);
    emit('close');
};

onMounted(loadItems);
</script>

<template>
    <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="800px" persistent>
        <v-card class="d-flex flex-column" style="height: 70vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title>Bantuan - Pilih Promo</v-toolbar-title>
                <v-spacer /><v-btn icon="mdi-close" @click="$emit('close')" />
            </v-toolbar>
            <v-card-text class="pa-4">
                <v-text-field v-model="search" @input="loadItems" label="Cari..." variant="outlined" density="compact"
                    clearable autofocus />
                <v-data-table :headers="headers" :items="items" :loading="loading" hover
                    @click:row="(_, { item }) => selectItem(item)" />
            </v-card-text>
        </v-card>
    </v-dialog>
</template>
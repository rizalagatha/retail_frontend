<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';

const props = defineProps({
    promoNomor: { type: String, required: true }
});
const emit = defineEmits(['close', 'selected']);
const toast = useToast();
const items = ref([]);
const loading = ref(true);

const headers = [
    { title: 'Kode', key: 'kode' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran' },
    { title: 'Stok', key: 'stok', align: 'end' },
] as const;

onMounted(async () => {
    try {
        const response = await api.get(`/invoice-form/lookup/promo-bonus/${props.promoNomor}`);
        items.value = response.data;
    } catch (error) {
        toast.error("Gagal memuat item bonus.");
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="800px">
        <v-card>
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title>Pilih Item Bonus</v-toolbar-title>
                <v-spacer /><v-btn icon="mdi-close" @click="$emit('close')" />
            </v-toolbar>
            <v-card-text>
                <v-data-table :headers="headers" :items="items" :loading="loading" hover
                    @click:row="(_, { item }) => emit('selected', item)" />
            </v-card-text>
        </v-card>
    </v-dialog>
</template>
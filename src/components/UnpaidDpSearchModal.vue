<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';

interface UnpaidDp {
    nomor: string;
    jenis: string;
    nominal: number;
}

const props = defineProps({
    customerKode: { type: String, required: true }
});
const emit = defineEmits(['close', 'selected']);
const toast = useToast();

const items = ref<UnpaidDp[]>([]);
const loading = ref(true);
const search = ref('');

const filteredItems = computed(() => {
    if (!search.value) return items.value;
    return items.value.filter(item =>
        item.nomor.toLowerCase().includes(search.value.toLowerCase())
    );
});

const headers = [
    { title: 'Nomor Setoran', key: 'nomor' },
    { title: 'Jenis', key: 'jenis' },
    { title: 'Sisa Nominal', key: 'nominal', align: 'end' },
];

const loadItems = async () => {
    loading.value = true;
    try {
        const response = await api.get(`/invoice-form/lookup/unpaid-dp/${props.customerKode}`);
        items.value = response.data;
    } catch (error) {
        toast.error("Gagal memuat data DP yang belum lunas.", error);
    } finally {
        loading.value = false;
    }
};

const selectItem = (item: UnpaidDp) => {
    emit('selected', item);
    emit('close');
};

const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

onMounted(loadItems);
</script>

<template>
    <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="800px" persistent>
        <v-card class="d-flex flex-column" style="height: 70vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih DP/Setoran</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>

            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari berdasarkan nomor setoran..."
                    prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable
                    class="mb-4 flex-shrink-0" hide-details autofocus></v-text-field>

                <div class="table-container">
                    <v-data-table :headers="headers" :items="filteredItems" :loading="loading" density="compact"
                        class="desktop-table" fixed-header hover :items-per-page="-1"
                        @click:row="(_, { item }) => selectItem(item)">
                        <template #item.nominal="{ value }">
                            {{ formatRupiah(value) }}
                        </template>
                        <template #no-data>
                            <div class="text-center pa-4">Tidak ada DP/Setoran sisa untuk customer ini.</div>
                        </template>
                        <template #bottom></template>
                    </v-data-table>
                </div>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>
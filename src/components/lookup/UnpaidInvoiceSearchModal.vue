<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, parseISO } from 'date-fns';

interface Invoice {
    invoice: string;
    tanggal: string;
    jatuhTempo: string;
    nominal: number;
    terbayar: number;
    sisa: number;
}

const props = defineProps({
    customerKode: { type: String, required: true }
});
const emit = defineEmits(['close', 'invoice-selected']);
const toast = useToast();

const items = ref<Invoice[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref('');
const options = ref({ page: 1, itemsPerPage: 15 });

const headers = [
    { title: 'No. Invoice', key: 'invoice' },
    { title: 'Tanggal', key: 'tanggal' },
    { title: 'Jatuh Tempo', key: 'jatuhTempo' },
    { title: 'Nominal', key: 'nominal', align: 'end' },
    { title: 'Terbayar', key: 'terbayar', align: 'end' },
    { title: 'Sisa Piutang', key: 'sisa', align: 'end' },
] as const;

const loadItems = async ({ page, itemsPerPage }: { page: number, itemsPerPage: number }) => {
    loading.value = true;
    try {
        const response = await api.get('/setoran-bayar-form/lookup/unpaid-invoices', {
            params: {
                customerKode: props.customerKode,
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
    } catch (error) {
        toast.error("Gagal memuat data invoice.", error);
        items.value = [];
        totalItems.value = 0;
    } finally {
        loading.value = false;
    }
};

const selectInvoice = (item: Invoice) => {
    emit('invoice-selected', item);
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

const formatRupiah = (value: number) => {
    return new Intl.NumberFormat('id-ID').format(value || 0);
};
</script>

<template>
    <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="1000px" persistent>
        <v-card class="d-flex flex-column" style="height: 80vh;">
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Invoice Belum Lunas</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
                <v-text-field v-model="search" label="Cari berdasarkan nomor invoice..."
                    prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable
                    class="mb-4 flex-shrink-0" hide-details autofocus></v-text-field>
                <v-data-table-server v-model:page="options.page" v-model:items-per-page="options.itemsPerPage"
                    :headers="headers" :items="items" :items-length="totalItems" :loading="loading"
                    @update:options="loadItems" hover class="desktop-table flex-grow-1" density="compact" fixed-header>
                    <template #item="{ item }">
                        <tr @click="selectInvoice(item)" style="cursor: pointer;">
                            <td>{{ item.invoice }}</td>
                            <td>{{ item.tanggal ? format(parseISO(item.tanggal), 'dd/MM/yyyy') : '' }}</td>
                            <td>{{ item.jatuhTempo ? format(parseISO(item.jatuhTempo), 'dd/MM/yyyy') : '' }}</td>
                            <td class="text-end">{{ formatRupiah(item.nominal) }}</td>
                            <td class="text-end">{{ formatRupiah(item.terbayar) }}</td>
                            <td class="text-end font-weight-bold">{{ formatRupiah(item.sisa) }}</td>
                        </tr>
                    </template>
                </v-data-table-server>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>
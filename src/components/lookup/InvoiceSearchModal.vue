<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, parseISO } from 'date-fns';
import type { AxiosError } from 'axios';
import type { DataTableHeader } from 'vuetify';

interface ReturJualInvoice {
  nomor: string;
  tanggal: string;
  cus_nama: string;
}

interface PotonganPiutangInvoice {
  Invoice: string;
  TglInvoice: string;
  Top: number;
  JatuhTempo: string;
  Nominal: number;
  Bayar: number;
  Sisa: number;
}

interface Props {
  source: string; // 'retur-jual' atau 'potongan-piutang'
  customerKode?: string;
  gudangKode?: string;
}

type ReturItem = {
  nomor: string;
  tanggal: string;
  cus_nama: string;
};

type PiutangItem = {
  Invoice: string;
  TglInvoice: string;
  Top: number;
  JatuhTempo: string;
  Nominal: number;
  Bayar: number;
  Sisa: number;
};

type TableItem = ReturItem | PiutangItem;
type Invoice = ReturJualInvoice | PotonganPiutangInvoice;
const props = defineProps<Props>();
const emit = defineEmits(['close', 'invoice-selected']);
const toast = useToast();

const items = ref<Invoice[]>([]);
const loading = ref(true);
const search = ref('');

const headers = computed<DataTableHeader[]>(() => {
  if (props.source === 'potongan-piutang') {
    return [
      { title: 'No. Invoice', key: 'Invoice' },
      { title: 'Tgl. Invoice', key: 'TglInvoice' },
      { title: 'TOP', key: 'Top', align: 'end' },
      { title: 'Jatuh Tempo', key: 'JatuhTempo' },
      { title: 'Nominal', key: 'Nominal', align: 'end' },
      { title: 'Terbayar', key: 'Bayar', align: 'end' },
      { title: 'Sisa Piutang', key: 'Sisa', align: 'end' },
    ];
  }

  // Default (untuk 'retur-jual')
  return [
    { title: 'Nomor Invoice', key: 'nomor' },
    { title: 'Tanggal', key: 'tanggal' },
    { title: 'Customer', key: 'cus_nama' },
  ];
});

const loadItems = async () => {
  loading.value = true;
  try {
    let apiUrl = '';
    const params: Record<string, string | undefined> = {};

    if (props.source === 'potongan-piutang') {
      apiUrl = '/potongan-form/lookup/invoices';
      params.customerKode = props.customerKode;
      params.gudangKode = props.gudangKode;
    } else if (props.source === 'retur-jual') {
      apiUrl = '/retur-jual-form/lookup/invoices';
    } else {
      toast.error('Sumber data invoice tidak valid.');
      return;
    }

    const response = await api.get(apiUrl, { params });
    items.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    const message = error.response?.data?.message || 'Gagal memuat daftar invoice.';
    toast.error(message);
  } finally {
    loading.value = false;
  }
};

const filteredItems = computed(() => {
  if (!search.value) return items.value;
  const lower = search.value.toLowerCase();

  if (props.source === 'potongan-piutang') {
    return items.value.filter(
      (item): item is PotonganPiutangInvoice =>
        'Invoice' in item && item.Invoice.toLowerCase().includes(lower)
    );
  }

  // Default (retur-jual)
  return items.value.filter(
    (item): item is ReturJualInvoice =>
      'nomor' in item &&
      (item.nomor.toLowerCase().includes(lower) ||
        item.cus_nama.toLowerCase().includes(lower))
  );
});

const selectItem = (item: Invoice) => {
  emit('invoice-selected', item);
  emit('close');
};

function isPiutangItem(item: TableItem): item is PiutangItem {
  return 'Invoice' in item;
}

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
        <v-text-field v-model="search" label="Cari berdasarkan Nomor, Tanggal, atau Customer..."
          prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable hide-details autofocus
          class="mb-4 flex-shrink-0"></v-text-field>

        <v-data-table :headers="headers" :items="filteredItems" :loading="loading" :search="search" hover
          density="compact" fixed-header class="flex-grow-1">
          <template #item="{ item }">
            <tr @click="selectItem(item)" style="cursor: pointer;">
              <template v-if="isPiutangItem(item)">
                <td>{{ item.Invoice }}</td>
                <td>{{ format(parseISO(item.TglInvoice), 'dd/MM/yyyy') }}</td>
                <td class="text-end">{{ item.Top }}</td>
                <td>{{ item.JatuhTempo }}</td>
                <td class="text-end">{{ (item.Nominal || 0).toLocaleString('id-ID') }}</td>
                <td class="text-end">{{ (item.Bayar || 0).toLocaleString('id-ID') }}</td>
                <td class="text-end">{{ (item.Sisa || 0).toLocaleString('id-ID') }}</td>
              </template>
              <template v-else>
                <td>{{ item.nomor }}</td>
                <td>{{ format(parseISO(item.tanggal), 'dd/MM/yyyy') }}</td>
                <td>{{ item.cus_nama }}</td>
              </template>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data invoice.</div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

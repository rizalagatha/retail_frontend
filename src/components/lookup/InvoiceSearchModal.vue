<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { format, parseISO } from 'date-fns';
import type { AxiosError } from 'axios';
import type { DataTableHeader } from 'vuetify';

// --- Interfaces (Sesuai camelCase Backend) ---
interface ReturJualInvoice {
  nomor: string;
  tanggal: string;
  cus_nama: string;
}

interface PotonganPiutangInvoice {
  invoice: string;
  tanggalInvoice: string;
  top: number;
  jatuhTempo: string;
  nominalInvoice: number;
  terbayarPiutang: number;
  sisaPiutang: number;
}

interface Props {
  source: string;
  customerKode?: string;
  gudangKode?: string;
}

// Union Type
type Invoice = ReturJualInvoice | PotonganPiutangInvoice;

const props = defineProps<Props>();
const emit = defineEmits(['close', 'invoice-selected']);
const toast = useToast();

const items = ref<Invoice[]>([]);
const loading = ref(true);
const search = ref('');

// --- Headers ---
const headers = computed<DataTableHeader[]>(() => {
  if (props.source === 'potongan-piutang') {
    return [
      { title: 'No. Invoice', key: 'invoice', width: '180px' },
      { title: 'Tgl. Invoice', key: 'tanggalInvoice', width: '120px' },
      { title: 'TOP', key: 'top', align: 'end', width: '80px' },
      { title: 'Jatuh Tempo', key: 'jatuhTempo', width: '120px' },
      { title: 'Nominal', key: 'nominalInvoice', align: 'end', width: '120px' },
      { title: 'Terbayar', key: 'terbayarPiutang', align: 'end', width: '120px' },
      { title: 'Sisa Piutang', key: 'sisaPiutang', align: 'end', width: '120px' },
    ];
  }
  // Default (retur-jual)
  return [
    { title: 'Nomor Invoice', key: 'nomor' },
    { title: 'Tanggal', key: 'tanggal' },
    { title: 'Customer', key: 'cus_nama' },
  ];
});

// --- Helper Formatting & Type Safety ---

const formatDateStr = (dateStr: string) => {
  if (!dateStr) return '-';
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy');
  } catch {
    return dateStr;
  }
};

const formatNum = (num: number) => {
  return (num || 0).toLocaleString('id-ID');
};

// [SOLUSI TANPA ANY]
// Fungsi-fungsi ini menerima 'Invoice' (Union Type) dan mengecek properti secara aman
// sebelum mengaksesnya.

// 1. Getter untuk Retur Jual
const getTanggalRetur = (item: Invoice) => {
  // Cek apakah properti 'tanggal' ada di item
  if ('tanggal' in item) {
    return formatDateStr(item.tanggal);
  }
  return '';
};

// 2. Getter untuk Potongan Piutang
const getTanggalInvoice = (item: Invoice) => {
  if ('tanggalInvoice' in item) {
    return formatDateStr(item.tanggalInvoice);
  }
  return '';
};

const getJatuhTempo = (item: Invoice) => {
  if ('jatuhTempo' in item) {
    return formatDateStr(item.jatuhTempo);
  }
  return '';
};

const getNominal = (item: Invoice) => {
  if ('nominalInvoice' in item) {
    return formatNum(item.nominalInvoice);
  }
  return '0';
};

const getTerbayar = (item: Invoice) => {
  if ('terbayarPiutang' in item) {
    return formatNum(item.terbayarPiutang);
  }
  return '0';
};

const getSisa = (item: Invoice) => {
  if ('sisaPiutang' in item) {
    return formatNum(item.sisaPiutang);
  }
  return '0';
};

// --- Logic Load Data ---
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

  return items.value.filter((item) => {
    // Type Guard manual untuk filter
    if ('invoice' in item) {
      return item.invoice.toLowerCase().includes(lower);
    } else if ('nomor' in item) {
      return (
        item.nomor.toLowerCase().includes(lower) ||
        item.cus_nama.toLowerCase().includes(lower)
      );
    }
    return false;
  });
});

const handleRowClick = (_: Event, row: { item: Invoice }) => {
  emit('invoice-selected', row.item);
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
        <v-text-field v-model="search" label="Cari berdasarkan Nomor, Tanggal, atau Customer..."
          prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" clearable hide-details autofocus
          class="mb-4 flex-shrink-0">
        </v-text-field>

        <v-data-table :headers="headers" :items="filteredItems" :loading="loading" hover density="compact" fixed-header
          class="flex-grow-1" @click:row="handleRowClick">
          <template #[`item.tanggal`]="{ item }">
            {{ getTanggalRetur(item) }}
          </template>

          <template #[`item.tanggalInvoice`]="{ item }">
            {{ getTanggalInvoice(item) }}
          </template>

          <template #[`item.jatuhTempo`]="{ item }">
            {{ getJatuhTempo(item) }}
          </template>

          <template #[`item.nominalInvoice`]="{ item }">
            {{ getNominal(item) }}
          </template>

          <template #[`item.terbayarPiutang`]="{ item }">
            {{ getTerbayar(item) }}
          </template>

          <template #[`item.sisaPiutang`]="{ item }">
            {{ getSisa(item) }}
          </template>

          <template #no-data>
            <div class="text-center pa-4">Tidak ada data invoice.</div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

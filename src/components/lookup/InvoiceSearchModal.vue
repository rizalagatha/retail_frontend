<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, parseISO } from "date-fns";
import type { AxiosError } from "axios";
import type { DataTableHeader } from "vuetify";

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

interface BiayaKirimLookupInvoice {
  Nomor: string;
  Tanggal: string;
  Nominal: number;
  KdCus: string;
  Customer: string;
  Alamat: string;
  Sisa?: number;
}

interface Props {
  source: string;
  customerKode?: string;
  gudangKode?: string;
}

// Union Type
type Invoice = ReturJualInvoice | PotonganPiutangInvoice | BiayaKirimLookupInvoice;

const props = defineProps<Props>();
const emit = defineEmits(["close", "invoice-selected"]);
const toast = useToast();

const items = ref<Invoice[]>([]);
const loading = ref(true);
const search = ref("");

// --- Headers ---
const headers = computed<DataTableHeader[]>(() => {
  if (props.source === "potongan-piutang") {
    return [
      { title: "No. Invoice", key: "invoice", width: "180px" },
      { title: "Tgl. Invoice", key: "tanggalInvoice", width: "120px" },
      { title: "TOP", key: "top", align: "end", width: "80px" },
      { title: "Jatuh Tempo", key: "jatuhTempo", width: "120px" },
      { title: "Nominal", key: "nominalInvoice", align: "end", width: "120px" },
      { title: "Terbayar", key: "terbayarPiutang", align: "end", width: "120px" },
      { title: "Sisa Piutang", key: "sisaPiutang", align: "end", width: "120px" },
    ];
  }
  if (props.source === "biaya-kirim" || props.source === "komplain") {
    // [FIX] Gabung dengan biaya kirim karena fieldnya sama
    return [
      { title: "Nomor Invoice", key: "Nomor", width: "180px" },
      { title: "Tanggal", key: "Tanggal", width: "120px" },
      { title: "Customer", key: "Customer", width: "200px" },
      { title: "Nominal", key: "Nominal", align: "end", width: "120px" },
      { title: "Alamat", key: "Alamat" },
    ];
  }
  // Default (retur-jual)
  return [
    { title: "Nomor Invoice", key: "nomor" },
    { title: "Tanggal", key: "tanggal" },
    { title: "Customer", key: "cus_nama" },
  ];
});

// --- Helper Formatting & Type Safety ---

const formatDateStr = (dateStr: string) => {
  if (!dateStr) return "-";
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
};

const formatNum = (num: number) => {
  return (num || 0).toLocaleString("id-ID");
};

// Fungsi helper untuk mengambil nilai dari objek secara aman tanpa 'any'
const getRawValue = (item: Invoice, key: string): unknown => {
  // Sesuai instruksi error: konversi ke 'unknown' dulu, baru ke Record
  const record = item as unknown as Record<string, unknown>;
  return record[key];
};

const resolveDate = (item: Invoice): string => {
  // Mencari salah satu key tanggal yang mungkin ada
  const rawDate =
    getRawValue(item, "Tanggal") ??
    getRawValue(item, "tanggal") ??
    getRawValue(item, "tanggalInvoice") ??
    getRawValue(item, "jatuhTempo");

  return typeof rawDate === "string" ? formatDateStr(rawDate) : "-";
};

const resolveNominal = (item: Invoice): string => {
  const rawNominal = getRawValue(item, "Nominal") ?? getRawValue(item, "nominalInvoice");

  return typeof rawNominal === "number" ? formatNum(rawNominal) : "0";
};

const resolveSisa = (item: Invoice): string => {
  const rawSisa = getRawValue(item, "Sisa") ?? getRawValue(item, "sisaPiutang");

  return typeof rawSisa === "number" ? formatNum(rawSisa) : "0";
};

// --- Logic Load Data ---
const loadItems = async () => {
  loading.value = true;
  try {
    let apiUrl = "";
    const params: Record<string, string | undefined> = {};

    if (props.source === "potongan-piutang") {
      apiUrl = "/potongan-form/lookup/invoices";
      params.customerKode = props.customerKode;
      params.gudangKode = props.gudangKode;
    } else if (props.source === "retur-jual") {
      apiUrl = "/retur-jual-form/lookup/invoices";
    } else if (props.source === "biaya-kirim") {
      // PERBAIKAN: Kirim customerKode agar pencarian spesifik
      apiUrl = "/biaya-kirim-form/lookup/invoice";
      params.customerKode = props.customerKode;
    } else if (props.source === "komplain") {
      // [FIX] Tambahkan endpoint komplain
      apiUrl = "/komplain-form/lookup/invoice";
    } else {
      toast.error("Sumber data invoice tidak valid.");
      return;
    }

    const response = await api.get(apiUrl, { params });
    items.value = response.data;
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat daftar.");
  } finally {
    loading.value = false;
  }
};

const filteredItems = computed(() => {
  if (!search.value) return items.value;
  const lower = search.value.toLowerCase();

  return items.value.filter((item) => {
    // 1. Kasus: Biaya Kirim (Menggunakan 'Nomor' dan 'Customer')
    if ("Nomor" in item && (props.source === "biaya-kirim" || props.source === "komplain")) {
      const nomor = (item.Nomor || "").toLowerCase();
      const customer = (item.Customer || "").toLowerCase();
      return nomor.includes(lower) || customer.includes(lower);
    }

    // 2. Kasus: Potongan Piutang (Menggunakan 'invoice')
    if ("invoice" in item) {
      const invoice = (item.invoice || "").toLowerCase();
      return invoice.includes(lower);
    }

    // 3. Kasus: Retur Jual (Menggunakan 'nomor' dan 'cus_nama')
    if ("nomor" in item) {
      const nomor = (item.nomor || "").toLowerCase();
      const cusNama = (item.cus_nama || "").toLowerCase();
      return nomor.includes(lower) || cusNama.includes(lower);
    }

    return false;
  });
});

const handleRowClick = (_: Event, row: { item: Invoice }) => {
  emit("invoice-selected", row.item);
  emit("close");
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="900px" persistent>
    <v-card class="d-flex flex-column modal-style-delphi" style="height: 70vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-2">Bantuan - Pilih Invoice</v-toolbar-title>
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
          class="mb-4 flex-shrink-0 search-input-compact"
        />

        <v-data-table
          :headers="headers"
          :items="filteredItems"
          :loading="loading"
          hover
          density="compact"
          fixed-header
          class="flex-grow-1 table-font-11"
          @click:row="handleRowClick"
        >
          <template #[`item.Tanggal`]="{ item }">
            {{ resolveDate(item) }}
          </template>

          <template #[`item.tanggal`]="{ item }">
            {{ resolveDate(item) }}
          </template>

          <template #[`item.tanggalInvoice`]="{ item }">
            {{ resolveDate(item) }}
          </template>

          <template #[`item.jatuhTempo`]="{ item }">
            {{ resolveDate(item) }}
          </template>

          <template #[`item.nominalInvoice`]="{ item }">
            {{ resolveNominal(item) }}
          </template>

          <template #[`item.Nominal`]="{ item }">
            {{ resolveNominal(item) }}
          </template>

          <template #[`item.Sisa`]="{ item }">
            {{ resolveSisa(item) }}
          </template>

          <template #[`item.sisaPiutang`]="{ item }">
            {{ resolveSisa(item) }}
          </template>

          <template #no-data>
            <div class="text-center pa-4">Tidak ada data invoice.</div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Konsistensi Font 11px untuk menyerupai Grid Delphi */
.table-font-11 :deep(table) {
  font-size: 11px !important;
}

.table-font-11 :deep(th) {
  font-size: 11px !important;
  font-weight: bold !important;
  background-color: #f5f5f5 !important;
  color: #333 !important;
}

.table-font-11 :deep(td) {
  height: 30px !important;
  /* Baris lebih padat */
  white-space: nowrap;
}

.search-input-compact :deep(input),
.search-input-compact :deep(label) {
  font-size: 12px !important;
}

.modal-style-delphi {
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
}
</style>

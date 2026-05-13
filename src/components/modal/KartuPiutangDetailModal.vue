<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import { useToast } from "vue-toastification";

const toast = useToast();

interface Invoice {
  nomor: string;
  tanggal: string;
  invoice: string;
  top: number;
  jatuhTempo: string;
  nominal: number;
  terbayar: number;
  sisa: number;
}
interface Payment {
  no: number;
  tanggal: string;
  uraian: string;
  debet: number;
  kredit: number;
  keterangan: string;
}

const props = defineProps({
  customerKode: { type: String, required: true },
  cabang: { type: String, required: true },
});

const emit = defineEmits(["close"]);

const invoices = ref<Invoice[]>([]);
const payments = ref<Payment[]>([]);
const selectedInvoice = ref<Invoice[]>([]);
const loadingInvoices = ref(true);
const loadingPayments = ref(false);

const invoiceHeaders = [
  { title: "No.", key: "no" },
  { title: "Tanggal", key: "tanggal" },
  { title: "Invoice", key: "invoice" },
  { title: "Top", key: "top" },
  { title: "Jatuh Tempo", key: "jatuhTempo" },
  { title: "Nominal", key: "nominal" },
  { title: "Terbayar", key: "terbayar" },
  { title: "Sisa", key: "sisa" },
];
const paymentHeaders = [
  { title: "No.", key: "no" },
  { title: "Tanggal", key: "tanggal" },
  { title: "Uraian", key: "uraian" },
  { title: "Debet", key: "debet" },
  { title: "Kredit", key: "kredit" },
  { title: "Keterangan", key: "keterangan" },
];

const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID").format(value || 0);

const fetchInvoices = async () => {
  loadingInvoices.value = true;
  try {
    const response = await api.get(`/kartu-piutang/invoices/${props.customerKode}`, {
      params: { cabang: props.cabang },
    });
    invoices.value = response.data;
  } finally {
    loadingInvoices.value = false;
  }
};

const fetchPayments = async (piutangHeaderNomor: string) => {
  loadingPayments.value = true;
  payments.value = [];
  try {
    const response = await api.get(`/kartu-piutang/payment-details/${piutangHeaderNomor}`);
    payments.value = response.data;
  } finally {
    loadingPayments.value = false;
  }
};

const exportExcel = () => {
  if (invoices.value.length === 0) {
    toast.warning("Tidak ada data invoice untuk diekspor.");
    return;
  }

  toast.info("Menyiapkan file Excel...");

  try {
    const workbook = XLSX.utils.book_new();

    // 1. Data Invoice
    const dataInvoice = invoices.value.map((inv, index) => ({
      No: index + 1,
      Tanggal: inv.tanggal ? format(parseISO(inv.tanggal), "dd/MM/yyyy") : "-",
      Invoice: inv.invoice,
      "TOP (Hari)": inv.top,
      "Jatuh Tempo": inv.jatuhTempo ? format(parseISO(inv.jatuhTempo), "dd/MM/yyyy") : "-",
      Nominal: Number(inv.nominal) || 0,
      Terbayar: Number(inv.terbayar) || 0,
      "Sisa Piutang": Number(inv.sisa) || 0,
    }));
    const wsInvoice = XLSX.utils.json_to_sheet(dataInvoice);

    // Auto-width kolom invoice
    wsInvoice["!cols"] = [
      { wch: 5 },
      { wch: 12 },
      { wch: 20 },
      { wch: 10 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(workbook, wsInvoice, "Daftar Invoice");

    // 2. Data Payment (Hanya diexport jika ada yang dipilih/ditampilkan)
    if (payments.value.length > 0) {
      const dataPayment = payments.value.map((pay, index) => ({
        No: index + 1,
        Tanggal: pay.tanggal ? format(parseISO(pay.tanggal), "dd/MM/yyyy") : "-",
        Uraian: pay.uraian,
        Debet: Number(pay.debet) || 0,
        Kredit: Number(pay.kredit) || 0,
        Keterangan: pay.keterangan || "-",
      }));
      const wsPayment = XLSX.utils.json_to_sheet(dataPayment);

      // Auto-width kolom payment
      wsPayment["!cols"] = [
        { wch: 5 },
        { wch: 12 },
        { wch: 30 },
        { wch: 15 },
        { wch: 15 },
        { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(workbook, wsPayment, "Detail Pembayaran");
    }

    const fileName = `Detail_Piutang_${props.customerKode}_${format(
      new Date(),
      "yyyyMMdd_HHmmss"
    )}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success("Berhasil mengekspor data!");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data.");
  }
};

onMounted(fetchInvoices);

watch(selectedInvoice, (newSelection) => {
  if (newSelection && newSelection.length > 0) {
    fetchPayments(newSelection[0].nomor);
  } else {
    payments.value = [];
  }
});
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="1200px" persistent>
    <v-card class="d-flex flex-column" style="height: 85vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title>Detail Kartu Piutang</v-toolbar-title>
        <v-spacer />

        <v-btn
          color="success"
          variant="flat"
          size="small"
          prepend-icon="mdi-file-excel"
          class="mr-3 font-weight-bold text-none"
          @click="exportExcel"
        >
          Export Excel
        </v-btn>

        <v-btn icon="mdi-close" @click="$emit('close')" />
      </v-toolbar>
      <v-card-text class="d-flex flex-column" style="gap: 16px; overflow-y: auto">
        <div class="table-wrapper">
          <div class="text-subtitle-1 font-weight-bold mb-2">Daftar Invoice</div>
          <v-data-table
            v-model="selectedInvoice"
            :headers="invoiceHeaders"
            :items="invoices"
            :loading="loadingInvoices"
            class="desktop-table header-browse-blue"
            density="compact"
            show-select
            single-select
            return-object
            item-value="nomor"
          >
            <template #[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>
            <template #[`item.tanggal`]="{ item }">
              {{ format(parseISO(item.tanggal), "dd/MM/yyyy") }}
            </template>
            <template #[`item.jatuhTempo`]="{ item }">
              {{ format(parseISO(item.jatuhTempo), "dd/MM/yyyy") }}
            </template>
            <template #[`item.nominal`]="{ item }">
              {{ formatRupiah(item.nominal) }}
            </template>
            <template #[`item.terbayar`]="{ item }">
              {{ formatRupiah(item.terbayar) }}
            </template>
            <template #[`item.sisa`]="{ item }">
              {{ formatRupiah(item.sisa) }}
            </template>
          </v-data-table>
        </div>
        <div class="table-wrapper">
          <div class="text-subtitle-1 font-weight-bold mb-2">Detail Pembayaran</div>
          <v-data-table
            :headers="paymentHeaders"
            :items="payments"
            :loading="loadingPayments"
            class="desktop-table header-browse-blue"
            density="compact"
          >
            <template #[`item.no`]="{ index }">
              {{ index + 1 }}
            </template>
            <template #[`item.tanggal`]="{ item }">
              {{ format(parseISO(item.tanggal), "dd/MM/yyyy") }}
            </template>
            <template #[`item.debet`]="{ item }">
              {{ formatRupiah(item.debet) }}
            </template>
            <template #[`item.kredit`]="{ item }">
              {{ formatRupiah(item.kredit) }}
            </template>
          </v-data-table>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

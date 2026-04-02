<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import api from "@/services/api";
import Logo from "@/assets/logo.png";
import { format, parseISO } from "date-fns";
import { formatRupiah } from "@/utils/formatRupiah";

interface ReturJualHeader {
  nomor: string;
  tanggal: string;
  user_create: string;

  customer: {
    nama: string;
    alamat?: string;
    kota?: string;
    telp?: string;
  };

  gudang: {
    nama: string;
    alamat?: string;
    telp?: string;
  };

  summary: {
    subtotal: number;
    diskon: number;
    grandTotal: number;
  };
}

interface ReturJualDetail {
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  harga: number;
  total: number;
}

interface ReturJualPrintData {
  header: ReturJualHeader;
  details: ReturJualDetail[];
}

const props = defineProps({
  modelValue: Boolean,
  nomorRetur: String,
});

const emit = defineEmits(["update:modelValue"]);

const data = ref<ReturJualPrintData | null>(null);
const loading = ref(false);

watch(
  () => props.modelValue,
  (v) => {
    if (v) loadData();
  }
);

const loadData = async () => {
  if (!props.nomorRetur) return;
  loading.value = true;
  try {
    const res = await api.get<ReturJualPrintData>(`/retur-jual-form/print/${props.nomorRetur}`);
    data.value = res.data;
  } catch (e) {
    console.error(e);
  }
  loading.value = false;
};

const formatDate = (v: string) => {
  if (!v) return "";
  try {
    return format(parseISO(v), "dd/MM/yy HH:mm");
  } catch {
    return v;
  }
};

// ======================================================================
// CSS PERSIS SAMA DENGAN InvoiceKasir (58mm)
// ======================================================================
const printCss = `
  body {
    font-family: 'Roboto Mono', monospace;
    font-size: 9pt;
    width: 58mm;
    margin: 0;
    padding: 0;
    background: white;
  }

  .receipt {
    width: 58mm;
    padding: 3mm 5mm;
    box-sizing: border-box;
    color: black;
  }

  .text-center { text-align: center; }

  .logo {
    max-width: 12mm;
    margin: 0 auto 5px;
    display: block;
  }

  .info, .items, .summary, .footer {
    border-top: 1px dashed black;
    padding-top: 5px;
    margin-top: 5px;
  }

  .item-details,
  .summary-item {
    display: flex;
    justify-content: space-between;
  }

  .grand-total {
    font-weight: bold;
  }

  @page { size: 58mm auto; margin: 0; }
`;

const printNow = async () => {
  await nextTick();

  const target = document.getElementById("retur-kasir-preview");
  if (!target) return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;

  if (!doc) {
    console.error("Gagal mengakses dokumen iframe.");
    return;
  }

  doc.open();
  doc.write(`
    <html>
      <head>
        <style>${printCss}</style>
      </head>
      <body>${target.innerHTML}</body>
    </html>
  `);
  doc.close();

  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 500);
  };
};
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="420px" persistent scrollable>
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Preview Struk Retur Kasir</span>
        <v-btn icon="mdi-close" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <v-card-text style="max-height: 75vh; overflow-y: auto">
        <div v-if="loading" class="text-center">Memuat...</div>

        <div v-else-if="data" id="retur-kasir-preview">
          <div class="receipt">
            <!-- HEADER -->
            <div class="text-center">
              <img :src="Logo" class="logo" />
              <strong>{{ data.header.gudang.nama }}</strong>
              <div>{{ data.header.gudang.alamat }}</div>
              <div>{{ data.header.gudang.telp }}</div>
            </div>

            <!-- INFO -->
            <div class="info">
              <div>No. Retur: {{ data.header.nomor }}</div>
              <div>Tgl: {{ formatDate(data.header.tanggal) }}</div>
              <div>Kasir: {{ data.header.user_create }}</div>
              <div>Customer: {{ data.header.customer.nama }}</div>
            </div>

            <!-- ITEMS -->
            <div class="items">
              <div v-for="item in data.details" :key="item.kode">
                <div>{{ item.nama }} ({{ item.ukuran }})</div>
                <div class="item-details">
                  <span>{{ item.jumlah }} x {{ formatRupiah(item.harga) }}</span>
                  <span>{{ formatRupiah(item.total) }}</span>
                </div>
              </div>
            </div>

            <!-- SUMMARY -->
            <div class="summary">
              <div class="summary-item">
                <span>Subtotal</span>
                <span>{{ formatRupiah(data.header.summary.subtotal) }}</span>
              </div>

              <div class="summary-item">
                <span>Diskon</span>
                <span>{{ formatRupiah(data.header.summary.diskon) }}</span>
              </div>

              <div class="summary-item grand-total">
                <span>TOTAL RETUR</span>
                <span>{{ formatRupiah(data.header.summary.grandTotal) }}</span>
              </div>
            </div>

            <!-- FOOTER -->
            <div class="footer text-center">
              <div>** RETUR PENJUALAN **</div>
              <div>TERIMAKASIH ATAS KUNJUNGAN ANDA</div>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" @click="printNow">Cetak</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.receipt {
  font-family: "Roboto Mono", monospace;
  width: 58mm;
}
</style>

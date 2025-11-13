<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import api from "@/services/api";

import Logo from "@/assets/logo.png";
import InstagramLogo from "@/assets/instagram.jpg";
import FacebookLogo from "@/assets/facebook.jpg";

interface PrintHeader {
  inv_nomor: string;
  created: string;
  user_create: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  gdg_inv_instagram?: string;
  gdg_inv_fb?: string;
  summary: {
    subTotal: number;
    diskon: number;
    ppn: number;
    netto: number;
    biayaKirim: number;
    dp: number;
    grandTotal: number;
    bayar: number;
    pundiAmal: number;
    kembali: number;
  };
}

interface PrintDetail {
  invd_kode: string;
  nama_barang: string;
  invd_ukuran: string;
  invd_jumlah: number;
  invd_harga: number;
  invd_harga_asli?: number;
  invd_diskon?: number;
  total: number;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

const props = defineProps<{
  nomorInvoice: string | null;
  modelValue: boolean;
}>();

const emit = defineEmits(["update:modelValue"]);

const printData = ref<PrintData | null>(null);
const isLoading = ref(false);

// ===================================================================
// CSS STRUK (100% sama dengan InvoicePrintKasirView)
// ===================================================================
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

  .promo-line {
    font-size: 8pt;
    color: #c62828;
    margin-left: 4px;
  }

  .summary-item.diskon span:last-child {
    color: #c62828;
    font-weight: bold;
  }

  .summary-item.netto span:last-child {
    color: #2e7d32;
    font-weight: bold;
  }

  .grand-total { font-weight: bold; }

  .social-media {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 5px;
    flex-wrap: wrap;
  }

  .social-item {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .social-item img {
    height: 8px;
  }

  @page {
    size: 58mm auto;
    margin: 0;
  }
`;

const fetchData = async () => {
  if (!props.nomorInvoice) return;
  isLoading.value = true;

  try {
    const res = await api.get<{ header: PrintHeader; details: PrintDetail[] }>(
      `/invoice-form/print-kasir/${props.nomorInvoice}`
    );
    printData.value = res.data;
  } catch {
    alert("Gagal memuat data struk.");
  } finally {
    isLoading.value = false;
  }
};


// ===================================================================
// FUNCTION CETAK — format 58mm melalui iframe (100% presisi)
// ===================================================================
const printReceipt = async () => {
  await nextTick();

  const receiptEl = document.getElementById("kasir-preview-area");
  if (!receiptEl) return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.right = "0";
  iframe.style.bottom = "0";

  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;

  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Struk Kasir</title>
        <style>${printCss}</style>
      </head>
      <body>
        ${receiptEl.innerHTML}
      </body>
    </html>
  `);
  doc.close();

  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 500);
  };
};

watch(
  () => props.modelValue,
  (v) => {
    if (v) fetchData();
  }
);

const formatRupiah = (angka: number) =>
  new Intl.NumberFormat("id-ID").format(Math.round(angka || 0));

const calculateTotals = (details: PrintDetail[]) => {
  let totalAsli = 0;
  let totalDiskon = 0;
  let totalNetto = 0;

  details.forEach((item) => {
    const qty = item.invd_jumlah;
    const hargaAsli = item.invd_harga_asli ?? item.invd_harga;
    const totalAsliItem = qty * hargaAsli;
    const totalItem = item.total;
    const diskon = totalAsliItem - totalItem;

    totalAsli += totalAsliItem;
    totalDiskon += diskon;
    totalNetto += totalItem;
  });

  return { totalAsli, totalDiskon, totalNetto };
};
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="420px" persistent>
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Preview Struk Kasir</span>
        <v-btn icon="mdi-close" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <v-card-text style="max-height: 75vh; overflow-y: auto;">
        <div v-if="isLoading" class="text-center">Memuat...</div>

        <div v-else-if="printData" id="kasir-preview-area">
          <div class="receipt">
            <!-- Header -->
            <div class="header text-center">
              <img :src="Logo" class="logo" />
              <strong>{{ printData.header.perush_nama }}</strong>
              <div>{{ printData.header.perush_alamat }}</div>
              <div>{{ printData.header.perush_telp }}</div>
            </div>

            <!-- Info -->
            <div class="info">
              <div>NoBon: {{ printData.header.inv_nomor }}</div>
              <div>Tgl: {{ printData.header.created }} {{ printData.header.user_create }}</div>
            </div>

            <!-- Items -->
            <div class="items">
              <div v-for="item in printData.details" :key="item.invd_kode" class="item">
                <div>{{ item.nama_barang }} ({{ item.invd_ukuran }})</div>

                <div class="item-details">
                  <span>{{ item.invd_jumlah }} x {{ formatRupiah(item.invd_harga) }}</span>
                  <span>{{ formatRupiah(item.total) }}</span>
                </div>

                <div v-if="item.invd_diskon > 0" class="promo-line">
                  (Promo -{{ formatRupiah(item.invd_diskon) }}/pcs)
                </div>
              </div>
            </div>

            <!-- Summary -->
            <div class="summary">
              <template v-if="calculateTotals(printData.details).totalDiskon > 0">
                <div class="summary-item">
                  <span>Total (Sebelum Diskon)</span>
                  <span>{{ formatRupiah(calculateTotals(printData.details).totalAsli) }}</span>
                </div>

                <div class="summary-item diskon">
                  <span>Total Diskon</span>
                  <span>-{{ formatRupiah(calculateTotals(printData.details).totalDiskon) }}</span>
                </div>

                <div class="summary-item netto">
                  <span>Netto (Setelah Diskon)</span>
                  <span>{{ formatRupiah(calculateTotals(printData.details).totalNetto) }}</span>
                </div>
              </template>

              <template v-else>
                <div class="summary-item">
                  <span>Total</span>
                  <span>{{ formatRupiah(printData.header.summary.subTotal) }}</span>
                </div>
              </template>

              <div class="summary-item">
                <span>Ppn</span>
                <span>{{ formatRupiah(printData.header.summary.ppn) }}</span>
              </div>

              <div class="summary-item">
                <span>Biaya Kirim</span>
                <span>{{ formatRupiah(printData.header.summary.biayaKirim) }}</span>
              </div>

              <div class="summary-item">
                <span>Dp</span>
                <span>{{ formatRupiah(printData.header.summary.dp) }}</span>
              </div>

              <div class="summary-item grand-total">
                <span>Grand Total</span>
                <span>{{ formatRupiah(printData.header.summary.grandTotal) }}</span>
              </div>

              <div class="summary-item">
                <span>Bayar</span>
                <span>{{ formatRupiah(printData.header.summary.bayar) }}</span>
              </div>

              <div class="summary-item">
                <span>Pundi Amal</span>
                <span>{{ formatRupiah(printData.header.summary.pundiAmal) }}</span>
              </div>

              <div class="summary-item">
                <span>Kembali</span>
                <span>{{ formatRupiah(printData.header.summary.kembali) }}</span>
              </div>
            </div>

            <!-- Footer -->
            <div class="footer text-center">
              <div>BARANG YANG SUDAH DIBELI TIDAK BISA DIKEMBALIKAN</div>
              <div>TERIMAKASIH ATAS KUNJUNGAN ANDA</div>

              <div class="social-media">
                <div class="social-item">
                  <img :src="InstagramLogo" />
                  <span>{{ printData.header.gdg_inv_instagram }}</span>
                </div>

                <div class="social-item">
                  <img :src="FacebookLogo" />
                  <span>{{ printData.header.gdg_inv_fb }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" @click="printReceipt">Cetak</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.receipt {
  font-family: 'Roboto Mono', monospace;
}
</style>

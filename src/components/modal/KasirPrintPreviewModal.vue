<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import api from "@/services/api";

import Logo from "@/assets/logo.png";
import InstagramLogo from "@/assets/instagram.jpg";
import FacebookLogo from "@/assets/facebook.jpg";
import { formatRupiah } from "@/utils/formatRupiah";

interface PrintHeader {
  inv_nomor: string;
  created: string;
  user_create: string;
  perush_nama: string;
  perush_alamat: string;
  perush_telp: string;
  gdg_inv_instagram?: string;
  gdg_inv_fb?: string;
  gdg_akun?: string;
  gdg_transferbank?: string;
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
    inv_kembali?: number;
  };
}

interface PrintDetail {
  invd_kode: string;
  nama_barang: string;
  invd_ukuran: string;
  invd_jumlah: number;

  invd_harga: number; // harga setelah diskon (per backend)
  invd_harga_asli?: number; // harga asli fallback
  invd_diskon?: number;

  harga_asli?: number;
  harga_setelah_diskon?: number;
  total_diskon?: number;

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
const maxPundi = 500;

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

  .donation-text {
    margin-top: 6px;
    margin-bottom: 6px;
    padding: 4px 0;
    text-align: center;
    font-size: 8pt;
    font-weight: bold;
    border-top: 1px dashed black;
    border-bottom: 1px dashed black;
  }

  .bank-info {
    margin-top: 5px;
    margin-bottom: 5px;
    padding: 5px 0;
    text-align: center;
    font-weight: bold;
    border-bottom: 1px dashed black;
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
    if (printData.value?.details) {
      printData.value.details = printData.value.details.map((d) => {
        const qty = Number(d.invd_jumlah ?? 0);

        const hargaAsli = Number(
          d.harga_asli ??
          (d.harga_setelah_diskon ?? d.invd_harga) + (d.invd_diskon ?? 0)
        );

        const hargaSetelah = Number(
          d.harga_setelah_diskon ?? d.invd_harga ?? hargaAsli
        );

        return {
          ...d,
          invd_harga_asli: hargaAsli,
          invd_harga: hargaSetelah,
          total: Number(d.total ?? hargaSetelah * qty),
        };
      });
    }
    if (printData.value?.header?.summary) {
      const h = printData.value.header;
      const s = h.summary;
      const details = printData.value.details;

      const fallbackSubTotal = details.reduce(
        (sum, d) =>
          sum + (Number(d.invd_harga) + Number(d.invd_diskon ?? 0)) * Number(d.invd_jumlah),
        0
      );

      const fallbackNetto = details.reduce(
        (sum, d) => sum + Number(d.invd_harga) * Number(d.invd_jumlah),
        0
      );

      const fallbackDiskon = Math.max(fallbackSubTotal - fallbackNetto, 0);

      s.subTotal = Number(s.subTotal ?? fallbackSubTotal);
      s.diskon = Number(s.diskon ?? fallbackDiskon);
      s.netto = Number(s.netto ?? (s.subTotal - s.diskon));
      s.biayaKirim = Number(s.biayaKirim ?? 0);
      s.dp = Number(s.dp ?? 0);
      s.grandTotal = Number(s.grandTotal ?? (s.netto + s.biayaKirim));
      s.bayar = Number(s.bayar ?? 0);
      s.pundiAmal = Number(s.pundiAmal ?? 0);

      s.kembali = Number(h.summary.inv_kembali ?? (s.bayar - s.grandTotal));
    }
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

// const calculateTotals = (details: PrintDetail[]) => {
//   let totalAsli = 0;
//   let totalDiskon = 0;
//   let totalNetto = 0;

//   details.forEach((item) => {
//     const qty = item.invd_jumlah;
//     const hargaAsli = item.invd_harga_asli ?? item.invd_harga;
//     const totalAsliItem = qty * hargaAsli;
//     const totalItem = item.total;
//     const diskon = totalAsliItem - totalItem;

//     totalAsli += totalAsliItem;
//     totalDiskon += diskon;
//     totalNetto += totalItem;
//   });

//   return { totalAsli, totalDiskon, totalNetto };
// };

const hitungPundiAmal = (details: PrintDetail[]) => {
  if (!details) return 0;

  let totalQty = 0;
  for (const item of details) {
    totalQty += Number(item.invd_jumlah) || 0;
  }

  return totalQty * maxPundi;
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
              <div v-for="item in printData.details" :key="item.invd_kode" class="item"
                :class="{ 'item-discounted': item.invd_diskon > 0 }">
                <div>{{ item.nama_barang }} ({{ item.invd_ukuran }})</div>

                <!-- Jika item DISKON -->
                <template v-if="item.invd_diskon > 0">
                  <div class="item-details discounted">
                    <span class="line-through">
                      {{ item.invd_jumlah }} x {{ formatRupiah(item.invd_harga + item.invd_diskon) }}
                    </span>
                    <span class="line-through">
                      {{ formatRupiah((item.invd_harga + item.invd_diskon) * item.invd_jumlah) }}
                    </span>
                  </div>

                  <div class="item-details">
                    <span>
                      {{ item.invd_jumlah }} x {{ formatRupiah(item.invd_harga) }}
                      <small class="discount-label">(Promo -{{ formatRupiah(item.invd_diskon) }}/pcs)</small>
                    </span>
                    <span>{{ formatRupiah(item.total) }}</span>
                  </div>
                </template>

                <!-- Jika item TANPA DISKON -->
                <template v-else>
                  <div class="item-details">
                    <span>{{ item.invd_jumlah }} x {{ formatRupiah(item.invd_harga) }}</span>
                    <span>{{ formatRupiah(item.total) }}</span>
                  </div>
                </template>
              </div>
            </div>

            <!-- Summary -->
            <div class="summary">

              <div class="summary-item">
                <span>Total (Sebelum Diskon)</span>
                <span>{{ formatRupiah(printData.header.summary.subTotal) }}</span>
              </div>

              <div v-if="printData.header.summary.diskon > 0" class="summary-item" style="color:#c62828;">
                <span>Total Diskon</span>
                <span>-{{ formatRupiah(printData.header.summary.diskon) }}</span>
              </div>

              <div class="summary-item">
                <span>Netto (Setelah Diskon)</span>
                <span>{{ formatRupiah(printData.header.summary.netto) }}</span>
              </div>

              <div class="summary-item">
                <span>Biaya Kirim</span>
                <span>{{ formatRupiah(printData.header.summary.biayaKirim) }}</span>
              </div>

              <div class="summary-item grand-total">
                <span>Grand Total</span>
                <span>{{ formatRupiah(printData.header.summary.grandTotal) }}</span>
              </div>

              <div class="summary-item">
                <span>Bayar</span>
                <span>{{ formatRupiah(printData.header.summary.bayar) }}</span>
              </div>

              <div v-if="printData.header.summary.pundiAmal > 0" class="summary-item">
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
              <div v-if="printData.header.gdg_transferbank || printData.header.gdg_akun" class="bank-info">
                Transfer: {{ printData.header.gdg_transferbank }}<br>
                {{ printData.header.gdg_akun }}
              </div>

              <div class="donation-text">
                Dengan membeli produk kaosan ini, Kaosan telah menyisihkan/peduli dengan sesama yg membutuhkan
                sebesar {{ formatRupiah(hitungPundiAmal(printData.details)) }}
              </div>

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

.donation-text {
  margin-top: 6px;
  margin-bottom: 6px;
  padding: 4px 0;
  text-align: center;
  font-size: 8pt;
  font-weight: bold;
  border-top: 1px dashed black;
  border-bottom: 1px dashed black;
}

/* ===============================
   RECEIPT AREA — ALWAYS PRINT MODE
   =============================== */
#kasir-preview-area {
  background-color: #ffffff;
  color: #000000;
}

.receipt {
  background-color: #ffffff;
  color: #000000;
  padding: 12px;
}

.receipt * {
  color: #000000 !important;
}
</style>

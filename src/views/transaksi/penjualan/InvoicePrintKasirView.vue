<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import Logo from '@/assets/logo.png';
import InstagramLogo from '@/assets/instagram.jpg';
import FacebookLogo from '@/assets/facebook.jpg';
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
  total: number;
  harga_setelah_diskon: number;
  harga_asli: number;
  invd_diskon: number;
  total_diskon: number;
}

interface PrintData {
  header: PrintHeader;
  details: PrintDetail[];
}

interface RawPrintDetail {
  invd_kode: string;
  nama_barang: string;
  invd_ukuran: string;
  invd_jumlah: number | string | null;
  invd_harga?: number | string | null;
  harga_asli?: number | string | null;
  harga_setelah_diskon?: number | string | null;
  invd_diskon?: number | string | null;
  total_diskon?: number | string | null;
  total?: number | string | null;
}

interface PrintApiResponse {
  header: PrintHeader;
  details: RawPrintDetail[];
}

const props = defineProps<{ nomorInvoice: string }>();

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);

const appLogo = Logo;
const igLogo = InstagramLogo;
const fbLogo = FacebookLogo;

const maxPundi = 500;

const hitungPundiAmal = (details: PrintDetail[]) => {
  if (!details) return 0;
  let qty = 0;
  details.forEach(d => qty += Number(d.invd_jumlah) || 0);
  return qty * maxPundi;
};

const fetchPrintData = async (nomor: string) => {
  const tujuanHp = (route.query.hp as string) || '';

  try {
    const response = await api.get<PrintApiResponse>(`/invoice-form/print-kasir/${nomor}`);

    const normalizedDetails: PrintDetail[] = response.data.details.map((d: RawPrintDetail) => {
      const qty = Number(d.invd_jumlah ?? 0);
      const hargaAsli = Number(d.harga_asli ?? d.invd_harga ?? 0);
      const hargaSetelah = Number(d.harga_setelah_diskon ?? hargaAsli);
      const diskonRp = Number(d.invd_diskon ?? 0);
      const totalDiskon = Number(d.total_diskon ?? 0);
      const total = Number(d.total ?? 0);

      let finalHargaSetelah = hargaSetelah;
      if (finalHargaSetelah === 0 && total > 0 && qty > 0) {
        finalHargaSetelah = Math.round(total / qty);
      }

      let finalHargaAsli = hargaAsli;
      if (finalHargaAsli === 0) {
        finalHargaAsli = finalHargaSetelah + diskonRp;
      }

      return {
        invd_kode: d.invd_kode,
        nama_barang: d.nama_barang,
        invd_ukuran: d.invd_ukuran,
        invd_jumlah: qty,
        invd_harga: finalHargaSetelah,
        harga_asli: finalHargaAsli,
        harga_setelah_diskon: finalHargaSetelah,
        invd_diskon: diskonRp,
        total_diskon: totalDiskon,
        total: total,
      };
    });

    printData.value = {
      header: response.data.header,
      details: normalizedDetails,
    };

    const h = printData.value.header;

    if (!h.summary) {
      h.summary = {
        subTotal: 0,
        diskon: 0,
        ppn: 0,
        netto: 0,
        biayaKirim: 0,
        dp: 0,
        grandTotal: 0,
        bayar: 0,
        pundiAmal: 0,
        kembali: 0
      };
    }

    const details = printData.value.details;

    const fallbackSubTotal = details.reduce(
      (sum, d) => sum + d.harga_asli * d.invd_jumlah,
      0
    );

    const fallbackDiskon = details.reduce(
      (sum, d) => sum + d.total_diskon,
      0
    );

    const s = h.summary;

    s.subTotal = Number(s.subTotal ?? fallbackSubTotal);
    s.diskon = Number(fallbackDiskon || s.diskon || 0);
    s.netto = Number(s.netto ?? (s.subTotal - s.diskon));
    s.ppn = Number(s.ppn ?? 0);
    s.biayaKirim = Number(s.biayaKirim ?? 0);
    s.dp = Number(s.dp ?? 0);
    s.grandTotal = Number(s.grandTotal ?? (s.netto + s.biayaKirim));
    s.bayar = Number(s.bayar ?? 0);
    s.pundiAmal = Number(s.pundiAmal ?? 0);
    s.kembali = Math.max(s.bayar - s.grandTotal, 0);

    document.title = response.data.header.inv_nomor || 'Struk';

    if (route.query.source === 'kasir') {
      await nextTick();
      window.print();
    } else if (route.query.source === 'whatsapp') {
      await api.post(`/whatsapp/send-receipt`, {
        nomor: props.nomorInvoice,
        hp: tujuanHp,
      });
    }
  } catch {
    alert("Gagal memuat data struk.");
  } finally {
    isLoading.value = false;
  }
};


watch(printData, async (np) => {
  if (np && route.query.source !== 'whatsapp') {
    document.body.classList.add('print-mode', 'print-kasir');
    await nextTick();
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-mode', 'print-kasir');
    }, 500);
  }
});

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) fetchPrintData(nomor);
  else {
    alert("Nomor invoice tidak ditemukan.");
    isLoading.value = false;
  }
});
</script>

<template>
  <div class="receipt">
    <div v-if="isLoading" class="text-center">Memuat data...</div>

    <div v-else-if="printData">
      <!-- Header -->
      <div class="header text-center">
        <img :src="appLogo" alt="Logo" class="logo" />
        <strong>{{ printData.header.perush_nama }}</strong>
        <div>{{ printData.header.perush_alamat }}</div>
        <div>{{ printData.header.perush_telp }}</div>
      </div>

      <!-- Info -->
      <div class="info">
        <div>NoBon: {{ printData.header.inv_nomor }}</div>
        <div>Tgl: {{ printData.header.created }} {{ printData.header.user_create }}</div>
      </div>

      <!-- ITEMS -->
      <div class="items">
        <div v-for="item in printData.details" :key="item.invd_kode" class="item">
          <div>{{ item.nama_barang }} ({{ item.invd_ukuran }})</div>

          <!-- Jika ada diskon -->
          <template v-if="item.invd_diskon > 0">
            <!-- Harga asli dicoret -->
            <div class="item-details discounted">
              <span class="line-through">
                {{ item.invd_jumlah }} x {{ formatRupiah(item.harga_asli) }}
              </span>
              <span class="line-through">
                {{ formatRupiah(item.harga_asli * item.invd_jumlah) }}
              </span>
            </div>

            <!-- Harga sesudah diskon -->
            <div class="item-details">
              <span>
                {{ item.invd_jumlah }} x {{ formatRupiah(item.harga_asli) }}
                <small class="discount-label">
                  (Promo -{{ formatRupiah(item.invd_diskon) }}/pcs)
                </small>
              </span>
              <span>{{ formatRupiah(item.total) }}</span>
            </div>
          </template>

          <!-- Jika tidak diskon -->
          <template v-else>
            <div class="item-details">
              <span>
                {{ item.invd_jumlah }} x {{ formatRupiah(item.harga_setelah_diskon) }}
              </span>
              <span>{{ formatRupiah(item.total) }}</span>
            </div>
          </template>
        </div>
      </div>

      <!-- SUMMARY -->
      <div class="summary" v-if="printData.details.length">
        <div class="summary-item">
          <span>Total</span>
          <span>{{ formatRupiah(printData.header.summary.subTotal) }}</span>
        </div>

        <div v-if="printData.header.summary.diskon > 0" class="summary-item diskon">
          <span>Diskon</span>
          <span>-{{ formatRupiah(printData.header.summary.diskon) }}</span>
        </div>

        <div class="summary-item"><span>Ppn</span><span>{{ formatRupiah(printData.header.summary.ppn) }}</span></div>
        <div class="summary-item"><span>Biaya Kirim</span><span>{{ formatRupiah(printData.header.summary.biayaKirim)
            }}</span>
        </div>
        <div class="summary-item"><span>Dp</span><span>{{ formatRupiah(printData.header.summary.dp) }}</span></div>

        <div class="summary-item grand-total">
          <span>Grand Total</span>
          <span>{{ formatRupiah(printData.header.summary.grandTotal) }}</span>
        </div>

        <div class="summary-item"><span>Bayar</span><span>{{ formatRupiah(printData.header.summary.bayar) }}</span>
        </div>
        <div class="summary-item"><span>Pundi Amal</span><span>{{ formatRupiah(printData.header.summary.pundiAmal)
            }}</span>
        </div>
        <div class="summary-item"><span>Kembali</span><span>{{ formatRupiah(printData.header.summary.kembali) }}</span>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="footer text-center">
        <div class="donation-text">
          Dengan membeli produk kaosan ini, Kaosan telah peduli kepada sesama sebesar
          {{ formatRupiah(hitungPundiAmal(printData.details)) }}
        </div>

        <div>BARANG YANG SUDAH DIBELI</div>
        <div>TIDAK BISA DIKEMBALIKAN</div>
        <div>TERIMA KASIH ATAS KUNJUNGAN ANDA</div>

        <div class="social-media">
          <div class="social-item">
            <img :src="igLogo" alt="Instagram" />
            <span>{{ printData.header.gdg_inv_instagram }}</span>
          </div>
          <div class="social-item">
            <img :src="fbLogo" alt="Facebook" />
            <span>{{ printData.header.gdg_inv_fb }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.receipt {
  width: 58mm;
  padding: 3mm 5mm;
  font-family: 'Roboto Mono', monospace;
  font-size: 9pt;
  color: black;
}

.logo {
  max-width: 12mm;
  margin: 0 auto 5px;
  display: block;
}

.info,
.items,
.summary,
.footer {
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
  color: #c62828;
  font-size: 8pt;
  margin-left: 4px;
}

.summary-item.diskon span:last-child {
  color: #c62828;
}

.summary-item.netto span:last-child {
  color: #2e7d32;
  font-weight: bold;
}

.item-details.discounted {
  color: #777;
  font-size: 8pt;
}

.line-through {
  text-decoration: line-through;
  color: #888;
}

.discount-label {
  color: #c62828;
  font-weight: bold;
  font-size: 8pt;
  margin-left: 3px;
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

.grand-total {
  font-weight: bold;
}

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
</style>

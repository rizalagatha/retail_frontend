<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';

const route = useRoute();
const printData = ref<any>(null);
const isLoading = ref(true);
const appLogo = Logo;

const formatRupiah = (angka: number) => new Intl.NumberFormat('id-ID').format(Math.round(angka || 0));

const fetchPrintData = async (nomor: string) => {
    try {
        const response = await api.get(`/invoice-form/print/${nomor}`);
        printData.value = response.data;
        document.title = response.data.header?.inv_nomor || 'Invoice';
        await nextTick();
        window.print();
    } catch (error) {
        alert("Gagal memuat data untuk dicetak.", error);
    } finally {
        isLoading.value = false;
    }
};

onMounted(() => {
    const nomor = route.params.nomor as string;
    if (nomor) fetchPrintData(nomor);
});
</script>

<template>
    <div class="print-container">
        <div v-if="isLoading" class="text-center">Memuat data...</div>
        <div v-if="printData" class="page">
            <div class="header">
                <img :src="appLogo" alt="Logo" class="logo" />
                <div class="company-info">
                    <strong>{{ printData.header.perush_nama }}</strong>
                    <div>{{ printData.header.perush_alamat }}</div>
                    <div>{{ printData.header.perush_telp }}</div>
                </div>
            </div>
            <div class="title">INVOICE</div>

            <div class="info-grid">
                <div class="info-left">
                    <div><span class="label">Nomor</span>: {{ printData.header.inv_nomor }}</div>
                    <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.inv_tanggal),
                        'dd-MM-yyyy') }}</div>
                    <div><span class="label">No. Pesanan</span>: {{ printData.header.inv_nomor_so }}</div>
                </div>
                <div class="info-right">
                    <div><span class="label">Customer</span>: {{ printData.header.cus_nama }}</div>
                    <div class="alamat"><span class="label"></span> {{ printData.header.cus_alamat }}</div>
                    <div><span class="label">Top</span>: {{ printData.header.inv_top }} Hari</div>
                    <div><span class="label">Jatuh Tempo</span>: {{ format(parseISO(printData.header.tempo),
                        'dd-MM-yyyy') }}</div>
                </div>
            </div>

            <div class="items-table">
                <table>
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Kode</th>
                            <th>Nama Barang</th>
                            <th>Ukuran</th>
                            <th>Qty</th>
                            <th class="text-end">Harga</th>
                            <th class="text-end">Diskon</th>
                            <th class="text-end">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(item, index) in printData.details" :key="index">
                            <td class="text-center">{{ index + 1 }}</td>
                            <td>{{ item.invd_kode }}</td>
                            <td>{{ item.nama_barang }}</td>
                            <td class="text-center">{{ item.invd_ukuran }}</td>
                            <td class="text-center">{{ item.invd_jumlah }}</td>
                            <td class="text-end">{{ formatRupiah(item.invd_harga) }}</td>
                            <td class="text-end">{{ formatRupiah(item.invd_diskon) }}</td>
                            <td class="text-end">{{ formatRupiah(item.total) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="terbilang-section">
                <strong>Terbilang:</strong>
                <em>{{ printData.header.terbilang }}</em>
            </div>

            <div class="footer-grid">
                <div class="signatures">
                    <div>Sales Counter,</div>
                    <div>Mengetahui,</div>
                    <div>Customer,</div>
                    <div class="names">
                        <span>( {{ printData.header.inv_sc }} )</span>
                        <span>( .................... )</span>
                        <span>( .................... )</span>
                    </div>
                </div>
                <div class="summary">
                    <div class="summary-item"><span>Total :</span><span>{{
                        formatRupiah(printData.header.summary.subTotal) }}</span></div>
                    <div class="summary-item"><span>Diskon :</span><span>{{
                        formatRupiah(printData.header.summary.diskon) }}</span></div>
                    <div class="summary-item"><span>Netto :</span><span>{{ formatRupiah(printData.header.summary.netto)
                            }}</span></div>
                    <div class="summary-item"><span>Biaya Kirim :</span><span>{{
                        formatRupiah(printData.header.summary.biayaKirim) }}</span></div>
                    <div class="summary-item"><span>DP :</span><span>{{ formatRupiah(printData.header.summary.dp)
                            }}</span></div>
                    <div class="summary-item grand-total"><span>Grand Total :</span><span>{{
                        formatRupiah(printData.header.summary.grandTotal) }}</span></div>
                    <div class="summary-item"><span>Bayar :</span><span>{{ formatRupiah(printData.header.summary.bayar)
                            }}</span></div>
                    <div class="summary-item"><span>Pundi amal :</span><span>{{
                        formatRupiah(printData.header.summary.pundiAmal) }}</span></div>
                    <div class="summary-item"><span>Kembali :</span><span>{{
                        formatRupiah(printData.header.summary.kembali) }}</span></div>
                </div>
            </div>
            <div class="note">Note: Barang yg sudah dibeli tidak bisa dikembalikan. Terimakasih atas kunjungan anda.
            </div>
        </div>
    </div>
</template>

<style scoped>
/* (Style dari MutasiOutPrintView.vue yang disesuaikan) */
.page {
    font-family: 'Arial', sans-serif;
    font-size: 9pt;
}

.logo {
    height: 40px;
}

.title {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 10px 0;
}

.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 15px;
    margin-bottom: 10px;
}

.info-grid .label {
    display: inline-block;
    width: 80px;
}

.info-grid .alamat {
    padding-left: 80px;
}

.items-table table {
    width: 100%;
    border-collapse: collapse;
}

th,
td {
    border: 1px solid black;
    padding: 3px 5px;
}

.text-end {
    text-align: right;
}

.text-center {
    text-align: center;
}

.terbilang-section {
    margin: 10px 0;
    font-style: italic;
}

.footer-grid {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    margin-top: 10px;
    gap: 20px;
}

.signatures {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    text-align: center;
}

.signatures .names {
    grid-column: 1 / -1;
    margin-top: 40px;
}

.summary .summary-item {
    display: flex;
    justify-content: space-between;
}

.summary .grand-total {
    font-weight: bold;
    border-top: 1px solid black;
    padding-top: 5px;
}

.note {
    font-size: 8pt;
    margin-top: 15px;
    border-top: 1px solid black;
    padding-top: 5px;
}

@media print {
  /* Atur ukuran kertas dan margin cetak */
  @page {
    size: A4;
    margin: 1cm;
  }

  /* Sembunyikan semua elemen di halaman KECUALI kontainer cetak */
  body * {
    visibility: hidden;
  }
  .print-container, .print-container * {
    visibility: visible;
  }

  /* Posisikan kontainer cetak agar mengisi seluruh halaman */
  .print-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }

  /* Hilangkan border dan shadow dari 'page' saat dicetak */
  .page {
    border: none;
    box-shadow: none;
    margin: 0;
    padding: 0;
  }

  /* Pastikan warna latar belakang (spt di header tabel) ikut tercetak */
  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
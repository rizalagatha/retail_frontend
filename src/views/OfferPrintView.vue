<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';
import InstagramLogo from '@/assets/instagram.jpg'; // Impor logo Instagram

const route = useRoute();
const printData = ref<any>(null);
const isLoading = ref(true);
const appLogo = Logo;
const igLogo = InstagramLogo;

// Fungsi untuk mengubah angka menjadi teks terbilang
function terbilang(n: number) {
    if (n === null || n === undefined || n === 0) return "Nol";
    if (n < 0) return "minus " + terbilang(-n);
    const ang = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
    if (n < 12) return ang[n];
    if (n < 20) return terbilang(n - 10) + " belas";
    if (n < 100) return terbilang(Math.floor(n / 10)) + " puluh " + terbilang(n % 10).trim();
    if (n < 200) return "seratus " + terbilang(n - 100);
    if (n < 1000) return terbilang(Math.floor(n / 100)) + " ratus " + terbilang(n % 100);
    if (n < 2000) return "seribu " + terbilang(n - 1000);
    if (n < 1000000) return terbilang(Math.floor(n / 1000)) + " ribu " + terbilang(n % 1000);
    if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + " juta " + terbilang(n % 1000000);
    return "angka terlalu besar";
}
const formatRupiah = (angka: number) => new Intl.NumberFormat('id-ID').format(angka || 0);
const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/\s+/g, ' ') : '').trim();

const fetchPrintData = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/offer-form/print-data/${nomor}`);
        printData.value = response.data;
        if (printData.value.header?.pen_nomor) { 
            document.title = printData.value.header.pen_nomor;
        }
        await nextTick();
        window.print();
    } catch (error) {
        console.error("Gagal memuat data cetak:", error);
        alert("Gagal memuat data untuk dicetak.");
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
            <div class="company-header">
                <div class="company-info">
                    <div class="company-name">
                        <img :src="igLogo" class="icon-ig"> KAOSAN.OFFICIAL
                    </div>
                    <div>{{ printData.header.gdg_inv_alamat }}</div>
                    <div>{{ printData.header.gdg_inv_kota }}</div>
                    <div>{{ printData.header.gdg_inv_telp }}</div>
                </div>
                <img :src="appLogo" alt="Logo Perusahaan" class="company-logo-right">
            </div>

            <div class="document-title">PENAWARAN</div>

            <div class="header-details">
                <div class="left-section">
                    <div><span class="label">Nomor:</span> {{ printData.header.pen_nomor }}</div>
                    <div><span class="label">Tanggal:</span> {{ format(parseISO(printData.header.pen_tanggal),
                        'dd-MM-yyyy') }}</div>
                </div>
                <div class="right-section">
                    <div><span class="label">Customer:</span> {{ printData.header.cus_nama }}</div>
                    <div class="address-line">{{ printData.header.cus_alamat }}</div>
                    <div><span class="label">Telp:</span> {{ printData.header.cus_telp }}</div>
                </div>
            </div>

            <div class="items-table">
                <table>
                    <thead>
                        <tr>
                            <th class="no">No</th>
                            <th class="nama">Nama Barang</th>
                            <th class="ukuran">Ukuran</th>
                            <th class="qty">Qty</th>
                            <th class="harga">Harga</th>
                            <th class="diskon">Diskon</th>
                            <th class="total">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(item, index) in printData.details" :key="index">
                            <td class="no">{{ index + 1 }}</td>
                            <td class="nama">{{ item.nama_barang }}</td>
                            <td class="ukuran">{{ item.ukuran }}</td>
                            <td class="qty">{{ item.qty }}</td>
                            <td class="harga">{{ formatRupiah(item.harga) }}</td>
                            <td class="diskon">{{ formatRupiah(item.diskon) }}</td>
                            <td class="total">{{ formatRupiah(item.total) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="summary-section">
                <div class="terbilang-section">
                    <strong>Terbilang:</strong>
                    <em>{{ capitalize(terbilang(printData.header.grand_total)) }} Rupiah</em>
                </div>
                <div class="totals-table">
                    <table>
                        <tbody>
                            <tr>
                                <td>Total</td>
                                <td>{{ formatRupiah(printData.header.total) }}</td>
                            </tr>
                            <tr>
                                <td>Diskon</td>
                                <td>{{ formatRupiah(printData.header.diskon) }}</td>
                            </tr>
                            <tr>
                                <td>PPN</td>
                                <td>{{ formatRupiah(printData.header.ppn) }}</td>
                            </tr>
                            <tr>
                                <td>Biaya Kirim</td>
                                <td>{{ formatRupiah(printData.header.biaya_kirim) }}</td>
                            </tr>
                            <tr class="grand-total">
                                <td>Grand Total</td>
                                <td>{{ formatRupiah(printData.header.grand_total) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="footer-signatures">
                <div class="signature-column">Dibuat Oleh,</div>
                <div class="signature-column">Mengetahui,</div>
            </div>
            <div class="footer-names">
                <div class="name-column">( {{ printData.header.user_create }} )</div>
                <div class="name-column">( ......................... )</div>
            </div>
            <div class="note-section">
                Note: {{ printData.header.pen_ket }}
            </div>
        </div>
    </div>
</template>

<style scoped>
@media print {
    @page {
        size: A4;
        margin: 1cm;
    }

    body * {
        visibility: hidden;
    }

    .print-container,
    .print-container * {
        visibility: visible;
    }

    .print-container {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
    }
}

.page {
    font-family: 'Arial', sans-serif;
    font-size: 10pt;
    background: white;
    padding: 1.5cm;
    margin: 20px auto;
    width: 21cm;
    min-height: 29.7cm;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
}

.company-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 10px;
    border-bottom: 1px solid #333;
}

.company-info {
    font-size: 9pt;
    line-height: 1.4;
}

.company-name {
    font-weight: bold;
    font-size: 14pt;
    margin-bottom: 3px;
    display: flex;
    align-items: center;
}

.icon-ig {
    width: 16px;
    height: 16px;
    margin-right: 8px;
}

.company-logo-right {
    width: 80px;
    height: auto;
}

.document-title {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    margin: 20px 0;
    text-decoration: underline;
}

.header-details {
    display: flex;
    justify-content: space-between;
    margin-bottom: 15px;
    font-size: 9pt;
    line-height: 1.5;
}

.left-section,
.right-section {
    width: 48%;
}

.header-details .label {
    font-weight: bold;
    display: inline-block;
    width: 60px;
}

.address-line {
    padding-left: 60px;
    white-space: pre-line;
}

.items-table {
    margin-bottom: 10px;
}

.items-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
}

.items-table th,
.items-table td {
    border: 1px solid #ccc;
    padding: 5px;
}

.items-table th {
    background-color: #f2f2f2;
    font-weight: bold;
    text-align: center;
}

.no {
    width: 5%;
    text-align: center;
}

.nama {
    width: 45%;
}

.qty {
    width: 8%;
    text-align: center;
}

.harga,
.diskon,
.total {
    width: 14%;
    text-align: right;
}

.summary-section {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-top: 10px;
}

.terbilang-section {
    font-size: 9pt;
    width: 60%;
}

.totals-table {
    width: 35%;
    font-size: 9pt;
}

.totals-table table {
    width: 100%;
}

.totals-table td {
    padding: 3px 8px;
}

.totals-table td:last-child {
    text-align: right;
}

.grand-total td {
    font-weight: bold;
    border-top: 1px solid #333;
    padding-top: 5px;
}

.footer-signatures,
.footer-names {
    display: flex;
    justify-content: space-between;
    text-align: center;
    margin-top: 10px;
    width: 60%;
}

.footer-signatures {
    margin-top: 30px;
}

.footer-names {
    height: 30px;
    vertical-align: bottom;
}

.signature-column,
.name-column {
    flex: 1;
}
</style>

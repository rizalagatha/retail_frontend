<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';

const route = useRoute();

interface PrintData {
  gdg_inv_alamat: string;
  gdg_inv_telp: string;
  sh_nomor: string;
  sh_tanggal: string;
  cus_nama: string;
  cus_alamat: string;
  cus_telp: string;
  sh_nominal: number;
  terbilang: string;
  sh_ket: string;
  jenis_pembayaran: string;
  nama_akun?: string;
  no_rekening?: string;
  tgl_transfer?: string;
  sh_so_nomor: string;
}

const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;

const formatRupiah = (angka: number) => new Intl.NumberFormat('id-ID').format(angka || 0);

const fetchPrintData = async (nomor: string) => {
    try {
        const response = await api.get(`/so-form/print-data/dp/${nomor}`);
        printData.value = response.data;
        await nextTick();
        window.print();
    } catch (error) {
        alert("Gagal memuat data untuk dicetak.");
        console.error("Error fetching DP print data:", error);
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
            <div class="receipt-copy" v-for="copy in 2" :key="copy">
                <div class="company-header">
                    <img :src="appLogo" alt="Logo" class="company-logo">
                    <div class="company-info">
                        <div class="company-name">KAOSAN.OFFICIAL</div>
                        <div>{{ printData.gdg_inv_alamat }}</div>
                        <div>{{ printData.gdg_inv_telp }}</div>
                    </div>
                </div>
                <div class="document-title">CASH RECEIPT</div>
                <div class="details-grid">
                    <div class="label">Nomor Dokumen</div>
                    <div class="value">: {{ printData.sh_nomor }}</div>
                    <div class="label">Tanggal Dokumen</div>
                    <div class="value">: {{ format(parseISO(printData.sh_tanggal), 'dd-MM-yyyy') }}</div>
                    <div class="label">Nama Customer</div>
                    <div class="value">: {{ printData.cus_nama }}</div>
                    <div class="label">Alamat</div>
                    <div class="value address-value">: {{ printData.cus_alamat }}</div>
                    <div class="label">No. Kontak</div>
                    <div class="value">: {{ printData.cus_telp }}</div>
                    <div class="label">Nominal yang Diterima</div>
                    <div class="value">: Rp {{ formatRupiah(printData.sh_nominal) }}</div>
                    <div class="label">Terbilang</div>
                    <div class="value terbilang-value">: <em>{{ printData.terbilang }}</em></div>
                    <div class="label">Keterangan</div>
                    <div class="value">: {{ printData.sh_ket }}</div>
                </div>
                <div class="details-grid-right" v-if="printData.jenis_pembayaran === 'TRANSFER'">
                    <div class="label">Akun</div>
                    <div class="value">: {{ printData.nama_akun }}</div>
                    <div class="label">No. Rekening</div>
                    <div class="value">: {{ printData.no_rekening }}</div>
                    <div class="label">Tgl. Transfer</div>
                    <div class="value">: {{ printData.tgl_transfer }}</div>
                </div>
                <div class="items-table">
                    <table>
                        <thead>
                            <tr>
                                <th>No.</th>
                                <th>No. Sales Order</th>
                                <th>No. Invoice</th>
                                <th>Nominal</th>
                                <th>Keterangan</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="text-align: center;">1</td>
                                <td>{{ printData.sh_so_nomor }}</td>
                                <td>-</td>
                                <td class="text-end">{{ formatRupiah(printData.sh_nominal) }}</td>
                                <td>{{ printData.sh_ket }}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" class="text-end grand-total">Grand Total</td>
                                <td class="text-end grand-total">{{ formatRupiah(printData.sh_nominal) }}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div class="signatures">
                    <div class="signature-box">Yang Menyerahkan,<br><br><br>(____________________)</div>
                    <div class="signature-box">Penerima,<br><br><br>(____________________)</div>
                </div>
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
    /* <-- FONT MODERN */
    font-size: 10pt;
    background: white;
    padding: 1.5cm;
    margin: 20px auto;
    width: 21cm;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
}

.receipt-copy {
    border-bottom: 2px dashed #ccc;
    padding-bottom: 1.5cm;
    margin-bottom: 1.5cm;
    position: relative;
    /* Diperlukan untuk details-grid-right */
}

.receipt-copy:last-child {
    border-bottom: none;
    margin-bottom: 0;
}

.company-header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 10px;
}

.company-logo {
    height: 40px;
    width: auto;
}

.company-name {
    font-weight: bold;
    font-size: 12pt;
}

.company-info {
    line-height: 1.4;
}

.document-title {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    margin: 15px 0;
    border-top: 1px solid #333;
    border-bottom: 1px solid #333;
    padding: 5px 0;
}

.details-grid {
    display: grid;
    grid-template-columns: 150px auto;
    /* Lebar label, sisa untuk value */
    row-gap: 4px;
    /* Spasi rapat */
    line-height: 1.5;
}

.details-grid-right {
    position: absolute;
    top: 70px;
    /* Sesuaikan posisi vertikal */
    right: 0;
    display: grid;
    grid-template-columns: 80px auto;
    font-size: 9pt;
}

.label {
    font-weight: bold;
}

.address-value {
    white-space: pre-line;
}

.terbilang-value {
    font-style: italic;
}

.items-table {
    margin-top: 20px;
}

.items-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
}

.items-table th,
.items-table td {
    border: 1px solid #333;
    padding: 5px 8px;
}

.items-table th {
    text-align: center;
    background-color: #f2f2f2;
}

.text-end {
    text-align: right;
}

.grand-total {
    font-weight: bold;
}

.signatures {
    display: flex;
    justify-content: space-between;
    margin-top: 30px;
}

.signature-box {
    width: 45%;
    text-align: center;
    padding-top: 50px;
    /* Ruang untuk tanda tangan */
    border-top: 1px solid #333;
}
</style>

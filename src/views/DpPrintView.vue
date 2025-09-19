<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';

const route = useRoute();
const printData = ref<any>(null);
const isLoading = ref(true);
const appLogo = Logo;

// Computed property untuk menentukan judul dokumen secara dinamis
const documentTitle = computed(() => {
    if (!printData.value) return '';
    switch (printData.value.header.sh_jenis) {
        case 0: return 'CASH RECEIPT';
        case 1: return 'TRANSFER RECEIPT';
        case 2: return 'GIRO RECEIPT';
        default: return 'TANDA TERIMA PEMBAYARAN';
    }
});

const formatRupiah = (angka: number) => new Intl.NumberFormat('id-ID').format(angka || 0);

const fetchPrintData = async (nomor: string) => {
    try {
        let apiUrl = '';
        if (route.name === 'CetakSetoranBayar') {
            apiUrl = `/setoran-bayar-form/print/${nomor}`;
        } else {
            apiUrl = `/so-form/print-data/dp/${nomor}`;
        }

        const response = await api.get(apiUrl);
        printData.value = response.data;

        document.title = printData.value?.header?.sh_nomor || 'Dokumen';
        await nextTick();
        window.print();
    } catch (error) {
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
        <div v-if="printData && printData.header" class="page">
            <div class="receipt-copy" v-for="copy in 2" :key="copy">
                <div class="company-header">
                    <img :src="appLogo" alt="Logo" class="company-logo">
                    <div class="company-info">
                        <div class="company-name">{{ printData.header.perush_nama }}</div>
                        <div>{{ printData.header.perush_alamat }}</div>
                        <div>Wa: {{ printData.header.perush_telp }}</div>
                    </div>
                </div>

                <div class="document-title">{{ documentTitle }}</div>

                <div class="details-container">
                    <div class="details-grid">
                        <div class="label">Nomor Dokumen</div>
                        <div class="value">: {{ printData.header.sh_nomor }}</div>
                        <div class="label">Tanggal Dokumen</div>
                        <div class="value">: {{ format(parseISO(printData.header.sh_tanggal), 'dd-MM-yyyy') }}</div>
                        <div class="label">Nama Customer</div>
                        <div class="value">: {{ printData.header.cus_nama }}</div>
                        <div class="label">Alamat</div>
                        <div class="value address-value">: {{ printData.header.cus_alamat }}, {{
                            printData.header.cus_kota }}</div>
                        <div class="label">No. Kontak</div>
                        <div class="value">: {{ printData.header.cus_telp }}</div>
                        <div class="label">Nominal yang Diterima</div>
                        <div class="value">: Rp {{ formatRupiah(printData.header.sh_nominal) }}</div>
                        <div class="label">Terbilang</div>
                        <div class="value terbilang-value">: <em>{{ printData.header.terbilang }}</em></div>
                    </div>
                    <div v-if="printData.header.sh_jenis === 1" class="details-grid-right">
                        <div class="label">Akun</div>
                        <div class="value">: {{ printData.header.rek_nama }}</div>
                        <div class="label">No. Rekening</div>
                        <div class="value">: {{ printData.header.sh_norek }}</div>
                        <div class="label">Tgl. Transfer</div>
                        <div class="value">: {{ printData.header.sh_tgltransfer ?
                            format(parseISO(printData.header.sh_tgltransfer), 'dd-MM-yyyy') : '' }}</div>
                    </div>
                </div>

                <div class="items-table">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 5%;">No.</th>
                                <th style="width: 25%;">No. Sales Order</th>
                                <th style="width: 25%;">No. Invoice</th>
                                <th class="text-end" style="width: 20%;">Nominal</th>
                                <th style="width: 25%;">Keterangan</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(item, index) in printData.details" :key="index">
                                <td style="text-align: center;">{{ index + 1 }}</td>
                                <td>{{ item.so }}</td>
                                <td>{{ item.sd_inv }}</td>
                                <td class="text-end">{{ formatRupiah(item.sd_bayar) }}</td>
                                <td>{{ item.sd_ket }}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" class="keterangan-header">
                                    <strong>Keterangan:</strong> {{ printData.header.sh_ket }}
                                </td>
                                <td class="text-end grand-total">Grand Total</td>
                                <td class="text-end grand-total">{{ formatRupiah(printData.header.sh_nominal) }}</td>
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
/* (Style dari DpPrintView.vue yang disempurnakan) */
.page {
    font-family: 'Arial', sans-serif;
    font-size: 10pt;
    background: white;
    padding: 1cm;
    margin: 20px auto;
    width: 21cm;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
}

.receipt-copy {
    border-bottom: 2px dashed #ccc;
    padding-bottom: 1cm;
    margin-bottom: 1cm;
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
    margin: 10px 0;
    border-top: 1px solid #333;
    border-bottom: 1px solid #333;
    padding: 5px 0;
}

.details-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.details-grid {
    display: grid;
    grid-template-columns: 160px auto;
    row-gap: 4px;
    line-height: 1.5;
    flex-grow: 1;
}

.details-grid-right {
    display: grid;
    grid-template-columns: 80px auto;
    font-size: 9pt;
    flex-shrink: 0;
}

.label {
    font-weight: bold;
}

.address-value,
.terbilang-value {
    font-style: italic;
}

.items-table {
    margin-top: 15px;
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
    justify-content: space-around;
    margin-top: 20px;
}

.signature-box {
    width: 40%;
    text-align: center;
    padding-top: 10px;
}

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

    .page {
        box-shadow: none;
        margin: 0;
        padding: 0;
    }
}

.keterangan-header {
    text-align: left;
    vertical-align: top;
    font-weight: bold;
    padding: 5px 8px;
}
</style>
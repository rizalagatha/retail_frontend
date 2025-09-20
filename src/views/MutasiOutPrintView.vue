<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import Logo from '@/assets/logo.png';

interface PrintHeader {
    mo_nomor: string;
    mo_so_nomor: string;
    mo_tanggal: string;
    mo_kecab: string;
    pab_nama: string;
    mo_ket: string;
    perush_nama: string;
    perush_alamat: string;
    perush_telp: string;
    created?: string;
    user_create?: string;
}

interface PrintItem {
    mod_kode: string;
    nama: string;
    mod_ukuran: string;
    mod_jumlah: number;
}

interface PrintData {
    header: PrintHeader;
    details: PrintItem[];
}

const route = useRoute();
const printData = ref<PrintData | null>(null);
const isLoading = ref(true);
const appLogo = Logo;

const fetchPrintData = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/mutasi-out-form/print/${nomor}`);
        printData.value = response.data;
        if (printData.value.header?.mo_nomor) { 
            document.title = printData.value.header.mo_nomor;
        }
        await nextTick();
        window.print();
    } catch (error) {
        alert("Gagal memuat data untuk dicetak.");
        console.error("Error fetching print data:", error);
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
                    <div>Telp. {{ printData.header.perush_telp }}</div>
                </div>
            </div>

            <div class="title">Mutasi Out</div>

            <div class="info-grid">
                <div><span class="label">Nomor</span>: {{ printData.header.mo_nomor }}</div>
                <div><span class="label">No. SO</span>: {{ printData.header.mo_so_nomor }}</div>
                <div><span class="label">Tanggal</span>: {{ format(parseISO(printData.header.mo_tanggal), 'dd-MM-yyyy')
                    }}</div>
                <div><span class="label">Ke Cabang</span>: {{ printData.header.mo_kecab }} - {{
                    printData.header.pab_nama }}</div>
                <div class="keterangan"><span class="label">Keterangan</span>: {{ printData.header.mo_ket }}</div>
            </div>

            <div class="items-table">
                <table>
                    <thead>
                        <tr>
                            <th class="no">No</th>
                            <th class="kode">Kode</th>
                            <th class="nama">Nama</th>
                            <th class="ukuran">Ukuran</th>
                            <th class="qty">Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(item, index) in printData.details" :key="index">
                            <td class="no">{{ index + 1 }}</td>
                            <td class="kode">{{ item.mod_kode }}</td>
                            <td class="nama">{{ item.nama }}</td>
                            <td class="ukuran">{{ item.mod_ukuran }}</td>
                            <td class="qty">{{ item.mod_jumlah }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="created-date">
                Created: {{ printData.header.created }}
            </div>

            <div class="footer">
                <div class="signatures">
                    <div>Admin,</div>
                    <div>Mengetahui,</div>
                    <div>Diterima,</div>
                </div>
                <div class="names">
                    <div>( {{ printData.header.user_create }} )</div>
                    <div>( .................... )</div>
                    <div>( .................... )</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Pengaturan dasar */
.print-container {
    font-family: 'Segoe UI', Tahoma, sans-serif;
    font-size: 9pt;
}

.page {
    border: 1px solid #ccc;
    padding: 15mm;
    min-height: 120mm;
}

/* Header & Judul */
.header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
}

.logo {
    height: 35px;
    margin-right: 15px;
}

.company-info {
    font-size: 8.5pt;
}

.title {
    text-align: left;
    font-size: 14pt;
    font-weight: bold;
    margin-bottom: 8px;
}

/* Info Grid */
.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 15px;
    margin-bottom: 8px;
    font-size: 8.5pt;
}

.info-grid .label {
    display: inline-block;
    width: 80px;
}

.info-grid .keterangan {
    grid-column: 1 / -1;
}

/* Tabel Item */
.items-table {
    margin-top: 10px;
    width: 100%;
}

.items-table table {
    width: 100%;
    border-collapse: collapse;
}

.items-table th,
.items-table td {
    border: 1px solid black;
    padding: 4px 6px;
}

.items-table thead th {
    font-weight: bold;
    text-align: center;
    background-color: #f0f0f0;
}

.items-table .no {
    width: 5%;
    text-align: center;
}

.items-table .kode {
    width: 20%;
}

.items-table .nama {
    width: 50%;
}

.items-table .ukuran {
    width: 10%;
    text-align: center;
}

.items-table .qty {
    width: 15%;
    text-align: right;
}

/* PERBAIKAN CSS UNTUK CREATED DATE DAN FOOTER */
.created-date {
    text-align: right;
    font-size: 8pt;
    margin-top: 5px;
}

.footer {
    padding-top: 10px;
    font-size: 8.5pt;
}

.signatures {
    display: flex;
    justify-content: space-between;
    text-align: center;
}

.signatures>div {
    width: 30%;
}

.names {
    display: flex;
    justify-content: space-between;
    text-align: center;
    margin-top: 45px;
}

.names>div {
    width: 30%;
}


/* PERBAIKAN CSS UNTUK MENGATASI TABEL TERPOTONG SAAT PRINT */
@media print {
    @page {
        size: A4;
        margin: 10mm;
        /* Atur margin halaman cetak */
    }

    body,
    .print-container {
        font-size: 8.5pt;
        /* Sedikit kecilkan font agar semua muat */
    }

    .page {
        border: none;
        box-shadow: none;
        margin: 0;
        padding: 0;
    }
}
</style>
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
const BASE_IMAGE_URL = import.meta.env.VITE_API_BASE_URL || '';

const imageFullUrl = computed(() => {
    if (!printData.value?.imageUrl) return null;
    return BASE_IMAGE_URL + printData.value.imageUrl;
});

// Fungsi ini meniru IIF di FastReport dan menambahkan "(Sticker)"
const getSoTitle = (joKode: string) => {
    let title = 'SO STICKER'; // Default title
    if (joKode === 'SD') {
        title = 'SO DTF';
    } else if (joKode === 'DP') {
        title = 'SO DTF PREMIUM';
    }
    return `${title} (Sticker)`;
};

const fetchPrintData = async (nomor: string) => {
    isLoading.value = true;
    try {
        const response = await api.get(`/so-dtf-stok-form/print-data/${nomor}`);
        printData.value = response.data;
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
    if (nomor) {
        fetchPrintData(nomor);
    }
});
</script>

<template>
    <div class="print-container">
        <div v-if="isLoading" class="text-center">Memuat data...</div>
        <div v-if="printData" class="page">
            <div class="page-header">
                <img :src="appLogo" alt="Logo" class="logo">
                <span class="main-title">{{ getSoTitle(printData.sd_jo_kode) }}</span>
            </div>

            <div class="master-data">
                <div class="data-grid">
                    <div class="label">No. SO DTF</div>
                    <div class="value">: {{ printData.sd_nomor }}</div>
                    <div class="label">Tanggal</div>
                    <div class="value">: {{ format(parseISO(printData.sd_tanggal), 'dd/MM/yyyy') }}</div>
                    <div class="label">Jenis Order</div>
                    <div class="value">: {{ printData.jo_nama }}</div>
                    <div class="label">Nama Desain</div>
                    <div class="value">: {{ printData.sd_nama }}</div>
                    <div class="label">Jumlah</div>
                    <div class="value">: {{ printData.jumlah }}</div>
                    <div class="label">Ukuran</div>
                    <div class="value">: {{ printData.ukuran }}</div>
                    <div class="label">Date Line</div>
                    <div class="value">: {{ format(parseISO(printData.sd_datekerja), 'dd/MM/yyyy') }}</div>
                    <div class="label">Workshop</div>
                    <div class="value">: {{ printData.gdg_nama }}</div>
                    <div class="label">Desainer</div>
                    <div class="value">: {{ printData.sd_desain }}</div>
                    <div class="label">Keterangan</div>
                    <div class="value">: {{ printData.sd_ket }}</div>
                </div>
            </div>

            <div class="page-footer">
                <div class="image-preview">
                    <img v-if="imageFullUrl" :src="imageFullUrl" alt="Design Preview" />
                    <div v-else class="no-image">No Image available</div>
                </div>
                <div class="signatures">
                    <table>
                        <thead>
                            <tr>
                                <th>Kaosan SC</th>
                                <th>Mengetahui</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="signature-space">
                                    ( {{ printData.user_create }} )
                                </td>
                                <td class="signature-space">
                                    ( ......................... )
                                </td>
                            </tr>
                        </tbody>
                    </table>
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
    background: white;
    padding: 1.5cm;
    margin: 20px auto;
    width: 21cm;
    min-height: 29.7cm;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
    font-family: 'Arial', sans-serif;
    font-size: 10pt;
    color: #333;
    display: flex;
    flex-direction: column;
}

.page-header {
    display: flex;
    align-items: center;
    border-bottom: 2px solid black;
    padding-bottom: 8px;
    margin-bottom: 20px;
}

.logo {
    width: 60px;
    height: auto;
    margin-right: 15px;
}

.main-title {
    font-size: 14pt;
    font-weight: bold;
}

.master-data {
    padding: 10px 0;
}

.data-grid {
    display: grid;
    grid-template-columns: 100px auto;
    /* Lebar label, nilai sisanya */
    row-gap: 4px;
    /* Spasi antar baris yang rapat */
    column-gap: 10px;
}

.label {
    font-weight: normal;
}

.page-footer {
    display: flex;
    align-items: flex-end;
    /* Align items to the bottom */
    margin-top: auto;
    /* Mendorong footer ke bagian bawah halaman */
    padding-top: 20px;
    width: 100%;
}

.image-preview {
    flex-shrink: 0;
    width: 150px;
    height: 150px;
    border: 1px solid #ccc;
    display: flex;
    align-items: center;
    justify-content: center;
}

.image-preview img {
    max-width: 100%;
    max-height: 100%;
}

.no-image {
    font-style: italic;
    color: #999;
}

.signatures {
    flex-grow: 1;
    display: flex;
    justify-content: flex-end;
}

.signatures table {
    width: 400px;
    text-align: center;
    border-collapse: collapse;
}

.signatures th,
.signatures td {
    border: 1px solid #333;
    padding: 8px;
}

.signature-space {
    height: 60px;
    /* Memberi ruang untuk tanda tangan */
    vertical-align: bottom;
}
</style>
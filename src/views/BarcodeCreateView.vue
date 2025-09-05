<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import ProductSearchModal from '@/components/ProductSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
import { format } from 'date-fns';
import JsBarcode from 'jsbarcode';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();

interface BarcodeItem {
    id: number;
    kode: string;
    barcode: string;
    nama: string;
    ukuran: string;
    harga: number;
    jumlah: number;
}

const nomor = ref('');
const tanggal = ref(format(new Date(), 'yyyy-MM-dd'));
const items = ref<BarcodeItem[]>([{ id: Date.now(), kode: '', barcode: '', nama: '', ukuran: '', harga: 0, jumlah: 0 }]);
const isSaving = ref(false);
const isProductSearchModalVisible = ref(false);
const activeRowIndex = ref(-1);
const productCategory = ref('Kaosan');
const selectedPrinter = ref('Xprinter XP-360B');
const barcodeScanTerm = ref('');
const isPreviewModalVisible = ref(false);

const tableHeaders = [
    { title: 'Kode', key: 'kode', sortable: false },
    { title: 'Barcode', key: 'barcode', sortable: false },
    { title: 'Nama Barang', key: 'nama', sortable: false },
    { title: 'Size', key: 'ukuran', sortable: false },
    { title: 'Harga', key: 'harga', sortable: false, align: 'end' },
    { title: 'Jumlah', key: 'jumlah', sortable: false, width: '150px' },
    { title: 'Actions', key: 'actions', sortable: false, width: '80px' },
] as const;

const barcodeSheets = computed(() => {
    const expandedItems = items.value
        .filter(item => item.kode && item.jumlah > 0)
        .flatMap(item =>
            Array.from({ length: item.jumlah }, () => ({
                barcode: item.barcode,
                nama: item.nama,
                ukuran: item.ukuran,
                harga: item.harga,
            }))
        );

    const sheets = [];
    for (let i = 0; i < expandedItems.length; i += 2) {
        sheets.push(expandedItems.slice(i, i + 2));
    }
    return sheets;
});

// --- DIUBAH TOTAL: Style cetak disesuaikan untuk teks dan positioning ---
// Ganti variabel printStyles Anda dengan versi final ini
const printStyles = `
    @page {
        size: 68mm 15mm;
        margin: 0;
    }
    
    body, html {
        margin: 0;
        padding: 0;
        width: 68mm;
        height: 15mm;
        overflow: hidden;
    }

    .label-sheet-print {
        width: 100%;
        height: 100%;
        display: flex !important;
        justify-content: space-between !important; 
        align-items: center;
        page-break-after: always;
    }

    .barcode-container {
        box-sizing: border-box;
        width: 33mm; /* Lebar pasti untuk satu label */
        height: 15mm; /* Tinggi pasti untuk satu label */
        display: flex !important;
        flex-direction: column;
        justify-content: center !important;
        align-items: center !important;
        padding: 0.5mm 1mm;
        text-align: center;
        overflow: hidden;
    }

    .item-name, .item-size {
        font-family: Arial, sans-serif;
        font-size: 5px; 
        line-height: 1.1;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }
    .item-name { font-weight: bold; }
    .item-size { font-weight: normal; }

    .barcode-container svg {
        max-width: 100%;
        height: auto;
        display: block;
        margin-top: 0.5mm;
    }
`;


const getNextNumber = async () => {
    try {
        const cabang = authStore.user?.cabang || '';
        const response = await api.get('/barcode-form/next-number', {
            params: { cabang, tanggal: tanggal.value }
        });
        nomor.value = response.data.nextNumber;
    } catch (error) {
        toast.error("Gagal mendapatkan nomor baru.");
    }
};

const openProductSearchModal = (index: number) => {
    activeRowIndex.value = index;
    isProductSearchModalVisible.value = true;
};

const handleProductSelected = async (product: { kode: string }) => {
    isProductSearchModalVisible.value = false;
    if (!product || !product.kode) return;
    try {
        const response = await api.get(`/barcode-form/product-details/${product.kode}`);
        const productDetails = response.data;
        items.value.splice(activeRowIndex.value, 1);
        productDetails.forEach((detail: any) => {
            const isDuplicate = items.value.some(item => item.barcode === detail.barcode);
            if (!isDuplicate) {
                items.value.push({
                    id: Date.now() + Math.random(),
                    kode: detail.kode,
                    nama: detail.nama,
                    barcode: detail.barcode,
                    ukuran: detail.ukuran,
                    harga: detail.harga,
                    jumlah: 0,
                });
            }
        });
        addNewRow();
    } catch (error) {
        toast.error(`Gagal memuat detail untuk produk ${product.kode}.`);
    }
};

const handleBarcodeScan = async () => {
    if (!barcodeScanTerm.value) return;
    try {
        const response = await api.get('/barcode-form/find-by-barcode', {
            params: { barcode: barcodeScanTerm.value }
        });
        const product = response.data;
        if (product) {
            const existingItem = items.value.find(i => i.barcode === product.barcode);
            if (existingItem) {
                existingItem.jumlah = (existingItem.jumlah || 0) + 1;
            } else {
                if (items.value.length > 0 && !items.value[items.value.length - 1].kode) {
                    items.value.pop();
                }
                items.value.push({ ...product, id: Date.now(), jumlah: 1 });
            }
            addNewRow();
        } else {
            toast.warning('Barcode tidak ditemukan.');
        }
        barcodeScanTerm.value = '';
    } catch (error) {
        toast.error('Gagal mencari barcode.');
    }
};

const addNewRow = () => {
    const lastItem = items.value[items.value.length - 1];
    if (!lastItem || lastItem.kode) {
        items.value.push({ id: Date.now(), kode: '', barcode: '', nama: '', ukuran: '', harga: 0, jumlah: 0 });
    }
};

const removeRow = (id: number) => {
    items.value = items.value.filter(item => item.id !== id);
    if (items.value.length === 0) {
        addNewRow();
    }
};

const save = async () => {
    isSaving.value = true;
    const validItems = items.value.filter(item => item.kode && item.jumlah > 0);
    if (validItems.length === 0) {
        toast.error('Tidak ada item yang valid untuk disimpan.');
        isSaving.value = false;
        return;
    }
    try {
        const payload = {
            nomor: nomor.value,
            tanggal: tanggal.value,
            user: authStore.user?.kode,
            items: validItems,
            options: { showPrice: ref(false).value, printer: selectedPrinter.value, category: productCategory.value }
        };
        await api.post('/api/barcode-form/save', payload);

        openPrintPreview();

        toast.success(`Data barcode ${nomor.value} berhasil disimpan. Siap untuk dicetak.`);
    } catch (error) {
        toast.error('Gagal menyimpan data.');
    } finally {
        isSaving.value = false;
    }
};

const resetForm = () => {
    getNextNumber();
    tanggal.value = format(new Date(), 'yyyy-MM-dd');
    items.value = [{ id: Date.now(), kode: '', barcode: '', nama: '', ukuran: '', harga: 0, jumlah: 0 }];
    productCategory.value = 'Kaosan';
    selectedPrinter.value = 'Xprinter XP-360B';
};

const openPrintPreview = () => {
    const validItems = items.value.filter(item => item.kode && item.jumlah > 0);
    if (validItems.length === 0) {
        toast.warning('Tidak ada item dengan jumlah lebih dari 0 untuk dicetak.');
        return;
    }
    isPreviewModalVisible.value = true;
};

watch(isPreviewModalVisible, (isVisible) => {
    if (isVisible) {
        nextTick(() => {
            const options = { format: "CODE128", width: 1.2, height: 18, displayValue: true, fontSize: 7, margin: 1 };
            barcodeSheets.value.forEach((sheet, sheetIndex) => {
                sheet.forEach((item, itemIndex) => {
                    const elementId = `#barcode-${sheetIndex}-${itemIndex}`;
                    const svgElement = document.querySelector(elementId);
                    if (svgElement && item) {
                        JsBarcode(svgElement, item.barcode, options);
                    }
                });
            });
        });
    }
});

const executePrint = () => {
    if (barcodeSheets.value.length === 0) {
        toast.error("Tidak ada barcode untuk dicetak.");
        return;
    }

    // Sembunyikan modal agar tidak mengganggu proses cetak
    isPreviewModalVisible.value = false;

    // Loop melalui setiap HALAMAN (sheet) yang akan dicetak
    barcodeSheets.value.forEach((sheet, index) => {
        // Beri jeda antar setiap print job agar antrian cetak printer tidak error
        setTimeout(() => {
            // Buat konten hanya untuk SATU halaman ini
            let contentToPrint = '<div class="label-sheet-print">';
            sheet.forEach(item => {
                if (item) { // Hanya render jika item tidak null
                    contentToPrint += `
                        <div class="barcode-container">
                            <div class="item-name">${item.nama}</div>
                            <div class="item-size">${item.ukuran}</div>
                            <svg class="barcode-svg-print" data-value="${item.barcode}"></svg>
                        </div>
                    `;
                } else { // Render kontainer kosong jika item ganjil
                    contentToPrint += '<div class="barcode-container"></div>';
                }
            });
            contentToPrint += '</div>';

            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow?.document;
            doc?.open();
            doc?.write(`
                <html>
                    <head>
                        <title>Cetak Barcode</title>
                        <style>${printStyles}</style>
                        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                    </head>
                    <body>
                        ${contentToPrint}
                        <script>
                            document.addEventListener('DOMContentLoaded', function() {
                                const options = { format: "CODE128", width: 1.2, height: 18, displayValue: true, fontSize: 7, margin: 1 };
                                document.querySelectorAll('.barcode-svg-print').forEach(svg => {
                                    const value = svg.dataset.value;
                                    if (value) { JsBarcode(svg, value, options); }
                                });
                                
                                // Langsung cetak setelah barcode untuk halaman INI digambar
                                window.print();
                            });
                        <\/script>
                    </body>
                </html>
            `);
            doc?.close();

            // Hapus iframe setelah beberapa saat
            setTimeout(() => {
                if (iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe);
                }
            }, 1000);

        }, index * 800); // Jeda 800 milidetik antar halaman
    });
};

onMounted(() => {
    getNextNumber();
});
</script>

<template>
    <PageLayout title="Buat Cetak Barcode Baru" desktop-mode icon="mdi-barcode-plus">
        <template #header-actions>
            <v-btn size="small" @click="save" :loading="isSaving" color="primary" prepend-icon="mdi-content-save">Simpan
                & Cetak</v-btn>
            <v-btn size="small" @click="resetForm" prepend-icon="mdi-refresh">Baru</v-btn>
            <v-btn size="small" @click="router.push('/cetak-barcode')" prepend-icon="mdi-close">Tutup</v-btn>
        </template>

        <div class="form-container">
            <!-- Header Section -->
            <div class="desktop-form-section">
                <v-row dense align="center">
                    <v-col cols="2"><v-text-field v-model="nomor" label="Nomor" variant="filled" readonly
                            density="compact" hide-details></v-text-field></v-col>
                    <v-col cols="2"><v-text-field v-model="tanggal" type="date" label="Tanggal" variant="outlined"
                            density="compact" hide-details></v-text-field></v-col>
                    <v-col cols="3"><v-text-field v-model="barcodeScanTerm" label="Scan Barcode (Cari Produk)"
                            variant="outlined" density="compact" prepend-inner-icon="mdi-barcode-scan"
                            @keyup.enter="handleBarcodeScan" clearable hide-details></v-text-field></v-col>
                    <v-col cols="5">
                        <div class="d-flex align-center ga-2 pa-2 border rounded">
                            <v-radio-group v-model="productCategory" inline hide-details density="compact"
                                class="ma-0 pa-0">
                                <v-radio label="Kaosan" value="Kaosan"></v-radio>
                                <v-radio label="Reszo" value="Reszo"></v-radio>
                            </v-radio-group>
                            <v-select v-model="selectedPrinter"
                                :items="['Postek C168/200s', 'Xprinter XP-360B', 'Xprinter 360B']" label="Printer" dense
                                hide-details variant="outlined" density="compact"></v-select>
                            <v-btn size="small" @click="openPrintPreview" variant="outlined"
                                prepend-icon="mdi-printer-eye">Preview</v-btn>
                        </div>
                    </v-col>
                </v-row>
            </div>

            <!-- Table Section -->
            <div class="desktop-form-section flex-grow-1 d-flex flex-column">
                <v-data-table :headers="tableHeaders" :items="items" density="compact" class="desktop-table flex-grow-1"
                    fixed-header height="100%" :items-per-page="-1">
                    <template #item.kode="{ item }">
                        <v-text-field v-model="item.kode" variant="underlined" dense hide-details single-line
                            placeholder="Ketik atau F1..."
                            @keydown.f1.prevent="openProductSearchModal(items.indexOf(item))">
                            <template #append-inner><v-icon @click="openProductSearchModal(items.indexOf(item))"
                                    size="small">mdi-magnify</v-icon></template>
                        </v-text-field>
                    </template>
                    <template #item.harga="{ item }">{{ new Intl.NumberFormat('id-ID').format(item.harga) }}</template>
                    <template #item.jumlah="{ item }">
                        <v-text-field v-model.number="item.jumlah" type="number" variant="underlined" dense hide-details
                            single-line min="0" @focus="$event.target.select()"
                            @keydown.enter.prevent="addNewRow"></v-text-field>
                    </template>
                    <template #item.actions="{ item }">
                        <v-btn icon="mdi-delete" variant="text" color="error" size="x-small"
                            @click="removeRow(item.id)"></v-btn>
                    </template>
                    <template #bottom>
                        <div class="pa-1 text-right border-t">
                            <v-btn size="small" @click="addNewRow" prepend-icon="mdi-plus" variant="text"
                                color="primary">Tambah Baris</v-btn>
                        </div>
                    </template>
                </v-data-table>
            </div>
        </div>

        <ProductSearchModal v-if="isProductSearchModalVisible" :category="productCategory"
            :gudang="authStore.user?.cabang || ''" @close="isProductSearchModalVisible = false"
            @product-selected="handleProductSelected" />

        <v-dialog v-model="isPreviewModalVisible" max-width="500px" scrollable>
            <v-card>
                <v-toolbar color="primary">
                    <v-toolbar-title>Pratinjau Cetak Barcode</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-btn icon="mdi-close" @click="isPreviewModalVisible = false"></v-btn>
                </v-toolbar>
                <v-card-text class="pa-4 bg-grey-lighten-3">
                    <div id="barcode-preview-area">
                        <div v-for="(sheet, sheetIndex) in barcodeSheets" :key="sheetIndex" class="label-sheet-preview">
                            <div v-for="(item, itemIndex) in sheet" :key="itemIndex" class="barcode-container-preview">
                                <template v-if="item">
                                    <div class="item-name">{{ item.nama }}</div>
                                    <div class="item-size">{{ item.ukuran }}</div>
                                    <svg :id="`barcode-${sheetIndex}-${itemIndex}`"></svg>
                                </template>
                            </div>
                        </div>
                    </div>
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer></v-spacer>
                    <v-btn color="primary" @click="executePrint" prepend-icon="mdi-printer">Cetak Semua ({{
                        barcodeSheets.length
                    }} Halaman)</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </PageLayout>
</template>

<style scoped>
.form-container {
    padding: 12px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.desktop-table {
    font-size: 11px;
}

.desktop-table :deep(input) {
    font-size: 11px !important;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 32px !important;
}

/* Style untuk pratinjau di layar agar mirip hasil cetak */
#barcode-preview-area {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
}

.label-sheet-preview {
    width: 136mm;
    /* 2x dari 68mm */
    height: 30mm;
    /* 2x dari 15mm */
    background-color: white;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
    border-radius: 2px;
    padding: 0;
    display: flex;
    justify-content: space-between;
}

.barcode-container-preview {
    width: 66mm;
    /* 2x dari 33mm */
    height: 30mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    overflow: hidden;
}


/* Teks di pratinjau dibuat lebih besar agar terbaca di layar */
.item-name,
.item-size {
    font-family: Arial, sans-serif;
    font-size: 10px;
    line-height: 1.1;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    font-weight: bold;
    color: #333;
}

.item-size {
    font-size: 8px;
    font-weight: normal;
}

.barcode-container svg {
    max-width: 100%;
    height: auto;
    display: block;
    margin-top: 1mm;
}
</style>
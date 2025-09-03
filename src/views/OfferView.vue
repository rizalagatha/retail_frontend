<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import OfferPrintPreview from '@/components/OfferPrintPreview.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';
import { useRouter } from 'vue-router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import logoUrl from '@/assets/logo.png';

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = '42';

interface OfferHeader {
    nomor: string;
    tanggal: string;
    kdcus: string;
    nama: string;
    nominal: number;
    noSO: string;
    alasan: string;
    created: string;
}

interface OfferDetail {
    kode: string;
    barcode: string;
    nama: string;
    ukuran: string;
    qty: number;
    harga: number;
    diskon: number;
    total: number;
}

interface Branch {
    kode: string;
    nama: string;
}

// --- State ---
const headers = ref<OfferHeader[]>([]);
const details = ref<{ [key: string]: OfferDetail[] }>({});
const isLoading = ref(true);
const startDate = ref(format(new Date(), 'yyyy-MM-dd'));
const endDate = ref(format(new Date(), 'yyyy-MM-dd'));
const expanded = ref<OfferHeader[]>([]);
const selected = ref<OfferHeader[]>([]);
const loadingDetails = ref<Set<string>>(new Set());

const branchList = ref<Branch[]>([]);
const selectedBranch = ref(authStore.user?.cabang || '');

const isCloseDialogVisible = ref(false);
const closeReason = ref('');
const isClosing = ref(false);

const isPrintConfirmVisible = ref(false);
const isPreviewVisible = ref(false);
const printData = ref<any>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));
const dialogDelete = ref(false);
const itemToDelete = ref<OfferHeader | null>(null);

const tableHeaders = [
    { title: 'Nomor', key: 'nomor' },
    { title: 'Tanggal', key: 'tanggal' },
    { title: 'Kode Customer', key: 'kdcus' },
    { title: 'Nama Customer', key: 'nama' },
    { title: 'Nominal', key: 'nominal', align: 'end' },
    { title: 'No. SO', key: 'noSO' },
    { title: 'User', key: 'created' },
    { title: 'Status', key: 'status' },
    { title: '', key: 'data-table-expand', align: 'center' },
];

const detailHeaders = [
    { title: 'Kode', key: 'kode' },
    { title: 'Barcode', key: 'barcode' },
    { title: 'Nama Barang', key: 'nama' },
    { title: 'Ukuran', key: 'ukuran' },
    { title: 'Qty', key: 'qty', align: 'end' },
    { title: 'Harga', key: 'harga', align: 'end' },
    { title: 'Diskon', key: 'diskon', align: 'end' },
    { title: 'Total', key: 'total', align: 'end' },
];

const isSingleSelected = computed(() => selected.value.length === 1);
const canBeClosed = computed(() => {
    if (!isSingleSelected.value) return false;
    const selectedOffer = selected.value[0];
    // Tombol aktif hanya jika penawaran belum jadi SO dan belum punya alasan (status Open)
    return !selectedOffer.noSO && !selectedOffer.alasan;
});

// --- Methods ---
const fetchBranches = async () => {
    try {
        // Perbaikan: Panggil endpoint yang benar
        const response = await api.get('/warehouses/list', {
            params: { userCabang: authStore.user?.cabang }
        });
        branchList.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.');
    }
};

const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await api.get('/offers', {
            params: {
                startDate: startDate.value,
                endDate: endDate.value,
                cabang: selectedBranch.value // Gunakan cabang yang dipilih
            }
        });
        headers.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat data penawaran.');
    } finally {
        isLoading.value = false;
    }
};

// Method yang diperbaiki untuk load details
const loadDetails = async (expandedItems: OfferHeader[]) => {

    // Extract nomor dari expanded items
    const expandedNomors = expandedItems.map(item => item.nomor);

    // Cari item yang baru di-expand (belum punya detail)
    for (const nomor of expandedNomors) {


        if (!details.value[nomor] && !loadingDetails.value.has(nomor)) {
            loadingDetails.value.add(nomor);

            try {
                const url = `/offers/${nomor}`;
                const response = await api.get(url);

                // Update details dengan spread operator untuk trigger reactivity
                details.value = {
                    ...details.value,
                    [nomor]: response.data
                };
            } catch (error) {
                console.error(`Error loading detail for ${nomor}:`, error);
                toast.error(`Gagal memuat detail untuk nomor ${nomor}`);
                // Remove dari expanded jika gagal load
                expanded.value = expanded.value.filter(item =>
                    typeof item === 'string' ? item !== nomor : item.nomor !== nomor
                );
            } finally {
                loadingDetails.value.delete(nomor);
            }
        } else {
        }
    }
};

const getStatus = (item: OfferHeader) => {
    if (item.noSO) {
        return { text: 'Sudah Jadi SO', color: 'success' };
    }
    if (item.alasan) {
        return { text: 'Closed', color: 'blue' };
    }
    return { text: 'Open', color: 'red' };
};

const editOffer = () => {
    if (!isSingleSelected.value) return;
    const nomor = selected.value[0].nomor;
    router.push(`/penawaran/ubah/${nomor}`);
};

const deleteOffer = async (item: OfferHeader) => {
    if (item.noSO || item.alasan) {
        toast.warning('Penawaran yang sudah menjadi SO atau ditutup tidak bisa dihapus.');
        return;
    }
    try {
        await api.delete(`/offers/${item.nomor}`);
        toast.success('Penawaran berhasil dihapus.');
        fetchData();
        selected.value = [];
    } catch (error) {
        toast.error('Gagal menghapus penawaran.');
    }
};

const confirmDelete = () => {
    if (!isSingleSelected.value) return;
    itemToDelete.value = selected.value[0];
    dialogDelete.value = true;
};

const deleteConfirmed = () => {
    if (itemToDelete.value) {
        deleteOffer(itemToDelete.value);
    }
    dialogDelete.value = false;
    itemToDelete.value = null;
};

const exportData = () => {
    const worksheet = XLSX.utils.json_to_sheet(headers.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Penawaran");
    XLSX.writeFile(workbook, "DaftarPenawaran.xlsx");
    toast.success('Data berhasil diekspor ke Excel.');
};

const openCloseDialog = () => {
    if (!canBeClosed.value) return; // Validasi tambahan
    closeReason.value = selected.value[0].alasan || ''; // Isi dengan alasan yang ada jika ada
    isCloseDialogVisible.value = true;
};

const submitCloseOffer = async () => {
    if (!closeReason.value) {
        toast.error('Alasan harus diisi.');
        return;
    }
    isClosing.value = true;
    try {
        const nomor = selected.value[0].nomor;
        await api.post('/offers/close', {
            nomor,
            alasan: closeReason.value,
        });
        toast.success('Penawaran berhasil ditutup.');
        isCloseDialogVisible.value = false;
        fetchData(); // Muat ulang data untuk melihat status baru
        selected.value = []; // Kosongkan seleksi
    } catch (error) {
        toast.error('Gagal menutup penawaran.');
    } finally {
        isClosing.value = false;
    }
};

const openPrintConfirm = async () => {
    if (!isSingleSelected.value) {
        toast.info('Pilih satu penawaran untuk dicetak.');
        return;
    }

    try {
        const nomor = selected.value[0].nomor;
        // Panggil API baru untuk mengambil semua data cetak
        const response = await api.get(`/offers/print-data/${nomor}`);
        printData.value = response.data; // Simpan data cetak yang lengkap
        isPrintConfirmVisible.value = true;
    } catch (error) {
        toast.error('Gagal memuat data untuk dicetak.');
    }
};

const showPreview = () => {
    if (!printData.value) {
        toast.error('Data cetak tidak tersedia.');
        return;
    }
    isPrintConfirmVisible.value = false;
    isPreviewVisible.value = true;
};

const terbilang = (n: number): string => {
    if (n === null || n === undefined) return "Nol Rupiah";
    n = Math.floor(n);
    if (n === 0) return "Nol Rupiah";

    const angka = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

    const terbilangRecursive = (num: number): string => {
        if (num < 12) return angka[num];
        if (num < 20) return terbilangRecursive(num - 10) + " Belas";
        if (num < 100) return angka[Math.floor(num / 10)] + " Puluh " + terbilangRecursive(num % 10);
        if (num < 200) return "Seratus " + terbilangRecursive(num - 100);
        if (num < 1000) return terbilangRecursive(Math.floor(num / 100)) + " Ratus " + terbilangRecursive(num % 100);
        if (num < 2000) return "Seribu " + terbilangRecursive(num - 1000);
        if (num < 1000000) return terbilangRecursive(Math.floor(num / 1000)) + " Ribu " + terbilangRecursive(num % 1000);
        if (num < 1000000000) return terbilangRecursive(Math.floor(num / 1000000)) + " Juta " + terbilangRecursive(num % 1000000);
        if (num < 1000000000000) return terbilangRecursive(Math.floor(num / 1000000000)) + " Miliar " + terbilangRecursive(num % 1000000000);
        if (num < 1000000000000000) return terbilangRecursive(Math.floor(num / 1000000000000)) + " Triliun " + terbilangRecursive(num % 1000000000000);
        return "Angka Melebihi Batas";
    };

    return terbilangRecursive(n).replace(/\s+/g, ' ').trim() + " Rupiah";
};

const generatePdf = (autoPrint = false) => {
    isPrintConfirmVisible.value = false;
    isPreviewVisible.value = false;

    const data = printData.value;
    if (!data) {
        toast.error('Data cetak tidak valid.');
        return;
    }

    const doc = new jsPDF();
    const grandTotal = (data.footer.total - data.footer.diskon_faktur) + data.footer.ppn + data.footer.bkrm;

    // Header
    const img = new Image();
    img.src = logoUrl;
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginRight = 10; // biar ga mentok
    const imgWidth = 20;
    const ratio = img.width / img.height;
    const imgHeight = imgWidth / ratio;

    // posisi X supaya rata kanan
    const x = pageWidth - imgWidth - marginRight;
    doc.addImage(img, 'PNG', x, 10, imgWidth, imgHeight);
    doc.setFontSize(14).setFont(undefined, 'bold');
    doc.text(data.gudang.gdg_inv_nama, 14, 15);
    doc.setFontSize(10).setFont(undefined, 'normal');
    doc.text(data.gudang.gdg_inv_alamat, 14, 20);
    doc.text(data.gudang.gdg_inv_kota, 14, 25);
    doc.text(data.gudang.gdg_inv_telp, 14, 30);

    doc.setFontSize(18).setFont(undefined, 'bold');
    doc.text('PENAWARAN', 105, 40, { align: 'center' });

    // Info Transaksi
    doc.setFontSize(10).setFont(undefined, 'normal');
    doc.text(`Nomor: ${data.header.pen_nomor}`, 14, 50);
    doc.text(`Tanggal: ${format(new Date(data.header.pen_tanggal), 'dd-MM-yyyy')}`, 14, 55);

    doc.text(`Customer: ${data.customer.cus_nama}`, 120, 50);
    doc.text(`${data.customer.cus_alamat}, ${data.customer.cus_kota}`, 120, 55);
    doc.text(`Telp: ${data.customer.cus_telp}`, 120, 60);

    // Tabel Item
    autoTable(doc, {
        startY: 70,
        head: [['No', 'Nama Barang', 'Qty', 'Harga', 'Diskon', 'Total']],
        body: data.details.map((d: any, i: number) => [
            i + 1,
            `${d.nama} (${d.ukuran})`,
            d.qty,
            new Intl.NumberFormat('id-ID').format(d.harga),
            new Intl.NumberFormat('id-ID').format(d.diskon),
            new Intl.NumberFormat('id-ID').format(d.total),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: 0 },
        styles: { fontSize: 8 },
        columnStyles: {
            2: { halign: 'right' }, 3: { halign: 'right' },
            4: { halign: 'right' }, 5: { halign: 'right' },
        }
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 5;
    doc.setFontSize(8);
    doc.text(`Terbilang: ${terbilang(grandTotal)}`, 14, finalY, { maxWidth: 120 });

    const startXTotals = 140;
    doc.text('Total', startXTotals, finalY);
    doc.text(`${new Intl.NumberFormat('id-ID').format(data.footer.total)}`, 205, finalY, { align: 'right' });
    doc.text('Diskon', startXTotals, finalY + 5);
    doc.text(`${new Intl.NumberFormat('id-ID').format(data.footer.diskon_faktur)}`, 205, finalY + 5, { align: 'right' });
    doc.text('Ppn', startXTotals, finalY + 10);
    doc.text(`${new Intl.NumberFormat('id-ID').format(data.footer.ppn)}`, 205, finalY + 10, { align: 'right' });
    doc.text('Biaya Kirim', startXTotals, finalY + 15);
    doc.text(`${new Intl.NumberFormat('id-ID').format(data.footer.bkrm)}`, 205, finalY + 15, { align: 'right' });
    doc.setLineWidth(0.5);
    doc.line(startXTotals, finalY + 17, 205, finalY + 17);
    doc.setFont(undefined, 'bold');
    doc.text('Grand Total', startXTotals, finalY + 22);
    doc.text(`${new Intl.NumberFormat('id-ID').format(grandTotal)}`, 205, finalY + 22, { align: 'right' });

    doc.setFont(undefined, 'normal');
    doc.text('Dibuat Oleh,', 14, finalY + 25);
    doc.text('Mengetahui,', 60, finalY + 25);
    doc.text(`( ${data.header.user_create} )`, 14, finalY + 45);
    doc.text(`( .......................... )`, 60, finalY + 45);
    doc.text(`Note: ${data.header.pen_ket}`, 14, doc.internal.pageSize.height - 20, { maxWidth: 180 });

    if (autoPrint) {
        doc.autoPrint();
    }
    doc.output('dataurlnewwindow');
};

const exportHeaderData = () => {
    if (headers.value.length === 0) {
        toast.warning('Tidak ada data header untuk diekspor.');
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(headers.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Penawaran Header");
    XLSX.writeFile(workbook, "DaftarPenawaran_Header.xlsx");
    toast.success('Data header berhasil diekspor.');
};

const exportDetailData = async () => {
    toast.info('Menyiapkan data detail untuk diekspor...');
    try {
        const cabang = authStore.user?.cabang || '';
        const response = await api.get('/offers/export-details', {
            params: { startDate: startDate.value, endDate: endDate.value, cabang }
        });

        const dataToExport = response.data;

        if (dataToExport.length === 0) {
            toast.warning('Tidak ada data detail untuk diekspor pada periode ini.');
            return;
        }

        // 1. Siapkan Judul dan Header
        const title = "FORM PENAWARAN";
        const dateRange = `Periode : ${format(new Date(startDate.value), 'dd/MM/yyyy')} s/d ${format(new Date(endDate.value), 'dd/MM/yyyy')}`;
        const tableHeaders = Object.keys(dataToExport[0]);

        // 2. Ubah data JSON menjadi array of arrays
        const tableData = dataToExport.map((row: any) => Object.values(row));

        // 3. Gabungkan semua bagian menjadi satu array besar
        const excelData = [
            [title],
            [dateRange],
            [], // Baris kosong sebagai spasi
            tableHeaders,
            ...tableData
        ];

        // 4. Buat worksheet menggunakan aoa_to_sheet
        const ws = XLSX.utils.aoa_to_sheet(excelData);

        // 5. Atur penggabungan sel (merge)
        const merge = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } }, // Judul
            { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } }, // Rentang tanggal
        ];
        ws['!merges'] = merge;

        // (Opsional) Atur lebar kolom agar lebih rapi
        const colWidths = tableHeaders.map(header => ({ wch: header.length + 5 }));
        ws['!cols'] = colWidths;

        // 6. Buat workbook dan unduh file
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, ws, "Detail Penawaran");

        XLSX.writeFile(workbook, "DetailPenawaran.xlsx");
        toast.success('Data detail berhasil diekspor.');

    } catch (error) {
        toast.error('Gagal mengekspor data detail.');
        console.error("Export detail error:", error);
    }
};

onMounted(() => {
    // Sekarang onMounted jadi lebih simpel
    if (hasViewPermission.value) { // Cek nilai computed
        fetchData();
        fetchBranches();
    } else {
        isLoading.value = false;
        toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    }
});

// Watcher untuk expanded items sebagai backup
watch(expanded, (newExpanded, oldExpanded) => {
    console.log('Watcher - Expanded changed from', oldExpanded, 'to', newExpanded);
    if (newExpanded.length > 0) {
        loadDetails(newExpanded);
    }
}, { deep: true });

// Watcher untuk memuat ulang data saat cabang berubah
watch(selectedBranch, () => {
    if (hasViewPermission.value) fetchData();
});

</script>

<template>
    <PageLayout title="Penawaran">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" color="primary" prepend-icon="mdi-plus"
                @click="router.push('/penawaran/new')">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" :disabled="!isSingleSelected" prepend-icon="mdi-pencil"
                @click="editOffer">Ubah</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'delete')" :disabled="!isSingleSelected" prepend-icon="mdi-delete"
                @click="confirmDelete">Hapus</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" :disabled="!isSingleSelected" prepend-icon="mdi-printer"
                @click="openPrintConfirm">Cetak</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" prepend-icon="mdi-file-excel" @click="exportHeaderData">Export
                Header</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'view')" prepend-icon="mdi-file-download-outline"
                @click="exportDetailData">Export Detail</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'edit')" :disabled="!canBeClosed" color="blue"
                prepend-icon="mdi-lock-outline" @click="openCloseDialog">Close Penawaran</v-btn>
        </template>
        
        <div v-if="!hasViewPermission" class="text-center pa-8 text-grey">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
            <p class="body-1 mt-2">Anda tidak memiliki izin untuk melihat data ini.</p>
        </div>

        <v-card>
            <v-card-title class="d-flex align-center pe-2 ga-2 flex-wrap">
                <div class="d-flex align-center ga-2">
                    <span>Filter Periode:</span>
                    <v-text-field v-model="startDate" type="date" density="compact" hide-details
                        style="min-width: 140px;"></v-text-field>
                    <span>s/d</span>
                    <v-text-field v-model="endDate" type="date" density="compact" hide-details
                        style="min-width: 140px;"></v-text-field>
                </div>

                <div class="d-flex align-center ga-2" style="min-width: 200px;">
                    <span>Cabang:</span>
                    <v-select v-model="selectedBranch" :items="branchList" item-title="nama" item-value="kode"
                        density="compact" hide-details variant="outlined"></v-select>
                </div>

                <div class="d-flex align-center ga-2 text-caption">
                    <div class="d-flex align-center"><v-sheet color="red" height="12" width="12" class="me-1"></v-sheet>
                        Belum
                        Jadi SO</div>
                    <div class="d-flex align-center ml-2"><v-sheet color="blue" height="12" width="12"
                            class="me-1"></v-sheet>
                        Tidak Jadi SO</div>
                </div>

                <v-spacer></v-spacer>
                <v-btn @click="fetchData" icon="mdi-refresh" variant="text"></v-btn>
            </v-card-title>
            <v-divider></v-divider>

            <v-data-table v-model="selected" v-model:expanded="expanded" :headers="tableHeaders" :items="headers"
                :loading="isLoading" item-value="nomor" show-select return-object show-expand
                @update:expanded="(newExpanded) => { console.log('Expanded changed to:', newExpanded); loadDetails(newExpanded); }">
                <template #item.status="{ item }">
                    <v-chip :color="getStatus(item).color" variant="tonal" size="small">{{ getStatus(item).text
                    }}</v-chip>
                </template>
                <template #item.nominal="{ item }">
                    {{ new Intl.NumberFormat('id-ID').format(item.nominal) }}
                </template>
                <template #item.tanggal="{ item }">
                    {{ format(new Date(item.tanggal), 'dd/MM/yyyy') }}
                </template>
                <template #expanded-row="{ columns, item }">
                    <tr>
                        <td :colspan="columns.length" class="pa-4 bg-grey-lighten-5">
                            <div v-if="loadingDetails.has(item.nomor)" class="text-center py-4">
                                <v-progress-circular indeterminate size="24" class="mr-2"></v-progress-circular>
                                Memuat detail...
                            </div>
                            <div v-else-if="!details[item.nomor]" class="text-center py-4 text-grey">
                                Detail belum dimuat
                            </div>
                            <v-data-table v-else-if="details[item.nomor] && details[item.nomor].length > 0"
                                :headers="detailHeaders" :items="details[item.nomor]" density="compact"
                                hide-default-footer class="elevation-0">
                                <template #item.harga="{ item: detailItem }">{{ new
                                    Intl.NumberFormat('id-ID').format(detailItem.harga) }}</template>
                                <template #item.diskon="{ item: detailItem }">{{ new
                                    Intl.NumberFormat('id-ID').format(detailItem.diskon) }}</template>
                                <template #item.total="{ item: detailItem }">{{ new
                                    Intl.NumberFormat('id-ID').format(detailItem.total) }}</template>
                            </v-data-table>
                            <div v-else-if="details[item.nomor] && details[item.nomor].length === 0"
                                class="text-center py-4 text-grey">
                                Tidak ada detail untuk penawaran ini
                            </div>
                        </td>
                    </tr>
                </template>
            </v-data-table>
        </v-card>

        <!-- Dialog untuk Close Penawaran -->
        <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
            <v-card>
                <v-card-title>
                    <span class="text-h5">Isi Alasan Close Penawaran</span>
                </v-card-title>
                <v-card-text>
                    <v-textarea v-model="closeReason" label="Alasan" rows="3" variant="outlined" autofocus
                        :rules="[v => !!v || 'Alasan tidak boleh kosong']"></v-textarea>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="isCloseDialogVisible = false">Batal</v-btn>
                    <v-btn color="blue" :loading="isClosing" @click="submitCloseOffer">Simpan</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Dialog Konfirmasi Cetak -->
        <v-dialog v-model="isPrintConfirmVisible" max-width="400px">
            <v-card>
                <v-card-title class="text-h5">Cetak Transaksi?</v-card-title>
                <v-card-text>Apakah Anda ingin mencetak transaksi ini langsung ke printer atau melihat pratinjau
                    terlebih
                    dahulu?</v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="isPrintConfirmVisible = false">Batal</v-btn>
                    <v-btn color="secondary" @click="showPreview">Lihat Preview</v-btn>
                    <v-btn color="primary" @click="generatePdf(true)">Cetak Langsung</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- (8) Tambahkan Dialog Konfirmasi Hapus -->
        <v-dialog v-model="dialogDelete" max-width="500px">
          <v-card>
            <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
            <v-card-text>
              Apakah Anda yakin ingin menghapus penawaran nomor <strong>{{ itemToDelete?.nomor }}</strong>?
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn variant="text" @click="dialogDelete = false">Batal</v-btn>
              <v-btn color="red-darken-1" variant="elevated" @click="deleteConfirmed">Hapus</v-btn>
              <v-spacer></v-spacer>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Dialog Pratinjau -->
        <OfferPrintPreview v-if="isPreviewVisible && printData" :print-data="printData"
            @close="isPreviewVisible = false" @print="generatePdf(true)" />
    </PageLayout>
</template>

<style scoped>
/* Tambahkan style ini untuk warna teks baris */
.v-data-table :deep(tr.text-red td) {
    color: #F44336 !important;
}

.v-data-table :deep(tr.text-blue td) {}
</style>